/* ============================================
   MARIE HARTIG STUDIO — Welcome Page Slideshow
   ============================================ */

const INTERVAL = 3600;

function slideSrc(entry) {
  const raw = typeof entry === 'string' ? entry : entry.image;
  return '/' + raw.replace(/^(\.\.\/)+/, '').replace(/^\//, '');
}

class Slideshow {
  constructor(slides) {
    this.current    = 0;
    this.slides     = slides;
    this.total      = slides.length;
    this.container  = document.querySelector('.slideshow');
    this.counterEl  = document.querySelector('.slide-counter');
    this.progressEl = document.querySelector('.progress-bar');
    this.prevEl     = document.querySelector('.slide-prev');
    this.nextEl     = document.querySelector('.slide-next');
    this.slideEls   = [];
    this.timer      = null;

    this._build();
    this._init();
  }

  _build() {
    this.slides.forEach((entry, i) => {
      const div = document.createElement('div');
      div.className = 'slide' + (i === 0 ? ' active' : '');

      const img = document.createElement('img');
      img.className = 'slide__img';
      img.src = imgUrl(slideSrc(entry), 1600);
      img.srcset = imgSrcset(slideSrc(entry));
      img.sizes = '100vw';
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
    this._startTimer();

    if (this.prevEl) this.prevEl.addEventListener('click', () => this._go(-1));
    if (this.nextEl) this.nextEl.addEventListener('click', () => this._go(1));
  }

  _startTimer() {
    clearInterval(this.timer);
    this.timer = setInterval(() => this._go(1), INTERVAL);
  }

  /** Manual or automatic advance. Manual clicks restart the auto-advance
      timer so it doesn't immediately jump again right after. */
  _go(dir) {
    this.slideEls[this.current].classList.remove('active');
    this.current = (this.current + dir + this.total) % this.total;
    this.slideEls[this.current].classList.add('active');
    this._updateCounter();
    this._startProgress();
    this._startTimer();
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

document.addEventListener('DOMContentLoaded', () => {
  fetch('_content/slideshow-opening.json')
    .then(res => res.json())
    .then(data => new Slideshow(data.slides || []));
});
