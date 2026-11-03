/* __GC_PATCH_JOBPACKET__ — 🖨 Print job packet (patch JOBPACKET, see tools/patch_JOBPACKET.py)
   Owner 11/03: "have option for pm to print off all customer info for job that is needed for print offs if they like
   to have manual stuff, then they can add that manual stuff in by photo if they want, but we want to do everything on
   portal but have option".
   • Field: a "🖨 Print job packet" tile at the end of the job's tiles. Desk: a "🖨 Print job packet" button in the job
     page's 🏠 Home · 🔐 Codes · 📋 Inspections bar (patch X10). Internal only: this page is the CRM, never the portals.
   • One white Letter page, the GrayCo header (window._gcDocHeader), the job name, address, job code and the printed
     date; the sections are picked with check boxes (all on by default, remembered on this device) and a section with
     no data is left out (the blank forms are always there):
       Customer & site · Scope of work (wording only — window._gcScopeWords, never a price) · Schedule & phases ·
       Selections · Change orders (amounts only for a person who may see the job's money) · Permits & inspections ·
       Subs on the job · Open punch list & To-Dos · Blank forms (daily log, punch list, change-order request,
       customer sign-off). Access codes are never printed (they stay in 🔐 Access codes).
   • ‹ Back (on screen from the first paint) · 🖨 Print (window._gcViewer when the CRM has it, else window.print with a
     print style that hides the app) · 📤 Share / ⬇️ Download (an .html file) · 📷 Add paper (photo): the Field
     📷 Add Photo/File flow (window._gcFP.addPhotoFile) saves the picture to the job's Documents as "Packet scan".
   No window.open, no pop-up, no timers. API: window._gcJobPacket */
(function(){
'use strict';
var W = window, D = document;
if (W.__GC_PATCH_JOBPACKET__) return; W.__GC_PATCH_JOBPACKET__ = true;
var nST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function C(){ return W._crm || {}; }
function norm(v){ return low(v).replace(/[^a-z0-9]/g, ''); }
function proj(pid){ return arr(C().projects).filter(function(p){ return p && s(p.id) === s(pid); })[0] || null; }
function onJob(pid){ return function(x){ return x && !x.deleted && (s(x.pid) === pid || s(x.projectId) === pid || s(x.jobId) === pid); }; }
function lsGet(k){ try { return W.localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { W.localStorage.setItem(k, v); } catch (e) {} }
function toast(m){ try { if (W._gcToast) return W._gcToast(m); } catch (e) {} try { if (W.showToast) return W.showToast(m); } catch (e) {} }
function md(d){ d = s(d).slice(0, 10); var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(d); return m ? (+m[2]) + '/' + (+m[3]) + '/' + m[1] : d; }
function usd(n){ n = typeof n === 'number' ? n : parseFloat(s(n).replace(/[$,\s]/g, '')); return isFinite(n) ? (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 }) : ''; }

/* ── who may see the job's money (the Field 💰 Financials rule: admin / office / books, or the job's own PM) ── */
function canMoney(p){
  try { if (W._gcFP && typeof W._gcFP.canProfit === 'function') return !!W._gcFP.canProfit(p.id); } catch (e) {}
  try { return !!(W._gcCanSeeMoney && W._gcCanSeeMoney()); } catch (e) { return false; }
}
/* ── the scope: wording only (the shared SCOPEWORDS helper; the same rules here when it is not on the page) ── */
function oneLine(t){
  var prev; t = s(t).replace(/\s+/g, ' ');
  if (/^\s*(?:[-•*·\d.)\s]*)(?:sub\s*-?\s*total|grand\s*total|total|tax(?:es)?|contractor'?s?\s+tax|balance(?:\s+due)?|deposit|discount|o\s*&\s*p|overhead|profit|payment)\b/i.test(t) && /\d/.test(t)) return '';
  do {
    prev = t;
    t = t.replace(/\s*@\s*\$?\s*\d[\d,]*(?:\.\d+)?(?:\s*(?:\/|per)\s*[a-z]+\.?)?/gi, '').replace(/\s*=\s*\$?\s*-?\d[\d,]*(?:\.\d+)?/g, '')
      .replace(/\(?\s*[$€£]\s?-?\d[\d,]*(?:\.\d+)?(?:\s*(?:\/|per)\s*[a-z]+\.?)?\s*\)?/gi, '')
      .replace(/\b(?:unit\s*price|price|cost|total|sub\s*total|amount|charge|rcv|acv|line\s*total)\s*[:=]?\s*-?\d[\d,]*(?:\.\d+)?/gi, '')
      .replace(/(?:\s+-?\d{1,3}(?:,\d{3})*\.\d{2}|\s+-?\d+\.\d{2})+\s*$/, '').replace(/[\s:=\-–—|,;x×*\/]+$/i, '').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
  } while (t !== prev);
  return /[A-Za-z]{2,}/.test(t) ? t : '';
}
function scopeWords(t){
  var out = '';
  try { if (typeof W._gcScopeWords === 'function') out = s(W._gcScopeWords(t)); else out = s(t).split(/\r?\n/).map(oneLine).filter(Boolean).join('\n'); } catch (e) { out = ''; }
  return out.replace(/[$€£]\s?-?\d[\d,]*(?:\.\d+)?/g, '').replace(/[ \t]{2,}/g, ' ').trim();   /* never a price, whatever the helper missed */
}

/* ── the data (only what the CRM keeps) ── */
function custOf(p){
  var l = arr(C().customers), id = s(p.customerId), n = norm(p.client || p.customer);
  return l.filter(function(c){ return c && id && s(c.id) === id; })[0] || l.filter(function(c){ return c && n && (norm(c.name) === n || norm(c.company) === n); })[0] || {};
}
function userOf(name){ var n = norm(name); return n ? arr(C().users).filter(function(u){ return u && norm(u.name) === n; })[0] || null : null; }
function subRec(x){
  var l = arr(C().subs).concat(arr(C().vendors)), id = s(x.subId || x.vendorId), n = norm(x.name || x.company);
  return l.filter(function(v){ return v && id && s(v.id) === id; })[0] || l.filter(function(v){ return v && n && (norm(v.name) === n || norm(v.company) === n); })[0] || {};
}
function schedOf(p){
  var pid = s(p.id), l = [];
  try { if (W._gcFP && W._gcFP.schedItems) l = arr(W._gcFP.schedItems(pid)); } catch (e) { l = []; }
  if (!l.length) arr(C().schedule).filter(onJob(pid)).forEach(function(x){ l.push({ k: 'sched', d: s(x.date || x.start).slice(0, 10), e: s(x.endDate || x.end).slice(0, 10), t: s(x.title || x.name || 'Task'), st: s(x.status), who: s(x.sub || x.assignee || x.crew) }); });
  return l.sort(function(a, b){ return (a.d || '9') < (b.d || '9') ? -1 : 1; });
}
function row(k, v){ return s(v) ? '<tr><th>' + esc(k) + '</th><td>' + esc(v) + '</td></tr>' : ''; }
function tbl(head, rows){ return rows.length ? '<table class="gcjp-t"><thead><tr>' + head.map(function(h){ return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function(r){ return '<tr>' + r.map(function(c){ return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>' : ''; }

var SECS = [
  { k: 'cust', l: 'Customer & site' }, { k: 'scope', l: 'Scope of work (no prices)' }, { k: 'sched', l: 'Schedule & phases' },
  { k: 'sel', l: 'Selections, materials & colours' }, { k: 'co', l: 'Change orders' }, { k: 'permit', l: 'Permits & inspections' },
  { k: 'subs', l: 'Subs on the job' }, { k: 'punch', l: 'Open punch list & To-Dos' }, { k: 'forms', l: 'Blank forms to fill in by hand' }];

var BUILD = {
  cust: function(p){
    var c = custOf(p), g = c.gcInfo || {}, pm = userOf(p.pm) || {};
    var addr = s(p.address); [p.city, p.state, p.zip].forEach(function(x){ if (s(x) && low(addr).indexOf(low(x)) < 0) addr += (addr ? ', ' : '') + s(x); });
    var notes = s(p.customerNotes).split(/\r?\n/).concat(s(c.notes).split(/\r?\n/)).map(s).filter(function(l){ return l && !/AUTO-FLAG/i.test(l); });
    var crew = {}; schedOf(p).forEach(function(x){ s(x.who).split(/\s*[,&]\s*/).forEach(function(n){ n = s(n); if (n && norm(n) !== norm(p.pm)) crew[n] = 1; }); });
    var crewRows = Object.keys(crew).map(function(n){ var u = userOf(n) || subRec({ name: n }); return [n, s(u.role || u.trade || u.cat), s(u.phone), s(u.email)]; });
    var h = '<table class="gcjp-kv">' + row('Customer', p.client || c.name) + row('Company', p.company && p.company !== p.client ? p.company : '') +
      row('Phone', p.clientPhone || p.phone || c.phone) + row('E-mail', p.clientEmail || p.email || c.email) + row('Job address', addr) +
      row('Their contact', [g.pm, g.pmPhone, g.pmEmail].map(s).filter(Boolean).join(' · ')) + row('Billing contact', [g.billingContact, g.billingPhone, g.billingEmail].map(s).filter(Boolean).join(' · ')) +
      row('Gate / lockbox / parking', p.accessNotes || p.siteNotes || p.parkingNotes) + '</table>' +
      (notes.length ? '<h3>Site notes</h3><ul>' + notes.map(function(l){ return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '') +
      '<p class="gcjp-mut">Access codes are not printed — open 🔐 Access codes in the CRM on the day.</p>' +
      '<h3>GrayCo</h3><table class="gcjp-kv">' + row('Project manager', [p.pm, pm.phone, pm.email].map(s).filter(Boolean).join(' · ')) + '</table>' +
      (crewRows.length ? '<h3>Crew &amp; people on the schedule</h3>' + tbl(['Name', 'Role / trade', 'Phone', 'E-mail'], crewRows) : '');
    return (s(p.client) || s(c.name) || addr) ? h : '';
  },
  scope: function(p){
    var parts = [], seen = {};
    var add = function(t){ t = scopeWords(t); var k = norm(t); if (t && !seen[k] && !parts.some(function(x){ return norm(x).indexOf(k) >= 0; })) { seen[k] = 1; parts.push(t); } };
    add(p.scopeOfWork); add(p.scope);
    var li = arr(p.lineItems).map(function(x){ return x && typeof x === 'object' ? s(x.desc || x.description || x.name) : s(x); }).filter(Boolean);
    if (li.length) add(li.join('\n'));
    arr(C().estimates).filter(function(e){ return e && !e.deleted && ((s(p.estimateId) && s(e.id) === s(p.estimateId)) || s(e.projectId) === s(p.id) || s(e.pid) === s(p.id)); }).slice(0, 3).forEach(function(e){ add(e.scopeNotes || e.scope || e.description); });
    add(arr(p.exclusions).join ? arr(p.exclusions).join('\n') : p.exclusions);
    return parts.length ? parts.map(function(t){ return '<div class="gcjp-scope">' + esc(t) + '</div>'; }).join('') : '';
  },
  sched: function(p){
    var h = '<table class="gcjp-kv">' + row('Start', md(p.startDate)) + row('Finish', md(p.endDate || p.completionDate)) + row('Progress', p.pct ? p.pct + '%' : '') + '</table>';
    var steps = arr(p.schedPlan && p.schedPlan.steps).map(function(x){ return [s(x.name), md(x.date) + (s(x.end) && x.end !== x.date ? ' – ' + md(x.end) : ''), x.done ? 'Done' : '']; });
    var ev = schedOf(p).filter(function(x){ return x.k === 'sched' || x.k === 'walk'; }).map(function(x){ return [md(x.d) + (x.e ? ' – ' + md(x.e) : ''), s(x.t).replace(/^\S+\s/, function(m){ return /[A-Za-z0-9]/.test(m) ? m : ''; }), s(x.who), s(x.st)]; });
    if (!steps.length && !ev.length && !s(p.startDate) && !s(p.endDate)) return '';
    return h + (steps.length ? '<h3>Phases</h3>' + tbl(['Phase', 'Dates', ''], steps) : '') + (ev.length ? '<h3>On the schedule</h3>' + tbl(['Date', 'What', 'Who', 'Status'], ev) : '');
  },
  sel: function(p){
    var l = [], st = {};
    try { if (W._gcSEL && W._gcSEL.state) W._gcSEL.state(p.id).forEach(function(x){ st[s(x.id)] = x; }); } catch (e) {}
    try { var I = W._gcCH && W._gcCH._i; if (I && I.jobChoices) l = arr(I.jobChoices(p.id)); } catch (e) { l = []; }
    if (!l.length) l = arr(p.portalChoices).filter(function(c){ return c && !c.removed; });
    var rows = l.map(function(c){ var x = st[s(c.id)] || {}; return [s(c.cat || c.title || c.name), [c.brand, c.line].map(s).filter(Boolean).join(' · '), s(x.pick || c.choice || c.color) || arr(c.options).map(function(o){ return s(o.color || o.name || o.label); }).filter(Boolean).join(' / '), s(x.status || c.status)]; });
    return rows.length ? tbl(['Item', 'Brand / line', 'Choice / colour', 'Status'], rows) : '';
  },
  co: function(p){
    var m = canMoney(p), pid = s(p.id), seen = {};
    var l = arr(C().changeOrders).concat(arr(C().cos)).filter(onJob(pid)).filter(function(x){ var k = s(x.id) || JSON.stringify(x); if (seen[k]) return false; seen[k] = 1; return true; });
    var rows = l.map(function(x){ var r = [md(x.date || x.created || x.createdAt), s(x.title || x.desc || x.description || x.name || 'Change order'), s(x.status || 'Draft')]; if (m) r.push(usd(x.amt != null ? x.amt : x.amount)); return r; });
    return rows.length ? tbl(['Date', 'Change order', 'Status'].concat(m ? ['Amount'] : []), rows) + (m ? '' : '<p class="gcjp-mut">Amounts are on the job\'s money page for the people who may see them.</p>') : '';
  },
  permit: function(p){
    var pr = arr(p.permits).map(function(x){ return [s(x.type || x.name || 'Permit'), s(x.status), s(x.number), md(x.issued), md(x.expires), s(x.office)]; });
    var ins = schedOf(p).filter(function(x){ return x.k === 'insp'; }).map(function(x){ return [md(x.d), s(x.t).replace(/^📋\s*/, ''), s(x.st), s(x.who)]; });
    return (pr.length ? '<h3>Permits</h3>' + tbl(['Permit', 'Status', 'Number', 'Issued', 'Expires', 'Office'], pr) : '') + (ins.length ? '<h3>Inspections</h3>' + tbl(['Date', 'Inspection', 'Result', 'By'], ins) : '');
  },
  subs: function(p){
    var rows = arr(p.subs).filter(function(x){ return x && !x.deleted && !/declin|lost|removed/i.test(s(x.status)); }).map(function(x){ var v = subRec(x); return [s(x.name || v.name || v.company), s(x.trade || v.trade || v.cat), s(x.contact || v.contact), s(x.phone || v.phone), s(x.email || v.email), s(x.status)]; });
    return rows.length ? tbl(['Sub', 'Trade', 'Contact', 'Phone', 'E-mail', 'Status'], rows) : '';
  },
  punch: function(p){
    var pid = s(p.id), open = function(x){ return !(x.done === true || x.completed === true || /^(done|closed|complete|completed|fixed|resolved)$/i.test(s(x.status))); };
    var pu = punchList().filter(onJob(pid)).filter(open).map(function(x){ return [s(x.item || x.text || x.title), s(x.location || x.area), s(x.assignee || x.by), md(x.date || x.due)]; });
    var tl = arr(C().gc_office_tasks); if (!tl.length) tl = arr(lsGet('gc_office_tasks'));
    var td = tl.filter(onJob(pid)).filter(open).map(function(x){ return [s(x.text || x.label || x.title), s(x.assignee), md(x.due || x.dueDate)]; });
    return (pu.length ? '<h3>Punch list</h3>' + tbl(['Item', 'Where', 'Who', 'Date'], pu) : '') + (td.length ? '<h3>To-Dos</h3>' + tbl(['To-Do', 'Who', 'Due'], td) : '');
  }
};

/* the punch list lives in this device's store (idb 'punch'); read it when the packet opens */
var PUNCH = null;
function punchList(){ return PUNCH || arr(C().punch).concat(arr(C().punchlist)); }
function loadPunch(){ return Promise.resolve(W.idbGet ? W.idbGet('punch') : null).then(function(v){ v = arr(v); if (v.length) PUNCH = v; return v.length; }, function(){ return 0; }); }

/* ── the blank forms (paper to write on) ── */
function lines(n){ var h = ''; for (var i = 0; i < n; i++) h += '<div class="gcjp-ln"></div>'; return h; }
function grid(head, n){ var r = ''; for (var i = 0; i < n; i++) r += '<tr>' + head.map(function(){ return '<td>&nbsp;</td>'; }).join('') + '</tr>'; return '<table class="gcjp-t gcjp-g"><thead><tr>' + head.map(function(h){ return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + r + '</tbody></table>'; }
function fld(l){ return '<div class="gcjp-f"><span>' + esc(l) + '</span><i></i></div>'; }
function sig(l){ return '<div class="gcjp-sig"><i></i><span>' + esc(l) + '</span></div>'; }
var FORMS = [
  ['form-log', 'Daily log', function(){ return '<div class="gcjp-fr">' + fld('Date') + fld('Weather') + fld('Temp') + '</div><div class="gcjp-fr">' + fld('Arrived') + fld('Left') + '</div>' +
    '<h3>Crew on site</h3>' + grid(['Name', 'Company / trade', 'In', 'Out'], 6) + '<h3>Work done</h3>' + lines(6) + '<h3>Deliveries &amp; materials</h3>' + lines(2) +
    '<h3>Issues, delays, safety</h3>' + lines(3) + '<h3>Visitors &amp; inspections</h3>' + lines(2) + '<div class="gcjp-fr">' + sig('PM / superintendent signature') + sig('Date') + '</div>'; }],
  ['form-punch', 'Punch list', function(){ return '<div class="gcjp-fr">' + fld('Walked on (date)') + fld('Walked by') + '</div>' + grid(['#', 'Where', 'Item to fix', 'Who', 'Done ✓', 'Initials'], 18); }],
  ['form-co', 'Change-order request', function(){ return '<div class="gcjp-fr">' + fld('Date') + fld('Requested by') + '</div>' +
    '<h3>What changes</h3>' + lines(7) + '<h3>Why</h3>' + lines(3) + '<h3>Effect on the schedule</h3>' + lines(2) +
    '<p class="gcjp-mut">The office prices this request and sends the change order for signature. Work on the change starts once it is signed.</p>' +
    '<div class="gcjp-fr">' + sig('Customer signature') + sig('Date') + '</div><div class="gcjp-fr">' + sig('GrayCo PM signature') + sig('Date') + '</div>'; }],
  ['form-signoff', 'Customer sign-off', function(){ return '<p>We walked the finished work together. Anything still to do is listed below; everything else is complete to the customer\'s satisfaction.</p>' +
    '<h3>Still to do (if anything)</h3>' + grid(['#', 'Item', 'Agreed date'], 8) + '<h3>Customer comments</h3>' + lines(4) +
    '<div class="gcjp-fr">' + sig('Customer name (print)') + sig('Customer signature') + sig('Date') + '</div><div class="gcjp-fr">' + sig('GrayCo PM') + sig('Signature') + sig('Date') + '</div>'; }]
];

/* ── the packet ── */
var KEY = 'gc_jobpacket_secs';
function picked(){ var v = null; try { v = JSON.parse(lsGet(KEY) || 'null'); } catch (e) {} var o = {}; SECS.forEach(function(x){ o[x.k] = !(v && v[x.k] === false); }); return o; }
function code(p){ return s(p.autoPO || p.po || p.id); }
function header(p){
  var hd = ''; try { if (W._gcDocHeader) hd = W._gcDocHeader({}); } catch (e) { hd = ''; }
  if (!hd) hd = '<div class="gcjp-logo"><b>GrayCo Construction Services</b></div>';
  var addr = s(p.address);
  return '<div class="gcjp-hd">' + hd + '<div class="gcjp-title">Job packet</div><div class="gcjp-job">' + esc(p.name) + '</div>' +
    '<div class="gcjp-sub">' + esc([addr, 'Job ' + code(p)].filter(Boolean).join(' · ')) + '</div><div class="gcjp-sub">Printed ' + esc(new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })) + '</div></div>';
}
function foot(p){ return '<div class="gcjp-foot">Scan back: Job → 🖨 Print job packet → 📷 Add paper (photo) · Job ' + esc(code(p)) + ' · ' + esc(p.name) + '</div>'; }
function body(p, sel){
  sel = sel || picked();
  var out = [], first = true;
  SECS.forEach(function(x){
    if (!sel[x.k]) return;
    if (x.k === 'forms') { FORMS.forEach(function(f){ out.push('<section class="gcjp-sec gcjp-form" data-sec="' + f[0] + '">' + (first ? header(p) : '<div class="gcjp-mini">' + esc(p.name) + ' · Job ' + esc(code(p)) + '</div>') + '<h2>' + esc(f[1]) + '</h2>' + f[2]() + foot(p) + '</section>'); first = false; }); return; }
    var h = ''; try { h = BUILD[x.k](p); } catch (e) { h = ''; }
    if (!h) return;
    out.push('<section class="gcjp-sec" data-sec="' + x.k + '">' + (first ? header(p) : '<div class="gcjp-mini">' + esc(p.name) + ' · Job ' + esc(code(p)) + '</div>') + '<h2>' + esc(x.l.replace(/ \(no prices\)/, '')) + '</h2>' + h + foot(p) + '</section>');
    first = false;
  });
  if (!out.length) out.push('<section class="gcjp-sec">' + header(p) + '<p class="gcjp-mut">Tick at least one part above.</p>' + foot(p) + '</section>');
  return out.join('');
}
var DOC_CSS = [
  '.gcjp-doc{color:#111827;background:#fff;font:13px/1.45 Inter,-apple-system,Segoe UI,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
  '.gcjp-doc *{box-sizing:border-box}',
  '.gcjp-sec{background:#fff;padding:0.45in 0.5in 0.35in;margin:0 auto 14px;max-width:8.5in;border:1px solid #e5e7eb;border-radius:6px;overflow-wrap:anywhere}',
  '.gcjp-hd{text-align:center;border-bottom:2px solid #0f2440;padding-bottom:10px;margin-bottom:12px}.gcjp-hd img{max-width:100%}',
  '.gcjp-title{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;margin-top:4px}.gcjp-job{font-size:22px;font-weight:800}.gcjp-sub{color:#374151;font-size:12.5px}',
  '.gcjp-mini{font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:4px;margin-bottom:8px}',
  '.gcjp-doc h2{font-size:17px;margin:4px 0 8px;color:#0f2440}.gcjp-doc h3{font-size:13.5px;margin:12px 0 4px;color:#0f2440}',
  '.gcjp-doc ul{margin:4px 0 4px 18px;padding:0}.gcjp-mut{color:#6b7280;font-size:11.5px}',
  '.gcjp-kv{border-collapse:collapse;width:100%}.gcjp-kv th{text-align:left;width:34%;color:#4b5563;font-weight:600;padding:3px 8px 3px 0;vertical-align:top}.gcjp-kv td{padding:3px 0;font-weight:600}',
  '.gcjp-t{border-collapse:collapse;width:100%;margin:4px 0;font-size:12px;table-layout:auto}.gcjp-t th,.gcjp-t td{border:1px solid #d1d5db;padding:4px 6px;text-align:left;vertical-align:top}.gcjp-t th{background:#f3f4f6}',
  '.gcjp-g td{height:26px}.gcjp-scope{white-space:pre-wrap;margin:4px 0 10px}',
  '.gcjp-ln{border-bottom:1px solid #9ca3af;height:24px}.gcjp-fr{display:flex;gap:16px;margin:8px 0;flex-wrap:wrap}',
  '.gcjp-f{flex:1;min-width:120px;display:flex;gap:6px;align-items:flex-end}.gcjp-f span{font-weight:600;white-space:nowrap}.gcjp-f i{flex:1;border-bottom:1px solid #6b7280;height:20px}',
  '.gcjp-sig{flex:1;min-width:140px;margin-top:22px}.gcjp-sig i{display:block;border-bottom:1px solid #111827;height:24px}.gcjp-sig span{font-size:11px;color:#4b5563}',
  '.gcjp-foot{margin-top:14px;border-top:1px solid #e5e7eb;padding-top:5px;font-size:10.5px;color:#4b5563;text-align:center}'
].join('\n');
var PRINT_CSS = '@page{size:letter;margin:0.4in}@media print{.gcjp-sec{border:0!important;border-radius:0!important;margin:0!important;padding:0!important;max-width:none!important}.gcjp-sec+.gcjp-sec{break-before:page;page-break-before:always}.gcjp-t tr,.gcjp-fr{break-inside:avoid}}';
function standalone(p, sel){
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Job packet — ' + esc(p.name) + '</title><style>body{margin:0;background:#fff}' + DOC_CSS + PRINT_CSS + '</style></head><body><div class="gcjp-doc">' + body(p, sel) + '</div></body></html>';
}

/* ── the screen ── */
function css(){
  if (D.getElementById('gcjp-css')) return;
  var st = D.createElement('style'); st.id = 'gcjp-css';
  st.textContent = DOC_CSS + '\n' +
    '#_gcPacket{position:fixed;inset:0;z-index:99995;background:#f3f4f6;display:flex;flex-direction:column;font-family:Inter,-apple-system,sans-serif;color:#111827}' +
    '#_gcPacket .gcjp-bar{flex:none;background:#fff;border-bottom:1px solid #e5e7eb;padding:calc(8px + env(safe-area-inset-top,0px)) 10px 8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}' +
    '#_gcPacket .gcjp-bar button{min-height:44px;border-radius:10px;border:1px solid #d1d5db;background:#fff;color:#111827;font:700 14px Inter,-apple-system,sans-serif;padding:0 12px;cursor:pointer}' +
    '#_gcPacket .gcjp-bar .gcjp-back{border:0;color:#2563eb;font-size:16px;padding:0 8px 0 2px}#_gcPacket .gcjp-bar .pri{background:#0f2440;color:#fff;border-color:#0f2440}' +
    '#_gcPacket .gcjp-name{flex:1 1 140px;min-width:0;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#_gcPacket .gcjp-acts{display:flex;flex-wrap:wrap;gap:6px;width:100%}' +
    '#_gcPacket .gcjp-scroll{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding:12px 10px calc(24px + env(safe-area-inset-bottom,0px))}' +
    '#_gcPacket .gcjp-opts{max-width:8.5in;margin:0 auto 12px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px}' +
    '#_gcPacket .gcjp-opts b{display:block;margin-bottom:6px}#_gcPacket .gcjp-opts label{display:flex;align-items:center;gap:8px;min-height:36px;font-size:14px}#_gcPacket .gcjp-opts input{width:20px;height:20px}' +
    '#_gcPacket .gcjp-note{font-size:12px;color:#6b7280;margin-top:6px}' +
    '@media (max-width:600px){#_gcPacket .gcjp-sec{padding:16px 14px}}' +
    PRINT_CSS +
    '@media print{html.gcjp-open,html.gcjp-open body{height:auto!important;min-height:0!important;overflow:visible!important;background:#fff!important;position:static!important}' +
    'html.gcjp-open body>*:not(#_gcPacket){display:none!important}' +
    'html.gcjp-open #_gcPacket{position:static!important;inset:auto!important;display:block!important;background:#fff!important;overflow:visible!important;height:auto!important}' +
    'html.gcjp-open #_gcPacket .gcjp-bar,html.gcjp-open #_gcPacket .gcjp-opts{display:none!important}' +
    'html.gcjp-open #_gcPacket .gcjp-scroll{overflow:visible!important;height:auto!important;padding:0!important;display:block!important}}';
  (D.head || D.documentElement).appendChild(st);
}
function close(){ var o = D.getElementById('_gcPacket'); if (o) o.remove(); D.documentElement.classList.remove('gcjp-open'); }
function fileOf(p){ var name = 'GrayCo_Job_Packet_' + s(p.name).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') + '.html'; return { name: name, html: standalone(p, picked()) }; }
function download(p){
  var f = fileOf(p), url = URL.createObjectURL(new Blob([f.html], { type: 'text/html' }));
  var a = D.createElement('a'); a.href = url; a.download = f.name; a.style.display = 'none'; D.body.appendChild(a); a.click(); a.remove();
  nST.call(W, function(){ try { URL.revokeObjectURL(url); } catch (e) {} }, 30000);
  toast('⬇️ Job packet downloaded — open it to print or save as PDF');
}
function share(p){
  var f = fileOf(p), file = null;
  try { file = new File([f.html], f.name, { type: 'text/html' }); } catch (e) { file = null; }
  if (file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'Job packet — ' + s(p.name) }).catch(function(){}); return; }
  download(p);
}
function print(p){
  if (W._gcViewer && typeof W._gcViewer.open === 'function') {
    W._gcViewer.open({ html: standalone(p, picked()), name: fileOf(p).name, type: 'text/html' });   /* the same file name as ⬇️ Download */
    nST.call(W, function(){ var pb = D.querySelector('#gc-viewer [data-gv="print"]'); if (pb) pb.click(); }, 800);
    return 'viewer';
  }
  D.documentElement.classList.add('gcjp-open');
  try { W.print(); } catch (e) {}
  return 'print';
}
function paper(p){
  if (W._gcFP && typeof W._gcFP.addPhotoFile === 'function') return W._gcFP.addPhotoFile(p.id, { cat: 'Packet scan', note: 'Paper from packet' });
  toast('📷 Add Photo/File is not on this screen yet — open the job in Field.');
  return null;
}
function open(pid){
  var p = proj(pid); if (!p) { toast('Open a job first.'); return null; }
  css(); close();
  var sel = picked();
  var o = D.createElement('div'); o.id = '_gcPacket'; o.setAttribute('data-pid', s(p.id));
  o.innerHTML = '<div class="gcjp-bar"><button type="button" class="gcjp-back" data-a="back">‹ Back</button><span class="gcjp-name">🖨 Job packet — ' + esc(p.name) + '</span>' +
    '<span class="gcjp-acts"><button type="button" class="pri" data-a="print">🖨 Print</button>' + (navigator.share ? '<button type="button" data-a="share">📤 Share</button>' : '') +
    '<button type="button" data-a="dl">⬇️ Download</button><button type="button" data-a="paper">📷 Add paper (photo)</button></span></div>' +
    '<div class="gcjp-scroll"><div class="gcjp-opts"><b>Print these parts</b>' + SECS.map(function(x){ return '<label><input type="checkbox" data-k="' + x.k + '"' + (sel[x.k] ? ' checked' : '') + '> ' + esc(x.l) + '</label>'; }).join('') +
    '<div class="gcjp-note">Parts with nothing on this job are left out. Working on paper? 📷 Add paper (photo) puts the filled-in sheet back on the job (Documents → "Packet scan"). The portal stays the main way to work.</div></div>' +
    '<div class="gcjp-doc">' + body(p, sel) + '</div></div>';
  D.body.appendChild(o);
  D.documentElement.classList.add('gcjp-open');
  loadPunch().then(function(n){ if (n && D.body.contains(o)) o.querySelector('.gcjp-doc').innerHTML = body(proj(pid) || p, picked()); });
  o.addEventListener('change', function(e){
    var t = e.target; if (!t || !t.getAttribute || !t.getAttribute('data-k')) return;
    var v = {}; Array.prototype.forEach.call(o.querySelectorAll('.gcjp-opts input[data-k]'), function(i){ v[i.getAttribute('data-k')] = i.checked; });
    lsSet(KEY, JSON.stringify(v));
    o.querySelector('.gcjp-doc').innerHTML = body(proj(pid) || p, v);
  });
  o.addEventListener('click', function(e){
    var t = e.target && e.target.closest ? e.target.closest('[data-a]') : null; if (!t || !o.contains(t)) return;
    var a = t.getAttribute('data-a'), q = proj(pid) || p;
    if (a === 'back') close(); else if (a === 'print') print(q); else if (a === 'share') share(q); else if (a === 'dl') download(q); else if (a === 'paper') paper(q);
  });
  return o;
}

/* ── the entry points ── */
D.addEventListener('click', function(e){
  var t = e.target && e.target.closest ? e.target.closest('[data-gcjp-open]') : null; if (!t) return;
  e.preventDefault(); e.stopPropagation();
  var pid = t.getAttribute('data-pid') || (t.closest('[data-pid]') || { getAttribute: function(){ return ''; } }).getAttribute('data-pid') || s((W._gcOpenProject || {}).id) || s((W._gcCurrentJob || {}).id);
  open(pid);
}, true);
/* Field: the last tile of the job page (secondary — the portal stays first) */
function fieldTile(){
  var dash = D.getElementById('_gcJobDash'), job = W._gcCurrentJob; if (!dash || !job) return;
  var grid = dash.querySelector('.gcfp-grid') || Array.prototype.filter.call(dash.querySelectorAll('div'), function(d){ return d.querySelector(':scope > ._jdAct'); })[0];
  if (!grid) return;
  var b = grid.querySelector('.gcjp-tile');
  if (!b) {
    var tpl = grid.querySelector('.gcfp-t') || grid.querySelector('._jdAct');
    b = D.createElement('button'); b.type = 'button'; b.className = 'gcjp-tile'; b.setAttribute('data-gcjp-open', '1');
    if (tpl) b.style.cssText = tpl.style.cssText;
    var i = D.createElement('span'), l = D.createElement('span'); i.textContent = '🖨'; l.textContent = 'Print job packet';
    if (tpl && tpl.children[0]) i.style.cssText = tpl.children[0].style.cssText; if (tpl && tpl.children[1]) l.style.cssText = tpl.children[1].style.cssText;
    b.appendChild(i); b.appendChild(l);
  }
  b.setAttribute('data-pid', s(job.id));
  if (grid.lastElementChild !== b) grid.appendChild(b);
}
function wrapDash(){
  var f = W._gcJobDashboard; if (typeof f !== 'function' || f.__gcJP) return false;
  var w = function(){ var r = f.apply(this, arguments); try { fieldTile(); } catch (e) {} nST.call(W, function(){ try { fieldTile(); } catch (e) {} }, 0); nST.call(W, function(){ try { fieldTile(); } catch (e) {} }, 500); return r; };
  try { Object.keys(f).forEach(function(k){ if (!(k in w)) w[k] = f[k]; }); } catch (e) {}
  w.__gcJP = true; W._gcJobDashboard = w; return true;
}
if (!wrapDash()) nST.call(W, wrapDash, 3000);
W._gcJobPacket = { open: open, close: close, html: function(pid, sel){ var p = proj(pid); return p ? standalone(p, sel) : ''; }, body: function(pid, sel){ var p = proj(pid); return p ? body(p, sel) : ''; }, print: function(pid){ var p = proj(pid); return p ? print(p) : null; }, paper: function(pid){ var p = proj(pid); return p ? paper(p) : null; }, SECS: SECS, scopeWords: scopeWords, canMoney: function(pid){ var p = proj(pid); return p ? canMoney(p) : false; } };
try { console.log('[GC] 🖨 Print job packet ready (patch JOBPACKET) — _gcJobPacket'); } catch (e) {}
})();
