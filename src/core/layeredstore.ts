import type { FileStore } from './documents';

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Two places for document files: the main store (real files on the phone) and the legacy
 * store (the old WebView database). New files go only to main. An old file is found in
 * legacy, copied to main and checked, and the old copy is kept. Nothing is lost.
 */
export class LayeredFileStore implements FileStore {
  private readonly main: FileStore;
  private readonly legacy: FileStore;

  constructor(main: FileStore, legacy: FileStore) {
    this.main = main;
    this.legacy = legacy;
  }

  async put(id: string, bytes: Uint8Array): Promise<void> {
    await this.main.put(id, bytes);
  }

  async get(id: string): Promise<Uint8Array | null> {
    let mainErr: unknown = null;
    let m: Uint8Array | null = null;
    try {
      m = await this.main.get(id);
    } catch (e) {
      mainErr = e;
    }
    if (m) return m;
    let old: Uint8Array | null = null;
    try {
      old = await this.legacy.get(id);
    } catch {
      old = null;
    }
    if (!old) {
      if (mainErr !== null) throw mainErr;
      return null;
    }
    try {
      await this.main.put(id, old);
      const back = await this.main.get(id);
      if (!back || !sameBytes(back, old)) {
        try {
          await this.main.remove(id);
        } catch {
          // a bad copy that cannot be removed is ignored; the old copy is still returned
        }
      }
    } catch {
      // copying failed: the old bytes are still returned and the old copy is untouched
    }
    return old;
  }

  async remove(id: string): Promise<void> {
    let first: unknown = null;
    try {
      await this.main.remove(id);
    } catch (e) {
      first = e;
    }
    try {
      await this.legacy.remove(id);
    } catch (e) {
      if (first === null) first = e;
    }
    if (first !== null) throw first;
  }

  async has(id: string): Promise<boolean> {
    try {
      if (await this.main.has(id)) return true;
    } catch {
      // fall through to the legacy store
    }
    try {
      return await this.legacy.has(id);
    } catch {
      return false;
    }
  }
}
// end of layeredstore.ts
