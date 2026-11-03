/* patch ALLWHITE (owner 11/3, Field, "Create Document": "I don't want navy. I want white on all of these pop-ups and all
   pages"). Every navy/dark pop-up, sheet, modal, drawer and page of the CRM (Field and Desk) gets the white look of the
   📧 Email Center (patch MAILWHITE): pages #f6f7f9, cards #fff with a #e5e7eb border, text #0f172a, muted #64748b, links
   #1d4ed8, gold accents kept (gold text darkened to #7a5800 so it reads on white).
   HOW: hundreds of sheets draw their navy in inline styles, so one helper marks each dark surface with data-aw="page|card|
   sub|badge|btn|in" (and dark text on it with data-awt, dark borders with data-awbd); ONE late stylesheet maps those marks to
   the white colours with !important. The inline styles themselves are never rewritten, so code that reads or toggles them
   keeps working (a toggle re-marks the element). Display only: no data, no clicks, no layout changes.
   LEFT DARK on purpose: the back-office TVs (#gc-otv, .gc-tvs*, .gc-a8-tv) and the lobby (#gc-lob); the sign-in screen;
   the desk's top brand bar and left sidebar (the app's chrome); toasts and small floating buttons; scrims (the see-through
   dim behind a sheet); black photo/video viewers; coloured buttons (gold, blue, green, red, purple). Printed documents,
   PDFs and the dark invoice are separate documents (new window / iframe), which this never touches.
   Kill switch: localStorage gc_allwhite_off = '1'. window._gcAllWhite.scan() repaints everything. */
(function(){
'use strict';
var W = window, D = document;
if (W._gcAllWhite) return;
var off = false; try { off = localStorage.getItem('gc_allwhite_off') === '1'; } catch (e) {}

/* what is never painted (the element and everything in it) */
var SKIP = [
  '#gc-otv', '.gc-tvs', '.gc-tvs-bg', '.gc-tvs-menu', '#gc-tvs-ed', '#gc-a8-tv', '.gc-a8-tv', '#gc-lob',   /* TVs + lobby (html carries gc-otv-* theme classes all the time: never match on html) */
  '#gc-auth-gate', '[id^="gc-auth"]', '#gc-signin-late', '#gc-fresh-start-screen',                               /* sign-in */
  'aside', '#gc-topbar', '#gc-tb-pop', '[data-aw-chrome]',                                                       /* desk chrome */
  '[class*="toast"]', '[id*="toast"]', '[id*="Toast"]', '[role="status"]', '[role="tooltip"]',                    /* toasts */
  'svg', 'canvas', 'video', 'iframe', 'img', 'script', 'style', 'noscript', '[data-aw-skip]'
].join(',');
var TONE = { page: [246, 247, 249], card: [255, 255, 255], sub: [248, 250, 252], badge: [238, 242, 247], btn: [255, 255, 255], 'in': [255, 255, 255],
  tg: [240, 253, 244], tr: [254, 242, 242], ta: [255, 251, 235], tb: [239, 246, 255], tp: [245, 243, 255] };
var INK = { ink: '#0f172a', mut: '#64748b', mut2: '#475569', blue: '#1d4ed8', gold: '#7a5800', orange: '#9a3412', red: '#b91c1c',
  green: '#166534', teal: '#0f766e', purple: '#6d28d9', pink: '#be185d', white: '#ffffff' };

function css(){
  if (D.getElementById('gc-allwhite-css')) return;
  var r = [];
  var bg = function(sel, c, extra){ r.push(sel + '{background-color:' + c + '!important;background-image:none!important' + (extra || '') + '}'); };
  bg('[data-aw="page"]', '#f6f7f9');
  bg('[data-aw="card"]', '#fff');
  bg('[data-aw="sub"]', '#f8fafc');
  bg('[data-aw="badge"]', '#eef2f7');
  bg('[data-aw="btn"]', '#fff', ';border:1px solid #d1d5db!important;color:#0f172a!important;-webkit-text-fill-color:currentColor');
  r.push('[data-aw="btn"]:hover{background-color:#f8fafc!important;border-color:#94a3b8!important}');
  bg('[data-aw="in"]', '#fff', ';color:#0f172a!important;-webkit-text-fill-color:#0f172a;border-color:#cbd5e1!important;color-scheme:light');
  r.push('[data-aw="in"]::placeholder{color:#64748b!important;-webkit-text-fill-color:#64748b;opacity:1}');
  r.push('[data-aw="in"] option{background:#fff;color:#0f172a}');
  bg('[data-aw="tg"]', '#f0fdf4', ';border-color:#bbf7d0!important'); bg('[data-aw="tr"]', '#fef2f2', ';border-color:#fecaca!important');
  bg('[data-aw="ta"]', '#fffbeb', ';border-color:#fde68a!important'); bg('[data-aw="tb"]', '#eff6ff', ';border-color:#bfdbfe!important');
  bg('[data-aw="tp"]', '#f5f3ff', ';border-color:#ddd6fe!important');
  Object.keys(INK).forEach(function(k){ r.push('[data-awt="' + k + '"]{color:' + INK[k] + '!important;-webkit-text-fill-color:' + INK[k] + '}'); });
  [['t', 'top'], ['r', 'right'], ['b', 'bottom'], ['l', 'left']].forEach(function(s){ r.push('[data-awbd~="' + s[0] + '"]{border-' + s[1] + '-color:#e5e7eb!important}'); });
  r.push('[data-aw="page"],[data-aw="card"],[data-aw="sub"]{color-scheme:light}');
  var st = D.createElement('style'); st.id = 'gc-allwhite-css';
  /* the page's own "!important" navy rules (e.g. html._fieldmode main{…!important}) must lose: each mark carries the
     weight of two ids (:is(#id,*) counts as an id and matches everything) */
  var BOOST = ':is(#gc-aw-a,*):is(#gc-aw-b,*)';
  st.textContent = '/* patch ALLWHITE */@media screen{' + r.join('').replace(/(\[data-aw[a-z]*~?="[^"]*"\])/g, '$1' + BOOST) + '}';
  (D.head || D.documentElement).appendChild(st);
}

/* ── colours ── */
function rgba(s){
  var m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)/.exec(s || '');
  if (!m) return null;
  return [+m[1], +m[2], +m[3], m[4] == null ? 1 : (m[5] ? +m[4] / 100 : +m[4])];
}
function Y(c){ return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; }
function lum(c){ var a = [c[0], c[1], c[2]].map(function(v){ v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }
function contrast(a, b){ var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function hue(c){
  var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
  if (!d) return { h: 0, s: 0 };
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  var l = (mx + mn) / 2;
  return { h: h, s: d / (1 - Math.abs(2 * l - 1) || 1) };
}
/* a dark background: 'navy' (navy, slate, dark grey — the old app look) or 'hue' (dark green/red/purple/deep blue: a colour) */
function kind(c){
  if (!c || c[3] < 0.5 || Y(c) >= 75) return null;
  var r = c[0], g = c[1], b = c[2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx - mn <= 14) return mx <= 12 ? null : 'navy';            /* pure black stays (photo/video viewers) */
  if (b >= g - 4 && g >= r - 6 && b - r <= 80) return 'navy';
  return 'hue';
}
function tintOf(c){ var h = hue(c).h; return h < 20 || h >= 330 ? 'tr' : h < 70 ? 'ta' : h < 175 ? 'tg' : h < 250 ? 'tb' : 'tp'; }
/* the text colour on white for a light text colour that no longer reads */
function inkFor(c, bg){
  var hs = hue(c), mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
  var k;
  if (hs.s < 0.45 || mx - mn < 50) k = Y(c) >= 195 ? 'ink' : 'mut';
  else { var h = hs.h; k = h < 15 || h >= 345 ? 'red' : h < 35 ? 'orange' : h < 66 ? 'gold' : h < 170 ? 'green' : h < 192 ? 'teal' : h < 252 ? 'blue' : h < 300 ? 'purple' : 'pink'; }
  if (k === 'mut' && contrast(rgba2(INK.mut), bg) < 4.5) k = 'mut2';
  return k;
}
function rgba2(hex){ return [parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16), 1]; }
function over(fg, bg){ var a = fg[3] == null ? 1 : fg[3]; return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1]; }

/* ── the painter ── */
var TONES = new WeakMap();                  /* element → tone it was given (or '' = looked at, left as is) */
var BTN = /^(BUTTON|A|LABEL|SUMMARY)$/, FIELD = /^(INPUT|TEXTAREA|SELECT)$/;
function skipped(el){ try { return !!(el.closest && el.closest(SKIP)); } catch (e) { return false; } }
function tvOn(){ return D.documentElement.classList.contains('gc-otv-on'); }
function gradientNavy(img){
  if (!img || img === 'none' || /url\(/.test(img)) return false;
  var cs = img.match(/rgba?\([^)]*\)/g); if (!cs || !cs.length) return false;
  var n = 0;
  for (var i = 0; i < cs.length; i++) { var c = rgba(cs[i]); if (!c) continue; if (c[3] < 0.3) continue; if (kind(c) !== 'navy') return false; n++; }
  return n > 0;
}
/* the background an element sits on: our tone, or the first opaque background up the tree (BG: element → own opaque
   background or null, read before anything is written, so no style recalculation in the loops) */
function under(el, BG){
  var p = el, hops = 0;
  while (p && p.nodeType === 1 && hops++ < 80) {
    var t = TONES.get(p);
    if (t) return { ours: true, c: TONE[t], tone: t };
    var v = BG.get(p);
    if (v === undefined) { var c = rgba(getComputedStyle(p).backgroundColor); v = c && c[3] >= 0.5 ? c : null; BG.set(p, v); }
    if (v) return { ours: false, c: v };
    p = p.parentElement;
  }
  return { ours: false, c: [255, 255, 255, 1] };
}
function collect(root, out){
  if (!root || root.nodeType !== 1) return;
  if (root.matches && root.matches(SKIP)) return;
  out.push(root);
  var ch = root.children;
  for (var i = 0; i < ch.length; i++) collect(ch[i], out);
}
var stats = { runs: 0, painted: 0, ms: 0, maxMs: 0, els: 0 };
function paint(roots){
  if (off || tvOn() || !D.body) return;
  var t0 = performance.now();
  var els = [];
  roots.forEach(function(r){ if (r.isConnected && !skipped(r.parentElement || r)) collect(r, els); });
  if (!els.length) return;
  /* 1. forget our marks on these elements so their own colours can be read */
  els.forEach(function(el){ if (el.hasAttribute('data-aw')) el.removeAttribute('data-aw'); if (el.hasAttribute('data-awt')) el.removeAttribute('data-awt'); if (el.hasAttribute('data-awbd')) el.removeAttribute('data-awbd'); TONES.delete(el); });
  /* 2. read everything (one style + layout pass) */
  var vw = W.innerWidth || 1, vh = W.innerHeight || 1, BG = new Map();
  var info = els.map(function(el){
    var cs = getComputedStyle(el);
    var c = rgba(cs.backgroundColor), k = kind(c);
    BG.set(el, c && c[3] >= 0.5 ? c : null);
    if (!k && gradientNavy(cs.backgroundImage)) { k = 'navy'; c = [15, 36, 64, 1]; BG.set(el, c); }
    else if (!BG.get(el) && cs.backgroundImage && cs.backgroundImage !== 'none') {             /* a gradient/picture button: its own background */
      var g0 = rgba((cs.backgroundImage.match(/rgba?\([^)]*\)/) || [])[0]);
      BG.set(el, g0 && g0[3] >= 0.5 ? [g0[0], g0[1], g0[2], 1] : [128, 128, 128, 1]);
    }
    var o = { el: el, k: k, c: c, pos: cs.position, disp: cs.display, cur: cs.cursor, color: cs.color, clip: cs.webkitBackgroundClip || cs.backgroundClip };
    if (k) { var r = el.getBoundingClientRect(); o.w = r.width; o.h = r.height; }
    if (k && c && c[3] < 0.97 && o.pos === 'fixed' && o.w >= vw * 0.85 && o.h >= vh * 0.8) { o.k = null; BG.set(el, null); }   /* a scrim: the see-through dim */
    o.bd = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(parseFloat);
    o.bdc = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor];
    o.text = FIELD.test(el.tagName) || [].some.call(el.childNodes, function(n){ return n.nodeType === 3 && /\S/.test(n.nodeValue); });
    return o;
  });
  roots.forEach(function(r){ if (r.parentElement) under(r.parentElement, BG); });   /* the backgrounds above the batch */
  /* 3. decide the surfaces, top-down (a parent is decided before its children) */
  var marks = [];
  info.forEach(function(o){
    var el = o.el, tag = el.tagName, tone = '';
    if (o.k === 'navy') {
      var btnish = BTN.test(tag) || el.getAttribute('role') === 'button' || o.cur === 'pointer';
      if (FIELD.test(tag)) tone = 'in';
      else if (o.pos === 'fixed' && (o.w * o.h < 200 * 110 || o.h < 90)) tone = '';                         /* a floating button, a bar, a toast */
      else if (btnish && o.h < 56 && !el.querySelector('div,p,table,ul')) tone = 'btn';
      else if (!btnish && /inline/.test(o.disp) && o.h < 34) tone = 'badge';
      else if ((o.pos === 'fixed' || o.pos === 'absolute') && o.w >= vw * 0.9 && o.h >= vh * 0.85) tone = 'page';
      else {
        var u = under(el.parentElement, BG);
        tone = u.ours ? (u.tone === 'card' || u.tone === 'in' || u.tone === 'btn' ? 'sub' : 'card') : (Y(u.c) >= 254 ? 'sub' : 'card');
      }
    } else if (o.k === 'hue' && !FIELD.test(tag)) {
      var btn2 = BTN.test(tag) || el.getAttribute('role') === 'button' || o.cur === 'pointer';
      if (!btn2 && o.h >= 28 && o.pos !== 'fixed') { var u2 = under(el.parentElement, BG); if (u2.ours) tone = tintOf(o.c); }
    } else if (FIELD.test(tag) && !BG.get(el)) {
      var u3 = under(el.parentElement, BG); if (u3.ours && Y(rgba(o.color) || [0, 0, 0]) > 150) tone = 'in';   /* a see-through field with light text on a white sheet */
    }
    if (tone) { marks.push([el, 'data-aw', tone]); TONES.set(el, tone); stats.painted++; }
  });
  /* 4. the text and borders on our white */
  var keep = [];
  info.forEach(function(o){
    var el = o.el, t = TONES.get(el);
    if (t === 'btn' || t === 'in') return;                                                   /* their colours come with the tone */
    var u = t ? { ours: true, c: TONE[t] } : under(el.parentElement, BG);
    if (!u.ours) {
      /* light text left on a light background (a panel that used to be navy, e.g. "📄 GrayCo Document Library" in
         #e8eef5 on white): only when it is almost invisible (< 2:1), never gradient text */
      if (!o.text || o.clip === 'text' || BG.get(el)) return;
      var fl = rgba(o.color); if (!fl || fl[3] < 0.3 || Y(u.c) < 235 || Y(fl) < 200) return;
      if (contrast(over(fl, u.c), u.c) < 2) marks.push([el, 'data-awt', inkFor(fl, u.c)]);
      return;
    }
    if (!t && BG.get(el)) {                                                                  /* a coloured button/box on our white: */
      var own = BG.get(el), fg0 = rgba(o.color);                                              /* its text must keep its colour */
      if (fg0 && contrast(over(fg0, own), own) >= 3) keep.push([el, own, fg0]);
      return;
    }
    var bd = [];
    for (var i = 0; i < 4; i++) {
      if (!(o.bd[i] > 0)) continue;
      var bc = rgba(o.bdc[i]); if (!bc || bc[3] < 0.05) continue;
      var bk = kind([bc[0], bc[1], bc[2], 1]);
      if ((bk === 'navy' && bc[3] >= 0.25) || (Y(bc) >= 200 && bc[3] < 0.35)) bd.push('trbl'[i]);
    }
    if (bd.length) marks.push([el, 'data-awbd', bd.join(' ')]);
    if (!o.text) return;
    var fg = rgba(o.color); if (!fg) return;
    var bgc = u.c, f = over(fg, bgc);
    if (contrast(f, bgc) >= 4.5) return;
    marks.push([el, 'data-awt', inkFor(fg, bgc)]);
  });
  marks.forEach(function(m){ m[0].setAttribute(m[1], m[2]); });
  /* 5. a coloured button that took its text colour from a sheet we turned white keeps the colour it had */
  keep.forEach(function(k){
    var now = rgba(getComputedStyle(k[0]).color);
    if (now && contrast(over(now, k[1]), k[1]) < 3) k[0].setAttribute('data-awt', Y(k[2]) >= 150 ? 'white' : 'ink');
  });
  var ms = performance.now() - t0;
  stats.runs++; stats.ms += ms; stats.els += els.length; if (ms > stats.maxMs) stats.maxMs = ms;
}

/* ── when it runs: before the browser draws a new sheet (a MutationObserver runs before the next paint) ── */
var Q = [], lastSig = '', fullT = 0, DBG = null;
function flush(){
  var roots = Q; Q = [];
  /* keep only the top-most roots */
  var set = new Set(roots.filter(function(r){ return r && r.isConnected; }));
  var top = [];
  set.forEach(function(r){ var p = r.parentElement, inside = false; while (p) { if (set.has(p)) { inside = true; break; } p = p.parentElement; } if (!inside) top.push(r); });
  if (DBG) DBG.push(top.map(function(r){ return r.tagName + (r.id ? '#' + r.id : '') + '/' + r.childElementCount; }).join(' ') + ' @' + Math.round(performance.now()));
  try { paint(top); } catch (e) { if (DBG) DBG.push('ERR ' + e); try { console.warn('[GC] ALLWHITE', e); } catch (x) {} }
}
function queue(el){ if (el && el.nodeType === 1) Q.push(el); }
function scan(){
  if (!D.body) return;
  Q.push(D.body); flush();
  /* the page behind everything (seen above/below short pages) */
  var h = D.documentElement;
  try { h.removeAttribute('data-aw'); if (!off && !tvOn() && kind(rgba(getComputedStyle(h).backgroundColor)) === 'navy') h.setAttribute('data-aw', 'page'); } catch (e) {}
}
/* the browser's own MutationObserver and setTimeout: the CRM's "governor" wraps MutationObserver so callbacks wait
   120 ms and pause while someone is working (__GC_IS_ACTIVE__) — a sheet would show navy first, or stay navy */
var MO = W.MutationObserver;
try { var pr = new MO(function(){}); if (pr && pr._n && typeof pr._n.constructor === 'function') MO = pr._n.constructor; } catch (e) {}
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
function later(f, ms){ return ST.call(W, f, ms); }
var mo = new MO(function(list){ try { observed(list); } catch (e) { stats.err = String(e && e.stack || e).slice(0, 300); } });
function observed(list){
  stats.cb = (stats.cb || 0) + 1;
  for (var i = 0; i < list.length; i++) {
    var m = list[i];
    if (m.type === 'childList') {
      for (var j = 0; j < m.addedNodes.length; j++) { var n = m.addedNodes[j]; if (n.nodeType === 1) queue(n); else if (n.nodeType === 3 && m.target !== D.body) queue(m.target); }
    }
    else if (m.target === D.body || m.target === D.documentElement) {
      /* Field ↔ Desk (or the TV) changes the page's own CSS: look at everything again. Other page classes (the layer
         flags that change with every sheet) do not change colours. */
      var hc = D.documentElement.classList, sig = hc.contains('_fieldmode') + '|' + hc.contains('gc-otv-on') + '|' + D.body.className;
      if (sig !== lastSig) { lastSig = sig; if (!fullT) fullT = later(function(){ fullT = 0; scan(); }, 60); }
    }
    else queue(m.target);
  }
  if (Q.length) flush();
}
function start(){
  if (off) return;
  css();
  mo.observe(D.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  scan();
}

/* ══ the GrayCo bar (owner 11/3, the Leads page in Field: "our logo center up top … I want it branded as ours") ══
   Field: every full-screen page or sheet gets ONE white top bar — ‹ Back on the left, the GrayCo logo in the middle,
   Done (or Cancel) on the right — and the page title sits on its own line under it (it was hidden behind the floating
   ‹ Back: "‹ Back ds"). How: the sheet's own ‹ Back / Done / ✕ at the top are tucked away (display:none, still there:
   patch NAV's Back clicks exactly them, so where Back/Done lead is unchanged); patch NAV then shows its ‹ Back, which
   becomes the left of this bar, and pads the sheet below the bar. The field header on desk pages opened in Field
   (#_gcAppHead) becomes the same bar with the title under it. The job page (#_gcJobDash) keeps its ‹ Jobs / Camera row
   with the logo between them. Field Home already shows the logo: left alone. GrayCo Photos (its own app): left alone.
   Desk: the sidebar shows the logo, so only an opaque full-screen overlay that covers it gets a small logo in the middle
   of its header (when the middle of that header is free). Kill switch: localStorage gc_awbar_off = '1'. */
var LOGO = '/grayco-logo-wide.jpg';
var barOff = false; try { barOff = localStorage.getItem('gc_awbar_off') === '1'; } catch (e) {}
var BACK_RE = /^(‹|←|❮)\s*[A-Za-z][A-Za-z ]{0,13}$|^(‹|←|❮)$|^back$/i, CLOSE_RE = /^(✕|✖|×|⨯|x)(\s*close)?$|^close$/i, HEAD_RE = /^(done|cancel)$/i;
function inField(){ return D.documentElement.classList.contains('_fieldmode'); }
function txt(b){ return (b.innerText || b.textContent || '').replace(/\s+/g, ' ').trim(); }
function logo(cls){ var i = D.createElement('img'); i.src = LOGO; i.alt = 'GrayCo'; i.className = 'gc-aw-logo ' + (cls || ''); i.setAttribute('draggable', 'false'); i.setAttribute('data-aw-skip', '1'); return i; }
function barCss(){
  if (D.getElementById('gc-awbar-css')) return;
  var s = D.createElement('style'); s.id = 'gc-awbar-css';
  s.textContent = '/* patch ALLWHITE: the GrayCo bar */' +
    '#gc-aw-bar{position:fixed;left:0;right:0;top:0;height:calc(58px + env(safe-area-inset-top,0px));padding-top:env(safe-area-inset-top,0px);box-sizing:border-box;background:#fff;border-bottom:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(15,23,42,.06);display:none;align-items:center;justify-content:center;font-family:Inter,-apple-system,sans-serif}' +
    '.gc-aw-logo{height:32px;width:auto;display:block;pointer-events:none;user-select:none;-webkit-user-select:none}' +
    '#gc-aw-done{position:absolute;right:10px;top:calc(7px + env(safe-area-inset-top,0px));height:44px;min-width:72px;padding:0 16px;border:1px solid #d1d5db;border-radius:22px;background:#fff;color:#0f172a;font:700 15px Inter,-apple-system,sans-serif;cursor:pointer}' +
    'html._fieldmode #_gcNavBk{background:transparent!important;border:none!important;box-shadow:none!important;color:#1d4ed8!important;top:calc(7px + env(safe-area-inset-top,0px))!important;left:2px!important}' +
    'html._fieldmode [data-aw-hid]{display:none!important}' +
    'html._fieldmode.gc-awhead #_gcNavBk{display:none!important}' +
    'html._fieldmode [data-gcnav-pad]{padding-top:calc(66px + env(safe-area-inset-top,0px))!important}' +
    '[data-aw-logorow]{position:relative}' +
    '.gc-aw-mid{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);height:30px}' +
    '.gc-aw-dlogo{height:26px}' +
    /* desk pages opened in Field: the field header becomes the bar, the title under it */
    'html._fieldmode #_gcAppHead[data-aw-head]{background:#fff!important;border-bottom:1px solid #e5e7eb!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;flex-wrap:wrap!important;gap:0!important;padding:calc(7px + env(safe-area-inset-top,0px)) 10px 10px!important;box-shadow:0 1px 3px rgba(15,23,42,.06)}' +
    'html._fieldmode #_gcAppHead[data-aw-head] #_gcAppBack{color:#1d4ed8!important;font:800 16px Inter,-apple-system,sans-serif!important;height:44px;padding:0 8px!important;display:flex;align-items:center;gap:4px}' +
    'html._fieldmode #_gcAppHead[data-aw-head] #_gcAppTitle{flex-basis:100%;order:5;color:#0f172a!important;font-size:22px!important;line-height:1.2;padding:8px 6px 0}' +
    'html._fieldmode #_gcAppHead[data-aw-head] .gc-aw-head-logo{position:absolute;left:50%;top:calc(13px + env(safe-area-inset-top,0px));transform:translateX(-50%)}' +
    'html._fieldmode #_gcAppHead[data-aw-head] #gc-aw-hdone{margin-left:auto;height:44px;min-width:72px;padding:0 16px;border:1px solid #d1d5db;border-radius:22px;background:#fff;color:#0f172a;font:700 15px Inter,-apple-system,sans-serif;cursor:pointer}' +
    'html._fieldmode body main{padding-top:calc(112px + env(safe-area-inset-top,0px))!important}';
  (D.head || D.documentElement).appendChild(s);
}
function navLayers(){ try { return W._gcNavLayers ? W._gcNavLayers() : []; } catch (e) { return []; } }
function topLayer(){ var l = navLayers(); return l.length ? l[l.length - 1] : null; }
var BAR = null;
function bar(){
  if (BAR && BAR.isConnected) return BAR;
  BAR = D.createElement('div'); BAR.id = 'gc-aw-bar'; ['data-gc-keep', 'data-gcnav-ignore', 'data-aw-skip'].forEach(function(a){ BAR.setAttribute(a, '1'); });
  BAR.appendChild(logo());
  var d = D.createElement('button'); d.type = 'button'; d.id = 'gc-aw-done'; d.textContent = 'Done';
  d.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); doneTap(); });
  BAR.appendChild(d); D.body.appendChild(BAR);
  return BAR;
}
/* Done = the sheet's own Done / ✕ / Cancel (tucked away), else Back */
function doneTap(){
  var t = topLayer(), c = t && t.querySelector('[data-aw-hid="close"]');
  if (c) { try { c.click(); } catch (e) {} later(function(){ try { W._gcNavSync && W._gcNavSync(); } catch (e) {} }, 150); return; }
  try { W._gcNavBack(); } catch (e) {}
}
function barSync(){
  var pill = D.getElementById('_gcNavBk'), html = D.documentElement;
  /* a desk page in Field: its header (#_gcAppHead, made the bar by appHead) has ‹ Back — the floating one steps aside */
  var hd = D.getElementById('_gcAppHead'), headOn = !barOff && inField() && !!hd && hd.hasAttribute('data-aw-head') && !html.classList.contains('_gcNavLayer') && getComputedStyle(hd).display !== 'none';
  if (headOn !== html.classList.contains('gc-awhead')) html.classList.toggle('gc-awhead', headOn);
  var show = !headOn && !barOff && inField() && !!pill && pill.isConnected && pill.style.display !== 'none' && getComputedStyle(pill).display !== 'none';
  if (show) {
    var b = bar(); barCss();
    if (b.style.display !== 'flex') b.style.display = 'flex';
    var z = String((parseInt(pill.style.zIndex, 10) || 2147483000) - 1); if (b.style.zIndex !== z) b.style.zIndex = z;
    var t = topLayer(), c = t && t.querySelector('[data-aw-hid="close"]'), lab = c && /^cancel$/i.test(txt(c)) ? 'Cancel' : 'Done';
    var d = D.getElementById('gc-aw-done'); if (d && d.textContent !== lab) d.textContent = lab;
    if (!html.classList.contains('gc-awbar')) html.classList.add('gc-awbar');
  } else {
    if (BAR && BAR.style.display !== 'none') BAR.style.display = 'none';
    if (html.classList.contains('gc-awbar')) html.classList.remove('gc-awbar');
  }
}
/* a Field sheet: its own ‹ Back / Done / ✕ at the top step aside for the bar */
function headerize(layer){
  if (barOff || !inField() || !layer || !layer.isConnected || layer.nodeType !== 1) return;
  if (/^(_gcJobPick|_gcFieldHomeOv|gcuOv|gc-aw-bar|_gcAppHead|_gcAppTabs)$/.test(layer.id)) return;
  if (layer.id === '_gcJobDash') { logoRow(layer); return; }
  var lt = Math.max(0, layer.getBoundingClientRect().top), zone = lt + 150 + (layer.hasAttribute('data-gcnav-pad') ? 66 : 0) + safeTop(), n = 0;
  [].forEach.call(layer.querySelectorAll('button,a,[role=button]'), function(b){
    if (b.id === '_gcNavBk' || b.hasAttribute('data-aw-hid') || b.closest('#gc-aw-bar,.gcfp-sheet')) return;
    var s = txt(b), al = (b.getAttribute('aria-label') || '').trim();
    var k = BACK_RE.test(s) || /^back$/i.test(al) ? 'back' : (CLOSE_RE.test(s) || /^close$/i.test(al) || HEAD_RE.test(s)) ? 'close' : '';
    if (!k) return;
    var r = b.getBoundingClientRect(); if (!r.width || !r.height || r.top > zone) return;
    b.setAttribute('data-aw-hid', k); n++;
  });
  if (n) { try { W._gcNavSync && W._gcNavSync(); } catch (e) {} }
}
function safeTop(){ try { var p = D.getElementById('_gcNavSafe'); return p ? p.getBoundingClientRect().top || 0 : 0; } catch (e) { return 0; } }
/* the job page: ‹ Jobs … Camera, the logo between them */
function logoRow(layer){
  if (layer.querySelector('.gc-aw-mid')) return;
  var lt = layer.getBoundingClientRect().top, bk = null;
  [].some.call(layer.querySelectorAll('button,a,[role=button]'), function(b){ var r = b.getBoundingClientRect(); if (r.width && r.top - lt < 160 && BACK_RE.test(txt(b))) { bk = b; return true; } return false; });
  if (!bk) return;
  var row = bk.parentElement; while (row && row !== layer && row.getBoundingClientRect().width < layer.getBoundingClientRect().width * 0.7) row = row.parentElement;
  if (!row || row === layer) return;
  if (getComputedStyle(row).position === 'static') row.setAttribute('data-aw-logorow', '1');
  row.appendChild(logo('gc-aw-mid'));
}
/* desk pages opened in Field: the field header bar */
function appHead(){
  var h = D.getElementById('_gcAppHead'); if (barOff || !h || h.hasAttribute('data-aw-head')) return;
  var back = D.getElementById('_gcAppBack');
  if (back) back.innerHTML = '<span style="font-size:24px;line-height:1;margin-top:-2px">‹</span><span>Back</span>';
  h.appendChild(logo('gc-aw-head-logo'));
  var d = D.createElement('button'); d.type = 'button'; d.id = 'gc-aw-hdone'; d.textContent = 'Done';
  d.addEventListener('click', function(ev){ ev.preventDefault(); var b = D.getElementById('_gcAppBack'); if (b) b.click(); });
  h.appendChild(d);
  h.setAttribute('data-aw-head', '1'); barCss();
}
/* the desk: an opaque overlay over the whole window (it hides the sidebar's logo) gets a small logo mid-header */
function deskLogo(el){
  if (barOff || inField() || !el || !el.isConnected || el.nodeType !== 1 || el.querySelector('.gc-aw-dlogo') || el.closest(SKIP)) return;
  if (el.id === 'gc-aw-bar' || el.id === '_gcNavBk') return;
  var cs = getComputedStyle(el); if (cs.position !== 'fixed' || cs.display === 'none') return;
  var r = el.getBoundingClientRect(), vw = W.innerWidth, vh = W.innerHeight;
  if (r.left > 8 || r.width < vw * 0.95 || r.height < vh * 0.85) return;
  var bg = rgba(cs.backgroundColor); if (!bg || bg[3] < 0.97) return;                      /* a dimmed modal: the sidebar still shows */
  var hdr = null, lvl = [el];
  for (var d = 0; d < 4 && !hdr && lvl.length; d++) {
    var nx = [];
    lvl.forEach(function(p){ [].forEach.call(p.children, function(c){ if (hdr) return; var rc = c.getBoundingClientRect(); if (rc.top - r.top <= 8 && rc.width >= r.width * 0.85 && rc.height >= 36 && rc.height <= 130) hdr = c; else if (rc.top - r.top <= 8) nx.push(c); }); });
    lvl = nx;
  }
  if (!hdr || hdr.querySelector('.gc-aw-dlogo')) return;
  /* the middle of the header must be free: no text, button or field of it within ±60 px of the centre */
  var rh = hdr.getBoundingClientRect(), cx = rh.left + rh.width / 2;
  var near = function(re){ return re.width > 0 && re.height > 0 && re.right >= cx - 60 && re.left <= cx + 60; };
  var free = ![].some.call(hdr.querySelectorAll('button,a,input,select,textarea,img,svg,label,canvas'), function(e){ return near(e.getBoundingClientRect()); });
  if (free) {
    var tw = D.createTreeWalker(hdr, 4, null), tn, rg = D.createRange();
    while (free && (tn = tw.nextNode())) { if (!/\S/.test(tn.nodeValue)) continue; rg.selectNodeContents(tn); if (near(rg.getBoundingClientRect())) free = false; }
  }
  if (!free) return;
  if (getComputedStyle(hdr).position === 'static') hdr.setAttribute('data-aw-logorow', '1');
  hdr.appendChild(logo('gc-aw-mid gc-aw-dlogo')); barCss();
}
var BQ = new Set(), bqT = 0;
function barLater(el){ BQ.add(el); if (!bqT) bqT = later(function(){ bqT = 0; var s = BQ; BQ = new Set(); var L = inField() ? navLayers() : null; s.forEach(function(e){ try { if (L) { if (L.indexOf(e) >= 0) headerize(e); } else deskLogo(e); } catch (x) {} }); try { barSync(); } catch (x) {} }, 30); }
var mo2 = new MO(function(list){
  if (barOff) return;
  try {
    for (var i = 0; i < list.length; i++) {
      var m = list[i], n = m.target;
      if (m.type === 'childList' && n === D.body) { [].forEach.call(m.addedNodes, function(a){ if (a.nodeType === 1) barLater(a); }); continue; }
      if (n === D.documentElement || n === D.body) continue;
      if (n.id === '_gcNavBk' || n.id === '_gcAppHead') continue;
      var top = n; while (top.parentElement && top.parentElement !== D.body) top = top.parentElement;
      if (top.parentElement === D.body && top.id !== 'gc-aw-bar') barLater(top);
    }
    appHead(); barSync();
  } catch (e) { stats.barErr = String(e).slice(0, 200); }
});
function startBar(){
  if (barOff) return;
  barCss();
  mo2.observe(D.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  mo2.observe(D.documentElement, { attributes: true, attributeFilter: ['class'] });
  appHead(); barSync();
  [].forEach.call(D.body.children, function(c){ barLater(c); });
}
if (D.body) { start(); startBar(); } else D.addEventListener('DOMContentLoaded', function(){ start(); startBar(); });
W._gcAllWhite = { bar: { sync: barSync, headerize: headerize, deskLogo: deskLogo, off: function(v){ barOff = !!v; try { localStorage.setItem('gc_awbar_off', barOff ? '1' : ''); } catch (e) {} } }, debug: function(){ DBG = DBG || []; return DBG; }, scan: scan, paint: function(el){ paint([el || D.body]); }, skip: SKIP, tone: function(el){ return TONES.get(el) || ''; }, stats: function(){ return Object.assign({}, stats, { off: off }); }, kind: kind, contrast: function(a, b){ return contrast(rgba(a), rgba(b)); },
  off: function(v){ off = !!v; try { localStorage.setItem('gc_allwhite_off', off ? '1' : ''); } catch (e) {} if (off) { mo.disconnect(); [].forEach.call(D.querySelectorAll('[data-aw],[data-awt],[data-awbd]'), function(el){ el.removeAttribute('data-aw'); el.removeAttribute('data-awt'); el.removeAttribute('data-awbd'); }); } else start(); } };
try { console.log('[GC] every navy pop-up, sheet and page is white (patch ALLWHITE) — _gcAllWhite.stats()'); } catch (e) {}
})();
