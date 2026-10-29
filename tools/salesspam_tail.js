/* __GC_PATCH_SALESSPAM__ — 🗑 FILTERED (SALES/SPAM) (owner 10/29: "a sales pitch for software from replies — do not show
   in crm or email at all, just straight spam").
     • ⚙ Admin settings → 🗑 Filtered (sales/spam), right under 📥 Leads, bids & portals — ADMINS ONLY. Vendor sales pitches
       (software, marketing / SEO, lead generation, "book a demo", financing, staffing, AI tools, cold sales sequences) that
       reached leads@ / bids@ / replies@ / claims@ or texted the GrayCo number from an unknown number never became a lead,
       an alert, a relay e-mail, an approval or a Job Message — they wait here 30 days, then are purged.
     • ↩ Restore = process it normally now · ✓ Always allow this sender / domain (allow list + restore) · 🗑 Delete.
     • The allow / block lists (domains, addresses, phone numbers) are edited here. The allow list always wins.
     • Server: netlify/functions/bid-inbox.js ?salesspam=1 (admins) and _lib/salesspam.js. The day's count is on 🩺 CRM health. */
(function(){
'use strict';
if (window.__GC_PATCH_SALESSPAM__) return; window.__GC_PATCH_SALESSPAM__ = true;
var W = window, D = document;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var FN = '/.netlify/functions/bid-inbox?salesspam=1';
var DATA = null;
var FREE = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|aol|icloud|me|mac|comcast|att|sbcglobal|bellsouth|verizon|charter|spectrum|cox|earthlink|protonmail|proton|gmx|mail|zoho|yandex)\.(com|net|me)$/i;
function s(v){ return v == null ? '' : String(v).trim(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function me(){ try { if (typeof W._gcMeUser === 'function') { var u = W._gcMeUser(); if (u) return u; } } catch (e) {} return {}; }
function isAdmin(){
  try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {}
  var u = me(); return /^admin/i.test(s(u.role)) || s(u.payType).toLowerCase() === 'owner';
}
function j(path, opts){
  return W.fetch(path, Object.assign({ cache: 'no-store' }, opts || {})).then(function(r){ return r.text().then(function(t){ var o = {}; try { o = JSON.parse(t); } catch (e) { o = { error: t.slice(0, 200) }; } o.__status = r.status; return o; }); },
    function(e){ return { error: 'Cannot reach the server (' + e.message + ').', __status: 0 }; });
}
function post(body){ return j(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
function toast(msg, bad){
  try { var t = D.createElement('div'); t.setAttribute('data-gc-keep', '1'); t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:100260;background:' + (bad ? '#7f1d1d' : '#14532d') + ';color:#fff;padding:10px 16px;border-radius:10px;font:600 13px Inter,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:90vw';
    D.body.appendChild(t); ST.call(W, function(){ try { t.remove(); } catch (e) {} }, 4000); } catch (e) {}
}
function when(iso){ var t = Date.parse(iso); if (!isFinite(t)) return ''; try { return new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return s(iso).slice(0, 16); } }
function domainOf(e){ e = s(e).toLowerCase(); var i = e.lastIndexOf('@'); return i >= 0 ? e.slice(i + 1) : ''; }
var BTN = 'border:1px solid #cbd5e1;background:#fff;border-radius:7px;padding:5px 9px;font:600 12px Inter,sans-serif;cursor:pointer;margin:2px 4px 2px 0';
function itemHtml(x){
  var txt = x.channel === 'text', dm = domainOf(x.from);
  var why = x.ai && x.ai.verdict ? '🤖 ' + esc(x.ai.category || '') + ' (' + Math.round((x.ai.confidence || 0) * 100) + '%) — ' + esc(x.ai.reason || '') : esc(arr(x.reasons).join(' · '));
  return '<div class="gcss-item" data-id="' + esc(x.id) + '" style="border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;margin:0 0 8px;background:#fff">'
    + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:baseline"><b>' + (txt ? '📱 ' : '✉️ ') + esc(x.fromName ? x.fromName + ' <' + x.from + '>' : x.from) + '</b>'
    + '<span style="font-size:11px;color:#64748b">' + esc(when(x.at)) + ' · to ' + esc(txt ? 'the texting number' : (x.route || '') + '@') + ' · ' + (x.by === 'ai' ? 'AI' : x.by === 'block' ? 'block list' : 'rules') + '</span></div>'
    + (txt ? '' : '<div style="font-weight:600;margin-top:2px">' + esc(x.subject || '(no subject)') + '</div>')
    + '<div style="font-size:11px;color:#7c2d12;margin-top:2px">' + why + '</div>'
    + '<details style="margin-top:4px"><summary style="cursor:pointer;font-size:12px;color:#334155">Show the message</summary><pre style="white-space:pre-wrap;word-break:break-word;font:12px/1.45 Inter,sans-serif;background:#f8fafc;border-radius:8px;padding:8px;max-height:260px;overflow:auto;margin:6px 0 0">' + esc(s(x.text).slice(0, 6000)) + '</pre></details>'
    + '<div style="margin-top:6px"><button type="button" data-ss="restore" style="' + BTN + '">↩ Restore</button>'
    + '<button type="button" data-ss="allow" data-scope="address" style="' + BTN + '">✓ Always allow ' + (txt ? 'this number' : 'this sender') + '</button>'
    + (!txt && dm && !FREE.test(dm) ? '<button type="button" data-ss="allow" data-scope="domain" style="' + BTN + '">✓ Always allow @' + esc(dm) + '</button>' : '')
    + '<button type="button" data-ss="delete" style="' + BTN + ';color:#991b1b">🗑 Delete</button></div></div>';
}
function render(box){
  if (!isAdmin()) { box.innerHTML = '<div style="color:#64748b">Only an admin sees the filtered sales e-mails.</div>'; return; }
  box.innerHTML = '<div style="color:#64748b">Loading…</div>';
  j(FN).then(function(o){
    if (!o || !o.ok) { box.innerHTML = '<div style="color:#b91c1c">' + esc((o && o.error) || 'Could not load.') + '</div>'; return; }
    DATA = o;
    var c = o.counts || { today: {}, week: {} }, items = arr(o.items), L = o.lists || { allow: [], block: [] };
    box.innerHTML = '<div class="gcss" style="font:13px Inter,sans-serif;color:#0f172a">'
      + '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;margin-bottom:10px;line-height:1.5">'
      + '<b>' + (c.today.e || 0) + '</b> sales e-mail' + ((c.today.e || 0) === 1 ? '' : 's') + (c.today.t ? ' and <b>' + c.today.t + '</b> text' + (c.today.t === 1 ? '' : 's') : '') + ' filtered today · '
      + ((c.week.e || 0) + (c.week.t || 0)) + ' in the last 7 days. Vendor pitches to leads@, bids@, replies@, claims@ and texts from unknown numbers never become leads, alerts or messages; they wait here '
      + (o.keepDays || 30) + ' days, then are deleted. Customers, subs, vendors, adjusters, carriers, plan rooms, replies to our e-mails and anything naming one of our jobs are never filtered.</div>'
      + (items.length ? items.map(itemHtml).join('') : '<div style="color:#64748b;padding:6px 0 12px">Nothing filtered in the last ' + (o.keepDays || 30) + ' days.</div>')
      + '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:10px">'
      + '<label style="flex:1;min-width:220px;font-weight:700">✓ Always allow<div style="font-weight:400;font-size:11px;color:#64748b">domains, addresses or phone numbers — one per line; always let through</div><textarea data-ss-list="allow" rows="5" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:6px;font:12px ui-monospace,monospace">' + esc(arr(L.allow).join('\n')) + '</textarea></label>'
      + '<label style="flex:1;min-width:220px;font-weight:700">⛔ Always filter<div style="font-weight:400;font-size:11px;color:#64748b">domains, addresses or phone numbers — one per line (not gmail.com etc.: use the address)</div><textarea data-ss-list="block" rows="5" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:6px;font:12px ui-monospace,monospace">' + esc(arr(L.block).join('\n')) + '</textarea></label></div>'
      + '<div style="margin-top:8px"><button type="button" data-ss="lists" style="border:0;border-radius:8px;padding:9px 16px;background:#16a34a;color:#fff;font-weight:800;cursor:pointer">Save lists</button></div></div>';
    box.onclick = function(ev){
      var b = ev.target && ev.target.closest && ev.target.closest('[data-ss]'); if (!b || b.disabled) return;
      var op = b.getAttribute('data-ss');
      if (op === 'lists') {
        var a = box.querySelector('[data-ss-list="allow"]'), k = box.querySelector('[data-ss-list="block"]');
        b.disabled = true;
        post({ op: 'lists', allow: a ? a.value : '', block: k ? k.value : '' }).then(function(r){ b.disabled = false; if (r && r.ok) { toast('✅ Lists saved.'); render(box); } else toast('Not saved: ' + s(r && r.error), true); });
        return;
      }
      var it = b.closest('.gcss-item'), id = it && it.getAttribute('data-id'); if (!id) return;
      if (op === 'delete' && !confirm('Delete this message now? (It would be deleted after 30 days anyway.)')) return;
      b.disabled = true; b.textContent = '…';
      post({ op: op, id: id, scope: b.getAttribute('data-scope') || '' }).then(function(r){
        if (r && r.ok) { toast(op === 'delete' ? 'Deleted.' : op === 'allow' ? '✅ Allowed and restored — it is processed normally now.' : '✅ Restored — it is processed normally now.'); render(box); }
        else { b.disabled = false; toast('Not done: ' + s(r && r.error), true); render(box); }
      });
    };
  });
}
function count(){ if (!DATA) return ''; var n = arr(DATA.items).length; return n ? n + ' filtered' : ''; }
function addSection(){
  if (typeof W._gcAdmAddSection !== 'function') return false;
  if (!isAdmin()) return false;   /* admins only — the section is not even listed for anyone else */
  W._gcAdmAddSection({ id: 'salesspam', after: 'leads', ic: '🗑', t: 'Filtered (sales/spam)', d: 'Vendor sales pitches kept out of leads, alerts and messages — restore, always allow, allow / block lists (30 days)',
    render: render, count: count });
  return true;
}
if (!addSection()) { var tries = 0, iv = RI.call(W, function(){ if (addSection() || ++tries > 240) clearInterval(iv); }, 500); }
W._gcSalesSpam = { render: render, itemHtml: itemHtml };
try { console.log('[GC] 🗑 Filtered (sales/spam): ⚙ Admin → 🗑 Filtered (patch SALESSPAM) — _gcSalesSpam'); } catch (e) {}
})();
