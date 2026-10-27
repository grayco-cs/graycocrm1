/* __GC_PATCH_LEADSCON__ — LEADS CONSOLIDATED TO THREE TABS (owner: "yes consolidate").
   Leads (Board · List · Calendar · Map · 🛰 Outreach, ⚙ settings — the old Lead Pipeline is merged in) · Bids (Lead Inbox bid
   cards + the bid board + a "Watched boards" card) · Website (the website strip + the Facebook / Google lead-form note).
   Launch Job, Ads, Lead Gen and Bid Hub are gone from the Leads area, with their dark iframes, observers and timers.
   This block: (1) which pieces show on which tab; (2) the 🏢 Company outreach list inside 🛰 Outreach — Register / Reach out /
   Follow-ups, kept in gc_kv "gc_outreach_list" (a copy on this computer too), "Import list (JSON)" for admins;
   (3) the "Watched boards" card on Bids (status from the server's bid watcher; "Check now" for admins).
   API: window._gcOutreachImport(arr) → { added, updated, skipped, total } · window._gcOutreach = { items, state, load, add }
   Data keys are never deleted (lg_bids, gc_leadgen_lastscan … stay where they are). */
(function(){
'use strict';
if (window.__GC_LEADSCON__) return; window.__GC_LEADSCON__ = true;
var W = window, D = document;
var NST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout;
var KEY = 'gc_outreach_list', LS = 'gc_outreach_list_v1';
var STATUSES = ['Not started', 'In progress', 'Submitted', 'Approved/on list', 'Bidding'];
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function nowIso(){ return new Date().toISOString(); }
function today(){ var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function myEmail(){ try { return s(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); } catch (e) { return ''; } }
function toast(msg){ var t = D.createElement('div'); t.setAttribute('role', 'status'); t.setAttribute('data-gc-keep', '1'); t.textContent = msg;
  t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1b1640;color:#fff;padding:10px 16px;border-radius:8px;font:14px Arial;z-index:100400;max-width:90vw';
  D.body.appendChild(t); NST.call(W, function(){ try { t.remove(); } catch (e) {} }, 3500); }
function webUrl(u){ u = s(u); if (!u) return ''; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : ''; }
function css(id, txt){ if (D.getElementById(id)) return; var st = D.createElement('style'); st.id = id; st.textContent = txt; (D.head || D.documentElement).appendChild(st); }

/* ── 1. which piece shows on which tab (the tab bar carries data-tab) ── */
css('gc-leadscon-css',
  '#root:has(#gc-leads-tabs:not([data-tab="bidboard"])) #gc-ldi,#root:has(#gc-leads-tabs:not([data-tab="bidboard"])) #gc-bw-watch{display:none!important}' +
  '#root:has(#gc-leads-tabs:not([data-tab="website"])) #gc-web{display:none!important}' +
  '#root:has(#gc-leads-tabs:not([data-tab="leads"])) :is(#gc-leads-hub,#gc-rso,#gc-ol){display:none!important}' +
  '#gc-ol{display:none}body.gcrso-on #gc-ol{display:block}');

/* ── 2. the company outreach list ── */
var ST = { items: [], loaded: false, loadedAt: 0, loading: false, ui: { g: 'reg', q: '', st: '', pri: '', near: false, open: {}, logAll: {}, imp: false } };
function lsRead(){ try { var v = JSON.parse(W.localStorage.getItem(LS) || 'null'); return arr(v && v.items); } catch (e) { return []; } }
function lsWrite(){ try { W.localStorage.setItem(LS, JSON.stringify({ items: ST.items, updatedAt: nowIso() })); } catch (e) {} }
ST.items = lsRead();

function toArr(v){ if (Array.isArray(v)) return v.map(s).filter(Boolean); v = s(v); return v ? v.split(/[\n,;]+/).map(s).filter(Boolean) : []; }
function rawGet(r, names){
  if (!r || typeof r !== 'object') return '';
  var ks = Object.keys(r);
  for (var n = 0; n < names.length; n++) for (var i = 0; i < ks.length; i++) {
    if (ks[i].toLowerCase().replace(/[^a-z]/g, '') === names[n] && s(r[ks[i]])) return s(r[ks[i]]);
  }
  return '';
}
function truthy(v){ if (v === true) return true; v = low(v); return /^(y|yes|true|1|in|x|✓|✔)/.test(v); }
function logNorm(l){
  return arr(l).map(function(x){
    if (x && typeof x === 'object') return { at: s(x.at || x.date || x.when), by: s(x.by || x.who), text: s(x.text || x.note || x.what || x.msg) };
    return { at: '', by: '', text: s(x) };
  }).filter(function(x){ return x.text; });
}
function fromImport(o){
  if (!o || typeof o !== 'object') return null;
  var id = s(o.id); if (!id) return null;
  var raw = o.raw && typeof o.raw === 'object' ? o.raw : {}, links = toArr(o.links), emails = toArr(o.emails), phones = toArr(o.phones);
  var portal = webUrl(o.portal) || '', i;
  if (!portal) { for (i = 0; i < links.length; i++) if (/portal|regist|vendor|supplier|signup|sign-up|login|bid|procure/i.test(links[i])) { portal = links[i]; break; } if (!portal) portal = links[0] || ''; }
  var website = s(o.website) || rawGet(raw, ['website', 'web', 'site', 'url', 'homepage']);
  if (!website) { for (i = 0; i < links.length; i++) if (links[i] !== portal) { website = links[i]; break; } }
  var inz = (o.inZone != null && o.inZone !== '') ? truthy(o.inZone) : (o.inz != null && o.inz !== '') ? truthy(o.inz) : /^(within|in\b|inside|local|near)/i.test(s(o.zone));
  var it = {
    id: id, phase: +o.phase === 1 ? 1 : 2,
    company: s(o.company) || s(o.title) || s(o.sheet) || id, type: s(o.type) || s(o.setup) || s(o.sheet),
    pri: Math.min(3, Math.max(1, parseInt(o.pri, 10) || 2)),
    person: s(o.person) || rawGet(raw, ['contact', 'contactname', 'person', 'name']), contactTitle: s(o.contactTitle) || rawGet(raw, ['title', 'jobtitle', 'role', 'position']),
    email: s(o.email) || emails[0] || '', phone: s(o.phone) || phones[0] || '', emails: emails, phones: phones, links: links,
    portal: portal, website: website, city: s(o.city) || s(o.area), inZone: !!inz, zone: s(o.zone),
    why: s(o.why) || s(o.what), how: s(o.how),
    status: STATUSES.indexOf(s(o.status)) >= 0 ? s(o.status) : 'Not started', notes: s(o.notes), next: /^\d{4}-\d\d-\d\d/.test(s(o.next)) ? s(o.next).slice(0, 10) : '', log: logNorm(o.log),
    src: { title: s(o.title), sheet: s(o.sheet), setup: s(o.setup), init: s(o.init), area: s(o.area), raw: raw }
  };
  return it;
}
function logKey(l){ return s(l.at) + '|' + s(l.text); }
function unionLog(a, b){ var seen = {}, out = []; arr(a).concat(arr(b)).forEach(function(l){ var k = logKey(l); if (!seen[k]) { seen[k] = 1; out.push(l); } }); return out.sort(function(x, y){ return s(x.at) < s(y.at) ? -1 : s(x.at) > s(y.at) ? 1 : 0; }); }
function unionStr(a, b){ var seen = {}, out = []; arr(a).concat(arr(b)).forEach(function(x){ x = s(x); if (x && !seen[low(x)]) { seen[low(x)] = 1; out.push(x); } }); return out; }
/* a re-import never overwrites what a person typed: it fills empty fields, adds new links / e-mails / phones / log lines */
function mergeItem(old, inc){
  var m = JSON.parse(JSON.stringify(old));
  ['company', 'type', 'person', 'contactTitle', 'email', 'phone', 'portal', 'website', 'city', 'zone', 'why', 'how', 'notes', 'next'].forEach(function(f){ if (!s(m[f]) && s(inc[f])) m[f] = inc[f]; });
  if (!m.inZone && inc.inZone) m.inZone = true;
  if (m.status === 'Not started' && inc.status !== 'Not started') m.status = inc.status;
  m.phase = inc.phase || m.phase; m.src = Object.assign({}, m.src || {}, inc.src || {});
  m.emails = unionStr(m.emails, inc.emails); m.phones = unionStr(m.phones, inc.phones); m.links = unionStr(m.links, inc.links);
  m.log = unionLog(m.log, inc.log);
  if (JSON.stringify(m) !== JSON.stringify(old)) m.updatedAt = nowIso();
  return m;
}
function byId(id){ for (var i = 0; i < ST.items.length; i++) if (ST.items[i] && ST.items[i].id === id) return ST.items[i]; return null; }
function mergeLists(a, b){
  var map = {}, order = [];
  arr(a).concat(arr(b)).forEach(function(x){ if (!x || !x.id) return; var p = map[x.id]; if (!p) { map[x.id] = x; order.push(x.id); } else if (s(x.updatedAt) > s(p.updatedAt)) map[x.id] = x; });
  return order.map(function(id){ return map[id]; });
}
function cloudRead(){
  try { if (typeof W._gcCloudGet !== 'function') return Promise.resolve(null);
    return Promise.resolve(W._gcCloudGet(KEY)).then(function(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v && Array.isArray(v.items) ? v.items : null; }, function(){ return null; }); }
  catch (e) { return Promise.resolve(null); }
}
function cloudWrite(){ try { return Promise.resolve(W._supaUpsert(KEY, { items: ST.items, updatedAt: nowIso() })).catch(function(){ return null; }); } catch (e) { return Promise.resolve(null); } }
var chain = Promise.resolve();
function persist(){
  lsWrite();
  chain = chain.then(function(){ return cloudRead().then(function(remote){ if (remote) { ST.items = mergeLists(ST.items, remote); lsWrite(); } return cloudWrite(); }); }).catch(function(){});
  return chain;
}
function load(){
  if (ST.loading) return Promise.resolve();
  ST.loading = true;
  return cloudRead().then(function(remote){
    ST.loading = false; ST.loaded = true; ST.loadedAt = Date.now();
    if (remote) {
      var before = JSON.stringify(ST.items), rm = {}; remote.forEach(function(x){ if (x && x.id) rm[x.id] = x; });
      var push = ST.items.some(function(x){ return x && (!rm[x.id] || s(x.updatedAt) > s(rm[x.id].updatedAt)); });   /* a change made here that never reached the cloud (closed too soon, offline) */
      ST.items = mergeLists(ST.items, remote); if (JSON.stringify(ST.items) !== before) { lsWrite(); redraw(); }
      if (push) persist();
    } else if (ST.items.length) persist();
  }, function(){ ST.loading = false; });
}
W._gcOutreachImport = function(a){
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { return { error: 'not valid JSON', added: 0, updated: 0, skipped: 0, total: ST.items.length }; } }
  if (a && !Array.isArray(a) && Array.isArray(a.items)) a = a.items;
  if (!Array.isArray(a)) return { error: 'expected an array of objects', added: 0, updated: 0, skipped: 0, total: ST.items.length };
  var added = 0, updated = 0, skipped = 0;
  a.forEach(function(o){
    var inc = fromImport(o); if (!inc) { skipped++; return; }
    var old = byId(inc.id);
    if (!old) { inc.updatedAt = nowIso(); ST.items.push(inc); added++; }
    else { var m = mergeItem(old, inc); if (m !== old && JSON.stringify(m) !== JSON.stringify(old)) { ST.items[ST.items.indexOf(old)] = m; updated++; } }
  });
  if (added || updated) { persist(); redraw(); }
  return { added: added, updated: updated, skipped: skipped, total: ST.items.length };
};

/* groups */
function isFollow(it){ return !!s(it.next) || it.status === 'In progress' || it.status === 'Submitted'; }
function inGroup(it, g){ return g === 'reg' ? it.phase === 1 : g === 'out' ? it.phase !== 1 : isFollow(it); }
function counts(){ var c = { reg: 0, out: 0, fu: 0, due: 0, ok: 0 }, t = today(); ST.items.forEach(function(it){ if (!it) return; if (inGroup(it, 'reg')) c.reg++; if (inGroup(it, 'out')) c.out++; if (isFollow(it)) c.fu++; if (s(it.next) && s(it.next) <= t) c.due++; if (it.status === 'Approved/on list') c.ok++; }); return c; }
function visible(){
  var u = ST.ui, q = low(u.q), t = today();
  var list = ST.items.filter(function(it){
    if (!it || !inGroup(it, u.g)) return false;
    if (u.st && it.status !== u.st) return false;
    if (u.pri && String(it.pri) !== u.pri) return false;
    if (u.near && !it.inZone) return false;
    if (q && low([it.company, it.type, it.person, it.contactTitle, it.email, it.phone, it.city, it.notes, it.why].join(' ')).indexOf(q) < 0) return false;
    return true;
  });
  list.sort(function(a, b){
    if (u.g === 'fu') { var x = s(a.next) || '9999', y = s(b.next) || '9999'; if (x !== y) return x < y ? -1 : 1; }
    return (a.pri - b.pri) || low(a.company).localeCompare(low(b.company));
  });
  return list;
}

/* drawing */
function rowHtml(it){
  var t = today(), od = s(it.next) && it.next < t, due = s(it.next) && it.next === t, open = !!ST.ui.open[it.id];
  var sum = '<summary><b>' + esc(it.company) + '</b>' + (it.type ? ' <span class="ol-chip">' + esc(it.type) + '</span>' : '') + ' <span class="ol-chip p' + it.pri + '">P' + it.pri + '</span>' +
    (it.inZone ? ' <span class="ol-chip near">≤100 mi</span>' : '') + ' <span class="ol-chip st">' + esc(it.status) + '</span>' +
    (s(it.next) ? ' <span class="ol-chip ' + (od ? 'od' : due ? 'td' : '') + '">' + (od ? 'overdue ' : due ? 'today ' : 'follow up ') + esc(it.next) + '</span>' : '') +
    (it.person || it.city ? '<span class="ol-sub"> ' + esc([it.person, it.city].filter(Boolean).join(' · ')) + '</span>' : '') + '</summary>';
  var f = function(k, l, v, ty){ return '<label>' + l + '<input data-ol-f="' + k + '" type="' + (ty || 'text') + '" value="' + esc(v) + '"></label>'; };
  var sel = function(k, l, opts, v){ return '<label>' + l + '<select data-ol-f="' + k + '">' + opts.map(function(o){ return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>'; };
  var lnk = [];
  if (webUrl(it.portal)) lnk.push('<a href="' + esc(webUrl(it.portal)) + '" target="_blank" rel="noopener">Portal ↗</a>');
  if (webUrl(it.website)) lnk.push('<a href="' + esc(webUrl(it.website)) + '" target="_blank" rel="noopener">Website ↗</a>');
  if (/^[^\s@<>"]+@[^\s@<>"]+$/.test(s(it.email))) lnk.push('<a href="mailto:' + esc(it.email) + '">✉️ ' + esc(it.email) + '</a>');
  if (s(it.phone)) lnk.push('<a href="tel:' + esc(it.phone.replace(/[^\d+]/g, '')) + '">📞 ' + esc(it.phone) + '</a>');
  var logs = arr(it.log).slice().reverse(), all = !!ST.ui.logAll[it.id], shown = all ? logs : logs.slice(0, 4);
  var body = '<div class="ol-body">' + (lnk.length ? '<div class="ol-links">' + lnk.join(' · ') + '</div>' : '') +
    (it.why ? '<div class="ol-why"><b>Why:</b> ' + esc(it.why) + '</div>' : '') + (it.how ? '<div class="ol-why"><b>How:</b> ' + esc(it.how) + '</div>' : '') +
    '<div class="ol-grid">' + f('company', 'Company', it.company) + f('type', 'Type', it.type) +
    sel('pri', 'Priority', [[1, '1 – high'], [2, '2 – medium'], [3, '3 – low']], it.pri) + sel('status', 'Status', STATUSES.map(function(x){ return [x, x]; }), it.status) +
    f('person', 'Contact', it.person) + f('contactTitle', 'Title', it.contactTitle) + f('email', 'E-mail', it.email, 'email') + f('phone', 'Phone', it.phone, 'tel') +
    f('website', 'Website', it.website) + f('portal', 'Portal link', it.portal) + f('city', 'City', it.city) + f('next', 'Next follow-up', it.next, 'date') +
    '<label class="ol-chk"><input data-ol-f="inZone" type="checkbox"' + (it.inZone ? ' checked' : '') + '> Within 100 miles</label></div>' +
    '<label class="ol-wide">Notes<textarea data-ol-f="notes" rows="2">' + esc(it.notes) + '</textarea></label>' +
    '<div class="ol-log"><b>Activity</b>' + (shown.length ? shown.map(function(l){ return '<div class="ol-l"><span>' + esc(s(l.at).slice(0, 10)) + (l.by ? ' · ' + esc(l.by.split('@')[0]) : '') + '</span> ' + esc(l.text) + '</div>'; }).join('') : '<div class="ol-sub">Nothing logged yet.</div>') +
    (logs.length > 4 ? '<button type="button" class="ol-btn" data-ol-all="' + esc(it.id) + '">' + (all ? 'Show fewer' : 'Show all ' + logs.length) + '</button>' : '') +
    '<div class="ol-addlog"><input data-ol-logtxt="' + esc(it.id) + '" placeholder="Called, e-mailed, registered … (Enter to add)"><button type="button" class="ol-btn" data-ol-addlog="' + esc(it.id) + '">Add</button></div></div></div>';
  return '<details class="ol-it" data-ol-id="' + esc(it.id) + '"' + (open ? ' open' : '') + '>' + sum + body + '</details>';
}
function listHtml(){
  var list = visible();
  if (!list.length) return '<div class="ol-empty">' + (ST.items.length ? 'Nothing matches these filters in this group.' : 'No companies yet. ' + (isAdmin() ? 'Use <b>Import list (JSON)</b>, or ' : '') + '<b>＋ Add</b> one.') + '</div>';
  return list.slice(0, 300).map(rowHtml).join('') + (list.length > 300 ? '<div class="ol-sub">Showing 300 of ' + list.length + ' — narrow it with the filters.</div>' : '');
}
function headHtml(){
  var c = counts(), u = ST.ui;
  var tab = function(id, l, n){ return '<button type="button" class="ol-tab' + (u.g === id ? ' on' : '') + '" data-ol-g="' + id + '">' + l + ' (' + n + ')</button>'; };
  return '<div class="ol-top"><h3>🏢 Company outreach list</h3><span class="ol-sub">' + ST.items.length + ' companies · ' + c.due + ' follow-up' + (c.due === 1 ? '' : 's') + ' due · ' + c.ok + ' approved / on list</span><span class="ol-sp"></span>' +
    '<button type="button" class="ol-btn" data-ol-new="1">＋ Add</button>' +
    (isAdmin() ? '<button type="button" class="ol-btn" data-ol-imp="1">Import list (JSON)</button><button type="button" class="ol-btn" data-ol-exp="1">Export</button>' : '') + '</div>' +
    '<div class="ol-tabs">' + tab('reg', 'Register', c.reg) + tab('out', 'Reach out', c.out) + tab('fu', 'Follow-ups', c.fu) + '</div>' +
    '<div class="ol-filters"><input data-ol-q="1" type="search" placeholder="Search company, contact, city…" value="' + esc(u.q) + '">' +
    '<select data-ol-fs="1"><option value="">Any status</option>' + STATUSES.map(function(x){ return '<option' + (u.st === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>' +
    '<select data-ol-fp="1"><option value="">Any priority</option>' + [1, 2, 3].map(function(x){ return '<option value="' + x + '"' + (u.pri === String(x) ? ' selected' : '') + '>Priority ' + x + '</option>'; }).join('') + '</select>' +
    '<label class="ol-chk"><input type="checkbox" data-ol-near="1"' + (u.near ? ' checked' : '') + '> Within 100 mi only</label></div>';
}
function olCss(){
  css('gc-ol-css', '#gc-ol{font-family:Inter,-apple-system,Arial,sans-serif;color:#0f172a;margin:0 0 16px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px}' +
    '#gc-ol .ol-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}#gc-ol h3{margin:0;font-size:18px;color:#241968}#gc-ol .ol-sp{flex:1}' +
    '#gc-ol .ol-sub{font-size:12.5px;color:#475569}#gc-ol .ol-btn{border:1px solid #cbd5e1;background:#fff;color:#241968;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer;font-size:13px}' +
    '#gc-ol .ol-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}#gc-ol .ol-tab{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:6px 14px;font-weight:700;cursor:pointer;font-size:13px;color:#241968}#gc-ol .ol-tab.on{background:#241968;color:#fff;border-color:#241968}' +
    '#gc-ol .ol-filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:6px 0 10px}#gc-ol .ol-filters input[type=search],#gc-ol .ol-filters select{padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;background:#fff;color:#0f172a}' +
    '#gc-ol .ol-chk{display:flex;gap:6px;align-items:center;font-size:13px}#gc-ol .ol-it{border-top:1px solid #f1f5f9;padding:6px 0}#gc-ol summary{cursor:pointer;line-height:1.9;font-size:14px}' +
    '#gc-ol .ol-chip{display:inline-block;font-size:11.5px;font-weight:700;border-radius:999px;padding:1px 8px;background:#eef2ff;color:#312e81}#gc-ol .ol-chip.p1{background:#fee2e2;color:#991b1b}#gc-ol .ol-chip.p2{background:#fef3c7;color:#92400e}#gc-ol .ol-chip.p3{background:#e2e8f0;color:#334155}' +
    '#gc-ol .ol-chip.near{background:#dcfce7;color:#166534}#gc-ol .ol-chip.od{background:#fee2e2;color:#b91c1c}#gc-ol .ol-chip.td{background:#fef3c7;color:#92400e}#gc-ol .ol-chip.st{background:#f1f5f9;color:#334155}' +
    '#gc-ol .ol-body{padding:6px 0 8px 14px}#gc-ol .ol-links{margin-bottom:6px;font-size:13px}#gc-ol .ol-why{font-size:13px;color:#334155;margin-bottom:4px}' +
    '#gc-ol .ol-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px;margin:8px 0}#gc-ol label{display:flex;flex-direction:column;gap:2px;font-size:12px;color:#475569;font-weight:600}' +
    '#gc-ol label.ol-chk{flex-direction:row}#gc-ol .ol-body input:not([type=checkbox]),#gc-ol .ol-body select,#gc-ol .ol-body textarea{padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;font-weight:400;color:#0f172a;background:#fff;min-width:0}' +
    '#gc-ol .ol-wide{margin:6px 0}#gc-ol .ol-log{margin-top:8px;font-size:13px}#gc-ol .ol-l{padding:2px 0;border-top:1px dotted #e2e8f0}#gc-ol .ol-l span{color:#64748b;margin-right:6px}#gc-ol .ol-addlog{display:flex;gap:6px;margin-top:6px}#gc-ol .ol-addlog input{flex:1}' +
    '#gc-ol .ol-empty{padding:14px;color:#475569;font-size:14px}.gc-ol-ov{position:fixed;inset:0;background:rgba(10,10,30,.55);z-index:100080;display:flex;align-items:center;justify-content:center;padding:16px}' +
    '.gc-ol-box{background:#fff;color:#1b1640;border-radius:14px;max-width:640px;width:100%;max-height:88vh;overflow:auto;padding:18px 20px;font:14px Arial,sans-serif}.gc-ol-box h3{margin:0 0 8px;color:#241968}.gc-ol-box textarea{width:100%;min-height:200px;font:12px monospace;border:1px solid #c7c2e6;border-radius:8px;padding:8px}' +
    '.gc-ol-box .ft{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}.gc-ol-box .ft button{padding:9px 14px;border-radius:8px;border:1px solid #c7c2e6;background:#fff;font-weight:700;cursor:pointer}.gc-ol-box .ft .pri{background:#d4a017;border-color:#d4a017;color:#241968}');
}
function drawList(){ var el = D.getElementById('gc-ol-list'); if (el) el.innerHTML = listHtml(); }
function redraw(){
  var el = D.getElementById('gc-ol'); if (!el) return;
  var ae = D.activeElement; if (ae && el.contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName) && !el.__force) return;
  el.__force = false;
  el.innerHTML = '<div id="gc-ol-head">' + headHtml() + '</div><div id="gc-ol-list">' + listHtml() + '</div>';
}
function setField(id, k, v){
  var it = byId(id); if (!it) return;
  var old = it[k];
  if (k === 'pri') v = Math.min(3, Math.max(1, parseInt(v, 10) || 2));
  else if (k === 'inZone') v = !!v;
  else v = s(v);
  if (old === v) return;
  it[k] = v; it.updatedAt = nowIso();
  if (k === 'status') it.log = arr(it.log).concat([{ at: nowIso(), by: myEmail(), text: 'Status: ' + old + ' → ' + v }]);
  if (k === 'next') it.log = arr(it.log).concat([{ at: nowIso(), by: myEmail(), text: v ? 'Next follow-up set to ' + v : 'Follow-up date cleared' }]);
  persist();
  if (/^(status|next|pri|inZone|company|type|person|city)$/.test(k)) { var el = D.getElementById('gc-ol'); if (el) { el.__force = true; redraw(); } }
}
function addLog(id, text){
  var it = byId(id); text = s(text); if (!it || !text) return;
  it.log = arr(it.log).concat([{ at: nowIso(), by: myEmail(), text: text.slice(0, 500) }]); it.updatedAt = nowIso(); persist();
  var el = D.getElementById('gc-ol'); if (el) { el.__force = true; redraw(); }
}
function overlay(html){
  var ov = D.createElement('div'); ov.className = 'gc-ol-ov'; ov.setAttribute('data-gc-keep', '1');
  ov.innerHTML = '<div class="gc-ol-box" role="dialog" aria-modal="true">' + html + '</div>';
  ov.addEventListener('click', function(e){ if (e.target === ov || e.target.closest('[data-x]')) ov.remove(); });
  D.body.appendChild(ov); return ov;
}
function importBox(){
  var ov = overlay('<h3>Import outreach list (JSON)</h3><div class="ol-sub" style="font-size:13px;color:#475569;margin-bottom:8px">An array of objects: <code>{id, phase (1 = Register, 2 = Reach out), sheet, setup, pri, inz, zone, title, what, how, area, links[], emails[], phones[], person, init, raw{}}</code>, plus optional <code>{status, notes, log[], next}</code>. Items are matched by <b>id</b>: nothing is duplicated, and what you typed is never overwritten.</div>' +
    '<input type="file" accept=".json,application/json" data-f="file"><textarea data-f="txt" placeholder="…or paste the JSON here"></textarea><div class="ol-sub" data-f="msg" style="margin-top:6px;font-size:13px"></div>' +
    '<div class="ft"><button data-x>Close</button><button class="pri" data-f="go">Import</button></div>');
  var txt = ov.querySelector('[data-f=txt]'), msg = ov.querySelector('[data-f=msg]');
  ov.querySelector('[data-f=file]').onchange = function(e){ var f = e.target.files && e.target.files[0]; if (!f) return; var r = new FileReader(); r.onload = function(){ txt.value = String(r.result || ''); }; r.readAsText(f); };
  ov.querySelector('[data-f=go]').onclick = function(){
    var res = W._gcOutreachImport(txt.value);
    msg.textContent = res.error ? 'Could not import: ' + res.error + '.' : 'Imported — ' + res.added + ' added, ' + res.updated + ' updated' + (res.skipped ? ', ' + res.skipped + ' skipped (no id)' : '') + '. ' + res.total + ' in the list.';
    if (!res.error) toast('Outreach list: ' + res.added + ' added, ' + res.updated + ' updated');
  };
}
function exportJson(){
  try { var blob = new Blob([JSON.stringify(ST.items, null, 1)], { type: 'application/json' }), a = D.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'outreach-list-' + today() + '.json'; D.body.appendChild(a); a.click(); a.remove(); NST.call(W, function(){ URL.revokeObjectURL(a.href); }, 2000); }
  catch (e) { toast('Could not export.'); }
}
function bind(el){
  el.addEventListener('click', function(ev){
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-ol-g],[data-ol-new],[data-ol-imp],[data-ol-exp],[data-ol-all],[data-ol-addlog]') : null; if (!t) return;
    if (t.hasAttribute('data-ol-g')) { ST.ui.g = t.getAttribute('data-ol-g'); el.__force = true; redraw(); }
    else if (t.hasAttribute('data-ol-new')) {
      var name = s(W.prompt('Company or portal name:', '')); if (!name) return;
      var id = 'OL-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      var it = fromImport({ id: id, phase: ST.ui.g === 'reg' ? 1 : 2, company: name, pri: 2 }); it.updatedAt = nowIso(); ST.items.push(it); ST.ui.open[id] = true; persist(); el.__force = true; redraw();
    }
    else if (t.hasAttribute('data-ol-imp')) importBox();
    else if (t.hasAttribute('data-ol-exp')) exportJson();
    else if (t.hasAttribute('data-ol-all')) { var k = t.getAttribute('data-ol-all'); ST.ui.logAll[k] = !ST.ui.logAll[k]; el.__force = true; redraw(); }
    else if (t.hasAttribute('data-ol-addlog')) { var id2 = t.getAttribute('data-ol-addlog'), inp = el.querySelector('[data-ol-logtxt="' + id2.replace(/["\\]/g, '') + '"]'); if (inp) addLog(id2, inp.value); }
  });
  el.addEventListener('change', function(ev){
    var t = ev.target; if (!t || !t.getAttribute) return;
    if (t.hasAttribute('data-ol-fs')) { ST.ui.st = t.value; drawList(); return; }
    if (t.hasAttribute('data-ol-fp')) { ST.ui.pri = t.value; drawList(); return; }
    if (t.hasAttribute('data-ol-near')) { ST.ui.near = !!t.checked; drawList(); return; }
    var f = t.getAttribute('data-ol-f'); if (!f) return;
    var row = t.closest('[data-ol-id]'); if (!row) return;
    setField(row.getAttribute('data-ol-id'), f, f === 'inZone' ? t.checked : t.value);
  });
  el.addEventListener('input', function(ev){ var t = ev.target; if (t && t.hasAttribute && t.hasAttribute('data-ol-q')) { ST.ui.q = t.value; drawList(); } });
  el.addEventListener('keydown', function(ev){ var t = ev.target; if (ev.key === 'Enter' && t && t.hasAttribute && t.hasAttribute('data-ol-logtxt')) { ev.preventDefault(); addLog(t.getAttribute('data-ol-logtxt'), t.value); } });
  el.addEventListener('toggle', function(ev){ var d = ev.target; if (d && d.getAttribute && d.getAttribute('data-ol-id')) { if (d.open) ST.ui.open[d.getAttribute('data-ol-id')] = true; else delete ST.ui.open[d.getAttribute('data-ol-id')]; } }, true);
}
/* patch RSO calls this on each of its ticks, with its own panel: ours sits just above it */
W._gcOutreachMount = function(p){
  try {
    if (!p || !p.parentElement) return;
    var el = D.getElementById('gc-ol');
    if (!el) { olCss(); el = D.createElement('div'); el.id = 'gc-ol'; el.setAttribute('data-gc-keep', '1'); bind(el); }
    if (el.nextElementSibling !== p) { p.parentElement.insertBefore(el, p); el.__drawn = false; }
    if (!el.__drawn) { el.__drawn = true; el.__force = true; redraw(); }
    if (!ST.loaded || Date.now() - ST.loadedAt > 60000) load();
  } catch (e) { try { console.warn('[GC] outreach list', e); } catch (x) {} }
};
W._gcOutreach = { items: function(){ return ST.items.slice(); }, state: function(){ return { group: ST.ui.g, counts: counts(), loaded: ST.loaded, shown: visible().map(function(i){ return i.id; }) }; }, load: load, redraw: function(){ var el = D.getElementById('gc-ol'); if (el) el.__force = true; redraw(); }, setGroup: function(g){ ST.ui.g = g; var el = D.getElementById('gc-ol'); if (el) el.__force = true; redraw(); }, ui: function(){ return ST.ui; } };

/* ── 3. Bids: the "Watched boards" card (status from the server's bid watcher) ── */
var WB = { custom: [], at: 0, loading: false };
function lead(){ try { return W._gcLeadInbox && W._gcLeadInbox._test && W._gcLeadInbox._test.state ? W._gcLeadInbox._test.state() : null; } catch (e) { return null; } }
function wbHtml(){
  var st = lead(), watch = st && st.watch && st.watch.sources ? st.watch.sources : {}, src = arr(W.__GC_LDI_SOURCES__), custom = isAdmin() ? WB.custom : [];
  var auto = src.filter(function(x){ return x && x.auto; }).concat(arr(custom).filter(function(x){ return x && x.auto !== false && x.kind !== 'email'; }).map(function(x){ return { id: x.id, name: x.name, url: x.url }; }));
  var mail = src.filter(function(x){ return x && !x.auto && !x.local; }).length;
  var last = ''; Object.keys(watch).forEach(function(k){ var a = s(watch[k] && watch[k].at); if (a > last) last = a; });
  var h = '<div class="wb-hd"><b>🔎 Watched boards</b><span class="wb-sub">' + auto.length + ' read automatically' + (mail ? ' · ' + mail + ' by e-mail alert' : '') + ' · last check ' + (last ? esc(new Date(last).toLocaleString()) : 'not yet') + '</span><span style="flex:1"></span>' +
    (isAdmin() ? '<button type="button" data-wb="run">↻ Check now</button>' : '') + '</div><div class="wb-list">';
  h += auto.map(function(x){
    var w = watch[x.id], line = !w ? 'not checked yet' : w.off ? 'switched off' : (w.why ? '⚠️ ' + esc(w.why) : esc(w.parsed || 0) + ' read · ' + esc(w.matched || 0) + ' matched · ' + esc(w.added || 0) + ' new') + ' · ' + esc(s(w.at) ? new Date(w.at).toLocaleString() : '');
    return '<div class="wb-r"><span>' + esc(x.name) + '</span><span class="wb-sub">' + line + '</span></div>';
  }).join('') || '<div class="wb-sub">No boards listed yet.</div>';
  return h + '</div>';
}
function wbLoadCustom(){
  if (!isAdmin() || WB.loading || Date.now() - WB.at < 300000) return;
  WB.loading = true; WB.at = Date.now();
  W.fetch('/.netlify/functions/bid-inbox?sources=1', { cache: 'no-store' }).then(function(r){ return r.ok ? r.json() : null; }).then(function(j){ WB.loading = false; if (j && Array.isArray(j.custom)) { WB.custom = j.custom; wbDraw(true); } }, function(){ WB.loading = false; });
}
function wbDraw(force){
  var c = D.getElementById('gc-bw-watch'); if (!c) return;
  var h = wbHtml(); if (force || c.__h !== h) { c.__h = h; c.innerHTML = h; }
}
W._gcBidWatchCard = function(){
  try {
    var tabs = D.getElementById('gc-leads-tabs'); if (!tabs || tabs.getAttribute('data-tab') !== 'bidboard') return;
    var ldi = D.getElementById('gc-ldi'); if (!ldi || !ldi.parentElement) return;
    var web = D.getElementById('gc-web'), anchor = web && web.previousElementSibling === ldi ? web : ldi;
    var c = D.getElementById('gc-bw-watch');
    if (!c) {
      css('gc-bw-watch-css', '#gc-bw-watch{margin:0 0 12px;border:1px solid #c7c2e6;border-radius:12px;background:#fff;color:#1b1640;padding:10px 14px;font-size:13px}#gc-bw-watch .wb-hd{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px}' +
        '#gc-bw-watch .wb-sub{color:#475569;font-size:12.5px}#gc-bw-watch .wb-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:2px 18px}#gc-bw-watch .wb-r{display:flex;flex-direction:column;padding:3px 0;border-top:1px solid #f1f0f8}' +
        '#gc-bw-watch button{border:1px solid #c7c2e6;background:#fff;color:#241968;border-radius:8px;padding:6px 10px;font-weight:700;cursor:pointer;font-size:12px}');
      c = D.createElement('div'); c.id = 'gc-bw-watch'; c.setAttribute('data-gc-keep', '1');
      c.addEventListener('click', function(e){
        var b = e.target.closest('[data-wb]'); if (!b || !isAdmin()) return; e.preventDefault();
        b.disabled = true; b.textContent = 'Checking…';
        W.fetch('/.netlify/functions/bid-inbox?watch=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store' })
          .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if (!r.ok) throw new Error(j.error || ('answered ' + r.status)); return j; }); })
          .then(function(r){ toast(r && r.started ? 'The public bid watcher is running — new bids show in the Lead Inbox in a few minutes.' : 'Public bids checked: ' + ((r && r.added) || 0) + ' new.'); NST.call(W, function(){ try { W._gcLeadInbox.refresh(); } catch (x) {} NST.call(W, function(){ wbDraw(true); }, 1500); }, 4000); }, function(err){ toast('Could not check: ' + s(err && err.message)); })
          .then(function(){ b.disabled = false; b.textContent = '↻ Check now'; });
      });
    }
    if (c.previousElementSibling !== anchor) anchor.parentElement.insertBefore(c, anchor.nextSibling);
    wbDraw(false); wbLoadCustom();
  } catch (e) {}
};
try { console.log('[GC] Leads consolidated to Leads · Bids · Website (patch LEADSCON) — _gcOutreachImport(arr)'); } catch (e) {}
})();
