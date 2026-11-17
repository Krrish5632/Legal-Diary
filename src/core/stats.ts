import type { CaseRecord, HearingRecord } from './types';
import { addDays } from './dates';

export interface DashboardStats {
  totalCases: number;
  pending: number;
  urgent: number;
  disposed: number;
  highPriority: number;
  today: number;
  tomorrow: number;
  next7: number;
  overdue: number;
  noNextDate: number;
}

/** All numbers come from saved data only. Disposed cases are not counted in hearing numbers. */
export function dashboardStats(cases: CaseRecord[], hearings: HearingRecord[], today: string): DashboardStats {
  const open = new Set(cases.filter(c => c.status !== 'Disposed').map(c => c.id));
  const tomorrow = addDays(today, 1);
  const week = addDays(today, 7);
  let t = 0, tm = 0, n7 = 0, od = 0;
  for (const h of hearings) {
    if (h.state !== 'scheduled' || !open.has(h.caseId)) continue;
    if (h.hearingDate < today) od += 1;
    else if (h.hearingDate === today) t += 1;
    else {
      if (h.hearingDate === tomorrow) tm += 1;
      if (h.hearingDate <= week) n7 += 1;
    }
  }
  return {
    totalCases: cases.length,
    pending: cases.filter(c => c.status === 'Pending').length,
    urgent: cases.filter(c => c.status === 'Urgent').length,
    disposed: cases.filter(c => c.status === 'Disposed').length,
    highPriority: cases.filter(c => c.priority === 'High').length,
    today: t, tomorrow: tm, next7: n7, overdue: od,
    noNextDate: cases.filter(c => c.status !== 'Disposed' && !c.nextHearingDate).length,
  };
}

export function countBy<T>(items: T[], key: (t: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Completed hearings per month for the last `months` months, oldest first. */
export function hearingsHeldByMonth(hearings: HearingRecord[], today: string, months = 6): [string, number][] {
  const [y, m] = today.split('-').map(Number);
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const t = y * 12 + (m - 1) - i;
    keys.push(Math.floor(t / 12) + '-' + String((t % 12) + 1).padStart(2, '0'));
  }
  const counts = new Map<string, number>(keys.map(k => [k, 0] as [string, number]));
  for (const h of hearings) {
    if (h.state !== 'completed') continue;
    const k = h.hearingDate.slice(0, 7);
    if (counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return keys.map(k => [k, counts.get(k) ?? 0] as [string, number]);
}
// end of stats.ts
