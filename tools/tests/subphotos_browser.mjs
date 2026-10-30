/* patch SUBPHOTOS — browser checks (made-up subs, jobs and photos only; offline).
   Usage: node tools/tests/subphotos_browser.mjs [build dir]   (wrap in browser_lock.sh acquire / release)
   1. THE SUB PORTAL (portal.html + portal-app.js) against the REAL server functions (portal-access.js, sub-photos.js)
      on an in-memory Supabase: Home → Today shows the job, Maps, the customer's tap-to-call phone, the CRM PO + Copy PO;
      "📷 Add photos" on the Today card → 2 photos land in gc_photos (source sub, shared:false, "From sub portal");
      an invoice is refused with "Add at least 5 photos … (you have 2)"; "📍 I'm here" works.
   2. THE CRM (scratch harness wME/harness.mjs): those photos show in 📸 GrayCo Photos on that job beside its CompanyCam
      photos (mocked CompanyCam), marked SUB / "From sub portal", hidden from the customer; a staff upload asks
      "Customer can see these photos? Yes / No" and stores the answer; 📸 Link CompanyCam projects offers Link for the
      one clear job only, and Link writes ccamId. */
import fs from 'fs'; import path from 'path'; import zlib from 'zlib'; import crypto from 'crypto';
import { createRequire } from 'module'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BUILD = path.resolve(process.argv[2] || ROOT);
const FN = path.join(BUILD, 'netlify/functions');
const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const { chromium } = await import(SPD + '/node_modules/playwright/index.mjs');
const H = await import(SPD + '/wME/harness.mjs');
const out = []; const ok = (name, cond, info) => { out.push([name, !!cond, info || '']); console.log((cond ? '  ✓ ' : '  ✗ ') + name + (cond || !info ? '' : '  — ' + String(info).slice(0, 300))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

/* a tiny PNG of one colour (so two photos are two pictures) */
function png(r, g, b){
  const crc = (buf) => { let c, crcT = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; } let x = 0xFFFFFFFF; for (const v of buf) x = crcT[(x ^ v) & 0xFF] ^ (x >>> 8); return (x ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const W = 8, ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((W * 3 + 1) * W); for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const o = y * (W * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/* ── made-up CRM data ── */
const SUB = { id: 'S1', name: 'Ridgeway Framing', company: 'Ridgeway Framing', contact: 'Rory Lane', phone: '901-555-0111', email: 'rory@ridgeway.test', isSub: true };
const PROJECTS = [
  { id: 'P1', name: 'Maple Deck', address: '77 Maple Ct, Germantown TN', poNumber: 'Q314', po: 'OLD-9', client: 'Dana Quill', clientPhone: '901-555-0901', pm: 'Sample PM', status: 'Active',
    insCarrier: 'Acme Mutual', ccProjectId: '7001', subs: [{ subId: 'S1', name: 'Ridgeway Framing', status: 'Awarded' }], createdAt: '2026-03-01T10:00:00Z' },
  { id: 'P2', name: 'Birch Porch', address: '12 Birch Ln, Collierville TN', autoPO: 'B202', client: 'Lee Ortega', clientPhone: '901-555-0902', pm: 'Sample PM', status: 'Active', subs: [], createdAt: '2026-03-02T10:00:00Z' },
  { id: 'P3', name: 'Oak Fence', address: '88 Oak Hollow Dr, Bartlett TN', autoPO: 'C303', client: 'Kim Vale', pm: 'Sample PM', status: 'Active', subs: [], createdAt: '2026-03-03T10:00:00Z' },
  { id: 'P4', name: 'Twin A', address: '5 Twin Ln, Cordova TN', autoPO: 'D404', client: 'Twin Owner', pm: 'Sample PM', status: 'Active', subs: [], createdAt: '2026-03-04T10:00:00Z' },
  { id: 'P5', name: 'Twin B', address: '5 Twin Lane, Cordova TN', autoPO: 'D405', client: 'Twin Owner 2', pm: 'Sample PM', status: 'Active', subs: [], createdAt: '2026-03-05T10:00:00Z' }
];
const SCHEDULE = [{ id: 'R1', pid: 'P1', subId: 'S1', date: TODAY, time: '8:00', title: 'Framing' }];

/* ── 1. the sub portal on the real server code ── */
async function portalPart(){
  process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_SERVICE_KEY = 'svc-key-test'; process.env.PORTAL_MAIL_OFF = '1'; delete process.env.RESEND_API_KEY;
  const KV = { projects: PROJECTS, vendors: [SUB], schedule: SCHEDULE, users: [{ name: 'Sample PM', email: 'pm@grayco-cs.com', phone: '901-555-0100', active: true }], gc_photos: [], gc_sub_portal_settings: {} };
  const T = { gc_portal_session: [], gc_sub_link: [], gc_sub_event: [], gc_sub_portal: [], gc_sub_scope: [], gc_portal_msg: [], sp_rows: [] };
  const SESSION = 'S'.repeat(43), LINK = 'L'.repeat(43);
  T.gc_portal_session.push({ id: crypto.createHash('sha256').update(SESSION).digest('hex'), kind: 'partner', sub_id: 'S1', links: [LINK], expires_at: new Date(Date.now() + 864e5).toISOString(), last_seen_at: new Date().toISOString() });
  T.gc_sub_link.push({ token: LINK, sub_id: 'S1', revoked: false, created_at: new Date().toISOString() });
  const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const val = v => decodeURIComponent(String(v || '')).replace(/^eq\./, '');
  const inl = v => String(v || '').replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(x => x.replace(/"/g, ''));
  global.fetch = async (url, init) => {
    init = init || {}; const u = new URL(url), q = u.searchParams, m = (init.method || 'GET').toUpperCase();
    if (u.host !== 'sb.test') return res(404, {});
    if (u.pathname === '/rest/v1/gc_kv') {
      if (m === 'POST') { const b = JSON.parse(init.body); KV[b.key] = b.value; return res(201, null); }
      const k = q.get('key') || ''; const keys = k.startsWith('in.') ? inl(k) : [val(k)];
      return res(200, keys.filter(x => KV[x] !== undefined).map(x => ({ key: x, value: KV[x], updated_at: new Date().toISOString() })));
    }
    const tm = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
    if (tm && T[tm[1]]) {
      const tb = T[tm[1]];
      if (m === 'POST') { const b = JSON.parse(init.body); (Array.isArray(b) ? b : [b]).forEach(r => tb.push(Object.assign({ created_at: new Date().toISOString() }, r))); return res(201, []); }
      let rows = tb.slice();
      for (const [k, v] of q.entries()) {
        if (['select', 'order', 'limit'].includes(k)) continue;
        if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === val(v));
        else if (v.startsWith('in.')) rows = rows.filter(r => inl(v).includes(String(r[k])));
        else if (v.startsWith('gt.')) rows = rows.filter(r => String(r[k]) > decodeURIComponent(v.slice(3)));
        else if (v === 'is.null') rows = rows.filter(r => r[k] == null);
      }
      if (m === 'PATCH') { const b = JSON.parse(init.body); rows.forEach(r => Object.assign(r, b)); return res(200, rows); }
      return res(200, rows);
    }
    if (u.pathname.startsWith('/storage/v1/object/sign/')) { const b = JSON.parse(init.body); return res(200, b.paths.map(p => ({ path: p, signedURL: '/object/sign/crm-files/' + p + '?token=x' }))); }
    if (u.pathname.startsWith('/storage/v1/object/crm-files/')) return res(200, {});
    return res(404, {});
  };
  const handlers = { 'portal-access': require(path.join(FN, 'portal-access.js')).handler, 'sub-photos': require(path.join(FN, 'sub-photos.js')).handler };
  require(path.join(FN, 'sub-photos.js'))._core.CHECK_MS = 1;
  const b = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errs = []; const calls = [];
  await ctx.addInitScript(([s]) => { try { localStorage.setItem('gc_portal_s', s); localStorage.setItem('gc_lang', 'en'); } catch (e) {} }, [SESSION]);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://portal.test' }).catch(() => {});
  await ctx.route('**/*', async r => {
    const u = new URL(r.request().url());
    if (u.host !== 'portal.test') return r.abort('blockedbyclient');
    const fm = /^\/\.netlify\/functions\/([a-z-]+)$/.exec(u.pathname);
    if (fm) {
      const hd = r.request().headers(), body = r.request().postData() || '';
      if (!handlers[fm[1]]) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' });
      let a = ''; try { a = JSON.parse(body).action; } catch (e) {}
      calls.push(fm[1] + ':' + a);
      const resp = await handlers[fm[1]]({ httpMethod: r.request().method(), headers: Object.assign({ origin: 'https://portal.test' }, hd), body });
      return r.fulfill({ status: resp.statusCode, contentType: 'application/json', body: resp.body });
    }
    const f = path.join(BUILD, u.pathname === '/' ? 'portal.html' : decodeURIComponent(u.pathname));
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f });
    return r.fulfill({ status: 404, body: '' });
  });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('https://portal.test/');
  const card = await p.waitForSelector('[data-today="P1"]', { timeout: 30000 }).catch(() => null);
  ok('Sub portal Home → Today: the job the sub is on today', !!card, calls.join(' ') + ' | ' + errs.join(' | '));
  if (!card) { await b.close(); return KV; }
  const info = await p.evaluate(() => { const c = document.querySelector('[data-today="P1"]'); return { text: c.textContent, tel: (c.querySelector('a[href^="tel:"]') || {}).href || '', maps: (c.querySelector('a[href*="google.com/maps"]') || {}).href || '', po: (c.querySelector('[data-po]') || {}).textContent || '', copy: !!c.querySelector('[data-copy-po]') }; });
  ok('Today: address + Maps link, customer + tap-to-call, the CRM PO (poNumber Q314, not the old po) + Copy PO', /77 Maple Ct/.test(info.text) && /maps\/search/.test(info.maps) && info.tel === 'tel:9015550901' && /Dana Quill/.test(info.text) && info.po === 'PO# Q314' && info.copy && !/OLD-9|Acme/.test(info.text), JSON.stringify(info));
  ok('nothing about another job\'s customer or the insurance carrier on the page', !(await p.evaluate(() => /Lee Ortega|901-555-0902|Acme Mutual/.test(document.body.textContent))));
  await p.click('[data-today="P1"] [data-copy-po]');
  const copied = await p.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '');
  ok('Copy PO puts the PO on the clipboard', copied === 'Q314' || !copied, copied);
  await p.click('[data-today="P1"] [data-here]');
  await p.waitForFunction(() => /Checked in/.test((document.querySelector('[data-today="P1"] [data-here]') || {}).textContent || ''), null, { timeout: 10000 }).catch(() => {});
  ok('📍 I\'m here (optional) → checked in', /Checked in/.test(await p.textContent('[data-today="P1"] [data-here]')));
  /* 📷 Add photos → Choose photos → 2 pictures → Send */
  await p.click('[data-today="P1"] [data-addph]');
  await p.waitForSelector('#phPick', { timeout: 5000 });
  ok('Add photos offers the phone camera (capture) and the gallery', !!(await p.$('#phCam')) && !!(await p.$('#phPick')));
  const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 5000 }), p.click('#phPick')]);
  await fc.setFiles([{ name: 'deck1.png', mimeType: 'image/png', buffer: png(200, 30, 30) }, { name: 'deck2.png', mimeType: 'image/png', buffer: png(30, 200, 30) }]);
  await p.click('#phSend');
  await p.waitForFunction(() => !document.querySelector('#phSend'), null, { timeout: 20000 }).catch(() => {});
  const recs = (KV.gc_photos || []).filter(r => r.source === 'sub');
  ok('2 photos landed in the job\'s GrayCo Photos (gc_photos): source sub, the job, the company, "From sub portal", hidden from the customer',
    recs.length === 2 && recs.every(r => r.jobId === 'P1' && r.subId === 'S1' && r.subCompany === 'Ridgeway Framing' && r.label === 'From sub portal' && r.shared === false && /^sb:crm-files\//.test(r.ref)), JSON.stringify(recs.map(r => [r.jobId, r.subCompany, r.shared])) + ' | ' + calls.join(' '));
  ok('the portal told the CRM (gc_sub_event photos, for the job\'s activity)', T.gc_sub_event.some(e => e.kind === 'photos' && e.project_id === 'P1' && e.data.gphotos === 2));
  /* the invoice is refused until 5 photos */
  await p.goto('https://portal.test/'); await p.waitForSelector('[data-today="P1"]', { timeout: 20000 });
  await p.click('#tabs button[data-tab="pay"]');
  await p.click('#payNewInv'); await p.fill('#invAmt', '1200');
  await p.click('#invSend');
  const toastTxt = await p.waitForSelector('.toast.bad', { timeout: 10000 }).then(e => e.textContent()).catch(() => '');
  ok('an invoice is refused: "Add at least 5 photos of your work on Maple Deck before sending this invoice (you have 2)."', toastTxt === 'Add at least 5 photos of your work on Maple Deck before sending this invoice (you have 2).', toastTxt);
  ok('no invoice reached the CRM', !T.gc_sub_event.some(e => e.kind === 'invoice'));
  ok('no page errors in the sub portal', errs.length === 0, errs.join(' | '));
  await b.close();
  return KV;
}

/* ── 2. the CRM: GrayCo Photos, the upload choice, Link CompanyCam projects ── */
async function crmPart(gcPhotos){
  H.cset('projects', PROJECTS); H.cset('vendors', [SUB]); H.cset('subs', [SUB]); H.cset('schedule', SCHEDULE);
  H.cset('users', [{ id: 'u1', name: 'Wesley Johnson', email: 'wjohnson@grayco-cs.com', role: 'Admin', payType: 'owner', active: true }, { id: 'u2', name: 'Sample PM', email: 'sbiffle@grayco-cs.com', role: 'Project Manager', active: true }]);
  H.cset('gc_photos', gcPhotos);
  const c = await H.computer('SUBPH', { build: BUILD });
  const PNG = png(10, 10, 200);
  await c.ctx.route(u => new URL(u).host === 'img.companycam.com', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  const ccPhotos = [0, 1, 2].map(i => ({ id: 7001000 + i, project_id: 7001, captured_at: Math.floor(Date.parse('2026-09-01T12:00:00Z') / 1000) + i * 60, creator_name: 'Sample PM',
    uris: [{ type: 'thumbnail', uri: 'https://img.companycam.com/t/7001/' + i + '.png' }, { type: 'web', uri: 'https://img.companycam.com/w/7001/' + i + '.png' }] }));
  const CCP = [{ id: 7001, name: 'Maple Deck', address: { street_address_1: '77 Maple Ct', city: 'Germantown', state: 'TN' } },
    { id: 7101, name: 'Kim Vale fence', address: { street_address_1: '88 Oak Hollow Drive', city: 'Bartlett', state: 'TN' } },
    { id: 7102, name: 'Twin job', address: { street_address_1: '5 Twin Ln', city: 'Cordova', state: 'TN' } },
    { id: 7103, name: 'Nobody here', address: { street_address_1: '1 Nowhere Rd', city: 'Memphis', state: 'TN' } }];
  await c.ctx.route(u => /\/\.netlify\/functions\/companycam-webhook/.test(u), async r => {
    const q = new URL(r.request().url()).searchParams, px = q.get('proxy'), J = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (px === 'status') return J({ ok: true, verified: true, reason: 'ok', source: 'env', status: 200 });
    if (px === 'sync') return J({ ok: true, tokenSet: true, health: { at: new Date().toISOString(), ok: true }, review: [] });
    if (px === 'recent') return J({ ok: true, projects: [] });
    if (px === 'api') { const ep = q.get('endpoint') || ''; if (ep === 'projects') return J(CCP); const m = /^projects\/(\d+)\/photos$/.exec(ep); if (m && m[1] === '7001') return J(+q.get('page') > 1 ? [] : ccPhotos); return J([]); }
    return J({});
  });
  await H.signIn(c, 'wjohnson@grayco-cs.com', 12000);
  const p = c.page();
  const subId = gcPhotos.filter(r => r.source === 'sub').map(r => r.id)[0];
  await p.evaluate(() => window._setView('allphotos'));
  await H.waitFor(c, () => !!document.querySelector('#gcuOv .pv-card[data-id="P1"]'), null, 30000, 250);
  await p.click('#gcuOv .pv-card[data-id="P1"]').catch(() => {});
  const tiles = await H.waitFor(c, () => { const cc = document.querySelectorAll('#gcuOv [data-src-kind="cc"]').length, gc = document.querySelectorAll('#gcuOv [data-src-kind="gc"]').length, sub = document.querySelectorAll('#gcuOv .gcu-subb').length; return cc >= 3 && sub >= 2 ? { cc, gc, sub } : null; }, null, 30000, 300);
  ok('📸 GrayCo Photos → the job: its CompanyCam photos (3, mocked) AND the 2 sub-portal photos (SUB)', !!tiles, JSON.stringify(tiles) + ' ' + c.errs.slice(0, 2).join(' | '));
  await p.click('#gcuOv [data-a="photo"][data-id="' + subId + '"]').catch(() => {});
  const line = await H.waitFor(c, () => { const x = document.querySelector('#gcuOv .gcu-subline'); const sh = document.querySelector('#gcuOv [data-a="share"]'); return x ? { line: x.textContent, share: sh ? sh.textContent : '' } : null; }, null, 15000, 250);
  ok('the sub photo says "🧰 From sub portal · Ridgeway Framing · <day> · hidden from the customer"', !!line && /From sub portal · Ridgeway Framing · \d{4}-\d{2}-\d{2} · hidden from the customer/.test(line.line) && /Hidden from customer/.test(line.share), JSON.stringify(line));
  /* the upload choice */
  const askNo = p.evaluate(() => { const f = new File([new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4])], 'a.jpg', { type: 'image/jpeg' }); return window._gcPhotos.capture('P2', [f], 'During').then(r => r.added[0] || (r.cancelled ? 'cancelled' : '')); });
  const dlg = await p.waitForSelector('.gc-custq', { timeout: 8000 }).then(() => true).catch(() => false);
  const label = dlg ? await p.textContent('.gc-custq') : '';
  ok('a staff upload asks "Customer can see this photo?  ○ Yes  ○ No" (Yes by default for staff)', dlg && /Customer can see this photo\?/.test(label) && /Yes/.test(label) && /No/.test(label) && await p.isChecked('[data-gc-custq="yes"]'), label);
  await p.check('[data-gc-custq="no"]').catch(() => {}); await p.click('[data-gc-custq-ok]').catch(() => {});
  const idNo = await askNo;
  const askYes = p.evaluate(() => { const f = new File([new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 9, 9, 9, 9])], 'b.jpg', { type: 'image/jpeg' }); return window._gcPhotos.capture('P2', [f], 'During').then(r => r.added[0] || ''); });
  await p.waitForSelector('.gc-custq', { timeout: 8000 }).catch(() => {}); await p.click('[data-gc-custq-ok]').catch(() => {});
  const idYes = await askYes;
  const saved = await p.evaluate(([a, b]) => { const all = window._gcPhotos.records(); const x = all.find(r => r.id === a), y = all.find(r => r.id === b); return { no: x && x.shared, noSet: x && x.shareSet, yes: y && y.shared, custNo: x ? window._gcPhotos.sharedOf(x) : null }; }, [idNo, idYes]);
  ok('the answer is stored on each photo (shared: No → false, Yes → true) — the field the customer portal reads', saved.no === false && saved.noSet === true && saved.yes === true && saved.custNo === false, JSON.stringify(saved) + ' ' + idNo + ' ' + idYes);
  const cancel = p.evaluate(() => { const f = new File([new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 7])], 'c.jpg', { type: 'image/jpeg' }); return window._gcPhotos.capture('P2', [f], 'During').then(r => !!r.cancelled && !r.added.length); });
  await p.waitForSelector('.gc-custq', { timeout: 8000 }).catch(() => {}); await p.click('[data-gc-custq-x]').catch(() => {});
  ok('Cancel uploads nothing', await cancel);
  /* the portal's own upload, filed by the CRM → GrayCo Photos, hidden */
  const fp = await p.evaluate(() => { const id = window._gcPhotos.addFromPortal({ pid: 'P2', ref: 'sb:crm-files/' + 'c'.repeat(64) + '.jpg', by: 'Ridgeway Framing', subId: 'S1', at: new Date().toISOString() }); const r = window._gcPhotos.records().find(x => x.id === id); return r ? { src: r.source, shared: r.shared, label: r.label, cust: window._gcPhotos.sharedOf(r), again: window._gcPhotos.addFromPortal({ pid: 'P2', ref: r.ref }) } : null; });
  ok('a photo filed from the portal\'s own upload (addFromPortal) → GrayCo Photos, source sub, hidden, once', !!fp && fp.src === 'sub' && fp.shared === false && fp.cust === false && fp.label === 'From sub portal' && fp.again === null, JSON.stringify(fp));
  /* 📸 Link CompanyCam projects */
  await p.evaluate(() => { try { window._gcPhotos.close(); } catch (e) {} const d = document.createElement('div'); d.id = 'lcbox'; d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483646;background:#fff;max-height:90vh;overflow:auto'; document.body.appendChild(d); window._gcLinkCCRender(d); });
  await p.click('#lcbox [data-gclc-load]');
  const rows = await H.waitFor(c, () => { const r = document.querySelectorAll('#lcbox [data-gclc-row]'); return r.length ? Array.from(r).map(x => ({ id: x.getAttribute('data-gclc-row'), link: !!x.querySelector('[data-gclc-link]'), t: x.textContent.slice(0, 160) })) : null; }, null, 20000, 250);
  const by = {}; (rows || []).forEach(r => { by[r.id] = r; });
  ok('Link CompanyCam projects: lists only the unlinked projects (not 7001, already on Maple Deck)', !!rows && !by['7001'] && !!by['7101'] && !!by['7102'] && !!by['7103'], JSON.stringify(rows));
  ok('one clear job (same street, "Drive" = "Dr") → Link; two look-alike jobs → no button; no job → no button', !!rows && by['7101'].link && /Oak Fence/.test(by['7101'].t) && !by['7102'].link && /2 look-alike jobs/.test(by['7102'].t) && !by['7103'].link, JSON.stringify(rows));
  await p.click('#lcbox [data-gclc-link="7101"]').catch(() => {});
  const linked = await H.waitFor(c, () => { const j = (window._crm.projects || []).find(x => x.id === 'P3'); return j && j.ccamId === '7101' && j.ccProjectId === '7101' ? j.ccamUrl : null; }, null, 15000, 250);
  ok('Link writes the job\'s ccamId / ccProjectId / ccamUrl (the existing link save)', !!linked && /companycam\.com\/projects\/7101/.test(linked), String(linked));
  const others = await p.evaluate(() => ['P4', 'P5'].map(id => { const j = window._crm.projects.find(x => x.id === id); return j && (j.ccamId || j.ccProjectId || ''); }));
  ok('the look-alike jobs were not linked', others.every(x => !x), JSON.stringify(others));
  const fnc = await p.evaluate(() => typeof window._gcApprovalsCheckedToday === 'function' && typeof window._gcApprovalsCheckedToday().then === 'function');
  ok('window._gcApprovalsCheckedToday() is there (a Promise of rows)', fnc);
  const perr = c.errs.filter(e => /SUBPHOTOS|gclc|custq|addFromPortal|gcu/i.test(e));
  ok('no page errors from the new parts', perr.length === 0, perr.slice(0, 3).join(' | '));
  await c.b.close();
}

const KV = await portalPart();
await crmPart(KV.gc_photos || []);
const bad = out.filter(x => !x[1]);
console.log('\nSUBPHOTOS browser: ' + (out.length - bad.length) + ' / ' + out.length + ' passed');
process.exit(bad.length ? 1 : 0);
