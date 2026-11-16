// test_SAVES_field.mjs <build-dir> — SAVES group "field": what Nick / Steven do in GrayCo Field on a phone reaches the
// database, shows on the office's Desk computer, and survives a reload — and the office's change shows on the phone.
//   job message   phone: job card 💬 Message → type → Send          desk: the job's Messages thread shows it
//   job progress  phone: job page → 📈 Progress → set % → Save        desk: the job's % (projects row)
//   job note      desk: the job's note (Field job info)               phone: shows it
// Usage: node test_SAVES_field.mjs <dir with index.html> [msg|progress|...]
import { H, seed, device, reload, cloudWait, pageWait, R, table, arr, find, sleep, shot, closeAll, counts } from './saves_lib.mjs';
const only = process.argv.slice(3); const want = k => !only.length || only.includes(k);
const W = [];
const msgs = () => arr(H.cget('gc_job_messages'));
async function openMsgs(A){ await A.ev(() => window._gcOpenJobMessages('P1')); await H.waitFor(A, () => !!document.getElementById('_jmText'), null, 15000); await sleep(1200); }
async function sendMsg(A, text){ const pg = A.page(); await pg.fill('#_jmText', text); if (A.kind === 'phone') await pg.locator('#_jmSend').tap(); else await pg.click('#_jmSend'); await sleep(1500); }
const threadHas = (A, t) => A.ev(t => (document.getElementById('_jmThread') || {}).innerText.indexOf(t) >= 0, t);

async function messages(){
  seed();
  const P = await device('phone'); W.push(P);
  // phone → office: through the job card's 💬 Message button, like Nick
  const card = P.page().locator('#_gcJobPick.gc-fh .fh-job[data-job="P1"] [data-fa="fp-msg"]').first();
  if (await card.count()) { await card.tap(); await H.waitFor(P, () => !!document.getElementById('_jmText'), null, 15000); await sleep(1200); } else await openMsgs(P);
  const T1 = 'From the phone ' + Date.now().toString(36).slice(-4);
  await sendMsg(P, T1);
  R('job message', 'phone', 'shows', await threadHas(P, T1));
  R('job message', 'phone', 'db', !!(await cloudWait(() => msgs().find(m => m.text === T1 && m.pid === 'P1'), 30000)));
  const D = await device('desk'); W.push(D);
  await openMsgs(D);
  R('job message', 'phone', 'other', await H.waitFor(D, t => (document.getElementById('_jmThread') || {}).innerText.indexOf(t) >= 0, T1, 20000));
  // office → phone
  const T2 = 'From the office ' + Date.now().toString(36).slice(-4);
  await sendMsg(D, T2);
  R('job message', 'desk', 'shows', await threadHas(D, T2));
  R('job message', 'desk', 'db', !!(await cloudWait(() => msgs().find(m => m.text === T2), 30000)));
  await P.ev(() => { document.querySelectorAll('#_jmX').forEach(b => b.click()); }); await sleep(600);
  await openMsgs(P);
  R('job message', 'desk', 'other', await H.waitFor(P, t => (document.getElementById('_jmThread') || {}).innerText.indexOf(t) >= 0, T2, 20000));
  // both send at the same moment: neither is lost
  const T3 = 'Same time phone ' + Date.now().toString(36).slice(-3), T4 = 'Same time office ' + Date.now().toString(36).slice(-3);
  await Promise.all([sendMsg(P, T3), sendMsg(D, T4)]);
  const both = await cloudWait(() => msgs().some(m => m.text === T3) && msgs().some(m => m.text === T4), 30000);
  R('job message (both at once)', 'both', 'db', !!both, { have: msgs().map(m => m.text).slice(-6) });
  // reloads
  await reload(P); await openMsgs(P);
  R('job message', 'phone', 'reload', await H.waitFor(P, t => [t[0], t[1]].every(x => (document.getElementById('_jmThread') || {}).innerText.indexOf(x) >= 0), [T1, T2], 20000));
  await reload(D); await openMsgs(D);
  R('job message', 'desk', 'reload', await H.waitFor(D, t => [t[0], t[1]].every(x => (document.getElementById('_jmThread') || {}).innerText.indexOf(x) >= 0), [T1, T2], 20000));
  await closeAll([P, D]); W.length = 0;
}

try {
  if (want('msg')) await messages();
} catch (e) { console.log('  ✗ FAIL crashed: ' + (e && e.stack || e)); }
await closeAll(W);
table('SAVES field');
process.exit(counts().fail ? 1 : 0);
