/* ============================================
   MARIE HARTIG STUDIO — Site Maintenance Mode
   Toggled from the CMS (Page Text > Site Maintenance). When on, every
   public page redirects to /maintenance.html. Never gates /admin/ or the
   maintenance page itself -- otherwise there'd be no way to turn it back
   off once switched on.
   ============================================ */
(function () {
  const path = window.location.pathname;
  if (path.startsWith('/admin') || path.endsWith('/maintenance.html')) return;

  // Path from this page back to the site root, so the redirect works
  // whether we're at "/", "/pages/", or "/pages/collections/".
  const depth = (path.match(/\//g) || []).length - 1;
  const root = depth > 0 ? '../'.repeat(depth) : '';

  fetch(root + '_content/site-maintenance.json')
    .then(res => res.json())
    .then(data => {
      if (data.maintenance_mode) {
        window.location.href = root + 'maintenance.html';
      }
    })
    .catch(() => {});
})();
