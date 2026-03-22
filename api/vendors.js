const express = require('express');
const router = express.Router();
const multer = require('multer');
const { supabase } = require('../core/supabase');
const { uploadPhoto } = require('../core/storage');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// POST /api/vendors — Join event as vendor
router.post('/vendors', async (req, res) => {
  try {
    const { event_id, display_name, booth_location, contact_name, contact_phone, contact_email } = req.body;

    if (!event_id || !display_name) {
      return res.status(400).json({ error: 'event_id and display_name are required' });
    }

    // Verify event exists and is active
    const { data: event } = await supabase.from('events')
      .select('id, status')
      .eq('id', event_id)
      .single();

    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.status !== 'active') return res.status(400).json({ error: 'Event is not active' });

    const { data, error } = await supabase.from('vendors').insert({
      event_id, display_name, booth_location,
      contact_name, contact_phone, contact_email
    }).select().single();

    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vendors/me — Get vendor by session token
router.get('/vendors/me', async (req, res) => {
  try {
    const session = req.query.session;
    if (!session) return res.status(401).json({ error: 'session token required' });

    const { data: vendor, error } = await supabase.from('vendors')
      .select('*')
      .eq('session_token', session)
      .single();

    if (error || !vendor) return res.status(404).json({ error: 'Vendor not found' });

    // Include vendor's items
    const { data: items } = await supabase.from('items')
      .select('*')
      .eq('vendor_id', vendor.id)
      .order('created_at', { ascending: false });

    res.json({ ...vendor, items: items || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/vendors/:id — Update vendor
router.put('/vendors/:id', async (req, res) => {
  try {
    const session = req.query.session;
    if (!session) return res.status(401).json({ error: 'session token required' });

    // Verify ownership
    const { data: existing } = await supabase.from('vendors')
      .select('session_token')
      .eq('id', req.params.id)
      .single();

    if (!existing || existing.session_token !== session) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { display_name, booth_location, contact_name, contact_phone, contact_email } = req.body;
    const { data, error } = await supabase.from('vendors')
      .update({ display_name, booth_location, contact_name, contact_phone, contact_email })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vendors/:id/logo — Upload vendor logo
router.post('/vendors/:id/logo', upload.single('logo'), async (req, res) => {
  try {
    const session = req.query.session;
    if (!session) return res.status(401).json({ error: 'session token required' });
    if (!req.file) return res.status(400).json({ error: 'logo file required' });

    // Verify ownership
    const { data: existing } = await supabase.from('vendors')
      .select('session_token')
      .eq('id', req.params.id)
      .single();

    if (!existing || existing.session_token !== session) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const logo_url = await uploadPhoto(req.file.buffer, req.file.originalname);

    const { data, error } = await supabase.from('vendors')
      .update({ logo_url })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
