const express = require('express');
const router = express.Router();
const multer = require('multer');
const { supabase } = require('../core/supabase');
const { uploadPhoto } = require('../core/storage');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// POST /api/vendors — Join event as vendor
router.post('/vendors', async (req, res) => {
  try {
    const { event_id, display_name, booth_location, contact_name, contact_phone,
            contact_email, vendor_type, vendor_email } = req.body;

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
      contact_name, contact_phone, contact_email,
      vendor_email: vendor_email || contact_email || null,
      type: vendor_type || 'product'
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

// GET /api/vendors/lookup — Find previous vendor by email
router.get('/vendors/lookup', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'email required' });

    const { data: vendors } = await supabase.from('vendors')
      .select('*, items(id, title, photo_url, thumbnail_url, ai_description, category, price_cents, type)')
      .eq('vendor_email', email)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!vendors || vendors.length === 0) {
      return res.json({ found: false, vendors: [] });
    }

    res.json({ found: true, vendors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vendors/:id/import-items — Import items from a previous vendor
router.post('/vendors/:id/import-items', async (req, res) => {
  try {
    const session = req.query.session;
    if (!session) return res.status(401).json({ error: 'session token required' });

    const { data: vendor } = await supabase.from('vendors')
      .select('session_token, event_id, type')
      .eq('id', req.params.id)
      .single();

    if (!vendor || vendor.session_token !== session) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { source_vendor_id } = req.body;
    if (!source_vendor_id) return res.status(400).json({ error: 'source_vendor_id required' });

    // Get items from source vendor
    const { data: sourceItems } = await supabase.from('items')
      .select('*')
      .eq('vendor_id', source_vendor_id)
      .in('status', ['listed', 'sold', 'draft']);

    if (!sourceItems || sourceItems.length === 0) {
      return res.json({ imported: 0 });
    }

    // Copy items as drafts for current vendor/event
    const newItems = sourceItems.map(item => ({
      event_id: vendor.event_id,
      vendor_id: req.params.id,
      type: item.type,
      photo_url: item.photo_url,
      thumbnail_url: item.thumbnail_url,
      ai_description: item.ai_description,
      title: item.title,
      description: item.description,
      category: item.category,
      condition: item.condition,
      price_cents: item.price_cents,
      price_note: item.price_note,
      search_text: item.search_text,
      optional_proteins: item.optional_proteins,
      spice_options: item.spice_options,
      status: 'draft'
    }));

    const { data, error } = await supabase.from('items').insert(newItems).select();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ imported: data.length, items: data });
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

    const { display_name, booth_location, contact_name, contact_phone, contact_email, vendor_email } = req.body;
    const updates = {};
    if (display_name !== undefined) updates.display_name = display_name;
    if (booth_location !== undefined) updates.booth_location = booth_location;
    if (contact_name !== undefined) updates.contact_name = contact_name;
    if (contact_phone !== undefined) updates.contact_phone = contact_phone;
    if (contact_email !== undefined) updates.contact_email = contact_email;
    if (vendor_email !== undefined) updates.vendor_email = vendor_email;

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
