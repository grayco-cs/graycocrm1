#!/usr/bin/env python3
"""Idempotent patch SCHEDFREEZE (owner 11/20, iPhone, GrayCo Field, 8:06 PM CT): "It's frozen here" -- after tapping
📅 My Schedule the screen showed only the "📅 My schedule — Today: … " strip with 🏖 Time off / 📅 Availability, nothing under it,
while the header said "⏳ Saved on phone, sending…" (the phone had just switched 5G → Wi-Fi; two gc_kv uploads "Load failed").

Root cause (reproduced in the offline harness, iPhone 390 wide, installed app, 4x CPU, network failing / recovering mid-load):
  1. ROLEAPPS' sync() (every 0.9 s) re-decides the role app each time. For a moment during the drop it had no role (the person /
     role not known while the lists were re-read) and laid GrayCo Field out for "no role": the PM / admin dashboard (.gc-ra-top) was
     removed and data-ra dropped. The admin's own Home sections live IN that dashboard, so what was left was only patch TIMEOFF's
     "📅 My schedule — Today: …" strip with 🏖 Time off / 📅 Availability (normally hidden under the dashboard) and nothing under it
     -- the screen in the report. A tap on 📅 then landed on that bare Home.
  2. 📅 My Schedule from the bottom bar called openSched() inside try/catch with warn() only: when building the list threw (a list
     half-loaded) the tap did NOTHING -- no screen, no message ("frozen"). From the tile it showed "That did not open".
  3. The list was drawn once; data arriving after the drop never redrew an open My Schedule.
  4. When the drop kept the lists from loading, the people list stayed the built-in one until a later full read (I am not on it):
     🏖 Time off / 📅 Availability / 🗂 My requests (keyed to me) did nothing but a toast.
  5. "⏳ Saved on phone, sending…": uploads that failed ARE retried on 'online' (patch SAVES), but one still "in flight" (_gcSending,
     a fetch iOS left hanging over the network switch) or queued in _gcSyncQ was not; nothing retried on a resume.
Fix:
  * ROLEAPPS keeps the last role app for 5 s while still signed in (appS) -- no strip-only Home on a blip; fieldInject leaves the
    Home as it is while the person is not known.
  * openSched never opens to nothing: a list that throws → the screen with ＋ New appointment / 🛠 Schedule work / 🏖 Time off and
    "⚠️ Couldn't load your schedule — ↻ Tap to retry"; the bar's 📅 says so if even that fails. An open My Schedule is redrawn when
    its data changes (never under a finger or a form).
  * window._gcSF (tools/schedfreeze_bid.js): back online / resumed → the lists are read again if I am not on the people list, waiting
    uploads are sent again (pill tap too); a tap on a My Schedule / Home / time-off button whose click the browser lost (redrawn under
    the finger) is pressed for the person; an invisible full-screen layer (opacity 0 / empty transparent) on top stops taking taps;
    a blank Field Home shows "⚠️ Couldn't load your home — ↻ Tap to retry" and retries by itself.

Also (owner, same screen): "If I schedule job walks, meetings etc on bid portal or in schedule etc it should automatically go
into my schedule." -- tools/schedfreeze_bid.js (window._gcBidDates): the bid dates of the bids a person works (pre-bid / site
walk, questions due, bid due, bid bond, sealed delivery -- the BIDREMIND dates) on 📅 My Schedule (Field), the Field strip /
"My schedule" sheet, the Desk "My schedule" card; the schedule entries a person CREATED count as theirs on the strip / sheet too;
the bid portal's 💾 Save with a site walk date makes a real schedule entry for the person who saved it.
"""
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'index.html')
src = open(path, encoding='utf-8').read()
MARK = '__GC_PATCH_SCHEDFREEZE__'
if MARK in src:
    print('already patched'); sys.exit(0)
BID = open(os.path.join(here, 'schedfreeze_bid.js'), encoding='utf-8').read()
assert MARK in BID


def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)


# ── B1. PMFIELD 📅 My Schedule / Today: the bid dates join my items (virtual: they open the lead / job, never edited here) ──
src = once(src,
    "function itemsOn(a, b, all){ var ids = myJobIds(); return sched().filter(function(x){ var d = dayOf(x); return d && d >= a && d <= b && mineItem(x, ids, all); }).sort(",
    "function itemsOn(a, b, all){ var ids = myJobIds(), S0 = sched(), L = S0.filter(function(x){ var d = dayOf(x); return d && d >= a && d <= b && mineItem(x, ids, all); });\n"
    "  try { if (W._gcBidDates) L = L.concat(W._gcBidDates.list({ name: myName(), all: !!all, from: a, to: b, sched: S0 })); } catch (e) { warn(e); }   /* patch SCHEDFREEZE: my bid dates (pre-bid / site walk, questions, bid due …) */\n"
    "  return L.sort(")
src = once(src,
    "  var p = proj(x.pid), who = whoOf(x), ed = canEdit(x);\n"
    "  return '<button type=\"button\" class=\"gc-pmf-it\" data-pmf-a=\"item\" data-id=\"' + esc(x.id) + '\">",
    "  var p = proj(x.pid), who = x.virtual ? s(x.address) : whoOf(x), ed = x.virtual || canEdit(x);   /* patch SCHEDFREEZE: a bid date opens its lead / job */\n"
    "  return '<button type=\"button\" class=\"gc-pmf-it\" ' + (x.virtual ? 'data-pmf-a=\"bidev\" data-lead=\"' + esc(x.leadId) + '\" data-pid=\"' + esc(x.pid) + '\"' : 'data-pmf-a=\"item\"') + ' data-id=\"' + esc(x.id) + '\">")
src = once(src,
    "    if (a === 'item') return openItem(b.getAttribute('data-id'));\n",
    "    if (a === 'item') return openItem(b.getAttribute('data-id'));\n"
    "    if (a === 'bidev') { var bp = proj(b.getAttribute('data-pid')); if (bp && K() && K().openJob) { closeSheets(); leaveHome(); return K().openJob(bp); } return openLead(b.getAttribute('data-lead')); }   /* patch SCHEDFREEZE */\n")

# ── B2. TIMEOFF (the Field strip, the "📅 My schedule" sheet, the Desk card): what I created is mine too; my bid dates ──
src = once(src,
    "    var ppl = itemPeople(x), mine = ppl.indexOf(n) >= 0 || ppl.indexOf(e) >= 0;\n",
    "    var ppl = itemPeople(x), mine = ppl.indexOf(n) >= 0 || ppl.indexOf(e) >= 0 || (!!n && [x.by, x.createdBy].some(function(v){ return low(v) === n; }));   /* patch SCHEDFREEZE: made by me */\n")
src = once(src,
    "    out.push({ id: s(x.id), pid: p ? s(p.id) : '', job: p ? s(p.name || p.address) : '', title: s(x.title) || 'Work', time: s(x.time), p: p });\n"
    "  });\n"
    "  return out;\n",
    "    out.push({ id: s(x.id), pid: p ? s(p.id) : '', job: p ? s(p.name || p.address) : '', title: s(x.title) || 'Work', time: s(x.time), p: p });\n"
    "  });\n"
    "  try { if (W._gcBidDates) W._gcBidDates.list({ name: u.name, from: day, to: day, sched: schedule() }).forEach(function(x){ out.push({ id: x.id, pid: x.pid, job: '', title: x.title + (x.address ? ' · ' + x.address : ''), time: x.time, p: null, bid: true }); }); } catch (e) {}   /* patch SCHEDFREEZE */\n"
    "  return out;\n")

# ── B3. DASHSCHED (the Desk "📅 My schedule" card) ──
src = once(src,
    "  return out.sort(function(a, b){ return a.d < b.d ? -1 : a.d > b.d ? 1 : (a.t || '99')",
    "  try { if (W._gcBidDates) W._gcBidDates.list({ name: sc.name, all: !!sc.all, from: from, to: to }).forEach(function(x){ var k = s(x.pid) + '|' + x.date + '|' + low(x.title); if (seen[k]) return; seen[k] = 1;   /* patch SCHEDFREEZE: my bid dates */\n"
    "    out.push({ id: x.id, d: x.date, t: x.time24, title: x.title, type: x.bidKind === 'prebid' ? 'meeting' : 'reminder', pid: x.pid, job: '', who: x.address, personal: false, leadId: x.leadId }); }); } catch (e) {}\n"
    "  return out.sort(function(a, b){ return a.d < b.d ? -1 : a.d > b.d ? 1 : (a.t || '99')")

# ── B4. the bid portal's 💾 Save (bid job details): the site walk → a real schedule entry ──
src = once(src,
    "    DT = null; M.tsFiles = true;\n",
    "    DT = null; M.tsFiles = true;\n"
    "    try { if (W._gcBidDates && W._gcBidDates.fromBidJob) W._gcBidDates.fromBidJob(M.jobId, body, pid).catch(function(){}); } catch (e) { warn(e); }   /* patch SCHEDFREEZE: the site walk on the schedule */\n")


# ── F1. PMFIELD 📅 My Schedule: always a screen. Built from what is on this phone at once; if building it throws (a list half-loaded
#        after a network drop) the screen still opens — ＋ New appointment / 🛠 Schedule work / 🏖 Time off on it, and a visible
#        "⚠️ Couldn't load your schedule — tap to retry" instead of nothing (the bar's 📅 used to do NOTHING then: warn only). ──
src = once(src,
    "function openSched(o){\n  o = o || {}; if (o.view) SV.view = o.view;",
    "function openSched(o){   /* patch SCHEDFREEZE: never nothing */\n"
    "  try { var r = openSched0(o); if (r) { r.setAttribute('data-sf-at', String(Date.now())); r.__sfSig = schedSig(); } return r; } catch (e) { warn(e); try { return schedFail(e); } catch (x) { warn(x); toast('Your schedule did not open — tap 📅 again.'); return null; } }\n"
    "}\n"
    "function schedSig(){ var L = C().schedule, mx = ''; arr(L).forEach(function(x){ var u = x && s(x.updatedAt); if (u > mx) mx = u; }); return [Array.isArray(L) ? L.length : -1, mx, SAVES, arr(C().leads).length, myName()].join('|'); }\n"
    "function schedFail(e){\n"
    "  var h = '<div class=\"gc-pmf-add\"><button type=\"button\" class=\"gc-pmf-big pri\" data-pmf-a=\"appt\"><span>📅</span>New appointment</button><button type=\"button\" class=\"gc-pmf-big\" data-pmf-a=\"work\"><span>🛠</span>Schedule work</button></div>' +\n"
    "    '<div class=\"gc-pmf-sferr\" role=\"alert\"><b>⚠️ Couldn’t load your schedule</b><small>' + esc(navigator.onLine === false ? 'No connection right now — what is on this phone shows as soon as it is read.' : 'The list did not finish loading (' + s(e && e.message || e).slice(0, 80) + ').') + '</small><button type=\"button\" data-pmf-a=\"sretry\">↻ Tap to retry</button></div>' +\n"
    "    '<div class=\"gc-ra-k\">Time off & my day</div><div class=\"gc-pmf-to\"><button type=\"button\" data-pmf-a=\"to\" data-v=\"off\">🏖 Time off</button><button type=\"button\" data-pmf-a=\"to\" data-v=\"avail\">📅 Availability</button><button type=\"button\" data-pmf-a=\"to\" data-v=\"mine\">🗂 My requests</button></div>';\n"
    "  var o = sheet('📅 My Schedule', h, 'sched'); if (o) { o.setAttribute('data-sf-fail', '1'); o.__sfSig = schedSig(); }\n"
    "  return o;\n"
    "}\n"
    "function openSched0(o){\n  o = o || {}; if (o.view) SV.view = o.view;")
src = once(src,
    "    if (a === 'today') { SV.day = today(); return openSched({}); }\n",
    "    if (a === 'today') { SV.day = today(); return openSched({}); }\n"
    "    if (a === 'sretry') { HC.k = null; try { if (typeof W._gcPushAll === 'function' && navigator.onLine !== false) W._gcPushAll(); } catch (e) {} try { if (W._gcSF && W._gcSF.pull) W._gcSF.pull(); } catch (e) {} return openSched({}); }   /* patch SCHEDFREEZE */\n")
# the bar's 📅: a failure says so (it used to be warn-only: the tap did nothing)
src = once(src,
    "try { openSched({ reset: true }); } catch (e) { warn(e); } return; }",
    "try { if (!openSched({ reset: true })) toast('Your schedule did not open — tap 📅 again.'); } catch (e) { warn(e); toast('Your schedule did not open — tap 📅 again.'); } return; }")
# while 📅 My Schedule is open: the list follows the data (a list that arrives late, a save, the network coming back) — redrawn only
# when what it shows changed and never under a finger or a form
src = once(src,
    "W._gcPmField = {\n",
    "W._gcPmField = {\n  sfRefresh: function(){ var o = D.querySelector('.gc-pmf-sheet[data-pmf-sheet=\"sched\"]'); if (!o || o.__sfSig === schedSig()) return false; var bd = o.querySelector('.bd'), st = bd ? bd.scrollTop : 0; var n = openSched({}); if (n && st) { var b2 = n.querySelector('.bd'); if (b2) b2.scrollTop = st; } return !!n; },   /* patch SCHEDFREEZE */\n")


# ── F2. ROLEAPPS: the role app is not dropped on a blip. A moment without the person / role (the lists re-read after a network
#        drop, an auth refresh) made sync() lay GrayCo Field out for "no role" and strip the PM / admin dashboard off the Home — for the
#        admin that leaves only the 🏖 time-off strip (the admin's own sections live in the dashboard), and a tap on 📅 at that moment
#        landed on the bare Home. The last role app now holds for 5 s while still signed in (sign-out / ⚙ roleapps off: at once). ──
src = once(src,
    "function app(){ if (off() || !ready()) return ''; return APPOF[rk()] || ''; }",
    "function app(){ if (off() || !ready()) return ''; return APPOF[rk()] || ''; }\n"
    "var STA = { a: '', at: 0 };   /* patch SCHEDFREEZE */\n"
    "function appS(){ var a = app(); if (a) { STA.a = a; STA.at = Date.now(); return a; } if (STA.a && !off() && signedIn() && !gateUp() && Date.now() - STA.at < 5000) return STA.a; STA.a = ''; return ''; }")
src = once(src, "    var a = app(), m = mode(a), k = rk();", "    var a = appS(), m = mode(a), k = rk();   /* patch SCHEDFREEZE: appS */")
src = once(src, "  var a = app(), wrap = el.querySelector('.fh-wrap'); if (!wrap) return;", "  var a = appS(), wrap = el.querySelector('.fh-wrap'); if (!wrap) return;   /* patch SCHEDFREEZE: appS */")
src = once(src, "if (n.id === '_gcJobPick' || n.id === 'gc-fh-tabs') { fieldBar(app()); fieldInject(); return; }", "if (n.id === '_gcJobPick' || n.id === 'gc-fh-tabs') { fieldBar(appS()); fieldInject(); return; }")

src = once(src, "    if (!a && !ready()) return;   /* the person not known for a moment", "    if (!ready()) return;   /* patch SCHEDFREEZE (a held role app included) */   /* the person not known for a moment")

# FREEZE_PATCHES

src = src.rstrip('\n') + '\n<script id="gc-patch-schedfreeze">\n' + BID.rstrip('\n') + '\n</script>\n'
open(path, 'w', encoding='utf-8').write(src)
print('patched SCHEDFREEZE')
