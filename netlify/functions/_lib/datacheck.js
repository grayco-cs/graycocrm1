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
    if (!s(p.pm || p.projectManager || p.pmName)) miss.push('no PM');
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
  const data = await core.kvRead(['customers', 'projects', 'leads', 'gc_deleted_projects', 'projectDocs']);
  const rep = analyze(data, t);
  let wrote = false;
  const r = await core.kvListUpdate('gc_office_tasks', function(l){
    const i = l.findIndex(function(x){ return x && s(x.id) === ID; });
    const next = todoFor(rep, i >= 0 ? l[i] : null);
    if (!next) return null;
    if (i >= 0) l[i] = next; else l.push(next);
    wrote = true;
    return { list: l, check: function(l2){ return l2.some(function(x){ return x && s(x.id) === ID && x.updatedAt === next.updatedAt; }); } };
  });
  return { ok: !!(r && r.ok), count: rep.count, wrote, kinds: rep.problems.reduce(function(a, p){ a[p.kind] = (a[p.kind] || 0) + 1; return a; }, {}) };
}

module.exports = { ID, analyze, todoFor, sigOf, run, contractAmount, hasSigned };
