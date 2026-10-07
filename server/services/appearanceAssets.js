// Images for appearance: the household's and each display's own backgrounds.
//
// Files live under uploads/appearance/backgrounds, named by a random id, with
// no table: the directory is the list. The type is read from the file's own
// bytes, never from the client's claim, and only JPEG, PNG and WebP are kept
// (no SVG, which can carry script). The browser resizes before uploading, so
// the cap only has to stop the unreasonable.

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const BACKGROUND_MAX_BYTES = 10 * 1024 * 1024;
const BACKGROUND_FILE_PATTERN = /^[0-9a-f]{24}\.(jpg|png|webp)$/;

const TYPES = {
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
};

// The image type a buffer actually holds, by its leading bytes, or null.
function sniffImageType(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
    return null;
}

function backgroundsDir(uploadsRoot) {
    return path.join(uploadsRoot, 'appearance', 'backgrounds');
}

const urlFor = (file) => `/api/appearance/backgrounds/${file}`;

async function saveBackground(uploadsRoot, buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return { error: 'No image received.', status: 400 };
    }
    if (buffer.length > BACKGROUND_MAX_BYTES) {
        return { error: `Background images must be ${BACKGROUND_MAX_BYTES / (1024 * 1024)} MB or smaller.`, status: 413 };
    }
    const type = sniffImageType(buffer);
    if (!type) {
        return { error: 'Background images must be JPEG, PNG or WebP.', status: 415 };
    }
    const dir = backgroundsDir(uploadsRoot);
    await fs.mkdir(dir, { recursive: true });
    const file = `${crypto.randomBytes(12).toString('hex')}.${type}`;
    await fs.writeFile(path.join(dir, file), buffer);
    return { file, url: urlFor(file), size: buffer.length };
}

async function listBackgrounds(uploadsRoot) {
    const dir = backgroundsDir(uploadsRoot);
    let names;
    try {
        names = await fs.readdir(dir);
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
    const files = names.filter((name) => BACKGROUND_FILE_PATTERN.test(name));
    const entries = await Promise.all(files.map(async (file) => {
        const stat = await fs.stat(path.join(dir, file));
        return { file, url: urlFor(file), size: stat.size, uploadedAt: stat.mtime.toISOString() };
    }));
    return entries.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

// The path and type for a requested file, or null for anything that is not
// one of ours (which also rules out traversal: the pattern has no slashes).
function resolveBackground(uploadsRoot, file) {
    if (typeof file !== 'string' || !BACKGROUND_FILE_PATTERN.test(file)) return null;
    const ext = file.slice(file.lastIndexOf('.') + 1);
    return { path: path.join(backgroundsDir(uploadsRoot), file), type: TYPES[ext] };
}

async function deleteBackground(uploadsRoot, file) {
    const resolved = resolveBackground(uploadsRoot, file);
    if (!resolved) return false;
    try {
        await fs.unlink(resolved.path);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
    }
}

module.exports = {
    BACKGROUND_MAX_BYTES,
    sniffImageType,
    saveBackground,
    listBackgrounds,
    resolveBackground,
    deleteBackground,
};
