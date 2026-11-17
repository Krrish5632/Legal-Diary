import { IndexedDbFileStore } from '../core/filestore';

/** Where document files are kept in the browser. Separate from the case database. */
export const fileStore = new IndexedDbFileStore('legal_diary_pro_files');
// end of docstore.ts
