# Overview

Replace the linear `position: Float` system with `(x, y)` integer grid coordinates for all items (bookmarks and folders). Position is represented as a 2-element list/tuple `[x, y]` everywhere: `[x, y]` in chrome.storage JSON, `Position(x, y)` Pydantic type in API requests/responses, and an SQLAlchemy composite on the server. The grid width equals the "Tiles per row" setting, rows extend infinitely downward.

# Architecture

A single `Position` value object flows through every layer. On the server, it's an SQLAlchemy composite backed by two integer columns (`position_x`, `position_y`) and a Pydantic custom type that serializes as `[x, y]`. In the API, positions are always `[x, y]` JSON arrays. In chrome.storage.local, each bookmark/folder has `position: [x, y]`. The extension grid renders items at explicit `(x, y)` cells, with empty cells acting as "Add Bookmark" targets. Drag-and-drop supports direct placement on empty cells and insert-between-items with push-right/wrap.

# Implementation plan

## 1. Position representation across layers

The position `[x, y]` is the canonical representation everywhere:

| Layer                | Format                                                                  | Example                                        |
| -------------------- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| SQLAlchemy model     | `composite(Position, position_x, position_y)`                           | `Position(2, 0)`                               |
| Pydantic schemas     | Custom `Position` type, serializes as `[x, y]`                          | `[2, 0]`                                       |
| API JSON             | `"position": [2, 0]`                                                    | `{"title": "Google", "position": [2, 0]}`      |
| chrome.storage.local | `position: [2, 0]`                                                      | `{id: 123, title: "Google", position: [2, 0]}` |
| Extension JS runtime | `bookmark.position` → `[2, 0]`, access via `position[0]`, `position[1]` | `const [x, y] = bookmark.position`             |

## 2. Server: Position model

### SQLAlchemy composite

```python
# models.py
class Position:
    def __init__(self, x, y):
        self.x = x
        self.y = y
    def __composite_values__(self):
        return self.x, self.y
    def __eq__(self, other):
        return isinstance(other, Position) and self.x == other.x and self.y == other.y
    def __ne__(self, other):
        return not self.__eq__(other)
    def __repr__(self):
        return f"Position({self.x}, {self.y})"

class Item(Base):
    __tablename__ = "items"
    ...
    position_x = Column(Integer, nullable=False, default=0)
    position_y = Column(Integer, nullable=False, default=0)
    position = composite(Position, position_x, position_y)
    # Remove: position = Column(Float, ...)

    __table_args__ = (UniqueConstraint("parent_id", "position_x", "position_y"),)
```

### Pydantic Position type

```python
# schemas.py
from pydantic import GetCoreSchemaHandler
from pydantic_core import core_schema

class Position:
    """[x, y] position that Pydantic serializes as a 2-element list."""
    def __init__(self, x: int, y: int):
        self.x = x
        self.y = y

    @classmethod
    def __get_pydantic_core_schema__(cls, source_type, handler: GetCoreSchemaHandler):
        return core_schema.no_info_plain_validator_function(
            cls._validate,
            serialization=core_schema.plain_serializer_function_ser_schema(
                lambda v: [v.x, v.y], info_arg=False
            ),
        )

    @classmethod
    def _validate(cls, v):
        if isinstance(v, cls):
            return v
        if isinstance(v, (list, tuple)) and len(v) == 2:
            return cls(int(v[0]), int(v[1]))
        raise ValueError("Position must be [x, y]")
```

This way all schemas use `position: Position` and JSON is always `[x, y]`.

The schemas `Position` and the model `Position` are the same class — define it once in `models.py` and add the Pydantic schema methods to it, so it works both as a SQLAlchemy composite and as a Pydantic field type.

### Schema changes

All schemas that had `position: float` become `position: Position`:

- `BookmarkCreate`: `position: Position | None = None`
- `BookmarkUpdate`: `position: Position | None = None`
- `BookmarkResponse`: `position: Position` (with `from_attributes` — the composite maps directly)
- `FolderCreate`, `FolderUpdate`, `FolderResponse`: same
- `ReorderItem`: `id: int, position: Position`
- `ExportBookmark`, `ExportFolder`: `position: Position`

### DB migration

In `_migrate_user_db`, when `position_x`/`position_y` columns don't exist:

1. Add `position_x INTEGER DEFAULT 0` and `position_y INTEGER DEFAULT 0` to `items` table
2. Read `tiles_per_row` from `settings` table (default 8)
3. For each group of items (grouped by `parent_id`), sorted by old `position`:
   - Assign `position_x = index % tiles_per_row`, `position_y = index // tiles_per_row`
4. Leave old `position` column in place (SQLite column drop is painful)

### Route changes

- `routes/bookmarks.py`: On create, use `body.position.x`/`body.position.y` (or auto-assign next position if None). On update, same.
- `routes/folders.py`: Same pattern.
- `routes/reorder.py`: Each `ReorderItem` has `.position` which is a `Position` object → set `item.position_x = entry.position.x`, `item.position_y = entry.position.y`.
- `routes/export_import.py`: Position flows through as `[x, y]` via Pydantic serialization.
- `routes/changes.py`: Automatic via updated response schemas.

## 3. Extension: Data model

### chrome.storage.local format

```js
// Bookmark
{ id: 123, title: "Google", url: "https://google.com", favicon: "data:...",
  dateAdded: "...", folderId: null, lastUpdated: "...", position: [2, 0] }

// Folder
{ id: 456, name: "Dev Tools", dateCreated: "...", lastUpdated: "...", position: [0, 0] }
```

Access: `const [x, y] = bookmark.position` or `bookmark.position[0]` for x.

### API client (api.js)

Server uses `position: [x, y]` in JSON, extension uses `position: [x, y]` in storage — they're the same format now! Translation is minimal:

- Server `position` → extension `position` (pass-through)
- Server `parent_id` ↔ extension `folderId` (existing)
- Server `date_added` ↔ extension `dateAdded` (existing)

The `_serverBookmarkToExtension` and friends just pass `position` through as-is since the format matches.

### Background sync (background.js)

- `serverBookmarkToLocal`: `position: serverBm.position` (pass-through `[x, y]`)
- `serverFolderToLocal`: same
- `buildExportData`: `position: b.position || [0, 0]`
- Sort logic: `localBookmarks.sort((a, b) => (a.position[1] - b.position[1]) || (a.position[0] - b.position[0]))` (sort by y, then x)
- `processCreateBookmark`: send `position: [x, y]`
- `processReorder`: send `position: [x, y]` per item

### Sync queue payloads

- `create_bookmark`: `{ localId, title, url, favicon, folderId, position: [x, y] }`
- `create_folder`: `{ localId, name, position: [x, y] }`
- `reorder`: `{ items: [{ id, position: [x, y] }, ...] }`
- `update_bookmark`: updates may include `position: [x, y]`

## 4. Extension: Grid rendering

### BookmarkGrid.jsx — rewrite

1. **Compute grid bounds:** `cols = tilesPerRow`. `maxRow` = highest `position[1]` among visible items. `totalRows = max(maxRow + 2, viewportRows)` where `viewportRows` fills the screen.
2. **Build cell map:** `const cellMap = new Map()` keyed by `"x,y"` → item, from all visible bookmarks + folders (those with `folderId === null`).
3. **Render CSS grid** with `display: grid`, `grid-template-columns: repeat(cols, size)`, and explicit cell placement.
4. **For each cell `(x, y)` from `(0,0)` to `(cols-1, totalRows-1)`:**
   - Occupied → `BookmarkTile`/`FolderTile` with `style={{ gridColumn: x+1, gridRow: y+1 }}`
   - Empty + `showAddButton` → `EmptyCell` (clickable "+")
   - Empty + !`showAddButton` → empty div placeholder

### EmptyCell.jsx (new component)

```jsx
function EmptyCell({ x, y }) {
  // onClick: set addBookmarkPosition = [x, y], open AddBookmarkModal
  // onDragOver/onDrop: accept dragged items, move to [x, y]
}
```

New signal in `store.js`:

```js
export const addBookmarkPosition = signal(null); // [x, y] or null
```

### Viewport row calculation

```js
const gridEl = useRef(null);
// On mount / resize, compute how many rows fill the viewport
const tileSize = 96; // or from CSS
const gapPx = /* mapped from tileGap setting */;
const availableHeight = window.innerHeight - gridTop;
const viewportRows = Math.ceil(availableHeight / (tileSize + gapPx));
```

### FolderModal grid

Same cell-map and explicit-placement approach for bookmarks within a folder. Folder bookmarks have their own `position: [x, y]` relative to their parent folder.

### getGridClasses update (use-settings.js)

Simplify `getGridClasses` — no longer needs auto-flow. Just returns the max-width and centering classes. The actual `grid-template-columns` is set inline based on `tilesPerRow` and tile size.

## 5. Extension: Drag and drop

### Richer drag state

```js
export const dragState = signal({
  isDragging: false,
  draggedBookmarkId: null,
  draggedFolderId: null,
  dropTarget: null,
  // dropTarget shapes:
  //   { type: 'empty', x, y }              — hovering empty cell
  //   { type: 'insert', x, y, side }       — hovering occupied cell, side = 'left'|'right'
});
```

### Drop on empty cell

EmptyCell's `onDragOver` → `dropTarget = { type: 'empty', x, y }` (highlight cell).
EmptyCell's `onDrop` → move item to `position: [x, y]`.

### Drop between occupied cells (insert)

BookmarkTile's `onDragOver` → compute left/right half from `e.clientX` vs tile center → `dropTarget = { type: 'insert', x, y, side: 'left'|'right' }`.

Visual: a 2-3px vertical blue bar at the left or right edge of the tile, rendered as an absolutely-positioned `<div>` inside the tile.

### Insert + push-right algorithm

```js
function insertAndPush(allItems, draggedId, targetX, targetY, tilesPerRow) {
  // 1. Remove dragged item from allItems
  // 2. Check if (targetX, targetY) is occupied
  // 3. If empty: place dragged item at [targetX, targetY], done
  // 4. If occupied: collect chain of consecutively-occupied cells
  //    starting at (targetX, targetY) in row-major order
  //    Shift each right by 1 (wrap: x+1 >= tilesPerRow → [0, y+1])
  //    Stop when hitting an empty cell
  // 5. Place dragged item at [targetX, targetY]
  // Return list of items with updated positions (for reorder sync)
}
```

When `side === 'left'`: target is `(x, y)` — insert before the hovered item.
When `side === 'right'`: target is the next cell after `(x, y)` — `(x+1, y)` or `(0, y+1)` if wrapping.

### Folder tile drop behavior

Keep existing: dropping a bookmark on a FolderTile moves it into the folder (entire tile is the drop target). Insert indicators only appear on BookmarkTiles and EmptyCells. If user wants to place something next to a folder, they drop on the adjacent empty cell or bookmark.

### Folder modal backdrop drop

Keep existing: dragging out of folder modal removes bookmark from folder. Place at next available position in main grid.

## 6. Extension: CRUD position updates

### addBookmark (use-bookmarks.js)

```js
// If addBookmarkPosition signal is set (clicked empty cell), use it
const pos = addBookmarkPosition.peek() || getNextPosition(visibleItems, tilesPerRow);
const bookmark = { ..., position: pos };
addBookmarkPosition.value = null; // clear after use
```

### getNextPosition helper

```js
function getNextPosition(items, tilesPerRow) {
  if (items.length === 0) return [0, 0];
  let maxY = 0,
    maxX = -1;
  for (const item of items) {
    const [ix, iy] = item.position;
    if (iy > maxY || (iy === maxY && ix > maxX)) {
      maxY = iy;
      maxX = ix;
    }
  }
  return maxX + 1 >= tilesPerRow ? [0, maxY + 1] : [maxX + 1, maxY];
}
```

Used by: `addBookmark`, `createFolder`, `moveBookmarkToFolder` (place in folder), `removeBookmarkFromFolder` (place in main grid), popup `handleSubmit`.

### createFolder (use-folders.js)

Same: `position: getNextPosition(...)`.

### deleteBookmark / deleteFolder

Remove item. Cell becomes empty gap. No reflow.

### reorderBookmarks → replaced by grid insert

The current `reorderBookmarks(draggedId, targetId, insertAfter)` is replaced by `insertAndPush(...)` which works in (x, y) space. The sync enqueues a `reorder` with all affected items' new positions.

### moveBookmarkToFolder

Sets `folderId`, assigns `position: getNextPosition(folderBookmarks, tilesPerRow)` within the folder.

### removeBookmarkFromFolder

Clears `folderId`, assigns `position: getNextPosition(mainGridItems, tilesPerRow)` in the main grid.

## 7. tilesPerRow change handling

When `tilesPerRow` decreases, items with `position[0] >= newTilesPerRow` are off-grid. In `saveSettings`, when `tilesPerRow` changes:

```js
function reflowPositions(items, newTilesPerRow) {
  const offGrid = items.filter((i) => i.position[0] >= newTilesPerRow);
  if (offGrid.length === 0) return items;
  // For each off-grid item, find next available position
  // Build occupied set, scan row-major for first empty cell
  // Assign new position
}
```

## 8. Remove AddBookmarkTile

Delete `AddBookmarkTile.jsx`. Its functionality is replaced by `EmptyCell.jsx`. Remove imports from `BookmarkGrid.jsx` and the `showAddButton && <AddBookmarkTile />` rendering.

## 9. Popup (browser action)

`popup-app.jsx` creates bookmarks at `getNextPosition(mainGridItems, tilesPerRow)`. Reads `tilesPerRow` from settings in storage. No grid UI in the popup.

# Files to modify

### Server

- **`server/quiclick_server/models.py`** — Add `Position` class (SQLAlchemy composite + Pydantic type), replace `position` Float with `position_x`/`position_y` columns + `position` composite, update `UniqueConstraint`
- **`server/quiclick_server/schemas.py`** — Import `Position` from models, replace `position: float` with `position: Position` in all schemas (`BookmarkCreate`, `BookmarkUpdate`, `BookmarkResponse`, `FolderCreate`, `FolderUpdate`, `FolderResponse`, `ReorderItem`, `ExportBookmark`, `ExportFolder`)
- **`server/quiclick_server/database.py`** — Add migration in `_migrate_user_db`: create `position_x`/`position_y` columns, convert old float positions to (x, y) using `tiles_per_row`
- **`server/quiclick_server/routes/bookmarks.py`** — Use `body.position.x`/`body.position.y` when creating/updating items
- **`server/quiclick_server/routes/folders.py`** — Same
- **`server/quiclick_server/routes/reorder.py`** — Update to set `position_x`/`position_y` from `entry.position`
- **`server/quiclick_server/routes/export_import.py`** — Position flows through as `[x, y]` via Pydantic
- **`server/tests/`** — Update all tests for `position: [x, y]` format

### Extension

- **`extension/src/state/store.js`** — Add `addBookmarkPosition` signal
- **`extension/src/api.js`** — Simplify: `position` is pass-through `[x, y]`, no field renaming needed
- **`extension/src/background.js`** — Update `serverBookmarkToLocal`/`serverFolderToLocal` (position pass-through), `buildExportData`, sort by `[y, x]`, queue processors
- **`extension/src/hooks/use-bookmarks.js`** — Replace `position: int` with `position: [x, y]`, add `getNextPosition()`, replace `reorderBookmarks` with `insertAndPush`, update `addBookmark`/`duplicateBookmark`
- **`extension/src/hooks/use-folders.js`** — `position: [x, y]` in `createFolder`, update `moveBookmarkToFolder`/`removeBookmarkFromFolder`
- **`extension/src/hooks/use-drag-and-drop.js`** — Rewrite: grid-aware insert, push-right with wrap, empty cell drops, `dropTarget` state management
- **`extension/src/hooks/use-settings.js`** — Simplify `getGridClasses`, add `reflowPositions` for tilesPerRow changes
- **`extension/src/components/BookmarkGrid.jsx`** — Rewrite: cell map, explicit grid placement, viewport row calc, empty cells
- **`extension/src/components/BookmarkTile.jsx`** — Add inline grid placement style, drop indicator bar, read `position` as `[x, y]`
- **`extension/src/components/FolderTile.jsx`** — Add inline grid placement style
- **`extension/src/components/EmptyCell.jsx`** — **New**: clickable "+" cell, drag target
- **`extension/src/components/AddBookmarkTile.jsx`** — **Delete**
- **`extension/src/components/AddBookmarkModal.jsx`** — Use `addBookmarkPosition` for placement
- **`extension/src/components/FolderModal.jsx`** — Rewrite grid to use (x, y) cell placement
- **`extension/src/popup-app.jsx`** — Use `getNextPosition` for bookmark placement

# Verification, success criteria

### Server tests

```bash
cd server && python -m pytest -x -v
```

All tests pass with `position: [x, y]` format. Includes tests for:

- Creating items with `position: [x, y]`
- Migration from float to `[x, y]`
- Reorder with `[x, y]` positions
- Unique constraint on `(parent_id, position_x, position_y)`
- Export/import roundtrip with `[x, y]`

### Extension build

```bash
just extension::build
```

Builds without errors.

### Manual Playwright testing

Load extension in Chrome via `playwright-cli open --config=... --persistent`, navigate to extension newtab page, verify:

1. Grid renders items at correct (x, y) cells
2. Empty cells show "+" when showAddButton is on, blank when off
3. Click "+" on empty cell → AddBookmarkModal opens → creates bookmark at that cell's position
4. Drag bookmark to empty cell → moves there directly
5. Drag between occupied cells → vertical bar indicator, drop inserts with push-right
6. Push-right wraps at row edge
7. Delete leaves gap
8. Folder modal uses same grid
9. tilesPerRow change reflows off-grid items

# Todo items

1. **Server: Position class** — Create unified `Position` class in `models.py` with both SQLAlchemy composite and Pydantic `[x, y]` serialization support
2. **Server: Update Item model** — Replace `position = Column(Float)` with `position_x`/`position_y` Integer columns + composite, update `UniqueConstraint`
3. **Server: DB migration** — Add `position_x`/`position_y` migration in `_migrate_user_db`, convert old float positions to (x, y) using `tiles_per_row`
4. **Server: Update all schemas** — Replace `position: float` with `position: Position` everywhere
5. **Server: Update all routes** — bookmarks, folders, reorder, export/import use `Position` objects
6. **Server: Update tests** — All tests use `position: [x, y]` format
7. **Extension: Update data model** — `position: [x, y]` in store objects, add `addBookmarkPosition` signal
8. **Extension: Update API client** — Position is pass-through `[x, y]`, simplify translation
9. **Extension: Update background sync** — Position pass-through, sort by `[y, x]`, update queue processors
10. **Extension: Create EmptyCell component** — Clickable "+", drop target for direct placement
11. **Extension: Rewrite BookmarkGrid** — Cell map, explicit grid, viewport rows, empty cells
12. **Extension: Update BookmarkTile/FolderTile** — Inline grid placement, drop indicator bar
13. **Extension: Rewrite drag-and-drop** — `insertAndPush` algorithm, push-right with wrap, drop indicator state
14. **Extension: Update bookmark/folder CRUD** — `getNextPosition` helper, `addBookmark`/`createFolder` use `[x, y]`, update move in/out of folder
15. **Extension: Update FolderModal** — Same (x, y) grid system
16. **Extension: Handle tilesPerRow change** — `reflowPositions` for off-grid items
17. **Extension: Delete AddBookmarkTile** — Remove component, update imports
18. **Extension: Update popup** — `getNextPosition` for placement
19. **Verify** — Server tests, extension build, Playwright manual test
