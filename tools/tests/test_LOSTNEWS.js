// tools/tests/test_LOSTNEWS.js — patch LOSTNEWS: lost leads stay on GrayCo News until they unsubscribe (_lib/lostnews.js,
// _lib/news.js everyone/subscribers, _lib/mkt.js audienceFor → every campaign, _lib/winback.js). Node only, mocked.
// Run: node tools/tests/test_LOSTNEWS.js
'use strict';
const path = require('path'), assert = require('assert');
const mock = require('./autofix_mock.cjs').install();
const FN = path.resolve(__dirname, '../../netlify/functions');
const LN = require(path.join(FN, '_lib/lostnews.js'));
const NEWS = require(path.join(FN, '_lib/news.js'));
const MKT = require(path.join(FN, '_lib/mkt.js'));
const WB = require(path.join(FN, '_lib/winback.js'));
let pass = 0, fail = 0;
async function t(name, f){ try { await f(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + String(e && e.stack || e).split('\n').slice(0, 3).join('\n      ')); } }
const L = (id, o) => Object.assign({ id, name: id, stage: 'Lost', email: id.toLowerCase() + '@example.com', contactName: 'Pat ' + id, lostAt: '2026-04-20T00:00:00Z' }, o || {});
const LEADS = [
  L('A'),                                                            /* plain lost homeowner → ON */
  L('B', { lostReason: 'went with another contractor' }),           /* ON */
  L('C', { stage: 'New Lead' }),                                     /* not lost */
  L('D', { lostReason: 'Spam' }),
  L('E', { lostReason: 'not a real lead' }),
  L('F', { lostReason: 'wrong number' }),
  L('G', { lostReason: 'vendor / sales pitch' }),
  L('H', { lostReason: 'Not construction (auto)' }),
  L('I', { type: 'Commercial', bidStatus: 'lost', source: 'PlanHub' }), /* bid-board GC contact */
  L('J', { type: 'Commercial', bidStatus: 'lost', source: 'PlanHub', newsOptIn: true }), /* opted in → ON */
  L('K', { doNotContact: true }),
  L('M', { newsOff: true }),
  L('N', { phone: '(901) 555-0177' }),                               /* texted STOP */
  L('O', { email: '' })
];
const OPT = { optout: { '9015550177': '2026-10-01T00:00:00Z' } };

(async function(){
  console.log('LOSTNEWS — lost leads on GrayCo News until they unsubscribe');
  await t('membership: plain lost leads (and an opted-in bid contact) are ON; every exclusion is OFF with its reason', async () => {
    assert.deepStrictEqual(LN.members(LEADS, OPT).map(m => m.leadId).sort(), ['A', 'B', 'J']);
    const why = id => LN.why(LEADS.find(l => l.id === id), OPT);
    assert.strictEqual(why('C'), 'not lost');
    ['D', 'E', 'F', 'G', 'H'].forEach(id => assert.ok(/spam/.test(why(id)), id + ': ' + why(id)));
    assert.ok(/bid-board/.test(why('I'))); assert.ok(/asked not/.test(why('K'))); assert.ok(/taken off/.test(why('M'))); assert.ok(/STOP/.test(why('N'))); assert.strictEqual(why('O'), 'no e-mail');
  });
  await t('news.everyone: lost leads join the customers; asked-not-to-contact / taken off / STOP are kept off even with a customer record', async () => {
    const data = { customers: [{ name: 'Cust', email: 'cust@example.com' }, { name: 'K again', email: 'k@example.com' }], projects: [], leads: LEADS, smsOptout: OPT.optout };
    const e = NEWS.everyone(data).map(x => x.email).sort();
    assert.deepStrictEqual(e, ['a@example.com', 'b@example.com', 'cust@example.com', 'j@example.com']);
    assert.strictEqual(NEWS.everyone(data).find(x => x.email === 'a@example.com').from, 'lost lead');
  });
  await t('news.subscribers: an unsubscribed lost lead (gc_news_suppress) is left out', async () => {
    mock.reset(); mock.T.gc_news_suppress = [{ email: 'a@example.com', unsubscribed: true }];
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (u, o) => /gc_news_suppress/.test(String(u)) ? { ok: true, status: 200, json: async () => [{ email: 'a@example.com', unsubscribed: true }], text: async () => '[{"email":"a@example.com","unsubscribed":true}]' } : origFetch(u, o);
    try { const s = await NEWS.subscribers({ customers: [], projects: [], leads: LEADS, smsOptout: OPT.optout }); assert.deepStrictEqual(s.map(x => x.email).sort(), ['b@example.com', 'j@example.com']); }
    finally { globalThis.fetch = origFetch; }
  });
  await t('every campaign audience (mkt audienceFor, "all"): lost leads in; exclusions out; the leads are loaded when the caller did not', async () => {
    mock.reset(); mock.set('gc_kv', 'leads', LEADS); mock.set('gc_lead_inbox_kv', 'gc_sms_state', { optout: OPT.optout });
    const a = await MKT.audienceFor({ aud: { type: 'all' } }, { customers: [], projects: [], newsSignups: [] });
    assert.deepStrictEqual(a.send.map(c => c.email).sort(), ['a@example.com', 'b@example.com', 'j@example.com']);
  });
  await t('win-back check-ins follow the same rules (taken off / STOP / spam never get one)', async () => {
    const t0 = Date.parse('2026-10-25T15:00:00Z');   /* ~6 months after lostAt */
    const due = WB.due({ leads: LEADS, customers: [], projects: [], smsOptout: OPT.optout }, { done: {} }, t0).map(x => x.leadId).sort();
    assert.deepStrictEqual(due, ['A', 'B'], JSON.stringify(due));   /* J is a bid contact: win-back never mails bid contacts */
  });
  await t('the CRM page uses the same file (patch_LOSTNEWS.py pastes _lib/lostnews.js)', async () => {
    const fs = require('fs'), page = fs.readFileSync(path.resolve(FN, '../../index.html'), 'utf8'), lib = fs.readFileSync(path.join(FN, '_lib/lostnews.js'), 'utf8').trim();
    assert.ok(page.indexOf(lib) >= 0, 'index.html carries the current _lib/lostnews.js'); assert.strictEqual((page.match(/W\._gcLostNews \? W\._gcLostNews\.row\(l\)/g) || []).length, 2);
  });
  console.log((fail ? '✗ ' : '✓ ') + 'LOSTNEWS ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})();
