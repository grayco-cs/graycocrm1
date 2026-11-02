/* portal-pwa.js — patch PORTALAPP: the CUSTOMER portal as an app on the phone (owner 10/30).
   1. "📲 Make GrayCo Portal an app?" — a card with a big "Add to Home Screen" button and "Not now" (30 days):
        Android / Chrome / Edge (phone or computer): the browser's own install prompt (beforeinstallprompt);
        iPhone / iPad Safari: a short picture how-to (Share □↑ → "Add to Home Screen" → Add);
        iPhone Chrome / Facebook / other in-app browsers: "open this page in Safari first";
        anything else (no install possible), or already installed: nothing.
      Before installing, the page asks the server for this phone's own device session (portal-access c-app): the
      installed app opens straight into the customer's portal, signed in (iPhone: a one-time code rides in the app's
      start address, because a home-screen app does not share Safari's storage). No password is ever kept.
   2. The 📲 menu in the header: Add to Home Screen · 🔔 notifications on / off · Sign out of this device.
   3. NUMBERS: what is new per section (server: portal.js action app) on the tabs, and the total on the app icon
      (navigator.setAppBadge). Opening a section clears its number (Home after a few seconds on screen).
   4. 🔔 Turn on notifications (Web Push) — offered inside the installed app (iPhone only asks from there).
   Customers only: the sub portal (portal-app.js) and the GC page never see any of this. */
(function(){
'use strict';
if (window.GCPortalApp) return;
var FN = '/.netlify/functions/portal', ACC = '/.netlify/functions/portal-access';
var DAY = 864e5, HOME_SEEN_MS = 4000;
function $(id){ return document.getElementById(id); }
function ls(k, v){ try { if (v === undefined) return localStorage.getItem(k) || ''; if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { return ''; } }
function h(tag, attrs, kids){
  var el = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function(k){
    var v = attrs[k]; if (v == null || v === false) return;
    if (k === 'text') el.textContent = v; else if (k === 'html') el.innerHTML = v;
    else if (k === 'on') Object.keys(v).forEach(function(e){ el.addEventListener(e, v[e]); });
    else el.setAttribute(k, v === true ? '' : String(v));
  });
  (kids || []).forEach(function(c){ if (c == null || c === false) return; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return el;
}
var ua = navigator.userAgent || '';
var IOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
var IPAD = /ipad/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
var IOS_OTHER = IOS && /crios|fxios|edgios|opios|gsa\/|fban|fbav|instagram|line\/|snapchat|twitter|linkedinapp|; wv\)/i.test(ua);
function standalone(){ try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch (e) { return false; } }
function es(){ return ls('gc_lang') === 'es'; }
function T(en, sp){ return es() ? sp : en; }
function main(){ return window.GCPortalMain ? window.GCPortalMain.cur() : null; }
function customer(){ var m = main(); var t = $('tabs'); return !!(m && m.shown && t && !t.hidden && !window.GCPartner && !window.__GCG_WANT__); }
function preview(){ var m = main(); return !!(m && m.preview) || /(?:^#|&)p=1(?:&|$)/.test(location.hash || ''); }
function creds(){ var m = main() || {}; var hd = { 'Content-Type': 'application/json' }; if (m.session) hd['x-portal-session'] = m.session; else if (m.token) hd['x-portal-token'] = m.token; return hd; }
function call(fn, body){
  var m = main() || {};
  body = Object.assign({ projectId: m.pid || undefined }, preview() ? { preview: true } : {}, body);
  return fetch(fn, { method: 'POST', headers: creds(), body: JSON.stringify(body), cache: 'no-store', credentials: 'omit' })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ return { status: r.status, data: j || {} }; }); }, function(){ return { status: 0, data: {} }; });
}

/* ── the install event (the GCP block may have caught it first: window.__gcBip) ── */
var bip = null;
window.addEventListener('beforeinstallprompt', function(e){ try { e.preventDefault(); } catch (x) {} bip = e; setTimeout(tick, 0); });
window.addEventListener('appinstalled', function(){ ls('gc_pwa_installed', String(Date.now())); hideCard(); paintMenu(); });
function installEvt(){ return bip || window.__gcBip || null; }
function canInstall(){ return !standalone() && (!!installEvt() || IOS); }
function dismissed(){ var t = Number(ls('gc_pwa_dismiss')) || 0; return t && Date.now() - t < 30 * DAY; }

var CSS = ''
  + '.gca-card{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:60;max-width:520px;margin:0 auto;background:var(--navy,#0F1D2F);color:#fff;border-radius:18px;padding:16px;box-shadow:0 12px 36px rgba(0,0,0,.35);font-family:inherit}'
  + '.gca-card .top{display:flex;gap:12px;align-items:center}.gca-card img{width:52px;height:52px;border-radius:12px;flex:none}'
  + '.gca-card h3{margin:0;font-size:18px;line-height:1.25}.gca-card p{margin:4px 0 0;color:var(--soft,#C9D3DF);font-size:14px;line-height:1.35}'
  + '.gca-go{display:flex;width:100%;min-height:52px;margin-top:14px;align-items:center;justify-content:center;gap:8px;border:none;border-radius:12px;background:var(--gold,#D4A017);color:var(--navy,#0F1D2F);font:700 17px inherit;font-family:inherit;cursor:pointer}'
  + '.gca-no{display:block;width:100%;min-height:44px;margin-top:6px;border:none;background:transparent;color:var(--soft,#C9D3DF);font:600 15px inherit;font-family:inherit;cursor:pointer}'
  + '.gca-ov{position:fixed;inset:0;z-index:70;background:rgba(15,29,47,.62);display:flex;align-items:flex-end;justify-content:center}'
  + '.gca-sheet{background:#fff;color:var(--ink,#14202E);width:100%;max-width:520px;border-radius:20px 20px 0 0;padding:20px 18px calc(96px + env(safe-area-inset-bottom,0px));box-shadow:0 -8px 30px rgba(0,0,0,.25);max-height:92vh;overflow:auto;box-sizing:border-box}'
  + '.gca-ipad .gca-sheet{border-radius:20px;margin:auto;padding-bottom:20px}.gca-ipad{align-items:center}'
  + '.gca-sheet h3{margin:0 0 4px;font-size:19px}.gca-sheet .sub{margin:0 0 14px;color:var(--mute,#55626F);font-size:14px}'
  + '.gca-step{display:flex;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--rule,#EFEAE0);font-size:16px;line-height:1.35}.gca-step:first-of-type{border-top:none}'
  + '.gca-n{flex:none;width:30px;height:30px;border-radius:15px;background:var(--navy,#0F1D2F);color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center}'
  + '.gca-ico{flex:none;width:44px;height:44px;border-radius:10px;background:#F2F2F7;display:flex;align-items:center;justify-content:center;color:#0A84FF}'
  + '.gca-pill{display:inline-flex;align-items:center;gap:6px;background:#F2F2F7;border-radius:8px;padding:3px 8px;font-weight:600}'
  + '.gca-note{margin:12px 0 0;padding:10px 12px;background:var(--goldBg,#FCF0CF);border-radius:10px;font-size:14px;line-height:1.4}'
  + '.gca-arrow{position:fixed;left:50%;bottom:calc(6px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:71;color:var(--gold,#D4A017);font-size:16px;text-align:center;font:700 14px inherit;font-family:inherit;animation:gcaB 1.1s ease-in-out infinite;pointer-events:none;text-shadow:0 1px 3px rgba(0,0,0,.6)}'
  + '.gca-ipad .gca-arrow,.gca-arrow.up{bottom:auto;top:calc(6px + env(safe-area-inset-top,0px));left:auto;right:96px;transform:none}'
  + '@keyframes gcaB{0%,100%{margin-bottom:0;margin-top:0}50%{margin-bottom:-8px;margin-top:-8px}}'
  + '.gca-menu{position:absolute;top:calc(62px + env(safe-area-inset-top,0px));left:12px;z-index:65;background:#fff;color:var(--ink,#14202E);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.28);min-width:250px;padding:6px;text-align:left}'
  + '.gca-menu button{display:flex;width:100%;min-height:46px;align-items:center;gap:10px;border:none;background:transparent;border-radius:10px;font:600 15px inherit;font-family:inherit;color:inherit;cursor:pointer;padding:0 12px;text-align:left}.gca-menu button:hover{background:#F6F3EC}'
  + '.gca-menu .ok{color:var(--green,#1D5E2C);font-size:14px;padding:10px 12px}.gca-mbtn{position:relative}.gca-mbtn .badge{position:absolute;top:-4px;right:-6px;margin:0}'
  + '#tabs .badge.gca-b{background:#B42318}';
function css(){ if ($('gca-css')) return; var st = document.createElement('style'); st.id = 'gca-css'; st.textContent = CSS; document.head.appendChild(st); }
var SHARE_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 10H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-2"/><path d="M12 15V2"/><path d="M8 6l4-4 4 4"/></svg>';
var ADD_SVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';

/* ── this phone's device session + the install's one-time code (portal-access c-app) ── */
var prepared = null;
function prepare(){
  if (prepared) return prepared;
  if (preview()) return (prepared = Promise.resolve(null));
  prepared = call(ACC, { action: 'c-app' }).then(function(r){
    if (!r.data || !r.data.ok || !r.data.session) { prepared = null; return null; }
    ls('gc_portal_app', r.data.session);
    if (r.data.handoff) carry(r.data.handoff);
    return r.data;
  });
  return prepared;
}
/* iPhone: the home-screen app starts at this address — the code rides in it (after the #, never sent to a server) */
function carry(handoff){
  var start = location.origin + '/portal.html?app=1#h=' + handoff;
  try { history.replaceState(null, '', '/portal.html?app=1#h=' + handoff); } catch (e) {}
  try {
    var man = { id: '/?app=grayco-portal', name: 'GrayCo', short_name: 'GrayCo', start_url: start, scope: location.origin + '/', display: 'standalone', orientation: 'portrait',
      background_color: '#0F1D2F', theme_color: '#0F1D2F', icons: [{ src: location.origin + '/portal-icon-192.png', sizes: '192x192', type: 'image/png' }, { src: location.origin + '/portal-icon-512.png', sizes: '512x512', type: 'image/png' }] };
    var link = document.querySelector('link[rel="manifest"]');
    if (link && IOS) link.setAttribute('href', 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(man)));
  } catch (e) {}
}

/* ── 1. the card ── */
function hideCard(){ var c = $('gca-card'); if (c) c.remove(); }
function showCard(){
  if ($('gca-card') || !customer() || preview() || standalone() || dismissed() || !canInstall()) return;
  css();
  var old = $('gcp-install'); if (old) old.remove();
  var card = h('div', { class: 'gca-card', id: 'gca-card', role: 'dialog', 'aria-label': T('Make GrayCo Portal an app', 'Haga del Portal GrayCo una app') }, [
    h('div', { class: 'top' }, [h('img', { src: '/portal-icon-192.png', alt: '', width: '52', height: '52' }), h('div', {}, [
      h('h3', { text: T('📲 Make GrayCo Portal an app?', '📲 ¿Hacer del Portal GrayCo una app?') }),
      h('p', { text: T('Your project one tap away — updates, photos, papers and messages, right on your home screen.', 'Su proyecto a un toque — noticias, fotos, papeles y mensajes, en su pantalla de inicio.') })])]),
    h('button', { type: 'button', class: 'gca-go', id: 'gca-add', text: T('Add to Home Screen', 'Agregar a la pantalla de inicio'), on: { click: install } }),
    h('button', { type: 'button', class: 'gca-no', id: 'gca-not', text: T('Not now', 'Ahora no'), on: { click: function(){ ls('gc_pwa_dismiss', String(Date.now())); hideCard(); } } })
  ]);
  document.body.appendChild(card);
}
function install(){
  var e = installEvt();
  var p = prepare();
  if (e) {
    bip = null; window.__gcBip = null;
    try { e.prompt(); } catch (x) {}
    try { if (e.userChoice) e.userChoice.then(function(c){ if (c && c.outcome === 'accepted') { ls('gc_pwa_installed', String(Date.now())); hideCard(); paintMenu(); } }); } catch (x) {}
    hideCard(); return p;
  }
  if (IOS) { hideCard(); howTo(); return p; }
  return p;
}
/* iPhone / iPad: the picture how-to */
function howTo(){
  css(); closeHowTo();
  var steps;
  if (IOS_OTHER) {
    steps = [
      h('h3', { text: T('Open this page in Safari first', 'Abra esta página en Safari primero') }),
      h('p', { class: 'sub', text: T('iPhone only adds apps to the Home Screen from Safari.', 'El iPhone solo agrega apps a la pantalla de inicio desde Safari.') }),
      h('div', { class: 'gca-step' }, [h('span', { class: 'gca-n', text: '1' }), h('span', { text: T('Tap the ⋯ menu (or the share icon) of this app.', 'Toque el menú ⋯ (o el ícono de compartir) de esta app.') })]),
      h('div', { class: 'gca-step' }, [h('span', { class: 'gca-n', text: '2' }), h('span', { html: T('Choose <b>Open in Safari</b> (or <b>Open in Browser</b>).', 'Escoja <b>Abrir en Safari</b> (o <b>Abrir en el navegador</b>).') })]),
      h('div', { class: 'gca-step' }, [h('span', { class: 'gca-n', text: '3' }), h('span', { html: T('In Safari, tap <b>Add to Home Screen</b> on the GrayCo card again.', 'En Safari, toque <b>Agregar a la pantalla de inicio</b> otra vez.') })])
    ];
  } else {
    steps = [
      h('h3', { text: T('Add GrayCo to your Home Screen', 'Agregue GrayCo a su pantalla de inicio') }),
      h('p', { class: 'sub', text: T('Three taps — then GrayCo opens like an app, already signed in.', 'Tres toques — y GrayCo abre como una app, ya con su sesión.') }),
      h('div', { class: 'gca-step' }, [h('span', { class: 'gca-n', text: '1' }), h('span', { class: 'gca-ico', html: SHARE_SVG }), h('span', { html: T('Tap the <b>Share</b> button ' + (IPAD ? 'at the top of Safari.' : 'at the bottom of Safari.'), 'Toque el botón <b>Compartir</b> ' + (IPAD ? 'arriba en Safari.' : 'abajo en Safari.')) })]),
      h('div', { class: 'gca-step' }, [h('span', { class: 'gca-n', text: '2' }), h('span', { class: 'gca-ico', html: ADD_SVG }), h('span', { html: T('Scroll down and tap <span class="gca-pill">Add to Home Screen</span>', 'Baje y toque <span class="gca-pill">Agregar a inicio</span>') })]),
      h('div', { class: 'gca-step' }, [h('span', { class: 'gca-n', text: '3' }), h('span', { class: 'gca-ico', html: '<b style="font-size:15px">' + T('Add', 'Agregar') + '</b>' }), h('span', { html: T('Tap <b>Add</b> (top right). Done!', 'Toque <b>Agregar</b> (arriba a la derecha). ¡Listo!') })]),
      h('p', { class: 'gca-note', text: T('🔔 Then open GrayCo from your Home Screen and tap “Turn on notifications” — iPhone only allows notifications from inside the app.', '🔔 Luego abra GrayCo desde su pantalla de inicio y toque “Activar avisos” — el iPhone solo permite avisos desde la app.') })
    ];
  }
  var ov = h('div', { class: 'gca-ov' + (IPAD ? ' gca-ipad' : ''), id: 'gca-howto', role: 'dialog', 'aria-label': T('How to add GrayCo to your Home Screen', 'Cómo agregar GrayCo'), on: { click: function(ev){ if (ev.target === ov) closeHowTo(); } } }, [
    h('div', { class: 'gca-sheet' }, steps.concat([h('button', { type: 'button', class: 'btn', id: 'gca-howto-ok', style: 'width:100%;margin-top:14px', text: T('Got it', 'Entendido'), on: { click: closeHowTo } })])),
    IOS_OTHER ? null : h('div', { class: 'gca-arrow' + (IPAD ? ' up' : ''), id: 'gca-arrow', html: IPAD ? '⬆<br>' + T('Share', 'Compartir') : T('Share', 'Compartir') + '<br><span style="font-size:30px">⬇</span>' })
  ]);
  document.body.appendChild(ov);
}
function closeHowTo(){ var o = $('gca-howto'); if (o) o.remove(); }

/* ── 2. the 📲 menu in the header ── */
function menuBtn(){
  var b = $('gca-mbtn'); if (b) return b;
  var bar = document.querySelector('.hbtns.l'); if (!bar) return null;
  css();
  b = h('button', { type: 'button', class: 'lang gca-mbtn', id: 'gca-mbtn', 'aria-label': T('App and notifications', 'App y avisos'), 'aria-haspopup': 'menu', text: '📲', on: { click: function(ev){ ev.stopPropagation(); toggleMenu(); } } });
  bar.appendChild(b); return b;
}
function closeMenu(){ var m = $('gca-menu'); if (m) m.remove(); }
document.addEventListener('click', function(ev){ var m = $('gca-menu'); if (m && !m.contains(ev.target)) closeMenu(); });
function toggleMenu(){
  if ($('gca-menu')) return closeMenu();
  var items = [];
  if (standalone()) items.push(h('div', { class: 'ok', text: T('✓ You are using the GrayCo app', '✓ Está usando la app de GrayCo') }));
  else if (canInstall()) items.push(h('button', { type: 'button', id: 'gca-m-add', text: '📲 ' + T('Add to Home Screen', 'Agregar a la pantalla de inicio'), on: { click: function(){ closeMenu(); install(); } } }));
  else if (ls('gc_pwa_installed')) items.push(h('div', { class: 'ok', text: T('✓ The GrayCo app is on this device', '✓ La app de GrayCo está en este equipo') }));
  if (pushPossible()) items.push(PUSH.on ? h('button', { type: 'button', id: 'gca-m-push', text: '🔕 ' + T('Turn off notifications', 'Apagar avisos'), on: { click: function(){ closeMenu(); pushOff(); } } })
    : h('button', { type: 'button', id: 'gca-m-push', text: '🔔 ' + T('Turn on notifications', 'Activar avisos'), on: { click: function(){ closeMenu(); pushOn(); } } }));
  var m = main();
  if (m && m.session) items.push(h('button', { type: 'button', id: 'gca-m-out', text: '↩ ' + T('Sign out of this device', 'Salir en este equipo'), on: { click: function(){ closeMenu(); var so = $('signOut'); if (so) so.click(); } } }));
  if (!items.length) return;
  var menu = h('div', { class: 'gca-menu', id: 'gca-menu', role: 'menu' }, items);
  document.querySelector('header').appendChild(menu);
}
function paintMenu(){
  var b = $('gca-mbtn');
  if (!customer() || preview()) { if (b) b.remove(); return; }
  menuBtn();
}

/* ── 3. the numbers ── */
var U = null, lastKey = '', homeTimer = null, PUSH = { ready: false, key: '', on: false };
var TABMAP = { home: 'home', photos: 'photos', docs: 'docs', pay: 'pay' };
function msgsNow(){ var b = $('msgBadge'); return b ? (Number(b.textContent) || 0) : 0; }
function total(){ if (!U) return msgsNow(); return (U.home || 0) + (U.photos || 0) + (U.docs || 0) + (U.pay || 0) + msgsNow(); }
function iconBadge(){
  var n = total();
  try { if ('setAppBadge' in navigator) { if (n > 0) navigator.setAppBadge(n).catch(function(){}); else navigator.clearAppBadge().catch(function(){}); } } catch (e) {}
  window.__gcaBadge = n;
}
function paintBadges(){
  if (!customer()) return;
  Object.keys(TABMAP).forEach(function(k){
    var b = document.querySelector('#tabs button[data-tab="' + k + '"]'); if (!b) return;
    var n = U ? (U[k] || 0) : 0, cur = b.querySelector('.badge.gca-b');
    if (!n) { if (cur) cur.remove(); return; }
    if (cur) { if (cur.textContent !== String(n)) cur.textContent = String(n); return; }
    b.appendChild(h('span', { class: 'badge gca-b', 'data-gca': k, 'aria-label': n + ' ' + T('new', 'nuevo'), text: String(n) }));
  });
  iconBadge();
}
function load(){
  if (!customer()) return;
  var ep = PUSH.endpoint || '';
  call(FN, { action: 'app', op: 'state', endpoint: ep || undefined }).then(function(r){
    if (!r.data || !r.data.ok) return;
    U = r.data.unread || null; PUSH.ready = !!(r.data.push && r.data.push.ready); PUSH.key = (r.data.push && r.data.push.key) || ''; PUSH.on = !!(r.data.push && r.data.push.on);
    paintBadges(); onTab(); offerPush();
    if (!PUSH.on && ep && PUSH.ready && 'Notification' in window && Notification.permission === 'granted') resubscribe();
  });
}
function seen(sec){
  if (!U || !U[sec] || preview()) return;
  U[sec] = 0; paintBadges();
  call(FN, { action: 'app', op: 'seen', section: sec }).then(function(r){ if (r.data && r.data.ok && r.data.unread) { U = r.data.unread; paintBadges(); } });
}
function onTab(){
  var m = main(); if (!m || !customer()) return;
  clearTimeout(homeTimer);
  if (m.tab === 'home') { if (U && U.home) homeTimer = setTimeout(function(){ var n = main(); if (n && n.tab === 'home' && !document.hidden) seen('home'); }, HOME_SEEN_MS); }
  else if (TABMAP[m.tab]) seen(m.tab);
}
/* a push opened the app on a section: /#job=…&tab=docs */
function deepLink(){
  var mt = /(?:^#|&)tab=(home|photos|docs|pay|msgs)(?:&|$)/.exec(location.hash || '');
  if (!mt || !customer()) return;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  if (window.GCPortalMain) window.GCPortalMain.go(mt[1]);
}
window.addEventListener('hashchange', deepLink);

/* ── 4. notifications ── */
function pushSupported(){ return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
function pushPossible(){ return PUSH.ready && pushSupported() && (!IOS || standalone()); }
function b64uToBytes(s){ s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function swReg(){ return navigator.serviceWorker.getRegistration('/').then(function(r){ return r || navigator.serviceWorker.register('/portal-sw.js', { scope: '/' }); }).then(function(){ return navigator.serviceWorker.ready; }); }
function sendSub(sub){
  var j = sub.toJSON ? sub.toJSON() : sub; PUSH.endpoint = j.endpoint;
  return call(FN, { action: 'app', op: 'subscribe', sub: { endpoint: j.endpoint, keys: j.keys }, lang: es() ? 'es' : 'en' }).then(function(r){ PUSH.on = !!(r.data && r.data.ok); paintMenu(); return PUSH.on; });
}
function pushOn(){
  if (!pushPossible()) return Promise.resolve(false);
  hidePushCard();
  return Promise.resolve(Notification.requestPermission()).then(function(p){
    if (p !== 'granted') { ls('gc_push_dismiss', String(Date.now())); return false; }
    return swReg().then(function(reg){ return reg.pushManager.getSubscription().then(function(s){ return s || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(PUSH.key) }); }); }).then(sendSub);
  }).catch(function(){ return false; }).then(function(ok){ iconBadge(); return ok; });
}
function resubscribe(){ if (!pushSupported()) return; swReg().then(function(reg){ return reg.pushManager.getSubscription(); }).then(function(s){ if (s) sendSub(s); }).catch(function(){}); }
function pushOff(){
  return swReg().then(function(reg){ return reg.pushManager.getSubscription(); }).then(function(s){
    var ep = s ? s.endpoint : PUSH.endpoint;
    if (s) s.unsubscribe().catch(function(){});
    PUSH.on = false; paintMenu();
    return call(FN, { action: 'app', op: 'unsubscribe', endpoint: ep || '' });
  }).catch(function(){});
}
function hidePushCard(){ var c = $('gca-push'); if (c) c.remove(); }
function offerPush(){
  if ($('gca-push') || $('gca-card') || !customer() || preview() || !standalone() || !pushPossible() || PUSH.on) return;
  if (Notification.permission !== 'default') return;
  var t = Number(ls('gc_push_dismiss')) || 0; if (t && Date.now() - t < 30 * DAY) return;
  css();
  document.body.appendChild(h('div', { class: 'gca-card', id: 'gca-push', role: 'dialog', 'aria-label': T('Turn on notifications', 'Activar avisos') }, [
    h('div', { class: 'top' }, [h('img', { src: '/portal-icon-192.png', alt: '' }), h('div', {}, [
      h('h3', { text: T('🔔 Turn on notifications?', '🔔 ¿Activar avisos?') }),
      h('p', { text: T('We’ll put a number on the GrayCo icon when your project has something new — an update, a photo, a paper to sign or an invoice. Never at night.', 'Le pondremos un número en el ícono de GrayCo cuando haya algo nuevo. Nunca de noche.') })])]),
    h('button', { type: 'button', class: 'gca-go', id: 'gca-push-on', text: T('Turn on notifications', 'Activar avisos'), on: { click: pushOn } }),
    h('button', { type: 'button', class: 'gca-no', id: 'gca-push-not', text: T('Not now', 'Ahora no'), on: { click: function(){ ls('gc_push_dismiss', String(Date.now())); hidePushCard(); } } })
  ]));
}
if (pushSupported()) { try { navigator.serviceWorker.getRegistration('/').then(function(r){ return r && r.pushManager.getSubscription(); }).then(function(s){ if (s) { PUSH.endpoint = s.endpoint; } }).catch(function(){}); } catch (e) {} }

/* ── the loop: watch the page (it redraws itself) ── */
var wasCustomer = false;
function tick(){
  var c = customer();
  if (c && !wasCustomer) { wasCustomer = true; var old = $('gcp-install'); if (old) old.remove(); paintMenu(); load(); deepLink(); setTimeout(showCard, 2500); }
  else if (!c && wasCustomer) { wasCustomer = false; U = null; hideCard(); paintMenu(); }
  else if (c) { var k = (main() || {}).pid + '|' + (main() || {}).tab; if (k !== lastKey) { var pidChanged = lastKey && lastKey.split('|')[0] !== k.split('|')[0]; lastKey = k; if (pidChanged) load(); else onTab(); } paintBadges(); if (!$('gca-mbtn')) paintMenu(); if (installEvt() && !$('gca-card')) showCard(); }
}
function watch(){
  var t = $('tabs');
  if (t && window.MutationObserver) new MutationObserver(function(){ setTimeout(tick, 0); }).observe(t, { attributes: true, subtree: true, childList: true, attributeFilter: ['hidden', 'aria-selected'] });
  setInterval(tick, 2000);
  document.addEventListener('visibilitychange', function(){ if (!document.hidden && customer()) load(); });
  setInterval(function(){ if (!document.hidden && customer()) load(); }, 5 * 60e3);
  tick();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();

window.GCPortalApp = {
  /* the GCP block's old bar asks: true = a customer (this file's card), false = sub / GC, null = not known yet */
  owns: function(){ if (window.GCPartner || window.__GCG_WANT__) return false; return customer() ? true : null; },
  install: install, howTo: howTo, prepare: prepare, pushOn: pushOn, pushOff: pushOff, reload: load,
  state: function(){ return { unread: U, total: total(), push: PUSH, canInstall: canInstall(), standalone: standalone(), ios: IOS, iosOther: IOS_OTHER }; }
};
})();
