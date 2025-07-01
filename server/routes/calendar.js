const express = require('express');
const { CalDAVClient } = require('node-caldav');
const router = express.Router();

router.get('/calendar', async (req, res) => {
  const client = new CalDAVClient({
    url: process.env.NEXTCLOUD_URL + '/remote.php/dav',
    username: process.env.NEXTCLOUD_USERNAME,
    password: process.env.NEXTCLOUD_PASSWORD,
  });

  try {
    const events = await client.getEvents();
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;