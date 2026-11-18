// File saving helpers.
// Phone (Capacitor): write to the app cache, then open Android's "Save as"
// picker (SaveFile plugin). If that is not available, fall back to the Share menu.
// Browser: normal download link.

export type SaveOutcome = 'saved' | 'cancelled' | 'failed';

type SaveFileResult = { saved: boolean; uri?: string };
type SaveFilePlugin = {
  save(o: { name: string; path: string; mime: string }): Promise<SaveFileResult>;
};

let saveFilePlugin: SaveFilePlugin | null = null;
let lastError = '';

export function lastSaveError(): string {
  return lastError;
}

// IMPORTANT: a Capacitor plugin object must never be returned straight from an
// async function (the promise would call plugin.then() and hang). So it is
// wrapped in a plain object.
async function getSaveFile(): Promise<{ plugin: SaveFilePlugin }> {
  if (!saveFilePlugin) {
    const core = await import('@capacitor/core');
    saveFilePlugin = core.registerPlugin<SaveFilePlugin>('SaveFile');
  }
  return { plugin: saveFilePlugin };
}

async function isNative(): Promise<boolean> {
  try {
    const core = await import('@capacitor/core');
    return core.Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function mimeFromName(name: string, given?: string): string {
  if (given && given.length > 0) return given;
  const n = name.toLowerCase();
  if (n.endsWith('.json')) return 'application/json';
  if (n.endsWith('.zip')) return 'application/zip';
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.txt')) return 'text/plain';
  if (n.endsWith('.csv')) return 'text/csv';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function toast(text: string, isError: boolean): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.ld-save-toast').forEach((n) => n.remove());
  const d = document.createElement('div');
  d.className = 'ld-save-toast';
  d.setAttribute('role', 'status');
  d.textContent = text;
  d.style.cssText =
    'position:fixed;left:12px;right:12px;bottom:84px;z-index:99999;padding:12px 14px;' +
    'border-radius:10px;color:#fff;font-size:14px;line-height:1.35;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.3);background:' +
    (isError ? '#b42318' : '#0b6b3a');
  document.body.appendChild(d);
  setTimeout(() => d.remove(), isError ? 15000 : 6000);
}

function safeName(name: string): string {
  const s = name.replace(/[^A-Za-z0-9._-]+/g, '_');
  return s.length > 0 ? s : 'file';
}

function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return 'unknown error';
  }
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH) as unknown as number[]);
  }
  return btoa(bin);
}

async function writeToCache(name: string, bytes: Uint8Array): Promise<string> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  try {
    await Filesystem.rmdir({ path: 'exports', directory: Directory.Cache, recursive: true });
  } catch {
    // folder did not exist - fine
  }
  const r = await Filesystem.writeFile({
    path: 'exports/' + Date.now() + '/' + safeName(name),
    data: toBase64(bytes),
    directory: Directory.Cache,
    recursive: true,
  });
  return r.uri;
}

async function nativeShare(name: string, uri: string): Promise<'shared' | 'cancelled'> {
  const { Share } = await import('@capacitor/share');
  try {
    await Share.share({ title: name, dialogTitle: 'Send ' + name, files: [uri] });
    return 'shared';
  } catch (e) {
    if (/cancel/i.test(errText(e))) return 'cancelled';
    throw e;
  }
}

async function nativeSave(name: string, bytes: Uint8Array, mime: string): Promise<SaveOutcome> {
  try {
    const uri = await writeToCache(name, bytes);
    const holder = await getSaveFile();
    let res: SaveFileResult;
    try {
      res = await holder.plugin.save({ name: safeName(name), path: uri, mime });
    } catch (e) {
      const m = errText(e);
      if (/not implemented|not available|unimplemented/i.test(m)) {
        // Save-as screen not available: fall back to the Share menu.
        const r = await nativeShare(name, uri);
        return r === 'shared' ? 'saved' : 'cancelled';
      }
      throw e;
    }
    if (res.saved) {
      toast('Saved: ' + safeName(name), false);
      return 'saved';
    }
    return 'cancelled';
  } catch (e) {
    lastError = errText(e);
    toast('Could not save ' + name + ': ' + lastError, true);
    return 'failed';
  }
}

function browserDownload(name: string, bytes: Uint8Array, mime: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function downloadBytes(name: string, bytes: Uint8Array, mime?: string): Promise<SaveOutcome> {
  const m = mimeFromName(name, mime);
  lastError = '';
  if (await isNative()) {
    return nativeSave(name, bytes, m);
  }
  try {
    browserDownload(name, bytes, m);
    return 'saved';
  } catch (e) {
    lastError = errText(e);
    return 'failed';
  }
}

export async function downloadTextFile(name: string, text: string, mime?: string): Promise<SaveOutcome> {
  return downloadBytes(name, new TextEncoder().encode(text), mime);
}

export async function shareBytes(
  name: string,
  bytes: Uint8Array,
  mime?: string,
): Promise<'shared' | 'cancelled' | 'unsupported'> {
  const m = mimeFromName(name, mime);
  if (await isNative()) {
    try {
      const uri = await writeToCache(name, bytes);
      return await nativeShare(name, uri);
    } catch (e) {
      toast('Could not share ' + name + ': ' + errText(e), true);
      return 'cancelled';
    }
  }
  try {
    const nav = navigator as Navigator & {
      canShare?: (d: ShareData) => boolean;
    };
    const file = new File([bytes as unknown as BlobPart], name, { type: m });
    if (typeof nav.share !== 'function' || !nav.canShare || !nav.canShare({ files: [file] })) {
      return 'unsupported';
    }
    await nav.share({ files: [file], title: name });
    return 'shared';
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}
// end of files.ts
