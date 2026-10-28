// probe_apoffice.mjs <worktree> — DEMO data only, fully offline. A PM-step customer approval shows for the PM AND the office;
// the office approves it from its To-Do card; the real portal.js approvalAction (run here in node against the harness's
// in-memory gc_kv) sends it ONCE (Resend is faked); the PM's card is gone; the PM's late approve is refused.
import { createRequire } from 'module';
import path from 'path';
const H = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const { seedDemo } = await import('/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wFIELD/demo.mjs');
const { computer, signIn, cset, cget, sleep, waitFor } = H;
const WT = process.argv[2]; const require = createRequire(import.meta.url);
const SENT = [];
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

/* node-side fake network for portal.js: gc_kv = the harness cloud; Resend counted; anything else empty */
const res = (st, b) => ({ ok: st < 400, status: st, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });
globalThis.fetch = async (url, o) => {
  url = String(url); o = o || {};
  if (/api\.resend\.com/.test(url)) { SENT.push(JSON.parse(o.body)); return res(200, { id: 'em' + SENT.length }); }
  if (/\/rest\/v1\/gc_kv/.test(url)) {
    if ((o.method || 'GET') === 'POST') { const b = JSON.parse(o.body); cset(b.key, b.value); return res(201, {}); }
    const u = new URL(url), kq = decodeURIComponent(u.searchParams.get('key') || '');
    const keys = kq.startsWith('eq.') ? [kq.slice(3)] : kq.startsWith('in.') ? kq.slice(3).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/"/g, '')) : [];
    return res(200, keys.filter(k => H.cloud.has(k)).map(k => H.cloud.get(k)));
  }
  return res(200, []);
};
process.env.SUPABASE_URL = 'https://fake-probe.supabase.co'; process.env.SUPABASE_SERVICE_KEY = 'sb_secret_probe_only'; process.env.RESEND_API_KEY = 're_probe_only';
const portal = require(path.join(WT, 'netlify/functions/portal.js'));

seedDemo();
cset('gc_automation_pause', { on: false });
const now = new Date().toISOString();
cset('gc_approval_queue', JSON.stringify([{ id: 'apo1', kind: 'portal_link', title: 'Portal link — Demo Kitchen Remodel', jobId: 'P1', jobName: 'Demo Kitchen Remodel', pm: 'Sample PM', pmEmail: 'sbiffle@grayco-cs.com',
  channel: 'email', to: 'homeowner@example.test', subject: 'Your project page', html: '<p>Hi</p>', text: 'Hi', attachments: [], steps: ['pm'], step: 'pm', approvals: [], status: 'waiting', createdAt: now, updatedAt: now, meta: {} }]));

async function device(name, email, who){
  const c = await computer(name, { build: WT });
  await c.ctx.route(u => new URL(u).host === 'app.local' && new URL(u).pathname === '/.netlify/functions/portal', async r => {
    let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    if (b.action !== 'approval') return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (b.op === 'escalate') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"escalated":0}' });
    const out = await portal._core.approvalAction(b, who);
    (c.acts = c.acts || []).push({ op: b.op, status: out.status });
    return r.fulfill({ status: out.status, contentType: 'application/json', body: JSON.stringify(out.out) });
  });
  await signIn(c, email, 12000);
  return c;
}
const PM = await device('pm', 'sbiffle@grayco-cs.com', { email: 'sbiffle@grayco-cs.com', role: 'staff', name: 'Sample PM' });
const OF = await device('office', 'office@grayco-cs.com', { email: 'office@grayco-cs.com', role: 'staff', name: 'Office Demo' });
const mine = c => c.ev(() => { try { window._gcApprovalsRefresh && window._gcApprovalsRefresh(); } catch (e) {} var a = window._gcCustApprovals && window._gcCustApprovals(); return a ? a.mine.map(x => x.id) : null; });
await sleep(1500);
ok((await waitFor(PM, () => { var a = window._gcCustApprovals && window._gcCustApprovals(); return a && a.mine.some(x => x.id === 'apo1'); }, null, 30000)), 'PM: the item is waiting on him');
ok((await waitFor(OF, () => { var a = window._gcCustApprovals && window._gcCustApprovals(); return a && a.mine.some(x => x.id === 'apo1'); }, null, 30000)), 'office: the same item is waiting on the office at once');
ok(await OF.ev(() => !!(window._gcApprovalSet && window._gcApprovalSet().groups.email.some(e => e.id === 'ap2:apo1'))), 'office: in the one approval set (To-Do chip / APPROVE badge / 📋 Approvals)');
const apx = await OF.ev(() => window._gcAPX ? window._gcAPX.rows().filter(r => r.key === 'ap2:apo1')[0] : null);
ok(apx && apx.mine && /PM Sample PM or the office/.test(apx.waits) && apx.approve, '📋 Approvals row (office): mine, "' + (apx && apx.waits) + '", has ✅ Approve');
ok(await OF.ev(() => window._gcSubInv ? window._gcApprovalSet().groups.subinv.some(e => /SA1|sub:/.test(e.id)) : true), 'office: the PM-step sub invoice shows at once too');
await OF.ev(() => window._setView && window._setView('todo')); await PM.ev(() => window._setView && window._setView('todo'));
const card = await waitFor(OF, () => { var c = document.querySelector('._ap2Card[data-id="apo1"]'); return c ? c.innerText : null; }, null, 30000);
ok(card && /Needs PM Sample PM or the office/.test(card), 'office To-Do card says who it waits on: ' + JSON.stringify((card || '').split('\n').filter(l => /Needs/.test(l))[0] || ''));
const pmCard = await waitFor(PM, () => { var c = document.querySelector('._ap2Card[data-id="apo1"]'); return c ? c.innerText : null; }, null, 30000);
ok(!!pmCard, 'PM To-Do shows the same card');
await OF.page().locator('._ap2Card[data-id="apo1"] ._ap2Yes').first().click({ timeout: 10000 }).catch(e => console.log('click', e.message));
await sleep(4000);
const q = JSON.parse(cget('gc_approval_queue')).find(x => x.id === 'apo1');
ok(q.status === 'sent' && q.approvals.length === 1 && q.approvals[0].role === 'office', 'office approved it: sent, approval recorded as office (' + q.status + ', ' + (q.approvals[0] || {}).role + ')');
ok(SENT.length === 1 && SENT[0].to[0] === 'homeowner@example.test', 'sent ONCE (faked Resend): ' + SENT.length);
await sleep(1000);
const pmMine = await mine(PM); await sleep(2500);
const pmMine2 = await PM.ev(() => window._gcCustApprovals().mine.map(x => x.id));
ok(pmMine2.indexOf('apo1') < 0, 'PM: gone from his list');
await PM.ev(() => { window.__GC_REFRESH_UI__ && window.__GC_REFRESH_UI__(); }); await sleep(7000);
ok(!(await PM.ev(() => !!document.querySelector('._ap2Card[data-id="apo1"]'))), 'PM: the card is gone from his To-Do');
const late = await portal._core.approvalAction({ op: 'approve', id: 'apo1' }, { email: 'sbiffle@grayco-cs.com', role: 'staff', name: 'Sample PM' });
ok(late.status === 409 && SENT.length === 1, 'PM late approve refused (409), still one send');
ok(!OF.errs.length && !PM.errs.length, 'no page errors ' + JSON.stringify(OF.errs.concat(PM.errs).slice(0, 3)));
await PM.b.close(); await OF.b.close();
console.log('APOFFICE probe: ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
