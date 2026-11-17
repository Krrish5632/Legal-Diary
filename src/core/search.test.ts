import { describe, it, expect } from 'vitest';
import { searchAll } from './search';
import type { CaseRecord, HearingRecord } from './types';

const mkCase = (id: string, plaintiff: string, num: string, extra: Record<string, unknown> = {}) => ({
  id, caseNumber: num, caseYear: '2025', caseType: 'Civil',
  court: { name: 'District Court' }, parties: { plaintiff, defendant: 'B Singh' }, legalSections: {},
  currentProceeding: '', notes: '', status: 'Pending', priority: 'Normal',
  entryDate: null, initialHearingDate: '2026-03-10', nextHearingDate: '2026-03-10', lastHearingDate: null,
  ...extra,
}) as unknown as CaseRecord;

const mkHearing = (caseId: string, date: string, extra: Record<string, unknown> = {}) => ({
  id: caseId + ':' + date, caseId, hearingDate: date, state: 'scheduled',
  proceedings: '', courtOrder: '', notes: '', nextDateFixed: null, ...extra,
}) as unknown as HearingRecord;

describe('searchAll', () => {
  const cases = [
    mkCase('1', 'A Kumar', '101', { notes: 'bail pending' }),
    mkCase('2', 'C Devi', '202', { priority: 'High' }),
    mkCase('3', 'A Kumar', '303'),
  ];
  const hearings = [
    mkHearing('1', '2026-03-10', { courtOrder: 'Notice issued to the respondent' }),
    mkHearing('2', '2026-04-15'),
  ];

  it('finds by name and by case number, ignoring case', () => {
    expect(searchAll(cases, hearings, 'a KUMAR').filter(h => h.kind === 'case')).toHaveLength(2);
    expect(searchAll(cases, hearings, '202')[0].c.id).toBe('2');
  });

  it('needs every word to match', () => {
    const r = searchAll(cases, hearings, 'kumar bail').filter(h => h.kind === 'case');
    expect(r).toHaveLength(1);
    expect(r[0].c.id).toBe('1');
  });

  it('finds hearings by text with a snippet', () => {
    const r = searchAll(cases, hearings, 'respondent').filter(h => h.kind === 'hearing');
    expect(r).toHaveLength(1);
    expect(r[0].snippet).toContain('respondent');
  });

  it('finds a hearing by Indian style date', () => {
    const r = searchAll(cases, hearings, '15/04/2026').filter(h => h.kind === 'hearing');
    expect(r).toHaveLength(1);
    expect(r[0].c.id).toBe('2');
  });

  it('returns nothing for a very short query and respects the limit', () => {
    expect(searchAll(cases, hearings, 'a')).toEqual([]);
    expect(searchAll(cases, hearings, 'kumar', 1)).toHaveLength(1);
  });

  it('puts high priority cases first', () => {
    const r = searchAll(cases, hearings, 'district');
    expect(r[0].c.id).toBe('2');
  });
});
// end of search.test.ts
