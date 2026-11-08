#!/usr/bin/env python3
"""patch JOBCONTACT (owner 11/5: "to enter the job in the crm at all a phone number or email has to be in the crm /
company cam / grayco photos, whatever"). New Project, 🚀 Launch Job and the Field "＋ New project" stop with "Add the
customer's phone or e-mail" until one is there (a linked customer's phone / e-mail counts; on a commercial bid a GC's
counts). The Field form keeps Phone on top (not under More details). Jobs already in the CRM are never blocked: one
To-Do / approval "📇 N jobs have no phone or e-mail" opens a list to fill them in place."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '__GC_JOBCONTACT__' in src: print('already patched'); sys.exit(0)
def rep(o, n):
    global src
    assert src.count(o) == 1, (src.count(o), o[:80]); src = src.replace(o, n)
CHK = 'if(window._gcHasContact&&!window._gcHasContact(%s)){se("Add the customer\\u2019s phone or e-mail \\u2014 every job needs one");return}'
rep('if(!y.name){se("Name required");return}/* patch ACTIVEDATES */if(window._gcAD&&window._gcAD.form(null,y', 'if(!y.name){se("Name required");return}' + CHK % 'y' + '/* patch ACTIVEDATES */if(window._gcAD&&window._gcAD.form(null,y')
rep('onClick:()=>{if(!Le.name){se("Project name required");return}', 'onClick:()=>{if(!Le.name){se("Project name required");return}' + CHK % 'Le')
rep("    if (!name && !addr) { q('gc-cc2-err').textContent = 'Add a customer name or an address.'; return; }",
    "    if (!name && !addr) { q('gc-cc2-err').textContent = 'Add a customer name or an address.'; return; }\n"
    "    try { var _ph = q('gc-cc2-phone'), _em = [].slice.call(ov.querySelectorAll('input')).filter(function(i){ return /e-?mail/i.test((i.placeholder || '') + ' ' + (i.name || '') + ' ' + (i.type || '')); })[0]; if (W._gcHasContact && !W._gcHasContact({ client: name, clientPhone: _ph && _ph.value, clientEmail: _em && _em.value })) { q('gc-cc2-err').textContent = 'Add the customer\\u2019s phone or e-mail \\u2014 every job needs one.'; return; } } catch (e) {}   /* JOBCONTACT */")
rep("  ['#gc-cc2-phone', '#gc-cc2-type'].forEach(function(sel){", "  ['#gc-cc2-type'].forEach(function(sel){   /* JOBCONTACT: Phone stays on top (phone or e-mail is required) */")
rep("  if (t.kind === 'job_done') return 'appr';   /* JOBDONE */", "  if (t.kind === 'job_done') return 'appr';   /* JOBDONE */\n  if (t.kind === 'job_contact') return 'jobs';   /* JOBCONTACT */")
rep("      if (t.kind === 'job_done') o.act = { l: '🏁 Mark complete', f: function(){ call('_gcJobDoneApprove', id); } };   /* JOBDONE */",
    "      if (t.kind === 'job_done') o.act = { l: '🏁 Mark complete', f: function(){ call('_gcJobDoneApprove', id); } };   /* JOBDONE */\n      else if (t.kind === 'job_contact') o.act = { l: '📇 Fill them in', f: function(){ call('_gcJobContactSheet'); } };   /* JOBCONTACT */")
tail = r'''
<script id="gc-patch-jobcontact">/* __GC_JOBCONTACT__ — patch JOBCONTACT (tools/patch_JOBCONTACT.py) */
(function(W){ if (W.__GC_JOBCONTACT__) return; W.__GC_JOBCONTACT__ = true;
var D = W.document, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function ph10(v){ var d = s(v).replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d.length === 10 ? d : ''; }
function okEmail(v){ return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(s(v)); }
function custOf(p){ var C = (W._crm && W._crm.customers) || []; return C.find(function(c){ return c && p.customerId && s(c.id) === s(p.customerId); }) || (s(p.client) ? C.find(function(c){ return c && low(c.name) === low(p.client); }) : null) || null; }
function has(p){
  if (!p) return false;
  if (ph10(p.clientPhone || p.phone || p.customerPhone) || okEmail(p.clientEmail || p.email || p.customerEmail)) return true;
  var c = custOf(p); if (c && (ph10(c.phone || c.mobile) || okEmail(c.email))) return true;
  if (Array.isArray(p.bidGCs) && p.bidGCs.some(function(g){ return g && (ph10(g.phone) || okEmail(g.email)); })) return true;
  if (ph10(p.gcPhone) || okEmail(p.gcEmail)) return true;
  return false;
}
W._gcHasContact = has;
function admin(){ try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {} try { var u = JSON.parse(localStorage.getItem('grayco_user') || '{}'); return /admin|office/i.test(s(u.role) + ' ' + s(u.profile)) || /owner/i.test(s(u.payType)); } catch (e) { return false; } }
var CLOSED = /complete|closed|lost|cancel|archiv|dead|declined/i;
function missing(){ return ((W._crm && W._crm.projects) || []).filter(function(p){ return p && p.id && !p.deleted && !p.mergedInto && !CLOSED.test(s(p.status)) && !has(p); }); }
function tasks(){ try { var l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function saveTasks(l){ try { localStorage.setItem('gc_office_tasks', JSON.stringify(l)); } catch (e) {} try { if (W._gcOfficeTasksPush) W._gcOfficeTasksPush(); } catch (e) {} try { var u = W._supaUpsertNow || W._supaUpsert; if (u) u('gc_office_tasks', l); } catch (e) {} }
function sweep(){
  try {
    if (!admin()) return; var P = (W._crm && W._crm.projects) || []; if (!P.length) return;
    var n = missing().length, l = tasks(), t = l.find(function(x){ return x && x.id === 'JOBCONTACT'; }), now = new Date().toISOString(), ch = false;
    if (n && !t) { l.push({ id: 'JOBCONTACT', kind: 'job_contact', label: '📇 ' + n + ' open job' + (n === 1 ? ' has' : 's have') + ' no customer phone or e-mail', note: 'Every job needs one. Fill them in from the list (one tap each).', addedBy: 'CRM', addedAt: now, updatedAt: now, done: false }); ch = true; }
    else if (t && n && (t.done || t.label.indexOf(' ' + n + ' ') < 0 && t.label.indexOf('📇 ' + n + ' ') < 0)) { t.label = '📇 ' + n + ' open job' + (n === 1 ? ' has' : 's have') + ' no customer phone or e-mail'; t.done = false; t.updatedAt = now; ch = true; }
    else if (t && !n && !t.done) { t.done = true; t.doneAt = now; t.updatedAt = now; t.resolution = 'every open job has a phone or e-mail'; ch = true; }
    if (ch) saveTasks(l);
  } catch (e) {}
}
function save(pid, ph, em){
  var now = new Date().toISOString();
  var fn = function(list){ var out = (list || []).map(function(x){ if (!x || x.id !== pid) return x; var o = Object.assign({}, x, { updatedAt: now }); if (ph) o.clientPhone = ph; if (em) o.clientEmail = em; return o; }); try { if (W._gcApplySync) W._gcApplySync('projects', out); } catch (e) {} return out; };
  if (W._setProjects) W._setProjects(fn); else if (W._gcApplySync) W._gcApplySync('projects', fn((W._crm && W._crm.projects) || []));
}
W._gcJobContactSheet = function(){
  var old = D.getElementById('gc-jc-ov'); if (old) old.remove();
  var L = missing(), ov = D.createElement('div'); ov.id = 'gc-jc-ov'; ov.setAttribute('data-gc-keep', '1');
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483400;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:12px;font:14px Inter,Arial,sans-serif';
  ov.innerHTML = '<div role="dialog" aria-label="Jobs with no phone or e-mail" style="background:#fff;color:#0f172a;border-radius:14px;width:min(760px,100%);max-height:90vh;overflow:auto;padding:16px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:17px">📇 Jobs with no phone or e-mail (' + L.length + ')</b><button type="button" data-jc="x" style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:6px 12px;cursor:pointer">Close</button></div>'
    + '<div style="color:#64748b;margin:4px 0 10px">Add a phone or an e-mail (one is enough) and press Save.</div>'
    + (L.length ? L.map(function(p){ return '<div data-pid="' + esc(p.id) + '" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;border-top:1px solid #e2e8f0;padding:8px 0"><b style="min-width:180px;flex:1">' + esc(p.name || p.id) + '<br><span style="font-weight:400;color:#64748b;font-size:12.5px">' + esc([p.client, p.address, p.status].filter(Boolean).join(' · ')) + '</span></b>'
      + '<input data-jc-ph type="tel" placeholder="Phone" style="padding:7px;border:1px solid #cbd5e1;border-radius:7px;width:140px"><input data-jc-em type="email" placeholder="E-mail" style="padding:7px;border:1px solid #cbd5e1;border-radius:7px;width:190px">'
      + '<button type="button" data-jc="save" style="background:#241968;color:#fff;border:0;border-radius:7px;padding:7px 12px;cursor:pointer">Save</button><span data-jc-msg style="font-size:12px;color:#b91c1c"></span></div>'; }).join('') : '<div>✓ Every open job has a phone or e-mail.</div>')
    + '</div>';
  D.body.appendChild(ov);
  ov.addEventListener('click', function(e){
    if (e.target === ov) { ov.remove(); return; }
    var b = e.target.closest && e.target.closest('[data-jc]'); if (!b) return;
    if (b.getAttribute('data-jc') === 'x') { ov.remove(); return; }
    var row = b.closest('[data-pid]'), ph = s(row.querySelector('[data-jc-ph]').value), em = s(row.querySelector('[data-jc-em]').value), msg = row.querySelector('[data-jc-msg]');
    if (!ph10(ph) && !okEmail(em)) { msg.textContent = 'A 10-digit phone or an e-mail, please.'; return; }
    save(row.getAttribute('data-pid'), ph10(ph) ? ph : '', okEmail(em) ? em : ''); row.style.opacity = '.45'; msg.style.color = '#166534'; msg.textContent = '✓ Saved'; b.disabled = true;
    ST.call(W, sweep, 800);
  });
};
ST.call(W, sweep, 20000); SI.call(W, sweep, 120000);
})(window);
</script>
'''
src = src.rstrip('\n') + '\n' + tail
open(P, 'w', encoding='utf-8').write(src); print('patched')
