/* ============================================
   MARIE HARTIG STUDIO — Site Design Settings
   Applies the "Site Design" CMS entry (text size/color, page
   background) as CSS custom properties. Runs on every page.
   Defensive: if the fetch fails or the file is missing, the CSS
   defaults already baked into main.css keep the site looking normal.
   ============================================ */

/* No "default" entries in these maps on purpose — when text_color or
   font_family is "default", the lookup below is undefined and the
   custom property is left unset, so CSS falls back per-rule to that
   rule's own original color/font (see main.css :root comment). */
const TEXT_COLORS = {
  charcoal: '#333333',
  grey: '#555555',
  black: '#111111',
};

const TEXT_SCALES = {
  small: 0.9,
  medium: 1,
  large: 1.15,
};

const FONT_FAMILIES = {
  playfair: "'Playfair Display', serif",
  montserrat: "'Montserrat', sans-serif",
  poppins: "'Poppins', sans-serif",
  merriweather: "'Merriweather', serif",
  lato: "'Lato', sans-serif",
};

document.addEventListener('DOMContentLoaded', () => {
  fetch('/_content/site-design.json')
    .then(res => res.json())
    .then(data => {
      const root = document.documentElement.style;

      if (data.background_color) {
        root.setProperty('--site-bg', data.background_color);
      }
      if (TEXT_COLORS[data.text_color]) {
        root.setProperty('--body-text-color', TEXT_COLORS[data.text_color]);
      }
      if (TEXT_SCALES[data.text_size] != null) {
        root.setProperty('--text-scale', TEXT_SCALES[data.text_size]);
      }
      if (FONT_FAMILIES[data.font_family]) {
        root.setProperty('--content-font-family', FONT_FAMILIES[data.font_family]);
      }
    })
    .catch(() => {});
});
