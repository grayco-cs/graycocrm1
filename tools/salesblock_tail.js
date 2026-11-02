/* __GC_PATCH_SALESBLOCK__ — 🧹 SALES & SPAM + 🚫 BLOCKED (owner 11/01: a 2:25 AM "🚨 EMERGENCY" text that was an AI-agent
   sales pitch — "I can't have any sales call and can't have just anyone wasting time in my phone that late. Don't let
   calls like this go through and block them."). ADMINS AND THE OFFICE ONLY.
     • Leads: a quiet line "🧹 Sales & spam: N waiting" → the list of pitches the server held back (website form, leads@,
       texts, call transcripts, any new lead). Each: ✅ Not spam → make lead · 🚫 Block · Dismiss.
     • ⚙ Admin settings → 🚫 Blocked: the blocked numbers / e-mails / domains (add, unblock) and the last decisions.
     • 🚫 Block sender on a lead (the lead drawer) and on a text in Job Messages → 📥 Unsorted.
     • The 🚨 alert text's "Block:" link (?sgb=<number>.<signature>) opens here and asks first.
     • The detector below is the server's (netlify/functions/_lib/salesguard.js), copied verbatim by tools/patch_SALESBLOCK.py:
       a lead that looks like a pitch shows "🧹 Looks like a sales pitch". Server: netlify/functions/salesblock.js. */
(function(){
'use strict';
if (window.__GC_PATCH_SALESBLOCK__) return; window.__GC_PATCH_SALESBLOCK__ = true;
var W = window, D = document;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var FN = '/.netlify/functions/salesblock';
/*__SG_RULES__*/
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function d10(v){ var d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function tidy(v){ var d = d10(v); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(v); }
function when(iso){ var t = Date.parse(iso); if (!isFinite(t)) return ''; try { return new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return s(iso).slice(0, 16); } }
function allowed(){
  try { if (W._gcIsOfficeFull && W._gcIsOfficeFull()) return true; } catch (e) {}
  try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; }
}
function signedIn(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()) && !D.getElementById('gc-auth-gate'); } catch (e) { return false; } }
function j(q, body){
  var o = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' } : { cache: 'no-store' };
  return W.fetch(FN + q, o).then(function(r){ return r.text().then(function(t){ var x = {}; try { x = JSON.parse(t); } catch (e) { x = { error: t.slice(0, 200) }; } x.__status = r.status; return x; }); },
    function(e){ return { error: 'Cannot reach the server (' + e.message + ').', __status: 0 }; });
}
function toast(msg, bad){
  try { var t = D.createElement('div'); t.setAttribute('data-gc-keep', '1'); t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:100270;background:' + (bad ? '#7f1d1d' : '#14532d') + ';color:#fff;padding:10px 16px;border-radius:10px;font:600 13px Inter,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:90vw';
    D.body.appendChild(t); ST.call(W, function(){ try { t.remove(); } catch (e) {} }, 4200); } catch (e) {}
}
function css(){
  if (D.getElementById('gcsb-css')) return;
  var st = D.createElement('style'); st.id = 'gcsb-css';
  st.textContent = '#root:has(#gc-leads-tabs:not([data-tab="leads"])) #gcsb-strip{display:none!important}'
    + '#gcsb-strip{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 10px;padding:6px 12px;border-radius:10px;border:1px solid #e2e8f0;background:#f8fafc;color:#475569;font:13px/1.4 Inter,Arial,sans-serif}'
    + '#gcsb-strip button,.gcsb-btn{border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:8px;padding:5px 10px;font:600 12px Inter,Arial,sans-serif;cursor:pointer;margin:2px 4px 2px 0}'
    + '.gcsb-btn.go{background:#16a34a;border-color:#16a34a;color:#fff}.gcsb-btn.stop{background:#b91c1c;border-color:#b91c1c;color:#fff}'
    + '#gcsb-ov{position:fixed;inset:0;z-index:100250;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;padding:4vh 12px;overflow:auto}'
    + '#gcsb-ov .bx{background:#fff;color:#0f172a;border-radius:14px;max-width:820px;width:100%;padding:16px 18px;font:13px/1.45 Inter,Arial,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.35)}'
    + '.gcsb-it{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin:8px 0}.gcsb-it pre{white-space:pre-wrap;font:13px/1.45 Inter,Arial,sans-serif;background:#f8fafc;border-radius:8px;padding:8px;margin:6px 0;max-height:180px;overflow:auto}'
    + '.gcsb-why{font-size:11px;color:#92400e;background:#fef3c7;border-radius:6px;padding:2px 6px;display:inline-block}.gcsb-chip{display:inline-block;font:600 11px Inter,Arial,sans-serif;background:#fef3c7;color:#92400e;border-radius:999px;padding:2px 8px;margin:0 6px 0 0}'
    + '#gcsb-lead{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 8px;padding:6px 8px;border:1px dashed #e2e8f0;border-radius:8px;font:12px Inter,Arial,sans-serif}';
  (D.head || D.documentElement).appendChild(st);
}
var VIA = { website: '🌐 Website form', email: '✉️ leads@ e-mail', sms: '📱 Text', call: '📞 Call', lead: '📥 Lead' };

/* ── block / unblock (the one call every button uses) ── */
function block(who, id, sig){
  var label = [who.phone ? tidy(who.phone) : '', who.email || '', who.domain ? '@' + who.domain : ''].filter(Boolean).join(' · ');
  if (!W.confirm('🚫 Block ' + label + '?\n\nTexts and calls from it are dropped silently (a call gets a busy signal); website forms and e-mails are ignored. You can unblock it in ⚙ Admin settings → 🚫 Blocked.')) return Promise.resolve(null);
  var b = { phone: who.phone || '', email: who.email || '', domain: who.domain || '' }; if (id) b.id = id; if (sig) b.sig = sig;
  return j('?act=block', b).then(function(o){ if (o && o.ok) { toast('🚫 Blocked ' + label + '.'); COUNT_AT = 0; } else toast('Not blocked: ' + s(o && o.error), true); return o; });
}

/* ── Leads: the quiet line + the list ── */
var COUNT = null, COUNT_AT = 0;
function strip(){
  if (D.hidden || !signedIn() || !allowed()) return;
  var hub = D.getElementById('gc-leads-hub'); if (!hub || !hub.parentNode) return;
  css();
  if (Date.now() - COUNT_AT > 180000) { COUNT_AT = Date.now(); j('?count=1').then(function(o){ if (o && o.ok) { COUNT = o.held; paint(); } }); }
  paint();
}
function paint(){
  var hub = D.getElementById('gc-leads-hub'); if (!hub || !hub.parentNode || COUNT == null) return;
  var el = D.getElementById('gcsb-strip');
  if (!el) { el = D.createElement('div'); el.id = 'gcsb-strip'; el.setAttribute('data-gc-keep', '1'); el.addEventListener('click', function(e){ if (e.target && e.target.getAttribute('data-gcsb') === 'open') { e.preventDefault(); openList(); } }); }
  if (el.parentNode !== hub.parentNode || el.nextElementSibling !== hub) hub.parentNode.insertBefore(el, hub);
  var h = '🧹 <b>Sales &amp; spam</b>: ' + (COUNT ? COUNT + ' held for review (no one was alerted)' : 'nothing waiting') + ' <button type="button" data-gcsb="open">Review</button>';
  if (el.innerHTML !== h) el.innerHTML = h;
}
function itemHtml(x, done){
  var who = [x.name ? '<b>' + esc(x.name) + '</b>' : '', x.phone ? esc(tidy(x.phone)) : '', x.email ? esc(x.email) : '', x.company ? esc(x.company) : ''].filter(Boolean).join(' · ');
  return '<div class="gcsb-it" data-id="' + esc(x.id) + '"><div>' + esc(VIA[x.via] || x.via) + ' · ' + esc(when(x.at)) + (who ? ' · ' + who : '') + '</div>'
    + '<div class="gcsb-why">🧹 ' + esc(x.why) + '</div><pre>' + esc(x.text) + '</pre>'
    + (done ? '<div style="font-size:12px;color:#64748b">' + esc({ lead: '✅ made a lead', blocked: '🚫 blocked', dismissed: 'dismissed' }[x.status] || x.status) + (x.by ? ' by ' + esc(x.by) : '') + (x.doneAt ? ' · ' + esc(when(x.doneAt)) : '') + '</div>'
      : (x.canLead ? '<button type="button" class="gcsb-btn go" data-a="notspam">✅ Not spam → make lead</button>' : '')
        + ((x.phone || x.email) ? '<button type="button" class="gcsb-btn stop" data-a="block">🚫 Block</button>' : '')
        + '<button type="button" class="gcsb-btn" data-a="dismiss">Dismiss (keep as spam)</button>')
    + '</div>';
}
var LIST = null;
function openList(){
  if (!allowed()) { toast('Only an admin or the office can see Sales & spam.', true); return; }
  css();
  var ov = D.getElementById('gcsb-ov'); if (ov) ov.remove();
  ov = D.createElement('div'); ov.id = 'gcsb-ov'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Sales & spam');
  ov.innerHTML = '<div class="bx"><div style="display:flex;align-items:center;gap:8px"><b style="font-size:16px">🧹 Sales &amp; spam</b><span style="flex:1"></span><button type="button" class="gcsb-btn" data-a="close">Close</button></div><div class="gcsb-body">Loading…</div></div>';
  D.body.appendChild(ov);
  ov.addEventListener('click', function(e){
    if (e.target === ov) { ov.remove(); return; }
    var b = e.target && e.target.closest && e.target.closest('[data-a]'); if (!b) return;
    var a = b.getAttribute('data-a'); if (a === 'close') { ov.remove(); return; }
    var card = b.closest('[data-id]'), id = card && card.getAttribute('data-id'), x = LIST && arr(LIST.held).filter(function(y){ return y.id === id; })[0];
    if (!x) return;
    b.disabled = true;
    var done = function(o, msg){ b.disabled = false; if (o && o.ok) { if (msg) toast(msg); load(ov); COUNT_AT = 0; } else if (o) toast(s(o.error) || 'Not done.', true); };
    if (a === 'notspam') j('?act=notspam', { id: id }).then(function(o){ done(o, '✅ Made a lead — it is in the Lead Inbox now.'); try { if (o && o.ok && W._gcLeadInbox && W._gcLeadInbox.refresh) W._gcLeadInbox.refresh(); } catch (er) {} });
    else if (a === 'block') block({ phone: x.phone, email: x.email }, id).then(function(o){ done(o || { ok: false }, ''); if (!o) b.disabled = false; });
    else if (a === 'dismiss') j('?act=dismiss', { id: id }).then(function(o){ done(o, 'Dismissed.'); });
  });
  load(ov);
}
function load(ov){
  var body = ov.querySelector('.gcsb-body');
  j('?list=1').then(function(o){
    if (!o || !o.ok) { body.innerHTML = '<div style="color:#b91c1c">' + esc((o && o.error) || 'Could not load.') + '</div>'; return; }
    LIST = o; COUNT = arr(o.held).length; paint();
    var c = o.counts || {};
    body.innerHTML = '<div style="color:#475569;margin:6px 0 4px">Sales pitches and spam never page, text or call anyone (day or night) and get no automatic reply. They wait here. '
      + 'So far: ' + (+c.sales || 0) + ' held, ' + (+c.blocked || 0) + ' dropped from blocked senders. Blocked list: ⚙ Admin settings → 🚫 Blocked.</div>'
      + (arr(o.held).length ? arr(o.held).map(function(x){ return itemHtml(x, false); }).join('') : '<div style="padding:12px;color:#64748b">Nothing waiting. 👍</div>')
      + (arr(o.done).length ? '<details style="margin-top:10px"><summary style="cursor:pointer;color:#475569">Recently handled (' + arr(o.done).length + ')</summary>' + arr(o.done).map(function(x){ return itemHtml(x, true); }).join('') + '</details>' : '');
  });
}

/* ── ⚙ Admin settings → 🚫 Blocked ── */
var BL = null;
function renderBlocked(box){
  if (!allowed()) { box.innerHTML = '<div style="color:#64748b">Only an admin or the office can change the block list.</div>'; return; }
  css();
  box.innerHTML = '<div style="color:#64748b">Loading…</div>';
  j('?list=1').then(function(o){
    if (!o || !o.ok) { box.innerHTML = '<div style="color:#b91c1c">' + esc((o && o.error) || 'Could not load.') + '</div>'; return; }
    BL = o; var b = o.block || {}, c = o.counts || {};
    var row = function(kind, v, label){ return '<tr><td style="padding:4px 8px">' + esc(label) + '</td><td style="padding:4px 8px;color:#64748b">' + esc(kind) + '</td><td style="padding:4px 8px"><button type="button" class="gcsb-btn" data-ub="' + esc(kind) + '" data-v="' + esc(v) + '">Unblock</button></td></tr>'; };
    var rows = arr(b.phones).map(function(p){ return row('phone', p, tidy(p)); }).concat(arr(b.emails).map(function(e){ return row('email', e, e); }), arr(b.domains).map(function(d){ return row('domain', d, '@' + d); }));
    var log = arr(o.log).slice(0, 30).map(function(x){ return '<tr><td style="padding:3px 8px;white-space:nowrap">' + esc(when(x.at)) + '</td><td style="padding:3px 8px">' + esc(x.decision) + '</td><td style="padding:3px 8px">' + esc(x.via) + '</td><td style="padding:3px 8px">' + esc(x.phone ? tidy(x.phone) : x.email || '') + '</td><td style="padding:3px 8px;color:#64748b">' + esc(x.why) + '</td></tr>'; }).join('');
    box.innerHTML = '<div style="font:13px Inter,sans-serif;color:#0f172a">'
      + '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;margin-bottom:10px;line-height:1.5">A blocked number or e-mail is dropped silently everywhere: texts get no reply and make no lead, calls get a busy signal, website forms and e-mails are ignored. Each drop is logged. '
      + 'Totals: <b>' + (+c.blocked || 0) + '</b> dropped · <b>' + (+c.sales || 0) + '</b> sales pitches held · <b>' + (+c.night || 0) + '</b> night "emergencies" that were not paged.</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px"><input data-sb="add" placeholder="Phone number, e-mail, or @domain" style="flex:1;min-width:220px;padding:7px 9px;border:1px solid #cbd5e1;border-radius:8px"><button type="button" class="gcsb-btn stop" data-sb="go">🚫 Block</button></div>'
      + (rows.length ? '<table style="border-collapse:collapse;font-size:13px;margin-bottom:10px">' + rows.join('') + '</table>' : '<div style="color:#64748b;margin-bottom:10px">Nobody is blocked.</div>')
      + '<details><summary style="cursor:pointer;color:#475569">Recent decisions (sales / blocked / night)</summary><div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:12px">' + log + '</table></div></details></div>';
    box.onclick = function(e){
      var t = e.target; if (!t || !t.getAttribute) return;
      var kind = t.getAttribute('data-ub');
      if (kind) { var v = t.getAttribute('data-v'), q = {}; q[kind] = v; t.disabled = true; j('?act=unblock', q).then(function(r){ if (r && r.ok) { toast('Unblocked.'); renderBlocked(box); } else { t.disabled = false; toast('Not unblocked: ' + s(r && r.error), true); } }); return; }
      if (t.getAttribute('data-sb') === 'go') {
        var raw = s((box.querySelector('[data-sb="add"]') || {}).value), who = {};
        if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(raw)) who.email = raw.toLowerCase();
        else if (/^@?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(raw)) who.domain = raw.replace(/^@/, '').toLowerCase();
        else if (d10(raw).length === 10) who.phone = d10(raw);
        else { toast('Type a 10-digit phone number, an e-mail address or @domain.', true); return; }
        block(who).then(function(r){ if (r && r.ok) renderBlocked(box); });
      }
    };
  });
}
function count(){ if (!BL || !BL.block) return ''; var b = BL.block, n = arr(b.phones).length + arr(b.emails).length + arr(b.domains).length; return n ? n + ' blocked' : 'none'; }
function addSection(){
  if (typeof W._gcAdmAddSection !== 'function') return false;
  W._gcAdmAddSection({ id: 'salesblock', after: 'smsalerts', ic: '🚫', t: 'Blocked', d: 'Numbers / e-mails that never reach anyone (sales, spam) — unblock here; sales pitches wait in Leads → 🧹 Sales & spam', render: renderBlocked, count: count });
  return true;
}
if (!addSection()) { var tries = 0, iv = RI.call(W, function(){ if (addSection() || ++tries > 120) clearInterval(iv); }, 500); }

/* ── 🚫 Block sender on a lead (the lead drawer) ── */
function leadById(id){ try { return arr((W._crm || {}).leads).filter(function(l){ return l && s(l.id) === s(id); })[0] || null; } catch (e) { return null; } }
function leadText(l){ var said = l.said || (l.leadExtra && l.leadExtra.said) || {}; return [said.message, l.textBody, l.leadExtra && l.leadExtra.textBody, l.scope].filter(Boolean).join('\n'); }
function decorateLead(){
  var d = D.getElementById('gcl-drawer'); if (!d || d.querySelector('#gcsb-lead') || !allowed()) return;
  var id = ''; try { id = W._gcLeadsHub.ui().open; } catch (e) {}
  var l = leadById(id); if (!l) return;
  var phone = d10(l.smsFrom || l.phone || (l.contact && l.contact.phone)), email = s(l.email || (l.contact && l.contact.email)).toLowerCase();
  if (phone.length !== 10 && !email) return;
  css();
  var why = sgWhy(leadText(l), { email: email, company: s((l.said || {}).company) });
  /* patch SPAMGIB */ var bot = sgBotWhy({ name: s(l.contactName || (l.contact && l.contact.name) || l.name), message: leadText(l), location: [l.address, l.city, l.state].filter(Boolean).join(', '), company: s(l.company || (l.said || {}).company || (l.leadExtra && l.leadExtra.company)), email: email });
  var el = D.createElement('div'); el.id = 'gcsb-lead'; el.setAttribute('data-gc-keep', '1');
  el.innerHTML = (bot ? '<span class="gcsb-chip" title="' + esc(bot) + '">🤖 Looks like a bot (random text)</span>' : why ? '<span class="gcsb-chip" title="' + esc(why) + '">🧹 Looks like a sales pitch</span>' : '') + '<button type="button" class="gcsb-btn stop" data-gcsb-lead="1">' + (bot ? '🚫 Not a real lead — block sender' : '🚫 Block sender') + '</button><span style="color:#64748b">' + esc([phone.length === 10 ? tidy(phone) : '', email].filter(Boolean).join(' · ')) + '</span>';
  el.querySelector('[data-gcsb-lead]').onclick = function(e){ e.preventDefault(); e.stopPropagation(); block({ phone: phone.length === 10 ? phone : '', email: email }); };
  d.insertBefore(el, d.firstChild ? d.firstChild.nextSibling : null);
}

/* ── 🚫 Block on a text (Job Messages → 📥 Unsorted) ── */
function msgs(){ try { return arr(JSON.parse(localStorage.getItem('gc_job_messages') || '[]')); } catch (e) { return []; } }
function decorateUnsorted(){
  var box = D.querySelector('.gc-qa-unsorted'); if (!box || !allowed()) return;
  var by = null;
  Array.prototype.forEach.call(box.querySelectorAll('.gc-qa-urow'), function(row){
    if (row.querySelector('.gcsb-blk')) return;
    if (!by) { by = {}; msgs().forEach(function(m){ if (m && m.id) by[m.id] = m; }); }
    var sel = row.querySelector('[data-qa-pick]'), m = sel && by[sel.getAttribute('data-qa-pick')];
    if (!m || !m.smsFrom) return;
    css();
    var bt = D.createElement('button'); bt.type = 'button'; bt.className = 'gcsb-blk gcsb-btn stop'; bt.textContent = '🚫 Block';
    bt.onclick = function(ev){ ev.preventDefault(); ev.stopPropagation(); block({ phone: d10(m.smsFrom) }); };
    row.appendChild(bt);
  });
}

/* ── the alert text's signed "Block:" link ── */
var LINK_DONE = false;
function linkFromAlert(){
  if (LINK_DONE) return;
  var q = ''; try { q = new URLSearchParams(location.search).get('sgb') || ''; } catch (e) {}
  if (!q) { LINK_DONE = true; return; }
  if (!signedIn() || !W.__GC_AUTH__ || typeof W.__GC_AUTH__.isAdmin !== 'function') return;   /* wait for sign-in */
  LINK_DONE = true;
  try { var u = new URL(location.href); u.searchParams.delete('sgb'); history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash); } catch (e) {}
  var m = /^(\d{10})\.([A-Za-z0-9]{6,20})$/.exec(q);
  if (!m) { toast('That block link is not valid.', true); return; }
  if (!allowed()) { toast('Only an admin or the office can block a number.', true); return; }
  block({ phone: m[1] }, '', m[2]);
}

RI.call(W, function(){ try { linkFromAlert(); strip(); decorateLead(); decorateUnsorted(); } catch (e) {} }, 1500);
W._gcSalesBlock = { isSales: sgIsSales, why: sgWhy, open: openList, block: block, render: renderBlocked, count: function(){ return COUNT; } };
try { console.log('[GC] 🧹 Sales & spam + 🚫 Blocked (patch SALESBLOCK) — _gcSalesBlock'); } catch (e) {}
})();
