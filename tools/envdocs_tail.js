<!-- tools/envdocs_tail.js — patch ENVDOCS, the copy appended to the end of index.html (index.html is the source the app runs; keep the two the same) -->
<script id="gc-patch-envdocs">
/* __GC_PATCH_ENVDOCS__ — ENVDOCS: 📝 WRITTEN EMPLOYEE PROTECTION (owner 11/17: "Employee protection plan: good controls, work practices,
   medical monitoring and removal provisions, protective clothing & equipment, exposure monitoring, record keeping, hygiene facilities,
   proper training." "Make sure we have a respirator program." "Always keep records for everything." "Set up decon unit for lead."
   "Make sure all signs for env work are designed for GrayCo." "GrayCo will hire an asbestos contractor for now.")
   Builds on ENVCOMP (window._gcEnvComp, envcomp-core.js). On every env job's 🛡 Compliance panel:
   • 7 · Employee Protection Plan — the per-job written compliance plan generated from the panel's data (CORE.buildPlan), printable
     PDF with signature lines; ✍ competent person + ✍ owner e-signatures; every version kept forever (envLog kind 'epp'); ⚠ until
     generated and signed (⛔ when ⚙ Written programs → "plan missing blocks"); a new version is asked for when the job changes.
   • Asbestos work by: Licensed sub (default) / GrayCo crew; the licensed sub's papers (license, competent person, work plan, cards,
     insurance, the state notice, the release) collected and kept (envComp.asbSub + envLog 'asbsub').
   • 🧼 Decon unit (lead): the set-up checklist + photo (envLog 'decon'), the one-page checklist with the layout diagram, the purchase list.
   • 🪧 Signs: the job's sign set in the company's branding (letter / 11×17 / 18×24, English / Spanish) — the legend printed exactly as
     written; also in Marketing → 🖨 Print pack → "Environmental signs".
   • ⚙ Written programs (admins): administrator name / phone, approved by / date, last review per program (the yearly review → a To-Do),
     in use (the GrayCo Asbestos Program is NOT in use); 📄 a filled copy of each Word program (administrator, approval, current address).
   API: window._gcEnvDocs = { generate(pid), sign(pid, recId, role), planHtml(rec, p), planPdf(pid, recId), setAsbBy(pid, by), saveSub(pid, v),
        saveDecon(pid, v), programsSheet(), savePrograms(list, settings), fillDocx(id), signsHtml(ids, opt), printSigns(ids, opt), sweep() } */
(function(W){
'use strict';
if (W.__GC_PATCH_ENVDOCS__) return; W.__GC_PATCH_ENVDOCS__ = true;
var D = W.document, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
var EC = W._gcEnvComp, CORE = W._gcEnvCompCore; if (!EC || !CORE || !EC._x) { try { console.warn('[GC ENVDOCS] ENVCOMP not loaded'); } catch (e) {} return; }
var X = EC._x, esc = X.esc, nice = X.nice, today = X.today, me = X.me, toast = X.toast;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x != null; }) : []; }
function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function R(){ return EC.rules(); }
function proj(pid){ return X.proj(pid); }
function ctx(){ return X.ctx(); }
function coOf(p){ var id = 'environmental'; try { id = p ? X.company(p) : 'environmental'; } catch (e) {} var g = function(k){ try { return W._gcCo && W._gcCo.get ? W._gcCo.get(k) : null; } catch (e) { return null; } }; return { co: g(id) || {}, fb: g('construction') || {} }; }
function brand(p){ var c = coOf(p); return CORE.signBrand(c.co, c.fb); }
function addr(){ try { return W._gcCompanyAddress ? W._gcCompanyAddress() : ''; } catch (e) { return ''; } }
function btn(a, label, extra, cls){ return '<button type="button"' + (cls ? ' class="' + cls + '"' : '') + ' data-ed="' + a + '"' + (extra || '') + '>' + label + '</button>'; }
function stTxt(st){ return st === 'ok' ? '✅' : st === 'block' ? '⛔' : st === 'wait' ? '·' : '⚠'; }

/* ═════ the panel sections (called by ENVCOMP's html(); plain strings so the panel only repaints when they change) ═════ */
W._gcEnvDocsPanel = function(p, E){
  var off = X.office(), ad = X.admin(), Rr = R(), h = '', EC0 = obj(p.envComp);
  /* 7 · the plan */
  var PS = E.plan || CORE.planState(p, E, Rr), L = CORE.plans(p), it = E.items.find(function(x){ return x.id === 'epp'; }) || { st: 'due', label: 'Employee Protection Plan', note: PS.note };
  h += '<div class="sec" data-ed-sec="plan">7 · Employee Protection Plan ' + (off ? btn('plan', '📝 ' + (L.length ? 'Generate a new version (v' + (L.length + 1) + ')' : 'Generate the plan'), '', 'g') + btn('planin', '✏️ Plan details') : '') + '</div>' + X.rowH(it);
  L.slice().reverse().slice(0, 6).forEach(function(r){
    var g = obj(r.signed), cur = r === L[L.length - 1];
    h += '<div class="r" data-ed-plan="' + esc(r.id) + '"><div class="l"><b>v' + esc(r.v) + '</b> · ' + esc(nice(r.date)) + ' · ' + esc(r.by) + (cur ? (PS.st === 'stale' ? ' ' + X.chip('due', 'out of date') : '') : ' <span class="m">(earlier version — kept)</span>')
      + '<div class="m">Competent person: ' + (obj(g.cp).name ? '✍ ' + esc(g.cp.name) + ' ' + esc(new Date(g.cp.at).toLocaleString()) : 'not signed') + ' · Owner: ' + (obj(g.owner).name ? '✍ ' + esc(g.owner.name) + ' ' + esc(new Date(g.owner.at).toLocaleString()) : 'not signed') + '</div></div><div class="b">'
      + btn('planprint', '🖨 Print / PDF', ' data-id="' + esc(r.id) + '"') + (cur && !obj(g.cp).name ? btn('signcp', '✍ Sign — competent person', ' data-id="' + esc(r.id) + '"') : '') + (cur && ad && !obj(g.owner).name ? btn('signown', '✍ Owner approval', ' data-id="' + esc(r.id) + '"') : '') + '</div></div>';
  });
  if (L.length > 6) h += '<div class="m">' + (L.length - 6) + ' earlier version(s) kept (record package).</div>';
  /* the licensed asbestos sub */
  if (E.kinds.indexOf('asbestos') >= 0) {
    var by = E.asbBy || CORE.asbBy(p, Rr), PI = CORE.programInfo(Rr, 'asbcrew', ctx());
    h += '<div class="sec" data-ed-sec="asb">☣️ Asbestos work by ' + (off ? '<select data-ed-asb="1" aria-label="Who does the asbestos work"><option value="sub"' + (by === 'sub' ? ' selected' : '') + '>Licensed abatement sub' + (s(obj(Rr.settings).asbDefault) !== 'crew' ? ' (default)' : '') + '</option><option value="crew"' + (by === 'crew' ? ' selected' : '') + '>GrayCo crew' + (PI.inUse ? '' : ' — program NOT in use') + '</option></select>' : '<b>' + (by === 'sub' ? 'a licensed abatement sub' : 'GrayCo crew') + '</b>') + (by === 'sub' && off ? ' ' + btn('sub', '✏️ Licensed sub info') : '') + '</div>';
    if (by === 'sub') { var S = CORE.subOf(p); h += '<div class="m">' + (s(S.company) ? '<b>' + esc(S.company) + '</b>' + (S.license ? ' · license #' + esc(S.license) : '') + (S.competent ? ' · competent person ' + esc(S.competent) : '') : 'The sub\'s papers are collected and kept here.') + ' GrayCo crew: awareness level — stay out of the regulated area; stop work if suspect material is found.</div>';
      E.items.filter(function(x){ return x.sec === 'sub'; }).forEach(function(x){ var f = obj(S[x.field]); h += X.rowH(x, f.file ? X.fileLink(f.file) : ''); }); }
    else h += '<div class="m">GrayCo\'s own crew does the asbestos work — the GrayCo Asbestos Program applies' + (PI.inUse ? '' : ' <b style="color:#991b1b">(marked NOT IN USE in ⚙ Written programs — put it in use first, or use a licensed sub)</b>') + '.</div>';
  }
  /* the decon unit */
  var dI = E.items.find(function(x){ return x.sec === 'decon'; });
  if (dI || (off && E.kinds.some(function(k){ return /^lead/.test(k); }))) {
    var DR = CORE.deconRec(p), req = obj(EC0.decon).required;
    h += '<div class="sec" data-ed-sec="decon">🧼 Decon unit / hygiene ' + (dI && off ? btn('decon', '🧼 Decon set-up checklist', '', 'g') : '') + btn('deconblank', '🖨 Blank checklist + layout') + btn('purchase', '🛒 Purchase list')
      + (off ? ' <select data-ed-decon="1" aria-label="Decon unit on this job"><option value="">auto' + (CORE.hasKind(obj(Rr.decon), E.kinds) ? ' (required)' : ' (not required)') + '</option><option value="yes"' + (req === true ? ' selected' : '') + '>required on this job</option><option value="no"' + (req === false ? ' selected' : '') + '>not needed on this job</option></select>' : '') + '</div>';
    if (dI) h += X.rowH(dI, DR ? arr(DR.photos).slice(0, 3).map(X.fileLink).join(' ') : '');
  }
  /* TCLP: the waste streams */
  if (CORE.wasteOn(p, E.kinds, Rr)) {
    var WS = E.items.filter(function(x){ return x.sec === 'waste'; });
    h += '<div class="sec" data-ed-sec="waste">♻️ Waste — TCLP characterization ' + (off ? btn('wstream', '＋ Waste stream') + btn('tclp', '🧪 Log TCLP sample', '', 'g') + btn('wgk', '📄 Generator knowledge') + btn('wship', '🚚 Shipment / disposal') : '') + '</div><div class="m">Threshold: ' + esc(CORE.tclpThreshold(Rr)) + ' mg/L lead (' + esc(s(obj(Rr.settings).tclpNote)) + '). A stream cannot be disposed of until it is characterized.</div>';
    WS.forEach(function(x){ var w = CORE.wasteStreams(p, Rr).find(function(z){ return z.key === s(x.id).slice(6); }) || { tclp: [] }, pend = w.tclp.filter(function(r){ return r.cls === 'pending'; })[0], rf = w.rec && w.rec.file; h += X.rowH(x, (rf ? X.fileLink(rf) : '') + (pend && off ? btn('tclpres', '🧪 Lab result', ' data-id="' + esc(pend.id) + '"') : '')); });
  }
  /* the signs */
  var SG = CORE.jobSigns(p, E.kinds, Rr);
  h += '<div class="sec" data-ed-sec="signs">🪧 Signs ' + btn('signs', '🖨 Print this job\'s signs') + ' <select data-ed-size="1" aria-label="Sign size">' + CORE.SIGN_SIZES.map(function(z){ return '<option value="' + z.key + '">' + esc(z.label) + '</option>'; }).join('') + '</select> <label style="text-transform:none;letter-spacing:0;font-weight:600;color:#0f172a"><input type="checkbox" data-ed-bi="1" checked> English + Spanish</label></div>'
    + '<div class="m">' + SG.map(function(g){ return esc(g.title); }).join(' · ') + '. ' + esc(CORE.SIGN_NOTE) + '</div>';
  if (ad) h += '<div class="m" style="margin-top:6px">' + btn('programs', '⚙ Written programs (administrators, approval, review)') + '</div>';
  return h;
};

/* ═════ the plan: generate, sign, print ═════ */
function company(p){ var c = coOf(p), b = brand(p); return { name: b.name, phone: b.phone, address: s(c.co.address) || addr(), logo: b.logo }; }
function generate(pid){
  var p = proj(pid); if (!p) return null; if (!X.office()) { toast('Only the office or an admin generates the plan.', true); return null; }
  var c0 = ctx(), E = EC.evaluate(p), L = CORE.plans(p), v = L.length + 1;
  var P = CORE.buildPlan(p, Object.assign({}, c0, { E: E }), { v: v, by: me(), company: company(p) });
  var rec = X.addLog(pid, { kind: 'epp', v: v, fp: P.fp, date: today(), plan: P, signed: {}, versions: [] });
  toast('📝 Employee Protection Plan v' + v + ' saved — print it and sign it (competent person, owner). Every version is kept.');
  return rec;
}
function canSignCp(p, r){ if (X.office()) return true; var E = EC.evaluate(p), n = low(me()); return E.people.some(function(c){ return c.role === 'supervisor' && low(c.name) === n; }) || low(obj(obj(p.envComp).planInput).competent) === n; }
function sign(pid, id, role){
  var p = proj(pid), r = p && CORE.plans(p).find(function(x){ return x.id === id; }); if (!r) return false;
  if (role === 'owner' && !X.admin()) { toast('The owner\'s approval is signed by an admin.', true); return false; }
  if (role === 'cp' && !canSignCp(p, r)) { toast('The competent person (the job\'s supervisor) or the office signs here.', true); return false; }
  if (!W.confirm((role === 'owner' ? 'Owner approval' : 'Competent person') + ': I have read Employee Protection Plan v' + r.v + ' for ' + s(p.name) + ' and it will be followed on this job.\n\nSign as ' + me() + '?')) return false;
  var now = X.nowIso();
  X.saveJob(pid, function(q){ q.envLog = arr(q.envLog).map(function(x){ if (!x || x.id !== id) return x; var sg = Object.assign({}, obj(x.signed)); sg[role] = { name: me(), email: X.myEmail(), at: now }; return Object.assign({}, x, { signed: sg, versions: arr(x.versions).concat([{ at: now, by: me(), prev: { signed: obj(x.signed) } }]) }); }); return q; });
  toast('✍ Signed — ' + (role === 'owner' ? 'owner approval' : 'competent person') + ' (' + me() + ').');
  return true;
}
function planHtml(r, p){
  var P = obj(r.plan), g = obj(r.signed);
  var sig = function(lbl, x){ return '<td style="width:50%;padding:18px 8px 4px;vertical-align:bottom"><div style="border-bottom:1px solid #111;min-height:22px">' + (obj(x).name ? '<i>✍ ' + esc(x.name) + '</i> — e-signed ' + esc(new Date(x.at).toLocaleString()) : '') + '</div><div style="font-size:11px">' + esc(lbl) + ' — signature / date</div></td>'; };
  var b = brand(p);
  var inner = '<div style="text-align:center">' + (b.logo ? '<img src="' + esc(b.logo) + '" alt="" style="max-height:54px"><br>' : '') + '<b style="font-size:15px">' + esc(b.name) + '</b><div style="font-size:11px">' + esc(company(p).address) + ' · ' + esc(b.phone) + '</div></div>'
    + '<h1 style="font-size:19px;text-align:center;margin:10px 0 2px">EMPLOYEE PROTECTION PLAN</h1><div style="text-align:center;font-size:12px">' + esc(P.job) + ' · version ' + esc(r.v) + ' · ' + esc(nice(r.date)) + '</div><div class="m" style="text-align:center;margin:4px 0 8px">' + esc(P.note) + '</div>';
  arr(P.sections).forEach(function(x){
    inner += '<div class="sec">' + esc(x.h) + '</div>';
    if (arr(x.rows).length) inner += '<table>' + x.rows.map(function(rw){ return '<tr><th style="width:32%">' + esc(rw[0]) + '</th><td>' + esc(rw[1]) + '</td></tr>'; }).join('') + '</table>';
    arr(x.text).forEach(function(t){ inner += '<div style="margin:2px 0 2px 10px">• ' + esc(t) + '</div>'; });
  });
  inner += '<div class="sec">Signatures</div><table style="border:0"><tr>' + sig('Competent person', g.cp) + sig('Owner', g.owner) + '</tr></table><div class="m">Kept forever with the job\'s compliance records (every version).</div>';
  return X.printable('Employee Protection Plan v' + r.v + ' — ' + s(P.job), inner);
}
function planPdf(pid, id){
  var p = proj(pid), r = p && CORE.plans(p).find(function(x){ return x.id === id; }); if (!r) return Promise.resolve(null);
  var html = planHtml(r, p), L = CORE.planLines(r.plan), g = obj(r.signed); W.__gcEdPlan = { pid: s(pid), id: id, v: r.v, html: html, lines: L };
  var name = 'GrayCo_Employee_Protection_Plan_' + s(p.name || pid).replace(/[^A-Za-z0-9]+/g, '_') + '_v' + r.v + '.pdf', b = brand(p);
  return X.loadJsPdf().then(function(J){
    var doc = new J({ unit: 'pt', format: 'letter' }), y = 46, M = 44, Wd = 612 - M * 2;
    var put = function(txt, sz, bold, center){ doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(sz); doc.splitTextToSize(s(txt).replace(/[^\x00-\xFF•–—→✍✓]/g, ''), Wd).forEach(function(line){ if (y > 748) { doc.addPage(); y = 46; } if (center) doc.text(line, 306, y, { align: 'center' }); else doc.text(line, M, y); y += sz + 3.5; }); };
    put(b.name, 13, true, true); put(company(p).address + ' · ' + b.phone, 8.5, false, true); y += 4;
    L.forEach(function(x){ if (x.h) put(x.h.toUpperCase(), 14, true, true); else if (x.h2) { y += 4; put(x.h2, 11, true); } else put(x.t, 9, false); });
    y += 26; if (y > 700) { doc.addPage(); y = 80; }
    [['Competent person', g.cp], ['Owner', g.owner]].forEach(function(z, i){ var x0 = M + i * (Wd / 2 + 6); doc.setFontSize(9); if (obj(z[1]).name) doc.text('e-signed: ' + z[1].name + ' ' + new Date(z[1].at).toLocaleString(), x0, y - 4); doc.line(x0, y, x0 + Wd / 2 - 12, y); doc.text(z[0] + ' — signature / date', x0, y + 11); });
    doc.save(name); return { ok: true, pdf: true };
  }).catch(function(){ var w = W.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); try { w.print(); } catch (e) {} } return { ok: true, pdf: false }; });
}
function planForm(pid){
  var p = proj(pid); if (!p) return; var I = obj(obj(p.envComp).planInput);
  X.modal('✏️ Plan details — ' + s(p.name), '<div class="m">What the plan cannot read from the job. A change asks for a new plan version (the old one is kept).</div>'
    + X.fld('scope', 'Scope of work', 'textarea', s(I.scope) || s(p.scope || p.scopeOfWork || p.description)) + X.fld('tasks', 'Tasks that cause exposure', 'textarea', s(I.tasks), 'e.g. wet-scraping window trim, removing VCT and mastic')
    + X.fld('basis', 'Basis for the expected exposure (test results / survey / prior monitoring)', 'textarea', s(I.basis), 'e.g. Terracon report 10/2026 — window trim 2.1 mg/cm² XRF')
    + X.fld('respirators', 'Respirators for this job', 'text', s(I.respirators), 'e.g. half-face with P100 filters') + X.fld('competent', 'GrayCo competent person (blank = the job\'s supervisor)', 'text', s(I.competent))
    + X.fld('inspection', 'Inspection schedule added for this job', 'text', s(I.inspection)) + X.fld('hospital', 'Nearest hospital (name, address, phone)', 'text', s(I.hospital)) + X.fld('emergency', 'Other emergency contacts', 'text', s(I.emergency)),
    function(v){ var keep = {}; ['scope', 'tasks', 'basis', 'respirators', 'competent', 'inspection', 'hospital', 'emergency'].forEach(function(k){ if (s(v[k])) keep[k] = s(v[k]); }); X.setEC(pid, function(E0){ if (E0.planInput) E0.planInputHistory = arr(E0.planInputHistory).concat([{ at: X.nowIso(), by: me(), prev: E0.planInput }]); E0.planInput = keep; return E0; }); toast('✏️ Plan details saved.'); return true; }, 'Save');
}

/* ═════ the licensed asbestos sub ═════ */
function setAsbBy(pid, by){
  if (!X.office()) return false; by = by === 'crew' ? 'crew' : 'sub';
  if (by === 'crew' && !CORE.programInfo(R(), 'asbcrew', ctx()).inUse && !W.confirm('The GrayCo Asbestos Program is marked NOT IN USE (GrayCo hires a licensed asbestos contractor for now). Set this job to "GrayCo crew" anyway? The panel will show the program as due until an admin puts it in use.')) { X.paintSoon(); return false; }
  return X.setEC(pid, function(E0){ E0.asbByHistory = arr(E0.asbByHistory).concat([{ at: X.nowIso(), by: me(), from: s(E0.asbBy) || 'default', to: by }]); E0.asbBy = by; return E0; });
}
var RECV = [['workPlan', 'Work plan received'], ['workers', 'Worker license cards / certificates received'], ['insurance', 'Insurance certificate (incl. pollution liability) received'], ['notice', 'State notification — copy / confirmation received'], ['release', 'Written release of the area (after clearance)']];
function subForm(pid){
  var p = proj(pid); if (!p) return; var S = CORE.subOf(p);
  var inner = '<div class="m">The licensed asbestos abatement contractor on this job. Every copy is kept (each save is a record; nothing is replaced).</div><div class="grid">'
    + X.fld('company', 'Company', 'text', s(S.company)) + X.fld('license', 'State license #', 'text', s(S.license)) + X.fld('state', 'License state(s)', 'text', s(S.state), 'TN / AR / MS') + X.fld('licenseExp', 'License expires', 'date', s(S.licenseExp))
    + X.fld('competent', 'Sub\'s competent person / supervisor', 'text', s(S.competent)) + X.fld('competentLic', 'Supervisor license #', 'text', s(S.competentLic)) + X.fld('competentPhone', 'Supervisor phone', 'tel', s(S.competentPhone)) + X.fld('phone', 'Office phone / e-mail', 'text', s(S.phone)) + '</div>'
    + X.fileIn('licfile', 'License copy (PDF / photo)', false, 'application/pdf,image/*')
    + RECV.map(function(q){ var v = obj(S[q[0]]); return '<div class="sec">' + esc(q[1]) + '</div><div class="grid">' + X.fld('on_' + q[0], 'Received on', 'date', s(v.on)) + (q[0] === 'notice' ? X.fld('conf', 'Confirmation #', 'text', s(v.conf)) : '') + X.fileIn('f_' + q[0], 'Copy', false, 'application/pdf,image/*') + '</div>' + (v.file ? '<div class="m">On file: ' + X.fileLink(v.file) + '</div>' : ''); }).join('');
  X.modal('☣️ Licensed asbestos sub — ' + s(p.name), inner, function(v){ return saveSub(pid, v); }, 'Save');
}
function saveSub(pid, v){
  var p = proj(pid); if (!p) return Promise.resolve(false); v = v || {}; var files = obj(v.files);
  var keys = ['licfile'].concat(RECV.map(function(q){ return 'f_' + q[0]; }));
  return Promise.all(keys.map(function(k){ return X.storeAll(files[k], pid).then(function(F){ return [k, F[0] || null]; }); })).then(function(FL){
    var F = {}; FL.forEach(function(x){ if (x[1]) F[x[0]] = x[1]; });
    var cur = CORE.subOf(p), nx = Object.assign({}, cur);
    ['company', 'license', 'state', 'licenseExp', 'competent', 'competentLic', 'competentPhone', 'phone'].forEach(function(k){ if (v[k] != null) nx[k] = s(v[k]); });
    if (F.licfile) nx.licenseFile = F.licfile;
    RECV.forEach(function(q){ var k = q[0], o = Object.assign({}, obj(cur[k])); if (v['on_' + k] != null) o.on = s(v['on_' + k]); if (k === 'notice' && v.conf != null) o.conf = s(v.conf); if (F['f_' + k]) o.file = F['f_' + k]; if (o.on || o.file) nx[k] = o; else delete nx[k]; });
    nx.at = X.nowIso(); nx.by = me();
    X.setEC(pid, function(E0){ if (E0.asbSub) E0.asbSubHistory = arr(E0.asbSubHistory).concat([{ at: X.nowIso(), by: me(), prev: E0.asbSub }]); E0.asbSub = nx; return E0; });
    ST.call(W, function(){ X.addLog(pid, { kind: 'asbsub', date: today(), sub: JSON.parse(JSON.stringify(nx)), files: Object.keys(F).map(function(k){ return F[k]; }) }); }, 80);
    toast('☣️ Licensed sub saved — kept with the job\'s records.'); return true;
  });
}

/* ═════ the decon unit ═════ */
function deconForm(pid){
  var p = proj(pid); if (!p) return; var Rr = R(), DC = obj(Rr.decon), last = CORE.deconRec(p) || {}, ck = obj(last.checks);
  var inner = '<div class="m">' + esc(DC.note) + '</div><div class="grid">' + X.sel('type', 'Type', CORE.listOf(DC.types), s(last.type) || CORE.listOf(DC.types)[0]) + X.fld('location', 'Location (where on the site)', 'text', s(last.location))
    + X.fld('setBy', 'Set up by', 'text', s(last.setBy) || me()) + X.fld('setOn', 'Set up on', 'date', s(last.setOn) || today()) + '</div>'
    + '<div class="sec">Set-up checklist</div>' + arr(DC.setup).map(function(t, i){ return '<label class="chk"><input type="checkbox" data-c="' + i + '"' + (ck[i] ? ' checked' : '') + '><span>' + esc(t) + '</span></label>'; }).join('')
    + X.fld('water', 'Wash water — how it is collected / filtered / disposed on this job', 'text', s(last.water)) + (arr(last.photos).length ? '<div class="m">Photos on file: ' + arr(last.photos).map(X.fileLink).join(' ') + '</div>' : '') + X.fileIn('photos', '📷 Photo(s) of the set-up (required)', true, 'image/*');
  X.modal('🧼 Decon unit set-up — ' + s(p.name), inner, function(v){ return saveDecon(pid, v); }, 'Save the set-up');
}
function saveDecon(pid, v){
  var p = proj(pid); if (!p) return Promise.resolve(false); v = v || {}; var last = CORE.deconRec(p) || {};
  return X.storeAll((v.files && v.files.photos) || v.photos, pid).then(function(ph){
    var checks = {}; Object.keys(obj(v.chk)).forEach(function(k){ if (/^\d+$/.test(k)) checks[k] = true; });
    var rec = X.addLog(pid, { kind: 'decon', date: today(), type: s(v.type), location: s(v.location), setBy: s(v.setBy) || me(), setOn: s(v.setOn) || today(), checks: checks, water: s(v.water), photos: arr(last.photos).concat(ph), prevId: last.id || '' });
    var DS = CORE.deconState(Object.assign({}, p, { envLog: arr(p.envLog).concat([rec]) }), R());
    toast(DS.st === 'ok' ? '🧼 Decon set-up saved — checklist complete with ' + DS.photos + ' photo(s).' : '🧼 Saved — ' + DS.done + '/' + DS.total + ' items, ' + DS.photos + ' photo(s): the panel shows ⚠ until the checklist is complete and photographed.', DS.st !== 'ok');
    return true;
  });
}
function deconBlankHtml(){
  var DC = obj(R().decon), b = brand(null);
  var box = function(t, sub, col){ return '<div style="flex:1;border:2px solid #111;background:' + col + ';padding:8px;min-height:90px;text-align:center"><b>' + t + '</b><div style="font-size:11px">' + sub + '</div></div>'; };
  var ar = '<div style="align-self:center;font-size:26px;padding:0 4px">→</div>';
  var inner = '<div style="text-align:center"><b>' + esc(b.name) + '</b><div style="font-size:11px">' + esc(addr()) + ' · ' + esc(b.phone) + '</div></div><h1 style="text-align:center;font-size:19px">LEAD DECON UNIT SET-UP CHECKLIST</h1><div class="m" style="text-align:center">' + esc(DC.note) + '</div>'
    + '<table><tr><th>Job</th><td></td><th>Date set up</th><td></td></tr><tr><th>Set up by</th><td></td><th>Type</th><td></td></tr><tr><th>Location</th><td colspan="3"></td></tr></table>'
    + '<div class="sec">Layout — one-way flow</div><div data-ed-diagram="1" style="display:flex;gap:4px;align-items:stretch">' + box('WORK AREA', 'containment', '#fee2e2') + ar + box('DIRTY ROOM', 'equipment room · suits, booties, gloves off · bag-out · HEPA vac', '#fecaca') + ar + box('WASH', 'shower or hand &amp; face wash · soap · towels · wash water collected', '#dbeafe') + ar + box('CLEAN ROOM', 'street clothes · lockers / bags · mirror', '#dcfce7') + ar + '<div style="align-self:center"><b>EXIT</b></div></div>'
    + '<div class="sec">Set-up checklist (each item: default — confirm with your state program)</div>' + arr(DC.setup).concat(['Photo of the set-up taken and added in the CRM']).map(function(t){ return '<div>☐ ' + esc(t) + '</div>'; }).join('')
    + '<div class="sec">Supplies</div><div>' + esc(DC.supplies) + '</div><table style="margin-top:18px"><tr><th>Competent person signature</th><td style="width:45%"></td><th>Date</th><td></td></tr></table>';
  return X.printable('Lead decon unit set-up checklist', inner);
}
function purchaseHtml(){
  var b = brand(null), g = '';
  var rows = CORE.DECON_PURCHASE.map(function(x){ var head = x.group !== g ? (g = x.group, '<tr><th colspan="5" style="background:#f1f5f9">' + esc(x.group) + '</th></tr>') : ''; return head + '<tr><td>☐</td><td>' + esc(x.item) + (x.note ? '<div class="m">' + esc(x.note) + '</div>' : '') + '</td><td>' + esc(x.qty) + '</td><td style="width:16%"></td><td style="width:12%"></td></tr>'; }).join('');
  return X.printable('Portable lead decon unit — purchase list', '<div style="text-align:center"><b>' + esc(b.name) + '</b></div><h1 style="text-align:center;font-size:19px">PORTABLE LEAD DECON UNIT — PURCHASE LIST</h1><div class="m" style="text-align:center">Quantities are starting points; vendors and prices to fill in. Requirements: confirm with your state program.</div><table><thead><tr><th></th><th>Item</th><th>Qty</th><th>Vendor</th><th>Price</th></tr></thead><tbody>' + rows + '</tbody></table><table style="margin-top:14px"><tr><th>Total</th><td></td><th>Approved by (owner)</th><td></td></tr></table>');
}
function openHtml(html, key){ W['__gcEd' + key] = html; var w = W.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); try { w.focus(); } catch (e) {} } else toast('Allow pop-ups to print.', true); return html; }

/* ═════ ♻️ TCLP waste characterization (owner: "TCLP") ═════ */
function streamsOf(p){ var Rr = R(), L = CORE.wasteStreams(p, Rr).map(function(w){ return w.stream; }); CORE.listOf(obj(Rr.waste).streams).forEach(function(n){ if (!L.some(function(x){ return CORE.streamKey(x) === CORE.streamKey(n); })) L.push(n); }); return L; }
function addStream(pid, name){ name = s(name); if (!name) return false; return X.setEC(pid, function(E0){ var L = arr(E0.wasteStreams); if (!L.some(function(x){ return CORE.streamKey(x && typeof x === 'object' ? x.name : x) === CORE.streamKey(name); })) E0.wasteStreams = L.concat([{ name: name, by: me(), at: X.nowIso() }]); return E0; }); }
function streamSel(p, val){ return X.sel('stream', 'Waste stream', [['', '—']].concat(streamsOf(p).map(function(n){ return [n, n]; })), val || '') + X.fld('streamNew', '…or a new waste stream', 'text', '', 'e.g. Window sash debris'); }
function pickStream(v){ return s(v.streamNew) || s(v.stream); }
function tclpForm(pid){
  var p = proj(pid); if (!p) return; var th = CORE.tclpThreshold(R());
  X.modal('🧪 TCLP sample — ' + s(p.name), '<div class="m">Toxicity Characteristic Leaching Procedure. The result (lead, mg/L) is compared with ' + esc(th) + ' mg/L — ' + esc(s(obj(R().settings).tclpNote)) + '. At or above it the stream is HAZARDOUS.</div>' + streamSel(p) + '<div class="grid">'
    + X.fld('date', 'Sample date', 'date', today()) + X.fld('sampler', 'Sampler', 'text', me()) + X.fld('containers', 'Container / bag IDs sampled', 'text', '', 'e.g. B-01 to B-12, drum D-3') + X.fld('lab', 'Lab', 'text', '')
    + X.fld('coc', 'Chain-of-custody #', 'text', '') + X.fld('result', 'Result — lead (mg/L); blank while waiting on the lab', 'text', '', 'e.g. 0.8 or <0.5') + '</div>' + X.fileIn('file', 'Lab report (PDF / photo)', false, 'application/pdf,image/*'),
    function(v){ return logTclp(pid, v); }, 'Save the sample');
}
function logTclp(pid, v){
  var p = proj(pid); if (!p) return Promise.resolve(false); v = v || {}; var st = pickStream(v);
  if (!st) { toast('Pick the waste stream.', true); return Promise.resolve(false); }
  var th = CORE.tclpThreshold(R()), files = v.files && v.files.file ? v.files.file : (v.file ? [v.file] : []);
  return X.storeAll(files, pid).then(function(F){
    var cls = CORE.tclpClass(v.result, th);
    addStream(pid, st);
    ST.call(W, function(){ X.addLog(pid, { kind: 'tclp', stream: st, date: s(v.date) || today(), sampler: s(v.sampler) || me(), containers: s(v.containers), lab: s(v.lab), coc: s(v.coc), analyte: 'lead', result: s(v.result), threshold: th, cls: cls, file: F[0] || null, versions: [] }); }, 60);
    toast(cls === 'pending' ? '🧪 TCLP sample logged — waiting on the lab (the stream stays ⚠ until the result).' : '🧪 TCLP ' + s(v.result) + ' mg/L lead vs ' + th + ' → ' + cls.toUpperCase() + '.', cls === 'hazardous');
    return true;
  });
}
function tclpResult(pid, id, result, file){
  var th = CORE.tclpThreshold(R());
  return X.storeAll(file ? [file] : [], pid).then(function(F){
    return X.saveJob(pid, function(q){ q.envLog = arr(q.envLog).map(function(r){ if (!r || r.id !== id) return r; var prev = { result: r.result, cls: r.cls, file: r.file || null }; return Object.assign({}, r, { result: s(result), threshold: th, cls: CORE.tclpClass(result, th), file: F[0] || r.file || null, versions: arr(r.versions).concat([{ at: X.nowIso(), by: me(), prev: prev }]) }); }); return q; });
  });
}
function gkForm(pid){
  var p = proj(pid); if (!p) return;
  X.modal('📄 Generator knowledge — ' + s(p.name), '<div class="m">Characterize a stream without a TCLP test only with a documented basis (what the material is, the process, prior test data). ' + esc(s(obj(R().settings).tclpNote)) + '.</div>' + streamSel(p)
    + X.sel('cls', 'Classification', [['non-hazardous', 'Non-hazardous'], ['hazardous', 'Hazardous']], 'non-hazardous') + X.fld('basis', 'Basis (required)', 'textarea', '', 'e.g. TCLP of the same paint system on this building, 10/2026 lab report #123: 0.4 mg/L') + X.fileIn('file', 'Supporting document', false, 'application/pdf,image/*'),
    function(v){ return logGk(pid, v); }, 'Save');
}
function logGk(pid, v){
  v = v || {}; var st = pickStream(v);
  if (!st || !s(v.basis)) { toast('The waste stream and the basis are both required.', true); return Promise.resolve(false); }
  return X.storeAll(v.files && v.files.file, pid).then(function(F){ addStream(pid, st); ST.call(W, function(){ X.addLog(pid, { kind: 'wgk', stream: st, date: today(), cls: s(v.cls) === 'hazardous' ? 'hazardous' : 'non-hazardous', basis: s(v.basis), file: F[0] || null }); }, 60); toast('📄 Generator knowledge saved for "' + st + '".'); return true; });
}
function shipForm(pid){
  var p = proj(pid); if (!p) return;
  X.modal('🚚 Waste shipment / disposal — ' + s(p.name), '<div class="m">Hazardous: manifest #, hauler, TSD facility, generator status. Non-hazardous: the landfill and its acceptance letter. A stream that is not characterized cannot be disposed of.</div>' + streamSel(p) + '<div class="grid">'
    + X.fld('date', 'Shipped on', 'date', today()) + X.fld('containers', 'Containers / bags', 'text', '') + X.fld('qty', 'Quantity', 'text', '', 'e.g. 12 bags, 2 drums')
    + X.fld('manifest', 'Manifest # (hazardous)', 'text', '') + X.fld('hauler', 'Hauler (hazardous)', 'text', '') + X.fld('tsd', 'TSD facility (hazardous)', 'text', '') + X.sel('generatorStatus', 'Generator status (hazardous — confirm)', ['', 'VSQG', 'SQG', 'LQG'], '')
    + X.fld('landfill', 'Landfill (non-hazardous)', 'text', '') + X.fld('acceptanceOn', 'Acceptance letter date (non-hazardous)', 'date', '') + X.fld('disposedOn', 'Disposed on', 'date', '') + '</div>'
    + X.fileIn('acc', 'Acceptance letter / manifest copy', false, 'application/pdf,image/*'), function(v){ return logShip(pid, v); }, 'Save');
}
function logShip(pid, v){
  var p = proj(pid); if (!p) return Promise.resolve(false); v = v || {}; var st = pickStream(v);
  if (!st) { toast('Pick the waste stream.', true); return Promise.resolve(false); }
  if (!CORE.canDispose(p, st, R())) { toast('⛔ "' + st + '" is not characterized yet — log its TCLP result (or generator knowledge with the basis) before it is shipped or disposed of.', true); return Promise.resolve(false); }
  var w = CORE.wasteStreams(p, R()).find(function(x){ return x.key === CORE.streamKey(st); });
  return X.storeAll(v.files && v.files.acc, pid).then(function(F){
    var rec = { kind: 'wship', stream: st, cls: w.cls, date: s(v.date) || today(), containers: s(v.containers), qty: s(v.qty), manifest: s(v.manifest), hauler: s(v.hauler), tsd: s(v.tsd), generatorStatus: s(v.generatorStatus), landfill: s(v.landfill), acceptanceOn: s(v.acceptanceOn), disposedOn: s(v.disposedOn), acceptance: F[0] || null };
    var gaps = CORE.shipGaps(rec, w.cls); X.addLog(pid, rec);
    toast('🚚 Shipment saved (' + w.cls + ')' + (gaps.length ? ' — still missing: ' + gaps.join(', ') : '') + '.', !!gaps.length); return true;
  });
}

/* ═════ 🪧 the sign set (the legend exactly as written; the company band at the bottom) ═════ */
function signsHtml(ids, opt){
  opt = opt || {}; var p = opt.pid ? proj(opt.pid) : null, b = brand(p), list = (ids && ids.length ? ids : CORE.SIGNS.map(function(g){ return g.id; })).map(function(id){ return CORE.SIGNS.find(function(g){ return g.id === id; }); }).filter(Boolean);
  var Z = CORE.SIGN_SIZES.find(function(z){ return z.key === opt.size; }) || CORE.SIGN_SIZES[0], c = coOf(p);
  var pages = list.map(function(g){
    var B = CORE.signBlocks(g, { size: Z.key, bilingual: opt.bilingual !== false, brand: c.co, fallback: c.fb }), parts = '';
    B.blocks.forEach(function(x){
      var fs = 'font-size:' + x.size + 'pt;';
      if (x.kind === 'head') parts += '<div data-sg="head" style="background:' + x.band + ';color:' + x.ink + ';' + fs + 'font-weight:900;text-align:center;padding:.12in 0;letter-spacing:.04em;border-radius:.08in .08in 0 0">' + esc(x.text) + '</div>';
      else if (x.kind === 'symbol') parts += '<div style="' + fs + 'text-align:center;line-height:1">' + esc(x.text) + '</div>';
      else if (x.kind === 'legend') parts += '<div data-sg="legend" style="' + fs + 'font-weight:800;text-align:center;margin:.06in .2in;line-height:1.15">' + esc(x.text) + '</div>';
      else if (x.kind === 'es') parts += '<div data-sg="es" style="' + fs + (x.bold ? 'font-weight:800;' : '') + 'text-align:center;margin:.04in .3in;line-height:1.2">' + esc(x.text) + '</div>';
      else if (x.kind === 'fill') parts += '<div data-sg="fill" style="' + fs + 'margin:.05in .4in">' + esc(x.text) + '</div>';
      else if (x.kind === 'brand') parts += '<div data-sg="brand" style="margin-top:auto;background:' + x.band + ';color:' + x.ink + ';' + fs + 'display:flex;align-items:center;justify-content:center;gap:.15in;padding:.1in;border-radius:0 0 .08in .08in">' + (x.logo ? '<img src="' + esc(x.logo) + '" alt="" style="height:' + (x.size * 2.2) + 'pt;background:#fff;border-radius:4px;padding:2px">' : '') + '<b>' + esc(x.text) + '</b></div>';
    });
    return '<section class="sg" data-sign="' + esc(g.id) + '" style="width:' + Z.w + 'in;height:' + Z.h + 'in">' + '<div style="border:.06in solid #111;border-radius:.12in;height:100%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-start;gap:.08in">' + parts + '</div></section>';
  }).join('');
  return '<!doctype html><html><head><meta charset="utf-8"><title>Environmental signs — ' + esc(b.name) + '</title><style>@page{size:' + Z.w + 'in ' + Z.h + 'in;margin:0}html,body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#111}.sg{box-sizing:border-box;padding:.3in;page-break-after:always;break-after:page;overflow:hidden}</style></head><body>' + pages + '</body></html>';
}
function printSigns(ids, opt){
  opt = opt || {}; var html = signsHtml(ids, opt); W.__gcEdSigns = { html: html, ids: ids || [], opt: opt };
  var Z = CORE.SIGN_SIZES.find(function(z){ return z.key === opt.size; }) || CORE.SIGN_SIZES[0];
  if (opt.pdf) return signsPdf(ids, opt, Z).catch(function(){ openHtml(html, 'SignsHtml'); return { ok: true, pdf: false }; });
  openHtml(html, 'SignsHtml'); return Promise.resolve({ ok: true, pdf: false });
}
/* the print-shop PDF (vector text, any size) */
function signsPdf(ids, opt, Z){
  var p = opt.pid ? proj(opt.pid) : null, c = coOf(p);
  return X.loadJsPdf().then(function(J){
    var doc = new J({ unit: 'pt', format: [Z.w * 72, Z.h * 72] }), Wp = Z.w * 72, Hp = Z.h * 72, M = 0.35 * 72;
    (ids && ids.length ? ids : CORE.SIGNS.map(function(g){ return g.id; })).forEach(function(id, n){
      var g = CORE.SIGNS.find(function(x){ return x.id === id; }); if (!g) return; if (n) doc.addPage([Wp, Hp]);
      var B = CORE.signBlocks(g, { size: Z.key, bilingual: opt.bilingual !== false, brand: c.co, fallback: c.fb }), y = M;
      doc.setLineWidth(4); doc.rect(M / 2, M / 2, Wp - M, Hp - M);
      B.blocks.forEach(function(x){
        var hx = function(c0){ var v = parseInt(String(c0).slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
        if (x.kind === 'brand') { var bh = x.size * 2.4; doc.setFillColor.apply(doc, hx(x.band)); doc.rect(M / 2, Hp - M / 2 - bh, Wp - M, bh, 'F'); doc.setTextColor.apply(doc, hx(x.ink)); doc.setFont('helvetica', 'bold'); doc.setFontSize(x.size); doc.text(x.text, Wp / 2, Hp - M / 2 - bh / 2 + x.size / 3, { align: 'center' }); doc.setTextColor(0, 0, 0); return; }
        if (x.kind === 'head') { var hh = x.size * 1.5; doc.setFillColor.apply(doc, hx(x.band)); doc.rect(M / 2, y - M / 2 + 2, Wp - M, hh, 'F'); doc.setTextColor.apply(doc, hx(x.ink)); doc.setFont('helvetica', 'bold'); doc.setFontSize(x.size); doc.text(x.text, Wp / 2, y - M / 2 + hh / 2 + x.size / 3, { align: 'center' }); doc.setTextColor(0, 0, 0); y += hh + 10; return; }
        doc.setFont('helvetica', x.bold || x.kind === 'legend' ? 'bold' : 'normal'); doc.setFontSize(x.size);
        doc.splitTextToSize(x.text, Wp - M * 2).forEach(function(line){ y += x.size * 1.15; doc.text(line, x.kind === 'fill' ? M : Wp / 2, y, x.kind === 'fill' ? undefined : { align: 'center' }); });
        y += x.size * 0.35;
      });
    });
    doc.save('GrayCo_environmental_signs_' + Z.key + '.pdf'); return { ok: true, pdf: true };
  });
}

/* ═════ ⚙ the written programs: administrator, approval, review; a filled copy of each Word file ═════ */
function programsSheet(){
  var Rr = R(), c0 = ctx(), ad = X.admin(), S0 = obj(Rr.settings);
  var rows = arr(Rr.programs).map(function(r, i){ var PI = CORE.programInfo(Rr, r.id, c0); return '<tr data-ed-prog="' + i + '"><td><b>' + esc(r.label) + '</b>' + (r.file ? '<div><a href="' + esc(r.file) + '" target="_blank" rel="noopener">Word file</a> · <button type="button" class="lnk" data-ed-fill="' + esc(r.id) + '">📄 Filled copy</button></div>' : '') + (PI.reviewDue ? '<div style="color:#92400e;font-size:12px">⚠ yearly review ' + (PI.reviewed ? 'due ' + esc(nice(PI.nextReview)) : 'date not set') + '</div>' : '') + '</td>'
    + '<td><input data-p="adminName" value="' + esc(r.adminName) + '" placeholder="' + esc(PI.adminDefault ? PI.admin + ' (default: ' + PI.why + ')' : 'name') + '"' + (ad ? '' : ' disabled') + '><input data-p="adminPhone" value="' + esc(r.adminPhone) + '" placeholder="' + esc(PI.adminDefault && PI.phone ? PI.phone : 'phone') + '"' + (ad ? '' : ' disabled') + '></td>'
    + '<td><input data-p="approvedBy" value="' + esc(r.approvedBy) + '" placeholder="owner"' + (ad ? '' : ' disabled') + '><input data-p="approvedOn" type="date" value="' + esc(r.approvedOn) + '"' + (ad ? '' : ' disabled') + '></td>'
    + '<td><input data-p="reviewed" type="date" value="' + esc(r.reviewed) + '"' + (ad ? '' : ' disabled') + '><input data-p="reviewEveryMonths" type="number" min="1" value="' + esc(r.reviewEveryMonths || 12) + '" title="months"' + (ad ? '' : ' disabled') + '></td>'
    + '<td><label class="chk"><input type="checkbox" data-p="inUse"' + (r.inUse === false ? '' : ' checked') + (ad ? '' : ' disabled') + '> in use</label></td></tr>'; }).join('');
  var inner = '<div class="m">The administrator and the owner\'s approval are printed on each program\'s filled copy and on every Employee Protection Plan. Blank administrator = ' + esc((CORE.defaultAdmin(c0, Rr, 'lead_supervisor') || {}).name || 'an admin from the people list') + ' (an admin from the people list; for lead work the one holding the lead supervisor certification). The yearly review comes up as a To-Do ' + esc(S0.programReviewDays || 30) + ' days ahead.</div>'
    + '<div class="tw"><table><thead><tr><th>Program</th><th>Administrator / phone</th><th>Approved by / on</th><th>Last review / every (months)</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
    + '<div class="sec">Settings</div><div class="grid">' + X.sel('asbDefault', 'Asbestos work on a new job is done by', [['sub', 'A licensed abatement sub (owner 11/17)'], ['crew', 'GrayCo crew']], s(S0.asbDefault) || 'sub')
    + X.sel('planBlock', 'A missing / unsigned Employee Protection Plan', [['', '⚠ warns'], ['1', '⛔ blocks']], S0.planBlock ? '1' : '') + X.sel('planOwnerSign', 'The plan needs the owner\'s signature', [['1', 'Yes'], ['', 'No — the competent person signs']], S0.planOwnerSign === false ? '' : '1')
    + X.sel('deconBlock', 'The decon set-up missing', [['', '⚠ warns'], ['1', '⛔ blocks']], S0.deconBlock ? '1' : '')
    + X.fld('tclpLead', 'TCLP lead threshold (mg/L) — confirm with EPA / your state program', 'number', s(CORE.tclpThreshold(Rr))) + X.sel('wasteShipBlock', 'Waste shipped before it is characterized', [['1', '⛔ blocks'], ['', '⚠ warns']], S0.wasteShipBlock === false ? '' : '1') + X.fld('clinic', 'Occupational clinic (on every plan)', 'text', s(S0.clinic)) + X.fld('clinicPhone', 'Clinic phone', 'tel', s(S0.clinicPhone)) + '</div>';
  var o = X.modal('⚙ Written programs', inner, ad ? function(v, el){ return savePrograms(readProgs(el), { asbDefault: v.asbDefault, planBlock: v.planBlock === '1', planOwnerSign: v.planOwnerSign === '1', deconBlock: v.deconBlock === '1', clinic: s(v.clinic), clinicPhone: s(v.clinicPhone), tclpLead: parseFloat(v.tclpLead) > 0 ? parseFloat(v.tclpLead) : 5.0, wasteShipBlock: v.wasteShipBlock === '1' }).then(function(r){ toast(r && r.ok ? '⚙ Written programs saved (every version of the rules is kept).' : 'Not saved: ' + s(r && r.error), !(r && r.ok)); return !!(r && r.ok); }); } : null, 'Save');
  o.setAttribute('data-ed-programs', '1');
  return o;
}
function readProgs(el){ var Rr = R(); return arr(Rr.programs).map(function(r, i){ var tr = el.querySelector('[data-ed-prog="' + i + '"]'), n = Object.assign({}, r); if (!tr) return n; [].forEach.call(tr.querySelectorAll('[data-p]'), function(inp){ var k = inp.getAttribute('data-p'); if (inp.type === 'checkbox') { if (k === 'inUse') { if (inp.checked) delete n.inUse; else n.inUse = false; } } else if (k === 'reviewEveryMonths') n[k] = +inp.value || 12; else n[k] = s(inp.value); }); return n; }); }
function savePrograms(list, settings){
  if (!X.admin()) return Promise.resolve({ ok: false, error: 'Only an admin changes the written programs.' });
  var T = JSON.parse(JSON.stringify(W._gcEnvComp.rules())); if (list) T.programs = list; T.settings = Object.assign({}, T.settings, settings || {});
  return EC.saveRules(T);
}
/* a filled copy of a program's Word file: the administrator, the approval, the current company address (word/document.xml) */
var CRC = null;
function crc32(u8){ if (!CRC) { CRC = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } } var x = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) x = CRC[(x ^ u8[i]) & 255] ^ (x >>> 8); return (x ^ 0xFFFFFFFF) >>> 0; }
function inflate(u8){ var ds = new DecompressionStream('deflate-raw'); return new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer().then(function(b){ return new Uint8Array(b); }); }
function zipEdit(buf, name, fn){
  var u = new Uint8Array(buf), dv = new DataView(buf), e = u.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--; if (e < 0) return Promise.reject(new Error('not a zip'));
  var cnt = dv.getUint16(e + 10, true), cd = dv.getUint32(e + 16, true), ents = [], q = cd;
  for (var i = 0; i < cnt; i++) { var nl = dv.getUint16(q + 28, true), el = dv.getUint16(q + 30, true), cl = dv.getUint16(q + 32, true); ents.push({ cdh: u.slice(q, q + 46), name: new TextDecoder().decode(u.slice(q + 46, q + 46 + nl)), nameB: u.slice(q + 46, q + 46 + nl), method: dv.getUint16(q + 10, true), csize: dv.getUint32(q + 20, true), lo: dv.getUint32(q + 42, true) }); q += 46 + nl + el + cl; }
  var dataOf = function(x){ var lo = x.lo, nl = dv.getUint16(lo + 26, true), el = dv.getUint16(lo + 28, true); return u.slice(lo + 30 + nl + el, lo + 30 + nl + el + x.csize); };
  var tgt = ents.find(function(x){ return x.name === name; }); if (!tgt) return Promise.reject(new Error('no ' + name));
  var raw = dataOf(tgt);
  return (tgt.method === 8 ? inflate(raw) : Promise.resolve(raw)).then(function(plain){
    var text = new TextDecoder().decode(plain), out = fn(text), nb = new TextEncoder().encode(out), crc = crc32(nb);
    var parts = [], cds = [], off = 0;
    ents.forEach(function(x){
      var isT = x === tgt, data = isT ? nb : dataOf(x), lh = new Uint8Array(30 + x.nameB.length), lv = new DataView(lh.buffer), cv = new DataView(x.cdh.buffer.slice(0));
      var cdh = new Uint8Array(cv.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0, true); lv.setUint16(8, isT ? 0 : x.method, true); lv.setUint16(10, cv.getUint16(12, true), true); lv.setUint16(12, cv.getUint16(14, true), true);
      lv.setUint32(14, isT ? crc : cv.getUint32(16, true), true); lv.setUint32(18, data.length, true); lv.setUint32(22, isT ? nb.length : cv.getUint32(24, true), true); lv.setUint16(26, x.nameB.length, true); lv.setUint16(28, 0, true); lh.set(x.nameB, 30);
      cv.setUint16(8, 0, true); cv.setUint16(10, isT ? 0 : x.method, true); if (isT) { cv.setUint32(16, crc, true); cv.setUint32(24, nb.length, true); } cv.setUint32(20, data.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true); cv.setUint32(42, off, true);
      parts.push(lh, data); var c2 = new Uint8Array(46 + x.nameB.length); c2.set(cdh, 0); c2.set(x.nameB, 46); cds.push(c2); off += lh.length + data.length;
    });
    var cdSize = cds.reduce(function(a, b){ return a + b.length; }, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, ents.length, true); ev.setUint16(10, ents.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, off, true);
    return { blob: new Blob(parts.concat(cds).concat([end]), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), xml: out };
  });
}
function fillDocx(id, download){
  var Rr = R(), r = arr(Rr.programs).find(function(x){ return x.id === id; }); if (!r || !r.file) return Promise.resolve(null);
  var PI = CORE.programInfo(Rr, id, ctx()), vals = { admin: PI.admin, phone: PI.phone, approvedBy: PI.approvedBy, approvedOn: nice(PI.approvedOn), address: addr() };
  return W.fetch(r.file).then(function(res){ if (!res.ok) throw new Error('HTTP ' + res.status); return res.arrayBuffer(); }).then(function(buf){ return zipEdit(buf, 'word/document.xml', function(x){ return CORE.fillDocxXml(x, vals); }); }).then(function(o){
    W.__gcEdFilled = { id: id, xml: o.xml, size: o.blob.size, vals: vals };
    if (download !== false) { var a = D.createElement('a'); a.href = URL.createObjectURL(o.blob); a.download = r.file.split('/').pop().replace(/\.docx$/, '') + '_filled_' + today() + '.docx'; D.body.appendChild(a); a.click(); ST.call(W, function(){ a.remove(); }, 500); }
    return o;
  }).catch(function(e){ toast('Could not fill the Word file: ' + (e && e.message), true); return null; });
}

/* ═════ the clicks ═════ */
function pidOf(b){ var c = b.closest('#gc-ec'); return c ? c.getAttribute('data-pid') : (b.getAttribute('data-pid') || ''); }
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest ? e.target.closest('[data-ed],[data-ed-fill]') : null; if (!b) return;
  if (b.hasAttribute('data-ed-fill')) { e.preventDefault(); fillDocx(b.getAttribute('data-ed-fill')); return; }
  var a = b.getAttribute('data-ed'), pid = pidOf(b), id = b.getAttribute('data-id'), box = b.closest('#gc-ec');
  e.preventDefault(); e.stopPropagation();
  if (a === 'plan') { var r = generate(pid); if (r) ST.call(W, function(){ planPdf(pid, r.id); }, 700); }
  else if (a === 'planin') planForm(pid);
  else if (a === 'planprint') planPdf(pid, id);
  else if (a === 'signcp') sign(pid, id, 'cp');
  else if (a === 'signown') sign(pid, id, 'owner');
  else if (a === 'sub') subForm(pid);
  else if (a === 'decon') deconForm(pid);
  else if (a === 'deconblank') openHtml(deconBlankHtml(), 'Decon');
  else if (a === 'purchase') openHtml(purchaseHtml(), 'Purchase');
  else if (a === 'programs') programsSheet();
  else if (a === 'wstream') { var nm = W.prompt('New waste stream (e.g. ' + CORE.listOf(obj(R().waste).streams).slice(0, 3).join(', ') + '):', ''); if (nm != null && s(nm)) addStream(pid, nm); }
  else if (a === 'tclp') tclpForm(pid);
  else if (a === 'tclpres') { var rv = W.prompt('TCLP lead result (mg/L) from the lab:', ''); if (rv != null && s(rv)) tclpResult(pid, id, rv); }
  else if (a === 'wgk') gkForm(pid);
  else if (a === 'wship') shipForm(pid);
  else if (a === 'signs') { var p = proj(pid), E = p ? EC.evaluate(p) : { kinds: [] }, sz = box && box.querySelector('[data-ed-size]'), bi = box && box.querySelector('[data-ed-bi]'), z = sz ? sz.value : 'letter'; printSigns(CORE.jobSigns(p, E.kinds, R()).map(function(g){ return g.id; }), { pid: pid, size: z, bilingual: bi ? bi.checked : true, pdf: z === 'shop' }); }
}, true);
D.addEventListener('change', function(e){
  var t = e.target, c = D.getElementById('gc-ec'); if (!c || !c.contains(t)) return; var pid = c.getAttribute('data-pid');
  if (t.hasAttribute('data-ed-asb')) setAsbBy(pid, t.value);
  else if (t.hasAttribute('data-ed-decon')) { var v = t.value; X.setEC(pid, function(E0){ E0.decon = obj(E0.decon); if (v === 'yes') E0.decon.required = true; else if (v === 'no') E0.decon.required = false; else delete E0.decon.required; return E0; }); }
}, true);

/* ═════ To-Dos: the plan, the decon set-up, the licensed sub, each program's yearly review (office / admins write them) ═════ */
function wanted(){
  var want = {}, Rr = R(), c0 = ctx();
  X.envJobs(false).forEach(function(p){
    var E = EC.evaluate(p), job = s(p.name || p.client || p.id);
    var pl = E.items.find(function(x){ return x.id === 'epp'; }); if (pl && pl.st !== 'ok') want['ENVDOCS_E_' + p.id] = { p: p, prio: pl.st === 'block' ? 'high' : 'med', label: '📝 ' + job + ': Employee Protection Plan — ' + (E.plan && E.plan.st === 'none' ? 'generate it' : E.plan && E.plan.st === 'stale' ? 'out of date, generate a new version' : 'needs signatures'), note: s(pl.note) + '\nJob → 🛡 Compliance → 7 · Employee Protection Plan.' };
    var dc = E.items.find(function(x){ return x.sec === 'decon'; }); if (dc && dc.st !== 'ok') want['ENVDOCS_D_' + p.id] = { p: p, prio: dc.st === 'block' ? 'high' : 'med', label: '🧼 ' + job + ': decon unit set-up checklist + photo', note: s(dc.note) + '\nJob → 🛡 Compliance → 🧼 Decon set-up checklist.' };
    var wb = E.items.filter(function(x){ return x.sec === 'waste' && x.st !== 'ok'; }); if (wb.length) want['ENVDOCS_W_' + p.id] = { p: p, prio: wb.some(function(x){ return x.st === 'block'; }) ? 'high' : 'med', label: '♻️ ' + job + ': waste — ' + wb.length + ' stream item(s) (TCLP / disposal papers)', note: wb.map(function(x){ return x.label + ' — ' + x.note; }).join('\n') + '\nJob → 🛡 Compliance → ♻️ Waste.' };
    var sb = E.items.filter(function(x){ return x.sec === 'sub' && x.st === 'block'; }); if (sb.length) want['ENVDOCS_S_' + p.id] = { p: p, prio: 'high', label: '☣️ ' + job + ': the licensed asbestos sub\'s papers (' + sb.length + ')', note: sb.map(function(x){ return x.label; }).join('\n') + '\nJob → 🛡 Compliance → ✏️ Licensed sub info.' };
  });
  arr(Rr.programs).forEach(function(r){ var PI = CORE.programInfo(Rr, r.id, c0); if (!PI.inUse || !PI.reviewDue) return; want['ENVDOCS_R_' + r.id] = { p: null, prio: PI.overdue ? 'high' : 'med', assignee: PI.admin, label: '📑 Yearly review: ' + PI.label + (PI.reviewed ? ' — due ' + nice(PI.nextReview) : ' — review date not set'), note: 'Go over the program, update it if the work or the rules changed, then set the review date in ⚙ Written programs (🛡 Compliance → ⚙ Written programs).' }; });
  return want;
}
function sweep(){
  try {
    if (!X.office() || !arr(W._crm && W._crm.projects).length) return 0;
    var l = X.tasks(), now = X.nowIso(), ch = 0, want = wanted();
    Object.keys(want).forEach(function(id){ var w = want[id], cur = l.find(function(y){ return y && y.id === id; });
      if (!cur) { l.push({ id: id, kind: 'envdocs', pid: w.p ? w.p.id : '', label: w.label, note: w.note, assignee: s(w.assignee || (w.p && w.p.pm)), prio: w.prio, addedBy: 'CRM', addedAt: now, updatedAt: now, done: false }); ch++; }
      else if (cur.done || cur.label !== w.label) { cur.label = w.label; cur.note = w.note; cur.done = false; cur.updatedAt = now; ch++; } });
    l.forEach(function(y){ if (y && !y.done && /^ENVDOCS_[EDSRW]_/.test(s(y.id)) && !want[y.id]) { y.done = true; y.doneAt = y.updatedAt = now; y.resolution = 'done in 🛡 Compliance'; ch++; } });
    if (ch) X.saveTasks(l);
    return ch;
  } catch (e) { W.__gcEdErr = String(e && e.stack || e); return 0; }
}

/* ═════ 🖨 Print pack → "Environmental signs" (Marketing) ═════ */
var PPW = 0;
function hookPrintPack(){
  var M = W._gcMktExt; if (!M || !M.VIEWS || !M.VIEWS.printpack) { if (PPW++ < 240) ST.call(W, hookPrintPack, 1000); return; }
  if (M.VIEWS.printpack.__gcEd) return;
  var f = M.VIEWS.printpack, w = function(){ return f.apply(this, arguments) + signsCard(); }; w.__gcEd = true; M.VIEWS.printpack = w;
  M.ACT['ed-sign'] = function(b){ var card = b.closest('[data-ed-signs]'), z = card && card.querySelector('[data-ed-psize]'), bi = card && card.querySelector('[data-ed-pbi]'), id = b.getAttribute('data-s'), size = z ? z.value : 'letter'; printSigns(id ? [id] : null, { size: size, bilingual: bi ? bi.checked : true, pdf: size === 'shop' }); };
}
function signsCard(){
  var b = brand(null);
  return '<div class="gmt-card" data-ed-signs="1"><h2>🪧 Environmental signs</h2><div class="gmt-muted">Every sign for lead, asbestos, mold, trauma and the decon unit — in ' + esc(b.name) + '\'s branding (name, logo, phone in the bottom band). ' + esc(CORE.SIGN_NOTE) + '</div>'
    + '<div class="gmt-row" style="margin-top:6px"><select data-ed-psize="1" aria-label="Sign size">' + CORE.SIGN_SIZES.map(function(z){ return '<option value="' + z.key + '">' + esc(z.label) + '</option>'; }).join('') + '</select><label><input type="checkbox" data-ed-pbi="1" checked> English + Spanish</label><button class="gmt-btn" data-a="ed-sign" data-s="">🖨 Print all</button></div>'
    + '<div class="gmt-grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">' + CORE.SIGNS.map(function(g){ var T = CORE.TONES[g.tone] || {}; return '<div class="gmt-card" style="margin:0" data-ed-sign="' + esc(g.id) + '"><div style="background:' + T.band + ';color:' + T.ink + ';font-weight:900;text-align:center;padding:4px;border-radius:6px">' + esc(g.head) + '</div><b style="display:block;margin:4px 0">' + esc(g.title) + '</b><div class="gmt-muted">' + esc(g.lines.join(' · ')) + '</div><button class="gmt-btn o" data-a="ed-sign" data-s="' + esc(g.id) + '">🖨 Print</button></div>'; }).join('') + '</div></div>';
}

/* ── the timers ── */
ST.call(W, hookPrintPack, 1500);
ST.call(W, sweep, 45000); SI.call(W, sweep, 300000);
W._gcEnvDocs = { generate: generate, sign: sign, planHtml: planHtml, planPdf: planPdf, planForm: planForm, setAsbBy: setAsbBy, subForm: subForm, saveSub: saveSub, deconForm: deconForm, saveDecon: saveDecon,
  deconBlankHtml: deconBlankHtml, purchaseHtml: purchaseHtml, addStream: addStream, logTclp: logTclp, tclpResult: tclpResult, logGk: logGk, logShip: logShip, tclpForm: tclpForm, shipForm: shipForm, programsSheet: programsSheet, savePrograms: savePrograms, fillDocx: fillDocx, zipEdit: zipEdit, signsHtml: signsHtml, printSigns: printSigns, signsCard: signsCard, sweep: sweep, wanted: wanted, hookPrintPack: hookPrintPack };
})(window);
</script>
