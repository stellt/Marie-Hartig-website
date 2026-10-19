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

  // "Are you sure?" after Pay, before Stripe charges (Marie, 2026-10-20).
  // Resolves true on Yes, false on No / Esc.
  function askSure(session) {
    const dialog = document.getElementById('checkout-confirm');
    const total = session && session.total && session.total.total && session.total.total.amount;
    dialog.querySelector('.checkout-confirm-total').textContent = typeof total === 'string' ? `Total ${total}` : '';
    dialog.returnValue = '';
    dialog.showModal();
    return new Promise(resolve => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true });
    });
  }

  async function mountForm({ clientSecret, publishableKey, deliveryNote }) {
    document.getElementById('checkout-note').textContent = deliveryNote || '';
    await loadStripeJs();
    const stripe = window.Stripe(publishableKey);
    const checkout = await stripe.initCheckoutFormSdk({ clientSecret });
    const form = checkout.createForm();
    form.mount('#checkout-form');

    // Re-price whenever a complete address names a country we haven't priced
    // yet. Keyed on the country (zones are per country), not on the address
    // merely becoming complete, so switching AT -> DE with the rest of the
    // form still filled in re-prices too. One update in flight at a time.
    // A country change that lands while an update is running is picked up by
    // the loop afterwards, so the last address typed is always the one priced.
    let pricedCountry = '';
    let wanted = null; // { country, addr } of the latest complete address
    let inFlight = false;
    async function reprice() {
      inFlight = true;
      try {
        while (wanted && wanted.country !== pricedCountry) {
          const { country, addr } = wanted;
          const loaded = await checkout.loadActions();
          if (loaded.type !== 'success') return;
          const actions = loaded.actions;
          await actions.runServerUpdate(() => updateShipping(actions.getSession().id, addr));
          pricedCountry = country;
          show('');
        }
      } catch (err) {
        show(err.message || "We couldn't update shipping. Please try again.");
      } finally {
        inFlight = false;
      }
    }
    let running = null;
    form.on('change', ({ value, status: st }) => {
      const complete = st && st.shippingAddress && st.shippingAddress.complete;
      const addr = value && value.shippingAddress;
      const country = complete && addr && addr.address ? String(addr.address.country || '').toUpperCase() : '';
      wanted = country ? { country, addr } : null;
      if (country && !inFlight) running = reprice();
    });

    // The form's own Pay button only emits 'confirm'; the page has to pass
    // that event to actions.confirm or the click does nothing (Marie,
    // 2026-10-20: "she can't checkout"). Waits for any shipping re-price
    // still running so the charged total is the one shown.
    form.on('confirm', async event => {
      try {
        if (running) await running;
        const loaded = await checkout.loadActions();
        if (loaded.type !== 'success') throw new Error();
        if (!(await askSure(loaded.actions.getSession()))) return;
        await loaded.actions.confirm({ formConfirmEvent: event });
      } catch (err) {
        console.error(err);
        show("Payment didn't go through. Please check your details and try again.");
      }
    });
  }

  async function createSession(hosted) {
    const res = await fetch('/.netlify/functions/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, country, hosted }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.error === 'quote_required') { window.location.replace('/pages/contact.html'); return null; }
    if (!res.ok) throw new Error(data.error || 'Checkout session creation failed');
    return data;
  }

  async function start() {
    try {
      const data = await createSession(false);
      if (!data) return;
      if (data.url) { window.location.replace(data.url); return; }
      if (!data.clientSecret || !data.publishableKey) throw new Error('No checkout returned');
      try {
        await mountForm(data);
      } catch (err) {
        // Stripe.js blocked or the form failed to mount in this browser:
        // ask for the hosted page instead so the customer can still pay.
        console.error('Embedded form failed, using hosted page:', err);
        const hosted = await createSession(true);
        if (!hosted) return;
        if (!hosted.url) throw err;
        window.location.replace(hosted.url);
      }
    } catch (err) {
      console.error(err);
      show('Something went wrong starting checkout. Please go back and try again in a moment.');
    }
  }

  start();
})();
