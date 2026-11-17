import { useMemo, useState } from 'react';
import type { CaseRecord, HearingRecord } from '../core/types';
import { searchAll } from '../core/search';
import { fmt } from './dateutil';
import { caseTitle, statusClass } from './shared';

export function SearchSheet({ cases, hearings, onOpen, onClose }: {
  cases: CaseRecord[]; hearings: HearingRecord[]; onOpen: (c: CaseRecord) => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const hits = useMemo(() => searchAll(cases, hearings, q), [cases, hearings, q]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="sheet-title">Search everything</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <input
          className="input p3-search" autoFocus value={q} onChange={e => setQ(e.target.value)}
          placeholder="Name, case number, court, notes, order, date (10/03/2026)..."
        />
        {q.trim().length < 2
          ? <div className="note">Type at least 2 letters.</div>
          : <div className="summary">{hits.length} result(s)</div>}
        {hits.length > 0 && (
          <div className="card list">
            {hits.map(hit => (
              <button
                className="row" key={hit.kind + hit.c.id + (hit.h ? hit.h.id : '')}
                onClick={() => { onOpen(hit.c); onClose(); }}
              >
                <div className="row-main">
                  <div className="row-title">
                    {hit.c.priority === 'High' && <span className="pill gold">High</span>}
                    {caseTitle(hit.c)}
                  </div>
                  <div className="row-sub">
                    {[hit.c.caseNumber, hit.c.court.name].filter(Boolean).join(' - ')}
                  </div>
                  {hit.h && <div className="row-note">{fmt(hit.h.hearingDate)}: {hit.snippet}</div>}
                </div>
                <div className="row-side">
                  <span className={'pill ' + statusClass(hit.c.status)}>{hit.c.status}</span>
                  <span className="pill grey">{hit.kind === 'case' ? 'Case' : 'Hearing'}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
// end of SearchSheet.tsx
