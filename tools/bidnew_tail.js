<script id="gc-patch-newbidjob">
/* BIDNEW (owner 11/23: "want to be able to enter a project into the portal from here") — "＋ New bid job" on the 🏗 Bid portal screen
   (📊 Bids & invites, next to Open the bid portal ↗ / ↻ Refresh / the search box / 🔐 Accounts). It opens an INLINE form (no popup, desk
   and phone): title, site address, sub bid due date + time, the trades we need priced, scope / notes, 🔒 Private or 🌐 Public, an optional
   link to an existing CRM lead or job (search), and plans (＋ Upload — the CRM's file pipeline window._gcStoreFile, a crm-files reference
   only — or a Drive / Dropbox link). 📢 Put on bid portal → the SAME server path as "📢 Put on bid portal" on a lead / estimate / job
   (bid-hub op postjob: a person posted it — postedAt / postedBy — so the "On bid portal" logic counts it), then its 📂 Manage sheet opens
   so subs can be invited.
   Who: the same people who post today (window._gcBidPost.canPost): an admin, an estimator; a PM only for a lead / job of their own (they
   must link it). The server checks the same (posterRole).
   A lead / job that already has a bid job is never overwritten from here: the form says so and offers 📂 Manage on that job instead.
   Console: _gcNewBidJob.open()  _gcNewBidJob.state() */
(function(W, D){
'use strict';
if (W.__gcNewBidJobOn) return; W.__gcNewBidJobOn = true;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout, RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function warn(e){ try { console.warn('[GC new bid job]', e && e.message || e); } catch (x) {} }
function toast(m, bad){ try { if (W._gcSys && W._gcSys.toast) return W._gcSys.toast(m, bad); if (W._gcToast) W._gcToast(m); } catch (e) {} }
function fn(path, body){
  if (W._gcSys && W._gcSys.fn) return W._gcSys.fn(path, body);
  return W.fetch('/.netlify/functions/' + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if (!r.ok) throw new Error(j.error || ('The server answered ' + r.status)); return j; }); });
}
function crm(){ return W._crm || {}; }
function BPo(){ return W._gcBidPost || null; }
function leadsAll(){ var out = [], seen = {}; var add = function(l){ if (l && s(l.id) && !seen[s(l.id)]) { seen[s(l.id)] = 1; out.push(l); } };
  arr(crm().leads).forEach(add); try { arr(W._gcLeadsHubKit && W._gcLeadsHubKit.all && W._gcLeadsHubKit.all()).forEach(add); } catch (e) {} arr(W._gcLeadsList).forEach(add); return out; }
function projAll(){ return arr(crm().projects).filter(function(p){ return p && s(p.id); }); }

/* ── who: the 📢 Put on bid portal rule ── */
function canAny(){ var B = BPo(); if (!B || !B.canPost) return false; try { return !!B.canPost({}); } catch (e) { return false; } }
function canFor(k){ var B = BPo(); if (!B || !B.canPost) return false; try { return !!B.canPost(k.kind === 'pid' ? { pid: k.id } : { leadId: k.id }); } catch (e) { return false; } }
var MAY = { at: 0, v: false };
function may(){
  if (Date.now() - MAY.at < 20000) return MAY.v;
  var v = canAny();
  if (!v) v = projAll().some(function(p){ return canFor({ kind: 'pid', id: s(p.id) }); }) || leadsAll().some(function(l){ return canFor({ kind: 'leadId', id: s(l.id) }); });
  MAY = { at: Date.now(), v: v }; return v;
}

/* ── the form ── */
var TRADES0 = ['Demolition', 'Framing', 'Drywall', 'Paint', 'Flooring', 'Tile', 'Roofing', 'Siding', 'Gutters', 'Windows & Doors', 'Insulation', 'Ceilings', 'Cabinets', 'Concrete', 'Masonry', 'Electrical', 'Plumbing', 'HVAC', 'Fire protection', 'Landscaping', 'Mitigation', 'Abatement', 'Cleaning'];
function tradeList(){ var B = BPo(); try { var l = B && B.trades && B.trades(); if (arr(l).length) return l; } catch (e) {} return TRADES0.slice(); }
var F = { open: false, vis: 'private', trades: {}, link: null, files: [], links: [], busy: false, q: '', existing: null };
function fresh(){ F = { open: false, vis: 'private', trades: {}, link: null, files: [], links: [], busy: false, q: '', existing: null }; }
function css(){
  if (D.getElementById('gcnb-css')) return;
  var st = D.createElement('style'); st.id = 'gcnb-css'; st.setAttribute('data-gc-keep', '1');
  st.textContent = '#gcnb{border:2px solid #d4a017;background:#fffdf5;border-radius:14px;padding:14px;margin:4px 0 14px;font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1b1640;box-sizing:border-box;max-width:100%}'
    + '#gcnb h3{margin:0;font-size:18px}#gcnb .hd{display:flex;justify-content:space-between;gap:8px;align-items:center}#gcnb label.f{display:block;font-weight:700;font-size:13px;margin:12px 0 4px}'
    + '#gcnb input[type=text],#gcnb input[type=search],#gcnb input[type=url],#gcnb input[type=date],#gcnb input[type=time],#gcnb textarea{width:100%;box-sizing:border-box;border:1px solid #d6d1e6;border-radius:8px;padding:8px 10px;font:inherit;background:#fff;min-height:40px}'
    + '#gcnb .g2{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px}#gcnb .vis{display:flex;gap:8px;flex-wrap:wrap}#gcnb .vis label{flex:1;min-width:200px;border:2px solid #e7e3f2;border-radius:10px;padding:8px 10px;cursor:pointer;background:#fff}#gcnb .vis label.on{border-color:#d4a017;background:#fffbeb}'
    + '#gcnb .chips{display:flex;flex-wrap:wrap;gap:6px}#gcnb .chip{border:1px solid #d6d1e6;background:#fff;border-radius:999px;padding:6px 11px;cursor:pointer;font:600 12.5px system-ui;min-height:32px}#gcnb .chip.on{background:#241968;color:#fff;border-color:#241968}'
    + '#gcnb .row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}#gcnb .row>input{flex:1;min-width:160px}#gcnb .hits{border:1px solid #eeeaf6;border-radius:10px;background:#fff;margin-top:4px;max-height:240px;overflow:auto}'
    + '#gcnb .hits button{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid #f4f2fa;background:#fff;padding:8px 10px;cursor:pointer;font:inherit}#gcnb .hits button:hover{background:#f7f5fc}'
    + '#gcnb .pick{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:8px 10px}#gcnb .warn{background:#fef3c7;border:1px solid #fcd34d;color:#78350f;border-radius:10px;padding:8px 10px;margin-top:6px}'
    + '#gcnb ul.fl{list-style:none;margin:6px 0 0;padding:0}#gcnb ul.fl li{display:flex;gap:8px;align-items:center;padding:4px 0;font-size:13px;word-break:break-all}#gcnb .err{color:#b91c1c;font-weight:600;min-height:1em;margin-top:8px}'
    + '#gcnb .mut{color:#6b6787;font-size:12px}#gcnb .bar2{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}#gcnb button.b{min-height:38px}'
    + '@media(max-width:640px){#gcnb{padding:12px 10px}#gcnb .g2{grid-template-columns:1fr 1fr}#gcnb .g2>div:first-child{grid-column:1/-1}#gcnb .vis label{min-width:0;flex-basis:100%}#gcnb .bar2 button{flex:1 1 auto}}';
  D.head.appendChild(st);
}
function host(){ return D.querySelector('#gc-sys-bp'); }
function barOf(){ var h = host(); if (!h) return null; var o = h.querySelector('[data-sys="openbids"]'); return o ? o.parentNode : null; }
function box(){ return D.getElementById('gcnb'); }
function val(k){ var b = box(), e = b && b.querySelector('[data-nb="' + k + '"]'); return e ? s(e.value) : ''; }
function setErr(t){ var b = box(), e = b && b.querySelector('[data-nb-err]'); if (e) e.textContent = t || ''; }
function addrOf(x){ return [s(x.address), s(x.city), s(x.state)].filter(Boolean).join(', '); }
function labelOf(k){ if (!k) return ''; if (k.kind === 'pid') { var p = projAll().filter(function(x){ return s(x.id) === k.id; })[0]; return p ? '🏗 Job ' + [s(p.autoPO), s(p.name)].filter(Boolean).join(' · ') + (addrOf(p) ? ' — ' + addrOf(p) : '') : '🏗 Job ' + k.id; }
  var l = leadsAll().filter(function(x){ return s(x.id) === k.id; })[0]; return l ? '◈ Lead ' + s(l.name || l.title) + (addrOf(l) ? ' — ' + addrOf(l) : '') : '◈ Lead ' + k.id; }
function hits(q){
  q = low(q); if (q.length < 2) return [];
  var words = q.split(/\s+/).filter(Boolean), out = [];
  var test = function(t){ t = low(t); return words.every(function(w){ return t.indexOf(w) > -1; }); };
  projAll().forEach(function(p){ if (p.deleted || p.archived) return; if (test([p.autoPO, p.name, p.client, p.address, p.city].join(' '))) out.push({ kind: 'pid', id: s(p.id), t: 0 }); });
  leadsAll().forEach(function(l){ if (l.deleted || l.archived) return; if (test([l.name, l.title, l.company, l.address, l.city].join(' '))) out.push({ kind: 'leadId', id: s(l.id), t: 1 }); });
  return out.filter(canFor).slice(0, 10);
}
function existingFor(k){   /* the bid job already linked to that lead / job (the same rule as 📢 Put on bid portal's postedFor) */
  var B = BPo(); if (!k || !B || !B.jobs) return Promise.resolve(null);
  return Promise.resolve(B.jobs(false)).then(function(list){ var l = arr(list).filter(function(j){ return j && ((k.kind === 'pid' && s(j.crmProjectId) === k.id) || (k.kind === 'leadId' && s(j.crmLeadId) === k.id)); });
    return l.filter(function(j){ return !j.deleted; })[0] || l[0] || null; }, function(){ return null; });
}
function draw(){
  var b = box(); if (!b) return;
  var tl = tradeList(); Object.keys(F.trades).forEach(function(t){ if (!tl.some(function(x){ return low(x) === low(t); })) tl.push(t); });
  var lk = F.link, ex = F.existing, pmOnly = !canAny();
  b.innerHTML = '<div class="hd"><h3>＋ New bid job</h3><button type="button" class="b" data-nb-a="cancel" aria-label="Close">✕</button></div>'
    + '<div class="mut">Put a job on bids.grayco-cs.com by hand. Subs see the job, the scope and the plans you share — never prices, never a customer\'s details.</div>'
    + '<label class="f">Who sees it</label><div class="vis">'
    + '<label class="' + (F.vis === 'private' ? 'on' : '') + '"><input type="radio" name="gcnb-vis" value="private"' + (F.vis === 'private' ? ' checked' : '') + '> <b>🔒 Private</b><div class="mut">Only subs you invite.</div></label>'
    + '<label class="' + (F.vis === 'public' ? 'on' : '') + '"><input type="radio" name="gcnb-vis" value="public"' + (F.vis === 'public' ? ' checked' : '') + '> <b>🌐 Public</b><div class="mut">Every approved sub can see it and bid. Needs a due date.</div></label></div>'
    + '<label class="f" for="gcnb-title">Job title</label><input type="text" id="gcnb-title" data-nb="title" maxlength="200" placeholder="e.g. Sample Clinic — exterior paint">'
    + '<div class="g2"><div><label class="f" for="gcnb-addr">Site address</label><input type="text" id="gcnb-addr" data-nb="address" maxlength="240" placeholder="Street, city, state"></div>'
    + '<div><label class="f" for="gcnb-due">Bid due <span class="mut">(subs)</span></label><input type="date" id="gcnb-due" data-nb="due"></div>'
    + '<div><label class="f" for="gcnb-duet">Time</label><input type="time" id="gcnb-duet" data-nb="dueTime"></div></div>'
    + '<label class="f">Trades we need priced</label><div class="chips" data-nb-trades>' + tl.map(function(t){ return '<button type="button" class="chip' + (F.trades[t] ? ' on' : '') + '" data-nb-a="trade" data-t="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>'
    + '<div class="row" style="margin-top:6px"><input type="text" data-nb="trade" placeholder="Another trade (e.g. Exterior paint)" maxlength="40" aria-label="Another trade"><button type="button" class="b" data-nb-a="addtrade">＋ Add</button></div>'
    + '<label class="f" for="gcnb-scope">Scope / notes for bidders</label><textarea id="gcnb-scope" data-nb="scope" rows="4" maxlength="20000" placeholder="e.g. 2,500 SF exterior repaint: wash, scrape, prime bare wood, 2 coats. Walk-through Tue 9 AM."></textarea>'
    + '<label class="f">Link to a CRM lead or job <span class="mut">(optional' + (pmOnly ? ' — as a PM, pick one of your own' : '') + ')</span></label>'
    + (lk ? '<div class="pick" data-nb-linked="' + esc(lk.kind + ':' + lk.id) + '"><span>' + esc(labelOf(lk)) + '</span><button type="button" class="b" data-nb-a="unlink">✕ Unlink</button></div>'
      + (ex ? '<div class="warn" data-nb-existing="' + esc(ex.id) + '">This ' + (lk.kind === 'pid' ? 'job' : 'lead') + ' is already on the bid portal' + (ex.deleted ? ' (🗄 archived)' : '') + ': <b>' + esc(ex.title || 'Bid job') + '</b>. It is not changed from here — <button type="button" class="b" data-nb-a="manage" data-job="' + esc(ex.id) + '">📂 Manage it</button> or unlink to make a separate job.</div>' : '')
      : '<input type="search" data-nb="q" placeholder="Search leads and jobs — name, PO, address" aria-label="Search CRM leads and jobs" value="' + esc(F.q) + '"><div class="hits" data-nb-hits style="display:none"></div>')
    + '<label class="f">Plans</label><div class="row"><button type="button" class="b" data-nb-a="upload">＋ Upload plans / files</button><input type="file" data-nb-file multiple accept=".pdf,.png,.jpg,.jpeg,.heic,.heif,.webp,.tif,.tiff,.dwg,.dxf,.zip,.doc,.docx,.xls,.xlsx,application/pdf,image/*" style="display:none"><span class="mut" data-nb-upmsg></span></div>'
    + '<div class="row" style="margin-top:6px"><input type="url" data-nb="link" placeholder="or a Drive / Dropbox link — https://…" aria-label="Plans link (Drive / Dropbox)"><button type="button" class="b" data-nb-a="addlink">＋ Add link</button></div>'
    + '<ul class="fl" data-nb-files>' + F.files.map(function(f, i){ return '<li>📄 ' + esc(f.name) + ' <button type="button" class="b" data-nb-a="rmfile" data-i="' + i + '" aria-label="Remove">✕</button></li>'; }).join('')
      + F.links.map(function(x, i){ return '<li>🔗 ' + esc(x.label) + ' <span class="mut">' + esc(x.url) + '</span> <button type="button" class="b" data-nb-a="rmlink" data-i="' + i + '" aria-label="Remove">✕</button></li>'; }).join('') + '</ul>'
    + '<div class="err" data-nb-err role="alert"></div>'
    + '<div class="bar2"><button type="button" class="b pri" data-nb-a="save"' + (ex || F.busy ? ' disabled' : '') + '>📢 Put on bid portal</button><button type="button" class="b" data-nb-a="cancel">Cancel</button></div>';
}
function keepVals(){ var b = box(); if (!b) return null; var o = {}; ['title', 'address', 'due', 'dueTime', 'scope', 'link', 'trade'].forEach(function(k){ o[k] = val(k); }); return o; }
function putVals(o){ var b = box(); if (!b || !o) return; Object.keys(o).forEach(function(k){ var e = b.querySelector('[data-nb="' + k + '"]'); if (e) e.value = o[k]; }); }
function redraw(){ var v = keepVals(); draw(); putVals(v); }
function open(){
  if (!may()) { toast('Only an admin, an estimator, or a job\'s PM puts jobs on the bid portal.', true); return false; }
  var h = host(), bar = barOf(); if (!h || !bar) return false;
  css();
  var b = box(); if (!b) { fresh(); b = D.createElement('div'); b.id = 'gcnb'; b.setAttribute('data-gc-keep', '1'); b.setAttribute('data-gc-noac', '1'); b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'New bid job');
    b.addEventListener('click', onClick); b.addEventListener('input', onInput); b.addEventListener('change', onChange); bar.parentNode.insertBefore(b, bar.nextSibling); draw(); }
  F.open = true;
  try { b.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) {}
  var t = b.querySelector('[data-nb="title"]'); if (t) try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); }
  return true;
}
function close(){ var b = box(); if (b) b.remove(); fresh(); }
function showHits(){
  var b = box(), hb = b && b.querySelector('[data-nb-hits]'); if (!hb) return;
  var l = hits(F.q); if (!l.length) { hb.style.display = F.q.length >= 2 ? '' : 'none'; hb.innerHTML = F.q.length >= 2 ? '<div class="mut" style="padding:8px 10px">No lead or job matches' + (canAny() ? '' : ' (only your own leads / jobs)') + '.</div>' : ''; return; }
  hb.style.display = ''; hb.innerHTML = l.map(function(k){ return '<button type="button" data-nb-a="link" data-k="' + esc(k.kind) + '" data-id="' + esc(k.id) + '">' + esc(labelOf(k)) + '</button>'; }).join('');
}
function pickLink(k){
  var v = keepVals(); F.link = k; F.existing = null; F.q = '';
  var x = k.kind === 'pid' ? projAll().filter(function(p){ return s(p.id) === k.id; })[0] : leadsAll().filter(function(l){ return s(l.id) === k.id; })[0];
  /* a box is filled from the lead / job only when it is empty or still holds what an earlier link filled in — never over what a person typed */
  var A0 = F.auto || {}, A1 = {}, fill = function(k, nv){ if (!v || !nv) return; if (!v[k] || (A0[k] && v[k] === A0[k])) { v[k] = nv; A1[k] = nv; } };
  if (x) { fill('title', s(x.name || x.title)); fill('address', addrOf(x)); fill('scope', s(x.scope || x.desc || x.description).slice(0, 8000)); }
  F.auto = A1;
  draw(); putVals(v);
  existingFor(k).then(function(j){ if (F.link !== k) return; F.existing = j; if (j) redraw(); });
}
var UP_RE = /\.(pdf|png|jpe?g|heic|heif|webp|tiff?|dwg|dxf|zip|docx?|xlsx?)$/i;
function upMsg(t){ var b = box(), x = b && b.querySelector('[data-nb-upmsg]'); if (x) x.textContent = t; }
function upload(list){
  var files = Array.prototype.slice.call(list || []); if (!files.length) return Promise.resolve(0);
  if (typeof W._gcStoreFile !== 'function') { upMsg('File storage is not ready on this device — add a Drive / Dropbox link instead.'); return Promise.resolve(0); }
  var n = 0, left = []; upMsg('⏳ Uploading ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '…');
  return files.reduce(function(p, f){ return p.then(function(){
    if (!UP_RE.test(s(f.name)) && !/^image\//.test(s(f.type))) { left.push(f.name + ' (not a plan / file type)'); return; }
    if (f.size > 50 * 1048576) { left.push(f.name + ' (over 50 MB — add a link)'); return; }
    return W._gcStoreFile(f, { kind: 'doc', pid: F.link ? F.link.id : 'bid-portal', name: f.name }).then(function(meta){
      if (!meta || !/^sb:crm-files\//.test(s(meta.ref))) { left.push(f.name); return; }
      if (!F.files.some(function(x){ return x.ref === meta.ref; })) F.files.push({ ref: meta.ref, name: s(f.name) || 'File', type: s(f.type), size: Number(f.size) || 0, category: /addend/i.test(f.name) ? 'Addenda' : /\bspec/i.test(f.name) ? 'Specs' : /scope/i.test(f.name) ? 'Scope' : 'Plans' });
      n++;
    }, function(e){ left.push(f.name + ' (' + s(e && e.message) + ')'); });
  }); }, Promise.resolve()).then(function(){ redraw(); upMsg((n ? '✓ ' + n + ' file' + (n === 1 ? '' : 's') + ' ready to share' : '') + (left.length ? (n ? ' · ' : '') + 'left out: ' + left.slice(0, 3).join(', ') : '')); return n; });
}
function addLink(){
  var u = val('link'); if (!u) return;
  if (!/^https?:\/\/\S+$/i.test(u)) { setErr('Paste a full link (https://…).'); return; }
  var lb = /dropbox\./i.test(u) ? 'Plans — Dropbox' : /drive\.google\.|docs\.google\./i.test(u) ? 'Plans — Drive' : 'Plans';
  if (!F.links.some(function(x){ return x.url === u; })) F.links.push({ url: u, label: lb });
  var v = keepVals(); v.link = ''; draw(); putVals(v); setErr('');
}
function save(){
  var b = box(); if (!b || F.busy) return;
  if (val('link')) { addLink(); if (val('link')) return; }
  var trades = Object.keys(F.trades).filter(function(t){ return F.trades[t]; });
  var title = val('title'), due = val('due');
  if (F.existing) { setErr('This lead / job is already on the bid portal — 📂 Manage it, or unlink it.'); return; }
  if (!title) { setErr('Give the job a title.'); return; }
  if (!trades.length) { setErr('Pick at least one trade we need priced.'); return; }
  if (F.vis === 'public' && !due) { setErr('A public job needs a bid due date (or post it 🔒 private).'); return; }
  if (!canAny() && !(F.link && canFor(F.link))) { setErr('As a PM, link it to one of your own leads or jobs first.'); return; }
  var lk = F.link, p = lk && lk.kind === 'pid' ? projAll().filter(function(x){ return s(x.id) === lk.id; })[0] : null, l = lk && lk.kind === 'leadId' ? leadsAll().filter(function(x){ return s(x.id) === lk.id; })[0] : null;
  var pmN = s(p && p.pm) || s(l && (l.pm || l.estimator)), pmU = arr(crm().users).filter(function(u){ return u && pmN && low(u.name) === low(pmN); })[0];
  var body = { op: 'postjob', jobId: '', pid: p ? s(p.id) : '', leadId: l ? s(l.id) : '', estId: '', title: title, address: val('address'), visibility: F.vis, trades: trades, due: due, dueTime: val('dueTime'),
    scope: val('scope'), specs: '', projectName: p ? [s(p.autoPO), s(p.name)].filter(Boolean).join(' · ') : '', po: s(p && p.autoPO), pmName: pmN, pmEmail: low(pmU && pmU.email) || low(p && p.pmEmail),
    files: F.files.map(function(f){ return { ref: f.ref, name: f.name, type: f.type, size: f.size, category: f.category }; }), links: F.links.slice(), source: 'new bid job' };
  var go = b.querySelector('[data-nb-a="save"]'); F.busy = true; setErr(''); if (go) { go.disabled = true; go.textContent = 'Posting…'; }
  return fn('bid-hub', body).then(function(r){
    F.busy = false;
    if (!r || !r.jobId) throw new Error((r && r.error) || 'The bid portal did not answer with the new job.');
    try { if (p && W._gcBidEst && W._gcBidEst.link) W._gcBidEst.link(r.jobId, s(p.id)); } catch (e) { warn(e); }
    close();
    toast('📢 On the bid portal — ' + (r.visibility === 'public' ? '🌐 public' : '🔒 private') + (r.files ? ' · ' + r.files + ' file(s) shared' : '') + (arr(r.notCopied).length ? ' · not copied: ' + r.notCopied.map(function(x){ return x.name; }).join(', ') : '') + ' — invite subs in 📂 Manage');
    try { var B = BPo(); if (B && B.jobs) B.jobs(true); } catch (e) {}
    try { if (W._gcSys && W._gcSys.bp) { W._gcSys.bp.load(true); if (W._gcSys.bp.freshFrame) W._gcSys.bp.freshFrame(); } } catch (e) {}
    try { if (W._gcSys2 && W._gcSys2.open) W._gcSys2.open(r.jobId, 'details'); } catch (e) { warn(e); }
    return r;
  }).catch(function(e){ F.busy = false; var g = box() && box().querySelector('[data-nb-a="save"]'); if (g) { g.disabled = !!F.existing; g.textContent = '📢 Put on bid portal'; }
    setErr(F.files.length && /\b50[234]\b|failed to fetch|timed? ?out|network/i.test(s(e && e.message)) ? 'The plan files took too long to copy (' + s(e && e.message) + '). The job is probably already on the bid portal — ↻ Refresh before trying again; add big plans as a Drive / Dropbox link.' : s(e && e.message) || 'Not posted.'); });
}
function onInput(ev){ var t = ev.target; if (t && t.getAttribute('data-nb') === 'q') { F.q = s(t.value); showHits(); } }
function onChange(ev){
  var t = ev.target; if (!t) return;
  if (t.name === 'gcnb-vis') { F.vis = t.value === 'public' ? 'public' : 'private'; var b = box(); if (b) b.querySelectorAll('.vis label').forEach(function(x){ var r = x.querySelector('input'); x.classList.toggle('on', !!(r && r.checked)); }); }
  if (t.hasAttribute('data-nb-file')) { var l = t.files; upload(l).then(function(){ try { t.value = ''; } catch (e) {} }); }
}
function onClick(ev){
  var t = ev.target && ev.target.closest ? ev.target.closest('[data-nb-a]') : null; if (!t) return;
  var a = t.getAttribute('data-nb-a'); ev.preventDefault(); ev.stopPropagation();
  if (a === 'cancel') return close();
  if (a === 'trade') { var k = t.getAttribute('data-t'); F.trades[k] = !F.trades[k]; t.classList.toggle('on', !!F.trades[k]); return; }
  if (a === 'addtrade') { var v = val('trade'); if (!v) return; F.trades[v] = 1; var o = keepVals(); o.trade = ''; draw(); putVals(o); return; }
  if (a === 'link') return pickLink({ kind: t.getAttribute('data-k') === 'pid' ? 'pid' : 'leadId', id: t.getAttribute('data-id') });
  if (a === 'unlink') { var u0 = keepVals(), A2 = F.auto || {}; Object.keys(A2).forEach(function(k){ if (u0 && u0[k] === A2[k]) u0[k] = ''; }); F.link = null; F.existing = null; F.auto = {}; draw(); putVals(u0); return; }
  if (a === 'manage') { var jid = t.getAttribute('data-job'); try { if (W._gcSys2 && W._gcSys2.open) return W._gcSys2.open(jid, 'details'); } catch (e) { warn(e); } return toast('The bid job manager is still loading — try again.', true); }
  if (a === 'upload') { var fi = box() && box().querySelector('[data-nb-file]'); if (fi) fi.click(); return; }
  if (a === 'addlink') return addLink();
  if (a === 'rmfile') { F.files.splice(+t.getAttribute('data-i'), 1); return redraw(); }
  if (a === 'rmlink') { F.links.splice(+t.getAttribute('data-i'), 1); return redraw(); }
  if (a === 'save') return save();
}
/* the button, in the screen's top bar (the bar is redrawn with the screen; this puts it back) */
function paint(){
  try {
    var bar = barOf(), old = bar && bar.querySelector('[data-nb-open]');
    if (!bar) return;
    if (!may()) { if (old) old.remove(); return; }
    if (old) return;
    css();
    var b = D.createElement('button'); b.type = 'button'; b.className = 'b pri'; b.setAttribute('data-nb-open', '1'); b.textContent = '＋ New bid job'; b.title = 'Put a new job on the bid portal by hand — title, address, due date, trades, scope, plans';
    b.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); open(); });
    var ob = bar.querySelector('[data-sys="openbids"]'); bar.insertBefore(b, ob ? ob : bar.firstChild);
  } catch (e) { warn(e); }
}
RI.call(W, function(){ if (!D.hidden) paint(); }, 1200); later(paint, 600);
W._gcNewBidJob = { open: open, close: close, paint: paint, may: function(){ MAY.at = 0; return may(); }, hits: hits, save: save, upload: upload,
  state: function(){ return { open: !!box(), vis: F.vis, trades: Object.keys(F.trades).filter(function(t){ return F.trades[t]; }), link: F.link, existing: F.existing ? F.existing.id : null, files: F.files.length, links: F.links.slice(), busy: F.busy }; } };
try { console.log('[GC] ＋ New bid job on the 🏗 Bid portal screen — _gcNewBidJob.state()'); } catch (e) {}
})(window, document);
</script>
