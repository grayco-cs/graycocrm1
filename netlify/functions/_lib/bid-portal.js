/* ============================================================================
   GrayCo — THE LEAD INBOX → BID PORTAL ADAPTER.   netlify/functions/_lib/bid-portal.js   (patch LD2)

   (_lib/ is not a function: Netlify only makes functions of the files directly in netlify/functions
    and of folders with an index.js / <folder>.js. esbuild bundles this file into each function that
    requires it.)

   Every new bid opportunity in the Lead Inbox becomes a DRAFT bid job in the bid portal
   (bids.grayco-cs.com, netlify/functions/subportal.js) for an admin to review. A draft is NEVER shown
   to subcontractors: it is saved with status "draft" and visibility "private" and no invitations, and
   the portal shows a sub only public jobs and jobs they were invited to (subportal.js subScope()).
   Only an admin's "Publish to bid portal" (bid-inbox.js ?act=1 op "publish") makes it public.

   How the portal stores a job (commit c08e589, subportal.js / subportal-app):
     sp_rows  key "jobs/<id>"   collection "jobs", job_id <id>, data = the job record
              key "plans/<id>"  collection "plans", job_id <id>, data = { items: [{name,size,type,fileRef}] }
     bucket   subportal-files   private; fileRef = the object path ("staff/…"); the portal hands files
                                out as signed links.
   A plan or spec that came by e-mail is in crm-files (bid-inbox.js); it is COPIED into subportal-files,
   so the portal never needs to reach the CRM's bucket.

   WORKS BEFORE THE PORTAL EXISTS. status() feature-detects sp_rows. Not there yet (wSUB's merge has not
   landed, or docs/subportal-setup.sql was not run): the draft is QUEUED in the lead inbox store
   (key gc_bidportal_queue) and flush() creates it on a later run, once the table answers.

   INTERFACE (deps are bid-inbox.js's own database helpers, so there is one copy of each):
     const BP = require('./_lib/bid-portal.js').make(deps)
     await BP.status(force)        → { ready, why }
     await BP.draft(item)          → { ok, state: 'draft'|'updated'|'unchanged'|'queued'|'removed'|'published', jobId, files }
     await BP.publish(item, who)   → { ok, state: 'published', jobId } | { ok:false, code, error }
     await BP.flush()              → { created, left }
     BP.jobIdFor(item)             → the portal job id (the same every time for the same inbox item)
   ========================================================================== */
'use strict';
const crypto = require('crypto');

const BUCKET = 'subportal-files', SRC_BUCKET = 'crm-files', KQ = 'gc_bidportal_queue';
const MAX_COPY = 50 * 1024 * 1024;

function make(d){
  const { env, s, low, arr, nowIso, sbUrl, svcH, kvCas, kvGet } = d;
  let cache = { at: 0, ready: null, why: '' };
  const H = extra => svcH(Object.assign({ 'Content-Type': 'application/json' }, extra || {}));
  function remember(ready, why){ cache = { at: Date.now(), ready, why: why || '' }; return { ready, why: why || '' }; }

  async function status(force){
    if (env('BID_PORTAL_DRAFTS') === '0') return { ready: false, off: true, why: 'bid-portal drafts are switched off (BID_PORTAL_DRAFTS=0)' };
    if (!force && cache.ready != null && Date.now() - cache.at < 120000) return { ready: cache.ready, why: cache.why };
    try {
      const r = await fetch(sbUrl() + '/rest/v1/sp_rows?select=key&limit=1', { headers: H() });
      if (r.ok) return remember(true, '');
      const t = await r.text().catch(() => '');
      if (r.status === 404 || /PGRST20[0-9]|does not exist|schema cache/i.test(t)) return remember(false, 'the bid portal is not set up yet (its table sp_rows is missing: docs/subportal-setup.sql)');
      return remember(false, 'the bid portal database answered ' + r.status);
    } catch (e) { return remember(false, 'the bid portal database could not be reached'); }
  }

  function jobIdFor(item){ return 'j_ld' + crypto.createHash('sha256').update('lead-inbox:' + s(item && item.id)).digest('hex').slice(0, 14); }
  function safeName(n){ return s(n).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(-80) || 'file'; }

  async function getRow(key){
    const r = await fetch(sbUrl() + '/rest/v1/sp_rows?select=key,data,updated_at&key=eq.' + encodeURIComponent(key), { headers: H() });
    if (!r.ok) throw new Error('bid portal read failed (' + r.status + ')');
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }
  async function putRows(rows){
    const at = nowIso();
    const body = rows.map(x => ({ key: x.collection + '/' + x.id, collection: x.collection, id: x.id, job_id: x.job_id || null, user_id: null, email: null, data: x.data, updated_at: at, updated_by: 'lead-inbox' }));
    const r = await fetch(sbUrl() + '/rest/v1/sp_rows?on_conflict=key', { method: 'POST', headers: H({ Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(body) });
    if (!r.ok) throw new Error('bid portal write failed (' + r.status + ')');
  }

  /* a crm-files object → subportal-files (same bytes, path staff/lead-inbox/<sha>-<name>) */
  async function copyFile(f){
    const m = /^sb:crm-files\/(.+)$/.exec(s(f.ref)); if (!m) return null;
    const dest = 'staff/lead-inbox/' + s(f.hash || m[1].split('.')[0]).slice(0, 24) + '-' + safeName(f.name);
    try {
      const g = await fetch(sbUrl() + '/storage/v1/object/' + SRC_BUCKET + '/' + m[1].split('/').map(encodeURIComponent).join('/'), { headers: svcH() });
      if (!g.ok) return { name: f.name, why: 'could not read it from the CRM files (' + g.status + ')' };
      const buf = Buffer.from(await g.arrayBuffer());
      if (buf.length > MAX_COPY) return { name: f.name, why: 'over 50 MB' };
      const p = await fetch(sbUrl() + '/storage/v1/object/' + BUCKET + '/' + dest.split('/').map(encodeURIComponent).join('/'), { method: 'POST',
        headers: svcH({ 'Content-Type': f.type || 'application/octet-stream', 'x-upsert': 'true' }), body: buf });
      if (!p.ok && p.status !== 409) {
        const t = await p.text().catch(() => '');
        return { name: f.name, why: /bucket/i.test(t) && /not.?found/i.test(t) ? 'the bid portal file bucket is not set up yet' : 'upload failed (' + p.status + ')' };
      }
      return { name: s(f.name) || 'plan.pdf', size: f.size || buf.length, type: f.type || 'application/pdf', fileRef: dest, kind: f.kind || 'plans', fromLead: true };
    } catch (e) { return { name: f.name, why: 'storage unreachable' }; }
  }

  function due(item){ const v = s(item.bidDue); return { day: v.slice(0, 10), time: v.length > 10 ? v.slice(11, 16) : '' }; }
  function where(item){ const cs = [s(item.city), [s(item.state), s(item.zip)].filter(Boolean).join(' ')].filter(Boolean).join(', '); return [s(item.address), cs].filter(Boolean).join(', '); }
  function srcLink(item){ const l = arr(item.plansLinks).find(x => x && /^https?:/.test(s(x.url))); return l ? s(l.url) : ''; }
  function notesFor(item, opened){
    const out = [opened ? 'From GrayCo Construction Services' + (s(item.bidNumber) ? ' — bid # ' + s(item.bidNumber) : '') + '.'
      : 'Draft from the CRM Lead Inbox — ' + (s(item.source) || 'lead') + '. Check it, then open it to invited subs (private) or publish it from the CRM (Leads → the lead → 🏗 Sub bid portal).'];
    if (item.gc) out.push('GC: ' + item.gc); if (item.owner) out.push('Owner: ' + item.owner); if (item.bidNumber) out.push('Bid #: ' + item.bidNumber);
    if (item.preBid) out.push('Pre-bid: ' + item.preBid.replace('T', ' ') + (item.preBidLocation ? ' at ' + item.preBidLocation : '') + (item.preBidMandatory ? ' (MANDATORY)' : ''));
    if (item.flag) out.push(item.flag);
    arr(item.plansLinks).slice(0, 8).forEach(l => out.push((l.board || l.label || 'Link') + ': ' + l.url));
    arr(item.notes).slice(-6).forEach(n => out.push(s(n)));
    return out.join('\n').slice(0, 6000);
  }
  function jobRecord(item, prev, plansMeta, specs){
    const dd = due(item);
    const base = prev || { id: jobIdFor(item), poNumber: '', projectId: '', pmId: '', estimatorId: '', bidResultsSharing: 'private', tradeScopes: [], scopeDocs: [],
      createdBy: 'lead-inbox', createdByName: 'CRM Lead Inbox', createdAt: nowIso() };
    const j = Object.assign({}, base, {
      title: s(item.title).slice(0, 200), address: where(item), bidDueDate: dd.day, bidDueTime: dd.time,
      scope: (prev && prev.crmScope) ? prev.scope : s(item.scope), notes: notesFor(item, !!(prev && prev.draft === false)) + (prev && arr(prev.crmNotes).length ? '\n\nFrom the GrayCo team:\n' + prev.crmNotes.map(n => '• ' + n).join('\n') : ''), tradesSought: arr(item.trades).join(', '),
      grayCoRole: item.gc ? 'sub' : (prev && prev.grayCoRole) || 'gc', sourceLink: srcLink(item),
      plans: plansMeta, specDocs: specs,
      leadInbox: { id: item.id, source: s(item.source), type: s(item.type), bidNumber: s(item.bidNumber), alsoOn: arr(item.alsoOn), rev: item.rev || 1 },
      updatedAt: nowIso()
    });
    if (!prev || prev.draft) { j.status = 'draft'; j.visibility = 'private'; j.draft = true; }   /* never published here */
    return j;
  }

  async function queue(item, why){
    await kvCas(KQ, v => { const q = arr(v).filter(x => x && x.id !== item.id); q.push({ id: item.id, at: nowIso(), why: s(why).slice(0, 200) }); return q.slice(-500); });
    return { ok: true, state: 'queued', jobId: jobIdFor(item), why };
  }

  async function draft(item){
    if (!item || !item.id || item.status === 'dismissed' || item.status === 'merged' || item.stub) return { ok: false, state: 'skipped' };
    const st = await status();
    if (st.off) return { ok: false, state: 'off', why: st.why };
    if (!st.ready) return queue(item, st.why);
    const jobId = (item.portal && item.portal.jobId) || jobIdFor(item);
    try {
      const prevRow = await getRow('jobs/' + jobId);
      const prev = prevRow && prevRow.data;
      if (!prev && item.portal && item.portal.jobId && /draft|published/.test(s(item.portal.state))) return { ok: true, state: 'removed', jobId };   /* an admin deleted it in the portal: not brought back */
      const plansRow = await getRow('plans/' + jobId);
      const have = arr(plansRow && plansRow.data && plansRow.data.items), haveSpecs = arr(prev && prev.specDocs);
      const known = {}; have.concat(haveSpecs).forEach(x => { if (x && x.fileRef) known[x.fileRef.replace(/^.*\/([0-9a-f]{8,24})-.*$/, '$1')] = 1; });
      const copied = [], failed = [];
      for (const f of arr(item.files)) {
        if (!f || !f.ref || f.kind === 'email') continue;
        const key = s(f.hash || '').slice(0, 24); if (key && known[key]) continue;
        const c = await copyFile(f); if (!c) continue;
        if (c.fileRef) { copied.push(c); known[key] = 1; } else failed.push(c);
      }
      const plans = have.concat(copied.filter(c => c.kind !== 'specs'));
      const specs = haveSpecs.concat(copied.filter(c => c.kind === 'specs').map(c => ({ name: c.name, size: c.size, type: c.type, fileRef: c.fileRef })));
      const meta = plans.map(p => ({ name: p.name, size: p.size, type: p.type }));
      const job = jobRecord(item, prev, meta, specs);
      if (failed.length) job.notes += '\nNot copied: ' + failed.map(x => x.name + ' (' + x.why + ')').join(', ');
      if (prev && prev.draft === false && copied.length) job.addendumNote = 'New files from the Lead Inbox ' + nowIso().slice(0, 10) + ': ' + copied.map(c => c.name).join(', ');
      const same = prev && JSON.stringify(Object.assign({}, prev, { updatedAt: '' })) === JSON.stringify(Object.assign({}, job, { updatedAt: '' }));
      if (same && !copied.length) return { ok: true, state: 'unchanged', jobId, files: 0 };
      const rows = [{ collection: 'jobs', id: jobId, job_id: jobId, data: job }];
      if (copied.length || !plansRow) rows.push({ collection: 'plans', id: jobId, job_id: jobId, data: { items: plans } });
      await putRows(rows);
      return { ok: true, state: !prev ? 'draft' : prev.draft === false ? 'published' : 'updated', jobId, files: copied.length, notCopied: failed };
    } catch (e) {
      cache.ready = null;
      return queue(item, s(e && e.message));
    }
  }

  async function publish(item, who){
    const st = await status(true);
    if (!st.ready) return { ok: false, code: 409, error: 'The bid portal is not set up yet, so the draft is waiting in the queue (' + st.why + '). It is created there as soon as the portal is ready; then press Publish again.' };
    let r = await draft(item);
    if (!r.ok || r.state === 'queued') return { ok: false, code: 503, error: 'The draft could not be written to the bid portal: ' + s(r.why || r.state) };
    if (r.state === 'removed') return { ok: false, code: 410, error: 'This draft was deleted in the bid portal. Add the job there by hand if you still want it.' };
    const row = await getRow('jobs/' + r.jobId);
    if (!row) return { ok: false, code: 404, error: 'The draft is not in the bid portal.' };
    const job = Object.assign({}, row.data);
    if (job.draft === false && job.visibility === 'public') return { ok: true, state: 'published', jobId: r.jobId, already: true };
    if (!job.bidDueDate) return { ok: false, code: 400, error: 'Add a bid due date first (the bid portal needs one): open the job in the bid portal, or wait for an e-mail with the date.' };
    Object.assign(job, { status: 'open', visibility: 'public', draft: false, publishedAt: nowIso(), publishedBy: s(who && who.email) || 'admin', updatedAt: nowIso() });
    await putRows([{ collection: 'jobs', id: r.jobId, job_id: r.jobId, data: job }]);
    return { ok: true, state: 'published', jobId: r.jobId };
  }

  /* drafts waiting for the portal: created once it answers. itemsOf(ids) → the inbox items */
  async function flush(itemsOf){
    const q = arr(await kvGet(KQ)); if (!q.length) return { created: 0, left: 0 };
    const st = await status(true); if (!st.ready) return { created: 0, left: q.length, why: st.why };
    const items = await itemsOf(q.map(x => x.id));
    let created = 0; const done = [], results = [];
    for (const x of q) {
      const it = items[x.id];
      if (!it || it.status === 'dismissed' || it.status === 'merged') { done.push(x.id); continue; }
      const r = await draft(it);
      if (r.ok && r.state !== 'queued') { done.push(x.id); created++; results.push({ id: x.id, jobId: r.jobId, state: r.state }); }
    }
    await kvCas(KQ, v => arr(v).filter(x => x && done.indexOf(x.id) < 0));
    return { created, left: q.length - done.length, results };
  }

  /* patch LEADS: the lead's sub bid job — private by default (invited subs only), public only when a person says so.
     o: { mode: 'draft'|'private'|'public', scope, scopeMode: 'claude'|'manual'|'estimate', sharedNotes: [text], plansLinks: [{url,label}] } */
  function noPrices(t){   /* the same rule as the CRM's window._gcStripPrices: no $ amount, price, cost, tax, O&P, RCV / ACV, markup survives */
    return s(t).split('\n').map(x => x.replace(/[$€£]\s?-?\d[\d,]*(\.\d+)?/g, '')
      .replace(/\(?\b(rcv|acv|o\s?&\s?p|overhead(\s*(and|&)\s*profit)?|profit|sales\s*tax|tax|depreciation|deprec\.?|markup|margin|unit\s*(price|cost)|price|cost|total|subtotal|amount|charge)\b\.?\s*[:=]?\s*\(?\s*-?\s?\d[\d,]*(\.\d+)?\s*%?\)?/gi, '')
      .replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([,.;])/g, '$1').replace(/[ \t]*[—–-][ \t]*$/, '').trim()).join('\n').trim();
  }
  async function setPortal(item, o, who){
    o = o || {};
    const mode = /^(draft|private|public)$/.test(s(o.mode)) ? s(o.mode) : 'private';
    const st = await status(true);
    if (!st.ready) return { ok: false, code: 409, error: 'The sub bid portal is not set up yet (' + st.why + ').' };
    const r = await draft(item);
    if (!r.ok || r.state === 'queued') return { ok: false, code: 503, error: 'The sub bid job could not be written: ' + s(r.why || r.state) };
    if (r.state === 'removed') return { ok: false, code: 410, error: 'This bid job was deleted in the sub bid portal.' };
    const row = await getRow('jobs/' + r.jobId);
    if (!row) return { ok: false, code: 404, error: 'The bid job is not in the sub bid portal.' };
    const job = Object.assign({}, row.data);
    if (o.scope != null) {
      const sm = /^(claude|manual|estimate|xactimate)$/.test(s(o.scopeMode)) ? s(o.scopeMode) : 'manual';
      job.scope = (sm === 'manual' ? s(o.scope) : noPrices(o.scope)).slice(0, 20000);   /* Claude, estimate and Xactimate scopes are cleaned of prices here too */ job.scopeMode = sm; job.crmScope = true;
    }
    if (o.sharedNotes) job.crmNotes = arr(o.sharedNotes).map(x => s(x).slice(0, 2000)).filter(Boolean).slice(0, 30);
    if (o.plansLinks) job.plansLinks = arr(o.plansLinks).filter(x => x && /^https?:\/\//.test(s(x.url))).map(x => ({ url: s(x.url).slice(0, 1000), label: s(x.label).slice(0, 120) })).slice(0, 20);
    if (mode === 'public') {
      if (!job.bidDueDate) return { ok: false, code: 400, error: 'Add a bid due date first — a public bid job needs one.' };
      Object.assign(job, { status: 'open', visibility: 'public', draft: false, publishedAt: job.publishedAt || nowIso(), publishedBy: s(who && who.email) || 'staff', madePublicAt: nowIso() });
    } else if (mode === 'private') {
      Object.assign(job, { status: CLOSEDRE.test(s(job.status)) ? job.status : 'open', visibility: 'private', draft: false, openedPrivateAt: job.openedPrivateAt || nowIso(), openedBy: s(who && who.email) || 'staff' });
    }
    job.notes = notesFor(item, job.draft === false) + (arr(job.crmNotes).length ? '\n\nFrom the GrayCo team:\n' + job.crmNotes.map(n => '• ' + n).join('\n') : '');
    job.updatedAt = nowIso();
    await putRows([{ collection: 'jobs', id: r.jobId, job_id: r.jobId, data: job }]);
    return { ok: true, jobId: r.jobId, state: job.draft === false ? (job.visibility === 'public' ? 'public' : 'private') : 'draft', visibility: job.visibility, files: r.files || 0 };
  }
  const CLOSEDRE = /^(closed|awarded|cancell?ed|archived)$/i;

  return { status, draft, publish, flush, setPortal, jobIdFor, _copyFile: copyFile, _noPrices: noPrices, KQ };
}
module.exports = { make, BUCKET, KQ };
