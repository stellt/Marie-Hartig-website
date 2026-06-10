/* ============================================
   MARIE HARTIG STUDIO — Painted Worlds Slideshow
   Static crossfade, no text, no controls
   ============================================ */

const WORLDS_SLIDES = [
  '../assets/images/portfolio/02 HOME PAGE/homepage-1.jpg',
  '../assets/images/portfolio/02 HOME PAGE/homepage-2.jpg',
  '../assets/images/portfolio/02 HOME PAGE/homepage-3.jpg',
  '../assets/images/portfolio/02 HOME PAGE/homepage-4.jpg',
  '../assets/images/portfolio/02 HOME PAGE/homepage-5.jpg',
  '../assets/images/portfolio/02 HOME PAGE/homepage-6.jpg',
  '../assets/images/portfolio/02 HOME PAGE/homepage-7.jpg',
  '../assets/images/portfolio/02 HOME PAGE/homepage-8.jpg',
  '../assets/images/portfolio/02 HOME PAGE/homepage-9.jpg',
  '../assets/images/portfolio/02 HOME PAGE/homepage-10.jpg',
];

const WORLDS_INTERVAL = 3600;

class WorldsSlideshow {
  constructor() {
    this.current    = 0;
    this.total      = WORLDS_SLIDES.length;
    this.container  = document.querySelector('.worlds-slideshow');
    this.progressEl = document.querySelector('.worlds-progress');
    this.slideEls   = [];

    this._build();
    this._init();
  }

  _build() {
    WORLDS_SLIDES.forEach((src, i) => {
      const div = document.createElement('div');
      div.className = 'worlds-slide' + (i === 0 ? ' active' : '');

      const img = document.createElement('img');
      img.src = src;
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

document.addEventListener('DOMContentLoaded', () => new WorldsSlideshow());
