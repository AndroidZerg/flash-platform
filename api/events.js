const express = require('express');
const router = express.Router();
const { supabase } = require('../core/supabase');

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// POST /api/events — Create event (status: pending, requires approval)
router.post('/events', async (req, res) => {
  try {
    const { name, type, description, location_name, location_lat, location_lng,
            location_radius_m, starts_at, ends_at, timezone, vendor_fee_cents,
            currency, allow_photos, require_payment, cover_image_url } = req.body;

    if (!name || !type || !starts_at || !ends_at) {
      return res.status(400).json({ error: 'name, type, starts_at, and ends_at are required' });
    }

    // Duplicate check: same name + overlapping date range
    const { data: existing } = await supabase.from('events')
      .select('id, name')
      .ilike('name', name)
      .lt('starts_at', ends_at)
      .gt('ends_at', starts_at);

    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'An event with this name already exists for that date.' });
    }

    const join_code = req.body.join_code || generateJoinCode();

    const { data, error } = await supabase.from('events').insert({
      name, type, description, location_name, location_lat, location_lng,
      location_radius_m, starts_at, ends_at, timezone: timezone || 'America/Los_Angeles',
      join_code, vendor_fee_cents: vendor_fee_cents || 999,
      currency: currency || 'USD', allow_photos: allow_photos !== false,
      require_payment: require_payment !== false, status: 'pending',
      cover_image_url: cover_image_url || null
    }).select().single();

    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/discover — List active events (with optional status filter)
router.get('/discover', async (req, res) => {
  try {
    const { status } = req.query;
    let query = supabase.from('events').select('*');
    // Default to active only
    query = query.eq('status', status || 'active');
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

// GET /api/events/by-id/:id — Get event by UUID
router.get('/events/by-id/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('events')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Event not found' });

    // Include stats
    const [vendors, items] = await Promise.all([
      supabase.from('vendors').select('id', { count: 'exact', head: true }).eq('event_id', data.id),
      supabase.from('items').select('id', { count: 'exact', head: true }).eq('event_id', data.id).eq('status', 'listed')
    ]);

    res.json({ ...data, vendor_count: vendors.count || 0, listed_count: items.count || 0 });
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

// PUT /api/events/:id/approve — Admin: approve event (set active)
router.put('/events/:id/approve', async (req, res) => {
  try {
    const adminSecret = req.headers['x-admin-secret'] || req.query.admin_secret;
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ error: 'Invalid admin secret' });
    }

    const { data, error } = await supabase.from('events')
      .update({ status: 'active', updated_at: new Date().toISOString() })
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
