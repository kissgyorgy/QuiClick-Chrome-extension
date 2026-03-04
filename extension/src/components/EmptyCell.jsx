import {
  activeModal,
  addBookmarkPosition,
  addBookmarkFolderId,
  dragState,
} from "../state/store.js";
import {
  useEmptyCellDropHandlers,
  useInFolderEmptyCellDropHandlers,
} from "../hooks/use-drag-and-drop.js";

export function EmptyCell({ x, y, showAddButton, folderId }) {
  const drop = folderId
    ? useInFolderEmptyCellDropHandlers(x, y, folderId)
    : useEmptyCellDropHandlers(x, y);

  const isDropTarget =
    dragState.value.isDragging &&
    dragState.value.dropTarget?.type === "empty" &&
    dragState.value.dropTarget.x === x &&
    dragState.value.dropTarget.y === y;

  function handleClick() {
    addBookmarkPosition.value = [x, y];
    addBookmarkFolderId.value = folderId || null;
    activeModal.value = "addBookmark";
  }

  const baseClass =
    "w-24 h-24 relative rounded-lg flex items-center justify-center transition-all duration-150";

  if (isDropTarget) {
    return (
      <div
        class={`${baseClass} bg-sky-500/20 border-2 border-dashed border-sky-400 rounded-lg`}
        style={{ gridColumn: x + 1, gridRow: y + 1 }}
        onDragOver={drop.onDragOver}
        onDragLeave={drop.onDragLeave}
        onDrop={drop.onDrop}
      />
    );
  }

  if (showAddButton) {
    return (
      <div
        class={`${baseClass} tile-3d tile-3d-add cursor-pointer group`}
        style={{ gridColumn: x + 1, gridRow: y + 1 }}
        title="Add bookmark here"
        onClick={handleClick}
        onDragOver={drop.onDragOver}
        onDragLeave={drop.onDragLeave}
        onDrop={drop.onDrop}
      >
        <span class="text-sky-500/40 text-5xl leading-none font-mono transition-all duration-300 group-hover:text-sky-500 group-hover:scale-110">
          +
        </span>
      </div>
    );
  }

  // Empty placeholder (drag target only)
  return (
    <div
      class={`${baseClass} opacity-0 hover:opacity-100`}
      style={{ gridColumn: x + 1, gridRow: y + 1 }}
      onDragOver={drop.onDragOver}
      onDragLeave={drop.onDragLeave}
      onDrop={drop.onDrop}
    />
  );
}
