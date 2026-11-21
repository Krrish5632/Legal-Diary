import type { FileStore } from '../core/documents';
import { base64ToBytes, bytesToBase64 } from '../core/base64';

// Real files in the app's own private folder on the phone. No storage permission is needed,
// and other apps cannot read them.
const FOLDER = 'legal_diary_docs';

function pathFor(id: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(id) || id === '.' || id === '..') {
    throw new Error('This file name is not allowed.');
  }
  return FOLDER + '/' + id;
}

export class PhoneFileStore implements FileStore {
  async put(id: string, bytes: Uint8Array): Promise<void> {
    const path = pathFor(id);
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.writeFile({
      path,
      data: bytesToBase64(bytes),
      directory: Directory.Data,
      recursive: true,
    });
  }

  async has(id: string): Promise<boolean> {
    try {
      const path = pathFor(id);
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      await Filesystem.stat({ path, directory: Directory.Data });
      return true;
    } catch {
      return false;
    }
  }

  async get(id: string): Promise<Uint8Array | null> {
    const path = pathFor(id);
    if (!(await this.has(id))) return null;
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const r = await Filesystem.readFile({ path, directory: Directory.Data });
    const d = r.data;
    if (typeof d === 'string') return base64ToBytes(d);
    return new Uint8Array(await d.arrayBuffer());
  }

  async remove(id: string): Promise<void> {
    const path = pathFor(id);
    if (!(await this.has(id))) return;
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.deleteFile({ path, directory: Directory.Data });
  }
}
// end of phonefiles.ts
