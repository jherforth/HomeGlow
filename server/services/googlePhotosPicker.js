const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const googleConnection = require('./googleConnection');

const API_BASE = 'https://photospicker.googleapis.com/v1';

function getMediaRoot() {
    const root = path.resolve(__dirname, '..', 'data', 'google-photos');
    if (!fs.existsSync(root)) {
        fs.mkdirSync(root, { recursive: true });
    }
    return root;
}

function sourceDir(sourceId) {
    const dir = path.join(getMediaRoot(), String(sourceId));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

async function pickerFetch(db, accountId, method, pathAndQuery, body) {
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
    if (res.status === 204) return {};
    const text = await res.text();
    let parsed = null;
    if (text) {
        try { parsed = JSON.parse(text); } catch (_) { parsed = { raw: text }; }
    }
    if (!res.ok) {
        const msg = parsed && parsed.error && parsed.error.message ? parsed.error.message : `Google Photos Picker API error ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        err.details = parsed;
        throw err;
    }
    return parsed || {};
}

async function createSession(db, accountId) {
    return await pickerFetch(db, accountId, 'POST', '/sessions', {});
}

async function getSession(db, accountId, sessionId) {
    return await pickerFetch(db, accountId, 'GET', `/sessions/${encodeURIComponent(sessionId)}`);
}

async function deleteSession(db, accountId, sessionId) {
    return await pickerFetch(db, accountId, 'DELETE', `/sessions/${encodeURIComponent(sessionId)}`);
}

async function listPickedMediaItems(db, accountId, sessionId) {
    const items = [];
    let pageToken;
    do {
        const params = new URLSearchParams({ sessionId, pageSize: '100' });
        if (pageToken) params.set('pageToken', pageToken);
        const data = await pickerFetch(db, accountId, 'GET', `/mediaItems?${params.toString()}`);
        if (Array.isArray(data.mediaItems)) items.push(...data.mediaItems);
        pageToken = data.nextPageToken;
    } while (pageToken);
    return items;
}

async function downloadMedia(db, accountId, sourceId, pickedItem) {
    const mediaFile = pickedItem.mediaFile || {};
    if (!mediaFile.baseUrl) throw new Error('Picked media missing baseUrl');

    const accessToken = await googleConnection.getValidAccessToken(db, accountId);
    const fullUrl = `${mediaFile.baseUrl}=d`;
    const res = await fetch(fullUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
        throw new Error(`Failed to download picked media (${res.status})`);
    }
    const buf = Buffer.from(await res.arrayBuffer());

    const mimeType = mediaFile.mimeType || res.headers.get('content-type') || 'image/jpeg';
    const ext = extensionForMime(mimeType);
    const safeName = crypto.randomBytes(12).toString('hex') + ext;
    const localPath = path.join(sourceDir(sourceId), safeName);
    fs.writeFileSync(localPath, buf);
    return {
        localPath,
        mimeType,
        filename: mediaFile.filename || null,
        width: mediaFile.mediaFileMetadata?.width ? Number(mediaFile.mediaFileMetadata.width) : null,
        height: mediaFile.mediaFileMetadata?.height ? Number(mediaFile.mediaFileMetadata.height) : null,
    };
}

function extensionForMime(mime) {
    if (!mime) return '.jpg';
    const m = mime.toLowerCase();
    if (m.includes('png')) return '.png';
    if (m.includes('webp')) return '.webp';
    if (m.includes('gif')) return '.gif';
    if (m.includes('heic')) return '.heic';
    if (m.includes('heif')) return '.heif';
    return '.jpg';
}

function isImageMime(mime) {
    return typeof mime === 'string' && mime.toLowerCase().startsWith('image/');
}

function removeLocalFile(localPath) {
    try {
        if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath);
    } catch (e) {
        console.warn('Failed to remove picked media file', localPath, e.message);
    }
}

module.exports = {
    createSession,
    getSession,
    deleteSession,
    listPickedMediaItems,
    downloadMedia,
    isImageMime,
    removeLocalFile,
    sourceDir,
};
