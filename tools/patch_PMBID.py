#!/usr/bin/env python3
"""patch PMBID (owner 11/4):
1. "glenn can still be here but office no change, all commercial bid jobs can show glen here until i change to a pm when
   job is won": the Projects PM cell shows an estimator on a commercial job that is still a bid as
   "<name> (estimator · bid)" with no ⚠; once won the ⚠ (not a PM) is back; Office keeps its ⚠.
   An estimator / 1099 / owner on the job never gets a commission queued (_gcQueueCommissionForJob).
2. "i dont want grayco leads going to office email": Leads ⚙ "Lead & bid alert e-mails go to:" takes the word
   none → "No e-mails (leads are in the CRM)"; the server then sends no lead / bid alert e-mails (push and CRM alerts stay;
   emergencies keep their own lists)."""
import sys, os
R = sys.argv[1] if len(sys.argv) > 1 else '.'
def patch(fn, pairs, mark):
    p = os.path.join(R, fn); src = open(p, encoding='utf-8').read()
    if mark in src: print(fn, 'already patched'); return
    for o, n in pairs:
        assert src.count(o) == 1, (fn, o[:70]); src = src.replace(o, n)
    open(p, 'w', encoding='utf-8').write(src); print(fn, 'patched')
patch('index.html', [
 ("W._gcPmCell = function(p){ var v = s(p && p.pm); if (!v) return ''; if (canPM(v)) return clean(v);",
  "W._gcPmCell = function(p){ var v = s(p && p.pm); if (!v) return ''; if (canPM(v)) return clean(v); /*PMBID*/ try { var uu = userOf(v); if (uu && /estimat/i.test(s(uu.role) + ' ' + s(uu.profile)) && (p.isCommercial === true || /commercial/i.test(s(p.type) + ' ' + s(p.jobType))) && !/progress|active|complete|won|signed|closed|lost|cancel|warrant|punch/i.test(s(p.status))) return clean(v) + ' (estimator · bid)'; } catch (e) {}"),
 ("  try{ if(window._gcHasDeparted && window._gcHasDeparted(pm)) return {ok:false, why:pm+' has left'}; }catch(e){}\n\n  if(typeof window._gcCalcCommission!=='function')",
  "  try{ if(window._gcHasDeparted && window._gcHasDeparted(pm)) return {ok:false, why:pm+' has left'}; }catch(e){}\n"
  "  try{ /* PMBID: owners, estimators and 1099s get no commission */ var _n=String(pm).trim().toLowerCase(), _us=(window._crm&&window._crm.users)||[], _u=_us.find(function(x){ return x&&String(x.name||'').trim().toLowerCase()===_n; });\n"
  "    if(_u && (/owner/i.test(String(_u.payType||'')) || /estimat/i.test(String(_u.role||'')+' '+String(_u.profile||'')) || /1099|contractor/i.test(String(_u.payType||_u.workerType||'')))) return {ok:false, why:pm+' gets no commission (owner / estimator / 1099)'};\n"
  "    if(window._gcOwnerNames && (window._gcOwnerNames()||[]).some(function(o){ return String(o).trim().toLowerCase()===_n; })) return {ok:false, why:pm+' is an owner — no commission'}; }catch(e){}\n\n  if(typeof window._gcCalcCommission!=='function')"),
 ("function alertTo(){ var k = cache(), a = k.settings && k.settings.alertTo; a = Array.isArray(a) ? a.map(low).filter(Boolean) : []; return a.length ? a : DEF; }",
  "function alertTo(){ var k = cache(), a = k.settings && k.settings.alertTo; a = Array.isArray(a) ? a.map(low).filter(Boolean) : []; return a.length ? a : DEF; }\nfunction noMail(){ return alertTo().indexOf('none') >= 0; }   /* PMBID */"),
 ("    + alertTo().map(function(e){ return '<span style=\"display:inline-block;margin:0 4px 0 0;padding:1px 8px;border-radius:10px;background:#eef2ff;border:1px solid #c7d2fe\">' + esc(e) + '</span>'; }).join('')",
  "    + (noMail() ? '<span style=\"display:inline-block;padding:1px 8px;border-radius:10px;background:#f1f5f9;border:1px solid #cbd5e1\">No e-mails — leads are in the CRM</span>' : alertTo().map(function(e){ return '<span style=\"display:inline-block;margin:0 4px 0 0;padding:1px 8px;border-radius:10px;background:#eef2ff;border:1px solid #c7d2fe\">' + esc(e) + '</span>'; }).join(''))"),
 ("    + '<input class=\"gc-at-in\" type=\"text\" aria-label=\"Alert e-mail addresses\" style=\"width:100%;padding:6px;box-sizing:border-box\" value=\"' + esc(alertTo().join(', ')) + '\">'",
  "    + '<label style=\"display:block;font-size:13px;margin:0 0 8px\"><input type=\"checkbox\" class=\"gc-at-none\"' + (noMail() ? ' checked' : '') + '> <b>No e-mails</b> (leads are in the CRM — push and CRM alerts still come)</label>'\n"
  "    + '<input class=\"gc-at-in\" type=\"text\" aria-label=\"Alert e-mail addresses\" style=\"width:100%;padding:6px;box-sizing:border-box\" value=\"' + esc(noMail() ? '' : alertTo().join(', ')) + '\">'"),
 ("  var list = s(p.querySelector('.gc-at-in').value).split(/[,;\\s]+/).map(low).filter(Boolean), err = p.querySelector('.gc-at-err');",
  "  var list = s(p.querySelector('.gc-at-in').value).split(/[,;\\s]+/).map(low).filter(Boolean), err = p.querySelector('.gc-at-err');\n  if ((p.querySelector('.gc-at-none') || {}).checked) list = ['none'];   /* PMBID */"),
], '/*PMBID*/')
patch('netlify/functions/bid-inbox.js', [
 ("    const bad = l.filter(x => !/^[^@\\s]+@[^@\\s]+\\.[a-z]{2,}$/.test(x));\n    if (bad.length) throw new Error('The alert e-mail \"' + bad[0] + '\" does not look right.');",
  "    if (l.indexOf('none') >= 0) { out.alertTo = ['none']; } else {   /* PMBID: \"No e-mails\" */\n    const bad = l.filter(x => !/^[^@\\s]+@[^@\\s]+\\.[a-z]{2,}$/.test(x));\n    if (bad.length) throw new Error('The alert e-mail \"' + bad[0] + '\" does not look right.');"),
 ("    if (!out.alertTo.length) out.alertTo = ['office@grayco-cs.com'];\n  }\n  if (b.emergenciesTo != null) {",
  "    if (!out.alertTo.length) out.alertTo = ['office@grayco-cs.com'];\n    }\n  }\n  if (b.emergenciesTo != null) {"),
], 'PMBID')
patch('netlify/functions/_lib/bid-alerts.js', [  # (the MAIL_OFF follow-up was applied by hand on 11/8; see git)
 ("    const l = v && Array.isArray(v.alertTo) ? v.alertTo.map(x => low(x && typeof x === 'object' ? x.email : x)).filter(x => EMAIL_RE.test(x)) : [];\n    return Array.from(new Set(l.length ? l : ['office@grayco-cs.com']));",
  "    if (v && Array.isArray(v.alertTo) && v.alertTo.some(x => low(x) === 'none')) return [];   /* PMBID: \"No e-mails (leads are in the CRM)\" */\n    const l = v && Array.isArray(v.alertTo) ? v.alertTo.map(x => low(x && typeof x === 'object' ? x.email : x)).filter(x => EMAIL_RE.test(x)) : [];\n    return Array.from(new Set(l.length ? l : ['office@grayco-cs.com']));"),
], 'PMBID')
