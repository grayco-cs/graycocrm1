// test_DELKEY.mjs <build-dir> [mirror.json] — patch DELKEY on the live mirror (read-only copy, never committed), as Wesley on
// Leads → List: the "Delete this lead?" box opens with the focus on 🗑 Delete (solid red), Esc cancels (the lead stays),
// Enter deletes (the lead leaves, "Deleted · Undo" shows), Undo brings it back.
// Env: GC_HARNESS (default scratchpad wN/harness_N.mjs).
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cloud, mclick } = H;
const build = path.resolve(process.argv[2] || '.'), MIRROR = process.argv[3] || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const email = 'wjohnson@grayco-cs.com';
resetCloud(); for (const r of JSON.parse(fs.readFileSync(MIRROR, 'utf8'))) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m); } };
const c = await computer('DK', { build }); const p = c.page();
await p.goto('https://app.local/index.html'); await sleep(2500);
if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); await p.locator('#gc-auth-submit').click(); }
await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20, null, 150000, 500);
await sleep(20000);
await p.evaluate(() => window._setView('leads'));
const first = await waitFor(c, () => { const b = document.querySelector('#gc-leads-hub [data-gcl-del]'); return b && b.getAttribute('data-gcl-del'); }, null, 60000, 500);
ok(!!first, 'a lead with 🗑 on the Leads list (' + first + ')');
const onList = id => p.evaluate(id => !!document.querySelector('#gc-leads-hub [data-gcl-del="' + id + '"]'), id);
const box = () => p.evaluate(() => { const o = document.getElementById('gcl-delq'); if (!o) return null; const d = o.querySelector('[data-a=delete]'), cn = o.querySelector('[data-a=cancel]');
  return { focus: document.activeElement && document.activeElement.getAttribute('data-a'), del: getComputedStyle(d).backgroundColor, cancel: getComputedStyle(cn).backgroundColor, text: o.textContent.slice(0, 160) }; });
// 1. open → focus on Delete; Esc cancels
await mclick(p, `#gc-leads-hub [data-gcl-del="${first}"]`); await sleep(400);
let b = await box(); console.log('   box', JSON.stringify(b));
ok(b && b.focus === 'delete', 'the box opens with the focus on 🗑 Delete');
ok(b && /220, 38, 38/.test(b.del) && /255, 255, 255/.test(b.cancel), `Delete is solid red (${b && b.del}), Cancel the outline one (${b && b.cancel})`);
ok(b && /Undo is offered for 5 seconds/.test(b.text), 'it still says Undo for 5 seconds / Recently deleted');
await p.keyboard.press('Escape'); await sleep(600);
ok(!(await box()) && await onList(first), 'Esc: the box closes, the lead stays');
// 2. Enter deletes, Undo shows; Undo brings it back
await mclick(p, `#gc-leads-hub [data-gcl-del="${first}"]`); await sleep(400);
await p.keyboard.press('Enter'); await sleep(1500);
const und = await p.evaluate(() => { const t = document.getElementById('gcl-deltoast'); return t ? t.textContent : ''; });
ok(!(await box()) && !(await onList(first)) && /Undo/.test(und), `Enter: deleted, the lead left the list, "${und.trim()}" shows`);
await mclick(p, '#gcl-deltoast [data-a=undo]'); await sleep(3000);
ok(await waitFor(c, id => !!document.querySelector('#gc-leads-hub [data-gcl-del="' + id + '"]'), first, 15000, 500), 'Undo: the lead is back');
// 3. a Cancel the person tabbed to: Enter cancels
await mclick(p, `#gc-leads-hub [data-gcl-del="${first}"]`); await sleep(400);
await p.evaluate(() => document.querySelector('#gcl-delq [data-a=cancel]').focus()); await p.keyboard.press('Enter'); await sleep(600);
ok(!(await box()) && await onList(first), 'Enter on a focused Cancel still cancels');
ok(!c.errs.length, 'no page errors (' + c.errs.slice(0, 3).join(' | ') + ')');
console.log(`DELKEY ${pass}/${pass + fail}`); try { await c.b.close(); } catch (e) {} process.exit(fail ? 1 : 0);
