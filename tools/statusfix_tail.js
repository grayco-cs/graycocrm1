<script id="gc-patch-statusfix">
/* patch STATUSFIX repair card (admin, Projects page): the jobs whose status was rewritten on 11/04 by the old-copy saves,
   with the 10/29 status → the status now, pre-ticked; "Put back" writes each ticked job through the CRM's own person-edit
   job writer (window._gcxPatchJob — stamped, logged on the job, pushed). The other fields the same saves changed are listed
   unticked. The card goes away once nothing on it differs any more, or when dismissed. */
(function(W){
'use strict';
if (W.__GC_PATCH_STATUSFIX__) return; W.__GC_PATCH_STATUSFIX__ = true;
var D = document, ST = W.__GC_NATIVE_SETTIMEOUT__ || setTimeout, RI = W.__GC_NATIVE_SETINTERVAL__ || setInterval;
var DONE_KEY = 'gc_statusfix_1104_done';
/* f: field, want: the value on 10/29, bad: the value the old-copy save wrote, tick: pre-ticked, note */
var FIX = [
  { id:'PRJf570wdyf36b',   name:'Jason Watkins- reroof',                     f:'status', want:'completed', bad:'active',   tick:1 },
  { id:'PRJqwpno4m',       name:'Zoo Boardwalk Redecking',                   f:'status', want:'completed', bad:'approved', tick:1 },
  { id:'PRJ3b2y5z3',       name:'Somerville ceilings',                       f:'status', want:'completed', bad:'approved', tick:1 },
  { id:'PRJmrjnbxgi',      name:'EAN Holdings- 600 W. church St.- remodel',  f:'status', want:'completed', bad:'approved', tick:1 },
  { id:'PRJf5rtc0gzn73',   name:'Roof 2 (was Brad Potts- reroof)',           f:'status', want:'completed', bad:'bidding',  tick:1 },
  { id:'PRJ0sx249j6n8v',   name:'ROTC Cordova',                              f:'status', want:'approved',  bad:'active',   tick:1,
    note:'set to Active by Wesley Johnson on 11/02 — untick if Active is right' },
  { id:'PRJ_mstd56bh4hcb', name:'Fayette County Fire Station',               f:'status', want:'lost',      bad:'bidding',  tick:1 },
  { id:'PRJejk50lxun18',   name:'ISmash Memphis',                            f:'status', want:'lost',      bad:'bidding',  tick:1 },
  { id:'PRJ3aw4kp1u31r',   name:'EAH - Wash Bay Jonesboro',                  f:'status', want:'lost',      bad:'bidding',  tick:1 },
  { id:'PRJep9czbdsn5k',   name:'Custom Bathroom  remodel',                  f:'status', want:'lost',      bad:'bidding',  tick:1 },
  /* the same two old-copy saves also wrote these (not asked about: unticked) */
  { id:'PRJf570wdyf36b',   name:'Jason Watkins- reroof',       f:'contract', want:20185,  bad:0 },
  { id:'PRJf570wdyf36b',   name:'Jason Watkins- reroof',       f:'type',     want:'Insurance Claim', bad:'Residential Reno' },
  { id:'PRJf5rtc0gzn73',   name:'Roof 2',                      f:'name',     want:'Brad Potts- reroof', bad:'Roof 2' },
  { id:'PRJf5rtc0gzn73',   name:'Roof 2',                      f:'type',     want:'Insurance Claim', bad:'Residential Reno' },
  { id:'PRJ_mstd56bh4hcb', name:'Fayette County Fire Station', f:'type',     want:'Commercial Reno', bad:'Residential Reno' },
  { id:'PRJejk50lxun18',   name:'ISmash Memphis',              f:'contract', want:350000, bad:0 },
  { id:'PRJep9czbdsn5k',   name:'Custom Bathroom  remodel',    f:'contract', want:101000, bad:150000 },
  { id:'PRJ8v8yl0h',       name:'Mister Car Wash',             f:'contract', want:147978, bad:247978 }
];
function s(v){ return v == null ? '' : String(v); }
function same(a, b){ return s(a).trim().toLowerCase() === s(b).trim().toLowerCase(); }
function esc(v){ return s(v).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
function me(){ try { return (W.meUser && W.meUser()) || {}; } catch (e) { return {}; } }
function isAdmin(){ var r = s(me().role).toLowerCase(); return r === 'admin' || r === 'owner'; }
function who(){ var u = me(); return u.name || u.email || ''; }
function view(){ try { return localStorage.getItem('grayco_view') || ''; } catch (e) { return ''; } }
function done(){ try { return localStorage.getItem(DONE_KEY) === '1'; } catch (e) { return false; } }
function jobs(){ return (W._crm && Array.isArray(W._crm.projects)) ? W._crm.projects : []; }
function show(f, v){ return f === 'contract' ? '$' + (Number(v) || 0).toLocaleString() : s(v) || '—'; }

/* the rows still to put back: the job is there and the field is not the 10/29 value */
function pending(list){
  var by = {}; (list || jobs()).forEach(function(p){ if (p && p.id) by[p.id] = p; });
  return FIX.map(function(x, i){ var p = by[x.id]; return p && !same(p[x.f], x.want) ? Object.assign({ i:i, cur:p[x.f] }, x) : null; }).filter(Boolean);
}

/* one patch per job, through the person-edit job writer; the job's autoLog says what was put back and by whom */
async function putBack(rows){
  var byJob = {}, out = { ok:0, fail:0 };
  rows.forEach(function(x){ (byJob[x.id] = byJob[x.id] || []).push(x); });
  for (var id in byJob){
    var p = jobs().filter(function(j){ return j && j.id === id; })[0]; if (!p){ out.fail++; continue; }
    var patch = {}, txt = [];
    byJob[id].forEach(function(x){ patch[x.f] = x.want; txt.push(x.f + ': ' + show(x.f, p[x.f]) + ' → ' + show(x.f, x.want)); });
    var log = Array.isArray(p.autoLog) ? p.autoLog.slice() : [];
    log.push({ at:new Date().toISOString(), by:who() || 'Admin', text:'Put back after the 11/04 old-copy save (STATUSFIX): ' + txt.join(', ') });
    patch.autoLog = log;
    try { W._gcStatusIntent && W._gcStatusIntent(); } catch (e) {}
    var ok = false;
    try { ok = W._gcxPatchJob ? await W._gcxPatchJob(id, patch, 'STATUSFIX put back') : false; } catch (e) { ok = false; }
    if (ok) out.ok += byJob[id].length; else out.fail += byJob[id].length;
  }
  return out;
}

function paint(){
  try {
    var host = D.getElementById('_gcStatusFix');
    if (view() !== 'projects' || !isAdmin() || done()){ if (host) host.remove(); return; }
    var rows = pending();
    if (!rows.length){ if (host) host.remove(); return; }
    var key = rows.map(function(x){ return x.i + ':' + s(x.cur); }).join('|');
    if (host && host.getAttribute('data-k') === key) return;
    var main = D.querySelector('main') || D.getElementById('root'); if (!main) return;
    var keep = {}; if (host) host.querySelectorAll('input[data-i]').forEach(function(c){ keep[c.getAttribute('data-i')] = c.checked; });
    if (!host){
      host = D.createElement('div'); host.id = '_gcStatusFix';
      host.style.cssText = 'background:#fff7ed;border:2px solid #f59e0b;border-radius:10px;padding:12px 14px;margin:8px 0;color:#1f2937;font-size:13px;max-width:100%;box-sizing:border-box;overflow-x:auto';
      var yb = D.getElementById('_gcYearBar'), t = main.querySelector('table');
      var at = yb || t; if (at && at.parentElement) at.parentElement.insertBefore(host, at); else main.insertBefore(host, main.firstChild);
    }
    host.setAttribute('data-k', key);
    host.innerHTML = '<div style="font-weight:800;font-size:14px;margin-bottom:4px">⚠️ Job statuses changed by an old copy on 11/04</div>'
      + '<div style="font-size:12px;color:#57534e;margin-bottom:8px">Two computers opened with an old copy of the jobs and saved it over the newer one. Ticked rows go back to the 10/29 value.</div>'
      + '<table style="border-collapse:collapse;font-size:12px;width:100%"><tr style="text-align:left;color:#78716c"><th></th><th>Job</th><th>Field</th><th>10/29</th><th></th><th>Now</th></tr>'
      + rows.map(function(x){
          var on = (x.i in keep) ? keep[x.i] : !!x.tick;
          return '<tr style="border-top:1px solid #fde68a"><td style="padding:4px 6px"><input type="checkbox" data-i="' + x.i + '"' + (on ? ' checked' : '') + '></td>'
            + '<td style="padding:4px 6px;font-weight:700">' + esc(x.name) + (x.note ? '<div style="font-weight:400;color:#92400e">' + esc(x.note) + '</div>' : '') + '</td>'
            + '<td style="padding:4px 6px">' + esc(x.f) + '</td><td style="padding:4px 6px;color:#166534;font-weight:700">' + esc(show(x.f, x.want)) + '</td><td>←</td>'
            + '<td style="padding:4px 6px;color:#b91c1c">' + esc(show(x.f, x.cur)) + '</td></tr>';
        }).join('') + '</table>'
      + '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center">'
      + '<button data-a="go" style="background:#166534;color:#fff;border:none;border-radius:6px;padding:7px 14px;font-weight:800;cursor:pointer;font-family:inherit">Put back</button>'
      + '<button data-a="no" style="background:#e5e7eb;color:#111;border:none;border-radius:6px;padding:7px 12px;font-weight:700;cursor:pointer;font-family:inherit">Dismiss</button>'
      + '<span data-msg style="font-size:12px;color:#57534e"></span></div>';
    host.querySelector('[data-a="no"]').onclick = function(){ try { localStorage.setItem(DONE_KEY, '1'); } catch (e) {} host.remove(); };
    host.querySelector('[data-a="go"]').onclick = function(){
      var pick = [].slice.call(host.querySelectorAll('input[data-i]:checked')).map(function(c){ return +c.getAttribute('data-i'); });
      var sel = pending().filter(function(x){ return pick.indexOf(x.i) >= 0; });
      var msg = host.querySelector('[data-msg]'); if (!sel.length){ msg.textContent = 'Nothing ticked.'; return; }
      this.disabled = true; msg.textContent = 'Putting back ' + sel.length + '…';
      putBack(sel).then(function(r){ msg.textContent = r.ok + ' put back' + (r.fail ? ', ' + r.fail + ' could not be saved' : '') + '.'; host.setAttribute('data-k', ''); ST(paint, 1500); });
    };
  } catch (e) {}
}
W._gcStatusFixPending = pending; W._gcStatusFixPutBack = putBack; W._gcStatusFixPaint = paint;
RI(paint, 3000); ST(paint, 2500);
})(window);
</script>
