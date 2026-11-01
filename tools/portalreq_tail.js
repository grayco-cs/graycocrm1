/* __GC_PATCH_PORTALREQ__ (patch PORTALREQ) — the CRM's side of the portals' "➕ Request a change" / "🏗 Request a new project".
   A request is a ✅ Approvals / To-Do card for the job's PM and the office (kinds preq_change / preq_project; the server is
   netlify/functions/portal-req.js + _lib/portalreq.js). Wherever the card is drawn (To-Do, ✅ Approvals, the approvals list)
   it gets the details (what, where, urgency, how to reach them, the photos / files) and three buttons instead of Approve:
     🔁 Make a change order — the CRM's change order builder (window.gcAddCO) opens filled in from the request (a GC job:
        its 🏗 GC portal → Change orders, where the GC's request is already filled in); saving the change order links it to
        the request (the customer sees "Being priced", then "Change order sent" once it is in their portal to sign).
     💬 Reply · ✖ Decline with note — the text goes through ✅ Approvals (preq_reply / preq_decline): approved, it shows in the
        customer's "My requests"; approved 7 PM–7 AM it waits for 7:00 AM (CUSTQUIET).
   Console: _gcPortalReq.get(id), .list(), .makeCO(id). */
(function(){
'use strict';
var W = window, D = document; if (W.__gcPortalReqUi) return; W.__gcPortalReqUi = 1;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || setTimeout, RI = W.__GC_NATIVE_SETINTERVAL__ || setInterval;
var FN = '/.netlify/functions/portal-req';
var CACHE = {}, LOADING = {}, NOTE = {}, OPEN = {}, DRAFT = {}, PENDING = null;
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function warn(e){ try { console.warn('[PORTALREQ]', e && e.message || e); } catch (x) {} }
function token(){
  var A = W.__GC_AUTH__;
  if (!A || typeof A.fresh !== 'function') return Promise.reject(new Error('Sign in to the CRM first.'));
  return Promise.resolve(A.fresh()).then(function(x){ if (!x || !x.access_token) throw new Error('Sign in to the CRM first.'); return x.access_token; });
}
function api(body){
  return token().then(function(t){ return W.fetch(FN, { method: 'POST', cache: 'no-store', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); })
    .then(function(r){ return r.text().then(function(t){ var j = {}; try { j = JSON.parse(t); } catch (e) { j = { error: 'The server answered ' + r.status + '.' }; } if (!j.ok && !j.error) j.error = 'The server answered ' + r.status + '.'; return j; }); }, function(e){ return { ok: false, error: e.message }; });
}
function toast(msg, bad){
  try { if (typeof W._gcToast === 'function') return W._gcToast(msg, bad); } catch (e) {}
  var t = D.createElement('div'); t.className = 'gcpr-toast'; t.textContent = msg; t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100100;background:' + (bad ? '#991b1b' : '#14532d') + ';color:#fff;padding:12px 16px;border-radius:10px;font:600 14px Arial;max-width:90vw;box-shadow:0 6px 24px rgba(0,0,0,.3)';
  D.body.appendChild(t); ST.call(W, function(){ t.remove(); }, 4500);
}
function css(){
  if (D.getElementById('gcpr-staff-css')) return;
  var st = D.createElement('style'); st.id = 'gcpr-staff-css';
  /* the request card's own buttons replace Approve / Don't approve / Edit (approving it would only close it) */
  st.textContent = '._ap2Card[data-id^="appr_preq_"] ._ap2Yes,._ap2Card[data-id^="appr_preq_"] ._ap2No,._ap2Card[data-id^="appr_preq_"] ._ap2Prev,'
    + '._apCard[data-id^="appr_preq_"] ._apApprove,._apCard[data-id^="appr_preq_"] ._apEditBtn,._apCard[data-id^="appr_preq_"] ._apRejBtn,'
    + '.apx-row[data-k^="ap2:appr_preq_"] [data-apx-act$="|approve"],.apx-row[data-k^="ap2:appr_preq_"] [data-apx-act$="|deny"],.apx-row[data-k^="ap2:appr_preq_"] [data-apx-act$="|edit"],.apx-row[data-k^="ap2:appr_preq_"] [data-apx-act$="|sendedit"]{display:none!important}'
    + '.gcpr-staff{margin-top:8px;border-top:1px dashed #cbd5e1;padding-top:8px;font:14px Inter,-apple-system,Arial,sans-serif;color:#0f172a;text-align:left;cursor:default}'
    + '.gcpr-staff dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 10px;margin:0 0 8px}.gcpr-staff dt{color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding-top:2px}.gcpr-staff dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}'
    + '.gcpr-staff .em{color:#b91c1c;font-weight:800}.gcpr-files{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 8px}.gcpr-files a{display:block;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;width:72px;height:72px;background:#f8fafc;text-align:center;font-size:11px;color:#334155;text-decoration:none}.gcpr-files img{width:100%;height:100%;object-fit:cover}.gcpr-files .pdf{display:flex;align-items:center;justify-content:center;height:100%;padding:4px;box-sizing:border-box;overflow-wrap:anywhere}'
    + '.gcpr-bs{display:flex;flex-wrap:wrap;gap:8px}.gcpr-bs button{flex:1 1 150px;min-height:46px;border-radius:10px;font:800 14px Inter,-apple-system,Arial,sans-serif;cursor:pointer;padding:8px 10px}'
    + '.gcpr-bs .co{background:#d4a017;color:#14202e;border:none}.gcpr-bs .rp{background:#fff;color:#1d4ed8;border:2px solid #1d4ed8}.gcpr-bs .dc{background:#fff;color:#b91c1c;border:2px solid #b91c1c}'
    + '.gcpr-box{margin-top:8px;display:flex;flex-direction:column;gap:6px}.gcpr-box textarea{width:100%;box-sizing:border-box;min-height:84px;border:1px solid #cbd5e1;border-radius:8px;padding:8px;font:14px Arial}.gcpr-box .go{min-height:44px;border:none;border-radius:10px;background:#16a34a;color:#fff;font-weight:800;cursor:pointer}.gcpr-box .go.dc{background:#b91c1c}'
    + '.gcpr-n{margin-top:6px;font-weight:700;color:#0f766e}.gcpr-n.bad{color:#b91c1c}.gcpr-small{background:none;border:none;color:#64748b;text-decoration:underline;font-size:12px;cursor:pointer;padding:6px 0 0}';
  D.head.appendChild(st);
}
function load(id, force){
  if (LOADING[id] || (!force && CACHE[id] && Date.now() - CACHE[id].at < 60e3)) return;
  LOADING[id] = 1;
  api({ action: 'staff-get', id: id }).then(function(j){ delete LOADING[id]; CACHE[id] = { at: Date.now(), d: j.ok ? j : null, err: j.ok ? '' : j.error }; decorate(true); });
}
var URG = { normal: 'Normal', soon: 'Soon', emergency: '🚨 EMERGENCY' }, CT = { call: 'Call', text: 'Text', email: 'E-mail', portal: 'Portal message' };
function blockHtml(id){
  var c = CACHE[id], d = c && c.d;
  if (!c) return '<div class="gcpr-n" style="color:#64748b">Loading the request…</div>';
  if (!d) return '<div class="gcpr-n bad">⚠ ' + esc(c.err || 'Could not load the request.') + '</div>';
  var r = d.request, j = d.job || {}, h = '<dl>';
  var row = function(k, v, cls){ if (s(v)) h += '<dt>' + esc(k) + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(v) + '</dd>'; };
  row('Status', d.statusLabel); row(r.kind === 'project' ? 'Property' : 'Job', r.kind === 'project' ? s(r.property && r.property.label) : [j.po ? 'PO ' + j.po : '', j.name].filter(Boolean).join(' · '));
  if (r.kind === 'project') row('Work', ({ restoration: 'Restoration / mitigation', roofing: 'Roofing', buildout: 'Commercial build-out', commaint: 'Commercial maintenance', other: 'Other' })[r.workType] || r.workType);
  row('From', s(r.by) + (r.portal === 'gc' ? ' (GC page)' : r.portal === 'pm' ? ' (property manager)' : ' (customer portal)'));
  row('What', r.text); row('Where', r.where); row('Urgency', URG[r.urgency] || r.urgency, r.urgency === 'emergency' ? 'em' : '');
  row('Reach them', (CT[r.contact] || '') + (r.contactNote ? ' — ' + r.contactNote : ''));
  arr(r.replies).forEach(function(x){ row('Reply', x.text + '  (' + x.by + ', ' + ({ shown: 'in their portal', scheduled: '7:00 AM', waiting: 'waiting on approval', rejected: 'not approved' }[x.state] || x.state) + ')'); });
  if (r.coId) row('Change order', s(r.coNum) || r.coId);
  h += '</dl>';
  if (arr(r.files).length) h += '<div class="gcpr-files">' + r.files.map(function(f){ var img = /^image\//.test(s(f.type)); return f.url ? '<a href="' + esc(f.url) + '" target="_blank" rel="noopener" title="' + esc(f.name) + '">' + (img ? '<img src="' + esc(f.url) + '" alt="' + esc(f.name) + '" loading="lazy">' : '<span class="pdf">📄 ' + esc(f.name) + '</span>') + '</a>' : '<span>' + esc(f.name) + '</span>'; }).join('') + '</div>';
  h += '<div class="gcpr-bs">' + (r.kind === 'change' ? '<button type="button" class="co" data-gcpr="co">🔁 Make a change order</button>' : '') + '<button type="button" class="rp" data-gcpr="reply">💬 Reply</button><button type="button" class="dc" data-gcpr="decline">✖ Decline with note</button></div>';
  if (OPEN[id]) {
    var dec = OPEN[id] === 'decline';
    h += '<div class="gcpr-box"><b>' + (dec ? '✖ Not possible — your note (they see it in their portal)' : '💬 Your reply (they see it in their portal)') + '</b><textarea data-gcpr-t placeholder="' + (dec ? 'Why it is not possible, kindly' : 'e.g. Thanks — I will call you this afternoon to look at it') + '">' + esc(DRAFT[id + OPEN[id]] || '') + '</textarea>'
      + '<button type="button" class="go' + (dec ? ' dc' : '') + '" data-gcpr="' + (dec ? 'decline-go' : 'reply-go') + '">' + (dec ? 'Decline with this note' : 'Send reply') + '</button><span style="font-size:12px;color:#64748b">It goes through ✅ Approvals (you approve it by sending when you may); 7 PM–7 AM it waits for 7:00 AM. No prices or dates promised unless you mean it.</span></div>';
  }
  if (NOTE[id]) h += '<div class="gcpr-n' + (/^⚠/.test(NOTE[id]) ? ' bad' : '') + '">' + esc(NOTE[id]) + '</div>';
  h += '<button type="button" class="gcpr-small" data-gcpr="close">✓ Close this card (handled)</button>';
  return h;
}
function hosts(){
  var out = [];
  D.querySelectorAll('._ap2Card[data-id^="appr_preq_"],._apCard[data-id^="appr_preq_"]').forEach(function(el){ out.push({ el: el, aq: el.getAttribute('data-id') }); });
  D.querySelectorAll('.apx-row[data-k^="ap2:appr_preq_"]').forEach(function(el){ out.push({ el: el, aq: el.getAttribute('data-k').slice(4) }); });
  return out;
}
function decorate(force){
  try {
    var hs = hosts(); if (!hs.length) return; css();
    hs.forEach(function(x){
      var id = x.aq.replace(/^appr_preq_/, ''), blk = x.el.querySelector(':scope > .gcpr-staff');
      load(id);
      var sig = JSON.stringify([CACHE[id] && CACHE[id].at, OPEN[id], NOTE[id]]);
      if (blk && blk.__sig === sig) return;
      var ta = blk && blk.querySelector('[data-gcpr-t]'); if (ta) DRAFT[id + OPEN[id]] = ta.value;
      if (!blk) { blk = D.createElement('div'); blk.className = 'gcpr-staff'; blk.setAttribute('data-preq', id); x.el.appendChild(blk); wire(blk, id); }
      blk.innerHTML = blockHtml(id); blk.__sig = sig;
      var t2 = blk.querySelector('[data-gcpr-t]'); if (t2) t2.addEventListener('input', function(){ DRAFT[id + OPEN[id]] = t2.value; });
    });
  } catch (e) { warn(e); }
}
function wire(blk, id){
  blk.addEventListener('click', function(e){
    e.stopPropagation();   /* the card around it opens its preview on a tap — not for these */
    var b = e.target.closest && e.target.closest('[data-gcpr]'); if (!b) return;
    var a = b.getAttribute('data-gcpr');
    if (a === 'co') return makeCO(id);
    if (a === 'reply' || a === 'decline') { OPEN[id] = OPEN[id] === a ? '' : a; NOTE[id] = ''; return decorate(true); }
    if (a === 'reply-go' || a === 'decline-go') return send(id, a === 'decline-go', blk);
    if (a === 'close') { NOTE[id] = 'Closing…'; decorate(true); return api({ action: 'staff-close', id: id }).then(function(j){ NOTE[id] = j.ok ? '✓ Closed.' : '⚠ ' + j.error; refresh(id); }); }
  });
}
function refresh(id){ load(id, true); try { if (W._gcApprovalsRefresh) Promise.resolve(W._gcApprovalsRefresh()).then(function(){ decorate(true); }); } catch (e) {} }
function send(id, decline, blk){
  var ta = blk.querySelector('[data-gcpr-t]'), text = s(ta && ta.value);
  if (text.length < 2) { NOTE[id] = decline ? '⚠ Say why it is not possible — they see this note.' : '⚠ Type the reply.'; return decorate(true); }
  NOTE[id] = 'Sending…'; DRAFT[id + OPEN[id]] = text; decorate(true);
  api({ action: decline ? 'staff-decline' : 'staff-reply', id: id, text: text }).then(function(j){
    if (j.ok) { DRAFT[id + OPEN[id]] = ''; OPEN[id] = ''; NOTE[id] = (decline ? '✖ Declined. ' : '💬 Reply: ') + (j.say || 'Done.'); }
    else NOTE[id] = '⚠ ' + (j.error || 'Try again.');
    refresh(id);
  });
}

/* ── 🔁 Make a change order ── */
function coList(pid){ return arr((W._crm || {}).changeOrders).filter(function(c){ return c && s(c.pid) === s(pid); }); }
function idbCos(){
  return new Promise(function(res){ try { var q = indexedDB.open('grayco_crm', 3); q.onsuccess = function(e){ try { var db = e.target.result, g = db.transaction('kv', 'readonly').objectStore('kv').get('cos'); g.onsuccess = function(){ res(arr(g.result)); }; g.onerror = function(){ res([]); }; } catch (x) { res([]); } }; q.onerror = function(){ res([]); }; } catch (e) { res([]); } });
}
function setVal(el, v){ if (!el) return; el.value = v; el.style.background = '#fffbe6'; try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {} }
function makeCO(id){
  var c = CACHE[id], d = c && c.d; if (!d) { NOTE[id] = '⚠ The request is still loading — try again.'; return decorate(true); }
  var r = d.request, j = d.job || {};
  api({ action: 'staff-pricing', id: id }).then(function(x){ if (x.ok) load(id, true); });
  if (j.gc && r.gcpCoId && W._gcGCP && typeof W._gcGCP.open === 'function') {   /* a GC job: its 🏗 GC portal change order (the GC signs it on their page) */
    try { if (W._gcGCP._p) W._gcGCP._p.tab = 'co'; } catch (e) {}
    W._gcGCP.open(j.id);
    var n = 0; (function find(){ var inp = D.querySelector('[data-co-amt="' + r.gcpCoId + '"]'); if (inp) { try { inp.scrollIntoView({ block: 'center' }); inp.focus(); inp.style.background = '#fffbe6'; } catch (e) {} return; } if (++n < 40) ST.call(W, find, 250); })();
    toast('🏗 The GC’s request #' + s(r.gcpCoNum) + ' is filled in — type the price and send it for approval; the GC signs it on their page.');
    return;
  }
  if (!W.gcAddCO || typeof W.gcAddCO.open !== 'function') { toast('Open the job’s Change Orders to make it (the change order builder is not loaded).', true); return; }
  var before = {}; coList(j.id).forEach(function(x){ before[s(x.id)] = 1; });
  idbCos().then(function(l){ l.forEach(function(x){ if (x && s(x.pid) === s(j.id)) before[s(x.id)] = 1; }); });
  W.gcAddCO.open(j.id, j.name, j.po, j.client, j.pm);
  var first = s(r.text).split('\n')[0], who = r.portal === 'gc' ? 'GC' : r.portal === 'pm' ? 'Property manager' : 'Customer';
  setVal(D.getElementById('gc-co-desc'), first.length > 200 ? first.slice(0, 199) + '…' : first);
  setVal(D.getElementById('gc-co-reason'), who + ' request (portal)');
  setVal(D.getElementById('gc-co-notes'), ['Portal request ' + r.id + ' from ' + s(r.by) + ' (' + new Date(r.createdAt).toLocaleDateString() + ').', s(r.text), r.where ? 'Where: ' + r.where : '', 'Urgency: ' + (URG[r.urgency] || r.urgency) + '.', arr(r.files).length ? arr(r.files).length + ' photo(s) / file(s) on the request.' : ''].filter(Boolean).join('\n'));
  PENDING = { id: id, pid: s(j.id), before: before, at: Date.now() };
  wrapSave();
  toast('🔁 The change order is filled in from the request — add the amount, check it, and save.');
}
function wrapSave(){
  var A = W.gcAddCO; if (!A || A.__preq) return;
  var orig = A.save;
  A.save = function(){
    var P = PENDING, res = orig.apply(this, arguments);
    Promise.resolve(res).then(function(){ if (P) linkLater(P, 0); }, function(){});
    return res;
  };
  A.__preq = true;
}
function linkLater(P, n){
  var ov = D.getElementById('gc-addco-overlay'); if (ov && ov.classList.contains('visible')) return;   /* not saved (a field missing): still open */
  var pick = function(list){ return arr(list).filter(function(c){ return c && s(c.pid) === P.pid && !P.before[s(c.id)]; }).sort(function(a, b){ return s(b.id) < s(a.id) ? -1 : 1; })[0] || null; };
  var co = pick(coList(P.pid));
  var go = function(co){
    if (!co) { if (n < 12) return ST.call(W, function(){ linkLater(P, n + 1); }, 300); return; }
    if (PENDING === P) PENDING = null;
    try { if (typeof W._gcSetCOs === 'function') W._gcSetCOs(function(l){ return arr(l).map(function(c){ return c && c.id === co.id ? Object.assign({}, c, { portalRequestId: P.id }) : c; }); }); } catch (e) {}
    api({ action: 'staff-link-co', id: P.id, coId: s(co.id), coNum: s(co.num || co.coNum || co.number) }).then(function(j){
      if (j.ok) { NOTE[P.id] = '🔁 Change order made and linked — the customer sees “Being priced”, then “Change order sent” once it is in their portal to sign.'; toast('🔁 Change order linked to the customer’s request.'); }
      else toast('⚠ The change order is saved, but linking it to the request did not go through: ' + j.error, true);
      refresh(P.id);
    });
  };
  if (co) return go(co);
  idbCos().then(function(l){ go(pick(l)); });
}
var due = false;
function tick(){ due = false; decorate(false); }
/* only while an approvals card is on screen does a change look at it (one timer at a time) */
try { new MutationObserver(function(){ if (!due) { due = true; ST.call(W, tick, 120); } }).observe(D.documentElement, { childList: true, subtree: true }); } catch (e) {}
RI.call(W, tick, 1500);
W._gcPortalReq = { get: function(id){ return CACHE[id] && CACHE[id].d; }, list: function(pid){ return api({ action: 'staff-list', pid: pid }); }, makeCO: makeCO, decorate: decorate };
})();
