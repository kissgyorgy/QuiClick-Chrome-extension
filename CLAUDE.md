# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QuiClick is a Chrome Browser Extension that replaces the new tab page with a custom bookmark manager. 
It provides quick access to bookmarks through an organized, tile-based interface with drag-and-drop functionality.

## Technology Stack

- **JavaScript (ES6+)** - Main application logic in single `BookmarkManager` class
- **HTML5 + CSS3** - Structure and styling
- **Tailwind CSS v4** - Utility-first CSS framework with custom theme
- **Chrome Extension API** - Browser integration (Manifest V3)
- **Bun** - Package manager and build tool

## Development Commands

```bash
# Install dependencies
bun install

# Build CSS from source (required after CSS changes)
bun run build-css

# Package extension for Chrome Web Store
bun run package

# Clean build and repackage
bun run package:clean
```

## Key Architecture

### Single Class Design
- All functionality is contained within the `BookmarkManager` class in `script.js`
- Event-driven architecture with extensive event listener setup
- Modal-based UI for all operations (add, edit, delete, settings)

### File Structure
- `manifest.json` - Chrome extension configuration (Manifest V3)
- `newtab.html` - Main HTML page that replaces new tab
- `script.js` - Core application logic (~3000 lines)
- `src/main.css` - Source CSS with Tailwind imports and custom styles
- `tailwind.css` - Compiled CSS output (generated, don't edit directly)

### Chrome Extension Integration
- Uses `chrome.storage.sync` for cross-device synchronization
- Requires permissions: storage, bookmarks, activeTab, tabs, https://*/*
- Overrides new tab page via `chrome_url_overrides`

## Development Workflow

### CSS Changes
1. Edit `src/main.css` (not `tailwind.css`)
2. Run `bun run build-css` to compile
3. Refresh extension in Chrome

### Extension Testing
1. Load unpacked extension in Chrome Developer Mode
2. Point to project root directory
3. Refresh extension after changes

### Key Features to Understand
- **Bookmark Management** - Add, edit, delete, duplicate bookmarks and folders
- **Drag & Drop** - Reorganize bookmarks and folders
- **Favicon Handling** - Automatic fetching with custom favicon selection
- **Export/Import** - JSON-based data backup and restore
- **Responsive Grid** - Dynamic column layouts (3-12 tiles per row)
- **3D Visual Effects** - Custom CSS animations and shadows for tiles

## State Management

The BookmarkManager maintains state for:
- `bookmarks[]` and `folders[]` - Main data arrays
- `currentBookmarkId/currentFolderId` - Currently selected items
- `openFolderId` - Currently open folder
- `isDragging/draggedBookmarkId` - Drag and drop state
- `settings{}` - User preferences (showTitles, tilesPerRow, tileGap, etc.)
