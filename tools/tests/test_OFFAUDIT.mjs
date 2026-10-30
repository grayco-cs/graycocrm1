// test_OFFAUDIT.mjs <build-dir> <mirror.json> — the office audit (10/30) in a real browser, offline (mock Supabase, every
// /.netlify/functions/ call answered here), on a READ-ONLY mirror of the company data (a JSON array of { key, value|v,
// updated_at }; customer data: keep it OUTSIDE git). Nothing leaves this computer.
// The office (office@grayco-cs.com, role office):
//   1. 📋 Approvals: one N everywhere; "✅ Approve & send" and "✕ Deny" with NO reason each take the card off and drop the
//      count (APPRCOUNT); the deny reaches the server (portal approval reject).
//   2. 📋 Approvals: "✅ 👤 Assign" on an "Assign this lead" card gives her a picker she can use, and the card leaves
//      (OFFFIX1); the lead drawer's picker is enabled for her.
//   3. 📊 Accounting → To Match: "Approve…" approves in place, the count drops and "Approved → P&L" shows (OFFFIX2);
//      "↻ Re-check duplicates" answers.
//   4. 🏢 Office → 🧭 Helpers: "Open" on a lead opens the lead's panel, not the ⏱ Bid due editor (OFFFIX3).
//   5. Projects: no job 🗑 / ⊕ Merge Jobs, _gcDeleteProject and _openMergeJobs refused (OFFFIX4); single expense 🗑 still there.
// The owner: the job 🗑 and ⊕ Merge Jobs are still his (OFFFIX4 leaves admins alone).
// Env: GC_HARNESS (offline harness, default the wME one). Exit 0 = PASS.
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HARNESS = process.env.GC_HARNESS || SP + '/wME/harness.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const { computer, signIn, sleep, cloud, ACCOUNTS, waitFor, cget, cset, broadcast } = H;
const BUILD = process.argv[2] && path.resolve(process.argv[2]), MIRROR = process.argv[3];
if (!BUILD || !MIRROR) { console.error('usage: node test_OFFAUDIT.mjs <build-dir> <mirror.json>'); process.exit(2); }
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
const OFFICE = 'office@grayco-cs.com', OWNER = 'wjohnson@grayco-cs.com';
let pass = 0, fail = 0;
const ok = (c, m, x) => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + m + (x !== undefined ? '  ' + JSON.stringify(x).slice(0, 300) : '')); };
function qList(){ let v = cget('gc_approval_queue'); for (let i = 0; i < 2 && typeof v === 'string'; i++) { try { v = JSON.parse(v); } catch (e) { break; } } return Array.isArray(v) ? v : []; }
const calls = [];
async function person(email){
  cloud.clear(); for (const r of rows) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
  ACCOUNTS[OFFICE].role = 'office';
  let c; for (let i = 0; i < 3; i++) { try { c = await computer(email.split('@')[0], { build: BUILD }); break; } catch (e) { await sleep(5000); } }
  c.acceptConfirm = false;
  /* functions: the portal approval actions (portal.js approvalAction shapes), everything else '{}' */
  await c.ctx.route(u => { const x = new URL(u); return x.host === 'app.local' && x.pathname.startsWith('/.netlify/functions/'); }, r => {
    const u = new URL(r.request().url()); let j = null; try { j = JSON.parse(r.request().postData() || 'null'); } catch (e) {}
    const J = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (/\/portal$/.test(u.pathname) && j && j.action === 'approval') {
      calls.push({ op: j.op, id: j.id });
      const l = qList(); const it = l.find(x => String(x.id) === String(j.id));
      if (!it) return J({ ok: true, ids: [], items: l });
      const now = new Date().toISOString();
      if (j.op === 'approve') { it.status = 'sent'; it.sentAt = now; } else if (j.op === 'reject') { it.status = 'rejected'; it.rejectedAt = now; it.reason = j.reason || ''; }
      it.updatedAt = now; const row = cset('gc_approval_queue', JSON.stringify(l)); try { broadcast && broadcast(row, 'server'); } catch (e) {}
      return J({ ok: true, item: it, sent: j.op === 'approve' });
    }
    return J({});
  });
  await c.ctx.route(u => /supabase\.co\/rest\/v1\/(gc_staff|rpc\/gc_my_access|gc_admin_kv)/.test(u), async r => {
    const u = new URL(r.request().url()), m = r.request().method(), a = ACCOUNTS[email];
    const J = (st, b) => r.fulfill({ status: st, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: typeof b === 'string' ? b : JSON.stringify(b) });
    if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.pathname.endsWith('/gc_staff')) return J(200, [{ email, role: a.role, active: true, name: '', profile: email === OFFICE ? 'office' : null, payroll: true }]);
    if (u.pathname.endsWith('/gc_my_access')) return J(200, { email, staff: true, admin: a.role === 'admin', payroll: true, office: email === OFFICE, sec2: 1 });
    return m === 'GET' ? J(200, []) : J(201, '');
  });
  await c.ctx.addInitScript(() => { try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {} });
  await c.page().setViewportSize({ width: 1366, height: 800 });
  await signIn(c, email, 1000);
  await waitFor(c, () => document.querySelectorAll('aside button[draggable="true"]').length > 5 && !!(window._crm && window._crm.projects && window._crm.projects.length), null, 180000, 500);
  await sleep(9000);
  return c;
}
const O = await person(OFFICE); const p = O.page(); const ev = (f, a) => p.evaluate(f, a);
const counts = () => ev(() => {
  const nav = [...document.querySelectorAll('aside button')].map(b => b.innerText.replace(/\s+/g, ' ').trim());
  return { badge: +((nav.find(t => /Approvals/.test(t)) || '').match(/(\d+)\s*$/) || [0, -1])[1],
    chip: +((([...document.querySelectorAll('main button')].find(b => /Waiting on me/.test(b.innerText)) || {}).innerText || '').match(/(\d+)/) || [0, -1])[1],
    st: window._gcAPX.state().mine, core: window._gcAPX.rows().filter(r => r.mine && /^(ap2|sub):/.test(r.key)).length };
});
const gone = k => ev(k => !window._gcAPX.rows().some(r => r.key === k && r.mine), k);
const clickIn = (k, re) => ev(({ k, re }) => { const row = [...document.querySelectorAll('main .apx-row')].find(d => d.getAttribute('data-k') === k); if (!row) return 'norow'; const b = [...row.querySelectorAll('button')].find(b => new RegExp(re).test(b.innerText.trim())); if (!b) return 'nobtn'; b.click(); return 'ok'; }, { k, re });
const firstRow = pre => ev(pre => { const d = [...document.querySelectorAll('main .apx-row')].find(d => (d.getAttribute('data-k') || '').indexOf(pre) === 0 && d.querySelector('button')); return d ? d.getAttribute('data-k') : null; }, pre);
async function approvals(){ await ev(() => window._setView('approvals')); await sleep(2500); }

/* 1. Approvals: Approve & send, Deny with no reason */
await approvals();
let c0 = await counts(); for (let i = 0; i < 10 && !(c0.badge === c0.st && c0.chip === c0.st); i++) { await sleep(500); c0 = await counts(); }   /* new leads to assign keep arriving: one N once it settles */
ok(c0.st > 0 && c0.badge === c0.st && c0.chip === c0.st, 'office Approvals: the nav badge, "Waiting on me" and the cards say one N', c0);
let k = await firstRow('ap2:');
if (k) {
  const n0 = (await counts()).core; await clickIn(k, '^✅ Approve'); await sleep(500);
  await ev(k => { const y = [...document.querySelectorAll('[data-apx-conf="yes"]')].find(b => b.getAttribute('data-k') === k); if (y) y.click(); }, k); await sleep(3000);
  const c = await counts();
  ok(calls.some(x => x.op === 'approve' && x.id === k.slice(4)) && await gone(k) && c.core === n0 - 1, '✅ Approve & send: sent, the card leaves, the count drops (customer messages + sub invoices)', { n0, c });
}
k = await firstRow('ap2:');
if (k) {
  const n0 = (await counts()).core; await clickIn(k, '^✕ Deny$'); await sleep(700);
  if (await ev(k => !!document.querySelector('[data-apx-deny-in="' + CSS.escape(k) + '"]'), k)) await clickIn(k, 'Deny & send back');
  await sleep(1200); const c = await counts();
  ok(await gone(k) && c.core === n0 - 1, '✕ Deny with no reason: the card leaves at once, the count drops', { n0, c });
  await sleep(11000);
  ok(calls.some(x => x.op === 'reject' && x.id === k.slice(4)), 'the deny reaches the server (reject) after the undo window', calls.slice(-3));
}
await sleep(2500); { let c = await counts(); for (let i = 0; i < 10 && !(c.badge === c.st && c.chip === c.st); i++) { await sleep(500); c = await counts(); } ok(c.badge === c.st && c.chip === c.st, 'after the actions the nav badge and "Waiting on me" still match the cards', c); }
/* 2. Assign this lead */
await approvals();
k = await firstRow('td:hot1:asg');
ok(!!k, 'office Approvals has "Assign this lead" cards', k);
if (k) {
  const n0 = (await counts()).st; await clickIn(k, 'Assign'); await sleep(1500);
  const pick = await ev(() => { const pk = document.getElementById('gcl-asgpick'); if (pk) { const b = [...pk.querySelectorAll('button, [data-gcl-who], li')].filter(b => /\w/.test(b.innerText) && !/cancel|close|✕/i.test(b.innerText)); if (b[0]) b[0].click(); return { picker: b.length }; } const s = document.querySelector('select[data-d="assign"]'); if (s && !s.disabled) { s.selectedIndex = 1; s.dispatchEvent(new Event('change', { bubbles: true })); return { drawer: true }; } return { none: true, disabled: !!(s && s.disabled) }; });
  await sleep(3000);
  ok(!pick.none, '✅ 👤 Assign gives the office a picker she can use', pick);
  await ev(() => { const x = document.querySelector('#gcl-drawer .hd button'); if (x) x.click(); }); await approvals();
  ok(await gone(k) && (await counts()).st < n0 + 1, 'after she assigns it the card leaves', await counts());
}
const drawer = await ev(async () => { const l = window._gcLeadsToAssign()[0]; if (!l) return 'nolead'; window._gcOpenLead(l.id, 'assign'); for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 400)); const s = document.querySelector('select[data-d="assign"]'); if (s) return { disabled: s.disabled }; } return 'nodrawer'; });
ok(drawer && drawer.disabled === false, 'the lead drawer\'s Assign picker is enabled for the office', drawer);
await ev(() => { const x = document.querySelector('#gcl-drawer .hd button'); if (x) x.click(); });
/* 3. Accounting → To Match */
await ev(() => window._setView('taxcenter')); await sleep(3000);
await ev(() => { const b = [...document.querySelectorAll('main button')].find(b => /^✅ To Match/.test(b.innerText.trim())); if (b) b.click(); }); await sleep(2000);
const tm = () => ev(() => +(((document.querySelector('main') || {}).innerText || '').match(/(\d+)\s*EXPENSE APPROVAL/) || [0, -1])[1]);
const t0 = await tm();
const ap = await ev(() => { const b = [...document.querySelectorAll('main button')].find(b => /^Approve…$/.test(b.innerText.trim())); if (!b) return 'none'; b.click(); return 'ok'; });
await sleep(1200);
const toastSeen = await ev(() => [...document.body.children].some(d => /Approved → P&L/.test(d.textContent || '')));
await sleep(1500); const t1 = await tm();
if (ap === 'ok') { ok(t1 === t0 - 1, 'To Match → Approve…: approved in place, "expense approval" count drops', { t0, t1 }); ok(toastSeen, 'and "Approved → P&L" shows (OFFFIX2)'); }
else console.log('note: no expense waiting on To Match in this data');
const rc = await ev(async () => { const b = [...document.querySelectorAll('main button')].find(b => /Re-check duplicates/.test(b.innerText)); if (!b) return 'none'; b.click(); const busy = b.innerText; await new Promise(r => setTimeout(r, 2500)); return { busy, said: [...document.body.children].some(d => /Checked again/.test(d.textContent || '')) }; });
ok(rc === 'none' || rc.said, '↻ Re-check duplicates answers', rc);
/* 4. 🏢 Office → 🧭 Helpers → Open on a lead */
await ev(() => window._setView('officemanager')); await sleep(2500);
const hl = await ev(async () => { for (let i = 0; i < 12; i++) { const t = document.getElementById('om-tab-ot_help'); if (t) { t.click(); break; } await new Promise(r => setTimeout(r, 500)); } await new Promise(r => setTimeout(r, 2000)); const b = document.querySelector('[data-ot-open^="lead|"]'); if (!b) return 'none'; b.click(); for (let i = 0; i < 16; i++) { await new Promise(r => setTimeout(r, 400)); if (document.getElementById('gcl-drawer')) break; } return { drawer: !!document.getElementById('gcl-drawer'), bidDue: [...document.querySelectorAll('.gc-la-pop')].some(x => /Bid due/.test(x.innerText)) }; });
ok(hl === 'none' || (hl.drawer && !hl.bidDue), '🧭 Helpers → Open on a lead opens the lead, not the bid-due editor (OFFFIX3)', hl);
await ev(() => { const x = document.querySelector('#gcl-drawer .hd button'); if (x) x.click(); document.querySelectorAll('.gc-la-pop').forEach(x => x.remove()); });
/* 5. Projects: job delete / merge are the admins' */
await ev(() => window._setView('projects')); await sleep(3500);
const pj = await ev(async () => { const shown = [...document.querySelectorAll('[data-gcx-del], ._gcRowX, #gc-merge-btn')].filter(b => getComputedStyle(b).display !== 'none' && !(b.matches('[data-gcx-del]') && false)).filter(b => b.id === 'gc-merge-btn' ? b.offsetParent !== null : true).length;
  const P = window._crm.projects, pid = P[P.length - 1].id; const out = await window._gcDeleteProject(pid); const box = !!document.getElementById('gcx-deljob');
  window._openMergeJobs(); await new Promise(r => setTimeout(r, 600)); const mo = [...document.body.children].some(d => getComputedStyle(d).position === 'fixed' && /Merge/i.test((d.innerText || '').slice(0, 200)) && d.getBoundingClientRect().width > 250);
  return { shown, out, box, still: window._crm.projects.some(p => p.id === pid), mergeOpen: mo }; });
ok(pj.shown === 0 && pj.out === false && !pj.box && pj.still && !pj.mergeOpen, 'office: no job 🗑 / ⊕ Merge Jobs; delete and merge refused (OFFFIX4)', pj);
await ev(() => window._setView('expenses')); await sleep(2500);
ok((await ev(() => [...document.querySelectorAll('main button')].filter(b => b.innerText.trim() === '🗑' && b.offsetParent).length)) > 0, 'office: a single expense 🗑 is still hers');
ok(!O.errs.length, 'office: no page errors', O.errs.slice(0, 4));
await O.b.close();
/* the owner keeps them */
const W = await person(OWNER); const pw = W.page();
await pw.evaluate(() => window._setView('projects')); await sleep(3500);
const ow = await pw.evaluate(async () => { const bins = [...document.querySelectorAll('[data-gcx-del]')].filter(b => getComputedStyle(b).display !== 'none').length; const P = window._crm.projects, pid = P[P.length - 1].id; const r = window._gcDeleteProject(pid); await new Promise(r => setTimeout(r, 700)); const bx = document.getElementById('gcx-deljob'); const box = !!bx; if (bx) bx.querySelector('[data-a=cancel]').click(); await r; return { bins, box, merge: !!document.getElementById('gc-merge-btn'), still: window._crm.projects.some(p => p.id === pid) }; });
ok(ow.bins > 0 && ow.box && ow.merge && ow.still, 'owner: the job 🗑 asks in its box, ⊕ Merge Jobs is there', ow);
ok(!W.errs.length, 'owner: no page errors', W.errs.slice(0, 4));
await W.b.close();
console.log('OFFAUDIT: ' + pass + '/' + (pass + fail) + (fail ? ' FAIL' : ' PASS'));
process.exit(fail ? 1 : 0);
