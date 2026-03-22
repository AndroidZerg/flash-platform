require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const subdomainRouter = require('./core/middleware/subdomain');
const stripeWebhookHandler = require('./api/webhooks/stripe');

const app = express();

// CORS
app.use(cors());

// Stripe webhook MUST be before express.json() — needs raw body
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookHandler);

// JSON + URL-encoded parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Subdomain routing middleware
app.use(subdomainRouter);

// API routes
app.use('/api', require('./api/health'));
app.use('/api', require('./api/events'));
app.use('/api', require('./api/vendors'));
app.use('/api', require('./api/items'));
app.use('/api', require('./api/analyze'));
app.use('/api', require('./api/checkout'));
app.use('/api/safe', require('./api/safe'));

// Static files — serve based on product subdomain
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();

  const product = req.product || 'landing';
  const staticPath = path.join(__dirname, 'public', product);

  express.static(staticPath)(req, res, () => {
    // If file not found in product dir, try serving index.html for SPA routing
    if (!req.path.includes('.')) {
      return res.sendFile(path.join(staticPath, 'index.html'), (err) => {
        if (err) next();
      });
    }
    next();
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Flash Platform running on port ${PORT}`);
  console.log(`  Shop: http://localhost:${PORT}/?product=shop`);
  console.log(`  Menu: http://localhost:${PORT}/?product=menu`);
  console.log(`  Safe: http://localhost:${PORT}/?product=safe`);
  console.log(`  Landing: http://localhost:${PORT}/`);
});
