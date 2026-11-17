import type { Repository } from './repository';
import type { CaseRecord, HearingRecord } from './types';
import type { YMD } from './dates';
import { addDays, reminderInstant, todayIST } from './dates';

export type ReminderDetail = 'count' | 'numbers' | 'names';

export interface ReminderPrefs {
  enabled: boolean;
  hour: number;          // 0-23, India time, on the day before the hearing
  windowDays: number;    // how far ahead reminders are scheduled
  detail: ReminderDetail; // what the lock screen may show
  mutedCases: string[];  // case ids that get no reminder
  mutedDates: string[];  // hearing dates (YYYY-MM-DD) that get no reminder
}

export const DEFAULT_PREFS: ReminderPrefs = {
  enabled: true, hour: 17, windowDays: 60, detail: 'numbers', mutedCases: [], mutedDates: [],
};

const KEY = 'reminder_prefs_v1';
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function sanitizePrefs(v: unknown): ReminderPrefs {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return { ...DEFAULT_PREFS };
  const o = v as Record<string, unknown>;
  const hour = typeof o.hour === 'number' && Number.isInteger(o.hour) && o.hour >= 0 && o.hour <= 23 ? o.hour : DEFAULT_PREFS.hour;
  const win = typeof o.windowDays === 'number' && Number.isInteger(o.windowDays) && o.windowDays >= 1 && o.windowDays <= 365
    ? o.windowDays : DEFAULT_PREFS.windowDays;
  const detail: ReminderDetail = o.detail === 'count' || o.detail === 'names' || o.detail === 'numbers' ? o.detail : DEFAULT_PREFS.detail;
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : true,
    hour, windowDays: win, detail,
    mutedCases: strings(o.mutedCases), mutedDates: strings(o.mutedDates),
  };
}

export async function loadPrefs(repo: Repository): Promise<ReminderPrefs> {
  const raw = await repo.getMeta(KEY);
  if (raw === null) return { ...DEFAULT_PREFS };
  try {
    return sanitizePrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function savePrefs(repo: Repository, prefs: ReminderPrefs): Promise<void> {
  await repo.commit({ setMeta: { [KEY]: JSON.stringify(sanitizePrefs(prefs)) } });
}

export interface PlannedReminder {
  id: number;             // 32-bit number made from the hearing date, so a date can never have two
  hearingDate: YMD;
  at: string;             // when the notification fires (ISO with +05:30)
  title: string;
  body: string;
  caseIds: string[];      // high priority first
  openCaseId: string | null; // set when only one case: tapping opens it
}

function line(c: CaseRecord, detail: ReminderDetail): string {
  const tag = c.priority === 'High' ? 'High - ' : '';
  if (detail === 'names') {
    return tag + (c.parties.plaintiff || '-') + ' vs ' + (c.parties.defendant || '-') + ' (' + c.caseNumber + ')';
  }
  return tag + c.caseNumber;
}

/**
 * Pure planning: which notifications should exist right now. The phone layer cancels the old
 * ones and schedules exactly this list, so running it again never creates duplicates.
 */
export function planReminders(
  cases: CaseRecord[], hearings: HearingRecord[], prefs: ReminderPrefs, now: Date = new Date(),
): PlannedReminder[] {
  if (!prefs.enabled) return [];
  const today = todayIST(now);
  const last = addDays(today, prefs.windowDays);
  const byId = new Map(cases.map(c => [c.id, c] as [string, CaseRecord]));
  const mutedC = new Set(prefs.mutedCases);
  const mutedD = new Set(prefs.mutedDates);
  const byDate = new Map<string, CaseRecord[]>();

  for (const h of hearings) {
    if (h.state !== 'scheduled') continue;
    if (h.hearingDate < today || h.hearingDate > last) continue;
    if (mutedD.has(h.hearingDate)) continue;
    const c = byId.get(h.caseId);
    if (!c || c.status === 'Disposed' || mutedC.has(c.id)) continue;
    const arr = byDate.get(h.hearingDate);
    if (arr) arr.push(c); else byDate.set(h.hearingDate, [c]);
  }

  const out: PlannedReminder[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const at = reminderInstant(date, prefs.hour);
    if (new Date(at).getTime() <= now.getTime()) continue; // that time has already passed
    const list = (byDate.get(date) ?? []).sort((a, b) => {
      const pa = a.priority === 'High' ? 0 : 1;
      const pb = b.priority === 'High' ? 0 : 1;
      return pa - pb || a.caseNumber.localeCompare(b.caseNumber);
    });
    const n = list.length;
    const high = list.filter(c => c.priority === 'High').length;
    let body: string;
    if (prefs.detail === 'count') {
      body = n + ' hearing(s) tomorrow' + (high > 0 ? ', ' + high + ' high priority' : '');
    } else {
      const shown = list.slice(0, 6).map(c => line(c, prefs.detail));
      if (n > 6) shown.push('+' + (n - 6) + ' more');
      body = shown.join('\n');
    }
    out.push({
      id: Number(date.replace(/-/g, '')),
      hearingDate: date,
      at,
      title: "Tomorrow's hearings: " + n,
      body,
      caseIds: list.map(c => c.id),
      openCaseId: n === 1 ? list[0].id : null,
    });
  }
  return out;
}
// end of reminders.ts
