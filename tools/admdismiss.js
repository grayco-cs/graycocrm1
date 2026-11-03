/* __GC_PATCH_ADMDISMISS__ — ⚙ ADMIN: A ✕ ON A CARD AT THE TOP STAYS DISMISSED   (patch ADMDISMISS)
   Owner 11/02: "I deleted this stuff and it's back." Patch ADM's ✕ only hid a card until the page was reloaded (it was
   kept in memory), so every reload, every other computer and every sync brought it back.
   • ONE helper for every card at the top of ⚙ Admin: patch ADM's own warnings (two people on one e-mail, extra spaces in a
     name, no role, PM without a phone, …) + every window._gcAdmExtraWarnings generator (sub pay check, the nightly data
     check, Twilio, Senior PM, Senior Estimator, duplicate estimates, lead source, storage …). Safety cards (the pay
     check) are dismissible too: the owner decides. (DATAFULL's 🧾 Missing job data banner is not touched here: it is
     being moved to the To-Do by patch TOPBAR.)
   • Saved PER PERSON in the cloud: gc_kv "gc_adm_dismiss__<e-mail>" =
       { v: 1, email, cards: { <card key>: { h: [content hashes], until, at, by, t } } }
     (+ a copy on this computer, so the first paint already knows). Per card the newest change wins; the cloud row is read
     before every write. Survives reloads, other computers and sync. Nothing else is stored or changed.
   • A dismissed card comes back ONLY when its CONTENT changes — something on it that was not there when it was dismissed:
     a new failing invoice, a new item in the data check, a different pair on one e-mail… Fewer items keep it hidden.
     The content settles first: a card still loading (w.loading) is never "new"; what a card shows in the 90 s after
     the ✕ is part of what was dismissed; and something new must stay 45 s before the card comes back. Dismissing a card
     again keeps what was dismissed before (the content only grows, until "Show again").
     The content is each card's list of items (its own `items` when the card gives them, else its title — counts left
     out — and its lines), kept as short hashes.
   • 🔕 7 days: hidden for 7 days, or sooner if something new shows up on it.
   • "🔕 N hidden" under the cards lists them; "Show again" brings one back (for every computer).
   • Also (owner 11/02, "these be white"): the ⚙ Admin rows that were still dark navy with gold buttons (🗓 Schedule
     templates, 🗄 Year-end archive, 📬 Mail received, any other navy patch row there) get the white card style of the rows
     around them. Display only.
   API: window._gcAdmDismiss = { hidden(w), dismiss(w, days), restore(key), keyOf(w), items(w), until(w), pull(), state() } */
(function(){
'use strict';
if (window.__GC_PATCH_ADMDISMISS__) return; window.__GC_PATCH_ADMDISMISS__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
function parse(v){ if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return null; } } return v; }
function nowIso(){ return new Date().toISOString(); }
function warn(e){ try { console.warn('[GC ADMDISMISS]', e && e.message || e); } catch (x) {} }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

var PFX = 'gc_adm_dismiss__', LOC = 'gc_adm_dismiss_local', DAY = 864e5, KEEP = 120 * DAY;
function me(){ try { var A = W.__GC_AUTH__; var e = A && A.email && A.email(); if (e) return low(e); } catch (e) {} return ''; }
function creds(){ var u = '', k = ''; try { u = (lsGet('grayco_sb_url') || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''); k = lsGet('grayco_sb_key') || ''; } catch (e) {} return { u: u, k: k }; }

/* ── the content of a card ── */
function hash(str){ var x = 0x811c9dc5; str = String(str); for (var i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; } return x.toString(36); }
/* a line without its numbers (counts, amounts, %) and plurals: "2 sub invoices fail" = "1 sub invoice fails" */
function normLine(t){
  return low(String(t == null ? '' : t).replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' '))
    .replace(/\$?\d[\d,.]*%?/g, '#').replace(/\b([a-z]{3,})s\b/g, '$1').replace(/\s+/g, ' ').trim();
}
var TITLE_ONLY = /^(dup-email|no-role|pm-no-phone|estimator-role|name-spaces|off-pm|companycam|senior-pm|estimator-default|twilio)$/;
function keyOf(w){ return s(w && w.id || 'card') + ':' + s(w && (w.key != null && w.key !== '' ? w.key : normLine(w.title))); }
function items(w){
  if (!w) return [];
  if (Array.isArray(w.items)) return w.items.map(String);
  /* two people on one e-mail: one item per person (the title lists them in whatever order the people list has) */
  if (s(w.id) === 'dup-email') return String(w.title || '').replace(/<[^>]*>/g, '').replace(/\s+both use\s+.*$/i, '').split(/\s+and\s+/).map(function(n){ return 'person:' + normLine(n) + '|' + low(w.key); }).sort();
  var out = [normLine(w.title)];
  if (!TITLE_ONLY.test(s(w.id))) String(w.text || '').split(/<br\s*\/?>/i).forEach(function(l){ var n = normLine(l); if (n && n !== '…' && n !== '...') out.push(n); });
  return out;
}
function hashes(w){ var seen = {}, out = []; items(w).forEach(function(x){ var h = hash(x); if (!seen[h]) { seen[h] = 1; out.push(h); } }); return out; }

/* ── the record: this person's dismissed cards ── */
var S = { email: '', cards: {}, pulledAt: 0, busy: false, dirty: false, wrote: 0, err: '' };
function merge(a, b){
  var out = {}, now = Date.now();
  [a, b].forEach(function(m){ Object.keys(m || {}).forEach(function(k){ var r = m[k]; if (!r || typeof r !== 'object') return; if (!out[k] || s(r.at) > s(out[k].at)) out[k] = r; }); });
  Object.keys(out).forEach(function(k){ var r = out[k], at = Date.parse(r.at) || 0;
    if (r.clr && now - at > KEEP) delete out[k];                                                   /* an old "show again" */
    else if (r.until && Date.parse(r.until) < now - KEEP) delete out[k]; });                         /* a 7-day hide long over */
  return out;
}
function localAll(){ var a = parse(lsGet(LOC)); return a && typeof a === 'object' ? a : {}; }
function sync(){
  var e = me(); if (!e) return false;
  if (S.email !== e) { S.email = e; S.pulledAt = 0; S.dirty = false; var mine = localAll()[e]; S.cards = merge({}, mine && mine.cards); if (mine && mine.dirty) S.dirty = true; }
  return true;
}
function saveLocal(){ if (!S.email) return; var a = localAll(); a[S.email] = { cards: S.cards, at: nowIso(), dirty: S.dirty }; lsSet(LOC, JSON.stringify(a)); }
function rowKey(){ return PFX + S.email; }
function cloudRead(){
  var c = creds(); if (!c.u || !c.k) return Promise.reject(new Error('not connected'));
  return W.fetch(c.u + '/rest/v1/gc_kv?select=value,updated_at&key=eq.' + encodeURIComponent(rowKey()), { headers: { apikey: c.k, Authorization: 'Bearer ' + c.k }, cache: 'no-store' })
    .then(function(r){ return r.ok ? r.json() : Promise.reject(new Error('read ' + r.status)); })
    .then(function(rows){ var v = parse(rows && rows[0] ? rows[0].value : null); return v && v.cards && typeof v.cards === 'object' ? v.cards : {}; });
}
function cloudWrite(cards){
  var c = creds(); if (!c.u || !c.k) return Promise.reject(new Error('not connected'));
  return W.fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { apikey: c.k, Authorization: 'Bearer ' + c.k, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: rowKey(), value: JSON.stringify({ v: 1, email: S.email, cards: cards }), updated_at: nowIso() }) })
    .then(function(r){ if (!r.ok) throw new Error('save ' + r.status); return true; });
}
function repaint(){ try { if (typeof W._gcAdmPaintTop === 'function') W._gcAdmPaintTop(); } catch (e) {} }
function pull(){
  if (!sync() || S.busy) return Promise.resolve(false);
  S.busy = true;
  return cloudRead().then(function(cloud){
    var before = JSON.stringify(S.cards); S.cards = merge(S.cards, cloud); S.pulledAt = Date.now(); S.busy = false; S.err = '';
    var changed = JSON.stringify(S.cards) !== before; saveLocal();
    if (S.dirty) push();
    if (changed) repaint();
    return changed;
  }, function(e){ S.busy = false; S.err = s(e && e.message); return false; });
}
/* read the cloud row, keep the newest of each card, write it back */
function push(){
  if (!sync()) return Promise.resolve(false);
  S.dirty = true; saveLocal();
  return cloudRead().then(function(cloud){ S.cards = merge(cloud, S.cards); return cloudWrite(S.cards); })
    .then(function(){ S.dirty = false; S.wrote = Date.now(); S.err = ''; saveLocal(); return true; }, function(e){ S.err = s(e && e.message); warn(e); return false; });
}

/* ── the rule ── */
function rec(w){ sync(); return S.cards[keyOf(w)] || null; }
function active(r){ return !!(r && !r.clr && !(r.until && Date.parse(r.until) <= Date.now())); }
/* A card's lists load in steps (the approvals queue, the invoices, the Subs / Vendors list, the cloud's merge): what it
   shows in the first seconds is not its content yet. So:
   • a card that says it is still loading (w.loading) never counts as new content;
   • for GROW after a ✕ the dismissed content takes in what the card shows (it finished loading);
   • something new must stay on the card SETTLE before the card comes back (a list half-loaded on this computer, an
     item that flickers while two copies merge, do not bring it back). */
var GROW = 90000, SETTLE = 45000, SEEN = {}, HERE = {}, SAVE_T = 0, PAINT_T = 0;
function saveSoon(){ saveLocal(); if (SAVE_T) return; SAVE_T = later(function(){ SAVE_T = 0; push(); }, 3000); }
function hidden(w){
  var r = rec(w); if (!active(r)) return false;
  var k = keyOf(w), cur = hashes(w), have = {}, now = Date.now();
  (Array.isArray(r.h) ? r.h : []).forEach(function(x){ have[x] = 1; });
  var fresh = cur.filter(function(x){ return !have[x]; });
  if (!fresh.length) { delete SEEN[k]; return true; }                              /* nothing new on it */
  if (r.grow && Date.parse(r.grow) > now && HERE[k]) {                              /* just dismissed on this computer: still loading */
    r.h = (r.h || []).concat(fresh); r.at = nowIso(); saveSoon(); delete SEEN[k]; return true;
  }
  if (w.loading) return true;
  var seen = SEEN[k] = SEEN[k] || {}, keep = {};
  fresh.forEach(function(x){ keep[x] = 1; if (!seen[x]) seen[x] = now; });
  Object.keys(seen).forEach(function(x){ if (!keep[x]) delete seen[x]; });
  if (fresh.some(function(x){ return now - seen[x] >= SETTLE; })) return false;   /* something new, and it stayed */
  if (!PAINT_T) PAINT_T = later(function(){ PAINT_T = 0; repaint(); }, SETTLE + 500);
  return true;
}
function dismiss(w, days){
  if (!sync() || !w) return false;
  var old = rec(w), h = hashes(w);
  if (active(old) && Array.isArray(old.h)) old.h.forEach(function(x){ if (h.indexOf(x) < 0) h.push(x); });   /* what was dismissed before stays dismissed */
  S.cards[keyOf(w)] = { h: h, until: days ? new Date(Date.now() + days * DAY).toISOString() : '', grow: new Date(Date.now() + GROW).toISOString(), at: nowIso(), by: S.email, t: s(String(w.title || '').replace(/<[^>]*>/g, '')).slice(0, 90) };
  delete SEEN[keyOf(w)]; HERE[keyOf(w)] = 1;
  saveLocal(); push();
  return true;
}
function restore(key){
  if (!sync() || !key) return false;
  S.cards[key] = { clr: true, at: nowIso(), by: S.email };
  delete SEEN[key];
  saveLocal(); push(); repaint();
  return true;
}
function until(w){ var r = rec(w); return r && r.until ? r.until : ''; }

function adminView(){ return low(lsGet('grayco_view')) === 'admin'; }
function toast(msg){
  try { var t = D.createElement('div'); t.setAttribute('data-gc-keep', '1'); t.className = 'gc-adm-toast'; t.textContent = msg; D.body.appendChild(t); later(function(){ try { t.remove(); } catch (e) {} }, 4200); } catch (e) {}
}

/* ── the navy Admin rows → the white card style of the rows around them (display only) ── */
var WHITE = { 'gc-aut3-admin': '#2563eb', 'gc-auto5-admin': '#0f766e' };
function navy(el){
  var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(getComputedStyle(el).backgroundColor || '');
  if (!m || (m[4] != null && +m[4] < 0.5)) return false;
  var r = +m[1], g = +m[2], b = +m[3];
  return (0.299 * r + 0.587 * g + 0.114 * b) < 80 && b > r;                       /* dark blue (#0f2440 and its kin) */
}
function whiteRows(){
  if (!adminView()) return;
  var main = D.querySelector('main'); if (!main) return;
  var h1 = [].filter.call(main.querySelectorAll('h1'), function(x){ return s(x.textContent) === 'Admin'; })[0]; if (!h1 || !h1.parentNode) return;
  var host = h1.parentNode;
  [].forEach.call(host.children, function(el){
    if (el.classList.contains('gc-admd-white')) return;
    var id = el.id || '';
    var known = WHITE[id] || (el.classList.contains('gc-mailrecv') ? '#475569' : '');
    if (!known && !(/^gc-/.test(id) && el.id !== 'gc-adm-top' && el.id !== 'gc-adm-hub' && navy(el))) return;
    el.classList.add('gc-admd-white'); el.style.setProperty('--admd-acc', known || '#0f2440');
  });
  /* a navy row inside a white wrapper (one level down), e.g. a bar drawn in its own box */
  [].forEach.call(host.querySelectorAll(':scope > [id^="gc-"] > div'), function(el){ if (!el.classList.contains('gc-admd-white') && el.querySelector('button') && navy(el)) { el.classList.add('gc-admd-white'); el.style.setProperty('--admd-acc', '#0f2440'); } });
}
function css(){
  if (D.getElementById('gc-admd-css')) return;
  var c = D.createElement('style'); c.id = 'gc-admd-css';
  c.textContent = '.gc-adm-hidden{margin:2px 0 8px;font:12px Inter,Arial,sans-serif;color:#64748b}.gc-adm-hidden>button.gc-adm-x{font-size:12px;color:#64748b;font-weight:700}' +
    '.gc-adm-hrow2{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:5px 0 5px 4px;border-bottom:1px dashed #e2e8f0}.gc-adm-hrow2 span{flex:1;min-width:0}' +
    '.gc-adm-warn .gc-adm-snz{padding:4px 8px;font-size:11px}' +
    '.gc-admd-white{background:#fff!important;border:1px solid #e2e8f0!important;border-left:3px solid var(--admd-acc,#0f2440)!important;border-radius:10px!important;color:#0f172a!important;padding:10px 12px!important;font-family:Inter,-apple-system,Arial,sans-serif!important}' +
    '.gc-admd-white b,.gc-admd-white summary,.gc-admd-white [style*="color:#fff"],.gc-admd-white [style*="color:#e2e8f0"]{color:#0f172a!important}' +
    '.gc-admd-white [style*="color:#8fa8c4"],.gc-admd-white [style*="color:#cbd5e1"],.gc-admd-white [style*="color:#fde68a"]{color:#475569!important}' +
    '.gc-admd-white [style*="color:#86efac"]{color:#15803d!important}.gc-admd-white [style*="color:#60a5fa"]{color:#2563eb!important}.gc-admd-white [style*="color:#fca5a5"]{color:#b91c1c!important}' +
    '.gc-admd-white [style*="rgba(255,255,255,.04)"]{background:#f8fafc!important}' +
    '.gc-admd-white button{background:var(--admd-acc,#0f2440)!important;color:#fff!important;border:none!important;border-radius:8px!important;padding:8px 14px!important;font-weight:800!important;min-height:36px;cursor:pointer}' +
    '.gc-admd-white button:disabled{opacity:.5}' +
    '.gc-admd-white select{background:#fff!important;color:#0f172a!important;border:1px solid #cbd5e1!important;border-radius:6px!important;min-height:36px}';
  D.head.appendChild(c);
}

/* ── the loop: the cloud when ⚙ Admin is open (and every 2 minutes there), a retry of a save that did not reach it ── */
var LAST = { pull: 0, paint: 0, view: '' };
function tick(){
  try {
    css();
    if (!sync()) return;
    var v = adminView(), now = Date.now();
    if (v && (LAST.view !== 'admin' || now - LAST.pull > 120000) && !D.hidden) { LAST.pull = now; pull(); }
    else if (!v && now - LAST.pull > 600000) { LAST.pull = now; pull(); }
    if (S.dirty && now - S.wrote > 30000 && !S.busy) { S.wrote = now; push(); }
    LAST.view = v ? 'admin' : '';
    if (v) {
      whiteRows();
      if (now - LAST.paint > 20000 && !D.hidden) { LAST.paint = now; try { if (typeof W._gcAdmPaintTop === 'function') W._gcAdmPaintTop(); } catch (e) {} }   /* new content shows without a reload */
    }
  } catch (e) { warn(e); }
}
later(tick, 300); RI.call(W, tick, 1000);

W._gcAdmDismiss = { hidden: hidden, dismiss: dismiss, restore: restore, keyOf: keyOf, items: items, until: until, pull: pull, push: push,
  state: function(){ sync(); return { email: S.email, cards: JSON.parse(JSON.stringify(S.cards)), pulledAt: S.pulledAt, dirty: S.dirty, err: S.err, key: S.email ? rowKey() : '' }; } };
try { console.log('[GC] ⚙ Admin: a ✕ stays dismissed until something new shows up (patch ADMDISMISS) — _gcAdmDismiss.state()'); } catch (e) {}
})();
