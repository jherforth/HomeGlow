// The backend's /index.css (used by `npm run dev`) arrives with Classic's
// tokens inlined, so a plugin frame never asks for ./themes/classic.css.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { inlineCssImports } = require('../utils/inlineCssImports');

const INDEX_CSS = path.join(__dirname, '..', '..', 'client', 'src', 'index.css');
const CLASSIC_CSS = path.join(__dirname, '..', '..', 'client', 'src', 'themes', 'classic.css');

test('the plugin stylesheet carries Classic inline, with no local import left', async () => {
    const out = await inlineCssImports(fs.readFileSync(INDEX_CSS, 'utf-8'), INDEX_CSS);
    assert.doesNotMatch(out, /@import\s+['"]\.\//);
    assert.ok(out.includes(fs.readFileSync(CLASSIC_CSS, 'utf-8').trim().slice(0, 200)));
});

test('remote and bare imports are left as written', async () => {
    const css = "@import url('https://fonts.example/x.css');\n@import 'pkg/x.css';";
    assert.equal(await inlineCssImports(css, INDEX_CSS), css);
});
