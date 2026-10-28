/* __GC_PATCH_SUBCONTACT__ — THE CUSTOMER'S "YOUR CREW" CARD: TRADE CONTACTS, ONLY WHEN THE PM SAYS SO (owner 10/27)
   Owner: "all customer portals can have subcontractors' information for communication if requested and approved by
   the PM." The hard rule stays: the customer never learns that subs have a portal, and never sees a sub's price,
   invoice or internal note.
   • JOB PAGE (under the job's "👷 Subs & portal messages" row, or its portal card): "👷 Trade contacts for the customer" — every sub on the job with a
     "Share contact with customer" switch (default OFF) and which details show: company name (always), contact person,
     phone, e-mail (default company name + phone). The PM, the office or an admin saves it; the log says who shared /
     revoked what and when. Everyone else sees it read-only.
   • ✅ APPROVALS: the customer's "Request your trade contacts" (kind sub_contact, PM first, office after 24 h) —
     ✅ Approve opens the same picker; approving shares exactly what is ticked. Nothing is e-mailed.
   The server (portal.js action "subshare" / approval op approve + share) keeps it in gc_kv "gc_sub_share"; the sub's
   own record is never changed. Console: _gcSubContact.pick(pid), _gcSubContact.load(pid) */
(function(){
'use strict';
if (window.__GC_PATCH_SUBCONTACT__) return; window.__GC_PATCH_SUBCONTACT__ = true;
var W = window, D = document, FN = '/.netlify/functions/portal';
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
function s(v){ return (v == null ? '' : String(v)).trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function warn(e){ try { console.warn('[GC SUBCONTACT]', e && e.message || e); } catch (x) {} }
function toast(msg, bg){ try { var t = D.createElement('div'); t.setAttribute('data-gc-keep', '1'); t.textContent = msg; t.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99995;background:' + (bg || '#0f766e') + ';color:#fff;padding:10px 14px;border-radius:10px;font:600 14px Inter,-apple-system,sans-serif;max-width:calc(100vw - 32px);box-shadow:0 6px 20px rgba(0,0,0,.2)'; D.body.appendChild(t); ST.call(W, function(){ t.remove(); }, 4200); } catch (e) {} }
function when(iso){ var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
var FL = { company: 'Company name', contact: 'Contact person', phone: 'Phone', email: 'E-mail' }, FK = ['company', 'contact', 'phone', 'email'];
var ROLE = { pm: 'PM', office: 'Office', admin: 'Admin', apm: 'APM', customer: 'customer' };
var BTN = 'min-height:40px;padding:8px 12px;border:1px solid #CBD5E1;border-radius:10px;background:#fff;color:#14202E;font-weight:700;font-size:13px;cursor:pointer';

function api(body){
  return W.fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action: 'subshare' }, body)) })
    .then(function(r){ return r.text().then(function(t){ var j = {}; try { j = JSON.parse(t); } catch (e) { j = { error: t.slice(0, 160) }; } j.__status = r.status; return j; }); }, function(e){ return { ok: false, error: 'No internet (' + (e && e.message) + ')' }; });
}
var CACHE = {};
function load(pid){ return api({ op: 'get', projectId: s(pid) }).then(function(j){ if (j && j.ok) CACHE[s(pid)] = { at: Date.now(), d: j }; return j; }); }

/* ── the per-sub picker rows (job page and ✅ Approvals use the same) ── */
function rowsHtml(subs, sel, ro){
  if (!subs.length) return '<div style="font-size:13px;color:#64748b">No subs are on this job yet — add them on the job first.</div>';
  return subs.map(function(x){
    var cur = sel[x.key] || { on: false, fields: ['company', 'phone'] }, on = !!cur.on;
    var flds = FK.map(function(k){
      var has = k === 'company' || !x.has || x.has[k] !== false, ck = k === 'company' || cur.fields.indexOf(k) >= 0;
      return '<label style="display:inline-flex;align-items:center;gap:5px;font-size:12px;margin:2px 10px 2px 0;' + (has ? '' : 'color:#94a3b8') + '"><input type="checkbox" data-sf="' + k + '" data-key="' + esc(x.key) + '"' + (ck ? ' checked' : '') + (k === 'company' || ro || !on ? ' disabled' : '') + ' style="width:18px;height:18px">' + FL[k] + (has ? '' : ' (not on file)') + '</label>';
    }).join('');
    return '<div data-row="' + esc(x.key) + '" style="border-top:1px solid #EFEAE0;padding:8px 0">' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer"><input type="checkbox" data-son="' + esc(x.key) + '"' + (on ? ' checked' : '') + (ro ? ' disabled' : '') + ' style="width:22px;height:22px;accent-color:#16a34a">' +
      '<span style="flex:1;min-width:0"><b>' + esc(x.name) + '</b>' + (x.trade ? ' · ' + esc(x.trade) : '') + '</span><span style="font-size:12px;color:' + (on ? '#15803d' : '#64748b') + ';font-weight:700;white-space:nowrap">' + (on ? 'Shared' : 'Share contact with customer') + '</span></label>' +
      '<div style="margin:4px 0 0 30px">' + flds + '</div></div>';
  }).join('');
}
function selFrom(subs, preAll){
  var o = {};
  subs.forEach(function(x){ o[x.key] = { on: preAll ? true : !!x.on, fields: (x.on ? arr(x.fields) : ['company', 'phone']).slice() }; });
  return o;
}
function wireRows(el, sel, after){
  el.addEventListener('change', function(ev){
    var t = ev.target; if (!t || !t.getAttribute) return;
    var k = t.getAttribute('data-son') || t.getAttribute('data-key'); if (!k || !sel[k]) return;
    if (t.hasAttribute('data-son')) sel[k].on = !!t.checked;
    else { var f = t.getAttribute('data-sf'), l = sel[k].fields.filter(function(x){ return x !== f; }); if (t.checked) l.push(f); sel[k].fields = l; }
    if (after) after();
  });
}
function selList(sel){ return Object.keys(sel).map(function(k){ return { key: k, on: !!sel[k].on, fields: FK.filter(function(f){ return f === 'company' || sel[k].fields.indexOf(f) >= 0; }) }; }); }
function logHtml(log){
  log = arr(log).slice(0, 8); if (!log.length) return '';
  return '<div style="font-size:11px;font-weight:800;letter-spacing:.04em;color:#64748b;margin-top:8px">LOG</div>' + log.map(function(l){
    var who = esc(l.by || '?') + (l.role && ROLE[l.role] && l.role !== 'customer' ? ' (' + ROLE[l.role] + ')' : '');
    var what = l.op === 'request' ? 'The customer asked for the trades’ contacts' : l.op === 'share' ? who + ' shared ' + esc(l.name) + ': ' + esc(arr(l.fields).map(function(f){ return FL[f] || f; }).join(', ')) :
      l.op === 'change' ? who + ' changed ' + esc(l.name) + ': ' + esc(arr(l.fields).map(function(f){ return FL[f] || f; }).join(', ')) : l.op === 'revoke' ? who + ' revoked ' + esc(l.name) :
      l.op === 'approve' ? who + ' approved the customer’s request' : l.op === 'decline' ? who + ' did not approve the customer’s request' : esc(l.op);
    return '<div style="font-size:12px;color:#475569">' + esc(when(l.at)) + ' — ' + what + '</div>';
  }).join('');
}

/* ── the picker (✅ Approvals) → Promise<selection list | null> ── */
function pick(pid, opts){
  opts = opts || {};
  return new Promise(function(done){
    var ov = D.createElement('div'); ov.setAttribute('data-gc-keep', '1'); ov.className = 'gcsubc-pick';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99990;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
    var box = D.createElement('div');
    box.style.cssText = 'background:#fff;color:#14202E;border-radius:14px;max-width:560px;width:100%;max-height:calc(100vh - 32px);overflow:auto;padding:14px 16px;box-sizing:border-box;font-family:Inter,-apple-system,sans-serif';
    box.innerHTML = '<div style="font-weight:800;font-size:16px">👷 Share trade contacts with the customer</div><div style="font-size:13px;color:#475569;margin:4px 0 8px">' + esc(opts.title || '') + '</div><div data-body style="font-size:13px;color:#64748b">Loading the subs on this job…</div>';
    ov.appendChild(box); D.body.appendChild(ov);
    var closed = false;
    function close(v){ if (closed) return; closed = true; ov.remove(); done(v); }
    ov.addEventListener('click', function(e){ if (e.target === ov) close(null); });
    load(pid).then(function(j){
      var body = box.querySelector('[data-body]');
      if (!j || !j.ok) { body.innerHTML = '<div style="color:#b91c1c">' + esc((j && j.error) || 'Could not load the subs.') + '</div><div style="margin-top:10px"><button type="button" data-x style="' + BTN + '">Close</button></div>'; body.querySelector('[data-x]').onclick = function(){ close(null); }; return; }
      var subs = arr(j.subs), sel = selFrom(subs, opts.request && !subs.some(function(x){ return x.on; }));
      function paint(){
        var n = Object.keys(sel).filter(function(k){ return sel[k].on; }).length;
        body.innerHTML = '<div style="color:#475569">Only what you tick shows on the customer’s “Your crew” card — never a price, an invoice or a note. You can turn it off any time on the job.</div>' +
          rowsHtml(subs, sel, false) +
          '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button type="button" data-ok style="' + BTN + ';background:#16a34a;border-color:#16a34a;color:#fff;flex:1">✅ Approve — share ' + n + ' trade' + (n === 1 ? '' : 's') + '</button><button type="button" data-x style="' + BTN + '">Cancel</button></div>';
        body.querySelector('[data-ok]').onclick = function(){ close(selList(sel)); };
        body.querySelector('[data-x]').onclick = function(){ close(null); };
      }
      wireRows(body, sel, paint); paint();
    });
  });
}

/* ── the job page panel (right under the job's portal card) ── */
function proj(pid){ try { return arr((W._crm || {}).projects).filter(function(p){ return p && s(p.id) === s(pid); })[0] || null; } catch (e) { return null; } }
function panelPaint(el){
  var pid = el.getAttribute('data-pid'), c = CACHE[pid], d = c && c.d, open = !!el.__open;
  var subs = d ? arr(d.subs) : [], n = subs.filter(function(x){ return x.on; }).length, req = d && d.request;
  var head = '<button type="button" data-t style="all:unset;display:flex;gap:8px;align-items:center;width:100%;cursor:pointer;font-size:13px"><b style="flex:1">👷 Trade contacts for the customer</b>' +
    (req && req.status === 'waiting' ? '<span style="font-size:12px;color:#92400e;font-weight:700">Customer asked ' + esc(when(req.at)) + ' — in ✅ Approvals</span>' : '') +
    '<span style="font-size:12px;color:' + (n ? '#15803d' : '#64748b') + ';font-weight:700">' + (d ? (n ? n + ' shared' : 'Off') : '…') + '</span><span aria-hidden="true">' + (open ? '▴' : '▾') + '</span></button>';
  if (!open || !d) { el.innerHTML = head; return; }
  var sel = el.__sel || (el.__sel = selFrom(subs, false)), ro = !d.canEdit;
  el.innerHTML = head + '<div data-rows>' + rowsHtml(subs, sel, ro) + '</div>' +
    (ro ? '<div style="font-size:12px;color:#64748b;margin-top:6px">Only the job’s PM, the office or an admin can change this.</div>' : (subs.length ? '<div style="display:flex;gap:8px;margin-top:8px"><button type="button" data-save style="' + BTN + ';background:#0F1D2F;border-color:#0F1D2F;color:#fff">Save</button><span style="font-size:12px;color:#64748b;align-self:center">The customer sees it on the “Your crew” card right away; off = gone.</span></div>' : '')) +
    logHtml(d.log);
}
function buildPanel(pid){
  var el = D.createElement('div'); el.className = 'gcsubc-panel'; el.setAttribute('data-pid', s(pid)); el.setAttribute('data-gc-keep', '');
  el.style.cssText = 'background:#fff;color:#14202E;border:1px solid #E2DCCD;border-left:4px solid #16a34a;border-radius:12px;padding:8px 10px;margin:-4px 0 10px;font-family:Inter,-apple-system,sans-serif;box-sizing:border-box;max-width:100%';
  el.addEventListener('click', function(ev){
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-t],[data-save]') : null; if (!t) return;
    if (t.hasAttribute('data-t')) { el.__open = !el.__open; el.__sel = null; panelPaint(el); if (el.__open) load(pid).then(function(){ el.__sel = null; panelPaint(el); }); return; }
    if (t.hasAttribute('data-save') && !el.__busy) {
      el.__busy = true; t.textContent = 'Saving…';
      api({ op: 'set', projectId: s(pid), share: selList(el.__sel || {}) }).then(function(j){
        el.__busy = false;
        if (j && j.ok) { CACHE[s(pid)] = { at: Date.now(), d: j }; el.__sel = null; toast(j.changed ? 'Saved — the customer’s “Your crew” card is up to date.' : 'Nothing changed.'); }
        else toast('Could not save: ' + ((j && j.error) || 'try again'), '#991b1b');
        panelPaint(el);
      });
    }
  });
  el.addEventListener('change', function(ev){
    var t = ev.target, sel = el.__sel; if (!t || !sel || !t.getAttribute) return;
    var k = t.getAttribute('data-son') || t.getAttribute('data-key'); if (!k || !sel[k]) return;
    if (t.hasAttribute('data-son')) sel[k].on = !!t.checked;
    else { var f = t.getAttribute('data-sf'), l = sel[k].fields.filter(function(x){ return x !== f; }); if (t.checked) l.push(f); sel[k].fields = l; }
    var rows = el.querySelector('[data-rows]'); if (rows) rows.innerHTML = rowsHtml(arr(CACHE[s(pid)].d.subs), sel, false);
  });
  panelPaint(el); load(pid).then(function(){ panelPaint(el); });
  return el;
}
/* where it goes: right under the job's "👷 Subs & portal messages" row (desk), else under the job's portal card
   (and its insurance panel) — one per job */
function anchors(){
  var out = [], seen = {};
  function add(el, pid, after){ if (!pid || seen[pid] || !proj(pid)) return; seen[pid] = 1; out.push({ el: el, pid: pid, after: after }); }
  Array.prototype.forEach.call(D.querySelectorAll('main .gcsub-row[data-pid]'), function(r){ add(r, s(r.getAttribute('data-pid')), r); });
  Array.prototype.forEach.call(D.querySelectorAll('.gcq-card[data-pid]'), function(c){
    var nx = c.nextElementSibling, after = nx && nx.classList && nx.classList.contains('gcinsp-panel') ? nx : c;
    add(c, s(c.getAttribute('data-pid')), after);
  });
  return out;
}
function tick(){
  if (D.hidden) return;
  try {
    var A = anchors(), ok = [];
    A.forEach(function(a){
      var nx = a.after.nextElementSibling, pid = a.pid;
      var mine = nx && nx.classList && nx.classList.contains('gcsubc-panel') && nx.getAttribute('data-pid') === pid ? nx : null;
      if (!mine) { mine = Array.prototype.filter.call(D.querySelectorAll('.gcsubc-panel'), function(x){ return x.getAttribute('data-pid') === pid; })[0] || buildPanel(pid); a.after.parentNode.insertBefore(mine, a.after.nextSibling); }
      else if (!mine.__open && (!CACHE[pid] || Date.now() - CACHE[pid].at > 120e3) && !mine.__loading) { mine.__loading = true; load(pid).then(function(){ mine.__loading = false; panelPaint(mine); }); }
      ok.push(mine);
    });
    Array.prototype.forEach.call(D.querySelectorAll('.gcsubc-panel'), function(el){ if (ok.indexOf(el) < 0) el.remove(); });
  } catch (e) { warn(e); }
}

/* ── ✅ Approvals: approving a customer's request opens the picker (the one approval door, _gcApprovalAct) ── */
function itemOf(id){ try { var q = W._gcCustApprovals ? W._gcCustApprovals() : null; return q ? arr(q.all).filter(function(x){ return x && s(x.id) === s(id); })[0] || null : null; } catch (e) { return null; } }
function wrapAct(){
  var f = W._gcApprovalAct; if (typeof f !== 'function' || f.__subc) return;
  var w = function(id, op, extra){
    try {
      if (op === 'approve' && !(extra && Array.isArray(extra.share))) {
        var it = itemOf(id);
        if (it && it.kind === 'sub_contact') return pick(s(it.jobId), { title: it.title, request: true }).then(function(sel){
          if (!sel) return { ok: false, error: 'Not approved yet — pick the trades to share.' };
          return f.call(W, id, op, Object.assign({}, extra || {}, { share: sel }));
        });
      }
    } catch (e) { warn(e); }
    return f.apply(W, arguments);
  };
  Object.keys(f).forEach(function(k){ try { w[k] = f[k]; } catch (e) {} });   /* other wrappers' marks stay (they do not wrap twice) */
  w.__subc = true; W._gcApprovalAct = w;
}
RI.call(W, function(){ wrapAct(); tick(); }, 1500);
ST.call(W, function(){ wrapAct(); tick(); }, 800);
W._gcSubContact = { pick: pick, load: load, tick: tick };
})();
