import { bookmarks, folders, settings, authState } from "./store.js";

/**
 * Ensure a position value is [x, y].
 * Converts legacy integer/float positions from the old system.
 */
function normalizePosition(pos, index, tilesPerRow = 8) {
  if (Array.isArray(pos) && pos.length === 2) return pos;
  const i = typeof pos === "number" ? Math.round(pos) : index;
  return [i % tilesPerRow, Math.floor(i / tilesPerRow)];
}

function normalizeItems(items, tilesPerRow) {
  if (!Array.isArray(items)) return [];
  return items.map((item, i) => ({
    ...item,
    position: normalizePosition(item.position, i, tilesPerRow),
  }));
}

// Read initial state from chrome.storage.local into signals
export async function initStore() {
  const data = await chrome.storage.local.get([
    "bookmarks",
    "folders",
    "bookmarkSettings",
    "authState",
  ]);
  const tilesPerRow = data.bookmarkSettings?.tilesPerRow ?? 8;
  bookmarks.value = normalizeItems(data.bookmarks, tilesPerRow);
  folders.value = normalizeItems(data.folders, tilesPerRow);
  if (data.bookmarkSettings)
    settings.value = { ...settings.peek(), ...data.bookmarkSettings };
  if (data.authState) authState.value = data.authState;
}

// Listen for external changes (from background.js or other tabs)
let localSaveInProgress = false;

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || localSaveInProgress) return;
  const tilesPerRow = settings.peek().tilesPerRow ?? 8;
  if (changes.bookmarks)
    bookmarks.value = normalizeItems(changes.bookmarks.newValue, tilesPerRow);
  if (changes.folders) {
    folders.value = normalizeItems(changes.folders.newValue, tilesPerRow);
  }
  if (changes.bookmarkSettings)
    settings.value = {
      ...settings.peek(),
      ...changes.bookmarkSettings.newValue,
    };
  if (changes.authState)
    authState.value = changes.authState.newValue || {
      authenticated: false,
      user: null,
    };
});

// Write signal values to chrome.storage.local
export async function persistBookmarks() {
  localSaveInProgress = true;
  try {
    await chrome.storage.local.set({
      bookmarks: bookmarks.peek(),
      folders: folders.peek(),
    });
  } finally {
    localSaveInProgress = false;
  }
}

export async function persistSettings() {
  localSaveInProgress = true;
  try {
    await chrome.storage.local.set({ bookmarkSettings: settings.peek() });
  } finally {
    localSaveInProgress = false;
  }
}
