// URL normalization and validation utilities

export function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

export function normalizeUrl(url) {
  if (!url || !url.trim()) return url;

  const trimmedUrl = url.trim();

  // If it already has a protocol, return as is
  if (trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")) {
    return trimmedUrl;
  }

  // If it looks like a URL (contains a dot and domain pattern), prefix with https://
  if (trimmedUrl.includes(".") && /^[a-zA-Z0-9]/.test(trimmedUrl)) {
    return "https://" + trimmedUrl;
  }

  return trimmedUrl;
}

export function isValidUrlOrCanBeNormalized(string) {
  if (!string || !string.trim()) return false;

  // First check if it's already valid
  if (isValidUrl(string)) return true;

  // Then check if it can be normalized to a valid URL
  const normalized = normalizeUrl(string);
  return isValidUrl(normalized);
}

export function extractTitleFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    let title = hostname.replace("www.", "");
    return title.charAt(0).toUpperCase() + title.slice(1);
  } catch (e) {
    return "Bookmark";
  }
}
