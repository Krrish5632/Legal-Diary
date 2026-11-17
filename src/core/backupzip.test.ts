import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { MemoryRepository } from './repository';
import type { Repository } from './repository';
import { IndexedDbRepository } from './indexeddb';
import type { CaseRecord } from './types';
import { addDocument, deleteDocument, getDocumentBytes, listDocs, loadDocs } from './documents';
import type { FileStore } from './documents';
import { IndexedDbFileStore, MemoryFileStore } from './filestore';
import { createZipBackup, parseZipBackup, previewZipRestore, restoreZip } from './backupzip';
import { unzipStore, zipStore } from './zip';

const NOW = '2026-03-01T10:00:00+05:30';
const NOW2 = '2026-03-02T11:00:00+05:30';
const u8 = (...n: number[]) => new Uint8Array(n);

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

const input = (caseId: string, bytes: Uint8Array, name: string) => ({
  caseId, name, category: 'Court Order', mime: 'application/pdf', bytes,
});

type Dev = { repo: Repository; files: FileStore };
const backends: Array<[string, () => Dev]> = [
  ['memory', () => ({ repo: new MemoryRepository(), files: new MemoryFileStore() })],
  ['indexeddb', () => {
    const f = new IDBFactory();
    return { repo: new IndexedDbRepository('r', f), files: new IndexedDbFileStore('f', f) };
  }],
];

describe.each(backends)('zip backup on %s', (_name, make) => {
  async function deviceA(): Promise<Dev> {
    const a = make();
    await a.repo.commit({ putCases: [mkCase('c1'), mkCase('c2')] });
    await addDocument(a.repo, a.files, input('c1', u8(1, 2, 3, 4), 'a.pdf'), NOW);
    await addDocument(a.repo, a.files, input('c2', u8(9, 9), 'b.png'), NOW);
    return a;
  }

  it('saves cases and documents and restores them on an empty device', async () => {
    const a = await deviceA();
    const b = make();
    const made = await createZipBackup(a.repo, a.files, NOW2);
    expect(made.skipped).toEqual([]);
    expect(made.counts.cases).toBe(2);
    expect(made.counts.documents).toBe(2);
    const z = await parseZipBackup(made.zip);
    const p = await previewZipRestore(b.repo, z);
    expect(p.newCases).toBe(2);
    expect(p.newDocs).toBe(2);
    expect(p.docsAlreadyHere).toBe(0);
    const r = await restoreZip(b.repo, b.files, z, NOW2);
    expect(r.addedCases).toBe(2);
    expect(r.addedDocs).toBe(2);
    const list = await listDocs(b.repo, 'c1');
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('a.pdf');
    const got = await getDocumentBytes(b.repo, b.files, list[0].id);
    expect([...got.bytes]).toEqual([1, 2, 3, 4]);
  });

  it('restoring the same file twice adds nothing the second time', async () => {
    const a = await deviceA();
    const b = make();
    const z = await parseZipBackup((await createZipBackup(a.repo, a.files, NOW2)).zip);
    await restoreZip(b.repo, b.files, z, NOW2);
    const r2 = await restoreZip(b.repo, b.files, z, NOW2);
    expect(r2.addedCases).toBe(0);
    expect(r2.addedDocs).toBe(0);
    expect(r2.skippedDocs).toBe(2);
    expect(await listDocs(b.repo)).toHaveLength(2);
  });

  it('refuses a changed zip file', async () => {
    const a = await deviceA();
    const made = await createZipBackup(a.repo, a.files, NOW2);
    const bad = made.zip.slice();
    bad[50] ^= 0xff;
    await expect(parseZipBackup(bad)).rejects.toThrow(/check failed|not valid/);
  });

  it('refuses a zip where a document file was swapped', async () => {
    const a = await deviceA();
    const made = await createZipBackup(a.repo, a.files, NOW2);
    const swapped = unzipStore(made.zip).map(e =>
      e.name.startsWith('files/') ? { name: e.name, data: u8(7, 7, 7, 7) } : e,
    );
    await expect(parseZipBackup(zipStore(swapped))).rejects.toThrow(/damaged/);
  });

  it('leaves out a document whose file is missing and says so', async () => {
    const a = await deviceA();
    const first = (await listDocs(a.repo, 'c1'))[0];
    await a.files.remove(first.id);
    const made = await createZipBackup(a.repo, a.files, NOW2);
    expect(made.skipped).toHaveLength(1);
    expect(made.skipped[0].name).toBe('a.pdf');
    expect(made.counts.documents).toBe(1);
    const b = make();
    const r = await restoreZip(b.repo, b.files, await parseZipBackup(made.zip), NOW2);
    expect(r.addedCases).toBe(2);
    expect(r.addedDocs).toBe(1);
  });

  it('reports a document failure after cases were restored, and a retry adds the documents', async () => {
    const a = await deviceA();
    const b = make();
    const z = await parseZipBackup((await createZipBackup(a.repo, a.files, NOW2)).zip);
    const flaky: FileStore = {
      put: async () => { throw new Error('disk full'); },
      get: id => b.files.get(id),
      remove: id => b.files.remove(id),
      has: id => b.files.has(id),
    };
    await expect(restoreZip(b.repo, flaky, z, NOW2)).rejects.toThrow(/Cases were restored, but documents were not/);
    expect((await b.repo.counts()).cases).toBe(2);
    expect(await listDocs(b.repo)).toEqual([]);
    const r = await restoreZip(b.repo, b.files, z, NOW2);
    expect(r.addedCases).toBe(0);
    expect(r.addedDocs).toBe(2);
  });

  it('does not bring back a document that was deleted on this device', async () => {
    const a = await deviceA();
    const b = make();
    const z = await parseZipBackup((await createZipBackup(a.repo, a.files, NOW2)).zip);
    await restoreZip(b.repo, b.files, z, NOW2);
    const one = (await listDocs(b.repo, 'c1'))[0];
    await deleteDocument(b.repo, b.files, one.id, NOW2);
    const r = await restoreZip(b.repo, b.files, z, NOW2);
    expect(r.addedDocs).toBe(0);
    expect(await listDocs(b.repo, 'c1')).toEqual([]);
    expect(await loadDocs(b.repo)).toHaveLength(2);
  });

  it('stops without changing anything when the local document list is damaged', async () => {
    const a = await deviceA();
    const b = make();
    const z = await parseZipBackup((await createZipBackup(a.repo, a.files, NOW2)).zip);
    await b.repo.commit({ setMeta: { documents_v1: '{oops' } });
    await expect(previewZipRestore(b.repo, z)).rejects.toThrow(/damaged/);
    await expect(restoreZip(b.repo, b.files, z, NOW2)).rejects.toThrow(/damaged/);
    expect((await b.repo.counts()).cases).toBe(0);
    expect(await b.repo.getMeta('documents_v1')).toBe('{oops');
  });
});

describe('zip backup, wrong files', () => {
  it('refuses something that is not a zip', async () => {
    await expect(parseZipBackup(u8(1, 2, 3))).rejects.toThrow(/not valid/);
  });

  it('refuses a zip that is not a backup', async () => {
    const z = zipStore([{ name: 'x.txt', data: u8(1) }]);
    await expect(parseZipBackup(z)).rejects.toThrow(/not a Legal Diary Pro backup/);
  });
});
// end of backupzip.test.ts
