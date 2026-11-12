// test_QAC_pause_fn.mjs — patch QAC (overnight QA, area C): ⏸ Data-entry mode at the lowest level (netlify/functions/_lib/pause.js).
// While gc_automation_pause is { on: true }: nothing leaves for a customer / sub / GC (Resend to an outside address, Twilio texts and
// calls, social posts, QuickBooks writes, unknown hosts) — staff e-mail and reads still go; an unreadable flag counts as PAUSED
// (fail closed); off → everything goes. Node only, a fake fetch underneath (nothing leaves this computer), made-up addresses.
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const FN = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../netlify/functions');
process.env.SUPABASE_URL = 'https://fake-sb.example.test'; process.env.SUPABASE_SERVICE_KEY = 'svc-test-key'; process.env.CUST_QUIET_OFF = '1';
let FLAG = { on: true }, FLAG_STATUS = 200; const OUT = [];
globalThis.fetch = async (url, opts) => {
  const u = String(url && url.url || url);
  if (u.startsWith('https://fake-sb.example.test/rest/v1/gc_kv') && /gc_automation_pause/.test(u)) return new Response(JSON.stringify(FLAG ? [{ value: FLAG }] : []), { status: FLAG_STATUS });
  if (u.startsWith('https://fake-sb.example.test/')) return new Response('[]', { status: 200 });
  OUT.push({ u, m: (opts && opts.method) || 'GET' });
  return new Response(JSON.stringify({ id: 'real-1', sid: 'SMreal' }), { status: 200 });
};
const P = require(FN + '/_lib/pause.js'); P.install();
try { require(FN + '/_lib/staff-mail.js')._t && require(FN + '/_lib/staff-mail.js')._t.set && require(FN + '/_lib/staff-mail.js')._t.set([]); } catch (e) {}
let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); } };
const mail = to => ({ method: 'POST', body: JSON.stringify({ from: 'GrayCo <office@grayco-cs.com>', to, subject: 'Zedd test', html: '<p>hi</p>' }) });
const sent = () => OUT.length;
async function send(url, opts){ const n = sent(); const r = await fetch(url, opts); let j = null; try { j = await r.clone().json(); } catch (e) {} return { went: sent() > n, j, status: r.status }; }

P.reset(); FLAG = { on: true };
let r = await send('https://api.resend.com/emails', mail(['zedd.customer@example.test']));
ok(!r.went && r.j && r.j.paused === true, 'ON: an e-mail to a customer is skipped (answered as sent, paused: true)', r);
r = await send('https://api.resend.com/emails', mail(['wjohnson@grayco-cs.com', 'office@grayco-cs.com']));
ok(r.went, 'ON: an e-mail only to @grayco-cs.com staff still goes', r);
r = await send('https://api.resend.com/emails', mail(['office@grayco-cs.com', 'zedd.sub@example.test']));
ok(!r.went, 'ON: staff + one outside address → skipped', r);
r = await send('https://api.resend.com/emails/batch', { method: 'POST', body: JSON.stringify([{ to: ['zedd.a@example.test'] }, { to: ['zedd.b@example.test'] }]) });
ok(!r.went && Array.isArray(r.j && r.j.data) && r.j.data.length === 2, 'ON: a batch of customer e-mails is skipped (one fake id each)', r);
r = await send('https://api.twilio.com/2010-04-01/Accounts/AC0/Messages.json', { method: 'POST', body: 'To=%2B19015550100&Body=hi' });
ok(!r.went && r.status === 201, 'ON: a text is skipped', r);
r = await send('https://api.twilio.com/2010-04-01/Accounts/AC0/Calls.json', { method: 'POST', body: 'To=%2B19015550100' });
ok(!r.went, 'ON: a phone call is skipped', r);
r = await send('https://graph.facebook.com/v19.0/123/feed', { method: 'POST', body: '{}' });
ok(!r.went, 'ON: a Facebook post is skipped', r);
r = await send('https://quickbooks.api.intuit.com/v3/company/1/invoice', { method: 'POST', body: '{}' });
ok(!r.went && r.status === 503, 'ON: a QuickBooks write is refused (no fake QuickBooks id)', r);
r = await send('https://unknown-api.example.test/v1/thing', { method: 'POST', body: '{}' });
ok(!r.went && r.status === 503, 'ON: a write to an unknown host is refused (fail safe)', r);
r = await send('https://unknown-api.example.test/v1/thing', { method: 'GET' });
ok(r.went, 'ON: reads go on', r);

P.reset(); FLAG_STATUS = 500;
r = await send('https://api.resend.com/emails', mail(['zedd.customer@example.test']));
ok(!r.went, 'the flag cannot be read (database error) → counts as PAUSED (fail closed)', r);
FLAG_STATUS = 200;

P.reset(); FLAG = { on: false };
r = await send('https://api.resend.com/emails', mail(['zedd.customer@example.test']));
ok(r.went, 'OFF: a customer e-mail goes', r);
r = await send('https://api.twilio.com/2010-04-01/Accounts/AC0/Messages.json', { method: 'POST', body: 'To=%2B19015550100&Body=hi' });
ok(r.went, 'OFF: a text goes', r);
P.reset(); FLAG = null;
r = await send('https://api.resend.com/emails', mail(['zedd.customer@example.test']));
ok(r.went, 'no flag row at all → not paused', r);

/* every function file installs the guard (db-watch texts staff when the database — where the flag lives — is down; gdrive only talks to Google) */
{ const fs = require('fs'); const NOT = { 'db-watch-scheduled.js': 1, 'gdrive.js': 1 };
  const miss = fs.readdirSync(FN).filter(f => /\.js$/.test(f) && !NOT[f]).filter(f => !/require\(['"]\.\/_lib\/pause(\.js)?['"]\)\.install\(\)/.test(fs.readFileSync(path.join(FN, f), 'utf8')));
  ok(!miss.length, 'every function file installs the data-entry guard (except db-watch-scheduled, gdrive)', miss); }
console.log((fail ? 'FAILED ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
