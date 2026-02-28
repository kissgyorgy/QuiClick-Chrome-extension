# Overview

Rewrite the QuiClick Chrome extension's UI (new tab page + popup) from vanilla JS with manual DOM manipulation to Preact with JSX components, using Preact signals for state management. Goal: better codebase maintainability while preserving the same first-paint speed profile.

# Architecture

The new tab page and popup become Preact apps mounted into minimal shell HTML files (`<div id="app">`). All UI moves to JSX components. Global state (bookmarks, folders, settings, auth) lives in Preact signals at module level, bridged to `chrome.storage.local` via an `onChanged` listener for cross-tab reactivity. Non-UI modules (`api.js`, `sync-queue.js`, `background.js`) stay unchanged.

# Tech Stack

- `preact` — UI library (~4KB gzipped)
- `@preact/signals` — Reactive state (~1KB gzipped)
- `@preact/preset-vite` — Vite plugin for JSX transform + HMR
- Existing: `vite`, `tailwindcss`, `@tailwindcss/vite`

# Implementation plan

## File structure

The current mixin-based `BookmarkManager` class (script.js + 5 mixin modules) gets replaced with a component tree + shared hooks. Flat component directory — the app isn't big enough for feature-based grouping.

```
src/
  state/
    store.js              # Preact signals: bookmarks, folders, settings, authState, UI state
    storage-bridge.js     # chrome.storage.onChanged ↔ signal sync (bidirectional)
  hooks/
    use-bookmarks.js      # CRUD operations: add, update, delete, reorder, save to storage
    use-folders.js         # Folder CRUD: create, rename, delete, move bookmarks in/out
    use-settings.js        # Settings load/save, CSS grid updates
    use-favicons.js        # Favicon fetching, caching, selection (shared by newtab + popup)
    use-drag-and-drop.js   # Drag reorder + external drop + folder drop
  components/
    Header.jsx
    BookmarkGrid.jsx       # Main grid: renders FolderTile + BookmarkTile + AddTile
    BookmarkTile.jsx       # Single bookmark with click/middle-click/right-click/drag handlers
    FolderTile.jsx         # Single folder tile with click/right-click/drop handlers
    AddBookmarkTile.jsx    # The "+" tile
    ContextMenu.jsx        # Unified context menu (bookmark + folder items)
    AddBookmarkModal.jsx
    EditBookmarkModal.jsx
    DeleteConfirm.jsx
    FolderModal.jsx        # Open folder overlay with bookmark grid inside
    CreateFolderModal.jsx
    RenameFolderModal.jsx
    SettingsButton.jsx
    SettingsModal.jsx
    ImportConfirmModal.jsx
    Notification.jsx       # Reusable toast (copy, import success)
    FaviconPicker.jsx      # Shared favicon grid selector (used in Add, Edit, and Popup)
  utils/
    url.js                 # normalizeUrl, isValidUrl, isValidUrlOrCanBeNormalized, extractTitleFromUrl
    favicon.js             # Pure logic: getHighResolutionFavicon, downloadAndCacheFavicon, getAllFaviconUrlsAndTitle, etc.
  newtab.jsx               # Entry: render(<App />, document.getElementById('app'))
  newtab-app.jsx           # Root component: wires up storage bridge, renders Header + Grid + Modals
  popup.jsx                # Entry: render(<PopupApp />, document.getElementById('app'))
  popup-app.jsx            # Popup root component
  api.js                   # UNCHANGED
  sync-queue.js            # UNCHANGED
  background.js            # UNCHANGED
  newtab.html              # Minimal shell: <div id="app"></div> + <script type="module" src="newtab.jsx">
  popup.html               # Minimal shell: <div id="app"></div> + <script type="module" src="popup.jsx">
  tailwind.css             # UNCHANGED — all glass morphism styles stay here
  styles.css               # REMOVED (unused)
```

## State (store.js)

Module-level Preact signals. No context providers needed.

```js
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
export const activeModal = signal(null); // 'addBookmark' | 'editBookmark' | 'deleteConfirm' | 'folder' | 'createFolder' | 'renameFolder' | 'settings' | 'importConfirm' | null
export const contextMenu = signal({ visible: false, x: 0, y: 0, type: null }); // type: 'bookmark' | 'folder'
```

## Storage bridge (storage-bridge.js)

Replaces the current `setupStorageListener()` and various `saveBookmarks()`/`saveSettingsToStorage()` calls.

```js
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
```

## Utils (url.js, favicon.js)

Extract pure functions from the current `BookmarkManager` methods. These are not Preact-specific — just plain JS.

- `url.js`: `normalizeUrl()`, `isValidUrl()`, `isValidUrlOrCanBeNormalized()`, `extractTitleFromUrl()` — extracted verbatim from `script.js`
- `favicon.js`: `getHighResolutionFavicon()`, `getAllFaviconUrlsAndTitle()`, `downloadAndCacheFavicon()`, `getCachedFavicon()`, `cacheFavicon()`, `cleanupUnusedFavicons()`, `extractTitleFromDocument()`, `blobToBase64()`, `testFaviconUrl()` — extracted verbatim from `favicon.js` mixin, converted from `this.` to standalone functions

## Hooks

Thin wrappers that compose signals + utils + sync-queue. Each hook returns action functions.

- `use-bookmarks.js`: `addBookmark()`, `updateBookmark()`, `deleteBookmark()`, `duplicateBookmark()`, `reorderBookmarks()`, `loadBookmarks()` — reads/writes `bookmarks` signal, calls `persistBookmarks()`, calls `enqueueSync()`
- `use-folders.js`: `createFolder()`, `renameFolder()`, `deleteFolder()`, `moveBookmarkToFolder()`, `removeBookmarkFromFolder()` — same pattern
- `use-settings.js`: `loadSettings()`, `saveSettings()`, `updateTilesPerRowCSS()` — reads/writes `settings` signal
- `use-favicons.js`: `useFaviconPicker(urlSignal)` — debounced favicon loading, returns `{ faviconUrls, selectedFavicon, selectFavicon, isLoading }` — shared between AddBookmarkModal, EditBookmarkModal, and Popup
- `use-drag-and-drop.js`: returns drag event handlers for bookmark tiles, folder tiles, and external drops

## Components

Each component is a `.jsx` file. They read signals directly (Preact signals auto-subscribe on read) and call hook action functions for mutations.

**Key component patterns:**

`BookmarkTile.jsx` — receives a bookmark object as prop:

```jsx
function BookmarkTile({ bookmark }) {
  const { showTitles } = settings.value;
  // handlers: onClick → navigate, onContextMenu → show context menu, onDragStart/End, etc.
}
```

`ContextMenu.jsx` — reads `contextMenu` signal for position/visibility:

```jsx
function ContextMenu() {
  const { visible, x, y, type } = contextMenu.value;
  if (!visible) return null;
  // Render bookmark menu items or folder menu items based on type
}
```

`AddBookmarkModal.jsx` — uses `useFaviconPicker` hook:

```jsx
function AddBookmarkModal() {
  if (activeModal.value !== "addBookmark") return null;
  const [url, setUrl] = useState("");
  const { faviconUrls, selectedFavicon, selectFavicon } = useFaviconPicker(url);
  // ...
}
```

`FaviconPicker.jsx` — shared component used by AddBookmarkModal, EditBookmarkModal, and PopupApp:

```jsx
function FaviconPicker({ faviconUrls, selectedFavicon, onSelect, isLoading }) {
  // Renders the grid of favicon options with selection state
}
```

## Entry points

`newtab.jsx`:

```jsx
import { render } from "preact";
import { NewTabApp } from "./newtab-app.jsx";
render(<NewTabApp />, document.getElementById("app"));
```

`newtab-app.jsx`:

```jsx
import { initStore } from "./state/storage-bridge.js";
import { useEffect } from "preact/hooks";

function NewTabApp() {
  useEffect(() => {
    initStore();
    // Trigger background sync pull
    chrome.runtime.sendMessage({ type: "pull_changes" }).catch(() => {});
  }, []);

  return (
    <>
      <Header />
      <main class="max-w-7xl mx-auto px-6 py-8">
        <BookmarkGrid />
      </main>
      <SettingsButton />
      <ContextMenu />
      <AddBookmarkModal />
      <EditBookmarkModal />
      <DeleteConfirm />
      <FolderModal />
      <CreateFolderModal />
      <RenameFolderModal />
      <SettingsModal />
      <ImportConfirmModal />
      <Notification />
    </>
  );
}
```

## Vite config changes

```js
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact(), tailwindcss(), copyStatic()],
  build: {
    rollupOptions: {
      input: {
        newtab: "src/newtab.jsx", // was: src/script.js
        popup: "src/popup.jsx", // was: src/popup.js
        background: "src/background.js",
        main: "src/tailwind.css",
      },
      // ... rest stays the same
    },
  },
});
```

## HTML changes

`newtab.html` becomes:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>QuiClick - New Tab</title>
    <link rel="icon" type="image/svg+xml" href="icons/favicon.svg" />
    <link rel="stylesheet" href="main.css" />
  </head>
  <body class="bg-custom-bg min-h-screen text-custom-text">
    <div id="app"></div>
    <script type="module" src="newtab.js"></script>
  </body>
</html>
```

`popup.html` follows the same pattern.

## What stays unchanged

- `api.js` — pure API client, no DOM
- `sync-queue.js` — pure chrome.storage queue
- `background.js` — service worker, no UI
- `manifest.json` — entry points reference the same built filenames
- `tailwind.css` — all styles (glass morphism, tile styles, modal styles, etc.)

# Files to modify

| File                                              | Action  | Notes                                                                       |
| ------------------------------------------------- | ------- | --------------------------------------------------------------------------- |
| `extension/package.json`                          | Edit    | Add `preact`, `@preact/signals`, `@preact/preset-vite`                      |
| `extension/vite.config.js`                        | Edit    | Add preact plugin, update entry points from `.js` to `.jsx`                 |
| `extension/src/newtab.html`                       | Rewrite | Minimal shell: `<div id="app">` + script tag                                |
| `extension/src/popup.html`                        | Rewrite | Minimal shell: `<div id="app">` + script tag + popup-specific inline styles |
| `extension/src/newtab.jsx`                        | New     | Entry point: `render(<NewTabApp />)`                                        |
| `extension/src/newtab-app.jsx`                    | New     | Root component composing all sub-components                                 |
| `extension/src/popup.jsx`                         | New     | Entry point for popup                                                       |
| `extension/src/popup-app.jsx`                     | New     | Popup root component                                                        |
| `extension/src/state/store.js`                    | New     | All Preact signals                                                          |
| `extension/src/state/storage-bridge.js`           | New     | chrome.storage ↔ signal sync                                               |
| `extension/src/hooks/use-bookmarks.js`            | New     | Bookmark CRUD actions                                                       |
| `extension/src/hooks/use-folders.js`              | New     | Folder CRUD actions                                                         |
| `extension/src/hooks/use-settings.js`             | New     | Settings actions                                                            |
| `extension/src/hooks/use-favicons.js`             | New     | Favicon picker hook (debounced loading + selection)                         |
| `extension/src/hooks/use-drag-and-drop.js`        | New     | Drag/drop event handlers                                                    |
| `extension/src/utils/url.js`                      | New     | URL normalization/validation (extracted from script.js)                     |
| `extension/src/utils/favicon.js`                  | New     | Favicon fetch/cache logic (extracted from favicon.js mixin)                 |
| `extension/src/components/Header.jsx`             | New     | Header bar with logo + buttons                                              |
| `extension/src/components/BookmarkGrid.jsx`       | New     | Main grid layout                                                            |
| `extension/src/components/BookmarkTile.jsx`       | New     | Single bookmark tile                                                        |
| `extension/src/components/FolderTile.jsx`         | New     | Single folder tile                                                          |
| `extension/src/components/AddBookmarkTile.jsx`    | New     | "+" button tile                                                             |
| `extension/src/components/ContextMenu.jsx`        | New     | Right-click menu                                                            |
| `extension/src/components/AddBookmarkModal.jsx`   | New     | Add bookmark form + favicon picker                                          |
| `extension/src/components/EditBookmarkModal.jsx`  | New     | Edit bookmark form + favicon picker                                         |
| `extension/src/components/DeleteConfirm.jsx`      | New     | Delete confirmation popup                                                   |
| `extension/src/components/FolderModal.jsx`        | New     | Open folder overlay                                                         |
| `extension/src/components/CreateFolderModal.jsx`  | New     | Create folder form                                                          |
| `extension/src/components/RenameFolderModal.jsx`  | New     | Rename folder form                                                          |
| `extension/src/components/SettingsButton.jsx`     | New     | Floating settings gear                                                      |
| `extension/src/components/SettingsModal.jsx`      | New     | Settings panel                                                              |
| `extension/src/components/ImportConfirmModal.jsx` | New     | Import confirmation                                                         |
| `extension/src/components/Notification.jsx`       | New     | Reusable toast notification                                                 |
| `extension/src/components/FaviconPicker.jsx`      | New     | Shared favicon selection grid                                               |
| `extension/src/script.js`                         | Delete  | Replaced by newtab.jsx                                                      |
| `extension/src/bookmarks.js`                      | Delete  | Split into hooks + utils                                                    |
| `extension/src/folders.js`                        | Delete  | Split into hooks                                                            |
| `extension/src/ui.js`                             | Delete  | Split into components                                                       |
| `extension/src/settings.js`                       | Delete  | Split into hooks + component                                                |
| `extension/src/favicon.js`                        | Delete  | Split into utils/favicon.js + hooks/use-favicons.js                         |
| `extension/src/styles.css`                        | Delete  | Unused                                                                      |

# Verification, success criteria

1. **Install dependencies and build:**

   ```bash
   cd extension && bun install && just extension::build
   ```

   Build must succeed with no errors.

2. **Load extension in Chrome:**
   - Go to `chrome://extensions`, enable Developer mode
   - Load unpacked from `extension/dist/`
   - Open a new tab — the QuiClick page must render identically to the current version

3. **Functional verification (manual):**
   - New tab page renders bookmarks grid with glass morphism tiles
   - Click bookmark → navigates to URL
   - Middle-click → opens in background tab
   - Right-click → context menu appears (edit, duplicate, copy URL, delete)
   - Add bookmark → modal opens, favicon picker loads, bookmark appears in grid
   - Edit bookmark → modal opens near tile, can change title/URL/favicon
   - Delete bookmark → confirmation popup, bookmark removed
   - Drag reorder → bookmarks reorder with position indicator
   - Create/rename/delete folder → works correctly
   - Drag bookmark to folder → moves into folder
   - Open folder → modal shows folder contents
   - Settings → tiles per row, tile gap, show titles, show add button all work
   - Export/import data → JSON download and upload work
   - Auth → sign in/out flow works
   - Paste URL → opens add modal with pre-filled data
   - External drag-drop URL → opens add modal
   - Multiple tabs: change bookmark in one tab → other tabs update automatically
   - Background sync: if authenticated, new tab open triggers pull

4. **Popup verification:**
   - Click extension icon on any page → popup opens
   - Title and URL pre-filled from current tab
   - Favicon picker loads
   - Add bookmark → saved to storage, popup closes
   - Cancel → popup closes

5. **Bundle size check:**
   ```bash
   ls -la extension/dist/newtab.js extension/dist/popup.js extension/dist/background.js
   ```
   `newtab.js` and `popup.js` should be reasonably small (current `script.js` is ~X KB, new should be similar + ~5KB for preact+signals).

# Todo items

1. Install dependencies: `preact`, `@preact/signals`, `@preact/preset-vite`
2. Update `vite.config.js` — add preact plugin, change entry points
3. Create `src/utils/url.js` — extract URL utilities from script.js
4. Create `src/utils/favicon.js` — extract favicon logic from favicon.js mixin
5. Create `src/state/store.js` — define all Preact signals
6. Create `src/state/storage-bridge.js` — chrome.storage ↔ signal sync
7. Create `src/hooks/use-bookmarks.js` — bookmark CRUD
8. Create `src/hooks/use-folders.js` — folder CRUD
9. Create `src/hooks/use-settings.js` — settings management
10. Create `src/hooks/use-favicons.js` — favicon picker hook
11. Create `src/hooks/use-drag-and-drop.js` — drag/drop logic
12. Create shared component `src/components/FaviconPicker.jsx`
13. Create `src/components/Header.jsx`
14. Create `src/components/BookmarkTile.jsx`
15. Create `src/components/FolderTile.jsx`
16. Create `src/components/AddBookmarkTile.jsx`
17. Create `src/components/BookmarkGrid.jsx`
18. Create `src/components/ContextMenu.jsx`
19. Create `src/components/AddBookmarkModal.jsx`
20. Create `src/components/EditBookmarkModal.jsx`
21. Create `src/components/DeleteConfirm.jsx`
22. Create `src/components/FolderModal.jsx`
23. Create `src/components/CreateFolderModal.jsx`
24. Create `src/components/RenameFolderModal.jsx`
25. Create `src/components/SettingsButton.jsx`
26. Create `src/components/SettingsModal.jsx`
27. Create `src/components/ImportConfirmModal.jsx`
28. Create `src/components/Notification.jsx`
29. Create `src/newtab-app.jsx` — root component
30. Create `src/newtab.jsx` — entry point
31. Create `src/popup-app.jsx` — popup root component
32. Create `src/popup.jsx` — popup entry point
33. Rewrite `src/newtab.html` — minimal shell
34. Rewrite `src/popup.html` — minimal shell
35. Delete old files: `script.js`, `bookmarks.js`, `folders.js`, `ui.js`, `settings.js`, `favicon.js`, `styles.css`
36. Build and verify — `just extension::build`, load in Chrome, test all features
