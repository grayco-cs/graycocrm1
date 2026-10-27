/* __GC_PATCH_TXTTPL__ — 💬 TEXT TEMPLATES (owner: "admin should be able to add more sample messages for twilio").
     • Admin → ⚙ Admin settings → 💬 Text templates (right under 💬 Text auto-answers): admins add, edit, delete and reorder
       templates (name · category · body with [Bracket] fill-ins), see a character / segment counter, get a warning when a body
       does not start with "GrayCo Construction Services:" or lacks "Reply STOP to opt out", and copy any body (or all of them,
       numbered "Sample message #1:") for Twilio's sample-message boxes. Stored in gc_kv "gc_sms_templates" (cached on this
       computer); the 5 defaults are seeded once, when the key has never been written.
     • Job Messages "📱 Text them" bar: a "Templates ▾" picker. Picking inserts the body with the known brackets filled from the job
       (customer name, address, PM, next schedule date, invoice number / amount when an invoice is in context); unknown ones stay.
       Marketing templates are admin-only. It never changes who may be texted — sending is untouched (texts.js ?send=1).
   API: window._gcTextTemplates = { list(), fill(body, ctx), count(body), setContext({pid, invoice:{num, amount}}), copyAll(), reload() } */
(function(){
'use strict';
if (window.__GC_PATCH_TXTTPL__) return; window.__GC_PATCH_TXTTPL__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
var KEY = 'gc_sms_templates';   /* the gc_kv key */
var LSK = 'tpl_sms_cache_v1';   /* this computer's copy: NOT a gc_ key, so the CRM's own list-merge sync never rewrites it (it would undo reorders and deletes) */
var CATS = ['Job update', 'Scheduling', 'Invoice', 'Missed call', 'Subcontractor', 'Marketing'];
var PREFIX = 'GrayCo Construction Services:';
var STOP = 'Reply STOP to opt out';
var DEFAULTS = [
  { id: 'tpl-default-1', name: 'Crew scheduled', cat: 'Scheduling', body: 'GrayCo Construction Services: Hi [Customer name], your crew is scheduled for [Day, Date] at [Time] at [Job address]. Reply Y to confirm or call (901) 585-0944. Reply STOP to opt out.' },
  { id: 'tpl-default-2', name: 'Missed call', cat: 'Missed call', body: 'GrayCo Construction Services: Sorry we missed your call! How can we help? Reply here or call (901) 585-0944. Reply STOP to opt out, HELP for help.' },
  { id: 'tpl-default-3', name: 'Invoice ready', cat: 'Invoice', body: 'GrayCo Construction Services: Your invoice #[Invoice number] for $[Amount] is ready. View and pay in your customer portal: crm.grayco-cs.com/portal.html. Questions? Call (901) 585-0944. Reply STOP to opt out.' },
  { id: 'tpl-default-4', name: 'Subcontractor scheduled', cat: 'Subcontractor', body: 'GrayCo Construction Services: [Subcontractor name], you\'re scheduled for [Trade] at [Job address] on [Date]. Reply Y to confirm. Reply STOP to opt out.' },
  { id: 'tpl-default-5', name: 'Fall roof check special', cat: 'Marketing', body: 'GrayCo Construction Services: Fall roof check special for past customers: $100 off any project over $1,000 through [Date]. Call (901) 585-0944 to book. Reply STOP to opt out.' }
];
var CTX = { pid: '', invoice: null };
var TPL = null, LOADED = false, WORK = null, DIRTY = false;

function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function signedIn(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.email()); } catch (e) { return false; } }
function crm(){ return W._crm || {}; }
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function uid(){ return 'tpl-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function toast(msg, bad){
  try { var t = D.createElement('div'); t.setAttribute('data-gc-keep', '1'); t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:100260;background:' + (bad ? '#7f1d1d' : '#14532d') + ';color:#fff;padding:10px 16px;border-radius:10px;font:600 13px Inter,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3)';
    D.body.appendChild(t); later(function(){ try { t.remove(); } catch (e) {} }, 3500); } catch (e) {}
}

/* ── the cloud (gc_kv) ── */
function sbBase(){ return s(lsGet('grayco_sb_url') || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''); }
function sbKey(){ return s(lsGet('grayco_sb_key')); }
function kvGet(key){
  var k = sbKey(); if (!k) return Promise.resolve(undefined);
  return W.fetch(sbBase() + '/rest/v1/gc_kv?key=eq.' + encodeURIComponent(key) + '&select=value', { headers: { apikey: k }, cache: 'no-store' })
    .then(function(r){ return r && r.ok ? r.json() : undefined; }).then(function(rows){ if (!Array.isArray(rows)) return undefined; var v = rows[0] ? rows[0].value : null; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; }, function(){ return undefined; });
}
function kvPut(key, value){
  var k = sbKey(); if (!k) return Promise.resolve(false);
  /* an admin pressing Save is a manual save: the CRM's overnight quiet-hours / backoff hold lets it through */
  var prev = W.__GC_MANUAL_SAVE__; try { W.__GC_MANUAL_SAVE__ = true; } catch (e) {}
  var done = function(v){ later(function(){ try { W.__GC_MANUAL_SAVE__ = prev; } catch (e) {} }, 1500); return v; };
  return W.fetch(sbBase() + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { apikey: k, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: key, value: value, updated_at: new Date().toISOString() }) }).then(function(r){ return done(!!(r && r.ok)); }, function(){ return done(false); });
}
function clean(v){
  return arr(v).filter(function(x){ return x && typeof x === 'object' && s(x.body); }).map(function(x){
    return { id: s(x.id) || uid(), name: s(x.name) || 'Untitled', cat: CATS.indexOf(x.cat) >= 0 ? x.cat : CATS[0], body: String(x.body) };
  });
}
/* stored as { items: [...] }, not a bare list: the CRM's sync treats a bare list of {id} rows as a record table and union-merges it
   with the cloud copy (nothing is ever removed, order is kept from the cloud), which would undo deletes and reordering */
function pack(l){ return { v: 1, items: l, at: new Date().toISOString() }; }
function cached(){ try { var v = JSON.parse(lsGet(LSK) || 'null'); return Array.isArray(v) ? clean(v) : null; } catch (e) { return null; } }
/* load: the cloud wins; null (never written) -> seed the 5 defaults once (an admin writes them; fixed ids so a race is harmless) */
function load(){
  return kvGet(KEY).then(function(v){
    if (v && !Array.isArray(v) && Array.isArray(v.items)) v = v.items;
    if (Array.isArray(v)) { TPL = clean(v); lsSet(LSK, JSON.stringify(TPL)); LOADED = true; }
    else if (v === null) {
      TPL = clone(DEFAULTS); LOADED = true; lsSet(LSK, JSON.stringify(TPL));
      if (isAdmin()) kvPut(KEY, pack(TPL));
    } else if (!TPL) { TPL = cached() || clone(DEFAULTS); }
    return TPL;
  });
}
function list(){ if (!TPL) TPL = cached() || clone(DEFAULTS); return TPL; }

/* ── counter: GSM-7 (160 / 153 per part) or UCS-2 (70 / 67) ── */
var GSM = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
var GSMX = '^{}\\[]~|€';
function count(t){
  t = String(t == null ? '' : t); var n = 0, ucs = false, i, c;
  for (i = 0; i < t.length; i++) { c = t.charAt(i); if (GSM.indexOf(c) >= 0) n += 1; else if (GSMX.indexOf(c) >= 0) n += 2; else { ucs = true; break; } }
  if (ucs) { n = t.length; return { chars: n, enc: 'UCS-2', segments: n === 0 ? 0 : (n <= 70 ? 1 : Math.ceil(n / 67)), per: 70 }; }
  return { chars: n, enc: 'GSM-7', segments: n === 0 ? 0 : (n <= 160 ? 1 : Math.ceil(n / 153)), per: 160 };
}
function warnings(body){
  var w = [], b = s(body);
  if (b.indexOf(PREFIX) !== 0) w.push('Does not start with "' + PREFIX + '"');
  if (b.toLowerCase().indexOf(STOP.toLowerCase()) < 0) w.push('Missing "' + STOP + '"');
  return w;
}

/* ── fill-ins from the job / customer ── */
var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function todayIso(){ var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function nextSched(pid){
  var t = todayIso(), best = null;
  arr(crm().schedule).forEach(function(a){ if (a && a.pid === pid && /^\d{4}-\d{2}-\d{2}/.test(s(a.date)) && s(a.date).slice(0, 10) >= t && !a.deleted && (!best || s(a.date) < s(best.date))) best = a; });
  return best;
}
function niceDate(iso){ var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(iso)); if (!m) return ''; var d = new Date(+m[1], +m[2] - 1, +m[3]); return MON[d.getMonth()] + ' ' + d.getDate(); }
function niceDay(iso){ var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(iso)); if (!m) return ''; var d = new Date(+m[1], +m[2] - 1, +m[3]); return DAY[d.getDay()] + ', ' + MON[d.getMonth()] + ' ' + d.getDate(); }
function niceTime(t){ var m = /^(\d{1,2}):(\d{2})/.exec(s(t)); if (!m) return s(t); var h = +m[1], ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + m[2] + ' ' + ap; }
function moneyStr(v){ var n = parseFloat(String(v == null ? '' : v).replace(/[$,]/g, '')); return isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : s(v); }
function project(pid){ return arr(crm().projects).filter(function(p){ return p && p.id === pid; })[0] || null; }
function fill(body, ctx, cat){
  ctx = ctx || CTX; var p = project(ctx.pid) || {}, inv = ctx.invoice || null;
  var useSched = cat !== 'Marketing' && cat !== 'Invoice' && cat !== 'Missed call';
  var sc = useSched && ctx.pid ? nextSched(ctx.pid) : null;
  var V = {
    'customer name': s(p.client || p.clientName || p.customerName || p.customer),
    'job address': s(p.address || p.jobAddress || p.siteAddress),
    'pm': s(p.pm || p.projectManager), 'pm name': s(p.pm || p.projectManager),
    'date': sc ? niceDate(sc.date) : '', 'day, date': sc ? niceDay(sc.date) : '', 'time': sc ? niceTime(sc.time || sc.startTime || sc.start) : '',
    'invoice number': inv ? s(inv.num || inv.number || inv.invNum) : '', 'amount': inv && (inv.amount != null || inv.total != null || inv.balance != null) ? moneyStr(inv.amount != null ? inv.amount : (inv.balance != null ? inv.balance : inv.total)) : ''
  };
  return String(body).replace(/\[([^\[\]]+)\]/g, function(all, k){ var v = V[s(k).toLowerCase()]; return v ? v : all; });
}

/* ── copy ── */
function copyText(t){
  var done = function(){ toast('📋 Copied'); return true; };
  try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(done, function(){ return fallbackCopy(t); }); } catch (e) {}
  return Promise.resolve(fallbackCopy(t));
}
function fallbackCopy(t){
  try { var ta = D.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px;top:0'; D.body.appendChild(ta); ta.select(); var ok = D.execCommand('copy'); ta.remove(); if (ok) toast('📋 Copied'); else toast('Could not copy — select the text and copy it.', true); return ok; }
  catch (e) { toast('Could not copy.', true); return false; }
}
function allText(l){ return arr(l).map(function(t, i){ return 'Sample message #' + (i + 1) + ':\n' + t.body; }).join('\n\n'); }

/* ── Admin → 💬 Text templates ── */
var CSS = '.gctt{font:13px Inter,Arial,sans-serif;color:#0f172a}.gctt .tp{border:1px solid #cbd5e1;border-radius:10px;padding:10px;margin:0 0 10px;background:#fff}'
  + '.gctt input,.gctt select,.gctt textarea{box-sizing:border-box;border:1px solid #cbd5e1;border-radius:6px;padding:6px 8px;font:13px Inter,Arial,sans-serif}.gctt textarea{width:100%;min-height:74px;margin-top:6px;resize:vertical}'
  + '.gctt button{border:0;border-radius:6px;padding:6px 10px;cursor:pointer;font:700 12px Inter,Arial,sans-serif;background:#e2e8f0;color:#0f172a}.gctt button.pri{background:#16a34a;color:#fff}.gctt button.tw{background:#0e7490;color:#fff}.gctt button.del{background:#fee2e2;color:#991b1b}'
  + '.gctt .cn{font-size:12px;color:#475569;margin-top:4px}.gctt .wn{font-size:12px;color:#b45309;margin-top:2px}';
function counterHtml(b){ var c = count(b), w = warnings(b);
  return '<div class="cn">' + c.chars + ' characters · ' + c.segments + ' segment' + (c.segments === 1 ? '' : 's') + ' (' + c.enc + ', ' + c.per + ' per segment; [Brackets] count as written)</div>'
    + w.map(function(x){ return '<div class="wn">⚠ ' + esc(x) + '</div>'; }).join(''); }
function renderAdmin(box){
  if (!isAdmin()) { box.innerHTML = '<div style="color:#64748b">Only an admin can change the text templates.</div>'; return; }
  box.innerHTML = '<div style="color:#64748b">Loading…</div>';
  load().then(function(){ WORK = clone(list()); DIRTY = false; paint(box); });
}
function paint(box){
  if (!D.getElementById('gctt-css')) { var st = D.createElement('style'); st.id = 'gctt-css'; st.textContent = CSS; D.head.appendChild(st); }
  box.innerHTML = '<div class="gctt"><div style="color:#475569;margin-bottom:8px">Sample messages for Twilio and for staff to pick in the text box. Use [Brackets] for fill-ins such as [Customer name], [Date], [Time], [Job address], [Invoice number], [Amount], [Subcontractor name]. '
    + 'Start with "' + PREFIX + '" and end with "' + STOP + '."</div>'
    + WORK.map(function(t, i){
      return '<div class="tp" data-i="' + i + '"><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
        + '<b>#' + (i + 1) + '</b><input data-f="name" placeholder="Name" value="' + esc(t.name) + '" style="flex:1 1 160px;min-width:0">'
        + '<select data-f="cat">' + CATS.map(function(c){ return '<option' + (c === t.cat ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select>'
        + '<button type="button" data-a="up" title="Move up">▲</button><button type="button" data-a="down" title="Move down">▼</button></div>'
        + '<textarea data-f="body" placeholder="Message body">' + esc(t.body) + '</textarea><div data-r="cn">' + counterHtml(t.body) + '</div>'
        + '<div style="display:flex;gap:6px;margin-top:6px"><button type="button" class="tw" data-a="copy">📋 Copy for Twilio</button><button type="button" class="del" data-a="del">🗑 Delete</button></div></div>';
    }).join('')
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button type="button" data-a="add">＋ Add template</button><button type="button" class="pri" data-a="save">Save templates</button>'
    + '<button type="button" class="tw" data-a="copyall">📋 Copy all (Sample message #1, #2…)</button><span data-r="state" style="color:#64748b">' + (DIRTY ? 'Unsaved changes' : '') + '</span></div></div>';
  var root = box.querySelector('.gctt');
  function state(t){ var e = root.querySelector('[data-r="state"]'); if (e) e.textContent = t; }
  root.addEventListener('input', function(ev){
    var row = ev.target.closest && ev.target.closest('.tp'); if (!row) return; var t = WORK[+row.getAttribute('data-i')]; if (!t) return;
    var f = ev.target.getAttribute('data-f'); if (f) t[f] = ev.target.value;
    if (f === 'body') row.querySelector('[data-r="cn"]').innerHTML = counterHtml(t.body);
    DIRTY = true; state('Unsaved changes');
  });
  root.addEventListener('change', function(ev){ var row = ev.target.closest && ev.target.closest('.tp'); if (row && ev.target.getAttribute('data-f') === 'cat') { WORK[+row.getAttribute('data-i')].cat = ev.target.value; DIRTY = true; state('Unsaved changes'); } });
  root.addEventListener('click', function(ev){
    var a = ev.target.getAttribute && ev.target.getAttribute('data-a'); if (!a) return;
    var row = ev.target.closest('.tp'), i = row ? +row.getAttribute('data-i') : -1;
    if (a === 'add') { WORK.push({ id: uid(), name: 'New template', cat: CATS[0], body: PREFIX + ' ' + STOP + '.' }); DIRTY = true; paint(box); return; }
    if (a === 'copy' && WORK[i]) { copyText(WORK[i].body); return; }
    if (a === 'copyall') { copyText(allText(WORK)); return; }
    if (a === 'del' && WORK[i]) { var ok = true; try { ok = W.confirm('Delete "' + WORK[i].name + '"?'); } catch (e) {} if (ok) { WORK.splice(i, 1); DIRTY = true; paint(box); } return; }
    if ((a === 'up' && i > 0) || (a === 'down' && i >= 0 && i < WORK.length - 1)) { var j = a === 'up' ? i - 1 : i + 1, x = WORK[i]; WORK[i] = WORK[j]; WORK[j] = x; DIRTY = true; paint(box); return; }
    if (a === 'save') {
      var next = clean(WORK); ev.target.disabled = true;
      kvPut(KEY, pack(next)).then(function(ok){
        ev.target.disabled = false;
        TPL = next; lsSet(LSK, JSON.stringify(next));
        if (ok) { WORK = clone(next); DIRTY = false; toast('✅ Text templates saved.'); paint(box); state('Saved'); }
        else toast('Saved on this computer only — the cloud did not answer.', true);
      });
    }
  });
}
function addSection(){
  if (typeof W._gcAdmAddSection !== 'function') return false;
  W._gcAdmAddSection({ id: 'texttpl', after: 'texts', ic: '💬', t: 'Text templates', d: 'Sample messages for Twilio and the staff text box: add, edit, reorder, copy for Twilio',
    render: renderAdmin, count: function(){ return TPL ? TPL.length + ' templates' : ''; } });
  return true;
}
if (!addSection()) { var tries = 0, iv = RI.call(W, function(){ if (addSection() || ++tries > 120) clearInterval(iv); }, 500); }

/* ── the picker in the Job Messages "📱 Text them" bar ── */
function pickerList(){ var adm = isAdmin(); return list().filter(function(t){ return adm || t.cat !== 'Marketing'; }); }
function pidOfBar(bar){ var ov = bar.closest('[data-gctx-pid]'); return ov ? ov.getAttribute('data-gctx-pid') : ''; }
function openMenu(btn, bar){
  var old = D.getElementById('gctt-menu'); if (old) { old.remove(); return; }
  var m = D.createElement('div'); m.id = 'gctt-menu'; m.setAttribute('data-gc-keep', '1');
  var r = btn.getBoundingClientRect();
  m.style.cssText = 'position:fixed;z-index:100250;left:' + Math.max(8, Math.min(r.left, W.innerWidth - 328)) + 'px;top:' + (r.bottom + 4) + 'px;width:320px;max-height:50vh;overflow:auto;background:#fff;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.25);font:13px Inter,Arial,sans-serif;color:#0f172a';
  function body(){
    var items = pickerList();
    m.innerHTML = items.length ? items.map(function(t){ return '<div data-id="' + esc(t.id) + '" style="padding:8px 10px;border-bottom:1px solid #f1f5f9;cursor:pointer"><b>' + esc(t.name) + '</b> <span style="color:#64748b;font-size:11px">' + esc(t.cat) + '</span><div style="color:#475569;font-size:12px;margin-top:2px">' + esc(t.body.slice(0, 90)) + (t.body.length > 90 ? '…' : '') + '</div></div>'; }).join('')
      : '<div style="padding:10px;color:#64748b">No templates yet. An admin adds them in Admin settings → 💬 Text templates.</div>';
  }
  body(); D.body.appendChild(m);
  m.addEventListener('click', function(ev){
    var row = ev.target.closest('[data-id]'); if (!row) return;
    var t = list().filter(function(x){ return x.id === row.getAttribute('data-id'); })[0]; if (!t) return;
    var inp = bar.querySelector('.gctx-msg'); if (!inp) return;
    var pid = pidOfBar(bar) || CTX.pid, ctx = { pid: pid, invoice: CTX.invoice && (!CTX.pid || CTX.pid === pid) ? CTX.invoice : null };
    if (inp.tagName === 'INPUT') {   /* a filled template is long: show it all (same class, so the send button reads it as before) */
      var ta = D.createElement('textarea'); ta.className = inp.className; ta.placeholder = inp.placeholder; ta.rows = 4; ta.maxLength = 1600;
      ta.style.cssText = inp.style.cssText + ';flex:1 1 100%;font-family:inherit;resize:vertical'; inp.parentNode.replaceChild(ta, inp); inp = ta;
    }
    inp.value = fill(t.body, ctx, t.cat);
    inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus();
    m.remove();
  });
  var off = function(ev){ if (!m.isConnected) { D.removeEventListener('mousedown', off, true); return; } if (!m.contains(ev.target) && ev.target !== btn) { m.remove(); D.removeEventListener('mousedown', off, true); } };
  D.addEventListener('mousedown', off, true);
  load().then(function(){ if (m.isConnected) body(); });
}
function decorate(){
  var bar = D.querySelector('.gctx-bar'); if (!bar || bar.querySelector('.gctt-pick')) return;
  var send = bar.querySelector('.gctx-send'); if (!send) return;
  var b = D.createElement('button'); b.type = 'button'; b.className = 'gctt-pick'; b.textContent = 'Templates ▾';
  b.style.cssText = 'padding:7px 10px;border:1px solid #0e7490;border-radius:6px;background:#fff;color:#0e7490;font-weight:700;cursor:pointer';
  b.onclick = function(){ openMenu(b, bar); };
  send.parentNode.insertBefore(b, send);
}
RI.call(W, function(){ if (!D.hidden) { try { decorate(); } catch (e) {} } }, 1500);
later(function(){ if (signedIn()) load(); else { var n = 0, iv2 = RI.call(W, function(){ if (signedIn()) { clearInterval(iv2); load(); } else if (++n > 60) clearInterval(iv2); }, 2000); } }, 3000);

W._gcTextTemplates = { list: function(){ return clone(list()); }, fill: fill, count: count, warnings: warnings, setContext: function(c){ CTX = { pid: s(c && c.pid), invoice: c && c.invoice || null }; },
  copyAll: function(){ return copyText(allText(list())); }, reload: load, _decorate: decorate };
try { console.log('[GC] 💬 Text templates: Admin settings → 💬 Text templates, "Templates ▾" in the Job Messages text bar (patch TXTTPL) — _gcTextTemplates'); } catch (e) {}
})();
