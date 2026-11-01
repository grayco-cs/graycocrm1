// test_BULKDROP.mjs [build-dir] [mirror.json] — patch BULKDROP: 📥 Drop invoices & receipts.
//   PART 1 (node, always): bid-inbox ?moneymail=1 op "drop" with the real handler and a fake Supabase: a sub's invoice at a
//     job's address → book (payee sub); a supplier's bill with the PO → book (payee supplier, SUPPLIERPAY: isSub false); a
//     supplier-looking read from a vendor marked isSub true stays a sub; an unknown receipt → match (Needs a job); "other" →
//     review; no amount → match; the same file twice → kept once ("already"); data-entry mode → placed the same, paused: true,
//     nothing sent outside Supabase; a PM is refused.
//   PART 2 (browser, with [build-dir]): the offline harness on a READ-ONLY copy of the production data ([mirror.json], default
//     the session's loop/mirror.json) + made-up jobs / subs / lines; the AI reader is faked (claude-proxy answers from the file
//     name); bid-inbox runs the REAL handler in node against the harness cloud. The office:
//       · the button: on the To-Do and on Accounting, nowhere else (Dashboard, Projects, Leads, Schedule, Subs, Invoices…);
//       · path (a) a QuickBooks expense line with no document gets the file (no new line); (b) a known sub's invoice at a job's
//         address → ▥ Invoices (received, SUBINV) + the pending job cost → ✅ Approvals; (c) a supplier receipt with the PO →
//         a PENDING expense on that job; (d) an unknown vendor → 📥 Needs a job with the file (📄 Open the file) and the reason;
//       · duplicates: the same file again, the same vendor + invoice # already in ▥ Invoices with its file → skipped, linked;
//       · a mixed batch of 30 files → the exact summary counts; every file booked once;
//       · the queue resumes after the window (the page) is closed mid-batch, nothing doubled;
//       · no page errors; no long task over 200 ms while the batch runs.
//   Screenshots (SHOTS dir, default the session scratchpad): bulkdrop_midbatch.png, bulkdrop_summary.png.
// Env: GC_HARNESS (default the wME harness), NODE_ONLY=1, MAXTASK (200), SHOTS.
import { createRequire } from 'module';
import assert from 'assert';
import fs from 'fs'; import path from 'path'; import zlib from 'zlib'; import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FN = path.join(ROOT, 'netlify/functions');
let pass = 0, fail = 0;
const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 900) : '')); } };
const pad = n => String(n).padStart(2, '0');
const day = n => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

/* ── a fake Supabase (gc_kv, sign-in, staff list) over any store with get(key) / set(key, value) ── */
function fakeSupabase(store, opts){
  opts = opts || {};
  const outside = [];
  const f = async (url, o) => {
    o = o || {}; const u = new URL(String(url)); const m = (o.method || 'GET').toUpperCase(); const hd = o.headers || {};
    const auth = hd.Authorization || hd.authorization || '';
    const J = (b, st) => ({ ok: (st || 200) < 300, status: st || 200, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => 'application/json' } });
    if (u.host !== 'sb.test') { outside.push(m + ' ' + u.host + u.pathname); return J({}, 404); }
    if (u.pathname === '/auth/v1/user') { const e = opts.emailOf(auth.replace(/^Bearer /, '')); return e ? J({ email: e, id: 'u' }) : J({}, 401); }
    if (u.pathname === '/rest/v1/gc_staff') { const e = decodeURIComponent(u.searchParams.get('email') || '').replace('eq.', ''); const r = opts.roleOf(e); return J(r ? [{ email: e, role: r, active: true, name: '' }] : []); }
    if (u.pathname === '/rest/v1/gc_kv') {
      const q = u.searchParams.get('key') || ''; const ks = q.startsWith('eq.') ? [decodeURIComponent(q.slice(3))] : q.startsWith('in.') ? q.slice(3).replace(/[()"]/g, '').split(',') : [];
      if (m === 'GET') return J(ks.map(k => store.get(k)).filter(Boolean).map(r => ({ key: r.key, value: r.value, updated_at: r.updated_at })));
      if (m === 'PATCH') { const k = ks[0], at = (u.searchParams.get('updated_at') || '').slice(3); const cur = store.get(k); if (!cur || cur.updated_at !== at) return J([]); const b = JSON.parse(o.body); store.set(k, b.value); return J([{ key: k }]); }
      if (m === 'POST') { let b = JSON.parse(o.body); (Array.isArray(b) ? b : [b]).forEach(r => store.set(r.key, r.value)); return J([], 201); }
      return J([]);
    }
    if (u.pathname.startsWith('/storage/')) return J({}, 200);
    return J([], 200);
  };
  f.outside = outside;
  return f;
}
function mapStore(){ const M = new Map(); let n = 0; return { M, get: k => M.get(k), set: (k, v) => M.set(k, { key: k, value: v, updated_at: new Date(Date.now() + (n++)).toISOString() }) }; }
function mmList(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } return Array.isArray(v) ? v : []; }
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');

/* ══════════════ PART 1 — the server ══════════════ */
console.log('PART 1 — bid-inbox ?moneymail=1 op "drop" (node)');
{
  process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'; process.env.SUPABASE_SERVICE_KEY = 'svc';
  const st = mapStore();
  const iso = new Date().toISOString();
  st.set('users', [{ name: 'Demo Office', email: 'office@grayco-cs.com', role: 'Office Admin', active: true }, { name: 'Demo PM', email: 'pm@grayco-cs.com', role: 'Project Manager', active: true }]);
  st.set('projects', [
    { id: 'P1', name: 'Demo Quill Reroof', address: '4417 Quillfeather Cove, Cordova, TN 38016', autoPO: 'Z901', status: 'Active', client: 'Demo Quill', pm: 'Demo PM' },
    { id: 'P2', name: 'Demo Zephyr Kitchen', address: '9902 Zephyrine Dr, Hernando, MS', autoPO: 'Z902', status: 'Active', client: 'Demo Zephyr', pm: 'Demo PM' }]);
  st.set('vendors', [{ id: 'S1', name: 'Demo Zed Drywall LLC', isSub: true, email: 'zed@example.com' }, { id: 'S2', name: 'Demo Farrel Paint Supply', isSub: false }, { id: 'S3', name: 'Demo Oakline Supply', isSub: true }]);
  st.set('subs', []); st.set('invs', []); st.set('invoices', []); st.set('expenses', []); st.set('ccw_suppliers', []);
  st.set('gc_mail_money', []); st.set('gc_mail_money_done', {});
  const staff = { 'office@grayco-cs.com': 'staff', 'pm@grayco-cs.com': 'staff' };
  const SBF = fakeSupabase(st, { emailOf: t => t.replace(/^tok-/, ''), roleOf: e => staff[e] }); global.fetch = SBF;
  const H = require(FN + '/bid-inbox.js').handler;
  const ev = (who, body) => ({ httpMethod: 'POST', queryStringParameters: { moneymail: '1' }, headers: { authorization: 'Bearer tok-' + who, origin: 'https://crm.grayco-cs.com' }, body: JSON.stringify(body) });
  const ref = (t, ext) => 'sb:crm-files/' + sha(t) + '.' + (ext || 'pdf');
  const item = (id, t, kind, read, ext) => ({ id, name: id + '.' + (ext || 'pdf'), type: ext === 'jpg' ? 'image/jpeg' : 'application/pdf', size: 1000, ref: ref(t, ext), sha: sha(t), srcSha: sha(t), kind, read });
  const r1 = await H(ev('office@grayco-cs.com', { op: 'drop', items: [
    item('sub', 'f-sub', 'sub_invoice', { vendor: 'Zed Drywall', invoiceNumber: 'ZD-101', date: day(-2), total: 2500, jobAddress: '4417 Quillfeather Cv, Cordova TN' }),
    item('sup', 'f-sup', 'supplier_invoice', { vendor: 'Farrel Paint Supply', invoiceNumber: 'FP-77', date: day(-1), total: 312.18, po: 'Z902' }),
    item('oak', 'f-oak', 'supplier_invoice', { vendor: 'Oakline Supply', invoiceNumber: 'OK-1', date: day(-1), total: 900, jobAddress: '9902 Zephyrine Drive, Hernando MS' }),
    item('unk', 'f-unk', 'receipt', { vendor: 'Demo Nowhere Diner', date: day(-1), total: 23.1 }, 'jpg'),
    item('oth', 'f-oth', 'other', { vendor: 'Some Flyer' }, 'jpg'),
    item('noamt', 'f-noamt', 'supplier_invoice', { vendor: 'Farrel Paint Supply', po: 'Z902' })] }));
  ok(r1.statusCode === 200, 'the office drops 6 files → 200', r1.body);
  const b1 = JSON.parse(r1.body), R = id => (b1.results || []).find(x => x.id === id) || {};
  const si = id => (R(id).rec || {}).si || {};
  ok(si('sub').route === 'book' && si('sub').payee === 'sub' && si('sub').job && si('sub').job.pid === 'P1' && si('sub').sub.id === 'S1', '(b) a known sub\'s invoice at the job\'s address → book on that job (payee sub)', si('sub'));
  ok(si('sub').payDate && /pay|Wednesday|Friday|cut-off/i.test(si('sub').payRule), '(b) the sub pay rule gives the pay date', [si('sub').payDate, si('sub').payRule]);
  ok(si('sup').route === 'book' && si('sup').payee === 'supplier' && si('sup').job.pid === 'P2', '(c) a supplier\'s bill with the PO → book on the PO\'s job (payee supplier)', si('sup'));
  ok(si('oak').payee === 'sub', 'a "supplier" read from a vendor marked isSub: true stays a sub (SUPPLIERPAY\'s list wins)', si('oak').payee);
  ok(R('unk').rec.kind === 'receipt' && si('unk').route === 'match' && /no job/.test(si('unk').why), '(d) an unknown receipt with no job → match (📥 Needs a job), with why', si('unk'));
  ok(R('oth').rec.kind === 'receipt' && si('oth').route === 'review' && /could not tell/.test(si('oth').why), '"other" → review, kept as a receipt-like item for Needs a job', si('oth'));
  ok(si('noamt').route === 'match' && /amount could not be read/.test(si('noamt').why), 'no amount → match ("the amount could not be read")', si('noamt'));
  const L1 = mmList(st.get('gc_mail_money').value);
  ok(L1.length === 6 && L1.every(r => r.via === 'bulk drop' && /^MM-[0-9a-f]{16}$/.test(r.id) && r.files[0].ref.startsWith('sb:crm-files/')), 'kept in gc_kv gc_mail_money (via bulk drop, the file on each)', L1.map(r => [r.id, r.via]));
  ok(b1.paused === false && SBF.outside.length === 0, 'not paused; nothing left for anywhere but Supabase', SBF.outside);
  /* the same file again */
  const r2 = await H(ev('office@grayco-cs.com', { op: 'drop', items: [item('sub2', 'f-sub', 'sub_invoice', { vendor: 'Zed Drywall', invoiceNumber: 'ZD-101', total: 2500 })] }));
  const b2 = JSON.parse(r2.body);
  ok(r2.statusCode === 200 && b2.results[0].already === true && b2.results[0].rec.dropId === 'sub' && mmList(st.get('gc_mail_money').value).length === 6, 'the same file again → "already" (kept once), names the first drop', b2.results && b2.results[0]);
  /* the same sub + invoice # in a new file → dup */
  const r3 = await H(ev('office@grayco-cs.com', { op: 'drop', items: [item('sub3', 'f-sub-copy', 'sub_invoice', { vendor: 'Zed Drywall', invoiceNumber: 'ZD-101', date: day(-2), total: 2500, jobAddress: '4417 Quillfeather Cove' })] }));
  const s3 = JSON.parse(r3.body).results[0].rec.si;
  ok(s3.route === 'dup' && /invoice # ZD-101/.test(s3.dup.why), 'a new file with the same sub + invoice # → dup (names it)', s3);
  /* data-entry mode */
  st.set('gc_automation_pause', { on: true, by: 'test' }); require(FN + '/_lib/pause.js').reset();
  const r4 = await H(ev('office@grayco-cs.com', { op: 'drop', items: [item('p1', 'f-paused', 'receipt', { vendor: 'Farrel Paint Supply', total: 44.5, po: 'Z901', date: day(0) })] }));
  const b4 = JSON.parse(r4.body);
  ok(r4.statusCode === 200 && b4.paused === true && b4.results[0].rec.si.route === 'book' && SBF.outside.length === 0, 'data-entry mode: placed the same way, answer says paused, nothing sent anywhere', { paused: b4.paused, route: b4.results[0].rec.si.route, outside: SBF.outside });
  st.set('gc_automation_pause', { on: false }); require(FN + '/_lib/pause.js').reset();
  /* who may */
  const r5 = await H(ev('pm@grayco-cs.com', { op: 'drop', items: [item('x', 'f-x', 'receipt', { total: 1 })] }));
  ok(r5.statusCode === 403, 'a PM is refused (admins + the office only)', r5.statusCode);
  const r6 = await H(ev('office@grayco-cs.com', { op: 'drop', items: [{ id: 'bad', name: 'x.pdf', ref: 'data:application/pdf;base64,AAAA', kind: 'receipt', read: { total: 5 } }] }));
  ok(r6.statusCode === 400, 'a file that is not in the CRM\'s file store is refused (store first)', r6.statusCode);
  delete global.fetch;
}

/* ══════════════ PART 2 — the browser ══════════════ */
const BUILD = process.argv[2] && path.resolve(process.argv[2]);
if (!BUILD || process.env.NODE_ONLY) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); }
console.log('PART 2 — the browser (' + BUILD + ')');
const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const MIRROR = process.argv[3] || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const MAXTASK = +(process.env.MAXTASK || 200);
const HN = await import(pathToFileURL(process.env.GC_HARNESS || SPD + '/wME/harness.mjs').href);
const { computer, sleep, cloud, ACCOUNTS, cget, cset } = HN;
ACCOUNTS['office@grayco-cs.com'].role = 'office';
ACCOUNTS['sbiffle@grayco-cs.com'] = ACCOUNTS['sbiffle@grayco-cs.com'] || { pw: 'Correct-Horse-7', id: 'u-s', role: 'staff' };

/* the production mirror (read-only copy) + made-up jobs, subs and lines (names start with "Demo") */
const rows = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
cloud.clear(); for (const r of rows) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
const val = k => { let v = cget(k); if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; };
const iso = new Date(Date.now() - 3600e3).toISOString();
const P = [
  { id: 'PBD1', name: 'Demo Quill Reroof', address: '4417 Quillfeather Cove, Cordova, TN 38016', autoPO: 'Z901', status: 'Active', client: 'Demo Quill', pm: 'Steven Biffle', contract: 20000, savedAt: iso, updatedAt: iso },
  { id: 'PBD2', name: 'Demo Zephyr Kitchen', address: '9902 Zephyrine Dr, Hernando, MS 38632', autoPO: 'Z902', status: 'Active', client: 'Demo Zephyr', pm: 'Steven Biffle', contract: 30000, savedAt: iso, updatedAt: iso },
  { id: 'PBD3', name: 'Demo Marlowe Bath', address: '7731 Marlowbrook Ln, Germantown, TN', autoPO: 'Z903', status: 'Active', client: 'Demo Marlowe', pm: 'Steven Biffle', contract: 15000, savedAt: iso, updatedAt: iso }];
cset('projects', (val('projects') || []).concat(P));
const SUBS = [{ id: 'SBD1', name: 'Demo Zed Drywall LLC', isSub: true, email: 'zed@example.com', w9: true, insExp: day(300) }, { id: 'SBD2', name: 'Demo Farrel Paint Supply', isSub: false }, { id: 'SBD3', name: 'Demo Pinecrest Roofing', isSub: true }];
cset('vendors', (val('vendors') || []).concat(SUBS)); cset('subs', (val('subs') || []).concat(SUBS));
const DOCREF = 'sb:crm-files/' + sha('existing-doc') + '.pdf';
/* the lines the QuickBooks CSV / card statement made (no document yet), and one that has its document */
const QB = [];
const qbv = ['Demo Quillon Lumber Co', 'Demo Brightway Electric Supply', 'Demo Kessler Hardware', 'Demo Tolliver Rentals', 'Demo Ashgrove Plumbing Supply', 'Demo Harlan Concrete', 'Demo Vantage Glass', 'Demo Wexford Tile', 'Demo Corliss Insulation', 'Demo Danbury Doors'];
qbv.forEach((v, i) => QB.push({ id: 'EQB' + i, pid: i % 2 ? 'PBD1' : 'PBD2', type: 'purchase', vendor: v, desc: 'QuickBooks entry', amt: 100 + i * 37.25, cat: 'Materials', date: day(-3 - i % 3), status: 'approved', source: 'quickbooks', by: 'QuickBooks import', savedAt: iso, updatedAt: iso }));
QB.push({ id: 'ECARD1', pid: 'PBD3', type: 'purchase', vendor: 'THE HOME DEPOT #6620', desc: 'Card charge', amt: 61.47, category: 'Materials', date: day(-2), status: 'paid', method: 'Credit Card', source: 'creditcard', savedAt: iso, updatedAt: iso });
QB.push({ id: 'EAMB1', pid: 'PBD1', type: 'purchase', vendor: 'Demo Twin Supply', amt: 77, date: day(-2), status: 'approved', source: 'quickbooks', savedAt: iso, updatedAt: iso }, { id: 'EAMB2', pid: 'PBD2', type: 'purchase', vendor: 'Demo Twin Supply', amt: 77, date: day(-2), status: 'approved', source: 'quickbooks', savedAt: iso, updatedAt: iso });
QB.push({ id: 'EDOC1', pid: 'PBD3', type: 'purchase', vendor: 'Demo Haverford Metals', amt: 410, date: day(-4), status: 'approved', source: 'manual', receipt: DOCREF, receiptName: 'old.pdf', docSha: sha('dup-hash-file'), savedAt: iso, updatedAt: iso });
cset('expenses', (val('expenses') || []).concat(QB));
const BILL = { id: 'IBDQB1', type: 'sub', pid: 'PBD2', sub: 'Demo Pinecrest Roofing', subId: 'SBD3', invNum: 'PR-5521', amt: 4200, desc: 'QuickBooks bill #PR-5521', recvDate: day(-6), date: day(-6), status: 'received', source: 'quickbooks', qbKey: 'b1', savedAt: iso, updatedAt: iso };
const HASDOC = { id: 'IBDDOC1', type: 'sub', pid: 'PBD1', sub: 'Demo Zed Drywall LLC', subId: 'SBD1', invNum: 'ZD-099', amt: 1800, desc: 'Sub invoice #ZD-099', recvDate: day(-20), date: day(-20), status: 'approved', fileName: 'zd-099.pdf', fileData: DOCREF, savedAt: iso, updatedAt: iso };
cset('invs', (val('invs') || []).concat([BILL, HASDOC]));
cset('gc_mail_money', JSON.stringify([])); cset('gc_mail_money_done', {});
for (const [k, r] of cloud) cloud.set(k, Object.assign({}, r, { updated_at: r.updated_at || iso }));

/* ── the files: tiny PDFs and PNGs (each unique) and what the fake reader says about each ── */
function crc32(buf){ let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data){ const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); }
function png(seed){ const w = 24, h = 24, raw = Buffer.alloc((w * 3 + 1) * h); const hs = crypto.createHash('md5').update(seed).digest(); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w * 3; x++) raw[y * (w * 3 + 1) + 1 + x] = hs[(x + y) % 16] ^ (x * y); }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
function pdf(seed){ const c = 'BT /F1 11 Tf 50 750 Td (' + seed.replace(/[()\\]/g, '') + ') Tj ET'; return Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj 4 0 obj<</Length ' + c.length + '>>stream\n' + c + '\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n', 'latin1'); }
const READS = {};   /* file name → { kind, read } (what the fake AI answers) */
const files = [];
function F(name, kind, read, bytes){ READS[name] = { kind, read }; files.push({ name, mimeType: /\.png$/.test(name) ? 'image/png' : 'application/pdf', buffer: bytes || (/\.png$/.test(name) ? png(name) : pdf(name)) }); return name; }
/* a mixed batch of 30: 12 attached, 6 sub invoices, 5 expenses, 4 need a job, 3 duplicates */
const EXPECT = { attached: 12, subinv: 6, expense: 5, needs: 4, dup: 3 };
qbv.forEach((v, i) => F('qb-' + i + '.pdf', 'supplier_invoice', { vendor: v.replace(/^Demo /, '').replace(/ Co$/, ' Company'), invoiceNumber: 'Q' + (100 + i), date: day(-2 - (i % 2)), total: 100 + i * 37.25 }));        // (a) 10
F('hd-receipt.png', 'receipt', { vendor: 'Home Depot', date: day(-1), total: 61.80 });                                                                                                             // (a) a receipt within $0.50 of the card line
F('pinecrest-PR5521.pdf', 'sub_invoice', { vendor: 'Pinecrest Roofing', invoiceNumber: 'PR-5521', date: day(-30), total: 4200, jobAddress: '9902 Zephyrine Dr' });                               // (a) the QuickBooks bill (same invoice #)
const subAmts = [2500, 1875.5, 940, 3120, 610.25, 1450];
subAmts.forEach((a, i) => F('zed-' + i + '.pdf', 'sub_invoice', { vendor: 'Zed Drywall', invoiceNumber: 'ZD-1' + pad(i), date: day(-1), total: a, jobAddress: ['4417 Quillfeather Cv, Cordova TN', '9902 Zephyrine Drive, Hernando MS', '7731 Marlowbrook Lane'][i % 3] }));   // (b) 6
F('farrel-1.pdf', 'supplier_invoice', { vendor: 'Farrel Paint Supply', invoiceNumber: 'FP-1', date: day(-1), total: 312.18, po: 'Z902' });                                                       // (c)
F('farrel-2.png', 'receipt', { vendor: 'Farrel Paint Supply', date: day(0), total: 48.09, jobAddress: '4417 Quillfeather Cove' });                                                             // (c)
F('farrel-3.pdf', 'supplier_invoice', { vendor: 'Farrel Paint Supply', invoiceNumber: 'FP-3', date: day(-2), total: 1290, jobName: 'Demo Marlowe Bath', po: 'Z903' });                         // (c)
F('lumber-po.pdf', 'supplier_invoice', { vendor: 'Demo Gristmill Lumber', invoiceNumber: 'GL-9', date: day(-1), total: 733.4, po: 'Z901' });                                                    // (c)
F('rcpt-z902.png', 'receipt', { vendor: 'Demo Cobalt Hardware', date: day(0), total: 19.99, po: 'Z902' });                                                                                    // (c)
F('diner.png', 'receipt', { vendor: 'Demo Nowhere Diner', date: day(-1), total: 23.1 });                                                                                                      // (d) no job
F('twin.pdf', 'supplier_invoice', { vendor: 'Twin Supply', invoiceNumber: '', date: day(-2), total: 77 });                                                                                     // (d) two lines fit → not attached, possible duplicate
F('stranger-sub.pdf', 'sub_invoice', { vendor: 'Demo Unknown Framing Crew', invoiceNumber: 'UF-1', date: day(-1), total: 5000, jobAddress: '4417 Quillfeather Cove' });                         // (d) not on the sub list
F('unreadable.png', 'error', null);                                                                                                                                                         // (d) the reader fails
F('zed-0-copy.pdf', 'sub_invoice', READS['zed-0.pdf'].read, files.find(f => f.name === 'zed-0.pdf').buffer);                                                                                  // dup: the same file in the batch
F('zed-099.pdf', 'sub_invoice', { vendor: 'Zed Drywall', invoiceNumber: 'ZD-099', date: day(-20), total: 1800, jobAddress: '4417 Quillfeather Cove' });                                         // dup: vendor + invoice # with its file
F('haverford.pdf', 'supplier_invoice', { vendor: 'Haverford Metals', total: 410 }, Buffer.from('dup-hash-file'));                                                                              // dup: the same file is on an expense (docSha)
ok(files.length === 30, 'the mixed batch has 30 files', files.length);

/* ── the browser ── */
const BI = (() => { process.env.SUPABASE_URL = 'https://sb.test'; return require(FN + '/bid-inbox.js'); })();
const ids = Object.fromEntries(Object.entries(ACCOUNTS).map(([e, a]) => [a.id, e]));
const sbFetch = fakeSupabase({ get: k => cloud.get(k), set: (k, v) => cset(k, v) }, { emailOf: t => { const m = /^utok-(u-[a-z]+)-\d+$/.exec(t); return m ? ids[m[1]] : ''; }, roleOf: e => ACCOUNTS[e] && ACCOUNTS[e].role });
global.fetch = sbFetch;
let aiDelay = 0, aiCalls = 0;
const S = { mid: false };
async function setup(c){
  await c.ctx.addInitScript(() => { window.__LT = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__LT.push({ t: e.startTime, ms: e.duration }))).observe({ type: 'longtask', buffered: true }); } catch (e) {} });
  await c.ctx.route(u => /\/\.netlify\/functions\/claude-proxy/.test(u), async r => {
    aiCalls++;
    const b = JSON.parse(r.request().postData() || '{}'); const txt = (b.messages[0].content.find(x => x.type === 'text') || {}).text || '';
    const name = (/File name: (.+)$/m.exec(txt) || [])[1] || ''; const x = READS[name.trim()];
    if (aiDelay) await sleep(aiDelay);
    if (!(b.model === 'claude-sonnet-4-6' && b.max_tokens === 1200)) return r.fulfill({ status: 400, contentType: 'application/json', body: '{"error":{"message":"wrong model / setting"}}' });
    if (!x || x.kind === 'error') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: 'Sorry, I cannot read this.' }] }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(Object.assign({ kind: x.kind }, x.read)) }] }) });
  });
  await c.ctx.route(u => /\/\.netlify\/functions\/bid-inbox/.test(u), async r => {
    const q = r.request(); const u = new URL(q.url()); const hd = q.headers();
    const res = await BI.handler({ httpMethod: q.method(), queryStringParameters: Object.fromEntries(u.searchParams), headers: { authorization: hd.authorization || '', origin: 'https://crm.grayco-cs.com' }, body: q.postData() || '' });
    return r.fulfill({ status: res.statusCode, contentType: 'application/json', body: res.body });
  });
}
async function boot(name, email, mobile){
  const c = await computer(name, { build: BUILD, mobile }); await setup(c);
  const p = c.page(); if (!mobile) await p.setViewportSize({ width: 1366, height: 860 });
  await p.goto('https://app.local/index.html'); await p.waitForSelector('#gc-auth-email', { timeout: 120000 }); await sleep(1200);
  for (let i = 0; i < 5; i++) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(ACCOUNTS[email].pw); await sleep(300); if ((await p.locator('#gc-auth-email').inputValue()) === email) break; }
  const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  const up = await waitEv(c, () => !!(window._crm && (window._crm.projects || []).some(p => p.id === 'PBD1') && window._gcBulkDrop && window._gcStoreFile && window._gcMoneyMail && window._gcSubInv && window._gcMoney), null, 180000);
  await sleep(4000);
  await p.evaluate(() => { for (const b of [...document.querySelectorAll('button')]) if (b.offsetParent && /^(Later|Got it!?|Not now|×|✕|Skip)$/.test(b.textContent.trim())) b.click(); }).catch(() => {});
  return { c, p, up };
}
const ev = (c, f, a) => c.page().evaluate(f, a);
async function waitEv(c, f, a, ms){ const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await ev(c, f, a).catch(() => null); if (v) return v; await sleep(300); } return v; }
const view = (c, v) => ev(c, v => { window._setView(v); }, v);
const btns = c => ev(c, () => [...document.querySelectorAll('.gc-bulkdrop-btn')].map(b => b.id + (b.offsetParent ? '' : ':hidden')));
async function dropFiles(c, list){
  await ev(c, () => window._gcBulkDrop.open());
  await c.page().waitForSelector('.gc-bd-ov [data-bd="pick"]', { state: 'attached', timeout: 10000 });
  await c.page().setInputFiles('.gc-bd-ov [data-bd="pick"]', list.map(f => ({ name: f.name, mimeType: f.mimeType, buffer: f.buffer })));
}
const allDone = c => waitEv(c, () => { const s = window._gcBulkDrop.summary(); return s.files && s.done ? s : null; }, null, 240000);
const itemsOf = c => ev(c, () => window._gcBulkDrop.items().map(x => ({ name: x.name, st: x.st, k: x.out && x.out.k, why: x.out && x.out.why, link: x.out && x.out.link, ref: x.ref, mm: x.mmId, batch: x.batch })));

const A = await boot('office', 'office@grayco-cs.com');
ok(A.up, 'the office signed in on the production mirror (+ the made-up jobs)');
/* ── the button: To-Do and Accounting only ── */
const where = {};
for (const v of ['dashboard', 'projects', 'leads', 'schedule', 'subs', 'invoices', 'expenses', 'approvals', 'todo', 'taxcenter']) { await view(A.c, v); await sleep(2600); where[v] = await btns(A.c); }
ok(where.todo.includes('gc-bulkdrop-todo') && where.todo.length === 1, 'To-Do: 📥 Drop invoices & receipts (next to Needs a job / Import card statement)', where.todo);
ok(where.taxcenter.includes('gc-bulkdrop-acct') && where.taxcenter.length === 1, 'Accounting: the button in its tool row', where.taxcenter);
const leak = Object.entries(where).filter(([v, l]) => v !== 'todo' && v !== 'taxcenter' && l.length);
ok(!leak.length, 'the button is on no other page (Dashboard, Projects, Leads, Schedule, Subs, Invoices, Expenses, Approvals)', leak);
const order = await ev(A.c, () => { const a = document.getElementById('gc-money-needs'), b = document.getElementById('gc-bulkdrop-acct'); return { acct: !!(b && b.closest('#gck-root .gck-tools')) }; });
ok(order.acct, 'Accounting: inside #gck-root .gck-tools', order);
await view(A.c, 'todo'); await sleep(2500);
ok(await ev(A.c, () => { const a = document.getElementById('gc-money-needs'), b = document.getElementById('gc-bulkdrop-todo'); return !!(a && b && a.nextElementSibling === b); }), 'To-Do: right after patch MONEY\'s row');

/* ── the mixed batch of 30 (a, b, c, d, duplicates) — mid-batch screenshot, then the summary ── */
aiDelay = 700;
const lt0 = await ev(A.c, () => performance.now());
await A.p.click('#gc-bulkdrop-todo');
await dropFiles(A.c, files);
await waitEv(A.c, () => { const s = window._gcBulkDrop.summary(); return s.files === 30 && s.left > 5 && s.left < 25; }, null, 120000);
await A.p.screenshot({ path: path.join(SHOTS, 'bulkdrop_midbatch.png') });
const midTxt = await ev(A.c, () => (document.querySelector('.gc-bd-sum') || {}).textContent || '');
ok(/still working/.test(midTxt) && await ev(A.c, () => document.querySelectorAll('.gc-bd-row').length === 30), 'mid-batch: a row per file and the progress line', midTxt);
const sm = await allDone(A.c);
aiDelay = 0;
await sleep(1500);
await A.p.screenshot({ path: path.join(SHOTS, 'bulkdrop_summary.png') });
const lt = await ev(A.c, t0 => window.__LT.filter(x => x.t >= t0).map(x => Math.round(x.ms)), lt0);
const its = await itemsOf(A.c);
const by = n => its.find(x => x.name === n) || {};
console.log('    summary: ' + (sm && sm.text));
ok(sm && Object.keys(EXPECT).every(k => sm.counts[k] === EXPECT[k]) && sm.counts.error === 0, 'summary counts: 12 attached, 6 sub invoices, 5 expenses, 4 need a job, 3 duplicates', sm && sm.counts);
ok(sm && sm.text === '30 files — 12 attached to existing lines, 6 sub invoices to Approvals, 5 expenses booked, 4 need a job, 3 duplicates skipped', 'the summary line reads like the owner\'s', sm && sm.text);
const wrong = its.filter(x => { const n = x.name; const want = /^qb-|^hd-|^pinecrest/.test(n) ? 'attached' : /^zed-\d\.pdf$/.test(n) ? 'subinv' : /^farrel|^lumber|^rcpt/.test(n) ? 'expense' : /^diner|^twin|^stranger|^unreadable/.test(n) ? 'needs' : 'dup'; return x.k !== want; });
ok(!wrong.length, 'every file went where it belongs', wrong);
ok(lt.every(ms => ms <= MAXTASK), 'no long task over ' + MAXTASK + ' ms while the batch ran', lt.filter(ms => ms > 80));
ok(aiCalls >= 26 && aiCalls <= 30, 'the reader was asked once per new file (the same model / setting as the 💳 receipt reader)', aiCalls);

/* (a) */
await sleep(2500);
const ex = await ev(A.c, () => { const E = window._crm.expenses; const g = id => E.find(e => e.id === id) || {}; return { q0: g('EQB0'), q9: g('EQB9'), card: g('ECARD1'), n: E.length, amb: [g('EAMB1').receipt || '', g('EAMB2').receipt || ''] }; });
ok(/^sb:crm-files\/[0-9a-f]{64}\.pdf$/.test(ex.q0.receipt || '') && ex.q0.files && ex.q0.files.length === 1 && ex.q0.docSha && ex.q0.amt === 100, '(a) the QuickBooks line "Quillon Lumber" got the file (receipt + files + its fingerprint), amount unchanged', ex.q0);
ok(/^sb:crm-files\//.test(ex.card.receipt || ''), '(a) a receipt $0.33 off the card line (Home Depot) is attached to it', ex.card);
ok(!ex.amb[0] && !ex.amb[1], '(a) two lines that fit equally → neither is touched (Needs a job, possibly a duplicate)', ex.amb);
const bill = await ev(A.c, () => window._crm.invoices.find(i => i.id === 'IBDQB1') || {});
ok(/^sb:crm-files\//.test(bill.fileData || '') && bill.amt === 4200, '(a) the QuickBooks bill PR-5521 got the file (same invoice #), no second invoice', { fileData: bill.fileData, amt: bill.amt });
ok(/QuickBooks/.test(by('qb-0.pdf').why) && by('qb-0.pdf').link && by('qb-0.pdf').link.id === 'EQB0', '(a) the row says which QuickBooks line and links to it', by('qb-0.pdf'));
/* (b) */
const subs = await ev(A.c, () => window._crm.invoices.filter(i => /^INVM-/.test(i.id) && i.sub === 'Demo Zed Drywall LLC').map(i => ({ id: i.id, pid: i.pid, amt: i.amt, status: i.status, payDate: i.payDate, src: i.source, ref: i.fileData, desc: i.desc })));
ok(subs.length === 6 && subs.every(i => i.status === 'received' && i.payDate && i.src === 'bulkdrop' && /^sb:crm-files\//.test(i.ref) && /dropped in the CRM/.test(i.desc)), '(b) 6 received sub invoices in ▥ Invoices (file on each, the pay date, "dropped in")', subs);
const pids = subs.map(i => i.pid).sort().join(',');
ok(pids === 'PBD1,PBD1,PBD2,PBD2,PBD3,PBD3', '(b) each on the job its address names', pids);
const costRows = await ev(A.c, () => window._crm.expenses.filter(e => e.subInvId && /^INVM-/.test(e.subInvId) && e.status === 'pending').length);
ok(costRows === 6, '(b) one pending job cost per sub invoice (SUBINV)', costRows);
await view(A.c, 'approvals'); await sleep(3500);
const appr = await ev(A.c, () => { let q = []; try { q = JSON.parse(localStorage.getItem('gc_sub_approvals') || '[]'); } catch (e) {} const mine = q.filter(a => /^INVM-/.test(String(a.invId || a.id || ''))); const g = window._gcApprovalSet ? window._gcApprovalSet() : null;
  return { queued: mine.length, pm: [...new Set(mine.map(a => a.pmName))], status: [...new Set(mine.map(a => a.status))], seen: g ? (g.groups.subinv || []).length : -1, routed: window._crm.invoices.filter(i => /^INVM-/.test(i.id) && (i._subRouted || i._autoRouted)).length }; });
ok(appr && ((appr.queued >= 6 && appr.status.includes('pending_pm')) || appr.routed >= 6), '(b) in the ✅ Approvals queue (pending, asked of the job\'s PM first — SUBINV routing)', appr);
/* (c) */
const exp = await ev(A.c, () => window._crm.expenses.filter(e => /^EXPM-/.test(e.id) && e.source === 'bulkdrop').map(e => ({ pid: e.pid, amt: e.amt, status: e.status, ref: e.receipt, v: e.vendor, desc: e.desc })));
ok(exp.length === 5 && exp.every(e => e.status === 'pending' && /^sb:crm-files\//.test(e.ref)), '(c) 5 PENDING expenses with their files (the usual approval)', exp);
const fx = v => (exp.find(e => e.amt === v) || {}).pid;
ok(fx(312.18) === 'PBD2' && fx(48.09) === 'PBD1' && fx(1290) === 'PBD3' && fx(733.4) === 'PBD1' && fx(19.99) === 'PBD2', '(c) each on its job (PO / address)', exp.map(e => [e.v, e.amt, e.pid]));
ok(exp.some(e => /Receipt dropped in/.test(e.desc)), '(c) a receipt says "dropped in", not "e-mailed in"', exp.map(e => e.desc));
/* (d) */
await view(A.c, 'todo'); await sleep(2500);
await ev(A.c, () => window._gcOpenNeedsJob());
await waitEv(A.c, () => !!document.querySelector('.gc-money-ov [data-i]'), null, 15000);
const nj = await ev(A.c, () => [...document.querySelectorAll('.gc-money-ov [data-i]')].map(r => ({ t: r.textContent.slice(0, 220), file: !!r.querySelector('[data-m="file"]') })));
const njd = nj.filter(r => /Nowhere Diner|Twin Supply|Unknown Framing|unreadable/i.test(r.t));
ok(njd.length === 4 && njd.every(r => r.file), '(d) 📥 Needs a job has all 4, each with "📄 Open the file"', nj.map(r => r.t.slice(0, 90)));
ok(/no job/i.test((nj.find(r => /Nowhere Diner/.test(r.t)) || {}).t || '') && /not on the CRM's sub list|sub list/.test((nj.find(r => /Unknown Framing/.test(r.t)) || {}).t || ''), '(d) with the reason (no job matched / not on the sub list)', njd.map(r => r.t.slice(0, 160)));
ok(/possibly a duplicate|2 lines fit|same vendor and amount/i.test(by('twin.pdf').why) && /not read|could not read/i.test(by('unreadable.png').why), '(d) the drop rows say why (possible duplicate / not read — open it)', [by('twin.pdf').why, by('unreadable.png').why]);
const fileOpen = await ev(A.c, () => { const b = document.querySelector('.gc-money-ov [data-m="file"]'); let got = null; const o = window._gcOpenRef; window._gcOpenRef = (r, n) => { got = [r, n]; }; b.click(); window._gcOpenRef = o; return got; });
ok(fileOpen && /^sb:crm-files\//.test(fileOpen[0]), '(d) "📄 Open the file" opens the stored file', fileOpen);
await ev(A.c, () => { const x = document.querySelector('.gc-money-ov'); if (x) x.remove(); });
/* duplicates */
ok(/same file was dropped in this batch/.test(by('zed-0-copy.pdf').why) && /invoice # ZD-099/.test(by('zed-099.pdf').why) && by('zed-099.pdf').link && by('zed-099.pdf').link.id === 'IBDDOC1' && /same file is on an expense/.test(by('haverford.pdf').why) && by('haverford.pdf').link.id === 'EDOC1', 'duplicates: the same file in the batch, the same vendor + invoice # with its file, the same file on an expense — each linked', ['zed-0-copy.pdf', 'zed-099.pdf', 'haverford.pdf'].map(n => [by(n).why, by(n).link]));
const counts = await ev(A.c, () => ({ inv: window._crm.invoices.filter(i => /^INVM-/.test(i.id)).length, exp: window._crm.expenses.filter(e => /^EXPM-/.test(e.id) && e.source === 'bulkdrop').length }));
ok(counts.inv === 6 && counts.exp === 5, 'nothing booked twice (6 sub invoices, 5 expenses)', counts);
const mm = mmList(cget('gc_mail_money'));
ok(mm.filter(r => r.via === 'bulk drop').length === 15 && mm.every(r => r.files && r.files[0] && /^sb:crm-files\//.test(r.files[0].ref)), 'the server kept the 15 placed by it (b, c, d) with their files', mm.length);
/* the summary rows are clickable */
await ev(A.c, () => window._gcBulkDrop.open()); await sleep(600);
await A.p.click('.gc-bd-chip[data-k="needs"]'); await sleep(500);
const fl = await ev(A.c, () => document.querySelectorAll('.gc-bd-row').length);
ok(fl === 4, 'the "4 need a job" part filters the list', fl);
await A.p.click('.gc-bd-row [data-bd="go"]'); await sleep(1200);
ok(await ev(A.c, () => !!document.querySelector('.gc-money-ov') && !document.querySelector('.gc-bd-ov')), 'a "need a job" row opens 📥 Needs a job');
await ev(A.c, () => { const x = document.querySelector('.gc-money-ov'); if (x) x.remove(); });
await ev(A.c, () => window._gcBulkDrop.open()); await sleep(400);
await A.p.click('.gc-bd-chip[data-k="subinv"]'); await sleep(400);
let opened = null;
await ev(A.c, () => { window.__apprOpened = 0; const o = window._gcOpenApprovals; window._gcOpenApprovals = function(){ window.__apprOpened++; return o && o.apply(this, arguments); }; });
await A.p.click('.gc-bd-row [data-bd="go"]'); await sleep(1200);
opened = await ev(A.c, () => window.__apprOpened);
ok(opened === 1, 'a sub invoice row opens ✅ Approvals', opened);

/* ── the queue resumes after the page is closed mid-batch ── */
const R = files.slice(0, 0);
const RES = ['res-a.pdf', 'res-b.pdf', 'res-c.png', 'res-d.pdf'].map((n, i) => { F(n, 'supplier_invoice', { vendor: 'Farrel Paint Supply', invoiceNumber: 'RS-' + i, date: day(0), total: 50 + i, po: 'Z903' }); return files.find(f => f.name === n); });
aiDelay = 2500;
await ev(A.c, () => window._gcBulkDrop.close());
await dropFiles(A.c, RES);
await waitEv(A.c, () => window._gcBulkDrop.items().filter(x => /^res-/.test(x.name) && x.st === 'placed').length >= 1, null, 60000);
const before = await ev(A.c, () => window._gcBulkDrop.items().filter(x => /^res-/.test(x.name)).map(x => x.st));
await A.p.close();   /* the CRM is closed mid-batch */
aiDelay = 0;
const p2 = await A.c.ctx.newPage(); A.c.pages.push(p2);
p2.on('pageerror', e => A.c.errs.push('PAGEERROR ' + e.message));
await p2.goto('https://app.local/index.html');
await waitEv(A.c, () => !!(window._crm && (window._crm.projects || []).some(p => p.id === 'PBD1') && window._gcBulkDrop), null, 180000);
const res = await waitEv(A.c, () => { const L = window._gcBulkDrop.items().filter(x => /^res-/.test(x.name)); return L.length === 4 && L.every(x => x.st === 'placed') ? L.map(x => x.out.k) : null; }, null, 120000);
ok(before.some(s => s !== 'placed') && res && res.every(k => k === 'expense'), 'closed mid-batch → the queue resumed on the next open and finished (4 expenses)', { before, res });
await sleep(3000);
const resN = await ev(A.c, () => window._crm.expenses.filter(e => /^EXPM-/.test(e.id) && e.pid === 'PBD3' && e.amt >= 50 && e.amt < 54).length);
ok(resN === 4, 'each resumed file booked exactly once', resN);
ok(A.c.errs.length === 0, 'no page errors', A.c.errs.slice(0, 5));
await A.c.b.close();

/* ── a PM never sees it ── */
const B = await boot('pm', 'sbiffle@grayco-cs.com');
for (const v of ['todo', 'dashboard', 'projects']) { await view(B.c, v); await sleep(2500); }
ok(B.up && (await btns(B.c)).length === 0 && await ev(B.c, () => !window._gcBulkDrop.state().items.some(x => x)), 'a PM: no button anywhere (money people only)');
ok(B.c.errs.length === 0, 'PM: no page errors', B.c.errs.slice(0, 3));
await B.c.b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
