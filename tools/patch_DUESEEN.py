#!/usr/bin/env python3
"""Idempotent patch DUESEEN: a bid due date / time is only what the e-mail says, with the words it came from
(owner 10/27: "Due in 23 days · Fri, Nov 20 6:59 PM" on two different bids — he doubts the dates).

netlify/functions/_lib/bid-due.js checkAi(text, aiDue, tx):
  * the text reader's own answer (label + date + time + time zone → Central) wins when it has one;
  * the AI's day is kept only when that day is written in the e-mail (a month name / number with that day), and the AI's
    time only when that time is written there too — otherwise the day alone ("time not stated"), or nothing
    ("Due: not found — add it"): a date or time is never made up;
  * snippet: the words of the e-mail the due date came from ("…Bids due November 20 at 2:00 PM CST…").
netlify/functions/bid-inbox.js stores it on the inbox item (dueSnippet) and the lead copies it; the page shows
"found in the e-mail: '…'" under the due date on the Lead Inbox card and the lead panel, and a date without a time
as "<date> · time not stated". Usage: python3 tools/patch_DUESEEN.py [repo dir]
"""
import sys, os
root = sys.argv[1] if len(sys.argv) > 1 else '.'
MARK = '/* patch DUESEEN'
def edit(path, pairs, label):
    src = open(path, encoding='utf-8').read()
    if MARK in src: print('DUESEEN: ' + label + ' already patched'); return
    for a, b in pairs:
        assert src.count(a) == 1, ('DUESEEN find-string count != 1', label, src.count(a), a[:80])
        src = src.replace(a, b)
    open(path, 'w', encoding='utf-8').write(src); print('DUESEEN: patched ' + label)

BD = [
("""module.exports = { findDue, findDueFor, findSubmit, merge,""",
 MARK + """: never a made-up date or time; the words it came from */
const MON_FULL = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
function dayWritten(text, ymd){
  const m = /^(\\d{4})-(\\d{2})-(\\d{2})/.exec(s(ymd)); if (!m) return -1;
  const mo = +m[2], d = +m[3], t = clean(text), full = MON_FULL[mo - 1], ab = full.slice(0, 3);
  const res = [new RegExp('\\\\b(?:' + full + '|' + ab + (mo === 9 ? '|sept' : '') + ')\\\\.?\\\\s+0?' + d + '(?:st|nd|rd|th)?\\\\b', 'i'),
    new RegExp('\\\\b0?' + d + '(?:st|nd|rd|th)?\\\\s+(?:of\\\\s+)?(?:' + full + '|' + ab + ')\\\\b', 'i'),
    new RegExp('(?:^|[^\\\\d])0?' + mo + '[\\\\/.-]0?' + d + '(?:[\\\\/.-](?:\\\\d{2}|\\\\d{4}))?(?![\\\\d])'),
    new RegExp('\\\\b' + m[1] + '-' + m[2] + '-' + m[3] + '\\\\b')];
  for (const re of res) { const x = re.exec(t); if (x) return x.index; }
  return -1;
}
function timeWritten(text, hm){
  const m = /^(\\d{1,2}):(\\d{2})$/.exec(s(hm)); if (!m) return false;
  const h = +m[1], mi = m[2], h12 = h % 12 || 12, ap = h >= 12 ? 'p' : 'a', t = clean(text);
  if (new RegExp('\\\\b' + h12 + (mi === '00' ? '(?::00)?' : ':' + mi) + '\\\\s*' + ap + '\\\\.?\\\\s*m\\\\b', 'i').test(t)) return true;
  if (new RegExp('\\\\b0?' + h + ':' + mi + '\\\\b').test(t) && h > 12) return true;
  if (h === 12 && mi === '00' && /\\bnoon\\b/i.test(t)) return true;
  return false;
}
function snippetAt(text, at){
  const t = clean(text); if (!(at >= 0)) return '';
  const ls = t.lastIndexOf('\\n', at) + 1; let le = t.indexOf('\\n', at); if (le < 0) le = t.length;
  let a = Math.max(ls, at - 40), b = Math.min(le, at + 110); let sn = t.slice(a, b).replace(/\\s+/g, ' ').trim();
  if (b - at < 30 && le > b) sn += ' ' + t.slice(le + 1, Math.min(t.length, le + 60)).split('\\n')[0].trim();
  return (a > ls ? '…' : '') + sn.slice(0, 160) + (b < le ? '…' : '');
}
function checkAi(text, aiDue, tx){
  tx = tx && typeof tx === 'object' ? tx : { due: s(tx) };
  const t = clean(text);
  if (s(tx.due)) {
    const ai = s(aiDue), due = merge(ai && ai.slice(0, 10) === s(tx.due).slice(0, 10) ? ai : '', tx);
    const keepT = due.length > 10 && (due === s(tx.due) || timeWritten(t, due.slice(11)));
    return { due: keepT ? due : due.slice(0, 10), snippet: snippetAt(t, (function(){ const d0 = dayWritten(t, s(tx.due).slice(0, 10)); return d0 >= 0 ? d0 : tx.at; })()), from: 'text', timeStated: keepT };
  }
  const ai = s(aiDue); if (!/^\\d{4}-\\d{2}-\\d{2}/.test(ai)) return { due: '', snippet: '', from: '' };
  const at = dayWritten(t, ai.slice(0, 10)); if (at < 0) return { due: '', snippet: '', from: 'ai-not-in-text' };
  const tm = ai.length > 10 ? ai.slice(11, 16) : '';
  const ok = tm && timeWritten(t.slice(Math.max(0, at - 80), at + 160), tm);
  return { due: ok ? ai.slice(0, 16) : ai.slice(0, 10), snippet: snippetAt(t, at), from: 'ai', timeStated: !!ok };
}
module.exports = { checkAi, dayWritten, timeWritten, snippetAt, findDue, findDueFor, findSubmit, merge,"""),
]
INBOX = [
("""    const bidDue = BD.merge(aiDue, tx);""",
 """    """ + MARK + """: only a date (and time) the e-mail states, with its words */
    const seen = BD.checkAi(allText, aiDue, tx), bidDue = seen.due, dueSnippet = seen.snippet;"""),
("""      bidDue, dueToCompany: dueTo.company,""",
 """      bidDue, dueSnippet, dueTimeStated: !!seen.timeStated, dueToCompany: dueTo.company,"""),
]
HTML = [
("""    + (l.websiteLead && typeof window._gcWebCardLine === 'function' ? window._gcWebCardLine(l) : '<div class="due ' + c.cls + '">⏱ ' + esc(c.txt) + (l.bidDueWas ? ' <span class="sub">(was ' + esc(fmtWhen(l.bidDueWas)) + ')</span>' : '') + '</div>')   /* patch WEB */""",
 """    + (l.websiteLead && typeof window._gcWebCardLine === 'function' ? window._gcWebCardLine(l) : '<div class="due ' + c.cls + '">⏱ ' + esc(c.txt) + (s(l.bidDue).length === 10 ? ' · time not stated' : '') + (l.bidDueWas ? ' <span class="sub">(was ' + esc(fmtWhen(l.bidDueWas)) + ')</span>' : '') + (window._gcLA && window._gcLA.edit ? ' <button class="b" data-a="editdue" title="Correct the bid due date" style="padding:2px 8px;font-size:12px">✏️ ' + (l.bidDue ? 'Fix' : 'Add it') + '</button>' : '') + '</div>'
      + (s(l.dueSnippet) ? '<div class="sub" style="font-style:italic">found in the e-mail: “' + esc(s(l.dueSnippet).slice(0, 170)) + '”</div>' : ''))   /* patch WEB; """ + MARK + """: time not stated / the e-mail's words / ✏️ fix it */"""),
("""  if (a === 'publish') return dlgPublish(id);
}""",
 """  if (a === 'publish') return dlgPublish(id);
  if (a === 'editdue') { var go = function(){ try { return !!(window._gcLA && window._gcLA.edit(id, b)); } catch (x) { return false; } }; if (!go()) setTimeout(function(){ if (!go()) toast('Open the lead to add the bid due date.'); }, 450); return; }   """ + MARK + """ */
}"""),
]
HTML.append(("""  ['dueToCompany', 'dueToContact', 'dueToEmail', 'dueToPhone', 'submitMethod', 'submitWhere'].forEach(function(f){ if (!s(l[f]) && s(it[f])) l[f] = s(it[f]); });   /* LA: who it is due to */""",
 """  ['dueToCompany', 'dueToContact', 'dueToEmail', 'dueToPhone', 'submitMethod', 'submitWhere'].forEach(function(f){ if (!s(l[f]) && s(it[f])) l[f] = s(it[f]); });   /* LA: who it is due to */
  if (s(it.dueSnippet) && !(prev && prev.bidDueManual)) l.dueSnippet = s(it.dueSnippet).slice(0, 300);   /* patch DUESEEN: the e-mail's words for the due date */"""))
edit(os.path.join(root, 'index.html'), HTML, 'index.html')
edit(os.path.join(root, 'netlify', 'functions', '_lib', 'bid-due.js'), BD, 'bid-due.js')
edit(os.path.join(root, 'netlify', 'functions', 'bid-inbox.js'), INBOX, 'bid-inbox.js')
