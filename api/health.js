const express = require('express');
const router = express.Router();
const { supabase } = require('../core/supabase');

router.get('/health', async (req, res) => {
  try {
    const { error } = await supabase.from('events').select('id').limit(1);
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: error ? 'error' : 'connected',
      version: '1.0.0'
    });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'disconnected', error: err.message });
  }
});

module.exports = router;
