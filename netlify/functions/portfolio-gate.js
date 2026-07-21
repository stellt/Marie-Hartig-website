const crypto = require('crypto');

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SECRET = process.env.PORTFOLIO_GATE_SECRET;
const ADMIN_PASSWORD = process.env.PORTFOLIO_ADMIN_PASSWORD || 'admin';

// Netlify Blobs for storing registrations
let blobs = null;
try {
  blobs = require('@netlify/blobs');
} catch {
  // Not available in this context
}

function toBase64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

function sign(payload) {
  const body = toBase64Url(Buffer.from(JSON.stringify(payload)));
  const sig = toBase64Url(crypto.createHmac('sha256', SECRET).update(body).digest());
  return `${body}.${sig}`;
}

function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expectedSig = toBase64Url(crypto.createHmac('sha256', SECRET).update(body).digest());

  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(fromBase64Url(body).toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  return payload;
}

async function trackRegistration(email) {
  try {
    const store = blobs.getBlobsClient();
    let registrations = [];
    try {
      const data = await store.get('portfolio-registrations', { type: 'json' });
      registrations = Array.isArray(data?.registrations) ? data.registrations : [];
    } catch {
      // File doesn't exist yet
    }

    const lowerEmail = email.toLowerCase();
    if (!registrations.some(r => r.email === lowerEmail)) {
      registrations.push({
        email: lowerEmail,
        registeredAt: new Date().toISOString(),
      });
      await store.set('portfolio-registrations', JSON.stringify({ registrations }, null, 2), {
        contentType: 'application/json',
      });
    }
  } catch (err) {
    console.log('Could not track registration:', err.message);
  }
}

async function getRegistrations(password) {
  if (password !== ADMIN_PASSWORD) {
    return { error: 'Unauthorized' };
  }

  try {
    const store = blobs.getBlobsClient();
    const data = await store.get('portfolio-registrations', { type: 'json' });
    return data || { registrations: [] };
  } catch {
    return { registrations: [] };
  }
}

exports.handler = async (event) => {
  if (!SECRET) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  // Admin endpoint to check registrations
  if (event.httpMethod === 'GET') {
    const password = event.queryStringParameters?.password || '';
    const data = await getRegistrations(password);
    if (data.error) {
      return { statusCode: 401, body: JSON.stringify(data) };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  let authorized = false;
  let registeredEmail = null;

  if (typeof body.token === 'string' && body.token.length > 0) {
    authorized = !!verify(body.token);
  } else if (body.register && typeof body.register.email === 'string' && typeof body.register.password === 'string') {
    authorized = true;
    registeredEmail = body.register.email;
  } else if (body.login && typeof body.login.email === 'string' && typeof body.login.password === 'string') {
    authorized = true;
  }

  if (!authorized) {
    return { statusCode: 200, body: JSON.stringify({ granted: false }) };
  }

  // Track registration
  if (registeredEmail) {
    await trackRegistration(registeredEmail);
  }

  const token = sign({ exp: Date.now() + TOKEN_TTL_MS });
  return { statusCode: 200, body: JSON.stringify({ granted: true, token }) };
};
