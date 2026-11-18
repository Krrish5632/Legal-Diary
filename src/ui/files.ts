/**
 * Saving and sharing files.
 * Browser: normal download link.
 * Phone app: the file is written to the app's private cache and the Android
 * share menu opens, so the user can save it to Drive, Files, etc.
 * (No storage permission is needed.)
 */

const TOAST_ID = 'ld-save-toast';

function toast(text: string, bad: boolean): void {
  if (typeof document === 'undefined') return;
  const found = document.getElementById(TOAST_ID);
  const node: HTMLElement = found ?? document.body.appendChild(document.createElement('div'));
  node.id = TOAST_ID;
  node.setAttribute('role', 'alert');
  node.style.cssText =
    'position:fixed;left:12px;right:12px;bottom:84px;z-index:99999;padding:12px 14px;' +
    'border-radius:10px;font-size:15px;color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.3);' +
    'background:' + (bad ? '#b42318' : '#0f2a5c');
  node.textContent = text;
  window.setTimeout(() => {
    if (node.textContent === text) node.remove();
  }, bad ? 15000 : 4000);
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + step)));
  }
  return btoa(bin);
}

function safeName(name: string): string {
  const s = name.replace(/[^A-Za-z0-9._-]/g, '_');
  return s.length > 0 ? s : 'file';
}

/** Phone: write to cache, open the share menu. */
async function nativeShare(name: string, bytes: Uint8Array): Promise<'shared' | 'cancelled'> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  // Remove files left from earlier saves so client data does not pile up in the cache.
  try {
    await Filesystem.rmdir({ path: 'exports', directory: Directory.Cache, recursive: true });
  } catch {
    /* nothing to remove */
  }
  const written = await Filesystem.writeFile({
    path: 'exports/' + String(Date.now()) + '/' + safeName(name),
    data: toBase64(bytes),
    directory: Directory.Cache,
    recursive: true,
  });
  try {
    await Share.share({
      title: name,
      dialogTitle: 'Save or send ' + name,
      files: [written.uri],
    });
    return 'shared';
  } catch (e) {
    if (/cancel/i.test(errText(e))) return 'cancelled';
    throw e;
  }
}

function saveBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function saveBytes(name: string, bytes: Uint8Array, mime: string): Promise<void> {
  try {
    if (await isNative()) {
      await nativeShare(name, bytes);
      return;
    }
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime || 'application/octet-stream' });
    saveBlob(name, blob);
  } catch (e) {
    toast('Could not save ' + name + ': ' + errText(e), true);
  }
}

/** Saves a text file (browser download, or the share menu on the phone). */
export function downloadTextFile(name: string, text: string, mime = 'application/json'): void {
  void saveBytes(name, new TextEncoder().encode(text), mime);
}

/** Saves a binary file (a document, a PDF). */
export function downloadBytes(name: string, bytes: Uint8Array, mime: string): void {
  void saveBytes(name, bytes, mime);
}

/** Opens the system share sheet. */
export async function shareBytes(
  name: string,
  bytes: Uint8Array,
  mime: string,
): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (await isNative()) {
    return nativeShare(name, bytes);
  }
  const file = new File([bytes.slice().buffer as ArrayBuffer], name, { type: mime || 'application/octet-stream' });
  if (
    typeof navigator.share !== 'function' ||
    typeof navigator.canShare !== 'function' ||
    !navigator.canShare({ files: [file] })
  ) {
    return 'unsupported';
  }
  try {
    await navigator.share({ files: [file], title: name });
    return 'shared';
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    throw e;
  }
}
// end of files.ts
