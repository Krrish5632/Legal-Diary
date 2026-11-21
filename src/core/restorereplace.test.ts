import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { MemoryRepository } from './repository';
import type { Repository } from './repository';
import { IndexedDbRepository } from './indexeddb';
import { createCase, setPriority } from './actions';
import { createBackup, parseBackup, restoreMerge, serializeBackup } from './backup';
import { previewReplace, replaceFromBackup } from './restorereplace';

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
const roundTrip = async (repo: Repository) => parseBackup(serializeBackup(await createBackup(repo, NOW)));

describe.each(makers)('replace on %s', (_name, make) => {
  it('on an empty device it adds everything and matches the backup', async () => {
    const a = make();
    const c1 = await mk(a, '1');
    await mk(a, '2');
    const b = make();
    const r = await replaceFromBackup(b, await roundTrip(a), NOW);
    expect(r.addedCases).toBe(2);
    expect(await b.counts()).toEqual(await a.counts());
    expect(await b.getCase(c1.id)).toEqual(await a.getCase(c1.id));
  });

  it('a changed case becomes the backup version, no activity record is lost', async () => {
    const a = make();
    const b = make();
    const c1 = await mk(a, '1');
    const file = await roundTrip(a);
    await restoreMerge(b, file, NOW);
    await setPriority(b, c1.id, 'High', NOW, 'tester');
    const auditBefore = (await b.counts()).audit;
    const r = await replaceFromBackup(b, file, NOW);
    expect(r.replacedCases).toBe(1);
    expect((await b.getCase(c1.id))?.priority).toBe('Normal');
    expect((await b.counts()).audit).toBe(auditBefore);
  });

  it('keeps a case that is only on this device', async () => {
    const a = make();
    const b = make();
    await mk(a, '1');
    const file = await roundTrip(a);
    await restoreMerge(b, file, NOW);
    await mk(b, '2');
    const r = await replaceFromBackup(b, file, NOW);
    expect(r.keptOnlyHere).toBe(1);
    expect((await b.counts()).cases).toBe(2);
  });

  it('running it twice changes nothing the second time', async () => {
    const a = make();
    const b = make();
    await mk(a, '1');
    const file = await roundTrip(a);
    await replaceFromBackup(b, file, NOW);
    const again = await replaceFromBackup(b, file, NOW);
    expect(again.addedCases).toBe(0);
    expect(again.replacedCases).toBe(0);
    expect(again.addedHearings).toBe(0);
    expect(again.replacedHearings).toBe(0);
    expect(again.unchangedCases).toBe(1);
  });

  it('leaves a case alone when a hearing is already completed here', async () => {
    const a = make();
    const b = make();
    const c1 = await mk(a, '1');
    const file = await roundTrip(a);
    await restoreMerge(b, file, NOW);
    await setPriority(b, c1.id, 'High', NOW, 'tester');
    const h = (await b.getHearings(c1.id))[0];
    if (!h) throw new Error('no hearing');
    await b.commit({ putHearings: [{ ...h, state: 'completed' }] });
    const r = await replaceFromBackup(b, file, NOW);
    expect(r.keptNewerCases).toBe(1);
    expect(r.replacedCases).toBe(0);
    expect((await b.getCase(c1.id))?.priority).toBe('High');
    const after = (await b.getHearings(c1.id))[0];
    expect(after?.state).toBe('completed');
  });

  it('leaves a case alone when this device has an extra hearing', async () => {
    const a = make();
    const b = make();
    const c1 = await mk(a, '1');
    const file = await roundTrip(a);
    await restoreMerge(b, file, NOW);
    await setPriority(b, c1.id, 'High', NOW, 'tester');
    const h = (await b.getHearings(c1.id))[0];
    if (!h) throw new Error('no hearing');
    await b.commit({
      putHearings: [{ ...h, id: c1.id + ':2026-05-01', hearingDate: '2026-05-01' }],
    });
    const r = await replaceFromBackup(b, file, NOW);
    expect(r.keptNewerCases).toBe(1);
    expect((await b.getCase(c1.id))?.priority).toBe('High');
    expect((await b.getHearings(c1.id)).length).toBe(2);
  });

  it('the preview changes nothing and matches the real result', async () => {
    const a = make();
    const b = make();
    const c1 = await mk(a, '1');
    const file = await roundTrip(a);
    await restoreMerge(b, file, NOW);
    await setPriority(b, c1.id, 'High', NOW, 'tester');
    await mk(b, '2');
    const before = await b.counts();
    const pv = await previewReplace(b, file);
    expect(await b.counts()).toEqual(before);
    const r = await replaceFromBackup(b, file, NOW);
    expect(r.replacedCases).toBe(pv.replacedCases);
    expect(r.keptOnlyHere).toBe(pv.keptOnlyHere);
    expect(pv.replacedCases).toBe(1);
    expect(pv.keptOnlyHere).toBe(1);
  });
});
// end of restorereplace.test.ts
