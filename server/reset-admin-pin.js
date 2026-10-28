// Removes a forgotten admin PIN. It runs on the server, so it takes access
// to the server itself: the API changes or removes the PIN only for someone
// who knows it (utils/adminPin.js). Safe while HomeGlow is running; set a new
// PIN in the Admin Panel afterwards.
//
//   Docker:       docker exec homeglow-backend node reset-admin-pin.js
//   Proxmox LXC:  pct exec <CTID> -- docker exec homeglow-backend node reset-admin-pin.js
//   From source:  cd server && npm run reset-pin
const fs = require('fs');
const Database = require('better-sqlite3');
const { clearAdminPin } = require('./utils/adminPin');
const { resolveDbPath } = require('./utils/dbPath');

function main() {
  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) {
    console.error(`No HomeGlow database at ${dbPath}. Set DB_PATH if it lives elsewhere.`);
    return 1;
  }
  const db = new Database(dbPath, { fileMustExist: true });
  try {
    // The running server may be writing; wait for it rather than fail.
    db.pragma('busy_timeout = 5000');
    const hadPin = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'admin_pin'").get()
      && clearAdminPin(db);
    console.log(hadPin
      ? 'The admin PIN is removed. Open the Admin Panel to set a new one.'
      : 'No admin PIN was set. Nothing to do.');
    return 0;
  } finally {
    db.close();
  }
}

process.exitCode = main();
