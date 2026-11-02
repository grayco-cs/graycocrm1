#!/usr/bin/env python3
"""Idempotent patch CCBANNER: no false "CompanyCam photos can't come in" alarm (owner 11/01, 📷 Photos, desktop: a red
banner "CompanyCam sync status unknown — could not ask the server (200)" while the same screen's pill said "All synced").

Why it happened: the CompanyCam status line (patch CCS) asked companycam-webhook?proxy=sync and took ANY answer that was
not the server's status record as a failure. The answer it got was the CompanyCam gate's own stand-in (patch CCS2: an
empty "[]" with status 200, marked X-GC-Gate: blocked), which CCS never recognised; CCS turned "no answer" into a red
"can't come in" banner. See ROOT below for why the gate answered.

What this patch does:
  1. ROOT: the gate lets the status questions through however the request carries its headers (plain object, Headers,
     [[k, v]] list or a Request), so ?proxy=sync / status / syncnow / review always reach the server.
  2. One verdict (window._gcCCSync.verdict()): red ONLY when the server says something is really wrong — COMPANYCAM_TOKEN
     not set, the 15-minute sync failing run after run (gc_cc_sync_health.fails >= 2, written by companycam-sync), or the
     key rejected by CompanyCam (gc_cc_whoami / ?proxy=status). An inconclusive check (network, 401/5xx, the gate's
     stand-in, a non-JSON answer) shows nothing: it keeps the last real answer, retries quietly (30 s, 1, 2, 4, 5 min)
     and is written to the freeze / error report (_gcPerfRep.note), not shown to anyone.
  3. The 📷 Photos banner and the Photos header pill read that same verdict: the pill says "All synced" only when the
     banner is not up; while the banner is up it says "CompanyCam not syncing". The admin / office To-Do line
     "📸 CompanyCam sync isn't working" uses the same verdict too.
  4. The banner shows only on 📷 Photos (view allphotos) and only to admins.
Usage: python3 tools/patch_CCBANNER.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch CCBANNER'
if MARK in src:
    print('CCBANNER: already patched'); sys.exit(0)

def once(old, new, label):
    global src
    n = src.count(old)
    assert n == 1, ('CCBANNER anchor count != 1', label, n)
    src = src.replace(old, new)

def between(start, end, new, label):
    """replace start..end (inclusive of start, exclusive of end); both anchors exactly once"""
    global src
    assert src.count(start) == 1, ('CCBANNER start anchor count != 1', label, src.count(start))
    assert src.count(end) == 1, ('CCBANNER end anchor count != 1', label, src.count(end))
    a = src.index(start); b = src.index(end)
    assert a < b, ('CCBANNER anchors out of order', label)
    src = src[:a] + new + src[b:]

# ── 1. ROOT: the gate's header check (patch I, __gcCCAllow) ──────────────────────────────────────────────────────────
once("""function hdrGet(h, name){
  try {
    if (!h) return '';
    if (typeof h.get === 'function') return h.get(name) || '';
    var k = Object.keys(h).filter(function(x){ return x.toLowerCase() === name; })[0];
    return k ? s(h[k]) : '';
  } catch (e) { return ''; }
}
window.__gcCCAllow = function(u, init){
  try {
    var url = String(u || '');
    if (url.indexOf('api.companycam.com') >= 0) return false;
    if (url.indexOf('companycam-webhook') < 0) return false;
    if (hdrGet(init && init.headers, 'x-gc-cc') !== '1') return false;   /* an old code path */""",
"""function hdrGet(h, name){
  try {
    if (!h) return '';
    if (typeof h.get === 'function') return h.get(name) || '';
    """ + MARK + """: a [[name, value]] list is a legal way to give headers too */
    if (Array.isArray(h)) { for (var i = 0; i < h.length; i++) if (h[i] && String(h[i][0]).toLowerCase() === name) return s(h[i][1]); return ''; }
    var k = Object.keys(h).filter(function(x){ return x.toLowerCase() === name; })[0];
    return k ? s(h[k]) : '';
  } catch (e) { return ''; }
}
window.__gcCCAllow = function(u, init, input){
  try {
    var url = String(u || '');
    if (url.indexOf('api.companycam.com') >= 0) return false;
    if (url.indexOf('companycam-webhook') < 0) return false;
    /* patch CCBANNER: the mark may ride on the Request itself (a layer above may hand the gate a Request and no init) */
    var mark = hdrGet(init && init.headers, 'x-gc-cc') || (input && typeof input === 'object' && input.headers ? hdrGet(input.headers, 'x-gc-cc') : '');
    if (mark !== '1') return false;   /* an old code path */""", 'gate allow')
once("""function ccAllowed(u, init){ try{ return typeof window.__gcCCAllow === 'function' && !!window.__gcCCAllow(u, init); }catch(e){ return false; } }""",
"""function ccAllowed(u, init, input){ try{ return typeof window.__gcCCAllow === 'function' && !!window.__gcCCAllow(u, init, input); }catch(e){ return false; } }   /* patch CCBANNER: + the Request */""", 'gate ccAllowed')
once("""    if(isCompanyCam(u) && !ccAllowed(u, init)){""", """    if(isCompanyCam(u) && !ccAllowed(u, init, input)){""", 'gate call')

# ── 2. the freeze / error report takes a quiet note ──────────────────────────────────────────────────────────────────
once("""W._gcPerfRep = { report: report, send: function(){ dirty = true; send(); } };""",
"""W._gcPerfRep = { report: report, send: function(){ dirty = true; send(); },
  note: function(k){ try { bump(NET, 'note: ' + s(k).slice(0, 120), null, 60); } catch (e) {} } };   """ + MARK + """: a quiet note (an inconclusive check), not shown to anyone */""", 'perfrep note')

# ── 3. patch CCS: the check, the verdict, the banner ────────────────────────────────────────────────────────────────
between("""/* ── the server's answer ── */
var H = { data: null, at: 0, err: '', busy: false };""", """/* ── one line: { ok, text } ── patch CCS2""",
"""/* ── the server's answer ── */
var H = { data: null, at: 0, err: '', busy: false, fails: 0, next: 0, okAt: 0 };
""" + MARK + """: an answer is the server's status record or nothing. Anything else (no answer, 401 / 5xx, the CompanyCam
   gate's stand-in, a page that is not JSON) is INCONCLUSIVE: the last real answer stays, the check is tried again quietly
   (30 s, 1, 2, 4, then every 5 min) and the reason goes to the freeze / error report — never to the screen. The last
   answer any part of the CRM saw (gc_ccsync_last: this line, the status window, GrayCo Photos) is where it starts. */
var BACK = [30e3, 60e3, 120e3, 240e3, EVERY];
function isStatus(j){ return !!(j && typeof j === 'object' && !Array.isArray(j) && 'tokenSet' in j); }
try { var lc0 = JSON.parse(localStorage.getItem('gc_ccsync_last') || 'null'); if (lc0 && isStatus(lc0.data) && Date.now() - (+lc0.at || 0) < 2 * EVERY) H.data = lc0.data; } catch (e) {}
function quiet(why){
  H.fails++; H.err = why; H.next = Date.now() + BACK[Math.min(H.fails - 1, BACK.length - 1)];
  try { if (W._gcPerfRep && W._gcPerfRep.note) W._gcPerfRep.note('CompanyCam status check inconclusive: ' + why); } catch (e) {}
  try { if (H.fails === 1 || H.fails % 10 === 0) console.info('[GC] CompanyCam status check inconclusive (' + why + ') — trying again quietly (patch CCBANNER)'); } catch (e) {}
}
function poll(force){
  if (H.busy || isMM() || !signedIn()) return Promise.resolve(H);
  var now = Date.now();
  if (!force) { if (H.fails) { if (now < H.next) return Promise.resolve(H); } else if (H.at && now - H.at < EVERY) return Promise.resolve(H); }
  H.busy = true;
  return W.fetch(FN, { headers: { 'x-gc-cc': '1' }, cache: 'no-store' }).then(function(r){
    if (W._gcCCGated && W._gcCCGated(r)) return 'not asked — the CompanyCam gate answered for the server';
    return r.text().then(function(t){
      var j = null; try { j = JSON.parse(t); } catch (e) {}
      if (r.ok && isStatus(j)) { H.data = j; H.okAt = Date.now(); try { localStorage.setItem('gc_ccsync_last', JSON.stringify({ at: Date.now(), data: j })); } catch (e) {} return ''; }
      return 'the server answered ' + r.status + (j == null ? ' (not JSON: ' + String(t || '').slice(0, 30).replace(/\\s+/g, ' ') + ')' : ' without its status record');
    }, function(){ return 'the server answered ' + r.status + ' (unreadable)'; });
  }, function(e){ return 'no answer (' + String(e && e.message || 'network') + ')'; }).then(function(why){
    H.at = Date.now(); H.busy = false;
    if (why) quiet(why); else { H.fails = 0; H.next = 0; H.err = ''; }
    paint(); return H;
  });
}

""", 'ccs poll')

between("""function judge(){
  var d = H.data, h = d && d.health;""", """/* ── painting: only when something changed (no idle churn) ── */""",
"""function judge(){
  """ + MARK + """: ok:false (red) only for what the server says is really wrong — the token is not set, the sync failed run
     after run, the key is rejected. Everything else is a plain line (ok:null) on the CompanyCam screens, never a red banner. */
  var d = H.data, h = d && d.health;
  if (!d) return { ok: null, text: 'CompanyCam sync: checking…' };
  if (!d.tokenSet)
    return { ok: false, text: '⚠ CompanyCam token not set in Netlify — nothing syncs and GrayCo Photos stays empty. Add it: ' + HOW + '.' };
  var tr = truthNow(), tokenOk = tr.token === 'ok', pre = tr.text.split(' · ')[0] + ' · ', line;
  if (tr.token === 'bad') return { ok: false, text: pre + 'make a new token in CompanyCam (Settings → Access tokens) and paste it into ' + HOW + '.' };
  if (!h) {
    if (d.serviceKey === false) return { ok: null, text: pre + '⚠ No CompanyCam sync run recorded — SUPABASE_SERVICE_KEY is not set in Netlify, so the 15-minute sync cannot run.' };
    return { ok: null, text: pre + '⚠ No CompanyCam sync run recorded yet — it runs every 15 minutes after a deploy (Netlify → Deploys → Trigger deploy if it never has).' };
  }
  var age = Date.now() - (Date.parse(h.at) || 0), at = when(h.at), shape = h.tokenShape && h.tokenShape.malformed ? ' (the token in Netlify had extra spaces, quotes or "Bearer " — cleaned automatically; re-paste it when you can)' : '';
  /* failing: the last run failed AND the one before it (fails, written by companycam-sync); a row from before fails was
     written counts as failing */
  var bad = h.ok === false && (h.fails == null || +h.fails >= 2), runs = bad && +h.fails >= 2 ? ' (' + (+h.fails) + ' runs in a row)' : '';
  if (/COMPANYCAM_TOKEN/.test(s(h.skipped))) return { ok: null, text: pre + '⚠ Last sync ' + at + ': the token was not set then. It is set now — the next 15-minute run will pick it up (or Trigger deploy).' };
  if (h.skipped) return { ok: bad ? false : null, text: pre + '⚠ Last sync ' + at + ' skipped: ' + s(h.skipped) + runs + ' (Netlify environment variables).' };
  if (projErr()) return { ok: bad ? false : null, text: tr.text + ' (last try ' + at + runs + ' — the CRM tries again every 15 minutes)' + shape };
  if (h.error) return { ok: bad ? false : null, text: pre + '⚠ Last sync ' + at + ' failed' + runs + ': ' + s(h.error) + shape };
  if (h.ok === false) return { ok: bad ? false : null, text: pre + '⚠ Last sync ' + at + ' did not finish' + runs + shape };
  if (age > STALE) return { ok: null, text: pre + '⚠ No CompanyCam sync in the last hour (last run ' + at + ') — check Netlify → Logs → Functions → companycam-sync.' };
  line = 'Last sync: ' + at + ' — OK, ' + (+h.read || 0) + ' project' + (+h.read === 1 ? '' : 's') + ' read, ' + (+h.made || 0) + ' job' + (+h.made === 1 ? '' : 's') + ' made';
  if (h.ccError && +h.ccError.status >= 500) line += ' · CompanyCam had a server error (' + h.ccError.status + ') — retried another way';
  return { ok: tokenOk ? true : null, text: pre + line + shape };
}
/* patch CCBANNER: THE verdict — the 📷 Photos banner and the Photos header pill both read this, so they cannot disagree.
   show: the red banner / red pill are up (a real problem, and this person is an admin). */
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function verdict(j){ j = j || judge(); return { ok: j.ok, text: j.text, show: j.ok === false && isAdmin() && !isMM() && signedIn() }; }

""", 'ccs judge')

once("""  /* 📸 GrayCo Photos: a banner only when CompanyCam is not working */
  var ban = D.getElementById('gc-ccs-photos');
  if (view() === 'allphotos' && j.ok === false) {""",
"""  /* 📸 GrayCo Photos: a banner only when CompanyCam is not working — patch CCBANNER: the one verdict, admins only, 📷 Photos only */
  var ban = D.getElementById('gc-ccs-photos'), vd = verdict(j), pk = vd.show ? vd.text : '';
  if (pk !== H.pill) { H.pill = pk; try { if (W._gcPhotosRepill) W._gcPhotosRepill(); } catch (e) {} }   /* the header pill follows the same verdict */
  if (view() === 'allphotos' && vd.show) {""", 'ccs banner')

once("""W._gcCCSync = { state: function(){ return JSON.parse(JSON.stringify({ data: H.data, at: H.at, err: H.err })); }, poll: function(){ return poll(true); }, text: function(){ return judge(); },""",
"""W._gcCCSync = { state: function(){ return JSON.parse(JSON.stringify({ data: H.data, at: H.at, err: H.err, fails: H.fails, next: H.next, okAt: H.okAt })); }, poll: function(){ return poll(true); }, text: function(){ return judge(); },
  verdict: function(){ return verdict(); },   /* patch CCBANNER */""", 'ccs api')

# ── 4. GrayCo Photos: the header pill reads the same verdict ─────────────────────────────────────────────────────────
once("""function syncPill(compact){
  var n = qn;
  if (compact && !n) return '<span class="gcu-pill gcu-dot" id="gcu-sync" title="All synced" role="status"><span class="gcu-vh">All synced</span></span>';""",
"""function syncPill(compact){
  var n = qn;
  """ + MARK + """: "All synced" only while the CompanyCam verdict the 📷 Photos banner shows is not red */
  var ccv = null; try { ccv = !n && window._gcCCSync && window._gcCCSync.verdict ? window._gcCCSync.verdict() : null; } catch (e) {}
  if (ccv && ccv.show) return '<span class="gcu-pill off" id="gcu-sync" data-cc="bad" role="status" title="' + esc(ccv.text) + '">CompanyCam not syncing</span>';
  if (compact && !n) return '<span class="gcu-pill gcu-dot" id="gcu-sync" title="All synced" role="status"><span class="gcu-vh">All synced</span></span>';""", 'photos pill')
once("""function renderHeaderOnly(){ if (!root) return;""",
"""window._gcPhotosRepill = function(){ try { if (!root) return; var b = root.querySelector('#gcu-sync'); if (!b) return; var h = syncPill(inner()); if (b.outerHTML !== h) { b.outerHTML = h; var hd = root.querySelector('.gcu-hd'); if (hd) hd.__h = ''; } } catch (e) {} };   /* patch CCBANNER: the CompanyCam verdict changed */
function renderHeaderOnly(){ if (!root) return;""", 'photos repill')

# ── 5. CCSYNC To-Do: the same verdict ────────────────────────────────────────────────────────────────────────────────
once("""        if (d && (!d.tokenSet || d.serviceKey === false || !h || h.error || h.skipped || (h.at && Date.now() - Date.parse(h.at) > 2 * 3600e3)))""",
"""        var ccv = null; try { ccv = d && W._gcCCSync && W._gcCCSync._judgeFor ? W._gcCCSync._judgeFor(d) : null; } catch (e) {}   /* patch CCBANNER: the one verdict */
        if (d && ccv && ccv.ok === false)""", 'ccsync todo')

open(path, 'w', encoding='utf-8').write(src)
print('CCBANNER: patched', path)
