import type { YMD } from './dates';

export type CaseStatus = 'Pending' | 'Urgent' | 'Disposed';
export type Priority = 'High' | 'Normal';
export type CaseType = 'Civil' | 'Criminal' | 'Revenue' | 'Other';
export type HearingState = 'scheduled' | 'completed';

export interface CaseRecord {
  id: string;
  caseNumber: string;
  caseYear: string;
  caseType: CaseType;
  caseTypeOriginal: string;
  court: Record<string, string>;
  parties: Record<string, string>;
  legalSections: Record<string, string>;
  status: CaseStatus;
  priority: Priority;
  currentProceeding: string;
  notes: string;
  entryDate: YMD | null;
  entryDateSource: 'legacy-createdAt' | 'unknown' | 'app';
  initialHearingDate: YMD | null; // never invented for old cases
  nextHearingDate: YMD | null;
  lastHearingDate: YMD | null;
  totalHearings: number;
  createdAt: string | null;
  updatedAt: string | null;
  legacy: { sourceKey: string; raw: unknown };
}

export interface HearingRecord {
  id: string;               // `${caseId}:${hearingDate}` -> unique per case+date
  caseId: string;
  hearingDate: YMD;
  state: HearingState;
  proceedings: string;
  courtOrder: string;
  notes: string;
  nextDateFixed: YMD | null;
  source: 'legacy-history' | 'legacy-nextDate' | 'app';
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  caseId: string;
  at: string;
  actor: string;
  action: 'migrated' | 'created' | 'rescheduled' | 'edited' | 'hearing-added' | 'priority-changed';
  detail: Record<string, unknown>;
}
// end of types.ts
