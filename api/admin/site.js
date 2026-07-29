// PUT /api/admin/site
// Manages content/site.json - singleton site-wide settings: address,
// working hours, the two phone numbers, and the hero background image
// path. Same "always exactly one object" shape as api/admin/about.js, so
// it uses github.js's getFile/putFile directly rather than jsonCrud.js.
//
// phoneAdmin and heroImage in particular are read by many places across
// the public page (see index.html's renderSite()), not just one section -
// see the comment above validateSite() in api/_lib/validate.js.
//
// PUT body: { address, hours, phoneAdmin, phoneDirector, heroImage }
//
// Requires a valid admin session cookie (see api/_lib/auth.js).

const { requireAuth } = require('../_lib/auth');
const { readJsonBody } = require('../_lib/http');
const { getFile, putFile } = require('../_lib/github');
const { validateSite } = require('../_lib/validate');

const CONTENT_PATH = 'content/site.json';

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = readJsonBody(req);
  if (body === null) return res.status(400).json({ error: 'Invalid JSON body' });

  const problems = validateSite(body);
  if (problems.length) return res.status(400).json({ error: 'Validation failed', problems: problems });

  let existing;
  try {
    existing = await getFile(CONTENT_PATH);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not load site.json from GitHub' });
  }
  if (!existing) return res.status(404).json({ error: 'site.json does not exist in the repo' });

  const record = {
    address: body.address,
    hours: body.hours,
    phoneAdmin: body.phoneAdmin,
    phoneDirector: body.phoneDirector,
    heroImage: body.heroImage
  };
  const content = JSON.stringify(record, null, 2) + '\n';

  try {
    const result = await putFile(CONTENT_PATH, content, 'Update site settings (admin panel)', existing.sha);
    return res.status(200).json({ ok: true, commitUrl: result.commitUrl });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save site.json to GitHub' });
  }
};
