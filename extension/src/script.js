import { faviconMethods } from "./favicon.js";
import { bookmarkMethods } from "./bookmarks.js";
import { folderMethods } from "./folders.js";
import { uiMethods } from "./ui.js";
import { settingsMethods } from "./settings.js";
import { api } from "./api.js";

class BookmarkManager {
  constructor() {
    this.bookmarks = [];
    this.folders = [];
    this.currentBookmarkId = null;
    this.currentFolderId = null;
    this.openFolderId = null;
    this.isDragging = false;
    this.draggedBookmarkId = null;
    this.draggedFolderId = null;
    this.isDuplicateMode = false;
    this.duplicatedBookmarkId = null;
    this.selectedFavicon = null;
    this.selectedEditFavicon = null;
    this.faviconDebounceTimer = null;
    this.editFaviconDebounceTimer = null;
    this.settings = {
      showTitles: true,
      tilesPerRow: 8,
      tileGap: 1,
      showAddButton: true,
    };
    this.init();
  }

  async init() {
    await this.checkAuth();
    await this.loadSettings();
    await this.loadBookmarks();

    this.setupEventListeners();
    this.setupAuthListeners();
    this.setupStorageListener();
    this.updateTilesPerRowCSS(this.settings.tilesPerRow);
    this.renderQuickAccess();

    await this.cleanupUnusedFavicons();

    // Trigger a server sync via the background worker on every new tab open
    chrome.runtime.sendMessage({ type: "pull_changes" }).catch(() => {
      // Background worker may not be ready yet — that's fine
    });
  }

  async checkAuth() {
    try {
      const { authState } = await chrome.storage.local.get("authState");
      this.authState = authState || { authenticated: false, user: null };
      if (this.authState.authenticated) {
        console.log("✅ Authenticated as:", this.authState.user?.email);
      } else {
        console.log("ℹ️ Not signed in — using local storage");
      }
    } catch (error) {
      this.authState = { authenticated: false, user: null };
      console.log("ℹ️ Could not read auth state:", error.message);
    }
    this.updateAuthUI();
  }

  updateAuthUI() {
    const loginBtn = document.getElementById("loginBtn");
    const userInfo = document.getElementById("userInfo");
    const userName = document.getElementById("userName");

    if (this.authState?.authenticated && this.authState?.user) {
      loginBtn.classList.add("hidden");
      userInfo.classList.remove("hidden");
      userInfo.style.display = "flex";
      userName.textContent =
        this.authState.user.name || this.authState.user.email;
    } else {
      loginBtn.classList.remove("hidden");
      loginBtn.style.display = "flex";
      userInfo.classList.add("hidden");
    }
  }

  setupAuthListeners() {
    document.getElementById("loginBtn").addEventListener("click", () => {
      const loginUrl = api.getLoginUrl();
      window.open(loginUrl, "_blank", "width=500,height=600");
      // Signal background worker to poll for auth
      chrome.storage.local.set({ authAction: "login_started" });
    });

    document.getElementById("logoutBtn").addEventListener("click", async () => {
      // Signal background worker to handle logout
      await chrome.storage.local.set({ authAction: "logout" });
    });
  }

  setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;

      // Auth state changed (written by background worker)
      if (changes.authState) {
        this.authState = changes.authState.newValue || {
          authenticated: false,
          user: null,
        };
        this.updateAuthUI();
      }

      // Bookmarks changed (e.g. from background worker pull)
      if (changes.bookmarks && !this._localSaveInProgress) {
        this.bookmarks = changes.bookmarks.newValue || [];
        this.renderQuickAccess();
      }

      // Folders changed
      if (changes.folders && !this._localSaveInProgress) {
        this.folders = changes.folders.newValue || [];
        this.renderQuickAccess();
      }

      // Settings changed
      if (changes.bookmarkSettings && !this._localSaveInProgress) {
        const newSettings = changes.bookmarkSettings.newValue;
        if (newSettings) {
          this.settings = { ...this.settings, ...newSettings };
          this.loadCurrentSettingsIntoForm();
          this.updateTilesPerRowCSS(this.settings.tilesPerRow);
          this.renderQuickAccess();
        }
      }
    });
  }

  setupEventListeners() {
    // Add bookmark button
    document.getElementById("addBookmarkBtn").addEventListener("click", () => {
      this.showAddBookmarkModal();
    });

    // Export button
    document.getElementById("exportBtn").addEventListener("click", () => {
      this.exportAllData();
    });

    // Import button
    document.getElementById("importBtn").addEventListener("click", () => {
      this.importAllData();
    });

    // Import modal buttons
    document
      .getElementById("confirmImportBtn")
      .addEventListener("click", () => {
        this.confirmImport();
      });

    document.getElementById("cancelImportBtn").addEventListener("click", () => {
      this.hideImportConfirmModal();
    });

    // Import modal backdrop click
    document
      .getElementById("importConfirmModal")
      .addEventListener("click", (e) => {
        if (e.target === e.currentTarget) {
          this.hideImportConfirmModal();
        }
      });

    // Create folder button
    document.getElementById("createFolderBtn").addEventListener("click", () => {
      this.showCreateFolderModal();
    });

    // Cancel add bookmark
    document.getElementById("cancelAddBtn").addEventListener("click", () => {
      this.hideAddBookmarkModal();
    });

    // Add bookmark form submission
    document
      .getElementById("addBookmarkForm")
      .addEventListener("submit", (e) => {
        e.preventDefault();
        this.addBookmark();
      });

    // URL input change for favicon loading
    document.getElementById("bookmarkUrl").addEventListener("input", (e) => {
      this.handleUrlInputChange(e.target.value);
    });

    // Edit URL input change for favicon loading
    document
      .getElementById("editBookmarkUrl")
      .addEventListener("input", (e) => {
        this.handleEditUrlInputChange(e.target.value);
      });

    // Remove view toggle listeners since we only have favicon view now

    // Edit bookmark modal events
    document.getElementById("cancelEditBtn").addEventListener("click", () => {
      this.cancelEditBookmarkModal();
    });

    document
      .getElementById("editBookmarkForm")
      .addEventListener("submit", (e) => {
        e.preventDefault();
        console.log("Form submission triggered");
        this.updateBookmark();
      });

    // ESC key to close modals
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.hideAddBookmarkModal();
        this.cancelEditBookmarkModal();
        this.hideDeleteConfirmation();
        this.hideSettingsModal();
        this.closeFolderModal();
        this.hideCreateFolderModal();
        this.hideRenameFolderModal();
        this.hideContextMenu();
      }
    });

    // Backdrop click handling for modals
    document
      .getElementById("editBookmarkModal")
      .addEventListener("click", (e) => {
        if (e.target === e.currentTarget) {
          this.cancelEditBookmarkModal();
        }
      });

    document
      .getElementById("addBookmarkModal")
      .addEventListener("click", (e) => {
        if (e.target === e.currentTarget) {
          this.hideAddBookmarkModal();
        }
      });

    // Context menu events
    document.getElementById("editBookmark").addEventListener("click", () => {
      this.showEditBookmarkModal();
      this.hideContextMenu();
    });

    document
      .getElementById("duplicateBookmark")
      .addEventListener("click", () => {
        this.duplicateBookmark();
        this.hideContextMenu();
      });

    document.getElementById("copyBookmarkUrl").addEventListener("click", () => {
      this.copyBookmarkUrl();
      this.hideContextMenu();
    });

    document.getElementById("deleteBookmark").addEventListener("click", (e) => {
      this.showDeleteConfirmation(e);
      this.hideContextMenu();
    });

    // Delete confirmation popup events
    document.getElementById("cancelDeleteBtn").addEventListener("click", () => {
      this.hideDeleteConfirmation();
    });

    document
      .getElementById("confirmDeleteBtn")
      .addEventListener("click", () => {
        this.confirmDeleteBookmark();
        this.hideDeleteConfirmation();
      });

    // Settings button
    document.getElementById("settingsBtn").addEventListener("click", () => {
      this.showSettingsModal();
    });

    // Settings modal events - removed Save/Cancel buttons, settings apply immediately

    // Settings modal - no backdrop click handler needed since no backdrop

    // Folder modal events
    document.getElementById("closeFolderBtn").addEventListener("click", () => {
      this.closeFolderModal();
    });

    document.getElementById("folderModal").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) {
        this.closeFolderModal();
      }
    });

    // Create folder modal events
    document
      .getElementById("cancelCreateFolderBtn")
      .addEventListener("click", () => {
        this.hideCreateFolderModal();
      });

    document
      .getElementById("createFolderForm")
      .addEventListener("submit", (e) => {
        e.preventDefault();
        this.createFolderFromModal();
      });

    document
      .getElementById("createFolderModal")
      .addEventListener("click", (e) => {
        if (e.target === e.currentTarget) {
          this.hideCreateFolderModal();
        }
      });

    // Folder context menu events
    document.getElementById("renameFolder").addEventListener("click", () => {
      this.showRenameFolderModal();
      this.hideContextMenu();
    });

    document.getElementById("deleteFolder").addEventListener("click", (e) => {
      this.showFolderDeleteConfirmation(e);
      this.hideContextMenu();
    });

    // Rename folder modal events
    document
      .getElementById("cancelRenameFolderBtn")
      .addEventListener("click", () => {
        this.hideRenameFolderModal();
      });

    document
      .getElementById("renameFolderForm")
      .addEventListener("submit", (e) => {
        e.preventDefault();
        this.renameFolderFromModal();
      });

    document
      .getElementById("renameFolderModal")
      .addEventListener("click", (e) => {
        if (e.target === e.currentTarget) {
          this.hideRenameFolderModal();
        }
      });

    // Toggle switch styling and immediate settings save
    document.getElementById("showTitles").addEventListener("change", (e) => {
      this.updateToggleVisual(e.target);
      this.settings.showTitles = e.target.checked;
      this.saveSettings();
      this.renderQuickAccess(); // Re-render to show/hide titles immediately
    });

    // Show/Hide Add Button toggle
    document.getElementById("showAddButton").addEventListener("change", (e) => {
      this.updateToggleVisual(e.target);
      this.settings.showAddButton = e.target.checked;
      this.saveSettings();
      this.renderQuickAccess(); // Re-render to show/hide add button immediately
    });

    // Tiles per row slider
    document.getElementById("tilesPerRow").addEventListener("input", (e) => {
      const value = parseInt(e.target.value);
      document.getElementById("tilesPerRowValue").textContent = value;
      this.settings.tilesPerRow = value;
      this.saveSettings();
      this.updateTilesPerRowCSS(value);
    });

    // Tile gap slider
    document.getElementById("tileGap").addEventListener("input", (e) => {
      const value = parseInt(e.target.value);
      document.getElementById("tileGapValue").textContent = value;
      this.settings.tileGap = value;
      this.saveSettings();
      this.updateTilesPerRowCSS(this.settings.tilesPerRow);
    });

    // Hide context menu when clicking elsewhere
    document.addEventListener("click", (e) => {
      const isClickInsideModal =
        e.target.closest("#contextMenu") ||
        e.target.closest("#editBookmarkModal") ||
        e.target.closest("#deleteConfirmPopup") ||
        e.target.closest("#addBookmarkModal") ||
        e.target.closest("#settingsModal") ||
        e.target.closest("#settingsBtn") ||
        e.target.closest("#folderModal") ||
        e.target.closest("#createFolderModal") ||
        e.target.closest("#renameFolderModal");

      if (!isClickInsideModal) {
        this.hideContextMenu();
        this.hideDeleteConfirmation();

        // Check modal states
        const editModalOpen = !document
          .getElementById("editBookmarkModal")
          .classList.contains("hidden");
        const addModalOpen = !document
          .getElementById("addBookmarkModal")
          .classList.contains("hidden");
        const settingsModalOpen = !document
          .getElementById("settingsModal")
          .classList.contains("hidden");
        const folderModalOpen = !document
          .getElementById("folderModal")
          .classList.contains("hidden");
        const createFolderModalOpen = !document
          .getElementById("createFolderModal")
          .classList.contains("hidden");
        const renameFolderModalOpen = !document
          .getElementById("renameFolderModal")
          .classList.contains("hidden");

        // Close settings modal if it's open
        if (settingsModalOpen) {
          this.hideSettingsModal();
        }

        // Only clear currentBookmarkId if no modals are open
        if (
          !editModalOpen &&
          !addModalOpen &&
          !settingsModalOpen &&
          !folderModalOpen &&
          !createFolderModalOpen &&
          !renameFolderModalOpen
        ) {
          console.log(
            "Clearing currentBookmarkId and currentFolderId due to click outside",
          );
          this.currentBookmarkId = null;
          this.currentFolderId = null;
        }
      }
    });

    // Prevent default context menu
    document.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    // Paste functionality for adding bookmarks
    this.setupPasteListener();

    // Drag and drop functionality
    this.setupDragAndDrop();
  }

  setupPasteListener() {
    document.addEventListener("paste", async (e) => {
      // Don't interfere if user is pasting into an input field
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        return;
      }

      e.preventDefault();

      try {
        const clipboardText = await navigator.clipboard.readText();
        await this.handlePastedContent(clipboardText);
      } catch (error) {
        console.log("Could not read clipboard:", error);
        // Fallback to event clipboardData if clipboard API fails
        const clipboardText = e.clipboardData?.getData("text/plain");
        if (clipboardText) {
          await this.handlePastedContent(clipboardText);
        }
      }
    });
  }

  async handlePastedContent(content) {
    if (!content || !content.trim()) return;

    // Check if the content is a valid URL
    if (this.isValidUrl(content.trim())) {
      const url = content.trim();
      let title = "";

      // Try to extract title from URL
      try {
        const hostname = new URL(url).hostname;
        title = hostname.replace("www.", "");
        title = title.charAt(0).toUpperCase() + title.slice(1);
      } catch (e) {
        title = "Bookmark";
      }

      // Show the add bookmark modal with pre-filled URL
      this.showAddBookmarkModal();
      document.getElementById("bookmarkUrl").value = url;
      document.getElementById("bookmarkTitle").value = title;

      // Trigger favicon loading for the pasted URL
      this.handleUrlInputChange(url);

      document.getElementById("bookmarkTitle").focus();
      document.getElementById("bookmarkTitle").select();
    } else {
      // Check if content contains a URL within text (like "Check out https://example.com")
      const urlMatch = content.match(/(https?:\/\/[^\s]+)/i);
      if (urlMatch) {
        const url = urlMatch[1];
        const title =
          content.replace(urlMatch[0], "").trim() ||
          this.extractTitleFromUrl(url);

        this.showAddBookmarkModal();
        document.getElementById("bookmarkUrl").value = url;
        document.getElementById("bookmarkTitle").value = title;

        // Trigger favicon loading for the extracted URL
        this.handleUrlInputChange(url);

        document.getElementById("bookmarkTitle").focus();
        document.getElementById("bookmarkTitle").select();
      }
    }
  }

  extractTitleFromUrl(url) {
    try {
      const hostname = new URL(url).hostname;
      let title = hostname.replace("www.", "");
      return title.charAt(0).toUpperCase() + title.slice(1);
    } catch (e) {
      return "Bookmark";
    }
  }

  setupDragAndDrop() {
    const body = document.body;
    let dragCounter = 0;

    // Prevent default drag behaviors on document
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      document.addEventListener(
        eventName,
        (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        false,
      );
    });

    // Handle drag enter
    body.addEventListener("dragenter", (e) => {
      e.preventDefault();

      // Only show overlay for external drags (not internal bookmark reordering)
      if (!this.isDragging) {
        dragCounter++;

        // Add a visual overlay to indicate drop zone (excluding header)
        if (!document.getElementById("dropOverlay")) {
          const header = document.querySelector("header");
          const headerHeight = header ? header.offsetHeight : 0;

          const overlay = document.createElement("div");
          overlay.id = "dropOverlay";
          overlay.className =
            "fixed left-0 right-0 bottom-0 bg-blue-100/10 backdrop-blur-sm border-4 border-dashed border-blue-400 z-40 flex items-center justify-center";
          overlay.style.top = `${headerHeight}px`; // Start exactly at bottom of header
          overlay.innerHTML =
            '<div class="text-blue-600 text-xl font-semibold">Drop bookmark here</div>';
          body.appendChild(overlay);
        }
      }
    });

    // Handle drag over (required for drop to work)
    body.addEventListener("dragover", (e) => {
      e.preventDefault();
    });

    // Handle drag leave
    body.addEventListener("dragleave", (e) => {
      e.preventDefault();

      // Only handle external drags
      if (!this.isDragging) {
        dragCounter--;

        // Only remove overlay when all drag operations are done
        if (dragCounter === 0) {
          const overlay = document.getElementById("dropOverlay");
          if (overlay) {
            overlay.remove();
          }
        }
      }
    });

    // Handle drop on entire page
    body.addEventListener("drop", (e) => {
      e.preventDefault();

      // Only handle external drops (not internal bookmark reordering)
      if (!this.isDragging) {
        dragCounter = 0; // Reset counter on drop
        const overlay = document.getElementById("dropOverlay");
        if (overlay) {
          overlay.remove();
        }

        // Get the dragged data - Chrome bookmarks provide multiple data formats
        const url =
          e.dataTransfer.getData("text/uri-list") ||
          e.dataTransfer.getData("text/plain");

        // Try to get the bookmark title from different data types
        let title = "";

        // Debug: log all available data types
        console.log("Available data types:", e.dataTransfer.types);

        // Try various data formats to get the bookmark name
        const htmlData = e.dataTransfer.getData("text/html");
        const plainText = e.dataTransfer.getData("text/plain");
        const mozText = e.dataTransfer.getData("text/x-moz-text-internal");
        const mozHtml = e.dataTransfer.getData("application/x-moz-nativehtml");

        console.log("Data extraction:", {
          htmlData,
          plainText,
          mozText,
          mozHtml,
          url,
        });

        // First priority: Extract title from HTML data (most reliable for bookmarks)
        if (htmlData) {
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = htmlData;
          const linkElement = tempDiv.querySelector("a");
          if (
            linkElement &&
            linkElement.textContent &&
            linkElement.textContent.trim() !== url &&
            !linkElement.textContent.trim().startsWith("http")
          ) {
            title = linkElement.textContent.trim();
          }
        }

        // Second priority: Use Mozilla-specific data formats
        if (
          !title &&
          mozText &&
          mozText !== url &&
          !mozText.startsWith("http")
        ) {
          title = mozText.trim();
        }

        // Third priority: Use plain text if it's not a URL
        if (
          !title &&
          plainText &&
          plainText !== url &&
          !plainText.startsWith("http")
        ) {
          title = plainText.trim();
        }

        if (url && this.isValidUrl(url)) {
          this.addBookmarkFromDrop(title, url);
        }
      }
    });
  }

  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  normalizeUrl(url) {
    if (!url || !url.trim()) return url;

    const trimmedUrl = url.trim();

    // If it already has a protocol, return as is
    if (trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")) {
      return trimmedUrl;
    }

    // If it looks like a URL (contains a dot and domain pattern), prefix with https://
    if (trimmedUrl.includes(".") && /^[a-zA-Z0-9]/.test(trimmedUrl)) {
      return "https://" + trimmedUrl;
    }

    return trimmedUrl;
  }

  isValidUrlOrCanBeNormalized(string) {
    if (!string || !string.trim()) return false;

    // First check if it's already valid
    if (this.isValidUrl(string)) return true;

    // Then check if it can be normalized to a valid URL
    const normalized = this.normalizeUrl(string);
    return this.isValidUrl(normalized);
  }

  // Removed unused bookmark card and list rendering methods
}

Object.assign(
  BookmarkManager.prototype,
  faviconMethods,
  bookmarkMethods,
  folderMethods,
  uiMethods,
  settingsMethods,
);

// Initialize the bookmark manager when the page loads
let bookmarkManager;
document.addEventListener("DOMContentLoaded", () => {
  bookmarkManager = new BookmarkManager();
});
