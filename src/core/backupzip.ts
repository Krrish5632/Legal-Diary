import type { Repository } from './repository';
import type { BackupFile, RestorePreview, RestoreResult } from './backup';
import { createBackup, parseBackup, previewRestore, restoreMerge, serializeBackup } from './backup';
import { DOCS_KEY, activeDocs, loadDocs, parseDocs, sha256Bytes } from './documents';
import type { DocMeta, FileStore } from './documents';
import { unzipStore, zipStore } from './zip';
import type { ZipEntry } from './zip';

export const DOCS_FORMAT = 'legal-diary-pro-documents';
const enc = new TextEncoder();
const dec = new TextDecoder();
const DOC_ID_OK = /^doc-[A-Za-z0-9-]{1,80}$/;

export interface SkippedDoc {
  name: string;
  reason: string;
}

export interface ZipBackupResult {
  zip: Uint8Array;
  counts: { cases: number; hearings: number; audit: number; documents: number };
  skipped: SkippedDoc[];
}

/** Cases, hearings, clients and documents (with their files) in one zip. Changes nothing on the device. */
export async function createZipBackup(repo: Repository, files: FileStore, nowISO: string): Promise<ZipBackupResult> {
  const b = await createBackup(repo, nowISO);
  const all = await loadDocs(repo);
  const included: DocMeta[] = [];
  const skipped: SkippedDoc[] = [];
  const fileEntries: ZipEntry[] = [];
  for (const d of activeDocs(all)) {
    const bytes = await files.get(d.id);
    if (!bytes) {
      skipped.push({ name: d.name, reason: 'the file is missing on this device' });
      continue;
    }
    if (bytes.length !== d.size || (await sha256Bytes(bytes)) !== d.sha256) {
      skipped.push({ name: d.name, reason: 'the file on this device is damaged' });
      continue;
    }
    included.push(d);
    fileEntries.push({ name: 'files/' + d.id, data: bytes });
  }
  const payload = {
    format: DOCS_FORMAT,
    version: 1,
    checksum: await sha256Bytes(enc.encode(JSON.stringify(included))),
    docs: included,
  };
  const zip = zipStore([
    { name: 'backup.json', data: enc.encode(serializeBackup(b)) },
    { name: 'documents.json', data: enc.encode(JSON.stringify(payload)) },
    ...fileEntries,
  ]);
  return {
    zip,
    counts: { cases: b.counts.cases, hearings: b.counts.hearings, audit: b.counts.audit, documents: included.length },
    skipped,
  };
}

export interface ZipBackup {
  backup: BackupFile;
  docs: DocMeta[];
  fileBytes: Map<string, Uint8Array>;
}

/** Reads and fully checks a zip backup. Throws a plain message if anything is wrong. */
export async function parseZipBackup(bytes: Uint8Array): Promise<ZipBackup> {
  const entries = unzipStore(bytes);
  const byName = new Map<string, Uint8Array>(entries.map(e => [e.name, e.data]));

  const bj = byName.get('backup.json');
  if (!bj) throw new Error('This is not a Legal Diary Pro backup (backup.json is missing).');
  const backup = await parseBackup(dec.decode(bj));

  const dj = byName.get('documents.json');
  if (!dj) throw new Error('The backup is incomplete (the documents list is missing).');
  let raw: unknown;
  try {
    raw = JSON.parse(dec.decode(dj));
  } catch {
    throw new Error('The documents list in the backup cannot be read.');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('The documents list in the backup cannot be read.');
  const r = raw as Record<string, unknown>;
  if (r.format !== DOCS_FORMAT || !Array.isArray(r.docs)) throw new Error('The documents list in the backup is not valid.');
  if (r.version !== 1) throw new Error('The documents in this backup were made by a different version of the app. Update the app first.');
  const sum = await sha256Bytes(enc.encode(JSON.stringify(r.docs)));
  if (sum !== r.checksum) {
    throw new Error('The documents list in this backup is damaged or was changed (check failed). Nothing was restored.');
  }
  let docs: DocMeta[];
  try {
    docs = parseDocs(JSON.stringify(r.docs));
  } catch {
    throw new Error('The documents list in the backup is malformed.');
  }

  const caseIds = new Set(backup.data.cases.map(c => c.id));
  const fileBytes = new Map<string, Uint8Array>();
  for (const d of docs) {
    if (!DOC_ID_OK.test(d.id) || d.deletedAt || !caseIds.has(d.caseId)) {
      throw new Error('A document record in the backup is malformed.');
    }
    const data = byName.get('files/' + d.id);
    if (!data) throw new Error('The backup does not contain the file for "' + d.name + '". Nothing was restored.');
    if (data.length !== d.size || (await sha256Bytes(data)) !== d.sha256) {
      throw new Error('The file "' + d.name + '" in the backup is damaged (check failed). Nothing was restored.');
    }
    fileBytes.set(d.id, data);
  }
  return { backup, docs, fileBytes };
}

async function planDocs(repo: Repository, z: ZipBackup): Promise<{ add: DocMeta[]; skipped: number }> {
  const local = await loadDocs(repo); // throws if the local list is damaged: nothing is overwritten
  const ids = new Set(local.map(d => d.id));
  const keys = new Set(activeDocs(local).map(d => d.caseId + ':' + d.sha256));
  const add: DocMeta[] = [];
  for (const d of z.docs) {
    const k = d.caseId + ':' + d.sha256;
    if (ids.has(d.id) || keys.has(k)) continue;
    ids.add(d.id);
    keys.add(k);
    add.push(d);
  }
  return { add, skipped: z.docs.length - add.length };
}

export interface ZipPreview extends RestorePreview {
  backupDocs: number;
  newDocs: number;
  docsAlreadyHere: number;
}

export async function previewZipRestore(repo: Repository, z: ZipBackup): Promise<ZipPreview> {
  const base = await previewRestore(repo, z.backup);
  const plan = await planDocs(repo, z);
  return { ...base, backupDocs: z.docs.length, newDocs: plan.add.length, docsAlreadyHere: plan.skipped };
}

export interface ZipRestoreResult extends RestoreResult {
  addedDocs: number;
  skippedDocs: number;
}

/**
 * Adds missing cases (as in a normal restore) and then missing documents.
 * Documents that were deleted on this device are not brought back.
 */
export async function restoreZip(
  repo: Repository,
  files: FileStore,
  z: ZipBackup,
  nowISO: string,
): Promise<ZipRestoreResult> {
  await planDocs(repo, z); // stop early if the local document list is damaged
  const base = await restoreMerge(repo, z.backup, nowISO);
  const plan = await planDocs(repo, z);
  const written: string[] = [];
  try {
    for (const d of plan.add) {
      const bytes = z.fileBytes.get(d.id);
      if (!bytes) throw new Error('a file is missing in the backup');
      await files.put(d.id, bytes);
      written.push(d.id);
      const back = await files.get(d.id);
      if (!back || back.length !== d.size || (await sha256Bytes(back)) !== d.sha256) {
        throw new Error('a document file could not be saved correctly');
      }
    }
    if (plan.add.length > 0) {
      const fresh = await loadDocs(repo);
      const have = new Set(fresh.map(d => d.id));
      const merged = [...fresh, ...plan.add.filter(d => !have.has(d.id))];
      await repo.commit({ setMeta: { [DOCS_KEY]: JSON.stringify(merged) } });
    }
  } catch (e) {
    for (const id of written) {
      try { await files.remove(id); } catch { /* leftover bytes are harmless */ }
    }
    const why = e instanceof Error ? e.message : String(e);
    throw new Error('Cases were restored, but documents were not: ' + why + '. Restore the same file again to add the documents.');
  }
  return { ...base, addedDocs: plan.add.length, skippedDocs: plan.skipped };
}
// end of backupzip.ts
