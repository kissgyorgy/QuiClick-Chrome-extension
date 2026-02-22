// Settings, import/export
import { enqueueSync } from "./sync-queue.js";

export const settingsMethods = {
  async loadSettings() {
    try {
      const data = await chrome.storage.local.get(["bookmarkSettings"]);
      if (data.bookmarkSettings) {
        this.settings = { ...this.settings, ...data.bookmarkSettings };
      }
    } catch (error) {
      console.warn("Failed to load settings:", error);
    }
  },

  async saveSettingsToStorage() {
    try {
      this._localSaveInProgress = true;
      await chrome.storage.local.set({
        bookmarkSettings: this.settings,
      });
    } catch (error) {
      console.warn("Failed to save settings:", error);
    } finally {
      this._localSaveInProgress = false;
    }
  },

  showSettingsModal() {
    const modal = document.getElementById("settingsModal");

    // Load current settings into the modal
    this.loadCurrentSettingsIntoForm();

    // Update auth UI and sync buttons visibility
    this.updateAuthUI();

    // Position modal at bottom right with specific margins
    modal.classList.remove("hidden");
    modal.classList.add("right-6", "bottom-20", "mr-8", "-mb-4");
  },

  hideSettingsModal() {
    const modal = document.getElementById("settingsModal");
    modal.classList.add("hidden");
    modal.classList.remove("right-6", "bottom-20", "mr-8", "-mb-4");
    // Reset form to current settings
    this.loadCurrentSettingsIntoForm();
  },

  loadCurrentSettingsIntoForm() {
    const showTitlesToggle = document.getElementById("showTitles");
    const showAddButtonToggle = document.getElementById("showAddButton");
    const tilesPerRowSlider = document.getElementById("tilesPerRow");
    const tilesPerRowValue = document.getElementById("tilesPerRowValue");
    const tileGapSlider = document.getElementById("tileGap");
    const tileGapValue = document.getElementById("tileGapValue");

    showTitlesToggle.checked = this.settings.showTitles;
    this.updateToggleVisual(showTitlesToggle);

    showAddButtonToggle.checked = this.settings.showAddButton;
    this.updateToggleVisual(showAddButtonToggle);

    tilesPerRowSlider.value = this.settings.tilesPerRow;
    tilesPerRowValue.textContent = this.settings.tilesPerRow;

    tileGapSlider.value = this.settings.tileGap;
    tileGapValue.textContent = this.settings.tileGap;
  },

  async saveSettings() {
    // Add lastUpdated and save to local storage
    this.settings.lastUpdated = new Date().toISOString();
    await this.saveSettingsToStorage();

    // Enqueue sync
    enqueueSync("update_settings", { settings: this.settings });
  },

  updateTilesPerRowCSS(tilesPerRow) {
    const quickAccess = document.getElementById("quickAccess");
    const folderBookmarks = document.getElementById("folderBookmarks");

    // Map tiles per row to appropriate max-width classes - updated for proper gap spacing
    // Each tile is 96px (w-24), gaps are 16px default, so: tiles*96 + (tiles-1)*16
    const maxWidthClasses = {
      3: "max-w-sm", // 3*96 + 2*16 = 320px (~20rem)
      4: "max-w-md", // 4*96 + 3*16 = 432px (~27rem)
      5: "max-w-xl", // 5*96 + 4*16 = 544px (~34rem)
      6: "max-w-2xl", // 6*96 + 5*16 = 656px (~41rem)
      7: "max-w-3xl", // 7*96 + 6*16 = 768px (~48rem)
      8: "max-w-4xl", // 8*96 + 7*16 = 880px (~55rem)
      9: "max-w-5xl", // 9*96 + 8*16 = 992px (~62rem)
      10: "max-w-6xl", // 10*96 + 9*16 = 1104px (~69rem)
      11: "max-w-7xl", // 11*96 + 10*16 = 1216px (~76rem)
      12: "max-w-7xl", // 12*96 + 11*16 = 1328px (~83rem) - use max available
    };

    // Clear all classes and rebuild with only what we need
    quickAccess.className = "";

    // Add new grid class based on tilesPerRow value - explicit mapping for Tailwind compilation
    const gridClasses = {
      3: "grid-cols-3",
      4: "grid-cols-4",
      5: "grid-cols-5",
      6: "grid-cols-6",
      7: "grid-cols-7",
      8: "grid-cols-8",
      9: "grid-cols-9",
      10: "grid-cols-10",
      11: "grid-cols-11",
      12: "grid-cols-12",
    };
    const gridClass = gridClasses[tilesPerRow] || "grid-cols-8";
    const maxWidthClass = maxWidthClasses[tilesPerRow];

    // Get gap classes based on setting - separate column and row gaps for better spacing
    const gapMapping = {
      0: { x: "gap-x-0", y: "gap-y-0" }, // 0 → no gaps
      1: { x: "gap-x-4", y: "gap-y-2" }, // 1 → 16px columns, 8px rows
      2: { x: "gap-x-8", y: "gap-y-4" }, // 2 → 32px columns, 16px rows
      3: { x: "gap-x-12", y: "gap-y-6" }, // 3 → 48px columns, 24px rows
      4: { x: "gap-x-16", y: "gap-y-8" }, // 4 → 64px columns, 32px rows
      5: { x: "gap-x-20", y: "gap-y-10" }, // 5 → 80px columns, 40px rows
      6: { x: "gap-x-24", y: "gap-y-12" }, // 6 → 96px columns, 48px rows
      7: { x: "gap-x-28", y: "gap-y-14" }, // 7 → 112px columns, 56px rows
      8: { x: "gap-x-32", y: "gap-y-16" }, // 8 → 128px columns, 64px rows
      9: { x: "gap-x-36", y: "gap-y-18" }, // 9 → 144px columns, 72px rows
      10: { x: "gap-x-40", y: "gap-y-20" }, // 10 → 160px columns, 80px rows
    };
    const gaps = gapMapping[this.settings.tileGap] || {
      x: "gap-x-4",
      y: "gap-y-2",
    };

    // Update quickAccess layout - clean slate with only necessary classes
    quickAccess.classList.add(
      "grid",
      gridClass,
      gaps.x,
      gaps.y,
      maxWidthClass,
      "mx-auto",
      "place-items-center",
    );

    // Update folderBookmarks layout if it exists
    if (folderBookmarks) {
      folderBookmarks.className = "";
      folderBookmarks.classList.add(
        "grid",
        gridClass,
        gaps.x,
        gaps.y,
        maxWidthClass,
        "mx-auto",
        "place-items-center",
      );
    }
  },

  updateToggleVisual(toggle) {
    const toggleBg = toggle.parentElement.querySelector(".toggle-bg");
    const toggleDot = toggle.parentElement.querySelector(".toggle-dot");

    if (toggle.checked) {
      toggleBg.classList.remove("bg-gray-200");
      toggleBg.classList.add("bg-blue-500");
      toggleDot.style.transform = "translateX(16px)";
    } else {
      toggleBg.classList.remove("bg-blue-500");
      toggleBg.classList.add("bg-gray-200");
      toggleDot.style.transform = "translateX(0)";
    }
  },

  async exportAllData() {
    try {
      // Gather all data from local storage
      const data = {
        bookmarks: this.bookmarks,
        folders: this.folders,
        settings: this.settings,
        exportDate: new Date().toISOString(),
        version: "1.0",
      };

      // Create blob and download
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `youtab-bookmarks-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log("Export completed successfully");
    } catch (error) {
      console.error("Export failed:", error);
      alert("Export failed. Please try again.");
    }
  },

  async importAllData() {
    try {
      // Create file input element
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".json";
      fileInput.style.display = "none";
      document.body.appendChild(fileInput);

      // Handle file selection
      fileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
          const fileContent = await file.text();
          const importData = JSON.parse(fileContent);

          // Validate import data structure
          if (!this.validateImportData(importData)) {
            throw new Error("Invalid import file format");
          }

          // Show import confirmation modal
          this.showImportConfirmModal(file.name, importData, fileInput);
        } catch (error) {
          console.error("Import failed:", error);
          alert(`Import failed: ${error.message}`);
          // Clean up on error
          this.cleanupFileInput(fileInput);
        }
      });

      // Trigger file dialog
      fileInput.click();
    } catch (error) {
      console.error("Import setup failed:", error);
      alert("Import setup failed. Please try again.");
    }
  },

  validateImportData(data) {
    // Check if data has the expected structure
    if (!data || typeof data !== "object") return false;

    // Validate bookmarks array
    if (data.bookmarks && !Array.isArray(data.bookmarks)) return false;
    if (data.bookmarks) {
      for (const bookmark of data.bookmarks) {
        if (!bookmark.id || !bookmark.title || !bookmark.url) return false;
      }
    }

    // Validate folders array
    if (data.folders && !Array.isArray(data.folders)) return false;
    if (data.folders) {
      for (const folder of data.folders) {
        if (!folder.id || !folder.name) return false;
      }
    }

    // Validate settings object
    if (data.settings && typeof data.settings !== "object") return false;

    return true;
  },

  async backupCurrentData() {
    try {
      const backupData = {
        bookmarks: this.bookmarks,
        folders: this.folders,
        settings: this.settings,
        backupDate: new Date().toISOString(),
        version: "1.0",
      };

      // Save backup to local storage with timestamp
      const backupKey = `backup_${Date.now()}`;
      await chrome.storage.local.set({
        [backupKey]: backupData,
        lastBackup: backupKey,
      });

      console.log("Current data backed up successfully");
    } catch (error) {
      console.warn("Backup failed:", error);
    }
  },

  showImportConfirmModal(fileName, importData, fileInput) {
    // Store import data for later use
    this.pendingImportData = importData;
    this.pendingFileInput = fileInput;

    // Update modal content
    document.getElementById("importFileName").textContent = fileName;
    document.getElementById("importBookmarkCount").textContent =
      importData.bookmarks?.length || 0;
    document.getElementById("importFolderCount").textContent =
      importData.folders?.length || 0;

    // Show modal
    document.getElementById("importConfirmModal").classList.remove("hidden");
  },

  hideImportConfirmModal() {
    document.getElementById("importConfirmModal").classList.add("hidden");

    // Clean up stored data and file input
    if (this.pendingFileInput) {
      this.cleanupFileInput(this.pendingFileInput);
      this.pendingFileInput = null;
    }
    this.pendingImportData = null;
  },

  cleanupFileInput(fileInput) {
    try {
      if (fileInput && fileInput.parentNode) {
        fileInput.parentNode.removeChild(fileInput);
      }
    } catch (error) {
      console.warn("File input cleanup failed:", error);
    }
  },

  async confirmImport() {
    try {
      // Check if import data is available
      if (!this.pendingImportData) {
        throw new Error("No import data available");
      }

      // Store import data before modal cleanup
      const importData = this.pendingImportData;

      // Hide modal (this clears pendingImportData)
      this.hideImportConfirmModal();

      // Backup current data before import
      await this.backupCurrentData();

      // Import the data
      this.bookmarks = importData.bookmarks || [];
      this.folders = importData.folders || [];
      this.settings = { ...this.settings, ...importData.settings };

      // Save imported data
      await this.saveBookmarks();
      await this.saveSettingsToStorage();

      // Update UI
      this.loadCurrentSettingsIntoForm();
      this.updateTilesPerRowCSS(this.settings.tilesPerRow);
      this.renderQuickAccess();

      // Show success notification
      this.showImportNotification();
      console.log("Import completed successfully");

      // Enqueue full push to server
      enqueueSync("full_push", {});
    } catch (error) {
      console.error("Import failed:", error);
      alert(`Import failed: ${error.message}`);
    }
  },

  showImportNotification() {
    const notification = document.getElementById("importNotification");
    const notificationContent = notification.querySelector("div");

    // Show the notification container
    notification.classList.remove("hidden");

    // Animate the notification content sliding in from the right
    setTimeout(() => {
      notificationContent.classList.remove("translate-x-full");
      notificationContent.classList.add("translate-x-0");
    }, 10);

    // Hide after 3 seconds
    setTimeout(() => {
      notificationContent.classList.add("translate-x-full");
      notificationContent.classList.remove("translate-x-0");

      // Hide the container after animation completes
      setTimeout(() => {
        notification.classList.add("hidden");
      }, 300);
    }, 3000);
  },
};
