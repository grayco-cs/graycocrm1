#!/usr/bin/env python3
"""Idempotent patch LEADBULK (owner 10/30, on the Leads screen, looking at "Ramble on Summer": "need to be able to mass
delete leads by clicking each one and deleting, and need to change this from residential to commercial").

1. ☐ Select on the Leads List and Board: a tick box on every lead the person may delete (admins and the office any
   lead, an estimator any lead, a PM only his own — the rules of the CRM's lead delete, _gcLDEL.can), "Select all shown",
   a tap on a row / card ticks it, and a bar at the bottom: "N selected · 🗑 Delete selected · Cancel". The delete asks
   first (how many, the first names), then goes through the CRM's own lead delete (_gcLDEL.remove: the delete list
   gc_tombstones via _gcxDel / _gcTombstone, the explicit-delete flag, the shared "deleted" record the Lead Inbox import
   and sync read) — so a deleted lead never comes back. Leads that are already jobs (pid / jobId) are skipped and the
   bar says so. Undo: the delete's own Undo, then Admin → Recycle bin → Restore (30 days); ⋯ More → 🗑 Recently deleted.
2. The lead panel's "🏠 residential" in the header is a menu: Residential · Commercial · Insurance · Government. The
   choice is saved like the panel's other changes (the same save, updatedAt / savedAt, to the cloud at once) and marked
   as a person's choice (leadKindManual: true, leadKindSetBy / leadKindSetAt) for the Lead Inbox import and routing.
3. "⏰ Bid" (Due / Bid to / 🏢 Bidding to) shows only on a bid: a commercial / government lead from the Lead Inbox or a
   bid source (or any lead that already has bid details). A residential CompanyCam lead's panel has no Bid section;
   its plans and distance move under "More on this lead"."""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch LEADBULK'
if MARK in t: print('LEADBULK: already patched'); sys.exit(0)
def once(old, new):
    global t
    n = t.count(old); assert n == 1, ('LEADBULK anchor', n, old[:90]); t = t.replace(old, new)

# ── LDEL: the Recently deleted box can be opened from the Leads screen ──
once("""W._gcLDEL = {
  ask: ask, remove: remove, restore: restore, trash: trash,""",
"""W._gcLDEL = {
  openTrash: openTrash,   """ + MARK + """: ⋯ More → 🗑 Recently deleted on the Leads screen */
  ask: ask, remove: remove, restore: restore, trash: trash,""")

# ── the hub: the type change is not "an inquiry" (an imported lead stays imported) ──
once("""  || arr(l.activity).some(function(a){ return a && !/^(priority|system|import|archive|restore|merge|assign)$/.test(s(a.type)); })""",
"""  || arr(l.activity).some(function(a){ return a && !/^(priority|system|import|archive|restore|merge|assign|type)$/.test(s(a.type)); })   """ + MARK + """: + type */""")

# ── the list row and the board card: the tick box ──
once("""  return '<tr class="gcl-lr" data-gcl-id="' + id + '"><td class="c-name">'
    + '<button type="button" class="gclu-nb" data-gclu-note=\"""",
"""  return '<tr class="gcl-lr' + bkRowCls(l) + '" data-gcl-id="' + id + '"><td class="c-name">' + bkChk(l)   """ + MARK + """ */
    + '<button type="button" class="gclu-nb" data-gclu-note=\"""")
once("""  return '<div class="gcl-card" draggable="true" data-gcl-id="' + esc(l.id) + '">'
    + '<div class="t">'""",
"""  return '<div class="gcl-card' + bkRowCls(l) + '" draggable="' + (bkOn() ? 'false' : 'true') + '" data-gcl-id="' + esc(l.id) + '">' + bkChk(l)   """ + MARK + """ */
    + '<div class="t">'""")

# ── the header: ☐ Select; ⋯ More: 🗑 Recently deleted; the "Select all shown" line ──
once("""    + '<span class="gclu-sp"></span>'
    + '<span class="gclu-mw">""",
"""    + '<span class="gclu-sp"></span>' + bkBtn()   """ + MARK + """ */
    + '<span class="gclu-mw">""")
once("""    + it('data-gclu-oldbb', '📋 Old Bid Board (archived, read-only)', 'The old manual bid list — its open bids are now leads')""",
"""    + it('data-gclu-oldbb', '📋 Old Bid Board (archived, read-only)', 'The old manual bid list — its open bids are now leads')
    + (bkAllowed() ? it('data-gclb-trash', '🗑 Recently deleted', 'Leads deleted in the last 30 days — Restore') : '')   """ + MARK + """ */""")
once("""    + '<div class="gcl-body gcl-hide-rso">' + (out ? '' : bodyHtml()) + '</div>';""",
"""    + '<div class="gcl-body gcl-hide-rso">' + (out ? '' : bkHead() + bodyHtml()) + '</div>';   """ + MARK + """ */""")

# ── the hub's "nothing changed, nothing drawn" signature: + select mode; ticks re-applied after a draw ──
once("""Object.keys(LC_GONE).length, LU.more, LU.adv, rsoOk(), Math.floor(Date.now() / 6e5)].join('|');""",
"""Object.keys(LC_GONE).length, LU.more, LU.adv, rsoOk(), (typeof BULK === 'object' && BULK ? BULK.on + ':' + BULK.v : ''), Math.floor(Date.now() / 6e5)].join('|');   """ + MARK + """ */""")
once("""  var hh = hubHtml(); if (hh !== hub.__gcHtml) { hub.__gcHtml = hh; held(function(){ hub.innerHTML = hh; }); watchMore(hub); }""",
"""  var hh = hubHtml(); if (hh !== hub.__gcHtml) { hub.__gcHtml = hh; held(function(){ hub.innerHTML = hh; }); watchMore(hub); if (bkOn()) bkSync(); }   """ + MARK + """ */""")

# ── the panel: the type menu in the header; Bid only on a bid ──
once("""' · ' + (TYPE_IC[typeOf(l)] || '') + ' ' + esc(typeOf(l)) + ' · ' + esc(srcOf(l)) + '</div></h3>""",
"""' · ' + kindPick(l) /* patch LEADBULK */ + ' · ' + esc(srcOf(l)) + '</div></h3>""")
once("""  if (k === 'stage') moveStage(l.id, t.value);
  if (k === 'assign' && t.value)""",
"""  if (k === 'stage') moveStage(l.id, t.value);
  if (k === 'kind') setKind(l.id, t.value);   """ + MARK + """ */
  if (k === 'assign' && t.value)""")
once("""  var old = drawerHtml0(l), hd = old.split('<section>')[0], adm = isAdmin(), r = lcRow(l), bc = lcBidCell(l, r, lcGcGroups());""",
"""  var old = drawerHtml0(l), hd = old.split('<section>')[0], adm = isAdmin(), r = lcRow(l), bc = lcBidCell(l, r, lcGcGroups()), bidOn = showBid(l);   """ + MARK + """ */""")
once("""    + '<section><h4>⏰ Bid</h4>'
    + (dueKv ? dueKv[0] : '')""",
"""    + (bidOn ? '<section><h4>⏰ Bid</h4>'   """ + MARK + """: a bid only */
    + (dueKv ? dueKv[0] : '')""")
once("""    + '<div class="gclu-plans"><div class="kv"><span>Plans & links:</span></div>' + secBody(pl) + '</div>'
    + '</section>'
    + '<section><h4>Contact</h4>'""",
"""    + '<div class="gclu-plans"><div class="kv"><span>Plans & links:</span></div>' + secBody(pl) + '</div>'
    + '</section>' : '')
    + '<section><h4>Contact</h4>'""")
once("""    + '<div class="gclu-ov">' + ovRest + (edit ? '<div class="row">' + edit[0] + '</div>' : '') + '</div>'""",
"""    + (bidOn ? '' : (d != null ? '<div class="kv"><span>Distance:</span> 📍 ' + esc(miTxt(d)) + ' from ' + (GEO.from === 'me' ? 'my location' : 'the office') + '</div>' : '') + '<div class="gclu-plans"><div class="kv"><span>Plans & links:</span></div>' + secBody(pl) + '</div>')   """ + MARK + """ */
    + '<div class="gclu-ov">' + ovRest + (edit ? '<div class="row">' + edit[0] + '</div>' : '') + '</div>'""")
once("""  var top = d.scrollTop, html = drawerHtml(l); held(function(){ d.innerHTML = html; }); d.scrollTop = top;""",
"""  var top = d.scrollTop, html = drawerHtml(l), nob = !showBid(l); held(function(){ d.innerHTML = html; if (nob) d.setAttribute('data-gcl-nobid', '1'); else d.removeAttribute('data-gcl-nobid'); }); d.scrollTop = top;   """ + MARK + """: 🏢 Bidding to hides with ⏰ Bid */""")

# ── the hub never shows a lead the CRM's delete blocks (the same inbox item / RoofScout id brought in again under another id) ──
once("""function isEstimatorMe(){ var u = meUser(); return !!(u && /estimat/i.test(s(u.role) + ' ' + s(u.profile))); }
function dead(l){ return !l || !l.id || l.deleted || l._deleted || (typeof W._gcIsTombstoned === 'function' && (function(){ try { return W._gcIsTombstoned('leads', l.id); } catch (e) { return false; } })()); }""",
"""function isEstimatorMe(){ var u = meUser(); return !!(u && /estimat/i.test(s(u.role) + ' ' + s(u.profile))); }
function dead(l){ return !l || !l.id || l.deleted || l._deleted || (typeof W._gcIsTombstoned === 'function' && (function(){ try { return W._gcIsTombstoned('leads', l.id); } catch (e) { return false; } })())
  || (!!W._gcLDEL && typeof W._gcLDEL.blocked === 'function' && (function(){ try { return !!W._gcLDEL.blocked(l); } catch (e) { return false; } })()); }   """ + MARK + """: + the delete guard's "brought in again" */""")

# ── the code ──
BLOCK = r"""
/* ═══ patch LEADBULK (owner 10/30) — ☐ Select + 🗑 Delete selected on the List / Board; the lead's type menu; Bid only on bids ═══ */
var BULK = { on: false, sel: {}, v: 0, loop: false };
function bkLead(id){ id = s(id); return rawLeads().filter(function(x){ return x && s(x.id) === id && !dead(x); })[0] || null; }
function bkJob(l){ return !!(l && (s(l.pid) || s(l.jobId) || s(l.convertedJobId) || l.converted === true)); }   /* already a job: never deleted from here */
function bkCan(l){ try { return !!(l && W._gcLDEL && typeof W._gcLDEL.can === 'function' && W._gcLDEL.can(l)); } catch (e) { return false; } }   /* the CRM's lead-delete rule */
function bkWho(){ try { return (W._gcLDEL && W._gcLDEL.who && W._gcLDEL.who()) || {}; } catch (e) { return {}; } }
function bkAllowed(){ var me = bkWho(); return !!(me.email && (me.all || me.est || me.pm)); }
function bkView(){ return UI.v === 'list' || UI.v === 'board'; }
function bkOn(){ return !!(typeof BULK === 'object' && BULK && BULK.on) && bkView(); }
function bkRowCls(l){ return bkOn() ? ' gclb-row' + (BULK.sel[s(l.id)] ? ' gclb-on' : '') : ''; }
function bkChk(l){
  if (!bkOn()) return '';
  if (!bkCan(l)) return '<span class="gclb-no" title="Only an admin, the office or the lead’s own PM can delete it">🔒</span>';
  var id = s(l.id), job = bkJob(l);
  return '<input type="checkbox" class="gclb-chk" data-gclb-id="' + esc(id) + '"' + (BULK.sel[id] ? ' checked' : '') + (job ? ' data-gclb-job="1"' : '') + ' aria-label="Select ' + esc(s(l.name || l.title) || 'lead') + '">'
    + (job ? '<span class="gclb-job" title="Already a job — Delete skips it">🏗 job</span>' : '');
}
function bkBtn(){ if (!bkView() || !bkAllowed()) return ''; var on = bkOn(); return '<button type="button" class="gclu-btn gclb-btn' + (on ? ' on' : '') + '" data-gclb-sel aria-pressed="' + on + '" title="Tick leads to delete several at once" aria-label="Select leads">' + (on ? '☑<span class="gclb-bt"> Selecting…</span>' : '☐<span class="gclb-bt"> Select</span>') + '</button>'; }
function bkHead(){ if (!bkOn()) return ''; return '<div class="gclb-head gcl-hide-rso"><label><input type="checkbox" data-gclb-all> Select all shown</label><span class="gclb-hint">Tap leads to tick them. Leads that are already jobs are skipped.</span></div>'; }
function bkIds(){ return Object.keys(BULK.sel).filter(function(id){ return BULK.sel[id]; }); }
function bkSplit(ids){ var o = { go: [], job: [], no: [] }; ids.forEach(function(id){ var l = bkLead(id); if (!l) return; if (bkJob(l)) o.job.push(l); else if (!bkCan(l)) o.no.push(l); else o.go.push(l); }); return o; }
function bkSync(){
  var hub = D.getElementById('gc-leads-hub'); if (!hub) return bkBar();
  var cs = hub.querySelectorAll('.gclb-chk[data-gclb-id]'), n = 0;
  Array.prototype.forEach.call(cs, function(c){ var on = !!BULK.sel[c.getAttribute('data-gclb-id')]; if (on) n++; if (c.checked !== on) c.checked = on; var r = c.closest('tr.gcl-lr,.gcl-card'); if (r && r.classList.contains('gclb-on') !== on) r.classList.toggle('gclb-on', on); });
  var all = hub.querySelector('[data-gclb-all]'); if (all) { all.checked = cs.length > 0 && n === cs.length; all.indeterminate = n > 0 && n < cs.length; }
  bkBar();
}
function bkBar(){
  var el = D.getElementById('gclb-bar'), live = bkOn() && view() === 'leads' && !!D.getElementById('gc-leads-hub');
  D.body.classList.toggle('gclb-mode', live);
  if (!live) { if (el) el.remove(); return; }
  if (!el) { el = D.createElement('div'); el.id = 'gclb-bar'; el.setAttribute('data-gc-keep', '1'); el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Selected leads'); el.addEventListener('click', bkBarClick); D.body.appendChild(el); }
  var sp = bkSplit(bkIds()), n = sp.go.length + sp.job.length + sp.no.length;
  var h = '<span data-gclb-n>' + n + ' selected</span>'
    + (sp.job.length ? '<span class="gclb-skip" data-gclb-skip>' + sp.job.length + ' already ' + (sp.job.length === 1 ? 'a job' : 'jobs') + ' — skipped</span>' : '')
    + '<span class="gclb-dot">·</span><button type="button" data-gclb-a="del"' + (sp.go.length ? '' : ' disabled') + '>🗑 Delete selected' + (sp.job.length && sp.go.length ? ' (' + sp.go.length + ')' : '') + '</button>'
    + '<span class="gclb-dot">·</span><button type="button" data-gclb-a="cancel">Cancel</button>';
  if (el.__h !== h) { el.__h = h; el.innerHTML = h; }
}
function bkBarClick(ev){ var b = ev.target.closest && ev.target.closest('[data-gclb-a]'); if (!b || b.disabled) return; var a = b.getAttribute('data-gclb-a'); if (a === 'cancel') bkStop(); else if (a === 'del') bkAsk(); }
function bkTick(){
  if (!BULK.on) { BULK.loop = false; bkBar(); return; }
  if (view() !== 'leads' || !bkView() || !D.getElementById('gc-leads-hub')) { BULK.on = false; BULK.sel = {}; BULK.v++; BULK.loop = false; bkBar(); return; }   /* left Leads, or Calendar / Map */
  bkIds().forEach(function(id){ if (!bkLead(id)) delete BULK.sel[id]; });
  bkBar(); NST0.call(W, bkTick, 800);
}
function bkStart(){ if (!bkAllowed()) return; BULK.on = true; BULK.sel = {}; BULK.v++; if (UI.open) closeDrawer(); redraw(); bkSync(); if (!BULK.loop) { BULK.loop = true; NST0.call(W, bkTick, 800); } }
function bkStop(){ BULK.on = false; BULK.sel = {}; BULK.v++; redraw(); bkBar(); }
function bkSelect(ids, on){ (ids || []).forEach(function(id){ id = s(id); if (on === false) delete BULK.sel[id]; else BULK.sel[id] = 1; }); bkSync(); }
function bkAsk(){
  var sp = bkSplit(bkIds());
  if (!sp.go.length) { toast(sp.job.length ? 'Those leads are already jobs — nothing to delete' : 'Tick the leads to delete first'); return; }
  if (!W._gcLDEL || typeof W._gcLDEL.remove !== 'function') { toast('Delete is still loading — try again in a moment'); return; }
  var n = sp.go.length, nm = function(l){ return '<li>' + esc(s(l.name || l.title || l.company) || 'Lead') + '</li>'; };
  var old = D.getElementById('gcl-delq'); if (old) old.remove();
  var ov = D.createElement('div'); ov.id = 'gcl-delq'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('data-gclb', '1');
  ov.innerHTML = '<div class="b" role="dialog" aria-modal="true" aria-labelledby="gcl-delq-t"><div id="gcl-delq-t" class="q">Delete ' + (n === 1 ? 'this lead' : n + ' leads') + '?</div>'
    + '<ul class="n gclb-names">' + sp.go.slice(0, 5).map(nm).join('') + (n > 5 ? '<li class="gclb-more">and ' + (n - 5) + ' more</li>' : '') + '</ul>'
    + (sp.job.length ? '<div class="gclb-sk">Skipped — already ' + (sp.job.length === 1 ? 'a job' : sp.job.length + ' jobs') + ': ' + esc(sp.job.slice(0, 3).map(function(l){ return s(l.name || l.title) || 'Lead'; }).join(', ') + (sp.job.length > 3 ? ' …' : '')) + '</div>' : '')
    + '<div class="w">' + (n === 1 ? 'It is' : 'They are') + ' removed on every computer and never come back by sync or from the Lead Inbox.</div>'
    + '<div class="gclb-undo">Undo: right after the delete, or for 30 days in <b>Admin → Recycle bin → Restore</b> (also ⋯ More → 🗑 Recently deleted).</div>'
    + '<div class="a"><button type="button" data-a="cancel">Cancel</button><button type="button" data-a="delete">🗑 Delete ' + (n === 1 ? 'lead' : n + ' leads') + '</button></div></div>';
  var ids = sp.go.map(function(l){ return s(l.id); });
  function key(e){ if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(false); } }
  function done(yes){ D.removeEventListener('keydown', key, true); ov.remove(); if (yes) bkDelete(ids); }
  ov.addEventListener('click', function(e){ var a = e.target && e.target.getAttribute && e.target.getAttribute('data-a'); if (e.target === ov || a === 'cancel') done(false); else if (a === 'delete') done(true); });
  D.addEventListener('keydown', key, true);
  D.body.appendChild(ov);
  try { ov.querySelector('[data-a=cancel]').focus(); } catch (e) {}
}
/* the CRM's own lead delete (one call for all of them): the delete list, the explicit-delete flag, Undo, Recently deleted */
function bkDelete(ids){
  ids = arr(ids).map(s).filter(function(id){ var l = bkLead(id); return l && !bkJob(l) && bkCan(l); });
  if (!ids.length || !W._gcLDEL) return Promise.resolve({ ok: false, deleted: 0 });
  ids.forEach(function(id){ LC_GONE[id] = 1; }); if (UI.open && LC_GONE[UI.open]) closeDrawer();
  BULK.on = false; BULK.sel = {}; BULK.v++; redraw(); bkBar();
  return Promise.resolve().then(function(){ return W._gcLDEL.remove(ids); }).then(function(res){
    var did = {}; arr(res && res.ids).forEach(function(id){ did[s(id)] = 1; });
    ids.forEach(function(id){ if (!did[id]) delete LC_GONE[id]; else BK_GONE[id] = 1; }); bkGoneWatch();   /* deleted: hidden until its Undo / Restore lifts the delete mark */
    HUB_SIG = ''; redraw();
    if (!res || !res.ok) toast('Could not delete — try again');
    else if (res.deleted < ids.length) toast(res.deleted + ' deleted · ' + (ids.length - res.deleted) + ' could not be');
    return res;
  }, function(){ ids.forEach(function(id){ delete LC_GONE[id]; }); HUB_SIG = ''; redraw(); toast('Could not delete — try again'); return { ok: false, deleted: 0 }; });
}
/* a deleted row stays hidden (LC_GONE) until an Undo / Restore lifts its delete mark: then it shows again */
var BK_GONE = {}, BK_GW = false;
function bkGoneWatch(){
  if (BK_GW) return; BK_GW = true;
  (function k(){ var ids = Object.keys(BK_GONE), back = 0; ids.forEach(function(id){ if (!dead({ id: id })) { delete BK_GONE[id]; delete LC_GONE[id]; back++; } });
    if (back) { HUB_SIG = ''; redraw(); }
    if (Object.keys(BK_GONE).length) NST0.call(W, k, 2000); else BK_GW = false; })();
}
function bkTrash(){ LU.more = false; redraw(); try { if (W._gcLDEL && W._gcLDEL.openTrash) return W._gcLDEL.openTrash(); var b = D.querySelector('#gcx-ldel-bar [data-a="trash"]'); if (b) return b.click(); } catch (e) { warn(e); } toast('Recently deleted is still loading — try again in a moment'); }
D.addEventListener('click', function(ev){
  var t = ev.target; if (!t || !t.closest) return;
  var hub = t.closest('#gc-leads-hub'); if (!hub) return;
  if (t.closest('[data-gclb-trash]')) { ev.stopPropagation(); ev.preventDefault(); return bkTrash(); }
  if (t.closest('[data-gclb-sel]')) { ev.stopPropagation(); ev.preventDefault(); if (bkOn()) bkStop(); else bkStart(); return; }
  if (!bkOn()) return;
  var all = t.closest('[data-gclb-all]');
  if (all) { ev.stopPropagation(); var on = all.checked; Array.prototype.forEach.call(hub.querySelectorAll('.gclb-chk[data-gclb-id]'), function(c){ var id = c.getAttribute('data-gclb-id'); if (on) BULK.sel[id] = 1; else delete BULK.sel[id]; }); bkSync(); return; }
  var chk = t.closest('.gclb-chk');
  if (chk) { ev.stopPropagation(); var cid = chk.getAttribute('data-gclb-id'); if (chk.checked) BULK.sel[cid] = 1; else delete BULK.sel[cid]; bkSync(); return; }
  if (t.closest('button,select,a,input,textarea,label,option')) return;   /* the row's own buttons still work */
  var row = t.closest('tr.gcl-lr[data-gcl-id],.gcl-card[data-gcl-id]'); if (!row) return;
  ev.stopPropagation(); ev.preventDefault();   /* in Select, a tap ticks — it does not open the lead */
  var c2 = row.querySelector('.gclb-chk'); if (!c2) { toast('Only an admin, the office or the lead’s own PM can delete it'); return; }
  var rid = c2.getAttribute('data-gclb-id'); if (BULK.sel[rid]) delete BULK.sel[rid]; else BULK.sel[rid] = 1; bkSync();
}, true);
D.addEventListener('keydown', function(ev){ if (ev.key === 'Escape' && bkOn() && !D.getElementById('gcl-delq') && !D.getElementById('gcl-drawer')) bkStop(); });
/* ── the lead's type: a person's choice (leadKindManual) — the same save as the panel's other changes ── */
var KIND_OPT = [['residential', 'Residential'], ['commercial', 'Commercial'], ['insurance', 'Insurance'], ['government', 'Government']];
var KIND_LBL = { residential: 'Residential', commercial: 'Commercial', insurance: 'Insurance', government: 'Government', mitigation: 'Mitigation' };
var KIND_PIPE = { residential: 'Residential Reno', commercial: 'Commercial Reno', insurance: 'Insurance Claim', government: 'Commercial Reno' };
var KIND_GENERIC = /^(residential|commercial|government|insurance)(\s+(reno|claim))?$/i;   /* the Lead Pipeline's own type names: kept in step */
function kindPick(l){
  var k = typeOf(l), opts = KIND_OPT.slice(); if (!opts.some(function(o){ return o[0] === k; })) opts.push([k, KIND_LBL[k] || k]);
  return '<span class="gclk-wrap" title="The type of lead — tap to change">' + (TYPE_IC[k] || '') + ' <select data-d="kind" class="gclk-sel" aria-label="Type of lead">'
    + opts.map(function(o){ return '<option value="' + o[0] + '"' + (o[0] === k ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></span>';
}
function setKind(id, k){
  k = low(k); var label = KIND_LBL[k]; if (!label) return Promise.resolve(false);
  var l0 = bkLead(id); if (!l0) return Promise.resolve(false);
  if (typeOf(l0) === k && l0.leadKindManual && low(l0.leadKind) === k) return Promise.resolve(true);
  var at = nowIso(), by = myName() || myEmail();
  return patchLead(id, function(l){
    var was = typeOf(l);
    l.leadKind = label; l.leadKindManual = true; l.leadKindSetAt = at; l.leadKindSetBy = by; l.savedAt = at;
    ['type', 'projectType'].forEach(function(f){ var v = s(l[f]); if (v && KIND_GENERIC.test(v) && typeOf({ leadKind: v }) !== k && KIND_PIPE[k]) l[f] = KIND_PIPE[k]; });
    logAct(l, 'type', 'Type: ' + (KIND_LBL[was] || was) + ' → ' + label);
  }).then(function(ok){
    toast(ok ? (TYPE_IC[k] || '') + ' Now ' + label : 'Could not save — try again');
    if (ok) { HUB_SIG = ''; redraw(); try { var pushed = LEADS_NOW; later(function(){ if (typeof W._supaUpsertNow === 'function' && Array.isArray(pushed)) W._supaUpsertNow('leads', pushed); }, 300); } catch (e) {} }   /* to the cloud now, like the priority */
    if (UI.open === id) openDrawer(id);
    return ok;
  });
}
/* ⏰ Bid only on a bid: commercial / government from the Lead Inbox or a bid source — or a lead that already has bid details */
var BID_SRC_LB = /buildingconnected|building connected|planhub|plan ?hub|plan ?room|isqft|construct ?connect|dodge|bid ?board|bid invitation|\bitb\b|\brfp\b|\brfq\b|sam\.gov|county|city of|state of|government|procurement|bidnet|bonfire|gc direct|lead inbox|leads@/i;
function bidSrc(l){ return !!(s(l.inboxId) || l.fromBidBoard || /^LBB_/.test(s(l.id)) || /^(email|watch|api|partner-bid)$/.test(s(l.origin)) || BID_SRC_LB.test([l.source, l.leadSource, l.subSource, l.via].map(s).join(' '))); }
function bidData(l){ var B = null; try { B = W._gcBidSend && W._gcBidSend._S && W._gcBidSend._S.bidders; } catch (e) {} var rec = B && B['lead:' + l.id]; return !!(s(l.bidDue) || s(l.dueToCompany) || s(l.bidNumber) || arr(rec && rec.list).length); }
function showBid(l){ if (!l) return false; if (bidData(l)) return true; return isBidL(l) && bidSrc(l); }
(function(){ if (D.getElementById('gc-leadbulk-css')) return; var c = D.createElement('style'); c.id = 'gc-leadbulk-css'; c.textContent = [
  '#gc-leads-hub .gclb-chk{width:20px;height:20px;margin:0 8px 0 0;vertical-align:middle;cursor:pointer;accent-color:#241968;flex:0 0 auto}',
  '#gc-leads-hub .gclb-row{cursor:pointer}#gc-leads-hub tr.gclb-on td,#gc-leads-hub .gcl-card.gclb-on{background:#fef9c3!important}#gc-leads-hub .gcl-card.gclb-on{border-color:#d4a017}',
  '#gc-leads-hub .gclb-job{font:700 11px Arial;color:#92400e;background:#fef3c7;border-radius:6px;padding:1px 6px;margin-right:6px;white-space:nowrap}#gc-leads-hub .gclb-no{opacity:.45;margin-right:6px;font-size:12px}',
  '.gclb-head{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:0 0 8px;font:13px Arial;color:#1b1640}.gclb-head label{display:flex;gap:8px;align-items:center;font-weight:700;cursor:pointer;min-height:38px}.gclb-head input{width:20px;height:20px;accent-color:#241968}.gclb-hint{color:#666;font-size:12px}',
  '.gclu-btn.gclb-btn.on{background:#241968;color:#fff;border-color:#241968}',
  'body.gclb-mode #gc-leads-hub{padding-bottom:76px}',
  '#gclb-bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483000;display:flex;gap:10px;align-items:center;background:#0f2440;color:#fff;border-radius:10px;padding:9px 14px;box-shadow:0 8px 26px rgba(0,0,0,.35);font:600 14px Arial,sans-serif;max-width:calc(100vw - 32px);flex-wrap:wrap;justify-content:center}',
  '#gclb-bar button{border:0;border-radius:7px;padding:8px 14px;font-weight:700;cursor:pointer;font-size:14px;min-height:40px}#gclb-bar [data-gclb-a=del]{background:#dc2626;color:#fff}#gclb-bar [data-gclb-a=del][disabled]{opacity:.45;cursor:default}#gclb-bar [data-gclb-a=cancel]{background:#334155;color:#fff}#gclb-bar .gclb-dot{opacity:.5}#gclb-bar .gclb-skip{color:#fcd34d;font-weight:700}',
  '#gcl-delq .gclb-names{margin:4px 0 10px 18px;padding:0;font-size:14px;line-height:1.5}#gcl-delq .gclb-more{color:#64748b}#gcl-delq .gclb-sk{font-size:12px;color:#92400e;margin-bottom:6px}#gcl-delq .gclb-undo{font-size:12px;color:#475569;margin-bottom:14px}',
  '#gcl-drawer .gclk-wrap{display:inline-flex;gap:3px;align-items:center;white-space:nowrap}#gcl-drawer .gclk-sel{background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.5);border-radius:12px;padding:2px 6px;font:700 12px Arial;cursor:pointer;min-height:28px;max-width:150px}#gcl-drawer .gclk-sel option{color:#111;background:#fff}',
  '#gcl-drawer[data-gcl-nobid] section[data-gcbs]{display:none!important}',
  '@media (max-width:640px){#gclb-bar{left:8px;right:8px;transform:none;bottom:8px;max-width:none}#gclb-bar button{flex:1 1 auto}#gc-leads-hub .gclb-btn{padding:8px 10px;min-width:40px}#gc-leads-hub .gclb-btn .gclb-bt{display:none}}'   /* the phone: ☐ only — the header stays on one line */
].join('\n'); (D.head || D.documentElement).appendChild(c); })();
W._gcLeadBulk = { on: bkOn, start: bkStart, stop: bkStop, select: bkSelect, selected: bkIds, ask: bkAsk, del: bkDelete, allowed: bkAllowed, jobLinked: bkJob, can: bkCan,
  setKind: setKind, showBid: showBid, bidSource: bidSrc };
try { console.log('[GC] Leads: ☐ Select + 🗑 Delete selected, the lead type menu, Bid only on bids (patch LEADBULK): _gcLeadBulk'); } catch (e) {}
/* ═══ end LEADBULK ═══ */
"""
once("""W._gcLeadsHubKit = { all: function(){ return rawLeads().filter(function(l){ return !dead(l); }); },""",
     BLOCK.lstrip('\n') + """W._gcLeadsHubKit = { all: function(){ return rawLeads().filter(function(l){ return !dead(l); }); },""")
open(p, 'w', encoding='utf-8').write(t); print('LEADBULK: patched', p)
