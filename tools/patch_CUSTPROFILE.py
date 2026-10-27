#!/usr/bin/env python3
"""Idempotent patch CUSTPROFILE: GrayCo Field (the phone app) job cards.
Owner 10/27: "dont need clock in clock out in field view, call customer would be customer profile".
  * the 📞 Call tile becomes 👤 Customer profile: it opens the customer's profile (window._gcOpenCustomerProfile —
    jobs, contact info, 📞 Call / 💬 Text buttons). If the customer record has no phone but the job does, a
    📞 Call line with the job's phone is added on top, so the phone is always one tap away.
  * the 🟢 Start day / 🏁 End day tile (the check-in / check-out button) is not shown in the field view any more —
    not by default and not from a saved role layout; the Admin "Apps by role" editor no longer offers it.
    The daily log itself stays on the job (Site Book) as before.
The tool keeps its id 'call', so a role layout saved by the admin keeps the tile in the same place."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch CUSTPROFILE */'
if MARK in t: print('CUSTPROFILE: already patched'); sys.exit(0)

def once(src, a, b, n=1):
    c = src.count(a)
    assert c == n, 'CUSTPROFILE: expected %d of %r, found %d' % (n, a[:80], c)
    return src.replace(a, b)

# 1) the default role layouts: no 'day'
t = once(t, "['nav', 'info', 'call', 'day', ", "['nav', 'info', 'call', ", 5)

# 2) never shown (a saved role layout may still list it) and not offered in the role editor
t = once(t, "  return base.filter(function(id){ return off.indexOf(id) < 0 && TOOLS.some(function(t){ return t.id === id; }); });",
            "  return base.filter(function(id){ return id !== 'day' && off.indexOf(id) < 0 && TOOLS.some(function(t){ return t.id === id; }); });   " + MARK)
t = once(t, "function allowedFor(k){ return TOOLS.filter(function(t){ return t.id !== 'sendsign' && ",
            "function allowedFor(k){ return TOOLS.filter(function(t){ return t.id !== 'sendsign' && t.id !== 'day' && ")

# 3) Call → Customer profile
OLD_CALL = "  R({ id: 'call', icon: '📞', label: 'Call', group: 'arrive', needsSigned: false, href: function(p){ var ph = phoneOf(p); return ph ? 'tel:' + ph : ''; }, run: function(){ toast('No phone number on this job yet.'); } });"
NEW_CALL = "  R({ id: 'call', icon: '👤', label: 'Customer profile', group: 'arrive', needsSigned: false, run: function(p){ custProfile(p); } });"
t = once(t, OLD_CALL, NEW_CALL)

FN = """/* patch CUSTPROFILE — the job card's 👤 Customer profile: the customer's record (jobs, contact, call / text) */
function custProfile(p){
  var cs = arr(C().customers), cn = low(p.client || p.customer), cid = s(p.customerId || p.custId);
  var c = cs.filter(function(x){ return x && cid && s(x.id) === cid; })[0] || cs.filter(function(x){ return x && cn && (low(x.name) === cn || low(x.company) === cn); })[0];
  var key = c ? (c.id != null ? c.id : (c.name || c.company)) : s(p.client || p.customer);
  if (!key) { toast('No customer on this job yet.'); return; }
  if (typeof W._gcOpenCustomerProfile !== 'function') { var ph0 = phoneOf(p); if (ph0) W.location.href = 'tel:' + ph0; else toast('The customer profile is not on this phone yet.'); return; }
  try { W._gcOpenCustomerProfile(key); } catch (e) { toast('Could not open the customer profile.'); return; }
  var ph = phoneOf(p);
  if (!ph) return;
  var put = function(){
    var ovs = D.querySelectorAll('._gcSheetOv'), ov = ovs[ovs.length - 1];
    if (!ov) return false; if (ov.querySelector('a[href^="tel:"]')) return true;
    var a = D.createElement('a'); a.href = 'tel:' + ph; a.setAttribute('data-cp-call', '1');
    a.style.cssText = 'display:block;margin:10px 16px;padding:13px;border-radius:12px;background:#16a34a;color:#fff;font:700 15px Inter,sans-serif;text-align:center;text-decoration:none';
    a.textContent = '📞 Call ' + s(p.clientPhone || p.phone || p.customerPhone || ph);
    var hd = ov.firstElementChild; if (hd && hd.nextSibling) ov.insertBefore(a, hd.nextSibling); else ov.appendChild(a);
    return true;
  };
  if (!put()) later(put, 60);
}
/* the tools that come with the app"""
t = once(t, "/* the tools that come with the app", FN)

t = once(t, "   arrive = Navigate / Job info / Call; then", "   arrive = Navigate / Job info / Customer profile; then")
t = once(t, "The first three after Navigate / Job info / Call are the big buttons.", "The first three after Navigate / Job info / Customer profile are the big buttons.")
open(p, 'w', encoding='utf-8').write(t); print('CUSTPROFILE: patched')
