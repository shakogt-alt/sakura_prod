// Small shared HTTP helpers for admin API endpoints.

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

module.exports = { readJsonBody };
