// netlify/functions/create-checkout-session.js
//
// Creates a Stripe Checkout Session from the cart items sent by the client.
// Expects POST body: { items: [{ id, name, price, image, qty }, ...] }
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

  const printSizes = (shopTattoos.print_sizes || []).filter(s => typeof s.price === 'number');

  (shopTattoos.tattoos || []).forEach(item => {
    const basePrice = typeof item.price === 'number' ? item.price : Number(shopTattoos.price) || 0;
    const baseId = 'tattoo-' + tattooFile(item);
    const canMirror = item.mirror_available !== false;

    // ---- Wall Tattoo format (own size list, defaults to the tattoo's own
    // price when no size is chosen yet -- matches the popup allowing
    // add-to-cart on an unconfirmed size) ----
    const variants = [['', basePrice]];
    if (canMirror) variants.push(['-mirrored', basePrice]);
    (item.sizes || []).forEach(size => {
      const sizePrice = typeof size.price === 'number' ? size.price : basePrice;
      const sizeSuffix = '-' + slug(size.label);
      variants.push([sizeSuffix, sizePrice]);
      if (canMirror) variants.push([sizeSuffix + '-mirrored', sizePrice]);
    });
    variants.forEach(([suffix, price]) => { catalog[baseId + suffix] = price; });

    // ---- Print format (page-wide sizes; only ones with a real price are
    // purchasable -- the popup disables Add to Cart for the rest) ----
    printSizes.forEach(size => {
      const suffix = '-print-' + slug(size.label);
      catalog[baseId + suffix] = size.price;
      if (canMirror) catalog[baseId + suffix + '-mirrored'] = size.price;
    });
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

  // Shipping is priced by region, set in the CMS under Page Text > Shop
  // Settings, based on Marie's real Austrian Post rates by country (consolidated
  // into 4 tiers, each rounded UP to the highest real rate in that group, so
  // the flat fee never falls short of the real cost -- see git history for
  // her original per-country numbers).
  //
  // Stripe's hosted Checkout page (the redirect-to-Stripe flow this site
  // uses) can't detect the customer's country and auto-select a rate --
  // that needs Stripe's embedded/Elements checkout instead, a bigger
  // integration change. So instead every priced region is offered as its
  // own clearly-labeled option, and the customer picks the one matching
  // where they live. A region with no price set (0 or unset) is left out
  // entirely, rather than showing a confusing "€0.00" option.
  //
  // Stripe hard-caps shipping_options at 5 entries per session -- we're
  // using 4, so there's exactly one more slot free if a 5th tier is ever
  // needed. More than 5 would need consolidating further, not just adding.
  const AUSTRIA = ['AT'];
  const EUROPE_REST = ['DE', 'HU', 'CZ', 'HR', 'FR', 'IT', 'NL', 'BE', 'ES', 'PT', 'GR', 'SE', 'IE', 'GB', 'CH', 'NO'];
  const AMERICAS_ASIA = ['CA', 'US', 'MX', 'BR', 'AR', 'JP', 'SG'];
  const AUSTRALIA_ROW = ['AU', 'NZ', 'ZA', 'KR', 'CN', 'HK', 'TW', 'IN', 'TH', 'PH', 'VN', 'ID', 'MY', 'AE', 'IL', 'SA', 'QA', 'KW'];

  function shippingRate(label, fee, weeksMin, weeksMax) {
    if (!(fee > 0)) return null;
    return {
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: { amount: Math.round(fee * 100), currency: 'eur' },
        display_name: label,
        delivery_estimate: {
          minimum: { unit: 'week', value: weeksMin },
          maximum: { unit: 'week', value: weeksMax },
        },
      },
    };
  }

  const shippingTiers = [
    { rate: shippingRate('Shipping — Austria', Number(shopSettings.shipping_austria) || 0, 1, 2), countries: AUSTRIA },
    { rate: shippingRate('Shipping — Rest of Europe', Number(shopSettings.shipping_europe) || 0, 2, 3), countries: EUROPE_REST },
    { rate: shippingRate('Shipping — Americas & Asia', Number(shopSettings.shipping_americas_asia) || 0, 3, 5), countries: AMERICAS_ASIA },
    { rate: shippingRate('Shipping — Australia & Rest of World', Number(shopSettings.shipping_australia_row) || 0, 4, 6), countries: AUSTRALIA_ROW },
  ].filter(t => t.rate);

  const shipping_options = shippingTiers.length ? shippingTiers.map(t => t.rate) : undefined;
  // Only let the customer enter an address in a country we actually have a
  // shipping price for -- no point collecting an address we can't quote.
  const allowedCountries = shippingTiers.length
    ? [...new Set(shippingTiers.flatMap(t => t.countries))]
    : [...AUSTRIA, ...EUROPE_REST, ...AMERICAS_ASIA, ...AUSTRALIA_ROW]; // all tiers unpriced (0) -- still let anyone through since shipping's free

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // No payment_method_types here on purpose: Stripe then shows whichever
      // methods are turned on in the Dashboard (Settings > Payment methods)
      // automatically -- card, Apple Pay, Google Pay, Link, PayPal, etc.
      // Hardcoding the list here would mean coming back to this file every
      // time a payment method gets turned on/off in the Dashboard.
      line_items,
      shipping_options,
      success_url: `${origin}/pages/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pages/cancel.html`,
      // Optional: collect shipping address if you sell physical goods
      shipping_address_collection: { allowed_countries: allowedCountries },
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
