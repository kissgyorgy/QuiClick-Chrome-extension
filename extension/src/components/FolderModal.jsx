import { useState } from "preact/hooks";
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
import { getGridClasses } from "../hooks/use-settings.js";
import { useFolderModalDropHandlers } from "../hooks/use-drag-and-drop.js";
import { useBookmarkDragHandlers } from "../hooks/use-drag-and-drop.js";

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
  const { showTitles, tilesPerRow, tileGap } = settings.value;
  const folderBookmarks = bookmarks.value.filter(
    (b) => b.folderId === folderId,
  );
  const gridClass = getGridClasses(tilesPerRow, tileGap);

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

  return (
    <div
      class={`modal-backdrop fixed inset-0 flex items-start justify-center pt-16 pb-32 z-50 ${dropHover ? "bg-blue-100/20" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      onDragOver={handleBackdropDragOver}
      onDragLeave={handleBackdropDragLeave}
      onDrop={handleBackdropDrop}
    >
      {dropHover && (
        <div class="fixed inset-0 pointer-events-none flex items-center justify-center z-50">
          <div class="bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg text-lg font-semibold">
            Drop here to remove from folder
          </div>
        </div>
      )}
      <div class="modal-content rounded-xl w-auto max-w-6xl min-w-[800px] mx-4 h-[50vh] overflow-hidden flex flex-col">
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
        <div class="p-8 overflow-y-auto flex-1">
          {folderBookmarks.length === 0 ? (
            <div class="text-center text-gray-500 w-full py-8">
              <svg
                class="w-16 h-16 mx-auto mb-4 text-gray-300"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              <p class="text-lg font-medium">This folder is empty</p>
              <p class="text-sm">Drag bookmarks here to organize them</p>
            </div>
          ) : (
            <div id="folderBookmarks" class={gridClass}>
              {folderBookmarks.map((bookmark) => (
                <FolderBookmarkTile
                  key={bookmark.id}
                  bookmark={bookmark}
                  showTitles={showTitles}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FolderBookmarkTile({ bookmark, showTitles }) {
  const drag = useBookmarkDragHandlers(bookmark.id);
  const [faviconError, setFaviconError] = useState(false);
  const isDraggingThis =
    dragState.value.draggedBookmarkId === bookmark.id &&
    dragState.value.isDragging;

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
      class={`tile w-24 h-24 relative bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-200 hover:shadow-md transition-all duration-200 cursor-pointer ${isDraggingThis ? "opacity-50" : ""}`}
      data-bookmark-id={bookmark.id}
      draggable={true}
      title={bookmark.title}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
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
          <span class="text-xs text-gray-800 text-center block truncate">
            {bookmark.title}
          </span>
        </div>
      )}
    </div>
  );
}
