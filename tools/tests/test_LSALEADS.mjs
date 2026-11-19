// test_LSALEADS.mjs <build-dir> — patch LSALEADS (owner 11/19): Google LSA calls on the Leads page, the office intake, the 🏢 outreach list
// seed. Offline harness (made-up people, numbers and companies; the server answers are fakes):
//   1. admin, desk: a Google LSA call about water damage (Mitigation by its words) is on the Leads list while the page shows Construction
//      leads, with its "📞 <code> ⏳" chip; "📞 Google calls" lists it with the number (tap to call), call time, length, job type, ▶ Play,
//      the 📝 summary, the code + state, the PM picker preselected with the ⚙ default PM (Nick) → ➡ Send to PM posts ?lsaassign;
//      the old LSAVET "real lead?" card is gone; a deleted Google call says so with ↩ Put back;
//   2. the office, phone (390 px): the "📞 Google call — fill in the lead" pop-up → the form (👍/👎/❓, what they need, name / number /
//      address, the big "➡ Send to PM" with Nick preselected, the small "Send to admin to assign") → ?lsaintake; nothing wider than the screen;
//   3. 🛰 Outreach with no cloud list → the 🏢 Company outreach list fills from ?outreachseed (desk and phone) and is saved to the cloud.
import { computer, signIn, sleep, cset, cget, resetCloud, waitFor, onFn, ACCOUNTS } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 600) : '')); };
const build = process.argv[2];
ACCOUNTS['nthomas@grayco-cs.com'] = { id: 'u-nick', name: 'Nick Thomas', role: 'admin' };
const at = new Date().toISOString(), recent = new Date(Date.now() - 20 * 60e3).toISOString();
function seed(){
  resetCloud();
  cset('users', [{ id: 'u-wesley', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true },
    { id: 'u-nick', name: 'Nick Thomas', email: 'nthomas@grayco-cs.com', role: 'Admin', active: true },
    { id: 'u-office', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office', active: true },
    { id: 'u-pm', name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }]);
  cset('leads', [
    { id: 'LEADIN-lsa1', inboxId: 'LI-lsa1', name: 'Google LSA caller (901) 555-0421', phone: '(901) 555-0421', source: 'Google LSA', leadSource: 'Google LSA', lsaCheck: 'pending', lsaCall: true, scope: 'water damage in the kitchen ceiling', notes: 'water damage', stage: 'New Lead', createdAt: at, updatedAt: at },
    { id: 'L-plain', name: 'Demo Kitchen Remodel', source: 'Referral', stage: 'New Lead', createdAt: at, updatedAt: at }]);
  cset('gc_tombstones', { 'leads:LEADIN-lsa0': at });
}
const ITEMS = [
  { id: 'LI-lsa1', code: 'K7Q2', title: 'Google LSA call', name: 'Google LSA caller (901) 555-0421', phone: '9015550421', at: recent, status: 'imported', check: 'pending', pm: '', pmEmail: '', call: true, emergency: false, link: '', intake: null, repeats: 0,
    info: { id: 'LI-lsa1', phone: '9015550421', callAtLabel: '11/19, 8:21 AM', dur: '2m 14s', durSec: 134, job: 'Roofer — roof repair', outcome: 'answered', lsa: true, recs: [{ id: 'RE' + 'a'.repeat(32), kind: 'call', dur: 134, durLabel: '2m 14s' }], google: null, transcript: { summary: 'Pat Smith — roof leak over the kitchen, 12 Oak St, Bartlett; wants a call back today.', text: 'Hi this is Pat…' } } },
  { id: 'LI-lsa0', code: 'ABCD', title: 'Google LSA call', name: 'Google LSA caller (10:05 AM)', phone: '', at: recent, status: 'imported', check: 'pending', pm: '', pmEmail: '', call: true, intake: null, repeats: 0, info: { callAtLabel: '11/19, 10:05 AM', recs: [] } }];
const POSTS = [];
onFn('texts', ({ query, body, method }) => {
  if (query.lsaleads) return { ok: true, items: ITEMS, pms: [{ id: 'u-pm', name: 'Demo PM', email: 'pm@grayco-cs.com' }, { id: 'u-nick', name: 'Nick Thomas', email: 'nthomas@grayco-cs.com' }, { id: 'u-wesley', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com' }], defaultPm: 'u-nick', defaultPmName: 'Nick Thomas', admin: true };
  if (query.lsaassign) { POSTS.push({ q: 'lsaassign', body }); return { ok: true, code: 'K7Q2', good: true, pm: 'Nick Thomas' }; }
  if (query.lsaintake) { POSTS.push({ q: 'lsaintake', body }); return { ok: true, code: 'K7Q2', rating: body.rating, action: body.action, pm: body.action === 'pm' ? 'Nick Thomas' : '' }; }
  return { ok: true };
});
const OUT = []; for (let i = 0; i < 607; i++) OUT.push({ id: 'GC-demo-' + i, phase: i < 106 ? 1 : 2, sheet: 'Demo sheet', title: 'Demo Company ' + i, pri: 1 + (i % 3), inz: i % 2 === 0, what: 'Demo', how: 'Demo', links: [], emails: [], phones: [], person: '', raw: {} });
let seedCalls = 0;
onFn('bid-inbox', ({ query }) => { if (query.outreachseed) { seedCalls++; return { ok: true, built: '2026-10-19', items: OUT }; } return { ok: true, items: [] }; });
const OPEN = [];
try {
  /* ── 1. admin, desk ── */
  seed();
  const A = await computer('W', { build }); OPEN.push(A);
  ok('admin signs in', await signIn(A, 'wjohnson@grayco-cs.com', 20000));
  await sleep(5000); await A.ev(() => window._setView('leads')); await sleep(3500);
  await A.ev(() => window._gcLsaCalls && window._gcLsaCalls.load()); await sleep(1500);
  const st = await A.ev(() => ({ view: window._gcCo && window._gcCo.leadView ? window._gcCo.leadView() : '', ofLead: window._gcCo.ofLead(window._crm.leads.find(l => l.id === 'LEADIN-lsa1')), rows: [...document.querySelectorAll('#gc-leads-hub [data-gcl-id]')].map(r => r.getAttribute('data-gcl-id')),
    chip: (document.querySelector('#gc-leads-hub [data-gcl-id="LEADIN-lsa1"] .gc-lc-chip') || {}).textContent || '', btn: (document.getElementById('gc-lc-btn') || {}).textContent || '', vet: !!document.querySelector('#gc-lsa-btn:not([style*="none"])') && getComputedStyle(document.getElementById('gc-lsa-btn')).display !== 'none' }));
  ok('a water-damage Google call (Mitigation by its words) is on the Construction leads list (LSAANYCO)', st.view === 'construction' && st.ofLead === 'mitigation' && st.rows.includes('LEADIN-lsa1'), st);
  ok('its row has the "📞 K7Q2 ⏳" chip', /📞 K7Q2 ⏳/.test(st.chip), st);
  ok('"📞 Google calls" with the count of calls to fill in; the old LSAVET card is not shown', /Google calls\s*2/.test(st.btn) && !st.vet, st);
  await A.page().click('#gc-lc-btn'); await sleep(1200);
  const pn = await A.ev(() => { const ov = document.getElementById('gc-lc-ov'); const row = ov && ov.querySelector('[data-lc-row="LI-lsa1"]'); const r0 = ov && ov.querySelector('[data-lc-row="LI-lsa0"]');
    return { ov: !!ov, tel: row && (row.querySelector('a[href="tel:9015550421"]') || {}).textContent, txt: row ? row.textContent : '', play: !!(row && row.querySelector('[data-rec-play]')), sel: row && row.querySelector('[data-lc-pm]') ? row.querySelector('[data-lc-pm]').value : '', fill: !!(row && row.querySelector('[data-lc-in]')),
      def: ov && ov.querySelector('[data-lc-def]') ? ov.querySelector('[data-lc-def]').value : '', gone: r0 ? r0.textContent : '' }; });
  ok('the panel: the number (tap to call), call time, length, job type, ▶ Play, the 📝 summary, the code + state', pn.ov && /\(901\) 555-0421/.test(pn.tel || '') && /8:21 AM/.test(pn.txt) && /2m 14s/.test(pn.txt) && /Roofer — roof repair/.test(pn.txt) && pn.play && /roof leak over the kitchen/.test(pn.txt) && /K7Q2/.test(pn.txt) && /not marked yet/.test(pn.txt), pn);
  ok('the PM picker is preselected with the ⚙ default PM (Nick); admins see the ⚙ setting', pn.sel === 'nthomas@grayco-cs.com' && pn.def === 'u-nick' && pn.fill, pn);
  ok('a deleted Google call says it is not on the Leads list', /Not on the Leads list — it was deleted/.test(pn.gone), pn.gone);
  await A.page().click('#gc-lc-ov [data-lc-go="LI-lsa1"]'); await sleep(1200);
  ok('➡ Send to PM → ?lsaassign { leadId, pmEmail: Nick } (= GOOD K7Q2 Nick)', POSTS.some(p => p.q === 'lsaassign' && p.body.leadId === 'LI-lsa1' && p.body.pmEmail === 'nthomas@grayco-cs.com'), POSTS);
  ok('no page errors (desk)', !A.errs.length, A.errs);
  /* the open lead's page has the bar */
  await A.ev(() => { const o = document.getElementById('gc-lc-ov'); if (o) o.remove(); window._gcLeadsHub.open('LEADIN-lsa1'); }); await sleep(2500);
  const dr = await A.ev(() => { const b = document.querySelector('#gcl-drawer #gc-lc-bar'); return b ? b.textContent : ''; });
  ok('the open Google lead shows its code, state and ➡ Send to PM', /K7Q2/.test(dr) && /Send to PM/.test(dr), dr);
  /* 3a. outreach on the desk */
  await A.ev(() => { try { window._gcLeadsHub.close(); } catch (e) {} const b = [...document.querySelectorAll('#gc-leads-hub button')].find(b => /Outreach/.test(b.textContent)); if (b) b.click(); });
  await waitFor(A, () => window._gcOutreach && window._gcOutreach.items().length > 0, null, 20000);
  const ol = await A.ev(() => ({ n: window._gcOutreach.items().length, rows: document.querySelectorAll('#gc-ol .ol-it').length, head: (document.querySelector('#gc-ol .ol-top') || {}).textContent || '' }));
  ok('🛰 Outreach with no cloud list → the 🏢 Company outreach list fills from the staff-only seed (607 companies)', ol.n === 607 && ol.rows > 0 && /607 companies/.test(ol.head) && seedCalls === 1, ol);
  await sleep(4000);
  const cl = cget('gc_outreach_list');
  ok('… and is saved to the cloud for every computer', cl && Array.isArray(cl.items) && cl.items.length === 607, cl && cl.items && cl.items.length);
  await A.close(); OPEN.length = 0;

  /* ── 2. the office, phone ── */
  seed();
  const O = await computer('O', { build, mobile: true }); OPEN.push(O);
  ok('office signs in on a phone', await signIn(O, 'office@grayco-cs.com', 20000));
  await sleep(4000);
  await O.ev(() => window._gcLsaCalls && window._gcLsaCalls.load());
  const pop = await waitFor(O, () => { const p = document.getElementById('gc-in-pop'); return p ? p.textContent : ''; }, null, 15000);
  ok('the office gets "📞 Google call — fill in the lead"', /Google call — fill in the lead/.test(pop || ''), pop);
  await O.page().click('#gc-in-pop [data-pop-go]'); await sleep(800);
  const fm = await O.ev(() => { const ov = document.getElementById('gc-in-ov'); if (!ov) return null; const go = ov.querySelector('[data-in-go="pm"]'), ad = ov.querySelector('[data-in-go="admin"]');
    return { pm: ov.querySelector('[data-in-pm]').value, ph: ov.querySelector('[data-in-ph]').value, r: ov.querySelectorAll('[data-in-r]').length, goH: go.getBoundingClientRect().height, adH: ad.getBoundingClientRect().height, goW: go.getBoundingClientRect().width, adW: ad.getBoundingClientRect().width, sw: document.documentElement.scrollWidth, vw: innerWidth, box: ov.querySelector('[role=dialog]').getBoundingClientRect().width }; });
  ok('the intake form: 👍/👎/❓, the number filled in, Nick preselected; "➡ Send to PM" is the big button, "Send to admin" the small one', fm && fm.r === 3 && fm.pm === 'nthomas@grayco-cs.com' && /555-0421/.test(fm.ph) && fm.goH > fm.adH && fm.goW > fm.adW * 1.5, fm);
  ok('the form fits a 390 px phone (no sideways scroll)', fm && fm.sw <= fm.vw + 1 && fm.box <= fm.vw, fm);
  await O.page().click('#gc-in-ov [data-in-go="pm"]'); await sleep(300);
  const need = await O.ev(() => (document.querySelector('#gc-in-ov [data-in-msg]') || {}).textContent || '');
  ok('a rating is needed first', /Tap 👍 Good/.test(need), need);
  await O.page().click('#gc-in-ov [data-in-r="good"]'); await O.page().fill('#gc-in-ov [data-in-desc]', 'roof leak over the kitchen, today'); await O.page().fill('#gc-in-ov [data-in-addr]', '12 Oak St, Bartlett');
  await O.page().click('#gc-in-ov [data-in-go="pm"]'); await sleep(1200);
  const pi = POSTS.find(p => p.q === 'lsaintake');
  ok('➡ Send to PM → ?lsaintake { rating: good, the description, the address, action pm, Nick }', pi && pi.body.leadId === 'LI-lsa1' && pi.body.rating === 'good' && pi.body.action === 'pm' && pi.body.pmEmail === 'nthomas@grayco-cs.com' && /roof leak/.test(pi.body.desc) && /12 Oak/.test(pi.body.address), pi);
  ok('the form closes', await O.ev(() => !document.getElementById('gc-in-ov')));
  ok('patch MKTOFFICE: the intake asks "How did you hear about us?" (Google LSA preselected) and sends it', pi && pi.body.howHeard === 'Google LSA', pi && pi.body);
  /* send to admin */
  POSTS.length = 0; await O.ev(() => window._gcLsaCalls.intake('LI-lsa0')); await sleep(500);
  await O.page().click('#gc-in-ov [data-in-r="unsure"]'); await O.page().click('#gc-in-ov [data-in-go="admin"]'); await sleep(1000);
  ok('"Send to admin to assign" → ?lsaintake action admin', POSTS.some(p => p.q === 'lsaintake' && p.body.leadId === 'LI-lsa0' && p.body.action === 'admin' && p.body.rating === 'unsure'), POSTS);
  /* 3b. outreach on the phone */
  await O.ev(() => window._setView('leads')); await sleep(3000);
  await O.ev(() => { const b = [...document.querySelectorAll('#gc-leads-hub button')].find(b => /Outreach/.test(b.textContent)); if (b) b.click(); });
  await waitFor(O, () => window._gcOutreach && window._gcOutreach.items().length > 0, null, 20000);
  const ol2 = await O.ev(() => ({ n: window._gcOutreach.items().length, rows: document.querySelectorAll('#gc-ol .ol-it').length, vis: (document.getElementById('gc-ol') || { getClientRects: () => [] }).getClientRects().length, sw: document.documentElement.scrollWidth, vw: innerWidth }));
  ok('phone: 🛰 Outreach shows the company outreach list', ol2.n === 607 && ol2.rows > 0 && ol2.vis > 0, ol2);
  ok('no page errors (phone)', !O.errs.length, O.errs);
} catch (e) { ok('crash: ' + (e && e.stack), false); }
for (const x of OPEN) { try { await x.close(); } catch (e) {} }
const nF = R.filter(x => !x).length;
console.log(nF ? 'FAILED ' + (R.length - nF) + '/' + R.length : 'LSALEADS ' + R.length + '/' + R.length);
process.exit(nF ? 1 : 0);
