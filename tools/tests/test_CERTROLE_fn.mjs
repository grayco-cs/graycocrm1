// test_CERTROLE_fn.mjs <build-dir> — node only (no browser): patch CERTROLE's rules, run on the gc-patch-certplan module from index.html
// with a tiny fake page. Made-up people only.
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const BUILD = path.resolve(process.argv[2] || '.');
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const i = html.indexOf('<script id="gc-patch-certplan">'), src = html.slice(html.indexOf('>', i) + 1, html.indexOf('</script>', i));
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); } };
const dlg = { innerHTML: '' };
const el = () => ({ setAttribute(){}, style: {}, remove(){}, addEventListener(){}, querySelector(s){ return s === '.gccp-dlg' ? dlg : null; }, querySelectorAll(){ return []; } });
const W = { console, setTimeout, setInterval: () => 0, Promise, Date, Math, JSON, RegExp, String, Number, Array, Object, isFinite, parseFloat };
W.window = W; W.document = { getElementById(){ return null; }, addEventListener(){}, createElement: el, head: { appendChild(){} }, body: { appendChild(){} } };
W.localStorage = { getItem(){ return null; }, setItem(){} };
W.__GC_AUTH__ = { isAdmin: () => true }; W._ehSb = async () => null; W._supaUpsertNow = async () => true;
const U = [['Tia', 'Mitigation Tech'], ['Dex', 'Restoration & Abatement Tech'], ['Ina', 'Insurance PM'], ['Ross', 'Project Manager', 'Roofing'], ['Gary', 'Estimator'], ['Lou', 'General Laborer'], ['Cora', 'Contents & Cleaning Tech'], ['Ecl', 'Environmental Cleaning Tech'], ['Eli', 'Abatement Technician'], ['Max', 'Mitigation Manager']]
  .map(([n, r, pr]) => ({ name: n + ' Demo', email: n.toLowerCase() + '@example.com', role: r, profile: pr || '', active: true }));
W._crm = { users: U, projects: [{ id: 'J1', name: 'Demo tile job', scope: 'asbestos floor tile', status: 'active' }, { id: 'J2', name: 'Demo basement', type: 'Water Damage', status: 'active', companyId: 'mitigation' }, { id: 'J3', name: 'Demo roof leak', type: 'Roofing', status: 'active' }] };
W._gcCo = { ofJob: x => x.companyId || 'construction', userIn: () => true };
W._gcTrain = { required: rk => [{ id: 'b:start', title: 'Start here', parts: [{ id: 'a' }] }, { id: 'b:' + rk, title: rk + ' course', parts: [{ id: 'q', quiz: [1] }] }], modules: () => [{ id: 'b:resto-water', title: 'GrayCo Water', parts: [{ id: 'q', quiz: [1] }] }] };
vm.createContext(W); vm.runInContext(src, W);
const C = W._gcCertPlan, Q = W._gcCertQual, by = n => U.find(u => u.name === n + ' Demo');
const cert = (who, name, issuer) => ({ holderType: 'person', holder: who.toLowerCase() + '@example.com', name, issuer: issuer || '' });
C._set(null, [cert('Tia', 'IICRC WRT', 'IICRC'), cert('Tia', 'IICRC ASD', 'IICRC'), cert('Tia', 'IICRC AMRT', 'IICRC'), cert('Tia', 'IICRC FSRT', 'IICRC'), cert('Tia', 'IICRC OCT', 'IICRC'), cert('Tia', 'IICRC CCT', 'IICRC'), cert('Tia', 'IICRC UFT', 'IICRC'), cert('Tia', 'OSHA 30 (construction)'), cert('Tia', 'IICRC Master Restorer', 'IICRC'),
  cert('Dex', 'IICRC WRT', 'IICRC'), cert('Dex', 'IICRC AMRT', 'IICRC'), cert('Dex', 'Lead abatement worker'), cert('Dex', 'Asbestos abatement worker'), cert('Dex', 'HAZWOPER 40-hour'),
  cert('Ina', 'IICRC WRT', 'IICRC'), cert('Ross', 'IICRC UFT', 'IICRC'), cert('Gary', 'OSHA 30 (construction)'), cert('Lou', 'EPA RRP Certified Renovator'), cert('Cora', 'IICRC CCT', 'IICRC'), cert('Cora', 'IICRC Master Textile Cleaner', 'IICRC'), cert('Eli', 'Asbestos abatement worker')]);
const p = C.plan(), rc = n => C.raiseCalc(by(n), p), tk = n => C.trackOf(by(n), p);

ok(['Tia', 'Dex', 'Ina', 'Ross', 'Gary', 'Lou', 'Cora', 'Ecl', 'Eli', 'Max'].map(tk).join() === 'mit_tech,dual_tech,con_ins_pm,con_roof_pm,est_com,gen_lab,cont_tech,env_clean,env_tech,mit_manager', 'tracks from the role / profile (Roofing PM, Insurance PM, Estimator, dual, laborer, contents & cleaning, environmental cleaning)', ['Tia', 'Dex', 'Ina', 'Ross', 'Gary', 'Lou', 'Cora', 'Ecl', 'Eli', 'Max'].map(tk));
const st = p.tracks.con_roof_pm.reqs.map(r => C.reqStatus(r, [], '2000-01-01').k);
ok(!st.some(k => /overdue|soon|due|nohire/.test(k)) && p.tracks.con_roof_pm.reqs.filter(r => ['wrt', 'asd', 'uft'].includes(r.id)).every(r => r.rec), 'no deadlines; IICRC set recommended for the Roofing PM', st);
ok(p.tracks.con_ins_pm.reqs.filter(r => ['wrt', 'asd', 'amrt', 'fsrt', 'oct', 'cct', 'uft', 'mr'].includes(r.id)).every(r => !r.rec), 'Insurance PM: the IICRC set + Master Restorer required');
const tia = rc('Tia');
ok(tia.due.reduce((a, x) => a + x.hr, 0) === 8 && tia.reached && tia.blocked.some(x => x.why === 'notpm'), 'tech cap +$8 reached; Master Restorer $0 on a tech track', tia.due.map(x => x.rule + '=' + x.hr));
ok(/Promotion eligible — PM/.test(C.masterOf(by('Tia'), p).l), '⭐ a tech with Master Restorer is PM eligible');
ok(['Ina', 'Ross', 'Max'].every(n => rc(n).due.length === 0 && rc(n).commission), 'PM tracks (Insurance, Roofing, Mitigation manager) are commission-paid: no certificate raises');
ok(rc('Gary').due.map(x => x.amount).join() === '4160', 'Estimator: a recommended OSHA 30 earns $2 × 2,080');
const dex = rc('Dex');
ok(dex.due.reduce((a, x) => a + x.hr, 0) === 11 && dex.due.some(x => x.rule === 'xtrain'), 'dual tech: $1 × 4 + HAZWOPER 40 $5 + cross-training bonus $2 = $11 (cap $12)', dex.due.map(x => x.rule));
ok(rc('Lou').due.length === 0 && rc('Lou').blocked.every(x => x.why === 'laborer'), 'laborer: certificates recorded, no raises before tech status');
const cora = rc('Cora');
ok(cora.due.map(x => x.rule).join() === 'iicrc:iicrc-cct' && /Contents & Cleaning Manager/.test(C.masterOf(by('Cora'), p).l) && C.outlookOf('cont_tech', p).start === 18 && C.outlookOf('cont_tech', p).cap.hr === 8 && p.tracks.cont_mgr.future, 'contents & cleaning tech: $18, cap +$8, CCT $1, Master Textile Cleaner → manager eligible; manager is a future role');
ok(C.outlookOf('env_clean', p).start === 23 && C.outlookOf('env_clean', p).cap.hr === 10 && ['bbp', 'hazcom', 'resp', 'rrp', 'amrt', 'hazwoper', 'hazref', 'trauma', 'asbwork'].every(id => p.tracks.env_clean.reqs.some(r => r.id === id && !r.rec)) && ['osha10', 'oct'].every(id => p.tracks.env_clean.reqs.some(r => r.id === id && r.rec)), 'environmental cleaning tech: $23, cap +$10, its required set, OSHA 10 / OCT recommended');
ok(C.outlookOf('gen_lab', p).start === 15 && C.outlookOf('mit_tech', p).start === 18 && C.outlookOf('env_tech', p).start === 23 && C.outlookOf('dual_tech', p).start === 23, 'starting rates: laborer $15, tech $18, environmental $23, dual $23');
ok(Q.of(by('Eli')).can.some(x => x.k === 'asbestos') && Q.check(by('Tia'), W._crm.projects[0]).label === '⚠ missing asbestos worker' && Q.check(by('Tia'), W._crm.projects[0]).law && Q.forJob(W._crm.projects[0]).slice(0, 2).map(x => x.u.name).sort().join() === 'Dex Demo,Eli Demo' && Q.forJob(W._crm.projects[0]).slice(2).every(x => !x.c.ok), 'certificates unlock job types: Dex and Eli (asbestos worker) ✓ first on the tile job; Tia ⚠ missing asbestos worker (LAW)');
ok(C.trainOf('ina@example.com', 'wrt').k === 'not' && C.CLASS.wrt[0] === 'b:resto-water', 'class gate: WRT needs the GrayCo Water course first (not started)');
const tp = C.trainPlan(by('Lou'), p);
ok(tp.cur.length === 2 && tp.next.length === 2 && !tp.cur.some(m => tp.next.includes(m)) && tp.week.title === 'Start here', 'training plan: laborer current-job (paid) vs next-role (unpaid) courses, this week\'s paid course');
/* the job block: not qualified → blocked; an admin's exception for that person + job (reason) lifts it until the job closes; others ask */
const J1 = W._crm.projects[0], tiaU = by('Tia'), eliU = by('Eli');
ok(Q.block(tiaU, J1) && Q.block(tiaU, J1).missing.join() === 'asbestos worker' && !Q.block(eliU, J1), 'BLOCK: Tia (no asbestos worker) is blocked from the asbestos job; Eli is not');
J1.mitTech = 'Tia Demo';
ok(Q.crewIssues(J1).map(x => x.u.name).join() === 'Tia Demo', 'BLOCK: a job lists "⚠ Tia Demo is on this job without asbestos worker"');
const okNo = await Q.allow(tiaU, J1, '');
const okYes = await Q.allow(tiaU, J1, 'Demo: supervised removal, licensed worker on site');
ok(!okNo && okYes && !Q.block(tiaU, J1) && !Q.crewIssues(J1).length && C.plan().excLog.some(x => x.kind === 'job' && x.reason.startsWith('Demo')), 'EXCEPTION: an admin\'s exception needs a reason, is logged and lifts the block for that job');
J1.status = 'Completed';
ok(!Q.exception(tiaU, J1), 'EXCEPTION: it ends when the job closes'); J1.status = 'active';
W.__GC_AUTH__.isAdmin = () => false;
const asked = await Q.confirmAssign(by('Cora'), J1);
ok(asked === false && C.plan().allowReq.some(r => r.email === 'cora@example.com' && r.status === 'open'), 'non-admin: blocked, "Ask an admin to allow" request created');
W.__GC_AUTH__.isAdmin = () => true;
/* the job-save guard (every path that saves a job through _setProjects: job page, Quick Add edits, field assignment) */
let STATE = W._crm.projects.map(x => Object.assign({}, x)); W._crm.projects = STATE; W._setProjects = v => { STATE = typeof v === 'function' ? v(STATE) : v; W._crm.projects = STATE; };
Q._tick();   /* the baseline */
const put = (id, f, v) => { W._crm.projects = STATE = STATE.map(x => x.id === id ? Object.assign({}, x, { [f]: v }) : x); Q._tick(); };
put('J2', 'mitTech', 'Lou Demo'); const j2a = STATE.find(x => x.id === 'J2').mitTech;
put('J2', 'mitTech', 'Tia Demo'); const j2b = STATE.find(x => x.id === 'J2').mitTech;
put('J3', 'superintendent', 'Lou Demo'); const j3 = STATE.find(x => x.id === 'J3').superintendent;
ok(!j2a && j2b === 'Tia Demo' && j3 === 'Lou Demo', 'GUARD: putting Lou (no WRT) on the Mitigation water job is undone; Tia (WRT) stays; a Construction "roof leak" job is not blocked', { j2a, j2b, j3 });
/* the Schedule: ✓ / 🚫 / ⚠ per person × job × day (time off from window._gcTimeOff), and a 🚫 person dropped on a job's entry is taken off */
const TD = new Date().toISOString().slice(0, 10);
W._gcTimeOff = { isOff: (em, d) => em === 'tia@example.com' ? { off: true, kind: 'Sick', note: '' } : { off: false } };
let SCH = [{ id: 'S1', pid: 'J3', date: TD, title: 'Demo roof leak', crew: 'Eli Demo' }, { id: 'S2', pid: 'J2', date: TD, title: 'Demo dry-out', crew: '' }];
W._crm.schedule = SCH; W._setSchedule = v => { SCH = typeof v === 'function' ? v(SCH) : v; W._crm.schedule = SCH; };
const avLou = Q.avail(by('Lou'), STATE.find(x => x.id === 'J2'), TD), avTia = Q.avail(by('Tia'), STATE.find(x => x.id === 'J2'), TD), avEli = Q.avail(by('Eli'), STATE.find(x => x.id === 'J2'), TD);
ok(avLou.mark === '🚫' && /needs IICRC WRT/.test(avLou.reasons.join()) && avTia.mark === '⚠' && /Sick/.test(avTia.reasons.join()) && avEli.reasons.some(r => /double-booked: Demo roof leak/.test(r)), 'SCHEDULE: Lou 🚫 needs IICRC WRT; Tia ⚠ Sick (window._gcTimeOff); Eli ⚠ double-booked', { avLou, avTia, avEli });
Q._tick();
W._crm.schedule = SCH = SCH.map(x => x.id === 'S2' ? Object.assign({}, x, { crew: 'Lou Demo, Tia Demo' }) : x); Q._tick();
ok(SCH.find(x => x.id === 'S2').crew === 'Tia Demo', 'SCHEDULE: dropping Lou (🚫) on the dry-out entry is refused — he is taken off, Tia stays', SCH.find(x => x.id === 'S2'));
/* abrasive / blast cleaning: a job type of its own — respirator fit test + blasting equipment training + silica awareness */
const BJ = { id: 'J9', name: 'Demo attic soda blasting', scope: 'soda blast the attic framing', status: 'active', companyId: 'mitigation' };
const coraB = Q.check(by('Cora'), BJ), eclB = Q.check(by('Ecl'), BJ);
C._set(C.plan(), [cert('Ecl', 'Respirator fit test + medical evaluation'), cert('Ecl', 'Soda blasting equipment training'), cert('Ecl', 'Silica awareness (OSHA 1926.1153)')]);
const eclB2 = Q.check(by('Ecl'), BJ);
ok(!coraB.ok && coraB.law && /blast-cleaning equipment training/.test(coraB.missing.join()) && !eclB.ok && eclB2.ok && Q.of(by('Ecl')).can.some(x => x.k === 'blast'), 'BLAST: soda-blasting job needs respirator + blasting training + silica; Ecl with all three is ✓, Cora is not', { coraB, eclB2 });
C.open('people'); await new Promise(r => setTimeout(r, 30));
ok(/Cleaning materials:.*Dry-chem \(soot\) sponges/.test(dlg.innerHTML) && /Tools &amp; equipment:.*Soda and dry-ice blasters/.test(dlg.innerHTML) && W._gcTrain && C.CLASS.blasttrain[0] === 'b:prep-clean', 'cleaning roles: the materials and tools lists on the card; the blasting class needs the 🧽 cleaning CRM course first');
const tabs = ['people', 'raises', 'reqs', 'amounts', 'outlook', 'jobs', 'bonus', 'pay'], bad = [];
for (const tb of tabs) { C.open(tb); await new Promise(r => setTimeout(r, 30)); const h = dlg.innerHTML.replace(/data-[a-z-]+="[^"]*"/g, ''); if (!h || /undefined|NaN/.test(h)) bad.push(tb + ':' + ((h.match(/.{40}(undefined|NaN).{20}/) || [''])[0])); }
ok(!bad.length, 'every tab draws (no "undefined" / "NaN")', bad);
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
