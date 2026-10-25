// What a plugin may ask the server for (utils/pluginRequestPolicy.js): the
// token, the routes, preflights, public files, and the origins that may read
// the API.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  issueToken, verifyToken, routeDecision, decide, createOriginAllowList,
} = require('../utils/pluginRequestPolicy');

const SECRET = 'test-secret';
const grill = issueToken(SECRET, 'plugin:grill-card');
const request = (method, url, headers = {}) => ({ method, url, headers: { origin: 'null', ...headers } });
const withToken = (method, url, token = grill) => request(method, url, { 'x-homeglow-plugin-token': token });

test('a token names what it was issued for, and only verifies with the secret', () => {
  assert.equal(verifyToken(SECRET, grill), 'plugin:grill-card');
  assert.equal(verifyToken('another-secret', grill), null);
  assert.equal(verifyToken(SECRET, grill.replace('grill-card', 'polls')), null, 'the id is signed');
  assert.equal(verifyToken(SECRET, `${grill}x`), null);
  for (const bad of [undefined, '', 'nodot', '.abc', 'x'.repeat(600), 42]) assert.equal(verifyToken(SECRET, bad), null);
  assert.equal(verifyToken(SECRET, issueToken(SECRET, 'widget:Clock.html')), 'widget:Clock.html');
  assert.equal(verifyToken(SECRET, issueToken(SECRET, 'admin:everything')), null, 'only plugin and widget subjects');
});

test('a plugin reaches only its own platform API', () => {
  for (const url of [
    '/api/plugin/v1/storage/grill-card/cook',
    '/api/plugin/v1/storage/grill-card',
    '/api/plugin/v1/settings/grill-card?device=Kitchen',
    '/api/plugin/v1/notify/grill-card',
    '/api/plugin/v1/ha/grill-card/action',
  ]) {
    assert.equal(routeDecision('POST', url, 'plugin:grill-card').allow, true, url);
    assert.equal(routeDecision('POST', url.replace('grill-card', 'ha-garage'), 'plugin:grill-card').allow, false, url);
  }
  assert.equal(routeDecision('GET', '/api/plugin/v1/storage/grill-card/x', 'widget:Clock.html').allow, false, 'a plain widget has no platform API');
  assert.equal(routeDecision('GET', '/api/plugin/v1/storage/grill%2Dcard/x', 'plugin:grill-card').allow, true, 'percent-encoded id');
});

test('core data is read-only, and the rest of the API is closed', () => {
  for (const url of ['/api/users', '/api/settings', '/api/timezone', '/api/calendar-events?from=1', '/api/devices/Kitchen/tabs', '/api/weather', '/api/weather/condition', '/api/proxy?targetUrl=x', '/api/sun', '/api/chore-history']) {
    assert.equal(routeDecision('GET', url, 'plugin:grill-card').allow, true, url);
  }
  assert.equal(routeDecision('POST', '/api/settings', 'plugin:grill-card').allow, false);
  assert.equal(routeDecision('DELETE', '/api/users', 'plugin:grill-card').allow, false);
  for (const url of [
    '/api/backup/local/export', '/api/backup/drive/restart', '/api/admin-pin/verify', '/api/widgets/github/install',
    '/api/plugin/v1/events/stream', '/widgets/Other.html', '/api/connections/homeassistant',
    '/api/devices/Kitchen/settings', '/api/settingsX', '/api/users/../backup/local/export',
  ]) {
    assert.equal(routeDecision('GET', url, 'plugin:grill-card').allow, false, url);
    assert.equal(routeDecision('POST', url, 'plugin:grill-card').allow, false, url);
  }
});

test('the household writes the plugin guide documents stay open, and only those', () => {
  for (const url of ['/api/users/3/clams/add', '/api/users/3/clams/reduce', '/api/chores/complete', '/api/chores/uncomplete', '/api/settings/search']) {
    assert.equal(routeDecision('POST', url, 'plugin:grill-card').allow, true, url);
    assert.equal(routeDecision('DELETE', url, 'plugin:grill-card').allow, false, url);
  }
  for (const url of ['/api/users', '/api/users/3', '/api/chores', '/api/prizes', '/api/settings']) {
    assert.equal(routeDecision('POST', url, 'plugin:grill-card').allow, false, url);
  }
  for (const url of ['/api/users/3/clams', '/api/chore-history/user/3', '/api/chore-history/summary/3', '/api/chore-history/recent', '/api/prizes', '/api/calendar', '/api/photo-items']) {
    assert.equal(routeDecision('GET', url, 'plugin:grill-card').allow, true, url);
  }
});

test('a request from a plugin needs a valid token; others are not this policy\'s', () => {
  assert.deepEqual(decide({ method: 'POST', url: '/api/settings', headers: {} }, () => SECRET), { applies: false });
  assert.deepEqual(decide({ method: 'POST', url: '/api/settings', headers: { origin: 'http://homeglow.lan' } }, () => SECRET), { applies: false });
  assert.equal(decide(request('GET', '/api/users'), () => SECRET).allow, false, 'no token');
  assert.equal(decide(withToken('GET', '/api/users', 'forged.token'), () => SECRET).allow, false);
  assert.deepEqual(decide(withToken('GET', '/api/users'), () => SECRET), { applies: true, allow: true, subject: 'plugin:grill-card' });
  assert.match(decide(withToken('POST', '/api/settings'), () => SECRET).reason, /only read/);
});

test('a preflight is answered for the route and method, without a token', () => {
  const preflight = (url, method) => decide(request('OPTIONS', url, { 'access-control-request-method': method }), () => { throw new Error('no secret needed'); });
  assert.equal(preflight('/api/plugin/v1/storage/grill-card/x', 'PUT').allow, true);
  assert.equal(preflight('/api/users', 'GET').allow, true);
  assert.equal(preflight('/api/settings', 'POST').allow, false);
  assert.equal(preflight('/api/backup/local/export', 'POST').allow, false);
});

test('a theme\'s files need no token: FontFace can\'t add one', () => {
  const lazy = () => { throw new Error('no secret needed'); };
  assert.equal(decide(request('GET', '/api/themes/weather/fonts/Inter.woff2?v=2'), lazy).allow, true);
  assert.equal(decide(request('POST', '/api/themes/weather/fonts/Inter.woff2'), () => SECRET).allow, false);
  // A plugin's own fetch of one carries the token header, so it is preflighted.
  assert.equal(decide(request('OPTIONS', '/api/themes/weather/fonts/Inter.woff2', { 'access-control-request-method': 'GET' }), lazy).allow, true);
  assert.equal(decide(request('OPTIONS', '/api/themes/weather/fonts/Inter.woff2', { 'access-control-request-method': 'PUT' }), () => SECRET).allow, false);
});

test('only listed origins, and the dev server in development, may read the API', () => {
  const production = createOriginAllowList({ corsOrigins: 'https://dash.example.com/, http://tablet.lan:8080', nodeEnv: 'production' });
  assert.equal(production('https://dash.example.com'), true);
  assert.equal(production('http://tablet.lan:8080'), true);
  assert.equal(production('http://localhost:3001'), false);
  assert.equal(production('https://evil.example'), false);
  assert.equal(production('null'), false);
  assert.equal(production(undefined), false);

  const development = createOriginAllowList({ corsOrigins: '', nodeEnv: 'development' });
  assert.equal(development('http://localhost:3001'), true);
  assert.equal(development('http://127.0.0.1:5173'), true);
  assert.equal(development('http://localhost.evil.example'), false);
  assert.equal(development('https://evil.example'), false);
  assert.equal(development('null'), false);
});
