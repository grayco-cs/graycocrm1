/* patch ALERTTO tests: node tools/tests/test_alertto.js — mocked fetch / KV */
'use strict';
const assert = require('assert');
const path = require('path');
const BA = require(path.join(__dirname, '../../netlify/functions/_lib/bid-alerts.js'));
const ENV = { RESEND_API_KEY: 'k', OWNER_EMAILS: '', BID_ALERT_TO: '', CRM_URL: 'https://crm.test' };

function rig(opts){
  opts = opts || {};
  const kv = { gc_lead_inbox_settings: opts.settings, users: opts.users || [] };
  const sent = [];
  global.fetch = async (url, init) => { if (/resend/.test(url)) { sent.push(JSON.parse(init.body)); return { ok: true, status: 200 }; } return { ok: false, status: 404, json: async () => [] }; };
  const store = {};
  const sb = async p => {
    const m = /^gc_kv\?select=value&key=eq\.(.+)$/.exec(p);
    if (m) { const k = decodeURIComponent(m[1]); return { ok: true, json: async () => (k in kv && kv[k] !== undefined ? [{ value: kv[k] }] : []) }; }
    if (/^gc_staff/.test(p)) return { ok: true, json: async () => [{ email: 'wjohnson@grayco-cs.com', name: 'Wesley', role: 'admin', active: true }, { email: 'nthomas@grayco-cs.com', name: 'Nick', role: 'admin', active: true }] };
    return { ok: false, json: async () => [] };
  };
  const A = BA.make({ env: k => (ENV[k] != null ? ENV[k] : ''), s: v => (v == null ? '' : String(v).trim()), low: v => (v == null ? '' : String(v).trim().toLowerCase()), arr: v => (Array.isArray(v) ? v : []),
    nowIso: () => new Date().toISOString(), sb, kvGet: async k => store[k], kvCas: async (k, fn) => { const nv = fn(store[k]); if (nv !== undefined) store[k] = nv; return { value: store[k] }; }, now: () => Date.now() });
  return { A, sent };
}
const toOf = sent => sent.map(b => b.to).reduce((a, b) => a.concat(b), []);
(async () => {
  /* 1. BuildingConnected-style bid: one alert, office only */
  let r = rig();
  await r.A.loadPeople([]);
  await r.A.notifyNew([{ id: 'bc1', title: 'Roof at ACME school', source: 'BuildingConnected', type: 'bid', bidDue: '2026-11-05T14:00' }]);
  assert.strictEqual(r.sent.length, 1, 'exactly one e-mail');
  assert.deepStrictEqual(r.sent[0].to, ['office@grayco-cs.com']);
  assert.ok(!toOf(r.sent).some(x => /wjohnson|nthomas/.test(x)));
  /* 2. assigned: the assignee too (same single message) */
  r = rig();
  await r.A.notifyNew([{ id: 'bc2', title: 'Bid for Bob', source: 'PlanHub', type: 'bid', bidDue: '2026-11-05T14:00', pm: 'Pat PM', pmEmail: 'pat@grayco-cs.com' }]);
  assert.deepStrictEqual(r.sent[0].to.slice().sort(), ['office@grayco-cs.com', 'pat@grayco-cs.com']);
  /* 3. setting with two addresses */
  r = rig({ settings: { alertTo: ['leads@grayco-cs.com', 'Office@grayco-cs.com'] } });
  await r.A.notifyNew([{ id: 'bc3', title: 'Another', source: 'BuildingConnected', type: 'bid', bidDue: '2026-11-05T14:00' }]);
  assert.deepStrictEqual(r.sent[0].to.slice().sort(), ['leads@grayco-cs.com', 'office@grayco-cs.com']);
  assert.ok(!toOf(r.sent).some(x => /wjohnson|nthomas/.test(x)));
  /* 4. emergency: on-call + admins + office, unchanged */
  r = rig({ users: [{ name: 'Olive Office', email: 'olive@grayco-cs.com', role: 'Office', active: true }] });
  await r.A.notifyNew([{ id: 'em1', title: 'Roof leaking into kitchen', source: 'Website', origin: 'website', detail: 'water leak emergency, flood', contact: { name: 'Zed', phone: '555' } }]);
  const em = r.sent.filter(b => /EMERGENCY/.test(b.subject));
  assert.strictEqual(em.length, 1, 'emergency e-mail sent');
  ['wjohnson@grayco-cs.com', 'nthomas@grayco-cs.com', 'olive@grayco-cs.com'].forEach(e => assert.ok(em[0].to.includes(e), 'emergency includes ' + e));
  console.log('alertto tests: all passed');
})().catch(e => { console.error(e); process.exit(1); });
