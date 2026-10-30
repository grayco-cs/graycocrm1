/* __GC_PATCH_FIELDPORTAL__ — GrayCo Field: the portals, photos and messages on every job; the job page as an app; ⚙ Settings.
   Owner 10/30: "I want to be able to see sub portal and customer portals in my field view app and have easy access to
   enter into customer portal and photos on every job" · "Messages pop up is weird … That button should be the GrayCo
   photos button" · "Move brain to diamond" · "These buttons need to be on top and the other options down" · "It feels
   like a webpage scrolling down, not an app" · "the 3rd button … customer portal … the 4th the sub portal … so I can
   post directly in those".
   • Every job card on the Field home: 👤 Customer portal · 🔧 Sub portal · 📸 Photos · 💬 Message.
   • The job's field page (#_gcJobDash): a fixed compact header, only the content scrolls; on top the tiles in this
     order: Update Progress · Job Info · 👤 Customer portal · 🔧 Sub portal · Post Update · 💬 Message · Add Photo/File ·
     📒 Daily Log (the Site Book) · 💰 Financials, Invoices & COs (profit / margin only for admin, office and the job's
     own PM) · 📅 Schedule & Inspections (schedule, the job's inspections, the permit checklist, walkthroughs) · Documents · Create Document · the rest · 📸 GrayCo Photos; E-mail the customer, Call / Text / Map and the cards below.
     Add Photo/File: photos go through GrayCo Photos' own upload (the "Customer can see?" question, downscale, sync);
     any other file (PDF …) goes to the job's Documents through the job profile's own file input, as before.
   • 👤 Customer portal: 📣 Post to the customer portal (patch Q's own post — the same rules as the desk Portal card),
     👁 See what the customer sees (the portal's staff preview "&p=1": not counted as the customer opening it, nothing
     sent), or 🏠 Make portal (patch Q's own "by hand" link — sends nothing) when the job has none.
   • 🔧 Sub portal: the job's subs (pick one when there are several) → what that sub sees: the Today card (address,
     Maps, PO, the customer — the phone only when the job lets subs see it), their days on the schedule, their uploads;
     💬 Post to the sub (patch SUB's staff → sub thread: a note, photo or file) and 👷 Subs & portal (patch SUB's hub).
     Staff only — nothing here is ever shown on the customer portal.
   • Who: admin / owner / office (window._gcProjSeesAll, patch PROJLEAK) — every button on every job; a PM / APM — the
     portals, photos and messages on his own jobs (window._gcProjScope); everyone else — photos and messages on the jobs
     the Projects list gives them. No one gets a job they could not open before.
   • Bottom bar: 💬 Messages → 📸 Photos (GrayCo Photos, all of the person's jobs). The "Pick a job to message" picker
     (still on the office / marketing tiles and the 💎 menu) reads the Jobs tab's list (role rules), shows "Loading your
     jobs…" until the jobs are on the phone and fills itself in, instead of a stuck "No jobs yet."
   • 🧠 Business Brain: no floating button in Field view; it is the first item of the 💎 menu.
   • ⚙ Settings (☰ More → ⚙ Settings): My profile · Notifications · On call · Data-entry mode (admins) · Customer photo
     default · Help · Admin shortcuts (admin / office). Existing screens and stores only.
   No timers, no polling, no observers. API: window._gcFP */
(function(){
'use strict';
if (window.__GC_PATCH_FIELDPORTAL__) return; window.__GC_PATCH_FIELDPORTAL__ = true;
var W = window, D = document;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function C(){ return W._crm || {}; }
function digits(v){ var d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function today(){ var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { if (v == null || v === '') localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
function myEmail(){ try { if (W.__GC_AUTH__ && W.__GC_AUTH__.email) return low(W.__GC_AUTH__.email()); } catch (e) {} return ''; }
function meU(){ var m = myEmail(), n = low(lsGet('grayco_user')); return arr(C().users).filter(function(u){ return u && ((m && low(u.email) === m) || (!m && n && low(u.name) === n)); })[0] || null; }
function role(){ try { return W._gcRP && W._gcRP.role ? s(W._gcRP.role()) : ''; } catch (e) { return ''; } }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function toast(t){
  var el = D.getElementById('gcfp-toast'); if (!el) { el = D.createElement('div'); el.id = 'gcfp-toast'; el.setAttribute('data-gc-keep', '1'); D.body.appendChild(el); }
  el.textContent = t; el.style.display = 'block'; clearTimeout(el.__t); el.__t = (W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout).call(W, function(){ el.style.display = 'none'; }, 3500);
}

/* ── the jobs (the Jobs tab's list; the phone's own copy while the app is still loading) ── */
var RAWJ = null, rawBusy = false;
function rawLoad(){
  if (rawBusy || RAWJ) return; rawBusy = true;
  var src = null; try { src = typeof W._gcProjectsRaw === 'function' ? W._gcProjectsRaw() : (W.idbGet ? W.idbGet('projects') : null); } catch (e) {}
  Promise.resolve(src).then(function(v){
    rawBusy = false; if (!Array.isArray(v) || !v.length) return; RAWJ = v;
    /* the message picker opened while nothing was loaded: fill it in now */
    var x = D.getElementById('_jpX'), l = D.getElementById('_jpList');
    if (x && l && !l.querySelector('[data-pid]') && typeof W._gcPickJobForMessages === 'function') { x.click(); W._gcPickJobForMessages(); }
  }, function(){ rawBusy = false; });
}
function allJobs(){ var l = arr(C().projects); if (!l.length) { rawLoad(); l = arr(RAWJ); } return l.filter(function(p){ return p && p.id && !p.deleted && !p.tombstoned; }); }
function scoped(list){ try { if (typeof W._gcProjScope === 'function') return arr(W._gcProjScope(list)); } catch (e) {} return list; }
function proj(pid){ return allJobs().filter(function(p){ return s(p.id) === s(pid); })[0] || null; }
W._gcFPJobs = function(){ return scoped(allJobs()); };
/* the order of a job list: Active / In progress · the other open stages · Completed / Lost; latest activity on top */
function grp(p){ var st = low(p.status); if (p.history || p.recordOnly || /complete|closed|lost|cancel|archiv|dead|void|history/.test(st)) return 2; if (!st || /active|in.?progress|started|underway|production|working/.test(st)) return 0; return 1; }
function lastAt(p){
  var best = 0; [p.updatedAt, p.savedAt, p.lastPhotoAt, p.lastLogAt, p.lastActivityAt, p.portalAt].forEach(function(v){ var t = Date.parse(s(v)); if (t > best) best = t; });
  if (!best) [p.startDate, p.start, p.createdAt, p.created, p.dateCreated].some(function(v){ var t = Date.parse(s(v)); if (t) { best = t; return true; } return false; });
  return best;
}
W._gcFPSort = function(list){ return arr(list).map(function(p, i){ return { p: p, g: grp(p || {}), t: lastAt(p || {}), i: i }; }).sort(function(a, b){ return (a.g - b.g) || (b.t - a.t) || (a.i - b.i); }).map(function(x){ return x.p; }); };
W._gcFPJobsLoading = function(){ return !allJobs().length; };

/* ── who gets which button (PROJLEAK's rule; never wider) ── */
function seesAll(){ try { if (typeof W._gcProjSeesAll === 'function') return !!W._gcProjSeesAll(); } catch (e) {} return false; }
function own(p){ return !!p && scoped([p]).length > 0; }
function pmRole(){ return /project manager|\bapm\b|assistant p/i.test(role()); }
function perms(p){
  var all = seesAll(), mine = all || own(p), pm = !all && mine && pmRole();
  return { cust: all || pm, sub: all || pm, photos: mine, msg: mine };
}

/* ── the customer portal (patch Q's link: /portal.html#t=<43>; the staff preview adds &p=1) ── */
var LINK = /^https:\/\/[^\s]+\/portal\.html#t=[A-Za-z0-9_-]{43}$/, MADE = {};
function linkOf(p){ if (!p || p.portalOff) return ''; var u = s(p.portalUrl); if (!LINK.test(u)) u = s(MADE[p.id]); return LINK.test(u) ? u : ''; }
function previewUrl(p){ var u = linkOf(p); return u ? u + '&p=1' : ''; }

/* ── a bottom sheet ── */
function sheet(title, html){
  css();
  Array.prototype.forEach.call(D.querySelectorAll('.gcfp-sheet'), function(o){ o.remove(); });
  var o = D.createElement('div'); o.className = 'gcfp-sheet'; o.setAttribute('data-gc-keep', '1'); o.setAttribute('data-gcnav-ignore', '1');
  o.innerHTML = '<div class="in"><div class="hd"><b>' + esc(title) + '</b><button type="button" data-x aria-label="Close">✕</button></div><div class="bd">' + html + '</div></div>';
  o.addEventListener('click', function(e){ if (e.target === o || (e.target.closest && e.target.closest('[data-x]'))) o.remove(); });
  D.body.appendChild(o);
  return { o: o, body: o.querySelector('.bd') };
}

function custSheet(p){
  var url = previewUrl(p), P = W._gcPortal || {}, h = '';
  if (typeof P.post === 'function') h += '<button type="button" class="gcfp-big pri" data-c="post">📣 Post to the customer portal<small>An update or photos — the same as the Portal card\'s 📣 Post</small></button>';
  if (url) h += '<a class="gcfp-big" data-c="see" href="' + esc(url) + '" target="_blank" rel="noopener">👁 See what the customer sees<small>Preview — not counted as the customer opening it; nothing is sent</small></a>';
  else if (p.portalOff) h += '<div class="gcfp-note">The portal link is turned off for this job (desk: the job\'s 🏠 Portal card → ⋯).</div>';
  else if (typeof P.link === 'function') h += '<button type="button" class="gcfp-big" data-c="make">🏠 Make portal<small>Makes the customer\'s link — nothing is sent to the customer</small></button>';
  else h += '<div class="gcfp-note">No portal yet.</div>';
  var sh = sheet('👤 Customer portal — ' + s(p.name), h);
  sh.body.addEventListener('click', function(e){
    var b = e.target.closest('[data-c]'); if (!b) return; var c = b.getAttribute('data-c');
    if (c === 'see') { sh.o.remove(); return; }   /* the link opens the tab itself (iPhone: in the tap) */
    if (c === 'post') { sh.o.remove(); P.post(p.id); return; }
    if (c === 'make') {
      b.disabled = true; b.firstChild.textContent = 'Making the portal link…';
      Promise.resolve(P.link(p.id)).then(function(u){
        if (u && LINK.test(u)) { MADE[p.id] = u; toast('🏠 Portal made — nothing was sent to the customer.'); custSheet(proj(p.id) || p); repaint(); }
        else { b.disabled = false; b.firstChild.textContent = '🏠 Make portal'; toast('The portal link was not made — try again with a signal.'); }
      });
    }
  });
  return sh;
}

/* ── the sub portal: what the sub sees for this job ── */
function subsAll(){ var seen = {}, out = []; arr(C().subs).concat(arr(C().vendors)).forEach(function(r){ if (r && r.id && !seen[r.id]) { seen[r.id] = 1; out.push(r); } }); return out; }
function norm(v){ return low(v).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim(); }
function subsOn(p){
  var all = subsAll(), seen = {}, out = [];
  arr(p.subs).forEach(function(r, i){
    if (!r) return;
    var id = s(r.subId || r.vendorId), n = norm(r.name || r.sub || r.vendor || r.company);
    var sb = (id && all.filter(function(x){ return s(x.id) === id; })[0]) || (n && all.filter(function(x){ return norm(x.name) === n || norm(x.company) === n; })[0]) || null;
    var key = sb ? s(sb.id) : 'row' + i; if (seen[key]) return; seen[key] = 1;
    out.push({ key: key, row: r, sub: sb, name: s(r.name || (sb && (sb.company || sb.name)) || r.sub || 'Sub'), trade: s(r.trade || (sb && sb.trade)) });
  });
  return out;
}
function subDays(p, x){
  var n = norm(x.sub ? x.sub.name : x.name), c = norm(x.sub && x.sub.company), id = x.sub ? s(x.sub.id) : '';
  return arr(C().schedule).filter(function(r){
    if (!r || r.deleted || s(r.pid || r.projectId || r.jobId) !== s(p.id)) return false;
    if (id && (s(r.subId) === id || s(r.vendorId) === id)) return true;
    var who = norm([r.sub, r.subName, r.assignee, r.crew, r.title].join(' '));
    return !!((n && who.indexOf(n) >= 0) || (c && who.indexOf(c) >= 0));
  }).map(function(r){ var a = s(r.date || r.start || r.startDate).slice(0, 10), b = s(r.endDateSch || r.endDate || r.end || a).slice(0, 10) || a; return { a: a, b: b, t: s(r.title || r.name), time: s(r.time) }; })
    .filter(function(r){ return r.a; }).sort(function(u, v){ return u.a < v.a ? -1 : 1; });
}
var DOCS = null, docsBusy = false;
function docsAll(){
  var l = arr(C().projectDocs); if (l.length) return l; l = arr(W._gcProjectDocs); if (l.length) return l;
  return arr(DOCS);
}
function docsLoad(then){   /* the job papers live on the phone (IndexedDB "projectDocs"); read once when a sheet needs them */
  if (DOCS || docsBusy || !W.idbGet) return; docsBusy = true;
  Promise.resolve(W.idbGet('projectDocs')).then(function(v){ docsBusy = false; DOCS = arr(v); if (then) then(); }, function(){ docsBusy = false; DOCS = []; });
}
function subSheet(p, key){
  var list = subsOn(p), H = W._gcSubHub || {};
  if (!list.length) {
    var sh0 = sheet('🔧 Sub portal — ' + s(p.name), '<div class="gcfp-note">No subs on this job yet.</div>' + (typeof H.open === 'function' ? '<button type="button" class="gcfp-big" data-s="hub">👷 Subs & portal<small>Add a sub to this job, scopes, links, messages</small></button>' : ''));
    sh0.body.addEventListener('click', function(e){ if (e.target.closest('[data-s="hub"]')) { sh0.o.remove(); H.open(p.id); } });
    return sh0;
  }
  var x = key ? list.filter(function(y){ return y.key === key; })[0] : (list.length === 1 ? list[0] : null);
  if (!x) {
    var sh1 = sheet('🔧 Sub portal — ' + s(p.name), '<div class="gcfp-note">Pick a sub to see what they see for this job.</div>' + list.map(function(y){ return '<button type="button" class="gcfp-big" data-k="' + esc(y.key) + '">' + esc(y.name) + '<small>' + esc([y.trade, s(y.row.status)].filter(Boolean).join(' · ') || 'Sub') + '</small></button>'; }).join(''));
    sh1.body.addEventListener('click', function(e){ var b = e.target.closest('[data-k]'); if (b) subSheet(p, b.getAttribute('data-k')); });
    return sh1;
  }
  var addr = s(p.address || p.jobAddress), po = s(p.autoPO || p.poNumber || p.po), cph = s(p.clientPhone || p.phone), t = today();
  var days = subDays(p, x), now = days.filter(function(d){ return d.a <= t && t <= d.b; })[0], next = days.filter(function(d){ return d.a > t; }).slice(0, 4);
  var sid = x.sub ? s(x.sub.id) : '';
  if (!docsAll().length && !DOCS) docsLoad(function(){ var o = D.querySelector('.gcfp-sheet'); if (o && o.getAttribute('data-fpsub') === s(p.id) + '|' + x.key) subSheet(proj(p.id) || p, x.key); });
  var files = sid ? docsAll().filter(function(d){ return d && s(d.pid) === s(p.id) && s(d.subId) === sid && !d.deleted; }) : [];
  var h = '<div class="gcfp-card"><div class="gcfp-k">' + (now ? 'Today' : 'This job') + ' — what ' + esc(x.name) + ' sees</div><b>' + esc(p.name) + '</b>' +
    (addr ? '<div>📍 ' + esc(addr) + ' · <a href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr) + '" target="_blank" rel="noopener">Maps</a></div>' : '') +
    (po ? '<div>🧾 PO for materials: <b>' + esc(po) + '</b></div>' : '') +
    '<div>👤 ' + esc(p.client || p.customerName || '—') + (p.subCustomerContact === true ? (cph ? ' · <a href="tel:' + esc(digits(cph)) + '">' + esc(cph) + '</a>' : '') : ' <span class="gcfp-mut">(phone hidden from the sub)</span>') + '</div>' +
    (now ? '<div>🗓 On the schedule today' + (now.time ? ' · ' + esc(now.time) : '') + (now.t ? ' · ' + esc(now.t) : '') + '</div>' : '') +
    (next.length ? '<div>🗓 Next: ' + next.map(function(d){ return esc(d.a) + (d.b && d.b !== d.a ? '–' + esc(d.b) : ''); }).join(', ') + '</div>' : (!now ? '<div class="gcfp-mut">Not on the schedule yet.</div>' : '')) + '</div>' +
    '<div class="gcfp-k">Their uploads (' + files.length + ')</div>' +
    (files.length ? '<div class="gcfp-files">' + files.slice(-10).reverse().map(function(f){ return '<div>' + (/^image\//.test(s(f.type)) ? '📷 ' : '📄 ') + esc(f.name || 'file') + ' <span class="gcfp-mut">' + esc(s(f.uploaded || f.uploadedAt).slice(0, 10)) + '</span></div>'; }).join('') + '</div>' : '<div class="gcfp-mut">Nothing uploaded yet.</div>') +
    (!x.sub ? '<div class="gcfp-note">⚠ This row is not tied to a sub in the Subs list — add the sub there (same name) to give them a portal.</div>' : '') +
    (x.sub && typeof H.thread === 'function' ? '<button type="button" class="gcfp-big pri" data-s="post">💬 Post to ' + esc(x.name) + '<small>A note, photo or file in their sub portal</small></button>' : '') +
    (typeof H.open === 'function' ? '<button type="button" class="gcfp-big" data-s="hub">👷 Subs & portal<small>Their link, scope, change orders, punch items</small></button>' : '') +
    (list.length > 1 ? '<button type="button" class="gcfp-big" data-s="all">‹ All subs on this job</button>' : '');
  var sh = sheet('🔧 Sub portal — ' + x.name, h); sh.o.setAttribute('data-fpsub', s(p.id) + '|' + x.key);
  sh.body.addEventListener('click', function(e){
    var b = e.target.closest('[data-s]'); if (!b) return; var c = b.getAttribute('data-s');
    if (c === 'post') { sh.o.remove(); H.thread(p.id, 's:' + sid, x.name, function(){ subSheet(proj(p.id) || p, x.key); }); return; }
    if (c === 'hub') { sh.o.remove(); H.open(p.id); return; }
    if (c === 'all') subSheet(p, '');
  });
  return sh;
}

/* ── 📷 Add Photo/File: photos → GrayCo Photos' own upload; any other file → the job's Documents (job profile input) ── */
function docsUpload(p, files){
  if (typeof W._gcOpenJobProfile !== 'function') { toast('Documents are not on this phone yet.'); return false; }
  W._gcOpenJobProfile(p.id);
  var inp = D.getElementById('_jpFileInput');
  if (inp && typeof W.DataTransfer === 'function') {
    try { var dt = new W.DataTransfer(); files.forEach(function(f){ dt.items.add(f); }); inp.files = dt.files; inp.dispatchEvent(new Event('change')); return true; } catch (e) {}
  }
  toast('Tap 📄 Add Document to attach the file.');
  var b = D.getElementById('_jpFileBtn'); if (b) try { b.scrollIntoView({ block: 'center' }); } catch (e) {}
  return false;
}
function addPhotoFile(p){
  var i = D.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = 'image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt';
  i.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'; i.setAttribute('data-gc-keep', '1');
  i.onchange = function(){
    var all = Array.prototype.slice.call(i.files || []); i.remove(); if (!all.length) return;
    var isImg = function(f){ return /^image\//.test(s(f.type)) || /\.(jpe?g|png|heic|heif|webp)$/i.test(s(f.name)); };
    var imgs = all.filter(isImg), rest = all.filter(function(f){ return !isImg(f); });
    var P = W._gcPhotos;
    if (imgs.length && !(P && typeof P.capture === 'function')) { rest = all; imgs = []; }
    Promise.resolve(imgs.length ? P.capture(p.id, imgs, 'During') : null).then(function(o){
      if (o && !o.cancelled) { var n = arr(o.added).length; toast(n ? '📸 ' + n + ' photo' + (n === 1 ? '' : 's') + ' added to GrayCo Photos' : (o.dup ? 'Already in GrayCo Photos' : 'No photo added')); }
      if (rest.length) docsUpload(p, rest);
    }, function(e){ toast('The photo was not saved: ' + s(e && e.message || e)); if (rest.length) docsUpload(p, rest); });
  };
  D.body.appendChild(i); i.click();
  return i;
}

/* ── 💰 Financials, Invoices & COs ── */
function num(v){ if (typeof v === 'number') return isFinite(v) ? v : 0; var n = parseFloat(s(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function usd(n){ return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US'); }
function canProfit(p){ try { if (typeof W._gcCanSeeMoney === 'function' && W._gcCanSeeMoney()) return true; } catch (e) {} return own(p) && pmRole(); }
function isPaid(iv){ return iv.paid === true || /^paid$/i.test(s(iv.status)); }
function moneyOf(p){
  var c = C(), pid = s(p.id), on = function(x){ return x && !x.deleted && (s(x.pid) === pid || s(x.jobId) === pid || s(x.projectId) === pid); };
  var invs = arr(c.invoices || c.invs).filter(on), cli = invs.filter(function(iv){ return iv.type === 'client' || !iv.type; }), sub = invs.filter(function(iv){ return iv.type === 'sub'; });
  var cos = arr(c.changeOrders || c.cos).filter(on), coOk = cos.filter(function(x){ return /approv|signed|accept|complete|paid/i.test(s(x.status)); });
  var exp = arr(c.expenses).filter(on);
  var spent = 0; try { spent = typeof W._gcJobSpent === 'function' ? num(W._gcJobSpent(pid)) : exp.reduce(function(a, e){ return a + num(e.amt || e.amount); }, 0); } catch (e) {}
  var subPaid = sub.filter(function(iv){ return isPaid(iv) && !exp.some(function(e){ return e && e.subInvId === iv.id && e.status !== 'denied'; }); }).reduce(function(a, iv){ return a + num(iv.amt || iv.amount); }, 0);
  var contract = num(p.contract || p.contractAmount), coAmt = coOk.reduce(function(a, x){ return a + num(x.amt || x.amount); }, 0);
  var m = { contract: contract, co: coAmt, coN: cos.length, invoiced: cli.reduce(function(a, iv){ return a + num(iv.amt || iv.amount); }, 0), paid: cli.filter(isPaid).reduce(function(a, iv){ return a + num(iv.amt || iv.amount); }, 0), costs: spent + subPaid, invs: cli, cos: cos };
  var rev = contract + coAmt; m.profit = rev - m.costs; m.margin = rev > 0 ? Math.round(m.profit / rev * 100) : null;
  return m;
}
function moneySheet(p){
  var m = moneyOf(p), show = canProfit(p), cell = function(l, v, cls){ return '<div class="gcfp-cell' + (cls ? ' ' + cls : '') + '"><span>' + esc(l) + '</span><b>' + esc(v) + '</b></div>'; };
  var newInv = typeof W._gcInvoiceEditor === 'function' && (show || own(p)), newCo = !!(W.gcAddCO && W.gcAddCO.open);
  var h = '<div class="gcfp-k">Money</div><div class="gcfp-cells" data-m="sum">' + cell('Contract', m.contract ? usd(m.contract) : 'No contract yet') + cell('Change orders', usd(m.co) + (m.coN ? ' (' + m.coN + ')' : '')) + cell('Invoiced', usd(m.invoiced)) + cell('Paid', usd(m.paid)) + cell('Costs', usd(m.costs)) +
      (show ? cell('Profit', m.contract ? usd(m.profit) : '—', m.profit >= 0 ? 'ok' : 'bad') + cell('Margin', m.margin == null ? '—' : m.margin + '%') : '') + '</div>' +
    '<div class="gcfp-k">Invoices (' + m.invs.length + ')</div>' + (m.invs.length ? m.invs.map(function(iv){ return '<button type="button" class="gcfp-line" data-inv="' + esc(iv.id) + '"><span>' + esc(iv.num || iv.invNum || iv.desc || 'Invoice') + ' · ' + esc(isPaid(iv) ? 'Paid' : (iv.status || 'open')) + '</span><b>' + usd(num(iv.amt || iv.amount)) + '</b></button>'; }).join('') : '<div class="gcfp-mut">No invoices yet.</div>') +
    (newInv ? '<button type="button" class="gcfp-sm" data-g="newinv">＋ New invoice</button>' : '') +
    '<div class="gcfp-k">Change orders (' + m.cos.length + ')</div>' + (m.cos.length ? m.cos.map(function(x){ return '<div class="gcfp-line"><span>' + esc(x.desc || x.title || 'Change order') + ' · ' + esc(x.status || 'pending') + '</span><b>' + usd(num(x.amt || x.amount)) + '</b></div>'; }).join('') : '<div class="gcfp-mut">No change orders yet.</div>') +
    (newCo ? '<button type="button" class="gcfp-sm" data-g="newco">✨ New change order</button>' : '') +
    (typeof W._gcJobFinancials === 'function' ? '<button type="button" class="gcfp-sm" data-g="full">💰 The job\'s full money page</button>' : '');
  var sh = sheet('💰 ' + s(p.name), h);
  sh.body.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-inv],[data-g]'); if (!b) return;
    var inv = b.getAttribute('data-inv'), g = b.getAttribute('data-g');
    sh.o.remove();
    if (inv) { if (typeof W._gcInvoiceEditor === 'function') W._gcInvoiceEditor(inv); return; }
    if (g === 'newinv') { W._gcInvoiceEditor(null, p.id); return; }
    if (g === 'newco') { W.gcAddCO.open(p.id, p.name, p.autoPO || p.po, p.client, p.pm); return; }
    if (g === 'full') W._gcJobFinancials(p);
  });
  return sh;
}

/* ── 📅 Schedule & Inspections: one dated list, upcoming on top, past greyed ── */
function schedItems(p){
  var pid = s(p.id), out = [];
  arr(C().schedule).forEach(function(x){
    if (!x || x.deleted || s(x.pid || x.projectId || x.jobId) !== pid) return;
    var a = s(x.date || x.start || x.startDate).slice(0, 10), b = s(x.endDateSch || x.endDate || x.end).slice(0, 10);
    out.push({ k: 'sched', d: a, e: b && b !== a ? b : '', t: '📅 ' + s(x.title || x.name || x.phase || 'Task'), st: s(x.status || (x.done ? 'Done' : '')), who: s(x.sub || x.subName || x.assignee || x.crew) });
  });
  arr(p.fieldInspections).forEach(function(x){ if (x) out.push({ k: 'insp', d: s(x.date).slice(0, 10), t: '📋 ' + s(x.type || 'Inspection'), st: s(x.result || 'Scheduled'), who: s(x.inspector || x.by) }); });
  arr(p.inspections).concat(arr(C().inspections).filter(function(x){ return x && s(x.pid || x.projectId) === pid; })).forEach(function(x){ if (x && !x.deleted) out.push({ k: 'insp', d: s(x.date || x.scheduledFor || x.at).slice(0, 10), t: '📋 ' + s(x.type || x.name || x.title || 'Inspection'), st: s(x.status || x.result), who: s(x.inspector || x.by) }); });
  arr(p.walkthroughs).forEach(function(x){ if (x) out.push({ k: 'walk', d: s(x.date || x.at).slice(0, 10), t: '🏁 Walkthrough', st: s(x.status || (x.signedAt ? 'Signed' : '')), who: s(x.by) }); });
  return out;
}
function schedPaint(box, items){
  var t = today(), up = items.filter(function(x){ return !x.d || (x.e || x.d) >= t; }).sort(function(a, b){ return (a.d || '9') < (b.d || '9') ? -1 : 1; }),
    past = items.filter(function(x){ return x.d && (x.e || x.d) < t; }).sort(function(a, b){ return a.d < b.d ? 1 : -1; });
  var li = function(x, old){ return '<div class="gcfp-ev' + (old ? ' old' : '') + '" data-k="' + x.k + '"><span class="dt">' + esc(x.d ? x.d.slice(5) + (x.e ? '–' + x.e.slice(5) : '') : 'no date') + '</span><span class="tx"><b>' + esc(x.t) + '</b>' + (x.st || x.who ? '<small>' + esc([x.st, x.who].filter(Boolean).join(' · ')) + '</small>' : '') + '</span></div>'; };
  box.innerHTML = (up.length ? '<div class="gcfp-k">Coming up</div>' + up.map(function(x){ return li(x, false); }).join('') : '<div class="gcfp-mut">Nothing coming up.</div>') + (past.length ? '<div class="gcfp-k">Past</div>' + past.map(function(x){ return li(x, true); }).join('') : '');
}
function schedSheet(p){
  var items = schedItems(p);
  var h = '<div data-box="ev"></div><div class="gcfp-two">' + (typeof W._gcOpenFieldSchedule === 'function' ? '<button type="button" class="gcfp-sm" data-g="task">＋ Add phase/task</button>' : '') +
    (W._gcFieldTools && W._gcFieldTools.run ? '<button type="button" class="gcfp-sm" data-g="insp">＋ Add inspection</button>' : '') + '</div>' +
    (W._gcX10 && W._gcX10.insp ? '<button type="button" class="gcfp-sm" data-g="permit">🏛 Permit checklist</button>' : '');
  var sh = sheet('📅 ' + s(p.name), h), box = sh.body.querySelector('[data-box="ev"]');
  schedPaint(box, items);
  /* the permit checklist's steps (patch X10, the server's store) — added when they come back */
  try {
    W.fetch('/.netlify/functions/x10', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'insp-get', pid: s(p.id) }) }).then(function(r){ return r.json(); }).then(function(r){
      var rec = r && r.ok && r.rec; if (!rec || rec.notNeeded || !D.body.contains(box)) return;
      arr(rec.steps).forEach(function(st){ if (st && (st.date || st.result || st.done)) items.push({ k: 'permit', d: s(st.date).slice(0, 10), t: '🏛 ' + s(st.label || 'Permit step'), st: s(st.result || (st.done ? 'done' : '')), who: s(st.by) }); });
      schedPaint(box, items);
    }, function(){});
  } catch (e) {}
  sh.body.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-g]'); if (!b) return; var g = b.getAttribute('data-g');
    sh.o.remove();
    if (g === 'task') W._gcOpenFieldSchedule(p.id);
    else if (g === 'insp') W._gcFieldTools.run('insp', p.id);
    else if (g === 'permit') W._gcX10.insp(p.id);
  });
  return sh;
}

function hasLog(){ try { return !!(W._gcRP && typeof W._gcRP.site === 'function' && W._gcRP.site() && typeof W._gcRP.site().open === 'function'); } catch (e) { return false; } }
function openPhotos(pid){ try { if (W._gcPhotos && W._gcPhotos.open) { W._gcPhotos.open(pid); return; } } catch (e) {} if (W._setView) W._setView('allphotos'); }
function run(a, p){
  if (!p) return false;
  var pm = perms(p);
  if (a === 'fp-cust' && pm.cust) { custSheet(p); return true; }
  if (a === 'fp-sub' && pm.sub) { subSheet(p); return true; }
  if (a === 'fp-photos' && pm.photos) { openPhotos(p.id); return true; }
  if (a === 'fp-msg' && pm.msg) { if (W._gcOpenJobMessages) W._gcOpenJobMessages(p.id); else toast('Job messages are not on this phone yet.'); return true; }
  if (a === 'fp-add' && pm.photos) { addPhotoFile(p); return true; }
  if (a === 'fp-money' && pm.photos) { moneySheet(p); return true; }
  if (a === 'fp-sched' && pm.photos) { schedSheet(p); return true; }
  if (a === 'fp-log' && pm.photos) { try { W._gcRP.site().open(p.id, 'log'); } catch (e) { toast('The daily log is not on this phone yet.'); } return true; }
  return false;
}

/* ── the Field home's job card: one row of four ── */
function row(p){
  if (!p) return '';
  var pm = perms(p), b = function(k, ic, l, cls){ return '<button type="button" class="fp-b ' + (cls || '') + '" data-fa="fp-' + k + '" data-pid="' + esc(p.id) + '"><span class="e">' + ic + '</span>' + esc(l) + '</button>'; };
  var h = (pm.cust ? b('cust', '👤', linkOf(p) ? 'Customer portal' : (p.portalOff ? 'Portal off' : (W._gcPortal && W._gcPortal.link ? 'Make portal' : 'No portal yet')), 'c') : '') +
    (pm.sub ? b('sub', '🔧', 'Sub portal', 's') : '') + (pm.photos ? b('photos', '📸', 'Photos', 'p') : '') + (pm.msg ? b('msg', '💬', 'Message', 'm') : '');
  return h ? '<div class="fp-row">' + h + '</div>' : '';
}
function repaint(){ try { if (D.querySelector('#_gcJobPick.gc-fh') && W._gcField && W._gcField.render) W._gcField.render(); } catch (e) {} }

/* ── the job's field page: an app shell, the tiles on top in the owner's order ── */
function decorate(pid){
  var ov = D.getElementById('_gcJobDash'), p = proj(pid);
  if (!ov || !p || ov.children.length < 2 || ov.getAttribute('data-gcfp') === s(p.id)) return false;
  css();
  var head = ov.children[0], body = ov.children[1];
  ov.setAttribute('data-gcfp', s(p.id)); ov.classList.add('gcfp-shell'); head.classList.add('gcfp-head'); body.classList.add('gcfp-body');
  var hk = Array.prototype.slice.call(head.children);
  if (hk[1]) hk[1].classList.add('gcfp-name'); if (hk[2]) hk[2].classList.add('gcfp-addr');
  var lowG = D.createElement('div'); lowG.className = 'gcfp-low';
  hk.slice(3).forEach(function(el){ lowG.appendChild(el); });   /* E-mail the customer and the like: below the tiles */
  var grid = Array.prototype.filter.call(body.querySelectorAll('div'), function(d){ return Array.prototype.some.call(d.children, function(c){ return c.classList && c.classList.contains('_jdAct'); }); })[0];
  if (!grid) { if (lowG.children.length) body.insertBefore(lowG, body.firstChild); return true; }
  var lab = grid.previousElementSibling && /FOR THIS JOB/i.test(s(grid.previousElementSibling.textContent)) ? grid.previousElementSibling : null;
  var prev = lab ? lab.previousElementSibling : null;
  var contact = prev && prev.querySelector && prev.querySelector('a[href^="tel:"],a[href^="sms:"],a[href*="maps"]') ? prev : null;
  var by = {}, olds = Array.prototype.filter.call(grid.children, function(c){ return c.classList && c.classList.contains('_jdAct'); });
  olds.forEach(function(b){ by[b.getAttribute('data-fn')] = b; });
  var pm = perms(p), tpl = by.update || olds[0];
  function mk(k, ic, label){
    var b = D.createElement('button'); b.type = 'button'; b.className = 'gcfp-t'; b.setAttribute('data-fp', k); b.setAttribute('data-pid', s(p.id));
    if (tpl) b.style.cssText = tpl.style.cssText;
    var i = D.createElement('span'), l = D.createElement('span'); i.textContent = ic; l.textContent = label;
    if (tpl && tpl.children[0]) i.style.cssText = tpl.children[0].style.cssText; if (tpl && tpl.children[1]) l.style.cssText = tpl.children[1].style.cssText;
    b.appendChild(i); b.appendChild(l); return b;
  }
  var order = [by.progress, by.info, pm.cust && mk('cust', '👤', 'Customer portal'), pm.sub && mk('sub', '🔧', 'Sub portal'), by.update, pm.msg && mk('msg', '💬', 'Message'), by.photo, pm.photos && hasLog() && mk('log', '📒', 'Daily Log'), pm.photos && mk('money', '💰', 'Financials, Invoices & COs'), pm.photos && mk('sched', '📅', 'Schedule & Inspections'), by.docs, by.create]
    .concat(olds.filter(function(b){ return ['progress', 'info', 'update', 'photo', 'docs', 'create'].indexOf(b.getAttribute('data-fn')) < 0; }))
    .concat([pm.photos && mk('photos', '📸', 'GrayCo Photos')]).filter(Boolean);
  order.forEach(function(b){ grid.appendChild(b); });
  if (by.photo && pm.photos) by.photo.onclick = function(e){ if (e) e.stopPropagation(); addPhotoFile(proj(p.id) || p); };
  grid.classList.add('gcfp-grid');
  grid.addEventListener('click', function(e){ var b = e.target.closest && e.target.closest('.gcfp-t'); if (!b) return; e.stopPropagation(); run('fp-' + b.getAttribute('data-fp'), proj(p.id) || p); });
  var top = D.createElement('div'); top.className = 'gcfp-top';
  if (lab) top.appendChild(lab); top.appendChild(grid);
  body.insertBefore(top, body.firstChild);
  if (contact) lowG.appendChild(contact);
  body.insertBefore(lowG, top.nextSibling);   /* always there: ✉️ E-mail the customer lands here when it is added */
  try { body.scrollTop = 0; } catch (e) {}
  return true;
}
function wrapDash(){
  var f = W._gcJobDashboard; if (typeof f !== 'function' || f.__gcFP) return;
  var w = function(jobId){ var r = f.apply(this, arguments); try { decorate(jobId); } catch (e) {} return r; };
  try { Object.keys(f).forEach(function(k){ if (!(k in w)) w[k] = f[k]; }); } catch (e) {}
  w.__gcFP = true; W._gcJobDashboard = w;
}

/* ── ⚙ Settings (Field): sections added to the existing sheet ── */
var CQ = 'gc_custq_def:';
W._gcCustqDefault = function(){ var v = lsGet(CQ + (myEmail() || low(lsGet('grayco_user')) || 'me')); return v === 'yes' ? true : v === 'no' ? false : null; };
var GUIDE = 'https://claude.ai/artifact/1ETWZczKsUBEbW73tcppcA';
function adminOffice(ctx){ if (ctx && ctx.admin) return true; if (/^(admin|office)/i.test(role())) return true; try { return !!(W._gcIsOfficeFull && W._gcIsOfficeFull()); } catch (e) { return false; } }
function fetchJ(url, opts){ return W.fetch(url, opts).then(function(r){ return r.text().then(function(t){ var o = {}; try { o = JSON.parse(t); } catch (e) { o = { error: t.slice(0, 200) }; } o.__status = r.status; return o; }); }, function(e){ return { error: 'No signal (' + s(e && e.message) + ')' }; }); }
function hourOpts(sel){ var o = ''; for (var h = 0; h < 24; h++) o += '<option value="' + h + '"' + (h === sel ? ' selected' : '') + '>' + ((h % 12) || 12) + (h < 12 ? ' AM' : ' PM') + '</option>'; return o; }
function notifBox(box){
  var me = myEmail(); box.innerHTML = '<div class="gcfp-mut">Loading your text alerts…</div>';
  fetchJ('/.netlify/functions/texts?alerts=1').then(function(o){
    if (!o || !o.ok || !o.settings) { box.innerHTML = '<div class="gcfp-mut">Your text alerts could not be loaded right now (' + esc((o && o.error) || 'no answer') + ').</div>'; return; }
    var set = o.settings, ppl = set.people || {}, mine = Object.assign({}, ppl[me] || {}), staff = arr(o.staff).filter(function(x){ return low(x.email) === me; })[0] || {};
    var ck = function(k, l, on){ return '<label class="gcfp-chk"><input type="checkbox" data-n="' + k + '"' + (on ? ' checked' : '') + '> ' + l + '</label>'; };
    var cv = mine.cust || 'off', qf = mine.qFrom == null ? 21 : mine.qFrom, qt = mine.qTo == null ? 7 : mine.qTo;
    box.innerHTML = ck('on', '<b>Text alerts to my cell</b>' + ((mine.phone || staff.phone) ? ' (' + esc(mine.phone || staff.phone) + ')' : ' <span class="gcfp-mut">— add your cell in My profile first</span>'), !!mine.on) +
      ck('newAll', 'New leads', !!mine.newAll) + ck('newMine', 'New leads assigned to me', !!mine.newMine) + ck('emerg', 'Emergencies (any hour)', !!mine.emerg) + ck('approvals', 'Approvals (one morning summary)', !!mine.approvals) +
      '<label class="gcfp-row2">Customer messages <select data-n="cust"><option value="off"' + (cv === 'off' ? ' selected' : '') + '>Off</option><option value="mine"' + (cv === 'mine' ? ' selected' : '') + '>My jobs</option><option value="all"' + (cv === 'all' ? ' selected' : '') + '>All</option></select></label>' +
      '<label class="gcfp-row2"><span><input type="checkbox" data-n="qOn"' + (mine.qOff ? '' : ' checked') + '> Quiet hours</span><span><select data-n="qFrom">' + hourOpts(qf) + '</select> – <select data-n="qTo">' + hourOpts(qt) + '</select></span></label>' +
      '<button type="button" class="gcfp-big pri" data-n="save">Save my alerts</button>';
    box.querySelector('[data-n="save"]').onclick = function(){
      var g = function(k){ return box.querySelector('[data-n="' + k + '"]'); }, btn = this;
      var next = Object.assign({}, mine, { on: g('on').checked, newAll: g('newAll').checked, newMine: g('newMine').checked, emerg: g('emerg').checked, approvals: g('approvals').checked, cust: g('cust').value, qOff: !g('qOn').checked, qFrom: +g('qFrom').value, qTo: +g('qTo').value, name: s(mine.name || staff.name) });
      if (next.on && !digits(next.phone || staff.phone)) { toast('Add your cell in My profile first.'); return; }
      var people = Object.assign({}, ppl); people[me] = next;
      btn.disabled = true;
      fetchJ('/.netlify/functions/texts?alerts=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: Object.assign({}, set, { people: people }) }) }).then(function(r){
        btn.disabled = false; if (r && r.ok) { if (r.settings) { set = r.settings; ppl = set.people || people; } toast('✅ Your alerts are saved.'); } else toast('Not saved: ' + s(r && r.error));
      });
    };
  });
}
function callOrderBox(box){
  box.innerHTML = '<div class="gcfp-mut">Loading…</div>';
  fetchJ('/.netlify/functions/texts?callchain=1').then(function(o){
    var c = o && o.settings; if (!o || !o.ok || !c) { box.innerHTML = '<div class="gcfp-mut">The call order could not be loaded (' + esc((o && o.error) || 'no answer') + ').</div>'; return; }
    box.innerHTML = '<div class="gcfp-mut">' + (c.on === false ? 'Ringing in order is OFF.' : 'The GrayCo number rings these, top to bottom' + (c.ringSeconds ? ', ' + esc(c.ringSeconds) + ' s each' : '') + '.') + '</div><ol class="gcfp-ol">' +
      arr(c.slots).map(function(x){ return '<li' + (x.on === false ? ' class="off"' : '') + '>' + esc(x.label || x.kind || 'Line') + (x.on === false ? ' <span class="gcfp-mut">(off)</span>' : '') + '</li>'; }).join('') + '</ol>';
  });
}
function settings(o, ctx){
  ctx = ctx || {};
  var at = o.querySelector('.acts'); if (!at || o.querySelector('.gcfp-set')) return;
  css();
  var u = meU() || {}, ao = adminOffice(ctx), adm = !!ctx.admin, me = myEmail();
  var photo = /^(data:image\/|https:\/\/)/.test(s(u.photo)) ? s(u.photo) : '';
  var wes = arr(C().users).filter(function(x){ return x && low(x.email) === 'wjohnson@grayco-cs.com'; })[0] || arr(C().users).filter(function(x){ return x && /^wesley\b/i.test(s(x.name)); })[0] || null;
  var wph = digits(wes && (wes.phone || wes.cell || wes.mobile)), wem = s(wes && wes.email);
  var cq = W._gcCustqDefault(), sec = function(id, t, inner){ return '<section class="gcfp-sec" data-sec="' + id + '"><h4>' + t + '</h4>' + inner + '</section>'; };
  var pz = null; try { pz = W._gcPause && W._gcPause.state ? W._gcPause.state() : null; } catch (e) {}
  var h = sec('profile', '👤 My profile', '<div class="gcfp-me">' + (photo ? '<img alt="" src="' + esc(photo) + '">' : '<span class="ph">' + esc((s(u.name) || '?').charAt(0)) + '</span>') +
      '<div><b>' + esc(u.name || lsGet('grayco_user') || '') + '</b><div class="gcfp-mut">' + esc(u.phone || u.cell || 'No phone on file') + ' · ' + esc(me || u.email || '') + '</div></div></div>' +
      '<div class="gcfp-two"><button type="button" class="gcfp-sm" data-g="profile">✏️ Photo, name & phone</button>' + (typeof W._gcChangeMyPassword === 'function' ? '<button type="button" class="gcfp-sm" data-g="pw">🔑 Change password</button>' : '') + '</div>') +
    sec('notif', '🔔 Notifications', ao ? '<div data-box="notif"></div>' : '<div class="gcfp-mut">Which text alerts you get (new leads, emergencies, approvals, messages) and your quiet hours are set by the office — ask Wesley or the office to change them.</div>') +
    sec('oncall', '📟 On call', (W._gcX10 && W._gcX10.oncall ? '<button type="button" class="gcfp-sm" data-g="oncall">📟 On call (Mitigation) — this week</button>' : '<div class="gcfp-mut">On call is not on this phone yet.</div>') +
      (ao ? '<button type="button" class="gcfp-sm" data-g="calls">📞 Show the call order</button><div data-box="calls"></div>' : '')) +
    (adm && W._gcPause ? sec('pause', '⏸ Data-entry mode', '<div class="gcfp-mut">' + (pz && pz.paused ? '⏸ ON — nothing goes out to customers, subs or the public.' : 'Off — the CRM sends as usual.') + '</div><button type="button" class="gcfp-sm" data-g="pause">⏸ Data-entry mode…</button>') : '') +
    sec('custq', '📸 Customer photo default', '<div class="gcfp-mut">When you add photos, "Customer can see?" starts at:</div>' +
      '<label class="gcfp-chk"><input type="radio" name="gcfp-cq" value=""' + (cq === null ? ' checked' : '') + '> Yes, except damage photos (standard)</label>' +
      '<label class="gcfp-chk"><input type="radio" name="gcfp-cq" value="yes"' + (cq === true ? ' checked' : '') + '> Yes — on the customer portal</label>' +
      '<label class="gcfp-chk"><input type="radio" name="gcfp-cq" value="no"' + (cq === false ? ' checked' : '') + '> No — GrayCo only</label><div class="gcfp-mut">It still asks every time.</div>') +
    sec('help', '❓ Help', (wph || wem ? '<div class="gcfp-two">' + (wph ? '<a class="gcfp-sm" data-g="shotsms" href="sms:' + esc(wph) + '&body=' + encodeURIComponent('GrayCo Field screenshot from ' + s(u.name) + ': ') + '">📸 Text Wesley a screenshot</a>' : '') +
      (wem ? '<a class="gcfp-sm" data-g="shotmail" href="mailto:' + esc(wem) + '?subject=' + encodeURIComponent('GrayCo Field screenshot') + '&body=' + encodeURIComponent('Screenshot attached. What I was doing: ') + '">✉️ E-mail Wesley a screenshot</a>' : '') + '</div><div class="gcfp-mut">Take the screenshot first, then attach it.</div>' : '') +
      '<a class="gcfp-sm" data-g="guide" href="' + GUIDE + '" target="_blank" rel="noopener">📘 Getting started for ' + esc(role() || 'my role') + '</a>') +
    (ao ? sec('admin', '🛠 Admin shortcuts', '<div class="gcfp-two">' + (isAdmin() && typeof W._gcTeamAccess === 'function' ? '<button type="button" class="gcfp-sm" data-g="team">🔐 Team access</button>' : '') +
      '<button type="button" class="gcfp-sm" data-g="callorder">📞 Call order</button><button type="button" class="gcfp-sm" data-g="texts">💬 Text auto-answers</button>' +
      (typeof W._gcCCSyncPanel === 'function' ? '<button type="button" class="gcfp-sm" data-g="ccsync">📸 CompanyCam sync status</button>' : '') + '</div>') : '');
  var box = D.createElement('div'); box.className = 'gcfp-set'; box.innerHTML = h;
  at.parentNode.insertBefore(box, at);
  var nb = box.querySelector('[data-box="notif"]'); if (nb) notifBox(nb);
  var closeAll = function(){ o.remove(); try { if (typeof ctx.close === 'function') ctx.close(); } catch (e) {} };
  var adminOpen = function(id){ closeAll(); if (W._gcAdm && W._gcAdm.open) W._gcAdm.open(id); else if (W._setView) W._setView('admin'); };
  box.addEventListener('change', function(e){ var r = e.target; if (r && r.name === 'gcfp-cq') { lsSet(CQ + (me || low(lsGet('grayco_user')) || 'me'), r.value); toast('📸 Saved — new photos start at ' + (r.value === 'yes' ? 'Yes' : r.value === 'no' ? 'No' : 'Yes (No for damage photos)') + '.'); } });
  box.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-g]'); if (!b) return; var g = b.getAttribute('data-g');
    if (b.tagName === 'A') return;   /* sms: / mailto: / the guide: the link does it */
    if (g === 'profile') { closeAll(); if (W._setView) W._setView('myprofile'); return; }
    if (g === 'pw') { o.remove(); W._gcChangeMyPassword(); return; }
    if (g === 'oncall') { o.remove(); W._gcX10.oncall(); return; }
    if (g === 'calls') { callOrderBox(box.querySelector('[data-box="calls"]')); return; }
    if (g === 'pause') { o.remove(); W._gcPause.open(); return; }
    if (g === 'team') { o.remove(); W._gcTeamAccess(); return; }
    if (g === 'callorder') { adminOpen('callorder'); return; }
    if (g === 'texts') { adminOpen('texts'); return; }
    if (g === 'ccsync') { o.remove(); W._gcCCSyncPanel(); return; }
  });
}

/* ── the look ── */
function css(){
  if (D.getElementById('gcfp-css')) return;
  var st = D.createElement('style'); st.id = 'gcfp-css';
  st.textContent = [
    /* the home's job card row */
    '.gc-fh .fp-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:10px 0 4px}',
    '.gc-fh .fp-b{border:1px solid #d1d5db;background:#fff;color:#1f2a37;border-radius:12px;min-height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;font:700 11.5px/1.15 Inter,-apple-system,sans-serif;gap:3px;text-align:center;padding:6px 2px;cursor:pointer;min-width:0;overflow-wrap:anywhere}',
    '.gc-fh .fp-b .e{font-size:20px;line-height:1}.gc-fh .fp-b.c{border-color:#D4A017;background:#fffbeb;color:#7c5a00}.gc-fh .fp-b.s{border-color:#93c5fd;background:#eff6ff;color:#1e3a8a}.gc-fh .fp-b.p{border-color:#c7d2fe;background:#eef2ff;color:#3730a3}',
    /* the job page as an app: fixed header, only the content scrolls, nothing under the bottom bar */
    '#_gcJobDash.gcfp-shell{position:fixed!important;inset:0!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;overscroll-behavior:none}',
    '.gcfp-shell>.gcfp-head{flex:0 0 auto!important;position:relative;z-index:3;padding:calc(6px + env(safe-area-inset-top,0px)) 12px 8px!important;box-sizing:border-box;max-width:100%}',
    '.gcfp-shell .gcfp-name{font-size:18px!important;margin-top:2px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.gcfp-shell .gcfp-addr{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.gcfp-shell>.gcfp-body{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:12px 12px calc(124px + env(safe-area-inset-bottom,0px))!important;box-sizing:border-box}',
    /* the tiles stay on top even when a bar is added to the page a moment later (CSS order, no timer) */
    '.gcfp-shell>.gcfp-body{display:flex!important;flex-direction:column!important}.gcfp-shell>.gcfp-body>*{flex:0 0 auto;max-width:100%;box-sizing:border-box}.gcfp-shell>.gcfp-body>.gcfp-top{order:-2}.gcfp-shell>.gcfp-body>.gcfp-low{order:-1}',
    /* sheets opened from the Field page sit above the bottom bar / keep their last button clear of it */
    'html.gc-fh-on #gcq-post,html.gc-fh-on #gcq-docs,html.gc-fh-on [id^="gcq-"][style*="inset"]{z-index:100060!important}',
    'html.gc-fh-on .gcsub-sheet .gcsub-body{padding-bottom:calc(124px + env(safe-area-inset-bottom,0px))!important}',
    /* LIGHT Field app (owner 10/30: "I like the white aesthetic, not navy") — Field mode only */
    'html._fieldmode #_gcJobPick:not(.gc-fh){background:#f3f5f8!important}',
    'html._fieldmode #_gcJobPick:not(.gc-fh)>div:first-child{background:#fff;border-bottom:1px solid #e5e7eb;padding-bottom:10px!important}',
    'html._fieldmode #_gcJobPick:not(.gc-fh)>div:first-child div{color:#111827!important}html._fieldmode #_gcJobPick:not(.gc-fh)>div:first-child>div>div>div:first-child{color:#6b7280!important}',
    'html._fieldmode #_gcJobPick:not(.gc-fh) #_jpSearch{background:#fff!important;color:#111827!important;border:1px solid #d1d5db!important}',
    'html._fieldmode #_gcJobPick ._jpItem{background:#fff!important;border:1px solid #e5e7eb!important;box-shadow:0 1px 3px rgba(16,24,40,.08)}',
    'html._fieldmode #_gcJobPick ._jpItem>div:nth-child(1){color:#111827!important}html._fieldmode #_gcJobPick ._jpItem>div:nth-child(2){color:#374151!important}html._fieldmode #_gcJobPick ._jpItem>div:nth-child(3){color:#4b5563!important}',
    'html._fieldmode #_gcJobDash.gcfp-shell{background:#f3f5f8!important;color:#1f2a37}',
    'html._fieldmode .gcfp-shell>.gcfp-head{background:#fff!important;border-bottom:1px solid #e5e7eb!important;box-shadow:0 1px 3px rgba(16,24,40,.06)}',
    'html._fieldmode .gcfp-shell .gcfp-name{color:#111827!important}html._fieldmode .gcfp-shell .gcfp-addr{color:#4b5563!important}html._fieldmode .gcfp-shell #_jdBack{color:#2563eb!important}',
    'html._fieldmode .gcfp-head .gcu-dash button:first-child{background:#eef2ff!important;color:#3730a3!important;border:1px solid #c7d2fe!important}',
    'html._fieldmode .gcfp-top .gcfp-grid>button{background:#fff!important;border:1px solid #e5e7eb!important;box-shadow:0 1px 3px rgba(16,24,40,.08)!important}',
    'html._fieldmode .gcfp-top .gcfp-grid>button>span:last-child{color:#111827!important;font-weight:700!important}',
    'html._fieldmode .gcfp-top .gcfp-t[data-fp="cust"]{border-color:#D4A017!important;background:#fffbeb!important}html._fieldmode .gcfp-top .gcfp-t[data-fp="sub"]{border-color:#93c5fd!important;background:#eff6ff!important}',
    'html._fieldmode .gcfp-top>div:first-child:not(.gcfp-grid){color:#8a5a00!important}',
    'html._fieldmode #_gcJobDash .gcsub-tile{background:#fff!important;color:#111827!important;border-color:#e5e7eb!important}',
    'html._fieldmode #_gcJobDash ._gcEmailLogBox,html._fieldmode #_gcJobDash ._gcEmailLogBox *{color:#374151!important}',
    'html._fieldmode #_gcJobDash .gc-a8-bar[data-field]{background:#fff!important;color:#1f2a37!important;border:1px solid #e5e7eb}',
    'html._fieldmode #_gcJobMsgOv{background:#f3f5f8!important}',
    'html._fieldmode #_gcJobPick:not(.gc-fh) #_jpEverything,html._fieldmode #_gcJobPick:not(.gc-fh) #_jpFindSub{background:#fff!important;color:#1d4ed8!important;border:1px solid #bfdbfe!important}',
    'html._fieldmode #_gcJobPick #gcu-pick-btn{background:#eef2ff!important;color:#3730a3!important;border:1px solid #c7d2fe!important}html._fieldmode #_gcJobPick #gcu-pick-btn *{color:inherit}',
    /* the job page has its own ‹ Jobs: no second floating ‹ Back over its header, no 60 px gap */
    'html:has(#_gcJobDash.gcfp-shell[data-gcnav-pad]) #_gcNavBk{display:none!important}#_gcJobDash.gcfp-shell[data-gcnav-pad]{padding-top:0!important}',
    '.gcfp-head>div:first-child{flex-wrap:nowrap!important;gap:6px!important;min-width:0}.gcfp-head .gcu-dash{display:flex!important;gap:6px!important;flex-wrap:nowrap!important;min-width:0}',
    '.gcfp-head .gcu-dash button{min-height:40px!important;padding:4px 10px!important;font-size:13px!important;white-space:nowrap}',
    '.gcfp-top{margin-bottom:12px}.gcfp-top>div:first-child:not(.gcfp-grid){margin-bottom:8px!important}',
    '.gcfp-top .gcfp-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}',
    '.gcfp-top .gcfp-grid>button{min-height:64px!important;height:auto!important;padding:8px 6px!important;display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:flex-start!important;text-align:left!important;gap:8px!important;border-radius:14px!important;min-width:0!important;box-sizing:border-box}',
    '.gcfp-top .gcfp-grid>button>span:first-child{font-size:22px!important;line-height:1!important}',
    '.gcfp-top .gcfp-grid>button>span:last-child{font-size:12.5px!important;line-height:1.2!important;overflow-wrap:anywhere}',
    '.gcfp-top .gcfp-t[data-fp="cust"]{border-color:#D4A017!important}.gcfp-top .gcfp-t[data-fp="sub"]{border-color:#60a5fa!important}',
    '.gcfp-low{display:flex;flex-direction:column;gap:10px;margin:0 0 14px}.gcfp-low>button{align-self:stretch}.gcfp-low>div{margin:0!important}',
    /* the Field home and the Jobs list: the same shell */
    '#_gcJobPick{overscroll-behavior:contain;overflow-x:hidden}',
    'html.gc-fh-on #_gcJobPick.gc-fh .fh-wrap{padding-bottom:calc(124px + env(safe-area-inset-bottom,0px))}',
    'html.gc-fh-on #_gcJobPick:not(.gc-fh)>div:last-child{padding-bottom:calc(124px + env(safe-area-inset-bottom,0px))!important;overscroll-behavior:contain;overflow-x:hidden}',
    'html.gc-fh-on,html.gc-fh-on body{overscroll-behavior:none;overflow-x:hidden}',
    /* tap feedback, no double-tap delay */
    '#_gcJobDash button,#_gcJobDash a,#_gcJobPick button,#gc-fh-tabs button,.gc-fh-sheet button,.gcfp-sheet button,.gcfp-sheet a{touch-action:manipulation;-webkit-tap-highlight-color:transparent}',
    '#_gcJobDash button:active,#_gcJobPick button:active,#gc-fh-tabs button:active,.gcfp-sheet button:active,.gcfp-sheet a:active,.gc-fh-sheet button:active{transform:scale(.97);filter:brightness(.92)}',
    /* 🧠 lives in the 💎 menu in Field view */
    'html._fieldmode #gcb-fieldbtn,html.gc-fh-on #gcb-fieldbtn{display:none!important}',
    /* sheets */
    '.gcfp-sheet{position:fixed;inset:0;z-index:100095;background:rgba(17,24,39,.5);display:flex;align-items:flex-end;font-family:Inter,-apple-system,sans-serif}',
    '.gcfp-sheet .in{background:#fff;color:#1f2a37;width:100%;border-radius:18px 18px 0 0;padding:14px 16px calc(18px + env(safe-area-inset-bottom,0px));max-height:88vh;overflow-y:auto;box-sizing:border-box;overscroll-behavior:contain}',
    '.gcfp-sheet .hd{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;font-size:17px}.gcfp-sheet .hd b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.gcfp-sheet .hd button{border:none;background:#f3f4f6;border-radius:999px;width:44px;height:44px;font-size:17px;flex:0 0 auto;cursor:pointer}',
    '.gcfp-big{display:flex;flex-direction:column;align-items:flex-start;width:100%;box-sizing:border-box;min-height:56px;margin:0 0 8px;padding:10px 14px;border:1px solid #d1d5db;border-radius:14px;background:#fff;color:#111827;font:800 15.5px/1.25 Inter,-apple-system,sans-serif;text-align:left;text-decoration:none;cursor:pointer}',
    '.gcfp-big small{font-weight:500;font-size:12.5px;color:#6b7280;margin-top:2px}.gcfp-big.pri{background:#2563eb;border-color:#2563eb;color:#fff}.gcfp-big.pri small{color:#dbeafe}',
    '.gcfp-note{background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;margin:0 0 10px;font-size:14px;color:#374151}',
    '.gcfp-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px;margin-bottom:10px;font-size:14px;line-height:1.5;overflow-wrap:anywhere}.gcfp-card a{color:#2563eb;font-weight:700}',
    '.gcfp-k{font-size:11.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#6b7280;margin:4px 0 6px}.gcfp-mut{color:#6b7280;font-size:13px}',
    '.gcfp-files{font-size:13.5px;margin-bottom:10px;overflow-wrap:anywhere}.gcfp-files>div{padding:5px 0;border-bottom:1px solid #f1f5f9}',
    /* settings */
    '.gcfp-set .gcfp-sec{border-top:1px solid #e5e7eb;padding:12px 0 4px}.gcfp-set h4{margin:0 0 8px;font-size:15px}',
    '.gcfp-me{display:flex;gap:12px;align-items:center;margin-bottom:8px;min-width:0}.gcfp-me img,.gcfp-me .ph{width:52px;height:52px;border-radius:50%;object-fit:cover;flex:0 0 auto;background:#e0e7ff;color:#3730a3;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px}.gcfp-me>div{min-width:0;overflow-wrap:anywhere}',
    '.gcfp-two{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px}',
    '.gcfp-sm{display:flex;align-items:center;justify-content:center;text-align:center;min-height:44px;box-sizing:border-box;padding:8px 10px;border:1px solid #2563eb;border-radius:12px;background:#fff;color:#2563eb;font:700 13.5px/1.2 Inter,-apple-system,sans-serif;text-decoration:none;cursor:pointer;margin-bottom:6px;width:100%}',
    '.gcfp-chk{display:flex!important;gap:8px;align-items:center;min-height:40px;font-weight:600!important;font-size:14px!important;margin:0!important}.gcfp-chk input{width:20px!important;height:20px;flex:0 0 auto}',
    '.gcfp-row2{display:flex!important;justify-content:space-between;align-items:center;gap:8px;min-height:44px;font-size:14px!important;margin:0!important;flex-wrap:wrap}.gcfp-row2 select{width:auto!important;padding:6px!important;font-size:14px!important}',
    '.gcfp-ol{margin:6px 0;padding-left:22px;font-size:14px}.gcfp-ol li.off{color:#9ca3af}',
    '.gcfp-cells{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}.gcfp-cell{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:8px 10px;min-width:0}.gcfp-cell span{display:block;font-size:11.5px;color:#6b7280;font-weight:700}.gcfp-cell b{font-size:16px;overflow-wrap:anywhere}.gcfp-cell.ok b{color:#15803d}.gcfp-cell.bad b{color:#b91c1c}',
    '.gcfp-line{display:flex;justify-content:space-between;gap:8px;align-items:center;width:100%;box-sizing:border-box;min-height:44px;padding:8px 10px;margin-bottom:6px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;font:600 13.5px Inter,sans-serif;color:#111827;text-align:left}.gcfp-line span{min-width:0;overflow-wrap:anywhere}',
    '.gcfp-ev{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px}.gcfp-ev .dt{flex:0 0 auto;min-width:54px;font-weight:800;color:#1d4ed8}.gcfp-ev .tx{min-width:0;overflow-wrap:anywhere}.gcfp-ev small{display:block;color:#6b7280}.gcfp-ev.old{opacity:.5}.gcfp-ev.old .dt{color:#6b7280}',
    '#gcfp-toast{display:none;position:fixed;left:16px;right:16px;bottom:calc(110px + env(safe-area-inset-bottom,0px));z-index:2147483000;background:#111827;color:#fff;border-radius:12px;padding:12px 14px;font:600 14px Inter,sans-serif;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.3)}'
  ].join('\n');
  (D.head || D.documentElement).appendChild(st);
}

css(); wrapDash();
W._gcFP = { row: row, run: run, decorate: decorate, settings: settings, perms: function(pid){ return perms(proj(pid)); }, cust: function(pid){ return custSheet(proj(pid)); }, sub: function(pid, key){ return subSheet(proj(pid), key); },
  subs: function(pid){ return subsOn(proj(pid) || {}).map(function(x){ return { key: x.key, name: x.name, linked: !!x.sub }; }); }, addPhotoFile: function(pid){ return addPhotoFile(proj(pid)); },
  preview: function(pid){ return previewUrl(proj(pid)); }, jobs: W._gcFPJobs, money: function(pid){ return moneySheet(proj(pid)); }, moneyOf: function(pid){ var p = proj(pid); return p ? moneyOf(p) : null; }, canProfit: function(pid){ return canProfit(proj(pid)); }, sched: function(pid){ return schedSheet(proj(pid)); }, schedItems: function(pid){ var p = proj(pid); return p ? schedItems(p) : []; } };
try { console.log('[GC] 📱 Field: portals, photos & messages on every job, the job page as an app, ⚙ Settings (patch FIELDPORTAL) — _gcFP'); } catch (e) {}
})();
