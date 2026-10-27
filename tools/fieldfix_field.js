/* ═════ patch FIELDFIX (owner 10/27: "thought we fixed the aesthetic of this field app") ═════
   GrayCo Field is THE field app on every device: a desk computer's 🖥 / Field toggle opened the old dark
   "Pick a Job" list (eligible() asked for a phone), and Jobs / All jobs › on a phone went to that list too.
   Now: Home and All jobs are both drawn here (GrayCo navy / gold, the logo centred); the old list is used only
   when this one fails to draw. Job cards read like jobs: job name, PO, the JOB SITE address (a P.O. Box billing
   address and "United States of America" are never shown), stage, PM and the customer underneath (never the same
   name twice). A QuickBooks customer row with no job details yet is kept, in its own fold at the bottom. */
function fxSite(a){
  var t = s(a).replace(/\s+/g, ' ').replace(/[,\s]*(United States of America|United States|U\.S\.A\.?|USA)\s*$/i, '').trim();
  return /^(p\.?\s*o\.?\s*box|post office box|pob\b)/i.test(t) ? '' : t;
}
function fxEsts(p){
  var id = s(p.id), eid = s(p.estimateId || p._lastEstId);
  var all = Array.isArray(W._gcEstimatesState) && W._gcEstimatesState.length ? W._gcEstimatesState : arr(C().estimates);
  return all.filter(function(e){ return e && !e.deleted && !e.isTemplate && (s(e.pid) === id || (eid && s(e.id) === eid)); })
    .sort(function(a, b){ return s(b.updatedAt || b.savedAt || b.date).localeCompare(s(a.updatedAt || a.savedAt || a.date)); });
}
function fxCust(p){ return s(p.client || p.company || p.qbClient); }
function fxNamed(p){ var n = low(p.name); return !n || n === low(p.client) || n === low(p.company) || n === low(p.qbClient); }
function fxImported(p){ return /^QB_/.test(s(p.id)) || /quickbooks/i.test(s(p.source)); }
function fxStage(p, e, bare){
  var st = low(p.status), es = e && e.estin ? s(e.estin.state) : '';
  if (bare) return ['Customer record', 'w'];
  if (/lost|cancel/.test(st)) return ['Lost', 'w'];
  if (/complete|closed/.test(st)) return ['Completed', 'w'];
  if (/hold/.test(st)) return ['On hold', 'o'];
  var importDefault = fxImported(p) && st === 'active' && !(parseFloat(p.contract) > 0) && !s(p.startDate);   /* QuickBooks marks every customer "Active" */
  if (!importDefault) {
    if (/approv|won|sold|signed|contract/.test(st) || es === 'signed') return ['Won', 'g'];
    if (/active|progress|start/.test(st)) return ['In progress', 'g'];
  }
  if (es === 'waiting' || es === 'needs-email' || /sent/.test(low(e && e.status))) return ['Bid sent', 'b'];
  if (e) return ['Estimate', 'b'];
  return [/bid/.test(st) || importDefault ? 'Bidding' : (s(p.status) || 'Open'), 'b'];
}
function fxView(p){
  var e = fxEsts(p)[0] || null, cust = fxCust(p), name = s(p.name), site = fxSite(p.address);
  if (fxNamed(p) && e) {
    var en = s(e.name).replace(/\s+[—-]\s+final quote$/i, ''), es = fxSite(e.address);
    if (en && low(en) !== low(cust)) name = (!cust || low(en).indexOf(low(cust)) >= 0) ? en : cust + ' — ' + en;
    else if (es) name = (cust ? cust + ' — ' : '') + es.split(',')[0];
  }
  if (!site && e) site = fxSite(e.address);
  var bare = fxNamed(p) && !site && !s(p.scope) && !(parseFloat(p.contract) > 0) && !e;
  name = name || cust || 'Job';
  return { p: p, e: e, name: name, site: site, cust: cust && low(name).indexOf(low(cust)) < 0 ? cust : '', bare: bare, po: s(p.autoPO || p.po), pm: s(p.pm), stage: fxStage(p, e, bare) };
}
function fxSub(p){ var v = fxView(p); return esc([v.po ? 'PO ' + v.po : '', v.site, v.cust].filter(Boolean).join(' · ')); }
function fxCard(v){
  return '<button type="button" class="fx-card' + (v.bare ? ' bare' : '') + '" data-fx="open" data-pid="' + esc(v.p.id) + '"><span class="fx-r1"><b>' + esc(v.name) + '</b>' + (v.po ? '<span class="fx-po">' + esc(v.po) + '</span>' : '') + '</span>' +
    (v.site ? '<span class="fx-ad">📍 ' + esc(v.site) + '</span>' : (v.bare ? '<span class="fx-ad fx-mut">No job site yet — open it to add the address, or make its estimate</span>' : '')) +
    '<span class="fx-r3"><span class="fx-st ' + v.stage[1] + '">' + esc(v.stage[0]) + '</span>' + (v.cust ? '<span>' + esc(v.cust) + '</span>' : '') + (v.pm ? '<span>PM: ' + esc(v.pm) + '</span>' : '') + '</span></button>';
}
var FX = { q: '', f: '' };
function fxAdm(){ var k = rk(); return isAdmin() || k === 'admin' || k === 'office'; }
function fxJobs(){
  var all = arr(C().projects).filter(active), adm = fxAdm(), f = FX.f || (adm ? 'all' : 'mine');
  if (f === 'mine') all = all.filter(mine);
  var vs = all.map(fxView);
  if (f === 'bid') vs = vs.filter(function(v){ return /Bidding|Estimate|Bid sent/.test(v.stage[0]); });
  if (f === 'go') vs = vs.filter(function(v){ return /In progress|Won|On hold/.test(v.stage[0]); });
  var q = low(FX.q);
  if (q) vs = vs.filter(function(v){ return low([v.name, v.site, fxCust(v.p), v.po, v.pm, v.stage[0], v.p.scope].join(' ')).indexOf(q) >= 0; });
  var ord = { 'In progress': 0, 'Won': 1, 'On hold': 2, 'Bid sent': 3, 'Estimate': 4, 'Bidding': 5 }, o = function(v){ var x = ord[v.stage[0]]; return x == null ? 6 : x; };
  vs.sort(function(a, b){ return o(a) - o(b) || a.name.localeCompare(b.name); });
  return { f: f, adm: adm, jobs: vs.filter(function(v){ return !v.bare; }), bare: vs.filter(function(v){ return v.bare; }) };
}
function fxPaint(){
  var ov = D.getElementById('_gcFhAll'); if (!ov) return;
  var m = fxJobs(), chips = [['all', 'All open'], ['go', 'In progress'], ['bid', 'Bidding']];
  if (!m.adm) chips.unshift(['mine', 'Mine']);
  ov.querySelector('[data-fx-chips]').innerHTML = chips.map(function(c){ return '<button type="button" data-fx="f" data-v="' + c[0] + '"' + (m.f === c[0] ? ' class="on"' : '') + '>' + c[1] + '</button>'; }).join('');
  ov.querySelector('[data-fx-list]').innerHTML = (m.jobs.length ? m.jobs.map(fxCard).join('') : '<div class="fh-empty">No jobs match.</div>') +
    (m.bare.length ? '<details class="fx-bare"><summary>📇 Customer records — no job details yet (' + m.bare.length + ')</summary><div class="fx-note">Customers from QuickBooks that sit on the job list with no job site, scope or estimate. Open one to add its job site, or make its estimate — the job is filled from it.</div>' + m.bare.map(fxCard).join('') + '</details>' : '');
  var n = ov.querySelector('[data-fx-n]'); if (n) n.textContent = m.jobs.length + ' job' + (m.jobs.length === 1 ? '' : 's') + (m.f === 'mine' ? ' · mine' : '');
}
function fxTab(k){ var t = D.getElementById('gc-fh-tabs'); if (t) Array.prototype.forEach.call(t.querySelectorAll('[data-t]'), function(x){ x.classList.toggle('on', x.getAttribute('data-t') === k); }); }
function fxOpenAll(){
  css();
  var ov = D.getElementById('_gcFhAll');
  if (!ov) {
    ov = D.createElement('div'); ov.id = '_gcFhAll'; ov.className = 'gc-fh fx-all'; D.body.appendChild(ov);
    ov.addEventListener('click', fxClick);
    ov.addEventListener('input', function(ev){ if (ev.target && ev.target.getAttribute('data-fx') === 'q') { FX.q = ev.target.value; fxPaint(); } });
  }
  ov.innerHTML = '<div class="fx-col"><div class="fh-top fx-top"><button type="button" class="fx-back" data-fx="back">‹ Home</button><div class="fx-logo"><img class="fh-logo" src="grayco-logo.jpg" alt="GrayCo"></div><div class="fh-h">All jobs</div><div class="fh-s" data-fx-n></div></div>' +
    '<div class="fh-wrap fx-body"><input type="search" class="fx-q" data-fx="q" placeholder="🔍 Search job, customer, address, PO, PM" autocomplete="off" value="' + esc(FX.q) + '"><div class="fx-chips" data-fx-chips></div><div data-fx-list></div></div></div>';
  fxPaint(); fxTab('jobs');
  return ov;
}
function openAll(){
  try { return fxOpenAll(); }
  catch (e) {
    try { console.warn('[GC] GrayCo Field All jobs could not draw — the old job list', e); } catch (x) {}
    fxClose();
    if (orig) { var h = D.getElementById('_gcJobPick'); if (h) h.remove(); return orig.apply(W, []); }
  }
}
function fxClose(){ var o = D.getElementById('_gcFhAll'); if (o) o.remove(); }
function fxClick(ev){
  var t = ev.target.closest('[data-fx]'); if (!t) return;
  var a = t.getAttribute('data-fx'); if (a === 'q') return;
  ev.preventDefault();
  if (a === 'back') { fxClose(); if (!D.getElementById('_gcJobPick')) openHome(); fxTab('home'); return; }
  if (a === 'f') { FX.f = t.getAttribute('data-v'); fxPaint(); return; }
  if (a === 'open') { var p = proj(t.getAttribute('data-pid')); if (!p) return; W._gcCurrentJob = p; lsSet('grayco_openpid', s(p.id)); fxClose(); if (W._gcJobDashboard) W._gcJobDashboard(p.id); }
}
function fxDesk(){ fxClose(); closeHome(); if (W._gcSetFieldMode) W._gcSetFieldMode(false); setOn(); }
var FX_CSS = [
  /* the GrayCo header: navy, the gold line, the logo in the middle */
  '.gc-fh .fh-top.fx-top{background:linear-gradient(180deg,#0a1628,#0f2440);border-bottom:3px solid #d4a017;color:#fff;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:3px;padding:calc(12px + env(safe-area-inset-top,0px)) 70px 10px;position:sticky;top:0}',
  '.gc-fh .fx-top .fh-logo{width:54px;height:54px;border-radius:12px;border:2px solid #d4a017;background:#fff;object-fit:contain}',
  '.gc-fh .fx-top .fh-h{color:#f0c451;font-size:20px;letter-spacing:.02em}.gc-fh .fx-top .fh-s{color:#cbd5e1;max-width:100%}',
  '.gc-fh .fx-top #gc-fh-sync{margin-top:3px}',
  '.gc-fh .fx-desk,.gc-fh .fx-back{position:absolute;left:10px;top:calc(12px + env(safe-area-inset-top,0px));background:#1e3a5f;color:#f0c451;border:1px solid #d4a017;border-radius:999px;padding:7px 12px;font:800 13px Inter,-apple-system,sans-serif;cursor:pointer;min-height:0!important}',
  '.gc-fh .fh-sec{color:#0f2440}.gc-fh .fh-sec button{color:#a16207}',
  '.gc-fh .fh-bar i{background:#d4a017}.gc-fh .fh-b.pri{background:#0f2440;border-color:#0f2440}.gc-fh .fh-sm{border-color:#0f2440;color:#0f2440}',
  '.gc-fh .fh-job{border-left:4px solid #d4a017}.gc-fh .fh-n{color:#0f2440}',
  '#gc-fh-tabs{background:#0a1628;border-top:2px solid #d4a017}#gc-fh-tabs button{color:#8fa8c4}#gc-fh-tabs button.on{color:#f0c451}#gc-fh-tabs button.ap{color:#fca5a5}#gc-fh-tabs button.ap .c{border-color:#0a1628}.gc-fh-badge{border-color:#0a1628;background:#d4a017;color:#0a1628}',
  /* All jobs */
  '#_gcFhAll{position:fixed;inset:0;z-index:99985;background:#f3f5f8;color:#1f2a37;overflow-y:auto;-webkit-overflow-scrolling:touch;font:15px/1.35 Inter,-apple-system,Segoe UI,Roboto,sans-serif;padding-bottom:calc(110px + env(safe-area-inset-bottom,0px))}',
  '#_gcFhAll .fx-q{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:12px;padding:12px 14px;font:16px Inter,sans-serif;background:#fff;color:#0f2440;margin:2px 0 8px}',
  '#_gcFhAll .fx-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}#_gcFhAll .fx-chips button{border:1px solid #cbd5e1;background:#fff;color:#0f2440;border-radius:999px;padding:7px 12px;font-weight:700;font-size:13px;min-height:0!important;cursor:pointer}#_gcFhAll .fx-chips button.on{background:#0f2440;color:#f0c451;border-color:#0f2440}',
  '.gc-fh .fx-card{display:flex;flex-direction:column;gap:4px;width:100%;text-align:left;background:#fff;border:1px solid #e5e7eb;border-left:4px solid #d4a017;border-radius:14px;padding:12px 14px;margin-bottom:10px;cursor:pointer;font-family:inherit;color:#1f2a37;min-height:0!important}',
  '.gc-fh .fx-card.bare{border-left-color:#cbd5e1}.gc-fh .fx-r1{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.gc-fh .fx-r1 b{flex:1;min-width:0;font-size:16px;color:#0f2440;overflow-wrap:anywhere}.gc-fh .fx-r1 .__gcListMsgBtn{flex:0 0 auto;margin-left:2px!important}',
  '.gc-fh .fx-po{flex:0 0 auto;font-size:11.5px;font-weight:800;color:#0f2440;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:1px 6px}',
  '.gc-fh .fx-ad{font-size:13px;color:#374151}.gc-fh .fx-mut{color:#9ca3af;font-style:italic}',
  '.gc-fh .fx-r3{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;font-size:12.5px;color:#6b7280}',
  '.gc-fh .fx-st{font-size:11px;font-weight:800;border-radius:999px;padding:2px 8px}.gc-fh .fx-st.g{background:#dcfce7;color:#166534}.gc-fh .fx-st.b{background:#dbeafe;color:#1e40af}.gc-fh .fx-st.o{background:#ffedd5;color:#c2410c}.gc-fh .fx-st.w{background:#f3f4f6;color:#4b5563}',
  '.gc-fh .fx-bare{margin-top:14px}.gc-fh .fx-bare summary{cursor:pointer;font-weight:800;color:#475569;font-size:13px;padding:8px 4px}.gc-fh .fx-note{font-size:12.5px;color:#6b7280;margin:0 4px 8px}',
  /* a desk screen: the same 430 px phone column the field app uses there (min-width 820 px), the tab bar under it */
  '@media (min-width:820px){html._fieldmode #_gcFhAll{left:50%!important;right:auto!important;width:430px!important;max-width:430px!important;transform:translateX(-50%)!important;border-left:1px solid #1e3a5f;border-right:1px solid #1e3a5f;box-shadow:0 0 60px rgba(0,0,0,.6)}#gc-fh-tabs{left:50%;right:auto;width:430px;transform:translateX(-50%);box-sizing:border-box}}'
];
