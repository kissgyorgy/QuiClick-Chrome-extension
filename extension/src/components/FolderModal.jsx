import { useState, useRef, useEffect } from "preact/hooks";
import { ModalBackdrop } from "./Modal.jsx";
import {
  activeModal,
  bookmarks,
  folders,
  openFolderId,
  settings,
  currentBookmarkId,
  contextMenu,
  dragState,
} from "../state/store.js";
import {
  useFolderModalDropHandlers,
  useInFolderDragHandlers,
} from "../hooks/use-drag-and-drop.js";
import { gapPxFromSetting } from "../hooks/use-settings.js";
import { EmptyCell } from "./EmptyCell.jsx";

const TILE_SIZE = 96;

export function FolderModal() {
  const modal = activeModal.value;
  if (modal !== "folder") return null;

  const folderId = openFolderId.value;
  const folder = folders.value.find((f) => f.id === folderId);
  if (!folder) return null;

  return <FolderModalContent folder={folder} folderId={folderId} />;
}

function FolderModalContent({ folder, folderId }) {
  const [dropHover, setDropHover] = useState(false);
  const folderModalDrop = useFolderModalDropHandlers(folderId);
  const { showTitles, tilesPerRow, tileGap, showAddButton } = settings.value;
  const folderBookmarks = bookmarks.value.filter(
    (b) => b.folderId === folderId,
  );

  const scrollRef = useRef(null);
  const [visibleRows, setVisibleRows] = useState(4);

  // Build cell map for folder bookmarks
  const cellMap = new Map();
  for (const bm of folderBookmarks) {
    const [x, y] = bm.position || [0, 0];
    cellMap.set(`${x},${y}`, bm);
  }
  let maxRow = 0;
  for (const bm of folderBookmarks) {
    const y = (bm.position || [0, 0])[1];
    if (y > maxRow) maxRow = y;
  }
  const cols = tilesPerRow;
  const gapPx = gapPxFromSetting(tileGap);

  // Compute how many rows fill the scrollable area
  useEffect(() => {
    function update() {
      if (!scrollRef.current) return;
      const available = scrollRef.current.clientHeight - 32; // minus padding
      const rows = Math.max(2, Math.floor(available / (TILE_SIZE + gapPx.y)));
      setVisibleRows(rows);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [tileGap]);

  const totalRows = Math.max(maxRow + 2, visibleRows);

  function handleClose() {
    openFolderId.value = null;
    activeModal.value = null;
  }

  function handleBackdropDragOver(e) {
    if (dragState.peek().draggedBookmarkId && e.target === e.currentTarget) {
      e.preventDefault();
      setDropHover(true);
    }
  }

  function handleBackdropDragLeave(e) {
    if (e.target === e.currentTarget) setDropHover(false);
  }

  function handleBackdropDrop(e) {
    setDropHover(false);
    folderModalDrop.onDrop(e);
  }

  // Build cells with the same grid system as BookmarkGrid
  const cells = [];
  for (let y = 0; y < totalRows; y++) {
    for (let x = 0; x < cols; x++) {
      const key = `${x},${y}`;
      const bm = cellMap.get(key);
      if (bm) {
        cells.push(
          <FolderBookmarkTile
            key={bm.id}
            bookmark={bm}
            showTitles={showTitles}
            gridX={x}
            gridY={y}
            folderId={folderId}
          />,
        );
      } else {
        cells.push(
          <EmptyCell
            key={key}
            x={x}
            y={y}
            showAddButton={showAddButton}
            folderId={folderId}
          />,
        );
      }
    }
  }

  return (
    <ModalBackdrop
      onClose={handleClose}
      align="items-start justify-center"
      backdropClass={`pt-16 pb-32 ${dropHover ? "bg-blue-100/20" : ""}`}
      backdropProps={{
        onDragOver: handleBackdropDragOver,
        onDragLeave: handleBackdropDragLeave,
        onDrop: handleBackdropDrop,
      }}
    >
      {dropHover && (
        <div class="fixed inset-0 pointer-events-none flex items-center justify-center z-50">
          <div class="bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg text-lg font-semibold">
            Drop here to remove from folder
          </div>
        </div>
      )}
      <div class="modal-content rounded-xl w-auto max-w-6xl min-w-200 mx-4 h-half-screen overflow-hidden flex flex-col backdrop-blur-xl border border-white/80">
        <div class="relative border-b border-gray-200 px-8 py-6 bg-gradient-to-r from-amber-50 to-yellow-50">
          <h3 class="text-2xl font-bold text-gray-800 text-center">
            {folder.name}
          </h3>
          <button
            onClick={handleClose}
            class="absolute top-4 right-6 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer p-2 hover:bg-white hover:rounded-full"
          >
            <svg
              class="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div ref={scrollRef} class="p-8 overflow-y-auto flex-1">
          <div
            id="folderBookmarks"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, ${TILE_SIZE}px)`,
              columnGap: `${gapPx.x}px`,
              rowGap: `${gapPx.y}px`,
              justifyContent: "center",
            }}
          >
            {cells}
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
}

function FolderBookmarkTile({ bookmark, showTitles, gridX, gridY, folderId }) {
  const drag = useInFolderDragHandlers(bookmark.id, gridX, gridY, folderId);
  const [faviconError, setFaviconError] = useState(false);
  const isDraggingThis =
    dragState.value.draggedBookmarkId === bookmark.id &&
    dragState.value.isDragging;

  const dropTarget = dragState.value.dropTarget;
  const isInsertTarget =
    dropTarget?.type === "insert" &&
    dropTarget.x === gridX &&
    dropTarget.y === gridY;
  const insertSide = isInsertTarget ? dropTarget.side : null;

  const paddingClass = showTitles ? "pt-2 px-4 pb-6" : "p-4";

  function handleClick(e) {
    if (!dragState.peek().isDragging && e.button === 0) {
      window.location.href = bookmark.url;
    }
  }

  function handleMouseDown(e) {
    if (e.button === 1 && !dragState.peek().isDragging) {
      e.preventDefault();
      chrome.tabs.create({ url: bookmark.url, active: false });
    }
  }

  function handleContextMenu(e) {
    e.preventDefault();
    currentBookmarkId.value = bookmark.id;
    contextMenu.value = {
      visible: true,
      x: e.pageX,
      y: e.pageY,
      type: "bookmark",
    };
  }

  return (
    <div
      class={`tile tile-3d tile-3d-bookmark w-24 h-24 relative rounded-lg cursor-pointer ${isDraggingThis ? "opacity-50" : ""}`}
      style={{ gridColumn: gridX + 1, gridRow: gridY + 1 }}
      data-bookmark-id={bookmark.id}
      draggable={true}
      title={bookmark.title}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      onDragOver={drag.onDragOver}
      onDragLeave={drag.onDragLeave}
      onDrop={drag.onDrop}
    >
      <a
        draggable={false}
        href={bookmark.url}
        aria-label={bookmark.title}
        class="absolute inset-0"
        onClick={(e) => e.preventDefault()}
      />
      <div
        class={`tile-icon absolute inset-0 flex items-center justify-center ${paddingClass}`}
      >
        {bookmark.favicon && !faviconError ? (
          <img
            draggable={false}
            alt=""
            src={bookmark.favicon}
            class="w-full h-full rounded-lg object-cover bookmark-favicon"
            onError={() => setFaviconError(true)}
          />
        ) : (
          <div class="w-full h-full bg-blue-500 rounded-lg flex items-center justify-center text-white text-2xl font-bold bookmark-fallback">
            {bookmark.title.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      {showTitles && (
        <div class="tile-title absolute bottom-1 left-1 right-1">
          <span class="text-xs text-custom-text text-center block truncate">
            {bookmark.title}
          </span>
        </div>
      )}
      {insertSide === "left" && (
        <div class="absolute top-0 left-0 bottom-0 w-0.5 bg-sky-500 rounded-full z-10" />
      )}
      {insertSide === "right" && (
        <div class="absolute top-0 right-0 bottom-0 w-0.5 bg-sky-500 rounded-full z-10" />
      )}
    </div>
  );
}
