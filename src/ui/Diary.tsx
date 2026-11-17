import { useEffect, useMemo, useState } from 'react';
import type { AuditEvent, CaseRecord, HearingRecord } from '../core/types';
import { repo } from './store';
import { addDays, fmt, fmtDay, isDateText, todayYMD } from './dateutil';
import { caseTitle } from './shared';

export function auditLabel(a: AuditEvent): string {
  const d = a.detail;
  switch (a.action) {
    case 'migrated': return 'Imported from old app';
    case 'created': return 'Case created';
    case 'rescheduled': return 'Next date changed';
    case 'hearing-added': return 'Past hearing added';
    case 'priority-changed': return 'Priority changed';
    case 'edited':
      if (typeof d.field === 'string') {
        if (d.field === 'status' && typeof d.to === 'string') return 'Status changed to ' + d.to;
        if (d.field === 'notes') return 'Note added';
        return 'Edited: ' + d.field;
      }
      if (Array.isArray(d.changes)) return 'Details edited (' + d.changes.length + ' field(s))';
      return 'Edited';
    default: return 'Updated';
  }
}

export function Diary({ cases, hearings, onOpen }: {
  cases: CaseRecord[]; hearings: HearingRecord[]; onOpen: (c: CaseRecord) => void;
}) {
  const today = todayYMD();
  const [day, setDay] = useState<string>(today);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [auditErr, setAuditErr] = useState('');

  useEffect(() => {
    let alive = true;
    repo.listAudit()
      .then(a => { if (alive) { setAudit(a); setAuditErr(''); } })
      .catch(e => { if (alive) setAuditErr('Could not read the activity log: ' + (e instanceof Error ? e.message : String(e))); });
    return () => { alive = false; };
  }, [cases, hearings]);

  const byId = useMemo(() => new Map(cases.map(c => [c.id, c] as [string, CaseRecord])), [cases]);

  const entries = useMemo(() => {
    const out: { h: HearingRecord; c: CaseRecord }[] = [];
    for (const h of hearings) {
      if (h.hearingDate !== day) continue;
      const c = byId.get(h.caseId);
      if (c) out.push({ h, c });
    }
    return out.sort((a, b) => {
      const pa = a.c.priority === 'High' ? 0 : 1;
      const pb = b.c.priority === 'High' ? 0 : 1;
      return pa - pb || a.c.caseNumber.localeCompare(b.c.caseNumber);
    });
  }, [hearings, byId, day]);

  const recent = useMemo(
    () => [...audit].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15),
    [audit],
  );

  return (
    <div>
      <div className="controls">
        <button className="btn" onClick={() => setDay(addDays(day, -1))}>Prev</button>
        <input
          type="date" className="dateinput" value={day}
          onChange={e => { if (isDateText(e.target.value)) setDay(e.target.value); }}
        />
        <button className="btn" onClick={() => setDay(addDays(day, 1))}>Next</button>
        <button className="btn" onClick={() => setDay(today)}>Today</button>
      </div>
      <h3 className="p3-sec">{fmtDay(day)}{day === today ? ' (Today)' : ''} - {entries.length} hearing(s)</h3>
      {entries.length === 0 && <div className="card empty">No hearing on this day.</div>}
      {entries.map(({ h, c }) => (
        <div className="p3-entry" key={h.id}>
          <div className="row-title">
            {c.priority === 'High' && <span className="pill gold">High</span>}
            {caseTitle(c)}
            <span className={'pill ' + (h.state === 'completed' ? 'grey' : 'green')}>
              {h.state === 'completed' ? 'Done' : 'Scheduled'}
            </span>
          </div>
          <div className="row-sub">{[c.caseNumber, c.court.name].filter(Boolean).join(' - ')}</div>
          {h.proceedings && <div className="p3-pre">Proceedings: {h.proceedings}</div>}
          {h.courtOrder && <div className="p3-pre">Court order: {h.courtOrder}</div>}
          {h.notes && <div className="p3-pre">Notes: {h.notes}</div>}
          {h.nextDateFixed && <div>Next date fixed: {fmt(String(h.nextDateFixed))}</div>}
          <div className="p3-gap"><button className="btn" onClick={() => onOpen(c)}>Open case</button></div>
        </div>
      ))}

      <h3 className="p3-sec">Recent activity</h3>
      {auditErr && <div className="err">{auditErr}</div>}
      {recent.length === 0 ? (
        <div className="card empty">No activity yet.</div>
      ) : (
        <div className="card">
          {recent.map(a => {
            const c = byId.get(a.caseId);
            return (
              <div className="p3-sug" key={a.id}>
                <div>
                  <div>{auditLabel(a)}{c ? ' - ' + caseTitle(c) : ''}</div>
                  <div className="row-sub">{a.at.slice(0, 16).replace('T', ' ')}</div>
                </div>
                {c && <button className="btn" onClick={() => onOpen(c)}>Open</button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
// end of Diary.tsx
