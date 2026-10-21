// What the plugin store lists from the HomeGlowPlugins repository.
//
// The repository is read as one git tree (GET /git/trees/{ref}?recursive=1),
// which costs a single GitHub call however the plugins are laid out. Every
// .html file in it is a plugin, at any depth: loose at the root as the
// repository first kept them, one folder down, or in a category folder of its
// own (household/Vacuum/Vacuum.html). Walking folder by folder instead would
// spend a call per folder of an unsigned server's 60 an hour.
//
// A plugin's file name is its identity on an install (the plugins table is
// keyed by it, and the store matches by it when a plugin has no manifest id),
// so the name listed is the file's, never its folder's.
//
// A preview image is a sibling file rather than something embedded in the
// plugin: "chore-metrics.png" beside "chore-metrics.html", in the same folder.
//
// Deliberately not a manifest field. An older HomeGlow returns the whole
// manifest in GET /api/widgets, which the dashboard fetches on every boot, so a
// base64 image in there would be downloaded by every display on every page load
// on any install that has not upgraded. A sibling file is invisible to those
// versions and costs nothing extra here, because the tree already lists every
// file.

const PLUGIN_PREVIEW_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

const folderOf = (filePath) => {
    const slash = filePath.lastIndexOf('/');
    return slash < 0 ? '' : filePath.slice(0, slash);
};
const nameOf = (filePath) => filePath.slice(filePath.lastIndexOf('/') + 1);
const stemOf = (fileName) => {
    const dot = fileName.lastIndexOf('.');
    return dot < 0 ? fileName : fileName.slice(0, dot);
};
const previewKey = (folder, stem) => `${folder}\n${stem.toLowerCase()}`;

// The store's entries from a git tree's entries ({ path, type, sha, size }):
// one per .html file, sorted by name. `pinned` turns a repository path into
// the address to download it from, at the commit the tree was read at.
function listPluginsFromTree(entries, pinned) {
    const files = (Array.isArray(entries) ? entries : [])
        .filter((entry) => entry && entry.type === 'blob' && typeof entry.path === 'string');

    const previews = new Map();
    for (const file of files) {
        const name = nameOf(file.path);
        const dot = name.lastIndexOf('.');
        if (dot < 0 || !PLUGIN_PREVIEW_EXTENSIONS.includes(name.slice(dot).toLowerCase())) continue;
        const key = previewKey(folderOf(file.path), name.slice(0, dot));
        if (!previews.has(key)) previews.set(key, file.path);
    }

    return files
        .filter((file) => /\.html$/i.test(file.path))
        .map((file) => {
            const filename = nameOf(file.path);
            const folder = folderOf(file.path);
            const preview = previews.get(previewKey(folder, stemOf(filename)));
            return {
                name: stemOf(filename),
                filename,
                // Filled in from each plugin's own manifest. Null rather than a
                // synthesised string: a plugin with no manifest has no
                // description, and saying so is more useful than inventing one.
                description: null,
                previewUrl: preview ? pinned(preview) : null,
                download_url: pinned(file.path),
                sha: file.sha,
                path: file.path,
                size: file.size,
                type: 'file',
                ...(folder ? { folder } : {}),
            };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.path.localeCompare(b.path));
}

module.exports = { PLUGIN_PREVIEW_EXTENSIONS, listPluginsFromTree };
