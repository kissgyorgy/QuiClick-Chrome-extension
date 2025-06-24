# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **YouTab Bookmarks**, a Chrome browser extension that replaces the new tab page with a modern bookmark management interface. Built with vanilla JavaScript, Tailwind CSS v4, and Chrome Extension API v3.

## Development Commands

### CSS Build Process
```bash
# Start CSS compilation in watch mode (primary development command)
bun run build-css

# Install dependencies
bun install
```

The build process compiles Tailwind CSS from `/workspace/src/main.css` to `/workspace/tailwind.css` which is used by the extension.

### Testing the Extension
Load the extension in Chrome:
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory
4. Open a new tab to see the extension

## Architecture

### Core Components

**BookmarkManager Class** (`/workspace/script.js`):
- Singleton class managing all bookmark operations
- Uses Chrome's `chrome.storage.local` API for persistence
- Handles CRUD operations, UI rendering, and event management
- Key methods: `loadBookmarks()`, `saveBookmarks()`, `addBookmark()`, `updateBookmark()`, `deleteBookmark()`, `renderQuickAccess()`

**Data Structure**:
```javascript
{
  id: timestamp,
  title: string,
  url: string,
  category: string,
  favicon: string (Google favicon service URL),
  dateAdded: ISO string
}
```

### UI System

**Modal System**: 
- Add bookmark modal (`#addBookmarkModal`)
- Edit bookmark modal (`#editBookmarkModal`) 
- Context menu (`#contextMenu`) for right-click operations

**Responsive Grid**: Bookmark display uses CSS Grid with 2-10 columns based on screen size

**Event Handling**:
- Left-click: Navigate to bookmark URL in new tab
- Right-click: Show context menu with Edit/Delete options
- Modal backdrop clicks close modals

### Styling Architecture

**Tailwind CSS v4** with custom theme in `/workspace/src/main.css`:
- Custom CSS properties for theming
- `--color-custom-bg`, `--color-custom-text`, `--color-custom-border`, `--color-custom-accent`
- Responsive design with hover states and transitions

## Chrome Extension Configuration

**Manifest v3** (`/workspace/manifest.json`):
- Permissions: `storage`, `bookmarks`, `activeTab`
- Overrides new tab page with `newtab.html`
- Strict CSP for security

## Key Development Patterns

### Async Operations
All storage operations use async/await with try/catch error handling and fallbacks to default bookmarks.

### Event Listener Management
Event listeners are set up in `setupEventListeners()` and include:
- Form submissions for add/edit operations
- Modal backdrop clicks
- Context menu interactions
- Global click handlers for menu hiding

### Favicon Handling
Uses Google's favicon service with fallback to letter-based avatars when images fail to load.

## Technology Stack

- **Runtime**: Bun (package manager and potential future build tool)
- **Frontend**: Vanilla JavaScript with TypeScript configuration
- **Styling**: Tailwind CSS v4 with custom theme
- **Storage**: Chrome Extension Storage API
- **Browser API**: Chrome Extension Manifest v3

## File Structure

- `newtab.html` - Main extension page HTML structure
- `script.js` - Core bookmark management logic
- `src/main.css` - Tailwind source with custom theme
- `tailwind.css` - Compiled CSS output (auto-generated)
- `manifest.json` - Chrome extension configuration
- `package.json` - Bun project configuration with CSS build script

## UI/UX Guidelines

- Always set cursor pointer on every button

## Development Best Practices

- Always use TailwindCSS, don't use custom styles or the style property