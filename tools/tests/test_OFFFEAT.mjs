// test_OFFFEAT.mjs <build> — patch OFFFEAT in the browser (harness: scratchpad wN/harness_N.mjs, offline Supabase mock).
// Seeded data (the clean seed + made-up invoices, subs, jobs, change orders): the 📬 Collections buckets and totals
// = Accounting's; "Send payment reminder" → ONE payment_reminder on ✅ Approvals per invoice; the Office page's
// "What needs you today" line; Accounting Home / Money In hooks; the Sub Compliance chips, payment block and ONE
// COI request; the lien switch OFF by default, deadlines when on; the CO nudge once; the Job tools buttons; no page
// errors; no new timers. Then (when the read-only mirror is there, OFFFEAT_MIRROR=<kvnow.json>) the Collections total on
// the real data = Accounting's ($386,364.72 on 12 invoices when this was written). The mirror is never committed.
import { computer, sleep, SP, seedCloudFromBackup, waitFor, resetCloud, ACCOUNTS, cset, cget } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
import fs from 'fs';
const build = process.argv[2] || '.', email = 'wjohnson@grayco-cs.com';
const MIRROR = process.env.OFFFEAT_MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/kvnow.json';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m); } };
const arrOf = v => { if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : []; };
const T0 = new Date(); const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const ago = n => { const d = new Date(T0); d.setDate(d.getDate() - n); return ymd(d); };

/* the made-up office data on top of the clean seed */
const OFFP = [
  { id: 'POFF1', name: 'Off Test Roof', client: 'Offie Customer', clientEmail: 'offie@example.com', address: '9 Test Ln, Memphis, TN 38117', status: 'active', type: 'Residential', startDate: ago(120), pm: 'Steve Biffle', contract: 90000 },
  { id: 'POFF2', name: 'Off Test Mall', client: 'Gc Builders', clientEmail: 'ap@gc.example', address: '1 Main, Little Rock, AR 72201', status: 'active', type: 'Commercial', gcJob: true, startDate: ago(200), contract: 200000 }
];
const OFFI = [
  { id: 'IOFF_CUR', pid: 'POFF1', type: 'client', status: 'sent', amt: 1000, due: ago(-10), invNum: 'T-1', date: ago(20), sentDate: ago(20), terms: 'Net 30' },
  { id: 'IOFF_10', pid: 'POFF1', type: 'client', status: 'overdue', amt: 2000, due: ago(10), invNum: 'T-2', date: ago(40), sentDate: ago(40), terms: 'Net 30' },
  { id: 'IOFF_45', pid: 'POFF1', type: 'client', status: 'overdue', amt: 3000, due: ago(45), invNum: 'T-3', date: ago(75), sentDate: ago(75), terms: 'Net 30' },
  { id: 'IOFF_75', pid: 'POFF2', type: 'client', status: 'overdue', amt: 4000, due: ago(75), invNum: 'T-4', date: ago(105), sentDate: ago(105), terms: 'Net 30' },
  { id: 'IOFF_120', pid: 'POFF2', type: 'client', status: 'overdue', amt: 5000, due: ago(120), invNum: 'T-5', date: ago(150), sentDate: ago(150), terms: 'Net 30' },
  { id: 'IOFF_PAID', pid: 'POFF1', type: 'client', status: 'paid', amt: 7000, due: ago(60), invNum: 'T-6', date: ago(90), sentDate: ago(90), terms: 'Net 30', paidDate: ago(55) },
  { id: 'IOFF_SUB', pid: 'POFF1', type: 'sub', status: 'approved', amt: 1500, sub: 'Offtest Gutters', subId: 'VOFF1', date: ago(5), _pmApproved: true }
];
const OFFS = [
  { id: 'VOFF1', name: 'Offtest Gutters', isSub: true, email: 'gut@example.com', insExp: ago(-20), wcExp: ago(-200), w9: true, trade: 'Gutters' },
  { id: 'VOFF2', name: 'Offtest Paint', isSub: true, email: 'paint@example.com', insExp: ago(-5), wcExempt: true, w9: false, trade: 'Paint' }
];

/* the office-board function, mocked on the page's side: it writes the approvals list in the mocked cloud exactly as
   the server would (one open item per thing — the server rule itself is tested in test_OFFFEAT_fn.js) */
const calls = [];
function aqGet(){ return arrOf(cget('gc_approval_queue')); }
function aqPut(l){ cset('gc_approval_queue', l); }
function queueOnce(kind, metaKey, metaVal, extra){
  const l = aqGet();
  const w = l.find(x => x.kind === kind && (x.status === 'waiting' || x.status === 'sending') && String((x.meta || {})[metaKey]) === String(metaVal));
  if (w) return { ok: true, already: true, id: w.id };
  const id = 'appr_test_' + kind + '_' + metaVal + '_' + l.length;
  l.push(Object.assign({ id, kind, status: 'waiting', step: 'admin', steps: ['admin'], officeOk: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), meta: { [metaKey]: metaVal } }, extra || {}));
  aqPut(l); return { ok: true, queued: true, id };
}
const COS = [{ ref: 'sr:sr_POFF1_change_order_CO1', src: 'customer', pid: 'POFF1', title: 'Change order — extra gutters', amount: 1200, sentAt: new Date(Date.now() - 9 * 864e5).toISOString(), days: 9, emailStatus: 'sent', openNudge: null, lastNudge: '' },
  { ref: 'sr:sr_POFF1_change_order_CO2', src: 'customer', pid: 'POFF1', title: 'Change order — paint', amount: 300, sentAt: '', days: null, emailStatus: 'waiting', openNudge: null, lastNudge: '' }];
async function mockFns(c){
  await c.ctx.route(u => /\/\.netlify\/functions\/(office-board|lien)$/.test(new URL(u).pathname), async r => {
    const fn = new URL(r.request().url()).pathname.split('/').pop(); let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    calls.push(fn + ':' + b.action);
    let out = { ok: false, error: 'unknown' };
    if (fn === 'office-board') {
      if (b.action === 'remind') out = queueOnce('payment_reminder', 'invoiceId', b.invoiceId, { title: '⏰ Payment reminder — ' + b.invoiceId });
      else if (b.action === 'subdoc') out = Object.assign(queueOnce('sub_doc_request', 'subId', b.subId), { need: b.need });
      else if (b.action === 'nudge') out = queueOnce('sign_co_nudge', 'coRef', b.ref);
      else if (b.action === 'cos') out = { ok: true, cos: COS.filter(x => !b.pid || x.pid === b.pid).map(x => Object.assign({}, x, { openNudge: aqGet().find(y => y.kind === 'sign_co_nudge' && y.meta.coRef === x.ref && y.status === 'waiting') ? { id: 'x', status: 'waiting' } : null })) };
      else if (b.action === 'lienw') out = queueOnce('lien_waiver', 'invoiceId', b.invoiceId + ':' + b.kind);
      else if (b.action === 'wording') out = { ok: true, texts: { sub_conditional: 'A', sub_final: 'B', cust_conditional: 'C', cust_unconditional: 'D' }, custom: {}, placeholders: ['AMOUNT'], draftNote: 'DRAFT wording — GrayCo’s lawyer is reviewing it.' };
    } else if (fn === 'lien') {
      if (b.action === 'list') out = { ok: true, waivers: [], settings: { subs: {}, jobs: {} } };
      else if (b.action === 'request') out = Object.assign(queueOnce('sub_lien_request', 'waiverId', 'LWc_' + b.invId), { viaApproval: b.viaApproval });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
  });
}
async function signIn(c){
  const p = c.page();
  await p.goto('https://app.local/index.html'); await sleep(2500);
  if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); await p.locator('#gc-auth-submit').click(); }
}

/* ══════ part 1: seeded data ══════ */
resetCloud(); seedCloudFromBackup(SP + '/GrayCo_CLEAN_DATA_2026-10-16.json');
cset('invs', arrOf(cget('invs')).concat(OFFI));
cset('projects', arrOf(cget('projects')).concat(OFFP));
cset('subs', arrOf(cget('subs')).concat(OFFS)); cset('vendors', arrOf(cget('vendors')).concat(OFFS));
cset('gc_approval_queue', [{ id: 'appr_old_rem', kind: 'payment_reminder', status: 'sent', sentAt: ago(6) + 'T15:00:00Z', updatedAt: ago(6) + 'T15:00:00Z', meta: { invoiceId: 'IOFF_45' } }]);
const errs = [];
const c = await computer('OFF', { build }); const p = c.page(); p.on('pageerror', e => errs.push(String(e)));
await mockFns(c);
const timers0 = { n: 0 };
await c.ctx.addInitScript(() => { const si = window.setInterval; window.__offIv = []; window.setInterval = function(f, ms){ try { window.__offIv.push({ ms, stack: (new Error().stack || '').split('\n').slice(2, 4).join(' ') }); } catch (e) {} return si.apply(this, arguments); }; });
await signIn(c);
await waitFor(c, () => (window._crm && window._crm.projects || []).some(p => p.id === 'POFF1') && (window._crm.invoices || []).some(i => i.id === 'IOFF_10'), null, 120000, 300);
await waitFor(c, () => !!(window._gcOffFeat && window._gcAcctRules && window._gcCustApprovals), null, 30000, 300);
await p.evaluate(() => window._gcApprovalsRefresh && window._gcApprovalsRefresh()); await sleep(1500);

console.log('— (2) Collections');
const coll = await p.evaluate(() => { const m = window._gcOffFeat.collections(); const mine = m.rows.filter(r => /^IOFF_/.test(r.id)); return { all: m.totals.all, n: m.totals.n, rows: mine.map(r => ({ id: r.id, b: r.bucket, bal: r.balance, last: r.rem.last })), acct: window._gcAcctARTotal ? window._gcAcctARTotal() : null, model: (() => { try { return window._gcAcctModel().ar.totals.all; } catch (e) { return 'ERR ' + e; } })(), cust: m.customers.length, jobs: m.jobs.filter(j => /^POFF/.test(j.pid)).map(j => [j.pid, j.all]) }; });
const B = Object.fromEntries(coll.rows.map(r => [r.id, r.b]));
ok(B.IOFF_CUR === 'cur' && B.IOFF_10 === 'd30' && B.IOFF_45 === 'd60' && B.IOFF_75 === 'd90' && B.IOFF_120 === 'd90p', 'buckets: current / 1–30 / 31–60 / 61–90 / 90+ (' + JSON.stringify(B) + ')');
ok(!B.IOFF_PAID && !B.IOFF_SUB, 'paid and sub invoices are not on the board');
ok(Math.abs(coll.all - coll.acct) < 0.005 && Math.abs(coll.all - coll.model) < 0.005, 'Collections total = Accounting’s owed (' + coll.all + ' / ' + coll.acct + ' / ' + coll.model + ')');
ok(JSON.stringify(coll.jobs.sort()) === JSON.stringify([['POFF1', 6000], ['POFF2', 9000]]), 'totals per job (' + JSON.stringify(coll.jobs) + ')');
ok(coll.rows.find(r => r.id === 'IOFF_45').last.slice(0, 10) === ago(6), 'the last reminder date comes from the approvals list');
await p.evaluate(() => window._gcOffFeat.openCollections()); await sleep(500);
let ui = await p.evaluate(() => { const ov = document.getElementById('gcoff-coll-ov'); return { has: !!ov, tiles: [...ov.querySelectorAll('.gcoff-tile .l')].map(x => x.textContent), btn: !!ov.querySelector('[data-offrem="IOFF_10"]'), last: (ov.querySelector('[data-offrow="IOFF_45"]') || {}).textContent || '' }; });
ok(ui.has && ui.tiles.join('|') === 'Current|1–30 days|31–60 days|61–90 days|90+ days|Total owed to us', 'the board shows the five buckets and the total');
ok(ui.btn && /Last reminder/.test(ui.last), 'each row has "Send payment reminder" and the last reminder date');
await p.locator('#gcoff-coll-ov [data-offrem="IOFF_10"]').click(); await sleep(2500);
let q = aqGet().filter(x => x.kind === 'payment_reminder' && x.meta.invoiceId === 'IOFF_10');
ok(q.length === 1 && q[0].status === 'waiting', 'Send payment reminder → ONE payment_reminder on ✅ Approvals');
ui = await p.evaluate(() => { const ov = document.getElementById('gcoff-coll-ov'); const row = ov.querySelector('[data-offrow="IOFF_10"]'); return { txt: row ? row.textContent : '', btn: !!ov.querySelector('[data-offrem="IOFF_10"]') }; });
ok(/waiting for approval/.test(ui.txt) && !ui.btn, 'the row now says "Reminder waiting for approval" (no second button)');
await p.evaluate(() => window._gcOffFeat.sendReminder('IOFF_10')); await sleep(800);
ok(aqGet().filter(x => x.kind === 'payment_reminder' && x.meta.invoiceId === 'IOFF_10').length === 1, 'pressed again → still one reminder for that invoice');
await p.evaluate(() => { const o = document.getElementById('gcoff-coll-ov'); if (o) o.remove(); });
/* Office page */
await p.evaluate(() => window._setView && window._setView('officemanager')); await sleep(3500);
ui = await p.evaluate(() => { const b = document.querySelector('[data-offcoll]'); return b ? b.textContent : ''; });
ok(/Collections: \$/.test(ui) && /Approvals/.test(ui), '🏢 Office → "What needs you today" has the 📬 Collections line (' + ui.slice(0, 80) + ')');
if (ui) { await p.locator('[data-offcoll]').first().click(); await sleep(600); ok(await p.evaluate(() => !!document.getElementById('gcoff-coll-ov')), '…and it opens the board'); await p.evaluate(() => { const o = document.getElementById('gcoff-coll-ov'); if (o) o.remove(); }); }
/* Accounting */
await p.evaluate(() => window._gcAcctOpen && window._gcAcctOpen('k_home')); await sleep(3500);
ui = await p.evaluate(() => ({ card: !!document.querySelector('.gck-card[data-offcoll]') }));
ok(ui.card, 'Accounting → 🏠 Home has the 📬 Collections card');
await p.evaluate(() => window._gcAcctOpen && window._gcAcctOpen('k_in')); await sleep(3000);
ui = await p.evaluate(() => ({ strip: !!document.querySelector('#gck-body [data-offcoll]'), rem: document.querySelectorAll('#gck-body [data-offrem]').length, old: document.querySelectorAll('#gck-body [data-act^="remind:"]').length, wait: /waiting for approval/.test((document.querySelector('#gck-body') || {}).textContent || ''), total: (document.getElementById('gck-ar-total') || {}).textContent || '' }));
ok(ui.strip && ui.rem > 0 && ui.old === 0 && ui.wait, 'Accounting → ⬇ Money In: the 5-bucket strip, "Send payment reminder" (through Approvals) instead of ✉ Remind (' + JSON.stringify(ui) + ')');
ok(ui.total.replace(/[^0-9.]/g, '') === (Math.round(coll.all * 100) / 100).toFixed(2), 'Money In total = the board total (' + ui.total + ')');
/* the old Collections Desk door */
await p.evaluate(() => window._gcOpenCollectionsDesk()); await sleep(400);
ok(await p.evaluate(() => !!document.getElementById('gcoff-coll-ov') && !document.getElementById('_gcCollectOv')), 'the old "Collections Desk" door opens the new board');
await p.evaluate(() => { const o = document.getElementById('gcoff-coll-ov'); if (o) o.remove(); });

console.log('— (3) Sub paperwork');
await p.evaluate(() => window._gcOpenSubCompliance()); await sleep(600);
ui = await p.evaluate(() => { const ov = document.getElementById('_gcSubCompOv'); const rows = [...ov.querySelectorAll('tr')].filter(r => /Offtest/.test(r.textContent)); return rows.map(r => r.textContent); });
ok(ui.length === 2, 'each sub is listed once on the board (it used to list subs + vendors twice) (' + ui.length + ' rows)');
ok(ui.some(t => /Offtest Paint/.test(t) && /Expires in 5 days/.test(t) && /Payment blocked: no W-9/.test(t)), 'Sub Compliance board: "Expires in 5 days" and "⛔ Payment blocked: no W-9" (' + ui.join(' || ').slice(0, 200) + ')');
ok(ui.some(t => /Offtest Gutters/.test(t) && /Expires in 20 days/.test(t) && /Request docs/.test(t)), 'a COI running out in 20 days needs papers (Request docs)');
const reqBtn = p.locator('#_gcSubCompOv tr', { hasText: 'Offtest Paint' }).locator('[data-req]');
await reqBtn.click(); await sleep(1500);
q = aqGet().filter(x => x.kind === 'sub_doc_request' && x.meta.subId === 'VOFF2');
ok(q.length === 1, 'Request docs → ONE sub_doc_request on ✅ Approvals (' + calls.filter(x => /subdoc/.test(x)).length + ' call)');
ok(await p.evaluate(() => /Waiting for approval/i.test(([...document.querySelectorAll('#_gcSubCompOv tr')].find(r => /Offtest Paint/.test(r.textContent)) || {}).textContent || '')), 'the row says the request is waiting for approval');
await p.evaluate(() => window._gcOffFeat.subDoc({ id: 'VOFF2', name: 'Offtest Paint' }, ['W-9'])); await sleep(800);
ok(aqGet().filter(x => x.kind === 'sub_doc_request' && x.meta.subId === 'VOFF2').length === 1, 'asked again → still one');
await p.evaluate(() => { const o = document.getElementById('_gcSubCompOv'); if (o) o.remove(); });
ok(await p.evaluate(() => window._gcOffFeat.expChip(new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10)) === 'expired 3 days ago' && /no W-9/.test(window._gcOffFeat.blockWhy({ insExp: '2099-01-01', wcExempt: true }))), 'chips: "expired N days ago"; the pay-block reason (Subs tab "Can Pay?")');

console.log('— (4) Liens & waivers on the job');
await p.evaluate(() => window._gcOffFeat.liens('POFF1')); await sleep(800);
ui = await p.evaluate(() => { const ov = document.getElementById('gcoff-job-ov'); const sw = ov.querySelector('[data-offlien="on"]'); return { on: sw && sw.checked, txt: ov.textContent }; });
ok(ui.on === false && /Off \(the default\)/.test(ui.txt), 'the "Track lien deadlines" switch is OFF by default');
ok(/Offtest Gutters/.test(ui.txt) && /T-6/.test(ui.txt), 'waivers per payment: the customer invoices and the sub payment are listed');
await p.locator('#gcoff-job-ov [data-offlien="on"]').check(); await sleep(2500);
ok(await waitFor(c, () => { const q = window._gcAut.proj('POFF1'); return q && q.lienTrack && q.lienTrack.on === true; }, null, 8000), 'switch on → saved on the job (lienTrack.on)');
await p.evaluate(() => { const ov = document.getElementById('gcoff-job-ov'); const lw = ov.querySelector('[data-offlf="lastWork"]'); lw.value = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10); });
await p.locator('#gcoff-job-ov [data-offlien="save"]').click(); await sleep(2500);
ui = await p.evaluate(() => { const ov = document.getElementById('gcoff-job-ov'); return { txt: ov.textContent, rows: [...ov.querySelectorAll('.gcoff-t tr')].map(r => r.textContent).filter(t => /§/.test(t)) }; });
ok(ui.rows.some(t => /Record the Notice of Lien/.test(t) && /66-11-112/.test(t)) && ui.rows.some(t => /66-11-203/.test(t)) && ui.rows.some(t => /66-11-106/.test(t)), 'deadlines when on: TN § 66-11-203 / -112 / -106 (' + ui.rows.length + ' rows)');
ok(ui.rows.every(t => /confirm with your lawyer/.test(t)) && /not legal advice/i.test(ui.txt), 'every deadline says "confirm with your lawyer"; the not-legal-advice note');
await p.locator('#gcoff-job-ov [data-offdone="TN112"]').click(); await sleep(2000);
ok(await p.evaluate(() => !!((window._gcAut.proj('POFF1').lienTrack || {}).done || {}).TN112), 'Mark done → saved on the job');
await p.locator('#gcoff-job-ov [data-offsw="request"]').first().click(); await sleep(1500);
ok(aqGet().filter(x => x.kind === 'sub_lien_request').length === 1 && calls.includes('lien:request'), 'sub payment → Request waiver goes to ✅ Approvals (viaApproval)');
await p.locator('#gcoff-job-ov [data-offcw="conditional"]').first().click(); await sleep(1500);
ok(aqGet().filter(x => x.kind === 'lien_waiver').length === 1, 'customer payment → GrayCo’s conditional waiver goes to ✅ Approvals');
ok(await p.evaluate(() => { const ov = document.getElementById('gcoff-job-ov'); const t = [...ov.querySelectorAll('tr')].find(r => /T-1/.test(r.textContent)); return !!t && !!t.querySelector('[data-offcw="unconditional"][disabled]'); }), 'an unconditional waiver needs a recorded payment (button off)');
await p.locator('#gcoff-job-ov [data-offword]').click(); await sleep(800);
ok(await p.evaluate(() => { const o = document.getElementById('gcoff-word-ov'); return !!o && o.querySelectorAll('textarea[data-offwk]').length === 4 && /DRAFT/.test(o.textContent); }), '✏️ Waiver wording: four editable texts, marked DRAFT for the lawyer');
await p.evaluate(() => { ['gcoff-word-ov', 'gcoff-job-ov'].forEach(i => { const o = document.getElementById(i); if (o) o.remove(); }); });
await p.evaluate(() => window._gcOffFeat.liens('POFF2')); await sleep(600);
ok(await p.evaluate(() => document.getElementById('gcoff-job-ov').querySelector('[data-offlien="on"]').checked === false), 'another job: still off (per job)');
await p.evaluate(() => { const o = document.getElementById('gcoff-job-ov'); if (o) o.remove(); });

console.log('— (7) Unsigned change orders');
await p.evaluate(() => window._gcOffFeat.cos('POFF1')); await sleep(1500);
ui = await p.evaluate(() => document.getElementById('gcoff-job-ov').textContent);
ok(/extra gutters/.test(ui) && /9 days/.test(ui) && /e-mail waiting on Approvals/.test(ui), 'the job’s unsigned change orders with days waiting');
await p.locator('#gcoff-job-ov [data-offnudge]').first().click(); await sleep(1500);
ok(aqGet().filter(x => x.kind === 'sign_co_nudge').length === 1 && /Reminder waiting for approval/.test(await p.evaluate(() => document.getElementById('gcoff-job-ov').textContent)), 'Nudge → ONE reminder on ✅ Approvals; the row says it waits');
await p.evaluate(() => window._gcOffFeat.nudge('sr:sr_POFF1_change_order_CO1')); await sleep(800);
ok(aqGet().filter(x => x.kind === 'sign_co_nudge').length === 1, 'nudged again → still one');
await p.evaluate(() => { const o = document.getElementById('gcoff-job-ov'); if (o) o.remove(); });

console.log('— 🧰 Job tools buttons, timers, errors');
await p.evaluate(() => { try { const pp = window._gcAut.proj('POFF1'); window._setView && window._setView('projects'); setTimeout(() => { try { window._gcOpenProject(pp); } catch (e) {} }, 300); } catch (e) {} });
let bar = await waitFor(c, () => document.querySelectorAll('.gc-a8-bar [data-offjob]').length, null, 20000, 400);
if (!bar) { bar = await p.evaluate(() => { const b = document.createElement('div'); b.className = 'gc-a8-bar'; b.setAttribute('data-pid', 'POFF1'); document.body.appendChild(b); window._gcMkt2Deco(b); const n = b.querySelectorAll('[data-offjob]').length; b.remove(); return n ? 'deco:' + n : 0; }); }
ok(bar && (bar === 2 || bar === 'deco:2' || bar >= 2), '🧰 Job tools gets "⚖️ Liens & waivers" and "✍️ Unsigned COs" (' + bar + ')');
const iv = await p.evaluate(() => (window.__offIv || []).filter(x => /offfeat|OFFFEAT|gcoff/i.test(x.stack)).length);
ok(iv === 0, 'no interval timers from OFFFEAT');
ok(!errs.length, 'no page errors (' + errs.slice(0, 3).join(' | ').slice(0, 300) + ')');
await c.b.close();

/* ══════ part 2: the read-only mirror (never committed) ══════ */
if (fs.existsSync(MIRROR)) {
  console.log('— the real-data mirror: Collections = Accounting');
  resetCloud();
  for (const r of JSON.parse(fs.readFileSync(MIRROR, 'utf8'))) if (r && r.key) cset(r.key, r.v !== undefined ? r.v : r.value);
  const c2 = await computer('OFFM', { build }); const p2 = c2.page(); const e2 = []; p2.on('pageerror', e => e2.push(String(e)));
  await mockFns(c2); await signIn(c2);
  await waitFor(c2, () => (window._crm && window._crm.invoices || []).length > 20 && window._gcOffFeat && window._gcAcctRules, null, 150000, 500); await sleep(4000);
  const m = await p2.evaluate(() => { const t = window._gcOffFeat.collections().totals; let model = null; try { model = window._gcAcctModel().ar; } catch (e) {} return { all: t.all, n: t.n, acct: window._gcAcctARTotal(), mn: model && model.rows.length, mall: model && model.totals.all, b: [t.cur, t.d30, t.d60, t.d90, t.d90p] }; });
  console.log('    mirror: board ' + m.all + ' on ' + m.n + ' · Accounting ' + m.acct + ' on ' + m.mn + ' · buckets ' + JSON.stringify(m.b));
  ok(Math.abs(m.all - m.acct) < 0.005 && Math.abs(m.all - m.mall) < 0.005 && m.n === m.mn, 'the Collections total and count = Accounting’s on the real data');
  ok(Math.abs(m.b.reduce((a, x) => a + x, 0) - m.all) < 0.01, 'the five buckets add up to the total');
  if (process.env.OFFFEAT_EXPECT) ok(Math.abs(m.all - Number(process.env.OFFFEAT_EXPECT)) < 0.005, 'the mirror total is the expected ' + process.env.OFFFEAT_EXPECT);
  ok(!e2.length, 'no page errors on the real data (' + e2.slice(0, 2).join(' | ').slice(0, 200) + ')');
  await c2.b.close();
} else console.log('  (mirror not found — the real-data check is skipped)');
console.log(`OFFFEAT ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
