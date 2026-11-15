/* __GC_PATCH_SUBTHREAD__ — 💬 the sub's job thread gets the news by itself (owner's sub portal plan, 11/15 list item 5.4).
   From the CRM (portal-access s-send, party s:<sub> — only that sub sees it; the server tells the sub and copies it to the job's 💬 Messages):
     · 🏆 Awarded — when a bid award puts the sub on the job (patch BIDMULTI): "You were awarded <trade> on <job>. Your PO …";
     · 💵 Payment sent — a sub invoice on a job marked paid (in the last 14 days), once per invoice (gc_kv gc_subpay_posted), from an
       admin's / the office's computer: "Payment sent: your invoice #… for <job> — $…, paid <date>." (their own invoice only).
   (Schedule ✅ / 📨, scopes and change orders to sign are posted by the server; scope sends by SCOPESEND.)
   API: window._gcSubThread = { post(pid, subId, text), award(pid, sub, bid), paySweep() } */
(function(W){
'use strict';
if (W.__GC_PATCH_SUBTHREAD__) return; W.__GC_PATCH_SUBTHREAD__ = true;
var D = W.document, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
var PKEY = 'gc_subpay_posted';
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function num(v){ var n = parseFloat(s(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function money(n){ return '$' + num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function crm(){ return W._crm || {}; }
function proj(pid){ return arr(crm().projects).find(function(p){ return s(p.id) === s(pid); }) || null; }
function office(){ try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {} try { if (W._gcIsOfficeFull && W._gcIsOfficeFull()) return true; var u = JSON.parse(localStorage.getItem('grayco_user') || '{}'); return /admin|office/i.test(s(u.role) + ' ' + s(u.profile)) || /owner/i.test(s(u.payType)); } catch (e) { return false; } }
function post(pid, subId, text){
  if (!s(pid) || !s(subId) || !s(text)) return Promise.resolve({ ok: false });
  return W.fetch('/.netlify/functions/portal-access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 's-send', projectId: s(pid), party: 's:' + s(subId), text: s(text).slice(0, 3900), files: [] }) })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ return { ok: r.ok && j.ok !== false, data: j }; }); }, function(){ return { ok: false }; });
}
function award(pid, sub, b){
  var p = proj(pid); if (!p || !sub) return Promise.resolve({ ok: false });
  var po = s(p.autoPO || p.po), pm = s(p.pm), tr = s((b && b.trade) || sub.trade);
  return post(pid, sub.id, '🏆 You were awarded ' + (tr ? tr + ' on ' : '') + s(p.name || 'this job') + '.' + (po ? ' Your PO for this job: ' + po + ' — use it at the supply house and on every receipt and invoice.' : '') + (pm ? ' ' + pm + ' from GrayCo will reach out about the next steps.' : ''));
}
/* 💵 payment sent — once per paid sub invoice */
function posted(){ try { return JSON.parse(localStorage.getItem(PKEY) || '{}') || {}; } catch (e) { return {}; } }
var PULLED = false;
function pull(){
  if (PULLED) return Promise.resolve(); PULLED = true;
  try { var u = (localStorage.getItem('grayco_sb_url') || '').replace(/\/$/, ''), k = localStorage.getItem('grayco_sb_key') || ''; if (!u || !k) return Promise.resolve();
    return W.fetch(u + '/rest/v1/gc_kv?key=eq.' + PKEY + '&select=value', { headers: { apikey: k, Authorization: 'Bearer ' + k }, cache: 'no-store' }).then(function(r){ return r.ok ? r.json() : null; }, function(){ return null; }).then(function(rows){
      if (!Array.isArray(rows) || !rows[0]) return; var v = rows[0].value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = {}; } }
      var m = posted(); Object.keys(v || {}).forEach(function(x){ if (!m[x]) m[x] = v[x]; }); try { localStorage.setItem(PKEY, JSON.stringify(m)); } catch (e) {} });
  } catch (e) { return Promise.resolve(); }
}
function mark(id){ var m = posted(); m[id] = new Date().toISOString(); var ks = Object.keys(m); if (ks.length > 1500) ks.sort(function(a, b){ return m[a] < m[b] ? -1 : 1; }).slice(0, ks.length - 1500).forEach(function(x){ delete m[x]; }); try { localStorage.setItem(PKEY, JSON.stringify(m)); } catch (e) {} try { var u = W._supaUpsertNow || W._supaUpsert; if (u) u(PKEY, m); } catch (e) {} }
function paid(iv){ return /^paid$/i.test(s(iv.status)) || iv.paid === true; }
function paySweep(){
  if (!office()) return Promise.resolve(0);
  return pull().then(function(){
    var m = posted(), seen = {}, cut = Date.now() - 14 * 864e5, todo = [];
    arr(crm().invoices).concat(arr(crm().invs)).forEach(function(iv){
      if (seen[iv.id]) return; seen[iv.id] = 1;
      if (!(s(iv.type) === 'sub' || s(iv.sub)) || !s(iv.subId) || !s(iv.pid) || iv.deleted || !paid(iv) || m[iv.id]) return;
      var t = Date.parse(s(iv.paidDate || iv.paidAt || iv.updatedAt)); if (!isFinite(t) || t < cut) return;
      var p = proj(iv.pid); if (!p || !arr(p.subs).some(function(r){ return s(r.subId) === s(iv.subId); })) return;   /* only a job the sub can see */
      todo.push({ iv: iv, p: p });
    });
    return todo.slice(0, 10).reduce(function(chain, x){ return chain.then(function(n){
      var iv = x.iv, d = s(iv.paidDate || iv.paidAt).slice(0, 10);
      return post(x.p.id, iv.subId, '💵 Payment sent: your invoice' + (s(iv.invNum) ? ' #' + s(iv.invNum) : '') + ' for ' + s(x.p.name || 'this job') + ' — ' + money(iv.amt != null ? iv.amt : iv.amount) + (d ? ', paid ' + d : '') + '.').then(function(r){ if (r.ok) { mark(iv.id); return n + 1; } return n; });
    }); }, Promise.resolve(0));
  });
}
/* the award: patch BIDMULTI's addBid puts the sub on the job; then the 🏆 line goes in their thread */
(function hook(n){
  var C = W._gcSubConfirm; if (C && typeof C.addBid === 'function' && !C.addBid.__st) {
    var o = C.addBid; var f = function(pid, b){ return Promise.resolve(o.apply(this, arguments)).then(function(r){ try { var p = proj(pid), em = s(b && b.email).toLowerCase(), nm = s(b && (b.company || b.sub)).toLowerCase();
      var subs = arr(crm().subs).concat(arr(crm().vendors)), sub = subs.find(function(x){ return (em && s(x.email).toLowerCase() === em) || (nm && (s(x.name).toLowerCase() === nm || s(x.company).toLowerCase() === nm)); });
      if (p && sub && arr(p.subs).some(function(x){ return s(x.subId) === s(sub.id); })) award(pid, sub, b); } catch (e) {} return r; }); };
    f.__st = true; C.addBid = f; return; }
  if (n < 120) ST.call(W, function(){ hook(n + 1); }, 1000);
})(0);
ST.call(W, paySweep, 60000); SI.call(W, paySweep, 600000);
W._gcSubThread = { post: post, award: award, paySweep: paySweep };
})(window);
