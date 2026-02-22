// UI: modals, context menus, highlights, notifications, drag indicators, z-index

export const uiMethods = {
  showAddBookmarkModal() {
    document.getElementById("addBookmarkModal").classList.remove("hidden");

    // Show favicon selection UI immediately with empty state
    const faviconSelection = document.getElementById("faviconSelection");
    const faviconOptions = document.getElementById("faviconOptions");
    faviconSelection.classList.remove("hidden");
    faviconOptions.innerHTML =
      '<div class="text-sm text-gray-500 col-span-6 text-center">Enter a URL to load favicon options</div>';

    document.getElementById("bookmarkTitle").focus();
  },

  hideAddBookmarkModal() {
    document.getElementById("addBookmarkModal").classList.add("hidden");
    document.getElementById("addBookmarkForm").reset();
    document.getElementById("faviconSelection").classList.add("hidden");
    this.selectedFavicon = null;
    if (this.faviconDebounceTimer) {
      clearTimeout(this.faviconDebounceTimer);
    }
  },

  showEditBookmarkModal() {
    console.log(
      "showEditBookmarkModal called, currentBookmarkId:",
      this.currentBookmarkId,
    );
    const bookmark = this.bookmarks.find(
      (b) => b.id === this.currentBookmarkId,
    );
    console.log("Found bookmark:", bookmark);
    if (!bookmark) {
      console.log("No bookmark found, exiting");
      return;
    }

    // Highlight the bookmark being edited
    this.highlightBookmarkBeingEdited(this.currentBookmarkId);

    const modal = document.getElementById("editBookmarkModal");
    const modalTitle = modal.querySelector("h3");
    modalTitle.textContent = "Edit Bookmark";

    document.getElementById("editBookmarkTitle").value = bookmark.title;
    document.getElementById("editBookmarkUrl").value = bookmark.url;

    // Set z-index based on open modals
    this.setElementZIndex(modal);

    // Position the modal near the bookmark being edited
    this.positionEditModal(modal);

    // Show favicon selection UI immediately
    const faviconSelection = document.getElementById("editFaviconSelection");
    const faviconOptions = document.getElementById("editFaviconOptions");
    faviconSelection.classList.remove("hidden");
    faviconOptions.innerHTML =
      '<div class="text-sm text-gray-500 col-span-6 text-center">Loading favicon options...</div>';

    // Trigger favicon loading for the current URL
    this.handleEditUrlInputChange(bookmark.url);

    modal.classList.remove("hidden");
    document.getElementById("editBookmarkTitle").focus();
  },

  showDuplicateBookmarkModal() {
    console.log(
      "showDuplicateBookmarkModal called, currentBookmarkId:",
      this.currentBookmarkId,
    );
    const bookmark = this.bookmarks.find(
      (b) => b.id === this.currentBookmarkId,
    );
    console.log("Found bookmark:", bookmark);
    if (!bookmark) {
      console.log("No bookmark found, exiting");
      return;
    }

    // Highlight the bookmark being duplicated
    this.highlightBookmarkBeingEdited(this.currentBookmarkId);

    const modal = document.getElementById("editBookmarkModal");
    const modalTitle = modal.querySelector("h3");
    modalTitle.textContent = "Duplicate Bookmark";

    document.getElementById("editBookmarkTitle").value = bookmark.title;
    document.getElementById("editBookmarkUrl").value = bookmark.url;

    // Set z-index based on open modals
    this.setElementZIndex(modal);

    // Position the modal near the bookmark being duplicated
    this.positionEditModal(modal);

    modal.classList.remove("hidden");
    document.getElementById("editBookmarkTitle").focus();
  },

  async hideEditBookmarkModal() {
    // Remove highlighting
    this.removeBookmarkHighlight();

    const modal = document.getElementById("editBookmarkModal");
    modal.classList.add("hidden");
    // Reset z-index to default
    modal.classList.remove("z-70", "z-80", "z-90");
    modal.classList.add("z-60");
    document.getElementById("editBookmarkForm").reset();
    document.getElementById("editFaviconSelection").classList.add("hidden");
    this.selectedEditFavicon = null;
    this.currentBookmarkId = null;
    if (this.editFaviconDebounceTimer) {
      clearTimeout(this.editFaviconDebounceTimer);
    }
    this.isDuplicateMode = false;
    this.duplicatedBookmarkId = null;
  },

  async cancelEditBookmarkModal() {
    // If we're in duplicate mode and cancelling, delete the duplicate
    if (this.isDuplicateMode && this.duplicatedBookmarkId) {
      await this.deleteBookmarkById(this.duplicatedBookmarkId);
      this.renderQuickAccess();
    }

    this.hideEditBookmarkModal();
  },

  // Helper function to set appropriate z-index class based on open modals
  setElementZIndex(element) {
    // Remove all possible z-index classes first
    element.classList.remove("z-50", "z-60", "z-70", "z-80", "z-90");

    // Check which modals are open to determine appropriate z-index
    const modals = [
      { id: "addBookmarkModal", zIndex: 50 },
      { id: "editBookmarkModal", zIndex: 60 },
      { id: "deleteConfirmPopup", zIndex: 50 },
      { id: "createFolderModal", zIndex: 50 },
      { id: "renameFolderModal", zIndex: 50 },
      { id: "folderModal", zIndex: 50 },
      { id: "settingsModal", zIndex: 50 },
    ];

    let highestModalZIndex = 0;

    for (const modal of modals) {
      const modalElement = document.getElementById(modal.id);
      if (modalElement && !modalElement.classList.contains("hidden")) {
        highestModalZIndex = Math.max(highestModalZIndex, modal.zIndex);
      }
    }

    // Set appropriate z-index class based on highest modal
    if (highestModalZIndex >= 60) {
      element.classList.add("z-80"); // Above edit modals
    } else if (highestModalZIndex >= 50) {
      element.classList.add("z-70"); // Above regular modals
    } else {
      element.classList.add("z-60"); // Default high level
    }
  },

  showContextMenu(event, bookmarkId) {
    console.log("showContextMenu called with bookmarkId:", bookmarkId);
    this.currentBookmarkId = bookmarkId;
    const contextMenu = document.getElementById("contextMenu");

    // Show bookmark menu items and hide folder menu items
    document.getElementById("editBookmark").classList.remove("hidden");
    document.getElementById("duplicateBookmark").classList.remove("hidden");
    document.getElementById("copyBookmarkUrl").classList.remove("hidden");
    document.getElementById("deleteBookmark").classList.remove("hidden");
    document.getElementById("renameFolder").classList.add("hidden");
    document.getElementById("deleteFolder").classList.add("hidden");

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

  hideContextMenu() {
    const contextMenu = document.getElementById("contextMenu");
    contextMenu.classList.add("hidden");
    // Reset z-index to default
    contextMenu.classList.remove("z-70", "z-80", "z-90");
    contextMenu.classList.add("z-60");
    // Don't clear currentBookmarkId or currentFolderId here as they're needed for edit/delete operations
  },

  showDeleteConfirmation(event) {
    if (!this.currentBookmarkId) return;

    const popup = document.getElementById("deleteConfirmPopup");
    const bookmark = this.bookmarks.find(
      (b) => b.id === this.currentBookmarkId,
    );

    if (!bookmark) return;

    // Highlight the bookmark being deleted
    this.highlightBookmarkForDeletion(this.currentBookmarkId);

    // Update the confirmation message with the bookmark title
    const messageElement = document.getElementById("deleteConfirmMessage");
    messageElement.innerHTML = `Are you sure you want to delete <strong>${bookmark.title}</strong>?`;

    // Position the popup near the bookmark being deleted
    const bookmarkElement = document.querySelector(
      `[data-bookmark-id="${this.currentBookmarkId}"]`,
    );
    if (bookmarkElement) {
      const rect = bookmarkElement.getBoundingClientRect();
      const popupRect = popup.getBoundingClientRect();

      // Position popup to the right of the bookmark, or left if not enough space
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

  hideDeleteConfirmation() {
    // Remove delete highlighting for both bookmarks and folders
    this.removeDeleteHighlight();
    this.removeFolderDeleteHighlight();
    const popup = document.getElementById("deleteConfirmPopup");
    popup.classList.add("hidden");
    // Reset z-index to default
    popup.classList.remove("z-60", "z-70", "z-80", "z-90");
    popup.classList.add("z-50");
  },

  showCopyNotification() {
    const notification = document.getElementById("copyNotification");
    const notificationContent = notification.querySelector("div");

    // Show the notification container
    notification.classList.remove("hidden");

    // Animate the notification content sliding in from the right
    setTimeout(() => {
      notificationContent.classList.remove("translate-x-full");
      notificationContent.classList.add("translate-x-0");
    }, 10);

    // Hide the notification after 2 seconds
    setTimeout(() => {
      notificationContent.classList.remove("translate-x-0");
      notificationContent.classList.add("translate-x-full");

      // Hide the container after animation completes
      setTimeout(() => {
        notification.classList.add("hidden");
      }, 300);
    }, 2000);
  },

  // Bookmark highlighting methods
  highlightBookmarkBeingEdited(bookmarkId) {
    // Remove any existing highlights
    this.removeBookmarkHighlight();

    // Add highlight to the current bookmark
    const bookmarkElement = document.querySelector(
      `[data-bookmark-id="${bookmarkId}"]`,
    );
    if (bookmarkElement) {
      bookmarkElement.classList.add("tile-highlighted");
    }
  },

  removeBookmarkHighlight() {
    const highlightedElement = document.querySelector(".tile-highlighted");
    if (highlightedElement) {
      highlightedElement.classList.remove("tile-highlighted");
    }
  },

  // Delete highlighting methods
  highlightBookmarkForDeletion(bookmarkId) {
    // Remove any existing highlights
    this.removeBookmarkHighlight();
    this.removeDeleteHighlight();

    // Add delete highlight to the current bookmark
    const bookmarkElement = document.querySelector(
      `[data-bookmark-id="${bookmarkId}"]`,
    );
    if (bookmarkElement) {
      bookmarkElement.classList.add("tile-delete-highlighted");
    }
  },

  removeDeleteHighlight() {
    const deleteHighlightedElement = document.querySelector(
      ".tile-delete-highlighted",
    );
    if (deleteHighlightedElement) {
      deleteHighlightedElement.classList.remove("tile-delete-highlighted");
    }
  },

  // Position edit modal near the bookmark being edited
  positionEditModal(modal) {
    if (!this.currentBookmarkId) return;

    const bookmarkElement = document.querySelector(
      `[data-bookmark-id="${this.currentBookmarkId}"]`,
    );
    if (!bookmarkElement) return;

    const rect = bookmarkElement.getBoundingClientRect();

    // Position modal to the right of the bookmark, or left if not enough space
    let left = rect.right + 10;
    let top = rect.top;

    // Check if modal would go off screen horizontally (384px is modal width - w-96)
    if (left + 384 > window.innerWidth) {
      left = rect.left - 384 - 10;
    }

    // Check if modal would go off screen vertically (approximate modal height ~300px)
    if (top + 300 > window.innerHeight) {
      top = rect.bottom - 300;
    }

    // Ensure modal doesn't go above viewport
    if (top < 0) {
      top = 10;
    }

    // Ensure modal doesn't go too far left
    if (left < 10) {
      left = 10;
    }

    // Note: Dynamic positioning requires style attributes since Tailwind can't handle pixel-perfect dynamic positioning
    modal.style.left = `${left}px`;
    modal.style.top = `${top}px`;
  },

  showDragIndicator(targetElement, event) {
    this.removeDragIndicator();

    const rect = targetElement.getBoundingClientRect();
    const midPoint = rect.left + rect.width / 2;
    const isRightSide = event.clientX > midPoint;

    const indicator = document.createElement("div");
    indicator.id = "dragIndicator";
    indicator.className =
      "absolute top-0 bottom-0 w-1 bg-blue-500 z-50 rounded-full";
    indicator.style.height = `${rect.height}px`;

    if (isRightSide) {
      indicator.style.left = `${rect.right}px`;
    } else {
      indicator.style.left = `${rect.left - 4}px`;
    }

    indicator.style.top = `${rect.top}px`;
    document.body.appendChild(indicator);
  },

  removeDragIndicator() {
    const indicator = document.getElementById("dragIndicator");
    if (indicator) {
      indicator.remove();
    }
  },
};
