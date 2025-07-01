const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const router = express.Router();
const db = new sqlite3.Database('./tasks.db');

router.get('/chores', (req, res) => {
  db.all('SELECT * FROM tasks WHERE description LIKE "%chore%"', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/chores', (req, res) => {
  const { user_id, title, description } = req.body;
  db.run(
    'INSERT INTO tasks (user_id, title, description, completed) VALUES (?, ?, ?, ?)',
    [user_id, title, description, false],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

module.exports = router;