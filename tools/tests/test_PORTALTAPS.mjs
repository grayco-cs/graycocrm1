// test_PORTALTAPS.mjs [portal|bids|all] [user|all] [phone|desktop|all] — patch PORTALTAPS (owner 11/23: "We have to make sure every
// button on the sub and customer portals work"). Modelled on test_FIELDTAPS.mjs: tap EVERY visible control of the portals and say,
// per control, what happened.
//   portal = portal.grayco-cs.com (portal.html: sign-in, the customer portal, the sub portal portal-app.js) on custportal_world.mjs —
//            the REAL functions behind a local server with netlify.toml's portal rules, a fake Supabase (+ sign-ins / uploads below)
//   bids   = bids.grayco-cs.com (the built bid site subportal/, React) on qaa_world.mjs — the REAL subportal.js / bid-hub.js
// Users: cust (a homeowner: active job, invoices, change orders, documents, photos, messages, payments) · gc (a GC / commercial
//   customer) · sub (an approved sub: jobs, schedule, bids, pay / invoices, papers, measure) · subnew (the sign-in page: sign up,
//   forgot password, code; then a signed-up sub waiting for approval) · bidsub (an approved sub on the bid site) · bidnew (the bid
//   site's sign-in / sign-up / reset, then an unapproved account).
// Devices: phone = iPhone 390×844 (touch, iPhone Safari UA, installed-app standalone, CPU ×4) · desktop = 1440×900.
// For each screen (the start page, then every tab / sheet / page a tap opens, FT-style one or two levels down) every visible
// control is tapped (a finger on the phone, a mouse on the desktop), after the form around it is filled with valid made-up values
// (files: a small real PDF / JPEG); a control is OK when within 2 s it navigates, opens a sheet / tab / page, changes what is shown,
// opens a dialog / file picker / link / a real file, or calls its function and that answers 2xx; FAIL is a dead tap, a JS error,
// a blank page, a hang over 2 s, a control under another element, a submit that never reaches its function, a function error on
// valid input, a file that is not a file, or a window.open of blob: / about:blank in the installed app (a black screen on iOS).
// A file picker is answered with a small real file (PDF for invoices / bids / papers, JPEG for photos) and the upload is checked.
// Destructive controls (sign out, delete, remove) are listed, not tapped; sign out is tapped last.
// Out: one table per user × device on stdout, JSON in PT_OUT (default <scratch>/pt/out). Exit 1 on any FAIL.
// Env: PT_BUDGET seconds per user × device (1100) · PT_DEPTH (2) · PT_SHEETMAX controls per sheet (30) · PT_ONLY screen regex
//   (PT_VIA: on the other screens tap only the controls matching it, to reach the PT_ONLY ones) · PT_OUT the JSON folder.
// Made-up data only; nothing leaves the machine.
import fs from 'fs'; import path from 'path'; import crypto from 'crypto'; import zlib from 'zlib';
import { createRequire } from 'module'; import { fileURLToPath, pathToFileURL } from 'url'; import { spawnSync } from 'child_process';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
const SPX = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const OUT = process.env.PT_OUT || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/pt/out';
fs.mkdirSync(OUT, { recursive: true });
const APP = process.argv[2] || 'all', USERARG = process.argv[3] || 'all', DEVARG = process.argv[4] || 'all';
const APPS = { portal: ['cust', 'gc', 'gcp', 'sub', 'subnew'], bids: ['bidsub', 'bidnew'] };
const DEVS = DEVARG === 'all' ? ['phone', 'desktop'] : DEVARG.split(',');
const BUDGET = +(process.env.PT_BUDGET || 1100), DEPTH = +(process.env.PT_DEPTH || 2), SHEETMAX = +(process.env.PT_SHEETMAX || 30);
const ONLY = process.env.PT_ONLY ? new RegExp(process.env.PT_ONLY) : null, VIA = process.env.PT_VIA ? new RegExp(process.env.PT_VIA) : null;
const HANG_MS = 2000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const today = () => new Date(Date.now()).toISOString().slice(0, 10);
const addDays = (n, d) => { const x = new Date((d || today()) + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/* ═══ all: each app in its own node (the two offline worlds each own the fake cloud) ═══ */
if (APP === 'all') {
  let bad = 0;
  for (const a of Object.keys(APPS)) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), a, USERARG, DEVARG], { stdio: 'inherit', env: process.env });
    if (r.status) bad++;
  }
  process.exit(bad ? 1 : 0);
}
const USERS = USERARG === 'all' ? APPS[APP] : USERARG.split(',').filter(u => APPS[APP].includes(u));
if (!APPS[APP] || !USERS.length) { console.error('usage: node test_PORTALTAPS.mjs [portal|bids|all] [' + Object.values(APPS).flat().join('|') + '|all] [phone|desktop|all]'); process.exit(2); }

/* ═══ small real files ═══ */
function pngOf(r, g, b, W){
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = buf => { let x = 0xFFFFFFFF; for (const v of buf) x = crcT[(x ^ v) & 0xFF] ^ (x >>> 8); return (x ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((W * 3 + 1) * W); for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const o = y * (W * 3 + 1) + 1 + x * 3; raw[o] = (r + x * 3) & 255; raw[o + 1] = (g + y * 3) & 255; raw[o + 2] = b; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function pdfOf(title){
  const txt = 'BT /F1 18 Tf 72 720 Td (' + title.replace(/[()\\]/g, '') + ') Tj ET';
  const objs = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>', '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>',
    '<</Length ' + txt.length + '>>stream\n' + txt + '\nendstream', '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'];
  let out = '%PDF-1.4\n'; const off = [];
  objs.forEach((o, i) => { off.push(out.length); out += (i + 1) + ' 0 obj' + o + 'endobj\n'; });
  const x = out.length; out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer<</Size ' + (objs.length + 1) + '/Root 1 0 R>>\nstartxref\n' + x + '\n%%EOF';
  return Buffer.from(out, 'latin1');
}
const FDIR = path.join(OUT, 'files'); fs.mkdirSync(FDIR, { recursive: true });
let JPG = null;
try { JPG = require('child_process').execFileSync('convert', ['-size', '640x480', 'gradient:#7a9cc6-#d8c49a', '-quality', '80', 'jpg:-']); } catch (e) { JPG = pngOf(120, 160, 200, 64); }
const TESTFILES = {
  invoice: { name: 'Invoice-PT-1001.pdf', type: 'application/pdf', buf: pdfOf('Invoice PT-1001 - Sample Drywall LLC - $1,250.00') },
  bid: { name: 'Bid-PT-drywall.pdf', type: 'application/pdf', buf: pdfOf('Bid - drywall - $9,800.00') },
  paper: { name: 'COI-PT.pdf', type: 'application/pdf', buf: pdfOf('Certificate of insurance - sample') },
  photo: { name: 'site-photo-pt.jpg', type: 'image/jpeg', buf: JPG }
};
for (const k of Object.keys(TESTFILES)) { TESTFILES[k].path = path.join(FDIR, TESTFILES[k].name); fs.writeFileSync(TESTFILES[k].path, TESTFILES[k].buf); }
function fileFor(accept, ctxText){
  const a = String(accept || '').toLowerCase(), c = String(ctxText || '').toLowerCase().slice(0, 160);   /* the control's own words first */
  if (/image/.test(a) && !/pdf/.test(a)) return TESTFILES.photo;
  if (/invoice|factura|receipt|recibo/.test(c)) return TESTFILES.invoice;
  if (/photo|picture|foto|camera|📷/.test(c) && !/invoice|factura|bid|paper|w-?9|coi|insur|seguro|licen/.test(c)) return TESTFILES.photo;
  if (/bid|oferta|propuesta/.test(c)) return TESTFILES.bid;
  if (/w-?9|coi|insur|seguro|licen|paper|papel|cert|comp/.test(c)) return TESTFILES.paper;
  return TESTFILES.invoice;
}

/* ═══ the phone / desktop, instrumented (FIELDTAPS's INIT + the black-screen rule for blob: / about:blank) ═══ */
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const INIT = standalone => `(() => {
  const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} };
  if (${standalone}) {
    d(Navigator.prototype, 'standalone', true); d(Navigator.prototype, 'maxTouchPoints', 5);
    const mm = window.matchMedia;
    window.matchMedia = function(q){ if (/display-mode:\\s*standalone/.test(q)) return { matches: true, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return false; } }; return mm.call(window, q); };
  }
  const R = window.__ft = { rec: [], iosRule: ${standalone}, drops: [], lastFile: null };
  const rec = (k, v) => R.rec.push({ k, v: String(v == null ? '' : v).slice(0, 160), at: Date.now() });
  const wo = window.open; window.open = function(u){ const s = String(u == null ? '' : u);
    rec(!s || /^about:blank/i.test(s) ? 'open-blank' : /^blob:/i.test(s) ? 'open-blob' : 'open', s); try { return wo.apply(this, arguments); } catch (e) { return null; } };
  const ic = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function(){ if (this.type === 'file') { R.lastFile = this; this.setAttribute('data-pt-file', String(Date.now())); rec('file', this.accept || 'file'); return; } return ic.apply(this, arguments); };
  if (HTMLInputElement.prototype.showPicker) { const sp = HTMLInputElement.prototype.showPicker; HTMLInputElement.prototype.showPicker = function(){ if (this.type === 'file') { R.lastFile = this; this.setAttribute('data-pt-file', String(Date.now())); rec('file', this.accept || 'file'); return; } rec('picker', this.type); try { return sp.apply(this, arguments); } catch (e) {} }; }
  try { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = c => { rec('media', JSON.stringify(c)); return Promise.reject(new DOMException('test', 'NotAllowedError')); }; } catch (e) {}
  try { navigator.share = x => { rec('share', JSON.stringify(x || {}).slice(0, 80)); return Promise.resolve(); }; navigator.canShare = () => true; } catch (e) {}
  try { const g = navigator.geolocation; if (g) { g.getCurrentPosition = (ok, bad) => { rec('geo', ''); bad && bad({ code: 1, message: 'test' }); }; g.watchPosition = () => { rec('geo', ''); return 1; }; } } catch (e) {}
  try { if (navigator.clipboard) navigator.clipboard.writeText = t => { rec('clip', t); return Promise.resolve(); }; } catch (e) {}
  try { window.print = () => rec('print', ''); } catch (e) {}
  try { if (window.Notification) { Notification.requestPermission = () => { rec('notify', ''); return Promise.resolve('denied'); }; } } catch (e) {}
  const ac = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function(){ const h = this.href || '';
    if (this.download || /^blob:|^data:/.test(h)) { rec(/^blob:/.test(h) && !this.download ? 'open-blob' : 'download', (this.download || '') + ' ' + h.slice(0, 60)); if (/^blob:/.test(h)) { try { fetch(h).then(r => r.arrayBuffer()).then(b => { const u = new Uint8Array(b.slice(0, 5)); rec('dlbytes', String.fromCharCode.apply(null, u) + ' ' + b.byteLength); }); } catch (e) {} } return; }
    if (this.target === '_blank' || (/^https?:/i.test(h) && new URL(h).host !== location.host) || /^(tel|sms|mailto|maps|geo):/i.test(h)) { rec('link', h); return; }
    return ac.apply(this, arguments); };
  document.addEventListener('click', e => { const a = e.target && e.target.closest && e.target.closest('a[href]'); if (!a) return; const h = a.getAttribute('href') || ''; if (/^#/.test(h) || /^javascript:/i.test(h)) return;
    if (/^(tel|sms|mailto|maps|geo):/i.test(h) || a.target === '_blank' || a.download || /^blob:/i.test(a.href) || (/^https?:/i.test(a.href) && new URL(a.href).host !== location.host)) { rec(/^blob:/i.test(a.href) && !a.download ? 'open-blob' : 'link', a.href); e.preventDefault(); } }, true);
  const la = Location.prototype.assign; try { Location.prototype.assign = function(u){ if (/^(tel|sms|mailto):/i.test(u)) { rec('link', u); return; } if (/^blob:/i.test(u)) rec('open-blob', u); return la.call(this, u); }; } catch (e) {}
  window.addEventListener('error', e => rec('error', e.message));
  if (${standalone}) {
    const ael = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(t, f, o){ try { if (this && this.nodeType === 1 && this !== document.body && this !== document.documentElement && /^(click|mousedown|mouseup|touchstart|touchend|pointerdown|pointerup)$/.test(t)) this.__ftTap = 1; } catch (e) {} return ael.call(this, t, f, o); };
    window.addEventListener('click', e => { if (!R.iosRule || !e.isTrusted) return; let q = e.target;
      while (q && q.nodeType === 1 && q !== document.body && q !== document.documentElement) { if (/^(A|BUTTON|INPUT|SELECT|TEXTAREA|LABEL|OPTION|SUMMARY|VIDEO|AUDIO|IFRAME|CANVAS)$/.test(q.tagName) || q.isContentEditable || q.__ftTap || typeof q.onclick === 'function' || q.hasAttribute('onclick') || getComputedStyle(q).cursor === 'pointer') return; q = q.parentElement; }
      R.drops.push({ at: Date.now(), t: (e.target && e.target.tagName) + '.' + (e.target && e.target.className) }); e.stopImmediatePropagation(); e.preventDefault(); }, true);
  }
})()`;

/* in-page helpers (FIELDTAPS's, made generic: any body child is a layer; the screen = what is under the middle) */
const PAGE = `(() => {
  const F = window.__ftp = {};
  const vis = e => { if (!e || !e.getBoundingClientRect) return false; const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity <= 0.05) return false; let q = e.parentElement; while (q && q !== document.body) { const c = getComputedStyle(q); if (+c.opacity <= 0.05 || c.visibility === 'hidden') return false; q = q.parentElement; } return true; };
  F.vis = vis;
  const NOISE = /toast|Toast|snack|gc-pt-noise/;
  F.layerOf = el => { let e = el; while (e && e.parentElement && e.parentElement !== document.body) e = e.parentElement; return e && e.parentElement === document.body ? e : null; };
  F.lname = e => !e ? '' : (e.id ? '#' + e.id : (e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')));
  F.layers = () => [...document.body.children].filter(e => vis(e) && /fixed|absolute|sticky/.test(getComputedStyle(e).position) && !NOISE.test(e.id + ' ' + e.className) && (e.innerText || '').trim().length > 0).map(F.lname);
  F.top = () => { const W = innerWidth, H = innerHeight; for (const [x, y] of [[W / 2, H * 0.45], [W / 2, H * 0.3], [W / 2, H * 0.65], [W * 0.3, H * 0.5]]) { const h = document.elementFromPoint(x, y); const L = F.layerOf(h); if (L && !NOISE.test(L.id + ' ' + L.className)) return L; } return document.body.firstElementChild; };
  const norm = t => String(t || '').replace(/\\s+/g, ' ').trim();
  const hash = t => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return h; };
  F.text = L => { if (!L) return ''; let t = L.innerText || ''; document.querySelectorAll('[id*=toast],[class*=toast],.gc-pt-noise').forEach(n => { const x = n.innerText; if (x && L.contains(n)) t = t.split(x).join(''); }); return norm(t).replace(/\\d+/g, '#'); };
  F.toast = () => [...document.querySelectorAll('[id*=toast],[class*=toast],[class*=Toast],[role=status],[role=alert],[aria-live]')].filter(vis).map(e => norm(e.innerText).slice(0, 80)).filter(Boolean).join(' / ');
  F.fp = key => { const L = F.top(); const c = key ? F.find(key) : null; const ae = document.activeElement; const bt = norm(document.body.innerText);
    return { href: location.href, hl: history.length, layers: F.layers().join(','), top: F.lname(L), th: hash(F.text(L)), all: hash(bt.replace(/\\d+/g, '#')), blen: bt.length,
      imgs: [...document.querySelectorAll('img,canvas,iframe,embed,object,video')].filter(vis).length,
      cv: [...document.querySelectorAll('canvas')].filter(vis).map(c => { try { return hash(c.toDataURL()); } catch (e) { return 0; } }).join(','),
      ae: ae && ae !== document.body ? F.lname(ae) + ':' + ae.tagName : '', rec: window.__ft ? window.__ft.rec.length : 0, toast: F.toast(),
      cst: c ? [...c.attributes].filter(a => !/^style$/.test(a.name)).map(a => a.name + '=' + a.value).join('&') + '|' + (c.checked ? 1 : 0) + '|' + hash(norm(c.innerText || c.value)) + '|' + hash(c.innerHTML) + '|' + ((c.parentElement && [...c.parentElement.querySelectorAll('input')].map(i => i.type).join()) || '') : '',
      sy: scrollY }; };
  const SEL = 'button,a[href],[role=button],[role=tab],[role=link],[role=switch],[role=checkbox],[role=menuitem],[onclick],input:not([type=hidden]),select,textarea,summary,label[for]';
  const isCtl = e => e.matches(SEL) || (getComputedStyle(e).cursor === 'pointer' && !(e.parentElement && getComputedStyle(e.parentElement).cursor === 'pointer') && e.children.length < 40 && !e.closest('button,a,label'));
  const label = e => norm(e.getAttribute('aria-label') || (e.tagName === 'SELECT' ? (e.name || e.id || 'select') : e.innerText) || e.value || e.placeholder || e.title || e.getAttribute('alt') || e.name || e.id || (e.type ? '[' + e.type + ']' : '')).slice(0, 48);
  const dattr = e => [...e.attributes].filter(a => /^data-(?!pt-|pid$|id$|k$|key$|i$|idx$|reactroot)/.test(a.name) || a.name === 'id' || a.name === 'role' || (a.name === 'name' && e.tagName !== 'A') || (a.name === 'type' && e.tagName === 'INPUT')).map(a => a.name + '=' + a.value.replace(/[0-9a-f]{8,}|\\d{3,}/gi, '#').slice(0, 40)).join(',');
  F.key = e => (e.tagName + '|' + dattr(e) + '|' + label(e).replace(/\\d+/g, '').trim());
  F.roots = () => { const L = F.top(); const out = [L]; for (const c of document.body.children) if (c !== L && vis(c) && /fixed|sticky/.test(getComputedStyle(c).position) && !NOISE.test(c.id + ' ' + c.className) && c.contains(document.elementFromPoint(c.getBoundingClientRect().left + 5, Math.min(innerHeight - 2, c.getBoundingClientRect().top + 5)))) out.push(c); return out.filter(Boolean); };
  F.list = () => {
    const out = [], seen = {};
    F.roots().forEach(R => R.querySelectorAll('*').forEach(e => {
      if (!isCtl(e) || !vis(e) || e.closest('[aria-hidden=true],[inert]')) return;
      if (e.matches('label') && e.querySelector('input,select,textarea')) return;
      if (e.matches('input[type=file]')) return;   /* a file input is reached through its button / label */
      const k = F.key(e); seen[k] = (seen[k] || 0) + 1; if (seen[k] > 1) return;
      out.push({ key: k, label: label(e), tag: e.tagName.toLowerCase(), type: e.type || '', dis: !!(e.disabled || e.getAttribute('aria-disabled') === 'true'), title: norm(e.title || '').slice(0, 80) });
    }));
    return out;
  };
  F.find = key => { for (const R of F.roots()) for (const e of R.querySelectorAll('*')) if (vis(e) && isCtl(e) && F.key(e) === key) return e; return null; };
  F.aim = key => { const e = F.find(key); if (!e) return null; try { e.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch (x) {}
    document.querySelectorAll('.toast,[class*=toast],[class*=Toast]').forEach(t => { t.style.pointerEvents = 'none'; });   /* a toast going away is not a cover */
    const rs = e.getClientRects(); const r = rs.length > 1 ? [...rs].sort((a, b) => b.width * b.height - a.width * a.height)[0] : e.getBoundingClientRect();   /* a link over two lines: its biggest piece */
    const x = Math.max(1, Math.min(innerWidth - 2, r.left + Math.min(r.width / 2, 40) + (r.width > 80 ? r.width / 2 - 40 : 0))), y = Math.max(1, Math.min(innerHeight - 2, r.top + r.height / 2)); const h = document.elementFromPoint(x, y);
    const lab = e.id && document.querySelector('label[for="' + CSS.escape(e.id) + '"]');
    const ok = !!h && (h === e || e.contains(h) || (h.tagName === 'LABEL' && (h.contains(e) || h === lab)) || (e.matches('input,select,textarea') && h.closest && h.closest('label') && h.closest('label').contains(e)));
    let prompt = false; if (!ok && h) { let q = h; while (q && q !== document.body) { const cs = getComputedStyle(q); if (/fixed|absolute/.test(cs.position) && norm(q.innerText).length > 12 && !q.contains(e)) { prompt = !/toast|snack|pill|note/i.test(q.id + ' ' + q.className); break; } q = q.parentElement; } }
    const sel = e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-pressed') === 'true' || e.getAttribute('aria-current') === 'page' || e === document.activeElement || (e.htmlFor && document.getElementById(e.htmlFor) === document.activeElement) || /(^|\\s)(on|active|sel|selected|cur|current|is-on)(\\s|$)/.test(typeof e.className === 'string' ? e.className : '');
    return { x, y, ok, hit: h ? F.lname(F.layerOf(h)) + ' > ' + h.tagName.toLowerCase() + (h.id ? '#' + h.id : '') + (typeof h.className === 'string' && h.className ? '.' + h.className.trim().split(/\\s+/)[0] : '') + ' "' + norm(h.innerText).slice(0, 30) + '"' : 'nothing', onscreen: r.bottom > 0 && r.top < innerHeight, prompt, sel, w: r.width, h: r.height }; };
  /* a prompt left open over a control (a modal inside the same page): its ✕ / Close / Cancel */
  F.closeCover = key => { const e = F.find(key); if (!e) return null; const r = e.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (!h || e.contains(h)) return null;
    let q = h; while (q && q !== document.body && !(/fixed|absolute/.test(getComputedStyle(q).position) && !q.contains(e))) q = q.parentElement; if (!q || q === document.body) return null;
    const B = [...q.querySelectorAll('button,a,[role=button]')].filter(vis), lab = b => (b.getAttribute('aria-label') || b.innerText || '').trim();
    const b = B.find(b => /^(✕|×|✖|x)$/i.test(lab(b)) || /^(close|cerrar)$/i.test(b.getAttribute('aria-label') || '')) || B.find(b => /^(cancel|cancelar|close|cerrar|not now|later|más tarde|ahora no|skip|done|listo|got it|entendido)$/i.test(lab(b)));
    if (!b) return null; const br = b.getBoundingClientRect(); return { x: br.left + br.width / 2, y: br.top + br.height / 2, what: lab(b) }; };
  /* the form around a control: its <form>, else the nearest card / sheet / dialog with inputs */
  F.box = key => { const e = F.find(key); if (!e) return null; let b = e.closest('form'); if (!b) { let q = e.parentElement; while (q && q !== document.body) { if (q.querySelectorAll('input:not([type=hidden]):not([type=file]),textarea,select').length && (q.matches('[role=dialog],.sheet,.card,section,.modal,.lb,.ov,.ss-sheet,details,fieldset') || q.parentElement === document.body || /fixed|absolute/.test(getComputedStyle(q).position))) { b = q; break; } q = q.parentElement; } } return b; };
  F.fill = key => {
    const b = F.box(key); if (!b) return 0; let n = 0;
    const setv = (el, v) => { const p = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); n++; };
    const pw = 'Test-Pass-' + 'q7Z!';
    b.querySelectorAll('input,textarea,select').forEach(el => {
      if (!vis(el) || el.disabled || el.readOnly) return;
      const t = (el.type || '').toLowerCase(), hint = ((el.name || '') + ' ' + (el.id || '') + ' ' + (el.placeholder || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + ((el.labels && el.labels[0] && el.labels[0].innerText) || '') + ' ' + (el.closest('label') ? el.closest('label').innerText : '')).toLowerCase();
      if (t === 'file' || t === 'button' || t === 'submit' || t === 'radio' || t === 'range' || t === 'color') return;
      if (t === 'checkbox') { if (!el.checked && /agree|acuerdo|accept|acepto|consent|i have read|he leído|confirm|certify|later|después/.test(hint)) { el.click(); n++; } return; }
      if (el.tagName === 'SELECT') { if (!el.value && el.options.length > 1) { const o = [...el.options].find(o => o.value); if (o) setv(el, o.value); } return; }
      if (String(el.value || '').trim()) return;
      let v = 'Tap test note';
      if (t === 'email' || /e-?mail|correo/.test(hint)) v = 'pt.tester@example.com';
      else if (t === 'password' || /password|contraseña/.test(hint)) v = pw;
      else if (t === 'tel' || /phone|mobile|tel[eé]fono|cell/.test(hint)) v = '901-555-0177';
      else if (t === 'date') v = new Date(Date.now() + (/start|from|begin|desde|inicio|day|día|when|cuándo|due|vence|schedul|walk/.test(hint) ? 2 : 0) * 864e5).toLocaleDateString('en-CA');
      else if (t === 'time') v = '09:00';
      else if (t === 'month') v = new Date(Date.now()).toISOString().slice(0, 7);
      else if (t === 'number' || /amount|monto|price|precio|total|\\$|qty|cantidad|percent|%/.test(hint)) v = /%|percent|pct/.test(hint) ? '50' : /qty|cantidad|hours|horas/.test(hint) ? '2' : '125';
      else if (/crew|people|workers|personas|cuadrilla|how many|cuántos/.test(hint)) v = '3';
      else if (/\\bstate\\b|estado/.test(hint)) v = 'TN';
      else if (/\\bzip\\b|postal/.test(hint)) v = '38117';
      else if (/\\bcity\\b|ciudad/.test(hint)) v = 'Memphis';
      else if (/code|código|codigo/.test(hint)) v = (el.maxLength > 0 && el.maxLength <= 8) ? '123456'.slice(0, el.maxLength) : '123456';
      else if (/invoice ?#|invoice num|factura|inv(oice)?#/.test(hint)) v = 'PT-1001';
      else if (/full name|your name|nombre|signature|firma|\\bname\\b/.test(hint)) v = 'Sam Sample';
      else if (/company|compañ|empresa|business/.test(hint)) v = 'Sample Drywall LLC';
      else if (/address|direcci/.test(hint)) v = '123 Sample St, Memphis, TN 38117';
      else if (/url|link|website/.test(hint) || t === 'url') v = 'https://example.com/plans';
      if (el.maxLength > 0 && v.length > el.maxLength) v = v.slice(0, el.maxLength);
      if (el.min && t === 'number' && +v < +el.min) v = el.min;
      if (el.max && t === 'number' && +v > +el.max) v = String(Math.min(+el.max, 3));   /* e.g. crew size 1–99 */
      setv(el, v);
    });
    /* a trade / choice chip group with nothing picked: pick the first */
    const chips = b.querySelectorAll('[data-su-trade],[data-trade],[aria-pressed=false]');
    if (chips.length && !b.querySelector('[data-su-trade].on,[data-trade].on,[aria-pressed=true]')) { try { chips[0].click(); n++; } catch (e) {} }
    return n;
  };
  F.fileInputs = key => { const b = F.box(key), n = Date.now(); return b ? [...b.querySelectorAll('input[type=file]')].filter(i => !(i.files && i.files.length) && !i.disabled).map((i, j) => { j = n + '_' + j; i.setAttribute('data-pt-fi', j); return { j, accept: i.accept || '', ctx: norm((i.closest('label,section,.card,div') || i.parentElement).innerText).slice(0, 120) }; }) : []; };
})()`;

const LANGRX = /English|Español|EN ?\/ ?ES|^ES$|^EN$/;
const DESTRUCT = /sign ?out|log ?out|cerrar sesi|salir\b|delete|borrar|eliminar|remove|quitar|🗑|wipe|erase|turn (the )?link off|deactivat|forget this device|olvidar/i;
const SUBMIT = /log ?in|sign ?in|iniciar|entrar|^\[submit\]$|send|enviar|save|guardar|submit|upload|subir|sign\b|firmar|accept|aceptar|post|publicar|request|solicitar|pedir|ask|preguntar|continue|continuar|next|siguiente|create|crear|reset|e-?mail me|verify|verificar|confirm|confirmar|update|actualizar|add|agregar|añadir|check in|i'm here|done|listo|join|unirme|apply|aplicar|pay|pagar|report|reportar|book|schedule|programar|make|hacer|finish|terminar|^ok$|→/i;

/* ═══ the crawl of one user on one device ═══ */
async function crawl(o){
  /* o: { browser, kind, user, label, newContext(kind) → ctx, start(pg) → bool (ready), back: [closer selectors], homeKey?: (pg) → tap, wantFn: RegExp, noteHost } */
  const T00 = Date.now(), kind = o.kind, phone = kind === 'phone';
  const rows = [];
  const log = (screen, control, result, why, extra) => { rows.push(Object.assign({ user: o.user, kind, screen, control, result, why, at: Date.now() }, extra || {}));
    console.log(`  ${((Date.now() - T00) / 1000).toFixed(0)}s ${result === 'OK' ? '✓' : result === 'SKIP' ? '·' : result === 'NOTE' ? '!' : '✗'} [${o.user}/${kind}] ${screen} · ${control} · ${result} · ${String(why).slice(0, 220)}`); };
  const ctx = await o.newContext(kind);
  await ctx.addInitScript(INIT(phone));
  await ctx.addInitScript(PAGE);
  const pg = await ctx.newPage();
  const errs = [], net = [], popups = [], downloads = [], dialogs = [];
  pg.on('pageerror', e => errs.push(String(e.message || e).slice(0, 200)));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|net::ERR_|status of 4\d\d/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
  pg.on('dialog', d => { dialogs.push(d.type() + ': ' + d.message().slice(0, 100)); (d.type() === 'prompt' ? d.accept('Tap test') : d.type() === 'confirm' ? d.dismiss() : d.accept()).catch(() => {}); });
  pg.on('download', d => downloads.push(d));
  const choosers = []; pg.on('filechooser', fc => choosers.push(fc));
  let checking = 0;
  ctx.on('page', p => { if (p !== pg && !checking) { popups.push(p); p.on('download', d => { p.__dl = d; }); p.on('dialog', d => d.dismiss().catch(() => {})); } });
  pg.on('request', rq => { const u = rq.url(); if (!/\/\.netlify\/functions\//.test(u) && !(o.fnHost && o.fnHost(u))) return; try { if (o.isLocal && !o.isLocal(new URL(u))) return; } catch (e) {}   /* an outside host (offline here) is not this portal's function */ let a = ''; try { const b = JSON.parse(rq.postData() || '{}'); a = b.action || b.op || ''; } catch (e) {} const n = { fn: u.split('/').pop().split('?')[0], action: a, at: Date.now(), st: 0, rq }; net.push(n); });
  pg.on('response', async rs => { const n = net.find(x => x.rq === rs.request()); if (!n) return; const st = rs.status(); if (st >= 400) { try { n.body = (await rs.text()).slice(0, 300); } catch (e) {} } n.st = st; n.end = Date.now(); });   /* the answer's words first, then "answered" */
  pg.on('requestfailed', rq => { const n = net.find(x => x.rq === rq); if (n) { n.st = -1; n.end = Date.now(); n.body = rq.failure() && rq.failure().errorText; } });
  const cdp = phone ? await ctx.newCDPSession(pg) : null;
  const throttle = async () => { if (cdp) try { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); } catch (e) {} };
  const finger = async (x, y) => {
    if (!cdp) return pg.mouse.click(x, y);
    try { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 6, radiusY: 6, force: 1, id: 1 }] }); await sleep(110); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); } catch (e) { await pg.touchscreen.tap(x, y); }
  };
  const ev = (f, a) => pg.evaluate(f, a);
  const helpers = () => pg.evaluate(PAGE).catch(() => {});
  /* wait until the page stops changing */
  const settle = async (max) => { let last = '', same = 0; const t0 = Date.now(); while (Date.now() - t0 < (max || 6000)) { const n = await ev(() => { try { return document.querySelectorAll('button,a,input,select').length + ':' + document.body.innerText.length + ':' + window.__ftp.lname(window.__ftp.top()); } catch (e) { return 'x'; } }).catch(() => 'x');
    const busy = net.some(x => !x.st && Date.now() - x.at < 15000); if (n === last && !busy) { if (++same >= 2) return; } else { same = 0; last = n; } await sleep(300); } };
  const restart = async () => {
    for (const p of popups.splice(0)) await p.close().catch(() => {});
    await pg.goto('about:blank').catch(() => {});   /* a real reload (a link with only a new #hash would not reload the page) */
    const ok = await o.start(pg);
    await throttle(); await helpers(); await settle(); return ok;
  };
  const sig = async () => ev(() => { const L = window.__ftp.list(); return { top: window.__ftp.lname(window.__ftp.top()), keys: L.map(c => c.key) }; }).catch(() => ({ top: '', keys: [] }));
  const jac = (a, b) => { const A = new Set(a), B = new Set(b); let i = 0; for (const x of A) if (B.has(x)) i++; const u = A.size + B.size - i; return u ? i / u : 1; };
  const onScreen = async (S) => { const s = await sig(); if (s.top !== S.top) return false; if (jac(s.keys, S.keys) >= 0.7) return true;
    /* most of the screen still there and little new (a message, a picked chip) — not a page of its own */
    return S.keys.filter(k => s.keys.includes(k)).length >= Math.max(1, S.keys.length * 0.8) && s.keys.filter(k => !S.keys.includes(k)).length <= 3; };
  const closeTop = async (S) => {
    /* the way a person goes back: Escape, the sheet's ✕ / Close / ‹ Back / Cancel */
    for (let i = 0; i < 3; i++) {
      if (await onScreen(S)) return true;
      await pg.keyboard.press('Escape').catch(() => {}); await sleep(250);
      if (await onScreen(S)) return true;
      const c = await ev((st) => { const F = window.__ftp; const L = F.top(); if (!L || F.lname(L) === st) return null;
        const B = [...L.querySelectorAll('button,a,[role=button]')].filter(F.vis), lab = b => (b.getAttribute('aria-label') || b.innerText || '').trim();
        const b = B.find(b => /^(✕|×|✖|x)$/i.test(lab(b)) || /^(close|cerrar)$/i.test(b.getAttribute('aria-label') || '')) || B.find(b => /^(‹|←|<)/.test(lab(b)) || /^(back|close|done|cancel|cerrar|volver|atrás|cancelar|listo)$/i.test(lab(b)));
        if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, S.top).catch(() => null);
      if (!c) break; await finger(c.x, c.y); await sleep(500);
    }
    return onScreen(S);
  };
  const tapKey = async (key) => {
    const aim = await ev(k => window.__ftp.aim(k), key).catch(() => null); if (!aim) return null;
    await sleep(120);
    const aim2 = await ev(k => window.__ftp.aim(k), key).catch(() => null) || aim;
    await finger(aim2.x, aim2.y); return aim2;
  };
  const openPath = async (pth) => {
    if (!(await restart())) return { ok: false, why: 'the start page did not open' };
    for (const step of pth) {
      let found = false; for (let i = 0; i < 20 && !found; i++) { found = await ev(k => !!window.__ftp.find(k), step.key).catch(() => false); if (!found) await sleep(300); }
      if (!found) return { ok: false, why: 'could not find "' + step.label + '" to get here — the page: ' + (await ev(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 160)).catch(() => '?')) };
      if (step.fill) await ev(k => window.__ftp.fill(k), step.key).catch(() => 0);
      await tapKey(step.key); await sleep(700); await settle();
    }
    return { ok: true };
  };
  /* is a file a real file? (a PDF starts %PDF, a picture is a picture) */
  const checkUrl = async (url) => {
    if (!/^https?:/i.test(url)) return { ok: true, what: url.slice(0, 40) };
    const u = new URL(url);
    if (o.isPortalPage && o.isPortalPage(u)) return { ok: true, what: 'page ' + u.pathname };
    if (o.isLocal && !o.isLocal(u)) return { ok: true, what: 'goes out to ' + u.host + u.pathname.slice(0, 30) + ' (not fetched: offline)' };
    checking++; const p = await ctx.newPage(); checking--; let r = null, st = 0, ct = '', head = '';
    const dl = p.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    try { r = await p.goto(url, { timeout: 15000, waitUntil: 'commit' }); if (r) { st = r.status(); ct = r.headers()['content-type'] || ''; try { const b = await r.body(); head = b.slice(0, 5).toString('latin1') + ' ' + b.length + ' B'; } catch (e) {} } }
    catch (e) { const d = await dl; if (d) { const f = await d.path().catch(() => null); const b = f ? fs.readFileSync(f) : Buffer.alloc(0); st = b.length ? 200 : 0; ct = /\.pdf$/i.test(d.suggestedFilename()) || /^%PDF-/.test(b.slice(0, 5).toString('latin1')) ? 'application/pdf (download)' : 'application/octet-stream (download)'; head = b.slice(0, 5).toString('latin1') + ' ' + b.length + ' B'; } else head = String(e.message).split('\n')[0].slice(0, 80); }
    await p.close().catch(() => {});
    const file = /pdf|image|octet/.test(ct) || /\.(pdf|jpe?g|png|heic|docx?)(\?|$)/i.test(u.pathname);
    if (!file) return { ok: st > 0 && st < 400, what: 'page ' + st + ' ' + ct.split(';')[0] + ' ' + u.host + u.pathname.slice(0, 40) };
    const pdfOk = !/pdf/.test(ct) && !/\.pdf/i.test(u.pathname) || /^%PDF-/.test(head);
    return { ok: st === 200 && pdfOk && !/^ 0 B/.test(head), what: 'file ' + st + ' ' + ct.split(';')[0] + ' ' + head };
  };
  /* tap one control and see what happens */
  let S_NAME = '';
  const tryControl = async (c) => {
    const errs0 = errs.length, dlg0 = dialogs.length, pop0 = popups.length, dl0 = downloads.length, net0 = net.length;
    let filled = 0, files = [];
    if (SUBMIT.test(c.label) && !/^(INPUT|SELECT|TEXTAREA)$/.test(c.tag.toUpperCase())) {
      filled = await ev(k => window.__ftp.fill(k), c.key).catch(() => 0);
      files = await ev(k => window.__ftp.fileInputs(k), c.key).catch(() => []);
      for (const f of files) { const tf = fileFor(f.accept, f.ctx + ' ' + c.label); const h = await pg.$('[data-pt-fi="' + f.j + '"]'); if (h) { await h.setInputFiles(tf.path).catch(() => {}); } }
      if (filled || files.length) await sleep(400);
    }
    if (/clear sig|borrar firma|limpiar/i.test(c.label)) {   /* something to clear first: a stroke on the signature pad */
      const cv = await ev(k => { const b = window.__ftp.box(k) || document; const v = [...b.querySelectorAll('canvas')].find(window.__ftp.vis); if (!v) return null; v.scrollIntoView({ block: 'center' }); const r = v.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, c.key).catch(() => null);
      if (cv) { await pg.mouse.move(cv.x + cv.w * 0.2, cv.y + cv.h * 0.5); await pg.mouse.down(); await pg.mouse.move(cv.x + cv.w * 0.5, cv.y + cv.h * 0.3, { steps: 5 }); await pg.mouse.move(cv.x + cv.w * 0.8, cv.y + cv.h * 0.6, { steps: 5 }); await pg.mouse.up(); await sleep(200); }
    }
    await ev(k => window.__ftp.aim(k), c.key).catch(() => null); await sleep(80);
    const before = await ev(k => window.__ftp.fp(k), c.key); const fc0 = choosers.length;
    const aim = await tapKey(c.key);
    if (!aim) return { result: 'SKIP', why: 'gone before the tap' };
    const t0 = Date.now(); let what = null, after = null, recs = [];
    const look = async () => {
      after = await ev(k => window.__ftp ? window.__ftp.fp(k) : null, c.key).catch(() => null);
      recs = await ev(n => window.__ft ? window.__ft.rec.slice(n) : [], before.rec).catch(() => []);
      const out = [];
      if (recs.some(r => r.k === 'open-blank') && phone) return 'BAD window.open(' + (recs.find(r => r.k === 'open-blank').v || '') + ') with no address — a black screen in the installed iPhone app';
      if (recs.some(r => r.k === 'open-blob') && phone) return 'BAD opens a blob: address (' + recs.find(r => r.k === 'open-blob').v.slice(0, 40) + ') — a black screen in the installed iPhone app';
      const r1 = recs.filter(r => r.k !== 'error'); if (r1.length) out.push(r1.map(r => r.k + (r.v ? ' ' + r.v.slice(0, 60) : '')).join('; '));
      if (dialogs.length > dlg0) out.push('dialog ' + dialogs[dialogs.length - 1]);
      if (popups.length > pop0) out.push('new window ' + (popups[popups.length - 1].url() || '').slice(0, 60));
      if (downloads.length > dl0) out.push('download ' + downloads[downloads.length - 1].suggestedFilename());
      if (out.length) return out.join(' · ');
      if (!after) return 'page reloaded / navigated';
      if (after.href !== before.href || after.hl !== before.hl) return 'navigated ' + after.href.replace(/^https?:\/\/[^/]+/, '').slice(0, 60);
      if (after.top !== before.top) return 'opened ' + after.top;
      if (after.layers !== before.layers) return 'layers ' + (after.layers.split(',').filter(x => !before.layers.split(',').includes(x)).join(',') || '(one closed)');
      if (after.th !== before.th || after.all !== before.all) return 'content changed';
      if (after.toast && after.toast !== before.toast) return 'toast: ' + after.toast.slice(0, 70);
      if (after.ae !== before.ae && /INPUT|TEXTAREA|SELECT/.test(after.ae)) return 'focused ' + after.ae;
      if (after.cst !== before.cst) return 'state changed';
      if (after.cv !== before.cv) return 'the drawing changed';
      if (Math.abs(after.sy - before.sy) > 80) return 'scrolled to it (' + Math.round(after.sy - before.sy) + ' px)';
      if (choosers.length > fc0) return 'file picker';
      if (net.length > net0) return 'called ' + net.slice(net0).map(n => n.fn + (n.action ? ':' + n.action : '')).join(', ');
      return null;
    };
    while (Date.now() - t0 < HANG_MS && !(what = await look())) await sleep(100);
    let result = 'OK', why = what || '';
    if (!what) {
      const t1 = Date.now(); while (Date.now() - t1 < 4000 && !(what = await look())) await sleep(250);
      result = 'FAIL'; why = what ? 'SLOW ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s → ' + what : 'DEAD: nothing happened in 6 s';
      if (!what && aim.sel) { result = 'OK'; why = 'already the chosen one (nothing to change)'; }
      else if (!what && /^(INPUT|TEXTAREA|SELECT)$/i.test(c.tag)) { result = 'OK'; why = 'a field (typed in by the fill)'; }
      else if (!what) { const dr = await ev(t => window.__ft.drops.filter(d => d.at >= t).length, t0 - 300).catch(() => 0); if (dr) why += ' — iPhone sends no click here (no cursor:pointer, no handler of its own)'; }
    } else if (/^BAD/.test(what)) result = 'FAIL';
    /* its function: wait for the calls this tap made; an error on valid input is a FAIL */
    const t2 = Date.now(); while (net.slice(net0).some(n => !n.st) && Date.now() - t2 < 12000) await sleep(200);
    const calls = net.slice(net0);
    const pend = calls.filter(n => !n.st), bad = calls.filter(n => n.st >= 400 || n.st === -1);
    if (calls.length) why += ' [' + calls.map(n => n.fn.replace(/^portal-access$/, 'pa') + (n.action ? ':' + n.action : '') + '→' + (n.st || '…')).join(' ') + ']';
    if (pend.length) { result = 'FAIL'; why += ' · HANG: ' + pend.map(n => n.fn + ':' + n.action).join(', ') + ' did not answer in 12 s'; }
    if (bad.length && bad.every(n => n.st === 429) && result === 'OK') { result = 'NOTE'; why += ' · 429 "too many": the server\'s limit after the crawl tapped this many times (a person sees the message)'; }
    else if (bad.length && result === 'OK' && bad.every(n => n.st >= 400 && n.st < 500 && n.st !== 404) && await ev(ms => { const t = document.body.innerText; return ms.every(m => m && t.includes(m.slice(0, 40))); }, bad.map(n => { try { return JSON.parse(n.body).error || ''; } catch (e) { return ''; } })).catch(() => false)) {
      result = 'NOTE'; why += ' · EXPLAINED refusal, shown on the page: ' + bad.map(n => n.st + ' ' + String(n.body || '').replace(/\s+/g, ' ').slice(0, 140)).join(' | ');   /* a rule of the business, said plainly (not a broken button) */ }
    else if (bad.length && !(o.okError && bad.every(n => o.okError(n, c)))) { result = 'FAIL'; why += ' · FN ERROR ' + bad.map(n => n.fn + ':' + n.action + ' ' + n.st + ' ' + String(n.body || '').replace(/\s+/g, ' ').slice(0, 120)).join(' | '); }
    if (SUBMIT.test(c.label) && (filled || files.length) && /^(button|input)$/.test(c.tag) && !calls.length && result === 'OK' && /^(content changed|toast)/.test(why)) { const m = await ev(() => [...document.querySelectorAll('[role=alert],.err,.error,[class*=error]')].filter(e => window.__ftp.vis(e)).map(e => e.innerText.trim()).filter(Boolean).join(' / ').slice(0, 160)).catch(() => ''); why += ' (no function called — the page says: "' + (m || '?') + '")'; }
    /* a file picker: answer it with a small real file and check the upload */
    const fcNew = choosers.slice(fc0);
    if ((recs.some(r => r.k === 'file') || fcNew.length) && result !== 'FAIL') {
      if (fcNew.length) await fcNew[0].element().evaluate(i => { window.__ft.lastFile = i; }).catch(() => {});
      const acc = recs.some(r => r.k === 'file') ? recs.find(r => r.k === 'file').v : await fcNew[0].element().getAttribute('accept').catch(() => '');
      const ctxText = await ev(() => { const i = window.__ft.lastFile; return i ? String((i.closest('section,.card,form,[role=dialog]') || i.parentElement || document.body).innerText).slice(0, 200) : ''; }).catch(() => '');
      const tf = fileFor(acc, c.label + ' ' + S_NAME + ' ' + ctxText);
      const h = await pg.evaluateHandle(() => window.__ft.lastFile).catch(() => null);
      const el = h && h.asElement();
      if (el) {
        const n1 = net.length, e1 = errs.length, fp1 = await ev(() => window.__ftp.fp()).catch(() => null);
        await el.setInputFiles(tf.path).catch(e => why += ' · setInputFiles: ' + e.message.slice(0, 60));
        const t3 = Date.now(); while (Date.now() - t3 < 15000) { await sleep(300); const cl = net.slice(n1); if (cl.length && cl.every(n => n.st) && Date.now() - Math.max(...cl.map(n => n.end || 0)) > 1200) break; }
        const fp2 = await ev(() => window.__ftp.fp()).catch(() => null), cl = net.slice(n1);
        const changed = fp1 && fp2 && (fp1.all !== fp2.all || fp1.top !== fp2.top || fp1.layers !== fp2.layers);
        let ur = 'OK', uw = tf.name + ' → ' + (cl.length ? cl.map(n => n.fn.replace(/^portal-access$/, 'pa') + (n.action ? ':' + n.action : '') + '→' + (n.st || '…')).join(' ') : 'no call') + (changed ? ' · the page shows it' : '');
        if (cl.some(n => !n.st)) { ur = 'FAIL'; uw += ' · HANG'; }
        if (cl.some(n => n.st >= 400 || n.st === -1)) { ur = 'FAIL'; uw += ' · ' + cl.filter(n => n.st >= 400 || n.st === -1).map(n => n.fn + ':' + n.action + ' ' + n.st + ' ' + String(n.body || '').slice(0, 100)).join(' | '); }
        if (!cl.length && !changed) { ur = 'FAIL'; uw += ' · nothing happened after the file was picked'; }
        if (errs.length > e1) { ur = 'FAIL'; uw += ' · page error: ' + errs[e1]; }
        c.upload = { result: ur, why: uw };
      }
    }
    /* links / new windows / downloads: is it a real page / file? */
    const links = recs.filter(r => r.k === 'link' && /^https?:/i.test(r.v));
    for (const l of links.slice(0, 2)) { const ck = await checkUrl(l.v); why += ' · ' + ck.what; if (!ck.ok) { result = 'FAIL'; why += ' (NOT A FILE / PAGE)'; } }
    for (const p of popups.slice(pop0)) {
      await sleep(1500); const u = p.url();
      if (p.__dl) { const f = await p.__dl.path().catch(() => null); const b = f ? fs.readFileSync(f) : Buffer.alloc(0); why += ' · the window downloads ' + p.__dl.suggestedFilename() + ' ' + b.slice(0, 5).toString('latin1') + ' ' + b.length + ' B'; if (!b.length || (/\.pdf$/i.test(p.__dl.suggestedFilename()) && !/^%PDF-/.test(b.slice(0, 5).toString('latin1')))) { result = 'FAIL'; why += ' (NOT A REAL FILE)'; } continue; }
      if (/^https?:/i.test(u) && o.isLocal && !o.isLocal(new URL(u))) why += ' · window to ' + new URL(u).host;
      else if (/^chrome-error:/.test(u)) { const tgt = await p.evaluate(() => document.title).catch(() => ''); why += ' · window to an outside address (offline here)'; }
      else if (/^https?:/i.test(u) && !(o.isPortalPage && o.isPortalPage(new URL(u)))) { const ck = await checkUrl(u); why += ' · ' + ck.what; if (!ck.ok) { result = 'FAIL'; why += ' (NOT A FILE / PAGE)'; } }
      else { const t = await p.evaluate(() => (document.body && document.body.innerText || '').length + ' chars').catch(() => '?'); why += ' · window ' + (u || 'about:blank').slice(0, 30) + ' ' + t; if (/^0 chars/.test(t) && !phone) { result = 'FAIL'; why += ' (an empty window)'; } }
    }
    for (const d of downloads.slice(dl0)) { const f = await d.path().catch(() => null); const b = f ? fs.readFileSync(f) : Buffer.alloc(0); const pdfName = /\.pdf$/i.test(d.suggestedFilename()); why += ' · ' + d.suggestedFilename() + ' ' + b.slice(0, 5).toString('latin1') + ' ' + b.length + ' B'; if (!b.length || (pdfName && !/^%PDF-/.test(b.slice(0, 5).toString('latin1')))) { result = 'FAIL'; why += ' (NOT A REAL FILE)'; } }
    const dlb = recs.filter(r => r.k === 'download'); if (dlb.length) { await sleep(800); const by = await ev(n => window.__ft.rec.slice(n).filter(r => r.k === 'dlbytes').map(r => r.v), before.rec).catch(() => []); if (by.length) { why += ' · bytes ' + by[0]; if (/\.pdf/i.test(dlb[0].v) && !/^%PDF-/.test(by[0])) { result = 'FAIL'; why += ' (NOT A PDF)'; } } }
    /* a blank page */
    const fin = await ev(() => window.__ftp ? window.__ftp.fp() : null).catch(() => null);
    if (fin && fin.blen < 25 && !fin.imgs) { result = 'FAIL'; why += ' · BLANK: the page shows nothing'; }
    if (!aim.ok && aim.prompt) { result = result === 'FAIL' ? 'FAIL' : 'NOTE'; why = 'behind an open prompt: ' + aim.hit + ' (the tap did: ' + why + ')'; }
    else if (!aim.ok) { result = 'FAIL'; why = 'COVERED: a tap at its centre lands on ' + aim.hit + ' (the tap did: ' + why + ')'; }
    const e2 = errs.slice(errs0); if (e2.length) { result = 'FAIL'; why += ' · JS ERROR: ' + e2[0]; }
    return { result, why, after, before };
  };

  /* ── go ── */
  try {
    await throttle();
    const t0 = Date.now(); const ok0 = await restart();
    const s0 = (Date.now() - t0) / 1000;
    if (!ok0) { log('(start)', o.label + ' opens', 'FAIL', 'the start page did not open: ' + (await ev(() => document.body.innerText.slice(0, 200)).catch(() => '?')) + ' ' + errs.join(' | ')); throw new Error('nostart'); }
    log('(start)', o.label + ' opens', s0 < 15 ? 'OK' : 'FAIL', 'ready in ' + s0.toFixed(1) + ' s' + (errs.length ? ' · JS ERROR: ' + errs[0] : ''));
    if (errs.length) rows[rows.length - 1].result = 'FAIL';
    const screens = [{ name: o.startName || 'Start', path: [], depth: 0 }]; const seen = new Set(), spawnedTabs = new Set();
    let signOut = null;
    for (let si = 0; si < screens.length; si++) {
      const S = screens[si];
      const passBy = ONLY && !ONLY.test(S.name);   /* PT_ONLY: other screens are only passed through (PT_VIA: the controls that lead on) */
      if (passBy && !VIA) continue;
      if ((Date.now() - T00) / 1000 > BUDGET) { log(S.name, '(screen)', 'SKIP', 'time budget used up (PT_BUDGET ' + BUDGET + ' s)'); continue; }
      const op = await openPath(S.path);
      if (!op.ok) { log(S.name, '(open)', /^could not find/.test(op.why) ? 'SKIP' : 'FAIL', op.why + (/^could not find/.test(op.why) ? ' (the control that opened it is gone: an earlier tap changed the page; it was tapped and logged above)' : '')); continue; }
      const s1 = await sig(); S.top = s1.top; S.keys = s1.keys;
      const sk = S.top + '|' + s1.keys.slice().sort().slice(0, 60).join('~');
      if (S.path.length && seen.has(sk)) { log(S.name, '(open)', 'SKIP', 'the same screen as one already crawled'); continue; }
      seen.add(sk);
      let list = await ev(() => window.__ftp.list());
      if (S.depth >= 1) list = list.slice(0, SHEETMAX);
      if (passBy) list = list.filter(c => VIA.test(c.label));
      console.log(`— ${o.user}/${kind} · ${S.name} (${S.top}) · ${list.length} controls`);
      for (const c of list) {
        if ((Date.now() - T00) / 1000 > BUDGET) { log(S.name, c.label, 'SKIP', 'time budget used up'); continue; }
        if (DESTRUCT.test(c.label)) { if (/sign ?out|log ?out|cerrar sesi|salir/i.test(c.label) && !signOut) signOut = { S, c }; log(S.name, c.label, 'SKIP', 'destructive / ends the session — not tapped here'); continue; }
        if (c.dis) { log(S.name, c.label, 'OK', 'disabled' + (c.title ? ' — ' + c.title : '')); continue; }
        let here = await ev(k => !!window.__ftp.find(k), c.key).catch(() => false);
        if (here && !(await onScreen(S))) here = false;
        if (!here) { await closeTop(S); here = (await onScreen(S)) && await ev(k => !!window.__ftp.find(k), c.key).catch(() => false); }
        if (!here) { const o2 = await openPath(S.path); here = o2.ok && await ev(k => !!window.__ftp.find(k), c.key).catch(() => false); }
        if (!here) { log(S.name, c.label, 'SKIP', 'not on the screen when it was reopened (changed by an earlier tap)'); continue; }
        for (let i = 0; i < 2; i++) {   /* a prompt an earlier tap left open over it: close it the way a person would */
          await ev(k => window.__ftp.aim(k), c.key).catch(() => null); const a0 = await ev(k => window.__ftp.aim(k), c.key).catch(() => null);
          if (!a0 || a0.ok || !a0.prompt) break;
          await pg.keyboard.press('Escape').catch(() => {}); await sleep(250);
          const cc = await ev(k => window.__ftp.closeCover(k), c.key).catch(() => null); if (cc) { await finger(cc.x, cc.y); await sleep(500); }
          else if (i === 0) { await openPath(S.path); }
        }
        S_NAME = S.name; const r = await tryControl(c);
        log(S.name, c.label, r.result, r.why);
        if (LANGRX.test(c.label) && !/^English$|^EN$/.test(c.label) && r.result === 'OK') {   /* back to English: the same toggle again, or the English button */
          await sleep(300); const both = /Engl|EN/.test(c.label) && /Espa|ES/.test(c.label);
          const k2 = both ? c.key : await ev(() => { const b = window.__ftp.list().find(x => /^English$|^EN$/.test(x.label)); return b ? b.key : null; }).catch(() => null);
          if (k2 && await ev(k => !!window.__ftp.find(k), k2).catch(() => false)) { await tapKey(k2); await sleep(800); } }
        if (c.upload) log(S.name, c.label + ' → upload a file', c.upload.result, c.upload.why);
        /* a new sheet / tab / page → its own screen (one or two levels down) */
        if (r.after && r.before && S.depth + 1 <= DEPTH && r.result !== 'FAIL') {
          await settle(4000); const s2 = await sig(); const same = await onScreen(S); const newTop = s2.top !== S.top; const fresh = s2.keys.filter(k => !S.keys.includes(k)).length;
          const tabby = /role=tab|data-tab=|data-jtab=|data-nav|data-go=/i.test(c.key) || (r.after.href !== r.before.href && !/^(tel|mailto|sms):/.test(r.after.href));
          if (tabby && spawnedTabs.has(c.key)) { /* the same tab reached from another screen: crawled once */ }
          else if ((!same || (tabby && /^(content changed|opened|navigated|layers)/.test(r.why))) && (newTop || tabby || (jac(s2.keys, S.keys) < 0.45 && fresh >= 2)) && !LANGRX.test(c.label) && s2.keys.length && !/^(INPUT|SELECT|TEXTAREA)$/i.test(c.tag) && !(r.after.href !== r.before.href && o.isAway && o.isAway(r.after.href)))
            { if (tabby) spawnedTabs.add(c.key); screens.push({ name: S.name + ' › ' + c.label.slice(0, 36), path: S.path.concat([{ key: c.key, label: c.label, fill: SUBMIT.test(c.label) }]), depth: S.depth + 1 }); }
        }
        while (popups.length) { const p = popups.pop(); await p.close().catch(() => {}); }
      }
    }
    /* sign out, last (the way out of the portal works) */
    if (signOut) {
      const op = await openPath(signOut.S.path);
      if (op.ok && await ev(k => !!window.__ftp.find(k), signOut.c.key).catch(() => false)) {
        const r = await tryControl(signOut.c); const back = o.signedOut ? await o.signedOut(pg) : true;
        log(signOut.S.name, signOut.c.label, r.result === 'OK' && back ? 'OK' : 'FAIL', r.why + (back ? ' · back at the sign-in page' : ' · NOT back at the sign-in page'));
      }
    }
  } catch (e) { if (!/nostart/.test(String(e))) log('(run)', '(test)', 'FAIL', 'threw: ' + String(e && e.stack || e).slice(0, 400)); }
  await ctx.close().catch(() => {});
  return rows;
}

/* ═════════════════════════ the portal world (portal.grayco-cs.com) ═════════════════════════ */
async function portalApp(){
  const W = await import(pathToFileURL(path.join(HERE, 'custportal_world.mjs')).href);
  /* the fake cloud, plus what the sub portal needs: Supabase sign-ins (sign-up, password), signed uploads, other buckets */
  const ACC = {}, TOK = {};
  const base = globalThis.fetch;
  const res = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => typeof body === 'string' ? body : JSON.stringify(body), headers: { get: () => null }, arrayBuffer: async () => { const b = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } });
  globalThis.fetch = async (url, init) => {
    init = init || {}; const u = new URL(String(url)), m = (init.method || 'GET').toUpperCase(), hd = init.headers || {};
    if (u.hostname === W.SB_HOST) {
      const auth = String(hd.Authorization || hd.authorization || '').replace(/^Bearer\s+/i, '');
      if (u.pathname === '/auth/v1/admin/users' && m === 'POST') { const b = JSON.parse(init.body); const e = String(b.email).toLowerCase(); if (ACC[e]) return res(422, { msg: 'A user with this email address has already been registered' }); ACC[e] = { pw: b.password, id: 'auth-' + crypto.randomBytes(3).toString('hex') }; return res(200, { id: ACC[e].id, email: e }); }
      if (u.pathname.startsWith('/auth/v1/admin/users/')) { if (m === 'PUT') { const id = u.pathname.split('/').pop(); const b = JSON.parse(init.body || '{}'); const e = Object.keys(ACC).find(k => ACC[k].id === id); if (e && b.password) ACC[e].pw = b.password; } return res(200, {}); }
      if (u.pathname === '/auth/v1/admin/users' && m === 'GET') return res(200, { users: Object.keys(ACC).map(e => ({ id: ACC[e].id, email: e })) });
      if (u.pathname === '/auth/v1/token') { const b = JSON.parse(init.body); const a = ACC[String(b.email).toLowerCase()]; if (!a || a.pw !== b.password) return res(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' }); const t = 't-' + crypto.randomBytes(6).toString('hex'); TOK[t] = String(b.email).toLowerCase(); return res(200, { access_token: t, user: { id: a.id, email: TOK[t] } }); }
      if (u.pathname === '/auth/v1/user' && TOK[auth]) return res(200, { id: ACC[TOK[auth]].id, email: TOK[auth] });
      if (u.pathname === '/auth/v1/recover' || u.pathname === '/auth/v1/otp') return res(200, {});
      if (u.pathname === '/auth/v1/admin/generate_link') { const b = JSON.parse(init.body || '{}'); return ACC[String(b.email).toLowerCase()] ? res(200, { action_link: 'https://bids.grayco-cs.com/#type=recovery&token=test' + sha(b.email).slice(0, 8) }) : res(404, { msg: 'User not found' }); }
      let mm;
      if ((mm = /^\/storage\/v1\/object\/upload\/sign\/([^/]+)\/(.+)$/.exec(u.pathname)) && m === 'POST') return res(200, { url: '/object/upload/sign/' + mm[1] + '/' + mm[2] + '?token=up', token: 'up' });
      if ((mm = /^\/storage\/v1\/object\/sign\/([^/]+)$/.exec(u.pathname))) { const b = JSON.parse(init.body); return res(200, (b.paths || []).map(p => ({ path: p, signedURL: '/object/sign/crm-files/' + p + '?token=t' + sha(p).slice(0, 8) }))); }
      if ((mm = /^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/.exec(u.pathname)) && m === 'POST') return res(200, { signedURL: '/object/sign/crm-files/' + decodeURIComponent(mm[2]) + '?token=t' });
      if ((mm = /^\/storage\/v1\/object\/(?!sign\/|upload\/|crm-files\/)([^/]+)\/(.+)$/.exec(u.pathname))) {
        const k = decodeURIComponent(mm[2]);
        if (m === 'POST' || m === 'PUT') { const b = init.body; W.FILES[k] = { bytes: Buffer.isBuffer(b) ? b : Buffer.from(b instanceof Uint8Array ? b : String(b || '')), type: hd['Content-Type'] || hd['content-type'] || '' }; return res(200, { Key: mm[1] + '/' + k }); }
        if (m === 'DELETE') return res(200, {});
        return W.FILES[k] ? res(200, W.FILES[k].bytes) : res(404, { error: 'not found' });
      }
    }
    return base(url, init);
  };
  const PA = () => require(path.join(W.FNDIR, 'portal-access.js'));
  const SPF = () => require(path.join(W.FNDIR, 'subportal.js'));
  const call = async (fn, b, hd) => W.handlerCall(fn, b, hd);
  const now = () => new Date(Date.now()).toISOString();
  const spRow = (collection, id, data, extra) => Object.assign({ key: collection + '/' + id, collection, id, job_id: null, user_id: null, email: null, data, updated_at: now() }, extra || {});
  const TB = n => W.TABLES[n] || (W.TABLES[n] = []);
  /* the sub's world (made up): an approved sub on a job with a scope, a change order, schedule, punch, invoices, photos, plans,
     messages, site notes; papers partly on file; a bid job on the bid site; another sub on the same job (never shown) */
  const SUB = { id: 'SUBsample1', name: 'Sample Drywall LLC', company: 'Sample Drywall LLC', contact: 'Sam Sample', phone: '901-555-0141', email: 'sam@sampledrywall.test', isSub: true, trade: 'Drywall', w9: true, coi: true, insExp: addDays(200), lang: 'en' };
  const SUB2 = { id: 'SUBother2', name: 'Other Paint Co', company: 'Other Paint Co', contact: 'Otto Other', phone: '901-555-0142', email: 'otto@otherpaint.test', isSub: true, trade: 'Paint' };
  function seedSub(){
    const pdf = W.storeFile(W.pdfOf('Kitchen plans A1-A3', ['Sheet A1 floor plan', 'Sheet A2 elevations']), 'pdf', 'application/pdf');
    const pics = [0, 1, 2, 3].map(i => ({ full: W.storeFile(pngOf(30 * i, 90, 140, 64), 'png', 'image/png'), thumb: W.storeFile(pngOf(30 * i, 91, 140, 16), 'png', 'image/png') }));
    const JOB = { id: 'PSUBJ1', name: 'Sample Kitchen Remodel', address: '77 Sample Ave, Memphis, TN 38117', client: 'Pat Sample', clientPhone: '901-555-0190', clientEmail: 'pat@sample.test', pm: W.S.pm.name, status: 'Active', autoPO: 'SK-2041', contract: 48250,
      startDate: addDays(-3), endDate: addDays(12), siteNotes: { gate: 'Side gate code 4321#', parking: 'Street parking only', hours: '8 AM – 5 PM', dumpster: 'Driveway, left', power: 'Garage outlets', water: 'Hose bib, back', notes: 'Dog in the back yard.' },
      subs: [{ subId: SUB.id, name: SUB.name, status: 'Awarded', startDate: addDays(-1), endDate: addDays(4), price: 6400 }, { subId: SUB2.id, name: SUB2.name, status: 'Awarded', price: 3900 }] };
    const JOB2 = { id: 'PSUBJ2', name: 'Sample Bath Refresh', address: '9 Sample Ct, Memphis, TN 38104', client: 'Lee Sample', pm: W.S.pm.name, status: 'Scheduled', startDate: addDays(9), subs: [{ subId: SUB.id, name: SUB.name, status: 'Awarded', startDate: addDays(9), endDate: addDays(11) }] };
    W.put('projects', W.get('projects').concat([JOB, JOB2]));
    W.put('vendors', [SUB, SUB2]);
    W.put('schedule', (W.get('schedule') || []).concat([{ id: 'R1', pid: JOB.id, subId: SUB.id, date: addDays(1), time: '8:00', endTime: '4:00', title: 'Hang drywall — kitchen' },   /* tomorrow: no photos owed yet, so an invoice goes through */
      { id: 'R2', pid: JOB.id, subId: SUB.id, date: addDays(1), time: '8:00', title: 'Tape and mud' }, { id: 'R3', pid: JOB2.id, subId: SUB.id, date: addDays(9), time: '9:00', title: 'Bath walls' }]));
    W.put('punch', [{ id: 'PU1', pid: JOB.id, subId: SUB.id, item: 'Patch nail pops by the pantry door', dueDate: addDays(5), priority: 'High', status: 'Open' }]);
    W.put('invs', (W.get('invs') || []).concat([{ id: 'INVS1', type: 'sub', subId: SUB.id, pid: JOB.id, amt: 3200, invNum: 'SD-1001', po: 'SK-2041', recvDate: addDays(-2), status: 'received' },
      { id: 'INVS2', type: 'sub', subId: SUB.id, pid: JOB.id, amt: 1800, invNum: 'SD-0990', recvDate: addDays(-20), status: 'Paid', paidDate: addDays(-6) }]));
    W.put('gc_photos', (W.get('gc_photos') || []).concat(pics.map((p, i) => ({ id: 'ph_sub' + i, jobId: JOB.id, ref: p.full, thumbRef: p.thumb, tag: 'During', at: addDays(-i) + 'T15:00:00.000Z', by: W.S.pm.name, source: 'grayco', shared: true }))));
    W.put('projectDocs', (W.get('projectDocs') || []).concat([{ id: 'DOCplan', pid: JOB.id, name: 'Kitchen plans A1–A3.pdf', cat: 'Plans/Drawings', type: 'application/pdf', ref: pdf, uploadedAt: addDays(-8) + 'T10:00:00Z' }]));
    W.put('gc_x10_codes', [{ pid: JOB.id, codes: [{ label: 'Lockbox (front door)', code: '2468' }], log: [] }]);
    W.put('gc_sub_portal_settings', { invPhotoMin: 0 });
    TB('gc_sub_scope').push({ id: 'SC1', sub_id: SUB.id, project_id: JOB.id, kind: 'scope', status: 'published', version: 1, title: 'Drywall — kitchen and pantry', total: 6400, approved_at: addDays(-4) + 'T15:00:00Z', updated_at: addDays(-4) + 'T15:00:00Z',
      data: { lines: [{ room: 'Kitchen', desc: 'Hang 1/2" drywall', qty: 42, unit: 'sheets' }, { room: 'Pantry', desc: 'Hang, tape and finish', qty: 8, unit: 'sheets' }], included: 'Drywall, tape, mud.', excluded: 'Paint.', matGc: 'Sheets.', matSub: 'Mud, tape.', start: addDays(-1), end: addDays(4), files: [{ ref: pdf, name: 'Kitchen plans A1–A3.pdf', type: 'application/pdf' }] } },
      { id: 'CO1', sub_id: SUB.id, project_id: JOB.id, kind: 'co', status: 'published', version: 1, title: 'Add closet ceiling', total: 450, approved_at: addDays(-1) + 'T15:00:00Z', updated_at: addDays(-1) + 'T15:00:00Z', data: { lines: [{ room: 'Closet', desc: 'Hang and finish ceiling', qty: 2, unit: 'sheets' }] } },
      { id: 'SC9', sub_id: SUB2.id, project_id: JOB.id, kind: 'scope', status: 'published', version: 1, title: 'OTHER-SUB scope', total: 3900, data: {} });
    TB('gc_portal_msg').push({ id: 'SM1', project_id: JOB.id, party: 's:' + SUB.id, side: 'gc', author: W.S.pm.name, text: 'Drywall is in the garage.', files: [], created_at: addDays(-1) + 'T13:00:00Z', read_at: null },
      { id: 'SM9', project_id: JOB.id, party: 's:' + SUB2.id, side: 'gc', author: W.S.pm.name, text: 'OTHER-SUB private message', files: [], created_at: addDays(0) + 'T09:00:00Z' });
    /* the bid site: their approved profile (linked to the CRM sub), papers (W-9 + GL on file, workers' comp missing), one open bid job they are invited to */
    const U = { id: 'u_sam', role: 'sub', approved: true, crmSubId: SUB.id, email: SUB.email, name: 'Sam Sample', company: SUB.company, phone: SUB.phone, trades: ['Drywall'], lang: 'en', createdAt: addDays(-90) };
    const BJ = { id: 'j_pt1', title: 'Sample Clinic — interiors', address: '500 Sample Pkwy, Memphis, TN 38117', bidDueDate: addDays(7), status: 'open', visibility: 'private', tradesSought: 'Drywall, Paint', scope: 'Interior build-out, 6 exam rooms.', tradeScopes: [{ id: 'ts1', trade: 'Drywall', scope: 'Hang, tape, Level 4.' }] };
    TB('sp_rows').push(spRow('users', U.id, U, { user_id: U.id, email: U.email }), spRow('jobs', BJ.id, BJ, { job_id: BJ.id }), spRow('invites', 'inv_pt', { id: 'inv_pt', jobId: BJ.id, email: SUB.email }, { job_id: BJ.id, email: SUB.email }),
      spRow('subdocs', U.id, { items: [{ id: 'd1', type: 'w9', name: 'W-9.pdf' }, { id: 'd2', type: 'insurance_general', name: 'GL.pdf', expirationDate: addDays(200) }, { id: 'd3', type: 'insurance_workers_comp', name: 'WC.pdf', expirationDate: addDays(150) }] }, { user_id: U.id }));   /* papers current: bidding is open */
    ACC[SUB.email] = { pw: 'Sam-Pass-1', id: 'auth-sam' };
    const SESSION = W.tok(), LINK = W.tok();
    TB('gc_portal_session').push({ id: sha(SESSION), kind: 'partner', sub_id: SUB.id, links: [LINK], expires_at: new Date(Date.now() + 864e5).toISOString(), last_seen_at: now() });
    TB('gc_sub_link').push({ token: LINK, sub_id: SUB.id, revoked: false, created_at: now() });
    return { SESSION, JOB };
  }
  /* a sub who signed up (the real sign-up) and waits for approval: a pending session */
  async function seedPending(){
    const email = 'nina@samplenewtile.test', pw = 'Nina-Pass-22';
    const r = await call('subportal', { action: 'register', email, password: pw, profile: { name: 'Nina Sample', company: 'Sample New Tile LLC', phone: '901-555-0123', trades: ['Tile'], lang: 'en', businessCity: 'Memphis', businessState: 'TN' } });
    const tok = confirmToken(email); if (tok) await call('subportal', { action: 'signup-confirm', token: tok });   /* SIGNUPVERIFY: the e-mail is confirmed first */
    const s1 = await call('portal-access', { action: 'signin-password', email, password: pw });
    if (!s1.data.session) throw new Error('no pending session: ' + JSON.stringify([r.data, s1.data]).slice(0, 300));
    return s1.data.session;
  }
  /* a GC's own project page (portal.grayco-cs.com/#g=<code>, patch GCP): GrayCo is the sub — pay apps, change orders, RFIs, company papers */
  const GTOK = W.tok();
  function seedGcp(){
    const pdf = W.storeFile(W.pdfOf('Pay application #1', ['Period: October 2026', 'Amount: $25,000.00']), 'pdf', 'application/pdf');
    const coi = W.storeFile(W.pdfOf('Certificate of insurance', ['GrayCo Construction Services', 'General liability']), 'pdf', 'application/pdf');
    const at = new Date(Date.now() - 3 * 864e5).toISOString();
    W.put('customers', (W.get('customers') || []).concat([{ id: 'CUGC', name: 'Ridge Builders', company: 'Ridge Builders', email: 'gina@ridge.test', type: 'gc' }]));
    W.put('projects', W.get('projects').concat([{ id: 'GJ1', name: 'Ridge — Suite 210 build-out', client: 'Ridge Builders', customerId: 'CUGC', gcJob: true, address: '500 Commerce Dr, Memphis TN', autoPO: 'G301', pm: W.S.pm.name, status: 'Active', contract: 120000, startDate: addDays(-10), gcContacts: [{ name: 'Gina GC', email: 'gina@ridge.test', role: 'pm' }] }]));
    const kv = [['gc_gcp_links', [{ token: GTOK, pid: 'GJ1', by: 'test', at, revoked: false }]],
      ['gc_gcp_jobs', { GJ1: { payapps: [{ id: 'pa1', number: 1, period: 'October 2026', amount: 25000, retainage: 2500, retainagePct: 10, ref: pdf, fileName: 'Pay app 1.pdf', status: 'submitted', at }],
        cos: [{ id: 'gco1', number: 1, title: 'Add wall blocking', description: 'Blocking for the casework', amount: 1800, status: 'priced', at }],
        rfis: [{ id: 'rfi1', number: 1, subject: 'Door hardware', question: 'Which lever set for the suite doors?', status: 'open', at, due: addDays(4) }], seq: { pa: 1, co: 1, rfi: 1 }, log: [] } }],
      ['gc_company_docs', [{ id: 'cd1', kind: 'coi', title: 'Certificate of insurance', ref: coi, name: 'COI.pdf', type: 'application/pdf', expires: addDays(200), at, by: 'test', current: true, shareGc: true, access: 'all' }]]];
    TB('gc_lead_inbox_kv').push(...kv.map(([key, value]) => ({ key, value: JSON.stringify(value), updated_at: at })));
  }
  function seedFor(user){
    W.setDay(); W.seedSample({ crmDocs: false });
    for (const k of Object.keys(ACC)) delete ACC[k];
    if (user === 'gc') { const p = W.get('projects'); p[0].portalStyle = 'gc'; p[0].client = 'Ridge Builders LLC'; p[0].type = 'Commercial TI'; W.put('projects', p);
      const c = W.get('customers'); c[0] = Object.assign({}, c[0], { name: 'Ridge Builders LLC', type: 'gc', company: true }); W.put('customers', c); }
    if (user === 'sub' || user === 'subnew') Date.now = W.realNow;   /* the sub portal checks dates against today (the browser's real day); before the sessions are made */
    if (user === 'gcp') seedGcp();
    const sub = seedSub(); W.resetCaches(); try { PA()._core._reset(); } catch (e) {}
    return sub;
  }
  /* SIGNUPVERIFY: the confirm link in the (fake) mail box for an address */
  const confirmToken = email => { for (let i = W.RESEND.length - 1; i >= 0; i--) { const m = W.RESEND[i]; if (JSON.stringify(m.to || '').includes(email)) { const t = /signup-confirm=([A-Za-z0-9_-]{30,80})/.exec(String(m.html || '') + String(m.text || '')); if (t) return t[1]; } } return ''; };
  /* the sign-in page's flows, step by step (each step a row) */
  async function portalFlows(kind){
    const out = [], ctx = await newContext('')(kind), pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    const step = async (flow, name, fn) => { const t0 = Date.now(); let ok = false, why = ''; try { const r = await fn(); ok = r !== false; why = typeof r === 'string' ? r : ''; } catch (e) { why = String(e.message).split('\n')[0].slice(0, 160); }
      const ms = Date.now() - t0; out.push({ user: 'subnew', kind, screen: 'Flow: ' + flow, control: name, result: ok && !errs.length ? 'OK' : 'FAIL', why: (why || (ok ? 'done' : 'did not happen')) + ' (' + (ms / 1000).toFixed(1) + ' s)' + (errs.length ? ' · JS ERROR: ' + errs.splice(0).join(' | ') : ''), at: Date.now() });
      console.log('  ' + (ok ? '✓' : '✗') + ' [subnew/' + kind + '] Flow: ' + flow + ' · ' + name + ' · ' + why); if (!ok) await pg.screenshot({ path: path.join(OUT, 'flow_subnew_' + kind + '_' + out.length + '.png') }).catch(() => {}); return ok; };
    const tap = async sel => { const b = await pg.waitForSelector(sel, { timeout: 15000 }); if (kind === 'phone') await b.tap(); else await b.click(); };
    const email = 'otis@samplenewroof.test', pw = 'Otis-Pass-31';
    await pg.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded' });
    await step('sign up', 'New subcontractor? Create your account → the form', async () => { await tap('#siSignup'); await pg.waitForSelector('#su_company', { timeout: 15000 }); });
    await step('sign up', 'fill it in + a trade + W-9 later + I agree → Create my account', async () => {
      const v = { company: 'Sample New Roof LLC', name: 'Otis Sample', email, phone: '901-555-0188', city: 'Memphis', state: 'TN', pw, pw2: pw };
      for (const k of Object.keys(v)) if (await pg.$('#su_' + k)) await pg.fill('#su_' + k, v[k]);
      await tap('[data-su-trade="Roofing"]'); if (await pg.$('#pp_w9_later')) await pg.check('#pp_w9_later'); await pg.check('#su_agree'); await tap('#suGo');
      await pg.waitForSelector('#svCheck, #pendBox', { timeout: 20000 });
      if (await pg.$('#pendBox')) return 'signed straight in (no e-mail check)';
      return 'SIGNUPVERIFY: "' + (await pg.innerText('#svCheck')).replace(/\s+/g, ' ').slice(0, 80) + '"'; });
    await step('sign up', 'the confirm e-mail → its link → Confirm my e-mail → confirmed', async () => {
      if (!(await pg.$('#svCheck'))) return 'not needed';
      for (let i = 0; i < 20 && !confirmToken(email); i++) await sleep(250); const tok = confirmToken(email); if (!tok) throw new Error('no confirm e-mail');
      await pg.goto(ORIGIN + '/.netlify/functions/subportal?signup-confirm=' + tok); await tap('#b');
      await pg.waitForFunction(() => /confirmed|confirmado/i.test(document.body.innerText), null, { timeout: 15000 });
      return 'the page says: "' + (await pg.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 90))) + '"'; });
    await step('sign up', 'sign in with the new password → the waiting-for-approval page', async () => {
      if (await pg.$('#pendBox')) return 'already there';
      await pg.goto(ORIGIN + '/'); await pg.waitForSelector('#siEmail', { timeout: 15000 }); await pg.fill('#siEmail', email); await pg.fill('#siPw', pw); await tap('#siLogin');
      await pg.waitForSelector('#pendBox', { timeout: 20000 }); return '"' + (await pg.innerText('#pendBox')).replace(/\s+/g, ' ').slice(0, 90) + '"'; });
    await step('sign up', 'the account is on the bid site, not approved (an owner approves it in the CRM)', async () => { const r = (W.TABLES.sp_rows || []).find(x => x.collection === 'users' && x.email === email); return !!(r && r.data.approved === false && r.data.role === 'sub') && 'profile ' + r.id + ' approved:false'; });
    await step('sign up', 'the CRM sees the new sign-up to approve (s-sync bids)', async () => { const r = await call('portal-access', { action: 's-sync' }, { authorization: 'Bearer good-admin' }); return (r.data.bids || []).some(b => b.email === email) && 'in the ✅ Approvals list'; });
    await step('sign up', 'Sign out → the sign-in page', async () => { await tap('#signOut'); await pg.waitForSelector('#siEmail', { timeout: 15000 }); });
    const forgot = async (who) => { await tap('#siForgot'); await pg.waitForSelector('#siWho', { timeout: 15000 }); await pg.fill('#siWho', who); const n0 = W.RESEND.length; await tap('#siSend');
      await pg.waitForSelector('#siCode', { timeout: 15000 }); for (let i = 0; i < 40 && W.RESEND.length === n0; i++) await sleep(200); await sleep(1200); const got = W.RESEND.slice(n0); return got.length ? (got.find(m => /\b\d{6}\b/.test(mailText(m))) || got[got.length - 1]) : null; };
    const mailText = m => String(m.html || m.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    await step('forgot password (new sub, not approved yet)', 'Forgot password? → e-mail → a "Choose a new password" link e-mail (SUBRESET)', async () => {
      const m = await forgot(email); return !!m && /new password/i.test(mailText(m)) && /bids\.grayco-cs\.com/.test(String(m.html)) && 'e-mail "' + m.subject + '" with the reset link (the fake mail box — nothing sent)'; });
    await step('forgot password (new sub, not approved yet)', '‹ Back → the sign-in page', async () => { await tap('#siBack, button:has-text("Back")').catch(() => {}); await pg.goto(ORIGIN + '/'); await pg.waitForSelector('#siForgot', { timeout: 15000 }); });
    await step('forgot password (approved sub)', 'Forgot password? → e-mail → a 6-digit code e-mail', async () => {
      const m = await forgot(SUB.email); const code = m && (/\b(\d{6})\b/.exec(mailText(m)) || [])[1]; pg.__code = code; return !!code && 'e-mail "' + m.subject + '" with a code (the fake mail box — nothing sent)'; });
    await step('forgot password (approved sub)', 'type the code → Sign in → the sub portal', async () => {
      if (!pg.__code) return false; await pg.fill('#siCode', pg.__code); await tap('#siVerify');
      await pg.waitForFunction(() => !!(window.GCPartner && window.GCPartner._state && window.GCPartner._state().home), null, { timeout: 25000 }); return 'signed in as ' + (await pg.evaluate(() => document.body.innerText.match(/Sample Drywall LLC/) ? 'Sample Drywall LLC' : '?')); });
    await step('forgot password (approved sub)', 'a wrong code → a clear message, not signed in', async () => {
      await tap('#signOut'); await pg.waitForSelector('#siForgot', { timeout: 15000 }); await forgot(SUB.email);
      await pg.fill('#siCode', '000000'); await tap('#siVerify'); await sleep(2000); const e = (await pg.innerText('#siErr').catch(() => '')).trim();
      return !!e && !(await pg.evaluate(() => !!(window.GCPartner && window.GCPartner._state && window.GCPartner._state().home))) && 'says: "' + e.slice(0, 80) + '"'; });
    await ctx.close();
    return out;
  }
  /* the approved sub's bid with a real PDF, end to end (the bid site's bid row = what GrayCo's 📊 All bids shows) */
  async function subFlows(kind, sub){
    /* a fresh session: the crawl ended with Sign out, which ended the old one */
    const SESS = W.tok(); TB('gc_portal_session').push({ id: sha(SESS), kind: 'partner', sub_id: SUB.id, links: [TB('gc_sub_link').find(l => l.sub_id === SUB.id).token], expires_at: new Date(Date.now() + 864e5).toISOString(), last_seen_at: now() });
    const out = [], ctx = await newContext(SESS)(kind), pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    const step = async (flow, name, fn) => { const t0 = Date.now(); let ok = false, why = ''; try { const r = await fn(); ok = r !== false; why = typeof r === 'string' ? r : ''; } catch (e) { why = String(e.message).split('\n')[0].slice(0, 200); }
      out.push({ user: 'sub', kind, screen: 'Flow: ' + flow, control: name, result: ok && !errs.length ? 'OK' : 'FAIL', why: (why || (ok ? 'done' : 'did not happen')) + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)' + (errs.length ? ' · JS ERROR: ' + errs.splice(0).join(' | ') : ''), at: Date.now() });
      console.log('  ' + (ok ? '✓' : '✗') + ' [sub/' + kind + '] Flow: ' + flow + ' · ' + name + ' · ' + why); if (!ok) await pg.screenshot({ path: path.join(OUT, 'flow_sub_' + kind + '_' + out.length + '.png') }).catch(() => {}); return ok; };
    const tap = async sel => { const b = await pg.waitForSelector(sel, { timeout: 15000 }); await b.scrollIntoViewIfNeeded().catch(() => {}); if (kind === 'phone') await b.tap(); else await b.click(); };
    await pg.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded' });
    await step('bid with a PDF', 'the sub portal opens (a new sign-in)', async () => { await pg.waitForFunction(() => !!(window.GCPartner && window.GCPartner._state && window.GCPartner._state().home), null, { timeout: 30000 }); return 'open'; });
    await step('bid with a PDF', 'Bids → Open & bid → the bid form', async () => { await tap('#tabs button[data-tab="bids"], #tabs button:has-text("Bids")'); await tap('button:has-text("Open & bid"), button:has-text("See my bid")'); await pg.waitForSelector('#bidSend', { timeout: 15000 }); return 'open (' + (await pg.innerText('#bidSend')) + ')'; });   /* the crawl may have sent one already: then it is "See my bid" → Update bid */
    await step('bid with a PDF', 'amount + the bid PDF → Submit bid → sent to GrayCo', async () => {
      const amt = await pg.$('.bidform input[type=number]:not([data-bidline])'); await amt.fill('9800');
      await pg.setInputFiles('#bidFiles', TESTFILES.bid.path);
      const bidOf = () => (W.TABLES.sp_rows || []).filter(r => r.collection === 'bids' && r.data && +r.data.amount === 9800).pop();
      await tap('#bidSend');
      for (let i = 0; i < 60 && !bidOf(); i++) await sleep(250);
      const b = bidOf();
      const msg = await pg.evaluate(() => [...document.querySelectorAll('[role=alert],.err,.toast')].map(e => e.innerText.trim()).filter(Boolean).join(' / ')).catch(() => '');
      if (!b) throw new Error('no bid saved — the page says: "' + msg + '"');
      const d = b.data || {}; return 'the bid on the bid site: $' + d.amount + ' · its PDF: ' + JSON.stringify((d.docs || d.files || []).map(f => f.name)).slice(0, 80) + (msg ? ' · page: "' + msg.slice(0, 60) + '"' : ''); });
    await ctx.close();
    return out;
  }
  const srv = await W.startServer();
  const { chromium } = require(W.PW);
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP ' + W.HOST + ' 127.0.0.1', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=' + W.HOST] });
  const newContext = (session) => async (kind) => {
    const ctx = await browser.newContext(kind === 'phone' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: IPHONE_UA, serviceWorkers: 'block', acceptDownloads: true }
      : { viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
    await ctx.route(W.SB + '/**', async r => {
      const rq = r.request(), u = new URL(rq.url());
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (rq.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors, body: '' });
      const mm = /\/storage\/v1\/object\/upload\/sign\/([^/]+)\/(.+)$/.exec(u.pathname);
      if (mm && (rq.method() === 'PUT' || rq.method() === 'POST')) { const k = decodeURIComponent(mm[2]); W.FILES[k] = { bytes: rq.postDataBuffer() || Buffer.alloc(0), type: rq.headers()['content-type'] || '' }; return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ Key: mm[1] + '/' + k }) }); }
      const name = decodeURIComponent(u.pathname.replace(/^.*\/object\/(sign\/)?(crm-files|subportal-files)\//, '')); const f = W.FILES[name];
      return f ? r.fulfill({ status: 200, headers: cors, contentType: f.type || (/\.pdf$/.test(name) ? 'application/pdf' : 'image/jpeg'), body: f.bytes }) : r.fulfill({ status: 404, headers: cors, body: '' });
    });
    await ctx.route(W.CC_IMG + '/**', r => { const u = new URL(r.request().url()); const f = W.FILES[u.pathname.slice(1)]; return f ? r.fulfill({ status: 200, contentType: 'image/jpeg', body: f.bytes }) : r.fulfill({ status: 404, body: '' }); });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com|unpkg\.com|jsdelivr\.net/, r => r.fulfill({ status: 200, contentType: /css/.test(r.request().url()) ? 'text/css' : 'application/javascript', body: '' }));
    await ctx.addInitScript(([s]) => { try { localStorage.setItem('gc_pwa_dismiss', String(Date.now())); localStorage.setItem('gc_lang', 'en'); if (s) localStorage.setItem('gc_portal_s', s); } catch (e) {} }, [session || '']);
    return ctx;
  };
  const ORIGIN = srv.ORIGIN;
  const isPortalPage = u => u.host.split(':')[0] === W.HOST && !/\.(pdf|jpe?g|png)$/i.test(u.pathname) && !/\/object\//.test(u.pathname);
  const isLocal = u => u.host.split(':')[0] === W.HOST || u.host === W.SB_HOST || u.host === new URL(W.CC_IMG).host;
  const signedOut = async pg => !!(await pg.waitForSelector('#siEmail, #siLogin, #signinBox', { timeout: 8000 }).catch(() => null));
  const portalErr = (n, c) => /sign ?out|salir/i.test(c.label) && n.action === 'whoami' && n.st === 404;   /* after Sign out the old session is gone (expected) */
  const runs = [];
  for (const user of USERS) for (const kind of DEVS) {
    const sub = seedFor(user);
    console.log('\n═══ ' + user + ' · ' + kind + ' ═══');
    let rows = [];
    if (user === 'cust' || user === 'gc') {
      rows = await crawl({ kind, user, label: user === 'gc' ? 'the GC customer portal' : 'the customer portal', startName: 'Home', newContext: newContext(''), isPortalPage, isLocal, signedOut, okError: portalErr,
        start: async pg => { await pg.goto(ORIGIN + '/#t=' + W.S.link, { waitUntil: 'domcontentloaded' }).catch(() => {}); return !!(await pg.waitForSelector('#track, #gcpMain, #main .card', { timeout: 30000 }).catch(() => null)); } });
    } else if (user === 'gcp') {
      rows = await crawl({ kind, user, label: 'the GC project page (#g=)', startName: 'GC page', newContext: newContext(''), isPortalPage, isLocal, signedOut, okError: portalErr,
        start: async pg => { await pg.goto(ORIGIN + '/#g=' + GTOK, { waitUntil: 'domcontentloaded' }).catch(() => {}); return !!(await pg.waitForFunction(() => /Suite 210/.test(document.body.innerText) && document.querySelectorAll('#main button, #main a').length > 2, null, { timeout: 30000 }).catch(() => null)); } });
    } else if (user === 'sub') {
      rows = await crawl({ kind, user, label: 'the sub portal', startName: 'Home', newContext: newContext(sub.SESSION), isPortalPage, isLocal, signedOut, okError: portalErr,
        start: async pg => { await pg.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded' }).catch(() => {}); return !!(await pg.waitForFunction(() => !!(window.GCPartner && window.GCPartner._state && window.GCPartner._state().home) && document.querySelector('#tabs button'), null, { timeout: 30000 }).catch(() => null)); } });
      rows.push(...await (subFlows(kind, sub).catch(e => [{ user: 'sub', kind, screen: 'Flow', control: '(flow)', result: 'FAIL', why: 'threw: ' + String(e && e.message).slice(0, 200), at: Date.now() }])));
      /* the CRM side: what the sub sent is waiting for the CRM (s-sync, as an admin's CRM asks every minute) — and only this sub's */
      const ev2 = (W.TABLES.gc_sub_event || []).filter(e => e.sub_id === SUB.id), kinds = {}; ev2.forEach(e => { kinds[e.kind] = (kinds[e.kind] || 0) + 1; });
      const sy = await call('portal-access', { action: 's-sync' }, { authorization: 'Bearer good-admin' });
      const seen = (sy.data.events || []).filter(e => e.sub_id === SUB.id).map(e => e.kind);
      const msgs = (W.TABLES.gc_portal_msg || []).filter(m => m.party === 's:' + SUB.id && m.side === 'them').length;
      const mine = (sy.data.events || []).every(e => e.sub_id === SUB.id);
      const want = ['invoice', 'photos', 'paper'].filter(k => kinds[k]);
      rows.push({ user, kind, screen: '(CRM side)', control: 'what the sub sent reaches the CRM (s-sync)', result: sy.status === 200 && want.every(k => seen.includes(k)) && mine ? 'OK' : 'FAIL',
        why: 'sent: ' + JSON.stringify(kinds) + ' · the CRM gets ' + seen.length + ' events (' + [...new Set(seen)].join(', ') + ') · messages to GrayCo: ' + msgs + (mine ? '' : ' · ANOTHER SUB\'S EVENT'), at: Date.now() });
      console.log('  (CRM side) ' + rows[rows.length - 1].result + ' · ' + rows[rows.length - 1].why);
    } else if (user === 'subnew') {
      /* 1. the sign-in page (sign up, forgot password, e-mail me a code) — nobody signed in */
      const a = await crawl({ kind, user, label: 'the sign-in page', startName: 'Sign-in', newContext: newContext(''), isPortalPage, isLocal, signedOut, okError: (n, c) => /signin|signup|register|code|reset|forgot/i.test(n.action) && n.st === 400 || n.st === 401,
        start: async pg => { await pg.evaluate(() => { try { localStorage.removeItem('gc_portal_s'); } catch (e) {} }).catch(() => {}); await pg.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded' }).catch(() => {}); return !!(await pg.waitForSelector('#siEmail', { timeout: 30000 }).catch(() => null)); } });
      a.forEach(r => { r.screen = 'Sign-in: ' + r.screen; });
      /* 1b. the two flows end to end with good input: sign up (→ signed straight in, waiting for approval) and forgot password
         (→ a code by e-mail → signed in) */
      a.push(...await (portalFlows(kind).catch(e => [{ user: 'subnew', kind, screen: 'Flow', control: '(flow)', result: 'FAIL', why: 'threw: ' + String(e && e.message).slice(0, 200), at: Date.now() }])));
      /* 2. signed up, waiting for approval */
      const pend = await seedPending();
      const b = await crawl({ kind, user, label: 'the waiting-for-approval page', startName: 'Pending', newContext: newContext(pend), isPortalPage, isLocal, signedOut, okError: portalErr,
        start: async pg => { await pg.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded' }).catch(() => {}); return !!(await pg.waitForSelector('#pendBox', { timeout: 30000 }).catch(() => null)); } });
      rows = a.concat(b);
    }
    runs.push(report(user, kind, rows));
  }
  await browser.close().catch(() => {}); await srv.close().catch(() => {});
  return runs;
}

/* ═════════════════════════ the bid site (bids.grayco-cs.com) ═════════════════════════ */
async function bidsApp(){
  const W = await import(pathToFileURL(path.join(HERE, 'qaa_world.mjs')).href);
  W.install();
  const MAILS = []; process.env.RESEND_API_KEY = 'test-placeholder-not-a-key'; delete process.env.PORTAL_MAIL_OFF;   /* e-mails go to a fake Resend below (nothing is sent) */
  { const f0 = globalThis.fetch; globalThis.fetch = async (url, init) => { const u = new URL(String(url));   /* the one-time reset link the server makes (Supabase admin generate_link) */
      if (u.host === 'api.resend.com') { try { MAILS.push(JSON.parse(init.body)); } catch (e) {} return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ id: 'em_' + MAILS.length }), text: async () => '{}' }; }
      if (u.host === 'sb.test' && u.pathname === '/auth/v1/admin/generate_link') { const b = JSON.parse((init && init.body) || '{}'); const ok = !!W.ACC[String(b.email).toLowerCase()];
        return { ok, status: ok ? 200 : 404, headers: { get: () => null }, json: async () => ok ? { action_link: 'https://bids.grayco-cs.com/#type=recovery&token=test' } : { msg: 'User not found' }, text: async () => '{}' }; }
      return f0(url, init); }; }
  const F = W.fns(ROOT);
  const { chromium } = require(path.join(SPX, 'node_modules', 'playwright'));
  const CDN = '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/leadtxt/cdnfix/cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:9'] });
  const now = () => new Date().toISOString();
  function seed(){
    W.DB.sp_rows.length = 0; W.STORE.clear(); for (const k of Object.keys(W.ACC)) delete W.ACC[k];
    W.H.resetCloud && W.H.resetCloud();
    W.H.cset('projects', [{ id: 'PB1', name: 'Sample Clinic', address: '500 Sample Pkwy, Memphis, TN 38117', status: 'Active', subs: [] }]);
    W.H.cset('vendors', [{ id: 'SUBbid1', name: 'Sample Drywall LLC', company: 'Sample Drywall LLC', email: 'sam@sampledrywall.test', isSub: true, trade: 'Drywall' }]);
    const U = { id: 'u_sam', role: 'sub', approved: true, email: 'sam@sampledrywall.test', name: 'Sam Sample', company: 'Sample Drywall LLC', phone: '901-555-0141', trades: ['Drywall'], lang: 'en', createdAt: now() };
    const N = { id: 'u_new', role: 'sub', approved: false, email: 'nina@samplenewtile.test', name: 'Nina Sample', company: 'Sample New Tile LLC', phone: '901-555-0123', trades: ['Tile'], lang: 'en', createdAt: now() };
    W.ACC[U.email] = { pw: 'Sam-Pass-1', id: U.id }; W.ACC[N.email] = { pw: 'Nina-Pass-22', id: N.id };
    W.putRow('users', U.id, U, { user_id: U.id, email: U.email }); W.putRow('users', N.id, N, { user_id: N.id, email: N.email });
    const plan = W.PDF('A-101', 3000); W.STORE.set('subportal-files/plans/j_pt1/A-101.pdf', plan);
    const BJ = { id: 'j_pt1', title: 'Sample Clinic — interiors', address: '500 Sample Pkwy, Memphis, TN 38117', bidDueDate: addDays(7), status: 'open', visibility: 'public', tradesSought: 'Drywall, Paint', scope: 'Interior build-out, 6 exam rooms.', tradeScopes: [{ id: 'ts1', trade: 'Drywall', scope: 'Hang, tape, Level 4.' }], createdAt: now() };
    W.putRow('jobs', BJ.id, BJ, { job_id: BJ.id });
    W.putRow('plans', BJ.id, { items: [{ id: 'pl1', name: 'A-101 Floor Plan.pdf', category: 'Plans', type: 'application/pdf', fileRef: 'subportal-files/plans/j_pt1/A-101.pdf', size: plan.length }] }, { job_id: BJ.id });
    W.putRow('invites', 'inv_pt', { id: 'inv_pt', jobId: BJ.id, email: U.email }, { job_id: BJ.id, email: U.email });
    W.putRow('subdocs', U.id, { items: [{ id: 'd1', type: 'w9', name: 'W-9.pdf' }, { id: 'd2', type: 'insurance_general', name: 'GL.pdf', expirationDate: addDays(200) }, { id: 'd3', type: 'insurance_workers_comp', name: 'WC.pdf', expirationDate: addDays(150) }] }, { user_id: U.id });
  }
  /* bidsCtx's routes (the real subportal.js, the fake Supabase sign-in) in an iPhone / 1440×900 context */
  const newContext = async (kind) => {
    const real = browser.newContext.bind(browser);
    browser.newContext = opts => real(Object.assign({}, opts, kind === 'phone' ? { userAgent: IPHONE_UA, deviceScaleFactor: 2, acceptDownloads: true } : { viewport: { width: 1440, height: 900 }, acceptDownloads: true }));
    let ctx; try { ctx = await W.bidsCtx(browser, ROOT, F, kind); } finally { browser.newContext = real; }
    await ctx.route(u => new URL(u).host === 'cdnjs.cloudflare.com', r => { const f = CDN + path.basename(new URL(r.request().url()).pathname); return fs.existsSync(f) ? r.fulfill({ path: f, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }) : r.fulfill({ status: 404, body: '' }); });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    return ctx;
  };
  /* the bid site's sign-in flows with good input: Request Access (signed in, waiting for approval) · Forgot password (the reset e-mail) · wrong password */
  async function bidFlows(kind){
    const out = [], ctx = await newContext(kind), pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    const step = async (flow, name, fn) => { const t0 = Date.now(); let ok = false, why = ''; try { const r = await fn(); ok = r !== false; why = typeof r === 'string' ? r : ''; } catch (e) { why = String(e.message).split('\n')[0].slice(0, 160); }
      out.push({ user: 'bidnew', kind, screen: 'Flow: ' + flow, control: name, result: ok && !errs.length ? 'OK' : 'FAIL', why: (why || (ok ? 'done' : 'did not happen')) + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)' + (errs.length ? ' · JS ERROR: ' + errs.splice(0).join(' | ') : ''), at: Date.now() });
      console.log('  ' + (ok ? '✓' : '✗') + ' [bidnew/' + kind + '] Flow: ' + flow + ' · ' + name + ' · ' + why); if (!ok) await pg.screenshot({ path: path.join(OUT, 'flow_bidnew_' + kind + '_' + out.length + '.png') }).catch(() => {}); return ok; };
    const tapEl = async b => { if (kind === 'phone') await b.tap(); else await b.click(); };
    const tap = async sel => tapEl(await pg.waitForSelector(sel, { timeout: 15000 }));
    const tapLast = async sel => { await pg.waitForSelector(sel, { timeout: 15000 }); const all = await pg.$$(sel); await tapEl(all[all.length - 1]); };
    const n0 = () => W.CALLS.length;
    await pg.goto('https://bids.test/', { waitUntil: 'domcontentloaded' }); await pg.waitForSelector('input[type=email]', { timeout: 30000 });
    await step('wrong password', 'Log In with a wrong password: a clear message + "E-mail me a reset link"', async () => {
      await pg.fill('input[type=email]', 'sam@sampledrywall.test'); await pg.fill('input[type=password]', 'not-the-password'); await tapLast('button:has-text("Log In")');
      await pg.waitForSelector('[data-selfreset]', { timeout: 15000 }); return 'shows the reset button'; });
    await step('forgot password', 'Forgot password? then Send the link: the reset e-mail is asked for', async () => {
      await tap('button:has-text("Forgot password?")'); const c0 = n0(); await tap('button:has-text("Send the link")');
      const said = await pg.waitForFunction(() => /on its way|en camino/i.test(document.body.innerText), null, { timeout: 10000 }).then(() => true, () => false);
      const c = W.CALLS.slice(c0).find(c => /reset-password/.test(c));
      if (!(c && said)) throw new Error('not done — calls: ' + W.CALLS.slice(c0).join(' ') + ' · page: ' + (await pg.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200))));
      const m = MAILS[MAILS.length - 1]; return c + ' · "a link to choose a new password is on its way"' + (m ? ' · e-mail "' + m.subject + '" (the fake mail box — nothing sent)' : ''); });
    await step('sign up', 'Request Access, fill it in + a trade, submit: signed in, waiting for approval', async () => {
      await pg.goto('https://bids.test/?r=' + Date.now()); await tap('button:has-text("Request Access")');
      await pg.waitForSelector('[data-su="company"]', { timeout: 15000 });
      const v = { company: 'Sample New Siding LLC', name: 'Sid Sample', email: 'sid@samplenewsiding.test', phone: '901-555-0166', city: 'Memphis', state: 'TN', pw: 'Sid-Pass-77' };
      for (const k of Object.keys(v)) await pg.fill('[data-su="' + k + '"]', v[k]);
      if (await pg.$('[data-su="pw2"]')) await pg.fill('[data-su="pw2"]', v.pw);
      await tap('[data-su-trade]');
      for (const cb of await pg.$$('input[type=checkbox]')) { const lab = await cb.evaluate(e => (e.closest('label') || e.parentElement).innerText); if (/agree|acuerdo|terms|later|después/i.test(lab)) await cb.check().catch(() => {}); }
      const c0 = n0(); await tapLast('button:has-text("Request Access")');
      await pg.waitForFunction(() => !document.querySelector('[data-su="company"]'), null, { timeout: 20000 });
      await pg.waitForFunction(() => /approv|aprob|confirm/i.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
      const prof = W.rowsOf('users').find(r => r.data.email === v.email); const txt = await pg.evaluate(() => document.body.innerText);
      pg.__v = v; pg.__verify = !!(await pg.$('[data-verify-note]'));
      return !!prof && prof.data.approved !== true && /approv|confirm/i.test(txt) && 'account made (approved: ' + prof.data.approved + ') · ' + W.CALLS.slice(c0).filter(c => /register|signup/.test(c)).join(' ') + (pg.__verify ? ' · "' + (await pg.innerText('[data-verify-note]')).replace(/\s+/g, ' ').slice(0, 70) + '"' : ' · the page says it waits for approval'); });
    await step('sign up', 'the confirm e-mail\'s link → confirmed → Log In → waiting for approval', async () => {
      if (!pg.__verify) return 'no e-mail check';
      const m = [...MAILS].reverse().find(x => JSON.stringify(x.to || '').includes(pg.__v.email)); const tok = m && (/signup-confirm=([A-Za-z0-9_-]{30,80})/.exec(String(m.html || '')) || [])[1]; if (!tok) throw new Error('no confirm e-mail');
      const r = await F.sp.handler({ httpMethod: 'POST', headers: { origin: 'https://bids.test' }, body: JSON.stringify({ action: 'signup-confirm', token: tok }) }); if (r.statusCode !== 200) throw new Error('confirm ' + r.statusCode + ' ' + r.body);
      await pg.fill('input[type=email]', pg.__v.email); await pg.fill('input[type=password]', pg.__v.pw); await tapLast('button:has-text("Log In")');
      await pg.waitForFunction(() => /approv|aprob/i.test(document.body.innerText) && !document.querySelector('input[type=password]'), null, { timeout: 20000 });
      return 'confirmed → signed in: the waiting-for-approval page'; });
    await ctx.close();
    return out;
  }
  /* the bid site's papers: My Documents → Upload Document → a W-9 PDF → Save → on their papers (what the bid check reads) */
  async function bidDocFlow(kind, login){
    const out = [], ctx = await newContext(kind), pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    const step = async (flow, name, fn) => { const t0 = Date.now(); let ok = false, why = ''; try { const r = await fn(); ok = r !== false; why = typeof r === 'string' ? r : ''; } catch (e) { why = String(e.message).split('\n')[0].slice(0, 200); }
      out.push({ user: 'bidsub', kind, screen: 'Flow: ' + flow, control: name, result: ok && !errs.length ? 'OK' : 'FAIL', why: (why || (ok ? 'done' : 'did not happen')) + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)' + (errs.length ? ' · JS ERROR: ' + errs.splice(0).join(' | ') : ''), at: Date.now() });
      console.log('  ' + (ok ? '✓' : '✗') + ' [bidsub/' + kind + '] Flow: ' + flow + ' · ' + name + ' · ' + why); if (!ok) await pg.screenshot({ path: path.join(OUT, 'flow_bidsub_' + kind + '_' + out.length + '.png') }).catch(() => {}); return ok; };
    const tapEl = async b => { await b.scrollIntoViewIfNeeded().catch(() => {}); if (kind === 'phone') await b.tap(); else await b.click(); };
    const tapLast = async sel => { await pg.waitForSelector(sel, { timeout: 15000 }); const all = await pg.$$(sel); await tapEl(all[all.length - 1]); };
    await login(pg, 'sam@sampledrywall.test', 'Sam-Pass-1');
    await step('papers', 'My Documents → Upload Document → the form', async () => { await tapLast('button[role=tab]:has-text("My Documents")'); await tapLast('button:has-text("Upload Document")'); await pg.waitForSelector('input[type=file]', { state: 'attached', timeout: 15000 }); return 'open'; });
    await step('papers', 'a W-9 PDF → Save → on their papers', async () => {
      await pg.setInputFiles('input[type=file]', TESTFILES.paper.path); await sleep(600); await tapLast('button:has-text("Save")');
      await pg.waitForFunction(() => /Document saved/.test(document.body.innerText), null, { timeout: 15000 });
      const items = ((W.rowData('subdocs/u_sam') || {}).items || []); const w9 = items.find(d => d.type === 'w9' && d.fileName === TESTFILES.paper.name);
      return !!w9 && '"Document saved." · subdocs: ' + items.map(d => d.type + (d.fileName ? ':' + d.fileName : '')).join(', '); });
    await ctx.close();
    return out;
  }
  const isPortalPage = u => u.host === 'bids.test' && !/\.(pdf|jpe?g|png)$/i.test(u.pathname);
  const fnHost = u => /sb\.test\/(rest|storage)/.test(u);
  const isLocal = u => u.host === 'bids.test' || u.host === 'sb.test';
  const runs = [];
  for (const user of USERS) for (const kind of DEVS) {
    seed();
    console.log('\n═══ ' + user + ' · ' + kind + ' ═══');
    const login = async (pg, email, pw) => {
      await pg.goto('https://bids.test/', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await pg.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} }).catch(() => {});   /* signed out: start at the sign-in page */
      await pg.goto('https://bids.test/?r=' + Date.now(), { waitUntil: 'domcontentloaded' }).catch(() => {});
      if (!email) return !!(await pg.waitForSelector('input[type=email]', { timeout: 30000 }).catch(() => null));
      await W.bidsLogin(pg, email, pw);
      return !!(await pg.waitForFunction(() => !document.querySelector('input[type=password]') && document.body.innerText.length > 80, null, { timeout: 30000 }).catch(() => null));
    };
    let rows;
    const signedOut = async pg => !!(await pg.waitForSelector('input[type=email]', { timeout: 8000 }).catch(() => null));
    if (user === 'bidsub') { rows = await crawl({ kind, user, label: 'the bid site', startName: 'Bids', newContext, isPortalPage, isLocal, fnHost, signedOut, start: pg => login(pg, 'sam@sampledrywall.test', 'Sam-Pass-1') });
      rows.push(...await (bidDocFlow(kind, login).catch(e => [{ user: 'bidsub', kind, screen: 'Flow', control: '(flow)', result: 'FAIL', why: 'threw: ' + String(e && e.message).slice(0, 200), at: Date.now() }]))); }
    else {
      const a = await crawl({ kind, user, label: 'the bid site sign-in', startName: 'Sign-in', newContext, isPortalPage, isLocal, fnHost, signedOut, okError: (n) => n.st === 400 || n.st === 401 || n.st === 422, start: pg => login(pg) });
      a.forEach(r => { r.screen = 'Sign-in: ' + r.screen; });
      a.push(...await (bidFlows(kind).catch(e => [{ user: 'bidnew', kind, screen: 'Flow', control: '(flow)', result: 'FAIL', why: 'threw: ' + String(e && e.message).slice(0, 200), at: Date.now() }])));
      const b = await crawl({ kind, user, label: 'the bid site (not approved yet)', startName: 'Waiting', newContext, isPortalPage, isLocal, fnHost, signedOut, start: pg => login(pg, 'nina@samplenewtile.test', 'Nina-Pass-22') });
      rows = a.concat(b);
    }
    runs.push(report(user, kind, rows));
  }
  await browser.close().catch(() => {});
  return runs;
}

/* ═══ the report ═══ */
function report(user, kind, rows){
  fs.writeFileSync(path.join(OUT, 'pt_' + user + '_' + kind + '.json'), JSON.stringify(rows, null, 1));
  const tapped = rows.filter(r => r.result === 'OK' || r.result === 'FAIL'), f = rows.filter(r => r.result === 'FAIL');
  console.log(`== ${user}/${kind}: ${tapped.length} controls tapped, ${tapped.length - f.length} OK, ${f.length} FAIL, ${rows.filter(r => r.result === 'SKIP').length} skipped, ${rows.filter(r => r.result === 'NOTE').length} notes`);
  return { user, kind, tapped: tapped.length, ok: tapped.length - f.length, fail: f.length, rows };
}
const runs = APP === 'portal' ? await portalApp() : await bidsApp();
console.log('\n| user | device | controls tapped | OK | FAIL |\n|---|---|---|---|---|');
for (const r of runs) console.log(`| ${r.user} | ${r.kind} | ${r.tapped} | ${r.ok} | ${r.fail} |`);
console.log('\n| user/device | screen | control | result | why |\n|---|---|---|---|---|');
for (const r of runs) for (const x of r.rows.filter(x => x.result === 'FAIL' || x.result === 'NOTE')) console.log(`| ${x.user}/${x.kind} | ${x.screen} | ${x.control} | ${x.result} | ${String(x.why).replace(/\|/g, '/').slice(0, 300)} |`);
const nf = runs.reduce((a, r) => a + r.fail, 0);
console.log(`PORTALTAPS ${APP}: ${runs.reduce((a, r) => a + r.ok, 0)} OK · ${nf} FAIL`);
process.exit(nf ? 1 : 0);
