import { isYMD, YMD } from './dates';
import type { AuditEvent, CaseRecord, HearingRecord } from './types';

const join = (...p: string[]) => p.map(x => x.trim()).filter(Boolean).join(' | ');

export interface RescheduleInput { proceedings?: string; courtOrder?: string; notes?: string }
export interface RescheduleResult { case: CaseRecord; upserts: HearingRecord[]; audit: AuditEvent[] }

/** Pure logic: nothing is deleted; the old date stays as history. */
export function rescheduleCase(
  c: CaseRecord, existing: HearingRecord[], newDate: YMD,
  input: RescheduleInput, nowISO: string, actor: string,
): RescheduleResult {
  if (!isYMD(newDate)) throw new Error('Invalid date');
  if (c.status === 'Disposed') throw new Error('Disposed case cannot be given a new date');
  const cur = c.nextHearingDate;
  if (cur === newDate) throw new Error('This is already the next date');

  const all = new Map(existing.filter(h => h.caseId === c.id).map(h => [h.hearingDate, h] as const));
  const target = all.get(newDate);
  if (target && target.state === 'completed')
    throw new Error('This date is already a completed hearing in the history. Choose a different date');
  const upserts: HearingRecord[] = [];

  if (cur) {
    const f = all.get(cur);
    const closed: HearingRecord = f
      ? { ...f, state: 'completed', proceedings: join(f.proceedings, input.proceedings ?? ''),
          courtOrder: join(f.courtOrder, input.courtOrder ?? ''), notes: join(f.notes, input.notes ?? ''),
          nextDateFixed: newDate, updatedAt: nowISO }
      : { id: `${c.id}:${cur}`, caseId: c.id, hearingDate: cur, state: 'completed',
          proceedings: input.proceedings ?? '', courtOrder: input.courtOrder ?? '', notes: input.notes ?? '',
          nextDateFixed: newDate, source: 'app', createdAt: nowISO, updatedAt: nowISO };
    all.set(cur, closed); upserts.push(closed);
  }
  if (!all.has(newDate)) {
    const s: HearingRecord = {
      id: `${c.id}:${newDate}`, caseId: c.id, hearingDate: newDate, state: 'scheduled',
      proceedings: '', courtOrder: '', notes: '', nextDateFixed: null, source: 'app',
      createdAt: nowISO, updatedAt: nowISO,
    };
    all.set(newDate, s); upserts.push(s);
  }
  const done = [...all.values()].filter(h => h.state === 'completed').map(h => h.hearingDate).sort();
  const updated: CaseRecord = {
    ...c, nextHearingDate: newDate,
    lastHearingDate: done.length ? done[done.length - 1] : null,
    totalHearings: done.length, updatedAt: nowISO,
  };
  const audit: AuditEvent[] = [{
    id: `${c.id}:${nowISO}:rescheduled`, caseId: c.id, at: nowISO, actor, action: 'rescheduled',
    detail: { from: cur, to: newDate },
  }];
  return { case: updated, upserts, audit };
}
// end of hearing.ts
