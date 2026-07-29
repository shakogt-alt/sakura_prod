// POST/PUT/DELETE /api/admin/reviews
// Manages content/reviews.json - the public reviews section on the live
// site reads this file directly and needs no restart/rebuild after a
// save. Unlike team/blog/prices, a review is single-language (shown in
// whichever language the patient actually wrote it, not translated) -
// so the record is flat, no ru/en/ka sub-objects.
//
// POST body:   { author, rating, lang, text, date?, source? }        -> creates a review
// PUT body:    { id, author, rating, lang, text, date?, source? }    -> updates a review
// DELETE body: { id }                                                 -> removes a review
//
// All three require a valid admin session cookie (see api/_lib/auth.js).
//
// Reviews pulled in via api/admin/sync-google-reviews.js also live in this
// same content/reviews.json collection and carry an extra `googleReviewId`
// field (Google's stable review resource name, used there for dedup on
// re-sync). Editing/deleting a Google-sourced review works through this
// file exactly the same as a manually-entered one - see buildRecord().

const { requireAuth } = require('../_lib/auth');
const { readJsonBody } = require('../_lib/http');
const { genId, loadCollection, saveCollection } = require('../_lib/jsonCrud');
const { validateReview } = require('../_lib/validate');

const CONTENT_PATH = 'content/reviews.json';

function buildRecord(id, body, existing) {
  const record = { id: id, author: body.author, rating: body.rating, lang: body.lang, text: body.text };
  if (body.date) record.date = body.date;
  if (body.source) record.source = body.source;
  // The admin edit form has no googleReviewId field, so a manual save
  // never sends one - carry it through from the existing stored record
  // (if any) so editing a Google-synced review doesn't strip its dedup
  // key and cause it to be re-added as a "new" review on the next sync.
  const gid = body.googleReviewId || (existing && existing.googleReviewId);
  if (gid) record.googleReviewId = gid;
  return record;
}

async function handleCreate(req, res) {
  const body = readJsonBody(req);
  if (body === null) return res.status(400).json({ error: 'Invalid JSON body' });

  const problems = validateReview(body);
  if (problems.length) return res.status(400).json({ error: 'Validation failed', problems: problems });

  let collection;
  try {
    collection = await loadCollection(CONTENT_PATH);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not load reviews.json from GitHub' });
  }

  const id = genId('review');
  collection.data.push(buildRecord(id, body));

  try {
    const result = await saveCollection(
      CONTENT_PATH,
      collection.data,
      collection.sha,
      'Add review: ' + (body.author || id) + ' (admin panel)'
    );
    return res.status(200).json({ ok: true, id: id, commitUrl: result.commitUrl });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save reviews.json to GitHub' });
  }
}

async function handleUpdate(req, res) {
  const body = readJsonBody(req);
  if (body === null) return res.status(400).json({ error: 'Invalid JSON body' });
  if (!body.id) return res.status(400).json({ error: 'id is required' });

  const problems = validateReview(body);
  if (problems.length) return res.status(400).json({ error: 'Validation failed', problems: problems });

  let collection;
  try {
    collection = await loadCollection(CONTENT_PATH);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not load reviews.json from GitHub' });
  }

  const index = collection.data.findIndex(function (r) { return r.id === body.id; });
  if (index === -1) return res.status(404).json({ error: 'No review with id "' + body.id + '"' });

  collection.data[index] = buildRecord(body.id, body, collection.data[index]);

  try {
    const result = await saveCollection(
      CONTENT_PATH,
      collection.data,
      collection.sha,
      'Update review: ' + (body.author || body.id) + ' (admin panel)'
    );
    return res.status(200).json({ ok: true, id: body.id, commitUrl: result.commitUrl });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save reviews.json to GitHub' });
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
    return res.status(502).json({ error: 'Could not load reviews.json from GitHub' });
  }

  const index = collection.data.findIndex(function (r) { return r.id === body.id; });
  if (index === -1) return res.status(404).json({ error: 'No review with id "' + body.id + '"' });

  const removedAuthor = collection.data[index].author;
  collection.data.splice(index, 1);

  try {
    const result = await saveCollection(
      CONTENT_PATH,
      collection.data,
      collection.sha,
      'Remove review: ' + (removedAuthor || body.id) + ' (admin panel)'
    );
    return res.status(200).json({ ok: true, commitUrl: result.commitUrl });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save reviews.json to GitHub' });
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
