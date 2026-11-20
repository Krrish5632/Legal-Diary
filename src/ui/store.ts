import { Capacitor } from '@capacitor/core';
import { IndexedDbRepository } from '../core/indexeddb';
import { SqliteRepository } from '../core/sqlite';
import type { Change, Counts, Repository } from '../core/repository';
import type { AuditEvent, CaseRecord, HearingRecord } from '../core/types';
import { openPhoneDriver } from './sqlitedriver';

const DB_NAME = 'legal_diary_pro';

/** Tells which database is in use (phone = SQLite, browser = IndexedDB). */
export function storageKind(): string {
  return Capacitor.isNativePlatform() ? 'SQLite (phone database)' : 'IndexedDB (browser)';
}

/**
 * Picks the database the first time it is needed.
 * Phone: SQLite. If it cannot open, the error is shown (no silent fallback,
 * because a fallback database would be out of date).
 * A failed open is not remembered, so the next call tries again.
 */
class ChosenRepository implements Repository {
  private pick: Promise<Repository> | null = null;

  private open(): Promise<Repository> {
    if (this.pick) return this.pick;
    const p: Promise<Repository> = Capacitor.isNativePlatform()
      ? openPhoneDriver(DB_NAME).then(d => new SqliteRepository(d))
      : Promise.resolve(new IndexedDbRepository(DB_NAME));
    this.pick = p;
    p.catch(() => { if (this.pick === p) this.pick = null; });
    return p;
  }

  async counts(): Promise<Counts> { return (await this.open()).counts(); }
  async getCase(id: string): Promise<CaseRecord | null> { return (await this.open()).getCase(id); }
  async listCases(): Promise<CaseRecord[]> { return (await this.open()).listCases(); }
  async listHearings(): Promise<HearingRecord[]> { return (await this.open()).listHearings(); }
  async getHearings(caseId: string): Promise<HearingRecord[]> {
    return (await this.open()).getHearings(caseId);
  }
  async listAudit(caseId?: string): Promise<AuditEvent[]> {
    return (await this.open()).listAudit(caseId);
  }
  async getMeta(key: string): Promise<string | null> { return (await this.open()).getMeta(key); }
  async commit(change: Change): Promise<void> { await (await this.open()).commit(change); }
}

/** The one database used by all screens. */
export const repo: Repository = new ChosenRepository();
// end of store.ts
