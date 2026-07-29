// Thin client for the Google Places API (New) - used only to pull the
// business's public Google reviews into content/reviews.json (see
// api/admin/sync-google-reviews.js). Read-only, called server-side only,
// so the API key never reaches the browser.
//
// Required environment variables (set in Vercel Project Settings -> Environment Variables):
//   GOOGLE_PLACES_API_KEY - an API key with "Places API (New)" enabled
//                           (Google Cloud Console -> APIs & Services).
//                           Restrict it to that API in the key settings.
//   GOOGLE_PLACE_ID       - the clinic's Place ID, e.g. "ChIJ..." (find it
//                           with Google's Place ID Finder tool). Do NOT
//                           include a "places/" prefix - that's added here.
//
// Endpoint reference: https://developers.google.com/maps/documentation/places/web-service/place-details
// Uses the platform's built-in fetch (Node 18+ / Vercel's Node runtime),
// no npm dependency required.

const PLACES_API = 'https://places.googleapis.com/v1';

function getConfig() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY environment variable is not set');
  if (!placeId) throw new Error('GOOGLE_PLACE_ID environment variable is not set');
  return { apiKey: apiKey, placeId: placeId };
}

// Google returns BCP-47 codes like "en-US" or "ru"; the site only needs a
// short 2-letter tag for the "shown in a different language" badge, and
// reviews can legitimately arrive in a language outside the site's own
// ru/en/ka set (e.g. a tourist writing in Turkish) - so this normalizes
// the tag shape without restricting to a fixed language list.
function normalizeLang(code) {
  if (!code || typeof code !== 'string') return 'en';
  const base = code.slice(0, 2).toLowerCase();
  return /^[a-z]{2}$/.test(base) ? base : 'en';
}

// Formats an RFC3339 publishTime as "MM.YYYY" - simple, unambiguous, and
// avoids needing per-language month-name formatting server-side.
function formatDate(publishTime) {
  if (!publishTime) return undefined;
  const d = new Date(publishTime);
  if (isNaN(d.getTime())) return undefined;
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return mm + '.' + d.getUTCFullYear();
}

// Maps one Google `Review` object (REST shape) onto this project's review
// record shape. Uses `originalText` (the reviewer's own words, untranslated)
// rather than `text` (Google's auto-translation) to match the site's
// "show reviews in the language they were actually written in" design.
// Returns null for a review with no usable text (skip it).
function normalizeReview(review) {
  // originalText and text are read as a matched pair (never mixed) - if
  // originalText exists but is blank, that's treated as "no usable text"
  // rather than falling back to text{}'s content, since text{} carries a
  // different languageCode and pairing translated text with originalText's
  // language tag would show a mislabeled review.
  const original = review.originalText || review.text || {};
  const text = (original.text || '').trim();
  if (!text) return null;

  const ratingRaw = typeof review.rating === 'number' ? review.rating : 0;
  const rating = Math.min(5, Math.max(1, Math.round(ratingRaw) || 1));

  const record = {
    author: (review.authorAttribution && review.authorAttribution.displayName) || 'Google',
    rating: rating,
    lang: normalizeLang(original.languageCode),
    text: text,
    source: 'Google'
  };
  const date = formatDate(review.publishTime);
  if (date) record.date = date;
  // Google's stable resource name for this review, e.g.
  // "places/{placeId}/reviews/{reviewId}" - used as a dedup key so
  // re-syncing never creates duplicate records.
  if (review.name) record.googleReviewId = review.name;
  return record;
}

// Fetches the place's reviews (Google returns at most 5, its own pick of
// "most relevant") and normalizes them. Throws on any non-2xx response;
// the thrown Error carries a `.status` (HTTP status code) so callers can
// give a more specific message (bad key, place not found, etc.).
async function fetchGoogleReviews() {
  const { apiKey, placeId } = getConfig();
  const res = await fetch(PLACES_API + '/places/' + encodeURIComponent(placeId), {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': apiKey,
      // displayName is included purely so the caller can show "matched:
      // <business name>" as a sanity check that GOOGLE_PLACE_ID points at
      // the right place - it's a cheap/basic field, bundling it alongside
      // reviews does not add a second charge for the call.
      'X-Goog-FieldMask': 'displayName,reviews'
    }
  });
  if (!res.ok) {
    let bodyText = '';
    try { bodyText = await res.text(); } catch (e) { /* ignore */ }
    const err = new Error('Google Places API request failed (' + res.status + '): ' + bodyText);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const rawReviews = Array.isArray(data.reviews) ? data.reviews : [];
  const reviews = rawReviews.map(normalizeReview).filter(Boolean);
  return {
    placeName: data.displayName && data.displayName.text,
    reviews: reviews
  };
}

module.exports = { fetchGoogleReviews, normalizeReview, normalizeLang, formatDate };
