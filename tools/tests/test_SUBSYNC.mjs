// test_SUBSYNC.mjs <build-dir> [shot-dir] — patch SUBSYNC (owner 11/12: "I approved 2 sub sign-ups on the bid portal — did the info go into our
// subs list?" / "and a sub list in the bid portal to invite to jobs"). Offline harness, fake portal-access / bid-hub, made-up subs and jobs.
//   0 (node) bid-hub subsList: + papers summary (W-9 / COI / WC + expiry), invited count over every job, crmDeleted for a deleted linked CRM sub
//   1 the catch-up: a sub approved earlier (not in the CRM) is on the Subs list after the next admin load — company, contact, e-mail, phone,
//     trade(s), address, license, source "Bid portal", the sign-up papers (files + w9 / coi / wc + expiry) — and in the cloud's vendors row
//   2 ✅ Approvals → ✅ Approve: the sub is on the Subs list at once, then filled (address / license / papers) by the sync after the approve
//   3 Subs → 🔨 Bid site requests → Approve: the same
//   4 a second run adds nothing (no duplicates); 5 a sub deleted on purpose is not added back (and stays out of the cloud's list)
//   6 another computer (a reload): the subs are there, once; the deleted one is not
//   7 🏗 Bid portal → 👷 Subs: every sub (CRM + bid site), ⭐ Preferred first, ⛔ Do not use hidden, no-e-mail sub listed (no tick box),
//     bid site ✓ / invited count, papers ✓ with expiry warnings, search, trade filter; tick 2 → 📨 Invite to job… → open jobs only → the
//     existing ✉️ Invite picker with them ticked → "✉️ Invite 2 picked" → bid-hub op invite {jobId, emails}
//   8 📂 Manage → ✉️ Invite subs opens the same picker (above Manage) with the same chips
//   9 a PM: no 👷 Subs switch, and the sync does not run on their computer
import path from 'path'; import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

/* ── 0. the server's list (node, an in-memory database) ── */
{
  const saveFetch = global.fetch;
  Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test' });
  const KV = { vendors: [{ id: 'V1', name: 'Old Sub LLC', email: 'old@example.com', isSub: true, trade: 'Drywall', w9: true, insExp: day(200), wcExp: day(10), contact: 'Olive Old' }],
    subs: [], gc_tombstones: { 'vendors:VGONE': '2026-11-01T00:00:00Z' } };
  const SPR = [
    { key: 'users:u_a', collection: 'users', id: 'u_a', email: 'zz@demo.test', data: { id: 'u_a', email: 'zz@demo.test', role: 'sub', approved: true, name: 'Zed Demo', company: 'Zed Demo Earthworks', trades: ['Earthwork'], phone: '901-555-0100', businessAddress: '1 Demo Rd', businessCity: 'Memphis', businessState: 'TN', licenseNumbers: 'TN 12345',
      papersCrm: [{ id: 'p1', kind: 'w9', ref: 'sb:crm-files/a/w9.pdf' }, { id: 'p2', kind: 'coi', ref: 'sb:crm-files/a/gl.pdf', exp: day(90) }, { id: 'p3', kind: 'wc', ref: 'sb:crm-files/a/wc.pdf', exp: day(-3) }] } },
    { key: 'users:u_b', collection: 'users', id: 'u_b', email: 'gone@demo.test', data: { id: 'u_b', email: 'gone@demo.test', role: 'sub', approved: true, name: 'Gone Demo', company: 'Gone Demo Co', crmSubId: 'VGONE' } },
    { key: 'users:u_c', collection: 'users', id: 'u_c', email: 'wait@demo.test', data: { id: 'u_c', email: 'wait@demo.test', role: 'sub', approved: false, name: 'Wait Demo' } },
    { key: 'users:u_o', collection: 'users', id: 'u_o', email: 'old@example.com', data: { id: 'u_o', email: 'old@example.com', role: 'sub', approved: true, name: 'Olive Old', company: 'Old Sub LLC' } },
    { key: 'invites:i1', collection: 'invites', id: 'i1', job_id: 'J1', email: 'old@example.com', data: { jobId: 'J1', email: 'old@example.com' } },
    { key: 'invites:i2', collection: 'invites', id: 'i2', job_id: 'J2', email: 'old@example.com', data: { jobId: 'J2', email: 'old@example.com' } },
    { key: 'invites:i3', collection: 'invites', id: 'i3', job_id: 'J2', email: 'zz@demo.test', data: { jobId: 'J2', email: 'zz@demo.test' } }];
  const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(JSON.stringify(body)), text: async () => JSON.stringify(body) });
  const dec = v => decodeURIComponent(String(v || ''));
  global.fetch = async (url) => { const u = new URL(String(url)), q = u.searchParams;
    if (u.pathname === '/rest/v1/sp_rows') { let rows = SPR.slice(); for (const [k, v] of q.entries()) { if (['select', 'order', 'limit'].includes(k)) continue; if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === dec(v.slice(3))); } return res(200, rows); }
    if (u.pathname === '/rest/v1/gc_kv') { const k = q.get('key') || ''; const keys = k.startsWith('in.') ? dec(k.slice(3)).replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/"/g, '')) : [dec(k.replace(/^eq\./, ''))]; return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: KV[x], updated_at: '2026-11-12T00:00:00Z' }))); }
    return res(200, []); };
  const BH = require(path.join(BUILD, 'netlify/functions/bid-hub.js'))._test;
  const L = await BH.subsList('J2');
  const z = L.find(x => x.email === 'zz@demo.test'), g = L.find(x => x.email === 'gone@demo.test'), o = L.find(x => x.email === 'old@example.com');
  ok('0a server list: an approved bid-site sub not in the CRM → notInCrm, contact / phone / address / license, papers summary (W-9 ✓, COI + expiry, WC + expiry), invited 1 job (and to J2)',
    !!z && z.notInCrm === true && z.crmDeleted === false && z.contact === 'Zed Demo' && z.phone === '901-555-0100' && z.address === '1 Demo Rd' && z.license === 'TN 12345' && z.pp.w9 && z.pp.coi && z.pp.coiExp === day(90) && z.pp.wc && z.pp.wcExp === day(-3) && z.invitedCount === 1 && z.invited === true, z);
  ok('0b a CRM sub: its own papers (W-9, COI expiry, WC expiry), contact, on the bid site, invited to 2 jobs', !!o && o.crmId === 'V1' && o.onBidSite === true && o.invitedCount === 2 && o.pp.w9 && o.pp.coiExp === day(200) && o.pp.wcExp === day(10) && o.contact === 'Olive Old', o);
  ok('0c a bid-site sub whose linked CRM sub was deleted on purpose → crmDeleted (the CRM never adds it back); a sub not approved is not listed', !!g && g.crmDeleted === true && !L.some(x => x.email === 'wait@demo.test'), { g, n: L.length });
  global.fetch = saveFetch;
}

const { computer, signIn, sleep, cset, cget, resetCloud } = await import(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs');
const now = new Date().toISOString(), old = new Date(Date.now() - 2 * 864e5).toISOString();
resetCloud();
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u3', name: 'Sam Biffle', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true }]);
cset('vendors', [
  { id: 'V1', name: 'Old Sub LLC', contact: 'Olive Old', email: 'old@example.com', phone: '901-555-0001', isSub: true, trade: 'Drywall', w9: true, coi: true, insExp: day(200), wc: true, wcExp: day(10), updatedAt: old },
  { id: 'V2', name: 'Pref Paint Co', contact: 'Pam Pref', email: 'pref@paint.test', isSub: true, trade: 'Paint', subFlag: 'preferred', w9: true, coi: true, insExp: day(-5), wc: true, wcExp: day(300), updatedAt: old },
  { id: 'V3', name: 'Nope Roofing', email: 'nope@roof.test', isSub: true, trade: 'Roofing', subFlag: 'dnu', updatedAt: old },
  { id: 'V4', name: 'No Email Framing', isSub: true, trade: 'Framing', phone: '901-555-0004', updatedAt: old },
  { id: 'V5', name: 'Home Supply Depot', email: 'orders@supply.test', isSub: false, updatedAt: old }]);
cset('projects', [{ id: 'P1', name: 'Sample Clinic Remodel', client: 'Sample Health', status: 'active', autoPO: 'T101', createdAt: old, updatedAt: old }]);
const PAP = (id, k, exp) => ({ id: id + '_' + k, kind: k, ref: 'sb:crm-files/' + id + '/' + k + '.pdf', name: k + '.pdf', type: 'application/pdf', exp: exp || '', at: old });
/* the bid site's users (sp_rows users): Demo Paving was approved yesterday (before this fix) — Zedd and Yara are waiting */
const BIDUSERS = [
  { id: 'u_d', email: 'dee@demopaving.test', role: 'sub', approved: true, name: 'Dee Demo', company: 'Demo Paving LLC', phone: '901-555-0201', trades: ['Paving', 'Concrete'], businessAddress: '200 Demo Ave', businessCity: 'Memphis', businessState: 'TN', businessZip: '38103', licenseNumbers: 'TN CL-777',
    papersCrm: [PAP('u_d', 'w9'), PAP('u_d', 'coi', day(120)), PAP('u_d', 'wc', day(20))], bidsApprovedAt: old },
  { id: 'u_z', email: 'zedd@zeddearth.test', role: 'sub', approved: false, name: 'Zedd Demo', company: 'ZEDD EARTHWORKS', phone: '901-555-0301', trades: ['Earthwork', 'Excavation'], businessAddress: '300 Sample Hwy', businessCity: 'Olive Branch', businessState: 'MS', businessZip: '38654', licenseNumbers: 'MS 55-123', at: old },
  { id: 'u_y', email: 'yara@demotile.test', role: 'sub', approved: false, name: 'Yara Demo', company: 'Demo Tile Co', phone: '901-555-0401', trades: ['Tile'], businessAddress: '400 Sample St', businessCity: 'Memphis', businessState: 'TN', licenseNumbers: '', at: old }];
const PAPERS_ON_APPROVE = { u_z: [PAP('u_z', 'w9'), PAP('u_z', 'coi', day(200)), PAP('u_z', 'wc', day(-2)), Object.assign(PAP('u_z', 'license', day(365)), { licState: 'MS', licType: 'Contractor', licNumber: '55-123' })], u_y: [PAP('u_y', 'w9')] };
const CALLS = [], HUB = [];
function serverSubs(jobId){   /* what bid-hub ?subs=1 answers (the real shape: CRM subs ranked ⭐ first, ⛔ out; then approved bid-site subs not in the CRM) */
  const crm = (cget('vendors') || []).filter(v => v && v.isSub && v.email && v.subFlag !== 'dnu');
  const inv = { 'old@example.com': 2, 'pref@paint.test': 1 };
  const out = crm.sort((a, b) => (b.subFlag === 'preferred') - (a.subFlag === 'preferred')).map(v => { const u = BIDUSERS.find(x => x.email === v.email);
    return { email: v.email, name: v.name, company: v.company || '', trade: v.trade || '', trades: (u && u.trades) || [], flag: v.subFlag || '', onBidSite: !!(u && u.approved), invited: false, invitedCount: inv[v.email] || 0, crmId: v.id, portalUserId: u ? u.id : '', papers: (u && u.papersCrm) || [], contact: v.contact || '', phone: v.phone || '',
      pp: { w9: !!v.w9, coi: !!v.coi, coiExp: v.insExp || '', wc: !!v.wc, wcExp: v.wcExp || '', wcExempt: !!v.wcExempt } }; });
  BIDUSERS.filter(u => u.approved && !crm.some(v => v.email === u.email)).forEach(u => out.push({ email: u.email, name: u.name, company: u.company, trade: u.trades[0], trades: u.trades, flag: '', onBidSite: true, invited: false, invitedCount: 0,
    notInCrm: true, crmDeleted: false, phone: u.phone, portalUserId: u.id, papers: u.papersCrm || [], crmId: '', city: u.businessCity, state: u.businessState, address: u.businessAddress, zip: u.businessZip || '', licenses: u.licenseNumbers, contact: u.name, license: u.licenseNumbers, approvedAt: u.bidsApprovedAt || '',
    pp: { w9: (u.papersCrm || []).some(p => p.kind === 'w9'), coi: (u.papersCrm || []).some(p => p.kind === 'coi'), coiExp: ((u.papersCrm || []).find(p => p.kind === 'coi') || {}).exp || '', wc: (u.papersCrm || []).some(p => p.kind === 'wc'), wcExp: ((u.papersCrm || []).find(p => p.kind === 'wc') || {}).exp || '', wcExempt: false } }));
  return out;
}
const JOBS = [{ id: 'J1', title: 'Sample Clinic Remodel', status: 'open', visibility: 'private', due: day(9), invited: 1, bids: 0, plans: 1, trades: 'Drywall, Paint', crmProjectId: 'P1' },
  { id: 'J2', title: 'Closed Demo Warehouse', status: 'closed', visibility: 'public', invited: 3, bids: 2 }, { id: 'J3', title: 'Open Demo Library', status: 'open', visibility: 'public', invited: 0, bids: 0, trades: 'Paving' }];
async function routes(c, who){
  const admin = who === 'wjohnson@grayco-cs.com';
  await c.ctx.route('**/.netlify/functions/portal-access*', async rt => { const b = JSON.parse(rt.request().postData() || '{}'); CALLS.push(Object.assign({ who }, b));
    const J = v => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) });
    if (b.action === 's-sync') return J({ ok: true, events: [], unread: {}, links: {}, waiting: [], codes: [], admin, me: who, bids: admin ? BIDUSERS.filter(u => !u.approved && !u.denied).map(u => ({ id: u.id, company: u.company, name: u.name, email: u.email, phone: u.phone, trades: u.trades, city: u.businessCity, state: u.businessState, selfSignup: true, at: u.at, papers: { w9: { ok: true }, gl: null, wc: null, licenses: [], ready: false } })) : [] });
    if (b.action === 's-bids-approve') { const u = BIDUSERS.find(y => y.id === b.id); if (!admin || !u) return J({ ok: false, error: 'no' }); if (b.approve) { u.approved = true; u.bidsApprovedAt = new Date().toISOString(); u.papersCrm = PAPERS_ON_APPROVE[u.id] || []; } else u.denied = true; return J({ ok: true, approved: !!b.approve }); }
    return J({ ok: true }); });
  await c.ctx.route('**/.netlify/functions/bid-hub*', async rt => { const req = rt.request(), u = new URL(req.url()), J = (v, st) => rt.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(v) });
    const canInvite = admin; HUB.push({ who, m: req.method(), q: u.search, body: req.postData() || '', auth: !!req.headers().authorization });
    if (req.method() === 'POST') { const b = JSON.parse(req.postData() || '{}'); if (b.op === 'invite') return canInvite ? J({ ok: true, invited: (b.emails || []).length, mailed: (b.emails || []).length, to: (b.emails || []).length }) : J({ error: 'Only an admin, an estimator or the office invites subs.' }, 403); return J({ ok: true }); }
    if (u.searchParams.get('jobs')) return J({ ok: true, jobs: JOBS, me: { email: who, admin, canInvite, canPublic: admin } });
    if (u.searchParams.get('subs')) return canInvite ? J({ ok: true, subs: serverSubs(u.searchParams.get('job')) }) : J({ error: 'Only an admin, an estimator or the office invites subs.' }, 403);
    if (u.searchParams.get('manage')) return J({ ok: true, paused: false, job: Object.assign({ tradeScopes: [], plansLinks: [], addenda: [], posts: [], log: [] }, JOBS[0]), plans: [], planreqs: [], questions: [], acks: [], activity: [], audience: [] });
    return J({ ok: true }); });
}
const shot = async (c, n) => { if (SHOTS) try { await c.page().screenshot({ path: path.join(SHOTS, n + '.png') }); } catch (e) {} };
const waitOn = async (c, f, arg, ms = 25000) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await c.ev(f, arg).catch(() => null); if (v) return v; await sleep(400); } return v; };
const vend = c => c.ev(() => (window._crm.vendors || []).map(v => ({ id: v.id, email: v.email || '', name: v.name, company: v.company, contact: v.contact, phone: v.phone, trade: v.trade, address: v.address, license: v.license, source: v.source, isSub: v.isSub, cat: v.cat,
  w9: !!v.w9, coi: !!v.coi, insExp: v.insExp || '', wc: !!v.wc, wcExp: v.wcExp || '', files: (v.files || []).map(f => f.label + '|' + f.ref), bidPortalUserId: v.bidPortalUserId || '' })));
const cloudHas = e => (cget('vendors') || []).filter(v => v && v.email === e).length;

const A = await computer('wjohnson@grayco-cs.com', { build: BUILD }); const errs = []; A.page().on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
await routes(A, 'wjohnson@grayco-cs.com'); await signIn(A, 'wjohnson@grayco-cs.com', 15000);

/* 1. the catch-up on load */
const dee = await waitOn(A, () => (window._crm.vendors || []).find(v => v.email === 'dee@demopaving.test'), null, 45000);
let V = await vend(A); const d = V.find(v => v.email === 'dee@demopaving.test') || {};
ok('1 a sub approved earlier on the bid site is on the Subs list after the next admin load: company, contact, e-mail, phone, trades, address, license, "Bid portal", a sub',
  !!dee && d.id === 'SBPdeedemopavingtest' && d.name === 'Demo Paving LLC' && d.contact === 'Dee Demo' && d.phone === '901-555-0201' && d.trade === 'Paving, Concrete' && /200 Demo Ave, Memphis, TN 38103/.test(d.address) && d.license === 'TN CL-777' && d.source === 'Bid portal' && d.isSub === true && d.cat === 'Subcontractor', d);
ok('1b …with the sign-up papers on the record: W-9, COI (+ expiry), WC (+ expiry) files and flags', d.files && d.files.length === 3 && d.w9 && d.coi && d.insExp === day(120) && d.wc && d.wcExp === day(20) && d.files.every(f => /sb:crm-files\/u_d\//.test(f)), d);
await sleep(3500);
ok('1c …saved to the cloud\'s vendors row (the list every computer loads)', cloudHas('dee@demopaving.test') === 1, (cget('vendors') || []).map(v => v.email));
ok('1d the bid-hub sub list was read with the sign-in (Authorization) — and the sync says when', HUB.some(h => /subs=1/.test(h.q) && h.auth) && (await A.ev(() => window._gcBidSubs.last().okAt > 0)), HUB.filter(h => /subs=1/.test(h.q)));

/* 2. ✅ Approvals → ✅ Approve */
await A.ev(() => { window._gcSubsBids.sync(); }); await sleep(1500);
await A.ev(() => { window._gcBpAppr.refresh(); window._setView('approvals'); });
const row = await waitOn(A, () => !!document.querySelector('.apx-row[data-k="bp:su:u_z"]'), null, 40000);
ok('2 Zedd\'s sign-up is a row in ✅ Approvals', !!row);
const tA = Date.now();
await A.ev(() => [...document.querySelectorAll('.apx-row[data-k="bp:su:u_z"] button')].find(b => /Approve/.test(b.textContent)).click());
const z1 = await waitOn(A, () => (window._crm.vendors || []).find(v => v.email === 'zedd@zeddearth.test' && v.files && v.files.length >= 4), null, 15000);
V = await vend(A); const z = V.find(v => v.email === 'zedd@zeddearth.test') || {};
ok('2b ✅ Approve → s-bids-approve, and Zedd is on the Subs list within seconds (' + Math.round((Date.now() - tA) / 100) / 10 + ' s): company, contact, phone, trades, street address, license, "Bid portal"',
  CALLS.some(c => c.action === 's-bids-approve' && c.id === 'u_z' && c.approve === true) && !!z1 && z.name === 'ZEDD EARTHWORKS' && z.contact === 'Zedd Demo' && z.phone === '901-555-0301' && z.trade === 'Earthwork, Excavation' && /300 Sample Hwy/.test(z.address) && /Olive Branch/.test(z.address) && z.license === 'MS 55-123' && z.source === 'Bid portal' && z.bidPortalUserId === 'u_z', z);
ok('2c …with the sign-up papers: W-9, COI ' + day(200) + ', WC (expired) and the license file', z.w9 && z.coi && z.insExp === day(200) && z.wc && z.wcExp === day(-2) && z.files.length === 4 && z.files.some(f => /^License MS Contractor 55-123/.test(f)), z.files);
await sleep(2500);
ok('2d …and in the cloud\'s vendors row', cloudHas('zedd@zeddearth.test') === 1, (cget('vendors') || []).map(v => v.email));

/* 3. Subs → 🔨 Bid site requests → Approve */
await A.ev(() => window._setView('subs'));
const btn = await waitOn(A, () => !!document.querySelector('.gcsub-panel [data-p="bids-ok"][data-id="u_y"]'), null, 30000);
ok('3 Yara\'s request is in Subs → 🔨 Bid site requests', !!btn);
await A.ev(() => document.querySelector('.gcsub-panel [data-p="bids-ok"][data-id="u_y"]').click());
const y1 = await waitOn(A, () => (window._crm.vendors || []).find(v => v.email === 'yara@demotile.test' && (v.files || []).length === 1), null, 15000);
V = await vend(A); const y = V.find(v => v.email === 'yara@demotile.test') || {};
ok('3b Approve there → Yara on the Subs list (Demo Tile Co, Tile, 400 Sample St, W-9 on the record)', !!y1 && y.name === 'Demo Tile Co' && y.trade === 'Tile' && /400 Sample St/.test(y.address) && y.w9 && !y.coi && y.source === 'Bid portal', y);
await sleep(2500);

/* 4. no duplicates */
let r = await A.ev(() => window._gcBidSubs.run({ force: true }));
await A.ev(() => window._gcBidSubs.approved({ id: 'u_z', email: 'ZEDD@zeddearth.test', company: 'ZEDD EARTHWORKS' }));
await sleep(1500);
V = await vend(A);
const cnt = e => V.filter(v => v.email === e).length;
ok('4 a second sync (and a second approve) adds nobody: each sub once, on screen and in the cloud', r && r.added === 0 && ['dee@demopaving.test', 'zedd@zeddearth.test', 'yara@demotile.test', 'old@example.com'].every(e => cnt(e) === 1) && ['dee@demopaving.test', 'zedd@zeddearth.test', 'yara@demotile.test'].every(e => cloudHas(e) === 1), { r, n: V.map(v => v.email) });

/* 5. deleted on purpose → not added back (the Subs screen's 🗑 Delete Sub: tombstones + off the list) */
await A.ev(() => { const id = 'SBPzeddzeddearthtest'; window._gcTombstone('subs', id); window._gcTombstone('vendors', id); window.__GC_SET_SUBLIST__((window._crm.subs || []).filter(v => v.id !== id)); });
await sleep(1500);
r = await A.ev(() => window._gcBidSubs.run({ force: true })); await sleep(1500);
r = await A.ev(() => window._gcBidSubs.run({ force: true })); await sleep(3000);
V = await vend(A);
ok('5 Zedd deleted on purpose in the CRM is not added back by the sync (the bid site still lists him as approved)', cnt('zedd@zeddearth.test') === 0 && r && r.added === 0, { r, v: V.map(v => v.email) });
ok('5b …and the cloud\'s vendors row no longer has him', cloudHas('zedd@zeddearth.test') === 0, (cget('vendors') || []).map(v => v.email));

/* 7. 🏗 Bid portal → 👷 Subs */
await A.ev(() => { try { localStorage.setItem('gc_bp_mode:wjohnson@grayco-cs.com', 'crm'); } catch (e) {} document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
const swOk = await waitOn(A, () => { const b = document.querySelector('#gc-sys-bp-mount [data-sys="bpmode"][data-m="subs"]'); if (b) { b.click(); return true; } if (!window.__tv || Date.now() - window.__tv > 3000) { window.__tv = Date.now(); window._setView('bidportal'); } return false; }, null, 40000);
ok('7- the 🏗 Bid portal tab has the 👷 Subs switch (admin)', !!swOk);
const list = await waitOn(A, () => { const r = [...document.querySelectorAll('#gc-sys-bp-mount [data-bps-row]')]; return r.length >= 5 ? r.map(x => x.getAttribute('data-bps-row') + '|' + x.textContent.replace(/\s+/g, ' ').slice(0, 220)) : null; }, null, 20000);
await shot(A, '01_subs_tab');
const T = await A.ev(() => { const m = document.getElementById('gc-sys-bp-mount'); const row = e => m.querySelector('[data-bps-row="' + e + '"]');
  return { on: !!m.querySelector('[data-sys="bpmode"][data-m="subs"].on'), crmHidden: m.querySelector('#gc-sys-bp').style.display === 'none', first: (m.querySelector('[data-bps-row]') || {}).getAttribute && m.querySelector('[data-bps-row]').getAttribute('data-bps-row'),
    nope: !!row('nope@roof.test'), noEmail: (function(){ const r = [...m.querySelectorAll('[data-bps-row]')].find(x => /No Email Framing/.test(x.textContent)); return r ? { box: !!r.querySelector('input[data-bps=pick]'), t: r.textContent } : null; })(),
    vendor: !!row('orders@supply.test'), dee: row('dee@demopaving.test') ? row('dee@demopaving.test').innerHTML : '', old: row('old@example.com') ? row('old@example.com').innerHTML : '', pref: row('pref@paint.test') ? row('pref@paint.test').innerHTML : '', zedd: !!row('zedd@zeddearth.test') }; });
ok('7 🏗 Bid portal → 👷 Subs: the switch is on, the other views hidden; ⭐ Preferred first; ⛔ Do not use hidden; a vendor is not a sub; the no-e-mail sub listed without a tick box',
  T.on && T.crmHidden && T.first === 'pref@paint.test' && /⭐/.test(T.pref) && !T.nope && !T.vendor && T.noEmail && !T.noEmail.box && /no e-mail/.test(T.noEmail.t), T);
ok('7b columns: Demo Paving (bid portal) — contact, trades, ✓ on the bid site, papers W-9 ✓ / COI ✓ / WC ✓ ⚠ (expires in 20 days)', /Dee Demo/.test(T.dee) && /Paving, Concrete/.test(T.dee) && /data-site="1"/.test(T.dee) && /data-pp="w9">W-9 <b[^>]*>✓/.test(T.dee) && /data-pp="wc">WC <b[^>]*>✓<\/b> <span data-exp="soon"/.test(T.dee), T.dee);
ok('7c invited count and expiry warnings: Old Sub "📨 invited 2×", WC ⚠ soon; Pref Paint COI ⚠ expired (red)', /data-invn="2"/.test(T.old) && /data-pp="wc">WC <b[^>]*>✓<\/b> <span data-exp="soon"/.test(T.old) && /data-pp="coi">COI <b[^>]*>✓<\/b> <span data-exp="expired"/.test(T.pref), { old: T.old, pref: T.pref });
await A.page().locator('#gc-sys-bp-mount [data-bps="q"]').fill('yara'); await sleep(500);
let shownRows = await A.ev(() => [...document.querySelectorAll('#gc-sys-bp-mount [data-bps-row]')].map(x => x.getAttribute('data-bps-row')));
ok('7d search "yara" → only Demo Tile Co', shownRows.length === 1 && shownRows[0] === 'yara@demotile.test', shownRows);
await A.page().locator('#gc-sys-bp-mount [data-bps="q"]').fill(''); await sleep(300);
await A.page().locator('#gc-sys-bp-mount select[data-bps="trade"]').selectOption('paving'); await sleep(500);
shownRows = await A.ev(() => [...document.querySelectorAll('#gc-sys-bp-mount [data-bps-row]')].map(x => x.getAttribute('data-bps-row')));
ok('7e trade filter "Paving" → Demo Paving only', shownRows.length === 1 && shownRows[0] === 'dee@demopaving.test', shownRows);
await A.page().locator('#gc-sys-bp-mount select[data-bps="trade"]').selectOption(''); await sleep(300);
await A.page().locator('#gc-sys-bp-mount [data-bps="pick"][data-e="old@example.com"]').check(); await sleep(200);
await A.page().locator('#gc-sys-bp-mount [data-bps="pick"][data-e="dee@demopaving.test"]').check(); await sleep(200);
const bar = await A.ev(() => document.querySelector('#gc-sys-bp-mount [data-bps-n]').textContent + '|' + document.querySelector('#gc-sys-bp-mount [data-bps="invite"]').disabled);
ok('7f tick 2 → "2 selected", 📨 Invite to job… on', bar === '2 selected|false', bar);
await A.ev(() => document.querySelector('#gc-sys-bp-mount [data-bps="invite"]').click());
const jl = await waitOn(A, () => { const m = document.getElementById('gcbps-jobs'); return m && m.querySelector('[data-j="pick"]') ? [...m.querySelectorAll('[data-j="pick"]')].map(b => b.getAttribute('data-job')) : null; }, null, 15000);
await shot(A, '02_pick_job');
ok('7g 📨 Invite to job… lists the OPEN bid-portal jobs only (not the closed one)', !!jl && jl.includes('J1') && jl.includes('J3') && !jl.includes('J2'), jl);
await A.ev(() => document.querySelector('#gcbps-jobs [data-j="pick"][data-job="J1"]').click());
const pk = await waitOn(A, () => { const b = document.querySelector('#gcsys-modal [data-sys-inv] .list'); if (!b) return null; const c = [...b.querySelectorAll('input[data-sys=pick]')].filter(x => x.checked).map(x => x.getAttribute('data-e')); return c.length ? { c, send: (document.querySelector('#gcsys-modal [data-sys="send"]') || {}).textContent, chips: b.innerHTML.indexOf('data-chip="papers"') > -1, site: b.innerHTML.indexOf('data-chip="site"') > -1 } : null; }, null, 15000);
await shot(A, '03_invite_picker');
ok('7h → the existing ✉️ Invite picker for that job, the 2 ticked, "✉️ Invite 2 picked", rows show 🏗 bid site / 📎 papers chips', !!pk && pk.c.length === 2 && pk.c.includes('old@example.com') && pk.c.includes('dee@demopaving.test') && /Invite 2 picked/.test(pk.send) && pk.chips && pk.site, pk);
const h0 = HUB.length;
await A.ev(() => document.querySelector('#gcsys-modal [data-sys="send"]').click()); await sleep(1500);
const inv = HUB.slice(h0).filter(h => h.m === 'POST').map(h => JSON.parse(h.body)).find(b => b.op === 'invite');
ok('7i "✉️ Invite 2 picked" → bid-hub op invite {jobId J1, the 2 e-mails} (the existing invite op — no new e-mail path)', !!inv && inv.jobId === 'J1' && inv.emails.length === 2 && inv.emails.includes('old@example.com') && inv.emails.includes('dee@demopaving.test'), inv);

/* 8. 📂 Manage → ✉️ Invite subs */
await A.ev(() => window._gcSys2.open('J1', 'details'));
await waitOn(A, () => document.querySelector('#gcsys2 [data-a="invite"]'), null, 15000);
await A.ev(() => document.querySelector('#gcsys2 [data-a="invite"]').click());
const mg = await waitOn(A, () => { const m = document.getElementById('gcsys-modal'), b = m && m.querySelector('[data-sys-inv] .list'); if (!b) return null; const z2 = +getComputedStyle(m).zIndex, z1 = +getComputedStyle(document.getElementById('gcsys2')).zIndex; return { rows: [...b.querySelectorAll('input[data-sys=pick]')].map(x => x.getAttribute('data-e')), above: z2 > z1, chips: b.innerHTML.indexOf('data-chip="papers"') > -1, trades: [...m.querySelectorAll('[data-sys="trade"].on')].map(x => x.getAttribute('data-t')) }; }, null, 15000);
await shot(A, '04_manage_invite');
ok('8 📂 Manage → ✉️ Invite subs: the existing picker opens above Manage, on the job\'s trades (Drywall, Paint → Old Sub, ⭐ Pref Paint), with the same chips', !!mg && mg.above && mg.chips && mg.rows.includes('old@example.com') && mg.rows.includes('pref@paint.test') && mg.trades.length === 2, mg);
await A.ev(() => [...document.querySelectorAll('#gcsys-modal [data-sys="trade"].on')].forEach(b => b.click())); await sleep(300);
await A.ev(() => [...document.querySelectorAll('#gcsys-modal [data-sys="trade"].on')].forEach(b => b.click())); await sleep(300);
const mg2 = await A.ev(() => [...document.querySelectorAll('#gcsys-modal [data-sys-inv] .list input[data-sys=pick]')].map(x => x.getAttribute('data-e')));
ok('8b …trade chips off → every sub of the 👷 Subs list that has an e-mail (bid-site ones too), ⛔ Do not use not offered', ['old@example.com', 'pref@paint.test', 'dee@demopaving.test', 'yara@demotile.test'].every(e => mg2.includes(e)) && !mg2.includes('nope@roof.test'), mg2);
await A.ev(() => { const m = document.getElementById('gcsys-modal'); if (m) m.remove(); if (window._gcSys2 && window._gcSys2.close) window._gcSys2.close(); });
ok('no page errors (admin)', !errs.length, errs);
await A.b.close();

/* 6. another computer: the list from the cloud */
const B = await computer('wjohnson@grayco-cs.com', { build: BUILD }); const errsB = []; B.page().on('pageerror', e => errsB.push(String(e.message).slice(0, 200)));
await routes(B, 'wjohnson@grayco-cs.com'); await signIn(B, 'wjohnson@grayco-cs.com', 15000); await sleep(4000);
await B.ev(() => window._gcBidSubs.run({ force: true })); await sleep(2000);
V = await vend(B);
ok('6 another computer (reload): Demo Paving and Demo Tile are on its Subs list once, with their papers; Zedd (deleted) is not', cnt('dee@demopaving.test') === 1 && cnt('yara@demotile.test') === 1 && cnt('zedd@zeddearth.test') === 0 && (V.find(v => v.email === 'dee@demopaving.test') || {}).files.length === 3, V.map(v => v.email + ':' + v.files.length));
ok('no page errors (second computer)', !errsB.length, errsB);
await B.b.close();

/* 9. a PM */
cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u3', name: 'Sam Biffle', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true }]);
const C = await computer('sbiffle@grayco-cs.com', { build: BUILD });
await routes(C, 'sbiffle@grayco-cs.com'); await signIn(C, 'sbiffle@grayco-cs.com', 15000); await sleep(3000);
const pmRun = await C.ev(() => window._gcBidSubs.run({ force: true }));
await C.ev(() => window._setView('bidportal')); await sleep(2500);
const pmSw = await C.ev(() => !!document.querySelector('#gc-sys-bp-mount [data-sys="bpmode"][data-m="subs"]'));
ok('9 a PM: no 👷 Subs switch on the Bid portal tab; the bid-site → Subs sync does not run on their computer (no ?subs=1 call)', !pmSw && pmRun && pmRun.skipped && !HUB.some(h => h.who === 'sbiffle@grayco-cs.com' && /subs=1/.test(h.q)), { pmSw, pmRun });
await C.b.close();
const n = R.filter(Boolean).length; console.log('SUBSYNC ' + n + '/' + R.length); process.exit(n === R.length ? 0 : 1);
