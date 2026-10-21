/* GrayCo Portal — the service worker that makes the portal installable like an app (patch GCP).
   SAFE BY DESIGN:
   • never caches anything private: /.netlify/functions/* (job data, photo links, documents, sign-in) always goes to
     the network and is never stored; neither is any request that is not a plain GET, nor anything from another site
     (Supabase file links, CompanyCam);
   • the page itself is network-first: the newest version is used whenever there is a signal; the last copy only
     opens when the phone is offline (the page then says it could not load the job);
   • only the page shell and its icons are kept, in one cache that is replaced by each new version of this file. */
'use strict';
var CACHE = 'gc-portal-shell-v1';
var SHELL = ['/portal-logo.png', '/portal-icon-192.png', '/portal-icon-512.png', '/portal.webmanifest'];
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
