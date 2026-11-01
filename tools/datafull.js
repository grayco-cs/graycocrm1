/* __GC_PATCH_DATAFULL__ — 🧾 MISSING JOB DATA: every job's data checklist, for the office and the admins.   (patch DATAFULL)
   Owner 11/01: "does admin and office get nightly data check alert, I want office to make sure every job has full data in
   it" — and: "I just want to be able to click all options when I create the job; if I create a job on the fly with photos
   etc while we're bidding, before we have an estimate, don't make me choose all that."
   • The rule is window._gcJobData (netlify/functions/_lib/jobdata.js, the same text the nightly check runs — it is put just
     above this script by tools/patch_DATAFULL.py). What a job needs follows its stage: a bidding job only its name and
     address; an estimate going out also the customer ready for the estimate; won / active / completed jobs the full list.
   • 🧾 Missing job data board (office + admins: every job; a PM: his own jobs): jobs with the most missing first, a filter
     by PM, each missing item with a one-click "Fix" that opens the right field (a small editor on this job's own field, or
     the part of the job page it lives in), and "N/A for this job" (office / admins) — project.dataNA[key] = { by, at },
     so it stops nagging. Leads: who it is assigned to, the source, the next step / due date.
   • Where: the Office / Admin desk home and GrayCo Field home (role apps), the 🏢 Office tab, ⚙ Admin, a PM's home
     (his jobs), #datafull in the address (the morning e-mail's link), and a small "Data 80% · 3 missing" chip in each job's
     header (a bidding job: "Data: bidding").
   • The morning alert (netlify/functions/data-check.js, about 7 AM Central) is also shown here once, to the admins and the
     office (gc_kv gc_datafull_report .alert). "🔔 My morning alert" keeps each person's own e-mail / push / in-app choice
     (gc_kv gc_datafull_prefs).
   • New job (desk Projects → New Project, 🚀 Launch Job, Field "＋ New project"): only the name and the address are asked;
     "＋ More details (optional)" holds every other choice as clickable fields and chips (job type, PM, customer link,
     phone, e-mail, insurance, commercial, contract amount, dates, templates — a template only on "Apply template").
     Nothing is forced; a quick Field job with photos is never blocked.
   Staff only. It only reports: nothing is filled in or guessed — every value comes from a person.
   Kill switch: localStorage gc_datafull_off = "1" (this device).
   API: window._gcDataFull = { open(opts), close(), check(pid), all(), state(), chip(pid), na(pid, key, on), fix(pid, key) } */
(function(){
'use strict';
if (window.__GC_PATCH_DATAFULL__) return; window.__GC_PATCH_DATAFULL__ = true;
var W = window, D = document, J = W._gcJobData;
if (!J) { try { console.warn('[GC DATAFULL] the job data rule is missing'); } catch (e) {} return; }
var ST = W.__GC_NATIVE_SETTIMEOUT__ || W.__GC_RAW_SETTIMEOUT__ || W.setTimeout;
var RI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function later(f, ms){ return ST.call(W, f, ms || 0); }
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function lsGet(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
function nowIso(){ return new Date().toISOString(); }
function today(){ var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function warn(e){ try { console.warn('[GC DATAFULL]', e && e.message || e); } catch (x) {} }
function off(){ return lsGet('gc_datafull_off') === '1'; }
function C(){ return W._crm || {}; }

/* ── who ── */
function signedIn(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); } catch (e) { return false; } }
function myEmail(){ try { return low(W.__GC_AUTH__.email()); } catch (e) { return ''; } }
function isAdmin(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()); } catch (e) { return false; } }
function isOffice(){ try { return !!(W._gcIsOfficeFull && W._gcIsOfficeFull()); } catch (e) { return false; } }
function full(){ return isAdmin() || isOffice(); }   /* office + admins: every job, N/A */
function myName(){ try { var m = W._gcMeNow; if (m && s(m.name)) return s(m.name); } catch (e) {} try { var e = myEmail(); var u = arr(C().users).filter(function(x){ return low(x.email) === e; })[0]; return u ? s(u.name) : ''; } catch (e2) { return ''; } }
function isPm(){
  try { var k = W._gcField && W._gcField.state && s(W._gcField.state().rk); if (k === 'pm' || k === 'roof') return true; } catch (e) {}
  var e = myEmail(), u = arr(C().users).filter(function(x){ return low(x.email) === e; })[0];
  return !!u && /project\s*manager|\bpm\b|superintendent|super\b/i.test(s(u.role) + ' ' + s(u.title));
}
function canSee(){ return signedIn() && !off() && (full() || isPm()); }
function sameName(a, b){ var x = low(a).replace(/[^a-z]/g, ''), y = low(b).replace(/[^a-z]/g, ''); return !!x && x === y; }
function mine(p){ var me = myName(); return !!me && [p.pm, p.projectManager, p.apm, p.superintendent].some(function(v){ return sameName(v, me); }); }

/* ── the cloud bits the page does not keep itself (read only): sent estimate PDFs, photo tags, the nightly report, prefs ── */
var EXTRA = { est: [], ai: {}, report: null, prefs: [], at: 0, busy: false };
function creds(){ var u = '', k = ''; try { u = (lsGet('grayco_sb_url') || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''); k = lsGet('grayco_sb_key') || ''; } catch (e) {} return { u: u, k: k }; }
function kvVal(v){ if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return null; } } return v; }
function pull(force){
  if (EXTRA.busy || (!force && Date.now() - EXTRA.at < 300000)) return Promise.resolve(false);
  var c = creds(); if (!c.u || !c.k) return Promise.resolve(false);
  EXTRA.busy = true;
  return W.fetch(c.u + '/rest/v1/gc_kv?select=key,value&key=in.(%22gc_est_sent%22,%22gc_photo_ai%22,%22gc_datafull_report%22,%22gc_datafull_prefs%22)', { headers: { apikey: c.k, Authorization: 'Bearer ' + c.k }, cache: 'no-store' })
    .then(function(r){ return r.ok ? r.json() : []; }).then(function(rows){
      EXTRA.busy = false; EXTRA.at = Date.now();
      (Array.isArray(rows) ? rows : []).forEach(function(r){
        var v = kvVal(r.value);
        if (r.key === 'gc_est_sent') EXTRA.est = arr(v);
        else if (r.key === 'gc_photo_ai') EXTRA.ai = v && typeof v === 'object' ? v : {};
        else if (r.key === 'gc_datafull_report') EXTRA.report = arr(v)[0] || null;
        else if (r.key === 'gc_datafull_prefs') EXTRA.prefs = arr(v);
      });
      CACHE.sig = ''; return true;
    }, function(){ EXTRA.busy = false; return false; });
}
function kvWriteList(key, mutate){
  var c = creds(); if (!c.u || !c.k) return Promise.reject(new Error('Not connected to the cloud.'));
  var h = { apikey: c.k, Authorization: 'Bearer ' + c.k };
  return W.fetch(c.u + '/rest/v1/gc_kv?select=value&key=eq.' + encodeURIComponent(key), { headers: h, cache: 'no-store' }).then(function(r){ return r.ok ? r.json() : Promise.reject(new Error('read ' + r.status)); })
    .then(function(rows){ var list = arr(kvVal(rows && rows[0] ? rows[0].value : [])); var next = mutate(list);
      return W.fetch(c.u + '/rest/v1/gc_kv?on_conflict=key', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, h), body: JSON.stringify({ key: key, value: JSON.stringify(next), updated_at: nowIso() }) })
        .then(function(r){ if (!r.ok) throw new Error('save ' + r.status); return next; }); });
}

/* ── the check, on the CRM's own lists ── */
function claimsList(){ try { return W._gcClaims && W._gcClaims.list ? arr(W._gcClaims.list()) : []; } catch (e) { return []; } }
function leadsList(){ var l = []; try { if (typeof W._gcLaLeads === 'function') l = arr(W._gcLaLeads()); } catch (e) {} if (!l.length) l = arr(W.__gcLeadsLive); return l; }
function estList(){ try { return arr(W._gcEstimatesState); } catch (e) { return []; } }
function dataNow(){
  var c = C();
  return { projects: c.projects, customers: arr(c.customers).length ? c.customers : W._graycoCustomers, schedule: c.schedule, invs: c.invoices, estimates: estList(),
    projectDocs: arr(W._gcProjectDocs).length ? W._gcProjectDocs : c.projectDocs, leads: leadsList(), gc_claims: claimsList(), gc_est_sent: EXTRA.est, gc_photo_ai: EXTRA.ai };
}
var CACHE = { sig: '', at: 0, res: null, byPid: {}, ix: null };
function sigNow(d){ return [d.projects, d.customers, d.schedule, d.invs, d.projectDocs, d.estimates, d.leads].map(function(x){ return Array.isArray(x) ? x.length : 0; }).join('.') + ':' + (d.projects && d.projects.__dfSig || ''); }
function all(force){
  var d = dataNow();
  if (!Array.isArray(d.projects)) return null;
  var sg = sigNow(d);
  if (!force && CACHE.res && (sg === CACHE.sig || Date.now() - CACHE.at < 2500) && CACHE.projects === d.projects) return CACHE.res;
  var res; try { res = J.checkAll(d, {}); } catch (e) { warn(e); return CACHE.res; }
  CACHE.ix = J.index(d, {}); CACHE.byPid = {};
  res.jobs.forEach(function(j){ CACHE.byPid[j.pid] = j; });
  CACHE.res = res; CACHE.sig = sg; CACHE.at = Date.now(); CACHE.projects = d.projects;
  return res;
}
function proj(pid){ return arr(C().projects).filter(function(p){ return s(p.id) === s(pid); })[0] || null; }
function checkOne(pid){ var p = proj(pid); if (!p) return null; all(); try { return J.check(p, CACHE.ix || J.index(dataNow(), {})); } catch (e) { warn(e); return null; } }
function itemOf(key){ return J.BY_KEY[key] || J.LEAD_ITEMS.filter(function(x){ return x.key === key; })[0] || null; }

/* ── saving a person's change (never a guess) ── */
function manual(why){ try { W.__GC_MANUAL_SAVE__ = true; if (W._gcManualNow) W._gcManualNow(why || 'job data'); } catch (e) {} later(function(){ try { W.__GC_MANUAL_SAVE__ = false; } catch (e) {} }, 1500); }
function patchProject(pid, mut){
  if (typeof W._setProjects !== 'function') return false;
  manual('job data');
  W._setProjects(function(list){ return (list || []).map(function(p){ if (!p || s(p.id) !== s(pid)) return p; var q = Object.assign({}, p); mut(q); q.updatedAt = nowIso(); q.updatedBy = myName() || q.updatedBy; return q; }); });
  try { var cp = C().projects; if (Array.isArray(cp)) cp.forEach(function(p){ if (p && s(p.id) === s(pid)) mut(p); }); } catch (e) {}
  CACHE.sig = ''; CACHE.at = 0;
  later(paintAll, 400);
  return true;
}
function patchLead(id, mut){
  if (typeof W._setLeads !== 'function') return false;
  manual('lead data');
  W._setLeads(function(list){ return (list || []).map(function(l){ if (!l || s(l.id) !== s(id)) return l; var q = Object.assign({}, l); mut(q); q.updatedAt = nowIso(); return q; }); });
  CACHE.sig = ''; CACHE.at = 0; later(paintAll, 400);
  return true;
}
/* "N/A for this job" — office / admins; on = false takes it back */
function setNA(pid, key, on, lead){
  if (!full()) { toast('Only the office or an admin can mark an item N/A.'); return false; }
  var f = function(q){ var na = Object.assign({}, q.dataNA && typeof q.dataNA === 'object' ? q.dataNA : {}); if (on) na[key] = { by: myName() || myEmail(), at: nowIso() }; else delete na[key]; q.dataNA = na; };
  return lead ? patchLead(pid, f) : patchProject(pid, f);
}

/* ── opening the job page where a missing item lives ── */
var TABS = { docs: /^(📄\s*)?(documents|docs|files|files\s*&\s*docs|papers)\b/i, photos: /^(📸\s*)?photos\b/i, schedule: /^(📅\s*)?schedule\b/i, invoices: /^(🧾\s*|💵\s*)?(invoices|billing|money)\b/i };
function openJob(pid, part){
  var p = proj(pid); if (!p) { toast('That job is not on this computer yet.'); return; }
  close();
  try { if (W._gcRA && W._gcRA.hide) W._gcRA.hide(); } catch (e) {}
  try { if (typeof W._setView === 'function') W._setView('projects'); } catch (e) {}
  try { if (typeof W._openJobDetail === 'function') W._openJobDetail(p); else if (typeof W._gcOpenJobProfile === 'function') W._gcOpenJobProfile(p.id); } catch (e) { warn(e); }
  if (!part) return;
  var tries = 0, re = TABS[part];
  (function find(){
    tries++;
    var b = re ? [].slice.call(D.querySelectorAll('main button, main [role="tab"]')).filter(function(x){ return x.getClientRects().length && re.test(s(x.textContent)); })[0] : null;
    if (b) { try { b.click(); b.scrollIntoView({ block: 'center' }); } catch (e) {} return; }
    if (tries < 12) later(find, 350); else toast('Opened the job — the ' + part + ' are on its page.');
  })();
}
function openLead(id){ close(); try { if (W._gcRA && W._gcRA.hide) W._gcRA.hide(); } catch (e) {} try { if (typeof W._gcOpenLead === 'function') W._gcOpenLead(id); else if (W._setView) W._setView('leads'); } catch (e) { warn(e); } }

/* ── toast ── */
function toast(t){
  var el = D.getElementById('gc-df-toast'); if (!el) { el = D.createElement('div'); el.id = 'gc-df-toast'; el.setAttribute('data-gc-keep', '1'); el.setAttribute('data-gcnav-ignore', '1'); D.body.appendChild(el); }
  el.textContent = t; el.style.display = 'block'; clearTimeout(el.__t); el.__t = later(function(){ el.style.display = 'none'; }, 3500);
}

/* ── "Fix": the right field, filled in by the person ── */
var TYPES = ['Residential Reno', 'Commercial TI', 'Commercial Reno', 'Insurance Claim', 'Water Damage', 'Fire Damage', 'New Construction', 'Roofing', 'Repair', 'Program Work', 'Other'];
var STATUSES = ['bidding', 'approved', 'Active', 'on_hold', 'completed', 'lost'];
function people(){ var u = []; try { u = typeof W._gcActivePeople === 'function' ? arr(W._gcActivePeople()) : []; } catch (e) {} if (!u.length) u = arr(C().users).filter(function(x){ return x.active !== false && !x.departed; }); return u; }
function pmNames(){ var seen = {}, out = []; people().forEach(function(u){ var n = s(u.name); if (n && !seen[low(n)] && /manager|pm\b|admin|owner|super|estimat|office/i.test(s(u.role) + ' ' + s(u.payType) + ' ' + s(u.title))) { seen[low(n)] = 1; out.push(n); } }); arr(C().projects).forEach(function(p){ var n = s(p.pm); if (n && !seen[low(n)]) { seen[low(n)] = 1; out.push(n); } }); return out.sort(); }
function customers(){ var l = arr(C().customers); if (!l.length) l = arr(W._graycoCustomers); return l.filter(function(c){ return c.id && !c.deleted && !c._deleted; }).sort(function(a, b){ return low(a.name || a.company) < low(b.name || b.company) ? -1 : 1; }); }
function opt(v, cur, label){ return '<option value="' + esc(v) + '"' + (s(v) === s(cur) ? ' selected' : '') + '>' + esc(label == null ? v : label) + '</option>'; }
function fixHtml(r, it, p, lead){
  var f = it.fix || {}, v = function(k){ return s(p[k]); }, inp = function(k, type, ph){ return '<input class="gc-df-in" data-k="' + k + '" type="' + (type || 'text') + '" value="' + esc(v(k)) + '" placeholder="' + esc(ph || '') + '">'; };
  switch (f.input) {
    case 'pm': return '<select class="gc-df-in" data-k="' + (lead ? 'pm' : 'pm') + '"><option value="">— choose —</option>' + pmNames().map(function(n){ return opt(n, p.pm); }).join('') + '</select>';
    case 'type': return '<select class="gc-df-in" data-k="type"><option value="">— choose —</option>' + TYPES.concat(TYPES.indexOf(v('type')) < 0 && v('type') ? [v('type')] : []).map(function(n){ return opt(n, p.type); }).join('') + '</select>';
    case 'status': return '<select class="gc-df-in" data-k="status"><option value="">— choose —</option>' + STATUSES.map(function(n){ return opt(n, p.status); }).join('') + '</select>';
    case 'money': return inp(f.field, 'number', 'e.g. 25000') ;
    case 'percent': return inp(f.field, 'number', 'e.g. 10') + '<label class="gc-df-ck"><input type="checkbox" data-k="retainageNone"' + (p.retainageNone ? ' checked' : '') + '> No retainage on this job</label>';
    case 'date': return inp(f.field, 'date');
    case 'tel': return inp(f.field, 'tel', '(901) 555-0100');
    case 'email': return inp(f.field, 'email', 'name@example.com');
    case 'contact': return inp('clientPhone', 'tel', 'Phone') + inp('clientEmail', 'email', 'E-mail');
    case 'billing': return inp('billingAddress', 'text', 'Billing address') + '<label class="gc-df-ck"><input type="checkbox" data-k="billingSame"' + (p.billingSame ? ' checked' : '') + '> Same as the job address</label>';
    case 'pref': return '<div class="gc-df-chips">' + ['Call', 'Text', 'E-mail'].map(function(x){ return '<button type="button" class="gc-df-chip' + (low(p.preferredContact) === low(x) ? ' on' : '') + '" data-pick="preferredContact" data-v="' + x + '">' + x + '</button>'; }).join('') + '</div><input type="hidden" class="gc-df-in" data-k="preferredContact" value="' + esc(v('preferredContact')) + '">';
    case 'adjuster': var a = p.adjuster && typeof p.adjuster === 'object' ? p.adjuster : {}; return '<input class="gc-df-in" data-k="adjuster.name" placeholder="Adjuster name" value="' + esc(a.name) + '"><input class="gc-df-in" data-k="adjuster.phone" type="tel" placeholder="Adjuster phone" value="' + esc(a.phone || p.adjusterPhone) + '"><input class="gc-df-in" data-k="adjuster.email" type="email" placeholder="Adjuster e-mail" value="' + esc(a.email || p.adjusterEmail) + '"><div class="gc-df-note">Staff only — never shown to the customer.</div>';
    case 'customer': return '<input class="gc-df-in" data-cs="1" placeholder="Search customers…"><select class="gc-df-in" data-k="customerId" size="7"><option value="">— choose the customer —</option>' + customers().map(function(c){ return opt(c.id, p.customerId, (s(c.name) || s(c.company)) + (c.address ? ' — ' + s(c.address) : '')); }).join('') + '</select><div class="gc-df-note">Not on the list? Add them in Customers first.</div>';
    default: return inp(f.field || it.key, 'text');
  }
}
function openFix(pid, key, lead){
  var p = lead ? leadsList().filter(function(l){ return s(l.id) === s(pid); })[0] : proj(pid), it = itemOf(key);
  if (!p || !it) return;
  var f = it.fix || {};
  if (f.open) { openJob(pid, f.open); return; }
  var old = D.getElementById('gc-df-fix'); if (old) old.remove();
  var ov = D.createElement('div'); ov.id = 'gc-df-fix'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('data-gcnav-ignore', '1');
  ov.innerHTML = '<div class="gc-df-sheet" role="dialog" aria-label="Fix ' + esc(it.label) + '"><div class="gc-df-fh"><b>' + esc(it.label) + '</b><button type="button" class="gc-df-x" data-df="fixx">✕</button></div>' +
    '<div class="gc-df-fs">' + esc((s(p.autoPO) ? s(p.autoPO) + ' · ' : '') + (s(p.name || p.title || p.client) || 'Job')) + '</div>' +
    '<div class="gc-df-fb">' + fixHtml(null, it, p, lead) + '</div>' +
    '<div class="gc-df-fa"><button type="button" class="gc-df-b pri" data-df="fixsave">Save</button>' + (lead ? '<button type="button" class="gc-df-b" data-df="fixlead">Open the lead</button>' : '<button type="button" class="gc-df-b" data-df="fixjob">Open the job</button>') + '</div></div>';
  D.body.appendChild(ov);
  var first = ov.querySelector('.gc-df-in'); if (first) later(function(){ try { first.focus(); } catch (e) {} }, 30);
  ov.addEventListener('input', function(e){ var t = e.target; if (t && t.getAttribute('data-cs')) { var q = low(t.value), sel = ov.querySelector('select[data-k="customerId"]'); [].forEach.call(sel.options, function(o, i){ if (i) o.hidden = !!q && low(o.textContent).indexOf(q) < 0; }); } });
  ov.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-df],[data-pick]'); if (e.target === ov) { ov.remove(); return; } if (!b) return;
    if (b.hasAttribute('data-pick')) { ov.querySelector('[data-k="' + b.getAttribute('data-pick') + '"]').value = b.getAttribute('data-v'); [].forEach.call(ov.querySelectorAll('.gc-df-chip'), function(x){ x.classList.toggle('on', x === b); }); return; }
    var a = b.getAttribute('data-df');
    if (a === 'fixx') { ov.remove(); return; }
    if (a === 'fixjob') { ov.remove(); openJob(pid); return; }
    if (a === 'fixlead') { ov.remove(); openLead(pid); return; }
    if (a === 'fixsave') {
      var vals = {}, any = false;
      [].forEach.call(ov.querySelectorAll('[data-k]'), function(x){ var k = x.getAttribute('data-k'), val = x.type === 'checkbox' ? x.checked : s(x.value); if (x.type === 'checkbox' ? val : val !== '') any = true; vals[k] = val; });
      if (!any) { toast('Type it in first — nothing was saved.'); return; }
      var apply = function(q){
        Object.keys(vals).forEach(function(k){
          var val = vals[k];
          if (k.indexOf('adjuster.') === 0) { var a2 = Object.assign({}, q.adjuster && typeof q.adjuster === 'object' ? q.adjuster : {}); a2[k.slice(9)] = val; q.adjuster = a2; return; }
          if (k === 'retainageNone' || k === 'billingSame') { if (val) q[k] = true; else delete q[k]; return; }
          if (val === '') return;
          if (k === 'contract') { q.contract = parseFloat(val.replace(/[$,\s]/g, '')) || q.contract; return; }
          if (k === 'retainagePct') { q.retainagePct = parseFloat(val) || 0; return; }
          q[k] = val;
        });
      };
      var ok = lead ? patchLead(pid, apply) : patchProject(pid, apply);
      ov.remove(); toast(ok ? '✓ Saved — ' + it.label : 'Could not save here — open the job.');
    }
  });
}

/* ── the board ── */
var UI = { pm: '', stage: '', q: '', focus: '', showLeads: false, mine: false, n: 60 };
function scopeJobs(res){
  var L = res ? res.jobs : [];
  if (!full() || UI.mine) L = L.filter(function(j){ var p = proj(j.pid); return p && mine(p); });
  if (UI.pm === '__none') L = L.filter(function(j){ return !s(j.pm); });
  else if (UI.pm) L = L.filter(function(j){ return sameName(j.pm, UI.pm); });
  if (UI.stage) L = L.filter(function(j){ return j.stage === UI.stage; });
  if (UI.q) { var q = low(UI.q); L = L.filter(function(j){ return low(j.name + ' ' + j.po + ' ' + j.pm).indexOf(q) >= 0; }); }
  if (UI.focus) { var f = L.filter(function(j){ return j.pid === UI.focus; }); if (f.length) L = f.concat(L.filter(function(j){ return j.pid !== UI.focus; })); }
  return L;
}
function scoreCls(n){ return n >= 80 ? 'g' : n >= 50 ? 'o' : 'r'; }
function jobCard(j, lead){
  var p = lead ? null : proj(j.pid), na = (lead ? (leadsList().filter(function(l){ return s(l.id) === j.id; })[0] || {}) : p || {}).dataNA || {}, id = lead ? j.id : j.pid;
  var head = lead ? '<b>' + esc(j.name || 'Lead') + '</b><small>Lead</small>'
    : '<b>' + esc((j.po ? j.po + ' · ' : '') + (j.name || 'Job')) + '</b><small>' + esc([j.pm ? 'PM ' + j.pm : 'No PM', J.STAGE_LABEL[j.stage], j.kind && j.kind.insurance ? 'Insurance' : '', j.kind && j.kind.commercial ? 'Commercial' : ''].filter(Boolean).join(' · ')) + '</small>';
  var rows = j.need.map(function(m){
    return '<div class="gc-df-it"><span class="gc-df-dot"></span><span class="l">' + esc(m.label) + '</span>' +
      '<button type="button" class="gc-df-b pri" data-df="fix" data-id="' + esc(id) + '" data-k="' + m.key + '"' + (lead ? ' data-lead="1"' : '') + '>Fix</button>' +
      (full() && m.key !== 'name' ? '<button type="button" class="gc-df-b" data-df="na" data-id="' + esc(id) + '" data-k="' + m.key + '"' + (lead ? ' data-lead="1"' : '') + ' title="This item does not apply to this job — stop asking">N/A for this job</button>' : '') + '</div>';
  }).join('');
  var nas = (j.na || []).map(function(k){ var it = itemOf(k), by = na[k] && na[k].by; return '<span class="gc-df-na">N/A: ' + esc(it ? it.label : k) + (by ? ' (' + esc(by) + ')' : '') + (full() ? ' <button type="button" data-df="unna" data-id="' + esc(id) + '" data-k="' + k + '"' + (lead ? ' data-lead="1"' : '') + '>undo</button>' : '') + '</span>'; }).join('');
  return '<div class="gc-df-job' + (UI.focus === id ? ' focus' : '') + '" data-pid="' + esc(id) + '"><div class="gc-df-jh"><div class="t">' + head + '</div>' +
    '<span class="gc-df-score ' + scoreCls(j.score) + '">' + j.score + '% · ' + j.need.length + ' missing</span>' +
    (lead ? '<button type="button" class="gc-df-b" data-df="openlead" data-id="' + esc(id) + '">Open</button>' : '<button type="button" class="gc-df-b" data-df="open" data-id="' + esc(id) + '">Open job</button>') + '</div>' +
    '<div class="gc-df-items">' + rows + '</div>' + (nas ? '<div class="gc-df-nas">' + nas + '</div>' : '') + '</div>';
}
function prefOf(e){ return EXTRA.prefs.filter(function(x){ return low(x.email) === low(e); })[0] || {}; }
function boardHtml(){
  var res = all(true); if (!res) return '<div class="gc-df-empty">The jobs are still loading…</div>';
  var L = scopeJobs(res), pms = {}, rep = EXTRA.report;
  res.jobs.forEach(function(j){ if (s(j.pm)) pms[s(j.pm)] = 1; });
  var title = full() && !UI.mine ? '🧾 Missing job data' : '🧾 My jobs — missing data';
  var sum = full() && !UI.mine ? '<b>' + res.needInfo + '</b> of ' + res.checked + ' jobs need info · <b>' + res.complete + '</b> complete' : '<b>' + L.length + '</b> of your jobs need info';
  var stages = [['', 'All'], ['won', 'Won'], ['active', 'Active'], ['complete', 'Completed'], ['estimate', 'Estimate going out'], ['bidding', 'Bidding']];
  var top = res.top.slice(0, 6).map(function(t){ return '<span class="gc-df-top">' + esc(t.label) + ' <b>' + t.count + '</b></span>'; }).join('');
  var leads = full() && !UI.mine ? res.leads : [];
  var pf = prefOf(myEmail());
  return '<div class="gc-df-h"><b>' + title + '</b><span class="sp"></span>' +
    (full() ? '<button type="button" class="gc-df-b" data-df="prefs" title="My morning alert">🔔 My morning alert</button>' : '') +
    '<button type="button" class="gc-df-x" data-df="close">✕</button></div>' +
    '<div class="gc-df-sub">' + sum + '. What a job needs follows its stage — a bidding job only its name and address.' + (rep && rep.at ? ' Nightly check: ' + esc(new Date(rep.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) + '.' : '') + ' Nothing here is filled in by itself.</div>' +
    (UI.prefs ? '<div class="gc-df-prefs"><b>🔔 My morning alert</b> (about 7 AM, Monday–Saturday, when jobs need info) ' +
      ['mail:📧 E-mail', 'push:📱 Phone push', 'app:🔔 In the CRM'].map(function(x){ var k = x.split(':')[0]; return '<label><input type="checkbox" data-pf="' + k + '"' + (pf[k] === false ? '' : ' checked') + '> ' + esc(x.split(':')[1]) + '</label>'; }).join('') + ' <span class="gc-df-note">Never a text.</span></div>' : '') +
    (top && full() && !UI.mine ? '<div class="gc-df-tops">' + top + '</div>' : '') +
    '<div class="gc-df-ctl">' +
      (full() ? '<select data-df-f="pm"><option value="">All PMs</option>' + opt('__none', UI.pm, 'No PM') + Object.keys(pms).sort().map(function(n){ return opt(n, UI.pm); }).join('') + '</select>' : '') +
      '<select data-df-f="stage">' + stages.map(function(x){ return opt(x[0], UI.stage, x[1]); }).join('') + '</select>' +
      '<input data-df-f="q" placeholder="Find a job…" value="' + esc(UI.q) + '">' +
      (full() && isPm() ? '<label class="gc-df-ck"><input type="checkbox" data-df-f="mine"' + (UI.mine ? ' checked' : '') + '> Only my jobs</label>' : '') +
    '</div>' +
    '<div class="gc-df-list">' + (L.length ? L.slice(0, UI.n).map(function(j){ return jobCard(j); }).join('') + (L.length > UI.n ? '<button type="button" class="gc-df-morebtn" data-df="more">Show ' + Math.min(60, L.length - UI.n) + ' more (' + (L.length - UI.n) + ' left)</button>' : '') : '<div class="gc-df-empty">✓ Nothing missing here.</div>') +
    (leads.length ? '<div class="gc-df-sec"><button type="button" data-df="leads">' + (UI.showLeads ? '▾' : '▸') + ' Leads missing who / source / next step (' + leads.length + ')</button></div>' + (UI.showLeads ? leads.slice(0, 80).map(function(l){ return jobCard(l, true); }).join('') : '') : '') +
    '</div>';
}
function boardEl(){ return D.getElementById('gc-df-ov'); }
function paint(){
  var ov = boardEl(); if (!ov) return;
  var box = ov.querySelector('.gc-df-box'), list = box.querySelector('.gc-df-list'), keep = list ? list.scrollTop : 0;
  var act = D.activeElement, af = act && act.getAttribute && act.getAttribute('data-df-f'), pos = af === 'q' ? act.selectionStart : null;
  box.innerHTML = boardHtml();
  var l2 = box.querySelector('.gc-df-list'); if (l2 && keep) l2.scrollTop = keep;
  if (af) { var x = box.querySelector('[data-df-f="' + af + '"]'); if (x) { x.focus(); if (pos != null) try { x.setSelectionRange(pos, pos); } catch (e) {} } }
  if (UI.focus) { var fj = box.querySelector('.gc-df-job.focus'); if (fj && !keep) try { fj.scrollIntoView({ block: 'start' }); } catch (e) {} }
}
function open(o){
  o = o || {};
  if (!signedIn()) return false;
  css(); pull(true).then(function(ok){ if (ok) paint(); });
  UI.focus = s(o.pid); UI.mine = !full() || !!o.mine; if (o.pm != null) UI.pm = s(o.pm); UI.n = 60;
  var ov = boardEl();
  if (!ov) { ov = D.createElement('div'); ov.id = 'gc-df-ov'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('data-gcnav-ignore', '1'); ov.innerHTML = '<div class="gc-df-box" role="dialog" aria-label="Missing job data"></div>'; D.body.appendChild(ov); wire(ov); }
  ov.style.display = '';
  paint();
  return true;
}
function close(){ var ov = boardEl(); if (ov) ov.remove(); }
function wire(ov){
  ov.addEventListener('click', function(e){
    if (e.target === ov) { close(); return; }
    var b = e.target.closest && e.target.closest('[data-df]'); if (!b) return;
    var a = b.getAttribute('data-df'), id = b.getAttribute('data-id'), k = b.getAttribute('data-k'), lead = b.getAttribute('data-lead') === '1';
    if (a === 'close') close();
    else if (a === 'open') openJob(id);
    else if (a === 'openlead') openLead(id);
    else if (a === 'fix') openFix(id, k, lead);
    else if (a === 'na') { if (setNA(id, k, true, lead)) { toast('Marked N/A for this job — it will not be asked again.'); later(paint, 450); } }
    else if (a === 'unna') { if (setNA(id, k, false, lead)) later(paint, 450); }
    else if (a === 'more') { UI.n += 60; paint(); }
    else if (a === 'leads') { UI.showLeads = !UI.showLeads; paint(); }
    else if (a === 'prefs') { UI.prefs = !UI.prefs; paint(); }
  });
  ov.addEventListener('change', function(e){
    var t = e.target, f = t.getAttribute && t.getAttribute('data-df-f');
    if (f === 'pm' || f === 'stage') { UI[f] = t.value; UI.n = 60; paint(); return; }
    if (f === 'mine') { UI.mine = t.checked; paint(); return; }
    var pk = t.getAttribute && t.getAttribute('data-pf');
    if (pk) {
      var me = myEmail(), val = !!t.checked;
      kvWriteList('gc_datafull_prefs', function(list){ var r = list.filter(function(x){ return low(x.email) === me; })[0]; if (!r) { r = { email: me }; list.push(r); } r[pk] = val; r.at = nowIso(); return list; })
        .then(function(l){ EXTRA.prefs = l; toast('✓ Saved — ' + (val ? 'on' : 'off')); }, function(err){ t.checked = !val; toast('Could not save: ' + s(err && err.message)); });
    }
  });
  ov.addEventListener('input', function(e){ var t = e.target; if (t.getAttribute && t.getAttribute('data-df-f') === 'q') { UI.q = t.value; clearTimeout(UI.qt); UI.qt = later(paint, 250); } });
}

/* ── the cards on the homes ── */
function topJobs(n, onlyMine){
  var res = all(); if (!res) return null;
  var L = res.jobs; if (onlyMine) L = L.filter(function(j){ var p = proj(j.pid); return p && mine(p); });
  return { res: res, list: L, top: L.slice(0, n) };
}
function miniRows(L, withFix){
  return L.map(function(j){
    var m = j.need.slice(0, 3).map(function(x){ return x.label; }).join(', ') + (j.need.length > 3 ? ' +' + (j.need.length - 3) : '');
    return '<div class="gc-ra-item gc-df-mini"><div class="t"><b>' + esc((j.po ? j.po + ' · ' : '') + (j.name || 'Job')) + '</b><small>' + esc(j.score + '% · ' + m + (j.pm ? ' · PM ' + j.pm : '')) + '</small></div><div class="b">' +
      (withFix && j.need[0] ? '<button type="button" class="gc-ra-sm pri" data-df-home="fix" data-id="' + esc(j.pid) + '" data-k="' + j.need[0].key + '">Fix ' + esc(j.need[0].label) + '</button>' : '') +
      '<button type="button" class="gc-ra-sm" data-df-home="board" data-id="' + esc(j.pid) + '">All ' + j.need.length + '</button></div></div>';
  }).join('');
}
function deskCard(app){
  var pmMode = app === 'pm', T = topJobs(pmMode ? 8 : 6, pmMode); if (!T) return '';
  var title = (pmMode ? '🧾 My jobs — missing data' : '🧾 Missing job data') + ' (' + T.list.length + ')';
  var body = T.list.length ? (pmMode ? '' : '<div class="gc-df-cardsum">' + T.res.needInfo + ' of ' + T.res.checked + ' jobs need info · ' + T.res.top.slice(0, 3).map(function(t){ return esc(t.label) + ' ' + t.count; }).join(' · ') + '</div>') + miniRows(T.top, true)
    : '<div class="gc-ra-empty">✓ ' + (pmMode ? 'Your jobs have what their stage needs.' : 'Every job has what its stage needs.') + '</div>';
  return '<section class="gc-ra-card" data-card="datafull"><div class="ch"><b>' + title + '</b><button type="button" class="gc-ra-link" data-df-home="board">Open board ›</button></div><div class="cb">' + body + '</div></section>';
}
function mountDesk(){
  var desk = D.getElementById('gc-ra-desk'); if (!desk || desk.style.display === 'none') return;
  var app = desk.getAttribute('data-app'), cards = desk.querySelector('.gc-ra-cards');
  if (!cards || !/^(admin|office|pm)$/.test(app || '')) return;
  if (app === 'pm' && !isPm() && !full()) return;
  var h = deskCard(app), cur = cards.querySelector('[data-card="datafull"]');
  if (cur && cur.__h === h) return;
  var el = D.createElement('div'); el.innerHTML = h; var sec = el.firstChild; if (!sec) return; sec.__h = h;
  if (cur) cur.replaceWith(sec); else { var after = cards.querySelector('[data-card="appr"]'); if (after && after.nextSibling) cards.insertBefore(sec, after.nextSibling); else cards.appendChild(sec); }
}
/* GrayCo Field home (phone): one line under the quick buttons */
function mountField(){
  var home = D.querySelector('#_gcJobPick.gc-fh'); if (!home) return;
  var app = home.getAttribute('data-ra') || '', pmMode = app === 'pm' || (!full() && isPm());
  if (!full() && !pmMode) return;
  var T = topJobs(3, pmMode); if (!T) return;
  var h = '<div class="fh-sec gc-df-fsec"><span>🧾 ' + (pmMode ? 'My jobs missing data' : 'Missing job data') + ' (' + T.list.length + ')</span><button type="button" data-df-home="board">Open ›</button></div>' +
    (pmMode && T.top.length ? '<div class="gc-df-fmini">' + T.top.map(function(j){ return '<button type="button" data-df-home="board" data-id="' + esc(j.pid) + '"><b>' + esc(j.name || 'Job') + '</b><span>' + esc(j.need.slice(0, 2).map(function(x){ return x.label; }).join(', ') + (j.need.length > 2 ? ' +' + (j.need.length - 2) : '')) + '</span></button>'; }).join('') + '</div>' : '');
  var cur = home.querySelector('.gc-df-fwrap');
  if (cur && cur.__h === h) return;
  var w = D.createElement('div'); w.className = 'gc-df-fwrap'; w.innerHTML = h; w.__h = h;
  if (cur) { cur.replaceWith(w); return; }
  var q = home.querySelector('.gc-ra-q'), wrap = home.querySelector('.fh-wrap') || home;
  if (q && q.parentNode) q.parentNode.insertBefore(w, q.nextSibling); else if (wrap.firstChild) wrap.insertBefore(w, wrap.firstChild.nextSibling); else wrap.appendChild(w);
}
/* 🏢 Office tab and ⚙ Admin: one card at the top */
function bannerHtml(){
  var T = topJobs(5, false); if (!T) return '';
  return '<div class="gc-df-banner" data-df-banner="1"><div class="t"><b>🧾 Missing job data</b> — ' + (T.list.length ? T.res.needInfo + ' of ' + T.res.checked + ' jobs need info' + (T.res.top[0] ? ' · most missing: ' + T.res.top.slice(0, 3).map(function(t){ return esc(t.label) + ' (' + t.count + ')'; }).join(', ') : '') : '✓ every job has what its stage needs') + '</div>' +
    '<button type="button" class="gc-df-b pri" data-df-home="board">Open board</button></div>';
}
function mountBanner(host, where){
  if (!host) return;
  var h = bannerHtml(), cur = host.querySelector(':scope > .gc-df-banner');
  if (cur && cur.__h === h) return;
  var w = D.createElement('div'); w.innerHTML = h; var el = w.firstChild; if (!el) return; el.__h = h; el.setAttribute('data-where', where);
  if (cur) cur.replaceWith(el); else host.insertBefore(el, host.firstChild);
}
function adminHost(){
  if (low(lsGet('grayco_view')) !== 'admin') return null;
  var m = D.querySelector('main'); if (!m) return null;
  var h = [].slice.call(m.querySelectorAll('h1,h2')).filter(function(x){ return /admin/i.test(s(x.textContent)) && x.getClientRects().length; })[0];
  return h && h.parentElement ? h.parentElement : m.firstElementChild;
}
function mountHomes(){
  if (!canSee()) return;
  try { mountDesk(); } catch (e) { warn(e); }
  try { mountField(); } catch (e) { warn(e); }
  if (full()) {
    try { var om = D.getElementById('gc-om-mount'); if (om && om.firstElementChild) mountBanner(om, 'office'); } catch (e) { warn(e); }
    try { var ah = adminHost(); if (ah) mountBanner(ah, 'admin'); } catch (e) { warn(e); }
  }
}
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest && e.target.closest('[data-df-home]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  var a = b.getAttribute('data-df-home'), id = b.getAttribute('data-id');
  if (a === 'fix') openFix(id, b.getAttribute('data-k'));
  else if (a === 'chip') open({ pid: id, mine: !full() });
  else open({ pid: id || '', mine: !full() });
}, true);

/* ── the morning alert, once in the CRM (admins + the office who left "In the CRM" on) ── */
function alertCheck(){
  if (!full() || !EXTRA.report || !EXTRA.report.alert) return;
  var a = EXTRA.report.alert, me = myEmail(), k = 'gc_datafull_seen';
  if (a.ymd !== today() || (Array.isArray(a.to) && a.to.length && a.to.indexOf(me) < 0) || prefOf(me).app === false) return;
  if (lsGet(k) === a.ymd) return;
  lsSet(k, a.ymd);
  var t = D.createElement('div'); t.id = 'gc-df-alert'; t.setAttribute('data-gc-keep', '1'); t.setAttribute('data-gcnav-ignore', '1');
  t.innerHTML = '<div class="m"><b></b><small></small></div><button type="button" class="gc-df-b pri" data-df-home="board">Open</button><button type="button" class="gc-df-b" data-x="1">✕</button>';
  t.querySelector('b').textContent = s(a.text); t.querySelector('small').textContent = arr(a.top).length ? 'Most missing: ' + a.top.join(' · ') : '';
  t.addEventListener('click', function(e){ if (e.target.closest('[data-x],[data-df-home]')) later(function(){ t.remove(); }, 0); });
  D.body.appendChild(t); later(function(){ if (t.parentNode) t.remove(); }, 60000);
}
/* #datafull (the e-mail's link) — #datafull=<job id> opens that job first */
function hashCheck(){
  var h = s(location.hash); if (!/^#datafull\b/.test(h)) return;
  if (!canSee() || !arr(C().projects).length) return;
  var pid = decodeURIComponent((h.split('=')[1] || ''));
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
  open({ pid: pid });
}

/* ── new job: only the name and the address; "＋ More details (optional)" holds every other choice ── */
function moreHtml(ctx){
  var tpls = []; try { tpls = W._gcSchedTemplates ? arr(W._gcSchedTemplates.list()) : []; } catch (e) {}
  var field = ctx === 'field', i = function(k, ph, type){ return '<input class="gc-df-mi" data-m="' + k + '" type="' + (type || 'text') + '" placeholder="' + esc(ph) + '">'; };
  return '<button type="button" class="gc-df-moreb" data-mt="1" aria-expanded="false">＋ More details (optional)</button>' +
    '<div class="gc-df-morex"><div class="gc-df-mnote">All optional — fill in what you know now; the 🧾 data check asks for the rest when the job’s stage needs it.</div>' +
    (field ? '<div class="gc-df-mg" data-g="job"><b>Job</b><select class="gc-df-mi" data-m="pm"><option value="">PM: me</option>' + pmNames().map(function(n){ return opt(n, ''); }).join('') + '</select>' + i('contract', 'Contract $', 'number') + '<label class="gc-df-ml">Start date' + i('startDate', '', 'date') + '</label>' + i('clientEmail', 'Customer e-mail', 'email') + '</div>' : '') +
    '<div class="gc-df-mg" data-g="cust"><b>Customer</b><input class="gc-df-mi" data-mcs="1" placeholder="Link a customer — search…"><select class="gc-df-mi" data-m="customerId"><option value="">— no customer linked yet —</option>' + customers().slice(0, 1500).map(function(c){ return opt(c.id, '', (s(c.name) || s(c.company)) + (c.address ? ' — ' + s(c.address) : '')); }).join('') + '</select>' +
      '<div class="gc-df-chips" data-pickg="preferredContact"><span>Preferred contact:</span>' + ['Call', 'Text', 'E-mail'].map(function(x){ return '<button type="button" class="gc-df-chip" data-mpick="preferredContact" data-v="' + x + '">' + x + '</button>'; }).join('') + '</div>' +
      i('billingAddress', 'Billing address') + '<label class="gc-df-ck"><input type="checkbox" data-m="billingSame"> Billing address is the same as the job address</label></div>' +
    '<div class="gc-df-mg" data-g="ins"><label class="gc-df-chip big"><input type="checkbox" data-m="isInsurance"> 🛡 Insurance / mitigation job</label><div class="gc-df-sub2">' + i('claimNumber', 'Claim number') + '<label class="gc-df-ml">Date of loss' + i('dateOfLoss', '', 'date') + '</label>' + i('adjuster.name', 'Adjuster name') + i('adjuster.phone', 'Adjuster phone', 'tel') + i('adjuster.email', 'Adjuster e-mail', 'email') + '<div class="gc-df-note">Staff only — never shown to the customer.</div></div></div>' +
    '<div class="gc-df-mg" data-g="com"><label class="gc-df-chip big"><input type="checkbox" data-m="isCommercial"> 🏢 Commercial job</label><div class="gc-df-sub2">' + i('gcContact', 'GC / contact') + i('customerPO', "Customer's PO") + i('retainagePct', 'Retainage %', 'number') + '<label class="gc-df-ck"><input type="checkbox" data-m="retainageNone"> No retainage</label></div></div>' +
    (tpls.length ? '<div class="gc-df-mg" data-g="tpl"><b>Schedule templates</b><div class="gc-df-note">Nothing is put on the schedule unless you click “Apply template” (it goes on as a draft for the PM to accept).</div><div class="gc-df-chips">' + tpls.map(function(t){ return '<button type="button" class="gc-df-chip" data-mtpl="' + esc(t.id) + '">' + esc(t.name) + ' · Apply template</button>'; }).join('') + '</div></div>' : '') +
    '</div>';
}
function wireMore(box){
  box.addEventListener('click', function(e){
    var t = e.target.closest && e.target.closest('[data-mt],[data-mpick],[data-mtpl]'); if (!t) return;
    e.preventDefault(); e.stopPropagation();
    if (t.hasAttribute('data-mt')) { var host = box.__host || box.parentElement, on = host.getAttribute('data-df-collapsed') === '1'; host.setAttribute('data-df-collapsed', on ? '0' : '1'); t.setAttribute('aria-expanded', on ? 'true' : 'false'); t.textContent = on ? '－ Fewer details' : '＋ More details (optional)'; return; }
    if (t.hasAttribute('data-mpick')) { var was = t.classList.contains('on'); [].forEach.call(box.querySelectorAll('[data-mpick="' + t.getAttribute('data-mpick') + '"]'), function(x){ x.classList.remove('on'); }); if (!was) t.classList.add('on'); return; }
    if (t.hasAttribute('data-mtpl')) { t.classList.toggle('on'); t.textContent = t.textContent.replace(/ · (Apply template|✓ will be applied)$/, '') + (t.classList.contains('on') ? ' · ✓ will be applied' : ' · Apply template'); }
  }, true);
  box.addEventListener('input', function(e){ var t = e.target; if (t && t.getAttribute('data-mcs')) { var q = low(t.value), sel = box.querySelector('select[data-m="customerId"]'); [].forEach.call(sel.options, function(o, n){ if (n) o.hidden = !!q && low(o.textContent).indexOf(q) < 0; }); } });
}
function readMore(box){
  var v = {}, tpl = [];
  [].forEach.call(box.querySelectorAll('[data-m]'), function(x){ var k = x.getAttribute('data-m'); if (x.type === 'checkbox') { if (x.checked) v[k] = true; } else if (s(x.value)) v[k] = s(x.value); });
  [].forEach.call(box.querySelectorAll('[data-mpick].on'), function(x){ v[x.getAttribute('data-mpick')] = x.getAttribute('data-v'); });
  [].forEach.call(box.querySelectorAll('[data-mtpl].on'), function(x){ tpl.push(x.getAttribute('data-mtpl')); });
  return { v: v, tpl: tpl };
}
/* what the person picked goes on the new job as it is made (patch JA's stamp is called with every new job) */
function applyMore(p, ctx){
  var box = D.querySelector('.gc-df-more[data-ctx="' + ctx + '"]'); if (!box || !p) return;
  var m = readMore(box), v = m.v;
  Object.keys(v).forEach(function(k){
    var val = v[k];
    if (k.indexOf('adjuster.') === 0) { p.adjuster = Object.assign({}, p.adjuster && typeof p.adjuster === 'object' ? p.adjuster : {}); p.adjuster[k.slice(9)] = val; return; }
    if (k === 'contract') { var n = parseFloat(String(val).replace(/[$,\s]/g, '')); if (n > 0) p.contract = n; return; }
    if (k === 'retainagePct') { p.retainagePct = parseFloat(val) || 0; return; }
    if (k === 'pm' && ctx !== 'field') return;
    p[k] = val;
  });
  if (m.tpl.length && p.id) {
    var pid = p.id, list = m.tpl.slice();
    later(function(){ list.forEach(function(id, n){ later(function(){ try { if (W._gcSchedTemplates) W._gcSchedTemplates.apply(pid, { template: id, force: n > 0 }); } catch (e) { warn(e); } }, n * 400); }); }, 2500);
  }
  if (Object.keys(v).length || m.tpl.length) { p.dataEnteredAt = p.dataEnteredAt || nowIso(); }
  [].forEach.call(box.querySelectorAll('[data-m]'), function(x){ if (x.type === 'checkbox') x.checked = false; else x.value = ''; });
  [].forEach.call(box.querySelectorAll('.on'), function(x){ x.classList.remove('on'); });
}
function hookStamp(){
  var JA = W._gcJA; if (!JA || typeof JA.stamp !== 'function' || JA.stamp.__df) return;
  var orig = JA.stamp;
  var f = function(p, ctx){ var r = orig.apply(this, arguments); try { applyMore(r && typeof r === 'object' ? r : p, ctx); } catch (e) { warn(e); } return r; };
  f.__df = true; JA.stamp = f;
}
/* the field form (patch CC2 "＋ New project") is ours to arrange: name + address on top, the rest under More details */
function decorateField(ov){
  if (!ov || ov.querySelector('.gc-df-more')) return;
  var dlg = ov.querySelector('[role="dialog"]'), err = ov.querySelector('#gc-cc2-err'); if (!dlg || !err) return;
  css();
  var nm = ov.querySelector('#gc-cc2-name'), ad = ov.querySelector('#gc-cc2-addr');
  [nm, ad].forEach(function(x){ var l = x && x.closest('label'); if (l && l.firstChild && l.firstChild.nodeType === 3 && !/\*/.test(l.firstChild.nodeValue)) l.firstChild.nodeValue = l.firstChild.nodeValue + ' *'; });
  var box = D.createElement('div'); box.className = 'gc-df-more'; box.setAttribute('data-ctx', 'field'); box.setAttribute('data-df-collapsed', '1'); box.innerHTML = moreHtml('field'); box.__host = box;
  dlg.insertBefore(box, err);
  var x = box.querySelector('.gc-df-morex');
  ['#gc-cc2-phone', '#gc-cc2-type'].forEach(function(sel){ var el = ov.querySelector(sel), l = el && el.closest('label'); if (l) x.insertBefore(l, x.children[1] || null); });
  var ja = ov.querySelector('#gc-ja-box-field'); if (ja) x.appendChild(ja);
  wireMore(box);
}
function hookField(){
  var f = W._gcSelfNewJob; if (typeof f !== 'function' || f.__df) return;
  var g = function(opts){ var ov = f.apply(this, arguments); try { decorateField(ov || D.getElementById('gc-cc2-new')); } catch (e) { warn(e); } return ov; };
  g.__df = true; W._gcSelfNewJob = g;
}
/* the desk forms (Projects → New Project, 🚀 Launch Job) are the CRM's own: their other fields are folded away (not moved) */
/* kept in view: the name and the address (asked for), and the customer's name next to it (the job's name in the Field form) */
var REQ = /^\s*(project\s*name|job\s*name|name|customer\s*\/\s*job\s*name|client|customer|address|job\s*address|project\s*address|service\s*address)\s*\*?\s*$/i;
function decorateDesk(ctx){
  var host = D.querySelector('[data-gc-ja="' + ctx + '"]'); if (!host || !host.getClientRects().length) return;
  var form = host.parentElement; if (!form) return;
  if (form.querySelector(':scope > .gc-df-more[data-ctx="' + ctx + '"]')) return;
  css();
  var fields = [].slice.call(form.querySelectorAll('label, input, select, textarea')).filter(function(x){ return !x.closest('.gc-df-more') && !host.contains(x); });
  var wraps = [], seen = [];
  fields.forEach(function(x){
    var w = x; while (w.parentElement && w.parentElement !== form && !(w.parentElement.children.length > 3 && getComputedStyle(w.parentElement).display === 'grid')) w = w.parentElement;
    if (w.parentElement === form) return;
    if (seen.indexOf(w) < 0) { seen.push(w); wraps.push(w); }
  });
  if (!wraps.length) return;
  wraps.forEach(function(w){
    var lab = w.querySelector('label') || w.firstElementChild, t = s(lab && lab.childNodes[0] && lab.childNodes[0].nodeType === 3 ? lab.childNodes[0].nodeValue : lab && lab.textContent);
    if (REQ.test(t)) { w.setAttribute('data-df-req', '1'); return; }
    w.setAttribute('data-df-opt', '1');
  });
  host.setAttribute('data-df-opt', '1');
  form.setAttribute('data-df-collapsed', '1');
  var box = D.createElement('div'); box.className = 'gc-df-more'; box.setAttribute('data-ctx', ctx); box.innerHTML = moreHtml(ctx); box.__host = form;
  form.insertBefore(box, host);
  wireMore(box);
}

/* ── the job header chip: "Data 80% · 3 missing" ── */
function chipText(pid){ var r = checkOne(pid); return r ? J.chip(r) : ''; }
function headerEl(){
  var p = W._gcOpenProject; if (!p || !p.id || low(lsGet('grayco_view')) !== 'projects') return null;
  var m = D.querySelector('main'); if (!m) return null;
  var name = s(p.name); if (!name) return null;
  var hs = [].slice.call(m.querySelectorAll('h1,h2,h3')).filter(function(h){ return h.getClientRects().length && s(h.textContent).indexOf(name) >= 0 && !h.closest('#gc-df-ov,.gc-df-chipw'); });
  return hs[0] || null;
}
function mountChip(){
  var h = headerEl(), cur = D.querySelector('.gc-df-chipw');
  if (!h) { if (cur) cur.remove(); return; }
  var p = W._gcOpenProject, t = chipText(p.id), r = CACHE.byPid[p.id] || checkOne(p.id);
  if (!t) { if (cur) cur.remove(); return; }
  var cls = !r || !r.need.length ? (r && r.stage === 'bidding' ? 'q' : 'g') : scoreCls(r.score);
  var html = '<button type="button" class="gc-df-chipb ' + cls + '" data-df-home="chip" data-id="' + esc(p.id) + '" title="' + esc(r && r.need.length ? 'Missing: ' + r.need.map(function(x){ return x.label; }).join(', ') : (r && r.stage === 'bidding' ? 'A bidding job only needs its name and address' : 'Everything this job’s stage needs is in')) + '">🧾 ' + esc(t) + '</button>';
  if (cur && cur.__pid === p.id && cur.__h === html && cur.previousElementSibling === h) return;
  if (cur) cur.remove();
  var w = D.createElement('span'); w.className = 'gc-df-chipw'; w.setAttribute('data-gcnav-ignore', '1'); w.innerHTML = html; w.__pid = p.id; w.__h = html;
  h.parentNode.insertBefore(w, h.nextSibling);
}

/* ── styles ── */
function css(){
  if (D.getElementById('gc-df-css')) return;
  var st = D.createElement('style'); st.id = 'gc-df-css';
  st.textContent = [
    '#gc-df-ov{position:fixed;inset:0;z-index:100230;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;font-family:Inter,-apple-system,Segoe UI,sans-serif}',
    '#gc-df-ov .gc-df-box{background:#fff;color:#111827;width:min(980px,100% - 24px);height:min(92vh,980px);border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35)}',
    '.gc-df-h{display:flex;align-items:center;gap:8px;padding:14px 16px 6px;font-size:19px}.gc-df-h .sp{flex:1}',
    '.gc-df-sub{padding:0 16px 8px;color:#4b5563;font-size:13px;line-height:1.45}',
    '.gc-df-tops{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 8px}.gc-df-top{background:#f3f4f6;border-radius:999px;padding:3px 10px;font-size:12px;color:#374151}.gc-df-top b{color:#b91c1c}',
    '.gc-df-prefs{margin:0 16px 8px;padding:10px 12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;font-size:13px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}.gc-df-prefs label{display:inline-flex;gap:5px;align-items:center;font-weight:600}',
    '.gc-df-ctl{display:flex;flex-wrap:wrap;gap:8px;padding:4px 16px 10px;border-bottom:1px solid #e5e7eb}.gc-df-ctl select,.gc-df-ctl input{border:1px solid #d1d5db;border-radius:9px;padding:8px 10px;font:500 14px Inter,sans-serif;background:#fff;color:#111827}.gc-df-ctl input[data-df-f="q"]{flex:1;min-width:160px}',
    '.gc-df-list{flex:1;overflow-y:auto;padding:10px 16px 24px;-webkit-overflow-scrolling:touch}',
    '.gc-df-job{border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;margin-bottom:10px;background:#fff}.gc-df-job.focus{border-color:#2563eb;box-shadow:0 0 0 2px #bfdbfe}',
    '.gc-df-jh{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.gc-df-jh .t{flex:1;min-width:180px}.gc-df-jh .t b{display:block;font-size:15px;overflow-wrap:anywhere}.gc-df-jh .t small{color:#6b7280;font-size:12px}',
    '.gc-df-score{font-size:12px;font-weight:800;border-radius:999px;padding:3px 10px;white-space:nowrap}.gc-df-score.r{background:#fee2e2;color:#b91c1c}.gc-df-score.o{background:#ffedd5;color:#c2410c}.gc-df-score.g{background:#dcfce7;color:#166534}',
    '.gc-df-items{margin-top:6px}.gc-df-it{display:flex;align-items:center;gap:8px;padding:6px 2px;border-top:1px dashed #f1f5f9;flex-wrap:wrap}.gc-df-it .l{flex:1;min-width:140px;font-size:14px}.gc-df-dot{width:8px;height:8px;border-radius:50%;background:#ef4444;flex:none}',
    '.gc-df-b{border:1px solid #d1d5db;background:#fff;color:#1f2937;border-radius:9px;padding:6px 11px;font:700 12.5px Inter,sans-serif;cursor:pointer;white-space:nowrap}.gc-df-b:hover{border-color:#93c5fd}.gc-df-b.pri{background:#2563eb;border-color:#2563eb;color:#fff}',
    '.gc-df-x{border:none;background:#f3f4f6;border-radius:9px;font-size:16px;font-weight:800;padding:6px 11px;cursor:pointer;color:#111827}',
    '.gc-df-nas{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.gc-df-na{font-size:12px;color:#6b7280;background:#f9fafb;border:1px solid #e5e7eb;border-radius:999px;padding:2px 9px}.gc-df-na button{border:none;background:none;color:#2563eb;font-weight:700;cursor:pointer;padding:0 2px}',
    '.gc-df-sec{margin:14px 0 8px}.gc-df-sec button{background:none;border:none;color:#2563eb;font-weight:800;cursor:pointer;font-size:14px}',
    '.gc-df-morebtn{display:block;width:100%;margin:8px 0;padding:10px;border:1px dashed #cbd5e1;border-radius:10px;background:transparent;color:#2563eb;font-weight:800;cursor:pointer}',
    '.gc-df-empty{color:#6b7280;padding:24px 4px;text-align:center}',
    '#gc-df-fix{position:fixed;inset:0;z-index:100240;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;font-family:Inter,-apple-system,Segoe UI,sans-serif}',
    '#gc-df-fix .gc-df-sheet{background:#fff;color:#111827;width:min(460px,100% - 24px);border-radius:14px;padding:14px 16px 16px;box-shadow:0 16px 50px rgba(0,0,0,.35)}',
    '.gc-df-fh{display:flex;align-items:center;justify-content:space-between;font-size:17px}.gc-df-fs{color:#6b7280;font-size:13px;margin:2px 0 10px}',
    '.gc-df-fb{display:flex;flex-direction:column;gap:8px}.gc-df-in{border:1px solid #d1d5db;border-radius:9px;padding:10px;font:500 15px Inter,sans-serif;width:100%;box-sizing:border-box;background:#fff;color:#111827}',
    '.gc-df-fa{display:flex;gap:8px;margin-top:12px}.gc-df-fa .gc-df-b{padding:10px 14px;font-size:14px}',
    '.gc-df-ck{display:flex;gap:6px;align-items:center;font-size:13px;font-weight:600}.gc-df-note{font-size:12px;color:#6b7280}',
    '.gc-df-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.gc-df-chips span{font-size:12px;color:#6b7280}.gc-df-chip{border:1px solid #cbd5e1;background:#fff;color:#1f2937;border-radius:999px;padding:6px 12px;font:700 13px Inter,sans-serif;cursor:pointer}.gc-df-chip.on{background:#2563eb;border-color:#2563eb;color:#fff}',
    '#gc-df-toast{display:none;position:fixed;left:50%;transform:translateX(-50%);bottom:calc(96px + env(safe-area-inset-bottom,0px));z-index:2147483000;background:#111827;color:#fff;border-radius:12px;padding:12px 16px;font:600 14px Inter,sans-serif;text-align:center;max-width:calc(100% - 32px)}',
    '#gc-df-alert{position:fixed;top:calc(14px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:100244;background:#0f1d2f;color:#fff;border-radius:14px;padding:12px 14px;display:flex;gap:8px;align-items:center;width:min(480px,100% - 32px);box-sizing:border-box;font-family:Inter,Arial,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.45)}#gc-df-alert .m{flex:1;min-width:0}#gc-df-alert small{display:block;opacity:.8;font-size:12px;margin-top:2px}',
    '.gc-df-chipw{display:inline-block;margin:4px 0 4px 10px;vertical-align:middle}.gc-df-chipb{border:none;border-radius:999px;padding:3px 10px;font:700 12px Inter,sans-serif;cursor:pointer;white-space:nowrap}.gc-df-chipb.r{background:#fee2e2;color:#b91c1c}.gc-df-chipb.o{background:#ffedd5;color:#c2410c}.gc-df-chipb.g{background:#dcfce7;color:#166534}.gc-df-chipb.q{background:#f3f4f6;color:#6b7280}',
    '.gc-df-banner{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:10px 14px;margin:10px 0;font:500 14px Inter,sans-serif;color:#7c2d12}.gc-df-banner .t{flex:1;min-width:200px}',
    '.gc-df-cardsum{font-size:12.5px;color:#6b7280;padding:8px 4px 2px}',
    '.gc-df-fwrap .gc-df-fmini{display:flex;flex-direction:column;gap:6px;margin:0 4px 6px}.gc-df-fmini button{display:flex;flex-direction:column;align-items:flex-start;text-align:left;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;font:600 14px Inter,sans-serif;color:#111827;cursor:pointer}.gc-df-fmini span{font-size:12px;color:#b45309;font-weight:600}',
    /* new job forms */
    '[data-df-collapsed="1"] [data-df-opt],[data-df-collapsed="1"] .gc-df-morex{display:none!important}',
    '.gc-df-more{margin:10px 0 4px;grid-column:1/-1}',
    '.gc-df-moreb{display:block;width:100%;padding:11px;border:1px dashed #60a5fa;border-radius:10px;background:transparent;color:#2563eb;font:800 14px Inter,sans-serif;cursor:pointer;text-align:center}#gc-cc2-new .gc-df-moreb{color:#93c5fd;border-color:#2563eb}',
    '.gc-df-morex{margin-top:8px;display:flex;flex-direction:column;gap:10px}.gc-df-mnote{font-size:12px;opacity:.75}',
    '.gc-df-mg{display:flex;flex-direction:column;gap:6px;padding:10px;border:1px solid rgba(148,163,184,.35);border-radius:10px}.gc-df-mg>b{font-size:13px}',
    '.gc-df-mi{border:1px solid #94a3b8;border-radius:8px;padding:9px 10px;font:500 15px Inter,sans-serif;width:100%;box-sizing:border-box;background:#fff;color:#111827}',
    '#gc-cc2-new .gc-df-mi{background:#0f2440;color:#e2e8f0;border-color:#2563eb}#gc-cc2-new .gc-df-mg{color:#cbd5e1}#gc-cc2-new .gc-df-chip{background:#0f2440;color:#cbd5e1;border-color:#2563eb}#gc-cc2-new .gc-df-chip.on{background:#2563eb;color:#fff}',
    '.gc-df-ml{display:flex;flex-direction:column;gap:3px;font-size:12px;font-weight:700}.gc-df-chip.big{display:flex;gap:8px;align-items:center;border-radius:10px;width:max-content}',
    '.gc-df-mg .gc-df-sub2{display:none;flex-direction:column;gap:6px}.gc-df-mg:has(input[data-m="isInsurance"]:checked) .gc-df-sub2,.gc-df-mg:has(input[data-m="isCommercial"]:checked) .gc-df-sub2{display:flex}',
    '@media (max-width:700px){#gc-df-ov .gc-df-box{width:100%;height:100%;border-radius:0}.gc-df-it .gc-df-b{padding:8px 12px}}'
  ].join('\n');
  (D.head || D.documentElement).appendChild(st);
}

/* ── keep everything painted ── */
function paintAll(){
  if (!canSee()) return;
  try { mountHomes(); } catch (e) { warn(e); }
  try { mountChip(); } catch (e) { warn(e); }
  if (boardEl()) { var a = D.activeElement; if (!(a && boardEl().contains(a) && /INPUT|SELECT/.test(a.tagName))) { /* repaint only on data change */ var sg = CACHE.sig; all(); if (sg !== CACHE.sig) paint(); } }
}
function tick(){
  if (off()) return;
  try { hookStamp(); hookField(); } catch (e) { warn(e); }
  if (!signedIn()) return;
  css();
  try { decorateDesk('proj'); decorateDesk('launch'); } catch (e) { warn(e); }
  try { var f = D.getElementById('gc-cc2-new'); if (f) decorateField(f); } catch (e) { warn(e); }
  if (!canSee()) return;
  paintAll();
  hashCheck();
  if (full() && !D.hidden) pull(false).then(function(ok){ if (ok) alertCheck(); });
}
later(tick, 1500); RI.call(W, tick, 1200);
W.addEventListener('hashchange', function(){ later(hashCheck, 50); });

W._gcDataFull = {
  open: open, close: close, all: function(){ return all(true); }, check: checkOne, chip: chipText, fix: openFix,
  na: function(pid, key, on){ return setNA(pid, key, on !== false); }, pull: function(){ EXTRA.at = 0; return pull(true); },
  state: function(){ var r = all(); return { canSee: canSee(), full: full(), pm: isPm(), me: myName(), checked: r ? r.checked : 0, needInfo: r ? r.needInfo : 0, complete: r ? r.complete : 0, report: EXTRA.report ? { at: EXTRA.report.at, alert: EXTRA.report.alert || null } : null, board: !!boardEl() }; },
  rule: J
};
try { console.log('[GC] 🧾 Missing job data: one checklist per job, by its stage (patch DATAFULL) — _gcDataFull.state()'); } catch (e) {}
})();
