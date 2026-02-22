// QuiClick API Client
// Handles all communication with the QuiClick server

const API_BASE_URL = "https://local.fancyauth.com:8000";

class QuiClickAPI {
  constructor() {
    this.authenticated = false;
    this.user = null;
  }

  // --- HTTP helpers ---

  async _fetch(path, options = {}) {
    const url = `${API_BASE_URL}${path}`;
    const defaults = {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    };
    const response = await fetch(url, { ...defaults, ...options });
    if (response.status === 401) {
      this.authenticated = false;
      this.user = null;
      throw new Error("Not authenticated");
    }
    return response;
  }

  async _get(path) {
    const resp = await this._fetch(path);
    if (!resp.ok) throw new Error(`GET ${path} failed: ${resp.status}`);
    return resp.json();
  }

  async _post(path, body) {
    const resp = await this._fetch(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`POST ${path} failed: ${resp.status} ${detail}`);
    }
    if (resp.status === 204) return null;
    return resp.json();
  }

  async _patch(path, body) {
    const resp = await this._fetch(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`PATCH ${path} failed: ${resp.status} ${detail}`);
    }
    if (resp.status === 204) return null;
    return resp.json();
  }

  async _put(path, body) {
    const resp = await this._fetch(path, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`PUT ${path} failed: ${resp.status} ${detail}`);
    }
    return resp.json();
  }

  async _delete(path) {
    const resp = await this._fetch(path, { method: "DELETE" });
    if (!resp.ok && resp.status !== 204) {
      throw new Error(`DELETE ${path} failed: ${resp.status}`);
    }
  }

  // --- Auth ---

  async checkAuth() {
    try {
      const data = await this._get("/auth/me");
      this.authenticated = true;
      this.user = data;
      return data;
    } catch (e) {
      this.authenticated = false;
      this.user = null;
      return null;
    }
  }

  getLoginUrl() {
    return `${API_BASE_URL}/auth/login`;
  }

  async logout() {
    try {
      await this._post("/auth/logout", {});
    } catch (e) {
      // Ignore errors during logout
    }
    this.authenticated = false;
    this.user = null;
  }

  isAuthenticated() {
    return this.authenticated;
  }

  // --- Data model translation ---
  // Server uses: {id, type, title, url, favicon, date_added, parent_id, position}
  // Extension uses: {id, title, url, favicon, dateAdded, folderId}

  _serverBookmarkToExtension(serverBookmark) {
    return {
      id: serverBookmark.id,
      title: serverBookmark.title,
      url: serverBookmark.url,
      favicon: serverBookmark.favicon || "",
      dateAdded: serverBookmark.date_added,
      folderId: serverBookmark.parent_id,
    };
  }

  _serverFolderToExtension(serverFolder) {
    return {
      id: serverFolder.id,
      name: serverFolder.title,
      dateCreated: serverFolder.date_added,
    };
  }

  _serverSettingsToExtension(serverSettings) {
    return {
      showTitles: serverSettings.show_titles,
      tilesPerRow: serverSettings.tiles_per_row,
      tileGap: serverSettings.tile_gap,
      showAddButton: serverSettings.show_add_button,
    };
  }

  _extensionSettingsToServer(extSettings) {
    const result = {};
    if (extSettings.showTitles !== undefined)
      result.show_titles = extSettings.showTitles;
    if (extSettings.tilesPerRow !== undefined)
      result.tiles_per_row = extSettings.tilesPerRow;
    if (extSettings.tileGap !== undefined)
      result.tile_gap = extSettings.tileGap;
    if (extSettings.showAddButton !== undefined)
      result.show_add_button = extSettings.showAddButton;
    return result;
  }

  // --- Bookmarks ---

  async listBookmarks(folderId = null) {
    let path = "/bookmarks";
    if (folderId !== null && folderId !== undefined) {
      path += `?folder_id=${folderId}`;
    }
    const data = await this._get(path);
    return data.map((b) => this._serverBookmarkToExtension(b));
  }

  async createBookmark({ title, url, favicon, folderId, position }) {
    const body = {
      title,
      url,
      favicon: favicon || null,
      parent_id: folderId || null,
    };
    if (position !== undefined && position !== null) {
      body.position = position;
    }
    const data = await this._post("/bookmarks", body);
    return this._serverBookmarkToExtension(data);
  }

  async updateBookmark(bookmarkId, updates) {
    const body = {};
    if (updates.title !== undefined) body.title = updates.title;
    if (updates.url !== undefined) body.url = updates.url;
    if (updates.favicon !== undefined) body.favicon = updates.favicon || null;
    if (updates.folderId !== undefined) body.parent_id = updates.folderId;
    if (updates.position !== undefined) body.position = updates.position;
    const data = await this._patch(`/bookmarks/${bookmarkId}`, body);
    return this._serverBookmarkToExtension(data);
  }

  async deleteBookmark(bookmarkId) {
    await this._delete(`/bookmarks/${bookmarkId}`);
  }

  // --- Folders ---

  async listFolders() {
    const data = await this._get("/folders");
    return data.map((f) => this._serverFolderToExtension(f));
  }

  async createFolder({ name, position }) {
    const body = { title: name };
    if (position !== undefined && position !== null) {
      body.position = position;
    }
    const data = await this._post("/folders", body);
    return this._serverFolderToExtension(data);
  }

  async updateFolder(folderId, updates) {
    const body = { title: updates.name };
    if (updates.position !== undefined) body.position = updates.position;
    const data = await this._put(`/folders/${folderId}`, body);
    return this._serverFolderToExtension(data);
  }

  async deleteFolder(folderId) {
    await this._delete(`/folders/${folderId}`);
  }

  async getFolderWithBookmarks(folderId) {
    const data = await this._get(`/folders/${folderId}`);
    return {
      folder: this._serverFolderToExtension(data),
      bookmarks: (data.bookmarks || []).map((b) =>
        this._serverBookmarkToExtension(b),
      ),
    };
  }

  // --- Reorder ---

  async reorderItems(items) {
    // items: [{id, position}, ...]
    await this._patch("/reorder", { items });
  }

  async reorderBookmarks(items) {
    // items: [{id, position}, ...]
    await this._patch("/bookmarks/reorder", { items });
  }

  // --- Settings ---

  async getSettings() {
    const data = await this._get("/settings");
    return this._serverSettingsToExtension(data);
  }

  async patchSettings(settings) {
    const body = this._extensionSettingsToServer(settings);
    const data = await this._patch("/settings", body);
    return this._serverSettingsToExtension(data);
  }

  // --- Export / Import ---

  async exportData() {
    return this._get("/export");
  }

  async importData(data) {
    return this._post("/import", data);
  }

  // --- Delta sync ---

  /**
   * Fetch changes from server since the given date.
   * @param {string|null} ifModifiedSince - RFC 2822 date string, or null for full pull
   * @returns {object} { status: 200|304|401, data: ChangesResponse|null, lastModified: string|null }
   */
  async getChanges(ifModifiedSince = null) {
    const url = `${API_BASE_URL}/changes`;
    const headers = { "Content-Type": "application/json" };
    if (ifModifiedSince) {
      headers["If-Modified-Since"] = ifModifiedSince;
    }
    const resp = await fetch(url, {
      credentials: "include",
      headers,
    });

    if (resp.status === 304) {
      return { status: 304, data: null, lastModified: null };
    }
    if (resp.status === 401) {
      return { status: 401, data: null, lastModified: null };
    }
    if (!resp.ok) {
      throw new Error(`GET /changes failed: ${resp.status}`);
    }

    const data = await resp.json();
    const lastModified = resp.headers.get("Last-Modified");
    return { status: 200, data, lastModified };
  }
}

// Singleton instance
export const api = new QuiClickAPI();
