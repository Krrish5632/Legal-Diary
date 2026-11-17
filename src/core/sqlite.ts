import type { Change, Counts, Repository } from './repository';
import type { AuditEvent, CaseRecord, HearingRecord } from './types';

export type SqlValue = string | number | null;
export interface SqlStatement { sql: string; params?: SqlValue[] }

/**
 * The only thing SqliteRepository needs from a database.
 * On the phone this is the Capacitor SQLite plugin (added later).
 * In tests on the PC it is the SQLite that ships with Node.
 */
export interface SqlDriver {
  /** Run one statement without parameters (used for creating tables). */
  exec(sql: string): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Run all statements in one transaction: all are saved, or none. */
  batch(statements: SqlStatement[]): Promise<void>;
  close(): Promise<void>;
}

export const SQL_SCHEMA_VERSION = 1;

// One statement per entry. No triggers, no semicolons inside a statement.
export const SCHEMA_STATEMENTS: string[] = [
  'CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, next_hearing_date TEXT, status TEXT, priority TEXT, updated_at TEXT)',
  'CREATE TABLE IF NOT EXISTS hearings (id TEXT PRIMARY KEY NOT NULL, case_id TEXT NOT NULL, hearing_date TEXT NOT NULL, state TEXT NOT NULL, data TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY NOT NULL, case_id TEXT NOT NULL, at TEXT NOT NULL, data TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS meta (meta_key TEXT PRIMARY KEY NOT NULL, meta_value TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_cases_next ON cases (next_hearing_date)',
  'CREATE INDEX IF NOT EXISTS idx_hearings_case ON hearings (case_id, hearing_date)',
  'CREATE INDEX IF NOT EXISTS idx_hearings_date ON hearings (hearing_date)',
  'CREATE INDEX IF NOT EXISTS idx_audit_case ON audit (case_id, at)',
  "INSERT OR IGNORE INTO meta (meta_key, meta_value) VALUES ('schema_version', '1')",
];

function decode<T>(text: unknown, what: string): T {
  try {
    return JSON.parse(String(text)) as T;
  } catch {
    throw new Error('A stored ' + what + ' is damaged and cannot be read');
  }
}

/** Phone database. Same rules as MemoryRepository and IndexedDbRepository. */
export class SqliteRepository implements Repository {
  private readonly db: SqlDriver;
  private ready: Promise<void> | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(db: SqlDriver) {
    this.db = db;
  }

  private async init(): Promise<void> {
    for (const s of SCHEMA_STATEMENTS) await this.db.exec(s);
    const rows = await this.db.query<{ meta_value: string }>(
      'SELECT meta_value FROM meta WHERE meta_key = ?', ['schema_version']);
    const first = rows[0];
    const v = first ? Number(first.meta_value) : NaN;
    if (!Number.isFinite(v)) throw new Error('The database version could not be read');
    if (v > SQL_SCHEMA_VERSION) throw new Error('This database was made by a newer version of the app');
  }

  private ensure(): Promise<void> {
    let p = this.ready;
    if (!p) {
      p = this.init();
      p.catch(() => { this.ready = null; });
      this.ready = p;
    }
    return p;
  }

  /** Commits run one after another, never at the same time. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn);
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  private async has(table: 'cases' | 'audit', id: string): Promise<boolean> {
    const r = await this.db.query('SELECT 1 AS x FROM ' + table + ' WHERE id = ?', [id]);
    return r.length > 0;
  }

  async close(): Promise<void> {
    this.ready = null;
    await this.db.close();
  }

  async counts(): Promise<Counts> {
    await this.ensure();
    const rows = await this.db.query<{ cases: number; hearings: number; audit: number }>(
      'SELECT (SELECT COUNT(*) FROM cases) AS cases, (SELECT COUNT(*) FROM hearings) AS hearings, (SELECT COUNT(*) FROM audit) AS audit');
    const r = rows[0];
    if (!r) throw new Error('Could not count the records');
    return { cases: Number(r.cases), hearings: Number(r.hearings), audit: Number(r.audit) };
  }

  async getCase(id: string): Promise<CaseRecord | null> {
    await this.ensure();
    const rows = await this.db.query<{ data: string }>('SELECT data FROM cases WHERE id = ?', [id]);
    const first = rows[0];
    return first ? decode<CaseRecord>(first.data, 'case') : null;
  }

  async listCases(): Promise<CaseRecord[]> {
    await this.ensure();
    const rows = await this.db.query<{ data: string }>('SELECT data FROM cases ORDER BY id');
    return rows.map(r => decode<CaseRecord>(r.data, 'case'));
  }

  async listHearings(): Promise<HearingRecord[]> {
    await this.ensure();
    const rows = await this.db.query<{ data: string }>('SELECT data FROM hearings ORDER BY id');
    return rows.map(r => decode<HearingRecord>(r.data, 'hearing'));
  }

  async getHearings(caseId: string): Promise<HearingRecord[]> {
    await this.ensure();
    const rows = await this.db.query<{ data: string }>(
      'SELECT data FROM hearings WHERE case_id = ? ORDER BY hearing_date', [caseId]);
    return rows.map(r => decode<HearingRecord>(r.data, 'hearing'));
  }

  async listAudit(caseId?: string): Promise<AuditEvent[]> {
    await this.ensure();
    const rows = caseId === undefined
      ? await this.db.query<{ data: string }>('SELECT data FROM audit')
      : await this.db.query<{ data: string }>('SELECT data FROM audit WHERE case_id = ?', [caseId]);
    const list = rows.map(r => decode<AuditEvent>(r.data, 'audit entry'));
    return list.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }

  async getMeta(key: string): Promise<string | null> {
    await this.ensure();
    const rows = await this.db.query<{ meta_value: string }>(
      'SELECT meta_value FROM meta WHERE meta_key = ?', [key]);
    const first = rows[0];
    return first ? String(first.meta_value) : null;
  }

  /** Checks everything first, then writes in ONE transaction: all saved, or nothing. */
  async commit(ch: Change): Promise<void> {
    await this.ensure();
    await this.serial(async () => {
      const putCases = ch.putCases ?? [];
      const putHearings = ch.putHearings ?? [];
      const insertAudit = ch.insertAudit ?? [];
      const metaEntries = Object.entries(ch.setMeta ?? {});

      const newCaseIds = new Set<string>();
      for (const c of putCases) newCaseIds.add(c.id);

      const states = new Map<string, string>();
      for (const h of putHearings) {
        if (h.id !== h.caseId + ':' + h.hearingDate) throw new Error('Bad hearing id');
        if (!newCaseIds.has(h.caseId) && !(await this.has('cases', h.caseId)))
          throw new Error('Hearing refers to a missing case');
        let oldState = states.get(h.id);
        if (oldState === undefined) {
          const r = await this.db.query<{ state: string }>('SELECT state FROM hearings WHERE id = ?', [h.id]);
          const first = r[0];
          oldState = first ? String(first.state) : undefined;
        }
        if (oldState === 'completed' && h.state === 'scheduled')
          throw new Error('A completed hearing cannot become scheduled again');
        states.set(h.id, h.state);
      }

      const seen = new Set<string>();
      for (const a of insertAudit) {
        if (seen.has(a.id) || (await this.has('audit', a.id)))
          throw new Error('Audit entry already exists: ' + a.id);
        seen.add(a.id);
      }

      const stmts: SqlStatement[] = [];
      for (const c of putCases) {
        stmts.push({
          sql: 'INSERT OR REPLACE INTO cases (id, data, next_hearing_date, status, priority, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          params: [c.id, JSON.stringify(c), c.nextHearingDate ?? null, c.status ?? null, c.priority ?? null, c.updatedAt ?? null],
        });
      }
      for (const h of putHearings) {
        stmts.push({
          sql: 'INSERT OR REPLACE INTO hearings (id, case_id, hearing_date, state, data) VALUES (?, ?, ?, ?, ?)',
          params: [h.id, h.caseId, h.hearingDate, h.state, JSON.stringify(h)],
        });
      }
      for (const a of insertAudit) {
        stmts.push({
          sql: 'INSERT INTO audit (id, case_id, at, data) VALUES (?, ?, ?, ?)',
          params: [a.id, a.caseId, a.at, JSON.stringify(a)],
        });
      }
      for (const [k, v] of metaEntries) {
        stmts.push({
          sql: 'INSERT OR REPLACE INTO meta (meta_key, meta_value) VALUES (?, ?)',
          params: [k, v],
        });
      }
      if (stmts.length > 0) await this.db.batch(stmts);
    });
  }
}
// end of sqlite.ts
