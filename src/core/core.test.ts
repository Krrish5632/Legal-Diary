import { describe, it, expect } from 'vitest';
import { normalizeLegacyDate, addDays, reminderInstant, toYMDInIST } from './dates';
import { migrateLegacy, verifyMigration } from './migrate';
import { rescheduleCase } from './hearing';

const now = '2026-01-10T10:00:00.000Z';
const legacy = (o: any = {}) => ({ id: 'abc123xyz', caseNumber: '1/2024', caseType: 'civil ', filingYear: 2024,
  status: 'Pending', priority: false, nextDate: '2026-02-01', history: [], documents: [], voiceNotes: [], ...o });

describe('dates', () => {
  it('IST midnight edge', () => expect(toYMDInIST(new Date('2026-01-09T19:00:00Z'))).toBe('2026-01-10'));
  it('legacy formats', () => {
    expect(normalizeLegacyDate('05/03/2025')).toBe('2025-03-05');
    expect(normalizeLegacyDate('31/02/2025')).toBeNull();
    expect(normalizeLegacyDate('garbage')).toBeNull();
  });
  it('reminder', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(reminderInstant('2026-03-01')).toBe('2026-02-28T17:00:00+05:30');
  });
});

describe('migration', () => {
  it('keeps count, never invents dates', () => {
    const res = migrateLegacy([legacy(), legacy({ id: 'two', nextDate: '', createdAt: 'bad' })], now);
    expect(verifyMigration(res)).toEqual([]);
    expect(res.cases).toHaveLength(2);
    expect(res.cases[0].caseType).toBe('Civil');
    expect(res.cases[0].initialHearingDate).toBeNull();
    expect(res.cases[1].nextHearingDate).toBeNull();
    expect(res.cases[1].entryDate).toBeNull();
  });
  it('is idempotent', () => {
    const a = migrateLegacy([legacy()], now), b = migrateLegacy([legacy()], now);
    expect(a.hearings.map(h => h.id)).toEqual(b.hearings.map(h => h.id));
  });
  it('merges same-date history, counts unparsed', () => {
    const res = migrateLegacy([legacy({ history: [
      { date: '2025-05-01', proceeding: 'A' }, { date: '2025-05-01', proceeding: 'B' }, { date: 'x' } ] })], now);
    expect(verifyMigration(res)).toEqual([]);
    expect(res.report.historyMergedSameDate).toBe(1);
    expect(res.report.historyUnparsed).toBe(1);
  });
  it('refuses duplicate ids', () => {
    expect(() => migrateLegacy([legacy(), legacy()], now)).toThrow();
  });
});

describe('reschedule', () => {
  it('keeps old date as history, adds new', () => {
    const m = migrateLegacy([legacy()], now);
    const r = rescheduleCase(m.cases[0], m.hearings, '2026-03-01', { proceedings: 'Evidence' }, now, 'me');
    expect(r.case.nextHearingDate).toBe('2026-03-01');
    expect(r.case.lastHearingDate).toBe('2026-02-01');
    expect(r.case.totalHearings).toBe(1);
    expect(r.upserts.map(h => h.state).sort()).toEqual(['completed', 'scheduled']);
  });
  it('rejects same date', () => {
    const m = migrateLegacy([legacy()], now);
    expect(() => rescheduleCase(m.cases[0], m.hearings, '2026-02-01', {}, now, 'me')).toThrow();
  });
});