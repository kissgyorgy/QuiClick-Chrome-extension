import { useState } from "preact/hooks";
import {
  settings,
  activeModal,
  currentFolderId,
  openFolderId,
  contextMenu,
  dragState,
} from "../state/store.js";
import { useFolderDropHandlers } from "../hooks/use-drag-and-drop.js";

export function FolderTile({ folder }) {
  const { showTitles } = settings.value;
  const [dropHover, setDropHover] = useState(false);
  const folderDrop = useFolderDropHandlers(folder.id);

  function handleClick(e) {
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
    if (dragState.peek().draggedBookmarkId) {
      folderDrop.onDragOver(e);
      setDropHover(true);
    }
  }

  function handleDragLeave() {
    setDropHover(false);
  }

  function handleDrop(e) {
    setDropHover(false);
    folderDrop.onDrop(e);
  }

  const paddingClass = showTitles ? "pt-2 px-4 pb-6" : "p-4";

  return (
    <div
      class={`tile tile-3d tile-3d-folder w-24 h-24 relative rounded-lg cursor-pointer ${dropHover ? "bg-amber-200 border-amber-400" : ""}`}
      data-folder-id={folder.id}
      draggable={false}
      title={folder.name}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
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
    </div>
  );
}
