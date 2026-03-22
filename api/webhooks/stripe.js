const { supabase } = require('../../core/supabase');
const { stripe } = require('../../core/stripe');

async function stripeWebhookHandler(req, res) {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { vendor_id, event_id } = session.metadata;

    try {
      // Update payment
      await supabase.from('payments')
        .update({
          status: 'succeeded',
          stripe_payment_intent_id: session.payment_intent
        })
        .eq('stripe_session_id', session.id);

      // Activate vendor
      await supabase.from('vendors')
        .update({
          status: 'active',
          stripe_payment_id: session.payment_intent,
          paid_at: new Date().toISOString()
        })
        .eq('id', vendor_id);

      // List all approved items
      await supabase.from('items')
        .update({ status: 'listed', listed_at: new Date().toISOString() })
        .eq('vendor_id', vendor_id)
        .eq('status', 'approved');

      // Audit log
      await supabase.from('audit_log').insert({
        event_id,
        actor_type: 'stripe',
        actor_id: session.id,
        action: 'vendor_payment_completed',
        target_type: 'vendor',
        target_id: vendor_id,
        metadata: { amount: session.amount_total, currency: session.currency }
      });

      console.log(`Vendor ${vendor_id} payment completed, items listed`);
    } catch (err) {
      console.error('Webhook processing error:', err);
    }
  }

  res.json({ received: true });
}

module.exports = stripeWebhookHandler;
