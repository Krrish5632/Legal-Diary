import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbFileStore, MemoryFileStore } from './filestore';

describe('IndexedDbFileStore', () => {
  it('keeps bytes after the store is closed and opened again', async () => {
    const f = new IDBFactory();
    const a = new IndexedDbFileStore('t', f);
    await a.put('x', new Uint8Array([1, 2, 3]));
    await a.close();
    const b = new IndexedDbFileStore('t', f);
    const got = await b.get('x');
    expect(got).not.toBeNull();
    expect([...(got as Uint8Array)]).toEqual([1, 2, 3]);
    expect(await b.has('x')).toBe(true);
  });

  it('returns null for a missing file and removes files', async () => {
    const s = new IndexedDbFileStore('t2', new IDBFactory());
    expect(await s.get('nope')).toBeNull();
    expect(await s.has('nope')).toBe(false);
    await s.put('y', new Uint8Array([9]));
    await s.remove('y');
    expect(await s.has('y')).toBe(false);
  });
});

describe('MemoryFileStore', () => {
  it('stores copies, so changing the original does not change the stored file', async () => {
    const s = new MemoryFileStore();
    const src = new Uint8Array([1, 2, 3]);
    await s.put('a', src);
    src[0] = 99;
    expect([...((await s.get('a')) as Uint8Array)]).toEqual([1, 2, 3]);
  });
});
// end of filestore.test.ts
