#!/usr/bin/env python3
"""patch BPHEAD (owner 11/20 on a bidding job's page: "where can I add jobs to bid portal from here"): BIDPOST's job-page bar sits in
the Job Tools box far down the page. The job header's button group (📄 Generate Proposal · 📝 Word Doc · ✏️ Edit Project) now also has
"📢 Put on bid portal" — or "📢 On bid portal ✓ · Manage" once posted — for an admin, an estimator and that job's PM (BIDPOST's canPost),
desk and phone. It opens the same sheet, the job filled in (_gcBidPost.open({ pid }))."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
MARK = '/* patch BPHEAD */'
if MARK in src: print('already patched'); sys.exit(0)
OLD = "function paint(){ try { paintEst(); } catch (e) { warn(e); } try { paintJob(); } catch (e) { warn(e); }"
NEW = MARK + """ function paintHead(){   /* the job header's button group, next to ✏️ Edit Project */
  var hb = D.getElementById('gcbp-head'), op = W._gcOpenProject, p = op && op.id ? proj(op.id) : null, ed = null, main = D.querySelector('main');
  if (p && main) { var bs = main.getElementsByTagName('button'); for (var i = 0; i < bs.length && i < 120; i++) if (/^\\s*(✏️\\s*)?Edit Project\\s*$/.test(bs[i].textContent || '')) { ed = bs[i]; break; } }
  var c = p ? ctxOf({ pid: p.id }) : null;
  if (!ed || !canPost(c)) { if (hb) hb.remove(); return; }
  var j = postedFor(c), on = !!(j && !j.deleted), t = on ? '📢 On bid portal ✓ · Manage' : '📢 Put on bid portal';
  css(); if (!hb) { hb = D.createElement('button'); hb.type = 'button'; hb.id = 'gcbp-head'; hb.className = 'gcbp-btn'; hb.setAttribute('data-gc-keep', '1'); hb.style.alignSelf = 'stretch';
    hb.addEventListener('click', function(ev){ ev.stopPropagation(); open({ pid: hb.__pid }); }); }
  if (hb.textContent !== t) { hb.textContent = t; hb.title = on ? 'On the GrayCo bid portal — change it or take it off' : 'Put this job on the GrayCo bid portal for sub pricing'; }
  hb.__pid = p.id; if (hb.nextSibling !== ed) ed.parentNode.insertBefore(hb, ed);
}
""" + OLD.replace("try { paintJob(); } catch (e) { warn(e); }", "try { paintJob(); } catch (e) { warn(e); } try { paintHead(); } catch (e) { warn(e); }")
assert src.count(OLD) == 1, src.count(OLD)
open(P, 'w', encoding='utf-8').write(src.replace(OLD, NEW)); print('patched')
