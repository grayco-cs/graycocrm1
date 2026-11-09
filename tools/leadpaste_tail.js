<script>/*__GC_PATCH_LEADPASTE__ (owner 11/9: "want to be able to add websites or emails into leads where it scrubs and enters into crm as
  a lead"; "we have emails from estimating@summitgc.net that we want in our leads too").
  Leads → "➕ Lead from an e-mail or website": paste an e-mail (with its From / Subject lines if you have them) or a web address
  (a bid page, a GC's project page). The CRM reads it exactly like mail sent to leads@ — the AI picks out the project, address,
  bid due date, GC and trades, the construction filter applies, the same project already on the list is joined (one lead per
  project), and the normal new-lead alert goes out. "A customer asking for work" uses the homeowner path instead. */
(function(W){
'use strict';
var D = W.document, FN = '/.netlify/functions/bid-inbox?pastelead=1';
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function sheet(){
  var old = D.getElementById('gc-lp'); if (old) old.remove();
  var ov = D.createElement('div'); ov.id = 'gc-lp'; ov.setAttribute('data-gc-keep', '1');
  ov.style.cssText = 'position:fixed;inset:0;z-index:100010;background:rgba(15,29,47,.55);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto';
  ov.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:640px;width:100%;padding:18px;font:14px Inter,Arial,sans-serif;color:#0f172a">'
    + '<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:17px">➕ New lead from an e-mail or website</b><button type="button" data-lp-x style="border:0;background:none;font-size:20px;cursor:pointer">✕</button></div>'
    + '<div style="color:#64748b;font-size:12.5px;margin:4px 0 12px">The CRM reads it like an e-mail sent to leads@: project, address, bid due date, GC and trades. The same project already on your list is joined, never doubled.</div>'
    + '<div style="display:flex;gap:14px;margin-bottom:10px;flex-wrap:wrap"><label><input type="radio" name="lpk" value="bid" checked> 🏗 A bid / GC invitation / bid notice</label><label><input type="radio" name="lpk" value="customer"> 🏠 A customer asking for work</label></div>'
    + '<label style="display:block;font-weight:700;font-size:13px;margin-bottom:4px">Web address (optional)</label><input id="gc-lp-url" type="url" placeholder="https://… a bid page or project page" style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font:inherit;margin-bottom:10px">'
    + '<label style="display:block;font-weight:700;font-size:13px;margin-bottom:4px">…or paste the e-mail / page text</label><textarea id="gc-lp-text" rows="10" placeholder="Paste the whole e-mail here — From:, Subject: and the body (e.g. the invite from estimating@summitgc.net)." style="width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font:13px/1.4 Inter,Arial,sans-serif"></textarea>'
    + '<div id="gc-lp-msg" style="min-height:18px;font-size:13px;margin:8px 0"></div>'
    + '<div style="display:flex;justify-content:flex-end;gap:8px"><button type="button" data-lp-x style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer">Cancel</button><button type="button" data-lp-go style="border:0;background:#0F1D2F;color:#fff;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer">Read it and make the lead</button></div></div>';
  D.body.appendChild(ov);
  ov.addEventListener('click', function(e){
    var t = e.target; if (t === ov || t.hasAttribute('data-lp-x')) { ov.remove(); return; }
    if (!t.hasAttribute('data-lp-go')) return;
    var url = ov.querySelector('#gc-lp-url').value.trim(), text = ov.querySelector('#gc-lp-text').value.trim(), kind = (ov.querySelector('input[name=lpk]:checked') || {}).value || 'bid', msg = ov.querySelector('#gc-lp-msg');
    if (!url && !text) { msg.style.color = '#b91c1c'; msg.textContent = 'Paste the e-mail or enter a web address.'; return; }
    t.disabled = true; t.textContent = 'Reading…'; msg.style.color = '#475569'; msg.textContent = 'Reading it — this can take up to 20 seconds.';
    W.fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url, text: text, kind: kind }) })
      .then(function(r){ return r.json().catch(function(){ return {}; }); }, function(){ return { error: 'No connection.' }; })
      .then(function(j){
        t.disabled = false; t.textContent = 'Read it and make the lead';
        var L = (j && j.leads) || [];
        if (j && (j.ok || j.inbox) && (L.length || j.lead || j.id || j.inbox === 'leads')) {
          var n = L.filter(function(x){ return x.action === 'added' || x.action === 'new' || x.action === 'created'; }).length;
          msg.style.color = '#166534'; msg.innerHTML = '✓ ' + (L.length ? L.map(function(x){ return esc(x.title || 'Lead') + ' — ' + (/add|new|creat/.test(x.action) ? 'new lead' : 'joined the lead already on the list'); }).join('<br>') : 'Lead added.') + '<br>It shows in 📥 Lead Inbox and on Leads in a moment.';
          ov.querySelector('#gc-lp-text').value = ''; ov.querySelector('#gc-lp-url').value = '';
          try { if (W._gcLeadsHub && W._gcLeadsHub.redraw) setTimeout(W._gcLeadsHub.redraw, 1500); } catch (e) {}
        } else {
          msg.style.color = '#b91c1c'; msg.textContent = (j && (j.error || (j.ignored ? 'Not made into a lead: ' + j.ignored + '. If it is a real job, pick the other kind above or paste more of the text.' : ''))) || 'Could not make a lead from it.';
        }
      });
  });
}
function paint(){
  var hub = D.getElementById('gc-leads-hub'); if (!hub) return;
  if (D.getElementById('gc-lp-btn')) return;
  var b = D.createElement('button'); b.id = 'gc-lp-btn'; b.type = 'button'; b.setAttribute('data-gc-keep', '1');
  b.textContent = '➕ Lead from an e-mail or website';
  b.style.cssText = 'border:1px solid #0F1D2F;background:#fff;color:#0F1D2F;border-radius:999px;padding:7px 14px;font:700 13px Inter,Arial,sans-serif;cursor:pointer;margin:0 0 10px;min-height:36px';
  b.onclick = sheet; hub.insertBefore(b, hub.firstChild);
}
setInterval(paint, 2000);
W._gcLeadPaste = { open: sheet };
})(window);
</script>
