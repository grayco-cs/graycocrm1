"""patch LEADROUTE2 (owner 11/9: "I want office e-mail to stop getting bids … keep the lead estimator as who gets the notification and
e-mails for commercial jobs, the lead insurance restoration manager gets the insurance program bids the same as Glenn does, waiting
until 5, unless it's emergency — then mitigation and admin get the lead immediately"):
 · office@ never gets lead / bid alert e-mails any more (default list empty; office@ is dropped even if it was saved):
   the alerts go to the person the lead is routed to (after the 5 PM hold), as before.
 · an insurance PROGRAM bid (carrier / TPA program, managed-repair network: Contractor Connection, Alacrity, Accuserve,
   Code Blue, Sedgwick, Crawford …) goes to the Senior Insurance PM, not the Senior Estimator — the same 5 PM hold.
 · every 🚨 emergency (general or mitigation) goes at once to the mitigation list (default Nick + Wesley = the admins), the
   mitigation manager and the on-call PM; the hold never applies to an emergency (lead-hold.js, unchanged)."""
import sys
def patch(path, pairs, marker):
    t = open(path).read()
    if marker in t: print(path, 'already'); return
    for a, b in pairs:
        c = t.count(a); assert c == 1, (path, a[:80], c); t = t.replace(a, b)
    open(path, 'w').write(t); print(path, 'ok')
PROG = r"/\b(insurance|carrier|tpa|preferred.vendor|managed.repair|restoration)\s+(program|network)s?\b|\bprogram\s+(bid|assignment|work.order|job)s?\b|contractor connection|alacrity|accuserve|code blue|sedgwick|crawford (contractor|&)|cotality|\bTPA\b/i"
patch('netlify/functions/_lib/lead-roles.js', [
  ("const SOFT = /giveaway|guide download|lead magnet|free guide/i;", "const SOFT = /giveaway|guide download|lead magnet|free guide/i;\n/*LEADROUTE2: an insurance PROGRAM bid → the Senior Insurance PM (owner 11/9) */\nconst INS_PROGRAM = " + PROG + ";\nfunction insProgram(l){ return !!l && INS_PROGRAM.test(textOf(l) + ' | ' + s(l.source) + ' | ' + s(l.fromEmail || l.from) + ' | ' + s(l.gc || l.company)); }"),
  ("  if (typeof isBid === 'function' && isBid(l)) return 'bid';", "  if (insProgram(l)) return 'insurance';   /* LEADROUTE2 */\n  if (typeof isBid === 'function' && isBid(l)) return 'bid';"),
  ("module.exports = { ROLES, classify,", "module.exports = { ROLES, insProgram, classify,"),
], '/*LEADROUTE2')
patch('index.html', [
  ("var LR_SOFT = /giveaway|guide download|lead magnet|free guide/i, LR_INS_TYPE", "var LR_INS_PROGRAM = " + PROG + ";   /* LEADROUTE2 (same as _lib/lead-roles.js) */\nvar LR_SOFT = /giveaway|guide download|lead magnet|free guide/i, LR_INS_TYPE"),
  ("  if (lrIsBid(l)) return 'bid';\n  var typ = low(l.leadKind || l.type);", "  if (LR_INS_PROGRAM.test(lrText(l) + ' | ' + s(l.source) + ' | ' + s(l.fromEmail || l.from) + ' | ' + s(l.gc || l.company))) return 'insurance';   /* LEADROUTE2 */\n  if (lrIsBid(l)) return 'bid';\n  var typ = low(l.leadKind || l.type);"),
], 'LR_INS_PROGRAM')
patch('netlify/functions/bid-inbox.js', [
  ("const mine = added.filter(it => !it.pm && !it.estimator && est.email && isCommercial(it));", "const mine = added.filter(it => !it.pm && !it.estimator && est.email && isCommercial(it) && !require('./_lib/lead-roles.js').insProgram(it));   /* LEADROUTE2: an insurance program bid → the Senior Insurance PM below */"),
], 'LEADROUTE2')
patch('netlify/functions/_lib/bid-alerts.js', [
  ("    const to = only ? Array.from(new Set(arr(only).map(low).filter(Boolean))) : await recipients(extra);\n    const r = (!only && !to.length && MAIL_OFF)", "    const to = only ? Array.from(new Set(arr(only).map(low).filter(Boolean))) : (await recipients(extra)).filter(x => x !== 'office@grayco-cs.com');   /* LEADROUTE2 (owner 11/9): lead / bid e-mails never go to office@ — the routed estimator / PM gets them */\n    const r = (!only && !to.length && (MAIL_OFF || true))"),
  ("    const officeTo = (await alertList()).concat(await emergencyList());", "    const officeTo = (await alertList()).concat(await emergencyList()).concat(await mitigationList()).concat(E.mitigationMgrs(users));   /* LEADROUTE2: every emergency → mitigation + the admins at once */"),
], 'LEADROUTE2')
