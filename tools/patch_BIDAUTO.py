#!/usr/bin/env python3
"""patch BIDAUTO — a job is on the bid portal ONLY when a person put it there (owner 11/23: "all these jobs shouldn't be on bid portal only
   if we put them on there, what are those").
   index.html:
   1. the BIDPOST block (it holds the bid-hub ?jobs=1 list): window._gcBidPortalOn(mark) → 'on' (a person put it on: posted, published,
      opened to invited subs) | 'draft' (a draft, or opened by the old automatic way and never touched by a person or a sub — bid-hub
      autoDraft) | 'gone' (archived / deleted) | '' (no bid job). While the list is not loaded, only a person's Publish (publishedBy on the
      Lead Inbox mark) counts as on; the list is loaded then and the Lead Inbox / Leads pages repaint once.
   2. the Lead Inbox (LD2): the Leads list status says "On bid portal" only for 'on'; a bid job that is not on says "Draft (not on portal)";
      the card's tag the same; "Publish to bid portal" is offered on such a draft.
   3. the Leads hub: the 🏗 chip and the drawer's Sub bid portal status read the same rule; the drawer's note no longer says every lead goes
      on the portal.
   Every anchor must occur exactly once. Run once; a second run stops at the first anchor."""
import io, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(ROOT, 'index.html')
t = io.open(IDX, encoding='utf-8').read()

def rep(a, new):
    global t
    n = t.count(a)
    if n != 1: sys.exit('BIDAUTO: anchor %r found %d times' % (a[:90], n))
    t = t.replace(a, new)

# 1. the rule, next to patch QAA's _gcBidJobGone (BIDPOST block)
rep("""/* patch LEADBP: 📢 from the Leads list — a row's 📢 button""", """/* patch BIDAUTO (owner 11/23: "all these jobs shouldn't be on bid portal only if we put them on there"): is a lead's bid job ON the bid portal?
   'on' = a person put it there (bid-hub: not a draft, not autoDraft) · 'draft' = a draft, or the old automatic opening that no person or sub
   touched · 'gone' = archived / deleted · '' = no bid job. Before the list is here only a person's Publish (publishedBy) counts as on; the list
   is fetched once and the Lead Inbox / Leads pages repaint. Read only. */
var BA = { asked: 0 };
function bidJobOf(id){
  var lists = [{ at: JOBS.at || 0, l: arr(JOBS.list) }]; try { if (W._gcSys && W._gcSys.bp && W._gcSys.bp.jobs) lists.push({ at: (W._gcSys.bp.at && W._gcSys.bp.at()) || 0, l: arr(W._gcSys.bp.jobs()) }); } catch (e) {}
  var hit = null; lists.sort(function(a, b){ return b.at - a.at; }).some(function(x){ hit = x.l.filter(function(j){ return j && j.id === id; })[0] || null; return !!hit; });
  return { hit: hit, known: lists.some(function(x){ return x.at > 0; }) };
}
W._gcBidPortalOn = function(p){
  p = p && typeof p === 'object' ? p : null; var id = s(p && p.jobId); if (!id || s(p.state) === 'removed') return '';
  var r = bidJobOf(id), j = r.hit;
  if (j) return j.deleted ? 'gone' : (j.draft || j.autoDraft || s(j.visibility) === 'draft') ? 'draft' : 'on';
  if (!r.known && !JOBS.busy && Date.now() - BA.asked > 60000) { BA.asked = Date.now();
    jobs(false).then(function(){ try { if (W._gcLeadInbox && W._gcLeadInbox.repaint) W._gcLeadInbox.repaint(); } catch (e) {} try { if (W._gcLeadsHub && W._gcLeadsHub.redraw) W._gcLeadsHub.redraw(); } catch (e) {} }); }
  return s(p.publishedBy) && /published|public/.test(s(p.state || p.visibility)) ? 'on' : 'draft';
};
/* patch LEADBP: 📢 from the Leads list — a row's 📢 button""")

# 2. the Lead Inbox's Leads list and card
rep("""function lxStatus(l, p){
  if (p && p.state === 'published') return { t: 'On bid portal', c: 'st-on' };""", """function lxOn(p){ try { return window._gcBidPortalOn ? window._gcBidPortalOn(p) : (p && p.jobId && p.state === 'published' ? 'on' : ''); } catch (e) { return ''; } }   /* patch BIDAUTO */
function lxStatus(l, p){
  var on = lxOn(p);   /* patch BIDAUTO: "On bid portal" only when a person put it there */
  if (p && /^(published|public|private)$/.test(s(p.state)) && on === 'on') return { t: 'On bid portal', c: 'st-on' };""")
rep("""  if ((p && p.jobId && p.state !== 'removed') || l.bidPortalJob) return { t: 'Draft', c: 'st-dr' };""",
    """  if ((p && p.jobId && p.state !== 'removed' && on !== 'gone') || l.bidPortalJob) return { t: 'Draft (not on portal)', c: 'st-dr' };   /* patch BIDAUTO */""")
rep("""  if (p && p.state === 'published') return '<span class="tg t-bp on">✓ On the bid portal</span>';""",
    """  if (p && /^(published|public|private)$/.test(s(p.state)) && lxOn(p) === 'on') return '<span class="tg t-bp on">✓ On the bid portal</span>';   /* patch BIDAUTO */""")
rep("""  if (p && p.jobId) return '<span class="tg t-bp">Draft in the bid portal</span>';""",
    """  if (p && p.jobId) return '<span class="tg t-bp">Draft (not on the bid portal)</span>';   /* patch BIDAUTO */""")
rep("""admin && l.inboxId && !l.websiteLead && !(portalOf(l) && /published|removed/.test(portalOf(l).state))""",
    """admin && l.inboxId && !l.websiteLead && !(portalOf(l) && (/removed/.test(portalOf(l).state) || lxOn(portalOf(l)) === 'on'))""")

# 3. the Leads hub
rep("""  var st = s(p.state || p.visibility); var pub = /public|published/.test(st);""",
    """  var st = s(p.state || p.visibility); var pub = /public|published/.test(st);
  if (typeof W._gcBidPortalOn === 'function' && W._gcBidPortalOn(p) === 'draft') return '<span class="gcl-chip priv" title="Draft — not on the sub bid portal (staff only). 📢 Put on bid portal puts it there.">🏗 draft</span>';   /* patch BIDAUTO */""")
rep("""  var pst = p && p.jobId && !(typeof W._gcBidJobGone === 'function' && W._gcBidJobGone(p.jobId)) ? s(p.state || p.visibility) : '';""",
    """  var pst = p && p.jobId && !(typeof W._gcBidJobGone === 'function' && W._gcBidJobGone(p.jobId)) ? s(p.state || p.visibility) : '';
  if (pst && typeof W._gcBidPortalOn === 'function' && W._gcBidPortalOn(p) === 'draft') pst = 'draft';   /* patch BIDAUTO: the old automatic opening is a draft */""")
rep("""<div class="note">Every lead goes on the sub bid portal as <b>private</b>. Only you make it public. GrayCo prices are never shown to subs.</div>""",
    """<div class="note">Nothing goes on the sub bid portal by itself: it is there only when a person puts it there — <b>private</b> (invited subs) or public. GrayCo prices are never shown to subs.</div>""")

io.open(IDX, 'w', encoding='utf-8').write(t)
print('BIDAUTO patched')
