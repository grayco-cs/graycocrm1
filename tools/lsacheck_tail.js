<script id="gc-patch-lsacheck">
/* __GC_PATCH_LSACHECK__ — 📞 GOOGLE LSA LEAD CHECK (owner 11/5: "i want the pm that calls the lead to update the crm that the
   lead is good so i get notification and im able to say its good and also when its bad i need him to say its bad right
   away and then i can update ads on my own").
   • An LSA lead (lsaCheck 'pending' — set by the e-mail intake; or any lead whose source says Google LSA / Local Services
     and has no check yet) shows on the PM's 📥 New lead card with 👍 Good lead / 👎 Bad lead (reason) instead of ✓ Got it.
   • The PM's mark → the owner's ✅ Approvals: "🔎 LSA lead <name> — <PM> says GOOD / BAD (reason)". 🔎 Decide opens
     ✓ Good — keep it, or ✕ Bad — I'll dispute in Ads (the lead is closed as "LSA — not a real lead" and a To-Do
     "Dispute <name> in Google Ads by <date>" — about 30 days to dispute; the CRM never touches Google Ads).
   API: window._gcLsaCheck = { isLsa(lead), pm(id, good, reason), decide(id, good) } */
(function(W){
'use strict';
if (W.__GC_PATCH_LSACHECK__) return; W.__GC_PATCH_LSACHECK__ = true;
var D = W.document, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function me(){ var n = ''; try { var u = JSON.parse(localStorage.getItem('grayco_user') || '{}'); n = s(u.name); } catch (e) {} if (n) return n; try { var em = low(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()), x = ((W._crm && W._crm.users) || []).find(function(u){ return u && low(u.email) === em; }); return x ? s(x.name) : em; } catch (e) { return ''; } }
function admin(){ try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {} try { var u = JSON.parse(localStorage.getItem('grayco_user') || '{}'); return /admin/i.test(s(u.role)) || /owner/i.test(s(u.payType)); } catch (e) { return false; } }
function leads(){ return (W._crm && W._crm.leads) || []; }
function lead(id){ return leads().find(function(l){ return l && s(l.id) === s(id); }) || null; }
function isLsa(l){ return !!l && (l.lsaCheck === 'pending' || (!l.lsaCheck && /google\s*lsa|local\s*services/i.test(s(l.leadSource) + ' ' + s(l.source)))); }
function saveLead(id, patch){
  var now = new Date().toISOString();
  var f = function(list){ var out = (list || []).map(function(l){ return l && s(l.id) === s(id) ? Object.assign({}, l, patch, { updatedAt: now }) : l; }); try { if (W._gcApplySync) W._gcApplySync('leads', out); } catch (e) {} return out; };
  if (W._setLeads) W._setLeads(f); else { var o = f(leads()); if (W._crm) W._crm.leads = o; }
}
function tasks(){ try { var l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function saveTasks(l){ try { localStorage.setItem('gc_office_tasks', JSON.stringify(l)); } catch (e) {} try { if (W._gcOfficeTasksPush) W._gcOfficeTasksPush(); } catch (e) {} try { var u = W._supaUpsertNow || W._supaUpsert; if (u) u('gc_office_tasks', l); } catch (e) {} }
function addTask(t){ var l = tasks(); if (l.some(function(x){ return x && x.id === t.id; })) return; var now = new Date().toISOString(); l.push(Object.assign({ addedBy: 'CRM', addedAt: now, updatedAt: now, done: false }, t)); saveTasks(l); }
function closeTask(id, why){ var l = tasks(), t = l.find(function(x){ return x && x.id === id; }); if (!t || t.done) return; t.done = true; t.doneAt = t.updatedAt = new Date().toISOString(); t.resolution = why; saveTasks(l); }
var REASONS = ['Spam / robocall', 'Wrong service (not something we do)', 'Outside our service area', 'Job seeker', 'Solicitation / sales call', 'Duplicate', 'No answer / fake number', 'Other'];
function pm(id, good, reason){
  var l = lead(id); if (!l) return;
  saveLead(id, { lsaCheck: good ? 'pm_good' : 'pm_bad', lsaPmBy: me(), lsaPmAt: new Date().toISOString(), lsaReason: good ? '' : s(reason) });
  addTask({ id: 'LSACHECK_' + id, kind: 'lsa_check', leadId: id, label: '🔎 LSA lead ' + s(l.name || l.phone) + ' — ' + (me() || 'the PM') + ' says ' + (good ? 'GOOD 👍' : 'BAD 👎 (' + s(reason) + ')'), note: 'Google Local Services lead' + (l.phone ? ' · ' + s(l.phone) : '') + (l.message || l.notes ? ' · "' + s(l.message || l.notes).slice(0, 160) + '"' : '') + '. Decide: keep it, or dispute it in Google Ads yourself.', prio: 'high' });
  try { if (W._gcNewLead) W._gcNewLead.seen(id); } catch (e) {}
}
function decide(id, good){
  var l = lead(id); if (!l) return;
  if (good) { saveLead(id, { lsaCheck: 'good', lsaDecidedBy: me(), lsaDecidedAt: new Date().toISOString() }); closeTask('LSACHECK_' + id, 'kept (good lead)'); return; }
  var by = new Date(Date.now() + 30 * 864e5), byS = (by.getMonth() + 1) + '/' + by.getDate() + '/' + by.getFullYear();
  saveLead(id, { lsaCheck: 'bad', lsaDecidedBy: me(), lsaDecidedAt: new Date().toISOString(), stage: 'Lost', status: 'lost', lostReason: 'LSA — not a real lead (' + s(l.lsaReason || 'bad') + ')' });
  closeTask('LSACHECK_' + id, 'bad — dispute in Ads');
  addTask({ id: 'LSADISPUTE_' + id, kind: 'lsa_dispute', leadId: id, label: '⚖️ Dispute ' + s(l.name || l.phone) + ' in Google Ads by ' + byS, note: 'Reason: ' + s(l.lsaReason || '—') + '. Google Ads → Local Services → Leads → find the lead → Dispute / archive. About 30 days to dispute. Tick this when done.', prio: 'high' });
}
W._gcLsaDecide = function(taskId){
  var t = tasks().find(function(x){ return x && x.id === taskId; }); if (!t) return; var l = lead(t.leadId); if (!l) { closeTask(taskId, 'lead gone'); return; }
  var good = W.confirm('🔎 ' + s(l.name || l.phone) + ' (Google LSA)\n' + (l.lsaPmBy ? s(l.lsaPmBy) + ' says ' + (l.lsaCheck === 'pm_good' ? 'GOOD' : 'BAD — ' + s(l.lsaReason)) : '') + '\n\nOK = ✓ Good lead — keep it in the CRM\nCancel = ✕ Bad lead — close it and remind me to dispute it in Google Ads');
  decide(t.leadId, good);
};
/* the PM's buttons on the 📥 New lead card */
function decorate(){
  try {
    [].forEach.call(D.querySelectorAll('.gc-nl .gc-nl-r[data-id]'), function(r){
      var l = lead(r.getAttribute('data-id')); if (!l || !isLsa(l)) return;
      var b = r.querySelector('.gc-nl-b'); if (!b || b.getAttribute('data-lsa')) return;
      b.setAttribute('data-lsa', '1');
      b.innerHTML = '<button type="button" data-lsa-b="good" class="g">👍 Good lead</button><button type="button" data-lsa-b="bad" style="background:#fee2e2;border-color:#fca5a5;color:#991b1b">👎 Bad lead</button>';
      var h = r.querySelector('b'); if (h && !r.querySelector('.gc-lsa-tag')) { var t = D.createElement('span'); t.className = 'gc-lsa-tag'; t.textContent = ' 📞 Google LSA — call, then mark it'; t.style.cssText = 'font-size:12px;color:#b45309;font-weight:700'; h.after(t); }
    });
  } catch (e) {}
}
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest ? e.target.closest('[data-lsa-b]') : null; if (!b) return;
  e.preventDefault(); e.stopPropagation();
  var r = b.closest('[data-id]'), id = r && r.getAttribute('data-id'); if (!id) return;
  if (b.getAttribute('data-lsa-b') === 'good') { pm(id, true); return; }
  var pick = W.prompt('Why is it a bad lead? Type the number:\n' + REASONS.map(function(x, i){ return (i + 1) + '. ' + x; }).join('\n'), '1'); if (pick == null) return;
  var n = parseInt(pick, 10), reason = REASONS[n - 1] || s(pick); if (n === 8 || !REASONS[n - 1]) { var o = W.prompt('Say what was wrong:', REASONS[n - 1] ? '' : s(pick)); if (o == null) return; reason = 'Other: ' + s(o); }
  pm(id, false, reason);
}, true);
SI.call(W, decorate, 700);
W._gcLsaCheck = { isLsa: isLsa, pm: pm, decide: decide };
})(window);
</script>
