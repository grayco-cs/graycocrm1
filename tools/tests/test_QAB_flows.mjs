// test_QAB_flows.mjs <build-dir> — QA B (overnight release test, patch QAB): GrayCo Mitigation and GrayCo Environmental end to end with
// made-up data ("Zedd" = new work, "Conzz" = Construction, "Mitzz" / "Envzz" = the other companies), as the owner (admin):
//  M1 an emergency water-loss lead from the website lands on Mitigation's Leads page only (not Construction's, not All unless
//     "show every company"); M2 a lead and a job made here while Mitigation is picked are filed under Mitigation; M3 the drying file:
//     rooms, moisture readings, temperature / humidity, equipment placed / removed → the Mitigation Dashboard cards, the 💧 tabs, the
//     calculator's numbers; M4 papers: the Mitigation papers library and the claims app's drying report carry GrayCo Mitigation (never
//     "GrayCo Construction Services"); M5 an invoice → payment on the Mitigation job shows under Mitigation only; M6 Claims & adjusters:
//     the Mitigation job's claim, never a Construction job's claim.
//  E1 an asbestos job: survey → containment → air / clearance → waste manifest → state notice, saved on the job (envLog), its
//     ☣️ Hazard jobs row, the Environmental Dashboard; E2 its papers say GrayCo Environmental.
// QAB_SHOTS=<dir> screenshots.
import fs from 'fs';
const H = await import(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const { computer, signIn, sleep, cset, cget, resetCloud, waitFor } = H;
const BUILD = process.argv[2], SHOT = process.env.QAB_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/qab_shots';
fs.mkdirSync(SHOT, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 500) : '')); };
const iso = d => new Date(Date.now() - d * 864e5).toISOString(), day = d => iso(d).slice(0, 10), T = day(0);
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Max Mitzzpm', email: 'sbiffle@grayco-cs.com', role: 'Mitigation PM', active: true, companies: ['mitigation'] }]);
cset('projects', [
  { id: 'C1', name: 'Conzz Smith deck', client: 'Conzz Smith', status: 'active', type: 'Residential Reno', contract: 77777, companyId: 'construction', createdAt: iso(9), updatedAt: iso(1) },
  { id: 'C2', name: 'Conzz Fire rebuild', client: 'Conzz Burns', status: 'active', type: 'Fire Damage', notes: 'smoke damage rebuild', contract: 55555, createdAt: iso(9), updatedAt: iso(1) },
  { id: 'E1', name: 'Envzz Tile asbestos', client: 'Envzz Tile', status: 'active', type: 'Environmental', companyId: 'environmental', notes: '9x9 floor tile, suspect asbestos, house built 1958', createdAt: iso(4), updatedAt: iso(0.4) }]);
cset('leads', [{ id: 'LC1', name: 'Conzz roof lead', client: 'Conzz Roofer', type: 'Roofing', stage: 'New Lead', createdAt: iso(1), updatedAt: iso(1) },
  /* arrived from the website a minute ago: no company of its own */
  { id: 'LW1', name: 'Zedd flood — burst pipe', client: 'Zedd Flood', type: 'Water Damage', emergency: true, urgency: 'Emergency', source: 'website', websiteForm: true, message: 'pipe burst in the basement, water everywhere', phone: '9015550199', stage: 'New Lead', createdAt: iso(0.001), updatedAt: iso(0.001) }]);
cset('invs', [{ id: 'IC1', type: 'client', pid: 'C1', client: 'Conzz Smith', invNum: '7001', amt: 7777, date: day(5), dueDate: day(-10), status: 'sent' }]);
cset('gc_claims', [{ id: 'CL2', projectId: 'C2', title: 'Conzz Fire rebuild', phase: 'Work', scope: 'rebuild', jobType: 'fire', carrier: 'Conzz Mutual', claimNumber: 'C-200', createdAt: iso(5), updatedAt: iso(0.5),
  equipment: [{ id: 'e3', kind: 'airmover', room: 'Kitchen', qty: 2, placedAt: iso(4) }] }]);

const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
const shot = async (n) => A.page().screenshot({ path: SHOT + '/flows_' + n + '.png' }).catch(() => {});
await signIn(A, 'wjohnson@grayco-cs.com', 14000); await sleep(6000);
await A.ev(() => { const b = document.querySelector('#gc-ra-desk [data-ra-a="full"]'); b && b.click(); }); await sleep(800);
const setCo = async c => { await A.ev(c => window._gcCo.setFilter(c), c); await sleep(1800); };
const leadsTxt = async () => { await A.ev(() => window._setView('leads')); await waitFor(A, () => !!document.querySelector('#gc-leads-hub'), null, 15000); await sleep(2200); return A.ev(() => (document.getElementById('gc-leads-hub') || document.body).innerText); };

/* ═══ M1 the website emergency lead ═══ */
ok('M1 the website water emergency is a Mitigation lead (by what it is about)', await A.ev(() => window._gcCo.ofLead(window._crm.leads.find(l => l.id === 'LW1'))) === 'mitigation');
await setCo('construction'); let lt = await leadsTxt();
ok('M1 Construction picked: the Leads page does not list it', !/Zedd flood/.test(lt) && /Conzz roof lead/.test(lt), lt.split('\n').filter(x => /zz/.test(x)).slice(0, 6));
await setCo('mitigation'); lt = await leadsTxt();
ok('M1 Mitigation picked: its Leads page lists it, and not the Construction lead', /Zedd flood/.test(lt) && !/Conzz roof lead/.test(lt), lt.split('\n').filter(x => /zz/.test(x)).slice(0, 6));
await shot('m1_mit_leads');
await setCo('all'); await A.ev(() => window._gcCo.setLeadsAll(false)); lt = await leadsTxt();
ok('M1 All companies: Construction\'s leads only (no Zedd flood)', !/Zedd flood/.test(lt) && /Conzz roof lead/.test(lt), lt.split('\n').filter(x => /zz/.test(x)).slice(0, 6));
await A.ev(() => window._gcCo.setLeadsAll(true)); lt = await leadsTxt();
ok('M1 All + "show every company": both', /Zedd flood/.test(lt) && /Conzz roof lead/.test(lt));
await A.ev(() => window._gcCo.setLeadsAll(false));
const stillNo = await A.ev(() => window._crm.leads.find(l => l.id === 'LW1').companyId);
ok('M1 the synced-in lead was never re-stamped by this computer (no companyId written)', !stillNo, stillNo);

/* ═══ M2 work made here while Mitigation is picked ═══ */
await setCo('mitigation'); await A.ev(() => window._setView('projects')); await sleep(1500);
await A.page().mouse.click(700, 600);   /* a real click → this person is working here */
await A.ev(() => { const at = new Date().toISOString();
  window._setProjects(p => p.concat([{ id: 'MZ1', name: 'Zedd Ross basement', client: 'Zedd Ross', address: '9 Zedd Rd', status: 'active', type: 'Water Damage', pm: 'Wesley Johnson', createdAt: at, updatedAt: at }]));
  window._setLeads(p => p.concat([{ id: 'LZ2', name: 'Zedd attic leak', client: 'Zedd Attic', type: 'Roofing', stage: 'New Lead', createdAt: at, updatedAt: at }])); });
await sleep(4500);
const st = await A.ev(() => ({ p: (window._crm.projects.find(x => x.id === 'MZ1') || {}).companyId, l: (window._crm.leads.find(x => x.id === 'LZ2') || {}).companyId }));
ok('M2 a job and a lead made here while Mitigation is picked are filed under Mitigation', st.p === 'mitigation' && st.l === 'mitigation', st);

/* the owner's home (desk app) with Mitigation picked: its job list is Mitigation's */
await A.ev(() => window._gcRA.open && window._gcRA.open()); await sleep(1800);
const dk = await A.ev(() => (document.getElementById('gc-ra-desk') || {}).innerText || '');
ok('M2 the owner\'s home (desk) with Mitigation picked: All jobs = Mitigation\'s (no Conzz / Envzz job)', /All jobs/.test(dk) && /Zedd Ross basement/.test(dk) && !/Conzz Smith deck|Conzz Fire rebuild|Envzz Tile asbestos/.test(dk), dk.split('\n').filter(x => /zz|Zedd|All jobs/.test(x)).slice(0, 8));
await A.ev(() => { const b = document.querySelector('#gc-ra-desk [data-ra-a="full"]'); b && b.click(); window._gcRA.hide && window._gcRA.hide(); }); await sleep(800);

const dfj = await A.ev(() => { const r = window._gcDataFull && window._gcDataFull.all(); return r ? r.jobs.map(j => j.pid) : null; });
ok('M2 🧾 Missing job data (To-Do board) with Mitigation picked: Mitigation\'s jobs only', Array.isArray(dfj) && dfj.includes('MZ1') && !dfj.some(x => /^(C1|C2|E1)$/.test(x)), dfj);

/* ═══ M3 the drying file ═══ */
await A.ev(() => window._setView('mws_jobs')); await sleep(1800);
const dj0 = await A.ev(() => document.getElementById('gc-mws-mount').innerText);
ok('M3 💧 Drying jobs: the new Mitigation job ("＋ Start the drying file"), not the Construction fire claim', /Zedd Ross basement/.test(dj0) && !/Conzz/.test(dj0), dj0.split('\n').filter(x => /zz|Zedd/.test(x)).slice(0, 6));
await shot('m3_drying_jobs');
const cid = await A.ev(async () => { const c = await window._gcClaims.create({ projectId: 'MZ1', title: 'Zedd Ross basement', insured: 'Zedd Ross', carrier: 'Demo Mutual', claimNumber: 'Z-1', scope: 'mitigation', causeOfLoss: 'Water — burst pipe' }); return c && c.id; });
const d2 = day(2), d1 = day(1);
await A.ev(([id, d2, d1, T]) => window._gcClaims.update(id, c => {
  c.jobType = 'water'; c.water = { category: 1, dehuUnit: 'lgr2800' };
  c.rooms = [{ id: 'r1', name: 'Basement', l: 20, w: 15, h: 8, wetFloorSF: 300, wetWallSF: 140, wickH: 3 }];
  c.moisture = [{ id: 'm1', room: 'Basement', material: 'Drywall', point: 'B1', reading: 40, goal: 12, date: d2 }, { id: 'm2', room: 'Basement', material: 'Drywall', point: 'B1', reading: 22, goal: 12, date: d1 }];
  c.atmos = [{ id: 'a1', where: 'affected', tempF: 75, rh: 60, date: T }, { id: 'a2', where: 'dehu', tempF: 90, rh: 25, date: T }];
  c.equipment = [{ id: 'q1', kind: 'airmover', room: 'Basement', qty: 6, placedAt: d2 }, { id: 'q2', kind: 'dehu', room: 'Basement', qty: 1, placedAt: d2 }, { id: 'q3', kind: 'airmover', room: 'Basement', qty: 1, placedAt: d2, removedAt: d1 }];
  c.adjusterMeetingAt = new Date(Date.now() + 864e5).toISOString().slice(0, 16);
}), [cid, d2, d1, T]);
await sleep(1500);
const math = await A.ev(id => { const C = window._gcClaims, p2 = C.p2, c = C.get(id); const plan = p2.equipmentPlan(c, p2.eqCfg(C.settings())); const drop = p2.gppDrop(c.atmos, new Date().toISOString().slice(0, 10)); const D = p2.dryingState(c, new Date().toISOString().slice(0, 10)); const tot = p2.equipTotals(c);
  return { am: plan.airMovers, dehu: plan.dehu.units, pints: plan.dehu.pints, cls: plan.cls, gppA: p2.gpp(75, 60), gppB: p2.gpp(90, 25), dew: p2.dewPointF(75, 60), dep: drop.depression, onsite: tot.onsite, D: { active: D.active, complete: D.complete } }; }, cid);
/* by hand: 300 SF wet floor ÷ 60 = 5, wet wall above 2 ft = 140 × (3−2)/3 = 46.67 ÷ 125 → 1, + 1 per room = 7 air movers; 20×15×8 = 2400 cu ft; class: wet 440 of (2×300 + 70×8=560) = 1160 SF … */
ok('M3 drying math: 7 air movers (300 SF ÷ 60 = 5, + 46.7 SF wall above 2 ft ÷ 125 = 1, + 1 per room), GPP 75°F/60% = 77.6, 90°F/25% = 52.3, dew point 60.2°F, GPP drop 25.3', math.am === 7 && math.gppA === 77.6 && math.gppB === 52.3 && math.dew === 60.2 && math.dep === 25.3, math);
ok('M3 dehumidifiers = cu ft ÷ class factor ÷ AHAM pints (2400 ÷ 40 or 50 → ÷ 130 = 1)', math.dehu === 1 && math.pints > 0, math);
ok('M3 equipment on site: 6 air movers + 1 dehu (the removed one is off)', math.onsite.airmover === 6 && math.onsite.dehu === 1, math.onsite);
await A.ev(() => window._setView('dashboard')); await waitFor(A, () => !!document.getElementById('gc-mws-dash'), null, 30000); await sleep(1500);
const dc = await A.ev(() => { const d = document.getElementById('gc-mws-dash'); const c = k => { const x = [...d.querySelectorAll('[data-mws-card]')].filter(y => y.querySelector('.l').textContent.includes(k))[0]; return x ? x.querySelector('b').textContent : null; };
  return { losses: c('Active water losses'), eq: c('Equipment on jobs'), days: c('Drying days'), due: c('Readings due today'), claims: c('Claims waiting'), txt: d.innerText.slice(0, 400) }; });
ok('M3 Mitigation Dashboard: 1 active water loss (the Construction fire claim not counted), 7 pieces of equipment on the job', dc.losses === '1' && dc.eq === '7', dc);
await shot('m3_mit_dashboard');
await A.ev(() => window._setView('mws_read')); await sleep(1500);
const rd = await A.ev(() => document.getElementById('gc-mws-mount').innerText);
ok('M3 📈 Moisture readings: the job\'s point B1 (22, goal 12), no Construction job', /Zedd Ross basement/.test(rd) && !/Conzz/.test(rd), rd.split('\n').filter(x => /zz|Zedd|B1/.test(x)).slice(0, 6));
await A.ev(() => window._setView('mws_equip')); await sleep(1500);
const eqt = await A.ev(() => document.getElementById('gc-mws-mount').innerText);
ok('M3 🌀 Equipment: 6 air movers and 1 dehumidifier out (Mitigation only)', /Air movers out\s*6/i.test(eqt) && /Dehumidifiers out\s*1/i.test(eqt) && !/Conzz/.test(eqt), eqt.slice(0, 300));
await A.ev(() => window._setView('mws_calc')); await sleep(1200);
const calc = await A.ev(() => { const r = document.getElementById('gc-mws-mount'), set = (k, v) => { const i = r.querySelector('[data-mws-k="' + k + '"]'); if (!i) return; i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); };
  set('tempF', 75); set('rh', 60); set('tempF2', 90); set('rh2', 25); set('l', 20); set('w', 15); set('wetFloorSF', 300); set('wetWallSF', 140); set('wickH', 3);
  const g = s => (r.querySelector(s) || {}).textContent; return { gpp: g('[data-mws-gpp]'), drop: g('[data-mws-drop]'), am: g('[data-mws-am]'), dh: g('[data-mws-dh]'), dew: (r.innerText.match(/[Dd]ew point\s*:?\s*(-?\d+\.\d)\s*°?F/) || [])[1] }; });
ok('M3 🧮 calculator agrees with the hand math (77.6 GPP, drop 25.3, 7 air movers, 1 dehu, dew point 60.2)', /77\.6/.test(calc.gpp) && calc.drop === '25.3' && calc.am === '7' && calc.dh === '1' && (!calc.dew || calc.dew === '60.2'), calc);
await shot('m3_calculator');

/* ═══ M4 papers ═══ */
await A.ev(() => window._setView('mws_auth')); await sleep(1500);
const auth = await A.ev(() => ({ txt: document.getElementById('gc-mws-mount').innerText, docs: [...document.querySelectorAll('#gc-mws-mount [data-mws-doc]')].map(b => b.getAttribute('data-mws-doc')) }));
ok('M4 ✍️ Work authorizations: the job row (missing) and the Mitigation papers library', /Zedd Ross basement/.test(auth.txt) && /missing/.test(auth.txt) && auth.docs.length >= 5, { n: auth.docs.length, d: auth.docs.slice(0, 5) });
const pap = await A.ev(async () => { const out = {}; for (const id of ['gcb_water_emergency_auth', 'gcb_water_equipment_resp', 'gcb_water_dry_cert']) { try { const r = await window._gcDocLib.render(id, 'MZ1'); out[id] = r ? { cons: /GrayCo Construction Services/.test(r.page), mit: /GrayCo Mitigation/.test(r.page), lic: /85034/.test(r.page) } : null; } catch (e) { out[id] = String(e); } } return out; });
ok('M4 the Mitigation papers for the job say GrayCo Mitigation, never GrayCo Construction Services', Object.values(pap).every(x => x && x.mit && !x.cons), pap);
const rep = await A.ev(async id => { const C = window._gcClaims, c = C.get(id), L = C.p2.dryingBlocks(c); const bytes = C.ext.pdfReport(L, null); let t = ''; for (let i = 0; i < bytes.length; i++) t += String.fromCharCode(bytes[i]); return { cons: /GrayCo Construction Services|GRAYCO CONSTRUCTION SERVICES/.test(t), mit: /GrayCo Mitigation|GRAYCO MITIGATION/.test(t), lic: /85034/.test(t), n: bytes.length }; }, cid);
ok('M4 the claims app\'s drying report PDF for a Mitigation job carries GrayCo Mitigation (not GrayCo Construction Services or its contractor licenses)', rep.mit && !rep.cons && !rep.lic, rep);

/* ═══ M5 invoice → payment ═══ */
await A.page().mouse.click(700, 600);
await A.ev(() => window._setInvoices(p => p.concat([{ id: 'IZ1', type: 'client', pid: 'MZ1', client: 'Zedd Ross', invNum: 'M-1001', amt: 4321, date: new Date().toISOString().slice(0, 10), status: 'sent', createdAt: new Date().toISOString() }])));
await sleep(2500);
await A.ev(() => window._setView('invoices')); await sleep(2500);
const inv = await A.ev(() => (document.querySelector('#root main') || document.body).innerText);
ok('M5 Invoices with Mitigation picked: the Mitigation invoice (4,321), not the Construction one (7,777)', /4,321/.test(inv) && !/7,777/.test(inv), inv.split('\n').filter(x => /4,321|7,777|Zedd|Conzz/.test(x)).slice(0, 6));
await shot('m5_invoices');
await A.ev(() => window._setInvoices(p => p.map(x => x.id === 'IZ1' ? Object.assign({}, x, { status: 'paid', paidDate: new Date().toISOString().slice(0, 10), payments: [{ amt: 4321, date: new Date().toISOString().slice(0, 10), method: 'Check 1001' }] }) : x)));
await sleep(2500);
const paid = cget('invs'); ok('M5 the payment reached the cloud', !!(paid || []).find(x => x.id === 'IZ1' && x.status === 'paid'));
const ofI = await A.ev(() => window._gcCo.ofInv(window._crm.invoices ? window._crm.invoices.find(x => x.id === 'IZ1') : { pid: 'MZ1' }));
ok('M5 the invoice belongs to Mitigation (by its job)', ofI === 'mitigation', ofI);

/* ═══ M6 claims & adjusters ═══ */
await A.ev(() => window._setView('mws_claims')); await sleep(1500);
const cl = await A.ev(() => document.getElementById('gc-mws-mount').innerText);
ok('M6 🛡 Claims & adjusters: the Mitigation claim (Demo Mutual · #Z-1, meeting tomorrow), not the Construction job\'s claim (Conzz Mutual)', /Demo Mutual · #Z-1/.test(cl) && !/Conzz Mutual|C-200/.test(cl), cl.split('\n').filter(x => /Mutual|zz|Zedd/.test(x)).slice(0, 6));
await shot('m6_claims');

/* job dropdowns (the global job-select relabeler): Mitigation's jobs only */
await A.ev(() => window._setView('mws_jobs')); await sleep(1500);
await waitFor(A, () => !!document.querySelector('#gc-mws-mount [data-a="mitnew"]'), null, 15000);
await A.ev(() => { const b = document.querySelector('#gc-mws-mount [data-a="mitnew"]'); b && b.click(); });
await waitFor(A, () => !!document.querySelector('#gc-mws-mount select[name="projectId"]'), null, 15000);
const pick = await A.ev(() => { const sel = document.querySelector('#gc-mws-mount select[name="projectId"]'); if (!sel) return null; sel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return [...sel.options].filter(o => !o.hidden).map(o => o.value); });
ok('M6 + New mitigation job → its Project dropdown offers Mitigation\'s jobs only (no Construction / Environmental job)', Array.isArray(pick) && !pick.some(v => /^(C1|C2|E1)$/.test(v)) && pick.includes('__new'), pick);
await shot('m6_new_claim_picker');
const gen = await A.ev(() => { const sel = document.createElement('select'); sel.innerHTML = '<option value="">—</option>' + ['C1', 'MZ1', 'E1', 'C2'].map(v => '<option value="' + v + '">' + v + '</option>').join(''); document.body.appendChild(sel); window._gcJobSelectSweep(); const vis = [...sel.options].filter(o => !o.hidden).map(o => o.value); window._gcCo.setFilter('all'); window._gcJobSelectSweep(); const all = [...sel.options].filter(o => !o.hidden).map(o => o.value); window._gcCo.setFilter('mitigation'); sel.remove(); return { vis, all }; });
ok('M6 any job dropdown: Mitigation picked → its jobs only; All companies → every job again', gen.vis.join() === ',MZ1' && gen.all.length === 5, gen);

const jc = await A.ev(async () => { window._gcJobCompleteness && window._gcJobCompleteness(); await new Promise(r => (window.__GC_NATIVE_SETTIMEOUT__ || setTimeout)(r, 900)); const t = document.body.innerText; const x = document.querySelector('[data-jfr-close]'); x && x.click(); return { other: /Conzz Smith deck|Conzz Fire rebuild|Envzz Tile asbestos/.test(t), open: /Job completeness/.test(t) }; });
ok('M6 ◫ Projects → 📋 Job completeness with Mitigation picked: no Construction / Environmental job', jc.open && !jc.other, jc);
await A.ev(() => window._setView('systems')); await sleep(2000);
const sysPick = await A.ev(async () => { const b = document.querySelector('#gc-sys-sys-mount [data-k="custportal"]'); if (!b) return null; b.click(); await new Promise(r => (window.__GC_NATIVE_SETTIMEOUT__ || setTimeout)(r, 900)); const t = document.body.innerText; return { zedd: /Zedd Ross basement/.test(t), other: /Conzz Smith deck|Conzz Fire rebuild|Envzz Tile asbestos/.test(t) }; });
ok('M6 🧭 GrayCo Systems → 🏠 Customer portal → pick a job: Mitigation\'s jobs only', sysPick && sysPick.zedd && !sysPick.other, sysPick);
await A.page().keyboard.press('Escape'); await sleep(400);

/* ═══ E1 the asbestos job ═══ */
await setCo('environmental');
const envSave = async (tab, kind, vals, chk) => { await A.ev(t => window._setView(t), tab); await sleep(1400);
  return A.ev(([kind, vals, chk]) => { const f = document.querySelector('#gc-mws-mount form[data-mws-env="' + kind + '"]'); if (!f) return 'no form ' + kind; Object.keys(vals).forEach(k => { const i = f.querySelector('[data-mws-f="' + k + '"]'); if (i) i.value = vals[k]; }); (chk || []).forEach(k => { const c = f.querySelector('[data-mws-c="' + k + '"]'); if (c) c.checked = true; }); f.requestSubmit(); return 'ok'; }, [kind, vals, chk]); };
const r1 = await envSave('ews_survey', 'survey', { pid: 'E1', material: '9x9 floor tile', loc: 'Kitchen', test: 'Asbestos — PLM bulk', result: '3% chrysotile', pos: 'Positive', lab: 'Demo Lab', rep: 'R-1' }); await sleep(1500);
const r2 = await envSave('ews_contain', 'contain', { pid: 'E1', area: 'Kitchen', pa: '-6 Pa' }, ['crit', 'poly', 'neg', 'mano', 'decon', 'signs', 'hepa', 'smoke']); await sleep(1500);
const r3 = await envSave('ews_air', 'air', { pid: 'E1', type: 'Clearance', loc: 'Kitchen', method: 'PCM (fibers/cc)', result: '0.004 f/cc', limit: '0.01 f/cc', pass: 'Pass', lab: 'Demo Lab' }); await sleep(1500);
const r4 = await envSave('ews_waste', 'waste', { pid: 'E1', wtype: 'Asbestos (ACM) — non-friable', cont: '12 bags', manifest: 'WSR-1', hauler: 'Demo Haul', landfill: 'Demo Landfill', ret: 'Not yet' }); await sleep(1500);
const r5 = await envSave('ews_notice', 'notice', { pid: 'E1', agency: 'TDEC (Tennessee)', ntype: 'Asbestos — 10 working days before', start: day(-14), conf: 'TN-1' }); await sleep(2000);
const log = await A.ev(() => (window._crm.projects.find(x => x.id === 'E1').envLog || []).map(r => r.kind).sort().join());
ok('E1 survey, containment, clearance, waste manifest and state notice are saved on the job', log === 'air,contain,notice,survey,waste', { log, r: [r1, r2, r3, r4, r5] });
const cloudLog = ((cget('projects') || []).find(x => x.id === 'E1') || {}).envLog || [];
ok('E1 … and reached the cloud', cloudLog.length === 5, cloudLog.length);
await A.ev(() => window._setView('ews_jobs')); await sleep(1500);
const hz = await A.ev(() => document.getElementById('gc-mws-mount').innerText);
ok('E1 ☣️ Hazard jobs: the asbestos job with its clearance (Pass), and no Construction fire job', /Envzz Tile asbestos/.test(hz) && /Pass/.test(hz) && !/Conzz/.test(hz), hz.split('\n').filter(x => /zz/.test(x)).slice(0, 6));
await shot('e1_hazard_jobs');
await A.ev(() => window._setView('ews_waste')); await sleep(1300);
const ws = await A.ev(() => document.getElementById('gc-mws-mount').innerText);
ok('E1 🛢 Waste manifests: WSR-1, the landfill copy not back yet', /WSR-1/.test(ws) && /Not yet|not back|waiting/i.test(ws), ws.slice(0, 300));
await A.page().mouse.move(600, 300); await A.page().mouse.move(620, 320);
await A.ev(() => window._setView('dashboard')); await waitFor(A, () => /Environmental today/.test((document.getElementById('gc-mws-dash') || {}).innerText || ''), null, 30000);
const de = await A.ev(() => (document.getElementById('gc-mws-dash') || {}).innerText || '');
ok('E1 Environmental Dashboard: 1 hazard job, 1 clearance passed, 1 waste manifest open', /ACTIVE HAZARD JOBS\s*1/i.test(de) && /CLEARANCES PASSED\s*1/i.test(de) && /WASTE MANIFESTS OPEN\s*1/i.test(de), de.slice(0, 400));
await shot('e1_env_dashboard');
/* E2 papers */
const ep = await A.ev(async () => { const out = {}; for (const id of ['gcb_asb_testing_auth', 'gcb_asb_01', 'gcb_lead_01', 'gcb_mold_contract']) { try { const r = await window._gcDocLib.render(id, 'E1'); out[id] = r ? { cons: /GrayCo Construction Services/.test(r.page), env: /GrayCo Environmental/.test(r.page) } : null; } catch (e) { out[id] = String(e); } } return out; });
ok('E2 the Environmental papers for the job say GrayCo Environmental, never GrayCo Construction Services', Object.values(ep).every(x => x && x.env && !x.cons), ep);
ok('no page errors', !errs.length, errs);
await A.b.close();

/* ═══ M7 a Mitigation PM (role-locked to Mitigation, "All" in the company pick) makes a job and a lead → filed under Mitigation ═══ */
const B = await computer('sbiffle@grayco-cs.com', { build: BUILD });
const errsB = []; B.page().on('pageerror', e => errsB.push(String(e.message).slice(0, 200)));
await signIn(B, 'sbiffle@grayco-cs.com', 14000); await sleep(6000);
await B.ev(() => { const b = document.querySelector('#gc-ra-desk [data-ra-a="full"]'); b && b.click(); }); await sleep(800);
await B.ev(() => window._setView('projects')); await sleep(1200);
await B.page().mouse.click(700, 600);
await B.ev(() => { const at = new Date().toISOString();
  window._setProjects(p => p.concat([{ id: 'MZ9', name: 'Zedd Lane laundry leak', client: 'Zedd Lane', status: 'active', type: 'Residential', pm: 'Max Mitzzpm', createdAt: at, updatedAt: at }]));
  window._setLeads(p => p.concat([{ id: 'LZ9', name: 'Zedd referral', client: 'Zedd Ref', type: 'Residential', stage: 'New Lead', createdAt: at, updatedAt: at }])); });
await sleep(4500);
const sb = await B.ev(() => ({ f: window._gcCo.filter(), p: (window._crm.projects.find(x => x.id === 'MZ9') || {}).companyId, l: (window._crm.leads.find(x => x.id === 'LZ9') || {}).companyId }));
ok('M7 a Mitigation PM\'s new job and lead are filed under Mitigation (not Construction)', sb.p === 'mitigation' && sb.l === 'mitigation', sb);
await B.ev(() => window._setView('mws_jobs')); await sleep(1500);
const bj = await B.ev(() => (document.getElementById('gc-mws-mount') || {}).innerText || '');
ok('M7 … so it shows in their 💧 Drying jobs, and no Construction job / claim does', /Zedd Lane laundry leak/.test(bj) && !/Conzz/.test(bj), bj.split('\n').filter(x => /zz|Zedd/.test(x)).slice(0, 6));
await B.ev(() => window._setView('leads')); await sleep(5000);
const bl = await B.ev(() => (document.getElementById('gc-leads-hub') || document.querySelector('#root main') || document.body).innerText);
ok('M7 the Mitigation PM\'s Leads page: Mitigation\'s leads (Zedd flood), not Construction\'s (Conzz roof lead)', /Zedd flood/.test(bl) && !/Conzz roof lead/.test(bl), bl.split('\n').filter(x => /zz|Zedd/.test(x)).slice(0, 6));
await B.ev(() => window._setView('projects')); await sleep(2500);
const bp = await B.ev(() => (document.querySelector('#root main') || document.body).innerText);
ok('M7 the Mitigation PM\'s Projects: no Construction / Environmental job', /Zedd/.test(bp) && !/Conzz Smith deck|Conzz Fire rebuild|Envzz Tile asbestos/.test(bp), bp.split('\n').filter(x => /zz|Zedd/.test(x)).slice(0, 6));
const ch = await B.ev(() => { try { return window._gcEnviro.parts.certsHtml(); } catch (e) { return 'ERR ' + e.message; } });
ok('M7 a non-admin does not get the "Open Certifications" button that only admins can use', !/data-env="certs"/.test(ch) && !/^ERR/.test(ch), ch.slice(0, 120));
ok('M7 no page errors', !errsB.length, errsB);
await B.b.close();

/* ═══ M8 a Marketing Manager switches to Mitigation: Marketing yes, no drying / claims tool tabs that would not open for them ═══ */
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Kim Mktdemo', email: 'sbiffle@grayco-cs.com', role: 'Marketing Manager', active: true }]);
const K = await computer('sbiffle@grayco-cs.com', { build: BUILD });
await K.ctx.addInitScript(() => { try { if (!sessionStorage.getItem('q')) { localStorage.setItem('gc_co_filter', 'mitigation'); sessionStorage.setItem('q', '1'); } } catch (e) {} });
await signIn(K, 'sbiffle@grayco-cs.com', 14000); await sleep(6000);
await K.ev(() => { const b = document.querySelector('#gc-ra-desk [data-ra-a="full"]'); b && b.click(); }); await sleep(1000);
const kn = await K.ev(() => [...document.querySelectorAll('aside nav button, aside button, nav button')].filter(b => b.offsetParent).map(b => b.innerText.replace(/\s+/g, ' ').trim()));
const bad = [];
for (const l of kn.filter(x => /Drying|Moisture|Equipment|Calculator|Work authoriz|Claims|Emergencies|SDS/.test(x))) { const v = await K.ev(l => { const b = [...document.querySelectorAll('aside nav button, aside button, nav button')].find(x => x.offsetParent && x.innerText.replace(/\s+/g, ' ').trim() === l); b && b.click(); return localStorage.getItem('grayco_view'); }, l); bad.push(l); }
ok('M8 Marketing Manager on Mitigation: Marketing on the menu, no mitigation tool tabs (they would not open for this role)', kn.some(x => /Marketing/.test(x)) && !bad.length, { kn: kn.slice(0, 20), bad });
await K.b.close();
const n = R.filter(Boolean).length; console.log('QAB_FLOWS ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
