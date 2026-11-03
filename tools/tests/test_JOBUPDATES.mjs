// test_JOBUPDATES.mjs <build-dir> — patch JOBUPDATES (owner 11/03, iPhone, Field, job "ROTC Cordova"): the job page's
//   "Post Update" tile is "📝 Updates & notes" and opens its OWN white page (not the dark Job Info sheet): ‹ Back + the
//   job name on top (visible from the first paint, no tap first), "Add an update" + Post (the old Job Updates box's own
//   save: project.updates), and every update / note / daily log / portal post of the job, newest first, with filter
//   chips. ‹ Back and the phone's Back return to the job page. The 📋 Job Info tile still opens its sheet, and patch
//   NAV's floating ‹ Back pill on it is visible right after it opens (NAVFIRST).
//   Phone: 390x844, iPhone UA, touch, the owner signed in, the real-data mirror (GC_MIRROR) in the offline harness
//   (GC_HARNESS) with a fake cloud — nothing is written anywhere else. Fixtures (fake cloud only): one job update like
//   the owner's ("Estimated start date 11/16"), one customer-portal post with a photo and one Site Book daily log on
//   the job; the mirror's own Customer Notes (⚠️ AUTO-FLAG) and automations log stay as they are.
// Usage: node test_JOBUPDATES.mjs <dir with index.html>
import { pathToFileURL } from 'url';
import fs from 'fs'; import path from 'path';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const MIRROR = process.env.GC_MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const SHOTS = process.env.GC_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/ju/';
const build = process.argv[2];
if (!build) { console.error('usage: node test_JOBUPDATES.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
fs.mkdirSync(SHOTS, { recursive: true });
const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
ok(html.includes('__GC_PATCH_JOBUPDATES__'), 'JOBUPDATES is in the page');

const H = await import(pathToFileURL(HARNESS).href);
const { sleep, waitFor } = H;
H.resetCloud();
const M = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
for (const r of M) if (r && r.key && !/^_probe/.test(r.key)) H.cset(r.key, r.v !== undefined ? r.v : r.value);
let P0 = H.cget('projects'); if (typeof P0 === 'string') try { P0 = JSON.parse(P0); } catch (e) {}
const JOB = (P0 || []).find(p => p && p.name === 'ROTC Cordova' && !p.deleted) || (P0 || []).find(p => p && /^active|approved$/i.test(p.status || '') && p.name);
const PID = JOB && JOB.id;
ok(!!JOB, 'fixture: the owner\'s job from the mirror', JOB && { id: JOB.id, name: JOB.name });
/* fixtures, fake cloud only */
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGNgYGD4z0AswK4SAFXuAf8EPy+xAAAAAElFTkSuQmCC';
const FX = {
  update: { at: '2026-11-03T15:39:00.000Z', by: 'Wesley Johnson', text: 'Estimated start date 11/16' },
  post: { id: 'pp_jutest1', at: '2026-11-02T18:00:00.000Z', by: 'Wesley Johnson', text: 'Crew mobilizes next week — site fence goes up Monday.', files: [{ ref: PHOTO, name: 'fence.png', type: 'image/png' }] },
  log: { id: 'LOGjutest1', date: '2026-11-01', work: 'Laid out the obstacle course footings', by: 'Wesley Johnson', createdAt: '2026-11-01T21:00:00.000Z', updatedAt: '2026-11-01T21:00:00.000Z' }
};
const mirrorNotes = { cn: String(JOB.customerNotes || ''), autoLog: (JOB.autoLog || []).length };
H.cset('projects', (P0 || []).map(p => p && p.id === PID ? Object.assign({}, p, { updates: [FX.update].concat(p.updates || []), portalPosts: (p.portalPosts || []).concat([FX.post]) }) : p));
let SBK = H.cget('gc_sitebook'); if (typeof SBK === 'string') try { SBK = JSON.parse(SBK); } catch (e) { SBK = []; }
H.cset('gc_sitebook', (Array.isArray(SBK) ? SBK.filter(r => r && r.id !== PID) : []).concat([{ id: PID, logs: [FX.log], updatedAt: FX.log.updatedAt }]));

const W = [];
const close = async () => { for (const c of W) await c.b.close().catch(() => {}); };
const noJobInfo = c => c.ev(() => !document.getElementById('_jpUpdateText') && ![...document.body.children].some(d => /PO NUMBER/.test(d.innerText || '')));
async function openJob(c){
  await c.ev(pid => { document.querySelectorAll('#_gcJobPick,#_gcJobDash,#_gcJobUpd,.gcfp-sheet').forEach(o => o.remove()); [...document.body.children].filter(d => /PO NUMBER/.test(d.innerText || '')).forEach(d => d.remove()); window._gcJobDashboard(pid); }, PID);
  return waitFor(c, () => !!document.querySelector('#_gcJobDash .gcfp-grid ._jdAct[data-fn="update"]'), null, 15000);
}
/* the ‹ Back control is on screen, below the notch, not covered, opaque */
const backSeen = (c, sel) => c.ev(sel => {
  const b = document.querySelector(sel); if (!b) return { ok: false, why: 'missing' };
  const cs = getComputedStyle(b), r = b.getBoundingClientRect();
  const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;top:env(safe-area-inset-top,0px);left:0;width:0;height:0'; document.body.appendChild(probe); const safe = probe.getBoundingClientRect().top; probe.remove();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const o = { display: cs.display, vis: cs.visibility, op: cs.opacity, top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width), safe, hit: !!hit && (hit === b || b.contains(hit)), txt: (b.innerText || '').replace(/\s+/g, ' ').trim() };
  o.ok = cs.display !== 'none' && cs.visibility === 'visible' && +cs.opacity > 0.9 && r.width >= 40 && r.height >= 40 && r.top >= safe && r.bottom <= innerHeight && o.hit;
  return o;
}, sel);
const listInfo = c => c.ev(() => [...document.querySelectorAll('#_gcJobUpd .gcju-list .gcju-it')].map(e => ({ kind: e.getAttribute('data-kind'), src: e.getAttribute('data-src'), cust: e.getAttribute('data-cust') === '1', auto: e.classList.contains('auto'), bg: getComputedStyle(e).backgroundColor, tx: (e.querySelector('.tx') || {}).textContent || '', dt: (e.querySelector('.dt') || {}).textContent || '', by: (e.querySelector('.mt b') || {}).textContent || '', badge: /Shared with customer/.test(e.textContent), img: [...e.querySelectorAll('img')].map(i => !!i.src && i.naturalWidth > 0) })));

try {
  const O = await H.computer('OWN', { build, mobile: true }); W.push(O);
  await H.signIn(O, 'wjohnson@grayco-cs.com', 9000);
  ok(!!(await waitFor(O, () => !!document.querySelector('#_gcJobPick.gc-fh'), null, 60000)), 'the phone opens in GrayCo Field');
  await waitFor(O, pid => ((window._crm && window._crm.projects) || []).some(p => p && p.id === pid && (p.updates || []).length && (p.portalPosts || []).length), PID, 90000);
  await waitFor(O, pid => { try { const r = window._gcRP.site().rec(pid); return (r.logs || []).length > 0; } catch (e) { return false; } }, PID, 30000);
  await sleep(1500);
  const pg = O.page();
  ok(!!(await openJob(O)), 'the job opens in Field with its tiles');

  /* ── the tile ── */
  const tile = await O.ev(() => { const g = document.querySelector('#_gcJobDash .gcfp-grid'); const b = g && g.querySelector('._jdAct[data-fn="update"]'); const all = g ? [...g.children] : []; return b ? { txt: b.innerText.replace(/\s+/g, ' ').trim(), i: all.indexOf(b), prev: (all[all.indexOf(b) - 1] || {}).innerText, next: (all[all.indexOf(b) + 1] || {}).innerText } : null; });
  ok(!!tile && tile.txt === '📝 Updates & notes', 'the tile reads "📝 Updates & notes"', tile);
  ok(!!tile && /Sub portal/.test(tile.prev || '') && /Message/.test(tile.next || ''), 'it keeps its place (after 🔧 Sub portal, before 💬 Message — as on the owner\'s screen)', tile);
  await pg.screenshot({ path: SHOTS + 'jobupdates_job.png' });

  /* ── tap it: the new page, Back visible from the first paint ── */
  await pg.locator('#_gcJobDash ._jdAct[data-fn="update"]').first().tap();
  const t0 = Date.now();
  await waitFor(O, () => !!document.getElementById('_gcJobUpd'), null, 3000, 30);
  const b0 = await backSeen(O, '#_gcJobUpd .gcju-back');
  const tB0 = Date.now() - t0;
  ok(b0.ok && /Back/.test(b0.txt), '‹ Back is visible right after the page opens, with no tap first (' + tB0 + ' ms)', b0);
  await sleep(250); const b1 = await backSeen(O, '#_gcJobUpd .gcju-back');
  await sleep(900); const b2 = await backSeen(O, '#_gcJobUpd .gcju-back');
  ok(b1.ok && b2.ok, '… and stays visible (0.25 s, 1.2 s)', { b1, b2 });
  ok(await noJobInfo(O), 'the dark Job Info sheet is NOT opened (the owner\'s bug)');
  const pgi = await O.ev(() => { const o = document.getElementById('_gcJobUpd'); const r = o.getBoundingClientRect(); const hd = o.querySelector('.gcju-head'); return { bg: getComputedStyle(o).backgroundColor, name: (o.querySelector('.gcju-ttl b') || {}).textContent, top: r.top, w: r.width, headBg: getComputedStyle(hd).backgroundColor, ta: !!o.querySelector('textarea#gcju-text'), post: (o.querySelector('.gcju-post') || {}).textContent, postH: (o.querySelector('.gcju-post') || { getBoundingClientRect(){ return {}; } }).getBoundingClientRect().height, chips: [...o.querySelectorAll('.gcju-chip')].map(c => c.firstChild.textContent), onTop: o.contains(document.elementFromPoint(195, 400)) }; });
  ok(pgi.bg === 'rgb(255, 255, 255)' && pgi.headBg === 'rgb(255, 255, 255)', 'the page is white (the CRM look), full screen', pgi);
  ok(pgi.name === JOB.name, 'the top bar shows the job name', pgi.name);
  ok(pgi.ta && /Post/.test(pgi.post || '') && pgi.postH >= 48, '"Add an update" box with a big Post button on top', pgi);
  ok(JSON.stringify(pgi.chips) === JSON.stringify(['All', 'Updates', 'Notes', 'Daily log', 'Customer-visible']), 'filter chips: All · Updates · Notes · Daily log · Customer-visible', pgi.chips);
  ok(pgi.onTop, 'the page is the screen (not behind anything)');
  await waitFor(O, () => document.querySelectorAll('#_gcJobUpd img[src]').length > 0, null, 5000);
  await sleep(300);
  await pg.screenshot({ path: SHOTS + 'jobupdates_page.png' });

  /* ── every source, newest first ── */
  let L = await listInfo(O);
  const find = re => L.findIndex(x => re.test(x.tx));
  const iU = find(/^Estimated start date 11\/16$/), iP = find(/Crew mobilizes next week/), iLg = find(/Laid out the obstacle course footings/), iAF = find(/AUTO-FLAG/), iAL = L.findIndex(x => x.src === 'autoLog');
  ok(iU >= 0 && L[iU].kind === 'update' && L[iU].by === 'Wesley Johnson', 'the job\'s posted update is there (project.updates), with who and when', L[iU]);
  ok(iP >= 0 && L[iP].kind === 'portal' && L[iP].badge && L[iP].cust, 'the customer-portal post is there with a "Shared with customer" badge (project.portalPosts)', L[iP]);
  ok(iP >= 0 && L[iP].img.length === 1 && L[iP].img[0], '… with its photo thumbnail', L[iP] && L[iP].img);
  ok(iLg >= 0 && L[iLg].kind === 'log', 'the Site Book daily log is there (gc_sitebook)', L[iLg]);
  ok(!/AUTO-FLAG/.test(mirrorNotes.cn) || (iAF >= 0 && L[iAF].auto && L[iAF].src === 'customerNotes' && L[iAF].bg !== 'rgb(255, 255, 255)'), 'the mirror\'s Customer Notes AUTO-FLAG line is there, greyed', L[iAF]);
  ok(!mirrorNotes.autoLog || (iAL >= 0 && L.filter(x => x.src === 'autoLog').length === mirrorNotes.autoLog && L[iAL].auto), 'the mirror\'s automations log is there (greyed), every entry', { n: L.filter(x => x.src === 'autoLog').length, want: mirrorNotes.autoLog });
  ok(iU >= 0 && iU < iP && iP < iLg && (iAF < 0 || iLg < iAF) && (iAL < 0 || iLg < iAL), 'newest first (update 11/03 · portal post 11/02 · log 11/01 · notes 10/23 · automations 10/22)', { iU, iP, iLg, iAF, iAL });
  const ts = await O.ev(pid => window._gcJobUpdates.items(pid).then(l => l.map(x => x.t)), PID);
  const z = ts.indexOf(0), head = z < 0 ? ts : ts.slice(0, z);
  ok(head.every((t, i) => !i || head[i - 1] >= t) && (z < 0 || ts.slice(z).every(t => !t)),'the whole list is sorted newest first (undated lines at the end)', ts.slice(0, 20));
  const total = L.length;

  /* ── the chips ── */
  for (const [c, test] of [['note', x => x.kind === 'note'], ['log', x => x.kind === 'log'], ['cust', x => x.cust], ['update', x => x.kind === 'update' || x.kind === 'portal']]) {
    await pg.locator('#_gcJobUpd .gcju-chip[data-chip="' + c + '"]').tap(); await sleep(150);
    const l = await listInfo(O);
    ok(l.length > 0 && l.every(test) && l.length < total, 'chip ' + c + ': only those (' + l.length + ' of ' + total + ')', l.map(x => x.kind + (x.cust ? '+cust' : '')));
  }
  await pg.locator('#_gcJobUpd .gcju-chip[data-chip="all"]').tap(); await sleep(150);
  ok((await listInfo(O)).length === total, 'chip All: everything again');

  /* ── post an update: on top, in project.updates (the old box's store) ── */
  const TXT = 'Footings poured on the north side (test ' + Date.now().toString(36) + ')';
  await pg.locator('#gcju-text').tap(); await pg.locator('#gcju-text').fill(TXT);
  await pg.locator('#_gcJobUpd .gcju-post').tap();
  await sleep(200);
  L = await listInfo(O);
  ok(L[0] && L[0].tx === TXT && L[0].kind === 'update', 'the new update shows at the top right away', L.slice(0, 2));
  ok(await O.ev(() => document.getElementById('gcju-text').value === '' && /Posted/.test(document.querySelector('#_gcJobUpd .gcju-msg').textContent)), 'the box empties and says ✓ Posted');
  const saved = await waitFor(O, ([pid, t]) => { const p = (window._crm.projects || []).find(x => x && x.id === pid); const u = p && (p.updates || [])[0]; return u && u.text === t ? { keys: Object.keys(u).sort(), by: u.by, me: localStorage.getItem('grayco_user'), at: u.at, n: p.updates.length } : null; }, [PID, TXT], 10000);
  ok(!!saved && JSON.stringify(saved.keys) === '["at","by","text"]' && saved.by === saved.me && saved.n === 2, 'it is saved first in project.updates as { text, by, at } — exactly the old Job Updates box\'s record', saved);
  const inCloud = await (async () => { for (let i = 0; i < 120; i++) { let v = H.cget('projects'); if (typeof v === 'string') try { v = JSON.parse(v); } catch (e) { v = []; } const p = (v || []).find(x => x && x.id === PID); if (p && (p.updates || []).some(u => u.text === TXT)) return true; await sleep(500); } return false; })();
  ok(inCloud, 'it reaches the cloud with the job (gc_kv projects, the usual save)');
  await sleep(1500);
  L = await listInfo(O);
  ok(L.filter(x => x.tx === TXT).length === 1 && L[0].tx === TXT, 'after the save it is listed once, still on top', L.slice(0, 2).map(x => x.tx));
  await pg.screenshot({ path: SHOTS + 'jobupdates_posted.png' });

  /* ── ‹ Back → the job page ── */
  await pg.locator('#_gcJobUpd .gcju-back').tap(); await sleep(500);
  ok(await O.ev(() => !document.getElementById('_gcJobUpd') && !!document.getElementById('_gcJobDash') && document.getElementById('_gcJobDash').contains(document.elementFromPoint(195, 500))), '‹ Back returns to the job page');
  /* ── the phone's Back → the job page ── */
  await pg.locator('#_gcJobDash ._jdAct[data-fn="update"]').first().tap();
  await waitFor(O, () => !!document.getElementById('_gcJobUpd'), null, 3000, 50);
  const hs = await O.ev(() => history.state && history.state.gcJobUpd);
  ok(hs === PID, 'opening it adds a history entry', hs);
  await pg.goBack({ timeout: 3000 }).catch(() => O.ev(() => history.back()));
  await sleep(900);
  ok(await O.ev(() => !document.getElementById('_gcJobUpd') && !!document.getElementById('_gcJobDash') && document.getElementById('_gcJobDash').contains(document.elementFromPoint(195, 500))), 'the phone\'s Back returns to the job page (not the job list)', await O.ev(() => ({ upd: !!document.getElementById('_gcJobUpd'), dash: !!document.getElementById('_gcJobDash'), pick: !!document.getElementById('_gcJobPick') })));

  /* ── 📋 Job Info: still its own sheet, with the same Job Updates (the same store) ── */
  await openJob(O);
  await pg.locator('#_gcJobDash ._jdAct[data-fn="info"]').first().tap();
  const t1 = Date.now();
  await waitFor(O, () => !!document.getElementById('_jpUpdateText'), null, 4000, 30);
  await sleep(80);
  const nb0 = await backSeen(O, '#_gcNavBk'); const tN0 = Date.now() - t1;
  await sleep(400); const nb1 = await backSeen(O, '#_gcNavBk');
  ok(nb0.ok && nb1.ok, 'Job Info: the floating ‹ Back is visible right after it opens, no tap first (' + tN0 + ' ms, then 0.5 s)', { nb0, nb1 });
  const ji = await O.ev(t => { const el = [...document.querySelectorAll('body > div')].reverse().find(d => /PO NUMBER/.test(d.innerText || '')); return el ? { card: getComputedStyle(el.firstElementChild).backgroundColor, has: (el.innerText || '').indexOf(t) >= 0 } : null; }, TXT);
  ok(!!ji && ji.card === 'rgb(15, 36, 64)', '📋 Job Info still opens the Job Info sheet (unchanged)', ji);
  ok(!!ji && ji.has, 'its Job Updates box lists the update posted from the new page (one store)', ji);
  await pg.screenshot({ path: SHOTS + 'jobupdates_jobinfo.png' });
  /* scrolled down to its Job Updates box (the old Post Update path): the pill is still there, no tap */
  await O.ev(() => { const el = document.getElementById('_jpUpdateText'); el.scrollIntoView({ block: 'center' }); });
  await sleep(150); const nb2 = await backSeen(O, '#_gcNavBk');
  await sleep(700); const nb3 = await backSeen(O, '#_gcNavBk');
  ok(nb2.ok && nb3.ok, 'Job Info scrolled to Job Updates: the floating ‹ Back is still visible (no tap)', { nb2, nb3 });
  await pg.screenshot({ path: SHOTS + 'jobupdates_jobinfo_scrolled.png' });
  await pg.locator('#_gcNavBk').tap(); await sleep(700);
  ok(await O.ev(() => !document.getElementById('_jpUpdateText') && !!document.getElementById('_gcJobDash')), 'that ‹ Back closes Job Info back to the job page');

  ok(await O.ev(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth + 1), 'no sideways scroll');
  ok(!O.errs.length, 'phone: no page errors', O.errs.slice(0, 3));
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
await close();
console.log(`JOBUPDATES ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
