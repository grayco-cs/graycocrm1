// netlify/functions/gdrive.js
// GrayCo — 📁 GOOGLE DRIVE for big files (patch GDRIVE, owner 11/11: "not letting me put in bigger plan sets … I need it to for sure
// be able to go into the sub portal, bid portal etc … automatically if possible through Google Drive").
//
// A plan set bigger than the CRM's own file storage (50 MB) goes straight from the browser into Google Drive — a folder per job under
// one GrayCo folder — and the job keeps the Drive link (📎 Files, the sub / bid portal). The file never passes through this function:
// it only opens a resumable upload for the signed-in staff member's browser, then turns on "anyone with the link can view" so subs
// can open it.
//
// Set-up (once, by the owner; nothing secret in the code or chat):
//   1. Google Cloud console → a project → enable the "Google Drive API" → IAM → Service accounts → create one → Keys → add a JSON key.
//   2. Google Drive → a Shared drive "GrayCo Jobs" (Workspace) → Manage members → add the service account's e-mail as Content manager.
//      (A service account has no storage of its own, so the folder must be in a Shared drive.)
//   3. Netlify → Site settings → Environment variables:
//        GDRIVE_SA_JSON   = the whole JSON key file's text
//        GDRIVE_ROOT_ID   = the Shared drive's id (the last part of its URL), or a folder id inside it
//
// STAFF (CRM sign-in, gc_staff — the same check as x10.js):
//   POST {action:'status'}                                        → { ok, configured, account, root }
//   POST {action:'upload-start', pid, job, name, type, size}      → { ok, uploadUrl, folderId, folderUrl } (the browser PUTs the file there)
//   POST {action:'upload-done', fileId}                           → { ok, id, name, size, link } (link sharing on: anyone with the link can view)
//   POST {action:'folder', pid, job}                              → { ok, folderId, folderUrl }
'use strict';
const crypto = require('crypto');
function s(v){ return v == null ? '' : String(v).trim(); }
function clip(v, n){ const t = s(v); return t.length > n ? t.slice(0, n) : t; }
function reply(code, headers, obj){ return { statusCode: code, headers: headers, body: JSON.stringify(obj) }; }
const ORIGINS = ['https://crm.grayco-cs.com', 'https://graycocrm1.netlify.app'];
function cors(event){
  const h = (event && event.headers) || {}, o = s(h.origin || h.Origin).replace(/\/$/, '');
  return { 'Access-Control-Allow-Origin': ORIGINS.indexOf(o) > -1 ? o : ORIGINS[0], 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}
function originOf(event){ const h = (event && event.headers) || {}, o = s(h.origin || h.Origin).replace(/\/$/, ''); return ORIGINS.indexOf(o) > -1 ? o : ORIGINS[0]; }

/* ── the service account ── */
function account(){
  let j = null; try { j = JSON.parse(process.env.GDRIVE_SA_JSON || ''); } catch (e) { j = null; }
  if (!j || !s(j.client_email) || !s(j.private_key)) return null;
  return { email: s(j.client_email), key: String(j.private_key).replace(/\\n/g, '\n') };
}
function root(){ return s(process.env.GDRIVE_ROOT_ID).replace(/[^A-Za-z0-9_-]/g, ''); }
function configured(){ return !!(account() && root()); }
function b64u(buf){ return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }
let TOK = { v: '', exp: 0 };
async function token(){
  if (TOK.v && Date.now() < TOK.exp - 60000) return TOK.v;
  const a = account(); if (!a) throw new Error('Google Drive is not set up');
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' })), claim = b64u(JSON.stringify({ iss: a.email, scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = b64u(crypto.createSign('RSA-SHA256').update(head + '.' + claim).sign(a.key));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + sig }).toString() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Google sign-in failed (' + r.status + '): ' + clip(j.error_description || j.error || '', 120));
  TOK = { v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return TOK.v;
}
async function api(path, opt){
  opt = opt || {};
  const r = await fetch('https://www.googleapis.com/drive/v3/' + path, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' }, opt.headers || {}) }));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Drive ' + r.status + ': ' + clip((j.error && j.error.message) || '', 160));
  return j;
}
const ALL = 'supportsAllDrives=true&includeItemsFromAllDrives=true';
/* one folder per job under the GrayCo root: "<job name> · <pid>" (found again by its pid, so a renamed job keeps its folder) */
async function jobFolder(pid, job){
  pid = clip(pid, 60).replace(/[^A-Za-z0-9_-]/g, ''); if (!pid) throw new Error('No job');
  const q = encodeURIComponent("'" + root() + "' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false and appProperties has { key='gcPid' and value='" + pid + "' }");
  const f = await api('files?q=' + q + '&fields=files(id,name,webViewLink)&pageSize=5&' + ALL);
  if (f.files && f.files.length) return f.files[0];
  const name = (clip(job, 100).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Job') + ' · ' + pid;
  return api('files?fields=id,name,webViewLink&supportsAllDrives=true', { method: 'POST', body: JSON.stringify({ name: name, mimeType: 'application/vnd.google-apps.folder', parents: [root()], appProperties: { gcPid: pid } }) });
}

/* staff only (the CRM sign-in) */
async function staff(event){ try { return await require('./bid-inbox.js')._test.staffAuth(event); } catch (e) { return { ok: false, code: 401, error: 'Sign in to the CRM.' }; } }

async function action(event, body, who){
  const act = s(body.action);
  if (act === 'status') { const a = account(); return { ok: true, configured: configured(), account: a ? a.email : '', root: root() ? 'set' : '' }; }
  if (!configured()) return { ok: false, configured: false, error: 'Google Drive is not set up yet (Netlify: GDRIVE_SA_JSON and GDRIVE_ROOT_ID).' };
  if (act === 'folder') { const f = await jobFolder(body.pid, body.job); return { ok: true, folderId: f.id, folderUrl: f.webViewLink || ('https://drive.google.com/drive/folders/' + f.id) }; }
  if (act === 'upload-start') {
    const name = clip(body.name, 200).replace(/[\\/]+/g, ' ') || 'file', type = clip(body.type, 120) || 'application/octet-stream', size = Math.max(0, Math.floor(+body.size || 0));
    if (!size) return { ok: false, error: 'Empty file' };
    if (size > 5 * 1024 * 1024 * 1024) return { ok: false, error: 'Files can be up to 5 GB.' };
    const f = await jobFolder(body.pid, body.job);
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,size,webViewLink', { method: 'POST',
      headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': type, 'X-Upload-Content-Length': String(size), Origin: originOf(event) },
      body: JSON.stringify({ name: name, parents: [f.id], description: 'Uploaded from the GrayCo CRM by ' + s(who.email), appProperties: { gcPid: clip(body.pid, 60), gcBy: clip(who.email, 120) } }) });
    const url = r.headers.get('location');
    if (!r.ok || !url) { const t = await r.text().catch(() => ''); return { ok: false, error: 'Drive would not start the upload (' + r.status + '): ' + clip(t, 160) }; }
    return { ok: true, uploadUrl: url, folderId: f.id, folderUrl: f.webViewLink || ('https://drive.google.com/drive/folders/' + f.id) };
  }
  if (act === 'upload-done') {
    const id = clip(body.fileId, 120).replace(/[^A-Za-z0-9_-]/g, ''); if (!id) return { ok: false, error: 'No file' };
    try { await api('files/' + id + '/permissions?supportsAllDrives=true', { method: 'POST', body: JSON.stringify({ role: 'reader', type: 'anyone', allowFileDiscovery: false }) }); } catch (e) {}   /* subs open it from the link */
    const f = await api('files/' + id + '?fields=id,name,size,mimeType,webViewLink&supportsAllDrives=true');
    return { ok: true, id: f.id, name: f.name, size: +f.size || 0, type: f.mimeType, link: f.webViewLink };
  }
  return { ok: false, error: 'Unknown action' };
}

exports.handler = async function(event){
  event = event || {};
  const headers = Object.assign(cors(event), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, headers, { ok: false, error: 'Method not allowed' });
  let body = {}; try { body = JSON.parse(event.body || '{}') || {}; } catch (e) { return reply(400, headers, { ok: false, error: 'Bad request' }); }
  const who = await staff(event); if (!who.ok) return reply(who.code || 401, headers, { ok: false, error: who.error || 'Sign in to the CRM.' });
  try { const out = await action(event, body, who); return reply(out.ok || out.configured === false ? 200 : 400, headers, out); }
  catch (e) { return reply(502, headers, { ok: false, error: clip(e && e.message || e, 200) }); }
};
exports._test = { action, account, configured, root, jobFolder, setToken: function(v){ TOK = { v: v, exp: Date.now() + 3600e3 }; } };
