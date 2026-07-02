/* ============================================
   MARIE HARTIG STUDIO — Responsive image helper
   Serves properly-sized images via Netlify's Image CDN instead of
   shipping full camera-original files to every device.
   ============================================ */

const IMG_WIDTHS = [480, 800, 1200, 1600];

function imgUrl(src, width, quality = 75) {
  return `/.netlify/images?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
}

function imgSrcset(src, widths = IMG_WIDTHS, quality = 75) {
  return widths.map(w => `${imgUrl(src, w, quality)} ${w}w`).join(', ');
}

/** Builds the src/srcset/sizes attribute string for an <img> template. */
function imgAttrs(src, sizes, widths = IMG_WIDTHS) {
  const fallbackWidth = widths[widths.length - 1];
  return `src="${imgUrl(src, fallbackWidth)}" srcset="${imgSrcset(src, widths)}" sizes="${sizes}"`;
}
