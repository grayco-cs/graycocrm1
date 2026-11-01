// estpdf_portal_shots.mjs <site-root> <functions-dir> <out-prefix> — the customer portal with a SENT estimate, offline.
//   Builds the portal's own "view" with <functions-dir>/portal.js (its buildView) from made-up data (a job with an estimate
//   e-mailed from the CRM and its sent PDF), serves <site-root>/portal.html, and screenshots it at 390 and 1280 wide:
//   <out-prefix>_390.png, <out-prefix>_1280.png. Also prints what the page shows for the estimate (JSON) and page errors.
//   Used for the owner's before / after shots (patch ESTPDF) and by test_ESTPDF.mjs (portal part).
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire(import.meta.url);
const [ROOT, FNDIR, OUT] = process.argv.slice(2).map(x => x && path.resolve(x));
if (!ROOT || !FNDIR || !OUT) { console.error('usage: node estpdf_portal_shots.mjs <site-root> <functions-dir> <out-prefix>'); process.exit(2); }
const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const { chromium } = require(SPD + '/node_modules/playwright');
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', RESEND_API_KEY: 're-test' });
const KV = new Map(), FILES = new Map();
const J = (status, body) => ({ ok: status < 300, status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) });
global.fetch = async function(url, init = {}){
  const u = new URL(url), m = (init.method || 'GET').toUpperCase();
  if (u.host === 'sb.test') {
    if (u.pathname.startsWith('/storage/v1/object/sign/')) { const b = JSON.parse(init.body || '{}'); return J(200, (b.paths || []).map(p => ({ path: p, signedURL: '/object/sign/crm-files/' + p + '?token=t' }))); }
    if (u.pathname === '/rest/v1/gc_kv' && m === 'GET') { const kq = u.searchParams.get('key') || ''; const key = kq.replace(/^eq\./, ''); const r = KV.get(key); return J(200, r ? [{ key, value: r, updated_at: '2026-11-01T00:00:00Z' }] : []); }
    return J(200, []);
  }
  return J(404, {});
};
require(path.join(FNDIR, '_lib/pause.js')).install();
const P = require(path.join(FNDIR, 'portal.js'));
const pdf = Buffer.from('%PDF-1.4\n% made-up estimate for the portal shots\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n', 'latin1');
const sha = crypto.createHash('sha256').update(pdf).digest('hex'), ref = 'sb:crm-files/' + sha + '.pdf';
const day = '2026-10-30';
const job = { id: 'PDEMO1', name: 'Demo Kitchen Remodel', autoPO: 'D101', client: 'Demo Customer', clientEmail: 'demo.customer@example.com', address: '123 Demo Street, Memphis, TN 38103', pm: 'Demo Project Manager',
  status: 'bidding', type: 'Residential', created: '2026-10-20', proposalSentAt: day + 'T15:00:00.000Z' };
const est = { id: 'EDEMO1', pid: 'PDEMO1', name: 'Demo Kitchen Remodel', num: '1042', status: 'Sent', portalShare: true, date: day, sentDate: day, createdAt: '2026-10-28T12:00:00Z', totalCharge: 48250,
  totalCost: 33100, margin: 31.4, notes: 'INTERNAL: sub is Demo Sub LLC — keep margin over 30%', sentPdf: { ref: ref, version: 1, sentAt: day + 'T15:00:00.000Z', via: 'crm-email' },
  scope: { text: 'Remove the existing kitchen, new cabinets, quartz counters, tile backsplash, LVP floor, paint and trim.' },
  lines: [{ id: 'l1', cat: 'Demolition', desc: 'Remove cabinets, counters and flooring', qty: 1, cost: 1800, charge: 2600, type: 'labor' },
    { id: 'l2', cat: 'Cabinets', desc: 'Shaker cabinets, soft close', qty: 1, cost: 14200, charge: 19500, type: 'material', vendor: 'Demo Supplier' },
    { id: 'l3', cat: 'Countertops', desc: 'Quartz counters with undermount sink', qty: 1, cost: 7400, charge: 10300, type: 'sub', sub: 'Demo Sub LLC' },
    { id: 'l4', cat: 'Flooring', desc: 'LVP flooring, 320 SF', qty: 320, cost: 9, charge: 5200, type: 'material' },
    { id: 'l5', cat: 'Paint & trim', desc: 'Walls, ceiling, new trim', qty: 1, cost: 6300, charge: 10650, type: 'labor' }] };
const doc = { id: 'DESTPDF_EDEMO1_v1', pid: 'PDEMO1', estimateId: 'EDEMO1', cat: 'Estimates', name: 'Estimate — Demo Kitchen Remodel — sent ' + day + '.pdf', ref, type: 'application/pdf', sentPdf: true, version: 1, portalShare: true, uploadedAt: day + 'T15:00:00.000Z', uploaded: day };
const data = { projects: [job], estimates: [est], projectDocs: [doc], users: [{ id: 'U1', name: 'Demo Project Manager', email: 'demo.pm@grayco-cs.com', phone: '901-555-0100', role: 'Project Manager', active: true }], customers: [], invs: [], invoices: [] };
KV.set('gc_sign_requests', JSON.stringify([{ id: 'sr_PDEMO1_estimate_EDEMO1', pid: 'PDEMO1', kind: 'estimate', refId: 'EDEMO1', status: 'pending', mailed: true, gateKey: 'e:EDEMO1', docRef: ref, createdAt: day + 'T15:00:00.000Z' }]));
KV.set('gc_portal_gate', JSON.stringify([{ id: '_meta', since: '2026-10-24T00:00:00Z', gf: {} }, { id: 'e:EDEMO1', pid: 'PDEMO1', st: 'approved' }]));
const view = await P._core.buildView(data, job, { noGateQueue: true });
const VIEW = Object.assign({ ok: true }, view);
const SIGN = { ok: true, items: [{ id: 'sr_PDEMO1_estimate_EDEMO1', kind: 'estimate', label: 'Estimate', title: 'Estimate #1042 — Demo Kitchen Remodel', amount: 48250, status: 'pending', at: day + 'T15:00:00.000Z', doc: 'https://sb.test/storage/v1/object/sign/crm-files/' + sha + '.pdf?token=t', lines: [] }], pm: { name: 'Demo Project Manager' } };
const TOKEN = 'A'.repeat(43);
const CT = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
const errs = [], calls = [];
for (const w of [390, 1280]) {
  const ctx = await browser.newContext(w === 390 ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 900 } });
  await ctx.route('**/*', async r => {
    const u = new URL(r.request().url());
    if (u.host !== 'portal.test') { if (u.host === 'sb.test') return r.fulfill({ status: 200, contentType: 'application/pdf', body: pdf }); return r.abort('blockedbyclient'); }
    if (u.pathname.startsWith('/.netlify/functions/')) {
      const fn = u.pathname.split('/').pop(); let b = {}; try { b = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
      calls.push(fn + ':' + (b.action || ''));
      const out = fn === 'portal' ? (b.action === 'view' ? VIEW : b.action === 'app' ? { ok: true, unread: {}, total: 0 } : b.action === 'photos' ? { ok: true, photos: [] } : { ok: true })
        : fn === 'portal-sign' ? (b.action === 'view' ? SIGN : { ok: true }) : fn === 'portal-access' ? (b.action === 'c-jobs' ? { ok: true, jobs: [] } : b.action === 'c-msgs' ? { ok: true, messages: [] } : { ok: false }) : { ok: true };
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
    }
    let f = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/portal.html' : u.pathname));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) f = path.join(ROOT, 'portal.html');
    return r.fulfill({ path: f, contentType: (CT[path.extname(f)] || 'application/octet-stream') + '; charset=utf-8' });
  });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(w + ': ' + e.message + ' @ ' + ((e.stack || '').split('\n')[1] || '').trim()));
  await pg.goto('https://portal.test/portal.html#t=' + TOKEN);
  await pg.waitForTimeout(3500);
  await pg.screenshot({ path: OUT + '_' + w + '_home.png', fullPage: false });
  /* the Documents tab */
  await pg.evaluate(() => { const b = [...document.querySelectorAll('#tabs button, nav button, [role=tab]')].find(x => /^\s*(📄\s*)?Documents/.test(x.textContent || '')); if (b) b.click(); });
  await pg.waitForTimeout(800);
  /* the estimate: the dedicated card when there is one, else the documents list */
  const info = await pg.evaluate(() => {
    const card = document.querySelector('[data-est-card]'), docs = [...document.querySelectorAll('.doc')].map(d => d.textContent.replace(/\s+/g, ' ').trim());
    const tgt = card || [...document.querySelectorAll('section.card')].find(s => /Documents & proposals|Estimate/.test(s.textContent || ''));
    if (tgt) tgt.scrollIntoView({ block: 'start' });
    return { card: card ? card.textContent.replace(/\s+/g, ' ').trim().slice(0, 600) : '', docs, text: document.body.innerText.slice(0, 200) };
  });
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: OUT + '_' + w + '.png', fullPage: false });
  /* the card's buttons (after only): View PDF marks it viewed; Ask a question opens Messages with the estimate named */
  if (info.card) {
    const pop = ctx.waitForEvent('page', { timeout: 4000 }).catch(() => null);
    await pg.evaluate(() => { const a = document.querySelector('[data-est-card] [data-est-pdf]'); if (a) a.click(); });
    const np = await pop; if (np) await np.close().catch(() => {});
    await pg.waitForTimeout(500);
    await pg.evaluate(() => { const b = document.querySelector('[data-est-card] [data-est-ask]'); if (b) b.click(); });
    await pg.waitForTimeout(900);
    info.ask = await pg.evaluate(() => { const t = document.getElementById('cMsgText'); return t ? t.value : null; });
  }
  console.log(JSON.stringify({ width: w, info }));
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify({ errs, calls: [...new Set(calls)] }));
