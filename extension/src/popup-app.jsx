import { useState, useEffect } from "preact/hooks";
import { useFaviconPicker } from "./hooks/use-favicons.js";
import { FaviconPicker } from "./components/FaviconPicker.jsx";
import { normalizeUrl, extractTitleFromUrl } from "./utils/url.js";
import {
  downloadAndCacheFavicon,
  getHighResolutionFavicon,
} from "./utils/favicon.js";
import { enqueueSync } from "./sync-queue.js";

export function PopupApp() {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("idle"); // idle | adding | done

  const { faviconUrls, selectedFavicon, selectFavicon, isLoading } =
    useFaviconPicker(url, (extracted) => {
      if (extracted && (!title || title === extractTitleFromUrl(url))) {
        setTitle(extracted);
      }
    });

  // Load current tab info on mount
  useEffect(() => {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab) {
          setTitle(tab.title || extractTitleFromUrl(tab.url));
          setUrl(tab.url);
        }
      } catch (error) {
        console.error("Error loading current tab:", error);
      }
    })();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;

    setStatus("adding");

    try {
      const { bookmarks, folders } = await loadBookmarks();
      const normalizedUrl = normalizeUrl(url.trim());

      // Check if bookmark already exists
      const existing = bookmarks.find((b) => b.url === normalizedUrl);
      if (existing) {
        alert("Bookmark already exists: " + existing.title);
        setStatus("idle");
        return;
      }

      // Get favicon
      let favicon = selectedFavicon;
      if (!favicon) {
        favicon = await getHighResolutionFavicon(normalizedUrl);
      } else if (favicon.startsWith("http")) {
        const domain = new URL(normalizedUrl).hostname;
        favicon = await downloadAndCacheFavicon(domain, favicon);
      }

      const now = new Date().toISOString();
      const newBookmark = {
        id: Date.now(),
        title: title.trim(),
        url: normalizedUrl,
        favicon,
        dateAdded: now,
        folderId: null,
        lastUpdated: now,
        position: bookmarks.length,
      };

      bookmarks.push(newBookmark);
      await saveBookmarks(bookmarks, folders);

      enqueueSync("create_bookmark", {
        localId: newBookmark.id,
        title: newBookmark.title,
        url: newBookmark.url,
        favicon: newBookmark.favicon || null,
        folderId: null,
        position: newBookmark.position,
      });

      setStatus("done");
      setTimeout(() => window.close(), 500);
    } catch (error) {
      console.error("Error adding bookmark:", error);
      alert("Error adding bookmark: " + error.message);
      setStatus("idle");
    }
  }

  return (
    <div class="popup-content">
      <h3 class="text-lg font-semibold text-custom-text mb-4">
        Add to QuiClick
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
          />
        </div>
        <div class="mb-6">
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
        {(faviconUrls.length > 0 || isLoading) && (
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
            onClick={() => window.close()}
            class="flex-1 px-3 py-2 border border-custom-border rounded-lg text-custom-text hover:bg-gray-50 transition-colors cursor-pointer font-bold text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={status !== "idle"}
            class="flex-1 px-3 py-2 bg-custom-accent text-white rounded-lg hover:bg-blue-600 transition-colors cursor-pointer font-bold text-sm disabled:opacity-50"
          >
            {status === "adding"
              ? "Adding..."
              : status === "done"
                ? "Added!"
                : "Add Bookmark"}
          </button>
        </div>
      </form>
    </div>
  );
}

async function loadBookmarks() {
  try {
    const result = await chrome.storage.local.get(["bookmarks", "folders"]);
    return {
      bookmarks: result.bookmarks || [],
      folders: result.folders || [],
    };
  } catch (error) {
    return { bookmarks: [], folders: [] };
  }
}

async function saveBookmarks(bookmarks, folders) {
  await chrome.storage.local.set({ bookmarks, folders });
}
