const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const router = express.Router();
const db = new sqlite3.Database('./tasks.db');

// Get all users
router.get('/users', (req, res) => {
  db.all('SELECT id, username, email, profile_picture FROM users', [], (err, rows) => {
    if (err) {
      console.error('Error fetching users:', err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Create a new user with profile picture
router.post('/users', (req, res) => {
  const { username, email, profile_picture } = req.body;
  if (!username || !email) {
    return res.status(400).json({ error: 'Username and email are required' });
  }
  db.run(
    'INSERT INTO users (username, email, profile_picture) VALUES (?, ?, ?)',
    [username, email, profile_picture || null],
    function (err) {
      if (err) {
        console.error('Error creating user:', err.message);
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID });
    }
  );
});

module.exports = router;