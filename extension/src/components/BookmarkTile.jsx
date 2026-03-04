import { useState } from "preact/hooks";
import {
  settings,
  activeModal,
  currentBookmarkId,
  contextMenu,
  dragState,
} from "../state/store.js";
import { useBookmarkDragHandlers } from "../hooks/use-drag-and-drop.js";

export function BookmarkTile({ bookmark, gridX, gridY }) {
  const { showTitles } = settings.value;
  const [faviconError, setFaviconError] = useState(false);
  const drag = useBookmarkDragHandlers(bookmark.id, gridX, gridY);

  const isDraggingThis =
    dragState.value.draggedBookmarkId === bookmark.id &&
    dragState.value.isDragging;

  const dropTarget = dragState.value.dropTarget;
  const isInsertTarget =
    dropTarget?.type === "insert" &&
    dropTarget.x === (gridX ?? (bookmark.position || [0, 0])[0]) &&
    dropTarget.y === (gridY ?? (bookmark.position || [0, 0])[1]);
  const insertSide = isInsertTarget ? dropTarget.side : null;

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

  const paddingClass = showTitles ? "pt-2 px-4 pb-6" : "p-4";
  const x = gridX ?? (bookmark.position || [0, 0])[0];
  const y = gridY ?? (bookmark.position || [0, 0])[1];

  return (
    <div
      class={`tile tile-3d tile-3d-bookmark w-24 h-24 relative rounded-lg cursor-pointer ${isDraggingThis ? "opacity-50" : ""}`}
      style={{ gridColumn: x + 1, gridRow: y + 1 }}
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
