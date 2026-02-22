// Bookmark CRUD, rendering, and reordering
import { enqueueSync } from "./sync-queue.js";

export const bookmarkMethods = {
  async addBookmarkFromDrop(title, url) {
    // Use the provided bookmark title if available, otherwise extract from URL
    let bookmarkTitle = title;
    if (
      !title ||
      title.trim() === "" ||
      title === url ||
      title.startsWith("http")
    ) {
      try {
        const hostname = new URL(url).hostname;
        bookmarkTitle = hostname.replace("www.", "");
        bookmarkTitle =
          bookmarkTitle.charAt(0).toUpperCase() + bookmarkTitle.slice(1);
      } catch (e) {
        bookmarkTitle = "Bookmark";
      }
    }

    // Show the add bookmark modal with pre-filled data
    this.showAddBookmarkModal();
    document.getElementById("bookmarkTitle").value = bookmarkTitle;
    document.getElementById("bookmarkUrl").value = url;

    // Trigger favicon loading for the dropped URL
    this.handleUrlInputChange(url);

    // Focus the title field and select the text for easy editing
    setTimeout(() => {
      const titleInput = document.getElementById("bookmarkTitle");
      titleInput.focus();
      titleInput.select();
    }, 100);
  },

  async loadBookmarks() {
    // Always load from local storage (fast, offline-first)
    try {
      const result = await chrome.storage.local.get(["bookmarks", "folders"]);
      this.bookmarks = result.bookmarks || (await this.getDefaultBookmarks());
      this.folders = result.folders || [];
      console.log("Loaded bookmarks from local storage");
    } catch (error) {
      console.log("Error loading from local storage:", error.message);
      this.bookmarks = await this.getDefaultBookmarks();
      this.folders = [];
    }
  },

  async getDefaultBookmarks() {
    const defaultUrls = [
      { title: "Google", url: "https://www.google.com" },
      { title: "GitHub", url: "https://github.com" },
      { title: "Stack Overflow", url: "https://stackoverflow.com" },
      { title: "YouTube", url: "https://www.youtube.com" },
    ];

    const bookmarks = [];
    for (let i = 0; i < defaultUrls.length; i++) {
      const { title, url } = defaultUrls[i];
      const favicon = await this.getHighResolutionFavicon(url);
      bookmarks.push({
        id: Date.now() + i + 1,
        title,
        url,
        favicon,
        dateAdded: new Date().toISOString(),
        folderId: null,
      });
    }

    return bookmarks;
  },

  async saveBookmarks() {
    // Always persist to local storage (primary source of truth)
    try {
      this._localSaveInProgress = true;
      await chrome.storage.local.set({
        bookmarks: this.bookmarks,
        folders: this.folders,
      });
    } catch (error) {
      console.error("Error saving bookmarks to local storage:", error);
    } finally {
      this._localSaveInProgress = false;
    }
  },

  async addBookmark() {
    const title = document.getElementById("bookmarkTitle").value.trim();
    const rawUrl = document.getElementById("bookmarkUrl").value.trim();
    const url = this.normalizeUrl(rawUrl);

    if (!title || !url) return;

    const favicon = this.selectedFavicon || "";
    const faviconWasSelected = !!this.selectedFavicon;

    const now = new Date().toISOString();
    const bookmark = {
      id: Date.now(),
      title,
      url,
      favicon,
      dateAdded: now,
      folderId: null,
      lastUpdated: now,
      position: 0,
    };

    this.bookmarks.unshift(bookmark);
    // Update positions for all bookmarks
    this.bookmarks.forEach((b, i) => {
      b.position = i;
    });
    await this.saveBookmarks();
    this.renderQuickAccess();
    this.hideAddBookmarkModal();

    // Only update favicon async if no favicon was selected
    if (!faviconWasSelected) {
      this.updateFaviconAsync(bookmark.id, url);
    }

    // Enqueue sync
    enqueueSync("create_bookmark", {
      localId: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      favicon: bookmark.favicon || null,
      folderId: bookmark.folderId,
      position: 0,
    });
  },

  // Remove setView method since we only have favicon view now

  renderQuickAccess() {
    const quickAccessContainer = document.getElementById("quickAccess");

    // Always show main view bookmarks (those not in folders) in the main area
    // The openFolderId is only used for the folder modal, not the main view
    const visibleBookmarks = this.bookmarks.filter((b) => !b.folderId);

    // Render folder tiles (always show in main view)
    const folderTiles = this.folders
      .map((folder) => {
        const paddingClass = this.settings.showTitles
          ? "pt-2 px-4 pb-6"
          : "p-4";

        return `
            <div class="tile tile-3d tile-3d-folder w-24 h-24 relative rounded-lg cursor-pointer" 
                 data-folder-id="${folder.id}" 
                 draggable="false"
                 title="${folder.name}">
                <div class="tile-icon absolute inset-0 flex items-center justify-center ${paddingClass}">
                    <div class="w-full h-full bg-amber-500 rounded-lg flex items-center justify-center text-white">
                        <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
                        </svg>
                    </div>
                </div>
                ${
                  this.settings.showTitles
                    ? `
                <div class="tile-title absolute bottom-1 left-1 right-1">
                    <span class="text-xs text-gray-800 text-center block truncate">${folder.name}</span>
                </div>`
                    : ""
                }
            </div>
        `;
      })
      .join("");

    const bookmarkTiles = visibleBookmarks
      .map((bookmark) => {
        const paddingClass = this.settings.showTitles
          ? "pt-2 px-4 pb-6"
          : "p-4";

        return `
            <div class="tile tile-3d tile-3d-bookmark w-24 h-24 relative rounded-lg cursor-pointer" 
                 data-bookmark-id="${bookmark.id}" 
                 draggable="true"
                 title="${bookmark.title}">
                <a draggable="false" href="${bookmark.url}" aria-label="${bookmark.title}" class="absolute inset-0"></a>
                <div class="tile-icon absolute inset-0 flex items-center justify-center ${paddingClass}">
                    <img draggable="false" alt="" src="${bookmark.favicon}" class="w-full h-full rounded-lg object-cover bookmark-favicon" style="display: ${bookmark.favicon ? "block" : "none"};">
                    <div class="w-full h-full bg-blue-500 rounded-lg flex items-center justify-center text-white text-2xl font-bold bookmark-fallback" style="display: ${bookmark.favicon ? "none" : "block"};">
                        ${bookmark.title.charAt(0).toUpperCase()}
                    </div>
                </div>
                ${
                  this.settings.showTitles
                    ? `
                <div class="tile-title absolute bottom-1 left-1 right-1">
                    <span class="text-xs text-gray-800 text-center block truncate">${bookmark.title}</span>
                </div>`
                    : ""
                }
            </div>
        `;
      })
      .join("");

    const addButtonTile = `
            <div id="addBookmarkTile" class="tile tile-3d tile-3d-add w-24 h-24 relative rounded-lg cursor-pointer" 
                 title="Add New Bookmark">
                <div class="absolute inset-0 flex items-center justify-center">
                    <span class="text-custom-accent leading-none plus-icon">+</span>
                </div>
            </div>
        `;

    quickAccessContainer.innerHTML =
      folderTiles +
      bookmarkTiles +
      (this.settings.showAddButton ? addButtonTile : "");

    // Add event listeners for bookmark clicks and right-clicks
    visibleBookmarks.forEach((bookmark) => {
      const bookmarkElement = quickAccessContainer.querySelector(
        `[data-bookmark-id="${bookmark.id}"]`,
      );
      if (!bookmarkElement) return; // Skip if element not found

      // Left click - navigate to URL (only if not dragging)
      bookmarkElement.addEventListener("click", (e) => {
        if (e.button === 0 && !this.isDragging) {
          // Left click and not dragging
          window.location.href = bookmark.url;
        }
      });

      // Middle click - open in new background tab
      bookmarkElement.addEventListener("mousedown", (e) => {
        if (e.button === 1 && !this.isDragging) {
          // Middle click and not dragging
          e.preventDefault();
          chrome.tabs.create({ url: bookmark.url, active: false });
        }
      });

      // Right click - show context menu
      bookmarkElement.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.showContextMenu(e, bookmark.id);
      });

      // Drag start
      bookmarkElement.addEventListener("dragstart", (e) => {
        this.isDragging = true;
        this.draggedBookmarkId = bookmark.id;
        bookmarkElement.style.opacity = "0.5";
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/html", bookmarkElement.outerHTML);
      });

      // Drag end
      bookmarkElement.addEventListener("dragend", (e) => {
        this.isDragging = false;
        this.draggedBookmarkId = null;
        bookmarkElement.style.opacity = "1";
        this.removeDragIndicator();
      });

      // Drag over - show drop indicator
      bookmarkElement.addEventListener("dragover", (e) => {
        if (this.draggedBookmarkId && this.draggedBookmarkId !== bookmark.id) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          this.showDragIndicator(bookmarkElement, e);
        }
      });

      // Drop - reorder bookmarks
      bookmarkElement.addEventListener("drop", (e) => {
        if (this.draggedBookmarkId && this.draggedBookmarkId !== bookmark.id) {
          e.preventDefault();
          this.reorderBookmarks(this.draggedBookmarkId, bookmark.id, e);
          this.removeDragIndicator();
        }
      });

      // Handle favicon error - show fallback
      const faviconImg = bookmarkElement.querySelector(".bookmark-favicon");
      const fallbackDiv = bookmarkElement.querySelector(".bookmark-fallback");

      faviconImg.addEventListener("error", () => {
        faviconImg.style.display = "none";
        fallbackDiv.style.display = "block";
      });
    });

    // Add event listeners for folder tiles
    this.folders.forEach((folder) => {
      const folderElement = quickAccessContainer.querySelector(
        `[data-folder-id="${folder.id}"]`,
      );
      if (folderElement) {
        // Left click - open folder
        folderElement.addEventListener("click", (e) => {
          e.preventDefault();
          this.openFolder(folder.id);
        });

        // Right click - show folder context menu
        folderElement.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          this.showFolderContextMenu(e, folder.id);
        });

        // Drag over - accept bookmarks
        folderElement.addEventListener("dragover", (e) => {
          if (this.draggedBookmarkId && !this.openFolderId) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            folderElement.classList.add("bg-amber-200", "border-amber-400");
          }
        });

        // Drag leave - remove drop indicator
        folderElement.addEventListener("dragleave", (e) => {
          folderElement.classList.remove("bg-amber-200", "border-amber-400");
        });

        // Drop - move bookmark to folder
        folderElement.addEventListener("drop", (e) => {
          if (this.draggedBookmarkId && !this.openFolderId) {
            e.preventDefault();
            this.moveBookmarkToFolder(this.draggedBookmarkId, folder.id);
            folderElement.classList.remove("bg-amber-200", "border-amber-400");
          }
        });
      }
    });

    // Add event listener for the add bookmark tile
    const addBookmarkTile =
      quickAccessContainer.querySelector("#addBookmarkTile");
    if (addBookmarkTile) {
      addBookmarkTile.addEventListener("click", () => {
        this.showAddBookmarkModal();
      });
    }
  },

  async reorderBookmarks(draggedId, targetId, event) {
    const draggedIndex = this.bookmarks.findIndex((b) => b.id == draggedId);
    const targetIndex = this.bookmarks.findIndex((b) => b.id == targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Determine if we're inserting before or after the target
    const targetElement = document.querySelector(
      `[data-bookmark-id="${targetId}"]`,
    );
    const rect = targetElement.getBoundingClientRect();
    const midPoint = rect.left + rect.width / 2;
    const insertAfter = event.clientX > midPoint;

    // Remove the dragged bookmark from its current position
    const draggedBookmark = this.bookmarks.splice(draggedIndex, 1)[0];

    // Calculate new insert position
    let newIndex = targetIndex;
    if (draggedIndex < targetIndex) {
      newIndex = insertAfter ? targetIndex : targetIndex - 1;
    } else {
      newIndex = insertAfter ? targetIndex + 1 : targetIndex;
    }

    // Insert bookmark at new position
    this.bookmarks.splice(newIndex, 0, draggedBookmark);

    // Update positions and lastUpdated
    const now = new Date().toISOString();
    this.bookmarks.forEach((b, i) => {
      b.position = i;
      b.lastUpdated = now;
    });

    // Save and re-render
    await this.saveBookmarks();
    this.renderQuickAccess();

    // Enqueue reorder sync
    const reorderItems = this.bookmarks
      .filter((b) => !b.folderId)
      .map((b, i) => ({ id: b.id, position: i }));
    enqueueSync("reorder", { items: reorderItems });
  },

  async updateBookmark() {
    if (!this.currentBookmarkId) return;

    const title = document.getElementById("editBookmarkTitle").value.trim();
    const rawUrl = document.getElementById("editBookmarkUrl").value.trim();
    const url = this.normalizeUrl(rawUrl);

    if (!title || !url) return;

    const bookmarkIndex = this.bookmarks.findIndex(
      (b) => b.id === this.currentBookmarkId,
    );
    if (bookmarkIndex === -1) return;

    const oldUrl = this.bookmarks[bookmarkIndex].url;
    const bookmarkId = this.currentBookmarkId;

    // Apply locally first
    const updates = { title, url, lastUpdated: new Date().toISOString() };
    if (this.selectedEditFavicon !== null) {
      updates.favicon = this.selectedEditFavicon;
    }
    this.bookmarks[bookmarkIndex] = {
      ...this.bookmarks[bookmarkIndex],
      ...updates,
    };

    await this.saveBookmarks();
    this.renderQuickAccess();

    const editedBookmark = this.bookmarks[bookmarkIndex];
    if (
      this.openFolderId &&
      editedBookmark &&
      editedBookmark.folderId === this.openFolderId
    ) {
      this.renderFolderBookmarks(this.openFolderId);
    }

    this.hideEditBookmarkModal();

    if (url !== oldUrl && this.selectedEditFavicon === null) {
      this.updateFaviconAsync(bookmarkId, url);
    }

    // Enqueue sync
    enqueueSync("update_bookmark", {
      id: bookmarkId,
      updates: { title, url, favicon: updates.favicon },
    });
  },

  async duplicateBookmark() {
    if (!this.currentBookmarkId) return;

    const bookmark = this.bookmarks.find(
      (b) => b.id === this.currentBookmarkId,
    );
    if (!bookmark) return;

    const now = new Date().toISOString();
    const duplicatedBookmark = {
      ...bookmark,
      id: Date.now(),
      title: bookmark.title,
      dateAdded: now,
      lastUpdated: now,
    };

    const originalIndex = this.bookmarks.findIndex(
      (b) => b.id === this.currentBookmarkId,
    );
    this.bookmarks.splice(originalIndex + 1, 0, duplicatedBookmark);
    await this.saveBookmarks();
    this.renderQuickAccess();

    // Enqueue sync
    enqueueSync("create_bookmark", {
      localId: duplicatedBookmark.id,
      title: duplicatedBookmark.title,
      url: duplicatedBookmark.url,
      favicon: duplicatedBookmark.favicon || null,
      folderId: duplicatedBookmark.folderId,
      position: originalIndex + 1,
    });

    // If we're in a folder modal, also update the folder view
    if (this.openFolderId && bookmark.folderId === this.openFolderId) {
      this.renderFolderBookmarks(this.openFolderId);
    }

    this.currentBookmarkId = duplicatedBookmark.id;
    this.isDuplicateMode = true;
    this.duplicatedBookmarkId = duplicatedBookmark.id;
    this.showDuplicateBookmarkModal();

    setTimeout(() => {
      const titleInput = document.getElementById("editBookmarkTitle");
      titleInput.focus();
      titleInput.select();
    }, 100);
  },

  async copyBookmarkUrl() {
    if (!this.currentBookmarkId) return;

    const bookmark = this.bookmarks.find(
      (b) => b.id === this.currentBookmarkId,
    );
    if (!bookmark) return;

    try {
      await navigator.clipboard.writeText(bookmark.url);
      console.log("Bookmark URL copied to clipboard:", bookmark.url);
      this.showCopyNotification();
    } catch (error) {
      console.error("Failed to copy URL to clipboard:", error);

      // Fallback for browsers that don't support navigator.clipboard
      try {
        const textArea = document.createElement("textarea");
        textArea.value = bookmark.url;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        console.log(
          "Bookmark URL copied to clipboard (fallback method):",
          bookmark.url,
        );
        this.showCopyNotification();
      } catch (fallbackError) {
        console.error(
          "Failed to copy URL with fallback method:",
          fallbackError,
        );
        // Don't show notification if both methods failed
      }
    }
  },

  async deleteBookmark() {
    // This method is now deprecated in favor of showDeleteConfirmation
    // Keeping for backward compatibility but it won't be used
    if (!this.currentBookmarkId) return;

    if (confirm("Are you sure you want to delete this bookmark?")) {
      this.bookmarks = this.bookmarks.filter(
        (b) => b.id !== this.currentBookmarkId,
      );
      await this.saveBookmarks();
      this.renderQuickAccess();
    }
  },

  async deleteBookmarkById(bookmarkId) {
    this.bookmarks = this.bookmarks.filter((b) => b.id !== bookmarkId);
    await this.saveBookmarks();
    await this.cleanupUnusedFavicons();

    // Enqueue sync
    enqueueSync("delete_bookmark", { id: bookmarkId });
  },

  async confirmDeleteBookmark() {
    // Handle both bookmark and folder deletion
    if (this.currentBookmarkId) {
      // Delete bookmark
      this.removeDeleteHighlight();

      const deletedBookmark = this.bookmarks.find(
        (b) => b.id === this.currentBookmarkId,
      );
      const deletedId = this.currentBookmarkId;

      this.bookmarks = this.bookmarks.filter(
        (b) => b.id !== this.currentBookmarkId,
      );
      await this.saveBookmarks();
      this.renderQuickAccess();
      await this.cleanupUnusedFavicons();

      if (
        this.openFolderId &&
        deletedBookmark &&
        deletedBookmark.folderId === this.openFolderId
      ) {
        this.renderFolderBookmarks(this.openFolderId);
      }

      this.currentBookmarkId = null;

      // Enqueue sync
      enqueueSync("delete_bookmark", { id: deletedId });
    } else if (this.currentFolderId) {
      // Delete folder
      this.removeFolderDeleteHighlight();

      const deletedFolderId = this.currentFolderId;

      // Move all bookmarks in this folder back to main view
      this.bookmarks.forEach((bookmark) => {
        if (bookmark.folderId === this.currentFolderId) {
          bookmark.folderId = null;
        }
      });

      if (this.openFolderId === this.currentFolderId) {
        this.closeFolderModal();
      }

      this.folders = this.folders.filter((f) => f.id !== this.currentFolderId);

      await this.saveBookmarks();
      this.renderQuickAccess();
      this.currentFolderId = null;

      // Enqueue sync
      enqueueSync("delete_folder", { id: deletedFolderId });
    }
  },
};
