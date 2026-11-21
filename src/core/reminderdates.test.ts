import { describe, expect, it } from 'vitest';
import { upcomingDateGroups } from './reminderdates';
import { DEFAULT_PREFS } from './reminders';
import type { CaseRecord, HearingRecord } from './types';

const mkCase = (id: string, status: string, priority: string): CaseRecord =>
  ({ id, caseNumber: id, status, priority }) as unknown as CaseRecord;
const mkHearing = (caseId: string, hearingDate: string, state: string): HearingRecord =>
  ({ id: caseId + ':' + hearingDate, caseId, hearingDate, state }) as unknown as HearingRecord;

describe('upcomingDateGroups', () => {
  it('groups by date, counts high priority and sorts by date', () => {
    const cases = [
      mkCase('a', 'Pending', 'High'),
      mkCase('b', 'Pending', 'Normal'),
      mkCase('c', 'Pending', 'Normal'),
    ];
    const hearings = [
      mkHearing('a', '2026-12-10', 'scheduled'),
      mkHearing('b', '2026-12-10', 'scheduled'),
      mkHearing('c', '2026-12-05', 'scheduled'),
    ];
    const g = upcomingDateGroups(cases, hearings, { ...DEFAULT_PREFS }, '2026-12-01');
    expect(g.map(x => x.date)).toEqual(['2026-12-05', '2026-12-10']);
    expect(g[0].count).toBe(1);
    expect(g[0].high).toBe(0);
    expect(g[1].count).toBe(2);
    expect(g[1].high).toBe(1);
  });

  it('leaves out past dates, completed hearings, disposed cases and unknown cases', () => {
    const cases = [mkCase('a', 'Pending', 'Normal'), mkCase('d', 'Disposed', 'Normal')];
    const hearings = [
      mkHearing('a', '2026-11-30', 'scheduled'),
      mkHearing('a', '2026-12-02', 'completed'),
      mkHearing('d', '2026-12-03', 'scheduled'),
      mkHearing('zzz', '2026-12-04', 'scheduled'),
      mkHearing('a', '2026-12-01', 'scheduled'),
    ];
    const g = upcomingDateGroups(cases, hearings, { ...DEFAULT_PREFS }, '2026-12-01');
    expect(g.map(x => x.date)).toEqual(['2026-12-01']);
  });

  it('marks muted dates from the saved settings', () => {
    const cases = [mkCase('a', 'Pending', 'Normal')];
    const hearings = [mkHearing('a', '2026-12-10', 'scheduled'), mkHearing('a', '2026-12-11', 'scheduled')];
    const prefs = { ...DEFAULT_PREFS, mutedDates: ['2026-12-11'] };
    const g = upcomingDateGroups(cases, hearings, prefs, '2026-12-01');
    expect(g.map(x => x.muted)).toEqual([false, true]);
    expect(upcomingDateGroups([], [], prefs, '2026-12-01')).toEqual([]);
  });
});
// end of reminderdates.test.ts
