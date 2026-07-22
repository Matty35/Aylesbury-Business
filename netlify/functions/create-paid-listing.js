// netlify/functions/create-paid-listing.js
// Receives a paid (Standard/Featured) listing form POST.
// Saves the listing as pending in data/pending-listings.json via GitHub API,
// then redirects to the appropriate Stripe Payment Link with ?client_reference_id
// so the stripe-webhook function can activate it after payment.

const https = require('https');

// Stripe Payment Links are stored in Netlify environment variables:
// STRIPE_LINK_STANDARD and STRIPE_LINK_FEATURED
// Set these in Netlify dashboard → Site configuration → Environment variables

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

async function readJsonFile(filePath, token) {
  const res = await githubRequest('GET', filePath, null, token);
  if (res.status !== 200) throw new Error(`Failed to read ${filePath}: ${res.status}`);
  const content = Buffer.from(res.body.content, 'base64').toString('utf8');
  return { data: JSON.parse(content), sha: res.body.sha };
}

async function writeJsonFile(filePath, data, sha, message, branch, token) {
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  const res = await githubRequest('PUT', filePath, { message, content, sha, branch }, token);
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Failed to write ${filePath}: ${res.status}`);
  }
  return res;
}

// ── Handler ────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const TOKEN  = process.env.GITHUB_TOKEN;
  const REPO   = process.env.GITHUB_REPO;
  const BRANCH = process.env.GITHUB_BRANCH || 'main';
  const STRIPE_LINKS = {
    standard: process.env.STRIPE_LINK_STANDARD,
    featured:  process.env.STRIPE_LINK_FEATURED,
  };

  if (!TOKEN || !REPO) {
    console.error('GITHUB_TOKEN and/or GITHUB_REPO not set');
    return redirect('/add-listing.html?error=config');
  }

  const f = parseBody(event.body);

  // Honeypot
  if (f._honey) return redirect('/add-listing.html?sent=1');

  const tier = f['tier'];
  if (tier !== 'standard' && tier !== 'featured') {
    return redirect('/add-listing.html?error=tier');
  }
  if (!STRIPE_LINKS[tier]) {
    console.error(`Stripe payment link env var not set for tier "${tier}" (STRIPE_LINK_${tier.toUpperCase()})`);
    return redirect('/add-listing.html?error=config');
  }

  const name = f['biz-name'];
  if (!name) return redirect('/add-listing.html?error=name');

  const id = uniqueId();

  const listing = {
    id,
    name,
    slug:             slugify(name),
    category:         f['biz-category']    || '',
    subcategory:      f['biz-subcategory'] || '',
    tier,
    featured:         tier === 'featured',
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
    dateAdded:     new Date().toISOString().split('T')[0],
    tags:          [],
    _contactName:  f['biz-contact-name']  || '',
    _contactEmail: f['biz-contact-email'] || '',
    _status:       'pending_payment',
  };

  try {
    const pendingPath = `/repos/${REPO}/contents/data/pending-listings.json`;
    const { data: pending, sha } = await readJsonFile(`${pendingPath}?ref=${BRANCH}`, TOKEN);

    pending.push(listing);

    await writeJsonFile(
      pendingPath,
      pending,
      sha,
      `Pending listing: ${name} (${id})`,
      BRANCH,
      TOKEN
    );

    // Redirect to Stripe with client_reference_id so the webhook can identify this listing
    const stripeUrl = `${STRIPE_LINKS[tier]}?client_reference_id=${id}`;
    return redirect(stripeUrl);

  } catch (err) {
    console.error('Error saving pending listing:', err.message || err);
    return redirect('/add-listing.html?error=save');
  }
};

function redirect(location) {
  return { statusCode: 302, headers: { Location: location }, body: '' };
}
