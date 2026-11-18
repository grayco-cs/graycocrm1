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
  if (process.env.SAVES_ONLY && !process.env.SAVES_ONLY.split(',').some(x => label.indexOf(x) >= 0)) return;   /* run only some cases */
  seed();
  const A = await device('desk', 'sbiffle@grayco-cs.com', extra && extra.init ? { init: extra.init } : {}); W.push(A);
  const clog = []; A.page().on('console', m => { const t = m.text(); if (/GC Sync|backing off|recovered|Upload|Write failed|held/i.test(t)) clog.push(t.slice(0, 160)); });
  const NAME = 'Demo Fail ' + label.replace(/\W+/g, '') + Date.now().toString(36).slice(-3);
  if (fault) H.failNext(Object.assign({ table: 'gc_kv', key: /^(estimates|__est__gc_ests_v2)$/ }, fault));
  const t0 = Date.now();
  await estNew(A, NAME, [{ desc: "Fail demo line", cost: 100, qty: 3 }]);
  const w1 = await dbOrTold(A, () => estIn(NAME).length ? estIn(NAME)[0] : null, 120000), got = w1.got, msg = w1.told;   /* within 2 minutes */
  const tookS = Math.round((Date.now() - t0) / 1000);
  const fl = H.faultLog.filter(f => f.at >= t0).length;
  if (fault) R('estimate ' + label, 'desk', 'told or sent at once', !!(msg || got), { injected: fl, told: msg });
  if (!got) console.log('  (diagnosis)', JSON.stringify(await A.ev(() => ({ unsent: window._gcUnsent && window._gcUnsent(), q: window._gcSyncQ && window._gcSyncQ.waiting(), dbg: window._gcSyncDebug && window._gcSyncDebug(), giveup: window.__GC_SYNC_GIVEUP__ }))), JSON.stringify(clog.slice(-14)));
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

/* a long outage: every estimates write fails for OUT ms (the database is down), then it answers again — the save must land
   within 60 s of that; with reload: the page is reloaded in the middle of the outage (the save was only on this computer) */
async function outageCase(label, OUT, reloadAt){
  if (process.env.SAVES_ONLY && !process.env.SAVES_ONLY.split(',').some(x => label.indexOf(x) >= 0)) return;   /* run only some cases */
  seed();
  const A = await device('desk', 'sbiffle@grayco-cs.com'); W.push(A);
  const NAME = 'Demo Outage ' + label.replace(/\W+/g, '') + Date.now().toString(36).slice(-3);
  H.failFor(OUT, { table: 'gc_kv', key: /^(estimates|__est__gc_ests_v2)$/ });
  const t0 = Date.now();
  await estNew(A, NAME, [{ desc: 'Outage demo line', cost: 100, qty: 3 }]);
  const upAt = t0 + OUT;
  if (reloadAt) { await sleep(Math.max(0, t0 + reloadAt - Date.now())); await reload(A); }
  const w = await dbOrTold(A, () => estIn(NAME).length ? estIn(NAME)[0] : null, Math.max(0, upAt - Date.now()) + 60000);
  const after = w.got ? Math.round((Date.now() - upAt) / 1000) : null;
  R('estimate ' + label, 'desk', 'told while down', !!w.told, { told: w.told });
  R('estimate ' + label, 'desk', 'db within 60 s of the database answering', !!w.got, { secsAfterUp: after, injected: H.faultLog.filter(f => f.at >= t0).length });
  if (!w.got) console.log('  (diagnosis)', JSON.stringify(await A.ev(() => ({ unsent: window._gcUnsent && window._gcUnsent(), dbg: window._gcSyncDebug && window._gcSyncDebug() }))));
  else console.log('  (landed ' + after + ' s after the database answered again)');
  await A.close(); W.length = 0;
}
async function msgCase(label, fault, extra){
  if (process.env.SAVES_ONLY && !process.env.SAVES_ONLY.split(',').some(x => label.indexOf(x) >= 0)) return;   /* run only some cases */
  seed();
  const P = await device('phone', 'wjohnson@grayco-cs.com', extra && extra.init ? { init: extra.init } : {}); W.push(P);
  const plog = []; P.page().on('console', m => { const t = m.text(); if (/job message|waiting save|GC Sync|cloud|LSGUARD|busy/i.test(t)) plog.push(t.slice(0, 160)); });
  const pg = P.page();
  const TEXT = 'Demo message ' + label + ' ' + Date.now().toString(36).slice(-4);
  await P.ev(() => window._gcOpenJobMessages('P1')); await H.waitFor(P, () => !!document.getElementById('_jmText'), null, 15000); await sleep(800);
  await P.ev(t => { const f = window.fetch; window.__jmPosts = []; window.fetch = function(u, o){ let rec = null; try { if (o && /post/i.test(o.method || '') && typeof o.body === 'string' && /gc_job_messages/.test(o.body)) { rec = { t: Date.now(), has: o.body.indexOf(t) >= 0, st: 'pending', stack: String(new Error().stack).split('\n').slice(2, 5).join(' | ').slice(0, 260) }; window.__jmPosts.push(rec); } } catch (e) {} const p = f.apply(this, arguments); if (rec) p.then(r => { rec.st = r && r.status; }, e => { rec.st = 'rejected ' + String(e && e.message || e).slice(0, 80); }); return p; }; }, 'Demo message ' + label);
  if (fault) H.failNext(Object.assign({ table: 'gc_kv', key: 'gc_job_messages' }, fault));
  const t0 = Date.now();
  await pg.fill('#_jmText', TEXT); await pg.locator('#_jmSend').scrollIntoViewIfNeeded().catch(() => {}); await pg.locator('#_jmSend').tap({ timeout: 5000 }).catch(() => P.ev(() => document.getElementById('_jmSend').click()));   /* off screen in this panel: the person scrolls to it */ await sleep(1500);
  const shown = await P.ev(t => (document.getElementById('_jmThread') || {}).innerText.indexOf(t) >= 0, TEXT);
  R('job message ' + label, 'phone', 'shows on phone', shown);
  const inDb = () => arr(H.cget('gc_job_messages')).find(m => m && m.text === TEXT);
  const w1 = await dbOrTold(P, inDb, 120000); let got = w1.got;
  if (fault) R('job message ' + label, 'phone', 'told', !!w1.told, { injected: H.faultLog.filter(f => f.at >= t0).length, told: w1.told });
  if (fault) R('job message ' + label, 'phone', 'retried by itself', !!got);
  if (!got) console.log('  (diagnosis)', JSON.stringify(await P.ev(t => ({ q: window._gcSyncQ && window._gcSyncQ.waiting(), st: window._gcSyncQ && window._gcSyncQ.state(), local: String(localStorage.getItem('gc_job_messages') || '').indexOf(t) >= 0, held: window._gcLsHeld && window._gcLsHeld.state(), posts: window.__jmPosts }), TEXT)), JSON.stringify(plog.slice(-16)));
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
    await outageCase('2-min outage', 120000, 0);
    await outageCase('outage + reload', 90000, 40000);
    if (!process.env.SAVES_QUICK) await estCase('full storage', null, { init: [H.fillLocalStorage(20000)] });
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
