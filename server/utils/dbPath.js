// Where the database file lives: DB_PATH, else server/data/tasks.db. Shared by
// the server and reset-admin-pin.js, so both open the same file.
const path = require('path');

function resolveDbPath(env = process.env) {
  return env.DB_PATH
    ? path.resolve(env.DB_PATH)
    : path.resolve(__dirname, '..', 'data', 'tasks.db');
}

module.exports = { resolveDbPath };
