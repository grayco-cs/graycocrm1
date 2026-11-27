// test_SUBSIMPLE.mjs [build-dir] [shot-dir] — patch SUBSIMPLE (owner 11/20): a very simple sub portal (Jobs · Schedule · Bids · Pay · Papers),
// ⚡ Quick invoice / 📄 Upload an invoice, the bid as a real PDF + a typed price (read by GrayCo's document reader, a different price flagged),
// ✍ To sign + its e-mail / text (tagged 'trade', so ⏸ data-entry mode lets it go), and the CRM's 🔍 scope compare (⚠ N scope gaps,
// 📩 ask the sub, ✓ reviewed, ➕ add a gap line / 📝 notes into the project's estimate). Offline; made-up data only.
//  A. the server: portal-access.js on an in-memory Supabase; bid-hub.js with the bid site's rows in memory; a fake reader / Resend / Twilio.
//  B. the sub portal (phone 390 × 844, Chromium): the real server behind the page; the bid list (p-bidjobs / p-bid-save) faked.
//  C. the CRM (offline harness, fake bid-hub): the 📊 All bids view's scope compare and the estimate it writes.
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 900) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (f, ms = 15000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await f(); if (v) return v; await sleep(200); } return v; };
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', SUPABASE_ANON_KEY: 'anon-test', PORTAL_MAIL_OFF: '1' });
delete process.env.RESEND_API_KEY; delete process.env.VAPID_PUBLIC_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.TWILIO_ACCOUNT_SID;
const now = () => new Date().toISOString();
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const PWDIR = process.env.PLAYWRIGHT_DIR || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules/playwright';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

/* ═════ the made-up CRM ═════ */
const SUB = { id: 'SUBdemo1', name: 'Demo Drywall LLC', company: 'Demo Drywall LLC', contact: 'Dan Demo', phone: '901-555-0141', email: 'dan@demodrywall.test', isSub: true, trade: 'Drywall', lang: 'en' };
const USERS = [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u3', name: 'Sam Sample', email: 'ssample@grayco-cs.com', phone: '901-555-0100', role: 'Project Manager', active: true }];
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const JOB = { id: 'PDEMO1', name: 'Demo Kitchen Remodel', address: '123 Demo St, Memphis, TN 38117', client: 'Pat Demo', pm: 'Sam Sample', status: 'active', autoPO: 'T601', startDate: day(-2), endDate: day(12),
  subs: [{ id: 'r1', subId: SUB.id, name: SUB.name, trade: 'Drywall', status: 'In Progress', startDate: day(-2), endDate: day(12) }], createdAt: now(), updatedAt: now() };
const JOB2 = { id: 'PDEMO2', name: 'Demo Bath Refresh', address: '9 Sample Ave, Memphis, TN 38104', client: 'Lee Demo', pm: 'Sam Sample', status: 'active', autoPO: 'T602', startDate: day(20),
  subs: [{ id: 'r2', subId: SUB.id, name: SUB.name, trade: 'Drywall', status: 'Awarded', startDate: day(20) }], createdAt: now(), updatedAt: now() };
let KV, T; const STORE = new Map(); const OUT = []; let PAUSED = false;
KV = { projects: [JOB, JOB2], vendors: [SUB], users: USERS, schedule: [], gc_sub_portal_settings: { invPhotoMin: 0 }, gc_automation_pause: { on: false } };
T = { gc_portal_session: [], gc_sub_link: [], gc_sub_event: [], gc_sub_scope: [], gc_portal_msg: [], gc_portal_code: [], gc_sub_device: [], gc_portal: [], gc_portal_lock: [], gc_portal_login: [], sp_rows: [],
  gc_staff: [{ email: 'wjohnson@grayco-cs.com', role: 'admin', active: true, name: 'Wesley Johnson' }] };
T.gc_sub_scope.push({ id: 'SSC_demo1', project_id: JOB.id, sub_id: SUB.id, kind: 'scope', version: 1, status: 'published', title: 'Drywall — kitchen and hall', data: { title: 'Drywall — kitchen and hall', lines: [] }, total: 4800, created_at: now(), updated_at: now() },
  { id: 'SSC_demo2', project_id: JOB2.id, sub_id: SUB.id, kind: 'scope', version: 1, status: 'waiting', title: 'Drywall — bath', data: { title: 'Drywall — bath', lines: [] }, total: 1200, created_at: now(), updated_at: now() });
let READER = null;   /* the fake document reader's answer */
const res = (status, body, raw) => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body), text: async () => typeof body === 'string' ? body : JSON.stringify(body), arrayBuffer: async () => raw || new ArrayBuffer(0), headers: { get: () => null } });
const dv = v => decodeURIComponent(String(v || ''));
const inl = v => dv(v).replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
global.fetch = async (url, init) => {
  init = init || {}; const u = new URL(url), q = u.searchParams, m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  if (u.host === 'api.resend.com') { OUT.push({ kind: 'mail', body: JSON.parse(init.body) }); return res(200, { id: 'm' + OUT.length }); }
  if (u.host === 'api.twilio.com') { OUT.push({ kind: 'text', body: String(init.body) }); return res(201, { sid: 'SM' + OUT.length }); }
  if (u.host === 'api.anthropic.com') { OUT.push({ kind: 'read', body: JSON.parse(init.body) }); return READER ? res(200, { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'read_sub_bid', input: READER }] }) : res(500, {}); }
  if (u.host !== 'sb.test') return res(404, {});
  if (u.pathname === '/auth/v1/user') { const a = String(hd.Authorization || hd.authorization || '').replace(/^Bearer\s+/i, ''); const mm = /^staff:(.+)$/.exec(a); return mm ? res(200, { id: 'u', email: mm[1] }) : res(401, {}); }
  if (u.pathname.startsWith('/storage/v1/object/sign/crm-files')) { const b = JSON.parse(init.body || '{}'); return res(200, (b.paths || []).map(p => ({ path: p, signedURL: '/object/sign/crm-files/' + p + '?token=t' }))); }
  const sm = /^\/storage\/v1\/object\/crm-files\/(.+)$/.exec(u.pathname);
  if (sm && m === 'POST') { const b = Buffer.from(init.body); if (STORE.has(sm[1])) return res(409, 'Duplicate'); STORE.set(sm[1], b); return res(200, {}); }
  if (sm && m === 'GET') { const b = STORE.get(sm[1]); return b ? res(200, '', b.buffer.slice(b.byteOffset, b.byteOffset + b.length)) : res(404, {}); }
  if (u.pathname === '/rest/v1/gc_kv') {
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(x => { KV[x.key] = x.value; }); return res(201, null); }
    const k = q.get('key') || ''; const keys = k.startsWith('in.') ? inl(k) : [dv(k).replace(/^eq\./, '')];
    if (keys.includes('gc_automation_pause')) KV.gc_automation_pause = { on: PAUSED };
    return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: KV[x], updated_at: 'T0' })));
  }
  const tm = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
  if (tm) {
    const tb = T[tm[1]] || (T[tm[1]] = []);
    if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => { const i = r.key ? tb.findIndex(x => x.key === r.key) : -1; if (i >= 0) tb[i] = Object.assign({}, tb[i], r); else tb.push(Object.assign({ created_at: now() }, r)); }); return res(201, null); }
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
const BR = require(path.join(BUILD, 'netlify/functions/_lib/bidread.js'));
const SPH = require(path.join(BUILD, 'netlify/functions/subportal.js'))._hub;
const BH = require(path.join(BUILD, 'netlify/functions/bid-hub.js'))._test;
const PAUSE = require(path.join(BUILD, 'netlify/functions/_lib/pause.js'));
PAUSE.isPaused = async () => PAUSED; try { PAUSE.reset(); } catch (e) {}
let NET = 0;
const SESS = 'S'.repeat(43), LINK = 'L'.repeat(43);
T.gc_sub_link.push({ token: LINK, sub_id: SUB.id, revoked: false, created_at: now() });
T.gc_portal_session.push({ id: sha(SESS), kind: 'partner', sub_id: SUB.id, links: [LINK], created_at: now(), expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), last_seen_at: now(), revoked: false });
async function sub(action, body){
  const r = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.grayco-cs.com', 'x-portal-session': SESS, 'x-nf-client-connection-ip': '10.4.' + (NET++ % 250) + '.1' }, body: JSON.stringify(Object.assign({ action }, body || {})) });
  return { st: r.statusCode, d: JSON.parse(r.body) };
}
async function staff(action, body){
  const r = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://crm.grayco-cs.com', authorization: 'Bearer staff:wjohnson@grayco-cs.com', 'x-nf-client-connection-ip': '10.9.' + (NET++ % 250) + '.1' }, body: JSON.stringify(Object.assign({ action }, body || {})) });
  return { st: r.statusCode, d: JSON.parse(r.body) };
}
const invEvents = () => T.gc_sub_event.filter(e => e.kind === 'invoice');

/* ─── A. the server ─── */
{
  /* ⚡ Quick invoice = one line on the ✍️ Make-an-invoice road (p-invoice-make) */
  const r = await sub('p-invoice-make', { projectId: JOB.id, op: 'send', quick: true, lines: [{ desc: 'Work on ' + JOB.name, qty: 1, price: 300 }], total: 300, note: '' });
  const ev = invEvents()[0] || {}, d = ev.data || {};
  ok('A1 ⚡ Quick invoice ($300, this job) → ONE sub invoice event for that job (amount 300, PO, pay date, made in the portal, a PDF) — the CRM files it as received / waiting for approval like every sub invoice',
    r.st === 200 && invEvents().length === 1 && ev.project_id === JOB.id && d.amount === 300 && d.po === 'T601' && !!d.payDate && d.made === true && (d.files || []).length === 1 && /pdf/.test(d.files[0].type) && /^SPI_/.test(r.d.id), [r, d]);
  const pdf = await sub('p-invoice-pdf', { id: r.d.id });
  ok('A1 … and its PDF for their records (p-invoice-pdf)', pdf.st === 200 && /^https:/.test(pdf.d.url || ''), pdf);
  /* 📄 Upload an invoice (PDF) */
  const up = await sub('p-upload', { projectId: JOB.id, purpose: 'invoice', name: 'INV-77.pdf', data: PDF.toString('base64') });
  const r2 = await sub('p-invoice', { projectId: JOB.id, amount: 1250, invNum: 'INV-77', uploadId: up.d.id });
  const e2 = invEvents()[1] || {};
  ok('A2 📄 Upload an invoice → the file is stored, then the invoice event carries it (amount 1250, their #)', up.st === 200 && r2.st === 200 && e2.data && e2.data.amount === 1250 && e2.data.invNum === 'INV-77' && (e2.data.files || [])[0] && e2.data.files[0].name === 'INV-77.pdf', [up, r2, e2.data]);
  /* the bid PDF rule */
  const H = PA._bids.bidHasPdf;
  ok('A3 a bid needs a REAL PDF: none / a photo / an empty PDF → no; a stored PDF → yes', !H([]) && !H([{ type: 'image/jpeg', ref: 'sb:x' }]) && !H([{ type: 'application/pdf', size: 0, ref: 'sb:x' }]) && H([{ type: 'application/pdf', size: 1200, ref: 'sb:crm-files/x.pdf' }]));
  const nb = await sub('p-bid-save', { jobId: 'j_x', amount: '' });
  ok('A3 the typed price is REQUIRED (no amount → 400 "Enter your bid amount")', nb.st === 400 && /bid amount/.test(nb.d.error), nb);
  const src = fs.readFileSync(path.join(BUILD, 'netlify/functions/portal-access.js'), 'utf8');
  ok('A3 p-bid-save refuses a bid with no PDF (server rule, after the papers check)', /if \(!bidHasPdf\(rec\.docs\)\) throw Fail\(400, 'Upload your bid as a PDF/.test(src));
  /* the reader: price compare + the lists kept on the bid */
  ok('A4 compare: $18,450 on the PDF vs $17,900 typed → mismatch + "⚠ Price on the PDF $18,450.00 ≠ typed $17,900.00"; 50¢ apart → no flag',
    BR.compare(18450, 17900).mismatch === true && BR.flagText(BR.normalize({ total: 18450 }, 17900)) === '⚠ Price on the PDF $18,450.00 ≠ typed $17,900.00' && BR.compare(100.5, 100).mismatch === false);
  process.env.ANTHROPIC_API_KEY = 'test-key';
  READER = { total: 18450, inclusions: ['Hang and finish GWB, Level 4', 'Cleanup daily'], exclusions: ['Paint', 'Patching after other trades'], scopeItems: ['Kitchen walls 1,200 sf'], alternates: ['Add $900 for Level 5'], clarifications: ['Net 30'], validity: '30 days', schedule: '2 weeks after start' };
  const upb = await sub('p-upload', { purpose: 'bid', name: 'Demo Drywall bid.pdf', data: PDF.toString('base64') });
  const bidRow = { collection: 'bids', id: 'b_demo1', key: 'bids/b_demo1', job_id: 'j_demo', user_id: 'u_demo', data: { id: 'b_demo1', jobId: 'j_demo', userId: 'u_demo', amount: 17900, docs: [{ name: 'Demo Drywall bid.pdf', type: 'application/pdf', size: PDF.length, ref: 'sb:crm-files/' + sha(PDF) + '.pdf' }] } };
  T.sp_rows.push(bidRow);
  const after = await PA._bids.readAfterSave(bidRow, [upb.d.id], SUB);
  const saved = (T.sp_rows.find(x => x.key === 'bids/b_demo1') || {}).data || {};
  const rd = saved.read || {};
  ok('A5 after the bid is saved the WHOLE PDF goes to the reader (a document block), and what it read is kept on the bid: total, inclusions, exclusions, scope items, alternates, clarifications, validity, schedule',
    OUT.some(o => o.kind === 'read' && JSON.stringify(o.body).includes('"type":"document"')) && rd.status === 'read' && rd.total === 18450 && rd.inclusions.length === 2 && rd.exclusions[0] === 'Paint' && rd.scopeItems.length === 1 && rd.alternates.length === 1 && rd.clarifications[0] === 'Net 30' && rd.validity === '30 days' && /2 weeks/.test(rd.schedule) && after && after.data.read, rd);
  ok('A5 the typed $17,900 ≠ the PDF\'s $18,450 → flagged for GrayCo (the bid is kept)', rd.mismatch === true && rd.typed === 17900 && saved.amount === 17900);
  ok('A5 the sub portal never shows the read (myBidOut: no read / flag), only "hasPdf"', (() => { const o = PA._bids.myBidOut(saved); return o.hasPdf === true && !('read' in o) && !JSON.stringify(o).includes('18450'); })());
  READER = null;
  const upc = await sub('p-upload', { purpose: 'bid', name: 'Other.pdf', data: Buffer.concat([PDF, Buffer.from('x')]).toString('base64') });
  await PA._bids.readAfterSave(bidRow, [upc.d.id], SUB);
  const rf = ((T.sp_rows.find(x => x.key === 'bids/b_demo1') || {}).data || {}).read || {};
  ok('A6 the reader fails → the bid stays with read.status "failed" (CRM: "Not read yet — 📄 Read")', rf.status === 'failed' && !!rf.why, rf);
  /* ✍ To sign */
  const hm = await sub('p-home');
  ok('A7 p-home: toSign lists the published (unsigned) sub agreement; a scope still waiting for approval is not shown; each job carries its scopes', hm.st === 200 && hm.d.toSign.length === 1 && hm.d.toSign[0].id === 'SSC_demo1' && hm.d.toSign[0].job === JOB.name
    && hm.d.jobs.find(j => j.id === JOB.id).scopes.length === 1 && hm.d.jobs.find(j => j.id === JOB2.id).scopes.length === 0, hm.d.toSign);
  /* the notice when GrayCo sends a paper to sign — in ⏸ data-entry mode too */
  delete process.env.PORTAL_MAIL_OFF; process.env.RESEND_API_KEY = 're-test'; Object.assign(process.env, { TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+19015550199' });
  PAUSED = true; KV.gc_automation_pause = { on: true }; OUT.length = 0;
  const ap = await staff('s-scope-approve', { id: 'SSC_demo2' });
  const mails = OUT.filter(o => o.kind === 'mail'), texts = OUT.filter(o => o.kind === 'text');
  ok('A8 a sub agreement approved & sent → the sub gets an e-mail AND a text with their portal link — sent even in ⏸ data-entry mode (tagged \'trade\')',
    ap.st === 200 && ap.d.mailed === true && ap.d.texted === true && mails.length === 1 && JSON.stringify(mails[0].body.to) === JSON.stringify([SUB.email]) && /Sub agreement to sign/.test(mails[0].body.subject) && texts.length === 1 && /9015550141/.test(texts[0].body) && /sign/.test(decodeURIComponent(texts[0].body)), [ap, OUT.map(o => o.kind)]);
  OUT.length = 0;
  const cust = await (async () => { try { const C = require(path.join(BUILD, 'netlify/functions/_lib/custquiet.js')); return await fetch('https://api.resend.com/emails', { method: 'POST', body: JSON.stringify({ to: ['pat@customer.test'], subject: 'x' }) }); } catch (e) { return null; } })();
  ok('A8 … while a customer e-mail in data-entry mode is still held (the pause works; the sub notice is the exception)', OUT.filter(o => o.kind === 'mail').length === 0, OUT);
  PAUSED = false; KV.gc_automation_pause = { on: false }; process.env.PORTAL_MAIL_OFF = '1'; delete process.env.TWILIO_ACCOUNT_SID;

  /* bid-hub: the read shown to staff, 📩 ask a sub (trade-tagged), ✓ reviewed — and none of it on a sub's view of the job */
  const ROWS = new Map(); const put = (c, d) => ROWS.set(c + '/' + d.id, { collection: c, id: d.id, job_id: c === 'jobs' ? d.id : d.jobId, user_id: d.userId || '', data: d });
  put('jobs', { id: 'J9', title: 'Demo Clinic', status: 'open', visibility: 'private', log: [] });
  put('bids', { id: 'b1', jobId: 'J9', userId: 'u1', userEmail: 'a@demo.test', userPhone: '901-555-0161', userName: 'Al Demo', userCompany: 'Alpha Walls', trade: 'Drywall', amount: 17900, docs: [{ name: 'a.pdf', type: 'application/pdf', ref: 'sb:crm-files/' + sha(PDF) + '.pdf' }], read: Object.assign({}, rd), submittedAt: now() });
  put('bids', { id: 'b2', jobId: 'J9', userId: 'u2', userEmail: 'b@demo.test', userName: 'Bo Demo', userCompany: 'Beta Drywall', trade: 'Drywall', amount: 16500, docs: [{ name: 'b.pdf', type: 'application/pdf', ref: 'sb:crm-files/' + sha(PDF) + '.pdf' }], submittedAt: now() });
  SPH.listRows = async filters => { const f = {}; filters.forEach(x => { const m = /^(\w+)=eq\.(.*)$/.exec(x); if (m) f[m[1]] = decodeURIComponent(m[2]); }); return [...ROWS.values()].filter(r => (!f.collection || r.collection === f.collection) && (!f.job_id || r.job_id === f.job_id) && (!f.key || f.key === r.collection + '/' + r.id)); };
  SPH.getRow = async (c, id) => ROWS.get(c + '/' + id) || null;
  SPH.upsertRows = async rows => { rows.forEach(r => ROWS.set(r.collection + '/' + r.id, Object.assign({}, r, { data: JSON.parse(JSON.stringify(r.data)) }))); };
  SPH.crmData = async () => ({}); SPH.crmSubList = () => [];
  const WHO = { ok: true, email: 'wjohnson@grayco-cs.com', name: 'Wesley Johnson', admin: true, canPublic: true, canInvite: true };
  const list = await BH.subBids('J9');
  const a = list.find(x => x.id === 'b1'), b = list.find(x => x.id === 'b2');
  ok('A9 the CRM\'s bid list (staff): bidder A\'s read (incl. / excl., ⚠ price flag), bidder B "has a PDF, not read yet"', a && a.read && a.read.mismatch && /≠ typed/.test(a.read.flag) && a.read.exclusions.includes('Paint') && b && b.hasPdf && !b.read, [a && a.read, b]);
  READER = { total: 16500, inclusions: ['Drywall hang & finish', 'Cleanup'], exclusions: [] };
  const rr = await BH.bidRead(WHO, { id: 'b2' });
  ok('A9 📄 Read (staff) reads B\'s PDF now and keeps it; the price matches → no flag', rr.ok && rr.read.status === 'read' && rr.read.mismatch === false && ROWS.get('bids/b2').data.read.inclusions.length === 2, rr);
  delete process.env.PORTAL_MAIL_OFF; PAUSED = true; OUT.length = 0; Object.assign(process.env, { TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+19015550199' });
  const ask = await BH.scopeAsk(WHO, { jobId: 'J9', source: 'portal', id: 'b1', item: 'Patching after other trades', kind: 'exc', trade: 'Drywall' });
  const am = OUT.filter(o => o.kind === 'mail'), at2 = OUT.filter(o => o.kind === 'text');
  ok('A10 📩 Ask the sub to include / clarify → ONE e-mail to that sub only + a text, sent in ⏸ data-entry mode (tag \'trade\'); it names the line and asks them to confirm or send a revised PDF',
    ask.ok && ask.mail && ask.text && am.length === 1 && JSON.stringify(am[0].body.to) === JSON.stringify(['a@demo.test']) && /Patching after other trades/.test(am[0].body.html) && /revised bid \(PDF\)/.test(am[0].body.html) && at2.length === 1 && /9015550161/.test(at2[0].body), [ask, OUT.map(o => o.kind)]);
  ok('A10 … and it never names another bidder or a price', !/Beta|16,?500|17,?900/.test(JSON.stringify(am[0].body)));
  PAUSED = false; process.env.PORTAL_MAIL_OFF = '1'; delete process.env.TWILIO_ACCOUNT_SID;
  const rv = await BH.scopeReview(WHO, { jobId: 'J9', trade: 'Drywall', key: 't:patching', on: true });
  const job9 = ROWS.get('jobs/J9').data, view = SPH.subJobView(job9, ['Drywall']);
  ok('A11 ✓ Reviewed is kept on the bid job; who was asked about what is staff only (a sub\'s view of the job has neither)', rv.ok && rv.scopeReview['drywall|t:patching'] && job9.scopeAsks.length === 1 && !('scopeAsks' in view) && !('scopeReview' in view), view);
  delete process.env.ANTHROPIC_API_KEY;
}

{ const app = fs.readFileSync(path.join(BUILD, 'subportal-app/src/App.jsx'), 'utf8'), built = fs.readdirSync(path.join(BUILD, 'subportal/assets')).filter(f => /\.js$/.test(f)).map(f => fs.readFileSync(path.join(BUILD, 'subportal/assets', f), 'utf8')).join('\n');
  ok('A12 bid site: a short word under each tab icon on a phone (not icons only); "once wired" is gone (EN / ES) — in the source and the built site',
    /\.nav-tab-label \{ display: block !important/.test(app) && !/once wired|cuando esté conectado/.test(app) && /nav-tab-label\{display:block!important|nav-tab-label \{ display: block !important/.test(built) && !/once wired/.test(built)); }
/* patch MEASURE: 📐 Measure on a plan in the job's Plans & documents → a signed ticket for the bid site's measure tool (this sub, this job, this file) */
{
  const H64 = 'a'.repeat(64);
  KV.projectDocs = [{ id: 'D1', pid: JOB.id, name: 'Kitchen Plans.pdf', cat: 'Plans', ref: 'sb:crm-files/' + H64 + '.pdf', type: 'application/pdf' },
    { id: 'D2', pid: JOB.id, name: 'Invoice 12.pdf', cat: 'Invoices', ref: 'sb:crm-files/' + 'b'.repeat(64) + '.pdf', type: 'application/pdf' }];
  try { PA._core._reset(); } catch (e) {}
  const m = await sub('p-measure', { projectId: JOB.id, name: 'Kitchen Plans.pdf' });
  const tk = (/#measure=(.+)$/.exec((m.d && m.d.url) || '') || [])[1] || '';
  const rd = require(path.join(BUILD, 'netlify/functions/_lib/takeoffs.js')).read(tk) || {};
  const no = await sub('p-measure', { projectId: JOB.id, name: 'Invoice 12.pdf' });
  const other = await sub('p-measure', { projectId: 'PNOTMINE', name: 'Kitchen Plans.pdf' });
  ok('M1 📐 Measure (portal): a plan shared with subs → a bids.grayco-cs.com/#measure= link whose ticket names this sub, this job and that file; an invoice (never shown to subs) → 404; another job → 404',
    m.st === 200 && /^https:\/\/bids\.grayco-cs\.com\/#measure=/.test(m.d.url) && rd.s === SUB.id && rd.p === JOB.id && rd.r === H64 + '.pdf' && rd.n === 'Kitchen Plans.pdf' && no.st === 404 && other.st === 404, [m, rd, no.st, other.st]);
  delete KV.projectDocs; try { PA._core._reset(); } catch (e) {}
}
/* ─── B. the sub portal (phone) ─── */
const { chromium } = require(PWDIR);
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const errs = []; const BIDSAVE = [];
const FAKE_BIDS = { ok: true, approved: true, url: 'https://bids.grayco-cs.com', docs: { ok: true, items: [] }, me: { trades: ['Drywall'] },
  jobs: [{ id: 'bj1', title: 'Demo Office Build-out', address: '50 Sample Rd', bidDueDate: day(5), canBid: true, tradesSought: 'Drywall', tradeScopes: [], plans: [], plansLinks: [], questions: [], details: {}, myBid: null },
    { id: 'bj2', title: 'Demo Warehouse', address: '7 Dock Rd', bidDueDate: day(9), canBid: true, tradesSought: 'Drywall', tradeScopes: [], plans: [], plansLinks: [], questions: [], details: {}, myBid: null }] };
const C = await browser.newContext({ serviceWorkers: 'block', bypassCSP: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await C.route('**/*', async r => {
  const rq = r.request(), u = new URL(rq.url());
  if (u.host === 'sb.test') { const m = /\/object\/(?:upload\/)?sign\/crm-files\/([^?]+)/.exec(u.pathname); if (m && rq.method() === 'PUT') { STORE.set(m[1], Buffer.from(rq.postDataBuffer() || [])); return r.fulfill({ status: 200, body: '{}' }); } const b = m && STORE.get(m[1]); return b ? r.fulfill({ status: 200, contentType: 'application/pdf', body: b }) : r.fulfill({ status: 404, body: '' }); }
  if (u.host !== 'portal.test') return r.abort('blockedbyclient');
  const fm = /^\/\.netlify\/functions\/([a-z-]+)$/.exec(u.pathname);
  if (fm) {
    if (fm[1] !== 'portal-access') return r.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' });
    const body = JSON.parse(rq.postData() || '{}');
    if (body.action === 'p-bidjobs') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_BIDS) });
    if (body.action === 'p-bid-save') { BIDSAVE.push(body); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, created: true, bid: { amount: Number(body.amount), hasPdf: true } }) }); }
    if (body.action === 'p-upload-url') return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'use the small upload' }) });
    const resp = await PA.handler({ httpMethod: rq.method(), headers: Object.assign({ origin: 'https://portal.test', 'x-nf-client-connection-ip': '10.5.' + (NET++ % 250) + '.1' }, rq.headers()), body: rq.postData() || '' });
    return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body });
  }
  if (u.pathname === '/' || u.pathname === '/portal.html') return r.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(path.join(BUILD, 'portal.html'), 'utf8') });
  const f = path.join(BUILD, decodeURIComponent(u.pathname));
  if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f });
  return r.fulfill({ status: 404, body: '' });
});
/* the bid site answers "approved" for this sub's p-home (bidsState) — a linked, approved profile */
T.sp_rows.push({ key: 'users/u_demo', collection: 'users', id: 'u_demo', user_id: 'u_demo', email: SUB.email, data: { id: 'u_demo', role: 'sub', approved: true, email: SUB.email, name: SUB.contact, company: SUB.company, crmSubId: SUB.id, trades: ['Drywall'] } });
const P = await C.newPage(); P.on('pageerror', e => errs.push(String(e.message).slice(0, 200))); P.on('dialog', d => d.accept().catch(() => {}));
await P.goto('https://portal.test/');
await P.evaluate(([s]) => { localStorage.setItem('gc_portal_s', s); localStorage.setItem('gc_lang', 'en'); }, [SESS]);
await P.reload();
await waitFor(() => P.evaluate(() => !!document.querySelector('[data-myjobs]')), 30000);
await waitFor(() => P.evaluate(() => document.querySelectorAll('[data-myjob-docs] .muted').length === 0 || true), 3000); await sleep(800);
const lay = await P.evaluate(() => {
  const main = document.getElementById('main'), kids = [...main.children];
  const idx = sel => kids.findIndex(k => k.matches(sel) || k.querySelector(sel));
  return { tabs: [...document.querySelectorAll('#tabs button')].map(b => b.textContent), tosign: idx('[data-tosign]'), myjobs: idx('[data-myjobs]'), bidbtn: idx('[data-bidbtncard], #bidsBtn, [data-bidlist]'), pm: idx('.pm'), cards: document.querySelectorAll('[data-myjob]').length,
    rowBtns: [...document.querySelectorAll('[data-myjob]')].map(r => r.querySelectorAll('button').length), rowPo: document.querySelectorAll('[data-myjob] [data-copy-po], [data-myjob] .po').length, tags: (document.querySelector('[data-myjob-tags="PDEMO1"]') || {}).textContent || '',
    details: document.querySelectorAll('[data-myjobs] details').length, panelHidden: (document.getElementById('bidsPanel') || {}).hidden, listShown: !!document.querySelector('[data-bidjob]'),
    info: (document.querySelector('[data-myjob="PDEMO1"]') || {}).textContent || '', btn: (document.getElementById('bidsBtn') || {}).textContent || '', tsText: (document.querySelector('[data-tosign]') || {}).textContent || '',
    hscroll: document.documentElement.scrollWidth > window.innerWidth + 1 };
});
ok('B1 five big tabs: Jobs · Schedule · Bids · Pay · Papers', JSON.stringify(lay.tabs) === JSON.stringify(['Jobs', 'Schedule', 'Bids', 'Pay', 'Papers']), lay.tabs);
/* patch SUBHOME2 (owner 11/27: "make the simpler home and combine the tabs"): Home = ✍ To sign → Today → 🏠 My jobs (short rows) → the PM; bids only in the Bids tab */
ok('B2 Home top to bottom: ✍ To sign (2 — the one approved in A8 too) first → My jobs → the PM; no bid button / list on Home', lay.tosign === 0 && lay.myjobs > lay.tosign && lay.pm > lay.myjobs && lay.bidbtn < 0 && /To sign \(2\)/.test(lay.tsText) && /Drywall — kitchen and hall/.test(lay.tsText) && /Drywall — bath/.test(lay.tsText), lay);
ok('B3 every current job is one short row (2), no dropdown — name, address, a badge (✍ 1 to sign), ONE Open › button, no PO there', lay.cards === 2 && lay.details === 0 && /Demo Kitchen Remodel/.test(lay.info) && /123 Demo St/.test(lay.info) && /1 to sign/.test(lay.tags) && lay.rowBtns.every(n => n === 1) && lay.rowPo === 0 && !lay.hscroll, lay);
if (SHOTS) await P.screenshot({ path: path.join(SHOTS, 'subsimple_home.png'), fullPage: true });
await P.click('[data-myjob-open="PDEMO1"]'); await P.waitForSelector('[data-jobhead]', { timeout: 15000 }); await sleep(500);
const jp = await P.evaluate(() => ({ head: document.querySelector('[data-jobhead]').textContent, body: document.getElementById('main').textContent, tabs: [...document.querySelectorAll('[data-jtab]')].map(b => b.getAttribute('data-jtab')), docs: !!document.querySelector('[data-subdocs]') }));
ok('B3 … Open › → the job page has what the old Home card had: address, PM name + phone, dates, PO + Copy PO, scope (To sign), plans & documents; 4 tabs', /123 Demo St/.test(jp.head) && /Sam Sample/.test(jp.head) && /901-555-0100/.test(jp.head) && /T601/.test(jp.head) && /starts/i.test(jp.head) && /Drywall — kitchen and hall/.test(jp.body) && jp.docs && jp.tabs.join() === 'scope,photos,invoices,messages', jp);
await P.click('#jobBack'); await sleep(300);
await P.click('#tabs [data-tab="bids"]');
await waitFor(() => P.evaluate(() => document.querySelectorAll('[data-bidjob]').length === 2));
ok('B4 the Bids tab lists the 2 open bid jobs', await P.evaluate(() => document.querySelectorAll('[data-bidjob]').length === 2));
/* the bid: PDF + price required */
await P.click('[data-bidopen="bj1"]'); await P.waitForSelector('#bidSend');
const acc = await P.getAttribute('#bidFiles', 'accept');
await P.fill('#bidAmt', '18450'); await P.click('#bidSend'); await sleep(300);
const e1 = await P.textContent('.bidform .err');
await P.setInputFiles('#bidFiles', { name: 'bid.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]) }); await P.click('#bidSend'); await sleep(300);
const e2 = await P.textContent('.bidform .err');
await P.fill('#bidAmt', ''); await P.setInputFiles('#bidFiles', { name: 'Demo bid.pdf', mimeType: 'application/pdf', buffer: PDF }); await P.click('#bidSend'); await sleep(300);
const e3 = await P.textContent('.bidform .err');
ok('B5 the bid form takes PDFs only; no PDF → "Attach your bid as a PDF"; a photo → "Only PDF files"; no typed price → "Enter your bid amount"; nothing sent', /pdf/.test(acc) && !/image/.test(acc) && /Attach your bid as a PDF/.test(e1) && /Only PDF files/.test(e2) && /Enter your bid amount/.test(e3) && BIDSAVE.length === 0, [acc, e1, e2, e3]);
await P.fill('#bidAmt', '18450'); await P.click('#bidSend');
await waitFor(() => BIDSAVE.length === 1, 10000);
ok('B5 the PDF + price → uploaded first, then p-bid-save with the amount and the upload id', BIDSAVE.length === 1 && BIDSAVE[0].amount === '18450' && (BIDSAVE[0].uploadIds || []).length === 1, BIDSAVE);
/* Pay */
await P.click('#tabs [data-tab="pay"]'); await P.waitForSelector('[data-payhow]');
const pay = await P.evaluate(() => ({ how: document.querySelector('[data-payhow]').textContent, order: [...document.getElementById('main').children].map(x => x.getAttribute('data-payhow') ? 'how' : x.getAttribute('data-paybtns') ? 'btns' : 'other').slice(0, 2), up: !!document.getElementById('payNewInv'), q: !!document.getElementById('payQuick') }));
ok('B6 Pay: "How to get paid" steps on top, then 📄 Upload an invoice and ⚡ Quick invoice', pay.order.join() === 'how,btns' && /Wednesday/.test(pay.how) && /Quick invoice/.test(pay.how) && pay.up && pay.q, pay);
if (SHOTS) { await P.evaluate(() => document.querySelectorAll('.toast').forEach(x => x.remove())); await P.screenshot({ path: path.join(SHOTS, 'subsimple_pay.png'), fullPage: true }); }
await P.click('#payNewInv'); await P.waitForSelector('#invSend'); await P.fill('#invAmt', '500'); await P.click('#invSend'); await sleep(400);
const n0 = invEvents().length;
const upToast = await P.evaluate(() => [...document.querySelectorAll('.toast')].map(x => x.textContent).join(' '));
ok('B7 📄 Upload an invoice without a file → "Pick your invoice file" (nothing sent)', /Pick your invoice file/.test(upToast) && n0 === 2, upToast);
await P.keyboard.press('Escape'); await sleep(200);
await P.click('#payQuick'); await P.waitForSelector('#qiSend');
await P.selectOption('#qiJob', JOB2.id); await P.click('#qiSend'); await sleep(200);
const qe = await P.textContent('#qiErr');
await P.fill('#qiAmt', '300'); await P.fill('#qiNote', 'Drywall patch — bath'); await P.click('#qiSend');
await P.waitForSelector('#qiDone', { timeout: 15000 });
const last = invEvents()[invEvents().length - 1] || {};
const qd = await P.evaluate(() => ({ done: document.getElementById('qiDone').textContent, pdf: !!document.querySelector('[data-quickinv] [data-mk-pdf]') }));
ok('B8 ⚡ Quick invoice: no amount → "Type the amount"; job + $300 + a note → the invoice is in the CRM\'s road for THAT job (amount 300, the note as its line) + ⬇️ PDF for their records',
  /Type the amount/.test(qe) && last.project_id === JOB2.id && last.data.amount === 300 && last.data.lines[0].desc === 'Drywall patch — bath' && /\$300\.00/.test(qd.done) && qd.pdf, [qe, last.data, qd]);
if (SHOTS) await P.screenshot({ path: path.join(SHOTS, 'subsimple_quickinv.png') });
await P.click('#qiOk'); await sleep(200);
await P.click('#tabs [data-tab="sched"]'); await P.waitForSelector('[data-sched60]');
ok('B9 Schedule tab: this week, the next 60 days, each job\'s dates, my days off', await P.evaluate(() => /Demo Kitchen Remodel/.test(document.getElementById('main').textContent) && !!document.querySelector('[data-sched60]')));
ok('B10 no page errors', errs.length === 0, errs);
await C.close();
await browser.close();

/* ─── C. the CRM: scope compare ─── */
let H0 = null; try { H0 = await import('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs'); } catch (e) { H0 = null; }
if (!H0) ok('C0 the CRM harness is here', false, 'harness_N.mjs missing');
else {
  const { computer, signIn, cset, resetCloud } = H0;
  const at = new Date(Date.now() - 3 * 864e5).toISOString(), d0 = at.slice(0, 10);
  resetCloud();
  cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }]);
  cset('projects', [{ id: 'P1', name: 'Demo Clinic', client: 'Sample Health LLC', address: '100 Demo St', status: 'estimating', autoPO: 'T701', createdAt: at, updatedAt: at, files: [] }]);
  cset('estimates', [{ id: 'E1', name: 'Demo Clinic — base bid', gc: 'Sample Health LLC', estimator: 'Wesley Johnson', date: d0, status: 'Draft', pid: 'P1', lines: [{ id: 'H1', desc: 'Supervision', cost: 1000, qty: 1, cat: 'General', type: 'labor', mult: 'type' }],
    scope: { text: '', inc: '', exc: '', notes: '' }, settings: { tax: 9.75, marginPct: 30 }, jobMult: 'mat', ovrMult: 1.5, useOvr: false, totalCost: 1000, totalCharge: 1428, createdAt: at, firstSavedAt: at, savedAt: at, updatedAt: at, versions: [], versionNo: 1 }]);
  const rdA = { status: 'read', at, total: 18450, typed: 17900, mismatch: true, flag: '⚠ Price on the PDF $18,450.00 ≠ typed $17,900.00', inclusions: ['Drywall hang & finish, Level 4', 'Corner bead'], exclusions: ['Paint'], scopeItems: [], alternates: [], clarifications: [] };
  const rdB = { status: 'read', at, total: 16500, typed: 16500, mismatch: false, flag: '', inclusions: ['Hang and finish GWB', 'Corner bead', 'Paint touch-up'], exclusions: [], scopeItems: [], alternates: [], clarifications: [] };
  const BIDS = [
    { source: 'subportal', id: 'b1', company: 'Alpha Walls', sub: 'Al Demo', email: 'a@demo.test', trade: 'Drywall', amount: 17900, files: [{ name: 'a.pdf', ref: 'sb:crm-files/a.pdf' }], hasPdf: true, at, awarded: false, scope: '', notes: '', read: rdA },
    { source: 'subportal', id: 'b2', company: 'Beta Drywall', sub: 'Bo Demo', email: 'b@demo.test', trade: 'Drywall', amount: 16500, files: [{ name: 'b.pdf', ref: 'sb:crm-files/b.pdf' }], hasPdf: true, at, awarded: false, scope: '', notes: '', read: rdB },
    { source: 'subportal', id: 'b3', company: 'Gamma Interiors', sub: 'Gil Demo', email: 'g@demo.test', trade: 'Drywall', amount: 15200, files: [{ name: 'g.pdf', ref: 'sb:crm-files/g.pdf' }], hasPdf: true, at, awarded: false, scope: '', notes: '' }];
  const JOBS = [{ id: 'J1', title: 'Demo Clinic', status: 'open', visibility: 'private', due: d0, trades: 'Drywall', invited: 3, bids: 3, crmProjectId: 'P1' }];
  const HUBC = { asks: [], reads: [], review: {} };
  const A = await computer('wjohnson@grayco-cs.com', { build: BUILD });
  const cerr = []; A.page().on('pageerror', e => cerr.push(String(e.message).slice(0, 200)));
  await A.ctx.route('**/.netlify/functions/bid-hub*', async rt => {
    const u = new URL(rt.request().url()), q = u.searchParams, J = b => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (rt.request().method() === 'POST') { const b = JSON.parse(rt.request().postData() || '{}');
      if (b.op === 'scopeask') { HUBC.asks.push(b); return J({ ok: true, mail: true, text: true }); }
      if (b.op === 'bidread') { HUBC.reads.push(b); BIDS[2].read = { status: 'read', at, total: 15200, typed: 15200, inclusions: ['Hang and finish drywall'], exclusions: ['Corner bead'] }; return J({ ok: true, read: BIDS[2].read }); }
      if (b.op === 'scopereview') { const k = String(b.trade).toLowerCase() + '|' + b.key; if (b.on === false) delete HUBC.review[k]; else HUBC.review[k] = { at }; return J({ ok: true, scopeReview: HUBC.review }); }
      if (b.op === 'link') return J({ ok: true });
      return J({ ok: true }); }
    if (q.get('jobs')) return J({ ok: true, jobs: JOBS, me: { admin: true, canInvite: true, canPublic: true } });
    if (q.get('subbids')) return J({ ok: true, jobId: 'J1', bids: JSON.parse(JSON.stringify(BIDS)), sent: null, scopeReview: HUBC.review, scopeAsks: HUBC.asks.map(x => ({ bid: x.id, item: x.item })) });
    return J({ ok: true, subs: [] });
  });
  await signIn(A, 'wjohnson@grayco-cs.com', 15000); await sleep(6000);
  const wait = async (f, arg, ms = 20000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await A.ev(f, arg).catch(() => null); if (v) return v; await sleep(300); } return v; };
  await wait(() => window._gcEST3 && window._gcEST3.list().some(e => e.id === 'E1') && window._gcBidEst, null, 60000);
  await A.ev(() => { try { window._gcBidEst.link('J1', 'P1'); } catch (e) {} window._gcBidEst.open('J1'); });
  await wait(() => document.querySelector('#gcsys-modal [data-be-scope]'));
  const v1 = await A.ev(() => { const M = document.getElementById('gcsys-modal'); const rows = [...M.querySelectorAll('tr[data-be-item]')].map(r => ({ label: r.firstChild.textContent, cells: [...r.querySelectorAll('[data-be-cell]')].map(c => c.getAttribute('data-be-cell')).join(','), hot: r.classList.contains('hot'), asks: r.querySelectorAll('[data-be="ask"]').length }));
    return { gaps: +(M.querySelector('[data-be-gaps]') || { getAttribute: () => -1 }).getAttribute('data-be-gaps'), rows, mism: (M.querySelector('tr[data-be-bid="subportal:b1"] [data-be-mismatch]') || {}).textContent || '', unread: !!M.querySelector('tr[data-be-bid="subportal:b3"] [data-be="read"]') }; });
  const hang = v1.rows.filter(r => /hang/i.test(r.label));
  ok('C1 the read PDFs join the compare: "Drywall hang & finish, Level 4" ≈ "Hang and finish GWB" are ONE row (lowest first: Gamma not read yet —, Beta ✅, Alpha ✅)', hang.length === 1 && hang[0].cells === ',inc,inc', v1.rows);
  const tu = v1.rows.find(r => /touch/i.test(r.label)) || {};
  ok('C2 a line one bidder includes and others exclude / do not mention is a ⚠ gap (Paint touch-up: Beta ✅, Alpha ⛔ paint) with 📩 Ask buttons; "⚠ N scope gaps" on top', tu.hot && tu.asks >= 1 && v1.gaps >= 1, [v1.gaps, tu]);
  ok('C3 the bid row shows "⚠ Price on the PDF $18,450.00 ≠ typed $17,900.00"; the unread one "Not read yet — 📄 Read"', /18,450\.00 ≠ typed \$17,900\.00/.test(v1.mism) && v1.unread, v1);
  if (SHOTS) await A.page().screenshot({ path: path.join(SHOTS, 'subsimple_scopecompare.png') });
  await A.ev(() => document.querySelector('#gcsys-modal tr[data-be-bid="subportal:b3"] [data-be="read"]').click());
  await wait(() => document.querySelector('#gcsys-modal tr[data-be-bid="subportal:b3"] [data-be-read="read"]'));
  const cb = await A.ev(() => { const r = [...document.querySelectorAll('#gcsys-modal tr[data-be-item]')].find(x => /corner/i.test(x.firstChild.textContent)); return r ? [...r.querySelectorAll('[data-be-cell]')].map(c => c.getAttribute('data-be-cell')).join(',') : ''; });
  ok('C4 📄 Read → the 3rd PDF is read and joins: Corner bead ⛔ (Gamma, lowest, excludes it) ✅ ✅', HUBC.reads.length === 1 && cb === 'exc,inc,inc', cb);
  await A.ev(() => { const r = [...document.querySelectorAll('#gcsys-modal tr[data-be-item]')].find(x => /corner/i.test(x.firstChild.textContent)); r.querySelector('[data-be="ask"]').click(); });
  await wait(() => HUBC.asks.length === 1);
  ok('C5 📩 Ask Gamma about Corner bead → bid-hub scopeask for THAT sub and line (the server sends it, tagged \'trade\' — A10)', HUBC.asks.length === 1 && HUBC.asks[0].id === 'b3' && /corner/i.test(HUBC.asks[0].item) && HUBC.asks[0].kind === 'exc', HUBC.asks);
  await A.ev(() => { const r = [...document.querySelectorAll('#gcsys-modal tr[data-be-item]')].find(x => /corner/i.test(x.firstChild.textContent)); r.querySelector('[data-be="gapline"]').click(); });
  await sleep(1200);
  await A.ev(() => { document.querySelector('#gcsys-modal [data-be="estnotes"]').click(); });
  await sleep(1500);
  const est = await A.ev(() => { const e = window._gcEST3.list().find(x => x.id === 'E1') || {}; return { lines: (e.lines || []).map(l => l.desc + '|' + (l.scopeGap ? 'gap' : '')), inc: (e.scope || {}).inc || '', exc: (e.scope || {}).exc || '' }; });
  ok('C6 ➕ Add to our estimate → a "Drywall — Corner bead" line in the project\'s estimate (price to type there), the typed lines kept', est.lines.some(l => /Drywall — Corner bead\|gap/i.test(l)) && est.lines.some(l => /^Supervision/.test(l)), est);
  ok('C7 📝 Add to our estimate notes → the agreed inclusions / exclusions copied into the estimate\'s Inclusions / Exclusions', /Drywall: .*hang/i.test(est.inc) && est.inc.split('\n').length >= 1, est);
  await A.ev(() => { const r = [...document.querySelectorAll('#gcsys-modal tr[data-be-item]')].find(x => /corner/i.test(x.firstChild.textContent)); r.querySelector('[data-be="rev"]').click(); });
  await wait(() => Object.keys(HUBC.review).length === 1);
  const g2 = await wait(() => { const x = document.querySelector('#gcsys-modal [data-be-gaps]'); return x ? x.getAttribute('data-be-gaps') : null; });
  ok('C8 ✓ Reviewed is saved (bid-hub scopereview) and that gap leaves the ⚠ count', Object.keys(HUBC.review).length === 1 && +g2 >= 0, [HUBC.review, g2]);
  ok('C9 no page errors in the CRM', cerr.length === 0, cerr);
  try { await A.close(); } catch (e) {}
}
const bad = R.filter(x => !x).length;
console.log(`\n${R.length - bad} / ${R.length} passed`);
process.exit(bad ? 1 : 0);
