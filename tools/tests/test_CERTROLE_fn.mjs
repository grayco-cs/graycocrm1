// test_CERTROLE_fn.mjs <build-dir> — node only (no browser): patch CERTROLE's rules, run on the gc-patch-certplan module from index.html
// with a tiny fake page. Made-up people only.
import fs from 'fs'; import path from 'path'; import vm from 'vm';
const BUILD = path.resolve(process.argv[2] || '.');
const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
const i = html.indexOf('<script id="gc-patch-certplan">'), src = html.slice(html.indexOf('>', i) + 1, html.indexOf('</script>', i));
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); } };
const dlg = { innerHTML: '' };
const el = () => ({ setAttribute(){}, style: {}, remove(){}, addEventListener(){}, querySelector(s){ return s === '.gccp-dlg' ? dlg : null; }, querySelectorAll(){ return []; } });
const W = { console, setTimeout, Promise, Date, Math, JSON, RegExp, String, Number, Array, Object, isFinite, parseFloat };
W.window = W; W.document = { getElementById(){ return null; }, addEventListener(){}, createElement: el, head: { appendChild(){} }, body: { appendChild(){} } };
W.localStorage = { getItem(){ return null; }, setItem(){} };
W.__GC_AUTH__ = { isAdmin: () => true }; W._ehSb = async () => null; W._supaUpsertNow = async () => true;
const U = [['Tia', 'Mitigation Tech'], ['Dex', 'Restoration & Abatement Tech'], ['Ina', 'Insurance PM'], ['Ross', 'Project Manager', 'Roofing'], ['Gary', 'Estimator'], ['Lou', 'General Laborer'], ['Cora', 'Contents & Cleaning Tech'], ['Ecl', 'Environmental Cleaning Tech'], ['Eli', 'Abatement Technician'], ['Max', 'Mitigation Manager']]
  .map(([n, r, pr]) => ({ name: n + ' Demo', email: n.toLowerCase() + '@example.com', role: r, profile: pr || '', active: true }));
W._crm = { users: U, projects: [{ id: 'J1', name: 'Demo tile job', scope: 'asbestos floor tile', status: 'active' }, { id: 'J2', name: 'Demo basement', type: 'Water Damage', status: 'active' }] };
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
const tabs = ['people', 'raises', 'reqs', 'amounts', 'outlook', 'jobs', 'bonus', 'pay'], bad = [];
for (const tb of tabs) { C.open(tb); await new Promise(r => setTimeout(r, 30)); const h = dlg.innerHTML.replace(/data-[a-z-]+="[^"]*"/g, ''); if (!h || /undefined|NaN/.test(h)) bad.push(tb + ':' + ((h.match(/.{40}(undefined|NaN).{20}/) || [''])[0])); }
ok(!bad.length, 'every tab draws (no "undefined" / "NaN")', bad);
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
