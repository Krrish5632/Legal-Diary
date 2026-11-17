import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { migrateLegacy } from './migrate';
import { MemoryRepository, rescheduleInRepo } from './repository';
import { importCleanExport } from './importer';
import type { CleanExport } from './importer';

const now = '2026-01-10T10:00:00.000Z';
const legacy = (i: number) => ({
  id: 'case' + i, caseNumber: i + '/2024', caseType: 'Civil', filingYear: 2024,
  status: 'Pending', priority: false, nextDate: '2026-02-01', history: [], documents: [], voiceNotes: [],
});
const mk = (n: number): CleanExport => {
  const m = migrateLegacy(Array.from({ length: n }, (_, i) => legacy(i)), now);
  return { version: 1, cases: m.cases, hearings: m.hearings, audit: m.audit };
};

describe('import', () => {
  it('imports, verifies, and sets the done flag', async () => {
    const repo = new MemoryRepository();
    const out = await importCleanExport(repo, mk(3), now);
    expect(out.status).toBe('imported');
    expect(await repo.counts()).toEqual({ cases: 3, hearings: 3, audit: 3 });
    expect(await repo.getMeta('migration_v1')).toBe('done');
  });
  it('second run changes nothing', async () => {
    const repo = new MemoryRepository();
    const data = mk(3);
    await importCleanExport(repo, data, now);
    const again = await importCleanExport(repo, data, now);
    expect(again.status).toBe('already-done');
    expect(await repo.counts()).toEqual({ cases: 3, hearings: 3, audit: 3 });
  });
  it('failed safety backup writes nothing', async () => {
    const repo = new MemoryRepository();
    const out = await importCleanExport(repo, mk(3), now, async () => { throw new Error('disk full'); });
    expect(out.status).toBe('failed');
    expect(await repo.counts()).toEqual({ cases: 0, hearings: 0, audit: 0 });
    expect(await repo.getMeta('migration_v1')).toBeNull();
  });
  it('no duplicates if data is already there but flag is missing', async () => {
    const repo = new MemoryRepository();
    const data = mk(3);
    await repo.commit({ putCases: data.cases, putHearings: data.hearings, insertAudit: data.audit });
    const out = await importCleanExport(repo, data, now);
    expect(out.status).toBe('imported');
    expect(out.added).toEqual({ cases: 0, hearings: 0, audit: 0 });
    expect(out.skipped).toEqual({ cases: 3, hearings: 3, audit: 3 });
    expect(await repo.counts()).toEqual({ cases: 3, hearings: 3, audit: 3 });
  });
  it('rejects a file with duplicate case ids', async () => {
    const repo = new MemoryRepository();
    const data = mk(2);
    data.cases[1].id = data.cases[0].id;
    expect((await importCleanExport(repo, data, now)).status).toBe('failed');
    expect((await repo.counts()).cases).toBe(0);
  });
});

describe('repository rules', () => {
  it('commit is all-or-nothing', async () => {
    const repo = new MemoryRepository();
    const m = mk(2);
    await repo.commit({ insertAudit: [m.audit[0]] }); // no case needed for audit
    await expect(repo.commit({
      putCases: m.cases, putHearings: m.hearings, insertAudit: [m.audit[0]],
    })).rejects.toThrow();
    expect((await repo.counts()).cases).toBe(0);
    expect((await repo.counts()).hearings).toBe(0);
  });
  it('reschedule keeps the old date as history', async () => {
    const repo = new MemoryRepository();
    const data = mk(1);
    await importCleanExport(repo, data, now);
    const id = data.cases[0].id;
    const c = await rescheduleInRepo(repo, id, '2026-03-01', { proceedings: 'Evidence' }, now, 'me');
    expect(c.nextHearingDate).toBe('2026-03-01');
    const hs = await repo.getHearings(id);
    expect(hs.map(h => h.hearingDate + ':' + h.state)).toEqual(['2026-02-01:completed', '2026-03-01:scheduled']);
    expect((await repo.listAudit(id)).length).toBe(2);
  });
});

const REAL = 'C:/LD_backup/clean_export.json';
describe('real data', () => {
  it.skipIf(!fs.existsSync(REAL))('imports the real 35 cases', async () => {
    const data = JSON.parse(fs.readFileSync(REAL, 'utf8')) as CleanExport;
    const repo = new MemoryRepository();
    const out = await importCleanExport(repo, data, now);
    expect(out.status).toBe('imported');
    expect(await repo.counts()).toEqual({ cases: 35, hearings: 35, audit: 35 });
    expect((await importCleanExport(repo, data, now)).status).toBe('already-done');
  });
});
// end of importer.test.ts