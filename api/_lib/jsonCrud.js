// Shared helpers for the admin CRUD endpoints (team/blog/prices), which
// all follow the same pattern: an array-of-objects JSON file in content/,
// each object identified by a unique `id`, edited via the GitHub Contents
// API so every save is a real commit.

const crypto = require('crypto');
const { getFile, putFile } = require('./github');

// Generates a short, opaque, URL/DOM-id-safe identifier. Content is
// typically entered in Russian/Georgian, so a readable slug isn't
// practical - these ids are internal only and never shown to visitors.
function genId(prefix) {
  return prefix + '-' + crypto.randomBytes(4).toString('hex');
}

// Loads a JSON array file from the repo. Throws if missing or malformed.
async function loadCollection(path) {
  const file = await getFile(path);
  if (!file) {
    throw new Error('Content file not found in repo: ' + path);
  }
  let data;
  try {
    data = JSON.parse(file.content);
  } catch (e) {
    throw new Error('Content file is not valid JSON: ' + path);
  }
  if (!Array.isArray(data)) {
    throw new Error('Expected a JSON array in ' + path);
  }
  return { data: data, sha: file.sha };
}

// Writes the (possibly modified) array back, pretty-printed to match the
// existing formatting style, committing with the given message.
async function saveCollection(path, data, sha, message) {
  const content = JSON.stringify(data, null, 2) + '\n';
  return putFile(path, content, message, sha);
}

module.exports = { genId, loadCollection, saveCollection };
