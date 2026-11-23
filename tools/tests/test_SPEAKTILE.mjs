// test_SPEAKTILE.mjs <build-dir> — patch SPEAKTILE: the 🎤 Speak tile on GrayCo Field's home (where 👁 View as… was).
//   A. node: voice-intake.js knows the new places (appointment · lead · expense · schedule_work · my_schedule), keeps their
//      fields, and the prompt carries the Central-time calendar ("Tuesday" is a real date).
//   B. the CRM (offline harness, made-up data), the owner on an iPhone (390 wide):
//      · Home: 🎤 Speak (Notes · schedule · messages · leads) is where View as… was; View as… is not on Home; a PM has it too
//      · a tap opens the 🎤 sheet and starts listening at once (a mocked SpeechRecognition)
//      · "Schedule an estimate with John Smith Tuesday at 2 at 123 Main" → 📅 New appointment (Estimate · John Smith · next
//        Tuesday 14:00 · 123 Main) → Post → on the schedule as the New appointment tile's record (cloud too)
//      · "New lead Jane Doe 901-555-0100 roof leak" → ➕ New lead → Post → in Leads (New Lead · Roofing · the phone), and the
//        Leads screen shows it
//      · "Note on Druluck: tree removed" → 📝 Job notes on the Druluck job → Post → the job's notes
//      · ✨ Smart route (the server's answer stubbed with voice-intake's own normalize): three actions, each with its place
//      · no customer / sub contact on any Post
// Usage: node test_SPEAKTILE.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs)
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import fs from 'fs'; import path from 'path';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const build = process.argv[2];
if (!build) { console.error('usage: node test_SPEAKTILE.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const SHOTS = process.env.GC_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/speaktile/';
try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) {}
const req = createRequire(import.meta.url);

/* ── A. node: voice-intake.js ── */
console.log('A. voice-intake.js');
const FN = path.join(path.resolve(build), 'netlify/functions');
const AI = req(path.join(FN, '_lib/ai.js'));
let asked = null;
AI.ready = () => true;
AI.ask = async o => { asked = o; return { ok: true, out: { job_id: '', job_confidence: 'none', summary: 'three things', actions: [
  { type: 'appointment', text: 'Estimate with John Smith', appt_kind: 'Estimate', date: '2026-11-24', time: '14:00', contact_name: 'John Smith', address: '123 Main' },
  { type: 'lead', text: 'roof leak', contact_name: 'Jane Doe', phone: '901-555-0100' },
  { type: 'expense', text: 'screws', amount: 42.5, vendor: 'Home Depot', date: '2026-11-21' },
  { type: 'schedule_work', text: 'Marco framing Monday 8am for 3 days' }, { type: 'my_schedule', text: 'dentist Friday 9' },
  { type: 'bogus', text: 'x' }, { type: 'note', text: 'tree removed', time: '25:99' }] } }; };
const VI = req(path.join(FN, 'voice-intake.js'));
const R = await VI._test.route('Schedule an estimate …', [{ id: 'J1', name: 'Druluck - Tree' }], ['Nick Gray'], '', '2026-11-21');
const pr = asked && asked.content[0].text;
ok(R.ok && R.actions.map(a => a.type).join() === 'appointment,lead,expense,schedule_work,my_schedule,note', 'route: the new kinds are kept, an unknown one dropped', R.actions && R.actions.map(a => a.type));
const ap = R.actions[0], ld = R.actions[1], ex = R.actions[2];
ok(ap.apptKind === 'Estimate' && ap.date === '2026-11-24' && ap.time === '14:00' && ap.contactName === 'John Smith' && ap.address === '123 Main', 'appointment: kind · date · time · name · address', ap);
ok(ld.contactName === 'Jane Doe' && ld.phone === '901-555-0100' && ex.amount === 42.5 && ex.vendor === 'Home Depot' && R.actions[5].time === '', 'lead: name + phone; expense: amount + vendor; a bad time is dropped', [ld, ex, R.actions[5].time]);
ok(/Sat 2026-11-21, Sun 2026-11-22, Mon 2026-11-23, Tue 2026-11-24/.test(pr) && /America\/Chicago/.test(pr) && /appointment \(a NEW estimate/.test(pr) && /lead \(a NEW potential customer/.test(pr), 'the prompt: Central time, the next days with their weekdays, the new kinds');
const toolTypes = asked && asked.tool.input_schema.properties.actions.items.properties.type.enum;
ok(['appointment', 'lead', 'expense', 'schedule_work', 'my_schedule'].every(t => toolTypes.includes(t)), 'the tool lists the new kinds', toolTypes);
ok(/^\d{4}-\d{2}-\d{2}$/.test(VI._test.chicagoToday()), 'today is the Central-time date', VI._test.chicagoToday());

/* ── B. the CRM ── */
const H = await import(pathToFileURL(HARNESS).href);
const sleep = H.sleep;
const acct = name => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].name === name);
const NICK = acct('Nick Gray'), PM = acct('Demo PM');
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
H.resetCloud();
H.cset('users', [
  { id: 'u1', name: 'Nick Gray', email: NICK, role: 'Admin', payType: 'owner', active: true, phone: '9015550100' },
  { id: 'u2', name: 'Demo PM', email: PM, role: 'Project Manager', payType: 'salary_commission', active: true, phone: '9015550111' }]);
H.cset('projects', [
  { id: 'PD1', po: 'PO-4001', name: 'Druluck - Tree & roof', client: 'Sample Druluck', address: '77 Demo Oak Dr', type: 'Residential Reno', pm: 'Demo PM', status: 'Active', contract: 12000, contractSigned: true, updatedAt: ago(1) },
  { id: 'PD2', po: 'PO-4002', name: 'Kitchen - Maple', client: 'Sample Homeowner A', address: '101 Demo St', type: 'Residential Reno', pm: 'Demo PM', status: 'Active', contract: 30000, contractSigned: true, updatedAt: ago(0) }]);
H.cset('schedule', []); H.cset('leads', []); H.cset('subs', []); H.cset('projectDocs', []); H.cset('expenses', []);
const MOCK = () => {
  try { Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' }); } catch (e) {}
  /* the phone's speech recognition: a mock that records start() and lets the test "say" something */
  window.__sr = { starts: 0, last: null };
  function SR(){ this.lang = ''; this.continuous = false; this.interimResults = false; }
  SR.prototype.start = function(){ window.__sr.starts++; window.__sr.last = this; };
  SR.prototype.stop = function(){ this.stopped = true; };
  window.SpeechRecognition = SR; window.webkitSpeechRecognition = SR;
  window.__say = function(t){ var r = window.__sr.last; if (!r || !r.onresult) return false; var res = [[{ transcript: t }]]; res[0].isFinal = true; r.onresult({ resultIndex: 0, results: res }); return true; };
};
const OPEN = [];
async function phone(email, who){
  const c = await H.computer(who, { build, mobile: true, init: MOCK }); OPEN.push(c);
  await H.signIn(c, email, 9000);
  await H.waitFor(c, () => !!document.querySelector('#_gcJobPick .gc-pmf') && !!window._gcAUTAI && !!(window._gcPmField && window._gcPmField.addAppt), null, 60000);
  await H.waitFor(c, () => (window._crm && window._crm.projects || []).length >= 2, null, 30000);
  await sleep(2500);
  return c;
}
async function tap(c, sel){
  const L = c.page().locator(sel).first();
  await L.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {}); await sleep(200);
  const bb = await L.boundingBox().catch(() => null);
  const free = bb ? await L.evaluate((e, p) => { const h = document.elementFromPoint(p.x, p.y); return !!h && (h === e || e.contains(h)); }, { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }).catch(() => false) : false;
  if (bb && free) await c.page().touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); else await L.evaluate(e => e.click()).catch(() => {});
  await sleep(600);
}
const until = async (fn, ms) => { const t0 = Date.now(); let v; while (Date.now() - t0 < (ms || 25000)) { try { v = await fn(); } catch (e) { v = null; } if (v) return v; await sleep(500); } try { return await fn(); } catch (e) { return null; } };
const sched = c => c.ev(() => { let L = null; try { window._setSchedule(p => { L = p; return p; }); } catch (e) {} return (L || []).filter(Boolean); });
const leads = c => c.ev(() => { let L = null; try { window._setLeads(p => { L = p; return p; }); } catch (e) {} return (L || []).filter(Boolean); });
const cloud = k => { let v = H.cget(k); if (typeof v === 'string') try { v = JSON.parse(v); } catch (e) {} if (v && !Array.isArray(v) && Array.isArray(v.v)) v = v.v; return Array.isArray(v) ? v.filter(Boolean) : []; };
const SENDS = /sms|twilio|text-|send-?mail|email-send|notify|resend|gmail/i;
const card = c => c.ev(() => { const cs = [...document.querySelectorAll('#_gcMicActs [data-a]')]; return cs.map(x => { const o = { dest: x.querySelector('._gcADest').value, text: x.querySelector('._gcAText').value }; x.querySelectorAll('[data-f]').forEach(i => { o[i.getAttribute('data-f')] = i.value; }); return o; }); });
async function say(c, text){
  await c.ev(() => { window._gcAUTAI.closeMic(); window.__sr.starts = 0; window.__sr.last = null; });
  await c.ev(() => window._gcAUTAI.speak()); await sleep(400);
  const said = await c.ev(t => window.__say(t), text);
  await c.ev(() => { const t = document.getElementById('_gcMicText'); t.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(900);
  return said;
}

try {
  console.log('B. the owner on an iPhone');
  const c = await phone(NICK, 'NICK');
  const h = await c.ev(() => { const d = document.querySelector('#_gcJobPick .gc-pmf'); const b = d && d.querySelector('.gc-pmf-x [data-ra-a="speak"]');
    return { extra: [...d.querySelectorAll('.gc-pmf-x [data-ra-a]')].map(x => x.getAttribute('data-ra-a')), text: b ? b.innerText.replace(/\s+/g, ' ') : '', viewasHome: !!document.querySelector('#_gcJobPick [data-ra-a="viewas"],#_gcJobPick [data-tile="viewas"]'), w: innerWidth }; });
  ok(h.extra[1] === 'speak' && !h.extra.includes('viewas'), 'Home: 🎤 Speak where 👁 View as… was (Leads · Speak · All systems …)', h.extra);
  ok(/Speak/.test(h.text) && /Notes · schedule · messages · leads/.test(h.text), 'the tile: "🎤 Speak" + "Notes · schedule · messages · leads"', h.text);
  ok(!h.viewasHome && h.w === 390, 'View as… is not on the phone home (it stays in 💎); the phone is 390 wide', h);
  ok(await c.ev(() => !!(window._gcVASOpen || document.getElementById('gc-hub-btn'))), 'View as… is still reachable (💎 / _gcVASOpen)');
  await c.page().locator('#_gcJobPick [data-ra-a="speak"]').scrollIntoViewIfNeeded().catch(() => {}); await sleep(400);
  await c.page().screenshot({ path: SHOTS + 'home_speak_390.png', scale: 'css' });

  /* the tap: the sheet opens and listens */
  await tap(c, '#_gcJobPick [data-ra-a="speak"]');
  const o = await c.ev(() => { const ov = document.getElementById('_gcMicOv'); const rb = document.getElementById('_gcMicRec'); return { open: !!ov, speak: ov && ov.getAttribute('data-speak'), starts: window.__sr.starts, on: rb && rb.classList.contains('on'), btn: rb && rb.textContent, bg: ov && getComputedStyle(ov.querySelector('.gcautai-sheet')).backgroundColor, lang: window.__sr.last && window.__sr.last.lang }; });
  ok(o.open && o.speak === '1', 'a tap on 🎤 Speak opens the 🎤 sheet', o);
  ok(o.starts === 1 && o.on && /Listening/.test(o.btn) && o.lang === 'en-US', 'it starts listening at once (the phone\'s speech recognition)', o);
  ok(o.bg === 'rgb(255, 255, 255)', 'the sheet is light (no navy)', o.bg);

  /* 1. an appointment */
  const t0 = await c.ev(() => window._gcVoiceSched.today());
  const dw = new Date(t0 + 'T12:00:00Z').getUTCDay(); const add = n => { const d = new Date(t0 + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const tue = add(((2 - dw + 7) % 7) || 7);
  ok(await say(c, 'Schedule an estimate with John Smith Tuesday at 2 at 123 Main'), 'the words come in from the speech recognition');
  const chip1 = await c.ev(() => [...document.querySelectorAll('#_gcMicDest .on')].map(b => b.getAttribute('data-d')).join());
  ok(chip1 === 'appt', '"Schedule an estimate with John Smith Tuesday at 2 at 123 Main" → 📅 New appointment picked', chip1);
  await tap(c, '#_gcMicGo');
  const a1 = (await card(c))[0] || {};
  ok(a1.dest === 'appt' && a1.apKind === 'Estimate' && a1.apWho === 'John Smith' && a1.apDate === tue && a1.apTime === '14:00' && a1.apAddr === '123 Main' && a1.apWith === 'new', 'the card: Estimate · John Smith · Tue ' + tue + ' 14:00 · 123 Main · a new customer', a1);
  await c.page().locator('#_gcMicActs').scrollIntoViewIfNeeded().catch(() => {}); await sleep(300);
  await c.page().screenshot({ path: SHOTS + 'sheet_appt_390.png', scale: 'css' });
  const fn0 = c.fn.length;
  await tap(c, '#_gcMicPost');
  const r1 = await until(() => c.ev(() => { const r = document.querySelector('#_gcMicActs ._gcARes'); return r && /✓|⚠/.test(r.textContent) ? r.textContent : null; }), 8000);
  ok(/✓ Calendar — Estimate — John Smith/.test(r1 || ''), 'Post → "Calendar — Estimate — John Smith …"', r1);
  const s1 = (await sched(c)).find(x => x.type === 'appointment' && /John Smith/.test(x.title || ''));
  ok(!!s1 && s1.apptKind === 'Estimate' && s1.date === tue && s1.time === '2:00 PM' && s1.address === '123 Main' && s1.customer === 'John Smith' && s1.assignee === 'Nick Gray' && s1.source === 'voice', 'on the schedule as the New appointment tile\'s record (type appointment, apptKind, 2:00 PM, the customer)', s1);
  ok(!!(await until(() => cloud('schedule').some(x => x.id === (s1 && s1.id)), 25000)), 'and in the cloud schedule');

  /* 2. a lead */
  await say(c, 'New lead Jane Doe 901-555-0100 roof leak');
  ok((await c.ev(() => [...document.querySelectorAll('#_gcMicDest .on')].map(b => b.getAttribute('data-d')).join())) === 'lead', '"New lead Jane Doe 901-555-0100 roof leak" → ➕ New lead picked');
  await tap(c, '#_gcMicGo');
  const a2 = (await card(c))[0] || {};
  ok(a2.dest === 'lead' && a2.ldName === 'Jane Doe' && a2.ldPhone === '901-555-0100' && a2.ldType === 'Roofing' && /^roof leak$/i.test(a2.text), 'the card: Jane Doe · 901-555-0100 · Roofing · "Roof leak"', a2);
  await tap(c, '#_gcMicPost');
  await until(() => c.ev(() => { const r = document.querySelector('#_gcMicActs ._gcARes'); return r && /✓|⚠/.test(r.textContent); }), 8000);
  /* the lead list is re-read for up to 3 s (the open's first sync may still be redrawing the screen — the app's list is
     only answered at once when no redraw is pending), then the Leads screen itself must show the lead to a person */
  const l2 = await until(async () => (await leads(c)).find(x => x.name === 'Jane Doe'), 3000);
  ok(!!l2 && l2.stage === 'New Lead' && l2.phone === '901-555-0100' && l2.type === 'Roofing' && /roof leak/i.test(l2.notes) && l2.origin === 'voice', 'Post → in Leads (New Lead · Roofing · the phone · the words in the notes)', l2);
  await c.ev(() => { try { window._gcAUTAI.closeMic(); } catch (e) {} const h = document.querySelector('#_gcJobPick.gc-fh'); if (h) h.remove(); window._setView('leads'); });
  const seen = await until(() => c.ev(() => [...document.querySelectorAll('body *')].some(e => e.children.length === 0 && /Jane Doe/.test(e.textContent || '') && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')), 15000);
  ok(!!seen, 'the Leads screen shows "Jane Doe" (on screen, not only in the data)');
  await c.ev(() => { try { window._gcField.open(); } catch (e) {} }); await sleep(1500);
  ok(!!(await until(() => cloud('leads').some(x => x.name === 'Jane Doe'), 25000)), 'and in the cloud leads');

  /* 3. a job note */
  await say(c, 'Note on Druluck: tree removed');
  await tap(c, '#_gcMicGo');
  const a3 = await card(c), j3 = await c.ev(() => document.getElementById('_gcMicJob').value);
  ok(a3.length === 1 && a3[0].dest === 'note' && j3 === 'PD1' && a3[0].text === 'tree removed', '"Note on Druluck: tree removed" → 📝 Job notes on the Druluck job ("tree removed")', { a3, j3 });
  await tap(c, '#_gcMicPost');
  const u3 = await until(() => c.ev(() => { const p = (window._crm.projects || []).find(x => x.id === 'PD1'); const u = p && (p.updates || [])[0]; return u && /tree removed/.test(u.text) ? u : null; }), 8000);
  ok(!!u3 && u3.source === 'voice' && u3.by === 'Nick Gray', 'Post → the Druluck job\'s notes', u3);
  const sent = c.fn.slice(fn0).map(x => x.name).filter(n => SENDS.test(n));
  ok(!sent.length, 'no text / e-mail / notice to a customer or sub on any Post', sent);

  /* 4. ✨ Smart route: the server's answer (voice-intake's own normalize) → three actions, each with its place */
  H.onFn('voice-intake', x => x.body && x.body.action === 'route' ? Object.assign({ ok: true }, VI._test.normalize({ job_id: 'PD1', job_confidence: 'high', summary: 'Three things', actions: [
    { type: 'note', text: 'Tree removed' }, { type: 'appointment', text: 'Estimate with John Smith', appt_kind: 'Estimate', date: tue, time: '14:00', contact_name: 'John Smith', address: '123 Main' },
    { type: 'lead', text: 'roof leak', contact_name: 'Jane Doe', phone: '901-555-0100' }] }, x.body.jobs || [], '', x.body.text)) : { ok: true, ai: true, items: [] });
  await say(c, 'Note on Druluck tree removed. Schedule an estimate with John Smith Tuesday at 2 at 123 Main. New lead Jane Doe 901-555-0100 roof leak');
  await c.ev(() => { document.getElementById('_gcMicJob').value = ''; });
  await tap(c, '#_gcMicAI'); await sleep(1200);
  const rt = c.fn.filter(x => x.name === 'voice-intake' && x.body && x.body.action === 'route').pop();
  ok(rt && rt.body.today === t0, 'Smart route sends today\'s Central-time date', rt && rt.body.today);
  const a4 = await card(c);
  ok(a4.map(x => x.dest).sort().join() === 'appt,lead,note' && (await c.ev(() => document.getElementById('_gcMicJob').value)) === 'PD1', 'three actions, each with its place (📝 note on the job found · 📅 appointment · ➕ lead)', a4.map(x => x.dest));
  const ap4 = a4.find(x => x.dest === 'appt') || {};
  ok(ap4.apWho === 'John Smith' && ap4.apDate === tue && ap4.apTime === '14:00', 'the appointment card carries the AI\'s date / time / name', ap4);
  await c.page().locator('#_gcMicActs').scrollIntoViewIfNeeded().catch(() => {}); await sleep(300);
  await c.page().screenshot({ path: SHOTS + 'sheet_routed_390.png', scale: 'css' });
  ok(!c.errs.length, 'no page errors', c.errs.slice(0, 4));
  await c.close();

  /* a PM: the tile too */
  console.log('B. a PM on an iPhone');
  const p = await phone(PM, 'PM');
  const px = await p.ev(() => [...document.querySelectorAll('#_gcJobPick .gc-pmf-x [data-ra-a]')].map(x => x.getAttribute('data-ra-a')));
  ok(px[0] === 'speak' && !px.includes('viewas'), 'PM Home: 🎤 Speak first among the role tiles', px);
  await tap(p, '#_gcJobPick [data-ra-a="speak"]');
  ok(await p.ev(() => !!document.getElementById('_gcMicOv') && window.__sr.starts === 1), 'PM: the tap opens the sheet and listens');
  ok(!p.errs.length, 'PM: no page errors', p.errs.slice(0, 4));
} catch (e) { fail++; console.log('  ✗ FAIL ' + (e && e.stack || e)); }
for (const c of OPEN) { try { await c.close(); } catch (e) {} }
console.log(`SPEAKTILE ${pass}/${pass + fail}` + (fail ? ' — ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
