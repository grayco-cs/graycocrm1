// test_EMQ.js — owner 11/11: emergency texts — the insurance / adjuster / access questions go only AFTER we answered ("we're
// dispatching"), then when the customer texts back or ~15 minutes later, once. Fake store, fake Twilio.
const SA = require('../../netlify/functions/_lib/smsalert.js');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
const kv = {}, sent = []; let t = Date.parse('2026-11-11T03:00:00Z'), paused = false;   /* 9 PM Central: an emergency still goes */
Object.assign(SA._D, { now: () => t, kvGet: async k => kv[k], kvCas: async (k, f) => { const nv = f(kv[k] == null ? null : JSON.parse(JSON.stringify(kv[k]))); if (nv !== undefined) kv[k] = nv; return { ok: true }; },
  send: async (to, body) => { sent.push({ to, body }); return { ok: true }; }, paused: async () => paused, optouts: async () => ({}), consentNo: async () => false, textLog: async () => ({ ok: true }) });
(async () => {
  const A = '9015550101', B = '9015550102', C = '9015550103';
  let r = await SA.emqOnCustomer(A);
  ok('before we answered: the customer texting more sends NO questions', !r && !sent.length, { r, sent });
  ok('our first reply to the emergency arms the questions (none sent yet)', await SA.emqArm(A, { leadId: 'L1', staff: 'Nick' }) === true && !sent.length);
  ok('a second reply does not re-arm', await SA.emqArm(A, { leadId: 'L1' }) === false);
  r = await SA.emqOnCustomer(A);
  ok('the customer texts back → the questions go (carrier, claim, adjuster, access, water/power off)', r && r.sent && sent.length === 1 && sent[0].to.replace(/\D/g, '').endsWith(A) && /insurance/i.test(sent[0].body) && /adjuster/i.test(sent[0].body) && /gate code|key|lockbox/i.test(sent[0].body) && /shut off/i.test(sent[0].body), sent);
  r = await SA.emqOnCustomer(A);
  ok('only once per emergency', !r && sent.length === 1);
  await SA.emqArm(B, { leadId: 'L2' });
  t += 10 * 60 * 1000; r = await SA.emqDue();
  ok('10 minutes after we answered (no reply yet): not yet', r.due === 0 && sent.length === 1, r);
  t += 6 * 60 * 1000; r = await SA.emqDue();
  ok('15+ minutes after we answered: the questions go', r.due === 1 && sent.length === 2 && sent[1].to.replace(/\D/g, '').endsWith(B), r);
  r = await SA.emqDue();
  ok('…and never again', r.due === 0 && sent.length === 2, r);
  r = await SA.emqOnCustomer(C);
  ok('a customer we never answered as an emergency: nothing', !r && sent.length === 2);
  paused = true; await SA.emqArm(C, { leadId: 'L3' }); r = await SA.emqOnCustomer(C);
  ok('data-entry mode: not sent', r && r.notSent && sent.length === 2, r);
  ok('the text fits one message-ish (≤ 320 chars)', SA._emqText().length <= 320, SA._emqText().length);
  const n = R.filter(Boolean).length; console.log('EMQ ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
})();
