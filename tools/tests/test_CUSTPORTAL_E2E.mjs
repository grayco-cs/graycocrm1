/* patch CUSTPORTAL — the customer portal end to end, as the customer: node tools/tests/test_CUSTPORTAL_E2E.mjs [--no-browser]
   Offline (custportal_world.mjs): a fake Supabase / Resend / CompanyCam, the REAL functions behind a local server that applies
   netlify.toml's rules for portal.grayco-cs.com. The made-up SAMPLE job (Sample Customer, 123 Sample St) + one REAL job from
   the mirror ($GC_MIRROR, default <scratch>/loop/mirror.json; skipped when it is not on this computer — real data stays in
   memory and the scratch folder). Daytime Central is simulated (Mon 2026-11-02 noon); the night checks set 8:30 PM.
     1 getting in: the e-mailed link, the invite e-mail, first sign-in (starter password), remembered (reload / sliding
       session / installed app), forgot password (code e-mail → sign in), manifest + service worker + icons
     2 the job: name, address, stage, schedule (next), the PM's name + phone, messages to GrayCo
     3 photos: GrayCo + CompanyCam by default, internal-only / Damage / insurance-adjuster never; thumbnails, lazy
    10 customer photo upload: ＋ Add photos → GrayCo Photos "Added by … (customer)", at once, images only, limits, own job
     4 documents: every kind, each a real PDF behind an https link; "Open invoice" → that PDF
     5 signing: change order on a phone → signed copy (PDF) in the portal + the job's documents (not gated) + office to-do
     6 requests: change / new project → the CRM (approvals card, Lead Inbox)
     7 pay: how to pay (check / cash to the PM) — no card payments by design
     8 hard rules: no carrier / sub / sub price / internal note / margin / other customer; only their own job; 7 PM–7 AM quiet
     9 no page errors, no 4xx/5xx; every page / asset the portal links is served as itself on the portal host
   Screenshots → $CUSTPORTAL_SHOTS (default <scratch>/custportal_e2e). */
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import * as W from './custportal_world.mjs';
const require = createRequire(import.meta.url);
const SHOTS = process.env.CUSTPORTAL_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/custportal_e2e';
const MIRROR = process.env.GC_MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
fs.mkdirSync(SHOTS, { recursive: true });
let passed = 0, failed = 0;
async function t(name, fn){ try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { failed++; console.error('  ✗ ' + name + '\n' + (e && e.stack || e)); } }
const S = W.S, L = () => ({ 'x-portal-token': S.link });
const call = W.handlerCall;
const C = require(W.FNDIR + '/portal.js')._core;
const isPdf = b => Buffer.isBuffer(b) && b.slice(0, 5).toString('latin1') === '%PDF-';
const fileOfUrl = u => { const m = /\/crm-files\/([0-9a-f]{64}\.[a-z0-9]+)/.exec(String(u)); return m ? W.FILES[m[1]] : null; };
const jpeg = (w, h) => execFileSync('convert', ['-size', w + 'x' + h, 'gradient:#88aacc-#334455', '-quality', '80', 'jpg:-']);
const LEAKS = () => [S.carrier, 'Sample Mutual', S.sub, 'Ridgeline', '8765', 'INTERNAL', 'internal note', 'margin', 'Other Person', 'POTHER1', 'crew note', 'costTotal', '33100', '31000', 'adjuster measurements'];
function leakIn(obj){ const j = JSON.stringify(obj); return LEAKS().filter(w => j.toLowerCase().includes(w.toLowerCase())); }
function fresh(){ W.setDay(); W.seedSample(); W.resetCaches(); W.RESEND.length = 0; }

console.log('NODE');
fresh();
/* ── 1. getting in ── */
await t('1 the e-mailed link opens the customer portal (portal-access open → customer) and the invite e-mail links to portal.grayco-cs.com/#t=', async () => {
  const r = await call('portal-access', { action: 'open' }, L());
  assert.ok(r.data.kind === 'customer' || r.status === 404 || r.data.ok === false, JSON.stringify(r.data));
  const v = await call('portal', { action: 'view' }, L()); assert.ok(v.data.ok, JSON.stringify(v.data).slice(0, 200));
  process.env.PORTAL_BASE_URL = 'https://portal.grayco-cs.com';   /* as on Netlify (33.151): links are the portal's own address */
  assert.strictEqual(C.linkFor(null, 'X'.repeat(43)), 'https://portal.grayco-cs.com/#t=' + 'X'.repeat(43));
  delete process.env.PORTAL_BASE_URL;
  assert.ok(/^https:\/\/[^/]+\/portal\.html#t=X{43}$/.test(C.linkFor(null, 'X'.repeat(43))), 'without the setting: the CRM address /portal.html#t= (works too)');
  const src = fs.readFileSync(path.join(W.FNDIR, 'portal.js'), 'utf8');
  assert.ok(!/or computer\. No app or password needed/.test(src) && /Open my GrayCo Portal/.test(src) && /Password: <b>your first name<\/b>/.test(src), 'the invite e-mail: the button + the sign-in line, no "no password" contradiction');
});
let SESS = '';
await t('1 first sign-in: e-mail + starter password (first name) → a customer session; a wrong password is refused', async () => {
  const bad = await call('portal-access', { action: 'signin-password', email: S.customer.email, password: 'nope' }); assert.ok(!bad.data.ok && bad.status === 401, JSON.stringify(bad.data));
  const r = await call('portal-access', { action: 'signin-password', email: S.customer.email, password: 'Sample' });
  assert.ok(r.data.ok && r.data.kind === 'customer' && r.data.starter === true && r.data.session, JSON.stringify(r.data)); SESS = r.data.session;
  const j = await call('portal-access', { action: 'c-jobs' }, { 'x-portal-session': SESS }); assert.deepStrictEqual(j.data.jobs.map(x => x.id), [S.pid]);
});
await t('1 remembered: a browser sign-in lasts 30 days on that phone; the installed app (owner: "keeps password and sign in") a year, renewed at every open', async () => {
  const row = W.TABLES.gc_portal_session.find(x => x.id === W.sha(SESS)); assert.ok(row, 'session row');
  assert.ok(Date.parse(row.expires_at) > Date.now() + 29 * 86400e3, 'browser: 30 days ' + row.expires_at);
  const r = await call('portal-access', { action: 'whoami' }, { 'x-portal-session': SESS }); assert.ok(r.data.ok && r.data.kind === 'customer');
  const a = await call('portal-access', { action: 'c-app' }, L()); assert.ok(a.data.ok && a.data.session, JSON.stringify(a.data));
  const ar = W.TABLES.gc_portal_session.find(x => x.id === W.sha(a.data.session)); assert.ok(Date.parse(ar.expires_at) - Date.now() > 300 * 86400e3, 'the installed app: a year');
  const html = fs.readFileSync(path.join(W.ROOT, 'portal.html'), 'utf8');
  assert.ok(/autocomplete: 'username'/.test(html) && /autocomplete: 'current-password'/.test(html), 'the phone\'s password manager can keep the password');
  assert.ok(/try \{ if \(token\) localStorage\.setItem\('gc_portal_t', token\); else token = localStorage\.getItem\('gc_portal_t'\)/.test(html), 'the e-mailed link is remembered on the phone (opening the portal again needs no sign-in)');
});
await t('1 forgot password: "Send me a code" e-mails a 6-digit code (also at night) → signs in → "Make your own password" saves one', async () => {
  W.setAt('2026-11-03T03:30:00Z');   /* 9:30 PM Central: a code they asked for still goes */
  W.RESEND.length = 0;
  const st = await call('portal-access', { action: 'signin-start', who: S.customer.email }); assert.ok(st.status < 400, JSON.stringify(st.data));
  const mail = W.RESEND.find(m => JSON.stringify(m.to).includes(S.customer.email)); assert.ok(mail, 'the code e-mail went out at once: ' + W.RESEND.length);
  const code = (/\b(\d{6})\b/.exec(String(mail.html).replace(/<[^>]+>/g, ' ')) || [])[1]; assert.ok(code, 'a code in the e-mail');
  const v = await call('portal-access', { action: 'signin-verify', who: S.customer.email, code }); assert.ok(v.data.ok && v.data.kind === 'customer', JSON.stringify(v.data));
  W.setDay();
  const pw = await call('portal-access', { action: 'c-password', password: 'Maple-Street-77' }, { 'x-portal-session': v.data.session }); assert.ok(pw.data.ok, JSON.stringify(pw.data));
  const again = await call('portal-access', { action: 'signin-password', email: S.customer.email, password: 'Maple-Street-77' }); assert.ok(again.data.ok && again.data.starter === false, JSON.stringify(again.data));
});
await t('1 installable: manifest (name, icons, start_url, display standalone), service worker and icons exist', async () => {
  const m = JSON.parse(fs.readFileSync(path.join(W.ROOT, 'portal.webmanifest'), 'utf8'));
  assert.ok(m.name && /standalone|fullscreen|minimal-ui/.test(m.display) && m.start_url && (m.icons || []).length >= 2, JSON.stringify(m).slice(0, 200));
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(W.ROOT, i.src.replace(/^\//, '').split('?')[0])), i.src);
  assert.ok(fs.existsSync(path.join(W.ROOT, 'portal-sw.js')));
  const hd = fs.readFileSync(path.join(W.ROOT, '_headers'), 'utf8'); assert.ok(/\/portal\.webmanifest\s*\n\s*Content-Type: application\/manifest\+json/.test(hd), 'the manifest is served with its own type');
});
/* ── 2. the job ── */
let VIEW = null;
await t('2 the job: name, address, stage, schedule with the next step, PM name + phone; no time promise in the automatic texts', async () => {
  VIEW = (await call('portal', { action: 'view' }, L())).data;
  assert.strictEqual(VIEW.job.name, 'Sample Customer — Roof & Kitchen'); assert.strictEqual(VIEW.job.address, S.customer.address);
  assert.ok(VIEW.job.stageName && VIEW.job.stages.length > 5, VIEW.job.stageName);
  const next = VIEW.job.steps.find(x => x.now); assert.ok(next && next.name === 'Roof tear-off and new roof' && next.date === '2026-11-04', JSON.stringify(VIEW.job.steps));
  assert.deepStrictEqual([VIEW.pm.name, VIEW.pm.phone], [S.pm.name, S.pm.phone]);
  const src = ['portal.js', 'portal-access.js'].map(f => fs.readFileSync(path.join(W.FNDIR, f), 'utf8')).join('\n');
  const texts = [...src.matchAll(/sendText\([^,]+,\s*('(?:[^'\\]|\\.)*'(?:\s*\+[^)]*)?)\)/g)].map(m => m[1]);
  assert.ok(texts.length >= 2 && texts.every(x => !/\b(today|tomorrow|tonight|within|minutes?|hours?|by \d|at \d|\d\s*(am|pm))\b/i.test(x.replace(/\(10 min\)/, ''))), texts.join(' | '));
});
await t('2 a message to GrayCo lands on the job (gc_portal_msg, the customer side) and the PM\'s replies show', async () => {
  const r = await call('portal-access', { action: 'c-send', text: 'Will the crew need the side gate open?' }, L()); assert.ok(r.data.ok, JSON.stringify(r.data));
  assert.ok(W.TABLES.gc_portal_msg.some(m => m.project_id === S.pid && m.side === 'them' && /side gate/.test(m.text)));
  const m = await call('portal-access', { action: 'c-msgs' }, L()); assert.ok(m.data.messages.some(x => !x.mine && /driveway clear/.test(x.text)) && m.data.messages.some(x => x.mine && /side gate/.test(x.text)));
});
/* ── 3. photos ── */
let PH = [];
await t('3 photos: GrayCo Photos + the job\'s CompanyCam photos by default (new ones too); internal-only, Damage, hidden, insurance/adjuster never', async () => {
  PH = (await call('portal', { action: 'photos' }, L())).data.photos;
  const ids = PH.map(x => x.id);
  for (let i = 0; i <= 8; i++) assert.ok(ids.includes('ph_sample_' + i), 'GrayCo photo ' + i);
  assert.ok(!ids.includes('ph_sample_9'), 'a Damage photo nobody turned on is not shown'); assert.ok(!ids.includes('ph_sample_10'), 'internal-only is never shown');
  assert.ok(ids.includes('cc_770000') && ids.includes('cc_770001'), 'CompanyCam photos put in after 10/30 are shown by default (patch CUSTPORTAL)');
  assert.ok(!ids.includes('cc_770002'), 'a CompanyCam photo hidden by a click stays hidden'); assert.ok(!ids.includes('cc_770003'), 'a CompanyCam photo described "adjuster / insurance" is never shown by default');
  assert.ok(PH.every(x => /^https:\/\//.test(x.t) && /^https:\/\//.test(x.f)), 'https only');
  assert.ok(PH.filter(x => x.src === 'grayco').every(x => x.t !== x.f), 'thumbnails, not the full picture, in the grid');
  assert.deepStrictEqual(leakIn(PH), []);
  const html = fs.readFileSync(path.join(W.ROOT, 'portal.html'), 'utf8'); assert.ok(/src: PHOTOS\[i\]\.t, alt: [^}]*loading: 'lazy', decoding: 'async'/.test(html), 'the grid loads thumbnails lazily');
});
await t('3 subs keep their own rule: a new CompanyCam photo still waits for a click in the sub portal', async () => {
  const V = require(W.FNDIR + '/_lib/cc-vis.js'); const since = 1000;
  assert.strictEqual(V.customerSees('1', 2000, 'J', V.index([]), since), true); assert.strictEqual(V.subsSee('1', 2000, 'J', V.index([]), since), false); assert.strictEqual(V.subsSee('1', 500, 'J', V.index([]), since), true);
});
/* ── 10. customer photo upload ── */
await t('10 ＋ Add photos: a JPEG (made smaller in the browser) → the job\'s GrayCo Photos as "Sample Customer (customer)", shown at once, hidden from subs, one office to-do', async () => {
  const big = jpeg(1920, 1440), th = jpeg(400, 300);
  const r = await call('portal', { action: 'photo-add', data: big.toString('base64'), thumb: th.toString('base64'), name: 'IMG_0001.jpg' }, L());
  assert.ok(r.data.ok && r.data.photo && /^https:/.test(r.data.photo.t) && r.data.photo.src === 'customer', JSON.stringify(r.data));
  const rec = W.get('gc_photos').find(x => x.id === r.data.id);
  assert.ok(rec && rec.source === 'customer' && rec.by === 'Sample Customer (customer)' && rec.custName === 'Sample Customer' && rec.jobId === S.pid && rec.shared === true && rec.hideSubs === true && rec.labels[0] === 'From customer' && /^\d{4}-\d{2}-\d{2}T/.test(rec.at), JSON.stringify(rec));
  assert.ok(isPdf(Buffer.from('%PDF-')) && W.FILES[rec.ref.slice(13)].bytes.equals(big) && rec.thumbRef !== rec.ref, 'stored in crm-files with its own thumbnail');
  const ph = (await call('portal', { action: 'photos' }, L())).data.photos; assert.strictEqual(ph[0].id, r.data.id); assert.strictEqual(ph[0].src, 'customer');
  const dup = await call('portal', { action: 'photo-add', data: big.toString('base64') }, L()); assert.ok(dup.data.ok && dup.data.duplicate, 'the same picture twice is one photo');
  await call('portal', { action: 'photo-add', data: jpeg(800, 600).toString('base64') }, L());
  const todos = (W.get('gc_office_tasks') || []).filter(x => /^cust_photos_/.test(x.id)); assert.strictEqual(todos.length, 1, 'one office to-do per job per day'); assert.ok(/Sample Customer added photos/.test(todos[0].label));
  assert.ok(!W.RESEND.some(m => /photo/i.test(m.subject || '')), 'nothing is e-mailed');
  const app = (await call('portal', { action: 'app', op: 'state' }, L())).data; assert.strictEqual(app.unread.photos, 0, 'their own photos are not counted as new for them');
});
await t('10 limits: pictures only (a PDF / text is refused), 4.5 MB at most, a preview cannot add, another job\'s link cannot add to this job', async () => {
  let r = await call('portal', { action: 'photo-add', data: W.pdfOf('x').toString('base64') }, L()); assert.strictEqual(r.status, 415);
  r = await call('portal', { action: 'photo-add', data: Buffer.from('hello world, not a picture').toString('base64') }, L()); assert.strictEqual(r.status, 415);
  r = await call('portal', { action: 'photo-add', data: Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF]), Buffer.alloc(4.6 * 1024 * 1024)]).toString('base64') }, L()); assert.strictEqual(r.status, 413);
  r = await call('portal', { action: 'photo-add', preview: true, data: jpeg(50, 50).toString('base64') }, L()); assert.strictEqual(r.status, 403);
  r = await call('portal', { action: 'photo-add', projectId: S.pid, data: jpeg(60, 60).toString('base64') }, { 'x-portal-token': S.otherLink });
  const rec = (W.get('gc_photos') || []).find(x => x.source === 'customer' && x.jobId === S.pid && x.size < 3000); assert.ok(!rec, 'not on the sample job'); if (r.data.ok) assert.strictEqual(W.get('gc_photos').find(x => x.id === r.data.id).jobId, S.other);
  r = await call('portal', { action: 'photo-add', data: jpeg(70, 70).toString('base64') }, { 'x-portal-token': W.tok() }); assert.strictEqual(r.status, 404);
});
await t('10 at night (8:30 PM Central) the customer\'s own photo still shows at once; a GrayCo photo added then waits for 7 AM', async () => {
  W.setAt('2026-11-03T02:30:00Z'); W.resetCaches();
  const r = await call('portal', { action: 'photo-add', data: jpeg(640, 480).toString('base64') }, L()); assert.ok(r.data.ok);
  const l = W.get('gc_photos'); l.push({ id: 'ph_night', jobId: S.pid, ref: l[0].ref, thumbRef: l[0].thumbRef, tag: 'During', at: new Date(Date.now()).toISOString(), source: 'grayco', hash: 'night' }); W.put('gc_photos', l);
  const ph = (await call('portal', { action: 'photos' }, L())).data.photos.map(x => x.id);
  assert.ok(ph.includes(r.data.id) && !ph.includes('ph_night'), ph.slice(0, 3).join(' '));
  W.setDay(); W.resetCaches();
});
/* ── 4. documents ── */
await t('4 documents: estimate, signed contract, change order, warranty, completion, lien waiver, photo report, maintenance plan — each a real PDF behind https; internal papers never', async () => {
  W.resetCaches(); VIEW = (await call('portal', { action: 'view' }, L())).data;
  const titles = VIEW.docs.map(d => d.title).join(' | ');
  for (const k of [/Kitchen remodel/, /Signed contract/, /Change order #1/, /Warranty/, /Certificate of completion/, /Lien waiver/, /Photo report/, /maintenance plan/i]) assert.ok(k.test(titles), k + ' in ' + titles);
  assert.ok(!/Subcontract|budget|costing/i.test(titles), titles);
  for (const d of VIEW.docs) { assert.ok(/^https:\/\//.test(d.url), d.title); const f = fileOfUrl(d.url); assert.ok(f && isPdf(f.bytes), d.title + ' is a PDF'); }
  assert.ok(VIEW.warranty && /5|year/i.test(VIEW.warranty.title), JSON.stringify(VIEW.warranty));
});
await t('4 invoices: paid + open; "Open invoice" → a short-lived https link to THAT invoice\'s PDF; another job\'s / a sub\'s invoice is refused', async () => {
  const inv = VIEW.money.invoices; assert.deepStrictEqual(inv.map(x => x.number + ':' + x.status), ['1001:Paid', '1002:Sent']);
  const r = await call('portal', { action: 'invoice', id: 'INVS2', link: true }, L()); assert.ok(r.data.ok && /^https:\/\//.test(r.data.url), JSON.stringify(r.data));
  const f = fileOfUrl(r.data.url); assert.ok(f && isPdf(f.bytes) && /1002/.test(execFileSync('pdftotext', ['-', '-'], { input: f.bytes }).toString()), 'the PDF of invoice 1002');
  assert.strictEqual((await call('portal', { action: 'invoice', id: 'INVO1', link: true }, L())).status, 404);
  assert.strictEqual((await call('portal', { action: 'invoice', id: 'INVSUB', link: true }, L())).status, 404);
});
/* ── 5. signing ── */
const CO2 = 'sr_' + S.pid + '_change_order_CO2';
await t('5 e-sign: the change order is signed → a signed PDF (with the name) in storage, ✓ Signed + "Open my signed copy", the PM + office told, the customer\'s copy e-mailed', async () => {
  W.RESEND.length = 0;
  const v0 = (await call('portal-sign', { action: 'view' }, L())).data; assert.ok(v0.items.find(x => x.id === CO2 && x.status === 'pending'));
  const nos = await call('portal-sign', { action: 'sign', id: CO2, name: 'Sample Customer', agree: true }, L()); assert.strictEqual(nos.status, 400, 'no e-sign consent → not signed');
  const r = await call('portal-sign', { action: 'sign', id: CO2, name: 'Sample Customer', agree: true, esignConsent: { agree: true, version: 'v1', at: new Date().toISOString() }, strokes: [[[10, 10], [60, 50], [120, 20]]] }, L());
  assert.ok(r.data.ok && r.data.copy, JSON.stringify(r.data));
  const v = (await call('portal-sign', { action: 'view' }, L())).data, it = v.items.find(x => x.id === CO2);
  assert.ok(it.status === 'signed' && it.signed.name === 'Sample Customer' && /^https:/.test(it.signed.url), JSON.stringify(it));
  const f = fileOfUrl(it.signed.url); assert.ok(f && isPdf(f.bytes) && /Sample Customer/.test(execFileSync('pdftotext', ['-', '-'], { input: f.bytes }).toString()), 'the signed copy names the signer');
  assert.ok((W.get('gc_office_tasks') || []).some(x => /signed the change order/.test(x.label)));
  assert.ok(W.RESEND.some(m => JSON.stringify(m.to).includes(S.pm.email)) && W.RESEND.some(m => JSON.stringify(m.to).includes(S.customer.email) && (m.attachments || []).length === 1));
});
await t('5 the signed copy the CRM files on the job (source portal-signature) is in the customer\'s Documents at once — never waits on "Put in the customer portal"', async () => {
  const sr = W.get('gc_sign_requests').find(x => x.id === CO2);
  const docs = W.get('projectDocs'); docs.push({ id: 'esdoc_' + sr.signed.sigId, pid: S.pid, name: sr.signed.docName, cat: 'Change Orders', type: 'application/pdf', ref: sr.signed.docRef, uploadedAt: sr.signed.at, portalShare: true, source: 'portal-signature', signedBy: 'Sample Customer', signedAt: sr.signed.at, signRequestId: CO2 });
  W.put('projectDocs', docs); W.resetCaches();
  const v = (await call('portal', { action: 'view' }, L())).data; assert.ok(v.docs.some(d => /Signed change order/.test(d.title)), v.docs.map(d => d.title).join(' | '));
  assert.ok(!(W.get(C.AQ_KEY) || []).some(a => a.kind === 'portal_publish' && /Signed change order/.test(a.title)), 'no approval for the customer\'s own signed copy');
  const crm = fs.readFileSync(path.join(W.ROOT, 'index.html'), 'utf8');
  assert.ok(/source: 'portal-signature', signedBy/.test(crm) && /function applyCO\(r\)/.test(crm), 'the CRM files the signed copy on the job and approves the change order (patch AUTO5)');
  assert.ok(/waiver\|sign\|warrant\|completion\/i\.test\(s\(d\.cat\)/.test(crm), 'warranty / certificate of completion can be sent for signature (patch CUSTPORTAL)');
});
await t('5 a warranty / certificate of completion sent for signature (kind doc) is signed the same way', async () => {
  const pm = { authorization: 'Bearer good-pm' };
  const q = await call('portal-sign', { action: 'request', projectId: S.pid, kind: 'doc', refId: 'DSAMPLE_COC', title: 'Certificate of completion — Roof', docRef: W.get('projectDocs').find(d => d.id === 'DSAMPLE_COC').ref }, pm);
  assert.ok(q.data.ok && q.data.id, JSON.stringify(q.data));
  const v = (await call('portal-sign', { action: 'view' }, L())).data; assert.ok(v.items.some(x => x.id === q.data.id && x.status === 'pending' && /^https:/.test(x.doc)));
  const r = await call('portal-sign', { action: 'sign', id: q.data.id, name: 'Sample Customer', agree: true, esignConsent: { agree: true, version: 'v1', at: new Date().toISOString() }, strokes: [] }, L()); assert.ok(r.data.ok, JSON.stringify(r.data));
});
/* ── 6. requests ── */
await t('6 ➕ Request a change / 🏗 Request a new project → the CRM (✅ Approvals card for the PM, a Lead Inbox lead)', async () => {
  const r = await call('portal-req', { action: 'change', text: 'Add a gutter guard over the back porch', where: 'Back porch', urgency: 'soon', contact: 'call' }, L()); assert.ok(r.data.ok, JSON.stringify(r.data));
  const reqs = W.get('gc_portal_requests') || []; const it = reqs.find(x => /back porch/.test(x.text)); assert.ok(it && it.pid === S.pid);
  assert.ok((W.get(C.AQ_KEY) || []).some(a => a.id === 'appr_preq_' + it.id), 'the approvals card');
  const p = await call('portal-req', { action: 'project', property: 'j:' + S.pid, workType: 'roofing', text: 'New roof on the garage', urgency: 'soon', contact: 'call' }, L()); assert.ok(p.data.ok, JSON.stringify(p.data));
  const inbox = [].concat(W.get('gc_lead_inbox') || [], ...(W.TABLES.gc_lead_inbox_kv || []).filter(r => r.key === 'gc_lead_inbox').map(r => { let v = r.value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } return Array.isArray(v) ? v : []; }));
  assert.ok(inbox.some(x => x.source === 'Portal request' && /garage/.test(JSON.stringify(x))), 'a Lead Inbox lead: ' + inbox.length + ' / ' + JSON.stringify(Object.keys(W.TABLES)));
  const m = await call('portal-req', { action: 'mine' }, L()); assert.deepStrictEqual(leakIn(m.data), []);
});
/* ── 7. pay ── */
await t('7 pay: no card payments by design — the portal says how (check / cash to the PM); balances right', async () => {
  assert.strictEqual(VIEW.money.paid, 14475); assert.strictEqual(VIEW.money.due, 19300);
  const html = fs.readFileSync(path.join(W.ROOT, 'portal.html'), 'utf8'); assert.ok(/How to pay/.test(html) && /check/.test(html));
});
/* ── 8. hard rules ── */
await t('8 nothing leaks: no carrier, sub, sub price, internal note, margin, cost or other customer in any answer the customer gets', async () => {
  const answers = [VIEW, PH, (await call('portal-sign', { action: 'view' }, L())).data, (await call('portal-access', { action: 'c-msgs' }, L())).data, (await call('portal-access', { action: 'c-jobs' }, L())).data,
    (await call('portal', { action: 'crew' }, L())).data, (await call('portal', { action: 'app' }, L())).data];
  answers.forEach((a, i) => assert.deepStrictEqual(leakIn(a), [], 'answer ' + i));
});
await t('8 only their own job: the other customer\'s link / session never opens this job (view, photos, sign, invoice, messages)', async () => {
  const O = { 'x-portal-token': S.otherLink };
  const v = await call('portal', { action: 'view', projectId: S.pid }, O); assert.ok(!JSON.stringify(v.data).includes('Sample Customer'), 'the other link sees only its own job');
  const s2 = (await call('portal-access', { action: 'signin-password', email: 'other.person@example.com', password: 'Other' })).data.session; assert.ok(s2, 'other customer can sign in');
  for (const a of ['view', 'photos']) { const r = await call('portal', { action: a, projectId: S.pid }, { 'x-portal-session': s2 }); assert.ok(r.status === 404 || !JSON.stringify(r.data).includes('Sample Customer'), a + ' ' + r.status); }
  const sg = await call('portal-sign', { action: 'view', projectId: S.pid }, { 'x-portal-session': s2 }); assert.ok(!JSON.stringify(sg.data).includes('Kitchen remodel'));
  const iv = await call('portal', { action: 'invoice', id: 'INVS2', projectId: S.pid }, { 'x-portal-session': s2 }); assert.ok(iv.status === 404);
  const ms = await call('portal-access', { action: 'c-msgs', projectId: S.pid }, { 'x-portal-session': s2 }); assert.ok(!JSON.stringify(ms.data).includes('driveway'));
});
await t('8 CUSTQUIET: 7 PM–7 AM Central nothing goes to a customer — a customer e-mail is held, a PM post made then shows from 7 AM', async () => {
  const CQ = require(W.FNDIR + '/_lib/custquiet.js');
  assert.strictEqual(CQ.quiet(Date.parse('2026-11-03T02:30:00Z')), true); assert.strictEqual(CQ.quiet(Date.parse('2026-11-02T18:00:00Z')), false); assert.strictEqual(CQ.quiet(Date.parse('2026-11-03T12:59:00Z')), true); assert.strictEqual(CQ.quiet(Date.parse('2026-11-03T13:00:00Z')), false);
  W.setAt('2026-11-03T02:30:00Z'); W.resetCaches();
  const p = W.get('projects'); p[0].portalPosts.push({ id: 'post_night', at: new Date(Date.now()).toISOString(), by: S.pm.name, text: 'Night post' }); W.put('projects', p);
  let v = (await call('portal', { action: 'view' }, L())).data; assert.ok(!v.posts.some(x => x.id === 'post_night'), 'hidden at night');
  W.setAt('2026-11-03T13:05:00Z'); W.resetCaches();
  v = (await call('portal', { action: 'view' }, L())).data; assert.ok(v.posts.some(x => x.id === 'post_night'), 'shown from 7 AM');
  W.setDay(); W.resetCaches();
});
/* ── 9. the portal host: every page / asset the portal links is served as itself (not the catch-all) ── */
await t('9 netlify.toml parses (tomllib); on portal.grayco-cs.com every script / style / image / page the portal and its legal pages load is served as itself; the catch-all is the last portal rule', async () => {
  execFileSync('python3', ['-c', 'import tomllib,sys; tomllib.load(open(sys.argv[1],"rb"))', path.join(W.ROOT, 'netlify.toml')]);
  const rules = W.tomlRedirects();
  const pages = ['portal.html', 'report.html', 'esign-consent.html', 'cancel-notice.html', 'portal-terms.html', 'privacy.html', 'terms.html', 'sms-consent.html'];
  const want = new Set(['/portal.webmanifest', '/portal-sw.js', '/portal-icon-180.png', '/portal-icon-192.png', '/portal-icon-512.png', '/portal-logo.png', '/report.html']);
  for (const pg of pages) { const h = fs.readFileSync(path.join(W.ROOT, pg), 'utf8'); for (const m of h.matchAll(/(?:src|href)="(\/?[A-Za-z0-9_./-]+\.(?:js|css|png|jpg|webmanifest|html))(?:\?[^"]*)?"/g)) want.add('/' + m[1].replace(/^\//, '')); }
  for (const f of ['legal2.js', 'portal-sw.js']) { const h = fs.readFileSync(path.join(W.ROOT, f), 'utf8'); for (const m of h.matchAll(/'(\/[A-Za-z0-9_-]+\.(?:html|js|png))'/g)) want.add(m[1]); }
  const bad = [];
  for (const u of want) { if (u === '/portal.html') continue; if (!fs.existsSync(path.join(W.ROOT, u))) { bad.push(u + ' (no such file)'); continue; } const rd = W.applyRedirects(rules, W.HOST, u); if (!rd || rd.status !== 200 || rd.to !== u) bad.push(u + ' → ' + (rd ? rd.to + ' via ' + rd.rule : 'no rule')); }
  assert.deepStrictEqual(bad, [], 'swallowed by the catch-all: ' + bad.join(', '));
  const portalRules = rules.map((r, i) => [r, i]).filter(([r]) => /^https:\/\/portal\.grayco-cs\.com\//.test(r.from));
  assert.strictEqual(portalRules[portalRules.length - 1][0].from, 'https://portal.grayco-cs.com/*', 'the catch-all comes last');
});
await t('9 the functions keep the pause guard and pass node --check', async () => {
  for (const f of ['portal.js', 'portal-access.js', 'portal-sign.js', 'portal-req.js']) { const src = fs.readFileSync(path.join(W.FNDIR, f), 'utf8'); assert.ok(/require\('\.\/_lib\/pause'\)\.install\(\)/.test(src), f); execFileSync(process.execPath, ['--check', path.join(W.FNDIR, f)]); }
  execFileSync(process.execPath, ['--check', path.join(W.FNDIR, '_lib/cc-vis.js')]);
});
await t('9 the CRM patch is applied and idempotent (tools/patch_CUSTPORTAL.py)', async () => {
  const out = execFileSync('python3', [path.join(W.ROOT, 'tools/patch_CUSTPORTAL.py'), path.join(W.ROOT, 'index.html')]).toString(); assert.ok(/already patched/.test(out), out);
});
/* ── a REAL job from the mirror, as its customer ── */
let MIR = null;
await t('mirror: a real job (from the mirror) opens for its customer — view, photos, papers, invoices — with nothing internal and no carrier name', async () => {
  if (!fs.existsSync(MIRROR)) { console.log('    (mirror not on this computer — skipped)'); return; }
  const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
  W.setDay(); for (const k of Object.keys(W.KV)) delete W.KV[k];
  for (const r of rows) if (r && r.key && !/^_probe_/.test(r.key)) W.KV[r.key] = { value: r.v, at: r.updated_at || '2026-10-30T00:00:00Z' };
  W.resetCaches();
  const data = await C.crmData(true);
  const projs = C.listOf(data, ['projects']).filter(p => p && p.id && !p.deleted && /@/.test(p.clientEmail || '') && !/test|demo|sample/i.test(p.name + p.client));
  let best = null;
  for (const p of projs) { const v = await C.buildView(data, p, { noGateQueue: true }); const sc = v.docs.length * 2 + v.money.invoices.length * 2 + (C.ccIdOf(p) ? 3 : 0) + (v.insurance ? -5 : 0) + (v.pm.phone ? 1 : 0); if (!best || sc > best.sc) best = { p, sc, v }; }
  assert.ok(best, 'a job with a customer e-mail');
  const link = W.tok(); W.TABLES.gc_portal = (W.TABLES.gc_portal || []).filter(x => x.project_id !== best.p.id); W.TABLES.gc_portal.push({ token: link, project_id: best.p.id, revoked: false });
  const H = { 'x-portal-token': link };
  const v = (await call('portal', { action: 'view' }, H)).data; assert.ok(v.ok && v.job.name, JSON.stringify(v).slice(0, 200));
  const ph = (await call('portal', { action: 'photos' }, H)).data; assert.ok(ph.ok);
  const sg = (await call('portal-sign', { action: 'view' }, H)).data; assert.ok(sg.ok);
  const carriers = [...new Set(C.listOf(data, ['projects']).map(p => String(p.insCarrier || p.insuranceCompany || p.carrier || '').trim()).filter(x => x.length >= 4))];
  const all = JSON.stringify([v, ph, sg]).toLowerCase();
  const leaked = carriers.filter(c => all.includes(c.toLowerCase()));
  assert.deepStrictEqual(leaked, [], 'carrier names in the portal');
  for (const sub of (best.p.subs || [])) if (String(sub.name || '').length >= 5) assert.ok(!all.includes(String(sub.name).toLowerCase()), 'sub name');
  const others = C.listOf(data, ['projects']).filter(p => p.id !== best.p.id && String(p.client || '').length >= 6 && String(p.client) !== String(best.p.client)).map(p => String(p.client).toLowerCase());
  assert.ok(!others.some(o => JSON.stringify(v.docs.map(d => d.title)).toLowerCase().includes(o) && !String(best.p.name).toLowerCase().includes(o)), 'another customer in the papers');
  MIR = { link, pid: best.p.id, docs: v.docs.length, inv: v.money.invoices.length, photos: (ph.photos || []).length, papers: sg.items.length };
  console.log('    mirror job: ' + v.docs.length + ' papers, ' + v.money.invoices.length + ' invoices, ' + (ph.photos || []).length + ' photos, ' + sg.items.length + ' to sign (names kept out of the log)');
});

/* ═════════ the browser ═════════ */
if (!process.argv.includes('--no-browser')) {
  console.log('BROWSER');
  const srv = await W.startServer();
  const browser = await W.launch();
  const ERRS = [], HTTPERR = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const shot = async (pg, name) => { await sleep(350); await pg.screenshot({ path: path.join(SHOTS, name + '.png') }); };
  function watch(pg, kind, allow404){
    pg.on('pageerror', e => ERRS.push(kind + ': ' + e.message));
    pg.on('response', r => { const st = r.status(); if ((st === 401 || st === 403 || st >= 500 || (st === 404 && !allow404)) && !/favicon/.test(r.url())) { let a = ''; try { a = (JSON.parse(r.request().postData() || '{}') || {}).action || ''; } catch (e) {} HTTPERR.push(kind + ' ' + st + ' ' + r.url().replace(/token=[^&]+/, 'token=…').slice(0, 120) + (a ? ' action=' + a : '') + ' on ' + (r.frame().page().url().replace(/#.*/, '#…'))); } });
  }
  for (const kind of ['phone', 'desktop']) {
    fresh();
    await t(kind + ': 1 sign in with the starter password → home; reload and reopen → still signed in (no sign-in screen); Forgot password → code screen', async () => {
      const ctx = await W.context(browser, kind), pg = await ctx.newPage(); watch(pg, kind);
      await pg.goto(srv.ORIGIN + '/'); await pg.waitForSelector('#signinBox #siEmail', { timeout: 20000 });
      assert.ok(await pg.$('link[rel="manifest"][href="/portal.webmanifest"]'), 'manifest linked'); await shot(pg, kind + '_01_signin');
      await pg.click('#siForgot'); await pg.waitForSelector('#siWho'); await pg.fill('#siWho', S.customer.email); await pg.click('#siSend'); await pg.waitForSelector('#siCode'); await shot(pg, kind + '_02_forgot_code');
      await pg.click('#siBack').catch(() => {}); await pg.goto(srv.ORIGIN + '/'); await pg.waitForSelector('#siLogin');
      await pg.fill('#siEmail', S.customer.email); await pg.fill('#siPw', 'Sample'); await pg.click('#siLogin');
      await pg.waitForSelector('#track', { timeout: 20000 }); assert.ok(await pg.$('#ownPwCard'), '"Make your own password" offered');
      await pg.reload(); await pg.waitForSelector('#track', { timeout: 20000 }); assert.ok(!(await pg.$('#signinBox')), 'still signed in after a reload');
      const p2 = await ctx.newPage(); watch(p2, kind); await p2.goto(srv.ORIGIN + '/'); await p2.waitForSelector('#track', { timeout: 20000 }); await p2.close();
      const ls = await pg.evaluate(() => Object.keys(localStorage).map(k => k + '=' + localStorage.getItem(k)).join(' ')); assert.ok(!/Sample\b(?!-)/.test(ls.replace(/gc_portal_s=\S+/, '')), 'no password kept in the browser storage');
      const reg = await pg.evaluate(() => fetch('/portal-sw.js').then(r => r.status + ' ' + r.headers.get('content-type')));
      assert.ok(/^200 text\/javascript/.test(reg), 'the service worker is served as JavaScript: ' + reg);
      await ctx.close();
    });
    await t(kind + ': 2 the e-mailed link → home: name, address, stage + next step, PM card (call / text), updates; 3 photos (thumbnails, lazy) + one big', async () => {
      const ctx = await W.context(browser, kind), pg = await ctx.newPage(); watch(pg, kind);
      await pg.goto(srv.ORIGIN + '/#t=' + S.link); await pg.waitForSelector('#track', { timeout: 20000 }); await sleep(2500);
      const txt = await pg.textContent('body');
      for (const w of ['Sample Customer — Roof & Kitchen', '123 Sample St', 'Roof tear-off and new roof', 'Dana Rivers', '901-555-0142', 'Materials are on site']) assert.ok(txt.includes(w), w);
      assert.ok(await pg.$('a[href="tel:9015550142"]') && await pg.$('a[href^="sms:9015550142"]'), 'call / text the PM');
      await shot(pg, kind + '_03_home');
      await pg.click('#tabs button[data-tab="photos"]'); await pg.waitForSelector('#gp-gallery #grid img', { timeout: 15000 }); await sleep(1200);
      const imgs = await pg.$$eval('#gp-gallery #grid img', l => l.map(i => ({ lazy: i.loading, src: i.getAttribute('src') })));
      assert.ok(imgs.length >= 11 && imgs.every(i => i.lazy === 'lazy'), imgs.length + ' photos');
      await shot(pg, kind + '_04_photos');
      await pg.click('#gp-gallery #grid button'); await pg.waitForSelector('.lb img'); await shot(pg, kind + '_05_photo_big'); await pg.keyboard.press('Escape');
      await ctx.close();
    });
    await t(kind + ': 10 ＋ Add photos: two pictures from the phone → "2 photos added", on top with "You", in GrayCo Photos as the customer\'s', async () => {
      const ctx = await W.context(browser, kind), pg = await ctx.newPage(); watch(pg, kind);
      await pg.goto(srv.ORIGIN + '/#t=' + S.link); await pg.waitForSelector('#track', { timeout: 20000 });
      await pg.click('#tabs button[data-tab="photos"]'); await pg.waitForSelector('#gpAdd', { timeout: 15000 });
      assert.strictEqual(await pg.getAttribute('#gpAddFiles', 'accept'), 'image/*'); assert.ok(await pg.$('#gpAddFiles[multiple]'));
      const a = path.join(SHOTS, '.up_a.jpg'), b = path.join(SHOTS, '.up_b.jpg'); fs.writeFileSync(a, jpeg(3000, 2000)); fs.writeFileSync(b, jpeg(1200, 1600));
      const before = (W.get('gc_photos') || []).filter(x => x.source === 'customer').length;
      await pg.setInputFiles('#gpAddFiles', [a, b]);
      await pg.waitForFunction(() => /2 photos added/.test((document.getElementById('gpAddMsg') || {}).textContent || ''), null, { timeout: 30000 });
      const you = await pg.$$eval('#grid .gp-you', l => l.length); assert.ok(you >= 2, 'the customer\'s photos say "You": ' + you);
      const mine = (W.get('gc_photos') || []).filter(x => x.source === 'customer'); assert.strictEqual(mine.length, before + 2);
      for (const r of mine.slice(-2)) { const f = W.FILES[r.ref.slice(13)].bytes; const dim = execFileSync('identify', ['-format', '%w %h', '-'], { input: f }).toString().split(' ').map(Number); assert.ok(Math.max(...dim) <= 1920 && f[0] === 0xFF, 'made smaller in the browser: ' + dim); assert.ok(r.by === 'Sample Customer (customer)'); }
      await shot(pg, kind + '_06_photos_added');
      fs.unlinkSync(a); fs.unlinkSync(b); await ctx.close();
    });
    await t(kind + ': 4 Documents (every paper opens: https PDF) + 📄 Open invoice → a new tab with THAT PDF; 7 Payments says how to pay', async () => {
      const ctx = await W.context(browser, kind), pg = await ctx.newPage(); watch(pg, kind);
      await pg.goto(srv.ORIGIN + '/#t=' + S.link); await pg.waitForSelector('#track', { timeout: 20000 });
      await pg.click('#tabs button[data-tab="docs"]'); await sleep(900);
      const hrefs = await pg.$$eval('.doc a.btn', l => l.map(a => a.href)); assert.ok(hrefs.length >= 7, hrefs.length + ' papers');
      for (const u of hrefs) { const f = fileOfUrl(u); assert.ok(f && isPdf(f.bytes), u.slice(0, 80)); }
      await shot(pg, kind + '_07_documents');
      const want = await pg.$eval('.doc a.btn >> nth=3', a => a.href);
      const rq = ctx.waitForEvent('request', { predicate: r => r.url() === want, timeout: 10000 });
      await pg.click('.doc a.btn >> nth=3'); await rq; assert.ok(/\/crm-files\/[0-9a-f]{64}\.pdf/.test(want), want);
      for (const extra of ctx.pages()) if (extra !== pg) await extra.close().catch(() => {});
      await pg.click('#tabs button[data-tab="pay"]'); await sleep(700);
      const pt = await pg.textContent('main'); assert.ok(/How to pay/.test(pt) && /check/.test(pt) && /1002/.test(pt) && /Paid/.test(pt), 'payments');
      await shot(pg, kind + '_08_payments');
      const rq2 = ctx.waitForEvent('request', { predicate: r => /\/crm-files\/[0-9a-f]{64}\.pdf/.test(r.url()) && r.frame().page() !== pg, timeout: 15000 });
      await pg.click('[data-inv-open="INVS2"]'); const ir = await rq2;
      const f = fileOfUrl(ir.url()); assert.ok(f && isPdf(f.bytes) && /1002/.test(execFileSync('pdftotext', ['-', '-'], { input: f.bytes }).toString()), 'the invoice PDF opened in a new tab: ' + ir.url().slice(0, 90));
      await ctx.close();
    });
    await t(kind + ': 5 sign the change order (consent, name, drawn signature) → ✓ Signed + "Open my signed copy"; 6 request a change → thanks; 2 send a message', async () => {
      const ctx = await W.context(browser, kind), pg = await ctx.newPage(); watch(pg, kind);
      await pg.goto(srv.ORIGIN + '/#t=' + S.link); await pg.waitForSelector('#track', { timeout: 20000 });
      const sel = '#gcesign .es-item[data-id="' + CO2 + '"]'; await pg.waitForSelector(sel, { timeout: 15000 });
      await pg.evaluate(s => document.querySelector(s).scrollIntoView(), sel); await shot(pg, kind + '_09_sign_before');
      for (const c of await pg.$$(sel + ' input[type=checkbox]')) if (!(await c.isChecked())) await c.check();
      await pg.fill(sel + ' input.sel-name', 'Sample Customer');
      const bb = await (await pg.$(sel + ' canvas')).boundingBox(); await pg.mouse.move(bb.x + 20, bb.y + 40); await pg.mouse.down(); for (let i = 1; i < 15; i++) await pg.mouse.move(bb.x + 20 + i * 12, bb.y + 40 + (i % 3) * 8); await pg.mouse.up();
      await pg.click(sel + ' .es-sign');
      await pg.waitForFunction(s => { const e = document.querySelector(s); return e && e.getAttribute('data-status') === 'signed'; }, sel, { timeout: 15000 });
      const sb = await pg.textContent(sel); assert.ok(/Signed by Sample Customer/.test(sb) && /Open my signed copy/.test(sb), sb.slice(0, 200));
      await pg.evaluate(s => document.querySelector(s).scrollIntoView(), sel); await shot(pg, kind + '_10_sign_after');
      const sr = W.get('gc_sign_requests').find(x => x.id === CO2); assert.ok(sr.status === 'signed' && sr.signed.drawn === true);
      await pg.waitForSelector('#gcpr-change', { timeout: 10000 }); await pg.click('#gcpr-change'); await pg.waitForSelector('#gcpr-text');
      await pg.fill('#gcpr-text', 'Paint the front door to match (' + kind + ')'); await pg.click('#gcpr-send'); await pg.waitForSelector('#gcpr-thanks', { timeout: 15000 }); await shot(pg, kind + '_11_request_sent');
      assert.ok((W.get('gc_portal_requests') || []).some(x => x.text.includes('(' + kind + ')') && x.pid === S.pid));
      await pg.click('#gcpr-done');
      await pg.click('#tabs button[data-tab="msgs"]'); await pg.waitForSelector('#cMsgText'); await pg.fill('#cMsgText', 'Thanks Dana! (' + kind + ')'); await pg.click('#cMsgSend');
      await pg.waitForFunction(k => /Thanks Dana! \(/.test(document.getElementById('cMsgList').textContent) && document.getElementById('cMsgList').textContent.includes(k), kind, { timeout: 10000 });
      await shot(pg, kind + '_12_messages');
      const all = await pg.evaluate(() => document.body.innerText); assert.deepStrictEqual(LEAKS().filter(w => all.toLowerCase().includes(w.toLowerCase())), [], '8 nothing internal anywhere on the page');
      await ctx.close();
    });
    await t(kind + ': 9 the portal host serves every asset the pages load (gc-address.js, legal pages, their logo, report.html, manifest, icons, sw)', async () => {
      const ctx = await W.context(browser, kind), pg = await ctx.newPage(); watch(pg, kind);
      await pg.goto(srv.ORIGIN + '/#t=' + S.link); await pg.waitForSelector('#track', { timeout: 20000 });
      const res = await pg.evaluate(async () => { const out = {}; for (const u of ['/gc-address.js', '/legal2.js', '/portal-req.js', '/portal-pwa.js', '/portal-needs.js', '/portal-claimhelp.js', '/portal-plus.js', '/portal-home.js', '/portal-app.js', '/portal.webmanifest', '/portal-sw.js', '/portal-icon-180.png', '/portal-icon-192.png', '/portal-icon-512.png', '/portal-logo.png', '/report.html', '/esign-consent.html', '/cancel-notice.html', '/portal-terms.html', '/privacy.html', '/terms.html', '/sms-consent.html', '/mkt-pages.css', '/img/grayco-logo-white.png']) { const r = await fetch(u); const tx = await r.clone().text(); out[u] = r.status + ' ' + (r.headers.get('content-type') || '') + (/<script src="\/gc-address\.js"><\/script>\s*<script>/.test(tx) && /id="tabs"/.test(tx) ? ' PORTAL-PAGE' : ''); } return out; });
      const wrong = Object.entries(res).filter(([u, v]) => !/^200 /.test(v) || / PORTAL-PAGE$/.test(v) || (/\.js$/.test(u) && !/javascript/.test(v)) || (/\.png$/.test(u) && !/image\/png/.test(v)) || (/\.css$/.test(u) && !/text\/css/.test(v)));
      assert.deepStrictEqual(wrong, [], JSON.stringify(wrong));
      const ep = await ctx.newPage(); watch(ep, kind); await ep.goto(srv.ORIGIN + '/esign-consent.html'); await ep.waitForLoadState('load');
      const logoOk = await ep.evaluate(() => Array.from(document.images).every(i => i.complete && i.naturalWidth > 0)); assert.ok(logoOk, 'the legal page\'s logo loads on the portal host');
      await ctx.close();
    });
    if (MIR) await t(kind + ': mirror — the real job opens for its customer (home, photos, documents, payments) with no page errors (screens in scratch)', async () => {
      const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8')); for (const k of Object.keys(W.KV)) delete W.KV[k];
      for (const r of rows) if (r && r.key && !/^_probe_/.test(r.key)) W.KV[r.key] = { value: r.v, at: r.updated_at || '2026-10-30T00:00:00Z' };
      W.TABLES.gc_portal.push({ token: MIR.link, project_id: MIR.pid, revoked: false }); W.resetCaches();
      const ctx = await W.context(browser, kind);
      const PNG = fs.readFileSync(path.join(W.ROOT, 'portal-icon-192.png'));
      await ctx.route(/https:\/\/(img|static)\.companycam\.com\//, r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
      await ctx.route(W.SB + '/**', r => { const u = r.request().url(); const f = fileOfUrl(u); if (f) return r.fulfill({ status: 200, contentType: f.type || 'application/pdf', body: f.bytes }); return r.fulfill({ status: 200, contentType: /\.pdf/.test(u) ? 'application/pdf' : 'image/png', body: /\.pdf/.test(u) ? W.pdfOf('(placeholder — the real file stays in production)') : PNG }); });
      const pg = await ctx.newPage(); watch(pg, kind + '-mirror');
      await pg.goto(srv.ORIGIN + '/#t=' + MIR.link); await pg.waitForSelector('#track, #claim, #insTrack', { timeout: 30000 }); await sleep(2500);
      await shot(pg, 'mirror_' + kind + '_home');
      for (const tab of ['photos', 'docs', 'pay']) { await pg.click('#tabs button[data-tab="' + tab + '"]'); await sleep(1500); await shot(pg, 'mirror_' + kind + '_' + tab); }
      await ctx.close();
    });
  }
  await t('9 no page errors and no 401 / 403 / 404 / 5xx on any portal page, asset or call (phone + desktop)', async () => {
    assert.deepStrictEqual(ERRS, []); assert.deepStrictEqual(HTTPERR, []);
    const fnBad = srv.LOG.filter(x => /^\/\.netlify\//.test(x.path) && (x.status === 401 || x.status === 403 || x.status >= 500)); assert.deepStrictEqual(fnBad, []);
  });
  await browser.close(); await srv.close();
}
console.log((failed ? 'FAILED ' : 'OK ') + passed + '/' + (passed + failed) + '   screenshots: ' + SHOTS);
process.exit(failed ? 1 : 0);
