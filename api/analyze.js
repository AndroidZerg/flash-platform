const express = require('express');
const router = express.Router();
const { analyzeImage } = require('../core/anthropic');
const personPrompt = require('../core/prompts/person');

// POST /api/analyze — Direct AI analysis (FlashSafe)
router.post('/analyze', async (req, res) => {
  try {
    const { image, type } = req.body;
    if (!image) return res.status(400).json({ error: 'base64 image required' });

    const profileType = type || 'adult';
    const prompt = personPrompt(profileType);

    // Strip data URL prefix if present
    const base64 = image.replace(/^data:image\/\w+;base64,/, '');
    const mediaType = image.startsWith('data:image/png') ? 'image/png'
                    : image.startsWith('data:image/webp') ? 'image/webp'
                    : 'image/jpeg';

    const result = await analyzeImage(base64, mediaType, prompt);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
