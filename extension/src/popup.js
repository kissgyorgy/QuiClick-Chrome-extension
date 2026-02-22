// Popup script for QuiClick extension
// Handles the bookmark addition form in the popup

import { enqueueSync } from "./sync-queue.js";

class QuiClickPopup {
  constructor() {
    this.selectedFavicon = null;
    this.faviconDebounceTimer = null;
    this.init();
  }

  async init() {
    await this.loadCurrentTab();
    this.setupEventListeners();
  }

  async loadCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab) {
        document.getElementById("bookmarkTitle").value =
          tab.title || this.extractTitleFromUrl(tab.url);
        document.getElementById("bookmarkUrl").value = tab.url;

        // Load favicon options for the current tab
        this.handleUrlInputChange(tab.url);
      }
    } catch (error) {
      console.error("Error loading current tab:", error);
    }
  }

  setupEventListeners() {
    // Form submission
    document
      .getElementById("addBookmarkForm")
      .addEventListener("submit", (e) => {
        e.preventDefault();
        this.addBookmark();
      });

    // Cancel button
    document.getElementById("cancelBtn").addEventListener("click", () => {
      window.close();
    });

    // URL input change
    document.getElementById("bookmarkUrl").addEventListener("input", (e) => {
      this.handleUrlInputChange(e.target.value);
    });
  }

  handleUrlInputChange(url) {
    // Clear previous timer
    if (this.faviconDebounceTimer) {
      clearTimeout(this.faviconDebounceTimer);
    }

    // Debounce favicon loading
    this.faviconDebounceTimer = setTimeout(() => {
      this.loadFaviconOptions(url);
    }, 500);
  }

  async loadFaviconOptions(url) {
    if (!url || !url.trim()) {
      document.getElementById("faviconSelection").classList.add("hidden");
      return;
    }

    try {
      const normalizedUrl = this.normalizeUrl(url);
      const faviconData = await this.getAllFaviconUrlsAndTitle(normalizedUrl);

      // Update title if extracted from page
      if (faviconData.title && faviconData.title.trim() !== "") {
        const titleInput = document.getElementById("bookmarkTitle");
        if (
          !titleInput.value ||
          titleInput.value === this.extractTitleFromUrl(url)
        ) {
          titleInput.value = faviconData.title;
        }
      }

      if (faviconData.faviconUrls && faviconData.faviconUrls.length > 0) {
        this.displayFaviconOptions(faviconData.faviconUrls);
        document.getElementById("faviconSelection").classList.remove("hidden");
      } else {
        document.getElementById("faviconSelection").classList.add("hidden");
      }
    } catch (error) {
      console.error("Error loading favicon options:", error);
      document.getElementById("faviconSelection").classList.add("hidden");
    }
  }

  async getAllFaviconUrlsAndTitle(url) {
    try {
      const domain = new URL(url).hostname;
      const faviconUrls = [];
      let extractedTitle = "";

      // Check cached favicons first
      const cachedFavicon = await this.getCachedFavicon(domain);
      if (cachedFavicon) {
        faviconUrls.push(cachedFavicon);
      }

      // Try to fetch HTML for favicon links and title
      try {
        const response = await fetch(url);
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        // Extract title
        const titleElement = doc.querySelector("title");
        if (titleElement && titleElement.textContent.trim()) {
          extractedTitle = titleElement.textContent.trim();
        }

        // Extract favicon links
        const faviconLinks = doc.querySelectorAll('link[rel*="icon"]');
        faviconLinks.forEach((link) => {
          const href = link.getAttribute("href");
          if (href) {
            const faviconUrl = new URL(href, url).href;
            if (!faviconUrls.includes(faviconUrl)) {
              faviconUrls.push(faviconUrl);
            }
          }
        });
      } catch (fetchError) {
        console.log("Could not fetch HTML:", fetchError.message);
      }

      // Add common favicon sources
      const commonFaviconSources = [
        `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
        `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
        `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
        `https://${domain}/favicon.ico`,
        `https://${domain}/apple-touch-icon.png`,
        `https://${domain}/apple-touch-icon-180x180.png`,
      ];

      commonFaviconSources.forEach((faviconUrl) => {
        if (!faviconUrls.includes(faviconUrl)) {
          faviconUrls.push(faviconUrl);
        }
      });

      return {
        faviconUrls: faviconUrls,
        title: extractedTitle,
      };
    } catch (error) {
      console.error("Error getting favicon URLs and title:", error);
      return { faviconUrls: [], title: "" };
    }
  }

  displayFaviconOptions(faviconUrls) {
    const faviconOptionsDiv = document.getElementById("faviconOptions");
    faviconOptionsDiv.innerHTML = "";

    faviconUrls.forEach((faviconUrl, index) => {
      const faviconOption = document.createElement("div");
      faviconOption.className = "favicon-option";
      faviconOption.dataset.url = faviconUrl;

      const img = document.createElement("img");
      img.src = faviconUrl;
      img.alt = "Favicon option";
      img.loading = "lazy";

      img.onerror = () => {
        faviconOption.classList.add("favicon-error");
        faviconOption.style.display = "none";
      };

      img.onload = () => {
        faviconOption.classList.remove("loading");
        if (index === 0 && !this.selectedFavicon) {
          this.selectFavicon(faviconOption, faviconUrl);
        }
      };

      faviconOption.appendChild(img);
      faviconOption.addEventListener("click", () => {
        this.selectFavicon(faviconOption, faviconUrl);
      });

      faviconOptionsDiv.appendChild(faviconOption);
    });
  }

  selectFavicon(element, url) {
    // Remove previous selection
    const previousSelected = document.querySelector(".favicon-option.selected");
    if (previousSelected) {
      previousSelected.classList.remove("selected");
    }

    // Add selection to clicked element
    element.classList.add("selected");
    this.selectedFavicon = url;
  }

  async addBookmark() {
    try {
      const title = document.getElementById("bookmarkTitle").value.trim();
      const url = document.getElementById("bookmarkUrl").value.trim();

      if (!title || !url) {
        alert("Please fill in both title and URL");
        return;
      }

      // Disable form during submission
      document.getElementById("addBtn").disabled = true;
      document.getElementById("addBtn").textContent = "Adding...";

      // Get current bookmarks and folders from local storage
      const { bookmarks, folders } = await this.loadBookmarks();

      // Check if bookmark already exists
      const existingBookmark = bookmarks.find(
        (bookmark) => bookmark.url === url,
      );
      if (existingBookmark) {
        alert("Bookmark already exists: " + existingBookmark.title);
        return;
      }

      // Get favicon - use selected or fetch high-resolution
      let favicon = this.selectedFavicon;
      if (!favicon) {
        favicon = await this.getHighResolutionFavicon(url);
      } else if (favicon.startsWith("http")) {
        // Cache external favicon
        const domain = new URL(url).hostname;
        favicon = await this.downloadAndCacheFavicon(domain, favicon);
      }

      // Create new bookmark
      const now = new Date().toISOString();
      const newBookmark = {
        id: Date.now(),
        title,
        url: this.normalizeUrl(url),
        favicon,
        dateAdded: now,
        folderId: null,
        lastUpdated: now,
        position: bookmarks.length,
      };

      // Add bookmark to array
      bookmarks.push(newBookmark);

      // Save to local storage
      await this.saveBookmarks(bookmarks, folders);

      // Enqueue sync
      enqueueSync("create_bookmark", {
        localId: newBookmark.id,
        title: newBookmark.title,
        url: newBookmark.url,
        favicon: newBookmark.favicon || null,
        folderId: null,
        position: newBookmark.position,
      });

      // Show success and close popup
      document.getElementById("addBtn").textContent = "Added!";
      setTimeout(() => {
        window.close();
      }, 500);
    } catch (error) {
      console.error("Error adding bookmark:", error);
      alert("Error adding bookmark: " + error.message);
      document.getElementById("addBtn").disabled = false;
      document.getElementById("addBtn").textContent = "Add Bookmark";
    }
  }

  async loadBookmarks() {
    try {
      const result = await chrome.storage.local.get(["bookmarks", "folders"]);
      return {
        bookmarks: result.bookmarks || [],
        folders: result.folders || [],
      };
    } catch (error) {
      console.log("Error loading bookmarks:", error);
      return { bookmarks: [], folders: [] };
    }
  }

  async saveBookmarks(bookmarks, folders) {
    try {
      await chrome.storage.local.set({ bookmarks, folders });
    } catch (error) {
      console.error("Error saving bookmarks:", error);
      throw error;
    }
  }

  async getCachedFavicon(hostname) {
    try {
      const result = await chrome.storage.local.get([`favicon_${hostname}`]);
      return result[`favicon_${hostname}`] || null;
    } catch (error) {
      return null;
    }
  }

  async downloadAndCacheFavicon(hostname, faviconUrl) {
    try {
      const response = await fetch(faviconUrl);
      const blob = await response.blob();
      const base64 = await this.blobToBase64(blob);

      // Cache the favicon
      await chrome.storage.local.set({ [`favicon_${hostname}`]: base64 });

      return base64;
    } catch (error) {
      console.error("Error downloading favicon:", error);
      return faviconUrl;
    }
  }

  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async getHighResolutionFavicon(url) {
    try {
      const domain = new URL(url).hostname;

      const faviconUrls = [
        `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
        `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
        `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
        `https://${domain}/favicon.ico`,
      ];

      for (const faviconUrl of faviconUrls) {
        try {
          const response = await fetch(faviconUrl);
          if (response.ok) {
            const blob = await response.blob();
            if (blob.size > 0) {
              return await this.blobToBase64(blob);
            }
          }
        } catch (fetchError) {
          continue;
        }
      }

      return "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCA5TDEzLjA5IDE1Ljc0TDEyIDIyTDEwLjkxIDE1Ljc0TDQgOUwxMC45MSA4LjI2TDEyIDJaIiBmaWxsPSIjNjM2MzYzIi8+Cjwvc3ZnPgo=";
    } catch (error) {
      return "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCA5TDEzLjA5IDE1Ljc0TDEyIDIyTDEwLjkxIDE1Ljc0TDQgOUwxMC45MSA4LjI2TDEyIDJaIiBmaWxsPSIjNjM2MzYzIi8+Cjwvc3ZnPgo=";
    }
  }

  normalizeUrl(url) {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
    return url;
  }

  extractTitleFromUrl(url) {
    try {
      const hostname = new URL(url).hostname;
      let title = hostname.replace("www.", "");
      title = title.charAt(0).toUpperCase() + title.slice(1);
      return title;
    } catch (e) {
      return "Bookmark";
    }
  }
}

// Initialize the popup
document.addEventListener("DOMContentLoaded", () => {
  new QuiClickPopup();
});
