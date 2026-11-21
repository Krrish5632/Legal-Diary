import type { Repository } from './repository';
import type { BackupFile } from './backup';
import { restoreMerge } from './backup';
import type { AuditEvent, CaseRecord, HearingRecord } from './types';

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

export interface ReplacePreview {
  addedCases: number;        // in the backup, not on this device: will be added
  replacedCases: number;     // on both, different: will become the backup version
  unchangedCases: number;    // on both, identical
  keptNewerCases: number;    // this device has newer history: left exactly as it is
  keptOnlyHere: number;      // only on this device: kept
  addedHearings: number;
  replacedHearings: number;
}

export interface ReplaceResult extends ReplacePreview {
  addedAudit: number;
  addedClients: number;
}

interface Plan extends ReplacePreview {
  putCases: CaseRecord[];
  putHearings: HearingRecord[];
  putAudit: AuditEvent[];
}

async function makePlan(repo: Repository, b: BackupFile): Promise<Plan> {
  const localCases = new Map<string, CaseRecord>((await repo.listCases()).map(c => [c.id, c]));
  const localHearings = new Map<string, HearingRecord>((await repo.listHearings()).map(h => [h.id, h]));
  const localAudit = new Set((await repo.listAudit()).map(a => a.id));
  const backupCaseIds = new Set(b.data.cases.map(c => c.id));
  const backupHearingIds = new Set(b.data.hearings.map(h => h.id));

  // Cases where this device is ahead of the backup are never touched.
  const newer = new Set<string>();
  for (const h of b.data.hearings) {
    const lh = localHearings.get(h.id);
    if (lh && lh.state === 'completed' && h.state === 'scheduled') newer.add(h.caseId);
  }
  for (const lh of localHearings.values()) {
    if (backupCaseIds.has(lh.caseId) && !backupHearingIds.has(lh.id)) newer.add(lh.caseId);
  }

  const p: Plan = {
    addedCases: 0, replacedCases: 0, unchangedCases: 0, keptNewerCases: 0, keptOnlyHere: 0,
    addedHearings: 0, replacedHearings: 0,
    putCases: [], putHearings: [], putAudit: [],
  };
  for (const c of b.data.cases) {
    if (newer.has(c.id)) { p.keptNewerCases += 1; continue; }
    const lc = localCases.get(c.id);
    if (!lc) { p.addedCases += 1; p.putCases.push(c); }
    else if (canon(lc) !== canon(c)) { p.replacedCases += 1; p.putCases.push(c); }
    else p.unchangedCases += 1;
  }
  for (const h of b.data.hearings) {
    if (newer.has(h.caseId)) continue;
    const lh = localHearings.get(h.id);
    if (!lh) { p.addedHearings += 1; p.putHearings.push(h); }
    else if (canon(lh) !== canon(h)) { p.replacedHearings += 1; p.putHearings.push(h); }
  }
  for (const a of b.data.audit) {
    if (newer.has(a.caseId)) continue;
    if (!localAudit.has(a.id)) p.putAudit.push(a);
  }
  for (const id of localCases.keys()) if (!backupCaseIds.has(id)) p.keptOnlyHere += 1;
  return p;
}

/** Shows what Replace would do. Changes nothing. */
export async function previewReplace(repo: Repository, b: BackupFile): Promise<ReplacePreview> {
  const p = await makePlan(repo, b);
  return {
    addedCases: p.addedCases, replacedCases: p.replacedCases, unchangedCases: p.unchangedCases,
    keptNewerCases: p.keptNewerCases, keptOnlyHere: p.keptOnlyHere,
    addedHearings: p.addedHearings, replacedHearings: p.replacedHearings,
  };
}

/**
 * Makes the cases in the backup match the backup. Nothing is ever deleted:
 * cases only on this device stay, hearing and activity records are only added or replaced,
 * and a case where this device has newer history is left alone.
 * One atomic save, then everything is read back and compared.
 */
export async function replaceFromBackup(
  repo: Repository, b: BackupFile, nowISO: string,
): Promise<ReplaceResult> {
  const before = await repo.counts();
  const p = await makePlan(repo, b);
  const changed = p.putCases.length > 0 || p.putHearings.length > 0 || p.putAudit.length > 0;
  if (changed) {
    await repo.commit({
      putCases: p.putCases, putHearings: p.putHearings, insertAudit: p.putAudit,
      setMeta: { last_replace_at: nowISO },
    });
    const after = await repo.counts();
    if (
      after.cases !== before.cases + p.addedCases ||
      after.hearings !== before.hearings + p.addedHearings ||
      after.audit !== before.audit + p.putAudit.length
    ) {
      throw new Error('Replace check failed: the saved counts do not match. Use the safety backup that was saved first.');
    }
    const backCases = new Map<string, CaseRecord>((await repo.listCases()).map(c => [c.id, c]));
    for (const c of p.putCases) {
      const s = backCases.get(c.id);
      if (!s || canon(s) !== canon(c)) {
        throw new Error('Replace check failed for a case. Use the safety backup that was saved first.');
      }
    }
    const backHearings = new Map<string, HearingRecord>((await repo.listHearings()).map(h => [h.id, h]));
    for (const h of p.putHearings) {
      const s = backHearings.get(h.id);
      if (!s || canon(s) !== canon(h)) {
        throw new Error('Replace check failed for a hearing. Use the safety backup that was saved first.');
      }
    }
  }
  // clients and reminder settings: add what is missing (cases are already in place)
  const m = await restoreMerge(repo, b, nowISO);
  return {
    addedCases: p.addedCases, replacedCases: p.replacedCases, unchangedCases: p.unchangedCases,
    keptNewerCases: p.keptNewerCases, keptOnlyHere: p.keptOnlyHere,
    addedHearings: p.addedHearings, replacedHearings: p.replacedHearings,
    addedAudit: p.putAudit.length, addedClients: m.addedClients,
  };
}
// end of restorereplace.ts
