import { settings, bookmarks, folders } from "../state/store.js";
import { persistSettings, persistBookmarks } from "../state/storage-bridge.js";
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
  const previous = settings.peek();
  settings.value = {
    ...previous,
    ...updates,
    lastUpdated: new Date().toISOString(),
  };
  await persistSettings();
  enqueueSync("update_settings", { settings: settings.peek() });

  // If tilesPerRow changed, reflow off-grid items
  if (
    updates.tilesPerRow !== undefined &&
    updates.tilesPerRow !== previous.tilesPerRow
  ) {
    await reflowPositions(updates.tilesPerRow);
  }
}

/**
 * Move items whose position[0] >= newTilesPerRow into valid cells.
 * Scans row-major for the first empty cell in the main grid.
 */
async function reflowPositions(newTilesPerRow) {
  const currentBookmarks = [...bookmarks.peek()];
  const currentFolders = [...folders.peek()];

  // Collect all root-level items
  const rootFolders = currentFolders;
  const rootBookmarks = currentBookmarks.filter((b) => !b.folderId);
  const allRoot = [...rootFolders, ...rootBookmarks];

  const offGrid = allRoot.filter(
    (i) => (i.position || [0, 0])[0] >= newTilesPerRow,
  );
  if (offGrid.length === 0) return;

  // Build occupied set (only in-bounds items)
  const occupied = new Set();
  for (const item of allRoot) {
    const [x, y] = item.position || [0, 0];
    if (x < newTilesPerRow) {
      occupied.add(`${x},${y}`);
    }
  }

  function findNextEmpty() {
    for (let y = 0; ; y++) {
      for (let x = 0; x < newTilesPerRow; x++) {
        if (!occupied.has(`${x},${y}`)) {
          occupied.add(`${x},${y}`);
          return [x, y];
        }
      }
    }
  }

  const reorderItems = [];
  for (const item of offGrid) {
    const newPos = findNextEmpty();
    item.position = newPos;
    item.lastUpdated = new Date().toISOString();
    reorderItems.push({ id: item.id, position: newPos });
  }

  // Write back
  const updatedBookmarks = currentBookmarks.map((b) => {
    const found = offGrid.find((o) => o.id === b.id);
    return found
      ? { ...b, position: found.position, lastUpdated: found.lastUpdated }
      : b;
  });
  const updatedFolders = currentFolders.map((f) => {
    const found = offGrid.find((o) => o.id === f.id);
    return found
      ? { ...f, position: found.position, lastUpdated: found.lastUpdated }
      : f;
  });

  bookmarks.value = updatedBookmarks;
  folders.value = updatedFolders;
  await persistBookmarks();

  if (reorderItems.length > 0) {
    enqueueSync("reorder", { items: reorderItems });
  }
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

// Pixel gap values corresponding to each tileGap setting level
// x gap: 0,16,32,48,64,80,96,112,128,144,160
// y gap: 0,8,16,24,32,40,48,56,64,72,80
const gapPxMapping = {
  0: { x: 0, y: 0 },
  1: { x: 16, y: 8 },
  2: { x: 32, y: 16 },
  3: { x: 48, y: 24 },
  4: { x: 64, y: 32 },
  5: { x: 80, y: 40 },
  6: { x: 96, y: 48 },
  7: { x: 112, y: 56 },
  8: { x: 128, y: 64 },
  9: { x: 144, y: 72 },
  10: { x: 160, y: 80 },
};

export function gapPxFromSetting(tileGap) {
  return gapPxMapping[tileGap] || { x: 16, y: 8 };
}

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
