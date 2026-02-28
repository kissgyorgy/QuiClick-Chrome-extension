import { signal } from "@preact/signals";

// Persistent state (synced with chrome.storage.local)
export const bookmarks = signal([]);
export const folders = signal([]);
export const settings = signal({
  showTitles: true,
  tilesPerRow: 8,
  tileGap: 1,
  showAddButton: true,
});
export const authState = signal({ authenticated: false, user: null });

// Transient UI state
export const currentBookmarkId = signal(null);
export const currentFolderId = signal(null);
export const openFolderId = signal(null);
export const dragState = signal({
  isDragging: false,
  draggedBookmarkId: null,
  draggedFolderId: null,
});

// 'addBookmark' | 'editBookmark' | 'duplicateBookmark' | 'deleteConfirm' | 'folderDeleteConfirm'
// | 'folder' | 'createFolder' | 'renameFolder' | 'settings' | 'importConfirm' | null
export const activeModal = signal(null);

export const contextMenu = signal({ visible: false, x: 0, y: 0, type: null }); // type: 'bookmark' | 'folder'

// Pending import data (used during import confirmation flow)
export const pendingImportData = signal(null);

// Notification state
export const notification = signal({ visible: false, type: null }); // type: 'copy' | 'import'
