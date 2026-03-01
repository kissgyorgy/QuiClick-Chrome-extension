import { useEffect, useRef } from "preact/hooks";
import {
  activeModal,
  bookmarks,
  folders,
  currentBookmarkId,
  currentFolderId,
  openFolderId,
} from "../state/store.js";
import { deleteBookmarkById } from "../hooks/use-bookmarks.js";
import { deleteFolder } from "../hooks/use-folders.js";

export function DeleteConfirm() {
  const modal = activeModal.value;
  const isBookmarkDelete = modal === "deleteConfirm";
  const isFolderDelete = modal === "folderDeleteConfirm";

  if (!isBookmarkDelete && !isFolderDelete) return null;

  return isBookmarkDelete ? <BookmarkDeletePopup /> : <FolderDeletePopup />;
}

function BookmarkDeletePopup() {
  const bookmarkId = currentBookmarkId.value;
  const bookmark = bookmarks.value.find((b) => b.id === bookmarkId);
  const popupRef = useRef(null);

  useEffect(() => {
    if (!popupRef.current || !bookmarkId) return;
    const bookmarkEl = document.querySelector(
      `[data-bookmark-id="${bookmarkId}"]`,
    );
    if (!bookmarkEl) return;
    positionPopup(popupRef.current, bookmarkEl.getBoundingClientRect());
  }, [bookmarkId]);

  function handleCancel() {
    currentBookmarkId.value = null;
    activeModal.value = null;
  }

  async function handleConfirm() {
    if (!bookmarkId) return;
    await deleteBookmarkById(bookmarkId);
    currentBookmarkId.value = null;
    activeModal.value = null;
  }

  if (!bookmark) return null;

  return (
    <div
      ref={popupRef}
      class="delete-popup fixed rounded-lg p-4 z-70 w-64 backdrop-blur-xl border border-red-200/50"
    >
      <div class="text-sm text-gray-700 mb-3">
        Are you sure you want to delete <strong>{bookmark.title}</strong>?
      </div>
      <div class="flex space-x-2">
        <button
          onClick={handleCancel}
          class="flex-1 px-2 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer font-bold"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          class="flex-1 px-2 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 transition-colors cursor-pointer font-bold"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function FolderDeletePopup() {
  const folderId = currentFolderId.value;
  const folder = folders.value.find((f) => f.id === folderId);
  const bookmarkCount = bookmarks.value.filter(
    (b) => b.folderId === folderId,
  ).length;
  const popupRef = useRef(null);

  useEffect(() => {
    if (!popupRef.current || !folderId) return;
    const folderEl = document.querySelector(`[data-folder-id="${folderId}"]`);
    if (!folderEl) return;
    positionPopup(popupRef.current, folderEl.getBoundingClientRect());
  }, [folderId]);

  function handleCancel() {
    currentFolderId.value = null;
    activeModal.value = null;
  }

  async function handleConfirm() {
    if (!folderId) return;
    if (openFolderId.peek() === folderId) {
      openFolderId.value = null;
      // Close folder modal too
      if (activeModal.peek() === "folderDeleteConfirm") {
        // will be set below
      }
    }
    await deleteFolder(folderId);
    currentFolderId.value = null;
    activeModal.value = null;
  }

  if (!folder) return null;

  const bookmarkText = bookmarkCount === 1 ? "bookmark" : "bookmarks";

  return (
    <div
      ref={popupRef}
      class="delete-popup fixed rounded-lg p-4 z-70 w-64 backdrop-blur-xl border border-red-200/50"
    >
      <div class="text-sm text-gray-700 mb-3">
        Are you sure you want to delete folder <strong>{folder.name}</strong>?
        <br />
        <small class="text-gray-500">
          {bookmarkCount} {bookmarkText} will be moved to the main view.
        </small>
      </div>
      <div class="flex space-x-2">
        <button
          onClick={handleCancel}
          class="flex-1 px-2 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer font-bold"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          class="flex-1 px-2 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 transition-colors cursor-pointer font-bold"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function positionPopup(popup, rect) {
  let left = rect.right + 10;
  let top = rect.top;

  if (left + 256 > window.innerWidth) left = rect.left - 256 - 10;
  if (top + 100 > window.innerHeight) top = rect.bottom - 100;
  if (top < 0) top = 10;

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}
