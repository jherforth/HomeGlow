// The proxy whitelist (issue #328): the PROXY_WHITELIST setting, a
// comma-separated list of hostnames. The server lets /api/proxy fetch a URL
// only when its hostname is exactly one of them, so an entry with a scheme,
// a path or a port would never match. These turn what someone types or
// pastes into the hostnames the server compares.

const HOSTNAME = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
const IPV6 = /^\[[0-9a-f:.]+\]$/;

/** The hostnames in a stored setting, in order, without blanks or repeats. */
export function parseWhitelist(value) {
  const hosts = [];
  String(value || '').split(',').forEach((entry) => {
    const host = entry.trim();
    if (host && !hosts.includes(host)) hosts.push(host);
  });
  return hosts;
}

/** The setting's value for a list of hostnames. */
export const serializeWhitelist = (hosts) => hosts.join(',');

/**
 * The hostname in one typed entry, or null when there isn't one.
 * "https://API.example.com:8443/feed?x=1" -> "api.example.com".
 */
export function normalizeHost(entry) {
  const text = String(entry || '').trim().toLowerCase();
  if (!text) return null;
  let host;
  try {
    host = new URL(text.includes('://') ? text : `http://${text}`).hostname;
  } catch {
    return null;
  }
  return HOSTNAME.test(host) || IPV6.test(host) ? host : null;
}

/**
 * Splits typed or pasted text at commas, spaces and new lines.
 * -> { hosts: the new hostnames, in order, not already in `existing`;
 *      invalid: the entries that aren't addresses }
 */
export function addEntries(text, existing = []) {
  const hosts = [];
  const invalid = [];
  String(text || '').split(/[\s,]+/).forEach((entry) => {
    if (!entry) return;
    const host = normalizeHost(entry);
    if (!host) invalid.push(entry);
    else if (!existing.includes(host) && !hosts.includes(host)) hosts.push(host);
  });
  return { hosts, invalid };
}
