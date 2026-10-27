/* ═════════════════════════════════════════════════════════════════════════════════════════════════════
   GrayCo — THE COMPANY ADDRESS ON EVERYTHING (patch ADDRALL)  __GC_PATCH_ADDRALL__
   Owner: "if I ever switch the address for any reason in the CRM, make sure it always updates my address on
   everything — brochures etc, everything in the CRM, all contracts etc."
   ONE setting (gc_kv "gc_company_address" { current, next, switchOn, history }) — window._gcCompanyAddress(when?).
   1. Saving a NEW address in ⚙ Admin → 🏢 Company address first shows what changes by itself (contracts, invoices,
      the portal, e-mails, texts, the print pack…), what keeps the old address (papers already signed or sent) and what
      the CRM cannot change; then adds one To-Do per outside update for Wesley + Nick (website, Google Business Profile,
      printed stock, bank / payroll / QuickBooks / suppliers, insurance + COIs, the three license boards, Secretary of
      State / IRS 8822-B / revenue / business license, vehicles, bonding, bid platforms, listings).
      The address it replaces goes into the setting's history: a paper dated before today keeps it.
   2. 🖨 Print pack: print/manifest.json says which address the PDFs were built with. When today's company address is
      different the pack's Print / Copy link / E-mail / Text use the HTML print versions (print/<slug>.html — same
      pages, the new address), the page says "PDFs being rebuilt with the new address", and the admins get the To-Do
      "Rebuild print PDFs (address changed)" (tools/printpack/rebuild.sh). When they match again it goes back to the
      PDFs and the To-Do closes itself.
   Console: _gcADDRALL.state(), _gcADDRALL.outside(addr), _gcPPAddr.check()
   ═════════════════════════════════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
if (window.__GC_PATCH_ADDRALL__) return; window.__GC_PATCH_ADDRALL__ = true;
var W = window, D = document, A = W._gcCompanyAddress;
if (!A) { try { console.warn('[GC ADDRALL] the company-address helper is missing'); } catch (e) {} return; }
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x != null; }) : []; }
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function nowIso(){ return new Date().toISOString(); }
function warn(e){ try { console.warn('[GC ADDRALL]', e && e.message || e); } catch (x) {} }
function hash(t){ var h = 5381; t = low(t); for (var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0; return h.toString(36); }
function X2(){ return W._gcADDR2 || null; }
function isAdmin(){ try { var x = X2(); if (x && x.isAdmin) return !!x.isAdmin(); } catch (e) {} try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function today(){ try { return A.centralDay(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } }
function addDays(ymd, n){ var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s(ymd)) || /^(\d{4})-(\d{2})-(\d{2})$/.exec(today()); var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n, 12)); return d.toISOString().slice(0, 10); }
function niceDay(y){ var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s(y)); if (!m) return s(y); return new Date(+m[1], +m[2] - 1, +m[3], 12).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); }

var OWNERS = ['wjohnson@grayco-cs.com', 'nthomas@grayco-cs.com'];

/* the address a setting shows on a day, and the one it is heading to */
function effective(c, ymd){ c = c || {}; if (!s(c.next) || !s(c.switchOn)) return s(c.current); return (ymd || today()) >= s(c.switchOn) ? s(c.next) : s(c.current); }
function heading(c){ c = c || {}; return s(c.next) && s(c.switchOn) ? s(c.next) : s(c.current); }
function isNew(prev, v){ return low(heading(v)) !== low(heading(prev)) || low(effective(v)) !== low(effective(prev)); }

/* ═══ 1. SAVING A NEW ADDRESS ═════════════════════════════════════════════════════════════════════ */
/* the earlier address is kept (until now) so a paper dated before the change keeps it */
function prepare(prev, v){
  var h = arr(prev.history).slice(), at = nowIso();
  var was = effective(prev), will = effective(v);
  if (was && low(was) !== low(will)) h.push({ address: was, until: at });
  /* a scheduled switch that already happened and is now folded into "current": keep the old one up to the switch day */
  if (s(prev.next) && s(prev.switchOn) && today() >= prev.switchOn && s(prev.current) && low(prev.current) !== low(was) &&
      !h.some(function(x){ return low(x.address) === low(prev.current); })) h.push({ address: prev.current, until: prev.switchOn + 'T06:00:00.000Z' });
  v.history = h.sort(function(a, b){ return Date.parse(a.until) - Date.parse(b.until); }).slice(-30);
  return v;
}

/* GCs / customers on active jobs who may hold a GrayCo certificate of insurance */
function coiHolders(){
  var seen = {}, out = [];
  arr((W._crm || {}).projects).forEach(function(p){
    if (!p || p.deleted === true || /^(completed?|closed|paid|cancel|lost)/i.test(s(p.status))) return;
    [p.gc, p.gcName, p.generalContractor, /commercial/i.test(s(p.type)) ? (p.client || p.customer) : ''].forEach(function(n){ n = s(n); if (n && !seen[low(n)]) { seen[low(n)] = 1; out.push(n); } });
  });
  return out.slice(0, 25);
}

/* what the CRM cannot change itself — one To-Do each for Wesley + Nick (with how / where) */
function outside(addr, when){
  var base = when && when > today() ? when : today(), coi = coiHolders();
  return [
    { k: 'web', label: 'Update the website footer / contact page', due: 0, items: ['grayco-cs.com: footer, Contact page, any "Visit us" text and the map pin', 'Search the site for the old street number so nothing is missed', 'The CRM pages (portal, terms, coupon, giveaway) change by themselves'] },
    { k: 'gbp', label: 'Update the Google Business Profile address', due: 0, items: ['business.google.com → Edit profile → Location → Business address', 'Google may ask to re-verify (postcard / video) — keep the profile live meanwhile', 'Check Apple Business Connect and Bing Places with the same address'] },
    { k: 'listings', label: 'Update Facebook / Instagram, Yelp, BBB, Angi, Nextdoor', due: 3, items: ['Facebook + Instagram: Page info → Address', 'Yelp for Business, BBB, Angi, HomeAdvisor, Nextdoor, Houzz', 'Exactly the same name, address and phone everywhere'] },
    { k: 'print', label: 'Order new printed stock', due: 0, items: ['Business cards, brochures, flyers, door hangers (the print pack has the new address — 🖨 Print pack)', 'Yard signs, truck lettering / magnets, shirts if they show the address', 'Envelopes, letterhead, stamps'] },
    { k: 'money', label: 'Tell the bank, payroll, QuickBooks, credit cards and suppliers', due: 7, items: ['Bank(s): business address on the accounts and on printed checks', 'Payroll provider and QuickBooks → Settings → Company → Address', 'Credit cards / fuel cards', 'Supplier accounts: ABC Supply, SRS, Beacon, Home Depot Pro, Lowe’s Pro, 84 Lumber, …'] },
    { k: 'ins', label: 'Insurance: new address on every policy, then re-issue COIs', due: 7, items: ['Agent + carriers: general liability, workers’ comp, commercial auto, umbrella / builder’s risk → endorse the new address', 'Re-issue certificates of insurance to every GC / customer that holds one' + (coi.length ? ': ' + coi.join(', ') : ''), 'Upload the new COI in 💎 → Company documents'] },
    { k: 'lic', label: 'File the change of address with the contractor license boards', due: 30, items: ['TN Board for Licensing Contractors — license #85034 BCB', 'Arkansas Contractors Licensing Board — #0486990627', 'Mississippi State Board of Contractors — #27769', 'Most boards want it within about 30 days'] },
    { k: 'gov', label: 'Secretary of State, IRS, tax accounts and business license', due: 30, items: ['TN Secretary of State: principal office / registered office (annual report or change form)', 'IRS Form 8822-B (change of address — business)', 'TN Dept of Revenue, and the MS / AR tax accounts', 'City / county business license'] },
    { k: 'veh', label: 'Vehicles: titles, registrations, trailers, DOT number', due: 30, items: ['County clerk: registrations and titles of every truck and trailer', 'USDOT / MCS-150 update if GrayCo has a DOT number', 'Fuel / toll accounts'] },
    { k: 'bond', label: 'Tell the bonding company / surety', due: 14, items: ['Surety agent: principal address on the bond line and any open bonds'] },
    { k: 'bids', label: 'Update bid platforms and vendor registrations', due: 14, items: ['SAM.gov entity registration (update the physical address)', 'BuildingConnected, PlanHub, the planrooms', 'State / city / county vendor registrations (Memphis, Shelby County, MLGW, TN Edison, ARBuy, MAGIC)'] }
  ].map(function(x){ x.due = addDays(base, x.due); return x; });
}
function upsertTodo(rec){
  var x = X2(); if (!x || !x.tasks || !x.saveTasks) return false;
  var l = x.tasks(), t = l.filter(function(q){ return q.id === rec.id; })[0], now = nowIso();
  if (t && (t.done || t.deleted)) return false;
  if (!t) { t = { id: rec.id, addedAt: now, done: false }; l.push(t); }
  t.label = rec.label; t.note = rec.note || ''; t.addedBy = rec.addedBy || 'Admin (company address)'; t.updatedAt = now; t.kind = 'admin_seed';
  t.assignees = rec.to.slice(); try { t.assignee = x.whoLabel ? x.whoLabel(rec.to) : rec.to.join(', '); } catch (e) { t.assignee = rec.to.join(', '); }
  t.personal = rec.to.length === 1; t.shared = rec.to.length > 1; t.prio = rec.prio || 'med';
  if (rec.due) t.due = rec.due;
  var had = {}; arr(t.items).forEach(function(i){ if (i && i.label) had[low(i.label)] = !!i.done; });
  t.items = arr(rec.items).map(function(lab, k){ return { id: rec.id + '_' + k, label: lab, done: !!had[low(lab)] }; });
  x.saveTasks(l);
  return true;
}
function addOutsideTodos(addr, when){
  var h = hash(addr), n = 0;
  outside(addr, when).forEach(function(o){
    if (upsertTodo({ id: 'adm_addr_' + o.k + '_' + h, label: o.label + ' — ' + addr, note: 'The company address changed to ' + addr + (when && when > today() ? ' (from ' + niceDay(when) + ')' : '') + '. The CRM, the portal, contracts, invoices and e-mails already use it.', items: o.items, to: OWNERS, due: o.due, prio: o.k === 'web' || o.k === 'gbp' ? 'high' : 'med' })) n++;
  });
  return n;
}
var CHANGES = [
  ['📝', 'New contracts, proposals, change orders, lien notices and waivers, riders, the document library'],
  ['💵', 'New invoices, statements and pay apps (the PDF and the e-mail); W-9 / COI request letters; pay stubs'],
  ['🏠', 'The customer portal and the sub portal footer; the legal pages (terms, privacy, E-SIGN, notice of cancellation)'],
  ['✉️', 'Every e-mail footer, the newsletter footer, text templates'],
  ['📣', 'Marketing pages, flyers and door hangers made in the CRM, coupon / giveaway pages'],
  ['🖨', 'The print pack: Print / links switch to the HTML print versions with the new address until the PDFs are rebuilt'],
  ['🌐', 'The website footer is NOT in the CRM — a To-Do is added']
];
function confirmBox(prev, v){
  return new Promise(function(res){
    var addr = heading(v), when = s(v.next) && s(v.switchOn) ? v.switchOn : '';
    if (!isNew(prev, v)) { res(true); return; }
    var todos = outside(addr, when);
    var ov = D.createElement('div'); ov.setAttribute('data-gc-addrall-confirm', '1');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,29,47,.55);z-index:2147483000;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:16px;box-sizing:border-box';
    ov.innerHTML = '<div style="background:#fff;color:#14202E;border-radius:14px;max-width:620px;width:100%;padding:18px;font:14px/1.45 Arial,sans-serif;box-sizing:border-box;margin-top:3vh">' +
      '<h3 style="margin:0 0 6px;font-size:18px">🏢 Change the company address?</h3>' +
      '<p style="margin:0 0 10px">From <b>' + esc(effective(prev) || '—') + '</b> to <b>' + esc(addr) + '</b>' + (when && when > today() ? ' on <b>' + esc(niceDay(when)) + '</b>' : ' <b>now</b>') + '.</p>' +
      '<div style="font-weight:700;margin:8px 0 4px">Changes by itself</div><ul style="margin:0 0 8px 18px;padding:0">' + CHANGES.map(function(c){ return '<li>' + c[0] + ' ' + esc(c[1]) + '</li>'; }).join('') + '</ul>' +
      '<div style="font-weight:700;margin:8px 0 4px">Keeps the old address</div><div style="margin:0 0 8px">Papers already signed or sent (contracts, invoices, waivers): they keep the address they were made with.</div>' +
      '<div style="font-weight:700;margin:8px 0 4px">To-Dos for Wesley and Nick (outside the CRM)</div><ul style="margin:0 0 10px 18px;padding:0">' + todos.map(function(t){ return '<li>' + esc(t.label) + ' <small style="color:#55626F">· due ' + esc(niceDay(t.due)) + '</small></li>'; }).join('') + '</ul>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button type="button" data-a="no" style="background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:10px 16px;cursor:pointer">Cancel</button>' +
      '<button type="button" data-a="yes" style="background:#1E2060;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-weight:700;cursor:pointer">Save and add the To-Dos</button></div></div>';
    var done = false;
    function end(ok){ if (done) return; done = true; try { ov.remove(); } catch (e) {} res(ok); }
    ov.addEventListener('click', function(e){ var b = e.target.closest && e.target.closest('[data-a]'); if (b) end(b.getAttribute('data-a') === 'yes'); else if (e.target === ov) end(false); });
    D.body.appendChild(ov);
  });
}
function afterSave(prev, v){
  if (!isNew(prev, v)) return 0;
  var n = addOutsideTodos(heading(v), s(v.next) && s(v.switchOn) ? v.switchOn : '');
  later(function(){ try { PP.check(); } catch (e) {} }, 50);
  return n;
}

/* ═══ 2. 🖨 PRINT PACK: the PDFs vs today's address ═══════════════════════════════════════════════ */
var PP = { manifest: null, loading: null, at: 0 };
function ppBaked(){ return s(PP.manifest && PP.manifest.address); }
PP.stale = function(){ var b = ppBaked(); return !!b && low(b) !== low(A()); };
PP.load = function(force){
  if (PP.loading) return PP.loading;
  if (PP.manifest && !force && Date.now() - PP.at < 10 * 60000) return Promise.resolve(PP.manifest);
  if (!W.fetch) return Promise.resolve(null);
  PP.loading = W.fetch('print/manifest.json', { cache: 'no-store' }).then(function(r){ return r.ok ? r.json() : null; }, function(){ return null; })
    .then(function(m){ PP.loading = null; if (m && typeof m === 'object') { PP.manifest = m; PP.at = Date.now(); } return PP.manifest; });
  return PP.loading;
};
PP.banner = function(){
  if (!PP.stale()) return '';
  return '<div class="gmt-card" data-gc-pp-stale="1" style="border-left:4px solid #B45309;background:#FFF7ED"><b>PDFs being rebuilt with the new address.</b> ' +
    'The print pack PDFs show <b>' + esc(ppBaked()) + '</b>; the company address is now <b>' + esc(A()) + '</b>. Until they are rebuilt, Print / Copy link / E-mail / Text use the ' +
    '<b>HTML print versions</b> — the same pages, page order and sizes, with the new address (print at 100% / Actual size). The ⬇ ZIP still has the old PDFs.</div>';
};
function ppTodoId(){ return 'adm_pp_rebuild_' + hash(A()); }
PP.check = function(){
  return PP.load().then(function(){
    var st = PP.stale();
    try { var x = W._gcMktExt; if (x && x.draw && D.querySelector('[data-pp]')) x.draw(); } catch (e) {}
    if (!isAdmin() || !X2() || !X2().tasks) return st;
    if (st) {
      upsertTodo({ id: ppTodoId(), label: 'Rebuild print PDFs (address changed)', note: 'The print pack PDFs show ' + ppBaked() + '; the company address is ' + A() + '. Run tools/printpack/rebuild.sh (one command: it prints every PDF again from its HTML print version with the address), commit print/ and deploy. Until then the Print pack uses the HTML print versions.',
        items: ['Run tools/printpack/rebuild.sh', 'Commit print/*.pdf, print/thumbs and print/manifest.json and deploy', 'Check the Print pack page shows the PDFs again'], to: OWNERS, due: today(), prio: 'high', addedBy: 'CRM (print pack)' });
    } else {
      /* the PDFs match again: close any open rebuild To-Do */
      var l = X2().tasks(), ch = false;
      l.forEach(function(t){ if (t && /^adm_pp_rebuild_/.test(s(t.id)) && !t.done && !t.deleted) { t.done = true; t.doneBy = 'CRM (the PDFs match the company address)'; t.doneAt = nowIso(); t.updatedAt = nowIso(); ch = true; } });
      if (ch) X2().saveTasks(l);
    }
    return st;
  });
};
W._gcPPAddr = PP;

/* start: read the manifest, check again when the address changes (save, switch day, another computer) */
W.addEventListener('gc:company-address', function(){ later(function(){ PP.check(); }, 30); });
var last = A();
RI.call(W, function(){ if (D.hidden) return; var a = A(); if (a !== last) { last = a; PP.check(); } }, 60000);
later(function(){ PP.check(); }, 4000);

W._gcADDRALL = { prepare: prepare, confirm: confirmBox, afterSave: afterSave, outside: outside, addOutsideTodos: addOutsideTodos, coiHolders: coiHolders, effective: effective, heading: heading, isNew: isNew,
  state: function(){ return { address: A(), config: A.config(), printPdfAddress: ppBaked(), printStale: PP.stale() }; } };
try { console.log('[GC] The company address on everything (patch ADDRALL) — _gcADDRALL, _gcPPAddr'); } catch (e) {}
})();
