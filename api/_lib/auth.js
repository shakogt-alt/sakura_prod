// Shared session helpers for the Sakura admin API.
// Zero external dependencies - uses Node's built-in crypto module only.
//
// Session model: a signed, stateless token (HMAC-SHA256 over an expiry
// timestamp), stored in an HttpOnly cookie. No database, no server-side
// session store - the signature + expiry check is the whole mechanism.
//
// Required environment variables (set in Vercel Project Settings -> Environment Variables):
//   ADMIN_EMAIL     - the email Kristina/Shako log in with
//   ADMIN_PASSWORD  - the password they log in with
//   SESSION_SECRET  - a long random string used to sign session tokens
//                     (e.g. generate with: openssl rand -hex 32)

const crypto = require('crypto');

const SESSION_COOKIE_NAME = 'sakura_admin_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET environment variable is not set');
  }
  return secret;
}

function base64UrlEncode(input) {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(encodedPayload) {
  return crypto.createHmac('sha256', getSecret()).update(encodedPayload).digest('base64url');
}

// Creates a new signed session token that expires in SESSION_MAX_AGE_SECONDS.
function createSessionToken() {
  const payload = JSON.stringify({ exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 });
  const encodedPayload = base64UrlEncode(payload);
  const signature = sign(encodedPayload);
  return encodedPayload + '.' + signature;
}

// Verifies a session token's signature and expiry. Returns true/false.
function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const encodedPayload = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);
  if (!encodedPayload || !signature) return false;

  let expectedSignature;
  try {
    expectedSignature = sign(encodedPayload);
  } catch (e) {
    return false; // SESSION_SECRET missing/misconfigured
  }

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch (e) {
    return false;
  }
  if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) return false;

  return true;
}

// Parses the raw Cookie request header into a plain object.
function parseCookies(req) {
  const header = req.headers && req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach(function (pair) {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key) return;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch (e) {
      cookies[key] = value;
    }
  });
  return cookies;
}

// True if the incoming request carries a valid, unexpired session cookie.
function isAuthenticated(req) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[SESSION_COOKIE_NAME]);
}

// Attaches a Set-Cookie header carrying a fresh session token.
function setSessionCookie(res, token) {
  const isLocal = process.env.VERCEL_ENV === 'development';
  const parts = [
    SESSION_COOKIE_NAME + '=' + encodeURIComponent(token),
    'HttpOnly',
    'Path=/',
    'Max-Age=' + SESSION_MAX_AGE_SECONDS,
    'SameSite=Strict'
  ];
  if (!isLocal) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

// Attaches a Set-Cookie header that immediately expires the session cookie.
function clearSessionCookie(res) {
  const isLocal = process.env.VERCEL_ENV === 'development';
  const parts = [
    SESSION_COOKIE_NAME + '=',
    'HttpOnly',
    'Path=/',
    'Max-Age=0',
    'SameSite=Strict'
  ];
  if (!isLocal) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

// Constant-time string comparison (avoids leaking info via timing attacks).
// Returns false safely even when lengths differ.
function timingSafeEqualStr(a, b) {
  const aBuf = Buffer.from(String(a == null ? '' : a), 'utf8');
  const bBuf = Buffer.from(String(b == null ? '' : b), 'utf8');
  if (aBuf.length !== bBuf.length) {
    // Still do a comparison of equal-length buffers so the failure path
    // takes comparable time regardless of the real length mismatch.
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// Sends a JSON 401 response for protected endpoints to reuse.
function requireAuth(req, res) {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: 'Not authenticated' });
    return false;
  }
  return true;
}

module.exports = {
  SESSION_COOKIE_NAME,
  createSessionToken,
  verifySessionToken,
  parseCookies,
  isAuthenticated,
  setSessionCookie,
  clearSessionCookie,
  timingSafeEqualStr,
  requireAuth
};
