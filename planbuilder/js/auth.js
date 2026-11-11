// PlanBuilder sign-in: the same company sign-in as the GrayCo CRM. Only people the CRM lets in can use PlanBuilder.
//
// It shares the CRM's own session (localStorage "gc_auth_v1", same address crm.grayco-cs.com), so someone signed in
// to the CRM walks straight in, and signing in here signs in to the CRM too. It follows the CRM's rules:
//   • Supabase email + password sign-in (the CRM's project and public key)
//   • the staff list: gc_staff row for the email, active (marketing-only profiles are not let in: PlanBuilder shows prices)
//   • a starting / temporary password must be changed in the CRM first
//   • signed out after the CRM's idle time (gc_idle_hours, default 8 h) without use; work in PlanBuilder counts as use
//   • tokens are refreshed the way the CRM does it (a newer token another tab saved is used instead of refreshing again)
// The program files themselves are public like every page of the site; what this protects is using the tool.
// Company data (jobs, CRM prices) is protected by the database's own rules and never sits in these files.

const SB_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
const KEY = 'gc_auth_v1', ACT = 'gc_auth_last_active';

const now = () => Date.now();
const low = v => String(v == null ? '' : v).trim().toLowerCase();
function load() { try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && j.access_token && j.refresh_token && j.email) return j; } catch (e) { /* ignore */ } return null; }
function store(s) { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
function idleMs() { try { const h = parseFloat(localStorage.getItem('gc_idle_hours')); if (h > 0) return h * 3600e3; } catch (e) { /* ignore */ } return 8 * 3600e3; }
function lastActive() { try { const v = parseInt(localStorage.getItem(ACT), 10); return v > 0 ? v : 0; } catch (e) { return 0; } }
let lastWrite = 0;
function touch(force) { const t = now(); if (force || t - lastWrite > 30e3) { lastWrite = t; try { localStorage.setItem(ACT, String(t)); } catch (e) { /* ignore */ } } }

// The CRM's session record, so the CRM accepts a sign-in made here.
function fromAuth(j, prev) {
  const u = j.user || {};
  return {
    access_token: j.access_token, refresh_token: j.refresh_token,
    expires_at: j.expires_at || Math.floor(now() / 1000) + (j.expires_in || 3600),
    email: low(u.email || (prev && prev.email)), uid: u.id || (prev && prev.uid) || '',
    role: prev ? prev.role : '', roleKnown: prev ? !!prev.roleKnown : false, marketing: prev ? !!prev.marketing : false,
    validatedAt: now(),
  };
}
function jwtMeta(tok) {
  try {
    let b = String(tok || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '=';
    const j = JSON.parse(decodeURIComponent(Array.prototype.map.call(atob(b), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
    return (j && j.app_metadata) || {};
  } catch (e) { return {}; }
}
async function authPost(path, body, token) {
  const h = { apikey: ANON, 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  try {
    const r = await fetch(SB_URL + '/auth/v1/' + path, { method: 'POST', headers: h, body: JSON.stringify(body || {}) });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* ignore */ }
    return { ok: r.ok, status: r.status, json: j || {} };
  } catch (e) { return { ok: false, status: 0, net: true, json: {} }; }
}

// Where the sign-in is required: the live site and Netlify previews. ("pb.forceGate" turns it on anywhere, for tests.)
export function gateNeeded(host = location.hostname) {
  try { if (localStorage.getItem('pb.forceGate') === '1') return true; } catch (e) { /* ignore */ }
  return /(^|\.)grayco-cs\.com$/i.test(host) || /\.netlify\.app$/i.test(host);
}

let S = null, refreshing = null, timer = null;
async function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const disk = load();   // another tab (or the CRM) may already have refreshed: use its newer token
      if (disk && S && disk.refresh_token !== S.refresh_token && disk.email === S.email && disk.expires_at * 1000 - now() > 120e3) { S = disk; return 'ok'; }
      if (!S) return 'none';
      const r = await authPost('token?grant_type=refresh_token', { refresh_token: S.refresh_token });
      if (r.ok && r.json.access_token) { S = fromAuth(r.json, S); store(S); return 'ok'; }
      if (r.net || r.status >= 500 || r.status === 429) return 'offline';
      S = null; store(null); return 'ended';
    } finally { refreshing = null; }
  })();
  return refreshing;
}
function schedule() {
  clearTimeout(timer);
  if (!S) return;
  const ms = Math.max(5000, S.expires_at * 1000 - now() - 120e3);
  timer = setTimeout(async () => { const r = await refresh(); if (r === 'ended') lock('Your sign-in has ended. Please sign in again.'); else schedule(); }, Math.min(ms, 2147483000));
}

// 'staff' | 'not-staff' | 'marketing' | 'expired' | 'no-table' | 'offline'
async function checkStaff() {
  try {
    const r = await fetch(SB_URL + '/rest/v1/gc_staff?select=*&email=eq.' + encodeURIComponent(S.email), { headers: { apikey: ANON, Authorization: 'Bearer ' + S.access_token } });
    if (r.status === 401) return 'expired';
    if (!r.ok) return 'no-table';   // before the CRM's lockdown SQL: the sign-in alone decides, as in the CRM
    const rows = await r.json(), row = Array.isArray(rows) && rows[0];
    const mkt = !!row && row.active === false && low(row.profile) === 'marketing' && row.mkt_active === true && low(row.role || 'staff') !== 'admin';
    if (mkt) return 'marketing';
    if (!row || row.active === false) return 'not-staff';
    S.role = low(row.role || 'staff'); S.profile = low(row.profile || ''); S.roleKnown = true; S.marketing = false; store(S);
    return 'staff';
  } catch (e) { return 'offline'; }
}

// ---------- the sign-in screen ----------
let box = null, resolveGate = null;
function screen(msg, mode = 'form') {
  if (!box) {
    box = document.createElement('div'); box.id = 'pb-gate'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Sign in');
    document.body.append(box);
  }
  document.body.classList.add('locked');
  const last = (() => { try { return localStorage.getItem('gc_auth_last_email') || ''; } catch (e) { return ''; } })();
  box.innerHTML = `<form class="gate-card" autocomplete="on" novalidate>
      <img src="img/grayco-logo-navy.png" alt="GrayCo" class="gate-logo">
      <h1>PlanBuilder 3D</h1>
      <p class="gate-sub">Sign in with your GrayCo CRM email and password. Only the GrayCo team can use PlanBuilder.</p>
      <div class="gate-msg" role="alert"></div>
      ${mode === 'form' ? `<label>Email<input id="gate-email" type="email" autocomplete="username" required></label>
      <label>Password<input id="gate-pw" type="password" autocomplete="current-password" required></label>
      <button class="gate-go" type="submit">Sign in</button>
      <p class="gate-foot">Forgot your password, or a new starting password? Sign in on <a href="/">the CRM</a> first.</p>`
      : `<a class="gate-go" href="/">Open the CRM</a><button class="gate-alt" type="button" id="gate-other">Sign in as someone else</button>`}
    </form>`;
  box.querySelector('.gate-msg').textContent = msg || '';
  const f = box.querySelector('form');
  if (mode === 'form') {
    const em = box.querySelector('#gate-email'), pw = box.querySelector('#gate-pw');
    em.value = (S && S.email) || last; (em.value ? pw : em).focus();
    f.onsubmit = async e => {
      e.preventDefault();
      const go = box.querySelector('.gate-go'); go.disabled = true; go.textContent = 'Signing in…';
      const done = await signIn(em.value.trim(), pw.value);
      if (box && go.isConnected) { go.disabled = false; go.textContent = 'Sign in'; }
      if (!done) pw.value = '';
    };
  } else {
    f.onsubmit = e => e.preventDefault();
    box.querySelector('#gate-other').onclick = () => { const t = S && S.access_token; S = null; store(null); if (t) authPost('logout', {}, t); screen(''); };
  }
}
function unlock() {
  if (box) { box.remove(); box = null; }
  document.body.classList.remove('locked');
  touch(true); schedule();
  if (resolveGate) { const r = resolveGate; resolveGate = null; r(S); }
}
function lock(msg) {
  const t = S && S.access_token;
  S = null; store(null); clearTimeout(timer);
  if (t) authPost('logout', {}, t);
  screen(msg);   // the next sign-in unlocks (and starts the app, if it was still waiting for one)
}

async function signIn(email, password) {
  const say = m => { if (box) box.querySelector('.gate-msg').textContent = m; };
  if (!email || !password) { say('Type your email and password.'); return false; }
  const r = await authPost('token?grant_type=password', { email, password });
  if (r.net) { say('Cannot reach the sign-in service. Check the internet connection and try again.'); return false; }
  if (!r.ok || !r.json.access_token) { say(r.status === 429 ? 'Too many tries. Wait a minute and try again.' : 'That email and password do not match a GrayCo sign-in.'); return false; }
  S = fromAuth(r.json, null); store(S);
  try { localStorage.setItem('gc_auth_last_email', low(email)); } catch (e) { /* ignore */ }
  return admit(true);
}

// Decide for the current session S: let in, or show why not. Returns true when let in.
async function admit(fresh) {
  if (jwtMeta(S.access_token).must_change_password === true) {
    touch(true);   // keep the CRM's sign-in alive so it can ask for the new password
    screen('You are signed in with a starting password. Open the CRM and choose your own password, then come back here.', 'crm');
    return false;
  }
  let st = await checkStaff();
  if (st === 'expired') { const r = await refresh(); st = r === 'ok' ? await checkStaff() : r === 'offline' ? 'offline' : 'ended'; }
  if (st === 'staff' || st === 'no-table') { unlock(); return true; }
  if (st === 'offline' && !fresh && S && S.roleKnown && !S.marketing && S.role) { unlock(); return true; }   // the CRM works offline too
  const t = S && S.access_token;
  if (st === 'not-staff' || st === 'marketing' || st === 'ended') {
    S = null; store(null); if (t) authPost('logout', {}, t);
    screen(st === 'not-staff' ? 'This account is not on the GrayCo staff list. Ask Wesley or Nick to add you.'
      : st === 'marketing' ? 'Marketing sign-ins cannot open PlanBuilder.' : 'Your sign-in has ended. Please sign in again.');
    return false;
  }
  screen('Cannot reach the sign-in service. Check the internet connection and try again.');
  return false;
}

// Resolves once a GrayCo staff member is signed in. Call before the app starts.
export function requireSignIn() {
  if (!gateNeeded()) { document.body.classList.remove('locked'); return Promise.resolve(null); }
  const p = new Promise(res => { resolveGate = res; });
  (async () => {
    S = load();
    if (S && lastActive() && now() - lastActive() > idleMs()) { lock('Signed out after ' + Math.round(idleMs() / 3600e3 * 10) / 10 + ' hours without use. Sign in to carry on.'); return; }
    if (S && S.expires_at * 1000 - now() < 90e3) { const r = await refresh(); if (r === 'ended') { screen('Your sign-in has ended. Please sign in again.'); return; } }
    if (!S) { screen(''); return; }
    await admit(false);
  })();
  // while open: work here counts as use; idle sign-out; the CRM signing out signs out here too
  ['mousedown', 'keydown', 'touchstart', 'wheel', 'pointermove'].forEach(t => document.addEventListener(t, () => { if (S && !box) touch(false); }, { capture: true, passive: true }));
  setInterval(() => { if (S && !box && now() - Math.max(lastActive(), lastWrite) > idleMs()) lock('Signed out after ' + Math.round(idleMs() / 3600e3 * 10) / 10 + ' hours without use. Sign in to carry on — nothing was lost.'); }, 60e3);
  window.addEventListener('storage', e => {
    if (e.key !== KEY) return;
    const d = load();
    if (!d && S && !box) lock('Signed out (from the CRM).');
    else if (d && S && d.email === S.email) S = d;   // the CRM refreshed the token
    else if (d && S && !box && d.email !== S.email) { S = d; admit(false); }   // someone else signed in to the CRM here
  });
  return p;
}

export function signOut() { return lock('Signed out.'); }
export function signedInEmail() { return S ? S.email : ''; }
