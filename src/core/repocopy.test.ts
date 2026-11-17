import { describe, it, expect } from 'vitest';
import { MemoryRepository } from './repository';
import { SqliteRepository } from './sqlite';
import { copyRepository } from './repocopy';
import { NodeSqliteDriver, mkAudit, mkCase, mkHearing } from './sqltestkit';

const KEYS = ['clients_v1', 'migration_v1', 'reminder_prefs_v1'];

async function filled(): Promise<MemoryRepository> {
  const r = new MemoryRepository();
  await r.commit({
    putCases: [mkCase('c1'), mkCase('c2')],
    putHearings: [
      mkHearing('c1', '2026-11-10', 'completed'),
      mkHearing('c1', '2026-11-20'),
      mkHearing('c2', '2026-11-12'),
    ],
    insertAudit: [
      mkAudit('a1', 'c1', '2026-11-01T10:00:00+05:30'),
      mkAudit('a2', 'c2', '2026-11-01T11:00:00+05:30'),
    ],
    setMeta: { clients_v1: '[]', migration_v1: 'done' },
  });
  return r;
}

describe('copyRepository', () => {
  it('copies everything into SQLite and checks it', async () => {
    const src = await filled();
    const d = new NodeSqliteDriver(':memory:');
    const dst = new SqliteRepository(d);
    const res = await copyRepository(src, dst, KEYS);
    expect(res.status).toBe('copied');
    expect(res.addedCases).toBe(2);
    expect(res.addedHearings).toBe(3);
    expect(res.addedAudit).toBe(2);
    expect(res.addedMeta).toBe(2);
    expect(await dst.counts()).toEqual(await src.counts());
    expect(await dst.listCases()).toEqual(await src.listCases());
    expect(await dst.getMeta('clients_v1')).toBe('[]');
    expect(await dst.getMeta('reminder_prefs_v1')).toBeNull();
    await d.close();
  });

  it('is safe to run twice', async () => {
    const src = await filled();
    const d = new NodeSqliteDriver(':memory:');
    const dst = new SqliteRepository(d);
    await copyRepository(src, dst, KEYS);
    const second = await copyRepository(src, dst, KEYS);
    expect(second.status).toBe('already-done');
    expect(await dst.counts()).toEqual({ cases: 2, hearings: 3, audit: 2 });
    await d.close();
  });

  it('never overwrites what is already in the new database', async () => {
    const src = await filled();
    const d = new NodeSqliteDriver(':memory:');
    const dst = new SqliteRepository(d);
    await dst.commit({ putCases: [mkCase('c1', { notes: 'edited here' })], setMeta: { clients_v1: '[1]' } });
    const res = await copyRepository(src, dst, KEYS);
    expect(res.status).toBe('copied');
    expect(res.addedCases).toBe(1);
    expect((await dst.getCase('c1'))?.notes).toBe('edited here');
    expect(await dst.getMeta('clients_v1')).toBe('[1]');
    expect((await dst.counts()).cases).toBe(2);
    await d.close();
  });

  it('does not change the source', async () => {
    const src = await filled();
    const before = await src.counts();
    const casesBefore = await src.listCases();
    await copyRepository(src, new MemoryRepository(), KEYS);
    expect(await src.counts()).toEqual(before);
    expect(await src.listCases()).toEqual(casesBefore);
  });

  it('reports a failure when the source cannot be read, and writes nothing', async () => {
    const src = await filled();
    src.listCases = async () => { throw new Error('boom'); };
    const dst = new MemoryRepository();
    const res = await copyRepository(src, dst, KEYS);
    expect(res.status).toBe('failed');
    expect(res.message).toContain('boom');
    expect(await dst.counts()).toEqual({ cases: 0, hearings: 0, audit: 0 });
  });

  it('reports a failure when the new database cannot save', async () => {
    const src = await filled();
    const dst = new MemoryRepository();
    dst.commit = async () => { throw new Error('disk full'); };
    const res = await copyRepository(src, dst, KEYS);
    expect(res.status).toBe('failed');
    expect(res.message).toContain('disk full');
    expect(await src.counts()).toEqual({ cases: 2, hearings: 3, audit: 2 });
  });

  it('says already-done when the source is empty', async () => {
    const res = await copyRepository(new MemoryRepository(), new MemoryRepository(), KEYS);
    expect(res.status).toBe('already-done');
  });
});
// end of repocopy.test.ts
