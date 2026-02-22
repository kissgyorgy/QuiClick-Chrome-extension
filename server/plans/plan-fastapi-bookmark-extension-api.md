# Overview

A FastAPI REST API backend for the QuiClick Chrome bookmark extension. Multi-user, with per-user SQLite databases, Google OIDC authentication via browser-tab login flow, and session-cookie auth. Replaces the extension's current Chrome storage layer.

# Architecture

Router-based layered structure: `main.py` wires together FastAPI + middleware; route modules (`bookmarks`, `folders`, `settings`, `auth`, `export`) handle HTTP; `models.py` holds SQLAlchemy ORM classes; `schemas.py` holds Pydantic request/response models; `database.py` creates a fresh SQLAlchemy engine per request (no global cache) for each user's individual SQLite file. Each user gets their own SQLite file at `data/{sub}.db`. A small `users.db` maps Google `sub` → email/name for session population. Config is loaded from env vars via `environ-config`.

# Tech Stack

- **FastAPI** — already in dependencies
- **SQLAlchemy 2.x** — already in dependencies, used with `create_engine` per user
- **Authlib** — Google OIDC / OAuth2 client (needs to be added)
- **Starlette SessionMiddleware** — signed cookie sessions (comes with FastAPI/Starlette)
- **httpx** — async HTTP client for Authlib (needs to be added)
- **environ-config** — attrs-based env-var configuration (needs to be added)
- **uvicorn** — ASGI server for running the app (needs to be added)

# Implementation plan

## Directory structure

```
quiclick_server/
├── __init__.py
├── main.py           # app factory, middleware, router registration
├── config.py         # Settings loaded from env vars
├── auth.py           # Google OIDC login/callback/logout routes + current_user dep
├── database.py       # per-user engine factory, Session dependency, users registry DB
├── models.py         # SQLAlchemy ORM: Item (base), Bookmark, Folder (JTI polymorphic), Settings
├── schemas.py        # Pydantic schemas for all request/response bodies
└── routes/
    ├── __init__.py
    ├── bookmarks.py
    ├── folders.py
    ├── reorder.py        # PATCH /reorder — unified root-level position updates
    ├── settings.py
    └── export_import.py
data/                 # created at runtime
    users.db          # user registry (sub → email, name)
    {sub}.db          # per-user bookmark database
```

## config.py

Uses `environ-config` (attrs-based, reads directly from `os.environ`):

```python
import environ

@environ.config(prefix="QUICLICK")
class AppConfig:
    google_client_id = environ.var()
    google_client_secret = environ.var()
    secret_key = environ.var()
    server_host = environ.var("http://localhost:8000")
    data_dir = environ.var("data")

cfg = environ.to_config(AppConfig)
```

Variables are prefixed `QUICLICK_` (e.g., `QUICLICK_GOOGLE_CLIENT_ID`). No `.env` file loading — env vars are set in the shell or `devenv.nix`.

## database.py

Two concerns:

**1. User registry DB** — a single `users.db` at `data/users.db` with a `User` table (`sub`, `email`, `name`). Used only during login to upsert user records.

**2. Per-request engine creation** — No module-level engine cache. `get_db` creates a fresh `Engine` each request and disposes it after the request completes. `create_all()` is called only when the user's DB file does not yet exist (idempotent guard via `Path.exists()`).

**Dependency** — `get_db(sub: str = Depends(get_current_user))` receives the authenticated user's `sub` from the session cookie dependency, builds the engine, yields a `Session`, then calls `engine.dispose()`.

```python
def get_db(sub: str = Depends(get_current_user)) -> Generator[Session, None, None]:
    db_path = Path(cfg.data_dir) / f"{sub}.db"
    first_time = not db_path.exists()
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    try:
        if first_time:
            Base.metadata.create_all(engine)
        with Session(engine) as session:
            yield session
    finally:
        engine.dispose()
```

## models.py — Joined Table Inheritance (SQLAlchemy polymorphic)

Uses SQLAlchemy's Joined Table Inheritance with `polymorphic_identity`. The base `Item` table holds shared columns and the `UNIQUE(parent_id, position)` constraint. Child tables hold type-specific columns. No nullable bookmark fields on folders, no nullable folder fields on bookmarks.

```python
class Item(Base):
    """Base table for all positionable items (bookmarks and folders)."""
    __tablename__ = "items"
    id: int (PK, autoincrement)
    type: str               # polymorphic discriminator: "bookmark" or "folder"
    title: str
    date_added: datetime
    parent_id: int | None   # FK → items.id, None = root level
    position: float         # fractional ordering

    __table_args__ = (
        UniqueConstraint("parent_id", "position"),  # DB-level position uniqueness
    )
    __mapper_args__ = {
        "polymorphic_on": "type",
        "polymorphic_identity": "item",
    }

class Bookmark(Item):
    """Bookmark-specific columns."""
    __tablename__ = "bookmarks"
    id: int (FK → items.id, PK)
    url: str
    favicon: bytes | None    # stored as BLOB
    favicon_mime: str | None # e.g. "image/png"

    __mapper_args__ = {"polymorphic_identity": "bookmark"}

class Folder(Item):
    """Folder-specific columns (extensible)."""
    __tablename__ = "folders"
    id: int (FK → items.id, PK)
    # No extra columns currently, but the table exists for JTI

    __mapper_args__ = {"polymorphic_identity": "folder"}

class Settings(Base):
    __tablename__ = "settings"
    id: int (PK, always 1)
    show_titles: bool = True
    tiles_per_row: int = 8
    tile_gap: int = 1
    show_add_button: bool = True
```

**Key behaviors:**
- `session.query(Item).filter(Item.parent_id == None).order_by(Item.position)` → returns mixed `Bookmark` and `Folder` objects, ordered by position — exactly what the root view needs
- `session.query(Bookmark).filter(Bookmark.parent_id == folder_id)` → auto-joins items+bookmarks, returns only bookmarks in that folder
- `isinstance(item, Folder)` works for type checking in Python
- `UNIQUE(parent_id, position)` enforced at the DB level across both types

## schemas.py

Key decisions:
- `favicon` in request/response is always a `str | None` (base64 data URL like `"data:image/png;base64,..."`)
- **Validation** happens in Pydantic via a shared `@field_validator`; conversion to bytes happens in route handlers
- Responses include `favicon` as the reconstructed data URL string

**Favicon validation** — a module-level `validate_favicon_data_url(v: str) -> str` function is used as a `@field_validator` on every schema that accepts `favicon`. It:

1. Parses the data URL: must match `data:{mime};base64,{data}`
2. Checks `mime` is in the allowed set: `{"image/png", "image/jpeg", "image/gif", "image/webp", "image/x-icon", "image/svg+xml"}`
3. Base64-decodes the payload (raises `ValueError` on malformed base64)
4. Verifies magic bytes match the declared MIME type using a stdlib-only lookup table:
   - `image/png` → `\x89PNG`
   - `image/jpeg` → `\xff\xd8\xff`
   - `image/gif` → `GIF87a` or `GIF89a`
   - `image/webp` → `RIFF` at bytes 0-3 and `WEBP` at bytes 8-11
   - `image/x-icon` → `\x00\x00\x01\x00`
   - `image/svg+xml` → decoded text contains `<svg` (case-insensitive, after stripping BOM/whitespace)
5. Returns the original string unchanged if valid; raises `ValueError` with a descriptive message otherwise

All validation errors surface as standard FastAPI 422 responses. No external image library needed.

```python
class BookmarkCreate(BaseModel):
    title: str
    url: str
    favicon: str | None = None  # base64 data URL; validated by validate_favicon_data_url
    parent_id: int | None = None  # None = root level, or folder item id
    position: float | None = None

    @field_validator("favicon", mode="before")
    @classmethod
    def check_favicon(cls, v): return validate_favicon_data_url(v) if v else v

class BookmarkUpdate(BaseModel):
    title: str | None = None
    url: str | None = None
    favicon: str | None = None  # same validator applied
    parent_id: int | None = None
    position: float | None = None

    @field_validator("favicon", mode="before")
    @classmethod
    def check_favicon(cls, v): return validate_favicon_data_url(v) if v else v

class BookmarkResponse(BaseModel):
    id: int
    type: str             # always "bookmark"
    title: str
    url: str
    favicon: str | None   # base64 data URL
    date_added: datetime
    parent_id: int | None
    position: float

class ReorderRequest(BaseModel):
    # List of {id, position} pairs; client computes new float positions
    items: list[ReorderItem]

class FolderCreate(BaseModel):
    title: str            # folder name, stored as title in base Item table
    parent_id: int | None = None  # None = root level
    position: float | None = None  # assigned as max+1.0 if omitted

class FolderUpdate(BaseModel):
    title: str | None = None
    position: float | None = None

class FolderResponse(BaseModel):
    id: int
    type: str             # always "folder"
    title: str            # folder name stored as title in base Item table
    date_added: datetime
    parent_id: int | None
    position: float

class SettingsPatch(BaseModel):
    show_titles: bool | None = None
    tiles_per_row: int | None = None
    tile_gap: int | None = None
    show_add_button: bool | None = None
```

## auth.py

**Security model: HttpOnly session cookies on a dedicated domain.** The server runs on a real domain (e.g., `api.quiclick.example.com`), so the cookie is scoped to that domain only — not shared with localhost or any other site. Cookie attributes: `HttpOnly` (no JS access), `Secure` (HTTPS only), `SameSite=Lax`.

**Deployment model:** Central server with a real domain. The server URL is configurable via `QUICLICK_SERVER_HOST`.

Routes:
- `GET /auth/login` → Authlib redirects to Google's authorization URL
- `GET /auth/callback` → Authlib exchanges code for ID token, fetches userinfo, upserts User in `users.db`, sets `request.session["sub"]` and `request.session["email"]`, redirects to `/auth/success`
- `GET /auth/success` → serves a minimal HTML page that calls `window.close()` to close the login tab
- `POST /auth/logout` → clears `request.session`, returns 200
- `GET /auth/me` → returns current user info (sub, email, name) or 401

**Extension-side (no special auth code needed):**
The extension opens a browser tab to `/auth/login`. After OAuth completes, the server sets a session cookie on its domain and the tab closes. All subsequent `fetch()` calls from the extension use `credentials: "include"`, which automatically sends the cookie. No content scripts, no token extraction, no `chrome.storage` for auth.

**`get_current_user` dependency:**
```python
def get_current_user(request: Request) -> str:
    """Extract sub from session cookie, raise 401 if not authenticated."""
    sub = request.session.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return sub
```

Authlib integration:
```python
oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)
```

## routes/bookmarks.py

```
GET    /bookmarks               → list bookmarks (optional ?folder_id=, ?folder_id=root for None)
POST   /bookmarks               → create bookmark
GET    /bookmarks/{id}          → get one bookmark
PUT    /bookmarks/{id}          → full update
PATCH  /bookmarks/{id}          → partial update
DELETE /bookmarks/{id}          → delete
PATCH  /bookmarks/reorder       → update positions for multiple bookmarks at once
```

**Position assignment on create:** if `position` not provided, assign `max(existing positions in the same scope) + 1.0`. For root-level bookmarks (folder_id=None), this is the max across *both* root-level bookmarks and folders (shared position space). For bookmarks inside a folder, it's the max among siblings in that folder only.

**Reorder within a folder:** client sends `[{id: 1, position: 1.5}, {id: 2, position: 2.0}]` to `/bookmarks/reorder`. Server does a bulk update. No other rows touched.

**Favicon conversion:**
- On write: if `favicon` is a base64 data URL string, strip the prefix and `base64.b64decode()` before storing
- On read: `base64.b64encode(row.favicon).decode()` and re-add the data URL prefix from MIME type detection or a stored prefix

To preserve the exact MIME prefix, store it separately or store the full prefix alongside the blob. Simplest: add a `favicon_mime` column (e.g., `"image/png"`) and reconstruct as `f"data:{mime};base64,{b64}"`.

## routes/folders.py

```
GET    /folders                 → list all folders for user (ordered by position)
POST   /folders                 → create folder
GET    /folders/{id}            → get folder + its bookmarks (bookmarks ordered by position)
PUT    /folders/{id}            → update folder (rename and/or reposition)
DELETE /folders/{id}            → delete folder; set all bookmark.folder_id = None for bookmarks in it
```

**Position assignment on create:** if `position` not provided, assign `max(positions across root-level bookmarks AND folders) + 1.0` — shared position space with root bookmarks.

## Unified root reorder: `PATCH /reorder`

Root-level folders and bookmarks share one position sequence (interleaved in the grid). A single reorder endpoint handles both:

```
PATCH  /reorder                → bulk-update positions for root-level items (folders + bookmarks)
```

Request body:
```python
class ReorderItem(BaseModel):
    id: int
    position: float

class ReorderRequest(BaseModel):
    items: list[ReorderItem]
```

The handler updates `Item.position` directly (no need for `type` field since all items share the base table). All in one transaction. Duplicate positions trigger the DB unique constraint → caught and returned as 409 Conflict.

**Position uniqueness:** Enforced at the DB level via `UNIQUE(parent_id, position)` on the `items` base table. This covers both root-level items (parent_id=None) and bookmarks within a folder (parent_id=folder_id). Duplicate positions result in an `IntegrityError` which the handler catches and returns as 409 Conflict.

For bookmarks *inside* a folder, the existing `PATCH /bookmarks/reorder` endpoint handles that (scoped to folder siblings, same DB constraint applies).

## routes/settings.py

```
GET    /settings                → get or create (with defaults) settings row
PATCH  /settings                → partial update; returns updated settings
```

## routes/export_import.py

```
GET    /export                  → returns JSON with {bookmarks, folders, settings, exportDate, version}
POST   /import                  → accepts same JSON structure; replaces all data (bookmarks, folders, settings)
                                  runs in a transaction; on failure rolls back
```

Export converts favicon blobs back to base64 data URLs. Import converts data URLs to blobs.

## main.py

```python
app = FastAPI(title="QuiClick API")

app.add_middleware(
    SessionMiddleware,
    secret_key=cfg.secret_key,
    https_only=True,          # Secure flag — HTTPS only
    same_site="lax",          # CSRF protection
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["chrome-extension://<extension-id>"],  # specific extension only
    allow_credentials=True,   # allow cookies
    allow_methods=["*"],
    allow_headers=["Content-Type"],
)

app.include_router(auth.router)
app.include_router(bookmarks.router, prefix="/bookmarks")
app.include_router(folders.router, prefix="/folders")
app.include_router(reorder.router)           # PATCH /reorder
app.include_router(settings_router, prefix="/settings")
app.include_router(export_import.router)
```

## Error handling

- 401 if not authenticated (missing/invalid session cookie)
- 404 if bookmark/folder not found
- 404 also if the resource belongs to another user (same effect, no info leakage)
- 422 for validation errors (FastAPI default)
- 500 with generic message for unexpected DB errors

# Files to modify

| File | Action | Notes |
|------|--------|-------|
| `quiclick_server/__init__.py` | create | empty |
| `quiclick_server/main.py` | create | app factory |
| `quiclick_server/config.py` | create | env-based settings |
| `quiclick_server/auth.py` | create | OIDC routes + `current_user` dep |
| `quiclick_server/database.py` | create | engine factory, session dep |
| `quiclick_server/models.py` | create | ORM models |
| `quiclick_server/schemas.py` | create | Pydantic schemas |
| `quiclick_server/routes/__init__.py` | create | empty |
| `quiclick_server/routes/bookmarks.py` | create | bookmark CRUD + reorder |
| `quiclick_server/routes/folders.py` | create | folder CRUD |
| `quiclick_server/routes/reorder.py` | create | `PATCH /reorder` — unified root-level reorder |
| `quiclick_server/routes/settings.py` | create | settings get/patch |
| `quiclick_server/routes/export_import.py` | create | export/import |
| `pyproject.toml` | modify | add `authlib`, `httpx`, `environ-config`, `uvicorn` |
| `devenv.nix` | modify | set `QUICLICK_*` env vars; run uvicorn as a process |

# Verification, Success Criteria

## 1. Server starts
```bash
cd quiclick-server
uvicorn quiclick_server.main:app --reload
# Expected: "Uvicorn running on http://127.0.0.1:8000"
```

## 2. Unauthenticated request returns 401
```bash
curl http://localhost:8000/bookmarks
# Expected: {"detail": "Not authenticated"}
```

## 3. Auth flow (manual)
- Open `http://localhost:8000/auth/login` in browser
- Expected: redirected to Google login
- After login: redirected to `/auth/success`, tab closes, session cookie set
- For curl testing: `curl -c cookies.txt http://localhost:8000/auth/login` (follow redirects through OAuth)

## 4. Bookmark CRUD (with session cookie)
```bash
# Create
curl -b cookies.txt -X POST http://localhost:8000/bookmarks \
  -H "Content-Type: application/json" \
  -d '{"title":"GitHub","url":"https://github.com"}'
# Expected: {"id":1,"title":"GitHub","url":"https://github.com","favicon":null,...}

# List
curl -b cookies.txt http://localhost:8000/bookmarks
# Expected: [{"id":1,...}]

# Update
curl -b cookies.txt -X PUT http://localhost:8000/bookmarks/1 \
  -H "Content-Type: application/json" \
  -d '{"title":"GitHub Hub","url":"https://github.com"}'

# Delete
curl -b cookies.txt -X DELETE http://localhost:8000/bookmarks/1
# Expected: 204 No Content
```

## 5. Folder operations
```bash
curl -b cookies.txt -X POST http://localhost:8000/folders \
  -H "Content-Type: application/json" -d '{"name":"Work"}'
# Expected: {"id":1,"name":"Work",...}

# Move bookmark to folder
curl -b cookies.txt -X PATCH http://localhost:8000/bookmarks/1 \
  -H "Content-Type: application/json" -d '{"folder_id":1}'
```

## 6. Root reorder (folders + bookmarks interleaved)
```bash
curl -b cookies.txt -X PATCH http://localhost:8000/reorder \
  -H "Content-Type: application/json" \
  -d '{"items":[{"id":1,"position":1.0},{"id":2,"position":2.0}]}'
```

## 7. Export/Import round-trip
```bash
curl -b cookies.txt http://localhost:8000/export -o backup.json
curl -b cookies.txt -X POST http://localhost:8000/import \
  -H "Content-Type: application/json" -d @backup.json
# Expected: same data restored
```

## 8. Run tests
```bash
pytest tests/ -v
# Expected: all tests pass
```

# Todo items
1. Dependencies to pyproject.toml: authlib, httpx,...
2. Quiclick_server/config.py with Settings class (...
3. Quiclick_server/database.py with engine factory...
4. Quiclick_server/models.py with Bookmark, Folder...
5. Quiclick_server/schemas.py with all Pydantic re...
6. Quiclick_server/auth.py with Google OIDC routes...
7. Quiclick_server/routes/bookmarks.py with full C...
8. Quiclick_server/routes/folders.py with full CRU...
9. Quiclick_server/routes/settings.py with GET and...
10. Quiclick_server/routes/export_import.py with GE...
11. Quiclick_server/main.py wiring everything toget...
12. Devenv.nix to run uvicorn instead of Flask
13. Tests in tests/ covering auth guard, bookmark C...
