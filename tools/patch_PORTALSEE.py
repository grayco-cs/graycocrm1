# PORTALSEE (owner 11/27, screenshot of a COMMERCIAL client's portal Home with "🙋 How did you hear about us?" and "GRAYCO CARE —
# Protect your home … 🛠 Your maintenance plans Monthly/Yearly": "want to be able to edit what they see on their portal when we make
# the job, this is a commercial client and this is talking about homes … i dont want to show plans unless i want to … all the
# maintenance plans is too much unless its a residential client"; add-on: "for commercial jobs should also have superintendent here").
#  · ⚙ Admin → the portal row: "🛠 Show GrayCo Care maintenance plans on customer portals" (default OFF, admins only, server-checked).
#  · the job's ✏️ Edit portal → "👤 What the customer sees": Automatic / Show / Hide for 🛠 plans, 🙋 How did you hear, ⭐ review,
#    🎁 referral, 🏗 Request a new project, 🏠 My home, 👷 Superintendent card, and the Payments / Photos / Documents tabs
#    (job.portalShow — saved with the job's person-edit path _gcxPatchJob, from the newest copy, only that field; SYNC-A PF).
#  · the job's 🏠 Portal card: a new job (made in the last 14 days, no picks yet) offers "👤 Customer portal: what they see" inline.
p = 'index.html'; s = open(p, encoding='utf-8').read()
assert 'PORTALSEE' not in s
def sub(a, b):
    global s
    assert s.count(a) == 1, (a[:70], s.count(a)); s = s.replace(a, b)

# 1. SYNC-A: portalShow is a person-edit field (the newest person edit wins over another device's whole-job copy)
sub("""          'scope','description','sector','superintendent'];""",
    """          'scope','description','sector','superintendent',
          /* patch PORTALSEE: the job's "What the customer sees" switches */
          'portalShow'];""")

# 2. ⚙ Admin → the portal row: the company switch
sub("""<input type="checkbox" id="gc-adm-autosend" disabled> Send new customers their portal link by e-mail</label><span id="gc-adm-autosend-msg" class="w"></span>'
""", """<input type="checkbox" id="gc-adm-autosend" disabled> Send new customers their portal link by e-mail</label><span id="gc-adm-autosend-msg" class="w"></span>'
    + '<div id="gc-adm-plans-box" style="margin-top:10px;border-top:1px solid #e2e8f0;padding-top:8px"><label style="display:flex;gap:8px;align-items:center;font-weight:700"><input type="checkbox" id="gc-adm-plans" disabled> 🛠 Show GrayCo Care maintenance plans on customer portals</label><span id="gc-adm-plans-msg" class="w"></span>'
    + '<div class="w" style="margin:2px 0 0">Off: no customer portal shows the plans. On: residential jobs only (never commercial or GC jobs). A job\\u2019s ✏️ Edit portal → 👤 What the customer sees can still Show or Hide them for that one job.</div></div>'   /* patch PORTALSEE */
""")
sub("""a.checked = j.autoSend !== false; a.disabled = false; try { cardPaint(m, j.card); } catch (_c) {} }""",
    """a.checked = j.autoSend !== false; a.disabled = false; try { cardPaint(m, j.card); } catch (_c) {} try { plansPaint(m, j); } catch (_p) {} }""")
sub("""function wireEmbeds(m){
""", """/* patch PORTALSEE: ⚙ Admin → 🛠 Show GrayCo Care maintenance plans on customer portals (default OFF; the server lets only an admin save it) */
function plansPaint(m, j){
  var c = m.querySelector('#gc-adm-plans'), out = m.querySelector('#gc-adm-plans-msg'); if (!c) return;
  c.checked = !!(j && j.plans === true); c.disabled = false;
  if (out) out.textContent = c.checked ? ' — ON: residential customers see the plans' : ' — OFF: no customer sees the plans';
  c.onchange = function(){ var v = !!c.checked; c.disabled = true;
    fetch('/.netlify/functions/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'settings', set: { plans: v } }) })
      .then(function(r){ return r.json(); }).then(function(r2){ if (r2 && r2.ok) { plansPaint(m, r2); toast(v ? '🛠 Maintenance plans ON — residential customer portals show them.' : '🛠 Maintenance plans OFF — no customer portal shows them.'); } else { c.disabled = false; c.checked = !v; toast((r2 && r2.error) || 'Could not save.'); } })
      .catch(function(){ c.disabled = false; c.checked = !v; toast('Could not reach the portal server.'); }); };
}
function wireEmbeds(m){
""")

# 3. the portal editor: 👤 What the customer sees
sub("""  h += detailsSec(p) + schedSec(p) + tasksSec(p)""", """  h += seeSec(p);   /* patch PORTALSEE */
  h += detailsSec(p) + schedSec(p) + tasksSec(p)""")
sub("""    '<button type="button" class="pe-b pri" data-pe="make" style="width:100%;min-height:52px;font-size:16px">🏠 Make the portal</button></div>';
}""", """    '<button type="button" class="pe-b pri" data-pe="make" style="width:100%;min-height:52px;font-size:16px">🏠 Make the portal</button></div>' + seeSec(p);   /* patch PORTALSEE: set it before the portal is made too */
}""")
sub("""/* 📝 details */
function detailsSec(p){""", """/* patch PORTALSEE: 👤 What the customer sees — each section Automatic / Show / Hide (job.portalShow; the server sends nothing hidden) */
var SEE = [['plans', '🛠 Maintenance plans (GrayCo Care)', 'Automatic: only when ⚙ Admin turns the plans on, and only on a residential job.'],
  ['heard', '🙋 How did you hear about us', 'Automatic: shown (not on a GC job).'],
  ['review', '⭐ Review & “Share a few words” asks', 'Automatic: when the job is done (not on a GC job).'],
  ['referral', '🎁 Referral program & Refer a friend', 'Automatic: shown (not on a GC job).'],
  ['project', '🏗 Request a new project', 'Automatic: shown (not on a GC job).'],
  ['myhome', '🏠 My home / 🏢 My property record', 'Automatic: shown (not on a GC job).'],
  ['super', '👷 Your Superintendent card', 'Automatic: commercial jobs, when the job has a superintendent.'],
  ['pay', '💵 Payments tab', 'Automatic: shown.'], ['photos', '📷 Photos tab', 'Automatic: shown.'], ['docs', '📄 Documents tab', 'Automatic: shown.']];
function seeMode(p, k){ var o = p && p.portalShow && typeof p.portalShow === 'object' ? p.portalShow : {}; var v = low(o[k]); return v === 'on' || v === 'off' ? v : 'auto'; }
function loadSee(){ var pid = CUR.pid; if (!pid) return; fn('portal', { action: 'portalsee', projectId: pid }).then(function(r){ if (CUR.pid !== pid) return; CUR.see = r && r.ok ? r : false; repaintSec('see', seeSec); }); }
function seeSec(p){
  var A = CUR.see, com = A && A.commercial, gc = A && A.gc;
  var kind = A ? (gc ? 'a GC job (we are the sub)' : com ? 'a commercial job' : 'a residential job') : '';
  var h = A === undefined ? '<p class="pe-note" data-pe-seeload="1">Checking what Automatic means on this job…</p>' : A === false ? '<p class="pe-note">The portal server did not answer — Automatic still works the usual way.</p>'
    : '<p class="pe-note" data-pe-seekind="' + (gc ? 'gc' : com ? 'commercial' : 'residential') + '">This is <b>' + esc(kind) + '</b>' + (com ? ': the customer’s portal says “property” instead of “home”.' : '.') + ' GrayCo Care plans are <b>' + (A.plansOn ? 'ON' : 'OFF') + '</b> company-wide (⚙ Admin).</p>';
  SEE.forEach(function(x){
    var m = seeMode(p, x[0]), auto = A && A.auto ? A.auto[x[0]] : null;
    var now = m === 'on' ? true : m === 'off' ? false : auto;
    h += '<div class="pe-row" data-pe-see="' + x[0] + '"><div class="pe-x">' + esc(x[1]) + '<small>' + esc(x[2]) + (m === 'auto' && auto != null ? ' Now: ' + (auto ? 'shown' : 'hidden') + '.' : '') + '</small>' +
      (now === true ? '<span class="pe-pill ok">Customer sees it</span>' : now === false ? '<span class="pe-pill off">Hidden from customer</span>' : '') + '</div>' +
      '<div class="pe-btns" role="group" aria-label="' + esc(x[1]) + '" style="margin:0;flex:0 0 auto;gap:4px">' + [['auto', 'Automatic'], ['on', 'Show'], ['off', 'Hide']].map(function(o){
        return '<button type="button" class="pe-b sm' + (m === o[0] ? ' pri' : '') + '" data-pe="see-set" data-k="' + x[0] + '" data-v="' + o[0] + '" aria-pressed="' + (m === o[0] ? 'true' : 'false') + '">' + o[1] + '</button>'; }).join('') + '</div></div>';
  });
  h += '<p class="pe-note" data-pe-seemsg role="status" style="margin:6px 0 0">' + esc(CUR.seeMsg || 'Each tap saves on the job — nothing is sent to the customer. 👁 Customer view shows exactly what they get.') + '</p>';
  return sec('see', '👤 What the customer sees', 'Turn sections of ' + esc(first(p.client) || 'the customer') + '’s portal on or off for this job.', h);
}
/* 📝 details */
function detailsSec(p){""")
sub("""  if (a === 'view') { CUR.mode = 'cust'; CUR.frameT = Date.now(); paint(); return; }
""", """  if (a === 'view') { CUR.mode = 'cust'; CUR.frameT = Date.now(); paint(); return; }
  if (a === 'see-set') {   /* patch PORTALSEE: one switch — from the newest copy of the job, only job.portalShow, through the job's person-edit path */
    var sk = b.getAttribute('data-k'), sv = b.getAttribute('data-v');
    if (!SEE.some(function(x){ return x[0] === sk; }) || !/^(auto|on|off)$/.test(sv)) return;
    var np = proj(pid) || p, cur0 = np.portalShow && typeof np.portalShow === 'object' ? np.portalShow : {}, ps = {};
    Object.keys(cur0).forEach(function(k){ if (SEE.some(function(x){ return x[0] === k; }) && /^(on|off)$/.test(low(cur0[k]))) ps[k] = low(cur0[k]); });
    if (sv === 'auto') delete ps[sk]; else ps[sk] = sv;
    if (seeMode(np, sk) === sv) return;
    var lab = (SEE.filter(function(x){ return x[0] === sk; })[0] || [])[1] || sk;
    b.disabled = true;
    patchJob(pid, { portalShow: ps }, 'customer portal: what the customer sees').then(function(ok){
      CUR.seeMsg = ok ? '✓ Saved — ' + lab + ': ' + (sv === 'auto' ? 'Automatic' : sv === 'on' ? 'shown to the customer' : 'hidden from the customer') + '. Nothing was sent.' : 'Not saved — reload the CRM and try again.';
      CUR.frameT = Date.now(); repaintSec('see', seeSec); if (!ok) toast('Not saved — reload the CRM and try again.', true);
    });
    return;
  }
""")
sub("""  paint(); loadAll();
  return true;
}""", """  paint(); loadAll(); loadSee();   /* patch PORTALSEE */
  return true;
}""")
sub("""W._gcPortalEd = { msPlan: msPlan, msSync: msSync,""", """/* patch PORTALSEE: open the editor at "👤 What the customer sees" (the job page's inline link after a new job) */
function openSee(pid){ if (!open(pid)) return false; later(function(){ var el = body() && body().querySelector('[data-pe-sec="see"]'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' }); }, 60); return true; }
W._gcPortalEd = { openSee: openSee, msPlan: msPlan, msSync: msSync,""")

# 4. the job's 🏠 Portal card: a new job offers "👤 Customer portal: what they see" inline (no popup)
sub("""    '<button type="button" data-q="more" title="More" aria-label="More" aria-expanded="false" style="' + IB + ';font-weight:800">⋯</button></div>';
  h += '<div data-q="panel" hidden""", """    '<button type="button" data-q="more" title="More" aria-label="More" aria-expanded="false" style="' + IB + ';font-weight:800">⋯</button></div>';
  try {   /* patch PORTALSEE: a job made in the last 14 days with no picks yet — what the customer's portal will show, one tap away */
    var mk0 = Date.parse(p.createdAt || p.created || p.dateCreated || p.createdDate || '') || 0, picked = p.portalShow && typeof p.portalShow === 'object' && Object.keys(p.portalShow).length;
    if (window._gcPortalEd && typeof window._gcPortalEd.openSee === 'function' && window._gcPortalEd.can(p.id) && mk0 && Date.now() - mk0 < 14 * 864e5 && !picked)
      h += '<div data-q="seerow" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px;padding:8px 10px;border:1px solid #F0D9A0;background:#FFF8E5;border-radius:10px;font-size:13px">' +
        '<span style="flex:1 1 200px">New job — choose what the customer sees (maintenance plans, “How did you hear about us”, tabs…).</span>' +
        '<button type="button" data-q="psee" style="min-height:40px;padding:0 12px;border:1px solid ' + GOLD + ';border-radius:10px;background:#fff;color:#7C4A03;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit">👤 Customer portal: what they see</button></div>';
  } catch (e) {}
  h += '<div data-q="panel" hidden""")
sub("""    if (q === 'ped') { if (window._gcPortalEd) window._gcPortalEd.open(pid); return; }   /* patch PORTALED */""",
    """    if (q === 'ped') { if (window._gcPortalEd) window._gcPortalEd.open(pid); return; }   /* patch PORTALED */
    if (q === 'psee') { if (window._gcPortalEd && window._gcPortalEd.openSee) window._gcPortalEd.openSee(pid); return; }   /* patch PORTALSEE */""")

# 5. "dont have lead in these": the "Stage the customer sees" pickers no longer offer Lead / Contacted / Appointment booked (a job
#    already set to one keeps it shown, so nothing changes by itself); the values stay the full list's numbers.
sub("""'<option value="auto"' + (stage === 'auto' ? ' selected' : '') + '>Automatic</option>' + STAGES.map(function(n, i){ return '<option value="' + i + '"' + (stage === String(i) ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select></label>' +""",
    """'<option value="auto"' + (stage === 'auto' ? ' selected' : '') + '>Automatic</option>' + STAGES.map(function(n, i){ return i < 3 && stage !== String(i) ? '' : '<option value="' + i + '"' + (stage === String(i) ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select></label>' +   /* patch PORTALSEE: no sales steps */""")
sub(""">Automatic (from the job)</option>' + STAGES.map(function(n, i){ return '<option value="' + i + '"' + (st === String(i) ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('')""",
    """>Automatic (from the job)</option>' + STAGES.map(function(n, i){ return i < 3 && st !== String(i) ? '' : '<option value="' + i + '"' + (st === String(i) ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('')""")
open(p, 'w', encoding='utf-8').write(s); print('PORTALSEE applied')
