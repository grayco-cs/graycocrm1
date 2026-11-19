// crawl.mjs — the button crawler of the release QA gate: on each screen, every visible control (buttons, links, tiles, tabs,
// view switchers, dropdowns, ✕ / Back) is tapped from a fresh state of that screen, two levels deep, and judged:
//   navigation · a panel / sheet opened · changed in place · a toast · a file picker · a confirm (answered Cancel)  → OK
//   nothing at all → FAIL "dead button" · a page error → FAIL · a shared gc_kv list written with no data entered → FAIL
//   (a save-type button — Save / Approve / Send … — may write: logged as an expected save) · an outbound send (texts,
//   e-mails, notifications — the offline harness stubs every function; each call is logged) · any request that reached a
//   real outside host → FAIL · a reaction slower than the profile's limit → SLOW · no way back / stuck open → FAIL.
// Destructive controls (delete, remove, purge, void, sign out …) are listed but not tapped; confirm() dialogs get Cancel.
import fs from 'fs'; import path from 'path';

const DESTRUCTIVE = /\b(delete|remove|purge|wipe|void|log ?out|sign ?out|reset|force-clean|clear (all|cloud|data)|merge records|unlink|deactivate|deny|reject|discard|archive)\b|🗑|⛔ ?delete|\bterminate\b|uninstall|turn off here/i;
const SAVEISH = /\b(save|approve|confirm|send|sent|mark|done|update|add|apply|record|assign|accept|award|post|submit|create|use (it|this)|restore|resume|keep|set|reviewed|acknowledg|check(ed)?|ok|yes|move|convert|import|pay|clock|start|finish|complete|tick|pin|star|follow|snooze|dismiss|hide|reply)\b|💾|📤/i;
const SENDFN = /^(send-email|texts|sub-texts|comms|appr-ping|approval-escalate|mail-center|mail-all|mail-followup|mail-sent|portal-reminders|social-post|cust-care|winback|referral|weekly-update|bid-alerts|missed-call|track-call|sms|twilio|push)$/i;
const SENDBODY = /"(action|op|type)"\s*:\s*"[^"]*(send|text|sms|email|mail|notify|invite|remind|ping)[^"]*"/i;
const OWN = /^(gc_perfrep_|gc_bootrep_|gc_adm_dev_|gc_activity_|gc_timeclock_|_probe_|gc_presence|gc_seen_|gc_lastseen|gc_device_|gc_kept_log)/;
/* toasts the CRM shows by itself (sync state, assignments): not a reaction to the tap */
export const BG_TOAST = /^(☁ ?)?(All synced|Saved on this (computer|phone)|Sent ✓|Sending|🔔 Assigned to you|📥 \d+ new)/i;
export const SLOW_MS = 5000;
const LOCAL_HOSTS = /^(app\.local|ieeonhpfahmwwecizdut\.supabase\.co|sb\.test|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com)$/;

/* ── in the page: the controls on the screen now (the top layer, plus small fixed bars / buttons over it) ── */
export function enumerate(o){
  const CL = 'button,a[href],[role=button],[role=tab],[role=menuitem],[onclick],select,summary,input[type=checkbox],input[type=radio],input[type=button],input[type=submit],[data-ra-a],[data-t],[data-fp],[data-fn],[data-fm],[tabindex]:not([tabindex="-1"])';
  const vw = innerWidth, vh = innerHeight;
  const vis = e => { if (e.closest('[aria-hidden=true]') || e.disabled) return false; const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0 || s.pointerEvents === 'none') return false; const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3; };
  const layer = e => { for (let a = e; a && a !== document.body; a = a.parentElement) { const p = getComputedStyle(a).position; if (p === 'fixed') return a; } return document.body; };
  const z = e => { if (e === document.body) return 0; let m = 0; for (let a = e; a && a !== document.body; a = a.parentElement) { const v = parseInt(getComputedStyle(a).zIndex); if (!isNaN(v)) m = Math.max(m, v); } return m; };
  const big = l => { const r = l.getBoundingClientRect(); return r.width * r.height > vw * vh * 0.3; };
  /* the screen on top: the highest full-size fixed layer that has controls (a sheet and its backdrop are both full-size;
     the sheet is the one with buttons), else the page itself */
  const hasCtl = l => [...l.querySelectorAll(CL)].some(vis);
  const layers = [...document.querySelectorAll('body *')].filter(e => { const s = getComputedStyle(e); if (s.position !== 'fixed' || s.display === 'none' || s.visibility === 'hidden') return false; for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) if (getComputedStyle(a).position === 'fixed') return false; return big(e); });
  const order = layers.map((e, i) => ({ e, i, z: z(e) })).sort((a, b) => b.z - a.z || b.i - a.i);
  const topRec = order.find(x => hasCtl(x.e)); const top = topRec ? topRec.e : document.body;
  /* a sheet open over a page: its layer is the screen; the page below it is not */
  const t = e => (e.innerText || e.value || e.getAttribute('aria-label') || e.title || (e.querySelector && e.querySelector('img[alt]') ? e.querySelector('img[alt]').alt : '') || '').replace(/\s+/g, ' ').trim();
  let L = [...document.querySelectorAll(CL)].filter(vis).filter(e => !(o && o.noBars && e.closest('nav, aside'))).filter(e => { const l = layer(e); if (l === top) return true; if (l === document.body) return top === document.body; if (big(l)) return z(l) >= z(top) && hasCtl(l) && l.compareDocumentPosition(top) & Node.DOCUMENT_POSITION_PRECEDING; return z(l) >= z(top) && !(o && o.noBars); });
  /* drop a wrapper that only wraps one control with the same text (keep the inner one) */
  const S = new Set(L);
  L = L.filter(e => { for (const c of e.querySelectorAll(CL)) if (S.has(c) && t(c) === t(e)) return false; return true; });
  const keyOf = e => [e.tagName, e.id || '', (typeof e.className === 'string' ? e.className.split(/\s+/)[0] : ''), t(e).replace(/\d+/g, '#').slice(0, 50), ['data-t', 'data-ra-a', 'data-fp', 'data-fn', 'data-fm', 'data-m'].map(a => e.getAttribute(a) || '').join('')].join('|');
  const seen = {};
  return L.map(e => { const k = keyOf(e); seen[k] = (seen[k] || 0) + 1; const ids = []; for (let a = e; a && a !== document.body && ids.length < 10; a = a.parentElement) if (a.id) ids.push(a.id);
    const data = [...e.attributes].filter(a => /^data-/.test(a.name)).map(a => a.name + '=' + a.value).slice(0, 8);
    const r = e.getBoundingClientRect();
    return { key: k, nth: seen[k], text: t(e).slice(0, 70), tag: e.tagName.toLowerCase(), type: e.type || '', ids, data, fixed: layer(e) !== top || !!e.closest('nav, aside'), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), mark: !!e.__qaMark }; });
}
export async function crawlProfile(X, screens, opt){
  const { A, page, sleep, until, H, S, PROF } = X;
  const phone = PROF.phone; const slowMs = SLOW_MS;   /* time to the first visible change, background work included (the walk times screens on the slow phone) */
  try { if (S.cdp) await S.cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); } catch (e) {} const waitMs = phone ? 3500 : 2500;
  const match = opt.match || (() => []);
  const end = Date.now() + (opt.minutes || 25) * 60000;
  const SH = path.join(opt.shots, 'crawl'); fs.mkdirSync(SH, { recursive: true });
  const out = { screens: [], started: new Date().toISOString(), budgetMin: opt.minutes || 25 };
  const done = new Map(); /* key of a control crawled already on this profile → where */
  let nShot = 0, sinceReload = 0; const bgKeys = new Set();   /* keys the CRM writes by itself (seen while nobody tapped) */
  out.backgroundKeys = bgKeys;
  A().acceptConfirm = false;   /* confirm() → Cancel */
  const enumFn = enumerate.toString();
  await A().ev(src => { window.__qaEnum = new Function('o', 'return (' + src + ')(o)'); }, enumFn);
  const ensureEnum = () => A().ev(src => { if (!window.__qaEnum) window.__qaEnum = new Function('o', 'return (' + src + ')(o)'); }, enumFn).catch(() => {});
  let curBars = false;
  const list = async o => { await ensureEnum(); return A().ev(o => window.__qaEnum(o), Object.assign({ noBars: !curBars }, o || {})).catch(() => []); };
  const aim = async d => { await ensureEnum(); return A().ev(d => {
    const L = window.__qaEnum({ noBars: d.__noBars }); const m = L.filter(x => x.key === d.key); const c = m[Math.min(d.nth, m.length) - 1]; if (!c) return null;
    const CL = 'button,a[href],[role=button],[role=tab],[role=menuitem],[onclick],select,summary,input[type=checkbox],input[type=radio],input[type=button],input[type=submit],[data-ra-a],[data-t],[data-fp],[data-fn],[data-fm],[tabindex]:not([tabindex="-1"])';
    /* the element itself: same position in the list order */
    const els = [...document.querySelectorAll(CL)]; let e = null;
    for (const x of els) { const r = x.getBoundingClientRect(); if (Math.round(r.left) === c.x && Math.round(r.top) === c.y && Math.round(r.width) === c.w) { e = x; break; } }
    if (!e) return null;
    const r0 = e.getBoundingClientRect(); if (r0.top < 110 || r0.bottom > innerHeight - 170) { e.scrollIntoView({ block: 'center' }); }
    const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const h = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, x)), Math.min(innerHeight - 1, Math.max(0, y)));
    const lab = q => q ? ((q.id ? '#' + q.id : '') + (typeof q.className === 'string' && q.className ? '.' + q.className.split(' ')[0] : '') + ' "' + (q.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 30) + '"') : '';
    window.__qaTarget = e;
    const own = h && (e === h || e.contains(h) || (h.tagName === 'LABEL' && h.control === e) || (h.contains(e) && h.getBoundingClientRect().width * h.getBoundingClientRect().height <= r.width * r.height * 1.8));
    return { x, y, covered: !own, by: own ? '' : lab(h), tag: e.tagName, sel: e.tagName === 'SELECT' };
  }, d).catch(() => null); };
  /* before a tap: remember the screen, watch for any change */
  const noise = () => A().ev(() => new Promise(res => { const N = window.__qaNoisy = new Set(); const mo = new MutationObserver(l => { for (const m of l) { const subj = m.type === 'childList' ? [...m.addedNodes, ...m.removedNodes].filter(n => n.nodeType === 1).concat(m.target.nodeType === 1 && m.target !== document.body ? [m.target] : []) : [m.target.nodeType === 1 ? m.target : m.target.parentElement]; for (const s0 of subj) { let t = s0; for (let i = 0; t && i < 2; i++, t = t.parentElement) if (t !== document.body) N.add(t); } } }); mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); setTimeout(() => { mo.disconnect(); res(N.size); }, 900); })).catch(() => 0);
  const arm = () => A().ev(() => {
    const W = window.__qaW = { inp: null, mut: 0, toast: '', view: localStorage.getItem('grayco_view') || '', hash: location.hash, href: location.href, t0: performance.now(), lt: (window.__qa ? window.__qa.lt.length : 0) };
    try { if (window.__qaMO) window.__qaMO.disconnect(); window.__qaMO = new MutationObserver(l => { const N = window.__qaNoisy || new Set(); for (const m of l) { { /* judge an added / removed node by itself (a sheet appended to <body> is a reaction even if <body> gets toasts) */ const subj = m.type === 'childList' ? [...m.addedNodes, ...m.removedNodes].filter(n => n.nodeType === 1) : [m.target.nodeType === 1 ? m.target : m.target.parentElement]; if (!subj.length) continue; let all = true; for (const s0 of subj) { let t = s0, hit = false; for (let i = 0; t && i < 3; i++, t = t.parentElement) if (N.has(t) && t !== document.body && t !== document.documentElement) { hit = true; break; } if (!hit) { all = false; break; } } if (all) continue; } if (m.type === 'attributes' && /^(style|class)$/.test(m.attributeName) && m.target && m.target.id === 'gc-ra-toast') W.toast = m.target.textContent; W.mut += 1; if (!W.first) W.first = performance.now(); } }); window.__qaMO.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true, attributeFilter: ['class', 'style', 'open', 'aria-expanded', 'aria-selected', 'hidden', 'checked'] }); } catch (e) {}
    if (!window.__qaInpHook) { window.__qaInpHook = 1; ['pointerdown', 'touchstart', 'mousedown', 'click'].forEach(t => document.addEventListener(t, () => { const w = window.__qaW; if (w && w.inp == null) w.inp = performance.now(); }, true)); }
    document.querySelectorAll('button,a[href],[role=button],[role=tab],[role=menuitem],[onclick],select,summary,input,[data-ra-a],[data-t],[data-fp],[data-fn],[data-fm],[tabindex]').forEach(e => { e.__qaMark = 1; });
    return true; }).catch(() => false);
  const observe = () => A().ev(() => { const W = window.__qaW || {}; const toasts = [...document.querySelectorAll('[id*=toast],[class*=toast],[class*=Toast],[role=status],[role=alert]')].filter(e => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && e.getBoundingClientRect().width > 0 && (e.innerText || '').trim(); }).map(e => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 90));
    return { inputMs: W.inp != null ? Math.round(W.inp - W.t0) : null, mut: W.mut, firstMs: W.first ? Math.round(W.first - W.t0) : null, nav: (localStorage.getItem('grayco_view') || '') !== W.view || location.hash !== W.hash, href: location.href !== W.href, toast: toasts[0] || W.toast || '', lt: (window.__qa ? window.__qa.lt.slice(W.lt) : []) }; }).catch(() => ({ mut: 0, gone: true }));

  async function shot(name){ const f = path.join(SH, name + '.jpg'); try { await page().screenshot({ path: f, type: 'jpeg', quality: 55, scale: 'css' }); return path.relative(opt.outRoot, f); } catch (e) { return null; } }
  async function fresh(scr){
    for (let a = 0; a < 2; a++) {
      try { if (await scr.open()) return true; } catch (e) {}
      /* the screen would not open: reload the CRM and try again */
      try { await page().reload({ waitUntil: 'domcontentloaded', timeout: 120000 }); await opt.ready(); await ensureEnum(); sinceReload = 0; } catch (e) {}
    }
    return false;
  }
  /* tap path[0..n-2] to reach the panel, then judge path[n-1] */
  async function tryOne(scr, pathD, level){
    const d = pathD[pathD.length - 1];
    const res = { level, text: d.text, ids: (d.ids || []).slice(0, 4), data: d.data || [], key: d.key, nth: d.nth, via: pathD.slice(0, -1).map(x => x.text).join(' › '), features: match(d), result: 'OK', kind: '', why: [], ms: null, sends: [], writes: [] };
    if (DESTRUCTIVE.test(d.text)) { res.result = 'SKIP'; res.why.push('destructive — listed, not tapped'); return res; }
    if (!(await fresh(scr))) { res.result = 'FAIL'; res.why.push('could not reopen the screen "' + scr.name + '"'); return res; }
    for (const p of pathD.slice(0, -1)) { p.__noBars = !curBars; const a = await aim(p); if (!a) { res.result = 'SKIP'; res.why.push('the panel did not open again (' + p.text + ')'); return res; } await X.tapAt(a.x, a.y); await sleep(1200); }
    /* let the saves of the previous tap finish first, so each tap is judged on its own writes */
    let quiet = false; { let n = H.writes.length, q = Date.now(); const t9 = Date.now(); while (Date.now() - t9 < 4000) { await sleep(200); if (H.writes.length !== n) { H.writes.slice(n).forEach(w => { if (!OWN.test(w.key)) bgKeys.add(w.key); }); n = H.writes.length; q = Date.now(); } else if (Date.now() - q > 1000) { quiet = true; break; } } }
    d.__noBars = !curBars; const a = await aim(d);
    if (!a) { res.result = 'SKIP'; res.why.push('not on the screen in a fresh state'); return res; }
    if (a.covered) { res.result = 'FAIL'; res.why.push('covered — the tap lands on ' + a.by); }
    const before = await list(); const bk = new Set(before.map(x => x.key + '#' + x.nth));
    const i0 = S.link.log.length, w0 = H.writes.length, e0 = S.pageErrors.length, f0 = A().fn.length, dg0 = A().dialogs.length, p0 = A().ctx.pages().length;
    let chooser = false; const onFc = () => { chooser = true; }; page().on('filechooser', onFc);
    res.noisyNodes = await noise(); await arm(); const t0 = Date.now();
    if (a.sel) { await A().ev(() => { const s = window.__qaTarget; const o = [...s.options].findIndex((x, i) => i !== s.selectedIndex && !x.disabled); if (o >= 0) { s.selectedIndex = o; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); } }).catch(() => {}); }
    else await X.tapAt(a.x, a.y);
    let ob = null;
    while (Date.now() - t0 < waitMs) { await sleep(150); ob = await observe(); if (ob.gone || ob.nav || ob.href || ob.mut > 0 || chooser || A().dialogs.length > dg0 || A().ctx.pages().length > p0) break; }
    const reactMs = ob && ob.firstMs != null ? ob.firstMs : (Date.now() - t0);
    await sleep(700); ob = await observe();
    page().off('filechooser', onFc);
    const after = await list(); const newOnes = after.filter(x => !x.mark && !bk.has(x.key + '#' + x.nth)); const switched = after.filter(x => !bk.has(x.key + '#' + x.nth)).length >= 2 && newOnes.length < 2;
    const dlg = A().dialogs.slice(dg0); const pages = A().ctx.pages().slice(p0);
    for (const pg of pages) { res.why.push('opened a new tab: ' + pg.url().slice(0, 80)); await pg.close().catch(() => {}); }
    res.kind = ob.gone ? 'page reloaded' : ob.nav || ob.href ? 'navigation' : chooser ? 'file picker' : dlg.length ? 'dialog: ' + dlg.map(x => x.type + ' "' + x.message.slice(0, 60) + '"').join('; ') : newOnes.length >= 2 ? 'panel opened' : switched ? 'closed / back to the screen below' : ob.toast ? 'toast: ' + ob.toast : ob.mut > 0 ? 'changed in place' : pages.length ? 'new tab' : 'nothing';
    res.ms = reactMs; res.inputDelay = ob.inputMs; res.newButtons = newOnes.length;
    /* the time the page took to even see the tap (main thread busy) is not the button's fault: judged separately */
    const ownMs = ob.inputMs != null ? reactMs - ob.inputMs : reactMs;
    if (/^toast: /.test(res.kind) && BG_TOAST.test(res.kind.slice(7))) { res.kind = 'nothing (only a background toast: ' + res.kind.slice(7, 50) + ')'; }
    if (/^nothing/.test(res.kind)) { res.result = 'FAIL'; res.why.push('dead button — nothing happened'); }
    else if (ownMs > slowMs) { if (res.result === 'OK') res.result = 'SLOW'; res.why.push(`reacted after ${(ownMs / 1000).toFixed(1)} s`); }
    if (ob.inputMs != null && ob.inputMs > 500) res.why.push(`the page took ${(ob.inputMs / 1000).toFixed(1)} s to take the tap (main thread busy)`);
    const pe = S.pageErrors.slice(e0); if (pe.length) { res.result = 'FAIL'; res.why.push('page error: ' + [...new Set(pe.map(x => x.text))].slice(0, 2).join(' | ')); }
    const lt = (ob.lt || []).filter(x => x.ms > 200); if (lt.length) { res.longTask = Math.max(...lt.map(x => x.ms)); res.why.push(`long task ${res.longTask} ms`); }
    const wr0 = H.writes.slice(w0).filter(w => w.table === 'gc_kv' && !OWN.test(w.key)); const wr = wr0.filter(w => !bgKeys.has(w.key)); res.writes = [...new Set(wr.map(w => w.key))]; const bgw = [...new Set(wr0.filter(w => bgKeys.has(w.key)).map(w => w.key))]; if (bgw.length) res.bgWrites = bgw.length;
    if (wr.length && !quiet) { res.why.push('background saves were still running when it was tapped (writes not judged): ' + res.writes.slice(0, 4).join(', ')); } else if (wr.length) { if (SAVEISH.test(d.text) || pathD.some(p => SAVEISH.test(p.text))) res.why.push('expected save: ' + res.writes.slice(0, 5).join(', ')); else { res.result = 'FAIL'; res.why.push('wrote shared list(s) with no data entered: ' + res.writes.slice(0, 5).join(', ')); } }
    const fns = A().fn.slice(f0); res.functions = fns.map(f => f.name); res.sends = fns.filter(f => SENDFN.test(f.name) || SENDBODY.test(JSON.stringify(f.body || '').slice(0, 2000))).map(f => f.name + (f.body && (f.body.action || f.body.op) ? ':' + (f.body.action || f.body.op) : ''));
    if (res.sends.length) res.why.push('outbound send stubbed: ' + [...new Set(res.sends)].join(', '));
    const out = S.link.log.slice(i0).filter(r => r.host && !LOCAL_HOSTS.test(r.host)); const reached = out.filter(r => !r.aborted);
    if (out.length) res.blockedHosts = [...new Set(out.map(r => r.host))];
    if (reached.length) { res.result = 'FAIL'; res.why.push('reached an outside host: ' + [...new Set(reached.map(r => r.host))].join(', ')); }
    const fnAll = S.link.log.slice(i0).filter(r => r.host === 'ieeonhpfahmwwecizdut.supabase.co' && /\/functions\/v1\//.test(r.path)); if (fnAll.length) { res.sends.push(...fnAll.map(r => 'edge:' + r.path.split('/').pop())); }
    res.shot = await shot(String(++nShot).padStart(4, '0') + '_' + scr.name.replace(/[^a-z0-9]+/gi, '_').slice(0, 24) + '_' + d.text.replace(/[^a-z0-9]+/gi, '_').slice(0, 24));
    res.panel = res.kind === 'panel opened' ? newOnes.slice(0, 60) : [];
    /* the way back */
    if (res.kind === 'panel opened') {
      const back = await opt.back();
      res.back = back.how;
      if (!back.ok) { if (res.result !== 'FAIL') res.result = 'FAIL'; res.why.push('no way back: ' + back.why); }
    }
    if (++sinceReload > 60) { await page().reload({ waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {}); await opt.ready().catch(() => {}); await ensureEnum(); sinceReload = 0; }
    return res;
  }

  for (let si = 0; si < screens.length; si++) {
    const scr = screens[si]; curBars = !!scr.bars;
    const sr = { name: scr.name, recent: scr.recent || [], buttons: [], notes: [] };
    const scrEnd = Math.min(end, Date.now() + Math.max(60000, (end - Date.now()) / (screens.length - si)));
    out.screens.push(sr);
    if (Date.now() > end) { sr.notes.push('not reached (time budget)'); continue; }
    if (!(await fresh(scr))) { sr.opened = false; sr.notes.push('the screen could not be opened on this profile/build'); sr.shot = await shot('screen_' + scr.name.replace(/[^a-z0-9]+/gi, '_')); continue; }
    sr.opened = true; sr.shot = await shot('screen_' + scr.name.replace(/[^a-z0-9]+/gi, '_'));
    let L1 = await list(); sr.count = L1.length;
    /* recent features first; repeated identical rows (50 job cards) are crawled twice, the rest listed as "same as" */
    const rep = {}; L1 = L1.filter(d => { rep[d.key] = (rep[d.key] || 0) + 1; return d.nth <= 2; });
    L1.forEach(d => { d.recent = match(d).length > 0; });
    L1.sort((a, b) => (b.recent - a.recent));
    const capOther = opt.capL1 || 30; let nOther = 0;
    for (const d of L1) {
      if (done.has(d.key + '#' + d.nth)) { sr.buttons.push({ level: 1, text: d.text, features: match(d), result: 'SEEN', why: ['same control as on ' + done.get(d.key + '#' + d.nth)] }); continue; }
      if (Date.now() > scrEnd) { sr.buttons.push({ level: 1, text: d.text, features: match(d), result: 'NOT RUN', why: ['time budget for this screen'] }); continue; }
      if (!d.recent && ++nOther > capOther) { sr.buttons.push({ level: 1, text: d.text, features: [], result: 'NOT RUN', why: ['over the per-screen cap for older controls'] }); continue; }
      if (d.fixed) done.set(d.key + '#' + d.nth, scr.name);
      const r = await tryOne(scr, [d], 1); if (rep[d.key] > 2) r.why.push(`${rep[d.key]} like it on this screen`);
      sr.buttons.push(r); opt.progress && opt.progress(scr.name, r);
      /* level 2: the opened panel's own controls */
      if (r.kind === 'panel opened' && r.panel.length) {
        const rep2 = {}; let L2 = r.panel.filter(x => { rep2[x.key] = (rep2[x.key] || 0) + 1; return x.nth <= 1 && !x.fixed; });
        L2.forEach(x => { x.recent = match(x).length > 0; }); L2.sort((a, b) => b.recent - a.recent);
        let n2 = 0;
        for (const d2 of L2) {
          if (Date.now() > scrEnd) { sr.buttons.push({ level: 2, via: d.text, text: d2.text, features: match(d2), result: 'NOT RUN', why: ['time budget for this screen'] }); continue; }
          if (!d2.recent && ++n2 > (opt.capL2 || 8)) { sr.buttons.push({ level: 2, via: d.text, text: d2.text, features: [], result: 'NOT RUN', why: ['over the per-panel cap for older controls'] }); continue; }
          const r2 = await tryOne(scr, [d, d2], 2); sr.buttons.push(r2); opt.progress && opt.progress(scr.name, r2);
        }
      }
      delete r.panel;
    }
    sr.buttons.forEach(b => { delete b.panel; });
  }
  out.finished = new Date().toISOString(); out.backgroundKeys = [...bgKeys];
  A().acceptConfirm = true;
  return out;
}
