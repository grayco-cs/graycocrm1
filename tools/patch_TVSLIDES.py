#!/usr/bin/env python3
"""patch TVSLIDES - the Office TV scoreboard becomes a multi-page slideshow.

Pages: Company (the existing scoreboard), PM scoreboard, Active jobs, Pipeline & leads, Money, Schedule this week.
Controls: auto-hiding bar (prev / next / dots / page picker / auto-advance select), arrows + space, swipe, privacy toggle,
settings in localStorage gc_tv_slides_v1.  Idempotent: a second run prints "already patched" and changes nothing.
Every find-string must occur exactly once or the script stops without writing.

usage: python3 tools/patch_TVSLIDES.py [path/to/index.html]
"""
import os, sys

P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html')
src = open(P, encoding='utf-8').read()
if 'patch TVSLIDES' in src:
    print('already patched'); sys.exit(0)

def once(s, old, new):
    n = s.count(old)
    assert n == 1, (n, old[:90])
    return s.replace(old, new)

CSS = r"""    '.gc-a8-tv .pg{flex:1;min-height:0;position:relative;display:flex;overflow:hidden}',
    '.gc-a8-tv .sl{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column}',
    '.gc-a8-tv .sl.inr{animation:gcTvSr .45s ease-out}.gc-a8-tv .sl.inl{animation:gcTvSl .45s ease-out}',
    '@keyframes gcTvSr{from{opacity:0;transform:translateX(6%)}to{opacity:1;transform:none}}',
    '@keyframes gcTvSl{from{opacity:0;transform:translateX(-6%)}to{opacity:1;transform:none}}',
    '.gc-a8-tv .sh{display:flex;align-items:center;gap:1.4em;margin:1em 0 .9em;min-height:3em}',
    '.gc-a8-tv .sh h2{margin:0;font-size:2.5em;font-weight:800;letter-spacing:.01em;display:flex;align-items:center;gap:.4em;white-space:nowrap}',
    '.gc-a8-tv .sh h2 span{font-size:.85em}',
    '.gc-a8-tv .sh .sm{flex:1;min-width:0;font-size:1.3em;font-weight:600;color:#9cc4f5;line-height:1.25}',
    '.gc-a8-tv .spg{display:flex;align-items:center;gap:.7em;font-size:1.4em;font-weight:700}',
    '.gc-a8-tv .spg button{font:inherit;font-weight:800;width:1.8em;height:1.8em;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.12);color:#fff;cursor:pointer}',
    '.gc-a8-tv .em{flex:1;display:flex;align-items:center;justify-content:center;font-size:2em;font-weight:700;color:#9cc4f5}',
    '.gc-a8-tv .dim{color:#8fb3de;font-size:1.25em;font-weight:600}',
    '.gc-a8-tv .pms{flex:1;min-height:0;display:grid;gap:1.1em;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:minmax(0,1fr);margin-bottom:1.1em}',
    '.gc-a8-tv .pms.n1{grid-template-columns:minmax(0,40em);justify-content:center}.gc-a8-tv .pms.n2{grid-template-columns:repeat(2,minmax(0,1fr))}.gc-a8-tv .pms.n4{grid-template-columns:repeat(2,minmax(0,1fr))}',
    '.gc-a8-tv .pms.n1,.gc-a8-tv .pms.n2,.gc-a8-tv .pms.n3{grid-auto-rows:minmax(0,40em);align-content:center}',
    '.gc-a8-tv .pms.n1 .big,.gc-a8-tv .pms.n2 .big,.gc-a8-tv .pms.n3 .big{font-size:4.4em}.gc-a8-tv .pms.n1 .m b,.gc-a8-tv .pms.n2 .m b,.gc-a8-tv .pms.n3 .m b{font-size:2.3em}.gc-a8-tv .pms.n1 .m span,.gc-a8-tv .pms.n2 .m span,.gc-a8-tv .pms.n3 .m span{font-size:1.1em}',
    '.gc-a8-tv .pm,.gc-a8-tv .c{position:relative;overflow:hidden;min-width:0;border-radius:1em;padding:1.1em 1.4em;background:linear-gradient(160deg,rgba(255,255,255,.13),rgba(255,255,255,.05));border:1px solid rgba(255,255,255,.16);box-shadow:0 .6em 1.8em rgba(0,12,36,.38)}',
    '.gc-a8-tv .pm{display:flex;flex-direction:column;justify-content:space-between;gap:.6em}',
    '.gc-a8-tv .pms.n4 .pm,.gc-a8-tv .pms.n5 .pm,.gc-a8-tv .pms.n6 .pm{padding:.8em 1.2em;gap:.3em}.gc-a8-tv .pms.n4 .big,.gc-a8-tv .pms.n5 .big,.gc-a8-tv .pms.n6 .big{font-size:2.7em}.gc-a8-tv .pms.n4 .nm,.gc-a8-tv .pms.n5 .nm,.gc-a8-tv .pms.n6 .nm{font-size:1.6em}',
    '.gc-a8-tv .pms.n4 .m b,.gc-a8-tv .pms.n5 .m b,.gc-a8-tv .pms.n6 .m b{font-size:1.45em}.gc-a8-tv .pms.n4 .m span,.gc-a8-tv .pms.n5 .m span,.gc-a8-tv .pms.n6 .m span{font-size:.85em}.gc-a8-tv .pms.n4 .mg,.gc-a8-tv .pms.n5 .mg,.gc-a8-tv .pms.n6 .mg{gap:.3em .7em}',
    '.gc-a8-tv .pm.none{border-style:dashed;border-color:rgba(251,191,36,.55)}',
    '.gc-a8-tv .pt{display:flex;align-items:center;gap:.7em}',
    '.gc-a8-tv .rk{font-style:normal;width:2.1em;height:2.1em;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.5em;font-weight:800;background:#fbbf24;color:#06182f;flex:none}',
    '.gc-a8-tv .nm{font-size:1.9em;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.gc-a8-tv .big{font-size:3.6em;font-weight:800;line-height:1.05;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.gc-a8-tv .big small{display:block;font-size:.3em;font-weight:600;color:#9cc4f5;letter-spacing:.02em;margin-top:.2em}',
    '.gc-a8-tv .big.dimv{color:#9cc4f5}',
    '.gc-a8-tv .bw{height:.55em;border-radius:.3em;background:rgba(255,255,255,.12);overflow:hidden}',
    '.gc-a8-tv .bw i{display:block;height:100%;border-radius:.3em;background:linear-gradient(90deg,#38bdf8,#60a5fa)}',
    '.gc-a8-tv .bw.g i{background:linear-gradient(90deg,#64748b,#94a3b8)}',
    '.gc-a8-tv .mg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.6em .9em}',
    '.gc-a8-tv .m{min-width:0}.gc-a8-tv .m b{display:block;font-size:1.75em;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.gc-a8-tv .m span{display:block;font-size:.95em;font-weight:600;color:#9cc4f5;line-height:1.2}',
    '.gc-a8-tv .m.s-amber b{color:#fbbf24}.gc-a8-tv .m.s-red b{color:#fca5a5}',
    '.gc-a8-tv .tb{flex:1;min-height:0;overflow:hidden;margin-bottom:1em;border-radius:1em;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);padding:.3em 1em}',
    '.gc-a8-tv table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:1.22em}',
    '.gc-a8-tv th{text-align:left;font-size:.78em;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#9cc4f5;padding:.55em .6em;border-bottom:1px solid rgba(255,255,255,.2)}',
    '.gc-a8-tv td{padding:.55em .6em;border-bottom:1px solid rgba(255,255,255,.08);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}',
    '.gc-a8-tv tr:last-child td{border-bottom:0}',
    '.gc-a8-tv td.cu{font-weight:800;color:#fff}.gc-a8-tv .r{text-align:right;font-variant-numeric:tabular-nums}',
    '.gc-a8-tv .tb th.cu{width:26%}.gc-a8-tv .tb th.ad{width:28%}.gc-a8-tv .tb th.pmc{width:13%}.gc-a8-tv .tb th.stc{width:15%}.gc-a8-tv .tb th.dtc{width:13%}.gc-a8-tv .tb th.r{width:11%}',
    '.gc-a8-tv td small{font-size:.75em;color:#9cc4f5;font-weight:600}',
    '.gc-a8-tv td .dim{font-size:.85em}.gc-a8-tv .tb th.dtc{width:15%}',
    '.gc-a8-tv .st{font-weight:700;padding:.15em .6em;border-radius:1em;font-size:.9em;background:rgba(96,165,250,.2);color:#bfdbfe}',
    '.gc-a8-tv .st.s-green{background:rgba(52,211,153,.2);color:#a7f3d0}.gc-a8-tv .st.s-amber{background:rgba(251,191,36,.22);color:#fde68a}',
    '.gc-a8-tv .cols{flex:1;min-height:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.1em;margin-bottom:1.1em}',
    '.gc-a8-tv .c{display:flex;flex-direction:column;gap:.7em;min-height:0}',
    '.gc-a8-tv .c h3{margin:0 0 .3em;font-size:1.7em;font-weight:800;color:#dbeafe}',
    '.gc-a8-tv .c.ctr{align-items:center;text-align:center}',
    '.gc-a8-tv .c .ring{width:min(15em,80%);margin:.4em auto}.gc-a8-tv .c .ring .pc{font-size:3.4em}',
    '.gc-a8-tv .c .sub{font-size:1.5em;font-weight:700;color:#9cc4f5}.gc-a8-tv .c .sub.up{color:#6ee7b7}.gc-a8-tv .c .sub.dn{color:#fca5a5}',
    '.gc-a8-tv .br{display:grid;grid-template-columns:8.5em minmax(0,1fr) auto;align-items:center;gap:.5em .8em;font-size:1.5em;font-weight:700}',
    '.gc-a8-tv .br b{font-variant-numeric:tabular-nums;text-align:right}.gc-a8-tv .br em{grid-column:2/4;font-style:normal;font-size:.75em;color:#8fb3de;margin-top:-.4em}',
    '.gc-a8-tv .br.red .bw i{background:#f87171}.gc-a8-tv .br.red b{color:#fca5a5}.gc-a8-tv .br.amber .bw i{background:#fbbf24}',
    '.gc-a8-tv .c .br span{white-space:nowrap}',
    '.gc-a8-tv .two{display:grid;grid-template-columns:1fr;gap:1em}',
    '.gc-a8-tv .two .big{font-size:4em}.gc-a8-tv .c>.big{font-size:5.5em}',
    '.gc-a8-tv table.mini{font-size:1.3em}.gc-a8-tv table.mini th:first-child{width:46%}',
    '.gc-a8-tv .wk{flex:1;min-height:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:.8em;margin-bottom:1.1em}',
    '.gc-a8-tv .dy{min-width:0;min-height:0;display:flex;flex-direction:column;border-radius:1em;overflow:hidden;background:linear-gradient(160deg,rgba(255,255,255,.12),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.15)}',
    '.gc-a8-tv .dy.today{border-color:#fbbf24;box-shadow:0 0 0 .15em rgba(251,191,36,.35),0 .6em 1.8em rgba(0,12,36,.38)}.gc-a8-tv .dy.past{opacity:.6}',
    '.gc-a8-tv .dh{display:flex;justify-content:space-between;align-items:baseline;padding:.7em .9em .3em}.gc-a8-tv .dh b{font-size:1.7em;font-weight:800}.gc-a8-tv .dh span{font-size:1.15em;color:#9cc4f5;font-weight:600}',
    '.gc-a8-tv .dy.today .dh b{color:#fbbf24}',
    '.gc-a8-tv .run{padding:0 .9em .5em;font-size:.95em;font-weight:700;color:#6ee7b7;border-bottom:1px solid rgba(255,255,255,.12)}',
    '.gc-a8-tv .evs{flex:1;min-height:0;overflow:hidden;padding:.6em .6em;display:flex;flex-direction:column;gap:.4em}',
    '.gc-a8-tv .ev{border-radius:.5em;padding:.35em .6em;background:rgba(96,165,250,.16);border-left:.25em solid #60a5fa;min-width:0;font-size:.95em;line-height:1.2}',
    '.gc-a8-tv .ev.start{background:rgba(52,211,153,.16);border-color:#34d399}.gc-a8-tv .ev.end{background:rgba(251,191,36,.16);border-color:#fbbf24}',
    '.gc-a8-tv .ev b{display:block;font-size:.8em;letter-spacing:.06em;color:#bfdbfe}.gc-a8-tv .ev span{display:block;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gc-a8-tv .ev em{display:block;font-style:normal;font-size:.85em;color:#9cc4f5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.gc-a8-tv .cb{position:absolute;left:50%;bottom:5.6em;transform:translateX(-50%);z-index:5;display:flex;align-items:center;gap:.9em;padding:.6em 1.1em;border-radius:3em;background:rgba(3,14,34,.88);border:1px solid rgba(255,255,255,.25);box-shadow:0 .5em 2em rgba(0,0,0,.5);font-size:1.05em;transition:opacity .3s}',
    '.gc-a8-tv.idle .cb{opacity:0;pointer-events:none}.gc-a8-tv.idle{cursor:none}',
    '.gc-a8-tv .cb button,.gc-a8-tv .cb select{font:700 1em inherit;font-family:inherit;color:#fff;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.3);border-radius:.6em;padding:.4em .9em;cursor:pointer}',
    '.gc-a8-tv .cb select{background:#0b2a55}',
    '.gc-a8-tv .cb button:hover{background:rgba(255,255,255,.25)}.gc-a8-tv .cb button.paused{background:#fbbf24;color:#06182f}',
    '.gc-a8-tv .cb .ai{display:flex;align-items:center;gap:.5em;font-weight:600;color:#cfe3fb;white-space:nowrap}',
    '.gc-a8-tv .dots{display:flex;gap:.55em;align-items:center}',
    '.gc-a8-tv .dot2{width:.95em;height:.95em;padding:0!important;border-radius:50%!important;background:rgba(255,255,255,.3)!important;border:0!important}',
    '.gc-a8-tv .dot2.on{background:#fbbf24!important;transform:scale(1.3)}',
    '.gc-a8-tv .pk{position:absolute;right:0;bottom:calc(100% + .6em);min-width:22em;padding:.9em 1.2em;border-radius:1em;background:rgba(3,14,34,.96);border:1px solid rgba(255,255,255,.28);display:flex;flex-direction:column;gap:.55em;font-weight:600}',
    '.gc-a8-tv .pk[hidden]{display:none}.gc-a8-tv .pk label{display:flex;align-items:center;gap:.6em;cursor:pointer;font-size:1.1em}.gc-a8-tv .pk input{width:1.1em;height:1.1em}.gc-a8-tv .pk hr{border:0;border-top:1px solid rgba(255,255,255,.2);width:100%;margin:.2em 0}',
    '.gc-a8-tv .prog{position:absolute;left:0;bottom:0;height:.3em;width:100%;background:#fbbf24;transform-origin:left;transform:scaleX(0);opacity:.85;pointer-events:none}',
    '.gc-a8-tv .prog.run{animation:gcTvProg linear forwards}',
    '@keyframes gcTvProg{from{transform:scaleX(0)}to{transform:scaleX(1)}}',
    '@media (prefers-reduced-motion:reduce){.gc-a8-tv .sl.inr,.gc-a8-tv .sl.inl{animation:none}}',
"""

JS = r"""/* patch TVSLIDES: the 📺 scoreboard is now a slideshow — Company, PM scoreboard, Active jobs, Pipeline, Money, Schedule.
   Each slide's numbers are worked out only when it is shown (cached 60 s); only the slide on screen is in the page.
   Timers: ONE 1-s clock tick (clock, ticker, 60-s refresh, control-bar auto-hide) + ONE auto-advance timeout — both stopped
   (and verified) by close(), and both paused while the tab is hidden. Settings: localStorage gc_tv_slides_v1. */
var TVK = 'gc_tv_slides_v1', TV_IVS = [0, 10, 15, 20, 30, 60], TV_ROWS = 12;
var TV_PAGES = [{ k: 'company', t: 'Company', ic: '🏢' }, { k: 'pm', t: 'PM scoreboard', ic: '👷' }, { k: 'jobs', t: 'Active jobs', ic: '🏗️' },
  { k: 'pipe', t: 'Pipeline & leads', ic: '📈' }, { k: 'money', t: 'Money', ic: '💵' }, { k: 'week', t: 'Schedule this week', ic: '🗓️' }];
function tvCfgLoad(){
  var c = { iv: 15, off: {}, names: true };
  try { var j = JSON.parse(lsGet(TVK) || 'null'); if (j && typeof j === 'object') {
    if (TV_IVS.indexOf(j.iv) > -1) c.iv = j.iv;
    if (j.pages && typeof j.pages === 'object') TV_PAGES.forEach(function(p){ if (j.pages[p.k] === false) c.off[p.k] = 1; });
    if (j.names === false) c.names = false;
  } } catch (e) {}
  if (TV_PAGES.every(function(p){ return c.off[p.k]; })) c.off = {};
  return c;
}
function tvCfgSave(c){ var pg = {}; TV_PAGES.forEach(function(p){ pg[p.k] = !c.off[p.k]; }); lsSet(TVK, JSON.stringify({ iv: c.iv, pages: pg, names: c.names })); }
function nk(v){ return low(v).replace(/\s+/g, ' '); }
/* who is looking: an admin sees the whole company; everyone else sees only the jobs, leads and bids that are theirs */
function tvSame(a, b){ a = nk(a); b = nk(b); if (!a || !b) return false; if (a === b) return true; var x = a.split(' '), y = b.split(' '); return x[0] === y[0] && (x[1] || '').charAt(0) === (y[1] || '').charAt(0) && !!x[1] && !!y[1]; }
function tvScope(){ var adm = isAdmin(), nm = adm ? '' : me(); return { adm: adm, name: nm }; }
function tvMineJob(p, sc){ return sc.adm || tvSame(p.pm || p.projectManager, sc.name); }
function tvMineLead(l, sc){ return sc.adm || ['pm', 'estimator', 'assignedTo', 'assigned', 'owner'].some(function(f){ return tvSame(l[f], sc.name); }); }
function tvLbl(p, sc){ return sc.adm ? p.t : p.k === 'company' ? 'My numbers' : p.k === 'pm' ? 'My scoreboard' : p.t; }
function tvTickerMe(n){
  var out = [];
  if (n.newWeek > 0) out.push('📈 ' + n.newWeek + ' new lead' + (n.newWeek === 1 ? '' : 's') + ' of yours this week');
  if (n.jobs > 0) out.push('🏗️ ' + n.jobs + ' of your jobs in progress');
  if (n.bidsWeek > 0) out.push('📐 ' + n.bidsWeek + ' of your bids due this week');
  if (n.appr === 0) out.push('✅ Your approvals are all caught up');
  out.push('🦺 Safety first — every job, every day', '🏗️ GrayCo Construction Services — building it right');
  return out;
}
function tvDay(d){
  if (!d) return '—'; var t = today(); if (d === t) return 'Today'; if (d === addDays(t, 1)) return 'Tomorrow';
  var x = new Date(d + 'T12:00:00'); return isNaN(x) ? d : x.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function tvTag(p){ return s(p.autoPO || p.po) || ('#' + s(p.id).slice(-5)); }
function tvAddr(p){ var a = s(p.address).split(',').map(s).filter(Boolean).slice(0, 2); if (a.length < 2 && s(p.city) && a.join('').indexOf(s(p.city)) < 0) a.push(s(p.city)); return a.join(', '); }
function tvJobs(sc){ return projects().filter(function(p){ return activeJob(p) && !/bid|estimat|lead|pending/i.test(s(p.status)) && tvMineJob(p, sc); }); }
function tvStage(p){
  var st = low(p.status), pc = num(p.pct), t, tone;
  if (/hold/.test(st)) { t = 'On hold'; tone = 'amber'; } else if (/approved/.test(st)) { t = 'Approved'; tone = 'blue'; } else { t = 'In progress'; tone = 'green'; }
  if (pc > 0 && pc <= 100 && tone === 'green') t += ' · ' + Math.round(pc) + '%';
  return { t: t, tone: tone };
}
function tvPaid(iv, ym){   /* what was collected on this invoice in a month (same rule as the Company tile) */
  var got = 0;
  arr(iv.payments).forEach(function(p){ if (s(p && (p.date || p.paidDate)).slice(0, 7) === ym) got += num(p.amt || p.amount); });
  if (!arr(iv.payments).length && s(iv.paidDate).slice(0, 7) === ym) got += paidOf(iv);
  return got;
}
function tvInvBal(iv){ return num(iv.amt || iv.amount || iv.total) - paidOf(iv); }
function tvInvDate(iv){ return s(iv.date || iv.sentDate || iv.issueDate || iv.created || iv.recvDate).slice(0, 10); }
function tvLeadT(l){ return Date.parse(l.createdAt || l.receivedAt || l.created || (s(l.date) ? s(l.date) + 'T12:00:00' : '')); }
function tvSrc2(v){
  var x = low(v), k = tvSource(v); if (k) return k;
  if (/companycam/.test(x)) return 'CompanyCam'; if (/estimate/.test(x)) return 'Estimate Builder'; if (/quickbooks/.test(x)) return 'QuickBooks';
  if (/email|e-mail|inbox/.test(x)) return 'E-mail'; return 'Other';
}

/* ── the numbers for each slide (called only when that slide is shown) ─────────────────────────────── */
var TVD = {};
TVD.pm = function(sc){
  var t0 = today(), mo = t0.slice(0, 7), U = users(), ok = {}, bad = {}, cards = {}, byPid = {}, i, only = !sc.adm;
  U.forEach(function(u){ if (!u || !s(u.name)) return; if (u.active === false) bad[nk(u.name)] = 1; else ok[nk(u.name)] = u; });
  function card(k, name){ return cards[k] || (cards[k] = { k: k, name: name, jobs: 0, done: 0, rev: 0, coll: 0, appr: 0, od: 0, behind: 0 }); }
  function owner(p){ if (only) return tvSame(p.pm || p.projectManager, sc.name) ? '_me' : '_x'; var k = nk(p.pm); return k && ok[k] ? k : '_none'; }
  function nameOf(k){ return only ? sc.name : k === '_none' ? 'No active PM' : s(ok[k].name); }
  if (only) card('_me', sc.name);
  projects().forEach(function(p){
    if (!p || !p.id || p.deleted === true) return;
    var k = owner(p), c; if (k === '_x') return;
    if (/complete|closed/i.test(s(p.status)) && !/cancel|lost/i.test(s(p.status))) {
      if (k !== '_none' && k !== '_x' && s(p.completedAt || p.completionDate || p.completeDate || p.completedDate || p.completed).slice(0, 7) === mo) card(k, nameOf(k)).done++;
      return;
    }
    if (!activeJob(p) || /bid|estimat|lead|pending/i.test(s(p.status))) return;
    c = card(k, nameOf(k)); byPid[p.id] = c;
    c.jobs++; c.rev += num(p.contract || p.contractAmt);
    if (/^\d{4}-\d\d-\d\d/.test(s(p.endDate)) && s(p.endDate).slice(0, 10) < t0 && !/hold/i.test(s(p.status))) c.behind++;
  });
  var allP = {}; projects().forEach(function(p){ if (p && p.id) allP[p.id] = p; });
  function ownerOfPid(pid){ var p = allP[pid]; if (!p) return null; return cards[owner(p)] || null; }
  invs().forEach(function(iv){
    if (!iv || iv.deleted || iv.type === 'sub' || iv.sub) return;
    var c = ownerOfPid(iv.pid); if (!c) return;
    c.coll += tvPaid(iv, mo);
    var st = low(iv.status); if (iv.type === 'client' && (st === 'draft' || st === 'pending' || st === 'pm_review')) c.appr++;
  });
  try { arr(lsGet('gc_sub_approvals')).forEach(function(a){ if (a && a.status === 'pending_pm') { var k = only ? (tvSame(a.pmName, sc.name) ? '_me' : '_x') : nk(a.pmName); if (cards[k]) cards[k].appr++; } }); } catch (e) {}
  try { arr(lsGet('gc_email_queue')).forEach(function(e){ if (e && e.status === 'pending' && e.pid) { var c = ownerOfPid(e.pid); if (c) c.appr++; } }); } catch (e) {}
  try { arr(lsGet('gc_office_tasks')).forEach(function(t){
    if (!t || t.done || t.deleted || !/^\d{4}-\d\d-\d\d/.test(s(t.due)) || s(t.due).slice(0, 10) >= t0) return;
    var who = [t.assignee].concat(arr(t.assignees)), hit = null;
    who.forEach(function(w){ var k = only ? (tvSame(w && w.name || w, sc.name) ? '_me' : '_x') : nk(w && w.name || w); if (!hit && cards[k]) hit = cards[k]; });
    if (!hit && t.pid) hit = byPid[t.pid] || null;
    if (hit) hit.od++;
  }); } catch (e) {}
  var list = Object.keys(cards).map(function(k){ return cards[k]; }).filter(function(c){ return only || c.jobs > 0 || c.done > 0 || (c.k !== '_none' && /project manager|\bpm\b/i.test(s(ok[c.k] && ok[c.k].role))); });
  list.sort(function(a, b){ if (a.k === '_none') return 1; if (b.k === '_none') return -1; return b.rev - a.rev || b.jobs - a.jobs; });
  var tot = 0, jobs = 0; list.forEach(function(c){ tot += c.rev; jobs += c.jobs; });
  return { cards: list, tot: tot, jobs: jobs };
};
TVD.jobs = function(sc){
  var t0 = today(), nxt = {};
  arr(crm().schedule).forEach(function(x){ var d = s(x.date).slice(0, 10), p = s(x.pid); if (p && d >= t0 && (!nxt[p] || d < nxt[p])) nxt[p] = d; });
  var rows = tvJobs(sc).map(function(p){
    var d = nxt[p.id] || '', kind = 'sched', st = s(p.startDate).slice(0, 10), en = s(p.endDate).slice(0, 10);
    if (!d && st >= t0) { d = st; kind = 'start'; } else if (!d && en >= t0) { d = en; kind = 'ends'; }
    return { cust: s(p.client || p.name), addr: tvAddr(p), pm: s(p.pm) || '—', tag: tvTag(p), st: tvStage(p), next: d, kind: kind, val: num(p.contract || p.contractAmt) };
  });
  rows.sort(function(a, b){ if (!a.next !== !b.next) return a.next ? -1 : 1; return a.next < b.next ? -1 : a.next > b.next ? 1 : a.cust < b.cust ? -1 : 1; });
  var tot = 0; rows.forEach(function(r){ tot += r.val; });
  return { rows: rows, tot: tot };
};
TVD.pipe = function(sc, n){
  var now = Date.now(), wk = now - 7 * 864e5, t0 = today(), end = addDays(t0, 14), by = {}, wkN = 0, seen = {}, bids = [], open = 0, openVal = 0;
  var L = leads().filter(function(l){ return l && l.id && !l.deleted && tvMineLead(l, sc); });
  L.forEach(function(l){ var t = tvLeadT(l); if (isFinite(t) && t >= wk && !/quickbooks|companycam|import/i.test(String(l.source || l.leadSource || ''))) { wkN++;   /* TVSRC: synced/imported records are not new leads */ var k = tvSrc2(l.source || l.leadSource); by[k] = (by[k] || 0) + 1; } });
  var src = Object.keys(by).map(function(k){ return { k: k, n: by[k] }; }).sort(function(a, b){ return b.n - a.n; });
  var closed = /won|lost|cancel|declin|no.?bid|dead/i;
  L.concat(arr(crm().bidLists).filter(function(l){ return l && tvMineLead(l, sc); })).forEach(function(l){
    if (!l || l.deleted) return; var st = s(l.bidStatus || l.status || l.stage), nm = s(l.name || l.title), d = s(l.bidDue).slice(0, 10);
    if (closed.test(st) || bidSt(l) === 'Won' || bidSt(l) === 'Lost') return;
    var key = low(nm); if (key && seen[key]) return; if (key) seen[key] = 1;
    open++; openVal += num(l.estValue);
    if (d && d >= t0 && d <= end) bids.push({ name: nm, due: d, who: s(l.estimator || l.assignedTo || l.assigned) || '—', val: num(l.estValue) });
  });
  bids.sort(function(a, b){ return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
  return { wk: wkN, src: src, bids: bids, open: open, openVal: openVal, close: n.close, won: n.won, lost: n.lost };
};
TVD.money = function(sc){
  var now = Date.now(), t0 = today(), mo = t0.slice(0, 7), lm = (function(){ var d = new Date(t0 + 'T12:00:00'); d.setDate(1); d.setMonth(d.getMonth() - 1); return ymd(d).slice(0, 7); })();
  var B = [{ l: '0–30 days', v: 0, n: 0 }, { l: '31–60 days', v: 0, n: 0 }, { l: '61–90 days', v: 0, n: 0 }, { l: '90+ days', v: 0, n: 0 }];
  var cm = 0, cl = 0, dueList = [], pastN = 0, pastV = 0, wkEnd = addDays(t0, 7), P = {}, tot = 0;
  projects().forEach(function(p){ if (p && p.id) P[p.id] = p; });
  invs().forEach(function(iv){
    if (!iv || iv.deleted || iv.type === 'sub' || iv.sub || /void|draft|cancel/i.test(s(iv.status))) return;
    if (!sc.adm && !(P[iv.pid] && tvMineJob(P[iv.pid], sc))) return;
    cm += tvPaid(iv, mo); cl += tvPaid(iv, lm);
    var bal = tvInvBal(iv); if (bal <= 0.01) return;
    tot += bal;
    var dt = Date.parse(tvInvDate(iv) + 'T12:00:00'), age = isFinite(dt) ? (now - dt) / 864e5 : 0, b = age > 90 ? 3 : age > 60 ? 2 : age > 30 ? 1 : 0;
    B[b].v += bal; B[b].n++;
    var due = s(iv.due || iv.dueDate).slice(0, 10), p = P[iv.pid];
    if (due && due < t0) { pastN++; pastV += bal; } else if (due && due <= wkEnd) dueList.push({ id: s(iv.num || iv.number || iv.id).slice(0, 12), cust: s(iv.client || (p && p.client)), tag: p ? tvTag(p) : '', due: due, bal: bal });
  });
  dueList.sort(function(a, b){ return a.due < b.due ? -1 : a.due > b.due ? 1 : b.bal - a.bal; });
  var dueTot = 0; dueList.forEach(function(x){ dueTot += x.bal; });
  return { B: B, tot: tot, cm: cm, cl: cl, due: dueList, dueTot: dueTot, pastN: pastN, pastV: pastV };
};
TVD.week = function(sc){
  var t0 = today(), d0 = new Date(t0 + 'T12:00:00'), mon = addDays(t0, -((d0.getDay() + 6) % 7)), days = [], P = {}, jobs = tvJobs(sc), crew = {}, i;
  for (i = 0; i < 7; i++) days.push({ d: addDays(mon, i), it: [], run: 0 });
  jobs.forEach(function(p){ P[p.id] = p; });
  projects().forEach(function(p){ if (p && p.id && !P[p.id]) P[p.id] = p; });
  var idx = {}; days.forEach(function(x, j){ idx[x.d] = j; });
  arr(crm().schedule).forEach(function(x){
    var d = s(x.date).slice(0, 10); if (!(d in idx)) return;
    var p = P[x.pid], who = s(x.assignee || x.assigned || x.vendor); if (!sc.adm && !(p && tvMineJob(p, sc))) return; if (who) crew[nk(who)] = 1;
    days[idx[d]].it.push({ k: 'sched', t: s(x.title), ty: s(x.type), who: who, time: s(x.time), tag: p ? tvTag(p) : '', pm: p ? s(p.pm) : '' });
  });
  jobs.forEach(function(p){
    var st = s(p.startDate).slice(0, 10), en = s(p.endDate).slice(0, 10);
    days.forEach(function(x){
      if (st && en && st <= x.d && x.d <= en) x.run++;
      if (st === x.d) x.it.push({ k: 'start', t: s(p.client || p.name), tag: tvTag(p), pm: s(p.pm) });
      else if (en === x.d) x.it.push({ k: 'end', t: s(p.client || p.name), tag: tvTag(p), pm: s(p.pm) });
    });
  });
  var n = 0; days.forEach(function(x){ n += x.it.length; });
  return { days: days, mon: mon, n: n, crew: Object.keys(crew).length, t0: t0 };
};

/* ── drawing each slide (pure strings; small — long lists are paged) ─────────────────────────────── */
var TVR = {};
function tvHead(ic, title, meta, subs, sub){
  return '<div class="sh"><h2><span>' + ic + '</span>' + esc(title) + '</h2><div class="sm">' + meta + '</div>' +
    (subs > 1 ? '<div class="spg"><button type="button" data-tv="sp-" aria-label="Previous part">‹</button><b>' + (sub + 1) + ' / ' + subs + '</b><button type="button" data-tv="sp+" aria-label="Next part">›</button></div>' : '') + '</div>';
}
function tvEmpty(t){ return '<div class="em">' + esc(t) + '</div>'; }
TVR.pm = function(d, sub, cfg, sc){
  var PER = 6, subs = Math.max(1, Math.ceil(d.cards.length / PER)), out = '', max = 0;
  d.cards.forEach(function(c){ if (c.rev > max) max = c.rev; });
  d.cards.slice(sub * PER, sub * PER + PER).forEach(function(c, i){
    var rk = c.k === '_none' ? '!' : sc.adm ? String(sub * PER + i + 1) : '★', M = function(v, l, tone){ return '<div class="m' + (tone ? ' s-' + tone : '') + '"><b>' + v + '</b><span>' + l + '</span></div>'; };
    out += '<div class="pm' + (c.k === '_none' ? ' none' : '') + '"><div class="pt"><i class="rk">' + rk + '</i><div class="nm">' + esc(c.name) + '</div></div>' +
      '<div class="big">' + esc(money0(c.rev)) + '<small>contract value in progress</small></div>' +
      '<div class="bw"><i style="width:' + (max ? Math.max(3, Math.round(c.rev / max * 100)) : 0) + '%"></i></div>' +
      '<div class="mg">' + M(c.jobs, 'Active jobs') + M(c.done, 'Completed this month') + M(esc(money0(c.coll)), 'Collected this month') +
      M(c.appr, 'Open approvals', c.appr ? 'amber' : '') + M(c.od, 'Overdue to-dos', c.od ? 'red' : '') + M(c.behind, 'Jobs behind schedule', c.behind ? 'red' : '') + '</div></div>';
  });
  return { subs: subs, html: tvHead('👷', sc.adm ? 'PM scoreboard' : 'My scoreboard', sc.adm ? d.cards.length + ' project manager' + (d.cards.length === 1 ? '' : 's') + ' · ' + d.jobs + ' active jobs · ' + esc(money0(d.tot)) + ' in progress · ranked by revenue in progress' : esc(sc.name) + ' · your jobs only', subs, sub) +
    (out ? '<div class="pms n' + Math.min(6, d.cards.length - sub * PER) + '">' + out + '</div>' : tvEmpty('No active jobs with a project manager yet.')) };
};
TVR.jobs = function(d, sub, cfg){
  var subs = Math.max(1, Math.ceil(d.rows.length / TV_ROWS)), nm = cfg.names, rows = d.rows.slice(sub * TV_ROWS, sub * TV_ROWS + TV_ROWS), h = '';
  rows.forEach(function(r){
    var nx = r.next ? '<b>' + esc(tvDay(r.next)) + '</b>' + (r.kind === 'start' ? ' <small>starts</small>' : r.kind === 'ends' ? ' <small>due</small>' : '') : '<span class="dim">not scheduled</span>';
    h += '<tr>' + (nm ? '<td class="cu">' + esc(r.cust || '—') + '</td><td class="ad">' + esc(r.addr || '—') + '</td>' : '<td class="cu">Job ' + esc(r.tag) + '</td>') +
      '<td>' + esc(r.pm) + '</td><td><b class="st s-' + r.st.tone + '">' + esc(r.st.t) + '</b></td><td class="dt">' + nx + '</td>' + (nm ? '<td class="r">' + esc(money0(r.val)) + '</td>' : '') + '</tr>';
  });
  return { subs: subs, html: tvHead('🏗️', 'Active jobs', d.rows.length + ' jobs' + (nm ? ' · ' + esc(money0(d.tot)) + ' contract value' : '') + ' · sorted by next date', subs, sub) +
    (h ? '<div class="tb"><table><thead><tr>' + (nm ? '<th class="cu">Customer</th><th class="ad">Address</th>' : '<th class="cu">Job</th>') + '<th class="pmc">PM</th><th class="stc">Stage</th><th class="dtc">Next date</th>' + (nm ? '<th class="r">Contract</th>' : '') + '</tr></thead><tbody>' + h + '</tbody></table></div>' : tvEmpty('No active jobs.')) };
};
TVR.pipe = function(d, sub, cfg){
  var max = d.src.length ? d.src[0].n : 1, sh = '', bh = '', i;
  d.src.slice(0, 8).forEach(function(x){ sh += '<div class="br"><span>' + esc(x.k) + '</span><div class="bw"><i style="width:' + Math.round(x.n / max * 100) + '%"></i></div><b>' + x.n + '</b></div>'; });
  d.bids.slice(0, 8).forEach(function(b, j){
    bh += '<tr><td class="cu">' + (cfg.names ? esc(b.name || 'Bid') : 'Bid ' + (j + 1)) + '</td><td class="dt"><b>' + esc(tvDay(b.due)) + '</b></td><td>' + esc(b.who) + '</td></tr>';
  });
  var rate = d.close == null ? '—' : d.close + '%', off = 276.46 * (1 - (d.close || 0) / 100);
  return { subs: 1, html: tvHead('📈', 'Pipeline & leads', d.open + ' open lead' + (d.open === 1 ? '' : 's') + ' &amp; bids' + (d.openVal > 0 ? ' · ' + esc(money0(d.openVal)) + ' estimated' : ''), 1, 0) +
    '<div class="cols c3"><div class="c"><h3>New leads this week</h3><div class="big">' + d.wk + '<small>last 7 days</small></div>' + (sh || '<div class="dim">No new leads this week.</div>') + '</div>' +
    '<div class="c"><h3>Bids due in the next 14 days</h3>' + (bh ? '<table class="mini"><thead><tr><th>Bid</th><th>Due</th><th>Estimator</th></tr></thead><tbody>' + bh + '</tbody></table>' + (d.bids.length > 8 ? '<div class="dim">+ ' + (d.bids.length - 8) + ' more</div>' : '') : '<div class="dim">No bids due in the next 14 days.</div>') + '</div>' +
    '<div class="c ctr"><h3>Win rate</h3><div class="ring"><svg viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="44"/><circle class="arc" cx="50" cy="50" r="44" style="stroke-dashoffset:' + off + ';transition:none"/></svg><div class="pc">' + rate + '</div></div><div class="sub">' + d.won + ' won · ' + d.lost + ' lost</div><div class="dim">last 90 days</div></div></div>' };
};
TVR.money = function(d, sub, cfg){
  var max = 0, ah = '', dh = '', dl = d.cl > 0 ? Math.round((d.cm - d.cl) / d.cl * 100) : null, mx = Math.max(d.cm, d.cl, 1);
  d.B.forEach(function(b){ if (b.v > max) max = b.v; });
  d.B.forEach(function(b, i){ ah += '<div class="br ' + (i === 3 && b.v > 0 ? 'red' : i === 2 && b.v > 0 ? 'amber' : '') + '"><span>' + b.l + '</span><div class="bw"><i style="width:' + (max ? Math.max(b.v ? 3 : 0, Math.round(b.v / max * 100)) : 0) + '%"></i></div><b>' + esc(money0(b.v)) + '</b><em>' + b.n + ' inv.</em></div>'; });
  d.due.slice(0, 8).forEach(function(x){ dh += '<tr><td class="cu">' + (cfg.names ? esc(x.cust || 'Invoice ' + x.id) : esc('Job ' + (x.tag || x.id))) + '</td><td class="dt"><b>' + esc(tvDay(x.due)) + '</b></td><td class="r">' + esc(money0(x.bal)) + '</td></tr>'; });
  return { subs: 1, html: tvHead('💵', 'Money', 'Accounts receivable ' + esc(money0(d.tot)), 1, 0) +
    '<div class="cols c3"><div class="c"><h3>A/R aging</h3>' + ah + '<div class="dim">by invoice date · total ' + esc(money0(d.tot)) + '</div></div>' +
    '<div class="c"><h3>Collected</h3><div class="two"><div><div class="big">' + esc(money0(d.cm)) + '<small>this month</small></div><div class="bw"><i style="width:' + Math.round(d.cm / mx * 100) + '%"></i></div></div>' +
    '<div><div class="big dimv">' + esc(money0(d.cl)) + '<small>last month</small></div><div class="bw g"><i style="width:' + Math.round(d.cl / mx * 100) + '%"></i></div></div></div>' +
    '<div class="sub ' + (dl == null ? '' : dl >= 0 ? 'up' : 'dn') + '">' + (dl == null ? 'No collections last month to compare' : (dl >= 0 ? '▲ ' : '▼ ') + Math.abs(dl) + '% vs last month') + '</div></div>' +
    '<div class="c"><h3>Invoices due this week</h3>' + (dh ? '<table class="mini"><thead><tr><th>' + (cfg.names ? 'Customer' : 'Job') + '</th><th>Due</th><th class="r">Balance</th></tr></thead><tbody>' + dh + '</tbody></table><div class="dim">' + d.due.length + ' invoice' + (d.due.length === 1 ? '' : 's') + ' · ' + esc(money0(d.dueTot)) + '</div>' : '<div class="dim">Nothing due in the next 7 days.</div>') +
    (d.pastN ? '<div class="sub dn">⚠ ' + d.pastN + ' past due · ' + esc(money0(d.pastV)) + '</div>' : '') + '</div></div>' };
};
TVR.week = function(d, sub, cfg){
  var cols = '';
  d.days.forEach(function(x){
    var dt = new Date(x.d + 'T12:00:00'), h = '', shown = x.it.slice(0, 7);
    shown.forEach(function(i){
      var lbl = cfg.names ? i.t : (i.k === 'sched' ? (i.ty || 'Scheduled') + (i.tag ? ' · Job ' + i.tag : '') : 'Job ' + i.tag);
      h += '<div class="ev ' + i.k + '"><b>' + (i.k === 'start' ? '▶ Starts' : i.k === 'end' ? '⚑ Due' : esc(i.time || '•')) + '</b><span>' + esc(lbl || 'Scheduled') + '</span>' + (i.who ? '<em>' + esc(i.who) + '</em>' : i.pm ? '<em>' + esc(i.pm) + '</em>' : '') + '</div>';
    });
    if (x.it.length > 7) h += '<div class="dim">+ ' + (x.it.length - 7) + ' more</div>';
    cols += '<div class="dy' + (x.d === d.t0 ? ' today' : '') + (x.d < d.t0 ? ' past' : '') + '"><div class="dh"><b>' + dt.toLocaleDateString('en-US', { weekday: 'short' }) + '</b><span>' + dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '</span></div>' +
      '<div class="run">' + x.run + ' job' + (x.run === 1 ? '' : 's') + ' in progress</div><div class="evs">' + (h || '<div class="dim">Nothing scheduled</div>') + '</div></div>';
  });
  return { subs: 1, html: tvHead('🗓️', 'Schedule this week', d.n + ' scheduled item' + (d.n === 1 ? '' : 's') + ' · ' + d.crew + ' crew / sub' + (d.crew === 1 ? '' : 's') + ' booked', 1, 0) + '<div class="wk">' + cols + '</div>' };
};

function tv(){
  css();
  if (TV) { try { TV.__close(); } catch (e) { TV.remove(); } TV = null; }
  var SC = tvScope(), T = { clk: 0, adv: 0, raf: 0 }, alive = true, prev = {}, anims = [], items = [], ti = 0, cache = {}, cfg = tvCfgLoad(), cur = '', sub = 0, subs = 1, playing = true;
  var lastMove = Date.now(), lastRef = Date.now(), lastTk = 0, swX = 0, swY = 0, swOn = false, whAcc = 0, whAt = 0, lastNav = 0, L = [];
  var el = D.createElement('div'); el.className = 'gc-a8-tv'; el.id = 'gc-a8-tv'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Office scoreboard');
  var DEFS = [
    { k: 'newWeek', ic: '📈', l: 'New leads this week' }, { k: 'close', ic: '🎯', l: 'Close rate (90 days · won/lost)' }, { k: 'jobs', ic: '🏗️', l: 'Jobs in progress' },
    { k: 'collected', ic: '💵', l: 'Collected this month' }, { k: 'ar', ic: '🧾', l: 'Accounts receivable' }, { k: 'bidsWeek', ic: '📐', l: 'Bids due this week' }, { k: 'appr', ic: '✅', l: 'Approvals waiting', last: 1 }];
  var ACC = { newWeek: '#38bdf8', jobs: '#60a5fa', collected: '#f0c451', bidsWeek: '#a78bfa', close: '#60a5fa', ar: '#60a5fa', appr: '#60a5fa' };
  var companyHtml = '<div class="tvg nogoal">' + DEFS.map(function(d){ return '<div class="t' + (d.last ? ' last' : '') + '" data-k="' + d.k + '" style="--ac:' + ACC[d.k] + '"><i class="bar"></i><div class="ic">' + d.ic + '</div><div class="l">' + d.l + '</div><div class="v" data-v>0</div><div class="sub" data-sub>&nbsp;</div></div>'; }).join('') +
    (SC.adm ? '<div class="t goal" data-k="goal"><i class="bar"></i><div class="ic">🎯</div><div class="l">Company goal</div><div data-gbody></div></div>' : '') + '</div>';
  el.innerHTML = '<div class="hd"><img class="logo" alt="GrayCo Construction Services" src="/portal-logo.png"><div class="brand"><b>GrayCo Construction</b><span data-pt>Team scoreboard</span></div><span class="sp"></span>' +
    '<div class="live"><i class="dot"></i>LIVE</div><div class="clock"><div class="time" data-time></div><div class="date" data-date></div></div><div class="btns"><button type="button" data-tv="fs">Full screen</button><button type="button" data-tv="x">Close</button></div></div>' +
    '<div class="pg" data-pg></div>' +
    '<div class="tk"><span class="lab">LATEST</span><div class="tkw"><div class="tki" data-tki></div></div><span class="note">Updates every minute</span></div>' +
    '<div class="cb" data-cb><button type="button" data-tv="prev" aria-label="Previous page" title="Previous page (←)">◀</button><span class="dots" data-dots></span><button type="button" data-tv="next" aria-label="Next page" title="Next page (→)">▶</button>' +
    '<button type="button" data-tv="play" aria-label="Pause or play" title="Pause / play (space)">⏸</button>' +
    '<label class="ai">Auto-advance <select data-tv="iv" aria-label="Auto-advance">' + TV_IVS.map(function(v){ return '<option value="' + v + '">' + (v ? v + ' s' : 'Off (manual)') + '</option>'; }).join('') + '</select></label>' +
    '<button type="button" data-tv="pick" aria-haspopup="true" aria-expanded="false">Pages ▾</button>' +
    '<div class="pk" data-pk hidden>' + TV_PAGES.map(function(p){ return '<label><input type="checkbox" data-pgk="' + p.k + '"> ' + p.ic + ' ' + esc(tvLbl(p, SC)) + '</label>'; }).join('') +
    '<hr><label class="pv"><input type="checkbox" data-names> Show customer names &amp; addresses</label></div></div>' +
    '<i class="prog" data-prog></i>';
  var $ = function(q, r){ return (r || el).querySelector(q); };
  var logo = $('.logo'), tried = 0, pg = $('[data-pg]');
  logo.addEventListener('error', function(){ if (tried++ === 0) logo.src = '/img/grayco-logo-white.png'; else logo.style.display = 'none'; });
  function on(t, ev, f, o){ t.addEventListener(ev, f, o); L.push([t, ev, f, o]); }

  var FMT = { int: function(v){ return String(Math.round(v)); }, pct: function(v){ return Math.round(v) + '%'; }, usd: function(v){ return money0(v); }, pc1: function(v){ return (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '') + '%'; } };
  var reduce = false; try { reduce = !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
  function frame(now){
    T.raf = 0; var more = false;
    anims.forEach(function(a){ var p = Math.min(1, (now - a.t0) / a.dur), e = 1 - Math.pow(1 - p, 3); a.node.textContent = a.f(a.from + (a.to - a.from) * e); if (p < 1) more = true; else a.done = true; });
    anims = anims.filter(function(a){ return !a.done; });
    if (more && alive && !D.hidden) T.raf = W.requestAnimationFrame(frame); else { anims.forEach(function(a){ a.node.textContent = a.f(a.to); }); anims = []; }
  }
  function setNum(node, key, to, fmt){
    var f = FMT[fmt]; if (prev[key] === to) return;
    var from = typeof prev[key] === 'number' ? prev[key] : 0; prev[key] = to;
    anims = anims.filter(function(a){ return a.node !== node; });
    var txt = f(to); node.className = node.className.replace(/\s*\b(m|xl)\b/g, ''); if (fmt === 'usd') node.className += ' m'; if (txt.length > 9) node.className += ' xl';
    if (reduce || D.hidden || from === to) { node.textContent = txt; return; }
    anims.push({ node: node, from: from, to: to, f: f, t0: W.performance.now(), dur: 1400 });
    if (!T.raf) T.raf = W.requestAnimationFrame(frame);
  }
  function tile(k, o){
    var t = $('[data-k="' + k + '"]'); if (!t) return;
    t.className = 't' + (t.className.indexOf('last') > -1 ? ' last' : '') + (o.st ? ' s-' + o.st : '');
    var v = $('[data-v]', t);
    if (o.num == null) { prev[k] = null; anims = anims.filter(function(a){ return a.node !== v; }); v.textContent = o.text || '—'; v.className = 'v'; }
    else setNum(v, k, o.num, o.fmt);
    $('[data-sub]', t).textContent = o.sub || ' ';
  }
  function paintGoal(p, adm){
    var g = $('.tvg'), cell = $('.t.goal'); if (!g || !cell || cur !== 'company') return;
    var b = $('[data-gbody]', cell);
    if (!p && !adm) { g.className = 'tvg nogoal'; return; }
    g.className = 'tvg';
    if (!p) { cell.className = 't goal hint'; b.innerHTML = '<div class="gh">Set a company goal</div><div class="sub">⚙ Admin → 🎯 Company goal</div>'; return; }
    cell.className = 't goal ' + (p.ahead >= 0 ? 's-green' : 's-amber');
    if (!$('.ring', b)) { b.innerHTML = '<div class="ring"><svg viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="44"/><circle class="arc" cx="50" cy="50" r="44"/></svg><div class="pc" data-pc>0%</div></div><div class="gl" data-gl></div><div class="sub" data-gs></div>'; }
    $('[data-gl]', b).textContent = money0(p.ytd) + ' of ' + money0(p.goal) + ' this year';
    $('[data-gs]', b).textContent = (p.ahead >= 0 ? money0(p.ahead) + ' ahead of pace' : money0(-p.ahead) + ' behind pace');
    var arc = $('.arc', b), off = 276.46 * (1 - Math.max(0, Math.min(1, p.pct / 100)));
    if (reduce || D.hidden) arc.style.strokeDashoffset = off; else { void arc.getBoundingClientRect(); arc.style.strokeDashoffset = off; }   /* the CSS transition draws it — no timer */
    setNum($('[data-pc]', b), 'goal', p.pct, 'pc1');
  }
  /* a slide's data: worked out when it is shown, then kept for 60 s */
  function nums(){ var c = cache.nums; if (!c || Date.now() - c.at > 60000) { var n = tvNumbers(SC); if (!SC.adm) { var mc = TVD.pm(SC).cards[0]; n.appr = mc ? mc.appr : 0; } c = cache.nums = { at: Date.now(), d: n }; items = tvTicker(n, SC); if (ti >= items.length) ti = 0; } return c.d; }
  function data(k){
    var c = cache[k]; if (c && Date.now() - c.at < 60000) return c.d;
    var d = k === 'company' ? { n: nums() } : k === 'pipe' ? TVD.pipe(SC, nums()) : TVD[k](SC); cache[k] = { at: Date.now(), d: d }; return d;
  }
  function paintCompany(){
    var n = data('company').n;
    tile('newWeek', { num: n.newWeek, fmt: 'int', sub: 'new inquiries, last 7 days' });
    var cs = n.close == null ? '' : n.won + n.lost >= 5 && n.close < 30 ? 'red' : n.close >= 50 ? 'green' : n.close < 50 && n.close >= 30 ? 'amber' : '';
    tile('close', { num: n.close, fmt: 'pct', text: '—', st: cs, sub: n.won + ' won · ' + n.lost + ' lost' });
    tile('jobs', { num: n.jobs, fmt: 'int', sub: 'active right now' });
    tile('collected', { num: n.collected, fmt: 'usd', sub: 'payments received' });
    tile('ar', { num: n.ar, fmt: 'usd', st: n.ar60 > 0 ? 'red' : 'green', sub: n.ar60 > 0 ? money0(n.ar60) + ' over 60 days' : n.ar > 0 ? 'nothing over 60 days' : 'nothing outstanding' });
    tile('bidsWeek', { num: n.bidsWeek, fmt: 'int', sub: n.bidsWeek ? 'due in the next 7 days' : 'none due this week' });
    tile('appr', { num: n.appr, fmt: 'int', st: n.appr > 0 ? 'amber' : 'green', sub: n.appr > 0 ? 'waiting on someone' : 'all caught up' });
    if (!SC.adm) return;   /* no per-PM goal exists, so a PM's page has no ring (and never the company goal) */
    var g = cache.goal, adm = true;
    if (g && Date.now() - g.at < 60000) { paintGoal(g.p, adm); return; }
    var X = W._gcX10; (X && typeof X.goal2 === 'function' ? X.goal2() : Promise.resolve(null)).then(function(r){ cache.goal = { at: Date.now(), p: r && r.p || null }; if (alive) paintGoal(r && r.p || null, adm); }, function(){ if (alive) paintGoal(null, adm); });
  }
  /* put one slide on the screen (only this one is in the page) */
  function mount(dir){
    anims = []; if (T.raf) { try { W.cancelAnimationFrame(T.raf); } catch (e) {} T.raf = 0; }
    var def = TV_PAGES.filter(function(p){ return p.k === cur; })[0], node = D.createElement('div');
    node.className = 'sl' + (dir && !reduce ? ' in' + (dir > 0 ? 'r' : 'l') : '');
    if (cur === 'company') { node.innerHTML = companyHtml; subs = 1; prev = {}; pg.textContent = ''; pg.appendChild(node); paintCompany(); }
    else { var r = TVR[cur](data(cur), sub, cfg, SC); subs = r.subs; if (sub >= subs) sub = subs - 1; node.innerHTML = r.html; pg.textContent = ''; pg.appendChild(node); }
    var en = enabled(), at = en.indexOf(cur);
    $('[data-pt]').textContent = (def ? tvLbl(def, SC) : '') + (SC.adm ? '' : ' · ' + SC.name) + (en.length > 1 ? ' · ' + (at + 1) + ' / ' + en.length : '');
    dots();
  }
  function enabled(){ return TV_PAGES.filter(function(p){ return !cfg.off[p.k]; }).map(function(p){ return p.k; }); }
  function dots(){
    var d = $('[data-dots]'), en = enabled(), h = '';
    en.forEach(function(k){ var p = TV_PAGES.filter(function(x){ return x.k === k; })[0]; h += '<button type="button" class="dot2' + (k === cur ? ' on' : '') + '" data-go="' + k + '" title="' + esc(tvLbl(p, SC)) + '" aria-label="' + esc(tvLbl(p, SC)) + '"' + (k === cur ? ' aria-current="true"' : '') + '></button>'; });
    d.innerHTML = h;
  }
  function go(k, dir){
    if (!alive) return; var en = enabled(); if (en.indexOf(k) < 0) k = en[0];
    sub = 0; cur = k; mount(dir || 0); armAdv(); lastNav = Date.now();
  }
  function step(dir, auto){
    var en = enabled(), at = Math.max(0, en.indexOf(cur));
    if (auto && dir > 0 && sub < subs - 1) { sub++; mount(1); armAdv(); return; }   /* a long list: its next part first */
    if (en.length < 2) { if (auto && subs > 1) { sub = 0; mount(1); } armAdv(); return; }
    go(en[(at + dir + en.length) % en.length], dir);
  }
  function substep(d){ var n = sub + d; if (n < 0 || n >= subs) return; sub = n; mount(d); armAdv(); }
  /* the one auto-advance timer (+ a CSS-only progress bar) */
  function armAdv(){
    try { clearTimeout(T.adv); } catch (e) {} T.adv = 0;
    var pb = $('[data-prog]'); pb.className = 'prog'; pb.style.animationDuration = '';
    if (!alive || !playing || !cfg.iv || D.hidden) return;
    void pb.offsetWidth; pb.style.animationDuration = cfg.iv + 's'; pb.className = 'prog run';
    T.adv = later(function(){ T.adv = 0; if (alive && playing) step(1, true); }, cfg.iv * 1000);
  }
  function syncUi(){
    var b = $('[data-tv="play"]'); b.textContent = playing ? '⏸' : '▶'; b.classList.toggle('paused', !playing);
    $('[data-tv="iv"]').value = String(cfg.iv);
    var pk = $('[data-pk]'); Array.prototype.forEach.call(pk.querySelectorAll('[data-pgk]'), function(c){ c.checked = !cfg.off[c.getAttribute('data-pgk')]; });
    $('[data-names]').checked = !!cfg.names;
    el.classList.toggle('paused', !playing && !!cfg.iv);
  }
  function refresh(){
    lastRef = Date.now(); delete cache.nums; delete cache[cur]; if (cur === 'company') delete cache.goal;
    if (cur === 'company') { paintCompany(); } else { mount(0); }
  }
  function clk(){
    var d = new Date(), hm = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), key = hm + d.getDate();
    if (key === clk.k) return; clk.k = key;
    var m = hm.match(/^(.*?)\s*([AP]M)$/i); $('[data-time]').innerHTML = m ? esc(m[1]) + '<small>' + esc(m[2]) + '</small>' : esc(hm);
    $('[data-date]').textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }
  function nextTick(){
    nums();
    var node = $('[data-tki]'); if (items.length) { node.textContent = items[ti % items.length]; ti++; node.classList.remove('in'); void node.offsetWidth; if (!reduce) node.classList.add('in'); }
  }
  function pickOpen(){ return !$('[data-pk]').hidden; }
  /* the one 1-second tick: clock, ticker, the 60-s refresh and hiding the control bar */
  function tick(){
    if (!alive) return;
    if (!D.body.contains(el)) { close(); return; }
    var now = Date.now(); clk();
    if (now - lastRef >= 60000) refresh();
    if (now - lastTk >= 6500) { lastTk = now; nextTick(); }
    if (now - lastMove >= 3000 && !pickOpen() && D.activeElement !== $('[data-tv="iv"]')) el.classList.add('idle');
  }
  function poke(){ lastMove = Date.now(); el.classList.remove('idle'); }
  function setPick(open){ var pk = $('[data-pk]'); pk.hidden = !open; $('[data-tv="pick"]').setAttribute('aria-expanded', open ? 'true' : 'false'); poke(); }
  function setPlaying(v){ playing = v; syncUi(); armAdv(); }
  function onKey(e){
    poke();
    var t = e.target && e.target.tagName, form = t === 'SELECT' || t === 'INPUT' || t === 'TEXTAREA';
    if (e.key === 'Escape') { if (pickOpen()) { e.stopImmediatePropagation(); setPick(false); } else close(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowRight' && t !== 'SELECT') { e.preventDefault(); e.stopImmediatePropagation(); step(1); }
    else if (e.key === 'ArrowLeft' && t !== 'SELECT') { e.preventDefault(); e.stopImmediatePropagation(); step(-1); }
    else if ((e.key === ' ' || e.code === 'Space') && !form) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) setPlaying(!playing); }
  }
  function onVis(){
    if (!alive) return;
    if (D.hidden) { try { clearInterval(T.clk); clearTimeout(T.adv); W.cancelAnimationFrame(T.raf); } catch (e) {} T.clk = T.adv = T.raf = 0; anims = []; return; }
    clk.k = ''; clk(); lastMove = Date.now();
    if (!T.clk) T.clk = every(tick, 1000);
    if (Date.now() - lastRef >= 60000) refresh(); else if (cur === 'company') paintCompany();
    armAdv();
  }
  function onClick(e){
    var b = e.target && e.target.closest ? e.target.closest('[data-tv],[data-go]') : null; if (!b) return;
    var k = b.getAttribute('data-tv'), g = b.getAttribute('data-go'); poke();
    if (g) { go(g, enabled().indexOf(g) > enabled().indexOf(cur) ? 1 : -1); b.blur(); return; }
    if (k === 'x') close(); else if (k === 'fs') { try { (el.requestFullscreen || el.webkitRequestFullscreen).call(el); } catch (x) {} }
    else if (k === 'next') { step(1); b.blur(); } else if (k === 'prev') { step(-1); b.blur(); }
    else if (k === 'sp+') substep(1); else if (k === 'sp-') substep(-1);
    else if (k === 'play') { setPlaying(!playing); b.blur(); }
    else if (k === 'pick') setPick(!pickOpen());
  }
  function onChange(e){
    var t = e.target; poke();
    if (t.getAttribute('data-tv') === 'iv') { cfg.iv = +t.value || 0; tvCfgSave(cfg); t.blur(); armAdv(); syncUi(); return; }
    if (t.hasAttribute('data-names')) { cfg.names = !!t.checked; tvCfgSave(cfg); if (cur !== 'company') mount(0); return; }
    var k = t.getAttribute('data-pgk'); if (!k) return;
    if (!t.checked) { if (enabled().length < 2) { t.checked = true; return; } cfg.off[k] = 1; } else delete cfg.off[k];
    tvCfgSave(cfg);
    if (cfg.off[cur]) go(enabled()[0], 1); else { dots(); mount(0); armAdv(); }
  }
  /* swipe: touch, or a two-finger trackpad swipe (sideways wheel) */
  function onTs(e){ var t = e.touches && e.touches[0]; swOn = !!t && !(e.target.closest && e.target.closest('.cb')); if (t) { swX = t.clientX; swY = t.clientY; } poke(); }
  function onTe(e){
    if (!swOn) return; swOn = false; var t = e.changedTouches && e.changedTouches[0]; if (!t) return;
    var dx = t.clientX - swX, dy = t.clientY - swY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }
  function onWheel(e){
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.5) return;
    e.preventDefault(); var now = e.timeStamp; if (now - whAt > 250) whAcc = 0; whAt = now; whAcc += e.deltaX;
    if (Math.abs(whAcc) > 90 && Date.now() - lastNav > 600) { var d = whAcc > 0 ? 1 : -1; whAcc = 0; step(d); }
  }
  function close(){
    alive = false; try { clearInterval(T.clk); clearTimeout(T.adv); W.cancelAnimationFrame(T.raf); } catch (e) {}
    T.clk = T.adv = T.raf = 0; anims = []; cache = {};
    try { if (D.fullscreenElement) D.exitFullscreen(); } catch (e) {}
    L.forEach(function(x){ try { x[0].removeEventListener(x[1], x[2], x[3]); } catch (e) {} }); L = [];
    el.remove(); if (TV === el) TV = null;
  }
  /* self-timing: the longest single piece of synchronous work the TV did (the page freezes if one piece is long) */
  var PF = { max: 0, at: '', n: 0 };
  function timed(name, f){ return function(){ var t = W.performance.now(); try { return f.apply(this, arguments); } finally { var d = W.performance.now() - t; PF.n++; if (d > PF.max) { PF.max = Math.round(d * 10) / 10; PF.at = name; } } }; }
  mount = timed('mount', mount); tick = timed('tick', tick); refresh = timed('refresh', refresh);
  el.__close = close; el.__timers = function(){ return { iv: 0, clk: T.clk, tick: 0, adv: T.adv, raf: T.raf, tick2: 0, alive: alive }; };
  el.__tv = { perf: function(){ return PF; }, refresh: function(){ refresh(); }, scope: function(){ return SC; }, go: function(k){ go(k, 1); }, state: function(){ return { cur: cur, sub: sub, subs: subs, playing: playing, iv: cfg.iv, names: cfg.names, pages: enabled(), idle: el.classList.contains('idle') }; }, cfg: function(){ return cfg; } };
  on(el, 'click', onClick); on(el, 'change', onChange);
  on(el, 'mousemove', poke); on(el, 'mousedown', poke); on(el, 'touchstart', onTs, { passive: true }); on(el, 'touchend', onTe, { passive: true }); on(el, 'wheel', onWheel, { passive: false });
  on(W, 'keydown', onKey, true);   /* capture: the CRM's own ← → (back / forward) must not see these keys */ on(D, 'visibilitychange', onVis);
  D.body.appendChild(el); TV = el;
  clk(); syncUi();
  var en = enabled(); cur = en[0]; mount(0); nextTick(); lastTk = Date.now();
  T.clk = every(tick, 1000); armAdv();
  return el;
}
"""

# 1. CSS: add the slide / control-bar rules after the ticker note rule
anchor = "    '.gc-a8-tv .tk .note{font-size:.8em;color:#8fb3de;white-space:nowrap}',\n"
src = once(src, anchor, anchor + CSS)

# 2. replace tv() (the single-page scoreboard) by the slideshow
a_mark = "function tv(){\n  css();\n  if (TV) { try { TV.__close(); } catch (e) { TV.remove(); } TV = null; }\n  var T = { iv: 0, clk: 0, tick: 0, raf: 0 }"
z_mark = "  T.iv = every(function(){ if (!D.body.contains(el)) { close(); return; } paint(); }, 60000);\n  return el;\n}\n"
assert src.count(a_mark) == 1 and src.count(z_mark) == 1, (src.count(a_mark), src.count(z_mark))
a = src.index(a_mark); z = src.index(z_mark) + len(z_mark)
assert a < z and z - a < 20000, (a, z)
src = src[:a] + JS + src[z:]

# 0. the numbers and the ticker take a scope (admin: whole company; anyone else: only what is theirs)
src = once(src, "function tvNumbers(){\n  var now = Date.now(), wk = now - 7 * 864e5, q = now - 90 * 864e5, mo = today().slice(0, 7);\n  var L = leads().filter(function(l){ return l && l.id && !l.deleted; });",
                "function tvNumbers(sc){\n  var now = Date.now(), wk = now - 7 * 864e5, q = now - 90 * 864e5, mo = today().slice(0, 7), all = !sc || sc.adm, MP = {};\n  if (!all) projects().forEach(function(p){ if (p && p.id && tvMineJob(p, sc)) MP[p.id] = 1; });\n  var L = leads().filter(function(l){ return l && l.id && !l.deleted && (all || tvMineLead(l, sc)); });")
src = once(src, "var jobs = projects().filter(function(p){ return activeJob(p) && !/bid|estimat|lead|pending/i.test(s(p.status)); }).length;",
                "var jobs = projects().filter(function(p){ return activeJob(p) && !/bid|estimat|lead|pending/i.test(s(p.status)) && (all || MP[p.id]); }).length;")
src = once(src, "  invs().forEach(function(iv){\n    if (!iv || iv.deleted || iv.type === 'sub' || iv.sub || /void|draft|cancel/i.test(s(iv.status))) return;\n    arr(iv.payments).forEach(function(p){ if (s(p && (p.date || p.paidDate)).slice(0, 7) === mo) collected",
                "  invs().forEach(function(iv){\n    if (!iv || iv.deleted || iv.type === 'sub' || iv.sub || /void|draft|cancel/i.test(s(iv.status)) || !(all || MP[iv.pid])) return;\n    arr(iv.payments).forEach(function(p){ if (s(p && (p.date || p.paidDate)).slice(0, 7) === mo) collected")
src = once(src, "var appr = 0; try { appr = typeof W._gcApprovalCount === 'function' ? num(W._gcApprovalCount()) : 0; } catch (e) {}",
                "var appr = 0; try { appr = all && typeof W._gcApprovalCount === 'function' ? num(W._gcApprovalCount()) : 0; } catch (e) {}")
src = once(src, "function tvTicker(n){\n  var out = [],", "function tvTicker(n, sc){\n  if (sc && !sc.adm) return tvTickerMe(n);\n  var out = [],")

# 3. lead dates: the CRM's older leads carry `created` (the Company tile and the ticker missed them)
src = once(src, "var t = Date.parse(l.createdAt || l.receivedAt || (s(l.date) ? s(l.date) + 'T12:00:00' : '')); return isFinite(t) && t >= wk; }).length;",
                "var t = Date.parse(l.createdAt || l.receivedAt || l.created || (s(l.date) ? s(l.date) + 'T12:00:00' : '')); return isFinite(t) && t >= wk; }).length;")
src = once(src, "var t = Date.parse(l.createdAt || l.receivedAt || (s(l.date) ? s(l.date) + 'T12:00:00' : '')); if (!isFinite(t) || t < wk) return;",
                "var t = Date.parse(l.createdAt || l.receivedAt || l.created || (s(l.date) ? s(l.date) + 'T12:00:00' : '')); if (!isFinite(t) || t < wk) return;")

open(P, 'w', encoding='utf-8').write(src)
print('patched')
