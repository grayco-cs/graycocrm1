// test_TRAINING.mjs <build-dir> — owner 11/11: "iicrc s 700 needs to have important stuff for water fire etc in the crm in our own
// training documents as iicrc s700 training" + "talk about masking agents and pairing agents" (patch IICRCTRAIN). Offline harness, made-up data.
// TRAINING_SHOTS=<dir> → screenshots (1440×900): training_tab, training_doc_s700, training_mitigation_dashboard, training_library_pin.
import { computer, signIn, sleep, cset, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 400) : '')); };
const SHOT = process.env.TRAINING_SHOTS || '';
resetCloud();
const now = new Date().toISOString();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('projects', [{ id: 'J2', name: 'Demo Lee dry-out', client: 'Demo Lee', status: 'active', type: 'Mitigation', companyId: 'mitigation', contract: 6000, updatedAt: now },
  { id: 'J3', name: 'Demo Ross abatement', client: 'Demo Ross', status: 'active', type: 'Environmental', companyId: 'environmental', contract: 9000, updatedAt: now }]);
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const main = A.page(); const ev = (fn, arg) => main.evaluate(fn, arg);
const errs = []; A.ctx.on('page', pg => pg.on('pageerror', e => errs.push('POPUP ' + String(e.message).slice(0, 200)))); main.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
if (SHOT) await main.setViewportSize({ width: 1440, height: 900 });
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(8000);

/* 1. the four documents */
const docs = await ev(() => (window._gcIicrc ? window._gcIicrc.docs : []).map(d => {
  const h = window._gcIicrc.html(d.id), div = document.createElement('div'); div.innerHTML = h.replace(/^[\s\S]*?<body>/, '').replace(/<\/body>[\s\S]*$/, '');
  return { id: d.id, title: d.title, cos: d.cos, q: div.querySelectorAll('.iic-q').length, nq: d.quiz.length, sec: div.querySelectorAll('section h2').length,
    sign: /Employee signature/.test(h) && /Trainer signature/.test(h) && /Score \(of/.test(h), key: div.querySelectorAll('details.iic-key tbody tr').length,
    internal: /INTERNAL — GRAYCO STAFF TRAINING/.test(h), basis: /Based on the principles of ANSI\/IICRC S\d+|Bloodborne Pathogens Standard/.test(h), own: /our own words/.test(h),
    letter: /data-gc-logo/.test(h), ox: /Oxidizing agents/i.test(h) && /sodium perborate/i.test(h) && /hydroxyl/i.test(h) && /chlorine dioxide/i.test(h), tbl: div.querySelectorAll('table.iic-tbl tbody tr').length, mask: /masking agent/i.test(h) && /pairing agent/i.test(h), answers: d.quiz.map(q => q.a).join('') };
}));
ok('4 training documents: S700 fire & smoke, S500 water, S520 mold, biohazard & sewage', docs.length === 4 && /S700/.test(docs[0].title) && /S500/.test(docs[1].title) && /S520/.test(docs[2].title) && /Biohazard/.test(docs[3].title), docs.map(d => d.title));
ok('each: every quiz question printed (8–15), the sign-off (employee / trainer / score) and an answer key row per question', docs.every(d => d.q === d.nq && d.nq >= 8 && d.nq <= 15 && d.sign && d.key === d.nq), docs.map(d => [d.id, d.q, d.key, d.sign]));
ok('each: internal, names the standard it follows ("based on the principles of"), says it is our own words, GrayCo letterhead', docs.every(d => d.internal && d.basis && d.own && d.letter), docs.map(d => [d.id, d.internal, d.basis, d.own, d.letter]));
ok('S700 and S500 explain masking agents vs pairing agents', docs[0].mask && docs[1].mask, docs.map(d => d.mask));
ok('the right answers are spread over A–D (not all B)', docs.every(d => new Set(d.answers.split('')).size >= 3), docs.map(d => d.answers));
ok('S700: an "Oxidizing agents" section with perborate, chlorine, peroxide, chlorine dioxide, ozone, hydroxyl and a 6-row comparison table; S500 mentions them too', docs[0].ox && docs[0].tbl === 6 && docs[1].ox, docs.map(d => [d.id, d.ox, d.tbl]));
const oxQ = await ev(() => window._gcIicrc.get('s700').quiz.map(q => q.q).join(' | '));
ok('S700 quiz asks which oxidizer for fabrics (perborate) and which can run occupied (hydroxyl vs ozone)', /deodorizing washable fabrics/.test(oxQ) && /people and pets in the house/.test(oxQ), oxQ.slice(0, 200));
const fireSec = await ev(() => window._gcIicrc.get('s700').sections.map(s => s.title).join(' | '));
ok('S700 covers safety, job start, residue types, cleaning order, contents, structure, odor (masking vs pairing), HVAC, firefighting water, board-up, insurance docs, final walkthrough, what not to do',
  ['Safety', 'Starting the job', 'Board-up', 'smoke residue', 'cleaning order', 'Contents', 'structure', 'Odor control', 'masking agents vs pairing agents', 'HVAC', 'firefighting', 'insurance', 'Final walkthrough', 'never do'].every(w => fireSec.toLowerCase().includes(w.toLowerCase())), fireSec);
const never = await ev(() => window._gcIicrc.get('s700').sections.find(s => s.id === 'never').body);
ok('S700 "what we never do": never mix chemicals, no ozone with people/pets/plants, no wet-cleaning dry soot first, nothing thrown away without consent', /Never mix chemicals/.test(never) && /ozone with people, pets or plants/.test(never) && /wet-clean dry soot first/.test(never) && /without the customer's written consent/.test(never));

/* 2. 🎓 Training: a course per document, its test with an 80 % pass mark */
const tr = await ev(() => { const M = window._gcTrain.modules(); return ['s700', 's500', 's520', 'bio'].map(id => { const m = M.find(x => x.id === 'b:iicrc-' + id); return m && { t: m.title, cat: m.cat, req: m.required, parts: m.parts.length, quiz: (m.parts.find(p => p.quiz) || {}).quiz.length, print: /#gc-iicrc=/.test(m.parts[0].body) }; }); });
ok('🎓 Training lists all four as courses (parts, a link to the printable record, the test at the end); Fire & Water required for Insurance / Mitigation', tr.every(Boolean) && tr.every(m => m.print && m.quiz >= 8) && tr[0].req.includes('insurance') && tr[1].req.includes('insurance') && tr[0].cat === 'IICRC', tr);
const old = await ev(() => window._gcTrain.modules().filter(m => /^b:resto-/.test(m.id)).length);
ok('the existing Water / Fire / Odor courses are still there', old === 3, old);
await ev(() => window._gcTrain.open()); await sleep(2500);
await ev(() => { const b = document.querySelector('[data-trtab="train"]'); b && b.click(); }); await sleep(1500);
const trTxt = await ev(() => (document.getElementById('gc-doclib-box') || document.body).innerText);
ok('Forms & Docs → 🎓 Training shows the S700 / S500 / S520 courses', /Fire & Smoke Restoration Training \(IICRC S700 principles\)/.test(trTxt) && /S500 principles/.test(trTxt) && /S520 principles/.test(trTxt), trTxt.slice(0, 300));
if (SHOT) await main.screenshot({ path: SHOT + '/training_tab.png' });
/* take the S500 test with every answer right → passed, score saved */
const quiz = await ev(() => { const key = 'b:iicrc-s500|quiz', q = window._gcTrain.modules().find(m => m.id === 'b:iicrc-s500').parts.find(p => p.quiz).quiz;
  const box = document.createElement('div'); box.id = 'gc-test-host'; box.innerHTML = window.__GC_TRAIN_QUIZ__(key, q, false); document.body.appendChild(box);
  return { n: q.length, intro: box.innerText, a: q.map(x => x.a) }; });
ok('the S500 test asks for 80 % (10 of 12)', /You need 10 right to pass/.test(quiz.intro), quiz.intro.slice(0, 200));
await ev(() => document.querySelector('[data-gcq-start="b:iicrc-s500|quiz"]').click()); await sleep(300);
for (let i = 0; i < quiz.n; i++) { await ev(([i, j]) => document.querySelector('[data-gcq-pick="b:iicrc-s500|quiz"][data-i="' + i + '"][data-j="' + j + '"]').click(), [i, quiz.a[i]]); await sleep(60); }
await sleep(800);
const res = await ev(() => { const P = window._gcTrain._p && window._gcTrain._p(); return P && P.done && P.done['b:iicrc-s500|quiz']; });
ok('all right → "Passed", the score (12 of 12) saved on the test part', res && res.passed && res.score === quiz.n && res.of === quiz.n, res);
await ev(() => { const b = document.getElementById('gc-test-host'); b && b.remove(); });

/* 3. 📄 Documents: pinned card + library entries (internal, not client-facing) */
await ev(() => { const b = document.querySelector('[data-trtab="docs"]'); b && b.click(); }); await sleep(1500);
const pin = await ev(() => { const c = document.querySelector('[data-docid="iicrc_training"]'); return c ? { t: c.innerText, n: c.querySelectorAll('[data-iicrc-open]').length } : null; });
ok('📄 Documents: a pinned "🎓 IICRC & safety training" card with the four documents', pin && /IICRC & safety training/.test(pin.t) && pin.n === 4, pin);
const lib = await ev(async () => (await window._gcDocs3.list()).filter(e => /^fn:iicrc_/.test(e.uid)).map(e => ({ uid: e.uid, g: e.group, cf: e.clientFacing, t: e.title })));
ok('the document library lists them as Internal, not client-facing', lib.length === 4 && lib.every(e => e.g === 'Internal' && e.cf === false), lib);
if (SHOT) { await ev(() => { const c = document.querySelector('[data-docid="iicrc_training"]'); c && c.scrollIntoView({ block: 'center' }); }); await sleep(400); await main.screenshot({ path: SHOT + '/training_library_pin.png' }); }
const pop = A.ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null);
await ev(() => document.querySelector('[data-docid="iicrc_training"] [data-iicrc-open="s700"]').click());
const pg = await pop; await sleep(2000);
const pd = pg ? await pg.evaluate(() => ({ t: document.title, q: document.querySelectorAll('.iic-q').length, sign: /Trainer signature/.test(document.body.innerText), key: !!document.querySelector('details.iic-key'), keyOpen: !!(document.querySelector('details.iic-key') || {}).open, logo: !!document.querySelector('[data-gc-logo]') })) : null;
ok('tap 🔥 Fire & Smoke (S700) → the training record opens: quiz, sign-off, letterhead, the answer key closed', pd && /S700/.test(pd.t) && pd.q >= 8 && pd.sign && pd.key && !pd.keyOpen && pd.logo, pd);
if (pg) { if (SHOT) { await pg.setViewportSize({ width: 1440, height: 900 }); await pg.screenshot({ path: SHOT + '/training_doc_s700.png' }); } await pg.close(); }

/* 4. the Mitigation / Environmental Dashboard papers card */
await ev(() => window._gcCo.setFilter('mitigation')); await sleep(1500);
await ev(() => window._setView('dashboard')); await sleep(4000);
const mc = await ev(() => { const c = document.getElementById('gc-co-docs'); return c ? c.innerText : ''; });
ok('Mitigation Dashboard papers card: a Training row with S500 water, S700 fire & smoke and S520 mold', /Training/.test(mc) && /S500/.test(mc) && /S700/.test(mc) && /S520/.test(mc), mc.slice(-500));
if (SHOT) { await ev(() => { const c = document.querySelector('[data-iicrc-co-card]'); c && c.scrollIntoView({ block: 'center' }); }); await sleep(400); await main.screenshot({ path: SHOT + '/training_mitigation_dashboard.png' }); }
await ev(() => window._gcCo.setFilter('environmental')); await sleep(1500);
await ev(() => window._setView('dashboard')); await sleep(4000);
const ec = await ev(() => { const c = document.querySelector('#gc-co-docs [data-iicrc-co-card]'); return c ? c.innerText : ''; });
ok('Environmental Dashboard: S520 mold and biohazard & sewage training (no S700 / S500)', /S520/.test(ec) && /Biohazard/.test(ec) && !/S700/.test(ec) && !/S500/.test(ec), ec);

/* 5. 🧪 Materials & SDS: the training row; masking & pairing agents in the library */
await ev(() => window._gcCo.setFilter('mitigation')); await sleep(1500);
await ev(() => window._setView('sds')); await sleep(2500);
const sd = await ev(() => ({ chips: ((document.querySelector('.gcsds [data-iicrc-chips]') || {}).innerText || ''), mask: !!window._gcSds.byId('masking_agent'), pair: !!window._gcSds.byId('pairing_agent'),
  mg: (window._gcSds.byId('masking_agent') || {}).groups, ok2: ['masking_agent', 'pairing_agent'].every(id => { const m = window._gcSds.byId(id) || {}; return m.use && m.hazards && m.ppe && (m.dos || []).length && (m.donts || []).length && m.firstAid && m.cust; }) }));
ok('🧪 Materials & SDS: a "🎓 Training" row under the title (S500 / S700 / S520 for Mitigation)', /Training/.test(sd.chips) && /S700/.test(sd.chips) && /S500/.test(sd.chips), sd.chips);
ok('🧪 library has "Masking agent (fragrance deodorizer)" and "Pairing agent / odor counteractant" for fire / water / sewage / general, every field filled', sd.mask && sd.pair && ['fire', 'water', 'sewage', 'general'].every(g => (sd.mg || []).includes(g)) && sd.ok2, sd);
await ev(() => window._gcCo.setFilter('all')); await sleep(800);

const ox = await ev(() => { const g = id => window._gcSds.byId(id) || {}; const pb = g('sodium_perborate'); return { pb: !!pb.use && /fabric/i.test(pb.name) && /colorfast/i.test(pb.dos.join(' ')) && /Poison|poison/.test(pb.firstAid) && ['fire', 'water', 'sewage', 'general'].every(x => pb.groups.includes(x)),
  oxid: ['bleach_solution', 'h2o2_cleaner', 'chlorine_dioxide', 'ozone_generator', 'hydroxyl_generator'].map(id => [id, /oxidizer/i.test(g(id).hazards || '')]) }; });
ok('🧪 library: "Sodium perborate (oxygen bleach) — fabric / contents deodorizing"; bleach, peroxide, chlorine dioxide, ozone and hydroxyl say "oxidizer" in their hazards', ox.pb && ox.oxid.every(x => x[1]), ox);
ok('no page errors', !errs.length, errs);
const n = R.filter(Boolean).length; console.log('TRAINING ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
