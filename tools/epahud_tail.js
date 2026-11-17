<script id="gc-patch-epahud">
/* __GC_PATCH_EPAHUD__ — 🏛 EPA / HUD LEAD & ASBESTOS PAPERS TO THE PM, AND THE PEOPLE / COMPANY REQUIREMENTS (owner 11/17: "All asbestos and lead
   documents, actions etc. that EPA and HUD require that I don't have — let's make them." · "All these documents deploy automatically to the
   PMs for every job type, to then send to portals, emails, texts etc." · "each must AUTO-FILL from the CRM … and show the LOGO OF THE CORRECT
   COMPANY" · "Make sure all requirements for employees, workers and company for EPA and HUD are also in here").
   Builds on 📑 JOBDOCS (the papers are rows of its table: epahud-core.js), 📚 DOCLIB (the forms + the company letterhead: COTRAIN) and
   🛡 ENVCOMP (certifications by job kind, medical, the schedule). The requirements matrix: docs/EPA_HUD_LEAD_ASBESTOS_MATRIX.md.
   • Auto-fill: every library paper (not only these) gets what the CRM knows — year built, start / end / completion dates, the state, the
     occupant, the EPA / state firm certification #, the certified renovator / abatement supervisor and their # (📜 Certifications), the
     due dates the timing rules give — in merge fields and in any EMPTY row whose label the CRM knows. Nothing typed is replaced and a
     number GrayCo does not have stays blank (never made up). The letterhead is the job's company (Construction / Mitigation / Environmental).
   • The job's 📑 Paperwork card: "📑 N papers to send" with the due dates from the official timing (RRP records with the final invoice or
     30 days · HUD notices 15 days · state abatement notice TN 5 business / MS 6 working days · NESHAP 10 working days …), who each goes
     to (owner, occupants, parents, the agency = a filing), 🏛 EPA / HUD facts (HUD-assisted, abatement, common areas, tenants, EBLL …
     + the dates that start a clock + the occupant's contact), and "Crew certified ✓ / ✗".
   • 📤 Send… per paper: 👤 customer portal (e-sign where it is signed), ✉️ e-mail, 📱 text (a link to the portal), 📤 share from this
     phone (PDF). Portal / e-mail / text go through the existing send path (DOCAUTO portal e-sign · ✅ Approvals); ⏸ data-entry mode
     holds them (logged as held, nothing goes) — the phone share still works. 🏛 Filed for agency filings (date + confirmation #).
     Every send / share / file / sign / view is logged on the paper (who, when, how) and never removed (project.jobDocs.log).
   • GrayCo Field home: "Needs you · 📑 N papers to send" (the PM's jobs) + 📜 My certifications (read-only + 📷 upload a card).
   • Overdue: a To-Do for the job's PM when a paper is due within 3 days or late; 2+ days late → the office + admins (high).
   • People: scheduling someone on a lead / asbestos / mold job checks their certifications (ENVCOMP's rules by job kind + state):
     missing / expired → ⛔ with the reason, taken back off the schedule unless an admin overrides with a reason (logged forever:
     project.epahud.overrides + gc_kv gc_epahud_overrides). Emergency mitigation jobs only warn.
   • Company / people certificates: the EPA / HUD / AHERA / OSHA types in 📜 Certifications (warn 60 / 30 / 7 days before expiry) and
     the owner's own two certificates as DRAFTS to confirm (no number until he types it).
   API: window._gcEpaHud = { fields(p), autofill(html, p, f), dueHtml(p, x), toSend(p), cardTop(p, items), sendBtn(p, x, st), action(pid, k, a),
        sendVia(pid, k, ch), log(pid, k, o), facts(pid), saveFacts(pid, v), sweep(), fieldPaint(), mine(), schedCheck(), crewLine(p), seedDrafts() } */
(function(W){
'use strict';
if (W.__GC_PATCH_EPAHUD__) return; W.__GC_PATCH_EPAHUD__ = true;
var D = W.document, ST = W.__GC_NATIVE_SETTIMEOUT__ || W.setTimeout, SI = W.__GC_NATIVE_SETINTERVAL__ || W.setInterval;
var EP = W._gcEpaHudCore; if (!EP) { try { console.warn('[GC EPAHUD] epahud-core.js did not load'); } catch (e) {} return; }
var PORTAL = '/.netlify/functions/portal', SIGN_FN = '/.netlify/functions/portal-sign', KOV = 'gc_epahud_overrides', KSEED = 'gc_epahud_seed_v1';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x != null; }) : []; }
function obj(v){ return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function esc(v){ return s(v).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function today(){ return EP.today(); }
function nowIso(){ return new Date().toISOString(); }
function nice(d){ return EP.nice(d); }
function long(d){ d = s(d).slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return ''; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return d; } }
function user(){ try { if (typeof W._gcMeUser === 'function') { var u = W._gcMeUser(); if (u && (u.name || u.email)) return u; } } catch (e) {} try { var m = W._gcMeNow; if (m && (m.name || m.email)) return m; } catch (e) {} try { var j = JSON.parse(localStorage.getItem('grayco_user') || '{}'); if (j && typeof j === 'object') return j; } catch (e) {} return {}; }
function myEmail(){ try { var e = W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email(); if (e) return low(e); } catch (e) {} return low(user().email); }
function me(){ var u = user(); if (s(u.name)) return s(u.name); var e = myEmail(); var x = arr(W._crm && W._crm.users).find(function(z){ return z && low(z.email) === e; }); return x ? s(x.name) : e || 'someone'; }
function admin(){ try { if (W.__GC_AUTH__ && W.__GC_AUTH__.isAdmin && W.__GC_AUTH__.isAdmin()) return true; } catch (e) {} var u = user(); return /^admin$/i.test(s(u.role)) || low(u.payType) === 'owner'; }
function office(){ if (admin()) return true; try { if (W._gcIsOfficeFull && W._gcIsOfficeFull()) return true; } catch (e) {} var u = user(); return /office/i.test(s(u.role) + ' ' + s(u.profile)); }
function signedIn(){ try { return !!(W.__GC_AUTH__ && W.__GC_AUTH__.email && W.__GC_AUTH__.email()); } catch (e) { return false; } }
function projects(){ return arr(W._crm && W._crm.projects); }
function proj(pid){ return projects().find(function(p){ return p && s(p.id) === s(pid); }) || null; }
function users(){ return arr(W._crm && W._crm.users); }
function JD(){ return W._gcJobDocs || null; }
function EC(){ return W._gcEnvComp || null; }
function paused(){ try { var st = W._gcPause && W._gcPause.state(); return !!(st && st.paused); } catch (e) { return false; } }
function pauseNote(){ var n = ''; try { var st = W._gcPause.state(); n = s(st && (st.note || (st.flag && st.flag.note))); } catch (e) {} return '⏸ Data-entry mode is on' + (n ? ' (' + n + ')' : '') + ' — CRM e-mail, text and portal sends are HELD (logged, nothing goes out) until an admin turns it off (planned: Jan 3). 📤 Share from this phone still works.'; }
function toast(m, bad){ try { if (W._gcSys && W._gcSys.toast) return W._gcSys.toast(m, bad); } catch (e) {} try { var t = D.createElement('div'); t.setAttribute('data-gc-keep', '1'); t.setAttribute('role', 'status'); t.className = 'gc-ep-toast'; t.textContent = m; t.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483100;background:' + (bad ? '#7f1d1d' : '#0f1d2f') + ';color:#fff;padding:10px 16px;border-radius:10px;font:600 13px Inter,Arial,sans-serif;max-width:90vw'; D.body.appendChild(t); ST.call(W, function(){ try { t.remove(); } catch (e) {} }, 4500); } catch (e) {} }
function sb(k){ try { return Promise.resolve(W._ehSb ? W._ehSb(k) : null).then(function(v){ if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; }, function(){ return null; }); } catch (e) { return Promise.resolve(null); } }
function put(k, v){ try { var f = W._supaUpsertNow || W._supaUpsert; return Promise.resolve(f ? f(k, v) : null); } catch (e) { return Promise.resolve(null); } }
function saveJob(pid, fn){
  var now = nowIso();
  var f = function(list){ var out = arr(list).map(function(p){ if (!p || s(p.id) !== s(pid)) return p; var q = JSON.parse(JSON.stringify(p)); q = fn(q) || q; q.updatedAt = now; return q; }); try { if (W._gcApplySync) W._gcApplySync('projects', out); } catch (e) {} return out; };
  if (typeof W._setProjects === 'function') W._setProjects(f); else if (W._crm) W._crm.projects = f(W._crm.projects);
}

/* ═════ 1 · auto-fill — what the CRM knows about the job and its people ═════ */
var CERTS = null;
function pullCerts(){ try { if (EC() && EC().pullCerts) EC().pullCerts(); } catch (e) {} return sb('gc_certs').then(function(v){ if (v && Array.isArray(v.list)) CERTS = v.list; return CERTS; }); }   /* 🛡 ENVCOMP reads the same list */
function certsAll(){ var L = []; try { if (W._gcCerts && W._gcCerts.list) L = arr(W._gcCerts.list()); } catch (e) {} if (!L.length && CERTS) L = arr(CERTS); if (!L.length) { try { L = arr(obj(JSON.parse(localStorage.getItem('gc_certs_cache') || '{}')).list); } catch (e) {} } return L.filter(function(c){ return c && !c.archived; }); }
function CORE(){ return W._gcEnvCompCore || null; }
function ctype(key){ var C = CORE(); if (!C) return { key: key, words: key }; var R = EC() && EC().rules ? EC().rules() : C.rules(); return C.certType(R, key); }
function certIs(c, key){ var C = CORE(); if (C) return C.certIs(c, ctype(key)); return low(c.ckind) === key; }
function current(c){ var e = s(c.expires).slice(0, 10); return !e || e >= today(); }
function stateOk(c, st){ var cs = s(c.state || c.stateAccepted).toUpperCase(); return !st || !cs || cs.split(/[\/,\s]+/).indexOf(st) >= 0; }
/* the best record of a type for a holder (company | {name,email}) in a state: current first, then a draft */
function certOf(key, holder, st){
  var L = certsAll().filter(function(c){ if (!certIs(c, key)) return false; if (holder === 'company') return c.holderType === 'company'; if (c.holderType === 'company') return false; var e = low(holder && holder.email), n = low(holder && holder.name); return (e && low(c.holder) === e) || (n && (low(c.holderName) === n || low(c.holder) === n)); });
  L.sort(function(a, b){ return (stateOk(b, st) - stateOk(a, st)) || (current(b) - current(a)) || (!!s(b.number) - !!s(a.number)) || (s(b.expires) > s(a.expires) ? 1 : -1); });
  return L[0] || null;
}
function holders(key, st){ var seen = {}, out = []; certsAll().forEach(function(c){ if (c.holderType === 'company' || !certIs(c, key) || !current(c) || !stateOk(c, st)) return; var k = low(c.holderName || c.holder); if (seen[k]) return; seen[k] = 1; out.push({ name: s(c.holderName) || s(c.holder), email: /@/.test(c.holder) ? low(c.holder) : '' }); }); return out; }
function personBy(n){ n = low(n); if (!n) return null; var u = users().find(function(x){ return x && (low(x.name) === n || low(x.email) === n); }); return u ? { name: s(u.name), email: low(u.email) } : { name: s(n), email: '' }; }
/* who is the certified renovator / abatement supervisor on this job: the one set on 🏛 facts, else the PM if certified, else the only certified person */
function roleOn(p, field, key){
  var E = obj(p.epahud), st = EP.stateOf(p), set = s(E[field]);
  if (set) return personBy(set);
  var pm = personBy(p.pm); if (pm && certOf(key, pm, st) && current(certOf(key, pm, st))) return pm;
  var H = holders(key, st); return H.length === 1 ? H[0] : null;
}
function numOf(c){ return c ? s(c.number) : ''; }
function fields(p){
  if (!p) return {};
  var a = obj(p.leadAsb), E = EP.events(p), st = EP.stateOf(p), Fx = obj(obj(p.epahud).facts), out = {};
  var yb = s(a.yearBuilt || p.yearBuilt || p.builtYear); if (yb) out.year_built = yb;
  if (s(p.startDate)) out.start_date = long(p.startDate);
  if (s(p.endDate)) out.end_date = long(p.endDate);
  if (E.completedOn) out.completion_date = long(E.completedOn);
  if (st) out.state = st;
  var occ = obj(obj(p.epahud).occupant); if (s(occ.name)) out.occupant = s(occ.name);
  out.hud_yes = EP.fact(p, 'hud') ? 'Yes' : '';
  var firm = st === 'MS' ? certOf('lead_abate_firm', 'company', 'MS') : certOf('rrp_firm', 'company', st);
  if (firm && numOf(firm)) out.rrp_firm_no = numOf(firm) + (s(firm.expires) ? ' (exp. ' + nice(firm.expires) + '/' + s(firm.expires).slice(0, 4) + ')' : '');
  var af = certOf('lead_abate_firm', 'company', st); if (af && numOf(af)) out.abate_firm_no = numOf(af);
  var rv = roleOn(p, 'renovator', 'rrp_renovator'); if (rv) { out.renovator = rv.name; var rc = certOf('rrp_renovator', rv, st); if (rc && numOf(rc)) out.renovator_no = numOf(rc) + (s(rc.expires) ? ' (exp. ' + nice(rc.expires) + '/' + s(rc.expires).slice(0, 4) + ')' : ''); }
  var sv = roleOn(p, 'supervisor', 'lead_supervisor'); if (sv) { out.supervisor = sv.name; var sc = certOf('lead_supervisor', sv, st); if (sc && numOf(sc)) out.supervisor_no = numOf(sc); }
  var dd = function(k){ var x = EP.due(p, { due: k }); return x.date ? long(x.date) : ''; };
  out.mail_by = dd('start-7'); out.records_due = dd('final30'); out.hud_reduction_by = dd('done15'); out.eval_notice_by = dd('eval15');
  out.ebll_inv_by = dd('ebll15'); out.ebll_red_by = dd('ebll30'); out.neshap_by = dd('wd10'); out.abate_notice_by = dd('state-abate');
  if (E.evalReport) out.eval_report_date = long(E.evalReport); if (E.ebllNotice) out.ebll_notice_date = long(E.ebllNotice); if (E.envReport) out.env_report_date = long(E.envReport);
  /* every EPAHUD field is there — one the CRM does not know is an empty line on the paper (never a made-up value, never "{field}") */
  ['year_built', 'start_date', 'end_date', 'completion_date', 'state', 'occupant', 'hud_yes', 'rrp_firm_no', 'abate_firm_no', 'renovator', 'renovator_no', 'supervisor', 'supervisor_no', 'mail_by', 'records_due', 'hud_reduction_by', 'eval_notice_by', 'ebll_inv_by', 'ebll_red_by', 'neshap_by', 'abate_notice_by', 'eval_report_date', 'ebll_notice_date', 'env_report_date'].forEach(function(k){ out[k] = s(out[k]); });
  return out;
}
/* the owner's "IMPORTANT LEVELS — 2026 v.3" sheet is ONE admin-edited record (gc_kv gc_lead_levels, kept with its _history by
   ENVDOCS) — the EPA / HUD papers read their numbers from it, never their own. Until the record is in the cloud, the sheet's v.3 numbers
   are used and the paper says so. Keys read (flat "a_b" or nested a.b, at the top or under .levels / .values). */
var LV = null, LV0 = { 'dlal.floor': 5, 'dlal.sill': 40, 'dlal.trough': 100, 'dlrl.floor': 'any detectable level', 'water.epa': 10, 'water.hud': 15, 'soil.play': 400, 'soil.nonPlay': 1200, 'paint.pct': 0.5, 'paint.mgcm2': 1.0, 'blood.cdcChild': 3.5, 'osha.al': 30, 'osha.pel': 50, 'blood.removal': 50, 'blood.backToWork': 40, 'waste.tclp': 5 };
/* the version a paper was made with — stamped on every sent / printed copy that cites a level, and on the paper's log */
function stamp(){ if (!LV) return '2026 v.3 (built-in)'; var y = s(LV.year || LV.yr), v = s(LV.version || LV.v || LV.rev), lab = s(LV.stamp || LV.label); return (lab || [y, v].filter(Boolean).join(' ') || s(LV.name || LV.title) || 'Lead levels').replace(/^\s*levels\s*:\s*/i, ''); }   /* ENVDOCS' record carries stamp "Levels: 2026 v.3" */
function pullLevels(){ return sb('gc_lead_levels').then(function(v){ if (v && typeof v === 'object' && !Array.isArray(v)) LV = v; return LV; }); }
function lvl(path){
  var srcs = LV ? [LV, obj(LV.levels), obj(LV.values)] : [], parts = path.split('.');
  for (var i = 0; i < srcs.length; i++) { var o = srcs[i]; var flat = o[parts.join('_')]; if (flat != null && s(obj(flat).value != null ? flat.value : flat) !== '') return s(obj(flat).value != null ? flat.value : flat); var n = o; for (var j = 0; j < parts.length && n != null; j++) n = n[parts[j]]; if (n != null && typeof n !== 'object' && s(n) !== '') return s(n); if (n && typeof n === 'object' && n.value != null) return s(n.value); }
  return s(LV0[path]);
}
function levelFields(){
  var src = LV ? (s(LV.name || LV.title) || 'Lead levels') + (s(LV.version || LV.v) ? ' ' + s(LV.version || LV.v) : '') : 'IMPORTANT LEVELS — 2026 v.3 (built-in until the admin record loads)';
  return { lvl_dlal_floor: lvl('dlal.floor'), lvl_dlal_sill: lvl('dlal.sill'), lvl_dlal_trough: lvl('dlal.trough'), lvl_dlrl: lvl('dlrl.floor'), lvl_water_epa: lvl('water.epa'), lvl_water_hud: lvl('water.hud'),
    lvl_soil_play: lvl('soil.play'), lvl_soil_other: lvl('soil.nonPlay'), lvl_paint_pct: lvl('paint.pct'), lvl_paint_mg: lvl('paint.mgcm2'), lvl_ebll: lvl('blood.cdcChild'), lvl_osha_al: lvl('osha.al'), lvl_osha_pel: lvl('osha.pel'), lvl_blood_removal: lvl('blood.removal'), lvl_blood_back: lvl('blood.backToWork'), lvl_tclp: lvl('waste.tclp'), lvl_source: src, lvl_stamp: stamp() };
}
W._gcDocFieldsExtra = function(pj){ try { return Object.assign(levelFields(), pj ? fields(pj) : {}); } catch (e) { return {}; } };
var BLANK = '(?:&nbsp;|\\s*|<span style="display:inline-block;min-width:120px;border-bottom:1px solid #999">&nbsp;</span>)';
var ROW = new RegExp('(<td[^>]*>)\\s*([^<]{2,90}?)\\s*(</td>\\s*<td[^>]*>\\s*(?:<b>)?)' + BLANK + '((?:</b>)?\\s*</td>)', 'g');
function autofill(html, p, f, id, raw){
  if (typeof html !== 'string') return html;
  var cites = /\{lvl_/.test(s(raw)) || /data-gc-levels/.test(html);
  if (cites && !/data-gc-levels/.test(html)) html += '<div data-gc-levels="' + esc(stamp()) + '" style="margin-top:8px;font-size:8pt;color:#555;text-align:right">Levels: ' + esc(stamp()) + ' — from the GrayCo Lead levels record</div>';   /* which version of the levels this copy used */
  if (!p) return html;
  f = Object.assign({}, fields(p), obj(f));
  return html.replace(ROW, function(m, a, label, b, c){
    var L = s(label).replace(/&amp;/g, '&').replace(/:$/, ''), hit = null;
    EP.labelMap.some(function(r){ if (r[0].test(L)) { hit = r[1]; return true; } return false; });
    var v = hit && s(f[hit]); return v ? a + label + b + esc(v) + c : m;
  });
}
W._gcDocAutoFill = function(body, pj, f, id, raw){ try { return autofill(body, pj, f, id, raw); } catch (e) { return body; } };

/* ═════ 2 · the paper on the job: due, who it goes to, the log ═════ */
function dueOf(p, x){ return EP.due(p, Object.assign({}, x, EP.meta(x))); }
function dueHtml(p, x){
  var d = dueOf(p, x), cite = d.cite ? ' <span class="tag">(' + esc(d.cite) + ')</span>' : '';
  if (d.date) return '<span class="' + (d.over ? 'bad' : 'due') + '" data-ep-due="' + esc(d.date) + '">' + (d.over ? 'OVERDUE — was due ' : 'Due ') + esc(nice(d.date)) + ' · ' + esc(d.txt) + (d.basis ? ' (' + esc(d.basis) + ')' : '') + '</span>' + cite;
  return '<span class="due">Due ' + esc(d.txt) + (d.wait ? ' — set ' + esc(d.wait) + ' in 🏛 facts' : '') + '</span>' + cite;
}
function itemsOf(p){ var J = obj(p && p.jobDocs); if (arr(J.items).length) return arr(J.items); try { return JD() ? arr(JD().want(p).items) : []; } catch (e) { return []; } }
function stOf(p, x){ try { return JD().stateOfItem(p, x); } catch (e) { return null; } }
function isOutgoing(x){ var T = EP.TO[EP.meta(x).to] || EP.TO.owner; return !T.internal; }
/* the papers the PM still has to send / give / file (customer-, occupant-, parent- or agency-facing, not handled, not stale) */
function toSend(p){
  if (!p || p.deleted) return [];
  return itemsOf(p).filter(function(x){ if (!x || x.stale || x.needsForm || !isOutgoing(x)) return false; return !stOf(p, x); })
    .map(function(x){ return { x: x, d: dueOf(p, x) }; }).sort(function(a, b){ return (a.d.date || '9999') < (b.d.date || '9999') ? -1 : 1; });
}
function log(pid, k, o){
  var e = Object.assign({ k: k, at: nowIso(), by: me() }, o || {});
  if (/^(sent|shared|filed|held)$/.test(s(e.act)) && !e.levels) e.levels = stamp();   /* the levels version this copy was made with */
  if (JD() && JD().patchJD) JD().patchJD(pid, function(J){ J.log = arr(J.log).concat([e]); return J; });
  else saveJob(pid, function(q){ q.jobDocs = obj(q.jobDocs); q.jobDocs.log = arr(q.jobDocs.log).concat([e]); return q; });
  return e;
}
function markSent(pid, k, via){ if (!JD()) return; JD().patchJD(pid, function(J){ J.sent = Object.assign({}, J.sent || {}); J.sent[k] = { on: today(), by: me(), at: nowIso(), via: via }; return J; }); }

/* ═════ 3 · 📤 Send… — portal / e-mail / text / share, and 🏛 Filed ═════ */
function render(doc, pid){ return W._gcDocLib && W._gcDocLib.render ? Promise.resolve(W._gcDocLib.render(doc, pid)) : Promise.resolve(null); }
function queue(p, x, ch, r, recipient){
  var job = s(p.name), intro = ch === 'sms' ? '' : '<p>Hi ' + esc(recipient === 'occupant' ? (s(obj(obj(p.epahud).occupant).name) || 'there') : (r.fields.customer || 'there')) + ',</p><p>Here is <b>' + esc(r.t.name) + '</b> for ' + esc(job || 'the property') + '. Questions? Call ' + esc(r.fields.office_phone) + '.</p><hr style="border:none;border-top:1px solid #ddd;margin:14px 0">';
  var html = ch === 'sms' ? esc('GrayCo: ' + r.t.name.replace(/\s+—.*$/, '') + ' for ' + (job || 'your property') + ' is ready. Open your GrayCo portal: https://portal.grayco-cs.com (or call ' + r.fields.office_phone + ').') : intro + r.body;
  var body = { action: 'approval', op: 'queue', kind: 'document', channel: ch === 'sms' ? 'sms' : 'email', recipient: recipient || '', projectId: String(p.id), ref: s(x.doc).replace(/[^A-Za-z0-9_.:-]/g, ''), subject: r.t.name + ' — ' + job, title: (ch === 'sms' ? '📱 ' : '📄 ') + r.t.name + ' — ' + job, html: html };
  return W.fetch(PORTAL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function(x){ return x.json().catch(function(){ return {}; }); }, function(){ return { ok: false, error: 'Cannot reach the server.' }; });
}
function pdfBlob(page, name){
  var go = function(){ return new Promise(function(res){ try { var box = D.createElement('div'); box.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff'; box.innerHTML = String(page).replace(/^[\s\S]*<body[^>]*>|<\/body>[\s\S]*$/gi, ''); D.body.appendChild(box); W.html2pdf().set({ margin: 10, filename: name + '.pdf', jsPDF: { unit: 'mm', format: 'letter' } }).from(box).outputPdf('blob').then(function(b){ box.remove(); res(b); }, function(){ box.remove(); res(null); }); } catch (e) { res(null); } }); };
  if (typeof W.File !== 'function') return Promise.resolve(null);
  if (W.html2pdf) return go();
  return new Promise(function(res){ ST.call(W, function(){ res(null); }, 9000); var sc = D.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'; sc.onload = function(){ go().then(res); }; sc.onerror = function(){ res(null); }; D.head.appendChild(sc); });
}
function share(p, x){
  return render(x.doc, p.id).then(function(r){
    if (!r) { toast('Could not make that paper.', true); return { ok: false }; }
    var name = (r.t.name + ' — ' + s(p.name)).replace(/[\\\/:*?"<>|]+/g, ' ').slice(0, 90);
    var viaViewer = function(){ try { if (W._gcViewer && W._gcViewer.open) W._gcViewer.open({ html: r.page, name: name }); } catch (e) {} log(p.id, x.k, { act: 'shared', via: 'opened on this device (print / save as PDF)' }); markSent(p.id, x.k, 'shared from this device'); return { ok: true, via: 'viewer' }; };
    if (!(W.navigator && typeof W.navigator.share === 'function')) return viaViewer();
    return pdfBlob(r.page, name).then(function(b){
      var data = { title: name, text: r.t.name + ' — ' + s(p.name) };
      if (b && typeof W.File === 'function') { try { var f = new W.File([b], name + '.pdf', { type: 'application/pdf' }); if (!W.navigator.canShare || W.navigator.canShare({ files: [f] })) data.files = [f]; } catch (e) {} }
      return Promise.resolve(W.navigator.share(data)).then(function(){ log(p.id, x.k, { act: 'shared', via: data.files ? 'shared from the phone (PDF)' : 'shared from the phone' }); markSent(p.id, x.k, 'shared from the phone'); toast('📤 Shared — logged on the paper.'); return { ok: true, via: 'share' }; }, function(e){ if (e && e.name === 'AbortError') return { ok: false, cancelled: true }; return viaViewer(); });
    });
  });
}
function sendVia(pid, k, ch){
  var p = proj(pid), x = p && JD() && JD().findItem(p, k); if (!x) return Promise.resolve({ ok: false });
  var M = EP.meta(x), T = EP.TO[M.to] || EP.TO.owner, recipient = T.occupant && M.to === 'occupant' ? 'occupant' : '';
  if (ch === 'share') return share(p, x);
  if (paused()) { log(pid, k, { act: 'held', via: ch === 'portal' ? 'customer portal' : ch === 'sms' ? 'text' : 'e-mail', note: 'data-entry mode' }); toast(pauseNote(), true); return Promise.resolve({ ok: false, held: true }); }
  if (ch === 'portal') {
    var A = W._gcDocAuto;
    var viaQueue = function(){ return render(x.doc, pid).then(function(r){ if (!r) return { ok: false }; return queue(p, x, 'email', r, recipient).then(function(j){ if (j && j.ok) { markSent(pid, k, 'portal + e-mail (approval)'); log(pid, k, { act: 'sent', via: 'portal + e-mail — waiting in ✅ Approvals', to: recipient || 'customer' }); toast('✓ Waiting in ✅ Approvals — it goes to the ' + (recipient || 'customer') + '\'s portal / e-mail when approved.'); } else toast('Not queued: ' + s(j && j.error || 'try again'), true); return j || { ok: false }; }); }); };
    if (!recipient && T.sign && A && typeof A.run === 'function' && A.active && A.active(p)) return Promise.resolve(A.run(pid, { force: true, ids: [x.doc] })).then(function(r){ if (r && r.ok && r.made) { markSent(pid, k, 'portal e-sign'); log(pid, k, { act: 'sent', via: 'customer portal — to e-sign', to: 'customer' }); toast('✍️ In the customer\'s portal to sign.'); return r; } return viaQueue(); }, viaQueue);
    return viaQueue();
  }
  return render(x.doc, pid).then(function(r){
    if (!r) { toast('Could not make that paper.', true); return { ok: false }; }
    return queue(p, x, ch, r, recipient).then(function(j){
      if (j && j.ok) { var via = ch === 'sms' ? 'text with the portal link (approval)' : 'e-mail (approval)'; markSent(pid, k, via); log(pid, k, { act: 'sent', via: via + ' — waiting in ✅ Approvals', to: recipient || 'customer' }); toast('✓ ' + (ch === 'sms' ? 'Text' : 'E-mail') + ' waiting in ✅ Approvals — it goes when approved.'); }
      else toast('Not queued: ' + s(j && j.error || 'try again'), true);
      return j || { ok: false };
    });
  });
}
function filed(pid, k){
  var p = proj(pid), x = p && JD() && JD().findItem(p, k); if (!x) return;
  var on = W.prompt('🏛 Filed with the agency — date (YYYY-MM-DD)?', today()); if (on == null) return;
  var conf = W.prompt('Confirmation # / how it was filed (online, e-mail, mail)?', ''); if (conf == null) return;
  log(pid, k, { act: 'filed', via: s(conf) || 'filed', on: s(on) || today() });
  JD().markDone(pid, k, 'filed ' + (s(on) || today()) + (s(conf) ? ' · ' + s(conf) : ''));
  toast('🏛 Filed — logged on the paper.');
}
function sheet(title, inner){
  var old = D.getElementById('gc-ep-sheet'); if (old) old.remove();
  var o = D.createElement('div'); o.id = 'gc-ep-sheet'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', title); o.setAttribute('data-gc-keep', '1');
  o.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.55);display:flex;align-items:flex-end;justify-content:center;padding:12px;font:15px Inter,Arial,sans-serif;color:#0f172a';
  o.innerHTML = '<div class="in" style="background:#fff;border-radius:16px;max-width:520px;width:100%;max-height:88vh;overflow:auto;padding:16px;box-sizing:border-box"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b style="font-size:17px">' + esc(title) + '</b><button type="button" data-eps="x" aria-label="Close" style="border:0;background:none;font-size:22px;cursor:pointer;min-height:40px;min-width:40px">✕</button></div>' + inner + '</div>';
  o.addEventListener('click', function(e){ if (e.target === o || (e.target.closest && e.target.closest('[data-eps="x"]'))) o.remove(); });
  D.body.appendChild(o); return o;
}
var B = 'display:flex;align-items:center;gap:10px;width:100%;min-height:52px;margin:8px 0 0;padding:10px 14px;border-radius:12px;border:1px solid #cbd5e1;background:#fff;font:700 15px Inter,Arial,sans-serif;cursor:pointer;text-align:left;color:#0f172a';
function menu(pid, k){
  var p = proj(pid), x = p && JD() && JD().findItem(p, k); if (!x) return null;
  var M = EP.meta(x), T = EP.TO[M.to] || EP.TO.owner, chs = EP.channels(x), d = dueOf(p, x), occ = obj(obj(p.epahud).occupant), cust = s(p.client || p.customer);
  var to = M.to === 'occupant' ? (s(occ.name) || 'the occupants') : M.to === 'parents' ? 'parents / guardians' : cust || 'the customer';
  var h = '<div style="font-size:13px;color:#475569;margin:4px 0 6px"><b>' + esc(x.label) + '</b><br>→ ' + esc(T.label) + (M.cite ? ' · ' + esc(M.cite) : '') + '<br>' + (d.date ? (d.over ? '<b style="color:#b91c1c">OVERDUE — was due ' : 'Due ') + esc(nice(d.date)) + (d.over ? '</b>' : '') + ' · ' : '') + esc(d.txt) + '</div>';
  if (paused()) h += '<div data-ep-paused="1" style="background:#fffbeb;border:1px solid #fcd34d;color:#92400e;border-radius:10px;padding:8px 10px;font-size:13px">' + esc(pauseNote()) + '</div>';
  var opt = function(ch, ic, lab, sub){ return '<button type="button" data-ep-ch="' + ch + '" style="' + B + '"><span style="font-size:22px">' + ic + '</span><span>' + esc(lab) + '<br><span style="font-weight:500;font-size:12.5px;color:#64748b">' + esc(sub) + '</span></span></button>'; };
  if (chs.indexOf('portal') > -1) h += opt('portal', '👤', M.to === 'occupant' ? 'Occupant\'s copy — portal / e-mail' : 'Customer portal' + (T.sign ? ' (e-sign)' : ''), M.to === 'occupant' ? 'to ' + to + (s(occ.email) ? ' · ' + s(occ.email) : ' — add the occupant\'s e-mail in 🏛 facts') : 'to ' + to + (T.sign ? ' — they read and sign it in the portal' : ''));
  if (chs.indexOf('email') > -1) h += opt('email', '✉️', 'E-mail', 'to ' + to + ' — waits in ✅ Approvals');
  if (chs.indexOf('text') > -1) h += opt('sms', '📱', 'Text a link', 'a secure link to the GrayCo portal — waits in ✅ Approvals');
  if (chs.indexOf('share') > -1) h += opt('share', '📤', 'Share from this phone', 'PDF to text, e-mail, AirDrop or print — works in data-entry mode');
  if (chs.indexOf('filed') > -1) h += opt('filed', '🏛', 'Filed with the agency', 'date + confirmation # — a filing, not a send (the abatement sub files the asbestos notice)');
  h += opt('open', '👁', 'Open (filled in)', 'check it before it goes');
  if (arr(x.for).indexOf('lead') > -1 || /lead|hud/i.test(s(x.doc))) h += levelsCard(p);   /* 📏 the levels this paper is made with */
  var L = arr(obj(p.jobDocs).log).filter(function(e){ return e && e.k === x.k; });
  if (L.length) h += '<div style="margin-top:12px;font-size:12.5px;color:#334155"><b>Log</b>' + L.slice(-8).reverse().map(function(e){ return '<div data-ep-log="1">' + esc(new Date(e.at).toLocaleString()) + ' · ' + esc(e.act) + ' · ' + esc(e.via || '') + ' · ' + esc(e.by || '') + '</div>'; }).join('') + '</div>';
  var o = sheet('📤 Send — ' + (s(p.name) || 'job'), h);
  o.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-ep-ch]'); if (!b) return; var ch = b.getAttribute('data-ep-ch');
    if (ch === 'open') { try { JD().open ? JD().open(pid, k) : W._gcDocLib.open(x.doc, pid); } catch (er) { try { W._gcDocLib.open(x.doc, pid); } catch (er2) {} } log(pid, k, { act: 'viewed', via: 'opened by staff' }); return; }
    if (ch === 'filed') { o.remove(); filed(pid, k); return; }
    b.disabled = true; sendVia(pid, k, ch).then(function(r){ b.disabled = false; if (r && (r.ok || r.held)) o.remove(); });
  });
  return o;
}
function sendBtn(p, x, st){
  if (!x || !x.doc || !/^gcb_/.test(x.doc)) return '';
  var M = EP.meta(x), T = EP.TO[M.to] || EP.TO.owner;
  if (T.filing) return st ? '' : '<button type="button" data-jd="ep" data-ep="filed">🏛 Filed…</button>';
  if (T.internal) return '';
  return (!st || st.sent) ? '<button type="button" data-jd="ep" data-ep="menu">📤 Send' + (st && st.sent ? ' again' : '') + '…</button>' : '';
}
function action(pid, k, a){ if (a === 'menu') return menu(pid, k); if (a === 'filed') return filed(pid, k); }

/* ═════ 4 · 🏛 EPA / HUD facts on the job (the conditions, the clock dates, the occupant, the renovator / supervisor) ═════ */
function facts(pid){
  var p = proj(pid); if (!p) return null; var E = obj(p.epahud), F = obj(E.facts), a = obj(p.leadAsb), V = EP.events(p), occ = obj(E.occupant);
  var I = 'width:100%;box-sizing:border-box;padding:9px;border:1px solid #cbd5e1;border-radius:9px;font:15px Inter,Arial,sans-serif;min-height:42px';
  var h = '<div style="font-size:12.5px;color:#475569;margin:6px 0">These pick the papers and start the clocks. Confirm each with your state program.</div>';
  h += EP.FACTS.map(function(f){ var on = (f[0] in F) ? !!F[f[0]] : !!a[f[0]]; return '<label style="display:flex;gap:10px;align-items:center;min-height:40px;font-size:14px"><input type="checkbox" data-epf="' + f[0] + '"' + (on ? ' checked' : '') + ' style="width:20px;height:20px"> ' + esc(f[1]) + '</label>'; }).join('');
  h += '<div style="font-weight:800;margin:12px 0 4px">Dates that start a clock</div>' + EP.EVENTS.map(function(e){ return '<label style="display:block;font-size:13px;margin:6px 0">' + esc(e[1]) + '<input type="date" data-epe="' + e[0] + '" value="' + esc(V[e[0]] || '') + '" style="' + I + '"><span style="font-size:11.5px;color:#64748b">' + esc(e[2]) + '</span></label>'; }).join('');
  h += '<div style="font-weight:800;margin:12px 0 4px">Occupant (tenant / adult occupant)</div>' + ['name', 'email', 'phone'].map(function(k){ return '<input data-epo="' + k + '" placeholder="Occupant ' + k + '" value="' + esc(occ[k] || '') + '" style="' + I + ';margin:4px 0">'; }).join('');
  var opts = function(key, cur){ var H = holders(key, EP.stateOf(p)); return '<option value="">— auto (the PM if certified, else the only certified person) —</option>' + H.map(function(x){ return '<option' + (low(x.name) === low(cur) ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + (s(cur) && !H.some(function(x){ return low(x.name) === low(cur); }) ? '<option selected>' + esc(cur) + '</option>' : ''); };
  h += '<div style="font-weight:800;margin:12px 0 4px">Certified people on this job</div><label style="font-size:13px">Certified renovator (RRP)<select data-epr="renovator" style="' + I + '">' + opts('rrp_renovator', E.renovator) + '</select></label><label style="font-size:13px">Lead abatement supervisor<select data-epr="supervisor" style="' + I + '">' + opts('lead_supervisor', E.supervisor) + '</select></label>';
  h += '<button type="button" data-epf-save="1" style="' + B + ';background:#166534;color:#fff;border-color:#166534;justify-content:center">💾 Save</button>';
  var o = sheet('🏛 EPA / HUD facts — ' + (s(p.name) || 'job'), h);
  o.addEventListener('click', function(e){
    if (!(e.target.closest && e.target.closest('[data-epf-save]'))) return;
    var v = { facts: {}, events: {}, occupant: {} };
    [].forEach.call(o.querySelectorAll('[data-epf]'), function(c){ v.facts[c.getAttribute('data-epf')] = !!c.checked; });
    [].forEach.call(o.querySelectorAll('[data-epe]'), function(c){ v.events[c.getAttribute('data-epe')] = s(c.value); });
    [].forEach.call(o.querySelectorAll('[data-epo]'), function(c){ v.occupant[c.getAttribute('data-epo')] = s(c.value); });
    [].forEach.call(o.querySelectorAll('[data-epr]'), function(c){ v[c.getAttribute('data-epr')] = s(c.value); });
    saveFacts(pid, v); o.remove(); toast('🏛 Saved — the paperwork and the due dates follow.');
  });
  return o;
}
function saveFacts(pid, v){
  v = obj(v);
  saveJob(pid, function(q){
    var E = obj(q.epahud), was = JSON.stringify(E);
    E.facts = Object.assign({}, obj(E.facts), obj(v.facts)); E.events = Object.assign({}, obj(E.events), obj(v.events));
    if (v.occupant) E.occupant = Object.assign({}, obj(E.occupant), obj(v.occupant));
    if ('renovator' in v) E.renovator = s(v.renovator); if ('supervisor' in v) E.supervisor = s(v.supervisor);
    E.history = arr(E.history).concat([{ at: nowIso(), by: me(), prev: JSON.parse(was) }]).slice(-50);   /* every earlier version kept on the job (the last 50) */
    q.epahud = E;
    /* the ☣️ card, 🛡 ENVCOMP and the server read these too */
    var a = obj(q.leadAsb); ['hud', 'abatement', 'childOccupied', 'units5'].forEach(function(k){ if (k in obj(v.facts)) a[k] = !!v.facts[k]; }); q.leadAsb = a;
    if (s(obj(E.occupant).email)) q.occupantEmail = s(E.occupant.email); if (s(obj(E.occupant).phone)) q.occupantPhone = s(E.occupant.phone);
    return q;
  });
  ST.call(W, function(){ try { if (JD()) JD().assign(pid); } catch (e) {} }, 120);
}

/* ═════ 5 · the job card top: 📑 N papers to send · 🏛 facts · crew certified ═════ */
function crewLine(p){
  var E = EC(); if (!E || !E.isOn || !E.isOn(p)) return '';
  var R = E.evaluate(p), bl = arr(R.items).filter(function(x){ return x.sec === 'people' && x.st === 'block'; }), du = arr(R.items).filter(function(x){ return x.sec === 'people' && x.st === 'due'; });
  if (!arr(R.people).length) return '<div class="m" data-ep-crew="none">👷 Crew certified: nobody is scheduled yet</div>';
  return bl.length ? '<div class="bad" data-ep-crew="bad">✗ Crew certified — ' + bl.length + ' problem' + (bl.length === 1 ? '' : 's') + ': ' + esc(bl.slice(0, 3).map(function(x){ return x.label; }).join(' · ')) + '</div>'
    : '<div class="ok" data-ep-crew="ok">✓ Crew certified' + (du.length ? ' <span class="due">(' + du.length + ' to renew / add soon)</span>' : '') + '</div>';
}
/* 📏 Lead levels on a lead job (ENVDOCS' card when it is loaded; else the same numbers from the record) */
function levelsCard(p){
  try { if (typeof W._gcLeadLevelsCard === 'function') { var c = W._gcLeadLevelsCard(p); if (c) return c; } } catch (e) {}
  var L = levelFields();
  return '<div class="m" data-ep-levels="' + esc(L.lvl_stamp) + '" style="margin:6px 0;padding:6px 8px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc">📏 <b>Lead levels</b> (' + esc(L.lvl_stamp) + '): dust clearance floors ' + esc(L.lvl_dlal_floor) + ' · sills ' + esc(L.lvl_dlal_sill) + ' · troughs ' + esc(L.lvl_dlal_trough) + ' µg/ft² · paint ' + esc(L.lvl_paint_mg) + ' mg/cm² or ' + esc(L.lvl_paint_pct) + '% · soil ' + esc(L.lvl_soil_play) + ' / ' + esc(L.lvl_soil_other) + ' µg/g · water HUD ' + esc(L.lvl_water_hud) + ' ppb · child blood ' + esc(L.lvl_ebll) + ' µg/dL · OSHA AL ' + esc(L.lvl_osha_al) + ' / PEL ' + esc(L.lvl_osha_pel) + ' µg/m³</div>';
}
function cardTop(p, items){
  var L = toSend(p), over = L.filter(function(z){ return z.d.over; }).length, nx = L.find(function(z){ return z.d.date; });
  var lead = /lead|asbestos/.test(arr(obj(p.jobDocs).types).join(' ') + ' ' + (JD() ? JD().types(p).join(' ') : ''));
  var h = '<div class="m" data-ep-top="1" style="margin:6px 0;font-size:13px">' + (L.length ? '<b' + (over ? ' class="bad"' : '') + '>📑 ' + L.length + ' paper' + (L.length === 1 ? '' : 's') + ' to send</b>' + (over ? ' · <b class="bad">' + over + ' overdue</b>' : '') + (nx ? ' · next due ' + esc(nice(nx.d.date)) : '') : '✓ No papers waiting to be sent') + (lead ? ' <button type="button" data-jd="facts" style="min-height:28px;padding:2px 8px">🏛 EPA / HUD facts</button>' : '') + '</div>';
  try { h += crewLine(p); } catch (e) {}
  if (/lead/.test(arr(obj(p.jobDocs).types).join(' ') + ' ' + (JD() ? JD().types(p).join(' ') : ''))) h += levelsCard(p);
  return h;
}

/* ═════ 6 · GrayCo Field home: Needs you · 📑 papers to send + 📜 My certifications ═════ */
function myPmJobs(){ var n = low(me()), e = myEmail(); return projects().filter(function(p){ return p && !p.deleted && !/complete|closed|lost|cancel|dead|archiv/i.test(s(p.status)) && ((n && low(p.pm) === n) || (e && low(p.pmEmail) === e)); }); }
function fieldModel(){
  var out = []; myPmJobs().forEach(function(p){ toSend(p).forEach(function(z){ out.push({ p: p, x: z.x, d: z.d }); }); });
  if (office()) projects().forEach(function(p){ if (!p || p.deleted || myPmJobs().indexOf(p) > -1) return; toSend(p).forEach(function(z){ if (z.d.over && (z.d.days || 0) <= -2) out.push({ p: p, x: z.x, d: z.d, esc: true }); }); });
  return out.sort(function(a, b){ return (a.d.date || '9999') < (b.d.date || '9999') ? -1 : 1; });
}
function myCerts(){ var e = myEmail(), n = low(me()); return certsAll().filter(function(c){ return c.holderType !== 'company' && ((e && low(c.holder) === e) || (n && low(c.holderName) === n)); }); }
var FSIG = '';
function fieldPaint(){
  try {
    var home = D.querySelector('#_gcJobPick.gc-fh .fh-wrap'); if (!home) return;
    var M = fieldModel(), C = myCerts(), sig = JSON.stringify([M.map(function(z){ return [z.p.id, z.x.k, z.d.date, z.d.over]; }), C.map(function(c){ return [c.id, c.expires, c.number]; }), paused()]);
    var box = D.getElementById('gc-ep-field');
    if (box && box.parentElement === home && box.__sig === sig) return;
    if (!box) { box = D.createElement('div'); box.id = 'gc-ep-field'; box.setAttribute('data-gc-keep', '1'); }
    var bad = C.filter(function(c){ return s(c.expires) && s(c.expires) < today(); }).length;
    var h = '';
    if (M.length) {
      h += '<div class="fh-sec"><span>Needs you · 📑 ' + M.length + ' paper' + (M.length === 1 ? '' : 's') + ' to send</span></div>';
      h += M.slice(0, 6).map(function(z){ return '<div class="fh-ap" data-ep-pid="' + esc(z.p.id) + '" data-ep-k="' + esc(z.x.k) + '" style="display:flex;gap:8px;align-items:center"><div class="t" style="flex:1;min-width:0"><b>' + esc(z.x.label.split(' — ')[0]) + ' · ' + esc(z.p.name) + '</b><span style="display:block;font-size:12.5px;color:' + (z.d.over ? '#b91c1c' : '#475569') + '">' + (z.d.date ? (z.d.over ? 'OVERDUE — was due ' : 'Due ') + esc(nice(z.d.date)) : 'Due ' + esc(z.d.txt)) + (z.esc ? ' · office' : '') + '</span></div><button type="button" data-ep-fa="send" style="min-height:44px;border-radius:10px;border:0;background:#241968;color:#fff;font-weight:800;padding:0 12px">📤 Send</button></div>'; }).join('');
      if (M.length > 6) h += '<div class="fh-empty">+ ' + (M.length - 6) + ' more on the jobs\' 📑 Paperwork</div>';
    }
    h += '<button type="button" data-ep-fa="certs" style="display:flex;align-items:center;gap:8px;width:100%;min-height:46px;margin:8px 0;border:1px solid #e5e7eb;border-radius:12px;background:#fff;padding:8px 12px;font-weight:700;color:#0f172a">📜 My certifications (' + C.length + ')' + (bad ? ' <span style="color:#b91c1c">· ' + bad + ' expired</span>' : '') + '</button>';
    box.innerHTML = h; box.__sig = sig;
    if (box.parentElement !== home) { var top = home.querySelector('.gc-ra-top'); home.insertBefore(box, top ? top.nextSibling : home.firstChild); }
  } catch (e) { W.__gcEpErr = String(e && e.stack || e); }
}
D.addEventListener('click', function(e){
  var b = e.target && e.target.closest ? e.target.closest('#gc-ep-field [data-ep-fa]') : null; if (!b) return;
  e.preventDefault(); e.stopPropagation();
  if (b.getAttribute('data-ep-fa') === 'certs') return mine();
  var r = b.closest('[data-ep-pid]'); if (r) menu(r.getAttribute('data-ep-pid'), r.getAttribute('data-ep-k'));
}, true);
function certSt(c){ var e = s(c.expires).slice(0, 10); if (!e) return ['nodate', 'no expiry on file']; var n = EP.daysBetween(today(), e); return n < 0 ? ['bad', 'EXPIRED ' + nice(e) + '/' + e.slice(0, 4)] : n <= 60 ? ['soon', 'expires ' + nice(e) + '/' + e.slice(0, 4) + ' (' + n + ' days)'] : ['ok', 'good to ' + nice(e) + '/' + e.slice(0, 4)]; }
function mine(){
  var C = myCerts(), Cc = CORE(), R = Cc ? (EC() && EC().rules ? EC().rules() : Cc.rules()) : null;
  var h = '<div style="font-size:12.5px;color:#475569;margin:6px 0">What the CRM has for you. The office keeps them current; upload a new card here and it goes to the office to check.</div>';
  h += C.length ? C.map(function(c){ var st = certSt(c); return '<div data-ep-cert="' + esc(c.id) + '" style="border-top:1px solid #f1f5f9;padding:8px 0"><b>' + esc(c.name) + '</b>' + (c.draft ? ' <span style="color:#92400e;font-size:12px">draft — the office confirms it</span>' : '') + '<div style="font-size:12.5px;color:' + (st[0] === 'bad' ? '#b91c1c' : st[0] === 'soon' ? '#92400e' : '#475569') + '">' + esc(st[1]) + (s(c.number) ? ' · #' + esc(c.number) : '') + (s(c.provider || c.issuer) ? ' · ' + esc(c.provider || c.issuer) : '') + '</div></div>'; }).join('') : '<div style="color:#64748b">None on file yet.</div>';
  if (R) h += '<div style="font-weight:800;margin:12px 0 4px">📷 Upload a card</div><select data-epc="kind" style="width:100%;min-height:44px;border:1px solid #cbd5e1;border-radius:9px;font:15px Inter,Arial,sans-serif">' + arr(R.certTypes).filter(function(t){ return !t.company; }).map(function(t){ return '<option value="' + esc(t.key) + '">' + esc(t.label) + '</option>'; }).join('') + '</select><input data-epc="expires" type="date" aria-label="Expires" style="width:100%;min-height:44px;margin-top:6px;border:1px solid #cbd5e1;border-radius:9px;box-sizing:border-box"><input data-epc="number" placeholder="Card / certificate # (as printed)" style="width:100%;min-height:44px;margin-top:6px;border:1px solid #cbd5e1;border-radius:9px;padding:0 9px;box-sizing:border-box"><button type="button" data-epc="up" style="' + B + ';justify-content:center">📷 Take a photo / pick the file</button>';
  var o = sheet('📜 My certifications', h);
  o.addEventListener('click', function(e){
    if (!(e.target.closest && e.target.closest('[data-epc="up"]'))) return;
    var i = D.createElement('input'); i.type = 'file'; i.accept = 'image/*,application/pdf'; i.style.display = 'none';
    i.onchange = function(){ var f = (i.files || [])[0]; i.remove(); if (!f || !EC() || !EC().addCert) return; var g = function(n){ return s((o.querySelector('[data-epc="' + n + '"]') || {}).value); };
      Promise.resolve(EC().addCert({ email: myEmail(), name: me() }, { ckind: g('kind'), number: g('number'), expires: g('expires'), files: { file: [f] } })).then(function(c){ if (c) { o.remove(); toast('📜 Sent to the office to check.'); } }); };
    D.body.appendChild(i); i.click();
  });
  return o;
}

/* ═════ 7 · overdue → the PM, then the office / admins ═════ */
function tasks(){ try { var l = JSON.parse(localStorage.getItem('gc_office_tasks') || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function saveTasks(l){ try { localStorage.setItem('gc_office_tasks', JSON.stringify(l)); } catch (e) {} try { if (W._gcOfficeTasksPush) W._gcOfficeTasksPush(); } catch (e) {} try { var u = W._supaUpsertNow || W._supaUpsert; if (u) u('gc_office_tasks', l); } catch (e) {} }
function wanted(){
  var want = {}, mine = low(me());
  projects().forEach(function(p){
    if (!p || p.deleted || p.importedHistory || /lost|cancel|dead|archiv/i.test(s(p.status))) return;
    if (!office() && low(p.pm) !== mine) return;
    toSend(p).forEach(function(z){
      if (!z.d.date || !(z.d.over || z.d.soon)) return;
      var job = s(p.name || p.client || p.id), lab = z.x.label.split(' — ')[0];
      want['EPAHUD_' + p.id + '_' + z.x.k] = { p: p, assignee: s(p.pm) || 'Office', prio: z.d.over ? 'high' : 'med', label: '📑 ' + job + ': ' + lab + (z.d.over ? ' — OVERDUE (was due ' + nice(z.d.date) + ')' : ' — due ' + nice(z.d.date)), note: z.x.label + '\n' + z.d.txt + (z.d.cite ? ' (' + z.d.cite + ')' : '') + '\nJob → 📑 Paperwork → 📤 Send… (or GrayCo Field → Needs you).' };
      if (z.d.over && (z.d.days || 0) <= -2) want['EPAHUD_ESC_' + p.id + '_' + z.x.k] = { p: p, assignee: 'Office', prio: 'high', label: '⚠ ' + job + ': ' + lab + ' is ' + (-z.d.days) + ' days late — PM ' + (s(p.pm) || 'not set') + ' (office + admins)', note: z.x.label + '\nWas due ' + nice(z.d.date) + ' — ' + z.d.txt + (z.d.cite ? ' (' + z.d.cite + ')' : '') + '. Escalated to the office and the admins.' };
    });
  });
  return want;
}
function sweep(){
  try {
    if (!signedIn() || !projects().length) return 0;
    var l = tasks(), now = nowIso(), ch = 0, want = wanted();
    Object.keys(want).forEach(function(id){ var w = want[id], cur = l.find(function(y){ return y && y.id === id; });
      if (!cur) { l.push({ id: id, kind: 'epahud', pid: w.p.id, label: w.label, note: w.note, assignee: w.assignee, prio: w.prio, addedBy: 'CRM', addedAt: now, updatedAt: now, done: false }); ch++; }
      else if (cur.done || cur.label !== w.label) { cur.label = w.label; cur.note = w.note; cur.prio = w.prio; cur.done = false; cur.updatedAt = now; ch++; } });
    l.forEach(function(y){ if (y && !y.done && /^EPAHUD_/.test(s(y.id)) && !want[y.id]) { var p = proj(y.pid); if (!office() && !(p && low(p.pm) === low(me()))) return; y.done = true; y.doneAt = y.updatedAt = now; y.resolution = 'sent / handled on 📑 Paperwork'; ch++; } });
    if (ch) saveTasks(l);
    return ch;
  } catch (e) { W.__gcEpErr = String(e && e.stack || e); return 0; }
}

/* ═════ 8 · people: scheduling someone on a lead / asbestos / mold job checks their certifications ═════ */
var SNAP = null, OVR = {};
function names(x){ var out = []; [x.assignee, x.who, x.crew, x.people, x.lead].concat(arr(x.assignees)).forEach(function(v){ (Array.isArray(v) ? v : s(v).split(/\s*[,;&\/]\s*|\s+and\s+/i)).forEach(function(n){ n = s(n && typeof n === 'object' ? (n.name || n.email) : n); if (n && out.indexOf(n) < 0) out.push(n); }); }); return out; }
function pidOf(x){ return s(x && (x.pid || x.projectId || x.jobId)); }
function emergency(p){ try { return !!(JD() && JD().emergency(p)); } catch (e) { return false; } }
function problems(p, who){
  var E = EC(); if (!E || !E.isOn || !E.isOn(p)) return [];
  var R = E.evaluate(p), n = low(who), out = [];
  arr(R.items).forEach(function(x){ if (x.sec === 'people' && x.st === 'block' && low(x.who) === n) out.push(x.label + (x.note ? ' — ' + x.note : '')); });
  var u = users().find(function(z){ return z && (low(z.name) === n || low(z.email) === n); });
  if (u && E.canSchedule) { var c = E.canSchedule(u.email, p.id); if (c && !c.ok) out.push(c.why); }
  return out;
}
function overrideLog(o){
  saveJob(o.pid, function(q){ q.epahud = obj(q.epahud); q.epahud.overrides = arr(q.epahud.overrides).concat([o]); return q; });
  sb(KOV).then(function(v){ v = obj(v); v.list = arr(v.list).concat([o]); return put(KOV, v); });
}
function revert(sid, prevJson){
  if (typeof W._setSchedule !== 'function') return;
  W._setSchedule(function(list){ var out = arr(list).slice(), i = out.findIndex(function(x){ return x && s(x.id) === s(sid); }); if (i < 0) return out; if (prevJson) out[i] = JSON.parse(prevJson); else out.splice(i, 1); return out; });
}
function schedCheck(list){
  try {
    list = arr(list || (W._crm && W._crm.schedule)); var cur = {}; list.forEach(function(x){ if (x && x.id) cur[s(x.id)] = JSON.stringify(x); });
    if (!SNAP) { SNAP = cur; return []; }
    var hits = [];
    list.forEach(function(x){
      if (!x || !x.id || x.deleted) return; var sid = s(x.id), prev = SNAP[sid]; if (prev === cur[sid]) return;
      var p = proj(pidOf(x)); if (!p || p.deleted) return;
      var was = prev ? names(JSON.parse(prev)) : [], added = names(x).filter(function(n){ return was.indexOf(n) < 0; });
      added.forEach(function(n){ if (OVR[sid + '|' + low(n)]) return; var pr = problems(p, n); if (pr.length) hits.push({ sid: sid, prev: prev || '', p: p, who: n, why: pr, em: emergency(p) }); });
    });
    SNAP = cur;
    if (hits.length) ask(hits);
    return hits;
  } catch (e) { W.__gcEpErr = String(e && e.stack || e); return []; }
}
function ask(hits){
  var em = hits.every(function(h){ return h.em; }), list = hits.map(function(h){ return '<div style="margin:6px 0"><b>' + esc(h.who) + '</b> on <b>' + esc(h.p.name) + '</b>' + (h.em ? ' <span style="color:#155e75">(emergency job — a warning only)</span>' : '') + '<ul style="margin:4px 0 0 18px;padding:0">' + h.why.map(function(w){ return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>'; }).join('');
  var h = '<div data-ep-block="' + (em ? 'warn' : 'block') + '" style="background:' + (em ? '#ecfeff;border:1px solid #a5f3fc;color:#155e75' : '#fef2f2;border:1px solid #fca5a5;color:#991b1b') + ';border-radius:10px;padding:8px 10px;margin:8px 0;font-size:13.5px">' + (em ? '⚠ Certification problem on an emergency mitigation job — it stays on the schedule; fix the papers in 📜 Certifications.' : '⛔ Not certified for this work. They come off the schedule unless an admin overrides with a reason (kept on the job).') + '</div>' + list;
  h += em ? '<button type="button" data-epb="ok" style="' + B + ';justify-content:center">OK</button>'
    : '<button type="button" data-epb="off" style="' + B + ';justify-content:center;background:#991b1b;color:#fff;border-color:#991b1b">Take them off the schedule</button>' + (admin() ? '<button type="button" data-epb="over" style="' + B + ';justify-content:center">Override (admin) — give the reason</button>' : '');
  var o = sheet(em ? '⚠ Crew certification' : '⛔ Crew not certified', h);
  var done = false;
  var off = function(){ if (done) return; done = true; hits.filter(function(x){ return !x.em; }).forEach(function(x){ revert(x.sid, x.prev); SNAP[x.sid] = x.prev || undefined; if (!x.prev) delete SNAP[x.sid]; }); toast('Taken off the schedule — not certified for this work.', true); };
  o.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('[data-epb]'); var a = b ? b.getAttribute('data-epb') : (e.target === o || (e.target.closest && e.target.closest('[data-eps="x"]')) ? 'close' : '');
    if (!a) return;
    if (a === 'ok') { o.remove(); return; }
    if (a === 'over') { var why = W.prompt('Why may they work on this job without the certification? (kept on the job forever)', ''); if (why == null || !s(why)) return; done = true;
      hits.forEach(function(x){ OVR[x.sid + '|' + low(x.who)] = 1; overrideLog({ pid: x.p.id, job: s(x.p.name), sched: x.sid, who: x.who, why: s(why), reasons: x.why, by: me(), email: myEmail(), at: nowIso() }); });
      o.remove(); toast('Override logged on the job.'); return; }
    if (a === 'off' || a === 'close') { if (!em) off(); o.remove(); }
  });
  return o;
}
function hookSched(){ var f = W._gcCustAllSaw; if (f && f.__gcEp) return; var w = function(key, value){ var r = typeof f === 'function' ? f.apply(this, arguments) : undefined; try { if (key === 'schedule' && Array.isArray(value)) ST.call(W, function(){ schedCheck(value); }, 60); } catch (e) {} return r; }; w.__gcEp = true; W._gcCustAllSaw = w; }
hookSched();

/* ═════ 9 · 📜 Certifications: the EPA / HUD / AHERA / OSHA types + the owner's own certificates as drafts ═════ */
function addTemplates(){ try { var T = W._gcCerts && W._gcCerts.templates; if (!Array.isArray(T)) return false; EP.certTemplates.forEach(function(t){ if (!T.some(function(x){ return x && x.t === t.t; })) T.splice(Math.max(0, T.length - 1), 0, JSON.parse(JSON.stringify(t))); }); return true; } catch (e) { return false; } }
var SEEDING = null;
function seedDrafts(){
  if (SEEDING) return SEEDING; if (!admin() || !signedIn()) return Promise.resolve({ ok: false, why: 'admin' });
  SEEDING = Promise.all([sb('gc_certs'), sb(KSEED)]).then(function(a){
    var o = obj(a[0]), flag = obj(a[1]); if (flag.at) return { ok: true, skipped: true };
    var L = arr(o.list), add = EP.drafts.filter(function(d){ return !L.some(function(c){ return c && (c.draftId === d.draftId || (low(c.holder) === low(d.holder) && low(c.ckind || c.tpl) === low(d.ckind) && s(c.issued) === s(d.issued))); }); })
      .map(function(d){ return Object.assign({ id: 'CERT' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), draft: true, number: '', expires: '', fee: 0, feeNote: '', requirements: 'Confirm from the card (EPAHUD draft).', renewUrl: '', fileRef: '', fileName: '', payments: [], archived: false, updatedAt: nowIso(), by: 'CRM (draft — confirm)' }, JSON.parse(JSON.stringify(d))); });
    var w = add.length ? put('gc_certs', { list: L.concat(add), updatedAt: nowIso() }) : Promise.resolve();
    return w.then(function(){ return put(KSEED, { at: nowIso(), by: me(), added: add.length }); }).then(function(){ try { if (W._gcCerts && W._gcCerts.load) W._gcCerts.load(); } catch (e) {} return { ok: true, added: add.length }; });
  }).then(function(x){ SEEDING = null; return x; }, function(){ SEEDING = null; return { ok: false }; });
  return SEEDING;
}

/* ═════ 10 · signed / viewed in the portal → the paper's log ═════ */
var PS = {};
function portalLog(p){
  if (!p || !p.id || (PS[p.id] && Date.now() - PS[p.id] < 120000)) return; PS[p.id] = Date.now();
  var items = itemsOf(p); if (!items.length) return;
  try { W.fetch(SIGN_FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list', projectId: String(p.id) }) }).then(function(r){ return r.json(); }).then(function(j){
    var L = arr(obj(p.jobDocs).log);
    arr(j && j.items).forEach(function(r){ var doc = /^dl_/.test(s(r.refId)) ? s(r.refId).slice(3) : ''; var x = doc && items.find(function(y){ return y.doc === doc; }); if (!x) return;
      var ev = [];
      if (s(r.viewedAt || r.openedAt || r.firstViewAt)) ev.push(['viewed', 'opened in the customer portal', s(r.viewedAt || r.openedAt || r.firstViewAt)]);
      if (r.status === 'signed') ev.push(['signed', 'e-signed in the customer portal', s(r.signedAt) || nowIso()]);
      ev.forEach(function(e){ if (!L.some(function(z){ return z.k === x.k && z.act === e[0] && z.ref === s(r.id); })) log(p.id, x.k, { act: e[0], via: e[1], ref: s(r.id), when: e[2], by: 'customer' }); });
    }); }).catch(function(){}); } catch (e) {}
}

/* ── run ── */
var started = false;
function tick(){
  if (!signedIn()) return;
  if (!started) { started = true; addTemplates(); pullCerts(); pullLevels(); ST.call(W, seedDrafts, 8000); }
  fieldPaint();
  try { var op = W._gcOpenProject; if (op && op.id && D.getElementById('gc-jd')) portalLog(proj(op.id)); } catch (e) {}
}
SI.call(W, tick, 2500); ST.call(W, tick, 1500);
ST.call(W, sweep, 45000); SI.call(W, sweep, 300000); SI.call(W, pullCerts, 180000); SI.call(W, pullLevels, 300000); SI.call(W, addTemplates, 10000);
W._gcEpaHud = { fields: fields, autofill: autofill, dueHtml: dueHtml, dueOf: dueOf, toSend: toSend, cardTop: cardTop, sendBtn: sendBtn, action: action, menu: menu, sendVia: sendVia, filed: filed, log: log,
  facts: facts, saveFacts: saveFacts, sweep: sweep, wanted: wanted, fieldPaint: fieldPaint, mine: mine, schedCheck: schedCheck, problems: problems, crewLine: crewLine, seedDrafts: seedDrafts, addTemplates: addTemplates,
  certOf: certOf, roleOn: roleOn, pullCerts: pullCerts, pullLevels: pullLevels, levels: levelFields, stamp: stamp, levelsCard: levelsCard, _reset: function(){ SNAP = null; OVR = {}; FSIG = ''; } };
try { console.log('[GC] 🏛 EPA / HUD papers to the PM + crew certification check (patch EPAHUD) — _gcEpaHud'); } catch (e) {}
})(window);
</script>
