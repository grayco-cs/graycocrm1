// test_ENVDOCS.mjs <build-dir> [shot-dir] — ENVDOCS in the CRM (offline harness, made-up data, no live writes):
//   A (admin): the 🛡 Compliance panel's 7 · Employee Protection Plan (⚠ until generated and signed, every version kept, printable),
//      ⛔ when the rules say so; the lead decon set-up (⚠ until checklist + photo) and its daily-log fields; asbestos → a licensed sub by
//      default (the sub's papers kept, the plan shows the sub + the crew's awareness duties); ⚙ Written programs (administrator from the
//      people list, approval, a filled copy of the Word program with the current address); the sign set in the company's branding with
//      the legend unchanged (job + 🖨 Print pack → Environmental signs); To-Dos; the record package lists every plan version.
//   A11: every document is filled from the CRM in the job's own company (a Mitigation and an Environmental job: logo, name, facts;
//      Construction keeps its letterhead + license line; a Word program filled for a Mitigation job).
//   B (PM): sees the plan; cannot approve it as the owner.
import { createRequire } from 'module'; import path from 'path'; import fs from 'fs';
const require = createRequire(import.meta.url);
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 900) : '')); };
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const H = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const { computer, signIn, sleep, cset, cget, resetCloud, onFn } = H;
const C = require(path.join(BUILD, 'envcomp-core.js'));
const day = n => C.addDays(C.today(), n);
const shot = async (A, name) => { if (SHOTS) await A.page().screenshot({ path: SHOTS + '/' + name + '.png' }); };
const at = new Date(Date.now() - 864e5).toISOString();
onFn('envcomp', async ({ body }) => (body && body.op === 'mine' ? { ok: true, rec: { name: 'Wesley Johnson', summary: [], notices: [], visits: [{ id: 'v1', date: '2026-11-10', type: 'bloodLead', result: '52 µg/dL', provider: 'Demo Clinic' }], exposures: [{ id: 'x1', date: '2026-11-09', job: 'Demo Lead Abatement', method: 'Lead air (µg/m³)', result: '35', scope: 'personal' }] } } : { ok: true, removals: [], rec: {}, people: {} }));

resetCloud();
cset('users', [
  { id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true, phone: '(901) 555-0111' },
  { id: 'u2', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office Manager', active: true },
  { id: 'u5', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true },
  { id: 'u6', name: 'Demo Estimator', email: 'sbiffle@grayco-cs.com', role: 'Environmental Tech', active: true },
  { id: 'u7', name: 'Wes Worker', email: 'wworker@example.com', role: 'Abatement Worker', active: true }]);
cset('projects', [
  { id: 'P1', name: 'Demo Asbestos Job', client: 'Ann Demo', type: 'Asbestos abatement', companyId: 'environmental', address: '21 Demo St, Memphis, TN 38103', status: 'active', pct: 10, startDate: day(-2), abatementSupervisor: 'Demo Estimator', crew: ['Wes Worker'], pm: 'Demo PM', createdAt: at, updatedAt: at },
  { id: 'P2', name: 'Demo Kitchen Remodel', client: 'Bo Demo', type: 'Kitchen remodel', address: '22 Demo St, Memphis, TN 38103', status: 'active', pct: 10, startDate: day(-2), pm: 'Demo PM', createdAt: at, updatedAt: at },
  { id: 'P3', name: 'Demo Lead Abatement', client: 'Cy Demo', type: 'Lead abatement', companyId: 'environmental', address: '23 Demo Rd, Little Rock, AR 72201', status: 'active', pct: 20, startDate: day(-3), abatementSupervisor: 'Demo Estimator', crew: ['Wes Worker'], pm: 'Demo PM', createdAt: at, updatedAt: at },
  { id: 'P5', name: 'Demo Mitigation Mold Job', client: 'Eve Demo', type: 'Mold remediation', companyId: 'mitigation', address: '25 Demo St, Memphis, TN 38103', status: 'active', pct: 10, startDate: day(-1), supervisor: 'Demo Estimator', pm: 'Demo PM', envComp: { mode: 'on' }, createdAt: at, updatedAt: at },
  { id: 'P4', name: 'Demo Mold Job', client: 'Di Demo', type: 'Mold remediation', companyId: 'environmental', address: '24 Demo St, Memphis, TN 38103', status: 'active', pct: 10, startDate: day(-1), pm: 'Demo PM', createdAt: at, updatedAt: at }]);
cset('gc_certs', { list: [
  { id: 'CE3', holderType: 'person', holder: 'wjohnson@grayco-cs.com', holderName: 'Wesley Johnson', ckind: 'lead_supervisor', name: 'Lead Abatement Supervisor Initial', issuer: 'Seagull Environmental Training', state: 'AR', issued: '2026-11-16', expires: day(364) },
  { id: 'CE4', holderType: 'person', holder: 'wjohnson@grayco-cs.com', holderName: 'Wesley Johnson', ckind: 'rrp_renovator', name: 'Lead Renovator (RRP)', issued: '2026-11-06', expires: day(1800) },
  { id: 'CE5', holderType: 'person', holder: 'sbiffle@grayco-cs.com', holderName: 'Demo Estimator', ckind: 'lead_supervisor', name: 'Lead Abatement Supervisor', state: 'AR', expires: day(300) }], updatedAt: at });
cset('schedule', []);

const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
await signIn(A, 'wjohnson@grayco-cs.com', 20000);
const wait = async (X, f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await X.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
ok('A0 the CRM is up with ENVCOMP + ENVDOCS', !!await wait(A, () => window._gcEnvComp && window._gcEnvDocs && (window._crm.projects || []).length >= 5 && typeof window._navToJob === 'function', null, 60000));
await A.ev(() => window._gcEnvComp.pullCerts()); await sleep(800);
const evalJob = (X, pid) => X.ev(pid => { const p = window._crm.projects.find(x => x.id === pid); const e = window._gcEnvComp.evaluate(p); return { status: e.status, kinds: e.kinds, asbBy: e.asbBy, plan: e.plan, items: e.items.map(i => ({ id: i.id, sec: i.sec, st: i.st, note: i.note, label: i.label })) }; }, pid);
const open = async (X, pid) => { await X.ev(() => { try { window._setView('projects'); } catch (e) {} }); await sleep(900); await X.ev(id => window._navToJob(id), pid); };
const job = (X, pid) => X.ev(pid => JSON.parse(JSON.stringify(window._crm.projects.find(x => x.id === pid))), pid);

/* 1 · the plan section on the panel, ⚠ until generated */
await open(A, 'P3');
const pan = await wait(A, () => { const c = document.getElementById('gc-ec'); return c && c.getAttribute('data-pid') === 'P3' && c.querySelector('[data-ed-sec="plan"]') ? c.textContent : null; });
ok('A1 a lead abatement job: 7 · Employee Protection Plan, 🧼 Decon unit and 🪧 Signs on the 🛡 Compliance panel', !!pan && /7 · Employee Protection Plan/.test(pan) && /Decon unit/.test(pan) && /Signs/.test(pan), pan && pan.slice(0, 600));
let E3 = await evalJob(A, 'P3');
ok('A1 the plan is ⚠ until it is generated', E3.items.find(i => i.id === 'epp').st === 'due' && E3.plan.st === 'none', E3.plan);
await A.ev(() => { const e = document.querySelector('#gc-ec [data-ed-sec="plan"]'); if (e) e.scrollIntoView(); }); await shot(A, 'a1_panel');

/* 2 · generate → a version, printable */
await A.ev(() => document.querySelector('#gc-ec [data-ed="plan"]').click());
const plan1 = await wait(A, () => { const p = window._crm.projects.find(x => x.id === 'P3'); const L = (p.envLog || []).filter(r => r.kind === 'epp'); return L.length === 1 && window.__gcEdPlan ? { rec: L[0], html: window.__gcEdPlan.html } : null; }, null, 15000);
ok('A2 📝 Generate → version 1 is kept on the job (envLog) with the plan', !!plan1 && plan1.rec.v === 1 && plan1.rec.plan.sections.length >= 20 && plan1.rec.retainCat, plan1 && plan1.rec);
const ph = plan1 ? plan1.html.replace(/<[^>]+>/g, ' ') : '';
ok('A2 the printable plan: every part + the signature lines (competent person, owner)', ['EMPLOYEE PROTECTION PLAN', 'Engineering controls', 'Work-practice controls', 'Respiratory protection', 'Protective clothing', 'Hygiene facilities and decon unit', 'Housekeeping', 'Exposure monitoring schedule', 'Medical surveillance and medical removal', 'Training', 'Signs and labels', 'Competent person', 'Inspection schedule', 'Record keeping', 'Emergency contacts', 'Competent person — signature', 'Owner — signature'].every(t => ph.indexOf(t) >= 0), ph.slice(0, 500));
ok('A2 the program administrator comes from the people list (the admin with the lead supervisor certification) — Wesley Johnson', /administrator Wesley Johnson/.test(ph) && /Demo Estimator/.test(ph) && /GrayCo Environmental, LLC/.test(ph));
E3 = await evalJob(A, 'P3');
ok('A2 generated but not signed → still ⚠', E3.plan.st === 'unsigned' && E3.items.find(i => i.id === 'epp').st === 'due', E3.plan);

/* 3 · sign: competent person + owner → ✅ */
await A.ev(id => window._gcEnvDocs.sign('P3', id, 'cp'), plan1.rec.id); await sleep(700);
await A.ev(id => window._gcEnvDocs.sign('P3', id, 'owner'), plan1.rec.id); await sleep(900);
E3 = await evalJob(A, 'P3');
const r3 = (await job(A, 'P3')).envLog.find(r => r.kind === 'epp');
ok('A3 signed by the competent person and the owner (names + times, the earlier state kept) → ✅', E3.items.find(i => i.id === 'epp').st === 'ok' && r3.signed.cp.name === 'Wesley Johnson' && r3.signed.owner.at && r3.versions.length === 2, { plan: E3.plan, r3: r3 && r3.signed });
const pan3 = await wait(A, () => { const c = document.getElementById('gc-ec'); return c && /✍ Wesley Johnson/.test(c.innerText) ? c.innerText : null; });
ok('A3 the panel shows the signatures on v1', !!pan3);

/* 4 · ⛔ when the rules say so */
let sv = await A.ev(() => window._gcEnvDocs.savePrograms(null, { planBlock: true }));
ok('A4 ⚙ Written programs → "a missing plan blocks": the mold job without a plan → ⛔', sv.ok && (await evalJob(A, 'P4')).items.find(i => i.id === 'epp').st === 'block');
await A.ev(() => window._gcEnvDocs.savePrograms(null, { planBlock: false }));

/* 5 · the decon unit */
let dI = E3.items.find(i => i.id === 'decon');
ok('A5 the decon set-up is ⚠ until the checklist is done and photographed (labelled "confirm with your state program")', dI && dI.st === 'due' && /confirm with your state program/i.test(dI.note), dI);
const nSetup = C.DEFAULT_RULES.decon.setup.length;
await A.ev(n => { const chk = {}; for (let i = 0; i < n; i++) chk[i] = true; return window._gcEnvDocs.saveDecon('P3', { type: 'Portable decon trailer', location: 'Driveway, next to the side door', setBy: 'Demo Estimator', setOn: window._gcEnvCompCore.today(), chk: chk, water: 'Collected in a drum, filtered, taken to the shop' }); }, nSetup);
await sleep(900);
ok('A5 the checklist without a photo → still ⚠', (await evalJob(A, 'P3')).items.find(i => i.id === 'decon').st === 'due');
const stored = await A.ev(() => typeof window._gcStoreFile === 'function');
if (!stored) await A.ev(() => { window._gcStoreFile = f => Promise.resolve({ ref: 'test-ref-' + f.name, name: f.name }); });
await A.ev(n => { const chk = {}; for (let i = 0; i < n; i++) chk[i] = true; return window._gcEnvDocs.saveDecon('P3', { type: 'Portable decon trailer', location: 'Driveway, next to the side door', setBy: 'Demo Estimator', chk: chk, photos: [new File(['jpg'], 'decon.jpg', { type: 'image/jpeg' })] }); }, nSetup);
const dOk = await wait(A, () => { const p = window._crm.projects.find(x => x.id === 'P3'); const e = window._gcEnvComp.evaluate(p); const d = e.items.find(i => i.id === 'decon'); return d && d.st === 'ok' ? d.note : null; }, null, 12000);
ok('A5 checklist + photo → ✅ (type, location, who set it up, both set-ups kept)', !!dOk && /Portable decon trailer at Driveway/.test(dOk) && (await job(A, 'P3')).envLog.filter(r => r.kind === 'decon').length === 2, dOk);
await A.ev(() => window._gcEnvComp.dailyForm('P3'));
const dl = await wait(A, () => { const m = document.querySelector('[data-ec-daily="P3"]'); return m ? { t: m.innerText, ph: !!m.querySelector('input[data-file="ph_deconPhotos"]'), sp: !!m.querySelector('input[data-file="ph_signPhotos"]'), dc: !!m.querySelector('[data-c="deconOk"]'), dw: !!m.querySelector('[data-c="deconWater"]') } : null; });
ok('A5 the daily log: decon checked / supplies, wash water handled, decon photo; signs posted + photo', dl && dl.ph && dl.sp && dl.dc && dl.dw && /Decon \/ hygiene/i.test(dl.t), dl && { ph: dl.ph, sp: dl.sp, dc: dl.dc, dw: dl.dw });
await A.ev(() => { const m = document.getElementById('gc-ec-modal'); if (m) m.remove(); });
await A.ev(() => window._gcEnvComp.logDaily('P3', { values: { deconNote: 'restocked towels' }, chk: { deconOk: true, deconWater: true, signs: true }, photosBy: { signPhotos: [new File(['jpg'], 'signs.jpg', { type: 'image/jpeg' })], deconPhotos: [new File(['jpg'], 'decon-day.jpg', { type: 'image/jpeg' })] } }));
const dayRec = await wait(A, () => { const p = window._crm.projects.find(x => x.id === 'P3'); const r = (p.envLog || []).find(x => x.kind === 'compday'); return r && (r.photos || []).length >= 2 ? r : null; });
ok('A5 the day\'s log keeps the decon check, wash water and the photos by field', !!dayRec && dayRec.values.deconOk === true && dayRec.values.deconWater === true && dayRec.photos.some(x => x.f === 'signPhotos') && dayRec.photos.some(x => x.f === 'deconPhotos'), dayRec && dayRec.photos);
const blank = await A.ev(() => window._gcEnvDocs.deconBlankHtml()), buy = await A.ev(() => window._gcEnvDocs.purchaseHtml());
ok('A5 the one-page blank checklist with the layout diagram and the purchase list print', /data-ed-diagram/.test(blank) && /DIRTY ROOM/.test(blank) && /WASH/.test(blank) && /CLEAN ROOM/.test(blank) && /PURCHASE LIST/.test(buy) && /Wash-water collection drum/.test(buy));
E3 = await evalJob(A, 'P3');
ok('A5 the decon set-up changed the job → the signed plan asks for a new version (v1 kept)', E3.plan.st === 'stale', E3.plan);

/* 6 · asbestos: a licensed sub by default */
let E1 = await evalJob(A, 'P1');
ok('A6 an asbestos job → "Asbestos work by: licensed sub" (owner 11/17); the crew is not held to abatement licenses', E1.asbBy === 'sub' && !E1.items.some(i => /^asb-worker/.test(i.id)) && E1.items.find(i => i.id === 'sub-firm').st === 'block', E1.items.filter(i => i.sec === 'sub'));
await open(A, 'P1');
const pan1 = await wait(A, () => { const c = document.getElementById('gc-ec'); const s = c && c.getAttribute('data-pid') === 'P1' && c.querySelector('[data-ed-asb]'); return s ? { v: s.value, t: c.innerText } : null; });
ok('A6 the panel: the "Asbestos work by" choice (Licensed abatement sub selected) and the sub\'s papers', pan1 && pan1.v === 'sub' && /Licensed abatement sub/.test(pan1.t) && /awareness level/.test(pan1.t), pan1 && pan1.t.slice(0, 400));
await A.ev(() => window._gcEnvDocs.saveSub('P1', { company: 'Demo Abatement LLC', license: 'TN-ASB-0001', state: 'TN', licenseExp: window._gcEnvCompCore.addDays(window._gcEnvCompCore.today(), 200), competent: 'Ann Supervisor', competentLic: 'SUP-77', competentPhone: '(901) 555-0123', on_notice: window._gcEnvCompCore.addDays(window._gcEnvCompCore.today(), -12), conf: 'TDEC-9001', on_workPlan: window._gcEnvCompCore.today(), files: {} }));
const subOk = await wait(A, () => { const p = window._crm.projects.find(x => x.id === 'P1'); const e = window._gcEnvComp.evaluate(p); return e.items.find(i => i.id === 'sub-firm').st === 'ok' && (p.envLog || []).some(r => r.kind === 'asbsub') ? e.items.filter(i => i.sec === 'sub').map(i => i.id + ':' + i.st) : null; }, null, 12000);
ok('A6 the sub\'s license, competent person, notice confirmation saved → ✅ and kept as a record', !!subOk && subOk.includes('sub-cp:ok') && subOk.includes('sub-notice:ok'), subOk);
await A.ev(() => window._gcEnvDocs.generate('P1')); await sleep(900);
const ap = await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'P1'); const r = (p.envLog || []).filter(x => x.kind === 'epp').pop(); return window._gcEnvDocs.planHtml(r, p).replace(/<[^>]+>/g, ' '); });
ok('A6 the asbestos plan: the sub (company, license, competent person, notice #, its air monitoring) + the crew\'s awareness duties', /Demo Abatement LLC/.test(ap) && /TN-ASB-0001/.test(ap) && /Ann Supervisor/.test(ap) && /TDEC-9001/.test(ap) && /by the subcontractor/.test(ap) && /STOP WORK/.test(ap) && /Asbestos Awareness and Control Program/.test(ap), ap.slice(0, 400));
await A.ev(() => { window.confirm = () => true; }); await A.ev(() => window._gcEnvDocs.setAsbBy('P1', 'crew')); await sleep(800);
E1 = await evalJob(A, 'P1');
ok('A6 switched to "GrayCo crew": the crew licenses apply and the GrayCo Asbestos Program shows NOT IN USE; the plan asks for a new version', E1.asbBy === 'crew' && E1.items.some(i => i.id === 'asbcrew' && /NOT IN USE/.test(i.note)) && E1.plan.st === 'stale' && (await job(A, 'P1')).envComp.asbByHistory.length === 1, E1.plan);
await A.ev(() => window._gcEnvDocs.setAsbBy('P1', 'sub')); await sleep(500);

/* 7 · ⚙ Written programs + a filled Word copy */
await A.ev(() => window._gcEnvDocs.programsSheet());
const ps = await wait(A, () => { const m = document.querySelector('[data-ed-programs]'); return m ? m.innerText + ' ' + [].map.call(m.querySelectorAll('input[data-p="adminName"]'), i => i.placeholder).join(' | ') : null; });
ok('A7 ⚙ Written programs: every program, the default administrator from the people list, the GrayCo Asbestos Program not in use', !!ps && /Respiratory Protection Program/.test(ps) && /GrayCo Asbestos Program/.test(ps) && /Wesley Johnson \(default: the admin holding the Lead abatement supervisor certification\)/.test(ps), ps && ps.slice(0, 500));
await A.ev(() => { const m = document.getElementById('gc-ec-modal'); if (m) m.remove(); });
sv = await A.ev(() => { const L = JSON.parse(JSON.stringify(window._gcEnvComp.rules().programs)).map(r => r.id === 'resp' ? Object.assign(r, { adminPhone: '(901) 555-0199', approvedBy: 'Wesley Johnson', approvedOn: '2026-11-17', reviewed: '2026-11-17' }) : r); return window._gcEnvDocs.savePrograms(L, {}); });
ok('A7 the approval and review are saved for every computer (gc_envcomp_rules) with a history', sv.ok && (cget('gc_envcomp_rules') || {}).programs.find(r => r.id === 'resp').approvedBy === 'Wesley Johnson');
const filled = await A.ev(() => window._gcEnvDocs.fillDocx('resp', false).then(o => o ? { xml: o.xml.replace(/<[^>]+>/g, ''), size: o.blob.size, addr: window._gcCompanyAddress() } : null));
ok('A7 📄 Filled copy of the Respiratory Protection Program: administrator, phone, approval and the current company address', !!filled && /Program administrator: Wesley Johnson/.test(filled.xml) && /Phone: \(901\) 555-0199/.test(filled.xml) && /Approved by \(owner\): Wesley Johnson/.test(filled.xml) && /Date: 11\/17\/2026/.test(filled.xml) && filled.xml.indexOf(filled.addr + '  |') >= 0 && filled.size > 5000, filled && { addr: filled.addr, head: filled.xml.slice(0, 300) });

/* 8 · the signs */
const sg = await A.ev(() => window._gcEnvDocs.printSigns(null, { pid: 'P3', size: 'tabloid', bilingual: true }).then(() => window.__gcEdSigns.html));
const sgText = sg.replace(/<[^>]+>/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
const unesc = t => t.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const sgLines = sgText.map(unesc);
let allLegend = true; const missing = []; C.SIGNS.forEach(g => g.lines.forEach(l => { if (!sgLines.includes(l)) { allLegend = false; missing.push(g.id + ': ' + l); } }));
ok('A8 every sign prints with its legend exactly as written', allLegend && (sg.match(/data-sign=/g) || []).length === C.SIGNS.length, missing);
ok('A8 each sign carries the company band (GrayCo Environmental, LLC + phone + logo) and the Spanish lines; 11 × 17 page size', (sg.match(/data-sg="brand"/g) || []).length === C.SIGNS.length && /GrayCo Environmental, LLC  \|  \(/.test(unesc(sg)) && /grayco-environmental-logo/.test(sg) && /PELIGRO – ÁREA DE TRABAJO CON PLOMO/.test(sg) && /@page\{size:11in 17in/.test(sg));
if (SHOTS) { const pg = await A.ctx.newPage(); await pg.setViewportSize({ width: 1100, height: 1700 }); await pg.goto('http://app.local/portal-logo.png').catch(() => {}); await pg.setContent(sg).catch(() => {}); await sleep(800); await pg.screenshot({ path: SHOTS + '/a8_signs.png' }).catch(() => {}); await pg.close(); }
const shop = await A.ev(() => window._gcEnvDocs.printSigns(['lead_danger'], { pid: 'P3', size: 'shop', bilingual: false, pdf: true }).then(r => ({ r, html: window.__gcEdSigns.html })));
ok('A8 18 × 24 print-shop size (PDF, or the printable page when the PDF library cannot load)', shop.r && shop.r.ok && /@page\{size:18in 24in/.test(shop.html) && !/PELIGRO/.test(shop.html));
await open(A, 'P3'); await wait(A, () => { const c = document.getElementById('gc-ec'); return c && c.getAttribute('data-pid') === 'P3' && c.querySelector('[data-ed="signs"]'); });
await A.ev(() => { window.__gcEdSigns = null; document.querySelector('#gc-ec [data-ed="signs"]').click(); });
const js = await wait(A, () => window.__gcEdSigns && window.__gcEdSigns.ids);
ok('A8 the job\'s 🪧 Print this job\'s signs: the lead + decon signs, no asbestos / mold ones', !!js && js.includes('lead_danger') && js.includes('decon_dirty') && js.includes('lead_waste') && !js.includes('asb_danger') && !js.includes('mold'), js);
await A.ev(() => window._gcOpenPrintPack());
const card = await wait(A, () => { const c = document.querySelector('[data-ed-signs]'); return c ? c.querySelectorAll('[data-ed-sign]').length : 0; }, null, 30000);
ok('A8 🖨 Print pack → "Environmental signs" with every sign', card === C.SIGNS.length, card);
if (card) { await A.ev(() => { window.__gcEdSigns = null; document.querySelector('[data-ed-sign="decon_wash"] [data-a="ed-sign"]').click(); }); const one = await wait(A, () => window.__gcEdSigns && window.__gcEdSigns.ids); ok('A8 printing one sign from the Print pack', JSON.stringify(one) === '["decon_wash"]', one); }
await shot(A, 'a8_printpack');

/* 8b · TCLP waste characterization */
await A.ev(() => window._gcEnvDocs.logTclp('P3', { stream: 'Lead paint chips / debris', date: window._gcEnvCompCore.today(), sampler: 'Demo Estimator', containers: 'B-01 to B-06', lab: 'Demo Lab', coc: 'COC-777', result: '', files: { file: [new File(['pdf'], 'coc.pdf', { type: 'application/pdf' })] } }));
const wPend = await wait(A, () => { const p = window._crm.projects.find(x => x.id === 'P3'); const e = window._gcEnvComp.evaluate(p); const w = e.items.find(i => i.id === 'waste:lead paint chips / debris'); return w && (p.envLog || []).some(r => r.kind === 'tclp') ? w : null; }, null, 12000);
ok('A10 a TCLP sample waiting on the lab → the stream is ⚠ "not yet characterized" (sampler, containers, lab, COC kept)', !!wPend && wPend.st === 'due' && /waiting on the lab/.test(wPend.note) && (await job(A, 'P3')).envLog.find(r => r.kind === 'tclp').coc === 'COC-777', wPend);
const refused = await A.ev(() => window._gcEnvDocs.logShip('P3', { stream: 'Lead paint chips / debris', manifest: 'MAN-9', disposedOn: window._gcEnvCompCore.today() }));
ok('A10 it cannot be shipped / marked disposed until it is characterized', refused === false && !(await job(A, 'P3')).envLog.some(r => r.kind === 'wship'));
const tid = (await job(A, 'P3')).envLog.find(r => r.kind === 'tclp').id;
await A.ev(id => window._gcEnvDocs.tclpResult('P3', id, '7.5'), tid); await sleep(800);
let wH = (await evalJob(A, 'P3')).items.find(i => i.id === 'waste:lead paint chips / debris');
ok('A10 the lab result 7.5 mg/L vs 5.0 → HAZARDOUS (the earlier "pending" kept as a version)', /HAZARDOUS/.test(wH.label) && /7\.5 mg\/L lead vs 5/.test(wH.note) && (await job(A, 'P3')).envLog.find(r => r.kind === 'tclp').versions.length === 1, wH);
await A.ev(() => window._gcEnvDocs.logShip('P3', { stream: 'Lead paint chips / debris', date: window._gcEnvCompCore.today(), containers: 'B-01 to B-06', manifest: 'MAN-9', hauler: 'Demo Hauler', tsd: 'Demo TSD', generatorStatus: 'SQG', disposedOn: window._gcEnvCompCore.today() })); await sleep(800);
wH = (await evalJob(A, 'P3')).items.find(i => i.id === 'waste:lead paint chips / debris');
ok('A10 shipped with the manifest, hauler, TSD facility and generator status → ✅', wH.st === 'ok' && /1 shipment/.test(wH.note), wH);
await open(A, 'P3');
const wPan = await wait(A, () => { const c = document.getElementById('gc-ec'); return c && c.querySelector('[data-ed-sec="waste"]') ? c.textContent : null; });
ok('A10 the panel: ♻️ Waste — TCLP with the stream and the threshold', !!wPan && /Waste — TCLP/.test(wPan) && /Lead paint chips \/ debris/.test(wPan) && /5 mg\/L lead/.test(wPan));

/* 9 · To-Dos, the record package, the company documents */
await A.ev(() => window._gcEnvDocs.sweep());
const tasks = await A.ev(() => JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'));
ok('A9 To-Dos: the mold job\'s plan, the yearly program reviews (to the administrator); none for programs just reviewed', tasks.some(t => t.id === 'ENVDOCS_E_P4' && !t.done) && tasks.some(t => t.id === 'ENVDOCS_R_lead' && t.assignee === 'Wesley Johnson') && !tasks.some(t => t.id === 'ENVDOCS_R_resp') && !tasks.some(t => t.pid === 'P2'), tasks.filter(t => /^ENVDOCS/.test(t.id)).map(t => t.id));
const pkg = await A.ev(() => window._gcEnvComp.pkgLines(window._crm.projects.find(x => x.id === 'P3')).map(x => x.h || x.h2 || x.t).join('\n'));
ok('A9 the record package lists every plan version with its signatures, the decon set-ups and the TCLP samples + shipments', /Waste characterization \(TCLP\)/.test(pkg) && /COC COC-777/.test(pkg) && /manifest MAN-9/.test(pkg) && /Employee Protection Plan — every version/.test(pkg) && /Version 1 .* competent person: Wesley Johnson/.test(pkg) && /Decon set-up/.test(pkg), pkg.slice(-600));
const files = await A.ev(() => Promise.all(['GrayCo_Lead_Safety_Program_v2.docx', 'GrayCo_Asbestos_Program.docx', 'GrayCo_Lead_Decon_Unit_Setup_Checklist.pdf', 'GrayCo_Lead_Safety_Program.docx'].map(f => fetch('/company-docs/01667c529f454cf1/' + f).then(r => r.status))));
ok('A9 the new program files are served, the earlier versions still are', files.every(x => x === 200), files);
/* 11 · every document filled from the CRM, in the job's own company (owner: "auto-fill … the logo of the correct company") */
const docs = await A.ev(() => { const D = window._gcEnvDocs, pj = id => window._crm.projects.find(x => x.id === id);
  const mk = id => { const p = pj(id), E = window._gcEnvComp.evaluate(p); return D.planHtml({ v: 1, date: window._gcEnvCompCore.today(), plan: window._gcEnvCompCore.buildPlan(p, { rules: window._gcEnvComp.rules(), certs: [], users: window._crm.users, schedule: [], medStatus: {}, today: window._gcEnvCompCore.today(), company: () => 'x', E: E }, { v: 1 }), signed: {} }, p); };
  return { mitPlan: mk('P5'), envPlan: mk('P3'), mitSigns: D.signsHtml(null, { pid: 'P5', size: 'letter' }), envSigns: D.signsHtml(['lead_waste', 'asb_waste'], { pid: 'P3', size: 'letter' }), decon: D.deconSheetHtml('P3'), waste: D.wasteHtml('P3'), notices: D.noticesHtml('P1'), mitNotices: D.noticesHtml('P5'), conHead: D.jobHead(pj('P2'), 'TEST') }; });
const txt = h => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
const MIT = '/img/grayco-mitigation-logo.png', ENV = '/img/grayco-environmental-logo.png';
ok('A11 a Mitigation job\'s plan: the Mitigation logo + name, filled (job, customer, address, PM, start, crew, competent person, program administrator)', docs.mitPlan.includes(MIT) && !docs.mitPlan.includes(ENV) && /GrayCo Mitigation, LLC/.test(docs.mitPlan) && ['Demo Mitigation Mold Job', 'Eve Demo', '25 Demo St, Memphis, TN 38103', 'Demo PM', 'Demo Estimator', 'Wesley Johnson'].every(t => txt(docs.mitPlan).includes(t)) && txt(docs.mitPlan).includes(C.addDays(C.today(), -1).slice(5, 7).replace(/^0/, '') + '/'), txt(docs.mitPlan).slice(0, 600));
ok('A11 an Environmental job\'s plan: the Environmental logo + name, filled', docs.envPlan.includes(ENV) && !docs.envPlan.includes(MIT) && /GrayCo Environmental, LLC/.test(docs.envPlan) && ['Demo Lead Abatement', 'Cy Demo', '23 Demo Rd, Little Rock, AR 72201', 'Demo PM', 'Demo Estimator', 'Wesley Johnson'].every(t => txt(docs.envPlan).includes(t)));
ok('A11 signs: each job\'s own company logo + name in the band; waste labels filled (generator, location)', docs.mitSigns.includes(MIT) && /GrayCo Mitigation, LLC/.test(docs.mitSigns) && docs.envSigns.includes(ENV) && /Generator: Cy Demo — Demo Lead Abatement/.test(txt(docs.envSigns)) && /Location: 23 Demo Rd, Little Rock, AR 72201/.test(txt(docs.envSigns)) && txt(docs.envSigns).includes('LEAD-CONTAMINATED WASTE'));
ok('A11 the decon set-up sheet: Environmental logo, filled from the job\'s set-up (type, location, who, the checked items)', docs.decon.includes(ENV) && /Portable decon trailer/.test(docs.decon) && /Driveway, next to the side door/.test(docs.decon) && /Demo Estimator/.test(docs.decon) && (docs.decon.match(/☑/g) || []).length >= C.DEFAULT_RULES.decon.setup.length);
ok('A11 the TCLP waste record and the notices sheet: the job\'s logo and its filled facts', docs.waste.includes(ENV) && /COC-777/.test(docs.waste) && /Cy Demo/.test(docs.waste) && docs.notices.includes(ENV) && /Demo Abatement LLC/.test(docs.notices) && /21 Demo St/.test(docs.notices) && docs.mitNotices.includes(MIT));
ok('A11 a Construction job keeps the GrayCo main logo and the TN / AR / MS license line', docs.conHead.includes('/grayco-logo.jpg') && /TN #85034 BCB · AR #0486990627 · MS #27769/.test(docs.conHead) && /GrayCo Construction Services, LLC/.test(docs.conHead));
const fm = await A.ev(() => window._gcEnvDocs.fillDocx('resp', false, 'P5').then(o => o ? { xml: o.xml.replace(/<[^>]+>/g, ''), f: window.__gcEdFilled } : null));
ok('A11 the Respiratory Protection Program filled for the Mitigation job: its name, logo (letterhead image), footer — not Construction\'s TIN', !!fm && /GrayCo Mitigation, LLC/.test(fm.xml) && !/TIN # 33-2106808/.test(fm.xml) && fm.f.logo === true && /GrayCo Mitigation, LLC \|/.test(fm.f.footer.replace(/<[^>]+>/g, '')) && /Program administrator: Wesley Johnson/.test(fm.xml), fm && { head: fm.xml.slice(0, 300), logo: fm.f.logo });
const fc = await A.ev(() => window._gcEnvDocs.fillDocx('resp', false, 'P2').then(o => o ? o.xml.replace(/<[^>]+>/g, '') : ''));
ok('A11 …and for a Construction job: Construction\'s letterhead and license line stay', /GrayCo Construction Services, LLC/.test(fc) && /TN License # 85034/.test(fc));
/* 12 · 📏 lead levels 2026 v.3 — the card, the acknowledgment, the flags, removal 50 / back <40, a level changed on this test copy */
await A.ev(() => window._gcLeadLevels.open('P3'));
const lvCard = await wait(A, () => { const m = document.querySelector("[data-ed-lvcard]"); return m && m.querySelector('[data-ed-lvtable]') ? { t: m.textContent, logo: (m.querySelector('[data-ed-logo]') || {}).getAttribute && m.querySelector('[data-ed-logo]').getAttribute('src'), pel: (m.querySelector('[data-lv="air.pel"]') || {}).textContent, cas: (m.querySelector('[data-lv="air.cassette"]') || {}).textContent, rm: (m.querySelector('[data-lv="blood.removal"]') || {}).textContent, back: (m.querySelector('[data-lv="blood.back"]') || {}).textContent } : null; });
ok('A12 📏 the Lead levels card, laid out like the sheet, in the job\'s company (Environmental logo), with its version', !!lvCard && lvCard.logo === '/img/grayco-environmental-logo.png' && lvCard.pel === '50' && lvCard.cas === '37 mm' && lvCard.rm === '50' && lvCard.back === '<40' && /IMPORTANT LEVELS — 2026 v\.3/.test(lvCard.t) && /Levels: 2026 v\.3/.test(lvCard.t) && /IMPORTANT LEVELS - 2026 v\.3/.test(lvCard.t), lvCard);
await A.ev(() => document.querySelector('[data-ed-lvcard] [data-lv="ack"]').click());
const ack = await wait(A, () => true) && await (async () => { for (let i = 0; i < 30; i++) { const a = cget('gc_lead_levels_ack'); if (a && a['2026 v.3'] && a['2026 v.3']['wjohnson@grayco-cs.com']) return a; await sleep(300); } return null; })();
ok('A12 the worker acknowledges the current version — kept on record (gc_lead_levels_ack, with a log)', !!ack && ack['2026 v.3']['wjohnson@grayco-cs.com'].name === 'Wesley Johnson' && (ack.log || []).length >= 1);
await A.ev(() => { const m = document.getElementById('gc-ec-modal'); if (m) m.remove(); });
const E3a = await evalJob(A, 'P3');
ok('A12 on the lead job: the acknowledgment shows per person (Wesley ✅ — he is not on the crew; the crew still ⚠)', E3a.items.some(i => /^lvack:/.test(i.id) && i.st === 'due'), E3a.items.filter(i => /^lvack/.test(i.id)));
await A.ev(() => { try { window._setView('enviro'); } catch (e) {} });
ok('A12 the Desk Environmental compliance page has the 📏 Lead levels card', !!await wait(A, () => document.querySelector('#gc-ec-over [data-ed-lvcard]'), null, 15000));
/* blood 52 → removal with pay protection; 38 while removed → back to work */
await A.ev(() => { window.confirm = () => true; window._gcEnvComp._x.bloodStep({ email: 'wworker@example.com', name: 'Wes Worker' }, '52', null); });
const rmf = await wait(A, () => { const m = document.getElementById('gc-ec-modal'); const r = m && m.querySelector('[data-f="reason"]'); return r ? { reason: r.value, crit: (m.querySelector('[data-f="criteria"]') || {}).value, title: m.querySelector('h3').textContent } : null; });
ok('A12 blood lead 52 → 🔴 Removal From Work: the medical removal (pay protection) opens, filled from the levels', !!rmf && /Medical removal/.test(rmf.title) && /Blood lead 52 µg\/dL — Removal From Work at 50 \(Levels: 2026 v\.3\)/.test(rmf.reason) && /Back to work at <40/.test(rmf.crit), rmf);
await A.ev(() => { const m = document.getElementById('gc-ec-modal'); if (m) m.remove(); });
const ret = await A.ev(() => { const a = window._gcEnvComp._x.bloodStep({ email: 'wworker@example.com', name: 'Wes Worker' }, '38', { removal: { id: 'rm1', start: '2026-10-01' } }); const m = document.getElementById('gc-ec-modal'); return { act: a.act, text: a.text, form: m ? m.querySelector('h3').textContent + ' ' + m.textContent : '' }; });
ok('A12 removed + blood lead 38 → 🟢 "Back to work at <40: cleared to return" and the return form opens', ret.act === 'return' && /cleared to return/.test(ret.text) && /Returned to exposure work on/.test(ret.form), ret);
await A.ev(() => { const m = document.getElementById('gc-ec-modal'); if (m) m.remove(); });
/* the air form: the cassette pre-filled; a clearance sill wipe 45 fails by the DLAL */
await A.ev(() => window._gcEnvComp.airForm('P3'));
ok('A12 the air sample form pre-fills the cassette (37 mm) from the levels', (await wait(A, () => { const i = document.querySelector('#gc-ec-modal [data-f="cassette"]'); return i ? i.value : null; })) === '37 mm');
await A.ev(() => { const m = document.getElementById('gc-ec-modal'); if (m) m.remove(); });
await A.ev(() => window._gcEnvComp.logAir('P3', { rule: 'la-clear', atype: 'clearance', date: window._gcEnvCompCore.today(), method: 'Lead dust wipe (µg/ft²)', surface: 'Interior window sills', task: 'kitchen sill', result: '45', sampler: 'Demo Estimator', lab: 'Demo Lab', files: {} }));
const wipe = await wait(A, () => { const p = window._crm.projects.find(x => x.id === 'P3'); return (p.envLog || []).find(r => r.kind === 'air' && r.result === '45') || null; });
ok('A12 a clearance sill wipe of 45 µg/ft² → 🔴 clearance FAILS (DLAL 40), stamped with the levels version', !!wipe && wipe.pass === 'Fail' && wipe.flag === 'red' && /clearance FAILS/.test(wipe.levelText) && wipe.levels === 'Levels: 2026 v.3', wipe);
await A.ev(() => window._gcEnvDocs.logLeadTest('P3', { ttype: 'xrf', value: '1.2', location: 'front door casing', files: {} })); await sleep(900);
ok('A12 an XRF of 1.2 mg/cm² → 🔴 lead-based paint, its action on the job', (await evalJob(A, 'P3')).items.some(i => i.sec === 'levels' && /LEAD-BASED PAINT/.test(i.label)));
/* the worker sees their own results next to the level */
await A.ev(() => window._gcEnvComp.openMine());
const mine = await wait(A, () => { const d = document.querySelector('[data-ec-mine]'); return d && d.querySelector('[data-ec-flag]') ? { t: d.textContent, red: d.querySelectorAll('[data-ec-flag="red"]').length } : null; });
ok('A12 🩺 my own records: each result next to its level (blood 52 → Removal From Work; air 35 → action level 30), with the version', !!mine && mine.red >= 2 && /Removal From Work/.test(mine.t) && /action level 30/.test(mine.t) && /Levels: 2026 v\.3/.test(mine.t), mine);
await A.ev(() => { const m = document.getElementById('gc-ec-modal'); if (m) m.remove(); });
/* change one level on this test copy → a new document shows it, the earlier one keeps its version */
const before0 = await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'P3'); const r = window._gcEnvCompCore.plans(p)[0]; return window._gcEnvDocs.planHtml(r, p); });
const saved = await A.ev(() => { const L = JSON.parse(JSON.stringify(window._gcLeadLevels.get())); L.v = '2026 v.3 (test copy)'; L.air.pel = 45; return window._gcLeadLevels.save(L); });
await sleep(600);
await A.ev(() => window._gcEnvDocs.generate('P3')); await sleep(900);
const after = await A.ev(() => { const p = window._crm.projects.find(x => x.id === 'P3'); const L = window._gcEnvCompCore.plans(p); return { n: L.length, newer: window._gcEnvDocs.planHtml(L[L.length - 1], p), older: window._gcEnvDocs.planHtml(L[0], p) }; });
ok('A12 a level changed in the record (test copy: PEL 45) → the regenerated plan prints PEL 45 and "Levels: 2026 v.3 (test copy)"', saved.ok && /PEL 45 µg\/m³/.test(after.newer) && /Levels: 2026 v\.3 \(test copy\)/.test(after.newer) && !/PEL 50 µg\/m³/.test(after.newer), txt(after.newer).slice(0, 400));
ok('A12 …the earlier plan still shows the version it was made with (PEL 50, "Levels: 2026 v.3")', /Levels: 2026 v\.3</.test(after.older) && /PEL 50 µg\/m³/.test(after.older));
ok('A12 every version of the record is kept (gc_lead_levels_history) and the record is shared (gc_lead_levels)', (cget('gc_lead_levels') || {}).v === '2026 v.3 (test copy)' && ((cget('gc_lead_levels_history') || {}).list || []).length >= 1 && (cget('gc_lead_levels') || {}).air.pel === 45);
const fl = await A.ev(() => window._gcEnvDocs.fillDocx('lead', false, 'P3').then(o => o ? o.xml.replace(/<[^>]+>/g, '') : ''));
ok('A12 the Lead Safety Program filled now carries PEL 45 and the test-copy stamp', /\(PEL\): 45 µg\/m³/.test(fl) && /Levels: 2026 v\.3 \(test copy\)/.test(fl) && /Lead levels – OSHA personal air: action level 30 µg\/m³; PEL 45/.test(fl));
await A.ev(() => window._gcLeadLevels.save(window._gcEnvCompCore.DEFAULT_LEVELS));
ok('A no page errors (admin)', !A.errs.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|Load failed/i.test(e)).length, A.errs.slice(0, 5));
await A.close();

/* B · the PM */
const B = await computer('pm@grayco-cs.com', { build: BUILD });
await signIn(B, 'pm@grayco-cs.com', 20000); await sleep(6000);
ok('B0 the CRM is up (PM)', !!await wait(B, () => window._gcEnvDocs && (window._crm.projects || []).length >= 5, null, 60000));
await open(B, 'P3');
const bp = await wait(B, () => { const c = document.getElementById('gc-ec'); return c && c.getAttribute('data-pid') === 'P3' && c.querySelector('[data-ed-sec="plan"]') ? { t: c.innerText, own: !!c.querySelector('[data-ed="signown"]'), gen: !!c.querySelector('[data-ed="plan"]') } : null; });
ok('B1 the PM sees the plan and its versions, without the owner\'s approval button', !!bp && /v1/.test(bp.t) && !bp.own, bp);
const own = await B.ev(() => { const p = window._crm.projects.find(x => x.id === 'P1'); const r = (p.envLog || []).filter(x => x.kind === 'epp').pop(); return r ? window._gcEnvDocs.sign('P1', r.id, 'owner') : 'none'; });
ok('B2 the PM cannot sign the owner\'s approval', own === false);
ok('B no page errors (PM)', !B.errs.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|Load failed/i.test(e)).length, B.errs.slice(0, 5));
await B.close();

const n = R.filter(Boolean).length; console.log(n + ' passed, ' + (R.length - n) + ' failed'); process.exit(R.length - n ? 1 : 0);
