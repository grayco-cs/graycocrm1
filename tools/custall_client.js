/* patch CUSTALL: the page side. Every customer goes on the Customers list.
   window._gcCustAllSaw(key, value)  the CRM's own save step calls this for every list it saves (local, cloud, live).
       Every job / lead / invoice / estimate seen new or changed, made or changed in the last 3 days (made here, or synced in
       from another computer or a server function, also while this computer was off: a text,
       a missed call, the website, CompanyCam, QuickBooks, MONEY) is put through the rule (_gcCustAllCore.upsert):
       a match is linked and only its empty fields are filled; a new person is added with an id made from their
       e-mail / phone, so two computers adding the same person make the same record. A name-only match is left
       for a person (the backfill lists it as "check"). Nothing runs on a timer.
   window._gcCustAllOpen()  the Customers screen's "👥 Add every missing customer (N)": a dry run list first, then one tap.
   window._gcCustAllCount() N for the button (remembered until the lists change).
   window._gcCustAllAdd(c)  the profile's "＋ Add to Customers" (a job's customer that is not on the list yet). */
(function(){
'use strict';
var W = window, D = document, CA = W._gcCustAllCore;
if (!CA || W._gcCustAllSaw) return;
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function crm(){ return W._crm || {}; }
function me(){ var c = crm(); return W._gcMeNow || c.currentUser || c.user || {}; }
function myName(){ return s(me().name) || s(me().email) || 'GrayCo'; }
function canRun(){ var u = me(); return /admin|office|owner/i.test(s(u.role)) || s(u.payType).toLowerCase() === 'owner'; }
function nowIso(){ return new Date().toISOString(); }
function toast(m){ try { if (typeof W._gcToast === 'function') return W._gcToast(m); var t = D.createElement('div'); t.textContent = m; t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#0f2440;color:#fff;padding:10px 18px;border-radius:10px;z-index:100200;font:14px Inter,Arial'; D.body.appendChild(t); setTimeout(function(){ t.remove(); }, 2600); } catch (e) {} }

var BOOT = Date.now(), DAYS = 3;
/* made in the last 3 days (its own creation date; savedAt only when it has none): older records are the backfill's (the dry run first) */
function recent(r){
  var t = [r.createdAt, r.created, r.receivedAt, r.inboxAt, r.firstSavedAt, r.date, r.addedDate].map(function(v){ var n = Date.parse(s(v)); return isNaN(n) ? 0 : n; }), m = Math.max.apply(null, t);
  if (!m) { var sv = Date.parse(s(r.savedAt || r.updatedAt)); m = isNaN(sv) ? BOOT : sv; }
  return m >= BOOT - DAYS * 864e5;
}
var KIND = { projects: 'job', leads: 'lead', invs: 'invoice', estimates: 'estimate' };
var LAST = {}, SEEN = {}, LINKED = {}, Q = [], queued = false, VER = 0;
/* only what says who the customer is: a status change or a re-save is not a change */
function sig(r){ var ct = r.contact && typeof r.contact === 'object' ? r.contact : {}; return [r.client, r.customer, r.contactName, typeof r.contact === 'string' ? r.contact : '', ct.name, ct.phone, ct.email, r.name, r.phone, r.clientPhone, r.email, r.clientEmail, r.address, r.deleted ? 1 : 0, r.type].map(s).join('|'); }   /* not customerId: our own link is not a change */
function data(){
  var c = crm();
  var cl = arr(W._graycoCustomers).length ? W._graycoCustomers : arr(c.customers);
  return { customers: LAST.customers || arr(cl), projects: LAST.projects || arr(c.projects), leads: LAST.leads || arr(c.leads),
    invs: LAST.invs || arr(c.invoices || c.invs), estimates: LAST.estimates || arr(c.estimates || W._gcEstimatesState), users: arr(c.users), subs: arr(c.subs), vendors: arr(c.vendors) };
}

/* the save step */
W._gcCustAllSaw = function(key, value){
  if (key !== 'customers' && !KIND[key]) return;
  if (!Array.isArray(value)) return;
  LAST[key] = value; VER++;
  if (key === 'customers') { heal(value); if (Q.length) kick(); return; }
  var m = SEEN[key] || (SEEN[key] = {});
  value.forEach(function(r){
    if (!r || r.id == null) return;
    var id = s(r.id), g = sig(r);
    if (m[id] === g) return;
    var changed = m[id] != null; m[id] = g;
    if (changed || recent(r)) Q.push([KIND[key], id, key]);   /* new to this computer and made lately, or its customer changed */
  });
  if (Q.length) kick();
};
W._gcCustAllState = function(){ var o = {}; Object.keys(LAST).forEach(function(k){ o[k] = arr(LAST[k]).length; }); return { lists: o, queued: Q.length, can: canRun(), ver: VER, writes: STAT.writes, applied: STAT.applied }; };
function kick(){ if (queued) return; queued = true; Promise.resolve().then(function(){ queued = false; try { run(); } catch (e) { try { console.warn('[CUSTALL]', e); } catch (x) {} } }); }

/* the queued records → the list (merged by id into whatever the list is by then) and the jobs' customerId */
function run(){
  if (!Q.length || !canRun()) return;
  if (!LAST.customers) { probe(); return; }   /* the list as the CRM holds it now, then again */
  var d = data();
  if (!d.customers.length) return;   /* this computer must have the list */
  var q = Q.splice(0), ctx = CA.ctxOf(d), list = arr(d.customers), put = {}, links = {}, at = nowIso(), by = myName() + ' (auto)', done = {};
  q.forEach(function(x){
    var k = x[0] + ':' + x[1]; if (done[k]) return; done[k] = 1;
    var rec = arr(LAST[x[2]]).filter(function(r){ return r && s(r.id) === x[1]; })[0];
    if (!rec) return;
    var u = CA.upsert(list, x[0], rec, ctx, { at: at, by: by });
    if (u.action === 'new' || u.action === 'filled') { list = u.list; put[u.id] = u.cust; }
    if ((u.action === 'new' || u.action === 'filled' || u.action === 'linked') && x[0] === 'job') { ctx.jobCust[x[1]] = u.id; if (!s(rec.customerId) && LINKED[x[1]] !== u.id) { links[x[1]] = u.id; LINKED[x[1]] = u.id; } }   /* once: a job saved back without it is not re-linked in a loop */
  });
  write(put, links);
}
/* the list's setter of the CRM as it is drawn now (window.__gcSetCustomersNow, handed out by patch CUSTALL like
   window._setProjects), else window._setCustomers (that one is kept from the first time the CRM was drawn) */
function setCust(fn){ return (typeof W.__gcSetCustomersNow === 'function' ? W.__gcSetCustomersNow : W._setCustomers)(fn); }
/* the CRM's own list, read through its setter (nothing changes); the queue runs again once it is in */
var probing = false, STAT = { writes: 0, applied: 0 };
function probe(){
  if (probing || (typeof W._setCustomers !== 'function' && typeof W.__gcSetCustomersNow !== 'function')) return; probing = true;
  try { setCust(function(prev){ probing = false; if (Array.isArray(prev) && prev.length && !LAST.customers) { LAST.customers = prev; kick(); } return prev; }); } catch (e) { probing = false; }
}
/* another part of the CRM may save the list from an older copy right after ours: what we added comes back
   (from the save step, no timer; at most 3 times; never what a person deleted) */
var KEEP = {};
function dead(id){ try { var t = typeof W._gcTombstones === 'function' ? W._gcTombstones() : null; return !!(t && t['customers:' + id]); } catch (e) { return false; } }
function heal(list){
  var ids = Object.keys(KEEP); if (!ids.length) return;
  var have = {}, put = {}; list.forEach(function(c){ if (c && c.id != null) have[s(c.id)] = c; });
  ids.forEach(function(id){
    var k = KEEP[id], h = have[id];
    if (dead(id) || k.n >= 3) { delete KEEP[id]; return; }
    var lost = !h || ['phone', 'email', 'address'].some(function(f){ return s(k.c[f]) && !s(h[f]); }) || arr(h.properties).length < arr(k.c.properties).length;
    if (lost) { put[id] = k.c; k.n++; }
  });
  if (Object.keys(put).length) Promise.resolve().then(function(){ write(put, {}, true); });
}
function write(put, links, healing){
  var ids = Object.keys(put), lk = Object.keys(links);
  if (!healing) ids.forEach(function(id){ KEEP[id] = { c: put[id], n: 0 }; });
  if (ids.length && (typeof W._setCustomers === 'function' || typeof W.__gcSetCustomersNow === 'function')) {
    STAT.writes++;
    setCust(function(prev){
      STAT.applied++;
      var have = {}, out = arr(prev).map(function(c){ if (c && put[s(c.id)]) { have[s(c.id)] = 1; return mergeKeep(c, put[s(c.id)]); } return c; });
      ids.forEach(function(id){ if (!have[id]) out.push(put[id]); });
      return out;
    });
    var cur = arr(LAST.customers), seen = {};   /* until the CRM hands the saved list back */
    LAST.customers = cur.map(function(c){ if (c && put[s(c.id)]) { seen[s(c.id)] = 1; return mergeKeep(c, put[s(c.id)]); } return c; }).concat(ids.filter(function(id){ return !seen[id]; }).map(function(id){ return put[id]; }));
  }
  var inJob = false; try { inJob = typeof W._gcInJobEntry === 'function' && W._gcInJobEntry(); } catch (e) {}
  if (lk.length && !inJob && typeof W._setProjects === 'function') {   /* a job being typed in is linked on its next save */
    W._setProjects(function(prev){
      var ch = false, out = arr(prev).map(function(p){ if (p && links[s(p.id)] && !s(p.customerId)) { ch = true; return Object.assign({}, p, { customerId: links[s(p.id)] }); } return p; });
      return ch ? out : prev;
    });
  }
  return { customers: ids.length, links: lk.length };
}
/* the list may have changed since: keep what is there, fill only its empty fields, add new properties */
function mergeKeep(cur, mine){
  var out = Object.assign({}, cur);
  Object.keys(mine).forEach(function(k){ if (k === 'properties') return; if (out[k] == null || out[k] === '') out[k] = mine[k]; });
  var st = CA.keysOf(out).streets;
  arr(mine.properties).forEach(function(p){ var a = CA.street(p && p.address || p); if (a && st.indexOf(a) < 0) { out.properties = arr(out.properties).concat([p]); st.push(a); } });
  out.updatedAt = mine.updatedAt || out.updatedAt;
  return out;
}

/* ── the backfill ─────────────────────────────────────────────────────────── */
var CNT = { v: -1, n: 0 };
W._gcCustAllCount = function(){
  if (CNT.v === VER && CNT.n >= 0) return CNT.n;
  try { var p = CA.plan(data()); CNT = { v: VER, n: p.tally.newCustomers }; } catch (e) { CNT = { v: VER, n: 0 }; }
  return CNT.n;
};
W._gcCustAllCan = canRun;
W._gcCustAllPlan = function(){ return CA.plan(data(), { at: nowIso(), by: myName() + ' (backfill)' }); };
W._gcCustAllOpen = function(){
  var P = W._gcCustAllPlan(), T = P.tally, prev = D.getElementById('gc-custall'); if (prev) prev.remove();
  var ov = D.createElement('div'); ov.id = 'gc-custall';
  ov.style.cssText = 'position:fixed;inset:0;z-index:100060;background:rgba(6,12,24,.6);display:flex;justify-content:center;align-items:flex-start;padding:24px 12px;overflow-y:auto;font-family:Inter,Arial,sans-serif';
  var KL = { job: '🏗 job', lead: '📋 lead', invoice: '🧾 invoice', estimate: '📐 estimate' };
  var row = function(r, i){
    var from = r.from.slice(0, 4).map(function(f){ return KL[f.kind] + ' ' + esc(f.label); }).join(' · ') + (r.from.length > 4 ? ' · +' + (r.from.length - 4) + ' more' : '');
    var st = r.status === 'new' ? '<b style="color:#16a34a">＋ new</b>' : r.status === 'matched' ? '<b style="color:#2563eb">↔ ' + esc(r.matchName) + '</b> <small>(same ' + esc(r.by) + ')' + (r.fills.length ? ', fills ' + esc(r.fills.join(', ')) : '') + '</small>'
      : '<b style="color:#8a5300">⚠ possible same customer — check</b>' + (r.matchName ? ' <small>(' + esc(r.matchName) + ')</small>' : '') +
        '<br><select data-ck="' + i + '" style="margin-top:4px;padding:4px;border-radius:6px"><option value="">Leave for now</option><option value="same">Same customer — add under ' + esc(r.matchName || 'them') + '</option><option value="new">A different customer — add new</option></select>';
    return '<tr style="border-top:1px solid #e5eaf2;vertical-align:top"><td style="padding:6px 8px;font-weight:700">' + esc(r.name) + '</td><td style="padding:6px 8px;font-size:12px;color:#475569">' + from + '</td><td style="padding:6px 8px;font-size:12px">' + st + '</td></tr>';
  };
  var hasCheck = P.rows.some(function(r){ return r.status === 'check'; });
  ov.innerHTML = '<div style="background:#fff;color:#14213d;border-radius:14px;max-width:980px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35)">' +
    '<div style="background:#0f2440;color:#fff;padding:14px 18px;border-radius:14px 14px 0 0;display:flex;gap:10px;align-items:center"><b style="font-size:18px">👥 Add every missing customer</b><button data-x style="margin-left:auto;background:#1e3a5f;color:#fff;border:0;border-radius:999px;padding:7px 13px;font-weight:700;cursor:pointer">✕ Close</button></div>' +
    '<div style="padding:14px 18px"><div data-sum style="font-size:13px;margin-bottom:10px">Dry run — nothing is saved yet. ' + T.records + ' jobs / leads / invoices / estimates have a customer that is not linked to the list: <b>' + T.newCustomers + ' new customers</b> (' + T.created + ' records), <b>' + (T.matched + T.filled) + '</b> records match ' + T.matchedCustomers + ' customers already on the list (same e-mail, phone, or name + address — only empty fields are filled, a new address is added as another property), <b>' + T.checkCustomers + '</b> same-name customers to check (' + T.check + ' records). ' + T.skipped + ' skipped (subs, staff, GCs on bids, test or blank names).</div>' +
    (hasCheck ? '<div style="font-size:12px;margin-bottom:8px">Same-name rows: <button data-all="same" style="padding:4px 8px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;cursor:pointer">all the same customer</button> <button data-all="new" style="padding:4px 8px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;cursor:pointer">all different</button> <button data-all="" style="padding:4px 8px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;cursor:pointer">leave all</button></div>' : '') +
    '<div style="max-height:56vh;overflow:auto;border:1px solid #e5eaf2;border-radius:10px"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f1f5fb;text-align:left"><th style="padding:6px 8px">Customer</th><th style="padding:6px 8px">From</th><th style="padding:6px 8px">On the list</th></tr></thead><tbody>' +
    (P.rows.length ? P.rows.map(row).join('') : '<tr><td colspan="3" style="padding:14px;color:#64748b">Every customer is on the list.</td></tr>') + '</tbody></table></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button data-go style="background:#16a34a;color:#fff;border:0;border-radius:9px;padding:10px 16px;font-weight:800;cursor:pointer"' + (P.rows.length ? '' : ' disabled') + '>✅ Add them all (' + T.newCustomers + ' new, ' + T.matchedCustomers + ' linked)</button></div></div></div>';
  ov.addEventListener('click', function(e){
    var t = e.target;
    if (t === ov || t.hasAttribute('data-x')) { ov.remove(); return; }
    if (t.hasAttribute('data-all')) { [].forEach.call(ov.querySelectorAll('select[data-ck]'), function(x){ x.value = t.getAttribute('data-all'); }); return; }
    if (t.hasAttribute('data-go')) {
      var pick = {}; [].forEach.call(ov.querySelectorAll('select[data-ck]'), function(x){ if (x.value) pick[x.getAttribute('data-ck')] = x.value; });
      var r = W._gcCustAllApply(P, pick);
      ov.querySelector('[data-sum]').innerHTML = '<b style="color:#16a34a">Done.</b> ' + r.added + ' customers added, ' + r.updated + ' filled in, ' + r.links + ' jobs linked.';
      t.disabled = true; t.textContent = 'Added'; toast('👥 ' + r.added + ' customers added to the list');
    }
  });
  D.body.appendChild(ov);
  return P;
};
/* apply a plan: the new / filled customers (merged by id into the list as it is now) and the jobs' customerId.
   pick: { rowIndex: 'same' | 'new' } for the same-name rows a person decided. */
W._gcCustAllApply = function(P, pick){
  pick = pick || {};
  var orig = {}; arr(data().customers).forEach(function(c){ if (c) orig[s(c.id)] = c; });
  var list = arr(P.customers).slice(), at = nowIso(), links = {}, d = data(), jobs = {};
  arr(d.projects).forEach(function(p){ if (p) jobs[s(p.id)] = p; });
  P.links.forEach(function(l){ if (l.kind === 'job' && jobs[l.id] && !s(jobs[l.id].customerId)) links[l.id] = l.customerId; });
  P.rows.forEach(function(r, i){
    if (r.status !== 'check' || !pick[i] || !r.cand) return;
    var tgt = r.id;
    if (pick[i] === 'new') { var n = CA.make(r.cand, at, myName() + ' (backfill)'); if (!list.some(function(c){ return c && s(c.id) === n.id; })) list.push(n); tgt = n.id; }
    else { var c = list.filter(function(x){ return x && s(x.id) === tgt; })[0]; if (c) { var f = CA.fill(c, r.cand, at); if (f) list = list.map(function(x){ return x === c ? f.c : x; }); } }
    r.from.forEach(function(f2){
      if (f2.kind === 'job' && jobs[f2.id] && !s(jobs[f2.id].customerId)) links[f2.id] = tgt;
      if (f2.kind === 'job' && pick[i] === 'same') {   /* a job's other addresses go under this customer */
        var c2 = list.filter(function(x){ return x && s(x.id) === tgt; })[0], jb = jobs[f2.id];
        if (c2 && jb && s(jb.address)) { var f3 = CA.fill(c2, { address: s(jb.address), kind: 'job', ref: f2.id }, at); if (f3) list = list.map(function(x){ return x === c2 ? f3.c : x; }); }
      }
    });
  });
  var put = {}, added = 0, updated = 0;
  list.forEach(function(c){ if (!c) return; var o = orig[s(c.id)]; if (!o) { put[s(c.id)] = c; added++; } else if (o !== c) { put[s(c.id)] = c; updated++; } });
  var w = write(put, links);
  VER++;
  return { added: added, updated: updated, links: w.links };
};

/* the profile's "＋ Add to Customers" for a job's customer: the same rule (match first), then the job is linked */
W._gcCustAllAdd = function(c){
  if (!c) return null;
  var d = data(), ctx = CA.ctxOf(d), job = { id: s(c._pid) || 'profile', client: s(c.name), clientPhone: s(c.phone), clientEmail: s(c.email), address: s(c.address) };
  var u = CA.upsert(arr(d.customers), 'job', job, ctx, { at: nowIso(), by: myName() });
  var cust = u.cust;
  if (u.action === 'check' || u.action === 'skip') { cust = CA.make(Object.assign({ kind: 'job', ref: job.id, source: 'Job' }, u.cand || { name: s(c.name), phone: CA.phone10(c.phone), phoneRaw: s(c.phone), email: CA.email(c.email), address: s(c.address) }), nowIso(), myName()); }
  var put = {}; if (cust && u.action !== 'linked') put[s(cust.id)] = cust;
  var links = {}; if (c._pid) links[s(c._pid)] = s(cust.id);
  write(put, links); VER++;
  return cust;
};
})();
/* may a job be linked to this customer? not on a name alone (owner: a name-only match is for a person to check) */
(function(){
var W = window, CA = W._gcCustAllCore; if (!CA || W._gcCustAllLinkable) return;
W._gcCustAllLinkable = function(p, c){
  try { if (!p || !c) return false; if (p.customerId && String(p.customerId) === String(c.id)) return true;
    var r = CA.from.job(p, {}); if (!r.cand) return false; r.cand.customerId = ''; var m = CA.match([c], r.cand); return !!m && m.by !== 'name only'; } catch (e) { return true; }
};
})();
/* a job's customer, from the job (for the profile before the customer is on the list): the list's record when one
   matches (id / e-mail / phone / name + address), else the job's own name, phone, e-mail and address */
(function(){
var W = window, CA = W._gcCustAllCore; if (!CA || W._gcCustFromJob) return;
function s(v){ return v == null ? '' : String(v).trim(); }
W._gcCustFromJob = function(key, pid){
  var c = W._crm || {}, ps = (c.projects || []).filter(function(p){ return p && !p.deleted; }), k = s(key), n = CA.norm(k);
  var p = ps.filter(function(x){ return (pid && s(x.id) === s(pid)) || s(x.id) === k; })[0] ||
    ps.filter(function(x){ return n && CA.norm(x.client) === n; }).sort(function(a, b){ return s(b.updatedAt || b.savedAt).localeCompare(s(a.updatedAt || a.savedAt)); })[0];
  if (!p) return null;
  var r = CA.from.job(p, {}), m = r.cand ? CA.match(c.customers || W._graycoCustomers || [], r.cand) : null;
  if (m && m.by !== 'name only') return m.c;
  return { name: s(p.client) || 'Customer', phone: s(p.clientPhone || p.customerPhone || p.phone), email: s(p.clientEmail || p.customerEmail), address: s(p.address), _pseudo: true, _pid: s(p.id) };
};
})();
