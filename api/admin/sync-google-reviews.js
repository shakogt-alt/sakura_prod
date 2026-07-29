// POST /api/admin/sync-google-reviews
//
// Pulls the business's Google reviews (via the Places API "New") into the
// same content/reviews.json collection used by the manual review form, so
// the existing edit/delete UI in the admin Reviews tab works on
// Google-sourced reviews with no extra code. Google returns at most 5
// reviews per call (its own "most relevant" pick), so the way to build up
// a larger set over time is simply clicking sync again later as Google's
// picks shift - already-synced reviews are skipped, never duplicated.
//
// Safe to click repeatedly: each Google review carries a stable
// `googleReviewId` (Google's resource name for that review), used to skip
// ones already synced. This does NOT update a review's text/rating if the
// reviewer edited it on Google after the first sync - delete + re-sync to
// refresh a specific one.
//
// Requires GOOGLE_PLACES_API_KEY and GOOGLE_PLACE_ID env vars (see
// ADMIN_SETUP.md) and a valid admin session cookie.

const { requireAuth } = require('../_lib/auth');
const { genId, loadCollection, saveCollection } = require('../_lib/jsonCrud');
const { validateReview } = require('../_lib/validate');
const { fetchGoogleReviews } = require('../_lib/google');

const CONTENT_PATH = 'content/reviews.json';

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let fetched;
  try {
    fetched = await fetchGoogleReviews();
  } catch (e) {
    console.error(e);
    let message = 'Не удалось получить отзывы от Google.';
    if (e.message && e.message.indexOf('environment variable') !== -1) {
      message = e.message;
    } else if (e.status === 401 || e.status === 403) {
      message = 'Google отклонил запрос. Проверьте GOOGLE_PLACES_API_KEY, что Places API (New) включён и что для проекта Google Cloud настроен биллинг.';
    } else if (e.status === 404) {
      message = 'Место не найдено - проверьте GOOGLE_PLACE_ID.';
    }
    return res.status(502).json({ error: message });
  }

  let collection;
  try {
    collection = await loadCollection(CONTENT_PATH);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not load reviews.json from GitHub' });
  }

  const existingIds = {};
  collection.data.forEach(function (r) {
    if (r.googleReviewId) existingIds[r.googleReviewId] = true;
  });

  const added = [];
  fetched.reviews.forEach(function (r) {
    if (existingIds[r.googleReviewId]) return;
    // Defensive re-validation: normalizeReview() should always produce a
    // valid record, but never trust an external API's response shape
    // enough to skip the same check every other write path goes through.
    if (validateReview(r).length) return;
    const record = Object.assign({ id: genId('review') }, r);
    collection.data.push(record);
    added.push(record);
  });

  const skipped = fetched.reviews.length - added.length;

  if (added.length === 0) {
    return res.status(200).json({
      ok: true,
      added: 0,
      skipped: skipped,
      total: collection.data.length,
      placeName: fetched.placeName
    });
  }

  try {
    const result = await saveCollection(
      CONTENT_PATH,
      collection.data,
      collection.sha,
      'Sync ' + added.length + ' review(s) from Google (admin panel)'
    );
    return res.status(200).json({
      ok: true,
      added: added.length,
      skipped: skipped,
      total: collection.data.length,
      placeName: fetched.placeName,
      commitUrl: result.commitUrl,
      newReviews: added
    });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not save reviews.json to GitHub' });
  }
};
