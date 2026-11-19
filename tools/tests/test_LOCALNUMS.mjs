// test_LOCALNUMS.mjs <build-dir> — patch LOCALNUMS in the browser (offline harness; made-up people, jobs and 555 numbers):
//   · ⚙ Admin settings → 📱 Local text numbers (owner): the rule (area code always wins, last-texted number only with no match), the A2P 10DLC sender-pool note, the webhook to copy, "＋ MS / AR / TN rows",
//     typing the Twilio numbers, Save → the server gets { state, codes, number, label } only; a row with no number is not saved;
//   · a PM (not an admin) sees "Only an admin…" (gate by role);
//   · 💬 Job Messages "📱 Text them" bar: "📱 Sending from (662) 555-0101 · MS …" for a 662 customer; changing the phone to a 214
//     number → "… main GrayCo number"; no text is sent by looking;
//   · 🔧 Owner setup (To-Do): "📱 Add local text numbers for Mississippi and Arkansas" with the steps (Buy a number by area code,
//     Sender pool, the same webhook, Admin → 📱 Local text numbers, test from a 662 contact) and "Open 📱 Local text numbers";
//   · no page errors.
// Usage: node test_LOCALNUMS.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs; GC_SHOT = screenshot dir)
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_LOCALNUMS.mjs <dir with index.html>'); process.exit(2); }
const SHOT = process.env.GC_SHOT || '';
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const sleep = H.sleep;

H.resetCloud();
H.cset('users', [
  { id: 'U2', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', active: true, payType: 'owner' },
  { id: 'U1', name: 'Nick Gray', email: 'ngray@grayco-cs.com', role: 'Admin', active: true },
  { id: 'UPM', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }]);
H.cset('projects', [
  { id: 'P662', autoPO: 'C701', name: 'Oxford Demo Roof', client: 'Molly Sample', clientPhone: '(662) 555-1234', address: '1 Demo St, Oxford, MS', pm: 'Demo PM', status: 'active' },
  { id: 'P214', autoPO: 'C702', name: 'Dallas Demo Gutter', client: 'Tex Sample', clientPhone: '214-555-3456', address: '2 Demo St, Dallas, TX', pm: 'Demo PM', status: 'active' }]);
H.cset('customers', []); H.cset('leads', []);
H.cset('gc_job_messages', JSON.stringify([]));
H.cset('gc_office_tasks', JSON.stringify([]));

const SRV = { list: [], posts: [], sends: [], fromfor: [] };
const A2P = 'A2P 10DLC: every new number must be added to the existing messaging campaign\'s sender pool (Twilio → Messaging → Services → the service → Sender pool → Add), or its texts will not be delivered.';
const HOOK = 'https://crm.grayco-cs.com/.netlify/functions/missed-call?event=sms';
const clean = l => (l || []).map(x => ({ state: String(x.state || '').toUpperCase(), codes: (x.codes || []).map(String), number: String(x.number || '').replace(/\D/g, '').slice(-10), label: String(x.label || '') }));
H.onFn('texts', ({ query, body, method }) => {
  const q = query || {};
  if (q.get ? q.get('status') : q.status) return { ok: true, ready: true, number: '(901) 555-0000', numbers: [], autoOn: false, paused: false, webhook: HOOK };
  const g = k => (q.get ? q.get(k) : q[k]);
  if (g('localnums')) {
    if (String(method).toUpperCase() === 'POST') { const b = typeof body === 'string' ? JSON.parse(body) : body; SRV.posts.push(b); SRV.list = clean(b.list); }
    return { ok: true, list: SRV.list, netlify: [], example: [], a2p: A2P, main: '(901) 555-0000', ready: true, webhook: HOOK, clash: [] };
  }
  if (g('fromfor')) {
    const to = String(g('to') || '').replace(/\D/g, '').slice(-10); SRV.fromfor.push(to);
    return /^662/.test(to) ? { ok: true, number: '(662) 555-0101', via: '(662)', local: true, state: 'MS', why: 'area', label: 'Sending from (662) 555-0101 · MS North MS local number' }
      : { ok: true, number: '(901) 555-0000', via: '(901)', local: false, state: '', why: 'main', label: 'Sending from (901) 555-0000 · main GrayCo number' };
  }
  if (g('send')) { SRV.sends.push(body); return { ok: true, id: 'x' }; }
  if (g('settings')) return { ok: true, settings: { autoOn: false, rules: [], numbers: [], relayTo: [] }, defaults: [], number: '(901) 555-0000' };
  return { ok: true };
});
H.onFn('owner-setup', () => ({ ok: true, checks: { local_numbers: false } }));

const W = []; const close = async () => { for (const c of W) await c.b.close().catch(() => {}); };
const shot = async (c, name) => { if (!SHOT) return; try { await c.page().screenshot({ path: SHOT + '/' + name + '.png' }); } catch (e) {} };
try {
  const O = await H.computer('OWNER', { build }); W.push(O);
  await H.signIn(O, 'wjohnson@grayco-cs.com', 9000);
  ok(!!(await H.waitFor(O, () => (window._crm && (window._crm.projects || []).length >= 2 && window._gcLocalNumsOpen && window._gcAdm && window._gcOpenJobMessages) ? 1 : 0, null, 30000)), 'signed in as the owner; the patch is loaded');

  /* 1. ⚙ Admin settings → 📱 Local text numbers */
  await O.ev(() => window._gcLocalNumsOpen());
  const box = await H.waitFor(O, () => { const b = document.querySelector('.gcln'); return b ? b.innerText : ''; }, null, 20000);
  ok(/sender pool/.test(box) && /will not be delivered/.test(box), 'the section shows the A2P 10DLC sender-pool note', (box || '').slice(0, 300));
  ok(box.indexOf(HOOK) >= 0 && /Copy/.test(box), '…and the webhook to copy (the same as the main number)');
  ok(/No local numbers yet/.test(box) && /area code/.test(box), '…empty at first, explaining the area-code rule');
  ok(/always used, even if they last texted the main number/.test(box) && /number they last texted/.test(box), '…the owner rule: the area-code number always wins; the last-texted number only when nothing matches');
  await O.page().click('.gcln [data-g="example"]'); await sleep(300);
  const rows = await O.ev(() => [...document.querySelectorAll('.gcln-row')].map(r => ({ st: r.querySelector('[data-l="state"]').value, codes: r.querySelector('[data-l="codes"]').value })));
  ok(JSON.stringify(rows) === JSON.stringify([{ st: 'MS', codes: '662, 601, 769, 228' }, { st: 'AR', codes: '870, 501, 479' }, { st: 'TN', codes: '901, 731' }]), '"＋ MS / AR / TN rows" adds MS 662/601/769/228, AR 870/501/479, TN 901/731', rows);
  /* Save with an empty number → refused in the page, nothing posted */
  await O.page().click('.gcln [data-g="save"]'); await sleep(400);
  ok(SRV.posts.length === 0, 'Save with no Twilio number typed → not sent to the server');
  const R = n => '.gcln-row:nth-of-type(' + n + ') ';
  await O.page().fill(R(1) + '[data-l="number"]', '(662) 555-0101'); await O.page().fill(R(1) + '[data-l="label"]', 'North MS');
  await O.page().fill(R(2) + '[data-l="number"]', '870-555-0102');
  await O.page().click(R(3) + '[data-g="del"]'); await sleep(200);
  await O.page().click('.gcln [data-g="save"]'); await sleep(1200);
  const p = SRV.posts[0];
  ok(p && p.list.length === 2 && p.list[0].state === 'MS' && p.list[0].codes.join() === '662,601,769,228' && p.list[0].number === '(662) 555-0101' && p.list[0].label === 'North MS' && p.list[1].state === 'AR', 'Save → the MS and AR rows go to the server (TN removed)', p);
  ok(p && Object.keys(p).join() === 'list' && p.list.every(x => Object.keys(x).sort().join() === 'codes,label,number,state'), 'only state / area codes / number / label are sent — nothing else', p);
  const after = await H.waitFor(O, () => document.querySelectorAll('.gcln-row').length === 2 && document.querySelector('.gcln-row [data-l="number"]').value, null, 8000);
  ok(after === '(662) 555-0101', 'the saved list shows again', after);
  await shot(O, 'localnums_admin');

  /* 2. the "📱 Text them" bar: Sending from */
  await O.ev(() => { document.querySelectorAll('.gc-adm-ov,#_gcJobPick,#_gcJobDash').forEach(o => o.remove()); window._gcOpenJobMessages('P662'); });
  const lab = await H.waitFor(O, () => { const e = document.querySelector('#_gcJobMsgOv .gctx-bar .gctx-from'); return e && e.textContent; }, null, 20000);
  ok(/^📱 Sending from \(662\) 555-0101 · MS North MS local number$/.test(lab || ''), 'the text bar of a 662 customer: "📱 Sending from (662) 555-0101 · MS North MS local number"', lab);
  await shot(O, 'localnums_bar');
  await O.page().fill('#_gcJobMsgOv .gctx-to', '(214) 555-3456');
  const lab2 = await H.waitFor(O, () => { const e = document.querySelector('#_gcJobMsgOv .gctx-from'); return e && /main GrayCo/.test(e.textContent) ? e.textContent : ''; }, null, 8000);
  ok(/Sending from \(901\) 555-0000 · main GrayCo number/.test(lab2 || ''), 'typing a 214 number → "Sending from (901) 555-0000 · main GrayCo number"', lab2);
  await O.page().fill('#_gcJobMsgOv .gctx-to', '12');
  const lab3 = await H.waitFor(O, () => { const e = document.querySelector('#_gcJobMsgOv .gctx-from'); return e && e.textContent === '' ? 'empty' : ''; }, null, 5000);
  ok(lab3 === 'empty', 'a half-typed number → no "Sending from" line');
  ok(SRV.sends.length === 0 && SRV.fromfor.indexOf('6625551234') >= 0, 'looking at the bar asks the server which number — and sends nothing', SRV);

  /* 3. 🔧 Owner setup on the To-Do */
  await O.ev(() => { const o = document.getElementById('_gcJobMsgOv'); if (o) o.remove(); });
  let ot = null;
  for (let i = 0; i < 8 && !ot; i++) {
    await O.ev(() => window._setView('todo')); await sleep(2000);
    await O.ev(() => { try { window._gcOwnerSetup.refresh(true); window._gcOwnerSetup.paint(); } catch (e) {} }); await sleep(1200);
    ot = await O.ev(() => { const d = document.getElementById('gc-ot'); if (!d) return null; d.open = true; const b = d.querySelector('[data-ot-open="local_numbers"]'); const r = b && b.closest('.ot-r');
      return r ? { text: r.innerText, btn: b.textContent, pre: getComputedStyle(r.querySelectorAll('.ot-h')[0]).whiteSpace } : null; });
  }
  ok(ot && /📱 Add local text numbers for Mississippi and Arkansas/.test(ot.text), '🔧 Owner setup has "📱 Add local text numbers for Mississippi and Arkansas"', ot);
  ok(ot && /Buy a number/.test(ot.text) && /662 and 601 for Mississippi, 870, 501 and 479 for Arkansas/.test(ot.text) && /SMS/.test(ot.text), '…step 1: Twilio → Phone Numbers → Buy a number, by area code, with SMS');
  ok(ot && /Sender pool → Add/.test(ot.text) && /will NOT deliver/.test(ot.text), '…step 2: the A2P 10DLC campaign\'s sender pool (or texts won\'t deliver)');
  ok(ot && /"A message comes in"/.test(ot.text) && /same Webhook URL as the current GrayCo number/.test(ot.text), '…step 3: the same "A message comes in" webhook as the current number');
  ok(ot && /Admin settings → 📱 Local text numbers/.test(ot.text) && /662 number/.test(ot.text) && ot.pre === 'pre-line', '…steps 4–5 (the CRM list, test from a 662 contact), one step per line', ot && ot.pre);
  await shot(O, 'localnums_ownersetup');
  await O.page().click('#gc-ot [data-ot-open="local_numbers"]');
  const opened = await H.waitFor(O, () => !!document.querySelector('.gcln'), null, 15000);
  ok(!!opened, '"Open 📱 Local text numbers" opens the admin section');
  ok(!O.errs.length, 'no page errors (owner)', O.errs);

  /* 4. a PM: no admin section */
  const P = await H.computer('PM', { build }); W.push(P);
  await H.signIn(P, 'pm@grayco-cs.com', 9000);
  await H.waitFor(P, () => window._gcLocalNums ? 1 : 0, null, 20000);
  const pmv = await P.ev(() => { const d = document.createElement('div'); window._gcLocalNums.render(d); return d.textContent; });
  ok(/Only an admin can change the local text numbers/.test(pmv), 'a PM (not an admin role) gets "Only an admin can change the local text numbers"', pmv);
  ok(!P.errs.length, 'no page errors (PM)', P.errs);
} catch (e) { fail++; console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
await close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
