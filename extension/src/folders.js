// Folder management: CRUD, modal, rendering, drag & drop
import { enqueueSync } from "./sync-queue.js";

export const folderMethods = {
  openFolder(folderId) {
    const folder = this.folders.find((f) => f.id === folderId);
    if (!folder) return;

    document.getElementById("folderModalTitle").textContent = folder.name;
    document.getElementById("folderModal").classList.remove("hidden");

    // Store the current open folder ID
    this.openFolderId = folderId;

    // Set up drag and drop for removing bookmarks from folder
    this.setupFolderDragAndDrop();

    // Render bookmarks in this folder
    this.renderFolderBookmarks(folderId);
  },

  closeFolderModal() {
    document.getElementById("folderModal").classList.add("hidden");
    this.openFolderId = null;
    this.cleanupFolderDragAndDrop();
  },

  renderFolderBookmarks(folderId) {
    const folderBookmarksContainer = document.getElementById("folderBookmarks");
    const folderBookmarks = this.bookmarks.filter(
      (b) => b.folderId === folderId,
    );

    if (folderBookmarks.length === 0) {
      folderBookmarksContainer.innerHTML = `
                <div class="text-center text-gray-500 w-full py-8">
                    <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
                    </svg>
                    <p class="text-lg font-medium">This folder is empty</p>
                    <p class="text-sm">Drag bookmarks here to organize them</p>
                </div>
            `;
      return;
    }

    const bookmarkTiles = folderBookmarks
      .map((bookmark) => {
        const paddingClass = this.settings.showTitles
          ? "pt-2 px-4 pb-6"
          : "p-4";

        return `
            <div class="tile w-24 h-24 relative bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-200 hover:shadow-md transition-all duration-200 cursor-pointer" 
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

    folderBookmarksContainer.innerHTML = bookmarkTiles;

    // Add event listeners for bookmarks in folder
    folderBookmarks.forEach((bookmark) => {
      const bookmarkElement = folderBookmarksContainer.querySelector(
        `[data-bookmark-id="${bookmark.id}"]`,
      );

      // Left click - navigate to URL
      bookmarkElement.addEventListener("click", (e) => {
        if (e.button === 0 && !this.isDragging) {
          window.location.href = bookmark.url;
        }
      });

      // Middle click - open in new background tab
      bookmarkElement.addEventListener("mousedown", (e) => {
        if (e.button === 1 && !this.isDragging) {
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
        this.removeFolderDragIndicator();
      });

      // Handle favicon error
      const faviconImg = bookmarkElement.querySelector(".bookmark-favicon");
      const fallbackDiv = bookmarkElement.querySelector(".bookmark-fallback");

      faviconImg.addEventListener("error", () => {
        faviconImg.style.display = "none";
        fallbackDiv.style.display = "block";
      });
    });
  },

  async moveBookmarkToFolder(bookmarkId, folderId) {
    const bookmark = this.bookmarks.find((b) => b.id === bookmarkId);
    if (!bookmark) return;

    bookmark.folderId = folderId;
    bookmark.lastUpdated = new Date().toISOString();
    await this.saveBookmarks();
    this.renderQuickAccess();

    // Enqueue sync
    enqueueSync("update_bookmark", { id: bookmarkId, updates: { folderId } });
  },

  async createFolder(name) {
    const now = new Date().toISOString();
    const folder = {
      id: Date.now(),
      name: name,
      dateCreated: now,
      lastUpdated: now,
      position: this.folders.length,
    };

    this.folders.push(folder);
    await this.saveBookmarks();
    this.renderQuickAccess();

    // Enqueue sync
    enqueueSync("create_folder", {
      localId: folder.id,
      name: folder.name,
      position: folder.position,
    });

    return folder;
  },

  showCreateFolderModal() {
    document.getElementById("createFolderModal").classList.remove("hidden");
    document.getElementById("folderName").focus();
  },

  hideCreateFolderModal() {
    document.getElementById("createFolderModal").classList.add("hidden");
    document.getElementById("createFolderForm").reset();
  },

  async createFolderFromModal() {
    const folderName = document.getElementById("folderName").value.trim();

    if (!folderName) return;

    await this.createFolder(folderName);
    this.hideCreateFolderModal();
  },

  showFolderContextMenu(event, folderId) {
    console.log("showFolderContextMenu called with folderId:", folderId);
    this.currentFolderId = folderId;
    const contextMenu = document.getElementById("contextMenu");

    // Hide bookmark menu items and show folder menu items
    document.getElementById("editBookmark").classList.add("hidden");
    document.getElementById("duplicateBookmark").classList.add("hidden");
    document.getElementById("copyBookmarkUrl").classList.add("hidden");
    document.getElementById("deleteBookmark").classList.add("hidden");
    document.getElementById("renameFolder").classList.remove("hidden");
    document.getElementById("deleteFolder").classList.remove("hidden");

    // Set z-index based on open modals
    this.setElementZIndex(contextMenu);

    // Note: Dynamic positioning requires style attributes since Tailwind can't handle pixel-perfect dynamic positioning
    contextMenu.style.left = `${event.pageX}px`;
    contextMenu.style.top = `${event.pageY}px`;
    contextMenu.classList.remove("hidden");

    // Adjust position if menu goes off screen
    const rect = contextMenu.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    if (rect.right > windowWidth) {
      contextMenu.style.left = `${event.pageX - rect.width}px`;
    }
    if (rect.bottom > windowHeight) {
      contextMenu.style.top = `${event.pageY - rect.height}px`;
    }
  },

  showRenameFolderModal() {
    const folder = this.folders.find((f) => f.id === this.currentFolderId);
    if (!folder) return;

    document.getElementById("renameFolderName").value = folder.name;
    document.getElementById("renameFolderModal").classList.remove("hidden");
    document.getElementById("renameFolderName").focus();
    document.getElementById("renameFolderName").select();
  },

  hideRenameFolderModal() {
    document.getElementById("renameFolderModal").classList.add("hidden");
    document.getElementById("renameFolderForm").reset();
  },

  async renameFolderFromModal() {
    const newName = document.getElementById("renameFolderName").value.trim();
    if (!newName || !this.currentFolderId) return;

    const folder = this.folders.find((f) => f.id === this.currentFolderId);
    if (!folder) return;

    const folderId = this.currentFolderId;
    folder.name = newName;
    folder.lastUpdated = new Date().toISOString();
    await this.saveBookmarks();
    this.renderQuickAccess();

    // Update folder modal title if the folder modal is open for this folder
    if (this.openFolderId === this.currentFolderId) {
      document.getElementById("folderModalTitle").textContent = newName;
    }

    this.hideRenameFolderModal();
    this.currentFolderId = null;

    // Enqueue sync
    enqueueSync("update_folder", { id: folderId, updates: { name: newName } });
  },

  async deleteFolderWithBookmarks() {
    if (!this.currentFolderId) return;

    const folder = this.folders.find((f) => f.id === this.currentFolderId);
    if (!folder) return;

    const deletedFolderId = this.currentFolderId;

    // Move all bookmarks in this folder back to main view
    this.bookmarks.forEach((bookmark) => {
      if (bookmark.folderId === this.currentFolderId) {
        bookmark.folderId = null; // Remove from folder
      }
    });

    // Remove the folder
    this.folders = this.folders.filter((f) => f.id !== this.currentFolderId);

    // Save changes
    await this.saveBookmarks();
    this.renderQuickAccess();

    // Close folder modal if this folder was open
    if (this.openFolderId === this.currentFolderId) {
      this.closeFolderModal();
    }

    this.currentFolderId = null;

    // Enqueue sync
    enqueueSync("delete_folder", { id: deletedFolderId });
  },

  showFolderDeleteConfirmation(event) {
    if (!this.currentFolderId) return;

    const popup = document.getElementById("deleteConfirmPopup");
    const folder = this.folders.find((f) => f.id === this.currentFolderId);

    if (!folder) return;

    // Highlight the folder being deleted
    this.highlightFolderForDeletion(this.currentFolderId);

    // Update the confirmation message with the folder name
    const messageElement = document.getElementById("deleteConfirmMessage");
    const bookmarkCount = this.bookmarks.filter(
      (b) => b.folderId === this.currentFolderId,
    ).length;
    const bookmarkText = bookmarkCount === 1 ? "bookmark" : "bookmarks";
    messageElement.innerHTML = `Are you sure you want to delete folder <strong>${folder.name}</strong>?<br><small class="text-gray-500">${bookmarkCount} ${bookmarkText} will be moved to the main view.</small>`;

    // Position the popup near the folder being deleted
    const folderElement = document.querySelector(
      `[data-folder-id="${this.currentFolderId}"]`,
    );
    if (folderElement) {
      const rect = folderElement.getBoundingClientRect();
      const popupRect = popup.getBoundingClientRect();

      // Position popup to the right of the folder, or left if not enough space
      let left = rect.right + 10;
      let top = rect.top;

      // Check if popup would go off screen horizontally
      if (left + 256 > window.innerWidth) {
        // 256px is popup width (w-64)
        left = rect.left - 256 - 10;
      }

      // Check if popup would go off screen vertically
      if (top + 100 > window.innerHeight) {
        // Approximate popup height
        top = rect.bottom - 100;
      }

      // Ensure popup doesn't go above viewport
      if (top < 0) {
        top = 10;
      }

      // Note: Dynamic positioning requires style attributes since Tailwind can't handle pixel-perfect dynamic positioning
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    }

    // Set z-index based on open modals
    this.setElementZIndex(popup);

    popup.classList.remove("hidden");
  },

  highlightFolderForDeletion(folderId) {
    // Remove any existing highlights
    this.removeBookmarkHighlight();
    this.removeDeleteHighlight();
    this.removeFolderDeleteHighlight();

    // Add delete highlight to the current folder
    const folderElement = document.querySelector(
      `[data-folder-id="${folderId}"]`,
    );
    if (folderElement) {
      folderElement.classList.add("folder-delete-highlighted");
    }
  },

  removeFolderDeleteHighlight() {
    const deleteHighlightedElement = document.querySelector(
      ".folder-delete-highlighted",
    );
    if (deleteHighlightedElement) {
      deleteHighlightedElement.classList.remove("folder-delete-highlighted");
    }
  },

  setupFolderDragAndDrop() {
    const folderModal = document.getElementById("folderModal");
    const modalBackdrop = folderModal; // The backdrop is the modal itself
    let dragCounter = 0;

    // Store event handlers for cleanup
    this.folderDragHandlers = {};

    // Handle drag enter on the backdrop (outside the modal content)
    this.folderDragHandlers.dragenter = (e) => {
      // Only handle if dragging from within folder and target is backdrop
      if (this.draggedBookmarkId && e.target === modalBackdrop) {
        e.preventDefault();
        dragCounter++;
        this.showFolderDragIndicator();
      }
    };

    // Handle drag over
    this.folderDragHandlers.dragover = (e) => {
      if (this.draggedBookmarkId && e.target === modalBackdrop) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }
    };

    // Handle drag leave
    this.folderDragHandlers.dragleave = (e) => {
      if (this.draggedBookmarkId && e.target === modalBackdrop) {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) {
          this.removeFolderDragIndicator();
        }
      }
    };

    // Handle drop on backdrop
    this.folderDragHandlers.drop = (e) => {
      if (this.draggedBookmarkId && e.target === modalBackdrop) {
        e.preventDefault();
        dragCounter = 0;
        this.removeFolderDragIndicator();
        this.removeBookmarkFromFolder(this.draggedBookmarkId);
      }
    };

    // Add event listeners
    modalBackdrop.addEventListener(
      "dragenter",
      this.folderDragHandlers.dragenter,
    );
    modalBackdrop.addEventListener(
      "dragover",
      this.folderDragHandlers.dragover,
    );
    modalBackdrop.addEventListener(
      "dragleave",
      this.folderDragHandlers.dragleave,
    );
    modalBackdrop.addEventListener("drop", this.folderDragHandlers.drop);
  },

  cleanupFolderDragAndDrop() {
    if (!this.folderDragHandlers) return;

    const folderModal = document.getElementById("folderModal");

    // Remove all event listeners
    folderModal.removeEventListener(
      "dragenter",
      this.folderDragHandlers.dragenter,
    );
    folderModal.removeEventListener(
      "dragover",
      this.folderDragHandlers.dragover,
    );
    folderModal.removeEventListener(
      "dragleave",
      this.folderDragHandlers.dragleave,
    );
    folderModal.removeEventListener("drop", this.folderDragHandlers.drop);

    this.folderDragHandlers = null;
    this.removeFolderDragIndicator();
  },

  showFolderDragIndicator() {
    const folderModal = document.getElementById("folderModal");
    folderModal.classList.add("bg-blue-100/20");

    // Add visual indicator
    if (!document.getElementById("folderDragIndicator")) {
      const indicator = document.createElement("div");
      indicator.id = "folderDragIndicator";
      indicator.className =
        "fixed inset-0 pointer-events-none flex items-center justify-center z-50";
      indicator.innerHTML = `
                <div class="bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg text-lg font-semibold">
                    Drop here to remove from folder
                </div>
            `;
      document.body.appendChild(indicator);
    }
  },

  removeFolderDragIndicator() {
    const folderModal = document.getElementById("folderModal");
    folderModal.classList.remove("bg-blue-100/20");

    const indicator = document.getElementById("folderDragIndicator");
    if (indicator) {
      indicator.remove();
    }
  },

  async removeBookmarkFromFolder(bookmarkId) {
    const bookmark = this.bookmarks.find((b) => b.id === bookmarkId);
    if (!bookmark) return;

    // Remove from folder (set folderId to null)
    bookmark.folderId = null;
    bookmark.lastUpdated = new Date().toISOString();
    await this.saveBookmarks();

    // Re-render both the folder contents and main view
    this.renderFolderBookmarks(this.openFolderId);
    this.renderQuickAccess();

    // Enqueue sync
    enqueueSync("update_bookmark", {
      id: bookmarkId,
      updates: { folderId: null },
    });
  },
};
