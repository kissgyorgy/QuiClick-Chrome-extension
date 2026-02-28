import { useState } from "preact/hooks";
import {
  settings,
  activeModal,
  currentBookmarkId,
  contextMenu,
  dragState,
} from "../state/store.js";
import { useBookmarkDragHandlers } from "../hooks/use-drag-and-drop.js";

export function BookmarkTile({ bookmark }) {
  const { showTitles } = settings.value;
  const [faviconError, setFaviconError] = useState(false);
  const drag = useBookmarkDragHandlers(bookmark.id);

  const isDraggingThis =
    dragState.value.draggedBookmarkId === bookmark.id &&
    dragState.value.isDragging;

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

  return (
    <div
      class={`tile tile-3d tile-3d-bookmark w-24 h-24 relative rounded-lg cursor-pointer ${isDraggingThis ? "opacity-50" : ""}`}
      data-bookmark-id={bookmark.id}
      draggable={true}
      title={bookmark.title}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      onDragOver={drag.onDragOver}
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
          <span class="text-xs text-gray-800 text-center block truncate">
            {bookmark.title}
          </span>
        </div>
      )}
    </div>
  );
}
