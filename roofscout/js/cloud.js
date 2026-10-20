// GrayCo sign-in + the shared database (the CRM's Supabase project).
//
// One sign-in for the CRM and RoofScout: the session is kept under the same
// browser key the CRM uses (gc_auth_v1), in the same shape, so at
// crm.grayco-cs.com/roofscout/ someone signed in to one is signed in to the other.
// (At roofscout.grayco-cs.com the browser keeps a separate sign-in.)
// As the 🏠 RoofScout tab INSIDE the CRM (a same-site frame), RoofScout does not keep a
// sign-in of its own at all: it asks the CRM page for the sign-in the CRM is using
// (window.parent.__GC_AUTH__), and the CRM renews it. So it never shows its own sign-in
// card while the CRM is signed in, and it can never sign the CRM out. Who may get in
// is the CRM's staff list (gc_staff); people are added and removed in the CRM
// (💎 → Team access). The anon key below is public by design: on its own it
// opens nothing, because every table is locked to signed-in staff.
(function (root) {
  'use strict';

  var SB_URL = 'https://ieeonhpfahmwwecizdut.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW9uaHBmYWhtd3dlY2l6ZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTU2MDgsImV4cCI6MjA4ODgzMTYwOH0.imxBPB0xD4LKy40smBWSUq27iwpCy6fEOMtVx8Cu8ls';
  var KEY = 'gc_auth_v1';
  var ACT = 'gc_auth_last_active';

  function low(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

  // The CRM page around us, when RoofScout is its tab (same site, so it can be asked directly).
  function crm() {
    try {
      if (root.self === root.top) return null;
      var a = root.parent && root.parent.__GC_AUTH__;
      return a && typeof a.session === 'function' && typeof a.fresh === 'function' ? a : null;
    } catch (e) { return null; }   // another site framed us: no CRM to ask
  }
  function good(j) { return !!(j && j.access_token && j.refresh_token && j.email); }

  // Kept here too, in case the browser refuses to save it (storage full or blocked).
  var mem = null;
  function disk() {
    try {
      var j = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (good(j)) return j;
    } catch (e) { /* storage blocked */ }
    return null;
  }
  function load() {
    var c = crm();
    if (c) { try { var s = c.session(); return good(s) ? s : null; } catch (e) { return null; } }
    var d = disk();
    if (d) return d;
    return mem && good(mem) ? mem : null;
  }
  function store(s) {
    mem = s || null;
    try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  }
  function signedOutError() { return CloudError('Signed out.', 'signed-out'); }

  // Same shape the CRM writes, so either app can pick up the other's session.
  function fromAuth(j, prev) {
    var u = j.user || {};
    return {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
      email: low(u.email || (prev && prev.email)),
      uid: u.id || (prev && prev.uid) || '',
      role: prev ? prev.role : '',
      roleKnown: prev ? !!prev.roleKnown : false,
      validatedAt: Date.now()
    };
  }

  function CloudError(message, code, status) {
    var e = new Error(message);
    e.code = code || 'error';
    e.status = status || 0;
    return e;
  }

  function authPost(path, body, token) {
    var h = { apikey: ANON, 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    return fetch(SB_URL + '/auth/v1/' + path, { method: 'POST', headers: h, body: JSON.stringify(body || {}) })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = {}; try { j = JSON.parse(t); } catch (e) { /* not JSON */ }
          return { ok: r.ok, status: r.status, json: j };
        });
      }, function () { return { ok: false, status: 0, net: true, json: {} }; });
  }

  function signIn(email, password) {
    return authPost('token?grant_type=password', { email: low(email), password: password }).then(function (r) {
      if (r.ok && r.json.access_token) {
        var s = fromAuth(r.json, null);
        store(s);            // inside the CRM, the CRM picks this up from storage and signs in too
        return s;            // never null: a refused storage write must not end in "nothing happens"
      }
      if (r.net) throw CloudError('Could not reach the GrayCo sign-in service. Check the internet connection.', 'offline');
      throw CloudError('Email or password is not right.', 'bad-login', r.status);
    });
  }

  function signOut() {
    var c = crm();
    if (c) { try { if (c.email()) { c.signOut(); return; } } catch (e) { /* fall through */ } }
    var s = load();
    store(null);
    if (s) authPost('logout?scope=local', {}, s.access_token);
  }

  var refreshing = null;
  function refresh() {
    if (refreshing) return refreshing;
    var c = crm();
    if (c) {
      // The CRM renews its own sign-in; RoofScout never uses (or uses up) the refresh token itself.
      refreshing = Promise.resolve().then(function () { return typeof c.renew === 'function' ? c.renew() : c.fresh(); })
        .then(function (s) { refreshing = null; if (!good(s)) throw signedOutError(); return s; },
          function (e) { refreshing = null; throw e && e.code ? e : signedOutError(); });
      return refreshing;
    }
    refreshing = (function () {
      var s = load();
      if (!s) return Promise.reject(CloudError('Signed out.', 'signed-out'));
      return authPost('token?grant_type=refresh_token', { refresh_token: s.refresh_token }).then(function (r) {
        if (r.ok && r.json.access_token) { var n = fromAuth(r.json, s); store(n); return n; }
        // The CRM (or another tab) may have refreshed first, which uses up the old token.
        var d = disk();
        if (d && d.refresh_token !== s.refresh_token && d.expires_at * 1000 > Date.now() + 60e3) return d;
        if (r.net || r.status >= 500 || r.status === 429) throw CloudError('Could not reach the GrayCo database. Check the internet connection.', 'offline');
        store(null);
        throw CloudError('Your sign-in has ended. Please sign in again.', 'signed-out', r.status);
      });
    })().then(function (s) { refreshing = null; return s; }, function (e) { refreshing = null; throw e; });
    return refreshing;
  }

  function token() {
    var c = crm();
    if (c) {
      return Promise.resolve().then(function () { return c.fresh(); }).then(function (s) {
        if (!good(s)) throw signedOutError();
        return s;
      }, function () { throw signedOutError(); });
    }
    var s = load();
    if (!s) return Promise.reject(signedOutError());
    // Another tab may have refreshed already; otherwise refresh a little before it runs out.
    if (s.expires_at * 1000 - Date.now() > 90e3) return Promise.resolve(s);
    return refresh();
  }

  // Database call: path like "rs_leads?select=*". Returns parsed JSON (or null).
  function rest(method, path, body, prefer, retried) {
    return token().then(function (s) {
      var h = { apikey: ANON, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' };
      if (prefer) h.Prefer = prefer;
      return fetch(SB_URL + '/rest/v1/' + path, { method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
        .then(null, function () { throw CloudError('Could not reach the GrayCo database. Check the internet connection.', 'offline'); })
        .then(function (r) {
          if (r.status === 401 && !retried) return refresh().then(function () { return rest(method, path, body, prefer, true); });
          return r.text().then(function (t) {
            var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { /* not JSON */ }
            if (r.ok) return j;
            var code = (j && j.code) || '';
            // Table missing: the setup script hasn't been run on this project yet.
            if (r.status === 404 || code === '42P01' || code === 'PGRST205') throw CloudError('RoofScout\'s tables are not in the database yet.', 'no-tables', r.status);
            if (r.status === 401 || r.status === 403 || code === '42501') throw CloudError('You do not have permission to do that.', 'denied', r.status);
            throw CloudError((j && (j.message || j.hint)) || ('Database error ' + r.status), 'error', r.status);
          });
        });
    });
  }

  // Change the password for this one GrayCo sign-in (CRM and RoofScout alike).
  function setPassword(pw) {
    return token().then(function (s) {
      return fetch(SB_URL + '/auth/v1/user', {
        method: 'PUT',
        headers: { apikey: ANON, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw })
      }).then(function (r) {
        if (r.ok) return true;
        return r.json().then(function (j) { throw CloudError(j.msg || j.message || 'Password not changed.', 'error', r.status); },
          function () { throw CloudError('Password not changed.', 'error', r.status); });
      });
    });
  }

  // Call one of the site's server functions (/.netlify/functions/<name>) as the signed-in person.
  function fn(name, method, body, query) {
    return token().then(function (s) {
      return fetch('/.netlify/functions/' + name + (query ? '?' + query : ''), {
        method: method || 'GET',
        headers: { Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      }).then(null, function () { throw CloudError('Could not reach the GrayCo server. Check the internet connection.', 'offline'); })
        .then(function (r) {
          return r.text().then(function (t) {
            var j = {}; try { j = t ? JSON.parse(t) : {}; } catch (e) { /* not JSON */ }
            if (r.ok) return j;
            if (r.status === 404 && !j.error) throw CloudError('This feature is not on the website yet (deploy needed).', 'missing', 404);
            throw CloudError(j.error || ('Server error ' + r.status), j.code || 'error', r.status);
          });
        });
    });
  }

  // Keep the CRM's idle timer from signing someone out while they work in RoofScout.
  var lastTouch = 0;
  function touch() {
    var n = Date.now();
    if (n - lastTouch < 60e3) return;
    lastTouch = n;
    try { localStorage.setItem(ACT, String(n)); } catch (e) { /* ignore */ }
    var c = crm();
    if (c && typeof c.touch === 'function') { try { c.touch(); } catch (e) { /* ignore */ } }
  }

  root.Cloud = {
    session: load,
    embedded: function () { return !!crm(); },
    signIn: signIn,
    signOut: signOut,
    rest: rest,
    setPassword: setPassword,
    fn: fn,
    touch: touch
  };
})(this);
