/* ============================================================================
   GrayCo — SEVERAL CLIENT E-MAILS AND SEVERAL ACCOUNTS-PAYABLE E-MAILS PER CUSTOMER.   patch APEMAILS

   Owner (11/27): "make sure i can put client emails and on the account for a customer i can also put accounts
   [payable] sometimes its more than 1 so when i submit for invoice on my system i also email their accounts
   payable our invoices etc"

   · Customers → Edit Customer: "📧 E-mail for this customer" — Client e-mails and Accounts payable e-mails, each a
     list (＋ add, ✕ remove, a label per address such as "AP — Sarah" or "Head Start office"). The old single boxes
     stay: Email is the first client e-mail, Billing Email the first accounts-payable e-mail (old data shows as the
     first item). Stored on the customer: gcInfo.apEmails [{email,name}], clientEmails [{email,name}];
     gcInfo.removedEmails remembers what was taken off so it is never used again. A malformed address is marked
     in red under its box and never used.
   · ✏️ Edit Project: the account's lists, read-only, with "✏️ Edit on the customer" (a small light window that saves
     only those fields on the newest copy of the customer), plus "More client e-mails for this job" (moreClientEmails,
     saved with window._gcxPatchJob — a person's edit, SYNC-A).
   · Money mail (invoice, statement, past-due reminder, pay app) goes TO every accounts-payable address of the
     account with the client e-mail(s) in CC; no AP on file → the client e-mails, as before. Everyday mail is not
     touched. This re-addresses at compose time, the way patch SUBAP does (window._gcRouteBilling, every window.open
     / mailto / Gmail / _gcEmailChoice path), and the CRM invoice e-mail (_gcEmailInvoiceToClient) now really sends
     the CC. The server side (✅ Approvals invoice e-mails, past-due reminders, statements) uses the same rule,
     netlify/functions/_lib/apmail.js.
   No timers, nothing read or written in the background: everything here runs on a person's click or a send.
   ========================================================================== */
(function(){
'use strict';
if(window.__GC_APEMAILS__) return; window.__GC_APEMAILS__ = true;
var RE = /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i, MAX = 10;
var MONEY = /invoice|bill|billing|statement|past due|overdue|payment|remit|purchase order|\bp\.?o\b|payable|account balance|w-?9|1099|lien|pay app|draw request/i;
var MONEY_SUBJ = /invoice|statement|past due|overdue|payment reminder|pay app|balance due/i;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function ok(e){ return RE.test(s(e)); }
function arr(v){ if(typeof v === 'string'){ try{ v = JSON.parse(v); }catch(e){ return []; } } return Array.isArray(v) ? v : []; }
function esc(v){ return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function split(v){ var l = Array.isArray(v) ? v : s(v).split(/[,;]+/); return l.map(function(x){ return s(x && typeof x === 'object' ? x.email : x); }).filter(Boolean); }
function uniq(l){ var seen = {}; return l.map(low).filter(function(e){ if(!e || seen[e]) return false; seen[e] = 1; return true; }); }
function raw(v){ return v == null ? '' : String(v); }   /* as typed (a space being typed stays) */
function rowsOf(v){ return arr(v).map(function(x){ return x && typeof x === 'object' ? { email:raw(x.email), name:raw(x.name) } : { email:raw(x), name:'' }; }); }
function merged(single, list){
  var L = rowsOf(list), one = s(single);
  if(!one) return L.length && s(L[0].email) ? L.slice(1) : L;   /* the single field was emptied: its address is off the list */
  if(!L.length) return [{ email:one, name:'' }];
  if(low(L[0].email) === low(one)) return L;
  return [{ email:one, name:L[0].name }].concat(L.slice(1).filter(function(x){ return low(x.email) !== low(one); }));
}
function gi(c){ return (c && c.gcInfo && typeof c.gcInfo === 'object') ? c.gcInfo : {}; }
function removedOf(c){ var o = {}; arr(gi(c).removedEmails).concat(arr(c && c.removedEmails)).forEach(function(e){ if(s(e)) o[low(e)] = 1; }); return o; }
function clean(rows, gone, seen){ var out = []; rows.forEach(function(x){ var e = low(x.email); if(!ok(e) || gone[e] || seen[e]) return; seen[e] = 1; out.push({ email:e, name:s(x.name) }); }); return out; }
function apRows(c){ return c ? merged(gi(c).billingEmail, gi(c).apEmails) : []; }
function clientRows(c){ return c ? merged(c.email, (c.clientEmails != null ? c.clientEmails : gi(c).clientEmails)) : []; }
function jobRows(p){ if(!p) return []; return [{ email:s(p.clientEmail || p.customerEmail), name:'' }].concat(split(p.moreClientEmails).map(function(e){ return { email:e, name:'' }; })); }

/* ── where the records are (the live lists; the newer copy of a customer wins) ── */
function stamp(r){ return Date.parse((r && (r.updatedAt || r.savedAt)) || 0) || 0; }
function custs(){
  var by = {}, out = [];
  arr(window._graycoCustomers).concat(arr(window._crm && window._crm.customers)).forEach(function(c){
    if(!c || typeof c !== 'object' || c.deleted === true) return;
    var k = s(c.id) || ('n:' + low(c.name));
    if(by[k] == null){ by[k] = out.length; out.push(c); }
    else if(stamp(c) > stamp(out[by[k]])) out[by[k]] = c;
  });
  return out;
}
function jobs(){ return arr(window._crm && window._crm.projects); }
function jobById(pid){ if(!pid) return null; var k = s(pid); return jobs().filter(function(p){ return p && s(p.id) === k; })[0] || null; }
function custByName(nm){ nm = low(nm); if(!nm) return null; var L = custs(); return L.filter(function(c){ return low(c.name) === nm; })[0] || L.filter(function(c){ return low(c.company) === nm; })[0] || null; }
function custOfJob(p){
  if(!p) return null;
  var id = s(p.customerId);
  if(id){ var c = custs().filter(function(x){ return s(x.id) === id; })[0]; if(c) return c; }
  return custByName(p.client || p.customer || p.clientName);
}
function lists(p, cust){
  var c = cust || custOfJob(p), gone = removedOf(c), seen = {};
  var ap = clean(apRows(c), gone, seen).slice(0, MAX);
  var client = clean(clientRows(c).concat(jobRows(p)), gone, seen).slice(0, MAX);
  return { cust:c, ap:ap, client:client, removed:gone };
}
/* the same rule as netlify/functions/_lib/apmail.js billTo() */
function billTo(p, given, cust){
  var L = lists(p, cust), g = low(split(given)[0]);
  var known = {}; L.ap.concat(L.client).forEach(function(x){ known[x.email] = 1; });
  var out = { to:[], cc:[], ap:false, custom:false, blocked:false, why:'', account: L.cust ? s(L.cust.name || L.cust.company) : '' };
  if(g && ok(g) && !known[g] && !L.removed[g]){
    out.to = [g];
    if(L.ap.length || L.client.length){ out.custom = true; out.why = 'an address typed for this paper (not on the account)'; }
    else out.why = 'the only address on file';
    return out;
  }
  if(L.ap.length){
    out.to = L.ap.map(function(x){ return x.email; });
    out.cc = L.client.map(function(x){ return x.email; }).filter(function(e){ return out.to.indexOf(e) < 0; });
    out.ap = true; out.why = 'accounts payable on file' + (out.cc.length ? ', the client copied' : '');
    return out;
  }
  out.to = L.client.map(function(x){ return x.email; });
  out.why = out.to.length ? 'no accounts payable on file — the client' : '';
  if(!out.to.length && g && L.removed[g]){ out.blocked = true; out.why = g + ' was removed from ' + (out.account || 'the customer'); }
  return out;
}
/* the account an address belongs to: a customer's lists (or one it removed), else a job's client e-mail */
function findByEmail(e){
  e = low(e); if(!ok(e)) return null;
  var L = custs();
  for(var i = 0; i < L.length; i++){
    var c = L[i];
    var all = apRows(c).concat(clientRows(c)).map(function(x){ return low(x.email); });
    if(all.indexOf(e) >= 0 || removedOf(c)[e]){
      var nm = low(c.name || c.company), id = s(c.id);
      var j = jobs().filter(function(p){ return p && ((id && s(p.customerId) === id) || (nm && low(p.client || p.customer) === nm)); })[0] || null;
      return { cust:c, job:j && split(j.clientEmail).concat(split(j.moreClientEmails)).map(low).indexOf(e) >= 0 ? j : null };
    }
  }
  var J = jobs();
  for(var k = 0; k < J.length; k++){
    var p = J[k]; if(!p) continue;
    if(split(p.clientEmail || p.customerEmail).concat(split(p.moreClientEmails)).map(low).indexOf(e) >= 0) return { job:p, cust:custOfJob(p) };
  }
  return null;
}
/* compose time: where a money e-mail to `to` really goes (null = this block has nothing to say) */
function route(to, subject, body, pid, re){
  if(!(re || MONEY).test(String(subject || '') + ' ' + String(body || ''))) return null;
  var first = split(to)[0] || '', p = pid ? jobById(pid) : null, c = null;
  if(!p){ var hit = findByEmail(first); if(!hit) return null; p = hit.job; c = hit.cust; }
  if(!c) c = custOfJob(p);
  if(!p && !c) return null;
  var b = billTo(p, first, c);
  if(b.custom || (!b.to.length && !b.blocked)) return null;
  var t = b.to.join(','), cc = b.cc.join(',');
  var same = low(uniq(split(to)).join(',')) === low(t) && !cc;
  return { to:t, cc:cc, changed:!same, why:(b.account ? b.account + ': ' : '') + b.why, ap:b.ap, blocked:b.blocked };
}

/* ── 1. SUBAP's compose-time rule learns the customer lists (subs / vendors stay SUBAP's) ── */
var subapRoute = window._gcRouteBilling;
window._gcRouteBilling = function(to, subject, body, pid){
  try{ var r = route(to, subject, body, pid); if(r) return r; }catch(e){}
  return typeof subapRoute === 'function' ? subapRoute.apply(this, arguments) : { to:String(to || ''), cc:'', changed:false, why:'' };
};
/* the re-addressed link: no address twice, nobody both in To and CC */
function tidyUrl(u){
  var str = String(u || '');
  if(/^mailto:/i.test(str)){
    var m = /^mailto:([^?]*)(\?(.*))?$/i.exec(str); if(!m) return u;
    var to = uniq(split(decodeURIComponent(m[1] || ''))), q = new URLSearchParams(m[3] || '');
    var cc = uniq(split(q.get('cc') || '')).filter(function(e){ return to.indexOf(e) < 0; });
    if(cc.length) q.set('cc', cc.join(',')); else q.delete('cc');
    return 'mailto:' + encodeURIComponent(to.join(',')) + (q.toString() ? '?' + q.toString() : '');
  }
  if(/mail\.google\.com/i.test(str)){
    var x = new URL(str, location.href), t2 = uniq(split(x.searchParams.get('to') || ''));
    var c2 = uniq(split(x.searchParams.get('cc') || '')).filter(function(e){ return t2.indexOf(e) < 0; });
    x.searchParams.set('to', t2.join(','));
    if(c2.length) x.searchParams.set('cc', c2.join(',')); else x.searchParams.delete('cc');
    return x.toString();
  }
  return u;
}
var subapReaddress = window._gcReaddress;
if(typeof subapReaddress === 'function'){
  window._gcReaddress = function(url){
    var out = subapReaddress.apply(this, arguments);
    try{ if(out !== url) return tidyUrl(out); }catch(e){}
    return out;
  };
}
/* ── 2. the CRM invoice e-mail (Invoices → send): the job's account, its CC really sent ── */
(function wrapInvoiceMail(){
  var f = window._gcEmailInvoiceToClient;
  if(typeof f !== 'function' || f.__am) return;
  var w = function(inv, opts){
    try{
      if(inv && typeof inv === 'object'){
        var p = jobById(inv.pid), c = p ? custOfJob(p) : custByName(inv.client || inv.customer || inv.clientName);
        var given = inv.clientEmail || inv.email || (opts && opts.to) || '';
        var b = (p || c) ? billTo(p, given, c) : null;
        if(b && !b.custom && b.to.length){
          var t = b.to.join(', ');
          inv = Object.assign({}, inv, { clientEmail:t, email:t });
          opts = Object.assign({}, opts || {}, { to:t, cc:uniq(split(opts && opts.cc).concat(b.cc)).filter(function(e){ return b.to.indexOf(e) < 0; }).join(', ') });
        } else if(b && b.blocked){
          inv = Object.assign({}, inv, { clientEmail:'', email:'' }); opts = Object.assign({}, opts || {}, { to:'' });
        }
      }
    }catch(e){}
    return f.call(this, inv, opts);
  };
  w.__am = true; window._gcEmailInvoiceToClient = w;
})();
/* ── 3. "✉️ Send from your own e-mail" (AP2 _gcCompose): an invoice / statement / past-due note of a job ── */
(function wrapCompose(){
  var f = window._gcCompose;
  if(typeof f !== 'function' || f.__am) return;
  var w = function(o){
    try{
      if(o && typeof o === 'object' && MONEY_SUBJ.test(s(o.subject))){
        var r = route(o.to, o.subject, '', o.pid, MONEY_SUBJ);
        if(r && r.changed){
          var to = split(r.to).map(low), cc = uniq(split(o.cc).concat(split(r.cc))).filter(function(e){ return to.indexOf(e) < 0; });
          o = Object.assign({}, o, { to:to.join(', '), cc:cc.join(', ') });
        }
      }
    }catch(e){}
    return f.apply(this, [o].concat([].slice.call(arguments, 1)));
  };
  w.__am = true; window._gcCompose = w;
})();

/* ── 4. editing the lists (shared by the desk form and the small window) ── */
/* the rows as a person edits them: the old single field is row 0 */
function edRows(z, kind){
  var raw = kind === 'ap' ? gi(z).apEmails : (z && z.clientEmails != null ? z.clientEmails : gi(z).clientEmails);
  var single = kind === 'ap' ? gi(z).billingEmail : (z && z.email);
  if(Array.isArray(raw) && raw.length) return merged(single, raw);
  return s(single) ? [{ email:s(single), name:'' }] : [];
}
function setRows(z, kind, rows, gone){
  var g = Object.assign({}, gi(z)), o = Object.assign({}, z);
  rows = rows.map(function(r){ return { email:String(r.email == null ? '' : r.email), name:String(r.name == null ? '' : r.name) }; });
  if(kind === 'ap'){ g.apEmails = rows; g.billingEmail = rows[0] ? rows[0].email : ''; }
  else { o.clientEmails = rows; o.email = rows[0] ? rows[0].email : ''; }
  if(gone && ok(gone)){ var rm = arr(g.removedEmails).map(low); if(rm.indexOf(low(gone)) < 0) rm.push(low(gone)); g.removedEmails = rm.slice(-50); }
  o.gcInfo = g;
  return o;
}
function rowProblem(rows, i){
  var e = s(rows[i] && rows[i].email);
  if(!e) return '';
  if(!ok(e)) return 'Not an e-mail address — it will not be used.';
  for(var k = 0; k < i; k++) if(low(rows[k].email) === low(e)) return 'Already on this list.';
  return '';
}
/* the saved record: blank rows dropped, a re-added address no longer counts as removed, a real save stamp */
function norm(rec){
  try{
    var o = Object.assign({}, rec);
    ['client', 'ap'].forEach(function(kind){
      var seen = {};
      var rows = edRows(o, kind).map(function(r){ return { email:s(r.email), name:s(r.name) }; }).filter(function(r){ if(!r.email) return false; var k = low(r.email); if(seen[k]) return false; seen[k] = 1; return true; });
      o = setRows(o, kind, rows);
    });
    var on = {}; edRows(o, 'ap').concat(edRows(o, 'client')).forEach(function(r){ on[low(r.email)] = 1; });
    var g = Object.assign({}, gi(o)); g.removedEmails = arr(g.removedEmails).map(low).filter(function(e){ return e && !on[e]; });
    o.gcInfo = g; o.updatedAt = new Date().toISOString();
    return o;
  }catch(e){ return rec; }
}

/* ── 5. Customers → Edit Customer (desk): the two lists ── */
var C = { box:'#ffffff', line:'#d1d5db', soft:'#f9fafb', tx:'#111827', tx2:'#4b5563', ok:'#15803d', bad:'#b91c1c', ap:'#b45309' };
var INP = { padding:'7px 9px', border:'1px solid ' + C.line, borderRadius:6, fontSize:13, background:'#fff', color:C.tx, minWidth:0, boxSizing:'border-box' };
var BTN = { padding:'5px 10px', border:'1px solid ' + C.line, borderRadius:6, background:'#fff', color:C.tx, fontSize:12, fontWeight:600, cursor:'pointer' };
window._gcAMEditor = function(e, z, De){
  try{
    if(!e || !z || typeof De !== 'function') return null;
    function section(kind){
      var rows = edRows(z, kind), isAp = kind === 'ap';
      var head = e.jsxs('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8, flexWrap:'wrap', marginBottom:4 }, children:[
        e.jsx('b', { style:{ fontSize:12.5, color:isAp ? C.ap : C.tx }, children:isAp ? 'Accounts payable e-mails' : 'Client e-mails' }),
        e.jsx('span', { style:{ fontSize:11, color:C.tx2 }, children:isAp ? 'invoices, statements and past-due reminders go TO all of these' : 'everyday e-mail goes here; copied (CC) on invoices' })
      ]});
      var list = rows.map(function(r, i){
        var why = rowProblem(rows, i);
        return e.jsxs('div', { 'data-gc-amrow':kind, style:{ marginBottom:6 }, children:[
          e.jsxs('div', { style:{ display:'flex', gap:6, alignItems:'center' }, children:[
            e.jsx('input', { type:'email', 'data-gc-amemail':kind, style:Object.assign({}, INP, { flex:'1 1 55%', borderColor:why && !/Already/.test(why) ? C.bad : C.line }), value:r.email,
              placeholder:isAp ? 'ap@theircompany.com' : 'client@email.com',
              onChange:function(ev){ var v = ev.target.value; var nr = rows.slice(); nr[i] = { email:v, name:nr[i].name }; De(setRows(z, kind, nr)); } }),
            e.jsx('input', { 'data-gc-amname':kind, style:Object.assign({}, INP, { flex:'1 1 40%' }), value:r.name,
              placeholder:isAp ? 'label, e.g. AP — Sarah' : 'label, e.g. Head Start office',
              onChange:function(ev){ var v = ev.target.value; var nr = rows.slice(); nr[i] = { email:nr[i].email, name:v }; De(setRows(z, kind, nr)); } }),
            e.jsx('button', { type:'button', 'data-gc-amdel':kind, title:'Remove this address', style:Object.assign({}, BTN, { color:C.bad, padding:'5px 9px' }),
              onClick:function(){ var gone = rows[i].email; var nr = rows.filter(function(x, k){ return k !== i; }); De(setRows(z, kind, nr, gone)); }, children:'✕' })
          ]}),
          why ? e.jsx('div', { 'data-gc-ambad':kind, style:{ fontSize:11, color:/Already/.test(why) ? C.tx2 : C.bad, marginTop:2 }, children:why }) : null
        ]}, kind + i);
      });
      var add = e.jsx('button', { type:'button', 'data-gc-amadd':kind, style:BTN, onClick:function(){ De(setRows(z, kind, rows.concat([{ email:'', name:'' }]))); },
        children:isAp ? '＋ Add accounts payable e-mail' : '＋ Add client e-mail' });
      return e.jsxs('div', { 'data-gc-amsec':kind, style:{ marginTop:isAp ? 10 : 0 }, children:[head].concat(list.length ? list : [e.jsx('div', { style:{ fontSize:11.5, color:C.tx2, marginBottom:6 }, children:isAp ? 'None yet — invoices then go to the client e-mails.' : 'None yet.' }, 'none')], [add]) });
    }
    return e.jsxs('div', { 'data-gc-amed':'1', style:{ border:'1px solid ' + C.line, borderLeft:'3px solid ' + C.ok, borderRadius:8, padding:12, marginBottom:12, background:C.box }, children:[
      e.jsx('b', { style:{ fontSize:13, display:'block', marginBottom:8, color:C.tx }, children:'📧 E-mail for this customer' }),
      section('client'), section('ap')
    ]});
  }catch(err){ try{ console.warn('[GC] APEMAILS editor', err); }catch(_e){} return null; }
};
/* the old single boxes (Email, Billing Email) are row 0 of their list */
window._gcAMSet1 = function(z, kind, v){
  try{ var rows = edRows(z, kind); if(rows.length) rows[0] = { email:v, name:rows[0].name }; else rows = [{ email:v, name:'' }]; return setRows(z, kind, rows); }
  catch(e){ var o = Object.assign({}, z); if(kind === 'ap') o.gcInfo = Object.assign({}, gi(z), { billingEmail:v }); else o.email = v; return o; }
};
window._gcAMNorm = norm;
/* the in-memory lists other screens read (window._graycoCustomers / _crm.customers) get this record's e-mail fields at once */
window._gcAMLive = function(rec){
  try{
    if(!rec) return;
    var id = s(rec.id), nm = low(rec.name);
    var put = function(L){ return L.map(function(c){ return c && ((id && s(c.id) === id) || (!id && nm && low(c.name) === nm)) ? Object.assign({}, c, { email:rec.email, clientEmails:rec.clientEmails, gcInfo:Object.assign({}, gi(c), gi(rec)), updatedAt:rec.updatedAt || c.updatedAt }) : c; }); };
    if(Array.isArray(window._graycoCustomers)) window._graycoCustomers = put(window._graycoCustomers);
    if(window._crm && Array.isArray(window._crm.customers) && window._crm.customers !== window._graycoCustomers) window._crm.customers = put(window._crm.customers);
    else if(window._crm && Array.isArray(window._graycoCustomers)) window._crm.customers = window._graycoCustomers;
  }catch(e){}
};

/* ── 6. a customer's lists from a job: a small light window, saving only those fields on the newest copy ── */
function saveCust(base, w){
  var fields = { email:w.email, clientEmails:w.clientEmails, gcInfo:null };
  var at = new Date().toISOString(), id = s(base && base.id);
  function put(c){ return Object.assign({}, c, { email:fields.email, clientEmails:fields.clientEmails, gcInfo:Object.assign({}, gi(c), { apEmails:gi(w).apEmails, billingEmail:gi(w).billingEmail, removedEmails:gi(w).removedEmails }), updatedAt:at }); }
  var nm = low(base && (base.name || base.company));
  var hit = function(c){ return c && (id ? s(c.id) === id : low(c.name || c.company) === nm); };
  var fresh = null;
  if(!id){ id = 'CUS' + Date.now().toString(36); fresh = put({ id:id, name:s(base && base.name), phone:'', address:'', company:'', type:'commercial', notes:'', created:at.slice(0, 10), by:'' }); }
  var apply = function(prev){
    var L = Array.isArray(prev) ? prev : [];
    if(fresh && !L.some(hit)) return L.concat([fresh]);
    return L.map(function(c){ return hit(c) ? put(c) : c; });
  };
  var set = window._setCustomers || window.__gcSetCustomersNow;
  if(typeof set !== 'function') return false;
  set(apply);
  try{ if(Array.isArray(window._graycoCustomers)) window._graycoCustomers = apply(window._graycoCustomers); }catch(e){}
  try{ if(window._crm && Array.isArray(window._crm.customers) && window._crm.customers !== window._graycoCustomers) window._crm.customers = apply(window._crm.customers); }catch(e){}
  return true;
}
window._gcAMOpenCust = function(custOrName, onDone){
  var base = (custOrName && typeof custOrName === 'object') ? custOrName : (custByName(custOrName) || { name:s(custOrName) });
  if(base.id){ var nowC = custs().filter(function(c){ return s(c.id) === s(base.id); })[0]; if(nowC) base = nowC; }
  var w = { email:base.email || '', clientEmails:base.clientEmails, gcInfo:Object.assign({}, gi(base)) };
  var old = document.getElementById('_gcAmOv'); if(old) old.remove();
  var ov = document.createElement('div'); ov.id = '_gcAmOv';
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(17,24,39,.45);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,Arial,sans-serif';
  var card = document.createElement('div');
  card.style.cssText = 'background:#fff;color:#111827;border-radius:12px;width:min(620px,96vw);max-height:90vh;overflow:auto;padding:18px;box-sizing:border-box;box-shadow:0 20px 60px rgba(0,0,0,.25)';
  ov.appendChild(card); document.body.appendChild(ov);
  var IS = 'padding:7px 9px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;min-width:0;box-sizing:border-box;background:#fff;color:#111827';
  var BS = 'padding:6px 11px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#111827;font-size:13px;font-weight:600;cursor:pointer';
  function sec(kind){
    var rows = edRows(w, kind), isAp = kind === 'ap';
    return '<div data-k="' + kind + '" style="margin-top:' + (isAp ? 14 : 4) + 'px"><b style="font-size:13px;color:' + (isAp ? '#b45309' : '#111827') + '">' + (isAp ? 'Accounts payable e-mails' : 'Client e-mails') + '</b>' +
      '<div style="font-size:11.5px;color:#4b5563;margin:2px 0 6px">' + (isAp ? 'invoices, statements and past-due reminders go TO all of these' : 'everyday e-mail goes here; copied (CC) on invoices') + '</div>' +
      (rows.length ? rows.map(function(r, i){ var why = rowProblem(rows, i);
        return '<div style="margin-bottom:6px"><div style="display:flex;gap:6px"><input data-am="e" data-k="' + kind + '" data-i="' + i + '" type="email" value="' + esc(r.email) + '" placeholder="' + (isAp ? 'ap@theircompany.com' : 'client@email.com') + '" style="' + IS + ';flex:1 1 55%' + (why && !/Already/.test(why) ? ';border-color:#b91c1c' : '') + '">' +
          '<input data-am="n" data-k="' + kind + '" data-i="' + i + '" value="' + esc(r.name) + '" placeholder="label" style="' + IS + ';flex:1 1 40%">' +
          '<button type="button" data-am="x" data-k="' + kind + '" data-i="' + i + '" title="Remove" style="' + BS + ';color:#b91c1c">✕</button></div>' +
          '<div data-am="why" data-k="' + kind + '" data-i="' + i + '" style="font-size:11px;color:#b91c1c;margin-top:2px">' + esc(why) + '</div></div>'; }).join('')
        : '<div style="font-size:12px;color:#4b5563;margin-bottom:6px">' + (isAp ? 'None yet — invoices then go to the client e-mails.' : 'None yet.') + '</div>') +
      '<button type="button" data-am="add" data-k="' + kind + '" style="' + BS + '">＋ Add ' + (isAp ? 'accounts payable' : 'client') + ' e-mail</button></div>';
  }
  function draw(){
    card.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:16px">📧 ' + esc(base.name || base.company || 'Customer') + ' — e-mail</b>' +
      '<button type="button" data-am="close" style="' + BS + '">✕</button></div>' +
      (base.id ? '' : '<div style="font-size:12px;color:#92400e;margin-top:6px">Not on the Customers list yet — saving adds it.</div>') +
      sec('client') + sec('ap') +
      '<div data-am="msg" style="font-size:12px;color:#b91c1c;margin-top:10px"></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px"><button type="button" data-am="save" style="' + BS + ';background:#15803d;color:#fff;border-color:#15803d;flex:1">💾 Save</button>' +
      '<button type="button" data-am="close" style="' + BS + '">Cancel</button></div>';
  }
  function close(){ try{ ov.remove(); }catch(e){} if(typeof onDone === 'function'){ try{ onDone(); }catch(e){} } }
  card.addEventListener('input', function(ev){
    var t = ev.target, k = t.getAttribute('data-k'), i = +t.getAttribute('data-i'), a = t.getAttribute('data-am');
    if(!k || (a !== 'e' && a !== 'n')) return;
    var rows = edRows(w, k); if(!rows[i]) return;
    rows[i] = a === 'e' ? { email:t.value, name:rows[i].name } : { email:rows[i].email, name:t.value };
    w = setRows(w, k, rows);
    var msg = card.querySelector('[data-am="why"][data-k="' + k + '"][data-i="' + i + '"]'), why = rowProblem(rows, i);
    if(msg) msg.textContent = why;
    if(a === 'e') t.style.borderColor = why && !/Already/.test(why) ? '#b91c1c' : '#d1d5db';
  });
  card.addEventListener('click', function(ev){
    var b = ev.target.closest && ev.target.closest('button[data-am]'); if(!b) return;
    var a = b.getAttribute('data-am'), k = b.getAttribute('data-k'), i = +b.getAttribute('data-i');
    if(a === 'close'){ close(); return; }
    if(a === 'add'){ w = setRows(w, k, edRows(w, k).concat([{ email:'', name:'' }])); draw(); var ins = card.querySelectorAll('input[data-am="e"][data-k="' + k + '"]'); if(ins.length) ins[ins.length - 1].focus(); return; }
    if(a === 'x'){ var rows = edRows(w, k), gone = rows[i] && rows[i].email; w = setRows(w, k, rows.filter(function(x, n){ return n !== i; }), gone); draw(); return; }
    if(a === 'save'){
      var done = saveCust(base, norm(w));
      if(!done){ var m = card.querySelector('[data-am="msg"]'); if(m) m.textContent = 'Could not save here — open Customers and edit this customer.'; return; }
      close();
    }
  });
  ov.addEventListener('click', function(ev){ if(ev.target === ov) close(); });
  draw();
  return ov;
};

/* ── 7. ✏️ Edit Project: the account's lists (read-only) + more client e-mails for this job ── */
window._gcAMJobPanel = function(e, re, z, De){
  try{
    if(!e || !z) return null;
    var c = custOfJob(z), L = lists(z, c), b = billTo(z, z.clientEmail, c), name = s((c && (c.name || c.company)) || z.client);
    var extra = uniq(split(z.moreClientEmails));
    var chip = function(x, k, col){ return e.jsx('span', { 'data-gc-amchip':k, style:{ display:'inline-block', padding:'2px 8px', margin:'2px 4px 2px 0', borderRadius:10, fontSize:11.5, background:'#f3f4f6', color:col || C.tx, border:'1px solid #e5e7eb' }, children:x.email + (x.name ? ' — ' + x.name : '') }, k + x.email); };
    var acct = function(kind){
      var l = kind === 'ap' ? L.ap : clean(clientRows(c), L.removed, {});
      return e.jsxs('div', { style:{ fontSize:12, margin:'3px 0' }, children:[
        e.jsx('b', { style:{ color:kind === 'ap' ? C.ap : C.tx }, children:(kind === 'ap' ? 'Accounts payable: ' : 'Client e-mails: ') }),
        l.length ? l.map(function(x){ return chip(x, kind); }) : e.jsx('span', { style:{ color:C.tx2 }, children:'none on the customer' })
      ]});
    };
    var saveExtra = function(list){
      var str = uniq(list).join(', ');
      De(function(St){ return Object.assign({}, St, { moreClientEmails:str }); });
      try{ if(z.id && typeof window._gcxPatchJob === 'function') window._gcxPatchJob(z.id, { moreClientEmails:str }, 'job client e-mails'); }catch(err){}
    };
    var addBox = function(ev){
      var box = ev.currentTarget.parentNode, inp = box.querySelector('input[data-gc-amjobnew]'), msg = box.parentNode.querySelector('[data-gc-amjobwhy]');
      var v = low(inp && inp.value);
      var why = !v ? 'Type an e-mail address first.' : (!ok(v) ? 'Not an e-mail address.' : (extra.indexOf(v) >= 0 || L.client.some(function(x){ return x.email === v; }) ? 'Already gets this job’s e-mail.' : ''));
      if(msg) msg.textContent = why;
      if(why) return;
      if(inp) inp.value = '';
      saveExtra(extra.concat([v]));
    };
    var sendLine = b.ap ? ('Invoices, statements, past-due reminders → TO ' + b.to.join(', ') + (b.cc.length ? ' · CC ' + b.cc.join(', ') : ''))
      : (b.to.length ? 'No accounts payable on file — invoices go to ' + b.to.join(', ') : 'No e-mail on file for invoices yet.');
    return e.jsxs('div', { 'data-gc-amjob':'1', style:{ gridColumn:'1 / -1', border:'1px solid ' + C.line, borderLeft:'3px solid ' + C.ok, borderRadius:8, padding:10, background:C.soft }, children:[
      e.jsxs('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap' }, children:[
        e.jsx('b', { style:{ fontSize:12.5, color:C.tx }, children:'📧 Who gets this job’s e-mail' + (name ? ' — ' + name : '') }),
        name ? e.jsx('button', { type:'button', 'data-gc-amedit':'1', style:BTN, onClick:function(){ window._gcAMOpenCust(c || name, function(){ try{ De(function(St){ return Object.assign({}, St); }); }catch(err){} }); }, children:c ? '✏️ Edit on the customer' : '＋ Add accounts payable for ' + name }) : null
      ]}),
      e.jsx('div', { 'data-gc-amsend':'1', style:{ fontSize:11.5, color:b.ap ? C.ap : C.tx2, margin:'4px 0' }, children:sendLine }),
      acct('client'), acct('ap'),
      e.jsxs('div', { style:{ fontSize:12, marginTop:6 }, children:[
        e.jsx('b', { children:'More client e-mails for this job only: ' }),
        extra.length ? extra.map(function(x){ return e.jsxs('span', { 'data-gc-amextra':'1', style:{ display:'inline-block', padding:'2px 4px 2px 8px', margin:'2px 4px 2px 0', borderRadius:10, fontSize:11.5, background:'#fff', border:'1px solid #e5e7eb' }, children:[
          x, e.jsx('button', { type:'button', title:'Remove', 'data-gc-amextradel':x, style:{ border:'none', background:'none', color:C.bad, cursor:'pointer', fontSize:12, padding:'0 4px' }, onClick:function(){ saveExtra(extra.filter(function(y){ return y !== x; })); }, children:'✕' })
        ]}, 'x' + x); }) : e.jsx('span', { style:{ color:C.tx2 }, children:'none' })
      ]}),
      e.jsxs('div', { children:[
        e.jsxs('div', { style:{ display:'flex', gap:6, marginTop:4, maxWidth:460 }, children:[
          e.jsx('input', { type:'email', 'data-gc-amjobnew':'1', placeholder:'another client e-mail for this job', style:Object.assign({}, INP, { flex:1 }),
            onKeyDown:function(ev){ if(ev.key === 'Enter'){ ev.preventDefault(); var bt = ev.currentTarget.parentNode.querySelector('button'); if(bt) bt.click(); } } }),
          e.jsx('button', { type:'button', 'data-gc-amjobadd':'1', style:BTN, onClick:addBox, children:'＋ Add' })
        ]}),
        e.jsx('div', { 'data-gc-amjobwhy':'1', style:{ fontSize:11, color:C.bad, marginTop:2 } })
      ]})
    ]});
  }catch(err){ try{ console.warn('[GC] APEMAILS job panel', err); }catch(_e){} return null; }
};

window._gcAcctMail = { ok:ok, split:split, lists:lists, billTo:billTo, route:route, custOfJob:custOfJob, findByEmail:findByEmail, norm:norm, edRows:edRows, setRows:setRows };
try{ console.log('[GC] APEMAILS: several client and accounts-payable e-mails per customer; money mail TO accounts payable, the client in CC (_gcAcctMail).'); }catch(e){}
})();
