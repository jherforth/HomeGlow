// The admin PIN, checked by the server itself.
//
// The Admin Panel's PIN guards the panel in the browser, not the API. The few
// routes that hand out a secret (a backup's encryption key, a whole backup
// with its key) check it here as well: true when no PIN is set, or when
// `pin` is the PIN. Compared in constant time.
const crypto = require('crypto');

function adminPinMatches(db, pin) {
  const stored = db.prepare('SELECT pin_hash FROM admin_pin WHERE id = 1').get();
  if (!stored) return true;
  const given = typeof pin === 'string' ? crypto.createHash('sha256').update(pin).digest('hex') : '';
  return given.length === stored.pin_hash.length
    && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(stored.pin_hash));
}

module.exports = { adminPinMatches };
