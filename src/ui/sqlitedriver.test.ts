import { describe, it, expect } from 'vitest';
import { PluginDriver, type PluginConn } from './sqlitedriver';

interface Log {
  opened: number;
  closed: number;
  open: boolean;
  failOpen: boolean;
  executed: { sql: string; tx: boolean | undefined }[];
  sets: { set: { statement?: string; values?: unknown[] }[]; tx: boolean | undefined }[];
}

function fakeConn(rows?: unknown[]): { conn: PluginConn; log: Log } {
  const log: Log = { opened: 0, closed: 0, open: false, failOpen: false, executed: [], sets: [] };
  const conn: PluginConn = {
    async open() {
      log.opened++;
      if (log.failOpen) throw new Error('cannot open');
      log.open = true;
    },
    async close() {
      log.closed++;
      log.open = false;
    },
    async isDBOpen() {
      return { result: log.open };
    },
    async execute(sql, tx) {
      log.executed.push({ sql, tx });
      return {};
    },
    async query() {
      return rows === undefined ? {} : { values: rows };
    },
    async executeSet(set, tx) {
      log.sets.push({ set, tx });
      return {};
    },
  };
  return { conn, log };
}

describe('PluginDriver', () => {
  it('opens the database once and runs statements', async () => {
    const { conn, log } = fakeConn();
    const d = new PluginDriver(conn);
    await d.exec('A');
    await d.exec('B');
    expect(log.opened).toBe(1);
    expect(log.executed.map(e => e.sql)).toEqual(['A', 'B']);
    expect(log.executed.every(e => e.tx === true)).toBe(true);
  });

  it('does not open again when the database is already open', async () => {
    const { conn, log } = fakeConn();
    log.open = true;
    const d = new PluginDriver(conn);
    await d.exec('A');
    expect(log.opened).toBe(0);
  });

  it('returns rows and drops a column-name row', async () => {
    const { conn } = fakeConn([{ ios_columns: ['a'] }, { a: 1 }, { a: 2 }]);
    const d = new PluginDriver(conn);
    const rows = await d.query<{ a: number }>('SELECT a FROM t');
    expect(rows).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('returns an empty list when there are no values', async () => {
    const { conn } = fakeConn();
    const d = new PluginDriver(conn);
    expect(await d.query('SELECT 1')).toEqual([]);
  });

  it('sends a batch as one transaction with parameters', async () => {
    const { conn, log } = fakeConn();
    const d = new PluginDriver(conn);
    await d.batch([
      { sql: 'INSERT 1', params: ['x', 2, null] },
      { sql: 'INSERT 2' },
    ]);
    expect(log.sets.length).toBe(1);
    const first = log.sets[0];
    expect(first?.tx).toBe(true);
    expect(first?.set).toEqual([
      { statement: 'INSERT 1', values: ['x', 2, null] },
      { statement: 'INSERT 2', values: [] },
    ]);
  });

  it('does nothing for an empty batch', async () => {
    const { conn, log } = fakeConn();
    const d = new PluginDriver(conn);
    await d.batch([]);
    expect(log.sets.length).toBe(0);
    expect(log.opened).toBe(0);
  });

  it('can try again after a failed open', async () => {
    const { conn, log } = fakeConn();
    log.failOpen = true;
    const d = new PluginDriver(conn);
    await expect(d.exec('A')).rejects.toThrow('cannot open');
    log.failOpen = false;
    await d.exec('A');
    expect(log.opened).toBe(2);
    expect(log.executed.length).toBe(1);
  });

  it('closes only a database that was opened', async () => {
    const a = fakeConn();
    await new PluginDriver(a.conn).close();
    expect(a.log.closed).toBe(0);
    const b = fakeConn();
    const d = new PluginDriver(b.conn);
    await d.exec('A');
    await d.close();
    expect(b.log.closed).toBe(1);
  });
});
// end of sqlitedriver.test.ts
