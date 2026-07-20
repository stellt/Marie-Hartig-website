/* ============================================
   MARIE HARTIG STUDIO — Portfolio Access Notice
   Non-blocking bubble on the Portfolio thumbnail grid: lets a visitor enter
   a password (or request one) before clicking into a collection, without
   hiding the thumbnails or blocking scroll. The actual gate that blocks
   real content lives on the individual collection pages (portfolio-gate.js)
   -- this reuses the same server-side check/token so a password entered
   here also grants access once they click through.
   ============================================ */

const NOTICE_TOKEN_KEY = 'portfolioAccessToken';
const NOTICE_DISMISS_KEY = 'portfolioNoticeDismissed';
const NOTICE_ENDPOINT = '/.netlify/functions/portfolio-gate';

function buildNotice() {
  const backdrop = document.createElement('div');
  backdrop.className = 'portfolio-notice-backdrop';
  backdrop.hidden = true;

  const bubble = document.createElement('div');
  bubble.className = 'portfolio-notice-bubble';
  bubble.hidden = true;
  bubble.innerHTML = `
    <button type="button" class="portfolio-notice-close" id="portfolio-notice-close" aria-label="Dismiss">&times;</button>
    <div class="portfolio-notice-title">Request Access</div>
    <div class="portfolio-notice-sub">Viewing a collection in full requires a password. Enter yours below, or request one.</div>
    <form class="portfolio-notice-form" id="portfolio-notice-form">
      <input type="password" id="portfolio-notice-password" placeholder="Password" autocomplete="current-password" required />
      <button type="submit">Enter</button>
    </form>
    <div class="portfolio-notice-error" id="portfolio-notice-error"></div>
    <button type="button" class="portfolio-notice-toggle" id="portfolio-notice-toggle">Don't have a password? Request access</button>

    <div class="portfolio-notice-register" id="portfolio-notice-register" hidden>
      <form class="portfolio-notice-register-form" id="portfolio-notice-register-form" name="portfolio-access-request" method="POST" data-netlify="true">
        <input type="hidden" name="form-name" value="portfolio-access-request" />
        <input type="text" name="name" placeholder="Your name" required />
        <input type="email" name="email" placeholder="Your email" required />
        <textarea name="message" rows="2" placeholder="A little about you (optional)"></textarea>
        <button type="submit">Request Access</button>
      </form>
      <div class="portfolio-notice-register-success" id="portfolio-notice-register-success" style="display:none;">
        Thank you — Marie will be in touch if she approves your request.
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(bubble);
  return { backdrop, bubble };
}

function wireNotice({ backdrop, bubble }) {
  const closeBtn = bubble.querySelector('#portfolio-notice-close');
  const form = bubble.querySelector('#portfolio-notice-form');
  const passwordInput = bubble.querySelector('#portfolio-notice-password');
  const errorEl = bubble.querySelector('#portfolio-notice-error');
  const toggleBtn = bubble.querySelector('#portfolio-notice-toggle');
  const registerBox = bubble.querySelector('#portfolio-notice-register');
  const registerForm = bubble.querySelector('#portfolio-notice-register-form');
  const registerSuccess = bubble.querySelector('#portfolio-notice-register-success');

  function hideNotice() {
    backdrop.hidden = true;
    bubble.hidden = true;
  }

  closeBtn.addEventListener('click', () => {
    sessionStorage.setItem(NOTICE_DISMISS_KEY, '1');
    hideNotice();
  });

  toggleBtn.addEventListener('click', () => {
    registerBox.hidden = !registerBox.hidden;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const granted = await requestGate({ password: passwordInput.value });
    if (granted) {
      hideNotice();
    } else {
      errorEl.textContent = 'Incorrect password — please try again.';
    }
  });

  registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(registerForm)).toString(),
    })
      .then(() => {
        registerForm.style.display = 'none';
        registerSuccess.style.display = 'block';
      })
      .catch(() => alert('Sorry, something went wrong — please try again or contact Marie directly.'));
  });
}

async function requestGate(payload) {
  try {
    const res = await fetch(NOTICE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.granted) {
      if (data.token) localStorage.setItem(NOTICE_TOKEN_KEY, data.token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (sessionStorage.getItem(NOTICE_DISMISS_KEY)) return;

  const stored = localStorage.getItem(NOTICE_TOKEN_KEY);
  if (stored && (await requestGate({ token: stored }))) return; // already has valid access -- no nag needed

  const els = buildNotice();
  wireNotice(els);
  els.backdrop.hidden = false;
  els.bubble.hidden = false;
});
