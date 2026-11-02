/* custportal_world.mjs — the customer portal's offline world (patch CUSTPORTAL), shared by test_CUSTPORTAL_E2E.mjs and
   custportal_preview.mjs. NOTHING leaves this computer: every Supabase / Resend / CompanyCam call is answered by the in-memory
   fakes below; the REAL netlify functions run behind a local web server that applies netlify.toml's redirect rules for the
   host it is asked as (portal.grayco-cs.com), so a page or asset the catch-all would swallow shows up as a page error.
   The SAMPLE job is made up ("Sample Customer", 123 Sample St, Memphis TN). A real job from the mirror can be added
   (addMirror) — real data stays in memory, screenshots go to the scratch folder only. */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const FNDIR = path.join(ROOT, 'netlify/functions');
export const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
export const PW = process.env.PLAYWRIGHT_DIR || SP + '/node_modules/playwright/index.js';
export const SB_HOST = 'fake-custportal.supabase.co', SB = 'https://' + SB_HOST, CC_IMG = 'https://img.companycam.test';
export const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const tok = () => b64u(crypto.randomBytes(32));
export const sha = x => crypto.createHash('sha256').update(x).digest('hex');

/* ═════════ the clock: a running clock that says Monday 2026-11-02 noon Central (outside 7 PM–7 AM) ═════════ */
export const realNow = Date.now;
const OFF = realNow() - Date.parse('2026-11-02T18:00:00Z');
export function setDay(){ Date.now = () => realNow() - OFF; }
export function setAt(iso){ const o = realNow() - Date.parse(iso); Date.now = () => realNow() - o; }
setDay();

/* ═════════ the fake cloud ═════════ */
export const KV = {}, TABLES = {}, FILES = {}, RESEND = [], CALLS = [];
let tick = 0;
export function put(key, v){ KV[key] = { value: typeof v === 'string' ? v : JSON.stringify(v), at: new Date(Date.now() + (++tick)).toISOString() }; }
export function get(key){ const r = KV[key]; if (!r) return undefined; let v = r.value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; }
function T(name){ return TABLES[name] || (TABLES[name] = []); }
function res(status, body, hd){ return { ok: status < 400, status, json: async () => body, text: async () => typeof body === 'string' ? body : JSON.stringify(body), headers: { get: k => (hd || {})[String(k).toLowerCase()] || null }, arrayBuffer: async () => Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)) }; }
function unq(x){ return x.replace(/^"|"$/g, ''); }
function match(row, k, cond){
  const v = row[k]; const c = decodeURIComponent(cond);
  if (c.startsWith('eq.')) return String(v) === c.slice(3);
  if (c.startsWith('neq.')) return String(v) !== c.slice(4);
  if (c.startsWith('in.')) return c.slice(3).replace(/^\(|\)$/g, '').split(',').map(unq).includes(String(v));
  if (c === 'is.null') return v == null;
  if (c === 'not.is.null') return v != null;
  if (c.startsWith('gt.')) return v != null && String(v) > c.slice(3);
  if (c.startsWith('gte.')) return v != null && String(v) >= c.slice(4);
  if (c.startsWith('lt.')) return v != null && String(v) < c.slice(3);
  if (c.startsWith('lte.')) return v != null && String(v) <= c.slice(4);
  if (c.startsWith('cs.')) { const want = JSON.parse(c.slice(3)); return Array.isArray(v) && want.every(w => v.includes(w)); }
  if (c.startsWith('like.')) return String(v).startsWith(c.slice(5).replace(/\*$/, ''));
  return true;
}
const SKIP = ['select', 'order', 'limit', 'on_conflict', 'offset', 'columns'];
function filt(rows, u){ let out = rows; for (const [k, c] of u.searchParams) if (!SKIP.includes(k)) out = out.filter(r => match(r, k, c)); return out; }
function body(o){ if (o.body == null) return null; if (typeof o.body === 'string') { try { return JSON.parse(o.body); } catch (e) { return o.body; } } return o.body; }
export const STAFF_TOKENS = { 'Bearer good-pm': 'pm.sample@grayco-cs.com', 'Bearer good-admin': 'admin.sample@grayco-cs.com' };
globalThis.fetch = async (url, o) => {
  url = String(url); o = o || {}; const method = (o.method || 'GET').toUpperCase();
  await new Promise(r => setImmediate(r));
  const u = new URL(url);
  CALLS.push(method + ' ' + u.host + u.pathname);
  if (u.hostname === 'api.resend.com') { RESEND.push(body(o)); return res(200, { id: 'em_' + RESEND.length }); }
  if (u.hostname === 'api.companycam.com') return res(200, []);
  if (u.hostname !== SB_HOST) return res(404, {});
  const hd = o.headers || {};
  if (u.pathname === '/auth/v1/user') { const a = hd.Authorization || hd.authorization || ''; const e = STAFF_TOKENS[a]; return e ? res(200, { id: 'u', email: e }) : res(401, {}); }
  if (u.pathname.startsWith('/auth/v1/')) return res(400, { error: 'invalid_grant' });
  if (u.pathname.startsWith('/storage/v1/object/sign/')) { const b = body(o) || {}; return res(200, (b.paths || []).map(p => ({ path: p, signedURL: '/object/sign/crm-files/' + p + '?token=t' + sha(p).slice(0, 8) }))); }
  if (u.pathname.startsWith('/storage/v1/object/crm-files/')) {
    const name = u.pathname.slice('/storage/v1/object/crm-files/'.length);
    if (method === 'POST' || method === 'PUT') { const b = o.body; FILES[name] = { bytes: Buffer.isBuffer(b) ? b : (b instanceof Uint8Array ? Buffer.from(b) : Buffer.from(String(b))), type: hd['Content-Type'] || hd['content-type'] || '' }; return res(200, { Key: 'crm-files/' + name }); }
    return FILES[name] ? res(200, FILES[name].bytes) : res(404, {});
  }
  if (u.pathname.startsWith('/storage/')) return res(200, []);
  if (u.pathname === '/rest/v1/gc_kv') {
    if (method === 'POST') { const b = body(o); (Array.isArray(b) ? b : [b]).forEach(r => { if (/ignore-duplicates/.test(hd.Prefer || '') && KV[r.key]) return; put(r.key, r.value); }); return res(201, []); }
    if (method === 'PATCH') {
      const k = decodeURIComponent((u.searchParams.get('key') || '').slice(3)), at = decodeURIComponent((u.searchParams.get('updated_at') || '').slice(3));
      if (!KV[k] || (at && KV[k].at !== at)) return res(200, []);
      const b = body(o); put(k, b.value); return res(200, [{ key: k, updated_at: KV[k].at }]);
    }
    const kq = u.searchParams.get('key') || '';
    let keys = [];
    if (kq.startsWith('eq.')) keys = [decodeURIComponent(kq.slice(3))];
    else if (kq.startsWith('in.')) keys = decodeURIComponent(kq.slice(3)).replace(/^\(|\)$/g, '').split(',').map(unq);
    else if (kq.startsWith('like.')) { const pre = decodeURIComponent(kq.slice(5)).replace(/[*%]$/, ''); keys = Object.keys(KV).filter(k => k.startsWith(pre)); }
    return res(200, keys.filter(k => KV[k]).map(k => ({ key: k, value: KV[k].value, updated_at: KV[k].at })));
  }
  const tm = /^\/rest\/v1\/([a-z_0-9]+)$/.exec(u.pathname);
  if (tm) {
    const t = T(tm[1]);
    if (method === 'GET') { let rows = filt(t, u); const lim = +u.searchParams.get('limit'); const ord = u.searchParams.get('order'); if (ord) { const [c, d] = ord.split('.'); rows = rows.slice().sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : 1) * (d === 'desc' ? -1 : 1)); } return res(200, lim ? rows.slice(0, lim) : rows); }
    if (method === 'POST') {
      const b = body(o), oc = u.searchParams.get('on_conflict'), out = [];
      (Array.isArray(b) ? b : [b]).forEach(r => { const ex = oc ? t.find(x => String(x[oc]) === String(r[oc])) : null; if (ex) { if (!/ignore/.test(hd.Prefer || '')) Object.assign(ex, r); out.push(ex); } else { const n = Object.assign({ id: r.id != null ? r.id : crypto.randomUUID(), created_at: new Date(Date.now()).toISOString() }, r); t.push(n); out.push(n); } });
      return res(201, out);
    }
    if (method === 'PATCH') { const rows = filt(t, u), b = body(o); rows.forEach(r => Object.assign(r, b)); return res(200, rows); }
    if (method === 'DELETE') { const rows = filt(t, u); rows.forEach(r => t.splice(t.indexOf(r), 1)); return res(200, rows); }
  }
  return res(200, []);
};
Object.assign(process.env, { SUPABASE_URL: SB, SUPABASE_SERVICE_KEY: 'sb_secret_test_only', RESEND_API_KEY: 're_test_only', OWNER_EMAILS: 'admin.sample@grayco-cs.com', COMPANYCAM_TOKEN: 'cc_test_only' });
['PORTAL_MAIL_OFF', 'PORTAL_AUTO_EMAIL', 'URL', 'DEPLOY_PRIME_URL', 'ANTHROPIC_API_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'PORTAL_BASE_URL'].forEach(k => delete process.env[k]);

/* ═════════ sample files: real PDFs (the CRM's own PDF writer) and pictures ═════════ */
export function pdfOf(title, lines){
  const sel = require(FNDIR + '/selections.js')._sel;
  return sel.buildPdf([{ t: 'title', text: 'GrayCo Construction Services' }, { t: 'h', text: title }].concat((lines || []).map(x => ({ t: 'p', text: x }))));
}
/* an estimate PDF a PM made elsewhere and UPLOADED to the CRM ("📎 Upload the estimate I sent") — a picture-like scan, kept byte for byte */
let UPLOADED = null;
export function uploadedPdf(){
  if (UPLOADED) return UPLOADED;
  try { UPLOADED = execFileSync('convert', ['-size', '612x792', 'xc:#fdfcf7', '-fill', '#1a1a1a', '-pointsize', '26', '-draw', "text 60,110 'ESTIMATE #2051 - Fence & gate'", '-pointsize', '15', '-draw', "text 60,150 'Uploaded to the CRM as a PDF (made in another program)'", '-draw', "text 60,190 'Cedar privacy fence, 140 ft, one 4 ft gate ........ $6,850.00'", '-draw', "text 60,230 'Total: $6,850.00'", 'pdf:-']); }
  catch (e) { UPLOADED = pdfOf('Estimate #2051 — Fence & gate (uploaded PDF)', ['Cedar privacy fence, 140 ft, one 4 ft gate — $6,850.00']); }
  return UPLOADED;
}
export function storeFile(buf, ext, type){ const name = sha(buf) + '.' + ext; FILES[name] = { bytes: buf, type: type || '' }; return 'sb:crm-files/' + name; }
const PARKS = '/home/user/wt-tvfix/img/tv/parks';
export function pictures(n){
  const out = [], dir = fs.existsSync(PARKS) ? fs.readdirSync(PARKS).filter(f => /\.jpe?g$/i.test(f)).sort().map(f => path.join(PARKS, f)) : [];
  for (let i = 0; i < n; i++) {
    let full = null, thumb = null;
    const src = dir[i % Math.max(1, dir.length)];
    try {
      if (src) { full = fs.readFileSync(src); thumb = execFileSync('convert', [src, '-resize', '320x320>', '-quality', '70', 'jpg:-']); if (i >= dir.length) full = Buffer.concat([full, Buffer.from([i])]); }
      else { full = execFileSync('convert', ['-size', '1200x900', 'plasma:', '-quality', '80', 'jpg:-']); thumb = execFileSync('convert', ['-size', '320x240', 'plasma:', 'jpg:-']); }
    } catch (e) { full = fs.readFileSync(path.join(ROOT, 'portal-icon-512.png')); thumb = fs.readFileSync(path.join(ROOT, 'portal-icon-192.png')); }
    out.push({ full, thumb });
  }
  return out;
}

/* ═════════ the people, the SAMPLE job (made up) ═════════ */
export const S = {
  pid: 'PSAMPLE1', other: 'POTHER1', link: tok(), otherLink: tok(), ccId: '990001',
  customer: { id: 'CUSAMPLE', name: 'Sample Customer', firstName: 'Sample', email: 'sample.customer@example.com', phone: '901-555-0123', address: '123 Sample St, Memphis, TN 38103' },
  pm: { name: 'Dana Rivers', email: 'pm.sample@grayco-cs.com', phone: '901-555-0142' },
  carrier: 'Sample Mutual Insurance', sub: 'Ridgeline Framing LLC', subPrice: 8765.43, internal: 'INTERNAL NOTE margin 31%'
};
export function seedSample(opts){
  opts = opts || {};
  const pics = pictures(opts.photos || 11);
  const day = d => '2026-10-' + String(d).padStart(2, '0');
  const pdfs = {};
  /* the CRM's OWN papers for the sample job when custportal_crmdocs.mjs made them (est_simple.pdf: the estimate the CRM sends;
     est_p5.pdf: its 5-page proposal) — else a stand-in PDF */
  const CD = opts.crmDocs === false ? '' : (opts.crmDocs || process.env.CUSTPORTAL_CRMDOCS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/cp/crmdocs');
  const crmPdf = f => { try { const b = CD && fs.readFileSync(path.join(CD, f)); return b && b.slice(0, 5).toString('latin1') === '%PDF-' ? b : null; } catch (e) { return null; } };
  const BYTES = { DSAMPLE_EST: crmPdf('est_simple.pdf'), DSAMPLE_P5: crmPdf('est_p5.pdf'), DSAMPLE_UP: uploadedPdf() };
  const doc = (id, name, cat, extra, lines) => { const ref = storeFile(BYTES[id] || pdfOf(name.replace(/\.pdf$/, ''), lines || ['Job: Sample Customer — Roof & Kitchen', 'Address: ' + S.customer.address]), 'pdf', 'application/pdf'); pdfs[id] = ref;
    return Object.assign({ id, pid: S.pid, name, cat, ref, type: 'application/pdf', uploadedAt: day(20) + 'T15:00:00.000Z', portalShare: true }, extra || {}); };
  const docs = [
    doc('DSAMPLE_EST', 'Estimate #1042 — Kitchen remodel — sent ' + day(28) + '.pdf', 'Estimates', { estimateId: 'ESAMPLE1', sentPdf: true, version: 1, uploadedAt: day(28) + 'T15:00:00.000Z' }, ['Kitchen remodel', 'Cabinets, quartz counters, tile, LVP floor', 'Total $48,250.00']),
    doc('DSAMPLE_CONTRACT', 'Signed contract — Roof replacement — ' + day(6) + '.pdf', 'Contracts', { uploadedAt: day(6) + 'T15:00:00.000Z' }, ['Roof replacement contract', 'Signed by Sample Customer']),
    doc('DSAMPLE_CO1', 'Change order #1 — Gutter guards (signed).pdf', 'Change Orders', { uploadedAt: day(14) + 'T15:00:00.000Z' }, ['Add gutter guards, front and back', '+$1,450.00']),
    doc('DSAMPLE_WARRANTY', 'Warranty certificate — Roof — 5 years.pdf', 'Warranty', { uploadedAt: day(29) + 'T15:00:00.000Z' }, ['5-year workmanship warranty', 'Starts the day the job is complete']),
    doc('DSAMPLE_COC', 'Certificate of completion — Roof.pdf', 'Closeout', { uploadedAt: day(29) + 'T16:00:00.000Z' }, ['The roof work is complete']),
    doc('DSAMPLE_LIEN', 'Lien waiver — final — Roof.pdf', 'Lien Waivers', { uploadedAt: day(30) + 'T15:00:00.000Z' }, ['Unconditional lien waiver on final payment']),
    doc('DSAMPLE_PHOTOREP', 'Photo report — Roof — Oct 30.pdf', 'Photo Reports', { uploadedAt: day(30) + 'T16:00:00.000Z' }, ['Before / during / after photos of the roof']),
    doc('DSAMPLE_MAINT', 'GrayCo Care maintenance plan — Silver.pdf', 'Maintenance', { uploadedAt: day(30) + 'T17:00:00.000Z' }, ['Two visits a year: gutters, roof check, caulk']),
    doc('DSAMPLE_UP', 'Estimate #2051 — Fence & gate (uploaded).pdf', 'Estimates', { estimateId: 'ESAMPLE2', sentPdf: true, version: 1, uploadedAt: day(29) + 'T15:00:00.000Z', source: 'estimate-upload' }),
    /* estimate #2060 (not sent yet): its own uploaded PDF (kept on the job, internal) + the GrayCo template proposal ESTIN made —
       "Customer sees" picks one (patch CUSTPORTAL) */
    doc('DESRC_ESAMPLE3', 'Estimate source — Deck rebuild.pdf', 'Estimates', { estimateId: 'ESAMPLE3', source: 'estin-source', portalShare: false, uploadedAt: day(31) + 'T14:00:00.000Z' }, ['(stand-in)']),
    doc('DPROP_ESAMPLE3', 'Proposal — Deck rebuild (GrayCo template).pdf', 'Proposals', { estimateId: 'ESAMPLE3', source: 'estin', portalShare: false, estinWaiting: true, uploadedAt: day(31) + 'T14:05:00.000Z' }, ['GrayCo template proposal — Deck rebuild', 'Total $12,400.00']),
    ...(BYTES.DSAMPLE_P5 ? [doc('DSAMPLE_P5', 'Proposal — Kitchen remodel (GrayCo proposal).pdf', 'Proposals', { uploadedAt: day(28) + 'T16:00:00.000Z' })] : []),
    /* never shown: internal papers on the same job */
    Object.assign(doc('DSAMPLE_SUBAGR', 'Subcontract agreement — ' + S.sub + '.pdf', 'Sub Agreements', { portalShare: undefined }), {}),
    Object.assign(doc('DSAMPLE_INTERNAL', 'Job costing — budget.pdf', 'Internal', { portalShare: false, internal: true }), {})
  ];
  const photoRecs = pics.map((p, i) => {
    const full = storeFile(p.full, 'jpg', 'image/jpeg'), thumb = storeFile(Buffer.concat([p.thumb, Buffer.from('t' + i)]), 'jpg', 'image/jpeg');
    const tag = ['Before', 'Before', 'During', 'During', 'During', 'During', 'After', 'After', 'After', 'Damage', 'During', 'During'][i] || 'During';
    const r = { id: 'ph_sample_' + i, jobId: S.pid, ref: full, thumbRef: thumb, tag, note: 'crew note ' + i, by: i % 2 ? 'Dana Rivers' : 'Carl Crew', byKey: 'pm.sample@grayco-cs.com', at: day(10 + i) + 'T1' + (i % 9) + ':00:00.000Z', source: 'grayco', hash: sha('ph' + i) };
    if (i === 10) { r.shared = false; r.shareSet = true; r.note = 'INTERNAL ONLY — adjuster measurements'; }   /* marked internal-only */
    return r;
  });
  const users = [{ id: 'U1', name: S.pm.name, email: S.pm.email, phone: S.pm.phone, role: 'Project Manager', active: true },
    { id: 'U2', name: 'Avery Admin', email: 'admin.sample@grayco-cs.com', phone: '901-555-0199', role: 'Admin', active: true },
    { id: 'U3', name: 'Carl Crew', email: 'crew.sample@grayco-cs.com', role: 'Crew', active: true }];
  const job = { id: S.pid, name: 'Sample Customer — Roof & Kitchen', client: S.customer.name, customerId: S.customer.id, clientEmail: S.customer.email, clientPhone: S.customer.phone, address: S.customer.address,
    autoPO: 'S1001', pm: S.pm.name, status: 'active', type: 'Residential Roofing', contract: 48250, created: day(1), startDate: day(8), progress: 60,
    insCarrier: S.carrier, insuranceCompany: S.carrier, isInsurance: false, internalNotes: S.internal, notes: S.internal, costTotal: 31000, margin: 31,
    ccProjectId: S.ccId, companyCamId: S.ccId,
    subs: [{ id: 'PS1', subId: 'SUB1', name: S.sub, trade: 'Framing', bidAmt: S.subPrice, notes: 'internal: slow on paperwork' }],
    schedPlan: { steps: [{ id: 'st1', name: 'Materials delivered', date: day(24), portal: true, done: true }, { id: 'st2', name: 'Roof tear-off and new roof', date: '2026-11-04', end: '2026-11-06', portal: true },
      { id: 'st3', name: 'Kitchen demolition', date: '2026-11-10', portal: true }, { id: 'st4', name: 'Final walkthrough', date: '2026-12-01', portal: true }] },
    portalPosts: [{ id: 'post1', at: day(30) + 'T16:10:00.000Z', by: S.pm.name, text: 'Materials are on site. The crew starts the roof on Wednesday if the weather holds.', files: [{ ref: photoRecs[2].ref }] },
      { id: 'post2', at: day(24) + 'T14:00:00.000Z', by: S.pm.name, text: 'Your shingles and underlayment were delivered today.' }] };
  const other = { id: S.other, name: 'Other Person — Deck', client: 'Other Person', clientEmail: 'other.person@example.com', address: '9 Elsewhere Rd, Bartlett, TN 38134', autoPO: 'O2002', pm: S.pm.name, status: 'active', contract: 9999 };
  const sched = [{ id: 'sc1', pid: S.pid, tplTask: 'st1', task: 'Materials delivered', date: day(24) }, { id: 'sc2', pid: S.pid, tplTask: 'st2', task: 'Roof', date: '2026-11-04' }, { id: 'sc3', pid: S.pid, tplTask: 'st3', task: 'Kitchen demo', date: '2026-11-10' }, { id: 'sc4', pid: S.pid, tplTask: 'st4', task: 'Walkthrough', date: '2026-12-01' }];
  const est = { id: 'ESAMPLE1', pid: S.pid, name: 'Kitchen remodel', num: '1042', status: 'Sent', portalShare: true, date: day(28), sentDate: day(28), createdAt: day(28) + 'T12:00:00Z', totalCharge: 48250, totalCost: 33100, margin: 31.4,
    notes: 'INTERNAL: sub is ' + S.sub + ' — keep margin over 30%', sentPdf: { ref: pdfs.DSAMPLE_EST, version: 1, sentAt: day(28) + 'T15:00:00.000Z', via: 'crm-email' }, scope: { text: 'Remove the old kitchen; new cabinets, quartz counters, tile backsplash, LVP floor, paint and trim.' },
    lines: [{ id: 'l1', cat: 'Demolition', desc: 'Remove cabinets, counters and flooring', qty: 1, cost: 1800, charge: 2600 }, { id: 'l2', cat: 'Cabinets', desc: 'Shaker cabinets, soft close', qty: 1, cost: 14200, charge: 19500 },
      { id: 'l3', cat: 'Countertops', desc: 'Quartz counters', qty: 1, cost: 7400, charge: 10300, sub: S.sub }, { id: 'l4', cat: 'Flooring', desc: 'LVP floor', qty: 320, cost: 9, charge: 5200 }, { id: 'l5', cat: 'Paint & trim', desc: 'Walls, ceiling, trim', qty: 1, cost: 6300, charge: 10650 }] };
  const est3 = { id: 'ESAMPLE3', pid: S.pid, name: 'Deck rebuild', num: '2060', status: 'Draft', portalShare: true, date: day(31), createdAt: day(31) + 'T12:00:00Z', totalCharge: 12400, source: 'upload', sourceType: 'application/pdf', sourceRef: '', sourceName: 'Deck rebuild.pdf',
    scope: { text: 'Tear off the old deck; new pressure-treated frame and composite boards.' }, lines: [{ id: 'd1', cat: 'Deck', desc: 'Deck rebuild', qty: 1, cost: 8000, charge: 12400 }] };
  const est2 = { id: 'ESAMPLE2', pid: S.pid, name: 'Fence & gate', num: '2051', status: 'Sent', portalShare: true, date: day(29), sentDate: day(29), createdAt: day(29) + 'T12:00:00Z', totalCharge: 6850, source: 'upload', sourceType: 'application/pdf',
    sentPdf: { ref: pdfs.DSAMPLE_UP, version: 1, sentAt: day(29) + 'T15:00:00.000Z', via: 'upload', method: 'text' }, scope: { text: 'Cedar privacy fence, 140 ft, one 4 ft gate.' }, lines: [{ id: 'f1', cat: 'Fence', desc: 'Cedar privacy fence + gate', qty: 1, cost: 4100, charge: 6850 }] };
  const invs = [{ id: 'INVS1', pid: S.pid, po: 'S1001', invNum: '1001', type: 'client', drawType: 'Deposit', amt: 14475, status: 'Paid', date: day(7), paidDate: day(9), payMethod: 'Check' },
    { id: 'INVS2', pid: S.pid, po: 'S1001', invNum: '1002', type: 'client', drawType: 'Progress draw', amt: 19300, status: 'Sent', date: day(30), dueDate: '2026-11-14', emailedAt: day(30) + 'T15:00:00Z' },
    { id: 'INVSUB', pid: S.pid, type: 'sub', sub: S.sub, amt: S.subPrice, status: 'Approved', invNum: 'SUB-77' },
    { id: 'INVO1', pid: S.other, invNum: '2001', type: 'client', amt: 9999, status: 'Sent', date: day(30) }];
  const cos = [{ id: 'CO1', pid: S.pid, desc: 'Gutter guards, front and back', amt: 1450, status: 'Approved', date: day(14), files: [{ ref: pdfs.DSAMPLE_CO1, name: 'co1.pdf', type: 'application/pdf' }] }];
  const signReqs = [
    { id: 'sr_' + S.pid + '_estimate_ESAMPLE1', pid: S.pid, kind: 'estimate', refId: 'ESAMPLE1', title: 'Estimate #1042 — Kitchen remodel', amount: 48250, status: 'pending', mailed: true, gateKey: 'e:ESAMPLE1', docRef: pdfs.DSAMPLE_EST, createdAt: day(28) + 'T15:00:00.000Z', lines: [{ l: 'Kitchen remodel', r: '$48,250.00' }] },
    { id: 'sr_' + S.pid + '_change_order_CO2', pid: S.pid, kind: 'change_order', refId: 'CO2', title: 'Change order #2 — Upgrade to architectural shingles', amount: 2350, status: 'pending', createdAt: day(31) + 'T15:00:00.000Z', lines: [{ l: 'Architectural shingles instead of 3-tab', r: '+$2,350.00' }] },
    { id: 'sr_' + S.pid + '_contract_ROOF', pid: S.pid, kind: 'contract', refId: 'ROOF', title: 'Roof replacement contract', amount: 26450, status: 'signed', createdAt: day(5) + 'T15:00:00.000Z', docRef: pdfs.DSAMPLE_CONTRACT,
      signed: { name: 'Sample Customer', at: day(6) + 'T15:00:00.000Z', docRef: pdfs.DSAMPLE_CONTRACT, docName: 'Signed contract.pdf', sigId: 'ps_sample' } }];
  const gate = [{ id: '_meta', since: '2026-10-24T00:00:00Z', gf: {} }, { id: 'e:ESAMPLE1', pid: S.pid, st: 'approved' }, { id: 'e:ESAMPLE2', pid: S.pid, st: 'approved' }, { id: 'e:ESAMPLE3', pid: S.pid, st: 'approved' }].concat(docs.filter(d => d.portalShare).map(d => ({ id: 'd:' + d.id, pid: S.pid, st: 'approved' })));
  /* CompanyCam: 3 photos put in after the ccvis moment (new, nobody clicked), one hidden by a click */
  const since = Math.floor(Date.parse('2026-10-30T16:22:06Z') / 1000);
  const ccPics = pics.slice(0, 4).map((p, i) => { const name = 'cc' + i + '.jpg'; FILES['cc/' + name] = { bytes: p.full, type: 'image/jpeg' }; FILES['cc/t_' + name] = { bytes: p.thumb, type: 'image/jpeg' }; return ['77000' + i, since + 3600 * (i + 1), CC_IMG + '/cc/' + name, CC_IMG + '/cc/t_' + name]; });
  /* a CompanyCam description that says insurance / adjuster: [id, captured, web, thumb, creator, tag, note] */
  ccPics[3] =[ccPics[3][0], ccPics[3][1], ccPics[3][2], ccPics[3][3], -1, '', 'Adjuster photo for the insurance claim'];
  const ccFlags = [{ id: 'ccf_770002', jobId: S.pid, ccId: '770002', source: 'ccflag', shared: false, visAt: day(31) + 'T12:00:00.000Z', at: day(31) + 'T12:00:00.000Z' }];
  for (const k of Object.keys(KV)) delete KV[k];
  for (const k of Object.keys(TABLES)) delete TABLES[k];
  put('users', users); put('customers', [S.customer, { id: 'CUOTHER', name: 'Other Person', email: 'other.person@example.com' }]); put('projects', [job, other]);
  est3.sourceRef = docs.find(d => d.id === 'DESRC_ESAMPLE3').ref; put('estimates', [est, est2, est3]); put('projectDocs', docs); put('invs', invs); put('cos', cos); put('changeOrders', []); put('schedule', sched);
  put('subs', [{ id: 'SUB1', name: S.sub, contact: 'Rory Lane', phone: '901-555-0300', email: 'rory@ridgeline.test' }]);
  put('gc_photos', photoRecs.concat(ccFlags)); put('gc_sign_requests', signReqs); put('gc_portal_gate', gate);
  put('ccvis', { since: new Date(since * 1000).toISOString(), by: 'test' });
  put('ccidx:' + S.ccId, { pid: S.ccId, done: true, ph: ccPics, g: {} });
  put('gc_automation_pause', { on: false });
  put('gc_claims', []); put('punch', []); put('leads', []);
  T('gc_staff').push({ email: S.pm.email, name: S.pm.name, role: 'staff', active: true }, { email: 'admin.sample@grayco-cs.com', name: 'Avery Admin', role: 'admin', active: true });
  T('gc_portal').push({ token: S.link, project_id: S.pid, revoked: false, created_at: day(2) + 'T12:00:00Z' }, { token: S.otherLink, project_id: S.other, revoked: false, created_at: day(2) + 'T12:00:00Z' });
  T('gc_portal_msg').push({ id: 'm1', project_id: S.pid, party: 'c', side: 'gc', author: S.pm.name, text: 'Hi Sample — welcome to your GrayCo Portal. Your documents and photos are all here.', created_at: day(20) + 'T15:00:00Z', read_at: day(20) + 'T18:00:00Z', files: [] },
    { id: 'm2', project_id: S.pid, party: 'c', side: 'them', author: S.customer.name, text: 'Thanks! Can the crew park in the driveway?', created_at: day(21) + 'T13:00:00Z', read_at: day(21) + 'T14:00:00Z', files: [] },
    { id: 'm3', project_id: S.pid, party: 'c', side: 'gc', author: S.pm.name, text: 'Yes — we will keep the driveway clear by 5 each day.', created_at: day(21) + 'T14:05:00Z', read_at: null, files: [] });
  return { pdfs, photoRecs, docs, job, other };
}

/* ═════════ netlify.toml redirects (the order is the rule order; host rules match the host the page is asked as) ═════════ */
export function tomlRedirects(){
  const txt = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  return txt.split(/^\[\[redirects\]\]\s*$/m).slice(1).map(b => {
    b = b.split(/^\[/m)[0];
    const g = k => { const m = new RegExp('^\\s*' + k + '\\s*=\\s*("([^"]*)"|(\\S+))', 'm').exec(b); return m ? (m[2] != null ? m[2] : m[3]) : undefined; };
    return { from: g('from'), to: g('to'), status: +(g('status') || 301), force: g('force') === 'true' };
  }).filter(r => r.from);
}
export function applyRedirects(rules, host, pathname){
  if (pathname.startsWith('/.netlify/')) return null;
  for (const r of rules) {
    let fh = '', fp = r.from;
    const m = /^https?:\/\/([^/]+)(\/.*)$/.exec(r.from); if (m) { fh = m[1]; fp = m[2]; }
    if (fh && fh !== host) continue;
    let splat = null;
    if (fp.endsWith('/*')) { const pre = fp.slice(0, -1); if (pathname === pre.slice(0, -1) || pathname.startsWith(pre)) splat = pathname.slice(pre.length); else continue; }
    else if (fp !== pathname) continue;
    if (!r.force && fs.existsSync(path.join(ROOT, pathname)) && fs.statSync(path.join(ROOT, pathname)).isFile()) continue;
    return { status: r.status, to: r.to.replace(':splat', splat || ''), rule: r.from };
  }
  return null;
}

/* ═════════ the local web server: the site files + the REAL functions ═════════ */
export const HOST = 'portal.grayco-cs.com';
export async function startServer(){
  const rules = tomlRedirects();
  const PORT = 19500 + Math.floor(Math.random() * 400), ORIGIN = 'http://' + HOST + ':' + PORT;
  const LOG = [];
  const server = http.createServer((rq, rs) => {
    const chunks = []; rq.on('data', c => chunks.push(c)); rq.on('end', async () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const u = new URL(rq.url, ORIGIN), host = String(rq.headers.host || '').replace(/:\d+$/, '');
      if (u.pathname.startsWith('/.netlify/functions/')) {
        const name = u.pathname.split('/').pop().replace(/[^a-z0-9-]/gi, ''), f = path.join(FNDIR, name + '.js');
        let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
        if (!fs.existsSync(f)) { LOG.push({ path: u.pathname, status: 404 }); rs.writeHead(404, { 'Content-Type': 'application/json' }); return rs.end('{}'); }
        const headers = Object.assign({}, rq.headers, { origin: 'https://portal.grayco-cs.com', 'x-forwarded-for': '10.88.' + Math.floor(Math.random() * 250) + '.' + Math.floor(Math.random() * 250) });
        let out; try { out = await require(f).handler({ httpMethod: rq.method, headers, body: raw, queryStringParameters: Object.fromEntries(u.searchParams), rawUrl: u.href, path: u.pathname }); } catch (e) { out = { statusCode: 500, body: JSON.stringify({ ok: false, error: String(e && e.message) }) }; }
        LOG.push({ path: u.pathname, action: b.action, status: out.statusCode || 200 });
        rs.writeHead(out.statusCode || 200, Object.assign({ 'Content-Type': 'application/json' }, out.headers || {})); return rs.end(typeof out.body === 'string' ? out.body : JSON.stringify(out.body || {}));
      }
      const rd = applyRedirects(rules, host, u.pathname);
      let p = u.pathname, st = 200;
      if (rd) { if (rd.status === 200) p = rd.to; else if (rd.status === 404) st = 404; else { rs.writeHead(rd.status, { Location: rd.to }); return rs.end(); } }
      let f = path.join(ROOT, decodeURIComponent(p === '/' ? '/index.html' : p));
      if (st === 404 || !f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { LOG.push({ path: u.pathname, status: 404 }); rs.writeHead(404, { 'Content-Type': 'text/plain' }); return rs.end('Not found'); }
      const ct = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.pdf': 'application/pdf', '.svg': 'image/svg+xml' }[path.extname(f)] || 'application/octet-stream';
      LOG.push({ path: u.pathname, status: 200, served: path.relative(ROOT, f) });
      rs.writeHead(200, { 'Content-Type': ct + (/text|json|javascript/.test(ct) ? '; charset=utf-8' : '') }); fs.createReadStream(f).pipe(rs);
    });
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  return { server, PORT, ORIGIN, LOG, rules, close: () => new Promise(r => server.close(r)) };
}

/* ═════════ the browser: phone 390×844 (touch) and desktop ═════════ */
export const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
export async function launch(){
  const { chromium } = require(PW);
  return chromium.launch({ args: ['--host-resolver-rules=MAP ' + HOST + ' 127.0.0.1', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=' + HOST] });
}
export async function context(browser, kind, opts){
  opts = opts || {};
  const ctx = await browser.newContext(kind === 'phone' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: ANDROID, serviceWorkers: 'block' }
    : { viewport: opts.wide || { width: 1366, height: 768 }, serviceWorkers: 'block' });
  /* the private file storage and CompanyCam's picture links (https, as in production) */
  await ctx.route(SB + '/**', r => { const u = new URL(r.request().url()); const name = u.pathname.replace(/^.*\/crm-files\//, ''); const f = FILES[name]; return f ? r.fulfill({ status: 200, contentType: f.type || (/\.pdf$/.test(name) ? 'application/pdf' : 'image/jpeg'), body: f.bytes }) : r.fulfill({ status: 404, body: '' }); });
  await ctx.route(CC_IMG + '/**', r => { const u = new URL(r.request().url()); const f = FILES[u.pathname.slice(1)]; return f ? r.fulfill({ status: 200, contentType: 'image/jpeg', body: f.bytes }) : r.fulfill({ status: 404, body: '' }); });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  if (opts.noPwaCard !== false) await ctx.addInitScript(() => { try { localStorage.setItem('gc_pwa_dismiss', String(Date.now())); } catch (e) {} });
  return ctx;
}

/* ═════════ calling a function directly (node part of the tests) ═════════ */
let ipn = 0;
export async function handlerCall(fn, b, hd){
  const r = await require(FNDIR + '/' + fn + '.js').handler({ httpMethod: 'POST', headers: Object.assign({ origin: 'https://portal.grayco-cs.com', 'x-forwarded-for': '10.1.' + (++ipn % 250) + '.' + (ipn % 200) }, hd || {}), body: JSON.stringify(b) });
  let data = {}; try { data = JSON.parse(r.body || '{}'); } catch (e) { data = { raw: r.body }; }
  return { status: r.statusCode, data, raw: r.body };
}
export function resetCaches(){
  try { require(FNDIR + '/portal.js')._core._reset(); } catch (e) {}
  try { require(FNDIR + '/_lib/cc-vis.js')._reset(); } catch (e) {}
  try { require(FNDIR + '/portal-sign.js')._ps._reset(); } catch (e) {}
}
