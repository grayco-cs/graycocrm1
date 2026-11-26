# PAYCARD (owner 11/26: "when i add a credit card payment company let that button change to we accept credit cards with their link or however
# to pay it, but for now we dont have anything, put that button into crm so when i have one i can enter it"): ⚙ Admin → the portal row gets
# "💳 Credit card payments" (a pay link https://… + how-to words; empty = none). Admins only save it (server-checked). The customer portal's
# "How to pay" says "We do not take credit cards yet" until a link is saved, then "💳 Pay by credit card" (the link) + the words.
import re
def sub(p, a, b, n=1):
    s = open(p, encoding='utf-8').read()
    assert s.count(a) == n, (p, a[:70], s.count(a)); s = s.replace(a, b); open(p, 'w', encoding='utf-8').write(s)
F = 'netlify/functions/portal.js'
sub(F, "      if (v && typeof v === 'object') return { autoSend: v.autoSend !== false, text: v.text === true, by: s(v.by), at: s(v.at) }; }\n  } catch (e) {}\n  return { autoSend: true, text: false, by: '', at: '' };",
       "      if (v && typeof v === 'object') return { autoSend: v.autoSend !== false, text: v.text === true, by: s(v.by), at: s(v.at), card: cardOf(v.card) }; }\n  } catch (e) {}\n  return { autoSend: true, text: false, by: '', at: '', card: cardOf(null) };")
sub(F, "  const next = { autoSend: patch.autoSend == null ? cur.autoSend : !!patch.autoSend, text: patch.text == null ? cur.text : !!patch.text, by: clip(by, 120), at: new Date().toISOString() };",
       "  const next = { autoSend: patch.autoSend == null ? cur.autoSend : !!patch.autoSend, text: patch.text == null ? cur.text : !!patch.text, card: patch.card == null ? cur.card : cardOf(patch.card), by: clip(by, 120), at: new Date().toISOString() };")
sub(F, "const SETTINGS_KEY = 'gc_portal_settings';\n",
       "const SETTINGS_KEY = 'gc_portal_settings';\n/* patch PAYCARD: the credit-card pay link (https only) + how-to words; empty = GrayCo takes no cards yet */\nfunction cardOf(c){ c = c && typeof c === 'object' ? c : {}; const url = s(c.url).trim(); return { url: /^https:\\/\\/[^\\s<>\"']{4,300}$/.test(url) ? url : '', note: clip(s(c.note).replace(/[<>]/g, ''), 240), by: clip(c.by, 120), at: s(c.at) }; }\n")
sub(F, "        if (body.set && typeof body.set === 'object') return reply(200, headers, Object.assign({ ok: true }, await settingsSet(body.set, who.email)));",
       "        if (body.set && typeof body.set === 'object') {\n          if (body.set.card != null) {   /* patch PAYCARD: admins only; a link that is not https:// is refused, never stored */\n            if (!require('./_lib/staff-role.js').isAdmin(who)) return reply(403, headers, { ok: false, error: 'Only an admin changes the credit card payments.' });\n            const cu = s(body.set.card && body.set.card.url).trim();\n            if (cu && !/^https:\\/\\/[^\\s<>\"']{4,300}$/.test(cu)) return reply(400, headers, { ok: false, error: 'The pay link must start with https://' });\n            body.set.card = Object.assign({}, body.set.card, { by: who.email, at: new Date().toISOString() });\n          }\n          return reply(200, headers, Object.assign({ ok: true }, await settingsSet(body.set, who.email)));\n        }")
sub(F, "  const view = await buildView(data, p);\n  try { const sa = await subcLib().readAll(exports._core);",
       "  const view = await buildView(data, p);\n  try { const cd = (await settingsGet()).card; view.payCard = cd.url ? { url: cd.url, note: cd.note } : null; } catch (e) { view.payCard = null; }   /* patch PAYCARD */\n  try { const sa = await subcLib().readAll(exports._core);")

P = 'portal.html'
CARD = "'])].concat(payCardH()))"
sub(P, """ We do not take credit cards yet. Every payment shows on your ', h('b', { text: 'final invoice' }), '.'])])   /* patch PAYDD */""",
       """ Every payment shows on your ', h('b', { text: 'final invoice' }), '.'])].concat(payCardH()))   /* patch PAYDD + PAYCARD */""")
sub(P, """ We do not take credit cards yet.'])]));   /* patch PAYDD */""",
       """'])].concat(payCardH())));   /* patch PAYDD + PAYCARD */""")
sub(P, "var OFFICE = '901-585-0944';\n",
       "var OFFICE = '901-585-0944';\n/* patch PAYCARD: \"We do not take credit cards yet\" — or, once an admin saves a pay link in the CRM, 💳 Pay by credit card */\nfunction payCardH(){ var c = V && V.payCard; if (!(c && /^https:\\/\\//.test(c.url || ''))) return [h('span', { class: 'muted', style: 'display:block;margin-top:6px', text: 'We do not take credit cards yet.' })];\n  return [h('span', { style: 'display:block;margin-top:8px' }, [h('b', { text: 'We accept credit cards. ' }), c.note ? c.note + ' ' : '']), h('a', { class: 'btn', href: c.url, target: '_blank', rel: 'noopener', style: 'display:inline-block;margin-top:6px', text: '💳 Pay by credit card' })]; }\n")

I = 'index.html'
sub(I, """<input type="checkbox" id="gc-adm-autosend" disabled> Send new customers their portal link by e-mail</label><span id="gc-adm-autosend-msg" class="w"></span>';""",
       """<input type="checkbox" id="gc-adm-autosend" disabled> Send new customers their portal link by e-mail</label><span id="gc-adm-autosend-msg" class="w"></span>'
    + '<div id="gc-adm-card" style="margin-top:10px;border-top:1px solid #e2e8f0;padding-top:8px"><div style="font-weight:700">💳 Credit card payments <span id="gc-adm-card-st" class="w"></span></div>'
    + '<div class="w" style="margin:2px 0 6px">When you sign up with a card company (Stripe, Square, QuickBooks Payments…), paste its pay link here. Until then the portal says "We do not take credit cards yet."</div>'
    + '<input id="gc-adm-card-url" type="url" placeholder="https://… (the card company\\u2019s pay link)" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #cbd5e1;border-radius:8px;margin-bottom:6px" disabled>'
    + '<input id="gc-adm-card-note" type="text" maxlength="240" placeholder="How to pay by card (optional), e.g. Put your invoice number in the memo. A 3% card fee applies." style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #cbd5e1;border-radius:8px" disabled>'
    + '<div style="display:flex;gap:8px;margin-top:6px"><button type="button" class="gc-adm-btn" id="gc-adm-card-save" disabled>Save</button><button type="button" class="gc-adm-btn ghost" id="gc-adm-card-off" disabled>No credit cards</button></div></div>';   /* patch PAYCARD */""")
sub(I, """      .then(function(r){ return r.json(); }).then(function(j){ if (j && j.ok) { a.checked = j.autoSend !== false; a.disabled = false; } else {""",
       """      .then(function(r){ return r.json(); }).then(function(j){ if (j && j.ok) { a.checked = j.autoSend !== false; a.disabled = false; try { cardPaint(m, j.card); } catch (_c) {} } else {""")
sub(I, "function wireEmbeds(m){\n",
       """/* patch PAYCARD: ⚙ Admin → 💳 Credit card payments (the portal's "How to pay") */
function cardPaint(m, c){
  c = c || {}; var u = m.querySelector('#gc-adm-card-url'), n = m.querySelector('#gc-adm-card-note'), sv = m.querySelector('#gc-adm-card-save'), of = m.querySelector('#gc-adm-card-off'), st = m.querySelector('#gc-adm-card-st');
  if (!u) return;
  u.value = s(c.url); n.value = s(c.note); [u, n, sv, of].forEach(function(x){ x.disabled = false; });
  st.textContent = c.url ? ' — ON: customers see 💳 Pay by credit card' : ' — none yet: customers see "We do not take credit cards yet"';
  function save(card){ sv.disabled = of.disabled = true;
    fetch('/.netlify/functions/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'settings', set: { card: card } }) })
      .then(function(r){ return r.json(); }).then(function(j){ if (j && j.ok) { cardPaint(m, j.card); toast(j.card && j.card.url ? '💳 Saved — the customer portal now says "We accept credit cards".' : 'Saved — the portal says "We do not take credit cards yet".'); } else { sv.disabled = of.disabled = false; toast((j && j.error) || 'Could not save.'); } })
      .catch(function(){ sv.disabled = of.disabled = false; toast('Could not reach the portal server.'); }); }
  sv.onclick = function(){ var v = s(u.value).trim(); if (v && !/^https:\\/\\//.test(v)) { toast('The pay link must start with https://'); return; } save({ url: v, note: s(n.value).trim() }); };
  of.onclick = function(){ save({ url: '', note: '' }); };
}
function wireEmbeds(m){
""")
print('PAYCARD applied')
