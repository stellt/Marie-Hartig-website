// netlify/functions/stripe-webhook.js
//
// Listens for Stripe events and verifies the signature so you know the event
// genuinely came from Stripe.
//
// When an order is actually PAID it sends two emails (through Resend):
//   1. The PRINTER gets the print job only -- what to print, size, mirrored or
//      not, quantity, artwork link. No customer name/address/contact details:
//      Marie ships the orders herself, so the printer doesn't need them.
//   2. MARIE gets the full order -- the same items plus totals, the customer's
//      details and the shipping address, so she can pack and ship it.
//
// Netlify environment variables:
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET   (already set)
//   RESEND_API_KEY     Resend API key (resend.com)
//   PRINTER_EMAIL      where print jobs go (comma-separate for several)
//   OWNER_EMAIL        Marie's address for the full order (comma-separate for several)
//   ORDER_EMAIL_FROM   optional sender, e.g. "Marie's Painted Worlds <orders@mariespaintedworlds.com>"
//                      (the domain must be verified in Resend)
// Until RESEND_API_KEY and at least one recipient are set, orders are logged
// but not emailed (a loud warning shows in the function logs).

const https = require('https');
const Stripe = require('stripe');

const SITE_URL = 'https://www.mariespaintedworlds.com';
const DEFAULT_FROM = "Marie's Painted Worlds <orders@mariespaintedworlds.com>";

// ---------- small helpers ----------

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function money(cents, currency) {
  const n = (Number(cents) || 0) / 100;
  const cur = String(currency || 'eur').toUpperCase();
  return (cur === 'EUR' ? '€' : cur + ' ') + n.toFixed(2);
}

function splitEmails(v) {
  return String(v || '').split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
}

function artworkUrl(p) {
  if (!p) return '';
  return SITE_URL + encodeURI(String(p).startsWith('/') ? p : '/' + p);
}

function fmtDate(unixSeconds) {
  const d = new Date((Number(unixSeconds) || Date.now() / 1000) * 1000);
  try {
    return d.toLocaleString('en-GB', { timeZone: 'Europe/Vienna', dateStyle: 'medium', timeStyle: 'short' }) + ' (Vienna time)';
  } catch (e) {
    return d.toISOString();
  }
}

// The order reference shown in both emails, so the printer's job and Marie's
// order can always be matched up.
function orderRef(session) {
  return 'MHS-' + String(session.id || '').slice(-8).toUpperCase();
}

// ---------- reading the order out of Stripe ----------

// One purchased line, using the structured details attached at checkout
// (create-checkout-session.js puts them on each line item's product metadata).
function describeItem(li) {
  const product = (li.price && typeof li.price.product === 'object' && li.price.product) || {};
  const m = product.metadata || {};
  return {
    type: m.type || '',
    design: m.design || li.description || product.name || 'Item',
    format: m.format || '',
    size: m.size || '',
    orientation: m.orientation || '',
    image: artworkUrl(m.image),
    quantity: li.quantity || 1,
    boughtAs: li.description || product.name || '',
    unitAmount: li.price && li.price.unit_amount,
    lineTotal: li.amount_total,
    currency: li.currency,
  };
}

async function loadOrder(stripe, session) {
  // Re-fetch the full session (with the shipping rate's name expanded). If
  // that fails for any reason, the event's own copy is good enough.
  let full = session;
  try {
    full = await stripe.checkout.sessions.retrieve(session.id, { expand: ['shipping_cost.shipping_rate'] });
  } catch (err) {
    console.warn('Could not re-fetch full session, using the event copy:', err.message);
  }
  // If this throws, the webhook returns 500 and Stripe retries the event.
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100, expand: ['data.price.product'] });
  return { full, items: lineItems.data.map(describeItem) };
}

// ---------- email content ----------

function specLines(it) {
  const lines = [];
  if (it.format) lines.push(['Product', it.format]);
  if (it.type === 'wall_tattoo') {
    lines.push(['Size', it.size || 'not specified - please check with Marie']);
    lines.push(['Orientation', it.orientation === 'Mirrored' ? 'MIRRORED - flip the artwork left/right' : 'Standard (as shown on the site)']);
  }
  lines.push(['Quantity', String(it.quantity)]);
  if (it.image) lines.push(['Artwork', it.image]);
  return lines;
}

function itemBlockText(it, i, withPrices) {
  const out = [`${i + 1}. ${it.design}`];
  specLines(it).forEach(([k, v]) => out.push(`   ${k}: ${v}`));
  if (withPrices) {
    out.push(`   Price: ${money(it.unitAmount, it.currency)} each = ${money(it.lineTotal, it.currency)}`);
    if (it.boughtAs && it.boughtAs !== it.design) out.push(`   Bought as: ${it.boughtAs}`);
  }
  return out.join('\n');
}

function itemBlockHtml(it, i, withPrices) {
  const rows = specLines(it).map(([k, v]) => {
    const val = k === 'Artwork' ? `<a href="${esc(v)}">${esc(v)}</a>` : esc(v);
    return `<tr><td style="padding:1px 12px 1px 0;color:#777">${esc(k)}</td><td style="padding:1px 0">${val}</td></tr>`;
  }).join('');
  const price = withPrices
    ? `<tr><td style="padding:1px 12px 1px 0;color:#777">Price</td><td style="padding:1px 0">${esc(money(it.unitAmount, it.currency))} each = <strong>${esc(money(it.lineTotal, it.currency))}</strong></td></tr>`
    : '';
  const boughtAs = withPrices && it.boughtAs && it.boughtAs !== it.design
    ? `<tr><td style="padding:1px 12px 1px 0;color:#777">Bought as</td><td style="padding:1px 0">${esc(it.boughtAs)}</td></tr>` : '';
  return `<div style="padding:12px 0;border-bottom:1px solid #eee"><div style="font-size:16px;font-weight:bold;margin-bottom:4px">${i + 1}. ${esc(it.design)}</div><table style="border-collapse:collapse;font-size:14px">${rows}${price}${boughtAs}</table></div>`;
}

function shell(title, inner) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:640px;line-height:1.4"><h2 style="margin:0 0 12px">${esc(title)}</h2>${inner}</div>`;
}

function totalQty(items) {
  return items.reduce((n, it) => n + (Number(it.quantity) || 0), 0);
}

function buildPrinterEmail(ref, session, items) {
  const n = totalQty(items);
  const subject = `New print order ${ref} - ${n} item${n === 1 ? '' : 's'}`;
  const when = fmtDate(session.created);
  const text = [
    `New order ${ref}`,
    `Paid: ${when}`,
    '',
    'Please print:',
    '',
    items.map((it, i) => itemBlockText(it, i, false)).join('\n\n'),
    '',
    'Sent automatically once payment is confirmed. Reply to this email to reach Marie.',
  ].join('\n');
  const html = shell(`New order ${ref}`,
    `<p style="margin:0 0 12px;color:#555">Paid: ${esc(when)}</p><p style="margin:0 0 4px"><strong>Please print:</strong></p>` +
    items.map((it, i) => itemBlockHtml(it, i, false)).join('') +
    `<p style="margin:16px 0 0;color:#777;font-size:13px">Sent automatically once payment is confirmed. Reply to this email to reach Marie.</p>`);
  return { subject, text, html };
}

function formatAddress(ship) {
  if (!ship) return null;
  const a = ship.address || {};
  const lines = [ship.name, a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' '), a.state, a.country].filter(Boolean);
  return lines.length ? lines : null;
}

function buildOwnerEmail(ref, full, items, ship, rateName) {
  const n = totalQty(items);
  const cur = full.currency;
  const total = money(full.amount_total, cur);
  const subject = `New order ${ref} - ${total} - ${n} item${n === 1 ? '' : 's'}`;
  const when = fmtDate(full.created);
  const shipCents = full.total_details && full.total_details.amount_shipping != null
    ? full.total_details.amount_shipping
    : (full.shipping_cost && full.shipping_cost.amount_total);
  const customer = full.customer_details || {};
  const addr = formatAddress(ship);
  const dashboard = full.payment_intent && typeof full.payment_intent === 'string'
    ? `https://dashboard.stripe.com/payments/${full.payment_intent}` : '';

  const textParts = [
    `New order ${ref}`,
    `Paid: ${when}`,
    '',
    'WHAT WAS ORDERED',
    items.map((it, i) => itemBlockText(it, i, true)).join('\n\n'),
    '',
    `Items: ${money(full.amount_subtotal, cur)}`,
    `${rateName || 'Shipping'}: ${money(shipCents, cur)}`,
    `TOTAL PAID: ${total}`,
    '',
    'CUSTOMER',
    `${customer.name || '(no name)'}`,
    `${customer.email || '(no email)'}`,
    customer.phone ? customer.phone : null,
    '',
    'SHIP TO',
    addr ? addr.join('\n') : '(no shipping address collected)',
    '',
    'The printer has been emailed the print job separately (no customer details are sent to them).',
    dashboard ? `Stripe: ${dashboard}` : null,
  ].filter(l => l !== null);

  const html = shell(`New order ${ref}`,
    `<p style="margin:0 0 12px;color:#555">Paid: ${esc(when)}</p>` +
    `<p style="margin:0 0 4px"><strong>What was ordered</strong></p>` +
    items.map((it, i) => itemBlockHtml(it, i, true)).join('') +
    `<table style="border-collapse:collapse;font-size:14px;margin:12px 0"><tr><td style="padding:2px 16px 2px 0;color:#777">Items</td><td>${esc(money(full.amount_subtotal, cur))}</td></tr>` +
    `<tr><td style="padding:2px 16px 2px 0;color:#777">${esc(rateName || 'Shipping')}</td><td>${esc(money(shipCents, cur))}</td></tr>` +
    `<tr><td style="padding:2px 16px 2px 0"><strong>Total paid</strong></td><td><strong>${esc(total)}</strong></td></tr></table>` +
    `<p style="margin:16px 0 4px"><strong>Customer</strong></p><p style="margin:0">${esc(customer.name || '(no name)')}<br>${esc(customer.email || '(no email)')}${customer.phone ? '<br>' + esc(customer.phone) : ''}</p>` +
    `<p style="margin:16px 0 4px"><strong>Ship to</strong></p><p style="margin:0">${addr ? addr.map(esc).join('<br>') : '(no shipping address collected)'}</p>` +
    `<p style="margin:16px 0 0;color:#777;font-size:13px">The printer has been emailed the print job separately (no customer details are sent to them).${dashboard ? ` <a href="${esc(dashboard)}">Open in Stripe</a>` : ''}</p>`);
  return { subject, text: textParts.join('\n'), html };
}

// ---------- sending (Resend) ----------

function sendEmail({ apiKey, idempotencyKey, from, to, replyTo, subject, html, text }) {
  const payload = JSON.stringify({
    from, to, subject, html, text,
    ...(replyTo && replyTo.length ? { reply_to: replyTo } : {}),
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        // Same key on a Stripe retry => Resend doesn't send a second copy.
        'Idempotency-Key': idempotencyKey,
      },
    }, res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
        else reject(new Error(`Resend ${res.statusCode}: ${body}`));
      });
    });
    req.on('error', reject);
    req.setTimeout(7000, () => req.destroy(new Error('Resend request timed out')));
    req.write(payload);
    req.end();
  });
}

async function forwardPaidOrder(stripe, stripeEvent, session) {
  const apiKey = process.env.RESEND_API_KEY;
  const printerTo = splitEmails(process.env.PRINTER_EMAIL);
  const ownerTo = splitEmails(process.env.OWNER_EMAIL);
  const from = process.env.ORDER_EMAIL_FROM || DEFAULT_FROM;

  if (!apiKey || (!printerTo.length && !ownerTo.length)) {
    console.warn('ORDER NOT EMAILED - set RESEND_API_KEY and PRINTER_EMAIL / OWNER_EMAIL in Netlify. Paid session:', session.id);
    return;
  }
  if (!printerTo.length) console.warn('PRINTER_EMAIL is not set - the printer was NOT emailed for', session.id);
  if (!ownerTo.length) console.warn('OWNER_EMAIL is not set - Marie was NOT emailed for', session.id);

  const { full, items } = await loadOrder(stripe, session);
  const ref = orderRef(session);
  const ship = (full.collected_information && full.collected_information.shipping_details)
    || full.shipping_details
    || (session.collected_information && session.collected_information.shipping_details)
    || session.shipping_details
    || null;
  const rate = full.shipping_cost && full.shipping_cost.shipping_rate;
  const rateName = rate && typeof rate === 'object' ? rate.display_name : '';

  const jobs = [];
  if (printerTo.length) {
    const e = buildPrinterEmail(ref, full, items);
    jobs.push({ label: 'printer', promise: sendEmail({ apiKey, idempotencyKey: `${stripeEvent.id}-printer`, from, to: printerTo, replyTo: ownerTo, ...e }) });
  }
  if (ownerTo.length) {
    const e = buildOwnerEmail(ref, full, items, ship, rateName);
    jobs.push({ label: 'owner', promise: sendEmail({ apiKey, idempotencyKey: `${stripeEvent.id}-owner`, from, to: ownerTo, replyTo: [], ...e }) });
  }

  const results = await Promise.allSettled(jobs.map(j => j.promise));
  const failures = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') console.log(`Order ${ref}: ${jobs[i].label} email sent`);
    else { console.error(`Order ${ref}: ${jobs[i].label} email FAILED:`, r.reason && r.reason.message); failures.push(jobs[i].label); }
  });
  if (failures.length) throw new Error('Order email failed for: ' + failures.join(', '));
}

// ---------- webhook entry point ----------

exports.handler = async (event) => {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = event.headers['stripe-signature'];
  // Stripe signs the exact raw body; Netlify can hand it over base64-encoded.
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  switch (stripeEvent.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = stripeEvent.data.object;
      console.log('Checkout event', stripeEvent.type, session.id, session.customer_details?.email, session.payment_status);
      // Cards, Apple Pay, PayPal etc. are paid on completion. Slower methods
      // complete first and are paid later -- the async_payment_succeeded event
      // (if this endpoint listens for it) fires then. Never forward unpaid orders.
      if (session.payment_status !== 'paid') {
        console.log('Not paid yet, waiting for async_payment_succeeded:', session.id);
        break;
      }
      try {
        await forwardPaidOrder(stripe, stripeEvent, session);
      } catch (err) {
        console.error('Order forwarding failed:', err);
        // A non-2xx makes Stripe retry this event for a while, so a brief
        // Resend/Stripe hiccup doesn't lose an order.
        return { statusCode: 500, body: 'Order forwarding failed, will be retried' };
      }
      break;
    }
    case 'checkout.session.async_payment_failed': {
      const session = stripeEvent.data.object;
      console.log('Payment failed for session:', session.id);
      break;
    }
    default:
      // Unhandled event type — fine to ignore.
      break;
  }

  // 2xx tells Stripe we got it.
  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
