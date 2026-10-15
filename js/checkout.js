/* ============================================
   MARIE HARTIG STUDIO — Checkout page
   ============================================
   Creates the Stripe Checkout Session from the saved cart. When the server
   has a publishable key it mounts Stripe's embedded form here and re-prices
   shipping each time the customer finishes an address (Marie, 2026-10-15);
   otherwise it gets a hosted Stripe URL back and redirects there. */

(() => {
  const STRIPE_JS = 'https://js.stripe.com/endive/stripe.js';
  const status = document.getElementById('checkout-status');
  const show = msg => { status.textContent = msg || ''; };

  let items = [];
  let country = '';
  try {
    items = JSON.parse(localStorage.getItem('mhs_cart')) || [];
    country = localStorage.getItem('mhs_ship_country') || '';
  } catch {}

  if (!items.length) { window.location.replace('/pages/shop.html'); return; }

  function loadStripeJs() {
    if (window.Stripe) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = STRIPE_JS;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Stripe.js failed to load'));
      document.head.appendChild(s);
    });
  }

  async function updateShipping(sessionId, shippingDetails) {
    const res = await fetch('/.netlify/functions/update-shipping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkout_session_id: sessionId, shipping_details: shippingDetails }),
    });
    const result = await res.json();
    if (result.type === 'error') throw new Error(result.message);
    return result;
  }

  async function mountForm({ clientSecret, publishableKey }) {
    await loadStripeJs();
    const stripe = window.Stripe(publishableKey);
    const checkout = await stripe.initCheckoutFormSdk({ clientSecret });
    const form = checkout.createForm();
    form.mount('#checkout-form');

    // Re-price once per completed address; reset when it's edited again.
    let priced = false;
    form.on('change', async ({ value, status: st }) => {
      const complete = st && st.shippingAddress && st.shippingAddress.complete;
      if (complete && !priced) {
        priced = true;
        const loaded = await checkout.loadActions();
        if (loaded.type !== 'success') { priced = false; return; }
        const actions = loaded.actions;
        try {
          await actions.runServerUpdate(() => updateShipping(actions.getSession().id, value.shippingAddress));
          show('');
        } catch (err) {
          priced = false;
          show(err.message || "We couldn't update shipping. Please try again.");
        }
      } else if (!complete && priced) {
        priced = false;
      }
    });
  }

  async function start() {
    try {
      const res = await fetch('/.netlify/functions/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, country }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.error === 'quote_required') { window.location.replace('/pages/contact.html'); return; }
      if (!res.ok) throw new Error(data.error || 'Checkout session creation failed');
      if (data.url) { window.location.replace(data.url); return; }
      if (!data.clientSecret || !data.publishableKey) throw new Error('No checkout returned');
      await mountForm(data);
    } catch (err) {
      console.error(err);
      show('Something went wrong starting checkout. Please go back and try again in a moment.');
    }
  }

  start();
})();
