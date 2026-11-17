import { describe, it, expect } from 'vitest';
import { buildCaseHistory, buildCauseList } from '../core/pdfmodel';
import type { AuditEvent, CaseRecord, HearingRecord } from '../core/types';
import { renderCauseListPdf, renderHistoryPdf } from './pdf';

const c = {
  id: 'c1',
  caseNumber: 'TEST-1',
  caseYear: '2026',
  caseType: 'Civil',
  caseTypeOriginal: 'civil',
  court: { name: 'Court A', number: '4' },
  parties: { petitioner: 'A Kumar', respondent: 'B Singh', oppositeCounsel: 'Adv X' },
  legalSections: { sections: '138 NI Act' },
  status: 'Pending',
  priority: 'High',
  currentProceeding: 'Evidence',
  notes: 'Line one.\n\nLine two with a long text '.repeat(30),
  entryDate: '2026-11-01',
  entryDateSource: 'app',
  initialHearingDate: '2026-11-14',
  nextHearingDate: '2026-11-20',
  lastHearingDate: '2026-11-14',
  totalHearings: 1,
  createdAt: '',
  updatedAt: '',
  legacy: { sourceKey: 'app', raw: null },
} as unknown as CaseRecord;

const hs = [
  { id: 'h1', caseId: 'c1', hearingDate: '2026-11-14', state: 'completed', proceedings: 'Arguments', courtOrder: 'Adjourned', notes: 'n', nextDateFixed: '2026-11-20', source: 'app' },
  { id: 'h2', caseId: 'c1', hearingDate: '2026-11-20', state: 'scheduled', proceedings: '', courtOrder: '', notes: '', nextDateFixed: null, source: 'app' },
] as unknown as HearingRecord[];

const audit = [
  { id: 'a1', caseId: 'c1', at: '2026-11-14T10:00:00+05:30', actor: 'user', action: 'created', detail: 'ok' },
] as unknown as AuditEvent[];

function isPdf(bytes: Uint8Array): boolean {
  return String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]) === '%PDF-';
}

describe('pdf rendering', () => {
  it('renders a cause list (with data and empty)', () => {
    const m = buildCauseList([c], hs, '2026-11-14', '2026-11-20', '2026-11-14');
    const f = renderCauseListPdf(m);
    expect(isPdf(f.bytes)).toBe(true);
    expect(f.bytes.length).toBeGreaterThan(1500);
    expect(f.name).toBe('cause-list-2026-11-14_to_2026-11-20.pdf');
    const e = renderCauseListPdf(buildCauseList([c], hs, '2027-01-01', '2027-01-01', '2026-11-14'));
    expect(isPdf(e.bytes)).toBe(true);
  });

  it('renders a case history with a long note', () => {
    const m = buildCaseHistory(c, hs, audit, '2026-11-14');
    const f = renderHistoryPdf(m);
    expect(isPdf(f.bytes)).toBe(true);
    expect(f.bytes.length).toBeGreaterThan(2000);
    expect(f.name).toBe('case-history-TEST-1-2026.pdf');
    expect(f.warning).toBe('');
  });
});
// end of pdf.test.ts
