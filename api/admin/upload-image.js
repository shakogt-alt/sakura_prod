// POST /api/admin/upload-image
// Body: { filename: "photo.jpg", dataBase64: "<raw base64 bytes>" }
// Uploads the image into images/ (with a random prefix so names never
// collide) and returns the path to reference from team.json / blog.json.
//
// Requires a valid admin session cookie (see api/_lib/auth.js). Images
// only - max 3MB, .jpg/.jpeg/.png/.webp.

const crypto = require('crypto');
const { requireAuth } = require('../_lib/auth');
const { readJsonBody } = require('../_lib/http');
const { putBinaryFile } = require('../_lib/github');

const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_BYTES = 3 * 1024 * 1024; // 3MB

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = readJsonBody(req);
  if (body === null) return res.status(400).json({ error: 'Invalid JSON body' });

  const filename = body.filename;
  const dataBase64 = body.dataBase64;

  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'filename is required' });
  }
  if (!dataBase64 || typeof dataBase64 !== 'string') {
    return res.status(400).json({ error: 'dataBase64 is required' });
  }

  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(filename);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  if (ALLOWED_EXT.indexOf(ext) === -1) {
    return res.status(400).json({ error: 'Only .jpg, .jpeg, .png, .webp images are allowed' });
  }

  let buffer;
  try {
    buffer = Buffer.from(dataBase64, 'base64');
  } catch (e) {
    return res.status(400).json({ error: 'dataBase64 is not valid base64' });
  }
  if (buffer.length === 0) {
    return res.status(400).json({ error: 'Uploaded image is empty' });
  }
  if (buffer.length > MAX_BYTES) {
    return res.status(400).json({ error: 'Image is too large - max 3MB' });
  }

  const safeBase = filename
    .toLowerCase()
    .replace(/\.[a-zA-Z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'image';
  const path = 'images/' + crypto.randomBytes(4).toString('hex') + '-' + safeBase + '.' + ext;

  try {
    const result = await putBinaryFile(path, dataBase64, 'Upload image via admin panel: ' + path);
    return res.status(200).json({ ok: true, path: path, commitUrl: result.commitUrl });
  } catch (e) {
    console.error('upload-image failed:', e);
    return res.status(502).json({ error: 'Failed to upload image to GitHub' });
  }
};
