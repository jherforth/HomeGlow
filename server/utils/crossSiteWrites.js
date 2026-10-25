// Writes sent by another website (mrramam/HomeGlow#62).
//
// CORS keeps other sites from reading the API, but a browser still sends a
// form or multipart POST from any page without asking. HomeGlow has no login,
// so a page open on any device in the house could post to it. This refuses a
// write whose Origin is another site's.
//
// A write goes through when:
//   - it has no Origin: curl, scripts, Home Assistant, other servers;
//   - its Origin is "null": a plugin frame, which pluginRequestPolicy.js
//     already holds to its token and routes;
//   - its Origin may use the API anyway: CORS_ORIGINS, or the Vite dev server;
//   - the browser says it's same-origin (Sec-Fetch-Site), which no proxy in
//     between can get wrong;
//   - from an older browser that sends no Sec-Fetch-Site, its Origin's host
//     is the host the request was sent to. The bundled nginx passes
//     `Host $host`, which drops the port, so only hostnames are compared.
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const hostnameOf = (value) => {
  if (typeof value !== 'string' || !value) return null;
  try {
    return new URL(`http://${value.split(',')[0].trim()}`).hostname.toLowerCase();
  } catch {
    return null;
  }
};

function isCrossSiteWrite({ method, headers }, isAllowedOrigin) {
  if (READ_METHODS.has(String(method).toUpperCase())) return false;
  const origin = headers.origin;
  if (!origin || origin === 'null') return false;
  if (isAllowedOrigin(origin)) return false;

  const fetchSite = headers['sec-fetch-site'];
  if (fetchSite) return fetchSite !== 'same-origin';

  let originHost;
  try {
    originHost = new URL(origin).hostname.toLowerCase();
  } catch {
    return true;
  }
  return ![headers.host, headers['x-forwarded-host']].some((host) => hostnameOf(host) === originHost);
}

module.exports = { isCrossSiteWrite };
