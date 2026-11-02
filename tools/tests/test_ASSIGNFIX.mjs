// test_ASSIGNFIX.mjs <build-dir> [mirror.json] — patch ASSIGNFIX on the live mirror (read-only copy, never committed).
// Wesley on 📋 Approvals (desk):
//   A. the owner's "👤 Assign this lead" cards (Altus Construction — companycam, S.W. Eavenson Construction — QuickBooks,
//      Vanderbilt mortgage and Finance — QuickBooks, when the mirror has them; else the first three): Assign → pick a
//      person → the card leaves at once and the badge drops by one; still gone after 20 s, after a cloud pull, after a
//      reload, and on a second device (a phone) signed in afresh.
//   B. "☐ Select all routine (N)": N > 0 when Routine "Assign this lead" cards show; it ticks them; customer e-mails /
//      texts are never ticked; "✅ Approve selected (N)" → Yes → the picker for the ticked leads → every ticked card
//      leaves and the badge drops by N; still gone after a reload.
// Env: GC_HARNESS (default scratchpad wN/harness_N.mjs).
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cloud, mclick } = H;
const build = path.resolve(process.argv[2] || '.'), MIRROR = process.argv[3] || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const email = 'wjohnson@grayco-cs.com', WHO = 'Wesley Johnson';
resetCloud(); for (const r of JSON.parse(fs.readFileSync(MIRROR, 'utf8'))) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m); } };
async function signIn(c){
  const p = c.page();
  await p.goto('https://app.local/index.html'); await sleep(2500);
  if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); await p.locator('#gc-auth-submit').click(); }
  await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20, null, 150000, 500);
  await sleep(25000); await p.evaluate(() => window._setView('approvals')); await sleep(5000);
}
const st = p => p.evaluate(() => {
  const nb = document.querySelector('.apx-nb'); const set = window._gcApprovalSet(); const ids = []; Object.keys(set.groups).forEach(g => set.groups[g].forEach(x => ids.push(String(x.id).replace(/#\d+$/, ''))));
  const bulk = document.querySelector('[data-apx-bulk="routine"]'), sel = document.querySelector('[data-apx-bulk="ask"]');
  return { badge: nb ? +nb.textContent : 0, count: window._gcApprovalCount(), ids, cards: [...document.querySelectorAll('.apx-list .apx-row')].map(e => e.getAttribute('data-k')),
    routine: bulk ? +(/\((\d+)\)/.exec(bulk.textContent) || [0, -1])[1] : -1, selected: sel ? +(/\((\d+)\)/.exec(sel.textContent) || [0, -1])[1] : -1 };
});
const settle = async p => { let a = await st(p); for (let i = 0, same = 0; i < 30 && same < 4; i++) { await sleep(2000); const b = await st(p); same = b.count === a.count ? same + 1 : 0; a = b; } return a; };
const leadOf = k => k.replace(/^td:hot1:asg:/, '');
const assignedTo = (p, id) => p.evaluate(id => { const l = (window.__gcLeadsLive || []).find(x => x && x.id === id); return l ? (l.pm || l.estimator || '') : '(not on the list)'; }, id);

const c = await computer('AF', { build }); const p = c.page();
await signIn(c);
let s0 = await settle(p);
// A. the owner's cards
const OWN = /Assign this lead: (Altus Construction|S\.W\. Eavenson Construction|Vanderbilt mortgage and Finance)/i;
const own = await p.evaluate(re => { const set = window._gcApprovalSet(); const o = []; Object.keys(set.groups).forEach(g => set.groups[g].forEach(x => { if (/^td:hot1:asg:/.test(x.id) && new RegExp(re, 'i').test(x.title)) o.push({ k: String(x.id).replace(/#\d+$/, ''), t: x.title + ' — ' + (x.sub || '') }); })); return o; }, OWN.source);
console.log('  start', JSON.stringify({ badge: s0.badge, count: s0.count, asg: s0.ids.filter(k => /hot1:asg/.test(k)).length, routine: s0.routine }), 'owner\'s cards:', JSON.stringify(own));
const byName = {}; own.forEach(x => { const n = OWN.exec(x.t)[1].toLowerCase(); byName[n] = (byName[n] || 0) + 1; });
ok(own.length > 0 && Object.values(byName).every(n => n === 1), 'one card per lead, not per copy (' + JSON.stringify(byName) + '; the mirror has Altus twice: companycam + QuickBooks)');
let keys = [...new Set(own.map(x => x.k))];
if (keys.length < 3) keys = keys.concat(s0.ids.filter(k => /^td:hot1:asg:/.test(k) && !keys.includes(k))).slice(0, 3);
ok(keys.length === 3, 'three "Assign this lead" cards to assign (' + keys.join(', ') + ')');
let s = s0;
for (const k of keys) {
  if (!(await p.locator(`.apx-list [data-k="${k}"]`).count())) await p.evaluate(() => { const m = document.querySelector('[data-apx-more]'); if (m) m.click(); });
  await sleep(400);
  await mclick(p, `[data-apx-act$="|${k}|approve"]`); await sleep(900);
  const has = await p.locator(`#gcl-asgpick [data-asg-to="${WHO}"]`).count();
  if (!has) { ok(false, 'the picker opened for ' + k); continue; }
  await mclick(p, `#gcl-asgpick [data-asg-to="${WHO}"]`); await sleep(1500);
  const a = await st(p), who = await assignedTo(p, leadOf(k));
  ok(!a.ids.includes(k) && !a.cards.includes(k) && a.count === s.count - 1 && a.badge === a.count && who === WHO, `Assign ${k} → ${who}: card gone at once, badge ${s.badge}→${a.badge} (set ${s.count}→${a.count})`);
  s = a;
}
const gone = x => keys.every(k => !x.ids.includes(k) && !x.cards.includes(k));
const ownLeft = () => p.evaluate(re => { const set = window._gcApprovalSet(); const o = []; Object.keys(set.groups).forEach(g => set.groups[g].forEach(x => { if (/^td:hot1:asg:/.test(x.id) && new RegExp(re, 'i').test(x.title)) o.push(x.title + ' — ' + (x.sub || '')); })); return o; }, OWN.source);
{ const l = await ownLeft(); ok(!l.length, 'no card left for the owner\'s leads (no twin copy stays): ' + JSON.stringify(l)); }
await sleep(20000); let s1 = await st(p);
ok(gone(s1) && s1.count <= s.count, `still gone after 20 s (badge ${s1.badge})`);
const cl = cloud.get('leads'); const inCloud = keys.map(k => { const l = (cl.value || []).find(x => x && x.id === leadOf(k)); return l ? (l.pm || l.estimator || '') : '(none)'; });
ok(inCloud.every(x => x === WHO), 'the cloud\'s lead list has the assignments (' + inCloud.join(', ') + ')');
await p.evaluate(() => window._gcPullNow && window._gcPullNow(true)); await sleep(15000);
let s2 = await st(p); ok(gone(s2), `still gone after a cloud pull (badge ${s2.badge})`);
await p.reload(); await sleep(3000); await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20, null, 150000, 500); await sleep(25000);
await p.evaluate(() => window._setView('approvals')); await sleep(5000);
let s3 = await settle(p); ok(gone(s3), `still gone after a reload (badge ${s3.badge}); the leads say ${(await Promise.all(keys.map(k => assignedTo(p, leadOf(k))))).join(', ')}`);
const ph = await computer('AF2', { build, mobile: true }); await signIn(ph);
let sp = await settle(ph.page()); const nA = x => x.ids.filter(k => /^td:hot1:asg:/.test(k)).length;
ok(gone(sp) && nA(sp) === nA(s3), `gone on a second device (a phone) too ("Assign this lead" cards: phone ${nA(sp)}, desk ${nA(s3)}; all cards ${sp.count} / ${s3.count})`);
try { await ph.b.close(); } catch (e) {}
// B. Select all routine / Approve selected
await p.evaluate(() => window._setView('approvals')); await sleep(2000);
let b0 = await st(p);
const tickable = await p.evaluate(() => [...document.querySelectorAll('.apx-list .apx-row')].filter(e => e.querySelector('[data-apx-sel]')).map(e => ({ k: e.getAttribute('data-k'), routine: /Routine/.test((e.querySelector('.gcao-chip') || {}).textContent || '') })));
const asgR = tickable.filter(x => /^td:hot1:asg:/.test(x.k) && x.routine).length;
ok(b0.routine > 0 && b0.routine >= asgR, `"Select all routine (${b0.routine})" counts the Routine "Assign this lead" cards (${asgR} on screen)`);
await mclick(p, '[data-apx-bulk="routine"]'); await sleep(600);
const ticked = await p.evaluate(() => [...document.querySelectorAll('[data-apx-sel]:checked')].map(i => i.getAttribute('data-apx-sel')));
let b1 = await st(p);
ok(ticked.length > 0 && b1.selected === b0.routine && ticked.every(k => !/^(ap2|eq):/.test(k)), `it ticks them: "Approve selected (${b1.selected})", no customer e-mail / text ticked`);
const tAsg = ticked.filter(k => /^td:hot1:asg:/.test(k));
await mclick(p, '[data-apx-bulk="ask"]'); await sleep(400);
const conf = await p.evaluate(() => (document.querySelector('.apx-bulk') || {}).textContent || '');
ok(/Approve \d+ item/.test(conf), 'the confirm: ' + conf.replace(/\s+/g, ' ').slice(0, 140));
await mclick(p, '[data-apx-bulk="yes"]'); await sleep(1200);
if (await p.locator(`#gcl-asgpick [data-asg-to="${WHO}"]`).count()) { await mclick(p, `#gcl-asgpick [data-asg-to="${WHO}"]`); }
await sleep(Math.min(60000, 4000 + tAsg.length * 900));
await p.evaluate(() => window._setView('approvals')); await sleep(2500);
let b2 = await st(p);
const left = ticked.filter(k => b2.ids.includes(k));
ok(!left.length && b2.count <= b0.count - ticked.length && b2.badge === b2.count, `Approve selected: all ${ticked.length} cards gone, badge ${b0.badge}→${b2.badge} (left: ${left.slice(0, 3).join(', ')})`);
await p.reload(); await sleep(3000); await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20, null, 150000, 500); await sleep(25000);
await p.evaluate(() => window._setView('approvals')); await sleep(5000);
let b3 = await settle(p);
ok(ticked.every(k => !b3.ids.includes(k)), `…and still gone after a reload (badge ${b3.badge})`);
ok(!c.errs.length, 'no page errors (' + c.errs.slice(0, 3).join(' | ') + ')');
console.log(`ASSIGNFIX ${pass}/${pass + fail}`); try { await c.b.close(); } catch (e) {} process.exit(fail ? 1 : 0);
