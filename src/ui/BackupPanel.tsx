import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  backupFileName, createBackup, parseBackup, previewRestore, restoreMerge, serializeBackup,
} from '../core/backup';
import type { BackupFile, RestorePreview } from '../core/backup';
import { createZipBackup, parseZipBackup, previewZipRestore, restoreZip } from '../core/backupzip';
import type { ZipBackup, ZipPreview } from '../core/backupzip';
import { previewReplace, replaceFromBackup } from '../core/restorereplace';
import type { ReplacePreview, ReplaceResult } from '../core/restorereplace';
import { repo } from './store';
import { fileStore } from './docstore';
import { fmt, nowIST } from './dateutil';
import { downloadBytes, downloadTextFile, lastSaveError } from './files';
import type { SaveOutcome } from './files';
interface PendingJson { kind: 'json'; file: BackupFile; preview: RestorePreview; replace: ReplacePreview }
interface PendingZip { kind: 'zip'; zip: ZipBackup; preview: ZipPreview; replace: ReplacePreview }
type Pending = PendingJson | PendingZip;
const msgOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));
// Throws unless the file was really saved, so nothing is reported as done by mistake.
function needSaved(outcome: SaveOutcome, what: string): void {
  if (outcome === 'saved') return;
  if (outcome === 'cancelled') {
    throw new Error(
      'The ' + what + ' was not saved because the Save screen was closed. Nothing was changed.',
    );
  }
  const d = lastSaveError();
  throw new Error('The ' + what + ' could not be saved.' + (d ? ' ' + d : '') + ' Nothing was changed.');
}
function replaceText(r: ReplaceResult): string {
  return (
    'Replace finished and checked. Added ' + r.addedCases + ' case(s), replaced ' + r.replacedCases +
    ' with the backup version, ' + r.unchangedCases + ' were already identical. Kept as they are: ' +
    r.keptOnlyHere + ' case(s) only on this device, ' + r.keptNewerCases +
    ' case(s) with newer history on this device. Hearings added ' + r.addedHearings +
    ', replaced ' + r.replacedHearings + '.'
  );
}
export function BackupPanel({ onClose, onChanged }: { onClose: () => void; onChanged: () => Promise<void> }) {
  const [counts, setCounts] = useState<{ cases: number; hearings: number; audit: number } | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [warn, setWarn] = useState('');
  const [err, setErr] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [confirm, setConfirm] = useState(false);
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
    const outcome = await downloadTextFile(prefix + backupFileName(now), serializeBackup(b));
    needSaved(outcome, prefix === '' ? 'backup file' : 'safety backup');
    await repo.commit({ setMeta: { last_backup_at: now } });
    return b;
  }
  async function saveZip(prefix: string) {
    const now = nowIST();
    const r = await createZipBackup(repo, fileStore, now);
    const outcome = await downloadBytes(
      prefix + backupFileName(now).replace(/\.json$/, '.zip'), r.zip, 'application/zip',
    );
    needSaved(outcome, prefix === '' ? 'backup file' : 'safety backup');
    await repo.commit({ setMeta: { last_backup_at: now } });
    return r;
  }
  async function doBackupZip() {
    if (busy) return;
    setBusy(true); setErr(''); setMsg(''); setWarn('');
    try {
      const r = await saveZip('');
      setMsg(
        'Backup file saved: ' + r.counts.cases + ' cases, ' + r.counts.hearings + ' hearings, ' +
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
      setMsg('Data-only backup saved: ' + b.counts.cases + ' cases, ' + b.counts.hearings + ' hearings. Documents are not in this file.');
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
    setBusy(true); setErr(''); setMsg(''); setWarn(''); setPending(null); setConfirm(false);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (bytes.length > 1 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
        const zip = await parseZipBackup(bytes);
        setPending({
          kind: 'zip', zip,
          preview: await previewZipRestore(repo, zip),
          replace: await previewReplace(repo, zip.backup),
        });
      } else {
        const file = await parseBackup(new TextDecoder().decode(bytes));
        setPending({
          kind: 'json', file,
          preview: await previewRestore(repo, file),
          replace: await previewReplace(repo, file),
        });
      }
    } catch (ex) {
      setErr(msgOf(ex));
    } finally {
      setBusy(false);
      input.value = '';
    }
  }
  async function doRestore(mode: 'merge' | 'replace') {
    if (!pending || busy) return;
    setBusy(true); setErr(''); setMsg(''); setWarn(''); setConfirm(false);
    try {
      const hasData = counts !== null && (counts.cases > 0 || counts.hearings > 0);
      if (pending.kind === 'zip') {
        if (hasData) await saveZip('before-restore-');
        if (mode === 'replace') {
          const rr = await replaceFromBackup(repo, pending.zip.backup, nowIST());
          const r = await restoreZip(repo, fileStore, pending.zip, nowIST());
          setMsg(replaceText(rr) + ' Documents added ' + r.addedDocs + ', already here ' + r.skippedDocs + '.');
        } else {
          const r = await restoreZip(repo, fileStore, pending.zip, nowIST());
          setMsg(
            'Restore finished and checked. Added ' + r.addedCases + ' case(s), ' + r.addedHearings + ' hearing(s), ' +
            r.addedClients + ' client(s), ' + r.addedDocs + ' document(s). ' + r.skippedCases +
            ' case(s) and ' + r.skippedDocs + ' document(s) were already here and were not touched.',
          );
        }
      } else {
        if (hasData) await saveJson('before-restore-');
        if (mode === 'replace') {
          const rr = await replaceFromBackup(repo, pending.file, nowIST());
          setMsg(replaceText(rr));
        } else {
          const r = await restoreMerge(repo, pending.file, nowIST());
          setMsg(
            'Restore finished and checked. Added ' + r.addedCases + ' case(s), ' + r.addedHearings + ' hearing(s), ' +
            r.addedClients + ' client(s). ' + r.skippedCases + ' case(s) were already here and were not touched.',
          );
        }
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
  const rp = pending ? pending.replace : null;
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
          Do not edit anything inside it. On the phone, a Save screen opens: choose a folder such as Downloads or Documents.
        </div>
        <h4>Restore</h4>
        <div className="note">
          Choose a .zip or .json backup file. You will see a check first. A safety backup of the current data is saved
          before anything changes. &quot;Add missing&quot; never changes a case already on this device.
          &quot;Replace&quot; makes the cases match the backup, but it never deletes anything.
        </div>
        <input type="file" accept=".zip,.json,application/zip,application/json" onChange={e => void onFile(e)} disabled={busy} />
        {pending && p && rp && (
          <div className="card p3-gap">
            <h3>Check before restoring</h3>
            <div>Backup made: {fmt(p.madeAt.slice(0, 10))}</div>
            <div>Contains: {p.backupCases} cases, {p.backupHearings} hearings</div>
            <div>New on this device: {p.newCases} cases, {p.newHearings} hearings, {p.newClients} clients</div>
            <div>Already here: {p.alreadyHere} cases</div>
            {pending.kind === 'zip' ? (
              <div>
                Documents: {pending.preview.backupDocs} in the backup, {pending.preview.newDocs} new,{' '}
                {pending.preview.docsAlreadyHere} already here
              </div>
            ) : (
              <div className="note">This file has no documents.</div>
            )}
            <div className="form-buttons p3-gap">
              <button className="btn" disabled={busy} onClick={() => { setPending(null); setConfirm(false); }}>Cancel</button>
              <button className="btn primary" disabled={busy} onClick={() => void doRestore('merge')}>
                {busy ? 'Working...' : 'Restore (add missing)'}
              </button>
            </div>
            {!confirm && (
              <div className="p3-gap">
                <div className="note">
                  Replace would change {rp.replacedCases} case(s) to the backup version. Cases only on this device
                  ({rp.keptOnlyHere}) stay.
                </div>
                <button className="btn" disabled={busy} onClick={() => setConfirm(true)}>
                  Replace with this backup...
                </button>
              </div>
            )}
            {confirm && (
              <div className="card error p3-gap">
                <h3>Replace with this backup?</h3>
                <div>{rp.addedCases} case(s) will be added.</div>
                <div>{rp.replacedCases} case(s) will become exactly as in the backup (your later changes to them are lost).</div>
                <div>{rp.unchangedCases} case(s) are already identical.</div>
                <div>{rp.keptNewerCases} case(s) have newer history here and will NOT be touched.</div>
                <div>{rp.keptOnlyHere} case(s) exist only on this device and will be kept.</div>
                <div>Hearings: {rp.addedHearings} added, {rp.replacedHearings} replaced. Nothing is deleted.</div>
                <div className="note">A safety backup is saved first. If it cannot be saved, nothing is changed.</div>
                <div className="form-buttons p3-gap">
                  <button className="btn" disabled={busy} onClick={() => setConfirm(false)}>No, go back</button>
                  <button className="btn primary" disabled={busy} onClick={() => void doRestore('replace')}>
                    {busy ? 'Working...' : 'Yes, replace now'}
                  </button>
                </div>
              </div>
            )}
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
