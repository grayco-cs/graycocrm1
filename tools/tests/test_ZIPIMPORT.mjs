// test_ZIPIMPORT.mjs <build-dir> — patch ZIPIMPORT (owner 11/25): 💎 → "📦 Import ZIP of job files".
//   · the 💎 item is near the top (right after 🏗 Project Hubs) for an admin and a PM, opens the sheet (no pop-ups);
//   · a ZIP with a folder per address / PO: automatic placement (address, PO, Head Start client + address, PDF text),
//     "needs a job" for a folder with no clue and for a folder that matches several jobs;
//   · the folder pulldown changes a whole folder; ☑ portal ON by default, OFF (with why) for a sub invoice / W-9;
//   · Import: files go to the file store (sb:crm-files refs), the job's projectDocs (portalShare / portalLive), no base64 in gc_kv;
//     the log in gc_kv gc_zip_import; the needs-a-job files are ONE ✅ Approvals card for the office + admins → 📥 Place;
//   · a re-import skips what is already there; "pick a job" mode puts every file on that job; phone width; no page errors.
// Usage: node test_ZIPIMPORT.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs, GC_JSZIP = jszip 3.10.1 dist/jszip.min.js)
// Made-up data only; nothing leaves the machine.
import { pathToFileURL } from 'url';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const JSZIP_FILE = process.env.GC_JSZIP || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/jsz/package/dist/jszip.min.js';
const H = await import(pathToFileURL(HARNESS).href);
const JSZip = require(JSZIP_FILE);
const build = process.argv[2];
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const sleep = H.sleep;
const acct = name => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].name === name);
const NICK = acct('Nick Gray'), OFFICE = acct('Office Demo'), PM = acct('Demo PM');
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
H.resetCloud();
H.cset('users', [
  { id: 'u1', name: 'Nick Gray', email: NICK, role: 'Admin', payType: 'owner', active: true },
  { id: 'u2', name: 'Office Demo', email: OFFICE, role: 'Office', active: true },
  { id: 'u3', name: 'Demo PM', email: PM, role: 'Project Manager', active: true }]);
const P = (id, name, client, address, po, extra) => Object.assign({ id, name, client, address, po, pm: 'Demo PM', status: 'Active', updatedAt: ago(1) }, extra || {});
H.cset('projects', [
  P('P1', 'Kitchen - Maple', 'Sample Homeowner A', '123 Demo St, Memphis, TN', 'H138'),
  P('P2', 'Roof - Sample', 'Sample Homeowner B', '202 Demo Ave, Memphis, TN', '', { autoPO: 'K791' }),
  P('P3', 'Office TI - Sample', 'Sample Biz', '789 Walnut Dr, Memphis, TN', 'PO-3003'),
  P('HS1', 'Head Start - Center 1', 'Head Start', '456 Oak Ave, Memphis, TN', 'H201'),
  P('HS2', 'Head Start - Center 2', 'Head Start', '12 Elm Rd, Memphis, TN', 'H202'),
  P('HS3', 'Head Start - Center 3', 'Head Start', '88 Pine Rd, Memphis, TN', 'H203'),
  P('HS4', 'Head Start - Center 4', 'Head Start', '9 Cedar Ln, Memphis, TN', 'H204'),
  P('HS5', 'Head Start - Center 5', 'Head Start', '77 Birch Blvd, Memphis, TN', 'H205')]);
H.cset('projectDocs', []); H.cset('schedule', []); H.cset('leads', []);

/* a small PDF; text inside (an uncompressed content stream, the way window._gcPdfText reads it) */
function pdf(text){
  const st = 'BT /F1 12 Tf 72 720 Td (' + text + ') Tj ET';
  return Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj\n4 0 obj<</Length ' + st.length + '>>\nstream\n' + st + '\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF\n', 'latin1');
}
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const z = new JSZip();
z.file('123 Demo St/contract.pdf', pdf('Construction contract between GrayCo and the owner'));
z.file('123 Demo St/Sub invoice - Sample Drywall.pdf', pdf('Invoice 2231 drywall labor 4,200.00'));
z.file('PO K791/permit.pdf', pdf('Building permit'));
z.file('misc/random.pdf', pdf('Nothing in here names a job'));
z.file('Head Start - 456 Oak Ave/plans.pdf', pdf('Floor plan sheet A1'));
z.file('Head Start - 456 Oak Ave/site photo.png', PNG);
z.file('Head Start/W-9 Sample Drywall.pdf', pdf('Request for Taxpayer Identification Number'));
z.file('scans/scan001.pdf', pdf('Walkthrough notes for 789 Walnut Dr suite 4'));
z.file('__MACOSX/scans/._scan001.pdf', Buffer.from('junk'));
const ZIPBUF = await z.generateAsync({ type: 'nodebuffer' });
const z2 = new JSZip();
z2.file('PO K791/permit.pdf', pdf('Building permit'));
z2.file('extra/schedule notes.pdf', pdf('Two week look ahead'));
const ZIP2 = await z2.generateAsync({ type: 'nodebuffer' });

const OPEN = [];
async function computer(email, who, mobile){
  const c = await H.computer(who, { build, mobile: !!mobile }); OPEN.push(c);
  c.page().on('console', m => { const t = m.text(); if (/zip import/i.test(t)) console.log('    [' + who + ' console] ' + t.slice(0, 200)); });
  const ACAO = { 'access-control-allow-origin': '*' };
  await c.ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/jszip\/3\.10\.1\/jszip\.min\.js/, r => r.fulfill({ path: JSZIP_FILE, contentType: 'application/javascript', headers: ACAO }));
  await H.signIn(c, email, 9000);
  await H.waitFor(c, () => (window._crm && window._crm.projects || []).length >= 8 && !!window._gcZipImport, null, 45000);
  await sleep(1500);
  return c;
}
const st = c => c.ev(() => window._gcZipImport.state());
const byName = (S, n) => S.rows.find(r => r.name === n) || {};
async function loadZip(c, buf, name){
  await c.page().setInputFiles('#gczi-ov [data-zi-in="files"]', { name: name || 'jobs.zip', mimeType: 'application/zip', buffer: buf });
  return H.waitFor(c, () => { const s = window._gcZipImport.state(); return s && s.rows.length && !document.querySelector('#gczi-ov [data-zi="msg"]').textContent ? s : null; }, null, 20000);
}
async function importNow(c){
  await c.ev(() => document.querySelector('#gczi-ov [data-zi="go"]').click());
  return H.waitFor(c, () => window._gcZipImport.state().done ? document.querySelector('#gczi-ov .sum').innerText : null, null, 60000);
}
const docs = c => c.ev(async () => (await window.idbGet('projectDocs')) || []);

try {
  /* ── admin, desktop ── */
  const a = await computer(NICK, 'nick');
  const hub = await a.ev(() => { if (!document.querySelector('.gc-hub-panel') && window._gcToggleHub) window._gcToggleHub(); return new Promise(r => setTimeout(() => {
    const p = [...document.querySelectorAll('.gc-hub-panel')].filter(x => x.getClientRects().length).pop(); if (!p) return r(null);
    const items = [...p.querySelectorAll('.gc-hub-item')]; const it = p.querySelector('#gc-zipimp-hub');
    r({ idx: items.indexOf(it), n: items.length, prev: it && it.previousElementSibling && it.previousElementSibling.id, text: it && it.textContent.trim() }); }, 600)); });
  console.log('    💎 item: ' + JSON.stringify(hub));
  ok(hub && hub.idx >= 0 && hub.idx <= 4 && hub.n > 8, 'admin: 💎 "📦 Import ZIP of job files" is near the top of the menu', hub);
  ok(hub && hub.prev === 'gc-hub-projhub-link', 'right after 🏗 Project Hubs', hub);
  await a.ev(() => document.querySelector('#gc-zipimp-hub').click());
  const opened = await H.waitFor(a, () => { const o = document.getElementById('gczi-ov'); return o && o.getClientRects().length ? getComputedStyle(o.querySelector('.gczi')).backgroundColor : null; }, null, 8000);
  ok(opened === 'rgb(255, 255, 255)', 'the sheet opens, light (white) panel', opened);
  const modeOpts = await a.ev(() => [...document.querySelectorAll('#gczi-ov [data-zi="mode"] option')].map(o => o.textContent));
  ok(/automatic/.test(modeOpts[0]) && modeOpts.length === 9 + modeOpts.filter(t => /^👤/.test(t)).length && modeOpts.some(t => /Head Start - Center 1 — 456 Oak Ave.* — H201/.test(t)) && modeOpts.some(t => /K791/.test(t)) && (modeOpts.length === 9 || modeOpts[9] === '👤 Head Start — all their jobs (customer portal only)'), 'job pulldown: automatic first, then every job (name — address — PO), then the customer with several jobs (patch CUSTDOCS)', modeOpts);

  const S = await loadZip(a, ZIPBUF);
  ok(S && S.rows.length === 8, '8 files read from the ZIP (the __MACOSX junk is left out)', S && S.rows.map(r => r.path));
  const pl = n => byName(S, n).pid;
  ok(pl('contract.pdf') === 'P1', '“123 Demo St/contract.pdf” → the 123 Demo St job (address)', byName(S, 'contract.pdf').auto);
  ok(pl('permit.pdf') === 'P2', '“PO K791/permit.pdf” → the K791 job (PO)', byName(S, 'permit.pdf').auto);
  ok(pl('plans.pdf') === 'HS1' && pl('site photo.png') === 'HS1', '“Head Start - 456 Oak Ave/…” → Head Start Center 1 (one of 5 Head Start jobs, by address)', byName(S, 'plans.pdf').auto);
  ok(pl('random.pdf') === '', '“misc/random.pdf” → needs a job', byName(S, 'random.pdf').auto);
  ok(pl('W-9 Sample Drywall.pdf') === '' && byName(S, 'W-9 Sample Drywall.pdf').auto.amb, '“Head Start/W-9…” (5 Head Start jobs) → needs a job (several match)', byName(S, 'W-9 Sample Drywall.pdf').auto);
  ok(pl('scan001.pdf') === 'P3' && /text inside the PDF/.test(byName(S, 'scan001.pdf').auto.how), '“scans/scan001.pdf” → 789 Walnut Dr job from the text inside the PDF', byName(S, 'scan001.pdf').auto);
  const cat = n => byName(S, n).cat;
  ok(cat('contract.pdf') === 'Contracts' && cat('permit.pdf') === 'Permits' && cat('plans.pdf') === 'Plans/Drawings', 'category guesses: Contracts / Permits / Plans/Drawings', S.rows.map(r => r.name + ':' + r.cat));
  const sub = byName(S, 'Sub invoice - Sample Drywall.pdf'), w9 = byName(S, 'W-9 Sample Drywall.pdf');
  ok(byName(S, 'contract.pdf').portal === true && byName(S, 'plans.pdf').portal === true && byName(S, 'random.pdf').portal === true, '☑ customer portal ON by default', S.rows.map(r => r.name + ':' + r.portal));
  ok(sub.portal === false && /sub/.test(sub.portalWhy) && w9.portal === false && /W-9/.test(w9.portalWhy), 'a sub invoice and a W-9 default OFF, with the reason', { sub, w9 });
  const why = await a.ev(() => document.querySelector('#gczi-ov').innerText.match(/Off: looks like[^\n]*/g));
  ok(why && why.length >= 2, 'the reason is on screen', why);

  /* folder pulldown: the whole "123 Demo St" folder → P3, then back */
  const fsel = await a.ev(() => { const g = [...document.querySelectorAll('#gczi-ov .grp')].find(x => /123 Demo St/.test(x.querySelector('.gh b').textContent)); return g ? g.querySelector('[data-zi-fold]').getAttribute('data-zi-fold') : null; });
  await a.page().selectOption('#gczi-ov [data-zi-fold="' + fsel + '"]', 'P3'); await sleep(300);
  let S2 = await st(a);
  ok(byName(S2, 'contract.pdf').pid === 'P3' && byName(S2, 'Sub invoice - Sample Drywall.pdf').pid === 'P3', 'folder pulldown: both files of “123 Demo St” move to the job picked', S2.rows.map(r => r.name + ':' + r.pid));
  await a.page().selectOption('#gczi-ov [data-zi-fold="' + fsel + '"]', 'P1'); await sleep(300);
  /* per-file pulldown + category */
  const cbad = await a.ev(() => { const r = [...document.querySelectorAll('#gczi-ov [data-zi-row]')].find(x => /site photo/.test(x.textContent)); return r && r.getAttribute('data-zi-row'); });
  await a.page().selectOption('#gczi-ov [data-zi-cat="' + cbad + '"]', 'Other');
  S2 = await st(a);
  ok(byName(S2, 'contract.pdf').pid === 'P1', 'folder pulldown back to the 123 Demo St job');

  const errs0 = a.errs.length, dlg0 = a.dialogs.length;
  const sum = await importNow(a);
  console.log('    ' + String(sum).replace(/\n/g, ' | '));
  ok(/6 files put on 4 jobs/.test(sum) && /2 files need a job/.test(sum), 'Import: 6 files on 4 jobs, 2 sent to the office', sum);
  const D1 = await docs(a);
  const zd = D1.filter(d => d.source === 'zip-import');
  ok(zd.length === 6 && zd.every(d => /^sb:crm-files\/[0-9a-f]{64}\.[a-z0-9]+$/.test(d.ref) && !d.data), '6 job documents, each a file-store reference (sb:crm-files/…), no base64', zd.map(d => [d.name, d.pid, String(d.ref).slice(0, 24), !!d.data]));
  const dn = n => zd.find(d => d.name === n) || {};
  ok(dn('contract.pdf').pid === 'P1' && dn('contract.pdf').portalShare === true && dn('contract.pdf').portalLive === true && dn('contract.pdf').cat === 'Contracts', 'contract.pdf on P1: portalShare + portalLive (customer portal), Contracts', dn('contract.pdf'));
  ok(dn('Sub invoice - Sample Drywall.pdf').portalShare === false && dn('Sub invoice - Sample Drywall.pdf').internal === true && !dn('Sub invoice - Sample Drywall.pdf').portalLive, 'the sub invoice: portalShare false (never in the portal)', dn('Sub invoice - Sample Drywall.pdf'));
  ok(dn('scan001.pdf').pid === 'P3' && dn('permit.pdf').pid === 'P2' && dn('plans.pdf').pid === 'HS1', 'each on its job', zd.map(d => d.name + '→' + d.pid));
  await sleep(4000);
  const LOG = H.cget('gc_zip_import');
  ok(Array.isArray(LOG) && LOG.length === 1 && LOG[0].by === 'Nick Gray' && LOG[0].files.length === 8 && LOG[0].counts.placed === 6 && LOG[0].counts.waiting === 2, 'the import log in gc_kv gc_zip_import (who, each file, counts)', LOG && LOG[0] && Object.assign({}, LOG[0], { files: LOG[0].files.length }));
  const waitCloud = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 30000)) { try { if (fn()) return true; } catch (e) {} await sleep(400); } return false; };
  await waitCloud(() => (H.cget('projectDocs') || []).filter(d => d.source === 'zip-import').length === 6, 40000);
  const cloudDocs = H.cget('projectDocs') || [];
  ok(cloudDocs.filter(d => d.source === 'zip-import').length === 6, 'the job documents reached the cloud list (projectDocs)', { n: cloudDocs.length, w: H.writes.filter(w => w.key === 'projectDocs').length, keys: [...new Set(H.writes.map(w => w.key))] });
  const big = [...H.cloud.values()].filter(r => /base64,|data:application\/pdf|data:image\//.test(JSON.stringify(r.value))).map(r => r.key);
  ok(!big.length, 'no base64 / data: URLs in any gc_kv row', big);
  ok(a.errs.length === errs0 && a.dialogs.length === dlg0, 'no page errors, no alert / confirm', { e: a.errs.slice(errs0), d: a.dialogs.slice(dlg0) });

  /* ── the office, on a phone: the ONE approval card, place the W-9 ── */
  const o = await computer(OFFICE, 'office', true);
  const card = await H.waitFor(o, () => { try { window._gcApprovalSetFresh && window._gcApprovalSetFresh(); const s = window._gcApprovalCurrent(); const x = s.groups.other.filter(y => /^zipimp_/.test(y.id)); return x.length ? x.map(y => ({ id: y.id, title: y.title, sub: y.sub })) : null; } catch (e) { return null; } }, null, 30000);
  ok(card && card.length === 1 && /2 files from a ZIP need a job/.test(card[0].title), 'office: ONE ✅ Approvals card for the import', card);
  const apx = await o.ev(() => { const r = []; (window._gcApxExtra || []).forEach(f => { try { r.push(...f({ kind: 'office' }, Date.now())); } catch (e) {} }); return r.filter(x => x.src === 'zipimp').map(x => x.title); });
  ok(apx.length === 1, 'office: the desk ✅ Approvals tab row too', apx);
  await o.ev(() => { const s = window._gcApprovalCurrent(); s.groups.other.find(y => /^zipimp_/.test(y.id)).act.f(); });
  const prow = await H.waitFor(o, () => [...document.querySelectorAll('#gczi-place [data-zp]')].map(r => r.getAttribute('data-zp') + '|' + r.querySelector('.fn').textContent), null, 8000);
  ok(prow && prow.length === 2, 'the card opens the list of files with a job pulldown each', prow);
  const w9id = (prow.find(x => /W-9/.test(x)) || '').split('|')[0];
  await o.page().selectOption('#gczi-place [data-zp-job="' + w9id + '"]', 'HS3');
  await o.ev(id => document.querySelector('#gczi-place [data-zp-go="' + id + '"]').click(), w9id);
  await H.waitFor(o, () => document.querySelectorAll('#gczi-place [data-zp]').length === 1, null, 8000);
  const oD = await docs(o); const w9d = oD.find(d => d.name === 'W-9 Sample Drywall.pdf');
  await waitCloud(() => ((H.cget('gc_zip_import') || [])[0] || { files: [] }).files.some(f => /W-9/.test(f.name) && f.pid === 'HS3'), 15000);
  ok(((H.cget('gc_zip_import') || [])[0] || { files: [] }).files.some(f => /W-9/.test(f.name) && f.pid === 'HS3'), 'the office\'s placement reached the cloud log');
  ok(w9d && w9d.pid === 'HS3' && w9d.portalShare === false && /^sb:crm-files\//.test(w9d.ref), 'office placed the W-9 on Head Start Center 3 — staff only (its preview choice)', w9d);
  ok(await waitCloud(() => (H.cget('projectDocs') || []).some(d => d.name === 'W-9 Sample Drywall.pdf' && d.pid === 'HS3' && d.portalShare === false), 40000), 'the phone\'s placement reached the cloud job documents (projectDocs)');
  const pw = await o.ev(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth, pw: document.querySelector('#gczi-place .gczi').getBoundingClientRect().width }));
  ok(pw.sw <= pw.iw + 1 && pw.pw <= pw.iw, 'phone: the place sheet fits (no sideways scroll)', pw);
  /* the office's own import sheet on the phone, with a ZIP loaded */
  await o.ev(() => { document.getElementById('gczi-place').remove(); window._gcZipImport.open(); });
  await loadZip(o, ZIPBUF);
  const pw2 = await o.ev(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth, ov: document.getElementById('gczi-ov').scrollWidth, ovw: document.getElementById('gczi-ov').clientWidth }));
  ok(pw2.sw <= pw2.iw + 1 && pw2.ov <= pw2.ovw + 1, 'phone: the import preview fits (no sideways scroll)', pw2);
  ok(o.errs.length === 0, 'office: no page errors', o.errs.slice(0, 3));
  await sleep(3500);

  /* ── admin: place the last one from the card, then the card is gone ── */
  await a.ev(() => document.getElementById('gczi-ov').remove());
  await a.ev(() => window._gcZipImport.refresh());
  const left = await a.ev(() => window._gcZipImport.items().map(i => i.id));
  ok(left.length === 1, 'admin: the card is still there for the one file left', left);
  await a.ev(() => window._gcZipImport.openPlace(window._gcZipImport.items()[0].b.id));
  const rid = await H.waitFor(a, () => { const r = document.querySelector('#gczi-place [data-zp]'); return r ? r.getAttribute('data-zp') : null; }, null, 8000);
  await a.page().selectOption('#gczi-place [data-zp-job="' + rid + '"]', 'P1');
  await a.ev(id => document.querySelector('#gczi-place [data-zp-go="' + id + '"]').click(), rid);
  await H.waitFor(a, () => !document.querySelector('#gczi-place [data-zp]'), null, 8000);
  const rd = (await docs(a)).find(d => d.name === 'random.pdf');
  ok(rd && rd.pid === 'P1' && rd.portalShare === true && rd.portalLive === true, 'admin placed random.pdf on P1 — in the customer portal (its preview choice)', rd);
  await sleep(500);
  const gone = await a.ev(() => { window._gcApprovalSetFresh && window._gcApprovalSetFresh(); return window._gcApprovalCurrent().groups.other.filter(y => /^zipimp_/.test(y.id)).length; });
  ok(gone === 0, 'every file placed → the card is gone', { gone, c: await a.ev(() => window._gcZipImport.list().map(b => b.files.map(f => [f.name, f.pid, !!f.ref, f.queued, f.updatedAt]))) });

  /* ── re-import the same ZIP: everything is skipped ── */
  await a.ev(() => { document.getElementById('gczi-place').remove(); window._gcZipImport.open(); });
  await loadZip(a, ZIPBUF);
  await sleep(800);
  const dupTags = await a.ev(() => document.querySelectorAll('#gczi-ov .tag.dup').length);
  ok(dupTags === 6, 'preview: the 6 files already on their jobs say “already on this job — skipped”', dupTags);
  const n0 = (await docs(a)).length;
  const sum2 = await importNow(a);
  const n1 = (await docs(a)).length;
  ok(n1 === n0 && /0 files put on 0 jobs/.test(sum2) && /8 already imported/.test(sum2) && !/need a job/.test(sum2), 're-import: nothing added, 8 skipped (the 2 earlier needs-a-job files too)', { n0, n1, sum2 });

  /* ── pick-a-job mode: every file on that job (the one already there is skipped) ── */
  await a.ev(() => window._gcZipImport.open());
  await a.page().selectOption('#gczi-ov [data-zi="mode"]', 'P2');
  const S3 = await loadZip(a, ZIP2, 'second.zip');
  ok(S3.rows.length === 2 && S3.rows.every(r => r.pid === 'P2'), '“pick a job” mode: every file goes to that job', S3.rows.map(r => r.name + ':' + r.pid));
  const sum3 = await importNow(a);
  const D3 = await docs(a);
  ok(/1 file put on 1 job/.test(sum3) && /1 already imported/.test(sum3) && D3.some(d => d.name === 'schedule notes.pdf' && d.pid === 'P2'), 'imported: schedule notes on P2, the permit skipped', sum3);
  await sleep(3500);
  const LOG2 = H.cget('gc_zip_import') || [];
  ok(LOG2.length === 3 && LOG2.every(b => b.by && b.at && Array.isArray(b.files)), 'the log keeps every import (3)', LOG2.map(b => [b.by, b.mode, b.counts]));
  const big2 = [...H.cloud.values()].filter(r => /base64,|data:application\/pdf|data:image\//.test(JSON.stringify(r.value))).map(r => r.key);
  ok(!big2.length, 'still no base64 in gc_kv', big2);
  ok(a.errs.length === 0, 'admin: no page errors', a.errs.slice(0, 3));
  ok(a.dialogs.length === 0 && o.dialogs.length === 0, 'no alert / confirm / prompt anywhere', a.dialogs.concat(o.dialogs));

  /* ── a PM: the item is there too ── */
  const p = await computer(PM, 'pm');
  const pmHub = await p.ev(() => { if (!document.querySelector('.gc-hub-panel') && window._gcToggleHub) window._gcToggleHub(); return new Promise(r => setTimeout(() => r(!!document.querySelector('.gc-hub-panel #gc-zipimp-hub')), 600)); });
  ok(pmHub, 'PM: the 💎 item is there');
  const pmCard = await p.ev(() => window._gcZipImport.items().length);
  ok(pmCard === 0, 'PM: no office approval card');
} catch (e) { fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e)); }
for (const x of OPEN) await x.close().catch(() => {});
console.log(`ZIPIMPORT ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
