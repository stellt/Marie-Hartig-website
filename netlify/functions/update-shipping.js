// netlify/functions/update-shipping.js
//
// Re-prices shipping on an embedded checkout form (ui_mode 'form') whenever
// the customer finishes typing a delivery address (js/checkout.js calls this
// through Stripe's runServerUpdate). Marie, 2026-10-15: "if the customer
// changes their shipping address, the shipping cost automatically updates."
//
// Expects POST body: { checkout_session_id, shipping_details: { address: { country } } }
// Replies { type: 'object', value: { succeeded: true } } or
//         { type: 'error', message } -- the shape the Stripe docs use.
//
// The price always comes from the CMS zones, never from the browser. The
// browser does say which country it is, so stripe-webhook.js double-checks
// the paid order's real address against the country that was priced.

const Stripe = require('stripe');
const { findZone, shippingOption } = require('./_shared/shipping');

const FORM_API_VERSION = '2026-09-30.endive';
const TAX_ENABLED = process.env.STRIPE_TAX_ENABLED === 'true';

function reply(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  if (!process.env.STRIPE_SECRET_KEY) return reply(500, { type: 'error', message: 'Server misconfigured' });

  let id, country;
  try {
    const body = JSON.parse(event.body);
    id = String(body.checkout_session_id || '');
    const details = body.shipping_details || {};
    country = String((details.address && details.address.country) || '').toUpperCase();
  } catch (err) {
    return reply(400, { type: 'error', message: 'Invalid request' });
  }
  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(id)) return reply(400, { type: 'error', message: 'Invalid session' });

  const zone = findZone(country);
  if (!zone) {
    return reply(200, { type: 'error', message: "Sorry, we don't ship to this country yet. Please contact us for a quote." });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: FORM_API_VERSION });
  try {
    const session = await stripe.checkout.sessions.retrieve(id);
    if (session.status !== 'open' || session.ui_mode !== 'form') {
      return reply(400, { type: 'error', message: 'This checkout has expired. Please go back to the cart.' });
    }
    await stripe.checkout.sessions.update(id, {
      shipping_options: [shippingOption(zone, country, TAX_ENABLED)],
    });
    return reply(200, { type: 'object', value: { succeeded: true } });
  } catch (err) {
    console.error('Shipping update failed:', id, country, err.message);
    return reply(500, { type: 'error', message: "We couldn't update shipping. Please try again." });
  }
};
