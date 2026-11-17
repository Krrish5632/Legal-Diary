import type { AuditEvent, CaseRecord, HearingRecord } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function fmtDate(d: unknown): string {
  if (typeof d !== 'string' || !YMD_RE.test(d)) return '-';
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  const day = Number(d.slice(8, 10));
  const mon = MONTHS[m - 1];
  if (!mon) return '-';
  return day + ' ' + mon + ' ' + y;
}

export function fmtDay(d: unknown): string {
  if (typeof d !== 'string' || !YMD_RE.test(d)) return '-';
  const wd = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))).getUTCDay();
  return WEEKDAYS[wd] + ', ' + fmtDate(d);
}

// Standard PDF fonts cannot draw Hindi (or other non-Latin) letters.
// Such letters become "?" and are counted so the screen can warn.
const MAP: Record<string, string> = {
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u2013': '-',
  '\u2014': '-',
  '\u2026': '...',
  '\u20B9': 'Rs.',
  '\u00A0': ' ',
  '\u2022': '*',
};
const INVISIBLE = new Set<number>([0x200b, 0x200c, 0x200d, 0xfeff, 0x00ad]);

function makeCleaner() {
  let lost = 0;
  const clean = (v: unknown): string => {
    const s = typeof v === 'string' ? v : v == null ? '' : String(v);
    let out = '';
    for (const ch of s) {
      const mapped = MAP[ch];
      if (mapped !== undefined) {
        out += mapped;
        continue;
      }
      const code = ch.codePointAt(0) ?? 0;
      if (INVISIBLE.has(code) || code === 13) continue;
      if (code === 9) {
        out += ' ';
        continue;
      }
      if (code === 10 || (code >= 32 && code <= 126) || (code >= 161 && code <= 255)) {
        out += ch;
        continue;
      }
      out += '?';
      lost++;
    }
    return out.trim();
  };
  return { clean, lost: () => lost };
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function pick(rec: Record<string, string> | undefined, keys: string[]): string {
  if (!rec) return '';
  for (const k of keys) {
    const v = str(rec[k]).trim();
    if (v) return v;
  }
  return '';
}

function partiesTitle(c: CaseRecord): string {
  const p = c.parties ?? {};
  const a = pick(p, ['petitioner', 'plaintiff', 'applicant', 'appellant', 'complainant', 'firstParty']);
  const b = pick(p, ['respondent', 'defendant', 'opposite', 'oppositeParty', 'accused', 'secondParty']);
  if (a || b) return [a, b].filter(Boolean).join(' vs ');
  return Object.entries(p)
    .filter(([k, v]) => !/counsel|advocate|lawyer/i.test(k) && str(v).trim())
    .map(([, v]) => str(v).trim())
    .join(' vs ');
}

function courtName(c: CaseRecord): string {
  const known = pick(c.court, ['name', 'courtName', 'court']);
  if (known) return known;
  for (const [k, v] of Object.entries(c.court ?? {})) {
    if (!/room|number|judge|bench/i.test(k) && str(v).trim()) return str(v).trim();
  }
  return '';
}

// The year is added only when the case number does not already end with it.
function caseNo(c: CaseRecord): string {
  const num = str(c.caseNumber).trim();
  const year = str(c.caseYear).trim();
  if (!year) return num;
  if (num.endsWith('/' + year)) return num;
  return num + '/' + year;
}

function slug(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'case';
}

function humanKey(k: string): string {
  const t = k
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---------------------------------------------------------------- cause list

export interface CauseRow {
  no: number;
  caseNo: string;
  title: string;
  court: string;
  stage: string;
  status: string;
  high: boolean;
}
export interface CauseDay {
  date: string;
  label: string;
  rows: CauseRow[];
}
export interface CauseListModel {
  heading: string;
  period: string;
  days: CauseDay[];
  total: number;
  highCount: number;
  generated: string;
  unsupportedChars: number;
  fileName: string;
}

export function buildCauseList(
  cases: CaseRecord[],
  hearings: HearingRecord[],
  from: string,
  to: string,
  generatedOn: string,
  periodLabel?: string,
): CauseListModel {
  if (!YMD_RE.test(from) || !YMD_RE.test(to) || from > to) {
    throw new Error('The date range for the PDF is not valid.');
  }
  const { clean, lost } = makeCleaner();
  const byId = new Map<string, CaseRecord>(cases.map((c): [string, CaseRecord] => [c.id, c]));
  const perDay = new Map<string, { c: CaseRecord; h: HearingRecord }[]>();
  for (const h of hearings) {
    if (h.hearingDate < from || h.hearingDate > to) continue;
    const c = byId.get(h.caseId);
    if (!c) continue;
    const list = perDay.get(h.hearingDate) ?? [];
    list.push({ c, h });
    perDay.set(h.hearingDate, list);
  }
  const dates = Array.from(perDay.keys()).sort();
  let total = 0;
  let highCount = 0;
  const days: CauseDay[] = dates.map((date) => {
    const items = (perDay.get(date) ?? []).slice();
    items.sort((a, b) => {
      const pa = a.c.priority === 'High' ? 0 : 1;
      const pb = b.c.priority === 'High' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const co = courtName(a.c).localeCompare(courtName(b.c), 'en', { numeric: true });
      if (co !== 0) return co;
      return a.c.caseNumber.localeCompare(b.c.caseNumber, 'en', { numeric: true });
    });
    const rows: CauseRow[] = items.map(({ c, h }, i) => {
      let status = 'Listed';
      if (h.state === 'completed') {
        const moved = typeof h.nextDateFixed === 'string' ? h.nextDateFixed : '';
        if (c.status === 'Disposed') status = 'Disposed';
        else if (moved) status = 'Heard - next ' + fmtDate(moved);
        else status = 'Heard';
      }
      const high = c.priority === 'High';
      total++;
      if (high) highCount++;
      return {
        no: i + 1,
        caseNo: clean(caseNo(c)),
        title: clean(partiesTitle(c)),
        court: clean(courtName(c)),
        stage: clean(str(h.proceedings) || str(c.currentProceeding)),
        status,
        high,
      };
    });
    return { date, label: fmtDay(date), rows };
  });
  const period = periodLabel
    ? periodLabel + ' (' + fmtDate(from) + ' to ' + fmtDate(to) + ')'
    : from === to
      ? fmtDay(from)
      : fmtDate(from) + ' to ' + fmtDate(to);
  return {
    heading: 'Cause List',
    period,
    days,
    total,
    highCount,
    generated: fmtDate(generatedOn),
    unsupportedChars: lost(),
    fileName: from === to ? 'cause-list-' + from + '.pdf' : 'cause-list-' + from + '_to_' + to + '.pdf',
  };
}

// ---------------------------------------------------------------- case history

export interface HistoryRow {
  date: string;
  status: string;
  proceedings: string;
  order: string;
  notes: string;
  next: string;
}
export interface LogRow {
  when: string;
  what: string;
  detail: string;
}
export interface HistoryModel {
  heading: string;
  caseNo: string;
  title: string;
  info: [string, string][];
  notes: string;
  hearings: HistoryRow[];
  log: LogRow[];
  footnote: string;
  generated: string;
  unsupportedChars: number;
  fileName: string;
}

const ACTION: Record<string, string> = {
  migrated: 'Imported from old app',
  created: 'Case created',
  rescheduled: 'Next date changed',
  edited: 'Details edited',
  'hearing-added': 'Hearing added',
  'priority-changed': 'Priority changed',
};

function toText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  try {
    return JSON.stringify(v) ?? '';
  } catch {
    return '';
  }
}

export function buildCaseHistory(
  c: CaseRecord,
  hearings: HearingRecord[],
  audit: AuditEvent[],
  generatedOn: string,
): HistoryModel {
  const { clean, lost } = makeCleaner();
  const mine = hearings
    .filter((h) => h.caseId === c.id)
    .sort((a, b) => (a.hearingDate < b.hearingDate ? -1 : a.hearingDate > b.hearingDate ? 1 : 0));
  const completed = mine.filter((h) => h.state === 'completed').length;

  const info: [string, string][] = [];
  const add = (label: string, value: string, skipEmpty = false) => {
    const v = clean(value);
    if (skipEmpty && (!v || v === '-')) return;
    info.push([clean(label), v || '-']);
  };
  add('Case number', caseNo(c));
  const original = str(c.caseTypeOriginal).trim();
  add('Case type', original && original !== c.caseType ? c.caseType + ' (entered as "' + original + '")' : c.caseType);
  add('Status', c.status);
  add('Priority', c.priority);
  add(
    'Entry date',
    c.entryDate
      ? fmtDate(c.entryDate) + (c.entryDateSource === 'legacy-createdAt' ? ' (from old data)' : '')
      : 'Not recorded',
  );
  add('Initial hearing date', fmtDate(c.initialHearingDate));
  add('Next hearing date', c.status === 'Disposed' ? '-' : fmtDate(c.nextHearingDate));
  add('Last hearing date', fmtDate(c.lastHearingDate));
  add('Total hearings', String(c.totalHearings));
  add('Current proceeding', str(c.currentProceeding));
  for (const [k, v] of Object.entries(c.court ?? {})) add('Court - ' + humanKey(k), str(v), true);
  for (const [k, v] of Object.entries(c.parties ?? {})) add('Parties - ' + humanKey(k), str(v), true);
  for (const [k, v] of Object.entries(c.legalSections ?? {})) add('Legal sections - ' + humanKey(k), str(v), true);

  const hearingRows: HistoryRow[] = mine.map((h) => {
    let status = 'Heard';
    if (h.state !== 'completed') {
      status = h.hearingDate < generatedOn ? 'Date passed - not updated' : 'Upcoming';
    }
    const next = typeof h.nextDateFixed === 'string' ? h.nextDateFixed : '';
    return {
      date: fmtDate(h.hearingDate),
      status,
      proceedings: clean(str(h.proceedings)),
      order: clean(str(h.courtOrder)),
      notes: clean(str(h.notes)),
      next: next ? fmtDate(next) : '-',
    };
  });

  const mineAudit = audit
    .filter((a) => a.caseId === c.id)
    .slice()
    .sort((a, b) => (str(a.at) < str(b.at) ? -1 : str(a.at) > str(b.at) ? 1 : 0));
  const log: LogRow[] = mineAudit.map((a) => {
    const d = clean(toText(a.detail));
    const act = String(a.action);
    return {
      when: str(a.at).slice(0, 16).replace('T', ' '),
      what: ACTION[act] ?? act,
      detail: d.length > 160 ? d.slice(0, 157) + '...' : d,
    };
  });

  const footnote =
    c.legacy && c.legacy.sourceKey !== 'app' && completed === 0
      ? 'Hearings before this case was moved into this app were not recorded by the old app, so none are shown. Nothing has been guessed.'
      : '';

  return {
    heading: 'Case History',
    caseNo: clean(caseNo(c)),
    title: clean(partiesTitle(c)),
    info,
    notes: clean(str(c.notes)),
    hearings: hearingRows,
    log,
    footnote,
    generated: fmtDate(generatedOn),
    unsupportedChars: lost(),
    fileName: 'case-history-' + slug(caseNo(c)) + '.pdf',
  };
}
// end of pdfmodel.ts
