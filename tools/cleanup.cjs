// One-time cleanup. Moves the old app files OUT of the repo. Nothing is deleted.
// Run from the repo folder:  node tools\cleanup.cjs C:\LD_old_files
// Before moving anything it checks that no kept file uses the old files or the removed packages.
// If any kept file does, it STOPS and moves nothing.
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const destArg = process.argv[2];
const stop = (msg) => {
  console.log('STOP: ' + msg);
  process.exit(1);
};

if (!destArg) stop('give a NEW folder outside the repo, for example C:\\LD_old_files');
const dest = path.resolve(destArg);
const norm = (p) => path.resolve(p).toLowerCase();
if (norm(dest) === norm(root) || norm(dest).startsWith(norm(root) + path.sep)) {
  stop('the folder must be outside the repo.');
}
if (fs.existsSync(dest)) stop(dest + ' already exists. Use a new folder name.');
if (!fs.existsSync(path.join(root, 'package.json')) || !fs.existsSync(path.join(root, 'src', 'ui'))) {
  stop('run this from C:\\LD_repo.');
}

// Packages that only the old files used.
const REMOVED = new Set([
  '@hookform/resolvers', '@tailwindcss/vite', 'clsx', 'date-fns', 'dotenv', 'express', 'firebase',
  'lucide-react', 'motion', 'react-hook-form', 'tailwind-merge', 'vite-plugin-pwa',
  '@types/express', 'autoprefixer', 'tailwindcss',
]);

// Old source files (relative to the repo, lower case, forward slashes).
const OLD_EXACT = new Set([
  'src/app', 'src/app.tsx', 'src/main', 'src/main.tsx', 'src/types', 'src/types.ts',
  'src/index.css', 'src/pwa.d', 'src/pwa.d.ts', 'src/components', 'src/lib',
]);
function isOld(target) {
  const rel = path.relative(root, target).split(path.sep).join('/').toLowerCase();
  return OLD_EXACT.has(rel) || rel.startsWith('src/components/') || rel.startsWith('src/lib/');
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

// Files that stay in the project and must not depend on anything being removed.
const files = [];
walk(path.join(root, 'src', 'ui'), files);
walk(path.join(root, 'src', 'core'), files);
walk(path.join(root, 'tools'), files);
for (const n of ['vite.config.ts', 'capacitor.config.ts', 'index.html']) {
  const f = path.join(root, n);
  if (fs.existsSync(f)) files.push(f);
}
const skip = new Set([
  norm(path.join(root, 'tools', 'convert.ts')),
  norm(path.join(root, 'tools', 'cleanup.cjs')),
]);
const EXT = new Set(['.ts', '.tsx', '.cjs', '.js', '.mjs', '.css', '.html']);

const SPEC = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"]([^'"]+)['"]/g;
const REF = /reference\s+types\s*=\s*['"]([^'"]+)['"]/g;
const pkgOf = (spec) => {
  const p = spec.split('/');
  return spec.startsWith('@') ? p.slice(0, 2).join('/') : p[0];
};

const hits = [];
let scanned = 0;
for (const file of files) {
  if (skip.has(norm(file))) continue;
  const ext = path.extname(file).toLowerCase();
  if (!EXT.has(ext)) continue;
  scanned++;
  const text = fs.readFileSync(file, 'utf8');
  const shown = path.relative(root, file);
  if (ext === '.css') {
    if (/tailwind|@apply/i.test(text)) hits.push(shown + '  uses tailwind');
    continue;
  }
  const specs = [];
  let m;
  SPEC.lastIndex = 0;
  while ((m = SPEC.exec(text)) !== null) specs.push(m[1]);
  REF.lastIndex = 0;
  while ((m = REF.exec(text)) !== null) specs.push(m[1]);
  for (const spec of specs) {
    if (spec.startsWith('.')) {
      if (isOld(path.resolve(path.dirname(file), spec))) hits.push(shown + '  uses old file: ' + spec);
    } else if (spec.startsWith('@/')) {
      hits.push(shown + '  uses the @ alias: ' + spec);
    } else if (spec.startsWith('virtual:')) {
      hits.push(shown + '  uses ' + spec);
    } else if (REMOVED.has(pkgOf(spec))) {
      hits.push(shown + '  uses removed package: ' + spec);
    }
  }
}

if (hits.length > 0) {
  console.log('These kept files depend on something that would be removed:');
  for (const h of hits) console.log('  ' + h);
  stop('nothing was moved. Paste this list in the chat.');
}
console.log('Safety scan passed: ' + scanned + ' kept file(s) checked, no use of old files or removed packages.');

const ITEMS = [
  'src/App.tsx', 'src/main.tsx', 'src/types.ts', 'src/index.css', 'src/pwa.d.ts',
  'src/components', 'src/lib',
  'metadata.json', '.env.example',
  'tools/convert.ts', 'tools/hello_check.txt',
];
// Empty accident files in the repo root (made by commands pasted into the wrong window).
const STRAY = ['dir', 'e.tx', "e.sql)).toEqual(['A'", '!(typeof', "('SELECT", '({', '{'];

function moveOut(rel) {
  const from = path.join(root, rel);
  const to = path.join(dest, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fs.renameSync(from, to);
  } catch (e) {
    if (e && e.code === 'EXDEV') {
      fs.cpSync(from, to, { recursive: true });
      fs.rmSync(from, { recursive: true, force: true });
    } else {
      throw e;
    }
  }
}

let moved = 0;
const missing = [];
for (const rel of ITEMS) {
  if (!fs.existsSync(path.join(root, rel))) {
    missing.push(rel);
    continue;
  }
  moveOut(rel);
  moved++;
  console.log('moved ' + rel);
}
for (const rel of STRAY) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    missing.push(rel);
    continue;
  }
  moveOut(rel);
  moved++;
  console.log('moved ' + rel);
}
if (missing.length > 0) console.log('Not found (fine): ' + missing.join(' | '));
console.log('src now holds: ' + fs.readdirSync(path.join(root, 'src')).join(', '));
console.log('DONE: moved ' + moved + ' item(s) to ' + dest);
// end of cleanup.cjs
