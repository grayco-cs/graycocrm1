// test_JOBDOCS.mjs <build-dir> [shot-dir] — patch JOBDOCS (node-only twin: test_JOBDOCS_fn.mjs) (owner 11/16: "Yes they should come for asbestos and mold water damage fire
// everything should have different paperwork automatic"). Made-up data only, offline harness, fake functions.
//   A. each job type gets its own paperwork by itself (asbestos, lead, lead + asbestos, mold, water, fire, construction) — the forms the CRM
//      has, "needs a form" where there is none; an older job is left alone until someone taps ＋ Add.
//   B. no duplicates: a paper two types share is listed once; re-saving the job changes nothing; a type change adds the new type's papers,
//      drops the untouched old ones and keeps what staff handled; a job made now gets its list.
//   C. 🔒 Start job on an asbestos job waits for Asbestos 01 (the Lead 01 gate's dialog, same admin Start anyway); given → it starts;
//      lead + asbestos asks for both; emergency water / fire / mold mitigation is never stopped (DOCAUTO2's hold skips it too).
//   D. the job card (📑 Paperwork) — sections, needs-a-form, 🔒, no carrier names, no sub portal; 📤 Send held by data-entry mode.
//   E. admins edit the table (📑 Paperwork by job type) → saved to the cloud → the next job uses it; a non-admin cannot.
import path from 'path'; import fs from 'fs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 900) : '')); };
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const day = n => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const { computer, signIn, sleep, cset, cget, resetCloud, onFn } = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const shot = async (A, name) => { if (SHOTS) await A.page().screenshot({ path: SHOTS + '/' + name + '.png' }); };
const now = new Date().toISOString(), old = '2026-10-01T15:00:00.000Z';
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u5', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }]);
const J = (id, o) => Object.assign({ id, name: 'Demo ' + id, client: 'Client ' + id, clientPhone: '9015550100', address: id + ' Demo St, Memphis, TN 38135', status: 'active', pct: 0, startDate: day(6), pm: 'Demo PM', createdAt: now, updatedAt: now }, o);
cset('projects', [
  J('PA', { name: 'Demo asbestos abatement', type: 'Environmental', companyId: 'environmental', description: 'Asbestos floor tile removal' }),
  J('PW', { name: 'Demo water job', type: 'Water Damage', companyId: 'mitigation' }),
  J('PF', { name: 'Demo fire job', type: 'Fire Damage', companyId: 'mitigation' }),
  J('PM', { name: 'Demo mold job', type: 'Mold Remediation', companyId: 'mitigation' }),
  J('PME', { name: 'Demo mold remediation', type: 'Mold Remediation', companyId: 'environmental' }),
  J('PL', { name: 'Demo paint job', type: 'Residential Reno', leadAsb: { yearBuilt: 1962, disturbsPaint: true } }),
  J('PLA', { name: 'Demo school abatement', type: 'Environmental', companyId: 'environmental', description: 'Lead paint and asbestos abatement in the gym' }),
  J('PC', { name: 'Demo kitchen', type: 'Kitchen' }),
  J('PWA', { name: 'Demo flood job', type: 'Water Damage', companyId: 'mitigation', description: 'Pipe burst — suspect asbestos in the ceiling texture', leadAsb: { asbFound: day(-1) } }),
  J('PA2', { name: 'Demo asbestos 2', client: 'Two Demo', type: 'Asbestos abatement', companyId: 'environmental', startDate: day(4) }),
  J('PPLAIN', { name: 'Demo plain', type: 'Kitchen', address: '44 Demo St' }),
  J('POLD', { name: 'Demo older water job', type: 'Water Damage', companyId: 'mitigation', createdAt: old, updatedAt: old })]);
const QUEUED = [], SIGNREQ = [];
onFn('portal', ({ body }) => { if (body && body.action === 'approval') { QUEUED.push(body); return { ok: true, id: 'AP' + QUEUED.length }; } return { ok: true }; });
onFn('portal-sign', ({ body }) => { if (body && body.action === 'list') return { ok: true, items: [] }; SIGNREQ.push(body); return { ok: false, error: 'test: no portal' }; });   /* DOCAUTO's own background send never lands (keeps this test about JOBDOCS) */
const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
await signIn(A, 'wjohnson@grayco-cs.com', 20000);
const wait = async (f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await A.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
ok('0 the CRM is up with 📑 JOBDOCS', !!await wait(() => window._gcJobDocs && window._gcLeadAsb3 && (window._crm.projects || []).length >= 12 && typeof window._setProjects === 'function', null, 60000));
const jd = pid => A.ev(pid => { const p = window._crm.projects.find(x => x.id === pid); return p && p.jobDocs ? JSON.parse(JSON.stringify(p.jobDocs)) : null; }, pid);
await wait(() => ['PA', 'PW', 'PF', 'PM', 'PL', 'PLA', 'PC', 'PWA'].every(id => { const p = window._crm.projects.find(x => x.id === id); return p && p.jobDocs && p.jobDocs.items; }), null, 20000);
const K = j => (j && j.items || []).map(x => x.k);
const has = (j, ...ks) => ks.every(k => K(j).includes(k));
const item = (j, k) => (j && j.items || []).find(x => x.k === k);
/* ═══ A ═══ */
let pa = await jd('PA'), pw = await jd('PW'), pf = await jd('PF'), pm = await jd('PM'), pl = await jd('PL'), pla = await jd('PLA'), pc = await jd('PC'), pold = await jd('POLD');
ok('A1 asbestos job → its papers (testing auth, Asbestos 01 🔒, abatement agreement, clearance, waste log, Asbestos 02), no construction contract', pa && JSON.stringify(pa.types) === '["asbestos"]' && has(pa, 'gcb_asb_testing_auth', 'gcb_asb_01', 'gcb_env_abatement_agreement', 'gcb_env_clearance', 'gcb_env_waste_log', 'gcb_asb_02') && item(pa, 'gcb_asb_01').gate === true && item(pa, 'gcb_asb_01').la === 'A01' && !has(pa, 'gcb_contract'), pa);
ok('A2 water damage job → emergency authorization, drying log, certificate of drying, equipment sign-off (no asbestos, no contract)', pw && JSON.stringify(pw.types) === '["water"]' && has(pw, 'gcb_water_emergency_auth', 'gcb_drying_log', 'gcb_water_dry_cert', 'gcb_equipment_removal_signoff', 'gcb_mit_closeout') && !has(pw, 'gcb_asb_01', 'gcb_contract'), pw && K(pw));
ok('A3 fire job → board-up, fire work auth, pack-out, odor notice + a "needs a form" paper (no form in the CRM yet)', pf && JSON.stringify(pf.types) === '["fire"]' && has(pf, 'gcb_board_up_auth', 'gcb_fire_work_auth', 'gcb_packout_auth', 'gcb_odor_control_notice') && pf.items.some(x => x.needsForm && /smoke \/ odor cleaning completion/i.test(x.label) && !x.doc), pf && K(pf));
ok('A4 mold job → mold disclosure, assessment auth, remediation agreement, clearance + "needs a form" protocol', pm && pm.types.includes('mold') && has(pm, 'gcb_mold', 'gcb_mold_assessment_auth', 'gcb_mold_contract', 'gcb_mold_clearance_cert') && pm.items.some(x => x.needsForm && /protocol/i.test(x.label)), pm && K(pm));
ok('A5 lead job (pre-1978 + disturbs paint, a reno in TN) → Lead 01 🔒, Lead 03, RRP checklist + the construction set with the TN rider; no Lead 02 (not child-occupied)', pl && pl.types.includes('lead') && pl.types.includes('construction') && has(pl, 'gcb_lead_01', 'gcb_lead_03', 'gcb_contract', 'gcb_rider_tn', 'gcb_selections') && item(pl, 'gcb_lead_01').gate && !has(pl, 'gcb_lead_02', 'gcb_rider_ms'), pl && { t: pl.types, k: K(pl) });
ok('A6 lead + asbestos job → both sets + the combo row; the shared papers once each', pla && ['lead', 'asbestos', 'lead+asbestos'].every(t => pla.types.includes(t)) && has(pla, 'gcb_lead_01', 'gcb_asb_01', 'gcb_hr_lead_asbestos') && K(pla).filter(k => k === 'gcb_env_abatement_agreement').length === 1 && K(pla).filter(k => /Health_Effects/.test(k)).length === 1 && new Set(K(pla)).size === K(pla).length && item(pla, 'gcb_env_abatement_agreement').for.length >= 2, pla && { t: pla.types, k: K(pla) });
ok('A7 construction job (kitchen) → contract, scope, selections, change orders, walkthrough, completion, warranty, TN rider', pc && JSON.stringify(pc.types) === '["construction"]' && has(pc, 'gcb_contract', 'gcb_scope', 'gcb_selections', 'gcb_change_order', 'gcb_walkthrough', 'gcb_completion', 'gcb_warranty', 'gcb_rider_tn') && !has(pc, 'gcb_sov'), pc && K(pc));
ok('A8 an older job (made before 11/16) is not touched until someone taps ＋ Add', pold === null, pold);
/* ═══ B ═══ */
const at0 = pa.at, n0 = pa.items.length;
await A.ev(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); window._setProjects(prev => prev.map(p => p.id === 'PA' ? Object.assign({}, p, { updatedAt: new Date().toISOString(), notes: 'saved again' }) : p)); });
await sleep(3800); await A.ev(() => window._gcJobDocs.sweep());
pa = await jd('PA');
ok('B1 re-saving the job changes nothing (same papers, no duplicates, not re-written)', pa.items.length === n0 && new Set(K(pa)).size === n0 && pa.at === at0 && await A.ev(() => window._gcJobDocs.assign('PA') === false), { n0, n: pa.items.length, at0, at: pa.at });
await A.ev(() => window._gcJobDocs.markDone('PW', 'gcb_drying_log', 'in the job file'));
await sleep(600);
await A.ev(() => window._gcJobDocs.notNeeded('PW', 'gcb_mit_first_call'));
await sleep(600);
await A.ev(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); window._setProjects(prev => prev.map(p => p.id === 'PW' ? Object.assign({}, p, { type: 'Fire Damage', updatedAt: new Date().toISOString() }) : p)); });
await wait(() => { const p = window._crm.projects.find(x => x.id === 'PW'); return p.jobDocs && p.jobDocs.types && p.jobDocs.types.includes('fire'); }, null, 12000);
pw = await jd('PW');
ok('B2 type change water → fire: the fire papers are added', pw.types.includes('fire') && !pw.types.includes('water') && has(pw, 'gcb_fire_work_auth', 'gcb_packout_auth'), pw && { t: pw.types, k: K(pw) });
ok('B2 …the untouched water papers are dropped, the ones staff handled stay (drying log done, first-call N/A) — marked as no longer this type', !has(pw, 'gcb_water_emergency_auth', 'gcb_water_dry_cert') && item(pw, 'gcb_drying_log') && item(pw, 'gcb_drying_log').stale && pw.done.gcb_drying_log && item(pw, 'gcb_mit_first_call') && item(pw, 'gcb_mit_first_call').stale, pw && K(pw));
ok('B2 …a paper both types share (contents disposal) is kept once', K(pw).filter(k => k === 'gcb_contents_disposal').length === 1 && new Set(K(pw)).size === K(pw).length);
await A.ev(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); window._setProjects(prev => prev.concat([{ id: 'PNEW', name: 'Demo new mold call', client: 'New Demo', clientPhone: '9015550199', address: '99 Demo St, Memphis, TN', type: 'Mold', companyId: 'environmental', status: 'bidding', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }])); });
const pn = await wait(() => { const p = window._crm.projects.find(x => x.id === 'PNEW'); return p && p.jobDocs && p.jobDocs.items && JSON.parse(JSON.stringify(p.jobDocs)); }, null, 12000);
ok('B3 a job made now gets its paperwork by itself (mold)', pn && pn.types.includes('mold') && has(pn, 'gcb_mold', 'gcb_mold_clearance_cert'), pn);
/* ═══ C ═══ */
await sleep(1500);
const start = pid => A.ev(pid => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); window._setProjects(prev => prev.map(p => p.id === pid ? Object.assign({}, p, { pct: 10, updatedAt: new Date().toISOString() }) : p)); }, pid);
const pct = pid => A.ev(pid => { const p = window._crm.projects.find(x => x.id === pid); return p ? +p.pct || 0 : -1; }, pid);
const gateTxt = () => wait(() => { const d = document.getElementById('gc-la3-gate'); return d && d.textContent; }, null, 6000);
const closeGate = () => A.ev(() => { const d = document.getElementById('gc-la3-gate'); if (d) d.remove(); });
await start('PA');
let g = await gateTxt(); await sleep(1500);
ok('C1 asbestos job started without Asbestos 01 → put back to 0 % and "📄 Give the customer Asbestos 01 first"', /Give the customer Asbestos 01 first/.test(g || '') && /asbestos job/.test(g || '') && await pct('PA') === 0, { g, pct: await pct('PA') });
ok('C1 same buttons as the Lead 01 gate (📤 Send · ✓ It was given · Start anyway (admin) · Not now)', /📤 Send Asbestos 01/.test(g) && /✓ It was given/.test(g) && /Start anyway \(admin\)/.test(g) && /Not now/.test(g), g);
await shot(A, 'c1_gate');
await closeGate();
await A.ev(() => window._gcJobDocs.markDone('PA', 'A01', 'signed'));
await sleep(1200);
ok('C2 Asbestos 01 marked given → written on the ☣️ card (leadAsb.given.A01) and the job\'s paperwork', await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'PA'); return !!(p.leadAsb && p.leadAsb.given && p.leadAsb.given.A01 && p.jobDocs.done && p.jobDocs.done.gcb_asb_01); }));
await start('PA'); await sleep(2600);
ok('C2 …then it starts', await pct('PA') === 10 && !await A.ev(() => !!document.getElementById('gc-la3-gate')));
await start('PLA');
g = await gateTxt(); await sleep(1500);
ok('C3 lead + asbestos job → one dialog asks for Lead 01 and Asbestos 01', /Give the customer Lead 01 and Asbestos 01 first/.test(g || '') && await pct('PLA') === 0, g);
await A.ev(() => document.querySelector('#gc-la3-gate [data-g3="waive"]').click());
await sleep(1800);
ok('C3 Start anyway (admin) → it starts, stamped startWaived (the Lead 01 gate\'s own override)', await pct('PLA') === 10 && await A.ev(() => !!window._crm.projects.find(x => x.id === 'PLA').leadAsb.startWaived));
/* a signed copy uploaded counts, like Lead 01 */
/* PA2 / PPLAIN are seeded (made today) — see the projects list above */
await wait(() => { const p = window._crm.projects.find(x => x.id === 'PA2'); return p && p.jobDocs && p.jobDocs.items; }, null, 12000);
/* added to the job's files (like an upload), then Start job. The copy must survive the CRM's cloud pull that follows (patch DOCSRACE:
   the pull used to rebuild the job-files list from this computer's saved copy, written a moment later, and dropped the new file) */
/* as a person's upload: a tap first — without one, patch ONLYYOU holds the change as background tidy-up, and a held updater was
   replaced by a later held whole-list write for the same list (the cloud pull's), so the copy never reached the screen */
await A.ev(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); const d = { id: 'DOCA2', pid: 'PA2', name: 'Asbestos 01 signed - Two Demo.pdf', cat: 'Other', type: 'application/pdf', data: 'sb:crm-files/' + 'd'.repeat(64) + '.pdf', size: 42000, by: 'Demo PM', uploaded: '2026-11-16' }; window._setProjectDocs(prev => (prev || []).concat([d])); });
await sleep(3000);
const inFiles = await wait(() => { const p = window._crm.projects.find(x => x.id === 'PA2'); return p && !window._gcJobDocs.gateMissing(p, []).includes('A01'); }, null, 8000);
ok('C4 the signed copy is in the job\'s files (Asbestos 01 no longer missing)', !!inFiles);
await sleep(1000);
await start('PA2'); await sleep(2600);
ok('C4 a signed Asbestos 01 in the job\'s files counts → it starts', await pct('PA2') === 10 && !await A.ev(() => !!document.getElementById('gc-la3-gate')), await A.ev(() => { const p = window._crm.projects.find(p => p.id === 'PA2'); return { exists: !!p, pct: p && p.pct, miss: p && window._gcJobDocs.gateMissing(p, []), gate: !!document.getElementById('gc-la3-gate'), txt: (document.getElementById('gc-la3-gate') || {}).textContent, n: window._crm.projects.length, ids: window._crm.projects.map(x => x.id) }; }));
await closeGate();
for (const id of ['PWA', 'PF', 'PM']) { await start(id); await sleep(2600); }
ok('C5 emergency jobs are never stopped: water job with asbestos found, fire job, mold job all start', await pct('PWA') === 10 && await pct('PF') === 10 && await pct('PM') === 10 && !await A.ev(() => !!document.getElementById('gc-la3-gate')), { pwa: await pct('PWA'), pf: await pct('PF'), pm: await pct('PM') });
ok('C5 …the water job still lists Asbestos 01 as due (from the ☣️ answers), and nothing on it is a gate', await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'PWA'); return window._gcJobDocs.emergency(p) && window._gcJobDocs.gateMissing(p, ['L01']).length === 0 && window._gcLeadAsb.need(p).some(n => n.k === 'A01'); }));
ok('C5 …and DOCAUTO2\'s lead / asbestos / mold hold skips emergency jobs (missing → none); an asbestos abatement job is not emergency', await A.ev(() => window._gcDocAuto.missing(window._crm.projects.find(x => x.id === 'PWA')).length === 0 && !window._gcJobDocs.emergency(window._crm.projects.find(x => x.id === 'PA'))));
const P5 = await A.ev(() => window._crm.projects.find(x => x.id === 'PA2') && 1);

await sleep(3500); await start('PPLAIN'); await sleep(2600);
await start('PME'); g = await gateTxt(); await sleep(1200);
ok('C7 owner 11/16: a planned Environmental mold job waits for the mold disclosure (the Mitigation mold job did not)', /Give the customer Mold disclosure & disclaimer first/.test(g || '') && await pct('PME') === 0, g);
await closeGate();
ok('C6 a construction job is never stopped (its papers are not gates)', P5 && await pct('PPLAIN') === 10 && !await A.ev(() => !!document.getElementById('gc-la3-gate')));
/* ═══ D ═══ */
await A.ev(() => { if (window._navToJob) window._navToJob('PF'); else if (window._openJobDetail) window._openJobDetail(window._crm.projects.find(p => p.id === 'PF')); });
let card = await wait(() => { const c = document.getElementById('gc-jd'); return c && c.getAttribute('data-pid') === 'PF' && c.innerText; }, null, 20000);
if (!card) { await A.ev(() => { window._gcOpenProject = { id: 'PF' }; }); card = await wait(() => { const c = document.getElementById('gc-jd'); return c && c.innerText; }, null, 8000); }
ok('D1 the job page shows 📑 Paperwork with Before / During / At completion', /📑 Paperwork for this job/.test(card || '') && /Before work starts/i.test(card) && /During the job/i.test(card) && /At completion/i.test(card), (card || '').slice(0, 400));
ok('D1 …"needs a form — upload yours" on the paper with no form; the emergency note', /needs a form — upload yours/.test(card) && /Emergency mitigation job/.test(card), (card || '').slice(0, 600));
const cardA = await A.ev(() => window._gcJobDocs.html(window._crm.projects.find(p => p.id === 'PA2')));
ok('D2 an asbestos job\'s card marks Asbestos 01 "🔒 Start job waits for it" until given', /🔒 Start job waits for it/.test(await A.ev(() => window._gcJobDocs.html(window._crm.projects.find(p => p.id === 'PLA')))) && !/Emergency mitigation/.test(cardA));
const allCards = await A.ev(() => window._crm.projects.filter(p => p.jobDocs).map(p => window._gcJobDocs.html(p)).join(' '));
ok('D3 no insurance carrier names and no sub portal on the cards', !/state farm|allstate|geico|usaa|progressive|nationwide|farmers|liberty mutual|travelers|sub ?portal|subcontractor portal/i.test(allCards));
await A.ev(() => { const c = document.getElementById('gc-jd'); if (c) c.scrollIntoView({ block: 'start' }); }); await sleep(400);
await shot(A, 'd1_card');
await A.ev(() => { const c = document.getElementById('gc-jd'); const b = c && c.querySelector('[data-jk="gcb_fire_work_auth"] [data-jd="open"]'); if (b) b.click(); });
await sleep(1500);
await A.ev(() => { const b = [...document.querySelectorAll('button')].find(x => /‹ Back/.test(x.textContent || '') && x.offsetParent); if (b) b.click(); });
await A.ev(() => { window.__zzPause = window._gcPause; window._gcPause = { state: () => ({ paused: true }) }; });
const q0 = QUEUED.length, s0 = SIGNREQ.length;
const r5 = await A.ev(() => window._gcJobDocs.send('PF', 'gcb_fire_work_auth')); await sleep(1500);
ok('D4 ⏸ data-entry mode on → 📤 Send sends nothing', r5 && r5.paused && QUEUED.length === q0 && SIGNREQ.length === s0, r5);
await A.ev(() => { window._gcPause = window.__zzPause; });
{ const f0 = A.fn.length;
  await A.ev(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); window._setProjects(prev => prev.map(p => p.id === 'PC' ? Object.assign({}, p, { type: 'Bath', tags: ['hazard check'], updatedAt: new Date().toISOString() }) : p)); });
  await sleep(3500); await A.ev(() => window._gcJobDocs.sweep());
  /* only what went out for PC, the job getting its list: DOCAUTO2's own timed sweep (45 s after load, then every minute, retried
     because this test's portal-sign refuses) sends other live hazard jobs' papers whenever its timer lands in this window */
  const sends = A.fn.slice(f0).filter(x => (x.name === 'portal' && x.body && x.body.action === 'approval') || (x.name === 'portal-sign' && x.body && x.body.action !== 'list' && String(x.body.projectId || '') === 'PC'));
  ok('D4 assignment itself never sends anything (no approvals / portal requests while a job gets its list)', QUEUED.length === 0 && sends.length === 0, { QUEUED: QUEUED.length, sends: sends.map(x => x.name + ':' + (x.body && x.body.action) + ':' + (x.body && x.body.projectId)) }); }
const r6 = await A.ev(() => window._gcJobDocs.send('POLD', 'gcb_water_emergency_auth').then(j => j && j.ok)); await sleep(1500);
ok('D5 📤 Send (a person\'s click) on a job not yet in the portal flow → ✅ Approvals, written as sent', QUEUED.length === 1 && /Emergency Services Authorization/i.test(QUEUED[0].title || '') && await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'POLD'); return !!(p.jobDocs && p.jobDocs.sent && p.jobDocs.sent.gcb_water_emergency_auth); }), { r6, q: QUEUED.map(x => x.title) });
/* ═══ E ═══ */
const ed = await A.ev(() => { const o = window._gcJobDocs.openEditor(); return !!o && !!document.getElementById('gc-jd-ed') && document.querySelectorAll('#gc-jd-ed fieldset[data-e="type"]').length; });
ok('E1 admin: 📑 Paperwork by job type opens with every job type', ed >= 7, ed);
await A.ev(() => {
  const f = [...document.querySelectorAll('#gc-jd-ed fieldset[data-e="type"]')].find(x => x.getAttribute('data-key') === 'mold');
  f.querySelector('[data-e="iadd"]').click();
  const row = [...f.querySelectorAll('[data-e="item"]')].pop(); row.querySelector('[data-e="label"]').value = 'Moisture map for the mold area'; row.querySelector('[data-e="when"]').value = 'during';
  const fw = [...document.querySelectorAll('#gc-jd-ed fieldset[data-e="type"]')].find(x => x.getAttribute('data-key') === 'fire');
  const op = [...fw.querySelectorAll('[data-e="item"]')].find(r => /Smoke \/ odor cleaning/.test(r.querySelector('[data-e="label"]').value)); op.querySelector('[data-e="src"]').value = 'gcb_completion';
});
await shot(A, 'e1_editor');
await A.ev(() => document.querySelector('#gc-jd-ed [data-e="save"]').click());
const saved = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 10000) { const v = cget('gc_jobdocs_table'); if (v && v.types) return v; await sleep(300); } return null; })();
const mold = saved && saved.types.find(t => t.key === 'mold'), fire = saved && saved.types.find(t => t.key === 'fire');
ok('E2 💾 Save → gc_kv gc_jobdocs_table: the new mold paper (needs a form) and the fire paper now pointing at a form', mold && mold.items.some(x => x.label === 'Moisture map for the mold area' && x.needsForm && x.when === 'during') && fire && fire.items.some(x => /Smoke \/ odor cleaning/.test(x.label) && x.doc === 'gcb_completion') && saved.by && saved.at, saved && { mold: mold && mold.items.map(x => x.label), fire: fire && fire.items.map(x => [x.label, x.doc]) });
ok('E2 …the gates (Lead 01, Asbestos 01) and the rest of the table survive the round trip', saved && saved.types.length === 7 && saved.types.find(t => t.key === 'asbestos').items.some(x => x.doc === 'gcb_asb_01' && x.gate && x.la === 'A01') && saved.types.find(t => t.key === 'construction').company === 'construction');
await A.ev(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); window._setProjects(prev => prev.concat([{ id: 'PNEW2', name: 'Demo mold 2', client: 'Mold Two', clientPhone: '9015550177', address: '77 Demo St, Memphis, TN', type: 'Mold', companyId: 'environmental', status: 'bidding', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }])); });
const pn2 = await wait(() => { const p = window._crm.projects.find(x => x.id === 'PNEW2'); return p && p.jobDocs && p.jobDocs.items && JSON.parse(JSON.stringify(p.jobDocs)); }, null, 12000);
ok('E3 the next mold job uses the edited table (the new paper, marked needs a form)', pn2 && pn2.items.some(x => x.label === 'Moisture map for the mold area' && x.needsForm), pn2 && pn2.items.map(x => x.label));
await sleep(3500);
pm = await jd('PNEW');
ok('E3 …jobs that already had a list pick up the table change (office computer), still no duplicates', pm && pm.items.some(x => x.label === 'Moisture map for the mold area') && new Set(K(pm)).size === K(pm).length, pm && K(pm));
const non = await A.ev(() => { const a = window.__GC_AUTH__, f = a.isAdmin, u = localStorage.getItem('grayco_user'); a.isAdmin = () => false; localStorage.setItem('grayco_user', JSON.stringify({ name: 'Demo PM', role: 'Project Manager' })); const o = window._gcJobDocs.openEditor(); return window._gcJobDocs.saveTable(window._gcJobDocs.DEFAULT).then(r => { a.isAdmin = f; localStorage.setItem('grayco_user', u); return { o: !!o, r }; }); });
ok('E4 a non-admin cannot open or save the table', non && !non.o && non.r.ok === false, non);
await A.ev(() => window._gcJobDocs.assign('POLD', true)); await sleep(800);
ok('E5 ＋ Add on an older job puts its paperwork on it (keeps the paper already sent)', await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'POLD'); return !!(p.jobDocs && p.jobDocs.items && p.jobDocs.items.some(x => x.k === 'gcb_drying_log') && p.jobDocs.sent && p.jobDocs.sent.gcb_water_emergency_auth); }));
ok('Z no page errors / no JOBDOCS errors', A.errs.length === 0 && !await A.ev(() => window.__gcJdErr), { errs: A.errs, jd: await A.ev(() => window.__gcJdErr) });
await A.close();
const pass = R.filter(Boolean).length; console.log(`\n${pass}/${R.length} passed`); process.exit(pass === R.length ? 0 : 1);
