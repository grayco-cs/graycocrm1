<script>/*__GC_PATCH_DOCAUTO__ (owner 11/9: "all have docusign — most documents are without approvals, just automatic documents by job type")
  (11/9 later: "i barely want 3 or 4" — at most 4 go by themselves: the work authorization, Direction to Pay, the one disclosure;
  the job's other customer papers are under "More papers" with ✍️ Send to sign, no approval.)
  The job's own customer papers — the ones its document set picks by job type and by the words on the job (📋 Documents for this
  Job, DOCKEYS / RESTODOCS / HAZARDTAG) — go into the customer's portal BY THEMSELVES, each one to e-sign (✍️ Papers to sign:
  E-SIGN consent, typed + drawn signature, signed PDF copy to the customer and the PM), with NO approval, and ONE e-mail from the PM.
  · Which papers: customer-facing library papers only. Proposals, contracts, change orders, invoices, lien / demand notices and
    promotions are never sent this way (they keep their own flows and approvals). A paper the PM unticks is never sent.
  · Which jobs: active jobs (not a lead / bid, not lost, not finished) started from START on — older jobs only when someone taps
    "✍️ Put the papers in the portal" on the job's card. Data-entry mode (⏸) sends nothing.
  · The paper is made into a PDF with the GrayCo letterhead (logo) and stored in the private file storage; the request is idempotent
    on the server (one per job + paper), so two computers running this never send twice.
  Card on every job page: "✍️ Customer papers" — each paper: in the portal / signed ✓ / not sent yet. API: window._gcDocAuto */
(function(W){
'use strict';
var D = W.document, FN = '/.netlify/functions/portal-sign', START = '2026-11-09';
var NEVER = /contract|change.?order|proposal|estimate|invoice|demand|lien|schedule of values|payment terms|coupon|giveaway|referral|promo/i;
var NOT_ACTIVE = /^(bidding|quoted|submitted|proposal|estimate sent|estimating|estimate|lead|pending|negotiat\w*|sent|new|)$|lost|cancel|dead|complete|closed|done|finished|paid in full|history|archiv/i;
function s(v){ return v == null ? '' : String(v); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function proj(pid){ return ((W._crm && W._crm.projects) || []).find(function(x){ return x && s(x.id) === s(pid); }) || null; }
function paused(){ try { var st = W._gcPause && W._gcPause.state(); return !!(st && st.paused); } catch (e) { return false; } }
function call(body){ return W.fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function(r){ return r.json().catch(function(){ return {}; }); }, function(){ return { ok: false, error: 'No connection.' }; }); }
function active(p){ return !!p && p.deleted !== true && !NOT_ACTIVE.test(s(p.status).trim()); }
function started(p){ var d = s(p.createdAt || p.created || p.startDate || p.launchedAt).slice(0, 10); return !!d && d >= START; }
function lib(){ return W._gcDocLib || null; }
function byId(id){ var L = lib(); return L ? (L.builtins() || []).find(function(b){ return b && b.id === id; }) : null; }
/* owner 11/9: "i barely want 3 or 4" — only these go by themselves, in this order, at most MAX:
   the situation's work authorization (or the general one), Direction to Pay, then the one disclosure the job needs. */
var MAX = 4;
var AUTH = ['gcb_water_emergency_auth', 'gcb_fire_work_auth', 'gcb_board_up_auth', 'gcb_storm_inspection_auth'], GEN = 'gcb_work_auth';
var AUTO = ['gcb_direction_to_pay', 'gcb_sewage_notice', 'gcb_mold', 'gcb_lead_01', 'gcb_lead_02', 'gcb_asb_01', 'gcb_roof_preinstall'];
function rank(ids){
  var out = [], has = function(id){ return ids.indexOf(id) > -1; };
  var auth = AUTH.filter(has); if (auth.length) out.push(auth[0]); else if (has(GEN)) out.push(GEN);
  AUTO.filter(has).forEach(function(id){ if (out.indexOf(id) < 0) out.push(id); });
  return out.slice(0, MAX);
}
function setOf(pid){ if (!W._gcDocSet || !lib()) return Promise.resolve([]); return Promise.resolve(W._gcDocSet.forJob(pid)).then(function(set){ return (set && set.ids) || []; }, function(){ return []; }); }
/* the job's papers that go by themselves (3 or 4) */
function papers(pid){ return setOf(pid).then(function(ids){ return rank(ids).map(byId).filter(function(b){ return b && b.clientFacing; }); }); }
/* the job's other customer papers: sent by a person with one tap (✍️ Send) — end-of-job papers, notices */
function others(pid){ return setOf(pid).then(function(ids){ var a = rank(ids); return ids.filter(function(id){ return a.indexOf(id) < 0; }).map(byId).filter(function(b){ return b && b.clientFacing && !NEVER.test(b.name + ' ' + b.id + ' ' + (b.category || '')); }); }); }
function loadPdfLib(){ if (W.html2pdf) return Promise.resolve(true); return new Promise(function(res){ var x = D.createElement('script'); x.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'; x.onload = function(){ res(!!W.html2pdf); }; x.onerror = function(){ res(false); }; D.head.appendChild(x); }); }
/* EPAPAM: Lead 01 goes with the EPA "Renovate Right" booklet stapled on (pdf-lib); if that fails, the form alone */
async function withPamphlet(blob){
  try {
    if (!W.PDFLib) await new Promise(function(res, rej){ var x = D.createElement('script'); x.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'; x.onload = res; x.onerror = rej; D.head.appendChild(x); });
    var P = W.PDFLib.PDFDocument, out = await P.load(await blob.arrayBuffer()), pam = await P.load(await (await W.fetch('/epa-renovate-right.pdf')).arrayBuffer());
    (await out.copyPages(pam, pam.getPageIndices())).forEach(function(pg){ out.addPage(pg); });
    return new Blob([await out.save()], { type: 'application/pdf' });
  } catch (e) { return blob; }
}
async function fileOf(r, name){
  var safe = name.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 100);
  try {
    if (await loadPdfLib()) {
      var box = D.createElement('div'); box.id = 'gcda-hold'; box.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff';
      box.innerHTML = W._gcPdfHolderHtml ? W._gcPdfHolderHtml(r.page, '#gcda-hold') : r.body; D.body.appendChild(box);
      try { var blob = await W.html2pdf().set({ margin: 10, image: { type: 'jpeg', quality: 0.92 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'letter' } }).from(box).outputPdf('blob');
        if (blob && blob.size > 500) { if (r.t && r.t.id === 'gcb_lead_01') blob = await withPamphlet(blob); return new File([blob], safe + '.pdf', { type: 'application/pdf' }); } } finally { box.remove(); }
    }
  } catch (e) {}
  return new File([r.page], safe + '.html', { type: 'text/html' });
}
var BUSY = {};
/* send the job's papers that are not in its portal yet. opts.force: an older job (a person tapped the button) */
async function run(pid, opts){
  opts = opts || {}; var p = proj(pid);
  if (!p || BUSY[pid]) return { ok: false, why: 'busy' };
  if (paused()) return { ok: false, why: 'paused' };
  if (!active(p)) return { ok: false, why: 'not an active job' };
  if (!opts.force && !started(p) && !(p.docAuto && p.docAuto.on)) return { ok: false, why: 'older job' };
  if (typeof W._gcStoreFile !== 'function') return { ok: false, why: 'storage' };
  BUSY[pid] = 1;
  try {
    var list = opts.ids ? opts.ids.map(byId).filter(function(b){ return b && b.clientFacing && !NEVER.test(b.name + ' ' + b.id + ' ' + (b.category || '')); }) : await papers(pid), sent = (p.docAuto && p.docAuto.sent) || {};
    var todo = list.filter(function(b){ return !sent[b.id]; }).slice(0, opts.ids ? 10 : MAX);
    if (!todo.length) return { ok: true, made: 0 };
    var items = [];
    for (var i = 0; i < todo.length; i++) {
      var r = await lib().render(todo[i].id, pid); if (!r || !r.page) continue;
      var f = await fileOf(r, r.t.name + ' — ' + (p.name || ''));
      var meta = await W._gcStoreFile(f, { kind: 'doc', pid: pid, name: f.name }); if (!meta || !meta.ref) continue;
      items.push({ refId: 'dl_' + todo[i].id.replace(/[^A-Za-z0-9_.:-]/g, ''), title: r.t.name, docRef: meta.ref, docName: f.name, _id: todo[i].id });
    }
    if (!items.length) return { ok: false, why: 'nothing made' };
    var j = await call({ action: 'request-many', projectId: String(pid), items: items.map(function(x){ return { refId: x.refId, title: x.title, docRef: x.docRef, docName: x.docName }; }) });
    if (!j || !j.ok) return { ok: false, why: (j && j.error) || 'server' };
    var now = new Date().toISOString();
    var fx = function(L){ return (L || []).map(function(q){ if (!q || s(q.id) !== s(pid)) return q; var n = Object.assign({}, q), da = Object.assign({}, q.docAuto || {}), st = Object.assign({}, da.sent || {});
      items.forEach(function(x){ st[x._id] = now; }); da.sent = st; if (opts.force && !opts.ids) da.on = true; da.at = now; n.docAuto = da; n.updatedAt = now; return n; }); };
    if (W._setProjects) W._setProjects(fx); else if (W._crm) W._crm.projects = fx(W._crm.projects);
    try { if (W._gcApplySync && W._crm) W._gcApplySync('projects', W._crm.projects); } catch (e) {}
    return { ok: true, made: j.made || 0, mailed: !!j.mailed, noEmail: !!j.noEmail };
  } finally { delete BUSY[pid]; }
}
/* in the background: active jobs started from START on, a few at a time */
var LAST = 0;
function sweep(){
  if (Date.now() - LAST < 10 * 60000 || paused() || D.hidden) return; LAST = Date.now();
  try { if (!(W.__GC_AUTH__ && W.__GC_AUTH__.email())) return; } catch (e) { return; }
  var L = ((W._crm && W._crm.projects) || []).filter(function(p){ return active(p) && (started(p) || (p.docAuto && p.docAuto.on)); }).slice(0, 40), i = 0;
  (function next(){ if (i >= L.length) return; var p = L[i++]; run(p.id, {}).then(function(){ setTimeout(next, 1500); }, function(){ setTimeout(next, 1500); }); })();
}
/* ── the card on the job page ── */
var LISTS = {};
function status(pid){ return call({ action: 'list', projectId: String(pid) }).then(function(j){ LISTS[pid] = { at: Date.now(), items: (j && j.items) || [] }; paint(true); }); }
function findBack(){ var m = D.querySelector('main'); if (!m) return null; var bs = m.getElementsByTagName('button'); for (var i = 0; i < bs.length && i < 80; i++) if (/^\s*←\s*All Projects\s*$/.test(bs[i].textContent || '')) return bs[i]; return null; }
var PAPERS = {};
function paint(force){
  try {
    if (D.hidden || D.documentElement.classList.contains('_fieldmode')) return;
    var op = W._gcOpenProject, p = op && op.id ? proj(op.id) : null, cur = D.getElementById('gc-da');
    if (!p || !active(p)) { if (cur) cur.remove(); return; }
    var back = findBack(); if (!back || typeof W._gcJobBox !== 'function') return;
    var box = W._gcJobBox(back); if (!box) return;
    if (!PAPERS[p.id] || Date.now() - PAPERS[p.id].at > 60000) { PAPERS[p.id] = { at: Date.now(), list: PAPERS[p.id] ? PAPERS[p.id].list : null, more: PAPERS[p.id] ? PAPERS[p.id].more : [] }; papers(p.id).then(function(l){ PAPERS[p.id].list = l; return others(p.id); }).then(function(m){ PAPERS[p.id].more = m || []; paint(true); }); }
    if (!LISTS[p.id] || Date.now() - LISTS[p.id].at > 120000) { LISTS[p.id] = LISTS[p.id] || { at: 0, items: [] }; LISTS[p.id].at = Date.now(); status(p.id); }
    var list = PAPERS[p.id].list || [], more = PAPERS[p.id].more || [], reqs = LISTS[p.id].items || [], sent = (p.docAuto && p.docAuto.sent) || {};
    var sig = JSON.stringify([p.id, list.map(function(b){ return b.id; }), more.map(function(b){ return b.id; }), reqs.map(function(r){ return r.id + r.status + r.inPortal; }), sent]);
    if (!force && cur && cur.parentElement === box && cur.getAttribute('data-sig') === sig) return;
    if (!cur) { cur = D.createElement('div'); cur.id = 'gc-da'; cur.setAttribute('data-gc-keep', '1'); cur.style.cssText = 'background:#fff;border:1px solid #e2e8f0;border-left:4px solid #D4A017;border-radius:12px;padding:12px 14px;margin:0 0 10px;font:14px Inter,Arial,sans-serif;color:#0f172a'; }
    cur.setAttribute('data-pid', p.id); cur.setAttribute('data-sig', sig);
    var rq = function(b){ return reqs.find(function(r){ return r.kind === 'doc' && s(r.refId) === 'dl_' + b.id && r.status !== 'void'; }); };
    var waiting = list.filter(function(b){ return !rq(b); }).length, signed = list.filter(function(b){ var r = rq(b); return r && r.status === 'signed'; }).length;
    var h = '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><b style="font-size:15px">✍️ Customer papers · ' + signed + '/' + list.length + ' signed</b>' +
      (waiting ? '<button type="button" data-da-go style="border:0;background:#0F1D2F;color:#fff;border-radius:8px;padding:8px 12px;font:700 13px Inter,Arial,sans-serif;min-height:40px;cursor:pointer">✍️ Put ' + waiting + ' paper' + (waiting === 1 ? '' : 's') + ' in the portal</button>' : '') + '</div>' +
      '<div style="color:#64748b;font-size:12.5px;margin:2px 0 6px">At most ' + MAX + ' papers, picked by job type and the words on the job. They go to the customer\'s portal to e-sign — no approval; the customer gets one e-mail. ' + (started(p) || (p.docAuto && p.docAuto.on) ? 'This job sends them by itself.' : 'Older job: tap the button to send.') + '</div>';
    h += list.map(function(b){ var r = rq(b), st = !r ? (sent[b.id] ? '⏳ sending…' : '— not sent yet') : r.status === 'signed' ? '✅ Signed' + (r.signed && r.signed.name ? ' by ' + esc(r.signed.name) : '') : r.status === 'declined' ? '⚠️ Declined' : r.inPortal ? '📬 In the portal — waiting to sign' : '⏳ waiting';
      return '<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #f1f5f9;padding:5px 0;flex-wrap:wrap"><span>' + esc(b.name) + '</span><span style="font-size:12.5px;color:#334155">' + st + '</span></div>'; }).join('') || '<div style="color:#64748b;font-size:12.5px">No customer papers for this job.</div>';
    if (more.length) h += '<details style="margin-top:6px"><summary style="cursor:pointer;font-weight:700;font-size:13px">More papers for this job (' + more.length + ') — send when it is time</summary>' + more.map(function(b){ var r = rq(b);
      return '<div style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid #f1f5f9;padding:5px 0;flex-wrap:wrap;align-items:center"><span>' + esc(b.name) + '</span>' + (r ? '<span style="font-size:12.5px;color:#334155">' + (r.status === 'signed' ? '✅ Signed' : '📬 In the portal') + '</span>' : '<button type="button" data-da-one="' + esc(b.id) + '" style="border:1px solid #cbd5e1;background:#fff;border-radius:7px;padding:5px 10px;font:600 12px Inter,Arial,sans-serif;cursor:pointer;min-height:34px">✍️ Send to sign</button>') + '</div>'; }).join('') + '</details>';
    cur.innerHTML = h;
    if (cur.parentElement !== box) box.insertBefore(cur, box.firstChild);
  } catch (e) {}
}
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest ? e.target.closest('#gc-da [data-da-go], #gc-da [data-da-one]') : null; if (!b) return;
  var pid = D.getElementById('gc-da').getAttribute('data-pid'), one = b.getAttribute('data-da-one');
  if (paused()) { W.alert('⏸ Data-entry mode is on — nothing is sent.'); return; }
  b.disabled = true; b.textContent = one ? 'Sending…' : 'Making the papers…';
  run(pid, one ? { force: true, ids: [one] } : { force: true }).then(function(r){
    var msg = r.ok ? (r.made ? '✍️ ' + r.made + ' paper' + (r.made === 1 ? '' : 's') + ' in the customer\'s portal' + (r.mailed ? ' — e-mailed' : r.noEmail ? ' — no e-mail on file, a to-do is on the office list' : '') : 'Already in the portal') : 'Not sent: ' + r.why;
    try { if (W._gcSys && W._gcSys.toast) W._gcSys.toast(msg, !r.ok); else W.alert(msg); } catch (er) {}
    LISTS[pid] = null; paint(true);
  });
});
setInterval(paint, 1500);
setTimeout(function(){ setInterval(sweep, 60000); sweep(); }, 45000);
W._gcDocAuto = { run: run, papers: papers, others: others, rank: rank, MAX: MAX, sweep: function(){ LAST = 0; sweep(); }, active: active, started: started, NEVER: NEVER };
})(window);
</script>
