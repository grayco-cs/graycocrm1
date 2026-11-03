// test_JOBPACKET.mjs <build-dir> — patch JOBPACKET (owner 11/03): "🖨 Print job packet" on the Field job page (iPhone
//   390x844, touch, the owner) and on the desk job page (1400x900, a PM: no money). The real-data mirror (GC_MIRROR) in
//   the offline harness (GC_HARNESS) with a fake cloud and a fake file bucket — nothing is written anywhere else.
//   Fixtures (fake cloud only, on the mirror's job): a scope with prices in it, one change order with an amount, one sub
//   on the job, one open punch item.
// Usage: node test_JOBPACKET.mjs <dir with index.html>
import { pathToFileURL } from 'url';
import fs from 'fs'; import path from 'path';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const MIRROR = process.env.GC_MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const SHOTS = process.env.GC_SHOTS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/jobpacket/';
const build = process.argv[2];
if (!build) { console.error('usage: node test_JOBPACKET.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
fs.mkdirSync(SHOTS, { recursive: true });
ok(fs.readFileSync(path.join(build, 'index.html'), 'utf8').includes('__GC_PATCH_JOBPACKET__'), 'JOBPACKET is in the page');

const H = await import(pathToFileURL(HARNESS).href);
const { sleep, waitFor } = H;
H.resetCloud();
{ const M = JSON.parse(fs.readFileSync(MIRROR, 'utf8')); for (const r of M) if (r && r.key && !/^_probe/.test(r.key)) H.cset(r.key, r.v !== undefined ? r.v : r.value); }
const J = k => { let v = H.cget(k); if (typeof v === 'string') try { v = JSON.parse(v); } catch (e) {} return v; };
const P0 = J('projects') || [];
const JOB = P0.find(p => p && p.name === 'ROTC Cordova' && !p.deleted);
const PID = JOB && JOB.id, CODE = JOB && (JOB.autoPO || JOB.po || JOB.id);
ok(!!JOB, 'fixture: the owner\'s job from the mirror', JOB && { id: JOB.id, name: JOB.name, code: CODE });
const FX = {
  scope: 'Build the ROTC obstacle course per drawings\nFootings for 12 stations @ $65/hr\nRope climb frame = $1,240.00\nSubtotal $18,500\nTotal: $19,980',
  co: { id: 'CO_jptest1', pid: PID, desc: 'Add a second rope climb', amt: 2450, status: 'approved', date: '2026-11-02' },
  sub: { id: 'PSBjptest1', name: 'Test Concrete Co', trade: 'Concrete', phone: '(901) 555-0142', email: 'crew@testconcrete.example', status: 'Awarded', bidAmt: '9000' },
  punch: { id: 'PUN_jptest1', pid: PID, item: 'Touch up paint on station 4 rail', status: 'open', assignee: 'Wesley Johnson', date: '2026-11-03', createdAt: '2026-11-03T15:00:00.000Z', updatedAt: '2026-11-03T15:00:00.000Z' }
};
H.cset('projects', P0.map(p => p && p.id === PID ? Object.assign({}, p, { scopeOfWork: FX.scope, subs: [FX.sub] }) : p));
H.cset('cos', (J('cos') || []).concat([FX.co]));
H.cset('punch', (J('punch') || []).concat([FX.punch]));

const STORE = [];
async function fakeFiles(c){
  await c.ctx.route(u => /\/storage\/v1\/object\//.test(String(u)), async r => {
    const q = r.request(); if (q.method() === 'POST' || q.method() === 'PUT') STORE.push({ path: new URL(q.url()).pathname, size: (q.postDataBuffer() || Buffer.alloc(0)).length });
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ Key: 'ok' }) });
  });
  await c.ctx.addInitScript(() => { window.__jpOpen = 0; window.__jpPrint = 0; const o = window.open; window.open = function(){ window.__jpOpen++; return null; }; window.print = function(){ window.__jpPrint++; }; });
}
const W = [];
const close = async () => { for (const c of W) await c.b.close().catch(() => {}); };
const backSeen = c => c.ev(() => {
  const b = document.querySelector('#_gcPacket .gcjp-back'); if (!b) return { ok: false, why: 'missing' };
  const cs = getComputedStyle(b), r = b.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { ok: cs.display !== 'none' && cs.visibility === 'visible' && r.width >= 40 && r.height >= 40 && r.top >= 0 && r.bottom <= innerHeight && !!hit && (hit === b || b.contains(hit)), top: r.top, txt: b.textContent };
});
const info = c => c.ev(() => {
  const o = document.getElementById('_gcPacket'); if (!o) return null;
  const secs = [...o.querySelectorAll('.gcjp-doc .gcjp-sec')];
  const txt = k => ((o.querySelector('.gcjp-sec[data-sec="' + k + '"]') || {}).innerText || '');
  const se = document.scrollingElement, sc = o.querySelector('.gcjp-scroll');
  return { secs: secs.map(x => x.getAttribute('data-sec')), feet: secs.map(x => ((x.querySelector('.gcjp-foot') || {}).textContent || '')), cust: txt('cust'), scope: txt('scope'), sched: txt('sched'), co: txt('co'), permit: txt('permit'), subs: txt('subs'), punch: txt('punch'),
    head: ((secs[0] && secs[0].querySelector('.gcjp-hd')) || {}).innerText || '', logo: !!(secs[0] && secs[0].querySelector('.gcjp-hd img')), bg: getComputedStyle(secs[0]).backgroundColor,
    boxes: [...o.querySelectorAll('.gcjp-opts input[data-k]')].map(i => i.getAttribute('data-k') + ':' + i.checked),
    sideways: Math.max(se.scrollWidth - innerWidth, sc.scrollWidth - sc.clientWidth), nOpen: window.__jpOpen };
});

try {
  /* ══ iPhone, the owner, Field ══ */
  const O = await H.computer('OWN', { build, mobile: true }); W.push(O); await fakeFiles(O);
  await H.signIn(O, 'wjohnson@grayco-cs.com', 9000);
  ok(!!(await waitFor(O, () => !!document.querySelector('#_gcJobPick.gc-fh'), null, 60000)), 'the phone opens in GrayCo Field');
  await waitFor(O, pid => typeof window._gcStoreFile === 'function' && ((window._crm && window._crm.projects) || []).some(p => p && p.id === pid && (p.subs || []).length) && ((window._crm.cos || window._crm.changeOrders || []).some(x => x && x.id === 'CO_jptest1')), PID, 90000);
  await waitFor(O, async () => ((await window.idbGet('punch')) || []).some(x => x && x.id === 'PUN_jptest1'), null, 60000);   /* the punch list is synced to this device */
  await sleep(1500);
  const pg = O.page();
  await O.ev(pid => { document.querySelectorAll('#_gcJobPick,#_gcJobDash,.gcfp-sheet').forEach(o => o.remove()); window._gcJobDashboard(pid); }, PID);
  const tile = await waitFor(O, () => { const g = document.querySelector('#_gcJobDash .gcfp-grid'), b = g && g.querySelector('.gcjp-tile'); return b ? { txt: b.innerText.replace(/\s+/g, ' ').trim(), last: g.lastElementChild === b, n: g.children.length } : null; }, null, 8000);
  ok(!!tile && tile.txt === '🖨 Print job packet' && tile.last, 'Field job page: "🖨 Print job packet" is the last job tile (secondary)', tile);
  await pg.screenshot({ path: SHOTS + 'jobpacket_job.png' });
  await pg.locator('#_gcJobDash .gcjp-tile').tap();
  await waitFor(O, () => !!document.getElementById('_gcPacket'), null, 3000, 30);
  await sleep(50);
  const b0 = await backSeen(O);
  ok(b0.ok && /Back/.test(b0.txt), '‹ Back is visible from the first paint', b0);
  let I = await info(O);
  ok(!!I && I.bg === 'rgb(255, 255, 255)' && I.logo && /job packet/i.test(I.head) && I.head.includes(JOB.name) && I.head.includes(CODE) && /Printed/.test(I.head), 'a white packet: GrayCo logo header, job name, address, job code, printed date', I && { head: I.head, logo: I.logo, bg: I.bg });
  ok(!!I && I.boxes.length === 9 && I.boxes.every(x => /:true$/.test(x)), 'nine parts to pick, all ticked by default', I && I.boxes);
  ok(I.cust.includes(JOB.client) && I.cust.includes(JOB.clientPhone) && I.cust.includes(JOB.clientEmail) && I.cust.includes(JOB.address) && I.cust.includes('Wesley Johnson') && !/AUTO-FLAG/.test(I.cust), 'Customer & site: the real customer, phone, e-mail, address and the PM (no AUTO-FLAG lines)', I.cust.slice(0, 400));
  ok(/obstacle course/i.test(I.scope) && /Rope climb frame/.test(I.scope) && !/\$/.test(I.scope) && !/1,240|18,500|19,980|65\/hr/.test(I.scope) && !/Subtotal|Total/i.test(I.scope), 'Scope of work: the wording only — no $ amounts, no totals', I.scope);
  ok(/Pre-construction meeting/.test(I.sched) && /Framing/.test(I.sched), 'Schedule & phases: the job\'s phases (schedPlan) and dates', I.sched.slice(0, 300));
  ok(/Add a second rope climb/.test(I.co) && /approved/i.test(I.co) && /\$2,450/.test(I.co), 'Change orders: title, status and — for the owner — the amount', I.co);
  ok(/Building permit/.test(I.permit) && /Fire marshal review/.test(I.permit), 'Permits & inspections: the job\'s permit checklist', I.permit.slice(0, 300));
  ok(/Test Concrete Co/.test(I.subs) && /Concrete/.test(I.subs) && /555-0142/.test(I.subs) && !/9000|9,000/.test(I.subs), 'Subs on the job: name, trade, contact (no bid amount)', I.subs);
  await waitFor(O, () => /Touch up paint on station 4 rail/.test((document.querySelector('#_gcPacket .gcjp-sec[data-sec="punch"]') || {}).innerText || ''), null, 5000); I = await info(O);
  const pdbg = /Touch up/.test(I.punch) ? null : await O.ev(async pid => { const v = await window.idbGet('punch'); const l = Array.isArray(v) ? v : []; return { idb: l.length, mine: l.filter(x => x && x.pid === pid).map(x => x.id + ':' + x.status), crm: ((window._crm || {}).punch || []).length, list: ((window._crm || {}).punchlist || []).length }; }, PID);
  ok(/Touch up paint on station 4 rail/.test(I.punch), 'Open punch list & To-Dos: the open punch item', pdbg || I.punch.slice(0, 300));
  const forms = ['form-log', 'form-punch', 'form-co', 'form-signoff'];
  ok(forms.every(f => I.secs.includes(f)), 'the four blank forms: daily log, punch list, change-order request, customer sign-off', I.secs);
  const fTxt = await O.ev(() => ['form-log', 'form-signoff'].map(k => document.querySelector('#_gcPacket .gcjp-sec[data-sec="' + k + '"]').innerText));
  ok(/Weather/.test(fTxt[0]) && /Crew on site/.test(fTxt[0]) && /Work done/.test(fTxt[0]) && /Issues/.test(fTxt[0]) && /signature/i.test(fTxt[0]) && /Customer signature/.test(fTxt[1]) && !/insurance|carrier|state farm|allstate/i.test(fTxt[1]), 'daily log has date / weather / crew / work / issues / signatures; the sign-off has no insurance carrier', fTxt.map(x => x.slice(0, 200)));
  ok(I.feet.length === I.secs.length && I.feet.every(f => /Scan back: Job → 🖨 Print job packet → 📷 Add paper \(photo\)/.test(f) && f.includes(CODE)), 'every page ends with "Scan back: Job → 🖨 Print job packet → 📷 Add paper (photo)" and the job code', I.feet.slice(0, 2));
  ok(I.sideways <= 0, 'no sideways scroll on the iPhone', I.sideways);
  await pg.screenshot({ path: SHOTS + 'jobpacket_phone.png' });

  /* the choice is remembered */
  await pg.locator('#_gcPacket .gcjp-opts input[data-k="scope"]').tap(); await sleep(200);
  ok(!(await info(O)).secs.includes('scope'), 'un-ticking Scope takes it out of the packet');
  await pg.locator('#_gcPacket .gcjp-back').tap(); await sleep(300);
  ok(await O.ev(() => !document.getElementById('_gcPacket') && !!document.getElementById('_gcJobDash') && document.getElementById('_gcJobDash').contains(document.elementFromPoint(195, 500))), '‹ Back returns to the job page');
  await O.ev(pid => window._gcJobPacket.open(pid), PID); await sleep(200);
  I = await info(O);
  ok(I.boxes.includes('scope:false') && !I.secs.includes('scope'), 'reopened: the choice is remembered', I.boxes);
  await pg.locator('#_gcPacket .gcjp-opts input[data-k="scope"]').tap(); await sleep(200);

  /* the print style (the fallback when there is no in-app viewer): only the packet prints */
  await O.ev(() => document.documentElement.classList.add('gcjp-open'));
  await pg.emulateMedia({ media: 'print' });
  const pr = await O.ev(() => { const v = el => !!el && getComputedStyle(el).display !== 'none'; const others = [...document.body.children].filter(e => e.id !== '_gcPacket' && e.tagName !== 'SCRIPT' && e.tagName !== 'STYLE'); const secs = [...document.querySelectorAll('#_gcPacket .gcjp-sec')];
    return { packet: v(document.getElementById('_gcPacket')), bar: v(document.querySelector('#_gcPacket .gcjp-bar')), opts: v(document.querySelector('#_gcPacket .gcjp-opts')), app: others.filter(v).map(e => e.id || e.className || e.tagName), brk: secs.slice(1).every(s => /page/.test(getComputedStyle(s).breakBefore) || getComputedStyle(s).breakBefore === 'always') }; });
  ok(pr.packet && !pr.bar && !pr.opts && pr.app.length === 0, 'print style: only the packet prints — the app, the bar and the check boxes are hidden', pr);
  ok(pr.brk, 'print style: a page break between the parts', pr);
  const pdf = await pg.pdf({ format: 'Letter' }).catch(e => null);
  await pg.emulateMedia({ media: 'screen' });
  ok(!!pdf && pdf.length > 5000, 'it prints to Letter pages (' + (pdf ? Math.round(pdf.length / 1024) + ' KB' : 'none') + ')');
  if (pdf) fs.writeFileSync(SHOTS + 'jobpacket.pdf', pdf);

  /* 🖨 Print: the in-app viewer (DOCOPEN, live) opens with the packet and prints it */
  await pg.locator('#_gcPacket [data-a="print"]').tap();
  const gv = await waitFor(O, () => { const v = document.getElementById('gc-viewer'); return v && v.querySelector('[data-gv="back"]') ? { name: (v.querySelector('.gv-bar b') || {}).textContent, onTop: v.contains(document.elementFromPoint(195, 30)) } : null; }, null, 5000);
  ok(!!gv && /Job_Packet/.test(gv.name) && gv.onTop, '🖨 Print opens the packet in the in-app viewer (‹ Back, Download, Share)', gv);
  const gvc = await waitFor(O, () => { const v = document.getElementById('gc-viewer'), fr = v && v.querySelector('iframe'), d = fr && fr.contentDocument; const pb = v && v.querySelector('[data-gv="print"]'), dl = v && v.querySelector('[data-gv="dl"]');
    return d && /Scan back/.test(d.body ? d.body.innerText : '') ? { print: !!pb && !pb.hidden, dl: !!dl && getComputedStyle(dl).display !== 'none', forms: d.querySelectorAll('.gcjp-form').length, noDollarScope: !/\$/.test((d.querySelector('[data-sec="scope"]') || {}).innerText || '') } : null; }, null, 8000);
  ok(!!gvc && gvc.print && gvc.dl && gvc.forms === 4 && gvc.noDollarScope, 'the viewer shows the packet (4 forms, no $ in the scope) with its 🖨 Print and ⬇️ Download', gvc);
  await pg.screenshot({ path: SHOTS + 'jobpacket_viewer.png' });
  await pg.locator('#gc-viewer [data-gv="back"]').tap(); await sleep(300);
  ok(await O.ev(() => !document.getElementById('gc-viewer') && !!document.getElementById('_gcPacket')), 'the viewer\'s ‹ Back returns to the packet');
  /* the packet's own ⬇️ Download */
  const dl2 = pg.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await pg.locator('#_gcPacket [data-a="dl"]').tap();
  const d2 = await dl2;
  ok(!!d2 && /^GrayCo_Job_Packet_.*\.html$/.test(d2.suggestedFilename()), 'the packet\'s ⬇️ Download saves an .html packet', d2 && d2.suggestedFilename());

  /* 📷 Add paper (photo): the Field Add Photo/File flow → the job's Documents as "Packet scan" */
  const fc = pg.waitForEvent('filechooser', { timeout: 6000 }).catch(() => null);
  await pg.locator('#_gcPacket [data-a="paper"]').tap();
  const ch = await fc;
  ok(!!ch && /image\/\*/.test(await ch.element().getAttribute('accept')), '📷 Add paper (photo) opens the phone\'s camera / photo picker (the Add Photo/File chooser)');
  const JPG = Buffer.from(await O.ev(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 48; const x = c.getContext('2d'); x.fillStyle = '#ddd'; x.fillRect(0, 0, 64, 48); return c.toDataURL('image/jpeg', 0.8).split(',')[1]; }), 'base64');
  if (ch) await ch.setFiles({ name: 'IMG_0412.jpg', mimeType: 'image/jpeg', buffer: JPG });
  const doc = await waitFor(O, async pid => { const l = ((await window.idbGet('projectDocs')) || []).filter(d => d && d.pid === pid && d.cat === 'Packet scan'); return l.length ? l[0] : null; }, PID, 20000);
  ok(!!doc && doc.name === 'Paper from packet — IMG_0412.jpg' && doc.portalShare === false && /^sb:crm-files\//.test(doc.ref || '') && (doc.tags || []).includes('Packet scan'), 'the photo is saved on the job\'s Documents as "Packet scan" / "Paper from packet", never on the customer portal', doc);
  ok(await O.ev(() => !!document.getElementById('_gcPacket')), '… and the packet stays on the screen');
  await pg.screenshot({ path: SHOTS + 'jobpacket_after_paper.png' });
  ok((await O.ev(() => window.__jpOpen)) === 0 && O.pages.length <= 1, 'no window.open, no new tab', { open: await O.ev(() => window.__jpOpen), pages: O.pages.length });
  ok(O.errs.length === 0, 'no page errors on the phone', O.errs.slice(0, 5));

  /* ══ desk, a PM (no money on this job) ══ */
  const S = await H.computer('PM', { build }); W.push(S); await fakeFiles(S);
  await H.signIn(S, 'sbiffle@grayco-cs.com', 9000);
  await waitFor(S, pid => ((window._crm && window._crm.projects) || []).some(p => p && p.id === pid), PID, 90000);
  await sleep(1500);
  const dp = S.page();
  const nav = async () => { await S.ev(() => { const d = document.getElementById('_dailyDig'); if (d) d.remove(); try { window._setView('projects'); } catch (e) {} }); await sleep(2000); await S.ev(pid => window._navToJob(pid), PID); };
  await nav();
  if (!(await waitFor(S, () => [...document.querySelectorAll('main button')].some(b => /All Projects/.test(b.textContent)), null, 15000))) await nav();
  const bar = await waitFor(S, () => { const b = document.querySelector('.gcx10-jobbar:not([data-field]) [data-gcjp-open]'); return b ? b.textContent : null; }, null, 20000);
  const dbg = bar ? null : await S.ev(() => ({ op: (window._gcOpenProject || {}).id, cls: document.documentElement.className, back: [...document.querySelectorAll('main button')].some(b => /All Projects/.test(b.textContent)), bars: [...document.querySelectorAll('.gcx10-jobbar')].length }));
  ok(bar === '🖨 Print job packet', 'desk job page: "🖨 Print job packet" beside 🏠 Home profile · 🔐 Access codes · 📋 Inspections', bar || dbg);
  await S.ev(() => { const d = document.getElementById('_dailyDig'); if (d) d.remove(); const ra = document.getElementById('gc-ra-desk'); if (ra && ra.querySelector('.gc-ra-cards')) ra.style.display = 'none'; });   /* the once-a-day digest pop-up; the role's desk home, which the harness leaves over the job page after _navToJob */
  if (bar) { const loc = dp.locator('.gcx10-jobbar:not([data-field]) [data-gcjp-open]').first(); const cdbg = await loc.evaluate(b => { b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { r: [r.left, r.top, r.width, r.height].map(Math.round), vis: getComputedStyle(b).visibility, disp: getComputedStyle(b.parentElement.parentElement).display, hit: h && (h === b || b.contains(h)) ? 'self' : (h && (h.id || h.className || h.tagName)) }; });
    const clicked = await loc.click({ timeout: 5000 }).then(() => true, () => false);
    ok(clicked, 'desk: the button can be clicked', cdbg);
    if (!clicked) await loc.evaluate(b => b.click()); }
  else await S.ev(pid => window._gcJobPacket.open(pid), PID);
  await waitFor(S, () => !!document.getElementById('_gcPacket'), null, 3000);
  const K = await info(S), money = await S.ev(pid => window._gcJobPacket.canMoney(pid), PID);
  ok(money === false && /Add a second rope climb/.test(K.co) && !/\$|2,450|Status\tAmount/.test(K.co), 'a PM without the job\'s money: the change order\'s title and status, no amount', { money, co: K.co });
  ok(!/\$/.test(K.scope), 'desk: no $ in the scope either', K.scope.slice(0, 200));
  ok(K.sideways <= 0, 'desk: no sideways scroll', K.sideways);
  await dp.screenshot({ path: SHOTS + 'jobpacket_desk.png' });
  await dp.locator('#_gcPacket [data-a="print"]').click();
  await waitFor(S, () => { const v = document.getElementById('gc-viewer'), fr = v && v.querySelector('iframe'); return !!(fr && fr.contentDocument && /Scan back/.test(fr.contentDocument.body.innerText)); }, null, 8000);
  await sleep(1000);
  const sdl = dp.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await dp.locator('#gc-viewer [data-gv="dl"]').click();
  const sd = await sdl;
  ok(!!sd && /^GrayCo_Job_Packet_.*\.html$/.test(sd.suggestedFilename()), 'desk: 🖨 Print opens the viewer; its ⬇️ Download saves the packet as a file', sd && sd.suggestedFilename());
  await dp.locator('#gc-viewer [data-gv="back"]').click(); await sleep(300);
  ok(await S.ev(() => !document.getElementById('gc-viewer') && !!document.getElementById('_gcPacket')), 'desk: the viewer\'s ‹ Back returns to the packet');
  await dp.locator('#_gcPacket .gcjp-back').click(); await sleep(200);
  ok(await S.ev(() => !document.getElementById('_gcPacket')), 'desk: ‹ Back closes the packet');
  ok((await S.ev(() => window.__jpOpen)) === 0 && S.pages.length <= 1, 'desk: no window.open, no new tab');
  ok(S.errs.length === 0, 'no page errors on the desk', S.errs.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ FAIL exception ' + (e && e.stack || e)); }
await close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
