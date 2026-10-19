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
    leads: { q: '', kind: 'commercial', stage: '', cond: '', sort: 'priority', dir: -1 }
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

  function start() {
    if (Store.getMode() === 'demo') return startDemo();
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
    }, function (e) {
      if (e.code === 'signed-out' || e.code === 'bad-login') return showLogin(e.code === 'signed-out' ? 'Please sign in again.' : e.message);
      if (e.code === 'no-tables') return loadFailed('RoofScout\'s shared database is not set up yet. An admin runs docs/roofscout-setup.sql once in Supabase (SQL Editor). Until then you can practice in demo mode.');
      loadFailed(e.message || 'Could not load RoofScout.');
    });
  }

  function startDemo() {
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

  $('#demo-btn').addEventListener('click', startDemo);
  $('#retry-btn').addEventListener('click', start);
  $('#loading-demo-btn').addEventListener('click', startDemo);
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
      ? 'Shared team database: everyone with a GrayCo CRM sign-in sees the same leads. Scan results are still <b>DEMO data</b> until the real scan is connected.'
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
    var y = window.scrollY;
    var v = $('#view');
    v.className = 'view view-' + t;
    v.innerHTML = VIEWS[t]();
    if (t === 'map') initMap();
    if (t === 'leads') renderLeadTable();
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
    return !$('#modal').hidden || (a && a.closest && a.closest('#view form'));
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

  function viewMap() {
    var scoped = scopedLeads();
    var flagged = scoped.filter(function (l) { return l.condition < 70 && isOpen(l); })
      .sort(function (a, b) { return a.condition - b.condition; });
    return '<div class="map-layout">' +
      '<aside class="panel scan-panel">' +
        '<h2>Scan</h2>' +
        '<div class="seg" role="group" aria-label="Property type">' +
          ['commercial', 'residential', 'all'].map(function (s) {
            return '<button data-act="scope" data-v="' + s + '" class="' + (prefs.scope === s ? 'on' : '') + '">' +
              (s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)) + '</button>';
          }).join('') +
        '</div>' +
        (prefs.scope !== 'commercial' ? '<p class="note">Residential roofs are harder to grade from satellite (smaller roofs, trees, steep pitch), so their grades carry lower confidence.</p>' : '') +
        '<label>Center <select id="scan-place">' + Store.PLACES.map(function (p) {
          return '<option value="' + p.id + '"' + (p.id === prefs.place ? ' selected' : '') + '>' + esc(p.label) + '</option>';
        }).join('') + '</select></label>' +
        '<label>Radius (miles)' +
          '<div class="radius-row"><input type="range" id="radius-range" min="1" max="100" value="' + Math.min(prefs.radius, 100) + '">' +
          '<input type="number" id="radius-num" min="0.5" max="500" step="0.5" value="' + prefs.radius + '"></div></label>' +
        '<div class="presets">' + [2, 5, 10, 25, 50].map(function (r) {
          return '<button class="btn ghost sm" data-act="radius" data-v="' + r + '">' + r + ' mi</button>';
        }).join('') + '</div>' +
        '<button class="btn primary block" data-act="scan">Run scan (demo)</button>' +
        '<p class="fine">The demo scan makes sample sites so you can try the workflow' + (isCloud() ? ' (the whole team sees them, tagged DEMO)' : '') + '. A real scan needs licensed imagery (Build tab, step 4).</p>' +
        '<div class="legend"><span><i class="dot poor"></i>Poor</span><span><i class="dot fair"></i>Fair</span><span><i class="dot good"></i>Good</span><span><i class="dot won"></i>Won</span></div>' +
        '<h3>Worst roofs in view (' + flagged.length + ')</h3>' +
        '<ul class="mini-list">' + (flagged.slice(0, 8).map(function (l) {
          return '<li><button data-act="open" data-id="' + esc(l.id) + '">' + gradeChip(l) + ' <span>' + esc(l.name) + '</span><b>' + moneyShort(valueOf(l)) + '</b></button></li>';
        }).join('') || '<li class="muted">Run a scan or add a lead.</li>') + '</ul>' +
      '</aside>' +
      '<div class="map-wrap"><div id="map" class="map"></div></div>' +
    '</div>';
  }

  function scopedLeads() {
    var s = prefs.scope;
    return state.leads.filter(function (l) { return s === 'all' || l.kind === s; });
  }

  function centerPlace() {
    return Store.PLACES.filter(function (p) { return p.id === prefs.place; })[0] || Store.PLACES[0];
  }

  function initMap() {
    var el = $('#map');
    if (!window.L) {
      el.innerHTML = '<div class="map-off">The satellite map needs an internet connection. Everything else works without it.</div>';
      return;
    }
    var c = centerPlace();
    map = L.map(el, { zoomControl: true }).setView([c.lat, c.lng], 11);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics'
    }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19
    }).addTo(map);
    var circle = L.circle([c.lat, c.lng], { radius: prefs.radius * 1609.34, color: '#f5a524', weight: 2, fillOpacity: 0.05 }).addTo(map);
    L.circleMarker([c.lat, c.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#13294b', fillOpacity: 1 })
      .bindTooltip(esc(c.label)).addTo(map);

    scopedLeads().forEach(function (l) {
      if (typeof l.lat !== 'number' || typeof l.lng !== 'number') return;
      var color = l.stage === 'Won' ? '#3b82f6' : l.stage === 'Lost' ? '#9ca3af' : { poor: '#ef4444', fair: '#f59e0b', good: '#22c55e' }[U.grade(l.condition).cls];
      L.circleMarker([l.lat, l.lng], { radius: l.kind === 'commercial' ? 8 : 5, color: '#fff', weight: 1.5, fillColor: color, fillOpacity: 0.95 })
        .bindTooltip(esc(l.name) + '<br>' + U.grade(l.condition).label + ' · ' + moneyShort(valueOf(l)))
        .on('click', function () { openLead(l.id); })
        .addTo(map);
    });
    map.fitBounds(circle.getBounds(), { padding: [10, 10] });
  }

  function setPref(k, v) {
    prefs[k] = v;
    Store.savePrefs(prefs);
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
        var hay = [l.name, l.address, o.name, o.company, o.email, o.phone, l.notes].join(' ').toLowerCase();
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
          '<td>' + (o.name || o.company ? esc(o.name || o.company) : '<span class="muted">Needs lookup</span>') + (l.dnc ? ' <span class="chip poor">DNC</span>' : '') + '</td>' +
          '<td class="r muted sm">' + U.when(l.updatedAt) + '</td>' +
        '</tr>';
      }).join('') || '<tr><td colspan="' + LEAD_COLS.length + '" class="empty">No leads match. Run a scan on the Map tab, or click “+ Add lead”.</td></tr>') +
      '</tbody></table>' +
      '<div class="table-foot">' + rows.length + ' leads · open pipeline ' + money(total) + '</div>';
  }

  function exportCsv() {
    var head = ['ID', 'Property', 'Address', 'Type', 'Roof', 'Area ft2', 'Squares', 'Condition', 'Grade', 'Confidence', 'Cost', 'Estimate', 'Priced by', 'Margin %', 'Stage', 'Assigned', 'Owner', 'Company', 'Phone', 'Email', 'DNC', 'Source', 'Demo', 'Commission split', 'Notes', 'Updated'];
    var lines = [head];
    state.leads.forEach(function (l) {
      var e = estOf(l), o = l.owner || {};
      lines.push([l.id, l.name, l.address, l.kind, rtOf(l).name, l.areaSqft, Math.round(e.squares * 10) / 10, l.condition, U.grade(l.condition).label, l.confidence || '',
        Math.round(e.cost), Math.round(e.price), e.basis === 'square' ? '$' + e.perSquare + '/square' : state.settings.margin + '% margin', Math.round(e.margin),
        l.stage, userName(l.assignedTo), o.name, o.company, o.phone, o.email, l.dnc ? 'yes' : '', l.source, l.demo ? 'yes' : '', state.settings.commission, l.notes,
        l.updatedAt ? new Date(l.updatedAt).toISOString() : '']);
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
        var phone = l.dnc
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
          '<div class="call-acts">' + (l.dnc ? '' :
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

  var ACTION_LABEL = { open: 'opened', edit: 'edited', stage: 'moved', call: 'called', create: 'added', flyer: 'printed flyer for', proposal: 'printed proposal for', scan: 'ran a scan:', 'delete': 'deleted', claim: 'claimed' };

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

  function field(label, name, val, ph) {
    return '<label>' + label + ' <input name="' + name + '" value="' + esc(val || '') + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '></label>';
  }

  function rtRow(t) {
    var inUse = state.leads.some(function (l) { return l.roofType === t.id; });
    var e = Pricing.estimate(100, t, state.settings.margin);
    return '<tr data-rt="' + esc(t.id) + '">' +
      '<td><input name="rt-name" value="' + esc(t.name) + '" required></td>' +
      '<td class="r"><input type="number" name="rt-sq" min="0" step="5" value="' + (t.perSquare || 0) + '"></td>' +
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
      commission: g('commission')
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
      '<p class="muted">The scan, measurements and owner data are still DEMO. Leads you add yourself, pricing, the call list, pipeline, leaderboard and documents all work for real. Each step below swaps one demo piece for real data.</p></div>' +
      '<ol class="steps">' +
        step('done', 'Lead program', 'Scan workflow, leads, call list, pipeline, leaderboard, estimates, flyers and proposals.') +
        step(isCloud() ? 'done' : '', '1. Shared database + team sign-in', 'Runs on the GrayCo CRM\'s Supabase project. Everyone with a CRM sign-in gets in with the same email and password and works one shared lead pool from any device. ' +
          (isCloud() ? '<b>On.</b>' : 'Turns on when an admin runs <code>docs/roofscout-setup.sql</code> once in Supabase.')) +
        step('', '2. Owner data + skip trace', 'Regrid parcel/owner data (~$15–50/mo) plus skip tracing ($0.02–$0.15 per record) for real phones and emails. Check numbers against the Do-Not-Call list before they reach the call list.') +
        step('', '3. Real measurements', 'Google Solar API (low cost) for roof area and pitch; EagleView ($25–$75/report) when you need a bid-grade report.') +
        step('', '4. Real scan: imagery + condition', 'Licensed aerial imagery (Nearmap / EagleView) with condition scoring, or a custom AI model later at volume. The largest cost, which scales with the area scanned. Pilot one zip code first.') +
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
          '<label>Roof area (ft²) <input type="number" name="areaSqft" min="0" step="100" required value="' + l.areaSqft + '"></label>' +
          '<label>Condition (0 bad – 100 good) <input type="number" name="condition" min="0" max="100" required value="' + l.condition + '"></label>' +
          '<label class="span2">Issues seen (comma separated) <input name="issues" value="' + esc((l.issues || []).join(', ')) + '"></label>' +
          '<label>Latitude <input type="number" name="lat" step="any" value="' + (typeof l.lat === 'number' ? l.lat.toFixed(6) : '') + '" placeholder="optional, for the map"></label>' +
          '<label>Longitude <input type="number" name="lng" step="any" value="' + (typeof l.lng === 'number' ? l.lng.toFixed(6) : '') + '" placeholder="optional"></label>' +
          (l.confidence ? '<p class="fine span2">Grading confidence from imagery: ' + l.confidence + '%</p>' : '') +
        '</div></fieldset>' +
        '<fieldset><legend>Owner / manager contact</legend><div class="row2">' +
          '<label>Contact name <input name="o-name" value="' + esc(o.name) + '"></label>' +
          '<label>Company <input name="o-company" value="' + esc(o.company) + '"></label>' +
          '<label>Phone <input type="tel" name="o-phone" value="' + esc(o.phone) + '"></label>' +
          '<label>Email <input type="email" name="o-email" value="' + esc(o.email) + '"></label>' +
          '<label class="check span2"><input type="checkbox" name="dnc"' + (l.dnc ? ' checked' : '') + '> On the Do-Not-Call list / asked not to be called</label>' +
          '<p class="fine span2">Only enter contact info you\'ve verified (from the owner, county records or a paid lookup). Never guess.</p>' +
        '</div></fieldset>' +
        '<fieldset><legend>Pipeline</legend><div class="row2">' +
          '<label>Stage ' + sel('stage', Store.STAGES.map(function (s) { return [s, s]; }), l.stage) + '</label>' +
          '<label>Assigned to ' + sel('assignedTo', people, l.assignedTo) + '</label>' +
          '<label class="span2">Notes <textarea name="notes" rows="3">' + esc(l.notes) + '</textarea></label>' +
        '</div></fieldset>' +
      '</div><aside>' +
        '<div class="panel est" id="est"></div>' +
        (!isNew && l.updatedBy ? '<p class="fine">Last saved by ' + esc(userName(l.updatedBy)) + ' · ' + U.when(l.updatedAt) + '</p>' : '') +
        (hist.length ? '<div class="panel"><h3>History</h3><ul class="feed sm">' + hist.map(function (a) {
          return '<li><span class="muted">' + U.when(a.ts) + '</span> ' + esc(userName(a.user)) + ' ' + (ACTION_LABEL[a.action] || esc(a.action)) + (a.detail ? ' <span class="muted">' + esc(a.detail) + '</span>' : '') + '</li>';
        }).join('') + '</ul></div>' : '') +
      '</aside></div>' +
      '<div class="btn-row modal-foot">' +
        '<button class="btn primary" type="submit">' + (isNew ? 'Add lead' : 'Save') + '</button>' +
        (isNew ? '' : '<button type="button" class="btn ghost" data-act="flyer">Print flyer</button><button type="button" class="btn ghost" data-act="proposal">Print proposal</button>' +
          (l.assignedTo === me.id ? '' : '<button type="button" class="btn ghost" data-act="claim">Assign to me</button>')) +
        '<span class="grow"></span>' +
        (!isNew && isAdmin() ? '<button type="button" class="btn danger" data-act="del-lead">Delete</button>' : '') +
        '<button type="button" class="btn ghost" data-act="close">Close</button>' +
      '</div></form>');
    updateEstimate();
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
    l.dnc = e.dnc.checked;
    l.stage = e.stage.value;
    l.assignedTo = e.assignedTo.value;
    l.notes = e.notes.value;
  }

  // Save what's in the lead editor. Resolves with the saved lead.
  function saveLeadForm(form) {
    var id = form.dataset.id;
    if (!id) {
      var l = { id: Store.newId('L'), source: 'manual', demo: false, touched: true };
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
      case 'scan': runScan(b); break;
      case 'csv': exportCsv(); break;
      case 'call': logCall(id, b.dataset.v); break;

      case 'flyer':
      case 'proposal':
        form = $('#lead-form');
        if (!form.reportValidity()) return;
        withBusy(b, saveLeadForm(form)).then(function (lead) {
          refresh();
          if (lead.demo && !confirm('This is a DEMO site with made-up data. Print anyway (practice only)?')) return;
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
