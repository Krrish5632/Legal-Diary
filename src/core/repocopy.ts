import type { Repository } from './repository';

export interface CopyResult {
  status: 'copied' | 'already-done' | 'failed';
  addedCases: number;
  addedHearings: number;
  addedAudit: number;
  addedMeta: number;
  message: string;
}

function canon(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter(k => o[k] !== undefined).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}';
  }
  const s = JSON.stringify(v);
  return s === undefined ? 'null' : s;
}

/**
 * Copies from one database into another. It only ADDS what is missing.
 * It never changes the source and never overwrites anything in the target.
 * After the copy it reads everything back and compares.
 */
export async function copyRepository(
  src: Repository, dst: Repository, metaKeys: string[],
): Promise<CopyResult> {
  const fail = (message: string): CopyResult =>
    ({ status: 'failed', addedCases: 0, addedHearings: 0, addedAudit: 0, addedMeta: 0, message });
  try {
    const sCases = await src.listCases();
    const sHearings = await src.listHearings();
    const sAudit = await src.listAudit();

    const dCaseIds = new Set((await dst.listCases()).map(c => c.id));
    const dHearingIds = new Set((await dst.listHearings()).map(h => h.id));
    const dAuditIds = new Set((await dst.listAudit()).map(a => a.id));

    const newCases = sCases.filter(c => !dCaseIds.has(c.id));
    const newHearings = sHearings.filter(h => !dHearingIds.has(h.id));
    const newAudit = sAudit.filter(a => !dAuditIds.has(a.id));

    const newMeta: Record<string, string> = {};
    for (const k of metaKeys) {
      const v = await src.getMeta(k);
      if (v !== null && (await dst.getMeta(k)) === null) newMeta[k] = v;
    }
    const nMeta = Object.keys(newMeta).length;

    if (newCases.length === 0 && newHearings.length === 0 && newAudit.length === 0 && nMeta === 0) {
      return {
        status: 'already-done', addedCases: 0, addedHearings: 0, addedAudit: 0, addedMeta: 0,
        message: 'Nothing to copy: everything is already in the new database.',
      };
    }

    const before = await dst.counts();
    await dst.commit({
      putCases: newCases, putHearings: newHearings, insertAudit: newAudit, setMeta: newMeta,
    });

    // check what was written
    const after = await dst.counts();
    if (after.cases !== before.cases + newCases.length
      || after.hearings !== before.hearings + newHearings.length
      || after.audit !== before.audit + newAudit.length) {
      return fail('Copy finished but the counts do not match. The old database was not changed.');
    }
    const backCases = new Map((await dst.listCases()).map(c => [c.id, c]));
    for (const c of newCases) {
      const b = backCases.get(c.id);
      if (!b || canon(b) !== canon(c)) return fail('Copy check failed for a case. The old database was not changed.');
    }
    const backHearings = new Map((await dst.listHearings()).map(h => [h.id, h]));
    for (const h of newHearings) {
      const b = backHearings.get(h.id);
      if (!b || canon(b) !== canon(h)) return fail('Copy check failed for a hearing. The old database was not changed.');
    }
    const backAudit = new Map((await dst.listAudit()).map(a => [a.id, a]));
    for (const a of newAudit) {
      const b = backAudit.get(a.id);
      if (!b || canon(b) !== canon(a)) return fail('Copy check failed for an audit entry. The old database was not changed.');
    }
    for (const [k, v] of Object.entries(newMeta)) {
      if ((await dst.getMeta(k)) !== v) return fail('Copy check failed for a saved setting. The old database was not changed.');
    }

    return {
      status: 'copied',
      addedCases: newCases.length, addedHearings: newHearings.length,
      addedAudit: newAudit.length, addedMeta: nMeta,
      message: 'Copied and checked.',
    };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return fail('Copy failed: ' + m + '. The old database was not changed.');
  }
}
// end of repocopy.ts
