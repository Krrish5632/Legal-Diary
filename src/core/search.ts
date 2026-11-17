import type { CaseRecord, HearingRecord } from './types';
import { normalizeLegacyDate } from './dates';

export function caseHaystack(c: CaseRecord): string {
  return [
    c.caseNumber, c.caseYear, c.caseType, c.court?.name, c.court?.number, c.court?.judgeName,
    c.parties?.plaintiff, c.parties?.defendant, c.parties?.oppositeCounsel,
    c.legalSections?.policeStation, c.legalSections?.firNumber, c.legalSections?.sections,
    c.currentProceeding, c.notes, c.status, c.priority,
    c.nextHearingDate, c.lastHearingDate, c.initialHearingDate, c.entryDate,
  ].filter(Boolean).join(' ').toLowerCase();
}

export interface SearchHit {
  kind: 'case' | 'hearing';
  c: CaseRecord;
  h: HearingRecord | null;
  snippet: string;
}

function snippet(text: string, token: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const i = flat.toLowerCase().indexOf(token);
  if (i < 0) return flat.slice(0, 80);
  const s = Math.max(0, i - 30);
  const e = i + token.length + 50;
  return (s > 0 ? '...' : '') + flat.slice(s, e) + (e < flat.length ? '...' : '');
}

/** One search over cases and hearing texts. A date such as 10/03/2026 finds that day's hearings. */
export function searchAll(cases: CaseRecord[], hearings: HearingRecord[], query: string, limit = 60): SearchHit[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  const date = normalizeLegacyDate(q);
  const byId = new Map(cases.map(c => [c.id, c] as [string, CaseRecord]));

  const caseHits: SearchHit[] = cases
    .filter(c => {
      const hs = caseHaystack(c);
      return tokens.every(t => hs.includes(t));
    })
    .sort((a, b) => {
      const pa = a.priority === 'High' ? 0 : 1;
      const pb = b.priority === 'High' ? 0 : 1;
      return pa - pb || (a.nextHearingDate ?? '9999-99-99').localeCompare(b.nextHearingDate ?? '9999-99-99');
    })
    .map(c => ({ kind: 'case' as const, c, h: null, snippet: '' }));

  const hearingHits: SearchHit[] = [];
  for (const h of hearings) {
    const c = byId.get(h.caseId);
    if (!c) continue;
    const text = [h.proceedings, h.courtOrder, h.notes].filter(Boolean).join(' | ');
    const lower = text.toLowerCase();
    const byText = text !== '' && tokens.every(t => lower.includes(t));
    const byDate = date !== null && h.hearingDate === date;
    if (!byText && !byDate) continue;
    hearingHits.push({ kind: 'hearing', c, h, snippet: byText ? snippet(text, tokens[0]) : 'Hearing on this date' });
  }
  hearingHits.sort((a, b) => (b.h?.hearingDate ?? '').localeCompare(a.h?.hearingDate ?? ''));

  return [...caseHits, ...hearingHits].slice(0, limit);
}
// end of search.ts
