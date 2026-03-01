import { useState } from "preact/hooks";
import { activeModal } from "../state/store.js";
import { createFolder } from "../hooks/use-folders.js";

export function CreateFolderModal() {
  if (activeModal.value !== "createFolder") return null;

  return <CreateFolderForm />;
}

function CreateFolderForm() {
  const [name, setName] = useState("");

  function handleClose() {
    activeModal.value = null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;

    await createFolder(name.trim());
    activeModal.value = null;
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
          Create New Folder
        </h3>
        <form onSubmit={handleSubmit}>
          <div class="mb-6">
            <input
              type="text"
              value={name}
              onInput={(e) => setName(e.currentTarget.value)}
              class="w-full px-3 py-2 border border-custom-border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              autocomplete="off"
              required
              autoFocus
            />
          </div>
          <div class="flex space-x-3">
            <button
              type="button"
              onClick={handleClose}
              class="flex-1 px-3 py-2 border border-custom-border rounded-lg text-custom-text hover:bg-gray-50 transition-colors cursor-pointer font-bold text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="flex-1 px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors cursor-pointer font-bold text-sm"
            >
              Create Folder
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
