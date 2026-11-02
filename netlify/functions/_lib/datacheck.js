/* ── GrayCo — NIGHTLY DATA CHECK (patch AUTO6) ──────────────────────────────────────────────────────────────
   Owner (10/21): "yes 10" — every night the CRM looks for duplicate customers, jobs missing a PM / address /
   contract amount / signed contract, and leads missing a due date or an assignee, and puts them on the Office
   To-Do. It never deletes or merges anything by itself: the to-do opens a list with an Open button per record,
   and a Merge helper for duplicate customers that an admin confirms (index.html, patch AUTO6).

   ONE item on the shared Office To-Do (gc_office_tasks, id DATACHECK_NIGHTLY, kind 'datacheck'):
     label  "🧹 Nightly data check — N things to fix"
     items  one checklist line per problem (TD2 shows 0/N with an expand)
     refs   [{ key, kind: 'dup-customer'|'job'|'lead', ids, label, why: [..] }] — what the list window opens
     sig    a fingerprint of the problems: a done item comes back only when the problems change.
   Nothing found → the item is marked done (autoDone). The Admin page counts it under its data warnings.
   ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */
'use strict';
const crypto = require('crypto');
const ID = 'DATACHECK_NIGHTLY';

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function num(v){ const n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
function digits(v){ return s(v).replace(/\D/g, ''); }
function phone10(v){ const d = digits(v); return d.length === 11 && d[0] === '1' ? d.slice(1) : (d.length === 10 ? d : ''); }
function normName(v){ return low(v).replace(/\b(llc|inc|co|corp|company|the|mr|mrs|ms|dr)\b\.?/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function streetKey(a){ const m = /^\s*(\d+)\s+([A-Za-z]+)/.exec(s(a)); return m ? (m[1] + ' ' + m[2]).toLowerCase() : ''; }
function okEmail(e){ return /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i.test(s(e)); }

const CLOSED_JOB = /complet|closed|lost|dead|cancel|archiv|warranty|paid in full|^paid$|void|declin/i;
const PRE_JOB = /bid|quot|propos|estimat|lead|prospect|pending|draft|inspection/i;
const CLOSED_LEAD = /^(won|lost|dead|deleted|converted|declined|not\s*bidding|no\s*bid|pass(ed)?|archived|cancell?ed|closed|dismissed|merged|submitted)$/i;

function contractAmount(p){ return num(p.contract) || num(p.contractAmt) || num(p.contractAmount) || num(p.contractValue) || num(p.revenue); }
function hasSigned(p, docs){
  if (p.contractSigned || p.contractSignedAt || s(p.contractUrl) || p.signedAt || (p.autoDocs && p.autoDocs.contract) || s(p.contractFile) || p.contractTypedAt) return true;
  return docs.some(function(d){ return s(d.pid || d.projectId) === s(p.id) && /contract|agreement/i.test(s(d.category || d.type || d.kind) + ' ' + s(d.name || d.title || d.filename)) && !/unsigned|draft/i.test(s(d.name || d.title)); });
}

/* → { problems: [ref], count } */
function analyze(data, t){
  t = t || Date.now();
  const out = [];
  const dead = {}; (Array.isArray(data.gc_deleted_projects) ? data.gc_deleted_projects : []).forEach(function(x){ dead[s(x)] = 1; });
  /* 1. duplicate customers: same e-mail, same phone, or same name + same street number/name */
  const cust = arr(data.customers).filter(function(c){ return c.id && c.deleted !== true && !c._deleted; });
  const parent = {}; function find(x){ while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(a, b){ a = find(a); b = find(b); if (a !== b) parent[b] = a; }
  cust.forEach(function(c){ parent[s(c.id)] = s(c.id); });
  const why = {};   /* group root → reasons */
  const idx = { e: {}, p: {}, n: {} };
  cust.forEach(function(c){
    const id = s(c.id), e = low(c.email || c.contactEmail), ph = phone10(c.phone || c.cell || c.mobile), nk = normName(c.name || c.company), sk = streetKey(c.address);
    if (okEmail(e)) { if (idx.e[e]) { union(idx.e[e], id); (why[idx.e[e]] = why[idx.e[e]] || {})['same e-mail ' + e] = 1; } else idx.e[e] = id; }
    if (ph) { if (idx.p[ph]) { union(idx.p[ph], id); (why[idx.p[ph]] = why[idx.p[ph]] || {})['same phone'] = 1; } else idx.p[ph] = id; }
    if (nk && sk) { const k = nk + '|' + sk; if (idx.n[k]) { union(idx.n[k], id); (why[idx.n[k]] = why[idx.n[k]] || {})['same name and address'] = 1; } else idx.n[k] = id; }
    else if (nk && nk.length > 5 && !sk) { const k = nk + '|'; if (idx.n[k]) { union(idx.n[k], id); (why[idx.n[k]] = why[idx.n[k]] || {})['same name'] = 1; } else idx.n[k] = id; }
  });
  const groups = {};
  cust.forEach(function(c){ const r = find(s(c.id)); (groups[r] = groups[r] || []).push(c); });
  Object.keys(groups).forEach(function(r){
    const g = groups[r]; if (g.length < 2) return;
    const reasons = {}; g.forEach(function(c){ Object.keys(why[s(c.id)] || {}).forEach(function(w){ reasons[w] = 1; }); });
    const ids = g.map(function(c){ return s(c.id); }).sort();
    out.push({ key: 'dup:' + ids.join(','), kind: 'dup-customer', ids, label: 'Possible duplicate customers: ' + g.map(function(c){ return s(c.name || c.company) || s(c.email) || s(c.id); }).join(' / '), why: Object.keys(reasons).length ? Object.keys(reasons) : ['look alike'] });
  });
  /* 2. jobs missing a PM / address / contract amount / signed contract (open jobs; a signed contract only once it is past bidding) */
  const docs = arr(data.projectDocs).concat(arr(data.gc_project_docs));
  arr(data.projects).forEach(function(p){
    if (!p.id || p.deleted === true || p._deleted || dead[s(p.id)] || /^__TEST__/.test(s(p.id))) return;
    const st = s(p.status || p.stage);
    if (CLOSED_JOB.test(st)) return;
    const pre = PRE_JOB.test(st), miss = [];
    if (!pre && !s(p.pm || p.projectManager || p.pmName)) miss.push('no PM');   /* patch DATAFULL: a bidding job needs only its name and address */
    if (!s(p.address || p.jobAddress)) miss.push('no address');
    if (!pre && !(contractAmount(p) > 0)) miss.push('no contract amount');
    if (!pre && !hasSigned(p, docs)) miss.push('no signed contract');
    if (!miss.length) return;
    const po = s(p.autoPO || p.po);
    out.push({ key: 'job:' + s(p.id), kind: 'job', ids: [s(p.id)], label: (po ? 'PO ' + po + ' · ' : '') + (s(p.name) || 'Job') + ' — ' + miss.join(', '), why: miss, pm: s(p.pm) });
  });
  /* 3. open leads with no due date (bids) or nobody assigned (older than a day) */
  arr(data.leads).forEach(function(l){
    if (!l.id || l.deleted || l._deleted || l.converted || l.notBidding || l.noBid) return;
    if ([l.stage, l.status, l.inboxState].some(function(v){ return CLOSED_LEAD.test(s(v)); })) return;
    const isBid = !!(l.inboxId || l.estimator || l.bidStatus || l.dueUnknown || s(l.dueToCompany) || /commercial|government/i.test(s(l.leadKind || l.type)));
    const age = (t - Date.parse(l.createdAt || l.receivedAt || l.date || l.updatedAt || 0)) / 3600000;
    const miss = [];
    if (isBid && !s(l.bidDue)) miss.push('no bid due date');
    if (!s(l.pm || l.estimator) && isFinite(age) && age > 24) miss.push('nobody assigned');
    if (!miss.length) return;
    out.push({ key: 'lead:' + s(l.id), kind: 'lead', ids: [s(l.id)], label: (s(l.name || l.title || l.company) || 'Lead') + ' — ' + miss.join(', '), why: miss });
  });
  return { problems: out, count: out.length, at: new Date(t).toISOString() };
}

function sigOf(problems){ return crypto.createHash('sha256').update(problems.map(function(p){ return p.key + ':' + p.why.join(','); }).sort().join('|')).digest('hex').slice(0, 16); }

/* the Office To-Do item for a report (null = nothing to fix) */
function todoFor(rep, prev){
  const now = new Date().toISOString();
  if (!rep.count) return prev && !prev.done ? Object.assign({}, prev, { done: true, autoDone: true, doneBy: 'Nightly data check', doneAt: now, updatedAt: now, refs: [], items: [] }) : null;
  const sig = sigOf(rep.problems);
  if (prev && prev.sig === sig) return null;   /* nothing changed since last night (done stays done) */
  const nDup = rep.problems.filter(function(p){ return p.kind === 'dup-customer'; }).length, nJob = rep.problems.filter(function(p){ return p.kind === 'job'; }).length, nLead = rep.problems.filter(function(p){ return p.kind === 'lead'; }).length;
  return Object.assign({}, prev || {}, {
    id: ID, kind: 'datacheck', label: '🧹 Nightly data check — ' + rep.count + ' thing' + (rep.count === 1 ? '' : 's') + ' to fix',
    note: [nDup ? nDup + ' possible duplicate customer' + (nDup === 1 ? '' : 's') : '', nJob ? nJob + ' job' + (nJob === 1 ? '' : 's') + ' missing info' : '', nLead ? nLead + ' lead' + (nLead === 1 ? '' : 's') + ' missing a due date / assignee' : ''].filter(Boolean).join(' · ') + '. Tap “Open list” — nothing is changed until you do it.',
    items: rep.problems.slice(0, 80).map(function(p){ return { id: p.key, label: p.label, done: false }; }),
    refs: rep.problems.slice(0, 150), sig, checkedAt: rep.at, prio: 'med', addedBy: 'Nightly data check', addedAt: (prev && prev.addedAt) || now, updatedAt: now,
    done: false, autoDone: false, deleted: false
  });
}

/* the nightly run (core = portal.js _core) */
async function run(core, t){
  if (String(process.env.DATACHECK_OFF || '') === '1') return { off: true };
  const data = await core.kvRead(JOB_KEYS);
  const rep = analyze(data, t);
  /* patch DATAFULL: the per-job data checklist (_lib/jobdata.js) — kept for the morning alert and the CRM's board */
  let full = null;
  try { data.docs = await docRows(); full = JD.checkAll(data, { now: t }); await saveReport(core, full, null); } catch (e) { full = { error: String(e && e.message || e) }; }
  let wrote = false;
  const r = await core.kvListUpdate('gc_office_tasks', function(l){
    const i = l.findIndex(function(x){ return x && s(x.id) === ID; });
    const next = todoFor(rep, i >= 0 ? l[i] : null);
    if (!next) return null;
    if (i >= 0) l[i] = next; else l.push(next);
    wrote = true;
    return { list: l, check: function(l2){ return l2.some(function(x){ return x && s(x.id) === ID && x.updatedAt === next.updatedAt; }); } };
  });
  return { ok: !!(r && r.ok), count: rep.count, wrote, kinds: rep.problems.reduce(function(a, p){ a[p.kind] = (a[p.kind] || 0) + 1; return a; }, {}),
    jobs: full && !full.error ? { checked: full.checked, complete: full.complete, needInfo: full.needInfo } : full };
}

/* ── patch DATAFULL: the job data checklist, the report and the 7 AM alert ─────────────────────────────────────────
   gc_kv "gc_datafull_report" (JSON text, a one-item list): the last check — totals, the top missing items, each job that
   needs something (most missing first: pid, name, PO, PM, stage, score, the missing keys) and the leads; plus
   alert: { ymd, at, text, to } once the morning alert went out (the CRM shows it once to the admins and the office).
   gc_kv "gc_datafull_prefs" (JSON text list): [{ email, mail, push, app }] — each person's own choice for the
   morning alert (no row = all on). Written by the person on the 🧾 Missing job data board.
   THE MORNING ALERT — about 7 AM Central, Monday to Saturday (data-check.js runs at 12:05 and 13:05 UTC; the run that
   is 7–9 AM in Memphis, daylight saving or not, sends): ONE e-mail + phone push to each admin and the office,
   "🧾 Job data check: 12 jobs need info", the top items and a link (#datafull). Staff only. Never in data-entry mode
   (nothing at all — not even the staff e-mail the pause would let through). Never texts. Claimed once per day
   (gc_autowins_log "datafull:<day>"), so two runs can never send it twice. */
const JD = require('./jobdata.js');
const JOB_KEYS = ['customers', 'projects', 'leads', 'gc_deleted_projects', 'projectDocs', 'schedule', 'invs', 'invoices', 'estimates', 'gc_est_sent', 'gc_claims', 'gc_photo_ai'];
const REPORT = 'gc_datafull_report', PREFS = 'gc_datafull_prefs';
function sbUrl(){ return s(process.env.SUPABASE_URL || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''); }
function svcKey(){ return s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY); }
/* the per-document rows (gc_kv "doc:<id>") — only the fields the rule reads, never the file itself */
async function docRows(){
  const k = svcKey(); if (!k) return [];
  try {
    const r = await fetch(sbUrl() + '/rest/v1/gc_kv?select=key,id:value->>id,pid:value->>pid,projectId:value->>projectId,cat:value->>cat,name:value->>name,type:value->>type,ref:value->>ref,deleted:value->>deleted&key=like.doc:*', { headers: { apikey: k, Authorization: 'Bearer ' + k } });
    if (!r.ok) return [];
    const rows = await r.json();
    return (Array.isArray(rows) ? rows : []).map(function(x){ return { id: s(x.id) || s(x.key).replace(/^doc:/, ''), pid: s(x.pid), projectId: s(x.projectId), cat: s(x.cat), name: s(x.name), type: s(x.type), ref: s(x.ref), deleted: x.deleted === 'true' }; });
  } catch (e) { return []; }
}
/* what is kept: no values, only which items are missing */
function compact(full){
  return { version: full.version, at: full.at, checked: full.checked, complete: full.complete, needInfo: full.needInfo, byStage: full.byStage, top: full.top,
    jobs: full.jobs.slice(0, 400).map(function(j){ return { pid: j.pid, name: j.name, po: j.po, pm: j.pm, stage: j.stage, score: j.score, need: j.need.map(function(m){ return m.key; }) }; }),
    leads: full.leads.slice(0, 200).map(function(l){ return { id: l.id, name: l.name, score: l.score, need: l.need.map(function(m){ return m.key; }) }; }) };
}
async function saveReport(core, full, alert){
  const rep = Object.assign({ id: 'latest' }, compact(full));
  return core.kvListUpdate(REPORT, function(l){
    const prev = l.find(function(x){ return x && x.id === 'latest'; }) || {};
    rep.alert = alert || prev.alert || null;
    return { list: [rep], check: function(l2){ return l2.some(function(x){ return x && x.at === rep.at && (!alert || (x.alert && x.alert.at === alert.at)); }); } };
  });
}
function alertText(full){ return '🧾 Job data check: ' + full.needInfo + ' job' + (full.needInfo === 1 ? '' : 's') + ' need' + (full.needInfo === 1 ? 's' : '') + ' info'; }
function alertHtml(full, base){
  const A = require('./auto-common.js'), esc = A.esc, link = base + '/#datafull';
  const items = full.top.slice(0, 6).map(function(t){ return '<li style="margin:3px 0"><b>' + esc(t.label) + '</b> — ' + t.count + ' job' + (t.count === 1 ? '' : 's') + '</li>'; }).join('');
  const jobs = full.jobs.slice(0, 10).map(function(j){ return '<li style="margin:3px 0"><a href="' + esc(base + '/#datafull=' + encodeURIComponent(j.pid)) + '" style="color:#0F1D2F;font-weight:bold">' + esc(A.clip((j.po ? j.po + ' · ' : '') + (j.name || 'Job'), 90)) + '</a> <span style="color:#55626F">— ' + j.score + '% · ' + esc(j.need.slice(0, 4).map(function(m){ return m.label; }).join(', ')) + (j.need.length > 4 ? ' +' + (j.need.length - 4) + ' more' : '') + (j.pm ? ' · PM ' + esc(j.pm) : '') + '</span></li>'; }).join('');
  return A.shell(alertText(full),
    '<p style="font-size:15px;margin:0 0 10px"><b>' + full.needInfo + ' of ' + full.checked + ' jobs</b> are missing something their stage needs (' + full.complete + ' complete). Bidding jobs only need a name and an address.</p>' +
    (items ? '<p style="margin:10px 0 4px"><b>Most missing</b></p><ul style="padding-left:18px;margin:0">' + items + '</ul>' : '') +
    (jobs ? '<p style="margin:12px 0 4px"><b>Most missing first</b></p><ul style="padding-left:18px;margin:0">' + jobs + '</ul>' : '') +
    (full.leads.length ? '<p style="font-size:13px;color:#55626F">📥 ' + full.leads.length + ' open lead' + (full.leads.length === 1 ? '' : 's') + ' missing who it is assigned to, the source or the next step.</p>' : '') +
    '<p><a href="' + esc(link) + '" style="display:inline-block;background:#0F1D2F;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Open 🧾 Missing job data</a></p>' +
    '<p style="font-size:12px;color:#55626F">Nothing was changed or filled in. An item that does not apply to a job can be marked “N/A for this job” on the board. Turn this e-mail or the phone push off on the board (🔔 My morning alert).</p>');
}
async function prefsOf(core){
  try { const r = await core.kvListRead(PREFS); const o = {}; (r ? r.list : []).forEach(function(x){ if (x && x.email) o[low(x.email)] = x; }); return o; } catch (e) { return {}; }
}
/* the morning alert (core = portal.js _core). opts: { now, force (ignore the clock — the marker still holds) } */
async function morning(core, opts){
  opts = opts || {};
  const A = require('./auto-common.js'), now = opts.now != null ? opts.now : Date.now(), c = A.central(now);
  if (String(process.env.DATACHECK_OFF || '') === '1') return { off: true };
  if (!opts.force && (c.hour < 7 || c.hour >= 10)) return { skipped: 'not 7–9 AM Central (' + c.hour + ':00)' };
  if (!opts.force && c.wd === 'Sun') return { skipped: 'Sunday' };
  if (await A.paused()) return { skipped: 'data-entry mode' };
  const data = await core.kvRead(JOB_KEYS);
  data.docs = await docRows();
  const full = JD.checkAll(data, { now: now });
  if (!full.needInfo) { await saveReport(core, full, null); return { ok: true, needInfo: 0, sent: 0, skipped: 'every job has what its stage needs' }; }
  if (!(await A.once('datafull:' + c.ymd))) return { skipped: 'done already', needInfo: full.needInfo };
  let users = {}; try { users = await core.crmData(true); } catch (e) { users = data; }
  const to = core.adminEmails(users).concat(core.officeEmails(users)).map(low).filter(A.staffEmail).filter(function(e, i, a){ return a.indexOf(e) === i; });
  const prefs = await prefsOf(core), base = A.crmBase(), text = alertText(full), html = alertHtml(full, base);
  const rep = { ok: true, needInfo: full.needInfo, to: to, mailed: 0, pushed: 0, off: [] };
  for (const email of to) {
    const pf = prefs[email] || {};
    if (pf.mail === false) rep.off.push(email + ':mail'); else { const m = await A.staffMail(email, text + ' — GrayCo CRM', html); if (m.ok) rep.mailed++; }
    if (pf.push === false) rep.off.push(email + ':push'); else { try { const p = await core.pushTo([email], { title: text, body: full.top.slice(0, 3).map(function(t){ return t.label + ' (' + t.count + ')'; }).join(' · '), tag: 'gc-datafull' }); rep.pushed += (p && p.sent) || 0; } catch (e) {} }
  }
  const alert = { ymd: c.ymd, at: new Date(now).toISOString(), text: text, top: full.top.slice(0, 3).map(function(t){ return t.label; }), to: to.filter(function(e){ return (prefs[e] || {}).app !== false; }) };
  await saveReport(core, full, alert);
  return rep;
}

module.exports = { ID, analyze, todoFor, sigOf, run, contractAmount, hasSigned, morning, alertText, alertHtml, compact, JOB_KEYS, REPORT, PREFS };
