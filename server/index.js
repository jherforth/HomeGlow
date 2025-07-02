const fastify = require('fastify')({ logger: true });
const Database = require('better-sqlite3');
const cors = require('cors');
const ical = require('ical-generator');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

// Initialize Fastify with CORS
fastify.register(require('@fastify/cors'));

// Serve static files for uploads
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'Uploads'),
  prefix: '/uploads/',
});

// Initialize database
const dbPath = path.resolve(__dirname, 'tasks.db');
async function initializeDatabase() {
  try {
    await fs.access(path.dirname(dbPath));
  } catch (error) {
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath, { verbose: console.log });
  db.exec(`
    CREATE TABLE IF NOT EXISTS chores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT,
      description TEXT,
      completed BOOLEAN
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      email TEXT,
      profile_picture TEXT
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
  const { user_id, title, description, completed } = request.body;
  try {
    const db = await initializeDatabase();
    const stmt = db.prepare('INSERT INTO chores (user_id, title, description, completed) VALUES (?, ?, ?, ?)');
    const info = stmt.run(user_id, title, description, completed);
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
    const stmt = db.prepare('UPDATE chores SET completed = ? WHERE id = ?');
    stmt.run(completed, id);
    db.close();
    return { success: true };
  } catch (error) {
    console.error('Error updating chore:', error);
    reply.status(500).send({ error: 'Failed to update chore' });
  }
});

// User routes
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