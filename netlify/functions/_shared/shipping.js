// netlify/functions/_shared/shipping.js
//
// Shipping zones from the CMS (Page Text > Shop Settings > Shipping Zones),
// shared by create-checkout-session.js and update-shipping.js so both price a
// country the same way. One flat price per order, set by the zone that
// contains the delivery country.

const shopSettings = require('../../../_content/shop-settings.json');

// Decap can store a one-field list item as a bare string, so countries may be
// 'AT' or { country: 'AT' } -- read both.
function shippingZones() {
  return (shopSettings.shipping_zones || []).map(z => ({
    name: String(z.name || '').trim(),
    price: Number(z.price),
    countries: (z.countries || []).map(c => String(typeof c === 'string' ? c : (c && (c.country || c.value)) || '').toUpperCase()),
  })).filter(z => z.name && z.price >= 0 && z.countries.length);
}

function findZone(country) {
  country = String(country || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return null;
  return shippingZones().find(z => z.countries.includes(country)) || null;
}

function allCountries() {
  return [...new Set(shippingZones().flatMap(z => z.countries))];
}

// The single shipping option for `country`. metadata.country records which
// country was priced, so stripe-webhook.js can flag an order whose delivery
// address ended up somewhere else (e.g. Apple Pay skipping the re-price).
function shippingOption(zone, country, taxEnabled) {
  return {
    shipping_rate_data: {
      type: 'fixed_amount',
      fixed_amount: { amount: Math.round(zone.price * 100), currency: 'eur' },
      display_name: 'Shipping — ' + zone.name,
      metadata: { country: String(country).toUpperCase() },
      ...(taxEnabled ? { tax_behavior: 'inclusive', tax_code: 'txcd_92010001' } : {}),
    },
  };
}

module.exports = { shippingSettings: shopSettings, shippingZones, findZone, allCountries, shippingOption };
