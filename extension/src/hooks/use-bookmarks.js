import {
  bookmarks,
  folders,
  settings,
  addBookmarkPosition,
  addBookmarkFolderId,
} from "../state/store.js";
import { persistBookmarks } from "../state/storage-bridge.js";
import { enqueueSync } from "../sync-queue.js";
import {
  getHighResolutionFavicon,
  cleanupUnusedFavicons,
} from "../utils/favicon.js";
import { normalizeUrl } from "../utils/url.js";

/**
 * Ensure a position value is [x, y]. Converts legacy integer positions
 * (from the old float-based system) to [index, 0] style coordinates.
 */
function normalizePosition(pos, index, tilesPerRow = 8) {
  if (Array.isArray(pos) && pos.length === 2) return pos;
  // Legacy: position was a float/integer index
  const i = typeof pos === "number" ? Math.round(pos) : index;
  return [i % tilesPerRow, Math.floor(i / tilesPerRow)];
}

export async function loadBookmarks() {
  try {
    const result = await chrome.storage.local.get([
      "bookmarks",
      "folders",
      "bookmarkSettings",
    ]);
    const tilesPerRow = result.bookmarkSettings?.tilesPerRow ?? 8;

    const rawBookmarks = result.bookmarks;
    if (rawBookmarks) {
      bookmarks.value = rawBookmarks.map((b, i) => ({
        ...b,
        position: normalizePosition(b.position, i, tilesPerRow),
      }));
    } else {
      bookmarks.value = await getDefaultBookmarks();
    }

    const rawFolders = result.folders;
    if (rawFolders) {
      folders.value = rawFolders.map((f, i) => ({
        ...f,
        position: normalizePosition(f.position, i, tilesPerRow),
      }));
    } else {
      folders.value = [];
    }
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

  const tilesPerRow = settings.peek().tilesPerRow;
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
      position: [i % tilesPerRow, Math.floor(i / tilesPerRow)],
    });
  }

  return result;
}

// ─── getNextPosition helper ─────────────────────────────────────────────────

/**
 * Find the next available grid position after all existing items.
 * Returns [x, y] — the cell immediately after the rightmost occupied cell
 * in the bottom-most row, wrapping to the next row if needed.
 */
export function getNextPosition(items, tilesPerRow) {
  if (!items || items.length === 0) return [0, 0];

  let maxY = 0;
  let maxX = -1;
  for (const item of items) {
    const [ix, iy] = item.position || [0, 0];
    if (iy > maxY || (iy === maxY && ix > maxX)) {
      maxY = iy;
      maxX = ix;
    }
  }
  if (maxX + 1 >= tilesPerRow) {
    return [0, maxY + 1];
  }
  return [maxX + 1, maxY];
}

// ─── addBookmark ──────────────────────────────────────────────────────────

export async function addBookmark({
  title,
  url: rawUrl,
  favicon: selectedFavicon,
}) {
  const url = normalizeUrl(rawUrl);
  const faviconWasSelected = !!selectedFavicon;
  const tilesPerRow = settings.peek().tilesPerRow;

  // Use the clicked-cell position if set, otherwise find next available
  const explicitPos = addBookmarkPosition.peek();
  const folderId = addBookmarkFolderId.peek();

  let contextItems;
  if (folderId) {
    // Adding inside a folder — scope to that folder's bookmarks
    contextItems = bookmarks.peek().filter((b) => b.folderId === folderId);
  } else {
    // Adding at root level
    contextItems = [
      ...folders.peek(),
      ...bookmarks.peek().filter((b) => !b.folderId),
    ];
  }
  const position = explicitPos || getNextPosition(contextItems, tilesPerRow);
  addBookmarkPosition.value = null;
  addBookmarkFolderId.value = null;

  const now = new Date().toISOString();
  const bookmark = {
    id: Date.now(),
    title,
    url,
    favicon: selectedFavicon || "",
    dateAdded: now,
    folderId: folderId || null,
    lastUpdated: now,
    position,
  };

  bookmarks.value = [...bookmarks.peek(), bookmark];
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
    position: bookmark.position,
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

export function duplicateBookmark(bookmarkId, overrides = {}) {
  const current = [...bookmarks.peek()];
  const original = current.find((b) => b.id === bookmarkId);
  if (!original) return null;

  const tilesPerRow = settings.peek().tilesPerRow;
  const rootItems = [...folders.peek(), ...current.filter((b) => !b.folderId)];
  const position = getNextPosition(rootItems, tilesPerRow);

  const now = new Date().toISOString();
  const duplicated = {
    ...original,
    ...overrides,
    id: Date.now(),
    dateAdded: now,
    lastUpdated: now,
    position,
  };

  bookmarks.value = [...current, duplicated];
  persistBookmarks(); // fire-and-forget

  enqueueSync("create_bookmark", {
    localId: duplicated.id,
    title: duplicated.title,
    url: duplicated.url,
    favicon: duplicated.favicon || null,
    folderId: duplicated.folderId,
    position: duplicated.position,
  });

  return duplicated;
}

export async function deleteBookmarkById(bookmarkId) {
  bookmarks.value = bookmarks.peek().filter((b) => b.id !== bookmarkId);
  await persistBookmarks();
  await cleanupUnusedFavicons(bookmarks.peek());
  enqueueSync("delete_bookmark", { id: bookmarkId });
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
