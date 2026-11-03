// test_JOBMENTION.mjs <build-dir> — patch JOBMENTION (owner 11/03, iPhone, ROTC Cordova PO T724: "It wouldn't let me @ anyone,
// and that @ should go to a notification on the employee's CRM Messages").
//   Phone (390x844, touch, iPhone UA) as the owner: the thread still has "Need date for materials"; tapping the @Steven Biffle
//   chip puts "@Steven Biffle " in the box and keeps the focus; typing "@Gl" opens the list, a tap picks Glenn Miller; Send →
//   the message carries who is told, each @ person gets the existing mention To-Do. The desk as Steven: his 💬 Messages badge
//   goes 0 → 1, "🔔 For you" says "Wesley Johnson @mentioned you on … : …", a tap opens the thread and clears it (and the To-Do).
//   The owner's rule (plain → PM only; @ → those named + the PM; no PM → owners; never the sender; @Office → the office) is
//   checked on the real code with real-shaped people, and end to end (Steven's plain message → only the PM is told).
// Usage: node test_JOBMENTION.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs; GC_SHOT = screenshot dir)
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_JOBMENTION.mjs <dir with index.html>'); process.exit(2); }
const SHOT = process.env.GC_SHOT || '';
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const sleep = H.sleep;
const JOB = 'PRJ0sx249j6n8v', NOPM = 'PRJnopm1';
const parse = v => { if (typeof v === 'string') try { v = JSON.parse(v); } catch (e) {} return Array.isArray(v) ? v : []; };

H.resetCloud();
/* the live people list's shape (gc_kv users, 11/03): two records share office@ */
H.cset('users', [
  { id: 'U_office', name: 'Brittany Pucket', email: 'office@grayco-cs.com', role: 'Office Admin', active: true, title: 'office manager' },
  { id: 'U1', name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'Admin', active: true },
  { id: 'U2', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', active: true, payType: 'owner' },
  { id: 'U4', name: 'Glenn Miller', email: 'gmiller@grayco-cs.com', role: 'Estimator', active: true, title: 'Commercial Estimator' },
  { id: 'Ub5608wjnv2t', name: 'Steven Biffle ', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true, title: 'Roofing manager' },
  { id: 'U5', name: 'Office', email: 'office@grayco-cs.com', role: 'Office', active: true }]);
H.cset('projects', [
  { id: JOB, autoPO: 'T724', name: 'ROTC Cordova', client: 'A & B Construction Co., Inc.', address: 'Somerville TN', pm: 'Wesley Johnson', status: 'active', contractSigned: true },
  { id: NOPM, autoPO: 'T730', name: 'No PM Yet Job', client: 'Sample Owner', address: 'Bartlett TN', pm: '', status: 'active', contractSigned: true }]);
/* what the owner's phone saved this morning (before the fix every message was "me" / "Someone") */
H.cset('gc_job_messages', JSON.stringify([{ id: 'M1762184580000ab12', pid: JOB, authorId: 'me', authorName: 'Someone', text: 'Need date for materials', tags: [], at: '2026-11-03T15:43:00.000Z' }]));
H.cset('gc_office_tasks', JSON.stringify([]));

const W = []; const close = async () => { for (const c of W) await c.b.close().catch(() => {}); };
const forMe = c => c.ev(() => (window._gcJobMsgForMe ? window._gcJobMsgForMe() : []).map(x => ({ id: x.m.id, pid: x.m.pid, text: x.m.text, mention: x.mention })));
const ready = c => H.waitFor(c, () => (window._crm && (window._crm.users || []).length >= 6 && (window._crm.projects || []).length >= 2 && window._gcJM && window._gcOpenJobMessages && window._gcMeUser && (window._gcMeUser() || {}).email) ? 1 : 0, null, 90000, 400);
try {
  // ══════════ the owner's iPhone ══════════
  const O = await H.computer('PHONE', { build, mobile: true }); W.push(O);
  await H.signIn(O, 'wjohnson@grayco-cs.com', 9000);
  ok(!!(await ready(O)), 'the phone is signed in as the owner and the CRM is loaded');
  const me = await O.ev(() => { const u = window._gcMeUser() || {}; return { name: u.name, email: u.email, meUser: typeof window.meUser }; });
  ok(me.email === 'wjohnson@grayco-cs.com' && me.name === 'Wesley Johnson', 'the person is read from _gcMeUser (window.meUser does not exist: ' + me.meUser + ')', me);

  /* the rule, on the real code with the real-shaped people */
  const R = await O.ev(([JOB, NOPM]) => {
    const r = (pid, by, text, tags) => { const u = (window._crm.users || []).find(x => x.name.trim() === by) || {};
      const m = { id: 'T' + Math.random(), pid, authorId: u.id, authorName: by, authorEmail: u.email, text, tags: tags || [], at: new Date().toISOString() };
      return window._gcJM.recipients(window._gcJM.stamp(Object.assign({}, m))).map(x => x.n + ':' + x.why).sort(); };
    return {
      plainByNick: r(JOB, 'Nick Thomas', 'Need date for materials'),
      plainByPM: r(JOB, 'Wesley Johnson', 'Need date for materials'),
      atNick: r(JOB, 'Steven Biffle', '@Nick can you call the supplier'),
      atNickFull: r(JOB, 'Steven Biffle', 'ask @Nick Thomas'),
      noPmPlain: r(NOPM, 'Steven Biffle', 'who is running this one?'),
      noPmByOwner: r(NOPM, 'Nick Thomas', 'roof is dry-in'),
      noPmAtGlenn: r(NOPM, 'Steven Biffle', '@Glenn Miller numbers?'),
      atSelf: r(JOB, 'Steven Biffle', '@Steven Biffle note to self'),
      atPMtwice: r(JOB, 'Nick Thomas', '@Wesley Johnson and @Wesley look'),
      atOffice: r(JOB, 'Steven Biffle', '@Office please order'),
      email: r(JOB, 'Nick Thomas', 'mail nthomas@grayco-cs.com'),
      legacy: window._gcJM.recipients({ id: 'L1', pid: JOB, authorId: 'me', authorName: 'Someone', text: '@Nick hi', tags: [] }).length,
      sms: window._gcJM.recipients({ id: 'S1', pid: JOB, authorId: 'x@y.com', text: 'hi', source: 'sms', smsFrom: '9015550000' })
    };
  }, [JOB, NOPM]);
  ok(JSON.stringify(R.plainByNick) === '["Wesley Johnson:pm"]', 'a message with no @ → the job\'s PM only', R.plainByNick);
  ok(R.plainByPM.length === 0, 'no @, written by the PM → nobody', R.plainByPM);
  ok(JSON.stringify(R.atNick) === '["Nick Thomas:mention","Wesley Johnson:pm"]' && JSON.stringify(R.atNickFull) === JSON.stringify(R.atNick), '@Nick on a job where Nick is not PM → Nick + the PM (both "@Nick" and "@Nick Thomas")', [R.atNick, R.atNickFull]);
  ok(JSON.stringify(R.noPmPlain) === '["Nick Thomas:owner","Wesley Johnson:owner"]', 'a job with no PM → the owners (role)', R.noPmPlain);
  ok(JSON.stringify(R.noPmByOwner) === '["Wesley Johnson:owner"]', 'no PM, written by an owner → the other owner (never the sender)', R.noPmByOwner);
  ok(JSON.stringify(R.noPmAtGlenn) === '["Glenn Miller:mention","Nick Thomas:owner","Wesley Johnson:owner"]', 'no PM + @Glenn → Glenn + the owners', R.noPmAtGlenn);
  ok(JSON.stringify(R.atSelf) === '["Wesley Johnson:pm"]', '@ myself → I am never told; the PM is', R.atSelf);
  ok(JSON.stringify(R.atPMtwice) === '["Wesley Johnson:mention"]', 'the PM named twice → one notification for him', R.atPMtwice);
  ok(R.atOffice.length === 2 && /^(Brittany Pucket|Office):mention$/.test(R.atOffice[0]) && R.atOffice[1] === 'Wesley Johnson:pm', '@Office → the office (office@ / Office Admin — one mailbox, one notification) + the PM', R.atOffice);
  ok(JSON.stringify(R.email) === '["Wesley Johnson:pm"]', 'an e-mail address in the text is not a mention', R.email);
  ok(R.legacy === 0 && R.sms === null, 'a message saved before the fix ("me") tells nobody; texts with a customer keep their old rule', [R.legacy, R.sms]);

  /* the thread on the phone */
  await O.ev(() => { document.querySelectorAll('#_gcJobPick,#_gcJobDash').forEach(o => o.remove()); });
  await O.ev(id => window._gcOpenJobMessages(id), JOB);
  await H.waitFor(O, () => document.querySelector('#_gcJobMsgOv ._jmChip') ? 1 : 0, null, 15000);
  await sleep(2500);   /* the cloud pull comes back and redraws the thread */
  const th = await O.ev(() => document.querySelector('#_jmThread').innerText);
  ok(/Need date for materials/.test(th), 'the message already sent ("Need date for materials") is on ROTC Cordova\'s thread', th.slice(0, 200));
  const chipsSeen = await O.ev(() => [...document.querySelectorAll('#_gcJobMsgOv ._jmChip')].map(b => b.textContent));
  ok(['@Brittany Pucket', '@Nick Thomas', '@Wesley Johnson', '@Glenn Miller', '@Steven Biffle', '@Office'].every(x => chipsSeen.includes(x)) && !(await O.ev(() => document.querySelectorAll('#_gcJobMsgOv input[type=checkbox]').length)), 'the Tag chips are buttons (no checkbox): ' + chipsSeen.join(' '), chipsSeen);
  const p = O.page();
  const ta = p.locator('#_jmText');
  await ta.tap(); await p.keyboard.type('Need date for materials '); await sleep(200);
  const chip = p.locator('#_gcJobMsgOv ._jmChip', { hasText: '@Steven Biffle' });
  await chip.scrollIntoViewIfNeeded(); await chip.tap(); await sleep(300);
  let st = await O.ev(() => ({ v: document.querySelector('#_jmText').value, f: document.activeElement && document.activeElement.id, pressed: document.querySelector('._jmChip[data-jm-name="Steven Biffle"]').getAttribute('aria-pressed'), c: document.querySelector('#_jmText').selectionStart }));
  ok(st.v === 'Need date for materials @Steven Biffle ' && st.f === '_jmText' && st.c === st.v.length && st.pressed === 'true', 'tap @Steven Biffle → "@Steven Biffle " at the cursor, the box keeps the focus, the chip shows it is in', st);
  await chip.tap(); await sleep(200);
  ok((await O.ev(() => document.querySelector('#_jmText').value)) === st.v, 'tapping it again does not add a second @Steven Biffle');
  /* the cursor in the middle (the phone moved it): the name goes there */
  await O.ev(() => { const t = document.querySelector('#_jmText'); t.focus(); t.setSelectionRange(0, 0); document.dispatchEvent(new Event('selectionchange')); }); await sleep(100);
  await O.ev(() => document.querySelector('#_jmText').blur()); await sleep(100);   /* iOS: the tap took the focus away */
  await p.locator('#_gcJobMsgOv ._jmChip', { hasText: '@Nick Thomas' }).tap(); await sleep(250);
  st = await O.ev(() => ({ v: document.querySelector('#_jmText').value, f: document.activeElement && document.activeElement.id }));
  ok(st.v === '@Nick Thomas Need date for materials @Steven Biffle ' && st.f === '_jmText', 'with the focus lost, the name still goes where the cursor was, and the box gets the focus back', st);
  await O.ev(() => { const t = document.querySelector('#_jmText'); t.value = 'Need date for materials @Steven Biffle '; t.focus(); t.setSelectionRange(t.value.length, t.value.length); t.dispatchEvent(new Event('input', { bubbles: true })); });
  /* typed "@Gl" → the list → tap */
  await p.keyboard.type('and @Gl'); await sleep(300);
  const list = await O.ev(() => { const b = document.querySelector('#_jmMn'); return b && b.style.display !== 'none' ? [...b.querySelectorAll('[data-jm-i]')].map(x => x.innerText.replace(/\s+/g, ' ')) : null; });
  ok(!!list && list.length === 1 && /@Glenn Miller/.test(list[0]), 'typing "@Gl" opens the mention list: ' + JSON.stringify(list), list);
  await p.locator('#_jmMn [data-jm-i="0"]').tap(); await sleep(300);
  st = await O.ev(() => ({ v: document.querySelector('#_jmText').value, f: document.activeElement && document.activeElement.id, open: document.querySelector('#_jmMn').style.display }));
  ok(st.v === 'Need date for materials @Steven Biffle and @Glenn Miller ' && st.f === '_jmText' && st.open === 'none', 'tap "@Glenn Miller" → inserted, the list closes, the focus stays', st);
  /* the keyboard way (a desk) */
  await p.keyboard.type('@br'); await sleep(200); await p.keyboard.press('Enter'); await sleep(200);
  st = await O.ev(() => document.querySelector('#_jmText').value);
  ok(st === 'Need date for materials @Steven Biffle and @Glenn Miller @Brittany Pucket ', '"@br" + Enter → @Brittany Pucket', st);
  await O.ev(() => { const t = document.querySelector('#_jmText'); t.value = 'Need date for materials @Steven Biffle and @Glenn Miller '; t.dispatchEvent(new Event('input', { bubbles: true })); });
  if (SHOT) await p.screenshot({ path: SHOT + '/jobmention_phone_compose.png' });
  const t0 = Date.now();
  await p.locator('#_jmSend').tap();
  const sentMsg = await H.waitFor(O, () => { const l = JSON.parse(localStorage.getItem('gc_job_messages') || '[]'); return l.find(m => /@Glenn Miller/.test(m.text || '')) || null; }, null, 10000);
  ok(!!sentMsg && sentMsg.authorId === 'U2' && sentMsg.authorName === 'Wesley Johnson' && sentMsg.authorEmail === 'wjohnson@grayco-cs.com', 'the message is saved with its real sender (was "me" / "Someone")', sentMsg);
  ok(!!sentMsg && JSON.stringify(sentMsg.notify.map(x => x.n + ':' + x.why).sort()) === '["Glenn Miller:mention","Steven Biffle:mention"]' && sentMsg.tags.includes('Ub5608wjnv2t') && sentMsg.tags.includes('U4'),
    'who is told is on the message: Steven + Glenn (@); the PM is the sender (Wesley) so not him', sentMsg && sentMsg.notify);
  const toast = await H.waitFor(O, () => { const t = document.querySelector('.gcjm-toast'); return t ? t.textContent : null; }, null, 4000);
  ok(/Steven Biffle, Glenn Miller were told in 💬 Messages|Glenn Miller, Steven Biffle were told/.test(toast || ''), 'the phone says who was told: ' + toast, toast);
  ok((await O.ev(() => document.querySelector('#_jmText').value)) === '', 'the box is empty after Send');
  await H.waitFor(O, () => 1, null, 1); await sleep(2500);
  const cloudMsgs = parse(H.cget('gc_job_messages'));
  ok(cloudMsgs.some(m => m.id === sentMsg.id) && cloudMsgs.some(m => m.text === 'Need date for materials'), 'the cloud has the new message and still has "Need date for materials"', cloudMsgs.map(m => m.text));
  const tasks = parse(H.cget('gc_office_tasks')).filter(t => t.kind === 'mention' && t.msgId === sentMsg.id);
  ok(tasks.length === 2 && tasks.some(t => t.forUser === 'sbiffle@grayco-cs.com' && t.assignee === 'Steven Biffle' && t.pid === JOB && /@mentioned you on .*ROTC Cordova/.test(t.label) && t.note === sentMsg.text && !t.done) && tasks.some(t => t.forUser === 'gmiller@grayco-cs.com'),
    'each @ person has the existing mention To-Do (gc_office_tasks kind "mention", 💬 Reply → the thread)', tasks.map(t => [t.forUser, t.label]));
  const thread2 = await O.ev(() => document.querySelector('#_jmThread').innerHTML);
  ok(/class="gcjm-at"[^>]*>@Steven Biffle</.test(thread2), 'the names show highlighted in the sent bubble');
  ok((await forMe(O)).length === 0, 'the owner (the sender) has nothing waiting from his own message');

  // ══════════ Steven, on a desk ══════════
  const S = await H.computer('STEVEN', { build }); W.push(S);
  await H.signIn(S, 'sbiffle@grayco-cs.com', 9000);
  ok(!!(await ready(S)), 'Steven is signed in on a desk');
  let fy = await H.waitFor(S, () => { const l = window._gcJobMsgForMe ? window._gcJobMsgForMe() : []; return l.length ? l.map(x => ({ id: x.m.id, mention: x.mention, text: x.m.text })) : null; }, null, 70000, 500);
  ok(!!fy && fy.length === 1 && fy[0].id === sentMsg.id && fy[0].mention === true, 'Steven: one unread mention waiting for him (the plain old one is not)', fy);
  const badge = await H.waitFor(S, () => { const b = [...document.querySelectorAll('.gcjm-nb')].map(x => ({ t: x.textContent, in: x.parentElement && x.parentElement.textContent.replace(/\d+$/, '').trim() })); const tb = document.querySelector('#gc-topbar [data-tb="msg"] .tb-n'); return (b.length || (tb && !tb.hidden)) ? { b, tb: tb && !tb.hidden ? tb.textContent : '' } : null; }, null, 10000);
  ok(!!badge && (badge.b.some(x => x.t === '1' && /Messages/.test(x.in)) || badge.tb === '1'), 'Steven\'s 💬 Messages badge shows 1 (left menu / top bar)', badge);
  await S.ev(() => window._setView && window._setView('messages')); await sleep(2500);
  let fyi = await H.waitFor(S, () => { const b = document.querySelector('#gc-rp-msg .gcjm-fyi'); return b ? { t: b.innerText.replace(/\s+/g, ' '), pid: b.getAttribute('data-pid') } : null; }, null, 15000);
  ok(!!fyi && /Wesley Johnson @mentioned you on .*ROTC Cordova.*: Need date for materials @Steven Biffle and @Glenn Miller/.test(fyi.t) && fyi.pid === JOB, '💬 Messages → 🔔 For you: "' + (fyi && fyi.t.slice(0, 120)) + '"', fyi);
  if (SHOT) await S.page().screenshot({ path: SHOT + '/jobmention_desk_foryou.png' });
  await S.page().locator('#gc-rp-msg .gcjm-fyi').first().click(); await sleep(1500);
  const op = await S.ev(() => { const o = document.getElementById('_gcJobMsgOv'); return o ? { thread: o.querySelector('#_jmThread').innerText, head: o.innerText.slice(0, 120) } : null; });
  ok(!!op && /Need date for materials @Steven Biffle/.test(op.thread) && /Wesley Johnson/.test(op.thread) && /ROTC Cordova/.test(op.head), 'tapping it opens ROTC Cordova\'s thread, the message from Wesley Johnson (not "Someone")', op);
  await sleep(1800);
  ok((await forMe(S)).length === 0, 'opened → read: nothing waiting for Steven');
  const tSt = await H.waitFor(S, id => { const l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); const t = l.find(x => x.msgId === id && x.forUser === 'sbiffle@grayco-cs.com'); return t && t.done ? t : null; }, sentMsg.id, 6000);
  ok(!!tSt && tSt.done === true, 'his mention To-Do is closed by reading the thread (Glenn\'s stays open)', tSt);
  /* the desk composer still works the same way (click) — Steven writes with no @ → only the PM (Wesley) */
  const sp = S.page();
  await sp.locator('#_jmText').click(); await sp.keyboard.type('Materials Friday');
  await sp.locator('#_jmSend').click();
  const plain = await H.waitFor(S, () => { const l = JSON.parse(localStorage.getItem('gc_job_messages') || '[]'); return l.find(m => m.text === 'Materials Friday') || null; }, null, 8000);
  ok(!!plain && JSON.stringify(plain.notify) === JSON.stringify([{ id: 'U2', e: 'wjohnson@grayco-cs.com', n: 'Wesley Johnson', why: 'pm' }]) && plain.authorName.trim() === 'Steven Biffle', 'desk: Steven\'s plain message → only the PM (Wesley) is told', plain && plain.notify);
  await sp.locator('#_jmText').click(); await sp.locator('#_gcJobMsgOv ._jmChip', { hasText: '@Office' }).click(); await sleep(150);
  ok((await S.ev(() => ({ v: document.querySelector('#_jmText').value, f: document.activeElement.id }))).v === '@Office ', 'desk: clicking a chip still inserts (@Office)');
  await S.ev(() => { const t = document.querySelector('#_jmText'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); });
  const sErr = S.errs.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|net::/.test(e));
  ok(sErr.length === 0, 'desk: no page errors', sErr.slice(0, 5));

  // ══════════ back on the phone: the PM is told about Steven's message ══════════
  await O.ev(() => { const o = document.getElementById('_gcJobMsgOv'); if (o) o.remove(); });
  const wfy = await H.waitFor(O, () => { const l = window._gcJobMsgForMe ? window._gcJobMsgForMe() : []; return l.length ? l.map(x => ({ t: x.m.text, mention: x.mention })) : null; }, null, 70000, 500);
  ok(!!wfy && wfy.length === 1 && wfy[0].t === 'Materials Friday' && wfy[0].mention === false, 'the owner\'s phone: Steven\'s plain message waits for him as the PM', wfy);
  await O.ev(() => { if (window._gcPickJobForMessages) window._gcPickJobForMessages(); }); await sleep(800);
  const pk = await O.ev(() => { const b = document.querySelector('#_jpForYou .gcjm-fyi'); return b ? b.innerText.replace(/\s+/g, ' ') : null; });
  ok(!!pk && /Steven Biffle wrote on your job .*ROTC Cordova.*: Materials Friday/.test(pk), 'phone "Messages & texts": 🔔 For you — "' + (pk || '').slice(0, 90) + '"', pk);
  if (SHOT) await p.screenshot({ path: SHOT + '/jobmention_phone_foryou.png' });
  await p.locator('#_jpForYou .gcjm-fyi').first().tap(); await sleep(1500);
  ok(await O.ev(id => !!document.getElementById('_gcJobMsgOv') && /Materials Friday/.test(document.querySelector('#_jmThread').innerText), JOB), 'a tap on the phone opens the thread');
  await sleep(1500);
  ok((await forMe(O)).length === 0, 'and it is read');
  const oErr = O.errs.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|net::/.test(e));
  ok(oErr.length === 0, 'phone: no page errors', oErr.slice(0, 5));
  console.log('  (phone send → stored in ' + (Date.now() - t0) + ' ms incl. the reads)');
} catch (e) { fail++; console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
finally { await close(); }
console.log('\nJOBMENTION: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
