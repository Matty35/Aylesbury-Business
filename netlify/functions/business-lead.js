// netlify/functions/business-lead.js
// Receives an enquiry from the lead capture form on a Premium business
// profile and emails it via the Resend API. Leads are delivered to the
// directory inbox (and the business is named in the subject) so they can
// be passed straight on — Resend's test sender can only deliver to the
// account owner's inbox until a sending domain is verified.
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

  const html = `
    <h2>New Lead for ${e.bizName}</h2>
    <table cellpadding="8" style="border-collapse:collapse;font-family:sans-serif;font-size:15px">
      <tr><td><strong>Business</strong></td><td>${e.bizName}</td></tr>
      <tr><td><strong>Customer name</strong></td><td>${e.name}</td></tr>
      <tr><td><strong>Phone</strong></td><td>${e.phone}</td></tr>
      <tr><td><strong>Email</strong></td><td>${e.email}</td></tr>
      <tr><td><strong>Message</strong></td><td>${e.message}</td></tr>
    </table>
    <p style="margin-top:20px;color:#666;font-size:13px">Submitted via the lead capture form on www.aylesburybusiness.directory${bizSlug ? '/business.html?slug=' + escapeHtml(bizSlug) : ''}</p>
  `;

  const text = `New Lead for ${bizName}\n\nCustomer name: ${name}\nPhone: ${phone}\nEmail: ${email}\nMessage: ${message}\n\nSubmitted via the lead capture form on www.aylesburybusiness.directory`;

  try {
    const result = await sendEmail(RESEND_API_KEY, {
      from: 'Aylesbury Business <onboarding@resend.dev>',
      to: ['aylesburybusiness@gmail.com'],
      reply_to: email !== 'Not provided' ? email : undefined,
      subject: `New Lead: ${bizName} — from ${name}`,
      html,
      text,
    });

    if (result.status >= 400) {
      console.error('Resend error:', result.body);
      return json(502, { ok: false, error: 'send' });
    }

    return json(200, { ok: true });

  } catch (err) {
    console.error('Unexpected error sending lead email:', err);
    return json(500, { ok: false, error: 'unexpected' });
  }
};
