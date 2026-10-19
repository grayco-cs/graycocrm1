// Where the lead list's saved work lives: the CRM's Supabase project
// (docs/leads-setup.sql), shared by everyone on the GrayCo staff list.
//
//   ll_progress  {id, data}  one row per company — status, log, follow-up, contact edits,
//                            draft, replies, portals, notes (the `progress/{id}` doc)
//   ll_custom    {id, data}  companies added by hand (`custom/{id}`)
//   ll_leadlist  {id, data}  an uploaded spreadsheet: 'meta' + chunks 'c0', 'c1' …
//
// The database stamps updated_at on every write; Store.poll() asks only for rows
// changed since the last look (with a two-minute overlap, so a slow write is never
// missed — the app ignores anything older than what it already has).
(function (root) {
  'use strict';

  var OVERLAP = 120e3;

  function enc(v) { return encodeURIComponent(v); }

  // Every page of a table (1000 rows at a time).
  function readAll(path) {
    var out = [];
    function page(from) {
      return Cloud.rest('GET', path + '&limit=1000&offset=' + from).then(function (rows) {
        rows = rows || [];
        out = out.concat(rows);
        return rows.length === 1000 ? page(from + 1000) : out;
      });
    }
    return page(0);
  }

  function upsert(table, id, data) {
    return Cloud.rest('POST', table + '?on_conflict=id', { id: id, data: data }, 'resolution=merge-duplicates,return=minimal');
  }

  var since = null;   // newest updated_at seen in ll_progress

  function note(rows) {
    rows.forEach(function (r) { if (!since || r.updated_at > since) since = r.updated_at; });
    return rows;
  }

  function toMap(rows) {
    var m = {};
    rows.forEach(function (r) { m[r.id] = r.data || {}; });
    return m;
  }

  root.Store = {
    // The built-in company list (leads/data/seed.json), from the leads-seed function:
    // it is not on the public website.
    seed: function () {
      return Cloud.token().then(function (t) {
        return fetch('/.netlify/functions/leads-seed', { headers: { Authorization: 'Bearer ' + t } });
      }).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) { var e = new Error(j.error || ('Could not load the company list (' + r.status + ').')); e.code = r.status === 401 ? 'signed-out' : 'error'; throw e; }
          return j;
        });
      }, function (e) {
        if (e && e.code) throw e;
        var x = new Error('Could not reach the GrayCo website. Check the internet connection.'); x.code = 'offline'; throw x;
      });
    },

    // Everything saved so far: {prog, custom}.
    load: function () {
      since = null;
      return Promise.all([
        readAll('ll_progress?select=id,data,updated_at&order=updated_at.asc').then(note),
        readAll('ll_custom?select=id,data&order=id.asc')
      ]).then(function (r) { return { prog: toMap(r[0]), custom: toMap(r[1]) }; });
    },

    // What changed since the last load / poll: {prog: {id: data}, custom: {id: data} (all of them)}.
    poll: function () {
      var cut = since ? new Date(Date.parse(since) - OVERLAP).toISOString() : '1970-01-01T00:00:00Z';
      return Promise.all([
        readAll('ll_progress?select=id,data,updated_at&order=updated_at.asc&updated_at=gt.' + enc(cut)).then(note),
        readAll('ll_custom?select=id,data&order=id.asc')
      ]).then(function (r) { return { prog: toMap(r[0]), custom: toMap(r[1]) }; });
    },

    saveProgress: function (id, data) { return upsert('ll_progress', id, data); },
    saveCustom: function (id, data) { return upsert('ll_custom', id, data); },
    deleteCustom: function (id) { return Cloud.rest('DELETE', 'll_custom?id=eq.' + enc(id), undefined, 'return=minimal'); },

    // An uploaded spreadsheet: chunks first, then the meta row that points at them,
    // so a half-finished upload is never read.
    saveLeadList: function (parts, meta) {
      var p = Promise.resolve();
      parts.forEach(function (items, i) { p = p.then(function () { return upsert('ll_leadlist', 'c' + i, { items: items }); }); });
      return p.then(function () { return upsert('ll_leadlist', 'meta', meta); });
    },
    loadLeadList: function () {
      return Cloud.rest('GET', 'll_leadlist?select=data&id=eq.meta').then(function (rows) {
        var meta = rows && rows[0] && rows[0].data;
        if (!meta || !meta.chunks) return null;
        var ids = [];
        for (var i = 0; i < meta.chunks; i++) ids.push('c' + i);
        return Cloud.rest('GET', 'll_leadlist?select=id,data&id=in.(' + ids.join(',') + ')').then(function (cs) {
          var by = toMap(cs || []), list = [];
          ids.forEach(function (k) { if (by[k]) list = list.concat(by[k].items || []); });
          return { meta: meta, list: list };
        });
      });
    },

    // Rewrite an email with Claude, through the CRM's claude-proxy function
    // (the Anthropic key stays on the server).
    draft: function (prompt) {
      return Cloud.token().then(function (t) {
        return fetch('/.netlify/functions/claude-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
          body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 700, messages: [{ role: 'user', content: prompt }] })
        });
      }).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) { var e = new Error((j.error && j.error.message) || ('Claude answered ' + r.status)); e.code = r.status === 429 ? 'rate_limited' : 'error'; throw e; }
          return (j.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
        });
      });
    }
  };
})(this);
