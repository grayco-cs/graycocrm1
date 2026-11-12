// test_BPAPPR.mjs <build-dir> [shot-dir] — patch BPAPPR (owner 11/12, ✅ Approvals showed only payroll runs: "shouldn't I have bid portal
// approvals in here as admin?"). Offline harness, fake portal-access / bid-hub, made-up subs and jobs.
//   An admin's ✅ Approvals: new sub sign-ups (📎 papers, ⚡ ready) as "Waiting on me" rows with ✅ Approve / 📋 Review (✕ Deny in the sheet) — the
//   same s-bids-approve as Subs → Bid site requests; a 📩 plan request open > 1 business day ("📩 Answer" → 📂 Manage → Q&A); a bid-portal e-mail
//   waiting (bp_notice) under the same "🏗 Bid portal" chip; a PM does not get the sign-up rows.
import path from 'path'; import fs from 'fs';
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };
const { computer, signIn, sleep, cset, resetCloud } = await import(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const now = new Date().toISOString(), old = new Date(Date.now() - 4 * 864e5).toISOString();
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u3', name: 'Sam Biffle', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true }]);
cset('projects', [{ id: 'P1', name: 'Sample Clinic Remodel', client: 'Sample Health', address: '100 Sample St', status: 'active', autoPO: 'T101', pm: 'Sam Biffle', createdAt: old, updatedAt: old }]);
cset('gc_approval_queue', JSON.stringify([{ id: 'appr_bp_J1_a1_x', kind: 'bp_notice', title: 'Addendum #1 to 2 subs — Sample Clinic Remodel', pid: '', jobName: 'Sample Clinic Remodel', to: '2 subs (one e-mail each)', subject: 'Addendum #1 — Sample Clinic Remodel', html: '<p>Addendum</p>', status: 'waiting', step: 'admin', created: old, createdAt: old }]));
const BIDS = [{ id: 'u_new1', company: 'Sample Paint Co', name: 'Sal Sample', email: 'sal@samplepaint.test', phone: '901-555-0101', trades: ['Paint'], city: 'Memphis', state: 'TN', selfSignup: true, at: old,
    papers: { w9: { ok: true, url: 'https://example.com/w9.pdf' }, gl: { ok: true, exp: '2027-05-01', url: 'https://example.com/gl.pdf' }, wc: { ok: true, exp: '2027-03-01', url: 'https://example.com/wc.pdf' }, licenses: [], ready: true } },
  { id: 'u_new2', company: 'Sample Roofing LLC', name: 'Ray Sample', email: 'ray@sampleroof.test', trades: ['Roofing'], at: now, papers: { w9: { says: true }, gl: null, wc: null, licenses: [], ready: false } }];
const CALLS = [];
async function routes(c, who){
  await c.ctx.route('**/.netlify/functions/portal-access*', async rt => { const b = JSON.parse(rt.request().postData() || '{}'); CALLS.push(b);
    const J = v => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) });
    if (b.action === 's-sync') return J({ ok: true, events: [], unread: {}, links: {}, waiting: [], codes: [], admin: who === 'wjohnson@grayco-cs.com', me: who, bids: who === 'wjohnson@grayco-cs.com' ? BIDS.filter(x => !x.done) : [] });
    if (b.action === 's-bids-approve') { const x = BIDS.find(y => y.id === b.id); if (x) x.done = true; return J({ ok: true }); }
    return J({ ok: true }); });
  await c.ctx.route('**/.netlify/functions/bid-hub*', async rt => { const u = new URL(rt.request().url()), J = v => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) });
    if (u.searchParams.get('jobs')) return J({ ok: true, jobs: [{ id: 'J1', title: 'Sample Clinic Remodel', status: 'open', visibility: 'public', due: '', invited: 2, bids: 0, plans: 0, openReq: 2, reqSince: old, crmProjectId: 'P1', pmName: 'Sam Biffle' }, { id: 'J2', title: 'Fresh Request Job', status: 'open', visibility: 'public', openReq: 1, reqSince: now }], me: { email: who, admin: true, canInvite: true, canPublic: true } });
    if (u.searchParams.get('manage')) return J({ ok: true, paused: false, job: { id: 'J1', title: 'Sample Clinic Remodel', trades: '', tradeScopes: [], plansLinks: [], addenda: [], posts: [], log: [] }, plans: [], planreqs: [], questions: [], acks: [], activity: [], audience: [] });
    return J({ ok: true }); });
}
const wait = async (c, f, arg, ms = 25000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await c.ev(f, arg).catch(() => null); if (v) return v; await sleep(400); } return v; };
const A = await computer('wjohnson@grayco-cs.com', { build: BUILD }); const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await routes(A, 'wjohnson@grayco-cs.com'); await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(7000);
await A.ev(() => { window._gcBpAppr.refresh(); window._setView('approvals'); });
const rows = await wait(A, () => { const l = [...document.querySelectorAll('.apx-row[data-k^="bp:"]')].map(r => r.getAttribute('data-k') + '|' + r.textContent.slice(0, 160)); return l.length >= 3 ? l : null; }, null, 40000);
ok('the admin\'s ✅ Approvals "Waiting on me": the 2 sub sign-ups and the plan request open 4 days (not the one from today)', !!rows && rows.some(x => /^bp:su:u_new1\|.*Sample Paint Co.*ready for quick approval/.test(x)) && rows.some(x => /^bp:su:u_new2\|/.test(x)) && rows.some(x => /^bp:pr:J1\|.*2 plan \/ info requests/.test(x)) && !rows.some(x => /bp:pr:J2/.test(x)), rows);
const chip = await A.ev(() => { const c = document.querySelector('[data-apx-f="bp"]'); return c ? c.textContent : ''; });
ok('a "🏗 Bid portal" filter chip with its count (sign-ups + plan request + the bid-portal e-mail waiting)', /🏗 Bid portal/.test(chip) && /4/.test(chip), chip);
await A.ev(() => document.querySelector('[data-apx-f="bp"]').click()); await sleep(800);
const bpRows = await A.ev(() => [...document.querySelectorAll('.apx-row')].map(r => r.getAttribute('data-k')));
ok('the chip shows the bid portal items only — incl. the waiting addendum e-mail (approve = send)', bpRows.length === 4 && bpRows.some(k => /appr_bp_J1/.test(k)), bpRows);
if (SHOTS) await A.page().screenshot({ path: SHOTS + '/bpappr_approvals_bid_portal.png', fullPage: false });
const card = await A.ev(() => { const r = document.querySelector('.apx-row[data-k="bp:su:u_new1"]'); return r ? { papers: !!r.textContent.match(/ready/), btns: [...r.querySelectorAll('button')].map(b => b.textContent) } : null; });
ok('a sign-up row: ✅ Approve, 📋 Review (no generic "Deny & send back to the PM")', card && card.btns.some(b => /Approve/.test(b)) && card.btns.some(b => /Review/.test(b)) && !card.btns.some(b => /^✕ Deny$/.test(b)), card);
await A.ev(() => [...document.querySelectorAll('.apx-row[data-k="bp:su:u_new2"] button')].find(b => /Review/.test(b.textContent)).click());
const sh = await wait(A, () => { const m = document.getElementById('gcbpa-sheet'); return m ? m.innerText : null; }, null, 8000);
ok('📋 Review: the company, contact, trades and the 📎 papers line (W-9 ☑ says has it · GL — · WC —), ✅ Approve / ✕ Deny', !!sh && /Sample Roofing LLC/.test(sh) && /W-9 ☑ says has it/.test(sh) && /GL —/.test(sh) && /Approve for the bid site/.test(sh) && /Deny/.test(sh), sh);
if (SHOTS) await A.page().screenshot({ path: SHOTS + '/bpappr_review_sheet.png' });
A.acceptConfirm = true; A.page().on('dialog', d => d.accept().catch(() => {}));
await A.ev(() => document.querySelector('#gcbpa-sheet [data-bpa="no"]').click());
await wait(A, () => !document.getElementById('gcbpa-sheet'), null, 8000);
ok('✕ Deny in the sheet → s-bids-approve approve:false', CALLS.some(c => c.action === 's-bids-approve' && c.id === 'u_new2' && c.approve === false), CALLS.filter(c => c.action === 's-bids-approve'));
await A.ev(() => [...document.querySelectorAll('.apx-row[data-k="bp:su:u_new1"] button')].find(b => /Approve/.test(b.textContent)).click()); await sleep(1500);
await A.ev(() => { const y = document.querySelector('[data-apx-conf="yes"]'); if (y) y.click(); }); await sleep(1500);
ok('✅ Approve on the row → s-bids-approve approve:true (the same as Subs → Bid site requests)', CALLS.some(c => c.action === 's-bids-approve' && c.id === 'u_new1' && c.approve === true), CALLS.filter(c => c.action === 's-bids-approve'));
await A.ev(() => { window._gcBpAppr.refresh(); }); await sleep(500);
const pr = await A.ev(() => { const r = document.querySelector('.apx-row[data-k="bp:pr:J1"] button'); if (r) r.click(); return !!r; });
ok('📩 Answer opens 📂 Manage on 💬 Q&A', pr && !!(await wait(A, () => document.querySelector('#gcsys2 .tabs button.on') && /Q&A/.test(document.querySelector('#gcsys2 .tabs button.on').textContent), null, 10000)));
ok('no page errors (admin)', !errs.length, errs);
/* a PM: no sign-up rows */
const P = await computer('sbiffle@grayco-cs.com', { build: BUILD }); const e2 = []; P.page().on('pageerror', e => e2.push(String(e.message).slice(0, 200)));
await routes(P, 'sbiffle@grayco-cs.com'); await signIn(P, 'sbiffle@grayco-cs.com', 15000); await sleep(6000);
ok('a PM gets no bid-portal admin rows', (await P.ev(() => window._gcBpAppr.rows().length)) === 0);
ok('no page errors (PM)', !e2.length, e2);
const n = R.filter(Boolean).length; console.log('BPAPPR ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
