/* patch SUBPORTAL3 — node tools/tests/test_SUBPORTAL3.mjs (made-up subs, jobs and photos only; offline)
   · the photo rule: a sub sees EVERY photo of their job (GrayCo uploads the customer does or does not see, Damage, CompanyCam new or
     old) except one marked "Hidden from subs"; the customer's rule is unchanged
   · p-photos (portal-access): GrayCo Photos + CompanyCam + the sub's own portal photos, thumbnails for the grid, no notes / names /
     flags; another sub's job → 404
   · p-job: plans / drawings / specs and files shared with subs; never the proposal, the claim letter or a file hidden from subs;
     the job name never carries the carrier or a claim number (_lib/subsafe.js)
   · sub-photos upload keeps the phone's small copy (thumbRef) and says who added it; the photos code lists the portal's jobs
   · netlify.toml: on portal.grayco-cs.com and bids.grayco-cs.com every file their pages load is served (not swallowed by a catch-all)
   · tools/patch_SUBPORTAL3.py applies to origin's index.html once, then says "already patched" */
import { createRequire } from 'module'; import path from 'path'; import fs from 'fs'; import os from 'os'; import crypto from 'crypto';
import { execFileSync } from 'child_process'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = path.join(ROOT, 'netlify/functions');
process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_KEY = 'svc-key-test'; process.env.PORTAL_MAIL_OFF = '1';
delete process.env.RESEND_API_KEY; delete process.env.COMPANYCAM_TOKEN;
let pass = 0, fail = 0;
async function t(name, fn){ try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e && e.message ? e.message.slice(0, 400) : e); } }
function eq(a, b, m){ if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
function yes(c, m){ if (!c) throw new Error(m || 'expected true'); }
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const R = i => 'sb:crm-files/' + sha('pic' + i) + '.jpg', TH = i => 'sb:crm-files/' + sha('thumb' + i) + '.jpg';

const SS = require(path.join(FN, '_lib/subsafe.js'));
await t('subsafe: the carrier and the claim number never reach a sub; ordinary names unchanged', () => {
  eq(SS.clean('Everett Stephens Roof Damage-Grange Insurance claim #ZHM003927535 '), 'Everett Stephens Roof Damage');
  eq(SS.clean('Alex Thomas — Water Damage (3565 Evening Light Dr) Claim #10000833553'), 'Alex Thomas — Water Damage (3565 Evening Light Dr)');
  eq(SS.clean('Smith Roof - State Farm'), 'Smith Roof');
  eq(SS.clean('Pat Kitchen for Acme Mutual Insurance', { insCarrier: 'Acme Mutual Insurance' }), 'Pat Kitchen for');
  eq(SS.clean('Lee Bath CLM-55-123', { claimNumber: 'CLM-55-123' }), 'Lee Bath');
  ['Sample Kitchen Remodel', 'MSR — Water Damage Claim (3417 Renault St)', 'Lot 14 Phase 2 Bldg 3', '123 Sample St, Memphis, TN 38117', 'EAN Holdings- 600 W. Church St.'].forEach(n => eq(SS.clean(n), n));
});

const SPH = require(path.join(FN, 'sub-photos.js'))._core, CV = require(path.join(FN, '_lib/cc-vis.js'));
await t('the rule: subs see every photo but "Hidden from subs"; the customer sees CompanyCam photos by default (CUSTPORTAL)', () => {
  eq([SPH.subsOf({ shared: true }), SPH.subsOf({ shared: false }), SPH.subsOf({ tag: 'Damage' }), SPH.subsOf({ shared: false, hideSubs: false }), SPH.subsOf({ shared: true, hideSubs: true })], [true, true, true, true, false]);
  eq(SPH.subsOf({ source: 'companycam' }, { hideSubs: true }), false); eq(SPH.subsOf({ source: 'companycam' }, { shared: false }), true);
  eq([SPH.custOf({ shared: true }), SPH.custOf({ shared: false }), SPH.custOf({ tag: 'Damage' }), SPH.custOf({ source: 'sub', shared: true }), SPH.custOf({ source: 'sub', shared: true, custOkBy: 'Office' })], [true, false, false, false, true]);
  const since = 1000000, ix = CV.index([{ id: 'ccf_5', source: 'ccflag', ccId: '5', hideSubs: true }, { id: 'ccf_6', source: 'ccflag', ccId: '6', shared: false }]);
  eq([CV.subsSee('1', since + 50, 'J', ix, since), CV.subsSee('1', since - 50, 'J', ix, since), CV.subsSee('5', 1, 'J', ix, since), CV.subsSee('6', 1, 'J', ix, since)], [true, true, false, true]);
  eq(CV.customerSees('1', since + 50, 'J', ix, since), true);   /* patch CUSTPORTAL: the customer now sees a CompanyCam photo by default (was: a new one waits) */
});

/* ── an in-memory Supabase ── */
const SUB = { id: 'S1', name: 'Sample Drywall LLC', company: 'Sample Drywall LLC', contact: 'Sam Sample', email: 'sam@sample.test', phone: '901-555-0141', isSub: true };
const SUB2 = { id: 'S2', name: 'Other Paint Co', company: 'Other Paint Co', email: 'o@other.test', isSub: true };
const P1 = { id: 'P1', name: 'Pat Sample Kitchen - Acme Mutual Insurance claim #CLM99887766', address: '123 Sample St, Memphis, TN 38117', client: 'Pat Sample', clientPhone: '901-555-0190', pm: 'Sample PM',
  status: 'Active', contract: 48250, insCarrier: 'Acme Mutual Insurance', claimNumber: 'CLM99887766', ccProjectId: '7001', subs: [{ subId: 'S1', name: SUB.name, status: 'Awarded', price: 6400 }, { subId: 'S2', name: SUB2.name, price: 3900 }] };
const P2 = { id: 'P2', name: 'Other Bath', address: '9 Other Ave', client: 'Lee', status: 'Active', subs: [{ subId: 'S2', name: SUB2.name }] };
const KV = { projects: [P1, P2], vendors: [SUB, SUB2], users: [{ name: 'Sample PM', phone: '901-555-0100', email: 'pm@grayco.test', active: true }], gc_sub_portal_settings: { invPhotoMin: 0 },
  gc_photos: [
    { id: 'a', jobId: 'P1', ref: R(1), thumbRef: TH(1), shared: true, at: '2026-10-01T10:00:00Z', note: 'NOTE-A', by: 'Sample PM' },
    { id: 'b', jobId: 'P1', ref: R(2), thumbRef: TH(2), shared: false, at: '2026-10-02T10:00:00Z', note: 'NOTE-B' },
    { id: 'c', jobId: 'P1', ref: R(3), thumbRef: TH(3), tag: 'Damage', at: '2026-10-03T10:00:00Z' },
    { id: 'd', jobId: 'P1', ref: R(4), thumbRef: TH(4), shared: true, hideSubs: true, at: '2026-10-04T10:00:00Z' },
    { id: 'e', jobId: 'P2', ref: R(5), thumbRef: TH(5), shared: true, at: '2026-10-05T10:00:00Z' }],
  ccvis: { since: new Date(Date.now() - 30 * 864e5).toISOString() },
  'ccidx:7001': { done: true, ph: [['901', Math.floor(Date.now() / 1000) - 86400, 'https://img.companycam.com/w/901.jpg', 'https://img.companycam.com/t/901.jpg', 0, '', '', Math.floor(Date.now() / 1000) - 86400]], g: {} },
  projectDocs: [
    { id: 'D1', pid: 'P1', name: 'Kitchen plans A1-A3.pdf', cat: 'Plans/Drawings', type: 'application/pdf', ref: R(10) },
    { id: 'D2', pid: 'P1', name: 'Proposal.pdf', cat: 'Proposals', ref: R(11), portalShare: true },
    { id: 'D3', pid: 'P1', name: 'Acme claim letter.pdf', cat: 'Insurance', ref: R(12) },
    { id: 'D4', pid: 'P1', name: 'Cabinet spec sheet.pdf', cat: 'Specs/Other', ref: R(13), hideFromSubs: true },
    { id: 'D5', pid: 'P1', name: 'Tile pick.pdf', cat: 'Other', ref: R(14), shareSubs: true },
    { id: 'D6', pid: 'P2', name: 'Other plans.pdf', cat: 'Plans/Drawings', ref: R(15) }] };
const now = new Date().toISOString();
const T = { gc_portal_session: [{ id: sha('S'.repeat(43)), kind: 'partner', sub_id: 'S1', links: ['L'.repeat(43)], expires_at: new Date(Date.now() + 864e5).toISOString() }],
  gc_sub_link: [{ token: 'L'.repeat(43), sub_id: 'S1', revoked: false }], gc_sub_scope: [], gc_portal_msg: [], sp_rows: [], gc_sub_portal: [], gc_portal_code: [],
  gc_sub_event: [{ id: 'E1', kind: 'photos', project_id: 'P1', sub_id: 'S1', created_at: now, data: { files: [{ ref: R(20), type: 'image/jpeg', name: 'mine.jpg' }, { ref: R(2), type: 'image/jpeg' }] } }] };
const STORED = [];
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => { const b = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } });
const BUCKET = new Map();
const val = v => decodeURIComponent(String(v || '')).replace(/^eq\./, '');
const inl = v => decodeURIComponent(String(v || '')).replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
global.fetch = async (url, init) => {
  init = init || {}; const u = new URL(url), q = u.searchParams, m = (init.method || 'GET').toUpperCase();
  if (u.host !== 'sb.test') return res(404, {});
  if (u.pathname === '/rest/v1/gc_kv') {
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(x => { KV[x.key] = x.value; }); return res(201, null); }
    const k = q.get('key') || ''; const keys = k.startsWith('in.') ? inl(k) : [val(k)];
    return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: KV[x], updated_at: 'T0' })));
  }
  const tm = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
  if (tm && T[tm[1]]) {
    const tb = T[tm[1]];
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => tb.push(Object.assign({ created_at: now }, r))); return res(201, []); }
    let rows = tb.slice();
    for (const [k, v] of q.entries()) {
      if (['select', 'order', 'limit'].includes(k)) continue;
      if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === val(v));
      else if (v.startsWith('in.')) rows = rows.filter(r => inl(v).includes(String(r[k])));
      else if (v.startsWith('gt.')) rows = rows.filter(r => String(r[k]) > decodeURIComponent(v.slice(3)));
      else if (v === 'is.null') rows = rows.filter(r => r[k] == null);
    }
    if (m === 'PATCH') { const b = JSON.parse(init.body); rows.forEach(r => Object.assign(r, b)); return res(200, rows); }
    return res(200, rows);
  }
  if (u.pathname.startsWith('/storage/v1/object/sign/')) { const b = JSON.parse(init.body); return res(200, b.paths.map(p => ({ path: p, signedURL: '/object/sign/crm-files/' + p + '?token=t' }))); }
  if (u.pathname.startsWith('/storage/v1/object/upload/sign/crm-files/')) { const n = u.pathname.split('/').pop(); if (BUCKET.has(n)) return res(400, { message: 'The resource already exists' }); return res(200, { url: '/object/upload/sign/crm-files/' + n + '?token=tok' }); }
  if (u.pathname.startsWith('/storage/v1/object/crm-files/') && m === 'GET') { const b = BUCKET.get(u.pathname.split('/').pop()); return b ? res(206, b.slice(0, 64)) : res(404, {}); }
  if (u.pathname.startsWith('/storage/v1/object/crm-files/')) { STORED.push(u.pathname.split('/').pop()); return res(200, {}); }
  return res(404, {});
};
const PA = require(path.join(FN, 'portal-access.js'));
const call = async (action, body) => { const r = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.grayco-cs.com', 'x-portal-session': 'S'.repeat(43), 'x-nf-client-connection-ip': '10.1.1.1' }, body: JSON.stringify(Object.assign({ action }, body || {})) }); return { code: r.statusCode, j: JSON.parse(r.body), raw: r.body }; };
const signedOf = ref => 'https://sb.test/storage/v1/object/sign/crm-files/' + ref.replace('sb:crm-files/', '') + '?token=t';

await t('p-photos: GrayCo uploads (customer sees it or not, Damage) + CompanyCam + the sub\'s own — never "Hidden from subs" or another job\'s', async () => {
  const r = await call('p-photos', { projectId: 'P1' }); eq(r.code, 200);
  const f = r.j.photos.map(x => x.f);
  [1, 2, 3].forEach(i => yes(f.includes(signedOf(R(i))), 'GrayCo photo ' + i));
  yes(f.includes('https://img.companycam.com/w/901.jpg'), 'the CompanyCam photo (new, nobody clicked it)');
  yes(f.includes(signedOf(R(20))), 'the sub\'s own portal photo');
  yes(!f.includes(signedOf(R(4))) && !f.includes(signedOf(R(5))), 'hidden from subs / another job');
  eq(f.filter(x => x === signedOf(R(2))).length, 1, 'a photo in GrayCo Photos and in the sub\'s event is listed once');
  const g = r.j.photos.find(x => x.f === signedOf(R(1))); eq(g.t, signedOf(TH(1)), 'the grid gets the thumbnail');
  yes(!/NOTE-|Sample PM|"shared"|"note"|hideSubs/.test(r.raw), 'no notes / names / flags');
  const sorted = r.j.photos.map(x => x.at); eq(sorted, sorted.slice().sort().reverse(), 'newest first');
});
await t('another sub\'s job: p-photos / p-job 404', async () => { eq((await call('p-photos', { projectId: 'P2' })).code, 404); eq((await call('p-job', { projectId: 'P2' })).code, 404); });
await t('p-job: plans & documents for subs (Plans/Drawings + shared with subs), never the proposal / claim letter / hidden file', async () => {
  const r = await call('p-job', { projectId: 'P1' }); eq(r.code, 200);
  eq(r.j.docs.map(d => d.name).sort(), ['Kitchen plans A1-A3.pdf', 'Tile pick.pdf']);
  yes(r.j.docs.every(d => /^https:\/\/sb\.test\/storage\/v1\/object\/sign\/crm-files\//.test(d.url)));
});
await t('p-job / p-home: the job name without the carrier or the claim #, no contract amount, no other sub\'s price', async () => {
  const r = await call('p-job', { projectId: 'P1' }), h = await call('p-home');
  eq(r.j.job.name, 'Pat Sample Kitchen');
  for (const x of [r.raw, h.raw]) yes(!/Acme|CLM99887766|48250|3900|Other Paint|insCarrier|claimNumber|"contract"/.test(x), x.slice(0, 300));
  eq(h.j.jobs.map(j => j.name), ['Pat Sample Kitchen']);
  yes(/901-555-0190/.test(r.raw) && /Sample PM/.test(r.raw), 'the customer phone and the PM are there');
});
await t('the photos code lists the jobs the portal gives this sub; sub-photos upload keeps the small copy and says who added it', async () => {
  const c = await call('p-photos-code'); eq(c.code, 200); yes(/^[A-Za-z0-9_-]{43}$/.test(c.j.code));
  eq(T.gc_sub_portal[0].job_ids, ['P1']);
  SPH.CHECK_MS = 1; SPH._reset();
  const big = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), crypto.randomBytes(5000)]), small = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), crypto.randomBytes(300)]);
  const H = require(path.join(FN, 'sub-photos.js')).handler;
  const up = await H({ httpMethod: 'POST', headers: { origin: 'https://portal.grayco-cs.com', 'x-sub-token': c.j.code, 'x-nf-client-connection-ip': '10.2.2.2' }, body: JSON.stringify({ action: 'upload', jobId: 'P1', name: 'a.jpg', data: big.toString('base64'), thumb: small.toString('base64'), tag: 'During' }) });
  eq(up.statusCode, 200, up.body);
  const rec = KV.gc_photos.find(x => x.source === 'sub');
  eq([rec.ref, rec.thumbRef, rec.by, rec.subCompany, rec.shared], ['sb:crm-files/' + sha(big) + '.jpg', 'sb:crm-files/' + sha(small) + '.jpg', 'Sample Drywall LLC (sub)', 'Sample Drywall LLC', false]);
  yes(STORED.includes(sha(small) + '.jpg'));
  const up2 = await H({ httpMethod: 'POST', headers: { origin: 'https://portal.grayco-cs.com', 'x-sub-token': c.j.code, 'x-nf-client-connection-ip': '10.2.2.3' }, body: JSON.stringify({ action: 'upload', jobId: 'P2', name: 'b.jpg', data: big.toString('base64') }) });
  eq(up2.statusCode, 404, 'not the other sub\'s job');
});
await t('an invoice PDF up to 15 MB: a one-time upload link (never over a stored file), checked as a PDF, then on the invoice', async () => {
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), crypto.randomBytes(9 * 1024 * 1024)]), h = sha(pdf);
  eq((await call('p-upload-url', { hash: h, type: 'application/pdf', size: 16 * 1024 * 1024 })).code, 413, '16 MB');
  eq((await call('p-upload-url', { hash: h, type: 'text/html', size: 100 })).code, 415, 'not a PDF / photo');
  eq((await call('p-upload-url', { hash: h, type: 'application/pdf', size: pdf.length, projectId: 'P2' })).code, 404, 'another sub\'s job');
  const u = await call('p-upload-url', { hash: h, type: 'application/pdf', size: pdf.length, projectId: 'P1' });
  eq(u.code, 200, u.raw); eq(u.j.path, h + '.pdf'); yes(/^https:\/\/sb\.test\/storage\/v1\/object\/upload\/sign\/crm-files\/[0-9a-f]{64}\.pdf\?token=/.test(u.j.url), u.j.url); yes(/^eyJ/.test(u.j.apikey), 'the public anon key for the gateway');
  eq((await call('p-upload-done', { path: u.j.path, projectId: 'P1', name: 'inv.pdf' })).code, 409, 'nothing stored yet');
  BUCKET.set(h + '.pdf', pdf);                                         /* the phone's PUT */
  const again = await call('p-upload-url', { hash: h, type: 'application/pdf', size: pdf.length, projectId: 'P1' }); eq(again.j.exists, true, 'a stored file is never overwritten');
  const d = await call('p-upload-done', { path: u.j.path, projectId: 'P1', name: 'Sample invoice.pdf', size: pdf.length, purpose: 'invoice' }); eq(d.code, 200, d.raw);
  const fake = crypto.randomBytes(2000), fh = sha(fake); BUCKET.set(fh + '.pdf', fake);
  eq((await call('p-upload-done', { path: fh + '.pdf', projectId: 'P1', name: 'x.pdf' })).code, 415, 'not really a PDF');
  const inv = await call('p-invoice', { projectId: 'P1', amount: '2750', invNum: 'SD-1003', uploadId: d.j.id }); eq(inv.code, 200, inv.raw);
  const ev = T.gc_sub_event.find(e => e.kind === 'invoice');
  eq([ev.data.amount, ev.data.files.length, ev.data.files[0].ref, ev.data.files[0].type, ev.data.files[0].name], [2750, 1, 'sb:crm-files/' + h + '.pdf', 'application/pdf', 'Sample invoice.pdf']);
  const up = T.gc_sub_event.find(e => e.id === d.j.id); eq(up.data.uploadedBy, 'Uploaded by Sample Drywall LLC (sub)');
});
await t('portal.html lets the page reach the file storage host (CSP connect-src) and nothing else new', () => {
  const html = fs.readFileSync(path.join(ROOT, 'portal.html'), 'utf8'), csp = (/Content-Security-Policy" content="([^"]+)"/.exec(html) || [])[1] || '';
  yes(/connect-src 'self' https:\/\/ieeonhpfahmwwecizdut\.supabase\.co;/.test(csp), csp);
});
await t('the functions keep the data-entry pause hook', () => {
  for (const f of ['portal-access.js', 'sub-photos.js']) yes(/require\('\.\/_lib\/pause'\)\.install\(\)/.test(fs.readFileSync(path.join(FN, f), 'utf8')), f);
});

/* ── netlify.toml: what the portal / bid site pages load is served on their host ── */
await t('netlify.toml parses; portal.grayco-cs.com and bids.grayco-cs.com serve every file their pages load (no catch-all swallows one)', () => {
  const rules = JSON.parse(execFileSync('python3', ['-c', 'import tomllib,json,sys; print(json.dumps(tomllib.load(open(sys.argv[1],"rb")).get("redirects",[])))', path.join(ROOT, 'netlify.toml')]).toString());
  function first(host, p){ return rules.find(r => { const f = r.from; if (/^https?:/.test(f)) { const u = new URL(f.replace('*', '__STAR__')); if (u.host !== host) return false; const fp = u.pathname.replace('__STAR__', '*'); return fp.endsWith('*') ? p.startsWith(fp.slice(0, -1)) : fp === p; } if (f.endsWith('*')) return p.startsWith(f.slice(0, -1)); return f === p; }); }
  const refs = (file, base) => { const t = fs.readFileSync(path.join(ROOT, file), 'utf8'); return Array.from(t.matchAll(/(?:src|href)=["']([^"'#:?]+\.(?:js|css|png|jpg|webmanifest|html))/g)).map(m => m[1]).filter(x => !/^\/\//.test(x)).map(x => x.startsWith('/') ? x : (base || '/') + x.replace(/^\.\//, '')); };
  const portalPages = ['portal.html', 'portal-terms.html', 'sub-terms.html', 'sub-privacy.html', 'esign-consent.html', 'privacy.html', 'terms.html', 'report.html'];
  const want = new Set(['/portal-app.js', '/portal-logo.png', '/legal2.js']);
  portalPages.forEach(pg => { want.add('/' + pg); refs(pg).forEach(x => want.add(x)); });
  const bad = [];
  want.forEach(p => { const r = first('portal.grayco-cs.com', p); if (r && r.status === 200 && r.to === '/portal.html' && p !== '/portal.html') bad.push('portal ' + p); else if (r && r.status === 404) bad.push('portal 404 ' + p); if (!fs.existsSync(path.join(ROOT, p))) bad.push('missing file ' + p); });
  const bidLegal = ['/sub-terms.html', '/sub-privacy.html', '/esign-consent.html', '/privacy.html', '/terms.html', '/portal-terms.html', '/mkt-pages.css', '/img/grayco-logo-white.png'];
  bidLegal.forEach(p => { const r = first('bids.grayco-cs.com', p); if (!r || r.to !== p) bad.push('bids ' + p + ' → ' + (r && r.to)); });
  ['/', '/assets/x.js', '/legal2.js'].forEach(p => { const r = first('bids.grayco-cs.com', p); if (!r || !/^\/subportal\//.test(r.to)) bad.push('bids app ' + p); });
  eq(bad, []);
});
await t('tools/patch_SUBPORTAL3.py: applies to origin/main\'s index.html once, then "already patched"; the page matches the patched one', () => {
  let src = ''; try { src = execFileSync('git', ['-C', ROOT, 'show', '8264ddc:index.html'], { maxBuffer: 1 << 30 }).toString(); } catch (e) { console.log('     (8264ddc not here — skipped)'); return; }
  const tmp = path.join(os.tmpdir(), 'sp3_' + process.pid + '.html'); fs.writeFileSync(tmp, src);
  const a = execFileSync('python3', [path.join(ROOT, 'tools/patch_SUBPORTAL3.py'), tmp]).toString(), b = execFileSync('python3', [path.join(ROOT, 'tools/patch_SUBPORTAL3.py'), tmp]).toString();
  yes(/patched \(5 edits\)/.test(a) && /already patched/.test(b), a + b);
  const mine = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), got = fs.readFileSync(tmp, 'utf8'); fs.unlinkSync(tmp);
  yes(mine.indexOf('/* patch SUBPORTAL3 */') > 0 && got.indexOf('/* patch SUBPORTAL3 */') > 0);
  const blk = got.slice(got.lastIndexOf('<script', got.indexOf('/* patch SUBPORTAL3 */')), got.indexOf('</script>', got.indexOf('/* patch SUBPORTAL3 */')));
  new Function(blk.slice(blk.indexOf('>') + 1));   /* the patched script still parses */
});
console.log('\nSUBPORTAL3: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
