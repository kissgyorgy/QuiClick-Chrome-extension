# Overview

Refactor QuiClick extension to be fully offline-first with delta sync: all data is saved to `chrome.storage.local` immediately, a background service worker pushes changes to the server via a persistent queue, and pulls remote changes on startup using `last_updated` timestamps and standard HTTP caching headers (`Last-Modified` / `If-Modified-Since`). Soft deletes on the server ensure deletions propagate correctly. The frontend never makes API calls directly.

# Architecture

The extension uses a **storage-driven change queue** for push and **timestamp-based delta pull** for receiving server changes:

1. **Frontend** (script.js, popup.js) writes bookmarks/folders/settings directly to `chrome.storage.local` with `lastUpdated` timestamps, and appends sync operations to a `syncQueue` array in storage.
2. **Background worker** (background.js) watches `chrome.storage.onChanged` for queue changes, processes push operations one by one, and on every startup does a single `GET /changes` request (with `If-Modified-Since`) to pull remote deltas.
3. **Auth** is owned by the background worker — it checks auth status on startup and writes `authState` to storage.
4. On failures, the worker uses **exponential backoff** (1s → 2s → 4s → ... → 30 min cap) via `chrome.alarms`.
5. **Delta pull**: Every item (bookmark, folder, settings) has a `last_updated` timestamp on both server and local storage. On pull, the server returns only items changed since `If-Modified-Since`. Latest timestamp wins — if server's is newer, overwrite local. Soft-deleted items (with `deleted_at`) are removed locally.

```
┌─────────────────┐       chrome.storage.local         ┌──────────────────┐
│                 │  ──── bookmarks, folders ────────► │                  │
│  Frontend       │  ──── syncQueue (append) ────────► │  Background      │
│  (script.js,    │  ◄─── authState (read) ──────────  │  Worker          │────► Server API
│   popup.js)     │  ◄─── bookmarks (from pull) ─────  │  (background.js) │◄──── GET /changes
│                 │                                    │                  │
│  Reads/writes   │       chrome.storage.onChanged     │  Push: syncQueue │
│  local storage  │  ─────────────────────────────────►│  Pull: on startup│
│  only           │                                    │  via delta query │
└─────────────────┘                                    └──────────────────┘
```

# Implementation plan

## 1. Data model changes — `last_updated` timestamps

### Server: Add `last_updated` to all items

The `Item` base model (parent of Bookmark and Folder) gets a `last_updated` column:

```python
# models.py — Item table
last_updated = Column(DateTime, nullable=False,
    default=lambda: datetime.now(timezone.utc),
    onupdate=lambda: datetime.now(timezone.utc))
```

The `Settings` table also gets `last_updated`.

### Server: Add `deleted_at` for soft deletes

```python
# models.py — Item table
deleted_at = Column(DateTime, nullable=True, default=None)
```

When deleting a bookmark or folder, instead of `DELETE`, set `deleted_at = now()` and `last_updated = now()`. Existing delete endpoints become soft deletes.

### Extension: Add `lastUpdated` to local data

Each bookmark, folder, and settings object in `chrome.storage.local` gets a `lastUpdated` ISO string timestamp. The frontend sets this on every local mutation.

## 2. New server endpoint: `GET /changes`

```
GET /changes
If-Modified-Since: <RFC 2822 date>

Response (200 OK):
Last-Modified: <RFC 2822 date — max last_updated across all returned items>
Content-Type: application/json

{
  "user": { "sub": "...", "email": "...", "name": "..." },
  "bookmarks": [ ... items where last_updated > since ... ],
  "folders": [ ... ],
  "settings": { ... } or null,
  "deleted_ids": [42, 55, ...]    // items where deleted_at is set and last_updated > since
}

Response (304 Not Modified) — no body, nothing changed

Response (401 Unauthorized) — not authenticated
```

The endpoint requires authentication (via `get_db` dependency) and returns the current user info in `user`, eliminating the need for a separate `GET /auth/me` call. The background worker uses this single endpoint to both check auth and pull changes.

The endpoint queries all items where `last_updated > parsed(If-Modified-Since)`. If no `If-Modified-Since` header, return everything (full pull — used for initial sync).

Deleted items (where `deleted_at IS NOT NULL`) are returned as IDs in `deleted_ids` so the extension can remove them locally.

The `Last-Modified` response header is set to `max(last_updated)` across all items returned. The extension stores this and sends it as `If-Modified-Since` on the next pull.

A `401` response means the user is not authenticated — the worker writes `authState: { authenticated: false }` to storage.

## 3. Sync queue data model (push)

Queue items stored in `chrome.storage.local` under key `syncQueue`:

```js
{
  id: string,          // unique ID (Date.now() + random)
  type: string,        // operation type
  payload: object,     // operation-specific data
  createdAt: number    // Date.now() timestamp
}

// Operation types:
// - 'create_bookmark'   payload: { localId, title, url, favicon, folderId, position }
// - 'update_bookmark'   payload: { id, updates: { title?, url?, favicon?, folderId?, position? } }
// - 'delete_bookmark'   payload: { id }
// - 'create_folder'     payload: { localId, name, position }
// - 'update_folder'     payload: { id, updates: { name?, position? } }
// - 'delete_folder'     payload: { id }
// - 'reorder'           payload: { items: [{ id, position }] }
// - 'update_settings'   payload: { settings: { showTitles?, tilesPerRow?, tileGap?, showAddButton? } }
// - 'full_push'         payload: {} (push entire local state via /import endpoint)
```

## 4. Auth state in storage

Derived from the `GET /changes` response — no separate auth check needed.

```js
// Stored under key 'authState':
{
  authenticated: boolean,       // true if /changes returns 200, false if 401
  user: { sub, email, name } | null,  // from response.user
  lastChecked: number           // Date.now()
}
```

## 5. Backoff state in storage

```js
// Stored under key 'syncBackoff':
{ retryCount: number, nextRetryAt: number | null }
```

Backoff formula: `min(1000 * 2^retryCount, 30 * 60 * 1000)` (1s → ... → 30 min cap).

## 6. Local-to-server ID mapping

When the worker creates a bookmark/folder on the server, it gets a server-assigned ID. The worker:

1. Updates the item's ID in the `bookmarks`/`folders` array in storage
2. Scans remaining `syncQueue` items and replaces references to the old local ID
3. Stores mapping in `idMap`: `{ "localId": serverId }`

## 7. Background worker (background.js) — complete rewrite

### On startup:

- `importScripts('api.js')` to get the API client
- **Delta pull + auth check in one request**: Call `GET /changes` with `If-Modified-Since` from stored `lastPullDate`.
  - `200`: Write `authState: { authenticated: true, user: response.user }`, apply data changes to local storage (latest `lastUpdated` wins), store `Last-Modified` as `lastPullDate`.
  - `304`: Write `authState: { authenticated: true, ... }` (still authenticated, no data changes).
  - `401`: Write `authState: { authenticated: false, user: null }`.
  - Network error: Keep existing `authState`, skip pull.
- Process any pending `syncQueue` items (only if authenticated)

### On `chrome.storage.onChanged` (syncQueue changed):

- Wake up and process queue

### On `chrome.alarms` (backoff retry):

- Retry queue processing

### Delta pull logic (`pullChanges`):

```
1. Read lastPullDate from storage (null on first run)
2. GET /changes with If-Modified-Since: lastPullDate
3. If 401:
   - Write authState: { authenticated: false, user: null }
   - Return (don't process queue)
4. If 304:
   - Write authState: { authenticated: true, user: <keep existing> }
   - Nothing else to do
5. If 200:
   a. Write authState: { authenticated: true, user: response.user }
   b. For each bookmark in response:
      - Find local bookmark by server ID
      - If not found locally → add it (new item from another device)
      - If found and server lastUpdated > local lastUpdated → overwrite local
      - If found and local lastUpdated >= server → keep local (local is newer)
   c. Same for folders
   d. For settings: compare lastUpdated, latest wins
   e. For deleted_ids: remove those IDs from local bookmarks/folders
   f. Store Last-Modified header value as lastPullDate
   g. Write updated bookmarks/folders to chrome.storage.local
```

### Queue processing (`processQueue`):

- Guard against concurrent processing via `isProcessing` flag
- Loop: read queue, process first item, remove on success, reset backoff
- On network/5xx error: increment backoff, set alarm for retry
- On 4xx error: log and skip (remove from queue)
- After processing a create: update local ID with server ID, rewrite queue references

### Login/logout flow:

- Frontend writes `authAction: 'login_started'` → worker calls `GET /changes` to check if session is now active
- Frontend writes `authAction: 'logout'` → worker calls `POST /auth/logout`, then writes `authState: { authenticated: false, user: null }`
- Worker writes `authAction: null` after processing

## 8. Frontend helper: enqueueSync()

New `sync-queue.js` file:

- `enqueueSync(type, payload)`: reads `syncQueue` from storage, coalesces `update_settings` and `reorder` (keep latest), appends new item, writes back
- `SYNC_API_BASE_URL` constant

## 9. Frontend changes (script.js)

**Remove:** All `api.*` calls, `_syncCreateBookmark()`, `_syncAllPositions()`, `pullFromServer()`, `pushToServer()`, auth polling, `syncAvailable` property, sync button handlers.

**Modify `checkAuth()`:** Read `authState` from `chrome.storage.local`.

**Add `lastUpdated`:** Every local mutation sets `lastUpdated: new Date().toISOString()` on the affected item.

**Add `chrome.storage.onChanged` listener** for `authState`, `bookmarks`, `folders` changes (e.g., after background worker applies a pull).

**Replace** all inline sync calls with `enqueueSync()` after each local mutation.

**Remove** "Pull from Server" / "Push to Server" buttons and handlers.

## 10. Frontend changes (popup.js)

Remove `api.checkAuth()` and `api.createBookmark()`. After saving, call `enqueueSync('create_bookmark', {...})`.

## 11. Manifest changes

Add `"alarms"` to permissions.

## 12. HTML changes

- `newtab.html`: Remove `<script src="api.js">`, add `<script src="sync-queue.js">`, remove sync buttons from settings modal
- `popup.html`: Remove `<script src="api.js">`, add `<script src="sync-queue.js">`

## 13. Server changes

### Models:

- Add `last_updated` column to `Item` and `Settings`
- Add `deleted_at` column to `Item`
- Auto-update `last_updated` on every write

### Routes:

- Existing delete endpoints → set `deleted_at` instead of deleting
- Existing list/get endpoints → filter out soft-deleted items (`WHERE deleted_at IS NULL`)
- New `GET /changes` endpoint with `If-Modified-Since` / `Last-Modified` / `304` support

### Schemas:

- Add `last_updated` and `deleted_at` fields to response schemas
- New `ChangesResponse` schema

# Files to modify

### `extension/sync-queue.js` — **New file**

Shared `enqueueSync()` helper and `SYNC_API_BASE_URL` constant.

### `extension/background.js` — **Complete rewrite**

Sync engine: queue processor, delta pull, exponential backoff, auth management, ID mapping. Uses `importScripts('api.js', 'sync-queue.js')`.

### `extension/api.js` — **Add method**

Add `getChanges(ifModifiedSince)` method that does `GET /changes` with `If-Modified-Since` header and handles `304` responses.

### `extension/script.js` — **Major modifications**

Remove ~30 direct `api.*` calls, remove sync methods, add `enqueueSync()` calls, add `lastUpdated` on every mutation, change auth to storage-based, add storage change listener, remove sync UI.

### `extension/popup.js` — **Moderate modifications**

Remove API calls, add `enqueueSync()`, read auth from storage.

### `extension/manifest.json` — **Minor**

Add `"alarms"` permission.

### `extension/newtab.html` — **Minor**

Swap `api.js` → `sync-queue.js`, remove sync buttons HTML.

### `extension/popup.html` — **Minor**

Swap `api.js` → `sync-queue.js`.

### `server/quiclick_server/models.py` — **Add columns**

`last_updated` on Item and Settings, `deleted_at` on Item.

### `server/quiclick_server/routes/bookmarks.py` — **Modify**

Soft delete instead of hard delete. Filter out deleted items in list queries. Set `last_updated` on mutations.

### `server/quiclick_server/routes/folders.py` — **Modify**

Same: soft delete, filter, timestamps.

### `server/quiclick_server/routes/settings.py` — **Modify**

Set `last_updated` on mutations.

### `server/quiclick_server/routes/changes.py` — **New file**

`GET /changes` endpoint with `If-Modified-Since` / `Last-Modified` / `304` support.

### `server/quiclick_server/schemas.py` — **Add schemas**

`ChangesResponse`, add `last_updated`/`deleted_at` to existing response schemas.

# Verification, success criteria

## Extension testing with playwright-cli + Chromium

The extension is loaded into Chromium via `launchPersistentContext` with `--load-extension`.
This gives full access to `chrome.storage.local`, service workers, and all extension APIs.

**Prerequisites:** `chromium` package in devenv.nix with `PLAYWRIGHT_MCP_EXECUTABLE_PATH`
and `PLAYWRIGHT_MCP_BROWSER` env vars configured.

### Launch extension in Chromium

```bash
# 1. Open a base Chromium session
playwright-cli open

# 2. Launch persistent context with extension loaded
playwright-cli run-code "async page => {
  const bt = page.context().browser().browserType();
  const ctx = await bt.launchPersistentContext('/tmp/quiclick-test-profile', {
    headless: false,
    executablePath: '$(which chromium)',
    ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages', '--enable-automation'],
    args: [
      '--no-sandbox',
      '--disable-extensions-except=/home/walkman/Projects/quiclick/extension',
      '--load-extension=/home/walkman/Projects/quiclick/extension'
    ]
  });

  const sw = await ctx.waitForEvent('serviceworker', {timeout: 10000});
  const extId = sw.url().match(/chrome-extension:\/\/([^/]+)/)?.[1];

  const extPage = ctx.pages()[0];
  await extPage.goto('chrome-extension://' + extId + '/newtab.html');
  await extPage.waitForLoadState('domcontentloaded');

  const storage = await extPage.evaluate(async () => {
    const r = await chrome.storage.local.get(['bookmarks', 'folders', 'syncQueue', 'authState']);
    return {
      bookmarkCount: (r.bookmarks || []).length,
      folderCount: (r.folders || []).length,
      queueLength: (r.syncQueue || []).length,
      authState: r.authState || null
    };
  });

  await extPage.screenshot({path: '/tmp/quiclick-test.png'});
  await ctx.close();
  return { extId, title: await extPage.title(), storage };
}"
```

Expected: title = "QuiClick - New Tab", storage accessible, no crashes.

### What to verify after implementation

All tests should be in a single `run-code` block (globalThis doesn't persist across calls).

1. **Offline-first**: Add bookmark → check `chrome.storage.local` has it in both `bookmarks` (with `lastUpdated`) and `syncQueue`
2. **Sync queue**: Verify `syncQueue` entries have correct `type` and `payload`
3. **Settings**: Change setting → verify `bookmarkSettings` updated AND `syncQueue` has `update_settings`
4. **Auth in storage**: `authState` key exists, written by background worker
5. **Backoff**: With server down, verify `syncBackoff.retryCount` increments
6. **No frontend API calls**: Console shows NO fetches to API server from script.js/popup.js
7. **Delta pull**: After pushing changes, verify `lastPullDate` is set in storage
8. **Soft deletes**: Delete a bookmark locally → push → verify server has `deleted_at` set → on next pull, deleted item is removed from local storage

### Server endpoint tests

```bash
# Test GET /changes without If-Modified-Since (full pull)
curl -s https://local.fancyauth.com:8000/changes | python3 -m json.tool

# Test GET /changes with If-Modified-Since (delta pull)
curl -s -H "If-Modified-Since: Thu, 01 Jan 2026 00:00:00 GMT" \
  https://local.fancyauth.com:8000/changes | python3 -m json.tool

# Test 304 Not Modified (when nothing changed)
curl -s -o /dev/null -w "%{http_code}" \
  -H "If-Modified-Since: $(date -R)" \
  https://local.fancyauth.com:8000/changes
# Expected: 304
```

### Cleanup

```bash
playwright-cli close
rm -rf /tmp/quiclick-test-profile /tmp/quiclick-test.png
```

# Todo items

1. Add `last_updated` column to `Item` and `Settings` models, add `deleted_at` to `Item` model (server)
2. Update server delete endpoints to soft-delete (set `deleted_at`) instead of hard-delete
3. Update server list/get endpoints to filter out soft-deleted items
4. Create `GET /changes` endpoint with `If-Modified-Since` / `Last-Modified` / `304` support (server)
5. Update server schemas to include `last_updated` and `deleted_at` fields
6. Create `extension/sync-queue.js` with `enqueueSync()` helper
7. Add `getChanges()` method to `extension/api.js`
8. Rewrite `extension/background.js` with sync engine (queue processor, delta pull, backoff, auth, ID mapping)
9. Update `extension/manifest.json` to add `alarms` permission
10. Update `extension/script.js`: remove API calls, add `enqueueSync()` + `lastUpdated`, storage-based auth, storage change listener, remove sync UI
11. Update `extension/newtab.html`: swap `api.js` for `sync-queue.js`, remove sync buttons HTML
12. Update `extension/popup.js`: remove API calls, add `enqueueSync()`, read auth from storage
13. Update `extension/popup.html`: swap `api.js` for `sync-queue.js`
14. Test with playwright-cli + Chromium: verify full flow
15. Test server `/changes` endpoint with curl
