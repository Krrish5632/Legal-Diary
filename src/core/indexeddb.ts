import type { Change, Counts, Repository } from './repository';
import type { AuditEvent, CaseRecord, HearingRecord } from './types';

const DB_VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('Database request failed'));
  });
}

/** Browser / phone-WebView database. Same rules as MemoryRepository. */
export class IndexedDbRepository implements Repository {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private readonly name: string;
  private readonly factory: IDBFactory | undefined;

  constructor(name: string = 'legal_diary_pro', factory?: IDBFactory) {
    this.name = name;
    this.factory = factory;
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    const f = this.factory ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
    if (!f) return Promise.reject(new Error('This device cannot store data (IndexedDB missing)'));
    const p = new Promise<IDBDatabase>((resolve, reject) => {
      const r = f.open(this.name, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        db.createObjectStore('cases', { keyPath: 'id' });
        const h = db.createObjectStore('hearings', { keyPath: 'id' });
        h.createIndex('caseId', 'caseId');
        const a = db.createObjectStore('audit', { keyPath: 'id' });
        a.createIndex('caseId', 'caseId');
        db.createObjectStore('meta', { keyPath: 'key' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error ?? new Error('Could not open the database'));
      r.onblocked = () => reject(new Error('Database is blocked by another window'));
    });
    p.catch(() => { this.dbPromise = null; });
    this.dbPromise = p;
    return p;
  }

  async close(): Promise<void> {
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    db.close();
    this.dbPromise = null;
  }

  private async readAll<T>(store: string, index?: string, key?: string): Promise<T[]> {
    const db = await this.open();
    const tx = db.transaction(store, 'readonly');
    const os = tx.objectStore(store);
    const src = index ? os.index(index) : os;
    return (await req(key === undefined ? src.getAll() : src.getAll(key))) as T[];
  }

  async counts(): Promise<Counts> {
    const db = await this.open();
    const tx = db.transaction(['cases', 'hearings', 'audit'], 'readonly');
    const [cases, hearings, audit] = await Promise.all([
      req(tx.objectStore('cases').count()),
      req(tx.objectStore('hearings').count()),
      req(tx.objectStore('audit').count()),
    ]);
    return { cases, hearings, audit };
  }

  async getCase(id: string): Promise<CaseRecord | null> {
    const db = await this.open();
    const tx = db.transaction('cases', 'readonly');
    const c = (await req(tx.objectStore('cases').get(id))) as CaseRecord | undefined;
    return c ?? null;
  }

  listCases(): Promise<CaseRecord[]> { return this.readAll<CaseRecord>('cases'); }
  listHearings(): Promise<HearingRecord[]> { return this.readAll<HearingRecord>('hearings'); }

  async getHearings(caseId: string): Promise<HearingRecord[]> {
    const list = await this.readAll<HearingRecord>('hearings', 'caseId', caseId);
    return list.sort((a, b) => a.hearingDate.localeCompare(b.hearingDate));
  }

  async listAudit(caseId?: string): Promise<AuditEvent[]> {
    const list = caseId === undefined
      ? await this.readAll<AuditEvent>('audit')
      : await this.readAll<AuditEvent>('audit', 'caseId', caseId);
    return list.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }

  async getMeta(key: string): Promise<string | null> {
    const db = await this.open();
    const tx = db.transaction('meta', 'readonly');
    const r = (await req(tx.objectStore('meta').get(key))) as { key: string; value: string } | undefined;
    return r ? r.value : null;
  }

  /** One transaction: everything is saved, or (on any error) nothing is saved. */
  async commit(ch: Change): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(['cases', 'hearings', 'audit', 'meta'], 'readwrite');
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Database write failed'));
      tx.onabort = () => reject(tx.error ?? new Error('Database write was cancelled'));
    });
    done.catch(() => undefined);
    try {
      const cases = tx.objectStore('cases');
      const hearings = tx.objectStore('hearings');
      const audit = tx.objectStore('audit');
      const meta = tx.objectStore('meta');

      for (const c of ch.putCases ?? []) await req(cases.put(c));

      for (const h of ch.putHearings ?? []) {
        if (h.id !== `${h.caseId}:${h.hearingDate}`) throw new Error('Bad hearing id');
        const caseKey = await req(cases.getKey(h.caseId));
        if (caseKey === undefined) throw new Error('Hearing refers to a missing case');
        const old = (await req(hearings.get(h.id))) as HearingRecord | undefined;
        if (old && old.state === 'completed' && h.state === 'scheduled')
          throw new Error('A completed hearing cannot become scheduled again');
        await req(hearings.put(h));
      }

      for (const a of ch.insertAudit ?? []) {
        const exists = await req(audit.getKey(a.id));
        if (exists !== undefined) throw new Error('Audit entry already exists: ' + a.id);
        await req(audit.add(a));
      }

      for (const [k, v] of Object.entries(ch.setMeta ?? {})) await req(meta.put({ key: k, value: v }));
    } catch (e) {
      try { tx.abort(); } catch { /* already finished */ }
      throw e;
    }
    await done;
  }
}
// end of indexeddb.ts
