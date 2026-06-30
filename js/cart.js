/* ============================================
   MARIE HARTIG STUDIO — Cart System
   ============================================ */

const Cart = (() => {
  const STORAGE_KEY = 'mhs_cart';

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
    const total = drawer.querySelector('.cart-total-amount');

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

    if (total) total.textContent = '€' + getTotal().toFixed(2);
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
  }

  async function checkout() {
    const items = getItems();
    if (items.length === 0) return;

    const btn = document.querySelector('.cart-checkout-btn');
    const originalText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Redirecting…';
    }

    try {
      const res = await fetch('/.netlify/functions/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
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
    updateBadge();
    renderDrawer();

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

    // Checkout button
    const checkoutBtn = document.querySelector('.cart-checkout-btn');
    if (checkoutBtn) checkoutBtn.addEventListener('click', checkout);
  }

  document.addEventListener('DOMContentLoaded', init);

  return { addItem, removeItem, updateQty, openDrawer, closeDrawer, getItems, getTotal, checkout };
})();
