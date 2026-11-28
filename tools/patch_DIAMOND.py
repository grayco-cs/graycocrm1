#!/usr/bin/env python3
"""patch DIAMOND (owner 11/28): the 💎 menu cleaned up.

"take off clean up job list button, take out 3 company cam imports — they should be imported through integrations — and
company cam email[queue] and project hubs, we don't want any duplicate button, those red ones delete them, force clean cloud
every 2 minutes? nah do every 2 hours that's too much, ok add portals, emails, don't add sales and spam, add bid portal …
delete 'every photo of this job' we know, data health and job health can go there, crm health saves duplicates add, tax
deadlines I only need notifications to admin, make cloud truth delete that"

index.html
  · 💎 built-in items taken off the menu (their functions stay; other callers keep working): the CompanyCam imports (Import
    CompanyCam Jobs, Re-import ALL CompanyCam jobs, Map CompanyCam → PM), the red ones (Recover My Data, Deep Scan Recovery,
    Recover Deleted Jobs, Restore Schedule (this device), UN-HIDE All Estimates, Merge Duplicate Jobs, Recover Approvals,
    Test the CRM, Purge Test Data, Force-Clean Cloud), the duplicates (Download Schedule PDF, Restore from Backup, Download
    Backup, Download Full Backup (all data), Delete Job by PO/Title, Duplicates, Duplicate check, P&L by Job, Business Brain
    (issues), Contract & Doc Templates, Remove Duplicates) and Data Health Check / System Health Check (now under ⚙ Admin →
    CRM health); their _hubGroups entries and the stale "Recover Schedule" one.
    KEPT: "Sync my Google Docs" — it is the only door to the Google Docs → CRM panel (patch GDOCS: "Needs a person" placing).
  · 💎 injected items no longer added: 🧹 Clean up the job list, 📧 Email Queue, 🏗 Project Hubs, 💾 Backup & Restore (exact)
    (their watchers / timers that only added the item are gone too).
  · ⚙ Admin → Data, backups & sync: no "Make the cloud the truth" row (window._gcMakeCloudTheTruth stays).
  · the automatic test-data purge: every 2 HOURS (was 2 minutes); _gcPurgeTestData pushes the core lists to the cloud only
    when it removed something from them (it pushed nine lists on every run, found or not).
  · the job page: "📸 Open in GrayCo Photos" without the "Every photo of this job" caption.
  · tax deadlines: company items remind the ADMINS only (role), never the office — the To-Do lines on admin computers, the
    server's e-mail / push / text (netlify/functions/_lib/taxcal.js, inlined in the page); the owners' items stay admins only.
  · window._gcOpenSystemHealth (the old 💎 System Health Check screen) for ⚙ Admin → CRM health.
  · tools/diamond_tail.js appended: the 💎 "Shortcuts" group and the CRM health links.
Usage: python3 tools/patch_DIAMOND.py [repo root]
"""
import sys, os
ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
if ROOT.endswith('index.html'): ROOT = os.path.dirname(ROOT) or '.'

def load(rel):
    return open(os.path.join(ROOT, rel), encoding='utf-8').read()
def save(rel, s):
    open(os.path.join(ROOT, rel), 'w', encoding='utf-8').write(s)
def rep(s, old, new, rel):
    n = s.count(old)
    assert n == 1, (rel, n, old[:120])
    return s.replace(old, new)

REMOVE = ['Recover Approvals', 'Import CompanyCam Jobs', 'Map CompanyCam \\u2192 PM (lead credit)', 'Re-import ALL CompanyCam jobs',
          'Restore Schedule (this device)', 'Data Health Check (read-only)', 'Recover Deleted Jobs', 'Download Full Backup (all data)',
          'UN-HIDE All Estimates', 'Merge Duplicate Jobs', 'Download Schedule PDF', 'Contract & Doc Templates', 'Business Brain (issues)',
          'P&L by Job', 'Duplicates', 'Duplicate check', 'Restore from Backup', 'Download Backup', 'Recover My Data', 'Remove Duplicates',
          'Deep Scan Recovery', 'Delete Job by PO/Title', 'Test the CRM', 'Purge Test Data', 'Force-Clean Cloud', 'System Health Check']
GROUPS = ['Contract & Doc Templates', 'Recover Approvals', 'Import CompanyCam Jobs', 'Recover Schedule', 'Download Schedule PDF',
          'Business Brain (issues)', 'Restore from Backup', 'Download Backup', 'Test the CRM', 'System Health Check', 'Purge Test Data']

# ───────────────────────────── index.html ─────────────────────────────
rel = 'index.html'
s = load(rel)
if '__GC_PATCH_DIAMOND__' in s:
    print('index.html already patched')
else:
    # 1. the built-in 💎 items: the whole line of each
    for lab in REMOVE:
        a = 'label: "' + lab + '"'
        assert s.count(a) == 1, (lab, s.count(a))
        i = s.index(a); b = s.rindex('\n', 0, i) + 1; e = s.index('\n', i) + 1
        line = s[b:e]
        assert line.lstrip().startswith('{ icon:') and line.count('label:') == 1, (lab, line[:160])
        assert line.count('{') == line.count('}') and 'fn:' in line, ('not a one-line item', lab, line[:160])
        s = s[:b] + s[e:]
    # the last item lost its follower: "System Health Check" was last, so the new last line must not end in a comma
    s = rep(s, '''            else GC.toast("Reset unavailable", "warn");
          } },
      ];''', '''            else GC.toast("Reset unavailable", "warn");
          } }
      ];''', rel)
    # their _hubGroups entries (and the stale "Recover Schedule")
    g0 = s.index('      var _hubGroups = {'); g1 = s.index('\n', g0)
    G = s[g0:g1]
    for lab in GROUPS:
        k = '"' + lab + '": "'
        assert G.count(k) == 1, (lab, G.count(k))
        i = G.index(k); j = G.index('"', G.index(': "', i) + 3) + 1
        G = G[:i] + G[j:].lstrip(', ') if G[j:j + 2] == ', ' else G[:i].rstrip(', ') + G[j:]
    k = ', "Force-Clean Cloud": "Help & Tools"}'
    assert G.count(k) == 1; G = G.replace(k, '}')
    assert G.endswith('"Reset Button Positions": "Help & Tools"};'), G[-120:]
    s = s[:g0] + G + s[g1:]
    s = rep(s, '      var _hubGroups = {', '      /* patch DIAMOND (owner 11/28): the one-time fixes, the red recovery tools and the duplicates are off the 💎 */\n      var _hubGroups = {', rel)

    # 2. the injected items: their adders are no longer wired
    s = rep(s, """  try{ if(window.__GC_BEAT) window.__GC_BEAT('cleanup menu', add); }catch(e){}
  document.addEventListener('gc-hub-open', add);   /* HUBFIX: it goes at the top — there the moment the menu opens, not 150 ms later under the pointer */
  document.addEventListener('click', function(){ setTimeout(add, 150); }, true);
""", """  void add;   /* patch DIAMOND (owner 11/28: "take off clean up job list button"): not on the 💎 menu — _gcCleanup() stays */
""", rel)
    s = rep(s, """  try{ if(window.__GC_BEAT) window.__GC_BEAT('backup menu', add); else setInterval(add, 3000); }catch(e){}
  document.addEventListener('click', function(){ setTimeout(add, 150); }, true);
""", """  void add;   /* patch DIAMOND (owner 11/28: no duplicate buttons): not on the 💎 menu — 💎 Daily Backups is the one restore door; _gcBackupNow / _gcRestoreExact stay */
""", rel)
    s = rep(s, """var _hObs = new MutationObserver(injectHubLink);
document.addEventListener('gc-hub-open', function(){ try { injectHubLink(); } catch (e) {} });   /* HUBFIX: in the menu the moment it opens */
setTimeout(function(){ _hObs.observe(document.body,{childList:true,subtree:false}); }, 2000);
""", """void injectHubLink;   /* patch DIAMOND (owner 11/28): no 🏗 Project Hubs on the 💎 — 💎 Project CRMs is the same picker */
""", rel)
    s = rep(s, """var _eqObs = new MutationObserver(injectEmailQueueBtn);
document.addEventListener('gc-hub-open', function(){ try { injectEmailQueueBtn(); } catch (e) {} });   /* HUBFIX: in the menu the moment it opens */
setTimeout(function(){ _eqObs.observe(document.body,{childList:true,subtree:false}); }, 2000);
setInterval(injectEmailQueueBtn,15000);
""", """void injectEmailQueueBtn;   /* patch DIAMOND (owner 11/28): no 📧 Email Queue on the 💎 — ✉ Customer e-mails & texts (the approval list) replaces it */
""", rel)

    # 3. ⚙ Admin → Data: no "Make the cloud the truth"
    s = rep(s, """    row('Make the cloud the truth', 'Old records coming back? Every other computer drops the records only it has (it keeps a copy) instead of sending them back.', 'Admin (moved here)', F('_gcMakeCloudTheTruth'), 'act'),
""", "", rel)

    # 4. the automatic test-data purge: every 2 hours; the core lists go up only when something was removed
    s = rep(s, "  var SWEEP_MS = 2 * 60 * 1000;   // every 2 minutes (test data never lingers past 2 min)",
               "  var SWEEP_MS = 2 * 60 * 60 * 1000;   // patch DIAMOND (owner 11/28: \"nah do every 2 hours\"): at most every 2 hours (was 2 minutes)", rel)
    s = rep(s, "  // Check every minute; the SWEEP_MS gate means it actually cleans at most every 3 min.",
               "  // Checked every 30 s (a cheap look); the SWEEP_MS gate means it cleans at most every 2 hours, and it writes only what it removed.", rel)
    s = rep(s, """      pushKeys.forEach(function(pk){
        try{
          var v=localStorage.getItem('grayco_'+pk);""", """      pushKeys.forEach(function(pk){
        try{
          /* patch DIAMOND: only a list this run actually cleaned (it pushed all nine every time, found or not) */
          if(!(report.removed['grayco_'+pk] || report.removed[pk] || (pk==='invs' && report.removed.invoices))) return;
          var v=localStorage.getItem('grayco_'+pk);""", rel)

    # 5. the job page: no caption under the GrayCo Photos button
    s = rep(s, """        +(url?('<a href="'+url+'" target="_blank" rel="noreferrer" style="font-size:11px;color:#64748b;text-decoration:underline">CompanyCam ↗</a>'):'')
        +'<span style="font-size:11px;color:#8a94a6">Every photo of this job</span>';""",
               """        +(url?('<a href="'+url+'" target="_blank" rel="noreferrer" style="font-size:11px;color:#64748b;text-decoration:underline">CompanyCam ↗</a>'):'');   /* patch DIAMOND: no "Every photo of this job" caption (owner: "we know") */""", rel)

    # 6. the old System Health Check screen, for ⚙ Admin → CRM health
    s = rep(s, "    // Expose globally\n    window.GC.openPaymentsDashboard = openPaymentsDashboard;\n",
               "    // Expose globally\n    window.GC.openPaymentsDashboard = openPaymentsDashboard;\n    window._gcOpenSystemHealth = openHealthCheck;   /* patch DIAMOND: ⚙ Admin → CRM health → 🖥 System check */\n", rel)
    # ⚙ Admin → CRM health: Job health, Data health and the system check on top
    s = rep(s, "function renderHealth(box){\n  box.innerHTML = (W._gcSpeedSummary ?",
               "function renderHealth(box){\n  box.innerHTML = (W._gcDiamond && W._gcDiamond.healthStrip ? W._gcDiamond.healthStrip() : '') /* patch DIAMOND */ + (W._gcSpeedSummary ?", rel)

    # 7. tax deadlines: the admins only (the page's copy of taxcal.js + the To-Do)
    s = rep(s, "  else it.who = /^(admins\\+office|admins|office)$/.test(s(x.who)) ? s(x.who) : 'admins+office';",
               "  else it.who = 'admins';   /* patch DIAMOND (owner 11/28: \"tax deadlines I only need notifications to admin\"): the admins, never the office */", rel)
    s = rep(s, "  out = item.who === 'admins' ? A : item.who === 'office' ? O : A.concat(O);\n  return uniq(out);",
               "  out = A; void O;   /* patch DIAMOND: company items remind the admins only (role) */\n  return uniq(out);", rel)
    s = rep(s, "function todoItems(){\n  if (!canSee()) return [];",
               "function todoItems(){\n  if (!canSee() || !realAdmin()) return [];   /* patch DIAMOND: tax reminders are the admins' (by role), not the office's */", rel)
    s = rep(s, "      : '<label>Remind<select data-f=\"who\">' + opt('admins+office', 'admins + office', it.who) + opt('admins', 'admins only', it.who) + opt('office', 'office only', it.who) + '</select></label>'",
               "      : '<label>Remind<select data-f=\"who\">' + opt('admins', 'the admins', 'admins') + '</select></label>'   /* patch DIAMOND: the admins only */", rel)
    s = rep(s, "'<h4>Company &amp; payroll taxes <small>— admins + office</small></h4>",
               "'<h4>Company &amp; payroll taxes <small>— reminders to the admins</small></h4>", rel)
    s = rep(s, "d: 'Payroll taxes, the owners’ quarterly estimated tax, TN taxes — alerts to the admins and the office until paid',",
               "d: 'Payroll taxes, the owners’ quarterly estimated tax, TN taxes — alerts to the admins until paid',", rel)

    tail = open(os.path.join(ROOT, 'tools', 'diamond_tail.js'), encoding='utf-8').read()
    assert '</script>' not in tail
    s = s.rstrip('\n') + '\n<script>\n' + tail.rstrip('\n') + '\n</script>\n'
    save(rel, s)
    print('index.html patched')

# ───────────────────────────── the server copy of the tax rules ─────────────────────────────
rel = 'netlify/functions/_lib/taxcal.js'
s = load(rel)
if 'patch DIAMOND' in s:
    print(rel, 'already patched')
else:
    s = rep(s, "  else it.who = /^(admins\\+office|admins|office)$/.test(s(x.who)) ? s(x.who) : 'admins+office';",
               "  else it.who = 'admins';   /* patch DIAMOND (owner 11/28: \"tax deadlines I only need notifications to admin\"): the admins, never the office */", rel)
    s = rep(s, "  out = item.who === 'admins' ? A : item.who === 'office' ? O : A.concat(O);\n  return uniq(out);",
               "  out = A; void O;   /* patch DIAMOND: company items remind the admins only (role) */\n  return uniq(out);", rel)
    save(rel, s)
    print(rel, 'patched')

rel = 'netlify/functions/_lib/taxalerts.js'
s = load(rel)
if 'patch DIAMOND' in s:
    print(rel, 'already patched')
else:
    s = rep(s, "   To: the item's people — company items: the admins and the office (or admins / office only); an owner's quarterly\n   estimated tax: that owner (or both admins) — NEVER the office.",
               "   To: the item's people — company items: the admins only (patch DIAMOND, owner 11/28: \"tax deadlines I only need\n   notifications to admin\"); an owner's quarterly estimated tax: that owner (or both admins) — NEVER the office.", rel)
    save(rel, s)
    print(rel, 'patched')
