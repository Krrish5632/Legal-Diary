import fs from 'node:fs';
import path from 'node:path';
import { migrateLegacy, verifyMigration } from '../src/core/migrate';

const dir = 'C:\\LD_backup\\export';
const out = 'C:\\LD_backup\\clean_export.json';

function unwrap(v: any): any {
  if (typeof v === 'string') { try { return unwrap(JSON.parse(v)); } catch { return v; } }
  if (v && !Array.isArray(v) && typeof v === 'object' && 'value' in v) return unwrap(v.value);
  return v;
}

let found: any[] | null = null;
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
  try {
    const v = unwrap(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    if (Array.isArray(v) && v.length && v.every(x => x && typeof x === 'object' && 'caseNumber' in x)) {
      if (found) throw new Error('More than one cases file found - stop and tell the assistant');
      found = v;
    }
  } catch (e: any) { if (String(e.message).startsWith('More than one')) throw e; }
}
if (!found) throw new Error('Cases file not found in ' + dir);

const res = migrateLegacy(found, new Date().toISOString());
const problems = verifyMigration(res);
console.log('REPORT', JSON.stringify(res.report, null, 2));
if (problems.length) { console.log('PROBLEMS', problems); process.exit(1); }
fs.writeFileSync(out, JSON.stringify({ version: 1, cases: res.cases, hearings: res.hearings, audit: res.audit }, null, 2));
console.log('OK: written', out, '(contains client data - do not share)');