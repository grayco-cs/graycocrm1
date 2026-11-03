#!/usr/bin/env python3
"""Idempotent patch JOBSETUP: "What the customer gets" — the job-setup step on every new job.

  Owner 11/03: "choose what the customer gets and the automations we will use for this job — if it's default just say OK".
  Opens on its own right after a person makes a job (Launch Job, + New Project, a lead / estimate / bid / schedule /
  approval / RoofScout that becomes a job, the field view's "＋ New project") and when an estimate is entered or uploaded
  for a job whose setup was never confirmed (window._gcJobSetupConfirm(jobId) — the field "Upload estimate" (ESTUPLOAD)
  calls it, or dispatches the 'gc-estimate-saved' event with { detail: { jobId } }).

  The sheet:
    Portal sections      Photos · Documents · Updates · Payments / invoices · Messages · Requests ·
                         Maintenance plans (GrayCo Care) · Warranty / My home — prefilled from the defaults
                         (homeowner: all on; GC variant, we are the sub: no GrayCo Care, no Warranty / My home).
    Customer automations Weekly customer update · Portal invite e-mail · Review request / thank-you ·
                         Payment reminders · Referral gift — prefilled from the ⚡ Automations switches.
    [✓ Use defaults (OK)]  [Change…]
  OK records job.setupConfirmed = { by, at, defaults: true } and keeps the job on the defaults (it follows later changes
  of the ⚡ switches). Change… lets each line be ticked / unticked; only what differs from the default is stored
  (job.portalSections, job.autoOverrides { <⚡ key>: true | false }) — the server's portal and each automation follow the
  job's own choice for THIS job only (an automation that is off company-wide can run for one job, and the reverse).
  Nothing is sent from here.

  The job's Customer portal card shows "Customer gets: defaults ✓" or "Customer gets: custom (…)" with Edit; a job made
  before this, never confirmed, shows a small "Confirm job setup" button (it never blocks anything).

Every find-string must occur exactly once (else nothing is written).
Usage: python3 tools/patch_JOBSETUP.py [index.html]
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
MARK = '__GC_PATCH_JOBSETUP__'
src = open(path, encoding='utf-8').read()
if MARK in src:
    print('already patched'); sys.exit(0)

def once(old, new, label):
    global src
    n = src.count(old)
    assert n == 1, ('anchor count != 1', label, n)
    src = src.replace(old, new)

# 1. JA: right after a person makes a job, the job-setup sheet (it carries "⚙ More automations…" to the full JA box)
once("  if (!hadBox && ASK[ctx] && Date.now() - lastInput < 20000) ST(function(){ open(pid, { fresh: true, job: p }); }, 900);",
     "  if (Date.now() - lastInput < 20000 && W._gcJobSetupConfirm && W._gcJobSetupConfirm.CTX[ctx]) ST(function(){ W._gcJobSetupConfirm(pid, { fresh: true, job: p, ctx: ctx }); }, 900);   /* patch JOBSETUP */\n"
     "  else if (!hadBox && ASK[ctx] && Date.now() - lastInput < 20000) ST(function(){ open(pid, { fresh: true, job: p }); }, 900);",
     'JA after()')
# 2. JA: its save (the same one ⚙ Automations uses: local store → the list → the cloud)
once("  groupOf: groupOf, defaultsFor: defaultsFor, builtin: builtin, set: setJobAuto, renderBox: renderBox,",
     "  groupOf: groupOf, defaultsFor: defaultsFor, builtin: builtin, set: setJobAuto, renderBox: renderBox, doSave: function(pid, change){ var at = nowIso(); saving = saving.then(function(){ return doSave(pid, change, at); }, function(){ return doSave(pid, change, at); }); return saving; },   /* patch JOBSETUP */",
     'JA export')
# 3. the job's Customer portal card: "Customer gets: …  Edit" / "Confirm job setup"
once("  h += '<div data-q=\"panel\" hidden style=\"border-top:1px solid #EFEAE0;margin-top:8px;padding-top:8px;font-size:13px;display:flex;flex-direction:column;gap:8px\">';",
     "  try { if (window._gcJobSetupLine) h += window._gcJobSetupLine(p); } catch (_js) {}   /* patch JOBSETUP */\n"
     "  h += '<div data-q=\"panel\" hidden style=\"border-top:1px solid #EFEAE0;margin-top:8px;padding-top:8px;font-size:13px;display:flex;flex-direction:column;gap:8px\">';",
     'portal card')

BLOCK = r'''
<script id="gc-patch-jobsetup">
/* __GC_PATCH_JOBSETUP__ — "What the customer gets" (tools/patch_JOBSETUP.py) */
(function(W){
'use strict';
var D = W.document, ST = W.setTimeout.bind(W);
function s(v){ return v == null ? '' : String(v).trim(); }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function arr(v){ return Array.isArray(v) ? v : []; }
var SECTIONS = [
  ['photos', '📷 Photos'], ['docs', '📄 Documents'], ['updates', '📣 Updates'], ['payments', '💵 Payments / invoices'],
  ['messages', '💬 Messages'], ['requests', '➕ Requests'], ['care', '🛡 Maintenance plans (GrayCo Care)'], ['home', '🏠 Warranty / My home']
];
/* customer-facing ⚡ Automations, one per line (the ⚡ key each one follows) */
var AUTOS = [
  ['weekly_update', '📝 Weekly customer update (Friday, on ✅ Approvals)'],
  ['portal_invite_email', '✉️ Portal invite e-mail'],
  ['thank_you_queue', '⭐ Review request / thank-you'],
  ['final_invoice_reminders', '💵 Payment reminders (final invoice, every 15 days)'],
  ['referral_credits', '🎁 Referral gift']
];
var CTX = { launch: 1, proj: 1, estimate: 1, estbuilder: 1, bid: 1, lead: 1, roofscout: 1, approval: 1, schedule: 1, field: 1 };
function projects(){ return arr(W._crm && W._crm.projects); }
function proj(pid){ var id = String(pid); return projects().find(function(p){ return p && String(p.id) === id; }) || null; }
function myName(){ try { return s(localStorage.getItem('grayco_user')) || s(W.__GC_AUTH__ && W.__GC_AUTH__.email()) || 'someone'; } catch (e) { return 'someone'; } }
var COMPANY = /\b(inc|llc|l\.l\.c|corp|corporation|co\.|company|construction|contractors?|builders?|group|ltd|partners|enterprises|services|development)\b/i;
/* the GC variant (we are the sub) — the server decides for good (portal.js portalStyle); this is the same rule, short */
function isGc(p){
  if (!p) return false;
  if (s(p.portalStyle) === 'gc') return true; if (s(p.portalStyle) === 'home') return false;
  try { if (W._gcIsGcJob && W._gcIsGcJob(p)) return true; } catch (e) {}
  if (s(p.bidRole) === 'sub' || s(p.role) === 'sub') return true;
  return /commercial|tenant|govern|school|church/i.test(s(p.type) + ' ' + s(p.jobType)) && COMPANY.test(s(p.client) || s(p.customer) || s(p.clientName));
}
function secDefaults(p){ var g = isGc(p), o = {}; SECTIONS.forEach(function(x){ o[x[0]] = !(g && (x[0] === 'care' || x[0] === 'home')); }); return o; }
function autoDefault(k){ try { return W._gcAutoOn ? !!W._gcAutoOn(k) : false; } catch (e) { return false; } }
function autoDefaults(){ var o = {}; AUTOS.forEach(function(x){ o[x[0]] = autoDefault(x[0]); }); return o; }
function effective(p){
  var sd = secDefaults(p), ad = autoDefaults(), sec = {}, au = {}, own = (p && p.portalSections) || {}, ovr = (p && p.autoOverrides) || {};
  SECTIONS.forEach(function(x){ var k = x[0]; sec[k] = typeof own[k] === 'boolean' ? own[k] : sd[k]; });
  AUTOS.forEach(function(x){ var k = x[0]; au[k] = typeof ovr[k] === 'boolean' ? ovr[k] : ad[k]; });
  return { sec: sec, au: au, sd: sd, ad: ad };
}
function diffs(p){
  var e = effective(p), out = [];
  SECTIONS.forEach(function(x){ if (e.sec[x[0]] !== e.sd[x[0]]) out.push((e.sec[x[0]] ? '+' : 'no ') + x[1].replace(/^\S+\s/, '')); });
  AUTOS.forEach(function(x){ if (e.au[x[0]] !== e.ad[x[0]]) out.push((e.au[x[0]] ? '+' : 'no ') + x[1].replace(/^\S+\s/, '').replace(/\s*\(.*$/, '')); });
  return out;
}
function custom(p){ return diffs(p).length > 0; }

/* the line on the job's Customer portal card */
function lineHtml(p){
  if (!p || !p.id) return '';
  var c = p.setupConfirmed, d = diffs(p), pid = esc(p.id);
  var B = 'min-height:32px;padding:0 12px;border-radius:9px;font-weight:700;font-size:13px;font-family:inherit;cursor:pointer;';
  if (!c && !d.length) return '<div data-jobsetup-line="' + pid + '" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px;font-size:12px;color:#55626F">' +
    '<span>Customer gets: the defaults (not confirmed yet)</span><button type="button" data-jobsetup-open="' + pid + '" style="' + B + 'border:1px solid #C99A2E;background:#FFF8E6;color:#1A3A5F">Confirm job setup</button></div>';
  return '<div data-jobsetup-line="' + pid + '" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px;font-size:12px;color:#55626F">' +
    '<span><b style="color:#1A3A5F">Customer gets:</b> ' + (d.length ? 'custom — ' + esc(d.slice(0, 4).join(', ')) + (d.length > 4 ? ' +' + (d.length - 4) : '') : 'defaults ✓') + '</span>' +
    '<button type="button" data-jobsetup-open="' + pid + '" style="' + B + 'border:1px solid #C9D3DF;background:#fff;color:#1A3A5F">Edit</button></div>';
}
function repaintLines(pid){
  var p = proj(pid); if (!p) return;
  Array.prototype.forEach.call(D.querySelectorAll('[data-jobsetup-line]'), function(el){
    if (el.getAttribute('data-jobsetup-line') !== String(pid)) return;
    var t = D.createElement('div'); t.innerHTML = lineHtml(p); if (t.firstChild) el.replaceWith(t.firstChild);
  });
}
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest ? e.target.closest('[data-jobsetup-open]') : null;
  if (!b) return; e.preventDefault(); e.stopPropagation();
  confirmSetup(b.getAttribute('data-jobsetup-open'), { from: 'card' });
}, true);

/* saving: the job's own record (the JA save — local store, the list, the cloud) */
function save(pid, rec){
  var change = function(q){
    if (rec.sections) q.portalSections = rec.sections; else delete q.portalSections;
    if (rec.overrides) q.autoOverrides = rec.overrides; else delete q.autoOverrides;
    q.setupConfirmed = rec.confirmed;
  };
  var J = W._gcJA;
  if (J && typeof J.doSave === 'function') return Promise.resolve(J.doSave(pid, change));
  /* no JA on this page: the list only (the cloud save follows the normal project save) */
  try { if (W._setProjects) W._setProjects(function(prev){ return arr(prev).map(function(p){ if (p && String(p.id) === String(pid)) { var q = Object.assign({}, p); change(q); q.updatedAt = new Date().toISOString(); return q; } return p; }); }); } catch (e) {}
  return Promise.resolve();
}
var LOG = [];
function record(pid, p, eff, how){
  var sd = secDefaults(p), ad = autoDefaults(), sec = {}, ovr = {}, ns = 0, no = 0;
  SECTIONS.forEach(function(x){ var k = x[0]; if (eff.sec[k] !== sd[k]) { sec[k] = eff.sec[k]; ns++; } });
  AUTOS.forEach(function(x){ var k = x[0]; if (eff.au[k] !== ad[k]) { ovr[k] = eff.au[k]; no++; } });
  var at = new Date().toISOString(), rec = { sections: ns ? sec : null, overrides: no ? ovr : null,
    confirmed: { by: myName(), at: at, defaults: !ns && !no, how: how } };
  LOG.push({ pid: String(pid), at: at, rec: rec }); if (LOG.length > 40) LOG.shift();
  /* the copy in memory right away (the card line and the portal preview read it) */
  try { var live = proj(pid); if (live) { if (rec.sections) live.portalSections = rec.sections; else delete live.portalSections; if (rec.overrides) live.autoOverrides = rec.overrides; else delete live.autoOverrides; live.setupConfirmed = rec.confirmed; } } catch (e) {}
  return save(pid, rec).then(function(){ repaintLines(pid); return rec; }, function(){ repaintLines(pid); return rec; });
}

var CSS_ON = false;
function css(){
  if (CSS_ON) return; CSS_ON = true;
  var st = D.createElement('style'); st.id = 'gc-jobsetup-css';
  st.textContent = '.gcjs-ov{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:2147483100;display:flex;align-items:flex-end;justify-content:center}' +
    '@media(min-width:720px){.gcjs-ov{align-items:center}}' +
    '.gcjs-sh{background:#fff;color:#14202e;width:100%;max-width:560px;max-height:92vh;overflow:auto;border-radius:16px 16px 0 0;padding:18px 16px 16px;box-sizing:border-box;font:14px/1.45 Inter,Arial,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.25)}' +
    '@media(min-width:720px){.gcjs-sh{border-radius:16px}}' +
    '.gcjs-sh h2{margin:0 0 2px;font-size:18px;color:#1A3A5F}.gcjs-sub{color:#55626F;font-size:12px;margin-bottom:12px}' +
    '.gcjs-h{font-size:12px;font-weight:800;color:#8A5A00;letter-spacing:.03em;margin:12px 0 6px;text-transform:uppercase}' +
    '.gcjs-row{display:flex;align-items:center;gap:10px;min-height:40px;border-bottom:1px solid #EFEAE0}.gcjs-row input{width:22px;height:22px;flex:none}' +
    '.gcjs-row span{flex:1}.gcjs-row em{font-style:normal;font-size:11px;color:#8a8f98}' +
    '.gcjs-sum{display:flex;flex-wrap:wrap;gap:6px}.gcjs-chip{border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700;background:#EEF4EA;color:#24561f}.gcjs-chip.off{background:#F3F4F6;color:#6b7280;text-decoration:line-through}' +
    '.gcjs-act{display:flex;flex-direction:column;gap:8px;margin-top:14px}.gcjs-act button{min-height:48px;border-radius:12px;font-weight:800;font-size:15px;font-family:inherit;cursor:pointer}' +
    '.gcjs-ok{border:0;background:#E8B33B;color:#1A3A5F;font-size:17px!important}.gcjs-alt{border:1px solid #C9D3DF;background:#fff;color:#1A3A5F}' +
    '.gcjs-link{border:0!important;background:none;color:#1A3A5F;text-decoration:underline;min-height:36px!important;font-weight:600!important}';
  D.head.appendChild(st);
}
function rowsHtml(list, vals, defs, dis){
  return list.map(function(x){ var k = x[0]; return '<label class="gcjs-row"><input type="checkbox" data-k="' + k + '"' + (vals[k] ? ' checked' : '') + (dis ? ' disabled' : '') + '><span>' + esc(x[1]) + '</span><em>' + (vals[k] === defs[k] ? 'default' : 'this job only') + '</em></label>'; }).join('');
}
function chips(list, vals, short){ return '<div class="gcjs-sum">' + list.map(function(x){ return '<span class="gcjs-chip' + (vals[x[0]] ? '' : ' off') + '">' + esc(short ? x[1].replace(/\s*\(.*$/, '') : x[1]) + '</span>'; }).join('') + '</div>'; }

/* the sheet — window._gcJobSetupConfirm(jobId [, { fresh, job, ctx, from }]) → Promise(record | null) */
function confirmSetup(pid, o){
  o = o || {};
  var p = proj(pid) || o.job; if (!p) return Promise.resolve(null);
  if (o.from === 'estimate' && p.setupConfirmed) return Promise.resolve(null);   /* already confirmed: an estimate does not ask again */
  css();
  var old = D.getElementById('gc-jobsetup'); if (old) old.remove();
  var eff = effective(p), editing = !!o.edit || (!o.fresh && !!p.setupConfirmed && custom(p)), gc = isGc(p);
  var ov = D.createElement('div'); ov.id = 'gc-jobsetup'; ov.className = 'gcjs-ov'; ov.setAttribute('data-gc-keep', '1');
  ov.innerHTML = '<div class="gcjs-sh" role="dialog" aria-modal="true" aria-label="Job setup"></div>';
  var sh = ov.firstChild, done;
  var P = new Promise(function(r){ done = r; });
  function close(v){ ov.remove(); done(v || null); }
  function paint(){
    var c = p.setupConfirmed;
    sh.innerHTML = '<h2>Job setup — what the customer gets</h2>' +
      '<div class="gcjs-sub">' + esc(p.name || 'New job') + (p.autoPO ? ' · PO ' + esc(p.autoPO) : '') + ' · ' + (gc ? 'GC job (we are the sub)' : 'Homeowner job') +
        (c ? ' · confirmed by ' + esc(c.by) + ', ' + esc(new Date(c.at).toLocaleString()) : o.fresh ? ' · new job — if the defaults are right, just say OK' : '') + '</div>' +
      '<div class="gcjs-h">Portal sections</div>' + (editing ? rowsHtml(SECTIONS, eff.sec, eff.sd) : chips(SECTIONS, eff.sec)) +
      '<div class="gcjs-h">Customer automations for this job</div>' + (editing ? rowsHtml(AUTOS, eff.au, eff.ad) : chips(AUTOS, eff.au, true)) +
      '<div class="gcjs-sub" style="margin-top:8px">Nothing is sent from here. ' + (editing ? 'A change counts for this job only; the ⚡ Automations switches stay as they are.' : 'Defaults come from ⚡ Automations and the job type.') + '</div>' +
      '<div class="gcjs-act">' +
        (editing ? '<button type="button" class="gcjs-ok" data-a="save">Save for this job</button><button type="button" class="gcjs-alt" data-a="reset">Back to the defaults</button>'
                 : '<button type="button" class="gcjs-ok" data-a="ok">✓ Use defaults (OK)</button><button type="button" class="gcjs-alt" data-a="change">Change…</button>') +
        (W._gcJA && W._gcJA.open ? '<button type="button" class="gcjs-link" data-a="more">⚙ More automations for this job…</button>' : '') +
        '<button type="button" class="gcjs-link" data-a="later">' + (o.fresh ? 'Later' : 'Close') + '</button>' +
      '</div>';
    Array.prototype.forEach.call(sh.querySelectorAll('input[data-k]'), function(i){ i.onchange = function(){ var k = i.getAttribute('data-k'); if (k in eff.sec) eff.sec[k] = i.checked; else eff.au[k] = i.checked; var em = i.parentNode.querySelector('em'); if (em) em.textContent = (k in eff.sec ? eff.sec[k] === eff.sd[k] : eff.au[k] === eff.ad[k]) ? 'default' : 'this job only'; }; });
    Array.prototype.forEach.call(sh.querySelectorAll('[data-a]'), function(b){ b.onclick = function(){ act(b.getAttribute('data-a'), b); }; });
  }
  function act(a, b){
    if (a === 'change') { editing = true; paint(); return; }
    if (a === 'later') { close(null); return; }
    if (a === 'more') { close(null); try { W._gcJA.open(pid, { fresh: !!o.fresh, job: p }); } catch (e) {} return; }
    if (a === 'reset') { eff = effective({ id: p.id, type: p.type, client: p.client, portalStyle: p.portalStyle, bidRole: p.bidRole }); }
    if (b) { b.disabled = true; b.textContent = 'Saving…'; }
    record(pid, p, eff, a === 'ok' ? 'ok' : a === 'reset' ? 'reset' : 'changed').then(function(rec){
      try { var t = D.createElement('div'); t.textContent = rec.confirmed.defaults ? 'Job setup confirmed — the defaults.' : 'Job setup saved for this job.'; t.style.cssText = 'position:fixed;bottom:84px;left:50%;transform:translateX(-50%);background:#16a34a;color:#fff;padding:11px 18px;border-radius:9px;z-index:2147483200;font:700 13px Inter,Arial,sans-serif'; D.body.appendChild(t); ST(function(){ t.remove(); }, 3000); } catch (e) {}
      close(rec);
    });
  }
  ov.addEventListener('click', function(e){ if (e.target === ov) close(null); });
  paint();
  D.body.appendChild(ov);
  return P;
}
confirmSetup.CTX = CTX;
W._gcJobSetupConfirm = confirmSetup;
W._gcJobSetupLine = lineHtml;
W._gcJobSetup = { effective: effective, diffs: diffs, isGc: isGc, sectionDefaults: secDefaults, autoDefaults: autoDefaults, SECTIONS: SECTIONS, AUTOS: AUTOS, log: function(){ return LOG.slice(); } };
/* an estimate entered / uploaded for a job (ESTUPLOAD and the desk): asks only while the job's setup is not confirmed */
W.addEventListener('gc-estimate-saved', function(e){ var id = e && e.detail && (e.detail.jobId || e.detail.projectId); if (id) ST(function(){ confirmSetup(id, { from: 'estimate' }); }, 600); });
try { console.log('[GC] Job setup: what the customer gets (patch JOBSETUP) — _gcJobSetupConfirm(jobId)'); } catch (e) {}
})(window);
</script>
'''
src = src.rstrip('\n') + '\n' + BLOCK.lstrip('\n')
assert src.count(MARK) == 1
open(path, 'w', encoding='utf-8').write(src)
print('patched JOBSETUP')
