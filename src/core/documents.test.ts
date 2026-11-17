import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { MemoryRepository } from './repository';
import type { Repository } from './repository';
import { IndexedDbRepository } from './indexeddb';
import type { CaseRecord } from './types';
import {
  addDocument, cleanFileName, deleteDocument, getDocumentBytes, listDocs, loadDocs,
  missingFiles, previewKind, updateDocument,
} from './documents';
import type { FileStore } from './documents';
import { IndexedDbFileStore, MemoryFileStore } from './filestore';

const NOW = '2026-03-01T10:00:00+05:30';
const NOW2 = '2026-03-02T11:00:00+05:30';
const b = (...n: number[]) => new Uint8Array(n);

function mkCase(id: string): CaseRecord {
  return {
    id, caseNumber: 'TEST-' + id, caseYear: '2026', caseType: 'Civil', caseTypeOriginal: 'civil',
    court: { name: 'Court A' }, parties: { plaintiff: 'A Kumar', defendant: 'B Singh' }, legalSections: {},
    status: 'Pending', priority: 'Normal', currentProceeding: '', notes: '',
    entryDate: '2026-01-01', entryDateSource: 'app', initialHearingDate: '2026-02-01',
    nextHearingDate: '2026-02-01', lastHearingDate: null, totalHearings: 0,
    createdAt: NOW, updatedAt: NOW, legacy: { sourceKey: 'app', raw: null },
  } as unknown as CaseRecord;
}

const backends: Array<[string, () => { repo: Repository; files: FileStore }]> = [
  ['memory', () => ({ repo: new MemoryRepository(), files: new MemoryFileStore() })],
  ['indexeddb', () => {
    const f = new IDBFactory();
    return { repo: new IndexedDbRepository('r', f), files: new IndexedDbFileStore('f', f) };
  }],
];

describe.each(backends)('documents on %s', (_name, make) => {
  async function setup() {
    const { repo, files } = make();
    await repo.commit({ putCases: [mkCase('c1'), mkCase('c2')] });
    return { repo, files };
  }
  const input = (caseId: string, bytes: Uint8Array, name = 'order.pdf') => ({
    caseId, name, category: 'Court Order', mime: 'application/pdf', bytes,
  });

  it('adds a document, lists it and reads the same bytes back', async () => {
    const { repo, files } = await setup();
    const d = await addDocument(repo, files, input('c1', b(1, 2, 3, 4), '  order 1.pdf '), NOW);
    expect(d.name).toBe('order 1.pdf');
    expect(d.size).toBe(4);
    expect(d.sha256).toHaveLength(64);
    const list = await listDocs(repo, 'c1');
    expect(list.map(x => x.id)).toEqual([d.id]);
    expect(await listDocs(repo, 'c2')).toEqual([]);
    const got = await getDocumentBytes(repo, files, d.id);
    expect([...got.bytes]).toEqual([1, 2, 3, 4]);
  });

  it('rejects empty, too large, bad category and unknown case', async () => {
    const { repo, files } = await setup();
    await expect(addDocument(repo, files, input('c1', b()), NOW)).rejects.toThrow(/empty/);
    await expect(addDocument(repo, files, input('c1', b(1, 2, 3, 4)), NOW, { maxBytes: 3 })).rejects.toThrow(/too large/);
    await expect(addDocument(repo, files, { ...input('c1', b(1)), category: 'Hmm' }, NOW)).rejects.toThrow(/category/);
    await expect(addDocument(repo, files, input('nope', b(1)), NOW)).rejects.toThrow(/case was not found/);
    expect(await listDocs(repo)).toEqual([]);
  });

  it('blocks the same file twice on one case but allows it on another case', async () => {
    const { repo, files } = await setup();
    await addDocument(repo, files, input('c1', b(5, 5)), NOW);
    await expect(addDocument(repo, files, input('c1', b(5, 5), 'copy.pdf'), NOW)).rejects.toThrow(/already attached/);
    await addDocument(repo, files, input('c2', b(5, 5)), NOW);
    expect((await listDocs(repo)).length).toBe(2);
  });

  it('delete hides the document, removes the file and keeps a record', async () => {
    const { repo, files } = await setup();
    const d = await addDocument(repo, files, input('c1', b(7, 7, 7)), NOW);
    await deleteDocument(repo, files, d.id, NOW2);
    expect(await listDocs(repo, 'c1')).toEqual([]);
    expect(await files.has(d.id)).toBe(false);
    const all = await loadDocs(repo);
    expect(all).toHaveLength(1);
    expect(all[0].deletedAt).toBe(NOW2);
    await expect(deleteDocument(repo, files, d.id, NOW2)).rejects.toThrow(/not found/);
    await expect(getDocumentBytes(repo, files, d.id)).rejects.toThrow(/not found/);
    await addDocument(repo, files, input('c1', b(7, 7, 7)), NOW2);
    expect(await listDocs(repo, 'c1')).toHaveLength(1);
  });

  it('notices a damaged or missing file', async () => {
    const { repo, files } = await setup();
    const d = await addDocument(repo, files, input('c1', b(1, 2, 3, 4)), NOW);
    await files.put(d.id, b(9, 9, 9, 9));
    await expect(getDocumentBytes(repo, files, d.id)).rejects.toThrow(/damaged/);
    await files.remove(d.id);
    await expect(getDocumentBytes(repo, files, d.id)).rejects.toThrow(/missing/);
    const missing = await missingFiles(repo, files);
    expect(missing.map(x => x.id)).toEqual([d.id]);
  });

  it('updates name, category and note, and refuses an empty change', async () => {
    const { repo, files } = await setup();
    const d = await addDocument(repo, files, input('c1', b(1, 1)), NOW);
    const u = await updateDocument(repo, d.id, { name: 'new.pdf', category: 'Evidence', note: ' seen ' });
    expect(u.name).toBe('new.pdf');
    expect(u.category).toBe('Evidence');
    expect(u.note).toBe('seen');
    await expect(updateDocument(repo, d.id, { name: 'new.pdf' })).rejects.toThrow(/Nothing/);
    await expect(updateDocument(repo, d.id, { category: 'Zzz' })).rejects.toThrow(/category/);
  });

  it('never overwrites a damaged document list', async () => {
    const { repo, files } = await setup();
    await repo.commit({ setMeta: { documents_v1: '{oops' } });
    await expect(loadDocs(repo)).rejects.toThrow(/damaged/);
    await expect(addDocument(repo, files, input('c1', b(1)), NOW)).rejects.toThrow(/damaged/);
    expect(await repo.getMeta('documents_v1')).toBe('{oops');
  });

  it('removes the stored file when saving the list fails', async () => {
    const { repo, files } = await setup();
    const seen: string[] = [];
    const spy: FileStore = {
      put: async (id, bytes) => { seen.push(id); await files.put(id, bytes); },
      get: id => files.get(id),
      remove: id => files.remove(id),
      has: id => files.has(id),
    };
    const bad = {
      getCase: (id: string) => repo.getCase(id),
      getMeta: (k: string) => repo.getMeta(k),
      commit: async () => { throw new Error('disk full'); },
    } as unknown as Repository;
    await expect(addDocument(bad, spy, input('c1', b(3, 3)), NOW)).rejects.toThrow(/disk full/);
    expect(seen).toHaveLength(1);
    expect(await files.has(seen[0])).toBe(false);
    expect(await listDocs(repo)).toEqual([]);
  });

  it('keeps all documents when several are added at the same moment', async () => {
    const { repo, files } = await setup();
    await Promise.all([
      addDocument(repo, files, input('c1', b(1), 'a.pdf'), NOW),
      addDocument(repo, files, input('c1', b(2), 'b.pdf'), NOW),
      addDocument(repo, files, input('c1', b(3), 'c.pdf'), NOW),
    ]);
    expect((await listDocs(repo, 'c1')).length).toBe(3);
  });
});

describe('helpers', () => {
  it('cleans file names', () => {
    expect(cleanFileName('C:\\x\\y/order<1>.pdf')).toBe('order1.pdf');
    expect(cleanFileName('  a   b.pdf ')).toBe('a b.pdf');
    expect(() => cleanFileName('???')).toThrow(/name/);
  });

  it('decides what can be previewed', () => {
    expect(previewKind('application/pdf', 'x')).toBe('pdf');
    expect(previewKind('', 'Scan.PDF')).toBe('pdf');
    expect(previewKind('image/png', 'a')).toBe('image');
    expect(previewKind('', 'photo.JPG')).toBe('image');
    expect(previewKind('image/svg+xml', 'a.svg')).toBe('none');
    expect(previewKind('application/msword', 'a.doc')).toBe('none');
  });
});
// end of documents.test.ts
