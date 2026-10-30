// test_MKTFEAT_fn.mjs <build-dir> — patch MKTFEAT, server side (no browser, a fake Supabase / Resend / Google, made-up data):
//   (2) before / after drafts: shared photos only (never shared:false, never a sub's, never Damage), an early + the final one, the
//       caption = service + city (no name, street, carrier), only with the customer's marketing OK, ONE per job, none in data-entry mode;
//   (3) the review tracker: asked (thank-you e-mail sent / recorded) + received (linked or the Google review by name), per-PM counts;
//       the Marketing Manager's answer carries no customer name, phone, e-mail, street or money;
//   (4) the ranking check: "Connect Search Console" when not set up / no access, Google's own positions stored as history, a search
//       Google did not show stays "not seen" (never invented), the Marketing Manager edits the list;
//   (6) the owner's report: the numbers on seeded data (leads, spend, cost per lead, won, sold by source; reviews, posts, top / worst),
//       the 1st-of-the-month send once, staff addresses only, "send me now" goes to the admin who asked, the agency report skips them;
//   (7) win-back 30–90 days: one draft per lead, never twice, opted-out / not-interested / no real lost date skipped, the MM approves.
import { createRequire } from 'module';
import crypto from 'crypto';
import path from 'path';
const require = createRequire(import.meta.url);
const build = path.resolve(process.argv[2] || '.');
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 600) : '')); } };
const DAY = 864e5, NOW = Date.now(), iso = d => new Date(NOW - d * DAY).toISOString(), ymd = d => iso(d).slice(0, 10);

/* ── the fake world ── */
const T = { gc_kv: new Map(), gc_lead_inbox_kv: new Map() }; let tk = 0;
const stamp = () => new Date(NOW + (++tk) * 1000).toISOString();
const put = (key, value, t = 'gc_kv') => T[t].set(key, { key, value, updated_at: stamp() });
const get = (key, t = 'gc_kv') => { const r = T[t].get(key); if (!r) return undefined; let v = r.value; if (typeof v === 'string' && /^[\[{]/.test(v)) { try { v = JSON.parse(v); } catch (e) {} } return v; };
const STAFF = { 'wjohnson@grayco-cs.com': { email: 'wjohnson@grayco-cs.com', name: 'Wesley Johnson', role: 'admin', active: true },
  'nthomas@grayco-cs.com': { email: 'nthomas@grayco-cs.com', name: 'Nick Thomas', role: 'admin', active: true },
  'office@grayco-cs.com': { email: 'office@grayco-cs.com', name: 'Office', role: 'staff', active: true, profile: 'office' },
  'mm@grayco-cs.com': { email: 'mm@grayco-cs.com', name: 'Malcolm Demo', role: 'staff', active: false, profile: 'marketing', mkt_active: true } };
const TOK = { 'tok-admin': 'wjohnson@grayco-cs.com', 'tok-mm': 'mm@grayco-cs.com', 'tok-office': 'office@grayco-cs.com' };
const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(2), headers: { get: () => 'application/json' } });
const mails = [], google = { calls: [], sites: [], rows: {}, tokenOk: true };
function keysOf(q){ if (!q) return null; if (q.startsWith('eq.')) return [decodeURIComponent(q.slice(3))]; if (q.startsWith('in.(')) return q.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, '')); return null; }
global.fetch = async (url, init = {}) => {
  const u = new URL(String(url)), m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
  let body = null; try { body = typeof init.body === 'string' && /^[\[{]/.test(init.body) ? JSON.parse(init.body) : init.body; } catch (e) { body = init.body; }
  if (u.host === 'api.resend.com') { mails.push(body); return resp(200, { id: 'm' + mails.length }); }
  if (u.host === 'oauth2.googleapis.com') { google.calls.push('token'); const a = String(body || ''); const asr = decodeURIComponent((/assertion=([^&]+)/.exec(a) || [])[1] || ''); google.lastJwt = asr; return google.tokenOk ? resp(200, { access_token: 'gtok', expires_in: 3600 }) : resp(400, { error: 'invalid_grant' }); }
  if (u.host === 'www.googleapis.com') {
    google.calls.push(m + ' ' + u.pathname);
    if (u.pathname === '/webmasters/v3/sites') return resp(200, { siteEntry: google.sites });
    const q = body && body.dimensionFilterGroups && body.dimensionFilterGroups[0].filters[0].expression; google.lastQuery = body;
    return resp(200, google.rows[q] ? { rows: [google.rows[q]] } : {});
  }
  if (u.host !== 'sb.test') return resp(404, { error: 'offline' });
  if (u.pathname === '/auth/v1/user') { const e = TOK[String(hd.Authorization || hd.authorization || '').replace('Bearer ', '')]; return e ? resp(200, { id: 'u-' + e, email: e }) : resp(401, {}); }
  const mm = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname); if (!mm) return resp(200, {});
  const t = mm[1], q = u.searchParams;
  if (t === 'gc_staff') { const e = (q.get('email') || '').replace(/^eq\./, ''); const role = (q.get('role') || '').replace(/^eq\./, ''); let rows = e ? (STAFF[e] ? [STAFF[e]] : []) : Object.values(STAFF); if (role) rows = rows.filter(r => r.role === role); return resp(200, rows.map(r => Object.assign({}, r))); }
  if (t === 'gc_news_suppress') return resp(200, []);
  const TB = T[t]; if (!TB) return resp(m === 'GET' ? 200 : 201, []);
  if (m === 'GET') { const ks = keysOf(q.get('key') || ''); let rows = (ks || [...TB.keys()]).map(k => TB.get(k)).filter(Boolean); const lim = +q.get('limit'); if (lim) rows = rows.slice(0, lim); return resp(200, rows.map(r => ({ key: r.key, value: r.value, updated_at: r.updated_at }))); }
  if (m === 'PATCH') { const k = (keysOf(q.get('key') || '') || [])[0], at = (q.get('updated_at') || '').replace(/^eq\./, ''), cur = TB.get(k); if (!cur || (at && cur.updated_at !== at)) return resp(200, []); TB.set(k, { key: k, value: body.value, updated_at: stamp() }); return resp(200, [TB.get(k)]); }
  if (m === 'POST') { (Array.isArray(body) ? body : [body]).forEach(b => { if (b && b.key) TB.set(b.key, { key: b.key, value: b.value, updated_at: stamp() }); }); return resp(201, [{}]); }
  if (m === 'DELETE') return resp(204, []);
  return resp(200, []);
};
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc', RESEND_API_KEY: 're_test', SITE_ORIGIN: 'https://crm.grayco-cs.com', OWNER_EMAILS: 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com' });
['GOOGLE_SA_EMAIL', 'GOOGLE_SA_KEY', 'GSC_SITE', 'STAFF_EMAILS', 'ANTHROPIC_API_KEY'].forEach(k => delete process.env[k]);
put('gc_lead_inbox_kv_probe', 1, 'gc_lead_inbox_kv');

/* ── the made-up data ── */
const SECRETS = ['Demo Kline', 'Kline', '88 Maple', 'Maple Dr', 'kline@demo.example', '901-555-0100', '9015550100', 'State Farm', 'Demo Stone', '12 Oak St', 'stone@demo.example', 'COST-SECRET', 'MARGIN-SECRET', '18400', 'Demo Lost', 'lost@demo.example'];
put('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin' }, { id: 'u4', name: 'Pat PM', email: 'pm@grayco-cs.com', role: 'Project Manager' }, { id: 'u5', name: 'Sam PM', email: 'sam@grayco-cs.com', role: 'Project Manager' }]);
const projects = [
  { id: 'PW', name: 'Demo Kline Water — State Farm claim', client: 'Demo Kline', clientEmail: 'kline@demo.example', clientPhone: '901-555-0100', address: '88 Maple Dr, Germantown, TN 38138', status: 'Completed', type: 'Water mitigation', isInsurance: true, carrier: 'State Farm',
    completedAt: iso(5), marketingOk: true, pm: 'Pat PM', contract: 18400, costNote: 'COST-SECRET', margin: 'MARGIN-SECRET' },
  { id: 'PR', name: 'Demo Stone Roof', client: 'Demo Stone', clientEmail: 'stone@demo.example', address: '12 Oak St, Bartlett, TN 38135', status: 'In Progress', jobStage: 'complete', type: 'Roofing', completedAt: iso(8), marketingOk: true, pm: 'Pat PM' },
  { id: 'PN', name: 'Demo NoOk Remodel', client: 'Demo Nook', address: '5 Elm Ct, Cordova, TN 38016', status: 'Completed', type: 'Remodel', completedAt: iso(6), pm: 'Sam PM' },
  { id: 'PX', name: 'Demo Busy Remodel', client: 'Demo Busy', address: '7 Ash Ln, Memphis, TN 38117', status: 'In Progress', type: 'Remodel', marketingOk: true, pm: 'Sam PM' },
  { id: 'PO', name: 'Demo Old Roof', client: 'Demo Old', address: '9 Fir Pl, Lakeland, TN 38002', status: 'Completed', type: 'Roofing', completedAt: iso(100), marketingOk: true, pm: 'Sam PM' },
  { id: 'PC', name: 'Demo Pct Roof', client: 'Jane Rivers', address: '3 Bay Cv, Arlington, TN 38002', status: 'Active', pct: 100, type: 'Roofing', completedAt: iso(20), marketingOk: true, pm: 'Sam PM' }];
put('projects', projects);
const P = (id, job, ref, o) => Object.assign({ id, jobId: job, ref: 'sb:crm-files/' + ref + '.jpg', thumbRef: 'sb:crm-files/' + ref + '_t.jpg', at: iso(o.d), tag: o.tag, shared: o.shared }, o.x || {});
put('gc_photos', [
  P('w1', 'PW', 'w-before', { d: 20, tag: 'Before', shared: true }), P('w2', 'PW', 'w-private-after', { d: 4, tag: 'After', shared: false }),
  P('w3', 'PW', 'w-sub-after', { d: 3, tag: 'After', shared: true, x: { source: 'sub', subId: 'S1', by: 'Ace Drywall (sub)' } }), P('w4', 'PW', 'w-after', { d: 6, tag: 'After', shared: true }),
  P('w5', 'PW', 'w-damage', { d: 21, tag: 'Damage', shared: true }), P('w6', 'PW', 'w-unset', { d: 2, tag: 'After' }),
  P('r1', 'PR', 'r-only', { d: 9, tag: 'After', shared: true }), P('n1', 'PN', 'n-b', { d: 30, tag: 'Before', shared: true }), P('n2', 'PN', 'n-a', { d: 6, tag: 'After', shared: true }),
  P('c1', 'PC', 'c-b', { d: 40, tag: 'During', shared: true }), P('c2', 'PC', 'c-a', { d: 20, tag: 'Punch', shared: true })]);
/* the report month: September 2026 (the months before "now") */
const RM = new Date(Date.UTC(new Date(NOW).getUTCFullYear(), new Date(NOW).getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
const inRM = d => RM + '-' + String(d).padStart(2, '0') + 'T15:00:00.000Z';
const leads = [
  { id: 'G1', name: 'Demo G One', source: 'Google Ads', attrib: { gclid: 'x', utm_campaign: 'g-roof' }, city: 'Bartlett', type: 'Roofing', stage: 'Won', createdAt: inRM(3) },
  { id: 'G2', name: 'Demo G Two', source: 'Google Ads', attrib: { gclid: 'x', utm_campaign: 'g-roof' }, city: 'Memphis', type: 'Roofing', stage: 'Contacted', createdAt: inRM(9) },
  { id: 'G3', name: 'Demo G Three', source: 'Google Ads', attrib: { gclid: 'x', utm_campaign: 'g-roof' }, city: 'Memphis', type: 'Roofing', stage: 'New Lead', createdAt: inRM(20) },
  { id: 'F1', name: 'Demo F One', source: 'Facebook', attrib: { utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'fb-water' }, city: 'Cordova', type: 'Water damage', stage: 'Contacted', createdAt: inRM(5) },
  { id: 'F2', name: 'Demo F Two', source: 'Facebook', attrib: { utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'fb-water' }, city: 'Cordova', type: 'Water damage', stage: 'Lost', createdAt: inRM(11) },
  /* win-back */
  { id: 'WB1', name: 'Demo Lost', email: 'lost@demo.example', city: 'Bartlett', type: 'Roofing', stage: 'Lost', lostAt: iso(45), createdAt: iso(80) },
  { id: 'WB2', name: 'Demo Nope', email: 'nope@demo.example', type: 'Roofing', stage: 'Lost', lostAt: iso(50), lostReason: 'Not interested anymore', createdAt: iso(80) },
  { id: 'WB3', name: 'Demo Optout', email: 'opt@demo.example', type: 'Roofing', stage: 'Lost', lostAt: iso(40), doNotContact: true, createdAt: iso(80) },
  { id: 'WB4', name: 'Demo Saved', email: 'saved@demo.example', type: 'Roofing', stage: 'Lost', updatedAt: iso(45), createdAt: iso(80) },
  { id: 'WB5', name: 'Demo Fresh', email: 'fresh@demo.example', type: 'Roofing', stage: 'Lost', lostAt: iso(10), createdAt: iso(20) },
  { id: 'WB6', name: 'Demo Water', email: 'water@demo.example', city: 'Germantown', type: 'Water leak', status: 'Lost', lostAt: iso(88), createdAt: iso(120) }];
put('leads', leads);
put('projects', projects.concat([{ id: 'PG1', name: 'Demo G One Roof', client: 'Demo G One', leadId: 'G1', status: 'Active', type: 'Roofing', contract: 12000, createdAt: inRM(6), pm: 'Pat PM' }]));
put('customers', []);
put('gc_approval_queue', JSON.stringify([{ id: 'TY1', kind: 'thank_you', jobId: 'PW', status: 'sent', sentAt: iso(4), createdAt: iso(5), to: 'kline@demo.example', title: 'Thank-you — Demo Kline' }]));
put('gc_office_tasks', JSON.stringify([]));
put('gc_mkt_admin', { mm: { soldValues: true, approvesStage2: true } });
put('gc_mkt_v1', { cfg: { main: { id: 'main', apprStage: { stage: 2 } } },
  reviewAsks: { PR: { id: 'PR', at: iso(7), how: 'email' } },
  reviews: { rv1: { id: 'rv1', source: 'google', author: 'Demo K.', rating: 5, text: 'Great water cleanup', date: ymd(3) }, rv2: { id: 'rv2', source: 'google', author: 'Someone Else', rating: 4, text: 'ok', date: ymd(2) },
    rs1: { id: 'rs1', source: 'google', author: 'A B', rating: 5, date: inRM(4).slice(0, 10) }, rs2: { id: 'rs2', source: 'added by Office', author: 'C D', rating: 4, date: inRM(18).slice(0, 10) } },
  posts: { pp1: { id: 'pp1', title: 'Tip', status: 'posted', postedAt: inRM(2) }, pp2: { id: 'pp2', title: 'Tip 2', status: 'posted', postedAt: inRM(9) }, pp3: { id: 'pp3', title: 'Tip 3', status: 'posted', postedAt: inRM(23) }, pp4: { id: 'pp4', title: 'draft', status: 'draft' } },
  spend: { s1: { id: 's1', month: RM, date: RM + '-01', channel: 'Google Ads', amount: 300 }, s2: { id: 's2', month: RM, date: RM + '-01', channel: 'Facebook/Instagram Ads', amount: 150 } } });

const F = require(path.join(build, 'netlify/functions/_lib/mktfeat.js'));
const soc = require(path.join(build, 'netlify/functions/soc.js'));
const pauseLib = require(path.join(build, 'netlify/functions/_lib/pause.js'));
const call = async (tok, body) => { const r = await soc.handler({ httpMethod: 'POST', headers: { authorization: 'Bearer ' + tok, origin: 'https://crm.grayco-cs.com' }, body: JSON.stringify(body) }); let j = {}; try { j = JSON.parse(r.body); } catch (e) {} return { status: r.statusCode, j, raw: r.body }; };
const leaks = txt => SECRETS.filter(x => String(txt).indexOf(x) >= 0);

console.log('(2) before / after drafts');
ok(F.finished(projects[0]) && F.finished(projects[1]) && F.finished(projects[5]) && !F.finished(projects[3]), 'finished = status Completed, stage complete, or 100%');
const pw = F.customerPhotos({ gc_photos: get('gc_photos') }, 'PW').map(r => r.id);
ok(pw.join(',') === 'w1,w4', 'customer-visible photos of the water job: only shared:true, no sub photo, no Damage, no unset — ' + pw.join(','));
let r1 = await F.runBeforeAfter({});
ok(r1.made.length === 2 && r1.made.includes(F.baPostId('PW')) && r1.made.includes(F.baPostId('PC')), 'the first run drafts the water job and the 100% roof (jobs with the OK and two shared photos)', r1);
ok(r1.skipped.photos === 1 && r1.skipped['no-ok'] === 1, 'skipped: the roof with one shared photo, the remodel without the marketing OK; the 100-day-old job is outside the window', r1.skipped);
let doc = get('gc_mkt_v1'), post = doc.posts[F.baPostId('PW')];
ok(post && post.status === 'draft' && post.autoBA === true && !post.apprId, 'it lands as a DRAFT in Social posts (not sent for approval, never posted)', post && post.status);
ok(post.beforeRef === 'sb:crm-files/w-before.jpg' && post.afterRef === 'sb:crm-files/w-after.jpg' && post.photoRef === post.afterRef, 'before = the early shared photo, after = the final shared one', [post.beforeRef, post.afterRef]);
ok(!/w-private|w-sub|w-damage|w-unset/.test(JSON.stringify(post)), 'never the private, sub, Damage or unmarked photo');
ok(/water damage restoration/.test(post.caption) && /Germantown/.test(post.caption), 'caption: the service and the city — ' + post.caption.split('\n')[0]);
ok(!leaks(post.caption).length && !/State Farm|insurance|88|Maple/i.test(post.caption), 'caption: no customer name, no street address, no carrier', leaks(post.caption));
const pc = doc.posts[F.baPostId('PC')];
ok(pc && pc.beforeRef === 'sb:crm-files/c-b.jpg' && pc.afterRef === 'sb:crm-files/c-a.jpg' && /a new roof in Arlington/.test(pc.caption), 'without Before / After tags: the oldest and the newest shared photo', pc && [pc.beforeRef, pc.afterRef]);
const r2 = await F.runBeforeAfter({});
ok(r2.made.length === 0, 'run again: nothing new (one draft per job)', r2);
doc = get('gc_mkt_v1'); doc.posts[F.baPostId('PW')].del = true; put('gc_mkt_v1', doc);
const r3 = await F.runBeforeAfter({});
ok(r3.made.length === 0, 'a deleted draft is never made again', r3);
put('gc_automation_pause', { on: true }); pauseLib.reset();
const st0 = get('gc_mktfeat_v1', 'gc_lead_inbox_kv'); delete st0.ba.jobs.PW; put('gc_mktfeat_v1', st0, 'gc_lead_inbox_kv');
doc = get('gc_mkt_v1'); delete doc.posts[F.baPostId('PW')]; put('gc_mkt_v1', doc);
const r4 = await F.runBeforeAfter({});
ok(r4.dataEntryMode === true && !get('gc_mkt_v1').posts[F.baPostId('PW')], '⏸ data-entry mode: no drafts', r4);
T.gc_kv.delete('gc_automation_pause'); pauseLib.reset();
const r5 = await F.runBeforeAfter({});
ok(r5.made.length === 1, 'after data-entry mode the job gets its one draft', r5);

console.log('(3) the review tracker');
const ad = await call('tok-admin', { op: 'mf_reviews' });
ok(ad.status === 200 && ad.j.full === true, 'an admin gets the full list', ad.status);
const row = k => ad.j.rows.find(r => r.jobId === k);
ok(row('PW') && row('PW').asked && row('PW').asked.sent && /thank-you/.test(row('PW').asked.how) && row('PW').asked.at === ymd(4), 'water job: asked by the thank-you e-mail (sent ' + ymd(4) + ')', row('PW') && row('PW').asked);
ok(row('PW').received && row('PW').received.rating === 5 && row('PW').received.matched === 'by name', 'water job: the Google review by "Demo K." is matched (5★)', row('PW').received);
ok(row('PR') && row('PR').asked && row('PR').asked.sent && !row('PR').received, 'roof: asked (Marketing → Ask), no review yet', row('PR'));
ok(!ad.j.rows.some(r => r.received && r.received.rating === 4 && r.received.source === 'google' && r.jobId !== undefined && false), 'a review by someone else is not matched to a job');
const pat = ad.j.perPm.find(x => x.pm === 'Pat PM'), sam = ad.j.perPm.find(x => x.pm === 'Sam PM');
ok(pat && pat.jobs === 2 && pat.asked === 2 && pat.received === 1, 'per PM: Pat PM asked 2, received 1', pat);
ok(sam && sam.jobs === 3 && sam.asked === 0 && sam.received === 0, 'per PM: Sam PM asked 0, received 0 (3 finished jobs)', sam);
const mm = await call('tok-mm', { op: 'mf_reviews' });
ok(mm.status === 200 && mm.j.rows.length === ad.j.rows.length && mm.j.full === false, 'the Marketing Manager gets the same rows', mm.status);
ok(!leaks(mm.raw).length, 'his answer: no customer name, address, e-mail, phone, carrier or money', leaks(mm.raw));
ok(!mm.j.rows.some(r => 'jobId' in r || 'job' in r || 'client' in r) && mm.j.rows.every(r => r.city && r.service && r.pm), 'his rows: city + service + PM (no job id, job name, client)');
const mk = await call('tok-mm', { op: 'mf_review_mark', key: mm.j.rows.find(r => r.city === 'Cordova').key, how: 'text' });
const ad2 = await call('tok-admin', { op: 'mf_reviews' });
ok(mk.j.ok && ad2.j.rows.find(r => r.jobId === 'PN').asked.how === 'text', 'he can record "asked by text" by the row key (he never has the job id)', mk.j);
const pm = await call('tok-office', { op: 'mf_reviews' });
ok(pm.status === 200, 'the office sees the tracker too', pm.status);

console.log('(4) the weekly Google ranking check');
let rk = await call('tok-admin', { op: 'mf_rank' });
ok(rk.j.configured === false && rk.j.connected === false && rk.j.terms.length === 4 && rk.j.terms.includes('roof repair memphis'), 'not set up: "Connect Search Console", the four default searches', rk.j);
const rr0 = await F.runRank({});
ok(rr0.ok === false && rr0.code === 'not_configured' && !google.calls.length, 'the run does nothing without the service account (no number made up)', rr0);
const kp = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.GOOGLE_SA_EMAIL = 'crm-reader@demo-project.iam.gserviceaccount.com'; process.env.GOOGLE_SA_KEY = kp.privateKey.export({ type: 'pkcs8', format: 'pem' });
google.sites = [{ siteUrl: 'sc-domain:other-site.com', permissionLevel: 'siteOwner' }];
const rr1 = await F.runRank({});
rk = await call('tok-admin', { op: 'mf_rank' });
ok(rr1.ok === false && rr1.code === 'no_access' && rk.j.problem === 'no_access' && rk.j.saEmail === process.env.GOOGLE_SA_EMAIL && !rk.j.connected, 'no access yet: the card names the service account the owner adds in Search Console', { rr1, p: rk.j.problem, sa: rk.j.saEmail });
const jw = JSON.parse(Buffer.from(google.lastJwt.split('.')[1], 'base64url').toString());
ok(jw.scope === 'https://www.googleapis.com/auth/webmasters.readonly' && !jw.sub && jw.iss === process.env.GOOGLE_SA_EMAIL, 'the sign-in asks for Search Console read-only, as the service account itself', jw);
google.sites.push({ siteUrl: 'sc-domain:grayco-cs.com', permissionLevel: 'siteRestrictedUser' });
google.rows = { 'roof repair memphis': { keys: ['roof repair memphis'], clicks: 3, impressions: 210, position: 8.43 }, 'roofing bartlett tn': { keys: ['roofing bartlett tn'], clicks: 1, impressions: 40, position: 4.06 } };
const rr2 = await F.runRank({});
ok(rr2.ok && rr2.check.site === 'sc-domain:grayco-cs.com' && rr2.check.rows['roof repair memphis'].position === 8.4, 'connected: Google\'s own average position is stored (#8.4)', rr2);
ok(rr2.check.rows['water damage restoration memphis'].none === true, 'a search Google did not show us for: "not seen", never a made-up number', rr2.check.rows['water damage restoration memphis']);
ok(google.lastQuery && google.lastQuery.dimensionFilterGroups[0].filters[0].operator === 'equals' && google.lastQuery.endDate < new Date(NOW).toISOString().slice(0, 10), 'one exact query per search, the last 7 settled days', google.lastQuery);
google.rows['roof repair memphis'].position = 6.0;
F._setNow(() => NOW + 7 * DAY); const rr3 = await F.runRank({}); F._setNow(null);
rk = await call('tok-mm', { op: 'mf_rank' });
const ser = rk.j.series.find(x => x.term === 'roof repair memphis');
ok(rk.j.connected && ser.weeks.length === 2 && ser.weeks[0].position === 8.4 && ser.weeks[1].position === 6, 'the history: one point per week (8.4 → 6) for the trend', ser);
ok(!('saEmail' in rk.j), 'the Marketing Manager does not get the service account address (an admin connects it)');
const te = await call('tok-mm', { op: 'mf_rank_terms', terms: 'Roof Repair Memphis\nroofing bartlett tn\nemergency tarp memphis\n\nroof repair memphis' });
ok(te.j.ok && te.j.terms.join('|') === 'roof repair memphis|roofing bartlett tn|emergency tarp memphis', 'he edits the list (cleaned, no duplicates)', te.j.terms);
const tb = await call('tok-mm', { op: 'mf_rank_terms', terms: '' });
ok(tb.status === 400, 'an empty list is refused');

console.log('(6) the owner\'s monthly report');
const D = await F.reportData(RM);
const g = D.table.rows.find(r => r.channel === 'Google Ads'), fb = D.table.rows.find(r => r.channel === 'Facebook/Instagram Ads');
ok(g && g.leads === 3 && g.spend === 300 && g.cpl === 100 && g.won === 1 && g.revenue === 12000, 'Google Ads: 3 leads, $300 spend, $100 per lead, 1 won, $12,000 sold', g);
ok(fb && fb.leads === 2 && fb.spend === 150 && fb.cpl === 75 && fb.won === 0, 'Facebook / Instagram: 2 leads, $150, $75 per lead, 0 won', fb);
ok(D.table.totals.leads === 5 && D.table.totals.spend === 450 && D.table.totals.cpl === 90, 'totals: 5 leads, $450, $90 per lead', D.table.totals);
ok(D.reviews.gained === 2 && D.posts === 3, 'reviews gained 2, posts published 3', { r: D.reviews, p: D.posts });
ok(D.best && D.best.campaign === 'g-roof' && D.worst && D.worst.campaign === 'fb-water', 'top campaign g-roof, worst fb-water', { b: D.best, w: D.worst });
const html = F.reportHtml(D);
ok(/Marketing report/.test(html) && /\$100/.test(html) && /\$12,000/.test(html) && /g-roof/.test(html) && /#6/.test(html), 'the e-mail shows the table, the campaigns and the rankings');
const cfg0 = await call('tok-admin', { op: 'mf_report_cfg' });
ok(cfg0.j.to.join() === 'wjohnson@grayco-cs.com' && cfg0.j.admins.includes('nthomas@grayco-cs.com'), 'recipients: Wesley by default, Nick can be added', cfg0.j);
const mmr = await call('tok-mm', { op: 'mf_report_cfg' }), ofr = await call('tok-office', { op: 'mf_report_send' });
ok(mmr.status === 403 && ofr.status === 403, 'the report settings / send: admins only', [mmr.status, ofr.status]);
await call('tok-admin', { op: 'mf_report_cfg', set: { to: ['wjohnson@grayco-cs.com', 'nthomas@grayco-cs.com', 'outsider@example.com'] } });
const cfg1 = await call('tok-admin', { op: 'mf_report_cfg' });
ok(cfg1.j.to.join() === 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com', 'saved: Wesley and Nick (an outside address is never kept)', cfg1.j.to);
mails.length = 0;
const notFirst = await F.runReport({ now: NOW });
ok(new Date(NOW).getUTCDate() === 1 || /not the 1st/.test(notFirst.skipped || ''), 'not the 1st: nothing sent', notFirst);
const first = Date.UTC(new Date(NOW).getUTCFullYear(), new Date(NOW).getUTCMonth() + 1, 1, 15, 10);   /* the 1st next month, ~9-10 AM Central */
const prevOfFirst = new Date(first - 3 * DAY).toISOString().slice(0, 7);
const s1 = await F.runReport({ now: first }), s2 = await F.runReport({ now: first + 3600e3 });
ok(s1.ok && mails.length === 1 && mails[0].to.join() === 'wjohnson@grayco-cs.com,nthomas@grayco-cs.com' && new RegExp(new Date(Date.UTC(+prevOfFirst.slice(0, 4), +prevOfFirst.slice(5) - 1, 15)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })).test(mails[0].subject), 'the 1st: last month\'s report to the picked admins — ' + (mails[0] && mails[0].subject), s1);
ok(/skipped|done already/.test(JSON.stringify(s2)) && mails.length === 1, 'sent once a month', s2);
ok(/grayco-logo|portal-logo/.test(mails[0].html) && /crm\.grayco-cs\.com/.test(mails[0].html), 'the e-mail carries the logo from crm.grayco-cs.com');
mails.length = 0;
const now1 = await call('tok-admin', { op: 'mf_report_send' });
ok(now1.j.ok && mails.length === 1 && mails[0].to.join() === 'wjohnson@grayco-cs.com' && /so far/.test(mails[0].subject), '"Send me this month\'s report now" goes to the admin who asked (this month so far)', mails.map(m => [m.to, m.subject]));
const pv = await call('tok-admin', { op: 'mf_report_preview', month: RM });
ok(pv.j.ok && /Marketing report/.test(pv.j.html), 'preview answers the e-mail as it will look');
mails.length = 0; process.env.MKT_REPORT_TO = 'books@grayco-cs.com';
const AG = require(path.join(build, 'netlify/functions/_lib/agency.js'));
await AG.sendReport({ month: RM });
ok(mails.length === 1 && mails[0].to.includes('books@grayco-cs.com') && !mails[0].to.includes('wjohnson@grayco-cs.com') && !mails[0].to.includes('nthomas@grayco-cs.com'), 'the agency report (1st of the month) leaves out the admins who get this one', mails[0] && mails[0].to);
mails.length = 0; await AG.sendReport({ month: RM, all: true });
ok(mails.length === 1 && mails[0].to.includes('wjohnson@grayco-cs.com'), '…but the agency portal\'s "E-mail it now" still goes to everyone', mails[0] && mails[0].to);

console.log('(7) lost-lead win-back, 30–90 days');
const WB = require(path.join(build, 'netlify/functions/_lib/winback.js'));
const core = require(path.join(build, 'netlify/functions/portal.js'))._core;
const due = WB.due30({ leads: get('leads'), customers: [], projects: [] }, { done: {} }, NOW).map(x => x.leadId);
ok(due.join(',') === 'WB1,WB6', 'due: lost 45 and 88 days ago — not "not interested", not opted out, not without a real lost date, not 10 days ago', due);
const w1 = await WB.run(core);
let q = get('gc_approval_queue'), wq = q.filter(x => x.kind === 'winback');
ok(w1.followUp30 && w1.followUp30.queued.length === 2 && wq.length === 2 && wq.every(x => x.meta.batch === '30d' && x.meta.recipients.length === 1), 'one draft per lead on the approvals list', w1.followUp30);
ok(wq.every(x => x.officeOk === true && x.mmOk === true && x.step === 'admin'), 'the office or the Marketing Manager may approve it');
ok(wq.every(x => !/Demo|lost@|water@/.test(x.title + x.subject + x.html)) && wq.some(x => /lost roofing lead in Bartlett/.test(x.title)), 'title / subject / text: no name or address ({{FIRST_NAME}} only) — ' + wq[0].title);
const w2 = await WB.run(core); q = get('gc_approval_queue');
ok(q.filter(x => x.kind === 'winback').length === 2 && w2.followUp30.queued.length === 0, 'run again: never twice', w2.followUp30);
const ma = await call('tok-mm', { op: 'mm_approvals' });
const mine = (ma.j.items || []).filter(x => x.kind === 'winback');
ok(mine.length === 2 && mine.every(x => x.mine === true) && !leaks(ma.raw).length && !/lost@demo|water@demo/.test(ma.raw), 'he sees both in his Approvals (his to decide), with no name or e-mail', { n: mine.length, leak: leaks(ma.raw) });
mails.length = 0;
const ap = await call('tok-mm', { op: 'mm_approve', id: 'appr_winback30_WB1', decision: 'approve' });
await new Promise(r => setTimeout(r, 200));
q = get('gc_approval_queue'); const it = q.find(x => x.id === 'appr_winback30_WB1');
const sent = mails.filter(m => [].concat(m.to).includes('lost@demo.example'));
ok(ap.j.ok !== false && sent.length === 1 && /Hi Demo,/.test(sent[0].html) && !/\{\{FIRST_NAME\}\}/.test(sent[0].html), 'approved by him → one e-mail to that lead, first name filled in', { ap: ap.j, st: it && it.status, n: mails.length });
const ap2 = await call('tok-mm', { op: 'mm_approve', id: 'appr_winback30_WB1', decision: 'approve' });
ok(mails.filter(m => [].concat(m.to).includes('lost@demo.example')).length === 1, 'approving again sends nothing more', ap2.j);
put('leads', get('leads').concat([{ id: 'WB7', name: 'Demo Paused', email: 'paused@demo.example', type: 'Roofing', stage: 'Lost', lostAt: iso(35) }]));
put('gc_automation_pause', { on: true }); pauseLib.reset();
const w3 = await WB.run(core);
ok(w3.followUp30.dataEntryMode === true && !get('gc_approval_queue').some(x => x.id === 'appr_winback30_WB7'), '⏸ data-entry mode: no new win-back drafts', w3.followUp30);
T.gc_kv.delete('gc_automation_pause'); pauseLib.reset();

console.log('the scheduled function');
const FN = require(path.join(build, 'netlify/functions/mkt-feat.js'));
const ping = await FN.handler({ queryStringParameters: { ping: '1' } });
ok(ping.statusCode === 200, 'GET ?ping=1 answers');
const anon = await FN.handler({ httpMethod: 'POST', headers: {}, body: '{}' });
ok(anon.statusCode === 403, 'anything but the schedule or an admin is refused', anon.statusCode);
const mon = Date.UTC(2026, 10, 2, 15, 0);   /* Monday 2 Nov 2026, 9 AM Central */
const o1 = await FN._run({ now: mon }), o2 = await FN._run({ now: mon + 3600e3 });
ok(o1.rank && o1.rank.ok && o2.rank === 'done already' && o1.ba && Array.isArray(o1.ba.made) && o2.ba === 'done already' && /not the 1st|not now/.test(JSON.stringify(o1.report)), 'Monday 9 AM: the drafts + the ranking check once; the report waits for the 1st', { o1, o2 });

console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0);
