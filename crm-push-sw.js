/* GrayCo CRM — phone notifications only (patch AWAY). It caches NOTHING and never answers a page request (no fetch handler):
   the CRM always loads fresh from the network, as before. It only shows a push from the CRM (staff phones that turned
   notifications on in GrayCo Field) and opens the approval a tap asks for — only addresses on this site. */
'use strict';
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
