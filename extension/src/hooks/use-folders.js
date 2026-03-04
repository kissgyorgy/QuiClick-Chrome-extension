import { bookmarks, folders, settings } from "../state/store.js";
import { persistBookmarks } from "../state/storage-bridge.js";
import { enqueueSync } from "../sync-queue.js";
import { getNextPosition } from "./use-bookmarks.js";

export async function createFolder(name) {
  const now = new Date().toISOString();
  const tilesPerRow = settings.peek().tilesPerRow;

  const rootItems = [
    ...folders.peek(),
    ...bookmarks.peek().filter((b) => !b.folderId),
  ];
  const position = getNextPosition(rootItems, tilesPerRow);

  const folder = {
    id: Date.now(),
    name,
    dateCreated: now,
    lastUpdated: now,
    position,
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
  // Move all bookmarks in this folder back to main view at next available positions
  const tilesPerRow = settings.peek().tilesPerRow;
  const currentBookmarks = [...bookmarks.peek()];
  const currentFolders = folders.peek().filter((f) => f.id !== folderId);

  const rootItems = [
    ...currentFolders,
    ...currentBookmarks.filter((b) => !b.folderId),
  ];

  const updatedBookmarks = currentBookmarks.map((b) => {
    if (b.folderId !== folderId) return b;
    const position = getNextPosition(rootItems, tilesPerRow);
    // Add this bookmark to rootItems so next one gets a different position
    const updated = { ...b, folderId: null, position };
    rootItems.push(updated);
    return updated;
  });

  bookmarks.value = updatedBookmarks;
  folders.value = currentFolders;
  await persistBookmarks();

  enqueueSync("delete_folder", { id: folderId });
}

export async function moveBookmarkToFolder(bookmarkId, folderId) {
  const current = [...bookmarks.peek()];
  const index = current.findIndex((b) => b.id === bookmarkId);
  if (index === -1) return;

  const tilesPerRow = settings.peek().tilesPerRow;
  const folderBookmarks = current.filter(
    (b) => b.folderId === folderId && b.id !== bookmarkId,
  );
  const position = getNextPosition(folderBookmarks, tilesPerRow);

  current[index] = {
    ...current[index],
    folderId,
    position,
    lastUpdated: new Date().toISOString(),
  };
  bookmarks.value = current;
  await persistBookmarks();

  enqueueSync("update_bookmark", {
    id: bookmarkId,
    updates: { folderId, position },
  });
}

export async function removeBookmarkFromFolder(bookmarkId) {
  const current = [...bookmarks.peek()];
  const index = current.findIndex((b) => b.id === bookmarkId);
  if (index === -1) return;

  const tilesPerRow = settings.peek().tilesPerRow;
  const rootItems = [
    ...folders.peek(),
    ...current.filter((b) => !b.folderId && b.id !== bookmarkId),
  ];
  const position = getNextPosition(rootItems, tilesPerRow);

  current[index] = {
    ...current[index],
    folderId: null,
    position,
    lastUpdated: new Date().toISOString(),
  };
  bookmarks.value = current;
  await persistBookmarks();

  enqueueSync("update_bookmark", {
    id: bookmarkId,
    updates: { folderId: null, position },
  });
}
