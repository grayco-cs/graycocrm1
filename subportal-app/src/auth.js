/**
 * ============================================================
 *  GrayCo Portal — sign-in
 * ============================================================
 *
 *  One Supabase sign-in, kept the same way the CRM keeps it (browser key
 *  gc_auth_v1, same shape), so at crm.grayco-cs.com/subportal/ GrayCo staff are
 *  already signed in. At portal.grayco-cs.com the browser keeps its own sign-in.
 *
 *  GrayCo staff (the CRM's gc_staff list) are the portal's admins and use their
 *  CRM password. Subcontractors register on the portal; the server creates their
 *  sign-in and profile (netlify/functions/subportal.js → register).
 * ============================================================
 */

import { SB_URL, SB_ANON, API_URL } from './config.js';

const KEY = 'gc_auth_v1';

function low(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

function load() {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (j && j.access_token && j.refresh_token && j.email) return j;
  } catch (e) { /* storage blocked */ }
  return null;
}
function store(s) {
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}
// Same shape the CRM and RoofScout write, so either app can pick up the other's session.
function fromAuth(j, prev) {
  const u = j.user || {};
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
    email: low(u.email || (prev && prev.email)),
    uid: u.id || (prev && prev.uid) || '',
    role: prev ? prev.role : '',
    roleKnown: prev ? !!prev.roleKnown : false,
    validatedAt: Date.now(),
  };
}

/* patch SUBSESS (owner 11/12: "keep subs signed in on portal") — a sub stays signed in until they press Log Out:
 *  • the hour-long access token is renewed with the refresh token BEFORE it runs out (a minute timer, and whenever the
 *    page comes back: tab shown, window focused, phone back online / awake) — never only after a call failed;
 *  • no signal, a slow or failing sign-in service (time-out, 5xx, 429, a captive-portal page) never signs anyone out:
 *    the sign-in is kept and tried again later;
 *  • only one tab renews at a time (navigator.locks); a tab that waited re-reads the browser copy first and uses the
 *    sign-in the other tab just saved, so the same refresh token is never spent twice (Supabase rotates it);
 *  • a refused refresh token signs out only after looking at the browser copy again and one more try — and only if
 *    the browser still holds that same refused token (another tab or the CRM may have saved a newer one meanwhile).
 */
const LOCK = 'gc_auth_v1_refresh';
const EARLY = 5 * 60e3;          // renew this long before the access token runs out
const NET_MS = 20e3;             // a hung request (phone asleep, bad signal) counts as "offline" after this
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function fresh(s, ms) { return !!s && Number(s.expires_at) * 1000 - Date.now() > (ms == null ? 60e3 : ms); }

const outListeners = new Set();
/** App: called when the sign-in really ended (refused by Supabase, or Log Out in another tab). */
export function onSignedOut(fn) { outListeners.add(fn); return () => outListeners.delete(fn); }
function signedOutNow() { outListeners.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } }); }

async function authPost(path, body, token) {
  const h = { apikey: SB_ANON, 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  let ctl = null, timer = null;
  try { ctl = new AbortController(); timer = setTimeout(() => { try { ctl.abort(); } catch (e) { /* ignore */ } }, NET_MS); } catch (e) { ctl = null; }
  try {
    const r = await fetch(SB_URL + '/auth/v1/' + path, { method: 'POST', headers: h, body: JSON.stringify(body || {}), signal: ctl ? ctl.signal : undefined });
    let j = {}; try { j = await r.json(); } catch (e) { /* not JSON */ }
    return { ok: r.ok, status: r.status, json: j || {} };
  } catch (e) {
    return { ok: false, status: 0, net: true, json: {} };
  } finally { if (timer) clearTimeout(timer); }
}
// Supabase's own answer that this refresh token is no good (not a proxy / captive-portal page, not a server hiccup).
function refused(r) {
  const j = r.json || {};
  return !r.net && (r.status === 400 || r.status === 401 || r.status === 403) && !!(j.error || j.error_code || j.error_description || j.msg || j.code);
}
function withLock(fn) {
  try { if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) return navigator.locks.request(LOCK, fn); } catch (e) { /* no Web Locks */ }
  return fn();
}

let refreshing = null;
/** Renew the sign-in. `stale` = the access token the caller has (or had refused); a newer one in storage is used as is. */
function refresh(stale) {
  if (refreshing) return refreshing;
  refreshing = Promise.resolve().then(() => withLock(() => doRefresh(stale))).finally(() => { refreshing = null; });
  return refreshing;
}
async function doRefresh(stale) {
  let s = load();
  if (!s) throw new Error('signed-out');
  // Another tab (or the CRM) renewed it while this one waited: use that, never spend the old refresh token again.
  if (s.access_token !== stale && fresh(s, 90e3)) return s;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await authPost('token?grant_type=refresh_token', { refresh_token: s.refresh_token });
    if (r.ok && r.json.access_token) { const n = fromAuth(r.json, load() || s); store(n); return n; }
    if (!refused(r)) throw new Error('offline');            // no signal / service trouble: keep the sign-in, try later
    await pause(attempt ? 300 : 1500);                       // the tab that spent it first may still be saving the new one
    const disk = load();
    if (!disk) { signedOutNow(); throw new Error('signed-out'); }   // Log Out in another tab
    if (disk.refresh_token !== s.refresh_token) { if (fresh(disk)) return disk; s = disk; }   // a newer sign-in: use / renew that one
  }
  // Refused twice and nothing newer in the browser: the sign-in really ended (revoked, password changed, account removed).
  const now = load();
  if (now && now.refresh_token !== s.refresh_token && fresh(now)) return now;
  if (!now || now.refresh_token === s.refresh_token) store(null);
  signedOutNow();
  throw new Error('signed-out');
}

async function token() {
  const s = load();
  if (!s) throw new Error('signed-out');
  if (s.expires_at * 1000 - Date.now() > 90e3) return s;
  try { return await refresh(s.access_token); }
  catch (e) {
    // Could not renew just now, but the old one still works for a moment: use it.
    if (e.message === 'offline' && s.expires_at * 1000 > Date.now() + 5e3) return s;
    throw e;
  }
}
function authError(e) {
  const off = e && e.message === 'offline';
  const err = new Error(off ? 'Could not reach GrayCo. Check the internet connection.' : 'Your sign-in has ended. Please sign in again.');
  if (off) err.offline = true; else err.signedOut = true;
  return err;
}

/** Keep the sign-in fresh while the page is open (call once after a sign-in is restored or made). */
let keeping = false;
export function keepSignedIn() {
  if (keeping || typeof window === 'undefined') return;
  keeping = true;
  const check = () => {
    const s = load();
    if (!s || fresh(s, EARLY)) return;
    refresh(s.access_token).catch(() => { /* offline: next check; signed out: onSignedOut already told the app */ });
  };
  setInterval(check, 60e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
  window.addEventListener('pageshow', check);
  // Log Out in another tab of this site → this tab too (nothing else ever removes the key).
  window.addEventListener('storage', (e) => { if (e.key === KEY && !e.newValue) signedOutNow(); });
  check();
}

/**
 * Call the portal's server function. Throws an Error whose message is shown to people.
 */
export async function api(action, payload = {}, { anonymous = false, retried = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  let used = '';
  if (!anonymous) {
    let s;
    try { s = await token(); }
    catch (e) { throw authError(e); }
    used = s.access_token;
    headers.Authorization = 'Bearer ' + used;
  }
  let r;
  try {
    r = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify({ ...payload, action }) });
  } catch (e) {
    const err = new Error('Could not reach GrayCo. Check the internet connection.');
    err.offline = true;
    throw err;
  }
  if (r.status === 401 && !anonymous && !retried) {
    try { await refresh(used); } catch (e) { throw authError(e); }
    return api(action, payload, { anonymous, retried: true });
  }
  let j = {}; try { j = await r.json(); } catch (e) { /* not JSON */ }
  if (!r.ok) {
    const err = new Error(j.error || ('Request failed (' + r.status + ')'));
    err.status = r.status;
    if (r.status >= 500 || r.status === 429) err.offline = true;
    throw err;
  }
  return j;
}

/**
 * Sign in by email + password. Returns { user } or { error, message }.
 */
export async function signIn(email, password) {
  const r = await authPost('token?grant_type=password', { email: low(email), password });
  if (!(r.ok && r.json.access_token)) {
    if (r.net) return { error: 'unknown', message: 'Could not reach the GrayCo sign-in service. Check the internet connection.' };
    return { error: 'invalid' };
  }
  store(fromAuth(r.json, null));
  try {
    const me = await api('me');
    if (!me.user) { store(null); return { error: 'no_profile', message: me.error }; }
    return { user: me.user };
  } catch (e) {
    return { error: 'unknown', message: e.message };
  }
}

/**
 * Re-check a password without replacing the stored sign-in (used before a password change).
 */
export async function checkPassword(email, password) {
  const r = await authPost('token?grant_type=password', { email: low(email), password });
  return !!(r.ok && r.json.access_token);
}

/**
 * Register a new subcontractor. Returns { ok, approved } or { duplicates: [...] }.
 */
export async function signUp(email, password, profile, { invite, job, force } = {}) {
  return api('register', { email, password, profile, invite, job, force }, { anonymous: true });
}

export async function inviteInfo(invite, job) {
  try { return await api('invite-info', { invite, job }, { anonymous: true }); }
  catch (e) { return { ok: false }; }
}

export async function signOut() {
  const s = load();
  store(null);
  if (s) authPost('logout?scope=local', {}, s.access_token);
}

/**
 * Change the current user's password (the one GrayCo sign-in: for staff this is also the CRM password).
 */
export async function changePassword(newPassword) {
  try {
    const s = await token();
    const r = await fetch(SB_URL + '/auth/v1/user', {
      method: 'PUT',
      headers: { apikey: SB_ANON, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword }),
    });
    if (!r.ok) {
      let j = {}; try { j = await r.json(); } catch (e) { /* ignore */ }
      return { error: j.msg || j.message || ('error ' + r.status) };
    }
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * "Forgot password": Supabase e-mails a link back to this page.
 * (The page address must be in Supabase → Authentication → URL Configuration → Redirect URLs.)
 */
export async function requestPasswordReset(email) {
  const back = window.location.origin + window.location.pathname;
  const r = await authPost('recover?redirect_to=' + encodeURIComponent(back), { email: low(email) });
  if (r.net) return { error: 'Could not reach the GrayCo sign-in service.' };
  if (!r.ok && r.status !== 429) return { error: r.json.msg || r.json.message || 'The reset e-mail could not be sent.' };
  if (r.status === 429) return { error: 'Please wait a minute before asking for another e-mail.' };
  return { ok: true };
}

/**
 * Coming back from the reset e-mail: the address ends in #access_token=…&type=recovery.
 * Store that sign-in and say so; the page then asks for a new password.
 */
export async function takeRecoveryFromUrl() {
  const h = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  if (!h.get('access_token') || !h.get('refresh_token')) {
    if (h.get('error_description')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      return { error: h.get('error_description') };
    }
    return null;
  }
  history.replaceState(null, '', window.location.pathname + window.location.search);
  let user = {};
  try {
    const r = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + h.get('access_token') } });
    if (r.ok) user = await r.json();
  } catch (e) { /* ignore */ }
  store(fromAuth({
    access_token: h.get('access_token'), refresh_token: h.get('refresh_token'),
    expires_in: Number(h.get('expires_in')) || 3600, user,
  }, null));
  return { recovery: h.get('type') === 'recovery' };
}

/**
 * Return the currently signed-in user's portal profile, or null.
 */
export async function getCurrentUser() {
  if (!load()) return null;
  try {
    const me = await api('me');
    return me.user || null;
  } catch (e) {
    // patch SUBSESS: signed out only when the sign-in itself was refused (the refresh token, or a just-renewed token);
    // no signal / a server hiccup keeps the sign-in — the app says "reconnecting" and tries again.
    if (e.signedOut) return null;
    if (e.status === 401) { store(null); return null; }
    e.transient = true;
    throw e;
  }
}

export function hasSession() { return !!load(); }

/** patch BIDPOST: the signed-in person's access token (GrayCo staff calling another CRM function, e.g. Google Drive for big plan files) */
export async function authToken() { const s = await token(); return s.access_token; }
