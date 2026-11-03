// test_FIELDPORTAL2.mjs <build-dir> — GrayCo Field part 2 on a phone (390x844, touch) + the desk:
//   📞 / 💬 on the Field job page: "From your own phone" or "From the GrayCo number" (the bridge call through a fake server,
//   texts off until A2P, the reason when calls are not available, the last choice remembered per person, other numbers
//   untouched); 📄 Field Documents lists every paper on the job, grouped, newest first, with the 👁 portal state — the files
//   match the desk Documents list and patch Q's "What the customer sees"; the desk job's 👤 Customer button.
// Usage: node test_FIELDPORTAL2.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs)
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_FIELDPORTAL2.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 500) : '')); } };
const sleep = H.sleep;
const SHOTS = '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/';
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
const REF = c => 'sb:crm-files/' + c.repeat(64) + '.pdf';
H.resetCloud();
H.cset('users', [
  { id: 'u1', name: 'Demo Owner', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true, phone: '9015550100' },
  { id: 'u3', name: 'Sample PM', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true, phone: '9015550111' }]);
H.cset('projects', [
  { id: 'P1', po: 'PO-1001', name: 'Demo Kitchen Remodel', client: 'Sample Homeowner', clientPhone: '9015551234', phone: '9015551234', clientEmail: 'home@example.com', address: '100 Demo St, Bartlett TN', pm: 'Sample PM', status: 'Active', contract: 25000, contractSigned: true, updatedAt: ago(1),
    portalLinks: [{ id: 'L1', title: 'Selections sheet', url: 'https://docs.google.com/document/d/abc/edit', at: ago(3) }] },
  { id: 'P2', name: 'Other Job', client: 'Other', address: '2 Rd', pm: 'Sample PM', status: 'Active', contractSigned: true }]);
H.cset('projectDocs', [
  { id: 'D1', pid: 'P1', name: 'Signed contract.pdf', cat: 'Contracts', type: 'application/pdf', ref: REF('1'), uploadedAt: ago(9) },
  { id: 'D2', pid: 'P1', name: 'Job sheet for sub.pdf', cat: 'Sub Docs', type: 'application/pdf', ref: REF('2'), uploadedAt: ago(8) },
  { id: 'D3', pid: 'P1', name: 'Roof photo.jpg', cat: 'photo', source: 'companycam', type: 'image/jpeg', ref: 'sb:crm-files/' + '3'.repeat(64) + '.jpg', uploadedAt: ago(7) },
  { id: 'D4', pid: 'P1', name: 'Conditional lien waiver.pdf', cat: 'Lien Waivers', type: 'application/pdf', ref: REF('4'), uploadedAt: ago(2) },
  { id: 'D5', pid: 'P1', name: 'permit.pdf', cat: 'Permits', source: 'gmail', type: 'application/pdf', ref: REF('5'), uploadedAt: ago(1) },
  { id: 'D9', pid: 'P2', name: 'Not this job.pdf', cat: 'Contracts', type: 'application/pdf', ref: REF('9'), uploadedAt: ago(1) }]);
H.cset('estimates', [{ id: 'E1', pid: 'P1', name: 'Kitchen proposal', status: 'sent', totalCharge: 25000, savedAt: ago(20) }]);
H.cset('invs', [{ id: 'INV1', pid: 'P1', type: 'client', num: '1001', amt: 10000, status: 'paid', date: ago(6).slice(0, 10) }]);
H.cset('cos', [{ id: 'CO1', pid: 'P1', desc: 'Extra outlet', amt: 400, status: 'approved', date: ago(4).slice(0, 10) }]);
H.cset('punch', []); H.cset('timesheets', []);
const CAP = { calls: [], fc: { ok: true, ready: true, myPhone: '(901) 555-0100', paused: false, why: '' } };
async function mocks(c){
  await c.ctx.route(u => /\/\.netlify\/functions\/texts\?fieldcall=1/.test(u.href || u), async r => {
    if (r.request().method() === 'POST') { CAP.calls.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, calling: '(901) 555-0100', customer: '(901) 555-1234' }) }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CAP.fc) });
  });
  await c.ctx.route(u => /\/\.netlify\/functions\/portal-sign/.test(u.href || u), async r => {
    let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    if (b.action === 'list') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: b.projectId === 'P1' ? [{ id: 'SR1', pid: 'P1', kind: 'contract', title: 'Kitchen contract', status: 'pending', createdAt: ago(5) }] : [] }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}
const W = []; const close = async () => { for (const c of W) await c.b.close().catch(() => {}); };
try {
  // ══════════ the phone (owner) ══════════
  const O = await H.computer('OWN', { build, mobile: true }); W.push(O); await mocks(O);
  await H.signIn(O, 'wjohnson@grayco-cs.com', 9000);
  ok(!!(await H.waitFor(O, () => !!document.querySelector('#_gcJobPick.gc-fh'), null, 40000)), 'the phone opens in GrayCo Field');
  await O.ev(() => { document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href^="tel:"],a[href^="sms:"]'); if (a) e.preventDefault(); }); });   // the test never really dials
  await O.ev(() => { document.querySelectorAll('#_gcJobPick').forEach(o => o.remove()); window._gcJobDashboard('P1'); }); await sleep(1500);
  const tel = O.page().locator('#_gcJobDash a[href^="tel:"]').first();
  ok(await tel.count() > 0, 'the job page has 📞 Call');
  await tel.tap(); await sleep(800);
  let ch = await O.ev(() => { const s = document.querySelector('.gcfp-sheet[data-fpfrom="call"]'); if (!s) return null; const g = s.querySelector('[data-from="grayco"]'); return { own: (s.querySelector('a[data-from="own"]') || {}).getAttribute && s.querySelector('a[data-from="own"]').getAttribute('href'), gc: !!g, dis: g && g.disabled, why: g && g.innerText, first: s.querySelector('.bd > *').getAttribute('data-from') }; });
  ok(!!ch && ch.own === 'tel:9015551234' && ch.gc && !ch.dis && /calls your cell \(901\) 555-0100 first/.test(ch.why), '📞 Call → "From your own phone" (tel: the customer) or "From the GrayCo number" (calls my cell first)', ch);
  await O.page().screenshot({ path: SHOTS + 'fieldportal2_call.png' });
  await O.page().locator('.gcfp-sheet [data-from="grayco"]').tap(); await sleep(800);
  ok(CAP.calls.length === 1 && CAP.calls[0].pid === 'P1', 'From the GrayCo number → the bridge call for THIS job (server: texts.js?fieldcall=1)', CAP.calls);
  ok(await O.ev(() => /Calling your phone \(901\) 555-0100/.test((document.getElementById('gcfp-toast') || {}).textContent || '')), 'it says the GrayCo number is calling my phone first');
  await tel.tap(); await sleep(800);
  ch = await O.ev(() => { const s = document.querySelector('.gcfp-sheet[data-fpfrom="call"]'); return { first: s.querySelector('.bd > *').getAttribute('data-from'), last: (s.querySelector('[data-from="grayco"] .gcfp-last') || {}).textContent || '' }; });
  ok(ch.first === 'grayco' && /last used/.test(ch.last), 'the last choice (GrayCo number) is remembered and offered first', ch);
  await O.ev(() => document.querySelector('.gcfp-sheet a[data-from="own"]').click()); await sleep(300);
  ok(await O.ev(() => localStorage.getItem('gc_callfrom:wjohnson@grayco-cs.com') === 'own' && !document.querySelector('.gcfp-sheet')), '"From your own phone" → the phone dials (tel:) and that choice is remembered');
  // calls not available → the reason, not a dead button
  CAP.fc = { ok: true, ready: false, myPhone: '', paused: false, why: 'Calls from the GrayCo number need Twilio set up (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM on Netlify).' };
  await O.ev(() => window._gcFP2 && 0); await O.ev(() => { /* forget the cached status */ });
  await O.page().reload(); await H.waitFor(O, () => typeof window._gcJobDashboard === 'function' && (window._crm && window._crm.projects || []).length > 0, null, 60000); await sleep(3000);
  await O.ev(() => { document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href^="tel:"],a[href^="sms:"]'); if (a) e.preventDefault(); }); document.querySelectorAll('#_gcJobPick').forEach(o => o.remove()); window._gcJobDashboard('P1'); }); await sleep(1500);
  await O.page().locator('#_gcJobDash a[href^="tel:"]').first().tap(); await sleep(1000);
  ch = await O.ev(() => { const g = document.querySelector('.gcfp-sheet [data-from="grayco"]'); return { dis: g && g.disabled, why: g && g.innerText }; });
  ok(ch.dis && /Twilio set up/.test(ch.why), 'Twilio not set up → "From the GrayCo number" is off with the reason', ch);
  await O.ev(() => document.querySelectorAll('.gcfp-sheet').forEach(o => o.remove()));
  // 💬 Text
  await O.page().locator('#_gcJobDash a[href^="sms:"]').first().tap(); await sleep(800);
  ch = await O.ev(() => { const s = document.querySelector('.gcfp-sheet[data-fpfrom="text"]'); const g = s && s.querySelector('[data-from="grayco"]'); return { own: s && s.querySelector('a[data-from="own"]').getAttribute('href'), dis: g && g.disabled, why: g && g.innerText }; });
  ok(/^sms:9015551234/.test(ch.own || '') && ch.dis && /starts after A2P registration/.test(ch.why), '💬 Text → own phone (sms:), GrayCo number off: "Texting from the GrayCo number starts after A2P registration"', ch);
  await O.ev(() => document.querySelectorAll('.gcfp-sheet').forEach(o => o.remove()));
  // another number on the page dials as before
  const other = await O.ev(() => { const a = document.createElement('a'); a.href = 'tel:9015557777'; a.id = 'fp-other'; a.textContent = 'PM'; document.querySelector('#_gcJobDash .gcfp-body').appendChild(a); a.click(); return !document.querySelector('.gcfp-sheet'); });
  ok(other, 'a number that is not the customer\'s (e.g. the PM) dials as before — no chooser');
  // ── 📄 Documents ──
  await O.ev(() => { document.querySelectorAll('._gcSheetOv').forEach(o => o.remove()); window._gcJobDashboard('P1'); }); await sleep(1200);
  await O.page().locator('#_gcJobDash ._jdAct[data-fn="docs"]').first().evaluate(e => e.click());
  await H.waitFor(O, () => !!document.querySelector('.gcfp-docs .gcfp-doc'), null, 15000); await sleep(800);
  const dl = await O.ev(async () => {
    const box = document.querySelector('.gcfp-docs'), items = [...box.querySelectorAll('.gcfp-doc')];
    const head = box.querySelector('.gcfp-dk').textContent;
    const groups = [...box.querySelectorAll('.gcfp-dg')].map(g => g.getAttribute('data-g') + ':' + g.querySelectorAll('.gcfp-doc').length);
    const files = items.filter(b => b.getAttribute('data-k') === 'doc').map(b => ({ id: b.getAttribute('data-id'), shown: b.getAttribute('data-shown') === '1' }));
    const kinds = items.map(b => b.getAttribute('data-k'));
    const idbDocs = ((await window.idbGet('projectDocs')) || []).filter(d => d && d.pid === 'P1' && d.deleted !== true).map(d => d.id);
    const order = [...box.querySelectorAll('.gcfp-dg')].map(g => [...g.querySelectorAll('.gcfp-doc small')].map(s => (s.textContent.match(/\d{4}-\d{2}-\d{2}/) || [''])[0]));
    const oldList = !!document.querySelector('._jdlDoc') || /FILES \(0\)/.test(document.body.innerText);
    return { head, n: items.length, groups, files, kinds, idbDocs, order, oldList, mail: /from e-mail/.test(box.innerText) };
  });
  ok(dl.n >= 10 && new RegExp('\\(' + dl.n + '\\)').test(dl.head) && !dl.oldList, 'Field Documents: one list of every paper on the job (no more "FILES (0)")', dl);
  ok(['contracts', 'money', 'closing', 'files'].every(g => dl.groups.some(x => x.indexOf(g + ':') === 0)), 'grouped: Contracts & signatures · Invoices & COs · Closing · Files', dl.groups);
  ok(['doc', 'est', 'sign', 'inv', 'co', 'link'].every(k => dl.kinds.indexOf(k) >= 0) && dl.mail, 'it has the files (an e-mail attachment too), the proposal, the signature request, the invoice, the change order and the Google Doc link', dl.kinds);
  ok(dl.files.length === dl.idbDocs.length && dl.files.map(f => f.id).sort().join() === dl.idbDocs.sort().join(), 'the files match the desk Documents list for this job (5, not the other job\'s)', { files: dl.files, desk: dl.idbDocs });
  ok(dl.order.every(l => l.filter(Boolean).every((d, i, a) => i === 0 || a[i - 1] >= d)), 'newest first in each group', dl.order);
  await O.page().screenshot({ path: SHOTS + 'fieldportal2_docs.png' });
  // the 👁 state = patch Q's "What the customer sees" (the portal rule)
  await O.page().locator('#gcq-docs-btn').evaluate(e => e.click()); await sleep(1500);
  const q = await O.ev(() => [...document.querySelectorAll('#gcq-docs .gcq-share')].map(c => ({ id: c.getAttribute('data-id'), on: c.checked })));
  const mine = dl.files.map(f => f.id + ':' + f.shown).sort().join(), theirs = q.map(x => x.id + ':' + x.on).sort().join();
  ok(q.length === dl.files.length && mine === theirs, 'each file\'s 👁 matches "What the customer sees" (the portal\'s rule): the contract and lien waiver yes; the sub job sheet and the CompanyCam photo no', { mine, theirs });
  await O.ev(() => { const o = document.getElementById('gcq-docs'); if (o) o.remove(); });
  // opening: an invoice opens the invoice; a file opens a new tab in the tap
  const pg = O.ctx.waitForEvent('page', { timeout: 4000 }).catch(() => null);
  await O.page().locator('.gcfp-docs .gcfp-doc[data-k="doc"][data-id="D1"]').evaluate(e => e.click());
  ok(!(await pg) && !!(await O.ev(() => !!document.querySelector('#gc-viewer [data-gv="back"]'))), 'tapping a file opens it as a page in the CRM with ‹ Back — no new tab, no pop-up (patch DOCOPEN)');
  await O.ev(() => { const b = document.querySelector('#gc-viewer [data-gv="back"]'); if (b) b.click(); });
  for (const x of O.pages.slice(1)) await x.close().catch(() => {});
  ok(await noSide(O), 'Documents: no sideways scroll');
  ok(!O.errs.length, 'phone: no page errors', O.errs.slice(0, 3));
  await O.b.close(); W.length = 0;

  // ══════════ the desk: the job's 👤 Customer button ══════════
  const K = await H.computer('DESK', { build }); W.push(K); await mocks(K);
  await H.signIn(K, 'wjohnson@grayco-cs.com', 9000);
  await H.waitFor(K, () => (window._crm && window._crm.projects || []).length > 0 && typeof window._openJobDetail === 'function', null, 60000);
  await K.ev(() => { if (window._setView) window._setView('projects'); }); await sleep(1500);
  await K.ev(() => window._openJobDetail(window._crm.projects.find(p => p.id === 'P1'))); await sleep(1000);
  const btn = await H.waitFor(K, () => !!document.querySelector('main .gc-a8-bar [data-d1cust]'), null, 20000);
  ok(!!btn, 'desk job page: the 🧰 Job tools bar has 👤 Customer');
  if (btn) { await K.ev(() => document.querySelector('main .gc-a8-bar [data-d1cust]').click()); await sleep(2000); }
  const cp = await K.ev(() => { const o = document.querySelector('.gcd1-ov'); return o ? o.innerText.slice(0, 1500) : ''; });
  ok(/Sample Homeowner/.test(cp) && /1 job/.test(cp) && /\(901\) 555-1234|901-555-1234|9015551234|home@example\.com/.test(cp) && !/Customer · 0 jobs/.test(cp), 'desk 👤 Customer opens the job\'s customer (name, contact, this job counted)', cp.slice(0, 300));
  ok(!K.errs.length, 'desk: no page errors', K.errs.slice(0, 3));
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
async function noSide(c){ return c.page().evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth + 1); }
await close();
console.log(`FIELDPORTAL2 ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
