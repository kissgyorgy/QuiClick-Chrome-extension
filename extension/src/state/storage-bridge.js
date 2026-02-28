import { bookmarks, folders, settings, authState } from "./store.js";

// Read initial state from chrome.storage.local into signals
export async function initStore() {
  const data = await chrome.storage.local.get([
    "bookmarks",
    "folders",
    "bookmarkSettings",
    "authState",
  ]);
  bookmarks.value = data.bookmarks || [];
  folders.value = data.folders || [];
  if (data.bookmarkSettings)
    settings.value = { ...settings.peek(), ...data.bookmarkSettings };
  if (data.authState) authState.value = data.authState;
}

// Listen for external changes (from background.js or other tabs)
let localSaveInProgress = false;

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || localSaveInProgress) return;
  if (changes.bookmarks) bookmarks.value = changes.bookmarks.newValue || [];
  if (changes.folders) folders.value = changes.folders.newValue || [];
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
