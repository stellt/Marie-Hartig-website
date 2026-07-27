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
    this.prevEl     = document.querySelector('.worlds-prev');
    this.nextEl     = document.querySelector('.worlds-next');
    this.slideEls   = [];
    this.timer      = null;

    this._build();
    this._init();
  }

  _build() {
    this.slides.forEach((entry, i) => {
      const div = document.createElement('div');
      div.className = 'worlds-slide' + (i === 0 ? ' active' : '');

      const img = document.createElement('img');
      img.sizes = '100vw';
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      img.fetchPriority = i === 0 ? 'high' : 'low';

      div.appendChild(img);
      this.container.appendChild(div);
      this.slideEls.push(div);
    });

    /* Same fix as js/slideshow.js: these slides are stacked on top of each
       other (position: absolute, inset: 0) so native <img loading="lazy">
       can't distinguish any of them from the active one and loads
       everything at once. Load only the active slide plus the one coming
       up next, ourselves. */
    this._loadSlide(0);
    if (this.total > 1) this._loadSlide(1);
  }

  _loadSlide(i) {
    const img = this.slideEls[i].querySelector('img');
    if (img.dataset.loaded) return;
    img.dataset.loaded = '1';
    const src = worldsSlideSrc(this.slides[i]);
    img.src = imgUrl(src, 1600);
    img.srcset = imgSrcset(src);
  }

  _init() {
    this._startProgress();
    this._startTimer();

    if (this.prevEl) this.prevEl.addEventListener('click', () => this._go(-1));
    if (this.nextEl) this.nextEl.addEventListener('click', () => this._go(1));
  }

  _startTimer() {
    clearInterval(this.timer);
    this.timer = setInterval(() => this._go(1), WORLDS_INTERVAL);
  }

  /** Manual or automatic advance. Manual clicks restart the auto-advance
      timer so it doesn't immediately jump again right after. */
  _go(dir) {
    this.slideEls[this.current].classList.remove('active');
    this.current = (this.current + dir + this.total) % this.total;
    this.slideEls[this.current].classList.add('active');
    this._loadSlide(this.current);
    this._loadSlide((this.current + 1) % this.total);
    this._startProgress();
    this._startTimer();
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
