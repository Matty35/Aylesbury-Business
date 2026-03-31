// netlify/functions/submit-listing.js
// Receives a free listing form POST, appends it to data/listings.json
// via the GitHub Contents API, and triggers a Netlify rebuild.

const https = require('https');

// ── Helpers ────────────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function uniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function parseBody(body) {
  const out = {};
  new URLSearchParams(body).forEach((v, k) => { out[k] = v.trim(); });
  return out;
}

function githubRequest(method, path, payload, token) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : null;
    const req = https.request(
      {
        hostname: 'api.github.com',
        path,
        method,
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'AylesburyBusiness-Directory',
          'Content-Type': 'application/json',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Handler ────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const TOKEN  = process.env.GITHUB_TOKEN;
  const REPO   = process.env.GITHUB_REPO;
  const BRANCH = process.env.GITHUB_BRANCH || 'main';

  console.log('ENV CHECK — TOKEN set:', !!TOKEN, '| REPO:', REPO, '| BRANCH:', BRANCH);

  if (!TOKEN) {
    console.error('GITHUB_TOKEN env var not set');
    return redirect('/add-listing.html?error=config');
  }

  // Parse and validate
  const f = parseBody(event.body);

  // Honeypot — silently succeed if bot filled hidden field
  if (f._honey) {
    return redirect('/add-listing.html?sent=1');
  }

  const name = f['biz-name'];
  if (!name) {
    return { statusCode: 400, body: 'Business name is required' };
  }

  // Build listing object from form fields
  const listing = {
    id:               uniqueId(),
    name,
    slug:             slugify(name),
    category:         f['biz-category']    || '',
    subcategory:      f['biz-subcategory'] || '',
    tier:             'free',
    featured:         false,
    description:      f['biz-desc']        || '',
    shortDescription: f['biz-desc']
                        ? f['biz-desc'].slice(0, 160)
                        : `${name} based in Aylesbury.`,
    phone:            f['biz-phone']       || '',
    email:            f['biz-email']       || '',
    website:          f['biz-website']     || '',
    address: {
      street:  f['biz-street']   || '',
      town:    f['biz-town']     || 'Aylesbury',
      county:  'Buckinghamshire',
      postcode: f['biz-postcode'] || '',
    },
    logo:    null,
    photos:  [],
    social: {
      facebook:  f['biz-facebook']  || '',
      instagram: f['biz-instagram'] || '',
      tiktok:    f['biz-tiktok']    || '',
    },
    dateAdded:    new Date().toISOString().split('T')[0],
    tags:         [],
    _contactName:  f['biz-contact-name']  || '',
    _contactEmail: f['biz-contact-email'] || '',
  };

  try {
    // 1. Read current listings.json from GitHub
    const filePath = `/repos/${REPO}/contents/data/listings.json`;
    const get = await githubRequest('GET', `${filePath}?ref=${BRANCH}`, null, TOKEN);

    if (get.status !== 200) {
      console.error('Failed to read listings.json:', get.body);
      return redirect('/add-listing.html?error=read');
    }

    // 2. Decode, append, re-encode
    const currentJson  = Buffer.from(get.body.content, 'base64').toString('utf8');
    const listings     = JSON.parse(currentJson);
    listings.push(listing);
    const updatedContent = Buffer.from(
      JSON.stringify(listings, null, 2)
    ).toString('base64');

    // 3. Commit back to GitHub (triggers Netlify rebuild)
    const put = await githubRequest(
      'PUT',
      filePath,
      {
        message: `Add listing: ${name} (${listing.id})`,
        content: updatedContent,
        sha:     get.body.sha,
        branch:  BRANCH,
      },
      TOKEN
    );

    if (put.status !== 200 && put.status !== 201) {
      console.error('Failed to commit listing:', put.body);
      return redirect('/add-listing.html?error=save');
    }

    return redirect('/add-listing.html?sent=1');

  } catch (err) {
    console.error('Unexpected error:', err);
    return redirect('/add-listing.html?error=unexpected');
  }
};

function redirect(location) {
  return { statusCode: 302, headers: { Location: location }, body: '' };
}
