import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { CaseRecord } from '../core/types';
import {
  addClientsFromNames, casesForClient, loadClients, saveClient, setArchived, suggestedNames,
} from '../core/clients';
import type { Client, ClientInput } from '../core/clients';
import { repo } from './store';
import { nowIST } from './dateutil';
import { CaseRow } from './shared';
import './forms.css';

const EMPTY: ClientInput = { name: '', phone: '', email: '', address: '', notes: '' };

export function Clients({ cases, onOpen }: { cases: CaseRecord[]; onOpen: (c: CaseRecord) => void }) {
  const [list, setList] = useState<Client[] | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState<string | null>(null); // 'new' or a client id
  const [form, setForm] = useState<ClientInput>(EMPTY);
  const [showArchived, setShowArchived] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [suggest, setSuggest] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setList(await loadClients(repo));
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    if (busy) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      await fn();
      await refresh();
      setMsg(ok);
    } catch (e) {
      setErr('Not saved: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function save(ev: FormEvent) {
    ev.preventDefault();
    if (list === null) return;
    const id = editing === 'new' || editing === null ? undefined : editing;
    await act(async () => {
      await saveClient(repo, form, nowIST(), id);
      setEditing(null);
    }, 'Client saved.');
  }

  function startEdit(cl: Client) {
    setEditing(cl.id);
    setForm({ name: cl.name, phone: cl.phone, email: cl.email, address: cl.address, notes: cl.notes });
    setErr(''); setMsg('');
  }

  function startNew() {
    setEditing('new'); setForm(EMPTY); setErr(''); setMsg('');
  }

  const visible = (list ?? []).filter(cl => showArchived || !cl.archived);
  const suggestions = useMemo(() => (list ? suggestedNames(cases, list) : []), [cases, list]);
  const upd = (k: keyof ClientInput, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div>
      <div className="p3-filters">
        <button className="btn primary" disabled={list === null} onClick={startNew}>+ Add Client</button>
        <button className="btn" disabled={list === null} onClick={() => setSuggest(!suggest)}>
          {suggest ? 'Hide names from my cases' : 'Add from my cases'}
        </button>
        <label className="p3-check">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>
      {msg && <div className="ok">{msg}</div>}
      {err && <div className="err">{err}</div>}

      {editing && (
        <form className="form card" onSubmit={save}>
          <h3>{editing === 'new' ? 'New client' : 'Edit client'}</h3>
          <label>Name *<input className="input" value={form.name} onChange={e => upd('name', e.target.value)} /></label>
          <div className="form-row">
            <label>Phone<input className="input" value={form.phone} onChange={e => upd('phone', e.target.value)} /></label>
            <label>Email<input className="input" value={form.email} onChange={e => upd('email', e.target.value)} /></label>
          </div>
          <label>Address<input className="input" value={form.address} onChange={e => upd('address', e.target.value)} /></label>
          <label>Notes<textarea className="input" rows={2} value={form.notes} onChange={e => upd('notes', e.target.value)} /></label>
          <div className="form-buttons">
            <button type="button" className="btn" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      )}

      {suggest && list && (
        <div className="card">
          <h3>Names found in your cases</h3>
          <div className="note">Nothing is added unless you press Add. A name can be a client or the opposite party.</div>
          {suggestions.length === 0 ? (
            <div className="empty">No new names.</div>
          ) : (
            <div className="p3-scroll">
              {suggestions.map(s => (
                <div className="p3-sug" key={s.name}>
                  <div>{s.name}<div className="row-sub">{s.count} case(s) - {s.role}</div></div>
                  <button
                    className="btn" disabled={busy}
                    onClick={() => void act(() => addClientsFromNames(repo, [s.name], nowIST()), 'Client added.')}
                  >Add</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {list !== null && visible.length === 0 && <div className="card empty">No clients yet.</div>}
      {visible.map(cl => {
        const linked = casesForClient(cl, cases);
        const isOpen = openId === cl.id;
        return (
          <div className="card p3-gap" key={cl.id}>
            <button className="row" onClick={() => setOpenId(isOpen ? null : cl.id)}>
              <div className="row-main">
                <div className="row-title">{cl.name}{cl.archived && <span className="pill grey">Archived</span>}</div>
                <div className="row-sub">{[cl.phone, cl.email].filter(Boolean).join(' - ') || 'No contact saved'}</div>
              </div>
              <div className="row-side"><span className="pill blue">{linked.length} case(s)</span></div>
            </button>
            {isOpen && (
              <div>
                {cl.address && <div>Address: {cl.address}</div>}
                {cl.notes && <div className="p3-pre">Notes: {cl.notes}</div>}
                <div className="action-bar p3-gap">
                  <button className="btn" disabled={busy} onClick={() => startEdit(cl)}>Edit</button>
                  <button
                    className="btn" disabled={busy}
                    onClick={() => void act(() => setArchived(repo, cl.id, !cl.archived, nowIST()), cl.archived ? 'Client restored.' : 'Client archived.')}
                  >{cl.archived ? 'Restore' : 'Archive'}</button>
                </div>
                <h4>Cases (matched by name)</h4>
                {linked.length === 0 ? (
                  <div className="empty">No case with this name as plaintiff or defendant.</div>
                ) : (
                  <div className="list">{linked.map(c => <CaseRow key={c.id} c={c} onOpen={onOpen} />)}</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
// end of Clients.tsx
