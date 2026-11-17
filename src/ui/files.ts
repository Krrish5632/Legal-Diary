/** Saves a text file from the browser. On the phone, saving through the Android file picker is added in the Android step. */
export function downloadTextFile(name: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime });
  saveBlob(name, blob);
}

/** Saves a binary file (a document) from the browser. */
export function downloadBytes(name: string, bytes: Uint8Array, mime: string): void {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime || 'application/octet-stream' });
  saveBlob(name, blob);
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

/** Opens the system share sheet if this browser can share files. */
export async function shareBytes(
  name: string,
  bytes: Uint8Array,
  mime: string,
): Promise<'shared' | 'cancelled' | 'unsupported'> {
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
