import { useEffect, useRef } from "preact/hooks";
import {
  contextMenu,
  activeModal,
  currentBookmarkId,
  currentFolderId,
  notification,
} from "../state/store.js";
import { copyBookmarkUrl } from "../hooks/use-bookmarks.js";
import { duplicateBookmark } from "../hooks/use-bookmarks.js";

function hideContextMenu() {
  contextMenu.value = { ...contextMenu.peek(), visible: false };
}

export function ContextMenu() {
  const { visible, x, y, type } = contextMenu.value;
  const menuRef = useRef(null);

  // Adjust position if off-screen after render
  useEffect(() => {
    if (visible && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      let adjustedX = x;
      let adjustedY = y;

      if (rect.right > window.innerWidth) {
        adjustedX = x - rect.width;
      }
      if (rect.bottom > window.innerHeight) {
        adjustedY = y - rect.height;
      }

      if (adjustedX !== x || adjustedY !== y) {
        contextMenu.value = {
          ...contextMenu.peek(),
          x: adjustedX,
          y: adjustedY,
        };
      }
    }
  }, [visible, x, y]);

  if (!visible) return null;

  async function handleEdit() {
    hideContextMenu();
    activeModal.value = "editBookmark";
  }

  async function handleDuplicate() {
    hideContextMenu();
    const bookmarkId = currentBookmarkId.peek();
    if (!bookmarkId) return;
    const duplicated = await duplicateBookmark(bookmarkId);
    if (duplicated) {
      currentBookmarkId.value = duplicated.id;
      activeModal.value = "duplicateBookmark";
    }
  }

  async function handleCopyUrl() {
    hideContextMenu();
    const bookmarkId = currentBookmarkId.peek();
    if (!bookmarkId) return;
    const success = await copyBookmarkUrl(bookmarkId);
    if (success) {
      notification.value = { visible: true, type: "copy" };
    }
  }

  function handleDelete() {
    hideContextMenu();
    activeModal.value = "deleteConfirm";
  }

  function handleRenameFolder() {
    hideContextMenu();
    activeModal.value = "renameFolder";
  }

  function handleDeleteFolder() {
    hideContextMenu();
    activeModal.value = "folderDeleteConfirm";
  }

  return (
    <div
      ref={menuRef}
      id="contextMenu"
      class="context-menu fixed rounded-lg py-2 z-60 min-w-30 backdrop-blur-xl border border-white/90"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      {type === "bookmark" && (
        <>
          <button
            class="group w-full px-3 py-2 text-left text-sm text-custom-text hover:bg-sky-400/15 hover:text-sky-900 flex items-center space-x-2 cursor-pointer font-bold transition-all duration-200"
            onClick={handleEdit}
          >
            <svg
              class="w-4 h-4 opacity-60 group-hover:opacity-100"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            <span>Edit</span>
          </button>
          <button
            class="group w-full px-3 py-2 text-left text-sm text-custom-text hover:bg-sky-400/15 hover:text-sky-900 flex items-center space-x-2 cursor-pointer font-bold transition-all duration-200"
            onClick={handleDuplicate}
          >
            <svg
              class="w-4 h-4 opacity-60 group-hover:opacity-100"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <span>Duplicate</span>
          </button>
          <button
            class="group w-full px-3 py-2 text-left text-sm text-custom-text hover:bg-sky-400/15 hover:text-sky-900 flex items-center space-x-2 cursor-pointer font-bold transition-all duration-200"
            onClick={handleCopyUrl}
          >
            <svg
              class="w-4 h-4 opacity-60 group-hover:opacity-100"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V9a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <span>Copy URL</span>
          </button>
          <button
            class="group w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-500/10 hover:text-red-700 flex items-center space-x-2 cursor-pointer font-bold transition-all duration-200"
            onClick={handleDelete}
          >
            <svg
              class="w-4 h-4 opacity-60 group-hover:opacity-100"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            <span>Delete</span>
          </button>
        </>
      )}

      {type === "folder" && (
        <>
          <button
            class="group w-full px-3 py-2 text-left text-sm text-custom-text hover:bg-sky-400/15 hover:text-sky-900 flex items-center space-x-2 cursor-pointer font-bold transition-all duration-200"
            onClick={handleRenameFolder}
          >
            <svg
              class="w-4 h-4 opacity-60 group-hover:opacity-100"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            <span>Rename</span>
          </button>
          <button
            class="group w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-500/10 hover:text-red-700 flex items-center space-x-2 cursor-pointer font-bold transition-all duration-200"
            onClick={handleDeleteFolder}
          >
            <svg
              class="w-4 h-4 opacity-60 group-hover:opacity-100"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            <span>Delete Folder</span>
          </button>
        </>
      )}
    </div>
  );
}
