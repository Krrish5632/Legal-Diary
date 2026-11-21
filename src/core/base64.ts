// Base64 without any browser or Node helper, so it works the same everywhere
// and never builds one giant string with String.fromCharCode.
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < CHARS.length; i++) LOOKUP[CHARS.charCodeAt(i)] = i;

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let cur = '';
  const n = bytes.length;
  let i = 0;
  for (; i + 2 < n; i += 3) {
    const v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    cur += CHARS[(v >> 18) & 63] + CHARS[(v >> 12) & 63] + CHARS[(v >> 6) & 63] + CHARS[v & 63];
    if (cur.length >= 32768) {
      parts.push(cur);
      cur = '';
    }
  }
  const rest = n - i;
  if (rest === 1) {
    const v = bytes[i] << 16;
    cur += CHARS[(v >> 18) & 63] + CHARS[(v >> 12) & 63] + '==';
  } else if (rest === 2) {
    const v = (bytes[i] << 16) | (bytes[i + 1] << 8);
    cur += CHARS[(v >> 18) & 63] + CHARS[(v >> 12) & 63] + CHARS[(v >> 6) & 63] + '=';
  }
  parts.push(cur);
  return parts.join('');
}

export function base64ToBytes(text: string): Uint8Array {
  const s = String(text).replace(/\s+/g, '');
  let end = s.length;
  while (end > 0 && s.charCodeAt(end - 1) === 61) end--;
  if (s.length - end > 2) throw new Error('Invalid base64 text (too much padding).');
  if (end % 4 === 1) throw new Error('Invalid base64 text (wrong length).');
  const out = new Uint8Array(Math.floor((end * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < end; i++) {
    const c = s.charCodeAt(i);
    const v = c < 128 ? LOOKUP[c] : -1;
    if (v < 0) throw new Error('Invalid base64 text (bad character).');
    acc = ((acc << 6) | v) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}
// end of base64.ts
