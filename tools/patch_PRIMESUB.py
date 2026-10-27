#!/usr/bin/env python3
"""Idempotent patch PRIMESUB (owner 10/27): every bid on Leads shows 🏛 PRIME or 🔧 SUB.

Owner: "on leads i want jobs as a subcontractor and prime opportunities to be shown so cities schools etc from city
government school website bids etc are prime, building connected planhub a and b and other plan rooms are typically
as a sub"

  * 🏛 PRIME = we bid straight to the owner (city, county, state, school district, university, MLGW / MSCAA-type
    agencies, SAM.gov, public procurement sites, an owner who invites us). 🔧 SUB = we bid to a GC (BuildingConnected,
    PlanHub, A&B, RKA, iSqFt / ConstructConnect, Dodge, other plan rooms, a GC's invitation). Residential / insurance
    leads: no badge. Not sure: no badge (never a guess).
  * ONE rule: netlify/functions/_lib/bid-role.js. This patch inlines that file word for word (window._gcBidRoleCore)
    plus tools/primesub_client.js (window._gcPrimeSub: the memo per lead id + updatedAt, the badge, the menu, the save).
    The server stamps item.bidRole when a bid comes in (bid-inbox upsert: e-mail, public bid watcher, BuildingConnected,
    partner API); the Lead Inbox copies it onto the lead. A lead without it is worked out on screen (nothing re-saved).
  * Leads board cards, List rows and the lead's page, and the Bids tab (Lead Inbox) cards: the badge. An admin or an
    estimator taps it: Prime / Sub / No badge / Automatic, saved on that lead (bidRole, bidRoleManual, bidRoleBy).
  * A "Prime & sub" filter with counts next to Source / Type on Leads, and on the Bids tab.
Every find-string must occur exactly once (else nothing is written).
Usage: python3 tools/patch_PRIMESUB.py [index.html]
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
MARK = '__GC_PATCH_PRIMESUB__'
src = open(path, encoding='utf-8').read()
if MARK in src:
    print('PRIMESUB: already patched'); sys.exit(0)
core = open(os.path.join(ROOT, 'netlify', 'functions', '_lib', 'bid-role.js'), encoding='utf-8').read()
client = open(os.path.join(HERE, 'primesub_client.js'), encoding='utf-8').read()
assert '</script' not in core and '</script' not in client
def once(s, old, new, label):
    n = s.count(old); assert n == 1, ('PRIMESUB: anchor count != 1', label, n)
    return s.replace(old, new)

# 0. the rule + the page side, before the Lead Inbox
src = once(src, '<script id="gc-patch-ld2">',
  '<script id="gc-patch-primesub">\n/* ' + MARK + ' (patch PRIMESUB) — netlify/functions/_lib/bid-role.js, inlined word for word: */\n'
  + '/* PRIMESUB-CORE-BEGIN */\n' + core + '/* PRIMESUB-CORE-END */\n' + client + '</script>\n<script id="gc-patch-ld2">', 'script')

# ── the Lead Inbox (Bids tab) ──
src = once(src, "var UI = Object.assign({ src: '', type: '', due: '', show: 'new', open: true }, lsGet(K_UI, {}));",
  "var UI = Object.assign({ src: '', type: '', due: '', show: 'new', open: true, role: '' }, lsGet(K_UI, {}));   /* patch PRIMESUB: role */", 'ldi ui')
src = once(src, "  l.source = s(it.source) || 'Lead Inbox'; l.leadKind = KIND[low(it.type)] || 'Commercial';",
  "  l.source = s(it.source) || 'Lead Inbox'; l.leadKind = KIND[low(it.type)] || 'Commercial';\n"
  "  if (it.bidRole && !l.bidRoleManual) { l.bidRole = s(it.bidRole); l.bidRoleWhy = s(it.bidRoleWhy); }   /* patch PRIMESUB: the server's prime / sub (a person's choice stays) */", 'fromItem')
src = once(src, "return { subject: e.subject, from: e.from, date: e.date, rawRef: e.rawRef }; }).slice(-10);",
  "return { subject: e.subject, from: e.from, fromName: e.fromName, date: e.date, rawRef: e.rawRef }; }).slice(-10);   /* patch PRIMESUB: + who sent it */", 'emails')
src = once(src, "  if (UI.type) all = all.filter(function(l){ return kindOf(l) === UI.type; });",
  "  if (UI.type) all = all.filter(function(l){ return kindOf(l) === UI.type; });\n"
  "  if (UI.role && window._gcPrimeSub) all = all.filter(function(l){ var r = window._gcPrimeSub.of(l); return UI.role === 'unset' ? !r && !isRs(l) && typeof window._gcIsBidLead === 'function' && !!window._gcIsBidLead(l) : r === UI.role; });   /* patch PRIMESUB */", 'ldi filter')
src = once(src, "['Commercial', 'Insurance', 'Residential', 'Government'].map(function(x){ return opt(x, x, UI.type); }).join('') + '</select>'",
  "['Commercial', 'Insurance', 'Residential', 'Government'].map(function(x){ return opt(x, x, UI.type); }).join('') + '</select>'\n"
  "      + (window._gcPrimeSub ? (function(){ var rc = { prime: 0, sub: 0, unset: 0 }, P = window._gcPrimeSub; inboxLeads().forEach(function(l){ if (UI.show === 'new' ? !isNew(l) : UI.show === 'assigned' ? isNew(l) : false) return; var r = P.of(l); if (r) rc[r]++; else if (!isRs(l) && typeof window._gcIsBidLead === 'function' && window._gcIsBidLead(l)) rc.unset++; });   /* patch PRIMESUB */\n"
  "          return '<select data-f=\"role\" aria-label=\"Prime or sub\">' + opt('', 'Prime & sub', UI.role) + opt('prime', '🏛 Prime: to the owner (' + rc.prime + ')', UI.role) + opt('sub', '🔧 Sub: to a GC (' + rc.sub + ')', UI.role) + opt('unset', '❔ Not marked (' + rc.unset + ')', UI.role) + '</select>'; })() : '')", 'ldi select')
src = once(src, "<div class=\"tags\"><span class=\"tg t-src\">' + esc(srcOf(l)) + '</span>",
  "<div class=\"tags\">' + (window._gcPrimeSub ? window._gcPrimeSub.badge(l) : '') + '<span class=\"tg t-src\">' + esc(srcOf(l)) + '</span>", 'ldi card')
src = once(src, "  reminders: reminders, count: newCount, refresh: function(){ return pull(true); },",
  "  reminders: reminders, count: newCount, refresh: function(){ return pull(true); },\n"
  "  repaint: function(){ return readList('_setLeads').then(function(){ LDI_FORCE = true; render(); }); },   /* patch PRIMESUB: after a prime / sub tap */", 'ldi api')

# ── the Leads hub (Board · List · the lead's page) ──
src = once(src, "function needsPrio(l){ return !shut(l) && !prioOf(l); }",
  "function needsPrio(l){ return !shut(l) && !prioOf(l); }\n"
  "/* patch PRIMESUB: 🏛 PRIME / 🔧 SUB (window._gcPrimeSub: remembered per lead id + updatedAt) */\n"
  "function roleOfL(l){ try { return W._gcPrimeSub ? W._gcPrimeSub.of(l) : ''; } catch (e) { return ''; } }\n"
  "function roleChip(l, o){ try { return W._gcPrimeSub ? W._gcPrimeSub.badge(l, o) : ''; } catch (e) { return ''; } }", 'hub fns')
src = once(src, "if (UI.type && typesOf(l).indexOf(TYPE_OLD[UI.type] || UI.type) < 0) return false;",
  "if (UI.type && typesOf(l).indexOf(TYPE_OLD[UI.type] || UI.type) < 0) return false;\n"
  "    if (UI.role) { var rr = roleOfL(l); if (UI.role === 'unset' ? (rr || !isBidL(l)) : rr !== UI.role) return false; }   /* patch PRIMESUB */", 'hub filter')
src = once(src, "base0.forEach(function(l){ var k = srcCanon(l); sc[k] = (sc[k] || 0) + 1; typesOf(l).forEach(function(x){ tc[x] = (tc[x] || 0) + 1; }); });",
  "var rc = { prime: 0, sub: 0, unset: 0 };   /* patch PRIMESUB */\n"
  "  base0.forEach(function(l){ var k = srcCanon(l); sc[k] = (sc[k] || 0) + 1; typesOf(l).forEach(function(x){ tc[x] = (tc[x] || 0) + 1; }); var r0 = roleOfL(l); if (r0) rc[r0]++; else if (isBidL(l)) rc.unset++; });", 'hub counts')
src = once(src, "UI.type, 'All types') + '</select>'",
  "UI.type, 'All types') + '</select>'\n"
  "      + '<select data-gcl-f=\"role\" aria-label=\"Prime or sub\" title=\"🏛 Prime: we bid to the owner (city, county, school, state, federal). 🔧 Sub: we bid to a GC (BuildingConnected, PlanHub, plan rooms).\">' + optionsFor([{ v: 'prime', t: '🏛 Prime: to the owner (' + rc.prime + ')' }, { v: 'sub', t: '🔧 Sub: to a GC (' + rc.sub + ')' }, { v: 'unset', t: '❔ Bid, not marked (' + rc.unset + ')' }], UI.role, 'Prime & sub') + '</select>'   /* patch PRIMESUB */", 'hub select')
src = once(src, "    + prioChip(l) + dueChip(l) + speedChip(l) + (pl.files.length",
  "    + roleChip(l) + prioChip(l) + dueChip(l) + speedChip(l) + (pl.files.length", 'hub card')
src = once(src, "'<b>' + srcIc(l) + ' ' + esc(s(l.name || l.title) || 'Lead') + '</b><div style=\"font-size:11px;color:#666\">'",
  "'<b>' + srcIc(l) + ' ' + esc(s(l.name || l.title) || 'Lead') + '</b> ' + roleChip(l) + '<div style=\"font-size:11px;color:#666\">'", 'hub row')
src = once(src, "    + (l.lostReason ? '<div class=\"note\">Lost because: '",
  "    + (function(){ var rcp = roleChip(l, { always: isBidL(l) }); if (!rcp) return ''; var inf = W._gcPrimeSub.info(l);   /* patch PRIMESUB: the lead's page */\n"
  "        return '<div class=\"row gcl-role-row\"><span class=\"kv\"><span>Prime / sub:</span></span> ' + rcp + ' <span class=\"note\">' + esc(inf.role ? inf.why : 'not marked yet') + (W._gcPrimeSub.can() ? ' · tap to change' : '') + '</span></div>'; })()\n"
  "    + (l.lostReason ? '<div class=\"note\">Lost because: '", 'hub drawer')
src = once(src, "closed: UI.closed, preset: UI.preset, exp: UI.exp, prio: UI.prio }); }",
  "closed: UI.closed, preset: UI.preset, exp: UI.exp, prio: UI.prio, role: UI.role }); }   /* patch PRIMESUB: role */", 'hub save')
src = once(src, "un: false, closed: false, preset: 'all', prio: '' });",
  "un: false, closed: false, preset: 'all', prio: '', role: '' });", 'hub reset')
src = once(src, "exp: !!U.exp, prio: /^(hi|md|lo|none)$/.test(U.prio) ? U.prio : '' };",
  "exp: !!U.exp, prio: /^(hi|md|lo|none)$/.test(U.prio) ? U.prio : '', role: /^(prime|sub|unset)$/.test(U.role) ? U.role : '' };", 'hub load')
open(path, 'w', encoding='utf-8').write(src)
print('PRIMESUB: patched', path)
