/* netlify/functions/_lib/golive.js — patch PORTALPOL: the customer-portal roll-out and the Jan 1 go-live (owner 11/19).

   1. "We will make portal for active jobs right now" — ONE time, on the first run of this build (the 5-minute appr-ping-scheduled
      run calls tick()): a portal link for every ACTIVE job that has none (weekly-update's "active": in progress / scheduled /
      approved / started, or 1–99 %; never a history-only, deleted, lost, closed, bidding or on-hold job). NOTHING is sent — a
      link is only a row in gc_portal; the customer gets it when someone sends it. Each link is made with created_by
      BACKFILL_TAG, so ⚡ Automations → "Undo" turns exactly those links off again (and nothing else). Logged.
   2. "Jan 1 automatically make a portal for everything; everything will be active by January 1, including auto texts, e-mails
      etc." — the go-live, at 00:00 America/Chicago on the plan's date (default 2027-01-01; an admin changes the date or cancels
      it in Admin → ⚡ Automations, automations.js op golive):
        · a portal link for every OPEN job that has none (not closed / complete / lost / cancelled / archived / deleted /
          history-only), created_by GOLIVE_TAG — nothing is sent by this;
        · ⏸ data-entry mode OFF (gc_kv gc_automation_pause, logged in gc_automation_pause_log as "go-live") — this replaces the
          earlier "data-entry mode ends Jan 3, 2027" plan: the owner now says Jan 1;
        · the customer-facing automations in SWITCH below ON (gc_kv gc_automations, each logged "go-live");
        · the day before (from 00:00 the previous day) ONE in-CRM announcement to every active staff member (gc_adm_msgs, the
          "📣 Message from" box; channel crm only — no e-mail, no text).
      Each step runs once; a step that cannot finish in one run (many jobs) carries on in the next run.
   State: gc_kv "gc_golive" = { plan, backfill, golive, announce, log }. Tests swap _D. */
'use strict';
const KEY = 'gc_golive';
const TZ = 'America/Chicago';
const DEFAULT_DATE = '2027-01-01';
const BACKFILL_TAG = 'auto: portal for active jobs (PORTALPOL)';
const GOLIVE_TAG = 'auto: go-live portals (PORTALPOL)';
const BATCH = 100;
/* what the go-live switches ON — the customer e-mail / text automations (⚡ Automations keys). Left as they are (the owner decides
   them himself): marketing (social / newsletter / autopilot / agency report / event reminders / win-back / roof offer / referral
   credits), bid-result e-mails to GCs, adjuster follow-ups, maintenance-plan queueing, the proposal maker, the portal gate queue,
   call recording / voicemail (opt-in only). */
const SWITCH = [
  'lead_qualify_text',        /* the new lead's qualify ask (CUSTTEXT2; replaced NOCUSTTEXT's lead_customer_autotext) */
  'lead_good_text',           /* "a PM will reach out shortly" on GOOD (CUSTTEXT2) — lead_good_text_pm (name the PM) stays the owner's call */
  'text_auto_answers',        /* automatic replies to customers' texts */
  'appt_confirmations',       /* appointment confirmations + day-before reminders */
  'estimate_followups',       /* estimate nudges day 2 / 5 / 10 */
  'invoice_email_queue',      /* new client invoice → e-mail on ✅ Approvals */
  'final_invoice_reminders',  /* final invoice e-mail + 15-day reminders */
  'ar_reminders',             /* past-due reminders on ✅ Approvals */
  'monthly_statements',       /* statements on the 1st, on ✅ Approvals */
  'portal_invite_email',      /* new job's portal link e-mail (queued) */
  'portal_docs_notice',       /* "something new in your portal" e-mails */
  'customer_app_push',        /* portal-app pushes held overnight */
  'we_need_reminders',        /* "We need from you" reminders */
  'weekly_update',            /* Friday weekly update (portal + e-mail, PM approves) */
  'thank_you_queue',          /* job-complete thank-you on ✅ Approvals */
  'one_year_note',            /* one-year note after completion */
  'warranty_checkup_offer'    /* warranty check-up offer */
];
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function obj(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function num(v){ const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; }
function core(){ return require('../portal.js')._core; }
function AUTO(){ return require('./automations.js'); }

/* ── time: 00:00 in Chicago on a date, as a UTC instant ── */
function tzOffsetMin(ms){
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = {}; f.formatToParts(new Date(ms)).forEach(function(x){ p[x.type] = x.value; });
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}
function midnightUtc(ymd){
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s(ymd))) return '';
  const base = Date.parse(ymd + 'T00:00:00Z');
  let off = tzOffsetMin(base + 6 * 3600e3);
  let t = base - off * 60000;
  off = tzOffsetMin(t); t = base - off * 60000;   /* the offset that holds AT that local midnight */
  return new Date(t).toISOString();
}
function localDay(ms){ return new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ }); }
function nice(ymd){ try { return new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); } catch (e) { return ymd; } }

/* ── which jobs ── */
function historyJob(p){ return p.importedHistory === true || p.noSend === true || p.historyOnly === true; }
function okPid(p){ return /^[A-Za-z0-9_.:-]{1,80}$/.test(s(p && p.id)); }
function goneSet(data){ const g = {}; (Array.isArray(data.gc_deleted_projects) ? data.gc_deleted_projects : []).forEach(function(x){ g[s(x && typeof x === 'object' ? x.id : x)] = 1; }); return g; }
/* ACTIVE (item 4, "portal for active jobs right now") — the weekly update's rule */
function isActive(p){
  const st = low(p.status);
  if (p.deleted === true || historyJob(p) || /complete|closed|cancel|lost|dead|bidding|estimate|lead|hold|archiv|warranty/.test(st)) return false;
  return /active|progress|started|underway|production|approved|scheduled/.test(st) || (num(p.pct) > 0 && num(p.pct) < 100);
}
/* OPEN (the Jan 1 go-live, "a portal for everything") — every job that is not finished, lost or archived */
function isOpen(p){
  const st = low(p.status);
  if (p.deleted === true || historyJob(p)) return false;
  return !/complete|closed|cancel|lost|dead|archiv|void/.test(st);
}
function jobsWanted(data, test, have){
  const gone = goneSet(data), seen = {};
  return arr(data.projects).filter(function(p){
    const id = s(p.id); if (!okPid(p) || gone[id] || seen[id] || have[id]) return false; seen[id] = 1;
    return test(p);
  });
}

/* ── the plan ── */
function planOf(st){
  const pl = obj(st.plan), date = /^\d{4}-\d{2}-\d{2}$/.test(s(pl.date)) ? s(pl.date) : DEFAULT_DATE;
  return { date: date, at: midnightUtc(date), tz: TZ, cancelled: pl.cancelled === true, by: s(pl.by), setAt: s(pl.setAt), isDefault: !s(pl.date) };
}
function logAdd(st, what, by, at){ st.log = arr(st.log); st.log.unshift({ at: at, what: s(what).slice(0, 300), by: s(by) || 'CRM (scheduled)' }); st.log = st.log.slice(0, 100); }
function announceText(pl){
  return 'Go-live tomorrow, ' + nice(pl.date) + ' at 12:00 AM (Central). The CRM will: make a customer portal for every open job that has none (nothing is sent by this); turn ⏸ data-entry mode OFF, so e-mails and texts go out again; and turn ON the customer automations: '
    + SWITCH.map(function(k){ const a = AUTO().BY[k]; return a ? a.name : k; }).join(', ') + '. Admins can change the date or cancel it in Admin → ⚡ Automations → Go-live.';
}

/* ── dependencies (tests swap these) ── */
async function sbFetch(path, opt){
  const C = core();
  return globalThis.fetch(C.sbUrl() + '/rest/v1/' + path, Object.assign({}, opt || {}, { headers: Object.assign({}, C.H(), (opt && opt.headers) || {}) }));
}
const _D = {
  now: function(){ return Date.now(); },
  kvGet: async function(key){ const r = await sbFetch('gc_kv?select=value&key=eq.' + encodeURIComponent(key)); if (!r || !r.ok) throw new Error('gc_kv read ' + (r && r.status)); const rows = await r.json(); return rows && rows[0] ? rows[0].value : null; },
  kvPut: async function(key, value){ const r = await sbFetch('gc_kv?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: key, value: value, updated_at: new Date().toISOString() }) }); if (!r || !r.ok) throw new Error('gc_kv write ' + (r && r.status)); return true; },
  crmData: async function(){ return core().crmData(true); },
  activePids: async function(){
    const r = await sbFetch('gc_portal?select=project_id&revoked=eq.false&limit=20000'); if (!r || !r.ok) throw new Error('gc_portal read ' + (r && r.status));
    const o = {}; (await r.json()).forEach(function(x){ o[s(x.project_id)] = 1; }); return o;
  },
  createLinks: async function(pids, tag){
    if (!pids.length) return 0;
    const rows = pids.map(function(pid){ return { token: core().newToken(), project_id: pid, created_by: tag, revoked: false }; });
    const r = await sbFetch('gc_portal', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rows) });
    if (!r || !r.ok) throw new Error('gc_portal write ' + (r && r.status));
    return rows.length;
  },
  revokeTag: async function(tag){
    const r = await sbFetch('gc_portal?revoked=eq.false&created_by=eq.' + encodeURIComponent(tag), { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ revoked: true }) });
    if (!r || !r.ok) throw new Error('gc_portal update ' + (r && r.status));
    const rows = await r.json().catch(function(){ return []; }); return Array.isArray(rows) ? rows.length : 0;
  },
  pauseOff: async function(at, note){
    const P = require('./pause.js'); let prev = null; try { prev = obj(await _D.kvGet(P.KEY)); } catch (e) {}
    const flag = { on: false, by: 'go-live', byName: 'Go-live (scheduled)', at: at, note: note };
    if (prev && prev.on) flag.lastPause = { from: prev.since || prev.at, to: at };
    await _D.kvPut(P.KEY, flag);
    let log = []; try { log = arr(await _D.kvGet('gc_automation_pause_log')); } catch (e) {}
    log.unshift({ on: false, by: 'go-live', at: at, note: note }); await _D.kvPut('gc_automation_pause_log', log.slice(0, 100));
    try { P.reset(); } catch (e) {}
    return { was: !!(prev && prev.on) };
  },
  autoOn: async function(keys, at){
    const A = AUTO(), row = A.parse(await _D.kvGet(A.KEY)), log = Array.isArray(row._log) ? row._log : [], changed = [];
    keys.forEach(function(k){ if (!A.BY[k]) return; const was = A.valueOf(row, k); row[k] = true; if (!was) { changed.push(k); log.unshift({ key: k, on: true, by: 'go-live', byName: 'Go-live (scheduled)', at: at, op: 'golive' }); } });
    row._log = log.slice(0, 200); await _D.kvPut(A.KEY, row); try { A._t.reset(); } catch (e) {}
    return changed;
  },
  announce: async function(rec){
    const has = function(l){ return l.some(function(x){ return s(x.id) === rec.id; }); };
    const r = await core().kvListUpdate('gc_adm_msgs', function(l){ return has(l) ? null : { list: [rec].concat(l).slice(0, 2000), check: has }; });
    if (!r.ok) throw new Error('gc_adm_msgs ' + r.error); return true;
  }
};
function staffRecipients(users){
  return arr(users).filter(function(u){ return u.active !== false && !u.departed && !u.terminated && /@(in\.)?grayco-cs\.com$/i.test(s(u.email)) && !/\b(sub|customer|client|vendor)\b/i.test(s(u.role)); })
    .map(function(u){ return { id: s(u.id), name: s(u.name), email: low(u.email) }; });
}

async function readState(){ return obj(await _D.kvGet(KEY)); }
async function writeState(st){ return _D.kvPut(KEY, st); }

/* links for the jobs `test` picks, BATCH at a time → { made: [pid], left } */
async function makeLinks(data, test, tag){
  const have = await _D.activePids();
  const want = jobsWanted(data, test, have);
  const now = want.slice(0, BATCH).map(function(p){ return s(p.id); });
  if (now.length) await _D.createLinks(now, tag);
  return { made: now, left: want.length - now.length };
}

/* the 5-minute run */
async function tick(opts){
  opts = opts || {};
  const t = _D.now(), at = new Date(t).toISOString(), out = { ok: true };
  let st; try { st = await readState(); } catch (e) { return { ok: false, error: 'state unreadable: ' + s(e && e.message) }; }
  let data = null; const getData = async function(){ if (!data) data = obj(await _D.crmData()); return data; };
  let dirty = false;
  /* 1. the one-time portal links for the active jobs */
  const bf = obj(st.backfill);
  if (!bf.state || bf.state === 'running') {
    try {
      const r = await makeLinks(await getData(), isActive, BACKFILL_TAG);
      st.backfill = { state: r.left > 0 ? 'running' : 'done', startedAt: s(bf.startedAt) || at, at: at, made: arr([]).concat(Array.isArray(bf.made) ? bf.made : [], r.made).slice(-5000), n: (+bf.n || 0) + r.made.length };
      if (st.backfill.state === 'done') logAdd(st, 'Portal links made for ' + st.backfill.n + ' active job' + (st.backfill.n === 1 ? '' : 's') + ' that had none — nothing was sent.', '', at);
      out.backfill = { made: r.made.length, left: r.left }; dirty = true;
    } catch (e) { out.backfill = { error: s(e && e.message).slice(0, 160) }; }
  }
  /* 2. the go-live */
  const pl = planOf(st), gl = obj(st.golive), an = obj(st.announce);
  out.plan = { date: pl.date, at: pl.at, cancelled: pl.cancelled };
  const atMs = Date.parse(pl.at);
  if (!pl.cancelled && gl.state !== 'done') {
    if (t >= atMs - 24 * 3600e3 && t < atMs && s(an.date) !== pl.date) {
      try {
        const d = await getData(), text = announceText(pl);
        await _D.announce({ id: 'AM_golive_' + pl.date, at: at, by: 'go-live', byName: 'GrayCo CRM', subject: '🚀 Go-live tomorrow — ' + nice(pl.date), text: text, to: { mode: 'all', label: 'Everyone' },
          recipients: staffRecipients(d.users), channels: ['crm'], jobs: [], readBy: {}, source: 'golive' });
        st.announce = { date: pl.date, at: at }; logAdd(st, 'Announcement posted to staff: go-live ' + pl.date + '.', '', at); out.announced = true; dirty = true;
      } catch (e) { out.announce = { error: s(e && e.message).slice(0, 160) }; }
    }
    if (t >= atMs) {
      const g = { state: 'running', date: pl.date, startedAt: s(gl.startedAt) || at, at: at, made: Array.isArray(gl.made) ? gl.made : [], n: +gl.n || 0, steps: obj(gl.steps) };
      try {
        if (!g.steps.portals) {
          const r = await makeLinks(await getData(), isOpen, GOLIVE_TAG);
          g.made = g.made.concat(r.made).slice(-10000); g.n += r.made.length;
          if (r.left <= 0) { g.steps.portals = at; logAdd(st, 'Go-live: portal links made for ' + g.n + ' open job' + (g.n === 1 ? '' : 's') + ' — nothing was sent.', '', at); }
          out.golivePortals = { made: r.made.length, left: r.left };
        }
        if (g.steps.portals && !g.steps.pause) { const pr = await _D.pauseOff(at, 'Go-live ' + pl.date + ' (scheduled) — sending is back on'); g.steps.pause = at; logAdd(st, 'Go-live: ⏸ data-entry mode turned OFF' + (pr.was ? '' : ' (it was already off)') + '.', '', at); }
        if (g.steps.pause && !g.steps.auto) { const ch = await _D.autoOn(SWITCH, at); g.steps.auto = at; g.switched = ch; logAdd(st, 'Go-live: automations turned ON — ' + (ch.length ? ch.join(', ') : 'all were already on') + '.', '', at); }
        if (g.steps.auto) { g.state = 'done'; g.doneAt = at; }
      } catch (e) { out.golive = { error: s(e && e.message).slice(0, 160) }; }
      st.golive = g; out.goliveState = g.state; dirty = true;
    }
  }
  if (dirty) { try { await writeState(st); } catch (e) { out.ok = false; out.error = 'state write: ' + s(e && e.message); } }
  return out;
}

/* ── admin actions (automations.js op golive) ── */
async function view(){
  const st = await readState(), pl = planOf(st), A = AUTO();
  let settings = {}; try { settings = A.all(await _D.kvGet(A.KEY)); } catch (e) {}
  const bf = obj(st.backfill), gl = obj(st.golive);
  return { ok: true, plan: pl, keys: SWITCH.map(function(k){ const a = A.BY[k] || {}; return { key: k, name: s(a.name) || k, desc: s(a.desc), on: !!settings[k] }; }),
    steps: ['A portal link for every open job that has none (nothing is sent by this)', '⏸ Data-entry mode OFF — e-mails and texts go out again', 'The customer automations listed below ON', 'The day before: one 📣 announcement to every staff member in the CRM'],
    replaces: 'Data-entry mode ends with the go-live (the earlier plan said Jan 3, 2027 — the owner now says Jan 1).',
    backfill: { state: s(bf.state) || 'waiting', n: +bf.n || 0, at: s(bf.at), undoneAt: s(bf.undoneAt), undoneBy: s(bf.undoneBy), undone: +bf.undone || 0 },
    golive: { state: s(gl.state) || 'planned', n: +gl.n || 0, doneAt: s(gl.doneAt), switched: Array.isArray(gl.switched) ? gl.switched : [] },
    announce: obj(st.announce), log: arr(st.log).slice(0, 30) };
}
async function admin(op, body, who){
  const at = new Date(_D.now()).toISOString(), by = s(who && (who.name || who.email)) || 'admin';
  const st = await readState();
  if (op === 'date') {
    const d = s(body && body.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !midnightUtc(d)) return { ok: false, code: 400, error: 'Pick a date (YYYY-MM-DD).' };
    if (Date.parse(midnightUtc(d)) <= _D.now()) return { ok: false, code: 400, error: 'Pick a date in the future.' };
    if (obj(st.golive).state === 'done') return { ok: false, code: 409, error: 'The go-live already ran.' };
    st.plan = { date: d, cancelled: false, by: by, setAt: at }; logAdd(st, 'Go-live date set to ' + d + '.', by, at);
  } else if (op === 'cancel') {
    if (obj(st.golive).state === 'done') return { ok: false, code: 409, error: 'The go-live already ran.' };
    st.plan = Object.assign({}, obj(st.plan), { cancelled: true, by: by, setAt: at }); logAdd(st, 'Go-live cancelled — nothing switches on by itself.', by, at);
  } else if (op === 'resume') {
    st.plan = Object.assign({}, obj(st.plan), { cancelled: false, by: by, setAt: at }); logAdd(st, 'Go-live planned again for ' + planOf(st).date + '.', by, at);
  } else if (op === 'undo-backfill') {
    const bf = obj(st.backfill); if (bf.state !== 'done' && bf.state !== 'running') return { ok: false, code: 409, error: 'Nothing to undo.' };
    const n = await _D.revokeTag(BACKFILL_TAG);
    st.backfill = Object.assign({}, bf, { state: 'undone', undoneAt: at, undoneBy: by, undone: n }); logAdd(st, 'Undo: ' + n + ' portal link' + (n === 1 ? '' : 's') + ' made for the active jobs turned off.', by, at);
  } else return { ok: false, code: 400, error: 'Unknown go-live action.' };
  await writeState(st);
  return view();
}
module.exports = { KEY, TZ, DEFAULT_DATE, SWITCH, BACKFILL_TAG, GOLIVE_TAG, BATCH, _D, midnightUtc, localDay, isActive, isOpen, jobsWanted, planOf, announceText, staffRecipients, tick, view, admin };
