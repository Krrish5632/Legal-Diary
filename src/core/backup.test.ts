import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { MemoryRepository, rescheduleInRepo } from './repository';
import type { Repository } from './repository';
import { IndexedDbRepository } from './indexeddb';
import { createCase, setPriority } from './actions';
import { loadClients, saveClient } from './clients';
import { createBackup, parseBackup, previewRestore, restoreMerge, serializeBackup } from './backup';

const NOW = '2026-03-01T10:00:00+05:30';

const makers: [string, () => Repository][] = [
  ['memory', () => new MemoryRepository()],
  ['indexeddb', () => new IndexedDbRepository('db' + Math.random(), new IDBFactory())],
];

async function mk(repo: Repository, num: string) {
  return createCase(repo, {
    caseNumber: num, caseYear: '2025', caseType: 'Civil',
    court: { name: 'Court A', number: '', judgeName: '' },
    parties: { plaintiff: 'A Kumar', defendant: 'B Singh', oppositeCounsel: '' },
    legalSections: {}, priority: 'Normal', currentProceeding: 'Evidence', notes: '',
    hearingDate: '2026-03-10',
  }, NOW, 'tester');
}

const blank = { phone: '', email: '', address: '', notes: '' };
const sortId = <T extends { id: string }>(x: T[]): T[] => [...x].sort((p, q) => p.id.localeCompare(q.id));
const roundTrip = async (repo: Repository) => parseBackup(serializeBackup(await createBackup(repo, NOW)));

describe.each(makers)('backup on %s', (_name, make) => {
  it('round trip into an empty device gives identical data', async () => {
    const a = make();
    const c1 = await mk(a, '1');
    await mk(a, '2');
    await rescheduleInRepo(a, c1.id, '2026-04-01', { proceedings: 'Evidence' }, NOW, 'tester');
    await saveClient(a, { name: 'X Client', ...blank }, NOW);
    const file = await roundTrip(a);
    const b = make();
    const pv = await previewRestore(b, file);
    expect(pv.newCases).toBe(2);
    expect(pv.newHearings).toBe(3);
    expect(pv.alreadyHere).toBe(0);
    const r = await restoreMerge(b, file, NOW);
    expect(r.addedCases).toBe(2);
    expect(await b.counts()).toEqual(await a.counts());
    expect(await b.getCase(c1.id)).toEqual(await a.getCase(c1.id));
    expect(await b.getHearings(c1.id)).toEqual(await a.getHearings(c1.id));
    expect(sortId(await b.listAudit())).toEqual(sortId(await a.listAudit()));
    expect((await loadClients(b)).map(c => c.name)).toEqual(['X Client']);
  });

  it('refuses a changed, foreign or newer file', async () => {
    const a = make();
    await mk(a, '1');
    const text = serializeBackup(await createBackup(a, NOW));
    await expect(parseBackup(text.replace('"A Kumar"', '"A Kumaar"'))).rejects.toThrow('damaged');
    await expect(parseBackup('{"a":1}')).rejects.toThrow('not a Legal Diary Pro');
    await expect(parseBackup('not json')).rejects.toThrow('cannot be read');
    const newer = JSON.parse(text) as Record<string, unknown>;
    newer.version = 2;
    await expect(parseBackup(JSON.stringify(newer))).rejects.toThrow('different version');
  });

  it('merge never touches a case that already exists on the device', async () => {
    const a = make();
    const b = make();
    const c1 = await mk(a, '1');
    await restoreMerge(b, await roundTrip(a), NOW);
    await setPriority(b, c1.id, 'High', NOW, 'tester');
    await mk(a, '2');
    const r = await restoreMerge(b, await roundTrip(a), NOW);
    expect(r.addedCases).toBe(1);
    expect(r.skippedCases).toBe(1);
    expect((await b.getCase(c1.id))?.priority).toBe('High');
    expect((await b.counts()).cases).toBe(2);
  });

  it('restoring the same file twice adds nothing the second time', async () => {
    const a = make();
    const b = make();
    await mk(a, '1');
    const file = await roundTrip(a);
    expect((await restoreMerge(b, file, NOW)).addedCases).toBe(1);
    const again = await restoreMerge(b, file, NOW);
    expect(again.addedCases).toBe(0);
    expect(again.addedHearings).toBe(0);
    expect(again.addedAudit).toBe(0);
    expect(again.skippedCases).toBe(1);
    expect(await b.counts()).toEqual(await a.counts());
  });

  it('merges clients without duplicates', async () => {
    const a = make();
    const b = make();
    await saveClient(a, { name: 'X Client', ...blank }, NOW);
    await saveClient(a, { name: 'Y Client', ...blank }, NOW);
    await saveClient(b, { name: 'y  client', ...blank }, NOW);
    const r = await restoreMerge(b, await roundTrip(a), NOW);
    expect(r.addedClients).toBe(1);
    const names = (await loadClients(b)).map(c => c.name).sort();
    expect(names).toEqual(['X Client', 'y  client']);
  });
});
// end of backup.test.ts
