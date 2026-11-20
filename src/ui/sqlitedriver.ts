import type { SqlDriver, SqlStatement, SqlValue } from '../core/sqlite';

/** The small part of the plugin's connection that we use. */
export interface PluginConn {
  open(): Promise<void>;
  close(): Promise<void>;
  isDBOpen(): Promise<{ result?: boolean }>;
  execute(statements: string, transaction?: boolean): Promise<unknown>;
  query(statement: string, values?: unknown[]): Promise<{ values?: unknown[] }>;
  executeSet(
    set: { statement?: string; values?: unknown[] }[],
    transaction?: boolean,
  ): Promise<unknown>;
}

/** Connects SqliteRepository to the phone database (Capacitor SQLite plugin). */
export class PluginDriver implements SqlDriver {
  private readonly conn: PluginConn;
  private opening: Promise<void> | null = null;

  constructor(conn: PluginConn) {
    this.conn = conn;
  }

  private async openNow(): Promise<void> {
    const st = await this.conn.isDBOpen();
    if (st.result !== true) await this.conn.open();
  }

  private ensureOpen(): Promise<void> {
    let p = this.opening;
    if (!p) {
      p = this.openNow();
      p.catch(() => { this.opening = null; });
      this.opening = p;
    }
    return p;
  }

  async exec(sql: string): Promise<void> {
    await this.ensureOpen();
    await this.conn.execute(sql, true);
  }

  async query<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]> {
    await this.ensureOpen();
    const r = await this.conn.query(sql, params ?? []);
    const values = r.values ?? [];
    // Some platforms put a column-name row first. It is not data.
    const rows = values.filter(v => !(typeof v === 'object' && v !== null && 'ios_columns' in v));
    return rows as T[];
  }

  /** All statements are saved together, or none of them. */
  async batch(statements: SqlStatement[]): Promise<void> {
    if (statements.length === 0) return;
    await this.ensureOpen();
    await this.conn.executeSet(
      statements.map(s => ({ statement: s.sql, values: s.params ?? [] })),
      true,
    );
  }

  async close(): Promise<void> {
    const p = this.opening;
    this.opening = null;
    if (!p) return;
    try {
      await p;
    } catch {
      return;
    }
    await this.conn.close();
  }
}

/**
 * Opens the phone database. The plugin is loaded only here, so the browser
 * version never loads it. Not used by any screen yet.
 */
export async function openPhoneDriver(dbName: string): Promise<SqlDriver> {
  const plugin = await import('@capacitor-community/sqlite');
  const sqlite = new plugin.SQLiteConnection(plugin.CapacitorSQLite);
  try {
    await sqlite.checkConnectionsConsistency();
  } catch {
    // nothing stale to clean up
  }
  const has = await sqlite.isConnection(dbName, false);
  const conn = has.result === true
    ? await sqlite.retrieveConnection(dbName, false)
    : await sqlite.createConnection(dbName, false, 'no-encryption', 1, false);
  return new PluginDriver(conn);
}
// end of sqlitedriver.ts
