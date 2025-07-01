const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const ical = require('ical-generator');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

// Chore routes
app.get('/api/chores', (req, res) => {
  db.all('SELECT * FROM chores', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: 'Failed to fetch chores' });
    } else {
      res.json(rows);
    }
  });
});

app.post('/api/chores', (req, res) => {
  const { user_id, title, description, completed } = req.body;
  db.run(
    'INSERT INTO chores (user_id, title, description, completed) VALUES (?, ?, ?, ?)',
    [user_id, title, description, completed],
    function (err) {
      if (err) {
        res.status(500).json({ error: 'Failed to add chore' });
      } else {
        res.json({ id: this.lastID });
      }
    }
  );
});

app.patch('/api/chores/:id', (req, res) => {
  const { id } = req.params;
  const { completed } = req.body;
  db.run(
    'UPDATE chores SET completed = ? WHERE id = ?',
    [completed, id],
    (err) => {
      if (err) {
        res.status(500).json({ error: 'Failed to update chore' });
      } else {
        res.json({ success: true });
      }
    }
  );
});

// User routes
app.post('/api/users', (req, res) => {
  const { username, email, profile_picture } = req.body;
  db.run(
    'INSERT INTO users (username, email, profile_picture) VALUES (?, ?, ?)',
    [username, email, profile_picture],
    function (err) {
      if (err) {
        res.status(500).json({ error: 'Failed to add user' });
      } else {
        res.json({ id: this.lastID });
      }
    }
  );
});

// Calendar routes
app.get('/api/calendar', (req, res) => {
  db.all('SELECT * FROM events', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: 'Failed to fetch events' });
    } else {
      res.json(rows);
    }
  });
});

app.post('/api/calendar', (req, res) => {
  const { user_id, summary, start, end, description } = req.body;
  db.run(
    'INSERT INTO events (user_id, summary, start, end, description) VALUES (?, ?, ?, ?, ?)',
    [user_id, summary, start, end, description],
    function (err) {
      if (err) {
        res.status(500).json({ error: 'Failed to add event' });
      } else {
        res.json({ id: this.lastID });
      }
    }
  );
});

app.get('/api/calendar/ics', (req, res) => {
  const calendar = ical({ name: 'HomeGlow Calendar' });
  db.all('SELECT * FROM events', [], (err, rows) => {
    if (err) {
      res.status(500).send('Failed to generate iCalendar');
    } else {
      rows.forEach((event) => {
        calendar.createEvent({
          start: new Date(event.start),
          end: new Date(event.end),
          summary: event.summary,
          description: event.description,
        });
      });
      res.set('Content-Type', 'text/calendar');
      res.send(calendar.toString());
    }
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});