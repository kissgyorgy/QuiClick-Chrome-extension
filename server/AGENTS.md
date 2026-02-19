# QuiClick Server

A **FastAPI-based backend** for the QuiClick Chrome extension — a bookmark/new-tab manager with Google OAuth authentication and per-user SQLite databases.

## Tech Stack
- **Framework**: FastAPI + Uvicorn
- **Database**: SQLite (per-user DBs via SQLAlchemy)
- **Auth**: Google OAuth2 (via Authlib), session cookies
- **Config**: `environ-config` with `QUICLICK_*` env vars
- **Dev**: devenv/Nix, uv for Python deps, pytest for tests

## Architecture
- **Per-user isolation**: Each authenticated user gets their own `{google_sub}.db` SQLite file
- **Shared user registry**: `users.db` maps Google `sub` → email/name
- **Polymorphic items**: `Item` base table with `Bookmark` and `Folder` subtypes (STI + joined table inheritance), positioned via `Float` position values

## API Routes
| Prefix | Module | Purpose |
|---|---|---|
| `/auth` | `auth.py` | Google OAuth login/callback/logout/me |
| `/bookmarks` | `routes/bookmarks.py` | CRUD + reorder bookmarks |
| `/folders` | `routes/folders.py` | CRUD folders (with child bookmarks) |
| `/reorder` | `routes/reorder.py` | Bulk reorder any items |
| `/settings` | `routes/settings.py` | User display preferences (tiles_per_row, show_titles, etc.) |
| `/export` `/import` | `routes/export_import.py` | Full data export/import as JSON |

## Key Design Decisions
- Favicons stored as **binary blobs** in DB, transported as **data URLs** with MIME validation + magic byte checking
- Fractional positioning (`Float`) for drag-and-drop reordering
- Deleting a folder moves its child bookmarks to root level
- HTTPS with local certs for development (`local.fancyauth.com`)

## Tests
6 test modules covering auth, bookmarks, folders, reorder, settings, and export/import, using temp directories for isolation.


