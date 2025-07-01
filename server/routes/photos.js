const express = require('express');
const axios = require('axios');
const router = express.Router();

router.get('/photos', async (req, res) => {
  try {
    const response = await axios.get(`${process.env.IMMICH_URL}/api/assets`, {
      headers: { 'X-Api-Key': process.env.IMMICH_API_KEY },
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;