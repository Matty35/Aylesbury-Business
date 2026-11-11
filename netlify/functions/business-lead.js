// netlify/functions/business-lead.js
// Receives an enquiry from the lead capture form on a Premium business
// profile and emails it via the Resend API to the business's own email
// address (looked up server-side from listings.json) plus the directory
// inbox. If sending from the site's domain fails (domain not yet
// verified in Resend), it falls back to delivering to the directory
// inbox only, so no lead is ever lost.
//
// Required env var in Netlify dashboard:
//   RESEND_API_KEY

const https = require('https');

function parseBody(body) {
  const out = {};
  new URLSearchParams(body).forEach((v, k) => { out[k] = v.trim(); });
  return out;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function sendEmail(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: 'api.resend.com',
        path: '/emails',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method Not Allowed' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY env var not set');
    return json(500, { ok: false, error: 'config' });
  }

  const f = parseBody(event.body);

  // Honeypot — silently succeed if bot
  if (f._honey) return json(200, { ok: true });

  const bizName = f['biz-name'] || 'Unknown business';
  const bizSlug = f['biz-slug'] || '';
  const name    = f['name']     || 'Not provided';
  const phone   = f['phone']    || 'Not provided';
  const email   = f['email']    || 'Not provided';
  const message = f['message']  || 'Not provided';

  if (!f['name'] || (!f['phone'] && !f['email'])) {
    return json(400, { ok: false, error: 'Please provide your name and a phone number or email.' });
  }

  const e = { bizName: escapeHtml(bizName), name: escapeHtml(name), phone: escapeHtml(phone), email: escapeHtml(email), message: escapeHtml(message) };

  // Look up the business's own email address server-side from the live
  // listings data. Never trust an email address posted by the form —
  // that would let spammers use this function to email anyone.
  let bizEmail = '';
  try {
    const siteUrl = process.env.URL || 'https://www.aylesburybusiness.directory';
    const res = await fetch(`${siteUrl}/data/listings.json`);
    if (res.ok) {
      const listings = await res.json();
      const biz = listings.find(l => l.slug === bizSlug);
      if (biz && biz.email) bizEmail = biz.email;
    }
  } catch (err) {
    console.warn('Could not look up business email:', err.message);
  }

  const OWNER = 'aylesburybusiness@gmail.com';

  function buildBody(deliveredToBusiness) {
    const note = !deliveredToBusiness && bizEmail
      ? `<p style="margin-top:16px;padding:12px;background:#fef3c7;border-radius:6px;font-size:14px"><strong>⚠ This lead could not be delivered directly to ${escapeHtml(bizEmail)}</strong> — please forward it to them.</p>`
      : '';
    const html = `
      <h2>New Lead for ${e.bizName}</h2>
      <table cellpadding="8" style="border-collapse:collapse;font-family:sans-serif;font-size:15px">
        <tr><td><strong>Business</strong></td><td>${e.bizName}</td></tr>
        <tr><td><strong>Customer name</strong></td><td>${e.name}</td></tr>
        <tr><td><strong>Phone</strong></td><td>${e.phone}</td></tr>
        <tr><td><strong>Email</strong></td><td>${e.email}</td></tr>
        <tr><td><strong>Message</strong></td><td>${e.message}</td></tr>
      </table>
      ${note}
      <p style="margin-top:20px;color:#666;font-size:13px">Submitted via the lead capture form on www.aylesburybusiness.directory${bizSlug ? '/business.html?slug=' + escapeHtml(bizSlug) : ''}</p>
    `;
    const text = `New Lead for ${bizName}\n\nCustomer name: ${name}\nPhone: ${phone}\nEmail: ${email}\nMessage: ${message}\n`
      + (!deliveredToBusiness && bizEmail ? `\n⚠ This lead could not be delivered directly to ${bizEmail} — please forward it to them.\n` : '')
      + `\nSubmitted via the lead capture form on www.aylesburybusiness.directory`;
    return { html, text };
  }

  const subject = `New Lead: ${bizName} — from ${name}`;
  const replyTo = email !== 'Not provided' ? email : undefined;

  try {
    // First choice: send from the site's own domain to the business AND
    // the directory inbox. Works once aylesburybusiness.directory is
    // verified as a sending domain in Resend.
    if (bizEmail) {
      const body = buildBody(true);
      const r1 = await sendEmail(RESEND_API_KEY, {
        from: 'Aylesbury Business Directory <leads@aylesburybusiness.directory>',
        to: [bizEmail, OWNER],
        reply_to: replyTo,
        subject,
        html: body.html,
        text: body.text,
      });
      if (r1.status < 400) return json(200, { ok: true });
      console.warn('Domain send failed (is aylesburybusiness.directory verified in Resend?):', r1.body);
    }

    // Fallback: deliver to the directory inbox only, via Resend's test
    // sender, flagging that it needs forwarding to the business.
    const body = buildBody(false);
    const r2 = await sendEmail(RESEND_API_KEY, {
      from: 'Aylesbury Business <onboarding@resend.dev>',
      to: [OWNER],
      reply_to: replyTo,
      subject,
      html: body.html,
      text: body.text,
    });

    if (r2.status >= 400) {
      console.error('Resend error:', r2.body);
      return json(502, { ok: false, error: 'send' });
    }

    return json(200, { ok: true });

  } catch (err) {
    console.error('Unexpected error sending lead email:', err);
    return json(500, { ok: false, error: 'unexpected' });
  }
};
