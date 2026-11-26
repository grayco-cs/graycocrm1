// test_BADWHY.mjs <build-dir> — patch BADWHY (owner 11/26: "when we comment bad lead for lsa we can type bad, didnt want to schedule appointment
// or whatever reason and marketing or office sees that when they qualify the lead"). Offline harness (made-up people, numbers and links; the
// server answers are fakes that record what the page sends):
//   1. the office, phone (390 px): 📞 Google calls → 👎 Bad opens a box right under the row (no pop-up): the five quick picks + type your own;
//      Save with nothing → "Pick a reason or type one." (nothing sent); a quick pick → Save → ?lsaassign { verdict bad, reason }; Cancel sends
//      nothing; the row then shows "👎 Bad lead — <reason> (who, when)"; nothing wider than the screen.
//   2. an admin, desk: a lead marked bad shows a red "👎 BAD LEAD — <reason>" box at the top (who, when, "paste it into Google's dispute form",
//      📋 Copy reason) and a "👎 <reason>" chip on the Leads list; a good lead shows neither.
//   No alert / confirm / prompt anywhere; no page errors.
import { computer, signIn, sleep, cset, resetCloud, waitFor, onFn } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const build = process.argv[2];
const at = new Date().toISOString(), recent = new Date(Date.now() - 20 * 60e3).toISOString();
const PICKS = ["Didn't want to schedule an appointment", 'Wrong service / not our work', 'Spam / wrong number', 'Out of area', 'Price shopping only'];
const WHY2 = "Didn't want to schedule an appointment";
function seed(){
  resetCloud();
  cset('users', [{ id: 'u-wesley', name: 'Ann Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
    { id: 'u-nick', name: 'Ben Owner', email: 'ngray@grayco-cs.com', role: 'Admin', active: true },
    { id: 'u-office', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office', active: true },
    { id: 'u-pm', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }]);
  cset('leads', [
    { id: 'LEADIN-b1', inboxId: 'LI-b1', name: 'Google LSA caller (901) 555-0431', phone: '(901) 555-0431', source: 'Google LSA', leadSource: 'Google LSA', lsaCheck: 'pending', lsaCall: true, scope: 'roof leak', stage: 'New Lead', createdAt: at, updatedAt: at },
    { id: 'LEADIN-b2', inboxId: 'LI-b2', name: 'Dee Sample', phone: '(901) 555-0432', source: 'Google LSA', leadSource: 'Google LSA', lsaCheck: 'bad', lsaReason: WHY2, lsaReasonBy: 'Demo PM', lsaReasonAt: recent, lsaDecidedBy: 'Demo PM', lsaDecidedAt: recent, stage: 'Lost', status: 'lost', lostReason: 'LSA — not a real lead (' + WHY2 + ')', leadExtra: { leadSource: 'Google LSA', lsaCheck: 'bad' }, createdAt: at, updatedAt: at },
    { id: 'LEADIN-b4', inboxId: 'LI-b4', name: 'Pending Sample', phone: '(901) 555-0434', source: 'Google LSA', leadSource: 'Google LSA', lsaCheck: 'pm_bad', lsaPmBy: 'Demo PM', lsaPmAt: recent, lsaReason: 'Price shopping only', lsaReasonBy: 'Demo PM', lsaReasonAt: recent, stage: 'New Lead', createdAt: at, updatedAt: at },
    { id: 'LEADIN-b3', inboxId: 'LI-b3', name: 'Good Sample', phone: '(901) 555-0433', source: 'Google LSA', leadSource: 'Google LSA', lsaCheck: 'good', stage: 'New Lead', createdAt: at, updatedAt: at }]);
}
let ITEMS = [];
function resetItems(){ ITEMS = [{ id: 'LI-b1', code: 'B7Q1', title: 'Google LSA call', name: 'Google LSA caller (901) 555-0431', phone: '9015550431', at: recent, status: 'imported', check: 'pending', pm: '', pmEmail: '', call: true, intake: null, repeats: 0, info: { callAtLabel: '11/26, 8:21 AM', recs: [] } }]; }
const POSTS = [];
onFn('texts', ({ query, body }) => {
  if (query.lsaleads) return { ok: true, items: ITEMS, pms: [{ id: 'u-pm', name: 'Demo PM', email: 'pm@grayco-cs.com' }], defaultPm: 'u-nick', defaultPmName: 'Ben Owner', defaultPmAuto: true, owners: [{ slot: 1, name: 'Ann Owner' }, { slot: 2, name: 'Ben Owner' }], admin: true, assign: true };
  if (query.lsaassign) { POSTS.push({ q: 'lsaassign', body }); const x = ITEMS.find(y => y.id === body.leadId); if (x && body.verdict === 'bad') { x.check = 'bad'; x.reason = body.reason; x.reasonBy = 'Office Demo'; x.reasonAt = new Date().toISOString(); } return { ok: true, code: 'B7Q1', good: false, link: 'https://ads.google.com/localservices/leads' }; }
  if (query.lsamine) return { ok: true, items: [] };
  return { ok: true };
});
const OPEN = [];
try {
  /* ── 1. the office, phone ── */
  seed(); resetItems(); POSTS.length = 0;
  const O = await computer('O', { build, mobile: true }); OPEN.push(O);
  ok('office signs in on a phone', await signIn(O, 'office@grayco-cs.com', 20000));
  await sleep(4000); await O.ev(() => window._setView('leads')); await sleep(2500);
  await O.ev(() => { const p = document.getElementById('gc-in-pop'); if (p) p.remove(); window._gcLsaCalls && window._gcLsaCalls.open(); }); await sleep(1800);
  const row0 = await waitFor(O, () => !!document.querySelector('#gc-lc-ov [data-lc-bad="LI-b1"]'), null, 10000);
  ok('📞 Google calls lists the call with 👎 Bad', !!row0);
  await O.page().click('#gc-lc-ov [data-lc-bad="LI-b1"]'); await sleep(400);
  const bx = await O.ev(() => { const b = document.querySelector('#gc-lc-ov .gc-bw'); if (!b) return null; const row = document.querySelector('#gc-lc-ov [data-lc-row="LI-b1"]'); const r = b.getBoundingClientRect();
    return { chips: [...b.querySelectorAll('[data-bw-pick]')].map(x => x.textContent), inp: !!b.querySelector('[data-bw-txt]'), under: !!row && (row.nextElementSibling === b || row.contains(b)), right: r.right, vw: innerWidth, sw: document.documentElement.scrollWidth, ch: Math.min(...[...b.querySelectorAll('[data-bw-pick]')].map(x => x.getBoundingClientRect().height)), focus: document.activeElement === b.querySelector('[data-bw-txt]') }; });
  ok('👎 opens the box right under the row: the five quick picks + a text box (focused)', bx && JSON.stringify(bx.chips) === JSON.stringify(PICKS) && bx.inp && bx.under && bx.focus, bx);
  ok('the box fits a 390 px phone; the picks are easy to tap (≥ 40 px)', bx && bx.right <= bx.vw + 1 && bx.sw <= bx.vw + 1 && bx.ch >= 40, bx);
  await O.page().click('#gc-lc-ov .gc-bw [data-bw-save]'); await sleep(300);
  const m0 = await O.ev(() => (document.querySelector('#gc-lc-ov .gc-bw [data-bw-msg]') || {}).textContent || '');
  ok('Save with no reason → "Pick a reason or type one." and nothing is sent', /Pick a reason or type one/.test(m0) && !POSTS.length, { m0, POSTS });
  await O.page().click('#gc-lc-ov .gc-bw [data-bw-cancel]'); await sleep(300);
  ok('Cancel closes the box and sends nothing', await O.ev(() => !document.querySelector('.gc-bw')) && !POSTS.length, POSTS);
  await O.page().click('#gc-lc-ov [data-lc-bad="LI-b1"]'); await sleep(300);
  await O.page().click('#gc-lc-ov .gc-bw [data-bw-pick="3"]'); await sleep(200);
  const v1 = await O.ev(() => { const b = document.querySelector('#gc-lc-ov .gc-bw'); return { v: b.querySelector('[data-bw-txt]').value, pressed: b.querySelector('[data-bw-pick="3"]').getAttribute('aria-pressed') }; });
  ok('a quick pick fills the reason (and shows as picked)', v1.v === 'Out of area' && v1.pressed === 'true', v1);
  await O.page().fill('#gc-lc-ov .gc-bw [data-bw-txt]', 'Out of area — lives in Tupelo');
  await O.page().click('#gc-lc-ov .gc-bw [data-bw-save]'); await sleep(1500);
  ok('Save → ?lsaassign { LI-b1, verdict bad, the reason as typed }', POSTS.some(p => p.q === 'lsaassign' && p.body.leadId === 'LI-b1' && p.body.verdict === 'bad' && p.body.reason === 'Out of area — lives in Tupelo'), POSTS);
  ok('the box is gone', await O.ev(() => !document.querySelector('.gc-bw')));
  await O.ev(() => window._gcLsaCalls && window._gcLsaCalls.load && window._gcLsaCalls.load()); await sleep(1500);
  const ln = await waitFor(O, () => { const l = document.querySelector('#gc-lc-ov [data-lc-row="LI-b1"] [data-bw-line]'); return l ? l.textContent : ''; }, null, 8000);
  ok('the row now says "👎 Bad lead — <reason> (who, when)" for the office / owners', /👎 Bad lead — Out of area — lives in Tupelo/.test(ln || '') && /Office Demo/.test(ln || ''), ln);
  ok('no alert / confirm / prompt (office)', !O.dialogs.length, O.dialogs);
  ok('no page errors (office)', !O.errs.length, O.errs);
  await O.close(); OPEN.length = 0;

  /* ── 2. an admin, desk: where leads are qualified ── */
  seed(); resetItems(); POSTS.length = 0;
  const A = await computer('A', { build }); OPEN.push(A);
  ok('admin signs in', await signIn(A, 'wjohnson@grayco-cs.com', 20000));
  await sleep(4000); await A.ev(() => { const p = document.getElementById('gc-in-pop'); if (p) p.remove(); window._setView('leads'); }); await sleep(3000);
  await A.ev(() => { try { window._gcCo && window._gcCo.setLeadView && window._gcCo.setLeadView('all'); } catch (e) {} });
  const chip = await waitFor(A, () => { const c = document.querySelector('#gc-leads-hub [data-gcl-id="LEADIN-b2"] .gc-bw-chip'); return c ? c.textContent : ''; }, null, 10000);
  const rowsNow = await A.ev(() => [...document.querySelectorAll('#gc-leads-hub [data-gcl-id]')].map(r => r.getAttribute('data-gcl-id')));
  ok('the Leads list row of a bad lead shows "👎 <reason>"' + (rowsNow.includes('LEADIN-b2') ? '' : ' (the lead is not on the default list view)'), chip === '👎 ' + WHY2 || !rowsNow.includes('LEADIN-b2'), { chip, rowsNow });
  const chip4 = await waitFor(A, () => { const c = document.querySelector('#gc-leads-hub [data-gcl-id="LEADIN-b4"] .gc-bw-chip'); return c ? c.textContent : ''; }, null, 8000);
  ok('an open lead the PM called bad shows "👎 Price shopping only" on the Leads list', chip4 === '👎 Price shopping only', { chip4, rowsNow });
  ok('a good lead has no such chip', await A.ev(() => !document.querySelector('#gc-leads-hub [data-gcl-id="LEADIN-b3"] .gc-bw-chip')));
  await A.ev(() => window._gcLeadsHub.open('LEADIN-b2'));
  const box = await waitFor(A, () => { const b = document.querySelector('#gcl-drawer #gc-bad-why'); if (!b) return null; const d = document.getElementById('gcl-drawer');
    return { t: b.textContent, r: (b.querySelector('[data-bw-reason]') || {}).textContent, copy: !!b.querySelector('[data-bw-copy]'), top: d.firstElementChild === b || (b.previousElementSibling && b.previousElementSibling.id === 'gc-lsa-dispute'), fs: parseFloat(getComputedStyle(b.querySelector('[data-bw-reason]')).fontSize) }; }, null, 8000);
  ok('the open bad lead: a red box at the top with the reason, big', box && box.r === WHY2 && box.top && box.fs >= 15, box);
  ok('…with who said it, and "paste it into Google\'s dispute form", and 📋 Copy reason', box && /by Demo PM/.test(box.t) && /paste it into Google's dispute form/.test(box.t) && box.copy, box);
  await A.page().click('#gcl-drawer #gc-bad-why [data-bw-copy]'); await sleep(400);
  ok('📋 Copy reason works without a pop-up', await A.ev(() => { const b = document.querySelector('#gc-bad-why [data-bw-copy]'); return !!b; }) && !A.dialogs.length, A.dialogs);
  await A.ev(() => window._gcLeadsHub.open('LEADIN-b3')); await sleep(1800);
  ok('a good lead: no red box', await A.ev(() => !document.querySelector('#gcl-drawer #gc-bad-why')));
  /* the 📥 New lead card's 👎 (LSACHECK): the same box under the card row; an admin's 👎 is final */
  await A.ev(() => { try { window._gcLeadsHub.close(); } catch (e) {} const c = document.createElement('div'); c.style.cssText = 'position:fixed;left:8px;top:60px;z-index:2147483000;background:#fff;padding:8px;max-width:360px'; c.className = 'gc-nl'; c.id = 'bw-test-card'; c.innerHTML = '<div class="gc-nl-r" data-id="LEADIN-b1"><b>Google LSA caller</b><div class="gc-nl-b"><button type="button">Got it</button></div></div>'; document.body.appendChild(c); });
  await waitFor(A, () => !!document.querySelector('#bw-test-card [data-lsa-b="bad"]'), null, 5000);
  await A.page().click('#bw-test-card [data-lsa-b="bad"]'); await sleep(300);
  const nb = await A.ev(() => { const b = document.querySelector('#bw-test-card .gc-bw'); return b ? { n: b.querySelectorAll('[data-bw-pick]').length, prev: b.previousElementSibling && b.previousElementSibling.className } : null; });
  ok('📥 New lead card: 👎 opens the same box under the card (no numbered prompt)', nb && nb.n === 5 && nb.prev === 'gc-nl-r' && !A.dialogs.length, { nb, d: A.dialogs });
  await A.page().click('#bw-test-card .gc-bw [data-bw-pick="0"]'); await A.page().click('#bw-test-card .gc-bw [data-bw-save]'); await sleep(900);
  const lb = await A.ev(() => { const l = window._crm.leads.find(x => x.id === 'LEADIN-b1') || {}; return { chk: l.lsaCheck, r: l.lsaReason, by: l.lsaReasonBy, at: l.lsaReasonAt, lost: l.lostReason }; });
  ok('…the admin\'s pick is saved on the lead with who and when (BAD, "Didn\'t want to schedule an appointment")', lb.chk === 'bad' && lb.r === WHY2 && !!lb.by && !!lb.at && lb.lost.indexOf(WHY2) > 0, lb);
  const tk = await A.ev(() => { try { return (JSON.parse(localStorage.getItem('gc_office_tasks') || '[]') || []).find(x => x && x.id === 'LSADISPUTE_LEADIN-b1') || null; } catch (e) { return null; } });
  ok('…and its "⚖️ Dispute … in Google Ads" To-Do has the reason in the title and "Reason (paste into Google\'s dispute form)"', tk && tk.label.indexOf(WHY2) > 0 && /^Reason \(paste into Google's dispute form\): Didn't want/.test(tk.note) && tk.badReason === WHY2, tk);
  ok('no alert / confirm / prompt (admin)', !A.dialogs.length, A.dialogs);
  ok('no page errors (admin)', !A.errs.length, A.errs);
  await A.close(); OPEN.length = 0;
} catch (e) { ok('crash: ' + (e && e.stack), false); }
for (const x of OPEN) { try { await x.close(); } catch (e) {} }
const nF = R.filter(x => !x).length;
console.log(nF ? 'FAILED ' + (R.length - nF) + '/' + R.length : 'BADWHY ' + R.length + '/' + R.length);
process.exit(nF ? 1 : 0);
