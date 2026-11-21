import type { CaseRecord, HearingRecord } from './types';
import type { ReminderPrefs } from './reminders';
import type { YMD } from './dates';

export interface DateGroup {
  date: YMD;
  count: number;   // cases with a scheduled hearing on that date
  high: number;    // how many of them are High priority
  muted: boolean;  // true when this date gets no reminder
}

/** Upcoming hearing dates (today and later) with the number of cases on each. */
export function upcomingDateGroups(
  cases: CaseRecord[],
  hearings: HearingRecord[],
  prefs: ReminderPrefs,
  today: YMD,
): DateGroup[] {
  const byId = new Map(cases.map(c => [c.id, c] as [string, CaseRecord]));
  const muted = new Set(prefs.mutedDates);
  const byDate = new Map<string, Map<string, CaseRecord>>();
  for (const h of hearings) {
    if (h.state !== 'scheduled' || h.hearingDate < today) continue;
    const c = byId.get(h.caseId);
    if (!c || c.status === 'Disposed') continue;
    let m = byDate.get(h.hearingDate);
    if (!m) {
      m = new Map<string, CaseRecord>();
      byDate.set(h.hearingDate, m);
    }
    m.set(c.id, c);
  }
  const out: DateGroup[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const list = [...(byDate.get(date) ?? new Map<string, CaseRecord>()).values()];
    out.push({
      date,
      count: list.length,
      high: list.filter(c => c.priority === 'High').length,
      muted: muted.has(date),
    });
  }
  return out;
}
// end of reminderdates.ts
