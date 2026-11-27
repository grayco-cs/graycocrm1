#!/usr/bin/env python3
"""patch GOODJOB (owner 11/27: "if i approve a lead its a good lead it should be made a job and go into pipeline as bidding").

Every person's approval of a lead marks it GOOD (lwGood {by, at, how}) and makes the job RIGHT AWAY on the approver's own
computer through the Lead Inbox's createJob (status bidding -> Projects -> Pipeline), when the approver's role makes jobs;
else the admin desk's LEADWATCH sweep makes it. A claim in the cloud first (claim, wait, read back), so two computers never
make two jobs. A lead from before OLDER_BEFORE counts when a person approved it after OLDER_BEFORE (the approval's time).
The Lead Inbox's createJob never adds a job to a disk copy of the project list and never makes a second job for a lead.

Usage: python3 tools/patch_GOODJOB.py index.html   (every anchor must be there exactly once; run once)
"""
import sys

path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(path, encoding='utf-8').read()
if '/* patch GOODJOB' in t:
    sys.exit('patch GOODJOB is in already')


def once(a):
    n = t.count(a)
    assert n == 1, 'anchor found %d times: %r' % (n, a[:120])


def rep(a, b):
    global t
    once(a)
    t = t.replace(a, b, 1)


# ── 1. Lead Inbox: setList never adds a job to a disk copy of the project list (patch SYNCSAFE) ──
rep("""    var S = window[name]; if (typeof S !== 'function') return res(false);
    var done = false;
    try {
      S(function(prev){
        var a = Array.isArray(prev) ? prev : [];""",
    """    var S = window[name]; if (typeof S !== 'function') return res(false);
    var done = false, dead = false;
    try {
      S(function(prev){
        if (dead) return prev;   /* patch GOODJOB: too late (the change was given up) — nothing changes */
        var a = Array.isArray(prev) ? prev : [];""")
rep("""      if (done) return; done = true;
      var key = KEYS[name];
      if (!key || typeof window.idbGet !== 'function') return res(false);""",
    """      if (done) return; done = true;
      if (name === '_setProjects') { dead = true; return res(false); }   /* patch GOODJOB (SYNCSAFE): a job is only ever added to the screen's newest list, never to a disk copy */
      var key = KEYS[name];
      if (!key || typeof window.idbGet !== 'function') return res(false);""")

# ── 2. Lead Inbox createJob: never a second job for a lead; a job that was not saved is an error, not a pid on the lead ──
rep("""    if (lead.pid && projects().some(function(p){ return p && p.id === lead.pid; })) return { ok: true, pid: lead.pid, existed: true, lead: lead };""",
    """    if (lead.pid && projects().some(function(p){ return p && p.id === lead.pid; })) return { ok: true, pid: lead.pid, existed: true, lead: lead };
    var _have = projects().filter(function(p){ return p && s(p.leadId) === s(lead.id) && !p.deleted && !/archiv|deleted/i.test(s(p.status)); })[0];   /* patch GOODJOB: a job made from this lead already (another computer) — linked, not made twice */
    if (_have) return patchLead(lead.id, function(x){ x.pid = _have.id; x.inboxState = 'job'; }).then(function(){ return { ok: true, pid: _have.id, existed: true, lead: lead }; });""")
rep("""      .then(function(){ return addPlansToJob(pid, lead.docs, lead.id); })""",
    """      .then(function(okSet){ if (!okSet && !projects().some(function(x){ return x && x.id === pid; })) throw new Error('The job could not be saved (the screen was busy) — try again.'); return addPlansToJob(pid, lead.docs, lead.id); })   /* patch GOODJOB */""")

# ── 3. LEADWATCH: what a GOOD lead is (a person's approval counts), the sweep, and the approver's own computer ──
A = "function goodLead(l){"
B = "SI.call(W, jobSweep, 6000);\n"
once(A)
once(B)
i, j = t.index(A), t.index(B) + len(B)
old = t[i:j]
assert "function jobSweep(){" in old and "var JOBQ = " in old and "function patchLead(id, patch)" in old, 'the goodLead .. jobSweep region changed'

NEW = r"""/* patch GOODJOB (owner 11/27: "if i approve a lead its a good lead it should be made a job and go into pipeline as bidding"):
   a person's approval of a lead is a GOOD lead — ✅ Approve (a held lead's suggestion), Assign PM / estimator (Lead Inbox, Leads, the
   ✅ Approvals "Assign this lead" card), 👍 Good (the PM's card, the LSA bar, the owner's 🔎 Decide, the GOOD text), the stage moved to Won.
   It is stamped on the lead (lwGood { by, at, how }) and the job is made RIGHT AWAY on the approver's own computer (the Lead Inbox's
   createJob: status bidding → Projects → Pipeline, the lead's PO rules, its PM) when the approver's role makes jobs (the roles with
   Launch Job); else this admin desk's sweep makes it. A claim in the cloud first (gc_kv gc_lwjob_claims: claim, wait, read it back), so
   two computers never make two jobs; never for a BAD / spam / sub lead, never twice (the lead's pid, or a job already made from it).
   A lead from before OLDER_BEFORE becomes a job only when a person approved it after OLDER_BEFORE (the approval's time, not the
   lead's); older untouched leads stay out. On screen: "✅ Job made: <name> — Bidding · Open" on the lead (no pop-up). */
var AUTO_BY = /^(auto\b|crm\b|system|lead ?watch|lead inbox|server|website|grayco\b)/i;
function tms(v){ if (typeof v === 'number') return v; var t = Date.parse(s(v)); return isFinite(t) ? t : NaN; }
function personBy(b){ b = s(b); return !!b && !AUTO_BY.test(b); }
function byName(b){ return s(b).replace(/\s*\((by )?text[^)]*\)\s*$/i, '').replace(/\s*\(via [^)]*\)\s*$/i, ''); }
/* every approval on the lead: { how, by, at (ms), sure } — sure = a GOOD on its own (not only an assignment) */
function apprList(l){
  if (!l) return [];
  var ex = obj(l.leadExtra), g = obj(l.lwGood), c = chk(l), out = [];
  if (s(g.at)) out.push({ how: s(g.how) || 'approved', by: s(g.by), at: tms(g.at), sure: s(g.how) !== 'assigned' });
  if (c === 'good') out.push({ how: 'good', by: s(l.lsaDecidedBy || ex.lsaDecidedBy || l.lsaPmBy), at: tms(l.lsaDecidedAt || ex.lsaDecidedAt || l.lsaPmOkAt || l.lsaPmAt), sure: true });
  if (c === 'pm_good') out.push({ how: 'pm_good', by: s(l.lsaPmBy || l.lsaDecidedBy), at: tms(l.lsaPmAt || l.lsaDecidedAt), sure: true });
  if (/^won$/i.test(s(l.stage))) { var w = arr(l.stageHistory).filter(function(h){ return /^won$/i.test(s(h.to)); }).pop(); if (w && personBy(w.by)) out.push({ how: 'won', by: s(w.by), at: tms(w.at || l.wonAt), sure: true }); }
  if (C.assignee(l) && (l.assignConfirmed || (personBy(l.assignedBy) && !s(l.autoAssignedAt)))) out.push({ how: 'assigned', by: s(l.assignedBy), at: C.asgAt(l), sure: false });
  return out;
}
function explicitGood(l){ return apprList(l).some(function(a){ return a.sure; }); }
function goodLead(l){
  if (!l || badLead(l) || l.deleted || l.converted || l.archived || s(l.mergedInto) || tomb(l)) return false;
  if (notCustomer(l) || !custName(l)) return false;   /* patch FAKEJOB */
  if (/^(lost|dead|declined|dismissed|merged|archived|cancell?ed)$/i.test(s(l.stage) || s(l.status))) return false;
  if (explicitGood(l)) return C.isCustomer(l) || C.isBid(l);   /* patch GOODJOB: a person's GOOD / ✅ Approve / Won */
  return C.isCustomer(l) && !!C.assignee(l);
}
function isoDay(ms){ return isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : ''; }
/* from now on: born on / after OLDER_BEFORE, or a person approved it on / after OLDER_BEFORE (an older untouched lead stays out) */
function inScope(l, c){
  if (!c) return false;
  if (isoDay(C.bornAt(l)) >= c) return true;
  return apprList(l).some(function(a){ return personBy(byName(a.by)) && isoDay(a.at) >= c && (a.sure || C.isCustomer(l)); });
}
var JOBQ = { busy: false, made: [], archived: [], err: '', log: [] };
function myId(){ return myEmail() || low(myName()); }
function patchLead(id, patch){ try { if (typeof W._setLeads === 'function') W._setLeads(function(list){ return arr(list).map(function(l){ return l && s(l.id) === s(id) ? Object.assign({}, l, typeof patch === 'function' ? patch(l) : patch, { updatedAt: new Date().toISOString() }) : l; }); }); } catch (e) {} }
function leadById(id){ return leads().filter(function(l){ return s(l.id) === s(id); })[0] || null; }
function liveJob(pid){ return arr(W._crm && W._crm.projects).filter(function(p){ return p && s(p.id) === s(pid) && !p.deleted && !/archiv|deleted/i.test(s(p.status)); })[0] || null; }
function jobOfLead(l){ return arr(W._crm && W._crm.projects).filter(function(p){ return p && s(p.leadId) === s(l.id) && !p.deleted && !/archiv|deleted/i.test(s(p.status)); })[0] || null; }
/* the roles that make jobs (the ones with Launch Job): admin, PM, office — by role, never by name */
function mayMakeJobs(){
  if (vas()) return false; if (admin()) return true;
  var u = user(), r = ''; try { r = s(typeof W._gcRoleOf === 'function' ? W._gcRoleOf(u) : u.role); } catch (e) { r = s(u.role); }
  return /^(admin|project manager|office manager|office)$/i.test(r || s(u.role));
}
function mine(a){ var b = low(byName(a && a.by)); return !!b && (b === low(myName()) || b === myEmail()); }
function wait(ms){ return new Promise(function(r){ ST.call(W, r, ms); }); }

/* the claim, in the cloud (one row for every computer): write mine, wait, read it back — only the computer whose claim is there goes on */
var CLK = 'gc_lwjob_claims', CL_WAIT = +W.__GC_LWJOB_WAIT__ || 3000, CL_TTL = 120000, GRACE = +W.__GC_LWJOB_GRACE__ || 90000;
function sbConf(){ var k = '', u = ''; try { k = s(localStorage.getItem('grayco_sb_key')); u = s(localStorage.getItem('grayco_sb_url')); } catch (e) {} if (/^"/.test(k)) { try { k = JSON.parse(k); } catch (e) {} } if (/^"/.test(u)) { try { u = JSON.parse(u); } catch (e) {} } return k && u && W.fetch ? { k: k, u: s(u).replace(/\/$/, '') } : null; }
function clGet(){
  var c = sbConf(); if (!c) return Promise.resolve(undefined);
  return W.fetch(c.u + '/rest/v1/gc_kv?key=eq.' + CLK + '&select=value', { headers: { apikey: c.k }, cache: 'no-store' })
    .then(function(r){ return r && r.ok ? r.json() : undefined; }).then(function(rows){ if (!Array.isArray(rows)) return undefined; var v = rows[0] ? rows[0].value : {}; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = {}; } } return Object.assign({}, obj(v)); }, function(){ return undefined; });
}
function clPut(v){
  var c = sbConf(); if (!c) return Promise.resolve(false);
  return W.fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { apikey: c.k, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: CLK, value: v, updated_at: new Date().toISOString() }) })
    .then(function(r){ return !!(r && r.ok); }, function(){ return false; });
}
function claim(id){
  var me = myId(); if (!me) return Promise.resolve(false);
  return clGet().then(function(st){
    if (st === undefined) return false;
    var t = Date.now(), c = obj(st[id]);
    if (s(c.pid)) return false;   /* made already (another computer) */
    if (c.by && c.by !== me && t - tms(c.at) < CL_TTL) return false;   /* another computer is on it */
    Object.keys(st).forEach(function(k){ var a = tms(obj(st[k]).at); if (!isFinite(a) || t - a > 3 * 864e5) delete st[k]; });
    st[id] = { by: me, at: new Date(t).toISOString() };
    return clPut(st).then(function(ok){ if (!ok) return false; return wait(CL_WAIT).then(clGet).then(function(st2){ var c2 = obj(st2 && st2[id]); return c2.by === me && !s(c2.pid); }); });
  }, function(){ return false; });
}
function clDone(id, pid){ return clGet().then(function(st){ if (st === undefined) return; st[id] = { by: myId(), at: new Date().toISOString(), pid: s(pid) }; return clPut(st); }).catch(function(){}); }

/* mark the lead GOOD (who and when) — the approval a person just gave; a BAD lead is never marked */
function markGood(id, how, by){
  var l = leadById(id); if (!l || badLead(l)) return false;
  if (s(obj(l.lwGood).at)) return true;
  var at = new Date().toISOString(), who = s(by) || myName() || myEmail(), p = { lwGood: { by: who, byEmail: myEmail(), at: at, how: s(how) || 'approved' } };
  patchLead(id, p); return true;
}
/* make the job for one GOOD lead (this computer): claim → the Lead Inbox's createJob → the lead knows its job */
var MK = {};
function makeJob(id, o){
  o = obj(o); id = s(id);
  if (MK[id]) return MK[id];
  var log = function(x){ x.id = id; x.at = new Date().toISOString(); x.via = s(o.via); JOBQ.log.push(x); JOBQ.log = JOBQ.log.slice(-40); return x; };
  var l = leadById(id);
  if (!l) return Promise.resolve(log({ skipped: 'no lead' }));
  if (!goodLead(l)) return Promise.resolve(log({ skipped: 'not a GOOD customer lead' }));
  if (s(l.pid) && liveJob(l.pid)) return Promise.resolve(log({ skipped: 'has a job', pid: s(l.pid) }));
  var had = jobOfLead(l);
  if (had) { patchLead(id, { pid: had.id, inboxState: 'job' }); return Promise.resolve(log({ linked: had.id })); }
  var LI = W._gcLeadInbox; if (!LI || typeof LI.createJob !== 'function') return Promise.resolve(log({ skipped: 'not ready' }));
  if (o.sweep) { try { if (W._gcStaleGate && W._gcStaleGate.holdSweeps()) return Promise.resolve(log({ skipped: 'stale copy' })); } catch (e) {} }   /* a sweep never runs on a stale copy (a person's approval is that person's own save, like "Create bid job") */
  patchLead(id, { lwJobClaim: { by: myId(), at: new Date().toISOString() } });
  var p = claim(id).then(function(ok){
    if (!ok) return log({ skipped: 'another computer has it' });
    var l2 = leadById(id);
    if (!l2 || !goodLead(l2) || (s(l2.pid) && liveJob(l2.pid))) return log({ skipped: 'changed' });
    var h2 = jobOfLead(l2); if (h2) { patchLead(id, { pid: h2.id, inboxState: 'job' }); clDone(id, h2.id); return log({ linked: h2.id }); }
    return Promise.resolve(LI.createJob(id)).then(function(r){
      if (!(r && r.pid)) return log({ err: 'no job' });
      var why = apprList(l2).filter(function(a){ return a.sure; })[0] || apprList(l2)[0];
      JOBQ.made.push({ lead: id, pid: r.pid, at: Date.now(), via: s(o.via) });
      var g0 = obj(leadById(id) && leadById(id).lwGood);
      if (!s(g0.at) && why) patchLead(id, { lwGood: { by: byName(why.by), at: isFinite(why.at) ? new Date(why.at).toISOString() : new Date().toISOString(), how: why.how } });   /* the approval that made it GOOD (another computer / a text) */
      patchLead(id, { lwJob: { pid: r.pid, at: new Date().toISOString(), by: myName() || myEmail(), via: s(o.via), why: why ? (why.how + (why.by ? ' — ' + byName(why.by) : '')) : 'assigned, no BAD' } });
      clDone(id, r.pid);
      /* the PM's appointments texted before the job existed → on the job now; the PM gets the job link + the customer portal link (server, once) */
      try { if (typeof W._setSchedule === 'function') W._setSchedule(function(prev){ return arr(prev).map(function(x){ return x && !s(x.pid) && s(x.leadId) === id ? Object.assign({}, x, { pid: r.pid }) : x; }); }); } catch (e) {}
      if (!r.existed) { try { W.fetch('/.netlify/functions/texts?lwjob=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: id, pid: r.pid }) }).catch(function(){}); } catch (e) {} }
      noteSoon();
      return log({ made: r.pid, existed: !!r.existed });
    }, function(e){ JOBQ.err = s(e && e.message); patchLead(id, { lwJob: { err: JOBQ.err, at: new Date().toISOString() } }); return log({ err: JOBQ.err }); });
  }).then(function(x){ delete MK[id]; return x; }, function(e){ delete MK[id]; return log({ err: s(e && e.message) }); });
  MK[id] = p; return p;
}
/* a person approved this lead here: GOOD on the lead, and the job now when this person's role makes jobs (else the admin sweep) */
function approveNow(id, how, o){
  o = obj(o); id = s(id);
  var l = leadById(id); if (!l) return Promise.resolve({ skipped: 'no lead' });
  if (badLead(l) || notCustomer(l)) return Promise.resolve({ skipped: 'BAD / not a customer' });
  if (s(how) && (how !== 'assigned' || C.isCustomer(l))) markGood(id, how, o.by);
  if (!mayMakeJobs()) return Promise.resolve({ skipped: 'the admin desk makes it' });
  var c = cut(), l2 = leadById(id) || l;
  if (!inScope(l2, c) && !(s(how) && how !== 'assigned' && c)) return Promise.resolve({ skipped: 'before ' + c });
  return wait(+W.__GC_LWJOB_SETTLE__ || 400).then(function(){ return makeJob(id, { via: 'approved here' }); });
}
/* the approvals this computer's person just gave (any screen: the stamps say who and when) → the job right away */
var SEEN = { ref: null, tried: {} }, MINE_WIN = 10 * 60000;
function mineScan(){
  if (D.hidden || vas() || !cut()) return;
  var ref = W._crm && W._crm.leads; if (ref === SEEN.ref && !SEEN.again) return; SEEN.ref = ref; SEEN.again = false;
  var t = Date.now(), c = cut();
  leads().forEach(function(l){
    if (SEEN.tried[l.id] || (s(l.pid) && liveJob(l.pid))) return;
    var a = apprList(l).filter(function(x){ return mine(x) && isFinite(x.at) && t - x.at < MINE_WIN && t - x.at > -60000; })[0];
    if (!a || !goodLead(l) || !inScope(l, c)) return;
    SEEN.tried[l.id] = t;
    markGood(l.id, a.how, byName(a.by));   /* GOOD on the lead: who and when (an assignment only on a customer lead — goodLead said so) */
    if (!mayMakeJobs()) return;   /* this role makes no jobs: the admin desk's sweep makes it */
    makeJob(l.id, { via: 'approved here (' + a.how + ')' }).then(function(r){ if (r && (r.skipped === 'another computer has it' || r.skipped === 'not ready' || r.skipped === 'stale copy' || r.err)) ST.call(W, function(){ delete SEEN.tried[l.id]; SEEN.again = true; }, 30000); });
  });
}
SI.call(W, mineScan, 1500);
W.addEventListener('gc:leads-changed', function(){ ST.call(W, mineScan, 300); });
W.addEventListener('gc-lead-assigned', function(){ ST.call(W, function(){ SEEN.ref = null; mineScan(); }, 600); });

function jobSweep(){
  if (JOBQ.busy || D.hidden || !admin() || vas() || !W._gcLeadInbox || typeof W._gcLeadInbox.createJob !== 'function') return;
  try { if (W._gcStaleGate && W._gcStaleGate.holdSweeps()) return; } catch (e) {}
  var c = cut(); if (!c) return;
  var projs = arr(W._crm && W._crm.projects), t = Date.now();
  /* BAD: archive the job a bad lead made (status bidding / empty), never delete */
  var arch = leads().filter(function(l){ return badLead(l) && s(l.pid); }).map(function(l){ return projs.find(function(p){ return p && s(p.id) === s(l.pid) && (s(p.leadId) === s(l.id)) && !/archiv/i.test(s(p.status)) && /^(bidding|lead|)$/i.test(s(p.status)); }); }).filter(Boolean);
  if (arch.length && typeof W._setProjects === 'function') { var ids = {}; arch.forEach(function(p){ ids[p.id] = 1; });
    W._setProjects(function(prev){ return arr(prev).map(function(p){ return p && ids[p.id] ? Object.assign({}, p, { status: 'Archived', archivedWhy: 'bad lead', archivedAt: new Date().toISOString(), archivedBy: 'LEADWATCH (bad lead)', statusBeforeArchive: s(p.status), updatedAt: new Date().toISOString() }) : p; }); });
    JOBQ.archived = JOBQ.archived.concat(Object.keys(ids)); }
  /* the PM picked after the job was made (Won → pick the PM) goes on the job, while it is still bidding with no PM */
  try { var pmFix = {}; leads().forEach(function(l){ var pid = s(obj(l.lwJob).pid), p = pid && liveJob(pid); if (p && !s(p.pm) && s(l.pm) && /^bidding$/i.test(s(p.status))) pmFix[pid] = s(l.pm); });
    if (Object.keys(pmFix).length && typeof W._setProjects === 'function') W._setProjects(function(prev){ return arr(prev).map(function(p){ return p && pmFix[p.id] && !s(p.pm) ? Object.assign({}, p, { pm: pmFix[p.id], updatedAt: new Date().toISOString() }) : p; }); }); } catch (e) {}
  var next = leads().filter(function(l){
    if (!goodLead(l) || (s(l.pid) && liveJob(l.pid)) || MK[l.id] || !inScope(l, c)) return false;
    var e = obj(l.lwJob); if (s(e.err) && t - tms(e.at) < 10 * 60000) return false;   /* a failed try waits 10 minutes */
    var cl = obj(l.lwJobClaim); if (cl.by && cl.by !== myId() && t - tms(cl.at) < CL_TTL) return false;   /* another computer is on it */
    /* a person approved it a moment ago: their own computer makes it (if their role does) */
    if (apprList(l).some(function(a){ return mine(a) && isFinite(a.at) && t - a.at < 20000; })) return false;   /* mine, a moment ago: the approval path below (mineScan) makes it */
    if (apprList(l).some(function(a){ return personBy(byName(a.by)) && !mine(a) && !/\((by )?text/i.test(s(a.by)) && isFinite(a.at) && t - a.at < GRACE; })) return false;
    return true;
  })[0];
  if (!next) return;
  JOBQ.busy = true;
  makeJob(next.id, { via: 'admin sweep', sweep: true }).then(function(){ JOBQ.busy = false; }, function(){ JOBQ.busy = false; });
}
SI.call(W, jobSweep, 6000);

/* "✅ Job made: <name> — Bidding · Open" on the lead (the Leads panel, the Lead Inbox panel, the 📥 New lead card) — no pop-up */
var NOTE_WIN = 15 * 60000;
function noteHtmlFor(l, p){ return '✅ Job made: <b>' + esc(p.name || l.name || 'job') + '</b> — Bidding · <button type="button" data-lw-jobopen="' + esc(p.id) + '" style="border:0;background:none;padding:0;color:#166534;font:700 13px Inter,Arial,sans-serif;text-decoration:underline;cursor:pointer">Open</button>'; }
function notePaint(){
  try {
    var t = Date.now(), want = {};
    JOBQ.made.forEach(function(m){ if (t - m.at < NOTE_WIN) want[m.lead] = m.pid; });
    leads().forEach(function(l){ var j = obj(l.lwJob); if (s(j.pid) && t - tms(j.at) < NOTE_WIN) want[l.id] = s(j.pid); });
    var H = W._gcLeadsHub, openId = ''; try { openId = H && H.ui ? s(H.ui().open) : ''; } catch (e) {}
    var hosts = [];
    var dr = D.getElementById('gcl-drawer'); if (dr && openId && want[openId]) hosts.push([dr, openId]);
    [].forEach.call(D.querySelectorAll('.lx-pane[data-id], .gc-nl-r[data-id]'), function(el){ var id = el.getAttribute('data-id'); if (want[id]) hosts.push([el, id]); });
    [].forEach.call(D.querySelectorAll('[data-lw-jobmade]'), function(n){ var h = n.parentElement, id = n.getAttribute('data-lw-jobmade'); if (!want[id] || !hosts.some(function(x){ return x[0] === h; })) n.remove(); });
    hosts.forEach(function(x){
      var el = x[0], id = x[1], l = leadById(id) || {}, p = liveJob(want[id]); if (!p) return;
      var n = el.querySelector(':scope > [data-lw-jobmade]'), h = noteHtmlFor(l, p);
      if (!n) { n = D.createElement('div'); n.setAttribute('data-lw-jobmade', id); n.setAttribute('role', 'status'); n.setAttribute('data-gc-keep', '1');
        n.style.cssText = 'margin:6px 0;padding:8px 10px;border:1px solid #86efac;border-radius:9px;background:#f0fdf4;color:#14532d;font:13px Inter,Arial,sans-serif;box-sizing:border-box;max-width:100%';
        el.insertBefore(n, el.firstChild); }
      if (n.__h !== h) { n.innerHTML = h; n.__h = h; }
    });
  } catch (e) {}
}
function noteSoon(){ ST.call(W, notePaint, 50); ST.call(W, notePaint, 600); }
SI.call(W, notePaint, 1000);
function openJobId(pid){
  try { if (D.documentElement.classList.contains('_fieldmode') && typeof W._gcJobDashboard === 'function') W._gcJobDashboard(pid);
    else if (typeof W._gcGoToTaskJob === 'function') W._gcGoToTaskJob(pid, ''); else if (typeof W._navToJob === 'function') W._navToJob(pid); else if (typeof W._gcOpenJobProfile === 'function') W._gcOpenJobProfile(pid); else if (W._setView) W._setView('projects'); } catch (e) {}
}
D.addEventListener('click', function(e){ var b = e.target && e.target.closest ? e.target.closest('[data-lw-jobopen]') : null; if (!b) return; e.preventDefault(); e.stopPropagation(); openJobId(b.getAttribute('data-lw-jobopen')); }, true);
/* 🚀 Convert to job on a lead that is a bid job already (made when it was approved): open that job — never a second job for the lead */
W.addEventListener('click', function(e){
  var t = e.target && e.target.closest ? e.target.closest('#gcl-drawer [data-d="convert"]') : null; if (!t) return;
  var H = W._gcLeadsHub, id = ''; try { id = H && H.ui ? s(H.ui().open) : ''; } catch (x) {}
  var l = id && leadById(id), p = l && s(l.pid) && liveJob(l.pid); if (!p) return;
  e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  var n = t.parentElement && t.parentElement.querySelector('[data-lw-convnote]');
  if (!n) { n = D.createElement('div'); n.setAttribute('data-lw-convnote', '1'); n.setAttribute('role', 'status'); n.style.cssText = 'width:100%;margin-top:4px;font:12.5px Inter,Arial,sans-serif;color:#14532d'; t.insertAdjacentElement('afterend', n); }
  n.innerHTML = 'This lead is a job already: <b>' + esc(p.name) + '</b> (' + esc(s(p.status) || 'bidding') + '). Opening it — move it on from the job.';
  ST.call(W, function(){ openJobId(p.id); }, 700);
}, true);
"""

t = t[:i] + NEW + t[j:]

# ── 4. the API ──
rep("jobs: function(){ return JOBQ; }, goodLead: goodLead, badLead: badLead,",
    "jobs: function(){ return JOBQ; }, goodLead: goodLead, badLead: badLead, approve: approveNow, makeJob: makeJob, apprList: apprList, inScope: inScope, mayMakeJobs: mayMakeJobs, markGood: markGood, notePaint: notePaint,   /* patch GOODJOB */")

open(path, 'w', encoding='utf-8').write(t)
print('patch GOODJOB applied')
