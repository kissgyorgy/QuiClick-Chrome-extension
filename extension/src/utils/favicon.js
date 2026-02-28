// Pure favicon fetch, cache, and discovery logic

export function extractTitleFromDocument(doc) {
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
}

export async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function getCachedFavicon(hostname) {
  try {
    const result = await chrome.storage.local.get(["faviconCache"]);
    const cache = result.faviconCache || {};
    return cache[hostname] || null;
  } catch (e) {
    console.log("Failed to get cached favicon:", e);
    return null;
  }
}

export async function cacheFavicon(hostname, base64Data) {
  try {
    const result = await chrome.storage.local.get(["faviconCache"]);
    const cache = result.faviconCache || {};
    cache[hostname] = base64Data;

    // Limit cache size by removing old entries if needed
    const cacheKeys = Object.keys(cache);
    if (cacheKeys.length > 100) {
      cacheKeys.slice(0, 20).forEach((key) => delete cache[key]);
    }

    await chrome.storage.local.set({ faviconCache: cache });
  } catch (e) {
    console.log("Failed to cache favicon:", e);
  }
}

export async function downloadAndCacheFavicon(hostname, faviconUrl) {
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

    const base64Data = await blobToBase64(blob);
    await cacheFavicon(hostname, base64Data);
    return base64Data;
  } catch (e) {
    console.log("Failed to download favicon:", e);
    return null;
  }
}

export async function getHighResolutionFavicon(url) {
  const hostname = new URL(url).hostname;
  const origin = new URL(url).origin;

  const cachedFavicon = await getCachedFavicon(hostname);
  if (cachedFavicon) {
    return cachedFavicon;
  }

  // First try to parse HTML to find declared favicon links
  try {
    const response = await fetch(url);
    if (response.ok) {
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

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
          const cachedData = await downloadAndCacheFavicon(hostname, testUrl);
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
    const cachedData = await downloadAndCacheFavicon(hostname, testUrl);
    if (cachedData) {
      return cachedData;
    }
  }

  return null;
}

export async function getAllFaviconUrlsAndTitle(url) {
  const hostname = new URL(url).hostname;
  const origin = new URL(url).origin;
  const faviconUrls = [];
  let pageTitle = null;

  // Check if we have a cached favicon for this domain
  const cachedFavicon = await getCachedFavicon(hostname);
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

      pageTitle = extractTitleFromDocument(doc);

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

  // Add alternative favicon services
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
    faviconUrls.push({ url: faviconUrl, label });
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
    faviconUrls.push({ url: `${origin}${path}`, label });
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

  return { faviconUrls: uniqueUrls, pageTitle };
}

export async function cleanupUnusedFavicons(bookmarks) {
  try {
    const result = await chrome.storage.local.get(["faviconCache"]);
    const cache = result.faviconCache || {};

    const usedHostnames = new Set();
    for (const bookmark of bookmarks) {
      if (bookmark.url) {
        try {
          const hostname = new URL(bookmark.url).hostname;
          usedHostnames.add(hostname);
        } catch (e) {
          // Invalid URL, skip
        }
      }
    }

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
}
