// qa_lib.mjs — the pieces of the release QA gate (tools/qa/owner_walk.mjs): the live snapshot loaded into the offline
// harness, the device profiles (slow phone link, slow CPU, full localStorage, safe areas), the request log and the
// per-screen checks. No company data lives here; the snapshot is read from the scratchpad at run time.
import fs from 'fs'; import path from 'path'; import zlib from 'zlib'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/* ── device profiles ── */
export const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1';
export const DESK_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
export const PROFILES = {
  owner: { id: 'owner', label: 'Owner iPhone', role: 'admin', phone: true, viewport: { width: 390, height: 844 }, dsf: 3, shotScale: 2, ua: IPHONE_UA,
    net: { down: 400, up: 150, rtt: 300 }, cpu: 3, lsFull: true, safe: { top: 47, bottom: 34, left: 0, right: 0 }, openBudgetMs: 3000, maxStepMB: 4 },
  pm: { id: 'pm', label: 'PM iPhone', role: 'pm', phone: true, viewport: { width: 390, height: 844 }, dsf: 3, shotScale: 2, ua: IPHONE_UA,
    net: { down: 400, up: 150, rtt: 300 }, cpu: 3, lsFull: true, safe: { top: 47, bottom: 34, left: 0, right: 0 }, openBudgetMs: 3000, maxStepMB: 4 },
  desk: { id: 'desk', label: 'Office desk', role: 'office', phone: false, viewport: { width: 1440, height: 900 }, dsf: 1, shotScale: 1, ua: DESK_UA,
    net: null, cpu: 1, lsFull: false, safe: { top: 0, bottom: 0, left: 0, right: 0 }, openBudgetMs: 5000, maxStepMB: 40 }
};

/* ── the snapshot ── */
export function latestSnap(root){
  const d = fs.existsSync(root) ? fs.readdirSync(root).filter(x => fs.existsSync(path.join(root, x, 'rows.ndjson'))).sort() : [];
  return d.length ? path.join(root, d[d.length - 1]) : null;
}
export function readSnap(dir){
  const rows = fs.readFileSync(path.join(dir, 'rows.ndjson'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const kv = new Map(rows.map(r => [r.key, r]));
  return { dir, rows, kv, get: k => (kv.get(k) || {}).value };
}
export function loadIntoHarness(H, snap){
  H.resetCloud();
  for (const r of snap.rows) H.cloud.set(r.key, { key: r.key, value: r.value, updated_at: r.updated_at || new Date().toISOString() });
  return snap.rows.length;
}
/* sign-in accounts from the snapshot's users list: real e-mails and roles, harness passwords (offline only) */
const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
export function accountsFromSnap(H, snap){
  const users = (snap.get('users') || []).filter(u => u && u.email && u.active !== false);
  for (const k of Object.keys(H.ACCOUNTS)) delete H.ACCOUNTS[k];
  const roleOf = r => /admin/i.test(r) && !/office/i.test(r) ? 'admin' : /office/i.test(r) ? 'office' : 'staff';
  const seen = new Set(); const map = {};
  for (const u of users) {
    const e = String(u.email).toLowerCase(); if (seen.has(e)) continue; seen.add(e);
    H.ACCOUNTS[e] = { id: 'u-' + String(u.id || e).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20), name: u.name, role: roleOf(u.role || '') };
  }
  const pick = (rx, pref) => { const l = users.filter(u => rx.test(u.role || '')); return l.find(u => pref && sameName(u.name, pref)) || l[0]; };
  map.admin = pick(/^admin$/i, 'Wesley Johnson') || pick(/admin/i);
  map.office = pick(/office/i);
  map.pm = pick(/project manager/i, 'Steven Biffle') || pick(/manager/i);
  map.marketing = pick(/marketing/i);
  const dupEmails = users.map(u => String(u.email).toLowerCase()).filter((e, i, a) => a.indexOf(e) !== i);
  return { map, users, dupEmails };
}

/* localStorage the way the owner's phone has it: the key sizes from the phone's own report (ls.top), then filler to
   leave only the room the phone has left (Safari's 5 MB ≈ 2,621,440 UTF-16 chars, minus what the phone reported in use) */
export function lsPlan(snap){
  const rep = snap.get('gc_perfrep_Pmvve7f9egdot') || Object.values(Object.fromEntries([...snap.kv].filter(([k]) => /^gc_perfrep_/.test(k)).map(([k, r]) => [k, r.value]))).find(r => r && r.ls) || {};
  const ls = rep.ls || { top: [], chars: 2500000, keys: 200 };
  const free = Math.max(20000, 2621440 - (ls.chars || 0));
  const top = (ls.top || []).map(([k, n]) => { const v = snap.get(k); let s = v !== undefined ? JSON.stringify(v) : null; if (!s || s.length > n * 1.2) s = JSON.stringify(Array.from({ length: Math.max(1, Math.floor((n - 2) / 40)) }, (_, i) => 'qa-fill-' + String(i).padStart(8, '0') + '-' + 'x'.repeat(16))); return [k, s]; });
  return { top, free, phoneChars: ls.chars, phoneKeys: ls.keys, from: rep.dev || '?' };
}
export function lsInitScript(plan){
  return `(() => { try {
    if (localStorage.getItem('__qa_ls_filled')) return;
    const top = ${JSON.stringify(plan.top)};
    for (const [k, v] of top) { try { if (localStorage.getItem(k) == null) localStorage.setItem(k, v); } catch (e) {} }
    const used = () => { let n = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += k.length + (localStorage.getItem(k) || '').length; } return n; };
    let n = 0, sz = 200000; const leave = ${plan.free};
    /* fill to the browser's limit, then give back what the phone has left */
    while (sz >= 2000) { try { localStorage.setItem('gc_qa_fill_' + (n++), 'f'.repeat(sz)); } catch (e) { n--; try { localStorage.removeItem('gc_qa_fill_' + n); } catch (x) {} sz = sz >> 1; n++; } if (n > 400) break; }
    let give = leave; for (let i = n - 1; i >= 0 && give > 0; i--) { const k = 'gc_qa_fill_' + i; const v = localStorage.getItem(k); if (v == null) continue; if (v.length <= give) { localStorage.removeItem(k); give -= v.length; } else { localStorage.setItem(k, v.slice(0, v.length - give)); give = 0; } }
    localStorage.setItem('__qa_ls_filled', String(used()));
  } catch (e) { try { localStorage.setItem('__qa_ls_filled', 'err ' + e.message); } catch (x) {} } })()`;
}

/* in-page probes, installed before the page's own scripts */
export const PROBE_INIT = `(() => {
  const Q = window.__qa = { lt: [], err: [], clip: 0, ext: 0 };
  /* a copy to the clipboard, and a tap that hands off to another app (tel: / sms: / mailto: / maps): reactions the page itself
     does not draw — counted so the crawler does not call those buttons dead */
  try { const cb = navigator.clipboard; if (cb) { const w = cb.writeText && cb.writeText.bind(cb); if (w) cb.writeText = t => { Q.clip++; return w(t).catch(() => {}); }; const w2 = cb.write && cb.write.bind(cb); if (w2) cb.write = d => { Q.clip++; return w2(d).catch(() => {}); }; } } catch (e) {}
  try { const ex = document.execCommand.bind(document); document.execCommand = function(c){ if (/^(copy|cut)$/i.test(c)) Q.clip++; return ex.apply(document, arguments); }; } catch (e) {}
  const EXT = /^(tel|sms|mailto|maps|geo|facetime|whatsapp):|^https?:[/][/](maps[.](google|apple)[.]com|www[.]google[.]com[/]maps)/i;
  try { const op = window.open; window.open = function(u){ if (EXT.test(String(u || ''))) Q.ext++; return op.apply(window, arguments); }; } catch (e) {}
  try { document.addEventListener('click', ev => { const a = ev.target && ev.target.closest && ev.target.closest('a[href]'); if (a && EXT.test(a.getAttribute('href') || '')) Q.ext++; }, true); } catch (e) {}
  try { const as = Location.prototype.assign, rp = Location.prototype.replace; Location.prototype.assign = function(u){ if (EXT.test(String(u))) { Q.ext++; return; } return as.call(this, u); }; Location.prototype.replace = function(u){ if (EXT.test(String(u))) { Q.ext++; return; } return rp.call(this, u); }; } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) Q.lt.push({ t: e.startTime, ms: Math.round(e.duration) }); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  /* the offline harness serves the CRM as app.local: the CRM's own "⛔ WRONG SITE" bar (for copies on other hosts) is the
     harness's doing, not the release's — take it away so it does not cover the real screen */
  try { new MutationObserver(l => { for (const m of l) for (const n of m.addedNodes) if (n.nodeType === 1 && /^\u26D4 WRONG SITE/.test(n.textContent || '')) { n.remove(); Q.wrongSiteBar = (Q.wrongSiteBar || 0) + 1; } }).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
})()`;

/* ── the slow link: every answer the offline harness gives is held back the way a 400 kbps / 300 ms phone link would.
   (Chromium's own throttling does not apply to answers that a route fulfils, so the gate times them itself.)
   Static files already fetched once count as revalidated (304, a round trip only): the CRM is served no-cache. ── */
const SIZE = new Map();
function wireSize(buf, ctype){
  if (!buf || buf.length < 1024) return buf ? buf.length : 0;
  if (/image|font|octet|pdf|zip/.test(ctype || '')) return buf.length;
  return zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } }).length;
}
function fileWire(p){
  const st = fs.statSync(p); const k = p + ':' + st.mtimeMs;
  if (!SIZE.has(k)) { const b = fs.readFileSync(p); SIZE.set(k, { raw: b.length, wire: wireSize(b, /\.(png|jpe?g|gif|webp|pdf|woff2?)$/i.test(p) ? 'image' : 'text') }); }
  return SIZE.get(k);
}
export class Link {
  constructor(net){ this.net = net; this.downFree = 0; this.upFree = 0; this.log = []; this.seen = new Set(); this.taps = []; }
  /* big transfers queue on the link one after another; small ones (requests, small answers) slip in between at the link's
     speed (a fair-share approximation: a 400-byte GET does not wait for a 2 MB upload to finish) */
  async hold(up, down){
    const n = this.net; if (!n || this.off) return 0;
    const now = Date.now(); const SMALL = 16384;
    const upMs = up * 8 / n.up; let upDone;
    if (up > SMALL) { const s1 = Math.max(now, this.upFree); this.upFree = s1 + upMs; upDone = this.upFree; } else upDone = now + upMs;
    const arrive = upDone + n.rtt / 2;
    const dnMs = down * 8 / n.down; let dnDone;
    if (down > SMALL) { const s2 = Math.max(arrive + n.rtt / 2, this.downFree); this.downFree = s2 + dnMs; dnDone = this.downFree; } else dnDone = arrive + n.rtt / 2 + dnMs;
    const wait = dnDone - now; if (wait > 0) await new Promise(r => setTimeout(r, wait));
    return wait;
  }
}
export function kvKeysOf(u, method, body){
  const out = [];
  if (method === 'GET') { const k = u.searchParams.get('key'); if (k) out.push(decodeURIComponent(k)); return out; }
  try { const b = JSON.parse(body || 'null'); [].concat(b || []).forEach(r => r && r.key && out.push(r.key)); } catch (e) {}
  if (!out.length) { const k = u.searchParams.get('key'); if (k) out.push(decodeURIComponent(k).replace(/^eq\./, '')); }
  return out;
}

/* patch the browser the harness launches: the profile's device, the slow link, the request log, console errors */
export function patchPlaywright(nm, getProfile){
  const pw = require(path.join(nm, 'playwright'));
  const ch = pw.chromium; if (ch.__qaPatched) return; ch.__qaPatched = true;
  const launch = ch.launch.bind(ch);
  ch.launch = async (o) => {
    const b = await launch(o);
    const nc = b.newContext.bind(b);
    b.newContext = async (co) => {
      const P = getProfile(); const S = P.__state;
      co = Object.assign({}, co, { viewport: P.viewport, deviceScaleFactor: P.dsf, isMobile: !!P.phone, hasTouch: !!P.phone, userAgent: P.ua });
      const ctx = await nc(co);
      S.link = new Link(P.net); S.link.off = !!S.fast;
      ctx.on('console', m => { if (m.type() === 'error') S.console.push({ at: Date.now(), text: String(m.text()).slice(0, 300) }); });
      ctx.on('page', async pg => {
        pg.on('pageerror', e => S.pageErrors.push({ at: Date.now(), text: String(e && e.message || e).slice(0, 300) }));
        try {
          const cdp = await ctx.newCDPSession(pg); S.cdp = cdp;
          if (P.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: P.cpu });
          if (P.safe && (P.safe.top || P.safe.bottom)) await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: P.safe });
          if (P.net) { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: P.net.rtt, downloadThroughput: P.net.down * 125, uploadThroughput: P.net.up * 125 }); }
        } catch (e) { S.notes.push('CDP: ' + e.message); }
      });
      const route = ctx.route.bind(ctx);
      ctx.route = (url, handler, ro) => route(url, async (r0, rq0) => {
        const rq = r0.request(); let u; try { u = new URL(rq.url()); } catch (e) { u = null; }
        const up = (rq.postDataBuffer() || Buffer.alloc(0)).length + 400;
        const rec = { at: Date.now(), m: rq.method(), host: u ? u.host : '', path: u ? u.pathname : '', q: u ? u.search.slice(0, 300) : '', up, down: 0, raw: 0, wait: 0, keys: [] };
        if (u && /\/rest\/v1\/gc_kv/.test(u.pathname)) rec.keys = kvKeysOf(u, rec.m, rq.postData());
        const L = S.link;
        const W = {
          request: () => r0.request(),
          fulfill: async o => {
            let raw = 0, wire = 0;
            try {
              if (o.path) { const f = fileWire(o.path); raw = f.raw; wire = f.wire; const key = rec.host + rec.path; if (L.seen.has(key) && (rec.host === 'app.local' || o.path.includes('/cdn/'))) { wire = 300; rec.revalidated = true; } L.seen.add(key); }
              else { const b = o.body == null ? Buffer.alloc(0) : Buffer.isBuffer(o.body) ? o.body : Buffer.from(String(o.body)); raw = b.length; wire = wireSize(b, o.contentType); }
            } catch (e) {}
            rec.raw = raw; rec.down = wire + 300;
            if (rec.m !== 'OPTIONS') rec.wait = Math.round(await L.hold(rec.up, rec.down));
            rec.end = Date.now(); L.log.push(rec);
            try { return await r0.fulfill(o); } catch (e) { rec.pageGaveUp = true; /* the page stopped waiting (timeout / abort) before the slow link delivered */ }
          },
          abort: (...a) => { rec.end = Date.now(); rec.aborted = true; L.log.push(rec); return r0.abort(...a); },
          fallback: (...a) => r0.fallback(...a),
          continue: (...a) => r0.continue(...a)
        };
        return handler(W, rq0);
      }, ro);
      return ctx;
    };
    return b;
  };
}

/* ── the per-screen audit, run in the page ── */
export function pageAudit(opt){
  const vw = innerWidth, vh = innerHeight, safe = opt.safe || { top: 0, bottom: 0 };
  const out = { vw, vh, url: location.hash, fails: [], warns: [], info: {} };
  const P = (s, el) => { const e = el || {}; return (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + (s ? ' "' + s + '"' : ''); };
  const txt = e => (e.innerText || e.textContent || e.getAttribute('aria-label') || e.title || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const rgba = s => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  /* (checkVisibility: the inside of a closed <details> / a content-visibility:hidden box still has a layout box, but is not drawn) */
  const vis = e => { if (!e || !e.isConnected) return false; if (e.checkVisibility && !e.checkVisibility()) return false; const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw; };
  const bgOf = e => { let c = { r: 255, g: 255, b: 255 }; const stack = []; for (let x = e; x && x.nodeType === 1; x = x.parentElement) { const s = getComputedStyle(x); const bc = rgba(s.backgroundColor); if (s.backgroundImage && s.backgroundImage !== 'none' && !/url\(/.test(s.backgroundImage)) { const m = /rgba?\([^)]+\)/.exec(s.backgroundImage); if (m) stack.push(Object.assign(rgba(m[0]), { grad: true })); } if (bc && bc.a > 0) { stack.push(bc); if (bc.a >= 0.99) break; } }
    for (let i = stack.length - 1; i >= 0; i--) { const s = stack[i]; c = { r: s.r * s.a + c.r * (1 - s.a), g: s.g * s.a + c.g * (1 - s.a), b: s.b * s.a + c.b * (1 - s.a), grad: c.grad || s.grad }; } return c; };
  const hsl = c => { const r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return { h, s, l }; };
  const isNavy = c => { const x = hsl(c); return x.l < 0.32 && x.s > 0.2 && x.h >= 195 && x.h <= 250; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  // 1. navy cover (grid sample of what is actually on screen)
  if (opt.phone) {
    let n = 0, nv = 0; const who = {};
    for (let y = 6; y < vh; y += 24) for (let x = 6; x < vw; x += 24) { const e = document.elementFromPoint(x, y); if (!e) continue; n++; let hit = null; for (let a = e; a && a.nodeType === 1; a = a.parentElement) { const bc = rgba(getComputedStyle(a).backgroundColor); if (bc && bc.a >= 0.85) { hit = a; break; } } if (hit) { const c = rgba(getComputedStyle(hit).backgroundColor); if (isNavy(c)) { nv++; const k = P('', hit) + ' ' + getComputedStyle(hit).backgroundColor; who[k] = (who[k] || 0) + 1; } } }
    out.info.navyPct = n ? Math.round(nv * 100 / n) : 0;
    if (n && nv / n > 0.30) out.fails.push({ check: 'navy', msg: `dark navy covers ${out.info.navyPct}% of the phone screen (owner rule: white pages, no navy)`, el: Object.entries(who).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]).join(' · ') });
    /* owner 11/19: ANY dark-navy card or background region on a phone page is a failure, by count, not by area (each My Approvals
       card was navy and under the 30 % line); buttons are left out */
    else {
      const nc = [], seenN = new Set();
      for (const e of document.querySelectorAll('body *')) {
        if (/^(BUTTON|A|INPUT|SELECT|OPTION|TEXTAREA|svg|path|IMG)$/i.test(e.tagName) || e.closest('button,[role=button],a[href]')) continue;
        const r = e.getBoundingClientRect(); if (r.width < 60 || r.height < 30 || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
        const c = rgba(getComputedStyle(e).backgroundColor); if (!c || c.a < 0.85 || !isNavy(c)) continue;
        const h = document.elementFromPoint(Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), Math.min(vh - 1, Math.max(0, r.top + Math.min(r.height / 2, 20)))); if (!h || !(e === h || e.contains(h))) continue;
        if ([...seenN].some(x => x.contains(e))) continue; seenN.add(e); nc.push(P(txt(e), e) + ' ' + getComputedStyle(e).backgroundColor);
      }
      out.info.navyCards = nc.length;
      if (nc.length) out.fails.push({ check: 'navy', msg: `${nc.length} dark navy card(s) / region(s) on the phone screen (owner rule: no navy on the phone)`, list: nc.slice(0, 8) });
    }
    if (n && nv / n <= 0.30 && nv / n > 0.12) out.warns.push({ check: 'navy', msg: `dark navy covers ${out.info.navyPct}% of the screen`, el: Object.entries(who).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]).join(' · ') });
  }
  // 2. the unsent note
  const un = document.getElementById('gc-unsent-note'); if (un && vis(un)) { let what = ''; try { const u = window._gcUnsent ? window._gcUnsent() : null; what = JSON.stringify(u).slice(0, 300); } catch (e) {} out.fails.push({ check: 'unsent', msg: '#gc-unsent-note is showing: "' + (un.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120) + '"', el: what ? 'unsent: ' + what : '' }); }
  // clip rect of an element (overflow ancestors)
  const clip = e => { let r = e.getBoundingClientRect(); let L = r.left, T = r.top, R = r.right, B = r.bottom; for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (/(hidden|auto|scroll|clip)/.test(s.overflow + s.overflowX + s.overflowY)) { const q = a.getBoundingClientRect(); L = Math.max(L, q.left); T = Math.max(T, q.top); R = Math.min(R, q.right); B = Math.min(B, q.bottom); } } L = Math.max(L, 0); T = Math.max(T, 0); R = Math.min(R, vw); B = Math.min(B, vh); return R - L > 2 && B - T > 2 ? { L, T, R, B } : null; };
  const owns = (b, h) => h && (b === h || b.contains(h) || (h.contains(b) && h.getBoundingClientRect().width * h.getBoundingClientRect().height < b.getBoundingClientRect().width * b.getBoundingClientRect().height * 1.6) || (h.tagName === 'LABEL' && h.control === b));
  const fullLayer = h => { for (let a = h; a && a.nodeType === 1; a = a.parentElement) { const s = getComputedStyle(a); if (s.position === 'fixed') { const r = a.getBoundingClientRect(); return r.width * r.height > vw * vh * 0.6 ? a : null; } } return null; };
  const BTN = 'button,[role=button],a[href],input[type=button],input[type=submit],.btn,[onclick]';
  /* only what is on this screen: the top layer (a Field page / a sheet) and the small fixed controls over it — not the
     desk page the Field layer covers */
  const layerOf = e => { for (let a = e; a && a !== document.body; a = a.parentElement) if (getComputedStyle(a).position === 'fixed') return a; return document.body; };
  const zOf = e => { if (e === document.body) return 0; let m = 0; for (let a = e; a && a !== document.body; a = a.parentElement) { const v = parseInt(getComputedStyle(a).zIndex); if (!isNaN(v)) m = Math.max(m, v); } return m; };
  const bigL = l => { const r = l.getBoundingClientRect(); return r.width * r.height > vw * vh * 0.3; };
  const visL = e => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; };
  const bigLayers = [...document.querySelectorAll('body *')].filter(e => { if (getComputedStyle(e).position !== 'fixed' || !visL(e)) return false; for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) if (getComputedStyle(a).position === 'fixed') return false; return bigL(e); });
  const withBtn = l => [...l.querySelectorAll(BTN)].some(vis);
  const topRec = bigLayers.map((e, i) => ({ e, i, z: zOf(e) })).sort((a, b) => b.z - a.z || b.i - a.i).find(x => withBtn(x.e));
  const topL = topRec ? topRec.e : document.body;
  const onScreen = e => { const l = layerOf(e); return l === topL || (l !== document.body && (bigL(l) ? zOf(l) >= zOf(topL) && withBtn(l) : zOf(l) >= zOf(topL))); };
  /* a fixed / sticky bar at the top or bottom edge: content scrolls under it (not "behind") */
  const edgeBar = h => { for (let a = h; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (s.position === 'fixed' || s.position === 'sticky') { const r = a.getBoundingClientRect(); return r.width >= vw * 0.8 && r.height < vh * 0.3 && (r.top <= (safe.top || 0) + 8 || r.bottom >= vh - 2); } } return false; };
  const buttons = [...document.querySelectorAll(BTN)].filter(vis).filter(b => !b.closest('[aria-hidden=true]')).filter(onScreen);
  out.info.buttons = buttons.length;
  // 3. x is behind y (hit-test the visible buttons)
  const behind = [];
  for (const b of buttons.slice(0, 400)) {
    const c = clip(b); if (!c) continue;
    const pts = [[(c.L + c.R) / 2, (c.T + c.B) / 2]];
    const ok = pts.some(([x, y]) => owns(b, document.elementFromPoint(x, y)));
    if (!ok) { const [x, y] = pts[0]; const h = document.elementFromPoint(x, y); if (!h) continue; const fl = fullLayer(h); const myL = fullLayer(b); if (fl && fl !== myL && !(myL && fl.contains(myL))) continue; /* a sheet / modal is open over it: expected */ if (edgeBar(h) && !edgeBar(b)) continue; /* scrolled under the header / bottom bar */ behind.push({ x: P(txt(b), b), y: P(txt(h), h), at: [Math.round(x), Math.round(y)] }); }
  }
  out.info.behind = behind.length;
  if (behind.length) out.fails.push({ check: 'behind', msg: `${behind.length} visible button(s) cannot be tapped: covered by another element`, list: behind.slice(0, 12).map(z => `${z.x} is behind ${z.y} @${z.at}`) });
  // 4. close / back buttons: inside the safe area and tappable
  const CB = /^(✕|×|✖|x|close|back|‹|←|⟵|< ?back|‹ ?back|done|cancel)\b|^‹|^←|^✕|^×/i;
  const cbs = buttons.filter(b => !/^[‹←]?\s*(prev|next|previous)\b/i.test(txt(b)) && CB.test(txt(b)) || /close|back/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.title || '')));
  const cbBad = [];
  for (const b of cbs) { const r = b.getBoundingClientRect(); if (r.bottom <= 0 || r.top >= vh) continue; const why = []; if (opt.phone && r.top < safe.top - 1) why.push(`top ${Math.round(r.top)} px is under the status bar (safe top ${safe.top})`); if (opt.phone && r.bottom > vh - safe.bottom + 1 && r.top > vh / 2) why.push(`bottom ${Math.round(r.bottom)} px is under the home bar`); const c = clip(b); const h = c && document.elementFromPoint((c.L + c.R) / 2, (c.T + c.B) / 2); if (!c || !owns(b, h)) { const fl = h && fullLayer(h); if (!(fl && !fl.contains(b)) && !(h && edgeBar(h) && !edgeBar(b))) why.push('not hit-testable' + (h ? ' (hit ' + P(txt(h), h) + ')' : '')); } if (opt.phone && (r.width < 30 || r.height < 30)) why.push(`small target ${Math.round(r.width)}x${Math.round(r.height)}`); if (why.length) cbBad.push(P(txt(b), b) + ': ' + why.join('; ')); }
  out.info.closeBack = cbs.length;
  if (cbBad.length) out.fails.push({ check: 'closeback', msg: `${cbBad.length} close/back button(s) outside the safe area or not tappable`, list: cbBad.slice(0, 8) });
  // 5. floating pill / button over content mid-screen
  if (opt.phone) {
    const fl = [];
    for (const e of document.querySelectorAll('body *')) {
      const s = getComputedStyle(e); if (s.position !== 'fixed' && s.position !== 'sticky') continue; if (!vis(e)) continue;
      const r = e.getBoundingClientRect(); const cy = (r.top + r.bottom) / 2;
      if (r.width * r.height > vw * vh * 0.15 || r.width > vw * 0.8) continue; if (cy < vh * 0.15 || cy > vh * 0.85) continue;
      if (s.position === 'sticky') continue;
      if (e.closest('[role=dialog]')) continue; const par = e.parentElement && e.parentElement.closest && [...document.querySelectorAll('body *')].length && null;
      let inLayer = false; for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const q = getComputedStyle(a); if (q.position === 'fixed') { inLayer = true; break; } } if (inLayer) continue;
      if (!txt(e) && !e.querySelector('button,svg,img')) continue;
      /* a status note that cannot take a tap (the "☁ Sent ✓" chip, a toast): it fades by itself and covers no button — listed, not a failure
         (the unsent note has its own check) */
      if (s.pointerEvents === 'none' || /^(status|alert)$/.test(e.getAttribute('role') || '')) { if (e.id !== 'gc-unsent-note') out.warns.push({ check: 'floating', msg: 'a status note over the content: ' + P(txt(e), e) }); continue; }
      fl.push(P(txt(e), e) + ` @${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    if (fl.length) out.fails.push({ check: 'floating', msg: `${fl.length} floating pill/button over the content mid-screen`, list: fl.slice(0, 6) });
  }
  // 6. bottom nav clearance (after scroll-to-end the caller sets opt.atEnd)
  const nav = [...document.querySelectorAll('#gc-fh-tabs,[data-ra-bar],.gc-bottom-nav,nav')].filter(vis).find(n => { const r = n.getBoundingClientRect(); return getComputedStyle(n).position === 'fixed' && r.bottom >= vh - 2 && r.top > vh * 0.6; });
  if (nav) out.info.navTop = Math.round(nav.getBoundingClientRect().top);
  if (opt.atEnd && opt.phone) {
    const navTop = nav ? nav.getBoundingClientRect().top : vh - (safe.bottom || 0);
    const cont = buttons.filter(b => !nav || !nav.contains(b)).filter(b => { let f = false; for (let a = b; a; a = a.parentElement) { if (getComputedStyle(a).position === 'fixed' && a.getBoundingClientRect().height < vh * 0.3) { f = true; break; } } return !f; });
    let last = null; for (const b of cont) { const r = b.getBoundingClientRect(); if (r.top < vh && (!last || r.bottom > last.getBoundingClientRect().bottom)) last = b; }
    if (last) { const r = last.getBoundingClientRect(); out.info.lastBtn = P(txt(last), last) + ' bottom ' + Math.round(r.bottom) + ' / nav ' + Math.round(navTop);
      if (r.bottom > navTop + 1) out.fails.push({ check: 'lastbtn', msg: `the last button on the scrolled page (${P(txt(last), last)}) ends at ${Math.round(r.bottom)} px, under the bottom bar (top ${Math.round(navTop)} px)` }); }
  }
  // 7. text contrast (AA spot check)
  const tx = []; const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n && tx.length < 220; n = walker.nextNode()) { if (!n.nodeValue.trim() || n.nodeValue.trim().length < 2) continue; if (!/[\p{L}\p{N}]/u.test(n.nodeValue)) continue; /* an emoji / symbol alone (🎤): drawn in its own colors, not the text color */ const e = n.parentElement; if (!e || tx.includes(e) || !vis(e) || !onScreen(e)) continue; const r = e.getBoundingClientRect(); if (r.top < 0 || r.bottom > vh) continue; const hh = document.elementFromPoint(Math.min(vw - 1, r.left + r.width / 2), r.top + r.height / 2); if (!hh || !(e === hh || e.contains(hh) || hh.contains(e))) continue; tx.push(e); }
  const low = [];
  for (const e of tx) { const s = getComputedStyle(e); const fg = rgba(s.color); if (!fg || fg.a < 0.3) continue; const bg = bgOf(e); if (bg.grad) continue; const f = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) }; const size = parseFloat(s.fontSize); const big = size >= 24 || (size >= 18.6 && +s.fontWeight >= 700); const need = big ? 3 : 4.5; const c = cr(f, bg); if (c < need) low.push({ t: txt(e), c: Math.round(c * 100) / 100, need, fg: s.color, bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})` }); }
  out.info.contrastChecked = tx.length; out.info.contrastLow = low.length;
  if (low.length) { low.sort((a, b) => a.c - b.c); const bad = low.filter(x => x.c < 3); (bad.length ? out.fails : out.warns).push({ check: 'contrast', msg: `${low.length} of ${tx.length} text samples below WCAG AA (${bad.length} under 3:1)`, list: low.slice(0, 8).map(x => `"${x.t}" ${x.c}:1 (needs ${x.need}) ${x.fg} on ${x.bg}`) }); }
  return out;
}
