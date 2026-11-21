import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64 } from './base64';

const enc = (s: string): Uint8Array => Uint8Array.from(s.split('').map(c => c.charCodeAt(0)));
const dec = (b: Uint8Array): string => Array.from(b).map(x => String.fromCharCode(x)).join('');

function pseudo(n: number): Uint8Array {
  const a = new Uint8Array(n);
  let x = 12345;
  for (let i = 0; i < n; i++) {
    x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
    a[i] = (x >> 16) & 255;
  }
  return a;
}

function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe('base64', () => {
  it('encodes known examples', () => {
    expect(bytesToBase64(enc(''))).toBe('');
    expect(bytesToBase64(enc('M'))).toBe('TQ==');
    expect(bytesToBase64(enc('Ma'))).toBe('TWE=');
    expect(bytesToBase64(enc('Man'))).toBe('TWFu');
    expect(bytesToBase64(enc('Many hands'))).toBe('TWFueSBoYW5kcw==');
  });

  it('decodes known examples, with or without padding', () => {
    expect(dec(base64ToBytes(''))).toBe('');
    expect(dec(base64ToBytes('TQ=='))).toBe('M');
    expect(dec(base64ToBytes('TQ'))).toBe('M');
    expect(dec(base64ToBytes('TWE='))).toBe('Ma');
    expect(dec(base64ToBytes('TWE'))).toBe('Ma');
    expect(dec(base64ToBytes('TWFueSBoYW5kcw=='))).toBe('Many hands');
  });

  it('round trips every small length and a 1 MB file exactly', () => {
    for (let n = 0; n <= 300; n++) {
      const src = pseudo(n);
      expect(same(base64ToBytes(bytesToBase64(src)), src)).toBe(true);
    }
    const big = pseudo(1024 * 1024 + 1);
    const text = bytesToBase64(big);
    expect(text.length).toBe(Math.ceil(big.length / 3) * 4);
    expect(same(base64ToBytes(text), big)).toBe(true);
  });

  it('ignores white space and refuses damaged text', () => {
    expect(dec(base64ToBytes('TW Fu\n'))).toBe('Man');
    expect(() => base64ToBytes('TW$u')).toThrow();
    expect(() => base64ToBytes('T')).toThrow();
    expect(() => base64ToBytes('TQ===')).toThrow();
  });
});
// end of base64.test.ts
