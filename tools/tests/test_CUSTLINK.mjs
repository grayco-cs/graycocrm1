// test_CUSTLINK.mjs <build-dir> — patch CUSTLINK (owner 11/20): 🧾 Missing job data → "Customer linked" → Fix on J998 · Fire claim- Jackson,
// typed "mid south": the dialog's list finds "Mid-South Restoration Services, LLC" (punctuation / case ignored, partial words), the job's
// client is offered at the top, the old navy autocomplete ("📁 Projects") never opens over the dialog, Save links the customer and the
// checklist item clears. Real-data snapshot (SNAP: a tools/qa/snapshot.mjs rows.ndjson; the customers + projects lists), offline harness wN/harness_N.mjs.
import fs from 'fs';
import { computer, signIn, sleep, cset, cget, resetCloud } from '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const SNAP = process.env.SNAP || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/qa/snap/2026-11-19T05-08-16/rows.ndjson';
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 400) : '')); };
const val = v => { if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) {} } return v; };
const want = { customers: 1, projects: 1 }, got = {};
for (const l of fs.readFileSync(SNAP, 'utf8').split('\n')) { if (!l) continue; const m = /^\{"key":"([^"]+)"/.exec(l); if (!m || !want[m[1]]) continue; got[m[1]] = val(JSON.parse(l).value); }
const CUST = got.customers, PROJ = got.projects;
const J998 = (PROJ || []).find(p => p.autoPO === 'J998');
const MID = (CUST || []).find(c => /mid.?south restoration/i.test(c.name));
ok('snapshot: J998 (client "Mid south Restoration", no customerId) and the "Mid-South Restoration Services, LLC" customer', J998 && !J998.customerId && MID, { j: J998 && J998.client, c: MID && MID.name });
if (!J998 || !MID) process.exit(1);
J998.status = 'Active';   /* the "Customer linked" item is asked from the won stage */
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u2', name: 'Office Demo', email: 'office@grayco-cs.com', role: 'Office', active: true }]);
cset('customers', CUST); cset('projects', PROJ); cset('projects__manifest', { count: 0, chunked: false });
const A = await computer('office@grayco-cs.com', { build: process.argv[2] });
try {
  await signIn(A, 'office@grayco-cs.com', 15000);
  const ready = async () => { for (let i = 0; i < 120; i++) { const r = await A.ev(pid => !!(window._gcDataFull && window._crm && (window._crm.customers || []).length > 50 && (window._crm.projects || []).some(p => p.id === pid)), J998.id); if (r) return true; await sleep(500); } return false; };
  ok('CRM up with the real customers and jobs', await ready());
  const need0 = await A.ev(pid => window._gcDataFull.check(pid).need.map(x => x.key), J998.id);
  ok('J998 asks for "Customer linked"', need0.includes('customer'), need0);
  await A.ev(pid => window._gcDataFull.fix(pid, 'customer'), J998.id); await sleep(800);
  const d0 = await A.ev(() => { const f = document.getElementById('gc-df-fix'), sel = f && f.querySelector('select[data-k="customerId"]'); return f && { title: f.querySelector('.gc-df-fh b').textContent, n: sel.options.length - 1, first: sel.options[1] && sel.options[1].textContent, sel: sel.value }; });
  ok('the dialog opens with every customer; the job\'s client is the top suggestion (picked)', d0 && d0.title === 'Customer linked' && d0.n >= CUST.length - 5 && /^★ Mid-South Restoration/.test(d0.first) && d0.sel === MID.id, d0);
  await A.ev(() => { const s = document.querySelector('#gc-df-fix select[data-k="customerId"]'); s.value = ''; });
  await A.page().click('#gc-df-fix input[data-cs]'); await A.page().keyboard.type('mid south', { delay: 60 }); await sleep(1200);
  const d1 = await A.ev(() => { const f = document.getElementById('gc-df-fix'), sel = f.querySelector('select[data-k="customerId"]'); const ac = [...document.querySelectorAll('._ac-list.show')].map(x => x.textContent.slice(0, 80));
    return { opts: [...sel.options].slice(1).map(o => o.textContent), sel: sel.value, n: f.querySelector('[data-cs-n]').textContent, ac, acInit: !!f.querySelector('input[data-cs]')._acList }; });
  ok('"mid south" finds Mid-South Restoration Services, LLC', d1.opts.some(t => /Mid-South Restoration Services/.test(t)), d1);
  ok('no global autocomplete dropdown over the dialog', d1.ac.length === 0 && !d1.acInit, d1.ac);
  for (const [q, n] of [['MIDSOUTH', 'no space, upper case'], ['restoration mid', 'words in any order'], ['nicole@midsouth', 'the e-mail']]) {
    await A.page().fill('#gc-df-fix input[data-cs]', q); await A.ev(() => document.querySelector('#gc-df-fix input[data-cs]').dispatchEvent(new Event('input', { bubbles: true }))); await sleep(300);
    const o = await A.ev(() => [...document.querySelectorAll('#gc-df-fix select[data-k="customerId"] option')].slice(1).map(o => o.textContent));
    ok('"' + q + '" (' + n + ') finds it too', o.some(t => /Mid-South Restoration Services/.test(t)), o.slice(0, 3));
  }
  await A.page().fill('#gc-df-fix input[data-cs]', 'mid south'); await A.ev(() => document.querySelector('#gc-df-fix input[data-cs]').dispatchEvent(new Event('input', { bubbles: true }))); await sleep(300);
  await A.ev(id => { const s = document.querySelector('#gc-df-fix select[data-k="customerId"]'); s.value = id; }, MID.id);
  await A.page().click('#gc-df-fix [data-df="fixsave"]'); await sleep(2500);
  const after = await A.ev(pid => { const p = window._crm.projects.find(x => x.id === pid); return { cid: p.customerId, client: p.client, need: window._gcDataFull.check(pid).need.map(x => x.key), open: !!document.getElementById('gc-df-fix') }; }, J998.id);
  ok('Save links the customer to the job and the item clears', after.cid === MID.id && !after.need.includes('customer') && !after.open && after.client === J998.client, after);
  let cloud = null; for (let i = 0; i < 30 && !cloud; i++) { const v = val(cget('projects')); const p = (v || []).find(x => x.id === J998.id); if (p && p.customerId === MID.id) cloud = p; else await sleep(500); }
  ok('and it is saved to the cloud', !!cloud);
  /* INPUT PERFORMANCE FIX: a search box gets ONE settle event after typing stops (was: an input event every 150 ms, for ever) */
  await A.ev(() => { const i = document.createElement('input'); i.id = 'cl-srch'; i.placeholder = 'Search leads…'; i.style.cssText = 'position:fixed;top:120px;left:300px;z-index:2147483001'; i.__n = 0; i.addEventListener('input', () => { i.__n++; }); document.body.appendChild(i); });
  await A.page().click('#cl-srch'); await A.page().keyboard.type('abc', { delay: 40 }); await sleep(1500);
  const ev1 = await A.ev(() => document.getElementById('cl-srch').__n); await sleep(1500);
  const ev2 = await A.ev(() => document.getElementById('cl-srch').__n);
  ok('a search box: 3 keystrokes + 1 settle event, then quiet (no 150 ms loop)', ev1 === 4 && ev2 === 4, { ev1, ev2 });
  /* the old autocomplete still works outside dialogs, now white */
  await A.ev(() => { const i = document.createElement('input'); i.id = 'cl-ac'; i.placeholder = 'Client name'; i.style.cssText = 'position:fixed;top:160px;left:300px;width:300px;z-index:2147483001'; document.body.appendChild(i); });
  await sleep(900); await A.page().click('#cl-ac'); await A.page().keyboard.type('mid south', { delay: 40 }); await sleep(800);
  const pan = await A.ev(() => { const l = document.querySelector('._ac-list.show'); if (!l) return null; const cs = getComputedStyle(l), it = l.querySelector('._ac-item'); return { bg: cs.backgroundColor, fg: it && getComputedStyle(it).color, cat: getComputedStyle(l.querySelector('._ac-cat')).backgroundColor, text: l.textContent.slice(0, 80) }; });
  ok('outside a dialog the autocomplete still opens, white with dark text', pan && pan.bg === 'rgb(255, 255, 255)' && pan.fg === 'rgb(31, 41, 55)' && /J998/.test(pan.text), pan);
  const errs = A.errs.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|net::/i.test(e));
  ok('no page errors', errs.length === 0, errs.slice(0, 5));
} finally { await A.b.close().catch(() => {}); }
const f = R.filter(x => !x).length; console.log((f ? 'FAILED ' : 'ALL PASS ') + (R.length - f) + '/' + R.length); process.exit(f ? 1 : 0);
