const express = require('express');
const router = express.Router();
const multer = require('multer');
const { supabase } = require('../core/supabase');
const { uploadPhoto, generateThumbnail } = require('../core/storage');
const { analyzeImage } = require('../core/anthropic');
const personPrompt = require('../core/prompts/person');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// POST /api/safe/profiles — Create profile
router.post('/profiles', async (req, res) => {
  try {
    const { owner_session, type, name, date_of_birth, height, ethnicity,
            eye_color, guardian_name, guardian_phone } = req.body;

    console.log('[FlashSafe] Profile create request body:', JSON.stringify(req.body));

    if (!owner_session || !type || !name) {
      return res.status(400).json({ error: 'owner_session, type, and name required' });
    }

    // Build insert object, only include non-empty fields
    const insert = { owner_session, type: type.toLowerCase(), name };
    if (date_of_birth) insert.date_of_birth = date_of_birth;
    if (height) insert.height = height;
    if (ethnicity) insert.ethnicity = ethnicity;
    if (eye_color) insert.eye_color = eye_color;
    if (guardian_name) insert.guardian_name = guardian_name;
    if (guardian_phone) insert.guardian_phone = guardian_phone;

    const { data, error } = await supabase.from('profiles')
      .insert(insert).select().single();

    if (error) {
      console.error('Profile create error:', error);
      return res.status(400).json({ error: error.message, details: error.details, hint: error.hint });
    }
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/safe/profiles — List profiles by owner
router.get('/profiles', async (req, res) => {
  try {
    const owner = req.query.owner;
    if (!owner) return res.status(400).json({ error: 'owner query param required' });

    const { data, error } = await supabase.from('profiles')
      .select('*')
      .eq('owner_session', owner)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/safe/profiles/:id — Update profile
router.put('/profiles/:id', async (req, res) => {
  try {
    const { name, date_of_birth, height, ethnicity, eye_color,
            guardian_name, guardian_phone } = req.body;

    const { data, error } = await supabase.from('profiles')
      .update({ name, date_of_birth, height, ethnicity, eye_color,
                guardian_name, guardian_phone })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/safe/profiles/:id — Delete profile + snaps
router.delete('/profiles/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('profiles').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/safe/snaps — Create snap with photo + AI
router.post('/snaps', upload.single('photo'), async (req, res) => {
  try {
    const { profile_id } = req.body;
    if (!req.file || !profile_id) {
      return res.status(400).json({ error: 'photo and profile_id required' });
    }

    // Get profile type
    const { data: profile } = await supabase.from('profiles')
      .select('type')
      .eq('id', profile_id)
      .single();

    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    // Upload photo
    const photo_url = await uploadPhoto(req.file.buffer, req.file.originalname);

    // AI analysis
    const base64 = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype || 'image/jpeg';
    const ai_description = await analyzeImage(base64, mediaType, personPrompt(profile.type));

    const { data, error } = await supabase.from('snaps').insert({
      profile_id, photo_url, ai_description
    }).select().single();

    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/safe/snaps — Get snaps for profile
router.get('/snaps', async (req, res) => {
  try {
    const { profile_id } = req.query;
    if (!profile_id) return res.status(400).json({ error: 'profile_id required' });

    const { data, error } = await supabase.from('snaps')
      .select('*')
      .eq('profile_id', profile_id)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
