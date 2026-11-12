// test_CERTROLE_dual.mjs <build-dir> [shot-dir] — patch CERTROLE (owner 11/12, "like they do both"): a cross-trained
// "Restoration & Abatement Tech" gets BOTH the Mitigation and the Environmental tool tabs (no combined hub tabs), both sets of field
// buttons on the phone (Mitigation first), is in both companies (read side) and switches Mitigation ↔ Environmental only.
// Offline harness, made-up people only.
import { computer, signIn, sleep, cset, cget, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 500) : '')); };
const BUILD = process.argv[2], SHOT = process.argv[3] || '';
resetCloud();
const now = new Date().toISOString();
const USERS = role => [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Dex Demo', email: 'sbiffle@grayco-cs.com', role, active: true }];
cset('users', USERS('Restoration & Abatement Tech'));
cset('projects', [
  { id: 'M1', name: 'Demo Ross basement', client: 'Demo Ross', status: 'active', type: 'Water Damage', companyId: 'mitigation', mitTech: 'Dex Demo', updatedAt: now },
  { id: 'E1', name: 'Demo Kline trim', client: 'Demo Kline', status: 'active', type: 'Environmental', companyId: 'environmental', envTech: 'Dex Demo', updatedAt: now },
  { id: 'C1', name: 'Demo Smith deck', client: 'Demo Smith', status: 'active', type: 'Residential Reno', contract: 12000, pm: 'Pat Demo', updatedAt: now }]);
const navOf = A => A.ev(() => [...document.querySelectorAll('aside nav button, aside button, nav button')].filter(b => b.offsetParent && !b.closest('#gc-ra-dock,#gc-fh-tabs')).map(b => b.innerText.replace(/\s+/g, ' ').replace(/\s\d+$/, '').trim()).filter(x => x && x !== '☰' && x !== 'Sign Out'));
const fullCrm = A => A.ev(() => { const b = document.querySelector('#gc-ra-desk [data-ra-a="full"]'); if (b) b.click(); });
const errs = [];

/* ═══ computer: the menu, the company switch ═══ */
const B = await computer('sbiffle@grayco-cs.com', { build: BUILD });
B.page().on('pageerror', e => errs.push('B ' + String(e.message).slice(0, 200)));
await signIn(B, 'sbiffle@grayco-cs.com', 15000); await sleep(9000);
const st = await B.ev(() => ({ ws: window._gcMitWS.state(), cos: window._gcCo.userCos(window._crm.users.find(u => u.email === 'sbiffle@grayco-cs.com')), can: window._gcCo.canSwitch(), my: window._gcCo.myCos(), f: window._gcCo.filter() }));
ok('kind "dualtech"; in both companies (Mitigation + Environmental, read side); may switch, only between those two; starts on Mitigation', st.ws.kind === 'dualtech' && st.cos.join() === 'mitigation,environmental' && st.can === true && st.my.join() === 'mitigation,environmental' && st.f === 'mitigation', st);
await fullCrm(B); await sleep(1000);
let n = await navOf(B);
const MIT = ['💧 Drying jobs', '📈 Moisture readings', '📋 Daily drying logs', '🌀 Equipment', '🧮 Drying calculator', '✍️ Work authorizations', '🚨 Emergencies & on call'];
const ENV = ['☣️ Hazard jobs', '🌫 Air monitoring & clearance', '🚧 Containment & PPE', '🛢 Waste manifests', '📜 Certs, papers & rules'];
ok('menu: BOTH the Mitigation tool tabs and the Environmental tool tabs (tech set), Mitigation first; no combined 💧 Mitigation / ☢️ Environmental hub; no claims / RoofScout', MIT.every(x => n.includes(x)) && ENV.every(x => n.includes(x)) && n.indexOf('💧 Drying jobs') < n.indexOf('☣️ Hazard jobs') && !n.includes('💧 Mitigation') && !n.some(x => /☢️ Environmental$|RoofScout|Claims & adjusters/.test(x)), n);
if (SHOT) await B.page().screenshot({ path: SHOT + '/certrole_dual_menu.png' });
await B.ev(() => window._gcCo.setFilter('environmental')); await sleep(2000);
const f2 = await B.ev(() => ({ f: window._gcCo.filter(), co: window._gcMitWS.ws().co }));
await B.ev(() => window._gcCo.setFilter('construction')); await sleep(1500);
const f3 = await B.ev(() => window._gcCo.filter());
await B.ev(() => window._gcCo.setFilter('all')); await sleep(1500);
const f4 = await B.ev(() => window._gcCo.filter());
ok('switch Mitigation → Environmental works; Construction or "All" is not theirs (stays on one of the two)', f2.f === 'environmental' && f2.co === 'environmental' && /^(mitigation|environmental)$/.test(f3) && /^(mitigation|environmental)$/.test(f4), { f2, f3, f4 });
n = await navOf(B);
ok('with Environmental picked the menu still has both sets of tool tabs', MIT.every(x => n.includes(x)) && ENV.every(x => n.includes(x)), n);
await B.ev(() => window._setView('enviro')); await sleep(1200);
ok('asking for the combined ☢️ tab opens ☣️ Hazard jobs', await B.ev(() => localStorage.getItem('grayco_view') === 'ews_jobs'));
await B.b.close();

/* ═══ phone: GrayCo Field — both sets of field buttons ═══ */
const M = await computer('sbiffle@grayco-cs.com', { build: BUILD, mobile: true });
M.page().on('pageerror', e => errs.push('M ' + String(e.message).slice(0, 200)));
await signIn(M, 'sbiffle@grayco-cs.com', 15000); await sleep(11000);
const fh = await M.ev(() => ({ app: (window._gcRA && window._gcRA.state ? window._gcRA.state().app : ''), q: [...document.querySelectorAll('#_gcJobPick .gc-ra-q [data-ra-a]')].map(b => b.getAttribute('data-ra-a')) }));
ok('📱 field view: the app is "dual"; Mitigation buttons first (reading, photos, equipment, daily log, work auth, notes, clock, emergency), then Environmental (air, containment, PPE, waste)', fh.app === 'dual' && fh.q.join() === 'mws_read,mws_photos,mws_equip,mws_log,mws_auth,mws_note,clock,mws_emerg,ews_air,ews_contain,ews_ppe,ews_waste', fh);
if (SHOT) await M.page().screenshot({ path: SHOT + '/certrole_dual_field_phone.png' });
const jobs = await M.ev(() => window._gcMitWS.fieldJobs('dual').map(p => p.id));
ok('📱 their jobs: the Mitigation job and the Environmental job (never the Construction one)', jobs.includes('M1') && jobs.includes('E1') && !jobs.includes('C1'), jobs);
await M.b.close();

/* ═══ a Dual Foreman: not the tech set (claims tools too), still both companies ═══ */
cset('users', USERS('Dual Foreman'));
const F = await computer('sbiffle@grayco-cs.com', { build: BUILD });
F.page().on('pageerror', e => errs.push('F ' + String(e.message).slice(0, 200)));
await signIn(F, 'sbiffle@grayco-cs.com', 15000); await sleep(9000);
await fullCrm(F); await sleep(1000);
const fk = await F.ev(() => window._gcMitWS.state().kind); n = await navOf(F);
ok('Dual Foreman: kind "dualfore", both sets of tool tabs incl. 🛡 Claims & adjusters and 📨 Notifications', fk === 'dualfore' && n.includes('🛡 Claims & adjusters') && n.includes('📨 Notifications') && n.includes('💧 Drying jobs') && n.includes('☣️ Hazard jobs'), { fk, n });
await F.b.close();

/* ═══ a Contents & Cleaning Tech: Mitigation + Construction, 🧽 Final clean on the phone, no clock-in on a job they are not qualified for ═══ */
cset('users', USERS('Contents & Cleaning Tech'));
cset('gc_certs', { list: [] });
cset('projects', [
  { id: 'M1', name: 'Demo Ross basement', client: 'Demo Ross', status: 'active', type: 'Water Damage', companyId: 'mitigation', updatedAt: now },
  { id: 'C2', name: 'Demo Smith final clean', client: 'Demo Smith', status: 'active', type: 'Residential Reno', cleanTech: 'Dex Demo', updatedAt: now }]);
const K = await computer('sbiffle@grayco-cs.com', { build: BUILD, mobile: true });
K.page().on('pageerror', e => errs.push('K ' + String(e.message).slice(0, 200)));
await signIn(K, 'sbiffle@grayco-cs.com', 15000); await sleep(12000);
const kc = await K.ev(() => ({ app: window._gcRA && window._gcRA.state ? window._gcRA.state().app : '', q: [...document.querySelectorAll('#_gcJobPick .gc-ra-q [data-ra-a]')].map(b => b.getAttribute('data-ra-a')),
  cos: window._gcCo.userCos(window._crm.users.find(u => u.email === 'sbiffle@grayco-cs.com')), can: window._gcCo.canSwitch(), jobs: window._gcMitWS.fieldJobs('clean').map(p => p.id) }));
ok('📱 Contents & Cleaning Tech: app "clean" — 🧽 Final clean first (no ☣️ Hazard clean), in Mitigation + Construction (may switch), their job = the final clean they are on', kc.app === 'clean' && kc.q[0] === 'fclean' && !kc.q.includes('hzclean') && kc.cos.join() === 'construction,mitigation' && kc.can && kc.jobs.join() === 'C2', kc);
if (SHOT) await K.page().screenshot({ path: SHOT + '/certrole_clean_field_phone.png' });
await K.ev(() => document.querySelector('#_gcJobPick .gc-ra-q [data-ra-a="fclean"]').click()); await sleep(1200);
await K.ev(() => { const s = document.querySelector('.gc-ra-sheet'); if (s) { const b = s.querySelector('[data-pj="C2"]'); if (b) b.click(); } }); await sleep(1000);
await K.ev(() => { const f = document.querySelector('#gc-mws-sheet form[data-mws-env="fclean"]'); ['hepa', 'wipe', 'floors', 'debris', 'odor', 'photos'].forEach(k => { f.querySelector('[data-mws-c="' + k + '"]').checked = true; }); f.querySelector('[data-mws-f="area"]').value = 'Kitchen, hall'; f.requestSubmit(); }); await sleep(2000);
const fc = await K.ev(() => { const p = window._crm.projects.find(x => x.id === 'C2'); const r = (p.envLog || []).filter(x => x.kind === 'fclean')[0]; return r && { n: Object.keys(r.chk || {}).length, area: r.area, by: r.by }; });
ok('🧽 the Final clean checklist (6 of 6, areas, who) is saved on the Construction job', fc && fc.n === 6 && fc.area === 'Kitchen, hall' && fc.by === 'Dex Demo', fc);
if (SHOT) await K.page().screenshot({ path: SHOT + '/certrole_final_clean_saved.png' });
await K.ev(() => { const o = document.getElementById('gc-mws-sheet'); if (o) o.remove(); });
/* WARN ONLY (the default until the owner switches it on): heads-up, clock-in allowed, they stay on the job */
await K.ev(() => { window.__toasts = []; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.textContent) window.__toasts.push(n.textContent); }))).observe(document.body, { childList: true }); });
const wm = await K.ev(() => window._gcCertQual.mode());
await K.ev(() => { try { window._gcFieldTools.run('day', 'M1'); } catch (e) {} }); await sleep(2500);
const wDay = await K.ev(() => ({ toasts: window.__toasts.join(' | '), sheet: /Start day — Demo Ross basement/.test(document.body.innerText) }));
await K.ev(() => { document.querySelectorAll('.gc-fh-sheet, .gc-fh-ov, [class*="sheet"]').forEach(x => { if (/Start day/.test(x.textContent || '')) x.remove(); }); });
await K.ev(() => window._setProjects(prev => prev.map(x => x.id === 'M1' ? Object.assign({}, x, { mitTech: 'Dex Demo' }) : x))); await sleep(4500);
const wDbg = await K.ev(() => { const Q = window._gcCertQual, u = window._crm.users.find(x => x.email === 'sbiffle@grayco-cs.com'), p = window._crm.projects.find(x => x.id === 'M1'); Q._tick(); return { block: !!Q.block(u, p), issues: Q.crewIssues(p).length, mode: Q.mode() }; }); await sleep(500);
console.log('WDBG ' + JSON.stringify(wDbg));
const wStay = await K.ev(() => ({ tech: window._crm.projects.find(x => x.id === 'M1').mitTech || '', toasts: window.__toasts.join(' | ') }));
ok('WARN ONLY (default): clock-in allowed with "Heads-up: IICRC WRT is required for this job"; put on the water job he stays on it (heads-up, no admin request)', wm === 'warn' && wDay.sheet && /Heads-up: IICRC WRT is required for this job/.test(wDay.toasts) && wStay.tech === 'Dex Demo' && /Heads-up: IICRC WRT is required for Demo Ross basement/.test(wStay.toasts) && !((cget('gc_cert_plan') || {}).allowReq || []).length, { wm, wDay, wStay });
if (SHOT) await K.page().screenshot({ path: SHOT + '/certrole_warn_only.png' });
await K.ev(() => window._setProjects(prev => prev.map(x => x.id === 'M1' ? Object.assign({}, x, { mitTech: '' }) : x))); await sleep(3000);
/* BLOCK (the owner's switch) */
cset('gc_cert_plan', Object.assign({}, cget('gc_cert_plan') || {}, { blockMode: 'block' }));
await K.ev(async () => { await window._gcCertPlan.load(); }); await sleep(3000);
const blk = await K.ev(() => { const u = window._crm.users.find(x => x.email === 'sbiffle@grayco-cs.com'), p = window._crm.projects.find(x => x.id === 'M1'); return window._gcCertQual.block(u, p); });
await K.ev(() => { try { window._gcFieldTools.run('day', 'M1'); } catch (e) {} }); await sleep(800);
const toastTxt = await K.ev(() => document.body.innerText);
ok('⏱ clock-in refused: "You need IICRC WRT to work this job — talk to your manager" on the Mitigation water job (no WRT); no start-day sheet', blk && /IICRC WRT/.test(blk.missing.join()) && /You need IICRC WRT to work this job — talk to your manager/.test(toastTxt) && !/Start day — Demo Ross basement/.test(toastTxt), { blk, t: toastTxt.slice(0, 200) });
if (SHOT) await K.page().screenshot({ path: SHOT + '/certrole_clockin_refused.png' });
await K.ev(() => { window.__toasts = []; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.textContent) window.__toasts.push(n.textContent); }))).observe(document.body, { childList: true }); });
await K.ev(() => window._setProjects(prev => prev.map(x => x.id === 'M1' ? Object.assign({}, x, { mitTech: 'Dex Demo' }) : x))); await sleep(4500);
const gd = await K.ev(() => ({ tech: window._crm.projects.find(x => x.id === 'M1').mitTech || '', body: window.__toasts.join(' | ') }));
const ar = cget('gc_cert_plan');
ok('🚫 BLOCK: put on the Mitigation water job without IICRC WRT → taken off again ("Dex Demo needs IICRC WRT … taken off the job"), and an admin is asked to allow it', gd.tech === '' && /Dex Demo needs IICRC WRT/.test(gd.body) && ar && (ar.allowReq || []).some(r => r.pid === 'M1' && r.status === 'open'), { tech: gd.tech, req: ar && ar.allowReq });
await K.b.close();

ok('no page errors', !errs.length, errs);
const k = R.filter(Boolean).length; console.log('CERTROLE_dual ' + k + '/' + R.length); process.exit(k === R.length ? 0 : 1);
