// test_LEADFLAP.mjs <build-dir> — patch LEADFLAP on REAL data: the lead list holds still and nothing a person did is lost.
//   On 10/30 the owner's lead list (React's, mirrored on window._crm.leads) swapped between copies of 116 / 149 / 175 leads
//   every 4-10 s with nobody touching anything (the "file as leads" importer re-filing deleted and kept leads as blank
//   copies dated today, LDEL's disk guard, the tombstone sweeps, the safety net, the de-dupe sweep -- see the patch).
//   As the owner, on a read-only mirror of production gc_kv (MIRROR=<json>; customer data: it is read at run time and never
//   committed): assign a lead from Approvals ("Assign this lead" -> a person) and change another lead's priority on the
//   Leads screen, then watch WATCH s (default 200):
//     * the lead count and ids stay the same in React's list, in IndexedDB and in the fake cloud;
//     * the assignment is still on the lead at the end -- in React's list, IndexedDB and the cloud; the edit too;
//     * deleted (tombstoned) leads stay gone everywhere; the importer files nothing dated today a second time;
//     * no page errors.
// Offline harness (GC_HARNESS, default the session scratchpad's wN/harness_N.mjs). Run it lock-free with nice -n 10.
import fs from 'fs';
import { pathToFileURL } from 'url';
const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || SPD + '/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cset, cget, mclick } = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2], MIRROR = process.env.MIRROR, WATCH = +(process.env.WATCH || 200) * 1000;
if (!build || !MIRROR) { console.error('usage: MIRROR=<gc_kv mirror .json> node test_LEADFLAP.mjs <dir with index.html>'); process.exit(2); }
const email = 'wjohnson@grayco-cs.com';
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };

resetCloud();
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
for (const r of rows) cset(r.key, r.value !== undefined ? r.value : r.v);
const val = k => { const r = rows.find(x => x.key === k); return r ? (r.value !== undefined ? r.value : r.v) : undefined; };
const DEAD = new Set(Object.keys(val('gc_tombstones') || {}).filter(k => /^leads:/.test(k)).map(k => k.slice(6)));
console.log('  mirror: ' + (val('leads') || []).length + ' leads in the cloud, ' + DEAD.size + ' deleted lead ids');

const c = await computer('LF', { build }); const p = c.page();
const CON = []; p.on('console', m => { const t = m.text(); if (/importer row\(s\) filed|Safety net restored|STOPPED/.test(t)) CON.push(t.slice(0, 200)); });
await p.goto('https://app.local/index.html'); await sleep(2500);
if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); await p.locator('#gc-auth-submit').click(); }
await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20, null, 150000, 500);
await sleep(20000);
const P = () => c.page();

/* React's own lead list (window._crm.leads is only a mirror), IndexedDB's, the cloud's */
const snap = () => P().evaluate(async () => {
  let got = null; try { window._setLeads(function(prev){ got = prev; return prev; }); } catch (e) {}
  for (let i = 0; i < 20 && !got; i++) await new Promise(r => setTimeout(r, 25));
  const d = await window.idbGet('leads');
  const ids = a => (Array.isArray(a) ? a : []).filter(Boolean).map(x => String(x.id)).sort();
  return { react: ids(got), idb: ids(d), toAssign: window._gcLeadsToAssign ? window._gcLeadsToAssign().length : -1 };
});
const who = l => (l && (l.pm || l.estimator)) || '';
const find = (a, id) => (Array.isArray(a) ? a : []).find(x => x && String(x.id) === String(id));
const where = (id) => P().evaluate(async id => {
  let got = null; try { window._setLeads(function(prev){ got = prev; return prev; }); } catch (e) {}
  for (let i = 0; i < 20 && !got; i++) await new Promise(r => setTimeout(r, 25));
  const f = a => (Array.isArray(a) ? a : []).find(x => x && String(x.id) === String(id)) || null;
  return { react: f(got), idb: f(await window.idbGet('leads')) };
}, id);

/* 1. Assign a lead from Approvals, the way he does */
await P().evaluate(() => window._setView('approvals'));
await waitFor(c, () => document.querySelectorAll('[data-apx-act*="|td:hot1:asg:"]').length > 0, null, 45000, 500); await sleep(1500);
const kAll = await P().evaluate(() => { const free = {}; (window._gcLeadsToAssign() || []).forEach(l => { if (l && !l.pm && !l.estimator && !l.archived) free['td:hot1:asg:' + l.id] = 1; });   /* a lead nobody is on yet */
  return [...new Set([...document.querySelectorAll('[data-apx-act$="|approve"]')].map(x => x.getAttribute('data-apx-act').split('|').slice(1, -1).join('|')).filter(k => free[k]))]; });
let kAsg = '', to = null, how = '';
for (const k of kAll.slice(0, 6)) {
  if (!(await mclick(P(), P().locator(`[data-apx-act$="|${k}|approve"]`).first()))) continue;
  await sleep(1200);
  to = await P().evaluate(() => { const b = document.querySelector('#gcl-asgpick [data-asg-to]'); return b && b.getAttribute('data-asg-to'); });
  if (to) { kAsg = k; how = 'the picker on the card'; await mclick(P(), '#gcl-asgpick [data-asg-to]'); break; }
  /* this card opens the lead itself: the Assigned box in its panel */
  const opt = await P().evaluate(() => { const sel = document.querySelector('#gcl-drawer select[data-d="assign"]'); if (!sel) return null; const o = [...sel.options].find(x => x.value && !/unassign|choose|select/i.test(x.textContent)); return o ? o.value : null; });
  if (opt) { kAsg = k; how = 'the Assigned box of the lead it opens'; await P().selectOption('#gcl-drawer select[data-d="assign"]', opt); break; }
  await P().keyboard.press('Escape'); await sleep(400);
}
const lid = kAsg.replace('td:hot1:asg:', '');
ok(!!kAsg, '"Assign this lead" on Approvals: ' + (how || 'no way to assign found'), kAll.length);
await sleep(2000);
if (!to) to = who((await where(lid)).react) || null;
await P().keyboard.press('Escape'); await mclick(P(), '#gcl-shade'); await sleep(600);
const a0 = await where(lid);
ok(!!to && who(a0.react) === to, `assigned ${lid} → ${to} (on the lead in React's list)`, { to, now: who(a0.react) });

/* 2. A lead edit: priority from the Leads screen's list */
await P().evaluate(() => window._setView('leads')); await sleep(6000);
const eid = await P().evaluate(lid => { const r = [...document.querySelectorAll('#gc-leads-hub tr[data-gcl-id]')].find(t => t.getAttribute('data-gcl-id') !== lid && t.querySelector('[data-gcl-lprio]')); return r ? r.getAttribute('data-gcl-id') : ''; }, lid);
const before = (await where(eid)).react;
const pr = (before && +before.priority === 8) ? '9' : '8';
await mclick(P(), `#gc-leads-hub tr[data-gcl-id="${eid}"] [data-gcl-lprio]`); await sleep(400);
await mclick(P(), `#gcl-lprio-pop [data-lp="${pr}"]`); await sleep(1500);
const e0 = await where(eid);
ok(!!eid && e0.react && String(e0.react.priority) === pr, `edited ${eid}: priority ${before && before.priority} → ${pr}`, e0.react && e0.react.priority);

/* 3. watch */
await sleep(10000);
const s0 = await snap();
console.log('  start: React ' + s0.react.length + ' · IndexedDB ' + s0.idb.length + ' · cloud ' + (cget('leads') || []).length + ' · Assign this lead ' + s0.toAssign);
const samples = [], t0 = Date.now(); let flips = 0, idbFlips = 0, prev = s0, lost = [], added = [];
const diff = (x, y) => { const Y = new Set(y); return x.filter(i => !Y.has(i)); };
while (Date.now() - t0 < WATCH) {
  await sleep(5000);
  const s = await snap(); s.t = Math.round((Date.now() - t0) / 1000); samples.push(s);
  if (s.react.join() !== prev.react.join()) { flips++; const out = diff(prev.react, s.react), inn = diff(s.react, prev.react); lost.push(...out); added.push(...inn); console.log(`   ${s.t}s React list ${prev.react.length} → ${s.react.length}` + (out.length ? ' lost ' + out.slice(0, 4).join(',') : '') + (inn.length ? ' new ' + inn.slice(0, 6).join(',') : '')); }
  if (s.idb.join() !== prev.idb.join()) { idbFlips++; console.log(`   ${s.t}s IndexedDB list ${prev.idb.length} → ${s.idb.length}`); }
  prev = s;
}
const last = samples[samples.length - 1];
const counts = [...new Set(samples.map(s => s.react.length))], asg = [...new Set(samples.map(s => s.toAssign))];
/* a lead that arrives (a one-time import the Leads screen runs) may join; nothing may leave or come and go */
ok(!lost.length && flips <= 1 && samples.every(s => !diff(s0.react, s.react).length), `React's lead list: no lead leaves, no copy swaps, for ${Math.round(WATCH / 1000)} s (${samples.length} looks; ${s0.react.length}${added.length ? ' + ' + added.length + ' new' : ''})`, { flips, counts, lost: lost.slice(0, 6) });
ok(samples.every(s => s.idb.join() === s.react.join()), `IndexedDB holds the same ids as the screen at every look`, { idbFlips, counts: [...new Set(samples.map(s => s.idb.length))] });
const cl = cget('leads') || [];
ok(cl.map(x => String(x.id)).sort().join() === last.react.join(), `the cloud holds the same ${last.react.length} leads`, { cloud: cl.length });
ok(asg.length === 1, `"Assign this lead" holds at ${asg[0]}`, asg);
ok(samples.every(s => !s.react.some(id => DEAD.has(id)) && !s.idb.some(id => DEAD.has(id))) && !cl.some(x => DEAD.has(String(x.id))), 'deleted leads stay gone (screen, IndexedDB, cloud)');

/* 4. what a person did is still there, everywhere */
const a1 = await where(lid), ca = find(cl, lid);
ok(who(a1.react) === to && who(a1.idb) === to && who(ca) === to, `the assignment ${lid} → ${to} is still on the lead: React, IndexedDB, cloud`, { react: who(a1.react), idb: who(a1.idb), cloud: who(ca) });
const e1 = await where(eid), ce = find(cl, eid);
ok([e1.react, e1.idb, ce].every(x => x && String(x.priority) === pr), `the edit (priority ${pr} on ${eid}) survives: React, IndexedDB, cloud`, [e1.react, e1.idb, ce].map(x => x && x.priority));
const today = new Date().toISOString().slice(0, 10);
const filed = CON.filter(t => /importer row\(s\) filed/.test(t));
ok(filed.length <= 1, `the importer filed rows at most once (${filed.length}x)`, filed);
ok(!CON.some(t => /STOPPED.*\bleads\b/.test(t)), 'no writer tried to cut the lead list', CON.filter(t => /STOPPED/.test(t)));
console.log('  importer rows on the list: ' + cl.filter(x => /^L(QB|CC)_/.test(String(x.id)) || /^(QuickBooks|CompanyCam)$/.test(String(x.source || ''))).length + ' of ' + cl.length + ' (dated today: ' + cl.filter(x => x.created === today).length + ')');
const ta = await P().evaluate(() => { const L = window._gcLeadsToAssign ? window._gcLeadsToAssign() : []; const imp = l => /^L(QB|CC)_/.test(String(l.id)) && !!l.fromProjectId;   /* the importer's own rows: id LQB_ / LCC_ + the project id, fromProjectId, note "Kept off the job board" */
  return { n: L.length, imp: L.filter(imp).length, qb: L.filter(l => imp(l) && /^LQB_/.test(l.id)).length, cc: L.filter(l => imp(l) && /^LCC_/.test(l.id)).length }; });
console.log(`  "Assign this lead": ${ta.n}, of them importer-filed ${ta.imp} (QuickBooks ${ta.qb}, CompanyCam ${ta.cc})`);
ok(!c.errs.length, 'no page errors', c.errs.slice(0, 3));
console.log(`LEADFLAP ${pass}/${pass + fail}`); try { await c.b.close(); } catch (e) {} process.exit(fail ? 1 : 0);
