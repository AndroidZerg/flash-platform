const express = require('express');
const router = express.Router();
const { supabase } = require('../core/supabase');

// Admin authentication middleware
function adminAuth(req, res, next) {
  const adminSecret = req.headers['x-admin-secret'] || req.query.admin_secret;
  if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Invalid admin secret' });
  }
  next();
}

// ─── Events ──────────────────────────────────────────────────────────

// GET /api/admin/events — List all events (any status)
router.get('/admin/events', adminAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('events')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/events/:id — Update event
router.put('/admin/events/:id', adminAuth, async (req, res) => {
  try {
    const { name, status, description, location_name, starts_at, ends_at,
            cover_image_url, vendor_fee_cents } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (status !== undefined) updates.status = status;
    if (description !== undefined) updates.description = description;
    if (location_name !== undefined) updates.location_name = location_name;
    if (starts_at !== undefined) updates.starts_at = starts_at;
    if (ends_at !== undefined) updates.ends_at = ends_at;
    if (cover_image_url !== undefined) updates.cover_image_url = cover_image_url;
    if (vendor_fee_cents !== undefined) updates.vendor_fee_cents = vendor_fee_cents;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from('events')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/events/:id — Hard delete event
router.delete('/admin/events/:id', adminAuth, async (req, res) => {
  try {
    const { error } = await supabase.from('events')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Items ───────────────────────────────────────────────────────────

// GET /api/admin/items — List items with optional filters
router.get('/admin/items', adminAuth, async (req, res) => {
  try {
    const { event_id, vendor_id, status } = req.query;

    let query = supabase.from('items')
      .select('*, vendors(display_name)');

    if (event_id) query = query.eq('event_id', event_id);
    if (vendor_id) query = query.eq('vendor_id', vendor_id);
    if (status) query = query.eq('status', status);

    query = query.order('created_at', { ascending: false }).limit(100);

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/items/:id — Update item
router.put('/admin/items/:id', adminAuth, async (req, res) => {
  try {
    const { title, description, price_cents, status, category, condition } = req.body;

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (price_cents !== undefined) updates.price_cents = price_cents;
    if (status !== undefined) {
      updates.status = status;
      if (status === 'listed') updates.listed_at = new Date().toISOString();
      if (status === 'sold') updates.sold_at = new Date().toISOString();
    }
    if (category !== undefined) updates.category = category;
    if (condition !== undefined) updates.condition = condition;

    const { data, error } = await supabase.from('items')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/items/:id — Hard delete item
router.delete('/admin/items/:id', adminAuth, async (req, res) => {
  try {
    const { error } = await supabase.from('items')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Vendors ─────────────────────────────────────────────────────────

// GET /api/admin/vendors — List all vendors with optional event filter
router.get('/admin/vendors', adminAuth, async (req, res) => {
  try {
    const { event_id } = req.query;

    let query = supabase.from('vendors')
      .select('*');

    if (event_id) query = query.eq('event_id', event_id);

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/vendors/:id — Update vendor
router.put('/admin/vendors/:id', adminAuth, async (req, res) => {
  try {
    const { display_name, booth_location, status, is_live } = req.body;

    const updates = {};
    if (display_name !== undefined) updates.display_name = display_name;
    if (booth_location !== undefined) updates.booth_location = booth_location;
    if (status !== undefined) updates.status = status;
    if (is_live !== undefined) updates.is_live = is_live;

    const { data, error } = await supabase.from('vendors')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/vendors/:id — Hard delete vendor
router.delete('/admin/vendors/:id', adminAuth, async (req, res) => {
  try {
    const { error } = await supabase.from('vendors')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Stats ───────────────────────────────────────────────────────────

// GET /api/admin/stats — Platform-wide counts
router.get('/admin/stats', adminAuth, async (req, res) => {
  try {
    const [totalEvents, activeEvents, totalVendors, totalItems, listedItems] = await Promise.all([
      supabase.from('events').select('id', { count: 'exact', head: true }),
      supabase.from('events').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('vendors').select('id', { count: 'exact', head: true }),
      supabase.from('items').select('id', { count: 'exact', head: true }),
      supabase.from('items').select('id', { count: 'exact', head: true }).eq('status', 'listed')
    ]);

    res.json({
      total_events: totalEvents.count || 0,
      active_events: activeEvents.count || 0,
      total_vendors: totalVendors.count || 0,
      total_items: totalItems.count || 0,
      listed_items: listedItems.count || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
