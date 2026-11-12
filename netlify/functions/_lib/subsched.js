/* ============================================================================
   GrayCo — "📅 MY SCHEDULE FOR THIS JOB" (patch SUBSCHED).   netlify/functions/_lib/subsched.js

   Owner (11/12): "on the sub portal have where the subs can click the schedule they will do for the job when they get the
   job and that schedule will update our company schedule automatically whenever a sub enters his schedule in there with
   address, PO and task if they want."

   A sub on a job (the job's sub row, or a scope sent to them — the portal's own rule, partnerCtx) adds one or more
   entries on the job page: start date, end date (or number of days), Saturday / Sunday or not, start time (optional),
   the task (prefilled with their trade / scope), crew size and notes (optional). The job's address and PO go with it
   (read-only, from the job). They edit / cancel an entry until its first day starts (Central time).

   Where it lives: gc_kv-style key 'gc_sub_sched' in the server-only store (bid-inbox _lib kvCas — the same store as the
   sub's busy days, gc_x10_subavail): { v: 1, list: { <entry id>: entry } }. The sub's entry is the truth:
     · every save / cancel files a gc_sub_event 'sched' (the job's activity line in the CRM, and the CRM looks again at once);
     · the CRM (index.html patch SUBSCHED) asks for the entries (staff action s-sched op list) every minute and keeps ONE
       schedule item per entry day ("🔨 <Sub company> — <task>", the job, address, PO, time, source "Sub portal", the sub's
       id) — an edit moves / changes those same items, a cancel removes them; a staff edit of one is put back (staff use
       ✅ Confirm or 📨 Ask to move, which writes to the sub through the portal messages);
     · the job's PM gets a To-Do (gc_office_tasks, one per entry, replaced on each change) and a phone push.
   Nothing here touches the CRM's own lists. Pure helpers + the two action handlers (deps injected by portal-access.js).
   ========================================================================== */
'use strict';
const KEY = 'gc_sub_sched';
const MAX_DAYS = 60, MAX_SPAN = 92, MAX_PER_JOB = 20, MAX_PER_SUB = 200, KEEP_DAYS = 120;

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function clip(v, n){ const t = s(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''); return t.length > n ? t.slice(0, n) : t; }
function okDay(v){ if (!/^\d{4}-\d{2}-\d{2}$/.test(s(v))) return false; const d = new Date(s(v) + 'T12:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s(v); }
function addDays(d, n){ const t = new Date(s(d) + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function wd(d){ return new Date(s(d) + 'T12:00:00Z').getUTCDay(); }
function spanOf(a, b){ return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5); }

/* the work days of an entry: start … end; Saturday / Sunday in between only when "weekends" is on (the start and end
   days are always theirs — they picked them) */
function daysOf(start, end, weekends){
  if (!okDay(start)) return [];
  if (!okDay(end) || end < start) end = start;
  const out = [];
  for (let d = start, i = 0; d <= end && i <= MAX_SPAN; d = addDays(d, 1), i++) {
    const w = wd(d);
    if (!weekends && (w === 0 || w === 6) && d !== start && d !== end) continue;
    out.push(d);
  }
  return out.slice(0, MAX_DAYS);
}
/* "number of days" → the end date (work days; weekends counted only when on) */
function endFromCount(start, n, weekends){
  n = Math.max(1, Math.min(MAX_DAYS, Math.round(Number(n) || 1)));
  let d = start, c = 1;
  while (c < n) { d = addDays(d, 1); const w = wd(d); if (weekends || (w !== 0 && w !== 6)) c++; if (spanOf(start, d) > MAX_SPAN) break; }
  return d;
}

const MSG = {
  en: { start: 'Pick the first day (today or later).', end: 'The last day must be on or after the first day.', span: 'One entry can cover at most ' + MAX_DAYS + ' work days — add another entry for more.',
    time: 'Enter the start time like 7:30 AM, or leave it blank.', task: 'Type the task (what you will do).', crew: 'Crew size is a number from 1 to 99 (or leave it blank).',
    gone: 'That entry is not here any more. Reload the job.', started: 'This one has started — message your PM to change it.', tooMany: 'That is a lot of entries on one job — message your PM.',
    busy: 'GrayCo\'s schedule was busy — try again.' },
  es: { start: 'Escoja el primer día (hoy o después).', end: 'El último día debe ser igual o después del primer día.', span: 'Una entrada puede tener como máximo ' + MAX_DAYS + ' días de trabajo — agregue otra entrada para más.',
    time: 'Escriba la hora de inicio, como 7:30 AM, o déjela en blanco.', task: 'Escriba la tarea (lo que va a hacer).', crew: 'El tamaño del equipo es un número de 1 a 99 (o déjelo en blanco).',
    gone: 'Esa entrada ya no está. Vuelva a abrir el trabajo.', started: 'Esta ya empezó — mándele un mensaje a su PM para cambiarla.', tooMany: 'Son muchas entradas en un trabajo — mándele un mensaje a su PM.',
    busy: 'El calendario de GrayCo estaba ocupado — intente otra vez.' }
};
function msg(lang, k){ return (MSG[lang === 'es' ? 'es' : 'en'][k]) || MSG.en[k] || k; }
function hhmm(v){ const t = s(v); if (!t) return ''; const m = /^(\d{1,2}):(\d{2})$/.exec(t); if (!m) return null; const h = +m[1], mi = +m[2]; if (h > 23 || mi > 59) return null; return String(h).padStart(2, '0') + ':' + m[2]; }
function time12(v){ const m = /^(\d{2}):(\d{2})$/.exec(s(v)); if (!m) return ''; let h = +m[1]; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + m[2] + ' ' + ap; }

/* the sub's form → the entry's fields, or { error } */
function clean(body, o){
  body = body || {}; o = o || {};
  const L = o.lang, today = s(o.today);
  const start = s(body.start);
  if (!okDay(start) || start < today) return { error: msg(L, 'start') };
  const weekends = body.weekends === true;
  let end = s(body.end);
  if (!end && body.days != null && s(body.days) !== '') end = endFromCount(start, body.days, weekends);
  if (!end) end = start;
  if (!okDay(end) || end < start) return { error: msg(L, 'end') };
  if (spanOf(start, end) > MAX_SPAN) return { error: msg(L, 'span') };
  const days = daysOf(start, end, weekends);
  if (!days.length || days[days.length - 1] !== end) return { error: msg(L, 'span') };
  const time = hhmm(body.time); if (time === null) return { error: msg(L, 'time') };
  const task = clip(String(body.task == null ? '' : body.task).replace(/\s+/g, ' '), 120); if (task.length < 2) return { error: msg(L, 'task') };
  let crew = '';
  if (body.crew != null && s(body.crew) !== '') { const n = Number(s(body.crew)); if (!(n >= 1 && n <= 99) || Math.round(n) !== n) return { error: msg(L, 'crew') }; crew = n; }
  return { start, end, weekends, days, time, task, crew, notes: clip(body.notes, 500) };
}
/* an entry can be changed / cancelled until its first day starts (Central) */
function editable(e, today){ return !!e && e.status === 'active' && s(e.start) > s(today); }
function datesLine(e){
  const f = function(d){ const x = new Date(d + 'T12:00:00Z'); return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][x.getUTCDay()] + ' ' + (x.getUTCMonth() + 1) + '/' + x.getUTCDate(); };
  return f(e.start) + (e.end && e.end !== e.start ? '–' + f(e.end) : '') + ' (' + (e.days || []).length + ' day' + ((e.days || []).length === 1 ? '' : 's') + ')' + (e.time ? ' from ' + time12(e.time) : '');
}
/* what the sub sees of an entry (the same fields back; GrayCo's confirmation / move request in plain words) */
function out(e, today){
  return { id: e.id, pid: e.pid, start: e.start, end: e.end, days: (e.days || []).slice(), weekends: !!e.weekends, time: e.time || '', task: e.task, crew: e.crew === '' || e.crew == null ? '' : e.crew,
    notes: e.notes || '', address: e.address || '', po: e.po || '', status: e.status, editable: editable(e, today), updatedAt: e.updatedAt,
    confirmed: e.confirmed ? { by: s(e.confirmed.by), at: s(e.confirmed.at) } : null, moveAsk: e.moveAsk ? { by: s(e.moveAsk.by), at: s(e.moveAsk.at), text: clip(e.moveAsk.text, 600) } : null };
}
function listOf(v){ return v && typeof v === 'object' && v.list && typeof v.list === 'object' && !Array.isArray(v.list) ? v.list : {}; }
function prune(list, today){ const cut = addDays(today, -KEEP_DAYS); Object.keys(list).forEach(function(k){ const e = list[k]; if (!e || s(e.end || e.start) < cut) delete list[k]; }); return list; }
function newId(){ return 'SS' + Date.now().toString(36) + require('crypto').randomBytes(4).toString('hex'); }

/* the PM's To-Do — one per entry, replaced on every change (the same id) */
function todoFor(e, op, pm, at){
  const who = s(e.subName) || 'Sub';
  const label = '📅 ' + who + (op === 'cancel' ? ' cancelled ' : op === 'update' ? ' moved ' : ' scheduled ') + e.task + ' ' + datesLine(e) + (e.job ? ' — ' + e.job : '');
  const note = [op === 'cancel' ? 'Cancelled in the sub portal — those days come off the schedule.' : 'Entered in the sub portal — it is on the company schedule (🔨 ' + who + ' — ' + e.task + ').',
    e.address ? 'Address: ' + e.address : '', e.po ? 'PO: ' + e.po : '', e.crew ? 'Crew: ' + e.crew : '', e.notes ? 'Notes: ' + e.notes : '',
    op === 'cancel' ? '' : 'Schedule → 📅 Sub schedules: ✅ Confirm or 📨 Ask to move.'].filter(Boolean).join('\n');
  return { id: 'subsched_' + e.id, kind: 'sub_sched', label: clip(label, 240), note: note, assignees: pm && pm.email ? [low(pm.email)] : [], urgency: 'normal', priority: 'normal',
    pid: s(e.pid), subId: s(e.subId), addedBy: 'Sub portal', addedAt: at, createdAt: at, updatedAt: at, done: false };
}
async function tellPm(deps, e, op, p){
  const at = new Date().toISOString(), out = {};
  let pm = null; try { pm = deps.pmOf(p); } catch (x) {}
  const t = todoFor(e, op, pm, at);
  try { const C = deps.core(); out.todo = (await C.kvListUpdate('gc_office_tasks', function(l){ const i = l.findIndex(function(x){ return x && s(x.id) === t.id; });
    if (i > -1) { if (l[i].label === t.label && l[i].done !== true) return null; l[i] = Object.assign({}, l[i], t); } else l.push(t);
    return { list: l, check: function(a){ return a.some(function(x){ return x && s(x.id) === t.id && x.label === t.label; }); } }; })).ok; } catch (x) { out.todo = false; }
  if (pm && pm.email && /@/.test(pm.email)) { try { out.push = await deps.core().pushTo([low(pm.email)], { title: t.label.slice(0, 120), body: t.note.split('\n')[0], tag: t.id }); } catch (x) {} }
  return out;
}

/* ── the sub: p-sched { projectId, op: list | save | cancel, id?, … } ── */
async function partner(ctx, body, deps){
  body = body || {};
  const p = deps.jobOf(ctx, body.projectId);   /* 404 "That job is not one of yours." — only jobs this sub is on */
  const sub = ctx.sub, today = deps.today(), L = body.lang === 'es' ? 'es' : 'en', op = s(body.op) || 'list';
  const pid = s(p.id), sid = s(sub.id);
  const mine = function(list){ return Object.keys(list).map(function(k){ return list[k]; }).filter(function(e){ return e && s(e.subId) === sid && s(e.pid) === pid && e.status === 'active'; })
    .sort(function(a, b){ return (a.start + a.time).localeCompare(b.start + b.time); }); };
  const r = deps.rowFor(p, sub) || {};
  const job = { address: s(p.address || p.jobAddress), po: deps.poOf(p), task: clip(s(r.trade) || s(r.scopeTitle) || s(sub.trade || sub.cat), 120) };
  if (op === 'list') { const v = await deps.kv.kvGet(KEY); return { ok: true, today: today, job: job, entries: mine(listOf(v)).map(function(e){ return out(e, today); }) }; }
  if (op !== 'save' && op !== 'cancel') throw deps.Fail(400, 'Bad request');
  let f = null;
  if (op === 'save') { f = clean(body, { today: today, lang: L }); if (f.error) throw deps.Fail(400, f.error); }
  const now = new Date().toISOString();
  let saved = null, how = op === 'cancel' ? 'cancel' : 'add', err = null;
  try {
    await deps.kv.kvCas(KEY, function(v){
      v = v && typeof v === 'object' && !Array.isArray(v) ? v : { v: 1, list: {} }; v.list = prune(listOf(v), today); err = null;
      let e = null;
      if (body.id) {
        e = v.list[s(body.id)];
        if (!e || s(e.subId) !== sid || s(e.pid) !== pid || e.status !== 'active') { err = deps.Fail(404, msg(L, 'gone')); return undefined; }
        if (!editable(e, today)) { err = deps.Fail(409, msg(L, 'started')); return undefined; }
        e = Object.assign({}, e);
      } else {
        if (op === 'cancel') { err = deps.Fail(404, msg(L, 'gone')); return undefined; }
        const all = Object.keys(v.list).map(function(k){ return v.list[k]; }).filter(function(x){ return x && s(x.subId) === sid && x.status === 'active'; });
        if (all.filter(function(x){ return s(x.pid) === pid; }).length >= MAX_PER_JOB || all.length >= MAX_PER_SUB) { err = deps.Fail(429, msg(L, 'tooMany')); return undefined; }
        e = { id: newId(), subId: sid, pid: pid, status: 'active', v: 0, createdAt: now, dayV: {} };
      }
      const nv = (Number(e.v) || 0) + 1;
      if (op === 'cancel') { e.status = 'cancelled'; e.cancelledAt = now; }
      else {
        const moved = !!body.id && (e.start !== f.start || e.end !== f.end || e.time !== f.time || e.task !== f.task || JSON.stringify(e.days) !== JSON.stringify(f.days));
        if (body.id) how = 'update';
        const dv = {}; f.days.forEach(function(d){ dv[d] = (e.dayV && e.dayV[d]) || nv; }); e.dayV = dv;
        Object.assign(e, f);
        if (moved || !body.id) { e.confirmed = null; e.moveAsk = null; }
      }
      e.v = nv; e.updatedAt = now; e.subName = s(sub.company || sub.name); e.contact = s(sub.contact || sub.name); e.lang = L;
      e.job = clip(p.name, 120); e.address = job.address; e.po = job.po; e.companyId = s(p.companyId) || '';
      v.list[e.id] = e; saved = e; return v;
    });
  } catch (x) { throw deps.Fail(503, msg(L, 'busy')); }
  if (err) throw err;
  if (!saved) throw deps.Fail(503, msg(L, 'busy'));
  try { await deps.addEvent('sched', sub, pid, { op: how, entryId: saved.id, v: saved.v, task: saved.task, start: saved.start, end: saved.end, days: saved.days.length, time: saved.time, line: datesLine(saved) }); } catch (x) {}
  try { await tellPm(deps, saved, how, p); } catch (x) {}
  const v2 = await deps.kv.kvGet(KEY);
  return { ok: true, today: today, job: job, entry: out(saved, today), op: how, entries: mine(listOf(v2)).map(function(e){ return out(e, today); }) };
}

/* ── staff: s-sched { op: list | confirm | move, id, text } ── */
async function staff(body, who, me, deps){
  body = body || {};
  const op = s(body.op) || 'list', today = deps.today();
  if (op === 'list') {
    const cut = addDays(today, -14), list = listOf(await deps.kv.kvGet(KEY));
    const entries = Object.keys(list).map(function(k){ return list[k]; }).filter(function(e){ return e && (s(e.end) >= cut || s(e.updatedAt).slice(0, 10) >= cut); })
      .map(function(e){ return Object.assign(out(e, today), { subId: s(e.subId), subName: s(e.subName), contact: s(e.contact), job: s(e.job), v: Number(e.v) || 1, dayV: e.dayV || {}, companyId: s(e.companyId), cancelledAt: s(e.cancelledAt) }); });
    return { ok: true, today: today, entries: entries };
  }
  if (op !== 'confirm' && op !== 'move' && op !== 'unconfirm') throw deps.Fail(400, 'Bad request');
  const id = s(body.id); if (!/^SS[a-z0-9]{6,40}$/.test(id)) throw deps.Fail(400, 'Bad request');
  const text = clip(body.text, 600);
  if (op === 'move' && text.length < 3) throw deps.Fail(400, 'Type what day / time works for GrayCo (it goes to the sub in their portal messages).');
  const now = new Date().toISOString(); let hit = null;
  await deps.kv.kvCas(KEY, function(v){
    const list = listOf(v), e = list[id]; if (!e || e.status !== 'active') { hit = null; return undefined; }
    if (op === 'confirm') e.confirmed = { by: me, at: now };
    if (op === 'unconfirm') e.confirmed = null;
    if (op === 'move') { e.moveAsk = { by: me, at: now, text: text }; e.confirmed = null; }
    e.staffAt = now; hit = Object.assign({}, e); return v;
  });
  if (!hit) throw deps.Fail(404, 'That sub schedule entry is gone (cancelled by the sub?).');
  if (op === 'move') {
    const es = hit.lang === 'es';
    const words = (es ? '📅 GrayCo le pide mover "' : '📅 GrayCo asks you to move "') + hit.task + '" (' + datesLine(hit) + '): ' + text + (es ? ' — cámbielo en Mi horario para este trabajo.' : ' — change it under "My schedule for this job".');
    await deps.msgInsert(hit.pid, 's:' + hit.subId, 'gc', me, words, []);
  }
  return { ok: true, entry: Object.assign(out(hit, today), { subId: s(hit.subId), subName: s(hit.subName), job: s(hit.job), v: Number(hit.v) || 1, dayV: hit.dayV || {} }) };
}

module.exports = { KEY, MAX_DAYS, daysOf, endFromCount, clean, editable, datesLine, out, todoFor, partner, staff, hhmm, time12, msg };
