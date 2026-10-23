// What a plugin may ask the server for (mrramam/HomeGlow#50, #49).
//
// Plugin pages are framed with an opaque origin (no allow-same-origin), so
// every request a plugin makes with fetch, XHR, a beacon or a form arrives
// with `Origin: null`. Such a request must carry the token its page was
// served with (X-HomeGlow-Plugin-Token, added by the frame script in
// pluginFrameShims.js), and may reach only:
//   - its own platform API: /api/plugin/v1/{storage,settings,ha,notify}/<its id>/…
//   - a short list of read-only core data (READ_ROUTES), with GET;
//   - the few household writes the plugin guide documents (PLUGIN_POSTS:
//     clams in and out, a chore done or undone);
//   - the proxy, with GET.
// A theme's files (fonts, fetched by FontFace, which can't add the header)
// need no token. Everything else (settings writes, backups, restarts, the PIN, installs, the
// event stream, another plugin's API) answers 403.
//
// A request with no Origin (an <img>, a navigation, a server-side caller) or
// with the dashboard's own origin is not a plugin request and is unaffected.
//
// The token names what it was issued for ("plugin:<id>" for a manifest
// plugin, "widget:<filename>" for a plain HTML widget) and an HMAC of that
// with a server secret, so verifying it needs no lookup and nothing is stored
// per plugin.
const crypto = require('crypto');

const TOKEN_HEADER = 'x-homeglow-plugin-token';
const TOKEN_SECRET_SETTING = 'PLUGIN_TOKEN_SECRET';

// The platform API areas whose second segment is the plugin id.
const PLUGIN_API = /^\/api\/plugin\/v1\/(storage|settings|ha|notify)\/([^/]+)(?:\/|$)/;

// Read-only core data plugins may fetch, GET only: what the published plugins
// read (HomeGlowPlugins) and what the plugin guide documents (§10.2), none of
// it secret. calendar-sources is trimmed for plugins by its route (a private
// ICS link is itself a secret).
const READ_ROUTES = [
  /^\/api\/users$/,
  /^\/api\/users\/[^/]+\/clams$/,
  /^\/api\/timezone$/,
  /^\/api\/settings$/,
  /^\/api\/calendar$/,
  /^\/api\/calendar-events$/,
  /^\/api\/calendar-sources$/,
  /^\/api\/chore-history$/,
  /^\/api\/chore-history\/(?:user|summary)\/[^/]+$/,
  /^\/api\/chore-history\/recent$/,
  /^\/api\/chore-schedules$/,
  /^\/api\/chores$/,
  /^\/api\/prizes$/,
  /^\/api\/photo-items$/,
  /^\/api\/devices$/,
  /^\/api\/devices\/[^/]+\/tabs$/,
  /^\/api\/weather(?:\/[^/]+)*$/,
  /^\/api\/sun$/,
  /^\/api\/proxy$/,
];

// Core writes the guide documents for plugins (§10.2): clams in and out, and
// a chore done or undone. Household data, never the system: settings,
// backups, the PIN and installs stay closed. And one read that is a POST.
const PLUGIN_POSTS = [
  /^\/api\/users\/[^/]+\/clams\/(?:add|reduce)$/,
  /^\/api\/chores\/(?:complete|uncomplete)$/,
  /^\/api\/settings\/search$/,
];

const READ_METHODS = new Set(['GET', 'HEAD']);

// Public files a plugin frame fetches in CORS mode without being able to add
// a header: a theme's fonts, which the SDK registers with FontFace. GET only,
// and no token needed.
const PUBLIC_ROUTES = [
  /^\/api\/themes\/[^/]+\/[^/]+\/[^/]+$/,
];

const sign = (secret, subject) => crypto.createHmac('sha256', secret).update(subject).digest('base64url');

/** The token for "plugin:<id>" or "widget:<filename>". */
function issueToken(secret, subject) {
  return `${subject}.${sign(secret, subject)}`;
}

/** The subject a token was issued for, or null if it isn't one of ours. */
function verifyToken(secret, token) {
  if (typeof token !== 'string' || token.length > 512) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const subject = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(secret, subject));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  return /^(plugin|widget):[A-Za-z0-9._-]{1,128}$/.test(subject) ? subject : null;
}

// The path a route policy looks at: no query, no trailing slash.
const pathOf = (url) => {
  const path = String(url || '').split('?')[0].split('#')[0];
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
};

/**
 * May a request for `method` `url` from a plugin whose token names
 * `subject` (null: no valid token yet, as in a preflight) go through?
 * -> { allow: true } | { allow: false, reason }
 */
function routeDecision(method, url, subject) {
  const path = pathOf(url);
  const api = path.match(PLUGIN_API);
  if (api) {
    let id;
    try { id = decodeURIComponent(api[2]); } catch { id = null; }
    if (subject === null) return { allow: true }; // a preflight: the real request is checked
    if (subject === `plugin:${id}`) return { allow: true };
    return { allow: false, reason: 'A plugin may only use its own platform API.' };
  }
  if (String(method).toUpperCase() === 'POST' && PLUGIN_POSTS.some((route) => route.test(path))) return { allow: true };
  if (READ_ROUTES.some((route) => route.test(path))) {
    return READ_METHODS.has(String(method).toUpperCase())
      ? { allow: true }
      : { allow: false, reason: 'Plugins may only read this route.' };
  }
  return { allow: false, reason: "Plugins can't call this route." };
}

/**
 * The decision for one request: whether the policy applies at all, and if it
 * does, whether to let it through. `secret` is read lazily (it may need
 * creating) only when a token has to be checked.
 *   -> { applies: false }
 *    | { applies: true, allow: true, subject }
 *    | { applies: true, allow: false, reason }
 */
function decide({ method, url, headers }, getSecret) {
  if (headers.origin !== 'null') return { applies: false };
  const upper = String(method).toUpperCase();
  const wanted = upper === 'OPTIONS' ? String(headers['access-control-request-method'] || 'GET').toUpperCase() : upper;
  if (READ_METHODS.has(wanted) && PUBLIC_ROUTES.some((route) => route.test(pathOf(url)))) {
    return { applies: true, allow: true, subject: null };
  }
  if (upper === 'OPTIONS') {
    // A preflight carries no custom headers, so no token: answer for the
    // route and method only. The real request is checked when it comes.
    const route = routeDecision(wanted, url, null);
    return route.allow ? { applies: true, allow: true, subject: null } : { applies: true, ...route };
  }
  const subject = verifyToken(getSecret(), headers[TOKEN_HEADER]);
  if (!subject) return { applies: true, allow: false, reason: "This request has no valid plugin token. Plugins can only call HomeGlow from the page HomeGlow served them." };
  const route = routeDecision(upper, url, subject);
  return route.allow ? { applies: true, allow: true, subject } : { applies: true, ...route };
}

/**
 * Origins other than a plugin's that may read API responses: the
 * CORS_ORIGINS list, and in development the Vite dev server on localhost.
 * The dashboard itself is same-origin in production and needs none.
 */
function createOriginAllowList({ corsOrigins = process.env.CORS_ORIGINS, nodeEnv = process.env.NODE_ENV } = {}) {
  const listed = new Set(String(corsOrigins || '').split(',').map((origin) => origin.trim().replace(/\/+$/, '')).filter(Boolean));
  const development = nodeEnv !== 'production';
  return (origin) => {
    if (typeof origin !== 'string' || !origin || origin === 'null') return false;
    if (listed.has(origin)) return true;
    if (!development) return false;
    try {
      const { protocol, hostname } = new URL(origin);
      return ['http:', 'https:'].includes(protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
    } catch {
      return false;
    }
  };
}

module.exports = {
  TOKEN_HEADER,
  TOKEN_SECRET_SETTING,
  READ_ROUTES,
  PLUGIN_POSTS,
  PUBLIC_ROUTES,
  issueToken,
  verifyToken,
  routeDecision,
  decide,
  createOriginAllowList,
};
