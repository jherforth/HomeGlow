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
  const parent = {};
  const window = {
    parent,
    location: { search: '' },
    addEventListener: (type, handler) => { if (type === 'message') listeners.push(handler); },
  };
  const document = {
    documentElement: {
      style: { setProperty: (name, value) => vars.set(name, value) },
      setAttribute: (name, value) => attrs.set(name, value),
    },
  };
  const context = { window, document, URLSearchParams, console, fetch: () => Promise.reject(new Error('no network')) };
  vm.runInNewContext(sdkSource, context);
  const deliver = (data, source = parent) => listeners.forEach((handler) => handler({ source, data }));
  return { HomeGlow: window.HomeGlow, deliver, vars, attrs };
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
