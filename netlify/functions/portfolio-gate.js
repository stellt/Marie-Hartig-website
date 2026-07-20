// netlify/functions/portfolio-gate.js
//
// Server-side gate for the Portfolio section. The approved password list
// lives in _data/portfolio-access.json, bundled with this function -- it is
// never served as a static file (see netlify.toml's redirect blocking
// /netlify/functions/*), so the browser never sees the password list itself.
//
// POST body is one of:
//   { password: "..." }  -- checked against the approved list
//   { token: "..." }     -- a previously-issued token, re-verified here
// Either way, on success this returns a freshly renewed token (sliding
// expiry) so a returning visitor's browser can stay "logged in" by proving
// it holds a signature only this function's secret could have produced,
// without ever needing to see the password list again.
//
// Not designed to withstand a determined, sustained brute-force attack
// (there's no rate limiting) -- this is a proportionate gate for a small
// portfolio site, not a bank vault.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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

function loadApproved() {
  const file = path.join(__dirname, '_data', 'portfolio-access.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(data.approved) ? data.approved : [];
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

  if (typeof body.password === 'string' && body.password.trim().length > 0) {
    const submitted = body.password.trim();
    const approved = loadApproved();
    authorized = approved.some((entry) => entry.password === submitted);
  } else if (typeof body.token === 'string' && body.token.length > 0) {
    authorized = !!verify(body.token);
  }

  if (!authorized) {
    return { statusCode: 200, body: JSON.stringify({ granted: false }) };
  }

  const token = sign({ exp: Date.now() + TOKEN_TTL_MS });
  return { statusCode: 200, body: JSON.stringify({ granted: true, token }) };
};
