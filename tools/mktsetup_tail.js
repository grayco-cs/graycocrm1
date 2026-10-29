<script id="gc-patch-mktsetup">
/* ==========================================================================
   GrayCo CRM — patch MKTSETUP __GC_PATCH_MKTSETUP__ : 🧰 Marketing setup (a checklist in 🔗 Marketing logins)
   Owner (29 Oct 2026): "is all of these marketing sign ups available for malcolm marketing manager to do, sign up for etc
   without my passwords and involvement directly with our crm, i need all pages needed for marketing available in crm and
   easily accessible for him and admin".
   * One card per marketing platform: what it is for, the direct link, who does what ("Owner grants access once" with the
     exact menu path, or "the Marketing Manager signs up himself with accounts@grayco-cs.com so GrayCo owns the account"),
     and a status (Not started / Waiting on owner to grant access / In progress / Done).
   * The Marketing Manager and admins see it (🔗 Marketing logins); admins also get a progress card on 📣 Marketing.
   * The status is kept on the server (netlify/functions/soc.js op mkt_setup / mkt_setup_set → _lib/mm.js, gc_kv
     gc_mkt_admin.setup): he can set the status of a card and nothing else; "Admin only" cards (Resend) only an admin.
   * No password or API key is asked for, shown or kept. Netlify, Supabase, Twilio, Google Admin, Google Cloud and
     Resend stay admin-only.
   Console: _gcMktSetup.state()
   ========================================================================== */
(function(){
'use strict';
if (window.__GC_PATCH_MKTSETUP__) return; window.__GC_PATCH_MKTSETUP__ = true;
var W = window, D = document;
var nST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout.bind(W);
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function isMM(){ try { return typeof W._gcIsMM === 'function' && W._gcIsMM(); } catch (e) { return false; } }
var ITEMS = __MKTSETUP_ITEMS__;
var STATUS = [['todo', 'Not started', '#64748b'], ['owner', 'Waiting on owner to grant access', '#b45309'], ['doing', 'In progress', '#1d4ed8'], ['done', 'Done', '#15803d']];
var SL = {}; STATUS.forEach(function(x){ SL[x[0]] = x; });
var WHO = {
  grant: '👤 Owner grants access once — then {MMN} works in it with his own login',
  self: '🧑‍💼 {MMN} signs up himself with accounts@grayco-cs.com — GrayCo owns the account',
  both: '🧑‍💼 {MMN} signs up with accounts@grayco-cs.com · 👤 one admin step (below)',
  check: '🧑‍💼 {MMN} checks it — nothing to sign up',
  admin: '🔒 Admin only — nothing for the Marketing Manager'
};
var X = null, ST = { items: null, loading: false, err: '', at: 0, busy: {} };
function admin(){ return !isMM() && !!X && X.role() === 'admin'; }
function canSee(){ return isMM() || admin(); }
function canSet(it){ return admin() || (isMM() && it.mode !== 'admin'); }
/* who the Marketing Manager is (for the steps: "add <his e-mail>"); never a password */
function mmWho(){
  if (isMM()) { var n = '', e = ''; try { n = X.myName(); e = X.myEmail(); } catch (x) {} return { name: s(n), email: low(e) }; }
  var p = []; try { p = arr(typeof W._gcMMPeople === 'function' ? W._gcMMPeople() : []); } catch (x) {}
  return p[0] ? { name: s(p[0].name), email: low(p[0].email) } : { name: '', email: '' };
}
function fill(t, who){
  var first = s(who.name).split(/\s+/)[0] || 'the Marketing Manager';
  var em = who.email ? '<b>' + esc(who.email) + '</b>' : 'the Marketing Manager\'s e-mail';
  return esc(t).replace(/\{MMN\}/g, esc(first)).replace(/\{MM\}/g, em);
}
function statusOf(k){ var x = ST.items && ST.items[k]; return x && SL[x.status] ? x.status : 'todo'; }
function counts(){
  var c = { done: 0, owner: 0, doing: 0, todo: 0, total: ITEMS.length };
  ITEMS.forEach(function(it){ c[statusOf(it.k)]++; }); return c;
}
function load(force){
  if (!X || !canSee() || ST.loading || (ST.items && !force && Date.now() - ST.at < 60e3)) return;
  ST.loading = true;
  X.api('soc', { op: 'mkt_setup' }).then(function(j){
    ST.loading = false; ST.at = Date.now();
    if (j && j.ok) { ST.items = j.items || {}; ST.err = ''; } else { ST.err = (j && j.error) || 'not reachable'; if (!ST.items) ST.items = {}; }
    if (X.UI.root && X.UI.root.isConnected && /^(logins|home)$/.test(X.UI.sec) && !X.UI.editing) X.draw();
  });
}
function bar(c){
  var pct = c.total ? Math.round(100 * c.done / c.total) : 0;
  return '<div style="height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin:6px 0" aria-hidden="true"><div style="height:100%;width:' + pct + '%;background:#15803d"></div></div>';
}
function summary(c){ return '<b data-mks-progress>' + c.done + ' of ' + c.total + ' done</b>' + (c.owner ? ' · <span style="color:#b45309;font-weight:700">' + c.owner + ' waiting on the owner</span>' : '') + (c.doing ? ' · ' + c.doing + ' in progress' : ''); }
function steps(title, list, who){
  if (!arr(list).length) return '';
  return '<div style="margin:6px 0 0"><div style="font-weight:700">' + esc(title) + '</div><ol style="margin:4px 0 0 18px;padding:0">' + list.map(function(x){ return '<li style="margin:2px 0">' + fill(x, who) + '</li>'; }).join('') + '</ol></div>';
}
function card(it, who){
  var st = statusOf(it.k), sl = SL[st], rec = ST.items && ST.items[it.k];
  var h = '<div class="gmt-card" data-mks="' + esc(it.k) + '" data-status="' + st + '" style="border-left:4px solid ' + sl[2] + ';margin:0 0 12px">';
  h += '<div class="gmt-row" style="justify-content:space-between;align-items:flex-start;gap:6px;flex-wrap:wrap"><b>' + esc(it.ic + ' ' + it.l) + '</b>' + (it.mode === 'admin' ? X.chip('Admin only') : '') + '</div>';
  h += '<div class="gmt-muted" style="margin:3px 0">' + esc(it.d) + '</div>';
  h += '<div style="font-size:13px;margin:4px 0">' + fill(WHO[it.mode] || '', who) + '</div>';
  /* the status: a picker for him / admins, plain text otherwise */
  h += '<div class="gmt-row" style="gap:6px;align-items:center;flex-wrap:wrap;margin:6px 0">';
  if (canSet(it)) h += '<label class="gmt-muted" for="mks-' + esc(it.k) + '">Status</label><select id="mks-' + esc(it.k) + '" data-mks-set="' + esc(it.k) + '"' + (ST.busy[it.k] ? ' disabled' : '') + ' style="max-width:100%">' + STATUS.map(function(x){ return '<option value="' + x[0] + '"' + (x[0] === st ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>';
  else h += '<span style="font-weight:700;color:' + sl[2] + '">' + esc(sl[1]) + '</span>';
  if (rec && rec.by) h += '<span class="gmt-muted" style="font-size:12px">· ' + esc(rec.by) + (rec.at ? ' ' + esc(s(rec.at).slice(0, 10)) : '') + '</span>';
  h += '</div>';
  /* the links */
  var links = [];
  if (it.url && (it.mode !== 'admin' || admin())) links.push('<a class="gmt-btn" href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer">' + esc(it.go || ('Open ' + it.l)) + ' ↗</a>');
  if (it.url2) links.push('<a class="gmt-btn o" href="' + esc(it.url2) + '" target="_blank" rel="noopener noreferrer">' + esc(it.go2 || 'Open') + ' ↗</a>');
  if (it.sec && X.SECS.some(function(x){ return x.id === it.sec; })) links.push('<button class="gmt-btn o" data-a="go" data-sec="' + esc(it.sec) + '">' + esc(it.secL || 'Open in the CRM') + '</button>');
  if (links.length) h += '<div class="gmt-row" style="gap:6px;flex-wrap:wrap">' + links.join('') + '</div>';
  if (arr(it.own).length || arr(it.mm).length) {
    h += '<details style="margin-top:6px"' + (st === 'owner' && admin() ? ' open' : '') + '><summary style="cursor:pointer;font-weight:600">How to set it up</summary>';
    h += steps(it.mode === 'self' || it.mode === 'both' || it.mode === 'check' ? '🧑‍💼 ' + (s(who.name).split(/\s+/)[0] || 'The Marketing Manager') + ' does' : '🧑‍💼 Then ' + (s(who.name).split(/\s+/)[0] || 'the Marketing Manager') + ' does', it.mm, who);
    h += steps(it.mode === 'grant' ? '👤 Owner grants access once' : it.mode === 'admin' ? '🔒 Admin' : '👤 Owner / admin, once', it.own, who);
    h += '</details>';
  }
  return h + '</div>';
}
function section(){
  if (!canSee()) return '';
  load(false);
  var who = mmWho(), c = counts();
  var h = '<div class="gmt-card" data-mkt-setup><div class="gmt-row" style="justify-content:space-between;flex-wrap:wrap;gap:6px"><h2 style="margin:0">🧰 Marketing setup</h2><span>' + summary(c) + '</span></div>' + bar(c);
  h += '<div class="gmt-muted">Every marketing account GrayCo needs, one card each: what it is for, the link, and who does what. ' +
    '<b>Owner grants access once</b> = the owner adds ' + fill('{MM}', who) + ' as a user / manager (the exact menu is on the card) — no password is shared. ' +
    '<b>Signs up himself</b> = ' + fill('{MMN}', who) + ' makes the account with <b>accounts@grayco-cs.com</b>, so GrayCo owns it. ' +
    'No password or API key is asked for, shown or kept in the CRM. Netlify, Supabase, Twilio, Google Admin, Google Cloud and Resend stay admin-only.</div>';
  if (ST.err) h += '<div class="gmt-muted" style="color:#b91c1c">Could not load the saved statuses (' + esc(ST.err) + ').</div>';
  if (admin() && c.owner) h += '<div style="margin-top:8px;padding:8px 10px;background:#fff7ed;border-radius:8px" data-mks-owner><b>Waiting on you:</b> ' + ITEMS.filter(function(it){ return statusOf(it.k) === 'owner'; }).map(function(it){ return esc(it.ic + ' ' + it.l); }).join(' · ') + ' — open the card\'s "How to set it up".</div>';
  h += '</div><div data-mks-grid style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr));column-gap:14px">' + ITEMS.map(function(it){ return card(it, who); }).join('') + '</div>';
  return h;
}
function homeCard(){
  load(false);
  var c = counts();
  return '<div class="gmt-card" data-mks-home><div class="gmt-row" style="justify-content:space-between;flex-wrap:wrap;gap:6px"><h2 style="margin:0">🧰 Marketing setup</h2><button class="gmt-btn" data-a="go" data-sec="logins">Open the checklist</button></div>' + bar(c) +
    '<div>' + summary(c) + '</div><div class="gmt-muted">Google Analytics, Search Console, Ads, Business Profile, Meta, Local Services, CallRail, Zapier, listings… what the Marketing Manager signs up for himself and what needs you once.</div></div>';
}
D.addEventListener('change', function(ev){
  var t = ev.target, k = t && t.getAttribute && t.getAttribute('data-mks-set'); if (!k || !X) return;
  var it = ITEMS.filter(function(x){ return x.k === k; })[0]; if (!it || !canSet(it)) return;
  var v = s(t.value); if (!SL[v]) return;
  var prev = ST.items && ST.items[k]; ST.items = ST.items || {};
  ST.items[k] = { status: v, by: (function(){ try { return X.myName(); } catch (e) { return ''; } })(), at: new Date().toISOString() };
  ST.busy[k] = 1; X.draw();
  X.api('soc', { op: 'mkt_setup_set', key: k, status: v }).then(function(j){
    delete ST.busy[k];
    if (j && j.ok) { if (j.items) ST.items = j.items; X.toast(it.l + ': ' + SL[v][1]); }
    else { if (prev) ST.items[k] = prev; else delete ST.items[k]; X.toast('Not saved: ' + ((j && j.error) || 'try again'), true); }
    ST.at = Date.now(); X.draw();
  });
}, true);
function install(){
  var lo = X.VIEWS.logins;
  X.VIEWS.logins = function(){ var h = lo.apply(this, arguments); return canSee() ? section() + h : h; };
  X.VIEWS.logins.__mks = true;
  var home0 = X.VIEWS.home;
  X.VIEWS.home = function(){ var h = home0.apply(this, arguments); return admin() ? homeCard() + h : h; };
  /* admins: the setup in the 🔗 Marketing logins description */
  X.SECS.forEach(function(x){ if (x.id === 'logins' && !/setup/.test(x.d)) x.d = '🧰 Marketing setup checklist + ' + x.d; });
  if (X.UI.root && X.UI.root.isConnected && /^(logins|home)$/.test(X.UI.sec)) X.draw();
}
var tries = 0;
(function boot(){ var x = W._gcMktExt; if (!x || !x.VIEWS || !x.VIEWS.home || typeof x.VIEWS.logins !== 'function' || !W._gcMMT) { if (tries++ < 300) nST(boot, 400); return; } X = x; install(); })();
/* the logins section may be added a moment later (the role arrives late): the description follows */
(function desc(n){ try { if (X) X.SECS.forEach(function(x){ if (x.id === 'logins' && !/setup/.test(x.d)) x.d = '🧰 Marketing setup checklist + ' + x.d; }); } catch (e) {} if (n > 0) nST(function(){ desc(n - 1); }, 1500); })(40);
W._gcMktSetup = { items: ITEMS, state: function(){ return { loaded: !!ST.items, err: ST.err, counts: counts(), statuses: ST.items }; }, reload: function(){ load(true); } };
try { console.log('[GC] patch MKTSETUP: 🧰 Marketing setup in 🔗 Marketing logins — _gcMktSetup.state()'); } catch (e) {}
})();
</script>
