/* GrayCo customer portal — patch X9: "How did you hear about us?" (one tap) and 🛠 Maintenance plans.
   Everything goes through /.netlify/functions/portal-plus with the same link code (or the signed-in session) as the
   rest of the portal; the server checks every input. Both cards sit on Home, under "Your selections", and survive
   the page redrawing. Never on the sub portal. */
(function(){
'use strict';
if (window.__GC_PPLUS__) return; window.__GC_PPLUS__ = true;
var FN = '/.netlify/functions/portal-plus', OFFICE = '901-585-0944';
var token = '';
try { var m = /(?:^#|&)t=([A-Za-z0-9_-]{20,80})/.exec(location.hash || ''); if (m) token = m[1]; } catch (e) {}
try { if (!token) token = localStorage.getItem('gc_portal_t') || ''; } catch (e) {}
var PREVIEW = /(?:^#|&)p=1(?:&|$)/.test(location.hash || '');
function sess(){ try { return token ? '' : (localStorage.getItem('gc_portal_s') || ''); } catch (e) { return ''; } }
function pid(){ try { return String(window.PID || ''); } catch (e) { return ''; } }
var D = null, cards = [], started = false, lastPid = '', busy = false, pad = null, note = { heard: '', maint: '' }, open = {}, keep = { name: '', ok: false, who: '' };

function h(tag, attrs, kids){
  var el = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function(k){
    var v = attrs[k]; if (v == null || v === false) return;
    if (k === 'text') el.textContent = v;
    else if (k === 'on') Object.keys(v).forEach(function(e){ el.addEventListener(e, v[e]); });
    else if ((k === 'href' || k === 'src') && !/^https:\/\//i.test(String(v))) return;
    else el.setAttribute(k, v === true ? '' : String(v));
  });
  (kids || []).forEach(function(c){ if (c == null || c === false) return; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return el;
}
function usd(n){ n = Number(n) || 0; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function dt(s){ var d = new Date(String(s).length === 10 ? s + 'T12:00:00' : s); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); }
function api(body){
  return fetch(FN, { method: 'POST', headers: sess() ? { 'Content-Type': 'application/json', 'x-portal-session': sess() } : { 'Content-Type': 'application/json', 'x-portal-token': token },
    body: JSON.stringify(Object.assign(PREVIEW ? { preview: true } : {}, sess() ? { projectId: pid() || undefined } : {}, body)), cache: 'no-store', credentials: 'omit' })
    .then(function(r){ return r.json().catch(function(){ return null; }).then(function(j){ return { status: r.status, data: j || {} }; }); }, function(){ return { status: 0, data: { error: 'No connection — check your signal and try again.' } }; });
}
function load(){ return api({ action: 'view' }).then(function(r){ if (r.data && r.data.ok) { D = r.data; paint(); } }); }
function css(){
  if (document.getElementById('gc-pplus-css')) return;
  var st = document.createElement('style'); st.id = 'gc-pplus-css';
  st.textContent = '.pp-opts{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.pp-opt{border:1px solid #E2DCCD;background:#fff;border-radius:999px;padding:9px 14px;font:600 14px Arial,sans-serif;color:#0F1D2F;cursor:pointer;min-height:44px}' +
    '.pp-opt.on{background:#0F1D2F;color:#fff;border-color:#0F1D2F}.pp-plan{border:1px solid #E2DCCD;border-radius:12px;padding:12px 14px;margin:10px 0;background:#fffdf7}.pp-plan b{display:block;font-size:16px}' +
    '.pp-plan p{margin:6px 0;font-size:14px;line-height:1.45}.pp-price{font:800 20px Arial,sans-serif;color:#0F1D2F;margin:6px 0}.pp-msg{font-size:14px;margin-top:8px;min-height:1em}.pp-in{width:100%;box-sizing:border-box;border:1px solid #cfc8b6;border-radius:8px;padding:10px;font-size:16px;margin:6px 0}' +
    '.pp-pad{display:block;width:100%;max-width:600px;aspect-ratio:3/1;border:1px dashed #b8b0a0;border-radius:8px;background:#fff;touch-action:none;margin:6px 0}.pp-st{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:3px 9px;background:#eef6ee;color:#1f6b33}.pp-st.now{background:#fff4e0;color:#8a5a00}' +
    '.pp-freq{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:3px 10px;background:#e8eef6;color:#0F1D2F;margin:4px 6px 0 0}.pp-freq.gold{background:#fef3c7;color:#7c4a03}.pp-sub{font-size:16px;margin:18px 0 6px;color:#0F1D2F}' +
    /* GrayCo Care (design pass): navy #0F1D2F, gold #D4A017, white cards, big readable type, no sideways scroll */
    '.gc-care{overflow:hidden}.gc-care *{box-sizing:border-box;max-width:100%}.care-hero{background:linear-gradient(135deg,#0F1D2F 0%,#1d3557 100%);color:#fff;border-radius:16px;padding:22px 18px;margin:-4px 0 14px}' +
    '.care-kicker{color:#D4A017;font:800 12px Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase}.care-h1{font:800 24px/1.2 Arial,sans-serif;margin:6px 0}.care-sub{font-size:15px;line-height:1.45;color:#dbe4f0}' +
    '.care-tog{display:inline-flex;background:#eef2f7;border-radius:999px;padding:4px;margin:6px 0 12px}.care-tog button{border:0;background:transparent;border-radius:999px;padding:10px 18px;font:700 15px Arial,sans-serif;color:#0F1D2F;min-height:44px;cursor:pointer}.care-tog button.on{background:#0F1D2F;color:#fff}' +
    '.care-tiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:0 0 14px}.care-tier{position:relative;background:#fff;border:1px solid #E2DCCD;border-radius:16px;padding:18px 16px}.care-tier.pop{border:2px solid #D4A017;box-shadow:0 8px 24px rgba(212,160,23,.18)}.care-tier.mine{outline:3px solid #1d4ed8}' +
    '.care-pop{position:absolute;top:-11px;left:16px;background:#D4A017;color:#0F1D2F;font:800 11px Arial,sans-serif;border-radius:999px;padding:4px 10px;text-transform:uppercase;letter-spacing:.06em}.care-tn{font:800 19px Arial,sans-serif;color:#0F1D2F}.care-tp{font:800 22px Arial,sans-serif;color:#1d4ed8;margin:4px 0 8px}' +
    '.care-tier ul{margin:0;padding-left:18px;font-size:15px;line-height:1.5}.care-plan{background:#fff;border:1px solid #E2DCCD;border-radius:16px;padding:16px;margin:12px 0}.care-ph b{display:block;font-size:17px;color:#0F1D2F}.care-plan p{font-size:15px;line-height:1.5;margin:8px 0}' +
    '.care-link{display:inline-block;margin-top:8px;color:#1d4ed8;font-weight:700}.care-sign{background:#fffdf7;border:2px solid #D4A017;border-radius:16px;padding:16px;margin:14px 0}.care-sum{padding-left:18px;font-size:15px;line-height:1.55;margin:6px 0 10px}.care-go{display:block;width:100%;font-size:18px;min-height:52px;margin-top:10px}' +
    '.care-sh{font:800 16px Arial,sans-serif;color:#0F1D2F;margin:14px 0 6px}.care-status{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;align-items:center;background:#fff;border:1px solid #E2DCCD;border-radius:16px;padding:16px;margin:0 0 10px}' +
    '.care-badge{display:inline-block;font:800 15px Arial,sans-serif;border-radius:999px;padding:8px 14px;background:#f1e3c4;color:#5b3a00;justify-self:start}.care-badge.t-silver{background:#e5e7eb;color:#1f2937}.care-badge.t-gold{background:#D4A017;color:#0F1D2F}.care-big{font:800 20px Arial,sans-serif;color:#0F1D2F}.care-count{color:#1d4ed8;font-weight:700}' +
    '.care-pm{display:flex;gap:10px;align-items:center}.care-av{display:inline-flex;width:44px;height:44px;border-radius:50%;background:#0F1D2F;color:#D4A017;font:800 18px Arial,sans-serif;align-items:center;justify-content:center;flex:none}' +
    '.care-sos{display:block;text-align:center;background:#b91c1c;color:#fff!important;font:800 18px Arial,sans-serif;border-radius:14px;padding:16px;margin:10px 0;text-decoration:none;min-height:52px}' +
    '.care-tl{border-left:3px solid #D4A017;margin-left:8px;padding-left:16px}.care-ti{position:relative;margin:0 0 14px}.care-dot{position:absolute;left:-24px;top:4px;width:13px;height:13px;border-radius:50%;background:#0F1D2F;border:2px solid #fff}' +
    '.care-strip{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:4px;-webkit-overflow-scrolling:touch}.care-strip img{flex:none;width:160px;height:120px;object-fit:cover;border-radius:10px;scroll-snap-align:start;background:#eef2f7}' +
    '.care-ok{list-style:none;padding:0;margin:6px 0;font-size:15px;line-height:1.6}.care-ok li.done{color:#166534;font-weight:700}.care-rep{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;background:#fffbeb;border:1px solid #f59e0b;border-radius:12px;padding:12px;margin:8px 0}.care-rp{display:flex;flex-direction:column;align-items:flex-end;gap:6px}' +
    '.care-hd{background:#f8fafc;border:1px solid #dbe4f0;border-radius:12px;padding:12px;margin:10px 0}.care-inv{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;border-bottom:1px solid #eee;padding:8px 0}' +
    '.care-docs{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.care-doc{display:flex;flex-direction:column;gap:4px;background:#fff;border:1px solid #E2DCCD;border-radius:14px;padding:14px;color:#0F1D2F;text-decoration:none}.care-di{font-size:24px}' +
    '.care-al{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:15px;min-height:44px}.care-al input{width:22px;height:22px;flex:none;margin-top:2px}.care-al>span:nth-child(2){flex:1}.care-tot{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;margin-top:10px}' +
    '.care-ref{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;background:#eef6ee;border-radius:14px;padding:14px;margin:12px 0}.care-ref span{flex:1 1 220px;font-size:15px}.gc-care .btn{min-height:44px}';   /* patch MAINTPLUS design pass */   /* patch MAINTPLANS */
  document.head.appendChild(st);
}
function makePad(){
  var cv = h('canvas', { class: 'pp-pad', width: '600', height: '200', 'aria-label': 'Draw your signature here' });
  var ctx = cv.getContext('2d'), strokes = [], cur = null;
  function pt(e){ var r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(600, (e.clientX - r.left) * 600 / r.width)), Math.max(0, Math.min(200, (e.clientY - r.top) * 200 / r.height))]; }
  function redraw(){ ctx.clearRect(0, 0, 600, 200); ctx.strokeStyle = '#0F1D2F'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    strokes.forEach(function(st){ ctx.beginPath(); st.forEach(function(p, i){ if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); if (st.length === 1) ctx.lineTo(st[0][0] + 1, st[0][1]); ctx.stroke(); }); }
  cv.addEventListener('pointerdown', function(e){ if (strokes.length >= 38) return; e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) {} cur = [pt(e)]; strokes.push(cur); redraw(); });
  cv.addEventListener('pointermove', function(e){ if (!cur || cur.length >= 590) return; e.preventDefault(); var p = pt(e), l = cur[cur.length - 1]; if (Math.abs(p[0] - l[0]) + Math.abs(p[1] - l[1]) < 2) return; cur.push(p); redraw(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function(n){ cv.addEventListener(n, function(){ cur = null; }); });
  return { el: cv, strokes: function(){ return strokes.map(function(st){ return st.map(function(p){ return [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]; }); }); }, clear: function(){ strokes = []; cur = null; redraw(); } };
}

/* ── 🙋 How did you hear about us? (shown until answered, then a thank-you) ── */
function heardCard(){
  var H = D.heard || {}, c = h('section', { class: 'card', id: 'gcpp-heard' });
  if (H.answer && !note.heard) return null;
  c.appendChild(h('div', { class: 'row' }, [h('h2', { text: '🙋 How did you hear about us?' })]));
  if (note.heard) { c.appendChild(h('div', { class: 'pp-msg', text: note.heard })); return c; }
  c.appendChild(h('div', { class: 'muted', text: 'One tap helps a small local business a lot — thank you!' }));
  var g = h('div', { class: 'pp-opts', role: 'group', 'aria-label': 'How did you hear about us?' }), msg = h('div', { class: 'pp-msg', role: 'status' });
  var whoIn = h('input', { class: 'pp-in', type: 'text', maxlength: '80', placeholder: 'Who referred you? (so we can thank them)', id: 'gcpp-who' }); whoIn.value = keep.who; whoIn.addEventListener('input', function(){ keep.who = whoIn.value; });
  var whoBox = h('div', { hidden: true }, [whoIn, h('button', { type: 'button', class: 'btn gold', text: 'Send', on: { click: function(){ send('A friend or neighbor (referral)', whoIn.value); } } })]);
  function send(ans, who){
    if (busy || PREVIEW) { if (PREVIEW) msg.textContent = 'Preview — only the customer can answer.'; return; }
    busy = true; msg.textContent = 'Saving…';
    api({ action: 'heard', answer: ans, who: who || '' }).then(function(r){ busy = false; if (r.data && r.data.ok) { note.heard = '✓ Thank you!' + (r.data.who ? ' We will thank ' + r.data.who + ' too.' : ''); D.heard.answer = r.data.answer; paint(); setTimeout(function(){ note.heard = ''; paint(); }, 6000); } else msg.textContent = (r.data && r.data.error) || 'That did not work — please try again.'; });
  }
  (H.opts || []).forEach(function(o){
    g.appendChild(h('button', { type: 'button', class: 'pp-opt', 'data-heard': o, text: o, on: { click: function(){ if (/referral/i.test(o)) { whoBox.hidden = false; whoIn.focus(); return; } send(o); } } }));
  });
  c.appendChild(g); c.appendChild(whoBox); c.appendChild(msg);
  return c;
}

/* ── 🛠 GrayCo Care: the maintenance plans (design pass — phone first: hero, tier cards, monthly / yearly, à la carte,
   one "Sign & start", the agreement in plain words; after signing, the "Your GrayCo Care" dashboard) ── */
var ui = { billing: 'yearly', pick: {}, open: '' };
function initials(n){ return String(n || '?').trim().charAt(0).toUpperCase() || '?'; }
function daysTo(d){ var t = Date.parse(String(d).slice(0, 10) + 'T12:00:00'); return isFinite(t) ? Math.round((t - Date.now()) / 864e5) : null; }
function priceOf(k){ return ui.billing === 'monthly' ? usd(Math.ceil((Number(k.price) || 0) / 12 * 100) / 100) + ' a month' : usd(k.price) + ' per year'; }
function maintCard(){
  var M = D.maint || {}; if (!M.offered) return null;
  var cs = M.contracts || [], byPlan = {}; cs.forEach(function(x){ if (!byPlan[x.planId] || byPlan[x.planId].status === 'declined') byPlan[x.planId] = x; });   /* an open plan wins over an old "No thanks" */
  var signed = cs.filter(function(x){ return x.status === 'signed'; }), quoted = cs.filter(function(x){ return x.status === 'quoted'; }), chosen = cs.filter(function(x){ return /^(requested|quoted|signed)$/.test(x.status); });
  var c = h('section', { class: 'card gc-care', id: 'gcpp-maint' });
  var com = M.market === 'commercial', where = (D.job && (D.job.address || D.job.name)) || '';
  c.appendChild(h('div', { class: 'care-hero' }, [h('div', { class: 'care-kicker', text: 'GrayCo Care' }), h('div', { class: 'care-h1', text: signed.length ? 'Your GrayCo Care' : (com ? 'Protect your building' : 'Protect your home') }),
    h('div', { class: 'care-sub', text: signed.length ? 'Thank you for letting GrayCo take care of ' + (com ? 'your building.' : 'your home.') : 'Small fixes on the spot and a photo report after every visit — so little things never become big repairs.' })]));
  c.appendChild(h('div', { class: 'row' }, [h('h2', { text: '🛠 Your maintenance plans' }), signed.length ? h('span', { class: 'pill ok', text: 'You are covered' }) : null]));
  if (PREVIEW) c.appendChild(h('div', { class: 'muted', text: 'Preview — only the customer can ask or sign.' }));
  if (signed.length) dashboard(c, M, signed);
  if (quoted.length || !signed.length) offer(c, M, cs, byPlan, chosen, quoted);
  if (note.maint) c.appendChild(h('div', { class: 'pp-msg', role: 'status', text: note.maint }));
  c.appendChild(h('div', { class: 'muted', text: 'Questions about a plan? Call your Project Manager or the office at ' + OFFICE + '.' }));
  return c;
}
function dashboard(c, M, signed){
  var nv = []; signed.forEach(function(k){ (k.visits || []).forEach(function(v){ if (v.status === 'planned') nv.push({ v: v, k: k }); }); }); nv.sort(function(a, b){ return a.v.date < b.v.date ? -1 : 1; });
  var next = nv[0], dd = next ? daysTo(next.v.date) : null, pri = signed.some(function(k){ return k.priority; });
  var st = h('div', { class: 'care-status', 'data-status': '1' }, [
    h('div', { class: 'care-badge t-' + (M.member ? M.member.tier : 'bronze'), text: '🏅 ' + (M.member ? M.member.name : 'Bronze') }),
    h('div', { class: 'care-next' }, [h('div', { class: 'muted', text: 'Next visit' }), h('div', { class: 'care-big', text: next ? (next.v.oncall ? 'On call from ' + dt(next.v.date) : dt(next.v.date)) : 'We will call to set it' }),
      next && dd != null && !next.v.oncall ? h('div', { class: 'care-count', text: dd > 1 ? 'in ' + dd + ' days' : dd === 1 ? 'tomorrow' : dd === 0 ? 'today' : 'we will call you to set the time' }) : null]),
    M.pm ? h('div', { class: 'care-pm' }, [h('span', { class: 'care-av', text: M.pm.initial }), h('span', null, [h('b', { text: M.pm.name }), h('br'), h('span', { class: 'muted', text: 'Your Project Manager' })])]) : null]);
  c.appendChild(st);
  if (M.member) c.appendChild(h('div', { class: 'muted', 'data-member': M.member.tier, text: M.member.discount + '% off repairs · ' + M.member.perks + (M.member.note ? ' · ' + M.member.note : '') }));
  if (pri) c.appendChild(h('a', { class: 'care-sos', href: 'tel:' + String(M.phone || OFFICE).replace(/\D/g, ''), text: '🚨 Emergency? Call GrayCo now' }));
  signed.forEach(function(k){
    var box = h('div', { class: 'care-plan', 'data-plan': k.planId }, [h('div', { class: 'care-ph' }, [h('b', { text: k.planName }), h('span', { class: 'pp-freq', text: k.freqLabel || '' }), k.priority ? h('span', { class: 'pp-freq gold', text: '⭐ Priority: snow + emergency' }) : null]),
      h('div', { class: 'care-line' }, [h('span', { class: 'pp-st', text: '✓ Signed by ' + (k.signName || 'you') + ' on ' + dt(k.signedAt) + ' · ' + usd(k.price) + ' / year' + (k.billing === 'monthly' ? ' (' + usd(k.monthly) + ' a month)' : k.billsPerYear > 1 ? ' (' + usd(Math.round(k.price * 100 / k.billsPerYear) / 100) + ' every ' + (12 / k.billsPerYear) + ' months)' : '') }),
        k.tier ? h('span', { class: 'pp-freq', text: '🏅 ' + k.tier.charAt(0).toUpperCase() + k.tier.slice(1) }) : null,
        h('span', { class: 'pp-freq', text: k.autoRenew ? 'Renews automatically (you said yes)' : 'We ask you before each renewal' })])]);
    var vv = (k.visits || []), nx = vv.filter(function(v){ return v.status === 'planned'; })[0];
    if (nx || k.nextVisit) box.appendChild(h('p', { text: nx && nx.oncall ? 'On call from ' + dt(nx.date) + ' — when snow or ice hits we come.' : 'Next visit: ' + dt(nx ? nx.date : k.nextVisit) + ' — we will call before we come.' }));
    var done = vv.filter(function(v){ return v.status === 'done'; }).reverse();
    if (done.length) { var tl = h('div', { class: 'care-tl', 'data-visits': '1' });
      done.forEach(function(v){ var it = h('div', { class: 'care-ti' }, [h('div', { class: 'care-dot' }), h('div', null, [h('b', { text: dt(v.date) + (v.kind === 'handyman' ? ' · 🔧 Handyman Day' : '') }), v.note ? h('p', { text: v.note }) : h('p', { class: 'muted', text: 'Visit done.' })])]);
        if ((v.photos || []).length) { var strip = h('div', { class: 'care-strip' }); v.photos.forEach(function(f){ strip.appendChild(h('img', { src: f.url, alt: 'Visit photo', loading: 'lazy', decoding: 'async', width: '160', height: '120' })); }); it.lastChild.appendChild(strip); }
        if ((v.tasksDone || []).length) it.lastChild.appendChild(h('ul', { class: 'care-ok' }, v.tasksDone.map(function(t){ return h('li', { text: '✓ ' + t }); })));
        tl.appendChild(it); });
      box.appendChild(h('div', { class: 'care-sh', text: 'Visit timeline' })); box.appendChild(tl); }
    (k.repairs || []).forEach(function(r){ var m = h('span', { class: 'pp-msg' });
      box.appendChild(h('div', { class: 'care-rep', 'data-repair': '1' }, [h('div', null, [h('b', { text: '🔧 Repair we found · ' + dt(r.at) }), h('p', { text: r.desc })]), h('div', { class: 'care-rp' }, [h('b', { text: usd(r.net) }), r.discount ? h('span', { class: 'muted', text: r.discount + '% member discount off ' + usd(r.price) }) : null,
        r.status === 'approved' ? h('span', { class: 'pp-st', text: '✓ Approved — we will call to schedule' }) : h('button', { type: 'button', class: 'btn gold', 'data-repok': r.id, text: 'Approve quote', on: { click: function(e){ if (busy || PREVIEW) return; busy = true; e.target.disabled = true; api({ action: 'repair-ok', contractId: k.id, repairId: r.id }).then(function(x){ busy = false; if (x.data && x.data.ok) { note.maint = '✓ Thank you — we will call you to schedule the repair.'; load(); } else { m.textContent = (x.data && x.data.error) || 'Please call ' + OFFICE + '.'; e.target.disabled = false; } }); } } }), m])])); });
    if (k.handyman) hdBox(box, k);
    if ((k.invoices || []).length) { box.appendChild(h('div', { class: 'care-sh', text: 'Invoices' }));
      k.invoices.forEach(function(v){ box.appendChild(h('div', { class: 'care-inv' }, [h('span', { text: '#' + v.number + ' · ' + dt(v.at) }), h('b', { text: usd(v.amount) }), v.paid ? h('span', { class: 'pp-st', text: 'Paid' }) : h('button', { type: 'button', class: 'btn', text: 'Pay', on: { click: function(){ var b = document.querySelector('nav.tabs button[data-tab="pay"]'); if (b) b.click(); } } })])); }); }
    if (k.doc) box.appendChild(h('a', { class: 'btn', href: k.doc, target: '_blank', rel: 'noopener', text: '📄 Your signed plan' }));
    c.appendChild(box);
  });
  if ((M.docs || []).length) { c.appendChild(h('div', { class: 'care-sh', text: 'Reports & letters' }));
    var g = h('div', { class: 'care-docs' }); M.docs.forEach(function(d){ g.appendChild(h('a', { class: 'care-doc', href: (d.files[0] || {}).url || undefined, target: '_blank', rel: 'noopener' }, [h('span', { class: 'care-di', text: '📄' }), h('b', { text: d.title }), h('span', { class: 'muted', text: dt(d.at) })])); }); c.appendChild(g); }
  if (M.emready) { var er = M.emready, eb = h('div', { class: 'care-plan', 'data-emready': '1' }, [h('b', { text: '🚨 Emergency Ready — your building file' }), er.building ? h('p', { text: er.building }) : null]);
    (er.shutoffs || []).forEach(function(x){ eb.appendChild(h('p', { text: '⛔ ' + x.what + ' shutoff: ' + x.location })); });
    (er.contacts || []).forEach(function(x){ eb.appendChild(h('p', { text: '📞 ' + [x.name, x.role, x.phone].filter(Boolean).join(' · ') })); }); c.appendChild(eb); }
  c.appendChild(h('div', { class: 'care-ref' }, [h('b', { text: '🎁 Refer a neighbor' }), h('span', { text: M.refCredit ? 'When a neighbor you send signs up for a plan, you get a ' + usd(M.refCredit) + ' credit.' : 'Know someone who would like GrayCo Care? Send them our way.' }),
    h('button', { type: 'button', class: 'btn', text: 'Share', on: { click: function(){ var t = 'I use GrayCo Care for my ' + (M.market === 'commercial' ? 'building' : 'home') + ' — call ' + OFFICE + ' or visit https://grayco-cs.com'; try { if (navigator.share) return navigator.share({ text: t }); } catch (e) {} try { navigator.clipboard.writeText(t); note.maint = '✓ Copied — paste it to your neighbor.'; paint(); } catch (e) {} } } })]));
}
function hdBox(box, k){
  var hd = k.handyman, done = {}; (hd.done || []).forEach(function(t){ done[t] = 1; });
  var b = h('div', { class: 'care-hd', 'data-handyman': '1' }, [h('b', { text: '🔧 Handyman Day × ' + hd.days + ' a year · ' + hd.hours }), h('ul', { class: 'care-ok' }, (hd.tasks || []).map(function(t){ return h('li', { class: done[t] ? 'done' : '', text: (done[t] ? '✓ ' : '• ') + t }); })),
    h('p', { class: 'muted', text: 'Materials are billed separately. ' + hd.note })]);
  if (ui.open !== 'hd' + k.id) b.appendChild(h('button', { type: 'button', class: 'btn gold', 'data-hdopen': k.id, text: '📅 Book my Handyman Day', on: { click: function(){ ui.open = 'hd' + k.id; paint(); } } }));
  else { var it = h('textarea', { class: 'pp-in', rows: '4', id: 'gcpp-hditems', placeholder: 'What would you like done? (one thing a line)' }), wh = h('input', { class: 'pp-in', id: 'gcpp-hdwhen', placeholder: 'Best days for you (optional)' }), msg = h('div', { class: 'pp-msg', role: 'status' });
    var mats = h('div', { class: 'pp-opts', role: 'radiogroup', 'aria-label': 'Will materials be on site?' }, [['yes', 'Yes'], ['no', 'No'], ['pickup', 'Please pick them up (billed at cost)']].map(function(o){ return h('label', { class: 'pp-opt' }, [h('input', { type: 'radio', name: 'gcpp-mat', value: o[0] }), ' ' + o[1]]); }));
    b.appendChild(h('label', { for: 'gcpp-hditems', class: 'muted', text: 'What would you like done?' })); b.appendChild(it); b.appendChild(h('div', { class: 'muted', text: 'Will materials be on site? ' + hd.note })); b.appendChild(mats); b.appendChild(wh);
    b.appendChild(h('button', { type: 'button', class: 'btn gold', id: 'gcpp-hdsend', text: 'Send my request', on: { click: function(){ var m = (document.querySelector('input[name="gcpp-mat"]:checked') || {}).value; if (busy || PREVIEW) return; busy = true; msg.textContent = 'Sending…';
      api({ action: 'handyman-book', contractId: k.id, items: it.value, materials: m || '', when: wh.value }).then(function(r){ busy = false; if (r.data && r.data.ok) { ui.open = ''; note.maint = '✓ Thank you — your Project Manager will call to schedule your Handyman Day.'; load(); } else msg.textContent = (r.data && r.data.error) || 'Please call ' + OFFICE + '.'; }); } } }));
    b.appendChild(msg); }
  box.appendChild(b);
}
function offer(c, M, cs, byPlan, chosen, quoted){
  /* the tier cards (stacked on a phone) — the customer's quoted tier is marked; Silver is the popular one */
  var my = (quoted[0] && quoted[0].tier) || 'bronze';
  c.appendChild(h('div', { class: 'care-tog', role: 'group', 'aria-label': 'Billing' }, [['monthly', 'Monthly'], ['yearly', 'Yearly']].map(function(o){ return h('button', { type: 'button', class: ui.billing === o[0] ? 'on' : '', 'aria-pressed': ui.billing === o[0] ? 'true' : 'false', 'data-billing': o[0], text: o[1], on: { click: function(){ ui.billing = o[0]; paint(); } } }); })));
  if ((M.tiers || []).length) c.appendChild(h('div', { class: 'care-tiers' }, M.tiers.map(function(t){ return h('div', { class: 'care-tier t-' + t.id + (t.id === 'silver' ? ' pop' : '') + (t.id === my && quoted.length ? ' mine' : '') }, [
    t.id === 'silver' ? h('span', { class: 'care-pop', text: 'Most popular' }) : null, h('div', { class: 'care-tn', text: t.name }), h('div', { class: 'care-tp', text: 'from $' + t.monthly + '/mo' }),
    h('ul', null, [t.discount ? h('li', { text: t.discount + '% off repairs we find' }) : h('li', { text: 'Every plan customer starts here' }), h('li', { text: t.perks }), M.market === 'commercial' ? h('li', { text: '⭐ Priority emergency + snow' }) : h('li', { text: 'Photo report after every visit' }), t.note ? h('li', { text: t.note }) : null]),
    t.id === my && quoted.length ? h('div', { class: 'pp-st', text: 'Your plan' }) : null]); })));
  var all = (M.plans || []).slice(), info = {}; all.forEach(function(p){ info[p.id] = p; });
  var list = chosen.filter(function(x){ return x.status !== 'signed'; }).map(function(x){ var p = info[x.planId] || {}; return { id: x.planId, name: x.planName || p.name, includes: x.includes || p.includes || '', freqLabel: x.freqLabel || p.freqLabel || '', priority: !!x.priority }; })
    .concat(all.filter(function(p){ return !chosen.some(function(x){ return x.planId === p.id; }); }));
  var otherHead = false;
  list.forEach(function(p){
    var k = byPlan[p.id];
    if (!(k && /^(requested|quoted)$/.test(k.status)) && !otherHead) { otherHead = true; if (chosen.length) { c.appendChild(h('h3', { class: 'pp-sub', text: 'Other plans we offer' }));
      if (!ui.more) { c.appendChild(h('button', { type: 'button', class: 'btn', 'data-more': '1', text: 'See ' + list.filter(function(x){ var kk = byPlan[x.id]; return !(kk && /^(requested|quoted|signed)$/.test(kk.status)); }).length + ' more plans', on: { click: function(){ ui.more = true; paint(); } } })); } } }
    if (chosen.length && !ui.more && !(k && /^(requested|quoted)$/.test(k.status))) return;   /* the other plans stay folded until asked: no clutter */
    var box = h('div', { class: 'care-plan', 'data-plan': p.id }, [h('div', { class: 'care-ph' }, [h('b', { text: p.name }), p.freqLabel ? h('span', { class: 'pp-freq', text: p.freqLabel }) : null, p.priority ? h('span', { class: 'pp-freq gold', text: '⭐ Priority: snow + emergency' }) : null]), p.includes ? h('p', { text: p.includes }) : null]);
    if (!k || k.status === 'declined') {
      var ask = h('button', { type: 'button', class: 'btn', 'data-ask': p.id, text: k ? 'Ask for a quote again' : 'Request a quote' }), msg = h('div', { class: 'pp-msg', role: 'status' }); ask.disabled = PREVIEW;
      ask.addEventListener('click', function(){ if (busy) return; busy = true; ask.disabled = true; msg.textContent = 'Sending…';
        api({ action: 'maint-request', planId: p.id }).then(function(r){ busy = false; if (r.data && r.data.ok) { note.maint = '✓ Thank you — your Project Manager will price it for your home and it will show here.'; load(); } else { msg.textContent = (r.data && r.data.error) || 'That did not work — please call ' + OFFICE + '.'; ask.disabled = false; } }); });
      box.appendChild(ask); box.appendChild(msg);
    } else if (k.status === 'requested') box.appendChild(h('span', { class: 'pp-st now', text: '⏳ Quote requested ' + dt(k.requestedAt) + ' — your Project Manager will price it for your home' }));
    else if (k.status === 'quoted') {
      box.appendChild(h('div', { class: 'pp-price', text: priceOf(k) }));
      if (ui.billing === 'yearly' && k.billsPerYear > 1) box.appendChild(h('div', { class: 'muted', text: 'Billed ' + k.billsPerYear + ' times a year: ' + usd(Math.round(k.price * 100 / k.billsPerYear) / 100) + ' every ' + (12 / k.billsPerYear) + ' months.' }));
      if (ui.billing === 'monthly') box.appendChild(h('div', { class: 'muted', text: '12-month agreement · ' + usd(k.price) + ' a year in all.' }));
      if (k.handyman) box.appendChild(h('div', { class: 'care-hd' }, [h('b', { text: '🔧 Handyman Day × ' + k.handyman.days + ' a year (' + k.handyman.hours + ')' }), h('ul', { class: 'care-ok' }, k.handyman.tasks.map(function(t){ return h('li', { text: '• ' + t }); })), h('p', { class: 'muted', text: 'Materials are billed separately. ' + k.handyman.note })]));
      if (k.agreement) box.appendChild(h('a', { class: 'care-link', href: k.agreement, target: '_blank', rel: 'noopener', 'data-agreement': '1', text: 'View the full agreement' }));
      box.appendChild(h('button', { type: 'button', class: 'btn', style: 'margin-top:8px', text: 'No thanks', on: { click: function(){ if (busy || PREVIEW) return; busy = true; api({ action: 'maint-decline', contractId: k.id }).then(function(){ busy = false; load(); }); } } }));
    }
    c.appendChild(box);
  });
  if ((M.alacarte || []).length) {   /* à la carte, with a running total */
    var sel = function(){ return M.alacarte.filter(function(it){ return ui.pick[it.id]; }); }, tot = h('b', { 'data-total': '1', text: '' }), am = h('div', { class: 'pp-msg', role: 'status' });
    var upd = function(){ var t = sel().reduce(function(s2, it){ return s2 + (Number(it.price) || 0); }, 0); tot.textContent = sel().length ? sel().length + ' picked · ' + (t ? usd(t) + ' + any priced by your PM' : 'priced by your PM') : 'Pick any you want'; };
    var al = h('div', { class: 'care-plan', 'data-alacarte': '1' }, [h('b', { text: 'À la carte — add just what you need' })]);
    M.alacarte.forEach(function(it){ var cb = h('input', { type: 'checkbox', 'data-al': it.id }); cb.checked = !!ui.pick[it.id]; cb.addEventListener('change', function(){ ui.pick[it.id] = cb.checked; upd(); });
      al.appendChild(h('label', { class: 'care-al' }, [cb, h('span', null, [h('b', { text: it.name }), it.note ? h('span', { class: 'muted', text: ' ' + it.note }) : null]), h('span', { text: it.price ? usd(it.price) : '' })])); });
    al.appendChild(h('div', { class: 'care-tot' }, [tot, h('button', { type: 'button', class: 'btn', 'data-ask': 'al', text: 'Ask for these', on: { click: function(){ var l = sel(); if (!l.length || busy || PREVIEW) return; busy = true; am.textContent = 'Sending…';
      l.reduce(function(pr, it){ return pr.then(function(){ return api({ action: 'maint-ask', item: it.id }); }); }, Promise.resolve()).then(function(){ busy = false; ui.pick = {}; am.textContent = '✓ Thank you — we will call you with the price.'; upd(); }); } } })]));
    al.appendChild(am); upd(); c.appendChild(al); }
  if (quoted.length) signBox(c, M, quoted);
}
function signBox(c, M, quoted){
  var box = h('div', { class: 'care-sign', id: 'gcpp-signbox' }, [h('div', { class: 'care-sh', text: 'Sign & start' }),
    h('ul', { class: 'care-sum' }, (M.agreementSummary || []).map(function(t){ return h('li', { text: t }); })),
    h('div', { class: 'muted', text: 'You sign up for: ' + quoted.map(function(k){ return k.planName + ' (' + priceOf(k) + ')'; }).join(', ') })]);
  if (!pad) pad = makePad();
  var nm = h('input', { type: 'text', class: 'pp-in', id: 'gcpp-name', maxlength: '80', autocomplete: 'name', placeholder: 'Type your full name' }); nm.value = keep.name; nm.addEventListener('input', function(){ keep.name = nm.value; });
  var ag = h('input', { type: 'checkbox', id: 'gcpp-agree' }); ag.checked = keep.ok; ag.addEventListener('change', function(){ keep.ok = ag.checked; });
  var ar = h('input', { type: 'checkbox', id: 'gcpp-renew' }); ar.checked = !!keep.renew; ar.addEventListener('change', function(){ keep.renew = ar.checked; });   /* auto-renew only with a yes */
  var go = h('button', { type: 'button', class: 'btn gold care-go', id: 'gcpp-signbtn', text: 'Sign & start' }), sm = h('div', { class: 'pp-msg', role: 'status' }); go.disabled = PREVIEW;
  box.appendChild(h('div', { class: 'muted', text: 'Billing: ' + (ui.billing === 'monthly' ? 'monthly' : 'yearly') + ' (change it with the Monthly / Yearly switch above).' }));
  box.appendChild(h('label', { class: 'muted', for: 'gcpp-name', text: 'Your full name' })); box.appendChild(nm);
  box.appendChild(h('div', { class: 'muted', text: 'Draw your signature (or leave it blank to sign with your typed name):' })); box.appendChild(pad.el);
  box.appendChild(h('button', { type: 'button', class: 'btn', text: 'Clear signature', on: { click: function(){ pad.clear(); } } }));
  box.appendChild(h('label', { class: 'sel-agree' }, [ag, h('span', { text: ' I agree to the maintenance agreement for the plan' + (quoted.length > 1 ? 's' : '') + ' above (12 months; I can end it by e-mail).' })]));
  box.appendChild(h('label', { class: 'sel-agree' }, [ar, h('span', { text: ' Optional: renew automatically each year (GrayCo sends the renewal invoice; you can stop it any time by e-mail). Leave it unticked and we will ask you before each renewal.' })]));
  box.appendChild(go); box.appendChild(sm);
  go.addEventListener('click', function(){
    if (busy) return; if (!nm.value.trim()) { sm.textContent = 'Please type your full name.'; nm.focus(); return; } if (!ag.checked) { sm.textContent = 'Please tick the box to agree.'; return; }
    busy = true; go.disabled = true; sm.textContent = 'Signing…'; var strokes = pad.strokes(), last = null;
    quoted.reduce(function(pr, k){ return pr.then(function(r){ if (r && !(r.data && r.data.ok)) return r; return api({ action: 'maint-sign', contractId: k.id, name: nm.value, agree: true, autoRenew: ar.checked === true, billing: ui.billing, strokes: strokes }).then(function(x){ last = x; return x; }); }); }, Promise.resolve(null)).then(function(r){
      busy = false;
      if (r && r.data && r.data.ok) { keep.ok = false; keep.renew = false; pad.clear(); note.maint = '✓ Thank you — you are signed up. First visit: ' + dt(r.data.nextVisit) + '. Your signed copy is below' + (r.data.emailed ? ' and in your e-mail.' : '.'); return load(); }
      sm.textContent = (r && r.data && r.data.error) || 'That did not work — please call ' + OFFICE + '.'; go.disabled = false; });
  });
  c.appendChild(box);
}

function paint(){
  if (!D) return; css();
  cards.forEach(function(c){ if (c && c.parentNode) c.parentNode.removeChild(c); });
  cards = [heardCard(), maintCard()].filter(Boolean);
  place();
}
function homeShown(){ var t = document.getElementById('tabs'); if (!t || t.hidden) return false; var b = document.querySelector('nav.tabs button[data-tab="home"]'); return !b || b.getAttribute('aria-selected') === 'true'; }
function place(){
  var main = document.getElementById('main'); if (!main) return;
  if (!cards.length || !homeShown()) { cards.forEach(function(c){ if (c.parentNode) c.parentNode.removeChild(c); }); return; }
  var host = main.querySelector('.col-r') || main;
  var anchor = document.getElementById('gcsel');
  var after = anchor && anchor.parentNode === host ? anchor.nextSibling : null;
  if (!after) { var first = host.firstElementChild; while (first && first.classList && first.classList.contains('jobbar')) first = first.nextElementSibling; after = first ? first.nextSibling : null; }
  cards.forEach(function(c){ if (c.parentNode === host) return; host.insertBefore(c, after); after = c.nextSibling; });
}
function start(){
  if (window.GCPartner) return;   /* the sub portal never shows these */
  if (started && sess() && pid() !== lastPid) { lastPid = pid(); D = null; cards.forEach(function(c){ if (c.parentNode) c.parentNode.removeChild(c); }); cards = []; load(); return; }
  if (started || !(token || sess())) return; var t = document.getElementById('tabs'); if (!t || t.hidden) return;
  started = true; lastPid = pid(); load();
}
try {
  new MutationObserver(function(){ start(); place(); }).observe(document.getElementById('main'), { childList: true, subtree: false });
  var tb = document.getElementById('tabs'); if (tb) new MutationObserver(function(){ start(); place(); }).observe(tb, { attributes: true, subtree: true, attributeFilter: ['hidden', 'aria-selected'] });
} catch (e) {}
start();
window._gcPortalPlus = { reload: load, data: function(){ return D; } };
})();
