// QuiClick Background Service Worker
// Sync engine: queue processor, delta pull, exponential backoff, auth, ID mapping.

import { api } from "./api.js";
import { enqueueSync } from "./sync-queue.js";

const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 30 * 60 * 1000; // 30 minutes
const RETRY_ALARM_NAME = "quiclick-sync-retry";

let isProcessing = false;

// ─── Startup ───────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log("QuiClick: extension installed/updated");
  init();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("QuiClick: browser startup");
  init();
});

// Also run init immediately for when the service worker wakes up
init();

async function init() {
  // Process any pending queue items (but don't pull — pull is triggered by new tab open)
  processQueue();
}

// ─── Message listener (new tab triggers pull) ──────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "pull_changes") {
    pullChanges()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => {
        console.warn("QuiClick: pull from new tab failed:", e.message);
        sendResponse({ ok: false, error: e.message });
      });
    return true; // keep message channel open for async response
  }
});

// ─── Storage change listener ───────────────────────────────────────────────

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  // Wake up and process queue when new items are added
  if (changes.syncQueue) {
    const newQueue = changes.syncQueue.newValue || [];
    const oldQueue = changes.syncQueue.oldValue || [];
    if (newQueue.length > oldQueue.length) {
      processQueue();
    }
  }

  // Handle auth actions from frontend
  if (changes.authAction) {
    const action = changes.authAction.newValue;
    if (action === "login_started") {
      handleLoginCheck();
    } else if (action === "logout") {
      handleLogout();
    }
  }
});

// ─── Alarm listener (backoff retry) ────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETRY_ALARM_NAME) {
    console.log("QuiClick: retry alarm fired");
    processQueue();
  }
});

// ─── Delta Pull ────────────────────────────────────────────────────────────

async function pullChanges({ force = false } = {}) {
  const storage = await chrome.storage.local.get([
    "lastPullDate",
    "authState",
    "bookmarks",
    "folders",
    "bookmarkSettings",
  ]);

  // Skip pull if user is not authenticated — no point hitting the server
  // (unless forced, e.g. during login polling)
  if (!force && !storage.authState?.authenticated) {
    return;
  }

  const ifModifiedSince = storage.lastPullDate || null;

  let result;
  try {
    result = await api.getChanges(ifModifiedSince);
  } catch (e) {
    // Network error — keep existing authState, skip pull
    console.warn("QuiClick: pull failed (network):", e.message);
    return;
  }

  if (result.status === 401) {
    await chrome.storage.local.set({
      authState: {
        authenticated: false,
        user: null,
        lastChecked: Date.now(),
      },
    });
    return;
  }

  if (result.status === 304) {
    // Still authenticated, no data changes
    const existing = storage.authState || {};
    await chrome.storage.local.set({
      authState: {
        authenticated: true,
        user: existing.user || null,
        lastChecked: Date.now(),
      },
    });
    return;
  }

  // status === 200
  const data = result.data;

  // Update auth state
  await chrome.storage.local.set({
    authState: {
      authenticated: true,
      user: data.user,
      lastChecked: Date.now(),
    },
  });

  // Apply changes to local storage
  let localBookmarks = storage.bookmarks || [];
  let localFolders = storage.folders || [];
  let localSettings = storage.bookmarkSettings || null;

  // Apply bookmark changes
  for (const serverBm of data.bookmarks) {
    const localIdx = localBookmarks.findIndex((b) => b.id === serverBm.id);
    const serverTs = serverBm.last_updated || serverBm.date_added;

    if (localIdx === -1) {
      // New item from server
      localBookmarks.push(serverBookmarkToLocal(serverBm));
    } else {
      const localTs = localBookmarks[localIdx].lastUpdated;
      if (!localTs || serverTs > localTs) {
        // Server is newer — overwrite
        localBookmarks[localIdx] = serverBookmarkToLocal(serverBm);
      }
      // else: local is newer, keep local
    }
  }

  // Apply folder changes
  for (const serverFolder of data.folders) {
    const localIdx = localFolders.findIndex((f) => f.id === serverFolder.id);
    const serverTs = serverFolder.last_updated || serverFolder.date_added;

    if (localIdx === -1) {
      localFolders.push(serverFolderToLocal(serverFolder));
    } else {
      const localTs = localFolders[localIdx].lastUpdated;
      if (!localTs || serverTs > localTs) {
        localFolders[localIdx] = serverFolderToLocal(serverFolder);
      }
    }
  }

  // Apply settings changes
  if (data.settings) {
    const serverSettingsTs = data.settings.last_updated;
    const localSettingsTs = localSettings?.lastUpdated;
    if (!localSettingsTs || serverSettingsTs > localSettingsTs) {
      localSettings = {
        showTitles: data.settings.show_titles,
        tilesPerRow: data.settings.tiles_per_row,
        tileGap: data.settings.tile_gap,
        showAddButton: data.settings.show_add_button,
        lastUpdated: serverSettingsTs,
      };
    }
  }

  // Remove deleted items
  if (data.deleted_ids && data.deleted_ids.length > 0) {
    const deletedSet = new Set(data.deleted_ids);
    localBookmarks = localBookmarks.filter((b) => !deletedSet.has(b.id));
    localFolders = localFolders.filter((f) => !deletedSet.has(f.id));
  }

  // Sort by position
  localBookmarks.sort((a, b) => (a.position || 0) - (b.position || 0));
  localFolders.sort((a, b) => (a.position || 0) - (b.position || 0));

  // Write back
  const updates = {
    bookmarks: localBookmarks,
    folders: localFolders,
  };
  if (localSettings) {
    updates.bookmarkSettings = localSettings;
  }
  if (result.lastModified) {
    updates.lastPullDate = result.lastModified;
  }
  await chrome.storage.local.set(updates);

  console.log(
    `QuiClick: pull complete — ${data.bookmarks.length} bookmarks, ` +
      `${data.folders.length} folders, ${(data.deleted_ids || []).length} deleted`,
  );
}

// ─── Queue Processing ──────────────────────────────────────────────────────

async function processQueue() {
  if (isProcessing) return;

  // Only process if authenticated
  const { authState } = await chrome.storage.local.get("authState");
  if (!authState?.authenticated) {
    return;
  }

  isProcessing = true;
  try {
    while (true) {
      const { syncQueue } = await chrome.storage.local.get("syncQueue");
      const queue = syncQueue || [];
      if (queue.length === 0) break;

      const item = queue[0];
      try {
        await processQueueItem(item);

        // Success — remove from queue and reset backoff
        queue.shift();
        await chrome.storage.local.set({ syncQueue: queue });
        await resetBackoff();
      } catch (e) {
        if (isRetryableError(e)) {
          console.warn(
            "QuiClick: retryable error processing queue item:",
            e.message,
          );
          await incrementBackoff();
          return; // Stop processing, alarm will retry
        } else {
          // Non-retryable (4xx) — skip this item
          console.error(
            "QuiClick: skipping non-retryable queue item:",
            item.type,
            e.message,
          );
          queue.shift();
          await chrome.storage.local.set({ syncQueue: queue });
        }
      }
    }
  } finally {
    isProcessing = false;
  }
}

async function processQueueItem(item) {
  switch (item.type) {
    case "create_bookmark":
      return await processCreateBookmark(item);
    case "update_bookmark":
      return await processUpdateBookmark(item);
    case "delete_bookmark":
      return await processDeleteBookmark(item);
    case "create_folder":
      return await processCreateFolder(item);
    case "update_folder":
      return await processUpdateFolder(item);
    case "delete_folder":
      return await processDeleteFolder(item);
    case "reorder":
      return await processReorder(item);
    case "update_settings":
      return await processUpdateSettings(item);
    case "full_push":
      return await processFullPush(item);
    default:
      console.warn("QuiClick: unknown queue item type:", item.type);
  }
}

async function processCreateBookmark(item) {
  const { localId, title, url, favicon, folderId, position } = item.payload;
  const serverBm = await api.createBookmark({
    title,
    url,
    favicon,
    folderId,
    position,
  });

  // Update local ID with server-assigned ID
  if (localId && serverBm.id !== localId) {
    await updateLocalId("bookmarks", localId, serverBm.id);
    await rewriteQueueReferences(localId, serverBm.id);
    await updateIdMap(localId, serverBm.id);
  }
}

async function processUpdateBookmark(item) {
  const { id, updates } = item.payload;
  const resolvedId = await resolveId(id);
  await api.updateBookmark(resolvedId, updates);
}

async function processDeleteBookmark(item) {
  const resolvedId = await resolveId(item.payload.id);
  try {
    await api.deleteBookmark(resolvedId);
  } catch (e) {
    // If 404, it's already deleted — that's fine
    if (e.message && e.message.includes("404")) return;
    throw e;
  }
}

async function processCreateFolder(item) {
  const { localId, name, position } = item.payload;
  const serverFolder = await api.createFolder({ name, position });

  if (localId && serverFolder.id !== localId) {
    await updateLocalId("folders", localId, serverFolder.id);
    // Also update bookmarks that reference this folder
    await updateFolderReferences(localId, serverFolder.id);
    await rewriteQueueReferences(localId, serverFolder.id);
    await updateIdMap(localId, serverFolder.id);
  }
}

async function processUpdateFolder(item) {
  const { id, updates } = item.payload;
  const resolvedId = await resolveId(id);
  await api.updateFolder(resolvedId, updates);
}

async function processDeleteFolder(item) {
  const resolvedId = await resolveId(item.payload.id);
  try {
    await api.deleteFolder(resolvedId);
  } catch (e) {
    if (e.message && e.message.includes("404")) return;
    throw e;
  }
}

async function processReorder(item) {
  const resolvedItems = [];
  for (const entry of item.payload.items) {
    const resolvedId = await resolveId(entry.id);
    resolvedItems.push({ id: resolvedId, position: entry.position });
  }
  await api.reorderItems(resolvedItems);
}

async function processUpdateSettings(item) {
  await api.patchSettings(item.payload.settings);
}

async function processFullPush(item) {
  const data = await chrome.storage.local.get([
    "bookmarks",
    "folders",
    "bookmarkSettings",
  ]);

  const exportData = buildExportData(data);
  await api.importData(exportData);

  // After full push, do a pull to get server-assigned IDs and timestamps
  await pullChanges();
}

// ─── ID Mapping ────────────────────────────────────────────────────────────

async function resolveId(id) {
  if (typeof id === "number") return id;
  // Check idMap for local-to-server mapping
  const { idMap } = await chrome.storage.local.get("idMap");
  if (idMap && idMap[id] !== undefined) {
    return idMap[id];
  }
  // Try parsing as number
  const num = parseInt(id, 10);
  return isNaN(num) ? id : num;
}

async function updateLocalId(storageKey, localId, serverId) {
  const data = await chrome.storage.local.get(storageKey);
  const items = data[storageKey] || [];
  const idx = items.findIndex(
    (item) => item.id === localId || item.id === String(localId),
  );
  if (idx !== -1) {
    items[idx].id = serverId;
    await chrome.storage.local.set({ [storageKey]: items });
  }
}

async function updateFolderReferences(oldFolderId, newFolderId) {
  const { bookmarks } = await chrome.storage.local.get("bookmarks");
  if (!bookmarks) return;

  let changed = false;
  for (const bm of bookmarks) {
    if (bm.folderId === oldFolderId || bm.folderId === String(oldFolderId)) {
      bm.folderId = newFolderId;
      changed = true;
    }
  }
  if (changed) {
    await chrome.storage.local.set({ bookmarks });
  }
}

async function rewriteQueueReferences(oldId, newId) {
  const { syncQueue } = await chrome.storage.local.get("syncQueue");
  if (!syncQueue || syncQueue.length === 0) return;

  let changed = false;
  for (const item of syncQueue) {
    const p = item.payload;
    // Replace direct id references
    if (p.id === oldId || p.id === String(oldId)) {
      p.id = newId;
      changed = true;
    }
    if (p.localId === oldId || p.localId === String(oldId)) {
      p.localId = newId;
      changed = true;
    }
    // Replace folderId references
    if (p.folderId === oldId || p.folderId === String(oldId)) {
      p.folderId = newId;
      changed = true;
    }
    // Replace in reorder items array
    if (p.items && Array.isArray(p.items)) {
      for (const entry of p.items) {
        if (entry.id === oldId || entry.id === String(oldId)) {
          entry.id = newId;
          changed = true;
        }
      }
    }
    // Replace in updates.folderId
    if (
      p.updates &&
      (p.updates.folderId === oldId || p.updates.folderId === String(oldId))
    ) {
      p.updates.folderId = newId;
      changed = true;
    }
  }
  if (changed) {
    await chrome.storage.local.set({ syncQueue });
  }
}

async function updateIdMap(localId, serverId) {
  const { idMap } = await chrome.storage.local.get("idMap");
  const map = idMap || {};
  map[localId] = serverId;
  await chrome.storage.local.set({ idMap: map });
}

// ─── Backoff ───────────────────────────────────────────────────────────────

async function incrementBackoff() {
  const { syncBackoff } = await chrome.storage.local.get("syncBackoff");
  const backoff = syncBackoff || { retryCount: 0, nextRetryAt: null };
  backoff.retryCount += 1;
  const delayMs = Math.min(
    BACKOFF_BASE_MS * Math.pow(2, backoff.retryCount),
    BACKOFF_CAP_MS,
  );
  backoff.nextRetryAt = Date.now() + delayMs;
  await chrome.storage.local.set({ syncBackoff: backoff });

  // Set alarm for retry
  await chrome.alarms.create(RETRY_ALARM_NAME, {
    delayInMinutes: delayMs / 60000,
  });
  console.log(
    `QuiClick: backoff retry #${backoff.retryCount} in ${Math.round(delayMs / 1000)}s`,
  );
}

async function resetBackoff() {
  await chrome.storage.local.set({
    syncBackoff: { retryCount: 0, nextRetryAt: null },
  });
  await chrome.alarms.clear(RETRY_ALARM_NAME);
}

function isRetryableError(e) {
  const msg = e.message || "";
  // Network errors and 5xx are retryable
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError"))
    return true;
  // 5xx server errors
  const statusMatch = msg.match(/failed: (\d+)/);
  if (statusMatch) {
    const status = parseInt(statusMatch[1], 10);
    return status >= 500;
  }
  return false;
}

// ─── Auth Actions ──────────────────────────────────────────────────────────

async function handleLoginCheck() {
  // After user clicks login, poll for auth status
  let attempts = 0;
  const maxAttempts = 60; // 60 seconds
  const interval = setInterval(async () => {
    attempts++;
    try {
      await pullChanges({ force: true });
      const { authState } = await chrome.storage.local.get("authState");
      if (authState?.authenticated) {
        clearInterval(interval);
        await chrome.storage.local.set({ authAction: null });
        // Process any pending queue items
        processQueue();
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        await chrome.storage.local.set({ authAction: null });
      }
    } catch (e) {
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        await chrome.storage.local.set({ authAction: null });
      }
    }
  }, 1000);
}

async function handleLogout() {
  try {
    await api.logout();
  } catch (e) {
    // Ignore errors
  }
  await chrome.storage.local.set({
    authState: { authenticated: false, user: null, lastChecked: Date.now() },
    authAction: null,
  });
}

// ─── Data Conversion Helpers ───────────────────────────────────────────────

function serverBookmarkToLocal(serverBm) {
  return {
    id: serverBm.id,
    title: serverBm.title,
    url: serverBm.url,
    favicon: serverBm.favicon || "",
    dateAdded: serverBm.date_added,
    folderId: serverBm.parent_id,
    position: serverBm.position,
    lastUpdated: serverBm.last_updated || serverBm.date_added,
  };
}

function serverFolderToLocal(serverFolder) {
  return {
    id: serverFolder.id,
    name: serverFolder.title,
    dateCreated: serverFolder.date_added,
    position: serverFolder.position,
    lastUpdated: serverFolder.last_updated || serverFolder.date_added,
  };
}

function buildExportData(storageData) {
  const bookmarks = (storageData.bookmarks || []).map((b) => ({
    id: typeof b.id === "number" ? b.id : undefined,
    title: b.title,
    url: b.url,
    favicon: b.favicon || null,
    date_added: b.dateAdded || new Date().toISOString(),
    parent_id: b.folderId || null,
    position: b.position || 0,
  }));

  const folders = (storageData.folders || []).map((f) => ({
    id: typeof f.id === "number" ? f.id : undefined,
    title: f.name,
    date_added: f.dateCreated || new Date().toISOString(),
    parent_id: null,
    position: f.position || 0,
  }));

  const settings = storageData.bookmarkSettings
    ? {
        show_titles: storageData.bookmarkSettings.showTitles ?? true,
        tiles_per_row: storageData.bookmarkSettings.tilesPerRow ?? 8,
        tile_gap: storageData.bookmarkSettings.tileGap ?? 1,
        show_add_button: storageData.bookmarkSettings.showAddButton ?? true,
      }
    : null;

  return {
    bookmarks,
    folders,
    settings,
    export_date: new Date().toISOString(),
    version: 1,
  };
}

console.log("QuiClick: background service worker loaded");
