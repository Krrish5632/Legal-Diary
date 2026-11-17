import { describe, it, expect } from 'vitest';
import { countBy, dashboardStats, hearingsHeldByMonth } from './stats';
import type { CaseRecord, HearingRecord } from './types';

const c = (id: string, status: string, priority = 'Normal', next: string | null = null) =>
  ({ id, status, priority, nextHearingDate: next }) as unknown as CaseRecord;
const h = (caseId: string, date: string, state: string) =>
  ({ id: caseId + ':' + date, caseId, hearingDate: date, state }) as unknown as HearingRecord;

describe('stats', () => {
  it('counts today, tomorrow, week, overdue and ignores disposed cases', () => {
    const cases = [c('1', 'Pending', 'High', '2026-03-10'), c('2', 'Disposed'), c('3', 'Urgent', 'Normal', '2026-03-11'), c('4', 'Pending')];
    const hs = [
      h('1', '2026-03-10', 'scheduled'), h('3', '2026-03-11', 'scheduled'),
      h('2', '2026-03-10', 'scheduled'), h('1', '2026-03-01', 'scheduled'),
      h('3', '2026-03-05', 'completed'), h('1', '2026-03-30', 'scheduled'),
    ];
    const s = dashboardStats(cases, hs, '2026-03-10');
    expect(s.totalCases).toBe(4);
    expect(s.urgent).toBe(1);
    expect(s.disposed).toBe(1);
    expect(s.highPriority).toBe(1);
    expect(s.today).toBe(1);
    expect(s.tomorrow).toBe(1);
    expect(s.next7).toBe(1);
    expect(s.overdue).toBe(1);
    expect(s.noNextDate).toBe(1);
  });

  it('counts by key, biggest first', () => {
    expect(countBy(['a', 'b', 'b'], x => x)).toEqual([['b', 2], ['a', 1]]);
  });

  it('hearings held per month covers the last 6 months across a year change', () => {
    const r = hearingsHeldByMonth([h('1', '2025-12-05', 'completed'), h('1', '2026-02-05', 'scheduled')], '2026-02-10', 6);
    expect(r.map(x => x[0])).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
    expect(r[3][1]).toBe(1);
    expect(r[5][1]).toBe(0);
  });
});
// end of stats.test.ts
