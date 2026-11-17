import type { AuditEvent, CaseRecord, CaseStatus, CaseType, HearingRecord } from './types';
import type { Repository } from './repository';

const TYPES: CaseType[] = ['Civil', 'Criminal', 'Revenue', 'Other'];
const STATUSES: CaseStatus[] = ['Pending', 'Urgent', 'Disposed'];

let seq = 0;
function eventId(): string {
  seq += 1;
  return 'e_' + Date.now().toString(36) + '_' + seq.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function editEvent(caseId: string, nowISO: string, actor: string, detail: Record<string, unknown>): AuditEvent {
  return { id: eventId(), caseId, at: nowISO, actor, action: 'edited', detail };
}

const clean = (s: string): string => String(s ?? '').trim();
const norm = (s: string): string => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const caseKey = (num: string, year: string, courtName: string): string =>
  norm(num) + '|' + norm(year) + '|' + norm(courtName);

function cleanRecord(r: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) out[k] = clean(v);
  return out;
}

interface FieldChange { field: string; from: string; to: string }

function diffRecord(group: string, before: Record<string, string>, after: Record<string, string>, out: FieldChange[]): void {
  for (const [k, v] of Object.entries(after)) {
    const old = String(before[k] ?? '');
    if (old !== v) out.push({ field: group + '.' + k, from: old, to: v });
  }
}

/**
 * Change the status. Disposed closes the scheduled hearing (kept as history)
 * and removes the next date. Reopening keeps all history; set a new date afterwards.
 */
export async function setStatus(
  repo: Repository, caseId: string, to: CaseStatus, nowISO: string, actor: string, remark = '',
): Promise<CaseRecord> {
  const c = await repo.getCase(caseId);
  if (!c) throw new Error('Case not found');
  if (!STATUSES.includes(to)) throw new Error('Invalid status');
  if (c.status === to) throw new Error('Status is already ' + to);

  const next: CaseRecord = { ...c, status: to, updatedAt: nowISO };
  const puts: HearingRecord[] = [];
  let closedDate: string | null = null;

  if (to === 'Disposed') {
    if (c.nextHearingDate) {
      const hs = await repo.getHearings(caseId);
      const h = hs.find(x => x.hearingDate === c.nextHearingDate);
      if (h && h.state === 'scheduled') {
        const note = 'Case disposed' + (clean(remark) ? ': ' + clean(remark) : '');
        puts.push({
          ...h, state: 'completed', notes: h.notes ? h.notes + ' | ' + note : note,
          nextDateFixed: null, updatedAt: nowISO,
        });
        next.lastHearingDate = h.hearingDate;
        next.totalHearings = c.totalHearings + 1;
        closedDate = h.hearingDate;
      }
    }
    next.nextHearingDate = null;
  }

  await repo.commit({
    putCases: [next],
    putHearings: puts,
    insertAudit: [editEvent(caseId, nowISO, actor, {
      field: 'status', from: c.status, to, remark: clean(remark), closedHearing: closedDate,
    })],
  });
  return next;
}

export interface EditInput {
  caseNumber: string;
  caseYear: string;
  caseType: CaseType;
  currentProceeding: string;
  court: Record<string, string>;
  parties: Record<string, string>;
  legalSections: Record<string, string>;
}

/** Edit the details of a case. Dates and Entry Date cannot be changed here. */
export async function updateCaseDetails(
  repo: Repository, caseId: string, input: EditInput, nowISO: string, actor: string,
): Promise<CaseRecord> {
  const c = await repo.getCase(caseId);
  if (!c) throw new Error('Case not found');
  const caseNumber = clean(input.caseNumber);
  if (!caseNumber) throw new Error('Case number is required');
  if (!TYPES.includes(input.caseType)) throw new Error('Choose a valid case type');
  const caseYear = clean(input.caseYear);
  const court = { ...c.court, ...cleanRecord(input.court) };
  const parties = { ...c.parties, ...cleanRecord(input.parties) };
  const legalSections = { ...c.legalSections, ...cleanRecord(input.legalSections) };
  if (!clean(parties.plaintiff ?? '') && !clean(parties.defendant ?? '')) {
    throw new Error('Enter at least one party name');
  }

  const oldKey = caseKey(c.caseNumber, c.caseYear, c.court.name ?? '');
  const newKey = caseKey(caseNumber, caseYear, court.name ?? '');
  if (oldKey !== newKey) {
    const all = await repo.listCases();
    if (all.some(o => o.id !== c.id && caseKey(o.caseNumber, o.caseYear, o.court.name ?? '') === newKey)) {
      throw new Error('Another case already has this case number, year and court');
    }
  }

  const changes: FieldChange[] = [];
  if (c.caseNumber !== caseNumber) changes.push({ field: 'caseNumber', from: c.caseNumber, to: caseNumber });
  if (c.caseYear !== caseYear) changes.push({ field: 'caseYear', from: c.caseYear, to: caseYear });
  if (c.caseType !== input.caseType) changes.push({ field: 'caseType', from: c.caseType, to: input.caseType });
  const proceeding = clean(input.currentProceeding);
  if (c.currentProceeding !== proceeding) {
    changes.push({ field: 'currentProceeding', from: c.currentProceeding, to: proceeding });
  }
  diffRecord('court', c.court, court, changes);
  diffRecord('parties', c.parties, parties, changes);
  diffRecord('legalSections', c.legalSections, legalSections, changes);
  if (changes.length === 0) throw new Error('Nothing was changed');

  const next: CaseRecord = {
    ...c, caseNumber, caseYear, caseType: input.caseType, currentProceeding: proceeding,
    court, parties, legalSections, updatedAt: nowISO,
  };
  await repo.commit({
    putCases: [next],
    insertAudit: [editEvent(caseId, nowISO, actor, { changes })],
  });
  return next;
}

/** Add a dated note to the case. Old notes are never changed. */
export async function addCaseNote(
  repo: Repository, caseId: string, text: string, nowISO: string, actor: string,
): Promise<CaseRecord> {
  const t = clean(text);
  if (!t) throw new Error('Please write the note first');
  const c = await repo.getCase(caseId);
  if (!c) throw new Error('Case not found');
  const line = '[' + nowISO.slice(0, 10) + '] ' + t;
  const next: CaseRecord = { ...c, notes: c.notes ? c.notes + '\n\n' + line : line, updatedAt: nowISO };
  await repo.commit({
    putCases: [next],
    insertAudit: [editEvent(caseId, nowISO, actor, { field: 'notes', added: t })],
  });
  return next;
}
// end of caseedit.ts
