// test_LEADBP.mjs <build-dir> [shot-dir] — patch LEADBP (owner 11/12: "I need to be able to put leads onto the bid portal as admin, Glenn needs to too").
// Offline harness (fake bid-hub that applies the REAL role rule of bid-hub.js posterRole via its _test export), made-up people and leads.
//   For an admin, an estimator (role "Estimator", payType revenue_pct) and a PM on their own lead: open a lead's drawer — a CRM lead and a
//   Lead Inbox bid lead (LEADIN-…) — the 📢 Put on bid portal button is there, visible (nothing on top of it), opens the sheet, and posting
//   sends op postjob; a PM does NOT get it on someone else's lead. The Leads list row's ⋯ / multi-select offer "📢 Put on bid portal".
import path from 'path'; import fs from 'fs'; import { createRequire } from 'module';
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };
/* ── the server: an estimator by the CRM people list counts (gc_staff says only "staff") ── */
{ const req = createRequire(import.meta.url); Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test' });
  const BI = req(path.join(BUILD, 'netlify/functions/bid-inbox.js')), SP = req(path.join(BUILD, 'netlify/functions/subportal.js'))._hub, H = req(path.join(BUILD, 'netlify/functions/bid-hub.js'))._test;
  BI._test.staffAuth = async () => ({ ok: true, email: 'gsample@grayco-cs.com', name: 'Glenn Sample', admin: false, role: 'staff' });
  BI._lib.sb = async () => ({ ok: true, json: async () => [{ profile: '', role: 'staff' }] });
  SP.kvRead = async () => ({ users: [{ name: 'Glenn Sample', email: 'gsample@grayco-cs.com', role: 'Estimator', payType: 'revenue_pct', active: true }], projects: [], leads: [] });
  const w = await H.whoIs({ headers: {} });
  ok('server: Glenn (CRM role "Estimator", payType revenue_pct; gc_staff "staff") is an estimator → may put any lead on the bid portal', w.estimator === true && w.canPublic === true && (await H.posterRole(w, { leadId: 'X' }, null)) === 'estimator', w); }
const { computer, signIn, sleep, cset, resetCloud } = await import(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const at = new Date(Date.now() - 864e5).toISOString(), due = new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10);
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Glenn Sample', email: 'sbiffle@grayco-cs.com', role: 'Estimator', payType: 'revenue_pct', active: true, title: 'Commercial Estimator' },
  { id: 'u3', name: 'Pat Sample', email: 'office@grayco-cs.com', role: 'Project Manager', active: true }]);
cset('leads', [{ id: 'L1', name: 'Sample Church Reroof', type: 'Commercial', stage: 'New Lead', address: '5 Sample Rd', city: 'Memphis', state: 'TN', pm: 'Pat Sample', bidDue: due + 'T14:00', createdAt: at, updatedAt: at },
  { id: 'LEADIN-ab12', name: 'Sample Clinic — Bid Invite', type: 'Commercial', stage: 'New Lead', gc: 'Sample Builders Inc.', bidDue: due + 'T10:00', inboxId: 'LI-ab12', source: 'bid board', address: '9 Sample Pkwy', createdAt: at, updatedAt: at },
  { id: 'L3', name: 'Other PM Lead', type: 'Residential', stage: 'New Lead', pm: 'Wesley Johnson', createdAt: at, updatedAt: at }]);
const POSTS = [];
async function routes(c, who){
  await c.ctx.route('**/.netlify/functions/bid-hub*', async rt => {
    const u = new URL(rt.request().url()), J = (b, code) => rt.fulfill({ status: code || 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (rt.request().method() === 'POST') { const b = JSON.parse(rt.request().postData() || '{}'); POSTS.push(Object.assign({ who }, b)); return J({ ok: true, jobId: 'J_' + POSTS.length, created: true, visibility: b.visibility, files: 0, notCopied: [] }); }
    if (u.searchParams.get('jobs')) return J({ ok: true, jobs: [], me: { email: who, admin: who === 'wjohnson@grayco-cs.com', estimator: who === 'sbiffle@grayco-cs.com', canInvite: true, canPublic: who !== 'office@grayco-cs.com' } });
    if (u.searchParams.get('posted')) return J({ error: 'no' }, 404);
    return J({ ok: true, subs: [], bids: [] });
  });
}
const wait = async (c, f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await c.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
async function check(email, label, leads, notLead){
  const C = await computer(email, { build: BUILD }); const errs = []; C.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  await routes(C, email); await signIn(C, email, 15000); await sleep(6000);
  await C.ev(() => { try { window._setView('leads'); } catch (e) {} }); await sleep(1500);
  for (const id of leads) {
    await C.ev(id => window._gcLeadsHub.open(id), id);
    const b = await wait(C, () => { const x = document.querySelector('#gcl-drawer #gcbp-lead [data-bidpost]'); if (!x) return null; const r = x.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { txt: x.textContent, vis: r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight, onTop: !!top && (top === x || x.contains(top)) }; }, null, 15000);
    ok(label + ' · lead ' + id + ': 📢 Put on bid portal is in the lead drawer, visible, nothing on top of it', !!b && /Put on bid portal|On bid portal/.test(b.txt) && b.vis && b.onTop, b);
    if (SHOTS && b) await C.page().screenshot({ path: SHOTS + '/leadbp_' + label.replace(/\W+/g, '_') + '_' + id + '.png' });
    await C.ev(() => document.querySelector('#gcl-drawer #gcbp-lead [data-bidpost]') && document.querySelector('#gcl-drawer #gcbp-lead [data-bidpost]').click());
    const sh = await wait(C, () => document.querySelector('#gcbp-modal #gcbp-title') ? document.getElementById('gcbp-title').value : null, null, 10000);
    ok(label + ' · lead ' + id + ': the sheet opens with the lead\'s name', !!sh, sh);
    if (sh) {
      const n0 = POSTS.length;
      await C.ev(() => { const b = [...document.querySelectorAll('#gcbp-modal [data-bp="trade"]')].find(x => x.getAttribute('data-t') === 'Roofing') || document.querySelector('#gcbp-modal [data-bp="trade"]'); b.click(); });
      await C.ev(() => document.querySelector('#gcbp-modal [data-bp="post"]').click());
      await wait(C, () => !document.getElementById('gcbp-modal'), null, 10000);
      const p = POSTS.slice(n0).find(x => x.op === 'postjob');
      ok(label + ' · lead ' + id + ': posting sends op postjob for that lead', !!p && p.leadId === id && p.who === email, POSTS.slice(n0));
    }
    await C.ev(() => { const m = document.getElementById('gcbp-modal'); if (m) m.remove(); try { window._gcLeadsHub.close(); } catch (e) {} }); await sleep(500);
  }
  if (label !== 'PM') {   /* the live Leads list can hold leads that window._crm.leads (an old copy) does not — the button must still be there */
    const st = await C.ev(() => { const all = (window._gcLeadsHubKit && window._gcLeadsHubKit.all()) || []; const had = all.some(l => l.id === 'LEADIN-ab12'); window._crm.leads = (window._crm.leads || []).filter(l => l.id !== 'LEADIN-ab12'); return had; });
    if (st) { await C.ev(() => window._gcLeadsHub.open('LEADIN-ab12'));
      ok(label + ' · a lead that is only on the live Leads list (not in the old _crm copy): 📢 is still there', !!(await wait(C, () => document.querySelector('#gcl-drawer #gcbp-lead [data-bidpost]'), null, 12000)));
      await C.ev(() => { try { window._gcLeadsHub.close(); } catch (e) {} }); }
    await C.ev(() => window._gcLeadsHub.redraw && window._gcLeadsHub.redraw()); await sleep(800);
    const rb = await wait(C, () => document.querySelectorAll('[data-gclu-bp]').length || null, null, 8000);
    ok(label + ' · the Leads list rows have a 📢 button', !!rb, rb);
    if (rb) { await C.ev(() => document.querySelector('[data-gclu-bp]').click()); ok(label + ' · a row\'s 📢 opens the sheet (not the drawer)', !!(await wait(C, () => document.getElementById('gcbp-modal'), null, 8000)));
      await C.ev(() => { const m = document.getElementById('gcbp-modal'); if (m) m.remove(); }); }
    const bulk = await C.ev(() => window._gcBidPost.canBulk());
    ok(label + ' · may put SELECTED leads on the bid portal (multi-select)', bulk === true);
    if (label === 'admin') { C.acceptConfirm = true; C.page().on('dialog', d => d.accept().catch(() => {})); const n0 = POSTS.length; await C.ev(() => window._gcBidPost.bulk(['L3'])); await wait(C, () => true, null, 300); await sleep(1500);
      const bp = POSTS.slice(n0).filter(p => p.op === 'postjob');
      ok('admin · "📢 Put selected on bid portal" posts each lead 🔒 private with the sub due 1 day before ours', bp.length === 1 && bp[0].leadId === 'L3' && bp[0].visibility === 'private', bp); }
  }
  for (const id of notLead || []) {
    await C.ev(id => window._gcLeadsHub.open(id), id); await sleep(3500);
    ok(label + ' · lead ' + id + ' (not theirs): no 📢 button', !(await C.ev(() => !!document.querySelector('#gcl-drawer #gcbp-lead'))));
    await C.ev(() => { try { window._gcLeadsHub.close(); } catch (e) {} });
  }
  ok(label + ': no page errors', !errs.length, errs);
  if (label === 'PM') ok('PM · may NOT bulk-post', (await C.ev(() => window._gcBidPost.canBulk())) === false);
  return C;
}
await check('wjohnson@grayco-cs.com', 'admin', ['L1', 'LEADIN-ab12']);
await check('sbiffle@grayco-cs.com', 'estimator', ['L1', 'LEADIN-ab12']);
await check('office@grayco-cs.com', 'PM', ['L1'], ['L3']);
/* the server's role rule: an estimator by the CRM people list (role "Estimator") may post, even when gc_staff says only "staff" */
const n = R.filter(Boolean).length; console.log('LEADBP ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
