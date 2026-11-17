import { describe, it, expect } from 'vitest';
import { buildCaseHistory, buildCauseList, fmtDate, fmtDay } from './pdfmodel';
import type { AuditEvent, CaseRecord, HearingRecord } from './types';

function mkCase(o: Record<string, unknown>): CaseRecord {
  return {
    id: 'c1',
    caseNumber: '1',
    caseYear: '2026',
    caseType: 'Civil',
    caseTypeOriginal: 'civil',
    court: { name: 'Court A' },
    parties: { petitioner: 'P', respondent: 'R' },
    legalSections: {},
    status: 'Pending',
    priority: 'Normal',
    currentProceeding: '',
    notes: '',
    entryDate: '2026-11-01',
    entryDateSource: 'app',
    initialHearingDate: '2026-11-14',
    nextHearingDate: '2026-11-14',
    lastHearingDate: null,
    totalHearings: 0,
    createdAt: '',
    updatedAt: '',
    legacy: { sourceKey: 'app', raw: null },
    ...o,
  } as unknown as CaseRecord;
}

function mkHearing(o: Record<string, unknown>): HearingRecord {
  return {
    id: 'x',
    caseId: 'c1',
    hearingDate: '2026-11-14',
    state: 'scheduled',
    proceedings: '',
    courtOrder: '',
    notes: '',
    nextDateFixed: null,
    source: 'app',
    createdAt: '',
    updatedAt: '',
    ...o,
  } as unknown as HearingRecord;
}

describe('pdfmodel', () => {
  it('formats dates', () => {
    expect(fmtDate('2026-11-14')).toBe('14 Nov 2026');
    expect(fmtDay('2026-11-14')).toBe('Sat, 14 Nov 2026');
    expect(fmtDate(null)).toBe('-');
    expect(fmtDate('garbage')).toBe('-');
  });

  it('lists a day with high priority first and shows moved hearings', () => {
    const c1 = mkCase({ id: 'c1', caseNumber: '10' });
    const c2 = mkCase({ id: 'c2', caseNumber: '2', priority: 'High' });
    const c3 = mkCase({ id: 'c3', caseNumber: '9' });
    const hs = [
      mkHearing({ caseId: 'c1' }),
      mkHearing({ caseId: 'c2' }),
      mkHearing({ caseId: 'c3', state: 'completed', nextDateFixed: '2026-11-20' }),
    ];
    const m = buildCauseList([c1, c2, c3], hs, '2026-11-14', '2026-11-14', '2026-11-14');
    expect(m.total).toBe(3);
    expect(m.highCount).toBe(1);
    expect(m.days).toHaveLength(1);
    expect(m.days[0].label).toBe('Sat, 14 Nov 2026');
    expect(m.days[0].rows.map((r) => r.caseNo)).toEqual(['2/2026', '9/2026', '10/2026']);
    expect(m.days[0].rows.map((r) => r.no)).toEqual([1, 2, 3]);
    expect(m.days[0].rows[0].high).toBe(true);
    expect(m.days[0].rows[1].status).toBe('Heard - next 20 Nov 2026');
    expect(m.days[0].rows[2].status).toBe('Listed');
    expect(m.fileName).toBe('cause-list-2026-11-14.pdf');
  });

  it('handles ranges, empty periods and bad ranges', () => {
    const c1 = mkCase({ id: 'c1' });
    const hs = [
      mkHearing({ caseId: 'c1', hearingDate: '2026-11-14' }),
      mkHearing({ caseId: 'c1', hearingDate: '2026-11-15' }),
      mkHearing({ caseId: 'c1', hearingDate: '2026-11-30' }),
      mkHearing({ caseId: 'ghost', hearingDate: '2026-11-15' }),
    ];
    const m = buildCauseList([c1], hs, '2026-11-14', '2026-11-16', '2026-11-14');
    expect(m.days.map((d) => d.date)).toEqual(['2026-11-14', '2026-11-15']);
    expect(m.total).toBe(2);
    expect(m.fileName).toBe('cause-list-2026-11-14_to_2026-11-16.pdf');
    const empty = buildCauseList([c1], hs, '2027-01-01', '2027-01-31', '2026-11-14', 'January 2027');
    expect(empty.days).toHaveLength(0);
    expect(empty.total).toBe(0);
    expect(empty.period).toContain('January 2027');
    expect(() => buildCauseList([c1], hs, '2026-11-16', '2026-11-14', '2026-11-14')).toThrow();
    expect(() => buildCauseList([c1], hs, 'bad', '2026-11-14', '2026-11-14')).toThrow();
  });

  it('replaces letters a PDF cannot draw and counts them', () => {
    const c = mkCase({ parties: { petitioner: 'Ram\u2019s \u0939\u093F', respondent: 'R' } });
    const m = buildCauseList([c], [mkHearing({})], '2026-11-14', '2026-11-14', '2026-11-14');
    expect(m.days[0].rows[0].title).toBe("Ram's ?? vs R");
    expect(m.unsupportedChars).toBe(2);
  });

  it('builds a history in date order and marks old-data gaps honestly', () => {
    const c = mkCase({ legacy: { sourceKey: 'old', raw: {} }, entryDate: null, entryDateSource: 'unknown' });
    const hs = [
      mkHearing({ hearingDate: '2026-12-01' }),
      mkHearing({ hearingDate: '2026-10-01', state: 'completed', proceedings: 'Evidence', nextDateFixed: '2026-11-01' }),
      mkHearing({ hearingDate: '2026-11-01' }),
    ];
    const m = buildCaseHistory(c, hs, [], '2026-11-14');
    expect(m.hearings.map((h) => h.date)).toEqual(['1 Oct 2026', '1 Nov 2026', '1 Dec 2026']);
    expect(m.hearings.map((h) => h.status)).toEqual(['Heard', 'Date passed - not updated', 'Upcoming']);
    expect(m.hearings[0].next).toBe('1 Nov 2026');
    expect(m.info.find((i) => i[0] === 'Entry date')?.[1]).toBe('Not recorded');
    expect(m.footnote).toBe('');
    const only = buildCaseHistory(c, [mkHearing({})], [], '2026-11-14');
    expect(only.footnote).toContain('not recorded by the old app');
    const fresh = buildCaseHistory(mkCase({}), [mkHearing({})], [], '2026-11-14');
    expect(fresh.footnote).toBe('');
  });

  it('shows case details, parties and the change log of this case only', () => {
    const c = mkCase({
      court: { name: 'Court A', judge: 'J' },
      parties: { petitioner: 'P', respondent: 'R', oppositeCounsel: 'Adv X' },
      legalSections: { ipc: '420' },
    });
    const audit = [
      { id: 'a1', caseId: 'c1', at: '2026-11-14T10:00:00+05:30', actor: 'user', action: 'rescheduled', detail: 'x' },
      { id: 'a2', caseId: 'other', at: '2026-11-14T11:00:00+05:30', actor: 'user', action: 'created', detail: 'y' },
    ] as unknown as AuditEvent[];
    const m = buildCaseHistory(c, [], audit, '2026-11-14');
    expect(m.title).toBe('P vs R');
    expect(m.info).toContainEqual(['Court - Name', 'Court A']);
    expect(m.info).toContainEqual(['Parties - Opposite counsel', 'Adv X']);
    expect(m.info).toContainEqual(['Legal sections - Ipc', '420']);
    expect(m.log).toHaveLength(1);
    expect(m.log[0].what).toBe('Next date changed');
    expect(m.log[0].when).toBe('2026-11-14 10:00');
  });

  it('makes safe file names', () => {
    const m = buildCaseHistory(mkCase({ caseNumber: 'TEST-1' }), [], [], '2026-11-14');
    expect(m.fileName).toBe('case-history-TEST-1-2026.pdf');
    const odd = buildCaseHistory(mkCase({ caseNumber: '\u0939\u093F', caseYear: '' }), [], [], '2026-11-14');
    expect(odd.fileName).toBe('case-history-case.pdf');
  });
});
// end of pdfmodel.test.ts
