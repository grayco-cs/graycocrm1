// test_MITWS.mjs <build-dir> — owner 11/12: Mitigation and Environmental tailored (patch MITWS): the left menu per company × role (the
// combined 💧 Mitigation / ☢️ Environmental tab only for admins; their people get the tools as their own tabs), each tool tab opening the
// existing tool at the right place, the Dashboard cards, the field buttons, 📐 PlanBuilder, 🏠 RoofScout on Leads, 🧭 GrayCo Systems
// without RoofScout on Mitigation / Environmental, each company's 📺 office TV and 🖥 lobby. Offline harness, made-up data.
// MITWS_SHOTS=<dir> → screenshots (deviceScaleFactor 2) + index.txt.
import fs from 'fs';
import { createRequire } from 'module';
/* screenshots: MITWS_HARNESS may point at a copy of the harness whose desktop context takes GC_DSF=2 (deviceScaleFactor 2) */
const { computer, signIn, sleep, cset, cget, resetCloud, waitFor } = await import(process.env.MITWS_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 500) : '')); };
const BUILD = process.argv[2], SHOT = process.env.MITWS_SHOTS || '', IDX = [];
if (SHOT) fs.mkdirSync(SHOT, { recursive: true });
const shot = async (A, name, what, o) => { if (!SHOT) return; await A.page().screenshot(Object.assign({ path: SHOT + '/' + name + '.png' }, o || {})); IDX.push(name + '.png — ' + what); };
const hiDpi = async (A, w, h) => { if (SHOT) await A.page().setViewportSize({ width: w, height: h }); };
resetCloud();
const now = new Date().toISOString(), d2 = new Date(Date.now() - 2 * 864e5).toISOString();
const USERS = role => [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Sam Biffle', email: 'sbiffle@grayco-cs.com', role, active: true, companies: [/^(Environmental|Abatement)/.test(role) ? 'environmental' : 'mitigation'] },
  { id: 'u3', name: 'Molly Demo', email: 'molly.demo@grayco-cs.com', role: 'Mitigation Technician', active: true, companies: ['mitigation'] },
  { id: 'u4', name: 'Pat Demo', email: 'pat.demo@grayco-cs.com', role: 'Project Manager', active: true },
  { id: 'u5', name: 'Eve Demo', email: 'eve.demo@grayco-cs.com', role: 'Environmental Technician', active: true, companies: ['environmental'] }];
cset('users', USERS('Mitigation PM'));
cset('projects', [
  { id: 'M1', name: 'Demo Ross basement', client: 'Demo Ross', status: 'active', type: 'Water Damage', companyId: 'mitigation', pm: 'Sam Biffle', mitTech: 'Molly Demo', updatedAt: now },
  { id: 'M2', name: 'Demo Cox kitchen leak', client: 'Demo Cox', status: 'active', type: 'Water Damage', companyId: 'mitigation', pm: 'Sam Biffle', updatedAt: now },
  { id: 'E1', name: 'Demo Kline trim', client: 'Demo Kline', status: 'active', type: 'Environmental', companyId: 'environmental', notes: 'House built 1962 — lead paint on the window trim', pm: 'Sam Biffle', updatedAt: now },
  { id: 'C1', name: 'Demo Smith deck', client: 'Demo Smith', status: 'active', type: 'Residential Reno', contract: 12000, pm: 'Pat Demo', updatedAt: now }]);
cset('leads', [{ id: 'L1', name: 'Demo roof lead', client: 'Demo Roofer', type: 'Roofing', stage: 'New Lead', createdAt: now, updatedAt: now },
  { id: 'L2', name: 'Demo water emergency', client: 'Demo Flood', type: 'Water Damage', companyId: 'mitigation', stage: 'New Lead', emergency: true, createdAt: now, updatedAt: now }]);
cset('gc_claims', [{ id: 'CL1', projectId: 'M1', title: 'Demo Ross basement', phase: 'Work', scope: 'mitigation', jobType: 'water', carrier: 'Demo Mutual', claimNumber: 'D-100', createdAt: d2, updatedAt: now,
  adjusterMeetingAt: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 16),
  equipment: [{ id: 'e1', kind: 'airmover', room: 'Basement', qty: 4, placedAt: d2 }, { id: 'e2', kind: 'dehu', room: 'Basement', qty: 1, placedAt: d2 }],
  moisture: [{ id: 'm1', room: 'Basement', material: 'Drywall', point: 'N1', reading: 30, goal: 12, date: d2.slice(0, 10) }] }]);
const navOf = A => A.ev(() => [...document.querySelectorAll('aside nav button, aside button, nav button')].filter(b => b.offsetParent && !b.closest('#gc-ra-dock,#gc-fh-tabs')).map(b => b.innerText.replace(/\s+/g, ' ').replace(/\s\d+$/, '').trim()).filter(x => x && x !== '☰' && x !== 'Sign Out'));
const fullCrm = A => A.ev(() => { const b = document.querySelector('#gc-ra-desk [data-ra-a="full"]'); if (b) b.click(); });
const mountText = A => A.ev(() => { const m = document.getElementById('gc-mws-mount'); return m ? m.innerText : ''; });
const setCo = async (A, c) => { await A.ev(c => window._gcCo.setFilter(c), c); await sleep(2200); };

/* ═══ 1. ADMIN ═══ */
const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(8000);
await fullCrm(A); await sleep(800);
let n = await navOf(A);
ok('All companies (admin): the menu as before — RoofScout, Bid portal, Cordova Club — plus 📐 PlanBuilder right after RoofScout', n.includes('🏠 RoofScout') && n.includes('🏗 Bid portal') && n.includes('🏢 Cordova Club') && n.indexOf('📐 PlanBuilder') === n.indexOf('🏠 RoofScout') + 1 && !n.some(x => /Drying jobs|Moisture readings/.test(x)), n.slice(0, 14));
await setCo(A, 'mitigation'); await A.ev(() => window._setView('projects')); await sleep(1500);
n = await navOf(A);
const want = ['▣ Dashboard', '✅ To-Do', '💧 Mitigation', '🚨 Emergencies & on call', '💧 Drying jobs', '📈 Moisture readings', '📋 Daily drying logs', '🌀 Equipment', '🧮 Drying calculator', '✍️ Work authorizations', '🛡 Claims & adjusters', '🧪 Materials & SDS', '◫ Projects', '◧ Schedule'];
ok('Mitigation picked (admin): Dashboard, To-Do, the combined 💧 Mitigation tab, then the tools as their own tabs in work order, 🧪 SDS, Projects, Schedule', JSON.stringify(n.slice(0, want.length)) === JSON.stringify(want), n.slice(0, 16));
const hidden = ['RoofScout', 'Permitted jobs', 'Bid portal', 'Cordova Club', 'Launch Job', 'Scopes', 'Site Book', 'Punch List', 'Crew Board', 'Daily Logs', 'Change Orders', 'Warranties', 'Large Job CRMs', 'Environmental', 'Products'];
ok('… Construction-only tabs hidden (RoofScout, Bid portal, Cordova, Launch Job, Scopes, Site Book, Punch List, Crew Board, Daily Logs, Change Orders, Warranties, Products, ☢️ Environmental); 📐 PlanBuilder, Estimates, Invoices, Accounting, Payroll, Admin kept', !n.some(x => hidden.some(h => x.includes(h))) && ['📐 PlanBuilder', '📐 Estimates', '▥ Invoices', '📊 Accounting', '💵 Payroll', '⚙ Admin', '◈ Leads'].every(x => n.includes(x)), n);
await hiDpi(A, 1440, 1320);
await shot(A, 'mit_menu_admin', 'Mitigation picked — the left menu as admin/owner (the combined 💧 Mitigation tab kept, the tools as their own tabs)');
await hiDpi(A, 1440, 900);
/* the tool tabs open the existing tools */
const TAB = { mws_jobs: /Drying jobs[\s\S]*ACTIVE DRYING JOBS/i, mws_read: /Moisture readings[\s\S]*Demo Ross basement[\s\S]*Day 3/, mws_log: /Daily drying logs[\s\S]*Demo Ross basement/, mws_equip: /Equipment[\s\S]*Air movers out\s*4[\s\S]*Dehumidifiers out\s*1/i,
  mws_calc: /Drying calculator[\s\S]*GPP/, mws_auth: /Work authorizations[\s\S]*missing/, mws_claims: /Claims & adjusters[\s\S]*Demo Mutual · #D-100/, mws_emerg: /Emergencies & on call[\s\S]*Emergency calls \(1\)[\s\S]*Demo Flood[\s\S]*First-response checklist/ };
for (const v of Object.keys(TAB)) { await A.ev(v => window._setView(v), v); await sleep(1700); const t = await mountText(A); ok('tab ' + v + ' opens its tool', TAB[v].test(t), t.slice(0, 160)); }
await A.ev(() => window._setView('mws_jobs')); await sleep(1500);
ok('💧 Drying jobs = the claims app\'s own mitigation board (+ New mitigation job) and the job with no drying file yet ("＋ Start the drying file")', await A.ev(() => !!document.querySelector('#gc-mws-mount [data-gcbb] [data-a="mitnew"]') && /Start the drying file/.test(document.getElementById('gc-mws-mount').innerText) && /Demo Cox kitchen leak/.test(document.getElementById('gc-mws-mount').innerText)));
await A.ev(() => window._setView('mws_read')); await sleep(1500);
await A.ev(() => document.querySelector('#gc-mws-mount [data-mws-go="drying"][data-pid="M1"]').click()); await sleep(1500);
let sub = await A.ev(() => ({ form: !!document.querySelector('#gc-mws-mount [data-mws-sub] .gcbb-moistform'), back: !!document.querySelector('#gc-mws-mount [data-mws-back]'), flash: !!document.querySelector('#gc-mws-mount .mws-flash') }));
ok('📈 ➕ Reading → the job\'s drying file opens in the tab on the moisture-reading form (the claims app\'s own panel), with ‹ Back', sub.form && sub.back, sub);
await shot(A, 'mit_tab_reading', '📈 Moisture readings → ➕ Reading: the drying file\'s own moisture form, inside the tab');
await A.ev(() => document.querySelector('#gc-mws-mount [data-mws-back]').click()); await sleep(800);
ok('‹ Back → the readings list again', /Moisture points per job/.test(await mountText(A)));
await A.ev(() => window._setView('mws_equip')); await sleep(1500);
await A.ev(() => document.querySelector('#gc-mws-mount [data-mws-go="drying"][data-pid="M1"]').click()); await sleep(1500);
ok('🌀 Place / remove → the drying file on its equipment form', await A.ev(() => !!document.querySelector('#gc-mws-mount [data-mws-sub] .gcbb-eqform')));
await A.ev(() => window._setView('mws_equip')); await sleep(1200);
await A.ev(() => document.querySelector('#gc-mws-mount [data-mws-go="drying"][data-pid="M2"]') && document.querySelector('#gc-mws-mount [data-mws-go="drying"][data-pid="M2"]').click()); await sleep(1200);
await A.ev(() => window._setView('mws_jobs')); await sleep(1200);
await A.ev(() => document.querySelector('#gc-mws-mount [data-mws-go="drying"][data-pid="M2"]').click()); await sleep(1500);
ok('a job with no drying file → the claims app\'s "new claim" screen for that job, scope Mitigation', await A.ev(() => { const r = document.querySelector('#gc-mws-mount [data-mws-sub]'); const sc = r && r.querySelector('select[name="scope"]'); return !!sc && sc.value === 'mitigation'; }));
/* calculator */
await A.ev(() => window._setView('mws_calc')); await sleep(1200);
const calc = await A.ev(() => { const r = document.getElementById('gc-mws-mount'), set = (k, v) => { const i = r.querySelector('[data-mws-k="' + k + '"]'); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); };
  set('tempF', 75); set('rh', 60); set('tempF2', 90); set('rh2', 25); set('l', 14); set('w', 12); set('wetFloorSF', 168); set('wetWallSF', 120); set('wickH', 3);
  const p2 = window._gcClaims.p2, plan = p2.equipmentPlan({ rooms: [{ id: 'x', name: 'R', l: 14, w: 12, h: 8, wetFloorSF: 168, wetWallSF: 120, wickH: 3 }], jobType: 'water', water: { category: '', class4: false, dehuUnit: 'lgr2800' } }, p2.eqCfg(window._gcClaims.settings()));
  return { gpp: r.querySelector('[data-mws-gpp]').textContent, want: p2.gpp(75, 60) + ' GPP', drop: r.querySelector('[data-mws-drop]').textContent, wantDrop: String(Math.round((p2.gpp(75, 60) - p2.gpp(90, 25)) * 10) / 10), am: r.querySelector('[data-mws-am]').textContent, wantAm: String(plan.airMovers), dh: r.querySelector('[data-mws-dh]').textContent, wantDh: String(plan.dehu.units) }; });
ok('🧮 calculator: GPP, GPP drop, air movers and dehumidifiers = the claims app\'s own numbers (p2.gpp / equipmentPlan)', calc.gpp === calc.want && calc.drop === calc.wantDrop && calc.am === calc.wantAm && calc.dh === calc.wantDh, calc);
await shot(A, 'mit_tab_calculator', '🧮 Drying calculator (GPP / dew point / GPP drop + IICRC equipment count)');
/* emergency checklist */
await A.ev(() => window._setView('mws_emerg')); await sleep(1300);
await A.ev(() => document.querySelector('#gc-mws-mount [data-mws-echk="M1"]').click()); await sleep(600);
await A.ev(() => { const c = document.querySelector('#gc-mws-sheet [data-mws-ek="safe"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(2500);
const em = await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'M1'); return { at: p.mitEmerg && p.mitEmerg.items.safe && p.mitEmerg.items.safe.at, by: p.mitEmerg && p.mitEmerg.items.safe.by, txt: document.querySelector('#gc-mws-sheet').innerText.slice(0, 60) }; });
const emc = (cget('projects') || []).find(p => p.id === 'M1');
ok('🚨 first-response checklist: a tick is saved on the job (job.mitEmerg, who / when) and reaches the cloud', !!em.at && em.by === 'Wesley Johnson' && /1 of 13 done/.test(em.txt) && !!(emc && emc.mitEmerg && emc.mitEmerg.items.safe), em);
await A.ev(() => document.querySelector('#gc-mws-sheet [data-mws-x]').click());
/* dashboard */
await A.ev(() => window._setView('dashboard')); await sleep(3500);
const dc = await A.ev(() => { const d = document.getElementById('gc-mws-dash'); if (!d) return null; const c = k => { const x = [...d.querySelectorAll('[data-mws-card]')].filter(y => y.querySelector('.l').textContent.includes(k))[0]; return x ? x.querySelector('b').textContent : null; };
  const kpi = [...document.querySelectorAll('#root main div, #root main span')].find(x => !x.closest('#gc-mws-dash') && /^REVENUE \(BILLED\)$/i.test((x.innerText || '').trim()));
  return { losses: c('Active water losses'), due: c('Readings due today'), eq: c('Equipment on jobs'), days: c('Drying days'), claims: c('Claims waiting'), em: c('Emergencies'), meet: /1 adjuster meeting this week/.test(d.innerText), above: !!kpi && !!(d.compareDocumentPosition(kpi) & 4) }; });
ok('Mitigation Dashboard: its own cards on top (above the money boxes) — 2 active water losses, drying day 3, 1 reading due, 5 pieces of equipment, the adjuster meeting this week, 1 emergency call', dc && dc.losses === '2' && dc.days === '3' && dc.due === '1' && dc.eq === '5' && dc.meet && dc.em === '1' && dc.above, dc);
await hiDpi(A, 1440, 1000);
await shot(A, 'mit_dashboard', 'Mitigation Dashboard (admin, Mitigation picked): the 💧 Mitigation today cards on top');
await hiDpi(A, 1440, 900);
await A.ev(() => document.querySelector('#gc-mws-dash [data-mws-card="mws_equip"]').click()); await sleep(1200);
ok('a card opens its tool tab (🌀 Equipment on jobs → 🌀 Equipment)', await A.ev(() => localStorage.getItem('grayco_view') === 'mws_equip'));
/* PlanBuilder */
await A.ev(() => window._setView('planbuilder')); await sleep(1200);
const pb = await A.ev(() => { const m = document.getElementById('gc-pb-mount'); return m && { src: (m.querySelector('iframe') || {}).getAttribute?.('src'), link: (m.querySelector('a[target="_blank"]') || {}).getAttribute?.('href'), txt: m.innerText.slice(0, 300) }; });
ok('📐 PlanBuilder opens inside the CRM (planbuilder/ in a frame) with "Open in a new window"', pb && pb.src === '/planbuilder/' && pb.link === '/planbuilder/' && /Open in a new window/.test(pb.txt), pb);
await shot(A, 'planbuilder_tab', '📐 PlanBuilder tab (Mitigation picked) — planbuilder/ inside the CRM with Open in a new window (the offline test server has no PlanBuilder files, so the frame is empty here)');
/* Leads: RoofScout */
await A.ev(() => window._setView('leads')); await waitFor(A, () => !!document.querySelector('#gc-leads-hub [data-gcl-v]'), null, 15000);
ok('Leads on Mitigation: no 🏠 RoofScout view', await A.ev(() => !!document.getElementById('gc-leads-hub') && !document.querySelector('#gc-leads-hub [data-gcl-v="roofscout"]')));
await setCo(A, 'construction'); await A.ev(() => window._setView('leads')); await waitFor(A, () => !!document.querySelector('#gc-leads-hub [data-gcl-v="roofscout"]'), null, 15000);
await A.ev(() => { const b = document.querySelector('#gc-leads-hub [data-gcl-v="roofscout"]'); b && b.click(); }); await sleep(1500);
const rs = await A.ev(() => { const w = document.getElementById('gcl-rs-wrap'), v = [...document.querySelectorAll('#gc-leads-hub [data-gcl-v]')].map(b => b.textContent); return { views: v, frame: w && w.offsetParent ? w.querySelector('iframe').getAttribute('src') : null, on: (document.querySelector('#gc-leads-hub [data-gcl-v="roofscout"]') || {}).className }; });
ok('Leads on Construction: 🏠 RoofScout in the views row (Board · List · Calendar · Map · … · RoofScout); it opens RoofScout under the Leads header', rs.views.join('|').includes('🏠 RoofScout') && rs.views[0] === '🗂 Board' && rs.frame === '/roofscout/' && /on/.test(rs.on || ''), rs);
await shot(A, 'leads_roofscout_tab', 'Leads (Construction) → 🏠 RoofScout view');
await A.ev(() => { const b = document.querySelector('#gc-leads-hub [data-gcl-v="list"]'); b && b.click(); }); await sleep(1000);
ok('… back to List: RoofScout is put away', await A.ev(() => { const w = document.getElementById('gcl-rs-wrap'); return !w || w.style.display === 'none'; }));
n = await navOf(A);
ok('Construction picked: the left-menu 🏠 RoofScout stays (for now)', n.includes('🏠 RoofScout'), n.slice(0, 10));
/* GrayCo Systems + the TVs */
await setCo(A, 'mitigation'); await A.ev(() => window._setView('systems')); await sleep(2000);
const sys = await A.ev(() => [...document.querySelectorAll('#gc-sys-sys-mount [data-sys="tile"]')].map(b => b.getAttribute('data-k')));
ok('🧭 GrayCo Systems on Mitigation: no RoofScout; the TVs are there', !sys.includes('roofscout') && sys.includes('tv') && sys.includes('lobbyed'), sys);
await A.ev(() => document.querySelector('#gc-sys-sys-mount [data-k="tv"]').click()); await sleep(700);
const pick = await A.ev(() => [...document.querySelectorAll('#gc-mws-sheet [data-mws-tvco]')].map(b => b.getAttribute('data-mws-tvco') + ':' + b.textContent.trim()));
ok('📺 Back office TV (admin): a company picker — 🏗 Construction · 💧 Mitigation · ☢️ Environmental — and each TV\'s own link (#tv=mitigation …)', pick.length === 3 && /construction/.test(pick[0]) && /mitigation/.test(pick[1]) && /environmental/.test(pick[2]) && await A.ev(() => /#tv=mitigation/.test(document.getElementById('gc-mws-sheet').innerText)), pick);
await shot(A, 'systems_tv_picker', '🧭 GrayCo Systems (Mitigation picked, admin): no RoofScout; 📺 Back office TV → company picker');
await A.ev(() => document.querySelector('#gc-mws-sheet [data-mws-tvco="mitigation"]').click()); await sleep(2500);
const tvm = await A.ev(() => { const t = document.getElementById('gc-otv'); const E = window._gcOTV.el(); E.__go('costats'); return new Promise(r => setTimeout(() => { const slide = t.querySelector('.sl.in[data-slide]') || t.querySelector('[data-slide]'); r({ co: t.getAttribute('data-co'), logo: t.querySelector('.hd img').getAttribute('src'), dots: [...t.querySelectorAll('[data-dots] button')].map(b => b.textContent), stat: t.querySelector('[data-bd]').innerText.replace(/\s+/g, ' ').slice(0, 300) }); }, 900)); });
ok('💧 Mitigation office TV: its logo, its slides (Goals · Mitigation · Team leaderboard · This week) and its numbers — 2 active water losses (its own jobs only), equipment 5', tvm.co === 'mitigation' && /mitigation-logo/.test(tvm.logo) && tvm.dots.join('|') === 'Goals|Mitigation|Team leaderboard|This week' && /Active water losses 2/i.test(tvm.stat) && /Equipment on jobs 5/i.test(tvm.stat), tvm);
await hiDpi(A, 1440, 810);
await shot(A, 'tv_office_mitigation', '📺 Back office TV — GrayCo Mitigation: its own numbers slide');
const bd = await A.ev(() => { window._gcOTV.el().__go('board'); return new Promise(r => setTimeout(() => r(document.querySelector('#gc-otv [data-bd]').innerText), 900)); });
ok('… its leaderboard: Mitigation\'s people (Sam, Molly; owners in every company) — not the Construction PM', /Molly Demo/.test(bd) && /Sam Biffle/.test(bd) && !/Pat Demo/.test(bd) && !/Eve Demo/.test(bd), bd.slice(0, 300));
await shot(A, 'tv_office_mitigation_board', '📺 Back office TV — GrayCo Mitigation: Team leaderboard (Mitigation\'s people only)');
await A.ev(() => window._gcOTV.close()); await sleep(500);
await A.ev(() => window._gcMitWS.openTV('tv', 'environmental')); await sleep(2000);
const tve = await A.ev(() => { window._gcOTV.el().__go('costats'); return new Promise(r => setTimeout(() => r({ co: document.getElementById('gc-otv').getAttribute('data-co'), txt: document.querySelector('#gc-otv [data-bd]').innerText.replace(/\s+/g, ' ') }), 900)); });
ok('☢️ Environmental office TV: active hazard jobs, clearances, samples, waste, notices', tve.co === 'environmental' && /Active hazard jobs 1/i.test(tve.txt) && /Clearances passed/i.test(tve.txt) && /Waste loads shipped/i.test(tve.txt), tve);
await shot(A, 'tv_office_environmental', '📺 Back office TV — GrayCo Environmental: its own numbers slide');
await A.ev(() => window._gcOTV.close()); await sleep(400);
await A.ev(() => window._gcMitWS.openTV('tv', 'construction')); await sleep(2000);
const tvc = await A.ev(() => { const t = document.getElementById('gc-otv'); window._gcOTV.el().__go('board'); return new Promise(r => setTimeout(() => r({ co: t.getAttribute('data-co'), dots: [...t.querySelectorAll('[data-dots] button')].map(b => b.textContent), bd: t.querySelector('[data-bd]').innerText }), 900)); });
ok('🏗 Construction office TV unchanged: no company, Goals · PM leaderboard · Scoreboard · This week, the PM (Pat) on the board', !tvc.co && tvc.dots.join('|') === 'Goals|PM leaderboard|Scoreboard|This week' && /Pat Demo/.test(tvc.bd) && !/Molly Demo/.test(tvc.bd), tvc.dots);
await shot(A, 'tv_office_construction', '📺 Back office TV — GrayCo Construction (unchanged)');
await A.ev(() => window._gcOTV.close()); await sleep(400);
await hiDpi(A, 1440, 900);
await A.ev(() => window._gcMitWS.openTV('lobbyed', 'mitigation')); await sleep(2500);
await A.ev(() => { const b = document.querySelector('#gc-lob [data-tab="link"]'); b && b.click(); }); await sleep(500);
await A.ev(() => { const b = document.querySelector('#gc-lob [data-a="newlink"]'); b && b.click(); }); await sleep(2500);
const lob = await A.ev(() => ({ top: document.querySelector('#gc-lob .top b').textContent, link: (document.querySelector('#gc-lob [data-link]') || {}).value || '' }));
const acc = cget('gc_lobby_access__mitigation'), acc0 = cget('gc_lobby_access');
ok('🖥 lobby TV for Mitigation: its own editor ("Lobby TV · GrayCo Mitigation, LLC"), its own link (…#t=…&co=mitigation) saved under gc_lobby_access__mitigation; Construction\'s lobby untouched', /GrayCo Mitigation/.test(lob.top) && /lobby\.html#t=[A-Za-z0-9_-]{30,}&co=mitigation$/.test(lob.link) && acc && acc.on === true && !acc0, { lob, acc: !!acc, acc0: !!acc0 });
await shot(A, 'tv_lobby_mitigation_link', '🖥 Front room (lobby) TV editor — GrayCo Mitigation: its own lobby link');
await A.ev(() => { const x = document.querySelector('#gc-lob [data-a="x"]'); x && x.click(); }); await sleep(400);
/* Environmental, admin */
await setCo(A, 'environmental'); await A.ev(() => window._setView('projects')); await sleep(1500);
n = await navOf(A);
const wantE = ['▣ Dashboard', '✅ To-Do', '☢️ Environmental', '☣️ Hazard jobs', '🔬 Surveys & testing', '🌫 Air monitoring & clearance', '🚧 Containment & PPE', '🛢 Waste manifests', '📨 Notifications', '📜 Certs, papers & rules', '🧪 Materials & SDS', '◫ Projects'];
ok('Environmental picked (admin): the combined ☢️ Environmental tab, then its tools as tabs, no 💧 Mitigation, no RoofScout', JSON.stringify(n.slice(0, wantE.length)) === JSON.stringify(wantE) && !n.some(x => /RoofScout|💧 Mitigation|Drying jobs/.test(x)), n.slice(0, 14));
await hiDpi(A, 1440, 1320);
await shot(A, 'env_menu_admin', 'Environmental picked — the left menu as admin/owner');
await hiDpi(A, 1440, 900);
await A.ev(() => window._setView('ews_air')); await sleep(1500);
await A.ev(() => { const f = document.querySelector('#gc-mws-mount form[data-mws-env="air"]'), v = (k, x) => { f.querySelector('[data-mws-f="' + k + '"]').value = x; };
  v('pid', 'E1'); v('type', 'Clearance'); v('loc', 'Kitchen'); v('method', 'Lead dust wipe (µg/ft²)'); v('result', '4 µg/ft²'); v('limit', '10 µg/ft²'); v('pass', 'Pass'); f.requestSubmit(); }); await sleep(2500);
const al = await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'E1'); return { log: (p.envLog || []).map(r => r.kind + ':' + r.type + ':' + r.pass + ':' + r.by), txt: document.getElementById('gc-mws-mount').innerText }; });
ok('🌫 an air / clearance sample is saved on the job (job.envLog) and listed with Pass', al.log.join() === 'air:Clearance:Pass:Wesley Johnson' && /Kitchen/.test(al.txt) && /Pass/.test(al.txt), al.log);
await shot(A, 'env_tab_air', '🌫 Air monitoring & clearance — a clearance sample logged');
await A.ev(() => window._setView('ews_jobs')); await sleep(1300);
ok('☣️ Hazard jobs: the lead job with its last sample (Pass)', /Demo Kline trim[\s\S]*Lead[\s\S]*Pass/.test(await mountText(A)));
await A.ev(() => window._setView('ews_papers')); await sleep(1200);
ok('📜 Certs, papers & rules: ☢️ Environmental\'s own cards (programs, EPA / OSHA / state links)', await A.ev(() => /Lead safety program/.test(document.getElementById('gc-mws-mount').innerText) && /OSHA/.test(document.getElementById('gc-mws-mount').innerText)));
await A.page().mouse.move(700, 300); await A.page().mouse.move(720, 320);   /* a person at the computer (idle pacing slows the timers after a minute without input) */
await A.ev(() => window._setView('dashboard')); await waitFor(A, () => !!document.getElementById('gc-mws-dash'), null, 40000);
const de = await A.ev(() => (document.getElementById('gc-mws-dash') || {}).innerText || '');
ok('Environmental Dashboard: its cards (1 hazard job, 1 air sample, 1 clearance passed this month, waste, notices, certifications)', /Environmental today/.test(de) && /ACTIVE HAZARD JOBS\s*1/i.test(de) && /CLEARANCES PASSED\s*1/i.test(de) && /WASTE MANIFESTS OPEN\s*0/i.test(de), de.slice(0, 300));
await shot(A, 'env_dashboard', 'Environmental Dashboard (admin, Environmental picked)');
await setCo(A, 'all');
const lh = cget('projects');
ok('the cloud has the job changes (envLog)', (lh || []).find(p => p.id === 'E1').envLog.length === 1);
await A.b.close();

/* ═══ 2. MITIGATION PM (Admin → Employees role "Mitigation PM") ═══ */
const B = await computer('sbiffle@grayco-cs.com', { build: BUILD });
B.page().on('pageerror', e => errs.push('B ' + String(e.message).slice(0, 200)));
await signIn(B, 'sbiffle@grayco-cs.com', 15000); await sleep(9000);
const ra = await B.ev(() => window._gcRA.state());
ok('Mitigation PM on a computer: the role app is "Mitigation" (its own desk home)', ra.app === 'mit' && ra.desk === true, ra);
const dk = await B.ev(() => ({ tiles: [...document.querySelectorAll('#gc-ra-desk .gc-ra-tiles [data-ra-a]')].map(b => b.getAttribute('data-ra-a')), cards: (document.getElementById('gc-mws-dash-ra') || {}).innerText || '' }));
ok('… its desk home: the field buttons (reading, photos, equipment, daily log, work auth, notes, clock, emergency) and the Mitigation-today cards', dk.tiles.join() === 'mws_read,mws_photos,mws_equip,mws_log,mws_auth,mws_note,clock,mws_emerg' && /ACTIVE WATER LOSSES/i.test(dk.cards), dk);
await fullCrm(B); await sleep(1000);
n = await navOf(B);
ok('Mitigation PM menu: the tools as their own tabs, NO combined 💧 Mitigation tab, no ☢️ Environmental, no RoofScout — whatever company is picked (All)', n.includes('💧 Drying jobs') && n.includes('📈 Moisture readings') && n.includes('🛡 Claims & adjusters') && n.includes('🧮 Drying calculator') && !n.includes('💧 Mitigation') && !n.some(x => /Environmental|RoofScout|Bid portal/.test(x)) && n.includes('◫ Projects') && n.includes('◧ Schedule') && n.includes('👥 Customers'), n);
await hiDpi(B, 1440, 1100);
await shot(B, 'mit_menu_pm', 'Mitigation PM (role "Mitigation PM"): the left menu — the tools, no combined Mitigation tab');
await hiDpi(B, 1440, 900);
await B.ev(() => window._setView('mitigation')); await sleep(1500);
ok('asking for the combined tab opens 💧 Drying jobs instead', await B.ev(() => localStorage.getItem('grayco_view') === 'mws_jobs' && !!document.getElementById('gc-mws-mount')));
await B.ev(() => window._setView('customers')); await sleep(1500);
ok('… and the screens on their menu open (👥 Customers)', await B.ev(() => localStorage.getItem('grayco_view') === 'customers'));
await B.ev(() => window._setView('dashboard')); await sleep(3000);
ok('their Dashboard has the Mitigation cards even with All companies picked', await B.ev(() => /Mitigation today/.test((document.getElementById('gc-mws-dash') || {}).innerText || '')));
await B.b.close();

/* ═══ 3. MITIGATION TECH — computer (menu) and phone (GrayCo Field) ═══ */
cset('users', USERS('Mitigation Technician'));
const T = await computer('sbiffle@grayco-cs.com', { build: BUILD });
T.page().on('pageerror', e => errs.push('T ' + String(e.message).slice(0, 200)));
await signIn(T, 'sbiffle@grayco-cs.com', 15000); await sleep(9000);
await fullCrm(T); await sleep(1000);
n = await navOf(T);
ok('Mitigation tech menu: the field tools (Drying jobs, Moisture readings, Daily drying logs, Equipment, Calculator, Work authorizations, Emergencies, SDS) — no claims / money / customers, no combined tab', ['💧 Drying jobs', '📈 Moisture readings', '📋 Daily drying logs', '🌀 Equipment', '🧮 Drying calculator', '✍️ Work authorizations', '🚨 Emergencies & on call', '🧪 Materials & SDS', '◫ Projects', '◧ Schedule'].every(x => n.includes(x)) && !n.some(x => /Claims & adjusters|Customers|Invoices|Accounting|💧 Mitigation$|Insurance|PlanBuilder/.test(x)), n);
await hiDpi(T, 1440, 900);
await shot(T, 'mit_menu_tech', 'Mitigation tech (role "Mitigation Technician"): the left menu');
await T.b.close();
const M = await computer('sbiffle@grayco-cs.com', { build: BUILD, mobile: true });
M.page().on('pageerror', e => errs.push('M ' + String(e.message).slice(0, 200)));
await signIn(M, 'sbiffle@grayco-cs.com', 15000); await sleep(11000);
const fh = await M.ev(() => ({ q: [...document.querySelectorAll('#_gcJobPick .gc-ra-q [data-ra-a]')].map(b => b.getAttribute('data-ra-a') + ':' + b.innerText.replace(/\s+/g, ' ').trim()), bar: [...document.querySelectorAll('#gc-fh-tabs [data-t]')].map(b => b.innerText.replace(/\s+/g, ' ').trim().replace(/^[^A-Za-z]+/, '')) }));
ok('📱 GrayCo Field for the mitigation tech: big buttons in the order of the work — ➕ Moisture reading, 📷 Photos, 🌬 Equipment, 📋 Daily drying log, ✍️ Work authorization, 🗒 Notes, ⏱ Clock in, 🚨 Emergency checklist; bar Home · Drying · Jobs · Photos · More', fh.q.map(x => x.split(':')[0]).join() === 'mws_read,mws_photos,mws_equip,mws_log,mws_auth,mws_note,clock,mws_emerg' && /Moisture reading/.test(fh.q[0]) && fh.bar.join('|') === 'Home|Drying|Jobs|Photos|More', fh);
await shot(M, 'mit_field_tech_phone', 'Mitigation tech on a phone — GrayCo Field home (390×844, deviceScaleFactor 2)');
await M.ev(() => document.querySelector('#_gcJobPick .gc-ra-q [data-ra-a="mws_read"]').click()); await sleep(1500);
let mm = await M.ev(() => { const s = document.querySelector('.gc-ra-sheet'); if (s) { const b = s.querySelector('[data-pj="M1"]'); if (b) b.click(); } return !!s; }); await sleep(1800);
const ov = await M.ev(() => ({ ov: !!document.getElementById('gcbb-ov'), form: !!document.querySelector('#gcbb-ov .gcbb-moistform') }));
ok('➕ Moisture reading (which job? → Demo Ross basement) → the drying file full screen on the moisture form', ov.ov && ov.form, { picked: mm, ov });
await shot(M, 'mit_field_reading_phone', 'Phone: ➕ Moisture reading → the drying file\'s moisture form');
await M.ev(() => { const o = document.getElementById('gcbb-ov'); o && o.remove(); });
await M.ev(() => document.querySelector('#_gcJobPick .gc-ra-q [data-ra-a="mws_emerg"]').click()); await sleep(1000);
await M.ev(() => { const s = document.querySelector('.gc-ra-sheet'); if (s) { const b = s.querySelector('[data-pj="M1"]'); if (b) b.click(); } }); await sleep(1000);
ok('🚨 Emergency checklist → the 13-step first-response checklist for the job', await M.ev(() => /Emergency checklist — Demo Ross basement/.test((document.getElementById('gc-mws-sheet') || {}).innerText || '') && document.querySelectorAll('#gc-mws-sheet [data-mws-ek]').length === 13));
await shot(M, 'mit_field_emergency_phone', 'Phone: 🚨 Emergency checklist');
await M.b.close();

/* ═══ 4. ENVIRONMENTAL TECH — phone ═══ */
cset('users', USERS('Environmental Technician'));
const N = await computer('sbiffle@grayco-cs.com', { build: BUILD, mobile: true });
N.page().on('pageerror', e => errs.push('N ' + String(e.message).slice(0, 200)));
await signIn(N, 'sbiffle@grayco-cs.com', 15000); await sleep(11000);
const fe = await N.ev(() => ({ st: window._gcMitWS.state(), q: [...document.querySelectorAll('#_gcJobPick .gc-ra-q [data-ra-a]')].map(b => b.getAttribute('data-ra-a')) }));
ok('📱 GrayCo Field for the environmental tech: 🌫 Air monitoring, 🚧 Containment, 😷 PPE / respirator, 🛢 Waste, 📷 Photos, ⏱ Clock in, 🗒 Notes', fe.q.join() === 'ews_air,ews_contain,ews_ppe,ews_waste,ews_photos,clock,ews_note' && fe.st.kind === 'envtech', fe);
await shot(N, 'env_field_tech_phone', 'Environmental tech on a phone — GrayCo Field home');
await N.ev(() => document.querySelector('#_gcJobPick .gc-ra-q [data-ra-a="ews_contain"]').click()); await sleep(1200);
await N.ev(() => { const s = document.querySelector('.gc-ra-sheet'); if (s) { const b = s.querySelector('[data-pj="E1"]'); if (b) b.click(); } }); await sleep(1000);
await N.ev(() => { const f = document.querySelector('#gc-mws-sheet form[data-mws-env="contain"]'); ['crit', 'poly', 'neg', 'mano'].forEach(k => { f.querySelector('[data-mws-c="' + k + '"]').checked = true; }); f.querySelector('[data-mws-f="pa"]').value = '-6 Pa'; f.requestSubmit(); }); await sleep(2000);
const ct = await N.ev(() => { const p = window._crm.projects.find(x => x.id === 'E1'); const r = (p.envLog || []).filter(x => x.kind === 'contain')[0]; return r && { chk: Object.keys(r.chk || {}).sort().join(), pa: r.pa, by: r.by }; });
ok('🚧 the containment checklist from the phone is saved on the job (4 of 8 ticked, −6 Pa, who)', ct && ct.chk === 'crit,mano,neg,poly' && ct.pa === '-6 Pa' && ct.by === 'Sam Biffle', ct);
await shot(N, 'env_field_containment_phone', 'Phone: 🚧 Containment checklist saved');
await N.b.close();

/* ═══ 5. the lobby server: each company's own lobby ═══ */
const require = createRequire(import.meta.url);
process.env.SUPABASE_SERVICE_KEY = 'test-key'; process.env.SUPABASE_URL = 'https://example.supabase.co';
const KV = { gc_lobby_access__mitigation: { on: true, token: 'm'.repeat(40) }, gc_lobby_access: { on: true, token: 'c'.repeat(40) },
  gc_lobby__mitigation: { slides: [{ id: 's1', type: 'welcome', on: true, h: 'Water damage? We dry it right' }] }, projects: [{ id: 'M1', companyId: 'mitigation', name: 'Demo' }, { id: 'C1', name: 'Demo C' }],
  gc_photos: [{ id: 'p1', jobId: 'M1', ref: 'sb:crm-files/' + 'a'.repeat(64) + '.jpg', shared: true }, { id: 'p2', jobId: 'C1', ref: 'sb:crm-files/' + 'b'.repeat(64) + '.jpg', shared: true }] };
global.fetch = async (u) => { u = String(u); if (/gc_kv/.test(u)) { const keys = decodeURIComponent(u).match(/in\.\(([^)]*)\)/)[1].split(',').map(x => x.replace(/"/g, '')); return { ok: true, json: async () => keys.filter(k => KV[k]).map(k => ({ key: k, value: KV[k] })) }; } return { ok: false, json: async () => ({}) }; };
const LB = require(BUILD + '/netlify/functions/lobby.js');
LB._test.reset();
const ev = (tok, co) => ({ httpMethod: 'GET', headers: Object.assign({ 'x-lobby-token': tok }, co ? { 'x-lobby-co': co } : {}) });
let r1 = await LB.handler(ev('m'.repeat(40), 'mitigation')); const j1 = JSON.parse(r1.body);
ok('lobby.js: the Mitigation link (its code + x-lobby-co: mitigation) → its playlist, its name and logo', r1.statusCode === 200 && j1.brand.name === 'GrayCo Mitigation' && /mitigation-logo/.test(j1.brand.logo) && j1.slides[0].h === 'Water damage? We dry it right', { st: r1.statusCode, brand: j1.brand && j1.brand.name });
LB._test.reset();
const r2 = await LB.handler(ev('m'.repeat(40), ''));
ok('… the Mitigation code without its company → nothing (404); Construction\'s code still works for Construction', r2.statusCode === 404 && (LB._test.reset(), (await LB.handler(ev('c'.repeat(40), ''))).statusCode === 200));
const b1 = await LB._test.build({ slides: [{ id: 'g', type: 'welcome', on: true }] }, {}, { co: 'mitigation' });
ok('… build() for a company: its brand (name, logo, color); coOf / coKey', b1.brand.co === 'mitigation' && LB._test.coOf('Environmental') === 'environmental' && LB._test.coKey('gc_lobby', 'mitigation') === 'gc_lobby__mitigation' && LB._test.coOf('x') === '', b1.brand);

if (SHOT) fs.writeFileSync(SHOT + '/index.txt', IDX.join('\n') + '\n');
ok('no page errors', !errs.length, errs);
const f = R.filter(x => !x).length; console.log(f ? 'FAILED ' + (R.length - f) + '/' + R.length : 'MITWS ' + R.length + '/' + R.length); process.exit(f ? 1 : 0);
