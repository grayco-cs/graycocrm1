#!/usr/bin/env python3
"""Idempotent patch SUBPHOTOS (owner 10/30): "require subs to enter jobs in their portal and photos into their portal and
those photos will go to the jobs photos grayco photos, make sure my photos from company cam have linked into grayco photos
too, make sure pms look at their approvals everyday".

In the CRM (index.html):
 1. GrayCo Photos: _gcPhotos.addFromPortal — a photo a sub sent through the portal's own upload lands in the job's
    GrayCo Photos (source 'sub', the sub's company, the day, "From sub portal"), HIDDEN from the customer.
 2. Every staff upload (GrayCo Photos, a job's photos, the field upload — all go through _gcPhotos.capture) asks
    "Customer can see these photos?  ○ Yes  ○ No" (default: the old rule — Yes, No for a Damage tag); the answer is the
    photo's `shared` field, which the customer portal reads. The live camera asks once per job every 15 minutes.
 3. A sub's photo: only an admin or the office can switch it to "Customer sees it" (stamped custOkBy; the portals
    show a sub photo to a customer only with that stamp). The photo screen says "🧰 From sub portal · <company> · <day>".
 4. The sub portal's "📍 I'm here" / "✅ Done for today" (optional) go on the job's activity.
 5. Admin → "📸 Link CompanyCam projects" (admins + office): CompanyCam projects no job carries, the one likely job
    (same street address or name) and a one-tap Link (the existing saveJobLink: ccamId / ccProjectId / ccamUrl). Two or
    more look-alike jobs, or a job already linked: no button — never linked by itself.
 6. Admin → "👷 Sub invoice photos": the minimum photos before a sub can send an invoice (default 5; s-settings).
 7. 📋 Approvals opened → a server stamp (auto-wins appr-seen) for the 12 PM reminder;
    window._gcApprovalsCheckedToday() → Promise<[{ name, email, waiting, lastSeen, checkedToday }]> for the office.
 8. Subs tab → the sub's card: "📨 First-day portal text" (on by default; admins turn it off for one sub).
"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
t = open(p, encoding='utf-8').read()
MARK = '/* patch SUBPHOTOS'
if MARK in t:
    print('SUBPHOTOS: already patched'); sys.exit(0)
def once(old, new):
    global t
    n = t.count(old); assert n == 1, ('SUBPHOTOS anchor', n, old[:90]); t = t.replace(old, new)

# ── 1 + 2: GrayCo Photos — the upload choice, sub photos from the portal ──
once("""async function capture(jobId, files, tag, opts){
  opts = opts || {};
  var out = { added: [], dup: 0 };
  tag = TAGS.indexOf(tag) >= 0 ? tag : 'During';""",
"""async function capture(jobId, files, tag, opts){
  opts = opts || {};
  var out = { added: [], dup: 0 };
  tag = TAGS.indexOf(tag) >= 0 ? tag : 'During';
  """ + MARK + """: "Customer can see these photos?  ○ Yes  ○ No" on every staff upload */
  if (opts.customer !== true && opts.customer !== false) {
    var ch = await askCustomer(jobId, tag, (files && files.length) || 0, opts);
    if (ch === null) { out.cancelled = true; return out; }
    opts = Object.assign({}, opts, { customer: ch });
  }""")
once("""        shared: tag !== 'Damage', annotatedRef: '', pairId: '', source: 'grayco', srcHash: h, _local: true };
      PH.map[rec.id] = rec;""",
"""        shared: opts.customer === true || opts.customer === false ? opts.customer : tag !== 'Damage', shareSet: opts.customer === true || opts.customer === false ? true : undefined, annotatedRef: '', pairId: '', source: 'grayco', srcHash: h, _local: true };
      PH.map[rec.id] = rec;""")
once("""function sharedOf(r){ var f = ccFlag(r); if (f && f.deleted !== true && f.shared != null) return f.shared === true; return r.shared === true || (r.shared == null && r.tag !== 'Damage'); }""",
"""function sharedOf(r){ var f = ccFlag(r); if (f && f.deleted !== true && f.shared != null) return f.shared === true; if (r && r.source === 'sub') return r.shared === true && !!s(r.custOkBy);   """ + MARK + """: a sub's photo only after an admin / the office */
  return r.shared === true || (r.shared == null && r.tag !== 'Damage'); }""")
once("""  if (a === 'share') {
    var on1 = !sharedOf(r);
    var w1 = r.source === 'companycam' ? setCCFlag(r, { shared: on1 }) : update(r.id, function(n){ n.shared = on1; n.shareSet = true; });""",
"""  if (a === 'share') {
    var on1 = !sharedOf(r);
    if (r.source === 'sub' && on1 && !isOffice()) { toast('Only an admin or the office can show a sub\\'s photo to the customer.'); return; }   """ + MARK + """ */
    var w1 = r.source === 'companycam' ? setCCFlag(r, { shared: on1 }) : update(r.id, function(n){ n.shared = on1; n.shareSet = true; if (n.source === 'sub') { if (on1) { n.custOkBy = myName(); n.custOkAt = nowIso(); } else { delete n.custOkBy; delete n.custOkAt; } } });""")
once("""  h += '<div class="gcu-pchips">' + (cc ?""",
"""  if (r.source === 'sub') h += '<div class="gcu-subline" style="padding:6px 12px 0;font-size:12px;font-weight:700;color:#B45309">🧰 From sub portal · ' + esc(s(r.subCompany || r.subName || s(r.by).replace(/ \\(sub( portal)?\\)$/, ''))) + ' · ' + esc(s(r.at).slice(0, 10)) + (sharedOf(r) ? '' : ' · hidden from the customer') + '</div>';   """ + MARK + """ */
  h += '<div class="gcu-pchips">' + (cc ?""")
once("""window._gcPhotos = {
  open: open, close: close, openRef: openRef,""",
"""/* """ + MARK[3:] + """: the upload choice and a sub's portal photo ── */
var CUSTQ = {};   /* jobId → { v, at }: the live camera asks once per job every 15 minutes */
function askCustomer(jobId, tag, n, opts){
  var def = tag !== 'Damage';
  if (opts && opts.shot) { var q0 = CUSTQ[String(jobId)]; if (q0 && Date.now() - q0.at < 15 * 60e3) return Promise.resolve(q0.v); }
  if (!document.body || window.__GC_UPLOAD_ASK_OFF__ === true) return Promise.resolve(def);
  return new Promise(function(res){
    var ov = document.createElement('div'); ov.className = 'gc-custq'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Customer can see these photos?');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:rgba(15,29,47,.55);display:flex;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:380px;width:100%;padding:18px;font:15px Inter,Arial,sans-serif;color:#0F1D2F;box-shadow:0 18px 40px rgba(0,0,0,.35)">' +
      '<div style="font-weight:800;font-size:17px;margin-bottom:10px">Customer can see ' + (n === 1 ? 'this photo' : 'these photos') + '?</div>' +
      '<label style="display:flex;gap:8px;align-items:center;padding:8px 0;font-size:16px"><input type="radio" name="gc-custq" value="yes"' + (def ? ' checked' : '') + ' data-gc-custq="yes"> Yes — on the customer portal</label>' +
      '<label style="display:flex;gap:8px;align-items:center;padding:8px 0;font-size:16px"><input type="radio" name="gc-custq" value="no"' + (def ? '' : ' checked') + ' data-gc-custq="no"> No — GrayCo only</label>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button type="button" data-gc-custq-x style="padding:10px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:9px;font-weight:700">Cancel</button>' +
      '<button type="button" data-gc-custq-ok style="padding:10px 16px;border:0;background:#D4A017;color:#0F1D2F;border-radius:9px;font-weight:800">Upload' + (n > 1 ? ' ' + n + ' photos' : '') + '</button></div></div>';
    function done(v){ try { ov.remove(); } catch (e) {} if (v !== null) CUSTQ[String(jobId)] = { v: v, at: Date.now() }; res(v); }
    ov.querySelector('[data-gc-custq-ok]').onclick = function(){ var y = ov.querySelector('[data-gc-custq="yes"]'); done(!!(y && y.checked)); };
    ov.querySelector('[data-gc-custq-x]').onclick = function(){ done(null); };
    document.body.appendChild(ov);
    try { ov.querySelector('[data-gc-custq-ok]').focus(); } catch (e) {}
  });
}
/* a photo a sub sent through the portal's own upload (the CRM's sub filing, patch SUB) → this job's GrayCo Photos,
   tagged with the sub's company, the day and "From sub portal"; never on the customer portal until an admin / the office turns it on */
function addFromPortal(o){
  o = o || {};
  var ref = s(o.ref), pid = s(o.pid); if (!pid || !/^sb:crm-files\\/[0-9a-f]{64}\\.[a-z0-9]{1,8}$/.test(ref)) return null;
  var h = ref.slice(13, 77);
  if (findDup(pid, h) || PH.all().some(function(r){ return r && r.deleted !== true && String(r.jobId) === pid && r.ref === ref; })) return null;
  var at = s(o.at) || nowIso(), co = s(o.by) || 'Subcontractor';
  var rec = { id: 'ph_sub_' + h.slice(0, 16) + '_' + pid.replace(/[^A-Za-z0-9]/g, '').slice(-12), jobId: pid, ref: ref, thumbRef: ref, tag: 'During', note: '', by: co + ' (sub portal)', byKey: 'sub:' + s(o.subId),
    subId: s(o.subId), subName: co, subCompany: co, fromSubPortal: true, label: 'From sub portal', labels: ['From sub portal', co, at.slice(0, 10)], at: at, addedAt: nowIso(), updatedAt: nowIso(),
    lat: null, lng: null, shared: false, shareSet: true, hideSubs: false, annotatedRef: '', pairId: '', source: 'sub', hash: h, srcHash: h, fileName: s(o.name).slice(0, 120) };
  if (PH.map[rec.id]) return null;
  PH.map[rec.id] = rec; PH.save(rec); emit(KEY_PH);
  return rec.id;
}
window._gcPhotos = {
  addFromPortal: addFromPortal, askCustomer: askCustomer,
  open: open, close: close, openRef: openRef,""")

# ── 4: the sub portal's optional check-in / done for today on the job's activity ──
once("""        } else if (ev.kind === 'lang') {""",
"""        } else if (ev.kind === 'checkin') {   """ + MARK + """: "📍 I'm here" / "✅ Done for today" — optional */
          onProj(pid, function(q){ activity(q, 'SPA_' + ev.id, (d.op === 'done' ? '✅ ' + nm + ' is done for today' : '📍 ' + nm + ' is at the job') + (d.note ? ': ' + d.note : '')); });
        } else if (ev.kind === 'lang') {""")

# ── 5: the existing CompanyCam link save, for the Admin fix-up ──
once("""window._gcCCLinkToJob = async function(id, pid){""", """window._gcCCSaveJobLink = saveJobLink;   """ + MARK + """: Admin → 📸 Link CompanyCam projects uses the same save */
window._gcCCLinkToJob = async function(id, pid){""")

# ── 8: the first-day portal text switch on the sub's card ──
once("""  return '<div class="gcst-set" data-gcst="' + esc(sb.id) + '"><label class="gcst-l"><input type="checkbox" data-gcst-on' + (sb.on ? ' checked' : '') + '> <b>📱 Schedule texts</b></label>' +""",
"""  var adm1 = false; try { adm1 = !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) {}
  return '<div class="gcst-set" data-gcst="' + esc(sb.id) + '"><label class="gcst-l"><input type="checkbox" data-gcst-on' + (sb.on ? ' checked' : '') + '> <b>📱 Schedule texts</b></label>' +
    '<label class="gcst-l" title="On the morning of their first day on a job: the job, address, PO, start and their portal link (admins change this)"><input type="checkbox" data-gcst-first' + (sb.firstText !== false ? ' checked' : '') + (adm1 ? '' : ' disabled') + '> <b>📨 First-day portal text</b></label>' +   """ + MARK + """ */""")
once("""body: JSON.stringify({ subId: id, on: on, phone: ph }) }).then(function(o){""",
"""body: JSON.stringify(Object.assign({ subId: id, on: on, phone: ph }, (function(){ var f = row.querySelector('[data-gcst-first]'); return f && !f.disabled ? { firstText: !!f.checked } : {}; })())) }).then(function(o){""")

# ── 5, 6, 7: the Admin sections and the approvals stamp ──
BLOCK = r"""
<script id="gc-patch-subphotos">
""" + MARK + r""" (owner 10/30) — Admin → 📸 Link CompanyCam projects, Admin → 👷 Sub invoice photos, the 📋 Approvals
   "seen today" stamp, window._gcApprovalsCheckedToday(). The server side: netlify/functions/_lib/subwork.js (the sub
   portal's photo rule, the first-day text), _lib/appr-noon.js (the 12 PM approvals reminder). */
(function(){
'use strict';
var W = window, D = document;
if (W.__GC_PATCH_SUBPHOTOS__) return; W.__GC_PATCH_SUBPHOTOS__ = true;
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function me(){ try { return low(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); } catch (e) { return ''; } }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function isOffice(){
  if (isAdmin()) return true;
  try { var u = W._gcMeNow || null; if (u && (low(u.payType) === 'owner' || u.role === 'Admin' || /office/i.test(u.role || ''))) return true; } catch (e) {}
  return me() === 'office@grayco-cs.com';
}
function post(fn, body){
  return W.fetch('/.netlify/functions/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ j.__status = r.status; return j; }); }, function(e){ return { ok: false, error: 'offline' }; });
}

/* ── 7. 📋 Approvals opened → the server stamp (the 12 PM reminder skips whoever opened it today) ── */
var lastStamp = 0;
function stamp(){ var now = Date.now(); if (D.hidden || !me() || now - lastStamp < 10 * 60e3) return; lastStamp = now; post('auto-wins', { action: 'appr-seen' }).then(function(j){ if (!j || !j.ok) lastStamp = 0; }); }
function wrapTick(){
  var f = W._gcApprovalSeenTick; if (typeof f !== 'function' || f.__gcSub) return !!f;
  var g = function(){ try { stamp(); } catch (e) {} return f.apply(this, arguments); }; g.__gcSub = true; W._gcApprovalSeenTick = g; return true;
}
if (!wrapTick()) { var tries = 0; (function again(){ if (wrapTick() || ++tries > 40) return; ST.call(W, again, 1500); })(); }
W._gcApprovalStamp = function(){ lastStamp = 0; stamp(); };
/* the office / admins: who has approvals waiting and whether they opened 📋 Approvals today */
W._gcApprovalsCheckedToday = function(){
  return post('auto-wins', { action: 'appr-seen-list' }).then(function(j){
    if (!j || !j.ok) return [];
    return arr(j.rows).map(function(r){ return { name: s(r.name), email: low(r.email), waiting: +r.waiting || 0, lastSeen: s(r.lastSeen), checkedToday: !!r.checkedToday }; });
  });
};

/* ── 5. 📸 Link CompanyCam projects ── */
var SUF = { street: 'st', st: 'st', drive: 'dr', dr: 'dr', road: 'rd', rd: 'rd', lane: 'ln', ln: 'ln', cove: 'cv', cv: 'cv', avenue: 'ave', ave: 'ave', av: 'ave',
  boulevard: 'blvd', blvd: 'blvd', court: 'ct', ct: 'ct', circle: 'cir', cir: 'cir', place: 'pl', pl: 'pl', trail: 'trl', trl: 'trl', highway: 'hwy', hwy: 'hwy',
  parkway: 'pkwy', pkwy: 'pkwy', way: 'way', terrace: 'ter', ter: 'ter', loop: 'loop', pike: 'pike' };
function addrKey(a){
  var t = low(a).split(',')[0].replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); if (!t) return '';
  var w = t.split(' '), i = 0; while (i < w.length && !/^\d+[a-z]?$/.test(w[i])) i++;
  if (i >= w.length) return '';
  var num = w[i], rest = w.slice(i + 1).filter(function(x){ return !/^(n|s|e|w|north|south|east|west)$/.test(x); }).map(function(x){ return SUF[x] ? '' : x; }).filter(Boolean);
  return rest.length ? num + ' ' + rest.slice(0, 2).join(' ') : '';
}
function nameKey(n){ var t = low(n).replace(/[^a-z0-9]/g, ''); return t.length >= 6 ? t : ''; }
function ccIdFromAny(v){ if (v == null || v === '') return ''; var t = String(v), m = t.match(/companycam\.com\/projects\/(\d+)/) || t.match(/^PRJcc_(\d+)$/); if (m) return m[1]; return /^\d{3,}$/.test(t.trim()) ? t.trim() : ''; }
var IDF = ['ccProjectId', 'companyCamId', 'companycamId', 'ccamId', 'ccId', 'companyCamUrl', 'ccamUrl', 'ccUrl', 'ccProjectUrl'];
function ccIdsOf(p){ var out = []; if (!p) return out; IDF.concat(['id']).forEach(function(f){ var id = ccIdFromAny(p[f]); if (id && out.indexOf(id) < 0) out.push(id); }); arr(p.ccMoreIds).forEach(function(v){ var id = ccIdFromAny(v); if (id && out.indexOf(id) < 0) out.push(id); }); return out; }
var DEAD = /^(lost|dead|cancel+ed|void|spam|junk|duplicate|archived)$/i;
/* pure: [{ cc, job|null, why, candidates }] — only CompanyCam projects no job carries; a Link only for ONE clear job */
function matchAll(ccList, projects){
  var live = arr(projects).filter(function(p){ return p && p.id && p.deleted !== true && !DEAD.test(s(p.status)); });
  var have = {}; live.forEach(function(p){ ccIdsOf(p).forEach(function(id){ have[id] = p; }); });
  return arr(ccList).filter(function(c){ return c && c.id && !have[String(c.id)]; }).map(function(c){
    var ak = addrKey(c.address || c.name), nk = nameKey(c.name);
    var byA = ak ? live.filter(function(p){ return addrKey(p.address || p.jobAddress || p.name) === ak; }) : [];
    var byN = nk ? live.filter(function(p){ return nameKey(p.name) === nk || nameKey(p.client) === nk; }) : [];
    var cand = byA.length ? byA : byN, why = byA.length ? 'same address' : byN.length ? 'same name' : '';
    var out = { cc: c, job: null, why: why, candidates: cand.map(function(p){ return s(p.id); }) };
    if (cand.length === 1 && !ccIdsOf(cand[0]).length) out.job = cand[0];
    else if (cand.length === 1) out.why = 'that job already has a CompanyCam project — link it from the job';
    else if (cand.length > 1) out.why = cand.length + ' look-alike jobs (' + why + ') — open the right job to link it';
    return out;
  });
}
W._gcLinkCCMatch = matchAll;
/* the same screen anywhere (tests, or another page): W._gcLinkCCRender(element) */
W._gcLinkCCRender = function(el){ if (!el) return; el.setAttribute('data-gclc-box', ''); paintLink(el); };
function jobLabel(p){ try { if (typeof W._gcJobLabel === 'function') return s(W._gcJobLabel(p)); } catch (e) {} return s(p && (p.name || p.id)); }
var LC = { rows: null, busy: false, err: '', done: {} };
function paintLink(box){
  if (!box || !box.isConnected) return;
  if (!isOffice()) { box.innerHTML = '<div class="w">Admins and the office only.</div>'; return; }
  var h = '<div class="w" style="margin-bottom:8px">CompanyCam projects that no CRM job carries yet. When ONE job has the same street address (or name) it is shown with <b>Link</b> — one tap puts the CompanyCam project on that job, so its photos show in 📸 GrayCo Photos. Look-alike jobs are never linked by themselves.</div>' +
    '<button type="button" class="gc-adm-btn" data-gclc-load>' + (LC.busy ? 'Loading…' : (LC.rows ? '↻ Check again' : 'Find unlinked CompanyCam projects')) + '</button>';
  if (LC.err) h += '<div class="w" style="color:#b91c1c;margin-top:6px">' + esc(LC.err) + '</div>';
  if (LC.rows) {
    var can = LC.rows.filter(function(r){ return r.job; }).length;
    h += '<div class="w" style="margin:8px 0">' + LC.rows.length + ' unlinked · ' + can + ' with one clear job</div>';
    h += LC.rows.slice(0, 200).map(function(r){
      var c = r.cc, d = LC.done[String(c.id)];
      return '<div data-gclc-row="' + esc(c.id) + '" style="display:flex;gap:10px;align-items:center;justify-content:space-between;padding:7px 0;border-top:1px solid #eef2f7;flex-wrap:wrap">' +
        '<span style="min-width:0;flex:1"><b>' + esc(c.name || '(no name)') + '</b> <span class="w">' + esc(c.address || '') + '</span><br>' +
        (r.job ? '→ <b>' + esc(jobLabel(r.job)) + '</b> <span class="w">(' + esc(r.why) + ')</span>' : '<span class="w">' + esc(r.why || 'no job with the same address or name') + '</span>') + '</span>' +
        (d ? '<span style="color:#166534;font-weight:700">Linked ✓</span>' : r.job ? '<button type="button" class="gc-adm-btn" data-gclc-link="' + esc(c.id) + '" data-pid="' + esc(r.job.id) + '">Link</button>' : '') + '</div>';
    }).join('');
  }
  box.innerHTML = h;
}
/* every CompanyCam project, through the server's CompanyCam proxy (the key stays on the server — patch CCX) */
function ccMap(p){ var a = p.address || {}; return { id: String(p.id || ''), name: s(p.name) || s(a.street_address_1) || '(no name)', address: [s(a.street_address_1), s(a.city), s(a.state)].filter(Boolean).join(', '),
  url: s(p.public_url) || ('https://app.companycam.com/projects/' + p.id), updated: p.updated_at || p.created_at || '' }; }
function ccAll(){
  var all = [];
  function page(n){
    return W.fetch('/.netlify/functions/companycam-webhook?proxy=api&raw=1&per_page=100&page=' + n + '&endpoint=projects', { headers: { 'x-gc-cc': '1' } })
      .then(function(r){ return r.ok ? r.json() : []; }, function(){ return []; }).then(function(j){
        var l = Array.isArray(j) ? j : arr(j && j.projects); l.forEach(function(p){ if (p && p.id != null) all.push(ccMap(p)); });
        return l.length >= 100 && n < 30 ? page(n + 1) : all;
      });
  }
  return page(1);
}
function loadLink(box){
  if (LC.busy) return; LC.busy = true; LC.err = ''; paintLink(box);
  var get = ccAll().then(function(l){ return l.length ? { list: l } : (typeof W._gcCCProjects === 'function' ? W._gcCCProjects(true) : { list: [], error: 'CompanyCam did not answer.' }); });
  Promise.resolve(get).then(function(r){
    LC.busy = false; LC.err = r && r.error && !(r.list || []).length ? 'CompanyCam: ' + r.error : '';
    LC.rows = matchAll((r && r.list) || [], (W._crm || {}).projects);
    paintLink(box);
  }, function(e){ LC.busy = false; LC.err = 'CompanyCam: ' + (e && e.message || e); paintLink(box); });
}
D.addEventListener('click', function(e){
  var t = e.target && e.target.closest ? e.target : null; if (!t) return;
  var l = t.closest('[data-gclc-load]'); if (l) { loadLink(l.closest('[data-gclc-box]')); return; }
  var b = t.closest('[data-gclc-link]'); if (!b) return;
  if (!isOffice()) return;
  var id = b.getAttribute('data-gclc-link'), pid = b.getAttribute('data-pid');
  var row = (LC.rows || []).filter(function(r){ return String(r.cc.id) === String(id) && r.job && String(r.job.id) === String(pid); })[0];
  if (!row || typeof W._gcCCSaveJobLink !== 'function') return;
  b.disabled = true; b.textContent = 'Linking…';
  Promise.resolve(W._gcCCSaveJobLink(pid, String(id), s(row.cc.url) || ('https://app.companycam.com/projects/' + id))).then(function(){ LC.done[String(id)] = pid; paintLink(b.closest('[data-gclc-box]')); },
    function(){ b.disabled = false; b.textContent = 'Link'; });
}, true);

/* ── 6. 👷 Sub invoice photos (the minimum before a sub can send an invoice) ── */
var SP = { v: null, msg: '' };
function paintMin(box){
  if (!box || !box.isConnected) return;
  var adm = isAdmin();
  box.innerHTML = '<div class="w" style="margin-bottom:8px">A sub can send an invoice for a job from the sub portal only when that job has enough photos from them: at least this many, and at least one for each day they were on the schedule there (whichever is higher). Daily check-ins and photos are optional.</div>' +
    '<label class="w">Minimum photos <input type="number" min="0" max="50" step="1" data-gcsp-min value="' + esc(SP.v == null ? '' : SP.v) + '" style="width:80px;padding:6px;border:1px solid #cbd5e1;border-radius:6px"' + (adm ? '' : ' disabled') + '></label> ' +
    (adm ? '<button type="button" class="gc-adm-btn" data-gcsp-save>Save</button>' : '<span class="w">(admins change this)</span>') + (SP.msg ? ' <span class="w">' + esc(SP.msg) + '</span>' : '');
}
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest && e.target.closest('[data-gcsp-save]'); if (!b) return;
  var box = b.closest('[data-gcsp-box]'), v = +(box.querySelector('[data-gcsp-min]') || {}).value;
  if (!(v >= 0 && v <= 50)) { SP.msg = 'A number from 0 to 50.'; paintMin(box); return; }
  b.disabled = true;
  post('portal-access', { action: 's-settings', set: { invPhotoMin: Math.round(v) } }).then(function(j){ SP.msg = j && j.ok ? 'Saved ✓' : ((j && j.error) || 'Could not save.'); if (j && j.ok) SP.v = j.settings.invPhotoMin; paintMin(box); });
}, true);
function addSections(){
  if (typeof W._gcAdmAddSection !== 'function') return false;
  W._gcAdmAddSection({ id: 'cclink', after: 'security', ic: '📸', t: 'Link CompanyCam projects', d: 'CompanyCam projects no job carries — the likely job and a one-tap Link (never automatic when unclear)',
    render: function(box){ box.innerHTML = '<div data-gclc-box></div>'; paintLink(box.firstChild); }, count: function(){ return LC.rows ? LC.rows.length + ' unlinked' : ''; } });
  W._gcAdmAddSection({ id: 'subinvphotos', after: 'cclink', ic: '👷', t: 'Sub invoice photos', d: 'Photos a sub must add on a job before sending an invoice from the sub portal',
    render: function(box){ box.innerHTML = '<div data-gcsp-box></div>'; var b = box.firstChild; paintMin(b);
      post('portal-access', { action: 's-settings' }).then(function(j){ if (j && j.ok && j.settings) SP.v = j.settings.invPhotoMin; paintMin(b); }); },
    count: function(){ return SP.v == null ? '' : 'at least ' + SP.v; } });
  return true;
}
if (!addSections()) { var n2 = 0; (function again2(){ if (addSections() || ++n2 > 40) return; ST.call(W, again2, 1500); })(); }
try { console.log('[GC] SUBPHOTOS: 📸 Link CompanyCam projects · 👷 Sub invoice photos · _gcApprovalsCheckedToday()'); } catch (e) {}
})();
</script>
"""
t = t.rstrip('\n') + '\n' + BLOCK
open(p, 'w', encoding='utf-8').write(t); print('SUBPHOTOS: patched', p)
