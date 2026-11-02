/* patch INBOXLIST ════════════════════════════════════════════════════════════════════════════════
   Owner (11/01, Leads → 📥 Lead Inbox): "don't like lead inbox being like this, I want to click and then it show that
   info from a list, make it simpler."
   The inbox is a compact LIST now — one 44 px row per lead (type · project · GC / source · city · due · status ·
   assigned), soonest due first, then newest; rows not opened yet are bold. A tap opens the lead's DETAIL PANEL (right
   side on a desk, full screen on a phone; ✕ / Esc / ‹ Back close it, ↑ / ↓ move between leads) with everything the
   old card had: chips, due + ✏️ Fix, one row of actions (Create bid job, Assign, Publish, Not interested, ✉ E-mail,
   Merge), details, the links de-duplicated (one "Open on BuildingConnected", one PlanHub; tracking / unsubscribe links
   under "More links"), "Why this due date", the plans note and the drop zone. Every action is the card's own (same
   data-a, same dialogs). The five filters sit behind one search box + "Filters".
   The panel element is the card (class "card", data-id) so everything that decorates or listens on inbox cards
   (LA's due editor, the sub portal's "Upload plans", the drop zone) works on it unchanged.
   Kill switch: localStorage gc_ldi_cards = '1' brings back the card grid (renderCards).
   ══════════════════════════════════════════════════════════════════════════════════════════════════ */
var LX = { open: '', ix: -1, ids: [], q: '', lim: 200, t: { list: 0, pane: 0, n: 0 } };
var K_READ = 'gc_ldi_read_v1', LX_READ = lsGet(K_READ, {}) || {};
function lxOff(){ try { return localStorage.getItem('gc_ldi_cards') === '1'; } catch (e) { return false; } }
function lxSet(el, h){ if (el && el.__h !== h) { el.__h = h; el.innerHTML = h; return true; } return false; }
function lxNow(){ try { return performance.now(); } catch (e) { return Date.now(); } }
function lxRead(id){ return !!LX_READ[id]; }
function lxMarkRead(id){
  if (!id || LX_READ[id]) return; LX_READ[id] = Date.now();
  var k = Object.keys(LX_READ); if (k.length > 600) { k.sort(function(a, b){ return LX_READ[a] - LX_READ[b]; }).slice(0, k.length - 500).forEach(function(x){ delete LX_READ[x]; }); }
  lsSet(K_READ, LX_READ);
}
var LX_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], LX_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/* "Tue Nov 3 · 12 PM" (the bid due is the board's wall time, read the way the card read it) */
function lxShort(d){
  d = s(d); if (!d) return ''; var t = new Date(d.length === 10 ? d + 'T12:00:00' : d); if (isNaN(t)) return d;
  var out = LX_DAY[t.getDay()] + ' ' + LX_MON[t.getMonth()] + ' ' + t.getDate();
  if (d.length > 10) { var h = t.getHours(), m = t.getMinutes(); out += ' · ' + ((h % 12) || 12) + (m ? ':' + ('0' + m).slice(-2) : '') + ' ' + (h < 12 ? 'AM' : 'PM'); }
  return out;
}
function lxDue(l){
  if (l.websiteLead && !s(l.bidDue)) { var r = s(l.receivedAt || l.createdAt); return { txt: r ? 'Website · ' + lxShort(r.slice(0, 10)).replace(/^\w+ /, '') : 'Website form', cls: 'none' }; }
  var n = daysLeft(l.bidDue);
  if (n == null) return { txt: 'No due date', cls: 'none' };
  if (n < 0) return { txt: lxShort(l.bidDue) + ' · past', cls: 'past' };
  return { txt: lxShort(l.bidDue), cls: n <= 2 ? 'hot' : n <= 7 ? 'warm' : 'ok' };
}
function lxCity(l){
  var c = [s(l.city), s(l.state)].filter(Boolean).join(', '); if (c) return c;
  var m = /,\s*([^,\d][^,]*?),\s*([A-Z]{2})\b[^,]*$/.exec(s(l.address)); return m ? m[1] + ', ' + m[2] : '';
}
function lxGc(l){ return isRs(l) ? s(l.company) || 'RoofScout' : s(l.gc) || s(l.owner) || s(l.company) || srcOf(l); }
function lxRole(l){ try { return window._gcPrimeSub ? s(window._gcPrimeSub.of(l)) : ''; } catch (e) { return ''; } }
function lxType(l){
  var r = lxRole(l);
  if (r === 'sub') return { t: '🔧 SUB', c: 'r-sub' };
  if (r === 'prime') return { t: '🏛 PRIME', c: 'r-prime' };
  if (/emergenc/i.test([l.inboxFlag, l.name, l.type, l.priorityLabel].join(' '))) return { t: '🚨 EMERGENCY', c: 'r-emg' };
  if (isRs(l)) return { t: 'RoofScout', c: 'r-rs' };
  if (l.websiteLead) return { t: 'Website', c: 'r-web' };
  var k = kindOf(l); return { t: k, c: 'r-' + k.toLowerCase() };
}
function lxWho(l){
  var br = window._gcBidRole, p = '', e = '';
  try { if (br && br.isBid(l)) { p = s(br.pmOf(l)); e = s(br.estOf(l)); } else p = s(l.pm); } catch (x) { p = s(l.pm); }
  return p ? { t: p, w: 'PM' } : e ? { t: e, w: 'Estimator' } : { t: '', w: '' };
}
function lxStatus(l, p){
  if (p && p.state === 'published') return { t: 'On bid portal', c: 'st-on' };
  if (l.pid) return { t: 'Bid job', c: 'st-job' };
  if (isNew(l)) return { t: 'New', c: 'st-new' };
  if (p && p.state === 'queued') return { t: 'Draft (waiting)', c: 'st-dr' };
  if ((p && p.jobId && p.state !== 'removed') || l.bidPortalJob) return { t: 'Draft', c: 'st-dr' };
  return { t: 'Assigned', c: 'st-as' };
}
function lxHay(l){
  return low([l.name, l.gc, l.owner, l.company, l.city, l.state, l.address, srcOf(l), arr(l.trades).join(' '), l.bidNumber, l.contactName, l.contact, l.pm, l.estimator, l.scope, kindOf(l), lxRole(l), l.inboxFlag].join(' '));
}
function lxList(){
  var all = filtered(), q = low(LX.q);
  if (!q) return all;
  var words = q.split(/\s+/).filter(Boolean);
  return all.filter(function(l){ var h = lxHay(l); return words.every(function(w){ return h.indexOf(w) >= 0; }); });
}
function lxItems(){ var m = {}; arr(S.items).forEach(function(x){ if (x && x.id) m[x.id] = x; }); return m; }
function lxRow(l, im){
  var it = l.inboxId ? im[l.inboxId] : null, p = it && it.portal || null;
  var ty = lxType(l), du = lxDue(l), st = lxStatus(l, p), who = lxWho(l), gc = lxGc(l), city = lxCity(l);
  var un = isNew(l) && !lxRead(l.id), on = LX.open === l.id;
  return '<div class="lx-row' + (un ? ' un' : '') + (on ? ' on' : '') + '" data-a="open" data-id="' + esc(l.id) + '" role="button" tabindex="0" aria-label="' + esc(l.name + ', due ' + du.txt) + '">'
    + '<span class="c-ty"><span class="lx-chip ' + ty.c + '">' + esc(ty.t) + '</span></span>'
    + '<span class="c-nm" title="' + esc(l.name) + '">' + esc(l.name) + '</span>'
    + '<span class="c-gc" title="' + esc([l.gc && 'GC: ' + l.gc, 'from ' + srcOf(l)].filter(Boolean).join(' · ')) + '">' + esc(gc) + '</span>'
    + '<span class="c-ci">' + esc(city) + '</span>'
    + '<span class="c-du ' + du.cls + '"><i class="dot"></i><span>' + esc(du.txt) + '</span></span>'
    + '<span class="c-st"><span class="st ' + st.c + '">' + esc(st.t) + '</span></span>'
    + '<span class="c-as" title="' + esc(who.w) + '">' + esc(who.t || '—') + '</span>'
    + '<span class="c-mt">' + esc([gc, city].filter(Boolean).join(' · ')) + ' <span class="lx-chip ' + ty.c + '">' + esc(ty.t) + '</span>' + (st.c !== 'st-new' ? ' <span class="st ' + st.c + '">' + esc(st.t) + '</span>' : '') + '</span>'
    + '</div>';
}
/* ── links: one per board, the rest (other RFPs, homepages, tracking, unsubscribe) under "More links" ── */
function lxBoard(x){
  var b = s(x.board), u = low(x.url), lb = low(x.label);
  if (/buildingconnected/.test(u) || /^buildingconnected$/i.test(b)) return 'BuildingConnected';
  if (/planhub/.test(u) || /planhub/.test(lb) || /^planhub$/i.test(b)) return 'PlanHub';
  if (/aandbplanroom|a&b planroom/.test(u + ' ' + low(b))) return 'A&B Planroom';
  if (/rkaplanroom|rka planroom/.test(u + ' ' + low(b))) return 'RKA Planroom';
  if (/^roofscout$/i.test(b)) return 'RoofScout';
  return '';
}
function lxJunk(x){
  var u = s(x.url), lb = low(x.label), path = '';
  try { path = new URL(u).pathname; } catch (e) {}
  if (/unsubscribe|opt[- ]?out|preferences|manage (your )?(notifications?|e-?mails?|subscriptions?)|privacy|terms of/.test(lb)) return true;
  if (/unsubscribe|optout|\/asm\/|\/wf\/open|\/open\?|\/pixel|\/beacon/i.test(u)) return true;
  if (/^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+\/?$/i.test(s(x.label))) return true;   /* a bare host as its label */
  if (!path || path === '/') return true;   /* a homepage */
  if (/utm_(source|medium|campaign)=/i.test(u) && !/goto|project|rfp|bid/i.test(path)) return true;   /* a newsletter link */
  return false;
}
function lxScore(x){ var lb = low(x.label); return /view|project|files|details|bidding|invite/.test(lb) ? 3 : /rfp/.test(lb) ? 2 : /reply|send bid/.test(lb) ? 0 : 1; }
function lxLinks(l){
  var main = [], more = [], seen = {}, boards = {}, order = [], labels = {};
  arr(l.plansLinks).forEach(function(x){
    if (!x || !s(x.url)) return;
    var key = s(x.url).replace(/#.*$/, '').replace(/\/$/, ''); if (seen[key]) return; seen[key] = 1;
    if (lxJunk(x)) { more.push(x); return; }
    var b = lxBoard(x);
    if (b) { if (!boards[b]) { boards[b] = []; order.push(b); } boards[b].push(x); return; }
    var lk = low(x.label || x.board); if (lk && labels[lk]) { more.push(x); return; } labels[lk] = 1;
    main.push({ url: x.url, label: (x.label || x.board || 'Link') + ' ↗', title: x.url });
  });
  var top = order.map(function(b){
    var g = boards[b], best = g[0];
    g.forEach(function(x){ if (lxScore(x) > lxScore(best)) best = x; });
    g.forEach(function(x){ if (x !== best) more.push(x); });
    return { url: best.url, label: (b === 'RoofScout' ? 'Open in RoofScout' : 'Open on ' + b) + ' ↗', title: (best.label ? best.label + ' — ' : '') + best.url };
  });
  return { main: top.concat(main), more: more };
}
function lxLinksHtml(l){
  var L = lxLinks(l), h = '';
  L.main.forEach(function(x){ h += '<a href="' + esc(x.url) + '" target="_blank" rel="noopener" title="' + esc(x.title) + '">' + esc(x.label) + '</a>'; });
  arr(l.docs).forEach(function(d){
    if (!d || !d.ref) return;
    h += '<a href="' + esc(d.ref) + '" data-name="' + esc(d.name) + '" title="' + esc(d.name) + '">📄 ' + esc((d.addendum ? 'Add. ' : '') + d.name) + '</a>';
    if (isPlanFile(d)) h += '<button type="button" data-a="takeoff" data-ref="' + esc(d.ref) + '" data-name="' + esc(d.name) + '" data-type="' + esc(d.type) + '" title="Open in the Estimate Builder\'s plan takeoff">📐 Takeoff</button>';
  });
  var m = '';
  if (L.more.length) m = '<details class="px-more"><summary>More links (' + L.more.length + ')</summary><div class="docs">'
    + L.more.map(function(x){ var lb = s(x.label) || s(x.board) || s(x.url).replace(/^https?:\/\//, '').slice(0, 40); return '<a href="' + esc(x.url) + '" target="_blank" rel="noopener" title="' + esc(x.url) + '">' + esc(lb) + ' ↗</a>'; }).join('') + '</div></details>';
  return { main: h, more: m, n: L.main.length + arr(l.docs).length, nMore: L.more.length };
}
function lxDl(rows){ rows = rows.filter(function(r){ return r && r[1]; }); return rows.length ? '<dl class="px-dl">' + rows.map(function(r){ return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>' : ''; }
function lxContact(name, phone, email){
  var b = [];
  if (s(name)) b.push(esc(name));
  if (s(phone)) b.push('<a href="tel:' + esc(s(phone).replace(/[^\d+]/g, '')) + '">' + esc(phone) + '</a>');
  if (s(email)) b.push('<a href="mailto:' + esc(email) + '">' + esc(email) + '</a>');
  return b.join(' · ');
}
function lxPane(l, ix, n){
  var admin = isAdmin(), rs = isRs(l), c = countdown(l.bidDue), k = kindOf(l), p = portalOf(l);
  var bar = '<div class="px-bar"><button type="button" class="px-back" data-a="close" aria-label="Back">‹ Back</button>'
    + '<span class="px-pos">' + (ix >= 0 ? (ix + 1) + ' of ' + n : '') + '</span>'
    + '<button type="button" class="px-nav" data-a="prev" aria-label="Previous lead" title="Previous lead (↑)">↑</button>'
    + '<button type="button" class="px-nav" data-a="next" aria-label="Next lead" title="Next lead (↓)">↓</button>'
    + '<button type="button" class="px-x" data-a="close" aria-label="Close" title="Close (Esc)">✕</button></div>';
  var chips = rs ? '<span class="tg t-src">🏠 RoofScout</span><span class="tg t-' + k + '">' + k + '</span>'
    : (window._gcPrimeSub ? window._gcPrimeSub.badge(l) : '') + '<span class="tg t-src">' + esc(srcOf(l)) + '</span><span class="tg t-' + k + '">' + k + '</span>' + portalTag(l)
      + (l.inboxFlag ? '<span class="tg t-flag">' + esc(l.inboxFlag) + '</span>' : '') + (arr(l.alsoOn).length ? '<span class="tg t-also">also on ' + esc(l.alsoOn.join(', ')) + '</span>' : '')
      + (l.needsReview ? '<span class="tg t-flag">needs a look</span>' : '');
  var gcLine = [l.gc && 'GC: ' + l.gc, l.owner && l.owner !== l.gc && 'Owner: ' + l.owner].filter(Boolean).join(' · ');
  var addr = s(l.address) || [l.city, l.state].filter(Boolean).join(', ');
  var due = rs ? '' : (l.websiteLead && typeof window._gcWebCardLine === 'function' ? window._gcWebCardLine(l)
    : '<div class="due ' + c.cls + '">⏱ ' + esc(c.txt) + (s(l.bidDue).length === 10 ? ' · time not stated' : '') + (l.bidDueWas ? ' <span class="sub">(was ' + esc(fmtWhen(l.bidDueWas)) + ')</span>' : '') + (window._gcLA && window._gcLA.edit ? ' <button type="button" class="b" data-a="editdue" title="Correct the bid due date" style="padding:2px 8px;font-size:12px;min-height:28px">✏️ ' + (l.bidDue ? 'Fix' : 'Add it') + '</button>' : '') + '</div>');
  var top = '<div class="px-top"><div class="tags">' + chips + '</div><h3 class="ttl">' + esc(l.name) + '</h3>'
    + (gcLine ? '<div class="sub">' + esc(gcLine) + '</div>' : '') + (addr ? '<div class="sub">📍 ' + esc(addr) + '</div>' : '')
    + due + (l.preBid ? '<div class="sub">Pre-bid: ' + esc(fmtWhen(l.preBid)) + '</div>' : '') + '</div>';
  var acts;
  if (rs) acts = '<div class="acts"><a class="b pri" href="' + esc(l.rsUrl || ('/roofscout/#lead=' + encodeURIComponent(l.rsLeadId || ''))) + '" target="_blank" rel="noopener">Open in RoofScout ↗</a>'
    + (admin ? '<button type="button" class="b gold" data-a="assign">' + (l.pm ? 'Change PM' : 'Assign PM') + '</button><button type="button" class="b no" data-a="dismiss">Not interested</button>' : '') + '</div>';
  else acts = '<div class="acts">' + (l.pid ? '<button type="button" class="b pri" data-a="openjob">Open bid job</button>' : '<button type="button" class="b pri" data-a="job">✅ Create bid job</button>')
    + (admin ? '<button type="button" class="b gold" data-a="assign">' + (window._gcBidRole ? window._gcBidRole.btn(l) : (l.pm ? 'Change PM' : 'Assign PM')) + '</button>' : '')
    + (admin && l.inboxId && !l.websiteLead && !(p && /published|removed/.test(p.state)) ? '<button type="button" class="b bp" data-a="publish" title="Approved subs see it on bids.grayco-cs.com and can bid">Publish to bid portal</button>' : '')
    + (admin ? '<button type="button" class="b no" data-a="dismiss">Not interested</button>' : '')
    + (l.rawEmailRef ? '<a class="b" href="' + esc(l.rawEmailRef) + '" data-name="bid e-mail.txt" title="The bid e-mail as it came in">✉ E-mail</a>' : '')
    + (admin ? '<button type="button" class="b" data-a="merge">Merge with…</button>' : '') + '</div>';
  var sg = rs ? { name: '' } : suggestPm(l), rem = rs ? null : reminders().filter(function(x){ return x.leadId === l.id; })[0];
  var whoLine = rs ? (l.pm ? 'PM: <b>' + esc(l.pm) + '</b>' : '') : ((window._gcBidRole && window._gcBidRole.isBid(l)) ? window._gcBidRole.cardLine(l).replace(/^<div class="sub">|<\/div>$/g, '')
    : (l.pm ? 'PM: <b>' + esc(l.pm) + '</b>' + (l.pid ? ' · bid job created' : '') : (sg.name ? 'Suggested PM: ' + esc(sg.why) : '')));
  var det = rs ? lxDl([['Roof', esc([l.roofType, l.areaSqft && Math.round(l.areaSqft).toLocaleString() + ' ft²', l.condition != null && l.condition !== '' && 'condition ' + l.condition + '/100', l.rsStage].filter(Boolean).join(' · '))],
      ['Contact', lxContact([l.contact, l.company].filter(Boolean).join(' · '), l.phone, l.email)], ['Assigned', whoLine]])
    : lxDl([['Trades', esc(arr(l.trades).join(', '))], ['Bid #', esc(l.bidNumber)], ['Scope', s(l.scope) ? '<span class="px-scope">' + esc(s(l.scope).slice(0, 600)) + '</span>' : ''],
      ['Contact', lxContact(l.contactName, l.phone, l.email)],
      ['Due to', lxContact([l.dueToCompany, l.dueToContact].filter(Boolean).join(' · '), l.dueToPhone, l.dueToEmail)],
      ['Source', esc([srcOf(l)].concat(arr(l.sources).filter(function(x){ return x && x !== srcOf(l); })).join(', '))], ['Assigned', whoLine]]);
  var lk = rs ? null : lxLinksHtml(l);
  var why = (!rs && (s(l.dueSnippet) || l.bidDueWas)) ? '<details class="px-why"><summary>Why this due date</summary>'
    + (s(l.dueSnippet) ? '<div class="sub" style="font-style:italic">found in the e-mail: “' + esc(s(l.dueSnippet)) + '”</div>' : '')
    + (l.bidDueWas ? '<div class="sub">It was ' + esc(fmtWhen(l.bidDueWas)) + ' before the last e-mail changed it.</div>' : '') + '</details>' : '';
  return bar + top + acts
    + '<section class="px-sec"><h4>Details</h4>' + (det || '<div class="sub">Nothing more on this lead.</div>') + (rem ? '<div class="rem">⏰ To-do for ' + esc(rem.pm) + ': ' + esc(rem.title) + '</div>' : '') + '</section>'
    + (lk && (lk.main || lk.more) ? '<section class="px-sec"><h4>Links</h4>' + (lk.main ? '<div class="docs">' + lk.main + '</div>' : '') + lk.more + '</section>' : '')
    + why
    + (!rs && boardOnly(l) ? '<div class="note">Plans are behind the board\'s sign-in, so they can\'t be fetched automatically. Open the board and download them, then drop them below — or forward the plans e-mail to leads@grayco-cs.com.</div>' : '')
    + (!rs && arr(l.matchNotes).length ? '<div class="note">' + esc(arr(l.matchNotes).join('\n')) + '</div>' : '')
    + (rs ? '' : '<div class="drop" data-drop="lead">Drop plan files here</div>');
}
function lxFilterCount(){ return (UI.show && UI.show !== 'open' ? 1 : 0) + (UI.src ? 1 : 0) + (UI.type ? 1 : 0) + (UI.role ? 1 : 0) + (UI.due ? 1 : 0); }
function lxSkel(root){
  if (root.__lx && root.__lx.parentNode === root && root.firstElementChild === root.__lx) return root.__lx;
  root.innerHTML = '<div class="lx-skel"><div class="lx-hd"></div><div class="lx-msg"></div><div class="lx-body">'
    + '<div class="lx-tools"><input type="search" class="lx-q" placeholder="Search leads — project, GC, city, trade…" aria-label="Search the Lead Inbox" autocomplete="off">'
    + '<button type="button" class="b lx-fbtn" data-a="filters" aria-expanded="false">Filters</button><button type="button" class="b lx-fclr" data-a="fclear" style="display:none">✕ Clear filters</button><span class="lx-cnt"></span></div>'
    + '<div class="fl lx-fl"></div><div class="lx-wrap"><div class="lx-list"></div></div></div></div>';
  root.__lx = root.firstElementChild;
  root.__lx.querySelector('.lx-q').value = LX.q;
  return root.__lx;
}
function lxRenderList(root, sk){
  var t0 = lxNow(), list = lxList(), im = lxItems();
  LX.ids = list.map(function(l){ return l.id; });
  var h = '';
  if (list.length) {
    h = '<div class="lx-head" aria-hidden="true"><span class="c-ty">Type</span><span class="c-nm">Project</span><span class="c-gc">GC / source</span><span class="c-ci">City</span><span class="c-du">Due</span><span class="c-st">Status</span><span class="c-as">Assigned</span></div>'
      + list.slice(0, LX.lim).map(function(l){ return lxRow(l, im); }).join('')
      + (list.length > LX.lim ? '<div class="lx-more"><button type="button" class="b pri" data-a="lxmore">Show ' + Math.min(200, list.length - LX.lim) + ' more (' + (list.length - LX.lim) + ' not shown)</button></div>' : '');
  } else h = '<div class="empty">' + (LX.q ? 'No lead matches “' + esc(LX.q) + '”.' : UI.show === 'new' ? 'No new leads right now. New ones arrive from leads@grayco-cs.com, the public bid sites and RoofScout — they show up here when the CRM is opened, and admins get an e-mail.' : 'Nothing matches these filters.') + '</div>';
  lxSet(sk.querySelector('.lx-list'), h);
  var cnt = sk.querySelector('.lx-cnt'), ct = list.length + ' lead' + (list.length === 1 ? '' : 's'); if (cnt.textContent !== ct) cnt.textContent = ct;
  LX.t.list = Math.round(lxNow() - t0); LX.t.n = list.length;
}
/* the panel's home: next to the list on a desk; on a phone a full-screen layer straight under <body> (#gc-ldi-ph) --
   inside the Leads screen it would sit under the app's header, bottom bar and the screen's own layer, and patch NAV's
   phone Back would close the whole Leads screen instead of the panel */
var LX_PH = null;
function lxPhone(){ return !!(window.matchMedia && window.matchMedia('(max-width: 899px)').matches); }
function lxPhoneHost(){
  if (!LX_PH) {
    LX_PH = document.createElement('div'); LX_PH.id = 'gc-ldi-ph'; LX_PH.setAttribute('data-gc-keep', '1');
    LX_PH.addEventListener('click', onClick); LX_PH.addEventListener('change', onChange); LX_PH.addEventListener('keydown', lxRowKey);
    dropHandlers(LX_PH, function(d, fl){ var c = d.closest('.card'); var id = c && c.getAttribute('data-id'); if (id) dropOnLead(id, fl).catch(function(e){ toast(s(e.message), true); }); });
  }
  if (LX_PH.parentNode !== document.body) document.body.appendChild(LX_PH);
  lxWrapPicker();
  return LX_PH;
}
function lxPhoneOff(){ if (LX_PH && LX_PH.parentNode) LX_PH.parentNode.removeChild(LX_PH); try { document.body.classList.remove('gc-ldi-ph-on'); } catch (e) {} }
/* the phone / browser Back: patch NAV sees the phone panel as a full-screen layer and closes it with its ‹ Back. In field
   view NAV then puts the field job list back when no layer is left -- that would cover the Leads screen the panel was
   opened from, so for a moment after the panel closes that one call is skipped (the Leads screen stays). */
var LX_CLOSED_AT = 0;
function lxWrapPicker(){
  var f = window._gcJobPicker; if (typeof f !== 'function' || f.__lx) return;
  var w = function(){ if (Date.now() - LX_CLOSED_AT < 1500 && document.getElementById('gc-ldi')) return; return f.apply(this, arguments); };
  w.__lx = true; try { Object.keys(f).forEach(function(k){ w[k] = f[k]; }); } catch (e) {} window._gcJobPicker = w;
}
function lxMode(){ var root = document.getElementById('gc-ldi'); if (LX.open && root && root.__lx) lxRenderPane(root, root.__lx); }
function lxRenderPane(root, sk){
  var wrap = sk.querySelector('.lx-wrap'), pane = wrap.querySelector('.lx-pane') || (LX_PH && LX_PH.querySelector('.lx-pane'));
  var gone = function(){ if (pane) pane.remove(); wrap.classList.remove('has-pane'); lxPhoneOff(); };
  if (!LX.open) return gone();
  var l = inboxLeads().filter(function(x){ return x.id === LX.open; })[0];
  if (!l) { LX.open = ''; return gone(); }
  var t0 = lxNow(), ix = LX.ids.indexOf(l.id); if (ix >= 0) LX.ix = ix;
  if (!pane) { pane = document.createElement('div'); pane.className = 'lx-pane card'; pane.setAttribute('role', 'region'); pane.tabIndex = -1; }
  var phone = lxPhone(), host = phone ? lxPhoneHost() : wrap;
  if (pane.parentNode !== host) host.appendChild(pane);
  wrap.classList.toggle('has-pane', !phone);
  if (phone) { try { document.body.classList.add('gc-ldi-ph-on'); } catch (e) {} } else lxPhoneOff();
  var fresh = pane.getAttribute('data-id') !== l.id;
  pane.setAttribute('data-id', l.id); pane.setAttribute('aria-label', 'Lead: ' + s(l.name));
  lxSet(pane, lxPane(l, ix, LX.ids.length));
  if (fresh) pane.scrollTop = 0;
  LX.t.pane = Math.round(lxNow() - t0);
  return pane;
}
function lxSelRows(sk){
  Array.prototype.forEach.call(sk.querySelectorAll('.lx-row.on'), function(r){ if (r.getAttribute('data-id') !== LX.open) r.classList.remove('on'); });
  if (!LX.open) return null;
  var row = null, rows = sk.querySelectorAll('.lx-row');
  for (var i = 0; i < rows.length; i++) if (rows[i].getAttribute('data-id') === LX.open) { row = rows[i]; break; }
  if (row) { row.classList.add('on'); if (lxRead(LX.open)) row.classList.remove('un'); }
  return row;
}
function render(){
  if (lxOff()) { var r0 = document.getElementById('gc-ldi'); if (r0) r0.__lx = null; return renderCards(); }
  var root = document.getElementById('gc-ldi'); if (!root || !root.isConnected) return;
  var tb0 = document.getElementById('gc-leads-tabs'); if (!LDI_FORCE && LDI_DRAWN && tb0 && tb0.getAttribute('data-tab') !== 'bidboard') { LDI_DIRTY = true; return; }   /* hidden: drawn when the Bids tab opens */
  LDI_DIRTY = false; LDI_DRAWN = true; LDI_FORCE = false;
  var sk = lxSkel(root), n = newCount(), w = S.watch && S.watch.lastRun;
  lxSet(sk.querySelector('.lx-hd'), '<div class="hd"><b>📥 Lead Inbox</b>' + (n ? '<span class="cnt">' + n + ' new</span>' : '')
    + '<small class="lx-chk">' + (busy ? 'Checking…' : S.at ? 'Checked ' + new Date(S.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : 'Not checked yet') + (w ? ' · public bids looked at ' + new Date(w.at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '') + '</small><span class="sp"></span>'
    + '<button type="button" class="hb" data-a="refresh">↻ Check now</button>' + (isAdmin() ? '<button type="button" class="hb" data-a="settings" title="🔎 Bid boards — what the CRM watches, and keywords" aria-label="Bid boards settings">⚙</button>' : '')
    + '<button type="button" class="hb" data-a="fold" aria-label="' + (UI.open ? 'Fold the inbox' : 'Open the inbox') + '">' + (UI.open ? '▴' : '▾') + '</button></div>');
  lxSet(sk.querySelector('.lx-msg'), (lastErr ? '<div class="err">' + esc(lastErr) + '</div>' : '')
    + (isAdmin() && S.portal && S.portal.ready === false ? '<div class="info">Bid portal: ' + esc(S.portal.why || 'not set up yet') + (S.portal.queued ? ' — ' + S.portal.queued + ' draft' + (S.portal.queued === 1 ? '' : 's') + ' waiting; they are created there within the hour once it is set up.' : '') + '</div>' : ''));
  var body = sk.querySelector('.lx-body'); body.style.display = UI.open ? '' : 'none';
  if (!UI.open) return;
  var fc = lxFilterCount(), fb = sk.querySelector('.lx-fbtn'), ft = 'Filters' + (fc ? ' · ' + fc : '');
  if (fb.textContent !== ft) fb.textContent = ft; fb.setAttribute('aria-expanded', UI.fopen ? 'true' : 'false'); fb.classList.toggle('on', !!fc);
  var fx = sk.querySelector('.lx-fclr'), fxd = fc ? '' : 'none'; if (fx.style.display !== fxd) fx.style.display = fxd;   /* outside the selects: the page's typing guard holds a box whose select has the focus */
  var fl = sk.querySelector('.lx-fl'); fl.style.display = UI.fopen ? '' : 'none';
  if (UI.fopen) lxSet(fl, '<select data-f="show" aria-label="Which leads">' + opt('new', 'New', UI.show) + opt('open', 'All open', UI.show) + opt('assigned', 'Assigned', UI.show) + '</select>'
      + '<select data-f="src" aria-label="Source">' + opt('', 'All sources', UI.src) + SRC_LIST.map(function(x){ return opt(x, x, UI.src); }).join('') + '</select>'
      + '<select data-f="type" aria-label="Type">' + opt('', 'All types', UI.type) + ['Commercial', 'Insurance', 'Residential', 'Government'].map(function(x){ return opt(x, x, UI.type); }).join('') + '</select>'
      + (window._gcPrimeSub ? (function(){ var rc = { prime: 0, sub: 0, unset: 0 }, P = window._gcPrimeSub; inboxLeads().forEach(function(l){ if (UI.show === 'new' ? !isNew(l) : UI.show === 'assigned' ? isNew(l) : false) return; var r = P.of(l); if (r) rc[r]++; else if (!isRs(l) && typeof window._gcIsBidLead === 'function' && window._gcIsBidLead(l)) rc.unset++; });   /* patch PRIMESUB */
          return '<select data-f="role" aria-label="Prime or sub">' + opt('', 'Prime & sub', UI.role) + opt('prime', '🏛 Prime: to the owner (' + rc.prime + ')', UI.role) + opt('sub', '🔧 Sub: to a GC (' + rc.sub + ')', UI.role) + opt('unset', '❔ Not marked (' + rc.unset + ')', UI.role) + '</select>'; })() : '')
      + '<select data-f="due" aria-label="Due date">' + opt('', 'Any due date', UI.due) + opt('3', 'Due in 3 days', UI.due) + opt('7', 'Due in 7 days', UI.due) + opt('14', 'Due in 14 days', UI.due) + opt('past', 'Past due', UI.due) + opt('none', 'No date', UI.due) + '</select>');
  lxRenderList(root, sk);
  lxRenderPane(root, sk);
  lxSelRows(sk);
}
function lxOpen(id, focusPane){
  var root = document.getElementById('gc-ldi'); if (!root || !id) return;
  var sk = root.__lx; if (!sk) { LDI_FORCE = true; render(); sk = root.__lx; } if (!sk) return;
  LX.open = id; lxMarkRead(id);
  lxRenderPane(root, sk);
  var row = lxSelRows(sk);
  if (row) { try { row.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
  var pane = sk.querySelector('.lx-pane') || (LX_PH && LX_PH.querySelector('.lx-pane'));
  if (pane && focusPane !== false) { try { pane.focus({ preventScroll: true }); } catch (e) {} }
}
function lxClose(){
  var root = document.getElementById('gc-ldi'), sk = root && root.__lx, id = LX.open;
  if (LX_PH && LX_PH.isConnected) LX_CLOSED_AT = Date.now();
  LX.open = ''; if (!sk) return;
  lxRenderPane(root, sk); lxSelRows(sk);
  var rows = sk.querySelectorAll('.lx-row');
  for (var i = 0; i < rows.length; i++) if (rows[i].getAttribute('data-id') === id) { try { rows[i].focus({ preventScroll: true }); } catch (e) {} break; }
}
function lxMove(d){
  var ids = LX.ids; if (!ids.length) return;
  var i = ids.indexOf(LX.open), j;
  if (i >= 0) j = i + d;
  else j = LX.ix < 0 ? 0 : d > 0 ? LX.ix : LX.ix - 1;   /* the open lead left the list (filter / assigned): its old slot */
  j = Math.max(0, Math.min(ids.length - 1, j));
  if (j >= LX.lim) { LX.lim = j + 50; LDI_FORCE = true; render(); }
  lxOpen(ids[j]);
}
function lxBusy(){ return !!document.querySelector('.gc-ldi-ov, .gc-la-pop, #gc-role-menu, .gc-web-ov'); }
function lxShown(){ var r = document.getElementById('gc-ldi'); return !!(r && r.isConnected && r.getClientRects().length) || !!(LX_PH && LX_PH.isConnected); }
function lxKey(e){
  if (!LX.open || e.defaultPrevented || !lxShown() || lxBusy()) return;
  var t = e.target, typing = !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
  if (e.key === 'Escape' || e.key === 'Esc') {
    if (typing && !(t.closest && t.closest('#gc-ldi'))) return;
    if (typing && t.classList && t.classList.contains('lx-q') && t.value) return;   /* the search box clears itself first */
    e.preventDefault(); lxClose(); return;
  }
  if (typing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); lxMove(e.key === 'ArrowDown' ? 1 : -1); }
}
document.addEventListener('keydown', lxKey);
/* LA's bid-due editor (✏️ Fix) saves through the CRM's own setter: read the list again so the open panel and its row show the new date */
document.addEventListener('click', function(e){
  var t = e.target && e.target.closest && e.target.closest('.gc-la-pop [data-save]'); if (!t || !LX.open) return;
  [500, 1600].forEach(function(ms){ later(function(){ readList('_setLeads').then(function(){ LDI_FORCE = true; render(); }); }, ms); });
}, true);
try { var LX_MQ = window.matchMedia && window.matchMedia('(max-width: 899px)'); if (LX_MQ) { var lxm = function(){ lxMode(); }; if (LX_MQ.addEventListener) LX_MQ.addEventListener('change', lxm); else if (LX_MQ.addListener) LX_MQ.addListener(lxm); } } catch (e) {}
/* rows: Enter / Space opens, ↑ / ↓ walk the rows while the panel is shut */
function lxRowKey(e){
  var t = e.target; if (!t || !t.classList || !t.classList.contains('lx-row')) return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lxOpen(t.getAttribute('data-id')); return; }
  if (!LX.open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    var n = e.key === 'ArrowDown' ? t.nextElementSibling : t.previousElementSibling;
    if (n && n.classList.contains('lx-row')) { e.preventDefault(); n.focus(); }
  }
}
var lxQT = null;
function lxOnInput(e){
  var t = e.target; if (!t || !t.classList || !t.classList.contains('lx-q')) return;
  LX.q = s(t.value); LX.lim = 200;
  if (lxQT) clearTimeout(lxQT);
  lxQT = later(function(){ lxQT = null; var root = document.getElementById('gc-ldi'); if (root && root.__lx) { lxRenderList(root, root.__lx); lxSelRows(root.__lx); } }, 90);
}
/* one action of the inbox's own click handler (patch INBOXLIST); returns true when it was one of these */
function lxAct(a, id, b){
  if (a === 'open') { lxOpen(id); return true; }
  if (a === 'close') { lxClose(); return true; }
  if (a === 'prev') { lxMove(-1); return true; }
  if (a === 'next') { lxMove(1); return true; }
  if (a === 'filters') { UI.fopen = !UI.fopen; lsSet(K_UI, UI); render(); return true; }
  if (a === 'fclear') { UI.show = 'open'; UI.src = ''; UI.type = ''; UI.role = ''; UI.due = ''; lsSet(K_UI, UI); LX.lim = 200; try { if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#gc-ldi .lx-fl')) document.activeElement.blur(); } catch (e) {} render(); return true; }
  if (a === 'lxmore') { LX.lim += 200; render(); return true; }
  return false;
}
var LX_CSS = '#gc-ldi{overflow:clip}'
  + '#gc-ldi .hd{padding:6px 10px;gap:8px;flex-wrap:nowrap;min-height:40px}#gc-ldi .hd b{font-size:14px;white-space:nowrap}#gc-ldi .hd .cnt{white-space:nowrap}'
  + '#gc-ldi .hd small.lx-chk{min-width:0;flex:0 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;overflow-wrap:normal}#gc-ldi .hd .sp{flex:1 1 0;min-width:0}'
  + '#gc-ldi .hd .hb{min-height:30px;padding:4px 9px;white-space:nowrap;flex:0 0 auto}'
  + '#gc-ldi .lx-tools{display:flex;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid #e7e3f5;background:#f6f4fc}'
  + '#gc-ldi .lx-q{flex:1 1 auto;min-width:0;border:1px solid #cfc8ea;border-radius:8px;padding:7px 10px;font:inherit;font-size:14px;color:#1b1640;background:#fff;min-height:36px}'
  + '#gc-ldi .lx-fbtn,#gc-ldi .lx-fclr{flex:0 0 auto;min-height:36px}#gc-ldi .lx-fbtn.on{background:#efeafe;border-color:' + NAVY + '}#gc-ldi .lx-cnt{flex:0 0 auto;font-size:12px;color:#57527a;white-space:nowrap}'
  + '#gc-ldi .lx-fl{border-bottom:1px solid #e7e3f5}#gc-ldi .lx-wrap{display:block;min-width:0}'
  + '#gc-ldi .lx-list{container-type:inline-size;container-name:lx;min-width:0;background:#fff}'
  + '#gc-ldi .lx-row,#gc-ldi .lx-head{display:grid;grid-template-columns:104px minmax(0,2.3fr) minmax(0,1.4fr) minmax(0,1fr) 158px 108px minmax(0,1fr);column-gap:10px;align-items:center;padding:0 12px;min-width:0}'
  + '#gc-ldi .lx-head{height:30px;font-size:11px;font-weight:800;color:#6b6591;text-transform:uppercase;letter-spacing:.3px;border-bottom:1px solid #e7e3f5;background:#fbfaff}'
  + '#gc-ldi .lx-row{height:44px;border-bottom:1px solid #efedf7;font-size:13px;color:#2a2550;cursor:pointer;border-left:3px solid transparent;outline:none}'
  + '#gc-ldi .lx-row:hover{background:#f7f5ff}#gc-ldi .lx-row:focus-visible{box-shadow:inset 0 0 0 2px ' + NAVY + '}#gc-ldi .lx-row.on{background:#efeafe;border-left-color:' + NAVY + '}'
  + '#gc-ldi .lx-row>span,#gc-ldi .lx-head>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
  + '#gc-ldi .lx-row .c-nm{font-weight:500;color:#1b1640}#gc-ldi .lx-row.un .c-nm,#gc-ldi .lx-row.un .c-gc,#gc-ldi .lx-row.un .c-du{font-weight:800}#gc-ldi .lx-row.un .c-nm{color:#120d33}'
  + '#gc-ldi .lx-row .c-gc,#gc-ldi .lx-row .c-ci,#gc-ldi .lx-row .c-as{color:#57527a}#gc-ldi .c-mt{display:none}'
  + '#gc-ldi .c-du{display:flex;align-items:center;gap:6px}#gc-ldi .c-du>span{overflow:hidden;text-overflow:ellipsis}#gc-ldi .c-du .dot{flex:0 0 auto;width:9px;height:9px;border-radius:50%;background:#9ca3af;display:inline-block}'
  + '#gc-ldi .c-du.hot{color:#b91c1c}#gc-ldi .c-du.hot .dot{background:#dc2626}#gc-ldi .c-du.warm .dot{background:#d97706}#gc-ldi .c-du.ok .dot{background:#16a34a}'
  + '#gc-ldi .c-du.past,#gc-ldi .c-du.none{color:#8a86a3}#gc-ldi .c-du.none .dot{background:transparent;border:1.5px solid #b8b4cc}'
  + '#gc-ldi .lx-chip{display:inline-block;font-size:10.5px;font-weight:800;border-radius:5px;padding:2px 6px;background:#ece9fb;color:' + NAVY + ';max-width:100%;overflow:hidden;text-overflow:ellipsis;vertical-align:middle}'
  + '#gc-ldi .lx-chip.r-sub{background:#e0f2fe;color:#075985}#gc-ldi .lx-chip.r-prime{background:#fef3c7;color:#92400e}#gc-ldi .lx-chip.r-emg{background:#fee2e2;color:#991b1b}'
  + '#gc-ldi .lx-chip.r-insurance{background:#fee2e2;color:#991b1b}#gc-ldi .lx-chip.r-residential,#gc-ldi .lx-chip.r-web{background:#dcfce7;color:#166534}#gc-ldi .lx-chip.r-government{background:#f3e8ff;color:#6b21a8}'
  + '#gc-ldi .st{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px;background:#f1f5f9;color:#334155}'
  + '#gc-ldi .st-new{background:#dbeafe;color:#1e3a8a}#gc-ldi .st-on{background:#dcfce7;color:#166534}#gc-ldi .st-dr{background:#fff7ed;color:#9a3412}#gc-ldi .st-job{background:#ece9fb;color:' + NAVY + '}'
  + '#gc-ldi .lx-more{padding:10px 12px}#gc-ldi .lx-skel .empty{background:#fff}'
  + '@container lx (max-width: 820px){#gc-ldi .lx-row,#gc-ldi .lx-head{grid-template-columns:96px minmax(0,2fr) minmax(0,1.2fr) 150px 100px}#gc-ldi .lx-list .c-ci,#gc-ldi .lx-list .c-as{display:none}}'
  + '@container lx (max-width: 560px){#gc-ldi .lx-head{display:none}#gc-ldi .lx-row{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"nm du" "mt mt";height:auto;min-height:56px;row-gap:3px;padding:7px 12px}'
  + '#gc-ldi .lx-row .c-ty,#gc-ldi .lx-row .c-gc,#gc-ldi .lx-row .c-ci,#gc-ldi .lx-row .c-st,#gc-ldi .lx-row .c-as{display:none}#gc-ldi .lx-row .c-nm{grid-area:nm;font-size:14px}#gc-ldi .lx-row .c-du{grid-area:du;font-size:12px}'
  + '#gc-ldi .lx-row .c-mt{display:block;grid-area:mt;font-size:12px;color:#57527a}#gc-ldi .lx-row .c-mt .lx-chip,#gc-ldi .lx-row .c-mt .st{font-size:10px;padding:1px 5px}}'
  + '#gc-ldi .lx-pane.card{border:0;border-radius:0;padding:0 16px 18px;gap:10px;background:#fff;min-width:0;outline:none;overscroll-behavior:contain}'
  + '#gc-ldi .px-bar{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:6px;margin:0 -16px;padding:8px 12px;background:#fff;border-bottom:1px solid #eeeaf8}'
  + '#gc-ldi .px-bar button{border:1px solid #cfc8ea;background:#fff;color:' + NAVY + ';border-radius:8px;min-width:36px;min-height:36px;font-size:15px;font-weight:800}'
  + '#gc-ldi .px-back{display:none;padding:0 12px}#gc-ldi .px-pos{flex:1;font-size:12px;color:#6b6591}'
  + '#gc-ldi .px-top{display:flex;flex-direction:column;gap:5px;padding-top:4px}#gc-ldi .px-top .ttl{margin:2px 0 0;font-size:18px;line-height:1.25}'
  + '#gc-ldi .lx-pane .acts{gap:6px;padding:6px 0 4px;border-bottom:1px solid #eeeaf8;margin:0}#gc-ldi .lx-pane .acts .b{text-decoration:none;display:inline-flex;align-items:center}'
  + '#gc-ldi .px-sec h4{margin:0 0 6px;font-size:11px;letter-spacing:.4px;text-transform:uppercase;color:#6b6591}'
  + '#gc-ldi .px-dl{display:grid;grid-template-columns:84px minmax(0,1fr);gap:5px 10px;margin:0;font-size:12.5px}#gc-ldi .px-dl dt{color:#6b6591;font-weight:700}#gc-ldi .px-dl dd{margin:0;min-width:0;overflow-wrap:anywhere}'
  + '#gc-ldi .px-dl a{color:' + NAVY + '}#gc-ldi .px-scope{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}'
  + '#gc-ldi .lx-pane .docs a,#gc-ldi .lx-pane .docs button{font-size:12px;padding:5px 9px;min-height:30px;display:inline-flex;align-items:center}'
  + '#gc-ldi .px-more,#gc-ldi .px-why{font-size:12px;color:#57527a}#gc-ldi .px-more summary,#gc-ldi .px-why summary{cursor:pointer;font-weight:700;color:' + NAVY + ';padding:4px 0}#gc-ldi .px-more .docs{margin-top:4px}'
  + '@media (min-width:900px){#gc-ldi .lx-wrap.has-pane{display:grid;grid-template-columns:minmax(0,1fr) minmax(380px,42%);align-items:start}'
  + '#gc-ldi .lx-wrap.has-pane .lx-pane{position:sticky;top:8px;max-height:calc(100vh - 16px);overflow:auto;border-left:1px solid #e2ddf3;box-shadow:-6px 0 18px rgba(36,25,104,.06)}}'
  + '@media (max-width:899px){'
  + '#gc-ldi .px-bar{padding-top:calc(8px + env(safe-area-inset-top,0px))}#gc-ldi .px-back{display:inline-flex;align-items:center}#gc-ldi .px-x{display:none}#gc-ldi .lx-pane .acts .b{min-height:40px}}'
  + '@media (max-width:640px){#gc-ldi .hd small.lx-chk{display:none}#gc-ldi .lx-cnt{display:none}}';
LX_CSS += (CSS + LX_CSS).replace(/#gc-ldi(?![-\w])/g, '#gc-ldi-ph')   /* the same look for the phone layer */
  + '#gc-ldi-ph{position:fixed;inset:0;z-index:2147483000;margin:0;border:0;border-radius:0;background:#fff;color:#1b1640;overflow:hidden;max-width:none}'
  + '#gc-ldi-ph .lx-pane{position:absolute;inset:0;overflow:auto;padding-bottom:calc(18px + env(safe-area-inset-bottom,0px))!important}'
  + 'body.gc-ldi-ph-on .gc-la-pop,body.gc-ldi-ph-on #_gcComposeOv,body.gc-ldi-ph-on .gc-la-toast{z-index:2147483300!important}';
