// patch COMPANYDOCS tests:  node tools/tests/test_COMPANYDOCS.mjs <build dir> [--out <dir>]
//   Part A (node): the server rules in netlify/functions/_lib/gcp.js — who sees what, slots, GC sharing, the 30-day reminder
//                  (To-Do for admins + office, e-mail to admins + office).
//   Part B (browser, the offline two-device harness — GC_HARNESS, default the session scratchpad wN/harness_N.mjs): the
//                  library for an admin, a PM and the office, with the gc-portal docs-* actions answered by the same rules.
//   --out <dir>: also writes the Safety Program and the toolbox talks as PDFs rendered by the CRM (Chromium print).
import { createRequire } from 'module';
import path from 'path'; import fs from 'fs';
const require = createRequire(import.meta.url);
const build = path.resolve(process.argv[2] || '.');
const outDir = process.argv.indexOf('--out') > 0 ? process.argv[process.argv.indexOf('--out') + 1] : '';
const FN = path.join(build, 'netlify/functions');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m); } };

/* ── Part A: server rules ─────────────────────────────────────────────────── */
const kv = {}, tasks = [], mails = [];
const fakeLib = { kvGet: async k => kv[k], kvCas: async (k, fn) => { const nv = fn(kv[k] === undefined ? undefined : JSON.parse(JSON.stringify(kv[k]))); if (nv !== undefined) kv[k] = nv; return { value: kv[k] }; }, alertsApi: () => ({ recipients: async () => [] }), sb: async () => ({ ok: false }) };
const fakeCore = { kvListUpdate: async (key, fn) => { const r = fn(tasks.slice()); if (r && r.list) { tasks.length = 0; r.list.forEach(x => tasks.push(x)); } return { ok: true }; }, signRefs: async refs => Object.fromEntries(refs.map(r => [r, 'https://signed.example/' + r])) };
require.cache[require.resolve(path.join(FN, 'bid-inbox.js'))] = { id: 'bi', filename: 'bi', loaded: true, exports: { _lib: fakeLib } };
require.cache[require.resolve(path.join(FN, 'portal.js'))] = { id: 'po', filename: 'po', loaded: true, exports: { _core: fakeCore } };
process.env.RESEND_API_KEY = 'test';
global.fetch = async (u, init) => { if (/resend/.test(String(u))) { mails.push(JSON.parse(init.body)); return { ok: true, status: 200 }; } return { ok: false, status: 404, json: async () => [] }; };
const G = require(path.join(FN, '_lib/gcp.js'));
console.log('A. server rules');
{
  const ref = 'sb:crm-files/' + 'a'.repeat(64) + '.pdf';
  const who = { email: 'office@grayco-cs.com' };
  const data = { users: [{ name: 'Owner', email: 'owner@grayco-cs.com', role: 'Admin', payType: 'owner' }, { name: 'Office', email: 'office@grayco-cs.com', role: 'Office' }, { name: 'Pat PM', email: 'pm@grayco-cs.com', role: 'Project Manager' }], projects: [] };
  const in20 = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10), in200 = new Date(Date.now() + 200 * 864e5).toISOString().slice(0, 10);
  const w9 = (await G.docAdd(data, { kind: 'w9', folder: 'tax', slot: 'w9', title: 'W-9', ref, name: 'w9.pdf', type: 'application/pdf' }, who)).out;
  const coi = (await G.docAdd(data, { kind: 'coi', folder: 'insurance', slot: 'coi', title: 'COI', ref, name: 'coi.pdf', expires: in20, sendToGcs: false }, who)).out;
  const lic = (await G.docAdd(data, { kind: 'license', folder: 'licenses', slot: 'lic_tn', title: 'TN license', ref, name: 'tn.pdf', expires: in200 }, who)).out;
  const lic2 = (await G.docAdd(data, { kind: 'license', folder: 'licenses', slot: 'lic_ar', title: 'AR license', ref, name: 'ar.pdf', expires: in200 }, who)).out;
  const sp = (await G.docAdd(data, { kind: 'safety', folder: 'safety', slot: 'gen:safety_program', gen: 'safety_program', genRev: 'r1', title: 'Safety Program', ref, name: 'sp.pdf', shareGc: true }, who)).out;
  const o300 = (await G.docAdd(data, { kind: 'safety', folder: 'safety', slot: 'osha300', title: 'OSHA 300', ref, name: 'o.pdf', access: 'office', shareGc: false }, who)).out;
  ok(w9.ok && coi.ok && lic.ok && sp.ok && o300.ok, 'docs-add stores COI, W-9, two licenses, the safety program PDF and the OSHA 300 log');
  const all = await G.companyDocs(true);
  ok(all.filter(d => d.kind === 'license' && G.docLive(d)).length === 2, 'two licenses in different slots both stay current');
  const coi2 = (await G.docAdd(data, { kind: 'coi', folder: 'insurance', slot: 'coi', title: 'COI renewed', ref, name: 'coi2.pdf', expires: in200, sendToGcs: false }, who)).out;
  ok(coi2.replaced.length === 1 && coi2.replaced[0] === coi.doc.id, 'a new COI replaces the old one in its slot');
  const staff = G.docsForStaff(await G.companyDocs(false), 'staff').map(d => d.title), office = G.docsForStaff(await G.companyDocs(true), 'office').map(d => d.title);
  ok(!staff.includes('W-9') && !staff.includes('OSHA 300') && staff.includes('COI renewed') && staff.includes('Safety Program'), 'staff list: no W-9 (tax ID) and no OSHA 300 log; the COI and the safety program are there (' + staff.join(', ') + ')');
  ok(office.includes('W-9') && office.includes('OSHA 300'), 'office list has the W-9 and the OSHA 300 log');
  ok(G.docAccess({ kind: 'w9' }) === 'office' && G.docAccess({ kind: 'coi' }) === 'all', 'default access: W-9 admin + office, everything else everyone');
  const gc = G.docsForGc(await G.companyDocs()).map(d => d.title);
  ok(gc.includes('COI renewed') && gc.includes('W-9') && gc.includes('TN license') && gc.includes('Safety Program') && !gc.includes('OSHA 300') && !gc.includes('COI'), 'GC view: current COI, W-9, licenses, safety program — not the OSHA log, not the replaced COI (' + gc.join(', ') + ')');
  await G.docFlags({ id: w9.doc.id, access: 'all', shareGc: false }, who);
  const staff2 = G.docsForStaff(await G.companyDocs(false), 'staff').map(d => d.title), gc2 = G.docsForGc(await G.companyDocs()).map(d => d.title);
  ok(staff2.includes('W-9') && !gc2.includes('W-9'), 'docs-flags: the owner can open the W-9 to the staff and take it off the GC page');
  ok(G.docShared({ kind: 'safety' }) && !G.docShared({ kind: 'hr' }) && G.docShared({ kind: 'coi', shareGc: false }) === false, 'GC sharing defaults: COI / W-9 / licenses / safety on, HR / legal off, a choice wins');
  const c1 = (await G.libCfgSet({ gen: { safety_program: { access: 'all', shareGc: true }, 'bad key!': { access: 'x' } }, safety: { fields: { coordinator: 'Safety Lead', '<x>': 'no' }, adopted: false } }, who)).out.cfg;
  ok(c1.gen.safety_program.shareGc === true && !c1.gen['bad key!'] && c1.safety.fields.coordinator === 'Safety Lead' && !('<x>' in c1.safety.fields), 'docs-cfg keeps the library settings, cleaned');
  /* the reminder: the COI that runs out in 20 days (the old one is replaced; re-add one expiring) */
  await G.docAdd(data, { kind: 'license', folder: 'licenses', slot: 'lic_ms', title: 'MS license', ref, name: 'ms.pdf', expires: in20 }, who);
  const r = await G.complianceRun(data);
  const t = tasks.find(x => /^GCP_DOCS_/.test(x.id));
  ok(r.reminded >= 1 && !!t && /MS license/.test(t.label), 'daily run: a document running out in 20 days puts a 📄 Renew To-Do on the office To-Do list (' + (t && t.label) + ')');
  const m = mails[mails.length - 1];
  ok(!!m && m.to.includes('office@grayco-cs.com') && m.to.includes('owner@grayco-cs.com'), 'daily run: the reminder e-mail goes to the admins AND the office (' + (m && m.to.join(', ')) + ')');
  const r2 = await G.complianceRun(data);
  ok(r2.reminded === 0, 'the same 30-day reminder is not repeated the next day');
}

/* ── Part B: the browser ──────────────────────────────────────────────────── */
const H = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const { computer, sleep, SP, seedCloudFromBackup, waitFor, resetCloud, ACCOUNTS } = await import(H);
resetCloud(); seedCloudFromBackup(SP + '/GrayCo_CLEAN_DATA_2026-10-16.json');
/* the gc-portal docs-* actions, answered by the same rules (one company list for every "computer") */
const SRV = { list: [], cfg: {}, n: 0 };
const LVL = { 'u-w': 'admin', 'u-o': 'office', 'u-s': 'staff' };
async function mockPortal(c){
  await c.ctx.route('**/.netlify/functions/gc-portal', async r => {
    const req = r.request(); const tok = (req.headers()['authorization'] || '').replace(/^Bearer /, ''); const m = /^utok-(u-[a-z])/.exec(tok); const lvl = m ? LVL[m[1]] : '';
    const J = (st, b) => r.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(b) });
    if (!lvl) return J(401, { ok: false, error: 'Sign in' });
    let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch (e) {}
    const who = { email: m[1] };
    if (b.action === 'docs-list') return J(200, { ok: true, level: lvl, docs: G.docsForStaff(lvl === 'staff' ? SRV.list.filter(G.docLive) : SRV.list, lvl), kinds: G.DOC_KINDS, folders: G.DOC_FOLDERS, cfg: G.cfgClean(SRV.cfg) });
    if (b.action === 'docs-url') { const d = SRV.list.find(x => x.id === b.id); if (!d || !G.docVisible(d, lvl)) return J(404, { ok: false, error: 'No such document.' }); return J(200, { ok: true, url: 'https://app.local/w9/GrayCo-W-9-4ad8a7807c2d45df.pdf', name: d.name }); }
    if (/^docs-(add|flags|remove|cfg)$/.test(b.action) && lvl === 'staff') return J(403, { ok: false, error: 'Only an admin or the office can change the company documents.' });
    if (b.action === 'docs-add') {
      const kind = G.DOC_KINDS[b.kind] ? b.kind : 'other';
      const rec = { id: 'CDOC_' + (++SRV.n), kind, title: b.title || G.DOC_KINDS[kind], ref: b.ref, name: b.name, type: b.type, expires: (b.expires || '').slice(0, 10), at: new Date().toISOString(), by: who.email, current: true };
      if (G.DOC_FOLDERS[b.folder]) rec.folder = b.folder; if (b.slot) rec.slot = b.slot; if (b.access === 'all' || b.access === 'office') rec.access = b.access; if (typeof b.shareGc === 'boolean') rec.shareGc = b.shareGc; if (b.gen) { rec.gen = b.gen; rec.genRev = b.genRev; }
      const replaced = G.docApplyAdd(SRV.list, rec, b); SRV.lastAdd = b;
      return J(200, { ok: true, doc: G.docOut(rec), replaced, coiQueued: 0 });
    }
    if (b.action === 'docs-flags') { const d = SRV.list.find(x => x.id === b.id); if (!d) return J(404, { ok: false }); G.docApplyFlags(d, b); return J(200, { ok: true, doc: G.docStaffOut(d) }); }
    if (b.action === 'docs-remove') { const d = SRV.list.find(x => x.id === b.id); if (d) d.removed = true; return J(200, { ok: true }); }
    if (b.action === 'docs-cfg') { const c0 = G.cfgClean(SRV.cfg); Object.keys(b.gen || {}).forEach(k => { c0.gen[k] = Object.assign(c0.gen[k] || {}, b.gen[k]); }); if (b.safety) { Object.assign(c0.safety.fields, (b.safety.fields || {})); if (typeof b.safety.adopted === 'boolean') { c0.safety.adopted = b.safety.adopted; c0.safety.adoptedAt = b.safety.adopted ? new Date().toISOString() : ''; } } SRV.cfg = G.cfgClean(c0); return J(200, { ok: true, cfg: SRV.cfg }); }
    return J(200, { ok: true });
  });
}
async function session(name, email){
  const c = await computer(name, { build }); await mockPortal(c); const p = c.page();
  await p.goto('https://app.local/index.html'); await sleep(2500);
  if (await p.locator('#gc-auth-email').count()) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); }
  await waitFor(c, () => (window._crm && window._crm.projects || []).length > 20 && !!window._gcCompanyLib, null, 120000, 300); await sleep(6000);
  return c;
}
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
const in25 = new Date(Date.now() + 25 * 864e5).toISOString().slice(0, 10), in300 = new Date(Date.now() + 300 * 864e5).toISOString().slice(0, 10);

console.log('B1. admin');
{
  const c = await session('ADM', 'wjohnson@grayco-cs.com'); const p = c.page();
  await p.evaluate(() => window._gcCompanyLib.open('insurance')); await sleep(1500);
  const st0 = await p.evaluate(() => window._gcCompanyLib.state());
  ok(st0.level === 'admin', 'the server says this sign-in is an admin');
  ok(['coi', 'w9', 'lic_tn', 'lic_ar', 'lic_ms'].every(x => st0.missing.includes(x)), 'placeholders: COI, W-9 and all three licenses show as missing (' + st0.missing.join(', ') + ')');
  const folders = await p.$$eval('#gc-cl .fl button', b => b.map(x => x.textContent.replace(/\d+$/, '').trim()));
  ok(folders.length === 8 && /Insurance/.test(folders[0]) && /Company info/.test(folders[7]), 'eight folders: ' + folders.join(' · '));
  ok(await p.locator('#gc-cl [data-entry="coi"] .bd.missing').count() === 1, 'the COI row has a red "Missing" badge');
  /* upload the COI with its expiry date */
  await p.locator('#gc-cl [data-entry="coi"] [data-cl="form"]').click(); await sleep(300);
  await p.locator('#gc-cl [data-frm="coi"] [data-f="file"]').setInputFiles({ name: 'GrayCo COI.pdf', mimeType: 'application/pdf', buffer: pdf });
  await p.locator('#gc-cl [data-frm="coi"] [data-cl="save"]').click(); await sleep(800);
  ok(SRV.list.length === 0, 'without the expiry date the COI is not saved (the date is required)');
  await p.locator('#gc-cl [data-frm="coi"] [data-f="exp"]').fill(in25);
  await p.locator('#gc-cl [data-frm="coi"] [data-cl="save"]').click();
  const up = await waitFor(c, () => { const r = document.querySelector('#gc-cl [data-entry="coi"]'); return r && /Expires in 2[45] days/.test(r.textContent) ? r.textContent : null; }, null, 30000, 300);
  ok(!!up && SRV.list.some(d => d.slot === 'coi' && d.expires === in25), 'admin uploads the COI with its expiry: stored (slot coi, ' + in25 + ') and the row says "Expires in 25 days"');
  ok(SRV.lastAdd && /^sb:|^idb:|^[a-z]+:/.test(String(SRV.lastAdd.ref || '')), 'the file went through the CRM file storage (ref ' + String(SRV.lastAdd && SRV.lastAdd.ref).slice(0, 30) + '…)');
  /* the W-9: default admin + office only */
  await p.evaluate(() => window._gcCompanyLib.open('tax')); await sleep(800);
  await p.locator('#gc-cl [data-entry="w9"] [data-cl="form"]').click(); await sleep(300);
  ok(await p.locator('#gc-cl [data-frm="w9"] [data-f="access"]').inputValue() === 'office', 'the W-9 upload defaults to "Admin + office only"');
  await p.locator('#gc-cl [data-frm="w9"] [data-f="file"]').setInputFiles({ name: 'GrayCo W-9 signed.pdf', mimeType: 'application/pdf', buffer: pdf });
  await p.locator('#gc-cl [data-frm="w9"] [data-cl="save"]').click();
  await waitFor(c, () => /On file/.test((document.querySelector('#gc-cl [data-entry="w9"]') || {}).textContent || ''), null, 30000, 300);
  ok(SRV.list.some(d => d.slot === 'w9' && d.access === 'office' && d.shareGc === true), 'W-9 stored: admin + office only, shared with GCs');
  /* the TN license */
  await p.evaluate(() => window._gcCompanyLib.open('licenses')); await sleep(800);
  await p.locator('#gc-cl [data-entry="lic_tn"] [data-cl="form"]').click(); await sleep(300);
  await p.locator('#gc-cl [data-frm="lic_tn"] [data-f="file"]').setInputFiles({ name: 'TN license.pdf', mimeType: 'application/pdf', buffer: pdf });
  await p.locator('#gc-cl [data-frm="lic_tn"] [data-f="exp"]').fill(in300);
  await p.locator('#gc-cl [data-frm="lic_tn"] [data-cl="save"]').click();
  await waitFor(c, () => !!document.querySelector('#gc-cl [data-entry="lic_tn"] .bd.ok'), null, 30000, 300);
  const st1 = await p.evaluate(() => window._gcCompanyLib.state());
  ok(!st1.missing.includes('lic_tn') && st1.missing.includes('lic_ar') && st1.missing.includes('lic_ms'), 'TN license on file; AR and MS still flagged missing');
  /* the safety program */
  const sp = await p.evaluate(() => window._gcCompanyLib.render('safety_program').then(r => ({ len: r.page.length, body: r.body, page: r.page })));
  const secs = (sp.body.match(/<h3/g) || []).length;
  ok(secs >= 30 && /1\. Our commitment/.test(sp.body) && /29\. Yearly program review/.test(sp.body) && /Appendix A/.test(sp.body), 'the Safety Program renders: ' + secs + ' sections incl. commitment → yearly review, Appendices A–D');
  ok(/DRAFT — review with your attorney and insurance carrier before adoption/.test(sp.page) && /gc-draft-wm/.test(sp.page), 'it is marked DRAFT (banner + a DRAFT watermark on every printed page)');
  ok(/data-gc-logo="1"/.test(sp.page) && /\(901\) 585-0944/.test(sp.page), 'GrayCo logo letterhead and the office phone');
  const addr = await p.evaluate(() => window._gcCompanyAddress());
  ok(addr && sp.page.indexOf(addr) > 0 && !/\{company_address\}/.test(sp.page), 'the office address comes from the company-address setting (' + addr + ')');
  ok(/OWNER TO FILL: Safety Coordinator/.test(sp.body) && /OWNER TO FILL per job/.test(sp.body), '[OWNER TO FILL] blanks (Safety Coordinator, nearest hospital per job …)');
  for (const k of ['6 feet', 'GFCI', 'Safety Data Sheets', '1926.1153', 'Renovate Right', 'IICRC', 'within 24 hours', 'OSHA 300', 'toolbox talk', 'Employee Handbook', 'Subcontractor', 'Confined spaces', 'Heat illness', 'Excavation']) ok(sp.body.indexOf(k) >= 0, 'safety program covers: ' + k);
  /* fill a blank → it shows everywhere; adopted → no DRAFT */
  await p.evaluate(() => window._gcCompanyLib.open('safety')); await sleep(800);
  await p.locator('#gc-cl [data-entry="safety_program"] [data-cl="fill"]').click(); await sleep(300);
  await p.locator('#gc-cl [data-fill] [data-sf="coordinator"]').fill('Safety Lead (title)');
  await p.locator('#gc-cl [data-fill] [data-cl="fsave"]').click(); await sleep(1200);
  const sp2 = await p.evaluate(() => window._gcCompanyLib.render('safety_program').then(r => r.body));
  ok(/Safety Lead \(title\)/.test(sp2) && !/OWNER TO FILL: Safety Coordinator \(name/.test(sp2), 'a filled blank (Safety Coordinator) appears in the program');
  /* 12 toolbox talks */
  const tb = await p.evaluate(() => window._gcCompanyLib.render('toolbox_all').then(r => ({ n: (r.body.match(/Toolbox Talk \d+ —/g) || []).length, pb: (r.body.match(/gc-pb/g) || []).length })));
  ok(tb.n === 12 && tb.pb === 11, '12 toolbox talks, one per page (' + tb.n + ' talks, ' + tb.pb + ' page breaks)');
  /* put the safety program in the GC portal (PDF maker stubbed: no CDN offline) */
  await p.evaluate(() => { window.__GC_COMPANYDOCS_PDF__ = () => new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }); });
  const g0 = await p.evaluate(() => window._gcCompanyDocsForGC());
  ok(g0.some(x => x.gen === 'safety_program' && x.published === false) && g0.some(x => x.gen === 'toolbox_all'), '_gcCompanyDocsForGC(): the safety program and the toolbox-talk set are marked for GCs (not published yet)');
  ok(await p.locator('#gc-cl [data-entry="safety_program"]').filter({ hasText: 'Not in the GC portal yet' }).count() === 1, 'the row says "Not in the GC portal yet"');
  await p.locator('#gc-cl [data-entry="safety_program"] [data-cl="publish"]').click();
  await waitFor(c, () => /In the GC portal since/.test((document.querySelector('#gc-cl [data-entry="safety_program"]') || {}).textContent || ''), null, 30000, 300);
  const pubd = SRV.list.find(d => d.gen === 'safety_program');
  ok(!!pubd && pubd.shareGc === true && pubd.kind === 'safety' && pubd.slot === 'gen:safety_program', 'published: the safety program PDF is a company document shared with GCs');
  const gcv = G.docsForGc(SRV.list).map(d => d.title);
  ok(gcv.some(t => /Safety Program/.test(t)) && gcv.some(t => /certificate of insurance/i.test(t)) && gcv.some(t => /W-9/.test(t)) && gcv.some(t => /Tennessee/.test(t)), 'the GC page lists: ' + gcv.join(' · '));
  const g1 = await p.evaluate(() => window._gcCompanyDocsForGC());
  ok(g1.some(x => x.gen === 'safety_program' && x.published === true), '_gcCompanyDocsForGC(): the safety program is published');
  /* changing a blank marks the GC copy out of date */
  await p.evaluate(() => window._gcCompanyLib.open('safety')); await sleep(600);
  await p.locator('#gc-cl [data-entry="safety_program"] [data-cl="fill"]').click(); await sleep(300);
  await p.locator('#gc-cl [data-fill] [data-sf="clinic"]').fill('Clinic name, address, phone');
  await p.locator('#gc-cl [data-fill] [data-cl="fsave"]').click(); await sleep(1200);
  ok(await p.locator('#gc-cl [data-entry="safety_program"]').filter({ hasText: 'changed since then' }).count() === 1, 'after the program changes the row asks to update the GC copy');
  /* admin section */
  const adm = await p.evaluate(async () => { const b = document.createElement('div'); document.body.appendChild(b); await window._gcCompanyLib.renderAdmin(b); const t = b.textContent; b.remove(); return t; });
  ok(/Insurance/.test(adm) && /Company info/.test(adm), 'Admin → Company documents draws the same library');
  ok(c.errs.filter(e => /COMPANYDOCS|_gcCompanyLib|gc-cl/.test(e)).length === 0, 'no page errors from the library');
  if (outDir) {   /* the deliverable copies: blanks unfilled (the test values above are cleared first) */
    SRV.cfg = {}; await p.evaluate(() => window._gcCompanyLib.refresh()); await sleep(500);
    /* the files are kept for a while: print them with the address the company uses from the move on (Admin → Company address) */
    if (process.env.GC_ADDR_NEXT !== '0') await p.evaluate(() => { const a = window._gcCompanyAddress, c = a.config(); if (c.next) a.set({ current: c.next, switchOn: '' }); });
    fs.mkdirSync(outDir, { recursive: true });
    const pg = await c.ctx.newPage();
    for (const [id, file] of [['safety_program', 'GrayCo Construction Safety Program (DRAFT).pdf'], ['toolbox_all', 'GrayCo Toolbox Talks (12).pdf']]) {
      const h = await p.evaluate(async (x) => (await window._gcCompanyLib.render(x)).page, id);
      await pg.setContent(h, { waitUntil: 'load' }); await sleep(500);
      await pg.pdf({ path: path.join(outDir, file), format: 'Letter', printBackground: true, margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' }, displayHeaderFooter: true, headerTemplate: '<span></span>',
        footerTemplate: '<div style="width:100%;font:7.5px Arial,sans-serif;color:#b91c1c;text-align:center">' + (id === 'safety_program' ? 'DRAFT — review with your attorney and insurance carrier before adoption · ' : '') + '<span style="color:#666">page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>' });
      fs.writeFileSync(path.join(outDir, file.replace(/\.pdf$/, '.html')), h);
    }
    await pg.close();
  }
  await c.b.close();
}
/* reset the blanks for the PM / office views */
SRV.cfg = {};

console.log('B2. a PM');
{
  const c = await session('PM', 'sbiffle@grayco-cs.com'); const p = c.page();
  await p.evaluate(() => window._setView('docs')); await sleep(2500);
  const b = p.locator('[data-gc-companydocs="1"]');
  ok(await b.count() === 1, 'Docs tab: the "📁 Company documents" button is there for a PM');
  if (await b.count()) await b.first().click(); else await p.evaluate(() => window._gcCompanyLib.open());
  await waitFor(c, () => document.querySelector('#gc-cl') && window._gcCompanyLib.state().docs, null, 20000, 300);
  const st = await p.evaluate(() => window._gcCompanyLib.state());
  ok(st.level === 'staff', 'the server says this sign-in is staff');
  ok(await p.locator('#gc-cl .fl button').count() === 8, 'the PM sees all eight folders');
  ok(await p.locator('#gc-cl [data-entry="coi"] [data-cl="open-up"]').count() === 1 && await p.locator('#gc-cl [data-cl="form"]').count() === 0, 'PM can open the COI, has no Upload / Replace buttons');
  await p.evaluate(() => window._gcCompanyLib.open('tax')); await sleep(1000);
  ok(await p.locator('#gc-cl [data-entry="w9"]').count() === 0 && await p.locator('#gc-cl [data-entry="w9_blank"]').count() === 1, 'Tax folder: the signed W-9 (tax ID) is hidden from the PM; the blank W-9 for subs is there');
  ok(!st.docs.some(d => d.slot === 'w9'), 'the server did not even list the W-9 to the PM');
  const w9id = SRV.list.find(d => d.slot === 'w9').id;
  const den2 = await p.evaluate(id => window.__GC_AUTH__.fresh().then(x => fetch('/.netlify/functions/gc-portal', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + x.access_token }, body: JSON.stringify({ action: 'docs-url', id }) })).then(r => r.status), w9id);
  ok(den2 === 404, 'asking for the W-9 file by its id is refused for the PM (' + den2 + ')');
  const views = await p.evaluate(async () => { const L = window._gcCompanyLib; const out = {}; for (const id of ['safety_program', 'toolbox_all', 'gcb_handbook', 'gcb_contract', 'company_info']) { const r = await L.render(id); out[id] = r ? r.body.length : 0; } return out; });
  ok(views.safety_program > 20000 && views.toolbox_all > 5000 && views.gcb_handbook > 1000 && views.gcb_contract > 1000 && views.company_info > 200, 'PM can view the safety program, toolbox talks, Employee Handbook, contract template and company info (' + JSON.stringify(views) + ')');
  const legal = await p.evaluate(() => window._gcCompanyLib.entries().filter(e => e.folder === 'legal' && window._gcCompanyLib.visible(e.id)).length);
  ok(legal >= 25, 'Legal & contracts: ' + legal + ' contract / legal templates for the PM');
  const pmAdd = await p.evaluate(() => window.__GC_AUTH__.fresh().then(x => fetch('/.netlify/functions/gc-portal', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + x.access_token }, body: JSON.stringify({ action: 'docs-add', kind: 'coi' }) })).then(r => r.status));
  ok(pmAdd === 403, 'a PM cannot upload / replace company documents (' + pmAdd + ')');
  ok(c.errs.filter(e => /COMPANYDOCS|_gcCompanyLib|gc-cl/.test(e)).length === 0, 'no page errors from the library');
  await c.b.close();
}

console.log('B3. the office');
{
  const c = await session('OFF', 'office@grayco-cs.com'); const p = c.page();
  await p.evaluate(() => window._gcCompanyLib.open('tax')); await waitFor(c, () => window._gcCompanyLib.state().docs, null, 20000, 300); await sleep(500);
  const st = await p.evaluate(() => window._gcCompanyLib.state());
  ok(st.level === 'office', 'the server says this sign-in is the office');
  ok(await p.locator('#gc-cl [data-entry="w9"] [data-cl="open-up"]').count() === 1 && await p.locator('#gc-cl [data-entry="w9"] [data-cl="form"]').count() === 1, 'the office sees the W-9 and can replace it');
  /* the office opens the W-9 to everyone, per document */
  await p.locator('#gc-cl [data-entry="w9"] [data-cl="gear"]').click(); await sleep(300);
  await p.locator('#gc-cl [data-gear] [data-g="access"]').selectOption('all');
  await p.locator('#gc-cl [data-gear] [data-cl="gsave"]').click(); await sleep(1500);
  ok(SRV.list.find(d => d.slot === 'w9' && G.docLive(d)).access === 'all', 'office changes who sees the W-9 (per document)');
  ok(c.errs.filter(e => /COMPANYDOCS|_gcCompanyLib|gc-cl/.test(e)).length === 0, 'no page errors from the library');
  await c.b.close();
}
console.log('\nCOMPANYDOCS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
