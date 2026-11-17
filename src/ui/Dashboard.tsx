import { useMemo } from 'react';
import type { CaseRecord, HearingRecord } from '../core/types';
import { dashboardStats } from '../core/stats';
import { fmt, todayYMD } from './dateutil';
import { CaseRow } from './shared';
import type { Tab } from './shared';

interface Pair { c: CaseRecord; h: HearingRecord }

function order(a: Pair, b: Pair): number {
  const pa = a.c.priority === 'High' ? 0 : 1;
  const pb = b.c.priority === 'High' ? 0 : 1;
  return pa - pb || a.h.hearingDate.localeCompare(b.h.hearingDate) || a.c.caseNumber.localeCompare(b.c.caseNumber);
}

function Section({ title, pairs, onOpen, showDate }: {
  title: string; pairs: Pair[]; onOpen: (c: CaseRecord) => void; showDate: boolean;
}) {
  const max = 8;
  return (
    <>
      <h3 className="p3-sec">{title} ({pairs.length})</h3>
      {pairs.length === 0 ? (
        <div className="card empty">Nothing here.</div>
      ) : (
        <div className="card list">
          {pairs.slice(0, max).map(p => (
            <CaseRow key={p.h.id} c={p.c} right={showDate ? fmt(p.h.hearingDate) : undefined} onOpen={onOpen} />
          ))}
          {pairs.length > max && <div className="note">and {pairs.length - max} more - see the Cause List.</div>}
        </div>
      )}
    </>
  );
}

export function Dashboard({ cases, hearings, onOpen, go }: {
  cases: CaseRecord[]; hearings: HearingRecord[]; onOpen: (c: CaseRecord) => void; go: (t: Tab) => void;
}) {
  const today = todayYMD();
  const stats = useMemo(() => dashboardStats(cases, hearings, today), [cases, hearings, today]);

  const { todayList, overdueList } = useMemo(() => {
    const byId = new Map(cases.map(c => [c.id, c] as [string, CaseRecord]));
    const t: Pair[] = [];
    const o: Pair[] = [];
    for (const h of hearings) {
      const c = byId.get(h.caseId);
      if (!c || c.status === 'Disposed' || h.state !== 'scheduled') continue;
      if (h.hearingDate === today) t.push({ c, h });
      else if (h.hearingDate < today) o.push({ c, h });
    }
    return { todayList: t.sort(order), overdueList: o.sort(order) };
  }, [cases, hearings, today]);

  return (
    <div>
      <div className="p3-grid">
        <div className="p3-stat"><div className="p3-num">{stats.today}</div><div className="p3-lab">Hearings today</div></div>
        <div className="p3-stat"><div className="p3-num">{stats.tomorrow}</div><div className="p3-lab">Hearings tomorrow</div></div>
        <div className="p3-stat"><div className="p3-num">{stats.next7}</div><div className="p3-lab">Next 7 days (after today)</div></div>
        <div className={'p3-stat' + (stats.overdue > 0 ? ' warn' : '')}>
          <div className="p3-num">{stats.overdue}</div><div className="p3-lab">Date passed, not updated</div>
        </div>
        <div className="p3-stat"><div className="p3-num">{stats.pending}</div><div className="p3-lab">Pending cases</div></div>
        <div className="p3-stat"><div className="p3-num">{stats.urgent}</div><div className="p3-lab">Urgent cases</div></div>
        <div className="p3-stat"><div className="p3-num">{stats.highPriority}</div><div className="p3-lab">High priority</div></div>
        <div className="p3-stat"><div className="p3-num">{stats.disposed}</div><div className="p3-lab">Disposed</div></div>
      </div>
      {stats.noNextDate > 0 && (
        <div className="banner">{stats.noNextDate} open case(s) have no next date. Open the case and use Update Next Date.</div>
      )}
      <Section title="Today's hearings" pairs={todayList} onOpen={onOpen} showDate={false} />
      <Section title="Date passed - update pending" pairs={overdueList} onOpen={onOpen} showDate={true} />
      <div className="p3-more">
        <button className="btn primary" onClick={() => go('causelist')}>Open Cause List</button>
      </div>
      <div className="note">{cases.length} cases, {hearings.length} hearings saved on this device.</div>
    </div>
  );
}
// end of Dashboard.tsx
