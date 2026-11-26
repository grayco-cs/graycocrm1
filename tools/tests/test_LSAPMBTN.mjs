// test_LSAPMBTN.mjs <build-dir> — patch LSAFLOW2 (owner 11/19): the PM marks his Google LSA lead in the Leads section of the app.
// Offline harness (made-up people, numbers and links; the server answers are fakes that record what the page sends):
//   phone (390 px) and desk: the PM sees his Google lead on the Leads list; opening it shows big 👍 Good lead / 👎 Bad lead;
//   👍 → ?lsamark good; 👎 asks why → ?lsamark bad + the reason → the bar shows ⚖️ Dispute in Google ↗ (the lead's own link) and
//   ✓ Disputed in Google → ?lsamark disputed → "✓ Disputed in Google … closed"; another PM's lead and a website lead show no bar;
//   nothing wider than the screen; no page errors.
import { computer, signIn, sleep, cset, resetCloud, waitFor, onFn } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const build = process.argv[2];
const at = new Date().toISOString();
function seed(){
  resetCloud();
  cset('users', [{ id: 'u-wesley', name: 'Ann Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
    { id: 'u-pm', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true },
    { id: 'u-pm2', name: 'Other PM', email: 'other@grayco-cs.com', role: 'Project Manager', active: true }]);
  cset('leads', [
    { id: 'LEADIN-p1', inboxId: 'LI-p1', name: 'Cus Tomer', phone: '(901) 555-7001', source: 'Google LSA', leadSource: 'Google LSA', lsaCheck: 'good', pm: 'Demo PM', pmEmail: 'pm@grayco-cs.com', assignee: 'Demo PM', assigneeEmail: 'pm@grayco-cs.com', assignedTo: 'Demo PM', estimator: 'Demo PM', leadExtra: { leadSource: 'Google LSA', lsaLink: 'https://c.gle/DEMOPM1' }, stage: 'New Lead', createdAt: at, updatedAt: at },
    { id: 'LEADIN-p2', inboxId: 'LI-p2', name: 'Not Mine', phone: '(901) 555-7002', source: 'Google LSA', leadSource: 'Google LSA', lsaCheck: 'good', pm: 'Other PM', pmEmail: 'other@grayco-cs.com', assignee: 'Other PM', assignedTo: 'Other PM', stage: 'New Lead', createdAt: at, updatedAt: at },
    { id: 'L-web', name: 'Web Person', source: 'Website', stage: 'New Lead', pm: 'Demo PM', assignee: 'Demo PM', assignedTo: 'Demo PM', estimator: 'Demo PM', createdAt: at, updatedAt: at }]);
}
let MINE = null; const POSTS = [];
function resetMine(){ MINE = [{ id: 'LI-p1', code: 'P7Q2', check: 'good', link: 'https://c.gle/DEMOPM1', pm: 'Demo PM', pmEmail: 'pm@grayco-cs.com', disputed: '', disputedBy: '' }]; POSTS.length = 0; }
onFn('texts', ({ query, body }) => {
  if (query.lsamine) return { ok: true, items: MINE };
  if (query.lsamark) { POSTS.push(body); const x = MINE.find(y => y.id === body.leadId);
    if (x && body.verdict === 'bad') x.check = 'bad';
    if (x && body.verdict === 'disputed') { x.check = 'bad'; x.disputed = new Date().toISOString(); x.disputedBy = 'Demo PM'; }
    return { ok: true, code: 'P7Q2', verdict: body.verdict, link: 'https://c.gle/DEMOPM1', saved: { item: x ? { lsaDisputedAt: x.disputed, lsaDisputedBy: x.disputedBy } : null } }; }
  if (query.lsaleads) return { __s: 403, ok: false, error: 'Only an admin or the office can do this.' };
  return { ok: true };
});
const OPEN = [];
async function run(label, mobile){
  seed(); resetMine();
  const P = await computer('PM-' + label, { build, mobile }); OPEN.push(P);
  ok(label + ': the PM signs in', await signIn(P, 'pm@grayco-cs.com', 20000));
  await sleep(5000); await P.ev(() => window._setView('leads')); await sleep(3500);
  const rows = await waitFor(P, () => { const r = [...document.querySelectorAll('#gc-leads-hub [data-gcl-id]')].map(x => x.getAttribute('data-gcl-id')); return r.includes('LEADIN-p1') ? r : null; }, null, 15000);
  ok(label + ': his Google lead is on his Leads list', !!rows && rows.includes('LEADIN-p1'), rows || await P.ev(() => [...document.querySelectorAll('#gc-leads-hub [data-gcl-id]')].map(x => x.getAttribute('data-gcl-id'))));
  await P.ev(() => window._gcLsaPm && window._gcLsaPm.load()); await sleep(500);
  await P.ev(() => window._gcLeadsHub.open('LEADIN-p1'));
  const b0 = await waitFor(P, () => { const b = document.querySelector('#gcl-drawer #gc-lsa-pm'); if (!b) return null; const g = b.querySelector('[data-pmb="good"]'), x = b.querySelector('[data-pmb="bad"]');
    const rb = b.getBoundingClientRect(); return { t: b.textContent, g: g && g.getBoundingClientRect().height, x: x && x.getBoundingClientRect().height, gw: g && g.getBoundingClientRect().width, right: rb.right, vw: innerWidth, sw: document.documentElement.scrollWidth, vis: g && g.getClientRects().length }; }, null, 10000);
  ok(label + ': the open lead shows big 👍 Good lead / 👎 Bad lead for its PM', b0 && /YOUR GOOGLE LSA LEAD · P7Q2/.test(b0.t) && /👍 Good lead/.test(b0.t) && /👎 Bad lead/.test(b0.t) && b0.g >= 48 && b0.x >= 48 && b0.vis, b0);
  ok(label + ': … and says no answer is needed for a good lead (silence = good)', b0 && /No answer needed for a good lead/.test(b0.t), b0 && b0.t);
  ok(label + ': nothing wider than the screen', b0 && b0.sw <= b0.vw + 1 && b0.right <= b0.vw + 1, b0);
  await P.page().click('#gc-lsa-pm [data-pmb="good"]'); await sleep(1200);
  const g1 = await P.ev(() => { const b = document.querySelector('#gc-lsa-pm'); const g = b && b.querySelector('[data-pmb="good"]'); return { t: b ? b.textContent : '', pressed: g && g.getAttribute('aria-pressed'), l: (window._crm.leads.find(x => x.id === 'LEADIN-p1') || {}).lsaPmOkAt }; });
  ok(label + ': 👍 → ?lsamark { LI-p1, good } and the bar says so', POSTS.some(p => p.leadId === 'LI-p1' && p.verdict === 'good') && /You marked it 👍 Good/.test(g1.t) && g1.pressed === 'true' && !!g1.l, { POSTS, g1 });
  await P.page().click('#gc-lsa-pm [data-pmb="bad"]'); await sleep(500);   /* patch BADWHY: the reason is typed in a box under the bar — no pop-up */
  const bw = await P.ev(() => { const b = document.querySelector('#gcl-drawer .gc-bw'); return b ? { n: b.querySelectorAll('[data-bw-pick]').length, after: b.previousElementSibling && b.previousElementSibling.id } : null; });
  ok(label + ': 👎 opens the reason box under the bar (quick picks + type your own), not a pop-up', bw && bw.n === 5 && bw.after === 'gc-lsa-pm' && !P.dialogs.length, { bw, d: P.dialogs });
  await P.page().fill('#gcl-drawer .gc-bw [data-bw-txt]', 'selling solar panels');
  await P.page().click('#gcl-drawer .gc-bw [data-bw-save]'); await sleep(1400);
  const b1 = await P.ev(() => { const b = document.querySelector('#gc-lsa-pm'); const a = b && b.querySelector('a[data-pmb="link"]'), d = b && b.querySelector('[data-pmb="disputed"]'); const l = window._crm.leads.find(x => x.id === 'LEADIN-p1') || {};
    return { t: b ? b.textContent : '', href: a && a.getAttribute('href'), tgt: a && a.getAttribute('target'), d: !!d, dh: d && d.getBoundingClientRect().height, chk: l.lsaCheck, why: l.lsaReason, toast: [...document.querySelectorAll('[role=status]')].map(x => x.textContent).join(' | ') }; });
  ok(label + ': 👎 + the typed reason → ?lsamark { LI-p1, bad, the reason }', POSTS.some(p => p.leadId === 'LI-p1' && p.verdict === 'bad' && p.reason === 'selling solar panels'), POSTS);
  ok(label + ': the lead is BAD; the bar: ⚖️ Dispute in Google ↗ (its own link, new tab) + ✓ Disputed in Google', b1.chk === 'bad' && b1.why === 'selling solar panels' && b1.href === 'https://c.gle/DEMOPM1' && b1.tgt === '_blank' && b1.d && b1.dh >= 48 && /Marked BAD/.test(b1.t), b1);
  const rb = await P.ev(() => { const b = document.querySelector('#gcl-drawer #gc-bad-why'); const l = window._crm.leads.find(x => x.id === 'LEADIN-p1') || {}; return { t: b ? b.textContent : '', by: l.lsaReasonBy, at: l.lsaReasonAt }; });
  ok(label + ': BADWHY: the lead keeps who and when, and its page shows "👎 BAD LEAD — selling solar panels"', /selling solar panels/.test(rb.t) && /BAD LEAD/.test(rb.t) && !!rb.by && !!rb.at, rb);
  ok(label + ': the toast says the dispute link is on its way by text', /dispute link is on its way by text/.test(b1.toast), b1.toast);
  await P.page().click('#gc-lsa-pm [data-pmb="disputed"]'); await sleep(1400);
  const d1 = await P.ev(() => { const b = document.querySelector('#gc-lsa-pm'); const l = window._crm.leads.find(x => x.id === 'LEADIN-p1') || {}; return { t: b ? b.textContent : '', at: l.lsaDisputedAt, btns: b ? b.querySelectorAll('button').length : -1 }; });
  ok(label + ': ✓ Disputed → ?lsamark { LI-p1, disputed }; the bar: "✓ Disputed in Google … closed", no buttons left', POSTS.some(p => p.leadId === 'LI-p1' && p.verdict === 'disputed') && /✓ Disputed in Google by Demo PM — closed/.test(d1.t) && !!d1.at && d1.btns === 0, d1);
  await P.ev(() => window._gcLeadsHub.open('LEADIN-p2')); await sleep(2000);
  ok(label + ': another PM\'s Google lead — no bar', await P.ev(() => !document.querySelector('#gcl-drawer #gc-lsa-pm')));
  await P.ev(() => window._gcLeadsHub.open('L-web')); await sleep(2000);
  ok(label + ': a website lead — no bar', await P.ev(() => !document.querySelector('#gcl-drawer #gc-lsa-pm')));
  ok(label + ': no alert / confirm / prompt', !P.dialogs.length, P.dialogs);
  ok(label + ': no page errors', !P.errs.length, P.errs);
  await P.close(); OPEN.length = 0;
}
try {
  await run('phone', true);
  await run('desk', false);
} catch (e) { ok('crash: ' + (e && e.stack), false); }
for (const x of OPEN) { try { await x.close(); } catch (e) {} }
const nF = R.filter(x => !x).length;
console.log(nF ? 'FAILED ' + (R.length - nF) + '/' + R.length : 'LSAPMBTN ' + R.length + '/' + R.length);
process.exit(nF ? 1 : 0);
