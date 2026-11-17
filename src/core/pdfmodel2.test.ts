import { describe, it, expect } from 'vitest';
import { buildCaseHistory, buildCauseList } from './pdfmodel';
import type { CaseRecord, HearingRecord } from './types';

function mkCase(num: string, year: string): CaseRecord {
  return {
    id: 'c1',
    caseNumber: num,
    caseYear: year,
    caseType: 'Civil',
    caseTypeOriginal: 'Civil',
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
  } as unknown as CaseRecord;
}

const hearing = {
  id: 'h1',
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
} as unknown as HearingRecord;

function rowNo(num: string, year: string): string {
  const m = buildCauseList([mkCase(num, year)], [hearing], '2026-11-14', '2026-11-14', '2026-11-14');
  return m.days[0].rows[0].caseNo;
}

describe('case number in PDF', () => {
  it('does not repeat a year that is already in the case number', () => {
    expect(rowNo('3753/2022', '2022')).toBe('3753/2022');
  });

  it('adds the year when it is missing, and keeps a different year visible', () => {
    expect(rowNo('113', '2023')).toBe('113/2023');
    expect(rowNo('3753/2021', '2022')).toBe('3753/2021/2022');
    expect(rowNo('00', '')).toBe('00');
  });

  it('uses the same number in the history PDF and its file name', () => {
    const m = buildCaseHistory(mkCase('3753/2022', '2022'), [hearing], [], '2026-11-14');
    expect(m.caseNo).toBe('3753/2022');
    expect(m.fileName).toBe('case-history-3753-2022.pdf');
  });
});
// end of pdfmodel2.test.ts
