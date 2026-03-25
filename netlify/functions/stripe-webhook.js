// netlify/functions/stripe-webhook.js
// Listens for Stripe checkout.session.completed events.
// Finds the matching pending listing via client_reference_id,
// moves it to listings.json, and removes it from pending-listings.json.

const https  = require('https');
const crypto = require('crypto');

// ── Stripe signature verification (no npm needed) ─────────────────────────

function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader) return false;
  const parts     = sigHeader.split(',');
  const tPart     = parts.find((p) => p.startsWith('t='));
  const v1Parts   = parts.filter((p) => p.startsWith('v1='));
  if (!tPart || !v1Parts.length) return false;

  const timestamp  = tPart.slice(2);
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected   = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  return v1Parts.some((p) => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(p.slice(3), 'hex'),
        Buffer.from(expected, 'hex')
      );
    } catch { return false; }
  });
}

// ── GitHub helpers (shared pattern with other functions) ──────────────────

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

async function readJsonFile(path, token) {
  const res = await githubRequest('GET', path, null, token);
  if (res.status !== 200) throw new Error(`Failed to read ${path}: ${res.status}`);
  const content = Buffer.from(res.body.content, 'base64').toString('utf8');
  return { data: JSON.parse(content), sha: res.body.sha };
}

async function writeJsonFile(path, data, sha, message, branch, token) {
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  const res = await githubRequest('PUT', path, { message, content, sha, branch }, token);
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Failed to write ${path}: ${res.status}`);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const TOKEN          = process.env.GITHUB_TOKEN;
  const REPO           = process.env.GITHUB_REPO;
  const BRANCH         = process.env.GITHUB_BRANCH || 'main';

  if (!WEBHOOK_SECRET || !TOKEN) {
    console.error('Missing STRIPE_WEBHOOK_SECRET or GITHUB_TOKEN');
    return { statusCode: 500, body: 'Server configuration error' };
  }

  // Verify Stripe signature
  const sigHeader = event.headers['stripe-signature'];
  if (!verifyStripeSignature(event.body, sigHeader, WEBHOOK_SECRET)) {
    console.error('Invalid Stripe signature');
    return { statusCode: 400, body: 'Invalid signature' };
  }

  let stripeEvent;
  try {
    stripeEvent = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // Only act on completed checkouts
  if (stripeEvent.type !== 'checkout.session.completed') {
    return { statusCode: 200, body: 'Ignored' };
  }

  const session   = stripeEvent.data.object;
  const listingId = session.client_reference_id;

  if (!listingId) {
    console.warn('checkout.session.completed with no client_reference_id — skipped');
    return { statusCode: 200, body: 'No listing ID' };
  }

  try {
    const pendingPath  = `/repos/${REPO}/contents/data/pending-listings.json?ref=${BRANCH}`;
    const listingsPath = `/repos/${REPO}/contents/data/listings.json?ref=${BRANCH}`;

    // Read both files in parallel
    const [pendingResult, listingsResult] = await Promise.all([
      readJsonFile(pendingPath, TOKEN),
      readJsonFile(listingsPath, TOKEN),
    ]);

    const pending  = pendingResult.data;
    const listings = listingsResult.data;

    const idx = pending.findIndex((l) => l.id === listingId);
    if (idx === -1) {
      console.warn(`Listing ${listingId} not found in pending-listings.json`);
      return { statusCode: 200, body: 'Listing not found in pending' };
    }

    // Remove internal fields, mark as active
    const listing = { ...pending[idx] };
    delete listing._status;
    delete listing._contactName;
    delete listing._contactEmail;

    // Move: remove from pending, add to live listings
    const updatedPending  = pending.filter((_, i) => i !== idx);
    const updatedListings = [...listings, listing];

    // Commit both files (sequential to avoid SHA conflicts)
    await writeJsonFile(
      `/repos/${REPO}/contents/data/pending-listings.json`,
      updatedPending,
      pendingResult.sha,
      `Activate listing: ${listing.name} (${listingId})`,
      BRANCH,
      TOKEN
    );

    // Re-read listings SHA after first commit in case of concurrent writes
    const freshListings = await readJsonFile(
      `/repos/${REPO}/contents/data/listings.json?ref=${BRANCH}`,
      TOKEN
    );
    const mergedListings = [...freshListings.data, listing];

    await writeJsonFile(
      `/repos/${REPO}/contents/data/listings.json`,
      mergedListings,
      freshListings.sha,
      `Publish listing: ${listing.name} (${listingId})`,
      BRANCH,
      TOKEN
    );

    console.log(`Published listing: ${listing.name} (${listingId})`);
    return { statusCode: 200, body: 'Listing published' };

  } catch (err) {
    console.error('Error publishing listing:', err);
    return { statusCode: 500, body: 'Error publishing listing' };
  }
};
