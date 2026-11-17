import { YMD, isYMD, normalizeLegacyDate, toYMDInIST } from './dates';
import type { AuditEvent, CaseRecord, CaseStatus, CaseType, HearingRecord } from './types';

const str = (v: unknown): string => (v == null ? '' : typeof v === 'string' ? v : String(v));
const obj = (v: unknown): Record<string, any> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {};
const strMap = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(obj(v))) {
    out[k] = Array.isArray(val) ? val.map(str).join(', ') : str(val);
  }
  return out;
};
const join = (...p: string[]) => p.map(x => x.trim()).filter(Boolean).join(' | ');

export function normalizeCaseType(v: unknown): { type: CaseType; original: string } {
  const original = str(v);
  const k = original.trim().toLowerCase();
  const type: CaseType = k === 'civil' ? 'Civil' : k === 'criminal' ? 'Criminal' : k === 'revenue' ? 'Revenue' : 'Other';
  return { type, original };
}

export interface MigrationReport {
  casesIn: number; casesOut: number; hearingsOut: number;
  historyEntriesIn: number; historyUnparsed: number; historyMergedSameDate: number;
  nextDateMissing: number; nextDateInvalid: number; nextDateAlreadyInHistory: number;
  statusDefaulted: number; caseTypeNormalized: number; entryDateUnknown: number;
  documentsItems: number; voiceNoteItems: number;
}
export interface MigrationResult {
  cases: CaseRecord[]; hearings: HearingRecord[]; audit: AuditEvent[]; report: MigrationReport;
}

export function migrateLegacy(rawCases: unknown[], nowISO: string, sourceKey = 'legal_diary_cases_0'): MigrationResult {
  const r: MigrationReport = {
    casesIn: rawCases.length, casesOut: 0, hearingsOut: 0, historyEntriesIn: 0, historyUnparsed: 0,
    historyMergedSameDate: 0, nextDateMissing: 0, nextDateInvalid: 0, nextDateAlreadyInHistory: 0,
    statusDefaulted: 0, caseTypeNormalized: 0, entryDateUnknown: 0, documentsItems: 0, voiceNoteItems: 0,
  };
  const cases: CaseRecord[] = [], hearings: HearingRecord[] = [], audit: AuditEvent[] = [];
  const seen = new Set<string>();

  for (const raw of rawCases) {
    const c = obj(raw);
    const id = str(c.id).trim();
    if (!id) throw new Error('Migration stopped: a case has no id. Nothing was changed.');
    if (seen.has(id)) throw new Error('Migration stopped: duplicate case id found. Nothing was changed.');
    seen.add(id);

    const ct = normalizeCaseType(c.caseType);
    if (ct.original !== ct.type) r.caseTypeNormalized++;

    let status = str(c.status) as CaseStatus;
    if (!['Pending', 'Urgent', 'Disposed'].includes(status)) { status = 'Pending'; r.statusDefaulted++; }

    const created = str(c.createdAt);
    const createdValid = created && !isNaN(new Date(created).getTime());
    const entryDate = createdValid ? toYMDInIST(new Date(created)) : null;
    if (!entryDate) r.entryDateUnknown++;

    // ---- hearings from legacy history (completed) ----
    const byDate = new Map<YMD, HearingRecord>();
    const hist = Array.isArray(c.history) ? c.history : [];
    for (const h of hist) {
      r.historyEntriesIn++;
      const e = obj(h);
      const d = normalizeLegacyDate(e.date);
      if (!d) { r.historyUnparsed++; continue; } // stays inside legacy.raw, never invented
      const orders = Array.isArray(e.orders) ? e.orders.map(str).join('; ') : '';
      const ex = byDate.get(d);
      if (ex) {
        ex.proceedings = join(ex.proceedings, str(e.proceeding));
        ex.notes = join(ex.notes, str(e.notes));
        ex.courtOrder = join(ex.courtOrder, orders);
        r.historyMergedSameDate++;
        continue;
      }
      byDate.set(d, {
        id: `${id}:${d}`, caseId: id, hearingDate: d, state: 'completed',
        proceedings: str(e.proceeding), courtOrder: orders, notes: str(e.notes),
        nextDateFixed: normalizeLegacyDate(e.nextDate), source: 'legacy-history',
        createdAt: nowISO, updatedAt: nowISO,
      });
    }

    // ---- next date -> scheduled hearing ----
    const ndRaw = str(c.nextDate).trim();
    const nd = normalizeLegacyDate(ndRaw);
    if (!ndRaw) r.nextDateMissing++;
    else if (!nd) r.nextDateInvalid++;
    if (nd) {
      if (byDate.has(nd)) r.nextDateAlreadyInHistory++;
      else byDate.set(nd, {
        id: `${id}:${nd}`, caseId: id, hearingDate: nd, state: 'scheduled',
        proceedings: '', courtOrder: '', notes: '', nextDateFixed: null,
        source: 'legacy-nextDate', createdAt: nowISO, updatedAt: nowISO,
      });
    }

    const mine = [...byDate.values()].sort((a, b) => a.hearingDate.localeCompare(b.hearingDate));
    const done = mine.filter(h => h.state === 'completed');
    hearings.push(...mine);

    r.documentsItems += Array.isArray(c.documents) ? c.documents.length : 0;
    r.voiceNoteItems += Array.isArray(c.voiceNotes) ? c.voiceNotes.length : 0;

    cases.push({
      id, caseNumber: str(c.caseNumber), caseYear: str(c.filingYear),
      caseType: ct.type, caseTypeOriginal: ct.original,
      court: strMap(c.court), parties: strMap(c.parties), legalSections: strMap(c.legalSections),
      status, priority: c.priority === true ? 'High' : 'Normal',
      currentProceeding: str(c.currentProceeding), notes: str(c.notes),
      entryDate, entryDateSource: entryDate ? 'legacy-createdAt' : 'unknown',
      initialHearingDate: null, nextHearingDate: nd,
      lastHearingDate: done.length ? done[done.length - 1].hearingDate : null,
      totalHearings: done.length,
      createdAt: createdValid ? created : null, updatedAt: str(c.updatedAt) || null,
      legacy: { sourceKey, raw },
    });
    audit.push({ id: `${id}:migrated`, caseId: id, at: nowISO, actor: 'migration', action: 'migrated', detail: { from: sourceKey } });
  }

  r.casesOut = cases.length;
  r.hearingsOut = hearings.length;
  return { cases, hearings, audit, report: r };
}

/** Empty list = all good. Anything else = do NOT commit the migration. */
export function verifyMigration(res: MigrationResult): string[] {
  const p: string[] = [];
  const r = res.report;
  if (r.casesIn !== r.casesOut) p.push(`Case count mismatch: ${r.casesIn} in, ${r.casesOut} out`);
  const completed = res.hearings.filter(h => h.source === 'legacy-history').length;
  if (r.historyEntriesIn !== completed + r.historyMergedSameDate + r.historyUnparsed)
    p.push('History entries do not add up');
  const ids = new Set(res.hearings.map(h => h.id));
  if (ids.size !== res.hearings.length) p.push('Duplicate hearing ids');
  for (const c of res.cases) if (c.nextHearingDate && !isYMD(c.nextHearingDate)) p.push('Bad next date in a case');
  return p;
}