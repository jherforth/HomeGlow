const fastify = require('fastify')({ logger: false });
const sqlite3 = require('sqlite3').verbose();
const ical = require('ical-generator');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Register CORS and static file plugins
fastify.register(require('@fastify/cors'));
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'Uploads'),
  prefix: '/uploads/',
});

// Initialize SQLite database
const db = new sqlite3.Database('./tasks.db', (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to SQLite database');
    db.run(`CREATE TABLE IF NOT EXISTS chores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT,
      description TEXT,
      completed BOOLEAN
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      email TEXT,
      profile_picture TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      summary TEXT,
      start TEXT,
      end TEXT,
      description TEXT
    )`);
  }
});

// Parse JSON bodies
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  try {
    const json = JSON.parse(body);
    done(null, json);
  } catch (err) {
    done(err);
  }
});

// Chore routes
fastify.get('/api/chores', async (request, reply) => {
  db.all('SELECT * FROM chores', [], (err, rows) => {
    if (err) {
      reply.status(500).send({ error: 'Failed to fetch chores' });
    } else {
      reply.send(rows);
    }
  });
});

fastify.post('/api/chores', async (request, reply) => {
  const { user_id, title, description, completed } = request.body;
  db.run(
    'INSERT INTO chores (user_id, title, description, completed) VALUES (?, ?, ?, ?)',
    [user_id, title, description, completed],
    function (err) {
      if (err) {
        reply.status(500).send({ error: 'Failed to add chore' });
      } else {
        reply.send({ id: this.lastID });
      }
    }
  );
});

fastify.patch('/api/chores/:id', async (request, reply) => {
  const { id } = request.params;
  const { completed } = request.body;
  db.run(
    'UPDATE chores SET completed = ? WHERE id = ?',
    [completed, id],
    (err) => {
      if (err) {
        reply.status(500).send({ error: 'Failed to update chore' });
      } else {
        reply.send({ success: true });
      }
    }
  );
});

// User routes
fastify.post('/api/users', async (request, reply) => {
  const { username, email, profile_picture } = request.body;
  db.run(
    'INSERT INTO users (username, email, profile_picture) VALUES (?, ?, ?)',
    [username, email, profile_picture],
    function (err) {
      if (err) {
        reply.status(500).send({ error: 'Failed to add user' });
      } else {
        reply.send({ id: this.lastID });
      }
    }
  );
});

// Calendar routes
fastify.get('/api/calendar', async (request, reply) => {
  db.all('SELECT * FROM events', [], (err, rows) => {
    if (err) {
      reply.status(500).send({ error: 'Failed to fetch events' });
    } else {
      reply.send(rows);
    }
  });
});

fastify.post('/api/calendar', async (request, reply) => {
  const { user_id, summary, start, end, description } = request.body;
  db.run(
    'INSERT INTO events (user_id, summary, start, end, description) VALUES (?, ?, ?, ?, ?)',
    [user_id, summary, start, end, description],
    function (err) {
      if (err) {
        reply.status(500).send({ error: 'Failed to add event' });
      } else {
        reply.send({ id: this.lastID });
      }
    }
  );
});

fastify.get('/api/calendar/ics', async (request, reply) => {
  const calendar = ical({ name: 'HomeGlow Calendar' });
  db.all('SELECT * FROM events', [], (err, rows) => {
    if (err) {
      reply.status(500).send('Failed to generate iCalendar');
    } else {
      rows.forEach((event) => {
        calendar.createEvent({
          start: new Date(event.start),
          end: new Date(event.end),
          summary: event.summary,
          description: event.description,
        });
      });
      reply.header('Content-Type', 'text/calendar');
      reply.send(calendar.toString());
    }
  });
});

// Start server
const PORT = process.env.PORT || 5000;
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error('Server error:', err);
    process.exit(1);
  }
  console.log(`Server running on port ${PORT}`);
});