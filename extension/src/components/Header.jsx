import { activeModal } from "../state/store.js";

export function Header() {
  return (
    <header class="border-b border-custom-border px-6 py-4">
      <div class="max-w-7xl mx-auto flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 bg-custom-accent rounded-lg flex items-center justify-center">
            <svg
              class="w-5 h-5 text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-custom-text">QuiClick</h1>
        </div>

        <div class="flex items-center space-x-4">
          <button
            onClick={() => (activeModal.value = "createFolder")}
            class="btn-create-folder text-white px-3 py-2 rounded-lg transition-all flex items-center space-x-2 cursor-pointer font-bold text-sm"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
            <span>Create Folder</span>
          </button>

          <button
            onClick={() => (activeModal.value = "addBookmark")}
            class="bg-custom-accent text-white px-3 py-2 rounded-lg hover:bg-blue-600 transition-colors flex items-center space-x-2 cursor-pointer font-bold text-sm"
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
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
            <span>Add Bookmark</span>
          </button>
        </div>
      </div>
    </header>
  );
}
