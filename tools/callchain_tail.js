/* __GC_PATCH_CALLCHAIN__ — 📞 CALL ORDER (owner 10/28: "i want twilio to call in order office, nick owner 1, wesley owner 2,
   general manager (we dont have one yet), lead pm" · "be able to setup twilio who gets calls in what order in admin" ·
   "also add pm 2 pm 3 and so on for calls in order").
     • Admin → ⚙ Admin settings → 📞 Call order (right by 💬 Text auto-answers, admins only): the GrayCo Twilio number rings
       these one at a time, top to bottom. Each line: on / off, a name (editable), and who — the office line, a person
       from the people list (their phone on file), the Senior PM (whoever it is at call time) or a typed number.
       ↑ ↓ or drag to reorder, ✕ to remove, "+ Add person" for PM 2, PM 3 …; ring seconds per line; the card shows how
       long a caller may wait before the text goes out. Empty lines (no General Manager yet) are skipped.
     • Saved through texts.js ?callchain=1 (admin-checked) into the service-only gc_lead_inbox_kv "gc_call_chain";
       missed-call.js reads it on every call (netlify/functions/_lib/callchain.js). Nothing saved → Netlify TWILIO_RING_TO.
     • patch CALLSCREEN (owner 10/28: "these leads need to be qualified … everything else we do not accept on this phone
       number"): 🛡 Screening on / off, the menu greeting (editable), the "what work do you need?" question on / off,
       blocked numbers, and the last 50 calls with what happened (pressed 1 / 2 / 3, no input, answered by, missed).
     • patch EMERGCALL (owner 10/28: "for emergency water or fire tree damages make sure you make a phone call to who is
       on call / order of call after 15 min of no answering a text"): 🚨 "Emergency escalation calls after [15] min" on / off.
   Phone numbers show to admins only, never to customers. */
(function(){
if (window.__GC_PATCH_CALLCHAIN__) return; window.__GC_PATCH_CALLCHAIN__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
var FN = '/.netlify/functions/texts?callchain=1';
var KINDS = [['company', 'Office line'], ['person', 'Person'], ['senior', 'Senior PM (Lead PM)'], ['phone', 'Phone number']];
var ST8 = { cfg: null, people: [], senior: null, office: '', saved: false, preview: null };
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function arr(v){ return Array.isArray(v) ? v : []; }
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
    D.body.appendChild(t); later(function(){ try { t.remove(); } catch (e) {} }, 4500); } catch (e) {}
}
function waitText(sec){ var m = Math.floor(sec / 60), r = sec % 60; return (m ? m + ' min' + (r ? ' ' : '') : '') + (r || !m ? r + ' s' : ''); }
function personOf(id){ return ST8.people.filter(function(p){ return p.id === id; })[0] || null; }
/* what one line rings right now (null = skipped) — the server decides at call time; this is the card's own estimate */
function lineNumber(x){
  if (!x.on) return null;
  if (x.kind === 'company') return d10(ST8.office) || null;
  if (x.kind === 'phone') return d10(x.phone).length === 10 ? d10(x.phone) : null;
  if (x.kind === 'senior') return ST8.senior && d10(ST8.senior.phone).length === 10 ? d10(ST8.senior.phone) : null;
  var p = personOf(x.person); return p ? d10(p.phone) : null;
}
function whoText(x){
  if (x.kind === 'company') return ST8.office ? '☎ ' + esc(ST8.office) : '';
  if (x.kind === 'senior') return ST8.senior ? esc(ST8.senior.name) + (ST8.senior.phone ? ' · ' + esc(ST8.senior.phone) : ' · <span style="color:#b45309">no phone on file</span>') : '<span style="color:#b45309">no Senior PM set (👥 Team roles &amp; Senior PM)</span>';
  if (x.kind === 'person') { var p = personOf(x.person); return p ? esc(p.phone) : (x.person ? '<span style="color:#b45309">not in the people list / no phone</span>' : '<span style="color:#64748b">nobody yet — skipped</span>'); }
  return '';
}
function rowHtml(x, i, n){
  var who = x.kind === 'person' ? '<select data-f="person" style="border:1px solid #cbd5e1;border-radius:6px;padding:5px;max-width:220px"><option value="">— Nobody yet (skipped) —</option>'
      + ST8.people.map(function(p){ return '<option value="' + esc(p.id) + '"' + (p.id === x.person ? ' selected' : '') + '>' + esc(p.name) + (p.role ? ' · ' + esc(p.role) : '') + '</option>'; }).join('') + '</select>'
    : x.kind === 'phone' ? '<input data-f="phone" placeholder="(901) 555-0100" value="' + esc(x.phone ? tidy(x.phone) : '') + '" style="width:140px;border:1px solid #cbd5e1;border-radius:6px;padding:5px">' : '';
  var rings = !!lineNumber(x);
  return '<div class="gccc-row" draggable="true" data-i="' + i + '" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;border:1px solid #e2e8f0;border-radius:10px;padding:8px;margin:6px 0;background:' + (rings ? '#fff' : '#f8fafc') + '">'
    + '<span title="Drag to reorder" style="cursor:grab;color:#94a3b8;font-size:16px">⠿</span>'
    + '<b style="min-width:20px;color:#0e7490">' + (i + 1) + '.</b>'
    + '<input type="checkbox" data-f="on"' + (x.on ? ' checked' : '') + ' title="On / off">'
    + '<input data-f="label" value="' + esc(x.label) + '" maxlength="40" style="font-weight:700;width:140px;border:1px solid #e2e8f0;border-radius:6px;padding:5px">'
    + '<select data-f="kind" style="border:1px solid #cbd5e1;border-radius:6px;padding:5px">' + KINDS.map(function(k){ return '<option value="' + k[0] + '"' + (x.kind === k[0] ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select>'
    + who + '<span style="font-size:12px;color:#334155">' + whoText(x) + '</span>'
    + (rings ? '' : '<span style="font-size:11px;background:#f1f5f9;color:#475569;border-radius:999px;padding:2px 8px">skipped</span>')
    + '<span style="margin-left:auto;display:inline-flex;gap:4px">'
    + '<button type="button" data-g="up" ' + (i ? '' : 'disabled ') + 'style="border:0;background:#e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer">↑</button>'
    + '<button type="button" data-g="down" ' + (i < n - 1 ? '' : 'disabled ') + 'style="border:0;background:#e2e8f0;border-radius:6px;padding:4px 8px;cursor:pointer">↓</button>'
    + '<button type="button" data-g="del" title="Remove" style="border:0;background:#fee2e2;color:#991b1b;border-radius:6px;padding:4px 8px;cursor:pointer">✕</button></span></div>';
}
function readRows(box){
  var c = ST8.cfg;
  c.screen = c.screen || {};
  var q = function(g){ return box.querySelector('[data-g="' + g + '"]'); };
  if (q('emOn')) { c.emerg = { on: !!q('emOn').checked, minutes: Math.max(5, Math.min(120, parseInt(q('emMin').value, 10) || 15)) }; }
  if (q('scrOn')) { c.screen.on = !!q('scrOn').checked; c.screen.askWhat = !!q('askWhat').checked; c.screen.whisper = !!q('whisper').checked;
    c.screen.greeting = s(q('greeting').value); c.screen.blocked = s(q('blocked').value).split(/[\n,;]+/).map(d10).filter(function(d){ return d.length === 10; }); }
  c.on = !!(box.querySelector('[data-g="on"]') || {}).checked;
  c.ringSeconds = Math.max(8, Math.min(60, parseInt((box.querySelector('[data-g="secs"]') || {}).value, 10) || 15));
  Array.prototype.forEach.call(box.querySelectorAll('.gccc-row'), function(el){
    var x = c.slots[+el.getAttribute('data-i')]; if (!x) return;
    x.on = !!el.querySelector('[data-f="on"]').checked; x.label = s(el.querySelector('[data-f="label"]').value) || x.label;
    x.kind = el.querySelector('[data-f="kind"]').value;
    var pe = el.querySelector('[data-f="person"]'), ph = el.querySelector('[data-f="phone"]');
    if (pe) x.person = pe.value; if (ph) x.phone = d10(ph.value);
  });
  return c;
}
function summary(){
  var c = ST8.cfg, seen = {}, n = 0;
  c.slots.forEach(function(x){ var d = lineNumber(x); if (d && !seen[d]) { seen[d] = 1; n++; } });
  var sec = n * c.ringSeconds;
  return n ? n + ' number' + (n > 1 ? 's' : '') + ' ring, ' + c.ringSeconds + ' s each — <b>a caller may wait up to ' + waitText(sec) + ' before the text goes out</b> (plus the short hold message).' : '<b style="color:#b91c1c">Nobody would ring</b> — every call becomes a missed call.';
}
var OUTC = [[/robocall/, '#64748b', 'no input'], [/pressed 3|sales/, '#991b1b', 'sales / other'], [/blocked|STIR/, '#991b1b', 'blocked'], [/answered/, '#166534', 'answered'], [/missed/, '#b45309', 'missed'], [/ringing|new work|current customer|menu/, '#0e7490', 'in progress']];
function outcomeTag(o){ var m = OUTC.filter(function(x){ return x[0].test(o); })[0]; return '<span style="font-size:11px;border-radius:999px;padding:1px 7px;background:#f1f5f9;color:' + (m ? m[1] : '#334155') + '">' + esc(o || '—') + '</span>'; }
function screenHtml(){
  var sc = ST8.cfg.screen || {}, log = arr(ST8.log);
  var n3 = log.filter(function(x){ return /pressed 3|sales|blocked|STIR/.test(x.outcome); }).length, n0 = log.filter(function(x){ return /robocall/.test(x.outcome); }).length;
  return '<div style="margin:12px 0;border:1px solid #e2e8f0;border-radius:10px;padding:10px;background:#f8fafc"><div style="font-weight:800">🛡 Screening — before anyone\'s phone rings</div>'
    + '<div style="font-size:12px;color:#475569;margin:4px 0 8px">Callers hear the menu first. <b>1</b> (construction / repair work) and <b>2</b> (current customer) ring the list below; <b>3</b> (anything else, sales) hears "we don\'t take sales calls … e-mail office@grayco-cs.com" — no ring, no text, no lead. Nothing pressed twice → goodbye (likely a robocall). Blocked numbers and callers whose caller ID fails the carrier check (STIR/SHAKEN) are treated like 3. Only 1 and 2 get the missed-call text and a lead.</div>'
    + '<label><input type="checkbox" data-g="scrOn"' + (sc.on !== false ? ' checked' : '') + '> Screen calls with the menu</label>'
    + '<div style="font-size:11px;color:#64748b;margin-top:6px">What callers hear (say which key does what)</div><textarea data-g="greeting" rows="3" maxlength="600" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:6px;padding:6px;font:13px Inter,sans-serif">' + esc(sc.greeting || '') + '</textarea>'
    + '<label style="display:block;margin-top:6px"><input type="checkbox" data-g="askWhat"' + (sc.askWhat !== false ? ' checked' : '') + '> After 1, ask "In a few words, what work do you need?" (goes on the lead and is said to whoever answers)</label>'
    + '<label style="display:block;margin-top:4px"><input type="checkbox" data-g="whisper"' + (sc.whisper !== false ? ' checked' : '') + '> Whoever answers hears "GrayCo call: … press 1 to accept" first (a voicemail cannot take the call)</label>'
    + '<div style="font-size:11px;color:#64748b;margin-top:6px">Blocked numbers (one per line)</div><textarea data-g="blocked" rows="2" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:6px;padding:6px;font:13px Inter,sans-serif" placeholder="(901) 555-0100">' + esc(arr(sc.blocked).map(tidy).join('\n')) + '</textarea>'
    + '<div style="margin-top:10px;font-weight:700">Last calls' + (log.length ? ' <span style="font-weight:400;color:#475569;font-size:12px">— of the last ' + log.length + ': ' + n3 + ' sales / blocked, ' + n0 + ' no input (robocalls)</span>' : '') + '</div>'
    + (log.length ? '<div style="max-height:260px;overflow:auto;margin-top:4px"><table style="width:100%;border-collapse:collapse;font-size:12px"><tr style="text-align:left;color:#64748b"><th style="padding:3px">When</th><th style="padding:3px">From</th><th style="padding:3px">Menu</th><th style="padding:3px">What happened</th></tr>'
      + log.map(function(x){ var d = new Date(x.at); return '<tr style="border-top:1px solid #e2e8f0"><td style="padding:3px;white-space:nowrap">' + esc(isNaN(d) ? x.at : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + '</td><td style="padding:3px;white-space:nowrap">' + esc(x.from) + '</td><td style="padding:3px">' + esc(x.choice === 'direct' ? '—' : x.choice ? 'pressed ' + x.choice : 'none') + '</td><td style="padding:3px">' + outcomeTag(x.outcome) + (x.by ? ' ' + esc(x.by) : '') + (x.what ? '<div style="color:#475569">“' + esc(x.what) + '”</div>' : '') + '</td></tr>'; }).join('') + '</table></div>'
      : '<div style="font-size:12px;color:#64748b;margin-top:4px">No calls yet.</div>') + '</div>';
}
function draw(box){
  var c = ST8.cfg;
  box.innerHTML = '<div style="font:13px Inter,sans-serif;color:#0f172a">'
    + '<div style="background:' + (ST8.saved && c.on ? '#f0fdf4' : '#fff7ed') + ';border:1px solid ' + (ST8.saved && c.on ? '#bbf7d0' : '#fed7aa') + ';border-radius:10px;padding:10px;margin-bottom:10px">'
    + (ST8.saved ? (c.on ? '✅ Calls to the GrayCo number ' + (c.screen && c.screen.on !== false ? 'are screened, then ' : '') + 'ring this list, one at a time.' : '⏸ The call order is off — nobody is rung; callers who press 1 or 2 get the missed-call text.')
      : '⚠ Not saved yet — calls ' + (ST8.ringToEnv ? 'are screened, then ring ' + esc(ST8.ringToEnv) + ' only (Netlify TWILIO_RING_TO)' : 'are screened, then ring this default list') + '. Check it and press <b>Save</b>.')
    + (ST8.ready ? '' : '<br>⚠ Twilio is not set up yet (Netlify TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM).')
    + '<br><span style="color:#475569">Twilio → Phone Numbers → the number → Voice "A call comes in": Webhook <code>' + esc(ST8.voiceWebhook || '') + '</code> (HTTP POST). Nobody answers → the caller gets one text, a lead / call-back to-do is made.</span></div>'
    + screenHtml()
    + '<div style="margin:12px 0;border:1px solid #fecaca;border-radius:10px;padding:10px;background:#fef2f2"><div style="font-weight:800">🚨 Emergency escalation calls</div>'
    + '<label style="display:block;margin-top:4px"><input type="checkbox" data-g="emOn"' + (!c.emerg || c.emerg.on !== false ? ' checked' : '') + '> Phone people about an emergency lead (water, fire, a tree on the house, storm damage) nobody has answered after <input data-g="emMin" type="number" min="5" max="120" value="' + esc((c.emerg && c.emerg.minutes) || 15) + '" style="width:52px"> min</label>'
    + '<div style="font-size:12px;color:#475569;margin-top:4px">Calls this week\'s on-call person first, then the list below, one at a time (25 s each): "GrayCo emergency … press 1 to be connected to the customer, press 2 to accept and call them yourself." The first key stops it. Nobody → the whole list once more 10 minutes later, then the admins are e-mailed. It stops as soon as someone has it: ✅ Accept on the on-call page, the lead assigned / contacted / its stage moved, a text to the customer, or a reply to the alert text. Any hour; never while data-entry mode is on.</div></div>'
    + '<div style="font-weight:800;margin-top:6px">📞 Who rings, in order</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center"><label><input type="checkbox" data-g="on"' + (c.on ? ' checked' : '') + '> Ring in this order</label>'
    + '<label>Ring each one <input data-g="secs" type="number" min="8" max="60" value="' + esc(c.ringSeconds) + '" style="width:56px"> seconds</label></div>'
    + '<div data-g="sum" style="margin:8px 0;color:#334155">' + summary() + '</div>'
    + '<div data-g="list">' + c.slots.map(function(x, i){ return rowHtml(x, i, c.slots.length); }).join('') + '</div>'
    + '<button type="button" data-g="add" style="border:0;border-radius:6px;padding:6px 12px;background:#e2e8f0;cursor:pointer;margin-top:4px">＋ Add person</button>'
    + '<div style="font-size:12px;color:#475569;margin-top:8px;line-height:1.5">Skipped at call time: a line that is off or empty, the caller\'s own number, and the office line when the call was forwarded from it (no loop). Cell phones: keep the ring time shorter than your voicemail picks up (about 20–25 s), or voicemail "answers" and the list stops there.</div>'
    + '<div style="display:flex;gap:8px;margin-top:10px"><button type="button" data-g="save" style="border:0;border-radius:8px;padding:9px 16px;background:#16a34a;color:#fff;font-weight:800;cursor:pointer">Save</button></div>'
    + (ST8.preview ? '<div style="margin-top:10px;font-size:12px;color:#334155"><b>Rings now (saved):</b> ' + (arr(ST8.preview.list).map(function(x, i){ return (i + 1) + '. ' + esc(x.label) + (x.name ? ' — ' + esc(x.name) : '') + ' ' + esc(x.phone); }).join(' · ') || 'nobody')
      + (arr(ST8.preview.skipped).length ? '<br><b>Skipped:</b> ' + arr(ST8.preview.skipped).map(function(x){ return esc(x.label) + ' (' + esc(x.why) + ')'; }).join(' · ') : '') + '</div>' : '')
    + '</div>';
}
function wire(box){
  var drag = -1;
  box.onclick = function(ev){
    var g = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-g'); if (!g) return;
    var row = ev.target.closest('.gccc-row'), i = row ? +row.getAttribute('data-i') : -1, sl = readRows(box).slots;
    if (g === 'up' && i > 0) { sl.splice(i - 1, 0, sl.splice(i, 1)[0]); draw(box); }
    else if (g === 'down' && i >= 0 && i < sl.length - 1) { sl.splice(i + 1, 0, sl.splice(i, 1)[0]); draw(box); }
    else if (g === 'del' && i >= 0) { if (sl.length < 2) { toast('Keep at least one line (or turn the call order off).', true); return; } sl.splice(i, 1); draw(box); }
    else if (g === 'add') { var n = sl.filter(function(x){ return /^PM \d+$/.test(x.label); }).length + 2; sl.push({ id: 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), label: 'PM ' + n, on: true, kind: 'person', person: '', phone: '' }); draw(box); }
    else if (g === 'save') {
      var v = readRows(box); ev.target.disabled = true;
      j(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: v }) }).then(function(r){
        ev.target.disabled = false;
        if (r && r.ok) { take(r); draw(box); toast('✅ Call order saved.'); } else toast('Not saved: ' + s(r && r.error), true);
      });
    }
  };
  box.onchange = function(ev){ var g0 = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-g'); if (ev.target && ev.target.closest && (ev.target.closest('.gccc-row') || g0 === 'on' || g0 === 'secs' || g0 === 'scrOn' || g0 === 'askWhat' || g0 === 'whisper')) { readRows(box); draw(box); } };
  box.ondragstart = function(ev){ var r = ev.target.closest && ev.target.closest('.gccc-row'); if (!r) return; drag = +r.getAttribute('data-i'); try { ev.dataTransfer.setData('text/plain', String(drag)); ev.dataTransfer.effectAllowed = 'move'; } catch (e) {} };
  box.ondragover = function(ev){ if (drag >= 0 && ev.target.closest && ev.target.closest('.gccc-row')) ev.preventDefault(); };
  box.ondrop = function(ev){ var r = ev.target.closest && ev.target.closest('.gccc-row'); if (!r || drag < 0) return; ev.preventDefault(); var to = +r.getAttribute('data-i'), sl = readRows(box).slots; if (to !== drag) { sl.splice(to, 0, sl.splice(drag, 1)[0]); draw(box); } drag = -1; };
}
function take(o){ ST8.cfg = o.settings; ST8.people = arr(o.people); ST8.senior = o.senior || null; ST8.office = s(o.office); ST8.saved = !!o.saved; ST8.preview = o.saved ? o.preview : null; ST8.ringToEnv = s(o.ringToEnv); ST8.ready = !!o.ready; ST8.voiceWebhook = s(o.voiceWebhook); ST8.log = arr(o.log); }
function renderAdmin(box){
  if (!isAdmin()) { box.innerHTML = '<div style="color:#64748b">Only an admin can change who the GrayCo number rings.</div>'; return; }
  box.innerHTML = '<div style="color:#64748b">Loading…</div>';
  j(FN).then(function(o){
    if (!o || !o.ok) { box.innerHTML = '<div style="color:#b91c1c">' + esc((o && o.error) || 'Could not load.') + '</div>'; return; }
    take(o); draw(box); wire(box);
  });
}
function addSection(){
  if (typeof W._gcAdmAddSection !== 'function') return false;
  W._gcAdmAddSection({ id: 'callorder', after: 'texts', ic: '📞', t: 'Call order', d: 'Screen callers (1 work · 2 customer · 3 sales), then who the GrayCo number rings, one at a time · blocked numbers · call log',
    render: renderAdmin, count: function(){ return ST8.cfg ? (ST8.saved ? (ST8.cfg.on ? ST8.cfg.slots.filter(function(x){ return x.on; }).length + ' on' : 'off') : 'not saved') : ''; } });
  return true;
}
if (!addSection()) { var tries = 0, iv = RI.call(W, function(){ if (addSection() || ++tries > 120) clearInterval(iv); }, 500); }
W._gcCallOrder = { render: renderAdmin, _state: ST8, _summary: summary };
try { console.log('[GC] 📞 Call order: Admin settings → 📞 Call order (patch CALLCHAIN) — _gcCallOrder'); } catch (e) {}
})();
