/* patch DUENAG tests: node tools/tests/test_DUENAG.js — the "no due date yet" e-mail: new bids only, once per bid, mornings only */
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
const at = (ymd, hm) => Date.parse(ymd + 'T' + hm + ':00-06:00');   /* Central (CST) wall time */
(async () => {
  const fresh = { id: 'L1', name: 'VMF Refurb- 210 E Vine St., Paragould, Ar', source: 'BuildingConnected', gc: 'JC Curtis Construction Company, LLC', leadKind: 'Commercial', inboxId: 'IB1', pm: 'Wesley Johnson', pmEmail: 'wjohnson@grayco-cs.com', createdAt: '2026-11-02T15:00:00Z' };
  const old = Object.assign({}, fresh, { id: 'L2', name: 'Old plan room bid', createdAt: '2026-08-01T15:00:00Z' });
  const lost = Object.assign({}, fresh, { id: 'L3', name: 'Lost one', stage: 'Lost' });
  const arch = Object.assign({}, fresh, { id: 'L4', name: 'Archived one', archived: true });
  let r = rig(); await r.A.loadPeople([]);
  let o = await r.A.nag({ leads: [fresh, old, lost, arch] }, at('2026-11-04', '22:00'));
  assert.strictEqual(r.sent.length, 0, 'no e-mail at 10 PM'); assert.ok(o.notNow);
  o = await r.A.nag({ leads: [fresh, old, lost, arch] }, at('2026-11-07', '08:00'));
  assert.strictEqual(r.sent.length, 0, 'no e-mail on a Saturday');
  o = await r.A.nag({ leads: [fresh, old, lost, arch] }, at('2026-11-04', '07:30'));
  assert.strictEqual(r.sent.length, 1, 'one morning e-mail');
  const m = r.sent[0];
  assert.ok(/This bid has no due date yet: VMF Refurb/.test(m.subject), m.subject);
  assert.ok(/invited by JC Curtis Construction Company, LLC on BuildingConnected/.test(m.text), m.text);
  assert.ok(/archive it if you're not bidding/.test(m.text));
  assert.ok(!/Old plan room bid|Lost one|Archived one/.test(m.text), 'old / lost / archived bids left out');
  o = await r.A.nag({ leads: [Object.assign({}, fresh, { pm: 'Nick Thomas', pmEmail: 'nthomas@grayco-cs.com' })] }, at('2026-11-05', '07:30'));
  assert.strictEqual(r.sent.length, 1, 're-assigned: not sent again');
  o = await r.A.nag({ leads: [fresh] }, at('2026-11-06', '08:00'));
  assert.strictEqual(r.sent.length, 1, 'next morning: not sent again (once per bid)');
  console.log('DUENAG tests: all passed');
})().catch(e => { console.error(e); process.exit(1); });
