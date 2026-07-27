// POST/PUT/DELETE /api/admin/team
// Manages content/team.json - the public team section on the live site
// reads this file directly and needs no restart/rebuild after a save.
//
// POST body:   { photo, ru, en, ka }                 -> creates a member
// PUT body:    { id, photo, ru, en, ka }              -> updates a member
// DELETE body: { id }                                 -> removes a member
//
// All three require a valid admin session cookie (see api/_lib/auth.js).

const { requireAuth } = require('../_lib/auth');
const { readJsonBody } = require('../_lib/http');
const { genId, loadCollection, saveCollection } = require('../_lib/jsonCrud');
const { validateTeamMember } = require('../_lib/validate');

const CONTENT_PATH = 'content/team.json';

async function handleCreate(req, res) {
  const body = readJsonBody(req);
  if (body === null) return res.status(400).json({ error: 'Invalid JSON body' });

  const problems = validateTeamMember(body);
  if (problems.length) return res.status(400).json({ error: 'Validation failed', problems: problems });

  let collection;
  try {
    collection = await loadCollection(CONTENT_PATH);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not load team.json from GitHub' });
  }

  const id = genId('member');
  const member = { id: id, photo: body.photo, ru: body.ru, en: body.en, ka: body.ka };
  collection.data.push(member);

  try {
    const result = await saveCollection(
      CONTENT_PATH,
      collection.data,
      collection.sha,
      'Add team member: ' + (body.ru && body.ru.name ? body.ru.name : id) + ' (admin panel)'
    );
    return res.status(200).json({ ok: true, id: id, commitUrl: result.commitUrl });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save team.json to GitHub' });
  }
}

async function handleUpdate(req, res) {
  const body = readJsonBody(req);
  if (body === null) return res.status(400).json({ error: 'Invalid JSON body' });
  if (!body.id) return res.status(400).json({ error: 'id is required' });

  const problems = validateTeamMember(body);
  if (problems.length) return res.status(400).json({ error: 'Validation failed', problems: problems });

  let collection;
  try {
    collection = await loadCollection(CONTENT_PATH);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not load team.json from GitHub' });
  }

  const index = collection.data.findIndex(function (m) { return m.id === body.id; });
  if (index === -1) return res.status(404).json({ error: 'No team member with id "' + body.id + '"' });

  collection.data[index] = { id: body.id, photo: body.photo, ru: body.ru, en: body.en, ka: body.ka };

  try {
    const result = await saveCollection(
      CONTENT_PATH,
      collection.data,
      collection.sha,
      'Update team member: ' + (body.ru && body.ru.name ? body.ru.name : body.id) + ' (admin panel)'
    );
    return res.status(200).json({ ok: true, id: body.id, commitUrl: result.commitUrl });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save team.json to GitHub' });
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
    return res.status(502).json({ error: 'Could not load team.json from GitHub' });
  }

  const index = collection.data.findIndex(function (m) { return m.id === body.id; });
  if (index === -1) return res.status(404).json({ error: 'No team member with id "' + body.id + '"' });

  const removedName = collection.data[index].ru && collection.data[index].ru.name;
  collection.data.splice(index, 1);

  try {
    const result = await saveCollection(
      CONTENT_PATH,
      collection.data,
      collection.sha,
      'Remove team member: ' + (removedName || body.id) + ' (admin panel)'
    );
    return res.status(200).json({ ok: true, commitUrl: result.commitUrl });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save team.json to GitHub' });
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
