// POST /api/logout
// Clears the session cookie. Always returns { ok: true }.

const { clearSessionCookie } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
};
