// test_BPHEAD.mjs <build-dir> — patch BPHEAD (owner 11/20 on a bidding job's page: "where can I add jobs to bid portal from here").
//   Made-up bidding job: desk admin → "📢 Put on bid portal" right before ✏️ Edit Project in the job header (on screen without
//   scrolling); a click opens the BIDPOST sheet with the job filled in; once the bid site lists the job → "📢 On bid portal ✓ · Manage".
//   The job's PM sees it too, the office does not; the phone job page has it by Edit Project as well. No page errors.
// Usage: node test_BPHEAD.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs; GC_SHOT = a .png path)
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_BPHEAD.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
H.resetCloud();
H.cset('users', [{ id: 'U2', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', active: true, payType: 'owner' },
  { id: 'U7', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }, { id: 'U5', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office', active: true }]);
H.cset('projects', [{ id: 'P1', autoPO: 'I586', name: 'Demo Club Remodel', client: 'Demo Club', address: '1 Demo Rd, Lakeland, TN', pm: 'Demo PM', status: 'bidding', contract: 0 }]);
let JOBS = [];
H.onFn('bid-hub', () => ({ ok: true, jobs: JOBS, subs: [], bids: [] }));
const W = []; const close = async () => { for (const c of W) await c.b.close().catch(() => {}); };
const openJob = async c => { await H.waitFor(c, () => window._crm && (window._crm.projects || []).length >= 1 && window._gcBidPost ? 1 : 0, null, 60000);
  await c.ev(() => { window._gcOpenProject = { id: 'P1' }; window._setView('projects'); }); await H.sleep(4500); };
const head = c => H.waitFor(c, () => { const b = document.getElementById('gcbp-head'); if (!b) return null; const r = b.getBoundingClientRect();
  return { t: b.textContent, next: (b.nextElementSibling || {}).textContent, top: Math.round(r.top), vis: !!b.getClientRects().length }; }, null, 8000);
try {
  const O = await H.computer('DESK', { build }); W.push(O);
  await H.signIn(O, 'wjohnson@grayco-cs.com', 9000); await openJob(O);
  let h = await head(O);
  ok(h && h.t === '📢 Put on bid portal' && /Edit Project/.test(h.next || '') && h.vis && h.top < 300, 'desk admin: "📢 Put on bid portal" sits before ✏️ Edit Project in the job header, on screen', h);
  if (process.env.GC_SHOT) await O.page().screenshot({ path: process.env.GC_SHOT });
  await O.page().click('#gcbp-head');
  const sh = await H.waitFor(O, () => { const t = document.querySelector('#gcbp-modal #gcbp-title'); return t && { title: t.value, addr: (document.getElementById('gcbp-addr') || {}).value }; }, null, 10000);
  ok(sh && sh.title === 'Demo Club Remodel' && /1 Demo Rd/.test(sh.addr || ''), 'a click opens the bid portal sheet with the job filled in', sh);
  await O.ev(() => window._gcBidPost.close && window._gcBidPost.close());
  JOBS = [{ id: 'J1', title: 'Demo Club Remodel', status: 'open', visibility: 'private', crmProjectId: 'P1' }];
  await O.ev(() => window._gcBidPost.jobs(true)); await H.sleep(2000);
  h = await head(O); ok(h && h.t === '📢 On bid portal ✓ · Manage', 'once posted: "📢 On bid portal ✓ · Manage"', h);
  ok(O.errs.length === 0, 'no page errors (desk admin)', O.errs);
  JOBS = [];
  const P = await H.computer('PM', { build }); W.push(P);
  await H.signIn(P, 'pm@grayco-cs.com', 9000); await openJob(P);
  h = await head(P); ok(h && h.t === '📢 Put on bid portal', "the job's PM has it", h);
  const F = await H.computer('OFFICE', { build }); W.push(F);
  await H.signIn(F, 'office@grayco-cs.com', 9000); await openJob(F);
  const fo = await F.ev(() => ({ head: !!document.getElementById('gcbp-head'), edit: [...document.querySelectorAll('main button')].some(b => /Edit Project/.test(b.textContent)) }));
  ok(!fo.head, 'the office (not admin / estimator / PM) does not', fo);
  const M = await H.computer('PHONE', { build, mobile: true }); W.push(M);
  await H.signIn(M, 'wjohnson@grayco-cs.com', 9000); await openJob(M);
  h = await head(M); ok(h && h.t === '📢 Put on bid portal' && /Edit Project/.test(h.next || ''), 'phone job page: by ✏️ Edit Project too', h);
  ok(M.errs.length === 0 && P.errs.length === 0 && F.errs.length === 0, 'no page errors (PM, office, phone)', [P.errs, F.errs, M.errs]);
} catch (e) { fail++; console.log('  ✗ FAIL threw ' + (e && e.stack || e)); }
await close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
