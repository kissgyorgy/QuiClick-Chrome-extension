import { useRef, useEffect, useState } from "preact/hooks";
import { bookmarks, folders, settings } from "../state/store.js";
import { gapPxFromSetting } from "../hooks/use-settings.js";
import { BookmarkTile } from "./BookmarkTile.jsx";
import { FolderTile } from "./FolderTile.jsx";
import { EmptyCell } from "./EmptyCell.jsx";

const TILE_SIZE = 96; // w-24 = 6rem = 96px

export function BookmarkGrid() {
  const allBookmarks = bookmarks.value;
  const allFolders = folders.value;
  const { tilesPerRow, tileGap, showAddButton } = settings.value;

  const gridRef = useRef(null);
  const [viewportRows, setViewportRows] = useState(4);

  // Compute how many rows fill the viewport on mount and resize
  useEffect(() => {
    function update() {
      if (!gridRef.current) return;
      const rect = gridRef.current.getBoundingClientRect();
      const gapPx = gapPxFromSetting(tileGap).y;
      const available = window.innerHeight - rect.top;
      const rows = Math.max(2, Math.floor(available / (TILE_SIZE + gapPx)));
      setViewportRows(rows);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [tileGap]);

  const cols = tilesPerRow;
  const gapPx = gapPxFromSetting(tileGap);

  // Visible root-level items only
  const visibleBookmarks = allBookmarks.filter((b) => !b.folderId);
  const visibleFolders = allFolders;

  // Build cell map: "x,y" → item
  const cellMap = new Map();
  for (const folder of visibleFolders) {
    const [x, y] = folder.position || [0, 0];
    cellMap.set(`${x},${y}`, { type: "folder", item: folder });
  }
  for (const bookmark of visibleBookmarks) {
    const [x, y] = bookmark.position || [0, 0];
    cellMap.set(`${x},${y}`, { type: "bookmark", item: bookmark });
  }

  // Compute total rows: at least enough to fill viewport, at least one past the last occupied row
  let maxOccupiedRow = -1;
  for (const [, v] of cellMap) {
    // won't work — iterate positions instead
  }
  for (const folder of visibleFolders) {
    const y = (folder.position || [0, 0])[1];
    if (y > maxOccupiedRow) maxOccupiedRow = y;
  }
  for (const bookmark of visibleBookmarks) {
    const y = (bookmark.position || [0, 0])[1];
    if (y > maxOccupiedRow) maxOccupiedRow = y;
  }
  const totalRows = Math.max(maxOccupiedRow + 1, viewportRows);

  // Gap CSS values
  const gapXPx = gapPx.x;
  const gapYPx = gapPx.y;

  const cells = [];
  for (let y = 0; y < totalRows; y++) {
    for (let x = 0; x < cols; x++) {
      const key = `${x},${y}`;
      const cell = cellMap.get(key);
      if (cell) {
        if (cell.type === "folder") {
          cells.push(
            <FolderTile
              key={`f-${cell.item.id}`}
              folder={cell.item}
              gridX={x}
              gridY={y}
            />,
          );
        } else {
          cells.push(
            <BookmarkTile
              key={`b-${cell.item.id}`}
              bookmark={cell.item}
              gridX={x}
              gridY={y}
            />,
          );
        }
      } else {
        cells.push(
          <EmptyCell key={key} x={x} y={y} showAddButton={showAddButton} />,
        );
      }
    }
  }

  return (
    <div
      ref={gridRef}
      id="quickAccess"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, ${TILE_SIZE}px)`,
        columnGap: `${gapXPx}px`,
        rowGap: `${gapYPx}px`,
        justifyContent: "center",
        paddingTop: "8px",
        paddingBottom: "16px",
      }}
    >
      {cells}
    </div>
  );
}
