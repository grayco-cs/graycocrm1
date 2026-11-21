// test_FIELDTAPS.mjs <build-dir> [role] [mode] — patch FIELDTAPS: tap EVERY control in GrayCo Field the way an installed iPhone app
// is used. iPhone 390x844 (isMobile, hasTouch), navigator.standalone = true + display-mode standalone, CPU throttled 4x.
// For a role (admin · office · pm · est · crew) and a mode (fresh · resume · net), visit the Field Home, the bottom bar's screens
// (Approvals, Jobs, My Schedule, More), a job page, and every sheet those open (one level down); on each screen list the visible
// buttons / links / tiles, and for each one:
//   • document.elementFromPoint at its centre must be the control (or inside it) — an invisible layer eating taps is a FAIL;
//   • a real touch tap (touchstart/touchend → click) must DO something within 1.5 s: navigation, a new screen / sheet, a state or
//     content change, a dialog, a file / camera / mic request, a link (tel:, sms:, mailto:, http) or a toast;
//   • never window.open() with no URL / about:blank (iOS standalone shows a black screen).
// Modes: fresh = a cold start · resume = background → resume (visibilitychange hidden → visible + pagehide / pageshow) before
// every screen · net = the network drops while the app loads and comes back.
// Out: a table (screen · control · result · why) on stdout and JSON in FT_OUT (default scratchpad/ft/out). Exit 1 on any FAIL
// outside FT_SKIPFAIL (a regex of screens owned elsewhere, e.g. "My Schedule").
// Usage: node test_FIELDTAPS.mjs <build> [admin|office|pm|est|crew|all] [fresh|resume|net|all]   (GC_HARNESS = harness_N.mjs)
//   FT_DEPTH 0|1 · FT_BUDGET seconds per role × mode · FT_SHEETMAX controls per sheet · FT_BIG=1 a company-sized data set ·
//   FT_FINGER_MS how long a finger stays down · FT_ONLY screens regex · FT_PROBE=<module> run a probe instead of the crawl.
// The phone is held to the iPhone's rules: a tap only clicks something that looks tappable (a control, cursor:pointer, or a
// listener of its own); a finger stays down ~120 ms (a screen redrawn in between loses the tap); in resume / net modes the
// requests in flight hang (an iOS dead socket) instead of failing fast.
// Made-up data only; nothing leaves the machine (the offline harness).
import fs from 'fs'; import { pathToFileURL } from 'url';
const H = await import(pathToFileURL(process.env.GC_HARNESS || '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/wN/harness_N.mjs').href);
const build = process.argv[2];
if (!build) { console.error('usage: node test_FIELDTAPS.mjs <build> [role|all] [mode|all]'); process.exit(2); }
const ROLES = (process.argv[3] || 'all') === 'all' ? ['admin', 'office', 'pm', 'est', 'crew'] : process.argv[3].split(',');
const MODES = (process.argv[4] || 'all') === 'all' ? ['fresh', 'resume', 'net'] : process.argv[4].split(',');
const OUT = process.env.FT_OUT || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/ft/out';
fs.mkdirSync(OUT, { recursive: true });
/* failures owned by other work in flight (listed, not counted in the exit code): the start-up data load (FASTOPEN2) and
   🗓 My Schedule (SCHEDFREEZE). FT_SKIPFAIL='' counts everything. */
const SKIPRX = process.env.FT_SKIPFAIL === undefined ? '^\\(start\\)|My Schedule' : process.env.FT_SKIPFAIL;
const SKIPFAIL = SKIPRX ? new RegExp(SKIPRX) : null;
const DEPTH = +(process.env.FT_DEPTH || 1);            /* 0 = the screens only (Home, the bottom bar's, a job page) · 1 = + every sheet they open */
const SHEETMAX = +(process.env.FT_SHEETMAX || 12);
const BUDGET = +(process.env.FT_BUDGET || 1500);
const FINGER_MS = +(process.env.FT_FINGER_MS || 120);   /* how long the finger stays down */   /* seconds per role × mode: then the screens left are listed as not reached */      /* controls tested per sheet */
const ONLY = process.env.FT_ONLY ? new RegExp(process.env.FT_ONLY) : null;   /* only screens matching */
const sleep = H.sleep;
const byId = id => Object.keys(H.ACCOUNTS).find(e => H.ACCOUNTS[e].id === id);
H.ACCOUNTS['crew.demo@example.test'] = { id: 'u-crew', name: 'Demo Crew', role: 'staff' };
const WHO = {
  admin: { email: byId('u-wesley'), name: 'Wesley Johnson', role: 'Admin', payType: 'owner' },
  office: { email: byId('u-office'), name: 'Office Demo', role: 'Office' },
  pm: { email: byId('u-pm'), name: 'Demo PM', role: 'Project Manager' },
  est: { email: byId('u-sbiffle'), name: 'Demo Estimator', role: 'Estimator' },
  crew: { email: 'crew.demo@example.test', name: 'Demo Crew', role: 'Superintendent' }
};
const iso = d => new Date(Date.now() - d * 864e5).toISOString(), day = d => iso(d).slice(0, 10), T = day(0);
function seed(){
  H.resetCloud();
  H.cset('users', Object.keys(WHO).map((k, i) => Object.assign({ id: 'u' + i, active: true, phone: '901555010' + i }, WHO[k])));
  const P = (id, name, x) => Object.assign({ id, name, client: 'Demo Client ' + id, address: id + ' Demo St', pm: 'Demo PM', estimator: 'Demo Estimator', super: 'Demo Crew', crew: ['Demo Crew'], status: 'active', contract: 20000, contractSigned: true, createdAt: iso(9), updatedAt: iso(1) }, x || {});
  H.cset('projects', [P('P1', 'Demo Kitchen Job'), P('P2', 'Demo Roof Job', { pm: 'Wesley Johnson', status: 'on_hold' }), P('P3', 'Demo Deck Job', { status: 'approved' })]);
  H.cset('leads', [{ id: 'L1', name: 'Demo bath lead', client: 'Demo Lead One', type: 'Residential Reno', stage: 'New Lead', phone: '9015550111', estimator: 'Demo Estimator', createdAt: iso(1), updatedAt: iso(1) },
    { id: 'L2', name: 'Demo siding lead', client: 'Demo Lead Two', type: 'Roofing', stage: 'Estimate Scheduled', phone: '9015550112', followUp: day(3), createdAt: iso(5), updatedAt: iso(4) }]);
  H.cset('customers', [{ id: 'CU1', name: 'Demo Client P1', phone: '9015550113' }]);
  H.cset('estimates', [{ id: 'E1', name: 'Demo Kitchen Job — estimate', status: 'Draft', pid: 'P1', lines: [], totalCost: 100, totalCharge: 150, createdAt: iso(3), updatedAt: iso(3) }]);
  H.cset('invs', [{ id: 'I1', type: 'client', pid: 'P1', client: 'Demo Client P1', invNum: '7001', amt: 5000, date: day(5), dueDate: day(-10), status: 'sent' }]);
  H.cset('schedule', [{ id: 'S1', pid: 'P1', projectId: 'P1', date: T, start: T, end: T, title: 'Demo framing', crew: ['Demo Crew'] }]);
  H.cset('gc_office_tasks', [{ id: 'T1', text: 'Demo call the inspector', done: false, createdAt: iso(1), assignee: 'Demo PM', pid: 'P1' }]);
  H.cset('timesheets', [{ id: 'TS1', employee: 'Demo Crew', date: T, hours: 8, pid: 'P1' }]);
  const ap = (id, kind, pid, nm) => ({ id, kind, title: kind + ' — ' + nm, jobId: pid, jobName: nm, pm: 'Demo PM', channel: 'email', to: 'demo@example.test', subject: 'Demo', html: '<p>Hi</p>', text: 'Hi', attachments: [], steps: ['pm'], step: 'pm', approvals: [], status: 'waiting', createdAt: iso(1), updatedAt: iso(1), meta: {} });
  H.cset('gc_approval_queue', JSON.stringify([ap('AP1', 'thank_you', 'P1', 'Demo Kitchen Job')]));
  if (process.env.FT_BIG) {   /* a real company's size: hundreds of jobs and leads, thousands of schedule rows */
    const pj = H.cget('projects'), ld = H.cget('leads'), sc = H.cget('schedule');
    for (let i = 0; i < 400; i++) pj.push(P('PB' + i, 'Demo Bulk Job ' + i, { status: i % 3 ? 'completed' : 'active', pm: i % 2 ? 'Demo PM' : 'Wesley Johnson' }));
    for (let i = 0; i < 900; i++) ld.push({ id: 'LB' + i, name: 'Demo bulk lead ' + i, client: 'Demo Lead B' + i, type: 'Residential Reno', stage: i % 4 ? 'Lost' : 'New Lead', estimator: 'Demo Estimator', createdAt: iso(i % 200), updatedAt: iso(i % 200) });
    for (let i = 0; i < 2500; i++) sc.push({ id: 'SB' + i, pid: 'PB' + (i % 400), projectId: 'PB' + (i % 400), date: day(60 - (i % 120)), start: day(60 - (i % 120)), end: day(60 - (i % 120)), title: 'Demo bulk work ' + i, crew: ['Demo Crew'] });
    H.cset('projects', pj); H.cset('leads', ld); H.cset('schedule', sc);
  }
  H.cset('gc_job_messages', JSON.stringify([{ id: 'M1', pid: 'P1', at: iso(0.1), text: 'Demo message', authorName: 'Demo PM', authorId: 'u2' }]));
}

/* ── the installed iPhone app, instrumented ── */
const INIT = `(() => {
  const d = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v, configurable: true }); } catch (e) {} };
  d(Navigator.prototype, 'userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1');
  d(Navigator.prototype, 'maxTouchPoints', 5); d(Navigator.prototype, 'standalone', true);
  const mm = window.matchMedia;
  window.matchMedia = function(q){ if (/display-mode:\\s*standalone/.test(q)) return { matches: true, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return false; } }; if (/display-mode/.test(q)) return { matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return false; } }; return mm.call(window, q); };
  const R = window.__ft = { rec: [], vis: 'visible', online: true, iosRule: true };
  const rec = (k, v) => R.rec.push({ k, v: String(v == null ? '' : v).slice(0, 120), at: Date.now() });
  Object.defineProperty(Document.prototype, 'visibilityState', { get: () => R.vis, configurable: true });
  Object.defineProperty(Document.prototype, 'hidden', { get: () => R.vis === 'hidden', configurable: true });
  Object.defineProperty(Navigator.prototype, 'onLine', { get: () => R.online, configurable: true });
  const wo = window.open; window.open = function(u){ rec(!u || /^about:blank/i.test(String(u)) ? 'open-blank' : 'open', u); try { return wo.apply(this, arguments); } catch (e) { return null; } };
  const ic = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function(){ if (this.type === 'file') { rec('file', this.accept || 'file'); return; } return ic.apply(this, arguments); };
  if (HTMLInputElement.prototype.showPicker) { const sp = HTMLInputElement.prototype.showPicker; HTMLInputElement.prototype.showPicker = function(){ rec('picker', this.type); try { return sp.apply(this, arguments); } catch (e) {} }; }
  try { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = c => { rec('media', JSON.stringify(c)); return Promise.reject(new DOMException('test', 'NotAllowedError')); }; } catch (e) {}
  try { navigator.share = x => { rec('share', JSON.stringify(x || {})); return Promise.resolve(); }; navigator.canShare = () => true; } catch (e) {}
  try { const g = navigator.geolocation; if (g) { g.getCurrentPosition = (ok, bad) => { rec('geo', ''); bad && bad({ code: 1, message: 'test' }); }; g.watchPosition = (ok, bad) => { rec('geo', ''); return 1; }; } } catch (e) {}
  const SR = function(){ this.start = () => rec('speech', ''); this.stop = () => {}; this.abort = () => {}; this.addEventListener = () => {}; }; window.webkitSpeechRecognition = window.SpeechRecognition = SR;
  try { const cw = navigator.clipboard && navigator.clipboard.writeText; if (cw) navigator.clipboard.writeText = t => { rec('clip', t); return Promise.resolve(); }; } catch (e) {}
  const ac = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function(){ if (this.download || /^blob:|^data:/.test(this.href)) { rec('download', this.download || this.href.slice(0, 30)); return; } return ac.apply(this, arguments); };
  /* a link that leaves the app (tel:, sms:, mailto:, another site, a new tab): note it, stay */
  document.addEventListener('click', e => { const a = e.target && e.target.closest && e.target.closest('a[href]'); if (!a) return; const h = a.getAttribute('href') || ''; if (/^#/.test(h) || /^javascript:/i.test(h)) return;
    if (/^(tel|sms|mailto|maps|geo):/i.test(h) || a.target === '_blank' || a.download || (/^https?:/i.test(a.href) && new URL(a.href).host !== location.host)) { rec('link', a.href); e.preventDefault(); } }, true);
  const la = Location.prototype.assign; try { Location.prototype.assign = function(u){ if (/^(tel|sms|mailto):/i.test(u)) { rec('link', u); return; } return la.call(this, u); }; } catch (e) {}
  window.addEventListener('error', e => rec('error', e.message));
  /* iPhone Safari: a tap only becomes a click on something that looks tappable — a real control, cursor:pointer, or an element
     (not the document / body) with a mouse / touch listener of its own. A listener on the document alone does not count. */
  const ael = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(t, f, o){ try { if (this && this.nodeType === 1 && this !== document.body && this !== document.documentElement && /^(click|mousedown|mouseup|touchstart|touchend|pointerdown|pointerup)$/.test(t)) this.__ftTap = 1; } catch (e) {} return ael.call(this, t, f, o); };
  R.drops = [];
  window.addEventListener('click', e => { if (!R.iosRule || !e.isTrusted) return; let q = e.target;
    while (q && q.nodeType === 1 && q !== document.body && q !== document.documentElement) { if (/^(A|BUTTON|INPUT|SELECT|TEXTAREA|LABEL|OPTION|SUMMARY|VIDEO|AUDIO|IFRAME)$/.test(q.tagName) || q.isContentEditable || q.__ftTap || typeof q.onclick === 'function' || q.hasAttribute('onclick') || getComputedStyle(q).cursor === 'pointer') return; q = q.parentElement; }
    R.drops.push({ at: Date.now(), t: (e.target && e.target.tagName) + '.' + (e.target && e.target.className) }); e.stopImmediatePropagation(); e.preventDefault(); }, true);
})()`;

/* ── in-page helpers (string so they can be installed again after a reload) ── */
const PAGE = `(() => {
  const F = window.__ftp = {};
  const vis = e => { if (!e || !e.getBoundingClientRect) return false; const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false; const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && +cs.opacity > 0.05 && cs.display !== 'none'; };
  F.vis = vis;
  const NOISE = /toast|Toast|gc-fh-sync|gc-sync-status|gc-save-note|gc-unsent-note|gcautai-pill|_gcAlertBanner|gc-ft-noise|^_v$/;
  /* the body child (layer) an element lives in */
  F.layerOf = el => { let e = el; while (e && e.parentElement && e.parentElement !== document.body) e = e.parentElement; return e && e.parentElement === document.body ? e : null; };
  F.lname = e => !e ? '' : (e.id ? '#' + e.id : (e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')));
  /* the layers over the page: visible fixed / absolute body children (toasts and the sync pill are noise) */
  F.layers = () => [...document.body.children].filter(e => vis(e) && /fixed|absolute|sticky/.test(getComputedStyle(e).position) && !NOISE.test(e.id + ' ' + e.className)).map(F.lname);
  /* the screen on top: what is under the middle of the phone */
  F.top = () => { for (const y of [300, 450, 200, 600]) { const h = document.elementFromPoint(195, y); const L = F.layerOf(h); if (L && !/gc-fh-tabs|toast/.test(L.id + L.className)) return L; } return null; };
  const norm = t => String(t || '').replace(/\\s+/g, ' ').trim();
  const hash = t => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return h; };
  F.text = L => { if (!L) return ''; let t = L.innerText || ''; document.querySelectorAll('#gc-fh-sync,[id*=toast],#gc-save-note,#gc-unsent-note,.gc-ft-noise').forEach(n => { const x = n.innerText; if (x && L.contains(n)) t = t.split(x).join(''); }); return norm(t).replace(/\\d+/g, '#').replace(/\\b(am|pm)\\b/gi, ''); };
  F.toast = () => [...document.querySelectorAll('[id*=toast],[class*=toast],[class*=Toast]')].filter(vis).map(e => norm(e.innerText).slice(0, 80)).filter(Boolean).join(' / ');
  F.fp = key => { const L = F.top(); const c = key ? F.find(key) : null; const ae = document.activeElement;
    return { href: location.href, hl: history.length, layers: F.layers().join(','), top: F.lname(L), th: hash(F.text(L)), tlen: F.text(L).length,
      ae: ae && ae !== document.body ? F.lname(ae) + ':' + (ae.tagName) : '', rec: window.__ft.rec.length, toast: F.toast(),
      cst: c ? [...c.attributes].filter(a => !/^style$/.test(a.name)).map(a => a.name + '=' + a.value).join('&') + '|' + (c.checked ? 1 : 0) + '|' + hash(norm(c.innerText)) : '',
      sy: L ? L.scrollTop : 0 }; };
  const SEL = 'button,a[href],[role=button],[onclick],input:not([type=hidden]),select,textarea,label[for],[data-fa],[data-pmf-a],[data-ra-a],[data-t],[tabindex]:not([tabindex="-1"]),[data-a],[data-act],[data-action],[data-go],[data-open],[data-fp],[data-jd],[data-fn]';
  const isCtl = e => e.matches(SEL) || (getComputedStyle(e).cursor === 'pointer' && !(e.parentElement && getComputedStyle(e.parentElement).cursor === 'pointer') && e.children.length < 40);
  const label = e => norm(e.getAttribute('aria-label') || e.innerText || e.value || e.placeholder || e.title || e.getAttribute('alt') || e.name || e.id || '').slice(0, 44);
  const dattr = e => [...e.attributes].filter(a => /^data-(?!pid$|id$|job$|k$|key$|i$|idx$|gc-keep|gcnav)/.test(a.name) || a.name === 'id').map(a => a.name + '=' + a.value.replace(/[0-9a-f]{8,}|\\d{3,}/gi, '#')).join(',');
  F.key = e => (e.tagName + '|' + dattr(e) + '|' + label(e).replace(/\\d+/g, '#'));
  /* the controls of a layer (and the bottom bar when asked) */
  /* iPhone: a tap on a plain <div>/<span> whose click is handled by a listener on the document never fires a click
     (iOS only sends clicks to elements that look tappable: cursor:pointer, an onclick of their own, or a real control) */
  F.iosDead = () => {
    const L = F.top(); if (!L) return [];
    const A = '[data-fa],[data-pmf-a],[data-ra-a],[data-a],[data-act],[data-action],[data-go],[data-open],[data-fp],[data-d],[data-x],[data-t],[data-tab],[data-nav],[data-view],[data-pick],[data-jd],[data-fn]';
    const out = [];
    [L, document.getElementById('gc-fh-tabs')].filter(Boolean).forEach(R => R.querySelectorAll(A).forEach(e => {
      if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA|LABEL|OPTION|FORM|SECTION|svg)$/i.test(e.tagName) || !vis(e) || e.closest('button,a,label')) return;
      if (getComputedStyle(e).cursor === 'pointer') return;
      let q = e, own = false; while (q && q !== document.body) { if (typeof q.onclick === 'function' || q.hasAttribute('onclick')) { own = true; break; } q = q.parentElement; }
      if (own) return;
      if (!e.innerText || !norm(e.innerText)) return;
      out.push(F.key(e) + ' "' + label(e) + '"');
    }));
    return out.slice(0, 20);
  };
  F.list = (tabs) => {
    const L = F.top(); const roots = [L].concat(tabs ? [document.getElementById('gc-fh-tabs')] : []).filter(Boolean);
    const out = [], seen = {};
    roots.forEach(R => R.querySelectorAll('*').forEach(e => {
      if (!isCtl(e) || !vis(e) || e.disabled || e.closest('[aria-hidden=true]')) return;
      if (e.matches('label') && e.querySelector('input,select,textarea')) return;
      const k = F.key(e); seen[k] = (seen[k] || 0) + 1; if (seen[k] > 1) return;   /* the same control twice (list rows): the first one */
      out.push({ key: k, label: label(e), tag: e.tagName.toLowerCase(), type: e.type || '' });
    }));
    return out;
  };
  F.find = key => { const L = F.top(); const roots = [L, document.getElementById('gc-fh-tabs')].filter(Boolean); for (const R of roots) for (const e of R.querySelectorAll('*')) if (vis(e) && !e.disabled && isCtl(e) && F.key(e) === key) return e; return null; };
  /* bring it to the middle; then: who gets a tap at its centre? */
  F.aim = key => { const e = F.find(key); if (!e) return null; try { if (!e.closest('#gc-fh-tabs')) e.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch (x) {} const r = e.getBoundingClientRect();
    const x = Math.max(1, Math.min(innerWidth - 2, r.left + r.width / 2)), y = Math.max(1, Math.min(innerHeight - 2, r.top + r.height / 2)); const h = document.elementFromPoint(x, y);
    const ok = !!h && (h === e || e.contains(h) || h.contains(e) && h.tagName === 'LABEL');
    /* covered by a visible prompt (a dialog with words in it, in the same screen) vs an invisible layer */
    let prompt = false; if (!ok && h) { let q = h; while (q && q !== document.body) { const cs = getComputedStyle(q); if (/fixed|absolute/.test(cs.position) && norm(q.innerText).length > 12 && !q.contains(e)) { prompt = !/toast|snack|pill|note/i.test(q.id + ' ' + q.className); break; } q = q.parentElement; } }
    const sel = /(^|\s)(on|active|sel|selected|cur|current|is-on)(\s|$)/.test(typeof e.className === 'string' ? e.className : '') || e.getAttribute('aria-pressed') === 'true' || e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-current') === 'page' || e === document.activeElement;
    return { x, y, ok, hit: h ? F.lname(F.layerOf(h)) + ' > ' + h.tagName.toLowerCase() + (h.id ? '#' + h.id : '') + (typeof h.className === 'string' && h.className ? '.' + h.className.trim().split(/\\s+/)[0] : '') + ' "' + norm(h.innerText).slice(0, 30) + '"' : 'nothing', w: r.width, h: r.height, onscreen: r.bottom > 0 && r.top < innerHeight, prompt, sel }; };
})()`;

const DESTRUCT = /sign ?out|log ?out|delete|remove|🗑|reset|wipe|erase|archive|deactivat|clear all|forget/i;
const LEAVES = /^🖥|desk view|\bDesk\b|full crm|☰ ?full|view as/i;    /* go to the desk: tested, then the Field is reopened */

async function runOne(roleK, mode){
  const T00 = Date.now();
  seed();
  const who = WHO[roleK];
  const A = await H.computer('FT-' + roleK, { build, mobile: true, init: [INIT, PAGE] });   /* the helpers come back after any reload */
  A.acceptConfirm = false;           /* a confirm() counts as "something happened"; it is answered No */
  const pg = A.page();
  let net = { drop: false, stall: false, held: 0 };
  await A.ctx.route(u => { try { const x = new URL(u); return x.host === H.SBH || /\.netlify\/functions/.test(x.pathname); } catch (e) { return false; } }, async r => {
    if (net.drop) return r.abort('internetdisconnected');
    /* a dead socket (iOS after the app was in the background, or a weak signal): the request just hangs, then fails 40 s later */
    if (net.stall) { net.held++; await new Promise(res => setTimeout(res, 40000)); return r.abort('timedout').catch(() => {}); }
    return r.fallback();
  });
  const cdp = await A.ctx.newCDPSession(pg);
  const throttle = async () => { try { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); } catch (e) {} };
  /* a finger: down, ~120 ms, up (a real tap is not instant — a screen redrawn in between loses the tap, as on a phone) */
  const finger = async (x, y) => {
    try { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 6, radiusY: 6, force: 1, id: 1 }] }); await sleep(FINGER_MS);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); } catch (e) { await pg.touchscreen.tap(x, y); }
  };
  const popups = []; A.ctx.on('page', p => { if (p !== pg) popups.push(p); });
  let chooser = 0; pg.on('filechooser', () => { chooser++; });
  const ev = (f, a) => pg.evaluate(f, a);
  const helpers = () => pg.evaluate(PAGE);
  const rows = [], screensSeen = new Set();
  const log = (screen, control, result, why) => { rows.push({ role: roleK, mode, screen, control, result, why }); console.log(`  ${((Date.now() - T00) / 1000).toFixed(0)}s ${result === 'OK' ? '✓' : result === 'SKIP' ? '·' : result === 'NOTE' ? '!' : '✗'} [${roleK}/${mode}] ${screen} · ${control} · ${result} · ${why}`); };
  const boot = { ok: false };
  try {
    await throttle();
    const signed = await H.signIn(A, who.email, 60000);
    console.log('  signed in ' + ((Date.now() - T00) / 1000).toFixed(0) + 's');
    await throttle();
    if (mode === 'net') {
      /* the network drops while the app loads, and comes back 6 s later */
      net.stall = true;
      await pg.reload({ waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {});
      await throttle();
      await ev(() => { window.__ft.online = false; window.dispatchEvent(new Event('offline')); }).catch(() => {});
      await sleep(6000);
      net.stall = false;
      await ev(() => { window.__ft.online = true; window.dispatchEvent(new Event('online')); }).catch(() => {});
    }
    boot.ok = !!(await H.waitFor(A, () => !!document.querySelector('#_gcJobPick.gc-fh') && !!document.querySelector('#gc-fh-tabs [data-t]'), null, 90000));
    if (!boot.ok) { log('(start)', 'GrayCo Field opens', 'FAIL', 'no Field Home after sign-in (signed=' + signed + ')'); throw new Error('no field'); }
    await helpers();
    /* the data: how long after the start (net: after the network came back) until the jobs are on the phone */
    { const t0 = Date.now(); const got = await H.waitFor(A, () => ((window._crm || {}).projects || []).length > 0 && !!document.querySelector('#_gcJobPick [data-fa="open"],#_gcJobPick [data-pmf-a="item"],#_gcJobPick .fh-job'), null, 90000); const sec = (Date.now() - t0) / 1000;
      log('(start)', mode === 'net' ? 'the jobs on Home after the network came back' : 'the jobs on Home', got && sec <= 10 ? 'OK' : 'FAIL', got ? 'there after ' + sec.toFixed(1) + ' s' + (sec > 10 ? ' — until then Home is empty and Update job / Clock in say "No open job"' : '') : 'still empty after 90 s'); }
    await sleep(4000);
    /* the start-up toasts go away first */
    await ev(() => document.querySelectorAll('[id*=toast]').forEach(t => { t.style.display = 'none'; }));
    const homeLayers = await ev(() => window.__ftp.layers());
    const resume = async () => {
      net.stall = true; setTimeout(() => { net.stall = false; }, 7500);
      await ev(async () => { const R = window.__ft; R.vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); window.dispatchEvent(new Event('blur'));
        await new Promise(r => setTimeout(r, 1500)); R.vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); window.dispatchEvent(new Event('focus')); });
      await sleep(1200);
    };
    /* back to the Field Home the way a person would: the Home tab; anything left over is noted, then cleared */
    const goHome = async (why) => {
      await pg.keyboard.press('Escape').catch(() => {});
      /* the Home tab when a finger can reach it; else the screen's own ✕ / ‹ Back / Close / Done (up to 3 deep) */
      let st = 'err';
      for (let i = 0; i < 4; i++) {
        st = await ev(() => { const F = window.__ftp; if (!F) return 'nohelpers'; const t = document.querySelector('#gc-fh-tabs [data-t="home"]');
          let cov = t ? (F.vis(t) ? '' : 'the bottom bar is hidden') : 'no Home tab';
          if (t && F.vis(t)) { const r = t.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (h && t.contains(h)) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; cov = 'the Home tab is under ' + F.lname(F.layerOf(h)) + ' > ' + (h ? h.tagName.toLowerCase() + (h.id ? '#' + h.id : '') + (typeof h.className === 'string' && h.className ? '.' + h.className.trim().split(/\s+/)[0] : '') : '?'); }
          window.__ftCov = cov;
          const L = F.top(); if (!L || L.id === '_gcJobPick') return 'home';
          const B = [...L.querySelectorAll('button,a,[role=button]')].filter(F.vis), lab = b => (b.getAttribute('aria-label') || b.innerText || '').trim();
          const c = B.find(b => /^(✕|×|✖)$/.test((b.innerText || '').trim()) || /^close$/i.test(b.getAttribute('aria-label') || '') || b.matches('[data-d="x"],[data-x="close"],[data-x=""],[data-close]'))
            || B.find(b => /^(✕|×|✖|‹|←)/.test(lab(b)) || /^(back|close|done|cancel)$/i.test(lab(b)))
            || B.find(b => /^(back|close)\b/i.test(lab(b)) && lab(b).length < 16);
          const hb = document.getElementById('_gcAppBack');   /* a desk page in the Field: its header's ‹ */
          const cc = c || (hb && F.vis(hb) ? hb : null);
          if (cc) { cc.click(); return 'closed'; } return 'stuck'; }).catch(() => 'err');
        if (st && st.x) { await finger(st.x, st.y); st = 'tab'; break; }   /* a finger on the Home tab */
        if (st !== 'closed') break; await sleep(400);
      }
      if (st === 'nohelpers') { await helpers(); st = 'ok'; }
      await sleep(500);
      let s = await ev(() => ({ top: window.__ftp.lname(window.__ftp.top()), layers: window.__ftp.layers(), field: document.documentElement.classList.contains('_fieldmode'), pick: !!document.querySelector('#_gcJobPick.gc-fh') })).catch(() => null);
      const extra = s ? s.layers.filter(l => !homeLayers.includes(l)) : [];
      if (s && s.top === '#_gcJobPick' && !extra.length) { await settle(true); return { ok: true }; }
      /* is any of what was left over actually on top of part of the Home (a finger would hit it)? */
      const over = s && extra.length ? await ev(ex => { const F = window.__ftp, hits = new Set(); for (let y = 30; y < innerHeight - 90; y += 60) for (let x = 20; x < innerWidth; x += 70) { const h = document.elementFromPoint(x, y); const L = F.lname(F.layerOf(h)); if (ex.includes(L)) hits.add(L); } return [...hits]; }, extra).catch(() => []) : [];
      const cov = await ev(() => window.__ftCov || '').catch(() => '');
      const left = s ? { top: s.top, extra, how: st, over, cov } : null;
      /* clear: close what is open, reopen the Field Home */
      await ev((home) => { const T = window.__ftp.top(); document.querySelectorAll('body > *').forEach(e => { const n = window.__ftp.lname(e); if (window.__ftp.vis(e) && (e === T || /fixed|absolute/.test(getComputedStyle(e).position)) && !home.includes(n) && !/toast|gc-fh-sync|_gcJobPick|gc-fh-tabs|^#root$/.test(n)) e.remove(); });
        try { if (!document.documentElement.classList.contains('_fieldmode') && window._gcSetFieldMode) window._gcSetFieldMode(true); } catch (e) {} try { window._gcField && window._gcField.open(); } catch (e) {} }, homeLayers).catch(() => {});
      await sleep(800);
      s = await ev(() => ({ top: window.__ftp.lname(window.__ftp.top()) })).catch(() => null);
      if (s && s.top === '#_gcJobPick') await settle(true);
      if (!s || s.top !== '#_gcJobPick') {
        await pg.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); await throttle();
        await H.waitFor(A, () => !!document.querySelector('#_gcJobPick.gc-fh'), null, 60000); await helpers(); await sleep(1500);
        await ev(() => document.querySelectorAll('[id*=toast]').forEach(t => { t.style.display = 'none'; })).catch(() => {});
        return { ok: false, left, reloaded: true };
      }
      return { ok: false, left };
    };
    const tapKey = async (key) => {
      const aim = await ev(k => window.__ftp.aim(k), key).catch(() => null);
      if (!aim) return null;
      await sleep(150);
      const aim2 = await ev(k => window.__ftp.aim(k), key).catch(() => null) || aim;   /* after the scroll settled */
      await finger(aim2.x, aim2.y);
      return aim2;
    };
    /* tap one control on a screen and see what happens */
    const tryControl = async (screen, c) => {
      const errs0 = A.errs.length, dlg0 = A.dialogs.length, ch0 = chooser, pop0 = popups.length;
      const before = await ev(k => window.__ftp.fp(k), c.key);
      const rec0 = before.rec;
      const aim = await tapKey(c.key);
      if (!aim) return { result: 'SKIP', why: 'gone before the tap' };
      const t0 = Date.now(); let what = null, after = null;
      const look = async () => {
        after = await ev(k => window.__ftp ? window.__ftp.fp(k) : null, c.key).catch(() => null);
        const recs = await ev(n => window.__ft.rec.slice(n), rec0).catch(() => []);
        if (recs.some(r => r.k === 'open-blank')) return 'BAD window.open(' + (recs.find(r => r.k === 'open-blank').v || '') + ') — a black screen in the installed app';
        const r1 = recs.filter(r => r.k !== 'error');
        if (r1.length) return r1.map(r => r.k + (r.v ? ' ' + r.v.slice(0, 50) : '')).join('; ');
        if (A.dialogs.length > dlg0) return 'dialog: ' + A.dialogs[A.dialogs.length - 1].message.slice(0, 60);
        if (chooser > ch0) return 'file picker';
        if (popups.length > pop0) return 'new window ' + popups[popups.length - 1].url().slice(0, 50);
        if (!after) return 'page reloaded / navigated';
        if (after.href !== before.href || after.hl !== before.hl) return 'navigated ' + after.href.replace(/^https?:\/\/[^/]+/, '');
        if (after.top !== before.top) return 'opened ' + after.top;
        if (after.layers !== before.layers) return 'layers ' + after.layers.split(',').filter(x => !before.layers.split(',').includes(x)).join(',');
        if (after.th !== before.th) return 'content changed';
        if (after.toast && after.toast !== before.toast) return 'toast: ' + after.toast.slice(0, 70);
        if (after.ae !== before.ae && /INPUT|TEXTAREA|SELECT/.test(after.ae)) return 'focused ' + after.ae;
        if (after.cst !== before.cst) return 'state changed';
        return null;
      };
      while (Date.now() - t0 < 1500 && !(what = await look())) await sleep(100);
      const ms = Date.now() - t0;
      let result = 'OK', why = what || '';
      if (!what) {
        /* nothing in 1.5 s: is it slow (waiting on something) or dead? */
        const t1 = Date.now(); while (Date.now() - t1 < 3500 && !(what = await look())) await sleep(250);
        result = 'FAIL'; why = what ? 'SLOW ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s → ' + what : 'DEAD: nothing happened in 5 s';
        if (!what && aim.sel) { result = 'OK'; why = 'already the chosen / focused one (nothing to change)'; }
        else if (!what) { const dr = await ev(t => window.__ft.drops.filter(d => d.at >= t).length, t0 - 300).catch(() => 0); if (dr) why += ' — iPhone sends no click here (a plain element with no cursor:pointer and no tap handler of its own)'; }
      } else if (/^BAD/.test(what)) result = 'FAIL';
      if (!aim.ok && aim.prompt) { result = 'NOTE'; why = 'behind an open prompt: ' + aim.hit + (what ? ' (the tap did: ' + what + ')' : ''); }
      else if (!aim.ok) { result = 'FAIL'; why = 'COVERED: a tap at its centre lands on ' + aim.hit + (what ? ' (the tap did: ' + what + ')' : ''); }
      const errs = A.errs.slice(errs0); if (errs.length) { if (result === 'OK') result = 'FAIL'; why += ' · page error: ' + errs[0].slice(0, 120); }
      return { result, why, ms, after, before };
    };
    /* wait until the screen stops changing (a slow phone paints in steps) */
    const settle = async (tabs) => { let last = -1, same = 0; const t0 = Date.now();
      while (Date.now() - t0 < 8000) { const n = await ev(() => { try { const L = window.__ftp.top(); return (L ? L.querySelectorAll('button,a,input,select,[data-fa]').length : 0) + ':' + window.__ftp.lname(L); } catch (e) { return 'x'; } }).catch(() => 'x'); if (n === last) { if (++same >= 2) return; } else { same = 0; last = n; } await sleep(400); } };
    if (process.env.FT_PROBE) { const m = await import(pathToFileURL(process.env.FT_PROBE).href); await m.default({ A, pg, ev, sleep, H, tapKey, goHome, resume, settle, log, net }); throw new Error('no field: probe done'); }
    /* a screen = how to get to it from the Home */
    const screens = [];
    const addScreen = (name, path, depth) => { if (screensSeen.has(name)) return; screensSeen.add(name); screens.push({ name, path, depth }); };
    const openPath = async (path) => {
      const h = await goHome();
      for (const step of path) {
        if (mode === 'resume' && step === path[0]) await resume();
        await H.waitFor(A, k => !!(window.__ftp && window.__ftp.find(k)), step.key, 6000);
        const aim = await tapKey(step.key);
        if (!aim) return { ok: false, why: 'could not find "' + step.label + '" to get here' };
        await sleep(step.wait || 900); await settle(false);
      }
      return { ok: true, home: h };
    };
    await settle(true);
    addScreen('Home', [], 0);
    /* the bottom bar and the job page are screens of their own */
    const tabs = await ev(() => [...document.querySelectorAll('#gc-fh-tabs [data-t]')].filter(b => window.__ftp.vis(b)).map(b => ({ key: window.__ftp.key(b), label: b.innerText.replace(/\s+/g, ' ').trim() })));
    for (const t of tabs) if (!/home/i.test(t.label)) addScreen('Tab: ' + t.label, [t], 0);
    const job = await ev(() => { const b = document.querySelector('#_gcJobPick [data-fa="open"][data-pid]'); return b ? { key: window.__ftp.key(b), label: 'job: ' + b.innerText.trim() } : null; });
    if (job) addScreen('Job page', [job], 0);
    for (let si = 0; si < screens.length; si++) {
      const S = screens[si];
      if (ONLY && !ONLY.test(S.name)) continue;
      if ((Date.now() - T00) / 1000 > BUDGET) { log(S.name, '(screen)', 'SKIP', 'time budget used up (FT_BUDGET ' + BUDGET + ' s)'); continue; }
      const o = await openPath(S.path);
      if (!o.ok) { log(S.name, '(open)', 'FAIL', o.why); continue; }
      if (mode === 'resume' && !S.path.length) await resume();
      await settle(S.name === 'Home');
      const top = await ev(() => window.__ftp.lname(window.__ftp.top()));
      if (S.path.length && top === '#_gcJobPick' && !/^Tab/.test(S.name)) { log(S.name, '(open)', 'SKIP', 'it did not open a screen of its own'); continue; }
      let list = await ev(t => window.__ftp.list(t), S.name === 'Home');
      if (S.depth >= 2) list = list.slice(0, SHEETMAX);
      console.log(`— ${roleK}/${mode} · ${S.name} (${top}) · ${list.length} controls`);
      let onScreen = true;
      for (const c of list) {
        if (DESTRUCT.test(c.label)) { log(S.name, c.label, 'SKIP', 'destructive / ends the session — not tapped'); continue; }
        if (!onScreen) { const o2 = await openPath(S.path); if (!o2.ok) { log(S.name, c.label, 'FAIL', 'could not get back to the screen: ' + o2.why); continue; } if (mode === 'resume') await resume(); }
        let here = await ev(k => !!window.__ftp.find(k), c.key);
        if (!here) { const o3 = await openPath(S.path); here = o3.ok && await ev(k => !!window.__ftp.find(k), c.key); }
        if (!here) { const dg = await ev(() => window.__ftp.lname(window.__ftp.top()) + ' · ' + window.__ftp.list(false).length + ' controls · ' + window.__ftp.layers().join(',')).catch(() => '?'); log(S.name, c.label, 'SKIP', 'not on the screen when it was reopened (' + dg + ')'); onScreen = false; continue; }
        const r = await tryControl(S.name, c);
        /* a new sheet / screen → explore it (one level down) */
        const opened = r.after && r.before && r.after.top !== r.before.top && r.after.top && r.after.top !== '#_gcJobPick';
        if (opened && r.after.top !== '#root' && S.depth + 1 <= DEPTH && !LEAVES.test(c.label) && !(S.name === 'Home' && /^BUTTON\|data-t=/.test(c.key))) addScreen(S.name + ' › ' + c.label, S.path.concat([{ key: c.key, label: c.label }]), S.depth + 1);
        log(S.name, c.label, r.result, r.why);
        /* back where we were? (an unchanged screen needs no reset) */
        const same = r.result !== 'OK' && r.after && r.before && r.after.top === r.before.top && r.after.layers === r.before.layers;
        onScreen = !!same;
        if (!onScreen) {
          const h = await goHome();
          if (h.left && !LEAVES.test(c.label) && (h.left.extra.length || h.left.top !== '#_gcJobPick')) {
            const what = (h.left.extra.length ? 'left behind ' + h.left.extra.join(', ') + ' · ' : '') + 'on top: ' + h.left.top;
            if (h.left.how === 'tab' && h.left.top === '#_gcJobPick' && !h.left.over.length) log(S.name, c.label + ' → then 🏠 Home tab', 'NOTE', 'still in the page but under the Home (no tap reaches it): ' + what);
            else if (h.left.how === 'tab') log(S.name, c.label + ' → then 🏠 Home tab', 'FAIL', 'a finger on the Home tab did not get back to Home: ' + what + (h.left.over.length ? ' · over the Home: ' + h.left.over.join(', ') : ''));
            else if (h.left.how === 'stuck') log(S.name, c.label + ' → then back', 'FAIL', 'TRAPPED: ' + (h.left.cov || 'the Home tab is covered') + ', and the screen has no ✕ / Back: ' + what);
            else log(S.name, c.label + ' → then ✕ / Back', 'NOTE', 'its own ✕ / Back did not get back to Home (the test cleared it): ' + what);
          }
          if (h.reloaded) log(S.name, c.label, 'NOTE', 'the Field had to be reloaded to get back');
        }
        while (popups.length) { const p = popups.pop(); await p.close().catch(() => {}); }
      }
    }
  } catch (e) { if (!/no field/.test(String(e))) log('(run)', '(test)', 'FAIL', 'threw: ' + String(e && e.stack || e).slice(0, 300)); }
  await A.close().catch(() => {});
  return rows;
}

const ALL = [];
for (const r of ROLES) for (const m of MODES) {
  const t0 = Date.now();
  const rows = await runOne(r, m);
  ALL.push(...rows);
  if (!process.env.FT_PROBE) fs.writeFileSync(OUT + '/ft_' + r + '_' + m + '.json', JSON.stringify(rows, null, 1));
  const n = rows.filter(x => x.result === 'OK' || x.result === 'FAIL').length, f = rows.filter(x => x.result === 'FAIL').length;
  console.log(`== ${r}/${m}: ${n} controls tapped, ${f} FAIL (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
const fails = ALL.filter(x => x.result === 'FAIL');
console.log('\n| role/mode | screen | control | result | why |\n|---|---|---|---|---|');
for (const x of ALL.filter(x => x.result !== 'OK' && x.result !== 'SKIP')) console.log(`| ${x.role}/${x.mode} | ${x.screen} | ${x.control} | ${x.result} | ${x.why.replace(/\|/g, '/')} |`);
const hard = fails.filter(x => !(SKIPFAIL && SKIPFAIL.test(x.screen + ' ' + x.control)));
console.log(`FIELDTAPS ${ALL.filter(x => x.result === 'OK').length} OK · ${fails.length} FAIL (${fails.length - hard.length} in screens owned elsewhere) · ${ALL.filter(x => x.result === 'SKIP').length} skipped`);
process.exit(hard.length ? 1 : 0);
