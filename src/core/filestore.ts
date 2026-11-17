import type { FileStore } from './documents';

export class MemoryFileStore implements FileStore {
  private readonly m = new Map<string, Uint8Array>();

  async put(id: string, bytes: Uint8Array): Promise<void> {
    this.m.set(id, bytes.slice());
  }
  async get(id: string): Promise<Uint8Array | null> {
    const b = this.m.get(id);
    return b ? b.slice() : null;
  }
  async remove(id: string): Promise<void> {
    this.m.delete(id);
  }
  async has(id: string): Promise<boolean> {
    return this.m.has(id);
  }
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('File store request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('File store write failed'));
    tx.onabort = () => reject(tx.error ?? new Error('File store write was cancelled'));
  });
}

/** Browser / WebView file storage. Separate database from the case data. */
export class IndexedDbFileStore implements FileStore {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private readonly name: string;
  private readonly factory: IDBFactory | undefined;

  constructor(name: string = 'legal_diary_pro_files', factory?: IDBFactory) {
    this.name = name;
    this.factory = factory;
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    const f = this.factory ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
    if (!f) return Promise.reject(new Error('This device cannot store files (IndexedDB missing)'));
    const p = new Promise<IDBDatabase>((resolve, reject) => {
      const r = f.open(this.name, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('files');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error ?? new Error('Could not open the file store'));
      r.onblocked = () => reject(new Error('File store is blocked by another window'));
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

  async put(id: string, bytes: Uint8Array): Promise<void> {
    const db = await this.open();
    const tx = db.transaction('files', 'readwrite');
    const finished = txDone(tx);
    tx.objectStore('files').put(bytes.slice().buffer, id);
    await finished;
  }

  async get(id: string): Promise<Uint8Array | null> {
    const db = await this.open();
    const tx = db.transaction('files', 'readonly');
    const r = (await req(tx.objectStore('files').get(id))) as ArrayBuffer | undefined;
    return r ? new Uint8Array(r) : null;
  }

  async remove(id: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction('files', 'readwrite');
    const finished = txDone(tx);
    tx.objectStore('files').delete(id);
    await finished;
  }

  async has(id: string): Promise<boolean> {
    const db = await this.open();
    const tx = db.transaction('files', 'readonly');
    const k = await req(tx.objectStore('files').getKey(id));
    return k !== undefined;
  }
}
// end of filestore.ts
