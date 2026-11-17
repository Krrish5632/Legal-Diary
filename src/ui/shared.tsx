import type { CaseRecord } from '../core/types';

export type Tab = 'dashboard' | 'causelist' | 'cases' | 'diary' | 'clients' | 'analytics';

export const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'causelist', label: 'Cause List' },
  { id: 'cases', label: 'Cases' },
  { id: 'diary', label: 'Diary' },
  { id: 'clients', label: 'Clients' },
  { id: 'analytics', label: 'Analytics' },
];

export function caseTitle(c: CaseRecord): string {
  return `${c.parties.plaintiff || '-'} vs ${c.parties.defendant || '-'}`;
}

export function statusClass(s: string): string {
  return s === 'Urgent' ? 'red' : s === 'Disposed' ? 'grey' : 'blue';
}

export function CaseRow({ c, right, onOpen }: {
  c: CaseRecord; right?: string; onOpen: (c: CaseRecord) => void;
}) {
  const sub = [c.caseNumber, c.court.name].filter(Boolean).join(' - ');
  return (
    <button className="row" onClick={() => onOpen(c)}>
      <div className="row-main">
        <div className="row-title">
          {c.priority === 'High' && <span className="pill gold">High</span>}
          {caseTitle(c)}
        </div>
        <div className="row-sub">{sub}</div>
        {c.currentProceeding && <div className="row-note">{c.currentProceeding}</div>}
      </div>
      <div className="row-side">
        <span className={'pill ' + statusClass(c.status)}>{c.status}</span>
        {right && <span className="pill grey">{right}</span>}
      </div>
    </button>
  );
}
// end of shared.tsx
