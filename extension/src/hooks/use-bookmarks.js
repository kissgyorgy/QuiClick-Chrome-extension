import { bookmarks, folders } from "../state/store.js";
import { persistBookmarks } from "../state/storage-bridge.js";
import { enqueueSync } from "../sync-queue.js";
import {
  getHighResolutionFavicon,
  cleanupUnusedFavicons,
  downloadAndCacheFavicon,
} from "../utils/favicon.js";
import { normalizeUrl } from "../utils/url.js";

export async function loadBookmarks() {
  try {
    const result = await chrome.storage.local.get(["bookmarks", "folders"]);
    bookmarks.value = result.bookmarks || (await getDefaultBookmarks());
    folders.value = result.folders || [];
  } catch (error) {
    console.log("Error loading from local storage:", error.message);
    bookmarks.value = await getDefaultBookmarks();
    folders.value = [];
  }
}

async function getDefaultBookmarks() {
  const defaultUrls = [
    { title: "Google", url: "https://www.google.com" },
    { title: "GitHub", url: "https://github.com" },
    { title: "Stack Overflow", url: "https://stackoverflow.com" },
    { title: "YouTube", url: "https://www.youtube.com" },
  ];

  const result = [];
  for (let i = 0; i < defaultUrls.length; i++) {
    const { title, url } = defaultUrls[i];
    const favicon = await getHighResolutionFavicon(url);
    result.push({
      id: Date.now() + i + 1,
      title,
      url,
      favicon,
      dateAdded: new Date().toISOString(),
      folderId: null,
    });
  }

  return result;
}

export async function addBookmark({
  title,
  url: rawUrl,
  favicon: selectedFavicon,
}) {
  const url = normalizeUrl(rawUrl);
  const faviconWasSelected = !!selectedFavicon;

  const now = new Date().toISOString();
  const bookmark = {
    id: Date.now(),
    title,
    url,
    favicon: selectedFavicon || "",
    dateAdded: now,
    folderId: null,
    lastUpdated: now,
    position: 0,
  };

  const current = [...bookmarks.peek()];
  current.unshift(bookmark);
  current.forEach((b, i) => {
    b.position = i;
  });
  bookmarks.value = current;
  await persistBookmarks();

  if (!faviconWasSelected) {
    updateFaviconAsync(bookmark.id, url);
  }

  enqueueSync("create_bookmark", {
    localId: bookmark.id,
    title: bookmark.title,
    url: bookmark.url,
    favicon: bookmark.favicon || null,
    folderId: bookmark.folderId,
    position: 0,
  });

  return bookmark;
}

export async function updateBookmark(
  bookmarkId,
  { title, url: rawUrl, favicon: selectedFavicon },
) {
  const url = normalizeUrl(rawUrl);
  const current = [...bookmarks.peek()];
  const index = current.findIndex((b) => b.id === bookmarkId);
  if (index === -1) return;

  const oldUrl = current[index].url;

  const updates = { title, url, lastUpdated: new Date().toISOString() };
  if (selectedFavicon !== null && selectedFavicon !== undefined) {
    updates.favicon = selectedFavicon;
  }
  current[index] = { ...current[index], ...updates };
  bookmarks.value = current;
  await persistBookmarks();

  if (
    url !== oldUrl &&
    (selectedFavicon === null || selectedFavicon === undefined)
  ) {
    updateFaviconAsync(bookmarkId, url);
  }

  enqueueSync("update_bookmark", {
    id: bookmarkId,
    updates: { title, url, favicon: updates.favicon },
  });
}

export async function duplicateBookmark(bookmarkId) {
  const current = [...bookmarks.peek()];
  const original = current.find((b) => b.id === bookmarkId);
  if (!original) return null;

  const now = new Date().toISOString();
  const duplicated = {
    ...original,
    id: Date.now(),
    dateAdded: now,
    lastUpdated: now,
  };

  const originalIndex = current.findIndex((b) => b.id === bookmarkId);
  current.splice(originalIndex + 1, 0, duplicated);
  bookmarks.value = current;
  await persistBookmarks();

  enqueueSync("create_bookmark", {
    localId: duplicated.id,
    title: duplicated.title,
    url: duplicated.url,
    favicon: duplicated.favicon || null,
    folderId: duplicated.folderId,
    position: originalIndex + 1,
  });

  return duplicated;
}

export async function deleteBookmarkById(bookmarkId) {
  bookmarks.value = bookmarks.peek().filter((b) => b.id !== bookmarkId);
  await persistBookmarks();
  await cleanupUnusedFavicons(bookmarks.peek());
  enqueueSync("delete_bookmark", { id: bookmarkId });
}

export async function reorderBookmarks(draggedId, targetId, insertAfter) {
  const current = [...bookmarks.peek()];
  const draggedIndex = current.findIndex((b) => b.id == draggedId);
  const targetIndex = current.findIndex((b) => b.id == targetId);

  if (draggedIndex === -1 || targetIndex === -1) return;

  const draggedBookmark = current.splice(draggedIndex, 1)[0];

  let newIndex = targetIndex;
  if (draggedIndex < targetIndex) {
    newIndex = insertAfter ? targetIndex : targetIndex - 1;
  } else {
    newIndex = insertAfter ? targetIndex + 1 : targetIndex;
  }

  current.splice(newIndex, 0, draggedBookmark);

  const now = new Date().toISOString();
  current.forEach((b, i) => {
    b.position = i;
    b.lastUpdated = now;
  });

  bookmarks.value = current;
  await persistBookmarks();

  const reorderItems = current
    .filter((b) => !b.folderId)
    .map((b, i) => ({ id: b.id, position: i }));
  enqueueSync("reorder", { items: reorderItems });
}

async function updateFaviconAsync(bookmarkId, url) {
  try {
    const faviconUrl = await getHighResolutionFavicon(url);
    const current = [...bookmarks.peek()];
    const index = current.findIndex((b) => b.id === bookmarkId);

    if (index !== -1 && faviconUrl) {
      current[index] = {
        ...current[index],
        favicon: faviconUrl,
        lastUpdated: new Date().toISOString(),
      };
      bookmarks.value = current;
      await persistBookmarks();
      enqueueSync("update_bookmark", {
        id: bookmarkId,
        updates: { favicon: faviconUrl },
      });
    }
  } catch (error) {
    console.log("Failed to update favicon asynchronously:", error);
  }
}

export async function copyBookmarkUrl(bookmarkId) {
  const bookmark = bookmarks.peek().find((b) => b.id === bookmarkId);
  if (!bookmark) return false;

  try {
    await navigator.clipboard.writeText(bookmark.url);
    return true;
  } catch (error) {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = bookmark.url;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      return true;
    } catch (fallbackError) {
      return false;
    }
  }
}
