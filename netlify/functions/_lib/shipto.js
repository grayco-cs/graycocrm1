/* ============================================================================
   GrayCo — THE JOB ON A VENDOR'S INVOICE: SHIP-TO / JOB / DELIVER-TO (patch SHIPTO, with INVMAIL).   netlify/functions/_lib/shipto.js

   Owner (11/13): "match invoices from companies for job address like on ABC."
   A supplier's invoice (ABC Supply, Farrell-Calhoun, Home Depot Pro, Beacon, 84 Lumber …) prints several addresses: the vendor's own
   (letterhead / remit to), GrayCo's (bill to / sold to) and the JOB's (ship to / job site / deliver to / job name / PO). Before, the
   reader took the FIRST street address in the text — often the vendor's or GrayCo's. Now every address is found with the label it sits
   under, GrayCo's own office address is never the job, and _lib/subinv.js analyze() tries each one against the CRM's jobs (house number +
   street name + suffix, the ZIP when both have one, the PO, the job name), preferring the label this vendor's job address sat under before
   (learned from the vendor's invoices already booked on a job — a person's 🧾 Match this invoice pick counts too).
   Pure text work: no new dependencies (the PDF text comes from subinv.pdfText / docx / xlsx, the same reader as before).
   ========================================================================== */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function arr(v){ return Array.isArray(v) ? v : []; }
function SI(){ return require('./subinv.js'); }

const GOOD = [
  [/\bship(?:ped|ping)?[\s-]*to\b/i, 'ship to'], [/\bdeliver(?:y|ed)?\s*(?:to|address|location|site)\b/i, 'deliver to'], [/\bdeliver(?:y|ed)?\s*:/i, 'deliver to'],
  [/\bjob\s*-?\s*site\b|\bjobsite\b/i, 'job site'], [/\bjob\s*(?:address|location|addr)\b/i, 'job address'], [/\bjob\s*(?:name|description|desc)\b/i, 'job name'],
  [/\bproject\s*(?:address|location|site)\b/i, 'project address'], [/\bproject\s*(?:name)?\s*:/i, 'project'], [/\bsite\s*address\b/i, 'site address'],
  [/\bservice\s*(?:address|location)\b/i, 'service address'], [/\bproperty(?:\s*address)?\s*:/i, 'property'], [/\bcustomer\s*job\b/i, 'job name'],
  [/\bjob\s*(?:#|no\.?|number)?\s*:/i, 'job'], [/\blocation\s*:/i, 'location']
];
const BAD = [
  [/\bbill(?:ed)?[\s-]*to\b/i, 'bill to'], [/\bsold[\s-]*to\b/i, 'sold to'], [/\bremit(?:tance)?(?:\s*(?:payment\s*)?to|\s*address)?\b/i, 'remit to'],
  [/\bmail\s*(?:payments?\s*)?to\b/i, 'remit to'], [/\binvoice\s*to\b/i, 'bill to'], [/\bcustomer\s*(?:address|info)\b/i, 'bill to'], [/\b(?:branch|corporate|home)\s*office\b/i, 'vendor']
];
const STREET_G = /\b(\d{2,6})\s+((?:[NSEW]\.?\s+)?[A-Za-z0-9][A-Za-z0-9'.-]*(?:\s+[A-Za-z0-9'.-]+){0,3}?)\s+(cove|cv|drive|dr|street|st|road|rd|lane|ln|avenue|ave|av|boulevard|blvd|court|ct|circle|cir|place|pl|parkway|pkwy|highway|hwy|trail|trl|terrace|ter|way|loop|pass|run|square|sq|point|pt|pike)\b\.?/gi;
const ZIP = /\b([A-Za-z][A-Za-z .'-]{1,30}?),?\s+(TN|MS|AR|AL|GA|KY|MO|LA|TX|FL|IL|IN|OH|NC|SC|VA)\.?\s+(\d{5})(?:-\d{4})?\b/;
/* GrayCo's own addresses (never the job): the company address (brand.js defaults / GC_OWN_ADDRESSES) */
function ours(){
  let def = []; try { const B = require('./brand.js'); const c = B.BRAND && B.BRAND.address; if (c) def.push(c); } catch (e) {}
  def = def.concat(['5796 Ferguson Rd, Bartlett, TN 38134', '4007 Broadway Rd'], s(process.env.GC_OWN_ADDRESSES).split(';').filter(Boolean));
  const keys = {}; def.forEach(function(a){ const p = SI().addrParts(a); if (p) keys[p.key] = 1; }); return keys;
}
function zipOf(t){ const m = ZIP.exec(s(t)); return m ? { zip: m[3], city: low(m[1]).replace(/^.*\b(?:suite|ste|unit|apt)\b.*?\s/, '').trim() } : null; }
function labelsIn(line){
  const out = [];
  GOOD.forEach(function(g){ const m = g[0].exec(line); if (m) out.push({ at: m.index, end: m.index + m[0].length, label: g[1], kind: 'good' }); });
  BAD.forEach(function(g){ const m = g[0].exec(line); if (m) out.push({ at: m.index, end: m.index + m[0].length, label: g[1], kind: 'bad' }); });
  out.sort(function(a, b){ return a.at - b.at; });
  return out.filter(function(x, i){ return !out.slice(0, i).some(function(y){ return x.at < y.end; }); });   /* overlapping labels: the first */
}
/* every street address in the text, with the label it sits under: [{ address, key, zip, city, label, kind: good | bad | none | ours, line }]
   + jobName (a "Job name: …" / "Project: …" line that is not an address) */
function candidates(text){
  const lines = s(text).split('\n').map(function(l){ return l.replace(/\s+/g, ' ').trim(); }).filter(Boolean).slice(0, 400);
  const own = ours(), out = [], names = [];
  let queue = [], last = null;   /* labels seen with no address under them yet (a "BILL TO / SHIP TO" header row: in order) */
  lines.forEach(function(line, i){
    const labs = labelsIn(line);
    STREET_G.lastIndex = 0; let m; const found = [];
    while ((m = STREET_G.exec(line))) { if (/\bp\.?\s?o\.?\s+box\b/i.test(line.slice(Math.max(0, m.index - 12), m.index + m[0].length))) continue; found.push({ at: m.index, text: m[0].replace(/\.$/, '') }); }
    found.forEach(function(f){
      let lab = null;
      const before = labs.filter(function(l){ return l.end <= f.at; });
      if (before.length) lab = before[before.length - 1];
      else if (queue.length) lab = queue.shift();
      else if (last && i - last.line <= 6) lab = last;
      const p = SI().addrParts(f.text); if (!p) return;
      const zc = zipOf(line.slice(f.at)) || zipOf(lines[i + 1] || '') || zipOf(lines[i + 2] || '');
      const kind = own[p.key] ? 'ours' : lab ? lab.kind : (i < 3 ? 'letterhead' : 'none');
      if (out.some(function(x){ return x.key === p.key && x.label === (lab ? lab.label : ''); })) return;
      out.push({ address: f.text, key: p.key, zip: zc ? zc.zip : '', city: zc ? zc.city : '', label: lab ? lab.label : '', kind: kind, line: i });
      if (lab) last = { label: lab.label, kind: lab.kind, line: i };
    });
    /* labels on this line with nothing after them: their addresses come on the next lines */
    const tail = labs.filter(function(l){ return !found.some(function(f){ return f.at >= l.end; }); });
    if (tail.length) { queue = tail.map(function(l){ return { label: l.label, kind: l.kind, line: i }; }); last = queue[queue.length - 1]; }
    else if (found.length) queue = [];
    if (i - (last ? last.line : -99) > 6) { queue = []; last = null; }
    /* a job name / project name that is not an address */
    labs.filter(function(l){ return l.kind === 'good' && /job name|project|job$/.test(l.label); }).forEach(function(l){
      const v = s(line.slice(l.end)).replace(/^[:#\s-]+/, '');
      const w = v && !found.length ? v : (!v && lines[i + 1] && !STREET_G.test(lines[i + 1]) ? lines[i + 1] : ''); STREET_G.lastIndex = 0;
      if (w && /[a-z]{3}/i.test(w) && w.length <= 80 && !/^\d+$/.test(w)) names.push(w.replace(/\s{2,}.*$/, ''));
    });
  });
  return { list: out.slice(0, 12), jobName: names[0] || '' };
}
const RANK = { good: 0, read: 1, none: 2, letterhead: 4, bad: 5, ours: 9 };
/* the vendor's own pattern: which label its job address sat under on its invoices already booked on a job */
function vendorKey(read, sub, fromEmail){
  const n = SI().normName((sub && sub.conf >= 80 && sub.name) || (read && read.vendor) || '');
  if (n && n.length >= 3) return n;
  const d = low(fromEmail).split('@')[1] || ''; return /gmail|yahoo|hotmail|outlook|icloud|aol/.test(d) ? low(fromEmail) : d;
}
function template(key, mailList, data){
  if (!key) return null;
  const byMail = {};
  arr(data && data.invs).concat(arr(data && data.invoices), arr(data && data.expenses)).forEach(function(x){ if (x && (x.mailId || x.mmId) && s(x.pid)) byMail[s(x.mailId || x.mmId)] = s(x.pid); });
  const votes = {}; let n = 0;
  arr(mailList).forEach(function(r){
    if (!r || !r.si || !r.si.read || !arr(r.si.read.addrs).length) return;
    if (vendorKey(r.si.read, r.si.sub, r.si.fromEmail) !== key) return;
    const pid = byMail[s(r.id)] || (r.si.certain && r.si.job && s(r.si.job.pid)); if (!pid) return;
    const p = arr(data && data.projects).find(function(x){ return x && s(x.id) === pid; }); if (!p) return;
    const pa = SI().addrParts(s(p.address || p.jobAddress || p.siteAddress)); if (!pa) return;
    const hit = r.si.read.addrs.find(function(a){ const q = SI().addrParts(a.address); return q && q.num === pa.num && q.name === pa.name; });
    if (hit && hit.label) { votes[hit.label] = (votes[hit.label] || 0) + 1; n++; }
  });
  const best = Object.keys(votes).sort(function(a, b){ return votes[b] - votes[a]; })[0];
  return best ? { label: best, votes: votes[best], of: n } : null;
}
/* try every address (the AI's / the reader's own first, then each labelled one) against the jobs → the best match
   f = { read, text, projects, deleted, po, customer, hay, mailList, data, sub, fromEmail } → { jm, pick, cands, tpl } */
function bestJob(f){
  const C = candidates(f.text);
  const key = vendorKey(f.read, f.sub, f.fromEmail), tpl = template(key, f.mailList, f.data);
  const tries = [];
  if (s(f.read && f.read.jobAddress)) { const z = zipOf(f.read.jobAddress); tries.push({ address: s(f.read.jobAddress), zip: z ? z.zip : '', label: '', kind: 'read' }); }
  C.list.filter(function(c){ return c.kind !== 'ours'; }).forEach(function(c){
    const same = tries.find(function(t){ const p = SI().addrParts(t.address); return p && p.key === c.key && (t.label === c.label || t.kind === 'read'); });
    if (!same) tries.push(c);
    else if (same.kind === 'read' && RANK[c.kind] < RANK.read) Object.assign(same, { label: c.label, kind: c.kind, zip: same.zip || c.zip, line: c.line });   /* the reader's address IS this labelled one */
  });
  const customer = s(f.customer) || C.jobName;
  let pick = null; const sure = {};
  tries.forEach(function(t){
    const jm = SI().matchJob(f.projects, { jobAddress: t.address, zip: t.zip, po: f.po, customer: customer, hay: f.hay }, f.deleted);
    if (jm.certain && jm.best && RANK[t.kind] <= RANK.none) sure[jm.best.pid] = jm.best;
    const pref = (tpl && t.label === tpl.label ? -10 : 0) + (RANK[t.kind] != null ? RANK[t.kind] : 3);
    const sc = (jm.certain ? 1000 : 0) + (jm.best ? jm.best.conf : 0) * 2 - pref;
    if (!pick || sc > pick.sc) pick = { sc: sc, t: t, jm: jm };
  });
  if (!pick) pick = { t: null, jm: SI().matchJob(f.projects, { jobAddress: '', po: f.po, customer: customer, hay: f.hay }, f.deleted) };
  /* two labelled addresses on the paper, each certainly a DIFFERENT job, and nothing learned for this vendor yet: a person picks (one click) */
  const others = Object.keys(sure).filter(function(pid){ return !(pick.jm.best && pid === pick.jm.best.pid); });
  if (others.length && !(tpl && pick.t && pick.t.label === tpl.label)) {
    pick.jm = Object.assign({}, pick.jm, { certain: false, top: [pick.jm.best].concat(others.map(function(pid){ return sure[pid]; })).filter(Boolean).slice(0, 3), twoJobs: true });
  }
  return { jm: pick.jm, pick: pick.t, cands: C.list, jobName: C.jobName, tpl: tpl, vendorKey: key };
}
module.exports = { candidates, bestJob, template, vendorKey, zipOf, labelsIn };
