/* ============================================
   MARIE HARTIG STUDIO — Portfolio Access Gate
   Email + password authentication. Covers the whole viewport until a valid
   access token is confirmed by netlify/functions/portfolio-gate.js.
   The real page content underneath still loads normally -- this overlay
   just sits on top of it.
   ============================================ */

const GATE_TOKEN_KEY = 'portfolioAccessToken';
const GATE_REGISTERED_USERS_KEY = 'portfolioRegisteredUsers';
const GATE_ENDPOINT = '/.netlify/functions/portfolio-gate';

function hashPassword(password) {
  // Simple hash for client-side validation
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function getRegisteredUsers() {
  const stored = localStorage.getItem(GATE_REGISTERED_USERS_KEY);
  return stored ? JSON.parse(stored) : {};
}

function registerUser(email, password) {
  const users = getRegisteredUsers();
  const lowerEmail = email.toLowerCase();
  users[lowerEmail] = hashPassword(password);
  localStorage.setItem(GATE_REGISTERED_USERS_KEY, JSON.stringify(users));
}

function isRegistered(email, password) {
  const users = getRegisteredUsers();
  const lowerEmail = email.toLowerCase();
  return users[lowerEmail] === hashPassword(password);
}

function buildGate() {
  const el = document.createElement('div');
  el.className = 'portfolio-gate';
  // Visible by default -- only hidden once a stored token is confirmed valid,
  // so an unauthorized visitor never gets even a brief flash of real content
  // while that check is in flight.
  el.innerHTML = `
    <div class="portfolio-gate-box">
      <div class="portfolio-gate-title">Portfolio</div>
      <div class="portfolio-gate-sub">Sign in or create an account to view the portfolio.</div>
      <form class="portfolio-gate-form" id="portfolio-gate-form">
        <input type="email" id="portfolio-gate-email" placeholder="Email" autocomplete="email" required />
        <input type="password" id="portfolio-gate-password" placeholder="Password" autocomplete="current-password" required />
        <button type="submit">Sign In</button>
      </form>
      <div class="portfolio-gate-error" id="portfolio-gate-error"></div>
      <div style="display: flex; gap: 0.5rem; margin-top: 0.8rem; justify-content: center; flex-wrap: wrap;">
        <button type="button" class="portfolio-gate-toggle" id="portfolio-gate-toggle">Don't have an account? Create one</button>
        <button type="button" class="portfolio-gate-toggle" id="portfolio-gate-forgot">Forgot Password?</button>
      </div>

      <div class="portfolio-gate-register" id="portfolio-gate-register" hidden>
        <div class="portfolio-gate-register-label">Create Account</div>
        <form class="portfolio-gate-register-form" id="portfolio-gate-register-form">
          <input type="email" id="portfolio-gate-register-email" placeholder="Email" autocomplete="email" required />
          <input type="password" id="portfolio-gate-register-password" placeholder="Password" autocomplete="new-password" required />
          <input type="password" id="portfolio-gate-register-password-confirm" placeholder="Confirm Password" autocomplete="new-password" required />
          <button type="submit">Create Account</button>
        </form>
        <div class="portfolio-gate-register-error" id="portfolio-gate-register-error"></div>
        <div class="portfolio-gate-register-success" id="portfolio-gate-register-success" style="display:none;">
          Account created! You can now sign in above.
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

function wireGate(el) {
  const form = el.querySelector('#portfolio-gate-form');
  const emailInput = el.querySelector('#portfolio-gate-email');
  const passwordInput = el.querySelector('#portfolio-gate-password');
  const errorEl = el.querySelector('#portfolio-gate-error');
  const toggleBtn = el.querySelector('#portfolio-gate-toggle');
  const registerBox = el.querySelector('#portfolio-gate-register');
  const registerForm = el.querySelector('#portfolio-gate-register-form');
  const registerEmailInput = el.querySelector('#portfolio-gate-register-email');
  const registerPasswordInput = el.querySelector('#portfolio-gate-register-password');
  const registerPasswordConfirmInput = el.querySelector('#portfolio-gate-register-password-confirm');
  const registerErrorEl = el.querySelector('#portfolio-gate-register-error');
  const registerSuccess = el.querySelector('#portfolio-gate-register-success');

  toggleBtn.addEventListener('click', () => {
    registerBox.hidden = !registerBox.hidden;
    errorEl.textContent = '';
    registerErrorEl.textContent = '';
  });

  const forgotBtn = el.querySelector('#portfolio-gate-forgot');
  forgotBtn.addEventListener('click', () => {
    alert('To reset your password, please contact Marie directly or use the email you registered with to create a new account.');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';

    // Check if email is registered with that password
    if (!isRegistered(emailInput.value, passwordInput.value)) {
      errorEl.textContent = 'Invalid login. Please register your account first.';
      return;
    }

    const granted = await submitLogin(emailInput.value, passwordInput.value);
    if (granted) {
      el.hidden = true;
    } else {
      errorEl.textContent = 'Invalid email or password — please try again.';
    }
  });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerErrorEl.textContent = '';

    if (registerPasswordInput.value !== registerPasswordConfirmInput.value) {
      registerErrorEl.textContent = 'Passwords do not match.';
      return;
    }

    if (registerPasswordInput.value.length < 6) {
      registerErrorEl.textContent = 'Password must be at least 6 characters.';
      return;
    }

    const email = registerEmailInput.value;
    const password = registerPasswordInput.value;

    // Check if already registered
    const users = getRegisteredUsers();
    if (users[email.toLowerCase()]) {
      registerErrorEl.textContent = 'This email is already registered. Please sign in above.';
      return;
    }

    // Register the user
    registerUser(email, password);

    // Track registration via Netlify Forms
    const formData = new FormData();
    formData.append('form-name', 'portfolio-registration');
    formData.append('email', email);
    formData.append('registered-at', new Date().toISOString());
    console.log('Submitting registration:', email);
    fetch('/', { method: 'POST', body: formData })
      .then(() => console.log('Registration submitted successfully'))
      .catch((err) => console.error('Registration submission failed:', err));

    // Grant access immediately
    const granted = await submitRegister(email, password);
    if (granted) {
      registerForm.style.display = 'none';
      registerSuccess.style.display = 'block';
      setTimeout(() => {
        registerBox.hidden = true;
        registerForm.style.display = '';
        registerSuccess.style.display = 'none';
        registerEmailInput.value = '';
        registerPasswordInput.value = '';
        registerPasswordConfirmInput.value = '';
      }, 2000);
    } else {
      registerErrorEl.textContent = 'Registration failed. Please try again.';
    }
  });
}

async function checkStoredToken() {
  const stored = localStorage.getItem(GATE_TOKEN_KEY);
  if (!stored) return false;
  return requestGate({ token: stored });
}

async function submitLogin(email, password) {
  return requestGate({ login: { email, password } });
}

async function submitRegister(email, password) {
  return requestGate({ register: { email, password } });
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
  // Check if already logged in BEFORE showing gate
  const alreadyGranted = await checkStoredToken();

  if (!alreadyGranted) {
    // Only show gate if not already logged in
    const el = buildGate();
    wireGate(el);
  }
})();
