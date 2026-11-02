/* portal-claimhelp.js — patch CLAIMHELP: draws "🛡 Your insurance claim" from the portal's view.claimHelp
   (netlify/functions/_lib/claimhelp.js builds it on the server; this file only draws it).
   The customer portal (portal.html, Home) and the CRM's "What the customer sees" preview use the same drawing.
     GCClaimHelp.card(ch, opts)        → <section class="card" id="gc-claimhelp"> (portal: the page's own card styles)
     GCClaimHelp.mount(host, ch, opts) → the same card inside a shadow root with the portal's look (the CRM preview)
   opts: { extra: view.insurance.claim (type of loss, deductible, adjuster visit, mortgage — when the job has them),
           onAsk: function(){ … } ("Ask us a question" → the portal's Messages), preview: true (nothing to send) }
   Never draws an insurance carrier's name: the server sends none, and the claim box always says "your insurance company". */
(function(){
'use strict';
if (window.GCClaimHelp) return;
var D = document;
var CSS = '' +
  '#gc-claimhelp .gch-intro{margin:0}' +
  '#gc-claimhelp .gch-note{border:1px solid var(--gold,#D4A017);background:var(--goldBg,#FCF0CF);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;font-size:14px;line-height:1.45}' +
  '#gc-claimhelp .gch-note b{font-size:12px;letter-spacing:.03em;text-transform:uppercase;color:var(--goldDk,#8A5A00)}' +
  '#gc-claimhelp .gch-note span{white-space:pre-wrap;overflow-wrap:anywhere}' +
  '#gc-claimhelp .gch-claim{border:1px solid var(--rule,#EFEAE0);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}' +
  '#gc-claimhelp dl.gch-info{margin:0;display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 12px;font-size:14px}' +
  '#gc-claimhelp dl.gch-info dt{color:var(--mute,#55626F)}#gc-claimhelp dl.gch-info dd{margin:0;font-weight:600;overflow-wrap:anywhere}' +
  '#gc-claimhelp h3{margin:6px 0 0;font-size:14px;font-weight:700}' +
  '#gc-claimhelp ol.gch-steps{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}' +
  '#gc-claimhelp .gch-step{border:1px solid var(--rule,#EFEAE0);border-radius:10px;background:#fff}' +
  '#gc-claimhelp .gch-step[data-state="now"]{border:2px solid var(--gold,#D4A017);background:var(--goldBg,#FCF0CF)}' +
  '#gc-claimhelp .gch-step summary{list-style:none;display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 10px;cursor:pointer;font-size:14px;font-weight:600}' +
  '#gc-claimhelp .gch-step summary::-webkit-details-marker{display:none}' +
  '#gc-claimhelp .gch-dot{flex:0 0 26px;width:26px;height:26px;border-radius:13px;border:2px solid var(--soft,#C9D3DF);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--mute,#55626F);background:#fff}' +
  '#gc-claimhelp .gch-step[data-state="done"] .gch-dot{background:var(--green,#1D5E2C);border-color:var(--green,#1D5E2C);color:#fff}' +
  '#gc-claimhelp .gch-step[data-state="now"] .gch-dot{background:var(--gold,#D4A017);border-color:var(--gold,#D4A017);color:var(--navy,#0F1D2F)}' +
  '#gc-claimhelp .gch-t{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}' +
  '#gc-claimhelp .gch-step[data-state="done"] .gch-t{color:var(--mute,#55626F)}' +
  '#gc-claimhelp .gch-here{flex:0 0 auto;font-size:12px;font-weight:700;color:var(--navy,#0F1D2F);background:var(--gold,#D4A017);border-radius:999px;padding:3px 9px;white-space:nowrap}' +
  '#gc-claimhelp .gch-chev{flex:0 0 auto;color:var(--mute,#55626F);font-size:12px;transition:transform .15s}' +
  '#gc-claimhelp details[open]>summary .gch-chev{transform:rotate(180deg)}' +
  '#gc-claimhelp .gch-body{padding:0 12px 12px 46px;display:flex;flex-direction:column;gap:8px;font-size:14px;line-height:1.5}' +
  '#gc-claimhelp .gch-body p{margin:0}#gc-claimhelp .gch-body b{display:block;font-size:12px;letter-spacing:.03em;text-transform:uppercase;color:var(--goldDk,#8A5A00)}' +
  '#gc-claimhelp .gch-qa{display:flex;flex-direction:column;border-top:1px solid var(--rule,#EFEAE0)}' +
  '#gc-claimhelp .gch-qa details{border-bottom:1px solid var(--rule,#EFEAE0)}' +
  '#gc-claimhelp .gch-qa summary{list-style:none;display:flex;align-items:center;gap:10px;min-height:48px;padding:8px 2px;cursor:pointer;font-size:15px;font-weight:600;line-height:1.35}' +
  '#gc-claimhelp .gch-qa summary::-webkit-details-marker{display:none}' +
  '#gc-claimhelp .gch-qa summary span{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}' +
  '#gc-claimhelp .gch-qa .gch-a{margin:0 0 12px;font-size:14px;line-height:1.55;color:var(--ink,#14202E);white-space:pre-wrap;overflow-wrap:anywhere}' +
  '#gc-claimhelp .gch-foot{margin:2px 0 0;font-size:12px;color:var(--mute,#55626F);line-height:1.45}' +
  '#gc-claimhelp .gch-ask{width:100%}' +
  '#gc-claimhelp summary:focus-visible{outline:3px solid var(--gold,#D4A017);outline-offset:2px;border-radius:8px}';
/* the portal's own look, for the CRM preview (inside a shadow root nothing of the CRM's styles reaches it) */
var BASE = ':host{all:initial;display:block}' +
  '.gch-page{--navy:#0F1D2F;--navy2:#1A3A5F;--gold:#D4A017;--goldDk:#8A5A00;--goldBg:#FCF0CF;--bg:#F6F3EC;--ink:#14202E;--mute:#55626F;--soft:#C9D3DF;--rule:#EFEAE0;--green:#1D5E2C;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;padding:14px;box-sizing:border-box}' +
  '.gch-page *{box-sizing:border-box}' +
  '.card{background:#fff;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;box-shadow:0 1px 2px rgba(15,29,47,.08);min-width:0}' +
  '.card h2{margin:0;font-size:16px;font-weight:700}.row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}' +
  '.muted{color:var(--mute);font-size:13px;line-height:1.45}.pill{font-size:12px;font-weight:600;padding:4px 8px;border-radius:999px;white-space:nowrap}.pill.now{color:var(--goldDk);background:var(--goldBg)}.pill.ins{color:#fff;background:var(--navy2)}' +
  '.btn{min-height:44px;border-radius:10px;border:1px solid var(--navy2);background:#fff;color:var(--navy2);font-weight:600;font-size:15px;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;padding:0 14px;cursor:pointer;text-align:center}' +
  '.btn.gold{background:var(--gold);border-color:var(--gold);color:var(--navy);font-weight:700}a{color:var(--navy2)}';

function s(v){ return v == null ? '' : String(v).trim(); }
function h(tag, attrs, kids){
  var e = D.createElement(tag);
  if (attrs) for (var k in attrs) {
    if (!Object.prototype.hasOwnProperty.call(attrs, k) || attrs[k] == null || attrs[k] === false) continue;
    if (k === 'text') e.textContent = attrs[k];
    else if (k === 'on') for (var ev in attrs.on) e.addEventListener(ev, attrs.on[ev]);
    else e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
  }
  (kids || []).forEach(function(c){ if (c == null) return; e.appendChild(typeof c === 'string' ? D.createTextNode(c) : c); });
  return e;
}
function dt(v){ if (!v) return ''; var d = new Date(String(v).length === 10 ? v + 'T12:00:00' : v); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function usd(n){ n = Number(n) || 0; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function tel(p){ return 'tel:' + String(p || '').replace(/[^0-9+]/g, ''); }
function css(){
  if (D.getElementById('gc-claimhelp-css')) return;
  var st = D.createElement('style'); st.id = 'gc-claimhelp-css'; st.textContent = CSS;
  (D.head || D.documentElement).appendChild(st);
}

function card(ch, opts){
  opts = opts || {}; ch = ch || {};
  if (!opts.noCss) css();
  var ex = opts.extra || {}, c = ch.claim || {};
  var box = h('section', { class: 'card', id: 'gc-claimhelp', 'data-now': ch.now != null ? String(ch.now) : '-1', 'aria-label': 'Your insurance claim' });
  box.appendChild(h('div', { class: 'row' }, [h('h2', { text: ch.title || '🛡 Your insurance claim' }),
    h('span', { class: 'pill ' + (ch.nowTitle ? 'now' : 'ins'), 'data-gch': 'pill', text: ch.nowTitle ? 'Now: ' + ch.nowTitle : 'Insurance claim' })]));
  if (ch.intro) box.appendChild(h('p', { class: 'muted gch-intro', text: ch.intro }));
  if (s(ch.note)) box.appendChild(h('div', { class: 'gch-note', 'data-gch': 'note' }, [h('b', { text: 'A note from GrayCo' + (ch.noteAt ? ' · ' + dt(ch.noteAt) : '') }), h('span', { text: ch.note })]));

  /* the claim box (read-only) — never the carrier's name */
  var rows = [];
  function row(k, v){ if (v) { rows.push(h('dt', { text: k })); rows.push(h('dd', { text: v })); } }
  row('Claim number', c.number);
  row('Date of loss', dt(c.dateOfLoss));
  row('Type of loss', ex.lossType);
  row('Your deductible', ex.deductible != null && Number(ex.deductible) > 0 ? usd(ex.deductible) : '');
  if (rows.length || c.adjuster) row('Insurance', 'Your insurance company');
  if (c.adjuster) row('Adjuster', [c.adjuster.name, c.adjuster.phone].filter(Boolean).join(' · '));
  row('Adjuster visit', dt(ex.adjusterMeeting));
  row('Mortgage company', ex.mortgage);
  box.appendChild(h('div', { class: 'gch-claim', 'data-gch': 'claim' }, [
    rows.length ? h('dl', { class: 'gch-info' }, rows) : h('div', { class: 'muted', text: 'Your claim number and details show here as soon as we have them.' }),
    c.adjuster && c.adjuster.phone ? h('a', { class: 'btn', href: tel(c.adjuster.phone), text: 'Call the adjuster' }) : null]));

  /* the steps, with "You are here" */
  var steps = ch.steps || [];
  if (steps.length) {
    box.appendChild(h('h3', { text: 'Step by step' }));
    if (!(ch.now >= 0)) box.appendChild(h('div', { class: 'muted', text: 'Your Project Manager marks where your claim is as it moves along.' }));
    var ol = h('ol', { class: 'gch-steps', 'data-gch': 'steps' });
    steps.forEach(function(st, i){
      var d = h('details', { class: 'gch-step', 'data-state': st.state || 'todo', 'data-id': st.id || '' });
      if (st.state === 'now') d.open = true;
      var sum = h('summary', null, [h('span', { class: 'gch-dot', 'aria-hidden': 'true', text: st.state === 'done' ? '✓' : String(i + 1) }),
        h('span', { class: 'gch-t', text: st.title + (st.state === 'done' ? ' — done' : '') }),
        st.state === 'now' ? h('span', { class: 'gch-here', 'data-gch': 'here', text: 'You are here' }) : null,
        h('span', { class: 'gch-chev', 'aria-hidden': 'true', text: '▾' })]);
      d.appendChild(sum);
      d.appendChild(h('div', { class: 'gch-body' }, [
        st.you ? h('p', null, [h('b', { text: 'What you do' }), st.you]) : null,
        st.us ? h('p', null, [h('b', { text: 'What GrayCo does' }), st.us]) : null]));
      ol.appendChild(h('li', null, [d]));
    });
    box.appendChild(ol);
  }

  /* questions & answers */
  var qa = ch.qa || [];
  if (qa.length) {
    box.appendChild(h('h3', { text: 'Questions & answers' }));
    var list = h('div', { class: 'gch-qa', 'data-gch': 'qa' });
    qa.forEach(function(x){
      list.appendChild(h('details', null, [h('summary', null, [h('span', { text: x.q }), h('span', { class: 'gch-chev', 'aria-hidden': 'true', text: '▾' })]), h('p', { class: 'gch-a', text: x.a })]));
    });
    box.appendChild(list);
  }
  box.appendChild(h('button', { type: 'button', class: 'btn gold gch-ask', id: 'gch-ask', text: '💬 Ask us a question', on: { click: function(){ try { if (opts.onAsk) opts.onAsk(); } catch (e) {} } } }));
  var ct = ch.contact || {};
  if (ct.phone || ct.email) box.appendChild(h('div', { class: 'muted' }, ['Or call ', h('a', { href: tel(ct.phone), text: ct.phone }), ct.email ? ' · ' : '', ct.email ? h('a', { href: 'mailto:' + ct.email, text: ct.email }) : null]));
  box.appendChild(h('p', { class: 'gch-foot', 'data-gch': 'footer', text: ch.footer || 'General information, not legal or insurance advice.' }));
  return box;
}
/* the CRM preview: the same card in a shadow root, on the portal's background */
function mount(host, ch, opts){
  opts = Object.assign({}, opts || {}, { noCss: true });
  var root = host.shadowRoot || host.attachShadow({ mode: 'open' });
  root.innerHTML = '';
  var st = D.createElement('style'); st.textContent = BASE + CSS; root.appendChild(st);
  var page = D.createElement('div'); page.className = 'gch-page';
  page.appendChild(card(ch, opts)); root.appendChild(page);
  return root;
}
window.GCClaimHelp = { card: card, mount: mount, css: function(){ return CSS; } };
})();
