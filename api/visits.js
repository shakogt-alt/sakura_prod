// GET/POST/PUT /api/visits
//
// Visit counter, admin-only to view. Backed by data/visits.json (same
// "GitHub commit is the database" model as everything else - see
// api/_lib/github.js), but unlike content/*.json, this file is NOT
// meant to be public: it's excluded from Vercel's static output via
// .vercelignore (data/), so the only way to read it is through this
// endpoint's auth-gated GET. Do not move this data under content/ or
// any other path Vercel serves statically - that would publish the
// visit count and the excluded-IP list to any visitor who guesses the URL.
//
// All reads/writes of data/visits.json target VISITS_BRANCH, a dedicated
// branch never checked out or pushed to by a human - not GITHUB_BRANCH
// (main). A commit per visitor, landing directly on main, meant every
// real site visit could race a human `git push` and reject it with
// "non-fast-forward". Keeping this branch isolated preserves exact
// per-visit accuracy (no batching/sampling) while guaranteeing main
// never receives another visit-counter commit. vercel.json's
// git.deploymentEnabled turns off preview deployments for this branch,
// since GitHub's Contents API commits fire the same push webhook a
// human `git push` would.
//
// GET  (admin only): -> { count, excludedIps }
// POST (public, no auth - called by the site's own visit beacon):
//   reads the caller's IP from the request headers, skips silently if
//   that IP is in excludedIps, otherwise increments count by 1.
// PUT  (admin only) body: { excludedIps: [...] } -> replaces the
//   excluded-IP list wholesale (mirrors how "specializes"/"includes"
//   array-fields are saved elsewhere in the admin panel: edit freely,
//   one Save persists the whole list). count is preserved untouched.

const { requireAuth } = require('./_lib/auth');
const { readJsonBody } = require('./_lib/http');
const { getFile, putFile } = require('./_lib/github');
const { validateExcludedIps } = require('./_lib/validate');

const CONTENT_PATH = 'data/visits.json';
const VISITS_BRANCH = 'visits-data';

function getClientIp(req) {
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (xff) {
    const first = String(xff).split(',')[0].trim();
    if (first) return first;
  }
  const real = req.headers && req.headers['x-real-ip'];
  if (real) return String(real).trim();
  return (req.socket && req.socket.remoteAddress) || null;
}

async function loadVisits() {
  const file = await getFile(CONTENT_PATH, VISITS_BRANCH);
  if (!file) throw new Error(CONTENT_PATH + ' does not exist on the ' + VISITS_BRANCH + ' branch');
  let data;
  try {
    data = JSON.parse(file.content);
  } catch (e) {
    throw new Error(CONTENT_PATH + ' is not valid JSON');
  }
  if (!data || typeof data !== 'object') throw new Error(CONTENT_PATH + ' must contain a JSON object');
  if (typeof data.count !== 'number') data.count = 0;
  if (!Array.isArray(data.excludedIps)) data.excludedIps = [];
  return { data: data, sha: file.sha };
}

async function handleGet(req, res) {
  if (!requireAuth(req, res)) return;
  let loaded;
  try {
    loaded = await loadVisits();
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not load visit data from GitHub' });
  }
  return res.status(200).json({ count: loaded.data.count, excludedIps: loaded.data.excludedIps });
}

// Public - no auth. A real site visitor's browser calls this; it must
// never throw a scary error into their console or block page rendering
// (the caller uses a fire-and-forget fetch, see index.html).
async function handleTrack(req, res) {
  let loaded;
  try {
    loaded = await loadVisits();
  } catch (e) {
    console.error(e);
    return res.status(200).json({ ok: false });
  }

  const ip = getClientIp(req);
  if (ip && loaded.data.excludedIps.indexOf(ip) !== -1) {
    return res.status(200).json({ ok: true, counted: false });
  }

  const next = { count: loaded.data.count + 1, excludedIps: loaded.data.excludedIps };
  try {
    await putFile(CONTENT_PATH, JSON.stringify(next, null, 2) + '\n', 'Increment visit counter (auto)', loaded.sha, VISITS_BRANCH);
    return res.status(200).json({ ok: true, counted: true });
  } catch (e) {
    // Most likely a sha conflict from a near-simultaneous visit racing
    // this same write - losing an occasional count by 1 is fine for a
    // vanity/informational counter, so log and move on rather than
    // surfacing anything to the visitor.
    console.error(e);
    return res.status(200).json({ ok: false });
  }
}

async function handlePut(req, res) {
  if (!requireAuth(req, res)) return;
  const body = readJsonBody(req);
  if (body === null) return res.status(400).json({ error: 'Invalid JSON body' });

  const problems = validateExcludedIps(body);
  if (problems.length) return res.status(400).json({ error: 'Validation failed', problems: problems });

  let loaded;
  try {
    loaded = await loadVisits();
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not load visit data from GitHub' });
  }

  // Dedupe (trim + drop repeats) without reordering the admin's list.
  const seen = {};
  const cleaned = [];
  body.excludedIps.forEach(function (ip) {
    const trimmed = ip.trim();
    if (seen[trimmed]) return;
    seen[trimmed] = true;
    cleaned.push(trimmed);
  });

  const next = { count: loaded.data.count, excludedIps: cleaned };
  try {
    const result = await putFile(CONTENT_PATH, JSON.stringify(next, null, 2) + '\n', 'Update excluded IPs list (admin panel)', loaded.sha, VISITS_BRANCH);
    return res.status(200).json({ ok: true, excludedIps: cleaned, commitUrl: result.commitUrl });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save visit data to GitHub' });
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handleTrack(req, res);
  if (req.method === 'PUT') return handlePut(req, res);
  res.setHeader('Allow', 'GET, POST, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
};
