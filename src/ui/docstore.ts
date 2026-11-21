import { Capacitor } from '@capacitor/core';
import { IndexedDbFileStore } from '../core/filestore';
import { LayeredFileStore } from '../core/layeredstore';
import type { FileStore } from '../core/documents';
import { PhoneFileStore } from './phonefiles';

/** The old place: the WebView database. Still read, so no old document is ever lost. */
const browserStore = new IndexedDbFileStore('legal_diary_pro_files');

/**
 * Phone: new documents are real files in the app's private folder. Old ones are found in the
 * WebView database and copied over the first time they are opened. Browser: the database only.
 */
export const fileStore: FileStore = Capacitor.isNativePlatform()
  ? new LayeredFileStore(new PhoneFileStore(), browserStore)
  : browserStore;
// end of docstore.ts
