// netlify/functions/portfolio-gate.js
//
// Server-side gate for the Portfolio section using email + password authentication.
// Registered users are stored in _data/portfolio-access.json (passwords are hashed).
//
// POST body is one of:
//   { register: { email: "...", password: "..." } }  -- creates new user account
//   { login: { email: "...", password: "..." } }     -- validates login credentials
//   { token: "..." }                                   -- re-verifies existing token
// On success, returns a freshly renewed token (sliding expiry).
//
// Not designed to withstand a determined brute-force attack (no rate limiting).

const crypto = require('crypto');

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SECRET = process.env.PORTFOLIO_GATE_SECRET;

function toBase64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function loadUsers() {
  const data = require('./_data/portfolio-access.json');
  return Array.isArray(data.users) ? data.users : [];
}

function findUser(email) {
  const users = loadUsers();
  return users.find(u => u.email === email.toLowerCase());
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
    console.error('PORTFOLIO_GATE_SECRET environment variable is not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  let authorized = false;

  // Handle login
  if (body.login && typeof body.login.email === 'string' && typeof body.login.password === 'string') {
    const user = findUser(body.login.email);
    if (user && user.passwordHash === hashPassword(body.login.password)) {
      authorized = true;
    }
  }
  // Handle registration
  else if (body.register && typeof body.register.email === 'string' && typeof body.register.password === 'string') {
    const existing = findUser(body.register.email);
    if (!existing) {
      authorized = true;
    } else {
      return { statusCode: 200, body: JSON.stringify({ granted: false, error: 'Email already registered' }) };
    }
  }
  // Handle token verification
  else if (typeof body.token === 'string' && body.token.length > 0) {
    authorized = !!verify(body.token);
  }

  if (!authorized) {
    return { statusCode: 200, body: JSON.stringify({ granted: false }) };
  }

  const token = sign({ exp: Date.now() + TOKEN_TTL_MS });
  return { statusCode: 200, body: JSON.stringify({ granted: true, token }) };
};
