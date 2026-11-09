<script>/*__GC_PATCH_SENTPDF__ (owner 11/9: "save every PDF Glenn or PMs send into the CRM now")
   The server (_lib/sent-pdf.js, the 15-minute mailbox reader) keeps every PDF a GrayCo mailbox e-mails to someone outside
   GrayCo (gc_kv "gc_sent_pdfs": the exact file in crm-files, who sent it, to whom, when, the job it matched).
   Here: each one with a job goes into that job's Files & Docs (category "Sent PDFs", staff only — never the portal);
   one with no job waits on the Estimates screen: "📎 PDFs e-mailed out — not matched to a job (n)" → Open · Link to job.
   API: window._gcSentPdfs = { pull, list, unmatched, link, open } */
(function(){
'use strict';
if (window.__GC_PATCH_SENTPDF__) return; window.__GC_PATCH_SENTPDF__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var SI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
var SB = 'https://ieeonhpfahmwwecizdut.supabase.co';
var S = { rows: [], at: 0, busy: false };
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function crm(){ return W._crm || {}; }
function creds(){ try { return { u: (localStorage.getItem('grayco_sb_url') || SB).replace(/\/$/, ''), k: localStorage.getItem('grayco_sb_key') || '' }; } catch (e) { return { u: SB, k: '' }; } }
function docs(){ var d = arr(W._gcProjectDocs); if (!d.length) d = arr(crm().projectDocs); return d; }
function docId(r){ return 'SENTPDF_' + s(r.id); }
function haveDoc(r){ var id = docId(r), sha = s(r.sha256); return docs().some(function(d){ return d && (s(d.id) === id || (sha && s(d.sha256) === sha && s(d.pid || d.projectId) === s(r.pid))); }); }
function idb(k){ try { return Promise.resolve(W.idbGet ? W.idbGet(k) : null).then(function(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return v; }, function(){ return null; }); } catch (e) { return Promise.resolve(null); } }
function upsertDoc(d){
  var put = function(l){ var a = arr(l).slice(), i = a.findIndex(function(x){ return x && s(x.id) === s(d.id); }); if (i >= 0) a[i] = Object.assign({}, a[i], d); else a.unshift(d); return a; };
  try { W.__GC_MANUAL_SAVE__ = true; if (W._gcManualNow) W._gcManualNow('sent PDF'); } catch (e) {}
  ST(function(){ try { W.__GC_MANUAL_SAVE__ = false; } catch (e) {} }, 1500);
  var done = false;
  try { if (typeof W._setProjectDocs === 'function') { W._setProjectDocs(function(prev){ return put(prev); }); done = true; } } catch (e) {}
  try { if (W._crm) W._crm.projectDocs = put(arr(crm().projectDocs).length >= docs().length ? crm().projectDocs : docs()); } catch (e) {}
  try { if (Array.isArray(W._gcProjectDocs)) W._gcProjectDocs = put(W._gcProjectDocs); } catch (e) {}
  if (!done) idb('projectDocs').then(function(v){ var next = put(v); try { W.idbSet('projectDocs', next); } catch (e) {} try { if (W._gcApplySync) W._gcApplySync('projectDocs', next); } catch (e) {} try { if (W._supaUpsert) W._supaUpsert('projectDocs', next); } catch (e) {} });
}
function jobOf(pid){ return arr(crm().projects).filter(function(p){ return p && s(p.id) === s(pid); })[0] || null; }
function day(v){ var t = Date.parse(v); return isFinite(t) ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
function file(r, pid){
  var p = jobOf(pid); if (!p) return false;
  upsertDoc({ id: docId(r), pid: p.id, projectId: p.id, cat: 'Sent PDFs', name: s(r.name) || 'Sent PDF.pdf', ref: s(r.ref), sha256: s(r.sha256), type: 'application/pdf', size: +r.size || 0,
    uploadedAt: s(r.at) || new Date().toISOString(), uploaded: s(r.at).slice(0, 10), by: s(r.by), source: 'sent-email', sentTo: arr(r.to).join(', '), subject: s(r.subject),
    notes: 'E-mailed by ' + s(r.by) + ' to ' + arr(r.to).join(', ') + ' on ' + day(r.at) + (r.subject ? ' — "' + s(r.subject) + '"' : ''), portalShare: false, staffOnly: true, hideSubs: true });
  return true;
}
function pull(force){
  if (S.busy || (!force && Date.now() - S.at < 170000)) return Promise.resolve(S.rows);
  var c = creds(); if (!c.u || !c.k) return Promise.resolve(S.rows);
  S.busy = true;
  return W.fetch(c.u + '/rest/v1/gc_kv?select=value&key=eq.gc_sent_pdfs', { headers: { apikey: c.k, Authorization: 'Bearer ' + c.k }, cache: 'no-store' })
    .then(function(r){ return r.ok ? r.json() : null; }, function(){ return null; })
    .then(function(rows){
      S.busy = false; S.at = Date.now();
      if (!Array.isArray(rows)) return S.rows;
      var v = rows[0] ? rows[0].value : []; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } }
      S.rows = arr(v).filter(function(r){ return r && r.ref; });
      var n = 0; S.rows.forEach(function(r){ if (r.pid && jobOf(r.pid) && !haveDoc(r)) { if (file(r, r.pid)) n++; } });
      if (n) { try { console.log('[GC] 📎 ' + n + ' PDF(s) e-mailed out put in their jobs (patch SENTPDF)'); } catch (e) {} }
      paint();
      return S.rows;
    }, function(){ S.busy = false; return S.rows; });
}
function unmatched(){ return S.rows.filter(function(r){ return !(r.pid && jobOf(r.pid)) && !docs().some(function(d){ return d && s(d.id) === docId(r); }); }); }
function open(r){ try { if (typeof W._gcFileBlob === 'function') { W._gcFileBlob(r.ref).then(function(b){ var u = URL.createObjectURL(b); W.open(u, '_blank'); ST(function(){ URL.revokeObjectURL(u); }, 60000); }); } } catch (e) {} }
function link(r){
  var q = W.prompt('Which job is "' + s(r.name) + '" for? Type part of the job name, the customer or the PO (e.g. S251):', '');
  if (!q) return; q = low(q);
  var hits = arr(crm().projects).filter(function(p){ return p && !p.deleted && low([p.name, p.client, p.autoPO, p.po, p.address].join(' ')).indexOf(q) >= 0; }).slice(0, 8);
  if (!hits.length) { W.alert('No job matches "' + q + '".'); return; }
  var p = hits[0];
  if (hits.length > 1) { var pick = W.prompt(hits.map(function(h, i){ return (i + 1) + ') ' + s(h.name) + (h.autoPO ? ' · ' + h.autoPO : ''); }).join('\n') + '\n\nType the number:', '1'); var i = parseInt(pick, 10) - 1; if (!(i >= 0 && hits[i])) return; p = hits[i]; }
  if (file(r, p.id)) { try { (W._gcToast || W.alert)('📎 Put in ' + s(p.name) + ' → Files & Docs'); } catch (e) {} ST(paint, 300); }
}
/* the Estimates screen: one bar while any sent PDF waits for a job */
function paint(){
  try {
    var btn = [].slice.call(D.querySelectorAll('button')).filter(function(b){ return /New estimate/.test(b.textContent || '') && b.offsetParent; })[0];
    var old = D.getElementById('gc-sentpdf-bar');
    var list = unmatched();
    if (!btn || !list.length) { if (old && (!list.length || !btn)) old.remove(); return; }
    var host = btn.closest('div') && btn.closest('div').parentElement; if (!host) return;
    var bar = old || D.createElement('div'); bar.id = 'gc-sentpdf-bar';
    bar.style.cssText = 'margin:10px 0;padding:10px 12px;border:1px solid #E5D3A0;background:#FFF8E6;border-radius:10px;font:13px Inter,Arial,sans-serif;color:#0F1D2F';
    var openList = bar.getAttribute('data-open') === '1';
    bar.innerHTML = '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b>📎 PDFs e-mailed out — not matched to a job (' + list.length + ')</b><span style="opacity:.75">saved from GrayCo mailboxes; link each to its job</span><button type="button" data-sp="tog" style="margin-left:auto;border:1px solid #CBD3DF;background:#fff;border-radius:8px;padding:5px 10px;font-weight:600;cursor:pointer">' + (openList ? 'Hide' : 'Show') + '</button></div>' +
      (openList ? '<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">' + list.slice(0, 40).map(function(r, i){ return '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#fff;border:1px solid #EEE3C2;border-radius:8px;padding:6px 8px"><span style="flex:1;min-width:200px"><b>' + esc(r.name) + '</b><br><span style="font-size:12px;opacity:.75">' + esc(r.by) + ' → ' + esc(arr(r.to).join(', ')) + ' · ' + esc(day(r.at)) + (r.subject ? ' · "' + esc(s(r.subject).slice(0, 70)) + '"' : '') + '</span></span><button type="button" data-sp="open" data-i="' + i + '" style="border:1px solid #CBD3DF;background:#fff;border-radius:8px;padding:4px 9px;cursor:pointer">Open</button><button type="button" data-sp="link" data-i="' + i + '" style="border:1px solid #0F1D2F;background:#0F1D2F;color:#fff;border-radius:8px;padding:4px 9px;cursor:pointer">Link to job</button></div>'; }).join('') + '</div>' : '');
    bar.onclick = function(ev){ var b = ev.target.closest('[data-sp]'); if (!b) return; var a = b.getAttribute('data-sp'), r = list[+b.getAttribute('data-i')];
      if (a === 'tog') { bar.setAttribute('data-open', openList ? '0' : '1'); paint(); } else if (a === 'open' && r) open(r); else if (a === 'link' && r) link(r); };
    if (!old) host.parentElement.insertBefore(bar, host.nextSibling);
  } catch (e) {}
}
W._gcSentPdfs = { pull: pull, list: function(){ return S.rows.slice(); }, unmatched: unmatched, link: link, open: open, _file: file };
ST(function(){ pull(true); }, 20000);
SI(function(){ if (!D.hidden) pull(false); }, 180000);
SI(function(){ if (!D.hidden && S.rows.length) paint(); }, 4000);
try { console.log('[GC] 📎 PDFs e-mailed out by GrayCo staff → the job\'s Files & Docs (patch SENTPDF) — _gcSentPdfs'); } catch (e) {}
})();
</script>
