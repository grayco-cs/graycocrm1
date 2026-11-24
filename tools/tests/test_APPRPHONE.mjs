// test_APPRPHONE.mjs <build-dir> — patch APPRPHONE: approvals on the owner's iPhone leave when he acts on them, and reach the office.
// Owner 11/24 (iPhone, GrayCo Field, 9 approvals waiting): "Trying to turn in approvals on phone idk if it's working not going away".
// Offline: the real-data snapshot (read only, QA_SNAP; the default is the session scratchpad's 11/19 copy) loaded into the harness,
// plus one MADE-UP card of each kind added in memory (two customer e-mails on the queue, a sub invoice, an expense, a material
// request); the owner (Wesley Johnson, admin) signs in on an emulated iPhone and works from the Field home. Nothing is sent anywhere.
//   A. node: the patch's pieces are in index.html.
//   B. good signal: the home card's ✅ Approve on a sub invoice and on an expense — within 1.5 s the card is gone, ⚡ Needs you and the
//      ✅ badge are one lower (the ↩ Undo toast shows); they stay gone for the whole undo window and after it; the decision is in the
//      cloud; a customer e-mail approved from the card leaves too; "N new job messages" (a To-Do approval card) opens the unread
//      job messages; after a reload none of them is back.
//   C. one bar of signal (400 kbps / 300 ms) and the phone's storage as full as the owner's iPhone reports: a sub invoice approved on
//      the card reaches the cloud (within 3 minutes), and is still there and still gone from the phone after the app is opened again.
// Usage: node test_APPRPHONE.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs, QA_SNAP = a snapshot dir)
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const SNAP = process.env.QA_SNAP || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/qa/snap/2026-11-19T05-08-16';
const build = path.resolve(process.argv[2] || '.');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };

console.log('A. node');
const T = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
ok(T.includes('<script id="gc-patch-apprphone">') && /W\._gcApprPhone = \{/.test(T), 'the phone-approvals block is in index.html');
ok(/W\._gcApprovalPendingKeys = function/.test(T) && /Object\.keys\(PEND\)\.forEach\(function\(k\)\{ var p = PEND\[k\]; delete PEND\[k\]; try \{ if \(p && p\.r\) commit\(p\.r\)/.test(T), 'an approval in its undo window: its key is known; it goes through when the page goes');
ok(/a\.act==='jobmsg'&&window\._gcApprJobMsg/.test(T) && /a\.act==='payroll'&&window\._gcApprPayroll/.test(T), 'the To-Do alert cards (job messages, payroll) have an action');
if (!fs.existsSync(path.join(SNAP, 'rows.ndjson'))) { console.log('B/C skipped — no snapshot at ' + SNAP); console.log(`APPRPHONE ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0); }

const H = await import(pathToFileURL(HARNESS).href);
const Q = await import(pathToFileURL(path.join(build, 'tools/qa/qa_lib.mjs')).href);
const sleep = H.sleep;
const IPH = `(() => { const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} }; d(Navigator.prototype, 'userAgent', ${JSON.stringify(Q.IPHONE_UA)}); d(Navigator.prototype, 'platform', 'iPhone'); d(Navigator.prototype, 'maxTouchPoints', 5); })()`;
const snap = Q.readSnap(SNAP);
let ME = '', EMAIL = '';
const rd = k => { const v = H.cget(k); if (typeof v === 'string') { try { return { v: JSON.parse(v), str: true }; } catch (e) {} } return { v, str: false }; };
const edit = (k, fn) => { const o = rd(k); const nv = fn(Array.isArray(o.v) ? o.v : []); H.cset(k, o.str ? JSON.stringify(nv) : nv); };
const list = k => { const o = rd(k).v; return Array.isArray(o) ? o : []; };
function seed(){
  Q.loadIntoHarness(H, snap);
  const { map } = Q.accountsFromSnap(H, snap); ME = map.admin.name; EMAIL = map.admin.email.toLowerCase();
  const now = Date.now(), iso = t => new Date(t).toISOString();
  const P = list('projects').filter(p => p && p.id && !p.deleted && !/complete|closed|lost/i.test(p.status || ''));
  const proj = P.find(p => p.pm === ME) || P[0];
  /* the "👤 Assign this lead" cards come and go with the lead inbox's timing — made assigned here so the cards under test are on top */
  edit('leads', l => l.map(x => x && !(x.pm || x.estimator || x.apm) ? Object.assign({}, x, { estimator: ME, assignConfirmed: true }) : x));
  const q = (id, kind, title, ago) => ({ id, kind, title, jobId: proj.id, jobName: proj.name, pm: '', pmEmail: '', channel: 'email', to: 'customer@example.com', subject: title, html: '<p>x</p>', text: 'x', attachments: [], steps: ['admin'], step: 'admin', approvals: [], status: 'waiting', createdAt: iso(now - ago), updatedAt: iso(now - ago), meta: {} });
  edit('gc_approval_queue', l => l.concat([q('appr_t_mail1', 'portal_docs', 'New in your GrayCo portal: Sample_Doc.pdf', 3600e3)]));
  edit('gc_sub_approvals', l => l.concat([{ id: 'invId:INVTAP1', invId: 'INVTAP1', amt: 1234, pid: proj.id, sub: 'Sample Sub LLC', desc: 'Uploaded: inv.pdf', pmName: ME, status: 'pending_pm', matched: true, payOverride: { by: ME, at: iso(now - 3600e3), note: 'papers in the office' }, createdAt: now - 3600e3, updatedAt: iso(now - 3600e3) }]));
  edit('expenses', l => l.concat([{ id: 'EXPTAP1', amt: 321, pid: proj.id, vendor: 'Sample Supply', desc: 'sample lumber', date: iso(now).slice(0, 10), type: 'purchase', status: 'pending', updatedAt: iso(now - 3600e3) }]));
  edit('gc_expense_approvals', l => l.concat([{ id: 'expId:EXPTAP1', expId: 'EXPTAP1', pm: ME, jobId: proj.id, payee: 'Sample Supply', desc: 'sample lumber', amount: 321, status: 'pending_pm', matched: true, enteredAt: iso(now - 3600e3), updatedAt: iso(now - 3600e3) }]));
}
const cloudSub = () => (list('gc_sub_approvals').find(x => x && x.invId === 'INVTAP1') || {}).status;
const cloudExp = () => (list('gc_expense_approvals').find(x => x && x.expId === 'EXPTAP1') || {}).status;
const cloudMail = () => (list('gc_approval_queue').find(x => x && x.id === 'appr_t_mail1') || {}).status;

/* the portal function's approval answer, on the same in-memory cloud */
async function fakePortal(c){
  await c.ctx.route('**/.netlify/functions/portal**', r => {
    let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    let out = { ok: true };
    if (b.action === 'approval') {
      const o = rd('gc_approval_queue'), l = Array.isArray(o.v) ? o.v : [], x = l.find(y => y.id === b.id), t = new Date().toISOString();
      if (b.op === 'list') out = { ok: true, items: l };
      else if (!x) out = { ok: false, error: 'That approval is not on the list any more.' };
      else if (b.op === 'approve') { x.status = 'sent'; x.sentAt = t; x.updatedAt = t; out = { ok: true, sent: true, item: x }; }
      else if (b.op === 'reject') { x.status = 'rejected'; x.updatedAt = t; out = { ok: true, item: x }; }
      H.cset('gc_approval_queue', o.str ? JSON.stringify(l) : l);
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
  });
}
const look = (c, ids) => c.ev(ids => {
  const d = document.querySelector('#_gcJobPick .gc-pmf'), out = {};
  ids.forEach(id => { const b = d ? [...d.querySelectorAll('.gc-pmf-ap [data-id="' + CSS.escape(id) + '"]')] : []; out[id] = b.length ? b.map(x => x.textContent.trim()).join('/') : ''; });
  const nd = d ? ((d.querySelector('.gc-pmf-need .gc-pmf-nd[data-ra-a="appr"]') || {}).innerText || '') : '';
  const n = /(\d+) approvals? waiting/.exec(nd); const bd = document.getElementById('gc-fh-badge');
  const toast = [...document.querySelectorAll('.apx-undo')].filter(t => t.getClientRects().length).map(t => t.textContent.trim());
  return { cards: out, need: n ? +n[1] : (/caught up/.test(nd) ? 0 : -1), badge: bd ? +(bd.textContent || 0) : -1, home: !!d, toast };
}, ids).catch(e => ({ err: String(e.message).slice(0, 80) }));
async function tapSel(c, sel){
  const L = c.page().locator(sel).first();
  if (!(await L.count())) return false;
  await L.scrollIntoViewIfNeeded().catch(() => {}); await sleep(150);
  const bb = await L.boundingBox(); if (!bb) return false;
  await c.page().touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); return true;
}
async function phone(name, init){
  const c = await H.computer(name, { build, mobile: true, init: [IPH].concat(init || []) });
  await fakePortal(c);
  await H.signIn(c, EMAIL, 30000);
  await H.waitFor(c, () => !!document.querySelector('#_gcJobPick .gc-pmf') && window._gcField && window._gcField.approvals().filter(x => /INVTAP1|EXPTAP1|appr_t_mail1/.test(x.id)).length >= 3, null, 180000);
  await sleep(8000);
  return c;
}
/* one tap on a home card's ✅ Approve: what the home shows at 1.5 s and through / after the 5-s undo window */
async function approveOnHome(c, id, label){
  const b0 = await look(c, [id]);
  const tapped = await tapSel(c, '#_gcJobPick .gc-pmf-ap [data-ra-a="apprnow"][data-id="' + id + '"]');
  ok(tapped, label + ': the home card has ✅ Approve', b0);
  if (!tapped) return;
  await sleep(1500);
  const b1 = await look(c, [id]);
  ok(!b1.cards[id] && b1.need === b0.need - 1 && b1.badge === b0.badge - 1, label + ': 1.5 s after the tap the card is gone and ⚡ Needs you / the ✅ badge are one lower (' + b0.need + '→' + b1.need + ', ' + b0.badge + '→' + b1.badge + ')', { b0, b1 });
  ok(b1.toast.some(t => /Approved/.test(t) && /Undo/.test(t)), label + ': the "✓ Approved — ↩ Undo" note shows', b1.toast);
  const seen = [];
  for (let i = 0; i < 12; i++) { await sleep(1000); const x = await look(c, [id]); seen.push((x.cards[id] || '-') + ' ' + x.need); }
  ok(seen.every(x => x.startsWith('- ')), label + ': it stays gone through the undo window and after it (12 s)', seen);
}

const OPEN = [];
try {
  /* ════ B. good signal ════ */
  console.log('B. the owner on his iPhone, good signal (real data + made-up cards)');
  seed();
  const c = await phone('OWNER'); OPEN.push(c);
  console.log('    home approvals: ' + JSON.stringify(await c.ev(() => window._gcField.approvals().map(x => x.id))));
  await approveOnHome(c, 'sub:INVTAP1', 'sub invoice');
  let st = null; for (let i = 0; i < 30 && st !== 'pm_approved'; i++) { await sleep(1000); st = cloudSub(); }
  ok(st === 'pm_approved', 'sub invoice: the decision is in the cloud', st);
  await approveOnHome(c, 'exp:EXPTAP1', 'expense');
  for (let i = 0; i < 30 && (st = cloudExp()) !== 'approved'; i++) await sleep(1000);
  ok(st === 'approved', 'expense: the decision is in the cloud', st);
  /* a customer e-mail: approved from the card (it asks nothing more on the phone) */
  const m0 = await look(c, ['ap2:appr_t_mail1']);
  ok(await tapSel(c, '#_gcJobPick .gc-pmf-ap [data-ra-a="apprnow"][data-id="ap2:appr_t_mail1"]'), 'customer e-mail: the home card has ✅ Approve', m0);
  await sleep(1500);
  const m1 = await look(c, ['ap2:appr_t_mail1']);
  ok(!m1.cards['ap2:appr_t_mail1'] && m1.need === m0.need - 1 && cloudMail() === 'sent', 'customer e-mail: gone from the home at once, Needs you one lower, sent', { m0, m1, cloud: cloudMail() });
  /* "N new job messages": the To-Do approval card opens the unread job messages */
  const jm = await c.ev(() => (window._gcField.approvals().find(x => /new job messages?$/.test(x.id)) || {}).id || '');
  if (jm) {
    await c.ev(id => { const L = window._gcField.approvals(); const x = L.find(y => y.id === id); const f = x && (typeof x.act === 'function' ? x.act : x.act && x.act.f); window.__jmBefore = document.querySelectorAll('body > *').length; if (f) f(); }, jm);
    await sleep(1500);
    const op = await c.ev(() => [...document.querySelectorAll('body *')].filter(e => e.getClientRects().length && /Unread job messages|Messages/.test(e.textContent || '') && getComputedStyle(e).position === 'fixed').map(e => (e.innerText || '').slice(0, 80)).slice(0, 2));
    ok(op.length > 0, '"' + jm.replace(/^td:otd:alert_/, '') + '": its ✅ Approve / Review opens the unread job messages (it did nothing)', op);
    await c.ev(() => document.querySelectorAll('.gc-ra-sheet,.gc-fh-sheet,.gc-pmf-sheet,._gcSheetOv').forEach(o => o.remove()));
  } else console.log('    (no "new job messages" card in this snapshot)');
  /* after a reload none of them is back */
  await c.page().reload({ waitUntil: 'domcontentloaded' });
  await H.waitFor(c, () => !!document.querySelector('#_gcJobPick .gc-pmf') && window._gcField && window._gcField.approvals().length > 0, null, 180000);
  await sleep(20000);
  const r1 = await c.ev(() => window._gcField.approvals().map(x => x.id).filter(k => /INVTAP1|EXPTAP1|appr_t_mail1/.test(k)));
  ok(!r1.length && cloudSub() === 'pm_approved' && cloudExp() === 'approved', 'after a reload none of them is back on the phone; the cloud still has the decisions', { r1, sub: cloudSub(), exp: cloudExp() });
  ok(!c.errs.length, 'no page errors', c.errs.slice(0, 3));
  await c.close(); OPEN.pop();

  /* ════ C. one bar, storage full ════ */
  console.log('C. one bar (400 kbps / 300 ms), storage as full as the owner\'s iPhone');
  seed();
  const NET = { on: false };
  const pools = []; const tick = setInterval(() => { if (!pools.length) return; const share = 400 * 1000 / 8 * 0.05 / pools.length; for (const x of pools.slice()) { x.rem -= share; if (x.rem <= 0) { pools.splice(pools.indexOf(x), 1); x.done(); } } }, 50);
  const xfer = n => new Promise(res => pools.push({ rem: n, done: res }));
  const sizeOf = u => { const k = u.searchParams.get('key') || ''; let rows = [...H.cloud.values()]; if (k.startsWith('eq.')) rows = rows.filter(r => r.key === decodeURIComponent(k.slice(3))); else if (k) rows = rows.slice(0, 40); return 200 + rows.reduce((a, r) => a + 70 + (/value|\*/.test(u.searchParams.get('select') || '*') ? JSON.stringify(r.value).length : 0), 0); };
  const line = async r => { const rq = r.request(); let u; try { u = new URL(rq.url()); } catch (e) { return r.fallback(); } if (!NET.on || u.host !== H.SBH || rq.method() === 'OPTIONS') return r.fallback(); await sleep(150); await xfer((rq.postData() || '').length + 600); await sleep(150); await xfer(rq.method() === 'GET' ? sizeOf(u) : 300); return r.fallback(); };
  const p = await phone('OWNER2', [Q.lsInitScript(Q.lsPlan(snap))]); OPEN.push(p);
  await p.ctx.route('**/*', line); NET.on = true; await sleep(5000);
  const full = await p.ev(() => localStorage.getItem('__qa_ls_filled'));
  console.log('    localStorage filled: ' + full);
  const s0 = await look(p, ['sub:INVTAP1']);
  ok(await tapSel(p, '#_gcJobPick .gc-pmf-ap [data-ra-a="apprnow"][data-id="sub:INVTAP1"]'), 'one bar: the sub invoice card has ✅ Approve', s0);
  await sleep(2000);
  const s1 = await look(p, ['sub:INVTAP1']);
  ok(!s1.cards['sub:INVTAP1'] && s1.need === s0.need - 1, 'one bar: the card is gone at once', { s0, s1 });
  const t0 = Date.now(); let cs = null;
  for (let i = 0; i < 180 && (cs = cloudSub()) !== 'pm_approved'; i++) await sleep(1000);
  console.log('    in the cloud after ' + Math.round((Date.now() - t0) / 1000) + ' s: ' + cs + ' · ' + JSON.stringify(await p.ev(() => window._gcApprPhone ? window._gcApprPhone.state().stats : null)));
  ok(cs === 'pm_approved', 'one bar, storage full: the sub invoice approved on the phone reaches the cloud (within 3 minutes)', cs);
  await p.page().reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await H.waitFor(p, () => !!document.querySelector('#_gcJobPick .gc-pmf') && window._gcField && window._gcField.approvals().length > 0, null, 240000);
  await sleep(30000);
  const r2 = await p.ev(() => window._gcField.approvals().map(x => x.id).filter(k => /INVTAP1/.test(k))).catch(e => ['err ' + e.message]);
  ok(!r2.length && cloudSub() === 'pm_approved', 'one bar, storage full: after the app is opened again the card is still gone and the cloud still has it', { r2, cloud: cloudSub() });
  clearInterval(tick);
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
for (const c of OPEN) await c.close().catch(() => {});
console.log(`APPRPHONE ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
