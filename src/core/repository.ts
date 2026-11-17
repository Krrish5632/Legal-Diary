import { rescheduleCase } from './hearing';
import type { RescheduleInput } from './hearing';
import type { YMD } from './dates';
import type { AuditEvent, CaseRecord, HearingRecord } from './types';

export interface Counts { cases: number; hearings: number; audit: number }

/** One atomic change: either everything is written, or nothing. There is no delete. */
export interface Change {
  putCases?: CaseRecord[];
  putHearings?: HearingRecord[];
  insertAudit?: AuditEvent[]; // fails if an id already exists (audit is append-only)
  setMeta?: Record<string, string>;
}

export interface Repository {
  counts(): Promise<Counts>;
  getCase(id: string): Promise<CaseRecord | null>;
  listCases(): Promise<CaseRecord[]>;
  listHearings(): Promise<HearingRecord[]>;
  getHearings(caseId: string): Promise<HearingRecord[]>;
  listAudit(caseId?: string): Promise<AuditEvent[]>;
  getMeta(key: string): Promise<string | null>;
  commit(change: Change): Promise<void>;
}

/** In-memory version: used for tests on the PC. */
export class MemoryRepository implements Repository {
  private cases = new Map<string, CaseRecord>();
  private hearings = new Map<string, HearingRecord>();
  private audit = new Map<string, AuditEvent>();
  private meta = new Map<string, string>();

  async counts(): Promise<Counts> {
    return { cases: this.cases.size, hearings: this.hearings.size, audit: this.audit.size };
  }
  async getCase(id: string) {
    const c = this.cases.get(id);
    return c ? structuredClone(c) : null;
  }
  async listCases() { return [...this.cases.values()].map(c => structuredClone(c)); }
  async listHearings() { return [...this.hearings.values()].map(h => structuredClone(h)); }
  async getHearings(caseId: string) {
    return [...this.hearings.values()]
      .filter(h => h.caseId === caseId)
      .sort((a, b) => a.hearingDate.localeCompare(b.hearingDate))
      .map(h => structuredClone(h));
  }
  async listAudit(caseId?: string) {
    return [...this.audit.values()]
      .filter(a => !caseId || a.caseId === caseId)
      .map(a => structuredClone(a))
      .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }
  async getMeta(key: string) { return this.meta.get(key) ?? null; }

  async commit(ch: Change): Promise<void> {
    // work on copies; replace the real data only if everything succeeds
    const cases = new Map(this.cases);
    const hearings = new Map(this.hearings);
    const audit = new Map(this.audit);
    const meta = new Map(this.meta);

    for (const c of ch.putCases ?? []) cases.set(c.id, structuredClone(c));
    for (const h of ch.putHearings ?? []) {
      if (h.id !== `${h.caseId}:${h.hearingDate}`) throw new Error('Bad hearing id');
      if (!cases.has(h.caseId)) throw new Error('Hearing refers to a missing case');
      const old = hearings.get(h.id);
      if (old && old.state === 'completed' && h.state === 'scheduled')
        throw new Error('A completed hearing cannot become scheduled again');
      hearings.set(h.id, structuredClone(h));
    }
    for (const a of ch.insertAudit ?? []) {
      if (audit.has(a.id)) throw new Error('Audit entry already exists: ' + a.id);
      audit.set(a.id, structuredClone(a));
    }
    for (const [k, v] of Object.entries(ch.setMeta ?? {})) meta.set(k, v);

    this.cases = cases; this.hearings = hearings; this.audit = audit; this.meta = meta;
  }
}

/** Move a case to a new date. Old date stays as history. Saved in one atomic commit. */
export async function rescheduleInRepo(
  repo: Repository, caseId: string, newDate: YMD,
  input: RescheduleInput, nowISO: string, actor: string,
): Promise<CaseRecord> {
  const c = await repo.getCase(caseId);
  if (!c) throw new Error('Case not found');
  const existing = await repo.getHearings(caseId);
  const r = rescheduleCase(c, existing, newDate, input, nowISO, actor);
  await repo.commit({ putCases: [r.case], putHearings: r.upserts, insertAudit: r.audit });
  return r.case;
}
// end of repository.ts
