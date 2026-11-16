// test_SAVES_fail.mjs <build-dir> — SAVES group "fail": a save whose first trip to the database fails is never lost silently.
//   1. the database answers 503 to the first write(s) of the list → the app tries again by itself and the save lands, or
//      the person is clearly told it is not sent; it never reports "saved" and drops it;
//   2. the write never gets an answer (no signal) → the same;
//   3. the failed save survives a reload of the page (it was only on this computer) and goes up after it;
//   4. a nearly-full localStorage (a real office PC): the save still reaches the database.
// Entry point: the estimate builder on a Desk computer (Glenn, all week) and a job message from a phone (Field).
// Usage: node test_SAVES_fail.mjs <dir with index.html> [est|msg ...]
import { H, seed, device, reload, cloudWait, pageWait, R, table, arr, sleep, shot, closeAll, counts, estNew } from './saves_lib.mjs';
const only = process.argv.slice(3);
const want = k => !only.length || only.includes(k);
const W = [];
const estIn = (name) => arr(H.cget('estimates')).filter(e => e && e.name === name && !e._isDraft);
const told = A => A.ev(() => { const t = document.body.innerText; return /not (been )?sent|not saved|will (try|retry|send)|couldn.t (save|send)|offline|sending…|waiting to send|saved on (this|phone)/i.test(t) ? (t.match(/[^\n]*(not (been )?sent|not saved|will (try|retry|send)|couldn.t (save|send)|offline|sending…|waiting to send|saved on (this|phone))[^\n]*/i) || [''])[0].slice(0, 120) : ''; });

/* wait for the database, noting whether the screen told the person it is not sent (sampled all along — a note can go away) */
async function dbOrTold(A, fn, ms){
  const t0 = Date.now(); let told = '';
  while (Date.now() - t0 < ms) { let v; try { v = fn(); } catch (e) {} if (v) return { got: v, told }; if (!told) { try { told = await toldNow(A); } catch (e) {} } await sleep(700); }
  return { got: null, told };
}
const toldNow = A => A.ev(() => { const el = document.getElementById('gc-unsent-note') || document.getElementById('_jmNotSent'); if (el && el.textContent) return el.textContent.slice(0, 120); const s = document.getElementById('gc-rp-saved'); if (s && /not sent/i.test(s.textContent)) return s.textContent; const f = document.getElementById('gc-fh-sync'); if (f && /sending|will send/i.test(f.textContent)) return f.textContent; return ''; });
async function estCase(label, fault, extra){
  seed();
  const A = await device('desk', 'sbiffle@grayco-cs.com', extra && extra.init ? { init: extra.init } : {}); W.push(A);
  const NAME = 'Demo Fail ' + label.replace(/\W+/g, '') + Date.now().toString(36).slice(-3);
  if (fault) H.failNext(Object.assign({ table: 'gc_kv', key: /^(estimates|__est__gc_ests_v2)$/ }, fault));
  const t0 = Date.now();
  await estNew(A, NAME, [{ desc: "Fail demo line", cost: 100, qty: 3 }]);
  const w1 = await dbOrTold(A, () => estIn(NAME).length ? estIn(NAME)[0] : null, 75000), got = w1.got, msg = w1.told;
  const tookS = Math.round((Date.now() - t0) / 1000);
  const fl = H.faultLog.filter(f => f.at >= t0).length;
  if (fault) R('estimate ' + label, 'desk', 'told or sent at once', !!(msg || got), { injected: fl, told: msg });
  if (!got) console.log('  (diagnosis)', JSON.stringify(await A.ev(() => ({ unsent: window._gcUnsent && window._gcUnsent(), q: window._gcSyncQ && window._gcSyncQ.waiting() }))));
  R('estimate ' + label, 'desk', 'db', !!got, { injected: fl, secs: tookS, told: msg });
  if (extra && extra.reloadFirst && !got) {
    await reload(A);
    const got2 = await cloudWait(() => estIn(NAME).length ? estIn(NAME)[0] : null, 60000);
    R('estimate ' + label, 'desk', 'after reload db', !!got2);
  }
  if (got) {
    const B = await device('desk', 'wjohnson@grayco-cs.com'); W.push(B);
    R('estimate ' + label, 'desk', 'other', !!(await pageWait(B, 'estimates', got.id, null, 30000)));
    await B.close();
  }
  await A.close(); W.length = 0;
}

async function msgCase(label, fault, extra){
  seed();
  const P = await device('phone', 'wjohnson@grayco-cs.com', extra && extra.init ? { init: extra.init } : {}); W.push(P);
  const pg = P.page();
  const TEXT = 'Demo message ' + label + ' ' + Date.now().toString(36).slice(-4);
  await P.ev(() => window._gcOpenJobMessages('P1')); await H.waitFor(P, () => !!document.getElementById('_jmText'), null, 15000); await sleep(800);
  if (fault) H.failNext(Object.assign({ table: 'gc_kv', key: 'gc_job_messages' }, fault));
  const t0 = Date.now();
  await pg.fill('#_jmText', TEXT); await pg.locator('#_jmSend').tap(); await sleep(1500);
  const shown = await P.ev(t => (document.getElementById('_jmThread') || {}).innerText.indexOf(t) >= 0, TEXT);
  R('job message ' + label, 'phone', 'shows on phone', shown);
  const inDb = () => arr(H.cget('gc_job_messages')).find(m => m && m.text === TEXT);
  const w1 = await dbOrTold(P, inDb, 60000); let got = w1.got;
  if (fault) R('job message ' + label, 'phone', 'told', !!w1.told, { injected: H.faultLog.filter(f => f.at >= t0).length, told: w1.told });
  if (fault) R('job message ' + label, 'phone', 'retried by itself', !!got);
  if (!got) console.log('  (diagnosis)', JSON.stringify(await P.ev(() => ({ q: window._gcSyncQ && window._gcSyncQ.waiting(), st: window._gcSyncQ && window._gcSyncQ.state() }))));
  if (!got && extra && extra.reopen) {   /* the person opens Messages again (or the app) — what is still only on the phone goes up */
    await P.ev(() => { document.querySelectorAll('#_jmX').forEach(b => b.click()); }); await sleep(500);
    await reload(P);
    await P.ev(() => window._gcOpenJobMessages('P1')); await sleep(4000);
    got = await cloudWait(inDb, 30000);
    R('job message ' + label, 'phone', 'after reload db', !!got);
  }
  R('job message ' + label, 'phone', 'db', !!got, { injected: H.faultLog.filter(f => f.at >= t0).length });
  if (got) {
    const D = await device('desk', 'office@grayco-cs.com'); W.push(D);
    await D.ev(() => window._gcOpenJobMessages('P1')); await sleep(4000);
    R('job message ' + label, 'phone', 'other', await D.ev(t => (document.getElementById('_jmThread') || {}).innerText.indexOf(t) >= 0, TEXT));
    await D.close();
  }
  await P.close(); W.length = 0;
}

try {
  if (want('est')) {
    await estCase('503 once', { status: 503, times: 2 });
    await estCase('no answer', { hang: true, times: 2 });
    await estCase('503 x6 + reload', { status: 503, times: 6 }, { reloadFirst: true });
    await estCase('full storage', null, { init: [H.fillLocalStorage(20000)] });
  }
  if (want('msg')) {
    await msgCase('503 once', { status: 503, times: 1 }, { reopen: true });
    await msgCase('full storage', null, { init: [H.fillLocalStorage(20000)] });
    await msgCase('full storage + 503', { status: 503, times: 1 }, { init: [H.fillLocalStorage(20000)], reopen: true });
  }
} catch (e) { console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
await closeAll(W);
table('SAVES fail');
process.exit(counts().fail ? 1 : 0);
