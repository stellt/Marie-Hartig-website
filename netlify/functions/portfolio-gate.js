const crypto = require('crypto');

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SECRET = process.env.PORTFOLIO_GATE_SECRET;

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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  if (!SECRET) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  let authorized = false;

  if (typeof body.token === 'string' && body.token.length > 0) {
    authorized = !!verify(body.token);
  } else if (body.register && typeof body.register.email === 'string' && typeof body.register.password === 'string') {
    authorized = true;
  } else if (body.login && typeof body.login.email === 'string' && typeof body.login.password === 'string') {
    authorized = true;
  }

  if (!authorized) {
    return { statusCode: 200, body: JSON.stringify({ granted: false }) };
  }

  const token = sign({ exp: Date.now() + TOKEN_TTL_MS });
  return { statusCode: 200, body: JSON.stringify({ granted: true, token }) };
};
