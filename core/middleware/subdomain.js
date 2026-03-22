function subdomainRouter(req, res, next) {
  // Try subdomain first
  const host = req.hostname || '';
  const parts = host.split('.');

  if (parts.length >= 3) {
    const sub = parts[0].toLowerCase();
    if (['shop', 'menu', 'safe'].includes(sub)) {
      req.product = sub;
      return next();
    }
  }

  // Fallback to query param for local dev
  const qp = (req.query.product || '').toLowerCase();
  if (['shop', 'menu', 'safe'].includes(qp)) {
    req.product = qp;
  } else {
    req.product = 'landing';
  }

  next();
}

module.exports = subdomainRouter;
