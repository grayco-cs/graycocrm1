/* ═══════════════════════════════════════════════════════════════════════════
   GrayCo — the 🛠 MAINTENANCE TAB (patches MAINTTAB + MAINTPLUS). tools/mainttab.js, put in the page by
   tools/patch_MAINTTAB.py as <script id="gc-patch-mainttab">.

   Owner 10/30: "I want to have a maintenance tab in the CRM to offer commercial maintenance plans and focus on reaching out
   to maintenance managers … this needs to be in pm office and admin tabs" — and the rounds after it (portal for every plan
   customer, the ⭐ priority list with snow + emergency, tiers, the plan builder, a separate Maintenance Schedule, portfolios,
   pamphlets, letters, make-ready, Emergency Ready, the condition report).
   Who sees it: admins, the office and PMs (window._gcMaintCanSee) — never the Marketing Manager, subs or crews.
   Sections: 📋 Active plans · 🗓 Schedule · 🏗 Plan builder · 👥 Prospects · ⭐ Priority list · 🏢 Portfolios · 📦 Plans & prices
             · 📄 Pamphlets · 🏚 Make-ready
   Every customer-facing thing goes to ✅ Approvals (server: netlify/functions/_lib/maint-tab.js through portal-plus).
   No timers: it draws when the tab mounts and after each action.
   API: window._gcMaintTab = { mount(el), go(sec), state(), reload() }, window._gcMaintCanSee()
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
if (window.__GC_PATCH_MAINTTAB__) return; window.__GC_PATCH_MAINTTAB__ = true;
var W = window, D = document;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function num(v){ var n = Number(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function usd(n){ return '$' + (Math.round(num(n) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function today(){ var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function dayN(iso){ return Math.round((Date.parse(s(iso).slice(0, 10) + 'T12:00:00') - Date.parse(today() + 'T12:00:00')) / 864e5); }
function day(iso){ var d = new Date(s(iso).length === 10 ? iso + 'T12:00:00' : iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function projects(){ return arr(W._crm && W._crm.projects).filter(function(p){ return p && p.deleted !== true; }); }
function proj(pid){ return projects().filter(function(x){ return String(x.id) === String(pid); })[0] || null; }
function role(){ try { return s(W._gcRP && W._gcRP.role && W._gcRP.role()); } catch (e) { return ''; } }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function full(){ try { if (typeof W._gcFullAccess === 'function') return !!W._gcFullAccess(); } catch (e) {} return isAdmin(); }
function mm(){ try { return typeof W._gcIsMM === 'function' && W._gcIsMM(); } catch (e) { return false; } }
/* who sees the tab: admins, the office, PMs (an admin "viewing as" a profile sees what that profile sees) */
W._gcMaintCanSee = function(){
  try {
    if (mm()) return false;
    var r = role();
    if (isAdmin()) return !r || /^(admin|office|project manager|assistant pm)$/i.test(r);
    if (W._gcIsOfficeFull && W._gcIsOfficeFull()) return true;
    return /^(project manager|office( admin| manager)?|assistant pm|apm)$/i.test(r);
  } catch (e) { return false; }
};
function toast(msg, bad){ try { var t = D.createElement('div'); t.setAttribute('role', 'status'); t.textContent = msg; t.className = 'gcmt-toast' + (bad ? ' bad' : ''); D.body.appendChild(t); (W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout).call(W, function(){ try { t.remove(); } catch (e) {} }, 4200); } catch (e) {} }
function fn(body){
  return W.fetch('/.netlify/functions/portal-plus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' })
    .then(function(r){ return r.json().catch(function(){ return {}; }); }, function(e){ return { ok: false, error: 'Cannot reach the server (' + (e && e.message) + ').' }; });
}
function css(){
  if (D.getElementById('gcmt-css')) return;
  var st = D.createElement('style'); st.id = 'gcmt-css';
  st.textContent = '#gcmt{font:14px Inter,Arial,sans-serif;color:#0f172a;padding:4px 2px 40px;max-width:1200px}#gcmt h1{font-size:20px;margin:0 0 4px}#gcmt .mut{color:#64748b;font-size:13px}' +
    '#gcmt .nav{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}#gcmt .nav button,#gcmt .chip{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:7px 12px;font-weight:700;cursor:pointer;min-height:36px;color:#0f172a}' +
    '#gcmt .nav button.on,#gcmt .chip.on{background:#0f172a;color:#fff;border-color:#0f172a}#gcmt .kpi{display:inline-block;background:#f1f5f9;border-radius:10px;padding:6px 10px;margin:0 6px 6px 0;font-weight:700}' +
    '#gcmt .kpi.red{background:#fee2e2;color:#991b1b}#gcmt .kpi.amb{background:#fef3c7;color:#92400e}#gcmt .card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px;margin:8px 0}' +
    '#gcmt .card.red{border-left:4px solid #dc2626;background:#fef2f2}#gcmt .card.amb{border-left:4px solid #f59e0b;background:#fffbeb}#gcmt .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}' +
    '#gcmt .btn,.gcmt-ov .btn{border:none;border-radius:8px;padding:8px 12px;font-weight:800;cursor:pointer;min-height:36px;background:#e2e8f0;color:#0f172a}#gcmt .btn.g,.gcmt-ov .btn.g{background:#16a34a;color:#fff}#gcmt .btn.b,.gcmt-ov .btn.b{background:#0ea5e9;color:#fff}' +
    '#gcmt input,#gcmt select,#gcmt textarea,.gcmt-ov input,.gcmt-ov select,.gcmt-ov textarea{border:1px solid #cbd5e1;border-radius:8px;padding:7px 9px;font-size:14px;max-width:100%;box-sizing:border-box}#gcmt .tag{display:inline-block;font-size:11px;font-weight:800;border-radius:999px;padding:2px 8px;background:#f1f5f9;margin-right:4px}' +
    '#gcmt table{width:100%;border-collapse:collapse;font-size:13px}#gcmt td,#gcmt th{text-align:left;padding:6px;border-bottom:1px solid #e2e8f0;vertical-align:top}#gcmt th{color:#475569;font-size:12px}' +
    '.gcmt-ov{position:fixed;inset:0;z-index:100300;background:rgba(6,12,20,.72);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto}.gcmt-ov .in{background:#fff;color:#0f172a;width:100%;max-width:760px;border-radius:14px;padding:16px;font:14px Inter,Arial,sans-serif}' +
    '.gcmt-ov h2{margin:0 0 8px;font-size:18px}.gcmt-ov .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}.gcmt-ov label{font-size:13px;color:#334155}.gcmt-toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483300;background:#111827;color:#fff;border-radius:10px;padding:10px 14px;font:600 13px Arial,sans-serif}.gcmt-toast.bad{background:#7f1d1d}' +
    '#gcmt .wk{font-weight:800;margin:14px 0 4px;color:#334155}#gcmt .cal{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;font-size:12px}#gcmt .cal div{background:#f8fafc;border-radius:6px;padding:4px;min-height:34px}#gcmt .cal b{display:block}';
  D.head.appendChild(st);
}
var S = { el: null, sec: 'active', d: null, busy: false, f: { pm: '', plan: '', cust: '' }, stage: '', mkt: 'commercial', B: null };
var SECS = [['active', '📋 Active plans'], ['sched', '🗓 Schedule'], ['build', '🏗 Plan builder'], ['pros', '👥 Prospects'], ['pri', '⭐ Priority list'], ['port', '🏢 Portfolios'], ['plans', '📦 Plans & prices'], ['docs', '📄 Pamphlets'], ['mready', '🏚 Make-ready']];
function load(){ S.busy = true; return fn({ action: 'tab' }).then(function(j){ S.busy = false; if (j && j.ok) S.d = j; else S.err = (j && j.error) || 'Could not load.'; paint(); return S.d; }); }
function settings(){ return (S.d && S.d.settings) || { plans: [], tiers: {}, products: [], unitPrices: [], addOns: [], templates: {} }; }
function planById(id){ return arr(settings().plans).filter(function(x){ return x.id === id; })[0] || null; }
function signed(){ return arr(S.d && S.d.contracts).filter(function(c){ return c.status === 'signed'; }); }
function visitsOf(cid){ return arr(S.d && S.d.visits).filter(function(v){ return v.contractId === cid && v.status !== 'cancelled'; }).sort(function(a, b){ return s(a.date) < s(b.date) ? -1 : 1; }); }
function nextOf(c){ var v = visitsOf(c.id).filter(function(x){ return x.status === 'planned'; })[0]; return v ? v.date : s(c.nextVisit); }
function cls(d){ if (!d) return ''; var n = dayN(d); return n < 0 ? 'red' : n <= 14 ? 'amb' : ''; }
function dueThisMonth(){ var m = today().slice(0, 7); return arr(S.d && S.d.visits).filter(function(v){ return v.status === 'planned' && s(v.date).slice(0, 7) === m; }).length; }
function overdue(){ return arr(S.d && S.d.visits).filter(function(v){ return v.status === 'planned' && dayN(v.date) < 0; }).length; }
function fq(f){ return ({ yearly: 'Once a year', twice: 'Twice a year', quarterly: 'Every 3 months', winter: 'Each winter (Dec–Feb), on call', once: 'One time' })[f] || 'Once a year'; }
function tierName(t){ return ({ bronze: 'Bronze', silver: 'Silver', gold: 'Gold' })[t] || 'Bronze'; }

function paint(){
  var el = S.el; if (!el || !el.isConnected) return; css();
  var h = '<div id="gcmt"><h1>🛠 Maintenance</h1><div class="mut">Plans for homes and commercial buildings · outreach to facility and property managers · the Maintenance Schedule. Everything a customer sees waits on ✅ Approvals.</div>';
  if (!S.d) { el.innerHTML = h + '<div class="mut" style="margin:14px 0">' + (S.err ? esc(S.err) : 'Loading…') + '</div></div>'; return; }
  h += '<div style="margin-top:8px"><span class="kpi" data-kpi="month">Due this month: ' + dueThisMonth() + '</span>' + (overdue() ? '<span class="kpi red">Overdue: ' + overdue() + '</span>' : '') + '<span class="kpi">Active plans: ' + signed().length + '</span><span class="kpi">Open prospects: ' + arr(S.d.prospects).filter(function(p){ return !/^(Won|Lost)$/.test(p.stage); }).length + '</span><span class="kpi">⭐ Priority: ' + arr(S.d.priority).length + '</span></div>';
  h += '<div class="nav">' + SECS.map(function(x){ return '<button type="button" data-sec="' + x[0] + '"' + (S.sec === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div>';
  try { h += ({ active: secActive, sched: secSched, build: secBuild, pros: secPros, pri: secPri, port: secPort, plans: secPlans, docs: secDocs, mready: secMready })[S.sec](); } catch (e) { h += '<div class="mut">This part could not draw (' + esc(e && e.message) + ').</div>'; }
  el.innerHTML = h + '</div>';
}

/* ── 📋 Active plans ── */
function secActive(){
  var L = signed().map(function(c){ return { c: c, p: proj(c.pid) || { id: c.pid, name: 'Job ' + c.pid }, next: nextOf(c) }; }).sort(function(a, b){ return (a.next || '9999') < (b.next || '9999') ? -1 : 1; });
  var byS = {}; L.forEach(function(x){ var cm = (S.d.commission || {})[x.c.id]; if (!cm) return; var k = s(x.c.soldBy) || s(x.p.pm) || '—'; (byS[k] = byS[k] || { n: 0, pm: 0, unk: 0 }); byS[k].n++; byS[k].pm += cm.pm; if (!cm.costsKnown) byS[k].unk++; });
  var head = Object.keys(byS).length ? '<div class="card" data-comm="1"><b>💵 PM commission on plans</b> <span class="mut">(self-performed: 50% of revenue − costs · subbed: 15% overhead off the revenue, then 50% of what is left after the sub\'s estimate)</span>' + Object.keys(byS).map(function(k){ return '<div>' + esc(k) + ': ' + byS[k].n + ' plan(s) · <b>' + esc(usd(byS[k].pm)) + '</b> / year' + (byS[k].unk ? ' <span class="mut">(' + byS[k].unk + ' without costs yet)</span>' : '') + '</div>'; }).join('') + '</div>' : '';
  if (!L.length) return '<div class="card mut">No signed plans yet. Build one in 🏗 Plan builder, or quote plans on a job (🛠 Maintenance on the job).</div>';
  return head + L.map(function(x){
    var cm = (S.d.commission || {})[x.c.id], ar = (S.d.area || {})[String(x.c.pid)];
    var c = x.c, p = x.p, last = arr(c.visits).slice(-1)[0], inv = arr(c.invoices).slice(-1)[0], k = cls(x.next), pri = arr(S.d.priority).some(function(e){ return e.pid === String(c.pid) && e.emergency; });
    return '<div class="card ' + k + '" data-cid="' + esc(c.id) + '"><div class="row" style="justify-content:space-between"><span><b>' + esc(s(p.address) || s(p.name)) + '</b> · ' + esc(s(p.client) || '') + ' — ' + esc(c.planName) +
      ' <span class="tag">' + esc(fq(c.freq)) + '</span><span class="tag">🏅 ' + esc(tierName(c.tier)) + '</span>' + (pri ? '<span class="tag" style="background:#fef3c7">⭐ Priority: snow + emergency</span>' : '') + (c.autoRenew ? '<span class="tag">auto-renew ✓</span>' : '') + '</span>' +
      '<span>' + esc(usd(c.price)) + ' / year</span></div>' +
      '<div class="row mut"><span>Next: <b data-next="1">' + (x.next ? esc(day(x.next)) + (k === 'red' ? ' (overdue)' : '') : '—') + '</b></span><span>Last visit: ' + (last ? esc(day(last.at)) : '—') + '</span><span>Invoice: ' + (inv ? 'period ' + esc(inv.year) + ' ' + esc(usd(inv.amount)) + ' — ' + esc(inv.status) : '—') + '</span>' + (p.pm ? '<span>PM: ' + esc(p.pm) + '</span>' : '') + (c.soldBy ? '<span>Sold by: ' + esc(c.soldBy) + '</span>' : '') + '<span>' + (c.performer === 'sub' ? '🤝 Sub: ' + esc(c.sub || '—') : '👷 Self-performed') + '</span>' + (cm ? '<span data-pmc="1">PM commission: <b>' + esc(usd(cm.pm)) + '</b> (' + esc(cm.rule) + (cm.costsKnown ? '' : ', enter the ' + (c.performer === 'sub' ? 'sub\'s estimate' : 'costs')) + ')</span>' : '') + (ar && ar.known && !ar.inArea ? '<span class="tag" style="background:#fee2e2">outside the service area</span>' : '') + '</div>' +
      '<div class="row"><button class="btn" data-a="portal">👤 Portal</button><button class="btn g" data-a="post">📝 Post visit update</button><input type="date" data-date="1" value="' + esc(x.next) + '" aria-label="Visit date"><button class="btn" data-a="sched">🗓 Schedule visit</button>' +
      (full() ? '<select data-tier="1" aria-label="Tier">' + ['bronze', 'silver', 'gold'].map(function(t){ return '<option value="' + t + '"' + ((c.tier || 'bronze') === t ? ' selected' : '') + '>🏅 ' + tierName(t) + '</option>'; }).join('') + '</select>' : '') +
      (full() ? '<button class="btn" data-a="cset">💵 Seller / sub / costs</button>' : '') + '<button class="btn" data-a="emready">🚨 Emergency Ready</button><button class="btn" data-a="pcr">📋 Condition report</button><button class="btn" data-a="letter">📄 Letter</button></div></div>';
  }).join('');
}
/* ── 🗓 the Maintenance Schedule (its own list; not the job schedule) ── */
function secSched(){
  var V = arr(S.d.visits).filter(function(v){ return v.status !== 'cancelled'; }), f = S.f;
  var pms = {}, plans = {}, custs = {}; V.forEach(function(v){ if (v.pm) pms[v.pm] = 1; plans[v.planName] = 1; custs[v.customer || v.property] = 1; });
  var opt = function(o, cur, lab){ return '<option value="">' + lab + '</option>' + Object.keys(o).sort().map(function(k){ return '<option' + (k === cur ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join(''); };
  V = V.filter(function(v){ return (!f.pm || v.pm === f.pm) && (!f.plan || v.planName === f.plan) && (!f.cust || (v.customer || v.property) === f.cust); }).sort(function(a, b){ return s(a.date) < s(b.date) ? -1 : 1; });
  var h = '<div class="row"><select data-f="pm">' + opt(pms, f.pm, 'Every PM') + '</select><select data-f="plan">' + opt(plans, f.plan, 'Every plan') + '</select><select data-f="cust">' + opt(custs, f.cust, 'Every customer') + '</select><span class="mut">Maintenance visits only — they are not on the job schedule.</span></div>';
  var m = today().slice(0, 7), first = new Date(m + '-01T12:00:00'), pad = (first.getDay() + 6) % 7, nd = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  h += '<div class="card"><b>' + first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) + '</b><div class="cal">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function(x){ return '<div class="mut">' + x + '</div>'; }).join('') + new Array(pad + 1).join('<div></div>');
  for (var i = 1; i <= nd; i++) { var dd = m + '-' + ('0' + i).slice(-2), n = V.filter(function(v){ return v.date === dd; }); h += '<div' + (n.length ? ' style="background:#e0f2fe"' : '') + '><b>' + i + '</b>' + (n.length ? n.length + ' visit' + (n.length > 1 ? 's' : '') : '') + '</div>'; }
  h += '</div></div>';
  var wk = ''; V.forEach(function(v){ var d = new Date(v.date + 'T12:00:00'), mon = new Date(d.getTime() - ((d.getDay() + 6) % 7) * 864e5), w = mon.toISOString().slice(0, 10);
    if (w !== wk) { wk = w; h += '<div class="wk">Week of ' + esc(day(w)) + '</div>'; }
    var k = v.status === 'planned' ? cls(v.date) : '';
    h += '<div class="card ' + k + '" data-vid="' + esc(v.id) + '" data-cid="' + esc(v.contractId) + '"><div class="row" style="justify-content:space-between"><span><b>' + esc(day(v.date)) + '</b> · ' + esc(v.property) + ' · ' + esc(v.planName) + (v.oncall ? ' <span class="tag">on call</span>' : '') + '</span><span class="mut">' + esc((function(){ var cc = arr(S.d.contracts).filter(function(x){ return x.id === v.contractId; })[0]; return cc && cc.performer === 'sub' && cc.sub ? '🤝 ' + cc.sub : (v.pm || ''); })()) + ' · ' + (v.status === 'done' ? '✓ done ' + esc(day(v.doneAt)) : k === 'red' ? 'overdue' : 'planned') + '</span></div>' +
      (v.status === 'planned' ? '<div class="row"><input type="date" data-date="1" value="' + esc(v.date) + '"><button class="btn" data-a="move">Move</button><button class="btn g" data-a="post">📝 Post visit update</button></div>' : '') + '</div>'; });
  return h + (V.length ? '' : '<div class="card mut">Nothing on the Maintenance Schedule yet — visits are added when a plan is signed.</div>');
}
/* ── 🏗 the plan builder: property → services → tier → review → send to sign ── */
function secBuild(){
  var B = S.B || (S.B = { step: 1, pid: '', market: 'commercial', picks: {}, tier: 'bronze', portfolioId: '', kits: {}, np: {} });
  var h = '<div class="row">' + ['1 Property', '2 Services', '3 Tier & extras', '4 Review & send'].map(function(x, i){ return '<span class="chip' + (B.step === i + 1 ? ' on' : '') + '">' + x + '</span>'; }).join('') + '</div><div class="card" data-build="1">';
  if (B.step === 1) {
    var ps = projects().filter(function(p){ return !/^(lost|dead|cancel)/i.test(s(p.status)); }).sort(function(a, b){ return s(a.name).localeCompare(s(b.name)); }).slice(0, 800);
    h += '<label>Property (a job)<br><select data-b="pid" style="min-width:320px"><option value="">— pick a job —</option>' + ps.map(function(p){ return '<option value="' + esc(p.id) + '"' + (String(p.id) === B.pid ? ' selected' : '') + '>' + esc(p.name) + (p.address ? ' · ' + esc(p.address) : '') + '</option>'; }).join('') + '</select></label>' +
      '<div class="mut" style="margin:8px 0">…or a new property (a maintenance-only customer gets a "Maintenance — property" job, so they get a portal):</div><div class="row">' +
      ['property', 'client', 'email', 'phone'].map(function(k){ return '<input data-np="' + k + '" placeholder="' + ({ property: 'Property address', client: 'Customer / company', email: 'E-mail', phone: 'Phone' })[k] + '" value="' + esc(B.np[k] || '') + '">'; }).join('') + '</div>' +
      '<div class="row"><b>Plans for:</b>' + ['commercial', 'residential'].map(function(m){ return '<button class="chip' + (B.market === m ? ' on' : '') + '" data-bm="' + m + '">' + (m === 'commercial' ? '🏢 Commercial / multi-family' : '🏠 Home') + '</button>'; }).join('') + '</div>' +
      '<div class="row"><button class="btn b" data-a="b-next">Next →</button></div>';
  } else if (B.step === 2) {
    var L = arr(settings().plans).filter(function(x){ return x.on !== false && x.freq !== 'once' && (x.market || 'residential') === B.market; });
    h += '<table><tr><th></th><th>Service</th><th>How often</th><th>Yearly price</th><th>Add-ons</th></tr>' + L.map(function(x){ var k = B.picks[x.id] || {};
      var ao = arr(settings().addOns).filter(function(a){ return arr(a.on).indexOf(x.id) >= 0; });
      return '<tr data-plan="' + esc(x.id) + '"><td><input type="checkbox" data-pk="on"' + (k.on ? ' checked' : '') + ' aria-label="' + esc(x.name) + '"></td><td><b>' + esc(x.name) + '</b><div class="mut">' + esc(s(x.includes).slice(0, 160)) + '</div></td>' +
        '<td><select data-pk="freq">' + ['yearly', 'twice', 'quarterly', 'winter'].map(function(f){ return '<option value="' + f + '"' + ((k.freq || x.freq) === f ? ' selected' : '') + '>' + fq(f) + '</option>'; }).join('') + '</select></td>' +
        '<td><input type="number" min="0" data-pk="price" value="' + esc(k.price != null ? k.price : x.price) + '" style="width:100px"></td><td>' + ao.map(function(a){ return '<label><input type="checkbox" data-ao="' + esc(a.id) + '"' + (k.ao && k.ao[a.id] ? ' checked' : '') + '> ' + esc(a.name) + ' (+' + esc(usd(a.price)) + ')</label>' + (a.id === 'infrared' ? '<div class="mut">scanner on order — book and we\'ll schedule when available</div>' : ''); }).join('<br>') + '</td></tr>'; }).join('') + '</table>' +
      '<div class="row"><button class="btn" data-a="b-back">← Back</button><button class="btn b" data-a="b-next">Next →</button></div>';
  } else if (B.step === 3) {
    var T = settings().tiers || {};
    h += '<div class="row"><b>Membership tier:</b>' + ['bronze', 'silver', 'gold'].map(function(t){ var x = T[t] || {}; return '<label class="chip' + (B.tier === t ? ' on' : '') + '"><input type="radio" name="gcmt-tier" data-tier-b="' + t + '"' + (B.tier === t ? ' checked' : '') + '> 🏅 ' + tierName(t) + ' — ' + (x.discount || 0) + '% off repairs' + (x.note ? ' · ' + esc(x.note) : '') + '</label>'; }).join('') + '</div><div class="mut">Every plan customer starts at Bronze.</div>' +
      '<div class="row"><b>Kits:</b>' + arr(settings().products).map(function(k){ return '<label><input type="number" min="0" max="50" data-kit="' + esc(k.id) + '" value="' + esc(B.kits[k.id] || 0) + '" style="width:60px"> ' + esc(k.name) + ' (' + esc(usd(k.price)) + ')</label>'; }).join(' ') + '</div>' +
      '<div class="row"><b>Portfolio:</b><select data-b="portfolioId"><option value="">— none —</option>' + arr(S.d.portfolios).map(function(p){ return '<option value="' + esc(p.id) + '"' + (p.id === B.portfolioId ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="row"><button class="btn" data-a="b-back">← Back</button><button class="btn b" data-a="b-next">Review →</button></div>';
  } else {
    var picks = bPicks(), p = proj(B.pid) || { name: B.np.property };
    h += '<b>' + esc(s(p.address) || s(p.name)) + '</b> · 🏅 ' + tierName(B.tier) + '<table><tr><th>Service</th><th>How often</th><th>Price / year</th></tr>' + picks.map(function(x){ return '<tr><td>' + esc(x.name) + (x.addOns.length ? '<div class="mut">+ ' + esc(x.addOns.map(function(a){ return a.id; }).join(', ')) + '</div>' : '') + '</td><td>' + fq(x.freq) + '</td><td>' + esc(usd(x.price)) + '</td></tr>'; }).join('') +
      '<tr><td colspan="2"><b>Total</b></td><td><b>' + esc(usd(picks.reduce(function(t, x){ return t + x.price; }, 0))) + '</b></td></tr></table><div class="mut">Send to sign: the customer sees every plan in their portal and signs there; the e-mail waits on ✅ Approvals. Once signed, each plan\'s visits go on the Maintenance Schedule for the year.</div>' +
      '<div class="row"><button class="btn" data-a="b-back">← Back</button><button class="btn g" data-a="b-send"' + (picks.length ? '' : ' disabled') + '>Send to sign (' + picks.length + ')</button></div>';
  }
  return h + '</div>';
}
function bPicks(){ var B = S.B; return Object.keys(B.picks).filter(function(id){ return B.picks[id].on; }).map(function(id){ var k = B.picks[id], x = planById(id) || { name: id, price: 0, freq: 'yearly' };
  var ao = Object.keys(k.ao || {}).filter(function(a){ return k.ao[a]; }).map(function(a){ return arr(settings().addOns).filter(function(y){ return y.id === a; })[0]; }).filter(Boolean);
  return { planId: id, name: x.name, freq: k.freq || x.freq, price: num(k.price != null ? k.price : x.price) + ao.reduce(function(t, a){ return t + num(a.price); }, 0), addOns: ao.map(function(a){ return { id: a.id, price: a.price }; }) }; }); }
/* ── 👥 prospects (commercial outreach) ── */
function secPros(){
  var P = arr(S.d.prospects), st = arr(S.d.stages);
  var h = '<div class="row"><button class="btn g" data-a="p-add">＋ Add prospect</button><button class="btn" data-a="p-import">⇪ Import from customers / leads</button>' + ['', ...[]].concat(st).map(function(x){ return '<button class="chip' + (S.stage === x ? ' on' : '') + '" data-stage="' + esc(x) + '">' + (x || 'All') + ' ' + (x ? P.filter(function(p){ return p.stage === x; }).length : P.length) + '</button>'; }).join('') + '</div>';
  var L = P.filter(function(p){ return !S.stage || p.stage === S.stage; }).sort(function(a, b){ return (a.nextAt || '9999') < (b.nextAt || '9999') ? -1 : 1; });
  if (!L.length) return h + '<div class="card mut">No prospects here. Add facility / property / maintenance managers, or import them from the customers and leads.</div>';
  return h + L.map(function(p){
    return '<div class="card ' + (p.nextAt && dayN(p.nextAt) < 0 ? 'red' : '') + '" data-pr="' + esc(p.id) + '"><div class="row" style="justify-content:space-between"><span><b>' + esc(p.company || p.contact) + '</b>' + (p.contact ? ' · ' + esc(p.contact) : '') + (p.role ? ' (' + esc(p.role) + ')' : '') + ' <span class="tag">' + esc(p.buildingType || 'building') + '</span></span>' +
      '<select data-pstage="1">' + st.map(function(x){ return '<option' + (x === p.stage ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></div>' +
      '<div class="mut">' + [p.phone, p.email, p.properties, p.source ? 'from ' + p.source : '', p.assigned ? '👤 ' + p.assigned : ''].filter(Boolean).map(esc).join(' · ') + (p.nextAt ? ' · next: <b>' + esc(day(p.nextAt)) + '</b> ' + esc(p.nextStep || '') : '') + '</div>' +
      (arr(p.log).length ? '<div class="mut">' + esc(arr(p.log).slice(-2).map(function(l){ return day(l.at) + ' ' + l.what; }).join(' · ')) + '</div>' : '') +
      '<div class="row"><button class="btn b" data-a="o-free">✉ Offer free roof inspection</button><button class="btn b" data-a="o-plan">✉ Offer a maintenance plan</button><button class="btn" data-a="o-snow">❄️ Winter snow</button><button class="btn" data-a="p-call">📞 Log a call</button><button class="btn" data-a="p-book">📅 Book free inspection</button><button class="btn g" data-a="p-start">▶ Start a plan</button><button class="btn" data-a="p-edit">Edit</button></div></div>';
  }).join('');
}
/* ── ⭐ the priority list (snow + emergency) ── */
function secPri(){
  var L = arr(S.d.priority), cf = !!settings().commercialFirst;
  var h = '<div class="mut">Every commercial maintenance-plan customer is on this list automatically (snow & ice + emergency mitigation), plus every winter snow sign-up — in sign-up order.</div><div class="row">' +
    (full() ? '<label><input type="checkbox" data-a="cfirst"' + (cf ? ' checked' : '') + '> Commercial first</label><button class="btn b" data-a="snow">❄️ Snow event</button>' : '') + '</div>';
  return h + (L.length ? '<table><tr><th>#</th><th>Customer</th><th>Property</th><th>Plans</th><th>Perks</th><th>Since</th></tr>' + L.map(function(e, i){ return '<tr data-pid="' + esc(e.pid) + '"><td>' + (i + 1) + '</td><td>' + esc(e.name) + (e.commercial ? ' <span class="tag">commercial</span>' : '') + '</td><td>' + esc(e.address) + '</td><td>' + esc(e.plans.join(', ')) + '</td><td>' + (e.snow ? '❄️ ' : '') + (e.emergency ? '🚨' : '') + '</td><td>' + esc(day(e.since)) + '</td></tr>'; }).join('') + '</table>' : '<div class="card mut">Nobody yet — a commercial plan or a winter snow sign-up puts the customer here.</div>');
}
/* ── 🏢 portfolios: one property manager, many properties, one contract view ── */
function secPort(){
  var h = '<div class="row"><button class="btn g" data-a="pf-add">＋ New portfolio</button></div>';
  return h + arr(S.d.portfolios).map(function(pf){
    var cs = arr(S.d.contracts).filter(function(c){ return c.portfolioId === pf.id && !/^(cancelled|declined)$/.test(c.status); });
    var by = {}; cs.forEach(function(c){ (by[c.pid] = by[c.pid] || []).push(c); });
    return '<div class="card" data-pf="' + esc(pf.id) + '"><div class="row" style="justify-content:space-between"><b>' + esc(pf.name) + '</b><span class="mut">' + esc([pf.contact, pf.email].filter(Boolean).join(' · ')) + (pf.combined ? ' · one combined invoice' : '') + '</span></div>' +
      arr(pf.pids).map(function(pid){ var p = proj(pid) || { name: pid }; return '<div class="row"><span><b>' + esc(s(p.address) || s(p.name)) + '</b>: ' + (by[pid] ? by[pid].map(function(c){ return esc(c.planName) + ' (' + esc(c.status) + ', ' + esc(usd(c.price)) + ')'; }).join(', ') : '<span class="mut">no plan yet</span>') + '</span><button class="btn" data-a="pf-build" data-pid="' + esc(pid) + '">🏗 Plan for this property</button></div>'; }).join('') +
      '<div class="mut">Total: ' + esc(usd(cs.reduce(function(t, c){ return t + num(c.price); }, 0))) + ' / year · ' + cs.length + ' plans</div><div class="row"><button class="btn" data-a="pf-edit">Edit</button></div></div>';
  }).join('') + (arr(S.d.portfolios).length ? '' : '<div class="card mut">A portfolio groups a property manager\'s buildings: each gets its own plan (🏗 Plan builder), all in one view, with one combined invoice if they want.</div>');
}
/* ── 📦 plans & prices (and tiers, add-ons, kits, the make-ready price list, the e-mail and letter templates) ── */
function secPlans(){
  var st = settings(), ed = full(), dis = ed ? '' : ' disabled';
  var h = '<div class="row">' + ['commercial', 'residential'].map(function(m){ return '<button class="chip' + (S.mkt === m ? ' on' : '') + '" data-mkt="' + m + '">' + (m === 'commercial' ? '🏢 Commercial' : '🏠 Residential') + '</button>'; }).join('') + (ed ? '<button class="btn b" data-a="editplans">Edit plans</button>' : '') + '</div>';
  h += '<table><tr><th>Plan</th><th>How often</th><th>Usual price / year</th></tr>' + arr(st.plans).filter(function(x){ return (x.market || 'residential') === S.mkt; }).map(function(x){ return '<tr data-pp="' + esc(x.id) + '"><td><b>' + esc(x.name) + '</b>' + (x.performer === 'sub' ? ' <span class="tag">🤝 ' + esc(x.sub || 'sub') + '</span>' : '') + (x.on === false ? ' <span class="tag">off</span>' : '') + (S.mkt === 'commercial' && x.freq !== 'once' ? ' <span class="tag" style="background:#fef3c7">⭐ Priority: snow + emergency</span>' : '') + '<div class="mut">' + esc(x.includes) + '</div></td><td>' + fq(x.freq) + '</td><td>' + (x.freq === 'once' ? (x.price ? esc(usd(x.price)) : 'free / per unit') : '$ <input type="number" min="0" data-price="' + esc(x.id) + '" value="' + esc(x.price) + '" style="width:100px"' + dis + '>' + (x.priceSet ? '' : ' <span class="tag" style="background:#fef3c7;color:#92400e" data-unset="1">set your price</span>')) + '</td></tr>'; }).join('') + '</table>' + (ed ? '<div class="row"><button class="btn g" data-a="saveprices">Save prices</button><span class="mut">A price shows "set your price" until you save it here.</span></div>' : '');
  h += '<div class="card" data-set="1"><b>Membership tiers</b>' + ['bronze', 'silver', 'gold'].map(function(t){ var x = (st.tiers || {})[t] || {}; return '<div class="row">🏅 <b style="width:60px">' + tierName(t) + '</b><label>Repair discount % <input type="number" data-tierd="' + t + '" value="' + esc(x.discount) + '" style="width:70px"' + dis + '></label><input data-tierv="' + t + '" value="' + esc(x.visits) + '" style="flex:1;min-width:200px"' + dis + '>' + (x.note ? '<span class="tag">' + esc(x.note) + '</span>' : '') + '</div>'; }).join('') +
    '<div class="mut">Gold drawing entries: ' + (arr(S.d.goldEntries).length ? arr(S.d.goldEntries).map(function(g){ return esc(g.name); }).join(', ') : 'none yet') + '</div>' +
    '<b>Add-ons</b>' + arr(st.addOns).map(function(a){ return '<div class="row">' + esc(a.name) + ' <label>$ <input type="number" data-addon="' + esc(a.id) + '" value="' + esc(a.price) + '" style="width:90px"' + dis + '></label><span class="mut">' + esc(a.note) + '</span></div>'; }).join('') +
    '<b>Kits for sale</b>' + arr(st.products).map(function(k, i){ return '<div class="row"><input data-kitn="' + i + '" value="' + esc(k.name) + '"' + dis + '><label>$ <input type="number" data-kitp="' + i + '" value="' + esc(k.price) + '" style="width:80px"' + dis + '></label><input data-kitc="' + i + '" value="' + esc(k.contents) + '" style="flex:1;min-width:220px"' + dis + '></div>'; }).join('') +
    '<b>Make-ready price list (per unit)</b>' + arr(st.unitPrices).map(function(k, i){ return '<div class="row"><input data-upn="' + i + '" value="' + esc(k.name) + '" style="min-width:260px"' + dis + '><label>$ <input type="number" data-upp="' + i + '" value="' + esc(k.price) + '" style="width:90px"' + dis + '></label></div>'; }).join('') +
    '<b>Outreach e-mail templates</b>' + Object.keys(st.templates || {}).map(function(k){ var x = st.templates[k]; return '<div style="margin:6px 0"><div class="mut">' + esc(x.name) + '</div><input data-tpls="' + k + '" value="' + esc(x.subject) + '" style="width:100%"' + dis + '><textarea data-tplb="' + k + '" rows="4" style="width:100%"' + dis + '>' + esc(x.body) + '</textarea></div>'; }).join('') +
    '<b>Letter templates</b>' + Object.keys(S.d.letters || {}).map(function(k){ var x = S.d.letters[k]; return '<div style="margin:6px 0"><div class="mut">' + esc(x.name) + '</div><textarea data-ltr="' + k + '" rows="4" style="width:100%"' + dis + '>' + esc(x.body) + '</textarea></div>'; }).join('') +
    (ed ? '<div class="row"><button class="btn g" data-a="saveset">Save tiers, add-ons, kits, prices and templates</button></div>' : '<div class="mut">Only an admin or the office changes these.</div>') + '</div>';
  return h;
}
/* ── 📄 pamphlets ── */
function secDocs(){
  var A = { multifamily: 'Multi-family / property managers', commercial: 'Commercial', residential: 'Residential', insurance: 'Residential — after a restoration' };
  return '<div class="card"><b>📄 Maintenance Agreement (DRAFT for lawyer review)</b> <button class="btn" data-a="ag-dl">⬇ Download the blank agreement</button><div class="mut">It also goes with every plan sign request and into the customer\'s portal.</div></div>' +
    '<div class="mut">One-page printable pamphlets (logo, address, phone, a QR code to sign up). No prices — they are set per property. Never an insurance company\'s name.</div>' + Object.keys(A).map(function(k){
    return '<div class="card" data-aud="' + k + '"><div class="row" style="justify-content:space-between"><b>📄 ' + esc(A[k]) + '</b><span><button class="btn" data-a="pm-dl">⬇ Download</button><button class="btn" data-a="pm-print">🖨 Print</button><input type="email" data-to="1" placeholder="E-mail to" style="width:200px"><button class="btn b" data-a="pm-mail">✉ E-mail draft → ✅ Approvals</button></span></div><div class="row"><span class="mut">Photos (' + arr((settings().pamphletPhotos || {})[k]).length + ' of 3):</span>' + (full() ? '<label class="btn">🖼 Pick photos <input type="file" accept="image/jpeg" multiple data-photos="' + k + '" style="display:none"></label>' : '') + '</div></div>'; }).join('');
}
/* ── 🏚 make-ready (tenant turnover / build-outs) ── */
function secMready(){
  var ps = projects().sort(function(a, b){ return s(a.name).localeCompare(s(b.name)); }).slice(0, 800);
  return '<div class="card"><div class="mut">Order a make-ready: it becomes a job with its scope (per-unit prices from 📦 Plans & prices).</div><div class="row"><select data-mr="pid"><option value="">— property (job) —</option>' + ps.map(function(p){ return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join('') + '</select><input data-mr="unit" placeholder="Unit #"><input type="date" data-mr="date"></div>' +
    arr(settings().unitPrices).map(function(u){ return '<div class="row"><input type="number" min="0" data-mrq="' + esc(u.id) + '" value="0" style="width:60px"> ' + esc(u.name) + ' — ' + esc(usd(u.price)) + '</div>'; }).join('') +
    '<div class="row"><button class="btn g" data-a="mr-order">Order make-ready (creates the job)</button></div></div>';
}

/* ── small modal ── */
function modal(title, inner, onOk, okText){
  var ov = D.createElement('div'); ov.className = 'gcmt-ov'; ov.setAttribute('data-gc-keep', '1');
  ov.innerHTML = '<div class="in" role="dialog" aria-label="' + esc(title) + '"><button class="btn" data-x="1" style="float:right">Close</button><h2>' + esc(title) + '</h2>' + inner + '<div class="row"><button class="btn g" data-ok="1">' + esc(okText || 'Save') + '</button></div></div>';
  D.body.appendChild(ov);
  ov.addEventListener('click', function(e){ var t = e.target; if (t === ov || (t.closest && t.closest('[data-x]'))) { ov.remove(); return; }
    var ok = t.closest && t.closest('[data-ok]'); if (ok && !ok.disabled) { ok.disabled = true; Promise.resolve(onOk(ov)).then(function(done){ if (done === false) ok.disabled = false; else ov.remove(); }, function(){ ok.disabled = false; }); } });
  return ov;
}
function val(ov, sel){ var x = ov.querySelector(sel); return x ? (x.type === 'checkbox' ? x.checked : s(x.value)) : ''; }
function after(j, msg){ if (!j || !j.ok) { toast((j && j.error) || 'Could not save.', true); return false; } toast(msg); load(); return true; }
function store(file, pid){ return typeof W._gcStoreFile === 'function' && file ? W._gcStoreFile(file, { kind: 'doc', pid: pid, name: file.name }).then(function(m){ return m && m.ref ? { ref: m.ref, name: file.name, type: file.type || 'image/jpeg' } : null; }, function(){ return null; }) : Promise.resolve(null); }
function prospectForm(p){
  p = p || {}; var st = arr(S.d.stages);
  return '<div class="row">' + [['company', 'Company'], ['contact', 'Contact name'], ['role', 'Role (facility / property / maintenance manager)'], ['phone', 'Phone'], ['email', 'E-mail'], ['properties', 'Properties'], ['buildingType', 'Building type'], ['source', 'Source'], ['assigned', 'Assigned to (PM / office)'], ['nextStep', 'Next step']].map(function(f){ return '<input data-pf="' + f[0] + '" placeholder="' + esc(f[1]) + '" value="' + esc(p[f[0]] || '') + '" style="min-width:200px">'; }).join('') +
    '<label>Next date <input type="date" data-pf="nextAt" value="' + esc(p.nextAt || '') + '"></label><select data-pf="stage">' + st.map(function(x){ return '<option' + (x === (p.stage || 'Prospect') ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></div><textarea data-pf="notes" rows="3" style="width:100%" placeholder="Notes">' + esc(p.notes || '') + '</textarea>';
}
function readProspect(ov, id){ var o = { id: id || undefined }; Array.prototype.forEach.call(ov.querySelectorAll('[data-pf]'), function(x){ o[x.getAttribute('data-pf')] = s(x.value); }); return o; }
function fillTpl(t, pr){ var me = ''; try { me = s((W._gcMeNow || {}).name) || s(W.__GC_AUTH__.email()); } catch (e) {} var v = { first: s(pr.contact).split(/\s+/)[0] || 'there', property: s(pr.properties || pr.company) || 'your property', me: me, phone: '901-585-0944' }; return s(t).replace(/\{\{(\w+)\}\}/g, function(_, k){ return v[k] != null ? v[k] : ''; }); }
function newProject(o){
  var at = new Date().toISOString(), p = Object.assign({ id: 'MT' + Date.now().toString(36), status: 'Active', createdAt: at, updatedAt: at, savedAt: at, keepAsJob: true, source: 'Maintenance' }, o);
  try { W.__GC_MANUAL_SAVE__ = true; if (W._gcManualNow) W._gcManualNow('maintenance job'); } catch (e) {}
  try { if (typeof W._setProjects === 'function') W._setProjects(function(prev){ prev = arr(prev); return prev.some(function(x){ return x && x.id === p.id; }) ? prev : prev.concat([p]); }); } catch (e) {}
  try { if (W._crm && Array.isArray(W._crm.projects) && !W._crm.projects.some(function(x){ return x && x.id === p.id; })) W._crm.projects = W._crm.projects.concat([p]); } catch (e) {}
  (W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout).call(W, function(){ try { W.__GC_MANUAL_SAVE__ = false; } catch (e) {} }, 1500);
  return p;
}
function newLead(o){
  var at = new Date().toISOString(), l = Object.assign({ id: 'LMT_' + Date.now().toString(36), priority: 'Medium', status: 'new', created: at.slice(0, 10), createdAt: at, updatedAt: at, estValue: 0 }, o);
  try { W.__GC_MANUAL_SAVE__ = true; if (W._gcManualNow) W._gcManualNow('maintenance lead'); } catch (e) {}
  try { if (typeof W._setLeads === 'function') W._setLeads(function(prev){ prev = arr(prev); return prev.some(function(x){ return x && x.id === l.id; }) ? prev : prev.concat([l]); }); } catch (e) {}
  try { if (W._crm) W._crm.leads = arr(W._crm.leads).concat([l]); } catch (e) {}
  (W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout).call(W, function(){ try { W.__GC_MANUAL_SAVE__ = false; } catch (e) {} }, 1500);
  return l;
}
function openPortal(pid){
  var p = proj(pid); if (!p) { toast('That job is not on this computer yet.', true); return; }
  try { if (typeof W._gcFieldPortal === 'function') return W._gcFieldPortal(pid); } catch (e) {}
  if (s(p.portalUrl) && !p.portalOff) { W.open(s(p.portalUrl) + (s(p.portalUrl).indexOf('#') >= 0 ? '&p=1' : '#p=1'), '_blank', 'noopener'); return; }
  try { if (typeof W._openJobDetail === 'function') W._openJobDetail(pid); } catch (e) {}
  toast('This job has no portal link yet — it is made when the first portal e-mail is approved (or turn it on in the job\'s Portal tab).');
}
function b64Blob(b64){ var bin = atob(b64), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: 'application/pdf' }); }

/* ── clicks ── */
function onClick(e){
  var t = e.target; if (!t || !t.closest) return;
  var sec = t.closest('[data-sec]'); if (sec) { S.sec = sec.getAttribute('data-sec'); paint(); return; }
  var st = t.closest('[data-stage]'); if (st) { S.stage = st.getAttribute('data-stage'); paint(); return; }
  var mk = t.closest('[data-mkt]'); if (mk) { S.mkt = mk.getAttribute('data-mkt'); paint(); return; }
  var bm = t.closest('[data-bm]'); if (bm) { S.B.market = bm.getAttribute('data-bm'); paint(); return; }
  var b = t.closest('[data-a]'); if (!b || b.disabled || b.tagName === 'INPUT') return;
  var a = b.getAttribute('data-a'), card = b.closest('[data-cid],[data-pr],[data-pf],[data-aud]');
  var cid = card && card.getAttribute('data-cid'), c = cid ? arr(S.d.contracts).filter(function(x){ return x.id === cid; })[0] : null;
  var prid = card && card.getAttribute('data-pr'), pr = prid ? arr(S.d.prospects).filter(function(x){ return x.id === prid; })[0] : null;
  if (a === 'portal' && c) return openPortal(c.pid);
  if ((a === 'sched' || a === 'move') && c) { var dt = s((card.querySelector('[data-date]') || {}).value); if (!dt) return toast('Pick a date.', true);
    return fn({ action: 'visit-set', contractId: c.id, visitId: a === 'move' ? card.getAttribute('data-vid') : (visitsOf(c.id).filter(function(v){ return v.status === 'planned'; })[0] || {}).id, date: dt }).then(function(j){ after(j, 'On the Maintenance Schedule: ' + day(dt)); }); }
  if (a === 'post' && c) return postVisit(c, card.getAttribute('data-vid'));
  if (a === 'emready' && c) return emReady(c);
  if (a === 'pcr' && c) return pcr(c);
  if (a === 'letter' && c) return letter(c);
  if (a === 'snow') { if (!W.confirm('❄️ Start a snow event? Every customer on the priority list gets a To-Do (in order) and a "We\'re on our way" portal post (on ✅ Approvals).')) return; return fn({ action: 'snow-event' }).then(function(j){ after(j, '❄️ Snow event: ' + (j && j.todos) + ' To-Dos, ' + (j && j.posts) + ' portal posts on ✅ Approvals'); }); }
  if (a === 'editplans') { try { W._gcX9.maint.plans(); } catch (x) { toast('Open ⚙ Admin → 🛠 Maintenance plans.', true); } return; }
  if (a === 'saveset') return saveSettings();
  if (a === 'saveprices') { var pr = {}; Array.prototype.forEach.call(S.el.querySelectorAll('[data-price]'), function(x){ pr[x.getAttribute('data-price')] = x.value; }); return fn({ action: 'plan-prices', prices: pr }).then(function(j){ after(j, 'Prices saved'); }); }
  if (a === 'cset' && c) return modal('💵 Seller, who does the work, costs — ' + c.planName, '<div class="row"><input data-q="soldBy" placeholder="Sold by (PM / office)" value="' + esc(c.soldBy || '') + '"><select data-q="performer"><option value="self"' + (c.performer !== 'sub' ? ' selected' : '') + '>👷 Self-performed (PM\'s crew)</option><option value="sub"' + (c.performer === 'sub' ? ' selected' : '') + '>🤝 Subbed</option></select><input data-q="sub" placeholder="Sub (from the Subs list)" list="gcmt-subs" value="' + esc(c.sub || '') + '"><datalist id="gcmt-subs">' + arr(W._crm && W._crm.subs).map(function(x){ return '<option value="' + esc(x.company || x.name) + '">'; }).join('') + '</datalist></div><div class="row"><label>Our costs / year $ <input type="number" data-q="cost" value="' + esc(c.cost || '') + '" style="width:100px"></label><label>Sub\'s estimate / year $ <input type="number" data-q="subCost" value="' + esc(c.subCost || '') + '" style="width:100px"></label></div>', function(ov){
    return fn({ action: 'contract-set', contractId: c.id, soldBy: val(ov, '[data-q="soldBy"]'), performer: val(ov, '[data-q="performer"]'), sub: val(ov, '[data-q="sub"]'), cost: val(ov, '[data-q="cost"]'), subCost: val(ov, '[data-q="subCost"]') }).then(function(j){ return after(j, 'Saved — PM commission ' + usd(j && j.commission && j.commission.pm)); }); });
  if (a === 'ag-dl') return fn({ action: 'agreement' }).then(function(j){ if (!j || !j.ok) return toast('Could not make it.', true); var l = D.createElement('a'); l.href = URL.createObjectURL(b64Blob(j.pdf)); l.download = j.name; D.body.appendChild(l); l.click(); l.remove(); });
  if (a === 'p-add' || (a === 'p-edit' && pr)) return modal(pr ? 'Edit prospect' : '＋ Add prospect', prospectForm(pr), function(ov){ return fn({ action: 'prospect-save', prospect: readProspect(ov, pr && pr.id), log: pr ? '' : 'Added' }).then(function(j){ return after(j, 'Prospect saved'); }); });
  if (a === 'p-import') return importPros();
  if (a === 'p-call' && pr) return modal('📞 Log a call — ' + (pr.company || pr.contact), '<textarea data-l="1" rows="3" style="width:100%" placeholder="What was said"></textarea><div class="row"><label>Next follow-up <input type="date" data-n="1"></label><input data-ns="1" placeholder="Next step"></div>', function(ov){
    return fn({ action: 'prospect-save', prospect: { id: pr.id, nextAt: val(ov, '[data-n]') || pr.nextAt || '', nextStep: val(ov, '[data-ns]') || pr.nextStep || '' }, log: '📞 ' + (val(ov, '[data-l]') || 'Call') }).then(function(j){ return after(j, 'Call logged' + (val(ov, '[data-n]') ? ' — follow-up on the To-Do' : '')); }); });
  if (/^o-/.test(a) && pr) { var k = ({ 'o-free': 'free', 'o-plan': 'plan', 'o-snow': 'snow' })[a], tp = (settings().templates || {})[k] || {};
    return modal(tp.name || 'E-mail', '<div class="mut">To: ' + esc(pr.email || '(no e-mail on file)') + ' · e-mail only · waits on ✅ Approvals</div><input data-s="1" style="width:100%" value="' + esc(fillTpl(tp.subject, pr)) + '"><textarea data-b="1" rows="12" style="width:100%">' + esc(fillTpl(tp.body, pr)) + '</textarea>', function(ov){
      return fn({ action: 'outreach', prospectId: pr.id, template: k, subject: val(ov, '[data-s]'), body: val(ov, '[data-b]') }).then(function(j){ return after(j, '✉ Draft on ✅ Approvals'); }); }, 'Send to ✅ Approvals'); }
  if (a === 'p-book' && pr) return modal('📅 Book a free roof inspection — ' + (pr.company || pr.contact), '<div class="row"><label>Date <input type="date" data-d="1"></label><input data-ad="1" placeholder="Property address" value="' + esc(pr.address || pr.properties || '') + '" style="min-width:260px"></div>', function(ov){
    var d = val(ov, '[data-d]'); if (!d) { toast('Pick a date.', true); return false; }
    var l = newLead({ company: pr.company || pr.contact, name: pr.company || pr.contact, contact: pr.contact, phone: pr.phone, email: pr.email, address: val(ov, '[data-ad]'), projectType: 'Commercial inspection', type: 'Commercial', leadKind: 'commercial inspection', source: 'Maintenance outreach', apptDate: d, pm: pr.assigned || '', note: 'Free roof inspection (🛠 Maintenance → Prospects) on ' + d + '.' });
    return fn({ action: 'prospect-save', prospect: { id: pr.id, stage: 'Free inspection booked', leadId: l.id, nextAt: d, nextStep: 'Free roof inspection' }, log: '📅 Free roof inspection booked ' + d + ' (lead ' + l.id + ')' }).then(function(j){ return after(j, 'Booked — the lead is in Leads'); }); }, 'Book it');
  if (a === 'p-start' && pr) { var p = pr.pid && proj(pr.pid);
    if (!p) { p = newProject({ name: 'Maintenance — ' + (pr.properties || pr.address || pr.company), type: pr.market === 'residential' ? 'Residential' : 'Commercial', client: pr.company || pr.contact, clientEmail: pr.email, clientPhone: pr.phone, address: pr.address || pr.properties || '', pm: pr.assigned || '' });
      fn({ action: 'prospect-save', prospect: { id: pr.id, pid: p.id, stage: pr.stage === 'Won' ? 'Won' : 'Proposal sent' }, log: '▶ Maintenance job made: ' + p.name }); }
    S.B = { step: 2, pid: String(p.id), market: pr.market === 'residential' ? 'residential' : 'commercial', picks: {}, tier: 'bronze', portfolioId: '', kits: {}, np: {} }; S.sec = 'build'; paint(); return; }
  if (a === 'b-back') { readBuild(); S.B.step = Math.max(1, S.B.step - 1); paint(); return; }
  if (a === 'b-next') { readBuild();
    if (S.B.step === 1 && !S.B.areaChecked) { var adr = S.B.pid ? s((proj(S.B.pid) || {}).address) : S.B.np.property; S.B.areaChecked = true;
      return fn({ action: 'area', address: adr }).then(function(j){ S.B.area = j; if (j && j.known && !j.inArea && !W.confirm('⚠ ' + (adr || 'This property') + ' looks OUTSIDE the service area (Shelby County, TN and the counties touching it). Go on anyway?')) { S.B.areaChecked = false; return; } b.click(); }); }
    if (S.B.step === 2 && S.B.area && !S.B.area.snowOk && bPicks().some(function(x){ return /snow/i.test(x.name); }) && !W.confirm('⚠ Snow & ice service covers only Bartlett and Shelby County. Keep it on this property?')) return;
    if (S.B.step === 1) { if (!S.B.pid) { if (!S.B.np.property || !S.B.np.client) return toast('Pick a job, or type the property and the customer.', true);
      var np = newProject({ name: 'Maintenance — ' + S.B.np.property, type: S.B.market === 'commercial' ? 'Commercial' : 'Residential', client: S.B.np.client, clientEmail: S.B.np.email, clientPhone: S.B.np.phone, address: S.B.np.property }); S.B.pid = String(np.id); } }
    if (S.B.step === 2 && !bPicks().length) return toast('Tick at least one service.', true);
    S.B.step = Math.min(4, S.B.step + 1); paint(); return; }
  if (a === 'b-send') { var picks = bPicks(); if (picks.some(function(x){ return !(x.price > 0); })) return toast('Every service needs a price.', true); b.disabled = true;
    return fn({ action: 'quote-many', pid: S.B.pid, tier: S.B.tier, portfolioId: S.B.portfolioId || undefined, items: picks.map(function(x){ return { planId: x.planId, price: x.price, freq: x.freq, addOns: x.addOns }; }),
      products: Object.keys(S.B.kits).filter(function(k){ return num(S.B.kits[k]) > 0; }).map(function(k){ return { id: k, qty: num(S.B.kits[k]) }; }) }).then(function(j){ b.disabled = false; if (after(j, 'Sent to sign — the e-mail is on ✅ Approvals; the plans are in the customer\'s portal')) { S.B = null; S.sec = 'active'; } }); }
  if (a === 'pf-add' || a === 'pf-edit') { var pf = a === 'pf-edit' ? arr(S.d.portfolios).filter(function(x){ return x.id === card.getAttribute('data-pf'); })[0] : null;
    var ps = projects().sort(function(x, y){ return s(x.name).localeCompare(s(y.name)); }).slice(0, 600);
    return modal(pf ? 'Edit portfolio' : '＋ New portfolio', '<div class="row"><input data-q="name" placeholder="Property manager / company" value="' + esc(pf && pf.name) + '"><input data-q="contact" placeholder="Contact" value="' + esc(pf && pf.contact) + '"><input data-q="email" placeholder="E-mail" value="' + esc(pf && pf.email) + '"><input data-q="phone" placeholder="Phone" value="' + esc(pf && pf.phone) + '"></div><label><input type="checkbox" data-q="combined"' + (pf && pf.combined ? ' checked' : '') + '> One combined invoice</label><div class="mut">Properties (jobs):</div><select data-q="pids" multiple size="10" style="width:100%">' + ps.map(function(p){ return '<option value="' + esc(p.id) + '"' + (pf && arr(pf.pids).indexOf(String(p.id)) >= 0 ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select>', function(ov){
      var sel = ov.querySelector('[data-q="pids"]'), pids = Array.prototype.filter.call(sel.options, function(o){ return o.selected; }).map(function(o){ return o.value; });
      return fn({ action: 'portfolio-save', portfolio: { id: pf && pf.id, name: val(ov, '[data-q="name"]'), contact: val(ov, '[data-q="contact"]'), email: val(ov, '[data-q="email"]'), phone: val(ov, '[data-q="phone"]'), combined: val(ov, '[data-q="combined"]') === true, pids: pids } }).then(function(j){ return after(j, 'Portfolio saved'); }); }); }
  if (a === 'pf-build') { var pfx = card.getAttribute('data-pf'); S.B = { step: 2, pid: b.getAttribute('data-pid'), market: 'commercial', picks: {}, tier: 'bronze', portfolioId: pfx, kits: {}, np: {} }; S.sec = 'build'; paint(); return; }
  if (/^pm-/.test(a)) { var aud = card.getAttribute('data-aud');
    if (a === 'pm-mail') { var to = s((card.querySelector('[data-to]') || {}).value); return fn({ action: 'pamphlet-mail', audience: aud, to: to }).then(function(j){ after(j, '✉ Pamphlet e-mail on ✅ Approvals'); }); }
    return fn({ action: 'pamphlet', audience: aud }).then(function(j){ if (!j || !j.ok) return toast((j && j.error) || 'Could not make it.', true); var u = URL.createObjectURL(b64Blob(j.pdf));
      if (a === 'pm-print') { var w = W.open(u, '_blank'); if (w) try { w.addEventListener('load', function(){ try { w.print(); } catch (x) {} }); } catch (x) {} return; }
      var l = D.createElement('a'); l.href = u; l.download = j.name || 'GrayCo Maintenance.pdf'; D.body.appendChild(l); l.click(); l.remove(); }); }
  if (a === 'mr-order') return orderMakeReady(b.closest('.card'));
}
function onChange(e){
  var t = e.target; if (!t || !t.getAttribute) return;
  if (t.hasAttribute('data-f')) { S.f[t.getAttribute('data-f')] = t.value; paint(); return; }
  if (t.hasAttribute('data-tier')) { var cid = t.closest('[data-cid]').getAttribute('data-cid'), c = arr(S.d.contracts).filter(function(x){ return x.id === cid; })[0]; fn({ action: 'tier', pid: c.pid, tier: t.value }).then(function(j){ after(j, 'Tier: ' + tierName(t.value)); }); return; }
  if (t.hasAttribute('data-pstage')) { var id = t.closest('[data-pr]').getAttribute('data-pr'); fn({ action: 'prospect-save', prospect: { id: id, stage: t.value }, log: 'Stage → ' + t.value }).then(function(j){ after(j, 'Stage: ' + t.value); }); return; }
  if (t.getAttribute('data-a') === 'cfirst') { fn({ action: 'settings-set', set: { commercialFirst: !!t.checked } }).then(function(j){ after(j, t.checked ? 'Commercial customers first' : 'In sign-up order'); }); return; }
  if (t.hasAttribute('data-tier-b')) { S.B.tier = t.getAttribute('data-tier-b'); paint(); }
  if (t.getAttribute('data-b') === 'pid' && S.B) S.B.areaChecked = false;
  if (t.hasAttribute('data-photos')) { var aud = t.getAttribute('data-photos'), files = Array.prototype.slice.call(t.files || [], 0, 3);
    Promise.all(files.map(function(f){ return store(f, ''); })).then(function(refs){ var pp = Object.assign({}, settings().pamphletPhotos || {}); pp[aud] = refs.filter(Boolean).map(function(r){ return r.ref; }).slice(0, 3);
      return fn({ action: 'settings-set', set: { pamphletPhotos: pp } }).then(function(j){ after(j, pp[aud].length + ' photo(s) on the ' + aud + ' pamphlet'); }); }); }
}
function readBuild(){
  var B = S.B, el = S.el; if (!B || !el) return;
  var pid = el.querySelector('[data-b="pid"]'); if (pid) B.pid = s(pid.value);
  var pf = el.querySelector('[data-b="portfolioId"]'); if (pf) B.portfolioId = s(pf.value);
  Array.prototype.forEach.call(el.querySelectorAll('[data-np]'), function(x){ B.np[x.getAttribute('data-np')] = s(x.value); });
  Array.prototype.forEach.call(el.querySelectorAll('tr[data-plan]'), function(r){ var id = r.getAttribute('data-plan'), k = B.picks[id] = B.picks[id] || {};
    k.on = r.querySelector('[data-pk="on"]').checked; k.freq = r.querySelector('[data-pk="freq"]').value; k.price = num(r.querySelector('[data-pk="price"]').value); k.ao = {};
    Array.prototype.forEach.call(r.querySelectorAll('[data-ao]'), function(x){ k.ao[x.getAttribute('data-ao')] = x.checked; }); });
  Array.prototype.forEach.call(el.querySelectorAll('[data-kit]'), function(x){ B.kits[x.getAttribute('data-kit')] = num(x.value); });
}
function saveSettings(){
  var el = S.el, st = settings(), q = function(sel){ return el.querySelector(sel); };
  var tiers = {}; ['bronze', 'silver', 'gold'].forEach(function(t){ tiers[t] = { discount: num(q('[data-tierd="' + t + '"]').value), visits: s(q('[data-tierv="' + t + '"]').value) }; });
  var addOns = arr(st.addOns).map(function(a){ return { id: a.id, name: a.name, price: num(q('[data-addon="' + a.id + '"]').value) }; });
  var products = arr(st.products).map(function(k, i){ return { id: k.id, name: s(q('[data-kitn="' + i + '"]').value), price: num(q('[data-kitp="' + i + '"]').value), contents: s(q('[data-kitc="' + i + '"]').value) }; });
  var unitPrices = arr(st.unitPrices).map(function(k, i){ return { id: k.id, name: s(q('[data-upn="' + i + '"]').value), price: num(q('[data-upp="' + i + '"]').value) }; });
  var templates = {}; Object.keys(st.templates || {}).forEach(function(k){ templates[k] = { subject: s(q('[data-tpls="' + k + '"]').value), body: s(q('[data-tplb="' + k + '"]').value) }; });
  var letters = {}; Object.keys(S.d.letters || {}).forEach(function(k){ letters[k] = { body: s(q('[data-ltr="' + k + '"]').value) }; });
  return fn({ action: 'settings-set', set: { tiers: tiers, addOns: addOns, products: products, unitPrices: unitPrices, templates: templates, letters: letters } }).then(function(j){ after(j, 'Saved'); });
}
function importPros(){
  var have = {}; arr(S.d.prospects).forEach(function(p){ if (p.email) have[low(p.email)] = 1; if (p.phone) have[s(p.phone).replace(/\D/g, '').slice(-10)] = 1; });
  var out = [], seen = {};
  function add(o, src){ var k = low(o.email) || s(o.phone).replace(/\D/g, '').slice(-10) || low(o.company); if (!k || seen[k] || have[k] || have[low(o.email)]) return; seen[k] = 1; out.push(Object.assign({ source: src, stage: 'Prospect', market: 'commercial' }, o)); }
  projects().forEach(function(p){ var t = s(p.type) + ' ' + s(p.jobType); if (/commercial|church|school|property|apartment|multi/i.test(t)) add({ company: s(p.client || p.name), contact: s(p.clientContact || p.client), phone: s(p.clientPhone || p.phone), email: s(p.clientEmail), properties: s(p.address), buildingType: /church/i.test(t) ? 'Church' : /school/i.test(t) ? 'School' : 'Commercial', pid: String(p.id) }, 'Commercial customer');
    if (s(p.gcEmail || p.gcContactEmail)) add({ company: s(p.gcName || p.gc), contact: s(p.gcContact), phone: s(p.gcPhone), email: s(p.gcEmail || p.gcContactEmail), buildingType: 'GC / owner' }, 'GC / owner contact'); });
  arr(W._crm && W._crm.customers).forEach(function(c){ if (/property|manag|apartment|realty|hoa|commercial/i.test(s(c.company) + ' ' + s(c.type) + ' ' + s(c.notes))) add({ company: s(c.company || c.name), contact: s(c.name), phone: s(c.phone), email: s(c.email), buildingType: 'Property management' }, 'Customers'); });
  try { var mk = W._gcMkt && W._gcMkt.state && W._gcMkt.state(); arr(mk && (mk.partners || (mk.doc && mk.doc.partners))).forEach(function(x){ if (/property|manag|realt|apartment/i.test(s(x.type) + ' ' + s(x.kind) + ' ' + s(x.company))) add({ company: s(x.company || x.name), contact: s(x.name || x.contact), phone: s(x.phone), email: s(x.email), buildingType: 'Property manager' }, 'Marketing partners'); }); } catch (e) {}
  arr(W._crm && W._crm.leads).forEach(function(l){ if (/commercial|property|apartment|church|school/i.test(s(l.projectType) + ' ' + s(l.type))) add({ company: s(l.company || l.name), contact: s(l.contact), phone: s(l.phone), email: s(l.email), properties: s(l.address), buildingType: 'Commercial' }, 'Leads'); });
  if (!out.length) return toast('Nothing new to import (everyone found is already a prospect).');
  modal('⇪ Import ' + out.length + ' prospects', '<div class="mut">Commercial customers, property-manager partners, GC / owner contacts and commercial leads not on the list yet:</div><div style="max-height:320px;overflow:auto">' + out.map(function(o, i){ return '<label style="display:block"><input type="checkbox" data-imp="' + i + '" checked> ' + esc(o.company) + (o.contact ? ' · ' + esc(o.contact) : '') + ' <span class="mut">(' + esc(o.source) + ')</span></label>'; }).join('') + '</div>', function(ov){
    var pick = Array.prototype.filter.call(ov.querySelectorAll('[data-imp]'), function(x){ return x.checked; }).map(function(x){ return out[+x.getAttribute('data-imp')]; });
    return pick.reduce(function(pr, o){ return pr.then(function(){ return fn({ action: 'prospect-save', prospect: o, log: 'Imported (' + o.source + ')' }); }); }, Promise.resolve()).then(function(){ toast(pick.length + ' prospects imported'); load(); });
  }, 'Import');
}
function postVisit(c, vid){
  var V = visitsOf(c.id).filter(function(v){ return v.status === 'planned'; });
  var ov = modal('📝 Post visit update — ' + c.planName, '<div class="row"><label>Visit <select data-v="1">' + V.map(function(v){ return '<option value="' + esc(v.id) + '"' + (v.id === vid ? ' selected' : '') + '>' + esc(day(v.date)) + '</option>'; }).join('') + '<option value="">another day (today)</option></select></label><label><input type="checkbox" data-done="1" checked> Mark it done (plans the next one)</label></div>' +
    '<textarea data-t="1" rows="5" style="width:100%" placeholder="What we did, what we found (the customer sees this in their portal once approved)"></textarea><div class="row"><label>Photos <input type="file" data-ph="1" accept="image/*" multiple></label></div>' +
    '<div data-reps="1"></div><button class="btn" data-addrep="1" type="button">＋ Add repair found</button><div class="mut">Repairs become a quote to the customer (their ' + tierName(c.tier) + ' discount applied) on ✅ Approvals.</div>', function(ov){
    var files = Array.prototype.slice.call((ov.querySelector('[data-ph]') || {}).files || []), reps = Array.prototype.map.call(ov.querySelectorAll('[data-rep]'), function(r){ return { desc: s(r.querySelector('[data-rd]').value), price: num(r.querySelector('[data-rp]').value), file: (r.querySelector('[data-rf]').files || [])[0] }; }).filter(function(x){ return x.desc && x.price > 0; });
    return Promise.all(files.slice(0, 12).map(function(f){ return store(f, c.pid); })).then(function(ph){ return Promise.all(reps.map(function(r){ return store(r.file, c.pid); })).then(function(rp){
      return fn({ action: 'visit-post', contractId: c.id, visitId: val(ov, '[data-v]') || undefined, done: val(ov, '[data-done]') === true, text: val(ov, '[data-t]'), photos: ph.filter(Boolean), repairs: reps.map(function(r, i){ return { desc: r.desc, price: r.price, photo: rp[i] || undefined }; }) })
        .then(function(j){ return after(j, 'Visit update on ✅ Approvals' + (j && j.repairId ? ' + the repair quote' : '')); }); }); });
  }, 'Post (→ ✅ Approvals)');
  ov.addEventListener('click', function(e){ if (e.target && e.target.closest && e.target.closest('[data-addrep]')) { var d = D.createElement('div'); d.className = 'row'; d.setAttribute('data-rep', '1'); d.innerHTML = '<input data-rd="1" placeholder="Repair found" style="flex:1;min-width:200px"><input type="number" data-rp="1" placeholder="Price" style="width:100px"><input type="file" data-rf="1" accept="image/*">'; ov.querySelector('[data-reps]').appendChild(d); } });
}
function emReady(c){
  var cur = ((S.d.props || {})[c.pid] || {}).emready || {}, sh = arr(cur.shutoffs).length ? cur.shutoffs : [{ what: 'Water' }, { what: 'Gas' }, { what: 'Power' }], ct = arr(cur.contacts).length ? cur.contacts : [{}, {}];
  modal('🚨 Emergency Ready — ' + (s((proj(c.pid) || {}).name)), '<textarea data-bi="1" rows="3" style="width:100%" placeholder="Building info (size, roof type, access, alarm, keys)">' + esc(cur.building || '') + '</textarea><b>Shutoffs</b>' +
    sh.map(function(x, i){ return '<div class="row" data-sh="' + i + '"><input data-w="1" value="' + esc(x.what) + '" style="width:90px"><input data-l="1" placeholder="Where (photo it)" value="' + esc(x.location || '') + '" style="flex:1;min-width:200px"><input type="file" data-f="1" accept="image/*">' + (x.photo ? '<span class="mut">photo ✓</span>' : '') + '</div>'; }).join('') + '<b>Emergency contacts</b>' +
    ct.map(function(x, i){ return '<div class="row" data-ct="' + i + '"><input data-n="1" placeholder="Name" value="' + esc(x.name || '') + '"><input data-r="1" placeholder="Role" value="' + esc(x.role || '') + '"><input data-p="1" placeholder="Phone" value="' + esc(x.phone || '') + '"><input data-e="1" placeholder="E-mail" value="' + esc(x.email || '') + '"></div>'; }).join(''), function(ov){
    var rows = Array.prototype.map.call(ov.querySelectorAll('[data-sh]'), function(r, i){ return { what: s(r.querySelector('[data-w]').value), location: s(r.querySelector('[data-l]').value), file: (r.querySelector('[data-f]').files || [])[0], old: sh[i] && sh[i].photo }; });
    return Promise.all(rows.map(function(r){ return r.file ? store(r.file, c.pid) : Promise.resolve(r.old || null); })).then(function(ph){
      return fn({ action: 'emready', pid: c.pid, info: { building: val(ov, '[data-bi]'), shutoffs: rows.map(function(r, i){ return { what: r.what, location: r.location, photo: ph[i] || undefined }; }).filter(function(x){ return x.what && x.location; }),
        contacts: Array.prototype.map.call(ov.querySelectorAll('[data-ct]'), function(r){ return { name: s(r.querySelector('[data-n]').value), role: s(r.querySelector('[data-r]').value), phone: s(r.querySelector('[data-p]').value), email: s(r.querySelector('[data-e]').value) }; }).filter(function(x){ return x.name || x.phone; }) } }).then(function(j){ return after(j, 'Emergency Ready file saved (it is in the customer\'s portal)'); }); });
  });
}
function pcr(c){
  var sys = ['Roof', 'Coating', 'HVAC', 'Envelope', 'Paving'];
  modal('📋 Property Condition Report — ' + s((proj(c.pid) || {}).name), '<table><tr><th>System</th><th>Condition</th><th>Age</th><th>Remaining life</th><th>Budget ' + new Date().getFullYear() + '…+4</th></tr>' + sys.map(function(n){ return '<tr data-sys="1"><td><input data-n="1" value="' + n + '" style="width:90px"></td><td><select data-c="1"><option>Good</option><option>Fair</option><option>Poor</option><option>Not present</option></select></td><td><input data-a="1" style="width:60px"></td><td><input data-l="1" style="width:80px"></td><td>' + [1, 2, 3, 4, 5].map(function(k){ return '<input type="number" data-y="' + k + '" style="width:64px">'; }).join('') + '</td></tr>'; }).join('') + '</table>', function(ov){
    var systems = Array.prototype.map.call(ov.querySelectorAll('[data-sys]'), function(r){ return { name: s(r.querySelector('[data-n]').value), condition: s(r.querySelector('[data-c]').value), age: s(r.querySelector('[data-a]').value), life: s(r.querySelector('[data-l]').value), budget: [1, 2, 3, 4, 5].map(function(k){ return num(r.querySelector('[data-y="' + k + '"]').value); }) }; }).filter(function(x){ return x.condition !== 'Not present'; });
    return fn({ action: 'pcr', pid: c.pid, systems: systems }).then(function(j){ return after(j, '📋 Report made — the portal post is on ✅ Approvals'); });
  }, 'Make the PDF → ✅ Approvals');
}
function letter(c){
  var L = S.d.letters || {}, last = arr(c.visits).slice(-1)[0];
  modal('📄 Letter — ' + s((proj(c.pid) || {}).name), '<div class="row"><select data-k="1">' + Object.keys(L).map(function(k){ return '<option value="' + k + '">' + esc(L[k].name) + '</option>'; }).join('') + '</select><label>Inspected on <input type="date" data-i="1" value="' + esc(last ? s(last.at).slice(0, 10) : '') + '"></label><label>Years <input type="number" data-y="1" value="5" style="width:60px"></label></div><textarea data-f="1" rows="3" style="width:100%" placeholder="Findings">' + esc(last ? last.note : '') + '</textarea>', function(ov){
    return fn({ action: 'letter', pid: c.pid, kind: val(ov, '[data-k]'), fields: { inspectedOn: val(ov, '[data-i]'), years: val(ov, '[data-y]'), findings: val(ov, '[data-f]') } }).then(function(j){ return after(j, '📄 Letter made — the portal post is on ✅ Approvals'); });
  }, 'Make the PDF → ✅ Approvals');
}
function orderMakeReady(card){
  var pid = s(card.querySelector('[data-mr="pid"]').value), unit = s(card.querySelector('[data-mr="unit"]').value), when = s(card.querySelector('[data-mr="date"]').value), p = proj(pid);
  if (!p) return toast('Pick the property.', true);
  var lines = arr(settings().unitPrices).map(function(u){ var q = num((card.querySelector('[data-mrq="' + u.id + '"]') || {}).value); return q > 0 ? { desc: u.name, qty: q, price: u.price, total: Math.round(u.price * q * 100) / 100 } : null; }).filter(Boolean);
  if (!lines.length) return toast('Pick what the unit needs.', true);
  var total = lines.reduce(function(t, x){ return t + x.total; }, 0);
  var j = newProject({ name: 'Make-ready — ' + (s(p.address) || s(p.name)) + (unit ? ' unit ' + unit : ''), type: 'Commercial', client: p.client, clientEmail: p.clientEmail, clientPhone: p.clientPhone, address: p.address, pm: p.pm, startDate: when || '', contractAmount: total, value: total,
    scope: lines.map(function(x){ return x.qty + ' × ' + x.desc + ' @ ' + usd(x.price) + ' = ' + usd(x.total); }).join('\n'), notes: 'Tenant turnover / make-ready ordered from 🛠 Maintenance (' + (unit ? 'unit ' + unit + ', ' : '') + 'parent job ' + p.name + ').', parentJob: String(p.id) });
  toast('Make-ready job made: ' + j.name + ' (' + usd(total) + ')');
}

W._gcMaintTab = {
  mount: function(el){ if (!el) return; if (S.el === el && el.firstChild) return; S.el = el; el.addEventListener('click', onClick); el.addEventListener('change', onChange); paint(); load(); },
  go: function(sec){ S.sec = sec; paint(); }, state: function(){ return S; }, reload: load
};
})();
