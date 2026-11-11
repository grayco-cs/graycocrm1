// test_HRDOCS.mjs <build-dir> [--shots <dir>] — owner 11/11: the company-made HR papers for hiring (handbook statements, at-will,
// confidentiality, timekeeping & location, phones / photos, safety / PPE, respirator, HazCom, lead / asbestos, customer property,
// code of conduct, conflict of interest, FCRA disclosure + authorization, job descriptions, PM comp, return of property) and the
// 📋 Hiring packet (Admin → Hiring). Offline harness, made-up data.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
import fs from 'fs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 400) : '')); };
const shots = process.argv.indexOf('--shots') > 0 ? process.argv[process.argv.indexOf('--shots') + 1] : '';
if (shots) fs.mkdirSync(shots, { recursive: true });
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('candidates', [{ id: 'C1', name: 'Demo Candidate', position: 'Water Mitigation Tech', stage: 'Interview', email: '' }]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await A.page().setViewportSize({ width: 1440, height: 900 });
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(8000);
const p = A.page();

/* 1. every new paper renders, no leftover {placeholders}, with signature lines, internal, HR */
const r1 = await A.ev(async () => {
  const H = window._gcHirePacket, out = [];
  for (const d of H.docs()) {
    const r = await window._gcDocLib.render(d.id, '');
    const pg = (r && r.page) || '';
    out.push({ id: d.id, ok: !!pg, left: (pg.match(/\{[a-z_]+\}/g) || []), sig: /data-gc-sig="1"/.test(pg) && /Employee[^<]*— signature|Applicant \/ employee[^<]*— signature/.test(pg) && /For [^<]*— signature/.test(pg) && (pg.match(/>Date</g) || []).length >= 2,
      cf: d.clientFacing, cat: d.category, head: /GrayCo/.test(pg.slice(0, pg.indexOf('<h2'))) });
  }
  return out;
});
const ids = r1.map(x => x.id);
const WANT = ['handbook_ack', 'at_will', 'confidentiality', 'timekeeping', 'phones_photos', 'safety_ppe', 'respirator', 'hazcom', 'lead_asbestos', 'customer_property', 'code_conduct', 'conflict', 'bg_disclosure', 'bg_authorization',
  'jd_pm', 'jd_estimator', 'jd_office', 'jd_foreman', 'jd_mit_tech', 'jd_mit_manager', 'jd_env_tech', 'jd_laborer', 'jd_marketing', 'pm_comp', 'property_return'].map(x => 'gcb_hr_' + x);
ok('all ' + WANT.length + ' new HR papers are in the library', WANT.every(x => ids.includes(x)) && ids.length === WANT.length, ids.filter(x => !WANT.includes(x)));
ok('each one renders (letterhead + body)', r1.every(x => x.ok && x.head), r1.filter(x => !x.ok || !x.head).map(x => x.id));
ok('no leftover {placeholders}', r1.every(x => !x.left.length), r1.filter(x => x.left.length));
ok('each has an employee signature / date and a company representative signature / date', r1.every(x => x.sig), r1.filter(x => !x.sig).map(x => x.id));
ok('internal (not client-facing), category HR', r1.every(x => x.cf === false && x.cat === 'HR'), r1.filter(x => x.cf !== false || x.cat !== 'HR').map(x => x.id));

/* 2. content checks */
const c = await A.ev(async () => {
  const g = async id => { const r = await window._gcDocLib.render(id, ''); return r ? r.body : ''; };
  const hb = await g('gcb_hr_handbook_ack'), tk = await g('gcb_hr_timekeeping'), cf = await g('gcb_hr_confidentiality'), bg = await g('gcb_hr_bg_disclosure'), au = await g('gcb_hr_bg_authorization'),
    hz = await g('gcb_hr_hazcom'), la = await g('gcb_hr_lead_asbestos'), rp = await g('gcb_hr_respirator'), cc = await g('gcb_hr_code_conduct'), pc = await g('gcb_hr_pm_comp'), jm = await g('gcb_hr_jd_mit_tech'), je = await g('gcb_hr_jd_env_tech'), ob = await g('gcb_onboarding');
  return {
    hb: /at will/.test(hb) && /approved on Thursday/.test(hb) && /on Friday/.test(hb) && /empathy/.test(hb) && /No retaliation/.test(hb) && /Attendance/.test(hb) && /not a contract/.test(hb),
    tk: /only while you are on the clock/.test(tk) && /clock in/.test(tk) && /No work off the clock/.test(tk) && /approved by your supervisor <b>ahead of time/.test(tk) && /Missed or wrong punches/.test(tk) && /consent/i.test(tk),
    cf: /does <b>not<\/b> stop the employee from working for another contractor/.test(cf) && !/non-competition/i.test(cf),
    bg: /consumer report/.test(bg) && !/release|waive/i.test(bg), au: /separate <b>Disclosure/.test(au),
    hz: /🧪 Materials &amp; SDS/.test(hz) && /secondary container/.test(hz) && /Never mix chemicals/.test(hz),
    la: /No eating, drinking, smoking/.test(la) && /medical surveillance/i.test(la) && /Lead Abatement <b>Worker/.test(la),
    rp: /Medical evaluation first/.test(rp) && /Fit test second/.test(rp), cc: /Do not discuss insurance coverage, the cause of the loss, or who is to blame/.test(cc) && /No side work for GrayCo customers/.test(cc) && /I\'m sorry this happened|I'm sorry this happened/.test(cc),
    pc: /Pay Structures/.test(pc) && !/\d+\s?%|\$\s?\d/.test(pc.replace(/<[^>]+>/g, ' ')), jm: /WRT/.test(jm) && /ASD/.test(jm) && /Field app/.test(jm) && /I have read my job description/.test(jm), je: /RRP/.test(je) && /Lead Abatement Worker/.test(je) && /Asbestos Abatement Worker/.test(je),
    ob: /Location policy signed — location tracking sign-off/.test(ob)
  };
});
ok('Handbook: values / empathy, at-will, EEO + reporting, attendance, weekly pay (approve Thursday, pay Friday), not a contract', c.hb);
ok('Timekeeping: clock in at the job, location only while on the clock, no off-the-clock work, overtime pre-approval, missed punches, consent', c.tk);
ok('Confidentiality: no non-compete', c.cf);
ok('FCRA: the disclosure stands alone (no release / waiver); the authorization is separate', c.bg && c.au);
ok('HazCom: SDS in 🧪 Materials & SDS, label secondary containers, never mix chemicals', c.hz);
ok('Lead / asbestos: certifications, medical surveillance, no eating / drinking / smoking', c.la);
ok('Respirator: medical evaluation and fit test before use', c.rp);
ok('Code of conduct: empathy, no coverage / cause / blame talk, no side work', c.cc);
ok('PM comp: refers to the CRM Pay Structures, no hard-coded numbers', c.pc);
ok('Job descriptions: mitigation tech WRT / ASD + apps + "I have read my job description"; environmental tech RRP / lead / asbestos', c.jm && c.je);
ok('onboarding checklist has the location tracking policy sign-off', c.ob);

/* 3. final wording (owner 11/11: "lawyer signed on everything … these documents are good"): no DRAFT flag anywhere; one admin-only note */
const dr = await A.ev(() => { const H = window._gcHirePacket; return { draftApi: 'draft' in H, notes: Object.keys(H.notes), nc: H.notes.gcb_hr_confidentiality || '', anyDraft: H.docs().some(d => d.draft || (d.flags && d.flags.length)) }; });
ok('no DRAFT flag on the new HR papers; only the admin non-compete note', !dr.draftApi && !dr.anyDraft && dr.notes.length === 1 && /Tennessee enforces a non-compete only where it protects a legitimate business interest/.test(dr.nc), dr);
await A.ev(() => window._gcDocLib.edit('gcb_hr_confidentiality')); await sleep(2200);
const ed = await A.ev(() => { const o = document.getElementById('_dlEditOv'); const n = o && o.querySelector('[data-gc-admin-note="hrdocs"]'); const t = n ? n.textContent : ''; if (o) o.remove(); return { has: !!o, note: /No non-compete by default/.test(t), draft: /DRAFT|pending attorney review/.test(t) }; });
ok('template editor (admins): the non-compete note, no DRAFT', ed.has && ed.note && !ed.draft, ed);
await A.ev(() => window._gcDocLib.edit('gcb_hr_handbook_ack')); await sleep(2000);
const ed2 = await A.ev(() => { const o = document.getElementById('_dlEditOv'); const r = { has: !!o, hr: !!(o && o.querySelector('[data-gc-admin-note="hrdocs"],[data-gc-admin-note="legal2"]')) }; if (o) o.remove(); return r; });
ok('template editor for the handbook statements: no draft / HR note', ed2.has && !ed2.hr, ed2);
const pr = await A.ev(async () => { const r = await window._gcHirePacket.render('gcb_hr_confidentiality', { name: 'Demo Person', co: 'construction' }); return { note: /non-compete only where|data-gc-admin-note|DRAFT/.test(r.page) }; });
ok('the admin note is never printed', !pr.note, pr);

/* 4. packets per role */
const pk = await A.ev(() => { const H = window._gcHirePacket, o = {}; H.roles.forEach(r => { ['construction', 'mitigation', 'environmental'].forEach(co => { o[r.id + '@' + co] = H.list(r.id, co).filter(x => x.on || x.kind === 'link').map(x => x.id); }); }); return o; });
const has = (k, id) => (pk[k] || []).includes(id);
const COMMON = ['gcb_offer_letter', 'gcb_onboarding', 'gcb_hr_handbook_ack', 'gcb_hr_at_will', 'gcb_hr_confidentiality', 'gcb_hr_timekeeping', 'gcb_hr_phones_photos', 'gcb_hr_safety_ppe', 'gcb_hr_customer_property', 'gcb_hr_code_conduct', 'gcb_hr_conflict', 'gcb_tool_issue', 'gcb_drug_policy', 'gcb_direct_deposit', 'gcb_emergency_contact', 'gcb_hr_bg_disclosure', 'gcb_hr_bg_authorization', 'link_i9', 'link_w4', 'link_tn_newhire'];
ok('every role / company packet has the common papers + I-9 / W-4 / TN new-hire links', Object.keys(pk).every(k => COMMON.every(id => has(k, id))), Object.keys(pk).filter(k => !COMMON.every(id => has(k, id))));
ok('each role gets its own job description', ['pm', 'estimator', 'office', 'foreman', 'mit_tech', 'mit_manager', 'env_tech', 'laborer', 'marketing'].every(r => has(r + '@construction', 'gcb_hr_jd_' + r)));
ok('PM + estimator packets include the PM comp acknowledgment; others do not', has('pm@construction', 'gcb_hr_pm_comp') && has('estimator@mitigation', 'gcb_hr_pm_comp') && !has('office@construction', 'gcb_hr_pm_comp') && !has('mit_tech@mitigation', 'gcb_hr_pm_comp'));
ok('Environmental tech packet includes lead / asbestos + respirator + HazCom', has('env_tech@environmental', 'gcb_hr_lead_asbestos') && has('env_tech@environmental', 'gcb_hr_respirator') && has('env_tech@environmental', 'gcb_hr_hazcom'), pk['env_tech@environmental']);
ok('Mitigation tech packet: respirator + HazCom, no lead / asbestos', has('mit_tech@mitigation', 'gcb_hr_respirator') && has('mit_tech@mitigation', 'gcb_hr_hazcom') && !has('mit_tech@mitigation', 'gcb_hr_lead_asbestos'));
ok('Construction laborer: no respirator / lead papers; Environmental laborer: both', !has('laborer@construction', 'gcb_hr_respirator') && !has('laborer@construction', 'gcb_hr_lead_asbestos') && has('laborer@environmental', 'gcb_hr_respirator') && has('laborer@environmental', 'gcb_hr_lead_asbestos'));
ok('Office packet: no respirator / HazCom / vehicle / PM comp', !has('office@construction', 'gcb_hr_respirator') && !has('office@construction', 'gcb_hr_hazcom') && !has('office@construction', 'gcb_vehicle_policy'), pk['office@construction']);
ok('drivers get the vehicle policy (PM, foreman, techs)', has('pm@construction', 'gcb_vehicle_policy') && has('mit_tech@mitigation', 'gcb_vehicle_policy') && !has('laborer@construction', 'gcb_vehicle_policy'));
const ord = pk['pm@construction'];
ok('signing order: offer letter first, handbook ack before at-will, background disclosure before authorization, job description near the end', ord[0] === 'gcb_offer_letter' && ord.indexOf('gcb_hr_handbook_ack') < ord.indexOf('gcb_hr_at_will') && ord.indexOf('gcb_hr_bg_disclosure') < ord.indexOf('gcb_hr_bg_authorization') && ord.indexOf('gcb_hr_jd_pm') > ord.indexOf('gcb_hr_bg_authorization'), ord);

/* 4b. owner 11/11 additions: the foreman's daily job data (Mitigation / Environmental) and the Mitigation Manager */
const mm = await A.ev(async () => {
  const g = async id => { const r = await window._gcDocLib.render(id, ''); return r ? r.body : ''; };
  const fo = await g('gcb_hr_jd_foreman'), mg = await g('gcb_hr_jd_mit_manager'), H = window._gcHirePacket;
  const L = H.list('mit_manager', 'mitigation').filter(x => x.on).map(x => x.id);
  return {
    fo: /entering <b>all<\/b> of the job\'s data in the app <b>every day<\/b>/.test(fo) && /psychrometric/.test(fo) && /Equipment in and out/.test(fo) && /consents/.test(fo) && /Containment|containment/.test(fo) && /submit the day for the PM\'s review/.test(fo) && /Technicians may add photos and notes, but the foreman/.test(fo),
    mg: /fills it personally/.test(mg) && /Always on call for emergencies \(24 hours a day, 7 days a week\)/.test(mg) && /dispatch crews/.test(mg) && /board-ups/.test(mg) && /foremen\'s daily job entries/.test(mg) && /drying goals/.test(mg) && /On-call acknowledgment/.test(mg) && /WRT and ASD/.test(mg) && /FSRT recommended/.test(mg) && /AMRT for mold/.test(mg) && /Vehicle Use/.test(mg) && /I have read my job description/.test(mg),
    role: H.roles.some(r => r.id === 'mit_manager'), guess: H.roleOf('Mitigation Manager'), L,
    draft: H.docs().some(d => d.draft) };
});
ok('Foreman JD: on Mitigation / Environmental jobs enters ALL the day\'s job data and submits it for the PM\'s review; techs may add photos / notes', mm.fo);
ok('Mitigation Manager JD: all mitigation workers, fills no-show shifts personally, always on call 24/7, dispatch / board-ups, oversees foremen entries, equipment, drying goals, certs, vehicle, on-call acknowledgment', mm.mg && !mm.draft);
ok('Mitigation Manager is a packet role (company Mitigation): respirator, HazCom, safety / PPE, timekeeping & location, vehicle, its JD', mm.role && mm.guess === 'mit_manager' && ['gcb_hr_respirator', 'gcb_hr_hazcom', 'gcb_hr_safety_ppe', 'gcb_hr_timekeeping', 'gcb_vehicle_policy', 'gcb_hr_jd_mit_manager'].every(x => mm.L.includes(x)) && !mm.L.includes('gcb_hr_lead_asbestos'), mm);
await A.ev(() => window._gcHirePacket.open({ role: 'mit_manager' })); await sleep(400);
const mco = await A.ev(() => { const o = document.getElementById('gc-hp'); const v = o ? o.querySelector('[data-hp-f="co"]').value : ''; if (o) o.remove(); return v; });
ok('the packet screen picks GrayCo Mitigation for a Mitigation Manager', mco === 'mitigation', mco);

/* 5. filled with the person's name and the company */
const fl = await A.ev(async () => {
  const H = window._gcHirePacket;
  const a = await H.render('gcb_hr_handbook_ack', { name: 'Demo Tech', position: 'Field Technician — Mitigation', co: 'mitigation' });
  const b = await H.render('gcb_offer_letter', { name: 'Demo Tech', position: 'Field Technician — Mitigation', co: 'mitigation' });
  const x = await H.combined('env_tech', 'environmental', { name: 'Demo Enviro', position: 'Environmental Technician' });
  return { a: /Demo Tech/.test(a.page) && /<b>GrayCo Mitigation, LLC<\/b>/.test(a.page) && /GrayCo Construction Services, LLC \(construction and restoration\), GrayCo Mitigation, LLC \(water/.test(a.page) && /GrayCo Mitigation, LLC · /.test(a.page) && !/GrayCo Construction Services, LLC · /.test(a.page), b: /<b>Demo Tech<\/b>/.test(b.page) && /GrayCo Mitigation, LLC/.test(b.page),
    x: x.count, xl: /GrayCo Environmental, LLC/.test(x.html) && /Demo Enviro/.test(x.html) && (x.html.match(/page-break-after:always/g) || []).length >= x.count - 1 && /Lead &amp; Asbestos Worker Acknowledgment|Lead & Asbestos Worker Acknowledgment/.test(x.html) && !/\{[a-z_]+\}/.test(x.html) };
});
ok('a new paper opens filled with the employee name and the company (Mitigation)', fl.a, fl);
ok('an existing paper (offer letter) is filled too', fl.b, fl);
ok('Print all: one packet, page per paper, Environmental letterhead name, no placeholders', fl.x >= 20 && fl.xl, fl);

/* 6. the screen: Admin → Hiring → 📋 Hiring packet */
await A.ev(() => { const b = [...document.querySelectorAll('aside button, nav button, button')].find(x => /^\W*Admin$/.test((x.textContent || '').trim())); if (b) b.click(); });
await sleep(1500);
await A.ev(() => { const b = [...document.querySelectorAll('main button')].find(x => (x.textContent || '').trim().replace(/^\S+\s+/, '') === 'Hiring'); if (b) b.click(); });
await sleep(2500);
const hb = await A.ev(() => !!document.getElementById('gc-hp-btn'));
ok('Admin → Hiring has the 📋 Hiring packet button', hb);
if (hb) await A.ev(() => document.getElementById('gc-hp-btn').click()); else await A.ev(() => window._gcHirePacket.open({}));
await sleep(600);
await A.ev(() => { const s = document.querySelector('#gc-hp [data-hp-f="role"]'); s.value = 'mit_tech'; s.dispatchEvent(new Event('change', { bubbles: true })); const n = document.querySelector('#gc-hp [data-hp-f="name"]'); n.value = 'Demo Tech'; n.dispatchEvent(new Event('input', { bubbles: true })); });
await sleep(500);
const sc = await A.ev(() => { const o = document.getElementById('gc-hp'); return { items: o.querySelectorAll('[data-hp-open]').length, co: o.querySelector('[data-hp-f="co"]').value, resp: !!o.querySelector('[data-hp-item="gcb_hr_respirator"]'), draft: o.querySelectorAll('[data-gc-admin-note],.tag').length - o.querySelectorAll('.tag').length + (/DRAFT|pending attorney/.test(o.textContent) ? 1 : 0), links: o.querySelectorAll('a[href*="uscis.gov"],a[href*="irs.gov"],a[href*="tnnewhire"]').length }; });
ok('packet screen: Mitigation tech → Mitigation company, respirator in the list, no DRAFT notes, I-9 / W-4 / TN links', sc.items >= 20 && sc.co === 'mitigation' && sc.resp && sc.draft === 0 && sc.links === 3, sc);
if (shots) await p.screenshot({ path: shots + '/hr_packet_mitigation_tech.png' });
await A.ev(() => document.querySelector('#gc-hp [data-hp-open="gcb_hr_handbook_ack"]').click()); await sleep(2500);
const vw = await A.ev(() => { const v = document.getElementById('gc-viewer'); return { open: !!v, txt: v ? (v.textContent || '').slice(0, 200) : '' }; });
ok('👁 Open shows the paper in the CRM viewer', vw.open, vw);
if (shots) await p.screenshot({ path: shots + '/hr_handbook_page.png' });
await A.ev(() => { const v = document.getElementById('gc-viewer'); const x = v && [...v.querySelectorAll('button')].find(b => /close|×|✕/i.test(b.textContent || '') || /close/i.test(b.getAttribute('data-gv') || '')); if (x) x.click(); else if (v) v.remove(); });
await sleep(600);
await A.ev(() => document.querySelector('#gc-hp [data-hp-open="gcb_hr_jd_mit_tech"]').click()); await sleep(2500);
if (shots) await p.screenshot({ path: shots + '/hr_job_description_mit_tech.png' });
await A.ev(() => { const v = document.getElementById('gc-viewer'); const x = v && [...v.querySelectorAll('button')].find(b => /close|×|✕/i.test(b.textContent || '') || /close/i.test(b.getAttribute('data-gv') || '')); if (x) x.click(); else if (v) v.remove(); const o = document.getElementById('gc-hp'); if (o) o.remove(); });

/* 7. not sendable to a customer */
const sd = await A.ev(async () => { const r = await window._gcDocLib.send('gcb_hr_handbook_ack', 'NOJOB'); return r; });
ok('HR papers are not sendable to a customer', sd && sd.ok === false, sd);

ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('HRDOCS ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
