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
  { id: 'u10', name: 'Eli Demo', email: 'eli@example.com', role: 'Abatement Technician', companyId: 'environmental', hireDate: ago(400), active: true }]);
cset('gc_certs', { list: [
  { id: 'c1', holderType: 'person', holder: 'pat@example.com', holderName: 'Pat Planner', name: 'IICRC WRT (Water Restoration Technician)', issuer: 'IICRC', expires: ahead(200) },
  { id: 'c2', holderType: 'person', holder: 'pat@example.com', holderName: 'Pat Planner', name: 'EPA RRP Certified Renovator', issuer: 'EPA', expires: ago(5) },
  { id: 'c3', holderType: 'person', holder: 'mo@example.com', holderName: 'Mo Tech', name: 'IICRC WRT', issuer: 'IICRC', expires: ahead(300) },
  { id: 'c4', holderType: 'person', holder: 'max@example.com', holderName: 'Max Master', name: 'IICRC Master Water Restorer', issuer: 'IICRC', expires: ahead(300) },
  { id: 'c5', holderType: 'person', holder: 'sam@example.com', holderName: 'Sam Demo', name: 'IICRC UFT (Upholstery & Fabric)', issuer: 'IICRC', expires: ahead(300) }] });
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
    raisesSam: C.raisesDue(by('sam@example.com'), p).map(r => r.cert + '=' + r.amount + r.unit),
    pmReqs: p.tracks.con_pm.reqs.map(r => r.id), mitTech: p.tracks.mit_tech.reqs.map(r => r.id), envPm: p.tracks.env_pm.reqs.map(r => r.id), envTech: p.tracks.env_tech.reqs.map(r => r.id),
    pmMasterDays: p.tracks.con_pm.reqs.filter(r => /Master Restorer course/.test(r.name)).map(r => r.days),
    raisesPat: C.raisesDue(by('pat@example.com'), p).map(r => r.cert + '=' + r.amount + r.unit), raisesMo: C.raisesDue(by('mo@example.com'), p).map(r => r.cert + '=' + r.amount + r.unit),
    masterMax: C.masterOf(by('max@example.com')), masterMo: C.masterOf(by('mo@example.com')),
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
ok('CERTROLE: a recommended certificate still earns its raise (Sam, Roofing PM: UFT $1,000/yr)', m.raisesSam.join() === 'IICRC UFT (Upholstery & Fabric)=1000yr', m.raisesSam);
ok('mitigation tech requires WRT + the legal ones (HazCom, respirator, bloodborne, RRP on-the-job)', ['wrt', 'hazcom', 'resp', 'bbp', 'rrpojt'].every(x => m.mitTech.includes(x)), m.mitTech);
ok('environmental PM requires lead supervisor + RRP renovator (+ asbestos supervisor, respirator, blood lead)', ['leadsup', 'rrp', 'asbsup', 'resp', 'bloodlead'].every(x => m.envPm.includes(x)), m.envPm);
ok('environmental tech requires the abatement worker license (+ asbestos worker, respirator, blood lead)', ['leadwork', 'asbwork', 'resp', 'bloodlead'].every(x => m.envTech.includes(x)), m.envTech);
ok('raises due: Pat (salaried PM) WRT $1,000/yr + RRP $1,000/yr; Mo (hourly) WRT $0.50/hr', m.raisesPat.join() === 'IICRC WRT (Water Restoration Technician)=1000yr,EPA RRP Certified Renovator=1000yr' && m.raisesMo.join() === 'IICRC WRT=0.5hr', m);
ok('⭐ Master Water Restorer → promotion eligible; no master → not', m.masterMax && /promotion eligible/.test(m.masterMax.l) && !m.masterMo, m.masterMax);
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
ok('CERTROLE: Ina Demo (Insurance PM) — the IICRC set is Required, shown as "📈 Keep on — no deadline" (no countdown) with an optional target date', ina.tk === 'con_ins_pm' && ['wrt', 'asd', 'amrt', 'fsrt', 'oct', 'cct', 'uft'].every(x => ina.req.includes(x)) && !ina.rec.length && ina.count === '0 of 11 required certificates held' && /📈 Keep on — no deadline/.test(ina.txt) && !/Due |\(\d+ d\)|Overdue|days of hire/.test(ina.txt) && ina.targets === 8, ina);
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
/* the track picker: Roofing / Insurance options; a change is saved for that person only */
const opts = await A.ev(() => [...document.querySelector('[data-cp-track="sam@example.com"]').options].map(o => o.value));
await A.ev(() => { const s = document.querySelector('[data-cp-track="sam@example.com"]'); s.value = 'con_ins_pm'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(1500);
const tsv = cget('gc_cert_plan'), sam2 = await card('sam@example.com');
ok('CERTROLE: the track picker has Roofing PM and Insurance PM; changing Sam to Insurance PM saves on Sam only and his IICRC lines become Required', opts.includes('con_roof_pm') && opts.includes('con_ins_pm') && tsv && tsv.people && tsv.people['sam@example.com'] && tsv.people['sam@example.com'].track === 'con_ins_pm' && Object.keys(tsv.people).join() === 'sam@example.com' && sam2.tk === 'con_ins_pm' && sam2.req.includes('wrt') && !sam2.rec.length && (await card('pat@example.com')).tk === 'con_pm', { opts, people: tsv && tsv.people, sam2: sam2.tk });
await A.ev(() => { const s = document.querySelector('[data-cp-track="sam@example.com"]'); s.value = 'con_roof_pm'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(1500);
await A.ev(() => { const i = document.querySelector('[data-cp-target="ina@example.com|osha30"]'); i.value = '2027-06-30'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(1500);
const tg = cget('gc_cert_plan'), ina2 = await card('ina@example.com');
ok('CERTROLE: an admin\'s optional target date is saved on that person (a goal, not a deadline) and shows as 🎯 Target', tg.people['sam@example.com'].track === 'con_roof_pm' && tg.people['ina@example.com'] && tg.people['ina@example.com'].targets && tg.people['ina@example.com'].targets.osha30 === '2027-06-30' && /🎯 Target Jun 30, 2027/.test(ina2.txt) && !/Overdue/.test(ina2.txt), { p: tg.people, t: ina2.txt.slice(0, 50) });
ok('the "amounts are suggestions" note shows until they are set', /are <b>suggestions<\/b>|are suggestions/.test(await A.ev(() => document.getElementById('gc-certplan').innerHTML)) || /suggestions/.test(txt), txt.slice(0, 400));
ok('👥 People: Pat — WRT held, RRP expired, Master Restorer courses due', /Pat Planner/.test(txt) && /✅ Held/.test(txt) && /❌ Expired — renew/.test(txt) && /IICRC ASD — Applied Structural Drying \(Master Restorer course\)/.test(txt), '');
ok('⭐ Max Master shows promotion eligible; LAW lines are marked', /⭐ IICRC Master Water Restorer — promotion eligible/.test(txt) && /LAW/.test(txt), '');
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certplan_people.png' });
await A.ev(() => document.querySelector('[data-cptab="raises"]').click()); await sleep(500);
await A.page().screenshot({ path: (process.argv[3] || '/tmp') + '/certplan_raises.png' });
await A.ev(() => document.querySelector('[data-cp="approve"]').click()); await sleep(1500);
const saved = cget('gc_cert_plan');
const left = await A.ev(() => document.querySelectorAll('[data-cp="approve"]').length);
ok('✅ Approve saves the raise (who, certificate, amount, by) to the cloud and it leaves the list; a Master designation is one raise (not also an IICRC course raise)', saved && saved.done && saved.done.length === 1 && saved.done[0].email === 'max@example.com' && saved.done[0].rule === 'master:iicrc-master-water-restorer' && saved.done[0].amount === 3000 && saved.done[0].unit === 'yr' && left === 4, { d: saved && saved.done, left });
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
ok('To-Do: raises due, and only EXPIRED required certificates (never "overdue") for admins', todo.some(t => /💵 Raise due: Mo Tech/.test(t)) && todo.some(t => /Pat Planner: 1 required certificate expired — renew/.test(t)) && !todo.some(t => /overdue/i.test(t)) && !todo.some(t => /(Mo Tech|Eve Abate|Sam Demo|Ina Demo): \d+ required/.test(t)), todo);
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('CERTPLAN ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
