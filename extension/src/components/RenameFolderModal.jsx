import { useState, useEffect, useRef } from "preact/hooks";
import { activeModal, folders, currentFolderId } from "../state/store.js";
import { renameFolder } from "../hooks/use-folders.js";
import { Modal } from "./Modal.jsx";

export function RenameFolderModal() {
  if (activeModal.value !== "renameFolder") return null;

  const folderId = currentFolderId.value;
  const folder = folders.value.find((f) => f.id === folderId);
  if (!folder) return null;

  return <RenameFolderForm folder={folder} />;
}

function RenameFolderForm({ folder }) {
  const [name, setName] = useState(folder.name);
  const nameRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function handleClose() {
    currentFolderId.value = null;
    activeModal.value = null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;

    await renameFolder(folder.id, name.trim());
    currentFolderId.value = null;
    activeModal.value = null;
  }

  return (
    <Modal onClose={handleClose}>
      <h3 class="text-lg font-semibold text-custom-text mb-4">Rename Folder</h3>
      <form onSubmit={handleSubmit}>
        <div class="mb-6">
          <input
            type="text"
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            class="w-full px-3 py-2 border border-custom-border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            autocomplete="off"
            required
            ref={nameRef}
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
            Rename
          </button>
        </div>
      </form>
    </Modal>
  );
}
