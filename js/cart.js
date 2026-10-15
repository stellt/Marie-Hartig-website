/* ============================================
   MARIE HARTIG STUDIO — Cart System
   ============================================ */

const Cart = (() => {
  const STORAGE_KEY = 'mhs_cart';
  const COUNTRY_KEY = 'mhs_ship_country';
  const QUOTE = 'OTHER';

  // Shipping zones come from the CMS (Shop Settings > Shipping Zones). The
  // customer picks their country here first; checkout then charges that
  // zone's price and Stripe only accepts an address in that country.
  let zones = [];
  let zonesLoaded = false;

  function loadZones() {
    return fetch('/_content/shop-settings.json', { cache: 'no-cache' })
      .then(r => r.json())
      .then(s => {
        zones = (s.shipping_zones || []).map(z => ({
          name: String(z.name || ''),
          price: Number(z.price),
          countries: (z.countries || []).map(c => String(typeof c === 'string' ? c : (c && (c.country || c.value)) || '').toUpperCase()),
        })).filter(z => z.name && z.price >= 0 && z.countries.length);
      })
      .catch(() => { zones = []; })
      .then(() => { zonesLoaded = true; renderShipping(); });
  }

  function getCountry() {
    try { return localStorage.getItem(COUNTRY_KEY) || ''; } catch { return ''; }
  }

  function setCountry(code) {
    try { localStorage.setItem(COUNTRY_KEY, code); } catch {}
    renderShipping();
  }

  function zoneFor(code) {
    return zones.find(z => z.countries.includes(code)) || null;
  }

  function countryName(code) {
    try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code); } catch { return code; }
  }

  function money(n) {
    return '€' + n.toFixed(2);
  }

  function getItems() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }

  function saveItems(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    updateBadge();
    renderDrawer();
  }

  function addItem(id, name, price, image) {
    const items = getItems();
    const existing = items.find(i => i.id === id);
    if (existing) {
      existing.qty += 1;
    } else {
      items.push({ id, name, price, image, qty: 1 });
    }
    saveItems(items);
    openDrawer();
  }

  function removeItem(id) {
    saveItems(getItems().filter(i => i.id !== id));
  }

  function updateQty(id, qty) {
    const items = getItems();
    const item = items.find(i => i.id === id);
    if (item) {
      item.qty = Math.max(1, qty);
      saveItems(items);
    }
  }

  function getTotal() {
    return getItems().reduce((sum, i) => sum + i.price * i.qty, 0);
  }

  function getCount() {
    return getItems().reduce((sum, i) => sum + i.qty, 0);
  }

  function updateBadge() {
    const count = getCount();
    document.querySelectorAll('.cart-badge').forEach(b => {
      b.textContent = count;
      b.style.display = count > 0 ? 'flex' : 'none';
    });
  }

  function renderDrawer() {
    const drawer = document.getElementById('cart-drawer');
    if (!drawer) return;
    const items = getItems();
    const list = drawer.querySelector('.cart-drawer-items');

    if (items.length === 0) {
      list.innerHTML = '<p class="cart-empty">Your cart is empty.</p>';
    } else {
      list.innerHTML = items.map(item => `
        <div class="cart-item" data-id="${item.id}">
          <img src="${item.image}" alt="${item.name}" />
          <div class="cart-item-info">
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-price">€${item.price.toFixed(2)}</div>
            <div class="cart-item-qty">
              <button onclick="Cart.updateQty('${item.id}', ${item.qty - 1})" ${item.qty <= 1 ? 'disabled' : ''}>−</button>
              <span>${item.qty}</span>
              <button onclick="Cart.updateQty('${item.id}', ${item.qty + 1})">+</button>
              <button class="cart-item-remove" onclick="Cart.removeItem('${item.id}')">Remove</button>
            </div>
          </div>
        </div>
      `).join('');
    }

    renderShipping();
  }

  function renderShipping() {
    const drawer = document.getElementById('cart-drawer');
    if (!drawer) return;
    const select = drawer.querySelector('.cart-ship-select');
    const shipAmount = drawer.querySelector('.cart-ship-amount');
    const subAmount = drawer.querySelector('.cart-subtotal-amount');
    const total = drawer.querySelector('.cart-total-amount');
    const btn = drawer.querySelector('.cart-drawer-footer .cart-checkout-btn');
    const code = getCountry();
    const zone = zoneFor(code);
    const subtotal = getTotal();

    if (select && zonesLoaded && select.options.length <= 1) {
      const codes = [...new Set(zones.flatMap(z => z.countries))]
        .map(c => ({ c, n: countryName(c) }))
        .sort((a, b) => a.n.localeCompare(b.n));
      select.insertAdjacentHTML('beforeend',
        codes.map(({ c, n }) => `<option value="${c}">${n}</option>`).join('') +
        `<option value="${QUOTE}">Other country</option>`);
    }
    if (select && zonesLoaded) select.value = (zone || code === QUOTE) ? code : '';

    if (subAmount) subAmount.textContent = money(subtotal);
    if (shipAmount) shipAmount.textContent = zone ? money(zone.price) : (code === QUOTE ? 'On request' : '—');
    if (total) total.textContent = money(subtotal + (zone ? zone.price : 0));
    if (btn) {
      btn.textContent = code === QUOTE ? 'Request a Quote' : 'Proceed to Checkout';
      btn.disabled = getItems().length === 0 || !(zone || code === QUOTE);
    }
  }

  function openDrawer() {
    const drawer = document.getElementById('cart-drawer');
    const overlay = document.getElementById('cart-overlay');
    if (drawer) drawer.classList.add('open');
    if (overlay) overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    const drawer = document.getElementById('cart-drawer');
    const overlay = document.getElementById('cart-overlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
    closeReview();
  }

  // "Are you sure?" step before leaving for Stripe (Marie, 2026-10-15).
  function openReview() {
    const drawer = document.getElementById('cart-drawer');
    const items = getItems();
    const code = getCountry();
    if (!drawer || items.length === 0) return;
    if (code === QUOTE) { window.location.href = '/pages/contact.html'; return; }
    const zone = zoneFor(code);
    if (!zone) return;
    let panel = drawer.querySelector('.cart-review');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'cart-review';
      drawer.appendChild(panel);
    }
    panel.innerHTML = `
      <h3>Review Your Order</h3>
      <ul class="cart-review-items">
        ${items.map(i => `<li><span>${i.qty} × ${i.name}</span><span>${money(i.price * i.qty)}</span></li>`).join('')}
      </ul>
      <div class="cart-review-row"><span>Shipping to ${countryName(code)}</span><span>${money(zone.price)}</span></div>
      <div class="cart-review-row cart-review-total"><span>Total</span><span>${money(getTotal() + zone.price)}</span></div>
      <p class="cart-review-question">Are you sure you want to complete your purchase?</p>
      <button type="button" class="cart-checkout-btn cart-review-yes">Yes, confirm purchase</button>
      <button type="button" class="cart-review-no">No, go back</button>
    `;
    panel.querySelector('.cart-review-no').addEventListener('click', closeReview);
    panel.querySelector('.cart-review-yes').addEventListener('click', e => checkout(e.currentTarget));
    panel.classList.add('open');
  }

  function closeReview() {
    const panel = document.querySelector('.cart-review');
    if (panel) panel.classList.remove('open');
  }

  async function checkout(btn) {
    const items = getItems();
    const country = getCountry();
    if (items.length === 0 || !zoneFor(country)) return;

    if (!(btn instanceof HTMLElement)) btn = document.querySelector('.cart-review-yes');
    const originalText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Redirecting…';
    }

    try {
      const res = await fetch('/.netlify/functions/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, country }),
      });

      if (!res.ok) throw new Error('Checkout session creation failed');

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      console.error(err);
      alert('Something went wrong starting checkout. Please try again in a moment.');
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  }

  function init() {
    // Ship-to country, item and shipping rows above the total, and the VAT
    // note under it (Marie, 2026-10-14/15). Injected here rather than in the
    // drawer markup, which is copied on every page.
    const totalRow = document.querySelector('.cart-total');
    if (totalRow && !document.querySelector('.cart-ship')) {
      totalRow.insertAdjacentHTML('beforebegin', `
        <label class="cart-ship"><span class="cart-total-label">Ship to</span>
          <select class="cart-ship-select"><option value="" disabled>Select country</option></select>
        </label>
        <div class="cart-total cart-line"><span class="cart-total-label">Items</span><span class="cart-subtotal-amount">€0.00</span></div>
        <div class="cart-total cart-line"><span class="cart-total-label">Shipping</span><span class="cart-ship-amount">—</span></div>`);
      totalRow.insertAdjacentHTML('afterend', '<p class="cart-vat-note">Prices include applicable VAT.</p>');
      document.querySelector('.cart-ship-select').addEventListener('change', e => setCountry(e.target.value));
    }

    updateBadge();
    renderDrawer();
    loadZones();

    // Cart icon click
    document.querySelectorAll('.cart-icon-btn').forEach(btn => {
      btn.addEventListener('click', openDrawer);
    });

    // Overlay click closes drawer
    const overlay = document.getElementById('cart-overlay');
    if (overlay) overlay.addEventListener('click', closeDrawer);

    // Close button
    const closeBtn = document.getElementById('cart-close');
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

    // Checkout button opens the review step first
    const checkoutBtn = document.querySelector('.cart-drawer-footer .cart-checkout-btn');
    if (checkoutBtn) checkoutBtn.addEventListener('click', openReview);
  }

  document.addEventListener('DOMContentLoaded', init);

  return { addItem, removeItem, updateQty, openDrawer, closeDrawer, getItems, getTotal, checkout };
})();
