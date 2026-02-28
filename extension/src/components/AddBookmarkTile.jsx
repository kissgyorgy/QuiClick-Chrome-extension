import { activeModal } from "../state/store.js";

export function AddBookmarkTile() {
  return (
    <div
      id="addBookmarkTile"
      class="tile tile-3d tile-3d-add w-24 h-24 relative rounded-lg cursor-pointer"
      title="Add New Bookmark"
      onClick={() => (activeModal.value = "addBookmark")}
    >
      <div class="absolute inset-0 flex items-center justify-center">
        <span class="text-custom-accent leading-none plus-icon">+</span>
      </div>
    </div>
  );
}
