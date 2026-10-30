#!/usr/bin/env python3
"""Idempotent patch UNSORTLEAD (owner 10/29, Messages → "Unsorted — pick a job"):
"some messages are leads without a job yet — I should be able to make a job here, and this pull-down didn't go away
when I clicked over to the side".

1. The one searchable dropdown (patch "ONE searchable dropdown") also closes on a pointer-down anywhere outside it
   (window capture, so no other page handler can swallow it), when its <select> leaves the screen (a thread or another
   screen opened), and when the page is hidden. Esc / click-outside / resize still close it as before.
2. An unsorted text whose phone number belongs to a lead gets "📋 Open lead: <name>" (from the lead: 🚀 Launch Job makes
   the job, and the conversation follows it — patch TEXTLEAD) and "✓ Keep it on the lead" (the message leaves Unsorted;
   the lead already has the text in its own log). A text from a number with no lead gets "➕ Make a lead": a New Lead with
   the phone, the message and the date, then it opens. Picking a job + Move works as before."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch UNSORTLEAD'
if MARK in t: print('UNSORTLEAD: already patched'); sys.exit(0)
def once(old, new):
    global t
    n = t.count(old); assert n == 1, ('UNSORTLEAD anchor', n, old[:90]); t = t.replace(old, new)

# 1. the searchable dropdown closes reliably
once("""function onDocDown(e){ if(pop && !pop.contains(e.target)) close(); }
function onKey(e){ if(e.key==='Escape'){ e.preventDefault(); close(); } }""",
"""function onDocDown(e){ if(pop && !pop.contains(e.target)) close(); }
function onKey(e){ if(e.key==='Escape'){ e.preventDefault(); close(); } }
""" + MARK + """: a click anywhere else closes it even when another handler stops the mousedown; so does its list leaving the screen */
window.addEventListener('pointerdown', function(e){ try{ if(pop && !pop.contains(e.target) && e.target!==popSel) close(); }catch(_e){} }, true);
document.addEventListener('visibilitychange', function(){ if(document.hidden && pop) close(); });
setInterval(function(){ try{ if(pop && (!popSel || !popSel.isConnected || !popSel.offsetParent)) close(); }catch(_e){} }, 400);""")

# 2a. a message kept on its lead is not "unsorted"
once("""  return msgs().filter(function(m){ return m && m.id && !m.deleted && (!s(m.pid) || !ids[s(m.pid)]); });""",
"""  return msgs().filter(function(m){ return m && m.id && !m.deleted && !s(m.onLead) && (!s(m.pid) || !ids[s(m.pid)]); });   """ + MARK + """ */""")

# 2b. the lead buttons on each unsorted text
once("""        + '<button type="button" data-qa-move="' + esc(m.id) + '" style="padding:6px 10px;border:0;border-radius:6px;background:#1b1640;color:#fff;font-weight:700;cursor:pointer">Move</button></div>';""",
"""        + '<button type="button" data-qa-move="' + esc(m.id) + '" style="padding:6px 10px;border:0;border-radius:6px;background:#1b1640;color:#fff;font-weight:700;cursor:pointer">Move</button>'
        + leadBtns(m) + '</div>';""")
once("""W._gcMsgUnsortedHtml = function(){""",
"""/* """ + MARK[3:] + """: the lead a text belongs to (by phone) */
var GC_NO = '9015828255';
function ph10(v){ var d = s(v).replace(/\\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function msgPhone(m){ var a = ph10(m.smsFrom), b = ph10(m.smsTo); if (a.length === 10 && a !== GC_NO) return a; if (b.length === 10 && b !== GC_NO) return b; var x = /sms:(\\d{10})/.exec(s(m.authorId)); return x ? x[1] : ''; }
function allLeads(){ var L = []; try { if (typeof W._gcLaLeads === 'function') L = arr(W._gcLaLeads()); } catch (e) {} if (!L.length) try { L = arr((W._crm || {}).leads); } catch (e) {} return L.filter(function(l){ return l && l.id && !l.deleted; }); }
function leadFor(m){ var ph = msgPhone(m); if (ph.length !== 10) return null; return allLeads().filter(function(l){ return ph10(l.smsFrom) === ph || ph10(l.phone) === ph || ph10((l.contact || {}).phone) === ph || ph10((l.leadExtra || {}).smsFrom) === ph; })
  .sort(function(a, b){ return s(b.updatedAt || b.createdAt).localeCompare(s(a.updatedAt || a.createdAt)); })[0] || null; }
var BTN = 'padding:6px 10px;border:1px solid #c4b5fd;border-radius:6px;background:#fff;color:#4c1d95;font-weight:700;cursor:pointer';
function leadBtns(m){
  var ph = msgPhone(m); if (ph.length !== 10) return '';
  var l = leadFor(m);
  if (l) return '<button type="button" data-qa-lead-open="' + esc(l.id) + '" style="' + BTN + '">📋 Open lead: ' + esc(s(l.name || l.contactName || 'lead').slice(0, 40)) + '</button>'
    + '<button type="button" data-qa-onlead="' + esc(m.id) + '" data-lead="' + esc(l.id) + '" style="' + BTN + '">✓ Keep it on the lead</button>';
  return m.dir === 'in' ? '<button type="button" data-qa-mklead="' + esc(m.id) + '" style="' + BTN + '">➕ Make a lead</button>' : '';
}
/* write one message's fields (merged with the cloud copy), the same way a Move does */
function patchMsg(id, extra){
  var fix = function(list){ return arr(list).map(function(m){ return m && m.id === id ? Object.assign({}, m, extra) : m; }); };
  var local = fix(msgs()); try { localStorage.setItem('gc_job_messages', JSON.stringify(local)); } catch (e) {}
  var cr = sbCreds(); if (!cr.k) return Promise.resolve(true);
  var H = { apikey: cr.k, Authorization: 'Bearer ' + cr.k, 'Content-Type': 'application/json' }, base = cr.u.replace(/\\/$/, '') + '/rest/v1/gc_kv';
  return fetch(base + '?key=eq.gc_job_messages&select=value', { headers: H }).then(function(r){ return r.ok ? r.json() : []; }).then(function(rows){
    var remote = []; try { var v = rows && rows[0] && rows[0].value; remote = typeof v === 'string' ? JSON.parse(v) : arr(v); } catch (e) {}
    var all = {}; arr(remote).concat(local).forEach(function(m){ if (m && m.id) all[m.id] = m; });
    var merged = fix(Object.keys(all).map(function(k){ return all[k]; })).sort(function(a, b){ return s(a.at).localeCompare(s(b.at)); });
    try { localStorage.setItem('gc_job_messages', JSON.stringify(merged)); } catch (e) {}
    return fetch(base + '?on_conflict=key', { method: 'POST', headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, H), body: JSON.stringify({ key: 'gc_job_messages', value: JSON.stringify(merged), updated_at: new Date().toISOString() }) }).then(function(){ return true; });
  }).catch(function(){ return true; });
}
/* a New Lead from a text (the same shape the Lead Inbox gives a text lead) */
function makeLead(m){
  var ph = msgPhone(m), nice = '(' + ph.slice(0, 3) + ') ' + ph.slice(3, 6) + '-' + ph.slice(6), now = new Date().toISOString(), me = '';
  try { var u = W.meUser && W.meUser(); me = s(u && (u.name || u.email)); } catch (e) {}
  var when = s(m.at).slice(0, 16).replace('T', ' ');
  var rec = { id: 'LEADMSG-' + s(m.id).replace(/[^A-Za-z0-9]/g, '').slice(-16), name: 'Text message — ' + nice, phone: nice, smsFrom: ph, contactName: 'Texter ' + nice,
    stage: 'New Lead', source: 'Text message', leadSource: 'Text message', sources: ['Text message'], origin: 'messages', textMessage: true, grayCoLead: true,
    notes: 'Text message ' + when + ' UTC: ' + s(m.text).slice(0, 1000), scope: 'Text message ' + when + ' UTC: ' + s(m.text).slice(0, 1000),
    date: now.slice(0, 10), receivedAt: s(m.at) || now, createdAt: now, updatedAt: now, savedAt: now, createdBy: me || 'Messages', unassigned: true,
    urgency: m.urgent ? 'asap' : '', email: '', address: '', city: '', state: '', docs: [], emails: [], trades: [], alsoOn: [] };
  return Promise.resolve().then(function(){ return W.idbGet ? W.idbGet('leads') : null; }).then(function(dl){
    var have = arr(dl).concat(allLeads()).some(function(l){ return l && l.id === rec.id; }); if (have) return rec;
    var next = arr(dl).filter(function(l){ return l && l.id !== rec.id; }).concat([rec]);
    try { if (W.idbSet) W.idbSet('leads', next); } catch (e) {}
    try { if (W._setLeads) W._setLeads(function(prev){ var a = arr(prev); return a.some(function(l){ return l && l.id === rec.id; }) ? a : a.concat([rec]); }); } catch (e) {}
    try { if (Array.isArray((W._crm || {}).leads) && !W._crm.leads.some(function(l){ return l && l.id === rec.id; })) W._crm.leads = W._crm.leads.concat([rec]); } catch (e) {}
    try { if (W._supaUpsert) W._supaUpsert('leads', next); } catch (e) {}
    try { setTimeout(function(){ try { if (W._gcLivePush) W._gcLivePush('leads'); } catch (e) {} }, 300); } catch (e) {}
    return rec;
  });
}
D.addEventListener('click', function(ev){
  var t = ev.target && ev.target.closest && ev.target.closest('[data-qa-lead-open],[data-qa-onlead],[data-qa-mklead]'); if (!t) return;
  ev.preventDefault(); ev.stopPropagation();
  var row = t.closest('.gc-qa-urow');
  if (t.hasAttribute('data-qa-lead-open')) { try { W._gcOpenLead(t.getAttribute('data-qa-lead-open')); } catch (e) {} return; }
  var id = t.getAttribute('data-qa-onlead') || t.getAttribute('data-qa-mklead'), m = msgs().filter(function(x){ return x && x.id === id; })[0]; if (!m) return;
  t.disabled = true;
  if (t.hasAttribute('data-qa-onlead')) { t.textContent = 'Saving…'; patchMsg(id, { onLead: t.getAttribute('data-lead'), onLeadAt: new Date().toISOString() }).then(function(){ if (row) row.remove(); }); return; }
  t.textContent = 'Making the lead…';
  makeLead(m).then(function(rec){ return patchMsg(id, { onLead: rec.id, onLeadAt: new Date().toISOString() }).then(function(){ if (row) row.remove(); try { W._gcOpenLead(rec.id); } catch (e) {} }); });
}, true);
W._gcMsgUnsortedHtml = function(){""")
open(p, 'w', encoding='utf-8').write(t); print('UNSORTLEAD: patched', p)
