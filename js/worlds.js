/* ============================================
   MARIE HARTIG STUDIO — Painted Worlds Slideshow
   Static crossfade, no text, no controls
   ============================================ */

const WORLDS_INTERVAL = 3600;

function worldsSlideSrc(entry) {
  const raw = typeof entry === 'string' ? entry : entry.image;
  return '/' + raw.replace(/^(\.\.\/)+/, '').replace(/^\//, '');
}

class WorldsSlideshow {
  constructor(slides) {
    this.current    = 0;
    this.slides     = slides;
    this.total      = slides.length;
    this.container  = document.querySelector('.worlds-slideshow');
    this.progressEl = document.querySelector('.worlds-progress');
    this.slideEls   = [];

    this._build();
    this._init();
  }

  _build() {
    this.slides.forEach((entry, i) => {
      const div = document.createElement('div');
      div.className = 'worlds-slide' + (i === 0 ? ' active' : '');

      const img = document.createElement('img');
      img.src = worldsSlideSrc(entry);
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      if (i !== 0) img.loading = 'lazy';

      div.appendChild(img);
      this.container.appendChild(div);
      this.slideEls.push(div);
    });
  }

  _init() {
    this._startProgress();
    setInterval(() => this._next(), WORLDS_INTERVAL);
  }

  _next() {
    this.slideEls[this.current].classList.remove('active');
    this.current = (this.current + 1) % this.total;
    this.slideEls[this.current].classList.add('active');
    this._startProgress();
  }

  _startProgress() {
    if (!this.progressEl) return;
    this.progressEl.style.transition = 'none';
    this.progressEl.style.width = '0%';
    void this.progressEl.offsetWidth;
    this.progressEl.style.transition = `width ${WORLDS_INTERVAL}ms linear`;
    this.progressEl.style.width = '100%';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  fetch('../_content/slideshow-home.json')
    .then(res => res.json())
    .then(data => new WorldsSlideshow(data.slides || []));
});
