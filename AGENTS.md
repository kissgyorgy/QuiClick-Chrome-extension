# QuiClick

Chrome extension for quick bookmark access on new tab pages, with a Python sync server.

## Commands

```bash
# Discover all commands
just --list

# Server tests
cd server && python -m pytest

# Build extension (JS + CSS)
just extension::build

# Package extension for Chrome Web Store
just extension::package

# Deploy server to production
just deploy
```

## Architecture

**Monorepo with two subsystems:**

```
extension/     Chrome extension (Preact, Preact Signals, Vite, Tailwind v4, Bun)
server/        Sync server (Python, FastAPI, SQLAlchemy, SQLite)
```

### Server (`server/`)

FastAPI app with Google OAuth. Each authenticated user gets their own SQLite database file (`data/{sub}.db`). A shared `users.db` maps Google subs to user info.

- `quiclick_server/main.py` — App setup, middleware (CORS, sessions), router registration
- `quiclick_server/config.py` — `environ-config` with `QUICLICK_` prefix env vars, lazy proxy pattern
- `quiclick_server/database.py` — Per-user DB factory (`get_db` dependency), user registry DB, auto-migration
- `quiclick_server/models.py` — SQLAlchemy models using single-table inheritance (`Item` → `Bookmark`/`Folder`), plus `Settings` and `UserRecord`
- `quiclick_server/schemas.py` — Pydantic schemas with favicon data URL validation (MIME + magic byte checks)
- `quiclick_server/auth.py` — Google OAuth flow (web redirect + chrome.identity token exchange)
- `quiclick_server/routes/` — CRUD for bookmarks, folders, settings, reorder, export/import, delta sync (`/changes`)
- `tests/` — pytest tests; `conftest.py` sets temp `data_dir` and test env vars, resets config between tests

### Extension (`extension/`)

Chrome Manifest V3 extension that overrides the new tab page.
Vite builds multiple entry points: `newtab.jsx`, `popup.jsx`, `background.js`, and `tailwind.css`.
Uses **Preact** for rendering and **Preact Signals** for reactive state.

**Entry points:**

- `src/newtab.jsx` — New tab page entry (renders `newtab-app.jsx`)
- `src/popup.jsx` — Browser action popup (renders `popup-app.jsx`)
- `src/background.js` — Service worker: queue processor, delta pull, exponential backoff, local↔server ID mapping

**State management (`src/state/`):**

- `store.js` — Preact signals for all app state (bookmarks, folders, settings, auth, UI modals, drag state)
- `storage-bridge.js` — Bidirectional sync between signals and `chrome.storage.local`; handles external changes from background.js

**UI (`src/components/`):** Preact JSX components — BookmarkGrid, FolderTile, modals (Add/Edit/Delete), SettingsModal, ContextMenu, etc.

**Hooks (`src/hooks/`):** Custom hooks for bookmarks, folders, settings, drag-and-drop, favicons — encapsulate CRUD logic with signal updates + storage persistence + sync queue enqueuing.

**Sync layer:**

- `src/api.js` — API client singleton; translates between server snake_case and extension camelCase
- `src/sync-queue.js` — Enqueue operations for offline-first sync; coalesces settings/reorder ops

### Sync Model

Offline-first: the extension writes to `chrome.storage.local` immediately (via signals → storage bridge), then enqueues sync operations. The background service worker processes the queue against the server with retry/backoff. Delta pull uses `If-Modified-Since` / `Last-Modified` headers via the `/changes` endpoint. Local-to-server ID mapping handles optimistic creates.

## Environment

Managed by devenv (`devenv.nix`). Python deps via uv (`server/pyproject.toml`), JS deps via Bun (`extension/package.json`).
Required env vars (`QUICLICK_GOOGLE_CLIENT_ID`, `QUICLICK_GOOGLE_CLIENT_SECRET`) should be set in `devenv.local.nix`.
Production deploy via `just deploy` — builds Nix package, copies to server, restarts systemd service.
