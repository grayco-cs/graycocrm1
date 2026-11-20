// test_BIDSITE3_fn.mjs <build-dir> — patch BIDSITE3 (owner 11/20) on the REAL subportal.js / bid-hub.js / bid-alerts helpers (qaa_world's
// in-memory Supabase; made-up data only; offline; e-mail captured at the Resend call, nothing leaves the machine).
//   A  sign-up approval: invited (link or e-mail) → approved; self sign-up waits; supplier → approved at once; public jobs / invited private jobs
//   B  Invite → the e-mail at once ("GrayCo invited you to bid: <project>", sign-up / sign-in link, ?as=supplier), in data-entry mode too
//   C  the switches (invite / accepted / wonNotUsed ON, lost / addendum / dueReminder OFF); accepted, won-not-used, lost (only when on), addendum,
//      the CRM's 🏆 Award follows the "accepted" switch
//   D  a supplier quote keeps its files and a spec per line
//   E  never GrayCo pricing on a sub's job; supplier materials (no price, no supplier) once WON or with the per-job toggle
//   F  "Request more materials" → the PM's card (bid-hub ?matreqs) → approve = a line on the job's supplier PO draft; decline + note → the sub sees it
import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = await import('./qaa_world.mjs');
const { DB, TOK, ACC, putRow, rowData, rowsOf } = W;
const BUILD = path.resolve(process.argv[2] || '.');
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
W.install();
/* e-mail on (a test key), captured where it would reach Resend */
const MAIL = []; const f0 = globalThis.fetch;
globalThis.fetch = async (url, init) => { if (String(url).indexOf('api.resend.com') > -1) { MAIL.push(JSON.parse(init.body)); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ id: 'm' + MAIL.length }), text: async () => '{}' }; } return f0(url, init); };
process.env.RESEND_API_KEY = 'test-mail-key'; delete process.env.PORTAL_MAIL_OFF; process.env.CUST_QUIET_OFF = '1';
const F = W.fns(BUILD);
const FN = path.join(BUILD, 'netlify/functions');
const now = new Date().toISOString(), DAY = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
W.H.resetCloud(); W.H.cset('leads', []); W.H.cset('schedule', []); W.H.cset('gc_automation_pause', { on: false });
W.H.cset('users', [{ id: 'c1', name: 'Demo Owner', email: 'owner@grayco-cs.com', role: 'Admin' }, { id: 'c2', name: 'Pat Pm', email: 'pm@grayco-cs.com', role: 'Project Manager' }]);
W.H.cset('projects', [{ id: 'P1', name: 'Demo Clinic Remodel', address: '1 Demo Rd', autoPO: 'Q601', status: 'active' }]);
W.H.cset('gc_supplier_pos', []);
DB.gc_staff.push({ email: 'owner@grayco-cs.com', name: 'Demo Owner', role: 'admin', active: true }, { email: 'pm@grayco-cs.com', name: 'Pat Pm', role: 'staff', active: true }, { email: 'est@grayco-cs.com', name: 'Other Staff', role: 'staff', active: true });
const staffRow = (id, email, name) => putRow('users', id, { id, email, name, phone: '901-555-0100', role: 'admin', approved: true, company: 'GrayCo Construction Services' }, { user_id: id, email });
staffRow('st_owner', 'owner@grayco-cs.com', 'Demo Owner'); staffRow('st_pm', 'pm@grayco-cs.com', 'Pat Pm');
const sub = (id, email, company, x) => putRow('users', id, Object.assign({ id, role: 'sub', approved: true, email, name: company + ' Contact', company, trades: ['Drywall'], authUserId: 'auth-' + id }, x || {}), { user_id: id, email });
sub('u_a', 'a@sub.test', 'Alpha Drywall'); sub('u_b', 'b@sub.test', 'Beta Drywall', { lang: 'es' }); sub('u_sup', 'q@supply.test', 'Demo Supply', { role: 'supplier', crmVendorId: 'V1' });
const job = (id, x) => putRow('jobs', id, Object.assign({ id, status: 'open', visibility: 'public', draft: false, bidDueDate: DAY(20), pmId: 'st_pm', estimatorId: 'st_owner', grayCoRole: 'gc', tradesSought: 'Drywall', createdAt: now }, x), { job_id: id });
job('J_PUB', { title: 'Demo Clinic Remodel', crmProjectId: 'P1', poNumber: 'Q601', suppliersCanQuote: true, materialList: '200 sheets 5/8 Type X @ $14.50 ea\n40 boxes screws', budget: 250000, estValue: 199000, ourBid: 210000 });
job('J_PRIV', { title: 'Private Office Fit-out', visibility: 'private' });
job('J_PRIV2', { title: 'Another Private Job', visibility: 'private' });
job('J_WON', { title: 'Won School Job', suppliersCanQuote: true });
job('J_LOST', { title: 'Lost Church Job' });
job('J_LOST2', { title: 'Second Lost Job' });
putRow('bids', 'b_a', { id: 'b_a', jobId: 'J_WON', userId: 'u_a', userEmail: 'a@sub.test', userCompany: 'Alpha Drywall', amount: 50000 }, { job_id: 'J_WON', user_id: 'u_a' });
putRow('bids', 'b_b', { id: 'b_b', jobId: 'J_WON', userId: 'u_b', userEmail: 'b@sub.test', userCompany: 'Beta Drywall', amount: 52000 }, { job_id: 'J_WON', user_id: 'u_b' });
putRow('bids', 'b_l', { id: 'b_l', jobId: 'J_LOST', userId: 'u_a', userEmail: 'a@sub.test', userCompany: 'Alpha Drywall', amount: 9000 }, { job_id: 'J_LOST', user_id: 'u_a' });
putRow('bids', 'b_l2', { id: 'b_l2', jobId: 'J_LOST2', userId: 'u_a', userEmail: 'a@sub.test', userCompany: 'Alpha Drywall', amount: 9100 }, { job_id: 'J_LOST2', user_id: 'u_a' });
putRow('bids', 'b_p', { id: 'b_p', jobId: 'J_PUB', userId: 'u_a', userEmail: 'a@sub.test', userCompany: 'Alpha Drywall', amount: 61000 }, { job_id: 'J_PUB', user_id: 'u_a' });
putRow('mquotes', 'mq_w', { id: 'mq_w', jobId: 'J_WON', userId: 'u_sup', userEmail: 'q@supply.test', userCompany: 'Demo Supply', status: 'accepted', lines: [{ id: 'l1', desc: 'Type X board 5/8', spec: 'ASTM C1396', qty: 200, unit: 'sht', unitPrice: 14.5, total: 2900 }], total: 2900, leadTime: '1 week' }, { job_id: 'J_WON', user_id: 'u_sup' });
TOK['tk-owner'] = 'owner@grayco-cs.com'; TOK['tk-pm'] = 'pm@grayco-cs.com'; TOK['tk-a'] = 'a@sub.test'; TOK['tk-b'] = 'b@sub.test'; TOK['tk-sup'] = 'q@supply.test';
['a@sub.test', 'b@sub.test', 'q@supply.test'].forEach((e, i) => { ACC[e] = { pw: 'x', id: 'auth-' + ['u_a', 'u_b', 'u_sup'][i] }; });
ACC['owner@grayco-cs.com'] = { pw: 'x', id: 'auth-owner' }; ACC['pm@grayco-cs.com'] = { pw: 'x', id: 'auth-pm' };
const call = async (tok, body) => { const r = await F.sp.handler({ httpMethod: 'POST', headers: { origin: 'https://bids.test', authorization: tok ? 'Bearer ' + tok : '', 'x-nf-client-connection-ip': '10.8.' + Math.floor(Math.random() * 200) + '.1' }, body: JSON.stringify(body) }); return { code: r.statusCode, b: JSON.parse(r.body) }; };
const BI = require(path.join(FN, 'bid-inbox.js'));
const hub = async (who, method, q, body) => { const ra = BI._test.staffAuth; BI._test.staffAuth = async () => Object.assign({ ok: true }, who);
  try { const o = await F.hub.handler({ httpMethod: method, headers: {}, queryStringParameters: q || {}, body: body ? JSON.stringify(body) : '' }); return { code: o.statusCode, j: JSON.parse(o.body) }; } finally { BI._test.staffAuth = ra; } };
const OWNER = { email: 'owner@grayco-cs.com', name: 'Demo Owner', admin: true, role: 'admin' }, PM = { email: 'pm@grayco-cs.com', name: 'Pat Pm', admin: false, role: 'staff' }, OTHER = { email: 'est@grayco-cs.com', name: 'Other Staff', admin: false, role: 'staff' };
const mailTo = e => MAIL.filter(m => (m.to || []).includes(e));
const settle = () => new Promise(r => setTimeout(r, 30));

/* ═══ C. the switches ═══ */
let r = await call('tk-owner', { action: 'bidmail-cfg', op: 'get' });
const sw0 = r.b.switches || {};
ok('C1 the switches: invite / accepted / won-not-used ON; we-lost, addendum, bid-due reminder OFF; one row each in the panel', r.code === 200 && sw0.invite === true && sw0.accepted === true && sw0.wonNotUsed === true && sw0.lost === false && sw0.addendum === false && sw0.dueReminder === false && (r.b.list || []).length === 6, r.b);
r = await call('tk-a', { action: 'bidmail-cfg', op: 'get' });
ok('C2 a sub cannot read / change them (403)', r.code === 403, r);

/* ═══ B. Invite → the e-mail at once ═══ */
r = await call('tk-owner', { action: 'invite-send', jobId: 'J_PRIV', emails: ['new@sub.test'], as: 'sub' });
const inv1 = (r.b.invites || [])[0] || {}, m1 = mailTo('new@sub.test')[0] || {};
ok('B1 Invite (a new sub): one invite row and the e-mail at once — "GrayCo invited you to bid: Private Office Fit-out", the sign-up link with the token', r.code === 200 && r.b.mailed === 1 && rowData('invites/' + inv1.id) && m1.subject === 'GrayCo invited you to bid: Private Office Fit-out' && m1.html.indexOf('?invite=' + inv1.token + '&amp;job=J_PRIV') > -1 && !!rowData('invites/' + inv1.id).mailedAt, { r: r.b, s: m1.subject });
W.H.cset('gc_automation_pause', { on: true, why: 'test' });
r = await call('tk-owner', { action: 'invite-send', jobId: 'J_PRIV', emails: ['sup2@supply.test'], as: 'supplier' });
const m2 = mailTo('sup2@supply.test')[0] || {};
ok('B2 data-entry mode ON: the invite e-mail still goes (not a customer send); a supplier invite opens the supplier sign-up (&as=supplier)', r.b.mailed === 1 && /&amp;as=supplier/.test(m2.html || '') && /quote the materials/.test(m2.html || ''), { r: r.b, html: (m2.html || '').slice(0, 300) });
r = await call('tk-owner', { action: 'invite-send', jobId: 'J_PUB', emails: ['b@sub.test'] });
const m3 = mailTo('b@sub.test').slice(-1)[0] || {};
ok('B3 an account already: a sign-in link (no token), in their language (Spanish)', r.b.mailed === 1 && /^GrayCo le invitó a ofertar: Demo Clinic Remodel/.test(m3.subject || '') && !/invite=/.test(m3.html || ''), m3.subject);
W.H.cset('gc_automation_pause', { on: false });
await call('tk-owner', { action: 'bidmail-cfg', op: 'set', switches: Object.assign({}, sw0, { invite: false }) });
const n0 = MAIL.length;
r = await call('tk-owner', { action: 'invite-send', jobId: 'J_PRIV', emails: ['quiet@sub.test'] });
ok('B4 Invite e-mail switched OFF: the invite is made, no e-mail (mailOff)', r.b.mailed === 0 && r.b.mailOff === true && MAIL.length === n0 && rowsOf('invites').some(x => x.email === 'quiet@sub.test'), r.b);
await call('tk-owner', { action: 'bidmail-cfg', op: 'set', switches: sw0 });
r = await call('tk-a', { action: 'invite-send', jobId: 'J_PRIV', emails: ['x@y.test'] });
ok('B5 a sub cannot send invites (403)', r.code === 403);

/* ═══ A. sign-up approval ═══ */
r = await call('', { action: 'register', email: 'new@sub.test', password: 'Sub-Pass-111', profile: { name: 'Nina New', company: 'Newco Drywall', acctType: 'sub', trades: ['Drywall'] } });
const nu = (rowsOf('users').find(x => x.email === 'new@sub.test') || {}).data || {};
ok('A1 a sub we invited signs up WITHOUT the link (same e-mail) → approved at once, linked to that job, still a ✅ Approvals check card (vetPending)', r.code === 200 && r.b.approved === true && nu.approved === true && nu.invitedJobId === 'J_PRIV' && nu.vetPending === true && nu.approvedAuto === 'invited', { r: r.b, nu });
TOK['tk-new'] = 'new@sub.test'; ACC['new@sub.test'].id = nu.authUserId;
r = await call('tk-new', { action: 'load', keys: ['jobs'] });
const nj = (r.b.data && r.b.data.jobs || []).map(j => j.id).sort();
ok('A2 they see the PUBLIC jobs + the private job they were invited to (not another private one)', nj.includes('J_PRIV') && nj.includes('J_PUB') && !nj.includes('J_PRIV2'), nj);
r = await call('', { action: 'register', email: 'self@sub.test', password: 'Sub-Pass-222', profile: { name: 'Sam Self', company: 'Selfco Paint', acctType: 'sub' } });
const su = (rowsOf('users').find(x => x.email === 'self@sub.test') || {}).data || {};
TOK['tk-self'] = 'self@sub.test'; ACC['self@sub.test'].id = su.authUserId;
const sj = await call('tk-self', { action: 'load', keys: ['jobs'] });
ok('A3 a sub who signs up on their own still waits for an admin (approved false, no jobs)', r.b.approved === false && su.approved === false && sj.b.data.jobs.length === 0, { r: r.b, n: sj.b.data.jobs.length });
r = await call('', { action: 'register', email: 'own@supply.test', password: 'Sup-Pass-333', profile: { name: 'Sue Supply', company: 'Own Supply Co', acctType: 'supplier' } });
const sp = (rowsOf('users').find(x => x.email === 'own@supply.test') || {}).data || {};
ok('A4 a SUPPLIER sign-up is approved at once (role supplier, no check card)', r.b.approved === true && sp.role === 'supplier' && sp.approved === true && sp.approvedAuto === 'supplier' && !sp.vetPending, sp);
TOK['tk-own'] = 'own@supply.test'; ACC['own@supply.test'].id = sp.authUserId;
r = await call('tk-own', { action: 'load', keys: ['jobs'] });
ok('A5 the new supplier sees the public jobs open for material quotes (not the private ones)', r.b.data.jobs.map(j => j.id).sort().join() === 'J_PUB,J_WON', r.b.data.jobs.map(j => j.id));

/* ═══ E. never GrayCo pricing; supplier materials ═══ */
r = await call('tk-a', { action: 'load', keys: ['jobs'] });
const pj = r.b.data.jobs.find(j => j.id === 'J_PUB') || {}, wj = r.b.data.jobs.find(j => j.id === 'J_WON') || {};
ok('E1 a sub\'s job: no GrayCo budget / estimate value / our bid; the material list without the $ price', !('budget' in pj) && !('estValue' in pj) && !('ourBid' in pj) && /200 sheets 5\/8 Type X/.test(pj.materialList || '') && !/\$|14\.50/.test(pj.materialList || '') && JSON.stringify(r.b).indexOf('250000') < 0 && JSON.stringify(r.b).indexOf('210000') < 0, pj);
ok('E2 open job, toggle off: no supplier materials', !pj.supplierMaterials, pj.supplierMaterials);
await call('tk-owner', { action: 'save', key: 'jobs', upsert: [Object.assign({}, rowData('jobs/J_WON'), { status: 'won' })] });
await settle();
r = await call('tk-a', { action: 'load', keys: ['jobs'] });
const wj2 = r.b.data.jobs.find(j => j.id === 'J_WON') || {}, ln = ((wj2.supplierMaterials || [])[0] || {}).lines || [];
ok('E3 once WON: the sub (a bidder) sees the accepted quote\'s materials — item, spec, qty, unit — no price, no total, no supplier name', ln.length === 1 && ln[0].desc === 'Type X board 5/8' && ln[0].spec === 'ASTM C1396' && ln[0].qty === 200 && !('unitPrice' in ln[0]) && JSON.stringify(wj2).indexOf('Demo Supply') < 0 && JSON.stringify(wj2).indexOf('2900') < 0, wj2.supplierMaterials);
putRow('mquotes', 'mq_p', { id: 'mq_p', jobId: 'J_PUB', userId: 'u_sup', userEmail: 'q@supply.test', userCompany: 'Demo Supply', status: 'submitted', lines: [{ id: 'l1', desc: 'Screws 1-5/8', qty: 40, unit: 'box', unitPrice: 30, total: 1200 }], total: 1200 }, { job_id: 'J_PUB', user_id: 'u_sup' });
await call('tk-owner', { action: 'save', key: 'jobs', upsert: [Object.assign({}, rowData('jobs/J_PUB'), { showSupplierMaterials: true })] });
r = await call('tk-a', { action: 'load', keys: ['jobs'] });
const pj2 = r.b.data.jobs.find(j => j.id === 'J_PUB') || {};
ok('E4 the admin\'s per-job toggle "Show supplier materials to subs while bidding" → shown while bidding (no price)', rowData('jobs/J_PUB').showSupplierMaterials === true && ((pj2.supplierMaterials || [])[0] || { lines: [] }).lines.some(l => l.desc === 'Screws 1-5/8') && JSON.stringify(pj2.supplierMaterials).indexOf('1200') < 0, pj2.supplierMaterials);

/* ═══ C. result e-mails ═══ */
const won = MAIL.filter(m => /^We won Won School Job|^GrayCo ganó Won School Job/.test(m.subject));
ok('C3 marked WON → "we won, did not use your bid" to the bidders NOT accepted (both subs here), never the supplier whose quote was accepted', won.length === 2 && won.some(m => m.to.includes('a@sub.test')) && won.some(m => m.to.includes('b@sub.test') && /^GrayCo ganó/.test(m.subject)) && !won.some(m => m.to.includes('q@supply.test')) && !!(rowData('jobs/J_WON').resultMailed || {}).won, won.map(m => [m.to, m.subject]));
ok('C4 …no price and no other bidder named in it', won.every(m => !/\$|50,000|52,000|Alpha|Beta/.test(m.html)));
await call('tk-owner', { action: 'save', key: 'jobs', upsert: [Object.assign({}, rowData('jobs/J_WON'), { status: 'open' })] });
await call('tk-owner', { action: 'save', key: 'jobs', upsert: [Object.assign({}, rowData('jobs/J_WON'), { status: 'won' })] });
ok('C5 reopened and marked WON again: not sent twice', MAIL.filter(m => /^We won Won School Job|^GrayCo ganó Won School Job/.test(m.subject)).length === 2);
await call('tk-owner', { action: 'save', key: 'jobs', upsert: [Object.assign({}, rowData('jobs/J_LOST'), { status: 'lost' })] });
ok('C6 marked LOST with "we did not win" OFF (the default): nothing is sent', !MAIL.some(m => /Lost Church Job/.test(m.subject)));
await call('tk-owner', { action: 'bidmail-cfg', op: 'set', switches: Object.assign({}, sw0, { lost: true }) });
await call('tk-owner', { action: 'save', key: 'jobs', upsert: [Object.assign({}, rowData('jobs/J_LOST2'), { status: 'lost' })] });
ok('C7 switched ON → marked LOST sends "we did not win the project"', MAIL.filter(m => /^Bid update: Second Lost Job — we did not win the project/.test(m.subject)).length === 1);
await call('tk-owner', { action: 'bidmail-cfg', op: 'set', switches: sw0 });
await call('tk-owner', { action: 'save', key: 'bids', upsert: [Object.assign({}, rowData('bids/b_p'), { accepted: true })] });
const acc = mailTo('a@sub.test').filter(m => /^Your bid was accepted — Demo Clinic Remodel/.test(m.subject));
ok('C8 an admin accepts a sub\'s bid on the bid site → "Your bid was accepted" once (stamped)', acc.length === 1 && !!rowData('bids/b_p').awardMailedAt, mailTo('a@sub.test').map(m => m.subject));
await call('tk-owner', { action: 'save', key: 'bids', upsert: [Object.assign({}, rowData('bids/b_p'), { notes: 'x', awardMailedAt: undefined })] });
ok('C9 saved again: no second e-mail (the stamp is kept)', mailTo('a@sub.test').filter(m => /^Your bid was accepted/.test(m.subject)).length === 1 && !!rowData('bids/b_p').awardMailedAt);
await call('tk-owner', { action: 'save', key: 'mquotes', upsert: [Object.assign({}, rowData('mquotes/mq_p'), { status: 'accepted' })] });
ok('C10 a supplier\'s quote accepted → "Your quote was accepted"', mailTo('q@supply.test').some(m => /^Your quote was accepted — Demo Clinic Remodel/.test(m.subject)));
await call('tk-owner', { action: 'bidmail-cfg', op: 'set', switches: Object.assign({}, sw0, { accepted: false }) });
r = await hub(OWNER, 'POST', null, { op: 'award', jobId: 'J_WON', source: 'portal', id: 'b_b', on: true });
ok('C11 the CRM\'s 🏆 Award follows the switch: "accepted" OFF → no award e-mail (skipped, says why)', r.code === 200 && r.j.mail && r.j.mail.sent === false && /switched off/.test(r.j.mail.skipped || ''), r.j);
await call('tk-owner', { action: 'bidmail-cfg', op: 'set', switches: Object.assign({}, sw0, { addendum: true }) });
await call('tk-owner', { action: 'save', key: 'jobs', upsert: [Object.assign({}, rowData('jobs/J_PUB'), { addenda: [{ num: 1, title: 'Revised RCP', publishedAt: now }] })] });
ok('C12 addendum switch ON: publishing addendum #1 e-mails the invited + bidders ("Addendum #1 posted")', MAIL.filter(m => /^Addendum #1 posted: Demo Clinic Remodel/.test(m.subject)).length >= 2, MAIL.filter(m => /Addendum/.test(m.subject)).map(m => m.to));
await call('tk-owner', { action: 'bidmail-cfg', op: 'set', switches: sw0 });

/* ═══ D. supplier quote: files + spec ═══ */
r = await call('tk-sup', { action: 'save', key: 'mquotes', upsert: [{ id: 'mq_d2', jobId: 'J_PUB', lines: [{ id: 'l1', desc: 'Corner bead', spec: 'Vinyl 10 ft', qty: 100, unit: 'ea', unitPrice: 2 }], docs: [{ id: 'd1', name: 'Quote 4471.pdf', fileRef: 'u/u_sup/abc-quote.pdf' }] }] });
const qd2 = rowData('mquotes/mq_d2');
ok('D2 on an open job: saved with the file and the spec', r.code === 200 && qd2 && qd2.docs.length === 1 && qd2.docs[0].fileRef === 'u/u_sup/abc-quote.pdf' && qd2.lines[0].spec === 'Vinyl 10 ft', { r, qd2 });
r = await call('tk-sup', { action: 'save', key: 'mquotes', upsert: [{ id: 'mq_d3', jobId: 'J_PUB', lines: [{ desc: 'x', qty: 1, unitPrice: 1 }], docs: [{ id: 'd2', name: 'not mine.pdf', fileRef: 'u/u_a/x.pdf' }] }] });
ok('D3 …someone else\'s file is refused (403)', r.code === 403, r);

/* ═══ F. Request more materials ═══ */
r = await call('tk-a', { action: 'matreq', op: 'add', jobId: 'J_PUB', item: '5/8 Type X board', qty: 30, unit: 'sht', reason: 'Added soffit at the corridor per RFI 4' });
const mr = r.b.request || {};
ok('F1 a sub asks for more materials on a job they bid → pending', r.code === 200 && mr.status === 'pending' && rowData('matreqs/' + mr.id) && rowData('matreqs/' + mr.id).userCompany === 'Alpha Drywall', r.b);
r = await call('tk-a', { action: 'matreq', op: 'add', jobId: 'J_PUB', item: 'x', qty: 0, reason: 'y' });
ok('F2 no quantity → refused (400)', r.code === 400);
r = await call('tk-sup', { action: 'matreq', op: 'add', jobId: 'J_PUB', item: 'x', qty: 1, reason: 'y' });
ok('F3 a supplier cannot (subs only, 403)', r.code === 403);
r = await call('tk-a', { action: 'matreq', op: 'add', jobId: 'J_PRIV', item: 'x', qty: 1, reason: 'y' });
ok('F4 a job they may not see → refused (403)', r.code === 403);
r = await hub(PM, 'GET', { matreqs: '1' });
ok('F5 the job\'s PM sees the card (bid-hub ?matreqs): sub, item, qty, why, the job', r.code === 200 && r.j.requests.length === 1 && r.j.requests[0].id === mr.id && r.j.requests[0].jobTitle === 'Demo Clinic Remodel' && r.j.requests[0].pmEmail === 'pm@grayco-cs.com', r.j);
r = await hub(OTHER, 'GET', { matreqs: '1' });
ok('F6 another staff member (not the PM, not an admin) does not', r.code === 200 && r.j.requests.length === 0, r.j);
r = await hub(OTHER, 'POST', null, { op: 'matreq', id: mr.id, act: 'approve' });
ok('F7 …and cannot decide it (403)', r.code === 403, r.j);
r = await hub(PM, 'POST', null, { op: 'matreq', id: mr.id, act: 'approve' });
const pos = W.H.cloud.get('gc_supplier_pos'); let pl = pos && pos.value; if (typeof pl === 'string') pl = JSON.parse(pl);
const po = (pl || []).find(x => x.pid === 'P1') || {};
ok('F8 the PM approves → a line on the job\'s DRAFT supplier PO (gc_supplier_pos: the CRM job, never sent by itself, the accepted supplier when there is one)', r.code === 200 && r.j.request.status === 'approved' && po.status === 'draft' && po.items.some(i => i.matreqId === mr.id && i.qty === 30 && i.desc === '5/8 Type X board') && /^Q601-M1$/.test(po.poNo), { j: r.j, po });
r = await hub(PM, 'POST', null, { op: 'matreq', id: mr.id, act: 'approve' });
const pl2 = JSON.parse(JSON.stringify(W.H.cloud.get('gc_supplier_pos').value)); const pl2a = typeof pl2 === 'string' ? JSON.parse(pl2) : pl2;
ok('F9 a second tap: already decided, no second line', r.j.already === 'approved' && pl2a.reduce((n, x) => n + x.items.filter(i => i.matreqId === mr.id).length, 0) === 1);
r = await call('tk-a', { action: 'matreq', op: 'add', jobId: 'J_PUB', item: 'Metal studs 3-5/8', qty: 50, reason: 'More framing' });
const mr2 = r.b.request;
r = await hub(OWNER, 'POST', null, { op: 'matreq', id: mr2.id, act: 'decline' });
ok('F10 decline needs a note for the sub (400)', r.code === 400);
r = await hub(OWNER, 'POST', null, { op: 'matreq', id: mr2.id, act: 'decline', note: 'Use the studs already on site (Bay 2).' });
r = await call('tk-a', { action: 'matreq', op: 'list' });
const lst = r.b.requests || [];
ok('F11 the sub sees both answers: approved, and declined with the PM\'s note', lst.find(x => x.id === mr.id).status === 'approved' && lst.find(x => x.id === mr2.id).status === 'declined' && /Bay 2/.test(lst.find(x => x.id === mr2.id).answer), lst);
ok('F12 no customer contact: no e-mail went outside GrayCo for the material requests', !MAIL.some(m => /material request|5\/8 Type X board|Metal studs/i.test(m.subject + ' ' + m.html) && (m.to || []).some(e => !/@grayco-cs\.com$/.test(e))));
r = await call('tk-b', { action: 'matreq', op: 'list' });
ok('F13 another sub never sees someone else\'s requests', r.b.requests.length === 0);

/* ═══ the code ═══ */
const fs = require('fs');
const P = fs.readFileSync(path.join(FN, '_lib/pause.js'), 'utf8');
ok('X1 data-entry mode: only an e-mail tagged "trade" passes (never a text)', /c && c\.mail && safetyTag\(\) === 'trade'/.test(P) && !/c\.twilio && safetyTag\(\) === 'trade'/.test(P));
const fails = R.filter(x => !x).length;
console.log(fails ? 'FAILED ' + fails + ' of ' + R.length : 'ALL ' + R.length + ' PASS');
process.exit(fails ? 1 : 0);
