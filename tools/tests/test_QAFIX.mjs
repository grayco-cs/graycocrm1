// test_QAFIX.mjs <build-dir> — the QA gate's r36q findings (made-up data only):
//   1. QAFIX-REACT: Accounting → Tax Center no longer throws "React is not defined" (the embedded planner fetched React
//      from unpkg); it loads the pinned cdnjs copy, falls back to the CRM's pair, and shows a note (no throw) without either.
//   2. QAFIX-ENT: a sub bill stored as "Q&amp;A …" shows "Q&A …", matches the sub list decoded; the stored rows are unchanged.
//   3. QAFIX-PROF: no "Document policy violation: js-profiling" on a desk load (the profiler starts only when asked).
//   4. QAFIX-PEOPLE: two users with one e-mail (a real person + the "Office" placeholder) — the person signs in as the real
//      one, the people pickers list them once, the users list is unchanged.
// Usage: node test_QAFIX.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs)
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = process.argv[2];
if (!build) { console.error('usage: node test_QAFIX.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };

console.log('A. node');
const t = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
const pr = fs.readFileSync(path.join(build, 'tools/perfrep.js'), 'utf8');
ok(/function startProf\(\)\{ try \{ if \(MOBILE \|\| typeof W\.Profiler !== 'function' \|\| !profAsked\(\)\) return;/.test(t) && /!profAsked\(\)/.test(pr), 'perfrep (index.html and tools/perfrep.js): new Profiler() only when gc_perfrep_prof = 1');
const iE = t.indexOf('<script id="gc-patch-qafix-ent">'), iP = t.indexOf('<script id="gc-patch-qafix-people">'), iApp = t.indexOf('$x=[{id:"U1"');
ok(iE > 0 && iP > 0 && iApp > iE && iApp > iP, 'the decode / people helpers load before the app', { iE, iP, iApp });
ok((t.match(/\(window\._gcPeopleOnce\?window\._gcPeopleOnce\(An\):An\)\.filter\(/g) || []).length === 18 && !/[^.\w]An\.filter\(/.test(t), 'every people picker in the app goes through _gcPeopleOnce');

const H = await import(pathToFileURL(HARNESS).href);
const sleep = H.sleep;
const byId = id => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === id);
const ADMIN = byId('u-wesley'), OFFICE = byId('u-office');
const at = new Date().toISOString(), day = at.slice(0, 10);
function seed(){
  H.resetCloud();
  H.cset('users', [
    { id: 'U2', name: 'Wesley Johnson', email: ADMIN, role: 'Admin', payType: 'owner', active: true },
    { id: 'U5', name: 'Office', email: OFFICE, role: 'Office', payType: 'salary', active: true, updatedAt: '2026-10-30T15:26:08.502Z' },
    { id: 'U_office', name: 'Demo Officeperson', email: OFFICE, role: 'Office Admin', title: 'office manager', payType: 'hourly', active: true, updatedAt: '2026-11-19T04:47:12.988Z' },
    { id: 'U7', name: 'Demo PM', role: 'Project Manager', active: true }]);
  H.cset('projects', [{ id: 'PJ1', name: 'Demo Job', client: 'Sample Customer', address: '1 Demo St', status: 'active', pm: 'Demo PM', contract: 10000, createdAt: at, updatedAt: at }]);
  const sub = (id, o) => Object.assign({ id, isSub: true, trade: 'Framing', w9: true, coi: true, insExp: '2030-01-01', wcExp: '2030-01-01', updatedAt: at }, o);
  H.cset('subs', [sub('S1', { name: 'Q&A Construction LLC' }), sub('S2', { name: 'Demo Drywall' })]);
  H.cset('vendors', [sub('S1', { name: 'Q&A Construction LLC' }), sub('S2', { name: 'Demo Drywall' })]);
  const bill = (id, subName, n) => ({ id, type: 'sub', sub: subName, amt: 1000 + n, status: 'received', date: day, recvDate: day, desc: 'QuickBooks bill #' + n + ' — made-up work', source: 'quickbooks', by: 'QuickBooks import', qbKey: 'QB:bill:' + n + ':q', pid: '', updatedAt: at, savedAt: at });
  H.cset('invs', [bill('IVQ1', 'Q&amp;A Construction LLC', 9001), bill('IVQ2', 'Zed &amp; Sons Drywall', 9002), bill('IVQ3', 'Demo Drywall', 9003)]);
  H.cset('expenses', []); H.cset('schedule', []); H.cset('leads', []);
}

const OPEN = [];
try {
  seed();
  const invsBefore = JSON.stringify(H.cget('invs')), usersBefore = JSON.stringify(H.cget('users'));
  console.log('B. the office on a desk computer');
  const A = await H.computer('OFFICE', { build }); OPEN.push(A);
  const cons = []; A.page().on('console', m => cons.push(m.type() + ': ' + m.text().slice(0, 200)));
  const errs = []; A.page().on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 200)));
  ok(await H.signIn(A, OFFICE, 20000), 'the office signs in');
  /* the company's lists reach the screen (slow on a busy machine), then the signed-in person follows them (4 s check) */
  const loaded = await H.waitFor(A, () => { const c = window._crm || {}, I = (c.invs && c.invs.length ? c.invs : c.invoices) || []; return (c.users || []).some(u => u && u.id === 'U_office') && I.some(x => x && x.id === 'IVQ1'); }, null, 90000);
  ok(!!loaded, 'the users list and the bills are loaded');
  await H.waitFor(A, () => { const u = window._gcMeUser && window._gcMeUser(); return u && u.name === 'Demo Officeperson'; }, null, 30000);
  await sleep(4000);

  /* 3. js-profiling */
  ok(!cons.some(c => /Document policy violation|js-profiling/i.test(c)), 'no "Document policy violation: js-profiling" in the console on load', cons.filter(c => /policy|profil/i.test(c)));
  ok(await A.ev(() => !!window._gcPerfRep), 'the freeze reporter still runs');

  /* 4. one e-mail, two users */
  const me = await A.ev(() => { const u = window._gcMeUser && window._gcMeUser(); return { name: u && u.name, role: u && u.role, ls: localStorage.getItem('grayco_user') }; });
  ok(me.name === 'Demo Officeperson' && me.role === 'Office Admin', 'signed in as the real person (Office Admin), not the "Office" placeholder', me);
  ok(await A.ev(() => /Demo Officeperson/.test((document.querySelector('aside') || document.body).innerText) && /Office Admin/.test((document.querySelector('aside') || document.body).innerText)), 'the side bar shows the person and the Office Admin role');
  const unit = await A.ev(() => {
    const f = window._gcPeopleOnce, n = l => f(l).map(u => u.id).join(',');
    return {
      office: n([{ id: 'a', name: 'Office', email: 'X@Ex.test', role: 'Office', active: true }, { id: 'b', name: 'Real Person', email: 'x@ex.test ', role: 'Office Admin', active: true }, { id: 'c', name: 'Other', email: 'y@ex.test' }]),
      inactive: n([{ id: 'a', name: 'Real One', email: 'z@ex.test', role: 'Project Manager', active: false }, { id: 'b', name: 'Real Two', email: 'z@ex.test', role: 'Office', active: true }]),
      role: n([{ id: 'a', name: 'P', email: 'w@ex.test', role: 'Office', active: true }, { id: 'b', name: 'Q', email: 'w@ex.test', role: 'Estimator', active: true }]),
      newest: n([{ id: 'a', name: 'P', email: 'v@ex.test', role: 'Estimator', updatedAt: '2026-01-01' }, { id: 'b', name: 'Q', email: 'v@ex.test', role: 'Estimator', updatedAt: '2026-02-01' }]),
      noEmail: n([{ id: 'a', name: 'P' }, { id: 'b', name: 'P' }]),
      same: (() => { const l = [{ id: 'a', email: 'u@ex.test' }]; return f(l) === l; })()
    };
  });
  ok(unit.office === 'b,c' && unit.inactive === 'b' && unit.role === 'b' && unit.newest === 'b' && unit.noEmail === 'a,b' && unit.same, '_gcPeopleOnce: active > real person > specific role > newest, at the first one\'s place; no e-mail kept; no dupes = same list', unit);
  await A.ev(() => window._setView('schedule')); await sleep(3500);
  const pick = await A.ev(() => [...document.querySelectorAll('select')].map(s => [...s.options].map(o => o.textContent.trim())).filter(o => o.some(x => /Wesley Johnson/.test(x))));
  const flat = pick.flat();
  ok(pick.length >= 1 && !flat.some(x => /^Office$/.test(x)) && flat.filter(x => /^Demo Officeperson$/.test(x)).length <= pick.length, 'Schedule pickers: office@ listed once (no "Office" placeholder beside the real person)', pick);
  ok(await A.ev(() => (window._crm.users || []).filter(u => u && /^office/i.test(String(u.email || ''))).length) === 2 && JSON.stringify(H.cget('users')) === usersBefore, 'the users list itself still has both records (nothing changed or saved)');

  /* 2. Q&amp;A */
  await A.ev(() => window._setView('invoices')); await sleep(3000);
  await A.ev(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /^Sub Invoices/.test(x.textContent.trim())); b && b.click(); }); await sleep(2500);
  const rows = await A.ev(() => Array.from(document.querySelectorAll('tr')).filter(r => /QuickBooks bill #900\d/.test(r.textContent)).map(r => {
    const sel = Array.from(r.querySelectorAll('select')).find(s => Array.from(s.options).some(o => /fix sub|Select sub/.test(o.textContent)));
    return { n: (/#(900\d)/.exec(r.textContent) || [])[1], text: r.innerText.replace(/\s+/g, ' ').slice(0, 300), val: sel ? sel.value : null, warn: /not in your sub list/.test(r.textContent) };
  }));
  const R = Object.fromEntries(rows.map(r => [r.n, r]));
  ok(rows.length === 3, 'the Sub tab lists the 3 made-up QuickBooks bills', rows);
  ok(rows.every(r => !/&amp;|&#/.test(r.text)), 'no "&amp;" shows on any row', rows.map(r => r.text));
  ok(R['9001'] && !R['9001'].warn && R['9001'].val === 'Q&A Construction LLC', '"Q&amp;A Construction LLC" matches the sub "Q&A Construction LLC" (no warning, the sub is picked)', R['9001']);
  ok(R['9002'] && R['9002'].warn && /“Zed & Sons Drywall” is not in your sub list/.test(R['9002'].text), 'a payee not on the list is still flagged, decoded: “Zed & Sons Drywall”', R['9002']);
  ok(R['9003'] && !R['9003'].warn && R['9003'].val === 'Demo Drywall', 'a plain name still matches as before', R['9003']);
  const dec = await A.ev(() => ({ a: window._gcDecodeEnt('Q&amp;A'), b: window._gcDecodeEnt('A&amp;amp;B &lt;x&gt; &#39;q&#x27; &quot;'), c: window._gcDecodeEnt('Tom & Jerry'), d: window._gcDecodeEnt(null), e: window._gcSameName(' q&amp;a  construction llc', 'Q&A Construction LLC'), f: window._gcSameName('', '') }));
  ok(dec.a === 'Q&A' && dec.b === 'A&B <x> \'q\' "' && dec.c === 'Tom & Jerry' && dec.d === null && dec.e === true && dec.f === false, '_gcDecodeEnt / _gcSameName', dec);
  const qb = await A.ev(() => { const r = window._gcQbCsvParse('Date,Transaction Type,Num,Name,Memo/Description,Amount\n10/26/2026,Bill,9101,Q&amp;A Construction LLC,Made-up work,500.00\n'); return (r.recs || []).map(x => ({ name: x.name, key: x.key })); });
  ok(qb.length === 1 && qb[0].name === 'Q&A Construction LLC' && qb[0].key === 'QB:bill:9101:q', 'a QuickBooks export with "Q&amp;A" is read as "Q&A" (the bill key is the same as before)', qb);
  await sleep(3000);
  const subsNow = (H.cget('invs') || []).map(x => x.id + '=' + x.sub).sort().join(' | ');
  ok(subsNow === 'IVQ1=Q&amp;A Construction LLC | IVQ2=Zed &amp; Sons Drywall | IVQ3=Demo Drywall', 'the stored bills keep their sub names as they were (decode on read, no migration)', { subsNow, changedOtherFields: JSON.stringify(H.cget('invs')) !== invsBefore });

  /* 1. Tax Center */
  errs.length = 0;
  await A.ev(() => window._setView('taxcenter')); await sleep(6000);
  const frames = async () => { const out = []; for (const f of A.page().frames()) { if (f === A.page().mainFrame()) continue; try { out.push(await f.evaluate(() => ({ R: !!window.React, t: ((document.getElementById('app-root') || {}).innerText || '').slice(0, 80), unpkg: [...document.scripts].some(s => /unpkg\.com/.test(s.src)) }))); } catch (e) {} } return out; };
  let fr = await frames();
  ok(!errs.some(e => /React is not defined/.test(e)), 'Accounting → Tax Center: no "React is not defined"', errs);
  ok(fr.some(x => x.R && /TAX CENTER/i.test(x.t) && !x.unpkg), 'the embedded tax planner draws with the pinned cdnjs React (no unpkg)', fr);
  const clicked = await A.ev(() => { const b = [...document.querySelectorAll('button,a,span,div')].find(x => x.children.length === 0 && /^\s*Tax Center\s*$/.test(x.textContent) && x.getClientRects().length); if (b) { b.click(); return true; } return false; });
  await sleep(5000);
  const light = await A.ev(() => { const f = document.getElementById('gcw-tc-frame'); try { return f ? { R: !!f.contentWindow.React, t: (f.contentDocument.getElementById('app-root') || {}).innerText.slice(0, 60), bg: f.contentDocument.body && getComputedStyle(f.contentDocument.body).backgroundColor } : null; } catch (e) { return { err: String(e) }; } });
  ok(!clicked || (light && light.R && /TAX CENTER/i.test(light.t || '')), 'the light-coloured planner under Accounting → Tax Center draws too', { clicked, light });
  /* without cdnjs: the CRM's pair; without that either: a note, no throw */
  errs.length = 0;
  const fb = await A.ev(async () => {
    const m = [...document.scripts].map(s => s.text || '').find(x => x.indexOf('tc:b64toURL("') >= 0); const k = m.indexOf('tc:b64toURL("') + 13; const b64 = m.slice(k, m.indexOf('"', k));
    const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const raw = new TextDecoder('utf-8').decode(u8), h = window._gcEmbedReact(raw);
    const blocked = h.replace(/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/react(-dom)?\/18\.3\.1\//g, 'https://blocked.invalid/x$1/');
    const run = async (html) => { const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts allow-same-origin'); f.style.cssText = 'width:400px;height:300px'; f.src = URL.createObjectURL(new Blob([html], { type: 'text/html' })); document.body.appendChild(f); await new Promise(r => setTimeout(r, 3500)); const o = { R: !!f.contentWindow.React, t: ((f.contentDocument.getElementById('app-root') || {}).innerText || '').slice(0, 120) }; f.remove(); return o; };
    const pair = await run(blocked);
    const keep = window.__GC_CDN_REACT__; window.__GC_CDN_REACT__ = undefined; let none; try { none = await run(blocked); } finally { window.__GC_CDN_REACT__ = keep; }
    return { rawUnpkg: /unpkg\.com\/react/.test(raw), fixedUnpkg: /unpkg\.com/.test(h), sri: (h.match(/integrity="sha384-/g) || []).length, pair, none };
  });
  ok(fb.rawUnpkg && !fb.fixedUnpkg && fb.sri === 2, 'the embedded planner\'s unpkg React tags become the pinned cdnjs ones with integrity', fb);
  ok(fb.pair && fb.pair.R && /TAX CENTER/i.test(fb.pair.t), 'cdnjs blocked: the planner uses the CRM\'s own React pair', fb.pair);
  ok(fb.none && !fb.none.R && /could not load/.test(fb.none.t) && !errs.some(e => /React is not defined/.test(e)), 'no React at all: a short note, no "React is not defined"', { none: fb.none, errs });
  ok(!errs.length, 'no page errors on these screens', errs);
} catch (e) {
  fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e));
} finally {
  for (const c of OPEN) { try { await c.close(); } catch (e) {} }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
