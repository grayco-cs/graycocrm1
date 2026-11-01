/* __GC_PATCH_FIELDPORTAL2__ — GrayCo Field, part 2 (owner 10/30).
   1. 📞 Call / 💬 Text the customer on the Field job page: "📱 From your own phone" (tel: / sms:, as before) or
      "🏢 From the GrayCo number". A GrayCo-number CALL is a bridge (texts.js?fieldcall=1 → Twilio calls MY cell first,
      then connects the customer with the GrayCo number as caller ID — _lib/fieldcall.js); it is offered only when
      Twilio is set up and I have a cell on file, and never in data-entry mode (the reason shows instead). A GrayCo-number
      TEXT stays off: "Texting from the GrayCo number starts after A2P registration". The last choice is remembered per
      person (this phone) and offered first.
   2. 📄 Field Documents (the job page's Documents tile) lists ALL the job's papers, from the same places the customer
      portal and the desk use: the job's files (projectDocs — uploads, e-mail attachments filed to the job, signed copies,
      generated papers), proposals / contracts (estimates), signature requests (portal-sign), invoices, change orders,
      Google Doc / portal links and the job's own document set (📋 Documents for this Job, patch DOCLIB2). Grouped —
      Contracts & signatures · Invoices & COs · Closing · Files — newest first; each shows 👁 Customer sees it / 🔒 GrayCo
      only (the portal's own rule: patch Q / portal.js docShown) and opens on tap. "👁 What the customer sees" stays.
   No timers, no polling. API: window._gcFP2 */
(function(){
'use strict';
if (window.__GC_PATCH_FIELDPORTAL2__) return; window.__GC_PATCH_FIELDPORTAL2__ = true;
var W = window, D = document;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function num(v){ if (typeof v === 'number') return isFinite(v) ? v : 0; var n = parseFloat(s(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function usd(n){ return '$' + Math.round(num(n)).toLocaleString('en-US'); }
function d10(v){ var d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function tidy(v){ var d = d10(v); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(v); }
function C(){ return W._crm || {}; }
function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
function myEmail(){ try { if (W.__GC_AUTH__ && W.__GC_AUTH__.email) return low(W.__GC_AUTH__.email()); } catch (e) {} return low(lsGet('grayco_user')) || 'me'; }
function toast(t){
  var el = D.getElementById('gcfp-toast'); if (!el) { el = D.createElement('div'); el.id = 'gcfp-toast'; el.setAttribute('data-gc-keep', '1'); D.body.appendChild(el); }
  el.textContent = t; el.style.display = 'block'; clearTimeout(el.__t); el.__t = (W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout).call(W, function(){ el.style.display = 'none'; }, 4500);
}
function sheet(title, html){
  Array.prototype.forEach.call(D.querySelectorAll('.gcfp-sheet'), function(o){ o.remove(); });
  var o = D.createElement('div'); o.className = 'gcfp-sheet'; o.setAttribute('data-gc-keep', '1'); o.setAttribute('data-gcnav-ignore', '1');
  o.innerHTML = '<div class="in"><div class="hd"><b>' + esc(title) + '</b><button type="button" data-x aria-label="Close">✕</button></div><div class="bd">' + html + '</div></div>';
  o.addEventListener('click', function(e){ if (e.target === o || (e.target.closest && e.target.closest('[data-x]'))) o.remove(); });
  D.body.appendChild(o);
  return { o: o, body: o.querySelector('.bd') };
}
function projAll(){ return arr(C().projects); }
function proj(pid){ var p = projAll().filter(function(x){ return x && s(x.id) === s(pid); })[0]; if (!p && W._gcCurrentJob && s(W._gcCurrentJob.id) === s(pid)) p = W._gcCurrentJob; return p || null; }
function openJob(){ var ov = D.getElementById('_gcJobDash'); var pid = ov && ov.getAttribute('data-gcfp'); return (pid && proj(pid)) || W._gcCurrentJob || null; }
function custPhone(p){ return d10(p && (p.clientPhone || p.customerPhone || p.phone)); }
/* every number the page may show for this job's customer (the job page's Call / Text use job.phone or the customer record) */
function custPhones(p){
  var out = [p && p.clientPhone, p && p.customerPhone, p && p.phone].map(d10);
  try { var cn = low(p.client); arr(C().customers).forEach(function(c){ if (c && cn && (low(c.name) === cn || low(c.company) === cn)) out.push(d10(c.phone), d10(c.mobile)); }); } catch (e) {}
  return out.filter(function(x){ return x.length === 10; });
}
function fetchJ(url, opts){ return W.fetch(url, opts).then(function(r){ return r.text().then(function(t){ var o = {}; try { o = JSON.parse(t); } catch (e) { o = { error: t.slice(0, 200) }; } o.__status = r.status; return o; }); }, function(e){ return { error: 'No signal (' + s(e && e.message) + ')' }; }); }

/* ══ 1. 📞 / 💬 — own phone or the GrayCo number ══ */
var PK = { call: 'gc_callfrom:', text: 'gc_textfrom:' };
function pref(kind){ var v = lsGet(PK[kind] + myEmail()); return v === 'grayco' ? 'grayco' : v === 'own' ? 'own' : ''; }
function setPref(kind, v){ lsSet(PK[kind] + myEmail(), v); }
var CALLST = null;
function chooser(kind, p, href){
  var name = s(p.client || p.customerName) || 'the customer', ph = d10(href.replace(/^(tel|sms):/i, '').split(/[?&]/)[0]) || custPhone(p), last = pref(kind);
  var own = '<a class="gcfp-big" data-from="own" data-fp-own="1" href="' + esc(href) + '">📱 From your own phone' + (last === 'own' ? ' <span class="gcfp-last">last used</span>' : '') + '<small>' + (kind === 'call' ? 'Calls ' : 'Texts ') + esc(tidy(ph)) + ' from your cell — they see your number</small></a>';
  var gc = kind === 'call'
    ? '<button type="button" class="gcfp-big" data-from="grayco" disabled>🏢 From the GrayCo number' + (last === 'grayco' ? ' <span class="gcfp-last">last used</span>' : '') + '<small data-why>Checking…</small></button>'
    : '<button type="button" class="gcfp-big" data-from="grayco" disabled aria-disabled="true">🏢 From the GrayCo number<small>Texting from the GrayCo number starts after A2P registration.</small></button>';
  var sh = sheet((kind === 'call' ? '📞 Call ' : '💬 Text ') + name, last === 'grayco' ? gc + own : own + gc);
  sh.o.setAttribute('data-fpfrom', kind);
  var gb = sh.body.querySelector('[data-from="grayco"]');
  sh.body.querySelector('[data-from="own"]').addEventListener('click', function(){ setPref(kind, 'own'); (W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout).call(W, function(){ sh.o.remove(); }, 0); });
  if (kind !== 'call') return sh;
  var paint = function(st){
    var why = gb.querySelector('[data-why]');
    if (st && st.ok && !st.why) { gb.disabled = false; why.textContent = 'The GrayCo number calls your cell ' + s(st.myPhone) + ' first — answer, and ' + name + ' is connected and sees the GrayCo number.'; }
    else { gb.disabled = true; gb.setAttribute('aria-disabled', 'true'); why.textContent = s(st && (st.why || st.error)) || 'Calls from the GrayCo number are not available right now.'; }
  };
  if (CALLST && Date.now() - CALLST.at < 120e3) paint(CALLST.v);
  else fetchJ('/.netlify/functions/texts?fieldcall=1').then(function(v){ CALLST = { at: Date.now(), v: v }; if (D.body.contains(gb)) paint(v); });
  gb.addEventListener('click', function(){
    if (gb.disabled) return;
    gb.disabled = true; gb.firstChild.textContent = '🏢 Calling your phone…';
    setPref('call', 'grayco');
    fetchJ('/.netlify/functions/texts?fieldcall=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pid: s(p.id) }) }).then(function(r){
      if (r && r.ok) { sh.o.remove(); toast('📞 Calling your phone ' + s(r.calling) + ' — answer and you\'re connected to ' + name + ' (they see the GrayCo number).'); }
      else { gb.disabled = false; gb.firstChild.textContent = '🏢 From the GrayCo number'; toast('Not called: ' + s((r && r.error) || 'no answer from the server')); }
    });
  });
  return sh;
}
D.addEventListener('click', function(e){
  var a = e.target && e.target.closest && e.target.closest('a[href^="tel:"],a[href^="sms:"]'); if (!a || a.hasAttribute('data-fp-own')) return;
  if (!a.closest('#_gcJobDash')) return;
  var p = openJob(); if (!p) return;
  var href = a.getAttribute('href') || '', kind = /^tel:/i.test(href) ? 'call' : 'text', num10 = d10(href.replace(/^(tel|sms):/i, '').split(/[?&]/)[0]);
  if (!num10 || custPhones(p).indexOf(num10) < 0) return;   /* only the customer's number; other numbers dial as before */
  e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  chooser(kind, p, href);
}, true);

/* ══ 2. 📄 Field Documents: every paper on the job ══ */
/* the portal's own rule (netlify/functions/portal.js docShown / patch Q autoShown) */
var CUSTOMER_DOC = /proposal|contract|change.?order|\binvoice|warrant|welcome|faq|completion|certificate of (substantial )?completion|final inspection|sign.?off|lien|waiver|work auth|customer portal|closeout|receipt/i;
var INTERNAL_DOC = /\bsub(contract(or)?)?\b|subcontract|sub.?agreement|job sheet|w-?9|\bcoi\b|certificate of insurance|onboarding|\bbid|vendor|supplier|\bcost|budget|payroll|commission|internal|operations manual|takeoff|purchase order|timesheet|tax return/i;
function docShown(d){
  if (d.needsReview === true || d.deleted === true) return false;
  if (d.portalShare === true) return true; if (d.portalShare === false) return false;
  if (/companycam/i.test(s(d.cat) + s(d.source))) return false;
  var t = s(d.cat) + ' | ' + s(d.name) + ' | ' + s(d.kind);
  if (INTERNAL_DOC.test(t)) return false;
  return CUSTOMER_DOC.test(t);
}
var GROUPS = [['contracts', 'Contracts & signatures'], ['money', 'Invoices & COs'], ['closing', 'Closing'], ['files', 'Files']];
function groupOf(t){
  t = low(t);
  if (/lien|waiver|completion|warrant|close.?out|final inspection|sign.?off|certificate of (substantial )?completion|final walk/.test(t)) return 'closing';
  if (/invoice|change.?order|\bco\b|receipt|payment|draw/.test(t)) return 'money';
  if (/contract|proposal|estimate|agreement|signature|signed|work.?auth|\baob\b|authori[sz]ation|welcome|faq|scope of work/.test(t)) return 'contracts';
  return 'files';
}
function dateOf(){ for (var i = 0; i < arguments.length; i++) { var v = s(arguments[i]); if (v && !isNaN(Date.parse(v.length === 10 ? v + 'T12:00:00' : v))) return v; } return ''; }
var CACHE = { docs: null, est: null };
function idb(k){ try { return Promise.resolve(W.idbGet ? W.idbGet(k) : null).then(function(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return arr(v); }, function(){ return []; }); } catch (e) { return Promise.resolve([]); } }
function uniq(list){ var seen = {}, out = []; list.forEach(function(x){ if (!x) return; var k = s(x.id) || JSON.stringify([x.name, x.ref, x.uploadedAt]); if (seen[k]) return; seen[k] = 1; out.push(x); }); return out; }
function papers(p){
  var pid = s(p.id);
  return Promise.all([idb('projectDocs'), idb('estimates'),
    fetchJ('/.netlify/functions/portal-sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list', projectId: pid }) }).then(function(j){ return j && j.ok ? arr(j.items) : []; }),
    Promise.resolve(W._gcDocSet && W._gcDocSet.forJob ? W._gcDocSet.forJob(pid) : null).then(function(v){ return v; }, function(){ return null; })]).then(function(a){
    var out = [], on = function(x){ return x && x.deleted !== true && (s(x.pid) === pid || s(x.jobId) === pid || s(x.projectId) === pid); };
    /* the job's files: what the desk Documents tab and the portal read */
    var docs = uniq(arr(C().projectDocs).concat(arr(W._gcProjectDocs), a[0])).filter(on);
    docs.forEach(function(d){
      var t = [d.cat, d.name, d.kind].join(' '), mail = /mail|gmail|email/i.test(s(d.source) + s(d.cat));
      out.push({ k: 'doc', id: s(d.id), g: groupOf(t), t: s(d.name || d.fileName || 'Document'), sub: [mail ? '✉️ from e-mail' : '', s(d.cat), d.subName ? 'from ' + s(d.subName) : ''].filter(Boolean).join(' · '),
        at: dateOf(d.uploadedAt, d.uploaded, d.savedAt, d.updatedAt), shown: docShown(d), ref: s(d.ref), url: /^https:\/\//.test(s(d.url)) ? s(d.url) : '', data: /^data:/.test(s(d.data)) ? 'data' : '', d: d });
    });
    /* proposals / contracts (estimates on the job) */
    var ests = arr(W._gcEstimatesState).length ? arr(W._gcEstimatesState) : (arr(C().estimates).length ? arr(C().estimates) : a[1]);
    uniq(ests).filter(function(e){ return on(e) && e._isDraft !== true; }).forEach(function(e){
      var pdf = docs.filter(function(d){ return s(d.estimateId) === s(e.id); })[0];
      out.push({ k: 'est', id: s(e.id), g: 'contracts', t: s(e.name) || 'Proposal', sub: [/sign|approv|accept|won|contract/i.test(s(e.status)) ? 'Signed / contract' : s(e.status) || 'Proposal', num(e.totalCharge || e.total) ? usd(e.totalCharge || e.total) : ''].filter(Boolean).join(' · '),
        at: dateOf(e.sentDate, e.date, e.savedAt, e.updatedAt), shown: e.portalShare === true || /sent|sign|approv|accept|final|won|contract/i.test(s(e.status)), ref: pdf ? s(pdf.ref) : '', url: pdf && /^https:/.test(s(pdf.url)) ? s(pdf.url) : (/^https:\/\//.test(s(e.gdocUrl)) ? s(e.gdocUrl) : '') });
    });
    /* signature requests (the portal's ✍️) */
    a[2].forEach(function(r){
      if (!r || s(r.pid || pid) !== pid) return;
      out.push({ k: 'sign', id: s(r.id), g: /co|change/i.test(s(r.kind)) ? 'money' : 'contracts', t: '✍️ ' + s(r.title || 'Paper to sign'), sub: [s(r.status) || 'pending', r.amount ? usd(r.amount) : ''].filter(Boolean).join(' · '),
        at: dateOf(r.signedAt, r.updatedAt, r.createdAt), shown: /pending|sent|signed|viewed/i.test(s(r.status)), ref: s(r.docRef), url: /^https:\/\//.test(s(r.url)) ? s(r.url) : '' });
    });
    /* invoices and change orders */
    arr(C().invoices || C().invs).filter(function(iv){ return on(iv) && (iv.type === 'client' || !iv.type); }).forEach(function(iv){
      out.push({ k: 'inv', id: s(iv.id), g: 'money', t: 'Invoice ' + s(iv.invNum || iv.num || ''), sub: [iv.paid === true || /^paid$/i.test(s(iv.status)) ? 'Paid' : s(iv.status) || 'open', usd(iv.amt || iv.amount)].join(' · '),
        at: dateOf(iv.date, iv.sentDate, iv.savedAt), shown: iv.needsReview !== true && !/draft/i.test(s(iv.status)), ref: s((arr(iv.files)[0] || {}).ref) });
    });
    arr(C().changeOrders || C().cos).filter(on).forEach(function(c){
      out.push({ k: 'co', id: s(c.id), g: 'money', t: 'Change order — ' + s(c.desc || c.title || ''), sub: [s(c.status) || 'pending', usd(c.amt || c.amount)].join(' · '),
        at: dateOf(c.date, c.savedAt, c.updatedAt), shown: /approv|sign|accept/i.test(s(c.status)), ref: s((arr(c.files)[0] || {}).ref) });
    });
    /* Google Doc / portal links */
    arr(p.portalLinks).forEach(function(l){ if (l && /^https:\/\//.test(s(l.url))) out.push({ k: 'link', id: s(l.id || l.url), g: groupOf(s(l.title)), t: '🔗 ' + s(l.title || 'Link'), sub: 'Google Doc / link', at: dateOf(l.at), shown: l.hidden !== true, url: s(l.url) }); });
    if (/^https:\/\//.test(s(p.gdocUrl))) out.push({ k: 'link', id: 'gdoc', g: 'contracts', t: '🔗 Proposal (Google Doc)', sub: 'Google Doc', at: '', shown: true, url: s(p.gdocUrl) });
    /* the job's own document set (📋 Documents for this Job) — the papers the CRM makes for it */
    var set = a[3], lib = []; try { lib = arr(W._gcDocLib && W._gcDocLib.builtins && W._gcDocLib.builtins()); } catch (e) {}
    arr(set && set.ids).forEach(function(id){
      var tpl = lib.filter(function(x){ return x && (s(x.id) === s(id) || s(x.file) === s(id)); })[0]; if (!tpl) return;
      var made = docs.some(function(d){ return low(d.name).indexOf(low(tpl.name)) >= 0; }); if (made) return;   /* already a file above */
      out.push({ k: 'paper', id: s(id), g: groupOf(s(tpl.name) + ' ' + s(tpl.category)), t: '📋 ' + s(tpl.name), sub: (tpl.clientFacing ? 'Job paper — ' : 'Internal paper — ') + 'opens filled in for this job', at: '', shown: false, paper: true });
    });
    out.sort(function(x, y){ return (s(y.at) > s(x.at) ? 1 : s(y.at) < s(x.at) ? -1 : 0); });
    return out;
  });
}
function openItem(it, p){
  /* in the tap: a new tab first (iPhone), then its address */
  if (it.url) return;   /* a real link: the <a> does it */
  if (it.k === 'inv' && !it.ref && typeof W._gcInvoiceEditor === 'function') { W._gcInvoiceEditor(it.id); return; }
  if (it.k === 'paper' && W._gcDocLib && W._gcDocLib.open) { W._gcDocLib.open(it.id, s(p.id)); return; }
  if (it.ref && typeof W._gcFileUrl === 'function') {
    var w = W.open('', '_blank');
    Promise.resolve(W._gcFileUrl(it.ref)).then(function(u){ if (w && u) { try { w.opener = null; } catch (e) {} w.location.href = u; } else { if (w) w.close(); toast('That file could not be opened.'); } }, function(){ if (w) w.close(); toast('That file could not be opened.'); });
    return;
  }
  if (it.data && it.d) { var w2 = W.open(''); if (w2) { if (/image/.test(s(it.d.type))) w2.document.write('<img src="' + it.d.data + '" style="max-width:100%">'); else w2.location.href = it.d.data; } return; }
  if (it.k === 'est') { toast('This proposal has no PDF yet — open it from 📐 Estimates.'); return; }
  toast(it.t + ' — ' + it.sub);
}
function render(box, p, items){
  var by = {}; items.forEach(function(x){ (by[x.g] = by[x.g] || []).push(x); });
  var nShown = items.filter(function(x){ return x.shown; }).length;
  var h = '<div class="gcfp-dk">ALL PAPERS ON THIS JOB (' + items.length + ') <span>· 👁 ' + nShown + ' in the customer portal</span></div>';
  GROUPS.forEach(function(g){
    var l = by[g[0]] || []; if (!l.length) return;
    h += '<div class="gcfp-dg" data-g="' + g[0] + '"><div class="gcfp-dk">' + esc(g[1]) + ' (' + l.length + ')</div>' + l.map(function(x, i){
      var inner = '<span class="tx"><b>' + esc(x.t) + '</b><small>' + esc([x.sub, x.at ? s(x.at).slice(0, 10) : ''].filter(Boolean).join(' · ')) + '</small></span><span class="vis ' + (x.shown ? 'on' : '') + '">' + (x.shown ? '👁 Customer sees it' : (x.paper ? '📋 Not made yet' : '🔒 GrayCo only')) + '</span>';
      var attrs = ' class="gcfp-doc" data-k="' + x.k + '" data-id="' + esc(x.id) + '" data-shown="' + (x.shown ? 1 : 0) + '"';
      return x.url ? '<a' + attrs + ' href="' + esc(x.url) + '" target="_blank" rel="noopener">' + inner + '</a>' : '<button type="button"' + attrs + '>' + inner + '</button>';
    }).join('') + '</div>';
  });
  if (!items.length) h += '<div class="gcfp-mut" style="padding:12px 0">No papers on this job yet.</div>';
  box.innerHTML = h;
  box.__items = items;
}
function decorateDocs(job){
  var c = D.getElementById('_jdlCreate'); if (!c || !job) return false;
  var body = c.parentNode, ov = body && body.closest('._gcSheetOv'); if (!body || body.querySelector('.gcfp-docs')) return false;
  /* the old FILES list (it only read a list that is empty on a phone) → the full list */
  Array.prototype.slice.call(body.children).forEach(function(el){ if (/^FILES \(\d+\)$/.test(s(el.textContent)) || /^No files yet\.$/.test(s(el.textContent)) || (el.classList && el.classList.contains('_jdlDoc'))) el.remove(); });
  var box = D.createElement('div'); box.className = 'gcfp-docs'; box.innerHTML = '<div class="gcfp-mut">Loading every paper on this job…</div>';
  body.appendChild(box);
  if (ov) ov.classList.add('gcfp-docsov');
  box.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('.gcfp-doc'); if (!b || b.tagName === 'A') return;
    var it = arr(box.__items).filter(function(x){ return x.k === b.getAttribute('data-k') && x.id === b.getAttribute('data-id'); })[0]; if (it) openItem(it, job);
  });
  papers(job).then(function(items){ if (D.body.contains(box)) render(box, job, items); });
  return true;
}
function wrapDocs(){
  var f = W._gcJobDocsList; if (typeof f !== 'function' || f.__gcFP2) return;
  var w = function(job){ var r = f.apply(this, arguments); try { decorateDocs(job && job.id ? (proj(job.id) || job) : job); } catch (e) {} return r; };
  try { Object.keys(f).forEach(function(k){ if (!(k in w)) w[k] = f[k]; }); } catch (e) {}
  w.__gcFP2 = true; W._gcJobDocsList = w;
}

function css(){
  if (D.getElementById('gcfp2-css')) return;
  var st = D.createElement('style'); st.id = 'gcfp2-css';
  st.textContent = [
    '.gcfp-last{display:inline-block;margin-left:6px;font-size:11px;font-weight:800;background:#dcfce7;color:#166534;border-radius:999px;padding:1px 7px;vertical-align:middle}',
    '.gcfp-big[disabled]{opacity:.55;cursor:not-allowed}',
    '.gcfp-docs{margin-top:6px}.gcfp-dk{font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#8a5a00;margin:14px 0 8px}.gcfp-dk span{text-transform:none;letter-spacing:0;color:#4b5563;font-weight:700}',
    '.gcfp-doc{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;min-height:52px;margin:0 0 7px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;color:#111827;text-align:left;text-decoration:none;font:600 14px Inter,-apple-system,sans-serif;cursor:pointer;touch-action:manipulation}',
    '.gcfp-doc .tx{flex:1;min-width:0;overflow-wrap:anywhere}.gcfp-doc .tx small{display:block;color:#4b5563;font-weight:500;font-size:12px;margin-top:2px}',
    '.gcfp-doc .vis{flex:0 0 auto;font-size:11.5px;font-weight:800;color:#4b5563;max-width:96px;text-align:right}.gcfp-doc .vis.on{color:#166534}',
    '.gcfp-doc:active{transform:scale(.98);filter:brightness(.95)}',
    /* the Documents sheet: light in Field mode, its content clear of the bottom bar */
    'html._fieldmode ._gcSheetOv.gcfp-docsov{background:#f3f5f8!important}html._fieldmode ._gcSheetOv.gcfp-docsov>div:first-child{background:#fff!important;border-bottom:1px solid #e5e7eb}',
    'html._fieldmode ._gcSheetOv.gcfp-docsov>div:first-child div,html._fieldmode ._gcSheetOv.gcfp-docsov>div:first-child span{color:#111827!important}',
    'html._fieldmode ._gcSheetOv.gcfp-docsov>div:nth-child(2){padding-bottom:calc(124px + env(safe-area-inset-bottom,0px))!important}',
    'html._fieldmode ._gcSheetOv.gcfp-docsov div[style*="color:#f0c451"]{color:#8a5a00!important}'
  ].join('\n');
  (D.head || D.documentElement).appendChild(st);
}
css(); wrapDocs();
W._gcFP2 = { chooser: function(kind, pid){ var p = proj(pid); return p ? chooser(kind, p, (kind === 'call' ? 'tel:' : 'sms:') + custPhone(p)) : null; }, pref: pref, papers: function(pid){ var p = proj(pid); return p ? papers(p) : Promise.resolve([]); }, docShown: docShown, decorateDocs: decorateDocs };
try { console.log('[GC] 📱 Field part 2: Call / Text from my phone or the GrayCo number · every paper on the job (patch FIELDPORTAL2) — _gcFP2'); } catch (e) {}
})();
