import { settings } from "../state/store.js";
import { persistSettings } from "../state/storage-bridge.js";
import { enqueueSync } from "../sync-queue.js";

export async function loadSettings() {
  try {
    const data = await chrome.storage.local.get(["bookmarkSettings"]);
    if (data.bookmarkSettings) {
      settings.value = { ...settings.peek(), ...data.bookmarkSettings };
    }
  } catch (error) {
    console.warn("Failed to load settings:", error);
  }
}

export async function saveSettings(updates) {
  settings.value = {
    ...settings.peek(),
    ...updates,
    lastUpdated: new Date().toISOString(),
  };
  await persistSettings();
  enqueueSync("update_settings", { settings: settings.peek() });
}

// Map tiles per row to Tailwind grid/gap classes
const gridClasses = {
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
  7: "grid-cols-7",
  8: "grid-cols-8",
  9: "grid-cols-9",
  10: "grid-cols-10",
  11: "grid-cols-11",
  12: "grid-cols-12",
};

const maxWidthClasses = {
  3: "max-w-sm",
  4: "max-w-md",
  5: "max-w-xl",
  6: "max-w-2xl",
  7: "max-w-3xl",
  8: "max-w-4xl",
  9: "max-w-5xl",
  10: "max-w-6xl",
  11: "max-w-7xl",
  12: "max-w-7xl",
};

const gapMapping = {
  0: { x: "gap-x-0", y: "gap-y-0" },
  1: { x: "gap-x-4", y: "gap-y-2" },
  2: { x: "gap-x-8", y: "gap-y-4" },
  3: { x: "gap-x-12", y: "gap-y-6" },
  4: { x: "gap-x-16", y: "gap-y-8" },
  5: { x: "gap-x-20", y: "gap-y-10" },
  6: { x: "gap-x-24", y: "gap-y-12" },
  7: { x: "gap-x-28", y: "gap-y-14" },
  8: { x: "gap-x-32", y: "gap-y-16" },
  9: { x: "gap-x-36", y: "gap-y-18" },
  10: { x: "gap-x-40", y: "gap-y-20" },
};

export function getGridClasses(tilesPerRow, tileGap) {
  const gridClass = gridClasses[tilesPerRow] || "grid-cols-8";
  const maxWidthClass = maxWidthClasses[tilesPerRow] || "max-w-4xl";
  const gaps = gapMapping[tileGap] || { x: "gap-x-4", y: "gap-y-2" };

  return [
    "grid",
    gridClass,
    gaps.x,
    gaps.y,
    maxWidthClass,
    "mx-auto",
    "place-items-center",
  ].join(" ");
}

export async function exportAllData(allBookmarks, allFolders, allSettings) {
  const data = {
    bookmarks: allBookmarks,
    folders: allFolders,
    settings: allSettings,
    exportDate: new Date().toISOString(),
    version: "1.0",
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `quiclick-bookmarks-export-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function validateImportData(data) {
  if (!data || typeof data !== "object") return false;

  if (data.bookmarks && !Array.isArray(data.bookmarks)) return false;
  if (data.bookmarks) {
    for (const bookmark of data.bookmarks) {
      if (!bookmark.id || !bookmark.title || !bookmark.url) return false;
    }
  }

  if (data.folders && !Array.isArray(data.folders)) return false;
  if (data.folders) {
    for (const folder of data.folders) {
      if (!folder.id || !folder.name) return false;
    }
  }

  if (data.settings && typeof data.settings !== "object") return false;

  return true;
}
