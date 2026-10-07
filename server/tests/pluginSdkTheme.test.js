const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Runs the SDK in a bare sandbox and drives its message listener directly,
// so the theme channel is tested without a browser: the trust check (sender
// must be the embedding parent), the validation (only hex colors and a
// decimal triplet reach the stylesheet), and the subscriber contract.
const sdkSource = fs.readFileSync(path.resolve(__dirname, '..', 'plugin-sdk', 'v1.js'), 'utf8');

function loadSdk() {
  const listeners = [];
  const vars = new Map();
  const attrs = new Map();
  const fonts = [];
  const parent = {};
  const window = {
    parent,
    location: { search: '', href: 'https://hg.example/widgets/x.html', origin: 'https://hg.example' },
    addEventListener: (type, handler) => { if (type === 'message') listeners.push(handler); },
  };
  const document = {
    documentElement: {
      style: { setProperty: (name, value) => vars.set(name, value) },
      setAttribute: (name, value) => attrs.set(name, value),
    },
    fonts: { add: (face) => fonts.push(face) },
  };
  function FontFace(family, source, descriptors) {
    this.family = family;
    this.source = source;
    this.descriptors = descriptors;
  }
  const context = { window, document, URLSearchParams, URL, FontFace, console, fetch: () => Promise.reject(new Error('no network')) };
  vm.runInNewContext(sdkSource, context);
  const deliver = (data, source = parent) => listeners.forEach((handler) => handler({ source, data }));
  return { HomeGlow: window.HomeGlow, deliver, vars, attrs, fonts };
}

test('a theme message from the parent lands on the root as CSS variables', () => {
  const { HomeGlow, deliver, vars, attrs } = loadSdk();
  deliver({ type: 'homeglow:theme', theme: 'light', colors: { primary: '#f5f5f5', secondary: '#38bdf8', accent: '#f472b6', accentRgb: '244, 114, 182' } });
  assert.equal(attrs.get('data-theme'), 'light');
  assert.equal(vars.get('--primary'), '#f5f5f5');
  assert.equal(vars.get('--secondary'), '#38bdf8');
  assert.equal(vars.get('--accent'), '#f472b6');
  assert.equal(vars.get('--accent-rgb'), '244, 114, 182');
  assert.deepEqual(HomeGlow.theme.colors, { primary: '#f5f5f5', secondary: '#38bdf8', accent: '#f472b6', accentRgb: '244, 114, 182' });
});

test('a message from any window other than the parent is ignored', () => {
  const { HomeGlow, deliver, vars } = loadSdk();
  deliver({ type: 'homeglow:theme', theme: 'light', colors: { accent: '#f472b6' } }, {});
  assert.equal(vars.size, 0);
  assert.equal(HomeGlow.theme, null);
});

test('only hex colors and a decimal triplet reach the stylesheet', () => {
  // The parent is trusted, but a value that is not a color must never be
  // written into a style property; a null (color not set) leaves the default.
  const { deliver, vars, attrs } = loadSdk();
  deliver({ type: 'homeglow:theme', theme: 'sepia', colors: { accent: 'red; background: url(x)', primary: null, accentRgb: '1,2,3' } });
  assert.equal(vars.size, 0);
  assert.equal(attrs.has('data-theme'), false);
  deliver({ type: 'homeglow:theme', theme: 'dark', colors: { accent: '#ABC', accentRgb: '170, 187, 204' } });
  assert.equal(vars.get('--accent'), '#ABC');
  assert.equal(vars.get('--accent-rgb'), '170, 187, 204');
  assert.equal(attrs.get('data-theme'), 'dark');
});

test('onTheme replays the current theme, follows changes, and unsubscribes', () => {
  const { HomeGlow, deliver } = loadSdk();
  const seen = [];
  deliver({ type: 'homeglow:theme', theme: 'dark', colors: { accent: '#111111' } });
  const off = HomeGlow.onTheme((current) => seen.push(current.colors.accent));
  assert.deepEqual(seen, ['#111111']);
  deliver({ type: 'homeglow:theme', theme: 'dark', colors: { accent: '#222222' } });
  off();
  deliver({ type: 'homeglow:theme', theme: 'dark', colors: { accent: '#333333' } });
  assert.deepEqual(seen, ['#111111', '#222222']);
});

test('event messages still reach on() handlers after the theme branch was added', () => {
  const { HomeGlow, deliver } = loadSdk();
  const payloads = [];
  HomeGlow.on('chore.completed', (payload) => payloads.push(payload));
  deliver({ type: 'homeglow:event', event: 'chore.completed', payload: { id: 7 }, emittedAt: 'now' });
  assert.deepEqual(payloads, [{ id: 7 }]);
});

test("the SDK's role list is the dashboard's", () => {
  // A plugin is promised the same names by both sides; a drift would silently
  // drop a token the dashboard sends.
  const read = (source, name) => JSON.parse(source.match(new RegExp(`${name} = (\\[[\\s\\S]*?\\]);`))[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  const client = fs.readFileSync(path.resolve(__dirname, '..', '..', 'client', 'src', 'utils', 'pluginThemeBridge.js'), 'utf8');
  assert.deepEqual(read(sdkSource, 'var ROLE_TOKENS'), read(client, 'export const PLUGIN_ROLE_TOKENS'));
});

test('role tokens (version 2) land on the root; others and unsafe values do not', () => {
  const { HomeGlow, deliver, vars } = loadSdk();
  deliver({
    type: 'homeglow:theme', version: 2, theme: 'dark', colors: {},
    tokens: {
      '--text': '#ffcc99',
      '--hg-radius-md': '14px',
      '--hg-font-body': "'Antonio', 'Arial Narrow', sans-serif",
      '--hg-meter-fill': '#ff9900',
      '--dock-bg': '#000000',
      '--border': 'red; background: url(x)',
      '--surface': 'url(https://evil.example/x.png)',
    },
  });
  assert.equal(vars.get('--text'), '#ffcc99');
  assert.equal(vars.get('--hg-radius-md'), '14px');
  assert.equal(vars.get('--hg-font-body'), "'Antonio', 'Arial Narrow', sans-serif");
  assert.equal(vars.get('--hg-meter-fill'), '#ff9900');
  assert.equal(vars.has('--dock-bg'), false);
  assert.equal(vars.has('--border'), false);
  assert.equal(vars.has('--surface'), false);
  assert.equal(HomeGlow.theme.tokens['--text'], '#ffcc99');
});

test("theme fonts register from this origin's theme folders only, once each", () => {
  const { deliver, fonts } = loadSdk();
  const good = { family: 'Antonio', weight: 700, style: 'normal', url: '/api/themes/starship/fonts/antonio-700.woff2?v=1' };
  const message = (list) => ({ type: 'homeglow:theme', version: 2, theme: 'dark', colors: {}, tokens: {}, fonts: list });
  deliver(message([
    good,
    { ...good, url: 'https://hg.example/api/themes/reef/fonts/nunito-400.woff2', family: 'Nunito', weight: 400 },
    { ...good, url: 'https://evil.example/api/themes/x/fonts/a.woff2' },
    { ...good, url: '/api/themes/x/assets/a.svg' },
    { ...good, family: 'Bad; family' },
    { ...good, weight: 1000 },
  ]));
  deliver(message([good]));
  assert.deepEqual(fonts.map((face) => [face.family, face.descriptors.weight]), [['Antonio', '700'], ['Nunito', '400']]);
  assert.equal(fonts[0].source, 'url("/api/themes/starship/fonts/antonio-700.woff2?v=1")');
});

test('a version 1 message still works: no tokens, no fonts', () => {
  const { HomeGlow, deliver, vars, fonts } = loadSdk();
  deliver({ type: 'homeglow:theme', theme: 'dark', colors: { accent: '#ff9900' } });
  assert.equal(vars.get('--accent'), '#ff9900');
  assert.equal(Object.keys(HomeGlow.theme.tokens).length, 0);
  assert.equal(fonts.length, 0);
});
