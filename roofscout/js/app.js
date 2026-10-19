// RoofScout app: sign-in, the seven sections, the lead editor and printing.
(function () {
  'use strict';
  var esc = U.esc, money = U.money, moneyShort = U.moneyShort, num = U.num;
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };

  var B = null;            // the data backend: Data.cloud(...) or Data.demo()
  var state = null;
  var me = null;
  var tab = 'map';
  var map = null;
  var prefs = Store.prefs();
  var pollTimer = null;
  var waitingState = null;  // newer data from the database, held while someone is typing
  // Per-visit view settings (filters, sort): not saved.
  var ui = {
    leads: { q: '', kind: 'commercial', stage: '', cond: '', sort: 'priority', dir: -1 },
    scan: { sort: 'score', dir: -1, hideLeads: false, opts: null }
  };

  // ---- Helpers ------------------------------------------------------------

  function isCloud() { return B && B.mode === 'cloud'; }
  function isAdmin() { return me && me.role === 'admin'; }
  function userById(id) { return state.users.filter(function (u) { return u.id === id; })[0]; }
  function leadById(id) { return state.leads.filter(function (l) { return l.id === id; })[0]; }
  function rtOf(lead) {
    return state.settings.roofTypes.filter(function (t) { return t.id === lead.roofType; })[0] ||
      state.settings.roofTypes[0] || { id: '?', name: 'Unknown', mat: 0, labor: 0, perSquare: 0 };
  }
  function estOf(lead) { return Pricing.estimate(lead.areaSqft, rtOf(lead), state.settings.margin); }
  function valueOf(lead) { return estOf(lead).price; }
  function coatingOf(lead) { return lead.roofType === 'metal' ? Pricing.coating(lead.areaSqft, state.settings.coating) : null; }
  function isOpen(lead) { return lead.stage !== 'Won' && lead.stage !== 'Lost'; }
  function userName(id) { var u = userById(id); return u ? u.name : (id && id.indexOf('@') > 0 ? id.split('@')[0] : ''); }

  function report(e) {
    if (!e) return;
    if (e.code === 'signed-out') { signedOut(e.message); return; }
    toast(e.message || String(e), true);
  }

  function log(action, lead, detail) {
    var a = { id: Store.uuid(), ts: Date.now(), user: me.id, lead: lead ? lead.id : null, action: action, detail: detail || '' };
    state.activity.push(a);
    if (state.activity.length > 3000) state.activity = state.activity.slice(-3000);
    B.addActivity(a).then(null, report);
  }

  // Save a change to one lead. On failure the lead goes back to how it was; if
  // someone else saved it first, their version replaces it on screen.
  function commitLead(lead, change) {
    var before = JSON.stringify(lead);
    change(lead);
    lead.touched = true;
    if (!isCloud()) lead.updatedAt = Date.now();
    return B.saveLead(lead).then(function () { return lead; }, function (e) {
      if (e.queued) { toast('No connection: saved on this computer. It will be sent when the connection is back.', true); return lead; }
      Object.keys(lead).forEach(function (k) { delete lead[k]; });
      Object.assign(lead, JSON.parse(before));
      if (e.code === 'conflict') {
        state.leads = state.leads.filter(function (l) { return l.id !== lead.id; });
        if (e.lead) {
          state.leads.push(e.lead);
          if (e.lead.updatedBy) e.message = e.message.replace(e.lead.updatedBy, userName(e.lead.updatedBy));
        }
      }
      report(e);
      throw e;
    });
  }

  function createLead(lead) {
    lead.createdAt = lead.updatedAt = Date.now();
    state.leads.push(lead);
    return B.saveLead(lead).then(function () { return lead; }, function (e) {
      if (e.queued) { toast('No connection: saved on this computer. It will be sent when the connection is back.', true); return lead; }
      state.leads = state.leads.filter(function (l) { return l !== lead; });
      report(e);
      throw e;
    });
  }

  function removeLeads(ids) {
    var keep = state.leads;
    state.leads = state.leads.filter(function (l) { return ids.indexOf(l.id) < 0; });
    return B.deleteLeads(ids).then(null, function (e) { state.leads = keep; report(e); throw e; });
  }

  // Call-list priority: worse roofs and bigger jobs first, further-along deals
  // boosted, residential discounted by its lower grading confidence, and
  // recently called leads pushed down for a few days.
  function priority(lead) {
    var need = (100 - lead.condition) / 100;
    var size = Math.log10(Math.max(valueOf(lead), 10));
    var boost = { New: 1, Contacted: 1.15, Quoted: 1.3 }[lead.stage] || 0;
    var conf = (lead.confidence || 100) / 100;
    var recent = lead.lastCall && (Date.now() - lead.lastCall.ts) < 3 * 864e5 ? 0.4 : 1;
    return need * size * boost * conf * recent;
  }

  function gradeChip(lead) {
    var g = U.grade(lead.condition);
    return '<span class="chip ' + g.cls + '">' + g.label + ' ' + lead.condition + '</span>';
  }
  function tags(lead) {
    return (lead.demo ? '<span class="chip demo">DEMO</span>' : '') +
      (lead.kind === 'residential' ? '<span class="chip res" title="Residential: lower grading confidence from satellite">Res</span>' : '');
  }

  var toastTimer;
  function toast(msg, bad) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (bad ? ' bad' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, bad ? 7000 : 2500);
  }

  function download(name, text, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---- Sign in ------------------------------------------------------------

  // On the website, the GrayCo sign-in is the only way in. Demo mode (no sign-in,
  // nothing shared) exists only when the files are opened on a computer for testing.
  var DEMO_ALLOWED = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  // Opened as the RoofScout tab inside the CRM: the CRM already shows the logo and handles sign-out.
  var EMBEDDED = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
  if (EMBEDDED) document.body.classList.add('embedded');
  $$('.demo-only').forEach(function (el) { if (!DEMO_ALLOWED) el.remove(); });

  function start() {
    if (Store.getMode() === 'demo') {
      if (DEMO_ALLOWED) return startDemo();
      Store.setMode(null);
    }
    var s = Cloud.session();
    if (s) return startCloud(s.email);
    showLogin();
  }

  function showLogin(msg) {
    stopPolling();
    closeModal();
    $('#app').hidden = true;
    $('#loading').hidden = true;
    $('#login').hidden = false;
    $('#login-err').textContent = msg || '';
    $('#login-err').hidden = !msg;
    $('#login-email').focus();
  }

  function showLoading(msg) {
    $('#login').hidden = true;
    $('#app').hidden = true;
    $('#loading-msg').textContent = msg || 'Loading…';
    $('#loading-actions').hidden = true;
    $('#loading').hidden = false;
  }

  function loadFailed(msg) {
    $('#loading-msg').textContent = msg;
    $('#loading-actions').hidden = false;
    $('#loading').hidden = false;
  }

  function startCloud(email) {
    showLoading('Loading the team\'s leads…');
    B = Data.cloud(email);
    B.load().then(function (s) {
      state = s;
      me = userById(String(email).toLowerCase());
      showApp();
      startPolling();
      expireSolar();
      loadSkipStatus();
    }, function (e) {
      if (e.code === 'signed-out' || e.code === 'bad-login') return showLogin(e.code === 'signed-out' ? 'Please sign in again.' : e.message);
      if (e.code === 'no-tables') return loadFailed('RoofScout\'s database is not set up yet. An admin runs docs/roofscout-setup.sql once in Supabase (SQL Editor), then clicks Try again.');
      loadFailed(e.message || 'Could not load RoofScout.');
    });
  }

  function startDemo() {
    if (!DEMO_ALLOWED) return showLogin();
    Store.setMode('demo');
    B = Data.demo();
    B.load().then(function (s) {
      state = s;
      me = userById(Store.getSession()) || state.users.filter(function (u) { return u.role === 'admin'; })[0] || state.users[0];
      Store.setSession(me.id);
      showApp();
    });
  }

  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('#login-form button[type=submit]');
    btn.disabled = true;
    $('#login-err').hidden = true;
    Cloud.signIn($('#login-email').value, $('#login-pass').value).then(function (s) {
      btn.disabled = false;
      $('#login-pass').value = '';
      Store.setMode(null);
      startCloud(s.email);
    }, function (err) {
      btn.disabled = false;
      $('#login-err').textContent = err.message;
      $('#login-err').hidden = false;
    });
  });

  $$('#demo-btn, #loading-demo-btn').forEach(function (b) { b.addEventListener('click', startDemo); });
  $('#retry-btn').addEventListener('click', start);
  $('#loading-signout-btn').addEventListener('click', function () { Cloud.signOut(); showLogin(); });

  $('#logout').addEventListener('click', function () {
    if (isCloud()) Cloud.signOut();
    else { Store.setMode(null); Store.setSession(null); }
    me = null;
    showLogin();
  });

  function signedOut(msg) {
    me = null;
    showLogin(msg || 'Please sign in again.');
  }

  function showApp() {
    $('#login').hidden = true;
    $('#loading').hidden = true;
    $('#app').hidden = false;
    $('#me-name').textContent = me.name + ' · ' + me.role.toUpperCase();
    $('#logout').textContent = isCloud() ? 'Sign out' : 'Exit demo';
    $('#mode-bar').className = 'demo-bar' + (isCloud() ? ' live' : '');
    $('#mode-bar').innerHTML = isCloud()
      ? 'Shared team leads: everyone with a GrayCo CRM sign-in sees the same list. Scan an area for large commercial roofs, or trace a roof on the map, and save it as a lead.'
      : '<b>DEMO MODE</b>: practice only, saved in this browser, not shared. Scan results are made-up sample data.';
    go(tab);
  }

  $('#tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]');
    if (b) go(b.dataset.tab);
  });

  function go(t, keepScroll) {
    tab = t;
    $$('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === t); });
    if (map) { map.remove(); map = null; }
    if (t !== 'map') { measure = null; scanDraw = null; }
    var y = window.scrollY;
    var v = $('#view');
    v.className = 'view view-' + t;
    v.innerHTML = VIEWS[t]();
    if (t === 'map') { initMap(); renderScanResults(); }
    if (t === 'leads') renderLeadTable();
    if (t === 'settings' && isCloud()) {
      Cloud.fn('solar-lookup', 'GET', undefined, 'action=usage').then(function (u) {
        var el = $('#solar-usage');
        if (el) el.textContent = (u.connected ? 'Connected to Google. ' : 'Not connected yet: add GOOGLE_SOLAR_API_KEY in Netlify. ') + 'Used this month: ' + u.usedThisMonth + ' of ' + u.limit + '.';
      }, function (e) { var el = $('#solar-usage'); if (el) el.textContent = e.message; });
      loadSkipStatus().then(function () { var el = $('#skip-status'); if (el) el.textContent = skipStatusText(); });
      Cloud.fn(SCAN_FN, 'GET', undefined, 'action=status').then(function (u) {
        var el = $('#scan-status');
        if (!el) return;
        var names = { shelby: 'Shelby', desoto: 'DeSoto', crittenden: 'Crittenden', permits: 'Memphis permits' };
        el.textContent = 'Scan server ready. Fresh OpenStreetMap downloads in the last 24 hours: ' + u.overpassToday + ' of ' + u.limits.overpassDay + ' (team fair-use limit). ' +
          Object.keys(names).map(function (k) { return names[k] + ': ' + ({ on: 'on', off: 'off', 'no-url': 'on, but needs its address' }[u.sources[k]] || u.sources[k]); }).join(' · ') + '.';
      }, function (e) { var el = $('#scan-status'); if (el) el.textContent = e.code === 'no-tables' ? 'Run docs/roofscout-setup.sql again in Supabase to turn on the area scan.' : e.message; });
    }
    window.scrollTo(0, keepScroll ? y : 0);
    showPending();
  }

  function refresh() { go(tab, true); }

  function showPending() {
    var n = B && B.pending ? B.pending() : 0;
    var el = $('#pending');
    el.hidden = !n;
    el.textContent = n ? n + ' change' + (n === 1 ? '' : 's') + ' waiting to send' : '';
  }

  // ---- Keeping up with the team (shared database) ---------------------------

  function signature(s) {
    return s.leads.map(function (l) { return l.id + '@' + (l._ver || l.updatedAt); }).sort().join('|') +
      '#' + s.activity.length + '#' + JSON.stringify(s.settings) + '#' + JSON.stringify(s.users);
  }

  function busy() {
    var a = document.activeElement;
    return !$('#modal').hidden || !!measure || !!scanDraw || (a && a.closest && a.closest('#view form'));
  }

  function applyState(ns) {
    if (!ns) return;
    if (busy()) { waitingState = ns; return; }
    waitingState = null;
    var changed = signature(ns) !== signature(state);
    state = ns;
    me = userById(me.id) || me;
    $('#me-name').textContent = me.name + ' · ' + me.role.toUpperCase();
    if (changed) refresh(); else showPending();
  }

  function poll() {
    if (!isCloud() || !me) return;
    if (document.visibilityState === 'hidden') return;
    B.poll().then(applyState, function (e) { report(e); showPending(); });
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(poll, 60e3);
  }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  window.addEventListener('focus', function () { if (isCloud() && me) poll(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && isCloud() && me) poll(); });
  ['mousedown', 'keydown', 'touchstart'].forEach(function (ev) {
    document.addEventListener(ev, function () { if (isCloud()) Cloud.touch(); }, { passive: true });
  });

  // ---- Map ----------------------------------------------------------------
  //
  // Finding real leads: scan an area (public data, below), or look at the satellite
  // map, trace a roof's outline to measure it, and save it as a lead. The made-up
  // demo scan exists only in local demo mode (file:// or localhost), never on the website.

  var measure = null;   // { points: [[lat,lng]…], pitch, leadId|null, layer }
  var mapView = null;   // last center/zoom, so a refresh doesn't jump the map
  var draftExtras = null; // outline etc. carried into the "Add lead" form after tracing

  function viewMap() {
    var demo = !isCloud();
    var scoped = scopedLeads();
    var flagged = scoped.filter(function (l) { return l.condition < 70 && isOpen(l); })
      .sort(function (a, b) { return a.condition - b.condition; });
    return '<div class="map-layout">' +
      '<aside class="panel scan-panel">' +
        '<h2>Find roofs</h2>' +
        '<div class="seg" role="group" aria-label="Property type">' +
          ['commercial', 'residential', 'all'].map(function (s) {
            return '<button data-act="scope" data-v="' + s + '" class="' + (prefs.scope === s ? 'on' : '') + '">' +
              (s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)) + '</button>';
          }).join('') +
        '</div>' +
        (prefs.scope !== 'commercial' ? '<p class="note">Residential roofs are harder to judge from satellite (smaller roofs, trees, steep pitch).</p>' : '') +
        '<form id="geo-form" class="geo-form"><input type="search" id="geo-q" placeholder="Go to an address or place…" aria-label="Address"><button class="btn ghost" type="submit">Go</button></form>' +
        '<div id="geo-results"></div>' +
        (demo ? '' : areaScanPanel()) +
        '<label>' + (demo ? 'Area' : 'Map area') + ' <select id="scan-place">' + Store.PLACES.map(function (p) {
          return '<option value="' + p.id + '"' + (p.id === prefs.place ? ' selected' : '') + '>' + esc(p.label) + '</option>';
        }).join('') + '</select></label>' +
        '<div id="measure-box">' + measureBox() + '</div>' +
        // Made-up practice sites: only in local demo mode (file:// or localhost), never on the website.
        (demo ? '<details class="demo-scan"><summary>Demo scan (practice data)</summary>' +
          '<label>Radius (miles)' +
            '<div class="radius-row"><input type="range" id="radius-range" min="1" max="100" value="' + Math.min(prefs.radius, 100) + '">' +
            '<input type="number" id="radius-num" min="0.5" max="500" step="0.5" value="' + prefs.radius + '"></div></label>' +
          '<div class="presets">' + [2, 5, 10, 25, 50].map(function (r) {
            return '<button class="btn ghost sm" data-act="radius" data-v="' + r + '">' + r + ' mi</button>';
          }).join('') + '</div>' +
          '<button class="btn ghost block" data-act="scan">Run demo scan</button></details>' : '') +
        '<div class="legend"><span><i class="dot poor"></i>Poor</span><span><i class="dot fair"></i>Fair</span><span><i class="dot good"></i>Good</span><span><i class="dot won"></i>Won</span></div>' +
        '<h3>Worst roofs (' + flagged.length + ')</h3>' +
        '<ul class="mini-list">' + (flagged.slice(0, 8).map(function (l) {
          return '<li><button data-act="open" data-id="' + esc(l.id) + '">' + gradeChip(l) + ' <span>' + esc(l.name) + '</span><b>' + moneyShort(valueOf(l)) + '</b></button></li>';
        }).join('') || '<li class="muted">No leads yet. Trace a roof to add the first one.</li>') + '</ul>' +
        '<p class="fine">Address search © OpenStreetMap contributors (Nominatim), used only when you click Go, look up a ZIP or city, or add a lead.</p>' +
      '</aside>' +
      '<div class="map-col"><div class="map-wrap"><div id="map" class="map' + (measure || scanDraw ? ' measuring' : '') + '"></div></div>' +
      (demo ? '' : '<section id="scan-results" class="scan-results" aria-label="Scan results" hidden></section>') +
    '</div></div>';
  }

  function measureBox() {
    if (!measure) {
      return '<button class="btn primary block" data-act="trace">📐 Trace a roof → new lead</button>' +
        '<p class="fine">Zoom in close on a roof, click each corner of the roof, then click the first corner again (or Finish).</p>';
    }
    var lead = measure.leadId ? leadById(measure.leadId) : null;
    var n = measure.points.length;
    var area = n >= 3 ? Geo.roofSqft(measure.points, measure.pitch) : 0;
    return '<div class="measure">' +
      '<div class="measure-head">Tracing ' + (lead ? '<b>' + esc(lead.name) + '</b>' : 'a new roof') + '</div>' +
      '<div class="measure-area">' + (n >= 3 ? num(area) + ' ft²' : n + ' corner' + (n === 1 ? '' : 's') + ' so far') + '</div>' +
      '<label>Roof pitch <select id="measure-pitch">' + Geo.PITCHES.map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === measure.pitch ? ' selected' : '') + '>' + esc(p.label) + '</option>';
      }).join('') + '</select></label>' +
      '<p class="fine">Flat / low-slope for most commercial roofs. Steeper roofs have more surface than you see from above, so the pitch adds to the area.</p>' +
      '<div class="btn-row"><button class="btn primary" data-act="trace-done"' + (n < 3 ? ' disabled' : '') + '>Finish</button>' +
      '<button class="btn ghost" data-act="trace-undo"' + (n ? '' : ' disabled') + '>Undo corner</button>' +
      '<button class="btn ghost" data-act="trace-cancel">Cancel</button></div></div>';
  }

  function scopedLeads() {
    var s = prefs.scope;
    return state.leads.filter(function (l) { return s === 'all' || l.kind === s; });
  }

  function centerPlace() {
    return Store.PLACES.filter(function (p) { return p.id === prefs.place; })[0] || Store.PLACES[0];
  }

  function leadColor(l) {
    return l.stage === 'Won' ? '#3b82f6' : l.stage === 'Lost' ? '#9ca3af' : { poor: '#ef4444', fair: '#f59e0b', good: '#22c55e' }[U.grade(l.condition).cls];
  }

  function initMap() {
    var el = $('#map');
    if (!window.L) {
      el.innerHTML = '<div class="map-off">The satellite map needs an internet connection. Everything else works without it.</div>';
      return;
    }
    var c = centerPlace();
    map = L.map(el, { zoomControl: true, maxZoom: 21, doubleClickZoom: !measure });
    // Place the map before adding anything to it.
    if (mapView) map.setView(mapView.center, mapView.zoom);
    else if (!isCloud()) map.fitBounds(L.latLng(c.lat, c.lng).toBounds(prefs.radius * 1609.34 * 2), { padding: [10, 10] });
    else map.setView([c.lat, c.lng], 12);
    // With the company's Esri key the imagery is used under that account (licensed for business);
    // without it, Esri's public tiles are shown.
    var key = (state.settings.map && state.settings.map.esriKey) || '';
    var base = key ? 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/' : 'https://server.arcgisonline.com/ArcGIS/rest/services/';
    var tok = key ? '?token=' + encodeURIComponent(key) : '';
    L.tileLayer(base + 'World_Imagery/MapServer/tile/{z}/{y}/{x}' + tok, {
      maxZoom: 21, maxNativeZoom: 19, attribution: 'Powered by Esri · Imagery © Esri, Maxar, Earthstar Geographics'
    }).addTo(map);
    L.tileLayer(base + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}' + tok, {
      maxZoom: 21, maxNativeZoom: 19
    }).addTo(map);

    if (!isCloud()) {
      L.circle([c.lat, c.lng], { radius: prefs.radius * 1609.34, color: '#f5a524', weight: 2, fillOpacity: 0.05, interactive: false }).addTo(map);
    }

    scopedLeads().forEach(function (l) {
      var color = leadColor(l);
      var tip = esc(l.name) + '<br>' + U.grade(l.condition).label + ' · ' + moneyShort(valueOf(l)) + (l.areaSqft ? ' · ' + num(l.areaSqft) + ' ft²' : '');
      if (Array.isArray(l.outline) && l.outline.length >= 3) {
        L.polygon(l.outline, { color: color, weight: 2, fillOpacity: 0.25 })
          .bindTooltip(tip).on('click', function (e) { if (measure) return; L.DomEvent.stop(e); openLead(l.id); }).addTo(map);
      }
      if (typeof l.lat !== 'number' || typeof l.lng !== 'number') return;
      L.circleMarker([l.lat, l.lng], { radius: l.kind === 'commercial' ? 8 : 5, color: '#fff', weight: 1.5, fillColor: color, fillOpacity: 0.95 })
        .bindTooltip(tip)
        .on('click', function (e) { if (measure) return; L.DomEvent.stop(e); openLead(l.id); })
        .addTo(map);
    });

    map.on('moveend', function () { mapView = { center: map.getCenter(), zoom: map.getZoom() }; });
    map.on('click', function (e) { if (measure) addCorner(e.latlng); else if (scanDraw) scanDrawClick(e.latlng); });
    map.on('mousemove', function (e) { if (scanDraw && scanDraw.first && scanDraw.layer) scanDraw.layer.setBounds([scanDraw.first, e.latlng]); });
    if (measure) drawMeasure();
    if (isCloud()) {
      map.attributionControl.addAttribution('Buildings © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>');
      if (scanDraw) { scanDraw.first = null; scanDraw.layer = null; map.doubleClickZoom.disable(); }
      drawScanLayer();
    }
  }

  // ---- Tracing a roof -------------------------------------------------------

  function startTrace(leadId) {
    var lead = leadId ? leadById(leadId) : null;
    measure = { points: [], pitch: lead && lead.pitch ? lead.pitch : (prefs.scope === 'residential' ? '6' : 'flat'), leadId: leadId || null, layer: null };
    if (lead && typeof lead.lat === 'number') mapView = { center: L.latLng(lead.lat, lead.lng), zoom: 19 };
    if (tab !== 'map') go('map'); else refresh();
    if (map && map.getZoom() < 17) toast('Zoom in close on the roof first, then click its corners.');
  }

  function addCorner(latlng) {
    var pts = measure.points;
    // Clicking the first corner again closes the outline.
    if (pts.length >= 3) {
      var first = map.latLngToContainerPoint(pts[0]), here = map.latLngToContainerPoint(latlng);
      if (first.distanceTo(here) < 12) { finishTrace(); return; }
    }
    pts.push([latlng.lat, latlng.lng]);
    drawMeasure();
  }

  function drawMeasure() {
    if (!map || !measure) return;
    if (measure.layer) measure.layer.remove();
    var g = L.layerGroup();
    var pts = measure.points;
    if (pts.length >= 2) L.polyline(pts.length >= 3 ? pts.concat([pts[0]]) : pts, { color: '#f5a524', weight: 3, dashArray: pts.length >= 3 ? null : '6 6', interactive: false }).addTo(g);
    if (pts.length >= 3) L.polygon(pts, { color: '#f5a524', weight: 0, fillOpacity: 0.25, interactive: false }).addTo(g);
    pts.forEach(function (p, i) {
      L.circleMarker(p, { radius: i === 0 ? 7 : 5, color: '#13294b', weight: 2, fillColor: i === 0 ? '#f5a524' : '#fff', fillOpacity: 1, interactive: false }).addTo(g);
    });
    measure.layer = g.addTo(map);
    var box = $('#measure-box');
    if (box) box.innerHTML = measureBox();
  }

  function cancelTrace() {
    measure = null;
    refresh();
  }

  function finishTrace() {
    if (!measure || measure.points.length < 3) return;
    var pts = measure.points.map(function (p) { return [Math.round(p[0] * 1e7) / 1e7, Math.round(p[1] * 1e7) / 1e7]; });
    var area = Geo.roofSqft(pts, measure.pitch);
    var mid = Geo.centroid(pts);
    var pitch = measure.pitch, leadId = measure.leadId;
    measure = null;

    if (leadId) {
      var l = leadById(leadId);
      if (!l) { refresh(); return; }
      commitLead(l, function (x) {
        x.outline = pts; x.pitch = pitch; x.areaSqft = area;
        if (typeof x.lat !== 'number') { x.lat = mid[0]; x.lng = mid[1]; }
      }).then(function () {
        log('edit', l, 'measured ' + num(area) + ' ft²');
        refresh();
        toast('Measured ' + num(area) + ' ft²');
        leadForm(l);
      }, function () { refresh(); });
      return;
    }

    refresh();
    var kind = prefs.scope === 'residential' ? 'residential' : 'commercial';
    var types = state.settings.roofTypes;
    var rt = (types.filter(function (t) { return t.id === (kind === 'residential' ? 'shingle' : 'tpo'); })[0] || types[0]).id;
    draftExtras = { outline: pts, pitch: pitch };
    var draft = {
      id: '', name: '', address: '', kind: kind, roofType: rt, areaSqft: area,
      condition: 50, confidence: null, issues: [], owner: { name: '', company: '', phone: '', email: '' },
      stage: 'New', assignedTo: me.id, notes: '', dnc: false, source: 'map', demo: false, lat: mid[0], lng: mid[1]
    };
    leadForm(draft);
    // Fill in the street address for that spot (one lookup, because the user asked for this lead).
    reverseGeocode(mid).then(function (addr) {
      var f = $('#lead-form');
      if (!addr || !f || f.dataset.id || f.elements.address.value) return;
      f.elements.address.value = addr.address;
      if (!f.elements.name.value && addr.name) f.elements.name.value = addr.name;
    });
  }

  // ---- Address search (OpenStreetMap Nominatim: only when a person asks) ------

  var NOMINATIM = 'https://nominatim.openstreetmap.org';
  var lastGeo = 0;

  function nominatim(path) {
    // Their usage policy: at most one request a second, and say who is asking (the site's address).
    var wait = Math.max(0, lastGeo + 1100 - Date.now());
    lastGeo = Date.now() + wait;
    return new Promise(function (res) { setTimeout(res, wait); }).then(function () {
      return fetch(NOMINATIM + path, { referrerPolicy: 'strict-origin-when-cross-origin', headers: { Accept: 'application/json' } });
    }).then(function (r) { return r.ok ? r.json() : null; }, function () { return null; });
  }

  function geocode(q) {
    var c = centerPlace();
    // Prefer results around the Memphis area, but don't exclude anything.
    var box = [c.lng - 1.5, c.lat + 1.2, c.lng + 1.5, c.lat - 1.2].join(',');
    return nominatim('/search?format=jsonv2&limit=5&countrycodes=us&viewbox=' + box + '&q=' + encodeURIComponent(q));
  }

  function reverseGeocode(p) {
    return nominatim('/reverse?format=jsonv2&zoom=18&lat=' + p[0] + '&lon=' + p[1]).then(function (j) {
      if (!j || !j.address) return null;
      var a = j.address;
      var street = [a.house_number, a.road].filter(Boolean).join(' ');
      var city = a.city || a.town || a.village || a.hamlet || a.suburb || '';
      var st = a.state_code || String(a['ISO3166-2-lvl4'] || '').replace(/^US-/, '') || a.state || '';
      return { address: [street, city, [st, a.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', '), name: j.name || '', street: street, city: city, state: st, postcode: a.postcode || '' };
    });
  }

  function showGeoResults(list) {
    var box = $('#geo-results');
    if (!box) return;
    if (!list || !list.length) { box.innerHTML = '<p class="fine">No match. Try adding the city, e.g. "4014 Broadway Rd, Bartlett TN".</p>'; return; }
    box.innerHTML = '<ul class="mini-list">' + list.map(function (r, i) {
      return '<li><button data-act="geo-go" data-i="' + i + '"><span>' + esc(r.display_name) + '</span></button></li>';
    }).join('') + '</ul>';
    box._results = list;
  }

  function goTo(lat, lng, zoom) {
    mapView = { center: L.latLng(lat, lng), zoom: zoom || 19 };
    if (map) map.setView(mapView.center, mapView.zoom);
  }

  function setPref(k, v) {
    prefs[k] = v;
    Store.savePrefs(prefs);
    if (k === 'place' || k === 'radius') mapView = null;
    refresh();
  }

  function runScan(btn) {
    var c = centerPlace();
    // Same center + radius + type gives the same demo sites.
    var seed = 0;
    (prefs.place + '|' + prefs.radius + '|' + prefs.scope).split('').forEach(function (ch) { seed = (seed * 31 + ch.charCodeAt(0)) | 0; });
    // Replace demo sites nobody has worked yet; keep anything touched and every real lead.
    var stale = state.leads.filter(function (l) { return l.demo && l.stage === 'New' && !l.touched; }).map(function (l) { return l.id; });
    var now = Date.now();
    var found = Store.demoScan(state, c, prefs.radius, prefs.scope, seed);
    found.forEach(function (f) {
      f.id = Store.newId('L');
      f.stage = 'New';
      f.assignedTo = '';
      f.notes = '';
      f.dnc = false;
      f.createdAt = now;
      f.updatedAt = now;
    });
    btn.disabled = true;
    btn.textContent = 'Scanning…';
    (stale.length ? removeLeads(stale) : Promise.resolve()).then(function () {
      state.leads = state.leads.concat(found);
      return B.addLeads(found).then(null, function (e) {
        state.leads = state.leads.filter(function (l) { return found.indexOf(l) < 0; });
        throw e;
      });
    }).then(function () {
      log('scan', null, found.length + ' demo sites, ' + prefs.radius + ' mi around ' + c.label + ' (' + prefs.scope + ')');
      toast('Scan found ' + found.length + ' demo sites' + (stale.length ? ' (replaced ' + stale.length + ' unworked demo sites)' : ''));
      refresh();
    }, function (e) { report(e); refresh(); });
  }

  // ---- Scan an area (real data) -----------------------------------------------
  //
  // Finds large commercial buildings in an area from public data, through the
  // roofscout-scan server function: OpenStreetMap footprints, county parcels (owner,
  // mailing address, land use, year built), Memphis roof permits and NOAA hail reports.
  // Scored in the browser (js/scan.js) so changing the weights needs no new download.
  // Google Solar is only called per site, when someone clicks 📡 Measure.

  var scanArea = null;     // { bbox: { s, w, n, e }, label }
  var scanDraw = null;     // drawing a rectangle on the map: { first: L.LatLng | null, layer }
  var scanRes = null;      // the latest scan: { sites, running, done, total, errors, skipped, sources, label, bbox, at }
  var scanLayer = null;
  var scanSel = null;      // site id highlighted in the list
  var SCAN_FN = 'roofscout-scan';

  function scanCfg() { return state.settings.areaScan || Store.defaultSettings().areaScan; }
  function scanOpts() {
    if (!ui.scan.opts) {
      var c = scanCfg();
      ui.scan.opts = { min: c.minSqft || 10000, types: Scan.TYPES.map(function (t) { return t.id; }), hailDays: Number(c.hailDays) || 0, mode: 'draw' };
    }
    return ui.scan.opts;
  }

  // Default area: a box about 2 miles across around the admin's default place.
  function defaultScanArea() {
    var p = Store.PLACES.filter(function (x) { return x.id === scanCfg().defaultArea; })[0] || Store.PLACES[1];
    var dLat = 1 / 69, dLng = 1 / (69 * Math.cos(p.lat * Math.PI / 180));
    return { bbox: { s: p.lat - dLat, w: p.lng - dLng, n: p.lat + dLat, e: p.lng + dLng }, label: 'around ' + p.label };
  }
  function currentArea() { return scanArea || defaultScanArea(); }

  function areaLine() {
    var a = currentArea(), b = a.bbox;
    var tiles = Scan.tilesForBbox(b).length;
    var w = Scan.distanceMi([(b.s + b.n) / 2, b.w], [(b.s + b.n) / 2, b.e]), h = Scan.distanceMi([b.s, b.w], [b.n, b.w]);
    return '<b>' + esc(a.label) + '</b> · ' + w.toFixed(1) + ' × ' + h.toFixed(1) + ' mi' +
      (tiles > Scan.MAX_TILES ? ' <span class="err">too big for one scan</span>' : '');
  }

  function areaScanPanel() {
    var o = scanOpts(), running = scanRes && scanRes.running;
    function modeBtn(m, label) { return '<button type="button" data-act="scan-mode" data-v="' + m + '" class="' + (o.mode === m ? 'on' : '') + '">' + label + '</button>'; }
    return '<section class="area-scan" id="area-scan"><h3>Scan an area</h3>' +
      '<div class="seg" role="group" aria-label="Choose the area">' + modeBtn('draw', 'Draw') + modeBtn('zip', 'ZIP') + modeBtn('city', 'City') + '</div>' +
      (o.mode === 'draw'
        ? '<button type="button" class="btn ghost block sm-block" data-act="scan-draw">' + (scanDraw ? 'Click two opposite corners on the map… (Cancel)' : '▭ Draw the area on the map') + '</button>'
        : '<form id="scan-where" class="geo-form"><input type="search" id="scan-where-q" placeholder="' + (o.mode === 'zip' ? 'ZIP code, e.g. 38133' : 'City, e.g. Bartlett TN') + '" aria-label="' + (o.mode === 'zip' ? 'ZIP code' : 'City') + '"' + (o.mode === 'zip' ? ' inputmode="numeric" pattern="\\d{5}"' : '') + '><button class="btn ghost" type="submit">Use</button></form>') +
      '<p class="fine" id="scan-area-line">Area: ' + areaLine() + '</p>' +
      '<div class="row2"><label>Min roof ft² <input type="number" id="scan-min" min="3000" step="1000" value="' + o.min + '"></label>' +
      '<label>Hail-hit in last <select id="scan-hail">' + [0, 7, 14, 30, 60, 90].map(function (d) {
        return '<option value="' + d + '"' + (d === o.hailDays ? ' selected' : '') + '>' + (d ? d + ' days' : 'off') + '</option>';
      }).join('') + '</select></label></div>' +
      '<div class="type-checks" role="group" aria-label="Building types">' + Scan.TYPES.map(function (t) {
        return '<label class="check"><input type="checkbox" name="scan-type" value="' + t.id + '"' + (o.types.indexOf(t.id) > -1 ? ' checked' : '') + '> ' + esc(t.label) + '</label>';
      }).join('') + '</div>' +
      '<button type="button" class="btn primary block" data-act="scan-run"' + (running ? ' disabled' : '') + '>' + (running ? 'Scanning…' : '🔎 Scan this area') + '</button>' +
      '<p class="fine" id="scan-progress" role="status">' + scanProgressText() + '</p>' +
      '<p class="fine">Buildings © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> (ODbL) · owners: county public records · permits: City of Memphis · hail: NOAA SPC.</p>' +
      '</section>';
  }

  function scanProgressText() {
    if (!scanRes) return '';
    var r = scanRes, s = r.skipped || {};
    var t = r.running ? 'Scanning ' + r.done + ' of ' + r.total + ' map squares… ' : '';
    t += r.sites.length + ' building' + (r.sites.length === 1 ? '' : 's') + ' found';
    var sk = [];
    if (s.residential) sk.push(s.residential + ' single-family');
    if (s.dnc) sk.push(s.dnc + ' do-not-contact');
    if (s.type) sk.push(s.type + ' other types');
    if (s.outside) sk.push(s.outside + ' outside the area');
    if (sk.length) t += ' · skipped ' + sk.join(', ');
    if (r.errors && r.errors.length) t += ' · ' + r.errors.length + ' map square' + (r.errors.length === 1 ? '' : 's') + ' failed: ' + r.errors[r.errors.length - 1];
    return esc(t) + '.';
  }

  function updateScanPanel() {
    var p = $('#scan-progress');
    if (p) p.innerHTML = scanProgressText();
    var line = $('#scan-area-line');
    if (line) line.innerHTML = 'Area: ' + areaLine();
    var btn = $('[data-act=scan-run]');
    if (btn) { btn.disabled = !!(scanRes && scanRes.running); btn.textContent = scanRes && scanRes.running ? 'Scanning…' : '🔎 Scan this area'; }
  }

  function setScanArea(bbox, label) {
    scanArea = { bbox: bbox, label: label };
    updateScanPanel();
    drawScanLayer();
    if (map) map.fitBounds([[bbox.s, bbox.w], [bbox.n, bbox.e]], { padding: [20, 20] });
  }

  // ZIP / city → its bounding box (one Nominatim lookup, because the person asked).
  function findScanArea(q) {
    var zip = scanOpts().mode === 'zip';
    if (zip && !/^\d{5}$/.test(q)) return Promise.reject(new Error('Enter a 5-digit ZIP code.'));
    var path = zip ? '/search?format=jsonv2&limit=1&countrycodes=us&postalcode=' + encodeURIComponent(q)
      : '/search?format=jsonv2&limit=1&countrycodes=us&q=' + encodeURIComponent(q) + (/,|\b(TN|MS|AR)\b/i.test(q) ? '' : '&viewbox=-90.7,35.6,-89.5,34.6');
    return nominatim(path).then(function (list) {
      var hit = list && list[0];
      if (!hit || !hit.boundingbox) throw new Error('Could not find ' + (zip ? 'that ZIP code' : 'that city') + '. Try drawing the area instead.');
      var bb = hit.boundingbox.map(Number);   // [south, north, west, east]
      setScanArea({ s: bb[0], n: bb[1], w: bb[2], e: bb[3] }, zip ? 'ZIP ' + q : (hit.name || q));
    });
  }

  function startScanDraw() {
    if (scanDraw) { cancelScanDraw(); return; }
    if (measure) cancelTrace();
    scanDraw = { first: null, layer: null };
    if (map) { $('#map').classList.add('measuring'); map.doubleClickZoom.disable(); }
    var b = $('[data-act=scan-draw]');
    if (b) b.textContent = 'Click two opposite corners on the map… (Cancel)';
  }
  function cancelScanDraw() {
    if (scanDraw && scanDraw.layer) scanDraw.layer.remove();
    scanDraw = null;
    if (map) { $('#map').classList.remove('measuring'); map.doubleClickZoom.enable(); }
    var b = $('[data-act=scan-draw]');
    if (b) b.textContent = '▭ Draw the area on the map';
  }
  function scanDrawClick(ll) {
    if (!scanDraw.first) {
      scanDraw.first = ll;
      scanDraw.layer = L.rectangle([ll, ll], { color: '#7c3aed', weight: 2, dashArray: '6 6', fillOpacity: 0.05, interactive: false }).addTo(map);
      return;
    }
    var a = scanDraw.first;
    var bbox = { s: Math.min(a.lat, ll.lat), n: Math.max(a.lat, ll.lat), w: Math.min(a.lng, ll.lng), e: Math.max(a.lng, ll.lng) };
    cancelScanDraw();
    if (bbox.n - bbox.s < 0.0005 || bbox.e - bbox.w < 0.0005) { toast('That area is too small. Click two corners farther apart.', true); return; }
    setScanArea(bbox, 'Drawn area');
  }

  function scoreSite(s) {
    var c = scanCfg();
    var r = Scan.score(s, { weights: c.weights, permitsSince: c.sources && c.sources.permits && c.sources.permits.since, home: Scan.HOME });
    s.score = r.score;
    s.reasons = r.reasons;
    return s;
  }

  function scanColor(score) { return score >= 70 ? '#7c3aed' : score >= 50 ? '#a855f7' : '#c4b5fd'; }

  function drawScanLayer() {
    if (!map) return;
    if (scanLayer) scanLayer.remove();
    var g = L.layerGroup();
    var a = currentArea().bbox;
    L.rectangle([[a.s, a.w], [a.n, a.e]], { color: '#7c3aed', weight: 2, fillOpacity: 0.03, interactive: false }).addTo(g);
    (scanRes ? visibleScanSites() : []).forEach(function (s) {
      var lead = Scan.findExisting(s, state.leads);
      var tip = '<b>' + s.score + '</b> · ' + esc(siteTitle(s)) + '<br>' + esc(s.reasons.join(' · ')) + (lead ? '<br><i>Already a lead</i>' : '');
      L.polygon(s.outline, { color: lead ? '#2563eb' : scanColor(s.score), weight: s.id === scanSel ? 4 : 2, fillOpacity: 0.3 })
        .bindTooltip(tip).on('click', function (e) { if (measure || scanDraw) return; L.DomEvent.stop(e); selectScanSite(s.id, true); }).addTo(g);
    });
    scanLayer = g.addTo(map);
  }

  function siteTitle(s) {
    var p = s.parcel || {};
    return s.name || (p.situs ? titleCase(p.situs) : '') || s.address || ((Scan.TYPES.filter(function (t) { return t.id === s.type; })[0] || {}).label || 'Building') + ' (' + num(s.areaSqft) + ' ft²)';
  }
  function titleCase(v) { return String(v || '').toLowerCase().replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); }); }

  function visibleScanSites() {
    var o = scanOpts();
    return scanRes.sites.filter(function (s) { return s.areaSqft >= o.min && o.types.indexOf(s.type) > -1; });
  }

  var SCAN_COLS = [
    { k: 'score', label: 'Score', num: true },
    { k: 'name', label: 'Building · owner' },
    { k: 'type', label: 'Type' },
    { k: 'area', label: 'Roof ft²', num: true },
    { k: 'built', label: 'Built', num: true },
    { k: 'permit', label: 'Roof permit', num: true },
    { k: 'hail', label: 'Hail', num: true },
    { k: 'dist', label: 'Miles', num: true },
    { k: 'act', label: '' }
  ];

  function scanSortVal(s, k) {
    switch (k) {
      case 'name': return siteTitle(s).toLowerCase();
      case 'type': return s.type;
      case 'area': return s.areaSqft;
      case 'built': return (s.parcel && s.parcel.yearBuilt) || 0;
      case 'permit': return s.permit ? s.permit.date : '';
      case 'hail': return s.hail ? s.hail.sizeIn : 0;
      case 'dist': return s.distMi;
      default: return s.score;
    }
  }

  function renderScanResults() {
    var box = $('#scan-results');
    if (!box) return;
    if (!scanRes) { box.hidden = true; return; }
    box.hidden = false;
    var f = ui.scan;
    var rows = visibleScanSites().map(function (s) { s._lead = Scan.findExisting(s, state.leads); return s; })
      .filter(function (s) { return !f.hideLeads || !s._lead; })
      .sort(function (a, b) { var x = scanSortVal(a, f.sort), y = scanSortVal(b, f.sort); return (x < y ? -1 : x > y ? 1 : 0) * f.dir; });
    var src = scanRes.sources || {};
    var notes = [];
    if (src.shelby === 'off') notes.push('Shelby County owners are off (Settings → Area scan) — look up owners on the assessor\'s site');
    Object.keys(src).forEach(function (k) { if (/^error/.test(src[k])) notes.push((k === 'permits' ? 'Memphis permits' : (Scan.COUNTIES[k] || {}).label || k) + ' did not answer: ' + src[k].slice(7)); });
    box.innerHTML = '<div class="scan-head"><h2>Scan results <span class="muted">' + rows.length + ' · ' + esc(scanRes.label) + '</span></h2>' +
      '<label class="check"><input type="checkbox" id="scan-hide-leads"' + (f.hideLeads ? ' checked' : '') + '> Hide buildings that are already leads</label>' +
      '<span class="grow"></span><button type="button" class="btn ghost sm" data-act="scan-clear">Clear</button></div>' +
      (notes.length ? '<p class="note sm">' + notes.map(esc).join('<br>') + '</p>' : '') +
      '<div class="table-wrap"><table class="grid scan-grid"><thead><tr>' + SCAN_COLS.map(function (c) {
        var on = f.sort === c.k;
        return '<th class="' + (c.num ? 'r ' : '') + (c.k === 'act' ? '' : 'sortable') + (on ? ' on' : '') + '"' + (c.k === 'act' ? '' : ' data-ssort="' + c.k + '"') + '>' + c.label + (on ? (f.dir > 0 ? ' ▲' : ' ▼') : '') + '</th>';
      }).join('') + '</tr></thead><tbody>' +
      (rows.map(scanRow).join('') || '<tr><td colspan="' + SCAN_COLS.length + '" class="empty">' + (scanRes.running ? 'Scanning…' : 'No buildings match. Try a smaller minimum size or more building types.') + '</td></tr>') +
      '</tbody></table></div>' +
      '<p class="fine">Score 0–100 from roof size, roof age signals, hail, building type and distance from Bartlett (weights in Settings → Area scan). ' +
      'Building outlines © OpenStreetMap contributors. Owner names and mailing addresses are public records: use them only for business outreach about the building, and add anyone who asks not to be contacted to the do-not-contact list.</p>';
  }

  function scanRow(s) {
    var p = s.parcel, lead = s._lead;
    var county = Scan.COUNTIES[(p && p.county) || Scan.countyOf(s.lat, s.lng)];
    var owner = p && p.owner
      ? '<div class="sm"><b>' + esc(p.owner) + '</b>' + (p.mail ? ' · <span class="muted">' + esc(p.mail) + '</span>' : '') + '</div>'
      : '<div class="sm muted">Owner unknown — ' + (county ? '<a href="' + esc(county.assessor) + '" target="_blank" rel="noopener">look up (' + esc(county.assessorName) + ')</a>' : 'look up') + '</div>';
    var solar = s.solar ? '<div class="sm muted">' + (s.solar.found ? 'Google: ' + num(s.solar.areaSqft) + ' ft² · ' + (s.solar.pitch ? s.solar.pitch + '/12' : 'flat') : 'Google: no roof data') + '</div>' : '';
    return '<tr data-sid="' + esc(s.id) + '" class="' + (s.id === scanSel ? 'sel' : '') + '">' +
      '<td class="r"><span class="score" style="background:' + scanColor(s.score) + '">' + s.score + '</span></td>' +
      '<td><div class="cell-name"><button class="link" data-act="scan-zoom" data-id="' + esc(s.id) + '">' + esc(siteTitle(s)) + '</button></div>' + owner +
        '<div class="sm muted">' + esc(s.reasons.join(' · ')) + '</div>' + solar + '</td>' +
      '<td>' + esc(((Scan.TYPES.filter(function (t) { return t.id === s.type; })[0]) || {}).label || s.type) + (p && p.landUse ? '<div class="sm muted">' + esc(p.landUse) + '</div>' : '') + '</td>' +
      '<td class="r">' + num(s.areaSqft) + '</td>' +
      '<td class="r">' + ((p && p.yearBuilt) || '<span class="muted">?</span>') + '</td>' +
      '<td class="r">' + (s.permit ? esc(s.permit.date) : s.permitsChecked ? '<span class="muted">none</span>' : '<span class="muted">—</span>') + '</td>' +
      '<td class="r">' + (s.hail ? esc(String(Number(s.hail.sizeIn.toFixed(2)))) + '"<div class="sm muted">' + U.when(s.hail.ts).split(' ').slice(0, 2).join(' ') + '</div>' : '<span class="muted">—</span>') + '</td>' +
      '<td class="r">' + s.distMi.toFixed(1) + '</td>' +
      '<td><div class="scan-acts">' + (lead
        ? '<button class="btn ghost sm" data-act="open" data-id="' + esc(lead.id) + '">Already a lead</button>' +
          (skipOn() && !lead.doNotContact ? (lead.contact
            ? ' <button class="btn ghost sm" data-act="open" data-id="' + esc(lead.id) + '">📞 ' + ((lead.contact.phones || []).length) + ' phone' + ((lead.contact.phones || []).length === 1 ? '' : 's') + '</button>'
            : ' <button class="btn ghost sm" data-act="contact-find" data-id="' + esc(lead.id) + '">📞 Find owner contact</button>') : '')
        : '<button class="btn primary sm" data-act="scan-add" data-id="' + esc(s.id) + '">Add as lead</button>') +
        ' <button class="btn ghost sm" data-act="scan-measure" data-id="' + esc(s.id) + '" title="Google Solar roof measurement (counts toward the monthly limit)">📡 Measure</button></div></td>' +
    '</tr>';
  }

  function selectScanSite(id, scroll) {
    scanSel = id;
    drawScanLayer();
    renderScanResults();
    var tr = $('#scan-results tr[data-sid="' + id + '"]');
    if (tr && scroll) tr.scrollIntoView({ block: 'nearest' });
  }

  function scanSite(id) { return scanRes && scanRes.sites.filter(function (s) { return s.id === id; })[0]; }

  function readScanOpts() {
    var o = scanOpts();
    var m = $('#scan-min');
    if (m) o.min = Math.max(3000, Number(m.value) || 10000);
    var h = $('#scan-hail');
    if (h) o.hailDays = Number(h.value) || 0;
    var boxes = $$('input[name=scan-type]');
    if (boxes.length) o.types = boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
    return o;
  }

  function runAreaScan() {
    var o = readScanOpts();
    if (!o.types.length) { toast('Pick at least one building type.', true); return; }
    var area = currentArea();
    var tiles = Scan.tilesForBbox(area.bbox);
    if (tiles.length > Scan.MAX_TILES) {
      toast('That area is too big for one scan (' + tiles.length + ' map squares, the most is ' + Scan.MAX_TILES + '). Draw a smaller area.', true);
      return;
    }
    // Middle of the area first, so the first results are the ones the person is looking at.
    var mid = [(area.bbox.s + area.bbox.n) / 2, (area.bbox.w + area.bbox.e) / 2];
    tiles.sort(function (a, b) {
      var ta = Scan.tileBbox(a), tb = Scan.tileBbox(b);
      return Scan.distanceMi(mid, [(ta.s + ta.n) / 2, (ta.w + ta.e) / 2]) - Scan.distanceMi(mid, [(tb.s + tb.n) / 2, (tb.w + tb.e) / 2]);
    });
    var res = scanRes = { sites: [], running: true, done: 0, total: tiles.length, errors: [], skipped: { residential: 0, dnc: 0, type: 0, outside: 0 }, sources: {}, label: area.label, bbox: area.bbox, at: Date.now(), hail: [] };
    scanSel = null;
    updateScanPanel();
    renderScanResults();
    drawScanLayer();

    var stop = false;
    function call(body) { return Cloud.fn(SCAN_FN, 'POST', body); }

    var hailStep = Promise.resolve();
    if (o.hailDays) {
      var tries = 0, lastMissing = Infinity;
      var more = function () {
        return call({ action: 'hail', days: o.hailDays }).then(function (r) {
          res.hail = r.reports || [];
          tries++;
          if (r.more && tries < 8 && r.missingDays < lastMissing) { lastMissing = r.missingDays; return more(); }
          if (r.missingDays) res.errors.push('NOAA hail reports missing for ' + r.missingDays + ' day(s)');
        });
      };
      hailStep = more().then(null, function (e) { res.errors.push('hail: ' + e.message); });
    }

    function oneTile(t) {
      if (stop || res !== scanRes) return Promise.resolve();
      return call({ action: 'tile', tile: t, minSqft: o.min }).then(function (r) {
        var inArea = (r.sites || []).filter(function (s) {
          var ok = Scan.inBbox([s.lat, s.lng], area.bbox);
          if (!ok) res.skipped.outside++;
          return ok;
        });
        var chain = Promise.resolve();
        for (var i = 0; i < inArea.length; i += 60) {
          (function (part) {
            chain = chain.then(function () {
              if (stop || res !== scanRes) return;
              return call({ action: 'enrich', tile: t, ids: part.map(function (s) { return s.id; }) }).then(function (er) {
                Object.keys(er.sources || {}).forEach(function (k) { if (!res.sources[k] || res.sources[k] === 'ok') res.sources[k] = er.sources[k]; });
                var by = {};
                (er.sites || []).forEach(function (x) { by[x.id] = x; });
                part.forEach(function (s) {
                  var x = by[s.id] || {};
                  if (x.excluded === 'residential') { res.skipped.residential++; return; }
                  if (x.excluded === 'do-not-contact') { res.skipped.dnc++; return; }
                  s.parcel = x.parcel || null;
                  s.permit = x.permit || null;
                  s.permitsChecked = !!x.permitsChecked;
                  s.type = x.type || s.type;
                  s.tile = t;
                  addScanSite(res, s, o);
                });
              });
            });
          })(inArea.slice(i, i + 60));
        }
        return chain;
      }).then(function () {
        res.done++;
      }, function (e) {
        res.done++;
        res.errors.push(e.message || String(e));
        if (e.code === 'overpass-limit' || e.code === 'user-limit' || e.code === 'signed-out' || e.code === 'no-tables' || e.status === 401 || e.status === 403) stop = true;
        if (e.code === 'signed-out') report(e);
      }).then(function () {
        if (res !== scanRes) return;
        updateScanPanel();
        renderScanResults();
        drawScanLayer();
      });
    }

    hailStep.then(function () {
      return tiles.reduce(function (p, t) { return p.then(function () { return oneTile(t); }); }, Promise.resolve());
    }).then(function () {
      if (res !== scanRes) return;
      res.running = false;
      updateScanPanel();
      renderScanResults();
      drawScanLayer();
      log('scan', null, res.sites.length + ' buildings ≥ ' + num(o.min) + ' ft², ' + area.label);
      if (res.errors.length && !res.sites.length) toast(res.errors[res.errors.length - 1], true);
      else toast('Scan done: ' + res.sites.length + ' buildings');
    });
  }

  function addScanSite(res, s, o) {
    if (res.sites.some(function (x) { return x.id === s.id; })) return;   // a building on two map squares
    if (o.types.indexOf(s.type) < 0) { res.skipped.type++; return; }
    s.distMi = Scan.distanceMi([Scan.HOME.lat, Scan.HOME.lng], [s.lat, s.lng]);
    s.hail = o.hailDays ? Scan.hailNear([s.lat, s.lng], res.hail, o.hailDays, Date.now(), 2) : null;
    res.sites.push(scoreSite(s));
  }

  // "Add as lead": the real address, owner and mailing address, footprint area, score and reasons.
  function addScanLead(id, btn) {
    var s = scanSite(id);
    if (!s) return;
    var dupe = Scan.findExisting(s, state.leads);
    if (dupe) { openLead(dupe.id); return; }
    var p = s.parcel || {};
    var types = state.settings.roofTypes;
    var rt = (types.filter(function (t) { return t.id === 'tpo'; })[0] || types[0]).id;
    var county = Scan.COUNTIES[p.county || Scan.countyOf(s.lat, s.lng)];
    var stateOf = { shelby: 'TN', desoto: 'MS', crittenden: 'AR' }[p.county || Scan.countyOf(s.lat, s.lng)] || '';
    // The street from the county (or OpenStreetMap); city / state / ZIP from one address lookup, because the person asked.
    var where = s.address && /,.*\d{5}/.test(s.address) ? Promise.resolve(s.address) : reverseGeocode([s.lat, s.lng]).then(function (a) {
      if (!a) return p.situs ? titleCase(p.situs) + (stateOf ? ', ' + stateOf : '') : s.address || '';
      if (!p.situs) return a.address;
      return [titleCase(p.situs), a.city, [a.state || stateOf, a.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    }, function () { return p.situs ? titleCase(p.situs) + (stateOf ? ', ' + stateOf : '') : s.address || ''; });
    if (btn) btn.disabled = true;
    where.then(function (address) {
      var l = {
        id: Store.newId('L'),
        name: siteTitle(s),
        address: address || '',
        kind: 'commercial',
        roofType: rt,
        areaSqft: Math.round(s.areaSqft / 10) * 10,
        condition: 50,
        confidence: null,
        issues: [],
        owner: { name: '', company: p.owner || '', phone: '', email: '' },
        ownerMail: p.mail || '',
        parcel: p.id ? { id: p.id, county: p.county, landUse: p.landUse, yearBuilt: p.yearBuilt, bldgSqft: p.bldgSqft, situs: p.situs } : null,
        scanId: s.id,
        scan: { score: s.score, reasons: s.reasons, type: s.type, permit: s.permit, hail: s.hail, at: Date.now() },
        outline: s.outline,
        pitch: 'flat',
        lat: s.lat,
        lng: s.lng,
        stage: 'New',
        assignedTo: '',
        notes: 'From area scan (score ' + s.score + '): ' + s.reasons.join(' · '),
        dnc: false,
        source: 'scan',
        sourceNote: 'Area scan. Building outline © OpenStreetMap contributors' + (p.owner ? '; owner of record from ' + (county ? county.label : 'county') + ' public records' : ''),
        demo: false,
        touched: true
      };
      if (s.solar && s.solar.at) l.solar = s.solar;
      return createLead(l).then(function () {
        log('create', l, 'from area scan · score ' + s.score);
        toast('Lead added: ' + l.name);
        renderScanResults();
        drawScanLayer();
      });
    }).then(null, function () { /* already reported */ }).then(function () { if (btn) btn.disabled = false; });
  }

  // 📡 Measure: the existing Google Solar function and its monthly limit, one site at a time.
  function measureScanSite(id, btn) {
    var s = scanSite(id);
    if (!s) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Measuring…'; }
    Cloud.fn('solar-lookup', 'POST', { lat: s.lat, lng: s.lng }).then(function (r) {
      s.solar = r.found ? { found: true, areaSqft: r.areaSqft, pitch: r.pitch, segments: r.segments, imageryDate: r.imageryDate, imageryQuality: r.imageryQuality, at: Date.now() } : { found: false, at: Date.now() };
      log('solar', null, (r.found ? num(r.areaSqft) + ' ft²' : 'no roof data') + ' (scan result)');
      toast(r.found ? 'Google: ' + num(r.areaSqft) + ' ft². Lookups this month: ' + r.usedThisMonth + ' of ' + r.limit + '.' : 'Google has no roof data for this building.');
      renderScanResults();
    }, function (e) {
      report(e);
      if (btn) { btn.disabled = false; btn.textContent = '📡 Measure'; }
    });
  }

  // ---- Leads ----------------------------------------------------------------

  function viewLeads() {
    var f = ui.leads;
    function opt(v, label, cur) { return '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + label + '</option>'; }
    return '<div class="toolbar">' +
      '<input type="search" id="lead-q" placeholder="Search name, address, owner…" value="' + esc(f.q) + '">' +
      '<select id="lead-kind">' + opt('commercial', 'Commercial', f.kind) + opt('residential', 'Residential', f.kind) + opt('', 'All types', f.kind) + '</select>' +
      '<select id="lead-stage">' + opt('', 'All stages', f.stage) + Store.STAGES.map(function (s) { return opt(s, s, f.stage); }).join('') + '</select>' +
      '<select id="lead-cond">' + opt('', 'Any condition', f.cond) + opt('poor', 'Poor', f.cond) + opt('fair', 'Fair', f.cond) + opt('good', 'Good', f.cond) + '</select>' +
      '<span class="grow"></span>' +
      '<button class="btn ghost" data-act="csv">Export CSV</button>' +
      '<button class="btn primary" data-act="new">+ Add lead</button>' +
    '</div><div id="lead-table" class="table-wrap"></div>';
  }

  var LEAD_COLS = [
    { k: 'name', label: 'Property' },
    { k: 'roof', label: 'Roof' },
    { k: 'area', label: 'Area ft²', num: true },
    { k: 'condition', label: 'Condition', num: true },
    { k: 'value', label: 'Estimate', num: true },
    { k: 'stage', label: 'Stage' },
    { k: 'assigned', label: 'Assigned' },
    { k: 'contact', label: 'Contact' },
    { k: 'updated', label: 'Updated', num: true }
  ];

  function sortVal(l, k) {
    switch (k) {
      case 'name': return l.name.toLowerCase();
      case 'roof': return rtOf(l).name;
      case 'area': return l.areaSqft;
      case 'condition': return l.condition;
      case 'value': return valueOf(l);
      case 'stage': return Store.STAGES.indexOf(l.stage);
      case 'assigned': return userName(l.assignedTo);
      case 'contact': return (l.owner && (l.owner.name || l.owner.company)) || '';
      case 'updated': return l.updatedAt || 0;
      default: return priority(l);
    }
  }

  function filteredLeads() {
    var f = ui.leads, q = f.q.toLowerCase();
    return state.leads.filter(function (l) {
      if (f.kind && l.kind !== f.kind) return false;
      if (f.stage && l.stage !== f.stage) return false;
      if (f.cond && U.grade(l.condition).cls !== f.cond) return false;
      if (q) {
        var o = l.owner || {};
        var hay = [l.name, l.address, o.name, o.company, o.email, o.phone, l.notes, l.ownerMail, l.parcel && l.parcel.id].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function renderLeadTable() {
    var f = ui.leads;
    var rows = filteredLeads().sort(function (a, b) {
      var x = sortVal(a, f.sort), y = sortVal(b, f.sort);
      return (x < y ? -1 : x > y ? 1 : 0) * f.dir;
    });
    var total = rows.reduce(function (s, l) { return s + (isOpen(l) ? valueOf(l) : 0); }, 0);
    $('#lead-table').innerHTML = '<table class="grid"><thead><tr>' +
      LEAD_COLS.map(function (c) {
        var on = f.sort === c.k;
        return '<th class="' + (c.num ? 'r ' : '') + 'sortable' + (on ? ' on' : '') + '" data-sort="' + c.k + '">' + c.label + (on ? (f.dir > 0 ? ' ▲' : ' ▼') : '') + '</th>';
      }).join('') + '</tr></thead><tbody>' +
      (rows.map(function (l) {
        var o = l.owner || {};
        return '<tr data-id="' + esc(l.id) + '">' +
          '<td><div class="cell-name">' + esc(l.name) + ' ' + tags(l) + '</div><div class="muted sm">' + esc(l.address) + '</div></td>' +
          '<td>' + esc(rtOf(l).name) + '</td>' +
          '<td class="r">' + num(l.areaSqft) + '</td>' +
          '<td class="r">' + gradeChip(l) + '</td>' +
          '<td class="r"><b>' + money(valueOf(l)) + '</b></td>' +
          '<td><span class="stage s-' + l.stage.toLowerCase() + '">' + l.stage + '</span></td>' +
          '<td>' + (esc(userName(l.assignedTo)) || '<span class="muted">Unassigned</span>') + '</td>' +
          '<td>' + (o.name || o.company ? esc(o.name || o.company) : '<span class="muted">Needs lookup</span>') + (l.dnc ? ' <span class="chip poor">DNC</span>' : '') + (l.doNotContact ? ' <span class="chip poor">Do not contact</span>' : '') + '</td>' +
          '<td class="r muted sm">' + U.when(l.updatedAt) + '</td>' +
        '</tr>';
      }).join('') || '<tr><td colspan="' + LEAD_COLS.length + '" class="empty">No leads match. Run a scan on the Map tab, or click “+ Add lead”.</td></tr>') +
      '</tbody></table>' +
      '<div class="table-foot">' + rows.length + ' leads · open pipeline ' + money(total) + '</div>';
  }

  function exportCsv() {
    var head = ['ID', 'Property', 'Address', 'Type', 'Roof', 'Area ft2', 'Squares', 'Condition', 'Grade', 'Confidence', 'Cost', 'Estimate', 'Priced by', 'Margin %', 'Stage', 'Assigned', 'Owner', 'Company', 'Phone', 'Email', 'DNC', 'Source', 'Demo', 'Commission split', 'Notes', 'Updated', 'Owner mailing address', 'Parcel', 'Scan score', 'Do not contact', 'Phones found (Tracerfy)'];
    var lines = [head];
    state.leads.forEach(function (l) {
      var e = estOf(l), o = l.owner || {};
      lines.push([l.id, l.name, l.address, l.kind, rtOf(l).name, l.areaSqft, Math.round(e.squares * 10) / 10, l.condition, U.grade(l.condition).label, l.confidence || '',
        Math.round(e.cost), Math.round(e.price), e.basis === 'square' ? '$' + e.perSquare + '/square' : state.settings.margin + '% margin', Math.round(e.margin),
        l.stage, userName(l.assignedTo), o.name, o.company, o.phone, o.email, l.dnc ? 'yes' : '', l.source, l.demo ? 'yes' : '', state.settings.commission, l.notes,
        l.updatedAt ? new Date(l.updatedAt).toISOString() : '', l.ownerMail || '', l.parcel ? l.parcel.id : '', l.scan ? l.scan.score : '', l.doNotContact ? 'yes' : '',
        l.contact && l.contact.phones ? l.contact.phones.map(function (p) { return p.number + (p.dnc ? ' (DNC)' : '') + (p.litigator ? ' (litigator)' : ''); }).join('; ') : '']);
    });
    var csv = lines.map(function (r) {
      return r.map(function (v) {
        v = String(v == null ? '' : v);
        // Stop spreadsheet apps treating a cell as a formula.
        if (/^[=+\-@]/.test(v)) v = "'" + v;
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\n');
    download('roofscout-leads-' + new Date().toISOString().slice(0, 10) + '.csv', csv, 'text/csv');
  }

  // ---- Calls ----------------------------------------------------------------

  function viewCalls() {
    var list = state.leads.filter(isOpen).sort(function (a, b) { return priority(b) - priority(a); });
    return '<div class="section-head"><h1>Call list</h1>' +
      '<p class="muted">Ranked by roof condition, job size and stage. Recently called leads drop down for 3 days. ' +
      'Call only between 8 am and 9 pm local time, and never call a number marked Do-Not-Call (TCPA / DNC rules).</p></div>' +
      '<ol class="calls">' + (list.slice(0, 50).map(function (l, i) {
        var o = l.owner || {};
        var phone = l.doNotContact ? '<span class="chip poor">Do not contact</span>'
          : l.dnc
          ? '<span class="chip poor">Do-Not-Call: do not dial</span>'
          : o.phone ? '<a class="phone" href="tel:' + esc(o.phone.replace(/[^\d+]/g, '')) + '">' + esc(o.phone) + '</a>'
          : '<span class="muted">No phone on file (needs owner lookup / skip trace)</span>';
        var last = l.lastCall ? '<div class="muted sm">Last call: ' + esc(l.lastCall.outcome) + ' · ' + U.when(l.lastCall.ts) + ' · ' + esc(userName(l.lastCall.user)) + '</div>' : '';
        return '<li class="call">' +
          '<div class="call-rank">' + (i + 1) + '</div>' +
          '<div class="call-main"><div class="cell-name"><button class="link" data-act="open" data-id="' + esc(l.id) + '">' + esc(l.name) + '</button> ' + tags(l) + '</div>' +
            '<div class="muted sm">' + esc(rtOf(l).name) + ' · ' + num(l.areaSqft) + ' ft² · <span class="stage s-' + l.stage.toLowerCase() + '">' + l.stage + '</span></div>' +
            '<div>' + esc([o.name, o.company].filter(Boolean).join(', ')) + ' ' + phone + '</div>' + last + '</div>' +
          '<div class="call-side">' + gradeChip(l) + '<div class="call-val">' + moneyShort(valueOf(l)) + '</div></div>' +
          '<div class="call-acts">' + (l.dnc || l.doNotContact ? '' :
            ['No answer', 'Left voicemail', 'Talked', 'Not interested'].map(function (o2) {
              return '<button class="btn ghost sm" data-act="call" data-id="' + esc(l.id) + '" data-v="' + o2 + '">' + o2 + '</button>';
            }).join('')) +
          '</div>' +
        '</li>';
      }).join('') || '<li class="empty">No open leads. Run a scan or add a lead.</li>') + '</ol>';
  }

  function logCall(id, outcome) {
    var l = leadById(id);
    if (!l) return;
    if (l.dnc) { toast('This number is marked Do-Not-Call.', true); return; }
    if (l.doNotContact) { toast('This owner asked not to be contacted.', true); return; }
    var detail = outcome;
    commitLead(l, function (x) {
      x.lastCall = { ts: Date.now(), outcome: outcome, user: me.id };
      if (!x.assignedTo) x.assignedTo = me.id;
      if (outcome === 'Talked' && x.stage === 'New') { x.stage = 'Contacted'; detail += ' → Contacted'; }
      if (outcome === 'Not interested') { x.stage = 'Lost'; detail += ' → Lost'; }
    }).then(function () {
      log('call', l, detail);
      toast('Logged: ' + detail);
      refresh();
    }, function () { refresh(); });
  }

  // ---- Pipeline -------------------------------------------------------------

  function viewPipeline() {
    var open = state.leads.filter(isOpen);
    var won = state.leads.filter(function (l) { return l.stage === 'Won'; });
    var lost = state.leads.filter(function (l) { return l.stage === 'Lost'; });
    var sum = function (arr, fn) { return arr.reduce(function (s, l) { return s + fn(l); }, 0); };
    var openVal = sum(open, valueOf);
    var weighted = sum(open, function (l) { return Pricing.weighted(valueOf(l), l.stage); });
    var wonVal = sum(won, valueOf);
    var rate = won.length + lost.length ? Math.round(100 * won.length / (won.length + lost.length)) + '%' : '—';

    function kpi(k, v, sub) { return '<div class="kpi"><div class="k">' + k + '</div><div class="v">' + v + '</div>' + (sub ? '<div class="muted sm">' + sub + '</div>' : '') + '</div>'; }

    return '<div class="kpis">' +
      kpi('Open leads', open.length) +
      kpi('Open pipeline', moneyShort(openVal), 'approximate estimates') +
      kpi('Weighted forecast', moneyShort(weighted), 'New 10% · Contacted 30% · Quoted 60%') +
      kpi('Won', moneyShort(wonVal), won.length + ' jobs') +
      kpi('Win rate', rate, won.length + ' won / ' + lost.length + ' lost') +
    '</div><div class="board">' +
      Store.STAGES.map(function (s) {
        var ls = state.leads.filter(function (l) { return l.stage === s; })
          .sort(function (a, b) { return valueOf(b) - valueOf(a); });
        return '<section class="col"><h2>' + s + ' <span class="muted">' + ls.length + ' · ' + moneyShort(sum(ls, valueOf)) +
          ' · ' + Math.round(Pricing.STAGE_PROB[s] * 100) + '%</span></h2>' +
          (ls.slice(0, 40).map(function (l) {
            return '<button class="card" data-act="open" data-id="' + esc(l.id) + '">' +
              '<div class="cell-name">' + esc(l.name) + ' ' + tags(l) + '</div>' +
              '<div class="card-row">' + gradeChip(l) + '<b>' + money(valueOf(l)) + '</b></div>' +
              '<div class="muted sm">' + esc(rtOf(l).name) + ' · ' + num(l.areaSqft) + ' ft²</div>' +
              '<div class="muted sm">' + (esc(userName(l.assignedTo)) || 'Unassigned') + ' · ' + esc(state.settings.commission) + '</div>' +
            '</button>';
          }).join('') || '<div class="empty">None</div>') +
          (ls.length > 40 ? '<div class="muted sm">+' + (ls.length - 40) + ' more in Leads</div>' : '') +
        '</section>';
      }).join('') + '</div>';
  }

  // ---- Activity -------------------------------------------------------------

  var ACTION_LABEL = { trace: 'looked up the owner of', open: 'opened', edit: 'edited', stage: 'moved', call: 'called', create: 'added', flyer: 'printed flyer for', proposal: 'printed proposal for', scan: 'ran a scan:', 'delete': 'deleted', claim: 'claimed', solar: 'measured with Google' };

  function viewActivity() {
    var rows = state.users.map(function (u) {
      var acts = state.activity.filter(function (a) { return a.user === u.id; });
      var touched = {};
      acts.forEach(function (a) { if (a.lead && a.action !== 'open') touched[a.lead] = 1; });
      var mine = state.leads.filter(function (l) { return l.assignedTo === u.id; });
      return {
        u: u,
        touched: Object.keys(touched).length,
        leads: mine.length,
        opens: acts.filter(function (a) { return a.action === 'open'; }).length,
        edits: acts.filter(function (a) { return a.action === 'edit' || a.action === 'stage'; }).length,
        calls: acts.filter(function (a) { return a.action === 'call'; }).length,
        value: mine.filter(isOpen).reduce(function (s, l) { return s + valueOf(l); }, 0),
        won: mine.filter(function (l) { return l.stage === 'Won'; }).length
      };
    }).sort(function (a, b) { return b.value - a.value || b.touched - a.touched; });

    var feed = state.activity.slice(-150).reverse();
    return '<div class="section-head"><h1>PM leaderboard</h1><p class="muted">Every RoofScout lead is a GrayCo lead. Commission split ' +
      esc(state.settings.commission) + ' (paid out in the GrayCo CRM, not here).' + (isCloud() ? ' Counts cover the most recent 1,000 actions.' : '') + '</p></div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr><th>#</th><th>Teammate</th><th class="r">Jobs touched</th><th class="r">GrayCo leads</th><th class="r">Opens</th><th class="r">Edits</th><th class="r">Calls</th><th class="r">Won</th><th class="r">Open pipeline</th><th>Split</th></tr></thead><tbody>' +
      rows.map(function (r, i) {
        return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(r.u.name) + '</b> <span class="muted sm">' + esc(r.u.title || r.u.role) + '</span></td>' +
          '<td class="r">' + r.touched + '</td><td class="r">' + r.leads + '</td><td class="r">' + r.opens + '</td><td class="r">' + r.edits + '</td>' +
          '<td class="r">' + r.calls + '</td><td class="r">' + r.won + '</td><td class="r"><b>' + money(r.value) + '</b></td><td>' + esc(state.settings.commission) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<h2 class="mt">Recent activity</h2><ul class="feed">' +
      (feed.map(function (a) {
        var l = a.lead ? leadById(a.lead) : null;
        var target = a.lead ? (l ? '<button class="link" data-act="open" data-id="' + esc(l.id) + '">' + esc(l.name) + '</button>' : '<span class="muted">(deleted lead)</span>') : '';
        return '<li><span class="muted sm">' + U.when(a.ts) + '</span> <b>' + esc(userName(a.user) || 'Someone') + '</b> ' +
          (ACTION_LABEL[a.action] || esc(a.action)) + ' ' + target + (a.detail ? ' <span class="muted">' + esc(a.detail) + '</span>' : '') + '</li>';
      }).join('') || '<li class="empty">No activity yet.</li>') + '</ul>';
  }

  // ---- Settings -------------------------------------------------------------

  function viewSettings() {
    var s = state.settings, co = s.company, admin = isAdmin();
    var dis = admin ? '' : ' disabled';
    var ex = Pricing.priceAtMargin(190000, s.margin);

    return (admin ? '' : '<p class="note">Only an admin can change pricing and branding. You can update your own profile below.</p>') +
      '<form id="settings-form" class="settings"><fieldset' + dis + '>' +
      '<section class="panel"><h2>Pricing by roof type</h2>' +
        '<p class="muted sm">Each lead gets one approximate estimate. With an <b>estimate per square</b> (100 ft²), estimate = squares × that price. ' +
        'Leave it at 0 to price that roof type from cost and margin instead. Material + labor = your cost per ft², used for the margin check.</p>' +
        '<div class="table-wrap"><table class="grid edit"><thead><tr><th>Roof type</th><th class="r">Estimate $/square</th><th class="r">Material $/ft²</th><th class="r">Labor $/ft²</th><th class="r">Cost $/ft²</th><th class="r">Margin</th><th>Low-slope</th><th></th></tr></thead><tbody id="rt-rows">' +
        s.roofTypes.map(rtRow).join('') + '</tbody></table></div>' +
        '<button type="button" class="btn ghost sm" data-act="add-rt">+ Add roof type</button></section>' +

      '<section class="panel"><h2>Margin (true gross margin, not markup)</h2>' +
        '<p class="muted sm">Used only for roof types with no estimate per square. Estimate = cost ÷ (1 − margin). Example: $190,000 cost at ' + s.margin + '% = <b>' + money(ex) + '</b>.</p>' +
        '<div class="row3"><label>Margin % <input type="number" name="margin" min="0" max="95" step="0.5" value="' + s.margin + '"></label></div></section>' +

      '<section class="panel"><h2>Metal roof coating</h2><p class="muted sm">Shown as the budget alternative on metal roofs.</p><div class="row4">' +
        '<label>Low $/square <input type="number" name="c-low" min="0" step="1" value="' + s.coating.low + '"></label>' +
        '<label>High $/square <input type="number" name="c-high" min="0" step="1" value="' + s.coating.high + '"></label>' +
        '<label>Material $/gallon <input type="number" name="c-gal" min="0" step="1" value="' + s.coating.galPrice + '"></label>' +
        '<label>ft² per gallon <input type="number" name="c-cov" min="1" step="1" value="' + s.coating.galCoverage + '"></label>' +
      '</div></section>' +

      '<section class="panel"><h2>Company &amp; licenses</h2><div class="row2">' +
        field('Company name', 'co-name', co.name) + field('Office phone', 'co-phone', co.phone) +
        field('Email', 'co-email', co.email) + field('Website', 'co-website', co.website) +
        field('Address', 'co-address', co.address) + field('Insurance line', 'co-ins', co.insurance) +
        field('TN license #', 'co-lictn', co.licTN, 'Fill in the real number') + field('AR license #', 'co-licar', co.licAR, 'Fill in the real number') +
        field('MS license #', 'co-licms', co.licMS, 'Fill in the real number') +
      '</div><p class="fine">Every flyer and proposal lists Tennessee, Arkansas and Mississippi, with the numbers once they are filled in.</p></section>' +

      '<section class="panel"><h2>Google Solar (measure from address)</h2>' +
        '<p class="muted sm">The first 10,000 lookups a month are free from Google, then about 1¢ each. RoofScout stops at this many a month.</p>' +
        '<div class="row3"><label>Monthly limit <input type="number" name="solar-limit" min="0" step="1" value="' + ((s.solar && s.solar.monthlyLimit) != null ? s.solar.monthlyLimit : 500) + '"></label></div>' +
        '<p class="fine" id="solar-usage">' + (isCloud() ? 'Checking this month\'s use…' : 'Shown when signed in on the website.') + '</p></section>' +

      '<section class="panel"><h2>Owner contact lookup (Tracerfy)</h2>' +
        '<p class="muted sm">"📞 Find owner contact" on a lead asks Tracerfy (paid skip tracing) for the owner\'s phones and emails. Each lead is looked up once; "Trace again" asks first. RoofScout stops at this many lookups a month.</p>' +
        '<div class="row3"><label>Monthly limit <input type="number" name="st-limit" min="0" step="1" value="' + ((s.skiptrace && s.skiptrace.monthlyLimit) != null ? s.skiptrace.monthlyLimit : 200) + '"></label></div>' +
        '<p class="fine" id="skip-status">' + (isCloud() ? skipStatusText() : 'Shown when signed in on the website.') + '</p></section>' +

      scanSettings() +

      '<section class="panel"><h2>Satellite map</h2>' +
        '<p class="muted sm">For business use, Esri (the imagery provider) asks for a key from a free ArcGIS Location Platform account. Without a key the map still shows Esri\'s public imagery.</p>' +
        '<div class="row2">' + field('Esri API key', 'esri-key', (s.map && s.map.esriKey) || '', 'Paste the key from developers.arcgis.com') + '</div>' +
        '<p class="fine">It is a browser key (everyone signed in can see it). In ArcGIS, limit it to basemaps and to your site addresses.</p></section>' +

      '<section class="panel"><h2>Proposal terms</h2><p class="muted sm">One per line. These print on every proposal; confirm them before sending.</p>' +
        '<textarea name="terms" rows="5">' + esc(s.terms) + '</textarea></section>' +

      '<section class="panel"><h2>Commission split label</h2><p class="muted sm">Shown on each lead and the leaderboard. Payouts are calculated in the GrayCo CRM.</p>' +
        field('Split', 'commission', s.commission) + '</section>' +
      (admin ? '<div class="sticky-save"><button class="btn primary" type="submit">Save settings</button></div>' : '') +
      '</fieldset></form>' +

      viewTeam() +

      '<form id="profile-form" class="panel"><h2>My profile</h2><p class="muted sm">Your name and direct number go on the flyers and proposals you send.</p><div class="row2">' +
        field('Name', 'p-name', me.name) + field('Title', 'p-title', me.title) +
        field('Direct phone', 'p-phone', me.phone) +
        (isCloud() ? '<label>New password <input type="password" name="p-pass" autocomplete="new-password" minlength="8" placeholder="Leave blank to keep"></label>' : '') +
      '</div>' + (isCloud() ? '<p class="fine">Your password is your GrayCo sign-in: changing it here changes it for the CRM too.</p>' : '') +
      '<button class="btn primary" type="submit">Save profile</button></form>' +

      '<section class="panel"><h2>Data</h2><p class="muted sm">' + (isCloud()
        ? 'Leads are kept in the GrayCo database, which is backed up every night with the CRM. You can also download your own copy.'
        : 'Demo mode saves in this browser only. Download a backup to keep it.') + '</p>' +
        '<div class="btn-row"><button class="btn ghost" data-act="csv">Export leads (CSV)</button>' +
        '<button class="btn ghost" data-act="backup">Download backup</button>' +
        (admin ? '<button class="btn ghost" data-act="clear-demo">Remove demo leads</button>' : '') +
        (!isCloud() ? '<label class="btn ghost file-btn">Restore backup<input type="file" id="restore" accept="application/json,.json" hidden></label>' +
          '<button class="btn danger" data-act="reset">Reset demo</button>' : '') +
      '</div></section>';
  }

  function scanSettings() {
    var c = scanCfg(), w = Object.assign({}, Scan.DEFAULT_WEIGHTS, c.weights || {}), src = c.sources || {};
    function srcRow(k, label, note) {
      var v = src[k] || {};
      return '<tr><td><label class="check"><input type="checkbox" name="as-' + k + '-on"' + (v.on ? ' checked' : '') + '> ' + label + '</label></td>' +
        '<td><input name="as-' + k + '-url" value="' + esc(v.url || '') + '" placeholder="' + (k === 'desoto' || k === 'permits' ? 'https://…/MapServer/0' : 'Built-in address') + '"></td><td class="sm muted">' + note + '</td></tr>';
    }
    return '<section class="panel" id="scan-settings"><h2>Area scan</h2>' +
      '<p class="muted sm">Map → Scan an area finds large buildings from public data (OpenStreetMap buildings, county parcels, Memphis permits, NOAA hail). Settings apply to the whole team.</p>' +
      '<div class="row3"><label>Minimum roof ft² <input type="number" name="as-min" min="3000" step="1000" value="' + (c.minSqft || 10000) + '"></label>' +
      '<label>Default area <select name="as-area">' + Store.PLACES.map(function (p) { return '<option value="' + p.id + '"' + (p.id === c.defaultArea ? ' selected' : '') + '>' + esc(p.label) + '</option>'; }).join('') + '</select></label>' +
      '<label>Hail lookback, days (0 = off) <input type="number" name="as-hail" min="0" max="90" step="1" value="' + (Number(c.hailDays) || 0) + '"></label></div>' +
      '<h3>Score weights</h3><div class="row5">' +
        [['size', 'Roof size'], ['age', 'Roof age'], ['hail', 'Hail'], ['type', 'Building type'], ['distance', 'Close to Bartlett']].map(function (x) {
          return '<label>' + x[1] + ' <input type="number" name="as-w-' + x[0] + '" min="0" max="100" step="1" value="' + w[x[0]] + '"></label>';
        }).join('') + '</div><p class="fine">Relative weights (they need not add up to 100). A roof permit in the last 7 years always lowers the score.</p>' +
      '<h3>Do not contact</h3><textarea name="as-dnc" rows="4" placeholder="One owner name or parcel ID per line">' + esc(c.doNotContact || '') + '</textarea>' +
      '<p class="fine">Buildings whose owner of record or parcel matches a line are left out of every scan. Add anyone who asks not to be contacted.</p>' +
      '<h3>Data sources</h3><div class="table-wrap"><table class="grid edit"><tbody>' +
        srcRow('shelby', 'Shelby County parcels', 'Shelby County ReGIS. Its terms reserve this data for ReGIS participants and their agents: get an OK from ReGIS@shelbycountytn.gov before turning it on. Until then, results say "owner unknown — look up".') +
        srcRow('desoto', 'DeSoto County parcels', 'Paste the parcel layer address from DeSoto County GIS, (662) 469-8019.') +
        srcRow('crittenden', 'Crittenden County parcels', 'Arkansas GIS Office statewide parcels (public open data).') +
        srcRow('permits', 'Memphis roof permits', 'City of Memphis "DPD Building Permits" on data.memphistn.gov: I want to use this → View API resources → copy the GeoService address (ends in /FeatureServer/0).') +
      '</tbody></table></div>' +
      '<div class="row3"><label>Permit records start <input type="date" name="as-permits-since" value="' + esc((src.permits && src.permits.since) || '2021-01-01') + '"></label></div>' +
      '<details class="mt-sm"><summary class="sm">Advanced</summary><label>Single-family land use (pattern, leave empty for the built-in one) <input name="as-res" value="' + esc(c.residentialPattern || '') + '" placeholder="' + esc(Scan.DEFAULT_RESIDENTIAL) + '"></label></details>' +
      '<p class="fine" id="scan-status">' + (isCloud() ? 'Checking the scan server…' : 'Shown when signed in on the website.') + '</p></section>';
  }

  function readScanSettings(form) {
    var g = function (n) { return form.elements[n] ? form.elements[n].value.trim() : ''; };
    var on = function (n) { return !!(form.elements[n] && form.elements[n].checked); };
    var sources = {};
    ['shelby', 'desoto', 'crittenden', 'permits'].forEach(function (k) {
      var url = g('as-' + k + '-url');
      if (url && !/^https:\/\/[^\s?#]+\/(MapServer|FeatureServer)\/\d+$/i.test(url)) throw new Error('Area scan: the address for ' + k + ' must be an https ArcGIS layer address ending in /MapServer/<number> or /FeatureServer/<number>.');
      sources[k] = { on: on('as-' + k + '-on'), url: url };
    });
    sources.permits.since = g('as-permits-since') || '2021-01-01';
    var pat = g('as-res');
    if (pat) { try { new RegExp(pat, 'i'); } catch (e) { throw new Error('Area scan: the single-family pattern is not valid.'); } }
    var weights = {};
    Object.keys(Scan.DEFAULT_WEIGHTS).forEach(function (k) { weights[k] = Math.max(0, Math.min(100, Number(g('as-w-' + k)) || 0)); });
    if (!Object.keys(weights).some(function (k) { return weights[k] > 0; })) throw new Error('Area scan: at least one score weight must be more than 0.');
    return {
      minSqft: Math.max(3000, Math.round(Number(g('as-min')) || 10000)),
      defaultArea: g('as-area') || 'bartlett',
      hailDays: Math.max(0, Math.min(90, Math.round(Number(g('as-hail')) || 0))),
      weights: weights,
      doNotContact: form.elements['as-dnc'] ? form.elements['as-dnc'].value : '',
      residentialPattern: pat,
      sources: sources
    };
  }

  function field(label, name, val, ph) {
    return '<label>' + label + ' <input name="' + name + '" value="' + esc(val || '') + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '></label>';
  }

  function rtRow(t) {
    var inUse = state.leads.some(function (l) { return l.roofType === t.id; });
    var e = Pricing.estimate(100, t, state.settings.margin);
    return '<tr data-rt="' + esc(t.id) + '">' +
      '<td><input name="rt-name" value="' + esc(t.name) + '" required></td>' +
      '<td class="r"><input type="number" name="rt-sq" min="0" step="1" value="' + (t.perSquare || 0) + '"></td>' +
      '<td class="r"><input type="number" name="rt-mat" min="0" step="0.05" value="' + t.mat + '"></td>' +
      '<td class="r"><input type="number" name="rt-labor" min="0" step="0.05" value="' + t.labor + '"></td>' +
      '<td class="r rt-cost">$' + Pricing.costPerSqft(t).toFixed(2) + '</td>' +
      '<td class="r rt-margin">' + Math.round(e.margin) + '%</td>' +
      '<td><input type="checkbox" name="rt-low"' + (t.lowSlope ? ' checked' : '') + '></td>' +
      '<td>' + (inUse || t.id === 'metal' ? '' : '<button type="button" class="btn ghost sm" data-act="del-rt">Remove</button>') + '</td></tr>';
  }

  function updateRtRow(tr) {
    var t = {
      mat: Number($('[name=rt-mat]', tr).value) || 0,
      labor: Number($('[name=rt-labor]', tr).value) || 0,
      perSquare: Number($('[name=rt-sq]', tr).value) || 0
    };
    var m = Number(($('[name=margin]') || {}).value);
    var e = Pricing.estimate(100, t, m >= 0 && m < 100 ? m : state.settings.margin);
    $('.rt-cost', tr).textContent = '$' + Pricing.costPerSqft(t).toFixed(2);
    $('.rt-margin', tr).textContent = Math.round(e.margin) + '%';
  }

  function viewTeam() {
    var admin = isAdmin();
    return '<section class="panel"><h2>Team</h2><p class="muted sm">' + (isCloud()
        ? 'Everyone with a GrayCo CRM sign-in can use RoofScout. Add or remove people in the CRM (💎 → Team access); admins there are admins here.'
        : 'Demo teammates, for trying the leaderboard. Real teammates come from the CRM sign-in.') + '</p>' +
      '<div class="table-wrap"><table class="grid"><thead><tr><th>Name</th><th>Title</th><th>Phone</th><th>Email</th><th>Role</th><th></th></tr></thead><tbody>' +
      state.users.map(function (u) {
        return '<tr><td>' + esc(u.name) + '</td><td>' + esc(u.title) + '</td><td>' + esc(u.phone) + '</td><td>' + esc(u.email) + '</td><td>' + esc(u.role) + '</td>' +
          '<td class="nowrap">' + (admin ? '<button class="btn ghost sm" data-act="edit-user" data-id="' + esc(u.id) + '">Edit</button>' : '') +
          (!isCloud() && u.id !== me.id ? ' <button class="btn ghost sm" data-act="as-user" data-id="' + esc(u.id) + '">Use as</button>' +
            (admin ? ' <button class="btn ghost sm" data-act="del-user" data-id="' + esc(u.id) + '">Remove</button>' : '') : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (!isCloud() && admin ? '<button class="btn ghost sm" data-act="edit-user" data-id="">+ Add demo teammate</button>' : '') + '</section>';
  }

  function readSettingsForm(form) {
    var g = function (n) { return form.elements[n].value.trim(); };
    var nums = function (n) { return Number(form.elements[n].value); };
    var margin = nums('margin');
    if (!(margin >= 0 && margin < 100)) throw new Error('Margin must be between 0 and 99%.');
    var types = $$('#rt-rows tr', form).map(function (tr) {
      var name = $('[name=rt-name]', tr).value.trim();
      if (!name) throw new Error('Every roof type needs a name.');
      return {
        id: tr.dataset.rt || Store.newId('rt'),
        name: name,
        mat: Number($('[name=rt-mat]', tr).value) || 0,
        labor: Number($('[name=rt-labor]', tr).value) || 0,
        perSquare: Math.max(0, Number($('[name=rt-sq]', tr).value) || 0),
        lowSlope: $('[name=rt-low]', tr).checked
      };
    });
    if (!types.length) throw new Error('Keep at least one roof type.');
    var cov = nums('c-cov');
    if (!(cov > 0)) throw new Error('Coverage per gallon must be more than 0.');
    return Store.mergeSettings({
      roofTypes: types,
      margin: margin,
      coating: { low: nums('c-low') || 0, high: nums('c-high') || 0, galPrice: nums('c-gal') || 0, galCoverage: cov },
      company: { name: g('co-name'), phone: g('co-phone'), email: g('co-email'), website: g('co-website'), address: g('co-address'), insurance: g('co-ins'), licTN: g('co-lictn'), licAR: g('co-licar'), licMS: g('co-licms') },
      terms: form.elements.terms.value,
      commission: g('commission'),
      map: { esriKey: g('esri-key') },
      solar: { monthlyLimit: Math.max(0, Math.round(nums('solar-limit') || 0)) },
      skiptrace: { monthlyLimit: Math.max(0, Math.round(nums('st-limit') || 0)) },
      areaScan: readScanSettings(form)
    });
  }

  function userForm(u) {
    var isNew = !u;
    u = u || { id: '', name: '', title: '', phone: '', email: '', role: 'pm' };
    var roles = isCloud()
      ? (u.role === 'admin' ? [] : ['pm', 'sales'])
      : ['admin', 'pm', 'sales'];
    showModal('<form id="user-form" data-id="' + esc(u.id) + '">' +
      '<div class="modal-head"><h2 id="modal-title">' + (isNew ? 'Add demo teammate' : 'Edit ' + esc(u.name)) + '</h2><button type="button" class="x" data-act="close" aria-label="Close">×</button></div>' +
      '<div class="row2">' +
        '<label>Name <input name="name" required value="' + esc(u.name) + '"></label>' +
        '<label>Title <input name="title" value="' + esc(u.title) + '"></label>' +
        '<label>Direct phone <input name="phone" value="' + esc(u.phone) + '"></label>' +
        (isCloud() ? '<label>Email (sign-in) <input value="' + esc(u.email) + '" disabled></label>'
          : '<label>Email <input type="email" name="email" required value="' + esc(u.email) + '"></label>') +
        (roles.length ? '<label>Role <select name="role"' + (u.id === me.id ? ' disabled' : '') + '>' + roles.map(function (r) {
          return '<option' + (u.role === r ? ' selected' : '') + '>' + r + '</option>';
        }).join('') + '</select></label>' : '<p class="fine">Admin (set in the CRM\'s Team access).</p>') +
      '</div><div class="btn-row"><button class="btn primary" type="submit">Save</button><button type="button" class="btn ghost" data-act="close">Cancel</button></div></form>');
  }

  // ---- Build ----------------------------------------------------------------

  function viewBuild() {
    return '<div class="build">' +
      '<div class="section-head"><h1>The plan: from prototype to real leads</h1>' +
      '<p class="muted">Everything here works with real leads. The steps below add automatic owner lookup, automatic measuring and, last, an automatic scan for bad roofs.</p></div>' +
      '<ol class="steps">' +
        step('done', 'Lead program', 'Leads, call list, pipeline, leaderboard, estimates, flyers and proposals.') +
        step('done', 'Real leads from the map', 'Find a roof on the satellite map (or search its address), trace its outline to measure it, and save it as a lead. Free.') +
        step(isCloud() ? 'done' : '', 'Scan an area (public data)', 'Map → Scan an area: draw an area, or pick a ZIP or city, and RoofScout lists the large commercial and industrial buildings in it, scored by roof size, age signals, hail and distance. ' +
          'Buildings from OpenStreetMap, owners and mailing addresses from county parcel records, roof permits from the City of Memphis, hail from NOAA. Free; Google Solar is used only when you click 📡 Measure.') +
        step(isCloud() ? 'done' : '', '1. Shared database + team sign-in', 'Runs on the GrayCo CRM\'s Supabase project. Everyone with a CRM sign-in gets in with the same email and password and works one shared lead pool from any device. ' +
          (isCloud() ? '<b>On.</b>' : 'Turns on when an admin runs <code>docs/roofscout-setup.sql</code> once in Supabase.')) +
        step('', '2. Phones and emails (skip trace)', 'Owner names and mailing addresses now come free from county records in the area scan. Phones and emails still need skip tracing ($0.02–$0.15 per record). Check numbers against the Do-Not-Call list before they reach the call list.') +
        step('', '3. Automatic measurements', 'Google Solar API (low cost) for roof area and pitch from just an address; EagleView ($25–$75/report) when you need a bid-grade report. Until then, trace roofs on the map.') +
        step('', '4. Roof condition from imagery', 'The area scan finds and ranks big roofs but cannot see their condition. Licensed aerial imagery (Nearmap / EagleView) with condition scoring, or a custom AI model later at volume. The largest cost, which scales with the area scanned. Pilot one zip code first.') +
        step('', '5. Move into the GrayCo CRM', 'RoofScout becomes a section of the CRM. Its data is already in the CRM\'s database, so nothing needs copying.') +
      '</ol>' +
      '<div class="panel"><h2>Costs at a glance</h2><ul>' +
        '<li>Monthly software/data: about $75–250 to start, $1k–3k+ at volume.</li>' +
        '<li>Why it costs money: you pay to look at every rooftop (licensed imagery + compute), whatever is found, and most roofs are fine.</li>' +
      '</ul><h2>Rules we always follow</h2><ul>' +
        '<li>Imagery must be licensed. Never scrape Google Earth.</li>' +
        '<li>Calling follows DNC and TCPA rules: calling hours, opt-outs, no auto-dialing cell phones without consent.</li>' +
        '<li>Never guess or invent an owner\'s contact info. Real leads come only from the real data pipeline or from what a teammate verified.</li>' +
      '</ul></div></div>';
  }

  function step(cls, title, body) {
    return '<li class="step ' + cls + '"><h3>' + title + '</h3><p>' + body + '</p></li>';
  }

  var VIEWS = { map: viewMap, leads: viewLeads, calls: viewCalls, pipeline: viewPipeline, activity: viewActivity, settings: viewSettings, build: viewBuild };

  // ---- Lead editor ----------------------------------------------------------

  function showModal(html) {
    $('#modal-body').innerHTML = html;
    $('#modal').hidden = false;
    document.body.classList.add('modal-open');
    var first = $('#modal-body input:not([disabled]), #modal-body select, #modal-body textarea');
    if (first) first.focus();
  }

  function closeModal() {
    draftExtras = null;
    $('#modal').hidden = true;
    $('#modal-body').innerHTML = '';
    document.body.classList.remove('modal-open');
    if (waitingState) setTimeout(function () { applyState(waitingState); }, 0);
  }

  function openLead(id) {
    var l = leadById(id);
    if (!l) return;
    // Count an open at most once per 10 minutes per person, so the feed stays readable.
    var recent = state.activity.some(function (a) { return a.action === 'open' && a.lead === id && a.user === me.id && Date.now() - a.ts < 6e5; });
    if (!recent) log('open', l);
    leadForm(l);
  }

  function newLead() {
    draftExtras = null;
    leadForm({
      id: '', name: '', address: '', kind: 'commercial', roofType: state.settings.roofTypes[0].id, areaSqft: 10000,
      condition: 50, confidence: null, issues: [], owner: { name: '', company: '', phone: '', email: '' },
      stage: 'New', assignedTo: me.id, notes: '', dnc: false, source: 'manual', demo: false
    });
  }

  function leadForm(l) {
    var isNew = !l.id, o = l.owner || {};
    var hist = isNew ? [] : state.activity.filter(function (a) { return a.lead === l.id; }).slice(-30).reverse();
    function sel(name, opts, cur) {
      return '<select name="' + name + '">' + opts.map(function (p) {
        return '<option value="' + esc(p[0]) + '"' + (p[0] === cur ? ' selected' : '') + '>' + esc(p[1]) + '</option>';
      }).join('') + '</select>';
    }
    var people = [['', 'Unassigned']].concat(state.users.map(function (u) { return [u.id, u.name]; }));
    if (l.assignedTo && !userById(l.assignedTo)) people.push([l.assignedTo, userName(l.assignedTo) + ' (no longer on the team)']);

    showModal('<form id="lead-form" data-id="' + esc(l.id) + '">' +
      '<div class="modal-head"><h2 id="modal-title">' + (isNew ? 'Add lead' : esc(l.name)) + ' ' + (isNew ? '' : tags(l)) + '</h2>' +
        '<button type="button" class="x" data-act="close" aria-label="Close">×</button></div>' +
      (l.demo ? '<p class="note">DEMO site: synthetic sample data, not a real property or owner. Practice on it, but don\'t send its documents to anyone.</p>' : '') +
      '<div class="lead-grid"><div>' +
        '<fieldset><legend>Property &amp; roof</legend><div class="row2">' +
          '<label class="span2">Property name <input name="name" required value="' + esc(l.name) + '"></label>' +
          '<label class="span2">Address <input name="address" value="' + esc(l.address) + '"></label>' +
          '<label>Type ' + sel('kind', [['commercial', 'Commercial'], ['residential', 'Residential']], l.kind) + '</label>' +
          '<label>Roof type ' + sel('roofType', state.settings.roofTypes.map(function (t) { return [t.id, t.name]; }), l.roofType) + '</label>' +
          '<label>Roof area (ft²) <input type="number" name="areaSqft" min="0" step="10" required value="' + l.areaSqft + '"></label>' +
          '<label>Condition (0 bad – 100 good) <input type="number" name="condition" min="0" max="100" required value="' + l.condition + '"></label>' +
          '<label class="span2">Issues seen (comma separated) <input name="issues" value="' + esc((l.issues || []).join(', ')) + '"></label>' +
          '<label>Latitude <input type="number" name="lat" step="any" value="' + (typeof l.lat === 'number' ? l.lat.toFixed(6) : '') + '" placeholder="optional, for the map"></label>' +
          '<label>Longitude <input type="number" name="lng" step="any" value="' + (typeof l.lng === 'number' ? l.lng.toFixed(6) : '') + '" placeholder="optional"></label>' +
          (l.areaSource === 'google' ? '<p class="fine span2">Area from Google roof data (Solar API). Verify on site.</p>' : '') +
          (l.areaSource !== 'google' && (l.outline || (isNew && draftExtras)) ? '<p class="fine span2">Area traced on the satellite map' + ((l.pitch || (draftExtras && draftExtras.pitch)) && (l.pitch || draftExtras.pitch) !== 'flat' ? ', ' + (l.pitch || draftExtras.pitch) + '/12 pitch' : ', flat / low-slope') + '. Verify on site.</p>' : '') +
          (l.confidence ? '<p class="fine span2">Grading confidence from imagery: ' + l.confidence + '%</p>' : '') +
        '</div></fieldset>' +
        '<fieldset><legend>Owner / manager contact</legend><div class="row2">' +
          '<label>Contact name <input name="o-name" value="' + esc(o.name) + '"></label>' +
          '<label>Company <input name="o-company" value="' + esc(o.company) + '"></label>' +
          '<label>Phone <input type="tel" name="o-phone" value="' + esc(o.phone) + '"></label>' +
          '<label>Email <input type="email" name="o-email" value="' + esc(o.email) + '"></label>' +
          '<label class="span2">Owner mailing address <input name="o-mail" value="' + esc(l.ownerMail || '') + '"></label>' +
          '<label class="check span2"><input type="checkbox" name="dnc"' + (l.dnc ? ' checked' : '') + '> On the Do-Not-Call list / asked not to be called</label>' +
          '<label class="check span2"><input type="checkbox" name="no-contact"' + (l.doNotContact ? ' checked' : '') + '> Do not contact: the owner asked not to be contacted at all (no calls, texts, mail or email)</label>' +
          '<p class="fine span2">Only enter contact info you\'ve verified (from the owner, county records or a paid lookup). Never guess.' + (l.source === 'scan' ? ' The company above is the owner of record from county tax records.' : '') + '</p>' +
        '</div></fieldset>' +
        '<fieldset><legend>Pipeline</legend><div class="row2">' +
          '<label>Stage ' + sel('stage', Store.STAGES.map(function (s) { return [s, s]; }), l.stage) + '</label>' +
          '<label>Assigned to ' + sel('assignedTo', people, l.assignedTo) + '</label>' +
          '<label class="span2">Notes <textarea name="notes" rows="3">' + esc(l.notes) + '</textarea></label>' +
        '</div></fieldset>' +
      '</div><aside>' +
        '<div class="panel est" id="est"></div>' +
        '<div class="panel solar" id="solar-box"></div>' +
        '<div class="panel contact-box" id="contact-box"></div>' +
        (l.scan || l.parcel ? '<div class="panel"><h3>From the area scan</h3>' +
          (l.scan ? '<div class="est-row"><span>Score</span><b>' + esc(l.scan.score) + '</b></div><p class="fine">' + esc((l.scan.reasons || []).join(' · ')) + '</p>' : '') +
          (l.parcel ? '<p class="fine">Parcel ' + esc(l.parcel.id) + (l.parcel.landUse ? ' · ' + esc(l.parcel.landUse) : '') + (l.parcel.yearBuilt ? ' · built ' + esc(l.parcel.yearBuilt) : '') + (l.parcel.bldgSqft ? ' · ' + num(l.parcel.bldgSqft) + ' ft² building (county)' : '') + '</p>' : '') +
          (l.sourceNote ? '<p class="fine">' + esc(l.sourceNote) + '</p>' : '') + '</div>' : '') +
        (!isNew && l.updatedBy ? '<p class="fine">Last saved by ' + esc(userName(l.updatedBy)) + ' · ' + U.when(l.updatedAt) + '</p>' : '') +
        (hist.length ? '<div class="panel"><h3>History</h3><ul class="feed sm">' + hist.map(function (a) {
          return '<li><span class="muted">' + U.when(a.ts) + '</span> ' + esc(userName(a.user)) + ' ' + (ACTION_LABEL[a.action] || esc(a.action)) + (a.detail ? ' <span class="muted">' + esc(a.detail) + '</span>' : '') + '</li>';
        }).join('') + '</ul></div>' : '') +
      '</aside></div>' +
      '<div class="btn-row modal-foot">' +
        '<button class="btn primary" type="submit">' + (isNew ? 'Add lead' : 'Save') + '</button>' +
        (isNew ? '' : '<button type="button" class="btn ghost" data-act="measure-lead">📐 ' + (l.outline ? 'Re-measure' : 'Measure') + ' on map</button>' +
          '<button type="button" class="btn ghost" data-act="flyer">Print flyer</button><button type="button" class="btn ghost" data-act="proposal">Print proposal</button>' +
          (l.assignedTo === me.id ? '' : '<button type="button" class="btn ghost" data-act="claim">Assign to me</button>')) +
        '<span class="grow"></span>' +
        (!isNew && isAdmin() ? '<button type="button" class="btn danger" data-act="del-lead">Delete</button>' : '') +
        '<button type="button" class="btn ghost" data-act="close">Close</button>' +
      '</div></form>');
    solarDraft = l.solar && solarFresh(l.solar) ? Object.assign({}, l.solar) : null;
    renderSolar();
    renderContact(l);
    updateEstimate();
  }

  // ---- Owner contact (Tracerfy skip tracing) ---------------------------------
  //
  // Paid per lookup, so: only when someone clicks, once per lead (the server keeps the
  // answer; "Trace again" asks first), within the admin's monthly limit. Phones are shown
  // with Tracerfy's Do-Not-Call / litigator flags; RoofScout never dials or texts by itself.

  var skipStatus = null;          // { connected, usedThisMonth, limit, balance } from the server
  var skipBusy = {};              // lead id → lookup running (no double clicks)
  var SKIP_FN = 'roofscout-skiptrace';

  function skipOn() { return isCloud() && skipStatus && skipStatus.connected; }

  function loadSkipStatus() {
    if (!isCloud()) return Promise.resolve();
    return Cloud.fn(SKIP_FN, 'GET', undefined, 'action=status').then(function (s) { skipStatus = s; }, function (e) { skipStatus = { connected: false, error: e.message }; });
  }

  function skipLeft() { return skipStatus ? Math.max(0, skipStatus.limit - skipStatus.usedThisMonth) : 0; }

  function skipStatusText() {
    if (!skipStatus) return 'Checking Tracerfy…';
    if (skipStatus.error) return skipStatus.error;
    if (!skipStatus.connected) return 'Not connected: add TRACERFY_API_KEY in Netlify (Site configuration → Environment variables), then Trigger deploy. Until then the 📞 Find owner contact button is hidden.';
    return 'Connected to Tracerfy. Used this month: ' + skipStatus.usedThisMonth + ' of ' + skipStatus.limit + '.' +
      (skipStatus.balance != null ? ' Tracerfy credit balance: ' + num(skipStatus.balance) + '.' : '');
  }

  function phoneFlags(p) {
    var out = [];
    if (p.dnc === true) out.push('<span class="chip poor">On Do Not Call list</span>');
    if (p.litigator === true) out.push('<span class="chip poor">TCPA litigator: do not call</span>');
    if (p.dnc === false && p.litigator !== true) out.push('<span class="chip good">Not on DNC (Tracerfy)</span>');
    if (p.dnc == null) out.push('<span class="chip demo">not checked against Do Not Call</span>');
    return out.join(' ');
  }

  function renderContact(l) {
    var box = $('#contact-box');
    if (!box) return;
    var c = l.contact, html = '<h3>Owner contact</h3>';
    if (l.doNotContact) html += '<p class="note sm">Do not contact: this owner asked not to be contacted.</p>';
    if (c) {
      if (!c.hit) html += '<p class="sm">Tracerfy found no contact for this address.</p>';
      (c.names || []).forEach(function (n) {
        html += '<div class="sm"><b>' + esc(n.name) + '</b>' + (n.owner ? ' · property owner' : '') + (n.deceased ? ' · <span class="err">deceased</span>' : '') + (n.litigator ? ' <span class="chip poor">TCPA litigator</span>' : '') + '</div>';
      });
      if ((c.phones || []).length) {
        html += '<ul class="contact-list">' + c.phones.map(function (p) {
          var bad = p.dnc === true || p.litigator === true;
          return '<li><span class="phone-num' + (bad ? ' struck' : '') + '">' + esc(p.number) + '</span> <span class="muted sm">' + esc(p.type || '') + '</span><div>' + phoneFlags(p) +
            (!bad && !l.doNotContact ? ' <button type="button" class="btn ghost sm" data-act="contact-use" data-v="' + esc(p.number) + '">Use</button>' : '') + '</div></li>';
        }).join('') + '</ul>';
      }
      if ((c.emails || []).length) html += '<div class="sm">' + c.emails.map(esc).join('<br>') + '</div>';
      html += '<p class="fine"><b>Check the National Do Not Call list before cold calls or texts.</b> RoofScout never dials or texts automatically.</p>';
      html += '<p class="fine">Source: ' + esc(c.source || 'Tracerfy') + ' · ' + esc(String(c.fetchedAt || '').slice(0, 10)) + (c.by ? ' · ' + esc(userName(c.by)) : '') + '</p>';
    }
    if (skipOn() && l.id && !l.doNotContact) {
      html += c
        ? '<button type="button" class="btn ghost sm" data-act="contact-again"' + (skipBusy[l.id] ? ' disabled' : '') + '>Trace again</button>'
        : '<p class="fine">Uses 1 Tracerfy lookup — ' + skipLeft() + ' left this month (credits are charged only when Tracerfy finds someone).</p>' +
          '<button type="button" class="btn ghost block" data-act="contact-find"' + (skipBusy[l.id] ? ' disabled' : '') + '>' + (skipBusy[l.id] ? 'Looking up…' : '📞 Find owner contact') + '</button>';
    } else if (!c && !l.doNotContact) {
      html += '<p class="fine">' + (!l.id ? 'Save the lead first.' : isCloud() ? 'Owner phone lookup is not set up (see Settings).' : 'Available when signed in on the website.') + '</p>';
    }
    box.innerHTML = html;
  }

  function findContact(leadId, again, btn) {
    var l = leadById(leadId);
    if (!l || !skipOn() || skipBusy[leadId]) return;
    if (l.doNotContact) { toast('This owner asked not to be contacted.', true); return; }
    if (skipLeft() <= 0) { toast('This month\'s Tracerfy limit (' + skipStatus.limit + ' lookups) is used up. An admin can raise it in Settings.', true); return; }
    var msg = (again ? 'Trace again: this asks Tracerfy again and uses another lookup' : 'Find owner contact uses 1 Tracerfy lookup') +
      ' (credits are charged only when Tracerfy finds someone). ' + skipLeft() + ' of ' + skipStatus.limit + ' lookups left this month' +
      (skipStatus.balance != null ? '; credit balance ' + num(skipStatus.balance) : '') + '.\n\nOnly for business outreach to the building\'s owner. Continue?';
    if (!confirm(msg)) return;
    skipBusy[leadId] = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Looking up…'; }
    var o = l.owner || {};
    Cloud.fn(SKIP_FN, 'POST', { leadId: l.id, owner: o.company || o.name || '', address: l.address || '', mail: l.ownerMail || '', again: !!again }).then(function (r) {
      if (r.limit != null) { skipStatus.usedThisMonth = r.usedThisMonth; skipStatus.limit = r.limit; }
      return commitLead(l, function (x) { x.contact = r.contact; }).then(function () {
        if (!r.cached) log('trace', l, r.contact.hit ? (r.contact.phones || []).length + ' phones, ' + (r.contact.emails || []).length + ' emails' : 'no match');
        toast(r.cached ? 'Already looked up: showing the saved result (no charge).' : r.contact.hit ? 'Found ' + (r.contact.phones || []).length + ' phones and ' + (r.contact.emails || []).length + ' emails.' : 'Tracerfy found no contact (no charge).');
      });
    }, function (e) { report(e); }).then(null, function () { /* commitLead already reported it */ }).then(function () {
      delete skipBusy[leadId];
      var f = $('#lead-form');
      if (f && f.dataset.id === leadId) renderContact(leadById(leadId) || l);
      if (tab === 'map') renderScanResults();
    });
  }

  // ---- Google Solar: measure from address -----------------------------------
  //
  // Google's terms limit keeping Solar API results: a lead keeps Google's figures
  // for 30 days at most (then they are re-fetched or removed). Areas a person
  // traced or typed stay for good.

  var SOLAR_DAYS = 30;
  var solarDraft = null;   // Google's result for the lead open in the editor

  function solarFresh(sol) { return sol && sol.at && Date.now() - sol.at < SOLAR_DAYS * 864e5; }

  function renderSolar(msg, busyNow) {
    var box = $('#solar-box');
    if (!box) return;
    var head = '<h3>Google roof measurement</h3>';
    if (!isCloud()) { box.innerHTML = head + '<p class="fine">Available when signed in on the website.</p>'; return; }
    var s = solarDraft;
    var html = head;
    if (s && s.found) {
      html += '<div class="est-big">' + num(s.areaSqft) + ' ft²</div>' +
        '<div class="est-row"><span>Main pitch</span><b>' + (s.pitch == null ? '—' : s.pitch === 0 ? 'flat' : s.pitch + '/12') + '</b></div>' +
        '<div class="est-row"><span>Roof sections</span><b>' + s.segments + '</b></div>' +
        '<div class="est-row"><span>Photo date · quality</span><b>' + esc(s.imageryDate || '?') + ' · ' + esc(String(s.imageryQuality || '?').toLowerCase()) + '</b></div>' +
        '<div class="btn-row mt-sm"><button type="button" class="btn primary sm" data-act="solar-use">Use this size</button>' +
        '<button type="button" class="btn ghost sm" data-act="solar"' + (busyNow ? ' disabled' : '') + '>Look up again</button></div>';
    } else if (s && !s.found) {
      html += '<p class="sm">Google has no roof data for this spot. Trace the roof on the map instead (free).</p>' +
        '<button type="button" class="btn ghost sm" data-act="solar"' + (busyNow ? ' disabled' : '') + '>Try again</button>';
    } else {
      html += '<p class="fine">One click measures the roof from the address or map spot (Google Solar API, about 1¢ a lookup after the free amount).</p>' +
        '<button type="button" class="btn ghost block" data-act="solar"' + (busyNow ? ' disabled' : '') + '>' + (busyNow ? 'Measuring…' : '📡 Measure from address') + '</button>';
    }
    if (msg) html += '<p class="fine">' + esc(msg) + '</p>';
    html += '<p class="fine">Roof data © Google. Kept for ' + SOLAR_DAYS + ' days, then refreshed.</p>';
    box.innerHTML = html;
  }

  function solarLookup() {
    var form = $('#lead-form');
    if (!form) return;
    var e = form.elements;
    var lat = Number(e.lat.value), lng = Number(e.lng.value);
    var where = (e.lat.value !== '' && e.lng.value !== '') ? Promise.resolve([lat, lng]) :
      (e.address.value.trim() ? geocode(e.address.value.trim()).then(function (list) {
        if (!list || !list.length) throw new Error('Could not find that address. Add the city, or trace the roof on the map.');
        e.lat.value = Number(list[0].lat).toFixed(6);
        e.lng.value = Number(list[0].lon).toFixed(6);
        return [Number(list[0].lat), Number(list[0].lon)];
      }) : Promise.reject(new Error('Enter the address (or trace the roof on the map) first.')));
    renderSolar('', true);
    where.then(function (p) {
      return Cloud.fn('solar-lookup', 'POST', { lat: p[0], lng: p[1] });
    }).then(function (r) {
      if (!$('#lead-form')) return;
      solarDraft = r.found ? {
        found: true, areaSqft: r.areaSqft, pitch: r.pitch, segments: r.segments,
        imageryDate: r.imageryDate, imageryQuality: r.imageryQuality, at: Date.now()
      } : { found: false, at: Date.now() };
      renderSolar(r.limit ? 'Lookups this month: ' + r.usedThisMonth + ' of ' + r.limit + '.' : '');
      var id = $('#lead-form').dataset.id;
      log('solar', id ? leadById(id) : null, r.found ? num(r.areaSqft) + ' ft²' : 'no roof data');
    }, function (err) {
      renderSolar(err.message || String(err));
    });
  }

  function useSolarSize() {
    var form = $('#lead-form');
    if (!form || !solarDraft || !solarDraft.found) return;
    form.elements.areaSqft.value = solarDraft.areaSqft;
    solarDraft.used = true;
    updateEstimate();
    toast('Using Google\'s size: ' + num(solarDraft.areaSqft) + ' ft². Save to keep it.');
  }

  // Google's figures older than 30 days come off every lead (the area a person chose stays).
  function expireSolar() {
    if (!isCloud()) return;
    state.leads.forEach(function (l) {
      if (!l.solar || solarFresh(l.solar)) return;
      var keep = l.solar;
      delete l.solar;
      B.saveLead(l).then(null, function () { l.solar = keep; });
    });
  }

  // Live estimate in the lead editor, from what's typed right now.
  function updateEstimate() {
    var form = $('#lead-form');
    if (!form) return;
    var draft = {
      roofType: form.elements.roofType.value,
      areaSqft: Number(form.elements.areaSqft.value) || 0
    };
    var e = estOf(draft), c = coatingOf(draft), rt = rtOf(draft);
    $('#est').innerHTML = '<h3>Approximate estimate</h3>' +
      '<div class="est-big">About ' + money(Pricing.approx(e.price)) + '</div>' +
      '<div class="est-row"><span>' + (e.basis === 'square'
        ? num(e.squares) + ' squares × ' + money(e.perSquare) + '/square'
        : num(draft.areaSqft) + ' ft² at ' + state.settings.margin + '% margin') + '</span><b>' + money(e.price) + '</b></div>' +
      '<div class="est-row muted"><span>Our cost (' + num(draft.areaSqft) + ' ft² × $' + Pricing.costPerSqft(rt).toFixed(2) + ')</span><span>' + money(e.cost) + '</span></div>' +
      '<div class="est-row muted"><span>Margin on this estimate</span><span>' + Math.round(e.margin) + '%</span></div>' +
      (c ? '<h3>Coating option</h3>' +
        '<div class="est-row"><span>' + num(c.squares) + ' squares × $' + state.settings.coating.low + '–$' + state.settings.coating.high + '</span><b>' + moneyShort(c.low) + '–' + moneyShort(c.high) + '</b></div>' +
        '<div class="est-row"><span>Material: ' + num(c.gallons) + ' gal × $' + state.settings.coating.galPrice + '</span><b>' + money(c.materialCost) + '</b></div>' : '') +
      '<p class="fine">GrayCo lead · commission split ' + esc(state.settings.commission) + '</p>';
  }

  function readLeadForm(form, l) {
    var e = form.elements;
    var lat = e.lat.value === '' ? undefined : Number(e.lat.value);
    var lng = e.lng.value === '' ? undefined : Number(e.lng.value);
    l.name = e.name.value.trim();
    l.address = e.address.value.trim();
    l.kind = e.kind.value;
    l.roofType = e.roofType.value;
    l.areaSqft = Math.max(0, Number(e.areaSqft.value) || 0);
    l.condition = Math.max(0, Math.min(100, Math.round(Number(e.condition.value) || 0)));
    l.issues = e.issues.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    l.lat = isFinite(lat) ? lat : undefined;
    l.lng = isFinite(lng) ? lng : undefined;
    l.owner = { name: e['o-name'].value.trim(), company: e['o-company'].value.trim(), phone: e['o-phone'].value.trim(), email: e['o-email'].value.trim() };
    l.ownerMail = e['o-mail'].value.trim();
    if (!l.ownerMail) delete l.ownerMail;
    l.dnc = e.dnc.checked;
    l.doNotContact = e['no-contact'].checked;
    if (!l.doNotContact) delete l.doNotContact;
    l.stage = e.stage.value;
    l.assignedTo = e.assignedTo.value;
    l.notes = e.notes.value;
    if (solarDraft && solarDraft.at) {
      l.solar = { found: solarDraft.found, areaSqft: solarDraft.areaSqft, pitch: solarDraft.pitch, segments: solarDraft.segments,
        imageryDate: solarDraft.imageryDate, imageryQuality: solarDraft.imageryQuality, at: solarDraft.at };
      if (solarDraft.used && l.areaSqft === solarDraft.areaSqft) l.areaSource = 'google';
    } else delete l.solar;
    if (l.areaSource === 'google' && (!l.solar || l.areaSqft !== l.solar.areaSqft)) delete l.areaSource;
  }

  // Save what's in the lead editor. Resolves with the saved lead.
  function saveLeadForm(form) {
    var id = form.dataset.id;
    if (!id) {
      var l = { id: Store.newId('L'), source: 'manual', demo: false, touched: true };
      if (draftExtras) { l.source = 'map'; l.outline = draftExtras.outline; l.pitch = draftExtras.pitch; }
      readLeadForm(form, l);
      return createLead(l).then(function () { log('create', l); return l; });
    }
    var lead = leadById(id);
    if (!lead) return Promise.reject(new Error('This lead is no longer in the list.'));
    var prevStage = lead.stage;
    return commitLead(lead, function (x) { readLeadForm(form, x); }).then(function () {
      log('edit', lead);
      if (prevStage !== lead.stage) log('stage', lead, prevStage + ' → ' + lead.stage);
      return lead;
    }, function (e) {
      if (e.code === 'conflict') {
        closeModal();
        refresh();
        if (e.lead) leadForm(e.lead);
      }
      throw e;
    });
  }

  function withBusy(btn, p) {
    if (btn) btn.disabled = true;
    return p.then(function (v) { if (btn) btn.disabled = false; return v; }, function (e) { if (btn) btn.disabled = false; throw e; });
  }

  // ---- Printing -------------------------------------------------------------

  function printDoc(kind, lead) {
    var ctx = { lead: lead, settings: state.settings, sender: me, roofType: rtOf(lead), estimate: estOf(lead), coating: coatingOf(lead) };
    $('#print-root').innerHTML = kind === 'flyer' ? Docs.flyer(ctx) : Docs.proposal(ctx);
    log(kind, lead);
    // Let the browser lay the document out before opening the print dialog.
    setTimeout(function () { window.print(); }, 50);
  }

  window.addEventListener('afterprint', function () { $('#print-root').innerHTML = ''; });

  // ---- Events ---------------------------------------------------------------

  document.addEventListener('click', function (e) {
    if ($('#app').hidden) return;
    var b = e.target.closest('[data-act]');
    if (b) { handleAct(b); return; }
    var sth = e.target.closest('th[data-ssort]');
    if (sth) {
      var sf = ui.scan;
      if (sf.sort === sth.dataset.ssort) sf.dir = -sf.dir; else { sf.sort = sth.dataset.ssort; sf.dir = sth.classList.contains('r') ? -1 : 1; }
      renderScanResults();
      return;
    }
    var str = e.target.closest('#scan-results tr[data-sid]');
    if (str) { if (!e.target.closest('a')) selectScanSite(str.dataset.sid, false); return; }
    var th = e.target.closest('th[data-sort]');
    if (th) {
      var f = ui.leads;
      if (f.sort === th.dataset.sort) f.dir = -f.dir; else { f.sort = th.dataset.sort; f.dir = th.classList.contains('r') ? -1 : 1; }
      renderLeadTable();
      return;
    }
    var tr = e.target.closest('#lead-table tr[data-id]');
    if (tr) openLead(tr.dataset.id);
  });

  // Click outside the box closes the modal.
  $('#modal').addEventListener('mousedown', function (e) { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

  function handleAct(b) {
    var act = b.dataset.act, id = b.dataset.id;
    var form;
    switch (act) {
      case 'open': openLead(id); break;
      case 'close': closeModal(); break;
      case 'new': newLead(); break;
      case 'scope': setPref('scope', b.dataset.v); break;
      case 'radius': setPref('radius', Number(b.dataset.v)); break;
      case 'scan': if (!isCloud()) runScan(b); break;   // made-up demo sites: local demo mode only
      case 'trace': if (scanDraw) cancelScanDraw(); startTrace(null); break;
      case 'scan-mode':
        readScanOpts();
        scanOpts().mode = b.dataset.v;
        if (scanDraw) cancelScanDraw();
        $('#area-scan').outerHTML = areaScanPanel();
        break;
      case 'scan-draw': startScanDraw(); break;
      case 'scan-run': runAreaScan(); break;
      case 'scan-clear':
        scanRes = null; scanSel = null;
        renderScanResults(); drawScanLayer(); updateScanPanel();
        break;
      case 'scan-zoom':
        var zs = scanSite(id);
        if (zs) { goTo(zs.lat, zs.lng, 18); selectScanSite(zs.id, false); }
        break;
      case 'scan-add': addScanLead(id, b); break;
      case 'contact-find': findContact(id || ($('#lead-form') && $('#lead-form').dataset.id), false, b); break;
      case 'contact-again': findContact($('#lead-form') && $('#lead-form').dataset.id, true, b); break;
      case 'contact-use':
        var pf = $('#lead-form');
        if (pf && pf.elements['o-phone']) { pf.elements['o-phone'].value = b.dataset.v; toast('Phone filled in. Save to keep it.'); }
        break;
      case 'scan-measure': measureScanSite(id, b); break;
      case 'trace-done': finishTrace(); break;
      case 'trace-undo': if (measure) { measure.points.pop(); drawMeasure(); } break;
      case 'trace-cancel': cancelTrace(); break;
      case 'measure-lead':
        var ml = $('#lead-form') && leadById($('#lead-form').dataset.id);
        if (!ml) return;
        closeModal();
        startTrace(ml.id);
        break;
      case 'solar': solarLookup(); break;
      case 'solar-use': useSolarSize(); break;
      case 'geo-go':
        var hit = ($('#geo-results')._results || [])[Number(b.dataset.i)];
        if (hit) goTo(Number(hit.lat), Number(hit.lon), 19);
        break;
      case 'csv': exportCsv(); break;
      case 'call': logCall(id, b.dataset.v); break;

      case 'flyer':
      case 'proposal':
        form = $('#lead-form');
        if (!form.reportValidity()) return;
        withBusy(b, saveLeadForm(form)).then(function (lead) {
          refresh();
          if (lead.demo && !confirm('This is a DEMO site with made-up data. Print anyway (practice only)?')) return;
          if (lead.doNotContact && !confirm('This owner asked not to be contacted. Print anyway (not for sending)?')) return;
          printDoc(act, lead);
        }, function () { /* already reported */ });
        break;

      case 'claim':
        form = $('#lead-form');
        form.elements.assignedTo.value = me.id;
        if (!form.reportValidity()) return;
        withBusy(b, saveLeadForm(form)).then(function (cl) {
          log('claim', cl);
          leadForm(cl);
          refresh();
        }, function () { /* already reported */ });
        break;

      case 'del-lead':
        var dl = leadById($('#lead-form').dataset.id);
        if (!dl || !confirm('Delete "' + dl.name + '"? This cannot be undone.')) return;
        removeLeads([dl.id]).then(function () {
          log('delete', null, dl.name);
          closeModal();
          refresh();
        }, function () { /* already reported */ });
        break;

      case 'add-rt':
        $('#rt-rows').insertAdjacentHTML('beforeend', rtRow({ id: '', name: 'New roof type', mat: 0, labor: 0, perSquare: 0, lowSlope: true }));
        break;
      case 'del-rt':
        b.closest('tr').remove();
        break;

      case 'edit-user': userForm(id ? userById(id) : null); break;
      case 'as-user':
        me = userById(id);
        Store.setSession(me.id);
        showApp();
        break;
      case 'del-user':
        var du = userById(id);
        if (!du || !confirm('Remove ' + du.name + '? Their leads become unassigned.')) return;
        state.users = state.users.filter(function (u) { return u.id !== id; });
        state.leads.forEach(function (l) { if (l.assignedTo === id) l.assignedTo = ''; });
        B.saveUsers().then(refresh, report);
        break;

      case 'backup':
        download('roofscout-backup-' + new Date().toISOString().slice(0, 10) + '.json',
          JSON.stringify(Object.assign({ exportedFrom: isCloud() ? 'shared database' : 'demo mode', exportedAt: new Date().toISOString() }, state), null, 1), 'application/json');
        break;
      case 'clear-demo':
        var demoIds = state.leads.filter(function (l) { return l.demo; }).map(function (l) { return l.id; });
        if (!demoIds.length) { toast('No demo leads to remove.'); return; }
        if (!confirm('Remove all ' + demoIds.length + ' demo leads' + (isCloud() ? ' for the whole team' : '') + ' (including any that were worked)? Real leads stay.')) return;
        removeLeads(demoIds).then(function () {
          toast('Removed ' + demoIds.length + ' demo leads');
          refresh();
        }, function () { /* already reported */ });
        break;
      case 'reset':
        if (!confirm('Erase everything in demo mode on this browser?')) return;
        state = Store.defaults();
        B.replace(state).then(function () {
          me = state.users[0];
          Store.setSession(me.id);
          showApp();
        }, report);
        break;
    }
  }

  document.addEventListener('submit', function (e) {
    var form = e.target;
    var btn = $('button[type=submit]', form);
    if (form.id === 'geo-form') {
      e.preventDefault();
      var q = $('#geo-q').value.trim();
      if (!q) return;
      withBusy(btn, geocode(q)).then(function (list) {
        if (list && list.length === 1) { goTo(Number(list[0].lat), Number(list[0].lon), 19); $('#geo-results').innerHTML = ''; }
        else showGeoResults(list);
      });
      return;
    }
    if (form.id === 'scan-where') {
      e.preventDefault();
      var wq = $('#scan-where-q').value.trim();
      if (!wq) return;
      withBusy(btn, findScanArea(wq)).then(null, function (err) { toast(err.message, true); });
      return;
    }
    if (form.id === 'lead-form') {
      e.preventDefault();
      var wasNew = !form.dataset.id;
      withBusy(btn, saveLeadForm(form)).then(function () {
        toast(wasNew ? 'Lead added' : 'Saved');
        closeModal();
        refresh();
      }, function () { /* already reported */ });
      return;
    }
    if (form.id === 'settings-form') {
      e.preventDefault();
      var next;
      try { next = readSettingsForm(form); } catch (err) { toast(err.message, true); return; }
      var prev = state.settings;
      state.settings = next;
      withBusy(btn, B.saveSettings(next)).then(function () {
        toast('Settings saved' + (isCloud() ? ' for the whole team' : ''));
        refresh();
      }, function (err) { state.settings = prev; report(err); });
      return;
    }
    if (form.id === 'profile-form') {
      e.preventDefault();
      var el = form.elements;
      var before = JSON.stringify(me);
      me.name = el['p-name'].value.trim() || me.name;
      me.title = el['p-title'].value.trim();
      me.phone = el['p-phone'].value.trim();
      var pw = el['p-pass'] ? el['p-pass'].value : '';
      var p = B.saveProfile(me);
      if (pw) p = p.then(function () { return Cloud.setPassword(pw); }).then(function () { toast('Password changed for your GrayCo sign-in'); });
      withBusy(btn, p).then(function () {
        $('#me-name').textContent = me.name + ' · ' + me.role.toUpperCase();
        if (!pw) toast('Profile saved');
        refresh();
      }, function (err) { Object.assign(me, JSON.parse(before)); report(err); });
      return;
    }
    if (form.id === 'user-form') {
      e.preventDefault();
      var f = form.elements, uid = form.dataset.id;
      var u = uid ? userById(uid) : { id: Store.newId('u') };
      var keep = JSON.stringify(u);
      u.name = f.name.value.trim();
      u.title = f.title.value.trim();
      u.phone = f.phone.value.trim();
      if (f.email) u.email = f.email.value.trim().toLowerCase();
      if (f.role && !f.role.disabled) u.role = f.role.value;
      if (!uid) state.users.push(u);
      var save = isCloud() ? B.saveProfile(u) : B.saveUsers();
      withBusy(btn, save).then(function () {
        closeModal();
        toast(uid ? 'Teammate updated' : 'Teammate added');
        refresh();
      }, function (err) {
        if (uid) Object.assign(u, JSON.parse(keep)); else state.users.pop();
        report(err);
      });
    }
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.closest('#lead-form') && /^(roofType|areaSqft)$/.test(t.name)) updateEstimate();
    if (t.id === 'lead-q') { ui.leads.q = t.value; renderLeadTable(); }
    if (t.id === 'radius-range') $('#radius-num').value = t.value;
    if (t.closest('#rt-rows')) updateRtRow(t.closest('tr'));
    if (t.name === 'margin') $$('#rt-rows tr').forEach(updateRtRow);
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.closest('#lead-form')) { if (t.name === 'roofType') updateEstimate(); return; }
    if (t.id === 'lead-kind') { ui.leads.kind = t.value; renderLeadTable(); }
    if (t.id === 'lead-stage') { ui.leads.stage = t.value; renderLeadTable(); }
    if (t.id === 'lead-cond') { ui.leads.cond = t.value; renderLeadTable(); }
    if (t.id === 'scan-place') setPref('place', t.value);
    if (t.id === 'scan-hide-leads') { ui.scan.hideLeads = t.checked; renderScanResults(); }
    if (t.id === 'scan-min' || t.id === 'scan-hail' || t.name === 'scan-type') {
      readScanOpts();
      if (scanRes && !scanRes.running) { renderScanResults(); drawScanLayer(); }
    }
    if (t.id === 'measure-pitch' && measure) { measure.pitch = t.value; drawMeasure(); }
    if (t.id === 'radius-range' || t.id === 'radius-num') setPref('radius', Math.max(0.5, Math.min(500, Number(t.value) || 10)));
    if (t.id === 'restore') restore(t.files[0]);
  });

  function restore(file) {
    if (!file || isCloud()) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var s = JSON.parse(r.result);
        if (!s || s.v !== 1 || !Array.isArray(s.leads) || !Array.isArray(s.users)) throw new Error('bad');
        if (!confirm('Replace everything in demo mode with this backup (' + s.leads.length + ' leads)?')) return;
        state = Store.normalize(s);
        B.replace(state).then(function () {
          me = userById(me.id) || state.users.filter(function (u) { return u.role === 'admin'; })[0] || state.users[0];
          Store.setSession(me.id);
          toast('Backup restored');
          showApp();
        }, report);
      } catch (err) { toast('That file is not a RoofScout backup.', true); }
    };
    r.readAsText(file);
  }

  start();
})();
