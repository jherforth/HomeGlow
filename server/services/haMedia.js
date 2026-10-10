// Home Assistant panels: music (browse, search, play, album art).
//
// A media player tile can open its player's library, through Home
// Assistant's own media_player/browse_media and media_player/search_media.
// Nothing here knows any one music service: whatever the player offers
// (Music Assistant with Spotify, YouTube Music, local files or radio; Sonos;
// Plex; the Spotify integration ...) is what the tile shows.
//
// What a panel may play is only what HomeGlow has shown it. Every item
// browsed or found is given a short key, and play_media takes a key, never a
// content id, so a panel cannot make a speaker play an address of its own.
// Pictures Home Assistant has to sign for are fetched by key too; pictures
// already on the web are handed to the browser as they are, so HomeGlow
// never fetches an address it was given.
//
// Everything here is pure; routes/haPanels.js does the talking.

const crypto = require('crypto');

// MediaPlayerEntityFeature bits, from Home Assistant's constants.
const FEATURE = {
  PLAY_MEDIA: 512,
  SHUFFLE_SET: 32768,
  BROWSE_MEDIA: 131072,
  MEDIA_ENQUEUE: 2097152,
  SEARCH_MEDIA: 4194304,
};

const MAX_ITEMS = 200;          // per list sent to a panel
const MAX_TITLE = 200;
const MAX_CONTENT_ID = 2048;
const MAX_CONTENT_TYPE = 100;
const MAX_QUERY = 100;
const MAX_RECENT = 8;
const CATALOG_LIMIT = 3000;     // remembered items per panel
const MAX_IMAGE_PATH = 1024;
const MAX_WEB_URL = 2048;

const has = (state, bit) => (Number(state?.attributes?.supported_features) & bit) === bit;
const canBrowse = (state) => has(state, FEATURE.BROWSE_MEDIA);
const canSearch = (state) => has(state, FEATURE.SEARCH_MEDIA);

const cleanString = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** A picture already on the web: the browser may load it as it is. */
function isWebImage(url) {
  return typeof url === 'string' && url.length <= MAX_WEB_URL && /^https?:\/\/[^\s"'<>\\`]+$/i.test(url);
}

/**
 * A picture Home Assistant serves itself and signs for (its media player
 * proxy, its brands): a path under /api/, nothing that could climb out of it.
 */
function isHomeAssistantImagePath(path) {
  return typeof path === 'string'
    && path.length <= MAX_IMAGE_PATH
    && path.startsWith('/api/')
    && !path.includes('..')
    && !path.includes('//')
    && /^[A-Za-z0-9_\-./%?=&:~+,]+$/.test(path);
}

/** A short key for an item: the same item always gets the same key. */
function itemKey(kind, id, type) {
  return crypto.createHash('sha256').update(`${kind}\u0000${type}\u0000${id}`).digest('base64url').slice(0, 22);
}

/**
 * What HomeGlow has shown each panel: keys -> { id, type, title } for the
 * items it may play or open, and keys -> paths for the pictures it may ask
 * Home Assistant for. Bounded; the oldest are forgotten first. Kept in
 * memory: after a restart a panel simply opens its library again.
 */
class MediaCatalog {
  constructor({ limit = CATALOG_LIMIT } = {}) {
    this.limit = limit;
    this.panels = new Map(); // pluginId -> Map(key -> entry)
  }

  entries(pluginId) {
    let map = this.panels.get(pluginId);
    if (!map) {
      map = new Map();
      this.panels.set(pluginId, map);
    }
    return map;
  }

  put(pluginId, key, entry) {
    const map = this.entries(pluginId);
    map.delete(key); // re-inserted, so it counts as recent
    map.set(key, entry);
    while (map.size > this.limit) map.delete(map.keys().next().value);
    return key;
  }

  /** Remember an item a panel was shown; returns its key. */
  rememberItem(pluginId, { id, type, title }) {
    return this.put(pluginId, itemKey('item', id, type), { kind: 'item', id, type, title });
  }

  /** Remember a picture Home Assistant serves; returns its key. */
  rememberImage(pluginId, path) {
    return this.put(pluginId, itemKey('image', path, ''), { kind: 'image', path });
  }

  item(pluginId, key) {
    const entry = typeof key === 'string' ? this.panels.get(pluginId)?.get(key) : null;
    return entry && entry.kind === 'item' ? entry : null;
  }

  image(pluginId, key) {
    const entry = typeof key === 'string' ? this.panels.get(pluginId)?.get(key) : null;
    return entry && entry.kind === 'image' ? entry.path : null;
  }

  forget(pluginId) {
    this.panels.delete(pluginId);
  }
}

/**
 * One node of Home Assistant's browse tree (or a search result), as a panel
 * sees it: { key, title, kind, canPlay, canOpen, thumb }. `thumb` is a web
 * address, or `imageUrl(key)` for a picture Home Assistant signs for, or
 * null. Null for a node that can be neither played nor opened.
 */
function toItem(node, { catalog, pluginId, imageUrl }) {
  if (!node || typeof node !== 'object') return null;
  const id = node.media_content_id;
  const type = node.media_content_type;
  if (typeof id !== 'string' || id.length > MAX_CONTENT_ID) return null;
  if (typeof type !== 'string' || !type || type.length > MAX_CONTENT_TYPE) return null;
  const canPlay = node.can_play === true;
  const canOpen = node.can_expand === true;
  if (!canPlay && !canOpen) return null;
  const title = cleanString(node.title, MAX_TITLE) || cleanString(id, 60);
  const key = catalog.rememberItem(pluginId, { id, type, title });
  let thumb = null;
  if (isWebImage(node.thumbnail)) thumb = node.thumbnail;
  else if (isHomeAssistantImagePath(node.thumbnail)) thumb = imageUrl(catalog.rememberImage(pluginId, node.thumbnail));
  return {
    key,
    title,
    kind: cleanString(node.media_class, 40) || 'music',
    canPlay,
    canOpen,
    thumb,
  };
}

const toItems = (nodes, context) => (Array.isArray(nodes) ? nodes : [])
  .map((node) => toItem(node, context))
  .filter(Boolean)
  .slice(0, MAX_ITEMS);

/** A level of the browse tree: { title, key, canPlay, items, more }. */
function browseResult(node, context) {
  const self = node && typeof node === 'object' ? toItem({ ...node, can_expand: true }, context) : null;
  const children = Array.isArray(node?.children) ? node.children : [];
  return {
    title: cleanString(node?.title, MAX_TITLE),
    key: self ? self.key : null,
    canPlay: node?.can_play === true,
    items: toItems(children, context),
    more: children.length > MAX_ITEMS,
  };
}

/** Search results ({ result: [...] }, or a plain list): { items, more }. */
function searchResult(payload, context) {
  const nodes = Array.isArray(payload) ? payload : (Array.isArray(payload?.result) ? payload.result : []);
  return { items: toItems(nodes, context), more: nodes.length > MAX_ITEMS };
}

/** What someone typed, tidied; null when there is nothing to search for. */
function normalizeQuery(query) {
  const q = cleanString(query, MAX_QUERY);
  return q || null;
}

/** The recent-searches list with `query` added first, without repeats. */
function addRecent(list, query) {
  const q = normalizeQuery(query);
  const previous = Array.isArray(list) ? list.filter((item) => typeof item === 'string' && item) : [];
  if (!q) return previous.slice(0, MAX_RECENT);
  return [q, ...previous.filter((item) => item.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT);
}

/**
 * Where the playing item's picture is: { web } for one on the web, { path }
 * for one Home Assistant signs for, or null.
 */
function artSource(state) {
  const picture = state?.attributes?.entity_picture;
  if (isWebImage(picture)) return { web: picture };
  if (isHomeAssistantImagePath(picture)) return { path: picture };
  return null;
}

/**
 * A short tag that changes when the picture does, so a panel knows when to
 * load it again, without seeing the address (Home Assistant's proxy address
 * carries a token).
 */
function artVersion(state) {
  const picture = state?.attributes?.entity_picture;
  if (typeof picture !== 'string' || !picture) return null;
  return crypto.createHash('sha256').update(picture).digest('base64url').slice(0, 12);
}

module.exports = {
  FEATURE,
  MAX_QUERY,
  MAX_RECENT,
  MediaCatalog,
  addRecent,
  artSource,
  artVersion,
  browseResult,
  canBrowse,
  canSearch,
  isHomeAssistantImagePath,
  isWebImage,
  normalizeQuery,
  searchResult,
  toItem,
};
