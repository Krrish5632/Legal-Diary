import { useEffect, useState } from 'react';
import type { CaseRecord, HearingRecord } from '../core/types';
import { repo } from './store';
import { DEFAULT_PREFS, loadPrefs, savePrefs } from '../core/reminders';
import type { ReminderDetail, ReminderPrefs } from '../core/reminders';
import { todayIST } from '../core/dates';
import { syncReminders, reminderSettingsHelp } from './reminders';
import type { ReminderNote } from './reminders';

interface Props { cases: CaseRecord[]; hearings: HearingRecord[]; onOpen: (c: CaseRecord) => void }

/** Case number with the year, without repeating a year that is already in the number. */
function caseLabel(c: CaseRecord): string {
  const y = c.caseYear;
  if (!y || c.caseNumber.endsWith('/' + y)) return c.caseNumber;
  return c.caseNumber + '/' + y;
}

export function RemindersTab({ cases, onOpen }: Props) {
  const [prefs, setPrefs] = useState<ReminderPrefs>({ ...DEFAULT_PREFS });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<ReminderNote | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let dead = false;
    void (async () => {
      try {
        const p = await loadPrefs(repo);
        if (dead) return;
        setPrefs(p);
        setLoaded(true);
        const n = await syncReminders();
        if (!dead) setNote(n);
      } catch (e) {
        if (!dead) {
          setLoaded(true);
          setNote({ kind: 'bad', text: 'Could not read reminder settings: ' + (e instanceof Error ? e.message : String(e)) });
        }
      }
    })();
    return () => { dead = true; };
  }, []);

  const save = async (next: ReminderPrefs, ask: boolean) => {
    setBusy(true);
    setPrefs(next);
    try {
      await savePrefs(repo, next);
      setNote(await syncReminders({ askPermission: ask }));
    } catch (e) {
      setNote({ kind: 'bad', text: 'Could not save reminder settings: ' + (e instanceof Error ? e.message : String(e)) });
    } finally {
      setBusy(false);
    }
  };

  const setNow = async () => {
    setBusy(true);
    try {
      setNote(await syncReminders({ askPermission: true }));
    } catch (e) {
      setNote({ kind: 'bad', text: 'Reminders could not be set: ' + (e instanceof Error ? e.message : String(e)) });
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <div className="card">Loading reminder settings...</div>;

  const today = todayIST();
  const upcomingCases = cases
    .filter(c => c.status !== 'Disposed' && c.nextHearingDate && c.nextHearingDate >= today)
    .sort((a, b) => (a.nextHearingDate ?? '').localeCompare(b.nextHearingDate ?? ''));

  const muted = new Set(prefs.mutedCases);

  const toggleMuted = (id: string) => {
    const list = muted.has(id) ? prefs.mutedCases.filter(x => x !== id) : [...prefs.mutedCases, id];
    void save({ ...prefs, mutedCases: list }, false);
  };

  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="reminders">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Hearing reminders</h3>
        <p className="small">
          The app reminds you the evening before a hearing. Android needs your permission to show notifications.
          Nothing is sent over the internet.
        </p>

        <div className="r-row">
          <label className="r-check">
            <input
              type="checkbox"
              checked={prefs.enabled}
              disabled={busy}
              onChange={e => void save({ ...prefs, enabled: e.target.checked }, e.target.checked)}
            />
            <span>Turn reminders on</span>
          </label>
        </div>

        <div className="r-row">
          <div className="f-label">Remind me at</div>
          <select
            className="f-input"
            value={prefs.hour}
            disabled={busy || !prefs.enabled}
            onChange={e => void save({ ...prefs, hour: Number(e.target.value) }, false)}
          >
            {hours.map(h => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00{h === 17 ? ' (recommended)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="r-row">
          <div className="f-label">What should the notification show?</div>
          <select
            className="f-input"
            value={prefs.detail}
            disabled={busy || !prefs.enabled}
            onChange={e => void save({ ...prefs, detail: e.target.value as ReminderDetail }, false)}
          >
            <option value="numbers">Case number only (recommended)</option>
            <option value="names">Party names and case number</option>
            <option value="count">Only how many hearings tomorrow</option>
          </select>
        </div>

        <div className="r-row">
          <button className="btn gold" disabled={busy || !prefs.enabled} onClick={() => void setNow()}>
            Set reminders now / Allow notifications
          </button>
        </div>

        <div className="r-hint">{reminderSettingsHelp()}</div>
        {note && <div className={'r-note r-' + note.kind}>{note.text}</div>}
        {busy && <div className="r-hint">Updating reminders...</div>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Mute a case</h3>
        <p className="small">Muted cases get no hearing reminder. Turn a case back on anytime.</p>
        {upcomingCases.length === 0 && <div className="empty">No upcoming cases.</div>}
        {upcomingCases.slice(0, 80).map(c => (
          <div key={c.id} className="r-case">
            <button className="r-casebtn" onClick={() => onOpen(c)}>
              <span className="r-caseno">{caseLabel(c)}</span>
              <span className="r-casedate">Next {c.nextHearingDate}</span>
            </button>
            <label className="r-mute">
              <input type="checkbox" checked={muted.has(c.id)} disabled={busy} onChange={() => toggleMuted(c.id)} />
              <span>Mute</span>
            </label>
          </div>
        ))}
        {upcomingCases.length > 80 && (
          <div className="r-hint">Showing 80 cases. Use Search to open any other case.</div>
        )}
      </div>
    </div>
  );
}
// end of RemindersTab.tsx
