/* patch BIDMERGE tests: node tools/tests/test_BIDMERGE.mjs [repo dir] [mirror.json]
   One project, many invitations → ONE lead, ONE alert, every GC and trade on it.
     1. the server, end to end (the leads@ webhook's slow half: Resend's receiving API, the AI's answer, gc_lead_inbox, the
        admins' alert e-mail — all mocked at fetch()): 11 realistic invitation e-mails for "UrgentVet - Memphis" from 2 GCs
        across 9 trades (BuildingConnected per-trade invites, a reminder, the PlanHub copy, the GC's BuildingConnected copy)
        → 1 inbox item, exactly 1 new-lead e-mail, the GC / trade list right, quiet "+1 GC" history;
     2. two different projects from the same GC stay two leads (and two alerts);
     3. a later invitation with an EARLIER bid due → one "📅 moved sooner" note, never twice; later dues → nothing;
     4. SALESBLOCK: a pitch is never folded in; a portal / website lead matches only by its own id;
     5. the inbox's merged / unmerge actions (the merge tool's undo on the server);
     6. the CRM page: the hooks, the rules copied verbatim, the merge tool's dry run → apply → Recently deleted → undo;
     7. the real-data mirror: how many duplicate groups exist today (read only). */
import { createRequire } from 'module';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const FN = path.join(ROOT, 'netlify/functions');
const MIRRORS = [process.argv[3], process.env.MIRROR, '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wUPG/mirror/rows.json',
  '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json'].filter(Boolean);

let passed = 0, failed = 0;
async function t(name, fn){ try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n' + (e && e.stack || e)); } }

Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', RESEND_API_KEY: 're_test', ANTHROPIC_API_KEY: 'sk-test', BID_INBOUND_SECRET: 'handoff-test',
  PLANS_FETCH: '0', BID_PORTAL_DRAFTS: '0', ONCALL_OFF: '1', EMERG_OFF: '1' });
const BM = require(FN + '/_lib/bid-merge.js');
const BI = require(FN + '/bid-inbox.js');
const LEAD_TOOL = BI._lib.LEAD_TOOL || { name: 'record_bid_leads' };

/* ── the fake world behind fetch() ── */
function world(mails){
  const tables = { gc_kv: {}, gc_lead_inbox_kv: {} }, byId = {}, sent = [], calls = [];
  mails.forEach(m => { byId[m.id] = m; });
  const put = (T, k, v) => { tables[T][k] = { key: k, value: v, updated_at: new Date(Date.now() + Math.random()).toISOString() }; };
  put('gc_kv', 'users', JSON.stringify([{ name: 'Glenn Miller', email: 'gmiller@grayco-cs.com', role: 'Estimator', active: true }]));
  const res = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => (typeof body === 'string' ? JSON.parse(body || 'null') : body), text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), arrayBuffer: async () => new ArrayBuffer(0) });
  const fetchImpl = async (u, o) => {
    o = o || {}; const m = (o.method || 'GET').toUpperCase(); u = String(u); calls.push(m + ' ' + u);
    let mm;
    if ((mm = /api\.resend\.com\/emails\/receiving\/([^/?]+)\/attachments/.exec(u))) return res(200, { object: 'list', data: [] });
    if ((mm = /api\.resend\.com\/emails\/receiving\/([^/?]+)$/.exec(u))) { const x = byId[decodeURIComponent(mm[1])]; if (!x) return res(404, {}); return res(200, { object: 'email', id: x.id, created_at: x.at || '2026-11-02T15:00:00.000Z', from: (x.fromName ? x.fromName + ' ' : '') + '<' + x.from + '>', to: ['leads@in.grayco-cs.com'], cc: [], subject: x.subject, text: x.text, html: '', headers: {}, attachments: [] }); }
    if (/api\.resend\.com\/emails$/.test(u) && m === 'POST') { const b = JSON.parse(o.body); sent.push(b); return res(200, { id: 'sent_' + sent.length }); }
    if (/api\.anthropic\.com\/v1\/messages/.test(u)) {
      const b = JSON.parse(o.body), txt = b.messages[0].content.map(c => c.text || '').join('\n'), sub = (/\nSubject: (.*)\n/.exec(txt) || [])[1];
      const x = mails.find(y => y.subject === sub && txt.includes(y.text.slice(0, 120))); if (!x) return res(500, {});
      return res(200, { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: LEAD_TOOL.name, input: x.ai }] });
    }
    if (/\/storage\/v1\/object\//.test(u)) return res(200, { Key: 'x' });
    mm = /\/rest\/v1\/([a-z_]+)\?(.*)$/.exec(u) || /\/rest\/v1\/([a-z_]+)$/.exec(u);
    if (mm && tables[mm[1]]) {
      const T = mm[1], q = new URLSearchParams(mm[2] || '');
      if (m === 'GET') { const k = q.get('key') || ''; if (/^eq\./.test(k)) { const r = tables[T][decodeURIComponent(k.slice(3))]; return res(200, r ? [r] : []); } return res(200, Object.values(tables[T]).slice(0, 1)); }
      if (m === 'POST') { const b = JSON.parse(o.body); put(T, b.key, b.value); return res(201, ''); }
      if (m === 'PATCH') { const k = decodeURIComponent((q.get('key') || '').slice(3)), at = decodeURIComponent((q.get('updated_at') || '').slice(3)); const r = tables[T][k]; if (!r || r.updated_at !== at) return res(200, []); put(T, k, JSON.parse(o.body).value); return res(200, [tables[T][k]]); }
    }
    if (mm) return res(200, []);
    return res(404, 'no route');
  };
  const kv = k => { for (const T of ['gc_lead_inbox_kv', 'gc_kv']) { const r = tables[T][k]; if (r) return typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } return null; };
  return { tables, sent, calls, fetchImpl, kv, mails, byId };
}

const PASTE = 'From: Summit GC Estimating <estimating@summitgc.net>\nSubject: Invitation to Bid - Collierville Library Renovation\n\nSummit General Contractors invites you to bid the Collierville Library Renovation, 91 Walnut St, Collierville TN 38017.\nTrades: Drywall, Painting, Flooring.\nBids due Nov 20, 2026 at 2:00 PM.\nPlans: https://summitgc.net/bids/collierville-library';
const AI = { kind: 'gc_direct', leads: [{ project_name: 'Collierville Library Renovation', address: '91 Walnut St', city: 'Collierville', state: 'TN', zip: '38017', trades: ['Drywall', 'Painting', 'Flooring'], bid_due_date: '2026-11-20', bid_due_time: '14:00',
  gc_name: 'Summit General Contractors', submit_to_company: 'Summit General Contractors', contact_name: 'Summit GC Estimating', contact_email: 'estimating@summitgc.net', source_board: 'GC direct', scope_summary: 'Library renovation.' }] };
const mailOf = () => ({ id: 'paste_x', from: { email: 'estimating@summitgc.net', name: 'Summit GC Estimating' }, to: [], cc: [], subject: 'Invitation to Bid - Collierville Library Renovation', text: PASTE, html: '', date: new Date().toISOString(), files: [], skipped: [], headers: {}, messageId: '' });
async function run(W, fn){ const of = globalThis.fetch; globalThis.fetch = W.fetchImpl; const ol = console.log, ow = console.warn, oe = console.error; console.log = console.warn = console.error = () => {};
  try { BI._test.resetKvTable(); return await fn(); } finally { globalThis.fetch = of; console.log = ol; console.warn = ow; console.error = oe; } }
await t('a pasted GC e-mail (estimating@summitgc.net) becomes ONE lead with the GC, trades and bid due', async () => {
  const W = world([{ id: 'paste_x', subject: 'Invitation to Bid - Collierville Library Renovation', text: PASTE, ai: AI }]);
  const r = await run(W, () => BI._test.bidPath(mailOf(), { inline: true }));
  assert.strictEqual(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  const L = (W.kv('gc_lead_inbox') || []).filter(x => x && !x.stub);
  assert.strictEqual(L.length, 1, JSON.stringify(L.map(x => x.title)));
  assert.ok(/Collierville Library/i.test(L[0].title) && /2026-11-20/.test(L[0].bidDue || '') , JSON.stringify(L[0]).slice(0, 400));
  const again = await run(W, () => BI._test.bidPath(Object.assign(mailOf(), { id: 'paste_y' }), { inline: true }));
  const L2 = (W.kv('gc_lead_inbox') || []).filter(x => x && !x.stub && x.status !== 'merged');
  assert.strictEqual(L2.length, 1, 'pasting it again joins the same lead');
});
await t('not staff → refused', async () => {
  const r = await BI.handler({ httpMethod: 'POST', queryStringParameters: { pastelead: '1' }, headers: {}, body: JSON.stringify({ text: 'x' }) });
  assert.ok(r.statusCode === 401 || r.statusCode === 403, String(r.statusCode));
});
console.log('LEADPASTE: ' + passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
