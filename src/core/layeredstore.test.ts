import { describe, expect, it } from 'vitest';
import { MemoryFileStore } from './filestore';
import { LayeredFileStore } from './layeredstore';
import type { FileStore } from './documents';

const b = (...n: number[]): Uint8Array => Uint8Array.from(n);
const arr = (x: Uint8Array | null): number[] | null => (x ? Array.from(x) : null);

// A main store that damages every file it saves.
class CorruptStore implements FileStore {
  private readonly m = new Map<string, Uint8Array>();
  async put(id: string, bytes: Uint8Array): Promise<void> {
    const c = bytes.slice();
    c[0] = c[0] ^ 1;
    this.m.set(id, c);
  }
  async get(id: string): Promise<Uint8Array | null> {
    const x = this.m.get(id);
    return x ? x.slice() : null;
  }
  async remove(id: string): Promise<void> {
    this.m.delete(id);
  }
  async has(id: string): Promise<boolean> {
    return this.m.has(id);
  }
}

describe('LayeredFileStore', () => {
  it('writes new files only to the main store', async () => {
    const main = new MemoryFileStore();
    const legacy = new MemoryFileStore();
    const s = new LayeredFileStore(main, legacy);
    await s.put('d1', b(1, 2, 3));
    expect(await main.has('d1')).toBe(true);
    expect(await legacy.has('d1')).toBe(false);
  });

  it('reads from the main store first', async () => {
    const main = new MemoryFileStore();
    const legacy = new MemoryFileStore();
    await main.put('d1', b(1, 1));
    await legacy.put('d1', b(9, 9));
    const s = new LayeredFileStore(main, legacy);
    expect(arr(await s.get('d1'))).toEqual([1, 1]);
  });

  it('finds an old file in the legacy store, copies it to main and keeps the old copy', async () => {
    const main = new MemoryFileStore();
    const legacy = new MemoryFileStore();
    await legacy.put('d1', b(5, 6, 7));
    const s = new LayeredFileStore(main, legacy);
    expect(arr(await s.get('d1'))).toEqual([5, 6, 7]);
    expect(arr(await main.get('d1'))).toEqual([5, 6, 7]);
    expect(arr(await legacy.get('d1'))).toEqual([5, 6, 7]);
  });

  it('returns null when the file is nowhere', async () => {
    const s = new LayeredFileStore(new MemoryFileStore(), new MemoryFileStore());
    expect(await s.get('none')).toBeNull();
  });

  it('removes from both stores', async () => {
    const main = new MemoryFileStore();
    const legacy = new MemoryFileStore();
    await main.put('d1', b(1));
    await legacy.put('d1', b(1));
    const s = new LayeredFileStore(main, legacy);
    await s.remove('d1');
    expect(await main.has('d1')).toBe(false);
    expect(await legacy.has('d1')).toBe(false);
  });

  it('has() is true when the file is in either store', async () => {
    const main = new MemoryFileStore();
    const legacy = new MemoryFileStore();
    await legacy.put('old', b(1));
    await main.put('new', b(2));
    const s = new LayeredFileStore(main, legacy);
    expect(await s.has('old')).toBe(true);
    expect(await s.has('new')).toBe(true);
    expect(await s.has('nothing')).toBe(false);
  });

  it('drops a damaged copy from main but still returns the good old bytes', async () => {
    const main = new CorruptStore();
    const legacy = new MemoryFileStore();
    await legacy.put('d1', b(1, 2, 3));
    const s = new LayeredFileStore(main, legacy);
    expect(arr(await s.get('d1'))).toEqual([1, 2, 3]);
    expect(await main.has('d1')).toBe(false);
    expect(await legacy.has('d1')).toBe(true);
  });
});
// end of layeredstore.test.ts
