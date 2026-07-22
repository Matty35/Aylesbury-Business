// netlify/functions/check-config.js
// Diagnostic endpoint for the listing-submission pipeline.
// Visit /.netlify/functions/check-config in a browser to see which
// environment variables are set and whether the GitHub token can
// actually read the listings files. No secret values are ever shown.

const https = require('https');

function githubGet(path, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.github.com',
        path,
        method: 'GET',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'AylesburyBusiness-Directory',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

exports.handler = async () => {
  const TOKEN  = process.env.GITHUB_TOKEN;
  const REPO   = process.env.GITHUB_REPO;
  const BRANCH = process.env.GITHUB_BRANCH || 'main';

  const report = {
    checkedAt: new Date().toISOString(),
    env: {
      GITHUB_TOKEN:          TOKEN ? 'set' : 'MISSING',
      GITHUB_REPO:           REPO || 'MISSING',
      GITHUB_BRANCH:         process.env.GITHUB_BRANCH || 'MISSING (falls back to "main")',
      STRIPE_LINK_STANDARD:  process.env.STRIPE_LINK_STANDARD ? 'set' : 'MISSING',
      STRIPE_LINK_FEATURED:  process.env.STRIPE_LINK_FEATURED ? 'set' : 'MISSING',
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ? 'set' : 'MISSING',
    },
    githubReadTest: null,
    problems: [],
  };

  if (!TOKEN) report.problems.push('GITHUB_TOKEN is not set — no listing can be saved.');
  if (!REPO)  report.problems.push('GITHUB_REPO is not set — no listing can be saved.');
  if (!process.env.GITHUB_BRANCH) {
    report.problems.push('GITHUB_BRANCH is not set, so functions fall back to "main" — this repo has no "main" branch, so every read will 404.');
  }
  if (!process.env.STRIPE_LINK_STANDARD || !process.env.STRIPE_LINK_FEATURED) {
    report.problems.push('One or both Stripe payment link env vars are missing — paid (Standard/Featured) submissions fail before reaching Stripe.');
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    report.problems.push('STRIPE_WEBHOOK_SECRET is not set — paid listings would never be activated after payment.');
  }

  if (TOKEN && REPO) {
    try {
      const res = await githubGet(
        `/repos/${REPO}/contents/data/listings.json?ref=${encodeURIComponent(BRANCH)}`,
        TOKEN
      );
      const hints = {
        200: 'OK — GitHub access is working.',
        401: 'GITHUB_TOKEN is invalid or has EXPIRED. Generate a new token (with Contents read & write on this repo), update the env var in Netlify, then trigger a redeploy.',
        403: 'Token is valid but lacks permission (needs Contents: read & write on this repo), or the request was rate-limited.',
        404: 'Repo, branch or file not found. Check GITHUB_REPO is "owner/repo" and GITHUB_BRANCH matches an existing branch — this repo has no "main" branch.',
      };
      report.githubReadTest = {
        status: res.status,
        ok: res.status === 200,
        hint: hints[res.status] || `Unexpected status ${res.status}.`,
      };
      if (res.status !== 200) {
        report.problems.push(`GitHub read test failed with status ${res.status}: ${report.githubReadTest.hint}`);
      }
    } catch (err) {
      report.githubReadTest = { ok: false, hint: `Network error: ${err.message}` };
      report.problems.push('Could not reach the GitHub API from the function.');
    }
  }

  if (report.problems.length === 0) {
    report.problems.push('None found — the listing pipeline configuration looks healthy.');
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report, null, 2),
  };
};
