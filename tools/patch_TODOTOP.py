#!/usr/bin/env python3
"""Idempotent patch TODOTOP: what sat on top of every page goes back where it belongs (owner 11/2: "that should be on todo
right now its on every page up top like that", "why is this here it has a place to be", and on ⚙ Admin two
"🧾 Missing job data" banners with different numbers: "why is this different and also shouldn't be up here").
  1. 🧾 Missing job data banner (patch DATAFULL): ONE banner, on the To-Do only (office + admins, as before). It used to be
     put into the 🏢 Office page and ⚙ Admin, and each copy was only ever refreshed in the box it was put in, so a copy left
     in an old box kept its old count. Now every other copy is taken away each tick.
  2. 💳 Import card statement / 🏦 Import bank statement (patch MONEY / STMTPDF) and 📥 Drop invoices & receipts (patch
     BULKDROP): off the To-Do; they live on the Accounting screen's tool row (and the 💎 hub). 📥 Needs a job stays on the To-Do.
  3. 🔧 Owner setup (patch OWNERTODO): when the To-Do was left and opened again the bar came back as a bare "▶ Details"
     (its contents were only written when they changed). Now a new bar is always filled.
Who sees what is unchanged. Usage: python3 tools/patch_TODOTOP.py [index.html]"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch TODOTOP'
if MARK in t: print('TODOTOP: already patched'); sys.exit(0)
R = []

# 1. DATAFULL: one banner, To-Do only
R.append(("""function mountBanner(host, where){
  if (!host) return;
  var h = bannerHtml(), cur = host.querySelector(':scope > .gc-df-banner');
  if (cur && cur.__h === h) return;
  var w = D.createElement('div'); w.innerHTML = h; var el = w.firstChild; if (!el) return; el.__h = h; el.setAttribute('data-where', where);
  if (cur) cur.replaceWith(el); else host.insertBefore(el, host.firstChild);
}""", """function mountBanner(host, where){
  if (!host) return null;
  var h = bannerHtml(), cur = host.querySelector(':scope > .gc-df-banner');
  if (cur && cur.__h === h) return cur;
  var w = D.createElement('div'); w.innerHTML = h; var el = w.firstChild; if (!el) return null; el.__h = h; el.setAttribute('data-where', where); el.setAttribute('data-gc-keep', '1');
  if (cur) cur.replaceWith(el); else host.insertBefore(el, host.firstChild);
  return el;
}"""))
R.append(("""  if (full()) {
    try { var om = D.getElementById('gc-om-mount'); if (om && om.firstElementChild) mountBanner(om, 'office'); } catch (e) { warn(e); }
    try { var ah = adminHost(); if (ah) mountBanner(ah, 'admin'); } catch (e) { warn(e); }
  }
}""", """  /* patch TODOTOP: one banner, on the To-Do only (owner 11/2); any other copy (an old box, another page) is taken away */
  var keep = null;
  try { var tm = full() ? D.getElementById('_todoMount') : null; if (tm && tm.parentElement) keep = mountBanner(tm.parentElement, 'todo'); } catch (e) { warn(e); }
  [].forEach.call(D.querySelectorAll('.gc-df-banner'), function(b){ if (b !== keep) b.remove(); });
}"""))

# 2a. MONEY: the To-Do row keeps 📥 Needs a job; the statement imports go to the Accounting tool row
R.append(("""function paint(force){
  var mount = D.getElementById('_todoMount'), host = D.getElementById('gc-money-needs');
  if (!mount || !moneyPerson()) { if (host) { host.remove(); lastSig = ''; } return; }   /* patch OFFICEFIX: gone with the To-Do list; drawn again on return */
  var n = needs().length;""", """function paint(force){
  var mount = D.getElementById('_todoMount'), host = D.getElementById('gc-money-needs');
  /* patch TODOTOP: 💳 / 🏦 statement imports live on the Accounting screen's tool row, not on top of the To-Do (owner 11/2) */
  var tools = D.querySelector('#gck-root .gck-tools'), ah = D.getElementById('gc-money-acct');
  if (moneyPerson() && tools && low(lsGet('grayco_view')) === 'taxcenter') {
    if (!ah) { ah = D.createElement('span'); ah.id = 'gc-money-acct'; ah.setAttribute('data-gc-keep', '1'); ah.setAttribute('data-gc-linked', '1'); ah.style.cssText = 'display:inline-flex;gap:6px;flex-wrap:wrap';
      ah.innerHTML = '<button type="button" class="gck-btn" data-mn="import">💳 Import card statement</button><button type="button" class="gck-btn" data-mn="bank">🏦 Import bank statement</button>';
      ah.addEventListener('click', function(ev){ var b = ev.target.closest && ev.target.closest('[data-mn]'); if (!b) return; openImport(b.getAttribute('data-mn') === 'bank' ? { mode: 'bank' } : null); }); }
    if (ah.parentElement !== tools) tools.appendChild(ah);
  } else if (ah) ah.remove();
  var n = needs().length;
  if (mount && !n) { if (host) { host.remove(); lastSig = ''; } return; }
  if (!mount || !moneyPerson()) { if (host) { host.remove(); lastSig = ''; } return; }   /* patch OFFICEFIX: gone with the To-Do list; drawn again on return */"""))
R.append(("""  var html = (n ? '<button type="button" data-mn="needs" style="border:1px solid #b45309;background:#b45309;color:#fff;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer">📥 Needs a job (' + n + ')</button>' : '') +
    '<button type="button" data-mn="import" style="border:1px solid #1d4ed8;background:#fff;color:#1d4ed8;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer">💳 Import card statement</button>' +
    '<button type="button" data-mn="bank" style="border:1px solid #0f766e;background:#fff;color:#0f766e;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer">🏦 Import bank statement</button>';   /* patch STMTPDF */""",
"""  var html = '<button type="button" data-mn="needs" style="border:1px solid #b45309;background:#b45309;color:#fff;border-radius:8px;padding:7px 12px;font-weight:700;cursor:pointer">📥 Needs a job (' + n + ')</button>';   /* patch TODOTOP: the imports are on Accounting */"""))
R.append(("To-Do → 💳 Import card statement → choose the file", "Accounting → 💳 Import card statement → choose the file"))

# 2b. BULKDROP: no button on the To-Do; the Accounting tool row keeps its own
R.append(("""  if (ok && mount && mount.parentElement) {
    var anchor = host && host.parentElement === mount.parentElement ? host : null;""", """  if (false) {   /* patch TODOTOP: not on the To-Do any more (owner 11/2) — the Accounting tool row has it */
    var anchor = host && host.parentElement === mount.parentElement ? host : null;"""))

# 3. OWNERTODO: a new bar is always filled (no bare "▶ Details")
R.append(("""  if (!host) {
    host = D.createElement('details'); host.id = 'gc-ot';""", """  if (!host) {
    OS.sig = '';   /* patch TODOTOP: a bar made again (the To-Do left and opened again) is filled, never a bare "▶ Details" */
    host = D.createElement('details'); host.id = 'gc-ot';"""))

for old, new in R:
    assert t.count(old) == 1, ('TODOTOP anchor', t.count(old), old[:90])
for old, new in R:
    t = t.replace(old, new)
open(p, 'w', encoding='utf-8').write(t)
print('TODOTOP: patched', p)
