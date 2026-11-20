// test_COICONF.mjs <build-dir> — patch COICONF (owner 11/20, phone, GrayCo Field → My Approvals: "I've already clicked these to
//   confirm"): a sub COI / W-9 confirmed with 📄 Read & confirm stays off the list — on this computer after a later subs sync /
//   save, after a reload, and on the owner's phone — and the phone's card has ✕ Deny.
//   Browser (offline harness, made-up data):
//   1. desk: Read & confirm a COI filed on a sub → the card is gone, the file is marked read on the sub, the server read closed.
//   2. a later sync brings a stale copy of the sub (no read mark, newer save stamp — another computer re-saved it) into both
//      cloud lists; this computer pulls and re-scans → the card stays gone, and the cloud gets the read mark back.
//   3. the server read for a confirmed file is still open (its close was lost) → the card does not come back on a re-scan; the
//      read is closed again.
//   4. the phone (Field, phone width): no confirmed card; the W-9 card left has 📄 Read & confirm and ✕ Deny, both on screen.
//   5. ✕ Deny on the phone: the file is marked rejected, w9 cleared, and a later sync of an older copy does not undo it.
// Usage: node test_COICONF.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs)
import { pathToFileURL } from 'url'; import path from 'path';
const build = path.resolve(process.argv[2] || '.');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const HEX = c => 'sb:crm-files/' + c.repeat(64) + '.pdf';
const REF_A = HEX('a'), REF_B = HEX('b'), REF_C = HEX('c');
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
const H = await import(pathToFileURL(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs').href);
const ADMIN = Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === 'u-wesley');
const SUBS = () => [
  { id: 'S1', name: 'Demo Remodeling LLC', trade: 'Remodel', isSub: true, updatedAt: ago(5), files: [{ id: 'F1', ref: REF_A, name: 'IMG_0001.jpeg', kind: 'coi', date: ago(1).slice(0, 10), source: 'sub-portal' }] },
  { id: 'S2', name: 'Demo Earthworks LLC', trade: 'Dirt', isSub: true, w9: true, updatedAt: ago(5), files: [{ id: 'F2', ref: REF_B, name: 'W9 FORM.pdf', kind: 'w9', date: ago(1).slice(0, 10), source: 'sub-portal' }] },
  { id: 'S3', name: 'Demo Paint Co', trade: 'Paint', isSub: true, updatedAt: ago(5), files: [{ id: 'F3', ref: REF_C, name: 'Paint COI.pdf', kind: 'coi', date: ago(1).slice(0, 10), source: 'sub-portal' }] }];
H.resetCloud();
H.cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: ADMIN, role: 'Admin', payType: 'owner', active: true }]);
H.cset('subs', SUBS()); H.cset('vendors', SUBS());
['projects', 'invs', 'leads', 'customers', 'projectDocs', 'punch', 'expenses'].forEach(k => H.cset(k, []));
const SRV = { reads: [], posts: [] };
H.onFn('sub-doc-read', ({ method, query, body }) => {
  if (method === 'GET' && query.list) return { ok: true, items: SRV.reads.filter(r => r.status === 'new') };
  const b = body || {}; SRV.posts.push(b);
  if (b.act === 'done') { const r = SRV.reads.find(x => x.id === b.id); if (r && r.status === 'new' && !SRV.loseDone) r.status = 'applied'; return { ok: true }; }
  if (b.act === 'reject') { SRV.reads.forEach(r => { if (r.id === b.id || r.ref === b.ref) r.status = 'rejected'; }); return { ok: true }; }
  if (b.act) return { ok: true };
  const id = 'sd_' + b.ref.slice(13, 33); let r = SRV.reads.find(x => x.id === id);
  if (!r) { r = { id, at: new Date().toISOString(), subId: b.subId, name: b.name, ref: b.ref, kind: b.kind, fields: b.kind === 'w9' ? { legalName: 'Demo Earthworks LLC' } : { insCarrier: 'Demo Mutual', insPolicy: 'GL-1', insExp: '2027-03-01' }, status: 'new', source: b.source }; SRV.reads.push(r); }
  return { ok: true, read: r };
});
const cloudSub = (key, id) => { const v = H.cget(key); const l = typeof v === 'string' ? JSON.parse(v) : v; return (l || []).find(x => x && x.id === id); };
const refsOn = c => c.ev(() => window._gcAUTAI.subDocs().map(x => x.ref.slice(13, 14)).sort().join(''));
async function confirmOn(c, ref){
  await c.ev(r => window._gcAUTAI.openSubDoc(r), ref);
  ok(await H.waitFor(c, () => !!document.getElementById('_gcSdOk'), null, 15000), 'the read values show with ✅ Fill the sub record');
  await c.page().click('#_gcSdOk'); await H.sleep(2500);
}

const desk = await H.computer('Desk', { build });
try {
  console.log('1. desk: Read & confirm');
  ok(await H.signIn(desk, ADMIN, 25000), 'admin signs in (desk)');
  await H.waitFor(desk, () => !!window._gcAUTAI && !!window._gcCoiAppr && !!window._gcPullNow, null, 30000);
  await desk.ev(() => window._gcAUTAI.scanSubDocs());
  ok(await H.waitFor(desk, () => window._gcAUTAI.subDocs().length === 3, null, 30000), 'three items waiting');
  await confirmOn(desk, REF_A);
  const a1 = await desk.ev(() => { const s1 = window._crm.subs.find(x => x.id === 'S1'); return { q: window._gcAUTAI.subDocs().map(x => x.ref.slice(13, 14)).sort().join(''), f: s1.files.find(f => f.id === 'F1'), n: s1.files.length, appr: window._gcCoiAppr.items().length }; });
  ok(a1.q === 'bc' && a1.appr === 2 && a1.f && a1.f.aiRead && a1.n === 1, 'confirmed: the card is gone, the file on the sub is marked read', a1);
  ok(SRV.reads.find(r => r.ref === REF_A).status === 'applied', 'the server read is closed');
  let cl = null; for (let i = 0; i < 40 && !cl; i++) { const s = cloudSub('vendors', 'S1'); if (s && s.files[0].aiRead) cl = s; else await H.sleep(500); }
  ok(!!cl, 'the read mark reached the cloud');

  console.log('2. a later subs sync brings a stale copy of the sub');
  const stale = Object.assign(SUBS()[0], { updatedAt: new Date(Date.now() + 1000).toISOString(), phone: '9015550111' });   /* another computer re-saved its old copy */
  for (const k of ['vendors', 'subs']) { const v = H.cget(k); const l = (typeof v === 'string' ? JSON.parse(v) : v).map(x => x && x.id === 'S1' ? stale : x); H.cset(k, l); }
  await desk.ev(() => window._gcPullNow(true)); await H.sleep(3000);
  await desk.ev(() => window._gcAUTAI.scanSubDocs()); await H.sleep(1500);
  ok((await refsOn(desk)) === 'bc', 'after the pull + re-scan the confirmed card stays gone', await refsOn(desk));
  const a2 = await desk.ev(async () => { const s1 = window._crm.subs.find(x => x.id === 'S1'); const v = await window.idbGet('vendors'); const d1 = (v || []).find(x => x && x.id === 'S1'); return { read: !!s1.files.find(f => f.ref && f.aiRead), disk: !!(d1 && d1.files.some(f => f.aiRead)) }; });
  ok(a2.read && a2.disk, 'the sub keeps the read mark (screen and this computer\'s saved list)', a2);
  cl = null; for (let i = 0; i < 40 && !cl; i++) { const s = cloudSub('vendors', 'S1'); if (s && s.files.some(f => f.aiRead)) cl = s; else { if (i % 8 === 7) await desk.ev(() => window._gcPushAll && window._gcPushAll()); await H.sleep(500); } }
  ok(!!cl, 'the cloud gets the read mark back');

  console.log('3. the server read of a confirmed file is still open');
  SRV.reads.find(r => r.ref === REF_A).status = 'new';   /* its close was lost */
  await desk.ev(() => window._gcAUTAI.scanSubDocs()); await H.sleep(1500);
  ok((await refsOn(desk)) === 'bc', 'a re-scan does not bring it back (the sub record says it is read)', await refsOn(desk));
  ok(await H.waitFor(desk, () => true, null, 100) && SRV.reads.find(r => r.ref === REF_A).status === 'applied', 'and the server read is closed again', SRV.reads.find(r => r.ref === REF_A));
  /* confirm another one while the server loses the close: it still stays gone everywhere */
  SRV.loseDone = true;
  await confirmOn(desk, REF_C);
  SRV.loseDone = false;
  ok((await refsOn(desk)) === 'b', 'a second confirm (the server close lost): gone here', await refsOn(desk));
  cl = null; for (let i = 0; i < 40 && !cl; i++) { const s = cloudSub('vendors', 'S3'); if (s && s.files.some(f => f.aiRead)) cl = s; else await H.sleep(500); }
  ok(!!cl, 'its read mark reached the cloud');
} finally { await desk.b.close().catch(() => {}); }

console.log('4. the phone (GrayCo Field)');
const ph = await H.computer('Phone', { build, mobile: true, init: "try{localStorage.setItem('grayco_view','field')}catch(e){}" });
try {
  ok(await H.signIn(ph, ADMIN, 25000), 'admin signs in (phone)');
  await H.waitFor(ph, () => !!window._gcAUTAI && !!window._gcCoiAppr && !!window._gcOpenPmApprovals, null, 30000);
  await ph.ev(() => window._gcAUTAI.scanSubDocs()); await H.sleep(2500);
  ok((await refsOn(ph)) === 'b', 'only the W-9 nobody confirmed is waiting on the phone', await refsOn(ph));
  await ph.ev(() => window._gcOpenPmApprovals()); await H.sleep(3500);
  const card = await ph.ev(() => {
    const els = [...document.querySelectorAll('[data-gc-appr-other]')]; const vw = innerWidth;
    return els.map(e => ({ t: e.textContent.slice(0, 80), b: [...e.querySelectorAll('button')].map(b => { const r = b.getBoundingClientRect(); return { l: b.textContent.trim(), in: r.left >= 0 && r.right <= vw && r.width > 30 && r.height > 30 }; }) }));
  });
  ok(card.length === 1 && /W-9 to confirm/.test(card[0].t), 'My Approvals lists the one W-9 card', card);
  const btn = card[0] && card[0].b;
  ok(btn && btn.some(b => /Read & confirm/.test(b.l) && b.in) && btn.some(b => b.l === '✕ Deny' && b.in), 'the card has 📄 Read & confirm and ✕ Deny, both on the phone screen', btn);
  const bar = await ph.ev(() => { const L = document.querySelector('body > .gc-pu-page'); const b = L && L.querySelector(':scope > .gc-pu-bar'); const c = L && L.querySelector(':scope > .gc-pu-card'); return b && c ? { z: +getComputedStyle(b).zIndex, iso: getComputedStyle(c).isolation } : null; });
  ok(bar && bar.z >= 20 && bar.iso === 'isolate', 'the ‹ Back header stays above the cards (own layer; the card content cannot paint over it)', bar);
  console.log('5. ✕ Deny on the phone');
  await ph.ev(() => [...document.querySelectorAll('[data-gc-appr-other] button')].find(b => b.textContent.trim() === '✕ Deny').click());
  ok(await H.waitFor(ph, () => !!document.getElementById('gc-coi-deny'), null, 5000), 'the Deny sheet opens');
  await ph.page().click('#gc-coi-deny [data-why="name"]'); await ph.page().click('#gc-coi-deny [data-dn="go"]'); await H.sleep(2500);
  const d1 = await ph.ev(() => { const s2 = window._crm.subs.find(x => x.id === 'S2'); return { w9: s2.w9, rej: !!s2.files[0].rejected, up: s2.updatedAt, q: window._gcAUTAI.subDocs().length }; });
  ok(d1.w9 === false && d1.rej && d1.q === 0 && d1.up > ago(1), 'denied: file marked rejected, w9 cleared, the record re-stamped, nothing waiting', d1);
  let cs = null; for (let i = 0; i < 40 && !cs; i++) { const s = cloudSub('vendors', 'S2'); if (s && s.files[0].rejected) cs = s; else await H.sleep(500); }
  ok(!!cs && cs.w9 === false, 'the denial reached the cloud', cs && { w9: cs.w9 });
  /* an older copy (w9 true, not rejected) comes back from a computer that never saw the deny */
  const old = SUBS()[1]; for (const k of ['subs']) { const v = H.cget(k); const l = (typeof v === 'string' ? JSON.parse(v) : v).map(x => x && x.id === 'S2' ? old : x); H.cset(k, l); }
  await ph.ev(() => window._gcPullNow(true)); await H.sleep(3000);
  const d2 = await ph.ev(() => { const s2 = window._crm.subs.find(x => x.id === 'S2'); return { w9: s2.w9, rej: !!s2.files[0].rejected }; });
  ok(d2.w9 === false && d2.rej, 'an older copy synced later does not undo the deny', d2);
  const errs = ph.errs.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|net::/i.test(e));
  ok(errs.length === 0, 'no page errors', errs.slice(0, 5));
} finally { await ph.b.close().catch(() => {}); }
console.log((fail ? 'FAILED ' : 'ALL PASS ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
