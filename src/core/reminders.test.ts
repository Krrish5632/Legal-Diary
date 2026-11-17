import { describe, it, expect } from 'vitest';
import { MemoryRepository } from './repository';
import { DEFAULT_PREFS, loadPrefs, planReminders, sanitizePrefs, savePrefs } from './reminders';
import type { ReminderPrefs } from './reminders';
import type { CaseRecord, HearingRecord } from './types';

const mkCase = (id: string, num: string, extra: Record<string, unknown> = {}) => ({
  id, caseNumber: num, status: 'Pending', priority: 'Normal',
  parties: { plaintiff: 'A Kumar', defendant: 'B Singh' },
  ...extra,
}) as unknown as CaseRecord;

const mkHearing = (caseId: string, date: string, state = 'scheduled') => ({
  id: caseId + ':' + date, caseId, hearingDate: date, state,
}) as unknown as HearingRecord;

const NOW = new Date('2026-03-09T10:00:00+05:30');
const prefs = (p: Partial<ReminderPrefs> = {}): ReminderPrefs => ({ ...DEFAULT_PREFS, ...p });

describe('planReminders', () => {
  it('makes one reminder per date, high priority first, with a date based id', () => {
    const cases = [mkCase('1', '200'), mkCase('2', '100', { priority: 'High' }), mkCase('3', '300')];
    const hs = [mkHearing('1', '2026-03-10'), mkHearing('2', '2026-03-10'), mkHearing('3', '2026-03-12')];
    const r = planReminders(cases, hs, prefs(), NOW);
    expect(r).toHaveLength(2);
    expect(r[0].id).toBe(20260310);
    expect(r[0].at).toBe('2026-03-09T17:00:00+05:30');
    expect(r[0].caseIds).toEqual(['2', '1']);
    expect(r[0].body.split('\n')[0]).toBe('High - 100');
    expect(r[0].openCaseId).toBeNull();
    expect(r[1].openCaseId).toBe('3');
  });

  it('skips disposed, done, muted, passed and far-away hearings', () => {
    const cases = [mkCase('1', '1'), mkCase('2', '2', { status: 'Disposed' }), mkCase('3', '3'), mkCase('4', '4'), mkCase('5', '5')];
    const hs = [
      mkHearing('1', '2026-03-09'),            // today: the reminder time was yesterday
      mkHearing('2', '2026-03-10'),            // disposed
      mkHearing('3', '2026-03-10', 'completed'),
      mkHearing('4', '2026-03-10'),            // muted case
      mkHearing('5', '2026-03-11'),            // muted date
      mkHearing('5', '2026-06-01'),            // beyond 60 days
    ];
    const r = planReminders(cases, hs, prefs({ mutedCases: ['4'], mutedDates: ['2026-03-11'] }), NOW);
    expect(r).toEqual([]);
  });

  it('drops tomorrow when the 5 PM reminder time has already passed today', () => {
    const cases = [mkCase('1', '1')];
    const hs = [mkHearing('1', '2026-03-10'), mkHearing('1', '2026-03-11')];
    const late = new Date('2026-03-09T18:00:00+05:30');
    const r = planReminders(cases, hs, prefs(), late);
    expect(r.map(x => x.hearingDate)).toEqual(['2026-03-11']);
  });

  it('respects the detail setting and the on/off switch', () => {
    const cases = [mkCase('1', '55', { priority: 'High' })];
    const hs = [mkHearing('1', '2026-03-10')];
    expect(planReminders(cases, hs, prefs({ detail: 'count' }), NOW)[0].body).toBe('1 hearing(s) tomorrow, 1 high priority');
    expect(planReminders(cases, hs, prefs({ detail: 'names' }), NOW)[0].body).toBe('High - A Kumar vs B Singh (55)');
    expect(planReminders(cases, hs, prefs({ enabled: false }), NOW)).toEqual([]);
    expect(planReminders(cases, hs, prefs({ hour: 20 }), NOW)[0].at).toBe('2026-03-09T20:00:00+05:30');
  });
});

describe('reminder preferences', () => {
  it('cleans bad values', () => {
    expect(sanitizePrefs('x')).toEqual(DEFAULT_PREFS);
    const p = sanitizePrefs({ hour: 99, windowDays: 0, detail: 'zzz', enabled: 'yes', mutedCases: ['a', 5] });
    expect(p.hour).toBe(17);
    expect(p.windowDays).toBe(60);
    expect(p.detail).toBe('numbers');
    expect(p.enabled).toBe(true);
    expect(p.mutedCases).toEqual(['a']);
  });

  it('loads defaults, saves and loads again, survives damaged text', async () => {
    const repo = new MemoryRepository();
    expect(await loadPrefs(repo)).toEqual(DEFAULT_PREFS);
    await savePrefs(repo, prefs({ hour: 18, mutedDates: ['2026-03-10'] }));
    const p = await loadPrefs(repo);
    expect(p.hour).toBe(18);
    expect(p.mutedDates).toEqual(['2026-03-10']);
    await repo.commit({ setMeta: { reminder_prefs_v1: '{bad' } });
    expect(await loadPrefs(repo)).toEqual(DEFAULT_PREFS);
  });
});
// end of reminders.test.ts
