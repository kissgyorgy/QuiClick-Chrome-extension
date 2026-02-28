import { bookmarks, folders, settings } from "../state/store.js";
import { getGridClasses } from "../hooks/use-settings.js";
import { BookmarkTile } from "./BookmarkTile.jsx";
import { FolderTile } from "./FolderTile.jsx";
import { AddBookmarkTile } from "./AddBookmarkTile.jsx";

export function BookmarkGrid() {
  const allBookmarks = bookmarks.value;
  const allFolders = folders.value;
  const { showTitles, tilesPerRow, tileGap, showAddButton } = settings.value;

  const visibleBookmarks = allBookmarks.filter((b) => !b.folderId);
  const gridClass = getGridClasses(tilesPerRow, tileGap);

  return (
    <div id="quickAccess" class={gridClass}>
      {allFolders.map((folder) => (
        <FolderTile key={folder.id} folder={folder} />
      ))}
      {visibleBookmarks.map((bookmark) => (
        <BookmarkTile key={bookmark.id} bookmark={bookmark} />
      ))}
      {showAddButton && <AddBookmarkTile />}
    </div>
  );
}
