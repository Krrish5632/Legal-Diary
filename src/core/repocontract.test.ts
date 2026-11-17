import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { MemoryRepository } from './repository';
import type { Repository } from './repository';
import { IndexedDbRepository } from './indexeddb';
import { SqliteRepository } from './sqlite';
import { NodeSqliteDriver, mkAudit, mkCase, mkHearing } from './sqltestkit';

interface Ctx { repo: Repository; done: () => Promise<void> }
let counter = 0;

const makers: Record<string, () => Ctx> = {
  memory: () => ({ repo: new MemoryRepository(), done: async () => undefined }),
  indexeddb: () => {
    counter += 1;
    const r = new IndexedDbRepository('contract_' + counter, new IDBFactory());
    return { repo: r, done: () => r.close() };
  },
  sqlite: () => {
    const d = new NodeSqliteDriver(':memory:');
    return { repo: new SqliteRepository(d), done: () => d.close() };
  },
};

for (const [name, make] of Object.entries(makers)) {
  describe('repository contract: ' + name, () => {
    let ctx: Ctx;
    beforeEach(() => { ctx = make(); });
    afterEach(async () => { await ctx.done(); });

    it('starts empty', async () => {
      expect(await ctx.repo.counts()).toEqual({ cases: 0, hearings: 0, audit: 0 });
      expect(await ctx.repo.getCase('x')).toBeNull();
      expect(await ctx.repo.getMeta('k')).toBeNull();
    });

    it('stores and reads back cases, hearings, audit and settings', async () => {
      const c1 = mkCase('c1');
      const c2 = mkCase('c2');
      await ctx.repo.commit({
        putCases: [c1, c2],
        putHearings: [mkHearing('c1', '2026-11-10'), mkHearing('c1', '2026-11-05'), mkHearing('c2', '2026-11-12')],
        insertAudit: [
          mkAudit('a2', 'c1', '2026-11-01T11:00:00+05:30'),
          mkAudit('a1', 'c1', '2026-11-01T10:00:00+05:30'),
          mkAudit('a3', 'c2', '2026-11-01T12:00:00+05:30'),
        ],
        setMeta: { k: 'v' },
      });
      expect(await ctx.repo.counts()).toEqual({ cases: 2, hearings: 3, audit: 3 });
      expect(await ctx.repo.getCase('c1')).toEqual(c1);
      expect((await ctx.repo.listCases()).map(c => c.id).sort()).toEqual(['c1', 'c2']);
      expect((await ctx.repo.listHearings()).length).toBe(3);
      expect((await ctx.repo.getHearings('c1')).map(h => h.hearingDate)).toEqual(['2026-11-05', '2026-11-10']);
      expect((await ctx.repo.listAudit('c1')).map(a => a.id)).toEqual(['a1', 'a2']);
      expect((await ctx.repo.listAudit()).length).toBe(3);
      expect(await ctx.repo.getMeta('k')).toBe('v');
    });

    it('refuses a hearing for a missing case and saves nothing from that change', async () => {
      await expect(ctx.repo.commit({
        putCases: [mkCase('c1')],
        putHearings: [mkHearing('nope', '2026-11-10')],
      })).rejects.toThrow();
      expect(await ctx.repo.counts()).toEqual({ cases: 0, hearings: 0, audit: 0 });
    });

    it('rolls back the whole change when an audit id already exists', async () => {
      await ctx.repo.commit({
        putCases: [mkCase('c1')],
        insertAudit: [mkAudit('a1', 'c1', '2026-11-01T10:00:00+05:30')],
      });
      await expect(ctx.repo.commit({
        putCases: [mkCase('c2')],
        insertAudit: [mkAudit('a1', 'c2', '2026-11-02T10:00:00+05:30')],
      })).rejects.toThrow();
      expect(await ctx.repo.getCase('c2')).toBeNull();
      expect((await ctx.repo.counts()).cases).toBe(1);
    });

    it('refuses the same audit id twice inside one change', async () => {
      const a = mkAudit('a1', 'c1', '2026-11-01T10:00:00+05:30');
      await expect(ctx.repo.commit({ putCases: [mkCase('c1')], insertAudit: [a, a] })).rejects.toThrow();
      expect(await ctx.repo.counts()).toEqual({ cases: 0, hearings: 0, audit: 0 });
    });

    it('does not let a completed hearing become scheduled again', async () => {
      await ctx.repo.commit({
        putCases: [mkCase('c1')],
        putHearings: [mkHearing('c1', '2026-11-10', 'completed')],
      });
      await expect(ctx.repo.commit({
        putHearings: [mkHearing('c1', '2026-11-10', 'scheduled')],
      })).rejects.toThrow();
      const hs = await ctx.repo.getHearings('c1');
      expect(hs.length).toBe(1);
      expect(hs[0]?.state).toBe('completed');
    });

    it('allows scheduled to completed, and notes on a completed hearing', async () => {
      await ctx.repo.commit({ putCases: [mkCase('c1')], putHearings: [mkHearing('c1', '2026-11-10')] });
      await ctx.repo.commit({ putHearings: [mkHearing('c1', '2026-11-10', 'completed', { proceedings: 'Heard' })] });
      await ctx.repo.commit({
        putHearings: [mkHearing('c1', '2026-11-10', 'completed', { proceedings: 'Heard', notes: 'later note' })],
      });
      const hs = await ctx.repo.getHearings('c1');
      expect(hs.length).toBe(1);
      expect(hs[0]?.state).toBe('completed');
      expect(hs[0]?.notes).toBe('later note');
    });

    it('refuses a hearing with a wrong id', async () => {
      const bad = { ...mkHearing('c1', '2026-11-10'), id: 'wrong' };
      await expect(ctx.repo.commit({ putCases: [mkCase('c1')], putHearings: [bad] })).rejects.toThrow();
      expect((await ctx.repo.counts()).cases).toBe(0);
    });

    it('overwrites a setting with the same key', async () => {
      await ctx.repo.commit({ setMeta: { k: 'one' } });
      await ctx.repo.commit({ setMeta: { k: 'two' } });
      expect(await ctx.repo.getMeta('k')).toBe('two');
    });

    it('keeps Hindi and other non-English text exactly', async () => {
      const text = '\u0938\u0941\u0928\u0935\u093e\u0908 \u2013 caf\u00e9 "quoted"';
      const c = mkCase('c1', { notes: text, parties: { petitioner: text } });
      await ctx.repo.commit({ putCases: [c] });
      const back = await ctx.repo.getCase('c1');
      expect(back?.notes).toBe(text);
      expect(back).toEqual(c);
    });

    it('updating a case keeps the count the same', async () => {
      await ctx.repo.commit({ putCases: [mkCase('c1')] });
      await ctx.repo.commit({ putCases: [mkCase('c1', { notes: 'changed' })] });
      expect((await ctx.repo.counts()).cases).toBe(1);
      expect((await ctx.repo.getCase('c1'))?.notes).toBe('changed');
    });
  });
}
// end of repocontract.test.ts
