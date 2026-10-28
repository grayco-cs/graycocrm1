/* __GC_PATCH_SMSALERT__ — 📱 TEXT ALERTS TO CELL PHONES (owner 10/28: "is there a way for our cell phones to get grayco
   texts also, if so add that in something i can turn on for each person for each type of leads admin etc").
     • ⚙ Admin settings → 📱 Text alerts to cell phones (right under 💬 Text auto-answers, admins): one row per staff person
       (their cell, editable), a master on/off, one switch per alert type (customer texts: off / their jobs / all; new leads;
       assigned to me; emergencies; missed calls; sub texts; approvals summary; admin / system — admins only) and quiet hours
       (default 9 PM–7 AM Central; emergencies still go). Saved through texts.js ?alerts=1 (gc_lead_inbox_kv "gc_sms_alerts").
     • Sending and replying from the cell: netlify/functions/_lib/smsalert.js. About 1¢ per alert text (Twilio). */
(function(){
'use strict';
if (window.__GC_PATCH_SMSALERT__) return; window.__GC_PATCH_SMSALERT__ = true;
var W = window, D = document;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var FN = '/.netlify/functions/texts?alerts=1';
var DATA = null;
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function d10(v){ var d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function tidy(v){ var d = d10(v); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(v); }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function j(path, opts){
  return W.fetch(path, opts).then(function(r){ return r.text().then(function(t){ var o = {}; try { o = JSON.parse(t); } catch (e) { o = { error: t.slice(0, 200) }; } o.__status = r.status; return o; }); },
    function(e){ return { error: 'Cannot reach the server (' + e.message + ').', __status: 0 }; });
}
function toast(msg, bad){
  try { var t = D.createElement('div'); t.setAttribute('data-gc-keep', '1'); t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:100260;background:' + (bad ? '#7f1d1d' : '#14532d') + ';color:#fff;padding:10px 16px;border-radius:10px;font:600 13px Inter,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:90vw';
    D.body.appendChild(t); ST.call(W, function(){ try { t.remove(); } catch (e) {} }, 4000); } catch (e) {}
}
var COLS = [
  { id: 'cust', t: 'Customer texts', h: 'Texts customers send to the GrayCo number — their own jobs only, or all' },
  { id: 'newAll', t: 'New leads (all)', h: 'Every new lead' },
  { id: 'newMine', t: 'Assigned to me', h: 'New leads assigned to this person' },
  { id: 'emerg', t: 'Emergency', h: 'Water / fire / storm emergency leads and emergency texts — ignores quiet hours' },
  { id: 'missed', t: 'Missed calls', h: 'Screened callers nobody answered' },
  { id: 'subs', t: 'Sub texts', h: 'Texts subs send to the GrayCo number' },
  { id: 'approvals', t: 'Approvals', h: 'Approvals waiting for this person — one morning summary at most' },
  { id: 'system', t: 'Admin / system', h: 'Backup / health failures — admins only', admin: true }
];
function hourOpts(sel){ var o = ''; for (var h = 0; h < 24; h++) { var lab = (h % 12 || 12) + (h < 12 ? ' AM' : ' PM'); o += '<option value="' + h + '"' + (h === sel ? ' selected' : '') + '>' + lab + '</option>'; } return o; }
var CB = 'width:18px;height:18px;cursor:pointer';
var TD = 'padding:6px 6px;border-bottom:1px solid #e2e8f0;text-align:center;vertical-align:middle';
function row(x, p){
  p = p || {};
  var on = !!p.on, ph = p.phone || x.phone || '';
  var cells = '<td style="' + TD + '"><input type="checkbox" data-k="on" title="Master on/off for ' + esc(x.name) + '" style="' + CB + '"' + (on ? ' checked' : '') + '></td>'
    + '<td style="' + TD + ';text-align:left;white-space:nowrap"><b>' + esc(x.name) + '</b>' + (x.admin ? ' <span style="font-size:10px;background:#ede9fe;color:#5b21b6;border-radius:999px;padding:1px 6px">admin</span>' : '') + '<div style="font-size:11px;color:#64748b">' + esc(x.email) + '</div></td>'
    + '<td style="' + TD + '"><input data-k="phone" data-orig="' + esc(x.phone || '') + '" inputmode="tel" placeholder="Cell" value="' + esc(ph ? tidy(ph) : '') + '" style="width:118px;padding:5px 6px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px"></td>';
  COLS.forEach(function(c){
    if (c.id === 'cust') { var v = p.cust || 'off';
      cells += '<td style="' + TD + '"><select data-k="cust" style="padding:4px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px"><option value="off"' + (v === 'off' ? ' selected' : '') + '>Off</option><option value="mine"' + (v === 'mine' ? ' selected' : '') + '>Their jobs</option><option value="all"' + (v === 'all' ? ' selected' : '') + '>All</option></select></td>'; return; }
    if (c.admin && !x.admin) { cells += '<td style="' + TD + ';color:#94a3b8;font-size:11px" title="Admins only">—</td>'; return; }
    cells += '<td style="' + TD + '"><input type="checkbox" data-k="' + c.id + '" title="' + esc(c.t) + '" style="' + CB + '"' + (p[c.id] ? ' checked' : '') + '></td>';
  });
  var qf = p.qFrom == null ? 21 : p.qFrom, qt = p.qTo == null ? 7 : p.qTo;
  cells += '<td style="' + TD + ';white-space:nowrap;font-size:12px"><label style="display:inline-flex;gap:4px;align-items:center"><input type="checkbox" data-k="qOn"' + (p.qOff ? '' : ' checked') + '> quiet</label> '
    + '<select data-k="qFrom" style="font-size:12px;padding:3px">' + hourOpts(qf) + '</select>–<select data-k="qTo" style="font-size:12px;padding:3px">' + hourOpts(qt) + '</select></td>';
  return '<tr class="gcsa-row" data-email="' + esc(x.email) + '" data-admin="' + (x.admin ? 1 : 0) + '" style="background:' + (on ? '#fff' : '#f8fafc') + '">' + cells + '</tr>';
}
/* the mitigation-manager role row: emergencies only, resolved to whoever holds the role */
function roleRow(r, p){
  p = p || {};
  var on = !!p.on, h = arr(r.holders);
  var who = h.length ? h.map(function(x){ return esc(x.name) + (x.phone ? ' · ' + esc(tidy(x.phone)) : ' · <span style="color:#b45309">no cell on file</span>'); }).join('<br>') : '<span style="color:#b45309">not hired yet — skipped until someone has the role</span>';
  var cells = '<td style="' + TD + '"><input type="checkbox" data-k="on" style="' + CB + '"' + (on ? ' checked' : '') + '></td>'
    + '<td style="' + TD + ';text-align:left"><b>' + esc(r.name) + '</b> <span style="font-size:10px;background:#e0f2fe;color:#075985;border-radius:999px;padding:1px 6px">role</span><div style="font-size:11px;color:#64748b">' + who + '</div></td>'
    + '<td style="' + TD + ';font-size:11px;color:#64748b">from their record</td>';
  COLS.forEach(function(c){
    if (c.id === 'emerg') cells += '<td style="' + TD + '"><input type="checkbox" data-k="emerg" style="' + CB + '"' + (p.emerg ? ' checked' : '') + '></td>';
    else cells += '<td style="' + TD + ';color:#94a3b8;font-size:11px">—</td>';
  });
  cells += '<td style="' + TD + ';font-size:12px;color:#64748b">emergencies only (any hour)</td>';
  return '<tr class="gcsa-row" data-role="1" data-email="' + esc(r.key) + '" style="background:' + (on ? '#fff' : '#f8fafc') + '">' + cells + '</tr>';
}
function readForm(box){
  var people = {};
  Array.prototype.forEach.call(box.querySelectorAll('.gcsa-row'), function(tr){
    var e = tr.getAttribute('data-email'), g = function(k){ return tr.querySelector('[data-k="' + k + '"]'); };
    if (tr.getAttribute('data-role') === '1') { people[e] = { on: !!g('on').checked, emerg: !!g('emerg').checked, qOff: true, hasPhone: true, name: s((tr.querySelector('b') || {}).textContent) }; return; }
    var pin = g('phone'), ph = pin ? d10(pin.value) : '';
    if (pin && ph === d10(pin.getAttribute('data-orig'))) ph = '';   /* the same as their CRM record: keep following the record */
    var p = { on: !!g('on').checked, phone: ph, hasPhone: !!(pin && d10(pin.value).length === 10) || tr.getAttribute('data-role') === '1', cust: g('cust').value, qOff: !g('qOn').checked, qFrom: +g('qFrom').value, qTo: +g('qTo').value,
      name: s((tr.querySelector('b') || {}).textContent) };
    COLS.forEach(function(c){ if (c.id !== 'cust') { var el = g(c.id); p[c.id] = !!(el && el.checked); } });
    people[e] = p;
  });
  return { people: people };
}
function render(box){
  if (!isAdmin()) { box.innerHTML = '<div style="color:#64748b">Only an admin can change the text alerts.</div>'; return; }
  box.innerHTML = '<div style="color:#64748b">Loading…</div>';
  j(FN).then(function(o){
    if (!o || !o.ok) { box.innerHTML = '<div style="color:#b91c1c">' + esc((o && o.error) || 'Could not load.') + '</div>'; return; }
    DATA = o;
    var set = o.settings || { people: {} }, staff = arr(o.staff);
    var head = '<tr style="background:#f1f5f9;font-size:11px;color:#334155"><th style="' + TD + '">On</th><th style="' + TD + ';text-align:left">Person</th><th style="' + TD + '">Cell</th>'
      + COLS.map(function(c){ return '<th style="' + TD + ';max-width:84px" title="' + esc(c.h) + '">' + esc(c.t) + '</th>'; }).join('') + '<th style="' + TD + '">Quiet hours (Central)</th></tr>';
    box.innerHTML = '<div class="gcsa" style="font:13px Inter,sans-serif;color:#0f172a">'
      + '<div style="background:' + (o.ready ? '#f0fdf4' : '#fff7ed') + ';border:1px solid ' + (o.ready ? '#bbf7d0' : '#fed7aa') + ';border-radius:10px;padding:10px;margin-bottom:10px;line-height:1.5">'
      + (o.ready ? '✅ Alerts are texted from the GrayCo number <b>' + esc(o.from) + '</b>.' : '⚠ Texting is not set up yet (Netlify TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM) — nothing is texted until it is.')
      + (o.paused ? '<br>⏸ Data-entry mode is on — no alert texts go out.' : '')
      + '<br><b>💲 Cost:</b> each alert text costs about <b>1¢</b> (Twilio). Bursts are combined: at most 1 text a minute per person per conversation ("+3 more").'
      + '<br><b>Reply from your phone:</b> answer an alert within 30 minutes and your text goes to that customer from the GrayCo number (signed with your first name) and shows on Job Messages. A staff phone never becomes a lead. Texting STOP stops your alerts.</div>'
      + '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid #e2e8f0;border-radius:10px;max-width:100%"><table style="border-collapse:collapse;width:100%;min-width:980px;font-size:13px"><thead>' + head + '</thead><tbody>'
      + (staff.length ? staff.map(function(x){ return row(x, set.people[x.email]); }).join('') : '<tr><td colspan="12" style="padding:12px;color:#64748b">No active staff with a @grayco-cs.com e-mail yet (⚙ Admin → Employees).</td></tr>')
      + arr(o.roles).map(function(r){ return roleRow(r, set.people[r.key]); }).join('')
      + '</tbody></table></div>'
      + (set.defaults ? '<div style="font-size:12px;color:#075985;margin-top:6px">These are the starting settings (Nick and Wesley: emergencies + every new lead; the mitigation manager: emergencies). Change anything and press Save.</div>' : '')
      + '<div style="font-size:12px;color:#475569;margin-top:8px">Customer texts: <b>Their jobs</b> = texts on jobs they manage or texts routed to them; <b>All</b> = every customer text. Emergencies ignore quiet hours. Admin / system alerts that come in during quiet hours wait until the morning.</div>'
      + '<div style="margin-top:10px"><button type="button" data-g="save" style="border:0;border-radius:8px;padding:9px 16px;background:#16a34a;color:#fff;font-weight:800;cursor:pointer">Save</button></div></div>';
    box.onchange = function(ev){ var tr = ev.target && ev.target.closest && ev.target.closest('.gcsa-row'); if (tr && ev.target.getAttribute('data-k') === 'on') tr.style.background = ev.target.checked ? '#fff' : '#f8fafc'; };
    box.onclick = function(ev){
      if (!(ev.target && ev.target.getAttribute && ev.target.getAttribute('data-g') === 'save')) return;
      var v = readForm(box), bad = Object.keys(v.people).filter(function(e){ var p = v.people[e]; return p.on && !p.hasPhone; });
      Object.keys(v.people).forEach(function(e){ delete v.people[e].hasPhone; });
      if (bad.length) { toast('Add a 10-digit cell for: ' + bad.join(', '), true); return; }
      ev.target.disabled = true;
      j(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: v }) }).then(function(r){
        ev.target.disabled = false;
        if (r && r.ok) { if (DATA) DATA.settings = r.settings; toast('✅ Text alerts saved.'); } else toast('Not saved: ' + s(r && r.error), true);
      });
    };
  });
}
function count(){ if (!DATA || !DATA.settings) return ''; var n = 0, ppl = DATA.settings.people || {}; Object.keys(ppl).forEach(function(e){ if (ppl[e].on) n++; }); return n ? n + ' on' : 'off'; }
function addSection(){
  if (typeof W._gcAdmAddSection !== 'function') return false;
  W._gcAdmAddSection({ id: 'smsalerts', after: 'texts', ic: '📱', t: 'Text alerts to cell phones', d: 'Staff cell phones get a text for new leads, customer texts, missed calls, emergencies, approvals — per person, per type',
    render: render, count: count });
  return true;
}
if (!addSection()) { var tries = 0, iv = RI.call(W, function(){ if (addSection() || ++tries > 120) clearInterval(iv); }, 500); }
W._gcSmsAlerts = { render: render, readForm: readForm, cols: COLS };
try { console.log('[GC] 📱 Text alerts to cell phones: ⚙ Admin → 📱 Text alerts (patch SMSALERT) — _gcSmsAlerts'); } catch (e) {}
})();
