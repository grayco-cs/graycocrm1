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

async function authPost(path, body, token) {
  const h = { apikey: SB_ANON, 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  try {
    const r = await fetch(SB_URL + '/auth/v1/' + path, { method: 'POST', headers: h, body: JSON.stringify(body || {}) });
    let j = {}; try { j = await r.json(); } catch (e) { /* not JSON */ }
    return { ok: r.ok, status: r.status, json: j };
  } catch (e) {
    return { ok: false, status: 0, net: true, json: {} };
  }
}

let refreshing = null;
function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const s = load();
    if (!s) throw new Error('signed-out');
    const r = await authPost('token?grant_type=refresh_token', { refresh_token: s.refresh_token });
    if (r.ok && r.json.access_token) { const n = fromAuth(r.json, s); store(n); return n; }
    // The CRM (or another tab) may have refreshed first, which uses up the old token.
    const disk = load();
    if (disk && disk.refresh_token !== s.refresh_token && disk.expires_at * 1000 > Date.now() + 60e3) return disk;
    if (r.net || r.status >= 500 || r.status === 429) throw new Error('offline');
    store(null);
    throw new Error('signed-out');
  })().finally(() => { refreshing = null; });
  return refreshing;
}

async function token() {
  const s = load();
  if (!s) throw new Error('signed-out');
  if (s.expires_at * 1000 - Date.now() > 90e3) return s;
  return refresh();
}

/**
 * Call the portal's server function. Throws an Error whose message is shown to people.
 */
export async function api(action, payload = {}, { anonymous = false, retried = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (!anonymous) {
    let s;
    try { s = await token(); }
    catch (e) { throw new Error(e.message === 'offline' ? 'Could not reach GrayCo. Check the internet connection.' : 'Your sign-in has ended. Please sign in again.'); }
    headers.Authorization = 'Bearer ' + s.access_token;
  }
  let r;
  try {
    r = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify({ ...payload, action }) });
  } catch (e) {
    throw new Error('Could not reach GrayCo. Check the internet connection.');
  }
  if (r.status === 401 && !anonymous && !retried) {
    try { await refresh(); } catch (e) { /* falls through to the error below */ }
    return api(action, payload, { anonymous, retried: true });
  }
  let j = {}; try { j = await r.json(); } catch (e) { /* not JSON */ }
  if (!r.ok) {
    const err = new Error(j.error || ('Request failed (' + r.status + ')'));
    err.status = r.status;
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
    if (e.status === 401 || /sign in/i.test(e.message)) store(null);
    return null;
  }
}

export function hasSession() { return !!load(); }
