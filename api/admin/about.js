// PUT /api/admin/about
// Manages content/about.json - the singleton "О нас" founder-story
// section. Unlike team/blog/prices/services/advantages/reviews this is
// ALWAYS exactly one object, never an array of records - so there is no
// create/delete here, only update. Uses github.js's getFile/putFile
// directly rather than api/_lib/jsonCrud.js, since jsonCrud's helpers
// specifically require the stored JSON to be an array.
//
// PUT body: { photo, ru, en, ka }
//
// Requires a valid admin session cookie (see api/_lib/auth.js).

const { requireAuth } = require('../_lib/auth');
const { readJsonBody } = require('../_lib/http');
const { getFile, putFile } = require('../_lib/github');
const { validateAbout } = require('../_lib/validate');

const CONTENT_PATH = 'content/about.json';

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = readJsonBody(req);
  if (body === null) return res.status(400).json({ error: 'Invalid JSON body' });

  const problems = validateAbout(body);
  if (problems.length) return res.status(400).json({ error: 'Validation failed', problems: problems });

  let existing;
  try {
    existing = await getFile(CONTENT_PATH);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not load about.json from GitHub' });
  }
  if (!existing) return res.status(404).json({ error: 'about.json does not exist in the repo' });

  const record = { photo: body.photo, ru: body.ru, en: body.en, ka: body.ka };
  const content = JSON.stringify(record, null, 2) + '\n';

  try {
    const result = await putFile(CONTENT_PATH, content, 'Update about section (admin panel)', existing.sha);
    return res.status(200).json({ ok: true, commitUrl: result.commitUrl });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save about.json to GitHub' });
  }
};
