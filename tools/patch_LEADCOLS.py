#!/usr/bin/env python3
"""patch LEADCOLS — Leads → List: compact sortable columns and a 🗑 at the end of each row.

Owner: "I need more info on this list, due date, other columns; delete button at end, little trash can thing."
       + "priority on the column too" + "Bid to" (who we submit the bid to) instead of a Prime/Sub column.

Columns: Lead (name + address, the PRIMESUB badge beside the name) | Due | Priority | Bid to | Status | 🗑
  · every header sorts (tap again = reverse); blanks always last; default Due, soonest first
  · Due: overdue red, due within 3 days amber, "—" when none
  · Priority: the lead's own 1–10 (HOT2 l.priority, setPriority); a tap on the chip (admin, or the estimator on a
    bid) opens 1–10, saved on that lead only
  · Bid to: who we submit the bid to. The GCs for the project — its 🏢 Bidding to list (patch BIDSEND), the lead's
    due-to / GC, and the other leads for the same project (separate invitations from other GCs) — one GC → its
    name, several → "3 GCs" (hover / tap lists them); else the owner / agency (prime bid), else the inviting
    company, else the lead's company / customer; ellipsis, full name on hover
  · 🗑 (admin, office, estimators): an in-page "Delete this lead?" → the CRM's lead delete (_gcLDEL.remove: the
    tombstone, gone on every computer) → "Deleted · Undo" for 5 s (_gcLDEL.restore)
  · phone (≤ 640 px): one card per lead — name, address, badge, Due, 🗑
  · cost: derived values remembered per lead (id + updatedAt + the fields read); the first 60 rows, then "Show more"
Idempotent; every anchor must be found exactly once.
Usage: python3 tools/patch_LEADCOLS.py [index.html]
"""
import sys
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
src = open(path, encoding='utf-8').read()
MARK = '/* patch LEADCOLS v1 */'
if MARK in src:
    print('LEADCOLS: already patched'); sys.exit(0)

def one(old, new):
    global src
    n = src.count(old)
    assert n == 1, ('LEADCOLS anchor count %d != 1' % n, old[:80])
    src = src.replace(old, new)

# ── 1. the list view: the old 9-column table → listHtml() ─────────────────────────────────────────
A = "    var cols = [['name', 'Lead'], ['prio', '⭐ Priority']"
B = "(list.length ? '' : '<p style=\"color:#666\">No leads match.</p>');   /* patch LEADPERF-2 */\n"
assert src.count(A) == 1 and src.count(B) == 1
a = src.index(A); b = src.index(B, a) + len(B)
assert b - a < 8000, 'LEADCOLS: list block unexpectedly large'
src = src[:a] + "    return listHtml(list);   " + MARK + "\n" + src[b:]

LIST_JS = r'''/* patch LEADCOLS: Leads → List — Lead | Due | Priority | Bid to | Source | Status | 🗑 (sortable; phone: cards) */
var LC_COLS = [['name', 'Lead'], ['due', 'Due'], ['prio', 'Priority'], ['bidto', 'Bid to'], ['stage', 'Status']];
var LC_PAGE = 60, LC_ROW = {}, LC_N = 0, LC_GONE = {};
function lcCanDel(){ try { var L = W._gcLDEL, me = L && L.who && L.who(); return !!(me && me.email && (me.all || me.est)); } catch (e) { return false; } }
function lcBidTo(l, role){
  var C = W._gcBidRoleCore || {}, isPub = function(v){ try { return !!(C.isPublic && C.isPublic(v)); } catch (e) { return false; } };
  var str = function(v){ return v && typeof v === 'object' ? s(v.name || v.company) : s(v); };
  var due = s(l.dueToCompany); if (due) return due;
  var gc = s(l.gc), ow = s(l.owner);
  if (role === 'sub' && gc) return gc;
  if (role === 'prime') { if (ow) return ow; var so = s(l.source || l.leadSource); if (so && isPub(so)) return so; }
  if (gc) return gc;
  if (ow) return ow;
  if (role === 'sub') { var em = arr(l.emails); for (var i = 0; i < em.length; i++) { var fn0 = s(em[i] && em[i].fromName); try { if (fn0 && C.isCompany && C.isCompany(fn0)) return fn0; } catch (e) {} } }
  return str(l.company) || str(l.client) || str(l.customer) || str(l.customerName) || '';
}
function lcSig(l){ return [l.updatedAt, l.savedAt, l.stage, l.status, l.bidDue, l.priority, l.bidRole, l.name, l.title, l.address, l.city, l.source, l.leadSource, l.dueToCompany, l.gc, l.owner, typeof l.company === 'string' ? l.company : '', typeof l.client === 'string' ? l.client : '', l.inboxRev].join('|'); }
function lcRow(l){
  var id = s(l.id), sig = lcSig(l), r = LC_ROW[id];
  if (r && r.sig === sig) return r;
  if (++LC_N > 4000) { LC_ROW = {}; LC_N = 0; }
  var role = roleOfL(l), to = lcBidTo(l, role), st = stageOf(l), t = dueMs(l), p = prioOf(l), C = W._gcBidRoleCore || {}, gc = [];
  if (role !== 'prime') [s(l.dueToCompany), s(l.gc)].forEach(function(g){ var pb = false; try { pb = !!(C.isPublic && C.isPublic(g)); } catch (e) {} if (g && !pb) gc.push(g); });
  r = { sig: sig, to: to, stage: st, role: role, gc: gc, pk: (role === 'sub' || isBidL(l)) ? lcProjKey(l) : '',
    k: { name: low(l.name || l.title), due: isFinite(t) ? t : NaN, prio: p || NaN, bidto: low(to), stage: STAGES.indexOf(st) },
    name: esc(s(l.name || l.title) || 'Lead'), addr: esc([l.address, l.city].filter(Boolean).join(', ')), ic: srcIc(l) };
  return (LC_ROW[id] = r);
}
function lcProjKey(l){ var n = low(l.name || l.title).replace(/^((re|fw|fwd|itb)\s*:\s*|invitation to bid\s*:?\s*|bid invitation\s*:?\s*|request for (bid|proposal)\s*:?\s*)+/, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); return n.length >= 6 ? n : ''; }
function lcCoKey(c){ return low(c).replace(/&/g, ' and ').replace(/[.,']/g, '').replace(/\b(inc|llc|co|corp|corporation|company|ltd|lp|pllc)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
/* the GCs we bid each lead to: its own (due-to / GC), its 🏢 Bidding to list, and those of the other leads for the same project */
function lcGcGroups(){
  var B = null; try { B = W._gcBidSend && W._gcBidSend._S && W._gcBidSend._S.bidders; } catch (e) {}
  var byPk = {}, byId = {};
  rawLeads().forEach(function(l){
    if (dead(l)) return; var r = lcRow(l), own = {};
    var add = function(c){ c = s(c); var k = lcCoKey(c); if (k && !own[k]) own[k] = c; };
    r.gc.forEach(add);
    var rec = B && B['lead:' + l.id]; arr(rec && rec.list).forEach(function(b){ add(b && b.company); });
    byId[s(l.id)] = own;
    if (r.pk) { var g = byPk[r.pk] = byPk[r.pk] || {}; Object.keys(own).forEach(function(k){ if (!g[k]) g[k] = own[k]; }); }
  });
  return { pk: byPk, id: byId };
}
function lcBidCell(l, r, G){
  var own = G.id[s(l.id)] || {}, all = Object.assign({}, own, (r.pk && G.pk[r.pk]) || {}), names = Object.keys(all).map(function(k){ return all[k]; });
  if (names.length > 1) return { txt: names.length + ' GCs', names: names, k: low(names.length + ' gcs') };
  if (names.length === 1) return { txt: names[0], names: names, k: low(names[0]) };
  return { txt: r.to, names: [], k: low(r.to) };
}
function lcBlank(v){ return v == null || v === '' || v !== v; }
function lcSorted(list){
  var k = UI.lsort || 'due', dir = UI.ldir === -1 ? -1 : 1, G = lcGcGroups();
  var rows = list.map(function(l){ var r = lcRow(l), b = lcBidCell(l, r, G); return { l: l, r: r, b: b, kk: k === 'bidto' ? b.k : r.k[k] }; });
  var tie = function(a, b){ var x = a.r.k.due, y = b.r.k.due, bx = lcBlank(x), by = lcBlank(y); if (bx !== by) return bx ? 1 : -1; if (!bx && x !== y) return x - y; return a.r.k.name < b.r.k.name ? -1 : a.r.k.name > b.r.k.name ? 1 : 0; };
  rows.sort(function(a, b){ var x = a.kk, y = b.kk, bx = lcBlank(x), by = lcBlank(y);
    if (bx || by) return bx && by ? tie(a, b) : bx ? 1 : -1;
    return (x < y ? -1 : x > y ? 1 : 0) * dir || tie(a, b); });
  return rows;
}
var LC_TF = {};
function lcTime(t){ var k = String(t); if (LC_TF[k] === undefined) { if (Object.keys(LC_TF).length > 2000) LC_TF = {}; LC_TF[k] = new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(/\s?AM$/, 'a').replace(/\s?PM$/, 'p'); } return LC_TF[k]; }
function lcDue(l, r, now){
  var t = r.k.due; if (lcBlank(t)) return '<span class="gcl-dash">—</span>';
  var h = (t - now) / 36e5, raw = s(l.bidDue), timed = raw.length > 10;
  return '<span class="gcl-due' + (h < 0 ? ' od' : h < 72 ? ' soon' : '') + '" data-due="' + (h < 0 ? 'overdue' : h < 72 ? 'soon' : 'later') + '" title="Bid due ' + esc(raw.replace('T', ' ')) + (h < 0 ? ' — overdue' : '') + '">' + esc(shortDay(t) + (timed ? ' ' + lcTime(t) : '')) + '</span>';
}
function lcPrio(l){
  var p = prioOf(l), can = canPrio(l), cls = p >= 8 ? 'p-hi' : p >= 5 ? 'p-md' : p ? 'p-lo' : 'p-no';
  var tip = p ? 'Priority ' + p + ' of 10' : 'No priority yet';
  if (!can) return p ? '<span class="gcl-pc ' + cls + '" title="' + tip + '">P' + p + '</span>' : '<span class="gcl-dash">—</span>';
  return '<button type="button" class="gcl-pc ' + cls + '" data-gcl-lprio="' + esc(l.id) + '" title="' + tip + ' — tap to set 1–10">' + (p ? 'P' + p : '—') + '</button>';
}
function lcRowHtml(l, r, bc, del, asg, now){
  var id = esc(l.id), cell = function(c, v, tip){ return '<td class="c-' + c + '"' + (tip ? ' title="' + esc(tip) + '"' : '') + '>' + (v ? esc(v) : '<span class="gcl-dash">—</span>') + '</td>'; };
  return '<tr class="gcl-lr" data-gcl-id="' + id + '"><td class="c-name">'
    + (asg ? '<input type="checkbox" data-gcl-pick="' + id + '"' + (PICK[l.id] ? ' checked' : '') + ' aria-label="Select for bulk assign"> ' : '')
    + '<b>' + r.ic + ' ' + r.name + '</b> ' + roleChip(l) + (r.addr ? '<div class="gcl-addr">' + r.addr + '</div>' : '') + '</td>'
    + '<td class="c-due">' + lcDue(l, r, now) + '</td>'
    + '<td class="c-prio">' + lcPrio(l) + '</td>'
    + (bc.names.length > 1 ? '<td class="c-bidto" title="' + esc('Bid to ' + bc.names.length + ' GCs: ' + bc.names.join(' · ')) + '"><button type="button" class="gcl-gcs" data-gcl-gcs="' + esc(l.id) + '" data-names="' + esc(JSON.stringify(bc.names)) + '">🏢 ' + esc(bc.txt) + '</button></td>' : cell('bidto', bc.txt, bc.txt))
    + '<td class="c-stage">' + (STAGE_IC[r.stage] || '') + ' ' + esc(r.stage) + '</td>'
    + (del ? '<td class="gcl-tc"><button type="button" class="gcl-del" data-gcl-del="' + id + '" title="Delete this lead" aria-label="Delete this lead">🗑</button></td>' : '')
    + '</tr>';
}
function listHtml(list){
  list = list.filter(function(l){ return !LC_GONE[s(l.id)]; });
  var rows = lcSorted(list), del = lcCanDel(), asg = canAssignAll(), k = UI.lsort || 'due', dir = UI.ldir === -1 ? -1 : 1, now = Date.now();
  var npk = asg ? Object.keys(PICK).filter(function(id){ return PICK[id] && list.some(function(l){ return l.id === id; }); }).length : 0;   /* patch LROLEVIEW: bulk assign */
  return (asg ? '<div class="gcl-fil" style="margin:0 0 6px"><button type="button" class="gcl-mv" data-gcl-pickall>☑ Select all shown / none</button><button type="button" class="gcl-mv gcl-asg" data-gcl-bulkasg' + (npk ? '' : ' disabled') + '>👤 Assign selected (' + npk + ')…</button></div>' : '')
    + '<div class="gcl-wrap"><table class="gcl-list gcl-lc"><thead><tr>' + LC_COLS.map(function(c){ var on = k === c[0]; return '<th class="c-' + c[0] + '" data-gcl-lsort="' + c[0] + '"' + (on ? ' aria-sort="' + (dir > 0 ? 'ascending' : 'descending') + '"' : '') + ' title="Sort by ' + c[1] + '">' + c[1] + (on ? (dir > 0 ? ' ▲' : ' ▼') : '') + '</th>'; }).join('') + (del ? '<th class="gcl-tc"><span class="gcl-sr">Delete</span></th>' : '') + '</tr></thead><tbody>'
    + rows.slice(0, lim('list', LC_PAGE)).map(function(x){ return lcRowHtml(x.l, x.r, x.b, del, asg, now); }).join('')
    + '</tbody></table></div>' + moreBtn('list', rows.length, LC_PAGE) + (rows.length ? '' : '<p style="color:#666">No leads match.</p>');
}
function lcLead(id){ return leads().filter(function(x){ return x.id === id; })[0] || null; }
function lcAskDel(id){
  var l = lcLead(id); if (!l || !lcCanDel() || !W._gcLDEL) return;
  var old = D.getElementById('gcl-delq'); if (old) old.remove();
  var ov = D.createElement('div'); ov.id = 'gcl-delq'; ov.setAttribute('data-gc-keep', '1');
  ov.innerHTML = '<div class="b" role="dialog" aria-modal="true" aria-labelledby="gcl-delq-t"><div id="gcl-delq-t" class="q">Delete this lead?</div>'
    + '<div class="n">' + esc(s(l.name || l.title) || 'Lead') + '</div>'
    + '<div class="w">It is removed on every computer. Undo is offered for 5 seconds; after that an admin can bring it back from “Recently deleted” (30 days).</div>'
    + '<div class="a"><button type="button" data-a="cancel">Cancel</button><button type="button" data-a="delete">🗑 Delete</button></div></div>';
  function key(e){ if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } }
  function done(yes){ D.removeEventListener('keydown', key, true); ov.remove(); if (yes) lcDelete(id); }
  ov.addEventListener('click', function(e){ var a = e.target && e.target.getAttribute && e.target.getAttribute('data-a'); if (e.target === ov || a === 'cancel') done(false); else if (a === 'delete') done(true); });
  D.addEventListener('keydown', key, true);
  D.body.appendChild(ov);
  try { ov.querySelector('[data-a=cancel]').focus(); } catch (e) {}
}
function lcDelete(id){
  LC_GONE[id] = 1; redraw();
  Promise.resolve().then(function(){ return W._gcLDEL.remove([id], { silent: true }); }).then(function(res){
    if (!res || !res.ok) { delete LC_GONE[id]; redraw(); toast('Could not delete this lead — try again'); return; }
    HUB_SIG = ''; lcToast(id);
  }, function(){ delete LC_GONE[id]; redraw(); toast('Could not delete this lead — try again'); });
}
function lcToast(id){
  var old = D.getElementById('gcl-deltoast'); if (old) old.remove();
  var el = D.createElement('div'); el.id = 'gcl-deltoast'; el.setAttribute('data-gc-keep', '1'); el.setAttribute('role', 'status');
  el.innerHTML = '<span>Deleted</span><span style="opacity:.5">·</span><button type="button" data-a="undo">Undo</button>';
  el.querySelector('[data-a=undo]').onclick = function(){
    el.remove();
    Promise.resolve(W._gcLDEL.restore([id])).then(function(r){ delete LC_GONE[id]; HUB_SIG = ''; redraw(); toast(r && r.ok ? 'Lead restored' : 'Could not undo — use “Recently deleted”'); }, function(){ delete LC_GONE[id]; redraw(); });
  };
  D.body.appendChild(el);
  later(function(){ if (el.parentNode) el.remove(); }, 5000);
}
function lcPrioPop(btn){
  var id = btn.getAttribute('data-gcl-lprio'), l = lcLead(id); lcPopClose();
  if (!l || !canPrio(l)) return;
  var p = prioOf(l), pop = D.createElement('div'); pop.id = 'gcl-lprio-pop'; pop.setAttribute('data-gc-keep', '1'); pop.setAttribute('role', 'group'); pop.setAttribute('aria-label', 'Priority 1 to 10');
  var h = '<div class="t">Priority (10 = most important)</div>';
  for (var i = 1; i <= 10; i++) h += '<button type="button" class="gcl-pb' + (i === p ? ' on' : '') + (i >= 8 ? ' hi' : i >= 5 ? ' md' : '') + '" data-lp="' + i + '">' + i + '</button>';
  pop.innerHTML = h; pop.setAttribute('data-id', id);
  D.body.appendChild(pop);
  var bb = btn.getBoundingClientRect(), w = pop.offsetWidth, x = Math.max(8, Math.min(bb.left, (W.innerWidth || 800) - w - 8));
  pop.style.left = x + 'px'; pop.style.top = (bb.bottom + 4 + (W.scrollY || 0)) + 'px';
}
function lcGcsPop(btn){
  lcPopClose(); var names = []; try { names = JSON.parse(btn.getAttribute('data-names') || '[]'); } catch (e) {}
  var pop = D.createElement('div'); pop.id = 'gcl-lprio-pop'; pop.className = 'gcl-gcpop'; pop.setAttribute('data-gc-keep', '1'); pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'GCs we bid this project to');
  pop.innerHTML = '<div class="t">Bid to ' + names.length + ' GCs</div><ul>' + names.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';
  D.body.appendChild(pop);
  var bb = btn.getBoundingClientRect(), w = pop.offsetWidth, x = Math.max(8, Math.min(bb.left, (W.innerWidth || 800) - w - 8));
  pop.style.left = x + 'px'; pop.style.top = (bb.bottom + 4 + (W.scrollY || 0)) + 'px';
}
function lcPopClose(){ var p = D.getElementById('gcl-lprio-pop'); if (p) p.remove(); }
D.addEventListener('click', function(ev){
  var t = ev.target; if (!t || !t.closest) return;
  var pop = D.getElementById('gcl-lprio-pop');
  if (pop && pop.contains(t)) { var n = t.getAttribute('data-lp'); if (n) { ev.stopPropagation(); var pid = pop.getAttribute('data-id'); lcPopClose(); setPriority(pid, +n); } return; }
  if (pop && !t.closest('[data-gcl-lprio],[data-gcl-gcs]')) lcPopClose();
  var b = t.closest('[data-gcl-del],[data-gcl-lprio],[data-gcl-gcs],[data-gcl-lsort]'); if (!b || !b.closest('#gc-leads-hub')) return;
  ev.stopPropagation(); ev.preventDefault();   /* never the row click (that opens the lead) */
  if (b.hasAttribute('data-gcl-del')) return lcAskDel(b.getAttribute('data-gcl-del'));
  if (b.hasAttribute('data-gcl-lprio')) return lcPrioPop(b);
  if (b.hasAttribute('data-gcl-gcs')) return lcGcsPop(b);
  var c = b.getAttribute('data-gcl-lsort');
  if ((UI.lsort || 'due') === c) UI.ldir = UI.ldir === -1 ? 1 : -1; else { UI.lsort = c; UI.ldir = c === 'prio' ? -1 : 1; }
  saveUI(); redraw();
}, true);
D.addEventListener('keydown', function(ev){ if (ev.key === 'Escape') lcPopClose(); }, true);
'''
one("function bodyHtml(){\n", LIST_JS + "function bodyHtml(){\n")

# ── 2. CSS ─────────────────────────────────────────────────────────────────────────────────────────
CSS = r"""    '.gcl-wrap{overflow-x:auto}',
    /* patch LEADCOLS */
    '.gcl-lc th,.gcl-lc td{padding:6px 8px;font-size:12.5px;white-space:nowrap;vertical-align:middle}.gcl-lc th[aria-sort]{color:#241968}',
    '.gcl-lc td.c-name{white-space:normal;min-width:200px}.gcl-lc td.c-name input{margin:0 6px 0 0;vertical-align:-2px}.gcl-lc .gcl-addr{font-size:11px;color:#666;margin-top:1px}',
    '.gcl-lc td.c-bidto{max-width:220px;overflow:hidden;text-overflow:ellipsis}.gcl-gcs{border:1px solid #d6d3ea;background:#f6f5fb;color:#241968;border-radius:999px;padding:1px 9px;font:700 11.5px Arial;cursor:pointer;min-height:24px}.gcl-gcs:hover{border-color:#241968}',
    '.gcl-gcpop{display:block!important}.gcl-gcpop ul{margin:2px 0 0 16px;padding:0;font-size:13px;line-height:1.6}',
    '.gcl-dash{color:#9ca3af}.gcl-due{font-weight:700;border-radius:6px;padding:1px 6px}.gcl-due.od{color:#b91c1c;background:#fee2e2}.gcl-due.soon{color:#b45309;background:#fef3c7}',
    '.gcl-pc{display:inline-block;border:1px solid transparent;border-radius:999px;padding:1px 9px;font:700 11px Arial;background:#f3f4f6;color:#555;cursor:default;min-width:34px;text-align:center}button.gcl-pc{cursor:pointer;min-height:24px}button.gcl-pc:hover{border-color:#241968}',
    '.gcl-pc.p-hi{background:#fee2e2;color:#b91c1c}.gcl-pc.p-md{background:#fffbeb;color:#b45309}.gcl-pc.p-no{background:#fff;color:#9ca3af;border-color:#e5e7eb}',
    '.gcl-lc .gcl-tc{width:1%;text-align:right;padding:2px 4px}.gcl-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}',
    '.gcl-del{border:0;background:none;cursor:pointer;font-size:15px;opacity:.5;padding:4px 6px;border-radius:6px;min-width:34px;min-height:34px}.gcl-del:hover,.gcl-del:focus-visible{opacity:1;background:#fee2e2}',
    '#gcl-lprio-pop{position:absolute;z-index:100200;background:#fff;border:1px solid #d6d3ea;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:8px;display:flex;flex-wrap:wrap;gap:4px;max-width:250px;font:12px Arial}#gcl-lprio-pop .t{width:100%;color:#555;margin-bottom:2px}',
    '#gcl-delq{position:fixed;inset:0;z-index:2147483600;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Arial,sans-serif}',
    '#gcl-delq .b{background:#fff;color:#111;border-radius:12px;width:min(420px,94vw);padding:18px 20px;box-shadow:0 12px 40px rgba(0,0,0,.35)}#gcl-delq .q{font-size:16px;font-weight:800;margin-bottom:6px}#gcl-delq .n{font-size:14px;margin-bottom:8px;word-break:break-word}#gcl-delq .w{font-size:12px;color:#7f1d1d;margin-bottom:14px}',
    '#gcl-delq .a{display:flex;gap:8px;justify-content:flex-end}#gcl-delq .a button{border-radius:7px;padding:9px 16px;font-weight:700;cursor:pointer;font-size:14px}#gcl-delq [data-a=cancel]{background:#0f2440;color:#fff;border:0}#gcl-delq [data-a=delete]{background:#fff;color:#b91c1c;border:1px solid #fca5a5}',
    '#gcl-deltoast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483500;background:#1f2937;color:#fff;border-radius:999px;padding:8px 10px 8px 16px;display:flex;gap:8px;align-items:center;font:600 14px Arial;box-shadow:0 6px 20px rgba(0,0,0,.25)}#gcl-deltoast button{background:#fff;color:#1f2937;border:0;border-radius:999px;padding:5px 12px;font-weight:700;cursor:pointer}',
    '@media (max-width:640px){.gcl-lc thead{display:none}.gcl-lc,.gcl-lc tbody{display:block;width:100%}.gcl-lc tr.gcl-lr{display:grid;grid-template-columns:auto 1fr auto;grid-template-areas:"n n t" "d d t";gap:4px 8px;padding:9px 10px;border-top:1px solid #f0eef8;align-items:center}.gcl-lc tr.gcl-lr td{display:none;max-width:none}#gc-leads-hub .gcl-lc tr.gcl-lr td{padding:0!important;border:0!important;background:none!important}#gc-leads-hub .gcl-lc td.c-name input[data-gcl-pick]{display:none}.gcl-lc tr.gcl-lr td.c-name{display:block;grid-area:n;min-width:0}.gcl-lc tr.gcl-lr td.c-due{display:block;grid-area:d}.gcl-lc tr.gcl-lr td.gcl-tc{display:block;grid-area:t;width:auto}.gcl-lc tr.gcl-lr td.c-due:has(.gcl-dash){display:none}}',
"""
one("    '.gcl-wrap{overflow-x:auto}',\n", CSS)

# ── 3. the list's own sort, remembered (default: Due, soonest first) ──────────────────────────────
one("role: /^(prime|sub|unset)$/.test(U.role) ? U.role : '' };",
    "role: /^(prime|sub|unset)$/.test(U.role) ? U.role : '', lsort: /^(name|due|prio|bidto|stage)$/.test(U.lsort) ? U.lsort : 'due', ldir: U.lsort && U.ldir === -1 ? -1 : 1 };   /* patch LEADCOLS */")
one("prio: UI.prio, role: UI.role }); }", "prio: UI.prio, role: UI.role, lsort: UI.lsort, ldir: UI.ldir }); }")
one("UI.sort = UI.sort === 'prio' ? 'born' : 'prio'; UI.dir = -1; saveUI();",
    "UI.sort = UI.sort === 'prio' ? 'born' : 'prio'; UI.dir = -1; UI.lsort = UI.sort === 'prio' ? 'prio' : 'due'; UI.ldir = UI.sort === 'prio' ? -1 : 1; saveUI();")
one("{ UI.due = '7'; ", "{ UI.due = '7'; UI.lsort = 'due'; UI.ldir = 1; ")
one("else if (k === 'today') { UI.v = 'list'; UI.sort = 'born'; UI.dir = -1; }",
    "else if (k === 'today') { UI.v = 'list'; UI.sort = 'born'; UI.dir = -1; UI.lsort = 'due'; UI.ldir = 1; }")

# ── 4. patch LDEL: estimators may delete (and Undo) too ───────────────────────────────────────────
one("  var pm = !admin && !office && /project\\s*manager|^pm$/i.test(role);\n",
    "  var pm = !admin && !office && /project\\s*manager|^pm$/i.test(role);\n"
    "  var est = !admin && !office && /estimat/i.test(role + ' ' + s(u.profile));   /* patch LEADCOLS: estimators delete leads too */\n")
one("  return { email: email, name: s(u.name), admin: admin, office: office, pm: pm, all: admin || office };\n",
    "  return { email: email, name: s(u.name), admin: admin, office: office, pm: pm, est: est, all: admin || office };\n")
one("function can(l, me){ me = me || who(); if (!me.email) return false; if (me.all) return true; return me.pm && mine(l, me); }",
    "function can(l, me){ me = me || who(); if (!me.email) return false; if (me.all || me.est) return true; return me.pm && mine(l, me); }")
one("    if (!(me.all || (me.pm && mine(e.rec, me)))) return;\n",
    "    if (!(me.all || me.est || (me.pm && mine(e.rec, me)))) return;\n")

open(path, 'w', encoding='utf-8').write(src)
print('LEADCOLS: patched')
