# NOLINKS (owner 11/24, screenshot of "PLAN ROOM LINKS — Open plans ↗ — Solicitation & documents (City of Bartlett)" on a sub's
# page): "never wanted these to show to subs — this is how we bid, they don't need to see that; only plans and addendums they
# should see". A plan-room / solicitation / bid-board link is GrayCo only, ALWAYS: the "Visible to subs" tick no longer opens it.
# The one link a sub still sees is a plan set GrayCo posted as a link because it was too big to upload (the bid site's
# "Upload big file to Google Drive / paste a Drive link" — its label says Plans / Drawings / Specs …, no bid board, no plan room).
# A link a sub can't see is not "plans posted" for a sub who asked for plans, and no "plans added" notice goes out for it.
def sub(p, a, b, n=1):
    t = open(p, encoding='utf-8').read(); assert t.count(a) == n, (p, a[:70], t.count(a)); open(p, 'w', encoding='utf-8').write(t.replace(a, b))
F = 'netlify/functions/_lib/subvis.js'
sub(F, """function visible(item, kind){
  if (!item || typeof item !== 'object') return false;
""", """/* patch NOLINKS: a link a sub may see — only GrayCo's own plan set (too big to upload), never a plan room, a bid board or a solicitation */
const ROOM = /\\b(plan\\s*-?\\s*rooms?|planrooms?|bid\\s*rooms?|bid\\s*boards?|solicitations?|bidding\\s+documents?|bid\\s+documents?|documents?\\s+for\\s+bid)\\b/i;
function planSetLink(item){
  const own = [item.name, item.label, item.title].map(s).join(' ').replace(/[_\\-.]+/g, ' ');
  if (!s(item.url) || s(item.board) || ROOM.test(own) || isSolicitation(item, 'link') || HOST.test(hostOf(item.url))) return false;
  return PLANWORD.test(own);
}
function visible(item, kind){
  if (!item || typeof item !== 'object') return false;
  if (kind === 'link') return item.subsVisible !== false && planSetLink(item);   /* patch NOLINKS (owner 11/24): no tick opens a plan room / solicitation link to subs (a 'hidden' tick still hides) */
""")
sub(F, "module.exports = { visible, isSolicitation,", "module.exports = { visible, isSolicitation, planSetLink,")
S = 'netlify/functions/subportal.js'
sub(S, "function plansCount(job, items){ return arr(items).length + arr(job && job.plansLinks).filter(function(l){ return /^https?:\\/\\//i.test(s(l && l.url)); }).length; }",
       "function plansCount(job, items){ const V = SV(); return arr(items).length + arr(job && job.plansLinks).filter(function(l){ return /^https?:\\/\\//i.test(s(l && l.url)) && V.visible(l, 'link'); }).length; }   /* patch NOLINKS: only a link a sub can open is \"plans posted\" */")
sub(S, "          if (old && arr(rec.plansLinks).length > arr(old.plansLinks).length) notes.push({ kind: 'plans-added', jobId: rec.id });\n",
       "          if (old && arr(rec.plansLinks).filter(function(l){ return SV().visible(l, 'link'); }).length > arr(old.plansLinks).filter(function(l){ return SV().visible(l, 'link'); }).length) notes.push({ kind: 'plans-added', jobId: rec.id });   /* patch NOLINKS: a GrayCo-only link is no notice to subs */\n")
A = 'subportal-app/src/App.jsx'
sub(A, "                  {isAdmin && <VisToggle t={t} item={l} kind=\"link\" onChange={v => setVis('plansLinks', l, v)} />}\n",
       "                  {isAdmin && <span data-linkvis={i} style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{svPlanSet(l) ? '👁 Subs see this plan set' : '🔒 GrayCo only — subs never see plan-room links'}</span>}   {/* patch NOLINKS */}\n")
sub(A, "function subsVisible(item, kind) {", """/* patch NOLINKS: the same rule as _lib/subvis.js planSetLink — the only link a sub sees is GrayCo's own plan set */
function svPlanSet(l) {
  if (!l || !l.url || String(l.board || '').trim()) return false;
  const own = [l.name, l.label, l.title].map(x => String(x == null ? '' : x).trim()).join(' ').replace(/[_\\-.]+/g, ' ');
  let h = ''; try { h = new URL(l.url).host; } catch (e) {}
  if (/\\b(plan\\s*-?\\s*rooms?|planrooms?|bid\\s*rooms?|bid\\s*boards?|solicitations?|bidding\\s+documents?|bid\\s+documents?|documents?\\s+for\\s+bid)\\b/i.test(own) || svSolicitation(l, 'link') || SV_HOST.test(h)) return false;
  return SV_PLAN.test(own);
}
function subsVisible(item, kind) {""")
sub(A, '<h3 style={sectionTitleStyle} id="bid-planlinks"><FileText size={18} /> {t.planLinks}</h3>', '<h3 style={sectionTitleStyle} id="bid-planlinks"><FileText size={18} /> {isAdmin ? t.planLinks : t.docPlans}</h3>')   # NOLINKS: a sub sees "Plans", never "Plan room links"
print('NOLINKS: done')
