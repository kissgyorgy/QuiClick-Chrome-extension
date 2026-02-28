import { useState, useEffect, useRef } from "preact/hooks";
import {
  activeModal,
  bookmarks,
  currentBookmarkId,
  openFolderId,
} from "../state/store.js";
import { updateBookmark, deleteBookmarkById } from "../hooks/use-bookmarks.js";
import { useFaviconPicker } from "../hooks/use-favicons.js";
import { FaviconPicker } from "./FaviconPicker.jsx";

export function EditBookmarkModal() {
  const modal = activeModal.value;
  const isOpen = modal === "editBookmark" || modal === "duplicateBookmark";

  if (!isOpen) return null;

  return <EditBookmarkForm isDuplicate={modal === "duplicateBookmark"} />;
}

function EditBookmarkForm({ isDuplicate }) {
  const bookmarkId = currentBookmarkId.value;
  const bookmark = bookmarks.value.find((b) => b.id === bookmarkId);

  const [title, setTitle] = useState(bookmark?.title || "");
  const [url, setUrl] = useState(bookmark?.url || "");
  const modalRef = useRef(null);

  const { faviconUrls, selectedFavicon, selectFavicon, isLoading } =
    useFaviconPicker(url, (extracted) => {
      // Don't auto-fill title in edit mode
    });

  // Position modal near the bookmark tile
  useEffect(() => {
    if (!modalRef.current || !bookmarkId) return;
    const bookmarkEl = document.querySelector(
      `[data-bookmark-id="${bookmarkId}"]`,
    );
    if (!bookmarkEl) return;

    const rect = bookmarkEl.getBoundingClientRect();
    let left = rect.right + 10;
    let top = rect.top;

    if (left + 384 > window.innerWidth) left = rect.left - 384 - 10;
    if (top + 300 > window.innerHeight) top = rect.bottom - 300;
    if (top < 0) top = 10;
    if (left < 10) left = 10;

    modalRef.current.style.left = `${left}px`;
    modalRef.current.style.top = `${top}px`;
  }, [bookmarkId]);

  async function handleClose() {
    if (isDuplicate && bookmarkId) {
      await deleteBookmarkById(bookmarkId);
    }
    currentBookmarkId.value = null;
    activeModal.value = null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !url.trim() || !bookmarkId) return;

    await updateBookmark(bookmarkId, {
      title: title.trim(),
      url: url.trim(),
      favicon: selectedFavicon,
    });

    currentBookmarkId.value = null;
    activeModal.value = null;
  }

  if (!bookmark) return null;

  return (
    <div
      class="modal-backdrop fixed inset-0 flex items-center justify-center z-60"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div ref={modalRef} class="edit-modal fixed z-60 w-96">
        <div class="modal-content rounded-xl p-6">
          <h3 class="text-lg font-semibold text-custom-text mb-4">
            {isDuplicate ? "Duplicate Bookmark" : "Edit Bookmark"}
          </h3>
          <form onSubmit={handleSubmit}>
            <div class="mb-4">
              <label class="block text-sm font-medium text-custom-text mb-2">
                Title
              </label>
              <input
                type="text"
                value={title}
                onInput={(e) => setTitle(e.currentTarget.value)}
                class="w-full px-3 py-2 border border-custom-border rounded-lg focus:outline-none focus:ring-2 focus:ring-custom-accent focus:border-transparent"
                autocomplete="off"
                required
                autoFocus
              />
            </div>
            <div class="mb-4">
              <label class="block text-sm font-medium text-custom-text mb-2">
                URL
              </label>
              <input
                type="text"
                value={url}
                onInput={(e) => setUrl(e.currentTarget.value)}
                class="w-full px-3 py-2 border border-custom-border rounded-lg focus:outline-none focus:ring-2 focus:ring-custom-accent focus:border-transparent"
                autocomplete="off"
                required
              />
            </div>
            <div class="mb-6">
              <label class="block text-sm font-medium text-custom-text mb-2">
                Choose Favicon
              </label>
              <FaviconPicker
                faviconUrls={faviconUrls}
                selectedFavicon={selectedFavicon}
                onSelect={selectFavicon}
                isLoading={isLoading}
              />
            </div>
            <div class="flex space-x-3">
              <button
                type="button"
                onClick={handleClose}
                class="flex-1 px-3 py-2 border border-custom-border rounded-lg text-custom-text hover:bg-gray-50 transition-colors cursor-pointer font-bold text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                class="flex-1 px-3 py-2 bg-custom-accent text-white rounded-lg hover:bg-blue-600 transition-colors cursor-pointer font-bold text-sm"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
