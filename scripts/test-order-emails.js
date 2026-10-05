// End-to-end run of the real webhook handler with Stripe + Resend stubbed (fake values only).
// Checks the printer gets the full order email incl. ship-to address (Marie's ask, 2026-10-06).
// Run: node scripts/test-order-emails.js   (exits 1 on any failed check; no npm install needed)
const path = require('path');
const Module = require('module'), https = require('https'), { EventEmitter } = require('events');
const sent = [];
https.request = (opts, cb) => {
  const req = new EventEmitter(); let body = '';
  req.write = d => { body += d; }; req.setTimeout = () => {}; req.destroy = () => {};
  req.end = () => { sent.push(JSON.parse(body)); const res = new EventEmitter(); res.statusCode = 200; cb(res); res.emit('data', '{"id":"x"}'); res.emit('end'); };
  return req;
};
const session = { id: 'cs_live_testJBKPZJGZ', payment_status: 'paid', created: 1791214000, currency: 'eur',
  amount_total: 11300, amount_subtotal: 9000, total_details: { amount_shipping: 2300 }, payment_intent: 'pi_3UNBry',
  customer_details: { name: 'Pureza Magalhaes', email: 'buyer@example.com' },
  collected_information: { shipping_details: { name: 'Pureza Magalhaes', address: { line1: 'Rua da Ribeira das Vinhas 124-B2', postal_code: '2750-477', city: 'Cascais', country: 'PT' } } },
  shipping_cost: { shipping_rate: { display_name: 'Shipping — Rest of Europe' } } };
const li = (d, size) => ({ description: d + ' — ' + size, quantity: 1, amount_total: 4500, currency: 'eur',
  price: { unit_amount: 4500, product: { name: d, metadata: { type: 'wall_tattoo', design: d, format: 'Wall Tattoo', size, image: '/assets/images/x.png' } } } });
const stripeStub = () => ({
  webhooks: { constructEvent: () => ({ id: 'evt_test', type: 'checkout.session.completed', data: { object: session } }) },
  checkout: { sessions: { retrieve: async () => session, listLineItems: async () => ({ data: [li('Louis and the Butterfly', '33 × 28 cm'), li('Monkey Max and the Papaya', '38 × 26 cm')] }) } },
});
const orig = Module._load; Module._load = function (r, ...a) { return r === 'stripe' ? stripeStub : orig.call(this, r, ...a); };
process.env.RESEND_API_KEY = 'fake';
process.env.PRINTER_EMAIL = 'printer@example.com';
process.env.OWNER_EMAIL = 'owner@example.com';
const { handler } = require(path.join(__dirname, '..', 'netlify', 'functions', 'stripe-webhook.js'));
(async () => {
  const r = await handler({ headers: { 'stripe-signature': 'x' }, body: '{}', isBase64Encoded: false });
  console.log('HTTP', r.statusCode, '| emails sent to:', sent.map(e => e.to.join()).join(', '));
  const p = sent.find(e => e.to.includes('printer@example.com')), o = sent.find(e => e.to.includes('owner@example.com'));
  const strip = t => t.split('\n').filter(l => !l.startsWith('Stripe:')).slice(0, -1).join('\n');
  const checks = {
    'printer has ship-to address (text + html)': p.text.includes('Rua da Ribeira das Vinhas 124-B2') && p.text.includes('2750-477 Cascais') && p.html.includes('Rua da Ribeira das Vinhas 124-B2'),
    'printer has customer name': p.text.includes('Pureza Magalhaes'),
    'printer has both items + sizes': p.text.includes('Louis and the Butterfly') && p.text.includes('38 × 26 cm'),
    'printer has no Stripe link': !p.text.includes('dashboard.stripe.com') && !p.html.includes('dashboard.stripe.com'),
    'printer replies go to Marie': JSON.stringify(p.reply_to) === '["owner@example.com"]',
    'printer body identical to owner body (except footer/link)': strip(p.text) === strip(o.text),
    'owner still has Stripe link': o.text.includes('dashboard.stripe.com'),
  };
  checks['webhook returned 200 and sent 3 emails'] = r.statusCode === 200 && sent.length === 3;
  for (const [k, v] of Object.entries(checks)) console.log(v ? 'PASS' : 'FAIL', k);
  if (Object.values(checks).includes(false)) {
    console.log('\n--- printer email ---\nSubject:', p.subject, '\n' + p.text);
    process.exit(1);
  }
})().catch(err => { console.error(err); process.exit(1); });
