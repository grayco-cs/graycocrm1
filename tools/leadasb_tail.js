<script id="gc-patch-leadasb">
/* __GC_PATCH_LEADASB__ — ☣️ LEAD & ASBESTOS ON THE JOB (owner 11/6: "I need to have lead and asbestos identifying paperwork for
   home owners that have this present, have to give within 30 days of finding out"; the rules are his CRM Setup Guide,
   Company documents → ☣️ Lead & asbestos).
   • Job page card "☣️ Lead & asbestos": year built (pre-1978 worked out), child-occupied, disturbs paint, HUD-assisted,
     commercial / 5+ units, lead found (date), asbestos found / suspected (date), and the papers with their status:
     Lead 01 Renovate Right acknowledgment (before start), Lead 02 child-occupied notice, Lead 03 completion record +
     Lead 05 test-kit results (30 days), Asbestos 01 disclosure (before start), Asbestos 02 records (at completion).
     Each paper: 📄 the form (his Word file) · ✓ Given (date + how: signed / mailed / e-mail / portal / hand).
   • Due dates: the earlier of 30 days from "found" (owner) and 30 days from completion (EPA, Lead 03 / 05); Lead 01 /
     Asbestos 01 before the start date. Shown on the card (OVERDUE in red) and as To-Dos for the office + PM
     ("Give <customer> the lead / asbestos papers — due <date>"), closed when every needed paper is marked given.
   • Commercial / 5+ units with asbestos: the NESHAP reminder (survey + state notice 10 working days before demo).
   API: window._gcLeadAsb = { need(p), paint() } */
(function(W){
'use strict';
if (W.__GC_PATCH_LEADASB__) return; W.__GC_PATCH_LEADASB__ = true;
var D = W.document, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
var F = '/company-docs/01667c529f454cf1/';
var DOCS = { L01: ['Lead 01 — Renovate Right acknowledgment', 'GrayCo_Lead_01_PreRenovation_Pamphlet_Acknowledgment.docx'], L02: ['Lead 02 — Child-occupied facility notice', 'GrayCo_Lead_02_Child_Occupied_Facility_Notice.docx'],
  L03: ['Lead 03 — Completion record', 'GrayCo_Lead_03_Completion_Records_and_Delivery.docx'], L05: ['Lead 05 — Test kit results', 'GrayCo_Lead_05_Test_Kit_Results_Report.docx'],
  A01: ['Asbestos 01 — Disclosure & acknowledgment', 'GrayCo_Asbestos_01_Customer_Disclosure_Acknowledgment.docx'], A02: ['Asbestos 02 — Records transmittal', 'GrayCo_Asbestos_02_Completion_Records_Transmittal.docx'] };
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function ymd(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function today(){ return ymd(new Date()); }
function plus(day, n){ var d = new Date(s(day).slice(0, 10) + 'T12:00:00'); if (isNaN(d)) return ''; d.setDate(d.getDate() + n); return ymd(d); }
function nice(day){ var d = new Date(s(day).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? '' : (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear(); }
function proj(pid){ return ((W._crm && W._crm.projects) || []).find(function(p){ return p && s(p.id) === s(pid); }) || null; }
function la(p){ return (p && p.leadAsb && typeof p.leadAsb === 'object') ? p.leadAsb : {}; }
function pre78(p){ var y = parseInt(la(p).yearBuilt || p.yearBuilt, 10); return y ? y < 1978 : null; }
function doneDay(p){ return s(p.completionDate || p.completedAt || p.endDate).slice(0, 10); }
/* which papers this job needs, each with its due date */
function need(p){
  var a = la(p), out = [], start = s(p.startDate).slice(0, 10), fin = /complete|closed|warrant/i.test(s(p.status)) ? doneDay(p) : '';
  var leadJob = (pre78(p) === true && a.disturbsPaint) || !!a.leadFound;
  var found = function(k){ return s(a[k]).slice(0, 10); };
  var earlier = function(x, y){ return !x ? y : !y ? x : (x < y ? x : y); };
  if (leadJob) {
    out.push({ k: 'L01', due: start ? plus(start, -1) : '', why: 'before work starts' });
    if (a.childOccupied) out.push({ k: 'L02', due: start ? plus(start, -1) : '', why: 'before work starts' });
    var d3 = earlier(found('leadFound') ? plus(found('leadFound'), 30) : '', fin ? plus(fin, 30) : '');
    if (fin || found('leadFound')) out.push({ k: 'L03', due: d3, why: '30 days' });
    if (a.testKit && (fin || found('leadFound'))) out.push({ k: 'L05', due: d3, why: '30 days' });
  }
  if (a.asbFound) {
    out.push({ k: 'A01', due: earlier(start ? plus(start, -1) : '', found('asbFound') ? plus(found('asbFound'), 30) : ''), why: 'before work starts / 30 days' });
    if (fin) out.push({ k: 'A02', due: fin, why: 'at completion' });
  }
  return out.map(function(x){ var g = (a.given || {})[x.k]; x.given = g || null; x.over = !g && x.due && x.due < today(); return x; });
}
function save(pid, fn){
  var now = new Date().toISOString();
  var f = function(list){ var out = (list || []).map(function(p){ if (!p || s(p.id) !== s(pid)) return p; var n = Object.assign({}, p); n.leadAsb = fn(Object.assign({}, la(p))); n.updatedAt = now; return n; }); try { if (W._gcApplySync) W._gcApplySync('projects', out); } catch (e) {} return out; };
  if (W._setProjects) W._setProjects(f); else if (W._crm) W._crm.projects = f(W._crm.projects);
  ST.call(W, function(){ paint(true); sweep(); }, 300);
}
function css(){
  if (D.getElementById('gc-la-css')) return;
  var st = D.createElement('style'); st.id = 'gc-la-css';
  st.textContent = '.gc-la{background:#fff;border:1px solid #e2e8f0;border-left:4px solid #b45309;border-radius:12px;padding:12px 14px;margin:0 0 10px;font:14px Inter,Arial,sans-serif;color:#0f172a}'
    + '.gc-la h4{margin:0 0 6px;font-size:15px}.gc-la .f{display:flex;flex-wrap:wrap;gap:10px 16px;margin:4px 0 8px;font-size:13px}.gc-la .f label{display:flex;gap:5px;align-items:center}'
    + '.gc-la input[type=date],.gc-la input[type=number]{padding:4px 6px;border:1px solid #cbd5e1;border-radius:6px;font:13px Inter,Arial,sans-serif}'
    + '.gc-la .p{display:flex;flex-wrap:wrap;gap:8px;align-items:center;border-top:1px solid #f1f5f9;padding:7px 0}.gc-la .p b{min-width:250px}'
    + '.gc-la .m{color:#64748b;font-size:12.5px}.gc-la .bad{color:#b91c1c;font-weight:800}.gc-la .ok{color:#166534;font-weight:700}'
    + '.gc-la a,.gc-la button{border:1px solid #cbd5e1;background:#fff;border-radius:7px;padding:4px 10px;font:600 12.5px Inter,Arial,sans-serif;cursor:pointer;color:#0f172a;text-decoration:none}'
    + '.gc-la button.g{background:#166534;color:#fff;border-color:#166534}.gc-la .warn{background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:7px 9px;margin:6px 0;font-size:13px}';
  D.head.appendChild(st);
}
function html(p){
  var a = la(p), pr = pre78(p), N = need(p), comm = p.isCommercial === true || /commercial/i.test(s(p.type)) || a.units5;
  var cb = function(k, t){ return '<label><input type="checkbox" data-la-c="' + k + '"' + (a[k] ? ' checked' : '') + '> ' + t + '</label>'; };
  var dt = function(k, t){ return '<label>' + t + ' <input type="date" data-la-d="' + k + '" value="' + esc(s(a[k]).slice(0, 10)) + '"></label>'; };
  var h = '<h4>☣️ Lead &amp; asbestos' + (N.some(function(x){ return x.over; }) ? ' <span class="bad">· OVERDUE</span>' : N.length ? ' <span class="m">· ' + N.filter(function(x){ return !x.given; }).length + ' paper(s) to give</span>' : '') + '</h4>'
    + '<div class="f"><label>Year built <input type="number" min="1700" max="2100" data-la-y value="' + esc(a.yearBuilt || p.yearBuilt || '') + '" style="width:80px"></label>'
    + (pr === true ? '<span class="bad">Pre-1978</span>' : pr === false ? '<span class="ok">1978 or newer</span>' : '<span class="m">(required — pre-1978 is worked out)</span>')
    + cb('disturbsPaint', 'Disturbs paint (>6 SF in / 20 SF out, windows, demo)') + cb('childOccupied', 'Child-occupied (school, daycare, Head Start, child under 6)') + cb('hud', 'HUD-assisted') + cb('units5', 'Commercial / 5+ units') + cb('testKit', 'Lead test kit used') + '</div>'
    + '<div class="f">' + dt('leadFound', '🧪 Lead found on') + dt('asbFound', '🧪 Asbestos found / suspected on') + '</div>';
  if (a.asbFound && comm) h += '<div class="warn">Commercial / 5+ units with asbestos: an asbestos survey and the state notice (TDEC / MDEQ / ADEQ) at least 10 working days before demolition — the licensed abatement sub files it.</div>';
  if (a.hud) h += '<div class="warn">HUD-assisted: HUD notice to the occupant within 15 days of completion and clearance testing by a certified inspector / risk assessor (setup guide).</div>';
  if (!N.length) h += '<div class="m">No lead / asbestos papers needed yet. Fill in the year built; tick what applies or add the date lead or asbestos was found.</div>';
  N.forEach(function(x){
    var d = DOCS[x.k];
    h += '<div class="p" data-k="' + x.k + '"><b>' + esc(d[0]) + '</b>'
      + (x.given ? '<span class="ok">✓ Given ' + esc(nice(x.given.on)) + ' (' + esc(x.given.how) + ')</span>' : '<span class="' + (x.over ? 'bad' : 'm') + '">' + (x.due ? (x.over ? 'OVERDUE — was due ' : 'Due ') + esc(nice(x.due)) : 'Due ' + esc(x.why) + (/before/.test(x.why) ? ' (add the start date)' : '')) + '</span>')
      + '<span style="margin-left:auto;display:flex;gap:6px"><a href="' + F + d[1] + '" download>📄 Form</a>' + (x.given ? '<button type="button" data-la="undo">Undo</button>' : '<button type="button" class="g" data-la="give">✓ Given</button>') + '</span></div>';
  });
  return h;
}
function findBack(){ var m = D.querySelector('main'); if (!m) return null; var bs = m.getElementsByTagName('button'); for (var i = 0; i < bs.length && i < 80; i++) if (/^\s*←\s*All Projects\s*$/.test(bs[i].textContent || '')) return bs[i]; return null; }
function typing(el){ var a = D.activeElement; return !!(el && a && el.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)); }
function paint(force){
  try {
    if (D.hidden || D.documentElement.classList.contains('_fieldmode')) return;
    var op = W._gcOpenProject, p = op && op.id ? proj(op.id) : null, cur = D.getElementById('gc-la');
    if (!p) { if (cur) cur.remove(); return; }
    var back = findBack(); if (!back || typeof W._gcJobBox !== 'function') return;
    var box = W._gcJobBox(back); if (!box) return; css();
    var sig = JSON.stringify([p.id, p.status, p.startDate, p.completionDate, la(p)]);
    if (cur && cur.parentElement === box && (cur.getAttribute('data-sig') === sig || (typing(cur) && !force))) return;
    if (!cur) { cur = D.createElement('div'); cur.id = 'gc-la'; cur.className = 'gc-la'; cur.setAttribute('data-gc-keep', '1'); }
    cur.setAttribute('data-pid', p.id); cur.setAttribute('data-sig', sig); cur.innerHTML = html(p);
    if (cur.parentElement !== box) box.appendChild(cur);
  } catch (e) {}
}
D.addEventListener('change', function(e){
  var c = D.getElementById('gc-la'); if (!c || !c.contains(e.target)) return; var pid = c.getAttribute('data-pid'), t = e.target;
  if (t.hasAttribute('data-la-c')) { var k = t.getAttribute('data-la-c'), v = t.checked; save(pid, function(a){ a[k] = v; return a; }); }
  else if (t.hasAttribute('data-la-d')) { var k2 = t.getAttribute('data-la-d'), v2 = s(t.value); save(pid, function(a){ a[k2] = v2; return a; }); }
  else if (t.hasAttribute('data-la-y')) { var y = parseInt(t.value, 10); save(pid, function(a){ a.yearBuilt = y || ''; return a; }); }
}, true);
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest ? e.target.closest('#gc-la [data-la]') : null; if (!b) return;
  var c = D.getElementById('gc-la'), pid = c.getAttribute('data-pid'), k = b.closest('[data-k]').getAttribute('data-k');
  if (b.getAttribute('data-la') === 'undo') { save(pid, function(a){ a.given = Object.assign({}, a.given || {}); delete a.given[k]; return a; }); return; }
  var how = W.prompt('How was ' + DOCS[k][0] + ' given?\n1 = signed by the customer\n2 = mailed (keep the receipt)\n3 = e-mailed\n4 = customer portal\n5 = handed over', '1'); if (how == null) return;
  var H = { 1: 'signed', 2: 'mailed', 3: 'e-mailed', 4: 'portal', 5: 'handed over' }[s(how)] || s(how);
  var on = W.prompt('Date given (YYYY-MM-DD):', today()); if (on == null) return;
  var who = ''; try { who = s(JSON.parse(localStorage.getItem('grayco_user') || '{}').name); } catch (x) {}
  save(pid, function(a){ a.given = Object.assign({}, a.given || {}); a.given[k] = { on: s(on).slice(0, 10) || today(), how: H, by: who, at: new Date().toISOString() }; return a; });
}, true);
/* To-Dos (office / admins write them; the list is shared) */
function office(){ try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {} try { var u = JSON.parse(localStorage.getItem('grayco_user') || '{}'); return /admin|office/i.test(s(u.role) + ' ' + s(u.profile)) || /owner/i.test(s(u.payType)); } catch (e) { return false; } }
function sweep(){
  try {
    if (!office()) return; var P = (W._crm && W._crm.projects) || []; if (!P.length) return;
    var l = []; try { l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]') || []; } catch (e) {} var ch = false, now = new Date().toISOString();
    P.forEach(function(p){
      if (!p || !p.id || p.deleted || !p.leadAsb) return;
      var N = need(p).filter(function(x){ return !x.given; }), id = 'LEADASB_' + p.id, t = l.find(function(x){ return x && x.id === id; });
      if (N.length) {
        var due = N.map(function(x){ return x.due; }).filter(Boolean).sort()[0] || '', over = N.some(function(x){ return x.over; });
        var lab = (over ? '⚠️ OVERDUE — ' : '☣️ ') + 'Give ' + s(p.client || p.name) + ' the lead / asbestos papers' + (due ? ' — due ' + nice(due) : '') + ' (' + N.map(function(x){ return x.k.replace('L', 'Lead ').replace('A', 'Asbestos '); }).join(', ') + ')';
        if (!t) { l.push({ id: id, kind: 'leadasb', pid: p.id, label: lab, note: 'Job ' + s(p.name) + ' → ☣️ Lead & asbestos card: the forms and ✓ Given. Keep signed papers 3 years.', assignee: s(p.pm), addedBy: 'CRM', addedAt: now, updatedAt: now, done: false, prio: over ? 'high' : 'med' }); ch = true; }
        else if (t.label !== lab || t.done) { t.label = lab; t.done = false; t.updatedAt = now; t.prio = over ? 'high' : 'med'; ch = true; }
      } else if (t && !t.done) { t.done = true; t.doneAt = t.updatedAt = now; t.resolution = 'every paper given'; ch = true; }
    });
    if (ch) { try { localStorage.setItem('gc_office_tasks', JSON.stringify(l)); } catch (e) {} try { if (W._gcOfficeTasksPush) W._gcOfficeTasksPush(); } catch (e) {} try { var u = W._supaUpsertNow || W._supaUpsert; if (u) u('gc_office_tasks', l); } catch (e) {} }
  } catch (e) {}
}
SI.call(W, function(){ paint(false); }, 1300); ST.call(W, sweep, 30000); SI.call(W, sweep, 300000);
W._gcLeadAsb = { need: need, paint: paint, sweep: sweep };
})(window);
</script>
