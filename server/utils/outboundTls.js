const https = require('https');
const net = require('net');

// TLS policy for outbound requests (issue #139).
//
// HomeGlow talks to two very different kinds of host and they deserve different
// answers on certificate verification:
//
//   * Public services — Google's token endpoint, iCloud CalDAV, OpenWeatherMap.
//     A bad certificate here is an attack, and the certificate is the only thing
//     standing between a man in the middle and an OAuth refresh token. Always
//     verify.
//
//   * Private services on the household's own network — Immich, Home Assistant,
//     a NAS serving an ICS feed. A self-signed certificate here is the normal
//     case, not a red flag: there is no public CA that will issue for
//     192.168.1.50. Refusing these would make HomeGlow unusable for exactly the
//     self-hosted setups it exists to serve.
//
// This module replaces a single line that used to set
// `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` whenever the CORS proxy saw
// an https:// URL. That disabled verification **process-wide and permanently**,
// including for the Google token exchange, and it was never restored. It also
// made self-signed LAN services work only by accident: they failed on a fresh
// boot and started working once something happened to trip the global flag.
// Scoping the decision per request fixes the hole and makes the LAN case
// deterministic at the same time.

// Hostname suffixes conventionally used for names that only resolve on a local
// network. `.home.arpa` is the standard reserved name (RFC 8375); the others are
// what routers and self-hosters actually use in practice.
const PRIVATE_HOST_SUFFIXES = ['.local', '.lan', '.internal', '.home', '.home.arpa'];

const PRIVATE_HOST_NAMES = ['localhost'];

function isPrivateIPv4(host) {
    const parts = host.split('.');
    if (parts.length !== 4) return false;

    const octets = parts.map((part) => Number(part));
    if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;

    const [a, b] = octets;
    if (a === 10) return true;                        // 10.0.0.0/8
    if (a === 127) return true;                       // loopback
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;          // 192.168.0.0/16
    if (a === 169 && b === 254) return true;          // link-local
    return false;
}

function isPrivateIPv6(host) {
    // URL hostnames keep IPv6 in brackets; strip them and any zone id.
    const bare = host.replace(/^\[|\]$/g, '').split('%')[0].toLowerCase();
    if (bare === '::1' || bare === '::') return true;

    // fc00::/7 (unique local) and fe80::/10 (link-local).
    if (/^f[cd][0-9a-f]{2}:/.test(bare)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(bare)) return true;

    // ::ffff:192.168.0.1 style mapped addresses.
    const mapped = bare.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIPv4(mapped[1]);

    return false;
}

/**
 * Is this hostname on the household's own network?
 *
 * Matched literally against the URL's host — no DNS lookup. That keeps the
 * check synchronous and failure-free, at the cost of one honest limitation: a
 * name like `myserver.local` that actually resolves to a public address is
 * still treated as local. For a home dashboard that trade is worth it; the
 * alternative adds a lookup per request and a gap between the check and the
 * connection.
 */
function isPrivateHost(hostname) {
    if (!hostname) return false;
    const host = String(hostname).trim().toLowerCase();
    if (!host) return false;

    if (PRIVATE_HOST_NAMES.includes(host)) return true;
    if (PRIVATE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;

    if (net.isIPv4(host)) return isPrivateIPv4(host);
    if (host.startsWith('[') || net.isIPv6(host.replace(/^\[|\]$/g, ''))) return isPrivateIPv6(host);

    return false;
}

// One agent per policy rather than per request: Node keeps connections alive on
// the agent, and building a fresh one each time would throw that away.
const verifyingAgent = new https.Agent({ keepAlive: true, rejectUnauthorized: true });
const permissiveAgent = new https.Agent({ keepAlive: true, rejectUnauthorized: false });

/**
 * The https.Agent to use for a URL, or undefined when TLS is not involved.
 *
 * Returning undefined for http:// matters: plenty of HomeGlow installs run
 * entirely over plain HTTP on a LAN or on localhost, and those requests must not
 * be given an https agent at all.
 */
function httpsAgentFor(targetUrl) {
    let parsed;
    try {
        parsed = typeof targetUrl === 'string' ? new URL(targetUrl) : targetUrl;
    } catch (_) {
        // An unparseable URL is going to fail anyway; verify by default.
        return verifyingAgent;
    }

    if (!parsed || parsed.protocol !== 'https:') return undefined;

    return isPrivateHost(parsed.hostname) ? permissiveAgent : verifyingAgent;
}

/**
 * True when this request will skip certificate verification. Callers use it to
 * log the decision once, so a self-signed LAN service is visible in the logs
 * rather than silently trusted.
 */
function isCertificateVerificationSkipped(targetUrl) {
    try {
        const parsed = typeof targetUrl === 'string' ? new URL(targetUrl) : targetUrl;
        return parsed.protocol === 'https:' && isPrivateHost(parsed.hostname);
    } catch (_) {
        return false;
    }
}

/**
 * Options to spread into a `fetch` call. Node's fetch takes a dispatcher rather
 * than an agent, so private hosts get an undici Agent when one is available and
 * otherwise fall back to strict behaviour rather than silently verifying
 * nothing.
 */
// Built once and reused. A fresh dispatcher per request would discard connection
// reuse and pile up sockets on a widget that polls.
let cachedPermissiveDispatcher;
let permissiveDispatcherUnavailable = false;

function permissiveDispatcher() {
    if (cachedPermissiveDispatcher || permissiveDispatcherUnavailable) {
        return cachedPermissiveDispatcher;
    }
    try {
        // undici ships with Node; requiring it lazily keeps this module usable
        // if that ever stops being true.
        const { Agent } = require('undici');
        cachedPermissiveDispatcher = new Agent({ connect: { rejectUnauthorized: false } });
    } catch (_) {
        permissiveDispatcherUnavailable = true;
        console.warn('undici unavailable; a private host with a self-signed certificate may be rejected.');
    }
    return cachedPermissiveDispatcher;
}

function fetchTlsOptions(targetUrl) {
    if (!isCertificateVerificationSkipped(targetUrl)) return {};
    const dispatcher = permissiveDispatcher();
    return dispatcher ? { dispatcher } : {};
}

module.exports = {
    isPrivateHost,
    httpsAgentFor,
    isCertificateVerificationSkipped,
    fetchTlsOptions,
};
