import { useMemo, useState } from 'react';
import type { CaseRecord, HearingRecord } from '../core/types';
import { buildCauseList } from '../core/pdfmodel';
import {
  addDays, addMonths, fmt, fmtDay, fmtMonth, isDateText,
  monthEnd, monthStart, todayYMD, weekStart,
} from './dateutil';
import { PdfButtons } from './PdfButtons';
import { renderCauseListPdf } from './pdf';

type View = 'daily' | 'weekly' | 'monthly' | 'date' | 'upcoming';

const VIEWS: { id: View; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'date', label: 'Date' },
  { id: 'upcoming', label: 'Upcoming' },
];

interface Entry { h: HearingRecord; c: CaseRecord }

function sortEntries(a: Entry, b: Entry): number {
  const pa = a.c.priority === 'High' ? 0 : 1;
  const pb = b.c.priority === 'High' ? 0 : 1;
  return pa - pb || a.c.caseNumber.localeCompare(b.c.caseNumber);
}

function group(list: Entry[]): [string, Entry[]][] {
  const m = new Map<string, Entry[]>();
  for (const e of list) {
    const k = e.h.hearingDate;
    const arr = m.get(k);
    if (arr) arr.push(e); else m.set(k, [e]);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([d, l]) => [d, l.sort(sortEntries)] as [string, Entry[]]);
}

function rangeFor(view: View, anchor: string, today: string): [string, string] {
  if (view === 'weekly') { const s = weekStart(anchor); return [s, addDays(s, 6)]; }
  if (view === 'monthly') return [monthStart(anchor), monthEnd(anchor)];
  if (view === 'upcoming') return [today, addDays(today, 30)];
  return [anchor, anchor];
}

function title(c: CaseRecord): string {
  return `${c.parties.plaintiff || '-'} vs ${c.parties.defendant || '-'}`;
}

function Row({ e, today, onOpen }: { e: Entry; today: string; onOpen: (c: CaseRecord) => void }) {
  const { h, c } = e;
  const passed = h.state === 'scheduled' && h.hearingDate < today;
  const sub = [c.caseNumber, c.court.name].filter(Boolean).join(' - ');
  const proceeding = h.proceedings || (h.state === 'scheduled' ? c.currentProceeding : '');
  return (
    <button className="row" onClick={() => onOpen(c)}>
      <div className="row-main">
        <div className="row-title">
          {c.priority === 'High' && <span className="pill gold">High</span>}
          {title(c)}
        </div>
        <div className="row-sub">{sub}</div>
        {proceeding && <div className="row-note">{proceeding}</div>}
      </div>
      <div className="row-side">
        <span className={'pill ' + (c.status === 'Urgent' ? 'red' : c.status === 'Disposed' ? 'grey' : 'blue')}>
          {c.status}
        </span>
        {h.state === 'completed' ? (
          <span className="pill grey">
            Done{h.nextDateFixed ? ' - moved to ' + fmt(String(h.nextDateFixed)) : ''}
          </span>
        ) : passed ? (
          <span className="pill red">Date passed - update pending</span>
        ) : (
          <span className="pill green">Scheduled</span>
        )}
      </div>
    </button>
  );
}

function Group({ date, list, today, showHead, onOpen }: {
  date: string; list: Entry[]; today: string; showHead: boolean; onOpen: (c: CaseRecord) => void;
}) {
  return (
    <section className="group">
      {showHead && (
        <h3 className="day-head">
          {fmtDay(date)}{date === today ? ' (Today)' : ''}
          <span className="count">{list.length}</span>
        </h3>
      )}
      <div className="card list">
        {list.map(e => <Row key={e.h.id} e={e} today={today} onOpen={onOpen} />)}
      </div>
    </section>
  );
}

export function CauseList({ cases, hearings, onOpen }: {
  cases: CaseRecord[]; hearings: HearingRecord[]; onOpen: (c: CaseRecord) => void;
}) {
  const today = todayYMD();
  const [view, setView] = useState<View>('daily');
  const [anchor, setAnchor] = useState<string>(today);

  const entries = useMemo(() => {
    const byId = new Map(cases.map(c => [c.id, c] as [string, CaseRecord]));
    const out: Entry[] = [];
    for (const h of hearings) {
      const c = byId.get(h.caseId);
      if (c) out.push({ h, c });
    }
    return out;
  }, [cases, hearings]);

  const overdue = useMemo(
    () => entries.filter(e => e.h.state === 'scheduled' && e.h.hearingDate < today),
    [entries, today],
  );

  const [from, to] = rangeFor(view, anchor, today);
  const inRange = entries.filter(e =>
    e.h.hearingDate >= from && e.h.hearingDate <= to &&
    (view !== 'upcoming' || e.h.state === 'scheduled'));
  const groups = group(inRange);
  const highCount = inRange.filter(e => e.c.priority === 'High').length;
  const multiDay = view === 'weekly' || view === 'monthly' || view === 'upcoming';

  function step(dir: 1 | -1) {
    if (view === 'daily') setAnchor(addDays(anchor, dir));
    else if (view === 'weekly') setAnchor(addDays(anchor, 7 * dir));
    else if (view === 'monthly') setAnchor(addMonths(anchor, dir));
  }

  let label = '';
  if (view === 'daily') label = fmtDay(anchor);
  else if (view === 'weekly') label = `${fmt(from)} to ${fmt(to)}`;
  else if (view === 'monthly') label = fmtMonth(anchor);
  else if (view === 'upcoming') label = `Next 30 days (${fmt(from)} to ${fmt(to)})`;

  function makePdf() {
    const hs = view === 'upcoming' ? hearings.filter(h => h.state === 'scheduled') : hearings;
    const periodLabel = view === 'monthly' ? fmtMonth(anchor) : view === 'upcoming' ? 'Next 30 days' : undefined;
    return renderCauseListPdf(buildCauseList(cases, hs, from, to, today, periodLabel));
  }

  return (
    <div>
      <div className="tabs">
        {VIEWS.map(v => (
          <button key={v.id} className={'tab' + (view === v.id ? ' active' : '')} onClick={() => setView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>

      <div className="controls">
        {(view === 'daily' || view === 'weekly' || view === 'monthly') && (
          <>
            <button className="btn" onClick={() => step(-1)}>Prev</button>
            <div className="label">{label}</div>
            <button className="btn" onClick={() => step(1)}>Next</button>
            <button className="btn" onClick={() => setAnchor(today)}>Today</button>
          </>
        )}
        {view === 'date' && (
          <>
            <input
              type="date" className="dateinput" value={anchor}
              onChange={e => { if (isDateText(e.target.value)) setAnchor(e.target.value); }}
            />
            <div className="label">{fmtDay(anchor)}</div>
          </>
        )}
        {view === 'upcoming' && <div className="label">{label}</div>}
      </div>

      <div className="summary">
        {inRange.length} hearing(s)
        {highCount > 0 ? ` - ${highCount} high priority` : ''}
      </div>

      <PdfButtons make={makePdf} />

      {view !== 'upcoming' && overdue.length > 0 && (
        <div className="banner">
          {overdue.length} case(s) have a hearing date that has passed and is not updated yet.
          <button className="linkbtn" onClick={() => setView('upcoming')}>Show</button>
        </div>
      )}

      {view === 'upcoming' && overdue.length > 0 && (
        <section className="group">
          <h3 className="day-head warn">
            Date passed, not updated yet<span className="count">{overdue.length}</span>
          </h3>
          <div className="card list">
            {[...overdue].sort((a, b) => a.h.hearingDate.localeCompare(b.h.hearingDate) || sortEntries(a, b)).map(e => (
              <div key={e.h.id}>
                <div className="row-date">{fmtDay(e.h.hearingDate)}</div>
                <Row e={e} today={today} onOpen={onOpen} />
              </div>
            ))}
          </div>
        </section>
      )}

      {groups.length === 0 ? (
        <div className="card empty">No hearings in this period.</div>
      ) : (
        groups.map(([d, list]) => (
          <Group key={d} date={d} list={list} today={today} showHead={multiDay} onOpen={onOpen} />
        ))
      )}
    </div>
  );
}
// end of CauseList.tsx
