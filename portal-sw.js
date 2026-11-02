/* GrayCo Portal — the service worker that makes the portal installable like an app (patch GCP).
   SAFE BY DESIGN:
   • never caches anything private: /.netlify/functions/* (job data, photo links, documents, sign-in) always goes to
     the network and is never stored; neither is any request that is not a plain GET, nor anything from another site
     (Supabase file links, CompanyCam);
   • the page itself is network-first: the newest version is used whenever there is a signal; the last copy only
     opens when the phone is offline (the page then says it could not load the job);
   • only the page shell and its icons are kept, in one cache that is replaced by each new version of this file. */
'use strict';
var CACHE = 'gc-portal-shell-v2';
var SHELL = ['/portal-pwa.js', '/portal-logo.png', '/portal-icon-192.png', '/portal-icon-512.png', '/portal.webmanifest'];
self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL).catch(function(){}); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== CACHE && k.indexOf('gc-portal-') === 0; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
var OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;padding:24px;background:#F6F3EC;color:#14202E">You are offline. Check your signal and try again, or call GrayCo <a href="tel:9015850944">901-585-0944</a>.</body>';
self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;
  var url; try { url = new URL(req.url); } catch (x) { return; }
  if (url.origin !== self.location.origin) return;                       /* file links, CompanyCam: straight through */
  if (url.pathname.indexOf('/.netlify/') === 0) return;                    /* private data: never cached */
  if (req.mode === 'navigate') {                                           /* the page: newest first, offline copy last */
    e.respondWith(fetch(req).then(function(r){
      if (r && r.ok && r.type === 'basic') { var cp = r.clone(); caches.open(CACHE).then(function(c){ c.put('/__shell__', cp); }); }
      return r;
    }).catch(function(){
      return caches.open(CACHE).then(function(c){ return c.match('/__shell__'); }).then(function(r){ return r || new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }); });
    }));
    return;
  }
  if (SHELL.indexOf(url.pathname) >= 0) {
    e.respondWith(caches.open(CACHE).then(function(c){
      return c.match(req).then(function(hit){
        var net = fetch(req).then(function(r){ if (r && r.ok) c.put(req, r.clone()); return r; }).catch(function(){ return hit; });
        return hit || net;
      });
    }));
  }
});
/* patch PORTALAPP: a push from GrayCo (only after the customer turned notifications on): show it, put the number on the
   app icon, and a tap opens the portal on that section. The push carries a short title and the number — never the
   item's words. Only addresses on this site are ever opened. */
function sameSite(u){ try { var x = new URL(u || '/', self.location.origin); return x.origin === self.location.origin ? x.href : self.location.origin + '/'; } catch (e) { return self.location.origin + '/'; } }
self.addEventListener('push', function(e){
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = {}; }
  var n = typeof d.count === 'number' ? d.count : null, nav = self.navigator || {};
  var jobs = [self.registration.showNotification(String(d.title || 'GrayCo').slice(0, 120), { body: String(d.body || 'Tap to open your GrayCo portal.').slice(0, 200), tag: String(d.tag || 'gc-portal'), renotify: true,
    icon: '/portal-icon-192.png', badge: '/portal-icon-192.png', data: { url: sameSite(d.url) } })];
  if (n != null && nav.setAppBadge) jobs.push((n > 0 ? nav.setAppBadge(n) : nav.clearAppBadge()).catch(function(){}));
  e.waitUntil(Promise.all(jobs));
});
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = sameSite(e.notification.data && e.notification.data.url);
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list){
    for (var i = 0; i < list.length; i++) { var c = list[i]; if (c.url.indexOf(self.location.origin) === 0 && 'focus' in c) { return (c.navigate ? c.navigate(url).catch(function(){ return c; }) : Promise.resolve(c)).then(function(w){ return (w || c).focus(); }); } }
    return self.clients.openWindow(url);
  }));
});
