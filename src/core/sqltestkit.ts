import { createRequire } from 'node:module';
import type { AuditEvent, CaseRecord, HearingRecord } from './types';
import type { SqlDriver, SqlStatement, SqlValue } from './sqlite';

// Test helpers only. Never imported by the app.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite');

export class NodeSqliteDriver implements SqlDriver {
  private db: any;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
  }
  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }
  async query<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(r => ({ ...r })) as T[];
  }
  async batch(statements: SqlStatement[]): Promise<void> {
    this.db.exec('BEGIN');
    try {
      for (const s of statements) this.db.prepare(s.sql).run(...(s.params ?? []));
      this.db.exec('COMMIT');
    } catch (e) {
      try { this.db.exec('ROLLBACK'); } catch { /* nothing to roll back */ }
      throw e;
    }
  }
  async close(): Promise<void> {
    this.db.close();
  }
}

export function mkCase(id: string, over: Record<string, unknown> = {}): CaseRecord {
  return {
    id, caseNumber: 'TEST-' + id, caseYear: '2026', caseType: 'Civil', caseTypeOriginal: 'civil',
    court: { name: 'Test Court' }, parties: { petitioner: 'A Kumar', respondent: 'B Singh' },
    legalSections: {}, status: 'Pending', priority: 'Normal', currentProceeding: '', notes: '',
    entryDate: '2026-11-01', entryDateSource: 'app', initialHearingDate: '2026-11-10',
    nextHearingDate: '2026-11-10', lastHearingDate: null, totalHearings: 0,
    createdAt: '2026-11-01T10:00:00+05:30', updatedAt: '2026-11-01T10:00:00+05:30',
    legacy: { sourceKey: 'app', raw: null },
    ...over,
  } as unknown as CaseRecord;
}

export function mkHearing(
  caseId: string, date: string, state: string = 'scheduled', over: Record<string, unknown> = {},
): HearingRecord {
  return {
    id: caseId + ':' + date, caseId, hearingDate: date, state,
    proceedings: '', courtOrder: '', notes: '', nextDateFixed: null, source: 'app',
    createdAt: '2026-11-01T10:00:00+05:30', updatedAt: '2026-11-01T10:00:00+05:30',
    ...over,
  } as unknown as HearingRecord;
}

export function mkAudit(
  id: string, caseId: string, at: string, over: Record<string, unknown> = {},
): AuditEvent {
  return { id, caseId, at, actor: 'tester', action: 'created', detail: '', ...over } as unknown as AuditEvent;
}
// end of sqltestkit.ts
