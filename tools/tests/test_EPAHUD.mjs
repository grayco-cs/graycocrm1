// test_EPAHUD.mjs <build-dir> [shot-dir] — patch EPAHUD in the real CRM (node twin: test_EPAHUD_fn.mjs). Offline harness, fake functions, made-up data.
//   A. the HUD lead job's 📑 Paperwork (desk): the EPA / HUD papers by job type, "📑 N papers to send", due dates with the rule, 🏛 facts,
//      📤 Send… → portal / e-mail / text / share; e-mail lands in ✅ Approvals for the OCCUPANT; the log; 👁 open → filled in.
//   B. auto-fill + the company letterhead: a Mitigation and an Environmental job each get their own logo / name and their fields filled.
//   C. the PM on a phone (GrayCo Field): "Needs you · 📑 N papers to send" → 📤 Send → share from the phone (logged); ⏸ data-entry mode
//      holds e-mail (logged as held, nothing queued) while the phone share still works; 📜 My certifications.
//   D. the schedule: a worker with no asbestos license put on the asbestos job → ⛔ and taken off; an admin override is logged;
//      an emergency mitigation job only warns.
import path from 'path'; import fs from 'fs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 900) : '')); };
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const day = n => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const { computer, signIn, sleep, cset, cget, resetCloud, onFn } = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const shot = async (A, name) => { if (SHOTS) await A.page().screenshot({ path: SHOTS + '/' + name + '.png' }); };
const now = new Date().toISOString();
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true, companies: ['construction', 'mitigation', 'environmental'] }, { id: 'u5', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }, { id: 'u6', name: 'Dan Crew', email: 'dan@grayco-cs.com', role: 'Laborer', active: true }]);
const J = (id, o) => Object.assign({ id, name: 'Demo ' + id, client: 'Client ' + id, clientEmail: id.toLowerCase() + '@example.com', clientPhone: '9015550100', address: id + ' Demo St, Memphis, TN 38135', status: 'active', pct: 0, startDate: day(8), endDate: day(20), pm: 'Demo PM', createdAt: now, updatedAt: now }, o);
cset('projects', [
  J('PHUD', { name: 'Demo HUD duplex', type: 'Residential Reno', leadAsb: { yearBuilt: 1955, disturbsPaint: true, hud: true }, epahud: { facts: { tenantOccupied: true }, events: { completedOn: day(-20) }, occupant: { name: 'Tess Tenant', email: 'tess@example.com', phone: '9015550111' } } }),
  /* the GrayCo crew does the asbestos work on these two (envComp.asbBy 'crew'): with patch ENVDOCS the default is a licensed abatement sub and the crew
     is then held to no asbestos license — D is about the crew doing it (no-op without ENVDOCS) */
  J('PENV', { name: 'Demo env abatement', type: 'Asbestos abatement', companyId: 'environmental', startDate: day(3), envComp: { asbBy: 'crew' } }),
  J('PMIT', { name: 'Demo mit job', type: 'Water Damage', companyId: 'mitigation', description: 'Burst pipe — asbestos found in the ceiling texture', envComp: { asbBy: 'crew' } }),
  J('PRRP', { name: 'Demo paint job', type: 'Residential Reno', leadAsb: { yearBuilt: 1962, disturbsPaint: true } })]);
cset('gc_certs', { list: [{ id: 'C1', holderType: 'company', holder: 'company', tpl: 'epa_rrp_firm', name: 'EPA RRP Lead-Safe Certified Firm (TN & AR)', number: 'NAT-F123456-1', state: 'TN/AR', expires: '2030-05-01' }] });
cset('gc_epahud_seed_v1', { at: now });   /* the owner's drafts are a node test; keep this cloud quiet */
cset('schedule', [{ id: 'S1', pid: 'PENV', date: day(3), assignee: 'Wesley Johnson' }]);
const QUEUED = [];
onFn('portal', ({ body }) => { if (body && body.action === 'approval') { QUEUED.push(body); return { ok: true, id: 'AP' + QUEUED.length, queued: true }; } return { ok: true }; });
onFn('portal-sign', ({ body }) => (body && body.action === 'list' ? { ok: true, items: [] } : { ok: false, error: 'test: no portal' }));
const SHARE = 'window.__shared = []; try { Object.defineProperty(navigator, "share", { configurable: true, value: function(d){ window.__shared.push({ title: d.title, files: (d.files || []).length }); return Promise.resolve(); } }); Object.defineProperty(navigator, "canShare", { configurable: true, value: function(){ return true; } }); } catch (e) {}';
const A = await computer('wjohnson@grayco-cs.com', { build: BUILD, init: [SHARE] });
await signIn(A, 'wjohnson@grayco-cs.com', 20000);
const wait = async (A0, f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await A0.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
ok('0 the CRM is up with 🏛 EPAHUD, 📑 JOBDOCS and 🛡 ENVCOMP', !!await wait(A, () => window._gcEpaHud && window._gcJobDocs && window._gcEnvComp && (window._crm.projects || []).length >= 4, null, 60000));
await wait(A, () => ['PHUD', 'PENV', 'PRRP'].every(id => { const p = window._crm.projects.find(x => x.id === id); return p && p.jobDocs && p.jobDocs.items; }), null, 20000);
/* ═ A ═ */
const K = await A.ev(() => window._crm.projects.find(p => p.id === 'PHUD').jobDocs.items.map(x => x.k));
ok('A1 the HUD job got the HUD papers by itself (HUD 01–05, Lead 12 occupant copy, Lead 15 evaluation) + the RRP ones', ['gcb_hud_01', 'gcb_hud_02', 'gcb_hud_03', 'gcb_hud_04', 'gcb_hud_05', 'gcb_lead_12', 'gcb_lead_15', 'gcb_lead_01', 'gcb_lead_08'].every(k => K.includes(k)), K);
await A.ev(() => { if (window._navToJob) window._navToJob('PHUD'); else if (window._openJobDetail) window._openJobDetail(window._crm.projects.find(p => p.id === 'PHUD')); });
let card = await wait(A, () => { const c = document.getElementById('gc-jd'); return c && c.getAttribute('data-pid') === 'PHUD' && c.innerText; }, null, 20000);
if (!card) { await A.ev(() => { window._gcOpenProject = { id: 'PHUD' }; }); card = await wait(A, () => { const c = document.getElementById('gc-jd'); return c && c.innerText; }, null, 8000); }
ok('A2 the job card: "📑 N papers to send · N overdue", 🏛 EPA / HUD facts, HUD 02 OVERDUE with the rule, → occupants', card && /📑 \d+ papers to send/.test(card) && /overdue/.test(card) && /EPA \/ HUD facts/.test(card) && /HUD 02[\s\S]*OVERDUE — was due[\s\S]*35\.125\(b\)\(1\)/.test(card) && /→ Occupants \/ tenants/.test(card), card && card.slice(0, 900));
await A.ev(() => { const c = document.getElementById('gc-jd'); if (c) c.scrollIntoView({ block: 'start' }); }); await sleep(300); await shot(A, 'A2-card');
await A.ev(() => { const b = document.querySelector('#gc-jd [data-jk="gcb_hud_02"] [data-ep="menu"]'); if (b) b.click(); });
let sheet = await wait(A, () => { const o = document.getElementById('gc-ep-sheet'); return o && o.innerText; }, null, 6000);
ok('A3 📤 Send… → 👤 portal / ✉️ e-mail / 📱 text / 📤 share / 👁 open, to the occupant (Tess)', sheet && /portal/i.test(sheet) && /E-mail/.test(sheet) && /Text a link/.test(sheet) && /Share from this phone/.test(sheet) && /Tess/.test(sheet), sheet);
await shot(A, 'A3-send');
await A.ev(() => document.querySelector('#gc-ep-sheet [data-ep-ch="email"]').click());
const q = await wait(A, () => window.__x, null, 100).catch(() => null) || await (async () => { for (let i = 0; i < 40 && !QUEUED.length; i++) await sleep(250); return QUEUED[QUEUED.length - 1]; })();
ok('A4 ✉️ → ✅ Approvals: kind document, e-mail, recipient = the occupant, the filled paper (company letterhead body)', q && q.kind === 'document' && q.channel === 'email' && q.recipient === 'occupant' && q.projectId === 'PHUD' && /NOTICE OF LEAD HAZARD REDUCTION/.test(q.html) && /Tess/.test(q.html), q && Object.assign({}, q, { html: (q.html || '').slice(0, 200) }));
const lg = await wait(A, () => { const p = window._crm.projects.find(x => x.id === 'PHUD'); return (p.jobDocs.log || []).find(e => e.k === 'gcb_hud_02' && e.act === 'sent') || null; }, null, 6000);
const rowTxt = await wait(A, () => { const r = document.querySelector('#gc-jd [data-jk="gcb_hud_02"]'); return r && /Sent/.test(r.innerText) && r.innerText; }, null, 8000);
ok('A5 the send is logged on the paper (who / when / how / levels version) and HUD 02 shows 📤 Sent', lg && lg.by && lg.at && /Approvals/.test(lg.via) && lg.levels && rowTxt, { lg, rowTxt });
const html1 = await A.ev(() => window._gcDocLib.render('gcb_hud_02', 'PHUD').then(r => r && r.page));
ok('A6 HUD 02 opens filled in: customer, address, year built not needed, completion + due dates, no "{…}" left', html1 && /Client PHUD/.test(html1) && /PHUD Demo St/.test(html1) && !/\{[a-z_]+\}/.test(html1), html1 && html1.slice(0, 300));
/* ═ B · auto-fill + the company letterhead ═ */
await wait(A, () => window._gcDocCo && window._gcCoBrand, null, 10000); await sleep(1500);
const pages = await A.ev(async () => { const out = {}; for (const id of ['PMIT', 'PENV', 'PRRP']) { const r = await window._gcDocLib.render('gcb_asb_06', id); out[id] = r && r.page; } return out; });
const logo = h => { const m = /<img[^>]*data-gc-logo-img="1"[^>]*src="([^"]*)"/.exec(h || '') || /<img[^>]*src="([^"]*)"[^>]*data-gc-logo-img="1"/.exec(h || ''); return m ? m[1] : ''; };
const Lm = logo(pages.PMIT), Le = logo(pages.PENV), Lc = logo(pages.PRRP);
ok('B1 the Mitigation job\'s paper: GrayCo Mitigation\'s name + its own logo (not Construction\'s)', /GrayCo Mitigation/i.test(pages.PMIT) && Lm && Lm !== Lc, { Lm: Lm.slice(0, 80), Lc: Lc.slice(0, 80) });
ok('B2 the Environmental job\'s paper: GrayCo Environmental\'s name + its own logo (different from Mitigation\'s and Construction\'s)', /GrayCo Environmental/i.test(pages.PENV) && Le && Le !== Lm && Le !== Lc, { Le: Le.slice(0, 80) });
ok('B3 Construction keeps its logo and the TN / AR / MS license line', /grayco-logo|data:image/.test(Lc) && /85034/.test(pages.PRRP), Lc.slice(0, 80));
ok('B4 each is filled from its own job (customer, address, start / end dates)', ['PMIT', 'PENV'].every(id => pages[id].includes('Client ' + id) && pages[id].includes(id + ' Demo St')) && !/\{[a-z_]+\}/.test(pages.PENV + pages.PMIT), null);
await A.ev(h => { window._gcViewer && window._gcViewer.open({ html: h, name: 'env' }); }, pages.PENV); await sleep(600); await shot(A, 'B2-env-letterhead'); await A.ev(() => { try { window._gcViewer.close(); } catch (e) {} });
/* ═ D · the schedule ═ */
await A.ev(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); window._setSchedule(prev => prev.map(x => x.id === 'S1' ? Object.assign({}, x, { assignee: 'Wesley Johnson, Dan Crew' }) : x)); });
let blk = await wait(A, () => { const o = document.getElementById('gc-ep-sheet'); return o && /not certified/i.test(o.getAttribute('aria-label') || '') && o.innerText; }, null, 15000);
ok('D1 Dan (no asbestos license) on the asbestos job → ⛔ with the reason', blk && /Dan Crew/.test(blk) && /asbestos/i.test(blk), blk);
await shot(A, 'D1-block');
await A.ev(() => document.querySelector('#gc-ep-sheet [data-epb="off"]').click());
const s1 = await wait(A, () => { const x = (window._crm.schedule || []).find(y => y.id === 'S1'); return x && x.assignee === 'Wesley Johnson' && x.assignee; }, null, 8000);
ok('D2 "Take them off" → Dan is off the schedule entry', s1 === 'Wesley Johnson', s1);
await sleep(800);
await A.ev(() => { window.prompt = () => 'Supervisor on site; license renewal in process'; document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); window._setSchedule(prev => prev.map(x => x.id === 'S1' ? Object.assign({}, x, { assignee: 'Wesley Johnson, Dan Crew' }) : x)); });
blk = await wait(A, () => { const o = document.getElementById('gc-ep-sheet'); return o && o.querySelector('[data-epb="over"]') && 1; }, null, 15000);
await A.ev(() => document.querySelector('#gc-ep-sheet [data-epb="over"]').click());
const ov = await wait(A, () => { const p = window._crm.projects.find(x => x.id === 'PENV'); return p && p.epahud && (p.epahud.overrides || []).find(o => o.who === 'Dan Crew') || null; }, null, 8000);
ok('D3 admin override → stays on; logged on the job with who / why / when', ov && /renewal/.test(ov.why) && ov.by && ov.at && await A.ev(() => /Dan Crew/.test((window._crm.schedule.find(y => y.id === 'S1') || {}).assignee)), ov);
await A.ev(() => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); window._setSchedule(prev => prev.concat([{ id: 'S2', pid: 'PMIT', date: new Date().toISOString().slice(0, 10), assignee: 'Dan Crew' }])); });
const wn = await wait(A, () => { const o = document.getElementById('gc-ep-sheet'); return o && o.querySelector('[data-ep-block="warn"]') && o.innerText; }, null, 15000);
await sleep(1500);
const s2 = await A.ev(() => { const L = (window._gcEnvComp && window._gcEnvComp._sched ? window._gcEnvComp._sched().list : null) || window._crm.schedule || []; return (L.find(x => x.id === 'S2') || {}).assignee || ''; });
ok('D4 the emergency mitigation job → a warning only; Dan stays on it', wn && /emergency/i.test(wn) && !/Take them off/.test(wn) && s2 === 'Dan Crew', { wn, s2 });
await A.ev(() => { const o = document.getElementById('gc-ep-sheet'); if (o) o.remove(); });
const errsA = A.errs.filter(e => /EpaHud|epahud|_gcEpaHud/i.test(e));
await A.close();
/* ═ C · the PM on a phone ═ */
const B = await computer('pm@grayco-cs.com', { build: BUILD, mobile: true, init: [SHARE] });
await signIn(B, 'pm@grayco-cs.com', 20000);
ok('C0 the PM\'s phone is up', !!await wait(B, () => window._gcEpaHud && (window._crm.projects || []).length >= 4, null, 60000));
await wait(B, () => { if (!document.querySelector('#_gcJobPick.gc-fh') && window._gcField && window._gcField.open) { try { window._gcField.open(); } catch (e) {} } return document.querySelector('#_gcJobPick.gc-fh'); }, null, 30000);
let fh = await wait(B, () => { const b = document.getElementById('gc-ep-field'); return b && b.innerText; }, null, 20000);
ok('C1 GrayCo Field home: "Needs you · 📑 N papers to send" with due dates (the PM\'s jobs) + 📜 My certifications', fh && /Needs you · 📑 \d+ papers? to send/i.test(fh) && /OVERDUE|Due/.test(fh) && /My certifications/.test(fh), fh);
await shot(B, 'C1-field-needs-you');
await B.ev(() => { const OUT = /^gcb_(hud_0[1235]|lead_0[129]|lead_12|asb_0[16]|lead_03)$/; const r = [...document.querySelectorAll('#gc-ep-field [data-ep-pid]')].find(x => OUT.test(x.getAttribute('data-ep-k'))); if (r) { window.__k = r.getAttribute('data-ep-k'); window.__pid = r.getAttribute('data-ep-pid'); r.querySelector('[data-ep-fa="send"]').click(); } else { window.__k = 'gcb_hud_03'; window.__pid = 'PHUD'; window._gcEpaHud.menu('PHUD', 'gcb_hud_03'); } });
await wait(B, () => document.querySelector('#gc-ep-sheet [data-ep-ch="share"]'), null, 6000);
await shot(B, 'C2-send-sheet');
await B.ev(() => document.querySelector('#gc-ep-sheet [data-ep-ch="share"]').click());
const sh = await wait(B, () => (window.__shared || []).length && window.__shared[0], null, 20000);
const lg2 = await wait(B, () => { const p = window._crm.projects.find(x => x.id === window.__pid); return ((p.jobDocs || {}).log || []).find(e => e.k === window.__k && e.act === 'shared') || null; }, null, 8000);
ok('C2 📤 share from the phone → the phone\'s share sheet with the paper; logged on the paper', sh && sh.title && lg2 && lg2.by === 'Demo PM', { sh, lg2 });
/* ⏸ data-entry mode */
await B.ev(() => { window.__realPause = window._gcPause.state; window._gcPause.state = () => ({ paused: true, note: 'until Jan 3' }); });
const n0 = QUEUED.length;
const held = await B.ev(() => window._gcEpaHud.sendVia('PRRP', 'gcb_lead_01', 'email'));
const sh2 = await B.ev(() => window._gcEpaHud.sendVia('PRRP', 'gcb_lead_01', 'share'));
await sleep(800);
const lg3 = await B.ev(() => ((window._crm.projects.find(x => x.id === 'PRRP').jobDocs || {}).log || []).filter(e => e.k === 'gcb_lead_01').map(e => e.act));
ok('C3 ⏸ data-entry mode: e-mail held with a clear note (nothing queued, logged "held"); the phone share still goes', held && held.held === true && QUEUED.length === n0 && sh2 && sh2.ok && lg3.includes('held') && lg3.includes('shared'), { held, sh2, lg3 });
await B.ev(() => { window._gcPause.state = window.__realPause; });
await B.ev(() => document.querySelector('#gc-ep-field [data-ep-fa="certs"]') && document.querySelector('#gc-ep-field [data-ep-fa="certs"]').click());
const mc = await wait(B, () => { const o = document.getElementById('gc-ep-sheet'); return o && /My certifications/.test(o.getAttribute('aria-label') || '') && o.innerText; }, null, 6000);
ok('C4 📜 My certifications: read-only list + 📷 upload a card', mc && /Upload a card/.test(mc), mc);
const errsB = B.errs.filter(e => /EpaHud|epahud|_gcEpaHud/i.test(e));
ok('Z no EPAHUD page errors', !errsA.length && !errsB.length, errsA.concat(errsB));
await B.close();
const pass = R.filter(Boolean).length; console.log(`\n${pass}/${R.length} passed`); process.exit(pass === R.length ? 0 : 1);
