import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { importCleanExport } from '../core/importer';
import type { CleanExport } from '../core/importer';
import { repo } from './store';
import { nowIST } from './dateutil';

export function ImportPanel({ onDone }: { onDone: () => void }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const f = input.files?.[0];
    if (!f) return;
    setBusy(true);
    setMsg('');
    try {
      const text = await f.text();
      const data = JSON.parse(text) as CleanExport;
      const r = await importCleanExport(repo, data, nowIST());
      if (r.status === 'failed') {
        setMsg('Import failed, nothing was saved: ' + r.message);
      } else {
        setMsg(`Import ${r.status}. Added: ${r.added}, skipped: ${r.skipped}.`);
        onDone();
      }
    } catch (err) {
      setMsg('Could not import this file: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
      input.value = '';
    }
  }

  return (
    <div className="card import">
      <h2>No cases on this device yet</h2>
      <p>
        Choose the cleaned export file of your old cases (clean_export.json).
        Nothing is sent anywhere. The file is only read inside this browser.
      </p>
      <input type="file" accept=".json,application/json" onChange={onFile} disabled={busy} />
      {busy && <p>Importing...</p>}
      {msg && <p className="msg">{msg}</p>}
    </div>
  );
}
// end of ImportPanel.tsx
