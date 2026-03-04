import { bookmarks, folders, settings, dragState } from "../state/store.js";
import { persistBookmarks } from "../state/storage-bridge.js";
import { enqueueSync } from "../sync-queue.js";
import {
  moveBookmarkToFolder,
  removeBookmarkFromFolder,
} from "./use-folders.js";

// ─── helpers ───────────────────────────────────────────────────────────────

/** Return the id of whichever item (bookmark or folder) is being dragged. */
function draggedItemId() {
  const s = dragState.peek();
  return s.draggedBookmarkId ?? s.draggedFolderId ?? null;
}

/** True when *something* is being dragged (bookmark or folder). */
function isDraggingAny() {
  const s = dragState.peek();
  return s.isDragging && (!!s.draggedBookmarkId || !!s.draggedFolderId);
}

function resetDragState() {
  dragState.value = {
    isDragging: false,
    draggedBookmarkId: null,
    draggedFolderId: null,
    dropTarget: null,
  };
}

// ─── insertAndPush algorithm ───────────────────────────────────────────────
//
// Moves draggedId to (targetX, targetY). If that cell is occupied, pushes
// the chain of consecutive items right (with row-wrap) until an empty cell.
// Returns the list of all items that changed position (including draggedItem).

function insertAndPush(allRootItems, draggedId, targetX, targetY, tilesPerRow) {
  const dragged = allRootItems.find((item) => item.id === draggedId);
  if (!dragged) return [];

  const rest = allRootItems.filter((item) => item.id !== draggedId);

  // Build position map for non-dragged items
  const posMap = new Map();
  for (const item of rest) {
    const [x, y] = item.position || [0, 0];
    posMap.set(`${x},${y}`, item);
  }

  const affected = [];

  // Collect consecutive occupied cells starting at target, push right
  let checkX = targetX;
  let checkY = targetY;
  const toShift = [];
  while (posMap.has(`${checkX},${checkY}`)) {
    toShift.push(posMap.get(`${checkX},${checkY}`));
    let nx = checkX + 1;
    let ny = checkY;
    if (nx >= tilesPerRow) {
      nx = 0;
      ny++;
    }
    checkX = nx;
    checkY = ny;
  }

  // Shift each item right by one cell (in reverse order to avoid overwriting)
  for (let i = toShift.length - 1; i >= 0; i--) {
    const item = toShift[i];
    const [x, y] = item.position || [0, 0];
    let nx = x + 1;
    let ny = y;
    if (nx >= tilesPerRow) {
      nx = 0;
      ny++;
    }
    item.position = [nx, ny];
    item.lastUpdated = new Date().toISOString();
    affected.push(item);
  }

  // Place dragged item at target
  dragged.position = [targetX, targetY];
  dragged.lastUpdated = new Date().toISOString();
  affected.push(dragged);

  return affected;
}

// Apply insertAndPush to root-level bookmarks + folders, persist, and sync.
async function applyInsertAndPush(itemId, targetX, targetY) {
  const tilesPerRow = settings.peek().tilesPerRow;
  const currentBookmarks = [...bookmarks.peek()];
  const currentFolders = [...folders.peek()];

  // Combine all root-level items (folders + bookmarks without folderId)
  const rootBookmarks = currentBookmarks.filter((b) => !b.folderId);
  const allRootItems = [...currentFolders, ...rootBookmarks];

  const affected = insertAndPush(
    allRootItems,
    itemId,
    targetX,
    targetY,
    tilesPerRow,
  );

  if (affected.length === 0) return;

  // Propagate position changes back into the main arrays
  const updatedBookmarks = currentBookmarks.map((b) => {
    const found = affected.find((a) => a.id === b.id);
    return found
      ? { ...b, position: found.position, lastUpdated: found.lastUpdated }
      : b;
  });

  const updatedFolders = currentFolders.map((f) => {
    const found = affected.find((a) => a.id === f.id);
    return found
      ? { ...f, position: found.position, lastUpdated: found.lastUpdated }
      : f;
  });

  bookmarks.value = updatedBookmarks;
  folders.value = updatedFolders;
  await persistBookmarks();

  // Sync: enqueue reorder for all affected items
  const reorderItems = affected.map((item) => ({
    id: item.id,
    position: item.position,
  }));
  enqueueSync("reorder", { items: reorderItems });
}

// ─── Shared insert-drop logic ──────────────────────────────────────────────

/** Compute the target (x,y) from the tile position, drop side, and tilesPerRow. */
function resolveInsertTarget(x, y, side, tilesPerRow) {
  if (side === "right") {
    let tx = x + 1;
    let ty = y;
    if (tx >= tilesPerRow) {
      tx = 0;
      ty++;
    }
    return [tx, ty];
  }
  return [x, y];
}

// ─── Bookmark drag handlers ────────────────────────────────────────────────

export function useBookmarkDragHandlers(bookmarkId, gridX, gridY) {
  function onDragStart(e) {
    dragState.value = {
      isDragging: true,
      draggedBookmarkId: bookmarkId,
      draggedFolderId: null,
      dropTarget: null,
    };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(bookmarkId));
  }

  function onDragEnd() {
    resetDragState();
  }

  function onDragOver(e) {
    const dragged = draggedItemId();
    if (!dragged || dragged === bookmarkId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const rect = e.currentTarget.getBoundingClientRect();
    const side = e.clientX < rect.left + rect.width / 2 ? "left" : "right";
    const x =
      gridX ??
      (bookmarks.peek().find((b) => b.id === bookmarkId)?.position || [
        0, 0,
      ])[0];
    const y =
      gridY ??
      (bookmarks.peek().find((b) => b.id === bookmarkId)?.position || [
        0, 0,
      ])[1];

    const current = dragState.peek();
    if (
      current.dropTarget?.type !== "insert" ||
      current.dropTarget.x !== x ||
      current.dropTarget.y !== y ||
      current.dropTarget.side !== side
    ) {
      dragState.value = {
        ...current,
        dropTarget: { type: "insert", x, y, side },
      };
    }
  }

  function onDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      const current = dragState.peek();
      if (current.dropTarget?.type === "insert") {
        dragState.value = { ...current, dropTarget: null };
      }
    }
  }

  function onDrop(e) {
    const dragged = draggedItemId();
    if (dragged && dragged !== bookmarkId) {
      e.preventDefault();

      const tilesPerRow = settings.peek().tilesPerRow;
      const x =
        gridX ??
        (bookmarks.peek().find((b) => b.id === bookmarkId)?.position || [
          0, 0,
        ])[0];
      const y =
        gridY ??
        (bookmarks.peek().find((b) => b.id === bookmarkId)?.position || [
          0, 0,
        ])[1];

      const { dropTarget } = dragState.peek();
      const side =
        dropTarget?.side ??
        (e.clientX <
        e.currentTarget.getBoundingClientRect().left +
          e.currentTarget.getBoundingClientRect().width / 2
          ? "left"
          : "right");

      const [tx, ty] = resolveInsertTarget(x, y, side, tilesPerRow);
      applyInsertAndPush(dragged, tx, ty);
    }

    resetDragState();
  }

  return { onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop };
}

// ─── Folder drag handlers ──────────────────────────────────────────────────

export function useFolderDragHandlers(folderId, gridX, gridY) {
  function onDragStart(e) {
    dragState.value = {
      isDragging: true,
      draggedBookmarkId: null,
      draggedFolderId: folderId,
      dropTarget: null,
    };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(folderId));
  }

  function onDragEnd() {
    resetDragState();
  }

  /** When something is dragged over this folder tile. */
  function onDragOver(e) {
    const state = dragState.peek();
    const dragged = draggedItemId();
    if (!dragged || dragged === folderId) return;

    // A bookmark being dragged over a folder → "move into folder" (no insert indicator)
    if (state.draggedBookmarkId) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      return;
    }

    // A folder being dragged over another folder → show insert indicator
    if (state.draggedFolderId) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      const rect = e.currentTarget.getBoundingClientRect();
      const side = e.clientX < rect.left + rect.width / 2 ? "left" : "right";
      const x =
        gridX ??
        (folders.peek().find((f) => f.id === folderId)?.position || [0, 0])[0];
      const y =
        gridY ??
        (folders.peek().find((f) => f.id === folderId)?.position || [0, 0])[1];

      const current = dragState.peek();
      if (
        current.dropTarget?.type !== "insert" ||
        current.dropTarget.x !== x ||
        current.dropTarget.y !== y ||
        current.dropTarget.side !== side
      ) {
        dragState.value = {
          ...current,
          dropTarget: { type: "insert", x, y, side },
        };
      }
    }
  }

  function onDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      const current = dragState.peek();
      if (current.dropTarget?.type === "insert") {
        dragState.value = { ...current, dropTarget: null };
      }
    }
  }

  function onDrop(e) {
    const state = dragState.peek();

    // Bookmark dropped on folder → move into folder
    if (state.draggedBookmarkId) {
      e.preventDefault();
      moveBookmarkToFolder(state.draggedBookmarkId, folderId);
      resetDragState();
      return;
    }

    // Folder dropped on folder → insert-and-push
    if (state.draggedFolderId && state.draggedFolderId !== folderId) {
      e.preventDefault();

      const tilesPerRow = settings.peek().tilesPerRow;
      const x =
        gridX ??
        (folders.peek().find((f) => f.id === folderId)?.position || [0, 0])[0];
      const y =
        gridY ??
        (folders.peek().find((f) => f.id === folderId)?.position || [0, 0])[1];

      const { dropTarget } = dragState.peek();
      const side =
        dropTarget?.side ??
        (e.clientX <
        e.currentTarget.getBoundingClientRect().left +
          e.currentTarget.getBoundingClientRect().width / 2
          ? "left"
          : "right");

      const [tx, ty] = resolveInsertTarget(x, y, side, tilesPerRow);
      applyInsertAndPush(state.draggedFolderId, tx, ty);
    }

    resetDragState();
  }

  return { onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop };
}

// ─── Empty cell drop handlers ──────────────────────────────────────────────

export function useEmptyCellDropHandlers(x, y) {
  function onDragOver(e) {
    if (isDraggingAny()) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      const current = dragState.peek();
      if (
        current.dropTarget?.type !== "empty" ||
        current.dropTarget.x !== x ||
        current.dropTarget.y !== y
      ) {
        dragState.value = { ...current, dropTarget: { type: "empty", x, y } };
      }
    }
  }

  function onDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      const current = dragState.peek();
      if (
        current.dropTarget?.type === "empty" &&
        current.dropTarget.x === x &&
        current.dropTarget.y === y
      ) {
        dragState.value = { ...current, dropTarget: null };
      }
    }
  }

  function onDrop(e) {
    const dragged = draggedItemId();
    if (dragged) {
      e.preventDefault();
      applyInsertAndPush(dragged, x, y);
    }
    resetDragState();
  }

  return { onDragOver, onDragLeave, onDrop };
}

// ─── In-folder insertAndPush ────────────────────────────────────────────────

async function applyInsertAndPushInFolder(
  draggedBookmarkId,
  targetX,
  targetY,
  folderId,
) {
  const tilesPerRow = settings.peek().tilesPerRow;
  const currentBookmarks = [...bookmarks.peek()];
  const folderItems = currentBookmarks.filter((b) => b.folderId === folderId);

  const affected = insertAndPush(
    folderItems,
    draggedBookmarkId,
    targetX,
    targetY,
    tilesPerRow,
  );

  if (affected.length === 0) return;

  const updatedBookmarks = currentBookmarks.map((b) => {
    const found = affected.find((a) => a.id === b.id);
    return found
      ? { ...b, position: found.position, lastUpdated: found.lastUpdated }
      : b;
  });

  bookmarks.value = updatedBookmarks;
  await persistBookmarks();

  const reorderItems = affected.map((item) => ({
    id: item.id,
    position: item.position,
  }));
  enqueueSync("reorder", { items: reorderItems });
}

// ─── In-folder bookmark drag handlers ──────────────────────────────────────

export function useInFolderDragHandlers(bookmarkId, gridX, gridY, folderId) {
  function onDragStart(e) {
    dragState.value = {
      isDragging: true,
      draggedBookmarkId: bookmarkId,
      draggedFolderId: null,
      dropTarget: null,
    };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(bookmarkId));
  }

  function onDragEnd() {
    resetDragState();
  }

  function onDragOver(e) {
    const { draggedBookmarkId } = dragState.peek();
    if (!draggedBookmarkId || draggedBookmarkId === bookmarkId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const rect = e.currentTarget.getBoundingClientRect();
    const side = e.clientX < rect.left + rect.width / 2 ? "left" : "right";

    const current = dragState.peek();
    if (
      current.dropTarget?.type !== "insert" ||
      current.dropTarget.x !== gridX ||
      current.dropTarget.y !== gridY ||
      current.dropTarget.side !== side
    ) {
      dragState.value = {
        ...current,
        dropTarget: { type: "insert", x: gridX, y: gridY, side },
      };
    }
  }

  function onDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      const current = dragState.peek();
      if (current.dropTarget?.type === "insert") {
        dragState.value = { ...current, dropTarget: null };
      }
    }
  }

  function onDrop(e) {
    const { draggedBookmarkId } = dragState.peek();
    if (draggedBookmarkId && draggedBookmarkId !== bookmarkId) {
      e.preventDefault();

      const tilesPerRow = settings.peek().tilesPerRow;
      const { dropTarget } = dragState.peek();
      const side =
        dropTarget?.side ??
        (e.clientX <
        e.currentTarget.getBoundingClientRect().left +
          e.currentTarget.getBoundingClientRect().width / 2
          ? "left"
          : "right");

      const [tx, ty] = resolveInsertTarget(gridX, gridY, side, tilesPerRow);
      applyInsertAndPushInFolder(draggedBookmarkId, tx, ty, folderId);
    }
    resetDragState();
  }

  return { onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop };
}

// ─── In-folder empty cell drop handlers ────────────────────────────────────

export function useInFolderEmptyCellDropHandlers(x, y, folderId) {
  function onDragOver(e) {
    const { draggedBookmarkId } = dragState.peek();
    if (draggedBookmarkId) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      const current = dragState.peek();
      if (
        current.dropTarget?.type !== "empty" ||
        current.dropTarget.x !== x ||
        current.dropTarget.y !== y
      ) {
        dragState.value = { ...current, dropTarget: { type: "empty", x, y } };
      }
    }
  }

  function onDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      const current = dragState.peek();
      if (
        current.dropTarget?.type === "empty" &&
        current.dropTarget.x === x &&
        current.dropTarget.y === y
      ) {
        dragState.value = { ...current, dropTarget: null };
      }
    }
  }

  function onDrop(e) {
    const { draggedBookmarkId } = dragState.peek();
    if (draggedBookmarkId) {
      e.preventDefault();
      applyInsertAndPushInFolder(draggedBookmarkId, x, y, folderId);
    }
    resetDragState();
  }

  return { onDragOver, onDragLeave, onDrop };
}

// ─── Folder modal backdrop drop handlers ──────────────────────────────────

export function useFolderModalDropHandlers(openFolderIdValue) {
  function onDragOver(e) {
    const { draggedBookmarkId } = dragState.peek();
    if (draggedBookmarkId && e.target === e.currentTarget) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }

  function onDrop(e) {
    const { draggedBookmarkId } = dragState.peek();
    if (draggedBookmarkId && e.target === e.currentTarget) {
      e.preventDefault();
      removeBookmarkFromFolder(draggedBookmarkId);
    }
    resetDragState();
  }

  return { onDragOver, onDrop };
}

// ─── External page-level drop handlers ───────────────────────────────────

export function useExternalDropHandlers(onExternalDrop) {
  let dragCounter = 0;

  function onDragEnter(e) {
    const { isDragging } = dragState.peek();
    if (!isDragging) {
      e.preventDefault();
      dragCounter++;
    }
  }

  function onDragLeave(e) {
    const { isDragging } = dragState.peek();
    if (!isDragging) {
      e.preventDefault();
      dragCounter--;
    }
  }

  function onDragOver(e) {
    e.preventDefault();
  }

  function onDrop(e) {
    const { isDragging } = dragState.peek();
    if (!isDragging) {
      e.preventDefault();
      dragCounter = 0;

      const url =
        e.dataTransfer.getData("text/uri-list") ||
        e.dataTransfer.getData("text/plain");

      let title = "";
      const htmlData = e.dataTransfer.getData("text/html");
      const plainText = e.dataTransfer.getData("text/plain");

      if (htmlData) {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = htmlData;
        const linkElement = tempDiv.querySelector("a");
        if (
          linkElement &&
          linkElement.textContent &&
          linkElement.textContent.trim() !== url &&
          !linkElement.textContent.trim().startsWith("http")
        ) {
          title = linkElement.textContent.trim();
        }
      }

      if (
        !title &&
        plainText &&
        plainText !== url &&
        !plainText.startsWith("http")
      ) {
        title = plainText.trim();
      }

      if (url) {
        onExternalDrop(url, title);
      }
    }
  }

  return {
    onDragEnter,
    onDragLeave,
    onDragOver,
    onDrop,
    getDragCounter: () => dragCounter,
  };
}
