// POST/PUT/DELETE /api/admin/{resource}
//
// Single consolidated endpoint for every array-collection content type:
// team, blog, prices, reviews, services, advantages. Vercel's Hobby plan
// caps a deployment at 12 Serverless Functions; each of these 6 used to
// be its own file, and the project had grown to 13 total (this file plus
// upload-image, sync-google-reviews, about, site, session, login, logout),
// which failed the build outright ("No more than 12 Serverless Functions
// can be added to a Deployment on the Hobby plan"). Collapsing these 6 -
// identical CRUD shape, only the content path/validator/id-prefix/record
// shape differ - into one dynamic route brings the total to 8, with
// headroom for future additions.
//
// [resource].js is Vercel's dynamic-route file naming convention for a
// plain (non-framework) /api directory: a request to /api/admin/team
// resolves to this file with req.query.resource === 'team'. The admin
// UI's existing fetch calls (/api/admin/team, /api/admin/blog, etc.) did
// not need to change - Vercel resolves them here transparently.
//
// POST body:   depends on resource, see RESOURCES below   -> creates a record
// PUT body:    { id, ...same shape }                        -> updates a record
// DELETE body: { id }                                         -> removes a record
//
// All three require a valid admin session cookie (see api/_lib/auth.js).

const { requireAuth } = require('../_lib/auth');
const { readJsonBody } = require('../_lib/http');
const { genId, loadCollection, saveCollection } = require('../_lib/jsonCrud');
const {
  validateTeamMember,
  validateBlogPost,
  validatePriceCategory,
  validateReview,
  validateServiceCard,
  validateAdvantageCard
} = require('../_lib/validate');

function titleLangGetter(r) { return r && r.ru && r.ru.title; }
function basename(path) { return path.split('/').pop(); }

const RESOURCES = {
  team: {
    contentPath: 'content/team.json',
    idPrefix: 'member',
    noun: 'team member',
    validate: validateTeamMember,
    buildRecord: function (id, body) { return { id: id, photo: body.photo, ru: body.ru, en: body.en, ka: body.ka }; },
    getLabel: function (r) { return r && r.ru && r.ru.name; }
  },
  blog: {
    contentPath: 'content/blog.json',
    idPrefix: 'post',
    noun: 'blog post',
    validate: validateBlogPost,
    // Note: ru/en/ka.body is expected to already be HTML (the admin's
    // Quill editor produces it) - this endpoint does not convert plain
    // text to HTML, same as the original api/admin/blog.js.
    buildRecord: function (id, body) { return { id: id, image: body.image, alt: body.alt, ru: body.ru, en: body.en, ka: body.ka }; },
    getLabel: function (r) { return r && r.ru && r.ru.cardTitle; }
  },
  prices: {
    contentPath: 'content/prices.json',
    idPrefix: 'price',
    noun: 'price category',
    validate: validatePriceCategory,
    buildRecord: function (id, body) {
      return { id: id, fullWidth: !!body.fullWidth, icon: body.icon, ru: body.ru, en: body.en, ka: body.ka, items: body.items };
    },
    getLabel: titleLangGetter
  },
  reviews: {
    contentPath: 'content/reviews.json',
    idPrefix: 'review',
    noun: 'review',
    validate: validateReview,
    // The admin edit form has no googleReviewId field, so a manual save
    // never sends one - carry it through from the existing stored record
    // (if any) so editing a Google-synced review doesn't strip its dedup
    // key and cause it to be re-added as a "new" review on the next sync
    // (see api/admin/sync-google-reviews.js).
    buildRecord: function (id, body, existing) {
      const record = { id: id, author: body.author, rating: body.rating, lang: body.lang, text: body.text };
      if (body.date) record.date = body.date;
      if (body.source) record.source = body.source;
      const gid = body.googleReviewId || (existing && existing.googleReviewId);
      if (gid) record.googleReviewId = gid;
      return record;
    },
    getLabel: function (r) { return r && r.author; }
  },
  services: {
    contentPath: 'content/services.json',
    idPrefix: 'service',
    noun: 'service',
    validate: validateServiceCard,
    buildRecord: function (id, body) { return { id: id, icon: body.icon, ru: body.ru, en: body.en, ka: body.ka }; },
    getLabel: titleLangGetter
  },
  advantages: {
    contentPath: 'content/advantages.json',
    idPrefix: 'adv',
    noun: 'advantage',
    validate: validateAdvantageCard,
    buildRecord: function (id, body) { return { id: id, icon: body.icon, ru: body.ru, en: body.en, ka: body.ka }; },
    getLabel: titleLangGetter
  }
};

async function handleCreate(cfg, req, res) {
  const body = readJsonBody(req);
  if (body === null) return res.status(400).json({ error: 'Invalid JSON body' });

  const problems = cfg.validate(body);
  if (problems.length) return res.status(400).json({ error: 'Validation failed', problems: problems });

  let collection;
  try {
    collection = await loadCollection(cfg.contentPath);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not load ' + basename(cfg.contentPath) + ' from GitHub' });
  }

  const id = genId(cfg.idPrefix);
  const record = cfg.buildRecord(id, body, null);
  collection.data.push(record);

  try {
    const result = await saveCollection(
      cfg.contentPath,
      collection.data,
      collection.sha,
      'Add ' + cfg.noun + ': ' + (cfg.getLabel(record) || id) + ' (admin panel)'
    );
    return res.status(200).json({ ok: true, id: id, commitUrl: result.commitUrl });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save ' + basename(cfg.contentPath) + ' to GitHub' });
  }
}

async function handleUpdate(cfg, req, res) {
  const body = readJsonBody(req);
  if (body === null) return res.status(400).json({ error: 'Invalid JSON body' });
  if (!body.id) return res.status(400).json({ error: 'id is required' });

  const problems = cfg.validate(body);
  if (problems.length) return res.status(400).json({ error: 'Validation failed', problems: problems });

  let collection;
  try {
    collection = await loadCollection(cfg.contentPath);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not load ' + basename(cfg.contentPath) + ' from GitHub' });
  }

  const index = collection.data.findIndex(function (r) { return r.id === body.id; });
  if (index === -1) return res.status(404).json({ error: 'No ' + cfg.noun + ' with id "' + body.id + '"' });

  const existing = collection.data[index];
  const record = cfg.buildRecord(body.id, body, existing);
  collection.data[index] = record;

  try {
    const result = await saveCollection(
      cfg.contentPath,
      collection.data,
      collection.sha,
      'Update ' + cfg.noun + ': ' + (cfg.getLabel(record) || body.id) + ' (admin panel)'
    );
    return res.status(200).json({ ok: true, id: body.id, commitUrl: result.commitUrl });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save ' + basename(cfg.contentPath) + ' to GitHub' });
  }
}

async function handleDelete(cfg, req, res) {
  const body = readJsonBody(req);
  if (body === null) return res.status(400).json({ error: 'Invalid JSON body' });
  if (!body.id) return res.status(400).json({ error: 'id is required' });

  let collection;
  try {
    collection = await loadCollection(cfg.contentPath);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not load ' + basename(cfg.contentPath) + ' from GitHub' });
  }

  const index = collection.data.findIndex(function (r) { return r.id === body.id; });
  if (index === -1) return res.status(404).json({ error: 'No ' + cfg.noun + ' with id "' + body.id + '"' });

  const removedLabel = cfg.getLabel(collection.data[index]);
  collection.data.splice(index, 1);

  try {
    const result = await saveCollection(
      cfg.contentPath,
      collection.data,
      collection.sha,
      'Remove ' + cfg.noun + ': ' + (removedLabel || body.id) + ' (admin panel)'
    );
    return res.status(200).json({ ok: true, commitUrl: result.commitUrl });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save ' + basename(cfg.contentPath) + ' to GitHub' });
  }
}

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  const resource = req.query && req.query.resource;
  const cfg = RESOURCES[resource];
  if (!cfg) return res.status(404).json({ error: 'Unknown resource "' + resource + '"' });

  if (req.method === 'POST') return handleCreate(cfg, req, res);
  if (req.method === 'PUT') return handleUpdate(cfg, req, res);
  if (req.method === 'DELETE') return handleDelete(cfg, req, res);
  res.setHeader('Allow', 'POST, PUT, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
};
