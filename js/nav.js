// Mobile nav dropdown toggle.
// Only affects the small-screen layout — desktop nav is untouched by CSS,
// this script simply toggles a class that the mobile media query reacts to.
document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav-toggle');

  if (!nav || !toggle) return;

  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('nav-open');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  // Close the dropdown when a nav link is tapped
  nav.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });

  // Close the dropdown if the cart button inside it is tapped
  // (cart drawer logic itself lives in cart.js, this just closes the nav panel)
  const cartBtnInNav = nav.querySelector('.cart-icon-btn');
  if (cartBtnInNav) {
    cartBtnInNav.addEventListener('click', () => {
      nav.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  }
});
