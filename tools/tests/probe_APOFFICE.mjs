// probe_APOFFICE.mjs <worktree> — DEMO data only, fully offline (patch APOFFICE + APOFFICE2). A PM-step customer approval is the PM's;
// for the office it is OPTIONAL — not in her list / counts / To-Do cards, but under 📋 Approvals → "👷 PM approvals (N)";
// she approves it from that button; the real portal.js approvalAction (run here in node against the harness's
// in-memory gc_kv) sends it ONCE (Resend is faked); the PM's card is gone; the PM's late approve is refused.
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
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
cset('gc_sub_approvals', [{ id: 'SA1', invId: 'SA1', status: 'pending_pm', pmName: 'Sample PM', subName: 'Demo Cabinets LLC', amount: 2400, pid: 'P1', at: new Date().toISOString(), createdAt: Date.now() }]);   /* a fresh one (1 h old would do): still the PM's */
const now = new Date().toISOString();
cset('gc_approval_queue', JSON.stringify([{ id: 'apo1', kind: 'portal_link', title: 'Portal link — Demo Kitchen Remodel', jobId: 'P1', jobName: 'Demo Kitchen Remodel', pm: 'Sample PM', pmEmail: 'sbiffle@grayco-cs.com',
  channel: 'email', to: 'homeowner@example.test', subject: 'Your project page', html: '<p>Hi</p>', text: 'Hi', attachments: [], steps: ['pm'], step: 'pm', approvals: [], status: 'waiting', createdAt: now, updatedAt: now, meta: {} },
  { id: 'apo2', kind: 'thank_you', title: 'Thank-you e-mail — Demo Bath Refresh', jobId: 'P3', jobName: 'Demo Bath Refresh', pm: 'Sample PM', pmEmail: 'sbiffle@grayco-cs.com', channel: 'email', to: 'owner@example.test',
    subject: 'Thank you', html: '<p>Thanks</p>', text: 'Thanks', attachments: [], steps: ['pm', 'admin'], step: 'admin', escalated: true, adminSince: '2026-10-20T00:00:00Z',
    approvals: [{ step: 'pm', by: 'Sample PM', role: 'pm', at: '2026-10-20T00:00:00Z' }], status: 'waiting', createdAt: '2026-10-19T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z', meta: {} }]));

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
const SHOTS = '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/shots/apoffice';
fs.mkdirSync(SHOTS, { recursive: true });
const shot = async (c, n) => { try { await c.page().screenshot({ path: SHOTS + '/' + n + '.png', fullPage: false }); } catch (e) { console.log('shot', e.message); } };
await sleep(1500);
ok((await waitFor(PM, () => { var a = window._gcCustApprovals && window._gcCustApprovals(); return a && a.mine.some(x => x.id === 'apo1'); }, null, 30000)), 'PM: the item is waiting on him');
const ofRow = await waitFor(OF, () => window._gcAPX && window._gcAPX.rows().filter(r => r.key === 'ap2:apo1')[0], null, 30000);
ok(ofRow && ofRow.pmOpt && !ofRow.mine && ofRow.approve && /PM Sample PM or the office/.test(ofRow.waits), 'office: the PM-step item is an OPTIONAL row (pmOpt, not mine, can approve) — "' + (ofRow && ofRow.waits) + '"');
ok(await OF.ev(() => !window._gcCustApprovals().mine.some(x => x.id === 'apo1')), 'office: not in her own "waiting on me" list / To-Do cards');
ok(await OF.ev(() => { var g = window._gcApprovalSet().groups; return !g.email.some(e => e.id === 'ap2:apo1') && !g.subinv.length; }), 'office: not in her approval count (badge / To-Do chip); the fresh PM sub invoice is not either');
ok(await OF.ev(() => window._gcCustApprovals().mine.some(x => x.id === 'apo2') && window._gcApprovalSet().groups.email.some(e => e.id === 'ap2:apo2')), 'office: her own (escalated admin-step) approval IS in her list and count');
ok(await OF.ev(() => window._gcAPX.rows().some(r => r.src === 'sub' && r.pmOpt) && window._gcAPX.rows().some(r => r.src === 'mat' && r.pmOpt)), 'office: the PM\'s sub invoice and the material request are optional rows too');
ok(!(await PM.ev(() => window._gcAPX.rows().some(r => r.pmOpt))), 'PM: no optional rows (sees what he saw before)');
await OF.ev(() => window._setView && window._setView('todo')); await PM.ev(() => window._setView && window._setView('todo'));
const pinLink = await waitFor(OF, () => { var b = document.querySelector('[data-apx-pmopt]'); return b ? b.innerText : null; }, null, 30000);
ok(pinLink && /PM approvals \(\d+\)/.test(pinLink), 'office To-Do: one-line link "' + pinLink + '"');
ok(!(await OF.ev(() => !!document.querySelector('._ap2Card[data-id="apo1"]'))), 'office To-Do: no card for the PM-step item');
/* the PM's To-Do: a card (older builds) or — rc-r13 (patch TODONOAPPR) — the one "N approvals waiting" line counting it, the item on his 📋 Approvals */
const pmTodo = await waitFor(PM, () => { if (document.querySelector('._ap2Card[data-id="apo1"]')) return 'card'; var l = document.querySelector('.apx-pin-1[data-apx-go]'); var mine = window._gcAPX && window._gcAPX.rows().some(r => r.key === 'ap2:apo1' && r.mine); return l && /\d+ approvals? waiting/.test(l.innerText) && mine ? 'line: ' + l.innerText.trim() : null; }, null, 30000);
ok(!!pmTodo, 'PM To-Do shows his approval (' + pmTodo + ')');
ok(!(await PM.ev(() => !!document.querySelector('[data-apx-pmopt]'))), 'PM To-Do: no 👷 link');
await shot(OF, '1_office_todo');
await OF.page().locator('[data-apx-pmopt]').first().click({ timeout: 5000 }).catch(e => console.log('click link', e.message)); await sleep(2500);
ok(await OF.ev(() => !!document.querySelector('.apx-chip.pmopt.on') && [...document.querySelectorAll('.apx-list .apx-row')].some(e => e.getAttribute('data-k') === 'ap2:apo1')), 'office: the To-Do link opens 📋 Approvals on the 👷 button');
await OF.ev(() => window._gcAPX.open('')); await sleep(2500);
const main = await OF.ev(() => ({ rows: [...document.querySelectorAll('.apx-list .apx-row')].map(e => e.getAttribute('data-k')), chip: (document.querySelector('.apx-chip.pmopt') || {}).innerText || '' }));
ok(main.rows.includes('ap2:apo2') && !main.rows.includes('ap2:apo1') && /PM approvals/.test(main.chip), '📋 Approvals (office): her own first, PM-step item not in the main list; button "' + main.chip.replace(/\s+/g, ' ') + '"');
await shot(OF, '2_office_approvals_main');
await OF.page().locator('.apx-chip.pmopt').first().click(); await sleep(1500);
const po = await OF.ev(() => [...document.querySelectorAll('.apx-list .apx-row')].map(e => e.getAttribute('data-k')));
ok(po.includes('ap2:apo1') && !po.includes('ap2:apo2'), 'the 👷 button opens the PM approvals: ' + JSON.stringify(po));
await shot(OF, '3_office_pm_approvals');
await OF.page().locator('[data-apx-act="tab|ap2:apo1|approve"]').first().click({ timeout: 10000 }).catch(e => console.log('click', e.message));
await sleep(600);
await OF.page().locator('[data-apx-conf="yes"][data-k="ap2:apo1"]').first().click({ timeout: 5000 }).catch(() => {});
for (let i = 0; i < 30 && SENT.length < 1; i++) await sleep(500);
await sleep(2500);
await shot(OF, '4_office_after_approve');
const q = JSON.parse(cget('gc_approval_queue')).find(x => x.id === 'apo1');
ok(q.status === 'sent' && q.approvals.length === 1 && q.approvals[0].role === 'office', 'office approved it from the button: sent, recorded as office (' + q.status + ', ' + (q.approvals[0] || {}).role + ')');
ok(SENT.length === 1 && SENT[0].to[0] === 'homeowner@example.test', 'sent ONCE (faked Resend): ' + SENT.length);
await PM.ev(() => window._gcApprovalsRefresh && window._gcApprovalsRefresh()); await sleep(2500);
ok(await PM.ev(() => !window._gcCustApprovals().mine.some(x => x.id === 'apo1')), 'PM: gone from his list');
await PM.ev(() => { window.__GC_REFRESH_UI__ && window.__GC_REFRESH_UI__(); }); await sleep(7000);
ok(!(await PM.ev(() => !!document.querySelector('._ap2Card[data-id="apo1"]') || (window._gcAPX && window._gcAPX.rows().some(r => r.key === 'ap2:apo1' && r.mine)))), 'PM: gone from his To-Do / 📋 Approvals');
const late = await portal._core.approvalAction({ op: 'approve', id: 'apo1' }, { email: 'sbiffle@grayco-cs.com', role: 'staff', name: 'Sample PM' });
ok(late.status === 409 && SENT.length === 1, 'PM late approve refused (409), still one send');
ok(!OF.errs.length && !PM.errs.length, 'no page errors ' + JSON.stringify(OF.errs.concat(PM.errs).slice(0, 3)));
await PM.b.close(); await OF.b.close();
console.log('APOFFICE probe: ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
