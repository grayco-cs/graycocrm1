#!/usr/bin/env python3
"""Idempotent patch LDUPBID: Leads → 🧹 Clean up no longer calls separate bids "duplicates" because they came from the same
bid platform / plan room / notification sender (owner 10/27: "3 records · same e-mail" for three different jobs, all from
info@memphisreprographics.com — City of Bolivar – Hatchie River Park, REBID NWCC Agricultural Technology Facility,
Maintenance Shop Construction at Kefauver Terrace).

  * A BID (commercial / government lead, a Lead Inbox bid, a bid due date, a plan-room source) is a duplicate only of a
    bid with the same project name or the same street address (or the same Lead Inbox / CompanyCam / QuickBooks / job id) —
    never by e-mail or phone (one GC, plan room or agency sends many different jobs).
  * Any lead: an e-mail of a bid platform, plan room, reprographics / blueprint house, procurement site or a
    notification / no-reply mailbox (and that sender's phone) is never a duplicate key.
Usage: python3 tools/patch_LDUPBID.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch LDUPBID'
if MARK in src:
    print('LDUPBID: already patched'); sys.exit(0)
OLD = """    var p = normPhone(l.phone || l.clientPhone); if (p) keys.push(['phone', 'p:' + p]);
    var e = normEmail(l.email || l.clientEmail); if (e) keys.push(['e-mail', 'e:' + e]);"""
NEW = """    var bidL = dupIsBid(l), platE = dupPlatformEmail(l.email || l.clientEmail);   """ + MARK + """: bids and platform senders never match by e-mail / phone */
    var p = normPhone(l.phone || l.clientPhone); if (p && !bidL && !platE) keys.push(['phone', 'p:' + p]);
    var e = normEmail(l.email || l.clientEmail); if (e && !bidL && !platE) keys.push(['e-mail', 'e:' + e]);"""
assert src.count(OLD) == 1, ('LDUPBID find-string count != 1', src.count(OLD))
src = src.replace(OLD, NEW)
OLD2 = """function leadName(l){ return s(l.name || l.title || l.company || l.client); }
function leadAddr(l){"""
NEW2 = """function leadName(l){ return s(l.name || l.title || l.company || l.client); }
/* patch LDUPBID: bid platforms / plan rooms / notification senders, and what counts as a bid */
var DUP_PLAT = /(planhub|buildingconnected|isqft|constructconnect|construct-connect|dodge|bidnet|bidclerk|bidexpress|blueprint|reprographic|planroom|plan-room|plans?room|procore|smartbid|pipelinesuite|bxwa|ebuilder|e-builder|bonfire|demandstar|periscope|questcdn|civcast|sam\\.gov|govspend|onvia|bidsync|ionwave|negometrix|publicpurchase|biddingo|plansource|arcbid|reprodepot|thebluebook|bluebook|app\\.box|mailchimp|sendgrid|hubspot|salesforce|constantcontact)/;
var DUP_NOTE = /^(no-?reply|do-?not-?reply|donotreply|notifications?|notify|projectnotifications?|project\\.?notifications?|alerts?|bids?|bidding|invitations?|invite|mailer|postmaster|system|automated|updates?)[^@]*@/;
function dupPlatformEmail(v){ var e = low(v); if (!/@/.test(e)) return false; return DUP_PLAT.test(e.split('@')[1] || '') || DUP_NOTE.test(e) || DUP_PLAT.test(e.split('@')[0] || ''); }
function dupIsBid(l){
  try { if (W._gcBidRole && typeof W._gcBidRole.isBid === 'function' && W._gcBidRole.isBid(l)) return true; } catch (e) {}
  if (/commercial|government|public|bid/i.test(s(l.leadKind) + ' ' + s(l.kind))) return true;
  if (s(l.inboxId) || s(l.bidDue) || s(l.dueToCompany) || s(l.bidRole)) return true;
  return DUP_PLAT.test(low(l.source) + ' ' + low(l.origin));
}
function leadAddr(l){"""
assert src.count(OLD2) == 1, ('LDUPBID find-string 2 count != 1', src.count(OLD2))
src = src.replace(OLD2, NEW2)
open(path, 'w', encoding='utf-8').write(src)
print('LDUPBID: patched', path)
