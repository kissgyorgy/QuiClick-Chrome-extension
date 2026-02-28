import { useState } from "preact/hooks";
import { activeModal } from "../state/store.js";
import { addBookmark } from "../hooks/use-bookmarks.js";
import { useFaviconPicker } from "../hooks/use-favicons.js";
import { FaviconPicker } from "./FaviconPicker.jsx";

export function AddBookmarkModal({ prefillUrl = "", prefillTitle = "" }) {
  const modal = activeModal.value;
  const isOpen = modal === "addBookmark";

  if (!isOpen) return null;

  return (
    <AddBookmarkForm prefillUrl={prefillUrl} prefillTitle={prefillTitle} />
  );
}

function AddBookmarkForm({ prefillUrl, prefillTitle }) {
  const [title, setTitle] = useState(prefillTitle);
  const [url, setUrl] = useState(prefillUrl);

  const { faviconUrls, selectedFavicon, selectFavicon, isLoading } =
    useFaviconPicker(url, (extracted) => {
      if (!title) setTitle(extracted);
    });

  function handleClose() {
    activeModal.value = null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;

    await addBookmark({
      title: title.trim(),
      url: url.trim(),
      favicon: selectedFavicon,
    });
    activeModal.value = null;
  }

  return (
    <div
      class="modal-backdrop fixed inset-0 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div class="modal-content rounded-xl p-6 w-96 mx-4">
        <h3 class="text-lg font-semibold text-custom-text mb-4">
          Add New Bookmark
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
          {(url || faviconUrls.length > 0) && (
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
          )}
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
              Add Bookmark
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
