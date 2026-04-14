// netlify/functions/electrician-quote-request.js
// Receives the electrician quote request form POST,
// sends an email notification to aylesburybusiness@gmail.com via Resend API,
// then redirects back to the page with a success param.
//
// Required env var in Netlify dashboard:
//   RESEND_API_KEY  — get a free key at https://resend.com

const https = require('https');

function parseBody(body) {
  const out = {};
  new URLSearchParams(body).forEach((v, k) => { out[k] = v.trim(); });
  return out;
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY env var not set');
    return { statusCode: 302, headers: { Location: '/electricians-aylesbury?error=config' }, body: '' };
  }

  const f = parseBody(event.body);

  // Honeypot — silently succeed if bot
  if (f._honey) {
    return { statusCode: 302, headers: { Location: '/electricians-aylesbury?sent=1' }, body: '' };
  }

  const name     = f['name']     || 'Not provided';
  const phone    = f['phone']    || 'Not provided';
  const email    = f['email']    || 'Not provided';
  const postcode = f['postcode'] || 'Not provided';
  const job      = f['job']      || 'Not provided';

  const html = `
    <h2>New Electrician Quote Request</h2>
    <table cellpadding="8" style="border-collapse:collapse;font-family:sans-serif;font-size:15px">
      <tr><td><strong>Name</strong></td><td>${name}</td></tr>
      <tr><td><strong>Phone</strong></td><td>${phone}</td></tr>
      <tr><td><strong>Email</strong></td><td>${email}</td></tr>
      <tr><td><strong>Postcode</strong></td><td>${postcode}</td></tr>
      <tr><td><strong>Job description</strong></td><td>${job}</td></tr>
    </table>
    <p style="margin-top:20px;color:#666;font-size:13px">Submitted via aylesburybusiness.co.uk/electricians-aylesbury</p>
  `;

  const text = `New Electrician Quote Request\n\nName: ${name}\nPhone: ${phone}\nEmail: ${email}\nPostcode: ${postcode}\nJob: ${job}\n\nSubmitted via aylesburybusiness.co.uk/electricians-aylesbury`;

  try {
    const result = await sendEmail(RESEND_API_KEY, {
      from: 'Aylesbury Business <onboarding@resend.dev>',
      to: ['aylesburybusiness@gmail.com'],
      reply_to: email !== 'Not provided' ? email : undefined,
      subject: `Quote Request: Electrician in Aylesbury — ${name}`,
      html,
      text,
    });

    if (result.status >= 400) {
      console.error('Resend error:', result.body);
      return { statusCode: 302, headers: { Location: '/electricians-aylesbury?error=send' }, body: '' };
    }

    return { statusCode: 302, headers: { Location: '/electricians-aylesbury?sent=1' }, body: '' };

  } catch (err) {
    console.error('Unexpected error sending email:', err);
    return { statusCode: 302, headers: { Location: '/electricians-aylesbury?error=unexpected' }, body: '' };
  }
};
