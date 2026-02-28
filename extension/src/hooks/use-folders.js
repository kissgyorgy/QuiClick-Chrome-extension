import { bookmarks, folders } from "../state/store.js";
import { persistBookmarks } from "../state/storage-bridge.js";
import { enqueueSync } from "../sync-queue.js";

export async function createFolder(name) {
  const now = new Date().toISOString();
  const folder = {
    id: Date.now(),
    name,
    dateCreated: now,
    lastUpdated: now,
    position: folders.peek().length,
  };

  folders.value = [...folders.peek(), folder];
  await persistBookmarks();

  enqueueSync("create_folder", {
    localId: folder.id,
    name: folder.name,
    position: folder.position,
  });

  return folder;
}

export async function renameFolder(folderId, newName) {
  const current = [...folders.peek()];
  const index = current.findIndex((f) => f.id === folderId);
  if (index === -1) return;

  current[index] = {
    ...current[index],
    name: newName,
    lastUpdated: new Date().toISOString(),
  };
  folders.value = current;
  await persistBookmarks();

  enqueueSync("update_folder", { id: folderId, updates: { name: newName } });
}

export async function deleteFolder(folderId) {
  // Move all bookmarks in this folder back to main view
  const updatedBookmarks = bookmarks
    .peek()
    .map((b) => (b.folderId === folderId ? { ...b, folderId: null } : b));
  bookmarks.value = updatedBookmarks;
  folders.value = folders.peek().filter((f) => f.id !== folderId);
  await persistBookmarks();

  enqueueSync("delete_folder", { id: folderId });
}

export async function moveBookmarkToFolder(bookmarkId, folderId) {
  const current = [...bookmarks.peek()];
  const index = current.findIndex((b) => b.id === bookmarkId);
  if (index === -1) return;

  current[index] = {
    ...current[index],
    folderId,
    lastUpdated: new Date().toISOString(),
  };
  bookmarks.value = current;
  await persistBookmarks();

  enqueueSync("update_bookmark", { id: bookmarkId, updates: { folderId } });
}

export async function removeBookmarkFromFolder(bookmarkId) {
  const current = [...bookmarks.peek()];
  const index = current.findIndex((b) => b.id === bookmarkId);
  if (index === -1) return;

  current[index] = {
    ...current[index],
    folderId: null,
    lastUpdated: new Date().toISOString(),
  };
  bookmarks.value = current;
  await persistBookmarks();

  enqueueSync("update_bookmark", {
    id: bookmarkId,
    updates: { folderId: null },
  });
}
