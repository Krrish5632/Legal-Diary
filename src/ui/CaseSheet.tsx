import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { AuditEvent, CaseRecord, CaseStatus, HearingRecord } from '../core/types';
import { addCaseNote, setStatus } from '../core/caseedit';
import { buildCaseHistory } from '../core/pdfmodel';
import { repo } from './store';
import { fmt, nowIST, todayYMD } from './dateutil';
import { CaseActions } from './CaseActions';
import { EditCaseForm } from './EditCaseForm';
import { DocumentsTab } from './DocumentsTab';
import { PdfButtons } from './PdfButtons';
import { renderHistoryPdf } from './pdf';
import { auditLabel } from './Diary';
import { caseTitle } from './shared';

type SheetTab = 'info' | 'timeline' | 'docs' | 'notes';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div className="field-value">{value}</div>
    </div>
  );
}

function StatusBar({ c, onChanged }: { c: CaseRecord; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [closing, setClosing] = useState(false);
  const [remark, setRemark] = useState('');

  async function change(to: CaseStatus, why = '') {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      await setStatus(repo, c.id, to, nowIST(), 'user', why);
      await onChanged();
      setClosing(false); setRemark('');
    } catch (e) {
      setErr('Not saved: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="actions">
      <div className="action-bar">
        {c.status === 'Pending' && <button className="btn" disabled={busy} onClick={() => void change('Urgent')}>Mark Urgent</button>}
        {c.status === 'Urgent' && <button className="btn" disabled={busy} onClick={() => void change('Pending')}>Remove Urgent</button>}
        {c.status !== 'Disposed' && <button className="btn" disabled={busy} onClick={() => setClosing(true)}>Mark Disposed</button>}
        {c.status === 'Disposed' && <button className="btn" disabled={busy} onClick={() => void change('Pending')}>Reopen Case</button>}
      </div>
      {err && <div className="err">{err}</div>}
      {closing && (
        <div className="form">
          <h3>Mark as Disposed</h3>
          <div className="note">
            {c.nextHearingDate ? fmt(c.nextHearingDate) + ' will be closed and kept in the timeline. ' : ''}
            The case leaves the Cause List. You can reopen it later. Nothing is deleted.
          </div>
          <label>
            Disposal remark (optional)
            <textarea className="input" rows={2} value={remark} onChange={e => setRemark(e.target.value)} />
          </label>
          <div className="form-buttons">
            <button className="btn" disabled={busy} onClick={() => setClosing(false)}>Cancel</button>
            <button className="btn primary" disabled={busy} onClick={() => void change('Disposed', remark)}>
              {busy ? 'Saving...' : 'Confirm Disposed'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Timeline({ c, hearings }: { c: CaseRecord; hearings: HearingRecord[] }) {
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [auditErr, setAuditErr] = useState('');
  const [auditLoaded, setAuditLoaded] = useState(false);
  const sorted = [...hearings].sort((a, b) => b.hearingDate.localeCompare(a.hearingDate));

  useEffect(() => {
    let alive = true;
    repo.listAudit(c.id)
      .then(a => { if (alive) { setAudit([...a].sort((x, y) => y.at.localeCompare(x.at))); setAuditErr(''); setAuditLoaded(true); } })
      .catch(e => { if (alive) setAuditErr('Could not read the change log: ' + (e instanceof Error ? e.message : String(e))); });
    return () => { alive = false; };
  }, [c.id, c.updatedAt, hearings.length]);

  function makeHistoryPdf() {
    if (auditErr) throw new Error('The change log could not be read, so the PDF was not made. Close and open the case again.');
    if (!auditLoaded) throw new Error('The change log is still loading. Please try again in a moment.');
    return renderHistoryPdf(buildCaseHistory(c, hearings, audit, todayYMD()));
  }

  return (
    <div>
      <h4>Full case history (PDF)</h4>
      <PdfButtons make={makeHistoryPdf} />
      <h4>Hearing timeline</h4>
      {sorted.length === 0 ? (
        <div className="empty">No hearings recorded.</div>
      ) : (
        <ul className="timeline">
          {sorted.map(h => (
            <li key={h.id}>
              <div className="tl-date">
                {fmt(h.hearingDate)}
                <span className={'pill ' + (h.state === 'completed' ? 'grey' : 'green')}>
                  {h.state === 'completed' ? 'Done' : 'Scheduled'}
                </span>
              </div>
              {h.proceedings && <div className="p3-pre">Proceedings: {h.proceedings}</div>}
              {h.courtOrder && <div className="p3-pre">Court order: {h.courtOrder}</div>}
              {h.notes && <div className="p3-pre">Notes: {h.notes}</div>}
              {h.nextDateFixed && <div>Next date fixed: {fmt(String(h.nextDateFixed))}</div>}
            </li>
          ))}
        </ul>
      )}
      <h4>Change log</h4>
      {auditErr && <div className="err">{auditErr}</div>}
      {audit.length === 0 ? (
        <div className="empty">No changes recorded yet.</div>
      ) : (
        <div className="card">
          {audit.map(a => (
            <div className="p3-sug" key={a.id}>
              <div>{auditLabel(a)}</div>
              <div className="row-sub">{a.at.slice(0, 16).replace('T', ' ')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Notes({ c, onChanged }: { c: CaseRecord; onChanged: () => Promise<void> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const parts = c.notes ? c.notes.split('\n\n') : [];

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true); setErr('');
    try {
      await addCaseNote(repo, c.id, text, nowIST(), 'user');
      await onChanged();
      setText('');
    } catch (e) {
      setErr('Not saved: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form className="form" onSubmit={submit}>
        <label>
          New note
          <textarea className="input" rows={3} value={text} onChange={e => setText(e.target.value)} />
        </label>
        <div className="note">The note is saved with today's date. Old notes are never changed.</div>
        {err && <div className="err">{err}</div>}
        <div className="form-buttons">
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving...' : 'Add Note'}</button>
        </div>
      </form>
      <h4>Case notes</h4>
      {parts.length === 0 ? (
        <div className="empty">No notes yet.</div>
      ) : (
        [...parts].reverse().map((p, i) => <div className="p3-entry p3-pre" key={i}>{p}</div>)
      )}
    </div>
  );
}

export function CaseSheet({ c, hearings, onClose, onChanged }: {
  c: CaseRecord; hearings: HearingRecord[]; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const [tab, setTab] = useState<SheetTab>('info');
  const [editing, setEditing] = useState(false);
  const entry = c.entryDate
    ? fmt(c.entryDate) + (c.entryDateSource === 'legacy-createdAt' ? ' (from old data)' : '')
    : 'Not recorded';

  return (
    <>
      <div className="overlay" onClick={onClose}>
        <div className="sheet" onClick={e => e.stopPropagation()}>
          <div className="sheet-head">
            <div>
              <div className="sheet-title">{caseTitle(c)}</div>
              <div className="row-sub">{c.caseNumber}</div>
            </div>
            <button className="btn" onClick={onClose}>Close</button>
          </div>

          <div className="tabs">
            <button className={'tab' + (tab === 'info' ? ' active' : '')} onClick={() => setTab('info')}>Information</button>
            <button className={'tab' + (tab === 'timeline' ? ' active' : '')} onClick={() => setTab('timeline')}>Timeline</button>
            <button className={'tab' + (tab === 'docs' ? ' active' : '')} onClick={() => setTab('docs')}>Documents</button>
            <button className={'tab' + (tab === 'notes' ? ' active' : '')} onClick={() => setTab('notes')}>Notes</button>
          </div>

          {tab === 'info' && (
            <div>
              <div className="grid">
                <Field label="Entry Date" value={entry} />
                <Field label="Initial Hearing Date" value={fmt(c.initialHearingDate)} />
                <Field label="Next Hearing Date" value={fmt(c.nextHearingDate, 'None')} />
                <Field label="Last Hearing Date" value={fmt(c.lastHearingDate, 'None yet')} />
                <Field label="Total Hearings" value={String(c.totalHearings)} />
                <Field label="Status" value={c.status} />
                <Field label="Priority" value={c.priority} />
                <Field label="Case Type" value={c.caseType} />
                <Field label="Case Year" value={c.caseYear || '-'} />
                <Field label="Court" value={c.court.name || '-'} />
                <Field label="Court / Room" value={c.court.number || '-'} />
                <Field label="Judge" value={c.court.judgeName || '-'} />
                <Field label="Opposite Counsel" value={c.parties.oppositeCounsel || '-'} />
                <Field label="Current Proceeding" value={c.currentProceeding || '-'} />
                {c.caseType === 'Criminal' && (
                  <>
                    <Field label="Police Station" value={c.legalSections.policeStation || '-'} />
                    <Field label="FIR Number" value={c.legalSections.firNumber || '-'} />
                    <Field label="Sections" value={c.legalSections.sections || '-'} />
                  </>
                )}
              </div>
              <div className="actions">
                <div className="action-bar">
                  <button className="btn" onClick={() => setEditing(true)}>Edit Case Details</button>
                </div>
              </div>
              <StatusBar c={c} onChanged={onChanged} />
              <CaseActions c={c} onChanged={onChanged} />
            </div>
          )}
          {tab === 'timeline' && <Timeline c={c} hearings={hearings} />}
          {tab === 'docs' && <DocumentsTab caseId={c.id} />}
          {tab === 'notes' && <Notes c={c} onChanged={onChanged} />}
        </div>
      </div>
      {editing && (
        <EditCaseForm
          c={c}
          onCancel={() => setEditing(false)}
          onSaved={async () => { await onChanged(); setEditing(false); }}
        />
      )}
    </>
  );
}
// end of CaseSheet.tsx
