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
```

## Architecture

**Monorepo with two subsystems:**

```
extension/     Chrome extension (JS, Bun, Vite, Tailwind)
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
Vite bundles `src/script.js` → `dist/script.js` (IIFE format, no minification).
Tailwind CSS built separately via `@tailwindcss/cli`.

- `src/script.js` — Main new tab page entry point (bundled by Vite → `dist/script.js`)
- `src/` — Modular JS: `bookmarks.js`, `folders.js`, `settings.js`, `favicon.js`, `ui.js`
- `api.js` — API client singleton; translates between server snake_case and extension camelCase
- `sync-queue.js` — Enqueue operations for offline-first sync; coalesces settings/reorder ops
- `background.js` — Service worker: queue processor, delta pull, exponential backoff, local↔server ID mapping
- `popup.js` — "Add bookmark" popup with favicon discovery and selection
- `manifest.json` — Permissions: storage, bookmarks, tabs, alarms; host permissions for server

### Sync Model

Offline-first: the extension writes to `chrome.storage.local` immediately, then
enqueues sync operations. The background service worker processes the queue
against the server with retry/backoff. Delta pull uses `If-Modified-Since` /
`Last-Modified` headers via the `/changes` endpoint. Local-to-server ID mapping
handles optimistic creates.

## Environment

Managed by devenv (`devenv.nix`). Python deps via uv (`server/pyproject.toml`),
JS deps via Bun (`extension/package.json`).
Required env vars (`QUICLICK_GOOGLE_CLIENT_ID`, `QUICLICK_GOOGLE_CLIENT_SECRET`)
should be set in `devenv.local.nix`.
