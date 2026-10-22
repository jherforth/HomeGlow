// Backup archives (utils/tarArchive.js): packed and unpacked with absolute
// paths on this platform. On Windows with Git's GNU tar first on the PATH,
// absolute "C:\..." paths used to be read as a remote host.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createArchive, extractArchive } = require('../utils/tarArchive');

test('an archive round-trips, whole or one member, from absolute paths', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'homeglow-tar-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  fs.mkdirSync(path.join(source, 'uploads', 'photos'), { recursive: true });
  fs.writeFileSync(path.join(source, 'tasks.db'), 'database');
  fs.writeFileSync(path.join(source, '.encryption-key'), 'key');
  fs.writeFileSync(path.join(source, 'uploads', 'photos', 'a b.jpg'), 'photo');

  // The archive lives outside the folder it packs, as a backup's does.
  const archive = path.join(root, 'out', 'backup.tar.gz');
  fs.mkdirSync(path.dirname(archive));
  createArchive(archive, source);
  assert.ok(fs.statSync(archive).size > 0);

  const whole = path.join(root, 'whole');
  fs.mkdirSync(whole);
  extractArchive(archive, whole);
  assert.equal(fs.readFileSync(path.join(whole, 'tasks.db'), 'utf8'), 'database');
  assert.equal(fs.readFileSync(path.join(whole, 'uploads', 'photos', 'a b.jpg'), 'utf8'), 'photo');

  const keyOnly = path.join(root, 'key-only');
  fs.mkdirSync(keyOnly);
  extractArchive(archive, keyOnly, ['./.encryption-key']);
  assert.deepEqual(fs.readdirSync(keyOnly), ['.encryption-key']);
});
