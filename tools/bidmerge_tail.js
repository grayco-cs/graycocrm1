/* __GC_PATCH_BIDMERGE__ — 🔗 ONE LEAD PER PROJECT (owner 11/02: "When bids come in the CRM but we got 9 invitations for the
   same job but different trades, only alert us the one time, and when other companies send the bid to us still alert the
   one time, just have it list for 2 GCs etc. I don't want too many leads for separate trades clogging up our CRM and emails.")
   The server (netlify/functions/bid-inbox.js + _lib/bid-merge.js) now files every later invitation for a project — another
   trade, another GC, another board — on the project's ONE lead, quietly (one alert per project; a second note only when the
   earliest bid due moves sooner). This page:
     • copies the lead's GC list (gcs) and its "+1 GC: …" history lines from the Lead Inbox item (LD2 fromItem);
     • 📥 Lead Inbox row: "UrgentVet - Memphis · 3 GCs · 9 trades"; the detail panel lists every GC with its trades / bid
       packages, due date, contact, link and board; Leads: the "Bid to" cell counts them, the name shows "🔗 3 GCs · 9 trades";
     • admins and the office: Leads → ⋯ More → "🔗 Merge duplicate bid leads (N)" — the duplicates made BEFORE this change.
       It shows a DRY RUN first (the groups, why they are one project, which lead is kept); nothing merges until a person
       ticks groups and confirms. A merge keeps every GC, contact, file, link, e-mail, note and history line on the kept
       lead; the other copies go to 🗑 Recently deleted (30 days, Restore) and "↩ Undo last merge" puts everything back.
       Never merged: different street addresses, cities or public bid numbers, bids due more than 5 days apart; a shared GC
       alone is never a reason. The rules are the server's (_lib/bid-merge.js), copied VERBATIM by tools/patch_BIDMERGE.py.
   API: window._gcBidMerge = { core, can, count, groups, open, close, apply, undo, rowTag, chip, paneHtml, fromItem } */
(function(){
'use strict';
if (window.__GC_PATCH_BIDMERGE__) return; window.__GC_PATCH_BIDMERGE__ = true;
var W = window, D = document;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
/*__BM_CORE__*/
var BM = W._gcBidMergeCore;
var SB = 'https://ieeonhpfahmwwecizdut.supabase.co', LOG_KEY = 'gc_bidmerge_log', KEEP_MS = 30 * 864e5;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function nowIso(){ return new Date().toISOString(); }
function tms(v){ var t = Date.parse(s(v)); return isFinite(t) ? t : 0; }
function toast(msg){ try { var t = D.createElement('div'); t.setAttribute('data-gc-keep', '1'); t.className = 'gc-bm-toast'; t.textContent = msg; t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1b1640;color:#fff;padding:10px 16px;border-radius:8px;font:14px Arial;z-index:2147483300;max-width:90vw'; D.body.appendChild(t); later(function(){ t.remove(); }, 5000); } catch (e) {} }

/* ── who: admins and the office ── */
function can(){
  try { if (W._gcLDEL && W._gcLDEL.who) { var w = W._gcLDEL.who(); if (w && w.all) return true; } } catch (e) {}
  try { if (W._gcIsOfficeFull && W._gcIsOfficeFull()) return true; } catch (e) {}
  try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; }
}
function me(){ try { var k = kit(); if (k && k.me) return s(k.me()); } catch (e) {} try { return s(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); } catch (e) { return ''; } }
function kit(){ return (W._gcLeadsHub && W._gcLeadsHub.kit) || W._gcLeadsHubKit || null; }
function all(){ var k = kit(); try { return k ? arr(k.all()) : arr((W._crm || {}).leads); } catch (e) { return []; } }

/* ── the lead's GCs ── */
function gcsOf(l){ if (!l) return []; if (arr(l.gcs).length) return arr(l.gcs); return BM.isBidLead(l) && (s(l.dueToCompany) || s(l.gc)) ? BM.seedGcs(l) : []; }
var SUMS = typeof WeakMap === 'function' ? new WeakMap() : null;   /* one answer per lead object (a saved lead is a new object) */
function sumOf(l){ if (SUMS && l && typeof l === 'object') { var c = SUMS.get(l); if (c) return c; } var m = BM.summary({ gcs: gcsOf(l), trades: arr(l.trades) }); if (SUMS && l && typeof l === 'object') SUMS.set(l, m); return m; }
function rowTag(l){ var m = sumOf(l); return m.text ? ' <span class="bm-tag" title="' + esc(gcsOf(l).map(function(g){ return BM.gcLine(g); }).join(' · ')) + '">· ' + esc(m.text) + '</span>' : ''; }
function chip(l){ var m = sumOf(l); return m.gcs > 1 || m.trades > 1 ? ' <span class="gcl-chip bm-chip" title="' + esc(gcsOf(l).map(function(g){ return BM.gcLine(g); }).join(' · ')) + '">🔗 ' + esc(m.text) + '</span>' : ''; }
var DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dueTxt(d){
  d = s(d); if (!d) return ''; var t = new Date(d.length === 10 ? d + 'T12:00:00' : d); if (isNaN(t)) return d;
  var o = DAY[t.getDay()] + ' ' + MON[t.getMonth()] + ' ' + t.getDate();
  if (d.length > 10) { var h = t.getHours(), m = t.getMinutes(); o += ' · ' + ((h % 12) || 12) + (m ? ':' + ('0' + m).slice(-2) : '') + ' ' + (h < 12 ? 'AM' : 'PM'); }
  return o;
}
function board(g){ var u = low(g.link) + ' ' + low(g.source); return /buildingconnected/.test(u) ? 'BuildingConnected' : /planhub/.test(u) ? 'PlanHub' : /constructconnect/.test(u) ? 'ConstructConnect' : s(g.source); }
function paneHtml(l){
  var G = gcsOf(l); if (!G.length || (G.length < 2 && sumOf(l).trades < 2)) return '';
  var m = sumOf(l), hist = arr(l.activity).filter(function(a){ return a && a.type === 'bidmerge'; }).slice(-6);
  return '<section class="px-sec bm-sec"><h4>' + esc(G.length > 1 ? G.length + ' GCs invited us' : 'Invited by') + (m.trades > 1 ? ' · ' + m.trades + ' trades' : '') + '</h4>'
    + G.map(function(g){
      var tr = arr(g.trades).concat(arr(g.packages).filter(function(p){ return !arr(g.trades).some(function(t){ return low(p).indexOf(low(t)) >= 0; }); }));
      var c = [s(g.contact), s(g.phone) ? '<a href="tel:' + esc(s(g.phone).replace(/[^\d+]/g, '')) + '">' + esc(g.phone) + '</a>' : '', s(g.email) ? '<a href="mailto:' + esc(g.email) + '">' + esc(g.email) + '</a>' : ''].filter(Boolean);
      return '<div class="bm-gc"><div class="bm-gc-h"><b>' + esc(g.name) + '</b>' + (board(g) ? ' <span class="bm-src">' + esc(board(g)) + '</span>' : '') + (g.due ? ' <span class="bm-due">due ' + esc(dueTxt(g.due)) + '</span>' : '') + '</div>'
        + (tr.length ? '<div class="bm-tr">' + esc(tr.join(', ')) + '</div>' : '')
        + (c.length ? '<div class="bm-ct">' + c.map(function(x, i){ return i ? x : esc(x); }).join(' · ') + '</div>' : '')
        + (/^https?:\/\//.test(s(g.link)) ? '<a class="bm-ln" href="' + esc(g.link) + '" target="_blank" rel="noopener">Open ' + esc(board(g) ? 'on ' + board(g) : 'invitation') + ' ↗</a>' : '') + '</div>';
    }).join('')
    + (hist.length ? '<div class="bm-hist">' + hist.map(function(a){ return '<div>' + esc(a.text) + ' <span>' + esc(dueTxt(s(a.at).slice(0, 10))) + '</span></div>'; }).join('') + '</div>' : '')
    + '</section>';
}
/* LD2 fromItem: the item's GC list and its quiet history lines onto the lead */
function fromItem(l, it){
  if (!l || !it) return l;
  if (arr(it.gcs).length) l.gcs = arr(it.gcs).slice(0, 40).map(function(g){ return { key: s(g.key), name: s(g.name), contact: s(g.contact), email: s(g.email), phone: s(g.phone), due: s(g.due), trades: arr(g.trades).slice(0, 30), packages: arr(g.packages).slice(0, 8), link: s(g.link), source: s(g.source), at: s(g.at) }; });
  var tr = BM.tradesOf({ trades: arr(it.trades), gcs: arr(it.gcs) }); if (tr.length > arr(l.trades).length) l.trades = tr.slice(0, 40);
  if (arr(it.history).length) {
    var act = arr(l.activity).slice(), have = {}; act.forEach(function(a){ if (a) have[s(a.at) + '|' + s(a.text)] = 1; });
    arr(it.history).forEach(function(h){ if (h && s(h.text) && !have[s(h.at) + '|' + s(h.text)]) act.push({ type: 'bidmerge', at: s(h.at), by: 'Lead Inbox', text: s(h.text) }); });
    l.activity = act.slice(-200);
  }
  return l;
}

/* ── the duplicates already on the list (the dry run) ── */
var CNT = { sig: '', g: [] };   /* the hub asks on every draw: worked out again only when the leads change */
function groups(list){
  var L = list || all();
  if (list) return BM.groups(L);
  var sig = L.length + '|' + L.map(function(l){ return l ? s(l.id) + '@' + s(l.updatedAt || l.savedAt) : ''; }).join(',');
  if (CNT.sig !== sig) { CNT.g = BM.groups(L); CNT.sig = sig; }
  return CNT.g;
}
function count(){ try { return can() ? groups().length : 0; } catch (e) { return 0; } }
function label(){ return '🔗 Merge duplicate bid leads (' + count() + ')'; }
function own(l){ return !!l && !!s(l.inboxId) && s(l.id) === 'LEADIN-' + s(l.inboxId).replace(/^LI-/, ''); }
/* pure: fold each group into its keeper; the copies stay on the list (Recently deleted takes them next) */
function mergeGroups(list, picks, by, at){
  var out = list.slice(), byId = {}; out.forEach(function(l, i){ if (l && l.id) byId[s(l.id)] = i; });
  var before = [], folded = [], inbox = [], keepers = [], n = 0;
  picks.forEach(function(g){
    var ki = byId[s(g.keeper)]; if (ki == null) return;
    var keeper = out[ki], others = arr(g.ids).filter(function(id){ return id !== g.keeper && byId[s(id)] != null; }).map(function(id){ return out[byId[s(id)]]; }).filter(function(l){ return BM.liveLead(l); });
    if (!others.length) return;
    before.push(JSON.parse(JSON.stringify(keeper)));
    out[ki] = BM.mergeLeads(keeper, others, { at: at, by: by }); keepers.push(out[ki]); n++;
    others.forEach(function(o){
      folded.push(s(o.id));
      if (own(o)) inbox.push(own(keeper) ? { id: o.inboxId, op: 'merged', into: keeper.inboxId, undo: 'unmerge' } : { id: o.inboxId, op: 'dismissed', reason: 'merged into the lead "' + s(keeper.name) + '" (🔗 duplicate bid leads)', undo: 'restore' });
    });
  });
  return { list: out, groups: n, before: before, folded: folded, inbox: inbox, keepers: keepers };
}
function inboxAct(b){
  var body = { id: b.id, op: b.op }; if (b.into) body.into = b.into; if (b.reason) body.reason = b.reason;
  try { if (W._gcLeadInbox && typeof W._gcLeadInbox.act === 'function') return Promise.resolve(W._gcLeadInbox.act(body)).catch(function(){}); } catch (e) {}
  return W.fetch('/.netlify/functions/bid-inbox?act=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(function(){});
}

/* ── the undo log (gc_kv gc_bidmerge_log, 30 days, like 🧹 Clean up's) ── */
function kvGet(key){
  return W.fetch(SB + '/rest/v1/gc_kv?key=eq.' + encodeURIComponent(key) + '&select=value', { cache: 'no-store' }).then(function(r){ return r.ok ? r.json() : Promise.reject(new Error('read ' + r.status)); })
    .then(function(rows){ var v = rows && rows[0] ? rows[0].value : null; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; });
}
function kvPut(key, value){
  return W.fetch(SB + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: key, value: value, updated_at: nowIso() }) }).then(function(r){ return r.ok; }, function(){ return false; });
}
var LOG = null;
function lsLog(){ try { return arr(JSON.parse(localStorage.getItem('gc_bidmerge_log') || '[]')); } catch (e) { return []; } }
function readLog(){ return kvGet(LOG_KEY).then(function(v){ LOG = arr(v && v.entries ? v.entries : v); if (!LOG.length) LOG = lsLog(); return LOG; }, function(){ LOG = LOG || lsLog(); return LOG; }); }
function writeLog(list){ LOG = list; try { localStorage.setItem('gc_bidmerge_log', JSON.stringify(list.slice(-5))); } catch (e) {} return kvPut(LOG_KEY, { entries: list, updatedAt: nowIso() }); }
function lastUndo(){ var now = Date.now(); return arr(LOG || lsLog()).filter(function(e){ return e && !e.undone && now - tms(e.at) < KEEP_MS; }).slice(-1)[0] || null; }

/* ── apply / undo ── */
function save(mut){ var k = kit(); if (k && typeof k.setLeads === 'function') return Promise.resolve(k.setLeads(mut)); return Promise.resolve(false); }
/* a lead put back EXACTLY as the snapshot: its own fields and nothing else (a field the merge added is deleted, not blanked;
   only the save stamps are new) */
var STAMPS = { updatedAt: 1, savedAt: 1 };
function exactly(snap, at){ var x = JSON.parse(JSON.stringify(snap)); x.updatedAt = x.savedAt = at; return x; }
function differs(snap, live){
  var bad = [];
  Object.keys(Object.assign({}, snap, live)).forEach(function(k){ if (STAMPS[k]) return; if (!(k in snap)) { bad.push('+' + k); return; } if (!(k in live)) { bad.push('-' + k); return; } if (JSON.stringify(snap[k]) !== JSON.stringify(live[k])) bad.push(k); });
  return bad;
}
/* after the undo is saved, look again a few times: a background copy of the list that still had the merged lead must not
   bring a merged field back. Only while the lead is still the undo's own save (nobody has changed it since). */
var VERIFY_MS = [600, 2000, 5000, 10000];
function holdUndo(back, at, step){
  step = step || 0; if (step >= VERIFY_MS.length) return;
  later(function(){
    var fix = {}, n = 0, why = [];
    all().forEach(function(l){ var id = s(l && l.id); if (!back[id] || s(l.updatedAt) !== at) return; var d = differs(back[id], l); if (d.length) { fix[id] = 1; n++; why.push(id + ' ' + d.join(',')); } });
    if (!n) return holdUndo(back, at, step + 1);
    try { console.warn('[GC] 🔗 undo: put back again (a copy of the merged lead came back): ' + why.join('; ')); } catch (e) {}
    save(function(list){ var c = 0, out = list.map(function(l){ var id = s(l && l.id); if (fix[id] && s(l.updatedAt) === at) { c++; return exactly(back[id], at); } return l; }); return c ? out : null; })
      .then(function(){ holdUndo(back, at, step + 1); });
  }, VERIFY_MS[step] - (step ? VERIFY_MS[step - 1] : 0));
}
function apply(picks){
  if (!can()) { toast('Only an admin or the office merges leads'); return Promise.resolve(false); }
  if (!W._gcLDEL || typeof W._gcLDEL.remove !== 'function') { toast('🗑 Recently deleted is not ready yet — try again in a moment'); return Promise.resolve(false); }
  var by = me() || 'GrayCo', at = nowIso();
  /* the plan on a copy of the list (nothing is saved yet) */
  var now0 = all(), R = mergeGroups(now0.map(function(l){ return l; }), arr(picks), by, at);
  if (!R.groups) { toast('Nothing merged — the leads changed; open the list again'); return Promise.resolve(false); }
  var keep = {}; R.keepers.forEach(function(k){ keep[s(k.id)] = k; });
  var gone = {}; R.folded.forEach(function(id){ gone[id] = 1; });
  var copies = now0.filter(function(l){ return l && gone[s(l.id)]; }).map(function(l){ return JSON.parse(JSON.stringify(l)); });
  /* 1. the copies to 🗑 Recently deleted (that also writes this computer's saved list), 2. then the kept leads on top of it */
  return Promise.resolve(W._gcLDEL.remove(R.folded, { silent: true })).then(function(d){
    if (!d || !d.ok) { toast('Nothing merged — the copies could not be moved to Recently deleted'); return false; }
    return save(function(list){ var n = 0, out = list.filter(function(l){ return !(l && gone[s(l.id)]); }).map(function(l){ if (l && keep[s(l.id)]) { n++; return keep[s(l.id)]; } return l; }); return n ? out : null; }).then(function(ok){
      R.inbox.forEach(inboxAct);
      var entry = { id: 'bm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: at, by: by, groups: R.groups, before: R.before, copies: copies, folded: R.folded, inbox: R.inbox, saved: !!ok };
      return readLog().then(function(list){ var now = Date.now(); return writeLog(list.filter(function(e){ return e && now - tms(e.at) < KEEP_MS; }).concat([entry]).slice(-20)); }).then(function(){
        CNT.sig = ''; toast('🔗 Merged ' + R.groups + ' project' + (R.groups === 1 ? '' : 's') + ' — ' + R.folded.length + ' cop' + (R.folded.length === 1 ? 'y' : 'ies') + ' in 🗑 Recently deleted · "↩ Undo last merge" for 30 days');
        try { W._gcLeadsHub.redraw(); } catch (e) {}
        return { ok: true, groups: R.groups, folded: R.folded.slice(), entry: entry };
      });
    });
  });
}
function undo(){
  if (!can()) return Promise.resolve(false);
  return readLog().then(function(){
    var e = lastUndo(); if (!e) { toast('Nothing to undo (the last 30 days)'); return false; }
    var at = nowIso(), back = {}; arr(e.before).forEach(function(l){ if (l && l.id) back[s(l.id)] = l; });
    /* 1. the copies back from 🗑 Recently deleted, 2. then every touched lead exactly as it was (the snapshot, whole) */
    var rest = W._gcLDEL && W._gcLDEL.restore ? W._gcLDEL.restore(arr(e.folded)) : null;
    return Promise.resolve(rest).then(function(){
      var cps = {}; arr(e.copies).forEach(function(l){ if (l && l.id) cps[s(l.id)] = l; });
      return save(function(list){
        var n = 0, have = {}, out = list.map(function(l){ if (!l) return l; have[s(l.id)] = 1; var id = s(l.id); if (back[id]) { n++; return exactly(back[id], at); } return l; });
        arr(e.folded).forEach(function(id){ if (!have[id] && cps[id]) { n++; out.push(exactly(cps[id], at)); } });   /* a copy Recently deleted could not give back */
        return n ? out : null;
      });
    }).then(function(){
      holdUndo(back, at);
      arr(e.inbox).forEach(function(b){ inboxAct({ id: b.id, op: b.undo || 'restore' }); });
      return writeLog(arr(LOG).map(function(x){ return x.id === e.id ? Object.assign({}, x, { undone: at, undoneBy: me() }) : x; }));
    }).then(function(){ CNT.sig = ''; toast('↩ Undone: the ' + arr(e.folded).length + ' lead' + (arr(e.folded).length === 1 ? '' : 's') + ' are back'); try { W._gcLeadsHub.redraw(); } catch (x) {} return true; });
  });
}

/* ── the window: a dry run, then a confirm ── */
var VIEW = { pick: {}, ask: false, list: [] };
function css(){
  if (D.getElementById('gc-bidmerge-css')) return;
  var c = D.createElement('style'); c.id = 'gc-bidmerge-css';
  c.textContent = '#gc-bidmerge{position:fixed;inset:0;z-index:100160;background:rgba(15,10,40,.45);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 10px;font:14px Arial,sans-serif;color:#1b1640;box-sizing:border-box}'
    + '#gc-bidmerge *{box-sizing:border-box}#gc-bidmerge .box{background:#fff;border-radius:12px;max-width:960px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3)}'
    + '#gc-bidmerge .hd{display:flex;gap:8px;align-items:center;background:#241968;color:#fff;padding:12px 16px;border-radius:12px 12px 0 0}#gc-bidmerge .hd h3{margin:0;flex:1;font-size:17px}'
    + '#gc-bidmerge .hd button{background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;min-width:40px;min-height:40px}'
    + '#gc-bidmerge .bd{padding:10px 16px 16px}#gc-bidmerge .note{font-size:12.5px;color:#555;margin:4px 0 10px;line-height:1.45}'
    + '#gc-bidmerge .grp{border:1px solid #e3e1f0;border-radius:10px;padding:8px 10px;margin:0 0 8px}#gc-bidmerge .grp h5{margin:0 0 4px;font-size:13.5px;display:flex;gap:8px;align-items:flex-start}'
    + '#gc-bidmerge .why{font-size:12px;color:#0f766e;margin:0 0 4px 26px}#gc-bidmerge .row{display:flex;gap:8px;align-items:flex-start;padding:5px 0 5px 26px;border-top:1px solid #f3f2f8;font-size:13px;overflow-wrap:anywhere}'
    + '#gc-bidmerge .m{color:#666;font-size:12px}#gc-bidmerge .k{display:inline-block;border-radius:999px;padding:1px 7px;font:700 11px Arial;background:#dcfce7;color:#166534;white-space:nowrap}#gc-bidmerge .f{background:#fee2e2;color:#991b1b}'
    + '#gc-bidmerge .act{display:flex;gap:8px;flex-wrap:wrap;align-items:center;position:sticky;bottom:0;background:#fff;padding:10px 0 2px;border-top:1px solid #eee;margin-top:8px}'
    + '#gc-bidmerge .act button{border:1px solid #d6d3ea;background:#fff;border-radius:8px;padding:8px 12px;font:700 13px Arial;color:#241968;cursor:pointer;min-height:40px}#gc-bidmerge .act button.pri{background:#241968;color:#fff;border-color:#241968}#gc-bidmerge .act button[disabled]{opacity:.5;cursor:default}'
    + '#gc-bidmerge input[type=checkbox]{width:18px;height:18px;margin-top:1px;flex:none}'
    + '.bm-tag{color:#0f766e;font-weight:400;font-size:12px;white-space:nowrap}.bm-chip{background:#ecfdf5;color:#0f766e;border:1px solid #a7f3d0}'
    + '.bm-sec .bm-gc{border:1px solid #e5e7eb;border-radius:8px;padding:6px 8px;margin:0 0 6px;font-size:13px;overflow-wrap:anywhere}.bm-sec .bm-src{font-size:11px;background:#eef2ff;color:#3730a3;border-radius:999px;padding:1px 6px}'
    + '.bm-sec .bm-due{font-size:12px;color:#92400e}.bm-sec .bm-tr{color:#334155;margin-top:2px}.bm-sec .bm-ct{color:#555;font-size:12px;margin-top:2px}.bm-sec .bm-ln{font-size:12px}.bm-sec .bm-hist{font-size:12px;color:#64748b;margin-top:4px}.bm-sec .bm-hist span{color:#94a3b8}';
  (D.head || D.documentElement).appendChild(c);
}
function leadLine(l, keep){
  var g = gcsOf(l)[0] || {}, tr = BM.tradesOf({ trades: arr(l.trades), gcs: gcsOf(l) });
  return '<div class="row"><span class="k' + (keep ? '' : ' f') + '">' + (keep ? '★ Kept' : 'Folded in') + '</span><div><b>' + esc(s(l.name || l.title) || l.id) + '</b>'
    + '<div class="m">' + esc([s(l.source), s(g.name) && 'GC ' + s(g.name), s(l.bidDue) && 'due ' + dueTxt(l.bidDue), s(l.address) || s(l.city), s(l.bidNumber) && 'bid # ' + s(l.bidNumber)].filter(Boolean).join(' · ')) + '</div>'
    + (tr.length ? '<div class="m">Trades: ' + esc(tr.join(', ')) + '</div>' : '') + '</div></div>';
}
function bodyHtml(){
  var G = VIEW.list, nPick = G.filter(function(g, i){ return VIEW.pick[i]; }).length, nFold = G.reduce(function(t, g, i){ return t + (VIEW.pick[i] ? g.ids.length - 1 : 0); }, 0), u = lastUndo();
  var h = '<div class="note"><b>A dry run — nothing has changed yet.</b> Each group below is ONE project that came in as several leads (other trades, other GCs, another board). '
    + 'Tick the groups to merge: the ★ lead is kept and lists every GC and trade; the other copies go to 🗑 Recently deleted (30 days, Restore). '
    + 'Never grouped: different street addresses, cities or bid numbers, or bids due more than ' + BM.DUE_DAYS + ' days apart — a shared GC alone is never a reason.</div>';
  if (!G.length) h += '<div class="note">No duplicate bid leads found. 👍</div>';
  G.forEach(function(g, i){
    var m = BM.summary({ gcs: g.gcs, trades: g.trades });
    h += '<div class="grp"><h5><input type="checkbox" data-bm-g="' + i + '"' + (VIEW.pick[i] ? ' checked' : '') + ' aria-label="Merge this group"><span>' + esc(s(g.leads[0].name || g.leads[0].title)) + ' <span class="m">· ' + g.ids.length + ' leads'
      + (m.text ? ' · ' + esc(m.text) : '') + (g.due ? ' · due ' + esc(dueTxt(g.due)) : '') + '</span></span></h5>'
      + '<div class="why">Why one project: ' + esc(g.why.join('; ')) + '</div>'
      + g.leads.map(function(l){ return leadLine(l, l.id === g.keeper); }).join('') + '</div>';
  });
  h += '<div class="act">';
  if (VIEW.ask) h += '<span style="flex:1 1 220px"><b>Merge ' + nPick + ' project' + (nPick === 1 ? '' : 's') + '?</b> ' + nFold + ' lead' + (nFold === 1 ? '' : 's') + ' go to 🗑 Recently deleted (Restore for 30 days).</span><button type="button" class="pri" data-bm="yes">Yes, merge</button><button type="button" data-bm="no">Cancel</button>';
  else h += '<button type="button" class="pri" data-bm="merge"' + (nPick ? '' : ' disabled') + '>🔗 Merge selected (' + nPick + ')</button>'
    + (u ? '<button type="button" data-bm="undo" title="Puts back the kept leads as they were and restores the folded copies">↩ Undo last merge (' + esc(new Date(u.at).toLocaleDateString()) + ')</button>' : '')
    + '<button type="button" data-bm="close">Close</button>';
  return h + '</div>';
}
function draw(){ var b = D.querySelector('#gc-bidmerge .bd'); if (b) b.innerHTML = bodyHtml(); }
function close(){ var o = D.getElementById('gc-bidmerge'); if (o) o.remove(); D.removeEventListener('keydown', onKey, true); }
function onKey(e){ if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (VIEW.ask) { VIEW.ask = false; draw(); } else close(); } }
function open(){
  if (!can()) { toast('Only an admin or the office merges leads'); return null; }
  css(); close(); CNT.sig = '';
  VIEW = { pick: {}, ask: false, list: groups() }; VIEW.list.forEach(function(g, i){ VIEW.pick[i] = true; });
  var o = D.createElement('div'); o.id = 'gc-bidmerge'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'Merge duplicate bid leads');
  o.innerHTML = '<div class="box"><div class="hd"><h3>🔗 Merge duplicate bid leads (' + VIEW.list.length + ')</h3><button type="button" data-bm="close" aria-label="Close">✕</button></div><div class="bd"></div></div>';
  D.body.appendChild(o); draw(); D.addEventListener('keydown', onKey, true);
  o.addEventListener('click', function(e){
    var t = e.target; if (t === o) return close();
    var cb = t.closest && t.closest('[data-bm-g]'); if (cb) { VIEW.pick[+cb.getAttribute('data-bm-g')] = !!cb.checked; VIEW.ask = false; draw(); return; }
    var b = t.closest && t.closest('[data-bm]'); if (!b) return;
    var a = b.getAttribute('data-bm');
    if (a === 'close') return close();
    if (a === 'merge') { VIEW.ask = true; draw(); return; }
    if (a === 'no') { VIEW.ask = false; draw(); return; }
    if (a === 'yes') { var picks = VIEW.list.filter(function(g, i){ return VIEW.pick[i]; }).map(function(g){ return { keeper: g.keeper, ids: g.ids.slice() }; }); b.disabled = true; apply(picks).then(function(){ close(); }); return; }
    if (a === 'undo') { b.disabled = true; undo().then(function(){ close(); }); }
  });
  readLog().then(function(){ if (D.getElementById('gc-bidmerge') && !VIEW.ask) draw(); });
  return o;
}
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest ? e.target.closest('[data-gcl-bidmerge]') : null; if (!b) return;
  e.preventDefault(); e.stopPropagation(); open();
}, true);
later(function(){ readLog(); }, 4000);

W._gcBidMerge = { core: BM, can: can, count: count, label: label, groups: groups, open: open, close: close, apply: apply, undo: undo, lastUndo: lastUndo, readLog: readLog,
  mergeGroups: mergeGroups, rowTag: rowTag, chip: chip, paneHtml: paneHtml, fromItem: fromItem, gcsOf: gcsOf,
  show: function(){ try { return can() && (count() > 0 || !!lastUndo()); } catch (e) { return false; } } };
try { console.log('[GC] One lead per project (patch BIDMERGE) — window._gcBidMerge'); } catch (e) {}
})();
