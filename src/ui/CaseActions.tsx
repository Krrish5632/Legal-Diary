import { useState } from 'react';
import type { FormEvent } from 'react';
import type { YMD } from '../core/dates';
import type { CaseRecord } from '../core/types';
import { rescheduleInRepo } from '../core/repository';
import { addPastHearing, addToCurrentHearing, setPriority } from '../core/actions';
import { repo } from './store';
import { fmt, isDateText, nowIST, todayYMD } from './dateutil';
import './forms.css';

type Mode = 'none' | 'next' | 'text' | 'past';
const ACTOR = 'user';

export function CaseActions({ c, onChanged }: { c: CaseRecord; onChanged: () => Promise<void> }) {
  const [mode, setMode] = useState<Mode>('none');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [date, setDate] = useState('');
  const [proceedings, setProceedings] = useState('');
  const [courtOrder, setCourtOrder] = useState('');
  const [notes, setNotes] = useState('');

  function openMode(m: Mode) {
    setMode(m); setErr(''); setOk('');
    setDate(''); setProceedings(''); setCourtOrder(''); setNotes('');
  }

  async function run(fn: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true); setErr(''); setOk('');
    try {
      await fn();
      await onChanged();
      setMode('none');
      setOk(done);
    } catch (e) {
      setErr('Not saved: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  const texts = { proceedings, courtOrder, notes };

  function submitNext(ev: FormEvent) {
    ev.preventDefault();
    if (!isDateText(date)) { setErr('Please choose the new date.'); return; }
    void run(
      () => rescheduleInRepo(repo, c.id, date as YMD, texts, nowIST(), ACTOR),
      'Next date updated. The old date stays in the timeline.',
    );
  }

  function submitPast(ev: FormEvent) {
    ev.preventDefault();
    if (!isDateText(date)) { setErr('Please choose the date of the past hearing.'); return; }
    void run(() => addPastHearing(repo, c.id, date, texts, nowIST(), ACTOR), 'Past hearing added.');
  }

  function submitText(ev: FormEvent) {
    ev.preventDefault();
    void run(() => addToCurrentHearing(repo, c.id, texts, nowIST(), ACTOR), 'Saved in the current hearing.');
  }

  function togglePriority() {
    const to = c.priority === 'High' ? 'Normal' : 'High';
    void run(() => setPriority(repo, c.id, to, nowIST(), ACTOR), 'Priority is now ' + to + '.');
  }

  const blocked = mode === 'next' && c.status === 'Disposed';

  return (
    <div className="actions">
      <div className="action-bar">
        <button className="btn primary" disabled={busy} onClick={() => openMode('next')}>Update Next Date</button>
        <button className="btn" disabled={busy || !c.nextHearingDate} onClick={() => openMode('text')}>
          Add Proceedings / Order / Notes
        </button>
        <button className="btn" disabled={busy} onClick={() => openMode('past')}>Add Past Hearing</button>
        <button className="btn" disabled={busy} onClick={togglePriority}>
          {c.priority === 'High' ? 'Remove High Priority' : 'Mark High Priority'}
        </button>
      </div>
      {!c.nextHearingDate && <div className="note">This case has no next date. Use Update Next Date to set one.</div>}
      {ok && <div className="ok">{ok}</div>}
      {err && <div className="err">{err}</div>}

      {mode !== 'none' && (
        <form className="form" onSubmit={mode === 'next' ? submitNext : mode === 'past' ? submitPast : submitText}>
          {mode === 'next' && (
            <>
              <h3>Update Next Date</h3>
              {blocked ? (
                <div className="warnline">A disposed case cannot be given a new date.</div>
              ) : (
                <>
                  <label>
                    New next hearing date
                    <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
                  </label>
                  {isDateText(date) && date < todayYMD() && (
                    <div className="warnline">This date is before today. Save only if this is intended.</div>
                  )}
                  {c.nextHearingDate && (
                    <div className="note">
                      {fmt(c.nextHearingDate)} will be marked Done and stay in the timeline.
                      Write below what happened on that date (optional).
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {mode === 'past' && (
            <>
              <h3>Add Past Hearing</h3>
              <label>
                Date of the past hearing
                <input className="input" type="date" max={todayYMD()} value={date} onChange={e => setDate(e.target.value)} />
              </label>
              <div className="note">Only real dates. An existing date is never overwritten.</div>
            </>
          )}
          {mode === 'text' && (
            <>
              <h3>Add to hearing of {fmt(c.nextHearingDate)}</h3>
              <div className="note">New text is added after the old text. Nothing is erased.</div>
            </>
          )}

          {!blocked && (
            <>
              <label>
                Proceedings
                <textarea className="input" rows={2} value={proceedings} onChange={e => setProceedings(e.target.value)} />
              </label>
              <label>
                Court order
                <textarea className="input" rows={2} value={courtOrder} onChange={e => setCourtOrder(e.target.value)} />
              </label>
              <label>
                Notes
                <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
              </label>
            </>
          )}

          <div className="form-buttons">
            <button type="button" className="btn" disabled={busy} onClick={() => openMode('none')}>Cancel</button>
            {!blocked && (
              <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
// end of CaseActions.tsx
