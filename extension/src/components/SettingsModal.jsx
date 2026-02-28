import {
  activeModal,
  authState,
  bookmarks,
  folders,
  settings,
  pendingImportData,
} from "../state/store.js";
import {
  saveSettings,
  exportAllData,
  validateImportData,
} from "../hooks/use-settings.js";
import { api } from "../api.js";

export function SettingsModal() {
  if (activeModal.value !== "settings") return null;

  const { showTitles, tilesPerRow, tileGap, showAddButton } = settings.value;
  const auth = authState.value;

  function handleClose() {
    activeModal.value = null;
  }

  function handleToggleShowTitles() {
    saveSettings({ showTitles: !showTitles });
  }

  function handleToggleShowAddButton() {
    saveSettings({ showAddButton: !showAddButton });
  }

  function handleTilesPerRow(e) {
    saveSettings({ tilesPerRow: parseInt(e.currentTarget.value) });
  }

  function handleTileGap(e) {
    saveSettings({ tileGap: parseInt(e.currentTarget.value) });
  }

  function handleExport() {
    exportAllData(bookmarks.peek(), folders.peek(), settings.peek());
  }

  function handleImport() {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);

    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const fileContent = await file.text();
        const importData = JSON.parse(fileContent);

        if (!validateImportData(importData)) {
          throw new Error("Invalid import file format");
        }

        pendingImportData.value = { fileName: file.name, data: importData };
        activeModal.value = "importConfirm";
      } catch (error) {
        console.error("Import failed:", error);
        alert(`Import failed: ${error.message}`);
      } finally {
        if (fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
      }
    });

    fileInput.click();
  }

  function handleLogin() {
    const loginUrl = api.getLoginUrl();
    window.open(loginUrl, "_blank", "width=500,height=600");
    chrome.storage.local.set({ authAction: "login_started" });
  }

  async function handleLogout() {
    await chrome.storage.local.set({ authAction: "logout" });
  }

  return (
    <div class="fixed right-6 bottom-20 mr-8 -mb-4 z-50">
      <div class="modal-content rounded-xl p-6 w-96 max-h-[80vh] overflow-y-auto">
        <h3 class="text-lg font-semibold text-custom-text mb-4">Settings</h3>

        {/* Show/Hide Bookmark Titles */}
        <div class="mb-6">
          <label class="flex items-center justify-between cursor-pointer">
            <span class="text-sm font-medium text-custom-text">
              Show bookmark titles
            </span>
            <ToggleSwitch
              checked={showTitles}
              onChange={handleToggleShowTitles}
            />
          </label>
        </div>

        {/* Show/Hide Add Button */}
        <div class="mb-6">
          <label class="flex items-center justify-between cursor-pointer">
            <span class="text-sm font-medium text-custom-text">
              Show add bookmark button
            </span>
            <ToggleSwitch
              checked={showAddButton}
              onChange={handleToggleShowAddButton}
            />
          </label>
        </div>

        {/* Tiles Per Row */}
        <div class="mb-6">
          <label class="block text-sm font-medium text-custom-text mb-3">
            Tiles per row
          </label>
          <div class="flex items-center space-x-4">
            <span class="text-xs text-gray-500 w-4">3</span>
            <input
              type="range"
              min="3"
              max="12"
              value={tilesPerRow}
              onInput={handleTilesPerRow}
              class="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-custom-accent"
            />
            <span class="text-xs text-gray-500 w-6">12</span>
            <span class="text-sm font-medium text-custom-text w-6 text-center">
              {tilesPerRow}
            </span>
          </div>
        </div>

        {/* Tile Gap */}
        <div class="mb-6">
          <label class="block text-sm font-medium text-custom-text mb-3">
            Tile gap
          </label>
          <div class="flex items-center space-x-4">
            <span class="text-xs text-gray-500 w-4">0</span>
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={tileGap}
              onInput={handleTileGap}
              class="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-custom-accent"
            />
            <span class="text-xs text-gray-500 w-6">10</span>
            <span class="text-sm font-medium text-custom-text w-6 text-center">
              {tileGap}
            </span>
          </div>
        </div>

        {/* Account */}
        <div class="mb-6">
          <label class="block text-sm font-medium text-custom-text mb-3">
            Account
          </label>
          {auth.authenticated && auth.user ? (
            <div class="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
              <div class="flex items-center space-x-2 text-sm text-gray-700">
                <svg
                  class="w-4 h-4 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>{auth.user.name || auth.user.email}</span>
              </div>
              <button
                onClick={handleLogout}
                class="text-gray-400 hover:text-red-500 transition-colors cursor-pointer text-sm font-bold"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              class="w-full bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center space-x-2 cursor-pointer font-bold text-sm"
            >
              <svg
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                />
              </svg>
              <span>Sign in with Google</span>
            </button>
          )}
        </div>

        {/* Export/Import Data */}
        <div class="mb-6">
          <label class="block text-sm font-medium text-custom-text mb-3">
            Data Management
          </label>
          <div class="space-y-2">
            <button
              onClick={handleExport}
              class="w-full bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center space-x-2 cursor-pointer font-bold text-sm"
            >
              <svg
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span>Export All Data</span>
            </button>
            <button
              onClick={handleImport}
              class="w-full bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center space-x-2 cursor-pointer font-bold text-sm"
            >
              <svg
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 14l-3-3m0 0l3-3m-3 3h12m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                />
              </svg>
              <span>Import Data</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }) {
  return (
    <div class="relative flex items-center" onClick={onChange}>
      <input type="checkbox" checked={checked} class="sr-only" readOnly />
      <div class="toggle-bg w-10 h-6 rounded-full shadow-inner cursor-pointer" />
      <div
        class="toggle-dot absolute w-4 h-4 bg-white rounded-full shadow left-1 transition cursor-pointer"
        style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }}
      />
    </div>
  );
}
