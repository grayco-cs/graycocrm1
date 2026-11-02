/* __GC_PATCH_CLAIMHELP__ ═══════════════════════════════════════════════════════════════════════════════════
   GrayCo — 🛡 INSURANCE CLAIM HELP (patch CLAIMHELP), the CRM side.

   Owner: "I like insurance claims steps as a default for how customers can deal with their insurance claim and insurance
   agent. Have where we can add to this as we go as the admin, but have some default easy questions and answers for them
   on their portal."

   1. ⚙ Admin → 🛡 Insurance claim help: the claim steps (what the customer does / what GrayCo does) and the Questions &
      answers the customer sees. Edit, add, reorder (↑ ↓), hide; "Reset to GrayCo defaults"; "Preview as customer";
      Save draft / Publish. Admins change it; the office (and anyone else who opens it) can view it.
      GrayCo's default text is marked "DRAFT — for lawyer review" HERE ONLY (never in the portal).
      Stored in ONE settings key (gc_kv gc_claim_help) through the portal server (portal.js action 'claimhelp' — admins
      write; the customer portal reads only the PUBLISHED version).
   2. The job (desk job page and the phone job screen), on an insurance / restoration / mitigation job whose feature
      "Insurance claim help steps" is on (job.features.claimHelp — ON by default for those jobs): under the 🏠 Portal card
      "🛡 Claim step: <step> ▾" and "👁 What the customer sees" (the customer's card, a short note the customer sees,
      the feature switch). Changing the step never tells the customer by itself: "📣 Tell the customer" puts a portal
      post on ✅ Approvals (never a text; CUSTQUIET holds it 7 PM – 7 AM).
   Stored on the job (synced like everything else): claimHelp = { step, note, noteAt, at, by, hideAdjuster },
   features.claimHelp (only when someone turns it on / off here).
   Console: _gcClaimHelp.state()
   ═════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
if (window.__GC_PATCH_CLAIMHELP__) return; window.__GC_PATCH_CLAIMHELP__ = true;
var W = window, D = document;
var nST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout.bind(W);
var SI = W.__GC_NATIVE_SETINTERVAL__ || W.__GC_RAW_SETINTERVAL__ || W.setInterval;
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function escT(v){ return (v == null ? '' : String(v)).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function nowIso(){ return new Date().toISOString(); }
function copy(o){ return JSON.parse(JSON.stringify(o)); }
function when(iso){ var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
function isAdmin(){ try { return !!(W.__gcAuthIsAdmin && W.__gcAuthIsAdmin()); } catch (e) { return false; } }
function me(){ try { var n = localStorage.getItem('grayco_user'); if (n) return n; } catch (e) {} try { if (W.__GC_AUTH__) return W.__GC_AUTH__.email(); } catch (e) {} return ''; }
function crm(){ return W._crm || {}; }
var recent = {};
function proj(pid){
  var p = arr(crm().projects).filter(function(x){ return String(x.id) === String(pid); })[0] || null;
  var r = recent[pid]; if (r && (!p || s(r.updatedAt) > s(p.updatedAt))) p = r;
  return p;
}
function toast(msg, bad){
  try { var t = D.createElement('div'); t.setAttribute('role', 'status'); t.setAttribute('data-gc-keep', ''); t.className = 'gcch-toast'; t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483300;background:' + (bad ? '#7f1d1d' : '#14532d') + ';color:#fff;border-radius:12px;padding:12px 16px;font:600 14px/1.35 Inter,-apple-system,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:calc(100vw - 32px)';
    D.body.appendChild(t); nST(function(){ try { t.remove(); } catch (e) {} }, 4200); } catch (e) {}
}
function api(body){
  return W.fetch('/.netlify/functions/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action: 'claimhelp' }, body)), cache: 'no-store' })
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ j = j || {}; j.__status = r.status; return j; }); },
      function(e){ return { ok: false, __status: 0, error: 'Cannot reach the portal server (' + (e && e.message || 'offline') + ').' }; });
}

/* ── the customer's card (portal-claimhelp.js — the very same drawing the portal uses) ── */
var RENDER = null;
function renderer(){
  if (W.GCClaimHelp) return Promise.resolve(W.GCClaimHelp);
  if (RENDER) return RENDER;
  RENDER = new Promise(function(res, rej){
    var sc = D.createElement('script'); sc.src = '/portal-claimhelp.js'; sc.async = true;
    sc.onload = function(){ W.GCClaimHelp ? res(W.GCClaimHelp) : rej(new Error('no drawing')); };
    sc.onerror = function(){ RENDER = null; rej(new Error('Could not load the customer preview.')); };
    (D.head || D.documentElement).appendChild(sc);
  });
  return RENDER;
}
function mountPreview(host, view){
  return renderer().then(function(G){ G.mount(host, view, { preview: true, onAsk: function(){ toast('In the portal this opens Messages, where the customer writes to you.'); } }); return true; },
    function(e){ host.textContent = e.message; return false; });
}

/* ── styles + a window ── */
function css(){
  if (D.getElementById('gcch-css')) return;
  var st = D.createElement('style'); st.id = 'gcch-css';
  st.textContent = '.gcch-ov{position:fixed;inset:0;z-index:100250;background:rgba(6,12,20,.72);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto}' +
    '.gcch-win{background:#fff;color:#0f172a;width:100%;max-width:1040px;border-radius:14px;padding:18px;box-sizing:border-box;font:14px Inter,-apple-system,sans-serif;margin:auto 0}' +
    '.gcch-win h2{margin:0 0 4px;font-size:19px}.gcch-x{float:right;border:none;background:#e2e8f0;border-radius:8px;padding:8px 12px;font-weight:800;cursor:pointer;min-height:40px}' +
    '.gcch-mut{color:#64748b;font-size:13px;line-height:1.45}.gcch-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}' +
    '.gcch-btn{min-height:40px;padding:0 14px;border-radius:9px;border:1px solid #1A3A5F;background:#fff;color:#1A3A5F;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit}' +
    '.gcch-btn.p{background:#0F1D2F;border-color:#0F1D2F;color:#fff}.gcch-btn.g{background:#D4A017;border-color:#D4A017;color:#0F1D2F}.gcch-btn.r{border-color:#b91c1c;color:#b91c1c}.gcch-btn[disabled]{opacity:.5;cursor:default}' +
    '.gcch-sm{min-height:34px;padding:0 10px;font-size:13px}' +
    '.gcch-in{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;font:14px/1.45 Inter,-apple-system,sans-serif;color:#0f172a;background:#fff}' +
    'textarea.gcch-in{min-height:64px;resize:vertical}.gcch-in[readonly]{background:#f8fafc}' +
    '.gcch-it{border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;margin:8px 0;background:#fff}.gcch-it.hid{opacity:.6;background:#f8fafc}' +
    '.gcch-ih{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px}.gcch-ih b{flex:1 1 auto;min-width:120px}' +
    '.gcch-lab{display:block;font-size:12px;font-weight:700;color:#475569;margin:6px 0 2px}' +
    '.gcch-draft{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.02em;color:#92400e;background:#fef3c7;border:1px solid #f59e0b;border-radius:999px;padding:2px 8px}' +
    '.gcch-ban{border:2px solid #f59e0b;background:#fffbeb;color:#78350f;border-radius:12px;padding:10px 12px;margin:10px 0;font-size:13px;line-height:1.45}' +
    '.gcch-ban b{display:block;font-size:14px;color:#92400e}' +
    '.gcch-ro{border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a;border-radius:10px;padding:8px 12px;margin:10px 0;font-size:13px}' +
    '.gcch-h3{margin:16px 0 4px;font-size:15px}.gcch-ck{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;cursor:pointer}' +
    '.gcch-ck input{width:18px;height:18px}.gcch-two{display:grid;grid-template-columns:minmax(0,1fr) 420px;gap:16px;align-items:start}' +
    '.gcch-phone{width:100%;max-width:420px;border:8px solid #0F1D2F;border-radius:26px;overflow:hidden;background:#F6F3EC;max-height:72vh;overflow-y:auto}' +
    '.gcch-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:#fff;color:#14202E;border:1px solid #E2DCCD;border-left:4px solid #D4A017;border-radius:12px;padding:8px 10px;margin:-4px 0 10px;font:14px Inter,-apple-system,sans-serif;box-sizing:border-box}' +
    '.gcch-bar[data-field]{margin:-6px 0 12px}.gcch-bar b{white-space:nowrap}.gcch-bar select{min-height:40px;border:1px solid #C9C2B2;border-radius:8px;padding:0 8px;font-size:15px;font-family:inherit;max-width:100%;flex:1 1 200px;min-width:0;background:#fff}' +
    '.gcch-bar .n{flex:1 0 100%;font-size:12px;color:#55626F;overflow-wrap:anywhere}' +
    '@media (max-width:860px){.gcch-two{grid-template-columns:1fr}.gcch-phone{max-width:none}}' +
    '@media (max-width:640px){.gcch-ov{padding:0}.gcch-win{border-radius:0;min-height:100vh}}';
  (D.head || D.documentElement).appendChild(st);
}
function overlay(title, sub, id){
  css();
  var ov = D.createElement('div'); ov.className = 'gcch-ov'; ov.setAttribute('data-gc-keep', '1'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', title); if (id) ov.id = id;
  var c = D.createElement('div'); c.className = 'gcch-win';
  c.innerHTML = '<button type="button" class="gcch-x">Close</button><h2>' + esc(title) + '</h2>' + (sub ? '<div class="gcch-mut">' + esc(sub) + '</div>' : '') + '<div class="gcch-body"></div>';
  ov.appendChild(c); D.body.appendChild(ov);
  function close(){ try { ov.remove(); } catch (e) {} D.removeEventListener('keydown', onKey, true); }
  function onKey(e){ if (e.key === 'Escape') close(); }
  D.addEventListener('keydown', onKey, true);
  c.querySelector('.gcch-x').onclick = close;
  ov.addEventListener('click', function(e){ if (e.target === ov) close(); });
  return { ov: ov, body: c.querySelector('.gcch-body'), close: close };
}

/* ── the content (any staff may read; admins write) ── */
var ST = { data: null, at: 0, busy: null };
function pull(force){
  if (ST.busy) return ST.busy;
  if (!force && ST.data && Date.now() - ST.at < 10 * 60e3) return Promise.resolve(ST.data);
  ST.busy = api({ op: 'get' }).then(function(j){ ST.busy = null; if (j && j.ok) { ST.data = j; ST.at = Date.now(); } return ST.data; }, function(){ ST.busy = null; return ST.data; });
  return ST.busy;
}
function publishedSteps(){ return arr(ST.data && ST.data.published && ST.data.published.steps).filter(function(x){ return !x.hidden; }); }

/* ══ 1. ⚙ Admin → 🛡 Insurance claim help ═══════════════════════════════════════════════════════════════════ */
var ED = { draft: null, dirty: false, busy: false, err: '' };
function defOf(kind, id){ var d = ST.data && ST.data.defaults; var l = d ? (kind === 'step' ? d.steps : d.qa) : []; return arr(l).filter(function(x){ return x.id === id; })[0] || null; }
function lawyerDraft(kind, x){
  var d = defOf(kind, x.id); if (!d) return false;
  return kind === 'step' ? (s(x.title) === s(d.title) && s(x.you) === s(d.you) && s(x.us) === s(d.us)) : (s(x.q) === s(d.q) && s(x.a) === s(d.a));
}
function newId(pre, list){ var n = list.length + 1, id; do { id = pre + '_' + Date.now().toString(36).slice(-4) + n++; } while (list.some(function(x){ return x.id === id; })); return id; }
function renderAdmin(box){
  css();
  box.setAttribute('data-gcch-admin', '1');
  if (!ST.data) { box.innerHTML = '<div class="gcch-mut" style="padding:10px">Loading…</div>'; pull(true).then(function(){ if (box.isConnected) renderAdmin(box); }); return; }
  if (!ED.draft) ED.draft = copy(ST.data.draft);
  paintAdmin(box);
}
function paintAdmin(box){
  var can = isAdmin() && ST.data.canEdit !== false, d = ED.draft, ro = can ? '' : ' readonly';
  var anyDraft = d.steps.some(function(x){ return lawyerDraft('step', x); }) || d.qa.some(function(x){ return lawyerDraft('qa', x); });
  var stepTag = function(x){ return lawyerDraft('step', x) ? ' <span class="gcch-draft" data-gcch-lawyer="1">' + esc(ST.data.lawyerNote || 'DRAFT — for lawyer review') + '</span>' : ''; };
  var qaTag = function(x){ return lawyerDraft('qa', x) ? ' <span class="gcch-draft" data-gcch-lawyer="1">' + esc(ST.data.lawyerNote || 'DRAFT — for lawyer review') + '</span>' : ''; };
  var pub = ST.data.publishedIsDefault ? 'GrayCo defaults (nobody has published a change yet)' : 'Published ' + when(ST.data.publishedAt) + (ST.data.publishedBy ? ' by ' + ST.data.publishedBy : '');
  var h = '<div class="gcch-mut">The steps and questions &amp; answers customers see under <b>🛡 Your insurance claim</b> in their portal, on insurance, restoration and mitigation jobs (job feature “Insurance claim help steps”, on by default for those jobs). Customers see only what is <b>published</b>. Each job’s current step and note are set on the job (🛡 Claim step ▾ under the 🏠 Portal card).</div>';
  if (anyDraft) h += '<div class="gcch-ban" data-gcch-banner="1"><b>' + esc(ST.data.lawyerNote || 'DRAFT — for lawyer review') + '</b>GrayCo’s default steps and answers (tagged below) have not been reviewed by a lawyer yet — add them to the lawyer review with the lien rules and the Maintenance Agreement. Legal care built in: GrayCo documents damage, meets the adjuster to show it, provides estimates and explains the scope of the repair work; it does not negotiate the claim for the homeowner, does not promise coverage, and does not waive, rebate or absorb deductibles. This tag shows here only — never in the portal.</div>';
  if (!can) h += '<div class="gcch-ro" data-gcch-viewonly="1">View only — an admin (Wesley or Nick) can change this. You can preview what customers see.</div>';
  h += '<div class="gcch-row"><span class="gcch-mut" data-gcch-status="1">🟢 ' + esc(pub) + (ED.dirty ? ' · <b style="color:#b45309">unsaved changes</b>' : (ST.data.unpublished ? ' · <b style="color:#b45309">draft not published yet</b>' : '')) + '</span></div>';
  h += '<div class="gcch-row">' +
    (can ? '<button type="button" class="gcch-btn" data-a="save"' + (ED.busy ? ' disabled' : '') + '>💾 Save draft</button><button type="button" class="gcch-btn p" data-a="publish"' + (ED.busy ? ' disabled' : '') + '>✅ Publish to customer portals</button>' : '') +
    '<button type="button" class="gcch-btn g" data-a="preview">👁 Preview as customer</button>' +
    (can ? '<button type="button" class="gcch-btn r" data-a="reset"' + (ED.busy ? ' disabled' : '') + '>↺ Reset to GrayCo defaults</button>' : '') + '</div>';
  if (ED.err) h += '<div style="color:#b91c1c;font-weight:700;margin:6px 0">' + esc(ED.err) + '</div>';
  h += '<label class="gcch-lab">Short intro at the top' + (ST.data.draft && d.intro === (ST.data.defaults || {}).intro ? ' <span class="gcch-draft">' + esc(ST.data.lawyerNote) + '</span>' : '') + '</label><textarea class="gcch-in" data-k="intro" rows="2"' + ro + '>' + escT(d.intro) + '</textarea>';
  h += '<h3 class="gcch-h3">Claim steps (' + d.steps.filter(function(x){ return !x.hidden; }).length + ' shown)</h3><div class="gcch-mut">In order. The job’s “You are here” marker uses these. “(if needed)” steps are for things that do not happen on every claim.</div>';
  h += d.steps.map(function(x, i){
    return '<div class="gcch-it' + (x.hidden ? ' hid' : '') + '" data-step="' + i + '" data-id="' + esc(x.id) + '"><div class="gcch-ih"><b>Step ' + (i + 1) + (x.hidden ? ' · hidden' : '') + stepTag(x) + '</b>' +
      (can ? '<button type="button" class="gcch-btn gcch-sm" data-a="up" data-l="steps" data-i="' + i + '" aria-label="Move up"' + (i ? '' : ' disabled') + '>↑</button><button type="button" class="gcch-btn gcch-sm" data-a="down" data-l="steps" data-i="' + i + '" aria-label="Move down"' + (i < d.steps.length - 1 ? '' : ' disabled') + '>↓</button>' +
        '<label class="gcch-ck"><input type="checkbox" data-k="steps.' + i + '.optional"' + (x.optional ? ' checked' : '') + '>if needed</label><label class="gcch-ck"><input type="checkbox" data-k="steps.' + i + '.hidden"' + (x.hidden ? ' checked' : '') + '>Hide</label>' +
        '<button type="button" class="gcch-btn gcch-sm r" data-a="del" data-l="steps" data-i="' + i + '">Remove</button>' : '') + '</div>' +
      '<label class="gcch-lab">Step name</label><input class="gcch-in" data-k="steps.' + i + '.title" value="' + escT(x.title) + '" maxlength="90"' + ro + '>' +
      '<label class="gcch-lab">What the customer does</label><textarea class="gcch-in" data-k="steps.' + i + '.you" rows="2" maxlength="800"' + ro + '>' + escT(x.you) + '</textarea>' +
      '<label class="gcch-lab">What GrayCo does</label><textarea class="gcch-in" data-k="steps.' + i + '.us" rows="2" maxlength="800"' + ro + '>' + escT(x.us) + '</textarea></div>';
  }).join('');
  if (can) h += '<button type="button" class="gcch-btn" data-a="add" data-l="steps">+ Add a step</button>';
  h += '<h3 class="gcch-h3">Questions &amp; answers (' + d.qa.filter(function(x){ return !x.hidden; }).length + ' shown)</h3><div class="gcch-mut">Plain words. Never promise coverage, never offer to handle the claim for the customer, never touch the deductible. Coverage / legal questions → “ask your insurance company or agent, or a licensed professional”.</div>';
  h += d.qa.map(function(x, i){
    return '<div class="gcch-it' + (x.hidden ? ' hid' : '') + '" data-qa="' + i + '" data-id="' + esc(x.id) + '"><div class="gcch-ih"><b>Q' + (i + 1) + (x.hidden ? ' · hidden' : '') + qaTag(x) + '</b>' +
      (can ? '<button type="button" class="gcch-btn gcch-sm" data-a="up" data-l="qa" data-i="' + i + '" aria-label="Move up"' + (i ? '' : ' disabled') + '>↑</button><button type="button" class="gcch-btn gcch-sm" data-a="down" data-l="qa" data-i="' + i + '" aria-label="Move down"' + (i < d.qa.length - 1 ? '' : ' disabled') + '>↓</button>' +
        '<label class="gcch-ck"><input type="checkbox" data-k="qa.' + i + '.hidden"' + (x.hidden ? ' checked' : '') + '>Hide</label><button type="button" class="gcch-btn gcch-sm r" data-a="del" data-l="qa" data-i="' + i + '">Remove</button>' : '') + '</div>' +
      '<label class="gcch-lab">Question</label><input class="gcch-in" data-k="qa.' + i + '.q" value="' + escT(x.q) + '" maxlength="180"' + ro + '>' +
      '<label class="gcch-lab">Answer</label><textarea class="gcch-in" data-k="qa.' + i + '.a" rows="3" maxlength="1600"' + ro + '>' + escT(x.a) + '</textarea></div>';
  }).join('');
  if (can) h += '<button type="button" class="gcch-btn" data-a="add" data-l="qa">+ Add a question</button>';
  h += '<div class="gcch-mut" style="margin-top:12px">Customers also see: “' + esc(ST.data.footer || '') + '”</div>';
  if (can && (ED.dirty || ST.data.unpublished)) h += '<div class="gcch-row"><button type="button" class="gcch-btn p" data-a="publish">✅ Publish to customer portals</button></div>';
  box.innerHTML = h;
  if (!box.__gcchWired) { box.__gcchWired = true; wireAdmin(box); }
}
function setPath(path, v){
  var k = path.split('.'), o = ED.draft;
  for (var i = 0; i < k.length - 1; i++) o = o[/^\d+$/.test(k[i]) ? +k[i] : k[i]];
  o[k[k.length - 1]] = v;
}
function wireAdmin(box){
  box.addEventListener('input', function(e){
    var t = e.target, k = t && t.getAttribute && t.getAttribute('data-k'); if (!k || !isAdmin()) return;
    setPath(k, t.type === 'checkbox' ? !!t.checked : t.value);
    if (!ED.dirty) { ED.dirty = true; var st = box.querySelector('[data-gcch-status]'); if (st && st.innerHTML.indexOf('unsaved') < 0) st.innerHTML += ' · <b style="color:#b45309">unsaved changes</b>'; }
  });
  box.addEventListener('change', function(e){
    var t = e.target, k = t && t.getAttribute && t.getAttribute('data-k'); if (!k || t.type !== 'checkbox' || !isAdmin()) return;
    setPath(k, !!t.checked); ED.dirty = true; paintAdmin(box);
  });
  box.addEventListener('click', function(e){
    var b = e.target && e.target.closest ? e.target.closest('[data-a]') : null; if (!b || b.disabled) return;
    var a = b.getAttribute('data-a');
    if (a === 'preview') { previewDraft(); return; }
    if (!isAdmin()) { toast('Only an admin can change this.', true); return; }
    var l = b.getAttribute('data-l'), i = +b.getAttribute('data-i'), list = l ? ED.draft[l] : null;
    if (a === 'up' && i > 0) { var x = list.splice(i, 1)[0]; list.splice(i - 1, 0, x); ED.dirty = true; paintAdmin(box); return; }
    if (a === 'down' && i < list.length - 1) { var y = list.splice(i, 1)[0]; list.splice(i + 1, 0, y); ED.dirty = true; paintAdmin(box); return; }
    if (a === 'del') {
      var it = list[i], what = l === 'steps' ? '“' + s(it.title) + '”' : '“' + s(it.q) + '”';
      var ok = true; try { ok = confirm('Remove ' + what + '? (Hide keeps it for later.)'); } catch (x2) {}
      if (!ok) return; list.splice(i, 1); ED.dirty = true; paintAdmin(box); return;
    }
    if (a === 'add') {
      if (l === 'steps') list.push({ id: newId('step', list), title: 'New step', you: '', us: '', optional: false, hidden: false });
      else list.push({ id: newId('qa', list), q: 'New question?', a: '', hidden: false });
      ED.dirty = true; paintAdmin(box);
      var last = box.querySelectorAll(l === 'steps' ? '[data-step]' : '[data-qa]'); last = last[last.length - 1];
      if (last) { try { last.scrollIntoView({ block: 'center' }); var inp = last.querySelector('input.gcch-in'); inp.focus(); inp.select(); } catch (x3) {} }
      return;
    }
    if (a === 'save' || a === 'publish') {
      if (a === 'publish') { var sure = true; try { sure = confirm('Publish these steps and answers to every customer portal now? Customers on insurance jobs see them right away.'); } catch (x4) {} if (!sure) return; }
      if (a === 'publish' && ED.draft.qa.some(function(x){ return !x.hidden && !s(x.a); })) { toast('A question has no answer yet — write it or hide that question.', true); return; }
      ED.busy = true; ED.err = ''; paintAdmin(box);
      api({ op: a, draft: ED.draft, base: ST.data.savedAt || '' }).then(function(j){
        ED.busy = false;
        if (j && j.ok) { ST.data = j; ST.at = Date.now(); ED.draft = copy(j.draft); ED.dirty = false; toast(a === 'publish' ? '✅ Published — customers see it now.' : 'Draft saved (customers still see the published version).'); }
        else if (j && j.conflict) { ST.data = Object.assign({}, ST.data, j); ED.draft = copy(j.draft); ED.dirty = false; ED.err = j.error; }
        else ED.err = (j && j.error) || 'Could not save.';
        paintAdmin(box);
      });
      return;
    }
    if (a === 'reset') {
      var sure2 = true; try { sure2 = confirm('Reset the steps and answers to GrayCo’s defaults? Your changes are replaced. Customers keep seeing the published version until you press Publish.'); } catch (x5) {}
      if (!sure2) return;
      ED.busy = true; ED.err = ''; paintAdmin(box);
      api({ op: 'reset', base: ST.data.savedAt || '' }).then(function(j){
        ED.busy = false;
        if (j && j.ok) { ST.data = j; ST.at = Date.now(); ED.draft = copy(j.draft); ED.dirty = false; toast('Reset to GrayCo defaults — press Publish to show them to customers.'); }
        else ED.err = (j && j.error) || 'Could not reset.';
        paintAdmin(box);
      });
    }
  });
}
function sampleJob(){
  var steps = arr(ED.draft && ED.draft.steps).filter(function(x){ return !x.hidden; });
  var d = new Date(Date.now() - 21 * 864e5).toISOString().slice(0, 10);
  return { type: 'Insurance Claim', isInsurance: true, name: 'Sample job', claimNumber: 'SAMPLE-0042', dateOfLoss: d, adjusterName: 'Pat Sample (adjuster)', adjusterPhone: '901-555-0100',
    claimHelp: { step: steps[Math.min(2, steps.length - 1)] ? steps[Math.min(2, steps.length - 1)].id : '', note: 'Sample note: the adjuster visit went well. We will call you when their estimate comes in.', noteAt: new Date().toISOString().slice(0, 10) } };
}
function previewDraft(){
  var O = overlay('👁 Preview as customer', 'What a customer sees under “🛡 Your insurance claim” with this ' + (ED.dirty || (ST.data && ST.data.unpublished) ? 'draft (not published yet)' : 'version') + ' — on a sample job (claim number, adjuster and note are made up).', 'gcch-prev');
  O.body.innerHTML = '<div class="gcch-row" style="justify-content:center"><div class="gcch-phone"><div data-gcch-mount="1" class="gcch-mut" style="padding:14px">Loading…</div></div></div>';
  var host = O.body.querySelector('[data-gcch-mount]');
  api({ op: 'preview', content: ED.draft, job: sampleJob() }).then(function(j){
    if (!j || !j.ok) { host.textContent = (j && j.error) || 'Could not make the preview.'; return; }
    host.textContent = ''; host.className = ''; mountPreview(host, j.view);
  });
}

var ADM_ADDED = false;
function addAdmin(){
  if (ADM_ADDED || typeof W._gcAdmAddSection !== 'function') return ADM_ADDED;
  W._gcAdmAddSection({ id: 'claimhelp', after: 'workauth', ic: '🛡', t: 'Insurance claim help', d: 'The claim steps and questions & answers customers see on insurance jobs in their portal',
    render: renderAdmin, count: function(){ return ST.data ? (ST.data.publishedIsDefault ? 'GrayCo defaults' : 'published') + (ST.data.unpublished ? ' · draft waiting' : '') : 'steps + Q&A'; } });
  ADM_ADDED = true; return true;
}
function openAdmin(){
  addAdmin();
  try { if (W._gcAdm && W._gcAdm.open) { W._gcAdm.open('claimhelp'); return true; } } catch (e) {}
  return false;
}

/* ══ 2. the job: "🛡 Claim step: <step> ▾" + "👁 What the customer sees" ════════════════════════════════════ */
var INS_TYPE = /insurance|restoration|mitigation|water\s*damage|fire\s*damage|smoke\s*damage|storm\s*damage|flood|mold\s*remediation|\bclaim\b/i;
function hasClaim(p){ try { var l = W._gcClaims && typeof W._gcClaims.list === 'function' ? W._gcClaims.list() : []; return arr(l).some(function(c){ return c.deleted !== true && String(c.projectId) === String(p.id); }); } catch (e) { return false; } }
function insuranceType(p){
  if (!p) return false;
  if (p.isInsurance === true) return true;
  if (p.isInsurance === false) return false;
  if (INS_TYPE.test([p.type, p.jobType, p.jobTypeLabel].filter(function(v){ return typeof v === 'string'; }).join(' '))) return true;
  return hasClaim(p);   /* a bare claim number does not make an insurance job (patch INSP rule) */
}
function featureSetting(p){
  var f = p && p.features;
  if (Array.isArray(f)) return f.map(low).indexOf('claimhelp') >= 0;
  if (f && typeof f === 'object') {
    var ks = ['claimHelp', 'insuranceClaimHelp', 'claim_help'];
    for (var i = 0; i < ks.length; i++) if (typeof f[ks[i]] === 'boolean') return f[ks[i]];
    if (f.claimHelp && typeof f.claimHelp === 'object' && typeof f.claimHelp.on === 'boolean') return f.claimHelp.on;
  }
  return null;
}
function eligible(p){ if (!p || p.deleted === true || !insuranceType(p)) return false; var f = featureSetting(p); return f == null ? true : f; }
function state(p){ var c = p && p.claimHelp; return c && typeof c === 'object' ? c : {}; }

/* saving the job (the same way the 🛡 Insurance portal panel and patch Q save one) */
var saving = Promise.resolve();
function saveProject(pid, change){ saving = saving.then(function(){ return doSave(pid, change); }, function(){ return doSave(pid, change); }); return saving; }
async function doSave(pid, change){
  var now = nowIso();
  function put(p){ var q = Object.assign({}, p); change(q); q.updatedAt = now; q.savedAt = now; return q; }
  var all = null; try { all = W._gcProjectsRaw ? await W._gcProjectsRaw() : await W.idbGet('projects'); } catch (e) {}
  try { W.__GC_MANUAL_SAVE__ = true; if (W._gcManualNow) W._gcManualNow('claim help'); } catch (e) {}
  var hit = false, next = null, saved = null;
  if (Array.isArray(all)) next = all.map(function(p){ if (p && String(p.id) === String(pid)) { hit = true; saved = put(recent[pid] && s(recent[pid].updatedAt) > s(p.updatedAt) ? recent[pid] : p); return saved; } return p; });
  if (hit) { try { await W.idbSet('projects', next); } catch (e) {} }
  try { if (W._setProjects) W._setProjects(function(prev){ return Array.isArray(prev) ? prev.map(function(p){ if (p && String(p.id) === String(pid)) { var q = put(p); if (!saved) saved = q; return q; } return p; }) : prev; }); } catch (e) {}
  if (!hit) { var cur = proj(pid); if (cur && !saved) saved = put(cur); }
  if (saved) recent[pid] = saved;
  if (hit) { try { if (W._supaUpsert) W._supaUpsert('projects', next); } catch (e) {} }
  else if (saved) nST(function(){ try { if (W._supaUpsert) W._supaUpsert('projects', crm().projects || []); } catch (e) {} }, 400);
  nST(function(){ try { W.__GC_MANUAL_SAVE__ = false; } catch (e) {} }, 1500);
  paintBars(true);
  return saved;
}
function setStep(pid, step){
  return saveProject(pid, function(x){ x.claimHelp = Object.assign({}, state(x), { step: s(step), at: nowIso(), by: me() }); });
}
function setNote(pid, note){
  note = s(note).slice(0, 400);
  return saveProject(pid, function(x){ x.claimHelp = Object.assign({}, state(x), { note: note, noteAt: note ? new Date().toISOString().slice(0, 10) : '', at: nowIso(), by: me() }); });
}
function setFeature(pid, on){
  return saveProject(pid, function(x){ x.features = Object.assign({}, x.features && typeof x.features === 'object' && !Array.isArray(x.features) ? x.features : {}, { claimHelp: !!on }); });
}
function jobForPreview(p){
  var o = {}; ['type', 'jobType', 'isInsurance', 'claimNumber', 'dateOfLoss', 'adjusterName', 'adjusterPhone', 'portalShowAdjuster', 'features', 'claimHelp', 'name'].forEach(function(k){ if (p[k] !== undefined) o[k] = p[k]; });
  return o;
}
function stepName(p){
  var st = state(p), l = publishedSteps(), x = l.filter(function(y){ return y.id === s(st.step); })[0];
  return x ? x.title : '';
}
function barHtml(p){
  var st = state(p), l = publishedSteps(), cur = s(st.step), known = !cur || l.some(function(x){ return x.id === cur; });
  if (!insuranceType(p)) return '';
  if (featureSetting(p) === false) return '<b>🛡 Insurance claim help steps:</b><span>off for this customer</span><button type="button" class="gcch-btn" data-ch="on">Turn on</button>';
  return '<b>🛡 Claim step:</b><select data-ch="step" aria-label="Claim step the customer sees">' +
    '<option value=""' + (cur ? '' : ' selected') + '>' + (l.length ? '— not set (automatic) —' : 'Loading steps…') + '</option>' +
    l.map(function(x, i){ return '<option value="' + esc(x.id) + '"' + (cur === x.id ? ' selected' : '') + '>' + (i + 1) + '. ' + esc(x.title) + '</option>'; }).join('') +
    (known ? '' : '<option value="' + esc(cur) + '" selected>(a step that was removed)</option>') + '</select>' +
    '<button type="button" class="gcch-btn" data-ch="see">👁 What the customer sees</button>' +
    '<button type="button" class="gcch-btn" data-ch="tell" title="Puts a short portal post on ✅ Approvals — nothing goes out until it is approved">📣 Tell the customer</button>' +
    '<span class="n">' + (s(st.note) ? 'Note to the customer: “' + esc(s(st.note).slice(0, 140)) + (s(st.note).length > 140 ? '…' : '') + '”' : 'No note for the customer.') +
    (st.at ? ' · step set ' + esc(when(st.at)) + (st.by ? ' by ' + esc(st.by) : '') : '') + ' · shows in the portal under “🛡 Your insurance claim”.</span>';
}
function barSig(p){ return JSON.stringify([p.id, state(p), p.features, p.type, p.isInsurance, publishedSteps().map(function(x){ return x.id + x.title; })]); }
function buildBar(pid, field){
  css();
  var el = D.createElement('div'); el.className = 'gcch-bar'; el.setAttribute('data-pid', pid); el.setAttribute('data-gc-keep', ''); if (field) el.setAttribute('data-field', '1');
  el.addEventListener('change', function(e){
    var t = e.target; if (!t || t.getAttribute('data-ch') !== 'step') return;
    var v = t.value, nm = t.options[t.selectedIndex] ? t.options[t.selectedIndex].textContent.replace(/^\d+\.\s*/, '') : '';
    setStep(pid, v).then(function(){ toast(v ? 'Saved — the customer sees “You are here” on ' + nm + '. To tell them, use 📣 Tell the customer.' : 'Claim step cleared — the portal follows the job automatically.'); });
  });
  el.addEventListener('click', function(e){
    var b = e.target && e.target.closest ? e.target.closest('[data-ch]') : null; if (!b || b.tagName === 'SELECT') return;
    var q = b.getAttribute('data-ch');
    if (q === 'see') openJob(pid);
    if (q === 'tell') tellCustomer(pid);
    if (q === 'on') setFeature(pid, true).then(function(){ toast('Claim help steps are on for this customer.'); });
  });
  return el;
}
function paintBar(el, p, force){
  if (!force && el.contains(D.activeElement) && D.activeElement.tagName === 'SELECT') return;
  var sg = barSig(p); if (!force && el.__sig === sg) return;
  el.__sig = sg; el.innerHTML = barHtml(p);
}
function tellCustomer(pid){
  var p = proj(pid); if (!p) return;
  var st = state(p), nm = stepName(p);
  if (!s(st.step) || !nm) { toast('Pick the claim step first (🛡 Claim step ▾).', true); return; }
  var sure = true; try { sure = confirm('Put a short update for the customer on ✅ Approvals?\n\n“Update on your insurance claim: ' + nm + '.' + (s(st.note) ? '\n' + s(st.note) : '') + '”\n\nIt goes on their portal only once it is approved (never 7 PM – 7 AM). No text message.'); } catch (e) {}
  if (!sure) return;
  api({ op: 'notify', projectId: String(pid), step: s(st.step), note: s(st.note) }).then(function(j){
    if (j && j.ok) toast('On ✅ Approvals — the customer sees it once it is approved.');
    else toast((j && j.error) || 'Could not put it on ✅ Approvals.', true);
  });
}
function openJob(pid){
  var p = proj(pid); if (!p) return;
  var O = overlay('👁 What the customer sees — ' + s(p.name || 'Job'), 'The “🛡 Your insurance claim” card in this customer’s portal, with the step and note below (published steps and answers; the carrier’s name never shows).', 'gcch-job');
  var st = state(p);
  O.body.innerHTML = '<div class="gcch-two"><div>' +
    '<label class="gcch-lab">Claim step the customer sees</label><div data-gcch-stepsel="1"></div>' +
    '<label class="gcch-lab">Short note the customer sees (optional, 400 characters)</label><textarea class="gcch-in" data-ch="note" rows="3" maxlength="400" placeholder="For example: The adjuster visit is set for Tuesday at 10 AM — we will be there.">' + escT(st.note || '') + '</textarea>' +
    '<div class="gcch-row"><button type="button" class="gcch-btn p" data-ch="savenote">Save note</button><button type="button" class="gcch-btn" data-ch="tell">📣 Tell the customer</button>' +
    (W._gcInsPortal && W._gcInsPortal.preview ? '<button type="button" class="gcch-btn" data-ch="full">Open the whole portal preview</button>' : '') + '</div>' +
    '<div class="gcch-mut">Changing the step or the note updates the portal page; it does not message the customer. 📣 Tell the customer puts a short portal post on ✅ Approvals (never a text; held 7 PM – 7 AM).</div>' +
    '<label class="gcch-ck" style="margin-top:12px"><input type="checkbox" data-ch="hideadj"' + (st.hideAdjuster === true || p.portalShowAdjuster === false ? ' checked' : '') + '>Hide the adjuster’s name and phone from the customer</label><br>' +
    '<label class="gcch-ck" style="margin-top:8px"><input type="checkbox" data-ch="feature"' + (eligible(p) ? ' checked' : '') + '>Show “Insurance claim help steps” in this customer’s portal</label>' +
    '<div class="gcch-mut" style="margin-top:12px">The steps and answers are the same for every customer: ⚙ Admin → 🛡 Insurance claim help' + (isAdmin() ? ' (<a href="#" data-ch="admin">open</a>)' : '') + '.</div>' +
    '</div><div class="gcch-phone"><div data-gcch-mount="1" class="gcch-mut" style="padding:14px">Loading…</div></div></div>';
  function sel(){ var box = O.body.querySelector('[data-gcch-stepsel]'); var q = proj(pid) || p; var tmp = D.createElement('div'); tmp.innerHTML = barHtml(q); var sl = tmp.querySelector('select'); box.innerHTML = ''; if (sl) { sl.className = 'gcch-in'; box.appendChild(sl); } else box.textContent = 'Claim help is off for this job.'; }
  function draw(){
    var host = O.body.querySelector('[data-gcch-mount]'), q = proj(pid) || p;
    api({ op: 'preview', projectId: String(pid), job: jobForPreview(q) }).then(function(j){
      if (!host.isConnected) return;
      if (!j || !j.ok) { host.textContent = (j && j.error) || 'Could not make the preview.'; return; }
      if (j.eligible === false) { var msg = 'Not shown in this customer’s portal (the feature is off, or this is not an insurance / restoration / mitigation job).'; host.className = 'gcch-mut'; host.style.padding = '14px'; if (host.shadowRoot) host.shadowRoot.textContent = msg; else host.textContent = msg; return; }
      host.textContent = ''; host.className = ''; host.style.padding = '0'; mountPreview(host, j.view);
    });
  }
  sel(); pull(false).then(sel); draw();
  O.body.addEventListener('change', function(e){
    var t = e.target, q = t && t.getAttribute && t.getAttribute('data-ch');
    if (t && t.tagName === 'SELECT') { setStep(pid, t.value).then(function(){ draw(); toast('Step saved.'); }); return; }
    if (q === 'hideadj') saveProject(pid, function(x){ x.claimHelp = Object.assign({}, state(x), { hideAdjuster: !!t.checked }); x.portalShowAdjuster = !t.checked; }).then(draw);   /* the same switch as the 🛡 Insurance portal panel's */
    if (q === 'feature') setFeature(pid, !!t.checked).then(function(){ draw(); toast(t.checked ? 'Claim help steps are on for this customer.' : 'Claim help steps are off for this customer.'); });
  });
  O.body.addEventListener('click', function(e){
    var b = e.target && e.target.closest ? e.target.closest('[data-ch]') : null; if (!b) return; var q = b.getAttribute('data-ch');
    if (q === 'savenote') { setNote(pid, O.body.querySelector('[data-ch=note]').value).then(function(){ draw(); toast('Note saved — it shows in the customer’s portal.'); }); }
    if (q === 'tell') { var nv = O.body.querySelector('[data-ch=note]').value; if (s(nv) !== s(state(proj(pid) || p).note)) setNote(pid, nv).then(function(){ tellCustomer(pid); }); else tellCustomer(pid); }
    if (q === 'full') { try { W._gcInsPortal.preview(pid); } catch (x) {} }
    if (q === 'admin') { e.preventDefault(); O.close(); openAdmin(); }
  });
  return O;
}

/* put the bar right under the job's 🏠 Portal card (and under the 🛡 Insurance portal panel when there is one) */
function paintBars(force){
  if (D.hidden) return;
  var cards = D.querySelectorAll('.gcq-card');
  Array.prototype.forEach.call(cards, function(c){
    var pid = c.getAttribute('data-pid'), p = proj(pid);
    var anchor = c, nx = c.nextElementSibling;
    if (nx && nx.classList && nx.classList.contains('gcinsp-panel') && nx.getAttribute('data-pid') === String(pid)) { anchor = nx; nx = nx.nextElementSibling; }
    var mine = nx && nx.classList && nx.classList.contains('gcch-bar') ? nx : null;
    var show = !!p && insuranceType(p);
    if (!show) { if (mine) mine.remove(); return; }
    if (mine && mine.getAttribute('data-pid') !== String(pid)) { mine.remove(); mine = null; }
    if (!mine) { mine = buildBar(String(pid), c.hasAttribute('data-field')); anchor.parentNode.insertBefore(mine, anchor.nextSibling); force = true; }
    paintBar(mine, p, force);
  });
  Array.prototype.forEach.call(D.querySelectorAll('.gcch-bar'), function(el){
    var pv = el.previousElementSibling; if (pv && pv.classList.contains('gcinsp-panel')) pv = pv.previousElementSibling;
    if (!pv || !pv.classList.contains('gcq-card') || pv.getAttribute('data-pid') !== el.getAttribute('data-pid')) el.remove();
  });
}

/* ── start ── */
var addT = SI.call(W, function(){ if (addAdmin()) clearInterval(addT); }, 1000);
addAdmin();
nST(function(){ pull(true).then(function(){ paintBars(true); }); }, 6000);
SI.call(W, function(){ if (!D.hidden) pull(false); }, 15 * 60e3);
SI.call(W, function(){ try { paintBars(false); } catch (e) {} }, 1500);
W._gcClaimHelp = {
  state: function(){ return { loaded: !!ST.data, at: ST.at, admin: isAdmin(), canEdit: !!(ST.data && ST.data.canEdit), steps: publishedSteps().map(function(x){ return x.id; }), dirty: ED.dirty, bars: D.querySelectorAll('.gcch-bar').length }; },
  open: openAdmin, job: openJob, tell: tellCustomer, setStep: setStep, setNote: setNote, setFeature: setFeature, eligible: eligible, insuranceType: insuranceType,
  refresh: function(){ ED.draft = null; return pull(true); }, paint: function(){ paintBars(true); }, draft: function(){ return ED.draft ? copy(ED.draft) : null; }
};
try { console.log('[GC] 🛡 Insurance claim help: ⚙ Admin editor + the job’s claim step (patch CLAIMHELP) — _gcClaimHelp.state()'); } catch (e) {}
})();
