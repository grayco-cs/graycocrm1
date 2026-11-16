/* __GC_PATCH_DEVMODE__ — DEVMODE: "Ask me Field or Desk when I sign in" (a per-person setting, default OFF).   (patch DEVMODE)
   Owner 11/16: "Biffle has a computer that he will use both for … his can say do you want field or desk view when he signs
   in. I kinda like to have the option for it to ask on sign in if I want field or desk on my profile cuz sometimes it may get
   annoying it asking so much. From the phone and app always do field view app mode."
   • The setting: gc_kv "gc_view_prefs" = { "<e-mail>": { ask: true|false, at, by } } — the same kind of per-person profile
     setting as "E-mail me my plan" (gc_plan_prefs), so it follows the person to every computer. Each person turns it on / off
     in My Profile; an admin sets it for anyone in 💎 → Team access (the "Ask Field / Desk" box on the person's row).
     This browser keeps a copy (localStorage gc_dm_ask) so the question comes at once after a sign-in.
   • On a computer (or a tablet), with the setting on: once per sign-in, right after it, a two-button choice — 🖥 Desk or
     📱 GrayCo Field. The pick lasts for that sign-in (every tab and reload; localStorage gc_dm_choice, tied to the signed-in
     e-mail); signing out clears it, the next sign-in asks again. "Stop asking me" turns the setting off (Desk).
   • A phone never asks: GrayCo Field. The setting off: a computer opens the Desk every time (patch DEVMODE early / FIELDDESK).
   API: window._gcDevMode = { prefs(), setAsk(email, on), ask(force), state() } */
(function(){
'use strict';
var W = window, D = document;
if (W.__GC_PATCH_DEVMODE__) return; W.__GC_PATCH_DEVMODE__ = true;
var DV = W._gcDevice; if (!DV) return;   /* the early script is off on this device */
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
var PREFS = 'gc_view_prefs', ASK = 'gc_dm_ask';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
function warn(e){ try { console.warn('[GC DEVMODE]', e && e.message || e); } catch (x) {} }
function me(){ try { return low(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()) || DV.signedEmail(); } catch (e) { return DV.signedEmail(); } }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function vas(){ try { return !!(W._gcVAS && W._gcVAS.active && W._gcVAS.active()); } catch (e) { return false; } }
function gateUp(){ var g = D.getElementById('gc-auth-email'); return !!(g && g.getClientRects().length); }
function toast(t, bad){
  var el = D.getElementById('gc-dm-toast'); if (!el) { el = D.createElement('div'); el.id = 'gc-dm-toast'; el.setAttribute('data-gc-keep', '1'); el.setAttribute('data-gcnav-ignore', '1'); D.body.appendChild(el); }
  el.textContent = t; el.style.background = bad ? '#991b1b' : '#111827'; el.style.display = 'block'; clearTimeout(el.__t); el.__t = later(function(){ el.style.display = 'none'; }, 3500);
}

/* ── the setting in the cloud (gc_kv gc_view_prefs), a copy on this browser ── */
function sb(){ return { u: s(lsGet('grayco_sb_url')).replace(/\/$/, ''), k: s(lsGet('grayco_sb_key')) }; }
function kvGet(key){
  var c = sb(); if (!c.u || !c.k) return Promise.resolve(undefined);
  return W.fetch(c.u + '/rest/v1/gc_kv?key=eq.' + encodeURIComponent(key) + '&select=value', { headers: { apikey: c.k }, cache: 'no-store' })
    .then(function(r){ return r && r.ok ? r.json() : undefined; }).then(function(rows){ return Array.isArray(rows) ? (rows[0] ? rows[0].value : null) : undefined; }, function(){ return undefined; });
}
function kvPut(key, value){
  var c = sb(); if (!c.u || !c.k) return Promise.resolve(false);
  return W.fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { apikey: c.k, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: key, value: value, updated_at: new Date().toISOString() }) }).then(function(r){ return !!(r && r.ok); }, function(){ return false; });
}
var CACHE = null;   /* the last cloud copy read on this open */
function cacheAll(p){ var m = {}; Object.keys(p).forEach(function(e){ if (obj(p[e]).ask === true) m[low(e)] = true; }); lsSet(ASK, JSON.stringify(m)); }
function prefs(){ return kvGet(PREFS).then(function(v){ if (v === undefined) return CACHE || null; CACHE = obj(v); cacheAll(CACHE); return CACHE; }); }
function askOf(p, em){ return obj(p && p[low(em)]).ask === true; }
function setAsk(email, on){
  var em = low(email); if (!em) return Promise.resolve(false);
  if (em !== me() && !isAdmin()) return Promise.resolve(false);   /* your own; an admin anyone's */
  return kvGet(PREFS).then(function(v){
    if (v === undefined) return false;
    var p = obj(v); p[em] = Object.assign({}, obj(p[em]), { ask: !!on, at: new Date().toISOString(), by: me() });
    return kvPut(PREFS, p).then(function(ok){ if (ok) { CACHE = p; cacheAll(p); } return ok; });
  });
}

/* ── the question, once per sign-in, on a computer / tablet ── */
var asked = false, cloudRead = false;
function ready(){ return !!me() && !gateUp() && !!W._crm && !vas(); }
function css(){
  if (D.getElementById('gc-dm-css')) return;
  var st = D.createElement('style'); st.id = 'gc-dm-css';
  st.textContent = '#gc-dm-ask{position:fixed;inset:0;z-index:2147483600;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font:15px/1.4 Inter,-apple-system,Segoe UI,Roboto,sans-serif}' +
    '#gc-dm-ask .bx{background:#fff;color:#111827;border-radius:18px;max-width:520px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.35);box-sizing:border-box}' +
    '#gc-dm-ask h2{margin:0 0 4px;font-size:20px;font-weight:800}#gc-dm-ask .mu{color:#6b7280;font-size:13px;margin:0 0 16px}' +
    '#gc-dm-ask .ch{display:flex;gap:12px;flex-wrap:wrap}#gc-dm-ask .ch button{flex:1 1 200px;min-height:96px;border:2px solid #e5e7eb;border-radius:14px;background:#f9fafb;cursor:pointer;font:800 18px Inter,sans-serif;color:#111827;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:12px}' +
    '#gc-dm-ask .ch button small{font:500 12.5px Inter,sans-serif;color:#6b7280}#gc-dm-ask .ch button:hover,#gc-dm-ask .ch button:focus{border-color:#2563eb;background:#eff6ff;outline:none}' +
    '#gc-dm-ask .ft{margin-top:14px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;color:#6b7280}#gc-dm-ask .ft button{border:none;background:none;color:#2563eb;font:700 12.5px Inter,sans-serif;cursor:pointer;padding:4px 0}' +
    '#gc-dm-toast{display:none;position:fixed;left:50%;transform:translateX(-50%);bottom:40px;z-index:2147483601;color:#fff;border-radius:12px;padding:12px 16px;font:600 14px Inter,sans-serif;max-width:calc(100% - 32px);text-align:center}' +
    '.gc-dm-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px 14px;margin:10px 0;color:#111827;font:14px/1.4 Inter,sans-serif;max-width:720px}.gc-dm-card .mu{color:#6b7280;font-size:12.5px;margin:4px 0 0 24px}';
  (D.head || D.documentElement).appendChild(st);
}
function pick(v, why){
  var ov = D.getElementById('gc-dm-ask'); if (ov) ov.remove();
  DV.setChoice(v);
  try { if (typeof W._gcChooseView === 'function') W._gcChooseView(v); } catch (e) { warn(e); }
  try { console.log('[GC] DEVMODE: ' + v + ' for this sign-in (' + (why || 'picked') + ')'); } catch (e) {}
}
function ask(force){
  if (D.getElementById('gc-dm-ask')) return true;
  if (!force && (asked || !DV.canAsk() || DV.choice())) return false;
  asked = true; css();
  var nm = ''; try { var u = (W._crm.users || []).filter(function(x){ return x && low(x.email) === me(); })[0]; nm = s(u && u.name).split(/\s+/)[0]; } catch (e) {}
  var ov = D.createElement('div'); ov.id = 'gc-dm-ask'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('data-gcnav-ignore', '1'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Desk or GrayCo Field');
  ov.innerHTML = '<div class="bx"><h2>' + (nm ? 'Hi ' + esc(nm) + ' — how' : 'How') + ' are you working right now?</h2><p class="mu">This lasts until you sign out. You can switch any time with the 🖥 Desk / 📱 Field button.</p>' +
    '<div class="ch"><button type="button" data-dm="desk">🖥 Desk<small>The full CRM on this computer</small></button><button type="button" data-dm="field">📱 GrayCo Field<small>The field app — jobs, photos, clock-in</small></button></div>' +
    '<div class="ft"><span>“Ask me Field or Desk” is on in your My Profile.</span><button type="button" data-dm="stop">Stop asking me</button></div></div>';
  ov.addEventListener('click', function(ev){
    var b = ev.target.closest && ev.target.closest('[data-dm]');
    if (!b) { if (ev.target === ov) pick('desk', 'closed'); return; }
    ev.preventDefault(); ev.stopPropagation();
    var v = b.getAttribute('data-dm');
    if (v === 'stop') { pick('desk', 'stop asking'); setAsk(me(), false).then(function(ok){ toast(ok ? 'OK — the Desk opens on a computer from now on. Turn it back on in My Profile.' : 'Could not save — check the connection.', !ok); }); return; }
    pick(v);
  });
  D.addEventListener('keydown', function esc0(e){ if (e.key === 'Escape' && D.getElementById('gc-dm-ask')) { pick('desk', 'Esc'); D.removeEventListener('keydown', esc0, true); } }, true);
  D.body.appendChild(ov);
  try { var f = ov.querySelector('[data-dm="desk"]'); if (f) f.focus(); } catch (e) {}
  return true;
}
var wasOut = false;
function askTick(){
  if (!DV.signedEmail()) { DV.clearChoice('signed out'); asked = false; cloudRead = false; wasOut = true; return; }   /* signed out: the next sign-in asks again */
  if (wasOut && ready()) {
    /* signed in again in this same page (no reload): a Desk / Field switch from before the sign-out does not carry over —
       the device's own view (or this sign-in's pick, asked below) */
    wasOut = false;
    try { var v = DV.wantField() ? 'field' : 'desk', inF = D.documentElement.classList.contains('_fieldmode');
      if (typeof W._gcChooseView === 'function' && (v === 'field') !== inF) W._gcChooseView(v);
      if (W._gcView && W._gcView.set) W._gcView.set(DV.choice() || ''); } catch (e) { warn(e); }
  }
  if (DV.kind() === 'phone' || asked || DV.choice() || !ready()) return;
  if (DV.askCached(me())) { ask(); return; }
  if (!cloudRead) { cloudRead = true; prefs().then(function(p){ if (askOf(p, me()) && !DV.choice() && ready()) ask(); }); }
}
function tick(){
  try { askTick(); } catch (e) { warn(e); }
  try { if (DV.signedEmail()) { profileCard(); teamAccess(); } } catch (e) { warn(e); }
}

/* ── My Profile: the person's own switch ── */
function profileH1(){ var hs = D.querySelectorAll('main h1'); for (var i = 0; i < hs.length; i++) if (s(hs[i].textContent) === 'My Profile') return hs[i]; return null; }
function profileCard(){
  var h1 = profileH1(), have = D.getElementById('gc-dm-prof');
  if (!h1) { if (have) have.remove(); return; }
  if (have && have.isConnected) return;
  css(); var c = D.createElement('div'); c.id = 'gc-dm-prof'; c.className = 'gc-dm-card';
  c.innerHTML = '<label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" data-dm-ask="me" disabled> <b>🖥📱 Ask me Field or Desk when I sign in</b></label><div class="mu">On a computer the Desk opens every time. Turn this on if you use one computer both ways: after each sign-in it asks 🖥 Desk or 📱 GrayCo Field. Your phone always opens GrayCo Field.</div>';
  h1.parentNode.insertBefore(c, h1.nextSibling);
  var cb = c.querySelector('input'), em = me();
  cb.checked = DV.askCached(em);
  prefs().then(function(p){ if (p) cb.checked = askOf(p, em); cb.disabled = !em; });
  cb.addEventListener('change', function(){
    var on = cb.checked; cb.disabled = true;
    setAsk(em, on).then(function(ok){ cb.disabled = false; if (!ok) { cb.checked = !on; toast('Could not save — check the connection.', true); return; }
      if (on) DV.setChoice(D.documentElement.classList.contains('_fieldmode') ? 'field' : 'desk');   /* this sign-in: what is on screen now; the next sign-in asks */
      toast(on ? 'The CRM will ask Field or Desk each time you sign in on a computer.' : 'Off — a computer opens the Desk every time.'); });
  });
}

/* ── 💎 Team access: an admin sets it for anyone (a box on each person's row) ── */
function teamAccess(){
  if (!isAdmin()) return;
  var picks = D.querySelectorAll('input[data-pick]'); if (!picks.length) return;
  var tbl = picks[0].closest('table'); if (!tbl) return;
  var need = []; Array.prototype.forEach.call(picks, function(pk){ var tr = pk.closest('tr'); if (tr && !tr.querySelector('[data-dm-ask]')) need.push([tr, low(pk.getAttribute('data-pick'))]); });
  if (!need.length) return;
  var head = tbl.querySelector('tr'); if (head && !head.querySelector('[data-dm-h]')) { var th = D.createElement('th'); th.setAttribute('data-dm-h', '1'); th.title = 'Ask Field or Desk at sign-in on a computer (phones always open GrayCo Field)'; th.textContent = 'Ask Field/Desk'; head.appendChild(th); }
  var cached = {}; try { cached = JSON.parse(lsGet(ASK) || '{}') || {}; } catch (e) {}
  need.forEach(function(x){
    var td = D.createElement('td'); td.style.textAlign = 'center';
    td.innerHTML = '<input type="checkbox" data-dm-ask="' + esc(x[1]) + '" aria-label="Ask ' + esc(x[1]) + ' Field or Desk at sign-in" title="Ask Field or Desk at sign-in (on a computer)"' + (cached[x[1]] ? ' checked' : '') + '>';
    x[0].appendChild(td);
  });
  if (!tbl.__dmPrefs) { tbl.__dmPrefs = true; prefs().then(function(p){ if (!p) return; Array.prototype.forEach.call(tbl.querySelectorAll('input[data-dm-ask]'), function(cb){ cb.checked = askOf(p, cb.getAttribute('data-dm-ask')); }); }); }
}
D.addEventListener('change', function(ev){
  var cb = ev.target; if (!cb || !cb.matches || !cb.matches('table input[data-dm-ask]')) return;
  ev.stopPropagation();
  var em = cb.getAttribute('data-dm-ask'), on = cb.checked; cb.disabled = true;
  setAsk(em, on).then(function(ok){ cb.disabled = false; if (!ok) { cb.checked = !on; toast('Could not save — check the connection.', true); } else toast(em + ': ' + (on ? 'asked Field or Desk at each sign-in on a computer' : 'the Desk on a computer, no question')); });
}, true);

W.addEventListener('storage', function(e){ if (e && e.key === 'gc_auth_v1' && !DV.signedEmail()) { DV.clearChoice('signed out in another window'); asked = false; cloudRead = false; } });
RI.call(W, function(){ if (!D.hidden) tick(); }, 800);
later(tick, 300);
W._gcDevMode = { prefs: prefs, setAsk: setAsk, ask: ask, state: function(){ return { device: DV.state(), asked: asked, cloudRead: cloudRead, prefs: CACHE }; } };
try { console.log('[GC] 🖥📱 DEVMODE: ' + DV.kind() + ' (' + DV.why() + ') → ' + (DV.wantField() ? 'GrayCo Field' : 'the Desk') + ' — _gcDevice.state(), _gcDevMode.state()'); } catch (e) {}
})();
