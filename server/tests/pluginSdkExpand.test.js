const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// HomeGlow.expandSize and HomeGlow.onExpand: the dashboard tells a plugin how
// big it is shown when a display expands it (client/src/utils/widgetExpand.js).
const sdkSource = fs.readFileSync(path.resolve(__dirname, '..', 'plugin-sdk', 'v1.js'), 'utf8');

function loadSdk() {
  const listeners = [];
  const parent = {};
  const window = {
    parent,
    location: { search: '', href: 'https://hg.example/widgets/x.html', origin: 'https://hg.example' },
    addEventListener: (type, handler) => { if (type === 'message') listeners.push(handler); },
  };
  const document = { documentElement: { style: { setProperty() {} }, setAttribute() {} }, fonts: { add() {} } };
  const errors = [];
  const console = { error: (...args) => errors.push(args) };
  vm.runInNewContext(sdkSource, { window, document, URLSearchParams, URL, console, fetch: () => Promise.reject(new Error('no network')) });
  const deliver = (data, source = parent) => listeners.forEach((handler) => handler({ source, data }));
  return { HomeGlow: window.HomeGlow, deliver, errors };
}

test('a plugin starts at normal size', () => {
  const { HomeGlow } = loadSdk();
  assert.equal(HomeGlow.expandSize, 'normal');
});

test('onExpand is called at once, then on each change, and unsubscribes', () => {
  const { HomeGlow, deliver } = loadSdk();
  const seen = [];
  const off = HomeGlow.onExpand((size) => seen.push(size));
  deliver({ type: 'homeglow:expand', size: 'half' });
  deliver({ type: 'homeglow:expand', size: 'half' });
  deliver({ type: 'homeglow:expand', size: 'full' });
  deliver({ type: 'homeglow:expand', size: 'normal' });
  off();
  deliver({ type: 'homeglow:expand', size: 'half' });
  assert.deepEqual(seen, ['normal', 'half', 'full', 'normal']);
  assert.equal(HomeGlow.expandSize, 'half');
});

test('an unknown size is normal, and only the parent is heard', () => {
  const { HomeGlow, deliver } = loadSdk();
  deliver({ type: 'homeglow:expand', size: 'full' }, {});
  assert.equal(HomeGlow.expandSize, 'normal');
  deliver({ type: 'homeglow:expand', size: 'full' });
  deliver({ type: 'homeglow:expand', size: 'giant' });
  assert.equal(HomeGlow.expandSize, 'normal');
});

test('a failing handler does not stop the others', () => {
  const { HomeGlow, deliver, errors } = loadSdk();
  const seen = [];
  HomeGlow.onExpand((size) => { if (size !== 'normal') throw new Error('boom'); });
  HomeGlow.onExpand((size) => seen.push(size));
  deliver({ type: 'homeglow:expand', size: 'half' });
  assert.deepEqual(seen, ['normal', 'half']);
  assert.equal(errors.length, 1);
});
