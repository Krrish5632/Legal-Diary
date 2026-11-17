import { isYMD } from './dates';
import type { YMD } from './dates';
import type { Repository } from './repository';
import type { AuditEvent, CaseRecord, CaseType, HearingRecord, Priority } from './types';

const join = (...p: string[]) => p.map(x => x.trim()).filter(Boolean).join(' | ');
const clean = (s: string | undefined) => (s ?? '').trim();

export function newId(): string {
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  if (g.crypto && typeof g.crypto.randomUUID === 'function') return g.crypto.randomUUID();
  return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function auditEvent(
  caseId: string, nowISO: string, actor: string,
  action: AuditEvent['action'], detail: Record<string, unknown>,
): AuditEvent {
  return { id: `${caseId}:${nowISO}:${action}:${newId().slice(0, 8)}`, caseId, at: nowISO, actor, action, detail };
}

function compact(r: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r ?? {})) {
    const t = clean(v);
    if (t) out[k] = t;
  }
  return out;
}

async function mustGetCase(repo: Repository, id: string): Promise<CaseRecord> {
  const c = await repo.getCase(id);
  if (!c) throw new Error('Case not found');
  return c;
}

export interface HearingText { proceedings?: string; courtOrder?: string; notes?: string }

export interface NewCaseInput {
  caseNumber: string;
  caseYear: string;
  caseType: CaseType;
  court: Record<string, string>;
  parties: Record<string, string>;
  legalSections: Record<string, string>;
  priority: Priority;
  currentProceeding: string;
  notes: string;
  hearingDate: string; // becomes both Initial Hearing Date and the first Next Hearing Date
}

const CASE_TYPES: string[] = ['Civil', 'Criminal', 'Revenue', 'Other'];

/** New case + its first scheduled hearing + audit, in one atomic save. */
export async function createCase(
  repo: Repository, input: NewCaseInput, nowISO: string, actor: string,
): Promise<CaseRecord> {
  const caseNumber = clean(input.caseNumber);
  if (!caseNumber) throw new Error('Case number is required');
  const parties = compact(input.parties);
  if (!parties.plaintiff && !parties.defendant) throw new Error('Enter at least one party name');
  if (!CASE_TYPES.includes(input.caseType)) throw new Error('Choose a case type');
  if (input.priority !== 'High' && input.priority !== 'Normal') throw new Error('Choose a priority');
  const hd = clean(input.hearingDate);
  if (!isYMD(hd)) throw new Error('Choose a valid hearing date');
  const today = nowISO.slice(0, 10);
  if (!isYMD(today)) throw new Error('Clock value is not valid');

  const court = compact(input.court);
  const caseYear = clean(input.caseYear);

  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const key = (n: string, y: string, ct: string) => [n, y, ct].map(norm).join('|');
  const k = key(caseNumber, caseYear, court.name ?? '');
  const existing = await repo.listCases();
  if (existing.some(e => key(e.caseNumber, String(e.caseYear ?? ''), e.court?.name ?? '') === k))
    throw new Error('A case with this number, year and court already exists');

  const id = newId();
  const first = hd as YMD;
  const c: CaseRecord = {
    id, caseNumber, caseYear, caseType: input.caseType, caseTypeOriginal: input.caseType,
    court, parties, legalSections: compact(input.legalSections),
    status: 'Pending', priority: input.priority,
    currentProceeding: clean(input.currentProceeding), notes: clean(input.notes),
    entryDate: today as YMD, entryDateSource: 'app',
    initialHearingDate: first, nextHearingDate: first, lastHearingDate: null, totalHearings: 0,
    createdAt: nowISO, updatedAt: nowISO, legacy: { sourceKey: 'app', raw: null },
  };
  const h: HearingRecord = {
    id: `${id}:${first}`, caseId: id, hearingDate: first, state: 'scheduled',
    proceedings: '', courtOrder: '', notes: '', nextDateFixed: null, source: 'app',
    createdAt: nowISO, updatedAt: nowISO,
  };
  await repo.commit({
    putCases: [c], putHearings: [h],
    insertAudit: [auditEvent(id, nowISO, actor, 'created', { initialHearingDate: first })],
  });
  return c;
}

/** A hearing that really happened earlier. Never overwrites an existing hearing record. */
export async function addPastHearing(
  repo: Repository, caseId: string, dateIn: string, input: HearingText, nowISO: string, actor: string,
): Promise<CaseRecord> {
  const date = clean(dateIn);
  if (!isYMD(date)) throw new Error('Choose a valid date');
  if (date > nowISO.slice(0, 10))
    throw new Error('A past hearing cannot be in the future. Use Update Next Date for future dates');
  const c = await mustGetCase(repo, caseId);
  if (c.nextHearingDate === date)
    throw new Error('This is the next hearing date. Use Update Next Date to close it');
  const hs = await repo.getHearings(caseId);
  if (hs.some(x => x.hearingDate === date))
    throw new Error('A hearing on this date already exists. Records are never overwritten');

  const h: HearingRecord = {
    id: `${caseId}:${date}`, caseId, hearingDate: date as YMD, state: 'completed',
    proceedings: clean(input.proceedings), courtOrder: clean(input.courtOrder), notes: clean(input.notes),
    nextDateFixed: null, source: 'app', createdAt: nowISO, updatedAt: nowISO,
  };
  const done: string[] = [...hs.filter(x => x.state === 'completed').map(x => x.hearingDate as string), date].sort();
  const updated: CaseRecord = {
    ...c, lastHearingDate: done[done.length - 1] as YMD, totalHearings: done.length, updatedAt: nowISO,
  };
  await repo.commit({
    putCases: [updated], putHearings: [h],
    insertAudit: [auditEvent(caseId, nowISO, actor, 'hearing-added', { date })],
  });
  return updated;
}

/** Adds text to the hearing on the next date. Old text is kept; the new text is joined with " | ". */
export async function addToCurrentHearing(
  repo: Repository, caseId: string, input: HearingText, nowISO: string, actor: string,
): Promise<HearingRecord> {
  const add = { proceedings: clean(input.proceedings), courtOrder: clean(input.courtOrder), notes: clean(input.notes) };
  if (!add.proceedings && !add.courtOrder && !add.notes) throw new Error('Write something to add');
  const c = await mustGetCase(repo, caseId);
  const date = c.nextHearingDate;
  if (!date) throw new Error('This case has no next hearing date. Set one first');
  const hs = await repo.getHearings(caseId);
  const found = hs.find(x => x.hearingDate === date);
  const base: HearingRecord = found ?? {
    id: `${caseId}:${date}`, caseId, hearingDate: date, state: 'scheduled',
    proceedings: '', courtOrder: '', notes: '', nextDateFixed: null, source: 'app',
    createdAt: nowISO, updatedAt: nowISO,
  };
  const updated: HearingRecord = {
    ...base,
    proceedings: join(base.proceedings, add.proceedings),
    courtOrder: join(base.courtOrder, add.courtOrder),
    notes: join(base.notes, add.notes),
    updatedAt: nowISO,
  };
  await repo.commit({
    putHearings: [updated],
    insertAudit: [auditEvent(caseId, nowISO, actor, 'edited', { hearingDate: date, added: add })],
  });
  return updated;
}

export async function setPriority(
  repo: Repository, caseId: string, priority: Priority, nowISO: string, actor: string,
): Promise<CaseRecord> {
  if (priority !== 'High' && priority !== 'Normal') throw new Error('Invalid priority');
  const c = await mustGetCase(repo, caseId);
  if (c.priority === priority) throw new Error('Priority is already ' + priority);
  const updated: CaseRecord = { ...c, priority, updatedAt: nowISO };
  await repo.commit({
    putCases: [updated],
    insertAudit: [auditEvent(caseId, nowISO, actor, 'priority-changed', { from: c.priority, to: priority })],
  });
  return updated;
}
// end of actions.ts
