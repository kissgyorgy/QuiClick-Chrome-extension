import { activeModal } from "../state/store.js";

export function AddBookmarkTile() {
  return (
    <div
      id="addBookmarkTile"
      class="tile tile-3d tile-3d-add w-24 h-24 relative rounded-lg cursor-pointer group"
      title="Add New Bookmark"
      onClick={() => (activeModal.value = "addBookmark")}
    >
      <div class="absolute inset-0 flex items-center justify-center">
        <span class="text-sky-500/50 text-7xl leading-none text-center font-mono transition-all duration-300 group-hover:text-sky-500 group-hover:scale-110">
          +
        </span>
      </div>
    </div>
  );
}
