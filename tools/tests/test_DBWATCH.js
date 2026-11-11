// test_DBWATCH.js — patch DBWATCH: down → one text per phone; again within the hour → none; back up → "back up" once. Fake fetch.
process.env.DB_ALERT_PHONES = '(901) 555-0101, 9015550102'; process.env.TWILIO_ACCOUNT_SID = 'ACx'; process.env.TWILIO_AUTH_TOKEN = 'y'; process.env.TWILIO_FROM_ALERTS = '+19015550199'; process.env.SUPABASE_SERVICE_KEY = 'k';
const W = require('../../netlify/functions/db-watch-scheduled.js')._test;
let up = false, sent = [], R = [], t = Date.parse('2026-11-11T13:00:00Z');
W._D.sleep = async () => {}; W._D.now = () => t;
W._D.fetch = async (u, o) => {
  if (/supabase/.test(u)) return { ok: up, status: up ? 200 : 522 };
  if (/Messages\.json\?/.test(u)) { const to = decodeURIComponent(/To=([^&]+)/.exec(u)[1]); return { ok: true, json: async () => ({ messages: sent.filter(m => m.To === to).map(m => ({ body: m.Body, date_sent: new Date(m.at).toUTCString() })).reverse() }) }; }
  if (/Messages\.json$/.test(u)) { const p = new URLSearchParams(o.body); sent.push({ To: p.get('To'), Body: p.get('Body'), at: t }); return { ok: true }; }
  return { ok: false };
};
const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); };
(async () => {
  ok('phones parsed', W.phones().join() === '+19015550101,+19015550102', W.phones());
  let o = await W.run(); ok('down → a text to both', o.texted.length === 2 && sent.every(m => /DOWN/.test(m.Body) && /Restart project/.test(m.Body)), o);
  t += 10 * 60000; o = await W.run(); ok('still down 10 min later → no repeat', o.texted.length === 0, o);
  t += 50 * 60000; o = await W.run(); ok('still down an hour later → a reminder', o.texted.length === 2, o);
  up = true; t += 5 * 60000; o = await W.run(); ok('back up → "back up" text once', o.texted.length === 2 && /back up/.test(sent[sent.length - 1].Body), o);
  t += 5 * 60000; o = await W.run(); ok('healthy after that → nothing', o.texted.length === 0, o);
  const n = R.filter(Boolean).length; console.log('DBWATCH ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
})();
