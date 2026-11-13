/* ============================================================================
   GrayCo — "🧾 NO PO" GUARD (patch POGUARD).   netlify/functions/_lib/poguard.js

   Owner (11/13): "when the guys don't put a PO make sure we get a notification to admin and office 'no PO' to then
   message the sub what PO, and if they are active on a job it'll suggest that's the job the receipt is for, and also
   alert them and PM 'no PO for an expense'." and "make sure sub and PM can [put] POs on every receipt and expense."

   One alert per receipt / expense that arrives with NO PO (or a PO that is no job's), whatever road it came by:
     · GrayCo Field's 🧾 Log Expense (crew / PM) and the CRM's own expenses   → po-guard.js op "flag" (the CRM's scan)
     · the sub portal's 🧾 Send a receipt                                     → portal-access.js p-receipt
     · e-mailed receipts (receipts@ / the office@ mailbox)                     → money-mail.js fromEmail
   Each alert carries the JOB SUGGESTION (suggest()): the job the person was clocked in on / on the daily log / on the
   schedule THAT DATE (crew schedule, the sub's own SUBSCHED days, the sub's 📍 check-in), else their only active job,
   else a job near the store's address. The notices (notify()): admin + office get "🧾 No PO — <person>, $<amount>,
   <merchant>, <date>" (an office To-Do + a phone push); the PM of the suggested job the same (their own To-Do + push);
   the person who sent it "Add the PO for this receipt" (crew / PM: a phone push + the GrayCo Field notice; a sub: a
   message in their portal thread on that job, and the ✏️ Add PO row on their portal home). More than N (default 3) from
   one person in one day → one daily digest To-Do / push for that person instead of one each. 💬 Ask for the PO (admin /
   office) → the sub's portal thread (or the crew member's Field notice + push). Once a PO / job is set by anyone, the
   alert is resolved and its To-Dos are marked done.
   Nothing here e-mails anyone. Where it lives: gc_kv-style key "gc_po_guard" in the server-only store (bid-inbox _lib
   kvCas — never synced to a browser): { v: 1, list: { <alert id>: alert }, dg: { <person|day>: { n, ids, task } } }.
   Pure helpers + an orchestrator whose stores are injected (deps), so node tests run it on in-memory stores.
   ========================================================================== */
'use strict';
const crypto = require('crypto');
const KEY = 'gc_po_guard', SUBR_KEY = 'gc_sub_receipts', KEEP_DAYS = 45;

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function num(v){ const n = parseFloat(s(v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function clip(v, n){ const t = s(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''); return t.length > n ? t.slice(0, n) : t; }
function money(n){ return '$' + (Math.round(num(n) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function ymd(v){ const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(v)); return m ? m[0] : ''; }
function hash(v, n){ return crypto.createHash('sha1').update(s(v)).digest('hex').slice(0, n || 16); }
function env(k){ return s(process.env[k]); }
function digestN(){ const n = parseInt(env('PO_GUARD_DIGEST_N'), 10); return n > 0 ? n : 3; }
function central(ms){ try { return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); } catch (e) { return new Date(ms).toISOString().slice(0, 10); } }
function niceDay(d){ const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s(d)); return m ? (+m[2]) + '/' + (+m[3]) : s(d); }

/* ── jobs and POs ── */
function poKey(v){ return s(v).toUpperCase().replace(/^P\.?\s?O\.?\s*(#|NO\.?|NUM(BER)?)?\s*[:#-]?\s*/, '').replace(/[^A-Z0-9]/g, ''); }
function posOf(p){ return [p && p.autoPO, p && p.po, p && p.poNumber].map(s).filter(function(x, i, a){ return x && poKey(x).length >= 3 && a.indexOf(x) === i; }); }
function poOf(p){ return posOf(p)[0] || ''; }
function deadSet(data){ const d = {}; arr(data && data.gc_deleted_projects).forEach(function(x){ d[s(x.id || x)] = 1; }); (Array.isArray(data && data.gc_deleted_projects) ? data.gc_deleted_projects : []).forEach(function(x){ if (typeof x === 'string') d[x] = 1; }); return d; }
function liveJob(p, dead){ return !!(p && p.id != null && p.deleted !== true && !(dead && dead[s(p.id)])); }
function openJob(p){ return !/complete|closed|lost|cancel|archiv|warrant|dead/i.test(s(p && p.status)); }
function jobs(data){ const dead = deadSet(data); return arr(data && data.projects).filter(function(p){ return liveJob(p, dead); }); }
function jobById(data, pid){ return jobs(data).filter(function(p){ return s(p.id) === s(pid); })[0] || null; }
/* the ONE job whose PO this is (open jobs first; two open jobs with the same PO → not certain) */
function jobByPo(po, list){
  const k = poKey(po); if (k.length < 3) return null;
  const hits = arr(list).filter(function(p){ return posOf(p).some(function(c){ return poKey(c) === k; }); });
  const open = hits.filter(openJob);
  if (open.length === 1) return open[0];
  if (!open.length && hits.length === 1) return hits[0];
  return null;
}
/* a PO in free text (an e-mail subject / body, a memo): a job's own PO first (any format, as a whole word — "PO-2026-0012",
   "K729"), else a "PO …" token that is no job's (kept so the office sees what was written) */
const PO_WORD = /\bP\.?\s?O\.?\s*(?:#|no\.?|num(?:ber)?)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,23})\b/gi;
function poFromText(text, list){
  const t = ' ' + s(text) + ' ', T = t.toUpperCase();
  let best = null;
  arr(list).filter(openJob).concat(arr(list).filter(function(p){ return !openJob(p); })).some(function(p){
    return posOf(p).some(function(c){
      const C = c.toUpperCase(), k = poKey(C);
      if (k.length < 3) return false;
      const re = new RegExp('(^|[^A-Z0-9])(P\\.?\\s?O\\.?\\s*(?:#|NO\\.?|NUM(?:BER)?)?\\s*[:#-]?\\s*)?' + C.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Z0-9])');
      const m = re.exec(T); if (!m) return false;
      /* a bare short code (no "PO" in front) must look like a code: letters AND digits, 4+ characters */
      if (!m[2] && !/^P\.?\s?O\b/.test(C) && !(k.length >= 4 && /[A-Z]/.test(k) && /\d/.test(k)) && !(k.length >= 6 && /\d/.test(k))) return false;
      best = { po: c, pid: s(p.id), job: p }; return true;
    });
  });
  if (best) {
    const j = jobByPo(best.po, list);   /* the same PO on two open jobs → not certain */
    return j ? { po: best.po, pid: s(j.id), job: j, how: 'job po' } : { po: best.po, pid: '', job: null, how: 'po on two jobs' };
  }
  PO_WORD.lastIndex = 0; const m = PO_WORD.exec(t);
  if (m && /\d/.test(m[1])) return { po: m[1].toUpperCase(), pid: '', job: null, how: 'po not a job' };
  return { po: '', pid: '', job: null, how: '' };
}
/* does this receipt / expense already have its job? (a job id, or a PO that is ONE job's) */
function placed(item, data){
  const L = jobs(data);
  if (s(item.pid) && L.some(function(p){ return s(p.id) === s(item.pid); })) return { pid: s(item.pid), how: 'job' };
  if (s(item.po)) { const j = jobByPo(item.po, L); if (j) return { pid: s(j.id), how: 'po' }; }
  return null;
}

/* ── people ── */
function namesOf(x, fields){ const out = []; fields.forEach(function(f){ const v = x && x[f]; (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\s*[,;\/&]\s*|\s+and\s+/) : []).forEach(function(n){ n = low(typeof n === 'object' && n ? (n.name || n.email || n.user) : n); if (n && out.indexOf(n) < 0) out.push(n); }); }); return out; }
const SCHED_F = ['assignee', 'assignees', 'assignedTo', 'crew', 'who', 'people', 'tech', 'techs', 'employee', 'employees', 'user'];
const CREW_F = ['pm', 'apm', 'assistantPm', 'projectManager', 'mitTech', 'envTech', 'tech', 'cleanTech', 'abatementSupervisor', 'superintendent', 'crew', 'crewNames', 'assigned', 'team'];
/* who someone is, as the CRM's lists write it: full name, e-mail, the e-mail's name part */
function personKeys(by, data){
  const out = []; const add = function(v){ v = low(v); if (v && out.indexOf(v) < 0) out.push(v); };
  add(by && by.name); add(by && by.email);
  const u = arr(data && data.users).filter(function(x){ return (by.email && low(x.email) === low(by.email)) || (by.name && low(x.name) === low(by.name)); })[0];
  if (u) { add(u.name); add(u.email); }
  if (by && by.email) add(low(by.email).split('@')[0]);
  return out;
}
function isMe(n, keys){ n = low(n); if (!n) return false; if (keys.indexOf(n) > -1) return true; const first = keys.filter(function(k){ return k.indexOf(' ') > 0; }).map(function(k){ return k.split(' ')[0]; }); return n.indexOf(' ') < 0 && n.indexOf('@') < 0 && first.indexOf(n) > -1 && first.length === 1; }
function subMatch(x, by){ if (!by || !by.subId) return false; if (s(x.subId) && s(x.subId) === s(by.subId)) return true; const nm = low(by.name); return !!nm && [x.vendor, x.sub, x.subName, x.company].some(function(v){ return low(v) && low(v) === nm; }); }
function onDay(x, d){ const a = ymd(x.date) || ymd(x.start || x.startDate), b = ymd(x.end || x.endDate) || a; return !!a && (ymd(x.date) ? ymd(x.date) === d : (a <= d && d <= b)); }
function zipOf(a){ const m = /\b(\d{5})(?:-\d{4})?\s*$/.exec(s(a)) || /\b(\d{5})(?:-\d{4})?\b/.exec(s(a)); return m ? m[1] : ''; }
function cityOf(a){ const p = s(a).split(',').map(function(x){ return low(x); }); return p.length >= 3 ? p[p.length - 2].replace(/\b[a-z]{2}\s+\d{5}.*$/, '').trim() : ''; }

/* ── the job suggestion: what that person was doing THAT DATE ──
   data: { projects, schedule, users, timesheets, logs, subSched: [{ subId, pid, start, end, weekends, status }], checkins: [{ subId, pid, day }] }
   → [{ pid, name, po, pm, conf, why }] best first, at most 3 */
function suggest(item, data){
  const by = item.by || {}, d = ymd(item.date) || ymd(item.at) || central(Date.now()), L = jobs(data), open = L.filter(openJob);
  const keys = personKeys(by, data), sub = by.kind === 'sub', got = {};
  const add = function(pid, conf, why){ const p = L.filter(function(x){ return s(x.id) === s(pid); })[0]; if (!p) return; const k = s(p.id); if (!got[k] || got[k].conf < conf) got[k] = { pid: k, name: s(p.name), po: poOf(p), pm: s(p.pm || p.projectManager), conf: conf, why: why }; };
  if (sub) {
    arr(data.checkins).forEach(function(c){ if (s(c.subId) === s(by.subId) && ymd(c.day) === d) add(c.pid, 96, 'checked in at that job that day'); });
    arr(data.subSched).forEach(function(e){ if (s(e.subId) === s(by.subId) && e.status !== 'cancelled' && ymd(e.start) && ymd(e.start) <= d && d <= (ymd(e.end) || ymd(e.start))) add(e.pid, 92, 'on that job that day (their schedule)'); });
    arr(data.schedule).forEach(function(x){ if (x.deleted !== true && onDay(x, d) && subMatch(x, by)) add(x.pid || x.projectId || x.jobId, 90, 'on that job that day (schedule)'); });
  } else {
    arr(data.timesheets).forEach(function(r){ if (ymd(r.date) === d && s(r.pid || r.jobId) && (isMe(r.user, keys) || isMe(r.email, keys))) add(r.pid || r.jobId, 97, 'clocked in on that job that day'); });
    arr(data.logs).concat([].concat.apply([], L.map(function(p){ return arr(p.logs).map(function(g){ return Object.assign({ pid: p.id }, g); }); }))).forEach(function(g){
      if (ymd(g.date) !== d) return;
      const ns = namesOf(g, ['startBy', 'endBy', 'by', 'signedBy']).concat(arr(g.manpower).map(function(m){ return low(m.name || m.who); }));
      if (ns.some(function(n){ return isMe(n, keys); })) add(g.pid, 93, 'on that job\'s daily log that day');
    });
    arr(data.schedule).forEach(function(x){ if (x.deleted !== true && onDay(x, d) && namesOf(x, SCHED_F).some(function(n){ return isMe(n, keys); })) add(x.pid || x.projectId || x.jobId, 90, 'on that job that day (schedule)'); });
  }
  /* their active jobs: the sub's rows / the crew & PM fields */
  const mine = open.filter(function(p){
    if (sub) return arr(p.subs).some(function(r){ return subMatch(r, by) && !/reject|declin/i.test(s(r.status)); }) || arr(item.subJobs).indexOf(s(p.id)) > -1;
    return namesOf(p, CREW_F).some(function(n){ return isMe(n, keys); });
  }).filter(function(p){ return !/bidding|lead|estimate/i.test(s(p.status)); });
  if (!Object.keys(got).length && mine.length === 1) add(mine[0].id, 75, sub ? 'their only active job' : 'their only active job');
  if (!sub && !Object.keys(got).length && mine.length > 1) {   /* a PM: their job that had work on the schedule that day */
    const busy = mine.filter(function(p){ return arr(data.schedule).some(function(x){ return x.deleted !== true && s(x.pid || x.projectId) === s(p.id) && onDay(x, d); }); });
    if (busy.length === 1) add(busy[0].id, 70, 'their job with work that day');
  }
  /* near the store (its address on the receipt) */
  const ma = s(item.merchantAddr);
  if (!Object.keys(got).length && ma) {
    const z = zipOf(ma), c = cityOf(ma), pool = mine.length ? mine : open;
    const near = pool.filter(function(p){ return (z && zipOf(p.address) === z) || (c && cityOf(p.address) === c); });
    if (near.length && near.length <= 3) near.forEach(function(p){ add(p.id, zipOf(p.address) === z ? 55 : 45, 'near the store (' + (zipOf(p.address) === z ? 'same ZIP' : 'same city') + ')'); });
  }
  return Object.keys(got).map(function(k){ return got[k]; }).sort(function(a, b){ return b.conf - a.conf || a.name.localeCompare(b.name); }).slice(0, 3);
}

/* ── the alert ── */
function idOf(key){ return 'PG' + hash(key, 14); }
function whoLine(by){ return s(by && by.name) || s(by && by.email) || 'someone'; }
function headOf(a){ return '🧾 No PO — ' + whoLine(a.by) + (a.by && a.by.kind === 'sub' ? ' (sub)' : '') + ', ' + money(a.amt) + ', ' + (s(a.vendor) || 'a store') + ', ' + niceDay(a.date); }
function askText(a){ return 'What PO is this receipt for? ' + money(a.amt) + ' at ' + (s(a.vendor) || 'the store') + ' on ' + niceDay(a.date) + '.'; }
function make(item, data, at){
  const by = item.by || {};
  const a = { id: idOf(item.key), key: s(item.key), src: s(item.src) || 'expense', expId: s(item.expId), mailId: s(item.mailId), srid: s(item.srid),
    by: { kind: /^(crew|pm|sub|office|admin)$/.test(s(by.kind)) ? s(by.kind) : (by.email ? 'crew' : 'unknown'), name: clip(by.name, 80), email: low(by.email).slice(0, 120), subId: clip(by.subId, 90) },
    amt: Math.round(num(item.amt) * 100) / 100, vendor: clip(item.vendor, 80), date: ymd(item.date) || central(Date.parse(at) || Date.now()), po: clip(item.po, 40),
    merchantAddr: clip(item.merchantAddr, 160), at: at, status: 'open', sug: suggest(item, data) };
  a.badPo = !!a.po;   /* a PO was written but it is no job's */
  return a;
}
function listOf(v){ return v && typeof v === 'object' && v.list && typeof v.list === 'object' && !Array.isArray(v.list) ? v.list : {}; }
function stateOf(v){ return { v: 1, list: listOf(v), dg: v && v.dg && typeof v.dg === 'object' ? v.dg : {} }; }
function prune(st, nowMs){
  const cut = new Date(nowMs - KEEP_DAYS * 864e5).toISOString();
  Object.keys(st.list).forEach(function(k){ const a = st.list[k]; if (!a || (a.status !== 'open' && s(a.resolvedAt || a.at) < cut)) delete st.list[k]; });
  const dcut = central(nowMs - 10 * 864e5); Object.keys(st.dg).forEach(function(k){ if (s(k.split('|').pop()) < dcut) delete st.dg[k]; });
  return st;
}
function personKey(a){ return a.by.email ? 'e:' + a.by.email : a.by.subId ? 's:' + a.by.subId : 'n:' + low(a.by.name || 'unknown'); }
function pmFor(a, data, core){
  const pid = a.setPid || (a.sug[0] && a.sug[0].pid) || ''; const p = pid ? jobById(data, pid) : null; if (!p) return null;
  let pm = null; try { pm = core && core.pmOf ? core.pmOf(data, p) : null; } catch (e) { pm = null; }
  if (!pm) { const u = arr(data.users).filter(function(x){ return low(x.name) === low(p.pm); })[0]; pm = u ? { name: s(u.name), email: low(u.email) } : null; }
  return pm && pm.email ? pm : null;
}
function canSee(who, a, data, core){
  if (!who) return false; if (who.admin || who.office) return true;
  const em = low(who.email); if (em && a.by.email === em) return true;
  const pm = pmFor(a, data, core); if (pm && pm.email === em) return true;
  return a.sug.some(function(g){ const p = jobById(data, g.pid); if (!p) return false; const u = arr(data.users).filter(function(x){ return low(x.email) === em; })[0]; return !!u && low(p.pm) === low(u.name); });
}
/* what a person may change: admin / office anything; the person who sent it; the PM of its (suggested / set) job */
function canSet(who, a, data, core){ return canSee(who, a, data, core); }

/* ── the stores (deps) ──
   deps = { kv: { kvGet(key), kvCas(key, fn) }, core: { kvListUpdate(key, fn), pushTo(emails, {title, body, tag}), officeEmails(data), adminEmails(data), pmOf(data, p) },
            msgInsert(pid, party, side, author, text, files), data, now() } */
function nowMs(deps){ return deps && typeof deps.now === 'function' ? deps.now() : Date.now(); }
async function todo(deps, task){
  const has = function(l){ return l.some(function(t){ return t && s(t.id) === task.id; }); };
  try { const r = await deps.core.kvListUpdate('gc_office_tasks', function(l){
    const i = l.findIndex(function(t){ return t && s(t.id) === task.id; });
    if (i > -1) { if (l[i].label === task.label && l[i].note === task.note && !l[i].done) return null; const c = l.slice(); c[i] = Object.assign({}, l[i], { label: task.label, note: task.note, done: false, updatedAt: task.updatedAt }); return { list: c, check: function(l2){ return l2.some(function(t){ return t && s(t.id) === task.id && t.label === task.label; }); } }; }
    return { list: l.concat([task]), check: has }; }); return !!(r && r.ok); } catch (e) { return false; }
}
async function push(deps, emails, p){ emails = Array.from(new Set((emails || []).map(low).filter(function(e){ return /@/.test(e); }))); if (!emails.length) return 0; try { const r = await deps.core.pushTo(emails, p); return (r && r.sent) || 0; } catch (e) { return 0; } }
function taskOf(id, label, note, a, at, extra){ return Object.assign({ id: id, kind: 'po_guard', label: clip(label, 200), note: clip(note, 1500), pid: s((a.sug[0] || {}).pid), poGuard: a.id, urgency: 'today', addedBy: 'PO check', addedAt: at, createdAt: at, updatedAt: at, done: false }, extra || {}); }
function sugLine(a){ const g = a.sug[0]; return g ? 'Suggested: ' + g.name + (g.po ? ' (PO ' + g.po + ')' : '') + ' — ' + g.why + '.' : 'No job to suggest — pick it in the CRM.'; }
function noteOf(a){ return headOf(a) + '\n' + (a.badPo ? 'They wrote PO "' + a.po + '" — that is no job\'s PO.\n' : '') + sugLine(a) + '\nCRM → To-Do → 🧾 No PO: ✓ Use the suggestion, ✏️ set the PO, or 💬 Ask for the PO.'; }
async function tellSub(deps, a, text){
  const pid = a.setPid || (a.sug[0] && a.sug[0].pid) || s(a.pid);
  if (!pid || !a.by.subId || typeof deps.msgInsert !== 'function') return false;
  try { await deps.msgInsert(pid, 's:' + a.by.subId, 'gc', 'GrayCo office', text, []); return true; } catch (e) { return false; }
}

/* a new alert → the notices (one each), or the person's daily digest past N */
async function notify(deps, a, dgN){
  const data = deps.data || {}, at = new Date(nowMs(deps)).toISOString(), core = deps.core || {};
  let office = [], admins = []; try { office = core.officeEmails(data) || []; } catch (e) {} try { admins = core.adminEmails(data) || []; } catch (e) {}
  const pm = pmFor(a, data, core), N = digestN(), out = { tasks: [], push: 0, sub: false, mode: dgN > N ? 'digest' : 'single' };
  const staffKind = a.by.kind !== 'sub' && a.by.kind !== 'unknown';
  if (dgN <= N) {
    const t1 = taskOf('poguard_' + a.id, headOf(a), noteOf(a), a, at);
    if (await todo(deps, t1)) out.tasks.push(t1.id);
    out.push += await push(deps, office.concat(admins), { title: headOf(a), body: sugLine(a), tag: 'poguard-' + a.id });
    if (pm && pm.email !== a.by.email) {
      const t2 = taskOf('poguard_pm_' + a.id, headOf(a) + ' (your job?)', noteOf(a), a, at, { assignees: [pm.email] });
      if (await todo(deps, t2)) out.tasks.push(t2.id);
      out.push += await push(deps, [pm.email], { title: '🧾 No PO for an expense', body: headOf(a).replace(/^🧾 /, '') + ' — ' + sugLine(a), tag: 'poguard-pm-' + a.id });
      out.pm = pm.email;
    }
    if (staffKind && a.by.email) out.push += await push(deps, [a.by.email], { title: '🧾 Add the PO for this receipt', body: money(a.amt) + ' at ' + (a.vendor || 'the store') + ' on ' + niceDay(a.date) + ' — open GrayCo Field → 🧾 Add PO.', tag: 'poguard-me-' + a.id });
    if (a.by.kind === 'sub') out.sub = await tellSub(deps, a, '🧾 Add the PO for your receipt: ' + money(a.amt) + ' at ' + (a.vendor || 'the store') + ' on ' + niceDay(a.date) + '. Open your GrayCo Portal home → ✏️ Add PO.' + (a.sug[0] ? ' Is it ' + a.sug[0].name + (a.sug[0].po ? ' (PO ' + a.sug[0].po + ')' : '') + '?' : ''));
  }
  return out;
}
/* the person's digest To-Do (past N in a day): one line per open receipt; one push the moment it starts */
async function digest(deps, st, dk){
  const g = st.dg[dk]; if (!g) return null;
  const data = deps.data || {}, core = deps.core || {}, at = new Date(nowMs(deps)).toISOString();
  const open = g.ids.map(function(id){ return st.list[id]; }).filter(function(a){ return a && a.status === 'open' && a.mode === 'digest'; });
  const any = g.ids.map(function(id){ return st.list[id]; }).filter(Boolean)[0]; if (!any) return null;
  const id = 'poguard_dg_' + hash(dk, 12), who = whoLine(any.by) + (any.by.kind === 'sub' ? ' (sub)' : '');
  if (!open.length) { await done(deps, [id], 'All have a PO now', at); return id; }
  const label = '🧾 No PO — ' + who + ': ' + open.length + ' more receipt' + (open.length === 1 ? '' : 's') + ' on ' + niceDay(dk.split('|').pop()) + ' (' + money(open.reduce(function(t, a){ return t + a.amt; }, 0)) + ')';
  const note = 'Daily digest (more than ' + digestN() + ' from one person in a day):\n' + open.map(function(a){ return '• ' + money(a.amt) + ' ' + (a.vendor || '') + ' ' + niceDay(a.date) + ' — ' + sugLine(a); }).join('\n') + '\nCRM → To-Do → 🧾 No PO.';
  await todo(deps, taskOf(id, label, note, any, at));
  if (!g.pushed) {
    let office = [], admins = []; try { office = core.officeEmails(data) || []; } catch (e) {} try { admins = core.adminEmails(data) || []; } catch (e) {}
    await push(deps, office.concat(admins), { title: '🧾 No PO — ' + who, body: 'More than ' + digestN() + ' receipts without a PO today — one daily list in To-Do.', tag: 'poguard-dg-' + hash(dk, 12) });
    if (any.by.email && any.by.kind !== 'sub') await push(deps, [any.by.email], { title: '🧾 Add the POs for your receipts', body: open.length + ' more receipts today have no PO — open GrayCo Field → 🧾 Add PO.', tag: 'poguard-dgme-' + hash(dk, 12) });
    g.pushed = at;
  }
  return id;
}
async function done(deps, ids, why, at){
  if (!ids.length) return false;
  try { const r = await deps.core.kvListUpdate('gc_office_tasks', function(l){
    let ch = false; const c = l.map(function(t){ if (t && ids.indexOf(s(t.id)) > -1 && !t.done) { ch = true; return Object.assign({}, t, { done: true, doneAt: at, doneBy: 'PO check', doneNote: clip(why, 200), updatedAt: at }); } return t; });
    return ch ? { list: c, check: function(l2){ return ids.every(function(id){ const t = l2.find(function(x){ return x && s(x.id) === id; }); return !t || t.done; }); } } : null; }); return !!(r && r.ok); } catch (e) { return false; }
}

/* items → alerts. item = { key, src, expId|mailId|srid, amt, vendor, date, po, pid, by: { kind, name, email, subId }, merchantAddr, subJobs }
   → { ok, made: [alert], resolved: [id], skipped } */
async function flag(items, deps){
  const data = deps.data || {}, at = new Date(nowMs(deps)).toISOString(), made = [], fixed = [];
  items = arr(items).filter(function(it){ return s(it.key) && (num(it.amt) > 0 || s(it.vendor)); }).slice(0, 200);
  if (!items.length) return { ok: true, made: [], resolved: [] };
  const fresh = [], res = [];
  items.forEach(function(it){ const pl = placed(it, data); if (pl) res.push({ key: it.key, pid: pl.pid, po: s(it.po) || poOf(jobById(data, pl.pid)), by: 'set on the ' + (it.src === 'sub' ? 'receipt' : 'expense') }); else fresh.push(it); });
  if (res.length) { const r = await resolve(res, deps); fixed.push.apply(fixed, r.resolved || []); }
  if (!fresh.length) return { ok: true, made: [], resolved: fixed };
  let dgk = {};
  await deps.kv.kvCas(KEY, function(v){
    const st = prune(stateOf(v), nowMs(deps)); made.length = 0; dgk = {};
    fresh.forEach(function(it){
      const id = idOf(it.key); if (st.list[id]) return;   /* one alert per receipt, ever */
      const a = make(it, data, at), pk = personKey(a), dk = pk + '|' + central(Date.parse(at));
      const g = st.dg[dk] = st.dg[dk] || { n: 0, ids: [] }; g.n++; g.ids.push(id);
      a.dg = dk; a.mode = g.n > digestN() ? 'digest' : 'single'; a.dgN = g.n;
      st.list[id] = a; made.push(a); if (a.mode === 'digest') dgk[dk] = 1;
    });
    return made.length ? st : undefined;
  });
  /* tell them (outside the store write; whatever was sent is noted on the alert) */
  const notes = {};
  for (const a of made) { try { notes[a.id] = await notify(deps, a, a.dgN); } catch (e) { notes[a.id] = { err: s(e && e.message) }; } }
  if (made.length) await deps.kv.kvCas(KEY, function(v){
    const st = stateOf(v); let ch = false;
    made.forEach(function(a){ const x = st.list[a.id]; if (x && notes[a.id]) { x.notified = Object.assign({ at: at }, notes[a.id]); ch = true; } });
    return ch ? st : undefined;
  });
  if (Object.keys(dgk).length) {
    let snap = null; await deps.kv.kvCas(KEY, function(v){ snap = stateOf(v); return undefined; });
    for (const dk of Object.keys(dgk)) { await digest(deps, snap, dk); }
    await deps.kv.kvCas(KEY, function(v){ const st = stateOf(v); let ch = false; Object.keys(dgk).forEach(function(dk){ if (st.dg[dk] && snap.dg[dk] && snap.dg[dk].pushed && !st.dg[dk].pushed) { st.dg[dk].pushed = snap.dg[dk].pushed; ch = true; } }); return ch ? st : undefined; });
  }
  return { ok: true, made: made.map(function(a){ return pub(a); }), resolved: fixed };
}
/* a PO / job set (by anyone) → the alert is resolved; its To-Dos are marked done. list = [{ id | key, pid, po, by }] */
async function resolve(list, deps){
  const at = new Date(nowMs(deps)).toISOString(), hit = [];
  list = arr(list);
  await deps.kv.kvCas(KEY, function(v){
    const st = stateOf(v); hit.length = 0;
    list.forEach(function(r){ const id = s(r.id) || idOf(r.key); const a = st.list[id]; if (!a || a.status !== 'open') return;
      a.status = 'resolved'; a.resolvedAt = at; a.resolvedBy = clip(r.by, 80) || 'someone'; a.setPid = s(r.pid); a.setPo = clip(r.po, 40); a.how = clip(r.how, 40); hit.push(JSON.parse(JSON.stringify(a))); });
    return hit.length ? st : undefined;
  });
  if (!hit.length) return { ok: true, resolved: [] };
  const ids = []; hit.forEach(function(a){ ids.push('poguard_' + a.id, 'poguard_pm_' + a.id); });
  await done(deps, ids, 'PO set' + (hit[0].setPo ? ' (' + hit[0].setPo + ')' : '') + ' by ' + hit[0].resolvedBy, at);
  const dks = {}; hit.forEach(function(a){ if (a.mode === 'digest' && a.dg) dks[a.dg] = 1; });
  if (Object.keys(dks).length) { let snap = null; await deps.kv.kvCas(KEY, function(v){ snap = stateOf(v); return undefined; }); for (const dk of Object.keys(dks)) await digest(deps, snap, dk); }
  return { ok: true, resolved: hit.map(function(a){ return a.id; }), alerts: hit.map(pub) };
}
/* 💬 Ask for the PO: the sub's portal thread on the (suggested) job; crew / PM: their Field notice + a push */
async function ask(id, text, who, deps){
  const at = new Date(nowMs(deps)).toISOString();
  let a = null; await deps.kv.kvCas(KEY, function(v){ const st = stateOf(v); a = st.list[s(id)] || null; return undefined; });
  if (!a) return { ok: false, code: 404, error: 'That receipt is not on the No-PO list.' };
  if (a.status !== 'open') return { ok: false, code: 409, error: 'That receipt has its PO now.' };
  const words = clip(text, 600) || askText(a);
  let via = '';
  if (a.by.kind === 'sub') { if (await tellSub(deps, a, '💬 ' + words)) via = 'portal'; else via = 'portal home'; }
  else if (a.by.email) { await push(deps, [a.by.email], { title: '💬 ' + (who && who.name ? who.name : 'The office') + ' asks', body: words, tag: 'poguard-ask-' + a.id }); via = 'field'; }
  else return { ok: false, code: 409, error: 'Nobody to ask — the receipt has no person on it. Pick the job yourself.' };
  await deps.kv.kvCas(KEY, function(v){ const st = stateOf(v); const x = st.list[a.id]; if (!x) return undefined; x.asks = arr(x.asks).concat([{ at: at, by: clip(who && (who.name || who.email), 80), text: words, via: via }]).slice(-5); return st; });
  return { ok: true, via: via, text: words };
}
/* a resolved-elsewhere sweep: an expense that has its job / PO now (or was deleted / made overhead), an e-mailed receipt placed */
function sweepList(st, data, mailDone){
  const exps = {}; arr(data.expenses).forEach(function(e){ if (e && e.id != null) exps[s(e.id)] = e; });
  const out = [];
  Object.keys(st.list).forEach(function(id){ const a = st.list[id]; if (!a || a.status !== 'open') return;
    if (a.src === 'expense' || a.src === 'sub') {
      const e = exps[a.src === 'sub' ? 'SPR_' + a.srid : a.expId]; if (!e) return;
      if (e.deleted === true || e.overhead === true || /void|reject/i.test(s(e.status))) { out.push({ id: id, by: 'CRM (' + (e.overhead ? 'overhead' : 'removed') + ')', how: 'gone' }); return; }
      const pl = placed({ pid: e.pid || e.jobId, po: e.po }, data); if (pl) out.push({ id: id, pid: pl.pid, po: s(e.po) || poOf(jobById(data, pl.pid)), by: s(e.matchedBy || e.poSetBy) || 'the CRM', how: 'crm' });
    }
    if (a.src === 'mail' && mailDone && mailDone[a.mailId] && (mailDone[a.mailId].done || mailDone[a.mailId].skip)) out.push({ id: id, pid: s(mailDone[a.mailId].pid), by: s(mailDone[a.mailId].by) || 'the office', how: 'mail' });
  });
  return out;
}
function pub(a){ return { id: a.id, key: a.key, src: a.src, expId: a.expId, mailId: a.mailId, srid: a.srid, by: a.by, amt: a.amt, vendor: a.vendor, date: a.date, po: a.po, badPo: !!a.badPo, at: a.at, status: a.status,
  sug: a.sug, mode: a.mode, asks: arr(a.asks), resolvedAt: a.resolvedAt || '', resolvedBy: a.resolvedBy || '', setPid: a.setPid || '', setPo: a.setPo || '', head: headOf(a), ask: askText(a) }; }
async function list(who, deps, opts){
  opts = opts || {};
  let st = null; await deps.kv.kvCas(KEY, function(v){ st = stateOf(v); return undefined; });
  const data = deps.data || {};
  if (opts.sweep !== false) { const sw = sweepList(st, data, opts.mailDone); if (sw.length) { await resolve(sw, deps); await deps.kv.kvCas(KEY, function(v){ st = stateOf(v); return undefined; }); } }
  const since = new Date(nowMs(deps) - 3 * 864e5).toISOString();
  const all = Object.keys(st.list).map(function(k){ return st.list[k]; }).filter(function(a){ return a && (a.status === 'open' || s(a.resolvedAt) >= since); });
  return all.filter(function(a){ return canSee(who, a, data, deps.core); }).sort(function(a, b){ return s(b.at).localeCompare(s(a.at)); }).slice(0, 300).map(pub);
}
async function get(id, deps){ let a = null; await deps.kv.kvCas(KEY, function(v){ a = stateOf(v).list[s(id)] || null; return undefined; }); return a; }
function forSub(st, subId){ return Object.keys(listOf(st)).map(function(k){ return listOf(st)[k]; }).filter(function(a){ return a && a.status === 'open' && a.by && a.by.kind === 'sub' && s(a.by.subId) === s(subId); }); }

/* the live stores (functions only — tests inject their own) */
function liveDeps(data){
  const L = require('../bid-inbox.js')._lib, core = require('../portal.js')._core;
  return { kv: L, core: core, data: data, msgInsert: function(){ const PA = require('../portal-access.js')._core; return PA.msgInsert.apply(null, arguments); } };
}
const DATA_KEYS = ['projects', 'schedule', 'users', 'timesheets', 'logs', 'expenses', 'vendors', 'subs', 'gc_deleted_projects', 'gc_senior_pm'];
async function liveData(core, extraKeys){ try { return await core.kvRead(DATA_KEYS.concat(extraKeys || [])); } catch (e) { return {}; } }
/* the sub's own SUBSCHED days + 📍 check-ins (for the suggestion) */
async function subFacts(kv, dbGet, subId){
  const out = { subSched: [], checkins: [] };
  try { const v = await kv.kvGet('gc_sub_sched'); const l = v && v.list && typeof v.list === 'object' ? v.list : {}; out.subSched = Object.keys(l).map(function(k){ return l[k]; }).filter(function(e){ return e && s(e.subId) === s(subId); }); } catch (e) {}
  try { if (dbGet) out.checkins = (await dbGet('gc_sub_event', 'select=project_id,data,created_at&kind=eq.checkin&sub_id=eq.' + encodeURIComponent(s(subId)) + '&order=created_at.desc&limit=200')).map(function(r){ return { subId: subId, pid: s(r.project_id), day: s((r.data || {}).day) || s(r.created_at).slice(0, 10) }; }); } catch (e) {}
  return out;
}
/* an e-mailed receipt (money-mail.js) with no PO / job → an alert (the person = the staff member or sub who sent / forwarded it) */
function mailItem(rec, data){
  const si = rec.si || {}, rd = si.read || {};
  const from = low(rec.forwardedBy && /@/.test(rec.forwardedBy) ? rec.forwardedBy : rec.from);
  const u = arr(data.users).filter(function(x){ return low(x.email) === from; })[0];
  const sb = !u ? arr(data.vendors).concat(arr(data.subs)).filter(function(x){ return from && low(x.email) === from; })[0] : null;
  const by = u ? { kind: /project manager|\bpm\b/i.test(s(u.role)) ? 'pm' : /office/i.test(s(u.role)) ? 'office' : /admin/i.test(s(u.role)) ? 'admin' : 'crew', name: s(u.name), email: from }
    : sb ? { kind: 'sub', name: s(sb.company || sb.name), subId: s(sb.id), email: from } : { kind: 'unknown', name: s(rec.fromName) || from, email: '' };
  return { key: 'mail:' + s(rec.id), src: 'mail', mailId: s(rec.id), amt: num(rd.total), vendor: s(rd.vendor) || s(rec.fromName), date: ymd(rd.date) || ymd(rec.at), po: s(rec.po || rd.po), pid: '', by: by, merchantAddr: s(rd.vendorAddress || rd.storeAddress) };
}
async function flagMail(rec, opts){
  opts = opts || {};
  const core = opts.core || require('../portal.js')._core;
  const data = opts.data || await liveData(core);
  const deps = Object.assign(liveDeps(data), opts.deps || {});
  const it = mailItem(rec, data);
  if (it.by.kind === 'sub') Object.assign(data, await subFacts(deps.kv, null, it.by.subId));
  return flag([it], deps);
}

module.exports = { KEY, SUBR_KEY, poKey, posOf, poOf, jobByPo, poFromText, placed, suggest, make, flag, resolve, ask, list, get, notify, digest, sweepList, pub, forSub, stateOf, listOf, idOf, headOf, askText,
  canSee, canSet, mailItem, flagMail, liveDeps, liveData, subFacts, DATA_KEYS, digestN, central, jobs, jobById, openJob };
