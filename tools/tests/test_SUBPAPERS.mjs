// test_SUBPAPERS.mjs <build-dir> [shot-dir] — patch PAPERS1 (owner 11/20: "papers from portal for insurance etc go directly into crm too and
// we keep up with dates, send reminders etc."). Offline; made-up data only.
//   A. the bid site ↔ the CRM sub record (the single source of truth), on the real subportal.js / portal-access.js (in-memory Supabase):
//      a paper added in My Documents → copied into crm-files + ONE 'paper' event for the CRM sub (→ filed on the sub, ✅ Approvals Read &
//      confirm); My Documents shows the CRM's newer COI / WC / W-9 ("On file with GrayCo", read-only, never saved back); a bid counts them
//   B. reminders (_lib/care11.js coiRun, automation coi_requests): COI / WC / license at 30 / 14 / 7 / 0 days and weekly after, e-mail +
//      text with the one-tap Papers link, tagged 'trade' (goes in ⏸ data-entry mode), each milestone once (logged), a staff To-Do
//   C. the portal's Papers: workers' comp + license rows; p-paper takes 'wc' / 'license'
//   D. the CRM page: a 'wc' / 'license' paper is filed on the sub; ⚠ Expired on the sub card and the job's sub list
//   E. the bid site on a phone: My Documents shows "✓ On file with GrayCo"
import path from 'path'; import fs from 'fs'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = await import('./qaa_world.mjs');
const { DB, ACC, STORE, putRow, rowData } = W;
const BUILD = path.resolve(process.argv[2] || '.'), SHOTS = process.argv[3] || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const R = []; const ok = (n, c, i) => { R.push(!!c); console.log((c ? 'PASS ' : 'FAIL ') + n + (i !== undefined && !c ? '  ' + JSON.stringify(i).slice(0, 700) : '')); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
W.install();
const EVENTS = [], f0 = globalThis.fetch;
globalThis.fetch = async (url, init) => { const u = String(url); if (/\/rest\/v1\/gc_sub_event/.test(u) && init && init.method === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(x => EVENTS.push(x)); return { ok: true, status: 201, json: async () => [], text: async () => '' }; } return f0(url, init); };
const F = W.fns(BUILD);
const PA = require(path.join(BUILD, 'netlify/functions/portal-access.js'));
const DAY = n => new Date(Date.now() + n * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const H64 = 'c'.repeat(64);

/* the CRM: one sub (Alpha Drywall), its record has a newer COI and a WC on file; a W-9 too */
W.H.cset('vendors', [{ id: 'SUBA', isSub: true, name: 'Alpha Drywall', email: 'a@sub.test', phone: '901-555-0161', trade: 'Drywall', w9: true, coi: true, insExp: DAY(300), wc: true, wcExp: DAY(250),
  files: [{ id: 'f1', kind: 'coi', ref: 'sb:crm-files/' + H64 + '.pdf', name: 'COI 2027.pdf', type: 'application/pdf', exp: DAY(300), date: DAY(-2) }] }]);
W.H.cset('projects', []);
putRow('users', 'u_a', { id: 'u_a', role: 'sub', approved: true, email: 'a@sub.test', name: 'Alex Alpha', company: 'Alpha Drywall', trades: ['Drywall'], authUserId: 'auth-u_a' }, { user_id: 'u_a', email: 'a@sub.test' });
ACC['a@sub.test'] = { pw: 'Sub-Pass-1', id: 'auth-u_a' };
putRow('jobs', 'J1', { id: 'J1', title: 'Demo Clinic', status: 'open', visibility: 'public', draft: false, bidDueDate: DAY(20), createdAt: new Date().toISOString() }, { job_id: 'J1' });
/* the bid site's own copy: an OLD (expired) GL certificate only */
putRow('subdocs', 'u_a', { items: [{ id: 'd_old', type: 'insurance_general', label: 'GL', fileName: 'old-gl.pdf', fileRef: 'u/u_a/old-gl.pdf', expirationDate: DAY(-10), uploadedAt: '2025-01-01' }] }, { user_id: 'u_a' });
STORE.set('subportal-files/u/u_a/new-wc.pdf', Buffer.from('%PDF-1.4 workers comp\n%%EOF'));
const tokFor = e => { const t = 't-' + Math.random().toString(36).slice(2, 8); W.TOK[t] = e; return t; };
async function sp(email, body){ const r = await F.sp.handler({ httpMethod: 'POST', headers: { origin: 'https://bids.test', authorization: 'Bearer ' + tokFor(email), 'x-nf-client-connection-ip': '10.2.' + Math.floor(Math.random() * 250) + '.1' }, body: JSON.stringify(body) }); return { st: r.statusCode, d: JSON.parse(r.body || '{}') }; }

/* ═══ A ═══ */
{
  const ld = await sp('a@sub.test', { action: 'load', keys: ['subdocs:u_a'] });
  const L = (ld.d.data || {})['subdocs:u_a'] || [];
  const gl = L.find(d => d.fromCrm && d.type === 'insurance_general'), wc = L.find(d => d.fromCrm && d.type === 'insurance_workers_comp'), w9 = L.find(d => d.fromCrm && d.type === 'w9');
  ok('A1 My Documents reads the CRM sub record: the newer GL (COI good through ' + DAY(300) + ', its file signed to open), WC and W-9 show as "On file with GrayCo"; the old bid-site GL stays listed',
    ld.st === 200 && gl && gl.expirationDate === DAY(300) && /crm-files\/c{64}\.pdf/.test(gl.dataUrl || '') && wc && wc.expirationDate === DAY(250) && w9 && L.some(d => d.id === 'd_old') && L.indexOf(gl) < L.findIndex(d => d.id === 'd_old'), L);
  const bid = await sp('a@sub.test', { action: 'save', key: 'bids', upsert: [{ id: 'b1', jobId: 'J1', amount: 1000, docs: [] }] });
  ok('A2 a bid passes the papers check on what the CRM has on file (the bid site alone has only an expired GL)', bid.st === 200 && !!rowData('bids/b1'), bid);
  /* save My Documents back with the CRM items in it (as the page does) + a NEW workers' comp paper */
  const items = L.concat([{ id: 'd_wc2', type: 'insurance_workers_comp', label: 'WC', fileName: 'new-wc.pdf', fileType: 'application/pdf', fileRef: 'u/u_a/new-wc.pdf', expirationDate: DAY(365), uploadedAt: new Date().toISOString() }]);
  const sv = await sp('a@sub.test', { action: 'save', key: 'subdocs:u_a', value: items });
  const saved = (rowData('subdocs/u_a') || {}).items || [];
  const ev = EVENTS.filter(e => e.kind === 'paper');
  const copied = [...STORE.keys()].filter(k => /^crm-files\/[0-9a-f]{64}\.pdf$/.test(k));
  ok('A3 a new paper in My Documents → copied into the CRM files and ONE \'paper\' event for the CRM sub (wc, its date) — the CRM files it on the sub and it waits in ✅ Approvals Read & confirm',
    sv.st === 200 && ev.length === 1 && ev[0].sub_id === 'SUBA' && ev[0].data.paper === 'wc' && ev[0].data.exp === DAY(365) && /^sb:crm-files\/[0-9a-f]{64}\.pdf$/.test(ev[0].data.files[0].ref) && copied.length === 1 && ev[0].data.from === 'bids', [sv, ev, copied]);
  ok('A4 what the CRM has on file is never saved back into the bid site\'s copy (no "fromCrm" rows)', saved.length === 2 && !saved.some(d => d.fromCrm), saved);
  await sp('a@sub.test', { action: 'save', key: 'subdocs:u_a', value: saved });
  ok('A5 saving again with nothing new sends nothing more', EVENTS.filter(e => e.kind === 'paper').length === 1);
}

/* ═══ B. reminders ═══ */
const CARE = require(path.join(BUILD, 'netlify/functions/_lib/care11.js'));
{
  const S = (id, x) => Object.assign({ id, isSub: true, name: 'Sub ' + id, email: id.toLowerCase() + '@sub.test', phone: '901555' + String(1000 + id.length * 7).slice(-4) }, x);
  const vendors = [S('S30', { insExp: DAY(30) }), S('S14', { wcExp: DAY(14) }), S('S7', { licenseExp: DAY(7) }), S('S0', { insExp: DAY(0) }), S('SW1', { insExp: DAY(-8) }), S('SW3', { insExp: DAY(-22) }),
    S('SOK', { insExp: DAY(31) }), S('SOLD', { insExp: DAY(-120) }), S('SEX', { wcExempt: true, wcExp: DAY(-3) }), S('SBOTH', { insExp: DAY(5), wcExp: DAY(-1) }), { id: 'V1', name: 'A supplier', email: 'v@x.test', insExp: DAY(1) }];
  const due = CARE.coiDue({ vendors }, {}, Date.now());
  const st = id => (due.find(x => x.subId === id) || { items: [] }).items.map(i => i.paper + ':' + i.stage).join(',');
  ok('B1 milestones: 30 → d30 · 14 → d14 · 7 → d7 · 0 → d0 · 8 days late → w1 · 22 late → w3 · 31 out, 120 late, a WC exemption, a supplier → nothing; COI + WC in one reminder',
    st('S30') === 'coi:d30' && st('S14') === 'wc:d14' && st('S7') === 'license:d7' && st('S0') === 'coi:d0' && st('SW1') === 'coi:w1' && st('SW3') === 'coi:w3' && !st('SOK') && !st('SOLD') && !st('SEX') && st('SBOTH') === 'coi:d7,wc:d0' && !st('V1'), due.map(x => [x.subId, st(x.subId)]));
  /* coiRun with the real e-mail road in ⏸ data-entry mode (pause.js installed), a fake text and link */
  const KV = { gc_coi_req_state: {} }, TODOS = [], MAIL = [], TEXTS = [];
  const biPath = require.resolve(path.join(BUILD, 'netlify/functions/bid-inbox.js'));
  require.cache[biPath] = { id: biPath, filename: biPath, loaded: true, exports: { _lib: { kvGet: async k => KV[k], kvCas: async (k, fn) => { KV[k] = fn(KV[k]); return { ok: true }; }, sb: async () => ({ ok: true, json: async () => [] }) } } };
  CARE.setCore({ kvRead: async () => ({ vendors, users: [] }), kvListUpdate: async (k, fn) => { const r = fn(TODOS.slice()); if (r && r.list) { TODOS.length = 0; TODOS.push(...r.list); } return { ok: true }; } });
  CARE.setDeps({ link: async (id) => 'https://portal.grayco-cs.com/#t=' + 'T'.repeat(43) + '&go=papers', text: async (ph, body) => { TEXTS.push({ ph, body, tag: require(path.join(BUILD, 'netlify/functions/_lib/custquiet.js')).tag() }); return { ok: true }; } });
  process.env.RESEND_API_KEY = 'test-key'; delete process.env.PORTAL_MAIL_OFF;
  const g1 = globalThis.fetch;
  globalThis.fetch = async (url, init) => { const u = String(url);
    if (/api\.resend\.com/.test(u)) { MAIL.push(JSON.parse(init.body)); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ id: 'm' }), text: async () => '{}' }; }
    if (/gc_kv/.test(u) && /gc_automation_pause/.test(decodeURIComponent(u))) return { ok: true, status: 200, headers: { get: () => null }, json: async () => [{ key: 'gc_automation_pause', value: { on: true } }], text: async () => JSON.stringify([{ key: 'gc_automation_pause', value: { on: true } }]) };
    return g1(url, init); };
  const PAUSE = require(path.join(BUILD, 'netlify/functions/_lib/pause.js')); PAUSE.reset(); PAUSE.install();
  const paused = await PAUSE.isPaused({ fresh: true });
  const r1 = await CARE.coiRun(Date.now());
  const toS30 = MAIL.find(m => m.to.includes('s30@sub.test'));
  ok('B2 ⏸ data-entry mode is ON and the reminders still go: one e-mail per due sub (7), tagged "trade" — e-mail with the one-tap Papers link', paused === true && r1.sent === 7 && MAIL.length === 7 && toS30 && /href="https:\/\/portal\.grayco-cs\.com\/#t=T{43}&amp;go=papers"/.test(toS30.html) && /insurance certificate \(COI\) runs out in 30 days/.test(toS30.subject), [paused, r1, MAIL.map(m => m.to[0] + ' | ' + m.subject)]);
  ok('B3 … and a text to each, with the link (tagged "trade")', TEXTS.length === 7 && TEXTS.every(t => t.tag === 'trade' && /go=papers/.test(t.body)) && TEXTS.some(t => /^GrayCo: your COI runs out /.test(t.body)), TEXTS.slice(0, 3));
  const both = MAIL.find(m => m.to.includes('sboth@sub.test')) || {};
  ok('B4 one reminder covers every due paper of a sub (COI in 5 days + WC ran out) — "(+1 more)"', /\(\+1 more\)/.test(both.subject || '') && /workers’ comp certificate ran out/.test(both.html || ''), both.subject);
  const log = KV.gc_coi_req_state.done || {};
  ok('B5 each milestone is logged (sub | paper | date | milestone) with e-mail / text', Object.keys(log).length === 8 && log['S14|wc|' + DAY(14) + '|d14'] && log['S14|wc|' + DAY(14) + '|d14'].mailed === true && log['S14|wc|' + DAY(14) + '|d14'].texted === true && log['S30|' + DAY(30) + '|d30'], Object.keys(log));
  ok('B6 staff: a To-Do per paper ("🛡 WC expiring: Sub S14 — date")', TODOS.length === 8 && TODOS.some(t => t.id === 'WC_REQ_S14_' + DAY(14) && /🛡 WC expiring: Sub S14/.test(t.label)) && TODOS.some(t => t.id === 'COI_REQ_SW1_' + DAY(-8) && /expired/.test(t.label)), TODOS.map(t => t.id));
  const r2 = await CARE.coiRun(Date.now());
  ok('B7 the same day again → nothing (each milestone once)', r2.due === 0 && MAIL.length === 7 && TEXTS.length === 7, r2);
  const AU = require(path.join(BUILD, 'netlify/functions/_lib/automations.js'));
  const row = (AU.ROWS || AU.LIST || []).find ? (AU.ROWS || AU.LIST).find(x => x[0] === 'coi_requests') : null;
  const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
  ok('B8 automation coi_requests = a sub send, ON (owner asked), the same row in the CRM page', (!row || (row[2] === 'A' && row[4] === 1)) && html.includes("['coi_requests', 'sub', 'A', 0, 1, 'server', 'Paper expiry reminders to subs (COI / WC / license)'"), row);
  globalThis.fetch = g1;
}

/* ═══ C. the portal's Papers ═══ */
{
  const p = PA._papers.subPapersOf({ id: 'X', w9: true, insExp: DAY(40), wc: true, wcExp: DAY(-2), license: 'TN 123', licenseExp: DAY(90) }, [{ kind: 'paper', data: { paper: 'license' } }]);
  ok('C1 the portal\'s Papers: workers\' comp (expired, 2 days) and license (good 90 days, a new one sent) next to W-9 / COI', p.wc && p.wc.onFile && p.wc.days < 0 && p.license && p.license.exp === DAY(90) && p.license.sent === true && p.coi.exp === DAY(40), p);
  const src = fs.readFileSync(path.join(BUILD, 'netlify/functions/portal-access.js'), 'utf8'), app = fs.readFileSync(path.join(BUILD, 'portal-app.js'), 'utf8');
  ok('C2 p-paper takes wc / license (WC needs its date); the Papers tab lists them; a reminder link (go=papers) opens Papers', /\['w9', 'coi', 'agreement', 'lien', 'wc', 'license'\]/.test(src) && /paperRow\('wc'/.test(app) && /paperRow\('license'/.test(app) && /goTab\('papers'\)/.test(app) && /go=papers/.test(fs.readFileSync(path.join(BUILD, 'portal.html'), 'utf8')));
}

/* ═══ D. the CRM page ═══ */
{
  const html = fs.readFileSync(path.join(BUILD, 'index.html'), 'utf8');
  const m = /function paperExp\(sb\)\{[^\n]+/.exec(html);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paperExp = m ? new Function('esc', m[0] + '; return paperExp;')(esc) : null;
  const t1 = paperExp && paperExp({ id: 'A', insExp: DAY(-1), wcExp: DAY(10), licenseExp: DAY(-30) }), t2 = paperExp && paperExp({ id: 'B', insExp: DAY(10), wcExempt: true, wcExp: DAY(-5) });
  ok('D1 ⚠ Expired on the sub card / the job\'s sub list: "⚠ Expired: COI … · License …" (not for a WC exemption, nothing when current)', /⚠ Expired: COI \d{4}-\d\d-\d\d · License/.test(t1 || '') && t2 === '' && (html.match(/\+ paperExp\((sb|r)\)/g) || []).length === 2, [t1, t2]);
  ok('D2 the CRM files a "wc" / "license" paper from the portal or the bid site on the sub (wc + wcExp, license + licenseExp) and in its files', /if \(d\.paper === 'wc'\) \{ x\.wc = true;[^\n]*x\.wcExp = d\.exp/.test(html) && /if \(d\.paper === 'license'\)[^\n]*x\.licenseExp = d\.exp/.test(html) && /d\.paper === 'wc' \? 'Insurance \(WC\)'/.test(html));
}

/* ═══ E. the bid site on a phone: My Documents ═══ */
const { chromium } = require(path.join('/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules', 'playwright'));
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const errs = [];
try {
  const ctx = await W.bidsCtx(browser, BUILD, F, 'phone');
  const P = await ctx.newPage(); P.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  await P.goto('https://bids.test/');
  await W.bidsLogin(P, 'a@sub.test', 'Sub-Pass-1');
  await P.waitForSelector('text=Demo Clinic', { timeout: 30000 });
  await P.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /My Documents/.test(x.textContent)); if (b) b.click(); });
  const okDocs = await P.waitForSelector('[data-doc-crm]', { timeout: 15000 }).then(() => true, () => false);
  ok('E1 the bid site\'s My Documents (phone): "✓ On file with GrayCo" for what the CRM has, no 🗑 on those', okDocs && (await P.$$('[data-doc-crm]')).length >= 1, await P.evaluate(() => document.body.innerText.slice(0, 600)));
  if (SHOTS) await P.screenshot({ path: path.join(SHOTS, 'papers_mydocs.png') });
  ok('E2 no page errors', errs.length === 0, errs);
} catch (e) { ok('no crash', false, String(e && e.stack || e).slice(0, 800)); }
await browser.close();
const fails = R.filter(x => !x).length;
console.log(`\n${R.length - fails}/${R.length} passed`);
process.exit(fails ? 1 : 0);
