/* __GC_PATCH_COMPANYDOCS__ — 📁 COMPANY DOCUMENTS: the one company library, in folders, for everyone on the staff
   (owner 10/27: "make all these documents in my Company documents with other documents too; all company staff should
   have access to them in the CRM" · "don't I have a safety program? … enter those" · "put the safety document in the GC portal").

   • Folders: Insurance (COI) · Tax (W-9) · Licenses (TN #85034 BCB, AR #0486990627, MS #27769) · Safety (Safety Program,
     12 toolbox talks, sign-in sheet, OSHA posters, OSHA 300 logs) · HR (Employee Handbook, policies, forms) · Legal &
     contracts (every contract / legal template in the CRM, as a viewable, printable page) · Marketing (the print pack
     links, referral / coupon / giveaway terms) · Company info (entity, address from the company-address setting, phone).
   • Generated papers render from the CRM's own generators every time (📚 document library, the legal drafts, the safety
     program below) — always the current logo letterhead and the current company address.
   • Uploaded papers (COI, W-9, licenses, posters …) are stored through the CRM's file storage and listed by the server
     (/.netlify/functions/gc-portal docs-*; rules: netlify/functions/_lib/gcp.js). A slot with nothing in it shows a red
     "Missing" badge and ⬆ Upload; a COI / license needs its expiry date. 30 and 7 days before one runs out the admins
     and the office get a To-Do and an e-mail (server, daily — gc-portal-daily).
   • Who sees what: every signed-in staff member sees every folder, except a document marked "Admin + office only" (the
     W-9, which carries the tax ID, by default — the server does not even list it to anyone else). Admins and the office
     upload / replace / remove, set expiry dates, change who sees a document and whether GCs get it.
   • GCs: the GC portal (portal.html#g=…) lists only documents marked "Share with GCs" (COI, W-9, licenses, the Safety
     Program and the toolbox-talk set by default). A generated document reaches the GC portal as a PDF: 📤 Put in GC
     portal (admins / office) renders it and stores it; when the program changes the row says "changed — update".
   • The written Construction Safety Program is a DRAFT ("review with your attorney and insurance carrier before
     adoption") with [OWNER TO FILL] blanks: ✏️ Fill in the blanks fills them everywhere; ✅ Mark adopted removes the
     DRAFT banner. Text: tools/companydocs_safety.py.
   Entry points: Docs → 📁 Company documents (everyone) · ⚙ Admin → 📄 Company documents · _gcOpenCompanyDocuments().
   API: window._gcCompanyLib = { open(folder), close(), entries(), render(id), view(id), print(id), refresh(), state(),
        publish(id), renderAdmin(box), forGC() }   window._gcCompanyDocsForGC() → Promise<[{ id, title, folder, kind,
        expires, source:'upload'|'generated', published, gen }]> (for the GC portal / COMMCO) */
(function(){
'use strict';
if (window.__GC_PATCH_COMPANYDOCS__) return; window.__GC_PATCH_COMPANYDOCS__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var FN = '/.netlify/functions/gc-portal';
var SAFETY_HTML = __SAFETY_HTML__;
var TALKS = __TALKS__;
var SF = __FIELDS__;
var SAFETY_REV = __SAFETY_REV__, DRAFT_TXT = __DRAFT_TXT__;
var GCO = 'GrayCo Construction Services, LLC', PHONE = '(901) 585-0944';
var LICS = [['lic_tn', 'Tennessee contractor license', 'TN #85034 (BCB) — Tennessee Board for Licensing Contractors'], ['lic_ar', 'Arkansas contractor license', 'AR #0486990627 — Arkansas Contractors Licensing Board'], ['lic_ms', 'Mississippi contractor license', 'MS #27769 — Mississippi State Board of Contractors']];
var FOLDERS = [['insurance', '🛡', 'Insurance'], ['tax', '🧾', 'Tax'], ['licenses', '🪪', 'Licenses'], ['safety', '🦺', 'Safety'], ['hr', '👥', 'HR'], ['legal', '⚖️', 'Legal & contracts'], ['marketing', '📣', 'Marketing'], ['company', '🏢', 'Company info']];
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x != null; }) : []; }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function today(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function days(ymd){ if (!ymd) return null; var a = Date.parse(String(ymd).slice(0, 10) + 'T12:00:00'), b = Date.parse(today() + 'T12:00:00'); return isFinite(a) ? Math.round((a - b) / 864e5) : null; }
function day(v){ if (!v) return ''; var d = new Date(String(v).length === 10 ? v + 'T12:00:00' : v); return isNaN(d) ? esc(v) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function addr(){ try { return W._gcCompanyAddress ? s(W._gcCompanyAddress()) : ''; } catch (e) { return ''; } }
function me(){ try { return JSON.parse(localStorage.getItem('grayco_user') || '{}') || {}; } catch (e) { return {}; } }
function signedIn(){ try { var A = W.__GC_AUTH__; return !!(A && A.email && A.email()); } catch (e) { return false; } }
function isAdmin(){ try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {} var u = me(); return /^admin$|owner/i.test(s(u.role)) || low(u.payType) === 'owner'; }
function isOffice(){
  try { var A = W.__GC_AUTH__, e = A && A.email && low(A.email()); if (e === 'office@grayco-cs.com') return true; } catch (x) {}
  try { if (W._gcRP && typeof W._gcRP.role === 'function' && /office/i.test(s(W._gcRP.role()))) return true; } catch (x) {}
  var u = me(); return /office/i.test(s(u.role) + ' ' + s(u.profile));
}
/* the server says which level this sign-in is (admin / office / staff); until it answers, the page's own guess */
function level(){ return CL.level || (isAdmin() ? 'admin' : isOffice() ? 'office' : 'staff'); }
function canEdit(){ var l = level(); return l === 'admin' || l === 'office'; }
function toast(msg, bad){
  try { var t = D.createElement('div'); t.setAttribute('data-gc-keep', '1'); t.setAttribute('role', 'status'); t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483600;background:' + (bad ? '#b91c1c' : '#111827') + ';color:#fff;border-radius:10px;padding:10px 16px;font:600 13px Inter,Arial,sans-serif;box-shadow:0 8px 26px rgba(0,0,0,.35);max-width:calc(100vw - 32px)';
    D.body.appendChild(t); later(function(){ try { t.remove(); } catch (e) {} }, 4500); } catch (e) {}
}
function token(){
  var A = W.__GC_AUTH__;
  if (!A || typeof A.fresh !== 'function') return Promise.reject(new Error('Sign in to the CRM first.'));
  return Promise.resolve(A.fresh()).then(function(x){ if (!x || !x.access_token) throw new Error('Sign in to the CRM first.'); return x.access_token; });
}
function api(body){
  return token().then(function(t){ return W.fetch(FN, { method: 'POST', cache: 'no-store', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); })
    .then(function(r){ return r.text().then(function(t){ var j = {}; try { j = JSON.parse(t); } catch (e) { j = { error: 'The server answered ' + r.status + '.' }; } if (!r.ok || !j.ok) throw new Error(j.error || ('The server answered ' + r.status + '.')); return j; }); });
}
function storeFile(file){
  if (typeof W._gcStoreFile !== 'function') return Promise.reject(new Error('The file storage is not ready — reload the page.'));
  return Promise.resolve(W._gcStoreFile(file, { kind: 'doc', pid: '', name: file.name })).then(function(m){
    if (!m || !m.ref) throw new Error('The file could not be stored.');
    var up = typeof W._gcFilesUploadNow === 'function' ? Promise.resolve(W._gcFilesUploadNow()).catch(function(){}) : Promise.resolve();
    return up.then(function(){ return { ref: m.ref, name: file.name, type: file.type }; });
  });
}

/* ── state ─────────────────────────────────────────────────────────────────── */
var CL = { docs: null, cfg: { gen: {}, safety: { fields: {}, adopted: false } }, level: '', err: '', at: 0, loading: null, folder: 'insurance', form: '', gear: '', fill: false, busy: '', box: null, ov: null };
function refresh(){
  if (CL.loading) return CL.loading;
  CL.loading = api({ action: 'docs-list' }).then(function(j){
    CL.docs = arr(j.docs); CL.level = s(j.level) || CL.level; if (j.cfg) CL.cfg = norm(j.cfg); CL.err = ''; CL.at = Date.now(); CL.loading = null; paint(); return CL.docs;
  }, function(e){ CL.err = e.message; CL.docs = CL.docs || []; CL.loading = null; paint(); return CL.docs; });
  return CL.loading;
}
function norm(c){ c = c || {}; return { gen: c.gen || {}, safety: { fields: (c.safety && c.safety.fields) || {}, adopted: !!(c.safety && c.safety.adopted), adoptedAt: s(c.safety && c.safety.adoptedAt) } }; }
function live(){ return arr(CL.docs).filter(function(d){ return d.current !== false && !d.removed; }); }
/* a COI / W-9 uploaded before the folders (no slot) still fills its slot */
function legacySlot(d){ return (!s(d.slot) && !s(d.gen) && (d.kind === 'coi' || d.kind === 'w9')) ? d.kind : ''; }
function bySlot(slot){ return live().filter(function(d){ return s(d.slot) === slot || legacySlot(d) === slot; }).sort(function(a, b){ return a.at < b.at ? 1 : -1; })[0] || null; }
function byGen(id){ return live().filter(function(d){ return s(d.gen) === id; }).sort(function(a, b){ return a.at < b.at ? 1 : -1; })[0] || null; }

/* ── the catalog ───────────────────────────────────────────────────────────── */
function lib(){ try { return arr(W._gcDocLib && W._gcDocLib.builtins && W._gcDocLib.builtins()); } catch (e) { return []; } }
function folderOfCat(c){ c = s(c); if (c === 'HR') return 'hr'; if (/^Marketing/.test(c)) return 'marketing'; return 'legal'; }
function entries(){
  var E = [];
  function slot(o){ o.type = 'slot'; E.push(o); }
  function gen(o){ o.type = 'gen'; E.push(o); }
  slot({ id: 'coi', folder: 'insurance', title: 'Certificate of insurance (COI)', desc: 'General liability, auto and workers\' compensation. GCs download it from their project page; a renewed one is e-mailed to every active GC contact (after ✅ approval).', kind: 'coi', expiry: true, access: 'all', shareGc: true, required: true });
  slot({ id: 'w9', folder: 'tax', title: 'GrayCo\'s W-9 (signed)', desc: 'GrayCo\'s own signed IRS Form W-9 for GCs and customers who pay us. Carries the tax ID — admins and the office only unless the owner opens it.', kind: 'w9', expiry: false, access: 'office', shareGc: true, required: true });
  E.push({ id: 'w9_blank', type: 'link', folder: 'tax', title: 'Blank IRS Form W-9 (to send to subs)', desc: 'The official form (Rev. March 2024) every sub completes before their first payment. irs.gov always has the newest revision.', url: '/w9/GrayCo-W-9-4ad8a7807c2d45df.pdf', more: [['Check irs.gov ↗', 'https://www.irs.gov/pub/irs-pdf/fw9.pdf']], sendW9: true, access: 'all' });
  LICS.forEach(function(l){ slot({ id: l[0], folder: 'licenses', title: l[1], desc: l[2] + '. Upload the current license card / certificate with its expiry date.', kind: 'license', expiry: true, access: 'all', shareGc: true, required: true }); });
  gen({ id: 'safety_program', folder: 'safety', title: 'Construction Safety Program (written)', desc: 'OSHA 29 CFR 1926-based program for residential, commercial and restoration work in TN · MS · AR. DRAFT until adopted.', access: 'all', shareGc: true, kind: 'safety', draft: function(){ return !CL.cfg.safety.adopted; } });
  gen({ id: 'toolbox_all', folder: 'safety', title: 'Toolbox talks — the 12 starter talks (one page each)', desc: 'Print the set or one talk; each page has a sign-in table. The daily safety sign-in in the field app records attendance too.', access: 'all', shareGc: true, kind: 'safety' });
  TALKS.forEach(function(t, i){ gen({ id: 'talk_' + t.id, folder: 'safety', title: 'Toolbox talk ' + (i + 1) + ' — ' + t.title, desc: '', access: 'all', shareGc: false, kind: 'safety', sub: true }); });
  if (lib().some(function(t){ return t && t.id === 'gcb_toolbox'; })) gen({ id: 'gcb_toolbox', folder: 'safety', title: 'Safety / toolbox talk sign-in sheet', desc: 'Blank sign-in sheet (from the document library).', access: 'all', shareGc: false, kind: 'safety', builtin: true });
  slot({ id: 'osha_poster', folder: 'safety', title: 'OSHA / TOSHA "It\'s the Law" posters', desc: 'Federal OSHA poster (MS, AR) and the TOSHA poster (TN) — free from osha.gov and tn.gov. Upload the PDFs you print.', kind: 'safety', expiry: false, access: 'all', shareGc: false, more: [['osha.gov poster ↗', 'https://www.osha.gov/publications/poster']] });
  slot({ id: 'osha300', folder: 'safety', title: 'OSHA 300 / 300A logs', desc: 'Injury and illness logs (keep 5 years; post the 300A Feb 1 – Apr 30). Names of injured workers — admins and the office only.', kind: 'safety', expiry: false, access: 'office', shareGc: false });
  slot({ id: 'sds', folder: 'safety', title: 'Safety Data Sheets (SDS) binder', desc: 'One PDF with the SDS for every hazardous product we use (Safety Program §5).', kind: 'safety', expiry: false, access: 'all', shareGc: false });
  /* every document in the CRM's library: HR → HR, marketing → Marketing, everything else → Legal & contracts */
  lib().forEach(function(t){
    if (!t || !t.id || t.id === 'gcb_toolbox') return;
    gen({ id: t.id, folder: folderOfCat(t.category), title: s(t.name), desc: s(t.category), cat: s(t.category), access: 'all', shareGc: false, kind: folderOfCat(t.category) === 'hr' ? 'hr' : 'legal', builtin: true });
  });
  gen({ id: 'company_info', folder: 'company', title: 'Company information sheet', desc: 'Legal name, address, phone, licenses — for vendor set-up forms, bids and GCs.', access: 'all', shareGc: false, kind: 'company' });
  return E;
}
function entry(id){ return entries().filter(function(e){ return e.id === id; })[0] || null; }
/* the setting that applies to an entry (owner's per-document choice, else the default) */
function accessOf(e){
  if (e.type === 'slot') { var d = bySlot(e.id); if (d) return d.access || e.access; }
  var g = CL.cfg.gen[e.id]; return (g && g.access) || e.access || 'all';
}
function sharedOf(e){
  if (e.type === 'slot') { var d = bySlot(e.id); if (d) return !!d.shareGc; }
  var g = CL.cfg.gen[e.id]; return g && typeof g.shareGc === 'boolean' ? g.shareGc : !!e.shareGc;
}
function visible(e){
  if (canEdit()) return true;
  if (e.type === 'slot') return !!bySlot(e.id) || accessOf(e) === 'all';   /* the server only lists what this person may see */
  return accessOf(e) === 'all';
}
function status(e){
  if (e.type !== 'slot') return null;
  var d = bySlot(e.id); if (!d) return { k: 'missing', t: 'Missing' };
  if (e.expiry && !d.expires) return { k: 'warn', t: 'No expiry date' };
  var n = days(d.expires); if (n == null) return { k: 'ok', t: 'On file' };
  if (n < 0) return { k: 'bad', t: 'Expired ' + day(d.expires) };
  if (n <= 30) return { k: 'warn', t: 'Expires in ' + n + ' day' + (n === 1 ? '' : 's') };
  return { k: 'ok', t: 'Valid through ' + day(d.expires) };
}

/* ── generated documents ───────────────────────────────────────────────────── */
function fields(){ return CL.cfg.safety.fields || {}; }
function fillSF(html){
  var f = fields();
  return String(html).replace(/%%sf:([a-z_]+)%%/g, function(m, k){
    var v = s(f[k]); if (v) return esc(v);
    var lab = (SF.filter(function(x){ return x[0] === k; })[0] || [k, k])[1];
    return '<span class="gc-fill" style="background:#fff3bf;border-radius:2px;padding:0 2px">[OWNER TO FILL: ' + esc(lab) + ']</span>';
  }).replace(/\{company_address\}/g, esc(addr() || '[company address]'));
}
function stripDraft(html){ return String(html).replace(/<div data-gc-draft="1"[\s\S]*?<\/div><!--\/draft-->/g, ''); }
function head(){ try { if (W._gcPrintHead) return W._gcPrintHead({}); } catch (e) {} return '<div style="text-align:center;font-weight:800;font-size:15pt">' + GCO + '</div>'; }
function page(title, body, o){
  o = o || {};
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>body{font-family:Arial,Helvetica,sans-serif;color:#111;max-width:780px;margin:24px auto;padding:0 18px;font-size:10.5pt;background:#fff}'
    + '.gc-pb{page-break-before:always;break-before:page}h3{page-break-after:avoid;break-after:avoid}li,tr{page-break-inside:avoid;break-inside:avoid}'
    + '.gc-draft-wm{position:fixed;top:50%;left:50%;font:800 120px Arial,Helvetica,sans-serif;color:rgba(185,28,28,.07);transform:translate(-50%,-50%) rotate(-30deg);z-index:0;pointer-events:none;letter-spacing:8px}@media print{body{margin:0 auto}.noprint{display:none}}@page{margin:14mm 12mm 16mm}</style></head><body>'
    + head() + body
    + '<div style="margin-top:22px;font-size:8.5pt;color:#777;text-align:center">' + esc(GCO) + ' · ' + esc(addr()) + ' · ' + PHONE + ' · grayco-cs.com</div>'
    + (o.draft ? '<div class="gc-draft-wm" aria-hidden="true">DRAFT</div>' : '') + '</body></html>';
}
function talkHtml(t, i){
  var rows = ''; for (var r = 0; r < 12; r++) rows += '<tr><td style="border:1px solid #cbd5e1;height:20px"></td><td style="border:1px solid #cbd5e1"></td><td style="border:1px solid #cbd5e1"></td></tr>';
  return '<h2 style="text-align:center;font-size:14pt;margin:2px 0;color:#0f2440">Toolbox Talk ' + (i + 1) + ' — ' + esc(t.title) + '</h2>'
    + '<div style="text-align:center;font-size:9pt;color:#555;margin-bottom:8px">10–15 minutes · read it, then talk about this job</div>'
    + '<div style="border-left:4px solid #d4a017;background:#fffbeb;padding:7px 10px;margin:0 0 8px;font-size:10pt;line-height:1.45"><b>Why it matters:</b> ' + t.why + '</div>'
    + '<h3 style="font-size:11pt;margin:8px 0 4px;color:#0f2440">Key points</h3><ul style="margin:0 0 8px 18px;padding:0;line-height:1.4;font-size:10pt">' + t.points.map(function(p){ return '<li style="margin:0 0 3px">' + p + '</li>'; }).join('') + '</ul>'
    + '<h3 style="font-size:11pt;margin:8px 0 4px;color:#0f2440">Talk about it on this job</h3><ul style="margin:0 0 8px 18px;padding:0;line-height:1.4;font-size:10pt">' + t.ask.map(function(p){ return '<li style="margin:0 0 3px">' + p + '</li>'; }).join('') + '</ul>'
    + '<table style="width:100%;border-collapse:collapse;font-size:9pt;margin:6px 0"><tr><td style="padding:3px 0">Date: ____________</td><td>Job: ______________________________</td><td>Led by: ____________________</td></tr></table>'
    + '<table style="width:100%;border-collapse:collapse;font-size:9pt"><tr><th style="border:1px solid #cbd5e1;background:#f1f5f9;text-align:left;padding:3px;width:38%">Printed name</th><th style="border:1px solid #cbd5e1;background:#f1f5f9;text-align:left;padding:3px;width:34%">Signature</th><th style="border:1px solid #cbd5e1;background:#f1f5f9;text-align:left;padding:3px">Company (GrayCo / sub)</th></tr>' + rows + '</table>'
    + '<p style="margin:8px 0 0;font-size:8pt;color:#777;text-align:right">' + esc(TALKS.rev) + '</p>';
}
function companyInfoHtml(){
  var rows = [['Legal name', GCO], ['Address', addr()], ['Phone', PHONE], ['Website', 'grayco-cs.com'], ['Billing e-mail', 'billing@grayco-cs.com'],
    ['Contractor licenses', 'TN #85034 (BCB) · AR #0486990627 · MS #27769'], ['Work', 'General contracting — residential, commercial, roofing, insurance restoration and mitigation'], ['Service area', 'Tennessee · Mississippi · Arkansas'], ['Federal tax ID (EIN)', 'On the W-9 (Company documents → Tax; admin / office)']];
  return '<h2 style="text-align:center;font-size:15pt;margin:4px 0 10px;color:#0f2440">Company information</h2><table style="width:100%;border-collapse:collapse;font-size:10.5pt">'
    + rows.map(function(r){ return '<tr><td style="padding:6px;width:34%;color:#555;border-bottom:1px solid #e5e7eb">' + esc(r[0]) + '</td><td style="padding:6px;border-bottom:1px solid #e5e7eb"><b>' + esc(r[1]) + '</b></td></tr>'; }).join('') + '</table>';
}
/* a library template without a job: the same fill as the job document pack, job fields left as lines */
function builtinBody(id){
  var t = lib().filter(function(x){ return x && x.id === id; })[0]; if (!t) return Promise.resolve(null);
  var base = { name: t.name, html: t.body };
  var get = (isAdmin() && typeof W._fetchOneTpl === 'function') ? Promise.resolve(W._fetchOneTpl(id)).catch(function(){ return null; }) : Promise.resolve(null);
  return get.then(function(r){ var x = (r && s(r.html)) ? r : base; var f = {}; try { f = (W._gcDocLib && W._gcDocLib.fields) ? W._gcDocLib.fields(null) : {}; } catch (e) {}
    var html = String(x.html || '').replace(/\{([a-z_]+)\}/g, function(m, k){ if (k === 'company_address') return esc(addr()); if (!(k in f)) return m; var v = f[k]; return v ? esc(v) : '<span style="display:inline-block;min-width:120px;border-bottom:1px solid #999">&nbsp;</span>'; });
    return { title: t.name, body: html }; });
}
function genRev(id){
  var base = id === 'safety_program' ? SAFETY_REV + '|' + (CL.cfg.safety.adopted ? 'A' : 'D') + '|' + JSON.stringify(fields()) : id === 'toolbox_all' || /^talk_/.test(id) ? TALKS.rev : 'lib';
  base += '|' + addr(); var h = 0; for (var i = 0; i < base.length; i++) { h = ((h << 5) - h + base.charCodeAt(i)) | 0; } return 'r' + (h >>> 0).toString(36);
}
function render(id){
  var e = entry(id); if (!e) return Promise.resolve(null);
  if (!visible(e)) return Promise.resolve(null);
  if (id === 'safety_program') {
    var draft = !CL.cfg.safety.adopted, body = fillSF(SAFETY_HTML); if (!draft) body = stripDraft(body);
    var sub = draft ? '<div style="text-align:center;font-size:9.5pt;color:#b91c1c;font-weight:700;margin-bottom:10px">' + esc(SAFETY_REV) + '</div>' : '<div style="text-align:center;font-size:9.5pt;color:#555;margin-bottom:10px">Adopted ' + esc(day(CL.cfg.safety.adoptedAt)) + '</div>';
    var b = '<h2 style="text-align:center;font-size:16pt;margin:4px 0 2px;color:#0f2440">Construction Safety Program</h2>' + sub + body;
    return Promise.resolve({ id: id, title: 'GrayCo Construction Safety Program', body: b, page: page('GrayCo Construction Safety Program', b, { draft: draft }), rev: genRev(id) });
  }
  if (id === 'toolbox_all' || /^talk_/.test(id)) {
    var list = id === 'toolbox_all' ? TALKS.map(function(t, i){ return [t, i]; }) : TALKS.map(function(t, i){ return [t, i]; }).filter(function(x){ return 'talk_' + x[0].id === id; });
    var bb = list.map(function(x, k){ return '<div' + (k ? ' class="gc-pb"' : '') + '>' + (k ? head() : '') + talkHtml(x[0], x[1]) + '</div>'; }).join('');
    var tt = id === 'toolbox_all' ? 'GrayCo Toolbox Talks (12)' : 'GrayCo Toolbox Talk — ' + list[0][0].title;
    return Promise.resolve({ id: id, title: tt, body: bb, page: page(tt, bb), rev: genRev(id) });
  }
  if (id === 'company_info') { var ci = companyInfoHtml(); return Promise.resolve({ id: id, title: 'GrayCo company information', body: ci, page: page('GrayCo company information', ci), rev: genRev(id) }); }
  if (e.builtin) return builtinBody(id).then(function(r){ if (!r) return null; return { id: id, title: r.title, body: r.body, page: page(r.title, r.body), rev: genRev(id) }; });
  return Promise.resolve(null);
}
function openWin(html, print){
  var w = W.open('', '_blank');
  if (!w) { toast('Allow pop-ups for the CRM to see the document.', true); return null; }
  try { w.document.open(); w.document.write(html); w.document.close(); if (print) later(function(){ try { w.focus(); w.print(); } catch (e) {} }, 600); } catch (e) {}
  return w;
}
function view(id, print){ return render(id).then(function(r){ if (!r) { toast('That document is not available to you.', true); return null; } openWin(r.page, print); return r; }); }
function openUpload(d){ var w = W.open('', '_blank'); return api({ action: 'docs-url', id: d.id }).then(function(j){ if (w) w.location = j.url; return j; }, function(x){ if (w) w.close(); toast(x.message, true); }); }

/* ── a generated document → PDF → the GC portal ──────────────────────────────── */
var H2P = null;
function h2p(){
  if (W.html2pdf) return Promise.resolve(true);
  if (!H2P) H2P = new Promise(function(res){
    var done = false, t = later(function(){ if (!done) { done = true; res(false); } }, 10000);
    var sc = D.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    sc.onload = function(){ if (!done) { done = true; clearTimeout(t); res(!!W.html2pdf); } };
    sc.onerror = function(){ if (!done) { done = true; clearTimeout(t); res(false); } };
    D.head.appendChild(sc);
  }).then(function(ok){ if (!ok) H2P = null; return ok; });
  return H2P;
}
function pdfBlob(r){
  if (typeof W.__GC_COMPANYDOCS_PDF__ === 'function') return Promise.resolve(W.__GC_COMPANYDOCS_PDF__(r));   /* tests */
  return h2p().then(function(ok){
    if (!ok) throw new Error('The PDF maker did not load — check the connection and try again.');
    var holder = D.createElement('div'); holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:780px;background:#fff;color:#111;font:10.5pt Arial,Helvetica,sans-serif;padding:0 10px';
    holder.innerHTML = head() + r.body.replace(/class="gc-pb"/g, 'class="gc-pb html2pdf__page-break"') + '<div style="margin-top:18px;font-size:8.5pt;color:#777;text-align:center">' + esc(GCO) + ' · ' + esc(addr()) + ' · ' + PHONE + '</div>';
    D.body.appendChild(holder);
    var opt = { margin: [30, 28, 34, 28], filename: r.title + '.pdf', image: { type: 'jpeg', quality: 0.92 }, html2canvas: { scale: 1.6, useCORS: true, backgroundColor: '#ffffff' }, jsPDF: { unit: 'pt', format: 'letter', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'], avoid: ['li', 'tr', 'h3'] } };
    return W.html2pdf().set(opt).from(holder).toPdf().get('pdf').then(function(pdf){ holder.remove(); return pdf.output('blob'); }, function(e){ holder.remove(); throw e; });
  });
}
function publish(id){
  var e = entry(id); if (!e || e.type !== 'gen') return Promise.reject(new Error('Only a generated document can be put in the GC portal this way.'));
  if (!canEdit()) return Promise.reject(new Error('Only an admin or the office can change what GCs see.'));
  CL.busy = id; paint();
  return render(id).then(function(r){
    if (!r) throw new Error('Could not build that document.');
    return pdfBlob(r).then(function(blob){
      var name = r.title.replace(/[\\/:*?"<>|]+/g, ' ') + '.pdf', file;
      try { file = new File([blob], name, { type: 'application/pdf' }); } catch (x) { file = blob; file.name = name; }
      return storeFile(file);
    }).then(function(m){ return api({ action: 'docs-add', kind: e.kind || 'other', folder: e.folder, slot: 'gen:' + id, gen: id, genRev: r.rev, title: r.title, ref: m.ref, name: m.name, type: 'application/pdf', shareGc: true, access: accessOf(e), sendToGcs: false }); });
  }).then(function(j){ CL.busy = ''; toast('In the GC portal: ' + (j.doc && j.doc.title || 'done')); return refresh(); }, function(x){ CL.busy = ''; paint(); toast(x.message, true); throw x; });
}
function setGen(id, patch){ var g = {}; g[id] = patch; CL.cfg.gen[id] = Object.assign({}, CL.cfg.gen[id] || {}, patch); paint(); return api({ action: 'docs-cfg', gen: g }).then(function(j){ if (j.cfg) CL.cfg = norm(j.cfg); paint(); return j; }, function(x){ toast(x.message, true); return refresh(); }); }

/* ── for the GC portal (COMMCO and later): what a GC may get ─────────────────── */
function forGC(){
  return (CL.docs ? Promise.resolve(CL.docs) : refresh()).then(function(){
    var out = live().filter(function(d){ return d.shareGc && !(d.kind === 'coi' && d.expired); }).map(function(d){ return { id: d.id, title: d.title, folder: d.folder, kind: d.kind, expires: d.expires || '', source: d.gen ? 'generated' : 'upload', gen: s(d.gen), published: true }; });
    entries().filter(function(e){ return e.type === 'gen' && sharedOf(e) && !byGen(e.id); }).forEach(function(e){ out.push({ id: 'gen:' + e.id, title: e.title, folder: e.folder, kind: e.kind || 'other', expires: '', source: 'generated', gen: e.id, published: false }); });
    return out;
  });
}

/* ── the screen ────────────────────────────────────────────────────────────── */
var CSS = '#gc-cl{font:13px Inter,Arial,sans-serif;color:#0f172a}#gc-cl .w{color:#64748b;font-size:12px}#gc-cl .fl{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 10px}'
  + '#gc-cl .fl button{border:1px solid #cbd5e1;background:#fff;color:#0f2440;border-radius:999px;padding:6px 11px;font:700 12px Inter,Arial,sans-serif;cursor:pointer;min-height:32px}#gc-cl .fl button.on{background:#0f2440;color:#fff;border-color:#0f2440}'
  + '#gc-cl .fl .n{display:inline-block;min-width:16px;margin-left:4px;border-radius:8px;background:#fee2e2;color:#991b1b;font-size:10px;padding:0 4px}'
  + '#gc-cl .row{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin:6px 0;background:#fff}#gc-cl .row.sub{margin-left:18px;padding:7px 10px}#gc-cl .t{font-weight:800;font-size:13.5px}'
  + '#gc-cl .bd{display:inline-block;border-radius:6px;padding:1px 7px;font-size:11px;font-weight:700;margin-left:6px;vertical-align:1px}#gc-cl .bd.missing,#gc-cl .bd.bad{background:#fee2e2;color:#991b1b}#gc-cl .bd.warn{background:#fef3c7;color:#92400e}#gc-cl .bd.ok{background:#dcfce7;color:#166534}#gc-cl .bd.gc{background:#e0e7ff;color:#3730a3}#gc-cl .bd.off{background:#f1f5f9;color:#334155}#gc-cl .bd.draft{background:#fee2e2;color:#b91c1c}'
  + '#gc-cl .acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}#gc-cl .acts button,#gc-cl .acts a{border:none;border-radius:7px;padding:6px 11px;font:700 12px Inter,Arial,sans-serif;cursor:pointer;min-height:32px;background:#0f2440;color:#fff;text-decoration:none;display:inline-flex;align-items:center}#gc-cl .acts .g{background:#e2e8f0;color:#0f2440}#gc-cl .acts .r{background:#fee2e2;color:#991b1b}#gc-cl .acts .y{background:#d4a017;color:#14202e}#gc-cl button:disabled{opacity:.5}'
  + '#gc-cl .frm{margin-top:8px;padding:9px;border:1px dashed #94a3b8;border-radius:9px;background:#f8fafc;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}#gc-cl .frm label{display:flex;flex-direction:column;gap:3px;font-size:11px;font-weight:700;color:#475569}'
  + '#gc-cl input,#gc-cl select{box-sizing:border-box;padding:6px 8px;border:1px solid #cbd5e1;border-radius:7px;font:13px Inter,Arial,sans-serif;min-height:32px;max-width:100%}#gc-cl .h4{margin:12px 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#64748b;font-weight:800}'
  + '#gc-cl .err{color:#b91c1c;font-weight:700;margin:6px 0}#gc-cl .info td{padding:5px 6px;border-bottom:1px solid #f1f5f9;font-size:12.5px;vertical-align:top}#gc-cl .info td:first-child{color:#64748b;width:38%}'
  + '#gc-cl-ov{position:fixed;inset:0;z-index:2147483400;background:rgba(6,12,20,.72);display:flex;align-items:flex-start;justify-content:center;padding:20px 10px;overflow:auto}#gc-cl-box{background:#f8fafc;width:100%;max-width:900px;border-radius:14px;padding:16px;box-sizing:border-box}';
function css(){ if (D.getElementById('gc-cl-css')) return; var st = D.createElement('style'); st.id = 'gc-cl-css'; st.textContent = CSS; D.head.appendChild(st); }
function bd(k, t){ return '<span class="bd ' + k + '">' + esc(t) + '</span>'; }
function btn(act, id, label, cls, dis){ return '<button type="button" data-cl="' + act + '" data-id="' + esc(id) + '"' + (cls ? ' class="' + cls + '"' : '') + (dis ? ' disabled' : '') + '>' + label + '</button>'; }
function folderAlerts(f){ if (!canEdit()) return 0; return entries().filter(function(e){ var st = e.folder === f && e.type === 'slot' && e.required && status(e); return st && st.k !== 'ok'; }).length; }
/* uploads that are not in a slot and not a generated document's PDF */
function extras(f){ return live().filter(function(d){ return !s(d.slot) && !s(d.gen) && !legacySlot(d) && (d.folder || 'company') === f; }); }
function rowSlot(e){
  var d = bySlot(e.id), st = status(e), ed = canEdit();
  var h = '<div class="row" data-entry="' + esc(e.id) + '"><div class="t">' + esc(e.title) + (st ? bd(st.k, st.t) : '') + (accessOf(e) === 'office' ? bd('off', 'Admin + office only') : '') + (sharedOf(e) ? bd('gc', 'Shared with GCs') : '') + '</div>'
    + '<div class="w">' + esc(e.desc) + (d ? '<br>On file: <b>' + esc(d.name || d.title) + '</b> · added ' + day(d.at) : '') + '</div><div class="acts">'
    + (d ? btn('open-up', d.id, '👁 View / download') : (ed ? '' : '<span class="w">Not uploaded yet — ask the office.</span>'))
    + (ed ? btn('form', e.id, d ? '⬆ Replace' : '⬆ Upload', d ? 'g' : 'y') : '')
    + (ed && d ? btn('gear', e.id, '⚙ Settings', 'g') : '')
    + arr(e.more).map(function(m){ return '<a class="g" href="' + esc(m[1]) + '" target="_blank" rel="noreferrer">' + esc(m[0]) + '</a>'; }).join('') + '</div>';
  if (ed && CL.form === e.id) h += uploadForm(e);
  if (ed && d && CL.gear === e.id) h += gearForm(e, d);
  return h + '</div>';
}
function uploadForm(e){
  return '<div class="frm" data-frm="' + esc(e.id) + '">' + (e.type === 'slot' ? '' : '<label>Title<input type="text" data-f="title" maxlength="120" placeholder="e.g. Fleet policy 2026"></label>')
    + '<label>File (PDF or picture)<input type="file" data-f="file" accept="application/pdf,image/*"></label>'
    + (e.expiry || e.type !== 'slot' ? '<label>' + (e.expiry ? 'Valid through (required)' : 'Valid through (if it expires)') + '<input type="date" data-f="exp"></label>' : '')
    + '<label>Who can see it<select data-f="access"><option value="all"' + (accessOf(e) === 'all' ? ' selected' : '') + '>Everyone on the staff</option><option value="office"' + (accessOf(e) === 'office' ? ' selected' : '') + '>Admin + office only</option></select></label>'
    + '<label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-f="gc"' + (sharedOf(e) ? ' checked' : '') + '> Share with GCs</label>'
    + (e.kind === 'coi' ? '<label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-f="send" checked> E-mail the new COI to every active GC contact (after ✅ approval)</label>' : '')
    + btn('save', e.id, CL.busy === e.id ? 'Saving…' : 'Save', '', CL.busy === e.id) + btn('cancel', e.id, 'Cancel', 'g') + '</div>';
}
function gearForm(e, d){
  return '<div class="frm" data-gear="' + esc(d.id) + '"><label>Who can see it<select data-g="access"><option value="all"' + (d.access === 'all' ? ' selected' : '') + '>Everyone on the staff</option><option value="office"' + (d.access === 'office' ? ' selected' : '') + '>Admin + office only</option></select></label>'
    + '<label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-g="gc"' + (d.shareGc ? ' checked' : '') + '> Share with GCs</label>'
    + '<label>Valid through<input type="date" data-g="exp" value="' + esc(d.expires || '') + '"></label>'
    + btn('gsave', d.id, 'Save') + btn('del', d.id, '🗑 Remove', 'r') + btn('cancel', e.id, 'Close', 'g') + '</div>';
}
function rowGen(e){
  var ed = canEdit(), pub = byGen(e.id), shared = sharedOf(e), rev = '';
  var draft = e.draft && e.draft();
  var h = '<div class="row' + (e.sub ? ' sub' : '') + '" data-entry="' + esc(e.id) + '"><div class="t">' + esc(e.title) + (draft ? bd('draft', 'DRAFT') : '') + (accessOf(e) === 'office' ? bd('off', 'Admin + office only') : '') + (shared ? bd('gc', 'Shared with GCs') : '') + '</div>'
    + (e.desc && !e.cat ? '<div class="w">' + esc(e.desc) + '</div>' : '');
  if (shared && ed) {
    try { rev = genRev(e.id); } catch (x) {}
    h += '<div class="w" style="margin-top:3px">' + (pub ? (pub.genRev && pub.genRev !== rev ? '⚠️ In the GC portal since ' + day(pub.at) + ' — the document changed since then: update it.' : '✅ In the GC portal since ' + day(pub.at) + '.') : '⚠️ Not in the GC portal yet.') + '</div>';
  }
  h += '<div class="acts">' + btn('view', e.id, '👁 View') + btn('print', e.id, '🖨 Print / PDF', 'g');
  if (ed && shared) h += btn('publish', e.id, CL.busy === e.id ? 'Making the PDF…' : (pub ? '📤 Update in GC portal' : '📤 Put in GC portal'), 'y', !!CL.busy);
  if (ed) h += btn('ggear', e.id, '⚙', 'g');
  if (e.id === 'safety_program' && ed) h += btn('fill', e.id, '✏️ Fill in the blanks', 'g') + btn('adopt', e.id, CL.cfg.safety.adopted ? '↺ Back to DRAFT' : '✅ Mark adopted', 'g');
  if (e.builtin && isAdmin() && typeof W._gcDocLib === 'object' && W._gcDocLib.edit) h += btn('edit', e.id, '✏️ Edit template', 'g');
  h += '</div>';
  if (ed && CL.gear === e.id) h += '<div class="frm"><label>Who can see it<select data-gg="access"><option value="all"' + (accessOf(e) === 'all' ? ' selected' : '') + '>Everyone on the staff</option><option value="office"' + (accessOf(e) === 'office' ? ' selected' : '') + '>Admin + office only</option></select></label>'
    + '<label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-gg="gc"' + (shared ? ' checked' : '') + '> Share with GCs</label>' + btn('ggsave', e.id, 'Save') + btn('cancel', e.id, 'Close', 'g') + '</div>';
  if (e.id === 'safety_program' && ed && CL.fill) h += '<div class="frm" data-fill="1">' + SF.map(function(f){ return '<label style="min-width:240px;flex:1">' + esc(f[1]) + '<input type="text" data-sf="' + esc(f[0]) + '" maxlength="300" value="' + esc(fields()[f[0]] || '') + '"></label>'; }).join('') + btn('fsave', e.id, 'Save') + btn('cancel', e.id, 'Close', 'g') + '</div>';
  return h + '</div>';
}
function rowLink(e){
  return '<div class="row" data-entry="' + esc(e.id) + '"><div class="t">' + esc(e.title) + bd('ok', 'Ready') + '</div><div class="w">' + esc(e.desc) + '</div><div class="acts"><a href="' + esc(e.url) + '" target="_blank" rel="noreferrer">📄 Open</a><a class="g" href="' + esc(e.url) + '" download>⬇ Download</a>'
    + arr(e.more).map(function(m){ return '<a class="g" href="' + esc(m[1]) + '" target="_blank" rel="noreferrer">' + esc(m[0]) + '</a>'; }).join('') + (e.sendW9 && typeof W._gcSendW9ToSub === 'function' ? btn('w9send', e.id, '✉ Send to a sub', 'g') : '') + '</div></div>';
}
function rowExtra(d){
  var ed = canEdit();
  var h = '<div class="row" data-up="' + esc(d.id) + '"><div class="t">' + esc(d.title) + (d.expires ? (days(d.expires) < 0 ? bd('bad', 'Expired ' + day(d.expires)) : days(d.expires) <= 30 ? bd('warn', 'Expires in ' + days(d.expires) + ' days') : bd('ok', 'Valid through ' + day(d.expires))) : '') + (d.access === 'office' ? bd('off', 'Admin + office only') : '') + (d.shareGc ? bd('gc', 'Shared with GCs') : '') + '</div>'
    + '<div class="w">Uploaded ' + day(d.at) + (d.name ? ' · ' + esc(d.name) : '') + '</div><div class="acts">' + btn('open-up', d.id, '👁 View / download') + (ed ? btn('gear', 'x:' + d.id, '⚙ Settings', 'g') : '') + '</div>';
  if (ed && CL.gear === 'x:' + d.id) h += gearForm({ id: 'x:' + d.id }, d);
  return h + '</div>';
}
function folderHtml(f){
  var E = entries().filter(function(e){ return e.folder === f && visible(e); }), h = '';
  if (f === 'company') {
    h += '<div class="row"><table class="info" style="width:100%;border-collapse:collapse">' + [['Legal name', GCO], ['Address', addr() || '—'], ['Phone', PHONE], ['Website', 'grayco-cs.com'], ['Licenses', 'TN #85034 (BCB) · AR #0486990627 · MS #27769'], ['Service area', 'Tennessee · Mississippi · Arkansas']].map(function(r){ return '<tr><td>' + esc(r[0]) + '</td><td><b>' + esc(r[1]) + '</b></td></tr>'; }).join('') + '</table>'
      + '<div class="w" style="margin-top:4px">The address follows ⚙ Admin → Company address (it changes everywhere on its date).</div></div>';
  }
  if (f === 'marketing') {
    var links = {}; try { links = (W._gcMktExt && W._gcMktExt.cfg && W._gcMktExt.cfg().printLinks) || {}; } catch (e) {}
    var ks = Object.keys(links).filter(function(k){ return /^https?:\/\//.test(s(links[k])); });
    h += '<div class="row"><div class="t">🖨 Print pack</div><div class="w">Brochures, door hangers, customer guides, maintenance plans — the folders set in Marketing → Brand.</div><div class="acts">'
      + ks.map(function(k){ return '<a href="' + esc(links[k]) + '" target="_blank" rel="noreferrer">' + esc(k.replace(/^\d+_/, '').replace(/_/g, ' ')) + ' ↗</a>'; }).join('')
      + (ks.length ? '' : '<span class="w">No print-pack links saved yet.</span>') + (typeof W._gcOpenMarketing === 'function' ? btn('mkt', 'brand', 'Open Marketing → Brand', 'g') : '') + '</div></div>';
  }
  if (f === 'legal' && isAdmin() && typeof W._docLibrary === 'function') h += '<div class="w" style="margin:2px 0 6px">Every contract and legal template in the CRM, filled with the company details (job fields stay blank). To fill one for a job, open the job → 📋 Documents. ' + '<a href="#" data-cl="doclib" data-id="x">✏️ Edit templates (📚 document library)</a></div>';
  var lastCat = '';
  E.forEach(function(e){
    if (e.cat && e.cat !== lastCat && (f === 'legal' || f === 'marketing' || f === 'hr')) { lastCat = e.cat; if (f === 'legal') h += '<div class="h4">' + esc(e.cat) + '</div>'; }
    h += e.type === 'slot' ? rowSlot(e) : e.type === 'link' ? rowLink(e) : rowGen(e);
  });
  extras(f).forEach(function(d){ h += rowExtra(d); });
  if (canEdit()) { h += '<div class="acts" style="margin-top:10px">' + btn('form', 'new:' + f, '＋ Add a document to this folder', 'g') + '</div>'; if (CL.form === 'new:' + f) h += uploadForm({ id: 'new:' + f, type: 'new', folder: f, kind: { insurance: 'other', tax: 'other', licenses: 'license', safety: 'safety', hr: 'hr', legal: 'legal', marketing: 'marketing', company: 'company' }[f] || 'other', access: 'all', shareGc: false }); }
  return h;
}
function html(){
  var f = CL.folder;
  var h = '<div id="gc-cl"><div class="w">Every document the company keeps, for everyone on the staff' + (canEdit() ? ' (you can upload, replace and set who sees each one)' : '') + '. Generated papers always carry the current logo and address.</div>';
  if (CL.err) h += '<div class="err">' + esc(CL.err) + '</div>';
  h += '<div class="fl" role="tablist">' + FOLDERS.map(function(x){ var n = folderAlerts(x[0]); return '<button type="button" role="tab" aria-selected="' + (x[0] === f) + '" data-cl="folder" data-id="' + x[0] + '" class="' + (x[0] === f ? 'on' : '') + '">' + x[1] + ' ' + esc(x[2]) + (n ? '<span class="n">' + n + '</span>' : '') + '</button>'; }).join('') + '</div>';
  if (CL.docs === null) h += '<div class="w">Loading the uploaded documents…</div>';
  h += folderHtml(f);
  return h + '</div>';
}
function paint(){
  try {
    if (CL.box && CL.box.isConnected) CL.box.innerHTML = html();
    var b = CL.ov && CL.ov.isConnected && D.getElementById('gc-cl-body'); if (b) b.innerHTML = html();
  } catch (e) { try { console.warn('[GC COMPANYDOCS]', e); } catch (x) {} }
}
function open(folder){
  if (!signedIn()) { toast('Sign in to the CRM first.', true); return; }
  css(); if (folder && FOLDERS.some(function(x){ return x[0] === folder; })) CL.folder = folder;
  close();
  var ov = D.createElement('div'); ov.id = 'gc-cl-ov'; ov.setAttribute('data-gc-keep', '1');
  ov.innerHTML = '<div id="gc-cl-box" role="dialog" aria-label="Company documents"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div style="font:800 18px Inter,Arial,sans-serif;color:#0f2440">📁 Company documents</div><button type="button" id="gc-cl-x" style="border:none;background:#e2e8f0;border-radius:8px;padding:8px 14px;font-weight:800;cursor:pointer">Close</button></div><div id="gc-cl-body"></div></div>';
  ov.addEventListener('click', function(e){ if (e.target === ov) close(); });
  D.body.appendChild(ov); CL.ov = ov;
  D.getElementById('gc-cl-x').onclick = close;
  paint(); refresh();
}
function close(){ try { if (CL.ov) CL.ov.remove(); } catch (e) {} CL.ov = null; }
function renderAdmin(box){ css(); CL.box = box; paint(); return refresh(); }

D.addEventListener('click', function(ev){
  var b = ev.target && ev.target.closest ? ev.target.closest('#gc-cl [data-cl]') : null; if (!b) return;
  ev.preventDefault();
  var a = b.getAttribute('data-cl'), id = b.getAttribute('data-id') || '', row = b.closest('.row') || b.closest('#gc-cl');
  if (a === 'folder') { CL.folder = id; CL.form = ''; CL.gear = ''; CL.fill = false; paint(); return; }
  if (a === 'view') { view(id, false); return; }
  if (a === 'print') { view(id, true); return; }
  if (a === 'open-up') { var d0 = live().filter(function(x){ return x.id === id; })[0]; if (d0) openUpload(d0); return; }
  if (a === 'form') { CL.form = CL.form === id ? '' : id; CL.gear = ''; paint(); return; }
  if (a === 'gear') { CL.gear = CL.gear === id ? '' : id; CL.form = ''; paint(); return; }
  if (a === 'ggear') { CL.gear = CL.gear === id ? '' : id; CL.form = ''; CL.fill = false; paint(); return; }
  if (a === 'cancel') { CL.form = ''; CL.gear = ''; CL.fill = false; paint(); return; }
  if (a === 'fill') { CL.fill = !CL.fill; CL.gear = ''; paint(); return; }
  if (a === 'doclib') { close(); W._docLibrary(); return; }
  if (a === 'edit') { close(); try { W._gcDocLib.edit(id); } catch (e) {} return; }
  if (a === 'mkt') { close(); try { W._gcOpenMarketing(); if (W._gcMkt && W._gcMkt.go) later(function(){ try { W._gcMkt.go('brand'); } catch (e) {} }, 300); } catch (e) {} return; }
  if (a === 'w9send') { var n = W.prompt('Sub name (optional — helps address the e-mail):', '') || ''; W._gcSendW9ToSub(n, ''); return; }
  if (a === 'publish') { publish(id).catch(function(){}); return; }
  if (a === 'adopt') {
    var to = !CL.cfg.safety.adopted;
    if (to && !W.confirm('Mark the Safety Program ADOPTED? The DRAFT banner comes off every copy. Do this only after your attorney and insurance carrier reviewed it and every [OWNER TO FILL] blank is filled.')) return;
    api({ action: 'docs-cfg', safety: { adopted: to } }).then(function(j){ CL.cfg = norm(j.cfg); paint(); toast(to ? 'Safety Program marked adopted.' : 'Safety Program is a DRAFT again.'); }, function(x){ toast(x.message, true); });
    return;
  }
  if (a === 'fsave') {
    var fl = {}; [].slice.call(row.querySelectorAll('[data-sf]')).forEach(function(i){ fl[i.getAttribute('data-sf')] = s(i.value); });
    api({ action: 'docs-cfg', safety: { fields: fl } }).then(function(j){ CL.cfg = norm(j.cfg); CL.fill = false; paint(); toast('Saved — the Safety Program shows them now.'); }, function(x){ toast(x.message, true); });
    return;
  }
  if (a === 'ggsave') {
    var ga = row.querySelector('[data-gg="access"]'), gg = row.querySelector('[data-gg="gc"]');
    var pub = byGen(id), sh = !!(gg && gg.checked), acc = ga ? ga.value : 'all';
    CL.gear = '';
    setGen(id, { access: acc, shareGc: sh }).then(function(){ if (pub && (pub.shareGc !== sh || pub.access !== acc)) return api({ action: 'docs-flags', id: pub.id, shareGc: sh, access: acc }).then(refresh); }).then(function(){ toast('Saved.'); }, function(x){ toast(x.message, true); });
    return;
  }
  if (a === 'gsave') {
    var frm = b.closest('[data-gear]'); if (!frm) return;
    var body = { action: 'docs-flags', id: frm.getAttribute('data-gear'), access: frm.querySelector('[data-g="access"]').value, shareGc: !!frm.querySelector('[data-g="gc"]').checked, expires: frm.querySelector('[data-g="exp"]').value };
    api(body).then(function(){ CL.gear = ''; toast('Saved.'); return refresh(); }, function(x){ toast(x.message, true); });
    return;
  }
  if (a === 'del') {
    if (!W.confirm('Remove this document? GCs will not see it any more (it stays in the history).')) return;
    api({ action: 'docs-remove', id: id }).then(function(){ CL.gear = ''; toast('Removed.'); return refresh(); }, function(x){ toast(x.message, true); });
    return;
  }
  if (a === 'save') {
    var fm = b.closest('[data-frm]'), e = /^new:/.test(id) ? { id: id, type: 'new', folder: id.slice(4), kind: { insurance: 'other', tax: 'other', licenses: 'license', safety: 'safety', hr: 'hr', legal: 'legal', marketing: 'marketing', company: 'company' }[id.slice(4)] || 'other' } : entry(id);
    if (!fm || !e) return;
    var fi = fm.querySelector('[data-f="file"]'), file = fi && fi.files && fi.files[0], exp = (fm.querySelector('[data-f="exp"]') || {}).value || '', tt = s((fm.querySelector('[data-f="title"]') || {}).value);
    if (!file) { toast('Pick the file first.', true); return; }
    if (file.size > 15 * 1048576) { toast('That file is over 15 MB — use a smaller PDF.', true); return; }
    if (e.expiry && !exp) { toast('Enter the date it is valid through.', true); return; }
    if (e.type === 'new' && !tt) { toast('Give it a title.', true); return; }
    var acc2 = fm.querySelector('[data-f="access"]').value, gc2 = !!fm.querySelector('[data-f="gc"]').checked, send = fm.querySelector('[data-f="send"]');
    CL.busy = id; paint();
    storeFile(file).then(function(m){
      return api({ action: 'docs-add', kind: e.kind || 'other', folder: e.folder, slot: e.type === 'slot' ? e.id : '', title: e.type === 'slot' ? (e.title + (exp ? ' (valid through ' + exp + ')' : '')) : tt, expires: exp, ref: m.ref, name: m.name, type: m.type, access: acc2, shareGc: gc2, sendToGcs: !!(send && send.checked && gc2), replaces: e.type === 'slot' ? undefined : false });
    }).then(function(j){ CL.busy = ''; CL.form = ''; toast(j.coiQueued ? 'Saved — the COI e-mail to ' + j.coiQueued + ' GC contact' + (j.coiQueued === 1 ? '' : 's') + ' is waiting on ✅ Approvals.' : 'Saved to Company documents.'); return refresh(); },
      function(x){ CL.busy = ''; paint(); toast(x.message, true); });
    return;
  }
}, true);

/* ── entry points ──────────────────────────────────────────────────────────── */
W._gcOpenCompanyDocuments = function(folder){ open(typeof folder === 'string' ? folder : 'tax'); };
W._gcCompanyLib = { open: open, close: close, entries: entries, render: render, view: view, print: function(id){ return view(id, true); }, refresh: refresh, publish: publish, renderAdmin: renderAdmin, forGC: forGC,
  state: function(){ return { level: level(), docs: CL.docs, cfg: CL.cfg, folder: CL.folder, err: CL.err, missing: entries().filter(function(e){ var st = status(e); return st && st.k === 'missing' && visible(e); }).map(function(e){ return e.id; }) }; },
  visible: function(id){ var e = entry(id); return !!e && visible(e); }, status: function(id){ var e = entry(id); return e ? status(e) : null; }, genRev: genRev, talks: TALKS, fields: SF };
W._gcCompanyDocsForGC = forGC;
try { console.log('[GC] 📁 Company documents library (patch COMPANYDOCS): ' + entries().length + ' entries in ' + FOLDERS.length + ' folders — _gcCompanyLib.open()'); } catch (e) {}
})();
