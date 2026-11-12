// test_CERTPLAN.mjs <build-dir> [shot-dir] — owner 11/11: required certs by role, a raise for every certificate, ⭐ promotion eligible with
// Master designations, PM year-end bonus, emergency after-hours 1.5× / overtime 1.5× not stacked. Made-up people only.
import { computer, signIn, sleep, cset, cget, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
const ago = d => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10), ahead = d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Pat Planner', email: 'pat@example.com', role: 'Project Manager', hireDate: ago(200), active: true },
  { id: 'u3', name: 'Mo Tech', email: 'mo@example.com', role: 'Mitigation Tech', hireDate: ago(120), active: true },
  { id: 'u4', name: 'Eve Abate', email: 'eve@example.com', role: 'Environmental Tech', hireDate: ago(10), active: true },
  { id: 'u5', name: 'Max Master', email: 'max@example.com', role: 'Mitigation Manager', hireDate: ago(900), active: true },
  /* patch CERTROLE: a Steven-like roofing PM (hired long ago — nothing may read "Overdue") and an insurance PM */
  { id: 'u6', name: 'Sam Demo', email: 'sam@example.com', role: 'Project Manager', profile: 'Roofing', hireDate: ago(400), active: true },
  { id: 'u7', name: 'Ina Demo', email: 'ina@example.com', role: 'Insurance PM', hireDate: ago(400), active: true },
  /* a Glenn-like commercial estimator, an Environmental supervisor and an abatement tech */
  { id: 'u8', name: 'Gary Demo', email: 'gary@example.com', role: 'Estimator', hireDate: ago(400), active: true },
  { id: 'u9', name: 'Sue Demo', email: 'sue@example.com', role: 'Environmental Supervisor', hireDate: ago(400), active: true },
  { id: 'u10', name: 'Eli Demo', email: 'eli@example.com', role: 'Abatement Technician', companyId: 'environmental', hireDate: ago(400), active: true },
  /* raises: a mitigation tech with Master Restorer and every course (cap +$8), a cross-trained tech */
  { id: 'u11', name: 'Tia Demo', email: 'tia@example.com', role: 'Mitigation Tech', hireDate: ago(700), active: true },
  { id: 'u12', name: 'Dex Demo', email: 'dex@example.com', role: 'Restoration & Abatement Tech', hireDate: ago(300), active: true },
  /* entry level: General Laborers ($15) — path 1 (all CRM training → +$3 tech) and path 2 (RRP + lead + asbestos worker + Environmental training → $23) */
  { id: 'u13', name: 'Lou Demo', email: 'lou@example.com', role: 'General Laborer', companyId: 'mitigation', hireDate: ago(30), active: true },
  { id: 'u14', name: 'Lea Demo', email: 'lea@example.com', role: 'General Laborer', hireDate: ago(30), active: true }]);
cset('gc_certs', { list: [
  { id: 'c1', holderType: 'person', holder: 'pat@example.com', holderName: 'Pat Planner', name: 'IICRC WRT (Water Restoration Technician)', issuer: 'IICRC', expires: ahead(200) },
  { id: 'c2', holderType: 'person', holder: 'pat@example.com', holderName: 'Pat Planner', name: 'EPA RRP Certified Renovator', issuer: 'EPA', expires: ago(5) },
  { id: 'c3', holderType: 'person', holder: 'mo@example.com', holderName: 'Mo Tech', name: 'IICRC WRT', issuer: 'IICRC', expires: ahead(300) },
  { id: 'c4', holderType: 'person', holder: 'max@example.com', holderName: 'Max Master', name: 'IICRC Master Water Restorer', issuer: 'IICRC', expires: ahead(300) },
  { id: 'c5', holderType: 'person', holder: 'sam@example.com', holderName: 'Sam Demo', name: 'IICRC UFT (Upholstery & Fabric)', issuer: 'IICRC', expires: ahead(300) }]
  .concat(['IICRC WRT', 'IICRC ASD', 'IICRC AMRT', 'IICRC FSRT', 'IICRC OCT', 'IICRC CCT', 'IICRC UFT', 'IICRC Master Restorer', 'OSHA 30 (construction)'].map((n, i) => ({ id: 't' + i, holderType: 'person', holder: 'tia@example.com', holderName: 'Tia Demo', name: n, issuer: /IICRC/.test(n) ? 'IICRC' : 'OSHA', expires: ahead(300) })))
  .concat(['EPA RRP Certified Renovator', 'Lead abatement worker (TN)', 'Asbestos abatement worker (AHERA)'].map((n, i) => ({ id: 'l' + i, holderType: 'person', holder: 'lea@example.com', holderName: 'Lea Demo', name: n, issuer: '', expires: ahead(900) })))
  .concat([{ id: 'g1', holderType: 'person', holder: 'gary@example.com', holderName: 'Gary Demo', name: 'OSHA 30 (construction)', issuer: 'OSHA', expires: ahead(900) }])
  .concat(['IICRC WRT', 'IICRC AMRT', 'Lead abatement worker (TN)', 'Asbestos abatement worker (AHERA)', 'HAZWOPER 40-hour'].map((n, i) => ({ id: 'd' + i, holderType: 'person', holder: 'dex@example.com', holderName: 'Dex Demo', name: n, issuer: '', expires: ahead(300) }))) });
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(6000);
await A.ev(() => window._gcCertPlan.load()); await sleep(800);
/* a plan saved before the PM split (old WRT within 90 days, no Roofing / Insurance / Estimator tracks, old mitigation set) is upgraded on read */
const up = await A.ev(async () => { const C = window._gcCertPlan;
  C._set({ tracks: { con_pm: { label: 'Project Manager — GrayCo Construction', co: 'construction', unit: 'yr', reqs: [{ id: 'wrt', name: 'IICRC WRT', m: 'WRT', days: 90, why: 'Owner: required for every PM' }, { id: 'rrp', name: 'EPA RRP', m: 'RRP', days: 90, legal: true }, { id: 'xyz', name: 'Admin line', m: 'xyz', days: 30 }] },
    mit_manager: { label: 'Mitigation Manager — GrayCo Mitigation', co: 'mitigation', unit: 'yr', reqs: [{ id: 'wrt', name: 'IICRC WRT', m: 'WRT', days: 0 }] } } }, []);
  const u = C.plan(); await C.load();
  return { keys: Object.keys(u.tracks).slice(0, 5), label: u.tracks.con_pm.label, wrt: u.tracks.con_pm.reqs[0].rec, rrp: !!u.tracks.con_pm.reqs[1].rec, admin: u.tracks.con_pm.reqs[2].name, v: u.tracksV, mit: u.tracks.mit_manager.reqs.map(r => r.id), mitLabel: u.tracks.mit_manager.label }; });
const m = await A.ev(() => { const C = window._gcCertPlan, U = window._crm.users, by = e => U.find(u => u.email === e), p = C.plan();
  const tr = e => C.trackOf(by(e), p);
  const st = (e, id) => { const u = by(e), t = p.tracks[C.trackOf(u, p)], r = t.reqs.find(x => x.id === id); return C.reqStatus(r, (window._gcCertPlan.__held = null, []).concat(JSON.parse(JSON.stringify((window.__cp = 1, [])))), '') && null; };
  const II = ['wrt', 'asd', 'amrt', 'fsrt', 'oct', 'cct', 'uft'], kinds = k => p.tracks[k].reqs.map(r => r.id + (r.rec ? ':rec' : r.legal ? ':law' : ':req'));
  const allSt = ['pat@example.com', 'sam@example.com', 'ina@example.com', 'mo@example.com', 'eve@example.com', 'max@example.com'].flatMap(e => { const u = by(e), t = p.tracks[C.trackOf(u, p)]; return t.reqs.map(r => C.reqStatus(r, [], '2000-01-01')); });
  return { tracks: ['pat@example.com', 'mo@example.com', 'eve@example.com', 'max@example.com', 'sam@example.com', 'ina@example.com', 'gary@example.com', 'sue@example.com', 'eli@example.com'].map(tr),
    roofK: kinds('con_roof_pm'), insK: kinds('con_ins_pm'), conK: kinds('con_pm'), estK: kinds('est_com'), mitK: kinds('mit_manager'), envPmK: kinds('env_pm'), envTechK: kinds('env_tech'), II,
    whys: Object.keys(p.tracks).flatMap(k => p.tracks[k].reqs.map(r => r.why)).filter(w => /required for every PM/.test(w)), wrtIns: p.tracks.con_ins_pm.reqs[0].why,
    stKinds: [...new Set(allSt.map(x => x.k))], stLabels: allSt.map(x => x.l).join(' | '),
    raisesSam: C.raisesDue(by('sam@example.com'), p).map(r => r.cert + '=' + r.amount + r.unit), raisesGary: C.raisesDue(by('gary@example.com'), p).map(r => r.cert + '=' + r.amount + r.unit), patComm: C.raiseCalc(by('pat@example.com'), p).commission,
    rates: Object.fromEntries(p.raises.map(r => [r.id, C.rateOf(r)])), suggested: p.suggested,
    tia: (() => { const c = C.raiseCalc(by('tia@example.com'), p); return { sum: c.due.reduce((a, x) => a + x.hr, 0), reached: c.reached, trimmed: c.due.filter(x => x.trimmed).length, notpm: c.blocked.filter(x => x.why === 'notpm').map(x => x.cert), cap: c.cap.hr, ms: (C.masterOf ? C.masterOf(by('tia@example.com'), p) : {}).l }; })(),
    tiaPm: (() => { const p2 = JSON.parse(JSON.stringify(p)); p2.people['tia@example.com'] = { track: 'mit_manager' }; const c = C.raiseCalc(by('tia@example.com'), p2); return { master: c.due.find(x => x.master), due: c.due.length, comm: c.commission, allComm: c.blocked.length > 0 && c.blocked.every(x => x.why === 'commission') }; })(),
    dex: (() => { const c = C.raiseCalc(by('dex@example.com'), p), o = C.outlookOf('dual_tech', p); return { track: c.track, start: o.start, cap: c.cap.hr, sum: c.due.reduce((a, x) => a + x.hr, 0), rules: c.due.map(x => x.rule) }; })(),
    ol: (() => { const f = k => { const o = C.outlookOf(k, p); return { start: o.start, cap: o.cap.hr, withCap: o.withCap, tot: o.tot }; };
      return { mit: f('mit_tech'), env: f('env_tech'), dualf: f('dual_fore'), ins: f('con_ins_pm'), insComm: C.outlookOf('con_ins_pm', p).commission, mitComm: C.outlookOf('mit_tech', p).commission }; })(),
    pmReqs: p.tracks.con_pm.reqs.map(r => r.id), mitTech: p.tracks.mit_tech.reqs.map(r => r.id), envPm: p.tracks.env_pm.reqs.map(r => r.id), envTech: p.tracks.env_tech.reqs.map(r => r.id),
    pmMasterDays: p.tracks.con_pm.reqs.filter(r => /Master Restorer course/.test(r.name)).map(r => r.days),
    raisesPat: C.raisesDue(by('pat@example.com'), p).map(r => r.cert + '=' + r.amount + r.unit), raisesMo: C.raisesDue(by('mo@example.com'), p).map(r => r.cert + '=' + r.amount + r.unit),
    masterMax: C.masterOf(by('max@example.com'), p), masterMo: C.masterOf(by('mo@example.com'), p),
    w1: C.weekPay(20, 40, 20), w2: C.weekPay(20, 50, 20), w3: C.weekPay(20, 45, 0), w4: C.weekPay(20, 30, 40) }; });
ok('tracks from the role / profile: PM → Construction PM, Mitigation Tech, Environmental Tech, Mitigation Manager, roofing PM → 🏠 Roofing PM, Insurance PM → 🛡 Insurance PM, Estimator → Estimator, Environmental Supervisor → Env PM / Supervisor, Abatement Technician → Env tech', m.tracks.join() === 'con_pm,mit_tech,env_tech,mit_manager,con_roof_pm,con_ins_pm,est_com,env_pm,env_tech', m.tracks);
ok('CERTROLE: Insurance PM REQUIRES WRT + every Master Restorer course; Roofing and Construction PMs have them RECOMMENDED', m.II.every(x => m.insK.includes(x + ':req') && m.roofK.includes(x + ':rec') && m.conK.includes(x + ':rec')), m);
ok('CERTROLE: every PM track keeps the law lines (RRP, HazCom, fall protection) as LAW', ['con_pm', 'con_roof_pm', 'con_ins_pm'].every(k => ['rrp', 'hazcom', 'fall'].every(x => m[k === 'con_pm' ? 'conK' : k === 'con_roof_pm' ? 'roofK' : 'insK'].includes(x + ':law'))), m);
ok('CERTROLE: no deadline states left — a person hired long ago is never due / soon / overdue (only ok, law, rec, keepon)', m.stKinds.every(k => ['ok', 'law', 'rec', 'keepon', 'expired'].includes(k)) && !/Overdue|Due |\(\d+ d\)|hire date/.test(m.stLabels), m.stKinds);
ok('CERTROLE: an old saved plan is upgraded — Roofing / Insurance / Estimator tracks added in order, old PM WRT → recommended, law and the admin\'s own line kept, mitigation gets the whole IICRC set', up.keys.join() === 'con_pm,con_roof_pm,con_ins_pm,est_com,con_foreman' && up.wrt === true && up.rrp === false && up.admin === 'Admin line' && up.v === 2 && /Construction PM/.test(up.label) && m.II.every(x => up.mit.includes(x)) && /Manager \/ PM/.test(up.mitLabel), up);
ok('CERTROLE: Gary Demo (Estimator) → 📐 Estimator — Commercial: nothing required, no IICRC at all, the field-safety law lines only as Recommended', m.tracks[6] === 'est_com' && m.estK.every(x => /:rec$/.test(x)) && !m.II.some(x => m.estK.some(y => y.startsWith(x + ':'))) && ['hazcom', 'fall', 'rrp'].every(x => m.estK.includes(x + ':rec')), m.estK);
ok('CERTROLE: "mitigation get those requirements too" — Mitigation Manager / PM REQUIRES the whole IICRC / Master Restorer set; the mitigation tech keeps WRT required', m.II.every(x => m.mitK.includes(x + ':req')) && m.mitTech.includes('wrt'), m.mitK);
ok('CERTROLE: Environmental has its own set (no IICRC set): lead, asbestos (+ inspector), mold AMRT-or-equivalent, HAZWOPER 40 + 8-h refresher, HazCom, respirator, BBP, trauma / biohazard, confined space', m.tracks[7] === 'env_pm' && m.tracks[8] === 'env_tech' && ['leadsup:law', 'rrp:law', 'asbsup:law', 'asbinsp:law', 'amrt:req', 'hazwoper:law', 'hazref:law', 'hazcom:law', 'resp:law', 'bbp:law', 'trauma:req', 'confined:law'].every(x => m.envPmK.includes(x)) && ['leadwork:law', 'asbwork:law', 'amrt:req', 'hazwoper:law', 'hazref:law', 'resp:law', 'bbp:law', 'trauma:req', 'confined:law'].every(x => m.envTechK.includes(x)) && !['wrt', 'asd', 'fsrt', 'oct', 'cct', 'uft'].some(x => m.envPmK.concat(m.envTechK).some(y => y.startsWith(x + ':'))), { pm: m.envPmK, tech: m.envTechK });
ok('CERTROLE: no "Owner: required for every PM" left; the Insurance PM WRT reads "Required for Insurance PMs"', !m.whys.length && m.wrtIns === 'Required for Insurance PMs', m);
ok('CERTROLE: a recommended certificate still earns its raise (Gary, Estimator: OSHA 30 $2 × 2,080 = $4,160/yr); Sam (Roofing PM, commission-paid) gets none for his UFT', m.raisesGary.join() === 'OSHA 30 (construction)=4160yr' && m.raisesSam.length === 0, { g: m.raisesGary, s: m.raisesSam });
ok('mitigation tech requires WRT + the legal ones (HazCom, respirator, bloodborne, RRP on-the-job)', ['wrt', 'hazcom', 'resp', 'bbp', 'rrpojt'].every(x => m.mitTech.includes(x)), m.mitTech);
ok('environmental PM requires lead supervisor + RRP renovator (+ asbestos supervisor, respirator, blood lead)', ['leadsup', 'rrp', 'asbsup', 'resp', 'bloodlead'].every(x => m.envPm.includes(x)), m.envPm);
ok('environmental tech requires the abatement worker license (+ asbestos worker, respirator, blood lead)', ['leadwork', 'asbwork', 'resp', 'bloodlead'].every(x => m.envTech.includes(x)), m.envTech);
ok('raises due (the owner\'s amounts): Pat (Construction PM — commission-paid) holds WRT + RRP → NO certificate raises; Mo (hourly tech) WRT $1/hr', m.raisesPat.length === 0 && m.raisesMo.join() === 'IICRC WRT=1hr' && m.patComm === true, m);
ok('RAISES: $5 Master Restorer / Master designations / lead + asbestos supervisor / HAZWOPER 40; $2 OSHA 30; $1 IICRC courses, RRP, lead + asbestos worker, OSHA 10', m.rates.mr === 5 && m.rates.mwr === 5 && m.rates.mfsr === 5 && m.rates.mtc === 5 && m.rates.leadsup === 5 && m.rates.asbsup === 5 && m.rates.hazwoper === 5 && m.rates.osha30 === 2 && ['wrt', 'asd', 'amrt', 'fsrt', 'oct', 'cct', 'uft', 'rrp', 'leadwork', 'asbwork', 'osha10', 'hazref'].every(k => m.rates[k] === 1) && m.suggested === false, m.rates);
ok('CAP: Tia (mitigation tech, 7 IICRC courses + OSHA 30 + Master Restorer) — courses $7 + OSHA 30 cut to $1 = +$8 cap reached; Master Restorer $0 on a tech track and ⭐ "Promotion eligible — PM"', m.tia.sum === 8 && m.tia.reached && m.tia.trimmed === 1 && m.tia.notpm.length === 1 && /Master Restorer/.test(m.tia.notpm[0]) && /Promotion eligible — PM/.test(m.tia.ms) && m.tia.cap === 8, m.tia);
ok('PROMOTED: Tia moved to Mitigation Manager / PM — commission-paid: no certificate raises at all (Master Restorer included); the certificates are required', !m.tiaPm.master && m.tiaPm.due === 0 && m.tiaPm.comm === true && m.tiaPm.allComm, m.tiaPm);
ok('DUAL: "Restoration & Abatement Tech" → dual track ($23 start, cap +$12); WRT + AMRT + lead worker + asbestos worker ($1 each) + HAZWOPER 40 ($5) + cross-training bonus $2 once = +$11', m.dex.track === 'dual_tech' && m.dex.start === 23 && m.dex.cap === 12 && m.dex.sum === 11 && m.dex.rules.includes('xtrain') && m.dex.rules.filter(r => r === 'xtrain').length === 1, m.dex);
ok('OUTLOOK: mitigation tech $18 start, +$8 cap (top ≤ $26); environmental tech $23 + $10 cap; dual foreman +$15; PM tracks commission-paid ($0 from certificates, no cap)', m.ol.mit.start === 18 && m.ol.mit.cap === 8 && m.ol.mit.withCap <= 8 && m.ol.env.start === 23 && m.ol.env.cap === 10 && m.ol.dualf.cap === 15 && m.ol.ins.cap === 0 && m.ol.ins.tot === 0 && m.ol.insComm && m.ol.mitComm === false, m.ol);
ok('⭐ Master Water Restorer (PM track) → promotion eligible; a tech without Master Restorer → "Needs Master Restorer for PM: 1 of 7 courses done"', m.masterMax && /promotion eligible/.test(m.masterMax.l) && m.masterMo && m.masterMo.k === 'need' && /Needs Master Restorer for PM: 1 of 7 courses done/.test(m.masterMo.l), { max: m.masterMax, mo: m.masterMo });
ok('pay: 40 h = 20 regular + 20 emergency → 20 × 1 + 20 × 1.5 = $1,000', m.w1.straight === 20 && m.w1.premium === 20 && m.w1.pay === 1000, m.w1);
ok('pay: 50 h with 20 emergency → 30 h at 1.5× (20 emergency + 10 over 40), never 2.25×', m.w2.premium === 30 && m.w2.pay === 20 * 20 + 30 * 30, m.w2);
ok('pay: 45 h, no emergency → 5 h overtime at 1.5×; emergency never more than the hours worked', m.w3.premium === 5 && m.w3.pay === 40 * 20 + 5 * 30 && m.w4.premium === 30, { w3: m.w3, w4: m.w4 });
/* the panel */
await A.ev(() => window._gcCertPlan.open('people')); await sleep(1500);
const txt = await A.ev(() => document.getElementById('gc-certplan').innerText);
const card = em => A.ev(e => { const c = document.querySelector('[data-cp-person="' + e + '"]'), sec = n => [...c.querySelectorAll('[data-cp-sec="' + n + '"] tr[data-cp-req]')].map(r => r.getAttribute('data-cp-req'));
  return { tk: c.getAttribute('data-cp-tk'), req: sec('req'), rec: sec('rec'), count: (c.querySelector('[data-cp-count]') || {}).textContent, txt: c.innerText,
    law: [...c.querySelectorAll('[data-cp-st="law"]')].map(x => x.className), targets: c.querySelectorAll('[data-cp-target]').length,
    recTxt: (c.querySelector('[data-cp-recsec]') || {}).innerText || '' }; }, em);
const sam = await card('sam@example.com'), ina = await card('ina@example.com');
ok('CERTROLE: Sam Demo (Roofing PM) — IICRC WRT / ASD / UFT under 💡 Recommended with no date; "0 of 4 required" counts only RRP, HazCom, fall protection, OSHA 30', sam.tk === 'con_roof_pm' && ['wrt', 'asd', 'uft'].every(x => sam.rec.includes(x) && !sam.req.includes(x)) && sam.req.join() === 'rrp,hazcom,fall,osha30' && sam.count === '0 of 4 required certificates held' && /💡 Recommended — no deadline/.test(sam.recTxt) && /✅ Held/.test(sam.recTxt) && !/Due|days of hire|Overdue|Target/.test(sam.recTxt), sam);
ok('CERTROLE: Ina Demo (Insurance PM) — the IICRC set + Master Restorer ("PMs have to be masters") are Required, shown as "📈 Keep on — no deadline" (no countdown) with an optional target date', ina.tk === 'con_ins_pm' && ['wrt', 'asd', 'amrt', 'fsrt', 'oct', 'cct', 'uft'].every(x => ina.req.includes(x)) && !ina.rec.length && ina.count === '0 of 12 required certificates held' && ina.req.includes('mr') && /📈 Keep on — no deadline/.test(ina.txt) && !/Due |\(\d+ d\)|Overdue|days of hire/.test(ina.txt) && ina.targets === 9, ina);
ok('CERTROLE: LAW lines are amber "📌 Required by law before that kind of work"; nothing in the panel says Overdue / days of hire', sam.law.length === 3 && sam.law.every(c => /amb/.test(c)) && /📌 Required by law before that kind of work/.test(sam.txt) && !/Overdue|days of hire|Set the hire date/.test(txt), sam.law);
ok('CERTROLE: the footnote says the law lines are owner-acknowledged with no countdown', /owner-acknowledged — no countdown/.test(await A.ev(() => (document.querySelector('[data-cp-foot]') || {}).innerText || '')), '');
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certrole_people_top.png' });
await A.ev(() => document.querySelector('[data-cp-person="sam@example.com"]').scrollIntoView()); await sleep(300);
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certrole_sam_roofing_pm.png' });
await A.ev(() => document.querySelector('[data-cp-person="ina@example.com"]').scrollIntoView()); await sleep(300);
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certrole_ina_insurance_pm.png' });
const gary = await card('gary@example.com'), sue = await card('sue@example.com'), eli = await card('eli@example.com');
ok('CERTROLE: Gary Demo\'s card — "No certificates required for this role" + 💡 Recommended (OSHA 30, HazCom / fall / RRP "law only if doing that field work"), never the PM track', gary.tk === 'est_com' && !gary.req.length && /No certificates required for this role/.test(gary.txt) && ['osha30', 'hazcom', 'fall', 'rrp'].every(x => gary.rec.includes(x)) && /law only if doing that field work/.test(gary.recTxt) && !gary.law.length && /📐 Estimator — Commercial/.test(await A.ev(() => { const s = document.querySelector('[data-cp-track="gary@example.com"]'); return s.options[s.selectedIndex].text; })), gary);
ok('CERTROLE: Sue (Env supervisor) and Eli (abatement tech) — law lines amber, nothing Overdue / Due, mold + trauma are keep-on goals', sue.tk === 'env_pm' && eli.tk === 'env_tech' && sue.law.length >= 10 && eli.law.length >= 8 && [sue, eli].every(c => !/Overdue|Due |\(\d+ d\)|days of hire/.test(c.txt) && /Mold remediation — IICRC AMRT or equivalent/.test(c.txt) && /Trauma \/ biohazard/.test(c.txt) && /📈 Keep on — no deadline/.test(c.txt)), { sue: sue.req, eli: eli.req });
for (const [em, f] of [['gary@example.com', 'certrole_gary_estimator'], ['sue@example.com', 'certrole_sue_env_supervisor'], ['eli@example.com', 'certrole_eli_env_tech'], ['max@example.com', 'certrole_max_mitigation_manager']]) {
  await A.ev(e => document.querySelector('[data-cp-person="' + e + '"]').scrollIntoView(), em); await sleep(300);
  await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/' + f + '.png' }); }
const cardTxt = em => A.ev(e => (document.querySelector('[data-cp-person="' + e + '"]') || {}).innerText || '', em);
const moT = await cardTxt('mo@example.com'), tiaT = await cardTxt('tia@example.com'), dexT = await cardTxt('dex@example.com');
const cardChk = { start: /Starting rate \$18\.00\/hr \+ approved certificate raises \$0\.00\/hr = current \$18\.00\/hr/.test(moT), policy: /Course fee paid by GrayCo · training days are unpaid · travel paid for courses out of town/.test(moT), cap: /cap reached \(\$8\/hr\)/.test(tiaT), promo: /Promotion eligible — PM/.test(tiaT), notpm: /comes with the PM commission plan/.test(tiaT), ladder: /Dual tech → Dual foreman/.test(dexT), dstart: /Starting rate \$23\.00\/hr/.test(dexT) };
ok('CARD: starting rate + approved raises = current rate; training policy; course travel; Tia shows 🧢 cap reached and ⭐ Promotion eligible — PM; Dex shows the ladder', Object.values(cardChk).every(Boolean), cardChk);
await A.ev(() => document.querySelector('[data-cp-person="tia@example.com"]').scrollIntoView()); await sleep(300);
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certrole_tia_tech_cap_master.png' });
/* exceptions: admin sets "no cap" for Tia with a reason, and a one-off raise */
await A.ev(() => document.querySelector('[data-cp="excform"][data-em="tia@example.com"]').click()); await sleep(300);
const noWhy = await A.ev(() => { const f = document.querySelector('[data-cp-excform="tia@example.com"]'); f.querySelector('[data-x="capmode"]').value = 'none'; document.querySelector('[data-cp="xcap"][data-em="tia@example.com"]').click(); return 1; }); await sleep(800);
const exc0 = cget('gc_cert_plan');
await A.ev(() => { const f = document.querySelector('[data-cp-excform="tia@example.com"]'); f.querySelector('[data-x="capmode"]').value = 'none'; f.querySelector('[data-x="capwhy"]').value = 'Lead tech for storm season'; document.querySelector('[data-cp="xcap"][data-em="tia@example.com"]').click(); }); await sleep(1500);
await A.ev(() => { const f = document.querySelector('[data-cp-excform="tia@example.com"]'); f.querySelector('[data-x="mamt"]').value = '0.75'; f.querySelector('[data-x="mwhy"]').value = 'Demo one-off'; document.querySelector('[data-cp="xraise"][data-em="tia@example.com"]').click(); }); await sleep(1500);
const exc = cget('gc_cert_plan'), tiaT2 = await cardTxt('tia@example.com');
const tiaC2 = await A.ev(() => { const C = window._gcCertPlan, u = window._crm.users.find(x => x.email === 'tia@example.com'), c = C.raiseCalc(u); return { cap: c.cap, sum: c.due.reduce((a, x) => a + x.hr, 0), reached: c.reached }; });
ok('EXCEPTIONS: a reason is required; "no cap" for Tia lifts the cap (OSHA 30 $2 in full), a one-off raise is logged; the card shows "Exception by Wesley Johnson on …: … — reason"', !(exc0 && exc0.people && exc0.people['tia@example.com'] && exc0.people['tia@example.com'].exc) && exc.people['tia@example.com'].exc.cap.none === true && tiaC2.sum === 9 && !tiaC2.reached && exc.done.some(d => d.manual && d.email === 'tia@example.com' && d.amount === 0.75) && exc.excLog.length === 2 && /Exception by Wesley Johnson on .*no raise cap — Lead tech for storm season/.test(tiaT2) && /one-off raise \$0\.75\/hr — Demo one-off/.test(tiaT2), { log: exc.excLog, tiaC2, t: tiaT2.slice(-400) });
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certrole_tia_exceptions.png' });
await A.ev(() => document.querySelector('[data-cp="excform"][data-em="tia@example.com"]').click()); await sleep(300);
await A.ev(() => document.querySelector('[data-cp-person="dex@example.com"]').scrollIntoView()); await sleep(300);
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certrole_dex_dual_tech.png' });
/* 🎓 classes: the CRM training first, then "Request class"; an override with a reason; approval */
const clState = () => A.ev(() => { const r = document.querySelector('[data-cp-person="ina@example.com"] [data-cp-clrow="wrt"]'), r2 = document.querySelector('[data-cp-person="ina@example.com"] [data-cp-clrow="asd"]');
  const b = r && r.querySelector('[data-cp="clreq"]'), b2 = r2 && r2.querySelector('[data-cp="clreq"]');
  return { train: r && r.querySelector('[data-cp-train]').getAttribute('data-cp-train'), dis: b ? b.disabled : null, tip: b ? b.title : '', st: r && r.querySelector('[data-cp-clst]') ? r.querySelector('[data-cp-clst]').getAttribute('data-cp-clst') : '', dis2: b2 ? b2.disabled : null, txt: r ? r.innerText : '' }; });
let cl0 = await clState();
ok('CLASS: Ina has not done the CRM training for WRT (📚 not started) → 🎓 Request class is DISABLED with "Finish the CRM training first"', cl0.train === 'not' && cl0.dis === true && cl0.tip === 'Finish the CRM training first' && /GrayCo Water Damage Restoration/.test(cl0.txt), cl0);
await A.ev(() => document.querySelector('[data-cp-person="ina@example.com"]').scrollIntoView()); await sleep(200);
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certrole_class_blocked.png' });
const qk = await A.ev(() => { const m = window._gcTrain.modules().find(x => x.id === 'b:resto-water'); const q = m.parts.find(x => x.quiz); return m.id + '|' + q.id; });
const prep = await A.ev(() => ['b:prep-cct', 'b:prep-uft', 'b:prep-mr', 'b:prep-osha'].map(id => { const m = window._gcTrain.modules().find(x => x.id === id); return m ? m.parts.find(x => x.quiz).quiz.length : 0; }));
ok('CLASS: certificates with no CRM course get a prep course in 🎓 Training (CCT, UFT, Master Restorer, OSHA 10/30) with a 10-question test', prep.every(n => n === 10), prep);
cset('gc_train_p_ina@example_com', { done: { [qk]: { score: 18, of: 20, best: 18, tries: 1, passed: true, at: new Date().toISOString() } } });
await A.ev(async () => { await window._gcCertPlan.load(); window._gcCertPlan.open('people'); }); await sleep(1500);
const cl1 = await clState();
ok('CLASS: after Ina passes the CRM test (18 of 20) the WRT row reads "📚 passed (18 of 20, date)" and 🎓 Request class is enabled', cl1.train === 'pass' && cl1.dis === false && /passed \(18 of 20/.test(cl1.txt), cl1);
await A.ev(() => document.querySelector('[data-cp-person="ina@example.com"] [data-cp-clrow="wrt"] [data-cp="clreq"]').click()); await sleep(400);
await A.ev(() => { const f = document.querySelector('[data-cp-clform="ina@example.com|wrt"]'); f.querySelector('[data-cl="cost"]').value = '450'; f.querySelector('[data-cl="dates"]').value = 'Jan 12–14'; f.querySelector('[data-cl="travel"]').checked = true; f.querySelector('[data-cp="clsend"]').click(); }); await sleep(1500);
const k1 = cget('gc_cert_plan'), todoC = await A.ev(() => window._gcTodoExt.map(f => { try { return f(); } catch (e) { return []; } }).flat().filter(x => /^cpclass:/.test(x.key)).map(x => x.title + ' | ' + x.sub));
ok('CLASS: the request is saved (course, $450, dates, travel yes, training score) and is on the admins\' To-Do', k1.classes && k1.classes.length === 1 && k1.classes[0].status === 'requested' && k1.classes[0].cost === 450 && k1.classes[0].travel === true && /18 of 20/.test(k1.classes[0].training) && todoC.some(x => /🎓 Class request: Ina Demo/.test(x) && /\$450\.00/.test(x) && /travel: yes/.test(x)), { c: k1.classes, todoC });
await A.ev(() => document.querySelector('[data-cp-person="ina@example.com"] [data-cp="clapprove"]').click()); await sleep(1500);
const k2 = cget('gc_cert_plan'), cl2 = await clState();
ok('CLASS: ✅ Approve records "Class approved — company pays the course fee; training days unpaid; travel paid if out of town" (who, when) and shows it on the card', k2.classes[0].status === 'approved' && k2.classes[0].approvedBy === 'Wesley Johnson' && /company pays the course fee; training days unpaid; travel paid if out of town/.test(k2.classes[0].note) && cl2.st === 'approved' && /Class approved/.test(cl2.txt), { c: k2.classes[0], cl2 });
ok('CLASS: ASD (IICRC S500 course not passed) is still blocked', cl2.dis2 === true, cl2);
await A.ev(() => document.querySelector('[data-cp-person="ina@example.com"] [data-cp-clrow="asd"] [data-cp="clovr"]').click()); await sleep(300);
await A.ev(() => { const f = document.querySelector('[data-cp-ovrform="ina@example.com|asd"]'); f.querySelector('[data-cl="why"]').value = 'Class seat opened tomorrow'; f.querySelector('[data-cp="clovrsave"]').click(); }); await sleep(1500);
const k3 = cget('gc_cert_plan'), cl3 = await clState();
ok('CLASS: an admin override (reason required) is logged — "Exception by Wesley Johnson …" — and enables Request class for ASD', k3.people['ina@example.com'].exc.classOk.asd.reason === 'Class seat opened tomorrow' && k3.excLog.some(x => x.kind === 'classOk' && x.email === 'ina@example.com') && cl3.dis2 === false, { exc: k3.people['ina@example.com'].exc, cl3 });
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certrole_class_approved.png' });
/* the track picker: Roofing / Insurance options; a change is saved for that person only */
const opts = await A.ev(() => [...document.querySelector('[data-cp-track="sam@example.com"]').options].map(o => o.value));
await A.ev(() => { const s = document.querySelector('[data-cp-track="sam@example.com"]'); s.value = 'con_ins_pm'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(1500);
const tsv = cget('gc_cert_plan'), sam2 = await card('sam@example.com');
ok('CERTROLE: the track picker has Roofing PM and Insurance PM; changing Sam to Insurance PM saves on Sam only and his IICRC lines become Required', opts.includes('con_roof_pm') && opts.includes('con_ins_pm') && tsv && tsv.people && tsv.people['sam@example.com'] && tsv.people['sam@example.com'].track === 'con_ins_pm' && Object.keys(tsv.people).sort().join() === 'ina@example.com,sam@example.com,tia@example.com' && sam2.tk === 'con_ins_pm' && sam2.req.includes('wrt') && !sam2.rec.length && (await card('pat@example.com')).tk === 'con_pm', { opts, people: tsv && tsv.people, sam2: sam2.tk });
await A.ev(() => { const s = document.querySelector('[data-cp-track="sam@example.com"]'); s.value = 'con_roof_pm'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(1500);
await A.ev(() => { const i = document.querySelector('[data-cp-target="ina@example.com|osha30"]'); i.value = '2027-06-30'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(1500);
const tg = cget('gc_cert_plan'), ina2 = await card('ina@example.com');
ok('CERTROLE: an admin\'s optional target date is saved on that person (a goal, not a deadline) and shows as 🎯 Target', tg.people['sam@example.com'].track === 'con_roof_pm' && tg.people['ina@example.com'] && tg.people['ina@example.com'].targets && tg.people['ina@example.com'].targets.osha30 === '2027-06-30' && tg.people['ina@example.com'].exc.classOk.asd && /🎯 Target Jun 30, 2027/.test(ina2.txt) && !/Overdue/.test(ina2.txt), { p: tg.people, t: ina2.txt.slice(0, 50) });
ok('the owner\'s raise rule note ($5 / $2 / $1, training policy) shows — no "suggestions" note', /The owner's raise rule/.test(txt) && /\$5\/hr/.test(txt) && /\$2\/hr for OSHA 30/.test(txt) && /Course fee paid by GrayCo/.test(txt) && !/suggestions/.test(txt), txt.slice(0, 600));
ok('👥 People: Pat — WRT held, RRP expired, Master Restorer courses due', /Pat Planner/.test(txt) && /✅ Held/.test(txt) && /❌ Expired — renew/.test(txt) && /IICRC ASD — Applied Structural Drying \(Master Restorer course\)/.test(txt), '');
ok('⭐ Max Master shows promotion eligible; LAW lines are marked', /⭐ IICRC Master Water Restorer — promotion eligible/.test(txt) && /LAW/.test(txt), '');
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certplan_people.png' });
await A.ev(() => document.querySelector('[data-cptab="raises"]').click()); await sleep(500);
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certplan_raises.png' });
await A.ev(() => [...document.querySelectorAll('[data-cp-raises] tr')].find(r => /Mo Tech/.test(r.innerText)).querySelector('[data-cp="approve"]').click()); await sleep(1500);
const saved = cget('gc_cert_plan');
const left = await A.ev(() => document.querySelectorAll('[data-cp="approve"]').length);
const sd = saved && saved.done ? saved.done.filter(d => !d.manual) : [];
ok('✅ Approve saves the raise (who, certificate, amount, by) to the cloud and it leaves the list (Mo: IICRC WRT $1/hr); Max (Mitigation Manager, commission-paid) has no raise row', sd.length === 1 && sd[0].email === 'mo@example.com' && sd[0].rule === 'iicrc:iicrc-wrt' && sd[0].amount === 1 && sd[0].unit === 'hr' && left === 8 + 6 + 1, { d: saved && saved.done, left });
await A.ev(() => document.querySelector('[data-cptab="outlook"]').click()); await sleep(500);
const olT = await A.ev(() => document.querySelector('[data-cp-outlook]').innerText);
ok('📈 Raise outlook & caps tab: every role with starting rate, certificates that pay, cap and top rate; mitigation tech top $25.00/hr ($18 + 7 courses, cap 8)', /Mitigation Technician/.test(olT) && /\$25\.00\/hr/.test(olT) && /Cross-training bonus/.test(olT) && await A.ev(() => document.querySelector('[data-cp-caphr="mit_tech"]').value === '8' && document.querySelector('[data-cp-start="env_tech"]').value === '23' && document.querySelector('[data-cp-masteronce]').checked), olT.slice(0, 300));
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certrole_raise_outlook.png' });
await A.ev(() => document.querySelector('[data-cptab="amounts"]').click()); await sleep(400);
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certrole_raise_amounts.png' });
await A.ev(() => document.querySelector('[data-cptab="pay"]').click()); await sleep(400);
const pay = await A.ev(() => { const s = (a, v) => { const e = document.querySelector('[' + a + ']'); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }; s('data-cp-tot', '50'); s('data-cp-em', '20'); return document.querySelector('[data-cp-out]').textContent; });
ok('⏱ the week checker: 50 h with 20 emergency → 20 h × $20 + 30 h × $30 = $1,300', /= \$1300\.00/.test(pay) && /not stacked/.test(pay), pay);
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certplan_pay.png' });
await A.ev(() => document.querySelector('[data-cptab="bonus"]').click()); await sleep(400);
await A.ev(() => { document.querySelector('[data-cp-ba="pat@example.com"]').value = '2500'; document.querySelector('[data-cp-bn="pat@example.com"]').value = 'Test notes'; document.querySelector('[data-cp="savebonus"]').click(); }); await sleep(1200);
const b = cget('gc_cert_plan'), y = String(new Date().getFullYear());
ok('🏆 PM year-end bonus saves per year (amount + notes)', b && b.bonus && b.bonus[y] && b.bonus[y]['pat@example.com'] && b.bonus[y]['pat@example.com'].amount === 2500, b && b.bonus);
await A.ev(() => document.querySelector('[data-cptab="reqs"]').click()); await sleep(400);
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certrole_reqs_by_role.png' });
await A.ev(() => { document.querySelector('[data-cp-newreq="env_pm"]').value = 'Mold assessor'; document.querySelector('[data-cp-newrec="env_pm"]').value = 'rec'; document.querySelector('[data-cp="addreq"][data-k="env_pm"]').click(); }); await sleep(1200);
const c = cget('gc_cert_plan');
ok('📋 a new requirement can be added to a role (env PM: "will be more"), as Recommended, with no deadline', c.tracks.env_pm.reqs.some(r => r.name === 'Mold assessor' && r.rec === true && !r.days), c.tracks.env_pm.reqs.map(r => r.name));
await A.ev(() => { const s = document.querySelector('[data-cp-rec="con_roof_pm|0"]'); s.value = 'req'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(1200);
const c2 = cget('gc_cert_plan');
ok('📋 an admin can switch a line between Required and 💡 Recommended per role (Roofing PM WRT → Required)', c2.tracks.con_roof_pm.reqs[0].id === 'wrt' && c2.tracks.con_roof_pm.reqs[0].rec === false && c2.tracks.con_ins_pm.reqs[0].rec !== true && c2.tracks.con_pm.reqs[0].rec === true, c2.tracks.con_roof_pm.reqs[0]);
const todo = await A.ev(() => window._gcTodoExt.map(f => { try { return f(); } catch (e) { return []; } }).flat().filter(x => /^cp/.test(x.key)).map(x => x.title));
ok('To-Do: raises due, and only EXPIRED required certificates (never "overdue") for admins', todo.some(t => /💵 Raise due: Dex Demo/.test(t)) && !todo.some(t => /💵 Raise due: (Pat Planner|Sam Demo|Ina Demo|Max Master)/.test(t)) && todo.some(t => /Pat Planner: 1 required certificate expired — renew/.test(t)) && !todo.some(t => /overdue/i.test(t)) && !todo.some(t => /(Mo Tech|Eve Abate|Sam Demo|Ina Demo): \d+ required/.test(t)), todo);
/* ── General Laborer → tech status ── */
const lab0 = await A.ev(() => { const C = window._gcCertPlan, U = window._crm.users, f = e => U.find(u => u.email === e), lou = C.raiseCalc(f('lou@example.com')), lea = C.raiseCalc(f('lea@example.com'));
  return { louT: lou.track, louDue: lou.due.length, leaDue: lea.due.length, leaBlocked: lea.blocked.map(x => x.why), p1: C.techCourses(f('lou@example.com')), p2: C.envPath(f('lea@example.com')), ol: C.outlookOf('gen_lab').start }; });
ok('LABORER: "General Laborer" → the entry track ($15 start); nothing due yet; Lea\'s RRP / lead / asbestos worker certificates are recorded but earn no raise before tech status', lab0.louT === 'gen_lab' && lab0.ol === 15 && lab0.louDue === 0 && lab0.leaDue === 0 && lab0.leaBlocked.length === 3 && lab0.leaBlocked.every(w => w === 'laborer') && lab0.p1.of > 0 && lab0.p1.passed === 0 && lab0.p1.target === 'mit_tech' && lab0.p2.certs === 3 && !lab0.p2.ready, { lab0: { ...lab0, p1: { of: lab0.p1.of, passed: lab0.p1.passed, target: lab0.p1.target }, p2: { certs: lab0.p2.certs, of: lab0.p2.of } } });
await A.ev(() => window._gcCertPlan.open('people')); await sleep(1500);
const louCard0 = await cardTxt('lou@example.com'), plan0 = await A.ev(() => { const C = window._gcCertPlan, u = window._crm.users.find(x => x.email === 'lou@example.com'), tp = C.trainPlan(u); return { cur: tp.cur.length, next: tp.next.length, week: tp.week && tp.week.title, overlap: tp.cur.some(m => tp.next.includes(m)) }; });
ok('TRAINING PAY: Lou\'s card — 📘 Current job — paid (1 day a week) with "This week\'s paid training: …"; 🎯 Next role (Mitigation tech / Environmental tech) "Optional · after hours · unpaid · counts toward your promotion / raise"; no course in both lists; "Attorney review pending on unpaid class days"', plan0.cur > 0 && plan0.next > 0 && !plan0.overlap && /📘 Current job — paid \(1 day a week\): 0 of \d+ passed · This week's paid training: /.test(louCard0) && /🎯 Next role \(Mitigation Technician \/ Abatement Technician\) — Optional · after hours · unpaid · counts toward your promotion \/ raise/.test(louCard0) && /Attorney review pending on unpaid class days/.test(louCard0), { plan0, t: louCard0.slice(-700) });
const passAll = rk => A.ev(rk => { const done = {}; window._gcTrain.required(rk).forEach(m => { (m.parts || []).forEach(x => { done[m.id + '|' + x.id] = x.quiz ? { score: 10, of: 10, best: 10, tries: 1, passed: true, at: new Date().toISOString() } : new Date().toISOString(); }); }); return done; }, rk);
cset('gc_train_p_lou@example_com', { done: await passAll('insurance') });
cset('gc_train_p_lea@example_com', { done: await passAll('enviro') });
await A.ev(async () => { await window._gcCertPlan.load(); window._gcCertPlan.open('people'); }); await sleep(1500);
const louCard = await cardTxt('lou@example.com'), leaCard = await cardTxt('lea@example.com');
ok('LABORER: both paths with progress on the card — Lou "Path 1 … N of N CRM courses passed — ⭐ Ready for tech status"; Lea "Path 2 — Environmental tech … certificates 3 of 3 … ⭐ Ready for Environmental tech status"', /Path 1 — Mitigation Technician[\s\S]*?(\d+) of \1 CRM courses passed — ⭐ Ready for tech status/.test(louCard) && /Path 2 — Environmental tech \(\$23\/hr\): certificates 3 of 3[\s\S]*⭐ Ready for Environmental tech status/.test(leaCard), { lou: louCard.slice(-600), lea: leaCard.slice(-500) });
await A.ev(() => document.querySelector('[data-cp-person="lou@example.com"]').scrollIntoView()); await sleep(200);
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certrole_laborer_paths.png' });
await A.ev(() => document.querySelector('[data-cptab="raises"]').click()); await sleep(600);
const rowsL = await A.ev(() => [...document.querySelectorAll('[data-cp-raises] tr')].filter(r => /Lou Demo|Lea Demo/.test(r.innerText)).map(r => r.innerText.replace(/\s+/g, ' ')));
ok('LABORER: 💵 Raises due shows "⭐ Ready for tech status — +$3/hr" (Lou) and "⭐ Ready for Environmental tech status — $23/hr (+$8/hr)" (Lea)', rowsL.some(r => /Lou Demo/.test(r) && /Ready for tech status — \+\$3\/hr/.test(r)) && rowsL.some(r => /Lea Demo/.test(r) && /Ready for Environmental tech status — \$23\/hr \(\+\$8\/hr\)/.test(r)), rowsL);
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certrole_laborer_raises_due.png' });
for (const nm of ['Lou Demo', 'Lea Demo']) { await A.ev(nm => [...document.querySelectorAll('[data-cp-raises] tr')].find(r => r.innerText.includes(nm) && /tech status/.test(r.innerText)).querySelector('[data-cp="approve"]').click(), nm); await sleep(1500); }
const lp = cget('gc_cert_plan');
await A.ev(() => document.querySelector('[data-cptab="people"]').click()); await sleep(600);
const louC2 = await cardTxt('lou@example.com'), leaC2 = await cardTxt('lea@example.com');
ok('LABORER: approving moves Lou to Mitigation tech at $15 + $3 = $18 and Lea to Environmental tech at $15 + $8 = $23 (logged in the raise history; the step is outside the tech cap)', lp.people['lou@example.com'].track === 'mit_tech' && lp.people['lou@example.com'].start === 15 && lp.people['lea@example.com'].track === 'env_tech' && lp.done.some(d => d.email === 'lou@example.com' && d.rule === 'techstatus' && d.amount === 3) && lp.done.some(d => d.email === 'lea@example.com' && d.rule === 'techstatus_env' && d.amount === 8) && /current \$18\.00\/hr/.test(louC2) && /current \$23\.00\/hr/.test(leaC2) && await A.ev(() => { const C = window._gcCertPlan, u = window._crm.users.find(x => x.email === 'lea@example.com'), c = C.raiseCalc(u); return c.track === 'env_tech' && c.earnedHr === 0 && c.due.length === 3; }), { lou: lp.people['lou@example.com'], lea: lp.people['lea@example.com'] });
await A.ev(() => { const o = document.getElementById('gc-certplan'); if (o) o.remove(); });
if (await A.ev(() => typeof window._gcOpenTimesheets === 'function')) {
  await A.ev(() => window._gcOpenTimesheets()); await sleep(1200);
  const tc = await A.ev(() => { const s = document.querySelector('#_tsC'); return s ? [...s.options].map(o => o.text) : null; });
  ok('⏱ Timesheets: an admin can add time as 📘 CRM training — current job (paid) or 🎯 Next-role training (optional, unpaid)', tc && tc.includes('📘 CRM training — current job (paid)') && tc.includes('🎯 Next-role training (optional, unpaid)'), tc);
  await A.ev(() => { document.querySelector('#_tsU').value = 'Tia Demo'; document.querySelector('#_tsC').value = 'training'; document.querySelector('#_tsAdd').click(); }); await sleep(1200);
  const ts = await A.ev(async () => { const l = (window.idbGet ? await window.idbGet('timesheets') : null) || []; return l.filter(r => r.user === 'Tia Demo').map(r => r.code || ''); });
  ok('⏱ the training entry is saved with code "training" (payroll counts it as $0, not toward overtime)', ts.includes('training'), ts);
}
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('CERTPLAN ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
