// netlify/functions/create-checkout-session.js
//
// Creates a Stripe Checkout Session from the cart items sent by the client.
// Expects POST body: { items: [{ id, name, price, image, qty }, ...] }

const Stripe = require('stripe');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  let items;
  try {
    const body = JSON.parse(event.body);
    items = body.items;
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Cart is empty' }) };
  }

  // IMPORTANT: Never trust prices sent from the client in a real production
  // setup long-term — someone could edit cart.js in devtools and send a
  // price of €0.01. For now this matches your current site (prices live in
  // your HTML/JS), but the more robust fix later is to look prices up
  // server-side from a fixed product list. Flagging this so you know the
  // tradeoff — happy to build that lookup table next if you want it.

  const line_items = items.map((item) => ({
    price_data: {
      currency: 'eur',
      product_data: {
        name: item.name,
        images: item.image ? [absoluteImageUrl(item.image, event)] : undefined,
      },
      unit_amount: Math.round(item.price * 100), // Stripe expects cents
    },
    quantity: item.qty || 1,
  }));

  const origin = event.headers.origin || `https://${event.headers.host}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancel.html`,
      // Optional: collect shipping address if you sell physical goods
      shipping_address_collection: { allowed_countries: ['DE', 'AT', 'CH', 'FR', 'NL', 'BE', 'IT', 'ES', 'GB', 'US'] },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error('Stripe session creation failed:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Unable to create checkout session' }),
    };
  }
};

// Stripe needs absolute, publicly-reachable image URLs (no relative paths,
// no spaces). This resolves your relative cart image paths to absolute ones
// and skips any that won't work (e.g. local-only or containing spaces) so
// session creation doesn't fail.
function absoluteImageUrl(imagePath, event) {
  try {
    const origin = event.headers.origin || `https://${event.headers.host}`;
    // cart.js stores paths like "../assets/images/..." which only make sense
    // relative to the shop pages, not the site root. Strip leading ../ and
    // assume assets live at site root /assets/...
    const cleaned = imagePath.replace(/^(\.\.\/)+/, '/');
    const url = new URL(cleaned, origin).toString();
    // Stripe rejects URLs with unencoded spaces (e.g. "wall tattoos no bg")
    return encodeURI(url);
  } catch {
    return undefined;
  }
}
