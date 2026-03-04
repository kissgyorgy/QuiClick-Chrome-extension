import { useState } from "preact/hooks";
import {
  settings,
  activeModal,
  currentFolderId,
  openFolderId,
  contextMenu,
  dragState,
} from "../state/store.js";
import { useFolderDragHandlers } from "../hooks/use-drag-and-drop.js";

export function FolderTile({ folder, gridX, gridY }) {
  const { showTitles } = settings.value;
  const [dropHover, setDropHover] = useState(false);
  const drag = useFolderDragHandlers(folder.id, gridX, gridY);

  const isDraggingThis =
    dragState.value.draggedFolderId === folder.id && dragState.value.isDragging;

  const dropTarget = dragState.value.dropTarget;
  const x = gridX ?? (folder.position || [0, 0])[0];
  const y = gridY ?? (folder.position || [0, 0])[1];
  const isInsertTarget =
    dropTarget?.type === "insert" && dropTarget.x === x && dropTarget.y === y;
  const insertSide = isInsertTarget ? dropTarget.side : null;

  // Show the amber "move into folder" highlight only for bookmark drags
  const isBookmarkHovering =
    dragState.value.isDragging &&
    !!dragState.value.draggedBookmarkId &&
    dropHover;

  function handleClick(e) {
    if (dragState.peek().isDragging) return;
    e.preventDefault();
    openFolderId.value = folder.id;
    activeModal.value = "folder";
  }

  function handleContextMenu(e) {
    e.preventDefault();
    currentFolderId.value = folder.id;
    contextMenu.value = {
      visible: true,
      x: e.pageX,
      y: e.pageY,
      type: "folder",
    };
  }

  function handleDragOver(e) {
    drag.onDragOver(e);
    if (dragState.peek().draggedBookmarkId) {
      setDropHover(true);
    }
  }

  function handleDragLeave(e) {
    setDropHover(false);
    drag.onDragLeave(e);
  }

  function handleDrop(e) {
    setDropHover(false);
    drag.onDrop(e);
  }

  const paddingClass = showTitles ? "pt-2 px-4 pb-6" : "p-4";

  return (
    <div
      class={`tile tile-3d tile-3d-folder w-24 h-24 relative rounded-lg cursor-pointer ${isDraggingThis ? "opacity-50" : ""} ${isBookmarkHovering ? "bg-amber-200 border-amber-400" : ""}`}
      style={{ gridColumn: x + 1, gridRow: y + 1 }}
      data-folder-id={folder.id}
      draggable={true}
      title={folder.name}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        class={`tile-icon absolute inset-0 flex items-center justify-center ${paddingClass}`}
      >
        <div class="w-full h-full bg-amber-500 rounded-lg flex items-center justify-center text-white">
          <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
        </div>
      </div>
      {showTitles && (
        <div class="tile-title absolute bottom-1 left-1 right-1">
          <span class="text-xs text-custom-text text-center block truncate">
            {folder.name}
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
