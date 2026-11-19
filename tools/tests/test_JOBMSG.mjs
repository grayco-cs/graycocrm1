// test_JOBMSG.mjs <build-dir> — patch JOBMSG (owner 11/19, on his iPhone in 💬 Job Messages, PO C846 · Outdoor Entertainment Area):
//   "The phone should auto-enter if they have a number" + "make sure if I message the team down there they get a notification".
//   Phone (390x844, touch) as the owner, made-up jobs / customers / leads:
//   · a job linked to a customer record (no phone on the job itself) → 📱 Text them is filled with the customer's phone;
//   · Switch job… to a job whose client name is a customer AND has a lead → that customer's number, and a picker with both;
//     a tap on the other number puts it in the box; the box stays editable (typing is kept through a redraw);
//   · a job with no number anywhere (made from a CompanyCam project with no contact, like C846) → empty, with a line saying
//     where to add one; switching back fills the first job again;
//   · posting a message with a tapped @chip calls job-notify with the job, the message id, the text and the tag; the answer
//     shows who was reached and how; a plain message calls it too (the server tells the PM); a customer text never does;
//   · no page errors.
// Usage: node test_JOBMSG.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs; GC_SHOT = screenshot dir)
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_JOBMSG.mjs <dir with index.html>'); process.exit(2); }
const SHOT = process.env.GC_SHOT || '';
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const sleep = H.sleep;

H.resetCloud();
H.cset('users', [
  { id: 'U_office', name: 'Brittany Pucket', email: 'office@grayco-cs.com', role: 'Office Admin', active: true, title: 'office manager' },
  { id: 'U1', name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'Admin', active: true },
  { id: 'U2', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', active: true, payType: 'owner' },
  { id: 'U4', name: 'Glenn Miller', email: 'gmiller@grayco-cs.com', role: 'Estimator', active: true },
  { id: 'Ub5608wjnv2t', name: 'Steven Biffle', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true },
  { id: 'U5', name: 'Office', email: 'office@grayco-cs.com', role: 'Office', active: true }]);
H.cset('projects', [
  { id: 'PCUST', autoPO: 'C801', name: 'Demo Deck Job', client: 'Sample Homeowner', customerId: 'CUS1', clientPhone: '', address: '11 Demo Ln, Lakeland, TN', pm: 'Steven Biffle', status: 'active' },
  { id: 'PTWO', autoPO: 'C802', name: 'Two Numbers Job', client: 'Two Number Person', leadId: 'L9', address: '22 Demo Dr, Bartlett, TN', pm: 'Nick Thomas', status: 'active' },
  { id: 'PNONE', autoPO: 'C846', name: 'Outdoor Demo Area', client: '', clientPhone: '', clientEmail: '', source: 'companycam', ccamId: '99990001', address: '33 Demo Vly Dr, Lakeland, TN', pm: 'Nick Thomas', status: 'estimating' }]);
H.cset('customers', [
  { id: 'CUS1', name: 'Sample Homeowner', phone: '(901) 555-0111', address: '11 Demo Ln' },
  { id: 'CUS2', name: 'Two Number Person', phone: '901.555.0122' },
  { id: 'CUS3', name: 'Somebody Else', phone: '9015550199', address: '99 Other St' }]);
H.cset('leads', [{ id: 'L9', name: 'Two Numbers lead', contactName: 'Two Number Person', phone: '+1 901 555 0133', stage: 'Won' }]);
H.cset('gc_job_messages', JSON.stringify([]));
H.cset('gc_office_tasks', JSON.stringify([]));
let ANSWER = { ok: true, why: 'mention', to: [{ name: 'Glenn Miller', why: 'mention', pushed: true, texted: true }] };
H.onFn('job-notify', () => ANSWER);

const W = []; const close = async () => { for (const c of W) await c.b.close().catch(() => {}); };
const ready = c => H.waitFor(c, () => (window._crm && (window._crm.users || []).length >= 6 && (window._crm.projects || []).length >= 3 && (window._crm.customers || []).length >= 3 && (window._crm.leads || []).length >= 1 && window._gcOpenJobMessages && window._gcJobPhones && window._gcJM) ? 1 : 0, null, 60000);
const bar = c => c.ev(() => { const b = document.querySelector('#_gcJobMsgOv .gctx-bar'); if (!b) return null; const i = b.querySelector('.gctx-to');
  return { to: i && i.value, chips: [...b.querySelectorAll('.gcjp-n')].map(x => x.getAttribute('data-d')), pressed: [...b.querySelectorAll('.gcjp-n[aria-pressed="true"]')].map(x => x.getAttribute('data-d')),
    one: (b.querySelector('.gcjp-one') || {}).textContent || '', none: (b.querySelector('.gcjp-none') || {}).textContent || '', head: (document.querySelector('#_gcJobMsgOv') || {}).innerText.slice(0, 120) }; });
const waitBar = (c, pred, ms) => H.waitFor(c, pred, null, ms || 15000);
try {
  const O = await H.computer('PHONE', { build, mobile: true }); W.push(O);
  await H.signIn(O, 'wjohnson@grayco-cs.com', 9000);
  ok(!!(await ready(O)), 'the phone is signed in as the owner and jobs, customers and leads are loaded');
  const L = await O.ev(() => ({ a: window._gcJobPhones('PCUST'), b: window._gcJobPhones('PTWO'), c: window._gcJobPhones('PNONE') }));
  ok(JSON.stringify(L.a.map(x => x.d)) === '["9015550111"]' && /customer Sample Homeowner/.test(L.a[0].label), 'the customer-linked job → the customer record\'s phone', L.a);
  ok(JSON.stringify(L.b.map(x => x.d)) === '["9015550122","9015550133"]', 'client name = a customer + its lead → both numbers, customer first', L.b);
  ok(L.c.length === 0, 'the CompanyCam job with no contact (like C846) → no number anywhere', L.c);

  /* 1. open the customer-linked job */
  await O.ev(() => { document.querySelectorAll('#_gcJobPick,#_gcJobDash').forEach(o => o.remove()); });
  await O.ev(() => window._gcOpenJobMessages('PCUST'));
  await waitBar(O, () => { const i = document.querySelector('#_gcJobMsgOv .gctx-to'); return i && i.value ? 1 : 0; });
  let b = await bar(O);
  ok(b && b.to === '(901) 555-0111', '📱 Text them is filled with the customer\'s phone when the thread opens', b);
  ok(b && /📇 \(901\) 555-0111 — customer Sample Homeowner/.test(b.one), 'one number → a short line says where it came from', b && b.one);
  if (SHOT) await O.page().screenshot({ path: SHOT + '/jobmsg_phone_prefill.png' });

  /* 2. Switch job… → the two-number job */
  const p = O.page();
  await p.locator('#_jmJobSearch').tap(); await p.keyboard.type('Two Numbers'); await sleep(300);
  await p.locator('#_jmJobResults ._jmJobOpt[data-pid="PTWO"]').tap();
  await waitBar(O, () => { const o = document.querySelector('#_gcJobMsgOv'); const i = o && o.querySelector('.gctx-to'); return o && /Two Numbers Job/.test(o.innerText) && i && i.value ? 1 : 0; });
  await sleep(400);
  b = await bar(O);
  ok(b && b.to === '(901) 555-0122' && /Two Numbers Job/.test(b.head), 'Switch job… → the new job\'s phone (its customer by name) is filled in', b);
  ok(b && JSON.stringify(b.chips) === '["9015550122","9015550133"]' && JSON.stringify(b.pressed) === '["9015550122"]', 'several numbers → a picker with each one (the one in the box marked)', b);
  await p.locator('#_gcJobMsgOv .gcjp-n[data-d="9015550133"]').tap(); await sleep(250);
  b = await bar(O);
  ok(b && b.to === '(901) 555-0133' && JSON.stringify(b.pressed) === '["9015550133"]', 'a tap on the lead\'s number puts it in the box', b);
  if (SHOT) await p.screenshot({ path: SHOT + '/jobmsg_phone_picker.png' });
  /* still editable; a typed number survives the thread redrawing itself */
  await p.locator('#_gcJobMsgOv .gctx-to').fill('901-555-0177'); await O.ev(() => document.querySelector('#_gcJobMsgOv .gctx-to').dispatchEvent(new Event('input', { bubbles: true })));
  await O.ev(() => { const o = document.querySelector('#_gcJobMsgOv'); o.innerHTML = '<div style="background:#f1f5f9"><div>Two Numbers Job</div><div id="_jmThread"></div></div>'; });   /* what the thread's redraw does (ov.innerHTML) */
  await waitBar(O, () => document.querySelector('#_gcJobMsgOv .gctx-bar') ? 1 : 0);
  b = await bar(O);
  ok(b && b.to === '901-555-0177', 'the box stays editable: a typed number is kept through a redraw', b);
  await O.ev(() => { document.querySelector('#_gcJobMsgOv').remove(); window._gcOpenJobMessages('PTWO'); });
  await waitBar(O, () => { const i = document.querySelector('#_gcJobMsgOv #_jmJobSearch') && document.querySelector('#_gcJobMsgOv .gctx-to'); return i ? 1 : 0; });
  b = await bar(O);
  ok(b && b.to === '901-555-0177', 'closing and opening the same job keeps what was typed', b);

  /* 3. the job with no number (C846's case) */
  await p.locator('#_jmJobSearch').tap(); await p.keyboard.type('Outdoor Demo'); await sleep(300);
  await p.locator('#_jmJobResults ._jmJobOpt[data-pid="PNONE"]').tap();
  await waitBar(O, () => { const o = document.querySelector('#_gcJobMsgOv'); return o && /Outdoor Demo Area/.test(o.innerText) && o.querySelector('.gcjp-none') ? 1 : 0; });
  b = await bar(O);
  ok(b && b.to === '' && /No customer phone on this job yet/.test(b.none), 'no number anywhere → the box is empty and says where to add one', b);
  if (SHOT) await p.screenshot({ path: SHOT + '/jobmsg_phone_none.png' });

  /* 4. back to the first job: filled again */
  await p.locator('#_jmJobSearch').tap(); await p.keyboard.type('Demo Deck'); await sleep(300);
  await p.locator('#_jmJobResults ._jmJobOpt[data-pid="PCUST"]').tap();
  await waitBar(O, () => { const o = document.querySelector('#_gcJobMsgOv'); const i = o && o.querySelector('.gctx-to'); return o && /Demo Deck Job/.test(o.innerText) && i && i.value ? 1 : 0; });
  b = await bar(O);
  ok(b && b.to === '(901) 555-0111', 'switching back → filled again with that job\'s customer phone', b);

  /* 5. a tagged message → job-notify */
  const n0 = O.fn.filter(f => f.name === 'job-notify').length;
  const chip = p.locator('#_gcJobMsgOv ._jmChip', { hasText: '@Glenn Miller' });
  await p.locator('#_jmText').tap(); await p.keyboard.type('Can you price the pergola '); await sleep(150);
  await chip.scrollIntoViewIfNeeded(); await chip.tap(); await sleep(250);
  await p.locator('#_jmSend').tap();
  await H.waitFor(O, n => 1, null, 500);
  let call = null; for (let i = 0; i < 40 && !call; i++) { await sleep(250); call = O.fn.filter(f => f.name === 'job-notify')[n0] || null; }
  ok(!!call && call.method === 'POST', 'posting a tagged message calls job-notify', O.fn.map(f => f.name).slice(-10));
  if (call) {
    const msgs = JSON.parse(H.cget('gc_job_messages') || '[]'); const m = msgs.find(x => x.pid === 'PCUST' && /pergola/.test(x.text));
    ok(call.body.pid === 'PCUST' && /^Can you price the pergola @Glenn Miller/.test(call.body.text) && JSON.stringify(call.body.tags) === '["U4"]', 'it carries the job, the text and the tagged person', call.body);
    ok(!!m ? call.body.msgId === m.id : /^M\d+/.test(call.body.msgId), 'and the message id (the server never notifies one message twice)', { sent: call.body.msgId, saved: m && m.id });
  }
  const toast = await H.waitFor(O, () => { const t = [...document.querySelectorAll('.gcjp-toast')].map(x => x.textContent).join(' | '); return t || ''; }, null, 8000);
  ok(/🔔 Glenn Miller: text \+ phone/.test(toast || ''), 'the answer shows who was reached and how: ' + toast, toast);
  if (SHOT) await p.screenshot({ path: SHOT + '/jobmsg_notified.png' });

  /* 6. a plain message → called too (the server tells the PM) */
  ANSWER = { ok: true, why: 'pm', to: [{ name: 'Steven Biffle', why: 'pm', pushed: false, texted: false, held: true }] };
  await sleep(300);
  const n1 = O.fn.filter(f => f.name === 'job-notify').length;
  await p.locator('#_jmText').tap(); await p.keyboard.type('Materials arrive Tuesday'); await p.locator('#_jmSend').tap();
  let call2 = null; for (let i = 0; i < 40 && !call2; i++) { await sleep(250); call2 = O.fn.filter(f => f.name === 'job-notify')[n1] || null; }
  ok(!!call2 && call2.body.text === 'Materials arrive Tuesday' && JSON.stringify(call2.body.tags) === '[]', 'a plain message calls job-notify with no tags (the server picks the PM)', call2 && call2.body);
  const toast2 = await H.waitFor(O, () => /Steven Biffle: at 7 AM/.test([...document.querySelectorAll('.gcjp-toast')].map(x => x.textContent).join(' ')) ? 1 : 0, null, 8000);
  ok(!!toast2, 'quiet hours: "at 7 AM (quiet hours)"');
  /* a customer text (sms) never asks */
  const r3 = await O.ev(() => window._gcJobMsgNotify({ id: 'S1', pid: 'PCUST', text: 'hi', smsFrom: '9015550111' }));
  ok(r3 === null, 'a customer\'s text on the thread never triggers a staff notification');
  const hint = await O.ev(() => (document.querySelector('#_gcJobMsgOv') || {}).innerText || '');
  ok(/they get a text \/ phone notification/.test(hint), 'the line under the tags says they get a text / phone notification');
  ok(O.errs.length === 0, 'no page errors', O.errs);
} catch (e) { fail++; console.log('  ✗ FAIL exception', e && e.stack); }
await close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
