#!/usr/bin/env python3
"""patch APPRLEAD (owner 11/4: "I need to be able to see who and what the 'lead' said before I send the approval").
Every approval that goes TO a lead (first e-mail to a new lead, website lead, careers reply) shows "What they sent" above
the buttons: name, phone, e-mail, address, source, when, their message (6 lines + Show all) and a red
"Looks like spam — Deny?" when the spam check flags it. The servers now put the message, name and e-mail in the
approval's meta; older approvals read the CRM's lead (by lead id, e-mail or phone)."""
import sys, os
R = sys.argv[1] if len(sys.argv) > 1 else '.'
def patch(fn, pairs, mark):
    p = os.path.join(R, fn); src = open(p, encoding='utf-8').read()
    if mark in src: print(fn, 'already patched'); return
    for o, n in pairs:
        assert src.count(o) == 1, (fn, o[:70]); src = src.replace(o, n)
    open(p, 'w', encoding='utf-8').write(src); print(fn, 'patched')
patch('netlify/functions/website-intake.js', [
 ("meta: { source: SOURCE, websiteForm: (TYPES[f.type] || {}).label || '', phone: tidyPhone(f.phone), address: fullAddr(f) } });",
  "meta: { source: SOURCE, websiteForm: (TYPES[f.type] || {}).label || '', phone: tidyPhone(f.phone), address: fullAddr(f), name: f.name || '', email: f.email || '', message: clip(f.message, 3000), at: new Date().toISOString() } });   /* APPRLEAD */"),
], 'APPRLEAD')
patch('netlify/functions/lead-intake.js', [
 ("meta: { leadId: lead.id, leadSource: lead.leadSource || '', phone: lead.phone || '', address: lead.address || '' } });",
  "meta: { leadId: lead.id, leadSource: lead.leadSource || '', phone: lead.phone || '', address: lead.address || '', name: lead.name || '', email: lead.email || '', message: String(lead.notes || lead.message || '').slice(0, 3000), at: new Date().toISOString() } });   /* APPRLEAD */"),
], 'APPRLEAD')
JS = r'''
/* APPRLEAD: "What they sent" on approvals that go to a lead */
function apLeadBox(r){
  try {
    if (r.src !== 'queue') return '';
    var x = null; try { var c = W._gcCustApprovals ? W._gcCustApprovals() : null; x = arr(c && c.all).find(function(q){ return q && (s(q.id) === s(r.id) || s(q.id) === s(r.key)); }) || null; } catch (e) {}
    if (!x || !/lead_first_contact|applicant_reply/.test(s(x.kind))) return '';
    var m = x.meta || {}, L = arr((W._crm || {}).leads), dig = function(v){ return s(v).replace(/\D/g, '').slice(-10); };
    var ld = L.find(function(l){ return l && m.leadId && s(l.id) === s(m.leadId); }) || L.find(function(l){ return l && x.to && low(l.email) === low(x.to); }) || L.find(function(l){ return l && m.phone && dig(l.phone) && dig(l.phone) === dig(m.phone); }) || {};
    var name = s(m.name || ld.name || ld.client || s(x.jobName).replace(/^(Website lead|New lead|Job application)\s*—\s*/, '')), phone = s(m.phone || ld.phone), email = s(m.email || x.to || ld.email);
    var addr = s(m.address || ld.address), src = s(m.source || m.leadSource || ld.leadSource || ld.source) + (m.websiteForm ? ' · ' + m.websiteForm : ''), when = s(m.at || ld.createdAt || ld.created || x.createdAt);
    var msg = s(m.message || ld.message || ld.notes || ld.scope || ld.description);
    var spam = !!(ld.spam || ld.isSpam || /spam/i.test(s(ld.status) + ' ' + s(ld.spamFlag)) || m.spam);
    if (!spam) { try { spam = /\b(bookkeep|seo\b|backlink|web ?design|marketing services|crypto|loan offer|guest post|rank (your|on) google)/i.test(msg + ' ' + name); } catch (e) {} }
    var lines = msg.split(/\n/), short = lines.slice(0, 6).join('\n'), more = lines.length > 6 || msg.length > 700;
    if (msg.length > 700 && lines.length <= 6) short = msg.slice(0, 700) + '…';
    var dt = when ? (function(){ var d = new Date(when); return isNaN(d) ? when : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); })() : '';
    return '<div class="apx-what" style="margin:6px 0 8px;padding:9px 11px;border:1px solid #cbd5e1;border-radius:9px;background:#f8fafc;font-size:13px;line-height:1.45">'
      + (spam ? '<div style="display:inline-block;margin-bottom:5px;padding:2px 9px;border-radius:99px;background:#fee2e2;color:#991b1b;font-weight:800">⚠ Looks like spam — Deny?</div>' : '')
      + '<div style="font-weight:800;color:#0f172a">💬 What they sent</div>'
      + '<div style="color:#334155"><b>' + esc(name || '—') + '</b>' + (phone ? ' · <a href="tel:' + esc(dig(phone)) + '">' + esc(phone) + '</a>' : '') + (email ? ' · ' + esc(email) : '') + '</div>'
      + ((addr || src || dt) ? '<div style="color:#64748b">' + esc([addr, src, dt].filter(Boolean).join(' · ')) + '</div>' : '')
      + (msg ? '<div style="white-space:pre-wrap;margin-top:5px;color:#0f172a" data-apx-msg>' + esc(short) + '</div>' + (more ? '<details style="margin-top:3px"><summary style="cursor:pointer;color:#2563eb">Show all</summary><div style="white-space:pre-wrap">' + esc(msg) + '</div></details>' : '') : '<div style="color:#64748b;margin-top:4px">No message — they only left contact details.</div>')
      + '</div>';
  } catch (e) { return ''; }
}
'''
patch('index.html', [
 ("/* ── drawing ──────────────────────────────────────────────────────────────── */\nvar ACTS = {};\nfunction btns(r, where){\n  r = adRow(r);   /* patch APPRDOC: Open … = the file */\n  var h = '';",
  "/* ── drawing ──────────────────────────────────────────────────────────────── */" + JS + "var ACTS = {};\nfunction btns(r, where){\n  r = adRow(r);   /* patch APPRDOC: Open … = the file */\n  var h = '';"),
 ("  if (r.approve && adBlock(r)) h += '<button type=\"button\" class=\"apx-b go\" disabled title=\"Admin setting: approvals need a document\">",
  "  h += apLeadBox(r);   /* APPRLEAD */\n  if (r.approve && adBlock(r)) h += '<button type=\"button\" class=\"apx-b go\" disabled title=\"Admin setting: approvals need a document\">"),
], 'APPRLEAD')
