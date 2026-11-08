<script id="gc-patch-bidgc">
/* __GC_PATCH_BIDGC__ — 🏗 BIDDING TO: one or many GCs on a commercial bid (owner 11/4: "on these bids the client would be
   the 1 or many gcs we are bidding for").
   • Job page (desk, Job tools): on a commercial job that is still a bid (or any job that already has GCs listed) a card
     "🏗 Bidding to" lists each GC — company, contact, e-mail / phone, the bid amount sent, the date sent, the result
     (pending / won / lost). ＋ Add GC, ✏️ edit, 🗑 remove (project.bidGCs).
   • 🏆 Won: that GC becomes the job's Client (the old Client text is kept as rfpTitle when it was not a GC), every other
     GC is marked lost, the status goes to "In Progress" only if the owner says so, and "Pick the PM now that it's won".
   • The RFP title sitting in Client ("RFP for the TMSP – CBIS TI phase"): the card shows "This Client looks like the RFP
     title — move it to the job description" (one tap; never silent).
   API: window._gcBidGC = { list(pid), add(pid, gc), set(pid, id, patch), remove(pid, id), won(pid, id), looksLikeRfp(text) } */
(function(W){
'use strict';
if (W.__GC_PATCH_BIDGC__) return; W.__GC_PATCH_BIDGC__ = true;
var D = W.document, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function money(n){ n = parseFloat(String(n == null ? '' : n).replace(/[$,\s]/g, '')); return isFinite(n) && n ? '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'; }
function uid(){ return 'GC' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function projs(){ return (W._crm && W._crm.projects) || []; }
function proj(pid){ return projs().find(function(p){ return p && s(p.id) === s(pid); }) || null; }
function isCommercial(p){ return !!p && (p.isCommercial === true || /commercial/i.test(s(p.type) + ' ' + s(p.jobType))); }
function isBid(p){ return !!p && !/progress|active|complete|won|signed|closed|lost|cancel|warrant|punch/i.test(s(p.status)); }
function looksLikeRfp(t){ t = s(t); return t.length > 18 && /\b(rfp|rfq|itb|ifb|bid|phase|project|renovation|addition|ti\b|tenant improvement|package|invitation|proposal)\b/i.test(t); }
function save(pid, fn){
  var ch = function(list){ var out = (list || []).map(function(p){ if (!p || s(p.id) !== s(pid)) return p; var n = fn(Object.assign({}, p)); n.updatedAt = new Date().toISOString(); return n; }); try { if (W._gcApplySync) W._gcApplySync('projects', out); } catch (e) {} return out; };
  if (W._setProjects) W._setProjects(ch); else if (W._gcApplySync) { var l = ch(projs()); if (W._crm) W._crm.projects = l; }
  ST.call(W, paint, 300);
}
function list(pid){ var p = proj(pid); return Array.isArray(p && p.bidGCs) ? p.bidGCs.filter(Boolean) : []; }
function add(pid, gc){ save(pid, function(p){ p.bidGCs = (Array.isArray(p.bidGCs) ? p.bidGCs : []).concat([Object.assign({ id: uid(), result: 'pending', addedAt: new Date().toISOString() }, gc)]); return p; }); }
function setOne(pid, id, patch){ save(pid, function(p){ p.bidGCs = (p.bidGCs || []).map(function(g){ return g && g.id === id ? Object.assign({}, g, patch) : g; }); return p; }); }
function remove(pid, id){ save(pid, function(p){ p.bidGCs = (p.bidGCs || []).filter(function(g){ return g && g.id !== id; }); return p; }); }
function won(pid, id){
  var g = list(pid).find(function(x){ return x.id === id; }); if (!g) return;
  var p0 = proj(pid), keepTitle = p0 && looksLikeRfp(p0.client) && !list(pid).some(function(x){ return s(x.name).toLowerCase() === s(p0.client).toLowerCase(); });
  var go = W.confirm('Mark ' + g.name + ' as the winner?\n\n• ' + g.name + ' becomes the Client' + (g.contact ? ' (contact ' + g.contact + ')' : '') + '\n• the other GCs are marked lost' + (keepTitle ? '\n• "' + s(p0.client) + '" is kept as the RFP title' : '') + '\n\nThen pick the PM now that it\'s won.');
  if (!go) return;
  save(pid, function(p){
    if (keepTitle) p.rfpTitle = s(p.client);
    p.client = g.name; if (g.email && !s(p.clientEmail)) p.clientEmail = g.email; if (g.phone && !s(p.clientPhone)) p.clientPhone = g.phone;
    p.gcContact = g.contact || p.gcContact || ''; p.hiredByGC = true; p.wonFromGC = g.id; p.wonAt = new Date().toISOString();
    p.bidGCs = (p.bidGCs || []).map(function(x){ return x.id === id ? Object.assign({}, x, { result: 'won', decidedAt: p.wonAt }) : (x.result === 'won' ? x : Object.assign({}, x, { result: 'lost', decidedAt: p.wonAt })); });
    return p;
  });
  try { if (W._gcToast) W._gcToast('🏆 ' + g.name + ' is the client. Now pick the PM (Edit Project → PM).'); else W.alert('🏆 ' + g.name + ' is the client now.\n\nPick the PM now that it\'s won: Edit Project → PM.'); } catch (e) {}
}
function moveRfp(pid){
  var p = proj(pid); if (!p) return;
  if (!W.confirm('Move "' + s(p.client) + '" out of Client?\n\nIt is kept as the job\'s RFP title (and added to the description). Client stays empty until you add the GC(s) below.')) return;
  save(pid, function(x){ x.rfpTitle = s(x.client); x.description = s(x.description) ? s(x.description) + '\n' + s(x.client) : s(x.client); x.client = ''; return x; });
}
function form(pid, g){
  g = g || {};
  var name = W.prompt('GC company name:', g.name || ''); if (name == null || !s(name)) return;
  var contact = W.prompt('Contact name (estimator / PM at the GC):', g.contact || ''); if (contact == null) return;
  var email = W.prompt('Contact e-mail:', g.email || ''); if (email == null) return;
  var phone = W.prompt('Contact phone:', g.phone || ''); if (phone == null) return;
  var amt = W.prompt('Bid amount sent to this GC ($, blank if not sent yet):', g.amount || ''); if (amt == null) return;
  var date = W.prompt('Date sent (YYYY-MM-DD, blank if not sent yet):', g.sentDate || ''); if (date == null) return;
  var o = { name: s(name), contact: s(contact), email: s(email), phone: s(phone), amount: s(amt).replace(/[$,\s]/g, ''), sentDate: s(date) };
  if (g.id) setOne(pid, g.id, o); else add(pid, o);
}
function css(){
  if (D.getElementById('gc-bidgc-css')) return;
  var st = D.createElement('style'); st.id = 'gc-bidgc-css';
  st.textContent = '.gc-bidgc{background:#fff;border:1px solid #e2e8f0;border-left:4px solid #7c3aed;border-radius:12px;padding:12px 14px;margin:0 0 10px;font:14px Inter,Arial,sans-serif;color:#0f172a}'
    + '.gc-bidgc h4{margin:0 0 6px;font-size:15px}.gc-bidgc .r{display:flex;flex-wrap:wrap;gap:8px;align-items:center;border-top:1px solid #f1f5f9;padding:8px 0}'
    + '.gc-bidgc .r b{min-width:160px}.gc-bidgc .m{color:#64748b;font-size:12.5px}.gc-bidgc button{border:1px solid #cbd5e1;background:#fff;border-radius:7px;padding:4px 10px;font:600 12.5px Inter,Arial,sans-serif;cursor:pointer}'
    + '.gc-bidgc button.p{background:#241968;color:#fff;border-color:#241968}.gc-bidgc .tag{font-size:11.5px;font-weight:700;padding:1px 8px;border-radius:99px}'
    + '.gc-bidgc .won{background:#dcfce7;color:#166534}.gc-bidgc .lost{background:#fee2e2;color:#991b1b}.gc-bidgc .pending{background:#fef9c3;color:#854d0e}'
    + '.gc-bidgc .warn{background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:8px 10px;margin:6px 0;font-size:13px}';
  D.head.appendChild(st);
}
function html(p){
  var L = list(p.id), h = '<h4>🏗 Bidding to' + (L.length ? ' (' + L.length + ' GC' + (L.length === 1 ? '' : 's') + ')' : '') + '</h4>';
  if (looksLikeRfp(p.client) && !L.some(function(x){ return s(x.name).toLowerCase() === s(p.client).toLowerCase(); }))
    h += '<div class="warn">The Client field reads <b>' + esc(p.client) + '</b> — that looks like the RFP title, not a GC. <button type="button" data-bg="rfp">Move it to the description</button></div>';
  if (!L.length) h += '<div class="m">On a bid, the client is the GC (or GCs) we are bidding to. Add each one with the amount sent to them.</div>';
  L.forEach(function(g){
    h += '<div class="r" data-id="' + esc(g.id) + '"><b>' + esc(g.name) + '</b><span class="tag ' + esc(g.result || 'pending') + '">' + esc(g.result || 'pending') + '</span>'
      + '<span class="m">' + esc([g.contact, g.email, g.phone].filter(Boolean).join(' · ')) + '</span>'
      + '<span class="m">Bid ' + money(g.amount) + (g.sentDate ? ' · sent ' + esc(g.sentDate) : ' · not sent yet') + '</span>'
      + '<span style="margin-left:auto;display:flex;gap:6px">' + (g.result !== 'won' ? '<button type="button" class="p" data-bg="won">🏆 Won</button>' : '') + (g.result === 'pending' ? '<button type="button" data-bg="lost">Lost</button>' : '<button type="button" data-bg="pending">Pending</button>')
      + '<button type="button" data-bg="edit">✏️</button><button type="button" data-bg="del" aria-label="Remove ' + esc(g.name) + '">🗑</button></span></div>';
  });
  h += '<div style="margin-top:6px"><button type="button" data-bg="add">＋ Add GC</button></div>';
  return h;
}
function findBack(){ var m = D.querySelector('main'); if (!m) return null; var bs = m.getElementsByTagName('button'); for (var i = 0; i < bs.length && i < 80; i++) if (/^\s*←\s*All Projects\s*$/.test(bs[i].textContent || '')) return bs[i]; return null; }
function paint(){
  try {
    if (D.hidden || D.documentElement.classList.contains('_fieldmode')) return;
    var op = W._gcOpenProject, p = op && op.id ? proj(op.id) : null, cur = D.getElementById('gc-bidgc');
    var want = p && ((isCommercial(p) && isBid(p)) || list(p.id).length);
    if (!want) { if (cur) cur.remove(); return; }
    var back = findBack(); if (!back || typeof W._gcJobBox !== 'function') return;
    var box = W._gcJobBox(back); if (!box) return;
    css();
    var sig = JSON.stringify([p.id, p.client, p.status, list(p.id)]);
    if (cur && cur.parentElement === box && cur.getAttribute('data-sig') === sig) return;
    if (!cur) { cur = D.createElement('div'); cur.id = 'gc-bidgc'; cur.className = 'gc-bidgc'; cur.setAttribute('data-gc-keep', '1'); }
    cur.setAttribute('data-pid', p.id); cur.setAttribute('data-sig', sig); cur.innerHTML = html(p);
    if (cur.parentElement !== box) box.insertBefore(cur, box.firstChild);
  } catch (e) {}
}
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest ? e.target.closest('#gc-bidgc [data-bg]') : null; if (!b) return;
  var card = D.getElementById('gc-bidgc'), pid = card && card.getAttribute('data-pid'), row = b.closest('[data-id]'), id = row && row.getAttribute('data-id'), a = b.getAttribute('data-bg');
  if (!pid) return;
  if (a === 'add') form(pid);
  else if (a === 'edit') form(pid, list(pid).find(function(x){ return x.id === id; }));
  else if (a === 'del') { if (W.confirm('Remove this GC from the bid?')) remove(pid, id); }
  else if (a === 'won') won(pid, id);
  else if (a === 'lost' || a === 'pending') setOne(pid, id, { result: a, decidedAt: new Date().toISOString() });
  else if (a === 'rfp') moveRfp(pid);
}, true);
SI.call(W, paint, 1200);
W._gcBidGC = { list: list, add: add, set: setOne, remove: remove, won: won, looksLikeRfp: looksLikeRfp, paint: paint };
})(window);
</script>
