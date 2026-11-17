import type { Repository } from './repository';

export const DOC_CATEGORIES = [
  'Petition',
  'Written Statement',
  'Court Order',
  'Evidence',
  'Notice',
  'Vakalatnama',
  'ID Proof',
  'Other',
] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];

export const isCategory = (v: unknown): v is DocCategory =>
  typeof v === 'string' && (DOC_CATEGORIES as readonly string[]).includes(v);

export const DOCS_KEY = 'documents_v1';
export const MAX_DOC_BYTES = 25 * 1024 * 1024;

export interface DocMeta {
  id: string;
  caseId: string;
  name: string;
  category: DocCategory;
  mime: string;
  size: number;
  sha256: string;
  addedAt: string;
  note: string;
  deletedAt: string | null;
}

/** Where the file bytes live. Browser: IndexedDB. Phone: app files (later). */
export interface FileStore {
  put(id: string, bytes: Uint8Array): Promise<void>;
  get(id: string): Promise<Uint8Array | null>;
  remove(id: string): Promise<void>;
  has(id: string): Promise<boolean>;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const mb = (n: number): string => (n / 1048576).toFixed(1);

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function cleanFileName(name: string): string {
  const last = String(name ?? '').split(/[\\/]/).pop() ?? '';
  const n = last
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  if (!n || n === '.' || n === '..') throw new Error('The file needs a name.');
  return n;
}

export function previewKind(mime: string, name: string): 'image' | 'pdf' | 'none' {
  const m = String(mime || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(m) || /\.(jpe?g|png|webp|gif)$/.test(n)) {
    return 'image';
  }
  return 'none';
}

/** Reads the saved list text. Throws (never returns an empty list) if it is damaged. */
export function parseDocs(raw: string): DocMeta[] {
  const bad = (): never => {
    throw new Error('The saved document list is damaged. Nothing was changed.');
  };
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return bad();
  }
  if (!Array.isArray(v)) return bad();
  const out: DocMeta[] = [];
  const seen = new Set<string>();
  for (const x of v as unknown[]) {
    if (!isObj(x)) return bad();
    const { id, caseId, name, mime, size, sha256, addedAt } = x;
    if (
      typeof id !== 'string' || !id ||
      typeof caseId !== 'string' ||
      typeof name !== 'string' ||
      typeof mime !== 'string' ||
      typeof size !== 'number' ||
      typeof sha256 !== 'string' ||
      typeof addedAt !== 'string'
    ) return bad();
    if (seen.has(id)) return bad();
    seen.add(id);
    out.push({
      id, caseId, name,
      category: isCategory(x.category) ? x.category : 'Other',
      mime, size, sha256, addedAt,
      note: typeof x.note === 'string' ? x.note : '',
      deletedAt: typeof x.deletedAt === 'string' ? x.deletedAt : null,
    });
  }
  return out;
}

/** All records, including deleted ones (kept as a trace). */
export async function loadDocs(repo: Repository): Promise<DocMeta[]> {
  const raw = await repo.getMeta(DOCS_KEY);
  if (raw === null) return [];
  return parseDocs(raw);
}

async function saveDocs(repo: Repository, list: DocMeta[]): Promise<void> {
  await repo.commit({ setMeta: { [DOCS_KEY]: JSON.stringify(list) } });
}

export const activeDocs = (list: DocMeta[]): DocMeta[] => list.filter(d => !d.deletedAt);

export async function listDocs(repo: Repository, caseId?: string): Promise<DocMeta[]> {
  const all = activeDocs(await loadDocs(repo));
  const l = caseId === undefined ? all : all.filter(d => d.caseId === caseId);
  return l.sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.id.localeCompare(b.id));
}

// One document change at a time, so two quick saves can never overwrite each other.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(() => fn());
  queue = run.catch(() => undefined);
  return run;
}

export interface NewDocInput {
  caseId: string;
  name: string;
  category: string;
  mime: string;
  bytes: Uint8Array;
  note?: string;
}

export function addDocument(
  repo: Repository,
  files: FileStore,
  input: NewDocInput,
  nowISO: string,
  opts?: { maxBytes?: number },
): Promise<DocMeta> {
  return serial(async () => {
    const max = opts?.maxBytes ?? MAX_DOC_BYTES;
    const name = cleanFileName(input.name);
    if (!isCategory(input.category)) throw new Error('Choose a document category.');
    if (input.bytes.length === 0) throw new Error('This file is empty.');
    if (input.bytes.length > max) {
      throw new Error('This file is too large (' + mb(input.bytes.length) + ' MB). The limit is ' + mb(max) + ' MB.');
    }
    const c = await repo.getCase(input.caseId);
    if (!c) throw new Error('The case was not found.');
    const list = await loadDocs(repo);
    const hash = await sha256Bytes(input.bytes);
    if (list.some(d => d.caseId === input.caseId && !d.deletedAt && d.sha256 === hash)) {
      throw new Error('This file is already attached to this case.');
    }
    const id = 'doc-' + crypto.randomUUID();
    await files.put(id, input.bytes);
    try {
      const back = await files.get(id);
      if (!back || back.length !== input.bytes.length || (await sha256Bytes(back)) !== hash) {
        throw new Error('The file could not be saved correctly. Nothing was added.');
      }
      const meta: DocMeta = {
        id, caseId: input.caseId, name, category: input.category,
        mime: String(input.mime || ''), size: input.bytes.length, sha256: hash,
        addedAt: nowISO, note: String(input.note ?? '').trim(), deletedAt: null,
      };
      await saveDocs(repo, [...list, meta]);
      return meta;
    } catch (e) {
      try { await files.remove(id); } catch { /* leftover bytes are harmless */ }
      throw e;
    }
  });
}

export function updateDocument(
  repo: Repository,
  id: string,
  patch: { name?: string; category?: string; note?: string },
): Promise<DocMeta> {
  return serial(async () => {
    const list = await loadDocs(repo);
    const d = list.find(x => x.id === id);
    if (!d || d.deletedAt) throw new Error('This document was not found.');
    const next: DocMeta = { ...d };
    if (patch.name !== undefined) next.name = cleanFileName(patch.name);
    if (patch.category !== undefined) {
      if (!isCategory(patch.category)) throw new Error('Choose a document category.');
      next.category = patch.category;
    }
    if (patch.note !== undefined) next.note = patch.note.trim();
    if (next.name === d.name && next.category === d.category && next.note === d.note) {
      throw new Error('Nothing was changed.');
    }
    await saveDocs(repo, list.map(x => (x.id === id ? next : x)));
    return next;
  });
}

/** Removes the file and hides the document. A small record (name, time) is kept. */
export function deleteDocument(repo: Repository, files: FileStore, id: string, nowISO: string): Promise<void> {
  return serial(async () => {
    const list = await loadDocs(repo);
    const d = list.find(x => x.id === id);
    if (!d || d.deletedAt) throw new Error('This document was not found.');
    await saveDocs(repo, list.map(x => (x.id === id ? { ...x, deletedAt: nowISO } : x)));
    try { await files.remove(id); } catch { /* the document is already hidden; leftover bytes are harmless */ }
  });
}

/** Returns the file after checking it is whole. */
export async function getDocumentBytes(
  repo: Repository,
  files: FileStore,
  id: string,
): Promise<{ meta: DocMeta; bytes: Uint8Array }> {
  const list = await loadDocs(repo);
  const d = list.find(x => x.id === id);
  if (!d || d.deletedAt) throw new Error('This document was not found.');
  const bytes = await files.get(id);
  if (!bytes) throw new Error('The file for this document is missing on this device.');
  if (bytes.length !== d.size || (await sha256Bytes(bytes)) !== d.sha256) {
    throw new Error('This file is damaged (check failed).');
  }
  return { meta: d, bytes };
}

/** Documents that are listed but whose file is not on the device. */
export async function missingFiles(repo: Repository, files: FileStore): Promise<DocMeta[]> {
  const out: DocMeta[] = [];
  for (const d of activeDocs(await loadDocs(repo))) {
    if (!(await files.has(d.id))) out.push(d);
  }
  return out;
}
// end of documents.ts
