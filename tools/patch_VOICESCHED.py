#!/usr/bin/env python3
r"""Idempotent patch VOICESCHED: the voice note panel (🎤) gets a "📅 Schedule" destination (owner: "have schedule").

What it does (inside patch AUTAI, the one microphone):
  * New chip "📅 Schedule". The spoken / typed text becomes a NEW schedule entry on the picked job:
      date / day  — "Monday", "tomorrow", "Nov 3", "11/3", "next week Tuesday", "next Friday", "in 2 days" (Central time)
      time        — "8 am", "8:30", "at 7", "noon", "first thing", "8 to 3"
      length      — "3 days", "for a week", "through Friday", "until Nov 6" (work days Mon–Sat, like the Schedule screen)
      who         — a sub (name or contact) or a staff member from the CRM's lists ("Julio framing")
      task        — what is left ("framing", "drywall hang")
    A plain rule parser (instant, works offline). The AI router (voice-intake.js) only knows schedule MOVES, so it is
    not used to build the entry; its moves still work as before (🗓 Schedule change).
  * A confirm card first: Job · Task · Who · Start date / time · End date · work days, all editable,
    "📅 Add to schedule" / "Cancel". Cancel saves nothing.
  * Saved exactly like the job's Schedule tab "+ Add Schedule Phase / Task" → "Add to Schedule": one entry per work day
    (no Sundays), a shared groupId, the job's address, vendor = the sub, assignee = the staff member (else the PM),
    scope 'company', the same duplicate check (_gcScheduleDupCheck), written through _setSchedule + _supaUpsert +
    _gcRecIDBput — so it syncs, shows on the job's Schedule tab, the calendar, the crew / sub's view and the calendar
    feed (Google Calendar) like any other entry.
  * Smart routing: while nobody has tapped a chip, a note that clearly is a scheduling statement (a date AND a sub /
    staff name, a time, a length or a schedule word) gets "📅 Schedule" picked and moved first; ✨ Smart route puts
    the Schedule card first too.
  * 👤 My schedule (owner): "meeting with Nick Thursday 2pm", "dentist Friday 9 to 10", "walkthrough with adjuster at
    123 Main tomorrow 3pm" → a confirm card (what · date · start / end time · where · invite) → a 🔒 personal item
    (scope 'personal', by = me — the Schedule screen's "Personal (only me)"; private, so never on a portal), and the
    same item on each invited staff member's schedule (invitedBy). The calendar feed (Google Calendar) reads them by
    person. Smart routing picks 👤 My schedule for an appointment / meeting.
  * GrayCo Field: a "📅 Schedule" tool in each job's tool grid (window._gcFieldTools.register) → this sheet on that job.
  * Part 2 (tools/voicesched_hist.html, its own script after GrayCo Field): the SCHEDULE CHANGE HISTORY on every job
    (any add / move / edit / removal, from anywhere: who, when, old → new, how) shown on the job's Schedule tab and
    kept in gc_sched_history; the customer portal's plan steps follow a templated row's new dates. The GC and sub
    portals read the cloud schedule live (portal-access.js schedFor now also skips deleted / personal / private rows).
  Console: _gcVoiceSched.parse(text, today?), .looks(text), .want(text), .save(entry, pid), .saveMine(entry, pid);
           _gcSchedHist.state(), .list(pid)

Usage: python3 tools/patch_VOICESCHED.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch VOICESCHED */'
if MARK in src:
    print('VOICESCHED: already patched'); sys.exit(0)

def once(s, old, new):
    n = s.count(old)
    assert n == 1, ('VOICESCHED anchor count != 1', n, old[:100])
    return s.replace(old, new)

# 1. the chip
src = once(src, """['announce', '📢 Company announcement'], ['message', '✉️ Message a person'], ['co', '± Change-order draft'], ['log', '📋 Daily log']
];""", """['announce', '📢 Company announcement'], ['message', '✉️ Message a person'], ['co', '± Change-order draft'], ['log', '📋 Daily log'],
  ['sched', '📅 Schedule'], ['mine', '👤 My schedule']   """ + MARK + """
];""")

# 2. a tapped chip is the person's own pick (no more auto-suggest); the suggestion watcher
src = once(src, """    var d = b.getAttribute('data-d'); sel[d] = !sel[d]; b.classList.toggle('on', !!sel[d]); syncWho();
  };
  syncWho();
  q('#_gcMicJob').onchange = function(){ lsSet('gc_autai_lastpid', this.value); };""",
"""    var d = b.getAttribute('data-d'); sel[d] = !sel[d]; b.classList.toggle('on', !!sel[d]); syncWho();
    ov.__state.touched = true; ov.__state.auto = false; vsHint(ov, '');   /* patch VOICESCHED */
  };
  syncWho();
  q('#_gcMicJob').onchange = function(){ lsSet('gc_autai_lastpid', this.value); vsJobLabel(ov); };
  if (preset && preset.dest) ov.__state.touched = true;
  vsWatch(ov);""")

# 3. ✨ Smart route: the Schedule card first when it is a scheduling statement
src = once(src, """  var acts = arr(r.actions).map(function(a, i){ return { id: 'a' + i, dest: AI2DEST[a.type] || 'note', text: s(a.text), assignee: s(a.assignee), due: s(a.due), price: a.price, scope: s(a.scope), scheduleItem: s(a.scheduleItem), newDate: s(a.newDate) }; });
  if (!acts.length) { manualActions(ov); return; }""",
"""  var acts = arr(r.actions).map(function(a, i){ return { id: 'a' + i, dest: AI2DEST[a.type] || 'note', text: s(a.text), assignee: s(a.assignee), due: s(a.due), price: a.price, scope: s(a.scope), scheduleItem: s(a.scheduleItem), newDate: s(a.newDate) }; });
  acts = vsAfterAI(ov, acts);   /* patch VOICESCHED */
  if (!acts.length) { manualActions(ov); return; }""")

# 4. renderActs: the Schedule confirm card (its own Add / Cancel); ✅ Post only for the other places
src = once(src, """function renderActs(ov, acts, note){
  ov.__state.actions = acts;""", """function renderActs(ov, acts, note){
  acts.sort(function(a, b){ return (VS_CARD[b.dest] ? 1 : 0) - (VS_CARD[a.dest] ? 1 : 0); });   /* patch VOICESCHED: 📅 / 👤 first */
  ov.__state.actions = acts;""")
src = once(src, """  box.innerHTML = (note ? '<div class="gcautai-hint" style="color:#a5b4fc">' + esc(note) + '</div>' : '') + '<div class="gcautai-l">Check each one, then Post</div>' + acts.map(function(a){
    var extra = '';""", """  box.innerHTML = (note ? '<div class="gcautai-hint" style="color:#a5b4fc">' + esc(note) + '</div>' : '') + '<div class="gcautai-l">Check each one, then Post</div>' + acts.map(function(a){
    if (VS_CARD[a.dest]) return vsCard(ov, a);   /* patch VOICESCHED */
    var extra = '';""")
src = once(src, """  '<div class="gcautai-row"><button class="gcautai-btn go" id="_gcMicPost">✅ Post</button></div>';
  box.querySelectorAll('._gcADest').forEach(function(sl){ sl.onchange = function(){ var c = sl.closest('[data-a]'); var a = acts.filter(function(x){ return x.id === c.getAttribute('data-a'); })[0]; readCard(c, a); a.dest = sl.value; renderActs(ov, acts, note); }; });
  box.querySelector('#_gcMicPost').onclick = function(){ postAll(ov); };""",
"""  (acts.some(function(a){ return !VS_CARD[a.dest]; }) ? '<div class="gcautai-row"><button class="gcautai-btn go" id="_gcMicPost">✅ Post</button></div>' : '');
  box.querySelectorAll('._gcADest').forEach(function(sl){ sl.onchange = function(){ var c = sl.closest('[data-a]'); var a = acts.filter(function(x){ return x.id === c.getAttribute('data-a'); })[0]; readCard(c, a); a.dest = sl.value; renderActs(ov, acts, note); }; });
  var pb = box.querySelector('#_gcMicPost'); if (pb) pb.onclick = function(){ postAll(ov); };
  vsBind(ov, acts);""")

# 5. postAll does not close the sheet while a Schedule card still waits
src = once(src, """    if (!bad) { toast('🎤 ' + done + ' posted'); ST(function(){ if (D.getElementById('_gcMicOv') === ov) closeMic(); }, 1400); }""",
"""    if (!bad) { toast('🎤 ' + done + ' posted'); if (!ov.querySelector('[data-vs]:not(.vsdone)')) ST(function(){ if (D.getElementById('_gcMicOv') === ov) closeMic(); }, 1400); }""")

# 6. apply(): 'sched' (also for _gcAUTAI.apply)
src = once(src, """    if (a.dest === 'schedule') {
      if (needJob(pid)) return Promise.resolve(needJob(pid));
      if (!s(a.newDate)) return Promise.resolve({ ok: false, error: 'Which new date?' });""",
"""    if (a.dest === 'sched') return vsSave(a.sched || vsParse(t), pid, st, t);   /* patch VOICESCHED */
    if (a.dest === 'mine') return vsSaveMine(a.sched || vsParseMine(t), pid, st, t);
    if (a.dest === 'schedule') {
      if (needJob(pid)) return Promise.resolve(needJob(pid));
      if (!s(a.newDate)) return Promise.resolve({ ok: false, error: 'Which new date?' });""")

# 7. the parser, the card and the save
JS = r"""/* ════════ patch VOICESCHED — 📅 Schedule: a voice note → a new schedule entry on the job ════════ */
var VS_WD = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
var VS_MON = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };
var VS_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20 };
var VS_WDRE = '(sunday|monday|tuesday|wednesday|thursday|friday|saturday|mon|tues|tue|weds|thurs|thur|thu|fri)';
var VS_MONRE = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)';
var VS_NRE = '(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty)';
var VS_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], VS_MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function vsToday(){
  try { var p = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).forEach(function(x){ p[x.type] = x.value; });
    if (p.year && p.month && p.day) return p.year + '-' + p.month + '-' + p.day; } catch (e) {}
  return today();
}
function vsOk(v){ return /^\d{4}-\d{2}-\d{2}$/.test(s(v)); }
function vsD(ymd){ return new Date(ymd + 'T12:00:00Z'); }
function vsY(d){ return d.toISOString().slice(0, 10); }
function vsAdd(ymd, n){ var d = vsD(ymd); d.setUTCDate(d.getUTCDate() + n); return vsY(d); }
function vsDow(ymd){ return vsD(ymd).getUTCDay(); }
function vsN(w){ w = low(w); return /^\d+$/.test(w) ? parseInt(w, 10) : (VS_NUM[w] || 0); }
function vsNice(ymd){ if (!vsOk(ymd)) return ''; var d = vsD(ymd); return VS_DOW[d.getUTCDay()] + ' ' + VS_MO[d.getUTCMonth()] + ' ' + d.getUTCDate(); }
function vsNext(base, wd, strict){ var n = (wd - vsDow(base) + 7) % 7; if (strict && n === 0) n = 7; return vsAdd(base, n); }
function vsNextWeek(base, wd){ var toMon = ((1 - vsDow(base) + 7) % 7) || 7; return vsAdd(vsAdd(base, toMon), (wd + 6) % 7); }
function vsYmd(y, m, d){ if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return ''; var x = new Date(Date.UTC(y, m - 1, d, 12)); return x.getUTCMonth() === m - 1 ? vsY(x) : ''; }
function vsMD(base, m, d, y){
  if (y) { y = +y; if (y < 100) y += 2000; return vsYmd(y, m, d); }
  var yy = +base.slice(0, 4), out = vsYmd(yy, m, d);
  if (out && out < vsAdd(base, -14)) out = vsYmd(yy + 1, m, d);   /* "Jan 5" said in late fall = next year */
  return out;
}
/* every date phrase: [regex, resolve(match, base, isEnd, start)] — the more specific first */
var VS_DATES = [
  [new RegExp('\\b(?:the\\s+)?day after tomorrow\\b', 'g'), function(m, b){ return vsAdd(b, 2); }],
  [/\b(?:tomorrow|tmrw|tomorow)\b/g, function(m, b){ return vsAdd(b, 1); }],
  [/\b(?:today|this morning|this afternoon|tonight)\b/g, function(m, b){ return b; }],
  [new RegExp('\\bnext week\\s+(?:on\\s+)?' + VS_WDRE + '\\b', 'g'), function(m, b){ return vsNextWeek(b, VS_WD[m[1]]); }],
  [new RegExp('\\b' + VS_WDRE + '\\s+(?:of\\s+)?next week\\b', 'g'), function(m, b){ return vsNextWeek(b, VS_WD[m[1]]); }],
  [new RegExp('\\bnext\\s+' + VS_WDRE + '\\b', 'g'), function(m, b){ return vsNextWeek(b, VS_WD[m[1]]); }],
  [new RegExp('\\b' + VS_MONRE + '\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b', 'g'), function(m, b){ return vsMD(b, VS_MON[m[1]], +m[2], m[3]); }],
  [new RegExp('\\b(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?' + VS_MONRE + '\\b', 'g'), function(m, b){ return vsMD(b, VS_MON[m[2]], +m[1]); }],
  [/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g, function(m, b){ return vsMD(b, +m[1], +m[2], m[3]); }],
  [new RegExp('\\b(?:this\\s+(?:coming\\s+)?|coming\\s+)?' + VS_WDRE + '\\b', 'g'), function(m, b, isEnd, st){
    var wd = VS_WD[m[1]]; if (isEnd) return vsNext(st || b, wd, false); return vsNext(b, wd, !/^this\b/.test(m[0])); }],
  [/\bthe\s+(\d{1,2})(?:st|nd|rd|th)\b/g, function(m, b){ var d = +m[1], y = +b.slice(0, 4), mo = +b.slice(5, 7); var out = vsYmd(y, mo, d); if (!out || out < b) out = mo === 12 ? vsYmd(y + 1, 1, d) : vsYmd(y, mo + 1, d); return out; }],
  [new RegExp('\\bin\\s+' + VS_NRE + '\\s+(days?|weeks?)\\b', 'g'), function(m, b){ var n = vsN(m[1]); return n ? vsAdd(b, /week/.test(m[2]) ? 7 * n : n) : ''; }],
  [/\bnext week\b/g, function(m, b){ return vsNextWeek(b, 1); }]
];
var VS_ENDKW = /(?:\b(?:through|thru|till|til|until|ending|ends?|finish(?:ing|es)?|done by|wrap(?:ping)? up|to)\s+(?:on\s+|by\s+|the\s+)?|[-–]\s*)$/;
function vsMask(str, i, n){ return str.slice(0, i) + new Array(n + 1).join(' ') + str.slice(i + n); }
function vsWorkDates(start, days){ var out = [], d = start, g = 0; if (!vsOk(d)) return out; while (out.length < days && g++ < 500) { if (vsDow(d) !== 0) out.push(d); d = vsAdd(d, 1); } return out; }
function vsDaysBetween(a, b){ if (!vsOk(a) || !vsOk(b) || b < a) return 0; var n = 0, d = a, g = 0; while (d <= b && g++ < 500) { if (vsDow(d) !== 0) n++; d = vsAdd(d, 1); } return n; }
function vsEndOf(start, days){ var w = vsWorkDates(start, Math.max(1, days)); return w[w.length - 1] || start; }
function vsHM(h, mi, ap){ h = +h; mi = +(mi || 0); if (!(h >= 0 && h <= 24 && mi >= 0 && mi < 60)) return '';
  ap = low(ap).replace(/\./g, ''); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
  if (!ap && h >= 1 && h <= 5) h += 12;   /* "at 3" on a job = 3 PM */
  return ('0' + h).slice(-2) + ':' + ('0' + mi).slice(-2); }
/* the sub / staff lists */
var VS_GENERIC = { construction: 1, constructions: 1, remodeling: 1, remodel: 1, plumbing: 1, electric: 1, electrical: 1, roofing: 1, roof: 1, flooring: 1, floor: 1, framing: 1, drywall: 1, painting: 1, paint: 1, hvac: 1, air: 1, supply: 1, supplies: 1, pro: 1, pros: 1, services: 1, service: 1, the: 1, and: 1, home: 1, company: 1, llc: 1, inc: 1, crew: 1, office: 1, concrete: 1, gutters: 1, gutter: 1, siding: 1, windows: 1, doors: 1, insurance: 1, maintenance: 1, cabinets: 1, tile: 1, rentals: 1, lumber: 1, building: 1, products: 1, general: 1, contractor: 1, contractors: 1, demo: 1, cleaning: 1 };
function vsSubs(){ return arr(crm().subs).filter(function(x){ return x.deleted !== true && s(x.name); }); }
function vsPeople(){
  var out = [];
  users().forEach(function(u){ var n = s(u.name); if (u.active === false || !n || /^office$/i.test(n)) return; out.push({ kind: 'staff', name: n, keys: [n, n.split(/\s+/)[0]] }); });
  vsSubs().forEach(function(x){
    var n = s(x.name), c = s(x.contact), keys = [n];
    n.split(/\s*[-–,(]\s*/).forEach(function(p){ p = s(p.replace(/\)/g, '')); if (p && p !== n) keys.push(p); });
    keys.push(n.split(/\s+/)[0]); if (c) { keys.push(c); keys.push(c.split(/\s+/)[0]); }
    out.push({ kind: 'sub', name: n, keys: keys });
  });
  out.forEach(function(p){ var seen = {}; p.keys = p.keys.map(function(k){ return low(k).replace(/[^a-z0-9' &]/g, ' ').replace(/\s+/g, ' ').trim(); }).filter(function(k){
    if (!k || seen[k] || k.length < 3 || VS_GENERIC[k] || VS_WD[k] != null || VS_MON[k] != null || VS_NUM[k] != null) return false; seen[k] = 1; return true; }); });
  return out;
}
function vsFindWho(str){
  var best = null;
  vsPeople().forEach(function(p){ p.keys.forEach(function(k){
    var re = new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "(?:'s|s')?\\b"), m = re.exec(str);
    if (m && (!best || k.length > best.len || (k.length === best.len && p.kind === 'sub' && best.kind !== 'sub'))) best = { kind: p.kind, name: p.name, i: m.index, n: m[0].length, len: k.length };
  }); });
  return best;
}
function vsWho(name){
  name = s(name); if (!name) return { kind: '', name: '' };
  var l = low(name), all = vsPeople();
  var hit = all.filter(function(p){ return low(p.name) === l; })[0] || all.filter(function(p){ return p.keys.indexOf(l.replace(/[^a-z0-9' &]/g, ' ').replace(/\s+/g, ' ').trim()) >= 0; })[0] || vsFindWho(l);
  return hit ? { kind: hit.kind, name: hit.name } : { kind: 'free', name: name };
}
var VS_FILL = {}; "have has had get got put schedule scheduled scheduling book booked start starts starting started begin begins beginning on at for from the a an to and is are will be going gonna coming come comes out over in crew crews guys team we i need needs should can could please add it this that then with of by lets let's us our they them he she his her here there job site onsite through thru until till work working morning afternoon next week o'clock oclock about around roughly ok okay so um uh do doing all day days show up out there be set him me my".split(' ').forEach(function(w){ VS_FILL[w] = 1; });
function vsParse(text, base){
  base = vsOk(base) ? base : vsToday();
  var raw = s(text), t = ' ' + low(raw).replace(/[“”]/g, '"').replace(/[’]/g, "'") + ' ', m, i, found = [];
  /* dates */
  VS_DATES.forEach(function(rule, ri){ rule[0].lastIndex = 0; while ((m = rule[0].exec(t))) { var clash = found.some(function(f){ return m.index < f.i + f.n && f.i < m.index + m[0].length; }); if (!clash) found.push({ i: m.index, n: m[0].length, m: m, r: rule[1] }); if (!m[0].length) rule[0].lastIndex++; } });
  found.sort(function(a, b){ return a.i - b.i; });
  var start = '', end = '', endF = null, mask = t;
  found.forEach(function(f){ f.isEnd = VS_ENDKW.test(t.slice(Math.max(0, f.i - 16), f.i)); });
  var sF = found.filter(function(f){ return !f.isEnd; })[0], eF = found.filter(function(f){ return f.isEnd; })[0];
  if (!sF && eF && /\bto\s+(?:on\s+)?$/.test(t.slice(Math.max(0, eF.i - 8), eF.i))) { sF = eF; eF = null; }   /* "move it to Monday" */
  if (sF) start = sF.r(sF.m, base, false) || '';
  if (eF) { endF = eF; end = eF.r(eF.m, base, true, start || base) || ''; }
  found.forEach(function(f){ if (f === sF || f === eF) { var pre = t.slice(0, f.i).match(VS_ENDKW); var j = f === eF && pre ? f.i - pre[0].length : f.i; mask = vsMask(mask, j, f.i + f.n - j); } });
  /* time */
  var time = '', endTime = '', tm;
  var TRE = /(?:\b(?:at|from|around|by)\s+)?\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/g;
  if ((tm = TRE.exec(mask))) { time = vsHM(tm[1], tm[2], tm[3]); }
  else if ((tm = /\b(?:at\s+)?(?:noon|midday|lunch ?time)\b/.exec(mask))) time = '12:00';
  else if ((tm = /\bfirst thing(?: in the morning)?\b/.exec(mask))) time = '07:00';
  else if ((tm = /\b(?:at|around|by|from)\s+(\d{1,2})(?::(\d{2}))?(?:\s*o'?clock)?(?:\s+in the (morning|afternoon))?\b(?!\s*(?:days?|weeks?|\/|th|st|nd|rd))/.exec(mask))) time = vsHM(tm[1], tm[2], tm[3] === 'morning' ? 'am' : tm[3] === 'afternoon' ? 'pm' : '');
  else if ((tm = /\b(\d{1,2})(?::(\d{2}))?\s*(?:-|–|to|till|until)\s*(\d{1,2})(?::(\d{2}))?\b(?!\s*(?:days?|weeks?|\/|th|st|nd|rd))/.exec(mask))) { time = vsHM(tm[1], tm[2], ''); endTime = vsHM(tm[3], tm[4], ''); if (+tm[1] > 12 || +tm[3] > 12) { time = ''; endTime = ''; tm = null; } }
  else if ((tm = /\b(\d{1,2})(?::(\d{2}))?\s*o'?clock\b/.exec(mask))) time = vsHM(tm[1], tm[2], '');
  if (tm) {
    var after = mask.slice(tm.index + tm[0].length), em = /^\s*(?:-|–|to|till|til|until)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?![a-z\d\/])/.exec(after);
    var cut = tm[0].length;
    if (em) { endTime = vsHM(em[1], em[2], em[3] || ''); cut += em[0].length; }
    if (time && endTime && endTime <= time && +endTime.slice(0, 2) < 12) endTime = vsHM(+endTime.slice(0, 2) + 12, endTime.slice(3), 'x');   /* "8 to 3" = 8 AM to 3 PM */
    mask = vsMask(mask, tm.index, cut);
  }
  /* where: "at 123 Main" */
  var address = '', am = /\bat\s+(\d{2,6}\s+[a-z][a-z.'-]*(?:\s+(?!and\b|with\b|for\b|on\b|at\b)[a-z][a-z.'-]*){0,3})/.exec(mask);
  if (am) { address = am[1].replace(/\b[a-z]/g, function(c){ return c.toUpperCase(); }).trim(); mask = vsMask(mask, am.index, am[0].length); }
  /* length */
  var days = 0, dm;
  if ((dm = new RegExp('\\b(?:for\\s+)?(?:about\\s+)?' + VS_NRE + '\\s+(?:(?:work(?:ing)?|full)\\s+)?days?\\b').exec(mask))) { days = vsN(dm[1]); mask = vsMask(mask, dm.index, dm[0].length); }
  else if ((dm = new RegExp('\\b(?:for\\s+)?(?:about\\s+)?' + VS_NRE + '\\s+(?:work(?:ing)?\\s+)?weeks?\\b').exec(mask))) { days = 5 * vsN(dm[1]); mask = vsMask(mask, dm.index, dm[0].length); }
  else if ((dm = /\b(?:for\s+)?(?:a\s+)?half(?:\s+a)?\s+day\b|\ball day\b/.exec(mask))) { days = 1; mask = vsMask(mask, dm.index, dm[0].length); }
  else if ((dm = /\b(?:all|the whole|rest of the) week\b/.exec(mask))) { var st0 = start || base; end = end || vsNext(st0, 6, false); mask = vsMask(mask, dm.index, dm[0].length); }
  if (!start && (end || days || time)) start = base;
  if (start && vsDow(start) === 0) start = vsAdd(start, 1);   /* like the Schedule screen: no Sundays */
  if (end && start && end < start) end = '';
  if (end) days = vsDaysBetween(start, end) || 1;
  else if (start) { days = days || 1; end = vsEndOf(start, days); }
  /* who */
  var who = vsFindWho(mask), whoKind = '', whoName = '';
  if (who) { whoKind = who.kind; whoName = who.name; mask = vsMask(mask, who.i, who.n); }
  /* the task: what is left */
  var task = mask.replace(/[^a-z0-9&'\/ -]/g, ' ').split(/\s+/).filter(function(w){ return w && !VS_FILL[w] && !/^['\/-]+$/.test(w); }).join(' ').trim();
  task = task.replace(/^(?:-|and|to)\s+|\s+(?:-|and|to)$/g, '');
  if (task) task = task.charAt(0).toUpperCase() + task.slice(1);
  return { title: task.slice(0, 100), who: whoName, whoKind: whoKind, start: start, time: time, endTime: endTime, end: end, days: days || (start ? 1 : 0), address: address, base: base, text: raw };
}
var VS_VERB = /\b(?:schedul\w*|start\w*|begin\w*|book\w*|on site|onsite|come out|be out|show up|out there|install\w*|hang\w*|frame\w*|framing|pour\w*|tear[- ]?off|deliver\w*|set up|through|thru|until)\b/;
function vsLooks(text){
  var t = s(text); if (t.length < 6) return false;
  var p = vsParse(t), lt = low(t);
  var dated = VS_DATES.some(function(r){ r[0].lastIndex = 0; var hit = r[0].test(' ' + lt + ' '); r[0].lastIndex = 0; return hit; });
  if (!dated || !p.start) return false;
  if (/\?\s*$/.test(t) && !p.who) return false;
  if (p.start <= p.base && !p.time) return false;   /* "finished framing today" is a daily log, not a schedule entry */
  if (/\b(?:yesterday|finished|completed|did|was|were|came|showed|got done)\b/.test(lt) && p.start <= vsAdd(p.base, 1)) return false;
  var signals = (p.who ? 1 : 0) + (p.time ? 1 : 0) + (p.days > 1 ? 1 : 0) + (VS_VERB.test(lt) ? 1 : 0);
  return signals >= (p.who ? 2 : 1) || (!!p.who && !!p.title);
}
function vsHint(ov, msg){
  var h = ov.querySelector('#_gcVsHint');
  if (!h) { h = D.createElement('div'); h.id = '_gcVsHint'; h.className = 'gcautai-hint'; h.style.color = '#a5b4fc'; var ch = ov.querySelector('#_gcMicDest'); if (ch) ch.parentNode.insertBefore(h, ch.nextSibling); }
  h.textContent = msg; h.style.display = msg ? '' : 'none';
}
function vsChips(ov){ var sel = ov.__state.sel; ov.querySelectorAll('#_gcMicDest [data-d]').forEach(function(b){ b.classList.toggle('on', !!sel[b.getAttribute('data-d')]); }); }
/* while nobody has tapped a chip: a scheduling statement picks 📅 Schedule (first); otherwise back to what was picked */
var VS_CARD = { sched: 1, mine: 1 };
var VS_APPT = /\b(?:meeting|meet(?:ing)? with|appointment|appt|dentist|doctor|dr\.? appointment|lunch with|breakfast with|dinner with|call with|interview|walk ?-?through with|walkthrough|walk-through|conference|zoom|teams call|haircut|vet)\b/;
/* an appointment / meeting for the speaker (👤 My schedule) — not crew work on a job */
function vsLooksAppt(text){
  var t = s(text), lt = low(t); if (t.length < 6 || !VS_APPT.test(lt)) return false;
  var p = vsParse(t); if (!p.start) return false;
  if (p.whoKind === 'sub' && !/\b(?:meeting|meet|appointment|appt|call|lunch|interview)\b/.test(lt)) return false;
  return !!(p.time || p.start > p.base);
}
function vsWant(text){ return vsLooksAppt(text) ? 'mine' : vsLooks(text) ? 'sched' : ''; }
var VS_HINT = { sched: '📅 Sounds like a schedule entry — Send to: Schedule (tap another place to change).', mine: '👤 Sounds like an appointment — Send to: My schedule (tap another place to change).' };
/* while nobody has tapped a chip: a scheduling statement picks 📅 Schedule, an appointment 👤 My schedule (first);
   otherwise back to what was picked */
function vsWatch(ov){
  var ta = ov.querySelector('#_gcMicText'), last = null;
  function check(){
    try {
      var st = ov.__state, v = ta.value; if (v === last) return; last = v;
      if (st.touched) return;
      var want = vsWant(v), sel = st.sel;
      if (want && st.auto !== want) {
        if (!st.auto) st.prev = Object.assign({}, sel);
        Object.keys(sel).forEach(function(k){ delete sel[k]; }); sel[want] = true; st.auto = want;
        var chips = ov.querySelector('#_gcMicDest'), b = chips && chips.querySelector('[data-d="' + want + '"]'); if (b) chips.insertBefore(b, chips.firstChild);
        vsChips(ov); vsHint(ov, VS_HINT[want]);
      } else if (!want && st.auto) {
        Object.keys(sel).forEach(function(k){ delete sel[k]; }); Object.assign(sel, st.prev || { note: true }); st.auto = false; vsChips(ov); vsHint(ov, '');
      }
    } catch (e) {}
  }
  ta.addEventListener('input', check);
  (function loop(){ if (!ov.isConnected) return; check(); ST(loop, 700); })();
}
function vsAfterAI(ov, acts){
  var st = ov.__state, text = s(ov.querySelector('#_gcMicText').value), pid = ov.querySelector('#_gcMicJob').value;
  if (acts.some(function(a){ return VS_CARD[a.dest]; })) return acts;
  var want = st.touched ? (st.sel.mine ? 'mine' : st.sel.sched ? 'sched' : '') : vsWant(text);
  if (!want) return acts;
  var sch = arr(crm().schedule).filter(function(x){ return String(x.pid) === String(pid); });
  acts = acts.filter(function(a){ if (a.dest !== 'schedule') return true; var it = low(a.scheduleItem); return !!it && sch.some(function(x){ return low(x.title).indexOf(it) >= 0; }); });   /* an AI "move" with nothing to move = this new entry */
  return [{ id: 'vs0', dest: want, text: text }].concat(acts);
}
function vsJobLabel(ov){
  var pid = ov.querySelector('#_gcMicJob').value, p = proj(pid);
  ov.querySelectorAll('[data-vs] .gcvs-job').forEach(function(el){ el.innerHTML = p ? '<b>' + esc(p.name) + '</b>' + (p.autoPO ? ' · PO ' + esc(p.autoPO) : '') + (p.address ? ' · ' + esc(p.address) : '') : '<span class="gcautai-bad">Pick the job above first.</span>'; });
  ov.querySelectorAll('[data-vs] .gcvs-link').forEach(function(el){ el.style.display = p ? '' : 'none'; var b = el.querySelector('b'); if (b && p) b.textContent = p.name; });
}
function vsStaffNames(){ return users().filter(function(u){ return u.active !== false && s(u.name) && !/^office$/i.test(s(u.name)); }).map(function(u){ return s(u.name); }); }
function vsCard(ov, a){
  var L = function(t, inner){ return '<label style="display:block;font-size:12px;color:#9fb3c8;font-weight:700">' + t + inner + '</label>'; };
  var foot = '<div class="gcvs-sum" style="font-size:13px;margin-top:6px;color:#cbd5e1"></div>' +
    '<div class="gcautai-row"><button class="gcautai-btn go" data-vs-add>' + (a.dest === 'mine' ? '👤 Add to my schedule' : '📅 Add to schedule') + '</button><button class="gcautai-btn" data-vs-cancel>Cancel</button></div>' +
    '<div class="_gcARes" style="font-size:13px;margin-top:4px"></div></div>';
  if (a.dest === 'mine') {
    if (!a.sched) a.sched = vsParseMine(a.text);
    var m = a.sched;
    return '<div class="gcautai-act" data-vs="' + esc(a.id) + '" data-vk="mine" style="border-color:#7c3aed">' +
      '<div class="t">👤 My schedule — only you' + (m.invite ? ' and the people you invite' : '') + ' see it</div>' +
      '<div class="gcautai-grid">' + L('What', '<input class="gcautai-in" data-v="title" placeholder="e.g. Meeting with Nick" value="' + esc(m.title) + '">') +
        L('Date', '<input class="gcautai-in" data-v="start" type="date" value="' + esc(m.start) + '">') +
        L('Start time', '<input class="gcautai-in" data-v="time" type="time" value="' + esc(m.time) + '">') +
        L('End time', '<input class="gcautai-in" data-v="endTime" type="time" value="' + esc(m.endTime) + '">') +
        L('Where (optional)', '<input class="gcautai-in" data-v="where" placeholder="Address" value="' + esc(m.where) + '">') +
        L('Invite (staff, optional)', '<input class="gcautai-in" data-v="invite" list="_gcVsStaff" placeholder="e.g. Nick Thomas" value="' + esc(m.invite) + '">') + '</div>' +
      '<label class="gcvs-link" style="display:none;font-size:13px;margin-top:6px"><input type="checkbox" data-v="link"' + (m.link ? ' checked' : '') + '> Link to the job <b></b></label>' +
      '<datalist id="_gcVsStaff">' + vsStaffNames().map(function(n){ return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>' + foot;
  }
  if (!a.sched) a.sched = vsParse(a.text);
  var e = a.sched;
  var names = vsSubs().map(function(x){ return s(x.name); }).concat(vsStaffNames());
  return '<div class="gcautai-act" data-vs="' + esc(a.id) + '" data-vk="sched" style="border-color:#2563eb">' +
    '<div class="t">📅 Schedule entry — check it, then Add</div>' +
    '<div style="font-size:13px;margin-top:6px">Job: <span class="gcvs-job"></span></div>' +
    '<div class="gcautai-grid">' + L('Task', '<input class="gcautai-in" data-v="title" placeholder="e.g. Framing" value="' + esc(e.title) + '">') +
      L('Who (sub / crew)', '<input class="gcautai-in" data-v="who" list="_gcVsWho" placeholder="Sub or crew" value="' + esc(e.who) + '">') +
      L('Start date', '<input class="gcautai-in" data-v="start" type="date" value="' + esc(e.start) + '">') +
      L('Start time', '<input class="gcautai-in" data-v="time" type="time" value="' + esc(e.time || '07:00') + '">') +
      L('End date', '<input class="gcautai-in" data-v="end" type="date" value="' + esc(e.end) + '">') +
      L('Work days (Mon–Sat)', '<input class="gcautai-in" data-v="days" type="number" min="1" max="120" value="' + esc(e.days || 1) + '">') + '</div>' +
    '<datalist id="_gcVsWho">' + names.map(function(n){ return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>' + foot;
}
function vsRead(c, a){ var e = a.sched || (a.sched = {}); c.querySelectorAll('[data-v]').forEach(function(i){ e[i.getAttribute('data-v')] = i.type === 'checkbox' ? i.checked : i.value; }); e.days = parseInt(e.days, 10) || 0; return e; }
function vsSum(c, a){
  var e = vsRead(c, a), el = c.querySelector('.gcvs-sum');
  if (a.dest === 'mine') { el.textContent = vsOk(e.start) ? vsNice(e.start) + (e.time ? ' · ' + e.time + (e.endTime ? '–' + e.endTime : '') : '') + (e.where ? ' · ' + e.where : '') + (e.invite ? ' · also on ' + e.invite + '’s schedule' : '') : 'Pick the date.'; return; }
  var w = vsWorkDates(e.start, e.days || 1);
  el.textContent = vsOk(e.start) ? (w.length + ' work day' + (w.length === 1 ? '' : 's') + ': ' + vsNice(w[0]) + (w.length > 1 ? ' → ' + vsNice(w[w.length - 1]) : '') + (e.time ? ' · from ' + e.time : '') + (e.who ? ' · ' + e.who : '')) : 'Pick the start date.';
}
function vsBind(ov, acts){
  vsJobLabel(ov);
  ov.querySelectorAll('[data-vs]').forEach(function(c){
    var a = acts.filter(function(x){ return x.id === c.getAttribute('data-vs'); })[0]; if (!a) return;
    var f = function(k){ return c.querySelector('[data-v="' + k + '"]'); }, mine = a.dest === 'mine';
    if (!mine) {
      f('days').oninput = function(){ var n = parseInt(this.value, 10); if (n > 0 && vsOk(f('start').value)) f('end').value = vsEndOf(f('start').value, n); vsSum(c, a); };
      f('end').onchange = function(){ var n = vsDaysBetween(f('start').value, this.value); if (n) f('days').value = n; vsSum(c, a); };
      f('start').onchange = function(){ var st0 = this.value; if (vsOk(st0) && vsDow(st0) === 0) { st0 = vsAdd(st0, 1); this.value = st0; } if (vsOk(st0)) f('end').value = vsEndOf(st0, parseInt(f('days').value, 10) || 1); vsSum(c, a); };
    }
    c.querySelectorAll('[data-v]').forEach(function(i){ if (!i.oninput && !i.onchange) { i.oninput = function(){ vsSum(c, a); }; i.onchange = function(){ vsSum(c, a); }; } });
    vsSum(c, a);
    c.querySelector('[data-vs-cancel]').onclick = function(){
      var i = acts.indexOf(a); if (i >= 0) acts.splice(i, 1); c.remove();
      var msg = ov.querySelector('#_gcMicMsg'); msg.className = 'gcautai-msg'; msg.textContent = (mine ? 'Appointment' : 'Schedule entry') + ' cancelled — nothing was saved.';
      if (!acts.length) { var box = ov.querySelector('#_gcMicActs'); box.innerHTML = ''; }
    };
    c.querySelector('[data-vs-add]').onclick = function(){
      var btn = this, res = c.querySelector('._gcARes'), e = vsRead(c, a), pid = ov.querySelector('#_gcMicJob').value, label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Adding…';
      (mine ? vsSaveMine : vsSave)(e, pid, { by: myName(), byEmail: myEmail(), at: nowIso(), source: 'voice' }, a.text).then(function(r){
        if (r && r.ok) {
          res.className = '_gcARes gcautai-ok'; res.textContent = '✓ ' + r.where; c.classList.add('vsdone'); btn.textContent = '✓ Added'; c.querySelector('[data-vs-cancel]').style.display = 'none';
          log({ what: 'voice', dest: a.dest, pid: pid, ok: true, n: r.items.length });
          toast(mine ? '👤 Added to your schedule' : '📅 Added to the schedule');
          var waiting = ov.querySelector('[data-vs]:not(.vsdone)') || ov.querySelector('[data-a] ._gcAOn:checked');
          if (!waiting) ST(function(){ if (D.getElementById('_gcMicOv') === ov) closeMic(); }, 1400);
        } else { btn.disabled = false; btn.textContent = label; res.className = '_gcARes gcautai-bad'; res.textContent = '⚠ ' + (r && r.error || 'Not added'); }
      });
    };
  });
}
/* 👤 an appointment for the speaker: the title, date / time, where, and the staff said ("with Nick") as invitees */
function vsParseMine(text, base){
  var p = vsParse(text, base), lt = ' ' + low(text) + ' ', inv = [], me = low(myName());
  vsPeople().forEach(function(x){ if (x.kind !== 'staff' || low(x.name) === me) return; if (x.keys.some(function(k){ return new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "(?:'s)?\\b").test(lt); }) && inv.indexOf(x.name) < 0) inv.push(x.name); });
  var title = s(p.title), who = p.whoKind === 'sub' ? s(p.who) : '';
  inv.forEach(function(n){ n.split(/\s+/).forEach(function(w){ title = title.replace(new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "(?:'s)?\\b", 'ig'), ''); }); });
  title = title.replace(/\s+/g, ' ').trim(); if (title) title = title.charAt(0).toUpperCase() + title.slice(1);
  if (!title) title = 'Meeting';
  var withWho = inv.map(function(n){ return n.split(/\s+/)[0]; }).concat(who ? [who] : []);
  if (withWho.length && /^(meeting|call|lunch|breakfast|dinner|walkthrough|walk-through)$/i.test(title)) title += ' with ' + withWho.join(' & ');
  var tm = p.time || '09:00', et = p.endTime && p.endTime > tm ? p.endTime : vsHM(Math.min(23, +tm.slice(0, 2) + 1), tm.slice(3), 'x');
  return { title: title.slice(0, 100), start: p.start, time: tm, endTime: et, where: p.address || '', invite: inv.join(', '), link: false, base: p.base, text: s(text) };
}
/* saved like the Schedule screen's "🔒 Personal (only me)" item: scope 'personal', by = me; never on a portal (private) */
function vsSaveMine(e, pid, st, text){
  try {
    e = e || {}; st = st || { by: myName(), at: nowIso() };
    if (typeof W._setSchedule !== 'function') return Promise.resolve({ ok: false, error: 'The schedule is not ready on this screen yet.' });
    var title = s(e.title); if (!title) return Promise.resolve({ ok: false, error: 'What is it? (e.g. Meeting with Nick)' });
    if (!vsOk(e.start)) return Promise.resolve({ ok: false, error: 'Pick the date.' });
    var tm = /^\d{2}:\d{2}$/.test(s(e.time)) ? s(e.time) : '09:00', et = /^\d{2}:\d{2}$/.test(s(e.endTime)) && s(e.endTime) > tm ? s(e.endTime) : vsHM(Math.min(23, +tm.slice(0, 2) + 1), tm.slice(3), 'x');
    var p = (e.link === true || e.link === 'true' || e.link === 'on') && pid ? proj(pid) : null, me = s(st.by) || myName();
    var bad = [], inv = s(e.invite).split(/\s*[,;&]\s*|\s+and\s+/).map(s).filter(Boolean).map(function(n){ var u = userByName(n); if (!u) bad.push(n); return u; }).filter(function(u){ return u && low(u.name) !== low(me); });
    if (bad.length) return Promise.resolve({ ok: false, error: 'Not on the team: ' + bad.join(', ') + ' (pick a name from the list)' });
    var base = uid('SCH'), type = /meet|call|lunch|breakfast|dinner|interview|walk/i.test(title) ? 'meeting' : 'appointment';
    var row = function(owner, i, extra){ return Object.assign({ id: base + 'p' + i + Math.random().toString(36).slice(2, 5), pid: p ? p.id : '', title: title, date: e.start, time: tm, endTime: et, assignee: owner, vendor: '', type: type,
      address: s(e.where) || (p && p.address) || '', notes: '🎤 ' + s(text).slice(0, 500), scope: 'personal', private: true, internal: true, by: owner, source: 'voice', addedAt: st.at }, extra || {}); };
    var items = [row(me, 0, inv.length ? { invitees: inv.map(function(u){ return s(u.name); }) } : null)].concat(inv.map(function(u, i){ return row(s(u.name), i + 1, { invitedBy: me, notes: 'Invited by ' + me + (s(text) ? ' · 🎤 ' + s(text).slice(0, 400) : '') }); }));
    W._setSchedule(function(prev){ var nx = [].concat(prev || [], items); try { if (W._supaUpsert) W._supaUpsert('schedule', nx); } catch (er) {} try { if (W._gcRecIDBput) W._gcRecIDBput('schedule', nx); } catch (er2) {} return nx; });
    return Promise.resolve({ ok: true, items: items, where: 'My schedule — ' + title + ' · ' + vsNice(e.start) + ' ' + tm + '–' + et + (inv.length ? ' · also on ' + inv.map(function(u){ return s(u.name); }).join(', ') + '’s schedule' : '') });
  } catch (er) { return Promise.resolve({ ok: false, error: er.message }); }
}
/* saved exactly like the job's Schedule tab → "+ Add Schedule Phase / Task" → Add to Schedule */
function vsSave(e, pid, st, text){
  try {
    e = e || {}; st = st || { by: myName(), at: nowIso() };
    var p = proj(pid); if (!p) return Promise.resolve({ ok: false, error: 'Pick the job first.' });
    if (typeof W._setSchedule !== 'function') return Promise.resolve({ ok: false, error: 'The schedule is not ready on this screen yet.' });
    var title = s(e.title); if (!title) return Promise.resolve({ ok: false, error: 'What is the work? (Task)' });
    var start = s(e.start); if (!vsOk(start)) return Promise.resolve({ ok: false, error: 'Pick the start date.' });
    if (vsDow(start) === 0) start = vsAdd(start, 1);
    var days = vsOk(e.end) && e.end >= start ? vsDaysBetween(start, e.end) : 0;
    if (!days) days = Math.max(1, Math.min(120, parseInt(e.days, 10) || 1));
    var dates = vsWorkDates(start, days);
    if (W._gcScheduleDupCheck && !W._gcScheduleDupCheck(p.id, dates, title)) return Promise.resolve({ ok: false, error: 'Not added — it is already on the schedule those days.' });
    var who = vsWho(e.who), vendor = who.kind === 'staff' ? '' : who.name;
    var assignee = who.kind === 'staff' ? who.name : (s(p.pm) || st.by);
    var tm = /^\d{2}:\d{2}$/.test(s(e.time)) ? s(e.time) : '07:00', et = /^\d{2}:\d{2}$/.test(s(e.endTime)) && s(e.endTime) > tm ? s(e.endTime) : '17:00';
    if (et <= tm) et = tm;
    var gid = dates.length > 1 ? uid('GRP') : null, base = uid('SCH');
    var items = dates.map(function(dt, i){ return { id: base + i + Math.random().toString(36).slice(2, 5), pid: p.id, title: title, date: dt, time: tm, endTime: et, assignee: assignee, vendor: vendor, type: 'work', address: p.address || '',
      notes: vendor ? 'Sub: ' + vendor : '', scope: 'company', by: st.by, groupId: gid, dayNum: gid ? i + 1 : undefined, totalDays: gid ? dates.length : undefined,
      source: 'voice', voiceNote: s(text).slice(0, 1000), addedAt: st.at }; });
    W._setSchedule(function(prev){ var nx = [].concat(prev || [], items); try { if (W._supaUpsert) W._supaUpsert('schedule', nx); } catch (er) {} try { if (W._gcRecIDBput) W._gcRecIDBput('schedule', nx); } catch (er2) {} return nx; });
    return Promise.resolve({ ok: true, items: items, where: 'Schedule — ' + title + (who.name ? ' (' + who.name + ')' : '') + ' · ' + dates.length + ' work day' + (dates.length === 1 ? '' : 's') + ' from ' + vsNice(dates[0]) + ' ' + tm + (dates.length > 1 ? ' to ' + vsNice(dates[dates.length - 1]) : '') + ' — ' + p.name });
  } catch (er) { return Promise.resolve({ ok: false, error: er.message }); }
}
/* GrayCo Field: a "📅 Schedule" button in each job's tool grid → this sheet on that job, Schedule picked */
(function reg(n){ var T = W._gcFieldTools; if (T && typeof T.register === 'function') { T.register({ id: 'vsched', icon: '📅', label: 'Schedule', group: 'small', order: 101, needsSigned: false, run: function(p){ openMic(p.id, { dest: 'sched' }); } }); return; } if (n < 180) ST(function(){ reg(n + 1); }, 1000); })(0);
W._gcVoiceSched = { parse: vsParse, looks: vsLooks, looksAppt: vsLooksAppt, want: vsWant, parseMine: vsParseMine, saveMine: function(e, pid){ return vsSaveMine(e, pid, null, e && e.text); }, save: function(e, pid){ return vsSave(e, pid, null, e && e.text); }, workDates: vsWorkDates, today: vsToday, who: vsWho };

/* ── where each action lands ── */"""
src = once(src, "/* ── where each action lands ── */", JS)

# 8. the schedule change history + portals (its own script, after GrayCo Field)
HIST = open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), 'voicesched_hist.html'), encoding='utf-8').read()
src = once(src, '<script id="gc-patch-PRODSRC">', HIST.rstrip('\n') + '\n<script id="gc-patch-PRODSRC">')

# 9. the header comment and the in-app help
src = once(src, "Message a person · Change-order draft · Daily log ·", "Message a person · Change-order draft · Daily log · 📅 Schedule (patch VOICESCHED) ·")
src = once(src, "Message a person, Change-order draft or Daily log.", "Message a person, Change-order draft, Daily log or 📅 Schedule (“Julio framing Monday 8am for 3 days” → a schedule entry, after you check it).")

open(path, 'w', encoding='utf-8').write(src)
print('VOICESCHED: patched')
