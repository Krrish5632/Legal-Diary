import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  backupFileName, createBackup, parseBackup, previewRestore, restoreMerge, serializeBackup,
} from '../core/backup';
import type { BackupFile, RestorePreview } from '../core/backup';
import { createZipBackup, parseZipBackup, previewZipRestore, restoreZip } from '../core/backupzip';
import type { ZipBackup, ZipPreview } from '../core/backupzip';
import { repo } from './store';
import { fileStore } from './docstore';
import { fmt, nowIST } from './dateutil';
import { downloadBytes, downloadTextFile } from './files';

interface PendingJson { kind: 'json'; file: BackupFile; preview: RestorePreview }
interface PendingZip { kind: 'zip'; zip: ZipBackup; preview: ZipPreview }
type Pending = PendingJson | PendingZip;

const msgOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function BackupPanel({ onClose, onChanged }: { onClose: () => void; onChanged: () => Promise<void> }) {
  const [counts, setCounts] = useState<{ cases: number; hearings: number; audit: number } | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [warn, setWarn] = useState('');
  const [err, setErr] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);

  async function refresh() {
    try {
      setCounts(await repo.counts());
      setLast(await repo.getMeta('last_backup_at'));
    } catch (e) {
      setErr('Could not read the saved data: ' + msgOf(e));
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function saveJson(prefix: string): Promise<BackupFile> {
    const now = nowIST();
    const b = await createBackup(repo, now);
    downloadTextFile(prefix + backupFileName(now), serializeBackup(b));
    await repo.commit({ setMeta: { last_backup_at: now } });
    return b;
  }

  async function saveZip(prefix: string) {
    const now = nowIST();
    const r = await createZipBackup(repo, fileStore, now);
    downloadBytes(prefix + backupFileName(now).replace(/\.json$/, '.zip'), r.zip, 'application/zip');
    await repo.commit({ setMeta: { last_backup_at: now } });
    return r;
  }

  async function doBackupZip() {
    if (busy) return;
    setBusy(true); setErr(''); setMsg(''); setWarn('');
    try {
      const r = await saveZip('');
      setMsg(
        'Backup file created: ' + r.counts.cases + ' cases, ' + r.counts.hearings + ' hearings, ' +
        r.counts.documents + ' documents.',
      );
      if (r.skipped.length > 0) {
        setWarn(
          r.skipped.length + ' document(s) could NOT be included: ' +
          r.skipped.map(s => s.name + ' (' + s.reason + ')').join('; '),
        );
      }
      await refresh();
    } catch (e) {
      setErr('Backup failed: ' + msgOf(e) + ' You can still use "Data-only backup".');
    } finally {
      setBusy(false);
    }
  }

  async function doBackupJson() {
    if (busy) return;
    setBusy(true); setErr(''); setMsg(''); setWarn('');
    try {
      const b = await saveJson('');
      setMsg('Data-only backup created: ' + b.counts.cases + ' cases, ' + b.counts.hearings + ' hearings. Documents are not in this file.');
      await refresh();
    } catch (e) {
      setErr('Backup failed: ' + msgOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const f = input.files?.[0];
    if (!f) return;
    setBusy(true); setErr(''); setMsg(''); setWarn(''); setPending(null);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (bytes.length > 1 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
        const zip = await parseZipBackup(bytes);
        setPending({ kind: 'zip', zip, preview: await previewZipRestore(repo, zip) });
      } else {
        const file = await parseBackup(new TextDecoder().decode(bytes));
        setPending({ kind: 'json', file, preview: await previewRestore(repo, file) });
      }
    } catch (ex) {
      setErr(msgOf(ex));
    } finally {
      setBusy(false);
      input.value = '';
    }
  }

  async function doRestore() {
    if (!pending || busy) return;
    setBusy(true); setErr(''); setMsg(''); setWarn('');
    try {
      const hasData = counts !== null && (counts.cases > 0 || counts.hearings > 0);
      if (pending.kind === 'zip') {
        if (hasData) await saveZip('before-restore-');
        const r = await restoreZip(repo, fileStore, pending.zip, nowIST());
        setMsg(
          'Restore finished and checked. Added ' + r.addedCases + ' case(s), ' + r.addedHearings + ' hearing(s), ' +
          r.addedClients + ' client(s), ' + r.addedDocs + ' document(s). ' + r.skippedCases +
          ' case(s) and ' + r.skippedDocs + ' document(s) were already here and were not touched.',
        );
      } else {
        if (hasData) await saveJson('before-restore-');
        const r = await restoreMerge(repo, pending.file, nowIST());
        setMsg(
          'Restore finished and checked. Added ' + r.addedCases + ' case(s), ' + r.addedHearings + ' hearing(s), ' +
          r.addedClients + ' client(s). ' + r.skippedCases + ' case(s) were already here and were not touched.',
        );
      }
      setPending(null);
      await onChanged();
      await refresh();
    } catch (ex) {
      setErr('Not restored: ' + msgOf(ex));
      await onChanged();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const p = pending ? pending.preview : null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="sheet-title">Backup &amp; Restore</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <h4>Backup</h4>
        <div className="note">
          {counts ? counts.cases + ' cases, ' + counts.hearings + ' hearings on this device. ' : ''}
          {last ? 'Last backup: ' + last.slice(0, 16).replace('T', ' ') + '.' : 'No backup made yet.'}
        </div>
        <div className="action-bar">
          <button className="btn primary" disabled={busy} onClick={() => void doBackupZip()}>Save Backup File (with documents)</button>
          <button className="btn" disabled={busy} onClick={() => void doBackupJson()}>Data-only backup</button>
        </div>
        <div className="note">
          The backup file has built-in checks, so a damaged or changed file is refused at restore.
          It holds client information and documents: keep copies in a safe place and do not share it.
          Do not edit anything inside it. Saving to a phone folder is added in the Android step.
        </div>

        <h4>Restore</h4>
        <div className="note">
          Restore only adds what is missing. It never changes or removes cases or documents already on this device.
          A safety backup of the current data is saved first. Choose a .zip or .json backup file.
        </div>
        <input type="file" accept=".zip,.json,application/zip,application/json" onChange={e => void onFile(e)} disabled={busy} />

        {pending && p && (
          <div className="card p3-gap">
            <h3>Check before restoring</h3>
            <div>Backup made: {fmt(p.madeAt.slice(0, 10))}</div>
            <div>Contains: {p.backupCases} cases, {p.backupHearings} hearings</div>
            <div>New on this device: {p.newCases} cases, {p.newHearings} hearings, {p.newClients} clients</div>
            <div>Already here (not touched): {p.alreadyHere} cases</div>
            {pending.kind === 'zip' ? (
              <div>
                Documents: {pending.preview.backupDocs} in the backup, {pending.preview.newDocs} new,{' '}
                {pending.preview.docsAlreadyHere} already here
              </div>
            ) : (
              <div className="note">This file has no documents.</div>
            )}
            <div className="form-buttons p3-gap">
              <button className="btn" disabled={busy} onClick={() => setPending(null)}>Cancel</button>
              <button className="btn primary" disabled={busy} onClick={() => void doRestore()}>
                {busy ? 'Working...' : 'Restore (add missing)'}
              </button>
            </div>
          </div>
        )}

        {msg && <div className="ok">{msg}</div>}
        {warn && <div className="err">{warn}</div>}
        {err && <div className="err">{err}</div>}
      </div>
    </div>
  );
}
// end of BackupPanel.tsx
