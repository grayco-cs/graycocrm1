/* patch SUBPORTAL3 — the SUB PORTAL end to end, from a subcontractor's point of view (offline; no production calls).
   portal.html + portal-app.js in Chromium against the REAL server functions (portal-access.js, sub-photos.js) on an
   in-memory Supabase (gc_kv, the portal tables, the crm-files bucket) and a mocked CompanyCam image host.

   Usage:
     node tools/tests/test_SUBPORTAL_E2E.mjs [build dir]                 checks, phone (390×844) + desktop (1366×768)
     node tools/tests/test_SUBPORTAL_E2E.mjs [build dir] --preview DIR   also saves a screenshot of every page / tab / state
   Env: SUBPORTAL_SHOTS=<dir> (screenshots of the check run), SUBPORTAL_ASSETS=<assets.json> (real-looking sample photos /
        plan PDF; tiny generated pictures otherwise), SUBPORTAL_MIRROR=<mirror.json> (a CRM mirror: the job named by
        SUBPORTAL_JOB, or the first active job with an address and a customer, is given to the sample sub — the mirror stays
        where it is, nothing of it is written anywhere but the screenshots).
   Wrap a run in browser_lock.sh acquire / release.

   What it checks (each on the phone and the computer):
   1. the job: name, address + Maps link, customer + tap-to-call phone, gate / access notes, access codes on a scheduled day
   2. the scope (lines, included / not included) and the plans (a PDF opens), plus job documents shared with subs
   3. the sub's days on the schedule
   4. ALL the job's GrayCo Photos (GrayCo uploads whether or not the customer sees them, CompanyCam photos, the sub's own),
      never one marked "Hidden from subs"; thumbnails (not the full picture) in the grid, lazy-loaded; grouped by date; tap to enlarge
   5. the PM's name and phone; Messages to GrayCo
   6. upload photos (they land in the job's GrayCo Photos, "Added by <company> (sub)"), progress / done, invoice, punch items, COI / W-9
   7. no page errors, no 401 / 403 / 5xx from the portal's own calls
   and that the sub never sees another sub's job, the insurance carrier, the claim number, the contract amount or another sub's price. */
import fs from 'fs'; import path from 'path'; import zlib from 'zlib'; import crypto from 'crypto';
import { createRequire } from 'module'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const PREVIEW = argv.indexOf('--preview') >= 0 ? path.resolve(argv[argv.indexOf('--preview') + 1]) : '';
const BUILD = path.resolve(argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--preview') || ROOT);
const FN = path.join(BUILD, 'netlify/functions');
const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const { chromium } = await import(SPD + '/node_modules/playwright/index.mjs');
const SHOTS = PREVIEW || process.env.SUBPORTAL_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const out = []; const ok = (name, cond, info) => { out.push([name, !!cond, info || '']); console.log((cond ? '  ✓ ' : '  ✗ ') + name + (cond || !info ? '' : '  — ' + String(info).slice(0, 400))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

/* ── pictures: the sample set (SUBPORTAL_ASSETS) or tiny generated ones ── */
function png(r, g, b, W){
  W = W || 8;
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = buf => { let x = 0xFFFFFFFF; for (const v of buf) x = crcT[(x ^ v) & 0xFF] ^ (x >>> 8); return (x ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((W * 3 + 1) * W); for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const o = y * (W * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const STORE = new Map();                     /* crm-files: <sha>.<ext> → Buffer */
const CCIMG = new Map();                     /* img.companycam.com path → Buffer */
function put(buf, ext){ const n = sha(buf) + '.' + ext; STORE.set(n, buf); return n; }
const PICS = [];                             /* { full, thumb, fullBytes, thumbBytes, buf } */
let PDF = '';
const ASSETS = process.env.SUBPORTAL_ASSETS || (PREVIEW ? path.join(path.dirname(PREVIEW), 'assets.json') : '');
if (ASSETS && fs.existsSync(ASSETS)) {
  const A = JSON.parse(fs.readFileSync(ASSETS, 'utf8')), dir = path.join(path.dirname(ASSETS), 'assets');
  A.photos.forEach(p => { STORE.set(p.full, fs.readFileSync(path.join(dir, p.full))); STORE.set(p.thumb, fs.readFileSync(path.join(dir, p.thumb))); PICS.push({ full: p.full, thumb: p.thumb, fullBytes: p.fullBytes, thumbBytes: p.thumbBytes, buf: fs.readFileSync(path.join(dir, p.full)) }); });
  PDF = A.pdf; STORE.set(PDF, fs.readFileSync(path.join(dir, PDF)));
} else {
  for (let i = 0; i < 12; i++) { const f = png(20 * i, 200 - 10 * i, 90, 64), t = png(20 * i, 200 - 10 * i, 91, 16); PICS.push({ full: put(f, 'png'), thumb: put(t, 'png'), fullBytes: f.length, thumbBytes: t.length, buf: f }); }
  PDF = put(Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'), 'pdf');
}
const REF = n => 'sb:crm-files/' + n;

/* ── the sample CRM ── */
const SUB = { id: 'SUBsample1', name: 'Sample Drywall LLC', company: 'Sample Drywall LLC', contact: 'Sam Sample', phone: '901-555-0141', email: 'sam@sampledrywall.test', isSub: true, trade: 'Drywall',
  w9: true, coi: true, insExp: addDays(TODAY, 200), lang: 'en' };
const SUB2 = { id: 'SUBother2', name: 'Other Paint Co', company: 'Other Paint Co', contact: 'Otto Other', phone: '901-555-0142', email: 'otto@otherpaint.test', isSub: true, trade: 'Paint' };
const JOB = { id: 'PSAMPLE1', name: 'Sample Kitchen Remodel', address: '123 Sample St, Memphis, TN 38117', client: 'Pat Sample', clientPhone: '901-555-0190', clientEmail: 'pat@sample.test',
  pm: 'Sample PM', status: 'Active', autoPO: 'SK-2041', contract: 48250, insCarrier: 'Acme Mutual Insurance', claimNumber: 'CLM-99887766', ccProjectId: '7001', startDate: addDays(TODAY, -3), endDate: addDays(TODAY, 12),
  siteNotes: { gate: 'Side gate code 4321#', parking: 'Street parking only — keep the driveway clear', hours: '8 AM – 5 PM, no Sundays', dumpster: 'Driveway, left side', power: 'Garage outlets', water: 'Hose bib, back of the house', notes: 'Dog in the back yard — keep the gate shut.' },
  subs: [{ subId: SUB.id, name: SUB.name, status: 'Awarded', startDate: addDays(TODAY, -1), endDate: addDays(TODAY, 4), price: 6400 }, { subId: SUB2.id, name: SUB2.name, status: 'Awarded', price: 3900 }] };
const JOB2 = { id: 'POTHER2', name: 'Other Bath Remodel', address: '9 Elsewhere Ave, Memphis, TN 38104', client: 'Lee Other', clientPhone: '901-555-0909', pm: 'Sample PM', status: 'Active', contract: 22000,
  subs: [{ subId: SUB2.id, name: SUB2.name, status: 'Awarded', price: 2500 }] };
const SCHEDULE = [
  { id: 'R1', pid: JOB.id, subId: SUB.id, date: TODAY, time: '8:00', endTime: '4:00', title: 'Hang drywall — kitchen' },
  { id: 'R2', pid: JOB.id, subId: SUB.id, date: addDays(TODAY, 1), time: '8:00', endTime: '4:00', title: 'Tape and mud' },
  { id: 'R3', pid: JOB.id, subId: SUB.id, date: addDays(TODAY, 3), time: '9:00', title: 'Sand and final coat' },
  { id: 'R9', pid: JOB2.id, subId: SUB2.id, date: TODAY, time: '8:00', title: 'Paint bath' }];
const PUNCH = [
  { id: 'PU1', pid: JOB.id, subId: SUB.id, item: 'Patch nail pops by the pantry door', details: 'Three spots on the left wall, eye level.', dueDate: addDays(TODAY, 5), priority: 'High', status: 'Open' },
  { id: 'PU2', pid: JOB.id, subId: SUB.id, item: 'Square up the corner bead above the range hood', dueDate: addDays(TODAY, 6), priority: 'Normal', status: 'Open' },
  { id: 'PU9', pid: JOB.id, subId: SUB2.id, item: 'OTHER-SUB punch item', status: 'Open' }];
const INVS = [{ id: 'INVS1', type: 'sub', subId: SUB.id, pid: JOB.id, amt: 3200, invNum: 'SD-1001', po: 'SK-2041', recvDate: addDays(TODAY, -2), status: 'received' },
  { id: 'INVS9', type: 'sub', subId: SUB2.id, pid: JOB.id, amt: 1777, invNum: 'OP-77', recvDate: addDays(TODAY, -2), status: 'received' }];
const at = (d, h) => d + 'T' + String(h).padStart(2, '0') + ':15:00.000Z';
/* GrayCo Photos: 8 GrayCo uploads — 5 the customer sees, 2 the customer does not (still the subs' business), 1 Hidden from subs */
const GCP = PICS.slice(0, 8).map((p, i) => ({ id: 'ph_s' + i, jobId: JOB.id, ref: REF(p.full), thumbRef: REF(p.thumb), hash: sha(p.buf), tag: ['Before', 'Before', 'During', 'During', 'During', 'Damage', 'After', 'During'][i],
  at: at(addDays(TODAY, -[6, 6, 3, 3, 2, 2, 1, 0][i]), 14 + i % 3), by: 'Sample PM', source: 'grayco',
  shared: i < 5 ? true : (i < 7 ? false : true), hideSubs: i === 7 ? true : undefined, note: 'INTERNAL NOTE ' + i }));
GCP.push({ id: 'ph_other', jobId: JOB2.id, ref: REF(PICS[8].full), thumbRef: REF(PICS[8].thumb), hash: sha(PICS[8].buf), at: at(TODAY, 9), by: 'Sample PM', source: 'grayco', shared: true });
/* CompanyCam: 4 photos on the job's CompanyCam project, put in after the "customer can see" switch (nobody clicked them) */
const SINCE = Math.floor(Date.now() / 1000) - 20 * 86400;
const CC = PICS.slice(8, 12).map((p, i) => { const id = String(9100 + i); CCIMG.set('/w/' + id + '.jpg', p.buf); CCIMG.set('/t/' + id + '.jpg', STORE.get(p.thumb)); return { id, up: Math.floor(Date.now() / 1000) - (i + 1) * 86400 }; });
const CCIDX = { done: true, kind: 'job', job: JOB.id, pid: '7001', ph: CC.map(c => [c.id, c.up, 'https://img.companycam.com/w/' + c.id + '.jpg', 'https://img.companycam.com/t/' + c.id + '.jpg', 0, '', '', c.up]), g: {} };
const DOCS = [
  { id: 'DOCplan', pid: JOB.id, name: 'Kitchen plans A1–A3.pdf', cat: 'Plans/Drawings', type: 'application/pdf', ref: REF(PDF), uploadedAt: at(addDays(TODAY, -8), 10) },
  { id: 'DOCprop', pid: JOB.id, name: 'Proposal — $48,250.pdf', cat: 'Proposals', type: 'application/pdf', ref: REF(PDF), uploadedAt: at(addDays(TODAY, -9), 10), portalShare: true },
  { id: 'DOCclaim', pid: JOB.id, name: 'Acme Mutual claim letter.pdf', cat: 'Insurance', type: 'application/pdf', ref: REF(PDF), uploadedAt: at(addDays(TODAY, -9), 10) }];
const USERS = [{ id: 'u1', name: 'Sample PM', email: 'samplepm@grayco-cs.test', phone: '901-555-0100', role: 'Project Manager', active: true }];

function freshDb(job){
  const KV = { projects: [job, JOB2], vendors: [SUB, SUB2], schedule: SCHEDULE.map(x => Object.assign({}, x, x.pid === JOB.id ? { pid: job.id } : {})), users: USERS,
    punch: PUNCH.map(x => Object.assign({}, x, x.pid === JOB.id ? { pid: job.id } : {})), invs: INVS.map(x => Object.assign({}, x, x.pid === JOB.id ? { pid: job.id } : {})),
    gc_photos: GCP.map(x => Object.assign({}, x, x.jobId === JOB.id ? { jobId: job.id } : {})), projectDocs: DOCS.map(x => Object.assign({}, x, { pid: job.id })),
    gc_sub_portal_settings: {}, ccvis: { since: new Date(SINCE * 1000).toISOString() }, 'ccidx:7001': Object.assign({}, CCIDX, { job: job.id }),
    gc_x10_codes: [{ pid: job.id, codes: [{ label: 'Lockbox (front door)', code: '2468' }, { label: 'Garage keypad', code: '1357' }], log: [] }] };
  const now = new Date().toISOString();
  const T = { gc_portal_session: [], gc_sub_link: [], gc_sub_event: [], gc_sub_portal: [], gc_sub_scope: [], gc_portal_msg: [], sp_rows: [], gc_portal_code: [], gc_sub_device: [], gc_portal: [] };
  T.gc_sub_scope.push({ id: 'SC1', sub_id: SUB.id, project_id: job.id, kind: 'scope', status: 'published', version: 1, title: 'Drywall — kitchen and pantry', total: 6400, approved_at: at(addDays(TODAY, -4), 15), updated_at: at(addDays(TODAY, -4), 15),
    data: { lines: [{ room: 'Kitchen', desc: 'Hang 1/2" drywall on walls and ceiling', qty: 42, unit: 'sheets', meas: '12 × 16 ft room, 9 ft ceiling' }, { room: 'Kitchen', desc: 'Tape, mud and sand to level 4 finish', qty: 1, unit: 'room' },
      { room: 'Pantry', desc: 'Hang, tape and finish walls', qty: 8, unit: 'sheets' }, { room: 'All', desc: 'Corner bead on outside corners', qty: 36, unit: 'LF' }],
      included: 'All drywall, tape, mud, corner bead, screws. Clean up and haul off drywall scraps daily.', excluded: 'Paint, texture, insulation, framing repairs.', matGc: 'Drywall sheets delivered to the garage.', matSub: 'Mud, tape, screws, corner bead, tools.',
      notes: 'Protect the new cabinets with plastic before sanding.', start: addDays(TODAY, -1), end: addDays(TODAY, 4), files: [{ ref: REF(PDF), name: 'Kitchen plans A1–A3.pdf', type: 'application/pdf' }], photos: [{ ref: REF(PICS[2].thumb), name: 'Kitchen today.jpg', type: 'image/jpeg' }] } });
  T.gc_sub_scope.push({ id: 'SC9', sub_id: SUB2.id, project_id: job.id, kind: 'scope', status: 'published', version: 1, title: 'OTHER-SUB scope', total: 3900, data: {} });
  T.gc_portal_msg.push({ id: 'M1', project_id: job.id, party: 's:' + SUB.id, side: 'gc', author: 'Sample PM', text: 'Hi Sam — drywall is in the garage. Side gate code is in your site notes. Call me when you get there.', files: [], created_at: at(addDays(TODAY, -1), 13), read_at: null },
    { id: 'M2', project_id: job.id, party: 's:' + SUB.id, side: 'them', author: 'Sam Sample', text: 'Got it, we start tomorrow at 8.', files: [], created_at: at(addDays(TODAY, -1), 14), read_at: at(addDays(TODAY, -1), 15) },
    { id: 'M3', project_id: job.id, party: 's:' + SUB2.id, side: 'gc', author: 'Sample PM', text: 'OTHER-SUB private message', files: [], created_at: at(TODAY, 9) });
  const SESSION = 'S'.repeat(43), LINK = 'L'.repeat(43), SESSION2 = 'T'.repeat(43), LINK2 = 'K'.repeat(43);
  T.gc_portal_session.push({ id: sha(SESSION), kind: 'partner', sub_id: SUB.id, links: [LINK], expires_at: new Date(Date.now() + 864e5).toISOString(), last_seen_at: now },
    { id: sha(SESSION2), kind: 'partner', sub_id: SUB2.id, links: [LINK2], expires_at: new Date(Date.now() + 864e5).toISOString(), last_seen_at: now });
  T.gc_sub_link.push({ token: LINK, sub_id: SUB.id, revoked: false, created_at: now }, { token: LINK2, sub_id: SUB2.id, revoked: false, created_at: now });
  return { KV, T, SESSION, SESSION2, KVAT: {} };
}

/* ── the in-memory Supabase for the server functions ── */
let DB = null;
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => typeof body === 'string' ? body : JSON.stringify(body) });
const val = v => decodeURIComponent(String(v || '')).replace(/^eq\./, '');
const inl = v => decodeURIComponent(String(v || '')).replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
const NETLOG = [];
global.fetch = async (url, init) => {
  init = init || {}; const u = new URL(url), q = u.searchParams, m = (init.method || 'GET').toUpperCase();
  if (u.host !== 'sb.test') { NETLOG.push('OUT ' + u.host); return res(404, {}); }
  const KV = DB.KV;
  if (u.pathname === '/rest/v1/gc_kv') {
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(x => { if (/ignore-duplicates/.test((init.headers || {}).Prefer || '') && KV[x.key] !== undefined) return; KV[x.key] = x.value; DB.KVAT[x.key] = x.updated_at || new Date().toISOString(); }); return res(201, null); }
    if (m === 'PATCH') { const k = val(q.get('key')), a = q.get('updated_at'); const cur = DB.KVAT[k] || 'T0'; if (KV[k] === undefined || (a && val(a) !== cur)) return res(200, []); const b = JSON.parse(init.body); KV[k] = b.value; DB.KVAT[k] = b.updated_at; return res(200, [{ key: k }]); }
    const k = q.get('key') || ''; const keys = k.startsWith('in.') ? inl(k) : [val(k)];
    return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: KV[x], updated_at: DB.KVAT[x] || 'T0' })));
  }
  const tm = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
  if (tm && DB.T[tm[1]]) {
    const tb = DB.T[tm[1]];
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => tb.push(Object.assign({ created_at: new Date().toISOString() }, r))); return res(201, []); }
    let rows = tb.slice();
    for (const [k, v] of q.entries()) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === val(v));
      else if (v.startsWith('in.')) rows = rows.filter(r => inl(v).includes(String(r[k])));
      else if (v.startsWith('gt.')) rows = rows.filter(r => String(r[k]) > decodeURIComponent(v.slice(3)));
      else if (v === 'is.null') rows = rows.filter(r => r[k] == null);
    }
    const ord = q.get('order'); if (ord) { const [f, d] = ord.split('.'); rows.sort((a, b) => (String(a[f]) < String(b[f]) ? -1 : 1) * (d === 'desc' ? -1 : 1)); }
    if (q.get('limit')) rows = rows.slice(0, +q.get('limit'));
    if (m === 'PATCH') { const b = JSON.parse(init.body); rows.forEach(r => Object.assign(r, b)); return res(200, rows); }
    return res(200, rows);
  }
  if (u.pathname.startsWith('/storage/v1/object/sign/')) { const b = JSON.parse(init.body); return res(200, b.paths.map(p => ({ path: p, signedURL: '/object/sign/crm-files/' + p + '?token=t' }))); }
  if (u.pathname.startsWith('/storage/v1/object/crm-files/')) { const n = u.pathname.split('/').pop(); const b = init.body; STORE.set(n, Buffer.isBuffer(b) ? b : Buffer.from(b || '')); return res(200, {}); }
  return res(404, {});
};
process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_KEY = 'svc-key-test'; process.env.PORTAL_MAIL_OFF = '1';
delete process.env.RESEND_API_KEY; delete process.env.COMPANYCAM_TOKEN;
const PA = require(path.join(FN, 'portal-access.js')), SPH = require(path.join(FN, 'sub-photos.js'));
SPH._core.CHECK_MS = 1;
const handlers = { 'portal-access': PA.handler, 'sub-photos': SPH.handler };
function reset(job){ DB = freshDb(job); try { SPH._core._reset(); } catch (e) {} try { require(path.join(FN, '_lib/cc-vis.js'))._reset(); } catch (e) {} }

/* the real job from a mirror (optional) */
let REALJOB = null;
if (process.env.SUBPORTAL_MIRROR && fs.existsSync(process.env.SUBPORTAL_MIRROR)) {
  try {
    const rows = JSON.parse(fs.readFileSync(process.env.SUBPORTAL_MIRROR, 'utf8')), by = {}; rows.forEach(r => { by[r.key] = r; });
    const dec = v => typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch (e) { return v; } })() : v;
    let P = dec((by.projects || {}).v || (by.projects || {}).value); const man = by.projects__manifest && dec(by.projects__manifest.v || by.projects__manifest.value);
    if (man && man.chunked) { P = []; for (let i = 0; i < man.count; i++) P = P.concat(dec((by['projects__chunk' + i] || {}).v || (by['projects__chunk' + i] || {}).value) || []); }
    const want = process.env.SUBPORTAL_JOB;
    REALJOB = (P || []).find(p => want ? p.id === want : (p && p.address && p.client && /active|progress|scheduled|sold/i.test(p.status || '') && !/claim|insurance/i.test(p.name || '')));
    if (REALJOB) REALJOB = Object.assign({}, REALJOB, { subs: (Array.isArray(REALJOB.subs) ? REALJOB.subs : []).concat([{ subId: SUB.id, name: SUB.name, status: 'Awarded', startDate: addDays(TODAY, -1), endDate: addDays(TODAY, 4) }]), ccProjectId: '7001' });
  } catch (e) { console.log('  (mirror not read: ' + e.message + ')'); }
}

/* ── the browser ── */
const INDEX = [];
async function shot(p, name, label){
  if (!SHOTS) return;
  const f = name + '_' + (p.__kind || 'x') + '.png';
  await sleep(250);
  await p.screenshot({ path: path.join(SHOTS, f), fullPage: !!p.__full }).catch(() => {});
  INDEX.push(f + '  —  ' + label);
}
async function browserFor(kind){
  const b = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
  const ctx = await b.newContext(Object.assign({ serviceWorkers: 'block' }, kind === 'phone' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1366, height: 768 } }));   /* the portal's service worker would fetch around the test's routes */
  const S = { b, ctx, errs: [], calls: [], bad: [], imgs: [] };
  await ctx.route('**/*', async r => {
    const u = new URL(r.request().url());
    if (u.host === 'sb.test') { const n = u.pathname.split('/').pop(); S.imgs.push(n); const buf = STORE.get(n); return buf ? r.fulfill({ status: 200, contentType: /\.pdf$/.test(n) ? 'application/pdf' : /\.png$/.test(n) ? 'image/png' : 'image/jpeg', body: buf }) : r.fulfill({ status: 404, body: '' }); }
    if (u.host === 'img.companycam.com') { S.imgs.push('cc' + u.pathname); const buf = CCIMG.get(u.pathname); return buf ? r.fulfill({ status: 200, contentType: 'image/jpeg', body: buf }) : r.fulfill({ status: 404, body: '' }); }
    if (u.host !== 'portal.test') return r.abort('blockedbyclient');
    const fm = /^\/\.netlify\/functions\/([a-z-]+)$/.exec(u.pathname);
    if (fm) {
      const hd = r.request().headers(), body = r.request().postData() || '';
      if (fm[1] === 'mkt-public') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });   /* gc-address.js: the company address (not the sub portal's) */
      if (!handlers[fm[1]]) { S.bad.push('404 fn ' + fm[1]); return r.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' }); }
      let a = ''; try { a = JSON.parse(body).action; } catch (e) {}
      const resp = await handlers[fm[1]]({ httpMethod: r.request().method(), headers: Object.assign({ origin: 'https://portal.test', 'x-nf-client-connection-ip': '10.0.0.' + (kind === 'phone' ? 1 : 2) }, hd), body });
      S.calls.push(fm[1] + ':' + a + ':' + resp.statusCode);
      if (resp.statusCode === 401 || resp.statusCode === 403 || resp.statusCode >= 500) S.bad.push(fm[1] + ':' + a + ' → ' + resp.statusCode + ' ' + String(resp.body).slice(0, 120));
      return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body });
    }
    const f = path.join(BUILD, u.pathname === '/' ? 'portal.html' : decodeURIComponent(u.pathname));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f });
    if (!/favicon/.test(u.pathname)) S.bad.push('404 ' + u.pathname);
    return r.fulfill({ status: 404, body: '' });
  });
  S.page = async (session) => {
    const p = await ctx.newPage(); p.__kind = kind;
    p.on('pageerror', e => S.errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) S.errs.push('console: ' + m.text().slice(0, 200)); });
    if (session !== undefined) await p.addInitScript(([s]) => { try { localStorage.setItem('gc_portal_s', s); localStorage.setItem('gc_lang', 'en'); } catch (e) {} }, [session]);
    return p;
  };
  return S;
}
const text = p => p.evaluate(() => document.body.innerText);
async function clickTab(p, k){ await p.click('[data-jtab="' + k + '"]'); await sleep(400); }
async function openJobPage(p, pid){ await p.click('#tabs button[data-tab="jobs"]'); await p.click('[data-job="' + pid + '"]'); await p.waitForSelector('#jobBack', { timeout: 15000 }); await sleep(500); }
async function closeSheet(p){ const b = await p.$('.sheet .x'); if (b) await b.click(); const l = await p.$('.lb button[aria-label]'); if (l) await l.click(); await sleep(200); }

async function run(kind, job){
  reset(job);
  const S = await browserFor(kind), pid = job.id, n = { i: 0 }, N = () => String(++n.i).padStart(2, '0');
  const tag = '[' + kind + '] ';
  /* sign-in page (no session) */
  const p0 = await S.page('');
  await p0.goto('https://portal.test/');
  await p0.waitForSelector('input', { timeout: 15000 }).catch(() => {});
  await shot(p0, N() + '_signin', 'Sign-in page (portal.grayco-cs.com): e-mail / mobile + password, or e-mail me a code');
  ok(tag + 'the sign-in page opens', /sign in|e-?mail/i.test(await text(p0)));
  ok(tag + 'the sign-in page (customers use it too) never names the sub portal', !/sub portal|subcontractor/i.test(await text(p0)), (await text(p0)).slice(-300));
  await p0.close();

  const p = await S.page(DB.SESSION);
  await p.goto('https://portal.test/');
  const home = await p.waitForSelector('[data-job="' + pid + '"]', { timeout: 30000 }).catch(() => null);
  ok(tag + 'signed in as the sub (link session) → Home lists the job', !!home, S.calls.join(' ') + ' | ' + S.errs.join(' | '));
  if (!home) { await S.b.close(); return S; }
  await sleep(500);
  await shot(p, N() + '_home', 'Home: Today, Needs you, Money, This week, My calendar, Your jobs, PM contact');
  p.__full = true; await shot(p, N() + '_home_full', 'Home (whole page)'); p.__full = false;
  let t0 = await text(p);
  ok(tag + 'Home: only the sub\'s own job (never the other sub\'s job)', t0.indexOf(job.name) >= 0 && t0.indexOf(JOB2.name) < 0);
  const legal = await p.$eval('[data-gc-legal-links]', x => x.innerHTML).catch(() => '');
  ok(tag + 'the sub\'s footer links the Sub Portal terms and privacy notice (not the customer portal\'s)', /sub-terms\.html/.test(legal) && /sub-privacy\.html/.test(legal) && !/portal-terms\.html/.test(legal), legal);
  await p.click('#tabs button[data-tab="jobs"]'); await sleep(300);
  await shot(p, N() + '_jobs', 'Jobs tab: the sub\'s jobs');
  await p.click('[data-job="' + pid + '"]'); await p.waitForSelector('#jobBack', { timeout: 15000 }); await sleep(600);
  await shot(p, N() + '_job_overview', 'Job: overview — address + Maps, PO, dates, PM, customer, schedule, site notes' + (kind === 'desktop' ? ' (left) + Scope (right)' : ''));
  p.__full = true; await shot(p, N() + '_job_overview_full', 'Job overview (whole page)'); p.__full = false;
  const t1 = await text(p);
  const maps = await p.$eval('a[href*="google.com/maps"]', a => a.href).catch(() => '');
  ok(tag + '1. name, full address, Maps / directions link', t1.indexOf(job.name) >= 0 && t1.indexOf(job.address.split(',')[0]) >= 0 && /maps\/search\/\?api=1&query=/.test(maps), maps);
  const tels = await p.$$eval('a[href^="tel:"]', a => a.map(x => x.getAttribute('href')));
  ok(tag + '1. the customer\'s name and tap-to-call phone', t1.indexOf(String(job.client || '').split(' ')[0]) >= 0 && (!job.clientPhone || tels.indexOf('tel:' + String(job.clientPhone).replace(/[^0-9+]/g, '')) >= 0), JSON.stringify(tels));
  ok(tag + '1. gate code / access notes (site notes)', !job.siteNotes || t1.indexOf(job.siteNotes.gate) >= 0, t1.slice(0, 200));
  ok(tag + '5. the PM\'s name and phone', t1.indexOf('Sample PM') >= 0 && tels.indexOf('tel:9015550100') >= 0);
  ok(tag + '3. the sub\'s days on the schedule (this job)', /Hang drywall/.test(t1) && /Tape and mud/.test(t1) && !/Paint bath/.test(t1));
  /* access codes (today is a scheduled day) */
  const cb = await p.$('.gc-codes button');
  if (cb) { await cb.click(); await sleep(600); }
  const t2 = await text(p);
  ok(tag + '1. lockbox / gate codes on a scheduled day', /2468/.test(t2) && /Lockbox/.test(t2));
  const gcc = await p.$('.gc-codes'); if (gcc) await gcc.scrollIntoViewIfNeeded().catch(() => {});
  await shot(p, N() + '_access_codes', 'Access codes (only on the sub\'s scheduled days; every look is logged)');
  const docCard = await p.$('[data-subdocs]');
  if (docCard) { await docCard.scrollIntoViewIfNeeded(); await shot(p, N() + '_job_documents', 'Plans & documents shared with subs'); }
  ok(tag + '2. plans / documents for subs on the job (Plans/Drawings), never the proposal or the claim letter', !!docCard && /Kitchen plans/.test(await docCard.innerText()) && !/Proposal|claim letter/i.test(await text(p)), docCard ? await docCard.innerText() : 'no [data-subdocs] card');
  /* scope */
  await clickTab(p, 'scope');
  await shot(p, N() + '_scope', 'Scope: the sub agreement — lines, included / not included, materials, plans, their total, Review & sign');
  p.__full = true; await shot(p, N() + '_scope_full', 'Scope (whole page)'); p.__full = false;
  const t3 = await text(p);
  ok(tag + '2. scope + trade lines (area, work, measurement, qty, unit) + included / not included', /Hang 1\/2" drywall/.test(t3) && /level 4/.test(t3) && /Paint, texture/.test(t3));
  ok(tag + '2. the sub sees only their own price (6,400), never another sub\'s (3,900) or the contract (48,250)', /6,400/.test(t3) && !/3,900|48,250|OTHER-SUB/.test(t3));
  const openPlan = await p.$('.scope .doc button');
  if (openPlan) { await openPlan.click(); await sleep(1200); }
  ok(tag + '2. a plan PDF opens', !!(await p.$('.sheet iframe.pdf')));
  await shot(p, N() + '_plan_open', 'A plan PDF opened (viewer + Open button)');
  await closeSheet(p);
  const signB = await p.$('[data-accept]');
  if (signB) { await signB.click(); await sleep(500); await shot(p, N() + '_scope_sign', 'Review & sign the sub agreement (E-SIGN consent, typed name, drawn signature)'); await closeSheet(p); }
  await clickTab(p, 'cos');
  await shot(p, N() + '_change_orders', 'Change orders (none on the sample job)');
  /* photos */
  await clickTab(p, 'photos');
  await p.waitForFunction(() => !document.querySelector('#phLoad') || /No photos/.test(document.querySelector('#phLoad').textContent), null, { timeout: 20000 }).catch(() => {});
  await sleep(1200);
  await shot(p, N() + '_photos', 'Photos: the job\'s GrayCo Photos (grid)');
  p.__full = true; await shot(p, N() + '_photos_full', 'Photos (whole page)'); p.__full = false;
  const grid = await p.$$eval('#grid img, .pics img', a => a.map(x => ({ src: x.getAttribute('src'), lazy: x.getAttribute('loading') })));
  const srcs = grid.map(g => String(g.src || ''));
  const want = GCP.filter(x => x.jobId === JOB.id && x.hideSubs !== true).length + CC.length;
  ok(tag + '4. ALL the job\'s photos: GrayCo uploads the customer does / does not see + CompanyCam (' + want + '), never "Hidden from subs" or another job\'s',
    srcs.filter(x => /sb\.test|companycam/.test(x)).length >= want && !srcs.some(x => x.indexOf(PICS[7].thumb) >= 0 || x.indexOf(PICS[7].full) >= 0) && !srcs.some(x => x.indexOf(PICS[8].thumb) >= 0 && !/companycam/.test(x)), srcs.length + ' shown of ' + want + ': ' + srcs.slice(0, 3).join(' '));
  ok(tag + '4. the grid uses thumbnails (never the full picture) and lazy loading', grid.length > 0 && grid.every(g => g.lazy === 'lazy') && !srcs.some(x => PICS.some(pc => x.indexOf(pc.full) >= 0)) , JSON.stringify(grid.slice(0, 2)));
  const groups = await p.$$eval('[data-phday]', a => a.map(x => x.getAttribute('data-phday')));
  ok(tag + '4. grouped by date', groups.length >= 2, JSON.stringify(groups));
  const first = await p.$('#grid button, .pics button');
  if (first) { await first.click(); await sleep(900); }
  const big = await p.$eval('.lb img', i => i.getAttribute('src')).catch(() => '');
  ok(tag + '4. tap to enlarge (the lightbox shows the full picture)', !!big && !PICS.some(pc => big.indexOf(pc.thumb) >= 0) , big);
  await shot(p, N() + '_photo_enlarged', 'A photo enlarged (‹ › to the next one)');
  await closeSheet(p);
  await p.click('#addPhotos'); await p.waitForSelector('#phPick', { timeout: 5000 });
  await shot(p, N() + '_photo_upload', 'Add photos: Take a photo (camera) / Choose photos + note');
  const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }), p.click('#phPick')]);
  await fc.setFiles([{ name: 'wall1.png', mimeType: 'image/png', buffer: png(200, 30, 30, 32) }, { name: 'wall2.png', mimeType: 'image/png', buffer: png(30, 200, 30, 32) }]);
  await p.fill('#phNote', 'Kitchen walls hung');
  await shot(p, N() + '_photo_upload_ready', 'Add photos: 2 picked, note typed');
  await p.click('#phSend');
  await p.waitForFunction(() => !document.querySelector('#phSend'), null, { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  const mine = (DB.KV.gc_photos || []).filter(r => r.source === 'sub' && r.subId === SUB.id);
  ok(tag + '6. the sub\'s photos land in the job\'s GrayCo Photos, "Added by Sample Drywall LLC (sub)", hidden from the customer', mine.length === 2 && mine.every(r => r.jobId === pid && r.by === 'Sample Drywall LLC (sub)' && r.shared === false && r.subCompany === 'Sample Drywall LLC'), JSON.stringify(mine.map(r => [r.jobId, r.by, r.shared])));
  ok(tag + '6. …with a small thumbnail of its own (the grid never downloads the full photo)', mine.length === 2 && mine.every(r => r.thumbRef && r.thumbRef !== r.ref), JSON.stringify(mine.map(r => [r.ref, r.thumbRef])));
  await shot(p, N() + '_photos_after_upload', 'Photos after the upload (their own photos show too)');
  /* progress / mark done */
  await clickTab(p, 'progress');
  await shot(p, N() + '_progress', 'Progress: % done + what got done today (+ photos)');
  await p.evaluate(() => { const r = document.getElementById('pgPct'); r.value = '100'; r.dispatchEvent(new Event('input')); });
  await p.fill('#pgNote', 'Drywall done — ready for paint');
  await p.click('#pgSend'); await sleep(1500);
  ok(tag + '6. mark the work done (progress 100%)', DB.T.gc_sub_event.some(e => e.kind === 'progress' && e.data.pct === 100 && e.project_id === pid));
  await shot(p, N() + '_progress_done', 'Progress posted: 100% done');
  /* punch */
  await clickTab(p, 'punch');
  await shot(p, N() + '_punch', 'Punch list: the sub\'s items, Mark done with a photo');
  const pt = await text(p);
  ok(tag + '6. the sub\'s punch items (2), never another sub\'s', /nail pops/.test(pt) && /corner bead/.test(pt) && !/OTHER-SUB/.test(pt));
  const [fc2] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }), p.click('[data-punch="PU1"]')]);
  await fc2.setFiles([{ name: 'fixed.png', mimeType: 'image/png', buffer: png(90, 90, 200, 32) }]);
  for (let k = 0; k < 80 && !DB.T.gc_sub_event.some(e => e.kind === 'punch' && e.data.punchId === 'PU1'); k++) await sleep(250);
  await sleep(1200);
  ok(tag + '6. a punch item marked done with a photo', DB.T.gc_sub_event.some(e => e.kind === 'punch' && e.data.punchId === 'PU1'));
  await shot(p, N() + '_punch_done', 'Punch item marked done (with its photo)');
  /* invoices */
  await clickTab(p, 'invoices');
  await shot(p, N() + '_invoices', 'Invoices on this job (the submitted one) + Send an invoice');
  await p.click('#jobNewInv'); await sleep(400);
  await p.fill('#invAmt', '3200'); await p.fill('#invNum', 'SD-1002');
  await shot(p, N() + '_invoice_new', 'Send an invoice: job, for (scope), amount, invoice #, PO (filled in), note, file');
  await p.click('#invSend'); await sleep(1500);
  const toast = await p.$eval('.toast', x => x.textContent).catch(() => '');
  ok(tag + '6. submit an invoice (it reaches GrayCo, or the photo rule says how many photos are still needed)', DB.T.gc_sub_event.some(e => e.kind === 'invoice') || /photos of your work/.test(toast), toast);
  await shot(p, N() + '_invoice_sent', 'After Send: ' + (toast || '').slice(0, 80));
  await closeSheet(p);
  /* messages */
  await clickTab(p, 'messages'); await sleep(800);
  await shot(p, N() + '_messages', 'Messages with the PM (read receipts, photo / file)');
  await p.fill('#msgText', 'Running 15 minutes late tomorrow.'); await p.click('#msgSend'); await sleep(800);
  ok(tag + '5. message GrayCo (the PM\'s thread), never another sub\'s messages', DB.T.gc_portal_msg.some(m => m.party === 's:' + SUB.id && /15 minutes late/.test(m.text)) && !/OTHER-SUB/.test(await text(p)));
  await shot(p, N() + '_messages_sent', 'Message sent');
  /* home cards: calendar, late */
  await p.click('#jobBack'); await sleep(300); await p.click('#tabs button[data-tab="home"]'); await sleep(400);
  const lb = await p.$('.late-btn'); if (lb) { await lb.click(); await sleep(300); await lb.scrollIntoViewIfNeeded(); await shot(p, N() + '_late', 'Can\'t make it / running late → straight to the PM'); }
  const av = await p.$('text=Open my calendar'); if (av) { await av.click(); await sleep(800); await shot(p, N() + '_calendar', 'My schedule & days off'); await closeSheet(p); }
  /* pay + papers */
  await p.click('#tabs button[data-tab="pay"]'); await sleep(400);
  await shot(p, N() + '_pay', 'Pay: every invoice and where it stands (Submitted → Approved → Scheduled → Paid)');
  await p.click('#tabs button[data-tab="papers"]'); await sleep(400);
  await shot(p, N() + '_papers', 'Papers: W-9, COI (on file + expiry), agreement, lien waivers, language, scorecard');
  const tp = await text(p);
  ok(tag + '6. COI / W-9 on Papers (on file)', /W-9/.test(tp) && /Insurance certificate/.test(tp) && /On file/.test(tp));
  await p.click('[data-paper="coi"]'); await sleep(300);
  await shot(p, N() + '_coi_upload', 'Upload a new COI (file + the date it runs out)');
  await closeSheet(p);
  /* the forbidden fields, anywhere the sub went */
  const body = await text(p);
  ok(tag + 'never the insurance carrier, the claim number, the contract amount or another sub', !/Acme Mutual|CLM-99887766|48,250|Other Paint|OTHER-SUB|INTERNAL NOTE/.test(body + t0 + t1 + t2 + t3 + pt));
  /* another sub's job, straight at the server */
  const api = (action, b, sess) => PA.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.test', 'x-portal-session': sess || DB.SESSION, 'x-nf-client-connection-ip': '10.9.9.9' }, body: JSON.stringify(Object.assign({ action }, b || {})) });
  const r1 = await api('p-job', { projectId: JOB2.id }), r2 = await api('p-photos', { projectId: JOB2.id }), r3 = await api('p-msgs', { projectId: JOB2.id });
  ok(tag + 'another sub\'s job: p-job / p-photos / p-msgs refused (404)', r1.statusCode === 404 && r2.statusCode === 404 && r3.statusCode === 404, [r1.statusCode, r2.statusCode, r3.statusCode].join(','));
  const r4 = await api('p-job', { projectId: pid });
  ok(tag + 'p-job carries nothing forbidden (carrier, claim, contract, other subs\' prices, internal photo notes)', r4.statusCode === 200 && !/Acme Mutual|CLM-99887766|48250|48,250|3900|Other Paint|INTERNAL NOTE|"contract"|insCarrier|claimNumber/.test(r4.body), r4.body.slice(0, 200));
  const r5 = await api('p-photos', { projectId: pid });
  ok(tag + 'p-photos carries no notes / names / customer flags', r5.statusCode === 200 && !/INTERNAL NOTE|Sample PM|"shared"|"note"/.test(r5.body), r5.body.slice(0, 200));
  const r6 = await api('p-home', {}, DB.SESSION2);
  ok(tag + 'the other sub does not see this sub\'s things', r6.statusCode === 200 && !/Sample Drywall|SD-1001|nail pops/.test(r6.body));
  ok(tag + '7. no page errors', S.errs.length === 0, S.errs.slice(0, 4).join(' | '));
  ok(tag + '7. no 401 / 403 / 5xx / missing file from the portal', S.bad.length === 0, S.bad.slice(0, 6).join(' | '));
  await S.b.close();
  return S;
}

for (const kind of ['phone', 'desktop']) {
  console.log('\n— sample job, ' + kind);
  await run(kind, JOB);
}
if (REALJOB && !PREVIEW) {
  console.log('\n— real job from the mirror (' + REALJOB.id + '), phone');
  await run('phone', Object.assign({}, REALJOB, { pm: 'Sample PM' }));   /* the sample PM (the mirror's people are not loaded) */
}
if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'index.txt'), INDEX.join('\n') + '\n');
const bad = out.filter(x => !x[1]);
console.log('\nSUBPORTAL E2E: ' + (out.length - bad.length) + ' / ' + out.length + ' passed');
process.exit(bad.length ? 1 : 0);
