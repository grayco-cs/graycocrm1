/* GrayCo website — tracking, call tracking and the estimate form, shared by every page (the main site and the
   landing pages). Nothing here loads until an ID is set.

   Where the IDs come from (first one set wins):
     1. the website editor: gear → "Footer, Google & social links" (Google Analytics ID, Google Ads ID + conversion
        labels, Meta pixel ID, CallRail swap script) — saved with the site content (/.netlify/functions/get-content)
     2. the CRM: Marketing → 🌐 Website, pixels & guides (crm.grayco-cs.com mkt-public ?site=1)

   What it sends:
     page_view (GA4) · generate_lead + the Google Ads "form" conversion when the form goes through ·
     click_to_call + the Google Ads "call" conversion on every tel: link tap (CallRail, once live, reports the call
     itself to Google Ads).
   The form posts to the CRM (website-intake) with where the visitor came from (gclid / utm_* / referrer, kept 90 days
   in this browser) — the same key the main site uses (gc_attrib). */
(function(){
  'use strict';
  if (window.GC) return;
  var CRM = 'https://crm.grayco-cs.com', INTAKE = CRM + '/.netlify/functions/website-intake', PUBLIC = CRM + '/.netlify/functions/mkt-public';
  var KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'gc', 'ref'];
  var cfg = null, ready = false, token = null, tokenAt = 0;

  /* ── where the visitor came from ── */
  function capture(){
    try {
      var q = new URLSearchParams(location.search), a = {};
      KEYS.forEach(function(k){ var v = q.get(k); if (v) a[k] = v.slice(0, 120); });
      if (!Object.keys(a).length && document.referrer) {
        var h = new URL(document.referrer).hostname.replace(/^www\./, '');
        if (!/grayco-cs\.com$/.test(h)) {
          var se = /(^|\.)google\./.test(h) ? 'google' : /(^|\.)bing\.com$/.test(h) ? 'bing' : /duckduckgo|yahoo/.test(h) ? h.split('.')[0] : '';
          if (se) { a.utm_source = se; a.utm_medium = 'organic'; }
          else if (/facebook|instagram|nextdoor/.test(h)) { a.utm_source = h.split('.')[0]; a.utm_medium = 'social'; }
          else { a.utm_source = h.slice(0, 60); a.utm_medium = 'referral'; }
        }
      }
      if (!Object.keys(a).length) return;
      var old = JSON.parse(localStorage.getItem('gc_attrib') || 'null');
      if (old && !(a.gclid || a.fbclid || a.gc || q.get('utm_source')) && Date.now() - old.t < 90 * 864e5) return;
      localStorage.setItem('gc_attrib', JSON.stringify({ t: Date.now(), a: a, landing: location.pathname }));
    } catch (e) {}
  }
  function attribution(){ try { var o = JSON.parse(localStorage.getItem('gc_attrib') || 'null'); if (o && Date.now() - o.t < 90 * 864e5) return Object.assign({}, o.a); } catch (e) {} return {}; }
  capture();

  /* ── tags ── */
  function script(src, attrs){ var s = document.createElement('script'); s.async = true; s.src = src; Object.keys(attrs || {}).forEach(function(k){ s.setAttribute(k, attrs[k]); }); document.head.appendChild(s); }
  function clean(v, re){ v = String(v || '').trim(); return re.test(v) ? v : ''; }
  /* o: { ga, adsId, adsFormLabel, adsCallLabel, metaPixel, callrail } — opts.spa: the main site sends its own page views */
  function init(o, opts){
    if (ready) return; ready = true; opts = opts || {};
    cfg = {
      ga: clean(o.ga, /^G-[A-Z0-9]{4,}$/i), ads: clean(o.adsId, /^AW-\d{5,}$/), formLabel: clean(o.adsFormLabel, /^[\w-]{4,}$/), callLabel: clean(o.adsCallLabel, /^[\w-]{4,}$/),
      meta: clean(o.metaPixel, /^\d{8,20}$/), callrail: clean(o.callrail, /^(https:)?\/\/cdn\.callrail\.com\/[\w\/.-]+\.js$/)
    };
    if (cfg.ga || cfg.ads) {
      script('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(cfg.ga || cfg.ads));
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function(){ dataLayer.push(arguments); };
      gtag('js', new Date());
      if (cfg.ga) gtag('config', cfg.ga, opts.spa ? { send_page_view: false } : {});
      if (cfg.ads) gtag('config', cfg.ads);
    }
    if (cfg.meta) {
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', cfg.meta); fbq('track', 'PageView');
    }
    if (cfg.callrail) script(cfg.callrail.replace(/^\/\//, 'https://'));   /* swaps (901) 585-0944 for the visitor's tracking number */
  }
  function conversion(kind, extra){
    try {
      if (typeof gtag === 'function') {
        if (kind === 'form') gtag('event', 'generate_lead', Object.assign({ form: document.body.dataset.landing || location.pathname }, extra || {}));
        if (kind === 'call') gtag('event', 'click_to_call', { page: location.pathname });
        var label = cfg && (kind === 'form' ? cfg.formLabel : cfg.callLabel);
        if (cfg && cfg.ads && label) gtag('event', 'conversion', { send_to: cfg.ads + '/' + label });
      }
      if (typeof fbq === 'function') fbq('track', kind === 'form' ? 'Lead' : 'Contact');
    } catch (e) {}
  }
  document.addEventListener('click', function(e){ var a = e.target.closest && e.target.closest('a[href^="tel:"]'); if (a) conversion('call'); }, true);

  /* ── the estimate form (landing pages: <form data-gc-form data-type data-need>) ── */
  function getToken(){
    if (token && Date.now() - tokenAt < 20 * 3600e3) return Promise.resolve(token);
    return fetch(INTAKE + '?form=1', { cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(j){ if (j && j.token) { token = j.token; tokenAt = Date.now(); } return token; }, function(){ return null; });
  }
  function live(){ return /grayco-cs\.com$|netlify\.app$/.test(location.hostname); }
  function send(form){
    var d = new FormData(form), msg = form.querySelector('.msg'), btn = form.querySelector('button[type=submit]');
    var say = function(t, bad){ if (msg) { msg.textContent = t; msg.style.color = bad ? '#B42318' : ''; } };
    var name = String(d.get('name') || '').trim(), phone = String(d.get('phone') || '').trim(), email = String(d.get('email') || '').trim();
    if (!name) { say('Please add your name.', true); return; }
    if (!phone && !email) { say('Please add a phone number or an e-mail so we can reach you.', true); return; }
    var addr = String(d.get('address') || '').trim(), zip = (addr.match(/\b3[78]\d{3}\b|\b72\d{3}\b/) || [''])[0];
    var town = document.body.dataset.town || '';
    var body = Object.assign({ type: form.dataset.type || 'estimate', service: form.dataset.need || '', name: name, phone: phone, email: email,
      address: /^\d{5}$/.test(addr) ? '' : addr, zip: zip, city: town, state: town ? 'TN' : '', message: String(d.get('message') || ''),
      website: d.get('website'), page: location.href.slice(0, 300), via: 'grayco-cs.com ' + (document.body.dataset.landing ? 'landing page /' + document.body.dataset.landing : 'form') }, attribution());
    if (btn) btn.disabled = true; say('Sending…');
    if (!live()) { say('Preview only — on grayco-cs.com this goes to the GrayCo CRM.'); if (btn) btn.disabled = false; return; }
    getToken().then(function(t){
      body.token = t;
      return fetch(INTAKE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }).then(function(r){ return r.json().then(function(j){ return { r: r, j: j }; }); }).then(function(x){
      if (btn) btn.disabled = false;
      if (x.r.ok && x.j.ok !== false) { form.reset(); say('Thank you — we got it and will reply within one business day.'); conversion('form', { need: form.dataset.need || '' }); return; }
      if (/reload/i.test(x.j.error || '')) token = null;
      say(x.j.error || 'We could not send that — please call (901) 585-0944.', true);
    }).catch(function(){ if (btn) btn.disabled = false; say('We could not send that — please call (901) 585-0944.', true); });
  }
  document.addEventListener('submit', function(e){ var f = e.target; if (f && f.hasAttribute && f.hasAttribute('data-gc-form')) { e.preventDefault(); send(f); } });

  /* ── the CRM's public data: tag IDs, customer reviews (with permission), jobs done per town ── */
  var siteP = null;
  function site(){ if (!siteP) siteP = fetch(PUBLIC + '?site=1').then(function(r){ return r.ok ? r.json() : {}; }, function(){ return {}; }); return siteP; }
  function reviews(){
    var box = document.getElementById('reviews-list'); if (!box) return;
    site().then(function(s){
      var town = (document.body.dataset.town || '').toLowerCase(), svc = (document.body.dataset.service || '').toLowerCase().split(' ')[0];
      var all = (s && s.testimonials) || [];
      var pick = all.filter(function(t){ return town ? String(t.city || '').toLowerCase().indexOf(town) >= 0 : svc && String(t.service || '').toLowerCase().indexOf(svc) >= 0; });
      if (pick.length < 2) pick = pick.concat(all.filter(function(t){ return pick.indexOf(t) < 0; })).slice(0, 6);
      if (!pick.length) return;
      var esc = function(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
      box.innerHTML = pick.slice(0, 6).map(function(t){ return '<div class="rv"><p>“' + esc(t.text) + '”</p><span>' + esc(t.name) + (t.city ? ' · ' + esc(t.city) : '') + '</span></div>'; }).join('');
      document.getElementById('reviews').hidden = false;
    });
  }

  window.GC = { init: init, conversion: conversion, attribution: attribution, site: site, send: send };

  /* landing pages start themselves; the main site (index.html) calls GC.init with its own content */
  if (document.documentElement && !window.__GC_SPA) {
    var go = function(){
      if (!document.body || !document.body.hasAttribute('data-landing')) return;
      reviews();
      Promise.all([fetch('/.netlify/functions/get-content', { cache: 'no-store' }).then(function(r){ return r.ok ? r.json() : {}; }, function(){ return {}; }), site()]).then(function(x){
        var f = (x[0] && x[0].footer) || {}, px = (x[1] && x[1].pixels) || {};
        var ads = String(px.ads || '').split('/');
        init({ ga: f.ga || px.gtag, adsId: f.adsId || ads[0], adsFormLabel: f.adsFormLabel || ads[1], adsCallLabel: f.adsCallLabel, metaPixel: f.metaPixel || px.meta, callrail: f.callrail });
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
})();
