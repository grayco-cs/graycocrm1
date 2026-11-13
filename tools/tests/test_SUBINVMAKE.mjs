// test_SUBINVMAKE.mjs [build-dir] [shot-dir] — patch SUBINVMAKE (owner 11/13: "on subs portal make where they can manually enter an invoice
// if they don't have an invoice app — make it very simple for them, just enter the line items, make them write a description and it'll make a
// total for them from the line items, then it will make an invoice in our own system for them"). (test_SUBINV.mjs is the e-mailed-invoice
// reader, patch SUBINV — a different feature; this file is the ✍️ Make an invoice one.)
// Offline: the REAL portal-access.js on an in-memory Supabase (gc_kv, portal tables, the crm-files bucket); the sub portal (portal.html +
// portal-app.js) in Chromium; the CRM side = index.html's OWN scripts (patch SUB filing, the Sub Payment Chain queue, patch SUBINVMAKE)
// run in a page with small stubs for the CRM's lists (no harness_N). Made-up data only.
//
//  A. server (p-invoice-make / p-invoice-pdf): totals computed on the server (a tampered total is refused), description required, guards
//     (50 lines, $1M a line, qty > 0, date), the photo rule (invPhotoMin) the same as an uploaded invoice, a sub NOT on the job refused,
//     numbering SUB-<code>-<seq> (or theirs), the PDF (lines, total, job, PO, bill to — Mitigation job → GrayCo Mitigation), the same
//     gc_sub_event 'invoice' as an upload, more than what is left on the agreement → must confirm, the sub's list + PDF download (only theirs),
//     rate limited, Spanish server messages.
//  B. the sub portal (phone): ✍️ Make an invoice next to 🧾 Send an invoice on the job and on Pay; job / address / PO read-only; date today;
//     description required inline; live line totals + TOTAL; + Add line / remove; draft kept on the device; Preview → Send → in the list with
//     ✍️ Made in the portal + ⬇️ PDF; Español labels.
//  C. the CRM: filed exactly like an uploaded invoice (Sub Invoices, type sub, received, PO, pay date, files = the PDF, Sub Invoices doc on the
//     job, the job's activity) + the lines, "✍️ Made in the sub portal"; the PM approval queue (pending_pm, the job's PM); 📄 Sub invoice opens
//     the lines + total + 📄 Open the PDF.
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 900) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (f, ms = 15000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await f(); if (v) return v; await sleep(200); } return v; };
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', SUPABASE_ANON_KEY: 'anon-test', PORTAL_MAIL_OFF: '1' });
delete process.env.RESEND_API_KEY; delete process.env.VAPID_PUBLIC_KEY;
const now = () => new Date().toISOString();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false }).catch(() => {}); };
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const PWDIR = process.env.PLAYWRIGHT_DIR || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules/playwright';

/* ═════ the made-up CRM ═════ */
const SUB = { id: 'SUBzedd1', name: 'Zedd Drywall LLC', company: 'Zedd Drywall LLC', contact: 'Zed Zedd', phone: '901-555-0141', email: 'zed@zedddrywall.test', address: '77 Demo Pkwy, Memphis, TN 38118', isSub: true, trade: 'Drywall', lang: 'en' };
const SUB2 = { id: 'SUBdemo2', name: 'Demo Paint Co', company: 'Demo Paint Co', contact: 'Dee Demo', phone: '901-555-0142', email: 'dee@demopaint.test', isSub: true, trade: 'Paint' };
const USERS = [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u3', name: 'Sam Biffle', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true }];
const JOB = { id: 'PZEDD1', name: 'Zedd Kitchen Remodel', address: '123 Demo St, Memphis, TN 38117', client: 'Pat Demo', pm: 'Sam Biffle', status: 'active', autoPO: 'T501', contract: 48250,
  subs: [{ id: 'r1', subId: SUB.id, name: SUB.name, trade: 'Drywall', status: 'Awarded' }, { id: 'r2', subId: SUB2.id, name: SUB2.name, trade: 'Paint', status: 'Awarded' }], createdAt: now(), updatedAt: now() };
const JOBM = { id: 'PZEDDM', name: 'Zedd Water Loss', address: '9 Demo Ave, Memphis, TN 38104', client: 'Lee Demo', pm: 'Sam Biffle', status: 'active', autoPO: 'T502', companyId: 'mitigation', companyIdBy: 'test',
  subs: [{ id: 'r3', subId: SUB.id, name: SUB.name, trade: 'Drywall', status: 'Awarded' }], createdAt: now(), updatedAt: now() };
const JOB3 = { id: 'PDEMO3', name: 'Demo Bath', address: '5 Elsewhere Rd', client: 'Dot Demo', pm: 'Sam Biffle', status: 'active', autoPO: 'T503', subs: [{ id: 'r4', subId: SUB2.id, name: SUB2.name, status: 'Awarded' }], createdAt: now(), updatedAt: now() };

let KV, KVAT, T; const STORE = new Map();
function freshDb(){
  KV = { projects: [JOB, JOBM, JOB3], vendors: [SUB, SUB2], users: USERS, schedule: [], gc_sub_portal_settings: { invPhotoMin: 0 } }; KVAT = {};
  T = { gc_portal_session: [], gc_sub_link: [], gc_sub_event: [], gc_sub_scope: [], gc_portal_msg: [], gc_portal_code: [], gc_sub_device: [], gc_portal: [], gc_portal_lock: [], gc_portal_login: [], sp_rows: [], gc_lead_inbox_kv: [],
    gc_staff: [{ email: 'wjohnson@grayco-cs.com', role: 'admin', active: true, name: 'Wesley Johnson' }] };
}
freshDb();
const res = (status, body, raw) => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body), text: async () => typeof body === 'string' ? body : JSON.stringify(body), arrayBuffer: async () => raw || new ArrayBuffer(0) });
const dv = v => decodeURIComponent(String(v || ''));
const inl = v => dv(v).replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
global.fetch = async (url, init) => {
  init = init || {}; const u = new URL(url), q = u.searchParams, m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  if (u.host !== 'sb.test') return res(404, {});
  if (u.pathname === '/auth/v1/user') { const a = String(hd.Authorization || hd.authorization || '').replace(/^Bearer\s+/i, ''); const mm = /^staff:(.+)$/.exec(a); return mm ? res(200, { id: 'u', email: mm[1] }) : res(401, {}); }
  if (u.pathname.startsWith('/storage/v1/object/sign/crm-files')) { const b = JSON.parse(init.body || '{}'); return res(200, (b.paths || []).map(p => ({ path: p, signedURL: '/object/sign/crm-files/' + p + '?token=t' }))); }
  const sm = /^\/storage\/v1\/object\/crm-files\/(.+)$/.exec(u.pathname);
  if (sm && m === 'POST') { const b = Buffer.from(init.body); if (STORE.has(sm[1])) return res(409, 'Duplicate'); STORE.set(sm[1], b); return res(200, {}); }
  if (u.pathname === '/rest/v1/gc_kv') {
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(x => { KV[x.key] = x.value; KVAT[x.key] = x.updated_at || now(); }); return res(201, null); }
    const k = q.get('key') || ''; const keys = k.startsWith('in.') ? inl(k) : [dv(k).replace(/^eq\./, '')];
    return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: KV[x], updated_at: KVAT[x] || 'T0' })));
  }
  const tm = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
  if (tm) {
    const tb = T[tm[1]] || (T[tm[1]] = []);
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => { const i = r.key ? tb.findIndex(x => x.key === r.key) : -1; if (i >= 0) tb[i] = Object.assign({}, tb[i], r); else tb.push(Object.assign({ created_at: now() }, r)); }); return res(201, []); }
    let rows = tb.slice();
    for (const [k, v] of q.entries()) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === dv(v.slice(3)));
      else if (v.startsWith('neq.')) rows = rows.filter(r => String(r[k]) !== dv(v.slice(4)));
      else if (v.startsWith('in.')) rows = rows.filter(r => inl(v).includes(String(r[k])));
      else if (v.startsWith('gt.')) rows = rows.filter(r => String(r[k]) > dv(v.slice(3)));
      else if (v === 'is.null') rows = rows.filter(r => r[k] == null);
    }
    if (/created_at\.desc/.test(q.get('order') || '')) rows = rows.slice().reverse();
    if (q.get('limit')) rows = rows.slice(0, +q.get('limit'));
    if (m === 'PATCH') { const b = JSON.parse(init.body); rows.forEach(r => Object.assign(r, b)); return res(200, rows); }
    if (m === 'DELETE') { rows.forEach(r => tb.splice(tb.indexOf(r), 1)); return res(204, ''); }
    return res(200, rows);
  }
  return res(404, {});
};
const PA = require(path.join(BUILD, 'netlify/functions/portal-access.js'));
const SIM = require(path.join(BUILD, 'netlify/functions/_lib/subinvmake.js'));
const resetPA = () => { try { PA._core._reset(); } catch (e) {} };
let NET = 0;
const SESS = 'S'.repeat(43), SESS2 = 'Q'.repeat(43), LINK = 'L'.repeat(43), LINK2 = 'K'.repeat(43);
T.gc_sub_link.push({ token: LINK, sub_id: SUB.id, revoked: false, created_at: now() }, { token: LINK2, sub_id: SUB2.id, revoked: false, created_at: now() });
T.gc_portal_session.push({ id: sha(SESS), kind: 'partner', sub_id: SUB.id, links: [LINK], created_at: now(), expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), last_seen_at: now(), revoked: false },
  { id: sha(SESS2), kind: 'partner', sub_id: SUB2.id, links: [LINK2], created_at: now(), expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), last_seen_at: now(), revoked: false });
async function sub(action, body, sess, ip){
  const r = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.grayco-cs.com', 'x-portal-session': sess || SESS, 'x-nf-client-connection-ip': ip || ('10.4.' + (NET++ % 250) + '.1') }, body: JSON.stringify(Object.assign({ action }, body || {})) });
  return { st: r.statusCode, d: JSON.parse(r.body) };
}
const pdfText = buf => buf.toString('latin1');
const invEvents = () => T.gc_sub_event.filter(e => e.kind === 'invoice');
const L3 = [{ desc: 'Hang drywall — kitchen', qty: 40, price: 22.5 }, { desc: 'Tape and mud, 3 coats', qty: '', price: 600 }, { desc: 'Haul off scraps', qty: 1, price: 125.25 }];   /* 900 + 600 + 125.25 */

/* ─── A. the server ─── */
let SENT1;
{
  let r = await sub('p-invoice-make', { projectId: JOB.id, op: 'check', lines: L3, total: 1625.25 });
  ok('A1 Preview (check): the server adds the lines up (40 × $22.50 + $600 (qty blank = 1) + $125.25 = $1,625.25), numbers it SUB-ZD-001, bill to GrayCo Construction Services, the job\'s address + PO; nothing stored',
    r.st === 200 && r.d.total === 1625.25 && r.d.lines[0].amount === 900 && r.d.lines[1].qty === 1 && r.d.number === 'SUB-ZD-001' && !r.d.ownNumber && r.d.billTo === 'GrayCo Construction Services' && r.d.job.po === 'T501' && r.d.job.address === JOB.address && invEvents().length === 0, r);
  const descs = [];
  for (const d of ['', '  ', 'ab', '1234 $$']) { const x = await sub('p-invoice-make', { projectId: JOB.id, op: 'check', lines: [{ desc: d, qty: 1, price: 10 }] }); descs.push(x.st === 400 && /Line 1: write what the work is/.test(x.d.error) ? 1 : [d, x.st, x.d.error]); }
  const d2 = await sub('p-invoice-make', { projectId: JOB.id, op: 'send', lines: [L3[0], { desc: '', price: 50 }] });
  ok('A2 a description is REQUIRED on every line (empty, spaces, 2 letters, numbers only → 400 "Line N: write what the work is"); a send with a blank line stores nothing', descs.every(x => x === 1) && d2.st === 400 && /Line 2/.test(d2.d.error) && invEvents().length === 0, { descs, d2 });
  r = await sub('p-invoice-make', { projectId: JOB.id, op: 'send', lines: L3, total: 9999.99 });
  const r0 = await sub('p-invoice-make', { projectId: JOB.id, op: 'send', lines: L3, total: '1625.20' });
  ok('A3 a tampered total is refused (the client said $9,999.99 / $1,625.20; the lines add up to $1,625.25) — nothing stored', r.st === 400 && /total does not match/.test(r.d.error) && r.d.total === 1625.25 && r0.st === 400 && invEvents().length === 0, [r, r0.st]);
  const many = Array.from({ length: 51 }, (_, i) => ({ desc: 'Line item ' + i, qty: 1, price: 1 }));
  const g = [await sub('p-invoice-make', { projectId: JOB.id, op: 'check', lines: many }), await sub('p-invoice-make', { projectId: JOB.id, op: 'check', lines: [{ desc: 'Huge line', qty: 1, price: 1000000.01 }] }),
    await sub('p-invoice-make', { projectId: JOB.id, op: 'check', lines: [{ desc: 'Zero qty', qty: 0, price: 10 }] }), await sub('p-invoice-make', { projectId: JOB.id, op: 'check', lines: [{ desc: 'Free line', qty: 1, price: 0 }] }),
    await sub('p-invoice-make', { projectId: JOB.id, op: 'check', lines: [{ desc: 'Credit line', qty: 1, price: -50 }] }), await sub('p-invoice-make', { projectId: JOB.id, op: 'check', lines: [] }),
    await sub('p-invoice-make', { projectId: JOB.id, op: 'check', lines: [{ desc: 'Some work', qty: 1, price: 10 }], invDate: '2020-01-01' }), await sub('p-invoice-make', { projectId: JOB.id, op: 'check', lines: [{ desc: 'Some work', qty: 1, price: 10 }], invNum: '<b>' }),
    await sub('p-invoice-make', { projectId: JOB.id, op: 'check', lines: Array.from({ length: 3 }, () => ({ desc: 'Big one', qty: 1, price: 900000 })) })];
  ok('A4 guards: 51 lines, a line over $1,000,000, qty 0, $0 / negative lines, no lines, a date over a year back, a bad invoice #, a total over $2,000,000 → 400 each', g.every(x => x.st === 400) && /At most 50/.test(g[0].d.error) && /at most \$1,000,000/.test(g[1].d.error) && /quantity/.test(g[2].d.error) && /more than \$0/.test(g[3].d.error) && /at least one line/.test(g[5].d.error) && /2,000,000/.test(g[8].d.error), g.map(x => [x.st, x.d.error]));
  const es = await sub('p-invoice-make', { projectId: JOB.id, op: 'check', lines: [{ desc: '', qty: 1, price: 5 }], lang: 'es' });
  ok('A4 … in Spanish when the portal is in Español', es.st === 400 && /Línea 1: escriba qué trabajo es/.test(es.d.error), es);
  /* the photo rule — the same as an uploaded invoice */
  KV.gc_sub_portal_settings = { invPhotoMin: 2 }; resetPA();
  const ph = await sub('p-invoice-make', { projectId: JOB.id, op: 'send', lines: L3, total: 1625.25 });
  const phc = await sub('p-invoice-make', { projectId: JOB.id, op: 'check', lines: L3 });
  const up = await sub('p-invoice', { projectId: JOB.id, amount: 100 });
  ok('A5 the photo rule (gc_sub_portal_settings.invPhotoMin = 2, no photos): Send → 409 with the same message as an uploaded invoice; Preview shows it', ph.st === 409 && /Add at least 2 photos/.test(ph.d.error) && ph.d.photos.need === 2 && up.st === 409 && up.d.error === ph.d.error && phc.st === 200 && phc.d.photos.ok === false && invEvents().length === 0, { ph, up, phc: phc.d.photos });
  KV.gc_sub_portal_settings = { invPhotoMin: 0 }; resetPA();
  /* a sub not on the job */
  const n1 = await sub('p-invoice-make', { projectId: JOBM.id, op: 'check', lines: L3 }, SESS2), n2 = await sub('p-invoice-make', { projectId: JOBM.id, op: 'send', lines: L3, total: 1625.25 }, SESS2), n3 = await sub('p-invoice-make', { projectId: 'NOPE', op: 'send', lines: L3 });
  ok('A6 a sub NOT on the job is refused (404 "not one of yours") — the same check as the upload; nothing stored', n1.st === 404 && /not one of yours/.test(n1.d.error) && n2.st === 404 && n3.st === 404 && invEvents().length === 0, [n1, n2.st, n3.st]);
  /* send */
  r = await sub('p-invoice-make', { projectId: JOB.id, op: 'send', lines: L3, total: 1625.25, note: 'Thank you!', invDate: TODAY });
  SENT1 = r.d;
  const ev = invEvents()[0] || {}, d = ev.data || {}, f = (d.files || [])[0] || {};
  ok('A7 Send → ONE gc_sub_event "invoice" like an upload (invId SPI_<event>, amount = the server total, PO, pay date by the sub pay rule) + made, the lines, the invoice date, the number',
    r.st === 200 && invEvents().length === 1 && ev.project_id === JOB.id && ev.sub_id === SUB.id && d.invId === 'SPI_' + ev.id && r.d.id === d.invId && d.amount === 1625.25 && d.po === 'T501' && d.payDate === PA._core.payDateFor(TODAY) && d.made === true && d.lines.length === 3 && d.invNum === 'SUB-ZD-001' && d.numbered === 'auto' && d.invDate === TODAY && d.note === 'Thank you!', { r, d });
  const pdf = STORE.get(String(f.ref || '').replace('sb:crm-files/', '')) || Buffer.alloc(0), tx = pdfText(pdf);
  ok('A8 the PDF is made on the server and stored like an upload (crm-files, content-addressed): From Zedd Drywall LLC (address, phone, e-mail), Bill to GrayCo Construction Services, the job, address, PO, every line, qty, price, amount, TOTAL, date, invoice #',
    f.type === 'application/pdf' && /^sb:crm-files\/[0-9a-f]{64}\.pdf$/.test(f.ref) && f.hash === sha(pdf) && /^%PDF-1\.4/.test(tx) && /%%EOF\s*$/.test(tx) &&
    ['(Zedd Drywall LLC)', '(77 Demo Pkwy, Memphis, TN 38118)', '(901-555-0141)', '(zed@zedddrywall.test)', '(GrayCo Construction Services)', '(Zedd Kitchen Remodel)', '(123 Demo St, Memphis, TN 38117)', '(T501)',
      '(Hang drywall - kitchen)', '(Tape and mud, 3 coats)', '(Haul off scraps)', '(40)', '($22.50)', '($900.00)', '($600.00)', '($125.25)', '(TOTAL)', '($1,625.25)', '(# SUB-ZD-001)', '(INVOICE)', '(Thank you!)'].every(w => tx.includes(w)), { f, missing: ['(Zedd Drywall LLC)', '(GrayCo Construction Services)', '(T501)', '($1,625.25)', '(Hang drywall - kitchen)'].filter(w => !tx.includes(w)) });
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'subinvmake_a8.pdf'), pdf);
  /* Mitigation job → GrayCo Mitigation; their own invoice # */
  r = await sub('p-invoice-make', { projectId: JOBM.id, op: 'send', lines: [{ desc: 'Cut out wet drywall', qty: 120, price: 2.5 }], total: 300, invNum: 'ZD-7781' });
  const evm = invEvents().find(e => e.project_id === JOBM.id) || {}, fm = ((evm.data || {}).files || [])[0] || {}, txm = pdfText(STORE.get(String(fm.ref || '').replace('sb:crm-files/', '')) || Buffer.alloc(0));
  ok('A9 a Mitigation job is billed to GrayCo Mitigation (the job\'s company) — on the preview, the event and the PDF; their own invoice # is kept', r.st === 200 && r.d.billTo === 'GrayCo Mitigation' && r.d.company === 'mitigation' && evm.data.billTo === 'GrayCo Mitigation' && txm.includes('(GrayCo Mitigation)') && !txm.includes('(GrayCo Construction Services)') && txm.includes('(# ZD-7781)') && evm.data.invNum === 'ZD-7781' && evm.data.numbered === 'sub' && txm.includes('(T502)'), { r: r.d, ev: evm.data });
  r = await sub('p-invoice-make', { projectId: JOB.id, op: 'check', lines: [{ desc: 'Second visit', qty: 1, price: 10 }] });
  ok('A10 the next number counts on: SUB-ZD-002 (their own numbers do not use one up)', r.st === 200 && r.d.number === 'SUB-ZD-002', r.d.number);
  /* agreement: an accepted scope of $2,000 on the kitchen → $1,625.25 invoiced, $374.75 left */
  T.gc_sub_scope.push({ id: 'SC1', project_id: JOB.id, sub_id: SUB.id, kind: 'scope', status: 'accepted', version: 1, accepted_version: 1, title: 'Drywall — kitchen', total: 2000, data: { lines: [] }, created_at: now(), updated_at: now() });
  const ck = await sub('p-invoice-make', { projectId: JOB.id, op: 'check', lines: [{ desc: 'Punch and patch', qty: 1, price: 500 }] });
  const over = await sub('p-invoice-make', { projectId: JOB.id, op: 'send', lines: [{ desc: 'Punch and patch', qty: 1, price: 500 }], total: 500 });
  const overOk = await sub('p-invoice-make', { projectId: JOB.id, op: 'send', lines: [{ desc: 'Punch and patch', qty: 1, price: 500 }], total: 500, okOver: true });
  const oev = invEvents().find(e => e.data.invId === overOk.d.id) || { data: {} };
  ok('A11 more than what is left on their agreement ($2,000 accepted − $1,625.25 invoiced = $374.75 left; this one $500): Preview warns, Send needs "send it anyway" (409 without), then it goes with the warning on it',
    ck.st === 200 && ck.d.agreement.agreement === 2000 && ck.d.agreement.left === 374.75 && ck.d.agreement.over === true && over.st === 409 && /more than what is left/.test(over.d.error) && over.d.over.left === 374.75 && overOk.st === 200 && oev.data.over && oev.data.over.left === 374.75, { ck: ck.d.agreement, over, overOk: overOk.st });
  /* the sub's list and the PDF */
  resetPA();
  const home = await sub('p-home', {}), mine = (home.d.invoices || []).find(x => x.id === SENT1.id) || {};
  ok('A12 the sub\'s invoice list (Pay / the job): the made invoice, Submitted, its number, ✍️ made, a file', home.st === 200 && mine.state === 'submitted' && mine.number === 'SUB-ZD-001' && mine.amount === 1625.25 && mine.made === true && mine.file === true, mine);
  const dl = await sub('p-invoice-pdf', { id: SENT1.id }), dl2 = await sub('p-invoice-pdf', { id: SENT1.id }, SESS2), dl3 = await sub('p-invoice-pdf', { id: 'SPI_Ebogus123' });
  ok('A12 ⬇️ PDF: a one-hour link to THEIR file only (another sub → 404, a made-up id → 404)', dl.st === 200 && /^https:\/\/sb\.test\/storage\/v1\/object\/sign\/crm-files\/[0-9a-f]{64}\.pdf/.test(dl.d.url) && /^Invoice SUB-ZD-001/.test(dl.d.name) && dl2.st === 404 && dl3.st === 404, [dl, dl2.st, dl3.st]);
  /* rate limit (send) */
  let lim = 0; for (let i = 0; i < 26; i++) { const x = await sub('p-invoice-make', { projectId: 'NOPE', op: 'send', lines: L3 }, SESS, '10.88.0.1'); if (x.st === 429) { lim = i; break; } }
  ok('A13 rate-limited like the other sub actions (429 after 20 sends from one address in 10 minutes)', lim === 20, lim);
  resetPA();
  ok('A14 the PDF helper: one invoice up to 50 lines → a real PDF (pages break), the sub code from the name ("Zedd Drywall LLC" → ZD, "Acme" → ACME)', (() => { const b = SIM.buildPdf({ number: 'X', date: TODAY, from: { name: 'A' }, billTo: { name: 'B' }, job: { name: 'J' }, lines: Array.from({ length: 50 }, (_, i) => ({ desc: 'Line ' + i + ' with words that wrap past the column edge of the description for sure', qty: 1, price: 1, amount: 1 })), total: 50 }); return /\/Count [2-9]/.test(b.toString('latin1')); })() && SIM.subCode(SUB) === 'ZD' && SIM.subCode({ company: 'Acme' }) === 'ACME');
}

/* ─── B. the sub portal (phone) ─── */
const { chromium } = require(PWDIR);
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const errs = [];
async function portalCtx(mobile){
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: 'block', bypassCSP: true }, mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 860 } }));
  await ctx.route('**/*', async r => {
    const rq = r.request(), u = new URL(rq.url());
    if (u.host === 'sb.test') { const m = /\/object\/sign\/crm-files\/([^?]+)/.exec(u.pathname); const b = m && STORE.get(m[1]); return b ? r.fulfill({ status: 200, contentType: 'application/pdf', body: b }) : r.fulfill({ status: 404, body: '' }); }
    if (u.host !== 'portal.test') return r.abort('blockedbyclient');
    const fm = /^\/\.netlify\/functions\/([a-z-]+)$/.exec(u.pathname);
    if (fm) {
      if (fm[1] !== 'portal-access') return r.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' });
      const resp = await PA.handler({ httpMethod: rq.method(), headers: Object.assign({ origin: 'https://portal.test', 'x-nf-client-connection-ip': '10.5.' + (NET++ % 250) + '.1' }, rq.headers()), body: rq.postData() || '' });
      return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body });
    }
    if (u.pathname === '/' || u.pathname === '/portal.html') return r.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(path.join(BUILD, 'portal.html'), 'utf8') });
    const f = path.join(BUILD, decodeURIComponent(u.pathname));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f });
    return r.fulfill({ status: 404, body: '' });
  });
  return ctx;
}
let SENT2 = null;
{
  const C = await portalCtx(true);
  const P = await C.newPage(); P.on('pageerror', e => errs.push('portal: ' + String(e.message).slice(0, 200))); P.on('dialog', d => d.accept().catch(() => {}));
  await P.goto('https://portal.test/');
  await P.evaluate(([s]) => { localStorage.setItem('gc_portal_s', s); localStorage.setItem('gc_lang', 'en'); }, [SESS]);
  await P.goto('https://portal.test/#job=' + JOB.id); await P.reload();
  await waitFor(() => P.evaluate(() => !!document.querySelector('[data-jtab="invoices"]')), 30000);
  await P.click('[data-jtab="invoices"]');
  const btns = await waitFor(() => P.evaluate(() => { const a = document.getElementById('jobNewInv'), b = document.getElementById('jobMakeInv'); return a && b ? { a: a.textContent, b: b.textContent, near: a.parentNode === b.parentNode.parentNode || a.parentNode.contains(b) } : null; }), 10000);
  ok('B1 the job\'s Invoices: "✍️ Make an invoice" next to "🧾 Send an invoice" (with "No invoice app? …")', !!btns && /Make an invoice/.test(btns.b) && /Send an invoice/.test(btns.a) && btns.near, btns);
  await P.click('#jobMakeInv');
  await P.waitForSelector('#mkLines [data-mk-line]');
  const info = await P.evaluate(() => ({ name: document.querySelector('[data-mk-name]').textContent, addr: document.querySelector('[data-mk-addr]').textContent, po: document.querySelector('[data-mk-po]').textContent, ro: !document.querySelector('#mkJobInfo input,#mkJobInfo select'), pick: !!document.getElementById('mkJobPick'), date: document.getElementById('mkDate').value, num: document.getElementById('mkNum').value, ph: document.getElementById('mkNum').placeholder, qty: document.querySelector('[data-mk-qty]').value }));
  ok('B2 the job is preselected — name, address, PO shown read-only (no job picker); the date is today; invoice # optional ("we number it"); qty 1', info.name === JOB.name && /123 Demo St/.test(info.addr) && /T501/.test(info.po) && info.ro && !info.pick && info.date === TODAY && info.num === '' && /number it/.test(info.ph) && info.qty === '1', info);
  /* description required, inline */
  await P.fill('[data-mk-line] [data-mk-price]', '150');
  await P.click('#mkPreview');
  const err1 = await P.evaluate(() => ({ line: document.querySelector('[data-mk-line] [data-mk-err]').textContent, bad: document.querySelector('[data-mk-line]').classList.contains('bad'), top: document.getElementById('mkErr').textContent, sheet: !!document.querySelector('.mk-sheet'), pv: getComputedStyle(document.querySelector('.mk-prev')).display }));
  ok('B3 no description → a clear message right on the line ("Write what this line is for …"), the line marked, no preview, nothing sent', /Write what this line is for/.test(err1.line) && err1.bad && /Write what/.test(err1.top) && err1.pv === 'none' && invEvents().length === 3, err1);
  await shot(P, 'subinvmake_b3_required');
  await P.fill('[data-mk-line] [data-mk-desc]', 'Hang drywall in hall');
  await P.fill('[data-mk-line] [data-mk-qty]', '2');
  const live1 = await P.evaluate(() => ({ amt: document.querySelector('[data-mk-amt]').textContent, tot: document.getElementById('mkTotal').textContent, err: document.querySelector('[data-mk-err]').textContent }));
  await P.click('#mkAdd'); await P.click('#mkAdd');
  const ls = await P.$$('[data-mk-line]');
  await ls[1].$eval('[data-mk-desc]', (e) => { e.value = 'Prime walls'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await ls[1].$eval('[data-mk-price]', (e) => { e.value = '99.99'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await ls[2].$eval('[data-mk-desc]', (e) => { e.value = 'Remove me'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await ls[2].$eval('[data-mk-price]', (e) => { e.value = '5000'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  const live2 = await P.evaluate(() => document.getElementById('mkTotal').textContent);
  await ls[2].$eval('[data-mk-del]', b => b.click());
  const live3 = await P.evaluate(() => ({ tot: document.getElementById('mkTotal').textContent, n: document.querySelectorAll('[data-mk-line]').length }));
  ok('B4 line total and TOTAL computed live: 2 × $150 = $300.00; + Add line ($99.99, $5,000) → $5,399.99; ✕ remove → $399.99, 2 lines; the message clears once fixed', live1.amt === '$300.00' && live1.tot === '$300.00' && live1.err === '' && live2 === '$5,399.99' && live3.tot === '$399.99' && live3.n === 2, { live1, live2, live3 });
  await shot(P, 'subinvmake_b4_form');
  /* draft kept on the device */
  const draft = await P.evaluate(pid => JSON.parse(localStorage.getItem('gc_sub_invdraft_' + pid) || 'null'), JOB.id);
  await P.evaluate(() => document.querySelector('.mk-sheet .x').click());
  await P.click('#jobMakeInv'); await P.waitForSelector('#mkLines [data-mk-line]');
  const back = await P.evaluate(() => ({ n: document.querySelectorAll('[data-mk-line]').length, d: [...document.querySelectorAll('[data-mk-desc]')].map(x => x.value), tot: document.getElementById('mkTotal').textContent }));
  ok('B5 a draft is kept on this phone until it is sent (close → open again: the same 2 lines, $399.99)', draft && draft.lines.length === 2 && back.n === 2 && back.d[0] === 'Hang drywall in hall' && back.d[1] === 'Prime walls' && back.tot === '$399.99', { draft, back });
  await P.fill('#mkNote', 'Hall and stairs');
  await P.click('#mkPreview');
  const pv = await waitFor(() => P.evaluate(() => { const p = document.querySelector('.mk-prev'); return p && getComputedStyle(p).display !== 'none' && document.getElementById('mkPvTotal') ? { tot: document.getElementById('mkPvTotal').textContent, n: p.querySelectorAll('[data-mk-pline]').length, num: p.querySelector('[data-mk-number]').textContent, bill: p.querySelector('[data-mk-billto]').textContent, txt: p.innerText, send: !document.getElementById('mkSend').disabled, over: !!document.getElementById('mkOverWarn') } : null; }), 10000);
  ok('B6 👁 Preview (from the server): From / Bill to GrayCo Construction Services / job / PO, 2 lines, TOTAL $399.99, number SUB-ZD-003 (we number it — the one sent in A11 was SUB-ZD-002); over what is left on the agreement → the warning + "Send it anyway" box, Send off until ticked',
    !!pv && pv.tot === '$399.99' && pv.n === 2 && pv.num === 'SUB-ZD-003' && /GrayCo Construction Services/.test(pv.bill) && /T501/.test(pv.txt) && pv.over && !pv.send, pv);
  await shot(P, 'subinvmake_b6_preview');
  await P.check('#mkOver');
  await P.evaluate(() => { window.__opened = []; window.open = function(){ return { set location(u){ window.__opened.push(String(u)); }, close(){} }; }; });
  await P.click('#mkSend');
  const sent = await waitFor(() => { const e = invEvents().find(x => x.data.invNum === 'SUB-ZD-003'); return e || null; }, 10000);
  SENT2 = sent && sent.data;
  ok('B7 📨 Send invoice → stored on the server with the server\'s total ($399.99), the 2 lines, the note, the "over" warning', !!sent && sent.data.amount === 399.99 && sent.data.lines.length === 2 && sent.data.lines[0].amount === 300 && sent.data.note === 'Hall and stairs' && !!sent.data.over, sent && sent.data);
  const row = await waitFor(() => P.evaluate(id => { const b = document.querySelector('[data-mk-made="' + id + '"]'); const p = document.querySelector('[data-mk-pdf="' + id + '"]'); return b && p && !document.querySelector('.mk-sheet') ? b.closest('.inv').innerText : null; }, sent && sent.data.invId), 12000);
  const draftGone = await P.evaluate(pid => localStorage.getItem('gc_sub_invdraft_' + pid), JOB.id);
  ok('B8 it shows in the job\'s invoices like an uploaded one (Submitted) with "✍️ Made in the portal" and ⬇️ PDF; the draft is cleared', !!row && /\$399\.99/.test(row) && /Submitted/.test(row) && /SUB-ZD-003/.test(row) && /Made in the portal/.test(row) && draftGone === null, { row, draftGone });
  await shot(P, 'subinvmake_b8_list');
  if (sent) await P.click('[data-mk-pdf="' + sent.data.invId + '"]');
  const opened = await waitFor(() => P.evaluate(() => (window.__opened || [])[0] || null), 8000);
  const got = opened ? await P.evaluate(async u => { const r = await fetch(u); const b = new Uint8Array(await r.arrayBuffer()); return { st: r.status, head: String.fromCharCode.apply(null, b.slice(0, 8)), n: b.length }; }, opened) : null;
  ok('B9 ⬇️ PDF opens their invoice PDF (a real PDF from file storage)', !!got && got.st === 200 && /^%PDF-1\.4/.test(got.head) && got.n > 2000, { opened, got });
  /* Pay tab: the button there too, with a job picker (2 jobs) whose address + PO show read-only */
  await P.goto('https://portal.test/'); await P.reload();
  await waitFor(() => P.evaluate(() => !!document.querySelector('[data-tab="pay"],[data-tab=pay]')), 20000).catch(() => {});
  await P.evaluate(() => { const b = document.querySelector('[data-tab="pay"]'); if (b) b.click(); });
  const payBtn = await waitFor(() => P.evaluate(() => { const b = document.getElementById('payMakeInv'); return b && document.getElementById('payNewInv') ? b.textContent : null; }), 10000);
  if (payBtn) await P.click('#payMakeInv');
  const pick = payBtn ? await waitFor(() => P.evaluate(() => { const s = document.getElementById('mkJobPick'); return s ? { n: s.options.length, addr: (document.querySelector('[data-mk-addr]') || {}).textContent, po: (document.querySelector('[data-mk-po]') || {}).textContent } : null; }), 8000) : null;
  if (pick) { await P.selectOption('#mkJobPick', JOBM.id); }
  const pick2 = pick ? await P.evaluate(() => ({ addr: document.querySelector('[data-mk-addr]').textContent, po: document.querySelector('[data-mk-po]').textContent })) : null;
  ok('B10 Pay: "✍️ Make an invoice" next to "🧾 Send an invoice"; with more than one job it asks which job, then shows that job\'s address + PO read-only', !!payBtn && /Make an invoice/.test(payBtn) && pick && pick.n === 2 && /T501|T502/.test(pick.po) && pick2 && /9 Demo Ave/.test(pick2.addr) && /T502/.test(pick2.po), { payBtn, pick, pick2 });
  await P.evaluate(() => { const x = document.querySelector('.mk-sheet .x'); if (x) x.click(); });
  /* Español */
  await P.evaluate(() => window.GCPartner.setLang('es')); await sleep(500);
  await P.goto('https://portal.test/#job=' + JOB.id); await P.reload();
  await waitFor(() => P.evaluate(() => !!document.querySelector('[data-jtab="invoices"]')), 30000);
  await P.click('[data-jtab="invoices"]');
  const esB = await waitFor(() => P.evaluate(() => { const b = document.getElementById('jobMakeInv'); return b ? b.textContent : null; }), 8000);
  await P.click('#jobMakeInv'); await P.waitForSelector('#mkLines [data-mk-line]');
  await P.fill('[data-mk-line] [data-mk-price]', '10'); await P.click('#mkPreview');
  const es = await P.evaluate(() => ({ title: document.querySelector('.mk-sheet .sheet-top b').textContent, txt: document.querySelector('.mk-sheet').innerText, err: document.querySelector('[data-mk-err]').textContent, add: document.getElementById('mkAdd').textContent, go: document.getElementById('mkPreview').textContent, made: (document.querySelector('[data-mk-made]') || {}).textContent }));
  ok('B11 Español: "✍️ Hacer una factura", Descripción / Cant. / Precio (c/u) / Total de la línea, "+ Agregar línea", "👁 Vista previa", the inline message and "✍️ Hecha en el portal"',
    /Hacer una factura/.test(esB) && /Hacer una factura/.test(es.title) && /Descripción/.test(es.txt) && /Cant\./.test(es.txt) && /Precio \(c\/u\)/.test(es.txt) && /Total de la línea/.test(es.txt) && es.add === '+ Agregar línea' && es.go === '👁 Vista previa' && /Escriba para qué es esta línea/.test(es.err) && /Hecha en el portal/.test(es.made || ''), es);
  await shot(P, 'subinvmake_b11_es');
  await P.evaluate(() => { try { window.GCPartner.setLang('en'); } catch (e) {} });
  await C.close();
}

/* ─── C. the CRM (index.html's own scripts: patch SUB filing, the Sub Payment Chain, patch SUBINVMAKE) ─── */
{
  /* an uploaded invoice too (the existing flow), to compare */
  const up = await sub('p-invoice', { projectId: JOB.id, amount: 250, invNum: 'UP-1' });
  const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
  const block = (re) => { const i = html.search(re); if (i < 0) return ''; const st = html.lastIndexOf('<script', i), en = html.indexOf('</script>', i); return html.slice(html.indexOf('>', st) + 1, en); };
  const S_SUB = block(/__GC_PATCH_SUB__ \n|GrayCo — THE PORTALS, CRM SIDE/), S_PAY = block(/GrayCo Sub Payment Chain: PM approves/), S_MK = block(/patch SUBINVMAKE \(owner 11\/13/);
  ok('C0 index.html has the three scripts (patch SUB filing, the Sub Payment Chain, patch SUBINVMAKE)', S_SUB.length > 10000 && S_PAY.length > 1000 && S_MK.length > 1000 && /madeIn: made \? 'sub-portal'/.test(S_SUB), [S_SUB.length, S_PAY.length, S_MK.length]);
  const C = await browser.newContext({ viewport: { width: 1366, height: 860 }, serviceWorkers: 'block' });
  const cerrs = [];
  await C.route('**/*', async r => {
    const rq = r.request(), u = new URL(rq.url());
    if (u.pathname === '/.netlify/functions/portal-access') { resetPA(); const resp = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://crm.grayco-cs.com', authorization: 'Bearer staff:wjohnson@grayco-cs.com' }, body: rq.postData() || '{}' }); return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body }); }
    if (u.host === 'crm.test') return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><main></main></body></html>' });
    return r.fulfill({ status: 404, body: '' });
  });
  const P = await C.newPage(); P.on('pageerror', e => cerrs.push(String(e.message).slice(0, 200)));
  await P.goto('https://crm.test/');
  const OPENED = [];
  await P.exposeFunction('__openRef', (ref, name) => { OPENED.push([ref, name]); });
  await P.evaluate(([projects, vendors, users]) => {
    const real = Date.now; let skew = 0; Date.now = () => real() + skew; window.__skew = v => { skew = v; };
    const IDB = {}; window.idbGet = async k => IDB[k]; window.idbSet = async (k, v) => { IDB[k] = v; };
    window._crm = { projects: projects, vendors: vendors, subs: [], users: users, invoices: [], projectDocs: [], punch: [] };
    window._setInvoices = fn => { window._crm.invoices = fn(window._crm.invoices); };
    window._setProjectDocs = fn => { window._crm.projectDocs = fn(window._crm.projectDocs); };
    window._setProjects = fn => { window._crm.projects = fn(window._crm.projects); };
    window._supaUpsertNow = () => Promise.resolve(true);
    window._gcOpenRef = (ref, name) => window.__openRef(ref, name);
    localStorage.setItem('grayco_user', 'wjohnson@grayco-cs.com');
    window._gcViewSubPDF = function(){ window.__oldView = (window.__oldView || 0) + 1; };   /* the CRM's own viewer (defined earlier in index.html) */
  }, [KV.projects, KV.vendors, USERS]);
  for (const src of [S_SUB, S_PAY, S_MK]) await P.addScriptTag({ content: src });
  await P.evaluate(() => window.__skew(60000));
  await P.evaluate(() => window._gcSubHub.sync());
  const filed = await waitFor(() => P.evaluate(() => (window._crm.invoices || []).length >= 4 ? window._crm.invoices : null), 15000);
  const mk = (filed || []).find(x => x.id === SENT1.id) || {}, upl = (filed || []).find(x => x.id === up.d.id) || {};
  ok('C1 the made invoice is filed EXACTLY where an uploaded one is: Sub Invoices, type sub, received, the sub, job, PO, pay date, source sub-portal, "(sub portal)" — the same fields as the uploaded UP-1',
    mk.type === 'sub' && mk.status === 'received' && mk.pid === JOB.id && mk.subId === SUB.id && mk.sub === 'Zedd Drywall LLC' && mk.po === 'T501' && mk.amt === 1625.25 && mk.invNum === 'SUB-ZD-001' && mk.payDate === PA._core.payDateFor(TODAY) && mk.source === 'sub-portal' && /sub portal/.test(mk.by) &&
    upl.type === 'sub' && upl.status === upl.status && upl.source === mk.source && upl.amt === 250 && Object.keys(upl).every(k => k in mk), { mk, upl });
  ok('C2 … plus its lines (description · qty · price · amount), "✍️ Made in the sub portal" (also in the description the pay list / approvals show), the invoice date, the PDF as its file',
    mk.madeIn === 'sub-portal' && Array.isArray(mk.lines) && mk.lines.length === 3 && mk.lines[0].desc === 'Hang drywall — kitchen' && mk.lines[0].qty === 40 && mk.lines[0].price === 22.5 && mk.lines[0].amount === 900 && /^✍️ Made in the sub portal — Hang drywall — kitchen; Tape and mud/.test(mk.desc) && mk.invDate === TODAY && mk.files.length === 1 && mk.files[0].type === 'application/pdf' && !upl.madeIn, mk);
  const docs = await P.evaluate(id => (window._crm.projectDocs || []).filter(d => d.id.indexOf('SPD_' + id.replace('SPI_', '')) === 0), SENT1.id);
  const act = await P.evaluate(pid => ((window._crm.projects.find(p => p.id === pid) || {}).updates || []).map(u => u.text), JOB.id);
  ok('C3 the PDF is in the job\'s documents (Sub Invoices) and the job\'s activity says "🧾 Zedd Drywall LLC sent invoice $1,625.25 (#SUB-ZD-001) — ✍️ made in the sub portal (3 lines) — … waiting for approval"', docs.length === 1 && docs[0].cat === 'Sub Invoices' && /\.pdf$/.test(docs[0].name) && act.some(t => /sent invoice \$1,625\.25 \(#SUB-ZD-001\) — ✍️ made in the sub portal \(3 lines\)/.test(t)), { docs, act });
  const over = (filed || []).find(x => SENT2 && x.id === SENT2.invId) || {};
  ok('C4 the one sent over the agreement carries the warning for the PM', over.overAgreement && over.overAgreement.agreement === 2000 && over.overAgreement.left < 0 && /more than what is left/.test(act.join(' | ')), over);
  await P.evaluate(() => window._gcQueueSubApprovals());
  const q = await P.evaluate(() => JSON.parse(localStorage.getItem('gc_sub_approvals') || '[]'));
  const qa = q.find(a => a.invId === SENT1.id) || {}, qu = q.find(a => a.invId === up.d.id) || {};
  ok('C5 the PM approval queue picks it up like the uploaded one: pending_pm for the job\'s PM (Sam Biffle), with the ✍️ description', qa.status === 'pending_pm' && qa.pmName === 'Sam Biffle' && qa.amt === 1625.25 && /Made in the sub portal/.test(qa.desc) && qu.status === 'pending_pm', { qa, qu });
  await P.evaluate(id => window._gcViewSubPDF(id, 'PZEDD1'), SENT1.id);
  const sheetTxt = await waitFor(() => P.evaluate(() => { const s = document.getElementById('gc-subinvmade'); return s ? { t: s.innerText, n: s.querySelectorAll('[data-sim-line]').length, tot: s.querySelector('[data-sim-total]').textContent } : null; }), 5000);
  ok('C6 📄 Sub invoice (✅ Approvals) on a made invoice opens its lines: "✍️ Made in the sub portal", job, PO, #, every line, TOTAL $1,625.25', !!sheetTxt && sheetTxt.n === 3 && sheetTxt.tot === '$1,625.25' && /Made in the sub portal/.test(sheetTxt.t) && /PO T501/.test(sheetTxt.t) && /SUB-ZD-001/.test(sheetTxt.t) && /Tape and mud, 3 coats/.test(sheetTxt.t), sheetTxt);
  if (SHOTS) await P.screenshot({ path: path.join(SHOTS, 'subinvmake_c6_crm.png') });
  await P.click('#gc-subinvmade [data-sim="pdf"]'); await sleep(300);
  ok('C6 📄 Open the PDF opens the stored PDF (the CRM\'s file opener)', OPENED.length === 1 && OPENED[0][0] === mk.files[0].ref && /\.pdf$/.test(OPENED[0][1]), OPENED);
  await P.evaluate(() => { const s = document.getElementById('gc-subinvmade'); if (s) s.remove(); });
  await P.evaluate(id => window._gcViewSubPDF(id, 'PZEDD1'), up.d.id);
  const old = await P.evaluate(() => ({ old: window.__oldView || 0, sheet: !!document.getElementById('gc-subinvmade') }));
  ok('C7 an uploaded invoice still opens the way it did (the CRM\'s own viewer)', old.old === 1 && !old.sheet, old);
  const acked = T.gc_sub_event.filter(e => e.kind === 'invoice' && e.applied_at).length;
  ok('C8 the events are acknowledged (filed once)', acked === invEvents().length, [acked, invEvents().length]);
  ok('no page errors (portal + CRM)', errs.length === 0 && cerrs.length === 0, errs.concat(cerrs).slice(0, 6));
  await C.close();
}
await browser.close();
const n = R.filter(Boolean).length;
console.log('\nSUBINVMAKE ' + n + '/' + R.length + ' passed');
process.exit(n === R.length ? 0 : 1);
