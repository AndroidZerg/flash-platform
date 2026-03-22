const express = require('express');
const router = express.Router();
const { supabase } = require('../core/supabase');
const { stripe } = require('../core/stripe');

// POST /api/checkout — Create Stripe Checkout Session
router.post('/checkout', async (req, res) => {
  try {
    const { vendor_id, session_token } = req.body;
    if (!vendor_id || !session_token) {
      return res.status(400).json({ error: 'vendor_id and session_token required' });
    }

    // Verify vendor
    const { data: vendor } = await supabase.from('vendors')
      .select('*, events(*)')
      .eq('id', vendor_id)
      .single();

    if (!vendor || vendor.session_token !== session_token) {
      return res.status(403).json({ error: 'Invalid vendor session' });
    }

    const event = vendor.events;
    if (!event) {
      return res.status(400).json({ error: 'Event not found for vendor' });
    }
    const amount = parseInt(event.vendor_fee_cents) || 999;
    const domain = process.env.APP_DOMAIN || 'localhost:3000';
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const productPrefix = event.type === 'menu' ? 'menu' : 'shop';

    const session = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: (event.currency || 'usd').toLowerCase(),
          product_data: { name: `Flash Vendor Fee — ${event.name}` },
          unit_amount: amount
        },
        quantity: 1
      }],
      payment_intent_data: {
        description: `Flash Vendor Fee for ${event.name}`,
        statement_descriptor: 'FLASH VENDOR FEE',
      },
      mode: 'payment',
      success_url: `${protocol}://${domain}/?product=${productPrefix}&session=${session_token}&paid=true`,
      cancel_url: `${protocol}://${domain}/?product=${productPrefix}&session=${session_token}&paid=false`,
      metadata: { vendor_id, event_id: event.id }
    });

    // Record payment
    await supabase.from('payments').insert({
      vendor_id, event_id: event.id,
      stripe_session_id: session.id,
      amount_cents: amount,
      currency: event.currency || 'USD',
      status: 'pending'
    });

    res.json({ checkout_url: session.url, amount_cents: amount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
