/* GrayCo portal — patch PORTALTEAM (owner 11/23: "The portal should be for the company that way everyone that signs up the entire
   company can check out the portal not just the guy that signs up").
   The customer portal's 👥 card on Home: a GC / commercial customer's "My team" (any member adds / removes coworkers) or a homeowner's
   "Household" (the account holder adds / removes household members). Everyone on it signs in with their own e-mail / mobile and sees
   the same jobs, documents, invoices, payments and messages. "Send invite" goes only when someone taps it (e-mail through GrayCo's
   customer quiet hours; a mobile-only person → a ready text on the tapper's own phone). Remove keeps the record and ends their sign-in.
   Inline only (no pop-ups); phone and desk. Never on the sub portal or the GC link page. Server: portal-access.js c-team*. */
(function(){
'use strict';
if (window.__GC_PTEAM__) return; window.__GC_PTEAM__ = true;
var FN = '/.netlify/functions/portal-access';
var S = {
  en: { team: '👥 My team', house: '👥 Household', introT: 'Everyone here signs in with their own e-mail or mobile number and sees your jobs, documents, invoices, payments and messages.',
    introH: 'Add the people in your home who should see this project too. Each signs in with their own e-mail or mobile number.', main: 'Account holder', mainT: 'Main contact', you: 'You',
    removed: 'Removed', by: 'by {n} on {d}', add: '＋ Add someone', name: 'Name', email: 'E-mail', mobile: 'Mobile (if no e-mail)', save: 'Add', cancel: 'Cancel',
    invite: '✉️ Send invite', reinvite: '✉️ Invite again', invited: 'Invited {d}', remove: 'Remove', restore: 'Restore', confirm: 'Tap again to remove {n}',
    on: '🔔 Notify me too', off: '🔕 Stop notifying me', hint: 'The main contact always gets GrayCo\'s e-mails. Turn this on to get them too.', isOn: 'You get GrayCo\'s e-mails too.',
    sent: 'Invite sent to {to}', held: 'Invite will go out at 7:00 AM', paused: 'Not sent right now. They can already sign in at portal.grayco-cs.com with their e-mail.', text: '📱 Text the invite from my phone',
    added: '{n} is added — send the invite so they know.', needName: 'Type their name.', needWay: 'Type their e-mail or mobile number.', viewOnly: 'Only the account holder adds or removes people.', fail: 'That did not go through. Try again.' },
  es: { team: '👥 Mi equipo', house: '👥 Mi hogar', introT: 'Todos aquí entran con su propio correo o celular y ven sus trabajos, documentos, facturas, pagos y mensajes.',
    introH: 'Agregue a las personas de su casa que también deben ver este proyecto. Cada una entra con su propio correo o celular.', main: 'Titular de la cuenta', mainT: 'Contacto principal', you: 'Usted',
    removed: 'Quitado', by: 'por {n} el {d}', add: '＋ Agregar a alguien', name: 'Nombre', email: 'Correo', mobile: 'Celular (si no tiene correo)', save: 'Agregar', cancel: 'Cancelar',
    invite: '✉️ Enviar invitación', reinvite: '✉️ Invitar otra vez', invited: 'Invitado {d}', remove: 'Quitar', restore: 'Restaurar', confirm: 'Toque otra vez para quitar a {n}',
    on: '🔔 Avisarme también', off: '🔕 Dejar de avisarme', hint: 'El contacto principal siempre recibe los correos de GrayCo. Actívelo para recibirlos también.', isOn: 'Usted también recibe los correos de GrayCo.',
    sent: 'Invitación enviada a {to}', held: 'La invitación saldrá a las 7:00 AM', paused: 'No se envió por ahora. Ya puede entrar en portal.grayco-cs.com con su correo.', text: '📱 Enviar la invitación por texto desde mi teléfono',
    added: '{n} fue agregado — envíele la invitación para que sepa.', needName: 'Escriba su nombre.', needWay: 'Escriba su correo o celular.', viewOnly: 'Solo el titular de la cuenta agrega o quita personas.', fail: 'No se pudo. Intente otra vez.' }
};
function lang(){ try { if (document.documentElement.lang === 'es') return 'es'; return localStorage.getItem('gc_lang') === 'es' ? 'es' : 'en'; } catch (e) { return 'en'; } }
function T(k, v){ var s = (S[lang()] || S.en)[k] || S.en[k] || k; if (v) Object.keys(v).forEach(function(x){ s = s.split('{' + x + '}').join(v[x]); }); return s; }
function $(id){ return document.getElementById(id); }
function h(tag, attrs, kids){
  var el = document.createElement(tag);
  Object.keys(attrs || {}).forEach(function(k){ var v = attrs[k]; if (v == null || v === false) return; if (k === 'text') el.textContent = v; else if (k === 'on') Object.keys(v).forEach(function(e){ el.addEventListener(e, v[e]); }); else el.setAttribute(k, v === true ? '' : v); });
  (kids || []).forEach(function(c){ if (c == null || c === false) return; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return el;
}
function dt(v){ var d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString(lang() === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function cur(){ try { return (window.GCPortalMain && window.GCPortalMain.cur()) || {}; } catch (e) { return {}; } }
function mode(){ if (window.GCPartner) return ''; if (window.GCGc && window.GCGc.data && window.GCGc.data()) return ''; var c = cur(); return c.shown && !c.preview ? 'customer' : ''; }
function api(action, body){
  var c = cur(), hd = { 'Content-Type': 'application/json' };
  if (c.session && !c.token) hd['x-portal-session'] = c.session; else hd['x-portal-token'] = c.token || '';
  return fetch(FN, { method: 'POST', headers: hd, cache: 'no-store', credentials: 'omit', body: JSON.stringify(Object.assign({ action: action, lang: lang() }, body || {})) })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if (!r.ok || !j.ok) throw new Error(j.error || T('fail')); return j; }); }, function(){ throw new Error(T('fail')); });
}
var D = null, ERR = '', ADD = false, RM = '', NOTE = null, card = null, lastKey = '', loading = false;
function css(){
  if ($('gcpt-css')) return;
  var st = document.createElement('style'); st.id = 'gcpt-css';
  st.textContent = '#gcpt-card .pt-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:10px 0;border-top:1px solid var(--rule,#EFEAE0)}#gcpt-card .pt-row:first-of-type{border-top:0}'
    + '#gcpt-card .pt-who{flex:1 1 200px;min-width:0;overflow-wrap:anywhere}#gcpt-card .pt-who b{display:block;font-size:15px}#gcpt-card .pt-m{font-size:13px;color:var(--mute,#55626F)}'
    + '#gcpt-card .pt-acts{display:flex;flex-wrap:wrap;gap:6px}#gcpt-card .pt-acts .btn,#gcpt-card .pt-btns .btn{min-height:44px}#gcpt-card .pt-off{opacity:.6}'
    + '#gcpt-card .pt-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px;margin-top:8px}#gcpt-card .pt-form label{display:flex;flex-direction:column;gap:4px;font-size:14px;font-weight:700}'
    + '#gcpt-card .pt-form input{width:100%;box-sizing:border-box;min-height:46px;border:1px solid #C9C2B2;border-radius:10px;padding:10px;font:16px inherit;font-family:inherit}'
    + '#gcpt-card .pt-btns{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px}#gcpt-card .pt-note{background:#E3F5EC;color:#1F5E33;border-radius:10px;padding:8px 10px;margin:8px 0;overflow-wrap:anywhere}'
    + '#gcpt-card .pt-note.bad,#gcpt-card .pt-err{background:#FDECEC;color:#8a1c1c}#gcpt-card .pt-err{border-radius:10px;padding:6px 10px;font-weight:600}#gcpt-card .pt-err:empty{display:none}';
  document.head.appendChild(st);
}
function load(){ if (loading) return; loading = true; api('c-team').then(function(j){ loading = false; D = j; ERR = ''; paint(); }, function(e){ loading = false; D = null; ERR = e.message; paint(); }); }
function act(action, body, btn){
  if (btn) { btn.disabled = true; }
  return api(action, body).then(function(j){ D = j; RM = ''; return j; }, function(e){ if (btn) btn.disabled = false; NOTE = { text: e.message, bad: true }; paint(); throw e; });
}
function row(x){
  var off = x.status === 'removed', who = [x.email, x.phone].filter(Boolean).join(' · ');
  var tags = [x.primary ? (D.household ? T('main') : T('mainT')) : '', x.mine ? T('you') : '', off ? T('removed') + (x.removedBy && x.removedBy.name ? ' ' + T('by', { n: x.removedBy.name, d: dt(x.removedAt) }) : '') : '', !off && !x.primary && x.invitedAt ? T('invited', { d: dt(x.invitedAt) }) : ''].filter(Boolean).join(' · ');
  var acts = [];
  if (D.canManage && !off && !x.primary && x.status === 'active' && !x.mine) acts.push(h('button', { type: 'button', class: 'btn', 'data-pt-invite': x.id, text: x.invitedAt ? T('reinvite') : T('invite'), on: { click: function(ev){ invite(x, ev.currentTarget); } } }));
  if (D.canManage && !off && (x.status === 'active' || x.status === 'requested' || x.status === 'verify')) acts.push(h('button', { type: 'button', class: 'btn', 'data-pt-remove': x.id, text: RM === x.id ? T('confirm', { n: x.name }) : T('remove'),
    on: { click: function(ev){ if (RM !== x.id) { RM = x.id; paint(); return; } act('c-team-remove', { id: x.id }, ev.currentTarget).then(function(j){ if (j.self) { try { location.reload(); } catch (e) {} return; } paint(); }, function(){}); } } }));
  if (D.canManage && off) acts.push(h('button', { type: 'button', class: 'btn', 'data-pt-restore': x.id, text: T('restore'), on: { click: function(ev){ act('c-team-restore', { id: x.id }, ev.currentTarget).then(paint, function(){}); } } }));
  return h('div', { class: 'pt-row' + (off ? ' pt-off' : ''), 'data-pt': x.id }, [h('div', { class: 'pt-who' }, [h('b', { text: x.name || who }), who ? h('div', { class: 'pt-m', text: who }) : null, tags ? h('div', { class: 'pt-m', text: tags }) : null]), acts.length ? h('div', { class: 'pt-acts' }, acts) : null]);
}
function invite(x, btn){
  act('c-team-invite', { id: x.id }, btn).then(function(j){
    var inv = j.invite || {};
    NOTE = inv.paused ? { text: T('paused'), bad: true, sms: inv.sms } : inv.held ? { text: T('held') } : inv.how === 'sms' ? { text: '', sms: inv.sms } : inv.ok ? { text: T('sent', { to: inv.to || x.email }) } : { text: inv.why || T('fail'), bad: true, sms: inv.sms };
    paint();
  }, function(){});
}
function paint(){
  css();
  var c = h('section', { class: 'card', id: 'gcpt-card', lang: lang() });
  if (ERR || !D) { if (card && card.parentNode) card.parentNode.removeChild(card); card = null; return; }   /* not signed in as a person (or a hiccup): no card */
  c.appendChild(h('h2', { text: D.household ? T('house') : T('team') }));
  c.appendChild(h('div', { class: 'pt-m', text: D.household ? T('introH') : T('introT') }));
  if (NOTE) c.appendChild(h('div', { class: 'pt-note' + (NOTE.bad ? ' bad' : ''), role: 'status', 'data-pt-note': '1' }, [NOTE.text ? h('div', { text: NOTE.text }) : null, NOTE.sms ? h('a', { class: 'btn', href: NOTE.sms, 'data-pt-sms': '1', text: T('text') }) : null]));
  (D.team || []).forEach(function(x){ c.appendChild(row(x)); });
  if (D.me && D.me !== 'primary') c.appendChild(h('div', { class: 'pt-btns' }, [h('button', { type: 'button', class: 'btn', id: 'ptNotify', 'aria-pressed': D.notify ? 'true' : 'false', text: D.notify ? T('off') : T('on'),
    on: { click: function(ev){ act('c-team-notify', { on: !D.notify }, ev.currentTarget).then(paint, function(){}); } } }), h('span', { class: 'pt-m', text: D.notify ? T('isOn') : T('hint') })]));
  if (!D.canManage) c.appendChild(h('div', { class: 'pt-m', text: T('viewOnly') }));
  else if (!ADD) c.appendChild(h('div', { class: 'pt-btns' }, [h('button', { type: 'button', class: 'btn', id: 'ptAdd', text: T('add'), on: { click: function(){ ADD = true; NOTE = null; paint(); try { $('ptName').focus(); } catch (e) {} } } })]));
  else {
    var nm = h('input', { id: 'ptName', type: 'text', maxlength: '80', autocomplete: 'off' }), em = h('input', { id: 'ptEmail', type: 'email', maxlength: '200', autocomplete: 'off', inputmode: 'email' }), ph = h('input', { id: 'ptPhone', type: 'tel', maxlength: '40', autocomplete: 'off', inputmode: 'tel' });
    var err = h('div', { class: 'pt-err', role: 'alert' });
    var go = h('button', { type: 'button', class: 'btn', id: 'ptSave', text: T('save'), on: { click: function(){
      err.textContent = '';
      if (!nm.value.trim()) { err.textContent = T('needName'); nm.focus(); return; }
      if (!em.value.trim() && !ph.value.trim()) { err.textContent = T('needWay'); em.focus(); return; }
      act('c-team-add', { name: nm.value.trim(), email: em.value.trim(), phone: ph.value.trim() }, go).then(function(j){ ADD = false; NOTE = { text: T('added', { n: (j.added && j.added.name) || nm.value.trim() }) }; paint(); }, function(){});
    } } });
    c.appendChild(h('div', { class: 'pt-form' }, [h('label', { for: 'ptName' }, [T('name'), nm]), h('label', { for: 'ptEmail' }, [T('email'), em]), h('label', { for: 'ptPhone' }, [T('mobile'), ph])]));
    c.appendChild(err);
    c.appendChild(h('div', { class: 'pt-btns' }, [go, h('button', { type: 'button', class: 'btn', id: 'ptCancel', text: T('cancel'), on: { click: function(){ ADD = false; paint(); } } })]));
  }
  if (card && card.parentNode) card.parentNode.replaceChild(c, card); card = c;
  place();
}
function homeShown(){ var t = $('tabs'); if (!t || t.hidden) return false; var b = document.querySelector('nav.tabs button[data-tab="home"]'); return !b || b.getAttribute('aria-selected') === 'true'; }
function place(){
  var main = $('main'); if (!main || !card) return;
  if (!mode() || !homeShown()) { if (card.parentNode) card.parentNode.removeChild(card); return; }
  var host = main.querySelector('.col-r') || main;
  if (card.parentNode === host) return;
  host.appendChild(card);   /* at the end of Home: below what needs them and their requests */
}
function key(){ var m = mode(); if (!m) return ''; var c = cur(); return 'c:' + (c.session || c.token || ''); }
function tick(){
  var k = key();
  if (!k) { if (card && card.parentNode) card.parentNode.removeChild(card); return; }
  if (k !== lastKey) { lastKey = k; D = null; ERR = ''; ADD = false; NOTE = null; RM = ''; load(); return; }
  if (card && D && card.getAttribute('lang') !== lang()) return paint();
  if (card) place();
}
try {
  new MutationObserver(function(){ tick(); }).observe($('main'), { childList: true, subtree: false });
  var tb = $('tabs'); if (tb) new MutationObserver(function(){ tick(); }).observe(tb, { attributes: true, subtree: true, attributeFilter: ['hidden', 'aria-selected'] });
  new MutationObserver(function(){ tick(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
} catch (e) {}
setInterval(tick, 1500); tick();
window.GCPortalTeam = { reload: load, data: function(){ return D; }, _i18n: S };
})();
