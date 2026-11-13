// What chore points are called (utils/points.js, issue #392): the defaults,
// what's kept of a household's own choice, and the settings route storing it
// tidied.
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const {
  normalizePointsName, normalizePointsIcon, normalizePointsSetting, readPoints,
} = require('../utils/points');

test('a name is trimmed, its spaces collapsed, and cut at 24 characters', () => {
  assert.equal(normalizePointsName('  Gold   coins '), 'Gold coins');
  assert.equal(normalizePointsName('x'.repeat(30)), 'x'.repeat(24));
  assert.equal(normalizePointsName('   '), '');
  assert.equal(normalizePointsName(undefined), '');
  assert.equal(normalizePointsName(42), '');
});

test('an icon keeps an emoji, including sequences, and drops text', () => {
  assert.equal(normalizePointsIcon(' 🥟 '), '🥟');
  assert.equal(normalizePointsIcon('❤️'), '❤️');
  assert.equal(normalizePointsIcon('👨‍👩‍👧'), '👨‍👩‍👧');
  assert.equal(normalizePointsIcon('🇺🇸'), '🇺🇸');
  assert.equal(normalizePointsIcon('1️⃣'), '1️⃣');
  assert.equal(normalizePointsIcon('Stars'), '');
  assert.equal(normalizePointsIcon('⭐ x'), '');
  assert.equal(normalizePointsIcon('⭐'.repeat(17)), '');
  assert.equal(normalizePointsIcon(''), '');
  assert.equal(normalizePointsIcon(null), '');
});

test('only the points keys are normalized for storage', () => {
  assert.equal(normalizePointsSetting('POINTS_NAME', ' Robux '), 'Robux');
  assert.equal(normalizePointsSetting('POINTS_ICON', 'abc'), '');
  assert.equal(normalizePointsSetting('daily_completion_clam_reward', '5'), undefined);
});

test('readPoints fills in Stars and ⭐ for anything unset or unusable', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)');
  assert.deepEqual(readPoints(db), { name: 'Stars', icon: '⭐' });

  db.prepare("INSERT INTO settings (key, value) VALUES ('POINTS_NAME', 'Clams'), ('POINTS_ICON', '🥟')").run();
  assert.deepEqual(readPoints(db), { name: 'Clams', icon: '🥟' });

  db.prepare("UPDATE settings SET value = '' WHERE key = 'POINTS_NAME'").run();
  db.prepare("UPDATE settings SET value = 'nope' WHERE key = 'POINTS_ICON'").run();
  assert.deepEqual(readPoints(db), { name: 'Stars', icon: '⭐' });
});

test('readPoints falls back to the defaults without a settings table', () => {
  assert.deepEqual(readPoints(new Database(':memory:')), { name: 'Stars', icon: '⭐' });
});
