// File: server/index.js
const fastify = require('fastify')({ logger: true });
const Database = require('better-sqlite3');
const ical = require('ical-generator');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

// NEW: Import axios for HTTP requests and ical.js for parsing
const axios = require('axios');
const ICAL = require('ical.js');

// Initialize Fastify with CORS
fastify.register(require('@fastify/cors'), {
  origin: '*', // Allow all origins for development. Consider restricting in production.
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], // Explicitly allow PATCH
  allowedHeaders: ['Content-Type', 'Authorization'], // Add any other headers your client might send
});

// Add a preHandler hook to log all incoming requests
fastify.addHook('preHandler', (request, reply, done) => {
  console.log(`Incoming request: ${request.method} ${request.url}`);
  done();
});

// Serve static files for uploads
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'uploads'),
  prefix: '/Uploads/',
});

// Initialize database
const dbPath = path.resolve(__dirname, 'data', 'tasks.db');
let db; // Declare db variable outside to hold the single instance

async function initializeDatabase() {
  try {
    // Ensure the 'data' directory exists and is writable
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    await fs.chmod(path.dirname(dbPath), 0o777); // Ensure directory is writable
    const newDb = new Database(dbPath, { verbose: console.log });
    newDb.exec(`
      CREATE TABLE IF NOT EXISTS chores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT,\
        description TEXT,\
        time_period TEXT,\
        assigned_day_of_week TEXT,\
        repeats TEXT,\
        completed BOOLEAN
      );\
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,\
        username TEXT,\
        email TEXT,\
        profile_picture TEXT,\
        clam_total INTEGER DEFAULT 0
      );\
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,\
        user_id INTEGER,\
        summary TEXT,\
        start TEXT,\
        end TEXT,\
        description TEXT
      );\
    `);
    return newDb; // Return the new database instance
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

// Function to prune and reset chores based on the day
async function pruneAndResetChores() {
  try {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = days[new Date().getDay()];

    const completedChores = db.prepare('SELECT id, assigned_day_of_week, repeats FROM chores WHERE completed = 1').all();

    for (const chore of completedChores) {
      if (chore.assigned_day_of_week !== currentDay) {
        if (chore.repeats === "Doesn't repeat") {
          // Delete non-repeating completed chores from past days
          db.prepare('DELETE FROM chores WHERE id = ?').run(chore.id);
          console.log(`Deleted non-repeating chore ID ${chore.id} from a past day.`);
        } else if (chore.repeats === "Weekly on this day" || chore.repeats === "Daily") {
          // Reset repeating completed chores from past days
          db.prepare('UPDATE chores SET completed = 0 WHERE id = ?').run(chore.id);
          console.log(`Reset repeating chore ID ${chore.id} to uncompleted.`);
        }
      }
    }
  } catch (error) {
    console.error('Error during chore pruning and reset:', error);
  }
}


// Chore routes
fastify.get('/api/chores', async (request, reply) => {
  try {
    const rows = db.prepare('SELECT * FROM chores').all(); // Use the global db instance
    return rows;
  } catch (error) {
    console.error('Error fetching chores:', error);
    reply.status(500).send({ error: 'Failed to fetch chores' });
  }
});

fastify.post('/api/chores', async (request, reply) => {
  const { user_id, title, description, time_period, assigned_day_of_week, repeats, completed } = request.body;
  try {
    const completedInt = completed ? 1 : 0;
    const stmt = db.prepare('INSERT INTO chores (user_id, title, description, time_period, assigned_day_of_week, repeats, completed) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const info = stmt.run(user_id, title, description, time_period, assigned_day_of_week, repeats, completedInt);
    return { id: info.lastInsertRowid };
  } catch (error) {
    console.error('Error adding chore:', error);
    reply.status(500).send({ error: 'Failed to add chore' });
  }
});

fastify.patch('/api/chores/:id', async (request, reply) => {
  const { id } = request.params;
  const { completed } = request.body;
  try {
    const completedInt = completed ? 1 : 0;
    const stmt = db.prepare('UPDATE chores SET completed = ? WHERE id = ?');
    stmt.run(completedInt, id);

    // --- Clam Reward Logic ---\
    // Get the chore details to find the user_id and assigned_day_of_week
    const chore = db.prepare('SELECT user_id, assigned_day_of_week FROM chores WHERE id = ?').get(id);

    if (chore) {
      // Get all chores for this user and day
      const usersChoresForDay = db.prepare('SELECT completed FROM chores WHERE user_id = ? AND assigned_day_of_week = ?').all(chore.user_id, chore.assigned_day_of_week);

      // Check if all chores for this user and day are completed
      const allCompleted = usersChoresForDay.every(c => c.completed === 1);

      if (allCompleted) {
        // Reward user with 2 clams
        const userUpdateStmt = db.prepare('UPDATE users SET clam_total = clam_total + 2 WHERE id = ?');
        userUpdateStmt.run(chore.user_id);
        console.log(`User ${chore.user_id} rewarded 2 clams for completing all chores on ${chore.assigned_day_of_week}.`);
      }
    }
    // --- End Clam Reward Logic ---\

    return { success: true };
  } catch (error) {
    console.error('Error updating chore:', error);
    reply.status(500).send({ error: 'Failed to update chore' });
  }
});

// NEW: Endpoint to delete a chore
fastify.delete('/api/chores/:id', async (request, reply) => {
  const { id } = request.params;
  try {
    const stmt = db.prepare('DELETE FROM chores WHERE id = ?');
    const info = stmt.run(id);
    if (info.changes === 0) {
      return reply.status(404).send({ error: 'Chore not found' });
    }
    return { success: true, message: 'Chore deleted successfully' };
  } catch (error) {
    console.error('Error deleting chore:', error);
    reply.status(500).send({ error: 'Failed to delete chore' });
  }
});


// User routes
fastify.get('/api/users', async (request, reply) => {
  try {
    const rows = db.prepare('SELECT id, username, email, profile_picture, clam_total FROM users').all();
    return rows;
  } catch (error) {
    console.error('Error fetching users:', error);
    reply.status(500).send({ error: 'Failed to fetch users' });
  }
});

fastify.post('/api/users', async (request, reply) => {
  const { username, email, profile_picture } = request.body;
  try {
    const stmt = db.prepare('INSERT INTO users (username, email, profile_picture) VALUES (?, ?, ?)');
    const info = stmt.run(username, email, profile_picture);
    return { id: info.lastInsertRowid };
  } catch (error) {
    console.error('Error adding user:', error);
    reply.status(500).send({ error: 'Failed to add user' });
  }
});

// NEW: Endpoint to update user clam total (for manual adjustments or future use)
fastify.patch('/api/users/:id/clams', async (request, reply) => {
  const { id } = request.params;
  const { clam_total } = request.body; // Expecting the new total or a delta
  try {
    const stmt = db.prepare('UPDATE users SET clam_total = ? WHERE id = ?');
    stmt.run(clam_total, id);
    return { success: true };
  } catch (error) {
    console.error('Error updating user clams:', error);
    reply.status(500).send({ error: 'Failed to update user clams' });
  }
});

// NEW: Endpoint to delete a user
fastify.delete('/api/users/:id', async (request, reply) => {
  const { id } = request.params;
  try {
    // Optional: Delete associated chores first if desired, or set user_id to NULL
    // db.prepare('DELETE FROM chores WHERE user_id = ?').run(id);\
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    const info = stmt.run(id);
    if (info.changes === 0) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return { success: true, message: 'User deleted successfully' };
  } catch (error) {
    console.error('Error deleting user:', error);
    reply.status(500).send({ error: 'Failed to delete user' });
  }
});


// Calendar routes (existing)
fastify.get('/api/calendar', async (request, reply) => {
  try {
    const rows = db.prepare('SELECT * FROM events').all();
    return rows;
  }  catch (error) {
    console.error('Error fetching events:', error);
    reply.status(500).send({ error: 'Failed to fetch events' });
  }
});

fastify.post('/api/calendar', async (request, reply) => {
  const { user_id, summary, start, end, description } = request.body;
  try {
    const stmt = db.prepare('INSERT INTO events (user_id, summary, start, end, description) VALUES (?, ?, ?, ?, ?)');
    const info = stmt.run(user_id, summary, start, end, description);
    return { id: info.lastInsertRowid };
  } catch (error) {
    console.error('Error adding event:', error);
    reply.status(500).send({ error: 'Failed to add event' });
  }
});

fastify.get('/api/calendar/ics', async (request, reply) => {
  try {
    const rows = db.prepare('SELECT * FROM events').all();
    const calendar = ical({ name: 'HomeGlow Calendar' });
    rows.forEach((event) => {
      calendar.createEvent({
        start: new Date(event.start),
        end: new Date(event.end),
        summary: event.summary,
        description: event.description,
      });
    });
    reply.header('Content-Type', 'text/calendar');
    return calendar.toString();
  } catch (error) {
    console.error('Error generating iCalendar:', error);
    reply.status(500).send('Failed to generate iCalendar');
  }
});

// NEW: Endpoint to fetch and parse ICS calendar events
fastify.get('/api/calendar-events', async (request, reply) => {
  const icsUrl = process.env.ICS_CALENDAR_URL;

  if (!icsUrl) {
    reply.status(400).send({ error: 'ICS_CALENDAR_URL environment variable is not set.' });
    return;
  }

  try {
    const response = await axios.get(icsUrl);
    const icsData = response.data;

    const jcalData = ICAL.parse(icsData);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');

    const events = vevents.map(vevent => {
      const event = new ICAL.Event(vevent);
      return {
        title: event.summary,
        start: event.startDate.toJSDate(),
        end: event.endDate.toJSDate(),
        description: event.description,
        location: event.location,
        // Add other properties as needed
      };
    });

    return events;
  } catch (error) {
    console.error('Error fetching or parsing ICS calendar:', error);
    reply.status(500).send({ error: 'Failed to fetch or parse ICS calendar events.' });
  }
});


// Start server
const start = async () => {
  try {
    db = await initializeDatabase(); // Initialize db once here
    await pruneAndResetChores(); // Call the pruning/reset function on startup
    await fastify.listen({ port: process.env.PORT || 5000, host: '0.0.0.0' });
    console.log(`Server running on port ${process.env.PORT || 5000}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};
start();
