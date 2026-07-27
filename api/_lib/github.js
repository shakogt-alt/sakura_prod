// Thin wrapper around the GitHub Contents API. This is how the admin panel
// "writes" content: every save becomes a real git commit on the repo,
// there is no database.
//
// Required environment variables (set in Vercel Project Settings -> Environment Variables):
//   GITHUB_TOKEN   - a GitHub personal access token with "repo" (contents
//                    read/write) scope on the target repository.
//   GITHUB_REPO    - "owner/repo", e.g. "shakogt-alt/sakura_prod"
//   GITHUB_BRANCH  - optional, defaults to "main"
//
// Uses the platform's built-in fetch (Node 18+ / Vercel's Node runtime),
// no npm dependency required.

const GITHUB_API = 'https://api.github.com';

function getConfig() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token) throw new Error('GITHUB_TOKEN environment variable is not set');
  if (!repo) throw new Error('GITHUB_REPO environment variable is not set (format: owner/repo)');
  return { token, repo, branch };
}

async function githubRequest(path, options) {
  const { token } = getConfig();
  options = options || {};
  const headers = Object.assign(
    {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'sakura-admin-panel'
    },
    options.headers || {}
  );
  return fetch(GITHUB_API + path, Object.assign({}, options, { headers }));
}

async function readErrorBody(res) {
  try {
    return await res.text();
  } catch (e) {
    return '(no response body)';
  }
}

// Returns { content: string (utf8), sha: string } for a text file,
// or null if the file does not exist.
async function getFile(filePath) {
  const { repo, branch } = getConfig();
  const res = await githubRequest(
    '/repos/' + repo + '/contents/' + filePath + '?ref=' + encodeURIComponent(branch),
    { method: 'GET' }
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error('GitHub getFile failed (' + res.status + '): ' + (await readErrorBody(res)));
  }
  const data = await res.json();
  if (Array.isArray(data)) {
    throw new Error('Expected a file at ' + filePath + ' but found a directory');
  }
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return { content: content, sha: data.sha };
}

// Creates or updates a text file. `sha` is required when updating an
// existing file (obtained from getFile) and must be omitted when creating
// a brand-new file.
async function putFile(filePath, contentStr, message, sha) {
  const { repo, branch } = getConfig();
  const body = {
    message: message,
    content: Buffer.from(contentStr, 'utf8').toString('base64'),
    branch: branch
  };
  if (sha) body.sha = sha;
  const res = await githubRequest('/repos/' + repo + '/contents/' + filePath, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error('GitHub putFile failed (' + res.status + '): ' + (await readErrorBody(res)));
  }
  const data = await res.json();
  return { sha: data.content.sha, commitUrl: data.commit && data.commit.html_url };
}

// Uploads a binary file (e.g. an image). `base64Data` must be raw
// base64-encoded bytes (no "data:image/...;base64," prefix).
async function putBinaryFile(filePath, base64Data, message, sha) {
  const { repo, branch } = getConfig();
  const body = { message: message, content: base64Data, branch: branch };
  if (sha) body.sha = sha;
  const res = await githubRequest('/repos/' + repo + '/contents/' + filePath, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    throw new Error('GitHub putBinaryFile failed (' + res.status + '): ' + (await readErrorBody(res)));
  }
  const data = await res.json();
  return { sha: data.content.sha, commitUrl: data.commit && data.commit.html_url };
}

async function deleteFile(filePath, message, sha) {
  const { repo, branch } = getConfig();
  const res = await githubRequest('/repos/' + repo + '/contents/' + filePath, {
    method: 'DELETE',
    body: JSON.stringify({ message: message, sha: sha, branch: branch })
  });
  if (!res.ok) {
    throw new Error('GitHub deleteFile failed (' + res.status + '): ' + (await readErrorBody(res)));
  }
  return true;
}

module.exports = { getFile, putFile, putBinaryFile, deleteFile };
