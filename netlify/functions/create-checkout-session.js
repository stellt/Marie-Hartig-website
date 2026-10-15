// netlify/functions/create-checkout-session.js
//
// Creates a Stripe Checkout Session from the cart items sent by the client.
// Expects POST body: { items: [{ id, name, price, image, qty }, ...], country: 'AT' }
//
// Prices are NEVER trusted from the client. Each cart item's id is looked up
// in a catalog built from the site's own shop data (the same _content/
// shop-*.json files the CMS edits), and that catalog price is what actually
// gets charged. An id that doesn't match a real product/format/size/
// orientation combination fails the whole request rather than silently
// using whatever price the browser sent.

const Stripe = require('stripe');
const shopTattoos = require('../../_content/shop-tattoos.json');
const shopPrints = require('../../_content/shop-prints.json');
const shopWallpapers = require('../../_content/shop-wallpapers.json');
const shopSettings = require('../../_content/shop-settings.json');
const { findZone, allCountries, shippingOption } = require('./_shared/shipping');

// Pinned for the embedded checkout form (ui_mode 'form'), which needs this
// API version or newer. Hosted checkout keeps the account default.
const FORM_API_VERSION = '2026-09-30.endive';

// Mirrors the id-building logic in pages/shop-wall-tattoos.html and
// pages/shop-compose.html -- keep these in sync if that logic ever changes.
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function tattooFile(item) {
  return String(item.image || item.name || '').split('/').pop().replace(/\.[^.]+$/, '');
}

function rootAbsolute(p) {
  return '/' + String(p || '').replace(/^(\.\.\/)+/, '').replace(/^\//, '');
}

// Builds { cartId: { price, meta } } for every real product/format/size/
// orientation combination currently in the shop data. `meta` is the
// structured description of what the customer bought. It gets attached to
// each Stripe line item, so the order emails (stripe-webhook.js) can tell
// the printer exactly what to print without guessing from display names.
// VAT and invoices (Marie's email, 2026-10-14). Both are OFF until their
// env var is 'true' in Netlify, because they need Stripe Dashboard setup
// first -- turning tax on without it makes every checkout fail:
//   STRIPE_TAX_ENABLED       Stripe Tax: origin address + Austria
//                            registration set under Dashboard > Tax.
//   STRIPE_INVOICES_ENABLED  a PDF invoice emailed after payment: business
//                            address + UID set on the invoice template, and
//                            "Email customers about paid invoices" switched on.
// Prices and shipping are VAT-INCLUSIVE: €55 stays €55 in every country and
// Stripe works out the VAT inside it (0 for exports). Never 'exclusive' --
// that would add VAT on top of Marie's prices.
const TAX_ENABLED = process.env.STRIPE_TAX_ENABLED === 'true';
const INVOICES_ENABLED = process.env.STRIPE_INVOICES_ENABLED === 'true';

function buildCatalog() {
  const catalog = {};

  const printSizes = (shopTattoos.print_sizes || []).filter(s => typeof s.price === 'number');

  (shopTattoos.tattoos || []).forEach(item => {
    const basePrice = typeof item.price === 'number' ? item.price : Number(shopTattoos.price) || 0;
    const baseId = 'tattoo-' + tattooFile(item);
    const canMirror = item.mirror_available !== false;
    const image = rootAbsolute(item.image);

    const add = (suffix, price, format, size, mirrored) => {
      catalog[baseId + suffix] = {
        price,
        meta: { type: 'wall_tattoo', design: item.name, format, size, orientation: mirrored ? 'Mirrored' : 'Standard', image },
      };
    };

    // ---- Wall Tattoo format (own size list, defaults to the tattoo's own
    // price when no size is chosen yet -- matches the popup allowing
    // add-to-cart on an unconfirmed size; size is '' in that case) ----
    add('', basePrice, 'Wall Tattoo', '', false);
    if (canMirror) add('-mirrored', basePrice, 'Wall Tattoo', '', true);
    (item.sizes || []).forEach(size => {
      const sizePrice = typeof size.price === 'number' ? size.price : basePrice;
      const sizeSuffix = '-' + slug(size.label);
      add(sizeSuffix, sizePrice, 'Wall Tattoo', size.label, false);
      if (canMirror) add(sizeSuffix + '-mirrored', sizePrice, 'Wall Tattoo', size.label, true);
    });

    // ---- Print format (page-wide sizes; only ones with a real price are
    // purchasable -- the popup disables Add to Cart for the rest) ----
    printSizes.forEach(size => {
      const suffix = '-print-' + slug(size.label);
      add(suffix, size.price, 'Print', size.label, false);
      if (canMirror) add(suffix + '-mirrored', size.price, 'Print', size.label, true);
    });
  });

  (shopPrints.prints || []).forEach((item, i) => {
    catalog['print-' + i] = {
      price: typeof item.price === 'number' ? item.price : Number(shopPrints.price) || 0,
      meta: { type: 'art_print', design: item.name, format: 'Art Print', size: '', orientation: 'Standard', image: rootAbsolute(item.image) },
    };
  });

  (shopWallpapers.wallpapers || []).forEach((item, i) => {
    catalog['wallpaper-' + i] = {
      price: typeof item.price === 'number' ? item.price : Number(shopWallpapers.price) || 0,
      meta: { type: 'wallpaper', design: item.name, format: 'Wallpaper', size: '', orientation: 'Standard', image: rootAbsolute(item.image) },
    };
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

  let items, country;
  try {
    const body = JSON.parse(event.body);
    items = body.items;
    country = String(body.country || '').toUpperCase();
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Cart is empty or too large' }) };
  }

  const catalog = buildCatalog();
  const line_items = [];
  for (const item of items) {
    const entry = catalog[item && item.id];
    if (!entry || typeof entry.price !== 'number') {
      return { statusCode: 400, body: JSON.stringify({ error: `Unknown product: ${item && item.id}` }) };
    }
    const qty = Math.min(Math.max(1, Math.round(Number(item.qty) || 1)), 20);
    // Stripe metadata values must be strings (max 500 chars).
    const metadata = Object.fromEntries(
      Object.entries({ cart_id: item.id, ...entry.meta }).map(([k, v]) => [k, String(v).slice(0, 500)])
    );
    line_items.push({
      price_data: {
        currency: 'eur',
        product_data: {
          name: String(item.name || '').slice(0, 200),
          images: item.image ? [absoluteImageUrl(item.image, event)] : undefined,
          metadata,
        },
        unit_amount: Math.round(entry.price * 100), // catalog-verified price, in cents
        ...(TAX_ENABLED ? { tax_behavior: 'inclusive' } : {}),
      },
      quantity: qty,
    });
  }

  const origin = event.headers.origin || `https://${event.headers.host}`;

  // Shipping follows the delivery country (Marie, 2026-10-15). The cart asks
  // for the country first; the zone containing it (CMS: Page Text > Shop
  // Settings > Shipping Zones) sets ONE flat price per order. A country in no
  // zone gets a 400 and the cart sends the customer to the contact page for a
  // quote.
  const zone = findZone(country);
  if (!zone) {
    return { statusCode: 400, body: JSON.stringify({ error: 'quote_required' }) };
  }
  const deliveryNote = String(shopSettings.delivery_note || '').trim().slice(0, 1200);
  const common = {
    mode: 'payment',
    // No payment_method_types here on purpose: Stripe then shows whichever
    // methods are turned on in the Dashboard (Settings > Payment methods)
    // automatically -- card, Apple Pay, Google Pay, Link, PayPal, etc.
    // Hardcoding the list here would mean coming back to this file every
    // time a payment method gets turned on/off in the Dashboard.
    line_items,
    shipping_options: [shippingOption(zone, country, TAX_ENABLED)],
    ...(deliveryNote ? { custom_text: { shipping_address: { message: deliveryNote } } } : {}),
    ...(TAX_ENABLED ? { automatic_tax: { enabled: true } } : {}),
    ...(INVOICES_ENABLED ? {
      billing_address_collection: 'required',
      invoice_creation: { enabled: true },
    } : {}),
  };

  // Two ways to pay, switched by STRIPE_PUBLISHABLE_KEY in Netlify:
  //
  // Set   -> embedded form on /pages/checkout.html (Marie, 2026-10-15: "if
  //          the customer changes their shipping address, the shipping cost
  //          automatically updates"). Every zone country is accepted; the
  //          cart country's price is the starting point, and update-shipping.js
  //          re-prices whenever the customer finishes typing an address.
  // Unset -> Stripe's hosted page, which can't re-price, so Stripe only
  //          accepts an address in the country chosen in the cart. Deleting
  //          the env var rolls the site back to this.
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

  // If Stripe refuses the embedded form, fall through to the hosted page so a
  // customer can always pay.
  if (publishableKey) {
    try {
      const formStripe = Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: FORM_API_VERSION });
      const session = await formStripe.checkout.sessions.create({
        ...common,
        ui_mode: 'form',
        return_url: `${origin}/pages/success.html?session_id={CHECKOUT_SESSION_ID}`,
        shipping_address_collection: { allowed_countries: allCountries() },
      });
      return {
        statusCode: 200,
        body: JSON.stringify({ clientSecret: session.client_secret, publishableKey }),
      };
    } catch (err) {
      console.error('Embedded checkout refused, using hosted page:', err && err.message);
    }
  }

  try {
    const session = await stripe.checkout.sessions.create({
      ...common,
      success_url: `${origin}/pages/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pages/cancel.html`,
      shipping_address_collection: { allowed_countries: [country] },
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
