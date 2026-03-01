import {
  activeModal,
  bookmarks,
  folders,
  settings,
  pendingImportData,
  notification,
} from "../state/store.js";
import { persistBookmarks, persistSettings } from "../state/storage-bridge.js";
import { enqueueSync } from "../sync-queue.js";

export function ImportConfirmModal() {
  if (activeModal.value !== "importConfirm") return null;

  const pending = pendingImportData.value;
  if (!pending) return null;

  const { fileName, data } = pending;
  const bookmarkCount = data.bookmarks?.length || 0;
  const folderCount = data.folders?.length || 0;

  function handleClose() {
    pendingImportData.value = null;
    activeModal.value = "settings";
  }

  async function handleConfirm() {
    try {
      // Backup current data
      const backupData = {
        bookmarks: bookmarks.peek(),
        folders: folders.peek(),
        settings: settings.peek(),
        backupDate: new Date().toISOString(),
        version: "1.0",
      };
      const backupKey = `backup_${Date.now()}`;
      await chrome.storage.local.set({
        [backupKey]: backupData,
        lastBackup: backupKey,
      });

      // Apply import
      bookmarks.value = data.bookmarks || [];
      folders.value = data.folders || [];
      if (data.settings) {
        settings.value = { ...settings.peek(), ...data.settings };
      }

      await persistBookmarks();
      await persistSettings();

      pendingImportData.value = null;
      activeModal.value = null;
      notification.value = { visible: true, type: "import" };

      enqueueSync("full_push", {});
    } catch (error) {
      console.error("Import failed:", error);
      alert(`Import failed: ${error.message}`);
    }
  }

  return (
    <div
      class="modal-backdrop fixed inset-0 flex items-center justify-center z-50 bg-sky-200/60 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div class="modal-content rounded-xl p-6 w-96 mx-4 backdrop-blur-xl border border-white/80">
        <h3 class="text-lg font-semibold text-custom-text mb-4">
          Confirm Import
        </h3>
        <div class="mb-4">
          <p class="text-sm text-gray-600 mb-3">
            Import data from <span class="font-medium">{fileName}</span>?
          </p>
          <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <div class="text-sm text-amber-800">
              <p class="font-medium mb-1">
                This will replace your current data:
              </p>
              <ul class="space-y-1">
                <li>• {bookmarkCount} bookmarks</li>
                <li>• {folderCount} folders</li>
                <li>• Settings</li>
              </ul>
            </div>
          </div>
          <p class="text-xs text-gray-500">
            Current data will be backed up automatically before import.
          </p>
        </div>
        <div class="flex space-x-3">
          <button
            onClick={handleClose}
            class="flex-1 px-3 py-2 border border-custom-border rounded-lg text-custom-text hover:bg-gray-50 transition-colors cursor-pointer font-bold text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            class="flex-1 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors cursor-pointer font-bold text-sm"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
}
