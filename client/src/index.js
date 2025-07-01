const express = require('express');
const cors = require('cors');
const sqlite3 = require('3').verbose();
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// SQLite database setup
const db = new sqlite3.Database('./tasks.db', (err) => {
  if (err) {
    console.error('Error connecting to SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
  }
});

// Create tables for tasks and users
db.run(
  `CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT,
    description TEXT,
    completed BOOLEAN
  )`,
  (err) => {
    if (err) console.error('Error creating tasks table:', err.message);
  }
);

db.run(
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT,
    profile_picture TEXT
  )`,
  (err) => {
    if (err) console.error('Error creating users table:', err.message);
  }
);

// Routes
app.get('/api/tasks', (req, res) => {
  db.all('SELECT * FROM tasks', [], (err, rows) => {
    if (err) {
      console.error('Error fetching tasks:', err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Route imports
const calendarRoutes = require('./routes/calendar');
const photoRoutes = require('./routes/photos');
const choreRoutes = require('./routes/chores');
const userRoutes = require('./routes/users');

app.use('/api', calendarRoutes);
app.use('/api', photoRoutes);
app.use('/api', choreRoutes);
app.use('/api', userRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Close database on process termination
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) console.error('Error closing database:', err.message);
    console.log('Database connection closed.');
    process.exit(0);
  });
});