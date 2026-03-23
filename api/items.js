const express = require('express');
const router = express.Router();
const multer = require('multer');
const { supabase } = require('../core/supabase');
const { uploadPhoto, generateThumbnail } = require('../core/storage');
const { analyzeImage } = require('../core/anthropic');
const productPrompt = require('../core/prompts/product');
const foodPrompt = require('../core/prompts/food');
const menuboardPrompt = require('../core/prompts/menuboard');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function getPrompt(type) {
  if (type === 'food') return foodPrompt;
  return productPrompt;
}

function buildSearchText(ai) {
  const fields = [ai.title, ai.description, ai.category, ai.brand, ai.notable_features, ai.condition];
  if (ai.keywords) fields.push(...ai.keywords);
  if (ai.dietary_info) fields.push(...ai.dietary_info);
  return fields.filter(Boolean).join(' ');
}

// POST /api/items — Create item with photo + AI analysis
router.post('/items', upload.single('photo'), async (req, res) => {
  try {
    const { event_id, vendor_id, session_token, type } = req.body;

    if (!req.file) return res.status(400).json({ error: 'photo is required' });
    if (!event_id || !vendor_id || !session_token) {
      return res.status(400).json({ error: 'event_id, vendor_id, and session_token are required' });
    }

    // Verify vendor session
    const { data: vendor } = await supabase.from('vendors')
      .select('session_token')
      .eq('id', vendor_id)
      .single();

    if (!vendor || vendor.session_token !== session_token) {
      return res.status(403).json({ error: 'Invalid vendor session' });
    }

    // Upload photo + thumbnail
    const [photo_url, thumbnail_url] = await Promise.all([
      uploadPhoto(req.file.buffer, req.file.originalname),
      generateThumbnail(req.file.buffer)
    ]);

    // AI analysis
    const base64 = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype || 'image/jpeg';
    const itemType = type || 'product';
    const ai_description = await analyzeImage(base64, mediaType, getPrompt(itemType));

    const search_text = buildSearchText(ai_description);

    // Detect type mismatch: vendor chose product but AI sees food
    const foodIndicators = ['appetizer', 'entree', 'dessert', 'drink', 'snack', 'side',
      'dish', 'recipe', 'cuisine', 'cooked', 'fried', 'grilled', 'baked', 'roasted'];
    const aiText = JSON.stringify(ai_description).toLowerCase();
    const type_mismatch = itemType === 'product' && foodIndicators.some(w => aiText.includes(w));

    const { data, error } = await supabase.from('items').insert({
      event_id, vendor_id, type: itemType,
      photo_url, thumbnail_url, ai_description,
      title: ai_description.title || null,
      description: ai_description.description || null,
      category: ai_description.category || null,
      condition: ai_description.condition || null,
      search_text, status: 'draft', type_mismatch
    }).select().single();

    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/items — Browse items
router.get('/items', async (req, res) => {
  try {
    const { event_id, status, q, category, min_price, max_price, sort, vendor_id, type,
            tcg_game, tcg_rarity, tcg_condition, below_market, grading_company,
            tcg_set_name, tcg_language, tcg_variant, tcg_is_foil, tcg_card_type } = req.query;

    let query = supabase.from('items').select('*, vendors(display_name, booth_location, logo_url)');

    if (event_id) query = query.eq('event_id', event_id);
    if (vendor_id) query = query.eq('vendor_id', vendor_id);
    if (type) query = query.eq('type', type);
    if (status) query = query.eq('status', status);
    else query = query.in('status', ['listed', 'sold']);
    if (category) query = query.eq('category', category);
    if (min_price) query = query.gte('price_cents', parseInt(min_price));
    if (max_price) query = query.lte('price_cents', parseInt(max_price));
    if (q) query = query.textSearch('search_text', q, { type: 'websearch' });
    // TCG filters
    if (tcg_game) query = query.eq('tcg_game', tcg_game);
    if (tcg_rarity) {
      const rarities = tcg_rarity.split(',').map(r => r.trim()).filter(Boolean);
      if (rarities.length === 1) query = query.eq('tcg_rarity', rarities[0]);
      else if (rarities.length > 1) query = query.in('tcg_rarity', rarities);
    }
    if (tcg_condition) {
      const conditions = tcg_condition.split(',').map(c => c.trim()).filter(Boolean);
      if (conditions.length === 1) query = query.eq('tcg_condition', conditions[0]);
      else if (conditions.length > 1) query = query.in('tcg_condition', conditions);
    }
    if (grading_company && grading_company !== 'ungraded') {
      query = query.ilike('tcg_condition', grading_company + '%');
    }
    // Set name filter
    if (tcg_set_name) {
      const sets = tcg_set_name.split(',').map(s => s.trim()).filter(Boolean);
      if (sets.length === 1) query = query.eq('tcg_set_name', sets[0]);
      else if (sets.length > 1) query = query.in('tcg_set_name', sets);
    }
    // Language filter
    if (tcg_language) {
      const langs = tcg_language.split(',').map(l => l.trim()).filter(Boolean);
      if (langs.length === 1) query = query.eq('tcg_language', langs[0]);
      else if (langs.length > 1) query = query.in('tcg_language', langs);
    }
    // Variant filter
    if (tcg_variant) {
      const variants = tcg_variant.split(',').map(v => v.trim()).filter(Boolean);
      if (variants.length === 1) query = query.eq('tcg_variant', variants[0]);
      else if (variants.length > 1) query = query.in('tcg_variant', variants);
    }
    // Foil filter
    if (tcg_is_foil === 'true') query = query.eq('tcg_is_foil', true);
    else if (tcg_is_foil === 'false') query = query.eq('tcg_is_foil', false);
    // below_market + ungraded + card_type filtering done in post-processing below
    // Exclude items without any image (photo or TCG image)
    query = query.or('photo_url.neq.,tcg_image_url.neq.');

    if (sort === 'price_asc') query = query.order('price_cents', { ascending: true });
    else if (sort === 'price_desc') query = query.order('price_cents', { ascending: false });
    else if (sort === 'market_value') query = query.order('tcg_market_price_cents', { ascending: false, nullsFirst: false });
    else query = query.order('listed_at', { ascending: false, nullsFirst: false });

    let { data, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    // Below market filter: compare price_cents < tcg_market_price_cents
    if (below_market === 'true' && data) {
      data = data.filter(i => i.tcg_market_price_cents && i.price_cents < i.tcg_market_price_cents);
    }
    if (grading_company === 'ungraded' && data) {
      data = data.filter(i => !i.tcg_condition || !/^(PSA|CGC|BGS)\s/i.test(i.tcg_condition));
    }
    // Card type post-processing (from ai_description or category)
    if (tcg_card_type && data) {
      const types = tcg_card_type.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
      data = data.filter(i => {
        const cat = (i.category || '').toLowerCase();
        const desc = i.ai_description ? JSON.stringify(i.ai_description).toLowerCase() : '';
        return types.some(t => cat.includes(t) || desc.includes(t));
      });
    }
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/items/:id — Update item
router.put('/items/:id', async (req, res) => {
  try {
    const session = req.body.session_token || req.query.session;

    // Verify ownership
    const { data: item } = await supabase.from('items').select('vendor_id').eq('id', req.params.id).single();
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (session) {
      const { data: vendor } = await supabase.from('vendors')
        .select('session_token')
        .eq('id', item.vendor_id)
        .single();
      if (!vendor || vendor.session_token !== session) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    const { title, description, category, condition, price_cents, price_note, vendor_notes, status,
            optional_proteins, spice_options, type: newType, type_mismatch } = req.body;
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (category !== undefined) updates.category = category;
    if (condition !== undefined) updates.condition = condition;
    if (price_cents !== undefined) updates.price_cents = price_cents;
    if (price_note !== undefined) updates.price_note = price_note;
    if (vendor_notes !== undefined) updates.vendor_notes = vendor_notes;
    if (optional_proteins !== undefined) updates.optional_proteins = optional_proteins;
    if (newType !== undefined) updates.type = newType;
    if (type_mismatch !== undefined) updates.type_mismatch = type_mismatch;
    if (spice_options !== undefined) updates.spice_options = spice_options;
    if (status !== undefined) {
      updates.status = status;
      if (status === 'listed') updates.listed_at = new Date().toISOString();
      if (status === 'sold') updates.sold_at = new Date().toISOString();
    }

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

// PUT /api/items/:id/list — Mark as listed
router.put('/items/:id/list', async (req, res) => {
  try {
    const { data, error } = await supabase.from('items')
      .update({ status: 'listed', listed_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/items/:id/sold — Mark as sold
router.put('/items/:id/sold', async (req, res) => {
  try {
    const { data, error } = await supabase.from('items')
      .update({ status: 'sold', sold_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/items/:id/view — Increment view count
router.put('/items/:id/view', async (req, res) => {
  try {
    const { data: item } = await supabase.from('items')
      .select('view_count')
      .eq('id', req.params.id)
      .single();

    if (!item) return res.status(404).json({ error: 'Item not found' });

    const { data, error } = await supabase.from('items')
      .update({ view_count: (item.view_count || 0) + 1 })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/items/:id/save — Increment save count
router.put('/items/:id/save', async (req, res) => {
  try {
    const { data: item } = await supabase.from('items')
      .select('save_count')
      .eq('id', req.params.id)
      .single();

    if (!item) return res.status(404).json({ error: 'Item not found' });

    const { data, error } = await supabase.from('items')
      .update({ save_count: (item.save_count || 0) + 1 })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/items/:id — Remove item
router.delete('/items/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('items')
      .update({ status: 'removed' })
      .eq('id', req.params.id);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/items/card/:tcg_card_id — All vendor listings for a specific card
router.get('/items/card/:tcg_card_id', async (req, res) => {
  try {
    const baseId = req.params.tcg_card_id.replace(/-graded$/, '');
    const { data, error } = await supabase.from('items')
      .select('*, vendors(display_name, booth_location, logo_url)')
      .or('tcg_card_id.eq.' + baseId + ',tcg_card_id.eq.' + baseId + '-graded')
      .in('status', ['listed', 'sold'])
      .order('price_cents', { ascending: true });

    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/items/analyze-menuboard — Extract prices from menu board photo
router.post('/items/analyze-menuboard', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'photo required' });

    const base64 = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype || 'image/jpeg';
    const result = await analyzeImage(base64, mediaType, menuboardPrompt);

    // result should be an array of {name, price_cents}
    res.json({ items: Array.isArray(result) ? result : [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/items/:id — Single item detail
router.get('/items/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('items')
      .select('*, vendors(display_name, booth_location, logo_url)')
      .eq('id', req.params.id)
      .single();

    if (error) return res.status(404).json({ error: 'Item not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
