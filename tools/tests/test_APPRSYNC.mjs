// test_APPRSYNC.mjs <build-dir> — one approval list on every device (owner 10/30: "I approved some of these on my computer
// and now on my phone they are back. All info should be the same in field and desktop version.")
// Offline (GC_HARNESS, default the session scratchpad's wN/harness_N.mjs: one fake gc_kv + a live feed that broadcasts to
// every socket), on a READ-ONLY mirror of production gc_kv (MIRROR=<json>; customer data, read at run time, never
// committed) plus a few made-up cards so every kind is there: two customer e-mails on the server queue (portal approvalAction
// faked here on the same cloud), a sub invoice and an expense waiting on Wesley, two new job messages, two held new leads.
// A = desktop (📋 Approvals), B = phone (GrayCo Field home "My approvals" + its badge, then its 📋 Approvals screen), both
// signed in as the owner. On A: approve an e-mail, deny an e-mail, approve the sub invoice and the expense, read the job
// messages, deny a To-Do approval, approve the held leads, assign a lead. Then B (no reload) must drop every one of them
// within 60 s, and again after B reloads; A and B show the same list and the same count.
import fs from 'fs';
import { pathToFileURL } from 'url';
const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || SPD + '/wN/harness_N.mjs';
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cset, cget, mclick } = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2], MIRROR = process.env.MIRROR;
if (!build || !MIRROR) { console.error('usage: MIRROR=<gc_kv mirror .json> node test_APPRSYNC.mjs <dir with index.html>'); process.exit(2); }
const email = 'wjohnson@grayco-cs.com', ME = 'Wesley Johnson';
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };

/* ── the cloud: the mirror + one card of every kind ── */
resetCloud();
for (const r of JSON.parse(fs.readFileSync(MIRROR, 'utf8'))) cset(r.key, r.value !== undefined ? r.value : r.v);
const rd = k => { const v = cget(k); if (typeof v === 'string') { try { return { v: JSON.parse(v), str: true }; } catch (e) {} } return { v, str: false }; };
const edit = (k, fn) => { const o = rd(k); const nv = fn(Array.isArray(o.v) ? o.v : []); cset(k, o.str ? JSON.stringify(nv) : nv); };
const now = Date.now(), iso = t => new Date(t).toISOString();
const proj = (rd('projects').v || []).filter(p => p && p.id && !p.deleted)[0];
edit('gc_approval_queue', l => l.concat([
  { id: 'appr_t_mail1', kind: 'portal_docs', title: 'New in your GrayCo portal: Certificate_of_Completion_Enterprise_Dyersburg.pdf', jobId: proj.id, jobName: proj.name, pm: '', pmEmail: '', channel: 'email', to: 'cust@example.com', subject: 'New in your GrayCo portal', html: '<p>x</p>', text: 'x', attachments: [], steps: ['admin'], step: 'admin', approvals: [], status: 'waiting', createdAt: iso(now - 3600e3), updatedAt: iso(now - 3600e3), meta: {} },
  { id: 'appr_t_mail2', kind: 'portal_link', title: 'Portal link for the test job', jobId: proj.id, jobName: proj.name, pm: '', pmEmail: '', channel: 'email', to: 'cust@example.com', subject: 'Your portal', html: '<p>y</p>', text: 'y', attachments: [], steps: ['admin'], step: 'admin', approvals: [], status: 'waiting', createdAt: iso(now - 7200e3), updatedAt: iso(now - 7200e3), meta: {} }]));
edit('gc_sub_approvals', l => l.concat([{ id: 'invId:INVTSYNC1', invId: 'INVTSYNC1', amt: 1234, pid: proj.id, sub: 'Test Sub LLC', desc: 'Uploaded: inv.pdf', pmName: ME, status: 'pending_pm', matched: true, payOverride: { by: ME, at: iso(now - 3600e3), note: 'papers in the office' }, createdAt: now - 3600e3, updatedAt: iso(now - 3600e3) }]));
edit('expenses', l => l.concat([{ id: 'EXPTSYNC1', amt: 321, pid: proj.id, vendor: 'Test Supply', desc: 'test lumber', date: iso(now).slice(0, 10), type: 'purchase', status: 'pending', updatedAt: iso(now - 3600e3) }]));
edit('gc_expense_approvals', l => l.concat([{ id: 'expId:EXPTSYNC1', expId: 'EXPTSYNC1', pm: ME, jobId: proj.id, payee: 'Test Supply', desc: 'test lumber', amount: 321, status: 'pending_pm', matched: true, enteredAt: iso(now - 3600e3), updatedAt: iso(now - 3600e3) }]));
edit('gc_job_messages', l => l.concat([1, 2].map(i => ({ id: 'MTSYNC' + i, pid: proj.id, authorId: 'nthomas@grayco-cs.com', authorName: 'Nick Thomas', text: 'test message ' + i, tags: [], at: iso(now - 600e3 + i * 1000) }))));
const until = iso(now + 6 * 3600e3);
edit('leads', l => l.concat([1, 2].map(i => ({ id: 'LTSYNCHOLD' + i, name: 'Held Lead ' + i, client: 'Held Lead ' + i, type: 'Residential', stage: 'New', status: 'New', createdAt: iso(now - 1800e3), updatedAt: iso(now - 1800e3),
  hold: { state: 'held', name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', field: 'pm', label: 'Roofing', until, at: iso(now - 1800e3) } }))));
edit('gc_office_tasks', l => l.filter(x => !(x && x._deny && x._deny.key === 'td:leadhold')));   /* the mirror holds this card back (an open deny): not here */
const qv = () => { const o = rd('gc_approval_queue'); return { l: Array.isArray(o.v) ? o.v : [], str: o.str }; };

/* the portal function's approval actions (netlify/functions/portal.js approvalAction), on the same fake cloud */
const POSTS = [];
async function fakePortal(c){
  await c.ctx.route('**/.netlify/functions/portal**', r => {
    let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    let out = {};
    if (b.action === 'approval') {
      POSTS.push(c.name + ':' + b.op + ':' + b.id);
      const { l, str } = qv(), x = l.find(y => String(y.id) === String(b.id)), t = iso(Date.now()), save = () => cset('gc_approval_queue', str ? JSON.stringify(l) : l);
      if (b.op === 'list') out = { ok: true, items: l };
      else if (b.op === 'escalate') out = { ok: true };
      else if (!x) out = { ok: false, error: 'That approval is not on the list any more.' };
      else if (x.status !== 'waiting') out = { ok: false, error: 'Already ' + x.status + '.', item: x };
      else if (b.op === 'approve') { x.approvals = (x.approvals || []).concat([{ step: x.step, by: ME, email, role: 'admin', at: t }]); x.status = 'sent'; x.sentAt = t; x.sentBy = ME; x.updatedAt = t; save(); out = { ok: true, sent: true, item: x }; }
      else if (b.op === 'reject') { x.status = 'rejected'; x.rejectedBy = ME; x.rejectedEmail = email; x.rejectedAt = t; x.reason = String(b.reason || ''); x.updatedAt = t; save(); out = { ok: true, item: x }; }
      else out = { ok: false, error: 'Bad request' };
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
  });
}
async function signIn(c){
  const p = c.page();
  await p.goto('https://app.local/index.html'); await sleep(2500);
  if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); await p.locator('#gc-auth-submit').click(); }
  await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20, null, 150000, 500);
}
/* what a device shows: the one approval set (badge / desk list), the Field home's list, its header and its badge */
const look = c => c.page().evaluate(() => {
  try { window._gcApprovalSetFresh && window._gcApprovalSetFresh(); } catch (e) {}
  const set = window._gcApprovalSet(); const ids = [];
  Object.keys(set.groups).forEach(g => set.groups[g].forEach(x => ids.push(String(x.id))));
  const fhIds = [...document.querySelectorAll('#_gcJobPick .fh-ap[data-ap]')].map(e => e.getAttribute('data-ap'));
  const sec = [...document.querySelectorAll('#_gcJobPick .fh-sec span')].map(e => e.textContent).filter(t => /approvals/i.test(t))[0] || '';
  const fb = document.getElementById('gc-fh-badge'), nb = document.querySelector('.apx-nb');
  const titles = {}; Object.keys(set.groups).forEach(g => set.groups[g].forEach(x => { titles[x.id] = String(x.title || '').slice(0, 80); }));
  return { total: set.total, count: window._gcApprovalCount(), ids, titles, fhIds, fhN: parseInt((/\((\d+)\)/.exec(sec) || [])[1], 10), fhBadge: fb ? +(fb.textContent || 0) : null, jm: window._gcJobMsgUnreadTotal ? window._gcJobMsgUnreadTotal() : -1, navBadge: nb ? +nb.textContent : null, field: document.documentElement.classList.contains('_fieldmode') };
});
const apxKeys = c => c.page().evaluate(() => [...new Set([...document.querySelectorAll('[data-apx-act]')].map(b => b.getAttribute('data-apx-act').split('|').slice(1, -1).join('|')).filter(Boolean))]);
const settle = async c => { let s0 = await look(c); for (let i = 0, same = 0; i < 30 && same < 4; i++) { await sleep(2000); const n = await look(c); same = n.ids.join() === s0.ids.join() ? same + 1 : 0; s0 = n; } return s0; };

const A = await computer('A', { build }); await fakePortal(A);
const B = await computer('B', { build, mobile: true }); await fakePortal(B);
await signIn(A); await signIn(B);
await sleep(15000);
let a0 = await settle(A), b0 = await settle(B);
for (let i = 0; i < 20 && a0.ids.slice().sort().join() !== b0.ids.slice().sort().join(); i++) { await sleep(3000); a0 = await look(A); b0 = await look(B); }   /* the phone fills its stored lists a little later */
const K = {
  mail1: 'ap2:appr_t_mail1', mail2: 'ap2:appr_t_mail2', sub: 'sub:INVTSYNC1', exp: 'exp:EXPTSYNC1', hold: 'td:leadhold',
  msgs: a0.ids.find(k => /^td:otd:alert_(\d+_)?\d+ new job messages?$/.test(k)) || '',
  todo: a0.ids.find(k => /^td:/.test(k) && !/hot1|leadhold|job message/.test(k)) || '',
  asg: a0.ids.find(k => /^td:hot1:asg:/.test(k)) || ''
};
console.log('  held leads on A: ' + JSON.stringify(await A.page().evaluate(() => ({ held: window._gcLeadHold.held().length, hot1: (window._gcHot1Approvals() || []).map(x => x.id).filter(k => /leadhold/.test(k)), other: window._gcApprovalSet().groups.other.length }))));
console.log('  To-Do cards on A: ' + JSON.stringify(a0.ids.filter(k => /^td:/.test(k) && !/hot1/.test(k))));
console.log('  start A ' + a0.total + ' / B ' + b0.total + ' (B Field home ' + b0.fhN + ', badge ' + b0.fhBadge + ')  cards ' + JSON.stringify(K));
const has = (s, k) => s.ids.includes(k);
let JM = null;
const msgOn = s => s.ids.some(k => /new job messages?$/.test(k));
ok(B.mobile && b0.field && b0.fhIds.length > 0, 'B is the phone in GrayCo Field, its home lists approvals', { field: b0.field, n: b0.fhIds.length });
ok(Object.entries(K).every(([n, k]) => k && has(a0, k)), 'every kind is on A’s list', Object.fromEntries(Object.entries(K).map(([n, k]) => [n, !!k && has(a0, k)])));
ok(Object.entries(K).every(([n, k]) => k && (has(b0, k) || (n === 'msgs' && msgOn(b0)))), 'every kind is on B’s list', Object.fromEntries(Object.entries(K).map(([n, k]) => [n, !!k && has(b0, k)])));
ok(a0.ids.slice().sort().join() === b0.ids.slice().sort().join(), `A and B start with the same list (${a0.total} / ${b0.total})`, { onlyA: a0.ids.filter(k => !b0.ids.includes(k)), onlyB: b0.ids.filter(k => !a0.ids.includes(k)) });
for (let i = 0; i < 10 && !(b0.fhN === b0.total && b0.fhBadge === b0.total); i++) { await sleep(1500); b0 = await look(B); }   /* the home follows on APX's next tick (≤ 5 s idle) */
ok(b0.fhN === b0.total && b0.fhBadge === b0.total, `B: Field home header = badge = the set (${b0.fhN} / ${b0.fhBadge} / ${b0.total})`, await B.page().evaluate(() => { const f = window._gcField.approvals().map(x => x.id); const set = window._gcApprovalSet(); const ids = []; Object.keys(set.groups).forEach(g => set.groups[g].forEach(x => ids.push(String(x.id)))); return { fieldNow: f.length, fieldOnly: f.filter(k => !ids.includes(k)), setOnly: ids.filter(k => !f.includes(k)), cur: window._gcApprovalCurrent && window._gcApprovalCurrent().total }; }));

/* ── A decides one card of every kind, the way the desk does ── */
const pa = A.page();
await pa.evaluate(() => window._setView('approvals')); await sleep(4000);
const btn = (key, kind) => pa.locator(`[data-apx-act$="|${key}|${kind}"]`).first();
// 1. a customer e-mail: ✅ Approve & send (asks once in the card)
await pa.evaluate(k => window._gcApproveInPlace(k), K.mail1); await sleep(1500);   /* = ✅ Approve & send, then "yes" in the card */
// 2. a customer e-mail: ✕ Deny → Send back
await pa.evaluate(k => window._gcApprCount.deny(k), K.mail2); await sleep(400); await mclick(pa, `[data-apx-dsend="${K.mail2}"]`); await sleep(1500);
// 3. a To-Do approval: ✕ Deny → Send back
if (K.todo) { await pa.evaluate(k => window._gcApprCount.deny(k), K.todo); await sleep(400); await mclick(pa, `[data-apx-dsend="${K.todo}"]`); await sleep(1500); }
// 4. the sub invoice: ✅ Approve on the card (5-s undo, then it goes through); the expense: the APPROVE panel's approve
await pa.evaluate(k => window._gcApproveInPlace(k), K.sub); await pa.evaluate(() => window._gcApproveExpense('EXPTSYNC1')); await sleep(7000);
// 5. the two held leads: ✅ Approve suggestion
await pa.evaluate(async () => { for (const l of window._gcLeadHold.held()) await window._gcLeadHold.approve(l.id); }); await sleep(1500);
// 6. "Assign this lead": the picker on the card
await pa.evaluate(() => window._setView('approvals')); await sleep(1500);
let asgTo = '';
if (await pa.evaluate(k => { const el = document.querySelector(`[data-apx-act$="|${k}|approve"]`); window._gcLeadsHub.picker([k.replace('td:hot1:asg:', '')], el); return true; }, K.asg)) { await sleep(1200); asgTo = await pa.evaluate(() => { const b = document.querySelector('#gcl-asgpick [data-asg-to]'); return b ? b.getAttribute('data-asg-to') : ''; }); if (asgTo) await mclick(pa, '#gcl-asgpick [data-asg-to]'); await sleep(1500); }
await pa.keyboard.press('Escape').catch(() => {});
// 7. the job messages: read them (open the job's thread, close it)
await pa.evaluate(pid => { window._gcOpenJobMessages(pid); const x = document.querySelector('#_jmX'); if (x) x.click(); }, proj.id); await sleep(1500);
const tA = Date.now();
const a1 = await look(A); JM = a1.jm;
ok(a1.jm < a0.jm, `A: reading the job's messages lowered A's unread count (${a0.jm} → ${a1.jm})`);
const gone = s => ({ mail1: !has(s, K.mail1), mail2: !has(s, K.mail2), todo: !K.todo || !has(s, K.todo), sub: !has(s, K.sub), exp: !has(s, K.exp), hold: !has(s, K.hold), asg: !has(s, K.asg), msgs: JM == null || s.jm === JM });
const allGone = s => Object.values(gone(s)).every(Boolean);
ok(allGone(a1), 'A: every decided card left A’s list', gone(a1));
ok(!!asgTo, 'A: the lead was assigned from the card (' + asgTo + ')');

/* ── B, no reload: within 60 s ── */
let b1 = null; for (let i = 0; i < 40; i++) { b1 = await look(B); if (allGone(b1) && b1.fhIds.every(k => !Object.values(K).includes(k))) break; await sleep(1500); }
const dt = Math.round((Date.now() - tA) / 1000);
ok(allGone(b1), `B (phone, no reload): every card A decided left B’s list (${dt} s)`, gone(b1));
ok(b1.fhIds.every(k => !Object.values(K).includes(k)) && b1.fhN === b1.total && b1.fhBadge === b1.total, `B: the Field home and its badge followed (${b1.fhN} / ${b1.fhBadge} / ${b1.total})`, { fh: b1.fhIds });
await sleep(4000);
const a2 = await settle(A), b2 = await settle(B);
const subSt = c => c.page().evaluate(() => JSON.parse(localStorage.getItem('gc_sub_approvals') || '[]').filter(a => a && a.status === 'pending_pm').map(a => [a.invId || a.id, a.pmName, a.updatedAt, !!a.payCheck]));
if (a2.ids.join() !== b2.ids.join()) console.log('   subs A ' + JSON.stringify(await subSt(A)) + '\n   subs B ' + JSON.stringify(await subSt(B)) + '\n   gone A ' + JSON.stringify(await A.page().evaluate(() => window._gcApprCount.state())) + ' shared ' + JSON.stringify(await A.page().evaluate(() => window._gcApprShared.list().filter(x => /^d:/.test(x.id)).map(x => x.id))));
ok(a2.ids.slice().sort().join() === b2.ids.slice().sort().join() && a2.total === b2.total, `A and B show the same list again (${a2.total} / ${b2.total})`, { onlyA: a2.ids.filter(k => !b2.ids.includes(k)), onlyB: b2.ids.filter(k => !a2.ids.includes(k)) });

/* ── B reloads ── */
await B.page().reload(); await waitFor(B, () => (window._crm && window._crm.projects || []).length > 20, null, 150000, 500); await sleep(15000);
const b3 = await settle(B);
ok(allGone(b3), 'B after a reload: none of them came back', gone(b3));
ok(b3.fhIds.every(k => !Object.values(K).includes(k)) && b3.fhN === b3.total && b3.fhBadge === b3.total, `B after a reload: Field home = badge = set (${b3.fhN} / ${b3.fhBadge} / ${b3.total})`);
const a3 = await look(A);
ok(a3.ids.slice().sort().join() === b3.ids.slice().sort().join(), `A and B agree after B’s reload (${a3.total} / ${b3.total})`, { onlyA: a3.ids.filter(k => !b3.ids.includes(k)), onlyB: b3.ids.filter(k => !a3.ids.includes(k)) });
/* B's 📋 Approvals screen: the same list, none of A's decisions */
await B.page().evaluate(() => window._setView('approvals')); await sleep(5000);
const bk = await apxKeys(B);
ok(bk.length > 0 && !Object.values(K).some(k => k && bk.includes(k)), `B's 📋 Approvals screen: none of them (${bk.length} cards)`, Object.values(K).filter(k => k && bk.includes(k)));
console.log('  server calls ' + POSTS.filter(x => !/:list:|:escalate:/.test(x)).join(' '));
ok(!A.errs.length && !B.errs.length, 'no page errors', A.errs.concat(B.errs).slice(0, 4));
console.log(`APPRSYNC ${pass}/${pass + fail}`);
try { await A.b.close(); } catch (e) {} try { await B.b.close(); } catch (e) {}
process.exit(fail ? 1 : 0);
