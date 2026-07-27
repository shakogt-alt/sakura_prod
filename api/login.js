// POST /api/login
// Body: { "email": "...", "password": "..." }
// On success: sets an HttpOnly session cookie and returns { ok: true }.
// On failure: returns 401 with an error message.

const { createSessionToken, setSessionCookie, timingSafeEqualStr } = require('./_lib/auth');

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch (e) {
      return null;
    }
  }
  return {};
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = readJsonBody(req);
  if (body === null) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const email = body.email;
  const password = body.password;

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword || !process.env.SESSION_SECRET) {
    console.error('Admin auth is not configured: missing ADMIN_EMAIL, ADMIN_PASSWORD, or SESSION_SECRET');
    return res.status(500).json({ error: 'Server is not configured. Contact the site administrator.' });
  }

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const emailOk = timingSafeEqualStr(String(email).trim().toLowerCase(), adminEmail.trim().toLowerCase());
  const passwordOk = timingSafeEqualStr(password, adminPassword);

  if (!emailOk || !passwordOk) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = createSessionToken();
  setSessionCookie(res, token);
  return res.status(200).json({ ok: true });
};
