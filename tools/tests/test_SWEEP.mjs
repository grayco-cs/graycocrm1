// test_SWEEP.mjs <build-dir> <mirror.json> [--pages=Leads,Admin] [--quick] [--viewports=a,b,c,office] [--workers=4]
//                [--fn=real|mock] [--strict-top] [--out=DIR]          node test_SWEEP.mjs --selftest   (no browser)
//
// RELEASE GATE: every page of the left menu, as the owner sees it, on the screens he uses. Written 11/2 after a day of the
// owner finding by hand what the per-feature tests missed:
//   1. blocks on top of EVERY page instead of their one home: 🧾 Missing job data, 💳 / 🏦 statement imports, 📥 Drop
//      invoices & receipts, 🔧 Owner setup, a bare "▶ Details" strip, two copies of one banner with different numbers;
//   2. bars that move on their own (the two bars above the Leads list swapped every 1.5 s);
//   3. the desk layout collapsing into a ~700 px column in the middle (full-width top bar) on his HP after ✅ Approve;
//   4. the Projects "🔨 Active" tile changing meaning (≈3 → 8, BIDDING jobs listed under Active);
//   5. GrayCo Field popping up on a computer.
// The test expects the CORRECT behaviour, so it fails on a build that still has any of these.
//
// WORLD: the offline harness (GC_HARNESS, default the wUPG harness: mock Supabase, no network) loaded with the READ-ONLY
// production mirror (a JSON array of { key, value|v, updated_at }; customer data, never in git) plus a few made-up
// "Sweep" approvals so ✅ Approve always has a harmless target. Every computer gets its OWN copy of the cloud (one harness
// instance each), so one computer's clicks never move another's screen. Our Netlify functions run as the REAL handlers in
// this process (acctgate/bridge.mjs: fake Supabase, every outside host answered 200 {} and recorded — nothing is sent);
// --fn=mock answers every function 200 {} instead.
//
// COMPUTERS (each signed in from the sign-in screen):
//   a       the owner, Windows Edge desktop, 1462×987, mouse
//   b       the owner, his HP at 125 % Windows scaling: 1093×480 CSS px, devicePixelRatio 1.25, touchpad (+ touch screen)
//   c       the owner, iPhone 390×844, touch (expects GrayCo Field; the pages are then swept in Desk view)
//   office  office@grayco-cs.com (gc_staff 'staff', the office), same screen as a
//
// PER COMPUTER: Desk (computers) / Field (phone) right after sign-in and after F5, held 5 s. Then every left-menu tab,
// read from the menu itself (React key = tab id), opened with a real click like a person, settled, and checked:
//   top     known home-only blocks (HOME table) appear only on their home page; a patch-made block above the page heading
//           that is not in TOP_ALLOW and shows on 3+ pages = a strip on every page (FAIL); one-page unknowns are listed
//           as "review" (FAIL with --strict-top)
//   dup     no banner twice on one page (digits ignored: "12 jobs" and "9 jobs" are the same banner)
//   det     no bare <details> ("▶ Details" with no title)
//   layout  (computers) aside + main span >= 90 % of the window, the menu's left edge < 40 px, no sideways page scroll;
//           again after ✅ Approve and ↩ Undo on Approvals (the made-up Sweep items) and on every page after that
//   stable  STAB s per page (60 s on Leads, To-Do, Admin; the mouse moves like a person is there, the CRM slows its loops
//           otherwise): no page block re-inserted more than once, the order of the page blocks changes at most once,
//           layout shift (no input) <= 0.05
//   desk    computers stay in Desk view on every page (no GrayCo Field), the phone is Field at load
//   err     no page errors; no 401 / 403 / 5xx from our functions
//   extra   Accounting: 💳 / 🏦 imports and 📥 Drop invoices & receipts are there (their home). Projects: every row under 🔨 Active has an active status, the tiles add up, Active = the active jobs in the data
//           (status lists from the code: Projects page K / Re, patch JOBORDER cls()); Approvals: the Approve / Undo run
// OUTPUT: a pass/fail table per computer and page, the failures, screenshots and results.json in
//   $SWEEP_OUT/<build>/<computer>/ (default the scratchpad sweep/ folder). Exit 0 = everything passed.
// --quick: computer a only, 3 s per page.  --pages: only these tabs (label or tab id).  Env: STAB, LONG, SETTLE_MAX,
// MAX_MIN (per computer, default 24), GC_HARNESS, SWEEP_OUT, GC_JSDOM (for --selftest).  Runtime: about 13–16 min on 4 cores for all four computers
// (~45 tabs × ~14 s each in parallel), about 6–8 min with --quick (per-page overhead dominates).
import fs from 'fs'; import path from 'path'; import { pathToFileURL, fileURLToPath } from 'url';

const SP = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARGV = process.argv.slice(2);
const FLAG = n => { const a = ARGV.find(x => x === '--' + n || x.startsWith('--' + n + '=')); return a === undefined ? undefined : (a.includes('=') ? a.slice(a.indexOf('=') + 1) : true); };
const POS = ARGV.filter(x => !x.startsWith('--'));

/* ═══════════════════════ TABLES (edit here) ═══════════════════════ */

/* Home-only blocks: where each one belongs (tab ids). Anywhere else on screen (outside a dialog) = FAIL; two on one
   page = FAIL. sel: the patch's own element; re: its words (a text node); tag: the words must sit inside this. */
const HOME = [
  { key: 'missingJobData', label: '🧾 Missing job data banner', home: ['todo'], sel: '.gc-df-banner,[data-df-banner]', re: 'Missing job data', notTag: 'button' },
  { key: 'ownerSetup', label: '🔧 Owner setup', home: ['todo'], sel: '#gc-ot', re: '🔧\\s*Owner setup' },
  { key: 'taxes', label: '🧾 Taxes card', home: ['admin', 'todo'], sel: '#gc-tax-dash,#gc-tax-om,.gctx-hd,.gc-ra-card[data-card="taxes"]', re: '^\\s*🧾\\s*Taxes\\s*$' },
  { key: 'importCard', label: '💳 Import card statement', home: ['taxcenter'], re: 'Import card statement', tag: 'button,[role=button]' },
  { key: 'importBank', label: '🏦 Import bank statement', home: ['taxcenter'], re: 'Import bank statement', tag: 'button,[role=button]' },
  { key: 'dropInvoices', label: '📥 Drop invoices & receipts', home: ['taxcenter'], sel: '.gc-bulkdrop-btn', re: 'Drop invoices (&|and) receipts', tag: 'button,[role=button]' },
  { key: 'dataCheck', label: '🧹 data-check card', home: ['admin', 'todo', 'officemanager'],   /* the Office page carries the shared Office To-Do */ re: '(Last night.s data check found|Nightly data check)', notTag: 'button' },
];
/* Patch-made blocks that may sit above a page's heading. _all: on any page. Keys: tab ids. Matched against the block's
   description ("#id" / "tag.class" + its first words). Add a line here when a NEW strip is meant to be there. */
const TOP_ALLOW = {
  _all: [/^#gc-topbar\b/, /View as|VIEWING AS/i, /offline|Saved on this computer|kept on this computer/i, /new version|Update ready|Reload to update/i],
  leads: [/^#gc-leads-tabs\b/, /^#gc-leads-chips\b/, /Lead Pipeline|Lead Inbox/],
  todo: [/^#_todoMount\b/, /Approvals waiting on you|nothing waiting/i, /Needs a job/, /^#gc-ot\b/, /Missing job data/, /Taxes/, /data check/i],
  admin: [/Taxes|Tax deadlines/, /data check/i, /pay check|Twilio|Missed-call/i],
  taxcenter: [/^#gck-root\b/, /\.gck-/],
  approvals: [/^\.apx-|Waiting on me|Escalated/],
};
const LONG_PAGES = ['leads', 'todo', 'admin'];
/* Projects tiles. The code's status lists: Projects page Re=["bidding","estimating"], K=["approved","active","on_hold"];
   patch JOBORDER cls() (status in any case, spaces / _ / - alike). An "active" job is one of these and nothing else —
   except the old QuickBooks customer import's own "Active" (capital A = "the customer is active in QuickBooks", on 187
   rows; owner 11/2: "they are old finished lost etc, i had 2/3 active earlier"): not a working job (claude/jobactive). The
   row check reads the status the owner SEES in the row's drop-down (no "Active" option there, so it showed "bidding"). */
const ST_NORM = s => String(s == null ? '' : s).trim().toLowerCase().replace(/[\s_-]+/g, ' ');
const ST_ACTIVE = /^(active|approved|in progress|inprogress|on hold|onhold|started|underway|production|working|scheduled|signed)$/;
const ST_NOT_ACTIVE = /\blost\b|\bdead\b|cancel|^(bidding|estimating|estimate|pipeline|proposal|quoted|bid)$|complete|closed|finished|^done$|archiv/;
function stClass(st){ const s = ST_NORM(st); if (/\blost\b|\bdead\b|cancel/.test(s)) return 'lost'; if (ST_ACTIVE.test(s)) return 'active'; if (/^(bidding|estimating|estimate|pipeline|proposal|quoted|bid)$/.test(s)) return 'bidding'; if (/complete|closed|finished|^done$|archiv/.test(s)) return 'finished'; return 'other'; }

const CPU_UA_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
const VIEWPORTS = {
  a: { key: 'a', label: 'owner · Windows Edge 1462×987', who: 'wjohnson@grayco-cs.com', desk: { w: 1462, h: 987, sw: 1536, sh: 1080, dpr: 1, touch: false } },
  b: { key: 'b', label: 'owner · HP 125% 1093×480 touchpad', who: 'wjohnson@grayco-cs.com', desk: { w: 1093, h: 480, sw: 1093, sh: 614, dpr: 1.25, touch: true } },
  c: { key: 'c', label: 'owner · iPhone 390×844 touch', who: 'wjohnson@grayco-cs.com', mobile: true },
  office: { key: 'office', label: 'office · Windows Edge 1462×987', who: 'office@grayco-cs.com', desk: { w: 1462, h: 987, sw: 1536, sh: 1080, dpr: 1, touch: false } },
};
const IGNORE_ERR = /ResizeObserver loop|AbortError/i;

/* ═══════════════════════ pure helpers (also used by --selftest) ═══════════════════════ */
const normSig = s => String(s || '').replace(/\d+([.,]\d+)*/g, '#').replace(/\s+/g, ' ').trim().slice(0, 70);
function reordered(prev, cur){   /* did the blocks present in both samples change their relative order? */
  const a = new Set(cur), b = new Set(prev);
  const p = prev.filter(k => a.has(k)), c = cur.filter(k => b.has(k));
  return p.length !== c.length || p.some((k, i) => k !== c[i]);
}
function stabVerdict(st, lim){
  const msgs = [];
  const start = new Set(st.start || []);
  Object.entries(st.adds || {}).forEach(([k, n]) => { const re = n - (start.has(k) ? 0 : 1); if (re > 1) msgs.push('block re-inserted ' + re + '× in ' + Math.round(st.ms / 1000) + ' s: ' + k); });
  if (st.orderChanges > 1) msgs.push('page blocks changed order ' + st.orderChanges + '× in ' + Math.round(st.ms / 1000) + ' s' + (st.orderEx && st.orderEx[0] ? ' e.g. [' + st.orderEx[0].before.slice(0, 4).join(' | ') + '] → [' + st.orderEx[0].after.slice(0, 4).join(' | ') + ']' : ''));
  if (st.cls > lim.cls) msgs.push('layout shift ' + st.cls.toFixed(3) + ' > ' + lim.cls + (st.shifts && st.shifts.length ? ' (' + st.shifts.map(x => x.src.join('+')).slice(0, 2).join('; ') + ')' : ''));
  if (st.reloaded) msgs.push('the page reloaded by itself during the watch');
  return msgs;
}
function homeVerdict(scan, pageId){
  const msgs = { top: [], dup: [] };
  for (const t of HOME) {
    const list = (scan && scan[t.key]) || [];
    if (list.length && !t.home.includes(pageId)) msgs.top.push(t.label + ' shown here (home: ' + t.home.join(', ') + ') — ' + list[0].desc + ' "' + list[0].text.slice(0, 60) + '"');
    if (list.length > 1) msgs.dup.push(t.label + ' shown ' + list.length + '×: ' + list.map(x => '"' + x.text.slice(0, 50) + '"').join(' / '));
  }
  return msgs;
}
function topAllowed(pageId, b){
  const d = b.desc + ' ' + b.text;
  return TOP_ALLOW._all.concat(TOP_ALLOW[pageId] || []).some(re => re.test(d)) || HOME.some(t => t.home.includes(pageId) && new RegExp(t.re, 'i').test(b.text));
}
function dupTop(blocks){   /* the same patch-made banner twice above the heading (numbers ignored) */
  const n = {}; (blocks || []).filter(b => b.patch).forEach(b => { const k = normSig(b.text).slice(0, 32) || b.desc; (n[k] = n[k] || []).push(b); });
  return Object.entries(n).filter(([k, v]) => v.length > 1 && k.length > 3).map(([k, v]) => 'banner shown ' + v.length + '× above the heading: "' + v.map(x => x.text.slice(0, 50)).join('" / "') + '"');
}
/* after a computer's sweep: an unlisted patch-made block above the heading on 3+ pages is a strip on every page */
function stripVerdicts(pages, strict){
  const seen = {};
  pages.forEach(pg => (pg.topUnlisted || []).forEach(b => { const k = normSig(b.desc.replace(/\s.*$/, '') + ' ' + b.text.slice(0, 30)); (seen[k] = seen[k] || new Set()).add(pg.id); }));
  const out = {};
  pages.forEach(pg => (pg.topUnlisted || []).forEach(b => {
    const k = normSig(b.desc.replace(/\s.*$/, '') + ' ' + b.text.slice(0, 30)), n = seen[k].size;
    if (n >= 3 || strict) (out[pg.id] = out[pg.id] || []).push((n >= 3 ? 'strip above the heading on ' + n + ' pages: ' : 'unlisted block above the heading: ') + b.desc + ' "' + b.text.slice(0, 50) + '"');
    else (pg.review = pg.review || []).push(b.desc + ' "' + b.text.slice(0, 50) + '"');
  }));
  return out;
}
function countVerdict(pr){
  const msgs = [];
  if (!pr || pr.err) return [pr && pr.err ? pr.err : 'Projects page not read'];
  const T = pr.tiles || {};
  ['Pipeline', 'Active', 'Completed', 'Lost', 'All'].forEach(k => { if (!T[k]) msgs.push('no "' + k + '" tile on Projects'); });
  if (msgs.length) return msgs;
  const sum = T.Pipeline.n + T.Active.n + T.Completed.n + T.Lost.n;
  if (sum > T.All.n) msgs.push('tiles do not add up: Pipeline ' + T.Pipeline.n + ' + Active ' + T.Active.n + ' + Completed ' + T.Completed.n + ' + Lost ' + T.Lost.n + ' = ' + sum + ' > All ' + T.All.n);
  const d = pr.data || {};
  if (T.All.n === d.total) { if (T.Active.n !== d.active) msgs.push('🔨 Active tile ' + T.Active.n + ' ≠ ' + d.active + ' jobs with an active status (of ' + d.total + '; ' + JSON.stringify(d.byStatus).slice(0, 200) + ')'); }
  else if (T.Active.n > d.active) msgs.push('🔨 Active tile ' + T.Active.n + ' > ' + d.active + ' jobs with an active status in the data');
  const bad = (pr.activeRows || []).filter(r => stClass(r.status) !== 'active');
  if (bad.length) msgs.push(bad.length + ' of ' + pr.activeRows.length + ' rows under 🔨 Active have a non-active status: ' + bad.slice(0, 5).map(r => r.name.slice(0, 30) + ' [' + r.status + ']').join(', '));
  if (pr.activeRows && pr.activeRows.length > T.Active.n) msgs.push(pr.activeRows.length + ' rows listed under Active but the tile says ' + T.Active.n);
  return msgs;
}
function layoutVerdict(L, when){
  if (!L) return ['layout not read' + (when ? ' (' + when + ')' : '')];
  const m = [], w = when ? ' (' + when + ')' : '';
  if (!L.main) return ['no <main> on screen' + w];
  if (L.span < 0.9 * L.vw) m.push('menu + page span ' + Math.round(L.span) + ' px of ' + L.vw + ' (' + Math.round(100 * L.span / L.vw) + ' %, want ≥ 90 %)' + w + (L.topbar ? ' · top bar ' + L.topbar[2] + ' px wide' : ''));
  if (L.aside && L.aside[0] >= 40) m.push('menu starts at x=' + Math.round(L.aside[0]) + ' px (want < 40)' + w);
  if (L.hscroll > 1) m.push('sideways page scroll ' + L.hscroll + ' px' + w);
  return m;
}

/* ═══════════════════════ in-page helpers (installed before the CRM's own scripts) ═══════════════════════ */
function pageHelpers(){
  if (window.__sw) return;
  const NMO = window.MutationObserver, NSI = window.setInterval, NCI = window.clearInterval, NST = window.setTimeout, NPO = window.PerformanceObserver;
  const sw = window.__sw = { ls: [], mark: Math.random().toString(36).slice(2) };
  try { new NPO(l => l.getEntries().forEach(e => { sw.ls.push({ t: performance.now(), v: e.value, input: !!e.hadRecentInput, src: (e.sources || []).slice(0, 2).map(s => s.node && s.node.nodeType === 1 ? sw.desc(s.node) : (s.node ? 'text' : '?')) }); if (sw.ls.length > 4000) sw.ls.splice(0, 2000); })).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
  try {   /* no pop-up windows or print dialogs from a tab click */
    window.open = function(u){ (sw.opened = sw.opened || []).push(String(u || '')); return { closed: false, close(){}, focus(){}, print(){}, addEventListener(){}, document: { write(){}, writeln(){}, close(){}, open(){} }, location: {} }; };
    window.print = function(){};
  } catch (e) {}
  try { ['_helpShown', 'gc_help_welcomed', 'gc_tour_done'].forEach(k => localStorage.setItem(k, '1')); } catch (e) {}
  const SKIP = /^(TR|TD|TH|THEAD|TBODY|TFOOT|LI|OPTION|SCRIPT|STYLE|SPAN|B|I|EM|STRONG|A|BR|INPUT|SELECT|TEXTAREA|LABEL|IMG|CANVAS|SVG|PATH|SMALL|CODE|NOSCRIPT|TEMPLATE)$/i;
  sw.txt = e => { if (!e) return ''; let out = ''; const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode()) && out.length < 120) { const p = n.parentElement; if (p && /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName)) continue; const v = n.nodeValue.replace(/\s+/g, ' '); if (v.trim()) out += (out ? ' ' : '') + v.trim(); } return out.slice(0, 120); };
  sw.cls1 = e => { const c = typeof e.className === 'string' ? e.className : (e.getAttribute && e.getAttribute('class')) || ''; return c.split(/\s+/).filter(x => x && !/\d{3,}|^css-|^sc-/.test(x)).slice(0, 2).join('.'); };
  sw.desc = e => { if (!e || e.nodeType !== 1) return '?'; if (e.id) return '#' + e.id; const c = sw.cls1(e); return e.tagName.toLowerCase() + (c ? '.' + c : '') + (e.getAttribute('data-k') ? '[data-k=' + e.getAttribute('data-k').slice(0, 30) + ']' : ''); };
  sw.sig = e => sw.desc(e) + '|' + sw.txt(e).replace(/\d+([.,]\d+)*/g, '#').slice(0, 24);
  sw.rect = e => e.getBoundingClientRect();
  sw.PATCHCLS = /(^|\s)(_?gc[a-z0-9]*[-_]|apx-|dp2-|_fm|_jp)/;   /* class names the patches give their own elements */
  sw.vis = e => {
    if (!e || e.nodeType !== 1 || !e.isConnected) return false;
    const r = sw.rect(e); if (r.width < 2 || r.height < 2) return false;
    if (typeof e.checkVisibility === 'function') return e.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    for (let x = e; x && x.nodeType === 1; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden' || (cs.opacity !== '' && +cs.opacity < 0.05)) return false; }
    return true;
  };
  sw.main = () => document.querySelector('#root main') || document.querySelector('main');
  sw.vw = () => document.documentElement.clientWidth || innerWidth;
  sw.overlayOf = e => {   /* a dialog / sheet over the page: not part of the page itself */
    const area = sw.vw() * innerHeight;
    for (let x = e; x && x.nodeType === 1 && x !== document.body; x = x.parentElement) {
      if (x.getAttribute('role') === 'dialog' || x.getAttribute('aria-modal') === 'true') return x;
      if (x.tagName === 'MAIN' || x.tagName === 'ASIDE') return null;
      const cs = getComputedStyle(x);
      if (cs.position === 'fixed') { const r = sw.rect(x); if (r.width * r.height > 0.35 * area) return x; }
    }
    return null;
  };
  sw.blockOf = e => {   /* the block a matched word belongs to (the patch's own element, or a direct child of the page) */
    const main = sw.main(); let cur = e;
    for (let i = 0; i < 7 && cur.parentElement && cur.parentElement !== document.body && cur.parentElement !== main; i++) {
      if (cur.id || cur.hasAttribute('data-gc-keep') || sw.PATCHCLS.test(typeof cur.className === 'string' ? cur.className : '')) break;
      cur = cur.parentElement;
    }
    return cur;
  };
  sw.homeScan = types => {
    const res = {}; const found = {}; types.forEach(t => { found[t.key] = new Set(); t._re = t.re ? new RegExp(t.re, 'i') : null; });
    const okScope = e => !e.closest('aside') && !sw.overlayOf(e);
    types.forEach(t => { if (t.sel) document.querySelectorAll(t.sel).forEach(e => { if (sw.vis(e) && okScope(e)) found[t.key].add(sw.blockOf(e)); }); });
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = tw.nextNode())) {
      const v = n.nodeValue; if (!v || v.length < 4) continue;
      const hits = types.filter(t => t._re && t._re.test(v)); if (!hits.length) continue;
      const el = n.parentElement; if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|OPTION|TITLE|TEMPLATE)$/.test(el.tagName)) continue;
      if (!sw.vis(el) || !okScope(el)) continue;
      hits.forEach(t => {
        let at = el;
        if (t.tag) { at = el.closest(t.tag); if (!at) return; }
        if (t.notTag && el.closest(t.notTag)) return;
        found[t.key].add(sw.blockOf(at));
      });
    }
    const main = sw.main();
    types.forEach(t => { const all = [...found[t.key]]; const list = all.filter(e => !all.some(o => o !== e && o.contains(e)));
      res[t.key] = list.map(e => ({ desc: sw.desc(e), text: sw.txt(e).slice(0, 100), top: Math.round(sw.rect(e).top), inMain: !!(main && main.contains(e)) })); });
    return res;
  };
  sw.bareDetails = () => [...document.querySelectorAll('details')].filter(d => sw.vis(d) && !d.closest('aside') && !sw.overlayOf(d)).filter(d => {
    const s = [...d.children].find(c => c.tagName === 'SUMMARY'); const t = s ? sw.txt(s).replace(/[▶▸►▼▾]/g, '').trim() : '';
    return !s || t === '' || /^details$/i.test(t);
  }).map(d => ({ desc: sw.desc(d), top: Math.round(sw.rect(d).top), text: sw.txt(d).slice(0, 60) }));
  sw.heading = main => {
    if (!main) return null;
    const inBanner = e => !!e.closest('.gc-df-banner,#gc-ot,.gctx-hd,#gc-tax-dash,#gc-tax-om,[data-df-banner]');
    const h = [...main.querySelectorAll('h1,h2,[role=heading]')].find(e => sw.vis(e) && !inBanner(e) && sw.txt(e).length >= 2);
    if (h) return h;
    let k = 0; const tw = document.createTreeWalker(main, NodeFilter.SHOW_ELEMENT); let e;
    while ((e = tw.nextNode()) && k++ < 600) {
      if (e.children.length > 2 || !sw.vis(e) || inBanner(e)) continue;
      const t = sw.txt(e); if (t.length < 2 || t.length > 60) continue;
      const cs = getComputedStyle(e); if (parseFloat(cs.fontSize) >= 17 && (+cs.fontWeight >= 600 || cs.fontWeight === 'bold')) return e;
    }
    return null;
  };
  sw.patchMade = e => !!(e.id || e.hasAttribute('data-gc-keep') || sw.PATCHCLS.test(typeof e.className === 'string' ? e.className : ''));
  sw.topBlocks = () => {   /* the visible blocks above the page's own heading, outermost first */
    const main = sw.main(); if (!main) return { heading: null, blocks: [] };
    const h = sw.heading(main), out = [];
    const walk = (el, d) => {
      for (const ch of el.children) {
        if (!sw.vis(ch)) continue;
        if (h) {
          if (ch === h) return true;
          if (ch.contains(h)) { if (d < 8 && walk(ch, d + 1)) return true; return true; }
          if (!(ch.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING)) return true;
        } else if (sw.rect(ch).top > sw.rect(main).top + 140) return true;
        else if (!sw.patchMade(ch) && ch.children.length && d < 4 && (!sw.txt(ch).length || sw.rect(ch).height > 200)) { walk(ch, d + 1); continue; }   /* no heading: into the page's wrappers */
        if (sw.rect(ch).height < 6) continue;
        out.push({ desc: sw.desc(ch), text: sw.txt(ch).slice(0, 100), patch: sw.patchMade(ch), h: Math.round(sw.rect(ch).height) });
      }
      return false;
    };
    walk(main, 0);
    return { heading: h ? sw.desc(h) + ' "' + sw.txt(h).slice(0, 40) + '"' : null, blocks: out };
  };
  sw.inventory = types => ({ home: sw.homeScan(types), details: sw.bareDetails(), top: sw.topBlocks(), view: (() => { try { return localStorage.getItem('grayco_view'); } catch (e) { return null; } })(), path: location.pathname, mark: sw.mark });
  sw.layout = () => {
    const r4 = e => { if (!e || !sw.vis(e)) return null; const r = sw.rect(e); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
    const a = r4(document.querySelector('aside')), m = r4(sw.main());
    const L = Math.min(a ? a[0] : 1e9, m ? m[0] : 1e9), R = Math.max(a ? a[0] + a[2] : -1e9, m ? m[0] + m[2] : -1e9);
    const se = document.scrollingElement || document.documentElement;
    return { vw: sw.vw(), vh: innerHeight, aside: a, main: m, span: m ? R - L : 0, hscroll: Math.max(0, se.scrollWidth - sw.vw()), root: r4(document.getElementById('root')), topbar: r4(document.getElementById('gc-topbar')) };
  };
  sw.desk = () => {
    const fm = document.documentElement.classList.contains('_fieldmode'), fh = sw.vis(document.querySelector('#_gcJobPick.gc-fh')), d = document.getElementById('gc-ra-desk');
    let phone = null; try { phone = window._gcView ? window._gcView.phone() : null; } catch (e) {}
    return { field: fm || fh, fm, fh, desk: sw.vis(d), deskApp: d ? d.getAttribute('data-app') : null, phone };
  };
  const fiberKey = b => { try { for (const k in b) if (k.indexOf('__reactFiber') === 0) { const f = b[k]; return f && f.key != null ? String(f.key) : null; } } catch (e) {} return null; };
  const label = b => { const kids = [...b.children]; if (kids.length >= 2 && sw.txt(kids[0]).length <= 3) return kids.slice(1).map(x => sw.txt(x)).filter(t => t && !/^\d+\+?$/.test(t)).join(' ').replace(/\s*\d+\+?$/, '').trim(); return sw.txt(b).replace(/^[^\w\s(]{1,3}\s*/, '').replace(/\s*\d+\+?$/, '').trim(); };
  sw.navButtons = () => { const a = document.querySelector('aside'); if (!a) return []; return [...a.querySelectorAll('button[draggable="true"],a[draggable="true"],[data-gc-navtab]')].filter(b => !b.closest('#gc-navsearch-wrap')); };
  sw.navId = b => fiberKey(b) || b.getAttribute('data-gc-navtab') || (b.id ? 'dom:' + b.id : 'dom:' + label(b).toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  sw.nav = () => { const seen = new Set(); return sw.navButtons().map(b => ({ id: sw.navId(b), label: label(b), vis: sw.vis(b) })).filter(x => x.id && !seen.has(x.id) && seen.add(x.id)); };
  sw.navPoint = id => {
    const b = sw.navButtons().find(x => sw.navId(x) === id); if (!b) return { missing: true };
    if (!sw.vis(b)) return { hidden: true };
    try { b.scrollIntoView({ block: 'nearest' }); } catch (e) {}
    const r = sw.rect(b), x = r.left + Math.min(r.width / 2, 60), y = r.top + r.height / 2, at = document.elementFromPoint(x, y);
    return { x, y, hit: !!at && (at === b || b.contains(at)), cover: at && !(at === b || b.contains(at)) ? sw.desc(at) + ' ' + sw.txt(at).slice(0, 30) : null };
  };
  sw.navJsClick = id => { const b = sw.navButtons().find(x => sw.navId(x) === id); if (!b) return false; b.click(); return true; };
  sw.ready = () => !!(window._crm && (window._crm.projects || []).length > 20 && (sw.navButtons().length > 2 || document.documentElement.classList.contains('_fieldmode')));
  sw.settle = (quiet, max) => new Promise(done => {
    const t0 = Date.now(); let last = Date.now();
    const mo = new NMO(() => { last = Date.now(); }); mo.observe(document.body, { childList: true, subtree: true });
    const iv = NSI.call(window, () => { if (Date.now() - last >= quiet || Date.now() - t0 >= max) { NCI.call(window, iv); mo.disconnect(); done(Date.now() - t0); } }, 100);
  });
  /* the page's blocks: wide block elements down to `depth` levels under <main>, in document order */
  sw.blockish = (e, main, cfg) => {
    if (e.nodeType !== 1 || SKIP.test(e.tagName)) return false;
    const r = sw.rect(e), mw = main ? sw.rect(main).width : sw.vw();
    if (r.width < cfg.minW * mw || r.height < 8) return false;
    const d = getComputedStyle(e).display; return !(d === 'inline' || d === 'none' || d === 'contents');
  };
  sw.depth = (main, e) => { let d = 0; for (let x = e; x; x = x.parentElement, d++) if (x === main) return d; return -1; };
  sw.blocks = cfg => {
    const main = sw.main(); if (!main) return [];
    const out = [], cnt = {};
    const walk = (el, d) => { for (const ch of el.children) { if (d + 1 > cfg.depth) return; if (sw.blockish(ch, main, cfg)) { const s = sw.sig(ch); cnt[s] = (cnt[s] || 0) + 1; out.push(s + '#' + cnt[s]); } if (out.length < 300 && ch.children.length) walk(ch, d + 1); } };
    walk(main, 0); return out;
  };
  sw.watchStart = cfg => {
    if (sw.W) try { sw.W.stop(); } catch (e) {}
    const W = sw.W = { t0: performance.now(), adds: {}, start: [], orderChanges: 0, orderEx: [], samples: 0 };
    let prev = sw.blocks(cfg); W.start = [...new Set(prev.map(k => k.replace(/#\d+$/, '')))];
    const mo = new NMO(list => {
      const main = sw.main(); if (!main) return;
      for (const m of list) {
        if (m.type !== 'childList' || !m.addedNodes.length) continue;
        const d = sw.depth(main, m.target); if (d < 0 || d >= cfg.depth) continue;
        m.addedNodes.forEach(n => { if (n.nodeType !== 1 || !n.isConnected || !sw.blockish(n, main, cfg)) return; const k = sw.sig(n); W.adds[k] = (W.adds[k] || 0) + 1; });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    const iv = NSI.call(window, () => {
      const cur = sw.blocks(cfg); W.samples++;
      const strip = a => a.map(k => k.replace(/#1$/, ''));
      if (sw.reordered(prev, cur)) { W.orderChanges++; if (W.orderEx.length < 3) W.orderEx.push({ before: strip(prev).slice(0, 8), after: strip(cur).slice(0, 8) }); }
      prev = cur;
    }, 500);
    W.stop = () => { mo.disconnect(); NCI.call(window, iv); };
    return W.start.length;
  };
  sw.watchStop = () => {
    const W = sw.W; if (!W) return { reloaded: true, adds: {}, start: [], orderChanges: 0, cls: 0, ms: 0 };
    W.stop(); sw.W = null;
    const ls = sw.ls.filter(e => e.t >= W.t0 && !e.input);
    return { ms: performance.now() - W.t0, adds: W.adds, start: W.start, orderChanges: W.orderChanges, orderEx: W.orderEx, samples: W.samples, cls: ls.reduce((a, e) => a + e.v, 0), shifts: ls.sort((a, b) => b.v - a.v).slice(0, 3) };
  };
  sw.reordered = function(prev, cur){ const a = new Set(cur), b = new Set(prev); const p = prev.filter(k => a.has(k)), c = cur.filter(k => b.has(k)); return p.length !== c.length || p.some((k, i) => k !== c[i]); };
  /* Projects: the tiles, the rows on screen, the jobs in the data */
  sw.projects = cfg => {
    const main = sw.main(); if (!main) return { err: 'no main' };
    const tiles = {};
    main.querySelectorAll('button').forEach(b => { if (!sw.vis(b)) return; const t = sw.txt(b); const m = t.match(/^(\d+)\s+(?:\S{1,3}\s*)?(Pipeline|Active|Completed|Lost|All)$/u); if (m && !tiles[m[2]]) { const r = sw.rect(b); tiles[m[2]] = { n: +m[1], x: r.left + r.width / 2, y: r.top + r.height / 2 }; } });
    const rows = [...main.querySelectorAll('table tbody tr')].filter(r => sw.vis(r) && (r.querySelector('select') || r.hasAttribute('data-gc-jo'))).map(r => {
      const sel = [...r.querySelectorAll('select')].find(s => [...s.options].some(o => /^(active|bidding|completed|lost)$/i.test(o.value))) || null;
      const cells = [...r.children]; return { status: sel ? sel.value : '', cls: r.getAttribute('data-gc-jo') || '', name: (cells[1] ? sw.txt(cells[1]) : sw.txt(r)).slice(0, 60) };
    }).map(r => Object.assign(r, { status: r.status || r.cls }));
    const P = ((window._crm && window._crm.projects) || []).filter(p => p && p.deleted !== true);
    const act = new RegExp(cfg.active), by = {}; let active = 0;
    const qbImport = p => String(p.status == null ? '' : p.status).trim() === 'Active' && (/^quickbooks$/i.test(String(p.source || '').trim()) || !!p.qbId || !!p.qbCustomerId);
    let qb = 0;
    P.forEach(p => { const s = String(p.status == null ? '' : p.status).trim().toLowerCase().replace(/[\s_-]+/g, ' '); by[s] = (by[s] || 0) + 1; if (qbImport(p)) qb++; else if (act.test(s)) active++; });
    by['(QuickBooks import "Active")'] = qb;
    return { tiles, rows, data: { total: P.length, active, byStatus: by } };
  };
  /* Approvals */
  sw.apxRows = () => [...document.querySelectorAll('.apx-row')].filter(sw.vis).map(r => ({ k: r.getAttribute('data-k') || '', t: sw.txt(r).slice(0, 100), b: [...r.querySelectorAll('button')].filter(sw.vis).map(b => sw.txt(b)) }));
  sw.btnPoint = (rowKey, re) => {
    re = new RegExp(re); const scope = rowKey ? [...document.querySelectorAll('.apx-row')].find(r => r.getAttribute('data-k') === rowKey) : document;
    if (!scope) return null; const b = [...scope.querySelectorAll('button')].filter(sw.vis).find(b => re.test(sw.txt(b))); if (!b) return null;
    try { b.scrollIntoView({ block: 'center' }); } catch (e) {} const r = sw.rect(b); return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: sw.txt(b) };
  };
  sw.jiggleAt = () => { const m = sw.main(); const r = m ? sw.rect(m) : { left: 0 }; return { x: Math.max(2, r.left + 6), y: innerHeight - 6 }; };
}

/* ═══════════════════════ --selftest: the pure parts and the in-page parts on a made-up page (jsdom), no browser ═══════════════════════ */
async function selftest(){
  let pass = 0, fail = 0; const ok = (c, m, i) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); } };
  ok(reordered(['A', 'B', 'C'], ['B', 'A', 'C']), 'reordered: a swap');
  ok(!reordered(['A', 'B', 'C'], ['A', 'X', 'B', 'C']), 'reordered: a new block is not a reorder');
  ok(!reordered(['A', 'B'], ['A']), 'reordered: a block going away is not a reorder');
  ok(stabVerdict({ ms: 10000, adds: { 'div|Sales': 6, 'div|New leads': 6 }, start: ['div|Sales', 'div|New leads'], orderChanges: 6, cls: 0 }, { cls: 0.05 }).length === 3, 'stab: the Leads swap fails 3 ways');
  ok(stabVerdict({ ms: 10000, adds: { 'div|late banner': 1 }, start: [], orderChanges: 1, cls: 0.01 }, { cls: 0.05 }).length === 0, 'stab: one late block and one order change pass');
  ok(stabVerdict({ ms: 10000, adds: { 'div|x': 2 }, start: [], orderChanges: 0, cls: 0.2 }, { cls: 0.05 }).length === 1, 'stab: a big layout shift fails');
  const hv = homeVerdict({ missingJobData: [{ desc: 'div.gc-df-banner', text: '🧾 Missing job data — 9 of 40' }, { desc: 'div.gc-df-banner', text: '🧾 Missing job data — 12 of 40' }] }, 'admin');
  ok(hv.top.length === 1 && hv.dup.length === 1, 'home: two Missing job data banners on Admin = off-home + duplicate', hv);
  ok(homeVerdict({ missingJobData: [{ desc: 'd', text: 'x' }] }, 'todo').top.length === 0, 'home: the banner on the To-Do is fine');
  ok(homeVerdict({ importCard: [{ desc: 'd', text: 'x' }] }, 'todo').top.length === 1 && homeVerdict({ importCard: [{ desc: 'd', text: 'x' }] }, 'taxcenter').top.length === 0, 'home: imports only on Accounting');
  ok(dupTop([{ patch: true, text: '🧾 Missing job data — 9 of 40', desc: 'a' }, { patch: true, text: '🧾 Missing job data — 12 of 40', desc: 'b' }]).length === 1, 'dupTop: the same banner with different numbers');
  const pages = ['dashboard', 'leads', 'projects', 'schedule'].map(id => ({ id, topUnlisted: [{ desc: 'div#gc-strip', text: 'Something on every page 3' }] }));
  pages[0].topUnlisted.push({ desc: 'div.gc-one', text: 'only here' });
  const sv = stripVerdicts(pages, false); ok(Object.keys(sv).length === 4 && (pages[0].review || []).length === 1, 'strips: 4 pages fail, the one-page block is "review"', sv);
  ok(stClass('Active') === 'active' && stClass('on_hold') === 'active' && stClass('BIDDING') === 'bidding' && stClass('Completed') === 'finished' && stClass('lost') === 'lost' && stClass('archived') === 'finished', 'status classes');
  const pr = { tiles: { Pipeline: { n: 219 }, Active: { n: 8 }, Completed: { n: 41 }, Lost: { n: 15 }, All: { n: 466 } }, data: { total: 466, active: 3, byStatus: {} }, activeRows: [{ name: 'Bid job', status: 'bidding' }, { name: 'Real', status: 'active' }] };
  const cv = countVerdict(pr); ok(cv.length === 2, 'count: Active 8 vs 3 in the data, and a BIDDING row under Active', cv);
  ok(countVerdict({ tiles: pr.tiles, data: { total: 466, active: 8 }, activeRows: [{ name: 'a', status: 'Active' }] }).length === 0, 'count: consistent tiles pass');
  ok(layoutVerdict({ vw: 1093, span: 700, aside: [196, 0, 200, 480], main: [396, 0, 500, 480], hscroll: 0, topbar: [0, 0, 1093, 40] }).length === 2, 'layout: the ~700 px column fails');
  ok(layoutVerdict({ vw: 1462, span: 1462, aside: [0, 0, 200, 987], main: [200, 0, 1262, 987], hscroll: 0 }).length === 0, 'layout: full width passes');
  /* the in-page helpers on a made-up DOM */
  const JS = process.env.GC_JSDOM || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/node_modules/jsdom/lib/api.js';
  let JSDOM = null; try { ({ JSDOM } = await import(pathToFileURL(JS).href)); } catch (e) { console.log('  (jsdom not found at ' + JS + ': in-page part skipped; set GC_JSDOM)'); }
  if (JSDOM) {
    const html = `<div id="root"><div style="display:flex"><aside><nav><button draggable="true"><span>▣</span><span>Dashboard</span></button><button draggable="true"><span>⚙</span><span>Admin</span><span>3</span></button></nav></aside>
      <main><div><div class="gc-df-banner" data-gc-keep="1"><div class="t"><b>🧾 Missing job data</b> — 9 of 40 jobs need info</div><button>Open ›</button></div>
      <div class="gc-df-banner" data-gc-keep="1"><div class="t"><b>🧾 Missing job data</b> — 12 of 40 jobs need info</div></div>
      <details id="gc-ot"></details><div id="gc-money-needs"><button data-mn="import">💳 Import card statement</button><button data-mn="bank">🏦 Import bank statement</button></div>
      <h1>Admin</h1><p>Help: use Accounting → 💳 Import card statement</p><div class="gctx-hd" data-r="0,900,800,40"><b>🧾 Taxes</b></div></div></main></div></div>
      <div role="dialog"><b>🧾 Missing job data</b><button>📥 Drop invoices &amp; receipts</button></div>`;
    const dom = new JSDOM('<!doctype html><html><body>' + html + '</body></html>', { runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window; let y = 0;
    w.Element.prototype.getBoundingClientRect = function(){ const r = this.getAttribute && this.getAttribute('data-r'); if (r) { const [x, yy, ww, hh] = r.split(',').map(Number); return { left: x, top: yy, width: ww, height: hh, right: x + ww, bottom: yy + hh }; } if (!this.__y) this.__y = (y += 20); return { left: 0, top: this.__y, width: 800, height: 20, right: 800, bottom: this.__y + 20 }; };
    w.PerformanceObserver = function(){ return { observe(){} }; };
    w.eval('(' + pageHelpers.toString() + ')()');
    const sw = w.__sw;
    const scan = sw.homeScan(HOME.map(t => ({ key: t.key, sel: t.sel, re: t.re, tag: t.tag, notTag: t.notTag })));
    ok(scan.missingJobData.length === 2, 'page: two Missing job data banners found (the one in the dialog is not)', scan.missingJobData);
    ok(scan.ownerSetup.length === 1 && scan.importCard.length === 1 && scan.importBank.length === 1 && scan.dropInvoices.length === 0 && scan.taxes.length === 1, 'page: owner setup / imports (buttons only, not help text) / taxes; Drop only in the dialog', scan);
    const bd = sw.bareDetails(); ok(bd.length === 1 && bd[0].desc === '#gc-ot', 'page: the empty Owner setup <details> is a bare "▶ Details"', bd);
    const tb = sw.topBlocks(); ok(/Admin/.test(tb.heading || '') && tb.blocks.length === 4 && tb.blocks.every(b => b.patch), 'page: 4 patch-made blocks above the "Admin" heading', tb);
    ok(dupTop(tb.blocks).length === 1, 'page: the two banners are one banner twice');
    const nv = sw.nav(); ok(nv.length === 2 && nv[1].label === 'Admin', 'page: menu tabs and labels (badge number dropped)', nv);
    const hv2 = homeVerdict(scan, 'admin'); ok(hv2.top.length === 4 && hv2.dup.length === 1, 'page: on Admin: banner, owner setup, 2 imports off-home; Taxes is at home', hv2);
    /* Projects under 🔨 Active: an old QuickBooks row ("Active", no such option: the drop-down shows its first, bidding) */
    const opts = '<option value="bidding">BIDDING</option><option value="active">ACTIVE</option><option value="completed">COMPLETED</option><option value="lost">LOST</option>';
    const d2 = new JSDOM('<!doctype html><body><div id="root"><main><button><div>219</div><div>📋 Pipeline</div></button><button><div>3</div><div>🔨 Active</div></button><button><div>41</div><div>✅ Completed</div></button><button><div>15</div><div>❌ Lost</div></button><button><div>280</div><div>🏢 All</div></button>'
      + '<table><tbody><tr data-gc-jo="active"><td>L357</td><td>Old QB customer</td><td><select>' + opts + '</select></td></tr><tr data-gc-jo="active"><td>P1</td><td>Real job</td><td><select>' + opts.replace('value="active"', 'value="active" selected') + '</select></td></tr></tbody></table></main></div></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
    d2.window.Element.prototype.getBoundingClientRect = w.Element.prototype.getBoundingClientRect; d2.window.PerformanceObserver = w.PerformanceObserver;
    d2.window._crm = { projects: [{ status: 'Active', source: 'QuickBooks' }, { status: 'active' }, { status: 'approved' }, { status: 'on_hold' }, { status: 'bidding' }, { status: 'lost', deleted: true }] };
    d2.window.eval('(' + pageHelpers.toString() + ')()');
    const pj = d2.window.__sw.projects({ active: ST_ACTIVE.source });
    ok(pj.tiles.Active && pj.tiles.Active.n === 3 && pj.tiles.All.n === 280 && pj.rows.length === 2 && pj.rows[0].status === 'bidding' && pj.data.active === 3 && pj.data.total === 5, 'page: Projects tiles, rows (status as the drop-down shows it), data without the QuickBooks "Active"', pj);
    const cv2 = countVerdict({ tiles: pj.tiles, data: pj.data, activeRows: pj.rows }); ok(cv2.length === 1 && /BIDDING|bidding/.test(cv2[0]), 'page: the row showing bidding under Active fails', cv2);
  }
  console.log('SELFTEST ' + pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0);
}
if (FLAG('selftest')) await selftest();

/* ═══════════════════════ the run ═══════════════════════ */
const BUILD = POS[0] && path.resolve(POS[0]), MIRROR = POS[1];
if (!BUILD || !MIRROR) { console.error('usage: node test_SWEEP.mjs <build-dir> <mirror.json> [--pages=Leads,Admin] [--quick] [--viewports=a,b,c,office] [--workers=4] [--fn=real|mock] [--strict-top] [--out=DIR]\n       node test_SWEEP.mjs --selftest'); process.exit(2); }
const QUICK = !!FLAG('quick');
const STAB = +(process.env.STAB || (QUICK ? 3 : 10)) * 1000, LONG = +(process.env.LONG || (QUICK ? 3 : 60)) * 1000, SETTLE_MAX = +(process.env.SETTLE_MAX || 6000), MAXMS = +(process.env.MAX_MIN || 24) * 60000;
const ONLY_PAGES = FLAG('pages') ? String(FLAG('pages')).split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : null;
const VPS = (FLAG('viewports') ? String(FLAG('viewports')).split(',') : QUICK ? ['a'] : ['a', 'b', 'c', 'office']).map(k => VIEWPORTS[k.trim()]).filter(Boolean);
const WORKERS = Math.max(1, +(FLAG('workers') || 4)), FN = FLAG('fn') === 'mock' ? 'mock' : 'real', STRICT = !!FLAG('strict-top');
const OUT = path.join(FLAG('out') || process.env.SWEEP_OUT || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/sweep', path.basename(BUILD));
fs.mkdirSync(OUT, { recursive: true });
const HARNESS = pathToFileURL(process.env.GC_HARNESS || SP + '/wUPG/harness.mjs').href;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const raceT = (p, ms) => Promise.race([Promise.resolve(p).then(v => ({ v }), e => ({ e })), sleep(ms).then(() => ({ timeout: true }))]);
const T0 = Date.now(), el = () => Math.round((Date.now() - T0) / 1000) + 's';
const MIRROR_ROWS = JSON.parse(fs.readFileSync(MIRROR, 'utf8'));
if (!Array.isArray(MIRROR_ROWS)) { console.error('mirror: expected a JSON array of { key, value|v, updated_at }'); process.exit(2); }

/* the world one computer sees: the mirror + made-up Sweep approvals (expense approvals waiting with no PM, one with the owner) */
function loadWorld(cloud, tag){
  cloud.clear();
  for (const r of MIRROR_ROWS) cloud.set(r.key, { key: r.key, value: r.value !== undefined ? r.value : r.v, updated_at: r.updated_at });
  const HOURAGO = new Date(Date.now() - 3600e3).toISOString();
  const edit = (k, fn) => { const r = cloud.get(k); let v = r && r.value, str = false; if (typeof v === 'string') { try { v = JSON.parse(v); str = true; } catch (e) {} }
    const nv = fn(Array.isArray(v) ? v : []); cloud.set(k, { key: k, value: str ? JSON.stringify(nv) : nv, updated_at: HOURAGO }); };
  const J = 'PRJsweep' + tag;
  edit('projects', l => l.concat([{ id: J, name: 'Sweep Gate Test Job ' + tag, address: '1 Sweep Test Way, Memphis, TN 38101', autoPO: 'SW' + tag.toUpperCase(), client: 'Sweep Test Customer', pm: '', status: 'active', contract: 1000, type: 'Residential Reno', created: '2026-10-01', savedAt: HOURAGO, updatedAt: HOURAGO }]));
  const ex = [1, 2, 3].map(i => ({ id: 'EXPsweep' + tag + i, pid: J, type: 'expense', vendor: 'Sweep Gate Supply', payee: 'Sweep Gate Supply', desc: 'sweep test item ' + i, amt: 10 + i, category: 'Materials', status: 'pending', date: '2026-10-29', by: 'Sweep Test', enteredAt: HOURAGO, savedAt: HOURAGO, updatedAt: HOURAGO }));
  edit('expenses', l => l.concat(ex));
  edit('gc_expense_approvals', l => l.concat(ex.map((e, i) => ({ id: 'expId:' + e.id, expId: e.id, pm: i === 2 ? 'Wesley Johnson' : '', jobId: J, payee: e.payee, desc: e.desc, amount: e.amt, status: 'pending_pm', matched: true, enteredAt: HOURAGO, updatedAt: HOURAGO }))));
}

const STAFF = [
  { email: 'wjohnson@grayco-cs.com', name: 'Wesley Johnson', role: 'admin', profile: null, active: true, payroll: true },
  { email: 'office@grayco-cs.com', name: 'Brittany Pucket', role: 'staff', profile: null, active: true, payroll: true }];
let BRIDGE = null, BR = null;
if (FN === 'real') {
  BR = await import(pathToFileURL(path.join(HERE, 'acctgate', 'bridge.mjs')).href);
  const H0 = await import(HARNESS + '?sweep=fn');
  const fnCloud = new Map(); loadWorld(fnCloud, 'fn');
  BRIDGE = BR.installBridge({ build: BUILD, cloud: fnCloud, accounts: H0.ACCOUNTS, staffRows: STAFF, broadcast: null });
}

async function computerFor(vp, H){
  const c = await H.computer('SW-' + vp.key, { build: BUILD, mobile: !!vp.mobile });
  c.acceptConfirm = false; c.prompts = []; c.calls = [];
  const row = STAFF.find(x => x.email === vp.who);
  await c.ctx.route(u => /supabase\.co\/rest\/v1\/(gc_staff|rpc\/gc_my_access)/.test(u), async r => {
    const u = new URL(r.request().url()); const J = b => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.pathname.endsWith('/gc_staff')) return J(row ? [row] : []);
    return J({ email: vp.who, staff: true, admin: !!(row && row.role === 'admin'), payroll: !!(row && row.payroll), office: vp.who === 'office@grayco-cs.com', sec2: 1 });
  });
  if (BRIDGE) await BR.routeFunctions(c, BRIDGE);
  else await c.ctx.route(u => { const x = new URL(u); return x.host === 'app.local' && x.pathname.startsWith('/.netlify/functions/'); }, r => { const u = new URL(r.request().url()); c.calls.push({ t: Date.now(), fn: u.pathname.split('/')[3], m: r.request().method(), q: u.search.slice(0, 80), status: 200 }); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
  if (vp.desk) {   /* a Windows computer: the screen as Windows scaling reports it, devicePixelRatio, Edge, a mouse / touchpad (+ touch screen) */
    await c.ctx.addInitScript(cf => {
      const def = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} };
      def(Screen.prototype, 'width', cf.sw); def(Screen.prototype, 'height', cf.sh); def(Screen.prototype, 'availWidth', cf.sw); def(Screen.prototype, 'availHeight', cf.sh - 40);
      def(window, 'devicePixelRatio', cf.dpr); def(Navigator.prototype, 'userAgent', cf.ua); def(Navigator.prototype, 'platform', 'Win32');
      def(Navigator.prototype, 'userAgentData', { mobile: false, platform: 'Windows', brands: [{ brand: 'Microsoft Edge', version: '130' }] });
      if (cf.touch) def(Navigator.prototype, 'maxTouchPoints', 10);
      const M = { 'pointer': ['fine'], 'any-pointer': cf.touch ? ['fine', 'coarse'] : ['fine'], 'hover': ['hover'], 'any-hover': ['hover'] };
      const om = window.matchMedia.bind(window);
      window.matchMedia = function(q){
        const s = String(q); if (!/pointer|hover/i.test(s)) return om(q);
        const res = s.split(/\s+and\s+/i).every(cl => { const m = cl.match(/\(\s*([a-z-]+)\s*:\s*([a-z]+)\s*\)/i); if (!m || !(m[1].toLowerCase() in M)) return om(cl).matches; return M[m[1].toLowerCase()].includes(m[2].toLowerCase()); });
        return Object.create(om('all'), { matches: { value: res }, media: { value: s } });
      };
    }, Object.assign({ ua: CPU_UA_EDGE }, vp.desk));
    await c.page().setViewportSize({ width: vp.desk.w, height: vp.desk.h });
  }
  await c.ctx.addInitScript(pageHelpers);
  return c;
}
const ev = (c, fn, arg, ms = 45000) => raceT(c.page().evaluate(fn, arg), ms).then(r => { if (r.timeout) throw new Error('page did not answer in ' + ms / 1000 + ' s (frozen?)'); if (r.e) throw r.e; return r.v; });
const evq = (c, fn, arg, ms) => ev(c, fn, arg, ms).catch(e => ({ __err: String(e && e.message || e).slice(0, 200) }));
async function waitReady(c, ms){ const t0 = Date.now(); while (Date.now() - t0 < ms) { const r = await evq(c, () => !!(window.__sw && window.__sw.ready()), null, 15000); if (r === true) return true; await sleep(700); } return false; }
async function signIn(c, H, email){
  const p = c.page();
  await p.goto('https://app.local/index.html', { timeout: 120000 });
  await p.waitForSelector('#gc-auth-email', { timeout: 150000 });
  await sleep(1500);
  for (let i = 0; i < 5; i++) { await p.locator('#gc-auth-email').fill(email); await p.locator('#gc-auth-password').fill(H.ACCOUNTS[email].pw); await sleep(300); if ((await p.locator('#gc-auth-email').inputValue()) === email) break; }
  const bb = await p.locator('#gc-auth-submit').boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
}
async function holdView(c, wantField, ms){   /* the view stays Desk (computer) / Field (phone) for ms (a phone first gets 20 s to draw Field) */
  const good = s => s && !s.__err && (wantField ? (s.fm && s.fh) : !s.field);
  if (wantField) { const w0 = Date.now(); let s0 = null; while (Date.now() - w0 < 20000) { s0 = await evq(c, () => window.__sw.desk(), null, 15000); if (good(s0)) break; await sleep(500); } if (!good(s0)) return { ok: false, s: s0 }; }
  const t0 = Date.now(); let s = null; const seen = [];
  while (Date.now() - t0 < ms) { s = await evq(c, () => window.__sw.desk(), null, 15000); if (s && !s.__err) { const good = wantField ? (s.fm && s.fh) : !s.field; if (!good) return { ok: false, at: Date.now() - t0, s }; seen.push(1); } await sleep(400); }
  return { ok: seen.length > 0, s };
}
async function jiggle(c, i){ try { const p = await evq(c, () => window.__sw.jiggleAt(), null, 5000); if (p && !p.__err) await c.page().mouse.move(p.x + (i % 2) * 3, p.y - (i % 3)); } catch (e) {} }
async function clickAt(c, pt){ await c.page().mouse.click(pt.x, pt.y); }

async function runComputer(vp){
  const R = { vp: vp.key, label: vp.label, pages: [], global: [], t0: Date.now() };
  const H = await import(HARNESS + '?sweep=' + vp.key);   /* its own cloud */
  if (H.RT) H.RT.on = false;
  loadWorld(H.cloud, vp.key);
  const dir = path.join(OUT, vp.key); fs.mkdirSync(dir, { recursive: true });
  const glob = (name, ok, msg) => R.global.push({ name, ok, msg });
  let c;
  try {
    c = await computerFor(vp, H);
    await signIn(c, H, vp.who);
    const rd = await waitReady(c, 300000);
    glob('signed in, CRM ready', rd, rd ? '' : 'the CRM did not come up in 5 min');
    if (!rd) throw new Error('not ready');
    console.log('[' + el() + '] ' + vp.key + ': signed in');
    /* Field / Desk at load and after F5 */
    const wantField = !!vp.mobile;
    let h = await holdView(c, wantField, 5000);
    glob(wantField ? 'phone opens in GrayCo Field (5 s)' : 'computer stays in Desk view 5 s after sign-in', h.ok, h.ok ? '' : JSON.stringify(h.s).slice(0, 200));
    await c.page().screenshot({ path: path.join(dir, '00_load.png') }).catch(() => {});
    await c.page().reload({ timeout: 120000 }).catch(() => {});
    const rd2 = await waitReady(c, 240000);
    h = rd2 ? await holdView(c, wantField, 5000) : { ok: false, s: 'not ready after F5' };
    glob(wantField ? 'phone is GrayCo Field after F5 (5 s)' : 'computer stays in Desk view 5 s after F5', h.ok, h.ok ? '' : JSON.stringify(h.s).slice(0, 200));
    await c.page().screenshot({ path: path.join(dir, '00_after_F5.png') }).catch(() => {});
    if (wantField) { await evq(c, () => { try { window._gcChooseView && window._gcChooseView('desk'); } catch (e) {} return true; }); await sleep(2500); }
    /* the menu */
    let nav = await ev(c, () => window.__sw.nav());
    glob('left menu read', nav.length > 2, nav.length + ' tabs');
    if (ONLY_PAGES) nav = nav.filter(t => ONLY_PAGES.some(q => q === t.id.toLowerCase() || q === t.label.toLowerCase() || t.label.toLowerCase().startsWith(q)));
    console.log('[' + el() + '] ' + vp.key + ': ' + nav.length + ' tabs: ' + nav.map(t => t.id).join(' '));
    let i = 0;
    for (const tab of nav) {
      i++;
      if (Date.now() - R.t0 > MAXMS) { R.pages.push({ id: tab.id, label: tab.label, checks: { err: { ok: false, msgs: ['not checked: this computer hit its ' + MAXMS / 60000 + ' min limit (MAX_MIN)'] } } }); continue; }
      const pg = await visitPage(c, vp, tab, i, dir);
      R.pages.push(pg);
      const bad = Object.entries(pg.checks).filter(([k, v]) => v && v.ok === false).map(([k]) => k);
      console.log('[' + el() + '] ' + vp.key + ' ' + tab.id.padEnd(16) + (bad.length ? 'FAIL ' + bad.join(',') : 'ok'));
    }
  } catch (e) { glob('run', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ').slice(0, 400)); }
  /* strips across pages */
  const sv = stripVerdicts(R.pages, STRICT);
  R.pages.forEach(pg => { if (sv[pg.id]) { const t = pg.checks.top || (pg.checks.top = { ok: false, msgs: [] }); t.msgs = t.msgs.concat(sv[pg.id]); t.ok = false; } });
  R.ms = Date.now() - R.t0;
  if (c) await raceT(c.b.close(), 30000);
  return R;
}

async function visitPage(c, vp, tab, i, dir){
  const pg = { id: tab.id, label: tab.label, checks: {}, t0: Date.now() };
  const chk = (k, msgs, na) => { pg.checks[k] = na ? { ok: null, msgs: [] } : { ok: !msgs.length, msgs }; };
  const desktop = !!vp.desk, e0 = c.errs.length, f0 = c.calls.length;
  try {
    await c.page().keyboard.press('Escape').catch(() => {});
    const pt = await ev(c, id => window.__sw.navPoint(id), tab.id);
    if (pt.missing) throw new Error('the tab is gone from the menu');
    if (pt.hit) await clickAt(c, pt);
    else { await ev(c, id => window.__sw.navJsClick(id), tab.id); if (desktop && pt.cover) pg.note = 'menu covered by ' + pt.cover; }
    await sleep(800);
    await evq(c, (a) => window.__sw.settle(a[0], a[1]), [1000, SETTLE_MAX], SETTLE_MAX + 15000);
    const types = HOME.map(t => ({ key: t.key, sel: t.sel, re: t.re, tag: t.tag, notTag: t.notTag }));
    const inv1 = await ev(c, ty => window.__sw.inventory(ty), types);
    pg.view = inv1.view; if (inv1.path !== '/index.html' && inv1.path !== '/') pg.note = (pg.note ? pg.note + '; ' : '') + 'left the CRM: ' + inv1.path;
    const lay1 = desktop ? await ev(c, () => window.__sw.layout()) : null;
    const desk1 = await ev(c, () => window.__sw.desk());
    /* stability window */
    const win = LONG_PAGES.includes(tab.id) ? LONG : STAB, cfg = { depth: 6, minW: 0.4 };
    await ev(c, cf => window.__sw.watchStart(cf), cfg);
    const mark = inv1.mark; let deskBad = null;
    for (let t = 0, k = 0; t < win; t += 2000, k++) {
      await sleep(Math.min(2000, win - t)); await jiggle(c, k);
      if (desktop && !deskBad) { const d = await evq(c, () => window.__sw.desk(), null, 10000); if (d && d.field) deskBad = 'GrayCo Field opened during the watch (' + Math.round(t / 1000) + ' s)'; }
    }
    let stab = await ev(c, () => window.__sw.watchStop());
    const mark2 = await evq(c, () => window.__sw.mark); if (mark2 !== mark) stab = Object.assign(stab || {}, { reloaded: true });
    const inv2 = await ev(c, ty => window.__sw.inventory(ty), types);
    /* top / dup / details: both looks (after settling, after the watch) */
    const top = [], dup = [], unl = [];
    for (const inv of [inv1, inv2]) {
      const hv = homeVerdict(inv.home, tab.id); top.push(...hv.top); dup.push(...hv.dup); dup.push(...dupTop(inv.top.blocks));
      inv.top.blocks.filter(b => b.patch && !topAllowed(tab.id, b) && !HOME.some(t => new RegExp(t.re, 'i').test(b.text))).forEach(b => unl.push(b));
    }
    pg.heading = inv2.top.heading || inv1.top.heading; pg.top = inv2.top.blocks.map(b => (b.patch ? '* ' : '  ') + b.desc + ' "' + b.text.slice(0, 50) + '"');
    const uniq = a => [...new Set(a)];
    pg.topUnlisted = Object.values(Object.fromEntries(unl.map(b => [b.desc + b.text.slice(0, 30), b])));
    chk('top', uniq(top));
    chk('dup', uniq(dup));
    chk('det', uniq(inv1.details.concat(inv2.details).map(d => 'bare "▶ Details" (no title): ' + d.desc + ' at y=' + d.top)));
    /* layout */
    const lay2 = desktop ? await ev(c, () => window.__sw.layout()) : null;
    const lm = desktop ? uniq(layoutVerdict(lay1, 'after opening').concat(layoutVerdict(lay2, 'after ' + Math.round(win / 1000) + ' s'))) : [];
    /* stability */
    chk('stable', stabVerdict(stab, { cls: 0.05 }));
    /* Desk / Field */
    const dm = []; if (desktop && desk1.field) dm.push('GrayCo Field is showing on a computer'); if (deskBad) dm.push(deskBad);
    chk('desk', dm, !desktop);
    /* extras */
    const xm = [];
    if (tab.id === 'projects') { pg.count = await projectsCheck(c); xm.push(...countVerdict(pg.count)); }
    if (tab.id === 'approvals' && desktop) { const a = await approveCheck(c, dir); pg.approve = a.log; pg.approveRan = a.ran; xm.push(...a.msgs); lm.push(...a.layout); }
    if (tab.id === 'taxcenter') {   /* their home: the Accounting tool row (owner 11/2) */
      const miss = ['importCard', 'importBank', 'dropInvoices'].filter(k => !((inv2.home[k] || []).length || (inv1.home[k] || []).length));
      if (miss.length) xm.push('not on Accounting (their home): ' + miss.map(k => HOME.find(t => t.key === k).label).join(', '));
    }
    chk('extra', xm, !(tab.id === 'projects' || tab.id === 'taxcenter' || (tab.id === 'approvals' && desktop)));
    chk('layout', lm, !desktop);
    await c.page().screenshot({ path: path.join(dir, String(i).padStart(2, '0') + '_' + tab.id.replace(/[^\w-]+/g, '_') + '.png'), timeout: 20000 }).catch(() => {});
  } catch (e) {
    (pg.checks.err = pg.checks.err || { ok: false, msgs: [] }).msgs.push('page check failed: ' + String(e && e.message || e).slice(0, 200));
    await c.page().screenshot({ path: path.join(dir, String(i).padStart(2, '0') + '_' + tab.id.replace(/[^\w-]+/g, '_') + '_ERROR.png'), timeout: 20000 }).catch(() => {});
    const back = await evq(c, () => !!(window.__sw && window.__sw.ready()), null, 20000);
    if (back !== true) { await c.page().goto('https://app.local/index.html', { timeout: 120000 }).catch(() => {}); await waitReady(c, 240000); }
  }
  /* errors: page errors and our functions' 401 / 403 / 5xx while this page was open */
  const em = c.errs.slice(e0).filter(x => !IGNORE_ERR.test(x)).map(x => x.slice(0, 200));
  const fm = c.calls.slice(f0).filter(x => x.status === 401 || x.status === 403 || x.status >= 500).map(x => x.fn + (x.q ? ' ' + x.q.split('&')[0] : '') + ' → ' + x.status + (x.err ? ' ' + String(x.err).slice(0, 80) : ''));
  const prev = (pg.checks.err && pg.checks.err.msgs) || [];
  chk('err', prev.concat([...new Set(em)], [...new Set(fm)]));
  pg.ms = Date.now() - pg.t0;
  return pg;
}

async function projectsCheck(c){
  const A = ST_ACTIVE.source;
  const r0 = await ev(c, a => window.__sw.projects({ active: a }), A);
  if (!r0.tiles || !r0.tiles.Active) return Object.assign(r0, { err: 'no 🔨 Active tile on Projects (tiles: ' + Object.keys(r0.tiles || {}).join(', ') + ')' });
  await clickAt(c, r0.tiles.Active); await sleep(1500);
  const r1 = await ev(c, a => window.__sw.projects({ active: a }), A);
  const out = { tiles: r1.tiles && r1.tiles.All ? r1.tiles : r0.tiles, data: r1.data, activeRows: r1.rows };
  if (r1.tiles && r1.tiles.All) { await clickAt(c, r1.tiles.All); await sleep(800); }
  return out;
}

/* ✅ Approve then ↩ Undo on a made-up Sweep approval; the layout after each (the HP collapse came after Approve) */
async function approveCheck(c, dir){
  const log = [], msgs = [], layout = [];
  const L = async when => { const l = await ev(c, () => window.__sw.layout()); log.push(when + ': span ' + l.span + '/' + l.vw + ' aside ' + JSON.stringify(l.aside)); layout.push(...layoutVerdict(l, when)); };
  await ev(c, () => { const b = [...document.querySelectorAll('main button, .apx-root button, button')].filter(window.__sw.vis).find(x => /^\d+\s+All$/.test(window.__sw.txt(x))); if (b) b.click(); return !!b; });
  await sleep(1500);
  const rows = await ev(c, () => window.__sw.apxRows());
  const isApprove = b => /^✅\s*Approve$/.test(b);
  const mine = rows.filter(r => /sweep/i.test(r.k + ' ' + r.t) && r.b.some(isApprove));   /* keys exp:EXPsweep<computer><n> */
  const any = rows.filter(r => r.b.some(isApprove) && /^exp:/i.test(r.k));   /* expense cards approve in place with a 5 s ↩ Undo; sub invoices ask to confirm */
  const pick = mine.concat(any);
  log.push(rows.length + ' approval cards, ' + mine.length + ' Sweep cards with ✅ Approve');
  if (!pick.length) { msgs.push('no "✅ Approve" button on Approvals to exercise (cards: ' + rows.slice(0, 4).map(r => r.k + ' [' + r.b.join('|') + ']').join('; ') + ')'); return { log, msgs, layout, ran: false }; }
  c.acceptConfirm = true;
  try {
    const k1 = pick[0].k;
    let pt = await ev(c, k => window.__sw.btnPoint(k, '^✅\\s*Approve$'), k1);
    if (pt) { await clickAt(c, pt); await sleep(1500); await L('after ✅ Approve'); await c.page().screenshot({ path: path.join(dir, 'approvals_after_approve.png') }).catch(() => {}); }
    const u = await ev(c, k => window.__sw.btnPoint(k, 'Undo') || window.__sw.btnPoint(null, 'Undo'), k1);
    if (u) { await clickAt(c, u); await sleep(1500); await L('after ↩ Undo'); await c.page().screenshot({ path: path.join(dir, 'approvals_after_undo.png') }).catch(() => {}); }
    else msgs.push('no ↩ Undo after ✅ Approve on ' + k1);
    if (pick[1]) {   /* a second one left to finish (the in-place approve commits after its 5 s undo) */
      const k2 = pick[1].k; pt = await ev(c, k => window.__sw.btnPoint(k, '^✅\\s*Approve$'), k2);
      if (pt) { await clickAt(c, pt); await sleep(7000); await L('7 s after a second ✅ Approve (committed)'); await c.page().screenshot({ path: path.join(dir, 'approvals_after_commit.png') }).catch(() => {}); }
      const u2 = await ev(c, k => window.__sw.btnPoint(k, 'Undo'), k2);
      if (u2) { await clickAt(c, u2); await sleep(1500); await L('after the second ↩ Undo'); }
    }
  } finally { c.acceptConfirm = false; }
  return { log, msgs, layout, ran: true };
}

/* ═══════════════════════ main ═══════════════════════ */
console.log('SWEEP ' + path.basename(BUILD) + ' · computers ' + VPS.map(v => v.key).join(',') + ' · ' + STAB / 1000 + ' s per page (' + LONG / 1000 + ' s on ' + LONG_PAGES.join('/') + ') · functions ' + FN + ' · ' + (ONLY_PAGES ? 'pages ' + ONLY_PAGES.join(',') : 'every menu tab') + ' · out ' + OUT);
{ const np = ONLY_PAGES ? ONLY_PAGES.length : 45, nl = ONLY_PAGES ? LONG_PAGES.filter(x => ONLY_PAGES.includes(x)).length || ONLY_PAGES.filter(q => /^(leads|to-do|admin)$/.test(q)).length : 3;
  console.log('  estimate: ~' + Math.round((np * (STAB + 4500) + nl * (LONG - STAB) + 150000) / 60000) + ' min per computer (≈' + np + ' tabs), ' + Math.min(WORKERS, VPS.length) + ' at a time'); }
const queue = VPS.slice(), RESULTS = [];
await Promise.all(Array.from({ length: Math.min(WORKERS, VPS.length) }, async () => { while (queue.length) { const vp = queue.shift(); RESULTS.push(await runComputer(vp)); } }));
RESULTS.sort((a, b) => VPS.findIndex(v => v.key === a.vp) - VPS.findIndex(v => v.key === b.vp));

const COLS = ['top', 'dup', 'det', 'layout', 'stable', 'desk', 'err', 'extra'];
let failN = 0; const FAILS = [];
for (const R of RESULTS) {
  console.log('\n══ ' + R.vp + ' · ' + R.label + ' · ' + Math.round(R.ms / 1000) + ' s');
  R.global.forEach(g => { console.log('  ' + (g.ok ? 'ok  ' : 'FAIL') + ' ' + g.name + (g.msg && !g.ok ? '  ' + g.msg : g.msg ? '  (' + g.msg + ')' : '')); if (!g.ok) { failN++; FAILS.push(R.vp + ' · ' + g.name + ': ' + g.msg); } });
  console.log('  ' + 'page'.padEnd(18) + COLS.map(k => k.padEnd(7)).join(''));
  for (const pg of R.pages) {
    console.log('  ' + pg.id.slice(0, 17).padEnd(18) + COLS.map(k => { const v = pg.checks[k]; return (!v || v.ok === null ? '-' : v.ok ? 'ok' : 'FAIL').padEnd(7); }).join('') + (pg.note ? '  ' + pg.note : ''));
    COLS.forEach(k => { const v = pg.checks[k]; if (v && v.ok === false) { failN++; v.msgs.slice(0, 4).forEach(m => FAILS.push(R.vp + ' · ' + pg.id + ' · ' + k + ': ' + m)); } });
  }
  const rev = R.pages.filter(p => p.review && p.review.length);
  if (rev.length) console.log('  review (one-page blocks above the heading, not in TOP_ALLOW): ' + rev.map(p => p.id + ': ' + p.review.slice(0, 2).join(' / ')).join(' · ').slice(0, 900));
}
if (FAILS.length) { console.log('\nFAILURES'); FAILS.forEach(f => console.log('  ✗ ' + f.slice(0, 400))); }
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ build: path.basename(BUILD), at: new Date().toISOString(), stab: STAB, long: LONG, fn: FN, results: RESULTS }, null, 1));
console.log('\nSWEEP ' + (failN ? 'FAIL' : 'PASS') + ' · ' + failN + ' failing checks · ' + RESULTS.reduce((a, r) => a + r.pages.length, 0) + ' pages on ' + RESULTS.length + ' computers · ' + el() + ' · screenshots + results.json in ' + OUT);
process.exit(failN ? 1 : 0);
