// POST/PUT/DELETE /api/gallery
//
// Two-level content: gallery sections (e.g. "Наши сертификаты"), each
// holding a trilingual title and a list of photos (image + trilingual
// description). Dispatches on body.type ('section' | 'photo') so this
// stays ONE function file rather than two or three - see
// api/admin/[resource].js's commit message for why that matters on the
// Vercel Hobby plan's 12-function cap.
//
// content/gallery.json is public (fetched directly by the site's own
// gallery.html, same as team/blog/etc.) - only writes go through this
// endpoint, which is why every method here requires admin auth (unlike
// api/visits.js, gallery has no public write).
//
// Section operations:
//   POST body:   { type:'section', ru, en, ka }                    -> create section (photos: [])
//   PUT  body:   { type:'section', id, ru, en, ka }                 -> rename section (photos untouched)
//   DELETE body: { type:'section', id }                               -> delete section + all its photos
//
// Photo operations (nested inside a section):
//   POST body:   { type:'photo', sectionId, image, ru, en, ka }     -> add photo to section
//   PUT  body:   { type:'photo', sectionId, id, image, ru, en, ka } -> update a photo
//   DELETE body: { type:'photo', sectionId, id }                      -> remove a photo from its section

const { requireAuth } = require('./_lib/auth');
const { readJsonBody } = require('./_lib/http');
const { loadCollection, saveCollection, genId } = require('./_lib/jsonCrud');
const { validateGallerySection, validateGalleryPhoto } = require('./_lib/validate');

const CONTENT_PATH = 'content/gallery.json';

function sectionLabel(section) {
  return section && section.ru && section.ru.title;
}

function findSection(collection, sectionId) {
  return collection.data.find(function (s) { return s.id === sectionId; });
}

async function saveAndRespond(res, collection, message, successBody) {
  try {
    const result = await saveCollection(CONTENT_PATH, collection.data, collection.sha, message);
    successBody.commitUrl = result.commitUrl;
    return res.status(200).json(successBody);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save gallery.json to GitHub' });
  }
}

async function handleCreate(req, res) {
  const body = readJsonBody(req);
  if (body === null) return res.status(400).json({ error: 'Invalid JSON body' });

  let collection;
  try {
    collection = await loadCollection(CONTENT_PATH);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not load gallery.json from GitHub' });
  }

  if (body.type === 'section') {
    const problems = validateGallerySection(body);
    if (problems.length) return res.status(400).json({ error: 'Validation failed', problems: problems });
    const id = genId('gallerysection');
    const section = { id: id, ru: body.ru, en: body.en, ka: body.ka, photos: [] };
    collection.data.push(section);
    return saveAndRespond(res, collection, 'Add gallery section: ' + (sectionLabel(section) || id) + ' (admin panel)', { ok: true, id: id });
  }

  if (body.type === 'photo') {
    if (!body.sectionId) return res.status(400).json({ error: 'sectionId is required' });
    const problems = validateGalleryPhoto(body);
    if (problems.length) return res.status(400).json({ error: 'Validation failed', problems: problems });
    const section = findSection(collection, body.sectionId);
    if (!section) return res.status(404).json({ error: 'No gallery section with id "' + body.sectionId + '"' });
    const id = genId('galphoto');
    const photo = { id: id, image: body.image, ru: body.ru, en: body.en, ka: body.ka };
    if (!Array.isArray(section.photos)) section.photos = [];
    section.photos.push(photo);
    return saveAndRespond(res, collection, 'Add gallery photo to "' + (sectionLabel(section) || section.id) + '" (admin panel)', { ok: true, id: id });
  }

  return res.status(400).json({ error: 'body.type must be "section" or "photo"' });
}

async function handleUpdate(req, res) {
  const body = readJsonBody(req);
  if (body === null) return res.status(400).json({ error: 'Invalid JSON body' });
  if (!body.id) return res.status(400).json({ error: 'id is required' });

  let collection;
  try {
    collection = await loadCollection(CONTENT_PATH);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not load gallery.json from GitHub' });
  }

  if (body.type === 'section') {
    const problems = validateGallerySection(body);
    if (problems.length) return res.status(400).json({ error: 'Validation failed', problems: problems });
    const section = findSection(collection, body.id);
    if (!section) return res.status(404).json({ error: 'No gallery section with id "' + body.id + '"' });
    section.ru = body.ru;
    section.en = body.en;
    section.ka = body.ka;
    // photos deliberately untouched - renaming a section must not lose its photos
    return saveAndRespond(res, collection, 'Update gallery section: ' + (sectionLabel(section) || body.id) + ' (admin panel)', { ok: true, id: body.id });
  }

  if (body.type === 'photo') {
    if (!body.sectionId) return res.status(400).json({ error: 'sectionId is required' });
    const problems = validateGalleryPhoto(body);
    if (problems.length) return res.status(400).json({ error: 'Validation failed', problems: problems });
    const section = findSection(collection, body.sectionId);
    if (!section) return res.status(404).json({ error: 'No gallery section with id "' + body.sectionId + '"' });
    const photos = Array.isArray(section.photos) ? section.photos : [];
    const index = photos.findIndex(function (p) { return p.id === body.id; });
    if (index === -1) return res.status(404).json({ error: 'No photo with id "' + body.id + '" in this section' });
    photos[index] = { id: body.id, image: body.image, ru: body.ru, en: body.en, ka: body.ka };
    section.photos = photos;
    return saveAndRespond(res, collection, 'Update gallery photo in "' + (sectionLabel(section) || section.id) + '" (admin panel)', { ok: true, id: body.id });
  }

  return res.status(400).json({ error: 'body.type must be "section" or "photo"' });
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
    return res.status(502).json({ error: 'Could not load gallery.json from GitHub' });
  }

  if (body.type === 'section') {
    const index = collection.data.findIndex(function (s) { return s.id === body.id; });
    if (index === -1) return res.status(404).json({ error: 'No gallery section with id "' + body.id + '"' });
    const removedLabel = sectionLabel(collection.data[index]);
    collection.data.splice(index, 1);
    return saveAndRespond(res, collection, 'Remove gallery section: ' + (removedLabel || body.id) + ' (admin panel)', { ok: true });
  }

  if (body.type === 'photo') {
    if (!body.sectionId) return res.status(400).json({ error: 'sectionId is required' });
    const section = findSection(collection, body.sectionId);
    if (!section) return res.status(404).json({ error: 'No gallery section with id "' + body.sectionId + '"' });
    const photos = Array.isArray(section.photos) ? section.photos : [];
    const index = photos.findIndex(function (p) { return p.id === body.id; });
    if (index === -1) return res.status(404).json({ error: 'No photo with id "' + body.id + '" in this section' });
    photos.splice(index, 1);
    section.photos = photos;
    return saveAndRespond(res, collection, 'Remove gallery photo from "' + (sectionLabel(section) || section.id) + '" (admin panel)', { ok: true });
  }

  return res.status(400).json({ error: 'body.type must be "section" or "photo"' });
}

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  if (req.method === 'POST') return handleCreate(req, res);
  if (req.method === 'PUT') return handleUpdate(req, res);
  if (req.method === 'DELETE') return handleDelete(req, res);
  res.setHeader('Allow', 'POST, PUT, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
};
