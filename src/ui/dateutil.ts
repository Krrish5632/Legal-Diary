// All dates are plain YYYY-MM-DD text. Today / now are always taken in Asia/Kolkata.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number) => String(n).padStart(2, '0');

export function isDateText(s: string | null | undefined): s is string {
  return !!s && YMD_RE.test(s);
}

function split(ymd: string): [number, number, number] {
  const p = ymd.split('-').map(Number);
  return [p[0], p[1], p[2]];
}

function toUTC(ymd: string): Date {
  const [y, m, d] = split(ymd);
  return new Date(Date.UTC(y, m - 1, d));
}

function daysIn(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function todayYMD(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

/** Current time as an ISO text with the +05:30 offset. */
export function nowIST(now: Date = new Date()): string {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hourCycle: 'h23',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  return `${todayYMD(now)}T${f.format(now)}+05:30`;
}

export function addDays(ymd: string, n: number): string {
  const dt = toUTC(ymd);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function dayOfWeek(ymd: string): number {
  return toUTC(ymd).getUTCDay();
}

/** Monday of the week that contains this date. */
export function weekStart(ymd: string): string {
  return addDays(ymd, -((dayOfWeek(ymd) + 6) % 7));
}

export function monthStart(ymd: string): string {
  const [y, m] = split(ymd);
  return `${y}-${pad(m)}-01`;
}

export function monthEnd(ymd: string): string {
  const [y, m] = split(ymd);
  return `${y}-${pad(m)}-${pad(daysIn(y, m))}`;
}

export function addMonths(ymd: string, n: number): string {
  const [y, m, d] = split(ymd);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, daysIn(ny, nm)))}`;
}

export function fmt(ymd: string | null | undefined, fallback = 'Not recorded'): string {
  if (!isDateText(ymd)) return fallback;
  const [y, m, d] = split(ymd);
  return `${d} ${MON[m - 1]} ${y}`;
}

export function fmtDay(ymd: string): string {
  if (!isDateText(ymd)) return ymd;
  return `${DOW[dayOfWeek(ymd)]}, ${fmt(ymd)}`;
}

export function fmtMonth(ymd: string): string {
  const [y, m] = split(ymd);
  return `${MONTH_FULL[m - 1]} ${y}`;
}
// end of dateutil.ts
