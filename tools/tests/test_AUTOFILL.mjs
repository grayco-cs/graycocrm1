// test_AUTOFILL.mjs <build-dir> — patch AUTOFILL (owner 11/25, ✏️ Edit Project): typing "rramos" in CLIENT EMAIL only listed jobs
//   ("📁 Projects"). "it should pull his email up cuz I've used it before" + "and autofill his phone if so".
//   Desk (1440x900) as the owner, made-up jobs: Y744 (client Head Start, rramos@demo.test, 901-555-0199), D200 with empty client
//   boxes, D300 with a different phone already typed.
//   · D200 → Edit Project → type "rramos" in Client Email: a "👤 Customers" row (rramos@demo.test · 901-555-0199) comes first, no
//     Projects group on the e-mail box; ↓ + Enter picks it → e-mail, phone and the empty name are filled; Save keeps them on the job.
//   · typing "5550199" in the phone box finds the same row.
//   · D300 (phone 901-555-7777 typed): a pick fills the e-mail and leaves the phone as it was (a note says so).
//   · no page errors.
// Usage: node test_AUTOFILL.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs) — made-up data, nothing leaves the machine.
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_AUTOFILL.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
H.resetCloud();
H.cset('users', [{ id: 'U2', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', active: true, payType: 'owner' }]);
const J = (id, po, name, client, email, phone) => ({ id, autoPO: po, name, client, clientEmail: email, clientPhone: phone, address: '1 Demo Ln, Lakeland, TN', type: 'Commercial', status: 'active', contract: 330000, startDate: '2026-03-05', drawSchedule: '50/50' });
H.cset('projects', [J('P1', 'Y744', 'Phillips - CDI', 'Head Start', 'rramos@demo.test', '901-555-0199'), J('P2', 'D200', 'New Demo Job', '', '', ''), J('P3', 'D300', 'Other Demo Job', '', '', '901-555-7777')]);
H.cset('customers', [{ id: 'C1', name: 'Head Start', email: '', phone: '' }]);
let c;
const FIELD = { name: /^client( name)?$/i, email: /^client e-?mail$/i, phone: /^client phone$/i };
const vals = () => c.ev(() => { const o = {}; [...document.querySelectorAll('main input')].forEach(i => { let l = ''; for (let el = i.parentElement, k = 0; el && k < 3 && !l; el = el.parentElement, k++) { const L = [...el.children].find(x => x.tagName === 'LABEL'); if (L) l = L.textContent.trim(); } if (/^client/i.test(l)) o[l.toLowerCase()] = i.value; }); return o; });
async function focusField(re){ await c.ev(src => { const re = new RegExp(src, 'i'); const i = [...document.querySelectorAll('main input')].find(i => { let l = ''; for (let el = i.parentElement, k = 0; el && k < 3 && !l; el = el.parentElement, k++) { const L = [...el.children].find(x => x.tagName === 'LABEL'); if (L) l = L.textContent.trim(); } return re.test(l); }); i.scrollIntoView({ block: 'center' }); i.focus(); i.click(); }, re.source); }
const list = () => c.ev(() => { const l = document.querySelector('._ac-list.show'); return l ? { cats: [...l.querySelectorAll('._ac-cat')].map(x => x.textContent), rows: [...l.querySelectorAll('._ac-item')].map(x => x.textContent), first: (l.querySelector('._ac-item') || {}).getAttribute && l.querySelector('._ac-item').getAttribute('data-type'), note: (l.querySelector('._af-note') || {}).textContent || '', bg: getComputedStyle(l).backgroundColor } : null; });
async function openEdit(pid){
  await c.ev(() => window._setView('projects')); await H.sleep(1200);
  await c.ev(pid => { const j = window._crm.projects.find(x => x && x.id === pid); window._openJobDetail(j); }, pid); await H.sleep(1800);
  await c.ev(() => { const bt = [...document.querySelectorAll('main button')].find(x => /Edit Project/.test(x.textContent)); bt && bt.click(); }); await H.sleep(900);
}
try {
  c = await H.computer('DESK', { build });
  await H.signIn(c, 'wjohnson@grayco-cs.com', 9000);
  await H.waitFor(c, () => window._crm && (window._crm.projects || []).length >= 3 ? 1 : 0, null, 60000);
  await H.sleep(2000);
  const e0 = c.errs.length;
  await openEdit('P2');
  ok(Object.keys(await vals()).length >= 3, 'Edit Project shows the client name / phone / e-mail boxes', await vals());
  await focusField(FIELD.email); await c.page().keyboard.type('rramos', { delay: 40 }); await H.sleep(700);
  let L = await list();
  ok(L && L.cats[0] === '👤 Customers' && L.first === 'cust', 'typing "rramos" in Client Email: a 👤 Customers group comes first', L);
  ok(L && /rramos@demo\.test/.test(L.rows[0]) && /901-555-0199/.test(L.rows[0]) && /Head Start/.test(L.rows[0]), 'its row is name · e-mail · phone', L && L.rows);
  ok(L && !L.cats.some(t => /Projects/.test(t)), 'the e-mail box no longer lists Projects (a pick there wrote the job name into it)', L && L.cats);
  ok(L && L.bg === 'rgb(255, 255, 255)', 'light dropdown', L && L.bg);
  await c.page().keyboard.press('ArrowDown'); await c.page().keyboard.press('Enter'); await H.sleep(1200);
  let V = await vals();
  ok(V['client email'] === 'rramos@demo.test', '↓ + Enter: the e-mail is filled', V);
  ok(V['client phone'] === '901-555-0199', '… and the phone', V);
  ok(V['client'] === 'Head Start' || V['client name'] === 'Head Start', '… and the empty client name', V);
  ok(!(await list()), 'the dropdown closes after the pick', await list());
  await c.ev(() => { const bt = [...document.querySelectorAll('main button')].find(x => x.textContent.trim() === 'Save'); bt && bt.click(); });
  const sv = await H.waitFor(c, () => { const p = window._crm.projects.find(x => x.id === 'P2'); return p && p.clientEmail === 'rramos@demo.test' && p.clientPhone === '901-555-0199' && p.client === 'Head Start' ? 1 : 0; }, null, 8000);
  ok(!!sv, 'Save keeps e-mail, phone and name on the job', await c.ev(() => { const p = window._crm.projects.find(x => x.id === 'P2'); return p && [p.client, p.clientEmail, p.clientPhone]; }));
  /* phone digits */
  await openEdit('P3');
  await focusField(FIELD.phone); await c.ev(() => document.activeElement.select()); await c.page().keyboard.type('5550199', { delay: 40 }); await H.sleep(700);
  L = await list();
  ok(L && L.first === 'cust' && /rramos@demo\.test/.test(L.rows[0]), 'typing "5550199" in Client Phone finds the same customer', L);
  await c.page().keyboard.press('Escape'); await H.sleep(200);
  /* a different phone already on the form is kept */
  await c.ev(() => { const i = document.activeElement; const ns = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; ns.call(i, '901-555-7777'); i.dispatchEvent(new Event('input', { bubbles: true })); }); await H.sleep(400);
  await c.page().keyboard.press('Escape');
  await focusField(FIELD.email); await c.page().keyboard.type('rramos', { delay: 40 }); await H.sleep(700);
  L = await list();
  ok(L && L.first === 'cust', 'D300: the customer row is offered on the e-mail box', L);
  await c.ev(() => { const r = document.querySelector('._ac-list.show ._af-row'); r.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); }); await H.sleep(1200);
  V = await vals();
  ok(V['client email'] === 'rramos@demo.test', 'a click fills the e-mail', V);
  ok(V['client phone'] === '901-555-7777', 'the different phone already typed is NOT overwritten', V);
  L = await list();
  ok(L && /Kept the phone/.test(L.note), 'a note under the box says the phone was kept', L);
  ok(c.errs.length === e0, 'no page errors', c.errs.slice(e0, e0 + 3));
} catch (e) { fail++; console.log('  ✗ FAIL threw ' + (e && e.stack || e)); }
finally { try { await c.close(); } catch (e) {} }
console.log(`AUTOFILL ${pass}/${pass + fail}`); process.exit(fail ? 1 : 0);
