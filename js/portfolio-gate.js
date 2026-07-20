/* ============================================
   MARIE HARTIG STUDIO — Portfolio Access Gate
   Covers the whole viewport until a valid access token is confirmed by
   netlify/functions/portfolio-gate.js. The real page content underneath
   still loads normally -- this overlay just sits on top of it.
   ============================================ */

const GATE_TOKEN_KEY = 'portfolioAccessToken';
const GATE_ENDPOINT = '/.netlify/functions/portfolio-gate';

function buildGate() {
  const el = document.createElement('div');
  el.className = 'portfolio-gate';
  // Visible by default -- only hidden once a stored token is confirmed valid,
  // so an unauthorized visitor never gets even a brief flash of real content
  // while that check is in flight.
  el.innerHTML = `
    <div class="portfolio-gate-box">
      <div class="portfolio-gate-title">Portfolio</div>
      <div class="portfolio-gate-sub">This section is available to invited visitors. Enter your password below.</div>
      <form class="portfolio-gate-form" id="portfolio-gate-form">
        <input type="password" id="portfolio-gate-password" placeholder="Password" autocomplete="current-password" required />
        <button type="submit">Enter</button>
      </form>
      <div class="portfolio-gate-error" id="portfolio-gate-error"></div>
      <button type="button" class="portfolio-gate-toggle" id="portfolio-gate-toggle">Don't have a password? Request access</button>

      <div class="portfolio-gate-register" id="portfolio-gate-register" hidden>
        <div class="portfolio-gate-register-label">Request Access</div>
        <form class="portfolio-gate-register-form" id="portfolio-gate-register-form" name="portfolio-access-request" method="POST" data-netlify="true">
          <input type="hidden" name="form-name" value="portfolio-access-request" />
          <input type="text" name="name" placeholder="Your name" required />
          <input type="email" name="email" placeholder="Your email" required />
          <textarea name="message" rows="3" placeholder="A little about you (optional)"></textarea>
          <button type="submit">Request Access</button>
        </form>
        <div class="portfolio-gate-register-success" id="portfolio-gate-register-success" style="display:none;">
          Thank you — Marie will be in touch if she approves your request.
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

function wireGate(el) {
  const form = el.querySelector('#portfolio-gate-form');
  const passwordInput = el.querySelector('#portfolio-gate-password');
  const errorEl = el.querySelector('#portfolio-gate-error');
  const toggleBtn = el.querySelector('#portfolio-gate-toggle');
  const registerBox = el.querySelector('#portfolio-gate-register');
  const registerForm = el.querySelector('#portfolio-gate-register-form');
  const registerSuccess = el.querySelector('#portfolio-gate-register-success');

  toggleBtn.addEventListener('click', () => {
    registerBox.hidden = !registerBox.hidden;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const granted = await submitPassword(passwordInput.value);
    if (granted) {
      el.hidden = true;
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

async function checkStoredToken() {
  const stored = localStorage.getItem(GATE_TOKEN_KEY);
  if (!stored) return false;
  return requestGate({ token: stored });
}

async function submitPassword(password) {
  return requestGate({ password });
}

async function requestGate(payload) {
  try {
    const res = await fetch(GATE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.granted) {
      if (data.token) localStorage.setItem(GATE_TOKEN_KEY, data.token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Runs immediately as this script is parsed (it's included near the end of
// <body>, before the page's own content-fetching script), so the overlay
// covers the screen before any real content has a chance to render --
// waiting for DOMContentLoaded would be strictly later than that.
(async () => {
  const el = buildGate();
  wireGate(el);

  const alreadyGranted = await checkStoredToken();
  if (alreadyGranted) {
    el.hidden = true;
  }
})();
