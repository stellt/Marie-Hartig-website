/* ============================================
   MARIE HARTIG STUDIO — Portfolio Access Notice
   Non-blocking bubble on the Portfolio thumbnail grid: lets a visitor sign in
   or create an account, without hiding the thumbnails or blocking scroll.
   The actual gate that blocks real content lives on the individual collection
   pages (portfolio-gate.js) -- this reuses the same server-side check/token
   so credentials entered here also grant access once they click through.
   ============================================ */

const NOTICE_TOKEN_KEY = 'portfolioAccessToken';
const NOTICE_DISMISS_KEY = 'portfolioNoticeDismissed';
const NOTICE_REGISTERED_USERS_KEY = 'portfolioRegisteredUsers';
const NOTICE_ENDPOINT = '/.netlify/functions/portfolio-gate';

function hashPassword(password) {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function getRegisteredUsers() {
  const stored = localStorage.getItem(NOTICE_REGISTERED_USERS_KEY);
  return stored ? JSON.parse(stored) : {};
}

function registerUser(email, password) {
  const users = getRegisteredUsers();
  const lowerEmail = email.toLowerCase();
  users[lowerEmail] = hashPassword(password);
  localStorage.setItem(NOTICE_REGISTERED_USERS_KEY, JSON.stringify(users));
}

function isRegistered(email, password) {
  const users = getRegisteredUsers();
  const lowerEmail = email.toLowerCase();
  return users[lowerEmail] === hashPassword(password);
}

function buildNotice() {
  const backdrop = document.createElement('div');
  backdrop.className = 'portfolio-notice-backdrop';
  backdrop.hidden = true;

  const bubble = document.createElement('div');
  bubble.className = 'portfolio-notice-bubble';
  bubble.hidden = true;
  bubble.innerHTML = `
    <button type="button" class="portfolio-notice-close" id="portfolio-notice-close" aria-label="Dismiss">&times;</button>
    <div class="portfolio-notice-title">Portfolio Access</div>
    <div class="portfolio-notice-sub">Sign in or create an account to view collections.</div>
    <form class="portfolio-notice-form" id="portfolio-notice-form">
      <input type="email" id="portfolio-notice-email" placeholder="Email" autocomplete="email" required />
      <input type="password" id="portfolio-notice-password" placeholder="Password" autocomplete="current-password" required />
      <button type="submit">Sign In</button>
    </form>
    <div class="portfolio-notice-error" id="portfolio-notice-error"></div>
    <div style="display: flex; gap: 0.5rem; margin-top: 0.8rem; justify-content: center; flex-wrap: wrap;">
      <button type="button" class="portfolio-notice-toggle" id="portfolio-notice-toggle">Don't have an account? Create one</button>
      <button type="button" class="portfolio-notice-toggle" id="portfolio-notice-forgot">Forgot Password?</button>
    </div>

    <div class="portfolio-notice-register" id="portfolio-notice-register" hidden>
      <form class="portfolio-notice-register-form" id="portfolio-notice-register-form">
        <input type="email" id="portfolio-notice-register-email" placeholder="Email" autocomplete="email" required />
        <input type="password" id="portfolio-notice-register-password" placeholder="Password" autocomplete="new-password" required />
        <input type="password" id="portfolio-notice-register-password-confirm" placeholder="Confirm Password" autocomplete="new-password" required />
        <button type="submit">Create Account</button>
      </form>
      <div class="portfolio-notice-register-error" id="portfolio-notice-register-error"></div>
      <div class="portfolio-notice-register-success" id="portfolio-notice-register-success" style="display:none;">
        Account created! You can now sign in above.
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
  const emailInput = bubble.querySelector('#portfolio-notice-email');
  const passwordInput = bubble.querySelector('#portfolio-notice-password');
  const errorEl = bubble.querySelector('#portfolio-notice-error');
  const toggleBtn = bubble.querySelector('#portfolio-notice-toggle');
  const registerBox = bubble.querySelector('#portfolio-notice-register');
  const registerForm = bubble.querySelector('#portfolio-notice-register-form');
  const registerEmailInput = bubble.querySelector('#portfolio-notice-register-email');
  const registerPasswordInput = bubble.querySelector('#portfolio-notice-register-password');
  const registerPasswordConfirmInput = bubble.querySelector('#portfolio-notice-register-password-confirm');
  const registerErrorEl = bubble.querySelector('#portfolio-notice-register-error');
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
    errorEl.textContent = '';
    registerErrorEl.textContent = '';
  });

  const forgotBtn = bubble.querySelector('#portfolio-notice-forgot');
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

    const granted = await requestGate({ login: { email: emailInput.value, password: passwordInput.value } });
    if (granted) {
      hideNotice();
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
    const granted = await requestGate({ register: { email: email, password: password } });
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
  if (stored && (await requestGate({ token: stored }))) {
    // Already has valid access — don't show notice
    return;
  }

  // Only show notice if not already logged in
  const els = buildNotice();
  wireNotice(els);
  els.backdrop.hidden = false;
  els.bubble.hidden = false;
});
