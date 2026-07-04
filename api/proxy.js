export const config = { runtime: 'edge' };

// ─── Security ─────────────────────────────────────────────────────────────────

/**
 * Hostnames blocked regardless of allowlist config.
 * Prevents cloud metadata endpoint abuse and loopback access.
 */
const ALWAYS_BLOCKED = new Set([
  'localhost',
  '169.254.169.254',          // AWS / GCP link-local metadata
  'metadata.google.internal', // GCP metadata
  '100.100.100.200',          // Alibaba Cloud metadata
]);

/**
 * Returns true if the hostname is permitted to be proxied.
 *
 * MODE: Allowlist (recommended for production with private CDNs)
 *   Set PROXY_ALLOWED_HOSTS env var to a comma-separated list of
 *   allowed hostnames or IP addresses.
 *   Example: "192.168.10.5,cdn.internal,stream.myprovider.com"
 *
 *   Subdomain matching is supported:
 *   "myprovider.com" will also allow "cdn.myprovider.com"
 *
 * FALLBACK (no env var set — dev mode only):
 *   All hosts are allowed except ALWAYS_BLOCKED entries above.
 */
function isHostAllowed(hostname) {
  const h = hostname.toLowerCase();

  if (ALWAYS_BLOCKED.has(h)) return false;

  const rawEnv = (typeof process !== 'undefined' ? process.env?.PROXY_ALLOWED_HOSTS : '') ?? '';
  if (!rawEnv) return true; // no allowlist → permissive dev mode

  const allowed = rawEnv.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return allowed.some(entry => h === entry || h.endsWith(`.${entry}`));
}

// ─── Encoding helpers ─────────────────────────────────────────────────────────

function b64uDecode(str) {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
}

function b64uEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function buildProxyHref(upstreamUrl, incomingRequestUrl) {
  const origin = new URL(incomingRequestUrl).origin;
  return `${origin}/api/proxy?url=${b64uEncode(upstreamUrl)}`;
}

// ─── Playlist rewriting ───────────────────────────────────────────────────────

/**
 * Rewrites every URL line in an M3U/M3U8 so that all segments and
 * sub-manifests are fetched through this proxy.
 * Comment lines (#EXT-X-KEY URI, #EXT-X-MAP URI) are also rewritten.
 */
function rewritePlaylistBody(text, upstreamBaseUrl, incomingRequestUrl) {
  return text
    .split('\n')
    .map(line => {
      const trimmed = line.trim();

      // Rewrite URI="..." attributes inside tag lines (e.g. EXT-X-KEY, EXT-X-MAP)
      if (trimmed.startsWith('#') && trimmed.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/g, (_, uri) => {
          try {
            const abs = new URL(uri, upstreamBaseUrl).href;
            return `URI="${buildProxyHref(abs, incomingRequestUrl)}"`;
          } catch {
            return `URI="${uri}"`;
          }
        });
      }

      // Skip empty lines and other comments
      if (!trimmed || trimmed.startsWith('#')) return line;

      // URL lines (segment / sub-manifest)
      try {
        const abs = new URL(trimmed, upstreamBaseUrl).href;
        return buildProxyHref(abs, incomingRequestUrl);
      } catch {
        return line;
      }
    })
    .join('\n');
}

// ─── CORS headers ─────────────────────────────────────────────────────────────

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type, Accept-Ranges',
  };
}

// ─── Edge handler ─────────────────────────────────────────────────────────────

export default async function handler(req) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders() });
  }

  // ── Parse & validate the target URL ───────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const encodedUrl = searchParams.get('url');

  if (!encodedUrl) {
    return new Response('Missing required ?url= parameter', { status: 400, headers: corsHeaders() });
  }

  let targetUrl;
  try {
    targetUrl = b64uDecode(encodedUrl);
  } catch {
    return new Response('Invalid URL encoding (expected base64url)', { status: 400, headers: corsHeaders() });
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    return new Response('Decoded value is not a valid URL', { status: 400, headers: corsHeaders() });
  }

  if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
    return new Response('Only http:// and https:// URLs are allowed', { status: 403, headers: corsHeaders() });
  }

  if (!isHostAllowed(parsedTarget.hostname)) {
    return new Response(
      'Host not in PROXY_ALLOWED_HOSTS allowlist',
      { status: 403, headers: corsHeaders() }
    );
  }

  // ── Fetch upstream ─────────────────────────────────────────────────────────
  // Use a real browser UA — many IPTV/CDN servers block bot user-agents.
  const upstreamHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
  };

  // Forward Range header so byte-range / video-seeking works
  const rangeHeader = req.headers.get('range');
  if (rangeHeader) upstreamHeaders['Range'] = rangeHeader;

  // Forward the client's real IP. Many IPTV streams use IP-locked tokens 
  // (the IP that requested the .m3u8 must be the same IP requesting the .ts segments).
  // Because Vercel Edge uses a pool of IPs, the proxy's IP changes between requests.
  // Passing the client's IP via X-Forwarded-For can help if the upstream respects it.
  const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
  if (clientIp) {
    upstreamHeaders['X-Forwarded-For'] = clientIp;
    upstreamHeaders['X-Real-IP'] = clientIp;
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      method: req.method,
      headers: upstreamHeaders,
      redirect: 'follow'
    });
  } catch (err) {
    return new Response(`Upstream fetch failed: ${err.message}`, { status: 502, headers: corsHeaders() });
  }

  // Expose upstream status in a header so browser DevTools can distinguish
  // "our proxy rejected it" (no X-Upstream-Status) from "upstream rejected it"
  const debugHeaders = { ...corsHeaders(), 'X-Upstream-Status': String(upstream.status) };

  // ── Build response headers ─────────────────────────────────────────────────
  const contentType = upstream.headers.get('content-type') ?? '';

  const responseHeaders = {
    ...debugHeaders,  // includes CORS + X-Upstream-Status
    'Content-Type': contentType || 'application/octet-stream',
    'X-Proxy-By': 'leaf-tv-proxy',
  };

  // Pass through headers relevant for streaming / seeking
  for (const h of ['accept-ranges', 'content-range', 'content-length', 'cache-control']) {
    const v = upstream.headers.get(h);
    if (v) responseHeaders[h] = v;
  }

  // ── Upstream non-2xx: relay status + body for transparency ────────────────
  if (!upstream.ok && upstream.status !== 206) {
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  }

  // ── Playlist: rewrite URLs, return buffered text ───────────────────────────
  const isPlaylist =
    contentType.includes('mpegurl') ||
    /\.m3u8?(\?|$)/i.test(targetUrl);

  if (isPlaylist) {
    const text = await upstream.text();
    const rewritten = rewritePlaylistBody(text, targetUrl, req.url);

    // Content-Length is no longer accurate after rewriting
    delete responseHeaders['content-length'];

    return new Response(rewritten, { status: upstream.status, headers: responseHeaders });
  }

  // ── Media segments: stream directly, zero buffering ───────────────────────
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
