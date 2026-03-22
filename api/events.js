const express = require('express');
const router = express.Router();
const { supabase } = require('../core/supabase');

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// POST /api/events — Create event
router.post('/events', async (req, res) => {
  try {
    const { name, type, description, location_name, location_lat, location_lng,
            location_radius_m, starts_at, ends_at, timezone, vendor_fee_cents,
            currency, allow_photos, require_payment } = req.body;

    if (!name || !type || !starts_at || !ends_at) {
      return res.status(400).json({ error: 'name, type, starts_at, and ends_at are required' });
    }

    const join_code = req.body.join_code || generateJoinCode();

    const { data, error } = await supabase.from('events').insert({
      name, type, description, location_name, location_lat, location_lng,
      location_radius_m, starts_at, ends_at, timezone: timezone || 'America/Los_Angeles',
      join_code, vendor_fee_cents: vendor_fee_cents || 999,
      currency: currency || 'USD', allow_photos: allow_photos !== false,
      require_payment: require_payment !== false, status: 'active'
    }).select().single();

    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/discover — List events (with optional status filter)
router.get('/discover', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase.from('events').select('*');
    if (status) query = query.eq('status', status);
    query = query.order('starts_at', { ascending: true });

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    // Include stats for each event
    const enriched = await Promise.all((data || []).map(async (event) => {
      const [vendors, items] = await Promise.all([
        supabase.from('vendors').select('id', { count: 'exact', head: true }).eq('event_id', event.id),
        supabase.from('items').select('id', { count: 'exact', head: true }).eq('event_id', event.id).eq('status', 'listed')
      ]);
      return { ...event, vendor_count: vendors.count || 0, listed_count: items.count || 0 };
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/:joinCode — Get event by join code
router.get('/events/:joinCode', async (req, res) => {
  try {
    const { data, error } = await supabase.from('events')
      .select('*')
      .eq('join_code', req.params.joinCode)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Event not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/events/:id — Update event
router.put('/events/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('events')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events/:id/stats — Event stats
router.get('/events/:id/stats', async (req, res) => {
  try {
    const eventId = req.params.id;

    const [vendors, items, listedItems] = await Promise.all([
      supabase.from('vendors').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
      supabase.from('items').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
      supabase.from('items').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('status', 'listed')
    ]);

    res.json({
      vendor_count: vendors.count || 0,
      item_count: items.count || 0,
      listed_count: listedItems.count || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
