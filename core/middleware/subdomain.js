function subdomainRouter(req, res, next) {
  // Try subdomain first
  const host = req.hostname || '';
  const parts = host.split('.');

  let product = null;

  if (parts.length >= 3) {
    const sub = parts[0].toLowerCase();
    if (['shop', 'menu', 'safe'].includes(sub)) {
      product = sub;
    }
  }

  // Fallback to query param for local dev
  if (!product) {
    const qp = (req.query.product || '').toLowerCase();
    if (['shop', 'menu', 'safe'].includes(qp)) {
      product = qp;
    }
  }

  // Redirect menu → shop with tab=menu
  if (product === 'menu' && !req.path.startsWith('/api')) {
    const tab = req.query.tab || 'menu';
    const qs = new URLSearchParams(req.query);
    qs.set('product', 'shop');
    qs.set('tab', tab);
    qs.delete('product'); // clean redirect uses product=shop
    return res.redirect(`/?product=shop&tab=${tab}`);
  }

  req.product = product || 'landing';
  next();
}

module.exports = subdomainRouter;
