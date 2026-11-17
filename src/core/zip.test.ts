import { describe, it, expect } from 'vitest';
import { crc32, unzipStore, zipStore } from './zip';

const enc = new TextEncoder();

describe('zip', () => {
  it('crc32 matches the standard test value', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes and reads back the same names and bytes', () => {
    const big = new Uint8Array(100000);
    for (let i = 0; i < big.length; i++) big[i] = i % 251;
    const z = zipStore([
      { name: 'a.txt', data: enc.encode('hello') },
      { name: 'files/doc-1', data: big },
      { name: 'empty', data: new Uint8Array(0) },
    ]);
    const back = unzipStore(z);
    expect(back.map(e => e.name)).toEqual(['a.txt', 'files/doc-1', 'empty']);
    expect(new TextDecoder().decode(back[0].data)).toBe('hello');
    expect(back[1].data.length).toBe(100000);
    expect(back[1].data[1000]).toBe(1000 % 251);
    expect(back[2].data.length).toBe(0);
  });

  it('handles a zip with no files', () => {
    expect(unzipStore(zipStore([]))).toEqual([]);
  });

  it('refuses duplicate and unsafe names', () => {
    const d = new Uint8Array([1]);
    expect(() => zipStore([{ name: 'a', data: d }, { name: 'a', data: d }])).toThrow(/Duplicate/);
    expect(() => zipStore([{ name: '../x', data: d }])).toThrow(/Unsafe/);
    expect(() => zipStore([{ name: '/x', data: d }])).toThrow(/Unsafe/);
    expect(() => zipStore([{ name: 'a\\b', data: d }])).toThrow(/Unsafe/);
  });

  it('notices a changed byte', () => {
    const z = zipStore([{ name: 'a.txt', data: enc.encode('hello') }]);
    z[36] ^= 0xff;
    expect(() => unzipStore(z)).toThrow(/check failed/);
  });

  it('refuses a cut-off file', () => {
    const z = zipStore([{ name: 'a.txt', data: enc.encode('hello') }]);
    expect(() => unzipStore(z.slice(0, z.length - 10))).toThrow(/not valid/);
  });
});
// end of zip.test.ts
