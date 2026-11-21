#!/usr/bin/env python3
"""Idempotent patch SPEAKTILE: the 🎤 Speak tile on GrayCo Field's home (owner 11/21: "Where View as is, make that the speak
button so I can speak notes, schedule, messages to jobs etc. ... puts my message and schedule, adds appointment, adds etc.
anything into the CRM in the correct spot").

1. GrayCo Field home: the admin's "👁 View as…" tile becomes "🎤 Speak" (Notes · schedule · messages · leads); PMs (and the
   insurance PM), estimators and the office get it too. A tap opens patch AUTAI's ONE 🎤 sheet and starts listening at once
   (the phone's speech recognition where it works, else the box is focused for the keyboard's 🎤). 👁 View as… stays in 💎 and
   on the desk header.
2. The sheet routes three more places, each with the creator its own tile uses:
     📅 New appointment (estimate / site visit / inspection / walkthrough) -> patch PMFIELD's New appointment record (the same
        apptRec, the same save, a new customer through patch CC2), on the calendar (and Google Calendar when connected);
     ➕ New lead -> Leads, the ＋ New lead form's record (patch CC2 stamps whose lead it is, as for the form);
     🧾 Expense note -> a pending expense on the job (the receipt photo later from 🧾 Snap a receipt).
   Said without the AI (or before it answers): a lead / an expense / a customer appointment is recognised on the phone;
   "Note on <job>: ..." picks that job; dates / times ("Tuesday at 2") are real dates in America/Chicago. voice-intake.js
   (✨ Smart route) knows the new kinds too (appointment, lead, expense, schedule_work, my_schedule).
   Every action is shown with its place and its fields before Post (editable); nothing is posted before Post; nobody is
   contacted (data-entry mode rules unchanged). The sheet is light.
"""
import sys, os
here = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'index.html')
src = open(path, encoding='utf-8').read()
MARK = '/* SPEAKTILE: '
if MARK in src:
    print('already patched'); sys.exit(0)
assert 'gc-patch-autai' in src and '__GC_PATCH_FIELDMORE__' in src and 'W._gcPmField = {' in src


def once(s, old, new):
    assert s.count(old) == 1, ('anchor count != 1', old[:90], s.count(old))
    return s.replace(old, new)


def between(s, start, end):
    i = s.index(start); assert s.count(start) == 1, start[:60]
    j = s.index(end, i) + len(end)
    return s[i:j]

# ───────────────────────── AUTAI: the sheet ─────────────────────────
src = once(src, "  ['sched', '📅 Schedule'], ['mine', '👤 My schedule']   /* patch VOICESCHED */\n];",
    "  ['sched', '📅 Schedule'], ['mine', '👤 My schedule'],   /* patch VOICESCHED */\n"
    "  ['appt', '📅 New appointment'], ['lead', '➕ New lead'], ['expense', '🧾 Expense note']   /* SPEAKTILE: the tiles' own records */\n];")
src = once(src, "message: 'message', announcement: 'announce' };",
    "message: 'message', announcement: 'announce', appointment: 'appt', lead: 'lead', expense: 'expense', schedule_work: 'sched', my_schedule: 'mine' };   /* SPEAKTILE: */")
src = once(src, "q('#_gcMicJob').onchange = function(){ lsSet('gc_autai_lastpid', this.value); vsJobLabel(ov); };",
    "q('#_gcMicJob').onchange = function(){ ov.__state.jobTouched = true; /* SPEAKTILE: a job picked by hand is kept */ lsSet('gc_autai_lastpid', this.value); vsJobLabel(ov); };")
src = once(src, "  /* optional: a recording sent for transcription (only when the server has a transcription key) */",
    "  /* SPEAKTILE: opened from 🎤 Speak — listening starts at once (the phone's speech recognition; else the keyboard's 🎤) */\n"
    "  if (preset && preset.listen) { ov.__state.speak = true; ov.setAttribute('data-speak', '1'); if (speechUsable()) { try { recBtn.onclick(); } catch (e) {} } else { try { ta.focus(); } catch (e) {} } }\n"
    "  /* optional: a recording sent for transcription (only when the server has a transcription key) */")
src = once(src, "people: peopleNames(), today: today() }).then(function(j){",
    "people: peopleNames(), today: vsToday() /* SPEAKTILE: Central time */ }).then(function(j){")
src = once(src, "people: peopleNames(), today: today() }); },", "people: peopleNames(), today: vsToday() }); },")
old_m = between(src, "  var acts = Object.keys(ov.__state.sel).filter(function(k){ return ov.__state.sel[k]; }).map(function(d, i){", "renderActs(ov, acts, null);")
assert old_m.count('\n') == 2, old_m
src = once(src, old_m,
    "  var jf = stJobFromText(ov, text); if (jf.text) text = jf.text;   /* SPEAKTILE: \"Note on <job>: …\" → that job */\n" +
    old_m.replace("due: '', price: null", "due: (d === 'todo' || d === 'message') ? stDue(text) : '', price: null").replace("renderActs(ov, acts, null);", "renderActs(ov, acts, jf.note || null);"))
src = once(src, "  var jsel = ov.querySelector('#_gcMicJob'), note = '';",
    "  var jsel = ov.querySelector('#_gcMicJob'), note = '';\n"
    "  if (!r.jobId) { var jf0 = stJobFromText(ov, s(ov.querySelector('#_gcMicText').value)); if (jf0.note) note = jf0.note; }   /* SPEAKTILE: the job named, without the AI */")
src = once(src, "scheduleItem: s(a.scheduleItem), newDate: s(a.newDate) }; });", "scheduleItem: s(a.scheduleItem), newDate: s(a.newDate), ai: a }; });   /* SPEAKTILE: + the AI's fields */")
src = once(src, "    if (a.dest === 'schedule') extra = '<div class=\"gcautai-grid\">",
    "    if (ST_DEST[a.dest]) extra = stExtra(ov, a);   /* SPEAKTILE: */\n    if (a.dest === 'schedule') extra = '<div class=\"gcautai-grid\">")
src = once(src, "    if (a.dest === 'sched') return vsSave(a.sched || vsParse(t), pid, st, t);   /* patch VOICESCHED */",
    "    if (a.dest === 'appt') return stAppt(a, pid, st);   /* SPEAKTILE: */\n"
    "    if (a.dest === 'lead') return stLead(a, st);\n"
    "    if (a.dest === 'expense') return stExpense(a, pid, st);\n"
    "    if (a.dest === 'sched') return vsSave(a.sched || vsParse(t), pid, st, t);   /* patch VOICESCHED */")
src = once(src, "function vsWant(text){ return vsLooksAppt(text) ? 'mine' : vsLooks(text) ? 'sched' : ''; }",
    "function vsWant(text){ return stWant(text) || (vsLooksAppt(text) ? 'mine' : vsLooks(text) ? 'sched' : ''); }   /* SPEAKTILE: a lead / an expense / a customer appointment first */")
src = once(src, "  if (!want) return acts;", "  if (!want) return acts;\n  if (ST_DEST[want]) return acts;   /* SPEAKTILE: the AI names these itself; without it the picked chip is used */")
src = once(src, "  mic: function(pid, preset){ return openMic(pid, preset); }, closeMic: closeMic,",
    "  mic: function(pid, preset){ return openMic(pid, preset); }, closeMic: closeMic,\n"
    "  speak: function(pid){ return openMic(pid != null ? pid : null, { listen: true }); }, want: function(t){ return vsWant(t); }, fill: function(t, dest){ var a = { dest: dest || stWant(t), text: t }; stFill(a, ''); return a; },   /* SPEAKTILE */")

ST_JS = r"""/* ════════ SPEAKTILE: 📅 New appointment · ➕ New lead · 🧾 Expense note — each saved by the creator its own tile uses ════════ */
var ST_DEST = { appt: 1, lead: 1, expense: 1 };
var ST_KINDS = ['Estimate', 'Site visit', 'Inspection', 'Walkthrough', 'Meeting'];
var ST_KIND_RE = /\b(estimates?|bid|site visit|inspections?|inspect|walk[\s-]?throughs?|consultation|consult)\b/;
var ST_LEAD_RE = /\b(?:new|add(?:\s+a)?|got\s+a(?:\s+new)?|have\s+a(?:\s+new)?)\s+lead\b|^\s*lead\s*[:\-–]/i;
var ST_TYPES = ['Residential Reno', 'Roofing', 'Kitchen', 'Bath', 'Addition', 'Whole-Home Reno', 'Insurance Claim', 'Mitigation', 'Environmental', 'Commercial', 'Other'];
var ST_CATS = ['Materials', 'Fuel', 'Tools', 'Equipment rental', 'Dump fees', 'Meals', 'Other'];
VS_HINT.appt = '📅 Sounds like an appointment (estimate / inspection / walkthrough) — Send to: New appointment (tap another place to change).';
VS_HINT.lead = '➕ Sounds like a new lead — Send to: New lead (tap another place to change).';
VS_HINT.expense = '🧾 Sounds like an expense — Send to: Expense note (tap another place to change).';
var ST_STOP = {}; 'at on for to about around in from by the a an and regarding re this next tomorrow today tonight noon morning afternoon evening am pm o\'clock oclock please sunday monday tuesday wednesday thursday friday saturday sun mon tue tues wed thu thur thurs fri sat january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec who whose that is'.split(' ').forEach(function(w){ ST_STOP[w] = 1; });
function stDated(t){ var lt = ' ' + low(t) + ' '; return VS_DATES.some(function(r){ r[0].lastIndex = 0; var hit = r[0].test(lt); r[0].lastIndex = 0; return hit; }); }
function stDue(t){ if (!stDated(t)) return ''; var p = vsParse(t); return vsOk(p.start) ? p.start : ''; }
function stMoney(t){ var m = /\$\s?(\d[\d,]*(?:\.\d{1,2})?)|\b(\d[\d,]*(?:\.\d{1,2})?)\s*(?:dollars|bucks)\b/i.exec(s(t)); return m ? num(m[1] || m[2]) : 0; }
function stPhone(t){ var m = /(?:\+?1[\s.-]?)?\(?\b(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/.exec(s(t)); return m ? { v: m[1] + '-' + m[2] + '-' + m[3], i: m.index, n: m[0].length } : null; }
function stEmail(t){ var m = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(s(t)); return m ? low(m[0]) : ''; }
function stTitle(w){ return w.replace(/\b[a-z]/g, function(c){ return c.toUpperCase(); }); }
var ST_SUF = /^(st|street|rd|road|ave|avenue|av|dr|drive|ln|lane|ct|court|blvd|boulevard|cv|cove|pkwy|parkway|way|pl|place|cir|circle|trl|trail|hwy|highway|ter|terrace|loop|pike)\.?$/i;
function stAddr(t){
  var m = /\b(\d{2,6})\s+((?:[NSEW]\.?\s+)?[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,4})/.exec(s(t)); if (!m) return '';
  var w = m[2].split(/\s+/), out = [];
  for (var i = 0; i < w.length; i++) { if (ST_STOP[low(w[i])] && out.length) break; out.push(w[i]); if (ST_SUF.test(w[i]) && out.length > 1) return stTitle(m[1] + ' ' + out.join(' ')); }
  return stTitle(m[1] + ' ' + out.slice(0, /^[NSEW]\.?$/i.test(out[0]) ? 2 : 1).join(' '));
}
function stNormAddr(a){ var m = /(\d+)\s+(?:[nsew]\.?\s+)?([a-z]+)/.exec(low(a).split(',')[0]); return m ? m[1] + ' ' + m[2] : ''; }
function stDigits(v){ return s(v).replace(/\D/g, '').slice(-10); }
/* "… with John Smith Tuesday …" → John Smith */
function stWho(t){
  var m = /\bwith\s+(?:the\s+)?(?:customer|homeowner|client|owner)?\s*(.+)$/i.exec(s(t)); if (!m) return '';
  var out = []; m[1].split(/[\s,.;:!?]+/).some(function(w){ var lw = low(w).replace(/'s$/, ''); if (!w || ST_STOP[lw] || /\d/.test(w) || out.length >= 3) return true; out.push(w); return false; });
  return stTitle(out.join(' '));
}
function stKind(t){ var m = ST_KIND_RE.exec(low(t)); if (!m) return 'Meeting'; var k = m[1]; return /^(estimate|bid|consult)/.test(k) ? 'Estimate' : /site/.test(k) ? 'Site visit' : /^inspect/.test(k) ? 'Inspection' : /^walk/.test(k) ? 'Walkthrough' : 'Meeting'; }
function stLeadType(t){ var l = low(t);
  return /mold|asbestos|lead paint|abatement/.test(l) ? 'Environmental' : /water damage|flood|burst|pipe broke|dry ?out|mitigation/.test(l) ? 'Mitigation' : /insurance|claim|hail|storm damage/.test(l) ? 'Insurance Claim' :
    /roof|shingle|gutter/.test(l) ? 'Roofing' : /kitchen/.test(l) ? 'Kitchen' : /bath|shower/.test(l) ? 'Bath' : /addition/.test(l) ? 'Addition' : /whole[- ]home|whole house/.test(l) ? 'Whole-Home Reno' : /commercial|office building|warehouse|store front|storefront/.test(l) ? 'Commercial' : 'Residential Reno'; }
/* what was said → which of the three (without the AI) */
function stWant(text){
  var t = s(text), lt = low(t); if (t.length < 6) return '';
  if (ST_LEAD_RE.test(t)) return 'lead';
  if (stMoney(t) && /\b(spent|spend|paid|pay|bought|buy|receipt|purchas\w*|charged|cost|costs)\b/.test(lt)) return 'expense';
  if (ST_KIND_RE.test(lt) && !/\b(send|sent|e-?mail\w*|text\w*|finish\w*|did|done|wrote|write up|price\w*)\b[^.]*\b(estimate|bid)\b|\b(estimate|bid)\b[^.]*\b(sent|approved|signed|accepted|declined|was|came)\b/.test(lt)) {
    var p = vsParse(t);
    if ((stDated(t) || p.time) && vsOk(p.start) && p.start >= p.base && !/\b(yesterday|last week)\b/.test(lt)) return 'appt';
  }
  return '';
}
function stLeads(){ var l = []; try { l = typeof W._gcLaLeads === 'function' ? arr(W._gcLaLeads()) : []; } catch (e) {} if (!l.length) l = arr(crm().leads); return l.filter(function(x){ return x.deleted !== true && !x.converted; }); }
function stSeesAll(){ try { if (typeof W._gcProjSeesAll === 'function') return !!W._gcProjSeesAll(); } catch (e) {} return isAdmin() || isOffice(); }
function stMineLead(l){ var n = low(myName()); return stSeesAll() || [l.pm, l.estimator, l.assignedTo, l.createdBy, l.addedBy, l.leadOwner].some(function(v){ return low(v) === n; }); }
/* the job said ("Note on Druluck: …", a customer's name, a street, a PO) */
var ST_GENJOB = { job: 1, jobs: 1, demo: 1, house: 1, home: 1, remodel: 1, reno: 1, kitchen: 1, bath: 1, bathroom: 1, roof: 1, roofing: 1, residence: 1, project: 1, sample: 1, repair: 1, repairs: 1, the: 1, and: 1, addition: 1, basement: 1, deck: 1, water: 1, damage: 1 };
function stFindJob(text){
  var t = ' ' + low(text).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ') + ' ', best = null, bs = 0, tie = false;
  var list = (isAdmin() || isOffice()) ? projects().filter(activeJob) : myJobs();
  list.forEach(function(p){
    var sc = 0, has = function(w){ return w && t.indexOf(' ' + w + ' ') >= 0; };
    var st0 = /^\s*(\d+)\s+([a-z]+)/.exec(low(p.address)); if (st0 && has(st0[1]) && has(st0[2])) sc += 3;
    if (s(p.autoPO || p.po) && has(low(p.autoPO || p.po).replace(/[^a-z0-9]/g, ''))) sc += 3;
    low(p.client).replace(/[^a-z ]/g, ' ').split(/\s+/).filter(function(w){ return w.length > 2 && !ST_GENJOB[w]; }).forEach(function(w, i, a){ if (has(w)) sc += i === a.length - 1 ? 2 : 1; });
    var nm = low(p.name).replace(/[^a-z ]/g, ' ').split(/\s+/).filter(function(w){ return w.length > 3 && !ST_GENJOB[w]; });
    if (nm.some(has)) sc += 2;
    if (sc > bs) { bs = sc; best = p; tie = false; } else if (sc && sc === bs) tie = true;
  });
  return bs >= 2 && !tie ? best : null;
}
function stJobFromText(ov, text){
  var out = { note: '', text: '' }, st = ov.__state || {}, jsel = ov.querySelector('#_gcMicJob');
  if (st.jobTouched || !jsel) return out;
  var hit = stFindJob(text); if (!hit) return out;
  if (String(jsel.value) !== String(hit.id)) {
    if (!jsel.querySelector('option[value="' + CSS.escape(String(hit.id)) + '"]')) { var o = D.createElement('option'); o.value = hit.id; o.textContent = hit.name; jsel.appendChild(o); }
    jsel.value = hit.id; vsJobLabel(ov); out.note = '🔎 Job found in what you said: ' + hit.name + ' — change it above if that is wrong.';
  }
  var m = /^\s*(?:(?:add|put|make|leave)\s+(?:a\s+)?)?(?:job\s+)?(?:note|update)\s+(?:on|for|to)\s+(?:the\s+)?([^:,.;\-–]{2,60}?)\s*(?:job\s*)?[:,.;\-–]\s*/i.exec(s(text));
  if (m && s(text).slice(m[0].length)) out.text = s(text).slice(m[0].length);
  return out;
}
/* the fields of a card: from the AI when it answered, else read from the words */
function stFill(a, pid){
  if (a.stf === a.dest) return a; a.stf = a.dest;
  var ai = a.ai || {}, t = s(a.text), ph = stPhone(t), p = vsParse(t);
  if (a.dest === 'appt') {
    a.apKind = ST_KINDS.indexOf(s(ai.apptKind)) >= 0 ? s(ai.apptKind) : stKind(t);
    a.apDate = vsOk(ai.date) ? s(ai.date) : (vsOk(p.start) ? p.start : vsToday());
    a.apTime = /^\d{2}:\d{2}$/.test(s(ai.time)) ? s(ai.time) : (p.time || '09:00');
    a.apEnd = /^\d{2}:\d{2}$/.test(s(ai.endTime)) ? s(ai.endTime) : (p.endTime || '');
    a.apWho = s(ai.contactName) || stWho(t); a.apPhone = s(ai.phone) || (ph ? ph.v : ''); a.apAddr = s(ai.address) || p.address || stAddr(t); a.apFor = '';
    a.apWith = stWith(a, pid);
  } else if (a.dest === 'lead') {
    var body = t.replace(/^\s*(?:(?:add|new|got|have|there'?s)\s+(?:a\s+)?(?:new\s+)?lead\b(?:\s+(?:for|named|called|from|is))?|lead\s*[:\-–])\s*[:,\-–]?\s*/i, '');
    var nm = s(ai.contactName), need = body;
    if (!nm) { if (ph && body.indexOf(t.slice(ph.i, ph.i + ph.n)) > 0) nm = body.slice(0, body.indexOf(t.slice(ph.i, ph.i + ph.n))); else nm = body.split(/[,.;]|\s+(?:at|on|needs?|wants?|about|for|has|with|called)\s+/i)[0]; nm = stTitle(s(nm).split(/\s+/).slice(0, 3).join(' ')).replace(/[,.;:]+$/, ''); }
    if (ph) need = need.replace(t.slice(ph.i, ph.i + ph.n), ' ');
    if (nm) need = need.replace(new RegExp('^\\s*' + nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i'), '');
    var em = s(ai.email) || stEmail(t); if (em) need = need.replace(new RegExp(em.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');
    a.ldName = nm; a.ldPhone = s(ai.phone) || (ph ? ph.v : ''); a.ldEmail = em; a.ldAddr = s(ai.address) || stAddr(ph ? t.replace(t.slice(ph.i, ph.i + ph.n), ' ') : t);
    if (a.ldAddr) need = need.replace(new RegExp(a.ldAddr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');
    a.ldType = stLeadType(t); a.ldHeard = '';
    need = s(need.replace(/\s+/g, ' ').replace(/^[\s,.;:\-–]+|[\s,.;:\-–]+$/g, '')); if (need && !ai.contactName) a.text = need.charAt(0).toUpperCase() + need.slice(1);
  } else if (a.dest === 'expense') {
    a.exAmt = ai.amount != null && num(ai.amount) > 0 ? String(num(ai.amount)) : (stMoney(t) ? String(stMoney(t)) : '');
    var vm = /\b(?:at|from)\s+((?:home depot|lowe'?s|menards|ace hardware|sherwin[- ]williams|[A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,2}))/i.exec(t);
    a.exVendor = s(ai.vendor) || (vm ? stTitle(vm[1]) : ''); a.exCat = /gas|fuel|diesel/i.test(t) ? 'Fuel' : /dump|landfill/i.test(t) ? 'Dump fees' : /lunch|dinner|breakfast|meal|food/i.test(t) ? 'Meals' : /rent(al)?\b/i.test(t) ? 'Equipment rental' : /tool|drill|saw/i.test(t) ? 'Tools' : 'Materials';
    a.exDate = vsOk(ai.date) ? s(ai.date) : (stDated(t) && vsOk(p.start) && p.start <= p.base ? p.start : vsToday());
  }
  return a;
}
function stWith(a, pid){
  var n = low(a.apWho), ph = stDigits(a.apPhone), ad = stNormAddr(a.apAddr);
  var l = stLeads().filter(function(x){ return (ph.length === 10 && stDigits(x.phone) === ph) || (ad && stNormAddr(x.address || x.jobAddress) === ad) || (n.length > 3 && low(x.client || x.contactName || x.name) === n); })[0];
  if (l && stMineLead(l)) return 'l:' + l.id;
  var j = projects().filter(activeJob).filter(function(p){ return (ad && stNormAddr(p.address) === ad) || (n.length > 3 && low(p.client) === n); })[0];
  if (j) return 'j:' + j.id;
  if (a.apWho || a.apAddr || a.apPhone) return 'new';
  return pid && proj(pid) ? 'j:' + pid : 'new';
}
function stL(t, inner){ return '<label class="gcst-l">' + t + inner + '</label>'; }
function stOpt(v, l, on){ return '<option value="' + esc(v) + '"' + (on ? ' selected' : '') + '>' + esc(l) + '</option>'; }
function stExtra(ov, a){
  var pid = ov.querySelector('#_gcMicJob').value; stFill(a, pid);
  var inp = function(f, ph, type, extra){ return '<input class="gcautai-in" data-f="' + f + '"' + (type ? ' type="' + type + '"' : '') + ' placeholder="' + esc(ph || '') + '" value="' + esc(a[f]) + '"' + (extra || '') + '>'; };
  if (a.dest === 'appt') {
    var w = s(a.apWith), J = myJobs().slice(0, 60), Ls = stLeads().filter(stMineLead).slice(0, 60);
    if (/^j:/.test(w) && !J.some(function(p){ return 'j:' + p.id === w; }) && proj(w.slice(2))) J.unshift(proj(w.slice(2)));
    if (/^l:/.test(w) && !Ls.some(function(l){ return 'l:' + l.id === w; })) { var l0 = stLeads().filter(function(l){ return 'l:' + l.id === w; })[0]; if (l0) Ls.unshift(l0); }
    return '<div class="gcautai-grid">' +
      stL('What', '<select class="gcautai-sel" data-f="apKind">' + ST_KINDS.map(function(k){ return stOpt(k, k, k === a.apKind); }).join('') + '</select>') +
      stL('With', '<select class="gcautai-sel" data-f="apWith">' + stOpt('new', '＋ A new customer', w === 'new') +
        (Ls.length ? '<optgroup label="Leads">' + Ls.map(function(l){ return stOpt('l:' + l.id, s(l.client || l.contactName || l.name) + (l.address ? ' — ' + s(l.address).slice(0, 26) : ''), w === 'l:' + l.id); }).join('') + '</optgroup>' : '') +
        (J.length ? '<optgroup label="Jobs">' + J.map(function(p){ return stOpt('j:' + p.id, s(p.name) + (p.address ? ' — ' + s(p.address).slice(0, 26) : ''), w === 'j:' + p.id); }).join('') + '</optgroup>' : '') + '</select>') +
      stL('Customer (new)', inp('apWho', 'Name')) + stL('Phone (new)', inp('apPhone', 'Phone', 'tel')) + stL('Address', inp('apAddr', 'Address')) +
      stL('Date', inp('apDate', '', 'date')) + stL('Time', inp('apTime', '', 'time')) + stL('Ends (optional)', inp('apEnd', '', 'time')) +
      (stSeesAll() ? stL('For (blank = me)', inp('apFor', myName(), '', ' list="_gcMicPeople"')) : '') + '</div>' +
      '<div class="gcst-sum">📅 ' + esc(a.apKind) + ' · ' + esc(vsNice(a.apDate)) + ' ' + esc(a.apTime) + ' — goes on the calendar like 📅 New appointment (and Google Calendar when it is connected). Nobody is contacted.</div>';
  }
  if (a.dest === 'lead') return '<div class="gcautai-grid">' + stL('Name', inp('ldName', 'Customer name')) + stL('Phone', inp('ldPhone', 'Phone', 'tel')) + stL('E-mail', inp('ldEmail', 'E-mail', 'email')) + stL('Address', inp('ldAddr', 'Address')) +
      stL('Type', '<select class="gcautai-sel" data-f="ldType">' + ST_TYPES.map(function(k){ return stOpt(k, k, k === a.ldType); }).join('') + '</select>') + stL('How did they hear of us?', inp('ldHeard', 'e.g. Referral, Google')) + '</div>' +
      '<div class="gcst-sum">➕ Goes into Leads like ＋ New lead (the box above = what they need). Nobody is contacted.</div>';
  if (a.dest === 'expense') return '<div class="gcautai-grid">' + stL('Amount $', inp('exAmt', '0.00', '', ' inputmode="decimal"')) + stL('Vendor / store', inp('exVendor', 'e.g. Home Depot')) +
      stL('Category', '<select class="gcautai-sel" data-f="exCat">' + ST_CATS.map(function(k){ return stOpt(k, k, k === a.exCat); }).join('') + '</select>') + stL('Date', inp('exDate', '', 'date')) + '</div>' +
      '<div class="gcst-sum">🧾 A pending expense on the job above — the receipt photo can follow from 🧾 Snap a receipt.</div>';
  return '';
}
/* 📅 → patch PMFIELD's New appointment (the same record, the same save) */
function stAppt(a, pid, st){
  var P = W._gcPmField; if (!P || typeof P.addAppt !== 'function') return Promise.resolve({ ok: false, error: 'The schedule is not on this phone yet.' });
  if (!vsOk(a.apDate)) return Promise.resolve({ ok: false, error: 'Pick the date.' });
  return P.addAppt({ ak: a.apKind, with: s(a.apWith) || 'new', cname: a.apWho, cphone: a.apPhone, caddr: a.apAddr, date: a.apDate, time: a.apTime, etime: a.apEnd, for: a.apFor, notes: '🎤 ' + s(a.text).slice(0, 500), source: 'voice' }).then(function(r){
    if (!r || !r.ok) return r || { ok: false, error: 'Not saved' };
    return { ok: true, rec: r.rec, where: 'Calendar — ' + s(r.rec.title) + ' · ' + vsNice(a.apDate) + (r.rec.time ? ' ' + r.rec.time : '') + (r.rec.address ? ' · ' + r.rec.address : '') };
  }, function(e){ return { ok: false, error: e && e.message || 'Not saved' }; });
}
/* ➕ → Leads: the ＋ New lead form's record, through the leads list's own setter (patch CC2 stamps whose lead it is) */
function stLead(a, st){
  var name = s(a.ldName), ph = s(a.ldPhone), ad = s(a.ldAddr), need = s(a.text), heard = s(a.ldHeard);
  if (!name && !ph && !ad) return Promise.resolve({ ok: false, error: 'Who is the lead? (a name, phone or address)' });
  if (typeof W._setLeads !== 'function') return Promise.resolve({ ok: false, error: 'Leads are not ready on this phone yet.' });
  var at = st.at, d = vsToday(), co = 'construction'; try { var f = W._gcCo && W._gcCo.filter(); if (f && f !== 'all') co = f; } catch (e) {}
  var L = { id: uid('LEAD'), name: name || ph || ad, client: name, contactName: name, contact: name, phone: ph, email: low(a.ldEmail), address: ad, type: s(a.ldType) || 'Residential Reno', companyId: co,
    stage: 'New Lead', status: 'new', priority: 'Medium', estVal: 0, estValue: 0, source: heard, howHeard: heard, scope: need, message: need,
    notes: '[' + (+d.slice(5, 7)) + '/' + (+d.slice(8, 10)) + ' ' + st.by + '] 🎤 ' + need, date: d, created: d, createdAt: at, updatedAt: at, receivedAt: at, origin: 'voice', voiceNote: need.slice(0, 1000) };
  try { W.__GC_MANUAL_SAVE__ = true; if (W._gcManualNow) W._gcManualNow('voice lead'); } catch (e) {}
  try { W._setLeads(function(prev){ prev = Array.isArray(prev) ? prev : []; return prev.some(function(x){ return x && x.id === L.id; }) ? prev : [L].concat(prev); }); } catch (e) { return Promise.resolve({ ok: false, error: e.message }); }
  try { if (W._crm && Array.isArray(W._crm.leads) && !W._crm.leads.some(function(x){ return x && x.id === L.id; })) W._crm.leads = [L].concat(W._crm.leads); } catch (e) {}
  ST(function(){ try { W.__GC_MANUAL_SAVE__ = false; } catch (e) {} }, 1500);
  return Promise.resolve({ ok: true, lead: L, where: 'Leads — ' + L.name + ' · New lead (nobody was contacted)' });
}
/* 🧾 → a pending expense on the job (the expenses list's own setter; Log Expense's record, waiting for review) */
function stExpense(a, pid, st){
  var p = proj(pid); if (!p) return Promise.resolve({ ok: false, error: 'Pick the job first.' });
  var amt = num(a.exAmt); if (!(amt > 0)) return Promise.resolve({ ok: false, error: 'How much? (Amount $)' });
  if (typeof W._setExpenses !== 'function') return Promise.resolve({ ok: false, error: 'Expenses are not ready on this phone yet.' });
  var v = s(a.exVendor), exp = { id: uid('EXP'), pid: String(p.id), type: 'expense', vendor: v || '(voice note)', desc: '🎤 ' + s(a.text).slice(0, 300), amt: Math.round(amt * 100) / 100, category: s(a.exCat) || 'Materials',
    status: 'pending', needsReview: true, confirmed: false, date: vsOk(a.exDate) ? a.exDate : vsToday(), source: 'voice', by: st.by, at: st.at };
  try { W.__GC_MANUAL_SAVE__ = true; W._setExpenses(function(prev){ return arr(prev).concat([exp]); }); } catch (e) { return Promise.resolve({ ok: false, error: e.message }); }
  ST(function(){ try { W.__GC_MANUAL_SAVE__ = false; } catch (e) {} }, 1500);
  return Promise.resolve({ ok: true, exp: exp, where: 'Expense ' + money(exp.amt) + (v ? ' · ' + v : '') + ' — ' + p.name + ' (pending review)' });
}
/* the look: a light sheet (no navy), the Speak tile */
(function(){
  if (D.getElementById('gcspeak-css')) return;
  var st = D.createElement('style'); st.id = 'gcspeak-css';
  st.textContent = '#_gcMicOv{background:rgba(15,23,42,.38)}#_gcMicOv .gcautai-sheet{background:#fff;color:#0f172a;box-shadow:0 -10px 30px rgba(15,23,42,.18)}' +
    '#_gcMicOv .gcautai-x{background:#f1f5f9;color:#0f172a;border:1px solid #e2e8f0}#_gcMicOv .gcautai-l,#_gcMicOv .gcst-l{color:#64748b}' +
    '#_gcMicOv .gcautai-sel,#_gcMicOv .gcautai-in,#_gcMicOv .gcautai-ta{background:#fff;color:#0f172a;border:1px solid #cbd5e1}' +
    '#_gcMicOv .gcautai-chip{background:#f8fafc;color:#334155;border-color:#cbd5e1}#_gcMicOv .gcautai-chip.on{background:#2563eb;border-color:#2563eb;color:#fff}' +
    '#_gcMicOv .gcautai-btn{background:#e2e8f0;color:#0f172a}#_gcMicOv .gcautai-btn.go{background:#16a34a;color:#fff}#_gcMicOv .gcautai-btn.ai{background:#7c3aed;color:#fff}' +
    '#_gcMicOv .gcautai-act{background:#f8fafc;border-color:#e2e8f0;color:#0f172a}#_gcMicOv .gcautai-hint{color:#b45309}#_gcMicOv .gcautai-ok{color:#15803d}#_gcMicOv .gcautai-bad{color:#b91c1c}' +
    '#_gcMicOv [style*="#9fb3c8"]{color:#64748b!important}#_gcMicOv [style*="#cbd5e1"]{color:#334155!important}#_gcMicOv [style*="#a5b4fc"],#_gcMicOv [style*="165, 180, 252"]{color:#4338ca!important}' +
    '.gcst-l{display:block;font-size:12px;font-weight:700}.gcst-sum{font-size:13px;margin-top:6px;color:#475569}' +
    '#_gcMicOv .gcautai-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}#_gcMicOv .gcautai-grid>label{display:flex!important;flex-direction:column;gap:3px;min-width:0;text-align:left;align-items:stretch}#_gcMicOv ._gcAOn{-webkit-appearance:checkbox!important;appearance:auto!important;opacity:1!important;accent-color:#16a34a;flex:0 0 auto}' +
    '#_gcMicOv .gcautai-grid>label>input,#_gcMicOv .gcautai-grid>label>select{width:100%;min-width:0;max-width:100%;box-sizing:border-box;padding:9px;font-size:16px}' +
    '.gc-ra-qb small.gc-ra-sub{display:block;font:600 10px Inter,sans-serif;color:#6b7280;line-height:1.2}.gc-ra-qb[data-ra-a="speak"]{background:#fff5f5;border-color:#fecaca}.fh-tile.speak{background:#fff5f5;border-color:#fecaca}';
  (D.head || D.documentElement).appendChild(st);
})();

"""
src = once(src, "/* ── where each action lands ── */", ST_JS + "/* ── where each action lands ── */")

# ───────────────────────── PMFIELD: New appointment, one record builder, callable ─────────────────────────
old_a = between(src, "  if (kind === 'appt') {\n    var ak = segv(o, 'ak') || 'Estimate'", "    up.push(rec);\n  } else {")
assert old_a.count('\n') == 9, old_a
src = once(src, old_a,
    "  if (kind === 'appt') {\n"
    "    /* SPEAKTILE: the record is built by apptRec (the 🎤 Speak sheet's New appointment uses it too) */\n"
    "    var af = { ak: segv(o, 'ak'), with: w, cname: val(o, 'cname'), cphone: val(o, 'cphone'), caddr: val(o, 'caddr'), date: date, time: time, etime: val(o, 'etime'), for: val(o, 'for') };\n"
    "    var aerr = apptCheck(af); if (aerr) return err(o, aerr);\n"
    "    var rec = apptRec(af, x, base, me, at, all); if (w === 'new') cust = rec;\n"
    "    up.push(rec);\n  } else {")
PM_JS = r"""/* SPEAKTILE: 📅 New appointment — one record builder (the form above and the 🎤 Speak sheet) */
function apptCheck(f){ if (s(f.with) === 'new' && !s(f.cname) && !s(f.caddr)) return 'Type the customer\'s name or address.'; if (!s(f.with)) return 'Pick a job or a lead (or ＋ A new customer).'; return ''; }
function apptRec(f, x, base, me, at, all){
  var w = s(f.with), pid = /^j:/.test(w) ? w.slice(2) : '', leadId = /^l:/.test(w) ? w.slice(2) : '', p = pid ? proj(pid) : null, l = leadId ? leadById(leadId) : null;
  var ak = s(f.ak) || 'Estimate', who = l ? s(l.client || l.contactName || l.name) : p ? s(p.client || p.name) : s(f.cname);
  var rec = Object.assign({}, x || {}, base, { id: x ? x.id : uid('SCHpm'), type: 'appointment', apptKind: ak, title: ak + ' — ' + (who || 'customer'), date: s(f.date), time: t12(s(f.time)), endTime: t12(s(f.etime)),
    assignee: all && s(f.for) ? s(f.for) : (x ? s(x.assignee) || me : me), pid: pid, leadId: leadId, address: s(p ? p.address : l ? (l.address || l.jobAddress) : f.caddr), companyId: coOf(p) || (x && x.companyId) || '' });
  if (w === 'new') { rec.customer = s(f.cname); rec.phone = s(f.cphone); rec.pid = ''; rec.leadId = ''; } else { delete rec.customer; }
  if (!x) { rec.by = me; rec.createdBy = me; rec.createdAt = at; }
  return rec;
}
/* the same checks and the same save as the form's 📅 Add to my schedule; { ok, rec } */
function addAppt(f){
  f = f || {}; var me = myName(), at = nowIso(), all = seesAll(), w = s(f.with);
  var no = function(t){ return Promise.resolve({ ok: false, error: t }); };
  if (!me) return no('Your name is not on the people list yet — ask the office.');
  if (!s(f.date)) return no('Pick a date.');
  var pid = /^j:/.test(w) ? w.slice(2) : '', leadId = /^l:/.test(w) ? w.slice(2) : '';
  if (pid && !all && !myJobIds()[pid]) return no('That job is not one of yours — ask the office to schedule it.');
  if (leadId && !all && !myLeads().some(function(y){ return s(y.id) === leadId; })) return no('That lead is not one of yours.');
  var e = apptCheck(f); if (e) return no(e);
  var rec = apptRec(f, null, { notes: s(f.notes), updatedAt: at, updatedBy: me, source: s(f.source) || 'GrayCo Field', scope: 'company' }, me, at, all);
  var pre = w === 'new' && typeof W._gcSelfApptLink === 'function' ? withTimeout(W._gcSelfApptLink(rec), 4000, rec).then(function(r){ if (r && r.id === rec.id) rec = r; }) : Promise.resolve();
  return pre.then(function(){ return saveSched([rec], []); }).then(function(ok){ return ok ? { ok: true, rec: rec } : { ok: false, error: 'Not saved — try again.' }; });
}
"""
src = once(src, "function cancelItem(o){", PM_JS + "function cancelItem(o){")
src = once(src, "  saveSched: saveSched, canEditRec: canEdit,", "  saveSched: saveSched, canEditRec: canEdit, addAppt: addAppt,   /* SPEAKTILE: the 🎤 Speak sheet's New appointment */")
src = once(src, "  if (a === 'admin') L = ['leads', 'viewas', 'systems', 'addjob', 'todo']", "  if (a === 'admin') L = ['leads', 'speak', 'systems', 'addjob', 'todo']   /* SPEAKTILE: 🎤 Speak where 👁 View as… was (View as… is in 💎) */")
src = once(src, "  else if (a === 'pm') L = ['log', 'todo', 'sendest'];", "  else if (a === 'pm') L = ['speak', 'log', 'todo', 'sendest'];   /* SPEAKTILE: 🎤 Speak */")

# ───────────────────────── ROLEAPPS: the button ─────────────────────────
src = once(src, "  viewas:    { ic: '👁', l: 'View as…', show: realAdmin, run: function(){ if (W._gcVASOpen) W._gcVASOpen(); } },",
    "  viewas:    { ic: '👁', l: 'View as…', show: realAdmin, run: function(){ if (W._gcVASOpen) W._gcVASOpen(); } },\n"
    "  speak:     { ic: '🎤', l: 'Speak', sub: 'Notes · schedule · messages · leads', show: function(){ return mode() === 'field' && !!(W._gcAUTAI && W._gcAUTAI.speak); }, run: function(){ W._gcAUTAI.speak(); } },   /* SPEAKTILE: patch AUTAI's 🎤 sheet, listening */")
src = once(src, "  est:    ['sendest', 'newcust', 'bids',", "  est:    ['speak', 'sendest', 'newcust', 'bids',")
src = once(src, "  office: ['appr', 'msgs', 'match', 'todo'],", "  office: ['speak', 'appr', 'msgs', 'match', 'todo'],   /* SPEAKTILE: 🎤 Speak (GrayCo Field only) */")
src = once(src, "  ins:    ['emerg', 'oncall', 'drying', 'equip', 'photos', 'claims', 'tpa'],", "  ins:    ['emerg', 'oncall', 'drying', 'equip', 'photos', 'claims', 'tpa', 'speak'],")
old_t = between(src, "function tileHtml(id, cls){ var n = count(id);", "}\n")
assert "esc(label(id)) + '</span>'" in old_t
src = once(src, old_t, old_t.replace("esc(label(id)) + '</span>'", "esc(label(id)) + '</span>' + (A[id].sub ? '<small class=\"gc-ra-sub\">' + esc(A[id].sub) + '</small>' : '') /* SPEAKTILE: */"))

# ───────────────────────── FIELDHOME (without the role apps) ─────────────────────────
src = once(src, "marketing: ['📣', 'Marketing', ''], viewas: ['👁', 'View as…', '']", "marketing: ['📣', 'Marketing', ''], viewas: ['👁', 'View as…', ''], speak: ['🎤', 'Speak', 'speak']   /* SPEAKTILE: */")
src = once(src, "  if (k === 'viewas') { if (W._gcVASOpen) W._gcVASOpen(); return; }", "  if (k === 'viewas') { if (W._gcVASOpen) W._gcVASOpen(); return; }\n  if (k === 'speak') { if (W._gcAUTAI && W._gcAUTAI.speak) W._gcAUTAI.speak(); return; }   /* SPEAKTILE: */")
src = once(src, "  admin:  { tiles: ['viewas', 'photos', 'addjob', 'receipt'],", "  admin:  { tiles: ['speak', 'photos', 'addjob', 'receipt'],   /* SPEAKTILE: View as… is in 💎 */")

open(path, 'w', encoding='utf-8').write(src)
print('patched SPEAKTILE')
