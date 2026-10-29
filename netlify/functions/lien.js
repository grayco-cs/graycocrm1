// netlify/functions/lien.js — patch AUTO-LIEN: optional sub lien waivers (the work is in _lib/lien.js).
//   GET  ?t=<link token>                      → the sub's page: read the waiver, sign online or upload a signed one
//   POST { action:'sign', t, name, title }    → (the sub) sign it         — no sign-in, the link is the key
//   POST { action:'upload', t, file, name }   → (the sub) upload their own signed PDF / photo
//   Signed in to the CRM (staff):
//   POST { action:'list' }                                     → every waiver (no link tokens) + the ON / OFF settings
//   POST { action:'request', invId } | { action:'request', pid, sub, subId, final:true }   → "📝 Request lien waiver"
//   POST { action:'toggle', kind:'sub'|'job', key, on }        → (admin / office) "Lien waivers: on / off"
//   POST { action:'override', pid, reason }                    → (admin) close a job without its waivers
//   patch AUTOMONEY:
//   GET  ?t=<link token>&pdf=1                                 → (the sub) the waiver as a PDF
//   POST { action:'paper', id | invId, file, name }            → (admin / office) "received on paper" + the scan
//   POST { action:'pdf', id }                                  → (staff) the waiver PDF (base64)
'use strict';
require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const L = require('./_lib/lien.js');
const A = require('./_lib/auto-common.js');
const { s, low, esc, usd, num, arr, pidOf } = A;
function hdr(event, name){ const h = (event && event.headers) || {}; const k = Object.keys(h).find(function(x){ return x.toLowerCase() === name; }); return k ? s(h[k]) : ''; }
function ipOf(event){ return s(hdr(event, 'x-nf-client-connection-ip') || hdr(event, 'x-forwarded-for').split(',')[0]); }
const JH = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
function J(code, body){ return { statusCode: code, headers: JH, body: JSON.stringify(body) }; }
function page(w, t){
  const done = w && /^(signed|uploaded|paper)$/.test(s(w.status));   /* patch AUTOMONEY: + received on paper */
  const body = !w ? '<p>This link is not valid any more. Ask GrayCo for a new one: office@grayco-cs.com · 901-585-0944.</p>'
    : '<p style="color:#55626F;margin:0 0 6px">' + esc(w.sub) + ' · ' + esc(w.jobName) + (w.jobAddress ? ' · ' + esc(w.jobAddress) : '') + ' · ' + usd(w.amount) + '</p>' +
      '<div style="border:1px solid #E2DCCD;border-radius:10px;padding:12px 14px;background:#FBFAF6">' + L.waiverText(w) + '</div>' +
      '<p style="font-size:13px"><a href="?t=' + encodeURIComponent(s(t)) + '&amp;pdf=1" target="_blank" rel="noopener">Download the waiver (PDF)</a></p>' +   /* patch AUTOMONEY */
      (done ? '<p style="font-size:16px;font-weight:bold;color:#14532d">✅ ' + (w.status === 'signed' ? 'Signed by ' + esc(w.signerName) + ' on ' + esc(s(w.signedAt).slice(0, 10)) : 'Your signed copy was received on ' + esc(s(w.uploadedAt || w.paperAt).slice(0, 10))) + '. Thank you.</p>'
        : '<form id="f" style="display:flex;flex-direction:column;gap:10px;margin-top:14px">' +
          '<label>Your full name<br><input id="n" required autocomplete="name" style="width:100%;font-size:16px;padding:10px;border:1px solid #c9c2b0;border-radius:8px"></label>' +
          '<label>Title (owner, office manager…)<br><input id="ti" style="width:100%;font-size:16px;padding:10px;border:1px solid #c9c2b0;border-radius:8px"></label>' +
          '<label style="display:flex;gap:8px;align-items:flex-start"><input id="ag" type="checkbox" style="width:22px;height:22px"> I have read this waiver and sign it for ' + esc(w.sub) + '. My typed name is my signature.</label>' +
          '<button style="font-size:17px;font-weight:bold;padding:12px;border:none;border-radius:10px;background:#0F1D2F;color:#fff">Sign the waiver</button></form>' +
          '<p style="margin-top:18px">Or upload your own signed waiver (PDF, JPG or PNG, under 8 MB):</p><input id="up" type="file" accept="application/pdf,image/jpeg,image/png">' +
          '<p id="msg" style="font-weight:bold"></p>');
  const js = w && !done ? '<script>(function(){var T=' + JSON.stringify(s(t)) + ';function post(b){return fetch(location.pathname,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}).then(function(r){return r.json();});}' +
    'var m=document.getElementById("msg");document.getElementById("f").onsubmit=function(e){e.preventDefault();if(!document.getElementById("ag").checked){m.textContent="Tick the box to sign.";return;}' +
    'post({action:"sign",t:T,name:document.getElementById("n").value,title:document.getElementById("ti").value}).then(function(j){if(j.ok)location.reload();else m.textContent=j.error||"Try again.";});};' +
    'document.getElementById("up").onchange=function(){var f=this.files[0];if(!f)return;if(f.size>8*1024*1024){m.textContent="That file is over 8 MB.";return;}var r=new FileReader();r.onload=function(){m.textContent="Uploading…";post({action:"upload",t:T,file:r.result,name:f.name}).then(function(j){if(j.ok)location.reload();else m.textContent=j.error||"Try again.";});};r.readAsDataURL(f);};})();</script>' : '';
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Lien waiver — GrayCo Construction Services</title></head>' +
    '<body style="margin:0;background:#F3F1EA;font-family:Arial,Helvetica,sans-serif;color:#14202E"><div style="max-width:640px;margin:0 auto;padding:18px 16px 40px">' +
    '<div style="background:#0F1D2F;color:#fff;padding:12px 16px;border-radius:12px 12px 0 0;text-align:center"><img src="/portal-logo.png" alt="GrayCo Construction Services" width="119" height="67" style="height:0.7in;width:auto;display:block;margin:0 auto 4px"><div style="line-height:1.4"><div style="font-weight:bold;font-size:18px">GrayCo Construction Services</div><div style="font-size:13px;color:#C9D3E0">901-585-0944 · Lien waiver</div><div style="font-size:11px;color:#D4A017">TN #85034 BCB · AR #0486990627 · MS #27769</div></div></div>' +   /* patch LOGO: */
    '<div style="background:#fff;border:1px solid #E2DCCD;border-top:none;padding:16px;border-radius:0 0 12px 12px;line-height:1.5">' + body + '</div></div>' + js + '</body></html>';
}
exports.handler = async function(event){
  event = event || {};
  if (!s(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) return J(500, { ok: false, error: 'SUPABASE_SERVICE_KEY not set.' });
  const qs = event.queryStringParameters || {};
  if ((event.httpMethod || 'GET') === 'GET') {
    const w = s(qs.t) ? await L.byToken(qs.t) : null;
    if (w && s(qs.pdf) === '1') return { statusCode: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="lien-waiver.pdf"', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }, body: L.pdf(w).toString('base64'), isBase64Encoded: true };   /* patch AUTOMONEY */
    return { statusCode: w ? 200 : 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }, body: page(w, qs.t) };
  }
  if (event.httpMethod !== 'POST') return J(405, { ok: false, error: 'POST only.' });
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) { return J(400, { ok: false, error: 'Bad request.' }); }
  const act = s(b.action);
  if (act === 'sign') { const r = await L.sign(b.t, b.name, b.title, ipOf(event), hdr(event, 'user-agent')); return J(r.status || 200, r); }
  if (act === 'upload') { const r = await L.upload(b.t, b.file, b.name, ipOf(event)); return J(r.status || 200, r); }
  const who = await A.core().gcStaffAuth(event);
  if (!who.ok) return J(who.statusCode || 401, { ok: false, error: who.error });
  let office = /office/.test(low(who.role));
  if (!office) { try { const d = await A.core().crmData(false); const u = arr(d.users).find(function(x){ return low(x.email) === low(who.email); }); office = !!(u && /office/i.test(s(u.role))); } catch (e) {} }
  const admin = low(who.role) === 'admin';
  if (act === 'list') return J(200, await L.forCrm());
  if (act === 'request') {
    const C = A.core(), data = await C.crmData(true);
    const extra = await C.kvRead(['subs', 'vendors']); Object.assign(data, { subs: extra.subs, vendors: extra.vendors });
    if (s(b.invId)) {
      const r = C.listOf(data, ['invs', 'invoices']).find(function(x){ return s(x.id) === s(b.invId); });
      if (!r) return J(404, { ok: false, error: 'That invoice is not in the cloud yet.' });
      return J(200, await L.request({ kind: 'conditional', invId: s(r.id), invNum: s(r.invNum || r.num || r.number), pid: pidOf(r), sub: s(r.sub || r.vendor), subId: s(r.subId), amount: num(r.amt != null ? r.amt : r.amount), through: r.date || r.invDate, by: who.name || who.email, again: b.again === true }, data));
    }
    if (!s(b.pid) || !(s(b.sub) || s(b.subId))) return J(400, { ok: false, error: 'Pick the job and the sub.' });
    return J(200, await L.request({ kind: b.final === false ? 'conditional' : 'final', pid: s(b.pid), sub: s(b.sub), subId: s(b.subId), amount: num(b.amount), through: b.through, by: who.name || who.email, again: b.again === true }, data));
  }
  if (act === 'toggle') {
    if (!admin && !office) return J(403, { ok: false, error: 'Only an admin or the office can change this.' });
    const kind = s(b.kind) === 'job' ? 'job' : 'sub', key = s(b.key);
    if (!key) return J(400, { ok: false, error: 'Which sub or job?' });
    const next = await L.toggle(kind, key, b.on === true, who);
    return next ? J(200, { ok: true, settings: next }) : J(502, { ok: false, error: 'Not saved — try again.' });
  }
  if (act === 'paper') {   /* patch AUTOMONEY */
    if (!admin && !office) return J(403, { ok: false, error: 'Only the office or an admin can mark a waiver received on paper.' });
    const r = await L.paper({ id: b.id, invId: b.invId, file: b.file, name: b.name }, who); return J(r.status || 200, r);
  }
  if (act === 'pdf') {
    const w = ((await L.forCrm()).waivers || []).find(function(x){ return s(x.id) === s(b.id); });
    if (!w) return J(404, { ok: false, error: 'Waiver not found.' });
    const full = (await A.core().kvListRead(L.KEY) || { list: [] }).list.find(function(x){ return s(x.id) === s(b.id); }) || w;
    return J(200, { ok: true, name: 'lien-waiver-' + s(b.id).replace(/[^A-Za-z0-9_-]/g, '_') + '.pdf', pdf: L.pdf(full).toString('base64') });
  }
  if (act === 'override') {
    if (!admin) return J(403, { ok: false, error: 'Only Wesley or Nick can close a job without its lien waivers.' });
    return J(200, { ok: await L.override(b.pid, who, b.reason) });
  }
  return J(400, { ok: false, error: 'Bad request.' });
};
