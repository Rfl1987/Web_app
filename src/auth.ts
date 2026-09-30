const PASS_KEY = 'myauto-pass-hash';
const SESSION_KEY = 'myauto-session';
const SESSION_HOURS = 12;

function hash(text: string): string {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export function hasPassword(): boolean {
  return !!localStorage.getItem(PASS_KEY);
}

export function isAuthed(): boolean {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return false;
  const until = Number(raw);
  return Number.isFinite(until) && Date.now() < until;
}

export function setSession() {
  localStorage.setItem(SESSION_KEY, String(Date.now() + SESSION_HOURS * 3600 * 1000));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function setPassword(pass: string) {
  localStorage.setItem(PASS_KEY, hash(pass));
}

export function checkPassword(pass: string): boolean {
  return hash(pass) === localStorage.getItem(PASS_KEY);
}

export function showLoginScreen(onSuccess: () => void) {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  const setup = !hasPassword();
  app.innerHTML = `
<main class="shell">
<section class="hero">
<div>
<div class="brand">MY<span>AUTO</span></div>
<p class="eyebrow">${setup ? 'FIRST TIME SETUP' : 'SECURED APP'}</p>
<h1>${setup ? 'Create password' : 'Login'}</h1>
<p class="muted">${
    setup
      ? 'Set the password that will be used to open this app on this device.'
      : 'Enter the password to open the app.'
  }</p>
</div>
</section>
<form id="loginForm" class="form">
<label>
Password
<input id="loginPass" type="password" required placeholder="••••••" autocomplete="current-password" />
</label>
${
  setup
    ? `
<label>
Repeat password
<input id="loginPass2" type="password" required placeholder="••••••" />
</label>
`
    : ''
}
<p class="muted" id="loginError" style="display:none;color:var(--red);font-weight:700"></p>
<button class="primary" type="submit">${setup ? 'Create & enter' : 'Login'}</button>
</form>
</main>
`;
  const form = document.querySelector<HTMLFormElement>('#loginForm')!;
  const err = document.querySelector<HTMLParagraphElement>('#loginError')!;
  const showErr = (msg: string) => {
    err.textContent = msg;
    err.style.display = 'block';
  };
  form.addEventListener('submit', e => {
    e.preventDefault();
    const pass = document.querySelector<HTMLInputElement>('#loginPass')!.value;
    if (setup) {
      const pass2 = document.querySelector<HTMLInputElement>('#loginPass2')!.value;
      if (pass.length < 4) return showErr('Password must be at least 4 characters.');
      if (pass !== pass2) return showErr('Passwords do not match.');
      setPassword(pass);
      setSession();
      try {
        onSuccess();
      } catch (e) {
        console.error(e);
        showErr('Start error: ' + (e as Error).message);
      }
      return;
    }
    if (!checkPassword(pass)) return showErr('Wrong password.');
    setSession();
    try {
      onSuccess();
    } catch (e) {
      console.error(e);
      showErr('Start error: ' + (e as Error).message);
    }
  });
}
