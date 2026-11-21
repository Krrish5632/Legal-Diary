import { useState } from 'react';
import { importCleanExport } from '../core/importer';
import type { CleanExport } from '../core/importer';
import { repo } from './store';
import { nowIST } from './dateutil';
import { FilePick } from './FilePick';

export function ImportPanel({ onDone, empty = true }: { onDone: () => void; empty?: boolean }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setMsg('');
    try {
      const text = await f.text();
      const data = JSON.parse(text) as CleanExport;
      const r = await importCleanExport(repo, data, nowIST());
      if (r.status === 'failed') {
        setMsg('Import failed, nothing was saved: ' + r.message);
      } else if (r.status === 'already-done') {
        setMsg('The old cases were already imported on this device earlier. Nothing was changed.');
      } else {
        setMsg(
          `Import finished and checked. Added ${r.added.cases} cases and ${r.added.hearings} hearings. ` +
          `Already here, left as they are: ${r.skipped.cases} cases.`,
        );
        onDone();
      }
    } catch (err) {
      setMsg('Could not import this file: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card import">
      <h2>{empty ? 'No cases on this device yet' : 'Import old cases'}</h2>
      <p>
        Choose the cleaned export file of your old cases (clean_export.json).
        Nothing is sent anywhere. The file is only read on this device.
      </p>
      {!empty && (
        <p>
          This only adds cases that are not here yet. A case that is already here is never
          changed, and nothing is deleted.
        </p>
      )}
      <FilePick accept=".json,application/json" disabled={busy} onPick={files => void onFile(files[0])} />
      {busy && <p>Importing...</p>}
      {msg && <p className="msg">{msg}</p>}
    </div>
  );
}
// end of ImportPanel.tsx
