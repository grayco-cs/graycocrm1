#!/usr/bin/env python3
"""patch PAIDBEFORE (owner 11/4: "all these past invoices we already paid so i dont want them to end up in the check run
but i do want to match them and put on correct job for office pnl"). A To-Do for admins "✓ N old sub bills are not marked
paid" opens a checklist of every unpaid sub / supplier bill received on or before 2026-11-03 (all ticked; untick any not
paid). "✓ Mark paid (before the CRM)" sets status paid + paidOutside + noBooks (+ paid date / check # / "paid in
QuickBooks"): they leave Everyone we owe and the check run, stay on their job's P&L as cost, and the accounting settle
never books them again (paidSubInvoices skips noBooks / paidOutside). Undo the last batch from the same sheet; every
mark records who and when. Bills with no job keep showing in the jobs-to-match lists."""
import sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(P, encoding='utf-8').read()
if '__GC_PAIDBEFORE__' in src: print('already patched'); sys.exit(0)
def rep(o, n):
    global src
    assert src.count(o) == 1, (src.count(o), o[:70]); src = src.replace(o, n)
rep("    if(low(v.type)!=='sub' && low(v.type)!=='supplier' && low(v.type)!=='vendor') return false;\n    return v.paid===true || low(v.status)==='paid';",
    "    if(low(v.type)!=='sub' && low(v.type)!=='supplier' && low(v.type)!=='vendor') return false;\n    if(v.noBooks || v.paidOutside) return false;   /* PAIDBEFORE: paid before the CRM — already in QuickBooks, never booked again */\n    return v.paid===true || low(v.status)==='paid';")
rep("  if (t.kind === 'job_contact') return 'jobs';   /* JOBCONTACT */", "  if (t.kind === 'job_contact') return 'jobs';   /* JOBCONTACT */\n  if (t.kind === 'paid_before') return 'money';   /* PAIDBEFORE */")
rep("      else if (t.kind === 'job_contact') o.act = { l: '📇 Fill them in', f: function(){ call('_gcJobContactSheet'); } };   /* JOBCONTACT */",
    "      else if (t.kind === 'job_contact') o.act = { l: '📇 Fill them in', f: function(){ call('_gcJobContactSheet'); } };   /* JOBCONTACT */\n      else if (t.kind === 'paid_before') o.act = { l: '✓ Review & mark paid', f: function(){ call('_gcPaidBeforeSheet'); } };   /* PAIDBEFORE */")
tail = r'''
<script id="gc-patch-paidbefore">/* __GC_PAIDBEFORE__ — patch PAIDBEFORE (tools/patch_PAIDBEFORE.py) */
(function(W){ if (W.__GC_PAIDBEFORE__) return; W.__GC_PAIDBEFORE__ = true;
var D = W.document, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval, CUT = '2026-11-03', LOGK = 'gc_paidbefore_log';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function n2(v){ var x = parseFloat(String(v == null ? '' : v).replace(/[$,]/g, '')); return isFinite(x) ? x : 0; }
function money(v){ return '$' + n2(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function me(){ try { var u = JSON.parse(localStorage.getItem('grayco_user') || '{}'); return s(u.name || u.email) || 'an admin'; } catch (e) { return 'an admin'; } }
function admin(){ try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {} try { var u = JSON.parse(localStorage.getItem('grayco_user') || '{}'); return /admin/i.test(s(u.role)) || /owner/i.test(s(u.payType)); } catch (e) { return false; } }
function invs(){ var c = W._crm || {}; var l = c.invoices || c.invs || []; return Array.isArray(l) ? l : []; }
function day(i){ return s(i.recvDate || i.date || i.billDate).slice(0, 10); }
function open(){ return invs().filter(function(i){ return i && /^(sub|supplier|vendor)$/.test(low(i.type)) && !(i.paid === true || low(i.status) === 'paid') && !/deni|void|reject|cancel/.test(low(i.status)) && day(i) && day(i) <= CUT; }); }
function projName(pid){ var p = ((W._crm && W._crm.projects) || []).find(function(x){ return x && x.id === pid; }); return p ? s(p.name) : ''; }
function setInvs(fn){ var f = function(list){ var out = (list || []).map(fn); try { if (W._gcApplySync) W._gcApplySync('invs', out); } catch (e) {} return out; }; if (W._setInvoices) W._setInvoices(f); else if (W._gcApplySync) W._gcApplySync('invs', f(invs())); }
function getLog(){ try { var l = JSON.parse(localStorage.getItem(LOGK) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function setLog(l){ try { localStorage.setItem(LOGK, JSON.stringify(l.slice(-20))); } catch (e) {} try { var u = W._supaUpsertNow || W._supaUpsert; if (u) u(LOGK, l.slice(-20)); } catch (e) {} }
function tasks(){ try { var l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function saveTasks(l){ try { localStorage.setItem('gc_office_tasks', JSON.stringify(l)); } catch (e) {} try { if (W._gcOfficeTasksPush) W._gcOfficeTasksPush(); } catch (e) {} try { var u = W._supaUpsertNow || W._supaUpsert; if (u) u('gc_office_tasks', l); } catch (e) {} }
function sweep(){
  try {
    if (!admin() || !invs().length) return;
    var L = open(), n = L.length, l = tasks(), t = l.find(function(x){ return x && x.id === 'PAIDBEFORE'; }), now = new Date().toISOString(), ch = false;
    var lab = '✓ ' + n + ' old sub bill' + (n === 1 ? ' is' : 's are') + ' not marked paid (' + money(L.reduce(function(a, i){ return a + n2(i.amt != null ? i.amt : i.amount); }, 0)) + ', on or before 11/3)';
    if (n && !t) { l.push({ id: 'PAIDBEFORE', kind: 'paid_before', label: lab, note: 'Paid before the CRM? Mark them paid so they leave Everyone we owe and the check run (nothing is booked again — they are in QuickBooks). They stay on each job’s P&L.', addedBy: 'CRM', addedAt: now, updatedAt: now, done: false, prio: 'high' }); ch = true; }
    else if (t && n && (t.done || t.label !== lab)) { t.label = lab; t.done = false; t.updatedAt = now; ch = true; }
    else if (t && !n && !t.done) { t.done = true; t.doneAt = now; t.updatedAt = now; t.resolution = 'all marked'; ch = true; }
    if (ch) saveTasks(l);
  } catch (e) {}
}
W._gcPaidBeforeSheet = function(){
  var old = D.getElementById('gc-pb-ov'); if (old) old.remove();
  var L = open().sort(function(a, b){ return day(a) < day(b) ? -1 : 1; }), last = getLog().slice(-1)[0];
  var ov = D.createElement('div'); ov.id = 'gc-pb-ov'; ov.setAttribute('data-gc-keep', '1');
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483400;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:12px;font:14px Inter,Arial,sans-serif';
  ov.innerHTML = '<div role="dialog" aria-label="Old sub bills paid before the CRM" style="background:#fff;color:#0f172a;border-radius:14px;width:min(820px,100%);max-height:92vh;overflow:auto;padding:16px">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:17px">✓ Sub bills paid before the CRM (' + L.length + ')</b><button type="button" data-pb="x" style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:6px 12px;cursor:pointer">Close</button></div>'
    + '<div style="color:#475569;margin:4px 0 10px">Received on or before 11/3/2026 and not marked paid. Untick any that were <b>not</b> paid. Marked bills leave Everyone we owe and the check run, stay on their job’s P&L, and are <b>not</b> booked again (they are in QuickBooks).</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px;font-size:13px"><label>Paid date <input type="date" data-pb-date style="padding:5px"> <span style="color:#64748b">(blank = each bill’s own date)</span></label><label>Check # <input type="text" data-pb-chk style="padding:5px;width:90px"></label><label><input type="checkbox" data-pb-qb checked> Paid in QuickBooks</label></div>'
    + (L.length ? '<table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="text-align:left;color:#64748b"><th><input type="checkbox" data-pb-all checked aria-label="Tick all"></th><th>Date</th><th>Sub / vendor</th><th>Job</th><th style="text-align:right">Amount</th></tr>'
      + L.map(function(i){ var j = projName(i.pid); return '<tr style="border-top:1px solid #e2e8f0"><td><input type="checkbox" data-pb-id="' + esc(i.id) + '" checked></td><td>' + esc(day(i)) + '</td><td>' + esc(i.sub || i.vendor || i.payee) + (i.invNum ? ' <span style="color:#64748b">#' + esc(i.invNum) + '</span>' : '') + (/quickbooks/i.test(s(i.source)) ? ' <span style="color:#64748b">· QuickBooks</span>' : '') + '</td><td>' + (j ? esc(j) : '<span style="color:#b45309">(no job — match it later)</span>') + '</td><td style="text-align:right">' + money(i.amt != null ? i.amt : i.amount) + '</td></tr>'; }).join('') + '</table>'
      : '<div>✓ Nothing old is waiting.</div>')
    + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap">' + (last && !last.undone ? '<button type="button" data-pb="undo" style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:8px 12px;cursor:pointer">↩ Undo the last batch (' + last.ids.length + ', ' + esc(last.by) + ')</button>' : '') + (L.length ? '<button type="button" data-pb="go" style="background:#166534;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer">✓ Mark ticked bills paid (before the CRM)</button>' : '') + '</div></div>';
  D.body.appendChild(ov);
  ov.addEventListener('change', function(e){ if (e.target.hasAttribute('data-pb-all')) [].forEach.call(ov.querySelectorAll('[data-pb-id]'), function(c){ c.checked = e.target.checked; }); });
  ov.addEventListener('click', function(e){
    if (e.target === ov) { ov.remove(); return; }
    var b = e.target.closest && e.target.closest('[data-pb]'); if (!b) return; var a = b.getAttribute('data-pb');
    if (a === 'x') { ov.remove(); return; }
    if (a === 'undo') { var lg = getLog(), x = lg[lg.length - 1]; if (!x || x.undone) return; var prev = {}; x.prev.forEach(function(p){ prev[p.id] = p; });
      setInvs(function(i){ if (!i || !prev[i.id]) return i; var p = prev[i.id], o = Object.assign({}, i, { status: p.status, paid: p.paid, paidDate: p.paidDate, updatedAt: new Date().toISOString() }); delete o.paidOutside; delete o.noBooks; delete o.paidVia; delete o.paidCheckNo; delete o.paidInQuickBooks; delete o.paidMarkedBy; delete o.paidMarkedAt; return o; });
      x.undone = true; x.undoneBy = me(); x.undoneAt = new Date().toISOString(); setLog(lg); ov.remove(); ST.call(W, function(){ sweep(); W._gcPaidBeforeSheet(); }, 600); return; }
    if (a === 'go') {
      var ids = [].slice.call(ov.querySelectorAll('[data-pb-id]:checked')).map(function(c){ return c.getAttribute('data-pb-id'); }); if (!ids.length) return;
      var dt = s((ov.querySelector('[data-pb-date]') || {}).value), chk = s((ov.querySelector('[data-pb-chk]') || {}).value), qb = !!(ov.querySelector('[data-pb-qb]') || {}).checked, now = new Date().toISOString(), who = me(), prev = [];
      if (!W.confirm('Mark ' + ids.length + ' bill' + (ids.length === 1 ? '' : 's') + ' paid (before the CRM)?\n\nThey leave Everyone we owe and the check run. Nothing is booked to accounting again.')) return;
      var set = {}; ids.forEach(function(id){ set[id] = 1; });
      invs().forEach(function(i){ if (i && set[i.id]) prev.push({ id: i.id, status: i.status, paid: i.paid, paidDate: i.paidDate || '' }); });
      setInvs(function(i){ if (!i || !set[i.id]) return i; return Object.assign({}, i, { status: 'paid', paid: true, paidDate: dt || i.paidDate || day(i), paidOutside: true, noBooks: true, paidVia: 'before the CRM', paidCheckNo: chk, paidInQuickBooks: qb, paidMarkedBy: who, paidMarkedAt: now, updatedAt: now }); });
      var lg = getLog(); lg.push({ at: now, by: who, ids: ids, prev: prev }); setLog(lg);
      ov.remove(); ST.call(W, sweep, 800);
      try { W.alert('✓ ' + ids.length + ' bill' + (ids.length === 1 ? '' : 's') + ' marked paid (before the CRM). Bills with no job still show in the jobs-to-match lists.'); } catch (e) {}
    }
  });
};
W._gcPaidBefore = { open: open, sweep: sweep };
ST.call(W, sweep, 25000); SI.call(W, sweep, 180000);
})(window);
</script>
'''
src = src.rstrip('\n') + '\n' + tail
open(P, 'w', encoding='utf-8').write(src); print('patched')
