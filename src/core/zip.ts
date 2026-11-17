export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const DOS_DATE = (1 << 5) | 1; // 1980-01-01
const DOS_TIME = 0;

function checkName(name: string): void {
  const ok =
    /^[\x20-\x7e]+$/.test(name) &&
    name.length <= 200 &&
    !name.startsWith('/') &&
    !name.includes('\\') &&
    !name.split('/').some(p => p === '' || p === '..' || p === '.');
  if (!ok) throw new Error('Unsafe name in zip file: ' + name);
}

/** Writes a plain (not compressed) zip file. Windows and phones can open it. */
export function zipStore(entries: ZipEntry[]): Uint8Array {
  const seen = new Set<string>();
  let total = 22;
  const prepared = entries.map(e => {
    checkName(e.name);
    if (seen.has(e.name)) throw new Error('Duplicate name in zip file: ' + e.name);
    seen.add(e.name);
    const nameBytes = enc.encode(e.name);
    total += 30 + nameBytes.length + e.data.length + 46 + nameBytes.length;
    return { nameBytes, data: e.data, crc: crc32(e.data) };
  });
  if (entries.length > 0xffff || total > 0xffffffff) throw new Error('Too much data for one zip file.');

  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let p = 0;
  const offsets: number[] = [];

  for (const e of prepared) {
    offsets.push(p);
    dv.setUint32(p, 0x04034b50, true);
    dv.setUint16(p + 4, 20, true);
    dv.setUint16(p + 6, 0x0800, true);
    dv.setUint16(p + 8, 0, true);
    dv.setUint16(p + 10, DOS_TIME, true);
    dv.setUint16(p + 12, DOS_DATE, true);
    dv.setUint32(p + 14, e.crc, true);
    dv.setUint32(p + 18, e.data.length, true);
    dv.setUint32(p + 22, e.data.length, true);
    dv.setUint16(p + 26, e.nameBytes.length, true);
    dv.setUint16(p + 28, 0, true);
    p += 30;
    out.set(e.nameBytes, p);
    p += e.nameBytes.length;
    out.set(e.data, p);
    p += e.data.length;
  }

  const cdStart = p;
  prepared.forEach((e, i) => {
    dv.setUint32(p, 0x02014b50, true);
    dv.setUint16(p + 4, 20, true);
    dv.setUint16(p + 6, 20, true);
    dv.setUint16(p + 8, 0x0800, true);
    dv.setUint16(p + 10, 0, true);
    dv.setUint16(p + 12, DOS_TIME, true);
    dv.setUint16(p + 14, DOS_DATE, true);
    dv.setUint32(p + 16, e.crc, true);
    dv.setUint32(p + 20, e.data.length, true);
    dv.setUint32(p + 24, e.data.length, true);
    dv.setUint16(p + 28, e.nameBytes.length, true);
    dv.setUint16(p + 30, 0, true);
    dv.setUint16(p + 32, 0, true);
    dv.setUint16(p + 34, 0, true);
    dv.setUint16(p + 36, 0, true);
    dv.setUint32(p + 38, 0, true);
    dv.setUint32(p + 42, offsets[i], true);
    p += 46;
    out.set(e.nameBytes, p);
    p += e.nameBytes.length;
  });
  const cdSize = p - cdStart;

  dv.setUint32(p, 0x06054b50, true);
  dv.setUint16(p + 4, 0, true);
  dv.setUint16(p + 6, 0, true);
  dv.setUint16(p + 8, prepared.length, true);
  dv.setUint16(p + 10, prepared.length, true);
  dv.setUint32(p + 12, cdSize, true);
  dv.setUint32(p + 16, cdStart, true);
  dv.setUint16(p + 20, 0, true);
  return out;
}

/** Reads a plain zip file made by zipStore. Every file is checked (CRC). */
export function unzipStore(bytes: Uint8Array): ZipEntry[] {
  const bad = (m: string): never => {
    throw new Error('This zip file is not valid: ' + m);
  };
  if (bytes.length < 22) return bad('file is too small');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let eocd = -1;
  const stop = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= stop; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return bad('end marker not found');

  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOff = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) return bad('very large zip files are not supported');
  if (cdOff + cdSize > eocd) return bad('directory is out of range');

  const out: ZipEntry[] = [];
  const seen = new Set<string>();
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) return bad('directory is damaged');
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    if (flags & 1) return bad('encrypted files are not supported');
    if (method !== 0) return bad('compressed zip files are not supported (this app reads only its own backups)');
    if (csize !== usize) return bad('sizes do not match');
    if (p + 46 + nameLen > bytes.length) return bad('directory is damaged');
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    checkName(name);
    if (seen.has(name)) return bad('the same name appears twice');
    seen.add(name);
    if (lho + 30 > bytes.length || dv.getUint32(lho, true) !== 0x04034b50) return bad('a file header is damaged');
    const lName = dv.getUint16(lho + 26, true);
    const lExtra = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lName + lExtra;
    if (start + usize > bytes.length) return bad('file data is out of range');
    const data = bytes.slice(start, start + usize);
    if (crc32(data) !== crc) return bad('check failed for ' + name + ' (damaged)');
    out.push({ name, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
// end of zip.ts
