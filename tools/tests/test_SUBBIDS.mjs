/* patch SUBBIDS — node tools/tests/test_SUBBIDS.mjs [build dir]   (offline; made-up subs, jobs and bids; an in-memory Supabase)
   📋 Jobs to bid in the SUB PORTAL (portal-access.js p-bidjobs / p-bid-save, on the bid site's sp_rows through subportal.js):
   · jobs listed only by the bid site's rules: a draft, a private job they are not invited to, a closed one and a deleted one are
     hidden; a private job they are invited to is shown; a job they bid on that has closed stays (their bid, no form)
   · never another sub's bid, amount, name or e-mail; no ranks / results
   · plan links (Google Drive …) and the bid site's plan files (signed links) are there
   · p-bid-save writes the bid site's bid record (same shape) and updates it; a decided bid can't change; a closed / hidden job
     can't be bid; missing or expired papers (W-9, GL, WC) refuse it and name the paper
   · a new bid tells GrayCo (the bid site's 'new-bid' e-mail) — never while PORTAL_MAIL_OFF is on
   · a sub with no bid-site profile gets linked:false; "Join GrayCo bids" (p-bids) makes one waiting for approval
   patch SUBSIGNUP (browser, Chromium, offline — portal.html + portal-app.js; the bid site's register is a mock here):
   · the sign-in screen's "New subcontractor? Create your account" → the form (EN / ES), its checks, success → "waiting for approval",
     possible duplicates → "That's not us — create anyway" (force), 409 → back to sign in with the e-mail, ?invite=…&job=… → the
     e-mail filled in from invite-info and the invite passed to register
   · 📋 Jobs to bid on Home (phone 390 px + desktop): the card, the job sheet, a bid sent from the form, papers missing → form blocked
   Usage: node tools/tests/test_SUBBIDS.mjs [build dir] [--shots DIR] [--no-browser]   (wrap a browser run in browser_lock.sh) */
import { createRequire } from 'module'; import path from 'path'; import fs from 'fs'; import crypto from 'crypto'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ARGV = process.argv.slice(2), SHOTS = ARGV.indexOf('--shots') >= 0 ? path.resolve(ARGV[ARGV.indexOf('--shots') + 1]) : '';
const NO_BROWSER = ARGV.indexOf('--no-browser') >= 0;
const ROOT = path.resolve(ARGV.find((a, i) => !a.startsWith('--') && ARGV[i - 1] !== '--shots') || path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const FN = path.join(ROOT, 'netlify/functions');
process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_KEY = 'svc-key-test'; process.env.PORTAL_MAIL_OFF = '1';
delete process.env.RESEND_API_KEY; delete process.env.OWNER_EMAILS; delete process.env.SUBPORTAL_NOTIFY;
let pass = 0, fail = 0;
async function t(name, fn){ try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e && e.message ? e.message.slice(0, 500) : e); } }
function eq(a, b, m){ if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
function yes(c, m){ if (!c) throw new Error(m || 'expected true'); }
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const now = new Date().toISOString();

/* ── the sample CRM (gc_kv) ── */
const SUBS = {
  A: { id: 'SA', name: 'Sample Drywall LLC', company: 'Sample Drywall LLC', contact: 'Sam Sample', email: 'sam@sampledrywall.test', phone: '901-555-0141', isSub: true, trade: 'Drywall' },
  B: { id: 'SB', name: 'Other Paint Co', company: 'Other Paint Co', contact: 'Otto Other', email: 'otto@otherpaint.test', phone: '901-555-0142', isSub: true, trade: 'Paint' },
  C: { id: 'SC', name: 'New Tile Inc', company: 'New Tile Inc', contact: 'Nia New', email: 'nia@newtile.test', isSub: true, trade: 'Tile' },
  D: { id: 'SD', name: 'Waiting Roof Co', company: 'Waiting Roof Co', contact: 'Wes Wait', email: 'wes@waitroof.test', isSub: true, trade: 'Roofing' },
  E: { id: 'SE', name: 'Linked Only LLC', company: 'Linked Only LLC', contact: 'Lin Link', email: '', isSub: true, trade: 'Framing' } };
const KV = { projects: [], vendors: Object.values(SUBS), users: [], gc_sub_portal_settings: {}, gc_automation_pause: { on: false } };

/* ── the bid site (sp_rows) ── */
const U = {
  A: { id: 'u_a1', role: 'sub', approved: true, email: SUBS.A.email, name: 'Sam Sample', company: 'Sample Drywall LLC', phone: '901-555-0141', trades: ['Drywall'] },
  B: { id: 'u_b1', role: 'sub', approved: true, email: SUBS.B.email, name: 'Otto Other', company: 'Other Paint Co', phone: '901-555-0142', trades: ['Paint'] },
  D: { id: 'u_d1', role: 'sub', approved: false, email: SUBS.D.email, name: 'Wes Wait', company: 'Waiting Roof Co' },
  E: { id: 'u_e1', role: 'sub', approved: true, email: 'lin@linkedonly.test', name: 'Lin Link', company: 'Linked Only LLC', crmSubId: 'SE' },
  PM: { id: 'st_pm', role: 'admin', approved: true, email: 'samplepm@grayco-cs.com', name: 'Sample PM' } };
const JOBS = [
  { id: 'j_open', title: 'Sample Clinic Remodel', address: '100 Sample Pkwy, Memphis, TN 38117', bidDueDate: day(6), status: 'open', visibility: 'public', pmId: 'st_pm', tradesSought: 'Drywall, paint',
    scope: 'Demo and rebuild the clinic interior: 4 exam rooms, hall and lobby.', specifications: '5/8" Type X on all demising walls. Level 4 finish.', notes: 'Site walk Tuesday 9 AM.',
    tradeScopes: [{ id: 'ts1', trade: 'Drywall', scope: 'Hang, tape and finish all new walls and ceilings.' }, { id: 'ts2', trade: 'Paint', scope: 'PAINT-ONLY-SCOPE' }],
    plansLinks: [{ url: 'https://drive.google.com/drive/folders/sample123', label: 'Plans folder (Google Drive)' }, { url: 'javascript:alert(1)', label: 'bad' }], log: ['INTERNAL-LOG'] },
  { id: 'j_draft', title: 'DRAFT-JOB', status: 'draft', draft: true, visibility: 'private' },
  { id: 'j_priv', title: 'PRIVATE-NOT-INVITED', status: 'open', visibility: 'private' },
  { id: 'j_inv', title: 'Sample Warehouse (invited)', address: '5 Dock Rd, Memphis, TN', status: 'open', visibility: 'private', bidDueDate: day(2) },
  { id: 'j_closed', title: 'CLOSED-JOB', status: 'closed', visibility: 'public' },
  { id: 'j_gone', title: 'DELETED-JOB', status: 'open', visibility: 'public', archivedAt: now },
  { id: 'j_dec', title: 'Sample Office (decided)', status: 'open', visibility: 'public', bidDueDate: day(9) },
  { id: 'j_won', title: 'Sample School (bid, now closed)', status: 'won', visibility: 'public' } ];
const T = { gc_portal_lock: [], gc_portal_session: [], gc_sub_link: [], gc_sub_event: [], gc_sub_scope: [], gc_portal_msg: [], gc_portal: [], sp_rows: [] };
const spRow = (collection, id, data, extra) => Object.assign({ key: collection + '/' + id, collection, id, job_id: null, user_id: null, email: null, data, updated_at: now }, extra || {});
Object.values(U).forEach(u => T.sp_rows.push(spRow('users', u.id, u, { user_id: u.id, email: u.email })));
JOBS.forEach(j => T.sp_rows.push(spRow('jobs', j.id, j, { job_id: j.id })));
T.sp_rows.push(spRow('invites', 'inv1', { id: 'inv1', jobId: 'j_inv', email: SUBS.A.email }, { job_id: 'j_inv', email: SUBS.A.email }));
const bidRow = b => spRow('bids', b.id, b, { job_id: b.jobId, user_id: b.userId });
T.sp_rows.push(bidRow({ id: 'b_other', jobId: 'j_open', userId: 'u_b1', userName: 'Otto Other', userCompany: 'Other Paint Co', userEmail: SUBS.B.email, amount: 7777, scope: 'OTHER-SCOPE', notes: 'OTHER-NOTES', submittedAt: now }));
T.sp_rows.push(bidRow({ id: 'b_dec', jobId: 'j_dec', userId: 'u_a1', userName: 'Sam Sample', userCompany: 'Sample Drywall LLC', userEmail: SUBS.A.email, amount: 12000, notes: 'decided one', accepted: true, submittedAt: now, acceptedAt: now,
  awardPm: { name: 'Pat Sample PM', phone: '(901) 555-0142', email: 'pm.sample@grayco-cs.com' }, awardExclusions: ['Patching', 'Cleanup — not in your bid'] }));   /* patch BIDSCOPE: the award's PM + what to confirm */
T.sp_rows.push(bidRow({ id: 'b_won', jobId: 'j_won', userId: 'u_a1', userName: 'Sam Sample', userCompany: 'Sample Drywall LLC', userEmail: SUBS.A.email, amount: 4321, submittedAt: now }));
T.sp_rows.push(spRow('plans', 'j_open', { items: [{ name: 'A1 Floor plan.pdf', category: 'Architectural', type: 'application/pdf', size: 1000, fileRef: 'staff/2026-11/abc-A1.pdf' }] }, { job_id: 'j_open' }));
T.sp_rows.push(spRow('plans', 'j_priv', { items: [{ name: 'PRIVATE-PLAN.pdf', type: 'application/pdf', fileRef: 'staff/2026-11/priv.pdf' }] }, { job_id: 'j_priv' }));
const docsOf = list => ({ items: list });
/* patch BIDPOST: the job's Q&A — another bidder's question GrayCo answered to all bidders, and one that is private to that bidder */
T.sp_rows.push(spRow('questions', 'q_pub', { id: 'q_pub', jobId: 'j_open', userId: 'u_b1', userName: 'Otto Other', userCompany: 'Other Paint Co', body: 'Is the lobby ceiling in this bid?', answer: 'Yes — ACT in the lobby only.', visibility: 'public', at: now, num: 1 }, { job_id: 'j_open', user_id: 'u_b1' }));
T.sp_rows.push(spRow('questions', 'q_priv', { id: 'q_priv', jobId: 'j_open', userId: 'u_b1', userName: 'Otto Other', userCompany: 'Other Paint Co', body: 'PRIVATE-QUESTION-OF-OTTO', answer: '', visibility: 'private', at: now }, { job_id: 'j_open', user_id: 'u_b1' }));
T.sp_rows.push(spRow('subdocs', 'u_a1', docsOf([{ id: 'd1', type: 'w9' }, { id: 'd2', type: 'insurance_general', expirationDate: day(200) }, { id: 'd3', type: 'insurance_workers_comp', expirationDate: day(150) }]), { user_id: 'u_a1' }));
T.sp_rows.push(spRow('subdocs', 'u_b1', docsOf([{ id: 'd4', type: 'w9' }, { id: 'd5', type: 'insurance_general', expirationDate: day(-3) }]), { user_id: 'u_b1' }));
const SESS = {};
['A', 'B', 'C', 'D', 'E'].forEach((k, i) => { const tok = String.fromCharCode(65 + i).repeat(43), link = String.fromCharCode(97 + i).repeat(43); SESS[k] = tok;
  T.gc_portal_session.push({ id: sha(tok), kind: 'partner', sub_id: SUBS[k].id, links: [link], expires_at: new Date(Date.now() + 864e5).toISOString(), last_seen_at: now });
  T.gc_sub_link.push({ token: link, sub_id: SUBS[k].id, revoked: false }); });

/* ── the in-memory Supabase (+ Resend, caught) ── */
const MAIL = [], OUT = [];
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => typeof body === 'string' ? body : JSON.stringify(body) });
const val = v => decodeURIComponent(String(v || '')).replace(/^eq\./, '');
const inl = v => decodeURIComponent(String(v || '')).replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
global.fetch = async (url, init) => {
  init = init || {}; const u = new URL(url), q = u.searchParams, m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  if (u.host === 'api.resend.com') { MAIL.push(JSON.parse(init.body)); return res(200, { id: 'mail' + MAIL.length }); }
  if (u.host !== 'sb.test') { OUT.push(u.host); return res(404, {}); }
  if (u.pathname === '/rest/v1/gc_kv') {
    const k = q.get('key') || ''; const keys = k.startsWith('in.') ? inl(k) : [val(k)];
    return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: KV[x], updated_at: 'T0' })));
  }
  if (u.pathname === '/auth/v1/admin/users' && m === 'POST') return res(200, { id: 'auth-' + crypto.randomBytes(3).toString('hex') });
  if (u.pathname === '/auth/v1/token' && m === 'POST') { const b = JSON.parse(init.body); return b.password === 'Right-Pass-1' ? res(200, { access_token: 'x' }) : res(400, { error: 'invalid_grant' }); }   /* BIDONLY: the bid-site password */
  if (u.pathname.startsWith('/storage/v1/object/sign/')) { const b = JSON.parse(init.body); const bucket = u.pathname.split('/').pop(); return res(200, b.paths.map(p => ({ path: p, signedURL: '/object/sign/' + bucket + '/' + p + '?token=signed' }))); }
  const tm = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
  if (tm && T[tm[1]]) {
    const tb = T[tm[1]];
    if (m === 'POST') {
      const b = JSON.parse(init.body), merge = /merge-duplicates/.test(hd.Prefer || '') && q.get('on_conflict');
      (Array.isArray(b) ? b : [b]).forEach(r => { const i = merge ? tb.findIndex(x => x[merge] === r[merge]) : -1; if (i >= 0) tb[i] = Object.assign({}, tb[i], r); else tb.push(Object.assign({ created_at: now }, r)); });
      return res(201, []);
    }
    let rows = tb.slice();
    for (const [k, v] of q.entries()) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === val(v));
      else if (v.startsWith('in.')) rows = rows.filter(r => inl(v).includes(String(r[k])));
      else if (v === 'is.null') rows = rows.filter(r => r[k] == null);
    }
    if (m === 'DELETE') { rows.forEach(r => tb.splice(tb.indexOf(r), 1)); return res(204, ''); }
    if (m === 'PATCH') { const b = JSON.parse(init.body); rows.forEach(r => Object.assign(r, b)); return res(200, rows); }
    const ord = q.get('order'); if (ord) { const [f, d] = ord.split('.'); rows.sort((a, b) => (String(a[f]) < String(b[f]) ? -1 : 1) * (d === 'desc' ? -1 : 1)); }
    return res(200, rows);
  }
  return res(404, {});
};
const PA = require(path.join(FN, 'portal-access.js'));
let ipN = 0;
const call = async (who, action, body) => { const r = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.grayco-cs.com', 'x-portal-session': SESS[who], 'x-nf-client-connection-ip': '10.7.0.' + (++ipN % 250) }, body: JSON.stringify(Object.assign({ action }, body || {})) }); return { code: r.statusCode, j: JSON.parse(r.body), raw: r.body }; };
const bidsOf = (job, user) => T.sp_rows.filter(r => r.collection === 'bids' && (!job || r.job_id === job) && (!user || r.user_id === user));

await t('p-bidjobs: only the jobs the bid site lets this sub bid on (public open, invited private) + their own bid jobs; never draft / private-not-invited / closed / deleted', async () => {
  const r = await call('A', 'p-bidjobs'); eq(r.code, 200, r.raw);
  eq([r.j.linked, r.j.approved], [true, true]);
  eq(r.j.jobs.map(j => j.id).sort(), ['j_dec', 'j_inv', 'j_open', 'j_won']);
  yes(!/DRAFT-JOB|PRIVATE-NOT-INVITED|CLOSED-JOB|DELETED-JOB|PRIVATE-PLAN/.test(r.raw), 'a hidden job leaked');
  const inv = r.j.jobs.find(j => j.id === 'j_inv'); eq([inv.invited, inv.canBid, inv.myBid], [true, true, null]);
  const won = r.j.jobs.find(j => j.id === 'j_won'); eq([won.canBid, won.myBid.amount, won.myBid.status], [false, 4321, 'pending'], 'their bid on a job that closed: listed, no form');
  const dec = r.j.jobs.find(j => j.id === 'j_dec'); eq([dec.canBid, dec.myBid.status], [true, 'accepted']);
  eq(dec.myBid.award && [dec.myBid.award.pm.name, dec.myBid.award.pm.phone, dec.myBid.award.pm.email, dec.myBid.award.confirm.join('|')], ['Pat Sample PM', '(901) 555-0142', 'pm.sample@grayco-cs.com', 'Patching|Cleanup — not in your bid']);   /* patch BIDSCOPE */
  eq(r.j.jobs.filter(j => j.canBid).map(j => j.id).slice(0, 1), ['j_inv'], 'invited first');
});
await t('p-bidjobs: the job as a sub sees it — title, address, due date, trades, scope / specs / notes, their trade\'s scope, plan links (https only), signed plan files', async () => {
  const r = await call('A', 'p-bidjobs'), j = r.j.jobs.find(x => x.id === 'j_open');
  eq([j.title, j.address, j.bidDueDate, j.tradesSought], ['Sample Clinic Remodel', '100 Sample Pkwy, Memphis, TN 38117', day(6), 'Drywall, paint']);
  yes(/4 exam rooms/.test(j.scope) && /Type X/.test(j.specifications) && /Site walk/.test(j.notes));
  eq(j.tradeScopes.map(x => x.trade), ['Drywall'], 'only their own trade\'s scope');
  eq(j.plansLinks, [{ url: 'https://drive.google.com/drive/folders/sample123', label: 'Plans folder (Google Drive)' }]);
  eq(j.plans.map(f => [f.name, f.url]), [['A1 Floor plan.pdf', 'https://sb.test/storage/v1/object/sign/subportal-files/staff/2026-11/abc-A1.pdf?token=signed']]);
  yes(!/INTERNAL-LOG|PAINT-ONLY-SCOPE|fileRef/.test(r.raw));
  eq(r.j.docs, { ok: true, missing: [], expired: [], have: [{ type: 'w9', exp: '' }, { type: 'insurance_general', exp: day(200) }, { type: 'insurance_workers_comp', exp: day(150) }] });
});
await t('isolation: another sub\'s bid, amount, name or e-mail never reaches this sub (p-bidjobs, p-home)', async () => {
  for (const r of [await call('A', 'p-bidjobs'), await call('A', 'p-home')]) {
    eq(r.code, 200, r.raw);
    yes(!/7777|Other Paint|Otto|otherpaint|OTHER-SCOPE|OTHER-NOTES|b_other|_rank|_amounts|userEmail/.test(r.raw), r.raw.slice(0, 300));
  }
  eq((await call('A', 'p-bidjobs')).j.jobs.find(j => j.id === 'j_open').myBid, null, 'B\'s bid on the job is not A\'s');
});
await t('p-bid-save: a new bid = the bid site\'s record (same shape), then an update keeps the id / submittedAt; GrayCo is not mailed while PORTAL_MAIL_OFF', async () => {
  const r = await call('A', 'p-bid-save', { jobId: 'j_open', amount: '18,450.50', notes: 'Includes Level 4 finish. Excludes paint.' }); eq(r.code, 200, r.raw);
  eq([r.j.created, r.j.bid.amount, r.j.bid.status], [true, 18450.5, 'pending']);
  const rows = bidsOf('j_open', 'u_a1'); eq(rows.length, 1);
  const b = rows[0].data;
  eq(Object.keys(b).sort(), ['amount', 'docs', 'id', 'jobId', 'notes', 'scope', 'submittedAt', 'updatedAt', 'userCompany', 'userEmail', 'userId', 'userName', 'userPhone'].sort());
  eq([b.jobId, b.userId, b.userName, b.userCompany, b.userEmail, b.userPhone, b.amount], ['j_open', 'u_a1', 'Sam Sample', 'Sample Drywall LLC', SUBS.A.email, '901-555-0141', 18450.5]);
  yes(/^b_[a-z0-9]+$/.test(b.id), b.id); eq([rows[0].key, rows[0].job_id, rows[0].user_id], ['bids/' + b.id, 'j_open', 'u_a1']);
  eq(MAIL.length, 0, 'no mail while PORTAL_MAIL_OFF');
  await new Promise(r2 => setTimeout(r2, 5));
  const u = await call('A', 'p-bid-save', { jobId: 'j_open', amount: 17900, notes: 'Revised.' }); eq(u.code, 200, u.raw);
  eq(u.j.created, false);
  const rows2 = bidsOf('j_open', 'u_a1'); eq(rows2.length, 1, 'still one bid');
  eq([rows2[0].data.id, rows2[0].data.amount, rows2[0].data.notes, rows2[0].data.submittedAt], [b.id, 17900, 'Revised.', b.submittedAt]);
  yes(rows2[0].data.updatedAt >= b.updatedAt);
  eq(bidsOf('j_open', 'u_b1')[0].data.amount, 7777, 'the other sub\'s bid untouched');
  const l = await call('A', 'p-bidjobs'); eq(l.j.jobs.find(j => j.id === 'j_open').myBid.amount, 17900);
});
await t('p-bid-save: a bid GrayCo decided can\'t change; a closed / hidden / unknown job can\'t be bid; the amount is needed', async () => {
  const d = await call('A', 'p-bid-save', { jobId: 'j_dec', amount: 1 }); eq(d.code, 409); yes(/already been decided/.test(d.j.error), d.j.error);
  eq(bidsOf('j_dec', 'u_a1')[0].data.amount, 12000);
  for (const id of ['j_closed', 'j_draft', 'j_priv', 'j_gone', 'j_won', 'nope']) { const x = await call('A', 'p-bid-save', { jobId: id, amount: 100 }); eq(x.code, 403, id + ' ' + x.raw); yes(/not open for bids/.test(x.j.error)); }
  eq(bidsOf('j_closed').length + bidsOf('j_priv').length + bidsOf('j_draft').length + bidsOf('j_gone').length, 0);
  eq((await call('A', 'p-bid-save', { jobId: 'j_inv', amount: '' })).code, 400);
  eq((await call('A', 'p-bid-save', { jobId: '../x', amount: 5 })).code, 400);
});
await t('papers: missing or expired W-9 / GL / WC refuse the bid and name the paper (B: GL expired, WC missing); after upload it goes through and GrayCo is told', async () => {
  const p = await call('B', 'p-bidjobs'); eq(p.j.docs.ok, false); eq([p.j.docs.missing, p.j.docs.expired], [['insurance_workers_comp'], ['insurance_general']]);
  const r = await call('B', 'p-bid-save', { jobId: 'j_open', amount: 9000 }); eq(r.code, 409, r.raw);
  yes(/General liability/.test(r.j.error) && /Workers' comp/.test(r.j.error) && /expired/.test(r.j.error) && /missing/.test(r.j.error) && /My Documents/.test(r.j.error) && /Papers/.test(r.j.error), r.j.error);
  eq(bidsOf('j_open', 'u_b1')[0].data.amount, 7777, 'nothing written');
  const row = T.sp_rows.find(x => x.key === 'subdocs/u_b1'); row.data = docsOf([{ type: 'w9' }, { type: 'insurance_general', expirationDate: day(-3) }, { type: 'insurance_general', expirationDate: day(90) }]);
  const r2 = await call('B', 'p-bid-save', { jobId: 'j_open', amount: 9000 }); eq(r2.code, 409); yes(/Workers' comp/.test(r2.j.error) && !/General liability/.test(r2.j.error), 'only WC now: ' + r2.j.error);
  row.data.items.push({ type: 'insurance_workers_comp', expirationDate: day(30) });
  process.env.PORTAL_MAIL_OFF = ''; process.env.RESEND_API_KEY = 're_test_key';
  try {
    const r3 = await call('B', 'p-bid-save', { jobId: 'j_inv', amount: 100 }); eq(r3.code, 403, 'B is not invited to the private job');
    T.sp_rows.find(x => x.key === 'jobs/j_dec').data.status = 'open';
    const r4 = await call('B', 'p-bid-save', { jobId: 'j_dec', amount: 5150 }); eq(r4.code, 200, r4.raw); eq(r4.j.created, true);
    yes(MAIL.length === 1 && /New bid — Sample Office \(decided\) — Other Paint Co/.test(MAIL[0].subject), JSON.stringify(MAIL.map(x => x.subject)));
    yes(MAIL[0].to.includes('office@grayco-cs.com'), JSON.stringify(MAIL[0].to));
    const r5 = await call('B', 'p-bid-save', { jobId: 'j_dec', amount: 5100 }); eq(r5.code, 200); eq(MAIL.length, 1, 'an update is not a new bid');
  } finally { process.env.PORTAL_MAIL_OFF = '1'; delete process.env.RESEND_API_KEY; }
  const a = await call('A', 'p-bidjobs'); yes(!/5150|5100|Other Paint/.test(a.raw), 'A never sees B\'s new bid'); eq(a.j.jobs.find(j => j.id === 'j_dec').myBid.amount, 12000);
});
await t('an expired paper also blocks: A\'s WC runs out → refused naming WC', async () => {
  const row = T.sp_rows.find(x => x.key === 'subdocs/u_a1'), keep = row.data;
  row.data = docsOf(keep.items.map(d => d.type === 'insurance_workers_comp' ? Object.assign({}, d, { expirationDate: day(-1) }) : d));
  const r = await call('A', 'p-bid-save', { jobId: 'j_inv', amount: 2500 }); eq(r.code, 409); yes(/Workers' comp/.test(r.j.error) && /expired/.test(r.j.error), r.j.error);
  eq(r.j.papers.expired, ['insurance_workers_comp']);
  row.data = docsOf(keep.items.filter(d => d.type !== 'w9'));
  const r2 = await call('A', 'p-bid-save', { jobId: 'j_inv', amount: 2500 }); eq(r2.code, 409); yes(/W-9/.test(r2.j.error) && /missing/.test(r2.j.error), r2.j.error);
  row.data = keep;
  eq(bidsOf('j_inv').length, 0);
  const ok = await call('A', 'p-bid-save', { jobId: 'j_inv', amount: 2500 }); eq(ok.code, 200, ok.raw);
});
await t('no bid-site profile: linked:false (Join GrayCo bids); p-bid-save refused; p-bids makes the profile → waiting for approval', async () => {
  const r = await call('C', 'p-bidjobs'); eq(r.code, 200); eq([r.j.linked, r.j.approved, r.j.canJoin, r.j.jobs], [false, false, true, []]);
  const h = await call('C', 'p-home'); eq(h.j.bids.state, 'invite');
  const s = await call('C', 'p-bid-save', { jobId: 'j_open', amount: 10 }); eq(s.code, 403); yes(/Join GrayCo bids/.test(s.j.error));
  eq((await call('C', 'p-bids', { password: 'short' })).code, 400);
  const j = await call('C', 'p-bids', { password: 'long-enough-pw' }); eq(j.code, 200, j.raw); eq(j.j.state, 'waiting');
  const prof = T.sp_rows.find(x => x.collection === 'users' && x.email === SUBS.C.email); yes(prof && prof.data.approved === false && prof.data.crmSubId === 'SC');
  const r2 = await call('C', 'p-bidjobs'); eq([r2.j.linked, r2.j.approved, r2.j.jobs], [true, false, []]);
  const d = await call('D', 'p-bidjobs'); eq([d.j.linked, d.j.approved, d.j.jobs], [true, false, []], 'not approved yet: no jobs');
  eq((await call('D', 'p-bid-save', { jobId: 'j_open', amount: 10 })).code, 403);
});
await t('a profile GrayCo linked by crmSubId (no e-mail on the CRM sub) is found (and its papers are checked)', async () => {
  const r = await call('E', 'p-bidjobs'); eq([r.j.linked, r.j.approved], [true, true]); yes(r.j.jobs.some(j => j.id === 'j_open'));
  eq(r.j.docs.missing, ['w9', 'insurance_general', 'insurance_workers_comp']);
  const s = await call('E', 'p-bid-save', { jobId: 'j_open', amount: 10 }); eq(s.code, 409); yes(/W-9/.test(s.j.error));
});
await t('no session / a customer session: refused like every sub action', async () => {
  const r = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.grayco-cs.com', 'x-nf-client-connection-ip': '10.8.0.1' }, body: JSON.stringify({ action: 'p-bidjobs' }) }); eq(r.statusCode, 404);
});
await t('nothing left the in-memory Supabase / caught mailer', () => { eq(OUT.filter(h => h !== 'api.resend.com'), []); });
await t('portal-app.js: the card, the sheet and the form are there in English and Spanish; portal.html loads the new build', () => {
  const app = fs.readFileSync(path.join(ROOT, 'portal-app.js'), 'utf8'), html = fs.readFileSync(path.join(ROOT, 'portal.html'), 'utf8');
  new Function(app);
  yes(/api\('p-bidjobs'\)/.test(app) && /api\('p-bid-save'/.test(app) && /data-bidjob/.test(app) && /bidSheet\(/.test(app));
  for (const k of ['jobsToBid', 'bidsJoin', 'papersNeed', 'bidSubmit', 'bidUpdate', 'bidDecided']) yes((app.match(new RegExp('\\b' + k + ':', 'g')) || []).length >= 2, k + ' in EN and ES');
  yes(/\/portal-app\.js\?v=33\.231-bidpost/.test(html), 'cache-bust');
});

/* ── the browser: portal.html + portal-app.js, phone and desktop ── */
const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
/* BIDONLY (owner 11/11: "only can see in it after we approve … whoever signs in can see plans tomorrow"): a sub approved on the bid site who
   is NOT in the CRM yet signs in to the portal with the e-mail + password they chose and sees the jobs to bid; unapproved → no portal */
T.sp_rows.push(spRow('users', 'u_f1', { id: 'u_f1', role: 'sub', approved: true, email: 'fay@freshframing.test', name: 'Fay Fresh', company: 'Fresh Framing LLC', phone: '901-555-0177', trades: ['Framing'] }, { user_id: 'u_f1', email: 'fay@freshframing.test' }));
T.sp_rows.push(spRow('users', 'u_g1', { id: 'u_g1', role: 'sub', approved: false, email: 'gus@notyet.test', name: 'Gus Notyet', company: 'Not Yet Co' }, { user_id: 'u_g1', email: 'gus@notyet.test' }));
const pw = async (email, password) => { const r = await PA.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.grayco-cs.com', 'x-nf-client-connection-ip': '10.9.0.' + (++ipN % 250) }, body: JSON.stringify({ action: 'signin-password', email, password }) }); let j = {}; try { j = JSON.parse(r.body); } catch (e) {} return { code: r.statusCode, j }; };
await t('BIDONLY: approved on the bid site, not in the CRM → e-mail + password opens the portal (portal turned on automatically)', async () => {
  const r = await pw('fay@freshframing.test', 'Right-Pass-1'); eq(r.code, 200, JSON.stringify(r.j)); eq(r.j.kind, 'partner');
  yes(T.gc_sub_link.some(l => l.sub_id === 'SBPfayfreshframingtest' && l.revoked === false), 'a link was made for the CRM id the CRM will give them');
  SESS.F = r.j.session;
  const h = await call('F', 'p-home'); eq(h.code, 200, h.raw);
  const b = await call('F', 'p-bidjobs'); eq(b.code, 200, b.raw); eq([b.j.linked, b.j.approved], [true, true]);
  yes(b.j.jobs.some(j => j.id === 'j_open' && j.plansLinks && j.plansLinks.length), 'sees the open job with its plan links');
  yes(!b.j.jobs.some(j => /DRAFT|PRIVATE-NOT|CLOSED|DELETED/.test(j.title)), 'never a hidden job');
});
await t('BIDONLY: wrong password → no; not approved yet → no portal', async () => {
  eq((await pw('fay@freshframing.test', 'wrong-pass-9')).code, 401);
  const r = await pw('gus@notyet.test', 'Right-Pass-1'); yes(r.code === 403 || r.code === 401, 'got ' + r.code + ' ' + JSON.stringify(r.j));
  yes(!T.gc_sub_link.some(l => l.sub_id === 'SBPgusnotyettest'), 'no link for an unapproved sub');
});
await t('BIDONLY: an approved sub who IS in the CRM but had no portal link gets one at sign-in', async () => {
  KV.vendors.push({ id: 'SH', name: 'Has Crm LLC', company: 'Has Crm LLC', email: 'hal@hascrm.test', isSub: true, trade: 'Paint' });
  T.sp_rows.push(spRow('users', 'u_h1', { id: 'u_h1', role: 'sub', approved: true, email: 'hal@hascrm.test', name: 'Hal', company: 'Has Crm LLC' }, { user_id: 'u_h1', email: 'hal@hascrm.test' }));
  const r = await pw('hal@hascrm.test', 'Right-Pass-1'); eq(r.code, 200, JSON.stringify(r.j)); yes(T.gc_sub_link.some(l => l.sub_id === 'SH'), 'link made for the CRM sub');
});
let chromium = null;
if (!NO_BROWSER) { try { ({ chromium } = await import(SPD + '/node_modules/playwright/index.mjs')); } catch (e) { console.log('  (no Playwright here — browser checks skipped)'); } }
if (chromium) {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const SHOTLIST = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  /* more made-up data for the screens: a job of A's in the CRM, a fresh public bid job, an unlinked sub F */
  KV.projects = [{ id: 'P1', name: 'Sample Kitchen Remodel', address: '123 Sample St, Memphis, TN 38117', status: 'Active', pm: 'Sample PM', subs: [{ subId: 'SA', name: SUBS.A.name, status: 'Awarded' }] }];
  SUBS.F = { id: 'SF', name: 'Fresh Floors LLC', company: 'Fresh Floors LLC', contact: 'Fay Fresh', email: 'fay@freshfloors.test', isSub: true, trade: 'Flooring' }; KV.vendors = Object.values(SUBS);
  SUBS.G = { id: 'SG', name: 'Good Glass Co', company: 'Good Glass Co', contact: 'Gil Good', email: 'gil@goodglass.test', isSub: true, trade: 'Glass' }; KV.vendors = Object.values(SUBS);
  [['F', 'SF'], ['G', 'SG']].forEach(([k, id]) => { SESS[k] = k.repeat(43); T.gc_portal_session.push({ id: sha(SESS[k]), kind: 'partner', sub_id: id, links: [k.toLowerCase().repeat(43)], expires_at: new Date(Date.now() + 864e5).toISOString(), last_seen_at: now });
    T.gc_sub_link.push({ token: k.toLowerCase().repeat(43), sub_id: id, revoked: false }); });
  const J2 = { id: 'j_new2', title: 'Sample Dental Office Build-Out', address: '2200 Sample Ave, Germantown, TN 38138', bidDueDate: day(4), status: 'open', visibility: 'public', tradesSought: 'Drywall, acoustic ceilings',
    scope: 'Build out a 3,200 sq ft dental office: 6 operatories, sterilization room, lab, break room and restrooms. Metal stud framing by others.', specifications: 'Level 5 finish in the reception area. 5/8" moisture-resistant board in wet areas. Acoustic ceiling tile 2x2, 15/16" grid.',
    notes: 'Pre-bid walk Thursday 10 AM. Work after 6 PM only for the last two weeks.', tradeScopes: [{ id: 't1', trade: 'Drywall', scope: 'Hang, tape and finish all walls; patch existing corridor walls; furr-downs at the reception soffit.' }],
    plansLinks: [{ url: 'https://drive.google.com/drive/folders/sample-dental', label: 'Plans folder (Google Drive)' }, { url: 'https://drive.google.com/file/d/sample-spec/view', label: 'Spec book' }] };
  T.sp_rows.push(spRow('jobs', J2.id, J2, { job_id: J2.id }));
  T.sp_rows.push(spRow('plans', J2.id, { items: [{ name: 'A1.1 Floor plan.pdf', category: 'Architectural', type: 'application/pdf', fileRef: 'staff/2026-11/dental-A11.pdf' }, { name: 'A6.1 Reflected ceiling plan.pdf', category: 'Architectural', type: 'application/pdf', fileRef: 'staff/2026-11/dental-A61.pdf' }] }, { job_id: J2.id }));
  PA._core._reset();

  /* the bid site's register / invite-info: a mock (what subportal.js answers) */
  const SPREQ = [];
  const INVITE = 'abcdef0123456789abcdef01';
  function subportalMock(body){
    let b = {}; try { b = JSON.parse(body || '{}'); } catch (e) {}
    SPREQ.push(b);
    if (b.action === 'invite-info') return b.invite === INVITE ? [200, { ok: true, email: 'invited@samplestucco.test', jobTitle: 'Sample Clinic Remodel' }] : [200, { ok: false }];
    /* patch SIGNUPPAPERS: the trade buttons, and the papers uploaded right after sign-up (a token for the new profile only) */
    if (b.action === 'trade-list') return [200, { trades: ['Drywall', 'Paint', 'Stucco', 'Framing', 'Roofing', 'Tile', 'Electrical', 'Plumbing'] }];
    if (b.action === 'signup-upload') return b.paperToken === 'tok-new' ? [200, { path: 'u/u_new/' + (UPN++) + '-' + b.name, url: 'https://portal.test/__upload/' + encodeURIComponent(b.name), apikey: 'anon' }] : [401, { error: 'The sign-up link is not valid.' }];
    if (b.action === 'signup-papers') return b.paperToken === 'tok-new' ? [200, { ok: true, saved: (b.items || []).length }] : [401, { error: 'no' }];
    if (b.action !== 'register') return [400, { error: 'Unknown action.' }];
    if (/^taken@/.test(b.email)) return [409, { error: 'That e-mail already has a portal account. Sign in, or use "Forgot password".' }];
    if (/Sample Dup/i.test((b.profile || {}).company) && !b.force) return [200, { duplicates: [{ company: 'Sample Dup Roofing LLC', dbaName: '', reasons: ['company name', 'phone'] }] }];
    return [200, { ok: true, approved: b.invite === INVITE, paperToken: 'tok-new' }];
  }
  let UPN = 1; const UPLOADS = [];
  async function browserFor(kind){
    const b = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
    const ctx = await b.newContext(Object.assign({ serviceWorkers: 'block' }, kind === 'phone' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1366, height: 820 } }));
    const S = { b, ctx, errs: [], bad: [], calls: [] };
    await ctx.route('**/*', async r => {
      const u = new URL(r.request().url());
      if (u.host !== 'portal.test') return r.abort('blockedbyclient');
      if (u.pathname.startsWith('/__upload/')) { UPLOADS.push({ name: decodeURIComponent(u.pathname.slice(10)), type: r.request().headers()['content-type'], size: (r.request().postDataBuffer() || Buffer.alloc(0)).length }); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"Key":"ok"}' }); }
      const fm = /^\/\.netlify\/functions\/([a-z-]+)$/.exec(u.pathname);
      if (fm) {
        const body = r.request().postData() || '';
        let a = ''; try { a = JSON.parse(body).action; } catch (e) {}
        if (fm[1] === 'mkt-public') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
        if (fm[1] === 'subportal') { const [code, j] = subportalMock(body); S.calls.push('subportal:' + a + ':' + code); return r.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(j) }); }
        if (fm[1] !== 'portal-access') { S.bad.push('404 fn ' + fm[1]); return r.fulfill({ status: 404, contentType: 'application/json', body: '{"ok":false}' }); }
        const resp = await PA.handler({ httpMethod: 'POST', headers: Object.assign({ origin: 'https://portal.test', 'x-nf-client-connection-ip': '10.9.' + (kind === 'phone' ? 1 : 2) + '.' + (++ipN % 250) }, r.request().headers()), body });
        S.calls.push(a + ':' + resp.statusCode);
        if (resp.statusCode === 401 || resp.statusCode >= 500) S.bad.push(a + ' → ' + resp.statusCode + ' ' + String(resp.body).slice(0, 120));
        return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body });
      }
      const f = path.join(ROOT, u.pathname === '/' ? 'portal.html' : decodeURIComponent(u.pathname));
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f });
      if (!/favicon/.test(u.pathname)) S.bad.push('404 ' + u.pathname);
      return r.fulfill({ status: 404, body: '' });
    });
    S.page = async (session, lang) => {
      const p = await ctx.newPage(); p.__kind = kind;
      p.on('pageerror', e => S.errs.push(e.message));
      p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) S.errs.push('console: ' + m.text().slice(0, 200)); });
      await p.addInitScript(([s, l]) => { try { if (s) localStorage.setItem('gc_portal_s', s); else localStorage.removeItem('gc_portal_s'); localStorage.setItem('gc_lang', l || 'en'); } catch (e) {} }, [session || '', lang || 'en']);
      return p;
    };
    return S;
  }
  async function shot(p, name, label, full){
    if (!SHOTS) return;
    const f = name + '_' + p.__kind + '.png'; await sleep(300);
    await p.screenshot({ path: path.join(SHOTS, f), fullPage: !!full }).catch(() => {});
    SHOTLIST.push(f + '  —  ' + label);
  }
  const text = p => p.evaluate(() => document.body.innerText);
  async function fillForm(p, o){
    const v = Object.assign({ company: 'Sample Stucco & Drywall LLC', name: 'Sam Newman', email: 'Sam@SampleStucco.test', phone: '901-555-0170', city: 'Memphis', state: 'tn', crew: '6',
      tradeOther: 'Stucco', area: 'Shelby, DeSoto', pw: 'sample-pass-1', pw2: 'sample-pass-1' }, o || {});
    for (const k of Object.keys(v)) await p.fill('#su_' + k, v[k]);
    if (!(o && 'tradeOther' in o) && !(await p.$('[data-su-trade="Drywall"].on'))) await p.click('[data-su-trade="Drywall"]');
  }
  async function toSignup(p){ await p.goto('https://portal.test/'); await p.waitForSelector('#siSignup', { timeout: 15000 }); await p.click('#siSignup'); await p.waitForSelector('#signupBox', { timeout: 15000 }); await sleep(200); }
  for (const kind of ['phone', 'desktop']) {
    const S = await browserFor(kind), tag = '[' + kind + '] ';
    /* ── sign-up ── */
    await t(tag + 'sign-in screen: "New subcontractor? Create your account" opens the form (all the fields, the terms checkbox)', async () => {
      const p = await S.page('');
      await p.goto('https://portal.test/'); await p.waitForSelector('#siSignup', { timeout: 15000 });
      eq(await p.$eval('#siSignup', b => b.textContent), 'New subcontractor? Create your account');
      await shot(p, '01_signin_with_signup', 'Sign-in screen with "New subcontractor? Create your account"');
      await p.click('#siSignup'); await p.waitForSelector('#signupBox', { timeout: 15000 });
      for (const k of ['company', 'name', 'email', 'phone', 'city', 'state', 'crew', 'tradeOther', 'area', 'pw', 'pw2', 'agree']) yes(await p.$('#su_' + k), 'field ' + k);
      for (const k of ['first', 'last', 'dba', 'addr', 'zip', 'lic', 'ein']) yes(!(await p.$('#su_' + k)), 'no extra field ' + k);   /* patch SIGNUPPAPERS: short */
      yes((await p.$$('[data-su-trade]')).length >= 6, 'trade buttons');
      eq(await p.$$eval('#suPapers [data-pp]', x => x.map(e => e.getAttribute('data-pp'))), ['w9', 'gl', 'wc', 'lic']);
      eq(await p.$$eval('#suPapers [data-pp="wc"] input[type=radio]', x => x.map(e => e.value)), ['later', 'upload', 'exempt']);
      yes(/Upload these now for faster approval/.test(await p.textContent('#suPapers')));
      const terms = await p.$$eval('#signupBox a[target="_blank"]', a => a.map(x => x.getAttribute('href')));
      eq(terms, ['/sub-terms.html', '/sub-privacy.html']);
      await shot(p, '02_signup_form', 'Create your subcontractor account (the form)', true);
      const w = await p.evaluate(() => document.documentElement.scrollWidth); yes(w <= (kind === 'phone' ? 390 : 1366), 'no sideways scroll: ' + w);
      await p.close();
    });
    await t(tag + 'sign-up checks: required fields, password ≥ 8 and the same twice, 2-letter state, the terms box', async () => {
      const p = await S.page(''); await toSignup(p); const regs = () => SPREQ.filter(x => x.action === 'register').length, n0 = regs();
      await p.click('#suGo'); yes(/Please fill in: Company name, Your name, E-mail, Mobile phone, City, State, Your trade\(s\)/.test(await p.textContent('#suErr')), await p.textContent('#suErr'));
      await fillForm(p, { pw: 'short', pw2: 'short' }); await p.click('#suGo'); yes(/at least 8/.test(await p.textContent('#suErr')));
      await fillForm(p, { pw2: 'different-1' }); await p.click('#suGo'); yes(/do not match/.test(await p.textContent('#suErr')));
      await fillForm(p, { state: 'T1' }); await p.click('#suGo'); yes(/2-letter state/.test(await p.textContent('#suErr')), await p.textContent('#suErr'));
      await fillForm(p); await p.click('#suGo'); yes(/agree/.test(await p.textContent('#suErr')));
      eq(regs(), n0, 'nothing sent until the form is right');
      await shot(p, '03_signup_check', 'The form says what is missing');
      await p.close();
    });
    await t(tag + 'sign-up papers (patch SIGNUPPAPERS): W-9 "I have it — will send later", GL uploaded with its expiry, WC exempt, a license file → uploaded right after sign-up; the ticks go with the profile', async () => {
      const p = await S.page(''); await toSignup(p); await fillForm(p, { email: 'papers@samplestucco.test' }); await p.check('#su_agree');
      await p.check('#pp_w9_later'); await p.check('#pp_gl_upload'); await p.check('#pp_wc_exempt');
      const pdf = { name: 'gl-coi.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sample GL certificate') };
      await p.setInputFiles('#pp_glf', pdf);
      await p.click('#suGo'); yes(/expiration date/i.test(await p.textContent('#suErr')), 'GL needs its expiry: ' + await p.textContent('#suErr'));
      await p.fill('#pp_gle', day(300)); await p.fill('#pp_ls', 'tn'); await p.fill('#pp_lt', 'Painting'); await p.fill('#pp_ln', '55555');
      await p.setInputFiles('#pp_lf', { name: 'license.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([255, 216, 255, 0, 1, 2]) });
      await shot(p, '02b_signup_papers', 'Sign-up papers: W-9 later, GL uploaded + expiry, WC exempt, a license photo', true);
      const u0 = UPLOADS.length;
      await p.click('#suGo'); await p.waitForSelector('#signupDone', { timeout: 15000 });
      const reg = SPREQ.filter(x => x.action === 'register').pop(), pap = SPREQ.filter(x => x.action === 'signup-papers').pop();
      eq(reg.profile.papersClaimed, { w9: true, gl: false, wc: false, wcExempt: true });
      eq(UPLOADS.slice(u0).map(x => x.name), ['gl-coi.pdf', 'license.jpg']);
      eq(pap.items.map(x => [x.type, x.expirationDate || '', x.licState || '']), [['insurance_general', day(300), ''], ['license', '', 'TN']]);
      yes(/2 paper\(s\) uploaded/.test(await p.textContent('#signupDone')), await p.textContent('#signupDone'));
      await p.close();
    });
    await t(tag + 'sign-up success → "GrayCo reviews new accounts … we\'ll e-mail you" (the bid site\'s register with the profile)', async () => {
      const p = await S.page(''); await toSignup(p); await fillForm(p); await p.check('#su_agree');
      await p.click('#suGo'); await p.waitForSelector('#signupDone', { timeout: 15000 });
      const b = SPREQ.filter(x => x.action === 'register').pop();
      eq([b.email, b.password, b.force, b.invite], ['sam@samplestucco.test', 'sample-pass-1', undefined, undefined]);
      eq(b.profile, { name: 'Sam Newman', company: 'Sample Stucco & Drywall LLC', phone: '901-555-0170', trades: ['Drywall', 'Stucco'], businessCity: 'Memphis', businessState: 'TN', serviceArea: 'Shelby, DeSoto', numEmployees: '6', lang: 'en',
        papersClaimed: { w9: false, gl: false, wc: false, wcExempt: false } });
      const tx = await text(p); yes(/GrayCo reviews new accounts \(usually the same day\)\. We’ll e-mail you when you’re approved\. Then sign in here with your e-mail\./.test(tx), tx.slice(0, 400));
      eq(await p.$eval('#signupDone', x => x.getAttribute('data-approved')), '0');
      await shot(p, '04_signup_thanks', 'Thanks — waiting for GrayCo\'s approval');
      await p.click('#suDoneSignin'); await p.waitForSelector('#signinBox'); eq(await p.inputValue('#siEmail'), 'sam@samplestucco.test');
      await p.close();
    });
    await t(tag + 'possible duplicates are shown (company + why, no contact details) → "That\'s not us — create anyway" resends with force', async () => {
      const p = await S.page(''); await toSignup(p); await fillForm(p, { company: 'Sample Dup Roofing', email: 'dup@sampledup.test' }); await p.check('#su_agree'); const k0 = SPREQ.length;
      await p.click('#suGo'); await p.waitForSelector('[data-su-dup]', { timeout: 15000 });
      yes(/Sample Dup Roofing LLC — matched on company name, phone/.test(await p.textContent('[data-su-dup]')), await p.textContent('[data-su-dup]'));
      await shot(p, '05_signup_duplicate', 'Is your company already with GrayCo? → That\'s not us — create anyway');
      await p.click('#suForce'); await p.waitForSelector('#signupDone', { timeout: 15000 });
      const regs = SPREQ.slice(k0).filter(x => x.action === 'register' && x.email === 'dup@sampledup.test'); eq(regs.map(x => !!x.force), [false, true]);
      await p.close();
    });
    await t(tag + '409 (the e-mail already has an account) → told to sign in; Sign in goes back with the e-mail filled in', async () => {
      const p = await S.page(''); await toSignup(p); await fillForm(p, { email: 'taken@sample.test' }); await p.check('#su_agree');
      await p.click('#suGo'); await p.waitForSelector('[data-su-taken]', { timeout: 15000 });
      yes(/already has an account/.test(await p.textContent('[data-su-taken]')));
      await p.click('#suTakenSignin'); await p.waitForSelector('#signinBox'); eq(await p.inputValue('#siEmail'), 'taken@sample.test');
      await p.close();
    });
    await t(tag + 'an invite link (?invite=…&job=…) opens the sign-up with the e-mail filled in; the invite goes to register (approved at once)', async () => {
      const p = await S.page(''); await p.goto('https://portal.test/?invite=' + INVITE + '&job=j_open'); await p.waitForSelector('#signupBox', { timeout: 15000 });
      await p.waitForFunction(() => !document.getElementById('suInvite').hidden, null, { timeout: 10000 });
      yes(/invited to bid on Sample Clinic Remodel/.test(await p.textContent('#suInvite')));
      eq(await p.inputValue('#su_email'), 'invited@samplestucco.test');
      eq(SPREQ.filter(x => x.action === 'invite-info').pop(), { action: 'invite-info', invite: INVITE, job: 'j_open' });
      await fillForm(p, { email: 'invited@samplestucco.test' }); await p.check('#su_agree'); await p.click('#suGo'); await p.waitForSelector('#signupDone', { timeout: 15000 });
      const b = SPREQ.filter(x => x.action === 'register').pop(); eq([b.invite, b.job], [INVITE, 'j_open']);
      eq(await p.$eval('#signupDone', x => x.getAttribute('data-approved')), '1'); yes(/your account is approved/.test(await text(p)));
      await p.close();
      const q = await S.page(''); await q.goto('https://portal.test/#invite=' + INVITE + '&job=j_open'); await q.waitForSelector('#signupBox', { timeout: 15000 }); await q.close();
    });
    await t(tag + 'Español: the sign-up in Spanish (typed values kept on the language switch)', async () => {
      const p = await S.page(''); await toSignup(p); await p.fill('#su_company', 'Sample Yeso LLC');
      await p.click('#langBtn'); await p.waitForSelector('#signupBox'); await sleep(200);
      const tx = await text(p); yes(/Cree su cuenta de subcontratista/.test(tx) && /Crear mi cuenta/.test(tx), tx.slice(0, 300));
      eq(await p.inputValue('#su_company'), 'Sample Yeso LLC');
      await p.click('#suBack'); await p.waitForSelector('#siSignup'); eq(await p.$eval('#siSignup', b => b.textContent), '¿Subcontratista nuevo? Cree su cuenta');
      await shot(p, '06_signin_es', 'Sign-in screen in Spanish');
      await p.click('#langBtn'); await p.close();
    });
    /* ── 📋 Jobs to bid ── */
    await t(tag + 'Home: the 📋 Jobs to bid card — titles, address, due date / days left, trades, a short scope, 🔗 plan links (new tab), their bid status; never another sub\'s bid', async () => {
      T.sp_rows = T.sp_rows.filter(r => !(r.collection === 'bids' && r.job_id === 'j_new2'));   /* each screen size starts with no bid on it */
      const p = await S.page(SESS.A); await p.goto('https://portal.test/');
      await p.waitForSelector('[data-bidjob="j_new2"]', { timeout: 30000 });
      const card = await p.$eval('section.bids', x => x.innerText);
      yes(/📋 Jobs to bid/.test(card) && /Sample Dental Office Build-Out/.test(card) && /2200 Sample Ave/.test(card) && /4 days left/.test(card) && /Drywall, acoustic ceilings/.test(card) && /3,200 sq ft dental office/.test(card), card.slice(0, 500));
      yes(/✓ Bid sent · \$17,900\.00/.test(card) && /🏆 Awarded/.test(card) && /📨 Invited|✓ Bid sent · \$2,500\.00/.test(card), card);
      yes(/Papers on file: W-9, GL, WC/.test(card));
      yes(!/7777|Other Paint|DRAFT-JOB|PRIVATE-NOT-INVITED|CLOSED-JOB|DELETED-JOB/.test(await text(p)));
      const links = await p.$$eval('[data-bidjob="j_new2"] a[data-planlink]', a => a.map(x => [x.href, x.target, x.rel]));
      eq(links, [['https://drive.google.com/drive/folders/sample-dental', '_blank', 'noopener'], ['https://drive.google.com/file/d/sample-spec/view', '_blank', 'noopener']]);
      await (await p.$('section.bids')).scrollIntoViewIfNeeded();
      await shot(p, '10_home_jobs_to_bid', 'Home: 📋 Jobs to bid card');
      await shot(p, '11_home_full', 'Home (whole page) with 📋 Jobs to bid', true);
      const w = await p.evaluate(() => document.documentElement.scrollWidth); yes(w <= (kind === 'phone' ? 390 : 1366), 'no sideways scroll: ' + w);
      await p.close();
    });
    await t(tag + '❓ Ask a question (patch BIDPOST): the shared answer shows (no names), another bidder\'s private question never; asking saves it to the bid site\'s Q&A', async () => {
      const p = await S.page(SESS.A); await p.goto('https://portal.test/');
      await p.waitForSelector('[data-bidopen="j_open"]', { timeout: 30000 }); await p.click('[data-bidopen="j_open"]');
      await p.waitForSelector('[data-bidqa="j_open"]');
      const tx = await p.$eval('[data-bidqa="j_open"]', x => x.innerText);
      yes(/Is the lobby ceiling in this bid\?/.test(tx) && /Yes — ACT in the lobby only\./.test(tx) && /answer to all bidders/.test(tx) && !/PRIVATE-QUESTION|Otto|Other Paint/.test(tx), tx);
      const n0 = T.sp_rows.filter(r => r.collection === 'questions').length;
      await p.fill('#bidQ', 'Do you need fire caulk at the rated walls?'); await p.click('#bidQSend');
      await sleep(1500);
      const q = T.sp_rows.filter(r => r.collection === 'questions').slice(n0)[0];
      yes(q && q.data.jobId === 'j_open' && q.data.userId === 'u_a1' && /fire caulk/.test(q.data.body) && q.data.visibility === 'private' && !q.data.answer, JSON.stringify(q));
      await p.waitForSelector('[data-bidopen="j_open"]'); await p.click('[data-bidopen="j_open"]'); await p.waitForSelector('[data-bidqa="j_open"]');
      yes(/You asked/.test(await p.$eval('[data-bidqa="j_open"]', x => x.innerText)) && /Waiting for GrayCo/.test(await p.$eval('[data-bidqa="j_open"]', x => x.innerText)));
      await (await p.$('[data-bidqa="j_open"]')).scrollIntoViewIfNeeded();
      await shot(p, '13_bid_question', 'A job: ❓ questions (a shared answer, their own question waiting)');
      T.sp_rows = T.sp_rows.filter(r => r !== q);
      await p.close();
    });
    await t(tag + 'an awarded bid: 🏆 Awarded with the GrayCo PM (name / phone / e-mail), the next step and what to confirm (patch BIDSCOPE)', async () => {
      const p = await S.page(SESS.A); await p.goto('https://portal.test/');
      await p.waitForSelector('[data-bidopen="j_dec"]', { timeout: 30000 }); await p.click('[data-bidopen="j_dec"]');
      await p.waitForSelector('[data-bidaward]');
      const tx = await p.$eval('[data-bidaward]', x => x.innerText);
      yes(/🏆 Awarded/.test(tx) && /Pat Sample PM · \(901\) 555-0142 · pm\.sample@grayco-cs\.com/.test(tx) && /sub agreement \/ scope to sign/.test(tx) && /Please confirm these before we finalize/.test(tx) && /Patching/.test(tx) && /Cleanup — not in your bid/.test(tx), tx);
      await shot(p, '12_awarded_bid_sheet', 'An awarded bid: PM, next step, what to confirm');
      await p.close();
    });
    await t(tag + 'the job sheet: full scope / specs / notes, their trade\'s scope, plan links + plan files, the bid form → Submit sends the bid, then Update', async () => {
      const p = await S.page(SESS.A); await p.goto('https://portal.test/');
      await p.waitForSelector('[data-bidopen="j_new2"]', { timeout: 30000 }); await p.click('[data-bidopen="j_new2"]');
      await p.waitForSelector('[data-bidsheet="j_new2"]');
      const tx = await p.$eval('.sheet', x => x.innerText);
      yes(/Level 5 finish/.test(tx) && /Pre-bid walk Thursday/.test(tx) && /Scope for your trade — Drywall/.test(tx) && /A6\.1 Reflected ceiling plan\.pdf/.test(tx) && /Papers on file/.test(tx), tx.slice(0, 600));
      const files = await p.$$eval('[data-bidplans] a', a => a.map(x => x.href)); yes(files.some(h => /subportal-files\/staff\/2026-11\/dental-A11\.pdf\?token=signed/.test(h)) && files.some(h => /sample-dental/.test(h)), JSON.stringify(files));
      eq(await p.$eval('#bidSend', b => [b.textContent, b.disabled]), ['Submit bid', false]);
      await p.fill('#bidAmt', '24850'); await p.fill('#bidNotes', 'Includes Level 5 at reception and all ACT. Excludes framing and paint.');
      await shot(p, '12_bid_sheet_form', 'The job sheet: scope, specs, notes, plans, Your bid form', false);
      if (kind === 'phone') { await shot(p, '12b_bid_sheet_top', 'The job sheet (top)'); await p.$eval('.sheet-body', x => { x.scrollTop = x.scrollHeight; }); await shot(p, '12c_bid_sheet_form', 'The job sheet: the bid form (scrolled)'); }
      await p.click('#bidSend'); await p.waitForFunction(() => !document.querySelector('.sheet'), null, { timeout: 15000 });
      await p.waitForFunction(() => /Bid sent · \$24,850\.00/.test((document.querySelector('[data-bidjob="j_new2"]') || {}).innerText || ''), null, { timeout: 15000 });
      const rows = bidsOf('j_new2', 'u_a1'); eq(rows.length, 1); eq([rows[0].data.amount, rows[0].data.userCompany], [24850, 'Sample Drywall LLC']);
      await shot(p, '13_home_bid_sent', 'After Submit: ✓ Bid sent on the card');
      await p.click('[data-bidopen="j_new2"]'); await p.waitForSelector('#bidSend');
      eq([await p.$eval('#bidSend', b => b.textContent), await p.inputValue('#bidAmt')], ['Update bid', '24850']);
      await p.fill('#bidAmt', kind === 'phone' ? '24500' : '24400'); await p.click('#bidSend'); await p.waitForFunction(() => !document.querySelector('.sheet'), null, { timeout: 15000 });
      eq(bidsOf('j_new2', 'u_a1').length, 1); eq(bidsOf('j_new2', 'u_a1')[0].data.amount, kind === 'phone' ? 24500 : 24400);
      await p.click('[data-bidopen="j_dec"]'); await p.waitForSelector('[data-bidsheet="j_dec"]'); yes(!(await p.$('#bidSend')) && /can no longer be changed/.test(await p.$eval('.sheet', x => x.innerText)), 'a decided bid has no form');
      await p.close();
    });
    await t(tag + 'papers missing (W-9, GL, WC): the card and the sheet say which, the form is blocked', async () => {
      const p = await S.page(SESS.E); await p.goto('https://portal.test/');
      await p.waitForSelector('[data-bidpapers="missing"]', { timeout: 30000 });
      yes(/W-9 — missing/.test(await p.textContent('[data-bidpapers="missing"]')) && /Workers’ comp \(WC\) — missing/.test(await p.textContent('[data-bidpapers="missing"]')));
      await p.click('[data-bidopen="j_new2"]'); await p.waitForSelector('[data-bidsheet="j_new2"]');
      eq(await p.$eval('#bidSend', b => b.disabled), true); eq(await p.$eval('#bidAmt', b => b.disabled), true);
      yes(/The bid form opens once your papers are on file/.test(await p.$eval('.sheet', x => x.innerText)));
      await p.$eval('.sheet-body', x => { x.scrollTop = x.scrollHeight; });
      await shot(p, '14_bid_sheet_papers_missing', 'Papers missing: the bid form is blocked and says which papers');
      await p.close();
    });
    await t(tag + 'not joined yet: the card offers "Join GrayCo bids" (password ≥ 8) → waiting for approval', async () => {
      const p = await S.page(kind === 'phone' ? SESS.F : SESS.G); await p.goto('https://portal.test/');
      await p.waitForSelector('#bidsAccept', { timeout: 30000 });
      await (await p.$('section.bids')).scrollIntoViewIfNeeded();
      await shot(p, '15_home_join_bids', 'Not joined yet: Join GrayCo bids');
      await p.click('#bidsAccept'); await p.fill('#bidsPw', 'short'); await p.click('#bidsJoinGo'); yes(/at least 8/.test(await p.$eval('.sheet .err', x => x.textContent)));
      await p.fill('#bidsPw', 'sample-pass-9'); await p.click('#bidsJoinGo'); await p.waitForFunction(() => /Waiting for GrayCo approval/.test((document.querySelector('section.bids') || {}).innerText || ''), null, { timeout: 15000 });
      yes(T.sp_rows.some(x => x.collection === 'users' && x.data.crmSubId === (kind === 'phone' ? 'SF' : 'SG') && x.data.approved === false), 'a profile waiting for approval');
      await p.close();
    });
    await t(tag + 'no page errors, no 401 / 5xx / missing file', async () => { eq(S.errs, []); eq(S.bad, []); });
    await S.b.close();
  }
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'index.txt'), SHOTLIST.join('\n') + '\n');
}
console.log('\nSUBBIDS: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
