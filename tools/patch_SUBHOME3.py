#!/usr/bin/env python3
"""patch SUBHOME3 (owner 11/5: subs "can see jobs they need to bid and jobs they have for sure and jobs they are on").
The sub portal home (portal-app.js) splits "Your jobs" into three:
  📝 To bid — the bid-site card (invites) on top of the jobs;
  🔨 Jobs I'm on now — started (start date today or earlier, or work in progress / % done);
  ✅ Awarded / coming up — won, start date later or not set;
  ✔ Done — finished jobs (collapsed list).
Each job row shows its PO with 📋 Copy ("use this PO at Home Depot / Lowe's / the supply house").
Server: portal-access.js shows subs the CRM's pay rule (in by Wednesday → that Friday; SUBPAYWED)."""
import sys, os
R = sys.argv[1] if len(sys.argv) > 1 else '.'
def patch(fn, pairs, mark):
    p = os.path.join(R, fn); src = open(p, encoding='utf-8').read()
    if mark in src: print(fn, 'already patched'); return
    for o, n in pairs:
        assert src.count(o) == 1, (fn, src.count(o), o[:70]); src = src.replace(o, n)
    open(p, 'w', encoding='utf-8').write(src); print(fn, 'patched')
patch('portal-app.js', [
 ("    money: 'Money', submitted: 'Submitted', approvedM: 'Approved', paidMonth: 'Paid this month', yourJobs: 'Your jobs",
  "    toBid: '📝 To bid', jobsNow: '🔨 Jobs I\\'m on now', jobsNext: '✅ Awarded / coming up', jobsDone: '✔ Done', poHint: 'Use this PO at Home Depot, Lowe\\'s and the supply house so it lands on the right job.',\n    money: 'Money', submitted: 'Submitted', approvedM: 'Approved', paidMonth: 'Paid this month', yourJobs: 'Your jobs"),
 ("    money: 'Dinero', submitted: 'Enviado', approvedM: 'Aprobado', paidMonth: 'Pagado este mes', yourJobs: 'Sus trabaj",
  "    toBid: '📝 Para licitar', jobsNow: '🔨 Trabajos en curso', jobsNext: '✅ Adjudicados / próximos', jobsDone: '✔ Terminados', poHint: 'Use este PO en Home Depot, Lowe\\'s y el proveedor para que se cargue al trabajo correcto.',\n    money: 'Dinero', submitted: 'Enviado', approvedM: 'Aprobado', paidMonth: 'Pagado este mes', yourJobs: 'Sus trabaj"),
 ("  out.push(card(t('yourJobs'), (v.jobs || []).length ? v.jobs.map(jobRow) : [h('div', { class: 'empty', text: t('noJobs') })]));\n  var bc = bidsCard(v.bids); if (bc) out.push(bc);",
  "  /* SUBHOME3: To bid · Jobs I'm on now · Awarded / coming up · Done */\n  var bc = bidsCard(v.bids); if (bc) out.push(bc);\n"
  "  var G = jobGroups(v.jobs || []);\n"
  "  if (!(v.jobs || []).length) out.push(card(t('yourJobs'), [h('div', { class: 'empty', text: t('noJobs') })]));\n"
  "  if (G.now.length) out.push(card(t('jobsNow'), G.now.map(jobRowPo), 'jobs-now'));\n"
  "  if (G.next.length) out.push(card(t('jobsNext'), G.next.map(jobRowPo), 'jobs-next'));\n"
  "  if (G.done.length) out.push(card(t('jobsDone'), [h('details', null, [h('summary', { text: G.done.length + ' ' + t('jobsDone').replace(/^\\W+/, '') })].concat(G.done.map(jobRow)))], 'jobs-done'));"),
 ("function jobsTab(){", 
  "function jobGroups(list){\n  var today = todayYmd(), G = { now: [], next: [], done: [] };\n  list.forEach(function(j){ var st = String(j.status || '').toLowerCase();\n    if (/complete|done|closed|finished|paid/.test(st) || (j.end && j.end < today && (j.pct || 0) >= 100)) G.done.push(j);\n    else if ((j.start && j.start <= today) || (j.pct || 0) > 0 || /progress|active|started|working/.test(st)) G.now.push(j);\n    else G.next.push(j); });\n  return G;\n}\nfunction jobRowPo(j){ var row = jobRow(j); if (!j.po) return row; return h('div', { class: 'jobrow-po' }, [row, h('div', { class: 'muted', style: 'margin:2px 0 8px 4px' }, [poRow(j.po), ' ', h('span', { text: t('poHint') })])]); }\nfunction jobsTab(){"),
], 'SUBHOME3')
patch('netlify/functions/portal-access.js', [
 ("  const pay = new Date(cut); pay.setUTCDate(cut.getUTCDate() + 2 + 7);",
  "  const pay = new Date(cut); pay.setUTCDate(cut.getUTCDate() + 2);   /* SUBHOME3 / SUBPAYWED: in by Wednesday → that Friday */"),
], 'SUBHOME3')
# portal.html loads portal-app.js?v=… — bumped to 33.168-subhome3 so phones fetch the new file (done by sed on 11/8)
