/* ============================================
   MARIE HARTIG STUDIO — Welcome Page Slideshow
   ============================================ */

const SLIDES = [
  { src: 'assets/images/portfolio/01 OPENING PAGE/open-page-1.jpg' },
  { src: 'assets/images/portfolio/01 OPENING PAGE/open-page-2.jpg' },
  { src: 'assets/images/portfolio/01 OPENING PAGE/open-page-3.jpg' },
  { src: 'assets/images/portfolio/01 OPENING PAGE/open-page-4.jpg' },
  { src: 'assets/images/portfolio/01 OPENING PAGE/open-page-5.jpg' },
  { src: 'assets/images/portfolio/01 OPENING PAGE/open-page-6.jpg' },
  { src: 'assets/images/portfolio/01 OPENING PAGE/open-page-7.jpg' },
  { src: 'assets/images/portfolio/01 OPENING PAGE/open-page-8.jpg' },
  { src: 'assets/images/portfolio/01 OPENING PAGE/open-page-9.jpg' },
  { src: 'assets/images/portfolio/01 OPENING PAGE/open-page-10.jpg' },
];

const INTERVAL = 3600;

class Slideshow {
  constructor() {
    this.current    = 0;
    this.total      = SLIDES.length;
    this.container  = document.querySelector('.slideshow');
    this.counterEl  = document.querySelector('.slide-counter');
    this.progressEl = document.querySelector('.progress-bar');
    this.slideEls   = [];

    this._build();
    this._init();
  }

  _build() {
    SLIDES.forEach((data, i) => {
      const div = document.createElement('div');
      div.className = 'slide' + (i === 0 ? ' active' : '');

      const img = document.createElement('img');
      img.className = 'slide__img';
      img.src = data.src;
      img.alt = 'Marie Hartig Studio';
      if (i !== 0) img.loading = 'lazy';

      div.appendChild(img);
      this.container.appendChild(div);
      this.slideEls.push(div);
    });
  }

  _init() {
    this._updateCounter();
    this._startProgress();
    setInterval(() => this._next(), INTERVAL);
  }

  _next() {
    this.slideEls[this.current].classList.remove('active');
    this.current = (this.current + 1) % this.total;
    this.slideEls[this.current].classList.add('active');
    this._updateCounter();
    this._startProgress();
  }

  _startProgress() {
    if (!this.progressEl) return;
    this.progressEl.style.transition = 'none';
    this.progressEl.style.width = '0%';
    void this.progressEl.offsetWidth;
    this.progressEl.style.transition = `width ${INTERVAL}ms linear`;
    this.progressEl.style.width = '100%';
  }

  _updateCounter() {
    if (!this.counterEl) return;
    const pad = n => String(n).padStart(2, '0');
    this.counterEl.textContent = `${pad(this.current + 1)} / ${pad(this.total)}`;
  }
}

document.addEventListener('DOMContentLoaded', () => new Slideshow());
