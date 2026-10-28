// The admin PIN, checked by the server itself (mrramam/HomeGlow#62).
//
// The PIN keeps casual hands out of the Admin Panel on a shared display. It
// isn't a login: most of the API takes requests from any device on the home
// network. The routes that hand out a secret or replace the household's data
// (a backup with its encryption key, staging a restore or a rollback) and a
// Home Assistant panel's unlock actions check it here as well.
//
// Stored as scrypt with a random salt. A PIN saved by an older version, an
// unsalted SHA-256, still works and is rehashed on its next correct entry.
// Every check shares one limit on wrong guesses: a 4-digit PIN would
// otherwise fall to 10,000 requests.
//
// Changing or removing the PIN takes the current one. A forgotten PIN is
// reset on the server itself (reset-admin-pin.js), never over the network.
const crypto = require('crypto');

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SCRYPT_KEYLEN = 32;
const LEGACY_SHA256 = /^[0-9a-f]{64}$/;

// Wrong guesses allowed before a wait, then the wait for each one after,
// doubling up to the cap. A household member who mistypes a few times never
// waits; 10,000 guesses at five minutes each take weeks.
const FREE_ATTEMPTS = 5;
const FIRST_LOCK_MS = 30 * 1000;
const MAX_LOCK_MS = 5 * 60 * 1000;

const scrypt = (pin, salt) => new Promise((resolve, reject) => {
  crypto.scrypt(pin, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS, (error, key) => (error ? reject(error) : resolve(key)));
});

async function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(pin), salt);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

const sameBytes = (a, b) => a.length === b.length && crypto.timingSafeEqual(a, b);

// Whether `pin` is the one `stored` was made from, in either format.
async function pinMatchesHash(pin, stored) {
  if (typeof pin !== 'string' || typeof stored !== 'string') return false;
  if (LEGACY_SHA256.test(stored)) {
    return sameBytes(Buffer.from(crypto.createHash('sha256').update(pin).digest('hex')), Buffer.from(stored));
  }
  const [scheme, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  return sameBytes(await scrypt(pin, Buffer.from(salt, 'base64url')), Buffer.from(key, 'base64url'));
}

async function setAdminPin(db, pin) {
  const pinHash = await hashPin(pin);
  db.prepare(`
    INSERT INTO admin_pin (id, pin_hash) VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET pin_hash = excluded.pin_hash, updated_at = CURRENT_TIMESTAMP
  `).run(pinHash);
}

// Removes the PIN. Returns whether there was one. The routes call this only
// after the current PIN; reset-admin-pin.js calls it for a forgotten one.
function clearAdminPin(db) {
  return db.prepare('DELETE FROM admin_pin WHERE id = 1').run().changes > 0;
}

// One limit for the whole server, not per device: behind the bundled nginx
// every display has the same address.
const attempts = { failures: 0, lockedUntil: 0 };

function resetPinAttempts() {
  attempts.failures = 0;
  attempts.lockedUntil = 0;
}

/**
 * Checks `pin` against the stored PIN.
 *   -> { ok: true, noPin: true }   no PIN is set
 *    | { ok: true }                 the right PIN
 *    | { ok: false, reason: 'missing' }   none given; not counted as a guess
 *    | { ok: false, reason: 'wrong' }
 *    | { ok: false, reason: 'locked', retryAfterSeconds }
 * While locked, even the right PIN is refused, or the limit would only slow
 * a guesser down between hits.
 */
async function checkAdminPin(db, pin, now = Date.now()) {
  const stored = db.prepare('SELECT pin_hash FROM admin_pin WHERE id = 1').get();
  if (!stored) return { ok: true, noPin: true };
  if (attempts.lockedUntil > now) {
    return { ok: false, reason: 'locked', retryAfterSeconds: Math.ceil((attempts.lockedUntil - now) / 1000) };
  }
  if (typeof pin !== 'string' || pin === '') return { ok: false, reason: 'missing' };

  if (await pinMatchesHash(pin, stored.pin_hash)) {
    resetPinAttempts();
    if (LEGACY_SHA256.test(stored.pin_hash)) await setAdminPin(db, pin);
    return { ok: true };
  }
  attempts.failures += 1;
  if (attempts.failures >= FREE_ATTEMPTS) {
    attempts.lockedUntil = now + Math.min(MAX_LOCK_MS, FIRST_LOCK_MS * 2 ** (attempts.failures - FREE_ATTEMPTS));
  }
  return { ok: false, reason: 'wrong' };
}

// Answers a refused check: 429 while locked, otherwise 403 with `message`.
function refusePin(reply, result, message) {
  if (result.reason === 'locked') {
    return reply.code(429).header('Retry-After', String(result.retryAfterSeconds)).send({
      error: `Too many wrong PINs. Try again in ${result.retryAfterSeconds} seconds.`,
      retryAfterSeconds: result.retryAfterSeconds,
      needsPin: true,
    });
  }
  return reply.code(403).send({ error: message, needsPin: true });
}

module.exports = {
  FREE_ATTEMPTS,
  hashPin,
  pinMatchesHash,
  setAdminPin,
  clearAdminPin,
  checkAdminPin,
  refusePin,
  resetPinAttempts,
};
