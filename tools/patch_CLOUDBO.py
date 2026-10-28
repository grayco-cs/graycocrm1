#!/usr/bin/env python3
"""Idempotent patch CLOUDBO: one slow / failing cloud write no longer holds back every save on the computer for minutes
(owner 10/27 on Leads: "Saved on this computer — sending…" then "could not save, try again"; changes not sticking).

The cloud guard (patch PJX) answered ANY 5xx / 429 from the database by stopping EVERY request to it — reads AND writes
of every list — for 30 s, then 60, 120, 240, up to 5 minutes (only one step back per good answer). One heavy write that
times out (a 5 MB schedule, a big leads list) kept every other save (one lead's stage, an approval) failing with
"the cloud is busy — waiting N s", so the save queue showed "kept on this computer — not sent yet" again and again.
Now:
  * a failing WRITE holds back only further writes of that same list (per key), 15 s → 30 → 60 s at most;
    other lists' saves go straight through;
  * a failing READ holds back reads only, 15 s → 60 s at most;
  * one good answer clears the pause for that list / for reads;
  * the message names the list ("the cloud is busy for leads — waiting 12 s") — the save note shows it (patch SAVEWHY).
Usage: python3 tools/patch_CLOUDBO.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch CLOUDBO'
if MARK in src:
    print('CLOUDBO: already patched'); sys.exit(0)
E = [
("""  var ms = Math.min(300000, 30000 * Math.pow(2, BO.n - 1));""",
 """  var ms = Math.min(60000, 15000 * Math.pow(2, BO.n - 1));   """ + MARK + """: reads only, 15 s → 60 s at most */"""),
("""    if(Date.now() < BO.until && !isEpoch){ S.blocked++; return Promise.reject(busyErr('the cloud is busy — waiting ' + Math.round((BO.until - Date.now()) / 1000) + ' s')); }""",
 """    """ + MARK + """: a write waits only for its own list's pause; reads for the read pause */
    var isW = m !== 'GET' && m !== 'HEAD', wk = isW && isKv ? kvKeyOf(url, init) : '', bk = wk && BOK[wk];
    if(!isEpoch && (isW ? (bk && Date.now() < bk.until) : Date.now() < BO.until)){ S.blocked++; var left = Math.round(((isW ? bk.until : BO.until) - Date.now()) / 1000); return Promise.reject(busyErr('the cloud is busy' + (wk ? ' for ' + wk : '') + ' — waiting ' + left + ' s')); }"""),
("""          if(res.type !== 'default') backoff(res.status);      /* only a real answer from the database means "busy"; an offline stand-in does not */""",
 """          if(res.type !== 'default'){ if(isW){ if(wk) backoffKey(wk, res.status); } else backoff(res.status); }      /* only a real answer from the database means "busy"; an offline stand-in does not — patch CLOUDBO: a write pauses its own list only */"""),
("""        if(res.ok) BO.n = Math.max(0, BO.n - 1);""",
 """        if(res.ok){ if(isW){ if(wk && BOK[wk]) delete BOK[wk]; } else { BO.n = 0; BO.until = 0; } }   /* patch CLOUDBO: one good answer clears the pause */"""),
("""function busyErr(why){ var e = new TypeError('Failed to fetch (GrayCo: ' + why + ')'); e.__gcBusy = true; return e; }""",
 """function busyErr(why){ var e = new TypeError('Failed to fetch (GrayCo: ' + why + ')'); e.__gcBusy = true; return e; }
/* patch CLOUDBO: per-list pause for writes */
var BOK = {};
function kvKeyOf(url, init){
  try { var m1 = /[?&]key=eq\\.([^&]+)/.exec(decodeURIComponent(String(url))); if (m1) return m1[1].replace(/__chunk\\d+$/, '');
    var b = init && typeof init.body === 'string' ? init.body.slice(0, 400) : ''; var m2 = /"key"\\s*:\\s*"([^"]+)"/.exec(b); return m2 ? m2[1].replace(/__chunk\\d+$/, '') : ''; } catch (e) { return ''; }
}
function backoffKey(k, status){
  var e = BOK[k] || (BOK[k] = { n: 0, until: 0 }); e.n = Math.min(e.n + 1, 3);
  var ms = Math.round(Math.min(60000, 15000 * Math.pow(2, e.n - 1)) * (0.8 + Math.random() * 0.4));
  e.until = Date.now() + ms; S.backoffs++;
  try{ console.warn('[GC] the cloud answered ' + status + ' to a save of "' + k + '" — saves of that list wait ' + Math.round(ms / 1000) + ' s (other lists go on; nothing is lost)'); }catch(x){}
}"""),
]
for a, b in E:
    assert src.count(a) == 1, ('CLOUDBO find-string count != 1', src.count(a), a[:70])
    src = src.replace(a, b)
open(path, 'w', encoding='utf-8').write(src)
print('CLOUDBO: patched', path)
