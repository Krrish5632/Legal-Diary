import { useMemo, useState } from 'react';
import type { CaseRecord, CaseStatus, CaseType } from '../core/types';
import { fmt } from './dateutil';
import { CaseRow, caseTitle } from './shared';

const PAGE = 25;

function haystack(c: CaseRecord): string {
  return [
    c.caseNumber, c.caseYear, c.court.name, c.court.number, c.court.judgeName,
    c.parties.plaintiff, c.parties.defendant, c.parties.oppositeCounsel,
    c.currentProceeding, c.notes, c.caseType,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function Cases({ cases, onOpen }: { cases: CaseRecord[]; onOpen: (c: CaseRecord) => void }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'All' | CaseStatus>('All');
  const [type, setType] = useState<'All' | CaseType>('All');
  const [high, setHigh] = useState(false);
  const [sort, setSort] = useState<'next' | 'name'>('next');
  const [shown, setShown] = useState(PAGE);

  const list = useMemo(() => {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const out = cases.filter(c => {
      if (status !== 'All' && c.status !== status) return false;
      if (type !== 'All' && c.caseType !== type) return false;
      if (high && c.priority !== 'High') return false;
      if (tokens.length === 0) return true;
      const hs = haystack(c);
      return tokens.every(t => hs.includes(t));
    });
    out.sort((a, b) => {
      if (sort === 'name') return caseTitle(a).localeCompare(caseTitle(b));
      const an = a.nextHearingDate ?? '9999-99-99';
      const bn = b.nextHearingDate ?? '9999-99-99';
      return an.localeCompare(bn) || a.caseNumber.localeCompare(b.caseNumber);
    });
    return out;
  }, [cases, q, status, type, high, sort]);

  return (
    <div>
      <input
        className="input p3-search" placeholder="Search name, case number, court, notes..."
        value={q} onChange={e => { setQ(e.target.value); setShown(PAGE); }}
      />
      <div className="p3-filters">
        <select className="input" value={status} onChange={e => { setStatus(e.target.value as 'All' | CaseStatus); setShown(PAGE); }}>
          <option value="All">All status</option>
          <option value="Pending">Pending</option>
          <option value="Urgent">Urgent</option>
          <option value="Disposed">Disposed</option>
        </select>
        <select className="input" value={type} onChange={e => { setType(e.target.value as 'All' | CaseType); setShown(PAGE); }}>
          <option value="All">All types</option>
          <option value="Civil">Civil</option>
          <option value="Criminal">Criminal</option>
          <option value="Revenue">Revenue</option>
          <option value="Other">Other</option>
        </select>
        <select className="input" value={sort} onChange={e => setSort(e.target.value as 'next' | 'name')}>
          <option value="next">Sort: next date</option>
          <option value="name">Sort: name</option>
        </select>
        <label className="p3-check">
          <input type="checkbox" checked={high} onChange={e => { setHigh(e.target.checked); setShown(PAGE); }} />
          High priority only
        </label>
      </div>
      <div className="summary">{list.length} of {cases.length} case(s)</div>
      {list.length === 0 ? (
        <div className="card empty">No case matches.</div>
      ) : (
        <div className="card list">
          {list.slice(0, shown).map(c => (
            <CaseRow key={c.id} c={c} right={c.nextHearingDate ? fmt(c.nextHearingDate) : 'No date'} onOpen={onOpen} />
          ))}
        </div>
      )}
      {list.length > shown && (
        <div className="p3-more">
          <button className="btn" onClick={() => setShown(shown + PAGE)}>Show more ({list.length - shown} left)</button>
        </div>
      )}
    </div>
  );
}
// end of Cases.tsx
