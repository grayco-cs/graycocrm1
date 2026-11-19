// test_LSARECUI.mjs <build-dir> — LSAREC (owner 11/19: "transcribe these Google LSA leads … phone numbers etc … have the recording for us,
// the voicemail or phone recording from Brittany"): an open Google LSA / missed-call lead shows "🎧 Call" — number, Google's time, call
// length, job type, ▶ Play (audio through the signed-in call-recording function), 🔗 Listen in Google, 📝 Transcribe → the summary; a
// website lead shows nothing; an admin sees what is not set up yet; the office's "📞 LSA calls" check card gets the number filled in.
// Offline harness (call-recording mocked), made-up data.
import { computer, signIn, sleep, cset, resetCloud, onFn } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 500) : '')); };
resetCloud();
const now = new Date().toISOString();
const RS = 'RE' + 'a'.repeat(32);
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
cset('leads', [
  { id: 'LA', inboxId: 'LI-A', name: 'Pat Smith', phone: '', source: 'Google LSA', leadSource: 'Google LSA', lsaCheck: 'pending', lsaCall: true, leadExtra: { leadSource: 'Google LSA', lsaLink: 'https://c.gle/DEMO123', lsaCall: true }, stage: 'New Lead', createdAt: now },
  { id: 'LM', name: 'Caller (901) 555-0500', source: 'Missed call', missedCall: true, leadExtra: { missedCall: true, callSid: 'CA1' }, stage: 'New Lead', createdAt: now, vetAt: now },
  { id: 'LC', name: 'Demo Website', source: 'Website', stage: 'New Lead', createdAt: now }]);
let transcribed = false; const seen = [];
const STATUS = { googleApi: { configured: true, connected: true, customer: true }, twilio: true, transcribe: true, recording: true, voicemail: true, sync: true };
onFn('call-recording', ({ query, method, body }) => {
  seen.push({ q: query, m: method, b: body });
  if (method === 'POST' && query.transcribe) { transcribed = true; return { ok: true, transcript: { summary: 'Pat — roof leak over the kitchen in Bartlett, call back today.' } }; }
  if (query.play) return query.play === RS ? { ok: true, mime: 'audio/mpeg', b64: 'SUQzAwAAAAAAAA==' } : { status: 404, body: { ok: false, error: 'That recording is not on this lead.' } };
  if (query.lead === 'LI-A') return { ok: true, status: STATUS, info: { id: 'LI-A', lsa: true, name: 'Pat Smith', phone: '9015550211', phoneFrom: 'google', callAtLabel: '11/18, 8:21 AM', dur: '2m 14s', job: 'Roofer — roof repair', googleId: '9001', charged: true,
    recs: [{ id: RS, kind: 'call', dur: 134, durLabel: '2m 14s' }], google: { url: 'https://www.google.com/ads/localservices/recording/DEMO' },
    transcript: transcribed ? { summary: 'Pat — roof leak over the kitchen in Bartlett, call back today.', text: 'Hi this is Pat, I have a roof leak over the kitchen.' } : null } };
  if (query.lead === 'LM') return { ok: true, status: Object.assign({}, STATUS, { recording: false, transcribe: false, googleApi: { configured: false, connected: false } }), info: { id: 'LM', lsa: false, phone: '9015550500', outcome: 'missed', recs: [], google: null, transcript: null } };
  return { status: 404, body: { ok: false, error: 'Lead not found.' } };
});
const A = await computer('wjohnson@grayco-cs.com', { build: process.argv[2] });
const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(9000);
await A.ev(() => window._setView('leads')); await sleep(4000);
const box = async (id, wait) => { await A.ev(id => window._gcLeadsHub.open(id), id); await sleep(wait || 2200); return A.ev(() => { const b = document.getElementById('gc-call-rec'); if (!b || b.style.display === 'none') return null;
  return { t: b.innerText, play: !!b.querySelector('[data-rec-play]'), tx: !!b.querySelector('[data-rec-tx]'), g: (b.querySelector('[data-rec-google]') || {}).href || '', target: (b.querySelector('[data-rec-google]') || {}).target || '', afterDispute: !!(b.previousElementSibling && b.previousElementSibling.id === 'gc-lsa-dispute') }; }); };
let b = await box('LA');
ok('an LSA lead: 🎧 Call with the number, Google\'s time, the length and the job type', b && /\(901\) 555-0211/.test(b.t) && /from Google/.test(b.t) && /11\/18, 8:21 AM/.test(b.t) && /2m 14s call/.test(b.t) && /Roofer — roof repair/.test(b.t) && /Google lead 9001 · charged/.test(b.t), b);
ok('▶ Play call, 🔗 Listen in Google (new tab), 📝 Transcribe', b && b.play && /▶ Play call \(2m 14s\)/.test(b.t) && /google\.com\/ads\/localservices\/recording\/DEMO/.test(b.g) && b.target === '_blank' && b.tx, b);
ok('it sits right under the Google LSA bar', b && b.afterDispute, b);
const asked = seen.find(x => x.q.lead === 'LI-A' && !x.q.play);
ok('the box asks the server for the lead\'s inbox id (signed-in function)', !!asked, seen);
await A.ev(() => document.querySelector('#gc-call-rec [data-rec-play]').click()); await sleep(1500);
const au = await A.ev(() => { const a = document.querySelector('#gc-call-rec audio'); return a ? { src: a.getAttribute('src'), controls: a.controls } : null; });
ok('▶ Play → an audio player with the recording (fetched through call-recording, a blob — no Twilio link in the page)', au && /^blob:/.test(au.src) && au.controls && seen.some(x => x.q.play === RS), au);
await A.ev(() => document.querySelector('#gc-call-rec [data-rec-tx]').click()); await sleep(2500);
b = await A.ev(() => { const x = document.getElementById('gc-call-rec'); return x ? { t: x.innerText, tx: !!x.querySelector('[data-rec-tx]'), full: !!x.querySelector('details') } : null; });
ok('📝 Transcribe → the short summary shows (full text under "Full transcript"), the button goes away', b && /roof leak over the kitchen in Bartlett/.test(b.t) && b.full && !b.tx && seen.some(x => x.m === 'POST' && x.q.transcribe && x.b && x.b.lead === 'LI-A'), b);
b = await box('LM');
ok('a missed-call lead: the number + "missed"; an admin sees what is not set up (recording off, no transcription key)', b && /\(901\) 555-0500/.test(b.t) && /missed/.test(b.t) && /Not set up yet: office-line recording is off/.test(b.t) && !b.play && !b.tx, b);
b = await box('LC', 1500);
ok('a website lead: no call box', !b, b);
/* the office check card: the number Google found is filled in */
await A.ev(() => { const x = document.getElementById('gcl-drawer'); const c = x && x.querySelector('[aria-label="Close"],.gcl-x,[data-close]'); if (c) c.click(); }); await sleep(800);
await A.ev(() => window._gcLsaVet && window._gcLsaVet.open()); await sleep(3000);
const vet = await A.ev(() => { const r = document.querySelector('#gc-lsa-vet [data-vet="LA"]'); if (!r) return null; const box = r.querySelector('[data-vet-rec]'); return { ph: (r.querySelector('[data-vet-ph]') || {}).value, box: box ? box.innerText : '', id: box && box.getAttribute('data-vet-rec') }; });
ok('the office\'s LSA check card: 🎧 Call box + the number filled in for them', vet && vet.ph === '(901) 555-0211' && /2m 14s call/.test(vet.box) && vet.id === 'LI-A', vet);
ok('no page errors', !errs.length, errs);
const f = R.filter(x => !x).length; console.log(f ? 'FAILED ' + (R.length - f) + '/' + R.length : 'LSARECUI ' + R.length + '/' + R.length); process.exit(f ? 1 : 0);
