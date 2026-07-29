// POST/PUT/DELETE /api/admin/services
// Manages content/services.json - the "Услуги" card grid near the top of
// the public site reads this file directly and needs no restart/rebuild
// after a save. Same icon+trilingual shape as a price category, minus the
// items/includes arrays - each record is just { icon, ru, en, ka }.
//
// POST body:   { icon, ru, en, ka }        -> creates a service card
// PUT body:    { id, icon, ru, en, ka }    -> updates a service card
// DELETE body: { id }                       -> removes a service card
//
// All three require a valid admin session cookie (see api/_lib/auth.js).

const { requireAuth } = require('../_lib/auth');
const { readJsonBody } = require('../_lib/http');
const { genId, loadCollection, saveCollection } = require('../_lib/jsonCrud');
const { validateServiceCard } = require('../_lib/validate');

const CONTENT_PATH = 'content/services.json';

function buildRecord(id, body) {
  return {
    id: id,
    icon: body.icon,
    ru: body.ru,
    en: body.en,
    ka: body.ka
  };
}

async function handleCreate(req, res) {
  const body = readJsonBody(req);
  if (body === null) return res.status(400).json({ error: 'Invalid JSON body' });

  const problems = validateServiceCard(body);
  if (problems.length) return res.status(400).json({ error: 'Validation failed', problems: problems });

  let collection;
  try {
    collection = await loadCollection(CONTENT_PATH);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not load services.json from GitHub' });
  }

  const id = genId('service');
  collection.data.push(buildRecord(id, body));

  try {
    const result = await saveCollection(
      CONTENT_PATH,
      collection.data,
      collection.sha,
      'Add service: ' + (body.ru && body.ru.title ? body.ru.title : id) + ' (admin panel)'
    );
    return res.status(200).json({ ok: true, id: id, commitUrl: result.commitUrl });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save services.json to GitHub' });
  }
}

async function handleUpdate(req, res) {
  const body = readJsonBody(req);
  if (body === null) return res.status(400).json({ error: 'Invalid JSON body' });
  if (!body.id) return res.status(400).json({ error: 'id is required' });

  const problems = validateServiceCard(body);
  if (problems.length) return res.status(400).json({ error: 'Validation failed', problems: problems });

  let collection;
  try {
    collection = await loadCollection(CONTENT_PATH);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not load services.json from GitHub' });
  }

  const index = collection.data.findIndex(function (c) { return c.id === body.id; });
  if (index === -1) return res.status(404).json({ error: 'No service with id "' + body.id + '"' });

  collection.data[index] = buildRecord(body.id, body);

  try {
    const result = await saveCollection(
      CONTENT_PATH,
      collection.data,
      collection.sha,
      'Update service: ' + (body.ru && body.ru.title ? body.ru.title : body.id) + ' (admin panel)'
    );
    return res.status(200).json({ ok: true, id: body.id, commitUrl: result.commitUrl });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save services.json to GitHub' });
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
    return res.status(502).json({ error: 'Could not load services.json from GitHub' });
  }

  const index = collection.data.findIndex(function (c) { return c.id === body.id; });
  if (index === -1) return res.status(404).json({ error: 'No service with id "' + body.id + '"' });

  const removedTitle = collection.data[index].ru && collection.data[index].ru.title;
  collection.data.splice(index, 1);

  try {
    const result = await saveCollection(
      CONTENT_PATH,
      collection.data,
      collection.sha,
      'Remove service: ' + (removedTitle || body.id) + ' (admin panel)'
    );
    return res.status(200).json({ ok: true, commitUrl: result.commitUrl });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save services.json to GitHub' });
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
