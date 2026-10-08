// Installed themes: one folder per theme under uploads/themes/<id>/, laid out
// as in client/src/themes/ (theme.json, assets/, fonts/), installed from the
// themes repository or uploaded from a folder.
//
// The server checks structure only: which paths a theme may hold, each file's
// type by its own bytes, sizes, and that theme.json names a usable id. Token,
// layer and font rules are checked by validateThemePackage in the client, the
// one validator, which every display runs before it uses an installed theme
// and the admin page runs before it uploads one. The server can't import it
// (its image is built from server/ alone), and a second copy would drift.
//
// Theme files are only ever drawn as images and fonts, where an SVG's script
// doesn't run. They are refused if they carry script anyway, and served with a
// sandboxing CSP in case one is opened directly.

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const THEME_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
// The newest theme manifest this core understands (client/src/utils/themes.js,
// MANIFEST_VERSION; a test holds them equal). Newer themes are refused at
// install and left out of the store's list.
const MANIFEST_VERSION = 5;
// Classic is the stylesheet itself; no package can replace it.
const RESERVED_IDS = new Set(['classic']);
const MAX_FILES = 64;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

const NAME = '[A-Za-z0-9][A-Za-z0-9._-]{0,79}';
const RULES = [
    { pattern: /^theme\.json$/, kind: 'manifest' },
    { pattern: new RegExp(`^assets/${NAME}\\.(svg|png|webp|jpg)$`), kind: 'asset' },
    { pattern: new RegExp(`^fonts/${NAME}\\.woff2$`), kind: 'woff2' },
    // Font licenses (OFL.txt) travel with the fonts.
    { pattern: new RegExp(`^fonts/${NAME}\\.txt$`), kind: 'text' },
];

const TYPES = {
    svg: 'image/svg+xml',
    png: 'image/png',
    webp: 'image/webp',
    jpg: 'image/jpeg',
    woff2: 'font/woff2',
    txt: 'text/plain; charset=utf-8',
};

// For a theme file opened directly: no script, no requests, its own origin.
const FILE_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox";

const extOf = (file) => file.slice(file.lastIndexOf('.') + 1).toLowerCase();
const ruleFor = (relative) => RULES.find((rule) => rule.pattern.test(relative)) || null;

function sniffImage(buffer) {
    if (buffer.length < 12) return null;
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
    return null;
}

const SVG_SCRIPT = /<script|<foreignObject|\son[a-z]+\s*=|javascript:/i;

// Why a file can't be part of a theme, or null when it can.
function checkFile(relative, buffer) {
    const rule = ruleFor(relative);
    if (!rule) return 'is not a theme file (theme.json, assets/ or fonts/)';
    if (buffer.length > MAX_FILE_BYTES) return `is larger than ${MAX_FILE_BYTES / (1024 * 1024)} MB`;
    if (rule.kind === 'manifest' || rule.kind === 'text' || extOf(relative) === 'svg') {
        if (buffer.includes(0)) return 'is not text';
    }
    if (rule.kind === 'asset') {
        const ext = extOf(relative);
        if (ext === 'svg') {
            const text = buffer.toString('utf8');
            if (!/<svg[\s>]/i.test(text)) return 'is not an SVG';
            if (SVG_SCRIPT.test(text)) return 'carries script';
        } else if (sniffImage(buffer) !== ext) {
            return `is not a ${ext.toUpperCase()} image`;
        }
    }
    if (rule.kind === 'woff2' && buffer.subarray(0, 4).toString('latin1') !== 'wOF2') return 'is not a WOFF2 font';
    return null;
}

function readManifest(buffer) {
    let manifest;
    try {
        manifest = JSON.parse(buffer.toString('utf8'));
    } catch {
        return { error: 'theme.json is not valid JSON' };
    }
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return { error: 'theme.json must be an object' };
    if (!Number.isInteger(manifest.manifestVersion) || manifest.manifestVersion < 1) {
        return { error: 'theme.json needs a manifestVersion' };
    }
    if (manifest.manifestVersion > MANIFEST_VERSION) {
        const name = typeof manifest.name === 'string' && manifest.name.trim() ? manifest.name.trim() : 'This theme';
        console.warn(`Theme ${manifest.id}: manifestVersion ${manifest.manifestVersion}; this HomeGlow supports up to ${MANIFEST_VERSION}.`);
        return { error: `${name} needs a newer version of HomeGlow. Update HomeGlow to use it.`, status: 422, needsNewer: true, name };
    }
    if (typeof manifest.id !== 'string' || !THEME_ID.test(manifest.id)) {
        return { error: 'theme.json needs an id: lowercase letters, digits and hyphens' };
    }
    if (RESERVED_IDS.has(manifest.id)) return { error: `"${manifest.id}" is built in and can't be replaced` };
    if (typeof manifest.name !== 'string' || !manifest.name.trim()) return { error: 'theme.json needs a name' };
    return { manifest };
}

/**
 * Check a theme's files, given as [{ path, buffer }] relative to its folder.
 * Returns { manifest, files } ready to install, or { error, problems }.
 * Files outside the theme layout are skipped and listed, not fatal, so a
 * repository folder can keep a README or a preview next to its theme.
 */
function checkTheme(files) {
    if (!Array.isArray(files) || files.length === 0) return { error: 'No files received.', status: 400 };
    if (files.length > MAX_FILES) return { error: `A theme may have at most ${MAX_FILES} files.`, status: 413 };
    const total = files.reduce((sum, file) => sum + file.buffer.length, 0);
    if (total > MAX_TOTAL_BYTES) return { error: `A theme may total at most ${MAX_TOTAL_BYTES / (1024 * 1024)} MB.`, status: 413 };

    const kept = [];
    const skipped = [];
    const problems = [];
    for (const file of files) {
        const relative = String(file.path || '').replace(/\\/g, '/');
        if (!ruleFor(relative)) {
            skipped.push(relative);
            continue;
        }
        const problem = checkFile(relative, file.buffer);
        if (problem) problems.push(`${relative} ${problem}`);
        else kept.push({ path: relative, buffer: file.buffer });
    }
    const manifestFile = kept.find((file) => file.path === 'theme.json');
    if (!manifestFile && !problems.some((p) => p.startsWith('theme.json'))) problems.unshift('theme.json is missing');
    const read = manifestFile ? readManifest(manifestFile.buffer) : {};
    const { manifest, error } = read;
    if (read.needsNewer) return { error, status: 422, needsNewer: true, name: read.name };
    if (error) problems.unshift(error);
    if (problems.length) return { error: problems[0], problems, status: 422 };
    return { manifest, files: kept, skipped };
}

const themesDir = (uploadsRoot) => path.join(uploadsRoot, 'themes');

/**
 * Install a checked theme, replacing any installed version. The folder is
 * written beside the old one and swapped in by rename, so a failed install
 * leaves the previous version in place.
 */
async function installTheme(uploadsRoot, files, { source = 'upload', ref = null } = {}) {
    const checked = checkTheme(files);
    if (checked.error) return checked;
    const { manifest } = checked;
    const dir = themesDir(uploadsRoot);
    const stage = path.join(dir, `.stage-${crypto.randomBytes(6).toString('hex')}`);
    const target = path.join(dir, manifest.id);
    const old = path.join(dir, `.old-${crypto.randomBytes(6).toString('hex')}`);
    try {
        for (const file of checked.files) {
            const destination = path.join(stage, file.path);
            await fs.mkdir(path.dirname(destination), { recursive: true });
            await fs.writeFile(destination, file.buffer);
        }
        const installedAt = new Date().toISOString();
        await fs.writeFile(path.join(stage, '.install.json'), JSON.stringify({ source, ref, installedAt }));
        let replaced = false;
        try {
            await fs.rename(target, old);
            replaced = true;
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        await fs.rename(stage, target);
        if (replaced) await fs.rm(old, { recursive: true, force: true });
        return { id: manifest.id, name: manifest.name, version: manifest.version || null, installedAt, skipped: checked.skipped };
    } catch (error) {
        await fs.rm(stage, { recursive: true, force: true });
        throw error;
    }
}

async function filesIn(folder) {
    const out = [];
    for (const sub of ['assets', 'fonts']) {
        let names = [];
        try {
            names = await fs.readdir(path.join(folder, sub));
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        names.forEach((name) => {
            const relative = `${sub}/${name}`;
            if (ruleFor(relative)) out.push(relative);
        });
    }
    return out.sort();
}

/** Installed themes: [{ id, manifest, files, source, ref, installedAt }]. */
async function listThemes(uploadsRoot) {
    const dir = themesDir(uploadsRoot);
    let names;
    try {
        names = await fs.readdir(dir);
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
    const themes = [];
    for (const id of names.filter((name) => THEME_ID.test(name)).sort()) {
        const folder = path.join(dir, id);
        try {
            const { manifest } = readManifest(await fs.readFile(path.join(folder, 'theme.json')));
            if (!manifest || manifest.id !== id) continue;
            let install = {};
            try {
                install = JSON.parse(await fs.readFile(path.join(folder, '.install.json'), 'utf8'));
            } catch {
                // An install record is a convenience; the theme stands without one.
            }
            themes.push({
                id,
                manifest,
                files: await filesIn(folder),
                source: install.source || null,
                ref: install.ref || null,
                installedAt: install.installedAt || null,
            });
        } catch (error) {
            if (error.code !== 'ENOENT') console.warn(`Skipping installed theme ${id}:`, error.message);
        }
    }
    return themes;
}

/** The path, type and headers for one installed theme file, or null. */
function resolveThemeFile(uploadsRoot, id, relative) {
    if (typeof id !== 'string' || !THEME_ID.test(id)) return null;
    const rule = ruleFor(relative);
    if (!rule || rule.kind === 'manifest') return null;
    return {
        path: path.join(themesDir(uploadsRoot), id, relative),
        type: TYPES[extOf(relative)],
        csp: FILE_CSP,
    };
}

async function removeTheme(uploadsRoot, id) {
    if (typeof id !== 'string' || !THEME_ID.test(id)) return false;
    const folder = path.join(themesDir(uploadsRoot), id);
    try {
        await fs.access(folder);
    } catch {
        return false;
    }
    await fs.rm(folder, { recursive: true, force: true });
    return true;
}

// --- The themes repository: one folder per theme at its root ---------------

const GITHUB_HEADERS = { Accept: 'application/vnd.github+json', 'User-Agent': 'HomeGlow-Server/1.0' };
const manifestCache = new Map(); // blob sha -> manifest

// The repository at one commit: its sha and file tree. Every file is then read
// at that commit, never at HEAD: raw.githubusercontent.com caches HEAD for five
// minutes, so right after a merge HEAD can serve the old file under the new
// tree (a stale manifest, or an install of old files recorded as current).
async function repoSnapshot(http, repository) {
    const { data: commit } = await http.get(`https://api.github.com/repos/${repository}/commits/HEAD`, {
        headers: GITHUB_HEADERS,
        timeout: 10000,
    });
    const sha = commit?.sha;
    if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) throw new Error('no commit for HEAD');
    const { data } = await http.get(`https://api.github.com/repos/${repository}/git/trees/${sha}?recursive=1`, {
        headers: GITHUB_HEADERS,
        timeout: 10000,
    });
    return { commit: sha, tree: Array.isArray(data?.tree) ? data.tree : [] };
}

const rawUrl = (repository, commit, filePath) => `https://raw.githubusercontent.com/${repository}/${commit}/${filePath.split('/').map(encodeURIComponent).join('/')}`;

async function fetchRaw(http, repository, commit, filePath) {
    const { data } = await http.get(rawUrl(repository, commit, filePath), { responseType: 'arraybuffer', timeout: 15000 });
    return Buffer.from(data);
}

/**
 * The themes the repository offers: each root folder holding a theme.json
 * whose id matches the folder. Two API calls (the commit and its tree);
 * manifests come from raw file URLs at that commit (no API quota) and are
 * cached by blob sha, which is safe because a commit's files never change.
 */
async function listRepositoryThemes(http, repository) {
    const { commit, tree } = await repoSnapshot(http, repository);
    const entries = tree.filter((entry) => entry.type === 'blob' && /^[^/]+\/theme\.json$/.test(entry.path));
    const themes = await Promise.all(entries.map(async (entry) => {
        const folder = entry.path.split('/')[0];
        if (!THEME_ID.test(folder)) return null;
        try {
            let manifest = manifestCache.get(entry.sha);
            if (!manifest) {
                const buffer = await fetchRaw(http, repository, commit, entry.path);
                const read = readManifest(buffer);
                if (read.error) {
                    // Newer than this core: listed apart, so the admin page
                    // can say why it is not offered.
                    const newer = newerManifest(buffer);
                    return newer && newer.id === folder ? { unsupported: newer } : null;
                }
                manifest = read.manifest;
                manifestCache.set(entry.sha, manifest);
            }
            if (manifest.id !== folder) return null;
            const preview = tree.find((other) => other.type === 'blob' && new RegExp(`^${folder}/preview\\.(png|jpg|webp)$`).test(other.path));
            return {
                id: manifest.id,
                name: manifest.name,
                version: manifest.version || null,
                author: manifest.author || null,
                description: manifest.description || null,
                // The folder's tree sha changes when any file in it does.
                ref: tree.find((other) => other.type === 'tree' && other.path === folder)?.sha || entry.sha,
                previewUrl: preview ? rawUrl(repository, commit, preview.path) : null,
            };
        } catch (error) {
            console.warn(`Could not read theme ${folder} from ${repository}:`, error.message);
            return null;
        }
    }));
    const listed = themes.filter(Boolean);
    return {
        themes: listed.filter((theme) => !theme.unsupported).sort((a, b) => a.name.localeCompare(b.name)),
        unsupported: listed.filter((theme) => theme.unsupported).map((theme) => theme.unsupported),
    };
}

// A manifest too new for this core, as { id, name, manifestVersion }, or null.
function newerManifest(buffer) {
    try {
        const manifest = JSON.parse(buffer.toString('utf8'));
        if (!manifest || typeof manifest.id !== 'string' || !Number.isInteger(manifest.manifestVersion)) return null;
        if (manifest.manifestVersion <= MANIFEST_VERSION) return null;
        const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
        return {
            id: manifest.id,
            name: text(manifest.name) || manifest.id,
            version: text(manifest.version),
            author: text(manifest.author),
            description: text(manifest.description),
            manifestVersion: manifest.manifestVersion,
        };
    } catch {
        return null;
    }
}

/** One theme folder's files from the repository, as [{ path, buffer }]. */
async function fetchRepositoryTheme(http, repository, folder) {
    if (typeof folder !== 'string' || !THEME_ID.test(folder)) return { error: 'Unknown theme.', status: 400 };
    const { commit, tree } = await repoSnapshot(http, repository);
    const prefix = `${folder}/`;
    const blobs = tree.filter((entry) => entry.type === 'blob' && entry.path.startsWith(prefix) && ruleFor(entry.path.slice(prefix.length)));
    const manifestEntry = blobs.find((entry) => entry.path === `${prefix}theme.json`);
    if (!manifestEntry) return { error: 'That theme is not in the repository.', status: 404 };
    if (blobs.length > MAX_FILES) return { error: `A theme may have at most ${MAX_FILES} files.`, status: 413 };
    if (blobs.reduce((sum, entry) => sum + (entry.size || 0), 0) > MAX_TOTAL_BYTES) {
        return { error: `A theme may total at most ${MAX_TOTAL_BYTES / (1024 * 1024)} MB.`, status: 413 };
    }
    const files = await Promise.all(blobs.map(async (entry) => ({
        path: entry.path.slice(prefix.length),
        buffer: await fetchRaw(http, repository, commit, entry.path),
    })));
    const folderEntry = tree.find((entry) => entry.type === 'tree' && entry.path === folder);
    return { files, ref: folderEntry?.sha || manifestEntry.sha };
}

module.exports = {
    MANIFEST_VERSION,
    MAX_FILES,
    MAX_FILE_BYTES,
    MAX_TOTAL_BYTES,
    THEME_ID,
    checkTheme,
    installTheme,
    listThemes,
    resolveThemeFile,
    removeTheme,
    listRepositoryThemes,
    fetchRepositoryTheme,
};
