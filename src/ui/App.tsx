import { useCallback, useEffect, useState } from 'react';
import type { CaseRecord, HearingRecord } from '../core/types';
import { repo } from './store';
import { CauseList } from './CauseList';
import { CaseSheet } from './CaseSheet';
import { ImportPanel } from './ImportPanel';
import { AddCaseForm } from './AddCaseForm';
import { Dashboard } from './Dashboard';
import { Cases } from './Cases';
import { Diary } from './Diary';
import { Clients } from './Clients';
import { Analytics } from './Analytics';
import { BackupPanel } from './BackupPanel';
import { SearchSheet } from './SearchSheet';
import { RemindersTab } from './RemindersTab';
import { SideMenu } from './SideMenu';
import type { MenuAction } from './SideMenu';
import { syncReminders } from './reminders';
import { listenTaps } from './notify';
import { parseTapTarget } from '../core/remindersync';
import { TABS } from './shared';
import type { Tab } from './shared';
import './forms.css';
import './nav.css';
import './reminders.css';
interface Loaded { cases: CaseRecord[]; hearings: HearingRecord[] }
export function App() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [tab, setTab] = useState<Tab>('causelist');
  const [searching, setSearching] = useState(false);
  const [backing, setBacking] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [menu, setMenu] = useState(false);
  const [remNote, setRemNote] = useState('');
  const reload = useCallback(async () => {
    try {
      const [cases, hearings] = await Promise.all([repo.listCases(), repo.listHearings()]);
      setData({ cases, hearings });
      setError('');
    } catch (e) {
      setError('Could not read the saved data: ' + (e instanceof Error ? e.message : String(e)));
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  // After every load or save: make the phone's reminders match the saved data.
  useEffect(() => {
    if (!data) return;
    let dead = false;
    void syncReminders().then(n => { if (!dead) setRemNote(n.kind === 'bad' ? n.text : ''); });
    return () => { dead = true; };
  }, [data]);
  // When the app comes back to the screen, check again.
  useEffect(() => {
    const f = () => {
      if (document.visibilityState === 'visible') {
        void syncReminders().then(n => setRemNote(n.kind === 'bad' ? n.text : ''));
      }
    };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);
  // Tapping a reminder opens the case (or the Cause List when it covers several cases).
  useEffect(() => {
    let dead = false;
    let off: () => void = () => undefined;
    void listenTaps(extra => {
      const t = parseTapTarget(extra);
      setReminding(false);
      setMenu(false);
      if (t.caseId) setOpenId(t.caseId);
      else setTab('causelist');
    }).then(f => { if (dead) f(); else off = f; });
    return () => { dead = true; off(); };
  }, []);
  const open = data && openId ? data.cases.find(c => c.id === openId) ?? null : null;
  const showMain = !!data && (data.cases.length > 0 || fresh);
  const openCase = (c: CaseRecord) => setOpenId(c.id);
  const title = TABS.find(t => t.id === tab)?.label ?? '';
  const onMenuAction = (a: MenuAction) => {
    if (a === 'search') setSearching(true);
    else if (a === 'reminders') setReminding(true);
    else setBacking(true);
  };
  return (
    <div className="app">
      <header className="topbar">
        <div className="top-left">
          {showMain && (
            <button className="btn menu-btn" aria-label="Open menu" onClick={() => setMenu(true)}>
              &#9776;
            </button>
          )}
          <div>
            <div className="brand">Legal Diary Pro</div>
            <div className="subtitle">{title}</div>
          </div>
        </div>
        {showMain && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => setSearching(true)}>Search</button>
            <button className="btn gold" onClick={() => setAdding(true)}>+ Add New Case</button>
          </div>
        )}
      </header>
      <main className="content">
        {error && <div className="card error">{error}</div>}
        {showMain && remNote && (
          <div className="card error r-banner">
            <span>{remNote}</span>
            <button className="btn" onClick={() => setReminding(true)}>Open Reminders</button>
          </div>
        )}
        {!data && !error && <div className="card">Loading...</div>}
        {data && !showMain && (
          <>
            <ImportPanel onDone={() => void reload()} />
            <button className="btn" onClick={() => setBacking(true)}>Restore from a backup file</button>
            <button className="btn" onClick={() => setFresh(true)}>Start with an empty diary instead</button>
          </>
        )}
        {data && showMain && tab === 'dashboard' && (
          <>
            <Dashboard cases={data.cases} hearings={data.hearings} onOpen={openCase} go={setTab} />
            <div className="p3-more">
              <button className="btn" onClick={() => setReminding(true)}>Reminders</button>
              <button className="btn" onClick={() => setBacking(true)}>Backup &amp; Restore</button>
            </div>
          </>
        )}
        {data && showMain && tab === 'causelist' && (
          <CauseList cases={data.cases} hearings={data.hearings} onOpen={openCase} />
        )}
        {data && showMain && tab === 'cases' && <Cases cases={data.cases} onOpen={openCase} />}
        {data && showMain && tab === 'diary' && (
          <Diary cases={data.cases} hearings={data.hearings} onOpen={openCase} />
        )}
        {data && showMain && tab === 'clients' && <Clients cases={data.cases} onOpen={openCase} />}
        {data && showMain && tab === 'analytics' && <Analytics cases={data.cases} hearings={data.hearings} />}
      </main>
      {menu && showMain && data && (
        <SideMenu
          current={tab}
          caseCount={data.cases.length}
          onTab={setTab}
          onAction={onMenuAction}
          onClose={() => setMenu(false)}
        />
      )}
      {open && data && (
        <CaseSheet
          c={open}
          hearings={data.hearings.filter(h => h.caseId === open.id)}
          onClose={() => setOpenId(null)}
          onChanged={reload}
        />
      )}
      {adding && (
        <AddCaseForm
          onCancel={() => setAdding(false)}
          onSaved={async id => { await reload(); setAdding(false); setOpenId(id); }}
        />
      )}
      {searching && data && (
        <SearchSheet cases={data.cases} hearings={data.hearings} onOpen={openCase} onClose={() => setSearching(false)} />
      )}
      {backing && <BackupPanel onClose={() => setBacking(false)} onChanged={reload} />}
      {reminding && data && (
        <div className="r-sheet">
          <div className="r-sheet-head">
            <strong>Reminders</strong>
            <button className="btn" onClick={() => setReminding(false)}>Close</button>
          </div>
          <div className="r-sheet-body">
            <RemindersTab
              cases={data.cases}
              hearings={data.hearings}
              onOpen={c => { setReminding(false); openCase(c); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
// end of App.tsx
