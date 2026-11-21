import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  DOC_CATEGORIES, addDocument, deleteDocument, getDocumentBytes, listDocs, previewKind, updateDocument,
} from '../core/documents';
import type { DocMeta } from '../core/documents';
import { repo } from './store';
import { fileStore } from './docstore';
import { fmt, nowIST } from './dateutil';
import { downloadBytes, lastSaveError, shareBytes } from './files';
import { FilePick } from './FilePick';
import './docs.css';

interface PreviewState { name: string; kind: 'image' | 'pdf'; url: string }

const msgOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const sizeText = (n: number): string => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

export function DocumentsTab({ caseId }: { caseId: string }) {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [loadErr, setLoadErr] = useState('');
  const [picked, setPicked] = useState<File[]>([]);
  const [inputKey, setInputKey] = useState(0);
  const [category, setCategory] = useState<string>('Other');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState('');
  const [eCat, setECat] = useState('Other');
  const [eNote, setENote] = useState('');

  const load = useCallback(async () => {
    try {
      const l = await listDocs(repo, caseId);
      const miss = new Set<string>();
      for (const d of l) {
        if (!(await fileStore.has(d.id))) miss.add(d.id);
      }
      setDocs(l);
      setMissing(miss);
      setLoadErr('');
    } catch (e) {
      setLoadErr('Could not read the document list: ' + msgOf(e));
    }
  }, [caseId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview.url); };
  }, [preview]);

  function onPickFiles(files: File[]) {
    setPicked(files);
    setMsg(''); setErr('');
  }

  async function onAdd(ev: FormEvent) {
    ev.preventDefault();
    if (busy) return;
    if (picked.length === 0) { setErr('Choose a file first.'); return; }
    setBusy(true); setErr(''); setMsg('');
    const done: string[] = [];
    const failed: string[] = [];
    for (const f of picked) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        await addDocument(repo, fileStore, { caseId, name: f.name, category, mime: f.type, bytes, note }, nowIST());
        done.push(f.name);
      } catch (e) {
        failed.push(f.name + ' - ' + msgOf(e));
      }
    }
    if (done.length > 0) setMsg('Added and checked: ' + done.join(', '));
    if (failed.length > 0) setErr('Not added: ' + failed.join(' | '));
    setPicked([]); setNote(''); setInputKey(k => k + 1);
    await load();
    setBusy(false);
  }

  async function onPreview(d: DocMeta) {
    setErr(''); setMsg('');
    setPreview(null);
    const kind = previewKind(d.mime, d.name);
    if (kind === 'none') { setErr('Preview is not available for this file type. Use Share or Download.'); return; }
    try {
      const got = await getDocumentBytes(repo, fileStore, d.id);
      const type = kind === 'pdf' ? 'application/pdf' : d.mime;
      const url = URL.createObjectURL(new Blob([got.bytes.slice().buffer as ArrayBuffer], { type }));
      setPreview({ name: d.name, kind, url });
    } catch (e) {
      setErr(msgOf(e));
    }
  }

  async function onDownload(d: DocMeta) {
    setErr(''); setMsg('');
    try {
      const got = await getDocumentBytes(repo, fileStore, d.id);
      const outcome = await downloadBytes(d.name, got.bytes, d.mime);
      if (outcome === 'saved') setMsg('Saved: ' + d.name);
      else if (outcome === 'cancelled') setMsg('Save was cancelled. Nothing was saved.');
      else setErr('Could not save ' + d.name + '. ' + lastSaveError());
    } catch (e) {
      setErr(msgOf(e));
    }
  }

  async function onShare(d: DocMeta) {
    setErr(''); setMsg('');
    try {
      const got = await getDocumentBytes(repo, fileStore, d.id);
      const r = await shareBytes(d.name, got.bytes, d.mime);
      if (r === 'unsupported') setErr('Sharing is not available in this browser. Use Download instead.');
      if (r === 'shared') setMsg('Shared: ' + d.name);
    } catch (e) {
      setErr('Could not share: ' + msgOf(e));
    }
  }

  async function onDelete(d: DocMeta) {
    if (busy) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      await deleteDocument(repo, fileStore, d.id, nowIST());
      setMsg('Deleted: ' + d.name);
      setConfirmId(null);
      setPreview(null);
      await load();
    } catch (e) {
      setErr('Not deleted: ' + msgOf(e));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(d: DocMeta) {
    setEditId(d.id); setEName(d.name); setECat(d.category); setENote(d.note);
    setConfirmId(null); setErr(''); setMsg('');
  }

  async function saveEdit(d: DocMeta) {
    if (busy) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      await updateDocument(repo, d.id, { name: eName, category: eCat, note: eNote });
      setEditId(null);
      await load();
    } catch (e) {
      setErr('Not saved: ' + msgOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form className="form" onSubmit={e => void onAdd(e)}>
        <h3>Add document</h3>
        <label>
          Category
          <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
            {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div>
          <div>File (PDF, photo or any file, up to 25 MB)</div>
          <FilePick key={inputKey} multiple disabled={busy} onPick={onPickFiles} />
        </div>
        <label>
          Note (optional)
          <input className="input" value={note} onChange={e => setNote(e.target.value)} />
        </label>
        <div className="form-buttons">
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving...' : 'Add Document'}</button>
        </div>
      </form>
      {msg && <div className="ok">{msg}</div>}
      {err && <div className="err">{err}</div>}
      {loadErr && <div className="err">{loadErr}</div>}
      {preview && (
        <div className="doc-preview">
          <div className="row-sub">Preview: {preview.name}</div>
          {preview.kind === 'image' ? (
            <img src={preview.url} alt={preview.name} />
          ) : (
            <iframe src={preview.url} title={preview.name} />
          )}
          <div className="note">If the preview does not show here, use Share or Download.</div>
          <div className="form-buttons">
            <button className="btn" onClick={() => setPreview(null)}>Close Preview</button>
          </div>
        </div>
      )}
      <h4>Documents ({docs.length})</h4>
      {docs.length === 0 ? (
        <div className="empty">No documents yet.</div>
      ) : (
        docs.map(d => (
          <div className="doc-row" key={d.id}>
            <div className="doc-name">{d.name}</div>
            <div className="row-sub">
              {d.category} | {sizeText(d.size)} | added {fmt(d.addedAt.slice(0, 10))}
            </div>
            {d.note && <div className="row-sub">Note: {d.note}</div>}
            {missing.has(d.id) && (
              <div className="doc-warn">The file for this document is missing on this device.</div>
            )}
            {editId === d.id ? (
              <div className="form">
                <label>
                  Name
                  <input className="input" value={eName} onChange={e => setEName(e.target.value)} />
                </label>
                <label>
                  Category
                  <select className="input" value={eCat} onChange={e => setECat(e.target.value)}>
                    {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label>
                  Note
                  <input className="input" value={eNote} onChange={e => setENote(e.target.value)} />
                </label>
                <div className="form-buttons">
                  <button className="btn" disabled={busy} onClick={() => setEditId(null)}>Cancel</button>
                  <button className="btn primary" disabled={busy} onClick={() => void saveEdit(d)}>Save</button>
                </div>
              </div>
            ) : (
              <div className="doc-actions">
                <button className="btn" onClick={() => void onPreview(d)}>Preview</button>
                <button className="btn" onClick={() => void onDownload(d)}>Download</button>
                <button className="btn" onClick={() => void onShare(d)}>Share</button>
                <button className="btn" onClick={() => startEdit(d)}>Edit</button>
                <button className="btn" onClick={() => { setConfirmId(d.id); setErr(''); setMsg(''); }}>Delete</button>
              </div>
            )}
            {confirmId === d.id && (
              <div className="doc-confirm">
                <div>
                  Delete "{d.name}"? The file will be removed from this device and cannot be brought back
                  from here. Only a small record (name and time) is kept.
                </div>
                <div className="form-buttons">
                  <button className="btn" disabled={busy} onClick={() => setConfirmId(null)}>Cancel</button>
                  <button className="btn primary" disabled={busy} onClick={() => void onDelete(d)}>
                    {busy ? 'Deleting...' : 'Yes, delete'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
// end of DocumentsTab.tsx
