// test_APPRMENTION.mjs <build-dir> [mirror.json] — patch APPRMENTION on the live mirror (read-only copy, never committed).
// Wesley (desk) writes a note on an approval card: "@" opens the team list (no customer, no sub), it narrows as he types,
// Enter / a tap put "@First Last" in; Save → Nick Thomas and Glenn Miller each get exactly ONE To-Do; on Nick's own
// computer that To-Do's "📋 Open the card" opens Approvals at that card.
// Env: GC_HARNESS (default scratchpad wN/harness_N.mjs).
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const H = await import(pathToFileURL(process.env.GC_HARNESS || SP + '/wN/harness_N.mjs').href);
const { computer, sleep, waitFor, resetCloud, ACCOUNTS, cloud, mclick } = H;
const build = path.resolve(process.argv[2] || '.'), MIRROR = process.argv[3] || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
resetCloud(); for (const r of rows) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
const val = k => { const r = rows.find(x => x.key === k); return r ? (r.value !== undefined ? r.value : r.v) : null; };
const staffNames = new Set((Array.isArray(val('users')) ? val('users') : []).map(u => String(u && u.name || '').trim().toLowerCase()));
const outsiders = new Set(); for (const k of ['customers', 'subs', 'vendors']) for (const x of (Array.isArray(val(k)) ? val(k) : [])) { const n = String(x && x.name || '').trim().toLowerCase(); if (n && !staffNames.has(n)) outsiders.add(n); }   /* the owners are also on the customer list (their own jobs): they are the team */
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m); } };
async function open(name, email){
  const c = await computer(name, { build }); const p = c.page();
  await p.goto('https://app.local/index.html'); await sleep(2500);
  if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); await p.locator('#gc-auth-submit').click(); }
  await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20, null, 150000, 500);
  await sleep(20000); return c;
}
const A = await open('MA', 'wjohnson@grayco-cs.com'); const p = A.page();
await p.evaluate(() => window._setView('approvals')); await sleep(5000);
const key = await waitFor(A, () => { const ks = [...document.querySelectorAll('[data-apx-act$="|note"]')].map(b => b.getAttribute('data-apx-act').split('|').slice(1, -1).join('|')); return ks.find(k => /^sub:/.test(k)) || ks[0]; }, null, 30000, 500);
ok(!!key, 'a card with 📝 Note (' + key + ')');
await mclick(p, `[data-apx-act$="|${key}|note"]`); await sleep(500);
const inp = p.locator(`[data-apx-note-in="${key}"]`); await inp.click();
const pick = () => p.evaluate(() => { const b = document.getElementById('apx-mn'); return b ? [...b.querySelectorAll('[data-apx-mn-i]')].map(o => ({ n: o.querySelector('b').textContent.replace(/^@/, ''), on: o.getAttribute('aria-selected') === 'true' })) : null; });
// 1. "@" alone: the team, nobody else
await p.keyboard.type('Checked the amount @'); await sleep(300);
let L = await pick(); console.log('   @ list', JSON.stringify(L && L.map(x => x.n)));
const staff = await p.evaluate(() => (window._crm.users || []).filter(u => u && u.active !== false).map(u => String(u.name || '').trim()));
ok(L && L.length >= 3 && L.every(x => staff.includes(x.n)), `"@" lists the team (${L && L.length} people, all on the people list)`);
ok(L && L.every(x => !outsiders.has(x.n.toLowerCase())), 'no customer, sub or vendor in the list');
// arrows move the choice, Esc closes
await p.keyboard.press('ArrowDown'); await sleep(150); L = await pick();
ok(L && L[1] && L[1].on, '↓ moves the choice');
await p.keyboard.press('Escape'); await sleep(150);
ok(!(await pick()) && await inp.isVisible(), 'Esc closes the list (the note box stays)');
// 2. narrows; Enter puts "@Nick Thomas"
await p.keyboard.type('ni'); await sleep(300); L = await pick(); console.log('   @ni', JSON.stringify(L));
ok(L && L.length >= 1 && L.every(x => /(^| )ni/i.test(x.n)) && L.some(x => x.n === 'Nick Thomas'), '"@ni" narrows the list to Nick');
await p.keyboard.press('Enter'); await sleep(300);
let v = await inp.inputValue(); ok(/Checked the amount @Nick Thomas $/.test(v) && !(await pick()), `Enter puts it in ("${v}")`);
// 3. a tap picks
await p.keyboard.type('and @gle'); await sleep(300);
await mclick(p, '#apx-mn [data-apx-mn-i="0"]'); await sleep(300);
v = await inp.inputValue(); ok(/and @Glenn Miller $/.test(v), `a tap puts it in ("${v}")`);
await p.keyboard.type('please look'); await sleep(300); console.log('   before save', JSON.stringify(await p.evaluate(k => ({ v: (document.querySelector('[data-apx-note-in="' + k + '"]') || {}).value, go: document.querySelectorAll('[data-apx-act$="|' + k + '|notego"]').length }), key)));
// 4. Save → one To-Do each for Nick and Glenn, none for Wesley
await mclick(p, `[data-apx-act$="|${key}|notego"]`); await sleep(1500);
const tasks = () => p.evaluate(k => JSON.parse(localStorage.getItem('gc_office_tasks') || '[]').filter(t => t && t.apxKey === k).map(t => ({ id: t.id, to: t.forUser, label: t.label, kind: t.kind })), key);
let T = await tasks(); console.log('   to-dos', JSON.stringify(T), JSON.stringify(await p.evaluate(k => ({ toasts: [...document.querySelectorAll('.apx-toast')].map(x => x.textContent), box: !!document.querySelector('[data-apx-note-in="' + k + '"]'), card: !!document.querySelector('[data-k="' + k + '"]'), view: localStorage.getItem('grayco_view') }), key)));
const per = e => T.filter(t => t.to === e).length;
ok(per('nthomas@grayco-cs.com') === 1 && per('gmiller@grayco-cs.com') === 1 && T.length === 2, 'Save: exactly one To-Do for Nick and one for Glenn, none for Wesley');
ok(T.every(t => t.kind === 'mention' && /^💬 Wesley mentioned you on: /.test(t.label)), `"${T[0] && T[0].label}"`);
ok(await p.evaluate(k => !!document.querySelector('[data-k="' + k + '"] .apx-mnc'), key), 'the card shows the @Name chips');
await sleep(8000); T = await tasks(); ok(T.length === 2, 'still two (no repeat) after 8 s');
// 5. Nick's computer: his To-Do opens the card
const B = await open('MB', 'nthomas@grayco-cs.com'); const q = B.page();
const it = await waitFor(B, k => { const l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]').filter(t => t && t.apxKey === k && t.forUser === 'nthomas@grayco-cs.com'); return l.length ? l.map(t => t.id) : null; }, key, 60000, 1000);
ok(it && it.length === 1, 'the To-Do reached Nick\'s computer once (' + JSON.stringify(it) + ')');
const mine = await q.evaluate(() => window._gcTD2 ? window._gcTD2.state().items.filter(x => /mentioned you on/.test(x.title)).map(x => ({ k: x.key, t: x.title, a: x.act && x.act.l })) : []);
console.log('   Nick\'s To-Do', JSON.stringify(mine));
ok(mine.length === 1 && mine[0].a === '📋 Open the card', 'one "mentioned you on" To-Do for Nick, with 📋 Open the card');
await q.evaluate(() => window._setView('todo')); await sleep(3000);
const tk = mine[0] && mine[0].k;
let clicked = tk && await mclick(q, `.td2-row[data-k="${tk}"] .td2-act`);
if (!clicked) { console.log('   (row not on screen: running its button)', await q.evaluate(k => { const x = window._gcTD2.state().items.find(y => y.key === k); if (!x || !x.act) return 'no item / act'; try { x.act.f(); return 'ran ' + x.act.l; } catch (e) { return 'threw ' + e.message; } }, tk)); }
await sleep(800); console.log('   after', JSON.stringify(await q.evaluate(k => ({ view: localStorage.getItem('grayco_view'), el: !!document.querySelector('.apx-list [data-k="' + k + '"]'), hl: [...document.querySelectorAll('[data-apx-hl]')].map(e => e.getAttribute('data-k')), toasts: [...document.querySelectorAll('.apx-toast')].map(x => x.textContent) }), key)));
const hl = await waitFor(B, () => { const e = document.querySelector('[data-apx-hl]'); return e && localStorage.getItem('grayco_view') === 'approvals' ? e.getAttribute('data-k') : null; }, null, 15000, 250);
ok(hl === key, `"📋 Open the card" opens Approvals at that card (${hl})`);
ok(!A.errs.length && !B.errs.length, 'no page errors (' + A.errs.concat(B.errs).slice(0, 3).join(' | ') + ')');
console.log(`APPRMENTION ${pass}/${pass + fail}`); try { await A.b.close(); await B.b.close(); } catch (e) {} process.exit(fail ? 1 : 0);
