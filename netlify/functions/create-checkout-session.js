// netlify/functions/create-checkout-session.js
//
// Creates a Stripe Checkout Session from the cart items sent by the client.
// Expects POST body: { items: [{ id, name, price, image, qty }, ...] }
//
// Prices are NEVER trusted from the client. Each cart item's id is looked up
// in a catalog built from the site's own shop data (the same _content/
// shop-*.json files the CMS edits), and that catalog price is what actually
// gets charged. An id that doesn't match a real product/size/orientation
// combination fails the whole request rather than silently using whatever
// price the browser sent.

const Stripe = require('stripe');
const shopTattoos = require('../../_content/shop-tattoos.json');
const shopPrints = require('../../_content/shop-prints.json');
const shopWallpapers = require('../../_content/shop-wallpapers.json');

// Mirrors the id-building logic in pages/shop-wall-tattoos.html and
// pages/shop-compose.html -- keep these in sync if that logic ever changes.
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function tattooFile(item) {
  return String(item.image || item.name || '').split('/').pop().replace(/\.[^.]+$/, '');
}

// Builds { cartId: price } for every real product/size/orientation
// combination currently in the shop data.
function buildCatalog() {
  const catalog = {};

  (shopTattoos.tattoos || []).forEach(item => {
    const basePrice = typeof item.price === 'number' ? item.price : Number(shopTattoos.price) || 0;
    const baseId = 'tattoo-' + tattooFile(item);
    const canMirror = item.mirror_available !== false;

    const variants = [['', basePrice]];
    if (canMirror) variants.push(['-mirrored', basePrice]);
    (item.sizes || []).forEach(size => {
      const sizePrice = typeof size.price === 'number' ? size.price : basePrice;
      const sizeSuffix = '-' + slug(size.label);
      variants.push([sizeSuffix, sizePrice]);
      if (canMirror) variants.push([sizeSuffix + '-mirrored', sizePrice]);
    });

    variants.forEach(([suffix, price]) => { catalog[baseId + suffix] = price; });
  });

  (shopPrints.prints || []).forEach((item, i) => {
    catalog['print-' + i] = typeof item.price === 'number' ? item.price : Number(shopPrints.price) || 0;
  });

  (shopWallpapers.wallpapers || []).forEach((item, i) => {
    catalog['wallpaper-' + i] = typeof item.price === 'number' ? item.price : Number(shopWallpapers.price) || 0;
  });

  return catalog;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  let items;
  try {
    const body = JSON.parse(event.body);
    items = body.items;
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Cart is empty or too large' }) };
  }

  const catalog = buildCatalog();
  const line_items = [];
  for (const item of items) {
    const price = catalog[item && item.id];
    if (typeof price !== 'number') {
      return { statusCode: 400, body: JSON.stringify({ error: `Unknown product: ${item && item.id}` }) };
    }
    const qty = Math.min(Math.max(1, Math.round(Number(item.qty) || 1)), 20);
    line_items.push({
      price_data: {
        currency: 'eur',
        product_data: {
          name: String(item.name || '').slice(0, 200),
          images: item.image ? [absoluteImageUrl(item.image, event)] : undefined,
        },
        unit_amount: Math.round(price * 100), // catalog-verified price, in cents
      },
      quantity: qty,
    });
  }

  const origin = event.headers.origin || `https://${event.headers.host}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items,
      success_url: `${origin}/pages/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pages/cancel.html`,
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
