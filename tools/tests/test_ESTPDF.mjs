// test_ESTPDF.mjs [build-dir] — patch ESTPDF: the PDF that was SENT on every estimate; estimates go out FROM the CRM.
// Offline: Supabase (REST gc_kv, auth, storage) and Resend are fakes; made-up people, jobs and files only — nothing leaves
// this computer. The clock is faked for the 7 PM–7 AM hold.
//   NODE (always): send-email.js mode 'estimate' — the stored bytes are what is attached (sha256), From the job's PM's own
//   @grayco-cs.com address (Reply-To the PM), the company address + "· GrayCo" for a PM with no GrayCo e-mail; a missing or
//   wrong file BLOCKS the send ("Couldn't save the PDF to the CRM — not sent. Try again.") with nothing e-mailed; versions
//   v1 / v2 kept, the same PDF again is the same version; 10 PM → held, sentAt = the 7 AM release; mode 'estimate-record'
//   (text / Google Docs) records an upload; portal approvals that carry an estimate (proposal e-mail, portal publish) are
//   blocked without the PDF and recorded with it; the portal shows the newest sent version, an older one "(superseded)";
//   portal-sign: a mailed paper waits for the portal approval and starts the follow-ups; patch JA: weekly updates off →
//   no weekly update card, review request off → none queued, a job with no choices → as before.
//   BROWSER (with a build dir, offline harness): the mirror's Hyatt Studios job (or a made-up one), the job's Estimates tab:
//   "Not sent yet" → 📤 Send estimate (profile sheet → features → send) → the bytes stored = the bytes the e-mail call names,
//   the card's "📄 Sent PDF" opens that file, "Sent … · v1", a re-send keeps v1 + v2; a storage failure blocks the send;
//   the upload path (text); the gate (lead stage → Estimate Sent; admin override listed); the back-fill links only certain
//   matches; the Suggested row no longer offers the autosave draft; the job tab count = the Estimates screen's; the field
//   "+ New customer" flow links by CUSTALL rules; a quick job saves with no prompts; no page errors.
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { pathToFileURL } from 'url';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.resolve(path.join(HERE, '../../netlify/functions'));
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', RESEND_API_KEY: 're-test', OWNER_EMAILS: 'owner@grayco-cs.com', CRM_URL: 'https://crm.grayco-cs.com', SITE_ORIGIN: 'https://crm.grayco-cs.com' });
['CUST_QUIET_OFF', 'PORTAL_MAIL_OFF', 'PORTAL_AUTO_EMAIL', 'EST_FOLLOWUPS_OFF'].forEach(k => delete process.env[k]);
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 700) : '')); } }
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function pdfBytes(text){ return Buffer.from('%PDF-1.4\n% made-up test estimate\n1 0 obj << /T (' + text + ') >> endobj\ntrailer << >>\n%%EOF\n', 'latin1'); }

/* ── the fake clock + cloud ── */
const realNow = Date.now; let NOW = Date.parse('2026-11-02T16:00:00Z');   /* 10 AM Central */
Date.now = () => NOW;
const KV = new Map(), FILES = new Map(), MAIL = [];
let storageDown = false, tick = 0;
const stamp = () => new Date(realNow() + (++tick)).toISOString();
const J = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: { get: k => /content-type/i.test(k) ? 'application/json' : null }, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => Buffer.from(JSON.stringify(body)) });
const setKv = (k, v) => KV.set(k, { value: typeof v === 'string' ? v : JSON.stringify(v), updated_at: stamp() });
const getKv = k => { let v = (KV.get(k) || {}).value; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) {} } return v; };
const TOKENS = { 'tok-glenn': 'glenn@grayco-cs.com', 'tok-pam': 'pam@grayco-cs.com' };
const STAFF = { 'glenn@grayco-cs.com': { name: 'Demo Glenn Estimator', role: 'staff' }, 'pam@grayco-cs.com': { name: 'Demo Pam Manager', role: 'staff' } };
global.fetch = async function(url, init = {}){
  const u = new URL(url), m = (init.method || 'GET').toUpperCase();
  await new Promise(r => setImmediate(r));
  if (u.host === 'sb.test') {
    if (u.pathname === '/auth/v1/user') { const t = String((init.headers || {}).Authorization || '').replace(/^Bearer /, ''); return TOKENS[t] ? J(200, { id: 'u', email: TOKENS[t] }) : J(401, {}); }
    if (u.pathname === '/rest/v1/gc_staff') { const e = (u.searchParams.get('email') || '').replace(/^eq\./, ''); return J(200, STAFF[e] ? [Object.assign({ email: e, active: true }, STAFF[e])] : []); }
    if (u.pathname === '/rest/v1/gc_lead_inbox_kv') return J(404, { code: 'PGRST205', message: 'schema cache' });
    if (u.pathname.startsWith('/storage/v1/object/sign/')) { const b = JSON.parse(init.body || '{}'); return J(200, (b.paths || []).map(p => ({ path: p, signedURL: '/object/sign/crm-files/' + p + '?token=t' }))); }
    if (u.pathname.startsWith('/storage/v1/object/crm-files/')) {
      const p = u.pathname.split('/').pop();
      if (storageDown) return J(500, { error: 'down' });
      if (m === 'GET') { const b = FILES.get(p); return b ? { ok: true, status: 200, headers: { get: () => 'application/pdf' }, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), text: async () => '' } : J(404, { error: 'not found' }); }
      FILES.set(p, Buffer.from(init.body)); return J(200, { Key: p });
    }
    if (u.pathname === '/rest/v1/gc_kv') {
      const kq = u.searchParams.get('key') || '';
      if (m === 'GET') {
        if (kq.startsWith('in.(')) { const keys = kq.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, '')); return J(200, keys.filter(k => KV.has(k)).map(k => ({ key: k, value: KV.get(k).value, updated_at: KV.get(k).updated_at }))); }
        const key = kq.replace(/^eq\./, ''); const r = KV.get(key); return J(200, r ? [{ key, value: r.value, updated_at: r.updated_at }] : []);
      }
      const body = JSON.parse(init.body || '{}');
      if (m === 'POST') { (Array.isArray(body) ? body : [body]).forEach(b => KV.set(b.key, { value: b.value, updated_at: stamp() })); return J(201, null); }
      if (m === 'PATCH') { const key = kq.replace(/^eq\./, ''); KV.set(key, { value: body.value, updated_at: stamp() }); return J(200, [{}]); }
    }
    if (u.pathname.startsWith('/rest/v1/')) return J(m === 'GET' ? 200 : 201, m === 'GET' ? [] : null);
    return J(404, {});
  }
  if (u.host === 'api.resend.com') { MAIL.push(Object.assign({ at: NOW }, JSON.parse(init.body))); return J(200, { id: 'm' + MAIL.length }); }
  return J(404, {});
};
require(path.join(SRC, '_lib/pause.js')).install();
setKv('gc_automation_pause', { on: false });
const SE = require(path.join(SRC, 'send-email.js'));
const PORTAL = require(path.join(SRC, 'portal.js'));
const PS = require(path.join(SRC, 'portal-sign.js'));
const CR = require(path.join(SRC, 'cust-release.js'));
const EP = require(path.join(SRC, '_lib/estpdf.js'));
const CQ = require(path.join(SRC, '_lib/custquiet.js'));

/* ── a made-up world ── */
const users = [{ id: 'U1', name: 'Demo Pam Manager', email: 'pam@grayco-cs.com', role: 'Project Manager', active: true }, { id: 'U2', name: 'Demo Glenn Estimator', email: 'glenn@grayco-cs.com', role: 'Estimator', active: true },
  { id: 'U3', name: 'Demo Outside Pm', email: 'outsidepm@example.net', role: 'Project Manager', active: true }];
const projects = [
  { id: 'P1', name: 'Demo Hyatt Studios', autoPO: 'S900', client: 'Demo Customer One', clientEmail: 'cust1@example.com', address: '100 Demo Ave, Memphis, TN 38103', pm: 'Demo Pam Manager', status: 'bidding', type: 'Commercial' },
  { id: 'P2', name: 'Demo Shed', autoPO: 'S901', client: 'Demo Customer Two', clientEmail: 'cust2@example.com', address: '200 Demo Ave, Memphis, TN 38103', pm: 'Demo Outside Pm', status: 'bidding', type: 'Residential' },
  { id: 'P3', name: 'Demo No Pm', autoPO: 'S902', client: 'Demo Customer Three', clientEmail: 'cust3@example.com', address: '300 Demo Ave', status: 'bidding', type: 'Residential' },
  { id: 'P4', name: 'Demo Weekly Off', autoPO: 'S903', client: 'Demo Customer Four', clientEmail: 'cust4@example.com', address: '400 Demo Ave', pm: 'Demo Pam Manager', status: 'active', type: 'Residential', auto: { weeklyUpdates: false, reviewRequest: false, updatedAt: '2026-11-01T00:00:00Z' } },
  { id: 'P5', name: 'Demo Old Job', autoPO: 'S904', client: 'Demo Customer Five', clientEmail: 'cust5@example.com', address: '500 Demo Ave', pm: 'Demo Pam Manager', status: 'active', type: 'Residential' }
];
const estimates = [{ id: 'E1', pid: 'P1', name: 'Demo Hyatt Studios', status: 'Draft', totalCharge: 1000, createdAt: '2026-11-01T00:00:00Z' }, { id: 'E2', pid: 'P2', name: 'Demo Shed', status: 'Draft', totalCharge: 500, createdAt: '2026-11-01T00:00:00Z' },
  { id: 'E3', pid: 'P3', name: 'Demo No Pm', status: 'Draft', totalCharge: 700, createdAt: '2026-11-01T00:00:00Z' }];
setKv('users', users); setKv('projects', projects); setKv('estimates', estimates); setKv('projectDocs', []); setKv('leads', []);
function put(text){ const b = pdfBytes(text), h = sha(b); FILES.set(h + '.pdf', b); return { ref: 'sb:crm-files/' + h + '.pdf', sha256: h, name: 'Estimate — ' + text + '.pdf', bytes: b }; }
const ev = (tok, body) => ({ httpMethod: 'POST', headers: { authorization: 'Bearer ' + tok, origin: 'https://crm.grayco-cs.com' }, body: JSON.stringify(body) });
async function sendEst(tok, body){ const r = await SE.handler(ev(tok, Object.assign({ mode: 'estimate', subject: 'Your GrayCo estimate', html: '<p>Hi</p>' }, body))); return Object.assign({ __s: r.statusCode }, JSON.parse(r.body || '{}')); }
const sent = () => (getKv('gc_est_sent') || []);

console.log('— NODE: 📤 Send estimate (send-email.js mode estimate) —');
{
  const f1 = put('hyatt v1'); MAIL.length = 0;
  const r = await sendEst('tok-glenn', { estId: 'E1', pid: 'P1', to: 'cust1@example.com', pdf: { ref: f1.ref, sha256: f1.sha256, name: f1.name } });
  ok(r.ok && r.__s === 200, 'a send with the PDF in the CRM goes out', r);
  const m = MAIL[MAIL.length - 1] || {};
  ok(m.from === 'Demo Pam Manager <pam@grayco-cs.com>' && m.reply_to === 'pam@grayco-cs.com', 'From the job\'s PM\'s own @grayco-cs.com address, Reply-To the PM (sender is the estimator)', { from: m.from, reply: m.reply_to });
  ok(Array.isArray(m.bcc) && m.bcc.indexOf('pam@grayco-cs.com') >= 0 && m.bcc.indexOf('glenn@grayco-cs.com') >= 0, 'BCC the PM and the sender', m.bcc);
  const att = (m.attachments || [])[0] || {};
  ok(att.filename === f1.name && sha(Buffer.from(att.content || '', 'base64')) === f1.sha256, 'the attachment IS the stored file (sha256 of the bytes e-mailed = the stored fingerprint)');
  const e1 = sent().filter(x => x.estId === 'E1');
  ok(e1.length === 1 && e1[0].version === 1 && e1[0].status === 'sent' && e1[0].sha256 === f1.sha256 && e1[0].sentTo === 'cust1@example.com' && /^2026-11-02T16/.test(e1[0].sentAt), 'recorded: gc_est_sent v1 sent, its sha256, to, sentAt', e1);
  const log = getKv('gc_email_log') || [];
  ok(log.some(x => x.kind === 'estimate' && x.pid === 'P1' && x.estId === 'E1' && x.pdfRef === f1.ref), 'the e-mail is in the job\'s e-mail log with its PDF');
  /* the same PDF again → the same version; a new PDF → v2 */
  await sendEst('tok-glenn', { estId: 'E1', pid: 'P1', to: 'cust1@example.com', pdf: { ref: f1.ref, sha256: f1.sha256, name: f1.name } });
  const f2 = put('hyatt v2');
  const r2 = await sendEst('tok-glenn', { estId: 'E1', pid: 'P1', to: 'cust1@example.com', pdf: { ref: f2.ref, sha256: f2.sha256, name: f2.name } });
  const vv = sent().filter(x => x.estId === 'E1').map(x => x.version + ':' + x.sha256.slice(0, 6));
  ok(r2.ok && vv.length === 2 && vv[0] === '1:' + f1.sha256.slice(0, 6) && vv[1] === '2:' + f2.sha256.slice(0, 6), 're-send keeps every version (v1, v2); the same PDF again is not a new version', vv);
}
{
  MAIL.length = 0;
  const missing = { ref: 'sb:crm-files/' + 'a'.repeat(64) + '.pdf', sha256: 'a'.repeat(64), name: 'x.pdf' };
  const r = await sendEst('tok-glenn', { estId: 'E1', pid: 'P1', to: 'cust1@example.com', pdf: missing });
  ok(r.__s === 409 && r.blocked && r.error === "Couldn't save the PDF to the CRM — not sent. Try again." && MAIL.length === 0, 'PDF not in the CRM → BLOCKED with the owner\'s message, nothing e-mailed', r);
  const f = put('hyatt v3');
  const r2 = await sendEst('tok-glenn', { estId: 'E1', pid: 'P1', to: 'cust1@example.com', pdf: { ref: f.ref, sha256: 'b'.repeat(64), name: f.name } });
  ok(r2.__s === 409 && MAIL.length === 0, 'a PDF that is not the one the CRM made (fingerprint) → blocked');
  storageDown = true; const r3 = await sendEst('tok-glenn', { estId: 'E1', pid: 'P1', to: 'cust1@example.com', pdf: { ref: f.ref, sha256: f.sha256, name: f.name } }); storageDown = false;
  ok(r3.__s === 409 && MAIL.length === 0, 'file storage down → blocked, nothing e-mailed');
  const r4 = await sendEst('tok-glenn', { estId: 'E1', pid: 'P1', to: 'cust1@example.com' });
  ok(r4.__s === 409 && MAIL.length === 0, 'no PDF at all → blocked');
}
{
  MAIL.length = 0;
  const f = put('shed v1');
  const r = await sendEst('tok-glenn', { estId: 'E2', pid: 'P2', to: 'cust2@example.com', pdf: { ref: f.ref, sha256: f.sha256, name: f.name } });
  const m = MAIL[0] || {};
  ok(r.ok && m.from === 'Demo Outside Pm · GrayCo <office@grayco-cs.com>' && m.reply_to === 'outsidepm@example.net', 'a PM with no @grayco-cs.com e-mail: the company address "<PM> · GrayCo", Reply-To the PM', { from: m.from, reply: m.reply_to });
  const g = put('nopm v1');
  await sendEst('tok-glenn', { estId: 'E3', pid: 'P3', to: 'cust3@example.com', pdf: { ref: g.ref, sha256: g.sha256, name: g.name } });
  const m3 = MAIL[1] || {};
  ok(m3.from === 'Demo Glenn Estimator <glenn@grayco-cs.com>' && m3.reply_to === 'glenn@grayco-cs.com', 'no PM on the job: from the sender\'s own address', m3.from);
}
{
  /* 10 PM Central: held for 7 AM; sentAt = the release */
  MAIL.length = 0; NOW = Date.parse('2026-11-03T04:00:00Z');   /* 10 PM Central, Nov 2 */
  const f = put('hyatt night');
  const r = await sendEst('tok-glenn', { estId: 'E1', pid: 'P1', to: 'cust1@example.com', pdf: { ref: f.ref, sha256: f.sha256, name: f.name } });
  const row = sent().find(x => x.sha256 === f.sha256) || {};
  ok(r.ok && r.held && MAIL.length === 0 && row.status === 'held' && !row.sentAt && /T13:00:00/.test(r.releaseAt), '10 PM: held for 7:00 AM (CUSTQUIET), nothing e-mailed, the PDF already recorded (held)', { r: r.held, row: row.status, rel: r.releaseAt });
  NOW = Date.parse('2026-11-03T13:05:00Z');   /* 7:05 AM Central */
  const rel = await CR._t.runRelease({});
  const row2 = sent().find(x => x.sha256 === f.sha256) || {};
  ok(MAIL.length === 1 && sha(Buffer.from(MAIL[0].attachments[0].content, 'base64')) === f.sha256, 'released at 7 AM with the same file', rel && rel.queue);
  ok(row2.status === 'sent' && row2.sentAt && Date.parse(row2.sentAt) === NOW, 'sentAt = the actual release time', row2);
  NOW = Date.parse('2026-11-03T16:00:00Z');
}
{
  /* text / Google Docs: the upload is recorded (no e-mail) */
  MAIL.length = 0;
  const f = put('shed by text');
  const r = await SE.handler(ev('tok-glenn', { mode: 'estimate-record', estId: 'E2', pid: 'P2', method: 'text', sentAt: '2026-11-02', sentTo: '901-555-0100', pdf: { ref: f.ref, sha256: f.sha256, name: f.name } }));
  const j = JSON.parse(r.body); const row = sent().find(x => x.sha256 === f.sha256) || {};
  ok(r.statusCode === 200 && j.ok && row.via === 'upload' && row.method === 'text' && row.version === 2 && /^2026-11-02T12/.test(row.sentAt) && MAIL.length === 0, 'upload of a texted estimate: recorded as the next version (via upload, method text), nothing e-mailed', row);
  const bad = await SE.handler(ev('tok-glenn', { mode: 'estimate-record', estId: 'E2', pid: 'P2', method: 'gdocs', pdf: { ref: 'sb:crm-files/' + 'c'.repeat(64) + '.pdf', sha256: 'c'.repeat(64), name: 'x.pdf' } }));
  ok(bad.statusCode === 409, 'an upload whose PDF is not in the storage is refused');
}

console.log('— NODE: approvals that carry an estimate (portal.js aqSend) —');
{
  const C = PORTAL._core;
  const okPdf = put('proposal ok');
  setKv('gc_sign_requests', [{ id: 'sr_P5_estimate_E5', pid: 'P5', kind: 'estimate', refId: 'E5', docRef: 'sb:crm-files/' + 'd'.repeat(64) + '.pdf', docName: 'Proposal.pdf', status: 'pending', auto: true },
    { id: 'sr_P1_estimate_E1', pid: 'P1', kind: 'estimate', refId: 'E1', docRef: okPdf.ref, docName: 'Proposal - Demo.pdf', status: 'pending', auto: true }]);
  MAIL.length = 0;
  const blocked = await C.aqSend({ id: 'a1', kind: 'proposal_send', jobId: 'P5', to: 'cust5@example.com', subject: 'Please sign', html: '<p>x</p>', attachments: [], meta: { signRequestId: 'sr_P5_estimate_E5', fromPm: true }, approvals: [{ by: 'Demo Pam Manager' }] }, new Date().toISOString());
  ok(!blocked.ok && blocked.error === "Couldn't save the PDF to the CRM — not sent. Try again." && MAIL.length === 0, 'the proposal approval with no PDF in the storage → not sent, the owner\'s message', blocked);
  const good = await C.aqSend({ id: 'a2', kind: 'proposal_send', jobId: 'P1', to: 'cust1@example.com', subject: 'Please sign', html: '<p>x</p>', attachments: [], meta: { signRequestId: 'sr_P1_estimate_E1', fromPm: true }, approvals: [{ by: 'Demo Pam Manager', email: 'pam@grayco-cs.com' }] }, new Date().toISOString());
  const row = sent().find(x => x.sha256 === okPdf.sha256) || {};
  ok(good.ok && MAIL.length === 1 && row.via === 'proposal' && row.status === 'sent' && row.sentBy === 'Demo Pam Manager', 'with the PDF: sent and recorded (via proposal, who approved)', { good, row });
  /* portal publish of an estimate with no PDF anywhere → blocked; with its PDF → recorded */
  const pb = await C.aqSend({ id: 'a3', kind: 'portal_publish', jobId: 'P5', channel: 'portal', meta: { gateKey: 'e:E5' }, approvals: [{ by: 'x' }] }, new Date().toISOString());
  ok(!pb.ok && /Couldn't save the PDF/.test(pb.error), '"Put in the customer portal" for an estimate with no PDF → not published');
  const pg = await C.aqSend({ id: 'a4', kind: 'portal_publish', jobId: 'P3', channel: 'portal', meta: { gateKey: 'e:E3' }, approvals: [{ by: 'Demo Pam Manager' }] }, new Date().toISOString());
  const r3 = sent().filter(x => x.estId === 'E3');
  ok(pg.ok && r3.length === 1 && (r3[0].channels || []).indexOf('portal') >= 0 && r3[0].portalAt, 'publishing the e-mailed PDF to the portal is the same version (channel portal added)', r3);
}

console.log('— NODE: the portal shows the newest sent version; older ones "(superseded)" —');
{
  const C = PORTAL._core;
  const v1 = put('portal v1'), v2 = put('portal v2');
  const data = { projects: [{ id: 'P1', name: 'Demo Hyatt Studios', client: 'Demo Customer One', status: 'bidding', type: 'Commercial', address: '100 Demo Ave' }], users,
    estimates: [{ id: 'E1', pid: 'P1', name: 'Demo Hyatt Studios', status: 'Sent', portalShare: true, createdAt: '2026-11-01', sentPdf: { ref: v2.ref, version: 2 } }],
    projectDocs: [
      { id: 'D1', pid: 'P1', estimateId: 'E1', name: 'Estimate — Demo — sent 2026-11-01.pdf', ref: v1.ref, type: 'application/pdf', sentPdf: true, version: 1, supersededBy: 'D2', portalShare: true, uploadedAt: '2026-11-01T10:00:00Z' },
      { id: 'D2', pid: 'P1', estimateId: 'E1', name: 'Estimate — Demo — sent 2026-11-02.pdf', ref: v2.ref, type: 'application/pdf', sentPdf: true, version: 2, portalShare: true, uploadedAt: '2026-11-02T10:00:00Z' }] };
  setKv('gc_portal_gate', [{ id: '_meta', since: '2026-10-24T00:00:00Z', gf: {} }, { id: 'e:E1', pid: 'P1', st: 'approved' }]);
  const view = await C.buildView(data, data.projects[0], { noGateQueue: true });
  const docs = (view && view.docs) || [];
  const prop = docs.find(d => d.kind === 'proposal'), sup = docs.find(d => /superseded/.test(d.title || ''));
  ok(prop && /v2|sent/.test(prop.url || '') !== null && prop.url && prop.url.indexOf(v2.sha256) >= 0, 'the portal\'s proposal is the newest sent PDF (v2)', prop);
  ok(sup && sup.url.indexOf(v1.sha256) >= 0 && /\(superseded\)/.test(sup.title), 'v1 stays in the portal, marked "(superseded)"', docs.map(d => d.title));
  ok(!JSON.stringify(view).match(/state\s*farm/i), 'no carrier name in the portal view');
}

console.log('— NODE: the portal\'s Estimate card (same estimate data; nothing internal) —');
{
  const C = PORTAL._core;
  const v1 = put('card v1');
  const est = { id: 'E7', pid: 'P1', name: 'Demo Kitchen (State Farm claim)', num: '77', status: 'Sent', portalShare: true, createdAt: '2026-11-01', sentDate: '2026-11-02', totalCharge: 15000, totalCost: 9000, margin: 40,
    notes: 'INTERNAL do not show', sentPdf: { ref: v1.ref, version: 1 },
    lines: [{ cat: 'Cabinets', desc: 'Shaker', charge: 9000, cost: 5000, vendor: 'Demo Supplier' }, { cat: 'Counters', desc: 'Quartz', charge: 6000, cost: 4000, sub: 'Demo Sub LLC' }] };
  const data = { projects: [{ id: 'P1', name: 'Demo Kitchen', client: 'Demo Customer One', status: 'bidding', type: 'Residential', address: '100 Demo Ave' }], users, estimates: [est],
    projectDocs: [{ id: 'D7', pid: 'P1', estimateId: 'E7', name: 'Estimate — Demo — sent.pdf', ref: v1.ref, type: 'application/pdf', sentPdf: true, version: 1, portalShare: true, uploadedAt: '2026-11-02T10:00:00Z' }] };
  setKv('gc_portal_gate', [{ id: '_meta', since: '2026-10-24T00:00:00Z', gf: {} }, { id: 'e:E7', pid: 'P1', st: 'approved' }]);
  setKv('gc_sign_requests', [{ id: 'sr_P1_estimate_E7', pid: 'P1', kind: 'estimate', refId: 'E7', status: 'pending', mailed: true, gateKey: 'e:E7', docRef: v1.ref, createdAt: '2026-11-02T10:00:00Z' }]);
  setKv('gc_est_views', []);
  const card0 = ((NOW += 20000, await C.buildView(data, data.projects[0], { noGateQueue: true })).estimates || [])[0] || {};
  ok(card0.total === 15000 && card0.num === '77' && card0.scope.length === 2 && card0.scope[0].label === 'Cabinets' && card0.scope[0].amount === 9000 && card0.pdf.indexOf(v1.sha256) >= 0 && card0.signId === 'sr_P1_estimate_E7', 'the card: total, the sections at their sell amounts, View PDF = the sent file, the e-sign paper', card0);
  ok(card0.status === 'Sent', 'status: Sent');
  const js = JSON.stringify(card0);
  ok(!/9000.*cost|totalCost|margin|INTERNAL|Demo Sub|Demo Supplier|state\s*farm/i.test(js) && /your insurance company/.test(card0.title), 'nothing internal on the card (no costs, margins, notes, sub / vendor names, carrier name)', js);
  await C.estViewed(data.projects[0], 'E7');
  const card1 = ((NOW += 20000, await C.buildView(data, data.projects[0], { noGateQueue: true })).estimates || [])[0] || {};
  ok(card1.status === 'Viewed' && card1.viewedAt, 'the customer opened the PDF → Viewed', card1.status);
  setKv('gc_sign_requests', [{ id: 'sr_P1_estimate_E7', pid: 'P1', kind: 'estimate', refId: 'E7', status: 'signed', signed: { at: '2026-11-03T15:00:00Z', name: 'Demo' }, createdAt: '2026-11-02T10:00:00Z', updatedAt: '2026-11-03T15:00:00Z' }]);
  const card2 = ((NOW += 20000, await C.buildView(data, data.projects[0], { noGateQueue: true })).estimates || [])[0] || {};
  ok(card2.status === 'Accepted' && card2.signedAt === '2026-11-03' && !card2.signId, 'signed in the portal → Accepted', card2);
  setKv('gc_sign_requests', [{ id: 'sr_P1_estimate_E7', pid: 'P1', kind: 'estimate', refId: 'E7', status: 'declined', createdAt: '2026-11-02T10:00:00Z' }]);
  const card3 = ((NOW += 20000, await C.buildView(data, data.projects[0], { noGateQueue: true })).estimates || [])[0] || {};
  ok(card3.status === 'Declined', 'declined → Declined');
  setKv('gc_portal_gate', [{ id: '_meta', since: '2026-10-24T00:00:00Z', gf: {} }]);
  NOW += 20000; const card4 = (await C.buildView(data, data.projects[0], { noGateQueue: true })).estimates || [];
  ok(card4.length === 0, 'before "Put in the customer portal" is approved: no card');
}
{
  /* the index.html bundle: the Templates grid is gone, the generator is reused */
  const IDX = path.resolve(path.join(HERE, '../../index.html'));
  if (fs.existsSync(IDX)) {
    const T = fs.readFileSync(IDX, 'utf8');
    ok(T.indexOf('No active/bidding projects — launch a job first') < 0 && T.indexOf('data-gcep-p5note') > 0, 'Templates: the per-job "Generate" grid is replaced by the note (make it from the Estimates tab / 📤 Send estimate)');
    ok(T.indexOf('window._gcProposal5={data:') > 0 && T.indexOf('window.__gcP5Only') > 0, 'the 5-page Customer Proposal Generator is reused (its data + HTML builders exposed), not rebuilt');
  }
}

console.log('— NODE: portal-sign — the e-mailed paper (mailed) waits for the portal approval; follow-ups start —');
{
  setKv('gc_sign_requests', []); setKv('gc_approval_queue', []);
  const f = put('sign paper');
  const req = await PS.handler(ev('tok-glenn', { action: 'request', projectId: 'P1', kind: 'estimate', refId: 'E1', title: 'Estimate — Demo Hyatt Studios', amount: 1000, docRef: f.ref, docName: f.name, mailed: true, again: true, sentAt: '2026-11-02T16:00:00.000Z', sentVia: 'crm-email' }));
  const rj = JSON.parse(req.body || '{}'), list = getKv('gc_sign_requests') || [], r = list[0] || {};
  ok(rj.ok && rj.mailed && r.mailed === true && r.gateKey === 'e:E1' && r.sentAt === '2026-11-02T16:00:00.000Z' && !(getKv('gc_approval_queue') || []).length, 'a mailed paper: kept, no second "please sign" e-mail queued', { rj, r });
  const G0 = { ok: true, map: {}, gf: {} }, aq0 = []; aq0.__gate = G0;
  const G1 = { ok: true, map: { 'e:E1': { st: 'approved' } }, gf: {} }, aq1 = []; aq1.__gate = G1;
  ok(PS._ps.visible(r, aq0) === false && PS._ps.visible(r, aq1) === true, 'in the customer\'s portal only once "Put in the customer portal" is approved');
  const f2 = put('sign paper v2');
  await PS.handler(ev('tok-glenn', { action: 'request', projectId: 'P1', kind: 'estimate', refId: 'E1', title: 'Estimate — Demo Hyatt Studios', amount: 1000, docRef: f2.ref, docName: f2.name, mailed: true, again: true }));
  const r2 = (getKv('gc_sign_requests') || [])[0] || {};
  ok(r2.docRef === f2.ref && (r2.supersededRefs || []).indexOf(f.ref) >= 0, 'a re-send replaces the paper\'s file (the old one kept as superseded)', r2);
  NOW = Date.parse('2026-11-05T15:00:00Z');
  setKv('projects', projects.map(p => p.id === 'P1' ? Object.assign({}, p, { status: 'bidding' }) : p));
  const fu = await PS._ps.runFollowups({ now: NOW });
  const aq = getKv('gc_approval_queue') || [];
  ok(aq.some(x => x.kind === 'estimate_followup' && x.jobId === 'P1'), 'the estimate follow-ups start from the CRM send (nudge 1 queued for approval)', { fu, kinds: aq.map(x => x.kind) });
  NOW = Date.parse('2026-11-03T16:00:00Z');
}

console.log('— NODE: customer features (patch JA switches) are respected —');
{
  const C = PORTAL._core; setKv('gc_approval_queue', []);
  await C.queueApproval({ id: 'w1', kind: 'weekly_update', pid: 'P4', jobName: 'x', to: 'cust4@example.com', subject: 's', html: '<p>x</p>' });
  await C.queueApproval({ id: 'r1', kind: 'review_request', pid: 'P4', jobName: 'x', to: 'cust4@example.com', subject: 's', html: '<p>x</p>' });
  await C.queueApproval({ id: 'w2', kind: 'weekly_update', pid: 'P5', jobName: 'x', to: 'cust5@example.com', subject: 's', html: '<p>x</p>' });
  await C.queueApproval({ id: 'r2', kind: 'review_request', pid: 'P5', jobName: 'x', to: 'cust5@example.com', subject: 's', html: '<p>x</p>' });
  const ids = (getKv('gc_approval_queue') || []).map(x => x.id).sort();
  ok(ids.indexOf('w1') < 0 && ids.indexOf('r1') < 0, 'weekly updates off → no weekly update card; review request off → none queued', ids);
  ok(ids.indexOf('w2') >= 0 && ids.indexOf('r2') >= 0, 'a job with no choices keeps its current behaviour (both queued)', ids);
  const JA = require(path.join(SRC, '_lib/job-auto.js'));
  ok(JA.builtin('residential').weeklyUpdates === true && JA.builtin('commercial').weeklyUpdates === true && JA.KIND_KEY.weekly_update === 'weeklyUpdates', 'weeklyUpdates defaults ON for every job type (nothing silently off)');
}
Date.now = realNow;
console.log('NODE: ' + pass + ' passed, ' + fail + ' failed');

/* ════════════════ BROWSER ════════════════ */
const build = process.argv[2];
if (build) await browser(build);
console.log('\nESTPDF: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

async function portalPart(SHOTS){
  const { execFileSync } = await import('child_process');
  const ROOT = path.resolve(path.join(HERE, '../..'));
  const run = (root, fns, out) => { try { return execFileSync('node', [path.join(HERE, 'estpdf_portal_shots.mjs'), root, fns, out], { encoding: 'utf8', env: Object.assign({}, process.env), timeout: 240000 }); } catch (e) { return String(e.stdout || '') + String(e.stderr || ''); } };
  const parse = txt => String(txt).split('\n').filter(l => /^\{/.test(l)).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  const BASE = process.env.GC_BASE_ROOT;
  if (BASE && fs.existsSync(path.join(BASE, 'portal.html'))) { parse(run(BASE, path.join(BASE, 'netlify/functions'), path.join(SHOTS, 'portal_before'))); console.log('    portal "before" shots: ' + SHOTS + '/portal_before_*.png'); }
  const after = parse(run(ROOT, path.join(ROOT, 'netlify/functions'), path.join(SHOTS, 'portal_after')));
  const w390 = after.find(x => x.width === 390), w1280 = after.find(x => x.width === 1280), tail = after.find(x => x.errs) || {};
  ok(w390 && /Estimate #1042/.test(w390.info.card) && /\$48,250\.00/.test(w390.info.card) && /Cabinets\$19,500\.00/.test(w390.info.card) && /View PDF/.test(w390.info.card) && /Accept & sign/.test(w390.info.card) && /Ask a question/.test(w390.info.card), 'portal (390 wide): the Estimate card — number, total, scope, 📄 View PDF, ✅ Accept & sign, 💬 Ask a question', w390 && w390.info.card);
  ok(w1280 && /Sent/.test(w1280.info.card) && !/33,100|31\.4|INTERNAL|Demo Sub|Demo Supplier/.test(w1280.info.card), 'portal (1280 wide): status Sent; nothing internal (cost, margin, notes, sub / supplier)', w1280 && w1280.info.card);
  ok(w1280 && /^About estimate #1042/.test(w1280.info.ask || ''), '💬 Ask a question opens Messages with the estimate named', w1280 && w1280.info.ask);
  ok((tail.calls || []).indexOf('portal:est-viewed') >= 0, '📄 View PDF tells GrayCo it was viewed (portal est-viewed)', tail.calls);
  ok(w390 && !w390.info.docs.some(d => /Demo Kitchen Remodel.*Proposal/.test(d)), 'the Documents tab does not list the same estimate twice', w390 && w390.info.docs);
  ok(!(tail.errs || []).length, 'portal: no page errors', tail.errs);
}
async function browser(build){
  const SPD = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
  const HARNESS = process.env.GC_HARNESS || SPD + '/wN/harness_N.mjs';
  const MIRROR = process.env.GC_MIRROR || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/loop/mirror.json';
  const SHOT = process.env.GC_SHOT || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/estpdf_after.png';
  const JSPDF = process.env.GC_JSPDF || SPD + '/wOPC/package/dist/jspdf.umd.min.js';
  const H = await import(pathToFileURL(HARNESS).href);
  const { computer, sleep, waitFor, cset, cget, signIn, cloud } = H;
  console.log('\n— BROWSER (offline harness, the mirror) —');
  cloud.clear();
  const mirror = fs.existsSync(MIRROR) ? JSON.parse(fs.readFileSync(MIRROR, 'utf8')) : [];
  for (const r of mirror) cset(r.key, r.v);
  const hasHyatt = !!cget('projects') && JSON.stringify(cget('projects')).indexOf('PRJMVPQN1E2FG') >= 0;
  if (!hasHyatt) console.log('  (mirror not found — made-up data)');
  /* a made-up job / lead / estimate for the send (never a real customer address) */
  const iso = new Date().toISOString(), day = iso.slice(0, 10);
  const addTo = (k, recs) => { let v = cget(k); if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } cset(k, (Array.isArray(v) ? v : []).concat(recs)); };
  addTo('projects', [{ id: 'PRJTEST1', name: 'Demo Studio Test', autoPO: 'T990', client: 'Demo Pat Tester', clientEmail: '', address: '1 Test Way, Memphis, TN 38103', pm: 'Wesley Johnson', status: 'bidding', type: 'Commercial', created: day, createdAt: iso, savedAt: iso, updatedAt: iso },
    { id: 'PRJTEST2', name: 'Demo Lead Gate Job', autoPO: 'T991', client: 'Demo Gate Person', clientEmail: 'gate@example.com', clientPhone: '901-555-0111', address: '2 Test Way, Memphis, TN 38103', status: 'bidding', type: 'Residential', created: day, createdAt: iso, savedAt: iso, updatedAt: iso }]);
  addTo('estimates', [{ id: 'ESTTEST1', pid: 'PRJTEST1', name: 'Demo Studio Test', status: 'Draft', date: day, createdAt: iso, savedAt: iso, updatedAt: iso, totalCharge: 12345.67, notes: 'INTERNAL: margin is thin — do not show', client: 'Demo Pat Tester',
      lines: [{ id: 'l1', desc: 'Roof tear-off per State Farm scope', qty: 10, cost: 100, type: 'labor', cat: 'Roofing', charge: 1500 }, { id: 'l2', desc: 'Shingles', qty: 30, cost: 90, type: 'material', cat: 'Roofing', charge: 10845.67 }] },
    { id: 'ESTTEST2', pid: 'PRJTEST2', leadId: 'LTEST2', name: 'Demo Lead Gate Job', status: 'Draft', date: day, createdAt: iso, savedAt: iso, updatedAt: iso, totalCharge: 900, lines: [{ id: 'l1', desc: 'Gutters', qty: 1, cost: 600, type: 'labor', cat: 'Gutters', charge: 900 }] }]);
  addTo('leads', [{ id: 'LTEST2', name: 'Demo Gate Person', phone: '901-555-0111', email: 'gate@example.com', address: '2 Test Way, Memphis, TN 38103', stage: 'Contacted', projectId: 'PRJTEST2', status: 'new', created: day, createdAt: iso, savedAt: iso, updatedAt: iso }]);
  const old = new Date(Date.now() - 3600e3).toISOString(); for (const [k, r] of cloud) cloud.set(k, Object.assign({}, r, { updated_at: old }));

  const C = await computer('owner', { build });
  const STORE = new Map(), FN = []; let storageFail = false;
  await C.ctx.route(u => /\/storage\/v1\/object\//.test(new URL(u).pathname), async r => {
    const req = r.request(), u = new URL(req.url()), m = req.method(), p = u.pathname.split('/').pop();
    const hd = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: hd });
    if (m === 'POST') { if (storageFail) return r.fulfill({ status: 500, headers: hd, contentType: 'application/json', body: '{"error":"storage down"}' }); const b = req.postDataBuffer(); STORE.set(p, b); return r.fulfill({ status: 200, headers: hd, contentType: 'application/json', body: JSON.stringify({ Key: 'crm-files/' + p }) }); }
    const b = STORE.get(p); return b ? r.fulfill({ status: 200, headers: hd, contentType: 'application/pdf', body: b }) : r.fulfill({ status: 404, headers: hd, contentType: 'application/json', body: '{"error":"not found"}' });
  });
  await C.ctx.route(u => new URL(u).pathname.startsWith('/.netlify/functions/'), async r => {
    const req = r.request(), fn = new URL(req.url()).pathname.split('/').pop(); let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
    FN.push({ fn, body });
    let out = {};
    if (fn === 'send-email' && body.mode === 'estimate') { const ref = body.pdf && body.pdf.ref, p = String(ref || '').replace('sb:crm-files/', ''); const b = STORE.get(p);
      out = b && crypto.createHash('sha256').update(b).digest('hex') === body.pdf.sha256 ? { ok: true, id: 'm1', from: 'Wesley Johnson <wjohnson@grayco-cs.com>', held: false, sent: { id: 'es_' + FN.length, version: FN.filter(x => x.fn === 'send-email' && x.body.mode === 'estimate' && x.body.estId === body.estId).length } } : { ok: false, blocked: true, error: "Couldn't save the PDF to the CRM — not sent. Try again." }; }
    else if (fn === 'send-email' && body.mode === 'estimate-record') out = { ok: true, sent: { id: 'up_' + FN.length } };
    else if (fn === 'portal-sign') out = { ok: true, id: 'sr1', mailed: true };
    else if (fn === 'portal') out = { ok: true, queued: 1 };
    return r.fulfill({ status: out.blocked ? 409 : 200, contentType: 'application/json', body: JSON.stringify(out) });
  });
  const H2P = process.env.GC_HTML2PDF || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/vendor/html2pdf.bundle.min.js';
  let allowH2P = false;
  await C.ctx.route(u => /html2pdf/.test(u), r => allowH2P && fs.existsSync(H2P) ? r.fulfill({ path: H2P, contentType: 'text/javascript' }) : r.abort('blockedbyclient'));
  await C.ctx.route(u => /jspdf\.umd\.min\.js/.test(u), r => r.fulfill({ path: JSPDF, contentType: 'text/javascript' }));
  const p = C.page(); await p.setViewportSize({ width: 1400, height: 900 });
  await signIn(C, 'wjohnson@grayco-cs.com', 9000);
  await waitFor(C, () => !!(window._gcEstPdf && window._crm && (window._crm.projects || []).length > 3), null, 90000);
  ok(await p.evaluate(() => !!window._gcEstPdf && !!window.__GC_PATCH_ESTPDF__), 'patch ESTPDF is on the page');
  /* the estimates list is in (it comes after the jobs) */
  await waitFor(C, () => window._gcEST3 && window._gcEST3.list().length > 3, null, 90000);

  /* ── the mirror: one list per job, the Suggested row, the back-fill ── */
  if (hasHyatt) {
    const r = await p.evaluate(() => {
      const jf = window._gcJobFill, job = (window._crm.projects || []).find(x => x.id === 'PRJMVPQN1E2FG');
      const sug = jf ? jf.suggest(job, 'estimates').map(x => x.item.id) : null;
      const list = window._gcEstJobList('PRJMVPQN1E2FG', []).map(e => e.id);
      return { sug, list };
    });
    ok(r.sug && r.sug.indexOf('draft_mvpndwmcwt3') < 0, 'Hyatt Studios: the autosave draft is no longer a "Suggested — link?" estimate', r);
    ok(r.list.length === 1 && r.list[0] === 'mvpngqx4tzo', 'Hyatt Studios: one estimate on the job tab', r.list);
    /* every job: the job tab's list = the Estimates screen's rows for that job; and what the old rule showed */
    const cmp = await p.evaluate(() => {
      const all = window._gcEST3.list(), by = {}; all.forEach(e => { if (e.pid) (by[e.pid] = by[e.pid] || []).push(e.id); });
      const st = window._gcEstimatesState || window._crm.estimates || [];
      const out = { jobs: 0, mismatchNew: [], mismatchOld: [] };
      (window._crm.projects || []).forEach(pj => {
        const tab = window._gcEstJobList(pj.id, st).length, screen = window._gcEST3.byJob(pj.id).length;
        const oldTab = st.filter(G => G && G.pid === pj.id).length;
        if (!tab && !screen && !oldTab) return; out.jobs++;
        if (tab !== screen) out.mismatchNew.push(pj.autoPO + ' ' + tab + '≠' + screen);
        if (oldTab !== screen) out.mismatchOld.push((pj.autoPO || pj.id) + ' ' + (pj.name || '').slice(0, 30) + ': job tab ' + oldTab + ' vs list ' + screen);
      });
      return out;
    });
    ok(cmp.mismatchNew.length === 0, 'every job in the mirror: the job tab count = the Estimates screen count (' + cmp.jobs + ' jobs)', cmp.mismatchNew);
    console.log('    (before this patch the job tab and the list disagreed on ' + cmp.mismatchOld.length + ' job(s)' + (cmp.mismatchOld.length ? ': ' + cmp.mismatchOld.slice(0, 12).join(' | ') : '') + ')');
    /* the back-fill: dry run on the mirror */
    const bf = await p.evaluate(() => window._gcEstPdf.backfill({ apply: false }).then(pl => ({ linked: pl.linked, none: pl.none, already: pl.already, rows: pl.rows.map(r => ({ id: r.estId, name: r.name, st: r.status, l: r.linked, how: (r.matches || []).map(m => m.how) })) })));
    console.log('    back-fill on the mirror: ' + bf.linked + ' linked, ' + bf.none + ' no copy on file — ' + JSON.stringify(bf.rows).slice(0, 1500));
    const hy = bf.rows.find(r => r.id === 'mvpngqx4tzo'), sr = bf.rows.find(r => r.id === 'mvpeq88chfk');
    ok(hy && hy.l === 'linked', 'back-fill: Hyatt Studios → its proposal PDF (DPROP_mvpngqx4tzo, same estimate id) is linked', hy);
    ok(sr && sr.l === 'none', 'back-fill: an HTML-only proposal (Studio Res) is NOT turned into a "sent PDF" → "no copy on file"', sr);
    ok(bf.rows.every(r => r.l !== 'linked' || r.how.every(h => /same estimate id|e-sign paper|same name and date|e-mail log/.test(h))), 'back-fill links only certain matches (same id, or name + date ±1 day)');
    await p.evaluate(() => window._gcEstPdf.backfill({ apply: true }));
    await sleep(800);
  }

  /* ── the job's Estimates tab, a never-sent estimate ── */
  const openJob = async pid => {
    await p.evaluate(pid => { const j = (window._crm.projects || []).find(x => x.id === pid); try { sessionStorage.setItem('grayco_subtab', 'projestimates'); } catch (e) {} if (window._navToJob) window._navToJob(pid); else if (window._openJobDetail) window._openJobDetail(j); }, pid);
    await sleep(1500);
    await p.evaluate(() => { const b = [...document.querySelectorAll('button,div')].find(x => x.offsetParent && /^📝 Estimates \(/.test((x.textContent || '').trim())); if (b) b.click(); });
    return waitFor(C, () => document.querySelectorAll('.gcep-slot').length > 0, null, 20000);
  };
  const slotTxt = id => p.evaluate(id => { const s = document.querySelector('.gcep-slot[data-est="' + id + '"]'); return s ? s.textContent : null; }, id);
  await openJob('PRJTEST1');
  ok(/Not sent yet/.test(await slotTxt('ESTTEST1') || ''), 'a never-sent estimate shows "Not sent yet" (+ 📤 Send estimate, ✏ Open estimate)', await slotTxt('ESTTEST1'));
  if (hasHyatt) { await openJob('PRJMVPQN1E2FG'); const t = await slotTxt('mvpngqx4tzo'); ok(/📄 Sent PDF/.test(t || '') && /On file/.test(t || ''), 'Hyatt Studios card: 📄 Sent PDF (the back-filled proposal PDF)', t);
    await p.setViewportSize({ width: 1400, height: 900 }); await sleep(500);
    await p.evaluate(() => { const s = document.querySelector('.gcep-slot[data-est="mvpngqx4tzo"]'); const b = [...document.querySelectorAll('b')].find(x => /^Estimates for this job/.test(x.textContent || '')); (b || s).scrollIntoView({ block: 'start' }); window.scrollBy(0, -140); });
    await sleep(600);
    await p.screenshot({ path: SHOT }); console.log('    screenshot: ' + SHOT);
    await openJob('PRJTEST1'); }

  /* ── 📤 Send estimate: profile sheet (missing e-mail …) → features → send ── */
  await p.evaluate(() => { const b = document.querySelector('.gcep-slot[data-est="ESTTEST1"] [data-ep="send"]'); b.click(); });
  const prof = await waitFor(C, () => !!document.getElementById('gc-estpdf-prof'), null, 8000);
  const fields = await p.evaluate(() => [...document.querySelectorAll('#gc-estpdf-prof [data-f]')].map(i => i.getAttribute('data-f') + ':' + i.type));
  ok(prof && fields.indexOf('email:email') >= 0 && fields.indexOf('phone:tel') >= 0 && fields.indexOf('name:text') < 0, 'Finish customer profile: only the missing fields, the right keyboards (tel / email)', fields);
  await p.evaluate(() => { const box = document.getElementById('gc-estpdf-prof'); box.querySelector('[data-save]').click(); });
  ok(await p.evaluate(() => /mobile|e-mail|billing|contact/i.test((document.querySelector('#gc-estpdf-prof [data-m]') || {}).textContent || '')), 'Save without the fields → it says what is missing (nothing sent)');
  await p.evaluate(() => { const box = document.getElementById('gc-estpdf-prof'); const f = (k, v) => { const i = box.querySelector('[data-f="' + k + '"]'); if (i) { i.value = v; } };
    f('phone', '901-555-0123'); f('email', 'pat.tester@example.com'); const same = box.querySelector('[data-f="same"]'); if (same) { same.checked = true; same.dispatchEvent(new Event('change')); } f('prefer', 'email'); box.querySelector('[data-save]').click(); });
  const dlg = await waitFor(C, () => !!document.getElementById('gc-estpdf-send'), null, 8000);
  const feats = await p.evaluate(() => [...document.querySelectorAll('#gc-estpdf-send .fi')].map(x => x.getAttribute('data-fk') + ':' + x.getAttribute('data-on')));
  ok(dlg && feats.length >= 10 && feats.indexOf('reviewRequest:0') >= 0 && feats.indexOf('portalLink:1') >= 0, 'Customer features: the job type\'s defaults pre-ticked (commercial: review request off, portal on)', feats);
  /* ✕ a default (weekly updates) for this job */
  await p.evaluate(() => { const it = document.querySelector('#gc-estpdf-send .fi[data-fk="weeklyUpdates"] .x'); if (it) it.click(); });
  const sends0 = FN.filter(x => x.fn === 'send-email').length;
  await p.evaluate(() => document.querySelector('#gc-estpdf-send [data-send]').click());
  await waitFor(C, () => /Sent to|7:00 AM|Not sent|Couldn/.test((document.querySelector('#gc-estpdf-send [data-m]') || {}).textContent || ''), null, 30000);
  const call1 = FN.filter(x => x.fn === 'send-email' && x.body.mode === 'estimate').slice(-1)[0];
  const stored = call1 ? STORE.get(String(call1.body.pdf.ref).replace('sb:crm-files/', '')) : null;
  ok(call1 && stored && crypto.createHash('sha256').update(stored).digest('hex') === call1.body.pdf.sha256 && stored.slice(0, 5).toString() === '%PDF-', 'send: the PDF was stored FIRST and the e-mail call names exactly those bytes (sha256)', call1 && call1.body.pdf);
  ok(call1 && FN.indexOf(call1) > -1 && sends0 < FN.filter(x => x.fn === 'send-email').length, 'the e-mail goes through send-email.js mode estimate');
  const pdfText = stored ? stored.toString('latin1') : '';
  ok(stored && !/State\s*Farm/i.test(pdfText) && !/INTERNAL: margin/i.test(pdfText), 'the customer copy has no carrier name and no internal notes', pdfText.slice(0, 120));
  await sleep(1500);
  const est1 = await p.evaluate(() => { const e = window._gcEstPdf.versions((window._gcEstimatesState || window._crm.estimates || []).find(x => x.id === 'ESTTEST1') || { id: 'ESTTEST1' }); const j = (window._crm.projects || []).find(x => x.id === 'PRJTEST1') || {};
    const d = (window._gcProjectDocs || window._crm.projectDocs || []).filter(x => x.estimateId === 'ESTTEST1'); return { v: e.map(x => x.version + ':' + x.status + ':' + x.sha256.slice(0, 8)), doc: d.map(x => x.name + '|' + x.ref), feat: j.features, auto: j.auto && j.auto.weeklyUpdates, sentAt: j.proposalSentAt }; });
  ok(est1.v.length === 1 && /^1:sent:/.test(est1.v[0]) && call1 && est1.v[0].slice(7) === call1.body.pdf.sha256.slice(0, 8), 'estimate.sentPdfs v1 (its sha256)', est1.v);
  ok(est1.doc.some(x => /^Estimate — Demo Studio Test — sent \d{4}-\d\d-\d\d\.pdf\|sb:crm-files\//.test(x)), 'the job\'s Files & Docs: "Estimate — <name> — sent <date>.pdf"', est1.doc);
  ok(est1.feat && est1.feat.weeklyUpdates === false && est1.auto === false && est1.feat.portalLink === true, 'unticking a default (weekly updates) sticks on the job (job.features + job.auto)', est1.feat);
  ok(!!est1.sentAt, 'the job\'s proposalSentAt is set (the estimate follow-ups start from it)');
  ok(FN.some(x => x.fn === 'portal-sign' && x.body.mailed === true && x.body.docRef === call1.body.pdf.ref) && FN.some(x => x.fn === 'portal' && x.body.action === 'gate'), 'the same file goes to the portal (portal-sign mailed paper + the portal approval scan)');
  /* the card opens the sent PDF */
  await p.evaluate(() => { const o = document.getElementById('gc-estpdf-send'); if (o) o.remove(); });
  await sleep(4500);
  ok(/📄 Sent PDF/.test(await slotTxt('ESTTEST1') || '') && /Sent .* · v1/.test(await slotTxt('ESTTEST1') || ''), 'the card: 📄 Sent PDF · "Sent <date> to … · v1"', await slotTxt('ESTTEST1'));
  await p.evaluate(() => document.querySelector('.gcep-slot[data-est="ESTTEST1"] [data-ep="pdf"]').click());
  await waitFor(C, () => document.getElementById('gc-estpdf-view') && document.getElementById('gc-estpdf-view').getAttribute('data-ready') === '1', null, 10000);
  const viewed = await p.evaluate(async () => { const f = document.querySelector('#gc-estpdf-view [data-fr]'); if (!f || !f.src) return null; const b = await (await fetch(f.src)).arrayBuffer(); const h = await crypto.subtle.digest('SHA-256', b); return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join(''); });
  ok(viewed && call1 && viewed === call1.body.pdf.sha256, '📄 Sent PDF opens the exact sent file (same sha256)', viewed);
  await p.evaluate(() => { const v = document.getElementById('gc-estpdf-view'); if (v) v.remove(); });

  /* a re-send keeps v1 and adds v2 */
  await p.evaluate(() => { window._gcEstPdf._S.busy = false; const e = (window._gcEstimatesState || window._crm.estimates).find(x => x.id === 'ESTTEST1'); });
  await p.evaluate(() => window._gcEstPdf.openSend('ESTTEST1'));
  await waitFor(C, () => !!document.getElementById('gc-estpdf-send'), null, 8000);
  await p.evaluate(() => { document.querySelector('#gc-estpdf-send [data-body]').value += '\n\nUpdated: v2.'; });
  /* a changed estimate → a different PDF */
  await p.evaluate(() => { const set = window._gcSetEstimates; set(prev => prev.map(x => x.id === 'ESTTEST1' ? Object.assign({}, x, { totalCharge: 13000, updatedAt: new Date().toISOString() }) : x)); });
  await sleep(300);
  await p.evaluate(() => document.querySelector('#gc-estpdf-send [data-send]').click());
  await waitFor(C, () => /Sent to|Not sent/.test((document.querySelector('#gc-estpdf-send [data-m]') || {}).textContent || ''), null, 30000);
  await sleep(1200);
  const vers = await p.evaluate(() => window._gcEstPdf.versions((window._gcEstimatesState || window._crm.estimates).find(x => x.id === 'ESTTEST1')).map(x => x.version + ':' + x.status));
  const supd = await p.evaluate(() => (window._gcProjectDocs || window._crm.projectDocs || []).filter(x => x.estimateId === 'ESTTEST1').map(x => x.version + ':' + (x.supersededBy ? 'superseded' : 'current')));
  ok(vers.length === 2 && vers[0] === '1:sent' && vers[1] === '2:sent' && supd.indexOf('1:superseded') >= 0 && supd.indexOf('2:current') >= 0, 're-send: v1 and v2 kept, v1 marked superseded on the job', { vers, supd });
  await p.evaluate(() => { const o = document.getElementById('gc-estpdf-send'); if (o) o.remove(); });

  /* ── PDF design: the 5-page proposal (the Templates generator) — the same estimate ── */
  const SHOTS = path.join(path.dirname(SHOT), 'estpdf_shots'); fs.mkdirSync(SHOTS, { recursive: true });
  await p.evaluate(() => { window._gcEstPdf._S.busy = false; window._gcEstPdf.openSend('ESTTEST1'); });
  await waitFor(C, () => !!document.querySelector('#gc-estpdf-send [data-design]'), null, 8000);
  const dz = await p.evaluate(() => { const s = document.querySelector('#gc-estpdf-send [data-design]'); return { v: s.value, opts: [...s.options].map(o => o.value + '|' + o.textContent) }; });
  ok(dz.opts.some(o => /^p5\|.*5-page/.test(o)) && dz.opts.some(o => /^simple\|Simple estimate/.test(o)) && dz.opts.some(o => /^upload\|Upload the one I sent/.test(o)) && dz.v === 'simple', 'PDF design: GrayCo 5-page proposal · Simple estimate · Upload the one I sent (default simple)', dz);
  await p.evaluate(() => { const b = document.querySelector('#gc-estpdf-send'); b.scrollTop = 0; const s = b.querySelector('[data-design]'); s.scrollIntoView({ block: 'center' }); });
  await sleep(300);
  await p.locator('#gc-estpdf-send .gcep-box').screenshot({ path: path.join(SHOTS, 'send_dialog_pdf_design.png') }).catch(() => {});
  /* the admin's default for commercial jobs → 5-page */
  const kv0 = C.posts().length;
  await p.evaluate(() => { const s = document.querySelector('#gc-estpdf-send [data-design]'); s.value = 'p5'; const b = document.querySelector('#gc-estpdf-send [data-ddef]'); if (b) b.click(); });
  await sleep(800);
  ok(C.posts().some(x => /gc_estpdf_design/.test(x.body || '')) && cget('gc_estpdf_design') && (cget('gc_estpdf_design').commercial === 'p5'), 'an admin sets the default design for commercial jobs (gc_kv gc_estpdf_design)', cget('gc_estpdf_design'));
  await p.evaluate(() => { const o = document.getElementById('gc-estpdf-send'); if (o) o.remove(); window._gcEstPdf.openSend('ESTTEST1'); });
  await waitFor(C, () => !!document.querySelector('#gc-estpdf-send [data-design]'), null, 8000);
  ok(await p.evaluate(() => document.querySelector('#gc-estpdf-send [data-design]').value) === 'p5', 'the next send of a commercial job opens on the 5-page proposal');
  await p.evaluate(() => { const o = document.getElementById('gc-estpdf-send'); if (o) o.remove(); });
  allowH2P = true;
  const p5 = await p.evaluate(async () => { const e = (window._gcEstimatesState || window._crm.estimates).find(x => x.id === 'ESTTEST1'); const html = window._gcEstPdf.proposal5Html(e);
    const r = await window._gcEstPdf.makePdf(e, 'p5'); if (!r || !r.blob) return { html: html.length, ok: false };
    const b = new Uint8Array(await r.blob.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    return { html: html.length, ok: true, head: s.slice(0, 5), pages: (s.match(/\/Type\s*\/Page[^s]/g) || []).length, size: b.length, b64: btoa(s), carrier: /State\s*Farm/i.test(html), internal: /INTERNAL: margin/.test(html) }; });
  ok(p5.ok && p5.head === '%PDF-' && p5.pages >= 5, 'the 5-page proposal PDF is made from the same estimate (the Templates generator): ' + p5.pages + ' pages', { ok: p5.ok, pages: p5.pages, html: p5.html });
  ok(p5.html > 1000 && !p5.carrier && !p5.internal, 'its customer copy: no carrier name, no internal notes');
  if (p5.ok) {
    const pdfPath = path.join(SHOTS, 'proposal5.pdf'); fs.writeFileSync(pdfPath, Buffer.from(p5.b64, 'base64'));
    const PDFJS = process.env.GC_PDFJS || SPD + '/wSG/tb_sg/vendor/pdfjs';
    const pg2 = await C.ctx.newPage(); await pg2.setViewportSize({ width: 900, height: 1200 });
    await pg2.route('https://app.local/pdfjs/**', r => r.fulfill({ path: PDFJS + '/' + path.basename(new URL(r.request().url()).pathname), contentType: 'text/javascript' }));
    await pg2.goto('https://app.local/blank-estpdf'); await pg2.setContent('<html><body style="margin:0;background:#fff"><canvas id="c"></canvas><script src="https://app.local/pdfjs/pdf.min.js"></script></body></html>');
    const drawn = await pg2.evaluate(async b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://app.local/pdfjs/pdf.worker.min.js'; const doc = await window.pdfjsLib.getDocument({ data: u }).promise; const pg = await doc.getPage(1);
      const vp = pg.getViewport({ scale: 1.4 }); const c = document.getElementById('c'); c.width = vp.width; c.height = vp.height; await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; return { pages: doc.numPages, w: c.width, h: c.height }; }, p5.b64).catch(e => ({ err: String(e) }));
    if (drawn && drawn.w) { await pg2.setViewportSize({ width: Math.ceil(drawn.w), height: Math.ceil(drawn.h) }); await pg2.locator('#c').screenshot({ path: path.join(SHOTS, 'proposal5_page1.png') }); }
    ok(drawn && drawn.pages >= 5, 'pdf.js opens it: ' + (drawn && drawn.pages) + ' pages (page 1 → proposal5_page1.png)', drawn);
    await pg2.close();
  }
  /* send it with the 5-page design: those are the bytes stored and e-mailed */
  const n5 = FN.filter(x => x.fn === 'send-email' && x.body.mode === 'estimate').length;
  const s5 = await p.evaluate(() => { window._gcEstPdf._S.busy = false; return window._gcEstPdf.send('ESTTEST1', { to: 'pat.tester@example.com', subject: 'Your proposal', body: 'Attached.', portal: true, design: 'p5' }); });
  const c5 = FN.filter(x => x.fn === 'send-email' && x.body.mode === 'estimate')[n5];
  const b5 = c5 && STORE.get(String(c5.body.pdf.ref).replace('sb:crm-files/', ''));
  ok(s5 && s5.ok && b5 && (b5.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length >= 5, 'sending with "GrayCo 5-page proposal": that 5-page PDF is the one stored and e-mailed', s5);
  allowH2P = false;
  /* the card: 📘 Make proposal opens the same generator for this job + estimate */
  await sleep(4500);
  const mk = await p.evaluate(async () => { const b = document.querySelector('.gcep-slot[data-est="ESTTEST1"] [data-ep="p5"]'); if (!b) return { btn: false }; b.click(); await new Promise(r => setTimeout(r, 1200)); return { btn: true, open: /Project Info/.test(document.body.innerText) && /Generate/.test(document.body.innerText) }; });
  ok(mk.btn && mk.open, 'the card\'s "📘 Make proposal" opens the Customer Proposal Generator for this job', mk);
  await p.keyboard.press('Escape').catch(() => {});
  await p.evaluate(() => { [...document.querySelectorAll('button')].filter(b => /^(✕|Close|Cancel)$/.test((b.textContent || '').trim()) && b.offsetParent).slice(0, 1).forEach(b => b.click()); });

  /* storage failure blocks the send */
  storageFail = true; const before = FN.filter(x => x.fn === 'send-email').length;
  const blocked = await p.evaluate(() => { window._gcEstPdf._S.busy = false; return window._gcEstPdf.send('ESTTEST1', { to: 'pat.tester@example.com', subject: 'x', body: 'y', portal: true }); });
  storageFail = false;
  ok(blocked && !blocked.ok && blocked.blocked && /Couldn.t save the PDF to the CRM — not sent\. Try again\./.test(blocked.error) && FN.filter(x => x.fn === 'send-email').length === before, 'storage failure → BLOCKED ("Couldn\'t save the PDF to the CRM — not sent. Try again."), no e-mail call', blocked);

  /* ── the upload path (text) + the gate on a lead ── */
  await p.evaluate(() => { window._gcEstPdf._S.busy = false; });
  const gate = await p.evaluate(() => {
    const l = (window._crm.leads || []).find(x => x.id === 'LTEST2');
    const sel = document.createElement('select'); sel.setAttribute('data-d', 'stage'); ['New Lead', 'Contacted', 'Estimate Sent', 'Won', 'Lost'].forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
    sel.value = 'Contacted'; const wrap = document.createElement('div'); wrap.setAttribute('data-lead', 'LTEST2'); wrap.appendChild(sel); document.body.appendChild(wrap);
    let reached = false; wrap.addEventListener('change', () => { reached = true; });
    sel.dispatchEvent(new Event('focusin', { bubbles: true })); sel.value = 'Estimate Sent'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    const g = document.getElementById('gc-estpdf-rule'); const txt = g ? g.textContent : '';
    return { reached, value: sel.value, gate: !!g, txt: txt.slice(0, 600) };
  });
  ok(gate.gate && !gate.reached && gate.value === 'Contacted' && /Send from the CRM/.test(gate.txt) && /Upload the estimate you sent/.test(gate.txt) && /Admin override/.test(gate.txt), 'lead → "Estimate Sent" with no estimate in the portal: stopped, "Send from the CRM" / "Upload the estimate you sent" (+ admin override)', gate);
  await p.evaluate(() => document.querySelector('#gc-estpdf-rule [data-u]').click());
  await waitFor(C, () => !!document.getElementById('gc-estpdf-upl') || !!document.getElementById('gc-estpdf-prof'), null, 8000);
  if (await p.evaluate(() => !!document.getElementById('gc-estpdf-prof'))) {
    await p.evaluate(() => { const box = document.getElementById('gc-estpdf-prof'); const same = box.querySelector('[data-f="same"]'); if (same) { same.checked = true; same.dispatchEvent(new Event('change')); } const pr = box.querySelector('[data-f="prefer"]'); if (pr) pr.value = 'text'; box.querySelector('[data-save]').click(); });
    await waitFor(C, () => !!document.getElementById('gc-estpdf-upl'), null, 8000);
  }
  const upPdf = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'estpdf-')); const upFile = path.join(upPdf, 'texted-estimate.pdf'); fs.writeFileSync(upFile, pdfBytes('Demo gutters estimate sent by text'));
  await p.evaluate(() => { const s = document.querySelector('#gc-estpdf-upl [data-m2]'); s.value = 'text'; s.dispatchEvent(new Event('change')); });
  await p.setInputFiles('#gc-estpdf-upl [data-file]', upFile);
  await p.evaluate(() => document.querySelector('#gc-estpdf-upl [data-go]').click());
  await waitFor(C, () => /Saved|Not saved|not a PDF|Couldn/.test((document.querySelector('#gc-estpdf-upl [data-m]') || {}).textContent || ''), null, 20000);
  await sleep(1200);
  const up = await p.evaluate(() => { const e = (window._gcEstimatesState || window._crm.estimates).find(x => x.id === 'ESTTEST2'); const l = (window._crm.leads || []).find(x => x.id === 'LTEST2'); const v = window._gcEstPdf.versions(e);
    return { v: v.map(x => x.via + ':' + x.method + ':' + x.status), status: e.status, method: e.sentMethod, stage: l && l.stage, inPortal: window._gcEstPdf.inPortal(e), outside: window._gcEstPdf.outside().length }; });
  const upCall = FN.filter(x => x.fn === 'send-email' && x.body.mode === 'estimate-record').slice(-1)[0];
  const upBytes = fs.readFileSync(upFile);
  ok(up.v.length === 1 && up.v[0] === 'upload:text:sent' && up.status === 'Sent' && up.method === 'text' && up.inPortal, 'upload (sent by text): stored, versioned, estimate Sent (method text), counts as in the portal path', up);
  ok(upCall && upCall.body.pdf.sha256 === sha(upBytes), 'the uploaded PDF is stored byte for byte (sha256)');
  ok(up.stage === 'Estimate Sent' && up.outside === 0 && FN.some(x => x.fn === 'portal-sign' && x.body.refId === 'ESTTEST2' && x.body.sentVia === 'text'), 'the lead moves to Estimate Sent, the portal paper is made, NOT flagged as outside the CRM', up);
  fs.rmSync(upPdf, { recursive: true, force: true });
  /* now the stage change goes through */
  const gate2 = await p.evaluate(() => { const sel = document.querySelector('[data-lead="LTEST2"] select'); sel.dispatchEvent(new Event('focusin', { bubbles: true })); sel.value = 'Won'; sel.dispatchEvent(new Event('change', { bubbles: true })); return { gate: !!document.getElementById('gc-estpdf-rule'), v: sel.value }; });
  ok(!gate2.gate && gate2.v === 'Won', 'with the estimate in the portal the stage change goes through');
  /* admin override with a reason → logged, listed */
  addTo('estimates', []);
  const ov = await p.evaluate(async () => {
    const set = window._gcSetEstimates; set(prev => prev.concat([{ id: 'ESTTEST3', pid: 'PRJTEST2', name: 'Demo Override Est', status: 'Draft', totalCharge: 10, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]));
    await new Promise(r => setTimeout(r, 300));
    window.prompt = () => 'customer signed a paper copy in the office';
    const pr = window._gcMarkEstimateWinner('ESTTEST3');
    await new Promise(r => setTimeout(r, 300));
    const g = document.getElementById('gc-estpdf-rule'); const b = g && g.querySelector('[data-o]'); if (b) b.click();
    await pr; await new Promise(r => setTimeout(r, 500));
    const e = (window._gcEstimatesState || window._crm.estimates).find(x => x.id === 'ESTTEST3');
    return { gate: !!g, override: e && e.sentOverride, won: e && e.status, list: window._gcEstPdf.outside().map(x => x.name + ':' + x.reason), card: window._gcEstPdf.raCard('admin') };
  });
  ok(ov.gate && ov.override && /paper copy/.test(ov.override.reason) && ov.list.some(x => /Demo Override Est/.test(x)) && /Demo Override Est/.test(ov.card), '🏆 Mark winner with no send: gated; the admin override (reason) is logged and listed under "Estimates marked sent outside the CRM"', ov);

  /* ── field: + New customer → Start estimate (CUSTALL matching, never a name alone) ── */
  const nc = await p.evaluate(async () => {
    const cs = (window._graycoCustomers && window._graycoCustomers.length ? window._graycoCustomers : window._crm.customers) || [];
    const n0 = cs.length;
    const r1 = window._gcEstPdf.makeCustomer({ name: 'Demo Brand New', phone: '901-555-0199', email: 'brandnew@example.com', address: '9 Demo Ln' });
    const r2 = window._gcEstPdf.makeCustomer({ name: 'Demo Somebody Else', phone: '901-555-0199', email: '', address: '' });
    const r3 = window._gcEstPdf.makeCustomer({ name: 'Demo Brand New', phone: '', email: '', address: '77 Other St' });
    await new Promise(r => setTimeout(r, 400));
    return { r1: [r1.matched, r1.cust.id], r2: [r2.matched, r2.by, r2.cust.id], r3: [r3.matched, r3.cust.id], lead: r1.lead && r1.lead.customerId === r1.cust.id };
  });
  ok(!nc.r1[0] && nc.lead, '+ New customer: a new customer and a lead linked to it', nc);
  ok(nc.r2[0] === true && nc.r2[1] === 'phone' && nc.r2[2] === nc.r1[1], 'the same phone → linked to that customer (CUSTALL rule)', nc);
  ok(nc.r3[0] === false && nc.r3[1] !== nc.r1[1], 'the same name alone → never merged (a new customer)', nc);
  await p.evaluate(() => window._gcEstPdf.newCustomer());
  const ncForm = await p.evaluate(() => [...document.querySelectorAll('#gc-estpdf-newcust input')].map(i => i.getAttribute('data-f') + ':' + i.type));
  ok(ncForm.join() === 'name:text,phone:tel,email:email,address:text', 'the field sheet asks name, phone (tel), e-mail (email), address up front', ncForm);
  await p.evaluate(() => { const o = document.getElementById('gc-estpdf-newcust'); if (o) o.remove(); });

  /* a quick job with just a name / address saves with no prompts */
  const dl0 = C.dialogs.length;
  await p.evaluate(() => { window._setProjects(prev => [{ id: 'PRJQUICK', name: 'Demo Quick Job', address: '5 Quick St', status: 'bidding', type: 'Residential', createdAt: new Date().toISOString() }].concat(prev)); });
  await sleep(2500);
  ok(!(await p.evaluate(() => !!document.getElementById('gc-estpdf-prof') || !!document.getElementById('gc-estpdf-rule'))) && C.dialogs.length === dl0 && await p.evaluate(() => (window._crm.projects || []).some(x => x.id === 'PRJQUICK')), 'a quick job (name + address only) saves with no profile prompt');

  /* the Estimator home (role apps) */
  const ra = await p.evaluate(() => ({ est: window._gcEstPdf.raCard('est'), acts: window._gcRA ? window._gcRA.actions('est', 'home') : [] }));
  ok(/📤 Send estimate/.test(ra.est) && ra.acts.indexOf('sendest') >= 0 && ra.acts.indexOf('newcust') >= 0, 'Estimator home: 📤 Send estimate + 👤 New customer (Field quick buttons / Desk tiles) and the card', ra.acts);

  /* ── the customer portal: before / after shots (the same estimate), the card's buttons ── */
  await portalPart(SHOTS);
  const errs = C.errs.filter(e => !/ResizeObserver|Script error/.test(e));
  ok(errs.length === 0, 'no page errors', errs.slice(0, 5));
  await C.b.close();
}
