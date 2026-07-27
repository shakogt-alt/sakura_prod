// GET /api/session
// Returns { authenticated: true|false }. Used by the admin UI on page load
// to decide whether to show the login form or the dashboard.

const { isAuthenticated } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  return res.status(200).json({ authenticated: isAuthenticated(req) });
};
