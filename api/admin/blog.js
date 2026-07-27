// POST/PUT/DELETE /api/admin/blog
// Manages content/blog.json - the public blog section on the live site
// reads this file directly and needs no restart/rebuild after a save.
//
// POST body:   { image, alt, ru, en, ka }              -> creates a post
// PUT body:    { id, image, alt, ru, en, ka }           -> updates a post
// DELETE body: { id }                                   -> removes a post
//
// All three require a valid admin session cookie (see api/_lib/auth.js).
// Note: `ru`/`en`/`ka`.body is expected to already be HTML (the same
// paragraph/heading/list markup used elsewhere on the site) - the admin
// UI is responsible for producing that markup, this endpoint does not
// convert plain text to HTML.

const { requireAuth } = require('../_lib/auth');
const { readJsonBody } = require('../_lib/http');
const { genId, loadCollection, saveCollection } = require('../_lib/jsonCrud');
const { validateBlogPost } = require('../_lib/validate');

const CONTENT_PATH = 'content/blog.json';

function buildRecord(id, body) {
  return { id: id, image: body.image, alt: body.alt, ru: body.ru, en: body.en, ka: body.ka };
}

async function handleCreate(req, res) {
  const body = readJsonBody(req);
  if (body === null) return res.status(400).json({ error: 'Invalid JSON body' });

  const problems = validateBlogPost(body);
  if (problems.length) return res.status(400).json({ error: 'Validation failed', problems: problems });

  let collection;
  try {
    collection = await loadCollection(CONTENT_PATH);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not load blog.json from GitHub' });
  }

  const id = genId('post');
  collection.data.push(buildRecord(id, body));

  try {
    const result = await saveCollection(
      CONTENT_PATH,
      collection.data,
      collection.sha,
      'Add blog post: ' + (body.ru && body.ru.cardTitle ? body.ru.cardTitle : id) + ' (admin panel)'
    );
    return res.status(200).json({ ok: true, id: id, commitUrl: result.commitUrl });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save blog.json to GitHub' });
  }
}

async function handleUpdate(req, res) {
  const body = readJsonBody(req);
  if (body === null) return res.status(400).json({ error: 'Invalid JSON body' });
  if (!body.id) return res.status(400).json({ error: 'id is required' });

  const problems = validateBlogPost(body);
  if (problems.length) return res.status(400).json({ error: 'Validation failed', problems: problems });

  let collection;
  try {
    collection = await loadCollection(CONTENT_PATH);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not load blog.json from GitHub' });
  }

  const index = collection.data.findIndex(function (p) { return p.id === body.id; });
  if (index === -1) return res.status(404).json({ error: 'No blog post with id "' + body.id + '"' });

  collection.data[index] = buildRecord(body.id, body);

  try {
    const result = await saveCollection(
      CONTENT_PATH,
      collection.data,
      collection.sha,
      'Update blog post: ' + (body.ru && body.ru.cardTitle ? body.ru.cardTitle : body.id) + ' (admin panel)'
    );
    return res.status(200).json({ ok: true, id: body.id, commitUrl: result.commitUrl });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save blog.json to GitHub' });
  }
}

async function handleDelete(req, res) {
  const body = readJsonBody(req);
  if (body === null) return res.status(400).json({ error: 'Invalid JSON body' });
  if (!body.id) return res.status(400).json({ error: 'id is required' });

  let collection;
  try {
    collection = await loadCollection(CONTENT_PATH);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not load blog.json from GitHub' });
  }

  const index = collection.data.findIndex(function (p) { return p.id === body.id; });
  if (index === -1) return res.status(404).json({ error: 'No blog post with id "' + body.id + '"' });

  const removedTitle = collection.data[index].ru && collection.data[index].ru.cardTitle;
  collection.data.splice(index, 1);

  try {
    const result = await saveCollection(
      CONTENT_PATH,
      collection.data,
      collection.sha,
      'Remove blog post: ' + (removedTitle || body.id) + ' (admin panel)'
    );
    return res.status(200).json({ ok: true, commitUrl: result.commitUrl });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save blog.json to GitHub' });
  }
}

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method === 'POST') return handleCreate(req, res);
  if (req.method === 'PUT') return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  res.setHeader('Allow', 'POST, PUT, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
};
