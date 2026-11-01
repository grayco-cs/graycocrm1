// test_FIELDCALL_fn.mjs — 📞 "From the GrayCo number" (patch FIELDCALL) with a FAKE Twilio: texts.js?fieldcall=1 (status +
// start the bridge), the rules (who, which numbers, data-entry mode, not set up), and missed-call.js?event=fcall (the TwiML
// that connects the customer with the GrayCo number as caller ID, only with a valid Twilio signature). No network.
// Usage: node tools/tests/test_FIELDCALL_fn.mjs   (from the repo root)
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const FN = p => path.join(ROOT, 'netlify/functions', p);
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); } };
Object.assign(process.env, { TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok123', TWILIO_FROM: '+19015550900', CRM_URL: 'https://crm.grayco-cs.com' });
const DATA = {
  users: [{ name: 'Sample PM', email: 'pm@grayco-cs.com', phone: '901-555-0111', active: true }, { name: 'Other PM', email: 'other@grayco-cs.com', phone: '9015550222', active: true }, { name: 'No Cell', email: 'nocell@grayco-cs.com', active: true }],
  projects: [{ id: 'P1', name: 'Demo Kitchen', pm: 'Sample PM', client: 'Sample Homeowner', clientPhone: '(901) 555-1234' }, { id: 'P2', name: 'No Phone Job', pm: 'Sample PM', client: 'X' }]
};
let WHO = { ok: true, email: 'pm@grayco-cs.com', name: '', admin: false, office: false };
let PAUSED = false;
require(FN('bid-inbox.js'))._test.staffAuth = async () => WHO;
require(FN('portal.js'))._core.kvRead = async keys => { const o = {}; keys.forEach(k => { o[k] = DATA[k]; }); return o; };
require(FN('_lib/pause.js')).isPaused = async () => PAUSED;
const texts = require(FN('texts.js'));
const calls = [];
texts._fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 201, json: async () => ({ sid: 'CA' + calls.length }) }; };
const ev = (m, body) => ({ httpMethod: m, queryStringParameters: { fieldcall: '1' }, headers: { origin: 'https://crm.grayco-cs.com', authorization: 'Bearer x' }, body: body ? JSON.stringify(body) : '' });
const run = async (m, body) => { const r = await texts.handler(ev(m, body)); return { code: r.statusCode, body: JSON.parse(r.body) }; };

let r = await run('GET');
ok(r.code === 200 && r.body.ready === true && r.body.myPhone === '(901) 555-0111' && !r.body.why, 'status: Twilio ready, my cell on file, nothing in the way', r);
r = await run('POST', { pid: 'P1' });
const c = calls[0] || {}, form = new URLSearchParams(c.opts ? c.opts.body : '');
ok(r.code === 200 && r.body.ok && /Calls\.json$/.test(c.url) && form.get('To') === '+19015550111' && form.get('From') === '+19015550900', 'the PM\'s call: Twilio rings HIS cell first, from the GrayCo number', { r, url: c.url, to: form.get('To'), from: form.get('From') });
const hook = new URL(form.get('Url') || 'https://x/');
ok(hook.pathname === '/.netlify/functions/missed-call' && hook.searchParams.get('event') === 'fcall' && hook.searchParams.get('to') === '9015551234', 'when he answers, Twilio asks missed-call.js?event=fcall to connect the JOB\'s customer number (from the job, not the page)', form.get('Url'));
ok(/^Basic /.test(c.opts.headers.Authorization), 'Twilio is called with the account\'s own credentials');
// rules
WHO = { ok: true, email: 'other@grayco-cs.com', name: '', admin: false, office: false };
r = await run('POST', { pid: 'P1' }); ok(r.code === 403 && calls.length === 1, 'another PM cannot call this job\'s customer (no call placed)', r);
WHO = { ok: true, email: 'other@grayco-cs.com', name: '', admin: false, office: true };
r = await run('POST', { pid: 'P1' }); ok(r.code === 200 && calls.length === 2 && new URLSearchParams(calls[1].opts.body).get('To') === '+19015550222', 'the office can, and the call rings the office person\'s own cell', r);
WHO = { ok: true, email: 'nocell@grayco-cs.com', name: '', admin: true, office: false };
r = await run('POST', { pid: 'P1' }); ok(r.code === 409 && /My profile/.test(r.body.error) && calls.length === 2, 'no cell on file → "Add your cell in My profile", no call', r);
r = await run('GET'); ok(/My profile/.test(r.body.why), 'status says why for a person with no cell', r.body);
WHO = { ok: true, email: 'pm@grayco-cs.com', name: '', admin: false, office: false };
r = await run('POST', { pid: 'P2' }); ok(r.code === 409 && /no phone/.test(r.body.error), 'a job with no customer phone → says so, no call', r);
r = await run('POST', { pid: 'NOPE' }); ok(r.code === 404, 'an unknown job → 404', r);
PAUSED = true; r = await run('POST', { pid: 'P1' }); ok(r.code === 409 && /Data-entry/.test(r.body.error) && calls.length === 2, 'data-entry mode on → no call', r);
r = await run('GET'); ok(/Data-entry/.test(r.body.why), 'status says data-entry mode', r.body); PAUSED = false;
const keep = process.env.TWILIO_AUTH_TOKEN; delete process.env.TWILIO_AUTH_TOKEN;
r = await run('POST', { pid: 'P1' }); ok(r.code === 503 && r.body.setup && calls.length === 2, 'Twilio not set up → refused with the reason', r);
r = await run('GET'); ok(r.body.ready === false && /Twilio set up/.test(r.body.why), 'status: not set up, with the reason', r.body);
process.env.TWILIO_AUTH_TOKEN = keep;
// the webhook
const mc = require(FN('missed-call.js'));
const crypto = require('crypto');
const qs = { event: 'fcall', to: '9015551234', pid: 'P1' };
const url = 'https://crm.grayco-cs.com/.netlify/functions/missed-call?' + Object.keys(qs).map(k => k + '=' + encodeURIComponent(qs[k])).join('&');
const p = { CallSid: 'CA1', From: '+19015550900', To: '+19015550111' };
const sig = mc._test.sigFor(url, p, 'tok123');
const body = new URLSearchParams(p).toString();
let w = await mc.handler({ httpMethod: 'POST', queryStringParameters: qs, headers: { 'x-twilio-signature': sig, 'content-type': 'application/x-www-form-urlencoded' }, body, rawUrl: url });
ok(w.statusCode === 200 && /<Dial callerId="\+19015550900"[^>]*><Number>\+19015551234<\/Number><\/Dial>/.test(w.body), 'answered → <Dial callerId=GrayCo number> the customer', w.body);
w = await mc.handler({ httpMethod: 'POST', queryStringParameters: Object.assign({}, qs, { to: '9015559999' }), headers: { 'x-twilio-signature': sig }, body, rawUrl: url.replace('5551234', '5559999') });
ok(w.statusCode === 403 && !/Dial/.test(w.body), 'a changed number (signature no longer matches) is refused', w.statusCode);
const FC = require(FN('_lib/fieldcall.js'));
ok(/Hangup/.test(FC.twiml('12', '9015550900')) && !/Dial/.test(FC.twiml('12', '9015550900')), 'a bad number never dials');
console.log(`FIELDCALL_fn ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
