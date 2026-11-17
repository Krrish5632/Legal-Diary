import type { AuditEvent, CaseRecord, HearingRecord } from './types';
import type { Counts, Repository } from './repository';

export interface CleanExport {
  version: number; cases: CaseRecord[]; hearings: HearingRecord[]; audit: AuditEvent[];
}
export interface ImportOutcome {
  status: 'imported' | 'already-done' | 'failed';
  added: Counts; skipped: Counts; message: string;
}

const zero = (): Counts => ({ cases: 0, hearings: 0, audit: 0 });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function validateExport(d: CleanExport): string[] {
  const p: string[] = [];
  if (!d || d.version !== 1) return ['unknown file version'];
  if (!Array.isArray(d.cases) || !Array.isArray(d.hearings) || !Array.isArray(d.audit))
    return ['cases/hearings/audit missing'];
  const ids = new Set(d.cases.map(c => c.id));
  if (ids.size !== d.cases.length) p.push('duplicate case ids');
  for (const h of d.hearings) {
    if (!ids.has(h.caseId)) { p.push('hearing without case'); break; }
    if (h.id !== `${h.caseId}:${h.hearingDate}`) { p.push('bad hearing id'); break; }
  }
  for (const a of d.audit) if (!ids.has(a.caseId)) { p.push('audit without case'); break; }
  return p;
}

/**
 * Safe import. Never deletes anything. Safe to run twice.
 * beforeImport = safety backup; if it throws, nothing is written.
 */
export async function importCleanExport(
  repo: Repository, data: CleanExport, nowISO: string, beforeImport?: () => Promise<void>,
): Promise<ImportOutcome> {
  const fail = (message: string): ImportOutcome =>
    ({ status: 'failed', added: zero(), skipped: zero(), message });
  try {
    if ((await repo.getMeta('migration_v1')) === 'done')
      return { status: 'already-done', added: zero(), skipped: zero(), message: 'Already imported earlier' };

    const problems = validateExport(data);
    if (problems.length) return fail('Import file is not valid: ' + problems[0]);

    if (beforeImport) {
      try { await beforeImport(); }
      catch (e) { return fail('Safety backup failed, nothing was imported: ' + msg(e)); }
    }

    const before = await repo.counts();
    const haveCases = new Set((await repo.listCases()).map(c => c.id));
    const haveHearings = new Set((await repo.listHearings()).map(h => h.id));
    const haveAudit = new Set((await repo.listAudit()).map(a => a.id));
    const newCases = data.cases.filter(c => !haveCases.has(c.id));
    const newHearings = data.hearings.filter(h => !haveHearings.has(h.id));
    const newAudit = data.audit.filter(a => !haveAudit.has(a.id));

    await repo.commit({ putCases: newCases, putHearings: newHearings, insertAudit: newAudit });

    const after = await repo.counts();
    if (after.cases !== before.cases + newCases.length ||
        after.hearings !== before.hearings + newHearings.length ||
        after.audit !== before.audit + newAudit.length)
      return fail('Count check failed after import. Old data is untouched.');
    for (const c of data.cases)
      if (!(await repo.getCase(c.id))) return fail('A case is missing after import. Old data is untouched.');

    await repo.commit({ setMeta: {
      migration_v1: 'done', migration_v1_at: nowISO, migration_v1_cases: String(data.cases.length),
    } });
    return {
      status: 'imported',
      added: { cases: newCases.length, hearings: newHearings.length, audit: newAudit.length },
      skipped: {
        cases: data.cases.length - newCases.length,
        hearings: data.hearings.length - newHearings.length,
        audit: data.audit.length - newAudit.length,
      },
      message: 'Import verified',
    };
  } catch (e) {
    return fail('Import failed, nothing was changed: ' + msg(e));
  }
}
// end of importer.ts