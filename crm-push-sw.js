/* GrayCo CRM — phone notifications (patch AWAY) and the CRM's saved copy (patch FASTOPEN).
   PUSH: shows a push from the CRM (staff phones that turned notifications on in GrayCo Field) and opens the approval a tap asks
   for — only addresses on this site.
   FASTOPEN (11/19, owner: "Took a long time to open up too"): the CRM page itself (/ and /index.html — nothing else: no data,
   no function, no other page, no other site) can open from a copy kept on the device, so a weak signal no longer means a 6 MB
   download before anything shows. ONLY the page; the data still comes from the cloud as before.
     • the copy lives in the cache "gc-crm-shell-v1": one file (the page) and a small note (/__gc_shell_meta: which build it is,
       the mode). The PAGE fills and updates it (it checks /version.txt, downloads a new build when the phone is idle and checks
       the download really is that build before keeping it); this worker only answers with it;
     • "fast" (a phone / GrayCo Field — set by the page): the saved copy opens at once. If the page has seen that a newer build
       is live and its download is not finished yet ("stale"), a reload goes to the network as before (the "Tap to update"
       always gets the new build); with no signal at all, the saved copy;
     • "safe" (a desk, the default): the network first, exactly as before; the saved copy only when there is no answer in 8 s
       or no signal;
     • an out-of-date copy that opens is held by the CRM's stale gate (REGFIX) like any cached copy: no automatic uploads or
       sweeps until it updates; the BOOTWATCH banner offers the update;
     • ?nosw=1 on the address skips the copy; localStorage gc_fastopen_sw_off = '1' (the page tells this worker) turns it off
       on the device and empties the cache; a version of this file without the fetch handler turns it off everywhere.
   It tells the page what it answered (message gcShellQ → gcShellA), for BOOTWATCH and the tests. */
'use strict';
var SHELL = 'gc-crm-shell-v1', PAGE = '/index.html', META = '/__gc_shell_meta';
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
function sameSite(u){ try { var x = new URL(u || '/', self.location.origin); return x.origin === self.location.origin ? x.href : self.location.origin + '/'; } catch (e) { return self.location.origin + '/'; } }
self.addEventListener('push', function(e){
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? String(e.data.text()).slice(0, 200) : '' }; }
  var nav = self.navigator || {}, n = typeof d.count === 'number' ? d.count : null;
  var jobs = [self.registration.showNotification(String(d.title || 'GrayCo CRM').slice(0, 120), { body: String(d.body || 'Tap to open the CRM.').slice(0, 240), tag: String(d.tag || 'gc-staff'), renotify: true,
    icon: '/gcphotos-192.png', badge: '/gcphotos-192.png', data: { url: sameSite(d.url || d.link) } })];
  if (n != null && nav.setAppBadge) jobs.push(nav.setAppBadge(n).catch(function(){}));
  e.waitUntil(Promise.all(jobs));
});
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = sameSite(e.notification.data && e.notification.data.url);
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list){
    for (var i = 0; i < list.length; i++) { var c = list[i]; if (c.url.indexOf(self.location.origin) === 0 && 'focus' in c) {
      try { c.postMessage({ gcOpen: url }); } catch (x) {}
      return (c.navigate ? c.navigate(url).catch(function(){ return c; }) : Promise.resolve(c)).then(function(w){ return (w || c).focus(); });
    } }
    return self.clients.openWindow(url);
  }));
});

/* ── FASTOPEN: the saved page ── */
var served = {};   /* new page (client id) → what it was answered with; the page asks once */
function remember(id, o){ try { if (!id) return; served[id] = o; var ks = Object.keys(served); if (ks.length > 20) delete served[ks[0]]; } catch (e) {} }
function readMeta(c){ return c.match(META).then(function(r){ return r ? r.json() : null; }).catch(function(){ return null; }); }
function netFirst(req, wait){
  return new Promise(function(res, rej){
    var done = false, t = wait ? setTimeout(function(){ if (!done) { done = true; rej(new Error('no answer in ' + wait + ' ms')); } }, wait) : 0;
    fetch(req).then(function(r){ if (done) return; done = true; clearTimeout(t); res(r); }, function(e){ if (done) return; done = true; clearTimeout(t); rej(e); });
  });
}
self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;               /* data, scripts, functions, uploads: never touched */
  var u; try { u = new URL(req.url); } catch (x) { return; }
  if (u.origin !== self.location.origin || (u.pathname !== '/' && u.pathname !== '/index.html')) return;   /* other pages: as before */
  if (/(^|[?&])nosw=/.test(u.search)) return;
  var id = e.resultingClientId || '', t0 = Date.now();
  e.respondWith(caches.open(SHELL).then(function(c){
    return readMeta(c).then(function(meta){
      if (!meta || !meta.build || meta.off) return null;
      return c.match(PAGE).then(function(hit){ return hit ? { hit: hit, meta: meta } : null; });
    });
  }).catch(function(){ return null; }).then(function(s){
    if (s && s.meta.mode === 'fast' && !s.meta.stale) { remember(id, { from: 'cache', build: s.meta.build, mode: 'fast', ms: Date.now() - t0 }); return s.hit; }
    var wait = s ? (s.meta.mode === 'fast' ? 0 : 8000) : 0;
    return netFirst(req, wait).then(function(r){
      remember(id, { from: 'network', build: s ? s.meta.build : '', mode: s ? s.meta.mode : '', stale: !!(s && s.meta.stale), ms: Date.now() - t0 });
      return r;
    }, function(err){
      if (s) { remember(id, { from: 'cache-offline', build: s.meta.build, mode: s.meta.mode, why: String(err && err.message || err).slice(0, 80), ms: Date.now() - t0 }); return s.hit; }
      throw err;
    });
  }));
});
self.addEventListener('message', function(e){
  var d = e.data || {}, src = e.source;
  if (d.gcShellQ) { try { src && src.postMessage({ gcShellA: served[src.id] || { from: 'unknown' } }); } catch (x) {} return; }
  if (d.gcShellOff) {   /* this device turned the saved copy off: empty it, remember "off" */
    e.waitUntil(caches.delete(SHELL).then(function(){ return caches.open(SHELL); }).then(function(c){
      return c.put(META, new Response(JSON.stringify({ off: true, at: Date.now() }), { headers: { 'content-type': 'application/json' } }));
    }).catch(function(){}));
  }
});
