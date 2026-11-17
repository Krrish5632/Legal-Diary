// Reads the NEW backup (C:\LD_backup2) only. Prints key names and counts, never values.
const { ClassicLevel } = require('C:\\LD_tools\\node_modules\\classic-level');
const fs = require('fs');
const path = require('path');

const SRC = 'C:\\LD_backup2\\extracted\\app_webview\\Default\\Local Storage\\leveldb';
const WORK = 'C:\\LD_backup2\\leveldb_work';
const OUT = 'C:\\LD_backup2\\export';

function decodeTyped(buf) {
  if (!buf || buf.length === 0) return '';
  const t = buf[0];
  const body = buf.subarray(1);
  if (t === 1) return body.toString('latin1');
  if (t === 0) return body.toString('utf16le');
  return null;
}

(async () => {
  if (!fs.existsSync(SRC)) {
    console.log('STOP: source folder not found:', SRC);
    return;
  }
  if (fs.existsSync(OUT)) {
    console.log('STOP: the folder already exists, nothing was changed:', OUT);
    return;
  }
  if (!WORK.startsWith('C:\\LD_backup2\\')) {
    console.log('STOP: unsafe work folder');
    return;
  }
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.cpSync(SRC, WORK, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });

  const db = new ClassicLevel(WORK, {
    keyEncoding: 'buffer',
    valueEncoding: 'buffer',
    createIfMissing: false,
  });
  await db.open();

  const found = [];
  for await (const [k, v] of db.iterator()) {
    if (k[0] !== 0x5f) continue;
    const sep = k.indexOf(0x00, 1);
    if (sep < 0) continue;
    const origin = k.subarray(1, sep).toString('latin1');
    const name = decodeTyped(k.subarray(sep + 1));
    const value = decodeTyped(v);
    if (name === null || value === null) continue;
    found.push({ origin, name, value });
  }
  await db.close();

  console.log('---- RESULT (key names and counts only) ----');
  console.log('Total keys:', found.length);
  for (const f of found) {
    let info = 'text, ' + f.value.length + ' chars';
    try {
      const j = JSON.parse(f.value);
      if (Array.isArray(j)) {
        const ids = new Set(j.map((x) => x && x.id).filter(Boolean));
        info = 'ARRAY items=' + j.length + ', unique-ids=' + ids.size;
      } else if (j && typeof j === 'object') {
        info = 'OBJECT with ' + Object.keys(j).length + ' fields';
      } else {
        info = 'JSON value, ' + f.value.length + ' chars';
      }
    } catch (e) {
      /* not JSON */
    }
    console.log('* ' + f.name + '  [' + f.origin + ']  ->  ' + info);
    const safe = f.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    fs.writeFileSync(path.join(OUT, safe + '.json'), f.value, 'utf8');
  }
  console.log('---- DONE ---- files written to:', OUT);
})().catch((e) => console.log('ERROR:', e));
// end of read_ls2.cjs
