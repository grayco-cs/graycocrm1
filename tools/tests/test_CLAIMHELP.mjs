/* patch CLAIMHELP tests: node tools/tests/test_CLAIMHELP.mjs [--no-browser] [--no-crm]
   "🛡 Your insurance claim" in the customer portal + ⚙ Admin → 🛡 Insurance claim help + the job's "Claim step ▾".
   Offline: the real portal.js runs here against an in-memory Supabase (gc_kv, gc_portal, gc_staff); Resend / Twilio are
   fakes; made-up people, jobs and carriers only (the mirror is read here for its carrier fields and its insurance jobs —
   nothing from it is printed). Nothing leaves this computer.
   SERVER: GrayCo's defaults (9 steps, 15–20 Q&A) and the legal care in their wording · which jobs (type, job.features,
           job.features missing → the type) · the published version only · admins edit / publish / reset, the office
           views · the step marker + the customer's note · no carrier name anywhere (job, claim, adjusting company, the
           well-known carriers, the mirror's carrier fields) · "Tell the customer" = a portal post on ✅ Approvals (held
           7 PM – 7 AM, never a text) · the mirror's insurance jobs.
   BROWSER (portal.html, 390 and 1280 wide): the section only on an insurance job with the feature on · the step marker ·
           the claim box · the Q&A accordion · "Ask us a question" → Messages · the footer · no carrier name in the DOM ·
           no "lawyer" text · screenshots · no page errors.
   CRM (index.html in the offline harness, the real portal.js behind it): ⚙ Admin → 🛡 Insurance claim help (DRAFT —
           for lawyer review, edit → publish → the portal shows it, reset, preview, view-only for a non-admin) · the job's
           "🛡 Claim step ▾" → saved on the job, "What the customer sees", "Tell the customer" → ✅ Approvals · screenshot ·
           no page errors. */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FNDIR = path.join(ROOT, 'netlify/functions');
const SHOTS = process.env.CLAIMHELP_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const PW = process.env.PLAYWRIGHT_DIR || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules/playwright/index.js';
const HARNESS = process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs';
const MIRROR = process.env.GC_MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';

let pass = 0, fail = 0;
function ok(c, m, info){ if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (info !== undefined ? '  ' + String(typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 600) : '')); } }
async function t(name, fn){ try { await fn(); } catch (e) { fail++; console.log('  ✗ FAIL ' + name + ' crashed: ' + (e && e.stack || e)); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tok = () => crypto.randomBytes(32).toString('base64url');

/* ═════════ the fake cloud (switchable to the harness's cloud for the CRM part) ═════════ */
const realNow = Date.now; let NOW = null; Date.now = () => NOW == null ? realNow() : NOW;
let tick = 0; const stamp = () => new Date(realNow() + (++tick)).toISOString();
const KVM = new Map();
let STORE = { get: k => KVM.get(k), set: (k, v) => KVM.set(k, { key: k, value: v, updated_at: stamp() }), has: k => KVM.has(k) };
const TABLES = { gc_portal: [], gc_staff: [] };
const SENT = { mail: [], sms: [] };
const AUTH = { 'tok-admin': 'wes.test@grayco-cs.com', 'tok-office': 'olivia.test@grayco-cs.com', 'tok-pm': 'steven.test@grayco-cs.com' };
const ROLES = { 'wes.test@grayco-cs.com': 'admin', 'olivia.test@grayco-cs.com': 'office', 'steven.test@grayco-cs.com': 'staff', 'wjohnson@grayco-cs.com': 'admin' };
const J = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0) });
function kvv(k){ const r = STORE.get(k); if (!r) return undefined; let v = r.value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; }
globalThis.fetch = async function(url, init = {}){
  const u = new URL(String(url)), m = (init.method || 'GET').toUpperCase();
  await new Promise(r => setImmediate(r));
  if (u.hostname === 'api.resend.com') { SENT.mail.push(JSON.parse(init.body || '{}')); return J(200, { id: 'm' }); }
  if (u.hostname === 'api.twilio.com') { SENT.sms.push(String(init.body || '')); return J(201, { sid: 'SM' }); }
  if (u.hostname !== 'sb.test') return J(404, {});
  if (u.pathname === '/auth/v1/user') {
    const b = String((init.headers || {}).Authorization || '').replace(/^Bearer /, '');
    const e = AUTH[b] || (/^utok-u-w-/.test(b) ? 'wjohnson@grayco-cs.com' : '');
    return e ? J(200, { email: e }) : J(401, {});
  }
  if (u.pathname === '/rest/v1/gc_staff') { const e = decodeURIComponent((u.searchParams.get('email') || '').replace(/^eq\./, '')); return J(200, ROLES[e] ? [{ email: e, role: ROLES[e], active: true, name: '' }] : []); }
  if (u.pathname === '/rest/v1/gc_kv') {
    const kq = u.searchParams.get('key') || '';
    if (m === 'GET') {
      let keys = [];
      if (kq.startsWith('in.(')) keys = decodeURIComponent(kq.slice(4, -1)).split(',').map(x => x.replace(/^"|"$/g, ''));
      else if (kq.startsWith('eq.')) keys = [decodeURIComponent(kq.slice(3))];
      return J(200, keys.filter(k => STORE.has(k)).map(k => { const r = STORE.get(k); return { key: k, value: r.value, updated_at: r.updated_at }; }));
    }
    if (m === 'POST') { const b = JSON.parse(init.body || '{}'); (Array.isArray(b) ? b : [b]).forEach(r => STORE.set(r.key, r.value)); return J(201, null); }
    return J(200, []);
  }
  const tm = /^\/rest\/v1\/(gc_portal)$/.exec(u.pathname);
  if (tm) {
    if (m === 'GET') { const tk = decodeURIComponent((u.searchParams.get('token') || '').replace(/^eq\./, '')); const pid = decodeURIComponent((u.searchParams.get('project_id') || '').replace(/^eq\./, ''));
      return J(200, TABLES.gc_portal.filter(r => (!tk || r.token === tk) && (!pid || r.project_id === pid))); }
    return J(200, []);
  }
  return J(200, []);
};
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'sb_secret_test_only', RESEND_API_KEY: 're_test_only' });
['CUST_QUIET_OFF', 'PORTAL_MAIL_OFF', 'PORTAL_TEXT_PROVIDER', 'OWNER_EMAILS', 'URL'].forEach(k => delete process.env[k]);
require(path.join(FNDIR, '_lib/pause.js')).install();
const portal = require(path.join(FNDIR, 'portal.js'));
const CH = require(path.join(FNDIR, '_lib/claimhelp.js'));
const C = portal._core;
const ev = (body, hd) => ({ httpMethod: 'POST', headers: Object.assign({ origin: 'https://crm.grayco-cs.com' }, hd || {}), body: JSON.stringify(body) });
async function call(body, hd){ C._reset(); const r = await portal.handler(ev(body, hd)); let d = {}; try { d = JSON.parse(r.body || '{}'); } catch (e) {} return { status: r.statusCode, data: d }; }
const staff = (who, body) => call(Object.assign({ action: 'claimhelp' }, body), { authorization: 'Bearer tok-' + who });
const viewFor = token => call({ action: 'view' }, { origin: 'https://portal.grayco-cs.com', 'x-portal-token': token });

/* ── the carrier names that must never reach the portal ── */
const SEEDED = ['Volunteer Mutual Test Co', 'Test Mutual', 'Acme Adjusting LLC', 'Riverbend TPA Services', 'Bluff City Casualty'];
const WELL_KNOWN = ['State Farm', 'Allstate', 'USAA', 'Liberty Mutual', 'Nationwide', 'Travelers', 'Progressive', 'Farmers Insurance', 'Erie Insurance', 'Tennessee Farmers', 'Auto-Owners', 'American Family', 'Chubb', 'Safeco', 'Homesite'];
let MIRROR_DATA = null; const MIRROR_CARRIERS = [];
try {
  if (fs.existsSync(MIRROR)) {
    MIRROR_DATA = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
    const seen = new Set();
    (function walk(o){
      if (Array.isArray(o)) { o.forEach(walk); return; }
      if (!o || typeof o !== 'object') return;
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string' && /carrier|insurer|insurancecompany|inscompany|insuranceco/i.test(k) && v.trim().length >= 3 && !/^(true|false)$/i.test(v)) seen.add(v.trim());
        else if (typeof v === 'string' && /^(v|value)$/.test(k) && v.length > 1 && /^[[{]/.test(v)) { try { walk(JSON.parse(v)); } catch (e) {} }
        else if (typeof v === 'string' && /text|body/i.test(k)) { const mm = /\bCarrier:\s*([A-Z][A-Za-z&.' -]{2,40}?)(?:,|\n|$)/.exec(v); if (mm) seen.add(mm[1].trim()); }
        else if (v && typeof v === 'object') walk(v);
      }
    })(MIRROR_DATA);
    seen.forEach(x => MIRROR_CARRIERS.push(x));
  }
} catch (e) { console.log('  (mirror not readable: ' + (e && e.message) + ')'); }
const CARRIERS = SEEDED.concat(WELL_KNOWN, MIRROR_CARRIERS);
const hasCarrier = txt => CARRIERS.filter(c => new RegExp('(^|[^a-z0-9])' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*') + '(?![a-z0-9])', 'i').test(txt));

/* ── the made-up world ── */
const USERS = [{ id: 'u1', name: 'Wes Admin', email: 'wes.test@grayco-cs.com', role: 'Admin', active: true }, { id: 'u2', name: 'Steven Park', email: 'steven.test@grayco-cs.com', role: 'Project Manager', active: true, phone: '9015550111' },
  { id: 'u3', name: 'Olivia Office', email: 'olivia.test@grayco-cs.com', role: 'Office', active: true }];
const PROJECTS = [
  { id: 'PJI', name: 'Ann Alpha Water Loss', type: 'Insurance Claim', isInsurance: true, client: 'Ann Alpha', clientEmail: 'ann@example.test', address: '1 Test St, Memphis TN', pm: 'Steven Park', status: 'Active',
    insCarrier: 'Volunteer Mutual Test Co', claimNumber: 'TST-2026-0042', dateOfLoss: '2026-10-02', adjusterName: 'Dana Reed', adjusterPhone: '901-555-0142', adjusterCompany: 'Acme Adjusting LLC', deductible: 1000,
    claimHelp: { step: 'inspected', note: 'The adjuster visit went well — Volunteer Mutual Test Co will send its estimate. Call State Farm? No need.', noteAt: '2026-10-28', at: '2026-10-28T15:00:00Z', by: 'Steven Park' } },
  { id: 'PJM', name: 'Bob Bravo Mitigation', type: 'Water Mitigation', client: 'Bob Bravo', clientEmail: 'bob@example.test', pm: 'Steven Park', status: 'Active' },
  { id: 'PJR', name: 'Cara Charlie Kitchen', type: 'Residential Reno', client: 'Cara Charlie', clientEmail: 'cara@example.test', pm: 'Steven Park', status: 'Active' },
  { id: 'PJF', name: 'Dan Delta Roof Claim', type: 'Insurance Claim', isInsurance: true, features: { claimHelp: false }, client: 'Dan Delta', pm: 'Steven Park', status: 'Active' },
  { id: 'PJX', name: 'Eve Echo Fire', type: 'Fire Damage', isInsurance: false, client: 'Eve Echo', pm: 'Steven Park', status: 'Active' },
  { id: 'PJS', name: 'Fay Foxtrot Storm', type: 'Insurance Claim', isInsurance: true, portalShowCarrier: true, portalShowAdjuster: true, auto: { showCarrier: true }, insCarrier: 'Bluff City Casualty', claimNumber: 'TST-77', deductible: 1500, mortgageCo: 'Delta Home Loans',
    insChecks: [{ id: 'ck1', amount: 4200, date: '2026-10-20', kind: 'First check (ACV)', status: 'to endorse', memo: 'Bluff City Casualty check' }], client: 'Fay Foxtrot', pm: 'Steven Park', status: 'Active' }
];
function world(){
  KVM.clear(); TABLES.gc_portal.length = 0; SENT.mail.length = 0; SENT.sms.length = 0;
  STORE.set('users', USERS); STORE.set('projects', JSON.parse(JSON.stringify(PROJECTS)));
  STORE.set('gc_claims', [{ id: 'CLI', projectId: 'PJI', carrier: 'Test Mutual', program: 'Riverbend TPA Services', adjuster: { name: 'Dana Reed', phone: '901-555-0142', company: 'Acme Adjusting LLC' }, claimNumber: 'TST-2026-0042', dateOfLoss: '2026-10-02', phase: 'Inspection' }]);
  STORE.set('projectDocs', [{ id: 'DS1', pid: 'PJS', name: 'Bluff City Casualty estimate.pdf', cat: 'Insurance', type: 'application/pdf', url: 'https://files.example.test/ds1.pdf', uploadedAt: '2026-10-20' },
    { id: 'DI1', pid: 'PJI', name: 'Test Mutual adjuster report.pdf', cat: 'Insurance', type: 'application/pdf', url: 'https://files.example.test/di1.pdf', uploadedAt: '2026-10-21' }]);
  STORE.set('gc_approval_queue', '[]'); STORE.set('gc_portal_auto_posts', '[]'); STORE.set('gc_automation_pause', { on: false }); STORE.set('gc_office_tasks', '[]');
}
const LINKS = {};
function link(pid){ const k = tok(); TABLES.gc_portal.push({ token: k, project_id: pid, revoked: false }); LINKS[pid] = k; return k; }

console.log('SERVER');
world(); ['PJI', 'PJM', 'PJR', 'PJF', 'PJX', 'PJS'].forEach(link);
await t('defaults', async () => {
  const d = CH.defaults();
  ok(d.steps.map(x => x.id).join(',') === 'filed,adj_sched,inspected,scope,supplement,approved,scheduled,work_done,final'.replace('work_done', 'complete'), 'GrayCo defaults: 9 steps in order (claim filed → … → final paperwork / depreciation released)', d.steps.map(x => x.title));
  ok(d.steps.every(x => x.you && x.us), 'every step says what the customer does and what GrayCo does');
  ok(d.qa.length >= 15 && d.qa.length <= 20, 'GrayCo defaults: ' + d.qa.length + ' questions & answers (15–20)');
  const want = [/do first after damage/i, /contractor my insurance/i, /adjuster do/i, /be there for the inspection/i, /deductible.*when do I pay/i, /depreciation/i, /supplement/i, /how long/i, /denied|too low/i, /agent or the adjuster/i, /photos/i, /before the adjuster/i, /check made out|mortgage/i, /paperwork/i, /reach GrayCo/i];
  ok(want.every(re => d.qa.some(x => re.test(x.q))), 'the owner’s example questions are all there', want.filter(re => !d.qa.some(x => re.test(x.q))).map(String));
});
await t('legal care in the default wording', async () => {
  const d = CH.defaults(), all = d.steps.map(x => x.title + ' ' + x.you + ' ' + x.us).concat(d.qa.map(x => x.q + ' ' + x.a), [d.intro, CH.FOOTER]);
  const neg = all.filter(x => /negotiat/i.test(x) && !/(do not|does not|cannot|not)\s+negotiate|negotiate your claim .*not|not a public adjuster/i.test(x));
  ok(!neg.length, 'never says GrayCo negotiates the claim (only "we do not negotiate your claim")', neg);
  const waive = all.filter(x => /(waiv|rebat|absorb|discount|cover|pay)\w*[^.]{0,40}deductible|deductible[^.]{0,60}(waiv|rebat|absorb)/i.test(x) && !/(does|do) not waive|Will GrayCo pay or cover my deductible\?/.test(x));
  ok(!waive.length, 'never offers to waive / rebate / absorb the deductible', waive);
  ok(d.qa.find(x => x.id === 'deductible').a.includes('You are responsible for your deductible') && d.qa.find(x => x.id === 'no_waive').a.startsWith('No.'), 'the homeowner is responsible for the deductible');
  ok(!all.some(x => /will be covered|insurance will pay for (it|this|everything)|we guarantee|guaranteed approval|we will get (it|your claim) approved/i.test(x)), 'never promises coverage');
  ok(all.filter(x => /ask your insurance company or agent|licensed (public adjuster|professional)|attorney/i.test(x)).length >= 4, 'coverage / legal questions → the insurance company or agent, or a licensed professional');
  ok(d.qa.some(x => /not a public adjuster/i.test(x.a)), 'says GrayCo is a contractor, not a public adjuster');
  ok(/documents? the damage/i.test(all.join(' ')) && /show the adjuster/i.test(all.join(' ')) && /estimate/i.test(all.join(' ')) && /scope/i.test(all.join(' ')), 'GrayCo documents damage, meets the adjuster to show it, provides estimates, communicates scope');
  ok(CH.FOOTER.startsWith('General information, not legal or insurance advice.'), 'footer: "General information, not legal or insurance advice."');
  ok(!all.some(x => /lawyer|DRAFT/.test(x)), 'no "DRAFT — for lawyer review" inside the text customers get');
  ok(!hasCarrier(all.join(' \n ')).length, 'no carrier name in the defaults', hasCarrier(all.join(' ')));
});
await t('which jobs', async () => {
  const E = (p, d) => CH.eligible(p, d || {});
  ok(E({ id: 'a', type: 'Insurance Claim' }) && E({ id: 'b', type: 'Water Damage', isInsurance: true }) && E({ id: 'c', type: 'Fire Damage', isInsurance: true }) && E({ id: 'd', type: 'Water Mitigation' }) && E({ id: 'e', type: 'Restoration' }), 'insurance / restoration / mitigation jobs: on (job.features missing → the type)');
  ok(!E({ id: 'f', type: 'Residential Reno' }) && !E({ id: 'g', type: 'Commercial TI' }) && !E({ id: 'h', type: 'New Construction' }), 'regular and commercial jobs: off');
  ok(!E({ id: 'i', type: 'Fire Damage', isInsurance: false }), 'a job marked "not insurance" by hand: off');
  ok(!E({ id: 'j', type: 'Insurance Claim', features: { claimHelp: false } }) && E({ id: 'k', type: 'Insurance Claim', features: { claimHelp: true } }) && E({ id: 'l', type: 'Insurance Claim', features: { otherThing: true } }), 'job.features.claimHelp decides when set; other features leave the default ON');
  ok(!E({ id: 'm', type: 'Residential Reno', features: { claimHelp: true } }), 'the feature alone does not make a regular job an insurance job');
  ok(E({ id: 'n', type: 'Residential Reno' }, { gc_claims: [{ projectId: 'n' }] }) && !E({ id: 'o', type: 'Residential', claimNumber: 'X1' }), 'a job with a claim record counts; a regular job with only a claim number does not (INSP rule: its claim number is never shown)');
  ok(E({ id: 'p', type: 'Insurance Claim', features: ['claimHelp'] }) && !E({ id: 'q', type: 'Insurance Claim', features: ['estPdf'] }), 'job.features as a list of what is on');
});
let V = null;
await t('the portal view', async () => {
  const r = await viewFor(LINKS.PJI); V = r.data;
  ok(r.status === 200 && V.claimHelp && V.claimHelp.steps.length === 9, 'insurance job: view.claimHelp with the 9 steps', { status: r.status, ch: !!V.claimHelp });
  const ch = V.claimHelp || {};
  ok(ch.now === 2 && ch.steps[2].state === 'now' && ch.steps[0].state === 'done' && ch.steps[3].state === 'todo' && ch.nowTitle === 'Inspection done', 'the step marker: "Inspection done" is now (staff set it), the ones before are done', { now: ch.now, states: (ch.steps || []).map(x => x.state) });
  ok(/adjuster visit went well/.test(ch.note) && ch.noteAt === '2026-10-28', 'the customer sees staff’s note', ch.note);
  ok(ch.claim.number === 'TST-2026-0042' && ch.claim.dateOfLoss === '2026-10-02' && ch.claim.adjuster && ch.claim.adjuster.name === 'Dana Reed' && ch.claim.adjuster.phone === '901-555-0142', 'claim number, date of loss, adjuster name / phone (staff entered them)', ch.claim);
  ok(ch.qa.length === CH.defaults().qa.length && ch.footer === CH.FOOTER, 'Q&A (GrayCo defaults until an admin publishes) + the footer');
  ok(!hasCarrier(JSON.stringify(ch)).length && /your insurance company will send its estimate/.test(ch.note), 'no carrier name in the section — even the one staff typed in the note became “your insurance company”', hasCarrier(JSON.stringify(ch)));
  ok(!hasCarrier(JSON.stringify(V)).length, 'no carrier name anywhere in the whole portal view of this job', hasCarrier(JSON.stringify(V)));
  ok(!/lawyer|DRAFT/.test(JSON.stringify(V)), 'no "DRAFT — for lawyer review" in the portal');
  const m = (await viewFor(LINKS.PJM)).data;
  ok(m.claimHelp && m.claimHelp.now === -1 && !m.insurance, 'a mitigation job (not marked insurance): the section, no marker until staff set one', { ch: !!m.claimHelp, now: m.claimHelp && m.claimHelp.now });
  ok(!(await viewFor(LINKS.PJR)).data.claimHelp, 'a regular job: no section');
  ok(!(await viewFor(LINKS.PJF)).data.claimHelp, 'an insurance job with "Insurance claim help steps" off: no section');
  ok(!(await viewFor(LINKS.PJX)).data.claimHelp, 'a fire job marked "not insurance": no section');
  const sv = (await viewFor(LINKS.PJS)).data;
  ok(sv.claimHelp && !hasCarrier(JSON.stringify(sv.claimHelp)).length, 'owner rule: even with "Show carrier name" on, the claim help section never has the carrier', hasCarrier(JSON.stringify(sv.claimHelp || {})));
  ok(sv.claimHelp && sv.claimHelp.auto === true && sv.claimHelp.now >= 0, 'no step set yet on an insurance job: the marker follows the claim automatically', { now: sv.claimHelp && sv.claimHelp.now });
});
await t('owner 11/01: carrier names never shown anywhere in the portal (even with "Show carrier name" ON)', async () => {
  const v = (await viewFor(LINKS.PJS)).data;
  ok(v.insurance && v.insurance.claim.companyShown === false && v.insurance.claim.company === 'your insurance company', 'the insurance claim box: "your insurance company" although the job’s switch and ⚡ Automations say show', v.insurance && v.insurance.claim);
  ok(!hasCarrier(JSON.stringify(v)).length, 'no carrier name anywhere in the whole view (claim box, papers, checks, claim help)', hasCarrier(JSON.stringify(v)));
  ok((v.docs || []).some(d => /your insurance company estimate/i.test(d.title)), 'a paper named after the carrier reaches the portal as “your insurance company estimate”', (v.docs || []).map(d => d.title));
  const r = (await viewFor(LINKS.PJR)).data;   /* a regular job's view too */
  ok(!hasCarrier(JSON.stringify(r)).length, 'a regular job: no carrier either');
});
await t('adjuster: shown by default when entered; a per-job "hide adjuster"', async () => {
  const base = { id: 'x', type: 'Insurance Claim', adjusterName: 'Dana Reed', adjusterPhone: '901-555-0142' };
  ok(!!CH.view(CH.defaults(), base, {}).claim.adjuster, 'shown by default');
  ok(CH.view(CH.defaults(), Object.assign({}, base, { claimHelp: { hideAdjuster: true } }), {}).claim.adjuster === null, 'claimHelp.hideAdjuster → hidden');
  ok(CH.view(CH.defaults(), Object.assign({}, base, { portalShowAdjuster: false }), {}).claim.adjuster === null, 'the 🛡 Insurance portal panel’s adjuster switch turned off → hidden too');
});
await t('staff: who may read and write', async () => {
  ok((await call({ action: 'claimhelp', op: 'get' })).status === 401, 'not signed in → 401');
  const og = await staff('office', { op: 'get' });
  ok(og.status === 200 && og.data.canEdit === false && og.data.draft.steps.length === 9, 'the office can view (canEdit false)');
  const os = await staff('office', { op: 'save', draft: CH.defaults() });
  ok(os.status === 403 && os.data.viewOnly === true, 'the office cannot change it (403)', os);
  ok((await staff('pm', { op: 'publish', draft: CH.defaults() })).status === 403 && (await staff('pm', { op: 'reset' })).status === 403, 'a PM cannot publish or reset');
  const ag = await staff('admin', { op: 'get' });
  ok(ag.status === 200 && ag.data.canEdit === true && ag.data.publishedIsDefault === true, 'an admin can edit; nothing published yet = GrayCo defaults');
  ok(ag.data.draft.steps.every(x => x.lawyerDraft === true) && ag.data.draft.qa.every(x => x.lawyerDraft === true) && ag.data.lawyerNote === 'DRAFT — for lawyer review', 'the editor gets every default marked "DRAFT — for lawyer review"');
});
await t('admin edits → draft → publish → the portal; reset', async () => {
  const d = CH.defaults();
  d.qa[0].a = 'CLAIMHELP-EDIT: make everyone safe first, then call us.';
  d.qa.push({ id: 'new_one', q: 'Can I stay in my home during the work?', a: 'Usually yes — your Project Manager tells you which rooms to keep clear.' });
  d.steps[4].hidden = true;
  const s1 = await staff('admin', { op: 'save', draft: d });
  ok(s1.status === 200 && s1.data.unpublished === true && s1.data.draft.qa[0].lawyerDraft === false && s1.data.draft.qa[1].lawyerDraft === true, 'Save draft: stored; the edited answer is no longer tagged, the rest still are', { st: s1.status, u: s1.data.unpublished });
  let v = (await viewFor(LINKS.PJI)).data.claimHelp;
  ok(!/CLAIMHELP-EDIT/.test(JSON.stringify(v)) && v.steps.length === 9, 'the portal still shows the published version (a draft is never shown)');
  const conflict = await staff('admin', { op: 'save', draft: d, base: 'an-old-version' });
  ok(conflict.status === 409 && conflict.data.conflict === true, 'two admins at once: the older save is refused (409) and reloaded');
  const p1 = await staff('admin', { op: 'publish', base: s1.data.savedAt });
  ok(p1.status === 200 && p1.data.unpublished === false && p1.data.publishedBy === 'wes.test@grayco-cs.com', 'Publish', { st: p1.status, by: p1.data.publishedBy });
  v = (await viewFor(LINKS.PJI)).data.claimHelp;
  ok(v.qa[0].a.startsWith('CLAIMHELP-EDIT') && v.qa.some(x => /stay in my home/.test(x.q)) && v.steps.length === 8 && !v.steps.some(x => x.id === 'supplement'), 'the portal shows the published edit, the added question, and not the hidden step', { n: v.steps.length });
  ok(v.now === 2 && v.steps[2].id === 'inspected', 'the job’s marker still points at its step after the list changed');
  const r1 = await staff('admin', { op: 'reset' });
  ok(r1.status === 200 && JSON.stringify(CH.clean(r1.data.draft)) === JSON.stringify(CH.clean(CH.defaults())) && r1.data.unpublished === true, 'Reset to GrayCo defaults: the draft is the defaults again (published stays until Publish)');
  v = (await viewFor(LINKS.PJI)).data.claimHelp;
  ok(v.qa[0].a.startsWith('CLAIMHELP-EDIT'), '…customers still see the published version until Publish');
  await staff('admin', { op: 'publish' });
  v = (await viewFor(LINKS.PJI)).data.claimHelp;
  ok(v.qa[0].a === CH.defaults().qa[0].a && v.steps.length === 9 && v.qa.length === CH.defaults().qa.length, 'Publish after reset: the portal shows GrayCo’s defaults again');
  const bad = await staff('admin', { op: 'save', draft: { steps: [{ title: '<b>x</b>'.repeat(50), you: 'y'.repeat(5000) }], qa: [{ q: 'q', a: '' }, { q: '', a: 'a' }] } });
  ok(bad.status === 200 && bad.data.draft.steps[0].title.length <= 90 && bad.data.draft.steps[0].you.length <= 800 && bad.data.draft.qa.length === 0, 'what an admin sends is cleaned (lengths, empty Q&A dropped)');
  await staff('admin', { op: 'reset' });
});
await t('preview (staff only)', async () => {
  const pv = await staff('office', { op: 'preview', which: 'draft', job: { type: 'Insurance Claim', claimNumber: 'SAMPLE-1', claimHelp: { step: 'scope', note: 'Sample' }, insCarrier: 'Test Mutual' } });
  ok(pv.status === 200 && pv.data.eligible === true && pv.data.view.nowTitle === 'Estimate / scope received' && pv.data.view.claim.number === 'SAMPLE-1' && !hasCarrier(JSON.stringify(pv.data.view)).length, 'Preview as customer (the office may): the card for a sample job, no carrier', pv.data.view && pv.data.view.nowTitle);
  const pj = await staff('pm', { op: 'preview', projectId: 'PJI', job: { claimHelp: { step: 'approved', note: 'n' } } });
  ok(pj.status === 200 && pj.data.view.nowTitle === 'Approved' && pj.data.view.claim.number === 'TST-2026-0042', 'the job’s "What the customer sees": the cloud job + the step just picked on this computer');
  ok((await call({ action: 'claimhelp', op: 'preview' }, { origin: 'https://portal.grayco-cs.com', 'x-portal-token': LINKS.PJI })).status === 401, 'a customer link cannot use the staff actions');
});
await t('"Tell the customer" → ✅ Approvals (never by itself, held at night, never a text)', async () => {
  const before = SENT.mail.length + SENT.sms.length;
  const n1 = await staff('pm', { op: 'notify', projectId: 'PJI', step: 'inspected', note: 'State Farm and Test Mutual said hi.' });
  const q = kvv('gc_approval_queue') || [];
  const it = q.find(x => x.id === n1.data.id);
  ok(n1.status === 200 && it && it.kind === 'portal_post' && it.status === 'waiting' && it.channel === 'portal', 'queued as a portal post, waiting for approval', { st: n1.status, it: it && { k: it.kind, s: it.status } });
  ok(it && /Update on your insurance claim: Inspection done\./.test(it.meta.postText) && !hasCarrier(it.meta.postText + it.subject + it.text).length && it.meta.source === 'claimhelp', 'the post: the step in plain words; carriers → "your insurance company"', it && it.meta.postText);
  ok(!(kvv('gc_portal_auto_posts') || []).length && SENT.mail.length + SENT.sms.length === before && !it.meta.sms, 'nothing reached the customer yet; no text is ever attached');
  NOW = Date.parse('2026-11-03T02:00:00Z');   /* 8 PM Central */
  const a1 = await C.approvalAction({ op: 'approve', id: it.id }, { email: 'wes.test@grayco-cs.com', role: 'admin', name: 'Wes Admin' });
  const it2 = (kvv('gc_approval_queue') || []).find(x => x.id === it.id);
  ok(a1.status === 200 && it2.status === 'scheduled' && !(kvv('gc_portal_auto_posts') || []).length, 'approved at 8 PM → scheduled for 7 AM (CUSTQUIET), not on the portal yet', { st: a1.status, s: it2 && it2.status });
  NOW = Date.parse('2026-11-03T18:00:00Z');   /* noon */
  const n2 = await staff('pm', { op: 'notify', projectId: 'PJI', step: 'scope' });
  const a2 = await C.approvalAction({ op: 'approve', id: n2.data.id }, { email: 'wes.test@grayco-cs.com', role: 'admin', name: 'Wes Admin' });
  const posts = kvv('gc_portal_auto_posts') || [];
  ok(a2.status === 200 && posts.length === 1 && /Estimate \/ scope received/.test(posts[0].text) && SENT.sms.length === 0, 'approved at noon → on the portal; no text message', { st: a2.status, n: posts.length });
  NOW = null;
  ok((await staff('pm', { op: 'notify', projectId: 'PJI', step: 'nope' })).status === 400, 'an unknown step is refused');
});
await t('the mirror’s insurance jobs', async () => {
  if (!MIRROR_DATA) { ok(true, '(mirror not on this computer — skipped)'); return; }
  const saved = new Map(KVM); KVM.clear(); TABLES.gc_portal.length = 0;
  for (const r of MIRROR_DATA) if (r && r.key && !/^_probe_/.test(r.key)) KVM.set(r.key, { key: r.key, value: r.v, updated_at: r.updated_at || stamp() });
  const projs = kvv('projects') || [];
  const ins = projs.filter(p => CH.insuranceType(p, {})), reg = projs.filter(p => !CH.insuranceType(p, {})).slice(0, 25);
  let shown = 0, leaks = [], wrong = 0;
  for (const p of ins) { const k = link(p.id); const v = (await viewFor(k)).data; if (v.claimHelp) shown++; const hit = hasCarrier(JSON.stringify(v.claimHelp || {})); if (hit.length) leaks.push(hit); }
  for (const p of reg) { const v = (await viewFor(link(p.id))).data; if (v.claimHelp) wrong++; }
  ok(ins.length > 0 && shown === ins.filter(p => CH.eligible(p, {})).length, 'mirror: the section on each of its ' + ins.length + ' insurance / restoration jobs (' + shown + ' shown)');
  ok(!wrong, 'mirror: none on ' + reg.length + ' regular / commercial jobs');
  ok(!leaks.length, 'mirror: no carrier name (' + CARRIERS.length + ' names checked, ' + MIRROR_CARRIERS.length + ' from the mirror’s carrier fields and claim e-mails) in any of them', leaks.length);
  KVM.clear(); saved.forEach((v, k) => KVM.set(k, v)); TABLES.gc_portal.length = 0; Object.keys(LINKS).forEach(k => delete LINKS[k]); ['PJI', 'PJM', 'PJR', 'PJF', 'PJX', 'PJS'].forEach(link);
});
await t('files', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'portal.html'), 'utf8');
  ok(html.includes('<script src="/portal-claimhelp.js"></script>') && /function chCard\(\)/.test(html), 'portal.html loads portal-claimhelp.js and draws the card on Home');
  ok(!/^(<<<<<<<|=======|>>>>>>>)/m.test(html), 'portal.html: no leftover merge markers');
  const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  ok(toml.indexOf('portal.grayco-cs.com/portal-claimhelp.js') > 0 && toml.indexOf('portal.grayco-cs.com/portal-claimhelp.js') < toml.indexOf('from = "https://portal.grayco-cs.com/*"'), 'netlify.toml serves /portal-claimhelp.js on the portal host (before the catch-all)');
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(idx.split('/* patch CLAIMHELP */').length === 2 && idx.includes('<script id="gc-patch-claimhelp">'), 'index.html: patch CLAIMHELP applied once');
  ok(!/lawyer/i.test(fs.readFileSync(path.join(ROOT, 'portal-claimhelp.js'), 'utf8')) && !/lawyer/i.test(html), 'the portal files never say "lawyer"');
  const NEW = 'thoroughly documenting the damage, meeting with the adjuster, and providing detailed estimates and supporting documentation so the claim can be fully reviewed for approval';
  const bad = /negotiating, and securing approval|secures approval of my\/our|securing the approved claim|claim approval work|work directly with your insurance carrier on your behalf|we work with your insurance company for you|help you through your insurance claim from start to finish|We handle claims every week|We help with claims every week|We help with your insurance claim from|We work with your insurance from start to finish/;
  ok(html.split(NEW).length === 2 && idx.split(NEW).length === 17 && !bad.test(html) && !bad.test(idx), 'owner 11/01: the O&P clause says documenting / meeting the adjuster / estimates (portal 1, CRM 16) — no negotiating, no "GrayCo secures approval"');
  const srv = ['netlify/functions/_lib/mkt-content.js', 'netlify/functions/_lib/soc-content.js', 'netlify/functions/_lib/mkt2.js', 'netlify/functions/portal.js', 'netlify/functions/portal-sign.js', 'portal-claimhelp.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  ok(!bad.test(srv), 'the e-mail / social / ad templates no longer say GrayCo works the claim for the customer');
  const claimNeg = (html + srv).split('\n').filter(l => /negotiat/i.test(l) && /claim|insur|adjust/i.test(l) && !/(does|do) not (adjust, )?negotiate|not negotiate|no negotiating|not negotiating|never negotiat|NEVER|owner 11\/01|negotiating\)|estimat\|sent\|negotiat|negotiat\\w|Negotiating/.test(l));
  ok(!claimNeg.length, 'no customer-facing line says GrayCo negotiates a claim', claimNeg.map(l => l.trim().slice(0, 160)));
  ok(/DRAFT — for lawyer review: O&P clause and the insurance-claim wording/.test(idx) && /Admin note: DRAFT — for lawyer review — O&P clause/.test(idx) && !/for lawyer review/.test(html), 'the changed legal text is marked "DRAFT — for lawyer review" in the admin notes only (never in the portal)');
  ok(idx.includes("ck('carrier', false, 'Show carrier name to customer', 'GrayCo never shows the insurance company’s name to customers.") && idx.includes("nev = k === 'showCarrier'"), 'CRM: both "show carrier" switches are disabled with "GrayCo never shows the insurance company’s name to customers."');
});

/* ═════════ BROWSER: portal.html ═════════ */
let ERRS = [];
if (!process.argv.includes('--no-browser')) {
  console.log('BROWSER (portal)');
  const { chromium } = require(PW);
  const PORT = 19000 + Math.floor(Math.random() * 900), ORIGIN = 'http://127.0.0.1:' + PORT;
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', c => { body += c; }); req.on('end', async () => {
      const u = new URL(req.url, ORIGIN); const Jr = (o, st) => { res.writeHead(st || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (u.pathname.startsWith('/.netlify/functions/')) {
        let b = {}; try { b = JSON.parse(body || '{}'); } catch (e) {}
        const fn = u.pathname.split('/').pop(), tk = req.headers['x-portal-token'] || '';
        if (fn === 'portal') { C._reset(); const r = await portal.handler({ httpMethod: 'POST', headers: { origin: 'https://portal.grayco-cs.com', 'x-portal-token': tk }, body: body || '{}' }); res.writeHead(r.statusCode, { 'Content-Type': 'application/json' }); res.end(r.body); return; }
        if (fn === 'portal-access') { if (b.action === 'open') return Jr({ ok: true, kind: 'customer' }); if (b.action === 'c-msgs') return Jr({ ok: true, messages: [] }); return Jr({ ok: false }); }
        return Jr({ ok: false });
      }
      let f = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/portal.html' : u.pathname));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) f = path.join(ROOT, 'portal.html');
      const ext = path.extname(f); const ct = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg' }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': ct + (/text|json|javascript/.test(ct) ? '; charset=utf-8' : '') }); fs.createReadStream(f).pipe(res);
    });
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1'] });
  async function open(pid, width){
    const ctx = await browser.newContext(width < 600 ? { viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width, height: 900 } });
    const pg = await ctx.newPage(); pg.on('pageerror', e => ERRS.push(pid + '@' + width + ': ' + e.message));
    await pg.goto(ORIGIN + '/portal.html#t=' + LINKS[pid]); await pg.waitForSelector('#tabs:not([hidden])', { timeout: 15000 }); await sleep(1200);
    return { ctx, pg };
  }
  async function domCarriers(pg){
    const txt = await pg.evaluate(() => {
      const out = [document.body.innerText];
      document.querySelectorAll('*').forEach(e => { for (const a of e.attributes || []) if (!/^(on|style$)/.test(a.name)) out.push(a.value); if ('value' in e && typeof e.value === 'string') out.push(e.value); });
      document.querySelectorAll('details').forEach(d => out.push(d.textContent));
      return out.join('\n');
    });
    return hasCarrier(txt);
  }
  await t('portal 390', async () => {
    const { ctx, pg } = await open('PJI', 390);
    ok(!!(await pg.$('#gc-claimhelp')), 'insurance job: "🛡 Your insurance claim" on Home');
    const r = await pg.evaluate(() => { const b = document.getElementById('gc-claimhelp'); const now = b.querySelector('.gch-step[data-state="now"]');
      return { h2: b.querySelector('h2').textContent, steps: b.querySelectorAll('.gch-step').length, done: b.querySelectorAll('.gch-step[data-state="done"]').length, nowT: now && now.querySelector('.gch-t').textContent, here: now && !!now.querySelector('.gch-here'), open: now && now.open,
        heres: b.querySelectorAll('.gch-here').length, nowBody: now && now.querySelector('.gch-body').innerText, pill: b.querySelector('[data-gch=pill]').textContent, note: (b.querySelector('[data-gch=note]') || {}).innerText || '', claim: b.querySelector('[data-gch=claim]').innerText,
        qa: b.querySelectorAll('.gch-qa details').length, foot: b.querySelector('[data-gch=footer]').textContent, oldClaim: !!document.getElementById('claim'), oldTrack: !!document.getElementById('insTrack'), body: document.body.innerText }; });
    ok(r.h2 === '🛡 Your insurance claim' && r.steps === 9, 'the title and the 9 steps', r);
    ok(r.nowT === 'Inspection done' && r.here && r.open && r.heres === 1 && r.done === 2 && /Now: Inspection done/.test(r.pill), 'the step marker: "You are here" on Inspection done (open), 2 steps done', r);
    ok(/What you do/i.test(r.nowBody) && /What GrayCo does/i.test(r.nowBody), 'the current step says what you do and what GrayCo does');
    ok(/A note from GrayCo/i.test(r.note) && /adjuster visit went well/.test(r.note), 'staff’s note');
    ok(/TST-2026-0042/.test(r.claim) && /Oct 2, 2026/.test(r.claim) && /Dana Reed · 901-555-0142/.test(r.claim) && /Your insurance company/.test(r.claim), 'the claim box: number, date of loss, adjuster, "Your insurance company"', r.claim);
    ok(r.qa === CH.defaults().qa.length, 'Questions & answers: ' + r.qa);
    ok(r.foot.startsWith('General information, not legal or insurance advice.'), 'the footer');
    ok(!r.oldClaim && !r.oldTrack, 'one set of claim steps on Home (the automatic claim box / timeline make way)');
    ok(!/lawyer|DRAFT/.test(r.body), 'no "DRAFT — for lawyer review" in the portal');
    const q = pg.locator('#gc-claimhelp .gch-qa details').nth(5);
    ok(!(await q.evaluate(d => d.open)), 'answers start closed');
    await q.locator('summary').click(); await sleep(200);
    ok(await q.evaluate(d => d.open && d.querySelector('.gch-a').getBoundingClientRect().height > 10), 'tap a question → its answer opens (accordion)');
    const st0 = pg.locator('#gc-claimhelp .gch-step').nth(0); await st0.locator('summary').click(); await sleep(150);
    ok(await st0.evaluate(d => d.open), 'tap a step → what you do / what GrayCo does');
    await st0.locator('summary').click(); await q.locator('summary').click(); await sleep(150);
    const found = await domCarriers(pg);
    ok(!found.length, 'no carrier name anywhere in the portal DOM (' + CARRIERS.length + ' names, incl. the mirror’s carrier fields)', found);
    const el = await pg.$('#gc-claimhelp'); await el.screenshot({ path: SHOTS + '/claimhelp_portal_390.png' });
    await pg.click('#gch-ask'); await sleep(600);
    ok(await pg.evaluate(() => document.querySelector('#tabs button[data-tab="msgs"]').getAttribute('aria-selected') === 'true' && !!document.getElementById('cMsgList')), '"Ask us a question" → Messages');
    await ctx.close();
  });
  await t('portal 1280', async () => {
    const { ctx, pg } = await open('PJI', 1280);
    ok(await pg.evaluate(() => { const b = document.getElementById('gc-claimhelp'); return !!b && !!b.closest('.col-r'); }), 'computer: the section in the right column');
    const el = await pg.$('#gc-claimhelp'); await el.screenshot({ path: SHOTS + '/claimhelp_portal_1280.png' });
    await pg.screenshot({ path: SHOTS + '/claimhelp_portal_1280_page.png' });
    ok(!(await domCarriers(pg)).length, 'no carrier name in the DOM (1280)');
    await ctx.close();
  });
  await t('portal: which jobs', async () => {
    for (const [pid, want, what] of [['PJM', true, 'a mitigation job'], ['PJR', false, 'a regular job'], ['PJF', false, 'an insurance job with the feature off'], ['PJS', true, 'an insurance job with "Show carrier name" on']]) {
      const { ctx, pg } = await open(pid, 390);
      const has = !!(await pg.$('#gc-claimhelp'));
      ok(has === want, what + ': ' + (want ? 'the section' : 'no section'));
      if (pid === 'PJM') ok(await pg.evaluate(() => !!document.querySelector('ol.steps') && !document.querySelector('#gc-claimhelp .gch-here') && /marks where your claim is/.test(document.getElementById('gc-claimhelp').innerText)), 'mitigation job: the job steps stay; no marker until staff set one');
      if (pid === 'PJS') {
        const seen = {};
        for (const tab of ['home', 'photos', 'docs', 'pay', 'msgs']) { await pg.click('#tabs button[data-tab="' + tab + '"]'); await sleep(900); seen[tab] = await domCarriers(pg); }
        ok(Object.values(seen).every(x => !x.length), '"Show carrier name" ON: no carrier name on Home, Photos, Documents, Payments or Messages', seen);
        await pg.click('#tabs button[data-tab="docs"]'); await sleep(600);
        ok(/your insurance company estimate/i.test(await pg.evaluate(() => document.body.innerText)), '…the carrier-named paper shows as “your insurance company estimate”');
        await pg.click('#tabs button[data-tab="home"]'); await sleep(400);
        const wide = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const pw = await wide.newPage(); pw.on('pageerror', e => ERRS.push('PJS@1280: ' + e.message));
        await pw.goto(ORIGIN + '/portal.html#t=' + LINKS.PJS); await pw.waitForSelector('#tabs:not([hidden])', { timeout: 15000 }); await sleep(1200);
        const seenW = {}; for (const tab of ['home', 'docs', 'pay']) { await pw.click('#tabs button[data-tab="' + tab + '"]'); await sleep(800); seenW[tab] = await domCarriers(pw); }
        ok(Object.values(seenW).every(x => !x.length), '…and on a computer (1280): Home, Documents, Payments', seenW);
        await wide.close();
      }
      await ctx.close();
    }
  });
  ok(!ERRS.length, 'no page errors (portal)', ERRS);
  await browser.close(); server.close();
}

/* ═════════ CRM: index.html in the offline harness, the real portal.js behind /.netlify/functions/portal ═════════ */
if (!process.argv.includes('--no-browser') && !process.argv.includes('--no-crm')) {
  console.log('CRM');
  const H = await import(pathToFileURL(HARNESS).href);
  const { computer, signIn, cset, cget, cloud, resetCloud } = H;
  resetCloud();
  STORE = { get: k => cloud.get(k), set: (k, v) => cset(k, v), has: k => cloud.has(k) };
  const crmUsers = [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u2', name: 'Steven Park', email: 'steven.test@grayco-cs.com', role: 'Project Manager', active: true }];
  cset('users', crmUsers);
  cset('projects', [
    { id: 'PCI', name: 'Gina Golf Water Loss', type: 'Insurance Claim', isInsurance: true, client: 'Gina Golf', clientEmail: 'gina@example.test', address: '7 Test Ave, Memphis TN', pm: 'Steven Park', status: 'Active', contract: 12000, autoPO: 'C701', created: '2026-10-01', claimNumber: 'TST-555', dateOfLoss: '2026-09-28', insCarrier: 'Volunteer Mutual Test Co', portalShowCarrier: true, portalUrl: 'https://portal.grayco-cs.com/portal.html#t=' + 'A'.repeat(43) },
    { id: 'PCR', name: 'Hank Hotel Deck', type: 'Residential Reno', client: 'Hank Hotel', pm: 'Steven Park', status: 'Active', contract: 8000, autoPO: 'C702', created: '2026-10-01' }]);
  cset('gc_approval_queue', '[]'); cset('gc_portal_auto_posts', '[]'); cset('gc_automation_pause', { on: false });
  const A = await computer('CH', { build: ROOT });
  const CERR = () => A.errs.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|Load failed/.test(e));
  await A.ctx.route(/\/\.netlify\/functions\/portal(\?|$)/, async r => {
    const req = r.request(); const hd = req.headers();
    C._reset();
    const out = await portal.handler({ httpMethod: req.method(), headers: { origin: 'https://crm.grayco-cs.com', authorization: hd['authorization'] || '' }, body: req.postData() || '{}' });
    return r.fulfill({ status: out.statusCode, contentType: 'application/json', body: out.body });
  });
  await t('CRM', async () => {
    await signIn(A, 'wjohnson@grayco-cs.com', 12000);
    const p = A.page();
    await H.waitFor(A, () => !!window.__GC_PATCH_CLAIMHELP__ && window._crm && (window._crm.projects || []).length >= 2, null, 60000);
    ok(await A.ev(() => !!window._gcClaimHelp && typeof window._gcClaimHelp.open === 'function'), 'patch CLAIMHELP loaded (_gcClaimHelp)');
    /* ⚙ Admin → 🛡 Insurance claim help */
    await A.ev(() => window._setView('admin')); await sleep(2500);
    await A.ev(() => window._gcClaimHelp.open());
    await H.waitFor(A, () => !!document.querySelector('[data-gcch-admin] [data-step]'), null, 20000);
    const a = await A.ev(() => { const b = document.querySelector('[data-gcch-admin]'); return { steps: b.querySelectorAll('[data-step]').length, qa: b.querySelectorAll('[data-qa]').length, banner: (b.querySelector('[data-gcch-banner]') || {}).innerText || '', tags: b.querySelectorAll('[data-gcch-lawyer]').length,
      btns: [...b.querySelectorAll('button[data-a]')].map(x => x.textContent.trim()), hub: !!b.closest('#gc-adm-hub'), title: ((b.closest('[data-adm-open]') || {}).innerText || '').slice(0, 60) }; });
    ok(a.hub && /Insurance claim help/.test(a.title) && a.steps === 9 && a.qa === CH.defaults().qa.length, '⚙ Admin → 🛡 Insurance claim help: the 9 steps and the Q&A, in the admin settings', a);
    ok(/DRAFT — for lawyer review/.test(a.banner) && a.tags >= 9 + CH.defaults().qa.length, 'the default text is marked "DRAFT — for lawyer review" (banner + every default item) — in the editor only', { tags: a.tags });
    ok(['💾 Save draft', '✅ Publish to customer portals', '👁 Preview as customer', '↺ Reset to GrayCo defaults'].every(x => a.btns.includes(x)) && a.btns.includes('↑') && a.btns.includes('Remove'), 'Save / Publish / Preview / Reset, ↑ ↓, Hide, Remove', a.btns);
    await p.locator('[data-gcch-admin]').screenshot({ path: SHOTS + '/claimhelp_admin_editor.png' });
    await p.locator('[data-gcch-admin] [data-qa="0"] textarea').fill('CRM-EDIT: get everyone safe, then call GrayCo at 901-585-0944.');
    await p.locator('[data-gcch-admin] [data-qa="1"] button[data-a="up"]').click(); await sleep(200);
    ok(await A.ev(() => window._gcClaimHelp.draft().qa[0].id === 'choose' && window._gcClaimHelp.draft().qa[1].a.startsWith('CRM-EDIT')), 'edit an answer and move a question up (↑)');
    await p.locator('[data-gcch-admin] button[data-a="add"][data-l="qa"]').click(); await sleep(300);
    await p.locator('[data-gcch-admin] [data-qa]').last().locator('input[data-k$=".q"]').fill('Is the CRM editor working?');
    await p.locator('[data-gcch-admin] [data-qa]').last().locator('textarea').fill('Yes — this answer was added in the CRM.');
    await p.locator('[data-gcch-admin] [data-step="4"] input[data-k="steps.4.hidden"]').check(); await sleep(300);
    await p.locator('[data-gcch-admin] button[data-a="publish"]').first().click();
    await H.waitFor(A, () => { const s = window._gcClaimHelp.state(); return !s.dirty && /Published/.test((document.querySelector('[data-gcch-status]') || {}).textContent || ''); }, null, 15000);
    const st = kvv('gc_claim_help') || {};
    ok(st.published && st.published.qa[1].a.startsWith('CRM-EDIT') && st.published.qa.some(x => x.q === 'Is the CRM editor working?') && st.published.steps[4].hidden === true && st.publishedBy === 'wjohnson@grayco-cs.com', 'Publish from the CRM → stored in the one settings key (gc_claim_help.published)', st.published && st.published.qa.slice(0, 2));
    TABLES.gc_portal.push({ token: 'B'.repeat(43), project_id: 'PCI', revoked: false });
    let pv = (await viewFor('B'.repeat(43))).data.claimHelp;
    ok(pv && pv.qa[1].a.startsWith('CRM-EDIT') && pv.qa.some(x => /CRM editor working/.test(x.q)) && pv.steps.length === 8 && !hasCarrier(JSON.stringify(pv)).length, 'the customer portal shows the admin’s published edits (and not the hidden step)', pv && pv.steps.length);
    await p.locator('[data-gcch-admin] button[data-a="preview"]').click();
    await H.waitFor(A, () => { const m = document.querySelector('#gcch-prev [data-gcch-mount]'); return m && m.shadowRoot && m.shadowRoot.querySelector('#gc-claimhelp .gch-here'); }, null, 15000);
    const pr = await A.ev(() => { const r = document.querySelector('#gcch-prev [data-gcch-mount]').shadowRoot; return { here: r.querySelector('.gch-here') && r.querySelector('.gch-step[data-state=now] .gch-t').textContent, qa: r.querySelectorAll('.gch-qa details').length, txt: r.textContent }; });
    ok(pr.here && pr.qa === CH.defaults().qa.length + 1 && /SAMPLE-0042/.test(pr.txt) && !/lawyer|DRAFT/.test(pr.txt), 'Preview as customer: the portal card for a sample job (no lawyer tag)', pr.here);
    await p.locator('#gcch-prev').screenshot({ path: SHOTS + '/claimhelp_admin_preview.png' });
    await A.ev(() => document.querySelector('#gcch-prev .gcch-x').click());
    await p.locator('[data-gcch-admin] button[data-a="reset"]').click();
    await H.waitFor(A, () => !window._gcClaimHelp.state().dirty && window._gcClaimHelp.draft() && window._gcClaimHelp.draft().qa.length === 18, null, 15000);
    ok(JSON.stringify(CH.clean((kvv('gc_claim_help') || {}).draft)) === JSON.stringify(CH.clean(CH.defaults())) && (await A.ev(() => document.querySelectorAll('[data-gcch-lawyer]').length)) >= 27, 'Reset to GrayCo defaults: the draft is the defaults, tagged DRAFT again');
    await p.locator('[data-gcch-admin] button[data-a="publish"]').first().click(); await sleep(1500);
    pv = (await viewFor('B'.repeat(43))).data.claimHelp;
    ok(pv.qa[0].a === CH.defaults().qa[0].a && pv.steps.length === 9, 'Publish → customers see GrayCo’s defaults again');
    /* a non-admin (the office opens ⚙ Admin too): view only */
    await A.ev(() => { window.__realIsAdmin = window.__gcAuthIsAdmin; window.__gcAuthIsAdmin = () => false; window._gcAdm.back(); window._gcAdm.open('claimhelp'); });
    await H.waitFor(A, () => !!document.querySelector('[data-gcch-viewonly]'), null, 8000);
    const vo = await A.ev(() => { const b = document.querySelector('[data-gcch-admin]'); return { ro: [...b.querySelectorAll('.gcch-in')].every(x => x.readOnly), btns: [...b.querySelectorAll('button[data-a]')].map(x => x.getAttribute('data-a')) }; });
    ok(vo.ro && vo.btns.join() === 'preview', 'not an admin: view only (read-only fields, only Preview)', vo);
    await A.ev(() => { window.__gcAuthIsAdmin = window.__realIsAdmin; });
    /* the job: 🛡 Claim step ▾ */
    await A.ev(() => { window._setView('projects'); }); await sleep(1500);
    await A.ev(() => window._gcGoToTaskJob('PCI', '')); await sleep(2500);
    const hasBar = await H.waitFor(A, () => { const b = document.querySelector('main .gcch-bar[data-pid="PCI"]'); return b && b.querySelector('select') && b.querySelectorAll('select option').length >= 10; }, null, 20000);
    ok(!!hasBar, 'the insurance job: "🛡 Claim step ▾" under the 🏠 Portal card', await A.ev(() => [!!document.querySelector('.gcq-card'), document.querySelectorAll('.gcch-bar').length, (window._gcOpenProject || {}).id]));
    ok(await A.ev(() => { const b = document.querySelector('main .gcch-bar[data-pid="PCI"]'); const pv = b.previousElementSibling; return !!pv && (pv.classList.contains('gcinsp-panel') || pv.classList.contains('gcq-card')); }), '…right under the portal card / the 🛡 Insurance portal panel');
    const insp = await A.ev(async () => { const el = document.querySelector('main .gcinsp-panel[data-pid="PCI"]'); if (!el) return null; const tg = el.querySelector('[data-i=toggle]'); if (tg && tg.getAttribute('aria-expanded') !== 'true') tg.click(); await new Promise(r => setTimeout(r, 1200));
      const cb = el.querySelector('input[data-i=carrier]'), adj = el.querySelector('input[data-i=adjuster]'); return { adjOn: !!(adj && adj.checked && !adj.disabled), has: !!cb, disabled: cb && cb.disabled, checked: cb && cb.checked, note: /GrayCo never shows the insurance company’s name to customers/.test(el.innerText), head: /carrier never shown/.test(el.innerText) }; });
    ok(insp && insp.adjOn, 'the panel’s "Show adjuster name & phone" is ticked by default (owner 11/01) and can still be unticked per job', insp);
    ok(insp && insp.has && insp.disabled && !insp.checked && insp.note && insp.head, '🛡 Insurance portal panel: "Show carrier name to customer" disabled (even with the job’s switch ON) — "GrayCo never shows the insurance company’s name to customers"', insp);
    await p.locator('main .gcch-bar[data-pid="PCI"] select').selectOption('scope'); await sleep(1500);
    ok(await A.ev(() => { const x = window._crm.projects.find(p => p.id === 'PCI'); return x && x.claimHelp && x.claimHelp.step === 'scope' && !!x.claimHelp.at; }), 'picking a step saves it on the job (claimHelp.step)');
    ok((kvv('gc_approval_queue') || []).length === 0, '…and tells nobody by itself');
    await p.locator('main .gcch-bar[data-pid="PCI"] [data-ch="see"]').click();
    await H.waitFor(A, () => { const m = document.querySelector('#gcch-job [data-gcch-mount]'); return m && m.shadowRoot && m.shadowRoot.querySelector('.gch-here'); }, null, 15000);
    await p.locator('#gcch-job textarea[data-ch="note"]').fill('We are going over their scope with you on Friday.');
    await p.locator('#gcch-job [data-ch="savenote"]').click();
    await H.waitFor(A, () => { const m = document.querySelector('#gcch-job [data-gcch-mount]'); return m && m.shadowRoot && /going over their scope/.test(m.shadowRoot.textContent); }, null, 15000);
    const jv = await A.ev(() => { const r = document.querySelector('#gcch-job [data-gcch-mount]').shadowRoot; return { now: r.querySelector('.gch-step[data-state=now] .gch-t').textContent, txt: r.textContent }; });
    ok(jv.now === 'Estimate / scope received' && /going over their scope/.test(jv.txt) && /TST-555/.test(jv.txt) && !hasCarrier(jv.txt).length, '"What the customer sees": the step, the note, the claim — no carrier', jv.now);
    ok(await A.ev(() => (window._crm.projects.find(p => p.id === 'PCI').claimHelp || {}).note === 'We are going over their scope with you on Friday.'), 'the note is saved on the job');
    await p.locator('#gcch-job').screenshot({ path: SHOTS + '/claimhelp_job_preview.png' });
    await H.waitFor(A, () => { const x = (window._crm.projects || []).find(p => p.id === 'PCI'); return x && x.claimHelp && x.claimHelp.note; }, null, 5000);
    for (let i = 0; i < 20; i++) { const pj = (kvv('projects') || []).find(x => x && x.id === 'PCI'); if (pj && pj.claimHelp && pj.claimHelp.note) break; await sleep(500); }
    await p.locator('#gcch-job [data-ch="tell"]').click();
    let q = null; for (let i = 0; i < 30 && !q; i++) { await sleep(400); q = (kvv('gc_approval_queue') || []).find(x => x.kind === 'portal_post' && x.jobId === 'PCI'); }
    ok(q && q.status === 'waiting' && /Estimate \/ scope received/.test(q.meta.postText) && /going over their scope/.test(q.meta.postText) && !hasCarrier(q.meta.postText).length, '📣 Tell the customer → a portal post waiting on ✅ Approvals (step + note, no carrier)', q && q.meta.postText);
    await A.ev(() => document.querySelector('#gcch-job .gcch-x').click());
    await A.ev(() => window._gcGoToTaskJob('PCR', '')); await sleep(3000);
    ok(await A.ev(() => !document.querySelector('main .gcch-bar[data-pid="PCR"]')), 'a regular job: no claim step bar');
    ok(!CERR().length, 'no page errors (CRM)', CERR().slice(0, 5));
  });
  await A.b.close();
}
console.log((fail ? 'FAILED ' : 'OK ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
