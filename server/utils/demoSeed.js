// Demo-mode sample data. Populates the (in-memory) database with a believable
// household — users, chores, schedules, clam history, prizes, and a week of
// calendar events — so a public demo visitor lands on a living dashboard
// instead of an empty first-run screen.
//
// resetDemoData() wipes the domain tables (never the settings/migration
// bookkeeping) and re-seeds; the server calls it at boot and on a recurring
// timer so one visitor's changes don't linger for the next.

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDateOnly(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function atHour(date, hours, minutes = 0) {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

// Tables holding visitor-modifiable domain data. Order matters for foreign
// keys (children first). settings is intentionally excluded: it stores the
// schema version + migration bookkeeping.
const DOMAIN_TABLES = [
  'chore_history',
  'chore_schedules',
  'chores',
  'prizes',
  'calendar_events_cache',
  'calendar_sync_status',
  'calendar_sources',
  'google_picked_media',
  'homeglow_photos',
  'photo_sources',
  'google_oauth_states',
  'google_accounts',
  'tabs',
  'devices',
  'admin_pin',
];

function wipeDomainTables(db) {
  for (const table of DOMAIN_TABLES) {
    try {
      if (table === 'users') continue; // handled separately (bonus user id 0 stays)
      db.prepare(`DELETE FROM ${table}`).run();
    } catch (err) {
      // Table may not exist on older schemas; demo DB is always current, but stay tolerant.
      console.warn(`Demo reset: skipping table ${table}: ${err.message}`);
    }
  }
  // Keep the system "bonus" user (id 0) created by migrations.
  db.prepare('DELETE FROM users WHERE id != 0').run();
}

function seedUsersAndChores(db) {
  const insertUser = db.prepare('INSERT INTO users (username, email) VALUES (?, ?)');
  const emmaId = insertUser.run('Emma', 'emma@demo.homeglow').lastInsertRowid;
  const liamId = insertUser.run('Liam', 'liam@demo.homeglow').lastInsertRowid;

  const insertChore = db.prepare('INSERT INTO chores (title, description, clam_value) VALUES (?, ?, ?)');
  const dishes = insertChore.run('Dishes', 'Load and run the dishwasher after dinner', 5).lastInsertRowid;
  const vacuum = insertChore.run('Vacuum living room', 'Including under the couch cushions', 10).lastInsertRowid;
  const trash = insertChore.run('Take out trash', 'Bins to the curb on pickup nights', 3).lastInsertRowid;
  const laundry = insertChore.run('Fold laundry', 'Fold and put away your basket', 5).lastInsertRowid;

  const insertSchedule = db.prepare(
    'INSERT INTO chore_schedules (chore_id, user_id, crontab, visible, duration) VALUES (?, ?, ?, 1, ?)'
  );
  insertSchedule.run(dishes, emmaId, '0 0 * * *', 'day-of');
  insertSchedule.run(laundry, emmaId, '0 0 * * 1,4', 'until-completed');
  insertSchedule.run(vacuum, liamId, '0 0 * * 1-5', 'day-of');
  insertSchedule.run(trash, liamId, '0 0 * * *', 'day-of');
  insertSchedule.run(vacuum, null, '0 0 * * 0,6', 'day-of'); // weekend bonus chore

  // A few days of completions so clam totals look lived-in.
  const insertHistory = db.prepare(
    'INSERT INTO chore_history (user_id, chore_schedule_id, date, clam_value, title) VALUES (?, NULL, ?, ?, ?)'
  );
  const today = new Date();
  for (let daysAgo = 1; daysAgo <= 4; daysAgo++) {
    const date = formatDateOnly(new Date(today.getTime() - daysAgo * DAY_MS));
    insertHistory.run(emmaId, date, 5, 'Dishes');
    if (daysAgo % 2 === 0) insertHistory.run(liamId, date, 10, 'Vacuum living room');
  }

  const insertPrize = db.prepare('INSERT INTO prizes (name, clam_cost) VALUES (?, ?)');
  insertPrize.run('Movie night pick', 50);
  insertPrize.run('Ice cream trip', 30);
  insertPrize.run('30 min extra screen time', 15);
}

function seedCalendar(db) {
  // Calendar sync never runs in demo mode, so this ICS source is only a label
  // for the cached events below (the URL is never fetched).
  const sourceId = db.prepare(
    "INSERT INTO calendar_sources (name, type, url, color, enabled, sort_order) VALUES ('Family Calendar', 'ICS', 'https://demo.invalid/family.ics', '#6e44ff', 1, 0)"
  ).run().lastInsertRowid;

  const insertEvent = db.prepare(
    'INSERT INTO calendar_events_cache (source_id, event_uid, title, start_time, end_time, description, location, all_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const now = new Date();
  const day = (offset) => new Date(now.getTime() + offset * DAY_MS);
  const events = [
    ['demo-soccer', 'Soccer practice', atHour(day(0), 17), atHour(day(0), 18, 30), 'Bring water bottle', 'City fields', 0],
    ['demo-pizza', 'Pizza night', atHour(day(1), 18), atHour(day(1), 19, 30), '', 'Home', 0],
    ['demo-dentist', 'Dentist — Liam', atHour(day(2), 9, 30), atHour(day(2), 10, 15), '', 'Main St Dental', 0],
    ['demo-grandma', 'Visit Grandma', atHour(day(3), 12), atHour(day(4), 15), 'Overnight trip', '', 1],
    ['demo-recital', 'Piano recital', atHour(day(5), 15), atHour(day(5), 16), '', 'Community hall', 0],
    ['demo-library', 'Library books due', atHour(day(6), 9), atHour(day(6), 9, 30), '', '', 1],
  ];
  for (const [uid, title, start, end, description, location, allDay] of events) {
    insertEvent.run(sourceId, uid, title, start.toISOString(), end.toISOString(), description, location, allDay);
  }
}

function resetDemoData(db) {
  const wipeAndSeed = db.transaction(() => {
    wipeDomainTables(db);
    seedUsersAndChores(db);
    seedCalendar(db);
  });
  wipeAndSeed();
  console.log('Demo data seeded');
}

module.exports = { resetDemoData };
