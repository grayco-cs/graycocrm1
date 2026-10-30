#!/usr/bin/env python3
"""Idempotent patch OFFICEFULL: the office works every part of the CRM ("Everything, money too").

Owner (Wesley, 10/30): "i want the office to help estimators stay on top of stuff, pms keep up with job progressions,
she can also toggle for what job she wants auto texts or what services we want to do for that customer etc, need her
to be able to have full reign of crm she can see projects everything for everything" — money screens included.

Who is the office: data, never a name — the company sign-in's gc_staff profile 'office' (or role 'office'), else, when
no profile is set, the person's role on the people list (Office / Office Admin / Office Manager). An admin is not
"the office" (admins have everything already); the Marketing Manager never is.

What this does (each step asserts its find-count; running it again changes nothing):
  A. company sign-in: keeps gc_staff.profile on the session; window._gcIsOfficeFull(), window._gcFullAccess()
     (= an admin or the office).
  B. cash vault (gc_admin_kv: cash on hand, bank accounts, their movements = owner draws): the office reads and
     writes them once the database says so (gc_my_access().office, docs/office-full-access.sql).
     window._gcCashVaultAdmin stays admins-only (patch CCX's storage clean-up uses it).
  C. SEC2 part 1: access() says office / officeDb; can(): with officeDb the office reads users_private (pay figures
     for commissions), commission structures, margin goals, the cash keys, tax ids, pay templates, and changes the
     cash keys, margin goals, invoice bank details, overhead, check-run settings, marketing settings, document
     defaults and the training list. users_private is never written by the office (the database guard keeps her
     edits of other people out anyway); team roles, data-entry mode and backups stay admin.
  D. SEC2 part 2: gc_my_access().office is kept; the office's computer reads the private store and shows the pay
     fields (commissions); commission figures, invoice bank details and owner financials are open to her
     (pay structures stay admin).
  E. the screen guard (Audit B): the office may open every screen (⚙ Admin too).
  F. patch RP: the office's left menu is the admin's menu (also "View as → Office" for an admin).
  G. patch ADM: ⚙ Admin opens for the office; the settings cards drop the admin-only rows (Team access,
     Offboarding, tabs per person, access requests, Hiring, backups / import / restore / make the cloud the truth /
     find undone edits / recover jobs, Storage) and the 🛡 Security & system check card.
  H. ADMGATE: the office is not sent away from ⚙ Admin.
  I. the screens' own isAdmin() for the business settings: cash & bank (patch K), ⚡ Automation defaults (JA),
     📊 My data (X10), margins / capacity (DEPTH2), document library / defaults (DOCLIB, DOCLIB2, DOCLIB3),
     automatic text answers (TXT), text alerts (SMSALERT), text templates (TXTTPL), call order (CALLCHAIN),
     🎓 Training (TRAIN), proposal template (ESTIN); the app's own job profit / margin columns (job page, Projects,
     P&L by job, weekly costs), shown before to an admin or the job's PM only.
  J. tools/officefull_tail.js after patch JA: ⚙ Admin without the staff buttons for the office; the job's
     ⚙ Automations window gets "More for this job" (project.autoX switches).
Not touched: the approvals queue (patch APPR / AP4 / APX / APPRORDER / APPTCONF), the Lead Inbox, the Leads list, the
Office tab, 💎 Team access, ⏸ Data-entry mode (patch PAUSE), view-as, and the destructive tools.
Usage: python3 tools/patch_OFFICEFULL.py [index.html]
"""
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
if '__GC_PATCH_OFFICEFULL__' in src:
    print('OFFICEFULL: already patched'); sys.exit(0)
for need in ('__GC_SEC2__', '__GC_SEC2_TAIL__', '__GC_PATCH_ADM__', '__GC_PATCH_JA__', '__GC_PATCH_RP__', '__GC_CASH_VAULT__'):
    assert need in src, 'OFFICEFULL needs ' + need
TAIL = open(os.path.join(HERE, 'officefull_tail.js'), encoding='utf-8').read().rstrip('\n')
OFC = "if (window._gcIsOfficeFull && window._gcIsOfficeFull()) return true;   /* patch OFFICEFULL */"


def rep(tag, old, new, count=1):
    global src
    n = src.count(old)
    assert n == count, ('OFFICEFULL find-string count', tag, n, count)
    src = src.replace(old, new)


def rep_in(tag, marker_re, old, new):
    """replace `old` (exactly once) inside the <script> that holds the marker"""
    global src
    ms = list(re.finditer(marker_re, src))
    assert len(ms) == 1, ('OFFICEFULL marker count', tag, len(ms))
    a = ms[0].start()
    b = src.find('</script>', a)
    assert b > a, ('OFFICEFULL no </script> after marker', tag)
    seg = src[a:b]
    assert seg.count(old) == 1, ('OFFICEFULL find-string count in region', tag, seg.count(old))
    src = src[:a] + seg.replace(old, new) + src[b:]


# ── A. the company sign-in ────────────────────────────────────────────────────────────────────────
rep('A1', "S.role = mkt ? 'marketing' : low(row.role || 'staff'); S.marketing = mkt; S.roleKnown = true; store(S);",
    "S.role = mkt ? 'marketing' : low(row.role || 'staff'); S.marketing = mkt; S.profile = low(row.profile || ''); S.roleKnown = true; store(S);   /* patch OFFICEFULL: the profile too */")
rep('A2', "window.__gcAuthIsAdmin = isAdmin;\nfunction copyS(){",
    """window.__gcAuthIsAdmin = isAdmin;
/* patch OFFICEFULL — THE OFFICE (owner 10/30: "full reign of crm … Everything, money too"). Data decides, never a name:
   the company sign-in's gc_staff profile 'office' (or role 'office'); when no profile is set, the database's answer
   (gc_my_access().office, docs/office-full-access.sql), else the person's role on the company's people list (Office /
   Office Admin / Office Manager — admins set it; the database keeps a non-admin's own role edits out). Never an admin
   (admins have everything) and never the Marketing Manager. 💎 Team access, data-entry mode and the destructive tools
   keep using isAdmin() above. */
function officeFull(){
  if (!S || !S.roleKnown) return false;
  var r = low(S.role), pf = low(S.profile);
  if (r === 'admin' || r === 'marketing' || S.marketing === true || pf === 'marketing') return false;
  if (r === 'office' || pf === 'office') return true;
  if (pf) return false;                                        /* another profile an admin set (pm, estimator …) */
  var me = low(S.email);
  try { var a = JSON.parse(localStorage.getItem('gc_sec2_access') || 'null'); if (a && a.email === me && a.office === true) return true; } catch (e) {}
  try {
    var L = (window._crm && window._crm.users) || [];
    return L.some(function(u){ return !!u && u.active !== false && low(u.email) === me && /^office/i.test(String(u.role || '')); });
  } catch (e) { return false; }
}
window._gcIsOfficeFull = function(){ try { return officeFull(); } catch (e) { return false; } };
window._gcFullAccess = function(){ try { return isAdmin() || officeFull(); } catch (e) { return false; } };
function copyS(){""")

# ── B. the cash vault ─────────────────────────────────────────────────────────────────────────────
rep('B1', """function isAdmin(){
  var st = roleState(); if (st !== 'unknown') return st === 'admin';
  try { return !!(window.__gcAuthIsAdmin && window.__gcAuthIsAdmin()); } catch (e) { return false; }
}
window._gcCashVaultAdmin = isAdmin;""",
    """function realAdminV(){
  var st = roleState(); if (st !== 'unknown') return st === 'admin';
  try { return !!(window.__gcAuthIsAdmin && window.__gcAuthIsAdmin()); } catch (e) { return false; }
}
/* patch OFFICEFULL: the office holds the cash records too, once the database lets her (gc_my_access().office —
   docs/office-full-access.sql); before that she keeps nothing here, as before */
function officeVault(){
  try {
    var s = sess(); if (!s || !s.roleKnown || s.role === 'admin') return false;
    var a = JSON.parse(localStorage.getItem('gc_sec2_access') || 'null');
    return !!(a && a.office === true && a.email === String(s.email || '').trim().toLowerCase());
  } catch (e) { return false; }
}
function isAdmin(){ return realAdminV() || officeVault(); }   /* in this vault: may hold the cash records */
window._gcCashVaultAdmin = realAdminV;                        /* admins only (patch CCX's clean-up asks this) */""")
rep('B2', """  if (st === 'staff') { purgeHere(); vault.state = 'not an admin — nothing kept here'; return; }
  if (st === 'admin' && sess() && sess().access_token) { loadAdmin(); return; }""",
    """  if (st === 'staff' && !officeVault()) { purgeHere(); vault.state = 'not an admin — nothing kept here'; return; }
  if ((st === 'admin' || officeVault()) && sess() && sess().access_token) { loadAdmin(); return; }   /* patch OFFICEFULL */""")
rep('B3', "if (roleState() === 'staff') purgeHere();\nsetTimeout(decide, 0);",
    """if (roleState() === 'staff' && !officeVault()) purgeHere();
vault.reload = function(){ if (isAdmin() && sess() && sess().access_token) return loadAdmin(); };   /* patch OFFICEFULL: SEC2 calls it when the database says "office" */
setTimeout(decide, 0);""")

# ── C. SEC2 part 1 ────────────────────────────────────────────────────────────────────────────────
rep('C0', "var IS_ADMIN = set(ADMIN), IS_PAYROLL = set(PAYROLL), IS_ADMINWRITE = set(ADMINWRITE), IS_PRIVATE = set(PRIVATE), IS_SELF_PRIVATE = set(SELF_PRIVATE);",
    """var IS_ADMIN = set(ADMIN), IS_PAYROLL = set(PAYROLL), IS_ADMINWRITE = set(ADMINWRITE), IS_PRIVATE = set(PRIVATE), IS_SELF_PRIVATE = set(SELF_PRIVATE);
/* patch OFFICEFULL: what the office (gc_my_access().office) reads / changes besides the staff keys — the same lists as
   public.gc_office_can_read / gc_office_can_write in docs/office-full-access.sql */
var OFFICE_READ = ['users_private', 'gc_commission_structures', 'gc_margin_goals', 'gc_cash_anchor', 'gc_accounts_cfg', 'gc_accounts_ledger', 'gc_tax_ids', 'gc_pay_templates'];
var OFFICE_WRITE = ['gc_margin_goals', 'gc_cash_anchor', 'gc_accounts_cfg', 'gc_accounts_ledger', 'gc_ach_details', 'gc_overhead_manual', 'gc_checkrun_settings', 'gc_mkt_admin', 'gc_doc_defaults', 'gc_train_items'];
var IS_OFFICE_READ = set(OFFICE_READ.concat(OFFICE_WRITE)), IS_OFFICE_WRITE = set(OFFICE_WRITE);""")
rep('C1', """  return { known: true, email: email, admin: admin,
           payroll: admin || (c && c.payroll != null ? !!c.payroll : legacyOffice(email)),
           sec2: !!(c && c.sec2) };""",
    """  return { known: true, email: email, admin: admin,
           payroll: admin || (c && c.payroll != null ? !!c.payroll : legacyOffice(email)),
           sec2: !!(c && c.sec2),
           office: !admin && !!(window._gcIsOfficeFull && window._gcIsOfficeFull()),   /* patch OFFICEFULL: the screens */
           officeDb: !admin && !!(c && c.office === true) };                           /* … and the database lets her have the records */""")
rep('C2', """  if (a.admin) return true;
  if (op === 'read') return c === 'payroll' ? a.payroll : c !== 'admin';""",
    """  if (a.admin) return true;
  if (a.officeDb && (op === 'read' ? IS_OFFICE_READ[baseKey(k)] : op === 'write' ? IS_OFFICE_WRITE[baseKey(k)] : false)) return true;   /* patch OFFICEFULL */
  if (op === 'read') return c === 'payroll' ? a.payroll : c !== 'admin';""")
rep('C2b', "  force: function(a){ forced = a ? Object.assign({ known: true }, a) : null; } };",
    "  force: function(a){ forced = a ? Object.assign({ known: true }, a) : null; },\n  OFFICE_READ: OFFICE_READ.slice(), OFFICE_WRITE: OFFICE_WRITE.slice() };   /* patch OFFICEFULL */")
rep('C3', """    /* not an admin: nobody's private fields, except my own contact details */
    var mine = isMine(u, a);
    PRIVATE.forEach(function(f){
      if (!(f in c)) return;""",
    """    /* not an admin: nobody's private fields, except my own contact details */
    var mine = isMine(u, a);
    /* patch OFFICEFULL: the office sees what the database's private store has (pay set-up → commissions); only those values */
    var offP = a.officeDb && S.priv && id && S.priv[id] && typeof S.priv[id] === 'object' ? S.priv[id] : null;
    PRIVATE.forEach(function(f){
      if (!(f in c)) return;
      if (offP && !(mine && IS_SELF_PRIVATE[f]) && (f in offP) && J(offP[f]) === J(c[f])) return;""")
rep('C4', """      put(f, undefined); S.stats.privStripped++;
    });
    if (mine) {""",
    """      put(f, undefined); S.stats.privStripped++;
    });
    if (offP) Object.keys(offP).forEach(function(f){ if (IS_PRIVATE[f] && !(f in c) && offP[f] !== null && !(mine && IS_SELF_PRIVATE[f])) put(f, offP[f]); });   /* patch OFFICEFULL */
    if (mine) {""")

# ── D. SEC2 part 2 ────────────────────────────────────────────────────────────────────────────────
rep('D1', "          rec = { email: email, admin: !!j.admin, payroll: !!j.payroll, sec2: true, at: Date.now() };",
    "          rec = { email: email, admin: !!j.admin, payroll: !!j.payroll, sec2: true, office: j.office === true, at: Date.now() };   /* patch OFFICEFULL: office */")
rep('D2', "        rawLsSet('gc_sec2_access', JSON.stringify(rec));\n        return rec;",
    "        rawLsSet('gc_sec2_access', JSON.stringify(rec));\n        if (rec.office) { try { if (window.__GC_ADMIN_KV && window.__GC_ADMIN_KV.reload) window.__GC_ADMIN_KV.reload(); } catch (e) {} }   /* patch OFFICEFULL: the cash records */\n        return rec;")
rep('D3', "  if (!a.known || !a.admin || !a.sec2) return Promise.resolve(false);\n  if (privBusy)",
    "  if (!a.known || !(a.admin || a.officeDb) || !a.sec2) return Promise.resolve(false);   /* patch OFFICEFULL: the office reads it too */\n  if (privBusy)")
rep('D4', """function wrapAdminOnly(name, msg, alsoPayroll){
  var f = window[name]; if (typeof f !== 'function' || f.__gcSec2) return;
  var w = function(){
    var a = S.access();
    if (a.known && !a.admin && !(alsoPayroll && a.payroll)) {""",
    """function wrapAdminOnly(name, msg, alsoPayroll, alsoOffice){
  var f = window[name]; if (typeof f !== 'function' || f.__gcSec2) return;
  var w = function(){
    var a = S.access();
    if (a.known && !a.admin && !(alsoPayroll && a.payroll) && !(alsoOffice && a.officeDb)) {   /* patch OFFICEFULL: alsoOffice */""")
rep('D5', "    if (job && a.known && !a.admin) return null;",
    "    if (job && a.known && !a.admin && !a.officeDb) return null;   /* patch OFFICEFULL: the office sees commissions */")
rep('D6', "  wrapAdminOnly('_gcEditACHDetails', 'The bank details printed on invoices are changed by Wesley or Nick only.');",
    "  wrapAdminOnly('_gcEditACHDetails', 'The bank details printed on invoices are changed by Wesley, Nick or the office only.', false, true);")
rep('D7', "  wrapAdminOnly('_gcOpenOwnerFinancials', 'Financials are for Wesley and Nick.', true);",
    "  wrapAdminOnly('_gcOpenOwnerFinancials', 'Financials are for Wesley, Nick and the office.', true, true);")
rep('D8', "  else { trimSyncKeys(); if (Date.now() - awAt > 60000) { awAt = Date.now(); refreshAdminWritten(); } }\n}, 5000);",
    "  else { trimSyncKeys(); if (Date.now() - awAt > 60000) { awAt = Date.now(); refreshAdminWritten(); } if (a.officeDb && (!S.priv || Date.now() - S.privAt > 120000)) loadPrivate(); }   /* patch OFFICEFULL */\n}, 5000);")

# ── E. the screen guard ───────────────────────────────────────────────────────────────────────────
rep('E1', "    try { if (window.__gcAuthIsAdmin && window.__gcAuthIsAdmin()) return true; } catch (e) {}\n    if (ownerish(me)) return true;",
    "    try { if (window.__gcAuthIsAdmin && window.__gcAuthIsAdmin()) return true; } catch (e) {}\n    try { " + OFC + " } catch (e) {}\n    if (ownerish(me)) return true;")

# ── F. patch RP: the office's menu = the admin's ──────────────────────────────────────────────────
rep('F1', """    var role = effRole(), order = ux()[role] || MM_TABS[role];
    if (realAdmin() && viewAs() === 'Office') {""",
    """    var role = effRole(), order = ux()[role] || MM_TABS[role];
    if ((!realAdmin() && W._gcIsOfficeFull && W._gcIsOfficeFull()) || (realAdmin() && viewAs() === 'Office')) {   /* patch OFFICEFULL: the admin's menu */
      var AD = arr(ux().Admin); if (!AD.length) AD = ['dashboard','roofscout','projects','scopes','estimates','leads','bidportal','systems','expenses','taxcenter','pnl','reports','schedule','changeorders','dailylogs','punchlist','gmail','claude','invoices','payments','subs','vendors','customers','products','quickadd','crewboard','warranties','templates','estvactual','docs','forms','mastercrm','integrations','cctrans','myprofile','admin','launchjob','cordova','payroll','estbuilder','insurance','mitigation','messages','sitebook','allphotos','todo','approvals','officemanager'];   /* the app's Admin list until it is published */
      return arr(Uf).filter(function(g){
        if (g.id === 'insurance') return true;
        if (g.id === 'marketing') return !!(W._gcMktCanSee && W._gcMktCanSee());
        return AD.indexOf(g.id) >= 0 || g.id === 'quickadd' || g.id === 'forms' || g.id === 'allphotos';
      });
    }
    if (realAdmin() && viewAs() === 'Office') {""")
rep('F2', """      if (realAdmin()) return true;
      var role = effRole(), l = ux()[role] || MM_TABS[role];""",
    """      if (realAdmin()) return true;
      try { if (W._gcIsOfficeFull && W._gcIsOfficeFull()) return true; } catch (e) {}   /* patch OFFICEFULL: every screen */
      var role = effRole(), l = ux()[role] || MM_TABS[role];""")

# ── G. patch ADM ──────────────────────────────────────────────────────────────────────────────────
rep('G1', """function isAdmin(sr){
  var S = session();
  if (S && S.roleKnown) return low(S.role) === 'admin';""",
    """function isAdmin(sr){
  """ + OFC + """   /* ⚙ Admin opens for the office (officeCut keeps the admin-only rows out) */
  var S = session();
  if (S && S.roleKnown) return low(S.role) === 'admin';""")
rep('G2', "function SECTIONS(){ return withCustom([",
    """/* patch OFFICEFULL: what stays with the admins when the office opens ⚙ Admin — staff access, security, backups / restore,
   storage clean-up. The rows and the 🛡 Security card are left out for her (their own windows ask the server anyway). */
var OFFICE_CUT_ROWS = /^(Team access|Offboarding|Show \\/ hide tabs per person|Job access requests|Hiring|Backups|Daily backups|Export a backup|Import a backup|Make the cloud the truth|Find edits that were undone|Recover deleted jobs|Storage)/i;
var OFFICE_CUT_SECS = { security: 1 };
function officeCut(list){
  var off = false; try { off = !!(W._gcIsOfficeFull && W._gcIsOfficeFull()); } catch (e) {}
  if (!off) return list;
  return list.filter(function(x){ return !(x && OFFICE_CUT_SECS[x.id]); }).map(function(x){
    if (!x || !Array.isArray(x.rows)) return x;
    return Object.assign({}, x, { rows: x.rows.filter(function(r){ return !(r && OFFICE_CUT_ROWS.test(String(r.t || ''))); }) });
  });
}
function SECTIONS(){ return officeCut(SECTIONS0()); }
function SECTIONS0(){ return withCustom([""")

# ── H. ADMGATE ────────────────────────────────────────────────────────────────────────────────────
rep('H1', """  function isAdmin(){
    try { if (window._gcRP && typeof window._gcRP.status === 'function') { var st = window._gcRP.status(); if (st && typeof st.admin === 'boolean') return st.admin; } } catch (e) {}""",
    """  function isAdmin(){
    try { """ + OFC + """ } catch (e) {}
    try { if (window._gcRP && typeof window._gcRP.status === 'function') { var st = window._gcRP.status(); if (st && typeof st.admin === 'boolean') return st.admin; } } catch (e) {}""")

# ── I. the screens' own isAdmin() for business settings ───────────────────────────────────────────
rep('K1', """   Only when that role is not known yet (offline first run) does the CRM user's role (Admin) stand in. */
function isAdmin(){
""", """   Only when that role is not known yet (offline first run) does the CRM user's role (Admin) stand in.
   patch OFFICEFULL: and the office ("Everything, money too"). */
function isAdmin(){
  """ + OFC + """
""")
for tag in ('JA', 'X10', 'DEPTH2', 'DOCLIB', 'DOCLIB2', 'DOCLIB3', 'TXT', 'SMSALERT', 'TXTTPL', 'CALLCHAIN', 'TRAIN', 'ESTIN'):
    rep_in(tag, r"if \((?:window|W)\.__GC_PATCH_" + tag + r"__\) return;", "function isAdmin(){", "function isAdmin(){ " + OFC + " ")

# ── I2. the app's own job profit / margin (job page tiles, Projects, P&L by job, weekly costs): "Admin or the job's PM" ──
BUNDLE_OFC = '(window._gcIsOfficeFull&&window._gcIsOfficeFull())'
n = len(re.findall(r'\(sr\.role==="Admin"\|\|(\w+)\.pm===sr\.name\)', src))
assert n == 9, ('OFFICEFULL job-profit gates', n)
src = re.sub(r'\(sr\.role==="Admin"\|\|(\w+)\.pm===sr\.name\)', lambda m: '(sr.role==="Admin"||' + BUNDLE_OFC + '||' + m.group(1) + '.pm===sr.name)', src)
rep('I3', '...(sr.role==="Admin"?["Profit"]:[""])', '...((sr.role==="Admin"||' + BUNDLE_OFC + ')?["Profit"]:[""])')

# ── J. the tail, right after patch JA ─────────────────────────────────────────────────────────────
rep('J1', "try { console.log('[GC] patch JA: automations per job — _gcJA.state(), _gcJobAutoDefaults.open()'); } catch (e) {}\n})();\n</script>",
    "try { console.log('[GC] patch JA: automations per job — _gcJA.state(), _gcJobAutoDefaults.open()'); } catch (e) {}\n})();\n</script>\n" + TAIL)

open(path, 'w', encoding='utf-8').write(src)
print('OFFICEFULL: patched', path)
