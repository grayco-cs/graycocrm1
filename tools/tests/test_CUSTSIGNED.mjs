// test_CUSTSIGNED.mjs <build-dir> — patch CUSTSIGNED (owner 11/26: "If they do not sign in the portal, have where they can upload signed
// documents … it will put them in portals and in the CRM's documents for the jobs"). Node only, the offline custportal world
// (in-memory Supabase / Resend; nothing leaves the machine; made-up data).
//   1. A signed-in customer (session) sends 2 papers on their job: c-docs-url (one-time upload link into crm-files) → the upload →
//      c-docs-up → 2 projectDocs records on that job only (storage refs, no base64 in gc_kv; portalShare + portalLive, fromCustomer,
//      source customer-portal, Contracts / Other); nobody else's records dropped.
//   2. The job's superintendent is told (else the PM) — the staff notifier; nothing to the customer (no e-mail, text, portal message).
//   3. The files show back in their portal's Documents as "Sent by you".
//   4. Another customer's job is refused; too big / wrong kind refused politely; a staff preview cannot send.
//   5. portal.html: the 📤 box on Documents (Spanish too), no alert / confirm, APP_JS bumped.
import path from 'path'; import fs from 'fs'; import crypto from 'crypto'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const build = path.resolve(process.argv[2] || '.');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const W = await import(path.join(build, 'tools/tests/custportal_world.mjs'));
const FN = path.join(build, 'netlify/functions');
const S = W.S;
W.seedSample({ photos: 4, crmDocs: false }); W.resetCaches();

/* the storage's one-time upload link (the world answers object/sign only): POST …/upload/sign/crm-files/<path> → a URL; PUT to it stores */
const base = globalThis.fetch;
globalThis.fetch = async (url, o) => {
  const u = new URL(String(url)); o = o || {}; const m = (o.method || 'GET').toUpperCase();
  const k = '/storage/v1/object/upload/sign/crm-files/';
  if (u.pathname.startsWith(k)) {
    const name = u.pathname.slice(k.length);
    if (m === 'POST') { W.CALLS.push('POST ' + u.host + u.pathname); return { ok: true, status: 200, json: async () => ({ url: '/object/upload/sign/crm-files/' + name + '?token=up' + W.sha(name).slice(0, 8) }), text: async () => '' }; }
    if (m === 'PUT') { W.FILES[name] = { bytes: Buffer.from(o.body), type: (o.headers || {})['Content-Type'] || '' }; return { ok: true, status: 200, json: async () => ({}), text: async () => '' }; }
  }
  /* a ranged read of a stored file: its first bytes + Content-Range (as Supabase answers) */
  const g = '/storage/v1/object/crm-files/', rg = (o.headers || {}).Range;
  if (m === 'GET' && rg && u.pathname.startsWith(g)) {
    const f = W.FILES[u.pathname.slice(g.length)]; if (!f) return { ok: false, status: 404, json: async () => ({}), text: async () => '', headers: { get: () => null } };
    const part = f.bytes.slice(0, 64);
    return { ok: true, status: 206, arrayBuffer: async () => part, json: async () => ({}), text: async () => '', headers: { get: h => /content-range/i.test(h) ? 'bytes 0-' + (part.length - 1) + '/' + f.bytes.length : null } };
  }
  return base(url, o);
};

/* a signed-in customer: a session row for the sample job's link (the e-mail + password sign-in makes the same row) */
const sessTok = W.tok();
W.TABLES.gc_portal_session = W.TABLES.gc_portal_session || [];
W.TABLES.gc_portal_session.push({ id: W.sha(sessTok), kind: 'customer', links: [S.link], ident: null, revoked: false, expires_at: new Date(Date.now() + 864e5).toISOString(), created_at: new Date().toISOString() });
const SESS = { 'x-portal-session': sessTok }, TOK = { 'x-portal-token': S.link };

/* the job has a superintendent (a staff user) */
const SUP = { id: 'U9', name: 'Sam Super', email: 'super.sample@grayco-cs.com', phone: '901-555-0161', role: 'Superintendent', active: true };
W.put('users', W.get('users').concat([SUP]));
const jobs = W.get('projects'); jobs.find(x => x.id === S.pid).superintendent = SUP.name; W.put('projects', jobs);
/* someone else's record on another job + one more on this job: must survive */
const before = W.get('projectDocs'); W.put('projectDocs', before.concat([{ id: 'DOTHER_JOB', pid: S.other, name: 'Other job paper.pdf', cat: 'Contracts', ref: W.storeFile(W.pdfOf('Other'), 'pdf', 'application/pdf'), portalShare: false }]));
const n0 = W.get('projectDocs').length;

const PA = require(FN + '/portal-access.js');
const told = []; PA._portalpol.CMN.run = async (who, b) => { told.push({ who, b }); return { ok: true, to: [{ email: 'staff@grayco-cs.com' }] }; };

async function send(hd, files, extra){
  const out = [];
  for (const f of files) {
    const hash = W.sha(f.bytes);
    const r = await W.handlerCall('portal-access', Object.assign({ action: 'c-docs-url', hash, type: f.type, size: f.size || f.bytes.length, name: f.name }, extra || {}), hd);
    if (!r.data.ok) return { step: 'url', r };
    if (!r.data.exists) { const put = await globalThis.fetch(r.data.url, { method: 'PUT', headers: { 'Content-Type': r.data.type, 'x-upsert': 'false', apikey: r.data.apikey }, body: f.bytes }); if (!put.ok) return { step: 'put' }; }
    out.push({ path: r.data.path, name: f.name, size: f.bytes.length });
  }
  const r = await W.handlerCall('portal-access', Object.assign({ action: 'c-docs-up', files: out, note: (extra && extra.note) || '' }, extra || {}), hd);
  return { step: 'up', r, out };
}
const PDF = W.pdfOf('Signed change order #3', ['Signed by Sample Customer']);
const JPG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 0x4A, 0x46, 0x49, 0x46, 0]), crypto.randomBytes(2000)]);

console.log('1. a signed-in customer sends 2 papers on their job');
const mails0 = W.RESEND.length, msgs0 = (W.TABLES.gc_portal_msg || []).length, calls0 = W.CALLS.length;
let res = await send(SESS, [{ name: 'Change order 3 - signed.pdf', type: 'application/pdf', bytes: PDF }, { name: 'IMG_2041.jpg', type: 'image/jpeg', bytes: JPG }], { projectId: S.pid });
ok(res.step === 'up' && res.r.status === 200 && res.r.data.ok && res.r.data.sent === 2, 'c-docs-up: 2 sent', res.r && res.r.data);
const all = W.get('projectDocs'), mine = all.filter(d => d.source === 'customer-portal');
ok(mine.length === 2 && mine.every(d => d.pid === S.pid), '2 projectDocs records, both on this job', mine.map(d => d.pid));
ok(mine.every(d => /^sb:crm-files\/[0-9a-f]{64}\.(pdf|jpg)$/.test(d.ref) && W.FILES[d.ref.slice('sb:crm-files/'.length)]), 'each has a crm-files storage ref (the file is in the bucket)', mine.map(d => d.ref));
ok(!/base64|"data"\s*:|data:application|data:image/.test(JSON.stringify(mine)) && mine.every(d => d.data === undefined), 'no file bytes / base64 in gc_kv');
ok(mine.every(d => d.portalShare === true && d.portalLive === true && d.fromCustomer === true && d.uploadedAt && d.size > 0 && d.type), 'portalShare + portalLive + fromCustomer, uploadedAt / size / type', mine);
ok(mine.find(d => /\.pdf$/.test(d.name)).cat === 'Contracts' && mine.find(d => /\.jpg$/.test(d.name)).cat === 'Other', 'category: the signed PDF → Contracts, a plain photo → Other', mine.map(d => d.cat));
ok(all.length === n0 + 2 && all.some(d => d.id === 'DOTHER_JOB') && before.every(b => all.some(d => d.id === b.id)), 'nobody else\'s record dropped (read-merge-write)', { n0, n: all.length });

console.log('2. the job\'s superintendent is told; nothing to the customer');
const t = told[0] || { b: {} };
ok(told.length === 1 && t.b.pid === S.pid && /^📤 Sample sent 2 signed documents for /.test(t.b.head) && Array.isArray(t.b.tags) && t.b.tags[0] === SUP.name && res.r.data.staffTold === true, 'staff notice: "📤 Sample sent 2 signed documents for <job>", tagged to the superintendent', t.b);
const J = require(FN + '/_lib/jobmsgnotify.js');
const R = J.recipients({ pid: S.pid, text: t.b.text, tags: t.b.tags }, { users: W.get('users'), projects: W.get('projects') }, { email: 'customer@portal.invalid' });
ok(R.list.length === 1 && R.list[0].email === SUP.email, 'the notifier routes it to the superintendent', R);
ok(/IMG_2041\.jpg/.test(t.b.text) && !/^💬 Portal:/.test(t.b.text), 'the notice lists the files', t.b.text);
ok(W.RESEND.length === mails0 && !W.CALLS.slice(calls0).some(x => /twilio|resend/i.test(x)) && (W.TABLES.gc_portal_msg || []).length === msgs0, 'no e-mail, text or portal message to the customer');
/* no superintendent → the PM (no tags: the notifier's own PM rule) */
{ const js = W.get('projects'); delete js.find(x => x.id === S.pid).superintendent; W.put('projects', js); W.resetCaches(); }
res = await send(TOK, [{ name: 'Contract page 2.heic', type: 'image/heic', bytes: Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), crypto.randomBytes(400)]) }], { projectId: S.pid, note: 'signed contract, page 2' });
const t2 = told[1] || { b: {} };
const R2 = J.recipients({ pid: S.pid, text: t2.b.text, tags: t2.b.tags }, { users: W.get('users'), projects: W.get('projects') }, { email: 'customer@portal.invalid' });
ok(res.r && res.r.data.ok && res.r.data.sent === 1 && !t2.b.tags && R2.list[0] && R2.list[0].email === S.pm.email && /sent 1 signed document for/.test(t2.b.head), 'no superintendent → the job\'s PM; a HEIC photo works (the link too)', { d: res.r && res.r.data, R2 });
ok(W.get('projectDocs').find(d => /\.heic$/.test(d.name)).cat === 'Contracts', 'a photo whose note says "signed contract" → Contracts');
/* the same file again: not filed twice */
res = await send(SESS, [{ name: 'Change order 3 - signed.pdf', type: 'application/pdf', bytes: PDF }], { projectId: S.pid });
ok(res.r.data.ok && res.r.data.sent === 0 && res.r.data.already === 1 && told.length === 2 && W.get('projectDocs').length === n0 + 3, 'the same paper twice: filed once, nobody told again', res.r.data);

console.log('3. the files show back in their portal');
W.resetCaches(); PA._core._reset();
let v = await W.handlerCall('portal', { action: 'view', projectId: S.pid }, SESS);
if (!(v.data && v.data.ok)) v = await W.handlerCall('portal', { action: 'view' }, TOK);
const by = (v.data.docs || []).filter(d => d.byYou);
ok(v.status === 200 && by.length === 3 && by.some(d => /Change order 3 - signed/.test(d.title) && d.type === 'pdf') && by.some(d => d.type === 'image') && by.every(d => /^https:/.test(d.url)), 'Documents lists them, marked byYou, with a signed link', (v.data.docs || []).map(d => [d.title, d.byYou, d.type]));
ok(!(v.data.docs || []).some(d => /Other job paper/.test(d.title)), 'nothing of the other job');

console.log('4. refused politely');
let r = await W.handlerCall('portal-access', { action: 'c-docs-url', projectId: S.other, hash: W.sha('x'), type: 'application/pdf', size: 100, name: 'x.pdf' }, SESS);
ok(r.status === 404 || r.status === 403, 'another customer\'s job: refused (as every c- action: not their job)', r);
r = await W.handlerCall('portal-access', { action: 'c-docs-up', projectId: S.other, files: [{ path: mine[0].ref.slice(13), name: 'x.pdf' }] }, SESS);
ok((r.status === 404 || r.status === 403) && !W.get('projectDocs').some(d => d.pid === S.other && d.source === 'customer-portal'), 'c-docs-up on another job: refused, nothing filed there', r.status);
r = await W.handlerCall('portal-access', { action: 'c-docs-url', projectId: S.pid, hash: W.sha('big'), type: 'application/pdf', size: 26 * 1024 * 1024, name: 'scan.pdf' }, SESS);
ok(r.status === 413 && /25 MB/.test(r.data.error), 'too big (26 MB): 413 "25 MB at most"', r.data);
r = await W.handlerCall('portal-access', { action: 'c-docs-url', projectId: S.pid, hash: W.sha('zip'), type: 'application/zip', size: 1000, name: 'a.zip' }, SESS);
ok(r.status === 415 && /PDF, a photo/.test(r.data.error), 'wrong kind (zip): 415 with what to send', r.data);
const fake = Buffer.from('this is not a pdf at all, just text pretending'); W.FILES[W.sha(fake) + '.pdf'] = { bytes: fake, type: 'application/pdf' };
const n1 = W.get('projectDocs').length;
r = await W.handlerCall('portal-access', { action: 'c-docs-up', projectId: S.pid, files: [{ path: W.sha(fake) + '.pdf', name: 'fake.pdf', size: fake.length }] }, SESS);
ok(r.status === 415 && W.get('projectDocs').length === n1, 'a file that is not really a PDF: 415, nothing filed', r.data);
r = await W.handlerCall('portal-access', { action: 'c-docs-up', projectId: S.pid, files: [{ path: 'a'.repeat(64) + '.pdf', name: 'gone.pdf' }] }, SESS);
ok(r.status === 409 && /did not arrive/.test(r.data.error), 'a file that never arrived: 409 "try again"', r.data);
r = await W.handlerCall('portal-access', { action: 'c-docs-up', projectId: S.pid, files: [{ path: '../../etc/passwd', name: 'x' }] }, SESS);
ok(r.status === 400, 'a bad path: 400');
r = await W.handlerCall('portal-access', { action: 'c-docs-up', projectId: S.pid, files: [] }, SESS);
ok(r.status === 400 && /Pick/.test(r.data.error), 'no files: 400 "Pick the papers to send."');
r = await W.handlerCall('portal-access', { action: 'c-docs-up', projectId: S.pid, files: [{ path: mine[0].ref.slice(13), name: 'x.pdf' }], preview: true }, TOK);
ok(r.status === 400 && /preview/i.test(r.data.error), 'a staff preview cannot send');
r = await W.handlerCall('portal-access', { action: 'c-docs-up', projectId: S.pid, files: [] }, {});
ok(r.status === 404, 'nobody signed in: not active (404)');
/* a Word file (.docx) and a .doc pass */
res = await send(SESS, [{ name: 'Signed addendum.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: Buffer.concat([Buffer.from([0x50, 0x4B, 3, 4]), crypto.randomBytes(300)]) }], { projectId: S.pid });
ok(res.r && res.r.data.ok && res.r.data.sent === 1 && W.get('projectDocs').some(d => /\.docx$/.test(d.ref) && d.fromCustomer), 'a Word file (.docx) is accepted', res.r && res.r.data);

console.log('5. the portal page');
const html = fs.readFileSync(path.join(build, 'portal.html'), 'utf8');
const seg = html.slice(html.indexOf('patch CUSTSIGNED (owner 11/26)'), html.indexOf('function docs1()'));
ok(/function docs\(\)\{ return docs1\(\)\.concat\(\[(generalBox\(\), )?signedBox\(\)\]\)/.test(html) && /Send us your signed documents/.test(seg) && /Envíenos sus documentos firmados/.test(seg), 'the 📤 box is on Documents (English + Spanish)');
ok(/c-docs-url/.test(seg) && /c-docs-up/.test(seg) && /capture: cam \? 'environment'/.test(seg) && /multiple/.test(seg) && /\.heic/.test(seg) && /\.docx/.test(seg), 'phone camera, several files, HEIC and Word in the picker; the two server steps');
ok(!/\balert\(|\bconfirm\(|window\.open\(/.test(seg), 'no alert / confirm / pop-up window');
ok(/✓ Sent — GrayCo has them/.test(seg) && /Sent by you/.test(seg) && /d\.byYou \? cs\('byYou'\)/.test(html), '"✓ Sent — GrayCo has them" and "Sent by you" in the list');
ok(/APP_JS = '\/portal-app\.js\?v=33\.358-custsigned'/.test(html), 'APP_JS ?v= bumped');
{ const m = html.match(/<script>([\s\S]*?)<\/script>/g) || []; let bad = 0; m.forEach(x => { try { new Function(x.replace(/^<script>|<\/script>$/g, '')); } catch (e) { bad++; console.log('    syntax: ' + e.message); } }); ok(bad === 0, 'portal.html inline scripts parse (' + m.length + ')'); }

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
