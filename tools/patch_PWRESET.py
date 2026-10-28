#!/usr/bin/env python3
"""Idempotent patch PWRESET: self-service "Forgot password?", the recovery link landing, and a starting password
the person must change at sign-in.

Owner (10/28): he forgot his password and could not get in — "Forgot password?" on the sign-in screen did nothing.
And: "make passwords for the entire crm so everyone same password and they will change when they logon".

1. Forgot password: the company sign-in screen (and the old app screen's dead "Forgot password?" text) opens an
   e-mail box that posts to /.netlify/functions/password-reset (no sign-in needed). The server always answers the
   same neutral sentence; only an active person on gc_staff gets an e-mail with a one-time link.
2. The link lands on the CRM with #token_hash=…&type=recovery (or Supabase's own #access_token=…&type=recovery).
   The page swaps it for a recovery sign-in (POST /auth/v1/verify), takes the code out of the address bar at once,
   asks for a new password twice (10+ characters, the same both times), saves it (PUT /auth/v1/user) and signs
   in normally with it. An expired / used link says so and offers to send another.
3. Choose your own password: a sign-in whose app_metadata.must_change_password is true (set by Team access → Reset
   password, Add, or the new "Set a starting password") sees ONLY the "Choose your own password" screen until
   they pick one different from the starting one; then staff-admin action 'password-changed' clears the mark.
   Team access (admins) gets tick boxes and "Set a starting password" for the ticked people or everyone except
   the admin themself. No password is ever kept by the CRM.
4. Help: the sign-in / Team access help texts mention Forgot password and the starting password."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch PWRESET'
if MARK in t: print('PWRESET: already patched'); sys.exit(0)

def once(old, new):
    global t
    n = t.count(old)
    assert n == 1, ('PWRESET anchor count != 1', n, old[:90])
    t = t.replace(old, new)

# ── 1. the company sign-in screen: a real "Forgot password?" ──────────────────
once("""    card.appendChild(el('div', 'font-size:11px;color:#64748b;margin-top:14px;line-height:1.5',
      'For GrayCo staff only. Use your own work email. Forgot your password? Ask Wesley or Nick (💎 → Team access → Reset password).'));""",
"""    """ + MARK + """: a working "Forgot password?" — an e-mailed one-time link */
    var fg = el('button', 'display:block;margin:10px auto 0;background:none;border:none;color:#2563eb;font-size:13px;font-weight:600;cursor:pointer;padding:4px 6px', 'Forgot password?');
    fg.type = 'button'; fg.id = 'gc-auth-forgot';
    fg.onclick = function(){ showForgot(em.value); };
    card.appendChild(fg);
    card.appendChild(el('div', 'font-size:11px;color:#64748b;margin-top:14px;line-height:1.5',
      'For GrayCo staff only. Use your own work email. Forgot your password? Click Forgot password? for an e-mailed link, or ask Wesley or Nick (💎 → Team access).'));""")

# a password screen on top keeps the sign-in screen from being drawn over it
once("""function showGate(msg){
  if (!gate) {""", """function showGate(msg){
  if (pwBox && document.documentElement.contains(pwBox)) return;   /* patch PWRESET: a password screen is open */
  if (!gate) {""")

# ── 3. sign-in with a starting password → only "Choose your own password" ────
once("""    try { localStorage.setItem('gc_auth_last_email', email); } catch (e) {}
    touch(true);""", """    if (needsChange()) {   /* patch PWRESET: a starting / temporary password — choose your own first */
      try { localStorage.setItem('gc_auth_last_email', email); } catch (e) {}
      touch(true); pushTokenToClients(); scheduleRefresh();
      hideGate(); showMustChange(password, prevEmail);
      return true;
    }
    try { localStorage.setItem('gc_auth_last_email', email); } catch (e) {}
    touch(true);""")
once("""        S = fromAuth(r.json, S); store(S); pushTokenToClients(); scheduleRefresh();
        if (mode !== 'online') setMode('online');""", """        S = fromAuth(r.json, S); store(S); pushTokenToClients(); scheduleRefresh();
        if (needsChange()) { if (!pwBox) showMustChange(null, ''); }   /* patch PWRESET */
        else if (mode !== 'online') setMode('online');""")
once("""  if (S.expires_at * 1000 - now() > 90e3) {
    setMode('online');""", """  if (S.expires_at * 1000 - now() > 90e3) {
    if (needsChange()) { showMustChange(null, ''); return; }   /* patch PWRESET */
    setMode('online');""")
once("""    if (wasOut) { setMode('online'); hideGate(); }""",
     """    if (wasOut) { if (needsChange()) { hideGate(); showMustChange(null, ''); } else { setMode('online'); hideGate(); } }   /* patch PWRESET */""")
once("""if (!d && S) { S = null; setMode('none'); pushTokenToClients(); showGate('Signed out in another window.'); }""",
     """if (!d && S) { S = null; setMode('none'); pushTokenToClients(); closePw(); showGate('Signed out in another window.'); }""")
once("""function lock(msg){
  var t = S && S.access_token;
  S = null; store(null);""", """function lock(msg){
  var t = S && S.access_token;
  S = null; store(null); closePw();   /* patch PWRESET */""")
once("""  touch: function(){ touch(false); }
};""", """  touch: function(){ touch(false); },
  forgot: function(email){ showForgot(email || ''); }   /* patch PWRESET: the old app screen's "Forgot password?" */
};""")

# ── the screens ─────────────────────────────────────────────────────────────
JS = r"""/* patch PWRESET: forgot password · recovery link · choose your own password ─────────────────────────
   No password is kept anywhere: it goes from the box straight to Supabase (PUT /auth/v1/user) and is forgotten. */
var pwBox = null, pwBusy = false;
var PW_NEUTRAL = 'If that e-mail is on the team, a reset link is on its way. It can take a few minutes — check spam too.';
function jwtMeta(tok){
  try {
    var b = String(tok || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '=';
    var j = JSON.parse(decodeURIComponent(Array.prototype.map.call(atob(b), function(c){ return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join('')));
    return (j && j.app_metadata) || {};
  } catch (e) { return {}; }
}
function needsChange(){ return !!(S && S.access_token && jwtMeta(S.access_token).must_change_password === true); }
function closePw(){ if (pwBox && pwBox.parentNode) pwBox.parentNode.removeChild(pwBox); pwBox = null; }
function pwScreen(title, sub){
  closePw();
  pwBox = el('div', 'position:fixed;inset:0;z-index:2147483647;background:linear-gradient(160deg,#0a1628 0%,#0f2440 55%,#1a3a65 100%);'
    + 'display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;');
  pwBox.id = 'gc-pw-screen'; pwBox.setAttribute('data-gc-keep', '1');
  pwBox.setAttribute('role', 'dialog'); pwBox.setAttribute('aria-modal', 'true'); pwBox.setAttribute('aria-label', title);
  var card = el('form', 'width:100%;max-width:380px;background:#fff;border-radius:14px;padding:28px 26px;box-shadow:0 20px 60px rgba(0,0,0,.45);box-sizing:border-box;');
  card.setAttribute('autocomplete', 'on'); card.noValidate = true;
  card.appendChild(el('div', 'font-size:26px;font-weight:800;color:#0f2440;letter-spacing:-.02em', 'GrayCo'));
  card.appendChild(el('div', 'font-size:17px;font-weight:700;color:#0f172a;margin:6px 0 4px', title));
  var subEl = el('div', 'font-size:13px;color:#475569;margin:0 0 16px;line-height:1.45', sub || ''); subEl.className = 'gc-pw-sub';
  card.appendChild(subEl);
  pwBox.appendChild(card);
  pwBox.addEventListener('keydown', function(ev){ ev.stopPropagation(); });
  if (document.body) document.body.appendChild(pwBox); else document.documentElement.appendChild(pwBox);
  return card;
}
function pwField(card, label, type, id, ac){
  var l = el('label', 'display:block;font-size:12px;font-weight:600;color:#334155;margin:0 0 4px', label); l.htmlFor = id;
  var i = el('input', 'display:block;width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:15px;margin:0 0 14px;color:#0f172a;background:#fff');
  i.type = type; i.id = id; i.name = id; i.autocomplete = ac;
  card.appendChild(l); card.appendChild(i); return i;
}
function pwBtn(card, text, id){
  var b = el('button', 'width:100%;padding:12px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-size:15px;font-weight:700;cursor:pointer', text);
  b.type = 'submit'; b.id = id; card.appendChild(b); return b;
}
function pwLink(card, text, id, fn){
  var b = el('button', 'display:block;margin:12px auto 0;background:none;border:none;color:#2563eb;font-size:13px;font-weight:600;cursor:pointer;padding:4px 6px', text);
  b.type = 'button'; b.id = id; b.onclick = fn; card.appendChild(b); return b;
}
function pwMsg(card){ var m = el('div', 'min-height:18px;font-size:13px;color:#b91c1c;margin-top:12px;line-height:1.45'); m.id = 'gc-pw-msg'; m.setAttribute('role', 'status'); card.appendChild(m); return m; }
function pwSay(m, text, ok){ m.style.color = ok ? '#166534' : '#b91c1c'; m.textContent = text; }
function pwFocus(){ nST(function(){ try { var i = pwBox && pwBox.querySelector('input'); if (i) { var e2 = pwBox.querySelectorAll('input'); for (var k = 0; k < e2.length; k++) if (!e2[k].value) { e2[k].focus(); return; } i.focus(); } } catch (e) {} }, 50); }
function lastEmail(){ try { return localStorage.getItem('gc_auth_last_email') || ''; } catch (e) { return ''; } }
/* the reset link survives the CRM's own start-up reloads (this tab only, 20 minutes, never a password) */
var PW_REC = 'gc_pw_rec';
function recKeep(rec){ try { if (rec) sessionStorage.setItem(PW_REC, JSON.stringify({ r: rec, at: now() })); else sessionStorage.removeItem(PW_REC); } catch (e) {} }
function recKept(){ try { var j = JSON.parse(sessionStorage.getItem(PW_REC) || 'null'); if (j && j.r && now() - j.at < 20 * 60e3) return j.r; sessionStorage.removeItem(PW_REC); } catch (e) {} return null; }
function backToSignIn(){ recKeep(null); closePw(); if (S && mode === 'none' && !needsChange()) boot(); else if (!S) showGate(''); }
function okMail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

/* 1. "Forgot password?" — the server answers the same sentence for every e-mail */
function showForgot(prefill, title, sub){
  hideGate();
  var c = pwScreen(title || 'Forgot your password?', sub || 'Enter your work e-mail. If it is on the GrayCo team, we e-mail you a link to choose a new password.');
  var em = pwField(c, 'Work email', 'email', 'gc-forgot-email', 'username');
  em.value = low(prefill) || lastEmail();
  var go = pwBtn(c, 'E-mail me a reset link', 'gc-forgot-send');
  var msg = pwMsg(c);
  pwLink(c, '‹ Back to sign-in', 'gc-forgot-back', backToSignIn);
  c.addEventListener('submit', async function(ev){
    ev.preventDefault();
    if (pwBusy) return;
    var e = low(em.value);
    if (!okMail(e)) { pwSay(msg, 'Enter your work e-mail address.'); return; }
    pwBusy = true; go.disabled = true; pwSay(msg, 'Sending…', true);
    try {
      var r = await nativeFetch('/.netlify/functions/password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e }) })
        .then(function(x){ return x.json().then(function(j){ return { ok: x.ok, j: j || {} }; }, function(){ return { ok: x.ok, j: {} }; }); }, function(){ return { ok: false, net: true, j: {} }; });
      if (r.ok) pwSay(msg, r.j.message || PW_NEUTRAL, true);
      else pwSay(msg, r.net ? 'Cannot reach the server. Check the internet connection and try again.' : (r.j.error || 'Could not send it. Try again in a minute.'));
    } finally { pwBusy = false; go.disabled = false; }
  });
  pwFocus();
}
function showExpired(why){
  recKeep({ kind: 'expired' });   /* stays up through a start-up reload; Back clears it */
  showForgot('', 'This link has expired', 'Reset links work once and only for about an hour' + (why ? ' (' + why + ')' : '') + '. Send yourself a new one.');
}

/* 2 + 3. one screen for both: a new password, twice */
function showNewPassword(o){
  hideGate();
  var must = o.kind === 'must';
  var c = pwScreen(must ? 'Choose your own password' : 'Set a new password',
    must ? ('Signed in as ' + (S ? S.email : '') + ' with a starting password. Choose your own before you use the CRM: at least 10 characters, not the starting one.')
         : ('For ' + (o.email || 'your account') + '. At least 10 characters.'));
  var p1 = pwField(c, 'New password', 'password', 'gc-pw-new1', 'new-password');
  var p2 = pwField(c, 'New password again', 'password', 'gc-pw-new2', 'new-password');
  var go = pwBtn(c, must ? 'Save my password' : 'Save and sign in', 'gc-pw-save');
  var msg = pwMsg(c);
  if (must) pwLink(c, 'Sign out', 'gc-pw-signout', function(){ lock('Signed out.'); });
  else pwLink(c, '‹ Back to sign-in', 'gc-pw-back', backToSignIn);
  var changed = false, chosen = '';
  function tok(){ return must ? (S && S.access_token) : o.token; }
  async function clearMark(){
    return nativeFetch('/.netlify/functions/staff-admin', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok() }, body: JSON.stringify({ action: 'password-changed' }) })
      .then(function(x){ return x.json().then(function(j){ return { ok: x.ok, status: x.status, j: j || {} }; }, function(){ return { ok: x.ok, status: x.status, j: {} }; }); }, function(){ return { ok: false, status: 0, j: { error: 'Cannot reach the server.' } }; });
  }
  async function finish(){
    if (must) {
      var cm = await clearMark();
      if (!cm.ok) { pwSay(msg, 'Your password is saved, but the CRM could not finish (' + (cm.j.error || cm.status) + '). Click Save again to retry.'); return; }
      await refresh();
      if (!S) return;   /* the sign-in was refused: lock() already showed the sign-in screen */
      if (needsChange()) { pwSay(msg, 'Your password is saved, but the sign-in did not update yet. Click Save again in a moment.'); return; }
      closePw();
      touch(true);
      if (mode !== 'online') setMode('online');
      var reloading = await matchAppUser(S.email, o.prevEmail || '');
      if (!reloading) hideGate();
    } else {
      recKeep(null);
      await clearMark();   /* a starting-password mark is gone too: they chose their own (403 for non-staff is fine) */
      authPost('logout?scope=local', {}, o.token);
      var em = o.email, pw = chosen; chosen = '';
      closePw();
      showGate('');
      try { var e1 = document.getElementById('gc-auth-email'); if (e1) e1.value = em; } catch (e) {}
      say('Password saved. Signing in…', true);
      await signIn(em, pw);
    }
  }
  c.addEventListener('submit', async function(ev){
    ev.preventDefault();
    if (pwBusy) return;
    if (changed) { pwBusy = true; go.disabled = true; try { await finish(); } finally { pwBusy = false; go.disabled = false; } return; }
    var a = p1.value, b = p2.value;
    if (a.length < 10) { pwSay(msg, 'At least 10 characters.'); return; }
    if (a !== b) { pwSay(msg, 'The two do not match.'); return; }
    if (must && o.start && a === o.start) { pwSay(msg, 'Choose a password that is different from the starting one.'); return; }
    pwBusy = true; go.disabled = true; pwSay(msg, 'Saving…', true);
    try {
      if (must) await ensureFresh();
      var r = await nativeFetch(SB_URL + '/auth/v1/user', { method: 'PUT', headers: { apikey: ANON, Authorization: 'Bearer ' + tok(), 'Content-Type': 'application/json' }, body: JSON.stringify({ password: a }) })
        .then(function(x){ return x.json().then(function(j){ return { ok: x.ok, status: x.status, j: j || {} }; }, function(){ return { ok: x.ok, status: x.status, j: {} }; }); }, function(){ return { ok: false, status: 0, j: {} }; });
      if (!r.ok) {
        var code = String(r.j.error_code || r.j.code || '');
        if (r.status === 0) pwSay(msg, 'Cannot reach the sign-in service. Check the internet connection and try again.');
        else if (code === 'same_password' || /different from the old/i.test(r.j.msg || r.j.message || '')) pwSay(msg, must ? 'Choose a password that is different from the starting one.' : 'That is your current password. Choose a different one.');
        else if (r.status === 401 || r.status === 403) { if (must) lock('Your sign-in has ended. Please sign in again.'); else showExpired(''); }
        else pwSay(msg, r.j.msg || r.j.error_description || r.j.message || 'Could not save it. Try again.');
        return;
      }
      changed = true; chosen = a; p1.value = ''; p2.value = ''; p1.disabled = true; p2.disabled = true;
      pwSay(msg, 'Password saved…', true);
      await finish();
    } finally { pwBusy = false; go.disabled = false; }
  });
  pwFocus();
}
function showMustChange(start, prevEmail){ showNewPassword({ kind: 'must', start: start || '', prevEmail: prevEmail || '' }); }

/* the link from the e-mail: #token_hash=…&type=recovery (ours) · #access_token=…&type=recovery (Supabase's) · #error=… */
function readRecovery(){
  try {
    var hp = new URLSearchParams(String(location.hash || '').replace(/^#/, '')), qp = new URLSearchParams(String(location.search || '').replace(/^\?/, ''));
    function g(k){ return hp.get(k) || qp.get(k) || ''; }
    var type = g('type'), rec = null;
    if (g('token_hash') && type === 'recovery') rec = { kind: 'hash', token_hash: g('token_hash') };
    else if (hp.get('access_token') && type === 'recovery') rec = { kind: 'session', access_token: hp.get('access_token'), refresh_token: hp.get('refresh_token') || '' };
    else if (qp.get('code') && type === 'recovery') rec = { kind: 'expired', why: '' };   /* a one-time code this page cannot redeem */
    else if (g('error_code') && /otp_expired|access_denied|flow_state|bad_code/i.test(g('error_code') + ' ' + g('error'))) rec = { kind: 'expired', why: '' };
    if (!rec) return recKept();
    recKeep(rec);
    /* the code leaves the address bar (history, bookmarks, screen shares) at once */
    ['token_hash', 'type', 'access_token', 'refresh_token', 'expires_in', 'expires_at', 'token_type', 'provider_token', 'provider_refresh_token', 'error', 'error_code', 'error_description', 'code', 'sb']
      .forEach(function(k){ hp.delete(k); qp.delete(k); });
    var qs = qp.toString(), hs = hp.toString();
    try { history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + (hs ? '#' + hs : '')); } catch (e) {}
    return rec;
  } catch (e) { return null; }
}
async function startRecovery(rec){
  if (rec.kind === 'expired') { showExpired(''); return; }
  var c = pwScreen('Set a new password', 'Checking your link…');
  var tokn = '', email = '';
  if (rec.kind === 'hash') {
    var r = await authPost('verify', { type: 'recovery', token_hash: rec.token_hash });
    if (r.net) {
      var m = pwMsg(c); pwSay(m, 'Cannot reach the sign-in service. Check the internet connection, then click Try again.');
      pwLink(c, 'Try again', 'gc-pw-retry', function(){ startRecovery(rec); });
      return;
    }
    if (!r.ok || !r.json.access_token) { showExpired(''); return; }
    tokn = r.json.access_token; email = low(r.json.user && r.json.user.email);
    recKeep({ kind: 'session', access_token: tokn, refresh_token: r.json.refresh_token || '' });   /* the one-time code is used up now */
  } else {
    tokn = rec.access_token;
    var u = await nativeFetch(SB_URL + '/auth/v1/user', { headers: { apikey: ANON, Authorization: 'Bearer ' + tokn } })
      .then(function(x){ return x.ok ? x.json() : null; }, function(){ return null; });
    if (!u || !u.email) { showExpired(''); return; }
    email = low(u.email);
  }
  if (!email) { showExpired(''); return; }
  showNewPassword({ kind: 'recovery', token: tokn, email: email });
}
/* the page's early start-up can replace the whole document: the open password screen is put back, on top */
function pwKeep(){
  try {
    if (!pwBox) return;
    if (!document.documentElement.contains(pwBox) || (document.body && pwBox.parentNode !== document.body)) { (document.body || document.documentElement).appendChild(pwBox); pwFocus(); }
    if (gate && gate.parentNode && pwBox.parentNode === gate.parentNode && gate.compareDocumentPosition(pwBox) & 2) gate.parentNode.appendChild(pwBox);
    if (gate && gate.parentNode) hideGate();
  } catch (e) {}
}
document.addEventListener('DOMContentLoaded', pwKeep);
nSI(pwKeep, 400);

"""
once("""function boot(){
  if (!S) { setMode('none'); showGate(''); return; }""", JS + """function boot(){
  if (!S) { setMode('none'); showGate(''); return; }""")
once("""boot();
if (document.readyState === 'loading')""", """var gcRec = readRecovery();   /* patch PWRESET: a reset link opens its own screen first */
if (gcRec) startRecovery(gcRec); else boot();
if (document.readyState === 'loading')""")

# ── Team access: tick boxes + "Set a starting password" ─────────────────────
once("""They change it from 💎 → Change my password.</div>'""", """At their next sign-in the CRM asks them to choose their own.</div>'""")
once("""<tr style="text-align:left;color:#475569"><th>Email</th><th>Name</th><th>Role</th><th>Profile</th>""",
     """<tr style="text-align:left;color:#475569"><th></th><th>Email</th><th>Name</th><th>Role</th><th>Profile</th>""")
once("""'<tr style="border-top:1px solid #f1f5f9"><td style="padding:6px 4px">' + esc(p.email)""",
     """'<tr style="border-top:1px solid #f1f5f9"><td style="padding:6px 2px"><input type="checkbox" data-pick="' + esc(p.email) + '" aria-label="Tick ' + esc(p.email) + '"' + (low(p.email) === (S && S.email) ? ' disabled title="You — use Change my password"' : '') + '></td><td style="padding:6px 4px">' + esc(p.email)""")
once("""  m.card.appendChild(form);
  async function reload(){""", """  /* patch PWRESET: one starting password for the ticked people (or everyone except you); each must choose their own */
  var sp = el('div', 'margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0');
  sp.innerHTML = '<div style="font-weight:700;margin-bottom:4px">Set a starting password</div>'
    + '<div style="font-size:12px;color:#475569;margin-bottom:6px">One password you choose, for the people ticked above or for everyone except you. Their current password stops working; at their next sign-in the CRM asks each of them to choose their own. It is not saved in the CRM — tell them in person or by phone.</div>'
    + '<input id="gcSpPw" type="text" autocomplete="off" spellcheck="false" placeholder="Starting password (at least 10 characters)" style="width:100%;box-sizing:border-box;padding:8px;margin-bottom:6px;border:1px solid #cbd5e1;border-radius:6px">'
    + '<div style="display:flex;gap:6px;flex-wrap:wrap"><button id="gcSpSel" style="flex:1;min-width:150px;padding:9px;border:1px solid #2563eb;border-radius:8px;background:#fff;color:#2563eb;font-weight:700;cursor:pointer">Set for the ticked people</button>'
    + '<button id="gcSpAll" style="flex:1;min-width:150px;padding:9px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer">Set for everyone except me</button></div>'
    + '<div id="gcSpOut" style="font-size:13px;margin-top:6px"></div>';
  m.card.appendChild(sp);
  async function setStart(all){
    var pwI = sp.querySelector('#gcSpPw'), so = sp.querySelector('#gcSpOut'), pw = pwI.value;
    if (pw.length < 10) { so.style.color = '#b91c1c'; so.textContent = 'The starting password needs at least 10 characters.'; return; }
    var picks = []; list.querySelectorAll('input[data-pick]:checked').forEach(function(c){ picks.push(c.getAttribute('data-pick')); });
    if (!all && !picks.length) { so.style.color = '#b91c1c'; so.textContent = 'Tick the people first (the boxes in the list).'; return; }
    if (!confirm('Set this starting password for ' + (all ? 'everyone on the list except you' : picks.length + ' ' + (picks.length === 1 ? 'person' : 'people')) + '? Their current password stops working, and each must choose their own at their next sign-in.')) return;
    so.style.color = '#475569'; so.textContent = 'Setting…';
    var j = await fnJSON('staff-admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(all ? { action: 'start-password', all: true, password: pw } : { action: 'start-password', emails: picks, password: pw }) });
    var done = j.done || [], sk = j.skipped || [];
    so.style.color = done.length ? '#166534' : '#b91c1c';
    so.innerHTML = (done.length ? 'Done for ' + done.length + ': ' + done.map(esc).join(', ') + '. Each must choose their own password at their next sign-in.' : esc(j.error || 'Nobody was changed.'))
      + (sk.length ? '<div style="color:#b45309;margin-top:4px">Skipped: ' + sk.map(function(x){ return esc(x.email) + ' (' + esc(x.why) + ')'; }).join(', ') + '</div>' : '');
    if (done.length) { pwI.value = ''; list.querySelectorAll('input[data-pick]:checked').forEach(function(c){ c.checked = false; }); }
  }
  sp.querySelector('#gcSpSel').onclick = function(){ setStart(false); };
  sp.querySelector('#gcSpAll').onclick = function(){ setStart(true); };
  m.card.appendChild(form);
  async function reload(){""")

# ── the "what happened" diary kept the last thing typed — including passwords typed on the sign-in screen ──
once("""var lastTyped='';
document.addEventListener('input', function(e){
  try{
    var t=e.target;
    if(!t || !t.tagName) return;
    if(!/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
""", """var lastTyped='';
/* patch PWRESET: never a password in the diary — and what an older build wrote there is wiped once */
try{ (function(){ var a=load(), ch=false; a.forEach(function(x){ if(x && x.typing && /pass|\\u2022|\u2022|gc-auth|gcPw|gcSp|gc-pw|gc-forgot/i.test(String(x.typing).split(' = ')[0])){ x.typing=''; ch=true; } }); if(ch) localStorage.setItem(KEY, JSON.stringify(a)); })(); }catch(e){}
document.addEventListener('input', function(e){
  try{
    var t=e.target;
    if(!t || !t.tagName) return;
    if(!/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if(String(t.type||'').toLowerCase()==='password' || /password/i.test(t.getAttribute('autocomplete')||'') || t.id==='gcSpPw' || (t.closest && t.closest('#gc-auth-gate,#gc-pw-screen'))){ lastTyped=''; return; }   /* patch PWRESET */
""")

# ── the field-draft keeper stored a password typed with 👁 (shown as text) and would store the starting password ──
once("""  function watchable(el){
    if(!el || el.nodeType!==1) return false;
""", """  /* patch PWRESET: never a password among the drafts — and one an older build kept is dropped once */
  try{ (function(){ var d=drafts(), ch=false; Object.keys(d).forEach(function(k){ if(/pass|\u2022|gcSpPw|gc-pw|gc-auth/i.test(k)){ delete d[k]; ch=true; } }); if(ch) saveDrafts(d); })(); }catch(e){}
  function watchable(el){
    if(!el || el.nodeType!==1) return false;
    if(/password/i.test((el.getAttribute && el.getAttribute('autocomplete'))||'') || el.id==='gcSpPw' || (el.closest && el.closest('#gc-auth-gate,#gc-pw-screen'))) return false;   /* patch PWRESET */
""")

# ── the old app sign-in screen: its "Forgot password?" did nothing ──────────
once("""e.jsx("span",{style:{fontSize:12,color:"#3b82f6",cursor:"pointer"},children:"Forgot password?"})""",
     """e.jsx("span",{role:"button",tabIndex:0,onClick:()=>{try{window.__GC_AUTH__&&window.__GC_AUTH__.forgot&&window.__GC_AUTH__.forgot(S&&S.email||"")}catch(_pw){}},onKeyDown:_k=>{if(_k.key==="Enter"){try{window.__GC_AUTH__.forgot(S&&S.email||"")}catch(_pw){}}},style:{fontSize:12,color:"#3b82f6",cursor:"pointer"},children:"Forgot password?"})""")

# ── help texts ──────────────────────────────────────────────────────────────
once("""3. Forgot it, or need an account? An admin adds you in 💎 → 🔐 Team access and gives you a temporary password. Change it in 💎 → 🔑 Change my password.""",
     """3. Forgot it? Click **Forgot password?** on the sign-in screen: we e-mail you a link to choose a new one (it works once, for about an hour). Need an account? An admin adds you in 💎 → 🔐 Team access and gives you a temporary or starting password; at your first sign-in the CRM asks you to choose your own. Change it any time in 💎 → 🔑 Change my password.""")
once("""They get a temporary password. Reset a forgotten one there too.""",
     """They get a temporary password and choose their own at their first sign-in. A forgotten password: they click **Forgot password?** on the sign-in screen for an e-mailed link, or you click **Reset password** for a new temporary one. **Set a starting password** gives the ticked people (or everyone except you) one password you choose; each must change it at their next sign-in.""")

open(p, 'w', encoding='utf-8').write(t); print('PWRESET: patched')
