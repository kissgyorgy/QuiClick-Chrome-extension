// Favicon fetching, caching, displaying, and selecting

export const faviconMethods = {
  extractTitleFromDocument(doc) {
    // Try different title sources in order of preference
    const titleSources = [
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      "title",
      "h1",
    ];

    for (const selector of titleSources) {
      const element = doc.querySelector(selector);
      if (element) {
        const title =
          element.getAttribute("content") || element.textContent || "";
        const cleanTitle = title.trim();
        if (cleanTitle) {
          return cleanTitle;
        }
      }
    }

    return null;
  },

  async getHighResolutionFavicon(url) {
    const hostname = new URL(url).hostname;
    const origin = new URL(url).origin;

    // Check if we have a cached favicon for this domain
    const cachedFavicon = await this.getCachedFavicon(hostname);
    if (cachedFavicon) {
      return cachedFavicon;
    }

    let faviconUrl = null;

    // First try to parse HTML to find declared favicon links
    try {
      const response = await fetch(url);
      if (response.ok) {
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        // Look for various favicon declarations in order of preference
        const faviconSelectors = [
          'link[rel*="icon"][sizes*="192"]',
          'link[rel*="icon"][sizes*="180"]',
          'link[rel*="icon"][sizes*="152"]',
          'link[rel*="icon"][sizes*="144"]',
          'link[rel*="icon"][sizes*="128"]',
          'link[rel*="icon"][sizes*="96"]',
          'link[rel*="icon"][sizes*="72"]',
          'link[rel*="icon"][sizes*="64"]',
          'link[rel*="icon"][sizes*="48"]',
          'link[rel*="icon"][sizes*="32"]',
          'link[rel="apple-touch-icon"]',
          'link[rel="apple-touch-icon-precomposed"]',
          'link[rel="icon"]',
          'link[rel="shortcut icon"]',
        ];

        for (const selector of faviconSelectors) {
          const link = doc.querySelector(selector);
          if (link && link.href) {
            const testUrl = new URL(link.href, url).href;
            // Test if the favicon actually exists and download it
            const cachedData = await this.downloadAndCacheFavicon(
              hostname,
              testUrl,
            );
            if (cachedData) {
              return cachedData;
            }
          }
        }
      }
    } catch (e) {
      // If HTML parsing fails, fall back to hardcoded paths
    }

    // Fallback to common favicon paths
    const faviconSources = [
      `${origin}/apple-touch-icon.png`,
      `${origin}/apple-touch-icon-180x180.png`,
      `${origin}/apple-touch-icon-152x152.png`,
      `${origin}/apple-touch-icon-144x144.png`,
      `${origin}/apple-touch-icon-120x120.png`,
      `${origin}/android-chrome-192x192.png`,
      `${origin}/favicon-196x196.png`,
      `${origin}/favicon-128x128.png`,
      `${origin}/favicon-96x96.png`,
      `${origin}/favicon-64x64.png`,
      `${origin}/favicon-32x32.png`,
      `${origin}/favicon.png`,
      `${origin}/favicon.ico`,
    ];

    for (const testUrl of faviconSources) {
      const cachedData = await this.downloadAndCacheFavicon(hostname, testUrl);
      if (cachedData) {
        return cachedData;
      }
    }

    // If no favicon found, return null (no fallback)
    return null;
  },

  async testFaviconUrl(url) {
    try {
      const response = await fetch(url, {
        method: "HEAD",
        mode: "no-cors",
      });
      return response.ok || response.type === "opaque";
    } catch (e) {
      return false;
    }
  },

  async getCachedFavicon(hostname) {
    try {
      const result = await chrome.storage.local.get(["faviconCache"]);
      const cache = result.faviconCache || {};
      return cache[hostname] || null;
    } catch (e) {
      console.log("Failed to get cached favicon:", e);
      return null;
    }
  },

  async downloadAndCacheFavicon(hostname, faviconUrl) {
    try {
      const response = await fetch(faviconUrl);
      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();

      // Check if it's a valid image
      if (!blob.type.startsWith("image/")) {
        return null;
      }

      // Convert to base64 data URL
      const base64Data = await this.blobToBase64(blob);

      // Cache the favicon
      await this.cacheFavicon(hostname, base64Data);

      return base64Data;
    } catch (e) {
      console.log("Failed to download favicon:", e);
      return null;
    }
  },

  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },

  async cacheFavicon(hostname, base64Data) {
    try {
      const result = await chrome.storage.local.get(["faviconCache"]);
      const cache = result.faviconCache || {};
      cache[hostname] = base64Data;

      // Limit cache size by removing old entries if needed
      const cacheKeys = Object.keys(cache);
      if (cacheKeys.length > 100) {
        // Remove the oldest 20 entries (simple cleanup)
        cacheKeys.slice(0, 20).forEach((key) => delete cache[key]);
      }

      await chrome.storage.local.set({ faviconCache: cache });
    } catch (e) {
      console.log("Failed to cache favicon:", e);
    }
  },

  async cleanupUnusedFavicons() {
    try {
      const result = await chrome.storage.local.get(["faviconCache"]);
      const cache = result.faviconCache || {};

      // Get all hostnames currently used by bookmarks
      const usedHostnames = new Set();
      for (const bookmark of this.bookmarks) {
        if (bookmark.url) {
          try {
            const hostname = new URL(bookmark.url).hostname;
            usedHostnames.add(hostname);
          } catch (e) {
            // Invalid URL, skip
          }
        }
      }

      // Remove cached favicons for hostnames no longer used
      const cacheKeys = Object.keys(cache);
      let removed = 0;
      for (const hostname of cacheKeys) {
        if (!usedHostnames.has(hostname)) {
          delete cache[hostname];
          removed++;
        }
      }

      if (removed > 0) {
        await chrome.storage.local.set({ faviconCache: cache });
        console.log(`Cleaned up ${removed} unused favicons from cache`);
      }
    } catch (e) {
      console.log("Failed to cleanup favicon cache:", e);
    }
  },

  handleUrlInputChange(url) {
    if (this.faviconDebounceTimer) {
      clearTimeout(this.faviconDebounceTimer);
    }

    if (!url || !this.isValidUrlOrCanBeNormalized(url)) {
      document.getElementById("faviconSelection").classList.add("hidden");
      this.selectedFavicon = null;
      return;
    }

    // Show favicon selection UI immediately
    const faviconSelection = document.getElementById("faviconSelection");
    const faviconOptions = document.getElementById("faviconOptions");
    faviconSelection.classList.remove("hidden");
    faviconOptions.innerHTML =
      '<div class="text-sm text-gray-500 col-span-6 text-center">Loading favicon options...</div>';

    this.faviconDebounceTimer = setTimeout(() => {
      const normalizedUrl = this.normalizeUrl(url);

      // Update the input field with the normalized URL if it changed
      if (normalizedUrl !== url) {
        document.getElementById("bookmarkUrl").value = normalizedUrl;
      }

      this.loadFaviconOptions(normalizedUrl);
    }, 500);
  },

  handleEditUrlInputChange(url) {
    if (this.editFaviconDebounceTimer) {
      clearTimeout(this.editFaviconDebounceTimer);
    }

    if (!url || !this.isValidUrlOrCanBeNormalized(url)) {
      document.getElementById("editFaviconSelection").classList.add("hidden");
      this.selectedEditFavicon = null;
      return;
    }

    // Show favicon selection UI immediately
    const faviconSelection = document.getElementById("editFaviconSelection");
    const faviconOptions = document.getElementById("editFaviconOptions");
    faviconSelection.classList.remove("hidden");
    faviconOptions.innerHTML =
      '<div class="text-sm text-gray-500 col-span-6 text-center">Loading favicon options...</div>';

    this.editFaviconDebounceTimer = setTimeout(() => {
      const normalizedUrl = this.normalizeUrl(url);

      // Update the input field with the normalized URL if it changed
      if (normalizedUrl !== url) {
        document.getElementById("editBookmarkUrl").value = normalizedUrl;
      }

      this.loadEditFaviconOptions(normalizedUrl);
    }, 500);
  },

  async loadFaviconOptions(url) {
    const faviconSelection = document.getElementById("faviconSelection");
    const faviconOptions = document.getElementById("faviconOptions");

    faviconSelection.classList.remove("hidden");
    faviconOptions.innerHTML =
      '<div class="text-sm text-gray-500 col-span-6 text-center">Loading favicon options...</div>';

    try {
      const result = await this.getAllFaviconUrlsAndTitle(url);
      this.displayFaviconOptions(result.faviconUrls);

      // Auto-fill title if it's empty and we extracted a title
      const titleInput = document.getElementById("bookmarkTitle");
      if (
        result.pageTitle &&
        (!titleInput.value || titleInput.value.trim() === "")
      ) {
        titleInput.value = result.pageTitle;
      }
    } catch (error) {
      faviconOptions.innerHTML =
        '<div class="text-sm text-red-500 col-span-6 text-center">Failed to load favicon options</div>';
    }
  },

  async loadEditFaviconOptions(url) {
    const faviconSelection = document.getElementById("editFaviconSelection");
    const faviconOptions = document.getElementById("editFaviconOptions");

    faviconSelection.classList.remove("hidden");
    faviconOptions.innerHTML =
      '<div class="text-sm text-gray-500 col-span-6 text-center">Loading favicon options...</div>';

    try {
      const result = await this.getAllFaviconUrlsAndTitle(url);
      this.displayEditFaviconOptions(result.faviconUrls);

      // Auto-fill title if it's empty and we extracted a title
      const titleInput = document.getElementById("editBookmarkTitle");
      if (
        result.pageTitle &&
        (!titleInput.value || titleInput.value.trim() === "")
      ) {
        titleInput.value = result.pageTitle;
      }
    } catch (error) {
      faviconOptions.innerHTML =
        '<div class="text-sm text-red-500 col-span-6 text-center">Failed to load favicon options</div>';
    }
  },

  async getAllFaviconUrls(url) {
    const result = await this.getAllFaviconUrlsAndTitle(url);
    return result.faviconUrls;
  },

  async getAllFaviconUrlsAndTitle(url) {
    const hostname = new URL(url).hostname;
    const origin = new URL(url).origin;
    const faviconUrls = [];
    let pageTitle = null;

    // Check if we have a cached favicon for this domain
    const cachedFavicon = await this.getCachedFavicon(hostname);
    if (cachedFavicon) {
      faviconUrls.push({
        url: cachedFavicon,
        label: "Cached Favicon",
      });
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        // Extract page title
        pageTitle = this.extractTitleFromDocument(doc);

        const faviconSelectors = [
          'link[rel*="icon"][sizes*="192"]',
          'link[rel*="icon"][sizes*="180"]',
          'link[rel*="icon"][sizes*="152"]',
          'link[rel*="icon"][sizes*="144"]',
          'link[rel*="icon"][sizes*="128"]',
          'link[rel*="icon"][sizes*="96"]',
          'link[rel="apple-touch-icon"]',
          'link[rel="apple-touch-icon-precomposed"]',
          'link[rel="icon"]',
          'link[rel="shortcut icon"]',
        ];

        for (const selector of faviconSelectors) {
          const links = doc.querySelectorAll(selector);
          for (const link of links) {
            if (link.href) {
              const faviconUrl = new URL(link.href, url).href;
              const sizes = link.getAttribute("sizes") || "unspecified";
              faviconUrls.push({
                url: faviconUrl,
                label: `${link.rel} (${sizes})`,
              });
            }
          }
        }
      }
    } catch (e) {
      console.log("Could not parse HTML for favicons");
    }

    // Add alternative favicon services (these work better for authentication-protected sites)
    const alternativeSources = [
      {
        url: `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
        label: "DuckDuckGo Favicon",
      },
      {
        url: `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
        label: "Google Favicon (64px)",
      },
    ];

    for (const { url: faviconUrl, label } of alternativeSources) {
      faviconUrls.push({
        url: faviconUrl,
        label: label,
      });
    }

    // Add common favicon paths
    const commonPaths = [
      { path: "/apple-touch-icon.png", label: "Apple Touch Icon" },
      { path: "/favicon-192x192.png", label: "Android Chrome 192x192" },
      { path: "/favicon-96x96.png", label: "Favicon 96x96" },
      { path: "/favicon-32x32.png", label: "Favicon 32x32" },
      { path: "/favicon.ico", label: "Classic Favicon" },
    ];

    for (const { path, label } of commonPaths) {
      faviconUrls.push({
        url: `${origin}${path}`,
        label: label,
      });
    }

    // Remove duplicates
    const uniqueUrls = [];
    const seenUrls = new Set();
    for (const favicon of faviconUrls) {
      if (!seenUrls.has(favicon.url)) {
        seenUrls.add(favicon.url);
        uniqueUrls.push(favicon);
      }
    }

    return {
      faviconUrls: uniqueUrls,
      pageTitle: pageTitle,
    };
  },

  async displayFaviconOptions(faviconUrls) {
    const faviconOptions = document.getElementById("faviconOptions");

    if (faviconUrls.length === 0) {
      faviconOptions.innerHTML =
        '<div class="text-sm text-gray-500 col-span-6 text-center">No favicon options found</div>';
      return;
    }

    faviconOptions.innerHTML = "";

    for (let i = 0; i < faviconUrls.length; i++) {
      const favicon = faviconUrls[i];
      const faviconElement = document.createElement("div");
      faviconElement.className =
        "favicon-option w-10 h-10 border border-gray-300 rounded cursor-pointer hover:border-blue-500 flex items-center justify-center bg-white transition-colors";
      faviconElement.title = favicon.label;
      faviconElement.dataset.faviconUrl = favicon.url;

      const img = document.createElement("img");
      img.src = favicon.url;
      img.className = "w-8 h-8 rounded";
      img.style.display = "block";

      const fallback = document.createElement("div");
      fallback.className =
        "w-8 h-8 bg-gray-300 rounded flex items-center justify-center text-xs text-gray-600";
      fallback.textContent = "?";
      fallback.style.display = "none";

      img.onerror = () => {
        img.style.display = "none";
        fallback.style.display = "flex";
        // Mark this favicon as problematic
        faviconElement.classList.add("favicon-error");
        faviconElement.title = favicon.label + " (failed to load)";
      };

      faviconElement.appendChild(img);
      faviconElement.appendChild(fallback);

      faviconElement.addEventListener("click", async () => {
        await this.selectFavicon(faviconElement, favicon.url);
      });

      faviconOptions.appendChild(faviconElement);

      // Auto-select first option
      if (i === 0) {
        await this.selectFavicon(faviconElement, favicon.url);
      }
    }
  },

  async displayEditFaviconOptions(faviconUrls) {
    const faviconOptions = document.getElementById("editFaviconOptions");

    if (faviconUrls.length === 0) {
      faviconOptions.innerHTML =
        '<div class="text-sm text-gray-500 col-span-6 text-center">No favicon options found</div>';
      return;
    }

    faviconOptions.innerHTML = "";

    for (let i = 0; i < faviconUrls.length; i++) {
      const favicon = faviconUrls[i];
      const faviconElement = document.createElement("div");
      faviconElement.className =
        "edit-favicon-option w-10 h-10 border border-gray-300 rounded cursor-pointer hover:border-blue-500 flex items-center justify-center bg-white transition-colors";
      faviconElement.title = favicon.label;
      faviconElement.dataset.faviconUrl = favicon.url;

      const img = document.createElement("img");
      img.src = favicon.url;
      img.className = "w-8 h-8 rounded";
      img.style.display = "block";

      const fallback = document.createElement("div");
      fallback.className =
        "w-8 h-8 bg-gray-300 rounded flex items-center justify-center text-xs text-gray-600";
      fallback.textContent = "?";
      fallback.style.display = "none";

      img.onerror = () => {
        img.style.display = "none";
        fallback.style.display = "flex";
        // Mark this favicon as problematic
        faviconElement.classList.add("favicon-error");
        faviconElement.title = favicon.label + " (failed to load)";
      };

      faviconElement.appendChild(img);
      faviconElement.appendChild(fallback);

      faviconElement.addEventListener("click", async () => {
        await this.selectEditFavicon(faviconElement, favicon.url);
      });

      faviconOptions.appendChild(faviconElement);

      // Auto-select first option
      if (i === 0) {
        await this.selectEditFavicon(faviconElement, favicon.url);
      }
    }
  },

  async selectFavicon(element, url) {
    // Remove previous selection
    const currentSelected = document.querySelector(".favicon-option.selected");
    if (currentSelected) {
      currentSelected.classList.remove(
        "selected",
        "border-blue-500",
        "bg-blue-50",
      );
      currentSelected.classList.add("border-gray-300", "bg-white");
      currentSelected.style.borderWidth = "1px";
    }

    // Add selection to new element
    element.classList.remove("border-gray-300", "bg-white");
    element.classList.add("selected", "border-blue-500", "bg-blue-50");
    element.style.borderWidth = "2px";

    // If this is not already a cached favicon (base64 data URL), cache it
    if (!url.startsWith("data:")) {
      const normalizedUrl = this.normalizeUrl(
        document.getElementById("bookmarkUrl").value,
      );
      const hostname = new URL(normalizedUrl).hostname;
      const cachedData = await this.downloadAndCacheFavicon(hostname, url);
      if (cachedData) {
        this.selectedFavicon = cachedData;
      } else {
        this.selectedFavicon = null; // Don't use external URL if caching fails
      }
    } else {
      this.selectedFavicon = url;
    }
  },

  async selectEditFavicon(element, url) {
    // Remove previous selection
    const currentSelected = document.querySelector(
      ".edit-favicon-option.selected",
    );
    if (currentSelected) {
      currentSelected.classList.remove(
        "selected",
        "border-blue-500",
        "bg-blue-50",
      );
      currentSelected.classList.add("border-gray-300", "bg-white");
      currentSelected.style.borderWidth = "1px";
    }

    // Add selection to new element
    element.classList.remove("border-gray-300", "bg-white");
    element.classList.add("selected", "border-blue-500", "bg-blue-50");
    element.style.borderWidth = "2px";

    // If this is not already a cached favicon (base64 data URL), cache it
    if (!url.startsWith("data:")) {
      const normalizedUrl = this.normalizeUrl(
        document.getElementById("editBookmarkUrl").value,
      );
      const hostname = new URL(normalizedUrl).hostname;
      const cachedData = await this.downloadAndCacheFavicon(hostname, url);
      if (cachedData) {
        this.selectedEditFavicon = cachedData;
      } else {
        this.selectedEditFavicon = null; // Don't use external URL if caching fails
      }
    } else {
      this.selectedEditFavicon = url;
    }
  },

  async updateFaviconAsync(bookmarkId, url) {
    try {
      const faviconUrl = await this.getHighResolutionFavicon(url);
      const bookmarkIndex = this.bookmarks.findIndex(
        (b) => b.id === bookmarkId,
      );

      if (bookmarkIndex !== -1 && faviconUrl) {
        this.bookmarks[bookmarkIndex].favicon = faviconUrl;
        this.bookmarks[bookmarkIndex].lastUpdated = new Date().toISOString();
        await this.saveBookmarks();
        // Enqueue sync for favicon update
        enqueueSync("update_bookmark", {
          id: bookmarkId,
          updates: { favicon: faviconUrl },
        });

        const bookmarkElement = document.querySelector(
          `[data-bookmark-id="${bookmarkId}"]`,
        );
        if (bookmarkElement) {
          const faviconImg = bookmarkElement.querySelector(".bookmark-favicon");
          const fallbackDiv =
            bookmarkElement.querySelector(".bookmark-fallback");

          if (faviconImg && fallbackDiv) {
            faviconImg.src = faviconUrl;
            faviconImg.style.display = "block";
            fallbackDiv.style.display = "none";

            // Since we're using base64 data URLs, errors should be rare
            faviconImg.onerror = () => {
              faviconImg.style.display = "none";
              fallbackDiv.style.display = "block";
            };
          }
        }
      }
    } catch (error) {
      console.log("Failed to update favicon asynchronously:", error);
    }
  },
};
