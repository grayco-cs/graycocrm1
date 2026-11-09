"""patch DOCPILLS (owner 11/9, Olympus plan room screenshot: "our plan room design needs to have these buttons too").
Sub portal: one row of dark pill download buttons per bid job — PLANS · SPECS · ADDENDUM #1… · PLAN ROOM —
under the job title and on each job card. Subs still only see jobs the portal server gives them."""
import sys
p = 'subportal-app/src/App.jsx'; src = open(p).read()
if '/*DOCPILLS*/' in src: print('already patched'); sys.exit(0)
def rep(a, b, n=1):
    global src
    assert src.count(a) == n, (a[:60], src.count(a)); src = src.replace(a, b)
rep("planLinks: 'Plan room links',", "docPlans: 'Plans', docSpecs: 'Specs', docRoom: 'Plan room', bidDocs: 'Bid documents', planLinks: 'Plan room links',")
rep("planLinks: 'Enlaces a planos',", "docPlans: 'Planos', docSpecs: 'Especificaciones', docRoom: 'Sala de planos', bidDocs: 'Documentos de licitación', planLinks: 'Enlaces a planos',")
rep("function JobCard({ t, job, user, users, onClick, myBidExists, bidCount }) {", r"""/*DOCPILLS*/ /* Olympus-style document buttons: PLANS · SPECS · ADDENDUM #n · PLAN ROOM */
function docGroups(job) {
  const plans = [], specs = [], add = {}, out = [];
  (job.plans || []).forEach(f => {
    const k = ((f.category || '') + ' ' + (f.name || '')).toLowerCase();
    const m = k.match(/addend\w*[\s_#-]*(?:no\.?\s*)?(\d+)/);
    if (m) (add[m[1]] = add[m[1]] || { num: Number(m[1]), files: [], plan: [] }).plan.push(f);
    else if (/\bspec|specification|project manual|\bmanual\b/.test(k)) specs.push(f);
    else plans.push(f);
  });
  (job.addenda || []).filter(a => a.publishedAt).forEach(a => { const g = (add[a.num] = add[a.num] || { num: Number(a.num), files: [], plan: [] }); g.files.push(...(a.files || [])); });
  if (plans.length) out.push({ key: 'plans', kind: 'plans', files: plans });
  if (specs.length) out.push({ key: 'specs', kind: 'specs', files: specs });
  Object.values(add).sort((a, b) => a.num - b.num).forEach(g => out.push({ key: 'add' + g.num, kind: 'addendum', num: g.num, files: g.plan, addFiles: g.files }));
  (job.plansLinks || []).forEach((l, i) => l && l.url && out.push({ key: 'link' + i, kind: 'link', url: l.url, label: l.label }));
  return out;
}
function DocPills({ t, job, onPick, compact }) {
  const gs = docGroups(job);
  if (!gs.length) return null;
  const label = g => g.kind === 'plans' ? t.docPlans : g.kind === 'specs' ? t.docSpecs : g.kind === 'addendum' ? (t.addendumN || 'Addendum #') + g.num : (g.label || t.docRoom);
  const pill = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: compact ? '7px 13px' : '10px 18px', borderRadius: 999, border: 'none', cursor: 'pointer',
    background: styles.navyDeep, color: styles.accent, fontFamily: styles.fontDisplay, fontWeight: 600, fontSize: compact ? 11 : 12.5, letterSpacing: '0.08em',
    textTransform: 'uppercase', textDecoration: 'none', boxShadow: '0 4px 12px rgba(10,3,56,.18)', transition: 'transform .15s ease, box-shadow .15s ease' };
  const hov = e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 18px rgba(10,3,56,.26)'; };
  const out = e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = pill.boxShadow; };
  return (
    <div data-docpills="1" style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? 6 : 10, margin: compact ? '0 0 12px' : '0 0 20px' }}>
      {gs.map(g => g.kind === 'link'
        ? <a key={g.key} data-pill="link" href={g.url} target="_blank" rel="noopener noreferrer" style={pill} onMouseEnter={hov} onMouseLeave={out} onClick={e => e.stopPropagation()}>🔗 {label(g)} ↗</a>
        : <button key={g.key} type="button" data-pill={g.kind === 'addendum' ? 'add' + g.num : g.kind} style={pill} onMouseEnter={hov} onMouseLeave={out}
            title={(g.files.length + (g.addFiles ? g.addFiles.length : 0)) + ' file(s)'}
            onClick={e => { if (onPick) { e.stopPropagation(); onPick(g); } }}>
            <Download size={compact ? 12 : 14} /> {label(g)}
          </button>)}
    </div>
  );
}

function JobCard({ t, job, user, users, onClick, myBidExists, bidCount }) {""")
rep("""      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 14, borderTop: `1px solid ${styles.border}`,
        fontSize: 12, color: styles.text2, letterSpacing: '-0.01em',
      }}>
        <span>
          {job.plans?.length || 0} {job.plans?.length === 1 ? 'plan' : 'plans'}""", """      <DocPills t={t} job={job} compact />
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 14, borderTop: `1px solid ${styles.border}`,
        fontSize: 12, color: styles.text2, letterSpacing: '-0.01em',
      }}>
        <span>
          {job.plans?.length || 0} {job.plans?.length === 1 ? 'plan' : 'plans'}""")
rep("""  function logDownload(planName) {
    if (user.role !== 'sub') return;""", """  /*DOCPILLS*/ function pickDocs(g) {
    const files = g.files || [], extra = (g.addFiles || []).filter(f => f && f.dataUrl);
    if (!files.length && !extra.length) { const el = document.querySelector(`[data-addendum="${g.num}"]`) || document.getElementById('bid-addenda'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (files.length && fullPlans === null) { showToast('Plans are still loading — try again in a moment.', 'error'); return; }
    let i = 0;
    files.forEach(f => setTimeout(() => downloadPlan(f), 450 * i++));
    extra.forEach(f => setTimeout(() => { openFile(f.dataUrl, f.name); logDownload(f.name); }, 450 * i++));
  }

  function logDownload(planName) {
    if (user.role !== 'sub') return;""")
rep("""
          {/* OUR ROLE — big prominent banner""", """
          <DocPills t={t} job={job} onPick={pickDocs} />

          {/* OUR ROLE — big prominent banner""")
open(p, 'w').write(src); print('ok')
