// test_SAVES_est.mjs <build-dir> [full] — SAVES group "est": the estimate builder on a Desk computer (Glenn estimates all
// week). Like a person: 📐 Estimates → ＋ New estimate → type the job → "+ Add line" twice (it saves by itself);
//   (a) the estimate reaches the database (gc_kv "estimates": name, address, both lines, a total);
//   (b) a SECOND computer (fresh browser) has it and opens it from 📐 Estimates with both lines;
//   (c) a reload of the first computer still has it;
//   edit: open it from the list, change a line's qty → the database has the new qty (one record), the other computer gets it;
//   send: 📤 Send → the send box → the estimate PDF is stored / the e-mail is queued (no silent nothing).
// "full": the same on a computer whose localStorage is nearly full (Glenn's PC: gc_ests_backup / gc_snap_estimates refused).
import { H, seed, device, reload, cloudWait, pageWait, R, table, arr, sleep, shot, closeAll, counts, estNew, estOpen, estSavedText } from './saves_lib.mjs';
const FULL = process.argv.includes('full'), ONLYFULL = process.argv.includes('onlyfull');
const W = [];
const estIn = name => arr(H.cget('estimates')).filter(e => e && e.name === name && !e._isDraft);
const labor = e => arr(e && e.lines).find(l => l.desc === 'Labor demo day');
async function run(full){
  const tag = full ? 'estimate (full storage)' : 'estimate', dev = 'desk';
  seed();
  const A = await device('desk', 'sbiffle@grayco-cs.com', full ? { init: [H.fillLocalStorage(30000)] } : {}); W.push(A);
  if (full) console.log('  localStorage in use:', await A.ev(() => { try { return window._gcLsGuard.usage().chars; } catch (e) { return null; } }));
  const NAME = 'Demo Roof ' + (full ? 'F' : 'D') + Date.now().toString(36).slice(-4);
  await estNew(A, NAME, [{ desc: 'Shingles demo bundle', cost: 40, qty: 30 }, { desc: 'Labor demo day', cost: 500, qty: 2 }]);
  const inDb = await cloudWait(() => { const e = estIn(NAME)[0]; return e && arr(e.lines).length === 2 ? e : null; }, 45000);
  await shot(A, 'est_' + (full ? 'full' : 'd'));
  if (!inDb) console.log('  (diagnosis)', JSON.stringify(await A.ev(async n => { const o = {}; try { o.builder = estimates.filter(e => e.name === n).map(e => ({ id: e.id, d: e._isDraft, l: (e.lines || []).length })); } catch (e) { o.builder = String(e); }
    try { o.idb = ((await window.idbGet('estimates')) || []).filter(e => e && e.name === n).map(e => ({ id: e.id, d: e._isDraft })); } catch (e) {}
    try { o.crm = ((window._crm || {}).estimates || []).filter(e => e && e.name === n).length; } catch (e) {}
    try { o.unsent = window._gcUnsent ? window._gcUnsent() : null; o.q = window._gcSyncQ && window._gcSyncQ.state(); o.qw = window._gcSyncQ && window._gcSyncQ.waiting(); } catch (e) {}
    try { o.slot = (openSlots[activeSlot] || {})._savedEstId; } catch (e) {}
    return o; }, NAME)), 'writes:', JSON.stringify([...new Set(H.writes.map(w => w.key))].slice(-40)), 'errs:', JSON.stringify(A.errs.slice(0, 5)));
  R(tag, dev, 'db', !!inDb, inDb ? undefined : { cloud: estIn(NAME).map(e => ({ id: e.id, n: arr(e.lines).length, d: e._isDraft })), drafts: arr(H.cget('estimates')).filter(e => e && e.name === NAME).length, saved: await estSavedText(A) });
  const savedTxt = await estSavedText(A);
  R(tag, dev, 'says saved', /saved|✓/i.test(savedTxt) && !/not|fail|error/i.test(savedTxt), savedTxt);
  const id = inDb && inDb.id;
  if (inDb) R(tag, dev, 'db fields', inDb.address === '55 Estimate Ln, Memphis, TN' && +(labor(inDb) || {}).qty === 2 && (+inDb.totalCharge > 0 || +inDb.total > 0), { address: inDb.address, lines: arr(inDb.lines).map(l => [l.desc, l.qty, l.cost]), totalCharge: inDb.totalCharge });
  // (b) another computer
  const B = await device('desk', 'wjohnson@grayco-cs.com'); W.push(B);
  const onB = id ? await pageWait(B, 'estimates', id, e => arr(e.lines).length === 2, 30000) : null;
  R(tag, dev, 'other', !!onB);
  if (onB) { const op = await estOpen(B, NAME); const n = op ? await B.ev(() => { try { return lines.length; } catch (e) { return -1; } }) : -1; R(tag, dev, 'other opens it', op && n === 2, { op, n }); }
  // (c) reload the first
  await reload(A);
  R(tag, dev, 'reload', !!(id && await pageWait(A, 'estimates', id, e => arr(e.lines).length === 2, 20000)));
  // edit the labor qty 2 → 3
  if (id && await estOpen(A, NAME)) {
    const pg = A.page();
    const hit = await A.ev(() => { const ins = [...document.querySelectorAll('#gc-est-wrap input.li[type=number]')].filter(i => i.offsetParent && i.value === '2' && /qty/.test(i.getAttribute('onchange') || '')); if (ins[0]) ins[0].setAttribute('data-saves-qty', '1'); return ins.length; });
    if (hit) { await pg.fill('[data-saves-qty="1"]', '3'); await pg.press('[data-saves-qty="1"]', 'Tab'); }
    R(tag, dev, 'edit: qty box found', hit > 0);
    const upd = await cloudWait(() => { const l = estIn(NAME); return l.length === 1 && +(labor(l[0]) || {}).qty === 3 ? l[0] : null; }, 45000);
    R(tag, dev, 'edit db', !!upd, { copies: estIn(NAME).map(e => ({ id: e.id, q: arr(e.lines).map(x => x.qty) })) });
    await B.ev(() => { window.dispatchEvent(new Event('focus')); });
    R(tag, dev, 'edit other', !!(await pageWait(B, 'estimates', id, e => +(labor(e) || {}).qty === 3, 60000)));
    if (!full) {
      // 📤 Send: the send box opens; its send stores the PDF / queues the e-mail
      const fn0 = A.fn.length, keys0 = new Set(H.cloud.keys()), st0 = H.storage.size;
      await pg.locator('#gc-est3-acts button[data-a="send"]').click().catch(e => console.log('  (send click)', e.message.slice(0, 80)));
      await sleep(3000); await shot(A, 'est_send');
      const box = await A.ev(() => { const o = [...document.querySelectorAll('body > div')].filter(d => d.offsetHeight > 150 && +getComputedStyle(d).zIndex > 800).pop(); return o ? { id: o.id, btns: [...o.querySelectorAll('button')].filter(b => b.offsetParent).map(b => b.textContent.trim().slice(0, 30)), text: o.innerText.slice(0, 300) } : null; });
      console.log('  send box:', JSON.stringify(box));
      R('estimate send', dev, 'send box opens', !!box);
      const go = pg.locator('button:visible', { hasText: /^(📤 )?Send( it| now| estimate| for approval)?$|Send to (approval|customer)|Queue/i }).last();
      if (await go.count()) { await go.click().catch(() => {}); await sleep(6000); }
      const fnCalls = A.fn.slice(fn0).map(f => f.name + ':' + ((f.body && (f.body.action || f.body.op)) || ''));
      const newKeys = [...H.cloud.keys()].filter(k => !keys0.has(k));
      console.log('  after send: functions', JSON.stringify(fnCalls), 'new rows', JSON.stringify(newKeys.slice(0, 10)), 'files', H.storage.size - st0);
      R('estimate send', dev, 'db (PDF stored or e-mail queued)', H.storage.size > st0 || fnCalls.some(c => /portal|send-email|approval/.test(c)) || newKeys.some(k => /^doc:|approval|outbound/.test(k)), { fnCalls, newKeys });
    }
  } else R(tag, dev, 'edit: opens from the list', false);
  await closeAll([A, B]); W.length = 0;
}
try {
  if (!ONLYFULL) await run(false);
  if (FULL || ONLYFULL) await run(true);
} catch (e) { console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
await closeAll(W);
table('SAVES est');
process.exit(counts().fail ? 1 : 0);
