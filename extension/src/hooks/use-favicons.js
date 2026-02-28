import { useState, useEffect, useRef } from "preact/hooks";
import {
  getAllFaviconUrlsAndTitle,
  downloadAndCacheFavicon,
} from "../utils/favicon.js";
import { normalizeUrl, isValidUrlOrCanBeNormalized } from "../utils/url.js";

/**
 * useFaviconPicker(url, onTitleExtracted)
 *
 * Debounced favicon loading and selection.
 * Returns { faviconUrls, selectedFavicon, selectFavicon, isLoading, normalizedUrl }
 *
 * onTitleExtracted(title) — called when a page title is extracted from the URL
 */
export function useFaviconPicker(url, onTitleExtracted) {
  const [faviconUrls, setFaviconUrls] = useState([]);
  const [selectedFavicon, setSelectedFavicon] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [normalizedUrl, setNormalizedUrl] = useState(url || "");
  const debounceRef = useRef(null);
  const currentUrlRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!url || !isValidUrlOrCanBeNormalized(url)) {
      setFaviconUrls([]);
      setSelectedFavicon(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    debounceRef.current = setTimeout(async () => {
      const norm = normalizeUrl(url);
      setNormalizedUrl(norm);
      currentUrlRef.current = norm;

      try {
        const result = await getAllFaviconUrlsAndTitle(norm);

        // Abort if a newer request started
        if (currentUrlRef.current !== norm) return;

        setFaviconUrls(result.faviconUrls);

        if (result.pageTitle && onTitleExtracted) {
          onTitleExtracted(result.pageTitle);
        }

        // Auto-select first favicon
        if (result.faviconUrls.length > 0) {
          await selectFaviconByEntry(result.faviconUrls[0], norm);
        }
      } catch (err) {
        console.log("Favicon load error:", err);
      } finally {
        if (currentUrlRef.current === norm) setIsLoading(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [url]);

  async function selectFaviconByEntry(entry, forUrl) {
    const entryUrl = typeof entry === "string" ? entry : entry.url;

    if (entryUrl.startsWith("data:")) {
      setSelectedFavicon(entryUrl);
      return;
    }

    try {
      const pageUrl = forUrl || normalizedUrl;
      const hostname = new URL(pageUrl).hostname;
      const cached = await downloadAndCacheFavicon(hostname, entryUrl);
      setSelectedFavicon(cached || null);
    } catch (e) {
      setSelectedFavicon(null);
    }
  }

  async function selectFavicon(entry) {
    await selectFaviconByEntry(entry, normalizedUrl);
  }

  return {
    faviconUrls,
    selectedFavicon,
    selectFavicon,
    isLoading,
    normalizedUrl,
  };
}
