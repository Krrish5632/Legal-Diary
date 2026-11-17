import type { Repository } from './repository';
import type { AuditEvent, CaseRecord, HearingRecord } from './types';
import { isYMD } from './dates';
import { loadClients } from './clients';
import type { Client } from './clients';

export const BACKUP_FORMAT = 'legal-diary-pro-backup';
export const BACKUP_VERSION = 1;
const CLIENTS_KEY = 'clients_v1';
const PREFS_KEY = 'reminder_prefs_v1';
export const BACKUP_META_KEYS = [CLIENTS_KEY, PREFS_KEY];

export interface BackupData {
  cases: CaseRecord[];
  hearings: HearingRecord[];
  audit: AuditEvent[];
  meta: Record<string, string>;
}

export interface BackupFile {
  format: string;
  version: number;
  createdAt: string;
  counts: { cases: number; hearings: number; audit: number };
  checksum: string;
  data: BackupData;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const norm = (s: string): string => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Read everything and wrap it in a backup with a checksum. Changes nothing. */
export async function createBackup(repo: Repository, nowISO: string): Promise<BackupFile> {
  const cases = await repo.listCases();
  const hearings = await repo.listHearings();
  const audit = await repo.listAudit();
  const meta: Record<string, string> = {};
  for (const k of BACKUP_META_KEYS) {
    const v = await repo.getMeta(k);
    if (v !== null) meta[k] = v;
  }
  const data: BackupData = { cases, hearings, audit, meta };
  const checksum = await sha256Hex(JSON.stringify(data));
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: nowISO,
    counts: { cases: cases.length, hearings: hearings.length, audit: audit.length },
    checksum, data,
  };
}

export const serializeBackup = (b: BackupFile): string => JSON.stringify(b);

export function backupFileName(nowISO: string): string {
  return 'legal-diary-backup-' + nowISO.slice(0, 10) + '-' + nowISO.slice(11, 16).replace(':', '') + '.json';
}

/** Reads and fully checks a backup file. Throws a plain message if anything is wrong. */
export async function parseBackup(text: string): Promise<BackupFile> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file cannot be read. It is not a valid backup file.');
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) throw new Error('This is not a Legal Diary Pro backup file.');
  if (typeof raw.version !== 'number' || raw.version < 1 || raw.version > BACKUP_VERSION) {
    throw new Error('This backup was made by a different version of the app (version ' + String(raw.version) + '). Update the app first.');
  }
  const d = raw.data;
  if (!isObj(d) || !Array.isArray(d.cases) || !Array.isArray(d.hearings) || !Array.isArray(d.audit) || !isObj(d.meta)) {
    throw new Error('The backup file is incomplete.');
  }
  const sum = await sha256Hex(JSON.stringify(d));
  if (sum !== raw.checksum) {
    throw new Error('This backup file is damaged or was changed (check failed). Nothing was restored.');
  }
  const counts = raw.counts;
  if (!isObj(counts) || counts.cases !== d.cases.length || counts.hearings !== d.hearings.length || counts.audit !== d.audit.length) {
    throw new Error('The backup file is incomplete (counts do not match).');
  }

  const caseIds = new Set<string>();
  for (const c of d.cases as unknown[]) {
    if (!isObj(c)) throw new Error('A case record in the backup is malformed.');
    const id = c.id;
    if (typeof id !== 'string' || !id) throw new Error('A case record in the backup has no id.');
    if (!isObj(c.parties) || !isObj(c.court)) throw new Error('A case record in the backup is malformed.');
    if (caseIds.has(id)) throw new Error('The backup has the same case twice.');
    caseIds.add(id);
  }
  for (const h of d.hearings as unknown[]) {
    if (!isObj(h)) throw new Error('A hearing record in the backup is malformed.');
    const cid = h.caseId;
    const hd = h.hearingDate;
    if (typeof cid !== 'string' || !isYMD(hd)) throw new Error('A hearing record in the backup is malformed.');
    if (h.id !== cid + ':' + hd) throw new Error('A hearing record in the backup has a wrong id.');
    if (h.state !== 'scheduled' && h.state !== 'completed') throw new Error('A hearing record in the backup has a wrong state.');
    if (!caseIds.has(cid)) throw new Error('A hearing in the backup belongs to a missing case.');
  }
  for (const a of d.audit as unknown[]) {
    if (!isObj(a) || typeof a.id !== 'string' || typeof a.caseId !== 'string') {
      throw new Error('An activity record in the backup is malformed.');
    }
  }
  for (const v of Object.values(d.meta)) {
    if (typeof v !== 'string') throw new Error('The backup settings part is malformed.');
  }
  return raw as unknown as BackupFile;
}

interface Plan {
  newCases: CaseRecord[];
  newHearings: HearingRecord[];
  newAudit: AuditEvent[];
  skippedCases: number;
  newClients: number;
  clientsJson: string | null;
  prefsJson: string | null;
}

async function planMerge(repo: Repository, b: BackupFile): Promise<Plan> {
  const haveCases = new Set((await repo.listCases()).map(c => c.id));
  const haveAudit = new Set((await repo.listAudit()).map(a => a.id));
  const newCases = b.data.cases.filter(c => !haveCases.has(c.id));
  const fresh = new Set(newCases.map(c => c.id));
  const newHearings = b.data.hearings.filter(h => fresh.has(h.caseId));
  const newAudit = b.data.audit.filter(a => fresh.has(a.caseId) && !haveAudit.has(a.id));

  let clientsJson: string | null = null;
  let newClients = 0;
  const rawClients = b.data.meta[CLIENTS_KEY];
  if (rawClients !== undefined) {
    let incoming: unknown = null;
    try { incoming = JSON.parse(rawClients); } catch { incoming = null; }
    if (Array.isArray(incoming)) {
      const local = await loadClients(repo); // throws if the local list is damaged: nothing is overwritten
      const ids = new Set(local.map(c => c.id));
      const names = new Set(local.map(c => norm(c.name)));
      const add: Client[] = [];
      for (const c of incoming as Client[]) {
        if (!c || typeof c.id !== 'string' || typeof c.name !== 'string') continue;
        if (ids.has(c.id) || names.has(norm(c.name))) continue;
        ids.add(c.id);
        names.add(norm(c.name));
        add.push(c);
      }
      if (add.length > 0) {
        clientsJson = JSON.stringify([...local, ...add]);
        newClients = add.length;
      }
    }
  }

  let prefsJson: string | null = null;
  const rawPrefs = b.data.meta[PREFS_KEY];
  if (rawPrefs !== undefined && (await repo.getMeta(PREFS_KEY)) === null) prefsJson = rawPrefs;

  return {
    newCases, newHearings, newAudit,
    skippedCases: b.data.cases.length - newCases.length,
    newClients, clientsJson, prefsJson,
  };
}

export interface RestorePreview {
  madeAt: string;
  backupCases: number;
  backupHearings: number;
  newCases: number;
  newHearings: number;
  newAudit: number;
  alreadyHere: number;
  newClients: number;
}

export async function previewRestore(repo: Repository, b: BackupFile): Promise<RestorePreview> {
  const p = await planMerge(repo, b);
  return {
    madeAt: b.createdAt,
    backupCases: b.data.cases.length,
    backupHearings: b.data.hearings.length,
    newCases: p.newCases.length,
    newHearings: p.newHearings.length,
    newAudit: p.newAudit.length,
    alreadyHere: p.skippedCases,
    newClients: p.newClients,
  };
}

export interface RestoreResult {
  addedCases: number;
  addedHearings: number;
  addedAudit: number;
  skippedCases: number;
  addedClients: number;
}

/**
 * Adds what is missing. Cases that already exist on this device are not touched at all
 * (not the case, not its hearings). One atomic save, then a count check.
 */
export async function restoreMerge(repo: Repository, b: BackupFile, nowISO: string): Promise<RestoreResult> {
  const before = await repo.counts();
  const p = await planMerge(repo, b);
  const meta: Record<string, string> = {};
  if (p.clientsJson !== null) meta[CLIENTS_KEY] = p.clientsJson;
  if (p.prefsJson !== null) meta[PREFS_KEY] = p.prefsJson;

  const result: RestoreResult = {
    addedCases: p.newCases.length,
    addedHearings: p.newHearings.length,
    addedAudit: p.newAudit.length,
    skippedCases: p.skippedCases,
    addedClients: p.newClients,
  };
  const changed = p.newCases.length > 0 || p.newHearings.length > 0 || p.newAudit.length > 0 || Object.keys(meta).length > 0;
  if (!changed) return result;

  meta['last_restore_at'] = nowISO;
  await repo.commit({ putCases: p.newCases, putHearings: p.newHearings, insertAudit: p.newAudit, setMeta: meta });

  const after = await repo.counts();
  if (
    after.cases !== before.cases + p.newCases.length ||
    after.hearings !== before.hearings + p.newHearings.length ||
    after.audit !== before.audit + p.newAudit.length
  ) {
    throw new Error('Restore check failed: the saved counts do not match. Your earlier data was not changed.');
  }
  for (const c of p.newCases) {
    const s = await repo.getCase(c.id);
    if (!s || s.caseNumber !== c.caseNumber || s.nextHearingDate !== c.nextHearingDate) {
      throw new Error('Restore check failed for a case. Your earlier data was not changed.');
    }
  }
  return result;
}
// end of backup.ts
