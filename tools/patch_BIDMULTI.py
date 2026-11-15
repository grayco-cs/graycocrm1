#!/usr/bin/env python3
"""patch BIDMULTI (owner's sub portal plan, 11/15 list item 5.2): several subs per trade bid on a job; each sees the reviewed trade scope
(words only), plans, the due date and "Submit my bid"; the PM compares per trade and awards one → Awarded + the PO; the others see a polite
"Not selected" with no prices. Most of it was there (SUBBIDS p-bidjobs / p-bid-save, BIDEST 📊 Bids by trade, BIDSCOPE compare,
AWARDFLOW Not selected). This adds:
  · the sub's bid form: the trade they are bidding (one of the job's trades), What is included / Not included, files (PDF / photos,
    up to 5, through the portal's own upload) — saved on the bid (trade, inclusions, exclusions, docs); the CRM's compare reads them;
  · the award carries the job's PO (bid-hub op award po → awardPo): the awarded sub sees "PO T801 — use it on every receipt and invoice";
    the CRM puts the awarded sub on the linked job (Awarded) so it shows under 🔨 Jobs I'm on — the award is the person's decision;
  · "Not selected" says thank you, politely, with no prices.
Idempotent. Usage: python3 tools/patch_BIDMULTI.py [repo-root]"""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
R = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(here)
def edit(fn, pairs):
    p = os.path.join(R, fn); src = open(p, encoding='utf-8').read(); n0 = src
    for o, n in pairs:
        if n in src: continue
        assert src.count(o) == 1, (fn, src.count(o), o[:90]); src = src.replace(o, n)
    if src != n0: open(p, 'w', encoding='utf-8').write(src)
PA = 'netlify/functions/portal-access.js'
edit(PA, [
    ("function myBidOut(b){ return b ? { lines:",
     "function myBidOut(b){ return b ? { trade: clip(b.trade, 80), inclusions: clip(b.inclusions, 4000), exclusions: clip(b.exclusions, 4000), notesOwn: clip(b.notesOwn != null ? b.notesOwn : b.notes, 4000), files: arr(b.docs).filter(function(f){ return f && f.name; }).map(function(f){ return { name: clip(f.name, 160) }; }).slice(0, 10), lines:"),   # patch BIDMULTI
    ("  return { at: s(b.acceptedAt).slice(0, 25), pm: {",
     "  return { po: clip(b.awardPo, 30), at: s(b.acceptedAt).slice(0, 25), pm: {"),   # patch BIDMULTI: the PO
    ("  if (Array.isArray(body.lines)) rec.lines = body.lines.slice(0, 80)",
     "  /* patch BIDMULTI: the trade they bid (one of the job's trades, else theirs), what is included / not included, their files */\n"
     "  { const job = sc.jobs[jobId] && sc.jobs[jobId].data || {}, sought = (Array.isArray(job.tradesSought) ? job.tradesSought : s(job.tradesSought).split(/\\s*,\\s*/)).map(function(x){ return s(x && typeof x === 'object' ? x.trade : x); }).filter(Boolean), mineT = Array.isArray(c.profile.trades) ? c.profile.trades.map(s) : [];\n"
     "    const want = clip(body.trade, 80), pick = sought.concat(mineT).find(function(x){ return low(x) === low(want); });\n"
     "    if (want && !pick) throw Fail(400, 'Pick one of the trades GrayCo asked for on this job.');\n"
     "    rec.trade = pick || s(prev && prev.trade) || (sought.find(function(x){ return mineT.some(function(m){ return low(m) === low(x); }); }) || '');\n"
     "    rec.inclusions = clip(body.inclusions, 4000); rec.exclusions = clip(body.exclusions, 4000); rec.notesOwn = clip(body.notes, 4000);\n"
     "    if (rec.inclusions) rec.scope = rec.inclusions;\n"
     "    rec.notes = clip([rec.notesOwn, rec.exclusions ? 'Not included: ' + rec.exclusions : ''].filter(Boolean).join('\\n'), 4000);\n"
     "    const up = await uploadsOf(sub, body.uploadIds, null);\n"
     "    if (up.length) rec.docs = arr(rec.docs).concat(up.map(function(f){ return { name: clip(f.name, 160), ref: s(f.ref), type: s(f.type), size: f.size }; })).slice(-10); }\n"
     "  if (Array.isArray(body.lines)) rec.lines = body.lines.slice(0, 80)"),
])
edit('netlify/functions/bid-hub.js', [
    ("  const pm = pmOf(b, who), exclusions = cleanList(b.exclusions), wantMail = on && b.mail !== false;",
     "  const pm = pmOf(b, who), exclusions = cleanList(b.exclusions), wantMail = on && b.mail !== false;\n"
     "  const awardPo = on ? s(b.po).toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 30) : '';   /* patch BIDMULTI: the job's PO for the awarded sub */"),
    ("      if (on) { x.awardPm = pm; x.awardExclusions = exclusions; } if (out.mail.sent) x.awardMailedAt = at; hit = x; return l; });",
     "      if (on) { x.awardPm = pm; x.awardExclusions = exclusions; x.awardPo = awardPo; } if (out.mail.sent) x.awardMailedAt = at; hit = x; return l; });"),
    ("            on ? { accepted: true, rejected: false, acceptedAt: at, acceptedBy: who.email, awardPm: pm, awardExclusions: exclusions } : { accepted: false, acceptedAt: '' }, { updatedAt: at });",
     "            on ? { accepted: true, rejected: false, acceptedAt: at, acceptedBy: who.email, awardPm: pm, awardExclusions: exclusions, awardPo: awardPo } : { accepted: false, acceptedAt: '' }, { updatedAt: at });"),
    ("    const bid = Object.assign({}, d, on ? { accepted: true, rejected: false, acceptedAt: at, acceptedBy: who.email, awardPm: pm, awardExclusions: exclusions } : { accepted: false, acceptedAt: '' }, out.mail.sent ? { awardMailedAt: at } : {});",
     "    const bid = Object.assign({}, d, on ? { accepted: true, rejected: false, acceptedAt: at, acceptedBy: who.email, awardPm: pm, awardExclusions: exclusions, awardPo: awardPo } : { accepted: false, acceptedAt: '', awardPo: '' }, out.mail.sent ? { awardMailedAt: at } : {});"),
])
edit('netlify/functions/subportal.js', [
    ("        if (Array.isArray(x.lines)) b.lines = bidLines(x.lines, sc.jobs[jobId] && sc.jobs[jobId].data);",
     "        ['trade', 'inclusions', 'exclusions', 'notesOwn'].forEach(function(k){ if (x[k] !== undefined) b[k] = s(x[k]).slice(0, k === 'trade' ? 80 : 4000); });   /* patch BIDMULTI: the sub portal's bid form (the bid site's own page leaves them as they are) */\n"
     "        if (Array.isArray(x.lines)) b.lines = bidLines(x.lines, sc.jobs[jobId] && sc.jobs[jobId].data);"),
])
AP = 'portal-app.js'
edit(AP, [
    ("bidDecided: 'GrayCo has decided on this bid — it can no longer be changed.'",
     "bidDecided: 'GrayCo has decided on this bid — it can no longer be changed.', bidThanks: 'Thank you for bidding. GrayCo went with another bid for this trade this time. We hope you will bid on the next one.', bidTrade: 'Trade you are bidding', bidIncl: 'What is included', bidExcl: 'Not included', bidFiles: 'Your bid files (PDF or photos)', bidPo: 'Your PO for this job', bidPoHow: 'Use it at the supply house and on every receipt and invoice.'"),
    ("bidDecided: 'GrayCo ya decidió sobre esta oferta — ya no se puede cambiar.'",
     "bidDecided: 'GrayCo ya decidió sobre esta oferta — ya no se puede cambiar.', bidThanks: 'Gracias por su oferta. Esta vez GrayCo escogió otra oferta para este oficio. Esperamos que oferte en el próximo.', bidTrade: 'Oficio que oferta', bidIncl: 'Qué incluye', bidExcl: 'Qué no incluye', bidFiles: 'Archivos de su oferta (PDF o fotos)', bidPo: 'Su PO para este trabajo', bidPoHow: 'Úselo en el proveedor y en cada recibo y factura.'"),
    ("      h('p', { text: t('bidAwardNext') }),",
     "      aw.po ? h('div', { class: 'box', 'data-bidpo': '1' }, [h('b', { text: t('bidPo') + ': ' + aw.po }), h('div', { class: 'muted', text: t('bidPoHow') })]) : null,   /* patch BIDMULTI */\n      h('p', { text: t('bidAwardNext') }),"),
    ("  if (decided) sec.push(h('div', { class: 'how', text: t('bidDecided') }));",
     "  if (b && b.status === 'rejected') sec.push(h('div', { class: 'how', 'data-bidthanks': '1', text: t('bidThanks') }));   /* patch BIDMULTI: polite, no prices */\n  else if (decided) sec.push(h('div', { class: 'how', text: t('bidDecided') }));"),
    ("    if (b) { amt.value = String(b.amount); nt.value = b.notes || ''; }",
     "    /* patch BIDMULTI: the trade, what is included / not included, files */\n"
     "    var trs = String(j.tradesSought || '').split(/\\s*,\\s*/).filter(Boolean), myT = ((D.me || {}).trades || []);\n"
     "    var trSel = h('select', { class: 'inp', id: 'bidTrade', disabled: blocked }, trs.map(function(x){ return h('option', { value: x, text: x }); }));\n"
     "    var defT = (b && b.trade) || trs.filter(function(x){ return myT.some(function(m){ return String(m).toLowerCase() === x.toLowerCase(); }); })[0] || trs[0] || ''; if (defT) trSel.value = defT;\n"
     "    var inc = h('textarea', { class: 'inp', id: 'bidIncl', rows: '3', maxlength: '4000', disabled: blocked }), exc = h('textarea', { class: 'inp', id: 'bidExcl', rows: '3', maxlength: '4000', disabled: blocked });\n"
     "    var bfiles = h('input', { class: 'inp', id: 'bidFiles', type: 'file', multiple: 'multiple', accept: 'application/pdf,image/*', disabled: blocked });\n"
     "    if (b) { amt.value = String(b.amount); nt.value = (b.notesOwn != null ? b.notesOwn : b.notes) || ''; inc.value = b.inclusions || ''; exc.value = b.exclusions || ''; }"),
    ("      .concat([field(t('bidNotes'), nt), err, go])));",
     "      .concat((trs.length > 1 ? [field(t('bidTrade'), trSel)] : []).concat([field(t('bidIncl'), inc), field(t('bidExcl'), exc), field(t('bidFiles') + (b && (b.files || []).length ? ' — ' + b.files.map(function(f){ return f.name; }).join(', ') : ''), bfiles)]))   /* patch BIDMULTI */\n"
     "      .concat([field(t('bidNotes'), nt), err, go])));"),
    ("      api('p-bid-save', { jobId: j.id, amount: amt.value, notes: nt.value, lines: lineIn.map(function(l){ return { id: l.x.id, amount: l.i.value === '' ? null : l.i.value }; }) }).then(function(r){",
     "      [].slice.call(bfiles.files || []).slice(0, 5).reduce(function(p, f){ return p.then(function(ids){ return upload(f, 'bid').then(function(u){ ids.push(u.id); return ids; }); }); }, Promise.resolve([]))   /* patch BIDMULTI */\n"
     "      .then(function(ids){ return api('p-bid-save', { jobId: j.id, amount: amt.value, notes: nt.value, trade: trSel.value || '', inclusions: inc.value, exclusions: exc.value, uploadIds: ids, lines: lineIn.map(function(l){ return { id: l.x.id, amount: l.i.value === '' ? null : l.i.value }; }) }); }).then(function(r){"),
])
# the CRM: the award carries the job's PO; the awarded sub goes on the linked job (Awarded)
edit('index.html', [
    ("  return fn('bid-hub', { op: 'award', jobId: UI.jobId, source: b.source, id: b.id, on: true, trade: s(b.trade), mail: mail, mailAgain: again, notifyOthers: notify, pm: C.pm, exclusions: ask, note: noteTxt }).then(function(r){",
     "  var poJ = C.pid ? (W._crm && W._crm.projects || []).filter(function(p){ return p && String(p.id) === String(C.pid); })[0] : null;   /* patch BIDMULTI */\n"
     "  return fn('bid-hub', { op: 'award', jobId: UI.jobId, source: b.source, id: b.id, on: true, trade: s(b.trade), mail: mail, mailAgain: again, notifyOthers: notify, pm: C.pm, exclusions: ask, note: noteTxt, po: poJ ? s(poJ.autoPO || poJ.po) : '' }).then(function(r){\n"
     "    try { if (C.pid && r && r.ok !== false && W._gcSubConfirm && W._gcSubConfirm.addBid) W._gcSubConfirm.addBid(C.pid, b); } catch (e) {}   /* patch BIDMULTI: the awarded sub on the job */"),
])
print('BIDMULTI applied')
