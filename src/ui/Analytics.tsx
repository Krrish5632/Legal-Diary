import { useMemo } from 'react';
import type { CaseRecord, HearingRecord } from '../core/types';
import { countBy, hearingsHeldByMonth } from '../core/stats';
import { todayYMD } from './dateutil';

function Bars({ title, rows }: { title: string; rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return (
    <div className="card p3-gap">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <div className="empty">No data.</div>
      ) : (
        rows.map(([k, n]) => (
          <div className="p3-bar" key={k}>
            <div className="p3-bar-label" title={k}>{k}</div>
            <div className="p3-bar-track"><div className="p3-bar-fill" style={{ width: (n / max) * 100 + '%' }} /></div>
            <div className="p3-bar-n">{n}</div>
          </div>
        ))
      )}
    </div>
  );
}

export function Analytics({ cases, hearings }: { cases: CaseRecord[]; hearings: HearingRecord[] }) {
  const today = todayYMD();
  const d = useMemo(() => ({
    status: countBy(cases, c => c.status),
    type: countBy(cases, c => c.caseType),
    court: countBy(cases, c => c.court.name || 'Not recorded').slice(0, 8),
    year: countBy(cases, c => c.caseYear || 'Not recorded').sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8),
    held: hearingsHeldByMonth(hearings, today, 6),
    done: hearings.filter(h => h.state === 'completed').length,
    sched: hearings.filter(h => h.state === 'scheduled').length,
  }), [cases, hearings, today]);

  return (
    <div>
      <div className="p3-grid">
        <div className="p3-stat"><div className="p3-num">{cases.length}</div><div className="p3-lab">Total cases</div></div>
        <div className="p3-stat"><div className="p3-num">{d.done}</div><div className="p3-lab">Hearings held (recorded)</div></div>
        <div className="p3-stat"><div className="p3-num">{d.sched}</div><div className="p3-lab">Hearings scheduled</div></div>
        <div className="p3-stat"><div className="p3-num">{cases.filter(c => c.priority === 'High').length}</div><div className="p3-lab">High priority</div></div>
      </div>
      <div className="note">
        These numbers come only from data saved in this app. Past hearing dates of old cases were not recorded
        in the old app, so the history starts from now.
      </div>
      <Bars title="Cases by status" rows={d.status} />
      <Bars title="Cases by type" rows={d.type} />
      <Bars title="Cases by court (top 8)" rows={d.court} />
      <Bars title="Cases by case year" rows={d.year} />
      <Bars title="Hearings held, last 6 months" rows={d.held} />
    </div>
  );
}
// end of Analytics.tsx
