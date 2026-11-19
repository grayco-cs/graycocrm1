// test_COIMKT.mjs <build-dir> — patches COIAPPR + GQLINKS in the browser (offline harness; made-up data only).
//   COIAPPR: no "📄 N COI / W-9 to confirm" pill on any screen (desk and phone); the COI / W-9 items (a COI filed on a sub, a W-9
//     the server already read, a COI uploaded in the sub portal) are ONE list in ✅ Approvals (desk tab rows, the approval set
//     behind the badge, GrayCo Field's My Approvals → Other approvals) — no double count; admins and the office see them, a PM
//     does not; ✅ Fill the sub record (applySubRead) fills the sub, marks the file read (r36q) and the item leaves the list, and
//     stays gone after a re-scan and on another computer.
//   GQLINKS: 🔗 Google quick links on Marketing for an admin and the Marketing Manager (not a PM), the right links (new tab), the
//     LSA customer ID label, admins edit the list (the Marketing Manager cannot); GrayCo Field ☰ More → 🔗 Google quick links.
//   No page errors.
// Usage: node test_COIMKT.mjs <dir with index.html>   (GC_HARNESS = the offline harness_N.mjs)
import { pathToFileURL } from 'url';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const H = await import(pathToFileURL(HARNESS).href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_COIMKT.mjs <dir with index.html>'); process.exit(2); }
let pass = 0, fail = 0; const ok = (c, m, info) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 700) : '')); } };
const sleep = H.sleep;
const byId = id => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === id);
const ADMIN = byId('u-wesley'), OFFICE = byId('u-office'), PM = byId('u-pm');
const MM = 'mm-demo@' + ADMIN.split('@')[1];
H.ACCOUNTS[MM] = { id: 'u-mmdemo', name: 'Demo Marketing', role: 'staff' };
const ago = d => new Date(Date.now() - d * 864e5).toISOString();
const HEX = c => c.repeat(64);
const REF_A = 'sb:crm-files/' + HEX('a') + '.pdf', REF_B = 'sb:crm-files/' + HEX('b') + '.pdf', REF_C = 'sb:crm-files/' + HEX('c') + '.pdf';

/* ── the made-up world ── */
function seed(){
  H.resetCloud();
  H.cset('users', [
    { id: 'u1', name: 'Wesley Johnson', email: ADMIN, role: 'Admin', payType: 'owner', active: true },
    { id: 'u2', name: 'Office Demo', email: OFFICE, role: 'Office Admin', active: true },
    { id: 'u3', name: 'Demo PM', email: PM, role: 'Project Manager', active: true },
    { id: 'u4', name: 'Demo Marketing', email: MM, role: 'Marketing Manager', active: true }]);
  H.cset('projects', [{ id: 'P1', po: 'PO-9001', name: 'Demo Job', client: 'Sample Customer', address: '1 Demo St', pm: 'Demo PM', status: 'Active', contract: 10000, updatedAt: ago(3) }]);
  H.cset('subs', [
    { id: 'S1', name: 'Demo Drywall LLC', trade: 'Drywall', isSub: true, insExp: '2020-01-01', updatedAt: ago(5),
      files: [{ id: 'F1', cat: 'COI', name: 'Drywall COI 2026.pdf', ref: REF_A, data: REF_A, by: 'Office Demo', at: ago(2) }] },
    { id: 'S2', name: 'Demo Paint Co', trade: 'Paint', isSub: true, updatedAt: ago(5),
      files: [{ id: 'F2', kind: 'w9', name: 'Paint W-9.pdf', ref: REF_B, data: REF_B, by: 'sub portal', source: 'subportal', at: ago(1) }] }]);
  H.cset('vendors', []); H.cset('invs', []); H.cset('leads', []); H.cset('customers', []); H.cset('projectDocs', []); H.cset('punch', []); H.cset('expenses', []);
}
/* sub-doc-read.js, offline: the server's waiting reads (a W-9 already read for S2 — the same file as on the sub —, a COI from the sub portal) */
const SRV = { reads: [], done: [], posts: [] };
function srvReset(){
  SRV.done = []; SRV.posts = [];
  SRV.reads = [
    { id: 'RB', at: ago(1), subId: 'S2', name: 'Paint W-9.pdf', ref: REF_B, kind: 'w9', fields: { legalName: 'Demo Paint Co', taxClass: 'LLC (S)', tinType: 'ein' }, tinMasked: 'XX-XXX1234', status: 'new', source: 'subportal' },
    { id: 'RC', at: ago(0.5), subId: 'S2', name: 'Paint COI from portal.pdf', ref: REF_C, kind: 'coi', fields: { insCarrier: 'Demo Mutual', insPolicy: 'GL-77', insExp: '2027-03-31' }, status: 'new', source: 'subportal' }];
}
H.onFn('sub-doc-read', ({ method, query, body }) => {
  if (method === 'GET' && query.list) return { ok: true, items: SRV.reads.filter(r => r.status === 'new') };
  const b = body || {}; SRV.posts.push(b);
  if (b.act === 'done') { SRV.done.push(b); const r = SRV.reads.find(x => x.id === b.id); if (r) r.status = b.dismiss ? 'dismissed' : 'applied'; return { ok: true }; }
  if (b.act === 'link') return { ok: true };
  if (b.ref === REF_A) { let r = SRV.reads.find(x => x.ref === REF_A); if (!r) { r = { id: 'RA', at: new Date().toISOString(), subId: b.subId, name: b.name, ref: REF_A, kind: 'coi', fields: { insCarrier: 'Demo Casualty', insPolicy: 'GL-123', insExp: '2027-06-30', glEach: 1000000, glAgg: 2000000, addlInsured: true }, status: 'new' }; SRV.reads.push(r); } return { ok: true, read: r }; }
  return { ok: false, error: 'unknown file' };
});

const OPEN = [];
async function launch(name, email, opt = {}){
  const c = await H.computer(name, Object.assign({ build }, opt)); OPEN.push(c);
  if (email === MM) {
    await c.ctx.route(u => /\/rest\/v1\/gc_staff/.test(u), async r => {
      const u = new URL(r.request().url()), e = decodeURIComponent((u.searchParams.get('email') || '').replace(/^eq\./, ''));
      const row = e === MM ? [{ email: MM, name: 'Demo Marketing', role: 'staff', active: false, profile: 'marketing', mkt_active: true }] : (H.ACCOUNTS[e] ? [{ email: e, name: H.ACCOUNTS[e].name, role: H.ACCOUNTS[e].role, active: true, profile: '' }] : []);
      return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(row) });
    });
  }
  ok(await H.signIn(c, email, 25000), name + ' signs in');
  return c;
}
const pillState = c => c.ev(() => {
  const fixed = [...document.querySelectorAll('body *')].filter(e => { try { const st = getComputedStyle(e); return (st.position === 'fixed' || st.position === 'sticky') && /COI\s*\/\s*W-9 to confirm/.test(e.textContent || '') && e.getClientRects().length && !e.closest('.gcautai-ov'); } catch (x) { return false; } });
  return { pill: !!document.getElementById('_gcSubDocPill'), fixed: fixed.map(e => (e.id || e.className || e.tagName) + ':' + (e.textContent || '').slice(0, 60)) };
});
const coiState = c => c.ev(() => {
  const set = window._gcApprovalSet ? window._gcApprovalSet() : null;
  const other = set && set.groups && set.groups.other || [];
  const rows = window._gcAPX ? window._gcAPX.rows() : [];
  return { q: window._gcAUTAI ? window._gcAUTAI.subDocs().map(x => x.ref.slice(13, 14) + (x.pending ? 'p' : 'r')) : null, set: other.filter(x => /^subdoc_/.test(x.id)).length, total: set ? set.total : null,
    rows: rows.filter(r => r.src === 'coi').map(r => r.key), plain: rows.filter(r => /^td:subdoc_/.test(r.key)).length, mine: window._gcAPX ? window._gcAPX.state().mine : null };
});
const view = (c, v) => c.ev(v => { try { window._setView(v); } catch (e) {} }, v);

try {
  seed(); srvReset();
  /* ══ A. admin, desk ══ */
  console.log('A. admin on a computer');
  const ad = await launch('Admin', ADMIN);
  await H.waitFor(ad, () => !!window._gcAUTAI && !!window._gcCoiAppr, null, 30000);
  await ad.ev(() => window._gcAUTAI.scanSubDocs());
  const q0 = await H.waitFor(ad, () => { const q = window._gcAUTAI.subDocs(); return q.length >= 3 ? q.length : 0; }, null, 30000);
  ok(q0 === 3, 'the queue: the COI filed on S1, the W-9 the server read (the same file as on S2: once), the sub portal COI — 3, no double', q0);
  let st = await H.waitFor(ad, () => { const s = window._gcApprovalSet && window._gcApprovalSet(); return s && (s.groups.other || []).filter(x => /^subdoc_/.test(x.id)).length === 3; }, null, 15000);
  st = await coiState(ad);
  console.log('    ' + JSON.stringify(st));
  ok(st.set === 3, 'the ONE approval set has the 3 items (badge / To-Do chip / Field Other approvals)', st);
  const screens = ['dashboard', 'projects', 'todo', 'marketing', 'approvals'];
  const pills = [];
  for (const v of screens) { await view(ad, v); await sleep(1800); pills.push([v, await pillState(ad)]); }
  ok(pills.every(([, p]) => !p.pill && !p.fixed.length), 'desk: no floating "COI / W-9 to confirm" pill on ' + screens.join(', '), pills.filter(([, p]) => p.pill || p.fixed.length));
  await view(ad, 'approvals');
  st = await H.waitFor(ad, () => { const r = window._gcAPX.rows().filter(r => r.src === 'coi'); return r.length === 3 && !!document.querySelector('[data-apx-act*="coi:subdoc_"]'); }, null, 15000);
  st = await coiState(ad);
  ok(st.rows.length === 3 && st.plain === 0, '✅ Approvals tab: 3 "Sub COI / W-9 to confirm" rows, no plain duplicate rows', st);
  const tabTxt = await ad.ev(() => (document.querySelector('.apx') || document.body).innerText);
  ok(/Sub COI \/ W-9 to confirm/.test(tabTxt) && /Demo Drywall LLC/.test(tabTxt) && /Demo Paint Co/.test(tabTxt), 'the rows read "Sub COI / W-9 to confirm" with the sub and the file');
  ok(st.mine === st.total, '"Waiting on me" equals the approval set total (the badge number): ' + st.mine + ' = ' + st.total, st);
  const badge = await ad.ev(() => { const b = document.getElementById('_gcApprBadge'); return b ? b.textContent.trim() : null; });
  ok(badge === null || +badge === st.total, 'the Approvals badge shows the set total (' + badge + ')', { badge, total: st.total });
  const deny = await ad.ev(() => [...document.querySelectorAll('[data-apx-act*="coi:subdoc_"]')].map(b => b.textContent.trim()));
  ok(deny.some(t => /Read & confirm/.test(t)) && !deny.some(t => /Deny/.test(t)), 'each row: 📄 Read & confirm (+ the file), no ✕ Deny', deny);

  /* confirm the S1 COI from the Approvals tab */
  const keyA = await ad.ev(() => window._gcAPX.rows().find(r => r.src === 'coi' && /Drywall COI/.test(r.title)).key);
  await ad.ev(k => { const b = [...document.querySelectorAll('[data-apx-act]')].find(b => b.getAttribute('data-apx-act').indexOf(k + '|approve') >= 0); b.click(); }, keyA);
  const sheetOk = await H.waitFor(ad, () => { const b = document.getElementById('_gcSdOk'); const sel = document.getElementById('_gcSdSub'); return b && sel ? sel.value : ''; }, null, 15000);
  ok(sheetOk === 'S1', 'Read & confirm: the file is read and the values shown, the sub (Demo Drywall LLC) picked', sheetOk);
  const shown = await ad.ev(() => (document.querySelector('.gcautai-ov') || {}).innerText || '');
  ok(/Demo Casualty/.test(shown) && /2027-06-30/.test(shown), 'the sheet shows the insurer and the expiry read from the COI', shown.slice(0, 300));
  await ad.ev(() => document.getElementById('_gcSdOk').click());
  const filled = await H.waitFor(ad, () => { const sb = (window._crm.subs || []).find(x => x.id === 'S1'); const f = sb && (sb.files || []).find(z => z.ref && /aaaa/.test(z.ref)); return sb && f && f.aiRead && sb.insCarrier === 'Demo Casualty' ? { files: sb.files.length, aiRead: f.aiRead, coiExp: sb.coiExp } : null; }, null, 15000);
  ok(!!filled && filled.files === 1, 'Fill the sub record: S1 has the insurer, the COI expiry, and its file (already attached: not added twice) is marked read (r36q)', filled);
  ok(SRV.done.some(d => d.id === 'RA' && !d.dismiss), 'the server read is closed (act done)', SRV.done);
  st = await H.waitFor(ad, () => { const s = window._gcApprovalSet(); return window._gcAPX.rows().filter(r => r.src === 'coi').length === 2 && (s.groups.other || []).filter(x => /^subdoc_/.test(x.id)).length === 2 ? 1 : 0; }, null, 6000);
  st = await coiState(ad);
  ok(st.rows.length === 2 && st.set === 2 && st.q.length === 2, 'the confirmed COI left the list at once: 2 rows, 2 in the set', st);
  await ad.ev(() => window._gcAUTAI.scanSubDocs()); await sleep(2500);
  st = await coiState(ad);
  ok(st.q.length === 2 && !st.q.some(x => x[0] === 'a'), 'a re-scan does not bring it back (the file is marked read)', st);
  /* "Not now" leaves an item waiting */
  const keyC = await ad.ev(() => window._gcAPX.rows().find(r => r.src === 'coi' && /portal/i.test(r.title)).key);
  await ad.ev(k => { const b = [...document.querySelectorAll('[data-apx-act]')].find(b => b.getAttribute('data-apx-act').indexOf(k + '|approve') >= 0); b.click(); }, keyC);
  await H.waitFor(ad, () => !!document.getElementById('_gcSdNo'), null, 10000);
  await ad.ev(() => document.getElementById('_gcSdNo').click()); await sleep(1500);
  st = await coiState(ad);
  ok(st.q.length === 2 && st.rows.length === 2, '"Not now" leaves the item waiting', st);
  /* the sub list reached the cloud with the file marked read: another computer does not list it */
  const cloudRead0 = v => { if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } const sb = (v || []).find(x => x && x.id === 'S1'); const f = sb && (sb.files || []).find(z => z.ref === REF_A); return !!(f && f.aiRead); };
  const cloudRead = k => { let v = H.cget(k); if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } const sb = (v || []).find(x => x && x.id === 'S1'); const f = sb && (sb.files || []).find(z => z.ref === REF_A); return !!(f && f.aiRead); };
  const cloudOk = await (async () => { for (let i = 0; i < 60; i++) { if (cloudRead('vendors')) return true; await sleep(500); } return false; })();
  console.log('    cloud: vendors ' + cloudRead('vendors') + ', subs ' + cloudRead('subs') + '; writes ' + JSON.stringify(H.writes.filter(w => w.key === 'vendors' || w.key === 'subs').map(w => w.key)));
  ok(cloudOk, 'the cloud sub list (vendors) has S1 with its COI marked read');
  ok(!ad.errs.length, 'no page errors (admin desk)', ad.errs.slice(0, 5));

  /* ══ B. Marketing: the quick links (admin) ══ */
  console.log('B. 🔗 Google quick links — admin');
  await view(ad, 'marketing');
  const gq = await H.waitFor(ad, () => { const g = document.querySelector('.gmt .gql'); if (!g) return null; return { links: [...g.querySelectorAll('a.gql-a')].map(a => ({ k: a.getAttribute('data-gql-k'), href: a.getAttribute('href'), t: a.getAttribute('target'), rel: a.getAttribute('rel'), l: a.textContent.trim() })), cid: (g.querySelector('[data-gql-cid]') || {}).textContent, edit: !!g.querySelector('[data-gql-edit]'), top: g === document.querySelector('.gmt-body').firstElementChild || g.parentElement === document.querySelector('.gmt-body') && g.previousElementSibling === null }; }, null, 40000);
  console.log('    ' + JSON.stringify(gq && gq.links.map(x => x.k + '=' + x.href)));
  const EXP = { lsa: 'https://ads.google.com/localservices/', lsaleads: 'https://ads.google.com/localservices/leads', gads: 'https://ads.google.com/', kwp: 'https://ads.google.com/aw/keywordplanner/home',
    gbp: 'https://business.google.com/', ga: 'https://analytics.google.com/', gtm: 'https://tagmanager.google.com/' };
  ok(!!gq, 'admin: the strip is on Marketing');
  if (gq) {
    const m = Object.fromEntries(gq.links.map(x => [x.k, x]));
    ok(Object.keys(EXP).every(k => m[k] && m[k].href === EXP[k]), 'LSA dashboard, LSA leads, Google Ads, Keyword Planner, Business Profile, Analytics, Tag Manager: the right links', gq.links);
    ok(m.gsc && /^https:\/\/search\.google\.com\/search-console/.test(m.gsc.href), 'Search Console (the stored grayco-cs.com property link preferred)', m.gsc);
    const rl = await ad.ev(() => { const x = window._gcMktExt; let ls = ''; try { ls = localStorage.getItem('gc_google_review_url') || ''; } catch (e) {} return x.cfg().reviewLink || window._GOOGLE_REVIEW_LINK || ls || x.B.reviewLink; });   /* Marketing's own reviewLink() order */
    ok(m.review && m.review.href === rl, 'the review link is the one Marketing already uses', { strip: m.review, mkt: rl });
    ok(gq.links.every(x => x.t === '_blank' && /noopener/.test(x.rel)), 'every link opens in a new tab (noopener)');
    ok(gq.cid === '555-434-6278', 'the LSA customer ID label 555-434-6278', gq.cid);
    ok(gq.edit, 'admin: ✏ Edit links');
    ok(gq.top, 'the strip is the first thing on the Marketing home', gq.top);
    /* edit: a new Google Ads link + an extra one */
    await ad.ev(() => document.querySelector('.gql [data-gql-edit]').click()); await sleep(600);
    await ad.ev(() => { const g = document.querySelector('.gql'); g.querySelector('[data-gql-u="gads"]').value = 'https://ads.google.com/aw/overview'; g.querySelector('[data-gql-extra]').value = 'Ads billing | https://ads.google.com/aw/billing/summary'; g.querySelector('[data-gql-save]').click(); });
    const ed = await H.waitFor(ad, () => { const g = document.querySelector('.gql'); if (!g || g.querySelector('[data-gql-form]')) return null; const a = g.querySelector('a[data-gql-k="gads"]'), x = [...g.querySelectorAll('a.gql-a')].find(a => /Ads billing/.test(a.textContent)); return a && x ? { gads: a.getAttribute('href'), extra: x.getAttribute('href'), cfg: window._gcMktExt.cfg().quickLinks } : null; }, null, 8000);
    ok(ed && ed.gads === 'https://ads.google.com/aw/overview' && ed.extra === 'https://ads.google.com/aw/billing/summary', 'admin edits the list: the new link and an extra one show (saved in the marketing settings)', ed);
    const bad = await ad.ev(() => { document.querySelector('.gql [data-gql-edit]').click(); return new Promise(r => setTimeout(() => { const g = document.querySelector('.gql'); g.querySelector('[data-gql-u="ga"]').value = 'javascript:alert(1)'; g.querySelector('[data-gql-save]').click(); setTimeout(() => r({ ga: (window._gcMktExt.cfg().quickLinks.urls || {}).ga || '', form: !!document.querySelector('.gql [data-gql-form]') }), 500); }, 500)); });
    ok(!bad.ga && bad.form, 'a link that is not https:// is refused (not saved)', bad);
    await ad.ev(() => { const b = document.querySelector('.gql [data-gql-form] [data-gql-edit]'); if (b) b.click(); });
    /* put the standard list back for the next people */
    await ad.ev(() => window._gcMktExt.setCfg({ quickLinks: { urls: {}, extra: [], cid: '555-434-6278' } }));
  }
  ok(!ad.errs.length, 'no page errors (admin, Marketing)', ad.errs.slice(0, 5));
  await ad.close();

  /* ══ C. the office ══ */
  console.log('C. the office on a computer');
  const of = await launch('Office', OFFICE);
  await H.waitFor(of, () => !!window._gcAUTAI && !!window._gcCoiAppr, null, 30000);
  await of.ev(() => window._gcAUTAI.scanSubDocs());
  await H.waitFor(of, () => window._gcAUTAI.subDocs().length >= 2, null, 30000);
  await view(of, 'approvals');
  st = await H.waitFor(of, () => window._gcAPX && window._gcAPX.rows().filter(r => r.src === 'coi').length === 2 ? 1 : 0, null, 20000);
  st = await coiState(of);
  ok(st.rows.length === 2 && st.set === 2 && !st.q.some(x => x[0] === 'a'), 'office: the 2 waiting items in ✅ Approvals (the confirmed COI is not listed on this other computer)', st);
  const op = await pillState(of);
  ok(!op.pill && !op.fixed.length, 'office: no floating pill', op);
  ok(!of.errs.length, 'no page errors (office)', of.errs.slice(0, 5));
  await of.close();

  /* ══ D. a PM ══ */
  console.log('D. a PM on a computer');
  const w0 = H.writes.length;
  const pm = await launch('PM', PM);
  await H.waitFor(pm, () => !!window._gcAUTAI && !!window._gcCoiAppr, null, 30000);
  await sleep(17000);
  st = await coiState(pm);
  ok(st.set === 0 && st.rows.length === 0, 'PM: no COI / W-9 items in his approvals', st);
  await view(pm, 'marketing');
  const pmM = await H.waitFor(pm, () => document.querySelector('.gmt') ? { gql: !!document.querySelector('.gql'), can: window._gcGQL.can() } : null, null, 30000);
  ok(pmM && !pmM.gql && !pmM.can, 'PM: Marketing has no Google quick links strip', pmM);
  ok(!pm.errs.length, 'no page errors (PM)', pm.errs.slice(0, 5));
  await pm.close();
  /* a PM's computer re-saves the sub list it folded from subs + vendors (stamped new): the union merge keeps the read mark */
  const pmW = H.writes.slice(w0).filter(w => w.key === 'vendors' || w.key === 'subs');
  const lost = pmW.filter(w => w.key === 'vendors' && !w.same && !cloudRead0(w.value));
  console.log('    PM sub-list writes: ' + JSON.stringify(pmW.map(w => w.key + (w.same ? '=' : '*') + (cloudRead0(w.value) ? 'R' : '-'))));
  ok(!lost.length && cloudRead('vendors'), 'the PM\'s computer does not take the read mark off the confirmed COI in the cloud (vendors / subs)', pmW.map(w => w.key));

  /* ══ E. the Marketing Manager ══ */
  console.log('E. the Marketing Manager (Malcolm\'s role) on a computer');
  const mm = await launch('Marketing', MM);
  const mmS = await H.waitFor(mm, () => { const g = document.querySelector('.gmt .gql'); return g ? { mm: !!(window._gcIsMM && window._gcIsMM()), links: g.querySelectorAll('a.gql-a').length, lsa: (g.querySelector('a[data-gql-k="lsaleads"]') || {}).href, cid: (g.querySelector('[data-gql-cid]') || {}).textContent, edit: !!g.querySelector('[data-gql-edit]') } : null; }, null, 60000);
  ok(!!mmS && mmS.mm, 'Marketing Manager: signed in as marketing, the strip is on his Marketing page', mmS);
  if (mmS) {
    ok(mmS.links >= 9 && mmS.lsa === 'https://ads.google.com/localservices/leads' && mmS.cid === '555-434-6278', 'he has every link and the customer ID label', mmS);
    ok(!mmS.edit, 'he cannot edit the list (admins only)', mmS);
  }
  const mmL = await mm.ev(() => { try { window._gcMktExt.go('logins'); } catch (e) {} return new Promise(r => setTimeout(() => r(!!document.querySelector('.gmt[data-gmt-sec="logins"] .gql')), 900)); });
  ok(mmL, 'the strip is on top of 🔗 Marketing logins too');
  ok(!mm.errs.length, 'no page errors (Marketing Manager)', mm.errs.slice(0, 5));
  await mm.close();

  /* ══ F. GrayCo Field (admin on an iPhone) ══ */
  console.log('F. admin on a phone (GrayCo Field)');
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1';
  const INIT = `(() => { const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} }; d(Navigator.prototype, 'userAgent', ${JSON.stringify(IPHONE)}); d(Navigator.prototype, 'platform', 'iPhone'); d(Navigator.prototype, 'maxTouchPoints', 5); })()`;
  const fp = await launch('AdminPhone', ADMIN, { mobile: true, init: INIT });
  await H.waitFor(fp, () => !!document.querySelector('#_gcJobPick') && !!window._gcCoiAppr, null, 45000);
  await fp.ev(() => window._gcAUTAI.scanSubDocs());
  await H.waitFor(fp, () => window._gcAUTAI.subDocs().length >= 2, null, 30000);
  await sleep(2500);
  const fpill = await pillState(fp);
  ok(!fpill.pill && !fpill.fixed.length, 'phone: no floating pill on the Field home', fpill);
  /* ✅ Approvals (bottom bar) → My Approvals → Other approvals */
  await fp.ev(() => { const b = document.querySelector('#gc-fh-tabs [data-t="appr"],#gc-fh-tabs [data-t="approvals"]'); if (b) b.click(); else if (window._gcOpenPmApprovals) window._gcOpenPmApprovals(); });
  const fo = await H.waitFor(fp, () => { const box = document.querySelector('[data-gc-appr-other-box]'); if (!box) return null; const r = [...box.querySelectorAll('[data-gc-appr-other]')].filter(x => /^subdoc_/.test(x.getAttribute('data-gc-appr-other'))); return r.length ? { n: r.length, txt: r.map(x => x.innerText.replace(/\s+/g, ' ').slice(0, 260)) } : null; }, null, 20000);
  ok(fo && fo.n === 2 && fo.txt.every(t => /to confirm/.test(t) && /Read & confirm/.test(t)), 'Field ✅ Approvals: the 2 items under Other approvals, each with 📄 Read & confirm', fo);
  if (fo) {
    await fp.ev(() => { const r = [...document.querySelectorAll('[data-gc-appr-other]')].find(x => /^subdoc_/.test(x.getAttribute('data-gc-appr-other')) && /W-9/.test(x.innerText)); r.querySelector('button').click(); });
    const fs = await H.waitFor(fp, () => { const o = document.querySelector('.gcautai-ov'); return o && document.getElementById('_gcSdOk') ? o.innerText.slice(0, 200) : null; }, null, 10000);
    ok(!!fs && /W-9/.test(fs), 'tap → the W-9 read, ready to fill the sub (same flow as the desk)', fs);
    await fp.ev(() => document.getElementById('_gcSdOk').click());
    await sleep(500); console.log('    phone confirm: ' + await fp.ev(() => (document.getElementById('_gcSdMsg') || {}).textContent));
    const after = await H.waitFor(fp, () => { const sb = (window._crm.subs || []).find(x => x.id === 'S2'); const f = sb && (sb.files || []).find(z => /bbbb/.test(z.ref || '')); return f && f.aiRead && window._gcAUTAI.subDocs().length === 1 ? { w9: sb.w9, taxId: sb.taxId, n: window._gcAUTAI.subDocs().length } : null; }, null, 10000);
    ok(!!after && after.w9 === true, 'confirmed on the phone: S2 has its W-9, the file marked read, 1 item left', after);
    const setN = await H.waitFor(fp, () => { const s = window._gcApprovalSet(); const n = (s.groups.other || []).filter(x => /^subdoc_/.test(x.id)).length; return n === 1 ? n : null; }, null, 8000);
    ok(setN === 1, 'the approval set (badge) follows: 1', setN);
    await fp.ev(() => document.querySelectorAll('.gcautai-ov').forEach(o => o.remove()));
  }
  /* ☰ More → 🔗 Google quick links */
  await fp.ev(() => { document.querySelectorAll('body > div').forEach(o => { if (o.style && o.style.position === 'fixed' && /My Approvals/.test((o.textContent || '').slice(0, 200))) o.remove(); }); document.querySelectorAll('.gc-fh-sheet,.gc-ra-sheet').forEach(o => o.remove()); const b = document.querySelector('#gc-fh-tabs [data-t="more"]'); if (b) b.click(); });
  const more = await H.waitFor(fp, () => { const b = document.querySelector('.gc-fh-sheet[data-ra-more] [data-ra-a="gql"]'); return b ? b.textContent.trim() : null; }, null, 10000);
  ok(!!more && /Marketing accounts|Google quick links/.test(more), 'Field ☰ More → Office: 🔗 Marketing accounts (was Google quick links; patch MKTOFFICE)', more);
  if (more) {
    await fp.ev(() => document.querySelector('.gc-fh-sheet[data-ra-more] [data-ra-a="gql"]').click());
    const sh = await H.waitFor(fp, () => { const o = document.getElementById('gc-gql-ov'); return o ? { n: o.querySelectorAll('a.gql-a').length, lsa: (o.querySelector('a[data-gql-k="lsa"]') || {}).href, kwp: (o.querySelector('a[data-gql-k="kwp"]') || {}).href, cid: (o.querySelector('[data-gql-cid]') || {}).textContent, w: o.querySelector('.gql').getBoundingClientRect().width } : null; }, null, 8000);
    ok(sh && sh.n >= 9 && sh.lsa === 'https://ads.google.com/localservices/' && sh.kwp === 'https://ads.google.com/aw/keywordplanner/home' && sh.cid === '555-434-6278' && sh.w <= 390, 'tap → the same strip as a sheet (fits the phone)', sh);
    await fp.ev(() => { const x = document.querySelector('#gc-gql-ov [data-gql-x]'); if (x) x.click(); });
    ok(!(await fp.ev(() => !!document.getElementById('gc-gql-ov'))), '✕ closes the sheet');
  }
  ok(!fp.errs.length, 'no page errors (admin phone)', fp.errs.slice(0, 5));
  await fp.close();
} catch (e) {
  fail++; console.log('  ✗ FAIL threw: ' + (e && e.stack || e));
} finally {
  for (const c of OPEN) { try { await c.close(); } catch (e) {} }
}
console.log(`COIMKT ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
