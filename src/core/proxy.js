/**
 * proxy.js — Client-side helper for routing stream URLs through the
 * Vercel Edge proxy (/api/proxy).
 *
 * Use these helpers wherever a raw stream URL is consumed so that:
 *  1. HTTP URLs are transparently upgraded to HTTPS (no mixed-content block).
 *  2. Cross-origin URLs are routed via your own domain (no CORS issues).
 */

// ─── Encoding ─────────────────────────────────────────────────────────────────

function b64uEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ─── Core helpers ─────────────────────────────────────────────────────────────

/**
 * Returns true when a URL should be proxied:
 *  - http:// → must proxy (mixed-content block on HTTPS pages)
 *  - cross-origin https:// → proxy to avoid CORS errors from stream servers
 *    that don't send Access-Control-Allow-Origin
 */
export function needsProxy(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:') return true;
    if (parsed.protocol === 'https:' && parsed.origin !== window.location.origin) return true;
  } catch {
    // Relative URL — already same-origin, no proxy needed
  }
  return false;
}

/**
 * Wraps any URL in the proxy endpoint unconditionally.
 * Prefer maybeProxyUrl() for conditional wrapping.
 */
export function proxyUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  return `/api/proxy?url=${b64uEncode(rawUrl)}`;
}

/**
 * Wraps a URL in the proxy only if needsProxy() returns true.
 * Safe to call on any URL — returns it unchanged when proxying isn't needed.
 */
export function maybeProxyUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  return needsProxy(rawUrl) ? proxyUrl(rawUrl) : rawUrl;
}

// ─── Playlist rewriting ───────────────────────────────────────────────────────

/**
 * Rewrites an M3U / M3U8 playlist text so that every stream/segment URL
 * goes through the proxy.
 *
 * - Relative URLs are resolved against baseUrl before encoding.
 * - Comment lines and tags are left untouched (the proxy handles
 *   EXT-X-KEY / EXT-X-MAP URI rewriting server-side when it serves
 *   the manifest).
 * - Empty lines are preserved.
 *
 * @param {string} text    Raw playlist content
 * @param {string} baseUrl URL the playlist was fetched from (for resolving relative paths)
 * @returns {string}       Rewritten playlist with all URLs proxied
 */
export function rewritePlaylist(text, baseUrl) {
  return text
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line; // preserve as-is

      let absoluteUrl;
      try {
        absoluteUrl = new URL(trimmed, baseUrl).href;
      } catch {
        return line; // not a URL, leave it
      }

      return proxyUrl(absoluteUrl);
    })
    .join('\n');
}
