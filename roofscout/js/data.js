// Where RoofScout's data lives.
//   Data.demo()   practice mode: everything in this browser (Store), nothing shared.
//   Data.cloud()  the real thing: the CRM's Supabase project, shared by the whole team.
// Both have the same methods, so the app does not care which one it is using.
// The app changes its in-memory `state` first, then tells the backend what changed.
(function (root) {
  'use strict';

  // ---- Demo mode: this browser only -------------------------------------------

  function demo() {
    var state = null;
    function save() { return Store.save(state) ? Promise.resolve() : Promise.reject(new Error('Could not save in this browser (storage full or blocked).')); }
    return {
      mode: 'demo',
      load: function () { state = Store.load(); return Promise.resolve(state); },
      poll: function () { return Promise.resolve(null); },
      saveLead: save,
      addLeads: save,
      deleteLeads: save,
      addActivity: save,
      saveSettings: save,
      saveProfile: save,
      saveUsers: save,
      pending: function () { return 0; },
      replace: function (s) { state = s; return save(); }
    };
  }

  // ---- Shared database ------------------------------------------------------------

  var LEAD_META = ['id', 'updatedAt', 'updatedBy', 'createdAt', 'createdBy', '_ver'];

  function rowToLead(r) {
    var l = Object.assign({}, r.data || {});
    l.id = r.id;
    l._ver = r.updated_at;                 // exact server timestamp, used to spot edit clashes
    l.updatedAt = Date.parse(r.updated_at) || 0;
    l.updatedBy = r.updated_by || '';
    l.createdAt = Date.parse(r.created_at) || l.createdAt || 0;
    l.createdBy = r.created_by || '';
    return l;
  }

  function leadData(l) {
    var d = {};
    Object.keys(l).forEach(function (k) { if (LEAD_META.indexOf(k) < 0 && l[k] !== undefined) d[k] = l[k]; });
    return d;
  }

  function setVer(l, row) {
    l._ver = row.updated_at;
    l.updatedAt = Date.parse(row.updated_at) || Date.now();
    l.updatedBy = row.updated_by || '';
    l.createdAt = Date.parse(row.created_at) || l.createdAt;
    l.createdBy = row.created_by || l.createdBy;
  }

  // A made-up demo site (Store.demoScan): flagged demo, or named "DEMO …".
  function isDemoLead(l) {
    return !!l && (l.demo === true || /^DEMO\s/.test(String(l.name || '')));
  }

  function clash(message, lead) {
    var e = new Error(message);
    e.code = 'conflict';
    e.lead = lead || null;
    return e;
  }

  function cloud(email) {
    var me = String(email || '').toLowerCase();
    var pendingLeads = {};   // id → lead saved while the database was unreachable
    var pendingActs = [];    // activity rows not yet sent

    function getAll(table, query) {
      // Supabase hands back at most 1,000 rows per request: page through.
      var out = [];
      function page(from) {
        return Cloud.rest('GET', table + '?' + query + '&limit=1000&offset=' + from).then(function (rows) {
          out = out.concat(rows || []);
          return rows && rows.length === 1000 && from < 50000 ? page(from + 1000) : out;
        });
      }
      return page(0);
    }

    function fetchState() {
      return Promise.all([
        Cloud.rest('GET', 'gc_staff?select=email,name,role,active'),
        Cloud.rest('GET', 'rs_profiles?select=email,name,title,phone,rs_role'),
        Cloud.rest('GET', 'rs_settings?id=eq.main&select=data'),
        getAll('rs_leads', 'select=id,data,created_at,created_by,updated_at,updated_by&order=updated_at.desc'),
        Cloud.rest('GET', 'rs_activity?select=id,ts,user_email,lead_id,action,detail&order=ts.desc&limit=1000')
      ]).then(function (r) {
        var staff = (r[0] || []).filter(function (s) { return s.active !== false; });
        if (!staff.some(function (s) { return String(s.email).toLowerCase() === me; })) {
          var e = new Error('This account (' + me + ') is not on the GrayCo staff list. Ask Wesley or Nick to add you in the CRM (💎 → Team access).');
          e.code = 'not-staff';
          throw e;
        }
        var profiles = {};
        (r[1] || []).forEach(function (p) { profiles[p.email] = p; });
        var users = staff.map(function (s) {
          var p = profiles[s.email] || {};
          return {
            id: s.email,
            email: s.email,
            name: p.name || s.name || s.email.split('@')[0],
            title: p.title || '',
            phone: p.phone || '',
            // Admin comes from the CRM's staff list; PM / Sales is RoofScout's own label.
            role: s.role === 'admin' ? 'admin' : (p.rs_role || 'pm')
          };
        }).sort(function (a, b) { return a.name.localeCompare(b.name); });
        // Made-up DEMO sites from the early test phase (when the demo scan saved into the shared
        // list) are never shown on the website: they are counted so an admin can remove them.
        var all = r[3].map(rowToLead);
        var demoIds = all.filter(isDemoLead).map(function (l) { return l.id; });
        var leads = all.filter(function (l) { return !isDemoLead(l); });
        // Changes made while offline win over what the database had, until they are sent.
        Object.keys(pendingLeads).forEach(function (id) {
          leads = leads.filter(function (l) { return l.id !== id; });
          leads.push(pendingLeads[id]);
        });
        var activity = (r[4] || []).map(function (a) {
          return { id: a.id, ts: Date.parse(a.ts), user: a.user_email, lead: a.lead_id, action: a.action, detail: a.detail };
        }).reverse().concat(pendingActs.map(function (a) { return a.local; }));
        return {
          v: 1,
          settings: Store.mergeSettings(r[2] && r[2][0] ? r[2][0].data : null),
          users: users,
          leads: leads,
          demoIds: demoIds,
          activity: activity
        };
      });
    }

    function offline(e) { return e && e.code === 'offline'; }

    // Send anything that could not be sent earlier. Stops at the first network failure.
    function flush() {
      var ids = Object.keys(pendingLeads);
      var chain = Promise.resolve();
      ids.forEach(function (id) {
        chain = chain.then(function () {
          var l = pendingLeads[id];
          if (!l) return;
          // Unconditional on purpose: this person's offline change is the newest one they know of.
          return Cloud.rest('POST', 'rs_leads?on_conflict=id', { id: l.id, data: leadData(l) }, 'resolution=merge-duplicates,return=representation')
            .then(function (rows) { if (rows && rows[0]) setVer(l, rows[0]); delete pendingLeads[id]; });
        });
      });
      return chain.then(function () {
        if (!pendingActs.length) return;
        var batch = pendingActs.slice();
        return Cloud.rest('POST', 'rs_activity?on_conflict=id', batch.map(function (a) { return a.row; }), 'resolution=ignore-duplicates,return=minimal')
          .then(function () { pendingActs = pendingActs.slice(batch.length); });
      });
    }

    return {
      mode: 'cloud',
      load: fetchState,
      poll: function () {
        return flush().then(fetchState, function (e) { if (offline(e)) return null; throw e; });
      },
      pending: function () { return Object.keys(pendingLeads).length + pendingActs.length; },

      // One lead from the editor, call list, etc. If someone else saved it since this
      // person loaded it, nothing is overwritten: the caller gets their version back.
      saveLead: function (l) {
        var body = { data: leadData(l) };
        var req = l._ver
          ? Cloud.rest('PATCH', 'rs_leads?id=eq.' + encodeURIComponent(l.id) + '&updated_at=eq.' + encodeURIComponent(l._ver), body, 'return=representation')
          : Cloud.rest('POST', 'rs_leads', { id: l.id, data: body.data }, 'return=representation');
        return req.then(function (rows) {
          if (rows && rows[0]) { setVer(l, rows[0]); delete pendingLeads[l.id]; return l; }
          return Cloud.rest('GET', 'rs_leads?id=eq.' + encodeURIComponent(l.id) + '&select=id,data,created_at,created_by,updated_at,updated_by')
            .then(function (now) {
              if (!now || !now[0]) throw clash('Someone deleted this lead while you had it open.', null);
              var theirs = rowToLead(now[0]);
              throw clash((theirs.updatedBy || 'Someone') + ' changed this lead while you had it open. Their version is loaded; please make your change again.', theirs);
            });
        }, function (e) {
          if (!offline(e)) throw e;
          pendingLeads[l.id] = l;
          e.queued = true;
          throw e;
        });
      },

      addLeads: function (leads) {
        if (!leads.length) return Promise.resolve();
        return Cloud.rest('POST', 'rs_leads', leads.map(function (l) { return { id: l.id, data: leadData(l) }; }), 'return=representation')
          .then(function (rows) {
            var byId = {};
            (rows || []).forEach(function (r) { byId[r.id] = r; });
            leads.forEach(function (l) { if (byId[l.id]) setVer(l, byId[l.id]); });
          });
      },

      deleteLeads: function (ids) {
        var chain = Promise.resolve();
        for (var i = 0; i < ids.length; i += 100) {
          (function (part) {
            chain = chain.then(function () { return Cloud.rest('DELETE', 'rs_leads?id=in.(' + part.map(encodeURIComponent).join(',') + ')', undefined, 'return=minimal'); });
          })(ids.slice(i, i + 100));
        }
        ids.forEach(function (id) { delete pendingLeads[id]; });
        return chain;
      },

      // The database stamps the time and the person; the local copy is only for the screen.
      addActivity: function (a) {
        var row = { id: a.id, lead_id: a.lead, action: a.action, detail: String(a.detail || '').slice(0, 500) };
        return Cloud.rest('POST', 'rs_activity', row, 'return=minimal').then(null, function (e) {
          if (offline(e)) { pendingActs.push({ row: row, local: a }); return; }
          throw e;
        });
      },

      saveSettings: function (settings) {
        return Cloud.rest('POST', 'rs_settings?on_conflict=id', { id: 'main', data: settings }, 'resolution=merge-duplicates,return=minimal');
      },

      saveProfile: function (u) {
        return Cloud.rest('POST', 'rs_profiles?on_conflict=email', {
          email: u.email, name: u.name, title: u.title || '', phone: u.phone || '', rs_role: u.role === 'sales' ? 'sales' : 'pm'
        }, 'resolution=merge-duplicates,return=minimal');
      },

      saveUsers: function () { return Promise.reject(new Error('Teammates are added and removed in the CRM (💎 → Team access).')); },
      replace: function () { return Promise.reject(new Error('Restoring a backup is only available in demo mode.')); }
    };
  }

  root.Data = { demo: demo, cloud: cloud, isDemoLead: isDemoLead };
})(this);
