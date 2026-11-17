export type YMD = string; // "YYYY-MM-DD"

export function isYMD(s: unknown): s is YMD {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const istFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
});

export const toYMDInIST = (d: Date): YMD => istFmt.format(d);
export const todayIST = (now: Date = new Date()): YMD => toYMDInIST(now);

export function addDays(ymd: YMD, n: number): YMD {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daysBetween(a: YMD, b: YMD): number {
  const t = (x: YMD) => { const [y, m, d] = x.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86400000);
}

/** Reminder time: day before the hearing at `hour`:00 IST */
export const reminderInstant = (hearing: YMD, hour = 17): string =>
  `${addDays(hearing, -1)}T${String(hour).padStart(2, '0')}:00:00+05:30`;

/** Returns YMD or null. Never guesses. DD/MM/YYYY is treated as Indian format. */
export function normalizeLegacyDate(v: unknown): YMD | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (isYMD(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : toYMDInIST(d);
  }
  const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (m) {
    const c = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return isYMD(c) ? c : null;
  }
  return null;
}