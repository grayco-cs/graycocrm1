// test_ENVDOCS_fn.mjs [build dir] — ENVDOCS without a browser: envcomp-core.js (who does the asbestos work, the licensed sub, the lead
// decon unit, the program administrators, the per-job Employee Protection Plan, the sign set, filling a Word program) and the Word / PDF
// files in company-docs/ (new versions added, the originals kept). Made-up data, no network, no live writes.
import { createRequire } from 'module'; import path from 'path'; import fs from 'fs'; import zlib from 'zlib';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.');
const C = require(path.join(BUILD, 'envcomp-core.js'));
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const day = n => C.addDays(C.today(), n);
const DIR = path.join(BUILD, 'company-docs/01667c529f454cf1');
/* a tiny zip reader (the Word files) */
function unzip(file){ const b = fs.readFileSync(file), out = {}; let e = b.length - 22; while (e >= 0 && b.readUInt32LE(e) !== 0x06054b50) e--; const n = b.readUInt16LE(e + 10); let q = b.readUInt32LE(e + 16);
  for (let i = 0; i < n; i++) { const m = b.readUInt16LE(q + 10), cs = b.readUInt32LE(q + 20), nl = b.readUInt16LE(q + 28), el = b.readUInt16LE(q + 30), cl = b.readUInt16LE(q + 32), lo = b.readUInt32LE(q + 42), name = b.slice(q + 46, q + 46 + nl).toString();
    const ln = b.readUInt16LE(lo + 26), le = b.readUInt16LE(lo + 28), d = b.slice(lo + 30 + ln + le, lo + 30 + ln + le + cs); out[name] = m === 8 ? zlib.inflateRawSync(d).toString() : d.toString(); q += 46 + nl + el + cl; }
  return out; }
const docText = f => { const z = unzip(path.join(DIR, f)); return (z['word/document.xml'].match(/<w:t[^>]*>[^<]*<\/w:t>|<\/w:p>/g) || []).map(x => x === '</w:p>' ? '\n' : x.replace(/<[^>]+>/g, '')).join('').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'); };

/* ── the people, the jobs ── */
const users = [{ name: 'Demo Owner', email: 'owner@example.com', role: 'Admin', active: true, phone: '(901) 555-0101' }, { name: 'Demo Lead Admin', email: 'leadadmin@example.com', role: 'Admin', active: true, phone: '(901) 555-0102' },
  { name: 'Sam Sup', email: 'sam@example.com', role: 'Abatement Supervisor' }, { name: 'Wes Work', email: 'wes@example.com', role: 'Abatement Worker' }];
const certs = [{ id: 'c1', holderType: 'person', holder: 'leadadmin@example.com', holderName: 'Demo Lead Admin', ckind: 'lead_supervisor', name: 'Lead Abatement Supervisor', issuer: 'Demo Training', state: 'AR', issued: '2026-11-16', expires: day(360) },
  { id: 'c2', holderType: 'person', holder: 'sam@example.com', holderName: 'Sam Sup', ckind: 'lead_supervisor', name: 'Lead Abatement Supervisor', state: 'TN', expires: day(300) }];
const ctx = { rules: C.rules(), certs, users, schedule: [], medStatus: {}, today: C.today(), company: p => p.companyId || 'construction' };
const asb = { id: 'J1', name: 'Demo Asbestos Job', type: 'Asbestos abatement', companyId: 'environmental', address: '1 Demo St, Memphis, TN 38103', status: 'active', pct: 10, startDate: day(-2), abatementSupervisor: 'Sam Sup', crew: ['Wes Work'], pm: 'Pat PM' };
const lead = { id: 'J2', name: 'Demo Lead Abatement', type: 'Lead abatement', companyId: 'environmental', address: '2 Demo Rd, Little Rock, AR 72201', status: 'active', pct: 10, startDate: day(-1), abatementSupervisor: 'Sam Sup', crew: ['Wes Work'], pm: 'Pat PM' };

console.log('1 · who does the asbestos work (owner 11/17: "GrayCo will hire an asbestos contractor for now")');
let E = C.evaluate(asb, ctx);
ok(C.asbBy(asb, ctx.rules) === 'sub' && E.asbBy === 'sub', 'every asbestos job defaults to a licensed abatement sub');
ok(!E.items.some(x => /^asb-(worker|sup|firm)/.test(x.id)) && E.items.some(x => x.id === 'asb-aware:wes work'), 'the GrayCo crew is not held to asbestos abatement licenses — awareness training instead', E.items.map(x => x.id));
ok(!E.items.some(x => /^med:|^fit:/.test(x.id)), 'no asbestos medical surveillance / fit test for the GrayCo crew on a sub\'s asbestos job');
const sf = E.items.find(x => x.id === 'sub-firm'), scp = E.items.find(x => x.id === 'sub-cp');
ok(sf && sf.st === 'block' && scp && scp.st === 'block' && /confirm/i.test(sf.note), 'the sub\'s license and competent person are ⛔ until entered (labelled "confirm with your state program")', [sf, scp]);
ok(E.items.some(x => x.id === 'asb-notice-tn' && /filed by the abatement sub/.test(x.label)) && E.items.some(x => x.id === 'asb-personal' && /by the abatement sub/.test(x.label)), 'the state notice and air monitoring are the sub\'s — GrayCo records them');
ok(E.items.some(x => x.sec === 'program' && x.id === 'asb') && !E.items.some(x => x.id === 'asbcrew') && !E.items.some(x => x.id === 'resp'), 'the awareness program applies (not the crew program, not the respirator program)');
const subbed = Object.assign({}, asb, { envComp: { asbSub: { company: 'Demo Abatement LLC', license: 'TN-A-123', state: 'TN', licenseExp: day(200), competent: 'Ann Demo', competentLic: 'S-9', competentPhone: '(901) 555-0199', notice: { on: day(-12), conf: 'TDEC-555' }, workPlan: { on: day(-10) } } } });
let E2 = C.evaluate(subbed, ctx);
ok(E2.items.find(x => x.id === 'sub-firm').st === 'ok' && E2.items.find(x => x.id === 'sub-cp').st === 'ok' && E2.items.find(x => x.id === 'sub-notice').st === 'ok' && E2.items.find(x => x.id === 'sub-release').st === 'wait', 'the sub\'s license, competent person and notice → ✅; the release waits for the end of the job');
const crewJob = Object.assign({}, asb, { envComp: { asbBy: 'crew' } });
let E3 = C.evaluate(crewJob, ctx);
ok(E3.items.some(x => x.id === 'asb-worker:wes work' && x.st === 'block') && E3.items.some(x => x.id === 'asbcrew' && /NOT IN USE/.test(x.note)) && !E3.items.some(x => x.sec === 'sub'), 'GrayCo crew: the abatement licenses apply, the GrayCo Asbestos Program shows "NOT IN USE"');
ok(C.asbBy(asb, C.rules({ settings: { asbDefault: 'crew' } })) === 'crew', 'the default is an admin setting');

console.log('2 · the written programs — administrator from the people list, never a name in the code');
const src = fs.readFileSync(path.join(BUILD, 'envcomp-core.js'), 'utf8');
ok(!/Wesley|Johnson|Nick Gray/.test(src), 'no person\'s name is written in envcomp-core.js');
const PI = C.programInfo(ctx.rules, 'lead', ctx);
ok(PI.admin === 'Demo Lead Admin' && PI.phone === '(901) 555-0102' && PI.adminDefault && /lead abatement supervisor certification/i.test(PI.why), 'lead program: the default administrator is the admin holding the lead supervisor certification', PI);
ok(C.programInfo(ctx.rules, 'hazcom', ctx).admin === 'Demo Owner', 'a program with no certification rule: the first admin on the people list');
const R5 = C.rules({ programs: C.DEFAULT_RULES.programs.map(r => r.id === 'resp' ? Object.assign({}, r, { adminName: 'Demo Set Name', adminPhone: '555', approvedBy: 'Demo Owner', approvedOn: '2026-11-17', reviewed: day(-400) }) : r) });
const PR = C.programInfo(R5, 'resp', ctx);
ok(PR.admin === 'Demo Set Name' && PR.approvedBy === 'Demo Owner' && PR.reviewDue && PR.overdue, 'the admin\'s settings win; a review more than a year ago is due (the yearly review reminder)', PR);
ok(C.DEFAULT_RULES.programs.every(r => fs.existsSync(path.join(BUILD, r.file))), 'every program file the rules point to exists');
ok(C.DEFAULT_RULES.programs.find(r => r.id === 'asbcrew').inUse === false, 'the GrayCo Asbestos Program is NOT in use by default');

console.log('3 · the per-job Employee Protection Plan');
let EL = C.evaluate(lead, ctx), pl = EL.items.find(x => x.id === 'epp');
ok(pl && pl.st === 'due' && EL.plan.st === 'none', 'no plan → ⚠ on the job');
ok(C.evaluate(lead, Object.assign({}, ctx, { rules: C.rules({ settings: { planBlock: true } }) })).items.find(x => x.id === 'epp').st === 'block', 'configurable to ⛔');
const P = C.buildPlan(lead, Object.assign({}, ctx, { E: EL }), { v: 1, by: 'Demo Office', company: { name: 'GrayCo Environmental, LLC', address: '5796 Ferguson Rd, Bartlett, TN 38134', phone: '(901) 555-0100' } });
const heads = P.sections.map(s => s.h).join(' | '), txt = JSON.stringify(P);
['Job', 'Scope of work and tasks', 'Expected exposure and basis', 'Engineering controls', 'Work-practice controls', 'Respiratory protection', 'Protective clothing and equipment', 'Hygiene facilities and decon unit', 'Housekeeping', 'Exposure monitoring schedule', 'Medical surveillance and medical removal', 'Training and certifications', 'Signs and labels', 'Competent person / supervisor on site', 'Inspection schedule', 'Record keeping', 'Emergency contacts', 'Written programs']
  .forEach(h => ok(heads.indexOf(h) >= 0, 'plan part: ' + h));
ok(/Sam Sup/.test(txt) && /Demo Lead Admin/.test(txt) && /kept forever/.test(txt) && /911/.test(txt) && /up to 18 months/.test(txt) && /confirm with your state program/i.test(P.note), 'the plan names the competent person, the program administrator, records forever, 911, removal protection, the "confirm" label');
ok(/Decon unit/.test(txt) && /NOT SET UP YET/.test(txt) && /Lead work area — DANGER/.test(txt), 'the plan carries the decon unit and the job\'s signs');
ok(!/\d+\s*µg\/dL/.test(JSON.stringify(P.sections.find(s => /Medical/.test(s.h)).rows)), 'medical status only — no result on the plan');
const rec = { id: 'e1', kind: 'epp', v: 1, fp: P.fp, date: C.today(), plan: P, signed: {} };
let L2 = Object.assign({}, lead, { envLog: [rec] });
ok(C.evaluate(L2, ctx).plan.st === 'unsigned', 'generated, not signed → still ⚠');
rec.signed = { cp: { name: 'Sam Sup', at: new Date().toISOString() } };
ok(C.evaluate(L2, ctx).plan.st === 'unsigned' && /owner/.test(C.evaluate(L2, ctx).plan.note), 'the owner\'s signature is needed too');
rec.signed.owner = { name: 'Demo Owner', at: new Date().toISOString() };
ok(C.evaluate(L2, ctx).items.find(x => x.id === 'epp').st === 'ok', 'signed by the competent person and the owner → ✅');
const L3 = Object.assign({}, L2, { abatementSupervisor: 'Other Sup' });
ok(C.evaluate(L3, ctx).plan.st === 'stale', 'the job changed (another supervisor) → a new version is asked for');
const AP = C.buildPlan(subbed, Object.assign({}, ctx, { E: E2 }), { v: 1 }), at = JSON.stringify(AP);
ok(/Demo Abatement LLC/.test(at) && /TN-A-123/.test(at) && /Ann Demo/.test(at) && /TDEC-555/.test(at) && /by the subcontractor/.test(at) && /STOP WORK/.test(at) && /awareness/i.test(at), 'asbestos plan: the sub (company, license, competent person, notice confirmation, its air monitoring) and the crew\'s awareness duties');
ok(C.planLines(P).length > 60 && C.planLines(P)[0].h === P.title, 'the plan flattens to lines for the PDF');

console.log('4 · the lead decon unit (owner: "Set up decon unit for lead.")');
let dI = EL.items.find(x => x.id === 'decon');
ok(dI && dI.st === 'due' && /confirm with your state program/i.test(dI.note), 'lead abatement: ⚠ until the decon set-up checklist is done (labelled "confirm")');
const all = {}; C.DEFAULT_RULES.decon.setup.forEach((x, i) => { all[i] = true; });
const dNoPh = Object.assign({}, lead, { envLog: [{ id: 'd1', kind: 'decon', at: '2026-11-17T10:00:00Z', date: C.today(), type: 'Portable decon trailer', location: 'driveway', setBy: 'Sam Sup', checks: all, photos: [] }] });
ok(C.evaluate(dNoPh, ctx).items.find(x => x.id === 'decon').st === 'due', 'the checklist done but no photo → still ⚠');
dNoPh.envLog[0].photos = [{ ref: 'r1', name: 'decon.jpg' }];
ok(C.evaluate(dNoPh, ctx).items.find(x => x.id === 'decon').st === 'ok', 'checklist + photo → ✅');
ok(C.evaluate(lead, Object.assign({}, ctx, { rules: C.rules({ settings: { deconBlock: true } }) })).items.find(x => x.id === 'decon').st === 'block', 'configurable to ⛔');
const rrp = { id: 'J4', name: 'RRP', type: 'Lead RRP renovation', status: 'active', companyId: 'construction' };
ok(!C.evaluate(rrp, ctx).items.some(x => x.id === 'decon') && C.evaluate(Object.assign({}, rrp, { envComp: { decon: { required: true } } }), ctx).items.some(x => x.id === 'decon'), 'RRP: no decon by default; required per job when set');
const df = C.dailyFields(lead, ['lead_abate'], ctx.rules).map(f => f.key), dm = C.dailyFields({ id: 'm' }, ['mold'], ctx.rules).map(f => f.key);
ok(['deconOk', 'deconWater', 'deconPhotos', 'signs', 'signPhotos'].every(k => df.includes(k)) && !dm.includes('deconOk') && dm.includes('signPhotos'), 'the daily log: decon checked / wash water / photo on lead abatement; signs posted + photo everywhere');
const PL = C.DECON_PURCHASE;
ok(PL.length >= 15 && PL.every(x => x.item && x.qty && !/\$/.test(JSON.stringify(x))), 'the purchase list (no invented prices)');

console.log('5 · the sign set (owner: "Make sure all signs for env work are designed for GrayCo.")');
const SW = docText('GrayCo_Lead_Asbestos_Warning_Signs.docx').split('\n').map(s => s.trim());
C.SIGNS.filter(g => g.required).forEach(g => {
  const inDoc = g.lines.filter(l => !/^Material: _+$/.test(l)).every(l => SW.includes(l));
  ok(inDoc, 'required legend unchanged from the GrayCo warning signs: ' + g.id, g.lines.filter(l => !SW.includes(l)));
});
const env = { legal: 'GrayCo Environmental, LLC', phone: '(901) 555-0177', logo: '/img/grayco-environmental-logo.jpg' }, con = { legal: 'GrayCo Construction Services, LLC', phone: '(901) 585-0944', logo: '/portal-logo.png' };
C.SIGNS.forEach(g => {
  const B = C.signBlocks(g, { size: 'shop', bilingual: true, brand: env, fallback: con }), leg = B.blocks.filter(x => x.kind === 'legend').map(x => x.text), br = B.blocks.find(x => x.kind === 'brand');
  ok(JSON.stringify(leg) === JSON.stringify(g.lines) && br && br.text === 'GrayCo Environmental, LLC  |  (901) 555-0177' && br.logo === env.logo && B.blocks[0].text === g.head && B.blocks[B.blocks.length - 1] === br, 'sign ' + g.id + ': legend exactly as written, branding in its own bottom band');
});
const b0 = C.signBlocks(C.SIGNS[0], { size: 'letter', brand: { legal: 'GrayCo Environmental, LLC' }, fallback: con }), b1 = C.signBlocks(C.SIGNS[0], { size: 'shop', bilingual: true, brand: env });
ok(b0.blocks.find(x => x.kind === 'brand').text === 'GrayCo Environmental, LLC  |  (901) 585-0944' && b0.blocks.find(x => x.kind === 'brand').logo === '/portal-logo.png', 'no Environmental phone / logo set → GrayCo Construction\'s (fallback)');
ok(b1.blocks[1].size > b0.blocks[1].size * 2 && b1.w === 18 && b1.h === 24 && !b0.blocks.some(x => x.kind === 'es') && b1.blocks.some(x => x.kind === 'es'), 'sizes letter / 18 × 24 scale the text; Spanish only when bilingual');
const ids = C.SIGNS.map(g => g.id);
['lead_warning', 'rrp', 'asb_danger', 'mold', 'bio', 'decon_dirty', 'decon_wash', 'decon_clean', 'resp', 'negair', 'lead_waste', 'asb_waste', 'handwash', 'noeat'].forEach(id => ok(ids.includes(id), 'sign in the set: ' + id));
ok(C.jobSigns(lead, ['lead_abate'], ctx.rules).some(g => g.id === 'decon_dirty') && !C.jobSigns(asb, ['asbestos'], ctx.rules).some(g => /^lead/.test(g.id)) && C.jobSigns({ id: 'm' }, ['mold'], ctx.rules).some(g => g.id === 'mold'), 'each job links its own signs (by kind; the decon signs where the decon applies)');
ok(/verify the legend/i.test(C.SIGN_NOTE), 'the note: verify the legend with the current OSHA / state rules');

console.log('6 · the Word programs: new versions added, the originals kept');
const orig = ['GrayCo_Lead_Safety_Program.docx', 'GrayCo_Respiratory_Protection_Program.docx', 'GrayCo_Asbestos_Awareness_and_Control_Program.docx', 'GrayCo_Lead_06_Supply_and_Equipment_Checklist.docx'];
ok(orig.every(f => fs.existsSync(path.join(DIR, f)) && /4007 Broadway/.test(docText(f))), 'the earlier versions are still there, unchanged');
const addr = (fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8').match(/var DEF = \{ current: '([^']+)'/) || [])[1];
const LV = docText('GrayCo_Lead_Safety_Program_v2.docx');
ok(addr && LV.includes(addr) && !/4007 Broadway/.test(LV), 'Lead Safety Program v2: the current address from the company setting (' + addr + ')');
['6. ENGINEERING CONTROLS', '7. HOUSEKEEPING', '8. RESPIRATORY PROTECTION', '9. PROTECTIVE CLOTHING AND EQUIPMENT', '10.1 DECON UNIT (LEAD)', '11. MEDICAL SURVEILLANCE', '12. MEDICAL REMOVAL PROTECTION', '13. TRAINING', '15. PER-JOB EMPLOYEE PROTECTION PLAN', 'NEGATIVE INITIAL DETERMINATION', 'BLOOD LEAD AND ZPP TRACKING', 'LEAD TRAINING RECORD'].forEach(h => ok(LV.includes(h), 'Lead v2 has: ' + h));
ok(/earnings, seniority and all other employment rights and benefits/.test(LV) && /up to 18 months/.test(LV) && /confirm every number and step with your attorney \/ state program/i.test(LV) && /no dry sweeping/i.test(LV) && /no compressed air/i.test(LV) && /no cost/.test(LV) && /never dumped on the ground/.test(LV), 'medical removal protection, housekeeping, clothing at no cost, wash water — labelled to confirm');
ok(/Program administrator: \t\tPhone: /.test(LV.replace(/\n/g, '')) || /Program administrator: /.test(LV), 'the administrator / approval blanks stay (the CRM fills them)');
const RV = docText('GrayCo_Respiratory_Protection_Program_v2.docx');
ok(RV.includes(addr) && /Licensed abatement subcontractor/.test(RV) && /GrayCo Asbestos Program/.test(RV) && !/GrayCo employees do not perform asbestos work/.test(RV) && /Program administrator: /.test(RV) && /APPENDIX D/.test(RV), 'Respiratory v2: address, the asbestos line by who does the work, the blanks, Appendix D kept');
const AV = docText('GrayCo_Asbestos_Program.docx');
ok(/NOT IN USE/.test(AV) && ['COMPETENT PERSON', 'REGULATED AREAS', 'EXPOSURE ASSESSMENT AND MONITORING', 'METHODS OF COMPLIANCE BY WORK CLASS', 'RESPIRATORY PROTECTION', 'PROTECTIVE CLOTHING', 'HYGIENE AND DECONTAMINATION', 'MEDICAL SURVEILLANCE', 'TRAINING', 'SIGNS AND LABELS', 'RECORD KEEPING', 'MULTI-EMPLOYER COORDINATION', 'STATE LICENSING AND NOTIFICATION CHECKLIST (TN · AR · MS)'].every(h => AV.includes(h)) && AV.includes(addr), 'the GrayCo Asbestos Program: every part, marked NOT IN USE', AV.slice(0, 300));
ok(/Tennessee \(TDEC\)/.test(AV) && /confirm/.test(AV) && /kept permanently/.test(AV), 'the state checklist is labelled to confirm; records forever');
ok(/When this program applies/.test(docText('GrayCo_Asbestos_Awareness_and_Control_Program_v2.docx')) && /DECON UNIT/.test(docText('GrayCo_Lead_06_Supply_and_Equipment_Checklist_v2.docx')), 'awareness v2 says when it applies; Lead 06 v2 has the decon unit parts');
ok(fs.statSync(path.join(DIR, 'GrayCo_Lead_Decon_Unit_Setup_Checklist.pdf')).size > 2000 && /LEAD DECON UNIT SET-UP CHECKLIST/.test(docText('GrayCo_Lead_Decon_Unit_Setup_Checklist.docx')) && /PURCHASE LIST/.test(docText('GrayCo_Lead_Decon_Unit_Purchase_List.docx')), 'the decon set-up checklist (Word + PDF with the layout) and the purchase list');

console.log('7 · a filled copy of a Word program');
const xml = unzip(path.join(DIR, 'GrayCo_Respiratory_Protection_Program_v2.docx'))['word/document.xml'];
const fx = C.fillDocxXml(xml, { admin: 'Demo Lead Admin', phone: '(901) 555-0102', approvedBy: 'Demo Owner', approvedOn: '11/17/2026', address: '9 New Demo Way, Bartlett, TN 38134' });
const ft = fx.replace(/<[^>]+>/g, '');
ok(/Program administrator: Demo Lead Admin/.test(ft) && /Phone: \(901\) 555-0102/.test(ft) && /Approved by \(owner\): Demo Owner/.test(ft) && /Date: 11\/17\/2026/.test(ft) && /9 New Demo Way, Bartlett, TN 38134  \|  \(901\) 585-0944/.test(ft), 'administrator, phone, approval and the current address filled in');
ok((fx.match(/<w:p[ >]/g) || []).length === (xml.match(/<w:p[ >]/g) || []).length && /Program administrator: runs this program/.test(ft), 'nothing else changes (same paragraphs; the responsibilities text untouched)');
ok(C.fillDocxXml(xml, {}) === xml, 'nothing to fill → the file is unchanged');

console.log('8 · TCLP waste characterization (owner: "TCLP")');
ok(C.tclpThreshold(ctx.rules) === 5 && /confirm with EPA/i.test(C.DEFAULT_RULES.settings.tclpNote) && C.tclpThreshold(C.rules({ settings: { tclpLead: 4.5 } })) === 4.5, 'the threshold is a setting (default 5.0 mg/L lead, labelled "confirm with EPA / state")');
ok(C.tclpClass('5.0', 5) === 'hazardous' && C.tclpClass('7.2', 5) === 'hazardous' && C.tclpClass('4.99', 5) === 'non-hazardous' && C.tclpClass('<0.5', 5) === 'non-hazardous' && C.tclpClass('ND', 5) === 'non-hazardous' && C.tclpClass('', 5) === 'pending' && C.tclpClass('waiting', 5) === 'pending', 'result ≥ threshold → hazardous; below / non-detect → non-hazardous; blank → pending');
let WJ = Object.assign({}, lead, { envLog: [] });
ok(C.evaluate(WJ, ctx).items.some(x => x.id === 'waste-none' && x.st === 'due'), 'a lead abatement job without a waste stream → ⚠ add and characterize them');
WJ.envLog = [{ id: 'cd1', kind: 'compday', date: C.today(), rows: { waste: [{ stream: 'Lead paint chips / debris', bags: '6' }] } }];
let wi = C.evaluate(WJ, ctx).items.find(x => x.id === 'waste:lead paint chips / debris');
ok(wi && wi.st === 'due' && /not yet characterized/.test(wi.label), 'the daily log\'s waste row names the stream → ⚠ "not yet characterized"', wi);
ok(!C.canDispose(WJ, 'Lead paint chips / debris', ctx.rules), 'it cannot be disposed of yet');
WJ.envLog.push({ id: 'cd2', kind: 'compday', date: C.today(), rows: { waste: [{ stream: 'Lead paint chips / debris', bags: '2', manifest: 'MAN-1' }] } });
wi = C.evaluate(WJ, ctx).items.find(x => x.id === 'waste:lead paint chips / debris');
ok(wi.st === 'block' && /WITHOUT CHARACTERIZATION/.test(wi.note), 'shipped (a manifest # in the daily log) without characterization → ⛔');
ok(C.evaluate(WJ, Object.assign({}, ctx, { rules: C.rules({ settings: { wasteShipBlock: false } }) })).items.find(x => x.id === 'waste:lead paint chips / debris').st === 'due', 'configurable to ⚠');
WJ.envLog.push({ id: 't1', kind: 'tclp', stream: 'Lead paint chips / debris', date: C.today(), sampler: 'Sam Sup', containers: 'B-01..B-08', lab: 'Demo Lab', coc: 'COC-42', analyte: 'lead', result: '12.3', threshold: 5, cls: C.tclpClass('12.3', 5), file: { ref: 'r', name: 'lab.pdf' } });
wi = C.evaluate(WJ, ctx).items.find(x => x.id === 'waste:lead paint chips / debris');
ok(/HAZARDOUS/.test(wi.label) && /12\.3 mg\/L lead vs 5/.test(wi.note) && /COC-42/.test(wi.note) && /manifest, hauler, TSD facility, generator status/.test(wi.note) && C.canDispose(WJ, 'lead paint chips / debris', ctx.rules), 'TCLP 12.3 mg/L → HAZARDOUS → the hazardous path (manifest, hauler, TSD, generator status); now it may be shipped');
WJ.envLog.push({ id: 's1', kind: 'wship', stream: 'Lead paint chips / debris', cls: 'hazardous', date: C.today(), manifest: 'MAN-1', hauler: 'Demo Hauler' });
wi = C.evaluate(WJ, ctx).items.find(x => x.id === 'waste:lead paint chips / debris');
ok(wi.st === 'due' && /TSD facility, generator status/.test(wi.note), 'a hazardous shipment missing the TSD facility and generator status → ⚠');
WJ.envLog[WJ.envLog.length - 1] = Object.assign({}, WJ.envLog[WJ.envLog.length - 1], { tsd: 'Demo TSD', generatorStatus: 'SQG' });
ok(C.evaluate(WJ, ctx).items.find(x => x.id === 'waste:lead paint chips / debris').st === 'ok', 'complete hazardous papers → ✅');
WJ.envLog.push({ id: 'g1', kind: 'wgk', stream: 'Lead paint chips / debris', date: C.addDays(C.today(), 1), cls: 'non-hazardous', basis: 'looks fine' });
ok(/HAZARDOUS/.test(C.evaluate(WJ, ctx).items.find(x => x.id === 'waste:lead paint chips / debris').label), 'generator knowledge never overrides a hazardous TCLP result');
WJ.envLog.push({ id: 'g2', kind: 'wgk', stream: 'Plastic sheeting / PPE / filters', date: C.today(), cls: 'non-hazardous', basis: 'TCLP of the same sheeting on this job 10/2026: 0.3 mg/L' }, { id: 's2', kind: 'wship', stream: 'Plastic sheeting / PPE / filters', cls: 'non-hazardous', date: C.today(), landfill: 'Demo Landfill' });
let w2 = C.evaluate(WJ, ctx).items.find(x => x.id === 'waste:plastic sheeting / ppe / filters');
ok(/NON-HAZARDOUS/.test(w2.label) && /generator knowledge: TCLP of the same sheeting/.test(w2.note) && w2.st === 'due' && /landfill acceptance letter/.test(w2.note), 'generator knowledge with its basis → non-hazardous → the landfill acceptance letter is needed');
WJ.envLog[WJ.envLog.length - 1].acceptanceOn = C.today();
ok(C.evaluate(WJ, ctx).items.find(x => x.id === 'waste:plastic sheeting / ppe / filters').st === 'ok', 'with the acceptance letter → ✅');
const WP = JSON.stringify(C.buildPlan(WJ, ctx, { v: 1 }));
ok(/Waste characterization \(TCLP\) and disposal/.test(WP) && /Lead paint chips \/ debris/.test(WP) && /HAZARDOUS — TCLP 12.3 mg\/L lead \(threshold 5\)/.test(WP) && /TCLP threshold used: 5 mg\/L/.test(WP), 'the plan\'s waste section: each stream, its classification and disposal path, the threshold');
ok(['tclp', 'wgk', 'wship'].every(k => C.recCat({ kind: k }, ['lead_abate']) === 'project') && C.retainYears(ctx.rules, 'project') === Infinity, 'TCLP samples, generator knowledge and shipments are project records — kept forever');
const daily = C.DEFAULT_RULES.daily.find(f => f.key === 'waste');
ok(/stream\|Waste stream/.test(daily.cols), 'the daily log\'s waste rows carry the waste stream');

console.log('9 · training and certification by role — read from the certification tracking, never stored here');
const TR = P.sections.find(x => /Training and certifications \(by role\)/.test(x.h));
ok(TR && TR.rows.some(r => /^Company \(GrayCo\) — /.test(r[0])) && TR.rows.some(r => /^Supervisor \/ competent person — /.test(r[0]) && /supervisor/i.test(r[1])) && TR.rows.some(r => /^Each worker — /.test(r[0]) || /^Everyone on the job — /.test(r[0])) && /does not store certificates/.test(TR.text.join(' ')), 'the plan lists what each role needs and points to 📜 Certifications', TR);
ok(/Training and certification by role/.test(LV) && /does not store them/.test(LV) && /By role: the company/.test(AV) && /Who needs what/.test(RV), 'the Lead, Asbestos and Respiratory programs list the training / certification by role and link to the CRM tracking');
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
