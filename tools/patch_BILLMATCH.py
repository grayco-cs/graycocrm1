#!/usr/bin/env python3
# BILLMATCH (owner 11/24): "bills or invoices need po or address or customer name to match expense" · "abc bills have address or pos
# to match invoices and expenses per job" · supplier statements: "Paying a statement will place each ABC bill on a job using the
# statement's PO or address" → YES · "office uses those roles she will do it all".
#
# A supplier bill / sub invoice / expense is put on a job BY ITSELF only when it matches THAT job by its PO, its street address or its
# customer name (netlify/functions/_lib/billmatch.js — one file: the functions require() it, this patch inlines the same text as
# <script id="gc-patch-billmatch"> → window._gcBillMatch). Anything else (job-name words, a remembered memo, the sub's only open job,
# the sub being on the job's sub list) is a suggestion: 🧾 Match this invoice / "needs a job", a person picks. Every automatic finder:
#   1. the sub-invoice router (_gcMatchSubInvoice, 90 s)            6. 🧾 Supplier statement (SUPSTMT jobFor: a memo / a remembered memo
#   2. FINDJOB (_gcJobForInvoice: the 60 s finder, Assign by PO)        is a suggestion; a bill a person placed keeps its job on pay)
#   3. INVLINK (match / matchPayable 'sure': 🔗 Bills sweep,        7. the accounting scan's expense → job (_gcRunAccountingScan)
#      ACCTAUTO / INVJOBS re-check, QuickBooks history import)       8. GC_AUTO card / QuickBooks CSV queue (_gcMatchJob by name)
#   4. QBCSV (_gcQbMatch matchJob, money out: QuickBooks CSV import, 9. 💰 Money inbox preselect (job name)
#      🔗 QuickBooks ↔ CRM, 💳 card suggestions' memo part)          10. 📧 Check Gmail (the bundle: "the sub is on the job" placed it)
#   5. the server (_lib/subinv.js: e-mailed / dropped bills, SHIPTO, MONEYMAIL — edited in place, not here)
# Plus: the Office role (Office / Office Manager / Office Admin) is an accounting role (🧾 Supplier statement, 💵 lump-sum pay) — by role.
# Client (customer) invoices keep their matchers. Nothing already placed is moved; a job a person picked is never overridden.
# Every anchor must occur exactly once. Also keeps tools/supstmt_tail.js (SUPSTMT's source) in step.
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'index.html')
s = open(p, encoding='utf-8').read()
assert 'BILLMATCH' not in s, 'already patched'
JS = open(os.path.join(HERE, '..', 'netlify', 'functions', '_lib', 'billmatch.js'), encoding='utf-8').read()
assert '</script' not in JS.lower()

def rep(a, b, count=1):
    global s
    n = s.count(a)
    assert n == count, (n, a[:140])
    s = s.replace(a, b)

# ── 0. window._gcBillMatch, early (every finder below calls it at run time) ──
rep('<script id="gc-patch-quiet">', '<script id="gc-patch-billmatch">\n' + JS.rstrip('\n') + '\n</script>\n<script id="gc-patch-quiet">')

# ── 1. the sub-invoice router ──
rep("""    if(jobCertain){ result.pid=bestJob.id; result.jobCertain=true; result.jobConf=jobConfPct; }""",
"""    /* BILLMATCH: on a job by itself only by its PO, street address or customer name — a job-name match is a guess for the office */
    if(jobCertain && bestJob && window._gcBillMatch && !window._gcBillMatch.ok(inv, bestJob)){ jobCertain=false; result.jobNoBasis=true; }
    if(jobCertain){ result.pid=bestJob.id; result.jobCertain=true; result.jobConf=jobConfPct; }""")

# ── 2. FINDJOB ──
rep("""  if(top===1) return null;   /* INVLINK-C1: the customer's name alone is a suggestion, never a link (owner 11/19: A & B's invoices on its first job) */
  return best[0].p;""",
"""  if(top===1) return null;   /* INVLINK-C1: the customer's name alone is a suggestion, never a link (owner 11/19: A & B's invoices on its first job) */
  /* BILLMATCH: a bill goes on a job by itself only by its PO, street address or customer name — the job name alone: the office picks */
  if(window._gcBillMatch && !(/^(client|customer|client-review)$/i.test(String(inv.type||'')) || (!inv.type && inv.client)) && !window._gcBillMatch.ok(inv, best[0].p)) return null;
  return best[0].p;""")

# ── 3. INVLINK: 'sure' for a bill needs the PO, street address or customer name ──
rep("""  return { level: level, top: top || null, pid: top && level === 'sure' ? top.pid : '', conf: top ? Math.max(0, Math.min(100, top.score)) : 0, list: out.slice(0, 6) };
}
function sureJob(""",
"""  if (level === 'sure' && !client && !bmOk(inv, top.p)) { level = 'likely'; top.why.push('but no PO, street address or customer name of this job on the bill — a person picks'); }   /* BILLMATCH */
  return { level: level, top: top || null, pid: top && level === 'sure' ? top.pid : '', conf: top ? Math.max(0, Math.min(100, top.score)) : 0, list: out.slice(0, 6) };
}
/* BILLMATCH (owner 11/24): a bill / expense is placed by itself only by its PO, street address or customer name (window._gcBillMatch) */
function bmOk(inv, p){ var B = W && W._gcBillMatch; return !B || !p || B.ok(inv, p); }
function sureJob(""")
rep("""    m.pid = m.level === 'sure' ? top.pid : '';
  }
  return m;""",
"""    if (m.level === 'sure' && !bmOk(inv, top.p)) { m.level = 'likely'; top.why.push('but no PO, street address or customer name of this job on the bill — a person picks'); }   /* BILLMATCH */
    m.pid = m.level === 'sure' ? top.pid : '';
  }
  return m;""")

# ── 4. QBCSV: money out (a bill, an expense) → its job only by the PO, street address or customer name ──
rep("""  for (var i = 0; i < mkeys.length; i++) { var r = mm[mkeys[i]]; if (r && r.pid && byId[s(r.pid)] && !byId[s(r.pid)].lost) return { pid: s(r.pid), conf: 99, how: 'remembered', why: 'this memo went to ' + byId[s(r.pid)].name + ' before', cands: [{ pid: s(r.pid), score: 99, why: 'remembered', name: byId[s(r.pid)].name }] }; }""",
"""  /* BILLMATCH (owner 11/24): money OUT (a bill, an expense) goes on a job by itself only when its own words name the job's PO, street
     address or customer (the vendor's name never counts) — a job name / a memo remembered from another bill is a suggestion: a person picks */
  function bmRec(){ return { text: [input.memo, input.desc, input.cust, input.klass, input.text].concat((input.lines || []).map(function(l){ return [l.memo, l.desc, l.cust, l.klass].join(' '); })).join(' \\n '), customer: s(input.cust).split(':')[0] }; }
  function bmOk(pid){ var B = W._gcBillMatch; if (!B || input.side === 'income') return true; var J = byId[s(pid)]; return !!J && B.ok(bmRec(), J.p); }
  for (var i = 0; i < mkeys.length; i++) { var r = mm[mkeys[i]]; if (r && r.pid && byId[s(r.pid)] && !byId[s(r.pid)].lost) {
    if (!bmOk(r.pid)) return { pid: '', conf: 90, how: 'remembered', noBasis: true, why: 'this memo went to ' + byId[s(r.pid)].name + ' before — but it names no PO, street address or customer of that job: pick the job', cands: [{ pid: s(r.pid), score: 90, why: 'remembered (check it)', name: byId[s(r.pid)].name }] };   /* BILLMATCH */
    return { pid: s(r.pid), conf: 99, how: 'remembered', why: 'this memo went to ' + byId[s(r.pid)].name + ' before', cands: [{ pid: s(r.pid), score: 99, why: 'remembered', name: byId[s(r.pid)].name }] }; } }""")
rep("""  if (top.score >= 70 && (!sec || top.score - sec.score >= 8)) return { pid: top.pid, conf: top.score, how: top.how, why: top.why, cands: sc.slice(0, 5) };""",
"""  if (top.score >= 70 && (!sec || top.score - sec.score >= 8) && !bmOk(top.pid)) return { pid: '', conf: top.score, how: top.how, noBasis: true, why: 'a guess (' + top.why + ') — no PO, street address or customer name of this job on it: pick the job', cands: sc.slice(0, 5) };   /* BILLMATCH */
  if (top.score >= 70 && (!sec || top.score - sec.score >= 8)) return { pid: top.pid, conf: top.score, how: top.how, why: top.why, cands: sc.slice(0, 5) };""")

# ── 5. 🧾 Supplier statement (SUPSTMT; the same edits in tools/supstmt_tail.js) ──
SS = []
def ss(a, b):
    SS.append((a, b)); rep(a, b)
ss("""     memo / customer name (patch QBCSV's matcher, window._gcQbMatch), then the bill's own job. Each line shows the job, why, and:""",
"""     memo / customer name (patch QBCSV's matcher, window._gcQbMatch), then the bill's own job. Each line shows the job, why, and:
     (BILLMATCH, owner 11/24: a line goes on a job by itself only by its PO, ship-to / street address or customer name; a memo / job
     name — or a memo a person put on a job before — is a suggestion the person picks; a bill a person placed keeps its job on pay)""")
ss("""  for (var k = 0; k < mk2.length; k++) { var m = X.mem[mk2[k]]; if (m && X.byId[m.pid] && !X.byId[m.pid].lost) return take(""",
"""  for (var k = 0; k < mk2.length; k++) { var m = X.mem[mk2[k]]; if (m && X.byId[m.pid] && !X.byId[m.pid].lost && mk2[k].indexOf('memo:') === 0 && !bmOk(l, X.byId[m.pid])) { cand(X.byId[m.pid], 'a person put this memo on this job before (no PO / address / customer on the line — check it)', 85); continue; }   /* BILLMATCH */
    if (m && X.byId[m.pid] && !X.byId[m.pid].lost) return take(""")
ss("""    if (sc[0] && sc[0].score >= 70 && (!sc[1] || sc[0].score - sc[1].score >= 8)) return take(""",
"""    if (sc[0] && sc[0].score >= 70 && (!sc[1] || sc[0].score - sc[1].score >= 8) && bmOk(l, sc[0].J)) return take(   /* BILLMATCH: the memo / job name alone is a suggestion */""")
ss("""/* ── the line's state ── */""",
"""/* BILLMATCH (owner 11/24): the statement line names the job's PO, ship-to / street address or customer (window._gcBillMatch) */
function bmOk(l, J){ var B = W._gcBillMatch; return !B || !J || B.ok({ memo: l.memo, shipTo: l.shipTo, po: l.po }, J.p || J); }
/* ── the line's state ── */""")
ss("""  v.wrong = !!(a.stmtPid && a.invPid && a.stmtPid !== a.invPid);""",
"""  v.wrong = !!(a.stmtPid && a.invPid && a.stmtPid !== a.invPid);
  /* BILLMATCH: a bill a PERSON put on a job keeps it — the statement's PO / address only shows "⚠ Wrong project?"; paying never moves it */
  if (!h.pid && bill && s(bill.pid) && v.pid !== s(bill.pid) && W._gcBillMatch && W._gcBillMatch.placedByPerson(bill)) { v.pid = s(bill.pid); v.keptPerson = true; }""")
ss("""function acctRole(){ if (viewingAs()) return false; var u = meUser(); return !!u && u.active !== false && ACCT_ROLE.test(s(u.role)); }""",
"""/* BILLMATCH (owner 11/24: "office uses those roles she will do it all"): the Office role (Office / Office Manager / Office Admin) is an
   accounting role too — by role, never by name */
var OFFICE_ROLE = /^\\s*office(\\s*(manager|admin(istrator)?|mgr))?\\s*$/i;
function acctRole(){ if (viewingAs()) return false; var u = meUser(); return !!u && u.active !== false && (ACCT_ROLE.test(s(u.role)) || OFFICE_ROLE.test(s(u.role))); }""")

# ── 6. the accounting scan: an expense → a job ──
rep("""        var jid = matchJob(descText);""",
"""        var jid = matchJob(descText);
        if(jid && window._gcBillMatch){ var _bp=((crm().projects)||[]).filter(function(p){ return p && p.id===jid; })[0]; if(!_bp || !window._gcBillMatch.ok(Object.assign({}, e, { text:(e.desc||'')+' '+(e.jobRaw||'') }), _bp)) jid=''; }   /* BILLMATCH: PO / street address / customer name only */""")

# ── 7. GC_AUTO: card / QuickBooks CSV rows into the review queue ──
rep("""        return hit ? hit.id : "";""",
"""        if(hit && window._gcBillMatch && !window._gcBillMatch.ok(String(text||""), hit)) hit=null;   /* BILLMATCH: the job's name alone is not its PO / address / customer */
        return hit ? hit.id : "";""")

# ── 8. 💰 Money inbox: the job preselected only by its PO / street address / customer name ──
rep("""      var m=matchJob(rec);""",
"""      var m=matchJob(rec);
      if(m.pid && window._gcBillMatch){ var _bj=projects().filter(function(p){ return p && p.id===m.pid; })[0]; if(!_bj || !window._gcBillMatch.ok(rec, _bj)) m={ pid:'', why:(m.why?m.why+' — ':'')+'no PO, street address or customer name of the job on it: pick the job' }; }   /* BILLMATCH */""")

# ── 9. 📧 Check Gmail (the bundle): "the sub is on that job" placed the bill — now the office picks (the PO still places it) ──
rep("""if(!Te){for(const Pt of Wt)if(Pt.subs&&Pt.subs.some(jt=>Ne.includes(jt.name.toLowerCase()))){Te=Pt.id,J=Pt.autoPO||"";break}}""",
"""/* BILLMATCH: the sub being on a job is not the bill's job — no PO on it: the office picks */""")

open(p, 'w', encoding='utf-8').write(s)

# tools/supstmt_tail.js: the same SUPSTMT edits (the script's source)
tp = os.path.join(HERE, 'supstmt_tail.js')
t = open(tp, encoding='utf-8').read()
if 'BILLMATCH' not in t:
    for a, b in SS:
        assert t.count(a) == 1, ('tail', a[:100])
        t = t.replace(a, b)
    open(tp, 'w', encoding='utf-8').write(t)
print('BILLMATCH applied')
