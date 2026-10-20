// What the plugin store lists from the HomeGlowPlugins repository's git tree.
const test = require('node:test');
const assert = require('node:assert/strict');

const { listPluginsFromTree } = require('../utils/pluginStoreListing');

const pinned = (filePath) => `https://raw.example/abc123/${filePath}`;
const blob = (path, sha = `sha-${path}`, size = 100) => ({ path, type: 'blob', sha, size });
const tree = (path) => ({ path, type: 'tree', sha: `tree-${path}` });

test('plugins loose at the root are listed, with their previews', () => {
    const listed = listPluginsFromTree([
        blob('Countdown.html'), blob('Countdown.png'), blob('Bills.html'), blob('README.md'),
    ], pinned);
    assert.deepEqual(listed.map((p) => p.name), ['Bills', 'Countdown']);
    const countdown = listed.find((p) => p.name === 'Countdown');
    assert.equal(countdown.filename, 'Countdown.html');
    assert.equal(countdown.path, 'Countdown.html');
    assert.equal(countdown.download_url, pinned('Countdown.html'));
    assert.equal(countdown.previewUrl, pinned('Countdown.png'));
    assert.equal(countdown.sha, 'sha-Countdown.html');
    assert.equal(countdown.type, 'file');
    assert.equal('folder' in countdown, false);
    assert.equal(listed.find((p) => p.name === 'Bills').previewUrl, null);
});

test('plugins in a category folder of their own are listed by file name', () => {
    const listed = listPluginsFromTree([
        tree('household'), tree('household/Vacuum'),
        blob('household/Vacuum/Vacuum.html'), blob('household/Vacuum/Vacuum.png'),
        blob('household/Vacuum/Vacuum.md'), blob('household/Vacuum/Vacuum-clean-button.yaml'),
        tree('chores-rewards'), tree('chores-rewards/chore-metrics'),
        blob('chores-rewards/chore-metrics/chore-metrics.html'), blob('chores-rewards/chore-metrics/chore-metrics.png'),
    ], pinned);
    assert.deepEqual(listed.map((p) => p.filename), ['chore-metrics.html', 'Vacuum.html']);
    const vacuum = listed.find((p) => p.filename === 'Vacuum.html');
    assert.equal(vacuum.name, 'Vacuum');
    assert.equal(vacuum.folder, 'household/Vacuum');
    assert.equal(vacuum.path, 'household/Vacuum/Vacuum.html');
    assert.equal(vacuum.download_url, pinned('household/Vacuum/Vacuum.html'));
    assert.equal(vacuum.previewUrl, pinned('household/Vacuum/Vacuum.png'));
});

test('plugins one folder down are still listed', () => {
    const listed = listPluginsFromTree([tree('games'), blob('games/WordGuess.html'), blob('games/WordGuess.webp')], pinned);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, 'WordGuess');
    assert.equal(listed[0].folder, 'games');
    assert.equal(listed[0].previewUrl, pinned('games/WordGuess.webp'));
});

test('a preview is only ever taken from the plugin\'s own folder', () => {
    const listed = listPluginsFromTree([
        blob('Music.png'),
        blob('household/Music/Music.html'),
        blob('household/Other/Music.png'),
    ], pinned);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].previewUrl, null);
});

test('a preview matches its plugin whatever the case of either name', () => {
    const listed = listPluginsFromTree([blob('health/nightscout/nightscout.html'), blob('health/nightscout/Nightscout.PNG')], pinned);
    assert.equal(listed[0].previewUrl, pinned('health/nightscout/Nightscout.PNG'));
});

test('only .html files are plugins, and folders themselves are not', () => {
    const listed = listPluginsFromTree([
        tree('docs'), blob('docs/WidgetDevGuide.md'), blob('household/Vacuum/Vacuum-dreame-rooms.yaml'),
        blob('.gitignore'), tree('household/Vacuum.html'),
    ], pinned);
    assert.deepEqual(listed, []);
});

test('an empty or missing tree lists nothing', () => {
    assert.deepEqual(listPluginsFromTree(undefined, pinned), []);
    assert.deepEqual(listPluginsFromTree([], pinned), []);
    assert.deepEqual(listPluginsFromTree([null, { type: 'blob' }], pinned), []);
});
