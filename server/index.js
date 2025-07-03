// File: server/index.js
const fastify = require('fastify')({ logger: true });
const Database = require('better-sqlite3');
const ical = require('ical-generator');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

// Initialize Fastify with CORS
fastify.register(require('@fastify/cors'));

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
// CHANGE: Store tasks.db inside a 'data' subdirectory within /app
const dbPath = path.resolve(__dirname, 'data', 'tasks.db');
async function initializeDatabase() {
  try {
    // Ensure the 'data' directory exists and is writable
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    await fs.chmod(path.dirname(dbPath), 0o777); // Ensure directory is writable
    const db = new Database(dbPath, { verbose: console.log });
    db.exec(`
      CREATE TABLE IF NOT EXISTS chores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT,
        description TEXT,
        time_period TEXT,
        assigned_day_of_week TEXT,
        repeats TEXT,
        completed BOOLEAN
      );
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,\
        username TEXT,
        email TEXT,
        profile_picture TEXT,
        clam_total INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        summary TEXT,
        start TEXT,
        end TEXT,
        description TEXT
      );
    `);
    return db;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

// Chore routes
fastify.get('/api/chores', async (request, reply) => {
  try {
    const db = await initializeDatabase();
    const rows = db.prepare('SELECT * FROM chores').all();
    db.close();
    return rows;
  } catch (error) {
    console.error('Error fetching chores:', error);
    reply.status(500).send({ error: 'Failed to fetch chores' });
  }
});

fastify.post('/api/chores', async (request, reply) => {
  const { user_id, title, description, time_period, assigned_day_of_week, repeats, completed } = request.body;
  try {
    const db = await initializeDatabase();
    // Explicitly convert boolean to integer for SQLite
    const completedInt = completed ? 1 : 0; // Convert true/false to 1/0

    const stmt = db.prepare('INSERT INTO chores (user_id, title, description, time_period, assigned_day_of_week, repeats, completed) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const info = stmt.run(user_id, title, description, time_period, assigned_day_of_week, repeats, completedInt); // Use completedInt
    db.close();
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
    const db = await initializeDatabase();
    // Explicitly convert boolean to integer for SQLite
    const completedInt = completed ? 1 : 0; // Convert true/false to 1/0
    const stmt = db.prepare('UPDATE chores SET completed = ? WHERE id = ?');
    stmt.run(completedInt, id); // Use completedInt
    db.close();
    return { success: true };
  } catch (error) {
    console.error('Error updating chore:', error);
    reply.status(500).send({ error: 'Failed to update chore' });
  }
});

// User routes
fastify.get('/api/users', async (request, reply) => {
  try {
    const db = await initializeDatabase();
    const rows = db.prepare('SELECT id, username, email, profile_picture, clam_total FROM users').all();
    db.close();
    return rows;
  } catch (error) {
    console.error('Error fetching users:', error);
    reply.status(500).send({ error: 'Failed to fetch users' });
  }
});

fastify.post('/api/users', async (request, reply) => {
  const { username, email, profile_picture } = request.body;
  try {
    const db = await initializeDatabase();
    const stmt = db.prepare('INSERT INTO users (username, email, profile_picture) VALUES (?, ?, ?)');
    const info = stmt.run(username, email, profile_picture);
    db.close();
    return { id: info.lastInsertRowid };
  } catch (error) {
    console.error('Error adding user:', error);
    reply.status(500).send({ error: 'Failed to add user' });
  }
});

// Calendar routes
fastify.get('/api/calendar', async (request, reply) => {
  try {
    const db = await initializeDatabase();
    const rows = db.prepare('SELECT * FROM events').all();
    db.close();
    return rows;
  } catch (error) {
    console.error('Error fetching events:', error);
    reply.status(500).send({ error: 'Failed to fetch events' });
  }
});

fastify.post('/api/calendar', async (request, reply) => {
  const { user_id, summary, start, end, description } = request.body;
  try {
    const db = await initializeDatabase();
    const stmt = db.prepare('INSERT INTO events (user_id, summary, start, end, description) VALUES (?, ?, ?, ?, ?)');
    const info = stmt.run(user_id, summary, start, end, description);
    db.close();
    return { id: info.lastInsertRowid };
  } catch (error) {
    console.error('Error adding event:', error);
    reply.status(500).send({ error: 'Failed to add event' });
  }
});

fastify.get('/api/calendar/ics', async (request, reply) => {
  try {
    const db = await initializeDatabase();
    const rows = db.prepare('SELECT * FROM events').all();
    db.close();
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

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: process.env.PORT || 5000, host: '0.0.0.0' });
    console.log(`Server running on port ${process.env.PORT || 5000}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};
start();
