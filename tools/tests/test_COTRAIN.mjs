// test_COTRAIN.mjs <build-dir> — patch COTRAIN (owner 11/12): training, documents, branding and marketing belong to their company.
//   With GrayCo Mitigation picked, Forms & Docs → 🎓 Training showed Construction guides (Office, PMs, Supers, Estimators, How do I…?,
//   Tuesday agenda). Now each company sees its own training and papers (+ the shared ones), All companies groups them by company,
//   papers carry the right company, and Marketing for Mitigation / Environmental is off (own accounts, "Not connected") until activated.
//   Offline harness, made-up data only.  COTRAIN_SHOTS=<dir> → screenshots + index.txt (owner-facing ones at device scale 2).
import { computer, signIn, sleep, cset, cget, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
import { createRequire } from 'module'; import path from 'path'; import fs from 'fs';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 400) : '')); };
const SHOT = process.env.COTRAIN_SHOTS || ''; const INDEX = [];
const CARRIER = /State Farm|Allstate|USAA|Liberty Mutual|Farmers Insurance|Nationwide|Travelers|Progressive|Geico|Erie Insurance|American Family/i;

/* ── Part A (node): the server's marketing switches ── */
const JA = require(path.join(BUILD, 'netlify/functions/_lib/job-auto.js'));
const pc = { id: 'P1', type: 'Residential', clientEmail: 'cole@example.com' }, pm = { id: 'P2', type: 'Water Damage', companyId: 'mitigation', clientEmail: 'lee@example.com' }, pe = { id: 'P3', type: 'Environmental', companyId: 'environmental' };
const off = JA.parseAdmin(null, null), onM = JA.parseAdmin({}, { list: [{ id: 'mitigation', marketing: { active: true, accounts: { reviewLink: 'https://example.com/mit-review' } } }] });
ok('server: a Mitigation / Environmental job gets no review request, newsletter or yearly check-up while that company\'s marketing is off', ['reviewRequest', 'newsletter', 'yearlyCheckup'].every(k => JA.allows(pm, k, off) === false && JA.allows(pe, k, off) === false), null);
ok('server: Construction is unchanged (review request / newsletter allowed by default)', JA.allows(pc, 'reviewRequest', off) === true && JA.allows(pc, 'newsletter', off) === true);
ok('server: other automations on a Mitigation job are not touched (invoice e-mail, portal link)', JA.allows(pm, 'invoiceEmail', off) === true && JA.allows(pm, 'portalLink', off) === true);
ok('server: Mitigation marketing activated → its review request is allowed, with ITS OWN review link (never Construction\'s); Environmental still off', JA.allows(pm, 'reviewRequest', onM) === true && JA.reviewLinkFor(pm, onM, 'https://share.google/x') === 'https://example.com/mit-review' && JA.allows(pe, 'reviewRequest', onM) === false && JA.reviewLinkFor(pc, onM, 'https://share.google/x') === 'https://share.google/x');
ok('server: the 5 jobs read as Construction stay Construction', JA.companyOf({ id: 'PRJMVPFN7MBC7', companyId: 'mitigation' }) === 'construction' && JA.companyOf({ id: 'PRJMVPFN7MBC7', companyId: 'mitigation', companyIdBy: 'admin' }) === 'mitigation');
const NEWS = require(path.join(BUILD, 'netlify/functions/_lib/news.js'));
if (typeof NEWS.everyone === 'function') {
  const ev = NEWS.everyone({ projects: [pc, pm], customers: [] }).map(x => x.email);
  ok('server: Construction\'s newsletter list leaves out a Mitigation job\'s customer', ev.includes('cole@example.com') && !ev.includes('lee@example.com'), ev);
}
const mktSrc = fs.readFileSync(path.join(BUILD, 'netlify/functions/_lib/mkt.js'), 'utf8');
ok('server: Construction\'s Autopilot and campaigns skip Mitigation / Environmental jobs and customers', /!JAc\.otherCo\(p\)/.test(mktSrc) && /JA\.otherCo && JA\.otherCo\(p\)/.test(mktSrc));

const CB = require(path.join(BUILD, 'netlify/functions/_lib/cobrand.js'));
const cbm = CB.info(pm, { list: [{ id: 'mitigation', legal: 'GrayCo Mitigation, LLC', license: 'Demo lic #1' }] });
ok('server: a Construction job keeps Construction branding (cobrand.info → null)', CB.info(pc, null) === null);
const mail = CB.apply({ from: 'GrayCo Construction Services Billing <billing@grayco-cs.com>', subject: 'Invoice #1 from GrayCo Construction Services', html: '<img src="https://crm.grayco-cs.com/portal-logo.png" alt="GrayCo Construction Services"><p>a check made out to GrayCo Construction Services</p><p>GrayCo Construction Services, LLC (construction and restoration), GrayCo Mitigation, LLC</p>' }, cbm);
ok('server: a Mitigation job\'s e-mail — sender, subject, logo and "check made out to" are GrayCo Mitigation; the list of all three companies is kept', /^GrayCo Mitigation Billing/.test(mail.from) && /from GrayCo Mitigation$/.test(mail.subject) && /grayco-mitigation-logo\.png/.test(mail.html) && /made out to GrayCo Mitigation</.test(mail.html) && /GrayCo Construction Services, LLC \(construction and restoration\)/.test(mail.html), mail);
const ph = fs.readFileSync(path.join(BUILD, 'portal.html'), 'utf8'), pj = fs.readFileSync(path.join(BUILD, 'netlify/functions/portal.js'), 'utf8');
ok('portal: the job view carries its company; the header / footer / papers / "check made out to" / text consent use it; no promotional-text sign-up for Mitigation / Environmental', /company: require\('\.\/_lib\/cobrand\.js'\)\.info\(p, data\.gc_companies\)/.test(pj) && /coBrand\(V\.company\)/.test(ph) && (ph.match(/made out to ' \+ coName\(\)/g) || []).length === 2 && /if \(!\(V && V\.company\)\) mktBox/.test(ph) && /window\.__gcPortalCo/.test(ph));

/* ── Part B (browser) ── */
resetCloud();
const now = new Date().toISOString();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Mo Tech', email: 'mo@example.com', role: 'Mitigation Tech', active: true },
  { id: 'u3', name: 'Eve Abate', email: 'eve@example.com', role: 'Environmental Tech', active: true },
  { id: 'u4', name: 'Pat Planner', email: 'pat@example.com', role: 'Project Manager', active: true }]);
cset('projects', [{ id: 'J1', name: 'Demo Cole kitchen', client: 'Demo Cole', status: 'active', type: 'Residential', contract: 5000, updatedAt: now },
  { id: 'J2', name: 'Demo Lee dry-out', client: 'Demo Lee', status: 'active', type: 'Mitigation', companyId: 'mitigation', contract: 6000, updatedAt: now },
  { id: 'J3', name: 'Demo Ross abatement', client: 'Demo Ross', status: 'active', type: 'Environmental', companyId: 'environmental', contract: 9000, updatedAt: now }]);
const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
const main = A.page(); const ev = (fn, arg) => main.evaluate(fn, arg);
const errs = []; main.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(8000);
const cdp = await main.context().newCDPSession(main);
const scale = async n => { await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: n, mobile: false }); await sleep(300); };
/* owner shots at device scale 2: the CDP capture (Playwright's own screenshot keeps its 1× scale) */
const cdpShot = async (file, sel) => {
  let clip = null;
  if (sel) {   /* a tall list: a viewport as tall as the list (the CRM scrolls inside its own panel), then the list's box */
    const h = await ev(sel => document.querySelector(sel).getBoundingClientRect().height, sel);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: Math.min(Math.ceil(h) + 400, 9000), deviceScaleFactor: 2, mobile: false }); await sleep(800);
    clip = await ev(sel => { const e = document.querySelector(sel); e.scrollIntoView({ block: 'start' }); let p = e.parentElement; while (p && !(p.scrollHeight > p.clientHeight + 5 && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement; (p || document.scrollingElement).scrollBy(0, -170); const r = e.getBoundingClientRect(); return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: r.width, height: Math.min(r.height, innerHeight - Math.max(0, r.top)), scale: 1 }; }, sel);
  }
  await sleep(400);
  const r = await cdp.send('Page.captureScreenshot', Object.assign({ format: 'png' }, clip ? { clip } : {}));
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
};
const shot = async (name, what, owner, sel) => { if (!SHOT) return; await scale(owner ? 2 : 1); if (owner) await cdpShot(SHOT + '/' + name + '.png', sel); else if (sel) await main.locator(sel).first().screenshot({ path: SHOT + '/' + name + '.png' }); else await main.screenshot({ path: SHOT + '/' + name + '.png' }); INDEX.push(name + '.png — ' + what + (owner ? ' (owner, 2×)' : ' (check, 1×)')); await scale(1); };
const setCo = async f => { await ev(f => window._gcCo.setFilter(f), f); await sleep(1500); };

/* 1. the tags are data */
const tags = await ev(() => { const M = window._gcTrain.modules(); return { untagged: M.filter(m => !Array.isArray(m.cos) || !m.cos.length).map(m => m.id), by: Object.fromEntries(M.map(m => [m.id, m.cos.join(' ')])) }; });
ok('every training module has its company in data (cos)', tags.untagged.length === 0, tags.untagged);
ok('Construction guides are Construction: PMs, Supers & APMs, Estimators, How do I…?, Tuesday agenda; Start here / Office / Admin are every company', ['b:pm', 'b:field', 'b:estimator', 'b:faq', 'b:agenda'].every(id => tags.by[id] === 'construction') && ['b:start', 'b:office', 'b:admin'].every(id => tags.by[id] === '*'), tags.by);
ok('IICRC water / fire / odor are Mitigation; S520 mold and biohazard are Mitigation + Environmental', ['b:resto-water', 'b:iicrc-s500', 'b:iicrc-s700'].every(id => tags.by[id] === 'mitigation') && tags.by['b:iicrc-s520'] === 'mitigation environmental' && tags.by['b:iicrc-bio'] === 'mitigation environmental', tags.by);

/* 2. Forms & Docs → 🎓 Training under each company */
await ev(() => window._gcTrain.open()); await sleep(2500);
await ev(() => { const b = document.querySelector('[data-trtab="train"]'); b && b.click(); }); await sleep(1500);
const trainView = () => ev(() => { const b = document.getElementById('gc-train-box'); return { head: (b.querySelector('[data-co-trhead]') || {}).textContent || '', secs: [...b.querySelectorAll('[data-co-sec]')].map(x => x.getAttribute('data-co-sec')), titles: [...b.querySelectorAll('.gctr-mt b')].map(x => x.textContent), text: b.innerText }; });
const CON_ONLY = ['Project Managers', 'Supers and APMs in the field', 'Estimators', 'How do I…?', 'Tuesday training agenda'];
await setCo('mitigation'); const tm = await trainView();
ok('Mitigation: no Construction guides (PMs, Supers, Estimators, How do I…?, Tuesday agenda)', CON_ONLY.every(t => !tm.titles.includes(t)), tm.titles);
ok('Mitigation: Mitigation in the CRM, Mitigation certifications, water / fire / odor, S500 / S700 / S520, respiratory protection + the shared Start here / Office', ['💧 GrayCo Mitigation in the CRM', '🎖 Mitigation certifications by role', 'GrayCo Water Damage Restoration', '😷 Respiratory protection: medical evaluation and fit test', 'Start here', 'Office'].every(t => tm.titles.includes(t)) && tm.titles.some(t => /S500/.test(t)) && tm.titles.some(t => /S700/.test(t)), tm.titles);
ok('Mitigation: no Environmental-only courses (asbestos, Environmental in the CRM)', !tm.titles.some(t => /Asbestos: the rules|Environmental in the CRM/.test(t)), null);
ok('Mitigation: the banner says GrayCo Mitigation training and the section is "Other Mitigation training"', /GrayCo Mitigation, LLC training/.test(tm.head) && /Other Mitigation training/i.test(tm.text), tm.head);
await shot('training_mitigation', 'Forms & Docs → 🎓 Training with GrayCo Mitigation picked (the whole list)', true, '#gc-train-box');
await setCo('environmental'); const te = await trainView();
ok('Environmental: Environmental in the CRM, licenses by role, asbestos, lead (RRP vs abatement), respiratory protection, HAZWOPER, S520 mold', ['☢️ GrayCo Environmental in the CRM', '🎖 Environmental licenses & certifications by role', '🛢 HAZWOPER: when it applies (and when it does not)', '😷 Respiratory protection: medical evaluation and fit test'].every(t => te.titles.includes(t)) && te.titles.some(t => /^🧱 Asbestos/.test(t)) && te.titles.some(t => /^🎨 Lead/.test(t)) && te.titles.some(t => /S520/.test(t)), te.titles);
ok('Environmental: no Construction guides, no water / fire restoration courses', CON_ONLY.every(t => !te.titles.includes(t)) && !te.titles.some(t => /GrayCo Water Damage Restoration|S700|S500/.test(t)), te.titles);
await shot('training_environmental', 'Forms & Docs → 🎓 Training with GrayCo Environmental picked (the whole list)', true, '#gc-train-box');
await setCo('construction'); const tc = await trainView();
ok('Construction: PMs, Supers, Estimators, How do I…?, Tuesday agenda, Construction certifications, Construction papers; no Mitigation / Environmental courses', CON_ONLY.concat(['🎖 Construction certifications by role', '🏗 Construction papers: which one when']).every(t => tc.titles.includes(t)) && !tc.titles.some(t => /Mitigation in the CRM|S700|Asbestos: the rules|HAZWOPER/.test(t)), tc.titles);
await shot('training_construction', 'Forms & Docs → 🎓 Training with GrayCo Construction picked (the whole list)', true, '#gc-train-box');
await setCo('all'); const ta = await trainView();
ok('All companies: everything, grouped Every company · Construction · Mitigation · Environmental', ta.secs.join() === '*,construction,mitigation,environmental' && CON_ONLY.every(t => ta.titles.includes(t)) && ta.titles.includes('💧 GrayCo Mitigation in the CRM') && ta.titles.includes('☢️ GrayCo Environmental in the CRM'), ta.secs);
await shot('training_all', 'Forms & Docs → 🎓 Training with All companies, grouped by company (the whole list)', true, '#gc-train-box');

/* 3. required training follows the person's own company */
const req = await ev(() => { const T = window._gcTrain, ids = rk => T.required(rk).map(m => m.id); return { ins: ids('insurance'), env: ids('enviro'), pm: ids('pm'), rkMo: T.roleKey('Mitigation Tech'), rkEve: T.roleKey('Environmental Tech') }; });
ok('roles: "Mitigation Tech" → Insurance / Mitigation, "Environmental Tech" → Environmental', req.rkMo === 'insurance' && req.rkEve === 'enviro', req);
ok('required for Mitigation crews: Mitigation in the CRM + Mitigation certs + respiratory, never the Environmental or Construction-only guides', ['b:co-mit-crm', 'b:certs-mitigation', 'b:co-env-resp', 'b:resto-water'].every(x => req.ins.includes(x)) && !req.ins.some(x => /co-env-crm|co-env-asbestos|b:pm$|b:estimator/.test(x)), req.ins);
ok('required for Environmental crews: Environmental in the CRM, licenses, asbestos, lead, respiratory; never water / fire restoration', ['b:co-env-crm', 'b:certs-environmental', 'b:co-env-asbestos', 'b:co-env-lead', 'b:co-env-resp'].every(x => req.env.includes(x)) && !req.env.some(x => /resto-|iicrc-s500|iicrc-s700|co-mit-crm/.test(x)), req.env);
ok('required for Construction PMs: Project Managers + Construction certs; no Mitigation / Environmental course', req.pm.includes('b:pm') && req.pm.includes('b:certs-construction') && !req.pm.some(x => /co-mit|co-env|resto-/.test(x)), req.pm);

/* 4. the cert courses read the cert plan (never disagree with 🎖 Required certs) */
const cp = await ev(async () => { await window._gcCertPlan.load(); const P = window._gcCertPlan.plan(), M = window._gcTrain.modules();
  return ['construction', 'mitigation', 'environmental'].map(co => { const m = M.find(x => x.id === 'b:certs-' + co), body = m.parts.map(p => p.title + ' ' + p.body).join('\n');
    const tracks = Object.keys(P.tracks).filter(k => P.tracks[k].co === co);
    return { co, parts: m.parts.length, tracks: tracks.length, missing: tracks.flatMap(k => P.tracks[k].reqs.map(r => r.name)).filter(n => !body.includes(n)), law: /\*\*LAW\*\*/.test(body) }; }); });
ok('🎖 certifications courses: one part per role of that company + where certificates go; every required certificate in 🎖 Required certs is listed, LAW marked', cp.every(x => x.parts === x.tracks + 1 && !x.missing.length && x.law), cp);
const mitBody = await ev(() => window._gcTrain.modules().find(x => x.id === 'b:certs-mitigation').parts.map(p => p.body).join(' '));
ok('Mitigation certs name IICRC WRT, ASD, AMRT, FSRT, OCT; Environmental names lead supervisor / worker and asbestos supervisor / worker', ['WRT', 'ASD', 'AMRT', 'FSRT', 'OCT'].every(w => mitBody.includes(w)) && await ev(() => { const b = window._gcTrain.modules().find(x => x.id === 'b:certs-environmental').parts.map(p => p.body).join(' '); return /Lead abatement supervisor/.test(b) && /Lead abatement worker/.test(b) && /Asbestos contractor \/ supervisor/.test(b) && /Asbestos abatement worker/.test(b); }), mitBody.slice(0, 200));
/* the asbestos test: 6 questions, pass 5 */
const K = 'b:co-env-asbestos|quiz';
const qz = await ev(K => { const q = window._gcTrain.modules().find(m => m.id === 'b:co-env-asbestos').parts.find(p => p.quiz).quiz; const box = document.createElement('div'); box.id = 'gc-test-host'; box.innerHTML = window.__GC_TRAIN_QUIZ__(K, q, false); document.body.appendChild(box); return { n: q.length, t: box.innerText }; }, K);
ok('asbestos course: a 6-question test, pass = 5', qz.n === 6 && /You need 5 right to pass/.test(qz.t), qz.t.slice(0, 160));
await ev(K => document.querySelector('[data-gcq-start="' + K + '"]').click(), K); await sleep(300);
const qs = await ev(K => window.__GC_TRAIN_TRY__(K).qs.map(q => q.a), K);
for (let i = 0; i < qs.length; i++) { await ev(([K, i, j]) => document.querySelector('[data-gcq-pick="' + K + '"][data-i="' + i + '"][data-j="' + j + '"]').click(), [K, i, qs[i]]); await sleep(40); }
await sleep(700);
const qres = await ev(K => (window._gcTrain._p().done || {})[K], K);
ok('all right → passed 6 of 6, saved', qres && qres.passed && qres.score === 6, qres);
await ev(() => { const b = document.getElementById('gc-test-host'); b && b.remove(); });

/* 5. 📄 Documents under each company */
await ev(() => { const b = document.querySelector('[data-trtab="docs"]'); b && b.click(); }); await sleep(1500);
const docView = () => ev(() => ({ n: (document.getElementById('gc-d3-n') || {}).textContent || '', titles: [...document.querySelectorAll('#gc-d3-list .gc-dl-title')].map(x => x.childNodes[0].textContent.trim()), secs: [...document.querySelectorAll('#gc-d3-list [data-co-sec]')].map(x => x.getAttribute('data-co-sec')) }));
await setCo('mitigation'); await sleep(800); const dm = await docView();
ok('Mitigation papers: work authorization, direction to pay, drying log, certificate of drying, certificate of satisfaction, mold disclosure, the new first-call intake and closeout checklist', ['Work Authorization (Insurance)', 'Direction to Pay', 'Moisture / Drying Log', 'Certificate of Drying (Dry Standard Reached)', 'Certificate of Completion & Satisfaction', 'Mold Disclosure & Disclaimer', 'Water Loss — First Call Intake Sheet', 'Mitigation Job Closeout Checklist'].every(t => dm.titles.includes(t)), dm.n);
ok('Mitigation papers: no roofing, residential warranty, lien waivers or abatement agreement', !dm.titles.some(t => /Roof Decking|Residential Warranty|Conditional Waiver|Abatement Services Agreement|Pre-Construction Notice/.test(t)), dm.titles.filter(t => /Roof|Warranty|Conditional Waiver|Abatement/.test(t)));
ok('the count says "… documents for Mitigation"', /\d+ documents for Mitigation/.test(dm.n), dm.n);
await ev(() => { const x = [...document.querySelectorAll('#gc-d3-list .gc-dl-title')].find(e => /Water Loss — First Call/.test(e.textContent)); x && x.scrollIntoView({ block: 'center' }); }); await sleep(300);
await shot('docs_mitigation', 'Forms & Docs → 📄 Documents with GrayCo Mitigation picked (scrolled to the Mitigation papers; count at the top says "… for Mitigation")', true);
await setCo('environmental'); await sleep(800); const de = await docView();
ok('Environmental papers: the new abatement agreement, asbestos / lead notification worksheets, waste shipment log, clearance, exposure assessment, respirator fit test, daily abatement log + Lead 01–06 and asbestos papers', ['Abatement Services Agreement (Lead / Asbestos)', 'Asbestos Notification Worksheet (NESHAP — 10 working days)', 'Lead Abatement Notification Worksheet (state)', 'Waste Shipment Record Log (asbestos / lead waste)', 'Final Visual Inspection & Clearance Record', 'Initial Exposure Assessment & Air Monitoring Record', 'Respirator Fit Test & Medical Clearance Record', 'Daily Abatement Log — Containment, Negative Air & Entry', 'Lead 01 — Renovate Right Pamphlet Acknowledgment', 'Asbestos 01 — Disclosure and Acknowledgment'].every(t => de.titles.includes(t)), de.n);
ok('Environmental papers: no drying, roofing or insurance-claim papers', !de.titles.some(t => /Certificate of Drying|Roof|Supplement Request|Direction to Pay/.test(t)), de.titles.filter(t => /Dry|Roof|Supplement|Direction/.test(t)));
await ev(() => { const x = [...document.querySelectorAll('#gc-d3-list .gc-dl-title')].find(e => /Abatement Services Agreement/.test(e.textContent)); x && x.scrollIntoView({ block: 'center' }); }); await sleep(300);
await shot('docs_environmental', 'Forms & Docs → 📄 Documents with GrayCo Environmental picked (scrolled to the new Environmental papers)', true);
await setCo('construction'); await sleep(800); const dc = await docView();
ok('Construction papers: subcontract, change order, lien waivers, warranties, roofing; no drying / abatement papers', ['Subcontractor Agreement', 'Change Order', 'Conditional Waiver — Final Payment (TN)', 'Residential Warranty (1 Year)', 'Roof Decking Replacement — Record', 'Master Subcontract Agreement'].every(t => dc.titles.includes(t)) && !dc.titles.some(t => /Certificate of Drying|Abatement Services|Waste Shipment/.test(t)), dc.n);
await setCo('all'); await sleep(800); const da = await docView();
const total = await ev(async () => (await window._gcDocs3.list()).length);
ok('All companies: every paper, grouped Every company · Construction · Mitigation · Environmental', da.secs.join() === '*,construction,mitigation,environmental' && new Set(da.titles).size >= total - 5 && /^\d+ documents$/.test(da.n.trim()) && +da.n.match(/\d+/)[0] === total, { secs: da.secs, n: da.n, total });
await ev(() => { const x = document.querySelector('#gc-d3-list [data-co-sec="mitigation"]'); x && x.scrollIntoView({ block: 'center' }); }); await sleep(300);
await shot('docs_all', 'Forms & Docs → 📄 Documents with All companies (scrolled to the 💧 Mitigation group header)', true);

/* 6. an admin changes a tag; uploads and new training carry the picked company */
await ev(() => window._gcCoTag.set('docs', 'gcb_roof_maint', ['mitigation'])); await sleep(600);
await setCo('mitigation'); await sleep(600);
const ov1 = await docView(); const ck = cget('gc_co_tags');
ok('🏢 Companies (admin): "Roof Care & Maintenance Guide" moved to Mitigation shows there, saved to the cloud (gc_co_tags)', ov1.titles.includes('Roof Care & Maintenance Guide') && ck && ck.docs && ck.docs.gcb_roof_maint && ck.docs.gcb_roof_maint[0] === 'mitigation', ck && ck.docs);
await ev(() => window._gcCoTag.set('docs', 'gcb_roof_maint', null)); await sleep(600);
ok('↺ Built-in puts it back (Construction only)', !(await docView()).titles.includes('Roof Care & Maintenance Guide'));
await ev(() => document.querySelector('#gc-d3-list [data-cotag-edit="docs"]').click()); await sleep(400);
const dlg = await ev(() => { const d = document.getElementById('gc-cotag-dlg'); return d ? d.innerText : ''; });
ok('the 🏢 Companies button opens the "Which company is this for?" box with Every company / Construction / Mitigation / Environmental', /Which company is this for/.test(dlg) && /Every company/.test(dlg) && /GrayCo Environmental, LLC/.test(dlg), dlg.slice(0, 200));
await ev(() => document.getElementById('gc-cotag-dlg').remove());
await ev(() => window._gcDocs3.upload({ name: 'Demo Env SOP', data: 'data:text/plain;base64,aGk=', fileName: 'sop.txt', fileType: 'text/plain', cos: ['environmental'] })); await sleep(800);
await ev(() => window._gcTrain.saveItem({ title: 'Demo dehu setup', kind: 'steps', body: '### Step one\nPlug it in', cos: ['mitigation'], roles: [] })); await sleep(800);
await setCo('environmental'); await sleep(800);
const up1 = (await docView()).titles.includes('Demo Env SOP'); await setCo('construction'); await sleep(800); const up2 = (await docView()).titles.includes('Demo Env SOP');
ok('an upload marked Environmental shows under Environmental, not Construction', up1 && !up2, { up1, up2 });
const tr1 = await ev(() => window._gcTrain.modules().find(m => m.title === 'Demo dehu setup'));
ok('＋ Add training marked Mitigation keeps its company', tr1 && tr1.cos.join() === 'mitigation', tr1 && tr1.cos);
const box = await ev(() => window._gcCoTag.boxes(['mitigation']));
ok('the ＋ Add training / ＋ Upload forms have the Companies boxes', /data-cotag-box="mitigation" checked/.test(box) && /Every company/.test(box));

/* 7. branding per company */
await setCo('all');
const br = await ev(async () => { const C = window._gcCo, out = {};
  for (const [id, pid] of [['gcb_env_clearance', 'J3'], ['gcb_env_abatement_agreement', ''], ['gcb_water_dry_cert', 'J2'], ['gcb_mitigation', 'J2'], ['gen:invoice', 'J2'], ['gcb_mit_first_call', ''], ['gen:contract', 'J1'], ['gcb_hr_handbook_ack', 'J2']]) {
    const h = await window._gcDocs3.html(id, pid, true) || '', want = pid ? C.ofJob(C.jobById(pid)) : window._gcCoBrand.single(id) || 'construction', c = C.get(want);
    const logo = (h.match(/<img[^>]*data-gc-logo-img="1"[^>]*src="([^"]{0,80})/) || [])[1] || '', mine = (window._gcDocCo.logo(want) || c.logo || '').slice(0, 80);
    out[id + '@' + (pid || '-')] = { want, legal: h.includes(c.legal), con: want === 'construction' ? 0 : (h.replace(/GrayCo Construction Services, LLC \(construction and restoration\)/g, '').match(/GrayCo Construction Services/g) || []).length, logoOk: want === 'construction' ? true : !!logo && logo === mine, group: /GrayCo Construction Services, LLC \(construction and restoration\)/.test(h) };
  }
  return out; });
ok('Environmental papers (job or none): GrayCo Environmental, LLC, its logo, no "GrayCo Construction Services" anywhere', ['gcb_env_clearance@J3', 'gcb_env_abatement_agreement@-'].every(k => br[k].want === 'environmental' && br[k].legal && br[k].con === 0 && br[k].logoOk), br);
ok('Mitigation papers (drying certificate, services agreement, invoice, first-call sheet): GrayCo Mitigation, LLC, its logo, no Construction name (footer and signature lines too)', ['gcb_water_dry_cert@J2', 'gcb_mitigation@J2', 'gen:invoice@J2', 'gcb_mit_first_call@-'].every(k => br[k].want === 'mitigation' && br[k].legal && br[k].con === 0 && br[k].logoOk), br);
ok('a Construction paper stays GrayCo Construction Services', br['gen:contract@J1'].want === 'construction' && br['gen:contract@J1'].legal, br['gen:contract@J1']);
ok('the HR paper that lists all three companies keeps "GrayCo Construction Services, LLC (construction and restoration)" in that list', br['gcb_hr_handbook_ack@J2'].group && br['gcb_hr_handbook_ack@J2'].legal, br['gcb_hr_handbook_ack@J2']);
const car = await ev(async (rx) => { const RX = new RegExp(rx, 'i'), l = (await window._gcDocs3.list()).filter(e => e.kind === 'tpl' && e.clientFacing), bad = [];
  for (const e of l) { const h = await window._gcDocs3.html(e.uid, 'J2', true) || ''; if (RX.test(h.replace(/<[^>]+>/g, ' '))) bad.push(e.uid); } return { n: l.length, bad }; }, CARRIER.source);
ok('no customer paper names an insurance carrier (every client-facing template, filled for a Mitigation job)', car.n > 50 && !car.bad.length, car);
/* the branded paper on screen (the in-CRM viewer) */
for (const [id, pid, f, nm] of [['gcb_contract', 'J1', 'construction', 'paper_construction'], ['gcb_water_dry_cert', 'J2', 'mitigation', 'paper_mitigation'], ['gcb_env_clearance', 'J3', 'environmental', 'paper_environmental']]) {
  await setCo(f);
  const shown = await ev(async ([id, pid]) => { const h = await window._gcDocs3.html(id, pid, true); window._gcViewer.open({ html: h, name: 'Demo paper' }); await new Promise(r => setTimeout(r, 1200)); const v = document.getElementById('gc-viewer'); const fr = v && v.querySelector('iframe'); const d = fr && (fr.contentDocument || null); return d ? d.body.innerText.slice(0, 4000) : (v ? v.innerText.slice(0, 4000) : ''); }, [id, pid]);
  const legal = await ev(f => window._gcCo.get(f).legal, f);
  ok('viewer: ' + nm + ' shows ' + legal + (f === 'construction' ? '' : ' and never GrayCo Construction Services'), shown.includes(legal.replace(/, LLC$/, '')) && (f === 'construction' || !/GrayCo Construction Services/.test(shown)), shown.slice(0, 200));
  await shot(nm, 'A ' + legal + ' paper in the CRM viewer (made-up job)', true);
  await ev(() => { try { window._gcViewer.close(); } catch (e) {} });
  await sleep(400);
}
/* 📋 Documents for this Job: a Mitigation job's other papers are Mitigation's */
await setCo('all');
await ev(() => window._jobDocPack('J2')); await sleep(2500);
const jp = await ev(() => { const o = document.getElementById('_jdpOv'); return o ? o.innerText : ''; });
ok('📋 Documents for this Job (Mitigation job): Mitigation papers offered, no roofing / residential warranty', /Certificate of Drying/.test(jp) && !/Roof Decking|Residential Warranty \(1 Year\)/.test(jp), jp.slice(0, 200));
await ev(() => { const o = document.getElementById('_jdpOv'); o && o.remove(); });

/* 8. Marketing: Mitigation / Environmental off, own accounts, activate */
await setCo('mitigation');
await ev(() => window._gcMkt.open()); await sleep(2500);
const mk = await ev(() => { const g = document.querySelector('.gmt'); const card = g.querySelector('[data-cmk-co]'); return { co: g.getAttribute('data-cmk'), off: !!g.querySelector('[data-cmk-off]'), text: card ? card.innerText : '', notc: g.querySelectorAll('[data-cmk-st]').length, notConnected: [...g.querySelectorAll('[data-cmk-st]')].filter(x => /Not connected/.test(x.textContent)).length, logo: (g.querySelector('.gmt-head img') || {}).src || '', sub: (g.querySelector('.gmt-head .sub') || {}).textContent || '', act: !!g.querySelector('[data-cmk="toggle"]'), tiles: g.querySelectorAll('.gmt-tile').length, dis: g.querySelectorAll('.gmt-tile[aria-disabled="true"]').length }; });
ok('Marketing with Mitigation picked: "Marketing is off for GrayCo Mitigation, LLC", the same tiles (locked), ▶ Activate marketing (admin)', mk.co === 'mitigation' && mk.off && /Marketing is off for GrayCo Mitigation, LLC/.test(mk.text) && mk.act && mk.tiles > 5 && mk.dis === mk.tiles, mk);
ok('Mitigation\'s own accounts: 9 slots (ad accounts, Business Profile, pages, review link, tracking number, sender, website), all "Not connected" — nothing from Construction', mk.notc === 9 && mk.notConnected === 9 && /Google Ads account/.test(mk.text) && /Call-tracking number/.test(mk.text), mk.text.slice(0, 300));
ok('the Marketing header is GrayCo Mitigation (its logo and name, not Construction\'s licenses)', /grayco-mitigation-logo/.test(mk.logo) && /GrayCo Mitigation, LLC/.test(mk.sub) && !/85034/.test(mk.sub), { logo: mk.logo, sub: mk.sub });
await shot('marketing_mitigation_off', 'Marketing with GrayCo Mitigation picked — off until activated, own accounts "Not connected"', true);
const sec0 = await ev(() => { document.querySelector('.gmt .gmt-tile').click(); return window._gcMkt.state().sec; }); await sleep(300);
ok('a locked tool does not open for Mitigation (stays on the Marketing home)', sec0 === 'home' && await ev(() => window._gcMkt.state().sec) === 'home');
await ev(() => window._gcMkt.go('social')); await sleep(800);
const soc = await ev(() => { const g = document.querySelector('.gmt'); return g.querySelector('.gmt-body').innerText; });
ok('even opened directly, a tool shows Mitigation\'s switch and accounts, never Construction\'s posts or numbers', /Marketing is off for GrayCo Mitigation/.test(soc) && !/Platform connections/.test(soc), soc.slice(0, 200));
await ev(() => window._gcMkt.go('home')); await sleep(500);
const ctxDlg = A.dialogs.length;
await ev(() => { const g = document.querySelector('.gmt'); g.querySelector('[data-cmk-acc="reviewLink"]').value = 'https://example.com/demo-mit-review'; g.querySelector('[data-cmk="saveacc"]').click(); }); await sleep(1500);
await ev(() => document.querySelector('.gmt [data-cmk="toggle"]').click()); await sleep(2000);
const gc = cget('gc_companies'); const mit = gc && gc.list && gc.list.find(c => c.id === 'mitigation'), con = gc && gc.list && gc.list.find(c => c.id === 'construction'), env = gc && gc.list && gc.list.find(c => c.id === 'environmental');
ok('▶ Activate marketing (asks first) → saved per company in the company settings: Mitigation active with its own review link; Construction and Environmental untouched', A.dialogs.length > ctxDlg && mit && mit.marketing && mit.marketing.active === true && mit.marketing.accounts.reviewLink === 'https://example.com/demo-mit-review' && !(con && con.marketing) && !(env && env.marketing && env.marketing.active), { mit: mit && mit.marketing, con: con && con.marketing });
const mk2 = await ev(() => { const g = document.querySelector('.gmt'); return { on: g.getAttribute('data-cmk-active'), t: (g.querySelector('[data-cmk-co]') || {}).innerText || '' }; });
ok('after activating: "Marketing is on for GrayCo Mitigation, LLC", the review link "✓ On file"', mk2.on === 'true' && /Marketing is on for GrayCo Mitigation, LLC/.test(mk2.t) && /✓ On file/.test(mk2.t), mk2.t.slice(0, 200));
await setCo('environmental'); await sleep(800);
const mke = await ev(() => { const g = document.querySelector('.gmt'); return { co: g.getAttribute('data-cmk'), t: (g.querySelector('[data-cmk-co]') || {}).innerText || '', n: [...g.querySelectorAll('[data-cmk-st]')].filter(x => /Not connected/.test(x.textContent)).length }; });
ok('Environmental: its own switch (still off) and its own 9 empty slots — Mitigation\'s review link is not carried over', mke.co === 'environmental' && /Marketing is off for GrayCo Environmental, LLC/.test(mke.t) && mke.n === 9, mke);
await shot('marketing_environmental_off', 'Marketing with GrayCo Environmental picked — off, own accounts empty', false);
await setCo('construction'); await sleep(800);
const mkc = await ev(() => { const g = document.querySelector('.gmt'); return { co: g.getAttribute('data-cmk'), card: !!g.querySelector('[data-cmk-co]'), tiles: g.querySelectorAll('.gmt-tile').length, dis: g.querySelectorAll('.gmt-tile[aria-disabled="true"]').length }; });
ok('Construction Marketing is exactly as before (no switch, tools open)', !mkc.co && !mkc.card && mkc.tiles > 5 && mkc.dis === 0, mkc);
await ev(() => { try { window._gcMkt.close(); } catch (e) {} });
await setCo('all');

ok('no page errors', !errs.length, errs);
if (SHOT) fs.writeFileSync(SHOT + '/index.txt', 'COTRAIN screenshots (made-up data)\n' + INDEX.join('\n') + '\n');
const n = R.filter(Boolean).length; console.log('COTRAIN ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
