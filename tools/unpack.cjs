const fs = require('fs');
const path = require('path');
const file = process.argv[2];
if (!file) { console.log('Usage: node tools/unpack.cjs <bundle.txt>'); process.exit(1); }
const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const headers = (text.match(/^=== FILE: /gm) || []).length;
const ends = (text.match(/^=== END ===$/gm) || []).length;
const re = /^=== FILE: (\S+) ===\n([\s\S]*?)\n=== END ===$/gm;
const blocks = [];
let m;
while ((m = re.exec(text))) blocks.push({ rel: m[1], body: m[2] + '\n' });
if (headers === 0 || headers !== ends || headers !== blocks.length) {
  console.log('STOP: bundle is incomplete. headers=' + headers + ' ends=' + ends + ' read=' + blocks.length);
  process.exit(1);
}
const root = process.cwd();
for (const b of blocks) {
  const abs = path.resolve(root, b.rel);
  if (b.rel.includes('..') || path.isAbsolute(b.rel) || !abs.startsWith(root + path.sep)) {
    console.log('STOP: unsafe path ' + b.rel);
    process.exit(1);
  }
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
for (const b of blocks) {
  const abs = path.resolve(root, b.rel);
  if (fs.existsSync(abs)) {
    const bak = path.join(root, '.bak_unpack', stamp, b.rel);
    fs.mkdirSync(path.dirname(bak), { recursive: true });
    fs.copyFileSync(abs, bak);
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, b.body);
  console.log('wrote', b.rel);
}
console.log('DONE: ' + blocks.length + ' file(s)');
// end of unpack.cjs