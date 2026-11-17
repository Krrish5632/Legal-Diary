import { describe, it, expect } from 'vitest';
import {
  addDays, addMonths, fmt, fmtDay, fmtMonth, monthEnd, monthStart, nowIST, todayYMD, weekStart,
} from './dateutil';

describe('dateutil', () => {
  it('adds days across month, year and leap day', () => {
    expect(addDays('2026-03-31', 1)).toBe('2026-04-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('finds Monday of the week', () => {
    expect(weekStart('2026-03-12')).toBe('2026-03-09'); // Thursday
    expect(weekStart('2026-03-15')).toBe('2026-03-09'); // Sunday
    expect(weekStart('2026-03-09')).toBe('2026-03-09'); // Monday
  });

  it('finds month start and end', () => {
    expect(monthStart('2026-03-12')).toBe('2026-03-01');
    expect(monthEnd('2026-02-10')).toBe('2026-02-28');
    expect(monthEnd('2024-02-10')).toBe('2024-02-29');
    expect(monthEnd('2026-12-01')).toBe('2026-12-31');
  });

  it('adds months and keeps the day inside the month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('formats dates', () => {
    expect(fmt('2026-03-05')).toBe('5 Mar 2026');
    expect(fmt(null)).toBe('Not recorded');
    expect(fmt('garbage')).toBe('Not recorded');
    expect(fmt(undefined, '-')).toBe('-');
    expect(fmtDay('2026-03-12')).toBe('Thu, 12 Mar 2026');
    expect(fmtMonth('2026-03-12')).toBe('March 2026');
  });

  it('takes today in India time, not UTC', () => {
    // 2026-03-10 20:00 UTC is already 11 March, 01:30 in India
    const t = new Date('2026-03-10T20:00:00Z');
    expect(todayYMD(t)).toBe('2026-03-11');
    expect(nowIST(t)).toBe('2026-03-11T01:30:00+05:30');
  });

  it('today looks like a date', () => {
    expect(todayYMD()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(nowIST()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/);
  });
});
// end of dateutil.test.ts
