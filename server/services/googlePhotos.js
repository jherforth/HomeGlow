const googleConnection = require('./googleConnection');

const API_BASE = 'https://photoslibrary.googleapis.com/v1';

async function googleFetch(db, accountId, method, pathAndQuery, body) {
    const accessToken = await googleConnection.getValidAccessToken(db, accountId);
    const url = pathAndQuery.startsWith('http') ? pathAndQuery : `${API_BASE}${pathAndQuery}`;
    const init = {
        method,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
        },
    };
    if (body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    const text = await res.text();
    let parsed = null;
    if (text) {
        try { parsed = JSON.parse(text); } catch (_) { parsed = { raw: text }; }
    }
    if (!res.ok) {
        const msg = parsed && parsed.error && parsed.error.message ? parsed.error.message : `Google Photos API error ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        err.details = parsed;
        throw err;
    }
    return parsed || {};
}

async function listAlbumsFrom(db, accountId, endpoint, collection) {
    const out = [];
    let pageToken;
    do {
        const params = new URLSearchParams({ pageSize: '50' });
        if (pageToken) params.set('pageToken', pageToken);
        const data = await googleFetch(db, accountId, 'GET', `/${endpoint}?${params.toString()}`);
        const items = Array.isArray(data[collection]) ? data[collection] : [];
        for (const a of items) {
            out.push({
                id: a.id,
                title: a.title || '(Untitled album)',
                shared: endpoint === 'sharedAlbums',
                mediaItemsCount: a.mediaItemsCount ? Number(a.mediaItemsCount) : null,
                coverPhotoBaseUrl: a.coverPhotoBaseUrl || null,
            });
        }
        pageToken = data.nextPageToken;
    } while (pageToken);
    return out;
}

async function listAlbums(db, accountId) {
    const [owned, shared] = await Promise.all([
        listAlbumsFrom(db, accountId, 'albums', 'albums').catch(() => []),
        listAlbumsFrom(db, accountId, 'sharedAlbums', 'sharedAlbums').catch(() => []),
    ]);
    const seen = new Set();
    const merged = [];
    for (const a of [...owned, ...shared]) {
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        merged.push(a);
    }
    merged.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    return merged;
}

async function searchAlbumMedia(db, accountId, albumId, { limit = 200 } = {}) {
    const out = [];
    let pageToken;
    while (out.length < limit) {
        const body = { albumId, pageSize: 100 };
        if (pageToken) body.pageToken = pageToken;
        const data = await googleFetch(db, accountId, 'POST', '/mediaItems:search', body);
        const items = Array.isArray(data.mediaItems) ? data.mediaItems : [];
        out.push(...items);
        pageToken = data.nextPageToken;
        if (!pageToken) break;
    }
    return out.slice(0, limit);
}

async function listRecentMedia(db, accountId, { limit = 200 } = {}) {
    const out = [];
    let pageToken;
    while (out.length < limit) {
        const params = new URLSearchParams({ pageSize: '100' });
        if (pageToken) params.set('pageToken', pageToken);
        const data = await googleFetch(db, accountId, 'GET', `/mediaItems?${params.toString()}`);
        const items = Array.isArray(data.mediaItems) ? data.mediaItems : [];
        out.push(...items);
        pageToken = data.nextPageToken;
        if (!pageToken) break;
    }
    return out.slice(0, limit);
}

async function getMediaItem(db, accountId, mediaItemId) {
    return await googleFetch(db, accountId, 'GET', `/mediaItems/${encodeURIComponent(mediaItemId)}`);
}

module.exports = {
    listAlbums,
    searchAlbumMedia,
    listRecentMedia,
    getMediaItem,
};
