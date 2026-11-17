import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SqliteRepository } from './sqlite';
import { NodeSqliteDriver, mkAudit, mkCase, mkHearing } from './sqltestkit';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ldsql-'));
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('SqliteRepository', () => {
  it('keeps the data after the database is closed and opened again', async () => {
    const file = path.join(dir, 'a.db');
    const d1 = new NodeSqliteDriver(file);
    const r1 = new SqliteRepository(d1);
    await r1.commit({
      putCases: [mkCase('c1')],
      putHearings: [mkHearing('c1', '2026-11-10')],
      insertAudit: [mkAudit('a1', 'c1', '2026-11-01T10:00:00+05:30')],
      setMeta: { k: 'v' },
    });
    await d1.close();

    const d2 = new NodeSqliteDriver(file);
    const r2 = new SqliteRepository(d2);
    expect(await r2.counts()).toEqual({ cases: 1, hearings: 1, audit: 1 });
    expect((await r2.getCase('c1'))?.caseNumber).toBe('TEST-c1');
    expect(await r2.getMeta('k')).toBe('v');
    await d2.close();
  });

  it('refuses a database made by a newer version', async () => {
    const file = path.join(dir, 'b.db');
    const d = new NodeSqliteDriver(file);
    const r = new SqliteRepository(d);
    await r.counts();
    await d.exec("INSERT OR REPLACE INTO meta (meta_key, meta_value) VALUES ('schema_version', '99')");
    const r2 = new SqliteRepository(d);
    await expect(r2.counts()).rejects.toThrow(/newer/);
    await d.close();
  });

  it('saves several commits started at the same time, one after another', async () => {
    const d = new NodeSqliteDriver(':memory:');
    const r = new SqliteRepository(d);
    await Promise.all([1, 2, 3, 4, 5].map(i => r.commit({
      putCases: [mkCase('p' + i)],
      insertAudit: [mkAudit('pa' + i, 'p' + i, '2026-11-01T10:0' + i + ':00+05:30')],
    })));
    expect(await r.counts()).toEqual({ cases: 5, hearings: 0, audit: 5 });
    await d.close();
  });

  it('the database layer rolls everything back when one statement fails', async () => {
    const d = new NodeSqliteDriver(':memory:');
    await d.exec('CREATE TABLE t (id TEXT PRIMARY KEY)');
    await expect(d.batch([
      { sql: 'INSERT INTO t (id) VALUES (?)', params: ['a'] },
      { sql: 'INSERT INTO t (id) VALUES (?)', params: ['a'] },
    ])).rejects.toThrow();
    expect(await d.query('SELECT id FROM t')).toHaveLength(0);
    await d.close();
  });
});
// end of sqlite.test.ts
