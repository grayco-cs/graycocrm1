/* patch SUBTHREAD (owner's sub portal plan, 11/15 list item 5.4): the per-job message thread between GrayCo and ONE sub
   (gc_portal_msg party "s:<subId>" — private to that sub) also
     · shows in the job's 💬 Messages (gc_job_messages) tagged with the sub — "🔨 <Sub> (sub portal)" — for the PM / office;
     · tells the sub when GrayCo writes: an e-mail (and a text when texting is set up) "New message from GrayCo — <job>" with a
       button that opens THAT job in their portal (#t=<link>&job=<job id>). At most one notice per sub per job per 30 minutes;
       data-entry mode holds it like every outside e-mail / text (_lib/pause.js wraps fetch).
   deps (injected by portal-access.js): { core, crmData, subById, jobTagOf, subLinkCreate, linkFor, sendMail, sendText, textReady,
   mailHtml, dbGet, okEmail, phone10, now } */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function clip(t, n){ t = s(t).replace(/\s+/g, ' '); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
const QUIET_MS = 30 * 60e3;
async function after(d, o){
  /* o = { id, pid, subId, side: 'gc' | 'them', author, text, files, notify } */
  const out = { mirrored: false, notified: false };
  let data = {}; try { data = await d.crmData(false); } catch (e) {}
  const sub = (d.subById && d.subById(data, o.subId)) || {}, name = s(sub.company || sub.name) || 'Sub';
  const at = new Date(d.now ? d.now() : Date.now()).toISOString();
  /* 1. the job's 💬 Messages, tagged with the sub */
  try {
    const msg = { id: 'SPM_' + s(o.id), pid: s(o.pid), authorId: o.side === 'gc' ? '' : 'sub:' + s(o.subId), authorName: o.side === 'gc' ? s(o.author || 'GrayCo') + ' → 🔨 ' + name + ' (sub portal)' : '🔨 ' + name + (s(o.author) && s(o.author) !== name ? ' — ' + s(o.author) : '') + ' (sub portal)',
      text: s(o.text).slice(0, 4000) + ((o.files || []).length ? '\n📎 ' + o.files.map(f => s(f && f.name)).filter(Boolean).join(', ') : ''), tags: [], at, source: 'subportal', channel: 'subportal', subId: s(o.subId), subName: name, dir: o.side === 'gc' ? 'out' : 'in', portalMsgId: s(o.id) };
    /* patch SUBFLOW: a sub's message from the bid site names the job's PM + estimator (→ 🔔 For you for both; the CRM's own rule is the PM only) */
    if (o.side !== 'gc' && Array.isArray(o.tell) && o.tell.length) { msg.notify = o.tell.filter(x => x && (x.e || x.id)).slice(0, 10); msg.tags = msg.notify.map(x => s(x.id || x.e)); msg.mentions = msg.notify.map(x => ({ id: x.id, e: x.e, n: x.n })); }
    const has = l => l.some(x => x && x.id === msg.id);
    const w = await d.core().kvListUpdate('gc_job_messages', l => has(l) ? null : { list: l.concat([msg]), check: has });
    out.mirrored = !!(w && w.ok !== false);
  } catch (e) { out.mirrorError = s(e && e.message); }
  /* 2. GrayCo wrote → tell the sub (once per 30 minutes per job) */
  if (o.side === 'gc' && o.notify !== false) {
    try {
      const since = new Date(Date.now() - QUIET_MS).toISOString();
      const recent = await d.dbGet('gc_portal_msg', 'select=id,created_at&project_id=eq.' + encodeURIComponent(s(o.pid)) + '&party=eq.' + encodeURIComponent('s:' + s(o.subId)) + '&side=eq.gc&created_at=gt.' + encodeURIComponent(since) + '&limit=5');
      if ((recent || []).some(r => r && s(r.id) !== s(o.id))) { out.skipped = 'told less than 30 minutes ago'; return out; }
      const link = await d.subLinkCreate(s(o.subId), name, 'sub thread');
      const url = d.linkFor(link.token) + '&job=' + encodeURIComponent(s(o.pid));
      const tag = d.jobTagOf ? s(d.jobTagOf(data, o.pid)) : '';
      const es = /^es/i.test(s(sub.lang));
      const subj = (es ? 'Nuevo mensaje de GrayCo' : 'New message from GrayCo') + (tag ? ' — ' + tag : '');
      const body = clip(o.text, 300) || (es ? 'GrayCo le envió un archivo.' : 'GrayCo sent you a file.');
      if (d.okEmail(s(sub.email))) { const r = await d.sendMail(s(sub.email), subj, d.mailHtml(subj, body, '', { href: url, label: es ? 'Abrir el trabajo en mi portal' : 'Open the job in my portal' })); out.notified = !!(r && r.ok); out.mail = r; }
      if (d.teamCc) { try { const cc = (await d.teamCc(s(o.subId))).filter(e => e !== String(sub.email || '').toLowerCase()); const home = (d.portalBase ? d.portalBase() : '') + '/';   /* patch PORTALTEAM: coworkers who turned "Notify me" on (a sign-in link, never the company's link code) */
        for (const e of cc) await d.sendMail(e, subj, d.mailHtml(subj, body, '', { href: home, label: es ? 'Abrir mi portal' : 'Open my portal' })); out.team = cc.length; } catch (e) {} }
      if (d.textReady() && d.phone10(sub.phone)) { const t = await d.sendText(d.phone10(sub.phone), 'GrayCo' + (tag ? ' — ' + tag : '') + ': ' + clip(o.text, 120) + ' ' + url); out.texted = !!(t && t.ok); }
    } catch (e) { out.notifyError = s(e && e.message); }
  }
  return out;
}
module.exports = { after, QUIET_MS };
