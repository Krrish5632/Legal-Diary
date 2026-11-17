import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import { MemoryRepository, rescheduleInRepo } from './repository';
import type { Repository } from './repository';
import { IndexedDbRepository } from './indexeddb';
import { importCleanExport } from './importer';
import type { AuditEvent, CaseRecord, HearingRecord } from './types';

const NOW = '2026-01-01T10:00:00+05:30';

function mkCase(id: string, next: string | null = '2026-03-10'): CaseRecord {
  return {
    id, caseNumber: 'C-' + id, caseYear: 2024, caseType: 'Civil', caseTypeOriginal: 'civil',
    court: {}, parties: {}, legalSections: {},
    status: 'Pending', priority: 'Normal', currentProceeding: '', notes: '',
    entryDate: null, entryDateSource: 'unknown', initialHearingDate: null,
    nextHearingDate: next, lastHearingDate: null, totalHearings: 0,
    createdAt: NOW, updatedAt: NOW, legacy: null,
  } as unknown as CaseRecord;
}

function mkHearing(caseId: string, date: string, state: 'scheduled' | 'completed'): HearingRecord {
  return {
    id: `${caseId}:${date}`, caseId, hearingDate: date, state,
    proceedings: '', courtOrder: '', notes: '', nextDateFixed: null,
    source: 'app', createdAt: NOW, updatedAt: NOW,
  } as unknown as HearingRecord;
}

function mkAudit(id: string, caseId: string): AuditEvent {
  return { id, caseId, at: NOW, actor: 'test', action: 'created', detail: '' } as unknown as AuditEvent;
}

let n = 0;
function freshIdb(): IDBFactory { return new IDBFactory() as unknown as IDBFactory; }

const makers: [string, () => Repository][] = [
  ['Memory', () => new MemoryRepository()],
  ['IndexedDB', () => new IndexedDbRepository('test_' + (n++), freshIdb())],
];

describe.each(makers)('repository contract: %s', (_name, make) => {
  it('starts empty', async () => {
    const r = make();
    expect(await r.counts()).toEqual({ cases: 0, hearings: 0, audit: 0 });
    expect(await r.getCase('nope')).toBeNull();
    expect(await r.getMeta('nope')).toBeNull();
  });

  it('saves a case and returns a copy, not the stored object', async () => {
    const r = make();
    await r.commit({ putCases: [mkCase('a')] });
    const got = await r.getCase('a');
    expect(got?.caseNumber).toBe('C-a');
    if (got) got.caseNumber = 'CHANGED';
    expect((await r.getCase('a'))?.caseNumber).toBe('C-a');
  });

  it('lists hearings of one case in date order', async () => {
    const r = make();
    await r.commit({
      putCases: [mkCase('a'), mkCase('b')],
      putHearings: [
        mkHearing('a', '2026-05-01', 'scheduled'),
        mkHearing('a', '2026-02-01', 'completed'),
        mkHearing('b', '2026-03-01', 'scheduled'),
      ],
    });
    const list = await r.getHearings('a');
    expect(list.map(h => h.hearingDate)).toEqual(['2026-02-01', '2026-05-01']);
    expect((await r.listHearings()).length).toBe(3);
  });

  it('rejects a repeated audit id and saves nothing from that change', async () => {
    const r = make();
    await r.commit({ putCases: [mkCase('a')], insertAudit: [mkAudit('x1', 'a')] });
    await expect(
      r.commit({ putCases: [mkCase('b')], insertAudit: [mkAudit('x1', 'a')] }),
    ).rejects.toThrow();
    expect(await r.getCase('b')).toBeNull();
    expect((await r.counts()).cases).toBe(1);
    expect((await r.counts()).audit).toBe(1);
  });

  it('rejects a hearing for a missing case and saves nothing', async () => {
    const r = make();
    await expect(
      r.commit({ putCases: [mkCase('x')], putHearings: [mkHearing('nope', '2026-03-01', 'scheduled')] }),
    ).rejects.toThrow();
    expect(await r.getCase('x')).toBeNull();
  });

  it('rejects a wrong hearing id', async () => {
    const r = make();
    const bad = { ...mkHearing('a', '2026-03-01', 'scheduled'), id: 'wrong' } as HearingRecord;
    await expect(r.commit({ putCases: [mkCase('a')], putHearings: [bad] })).rejects.toThrow();
    expect(await r.getCase('a')).toBeNull();
  });

  it('never lets a completed hearing become scheduled again', async () => {
    const r = make();
    await r.commit({ putCases: [mkCase('a')], putHearings: [mkHearing('a', '2026-03-01', 'completed')] });
    await expect(
      r.commit({ putHearings: [mkHearing('a', '2026-03-01', 'scheduled')] }),
    ).rejects.toThrow();
    expect((await r.getHearings('a'))[0].state).toBe('completed');
  });

  it('lets a scheduled hearing become completed', async () => {
    const r = make();
    await r.commit({ putCases: [mkCase('a')], putHearings: [mkHearing('a', '2026-03-01', 'scheduled')] });
    await r.commit({ putHearings: [mkHearing('a', '2026-03-01', 'completed')] });
    expect((await r.getHearings('a'))[0].state).toBe('completed');
  });

  it('keeps meta together with the rest of the change (all or nothing)', async () => {
    const r = make();
    await r.commit({ setMeta: { k1: 'v1' } });
    expect(await r.getMeta('k1')).toBe('v1');
    await expect(
      r.commit({ setMeta: { k2: 'v2' }, putHearings: [mkHearing('ghost', '2026-03-01', 'scheduled')] }),
    ).rejects.toThrow();
    expect(await r.getMeta('k2')).toBeNull();
  });

  it('moves a case to a new date and keeps the old date as history', async () => {
    const r = make();
    await r.commit({ putCases: [mkCase('a', '2026-03-10')], putHearings: [mkHearing('a', '2026-03-10', 'scheduled')] });
    const input = { proceedings: 'Evidence', courtOrder: '', notes: '' } as unknown as Parameters<typeof rescheduleInRepo>[3];
    const c = await rescheduleInRepo(r, 'a', '2026-04-20', input, NOW, 'test');
    expect(c.nextHearingDate).toBe('2026-04-20');
    const hs = await r.getHearings('a');
    expect(hs.map(h => h.hearingDate)).toEqual(['2026-03-10', '2026-04-20']);
    expect(hs[0].state).toBe('completed');
    expect(hs[1].state).toBe('scheduled');
    expect((await r.listAudit('a')).length).toBeGreaterThan(0);
  });
});

describe('IndexedDB only', () => {
  it('data is still there after closing and opening again', async () => {
    const f = freshIdb();
    const a = new IndexedDbRepository('persist_test', f);
    await a.commit({ putCases: [mkCase('a')], setMeta: { hello: 'world' } });
    await a.close();
    const b = new IndexedDbRepository('persist_test', f);
    expect((await b.counts()).cases).toBe(1);
    expect(await b.getMeta('hello')).toBe('world');
    await b.close();
  });

  const REAL = 'C:/LD_backup/clean_export.json';
  it.skipIf(!fs.existsSync(REAL))('imports the real 35 cases once, and a second import changes nothing', async () => {
    const data = JSON.parse(fs.readFileSync(REAL, 'utf8'));
    const repo = new IndexedDbRepository('real_test', freshIdb());
    const first = await importCleanExport(repo, data, NOW);
    expect(first.status).toBe('imported');
    expect(await repo.counts()).toEqual({ cases: 35, hearings: 35, audit: 35 });
    const second = await importCleanExport(repo, data, NOW);
    expect(second.status).toBe('already-done');
    expect(await repo.counts()).toEqual({ cases: 35, hearings: 35, audit: 35 });
    const cases = await repo.listCases();
    expect(cases.every(c => typeof c.nextHearingDate === 'string')).toBe(true);
    await repo.close();
  });
});
// end of indexeddb.test.ts
