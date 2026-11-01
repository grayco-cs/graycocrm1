// netlify/functions/_lib/claimhelp.js — patch CLAIMHELP: "🛡 Your insurance claim" in the customer portal.
//
// Owner: "I like insurance claims steps as a default for how customers can deal with their insurance claim and
// insurance agent. Have where we can add to this as we go as the admin, but have some default easy questions and
// answers for them on their portal."
//
// What the customer gets (only on an insurance / restoration / mitigation job whose feature "Insurance claim help
// steps" is on — job.features.claimHelp; ON by default for those jobs, and when job.features is missing the job type
// decides):
//   · the claim steps in plain words — what YOU do and what GRAYCO does at each one — with "You are here" on the step
//     staff set on the job (project.claimHelp.step) and the short note staff wrote for the customer (claimHelp.note);
//   · the claim number, date of loss and the adjuster's name / phone when staff entered them (never the insurance
//     carrier's name — owner rule: "your insurance company");
//   · "Questions & answers" and "Ask us a question" (the portal's messages);
//   · the footer "General information, not legal or insurance advice."
//
// LEGAL CARE (owner, for the lawyer review with the lien rules and the Maintenance Agreement): Tennessee and many states
// restrict contractors from acting as public adjusters and from waiving or rebating deductibles. Every default answer
// says GrayCo documents the damage, meets the adjuster to show it, provides estimates and communicates the scope of the
// repair work; it does NOT negotiate the claim for the homeowner, does NOT promise coverage, and does NOT waive, rebate
// or absorb deductibles; coverage / legal questions go to the insurance company, the agent or a licensed professional.
// The default text is marked "DRAFT — for lawyer review" in the CRM's admin editor only (never in the portal).
//
// Storage: ONE gc_kv key, "gc_claim_help" = { draft, published, savedAt, savedBy, publishedAt, publishedBy }.
// Staff (admins) write it through portal.js action 'claimhelp'; the portal reads ONLY `published` (GrayCo's defaults
// until an admin publishes for the first time).
'use strict';

const KEY = 'gc_claim_help';
const OFFICE_PHONE = '901-585-0944';
const CLAIMS_EMAIL = 'claims@grayco-cs.com';
const FOOTER = 'General information, not legal or insurance advice. For questions about your coverage or your rights, ask your insurance company or agent, or a licensed professional.';
const TITLE = '🛡 Your insurance claim';
const LAWYER_NOTE = 'DRAFT — for lawyer review';
const LIMITS = { steps: 30, qa: 60, title: 90, you: 800, us: 800, q: 180, a: 1600, intro: 700, note: 400 };

function s(v){ return v == null ? '' : String(v).trim(); }
function low(v){ return s(v).toLowerCase(); }
function clip(v, n){ const t = s(v).replace(/\r\n?/g, '\n'); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function arr(v){ return Array.isArray(v) ? v.filter(function(x){ return x && typeof x === 'object'; }) : []; }
function ymd(v){
  if (!v) return '';
  const t = s(v); if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t); return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}

/* ── GrayCo's defaults (DRAFT — for lawyer review) ─────────────────────────────────────────────────────── */
const DEFAULT_INTRO = 'How an insurance claim usually goes, what you do at each step, and what GrayCo does. Your insurance company makes every decision about your claim and your coverage.';
const DEFAULT_STEPS = [
  { id: 'filed', title: 'Claim filed',
    you: 'Report the damage to your insurance company or agent (by phone, their app or their website) and write down your claim number. Please give us the claim number. Keep receipts for anything you spend to protect your home.',
    us: 'We document the damage with photos and notes. If you ask us to, we make emergency repairs to stop more damage (for example a tarp, board-up, or water removal and drying).' },
  { id: 'adj_sched', title: 'Adjuster inspection scheduled',
    you: 'Your insurance company assigns an adjuster, who contacts you to set up a visit. Tell us the date and time.',
    us: 'If you ask us to, we come to the inspection to show the adjuster the damage we documented and answer questions about what we found.' },
  { id: 'inspected', title: 'Inspection done',
    you: 'Nothing to do right now. Your insurance company reviews what the adjuster saw. Questions about what your policy covers go to your insurance company or agent.',
    us: 'We write our estimate of the repairs and share it and our photos with you. With your OK, we can send them to your insurance company.' },
  { id: 'scope', title: 'Estimate / scope received',
    you: 'Your insurance company sends you its estimate (the “scope” of what it will pay for). Please share a copy with us.',
    us: 'We compare their scope with the damage we documented and explain, in plain words, any differences we see in the repair work. Decisions about your claim are between you and your insurance company.' },
  { id: 'supplement', title: 'Supplement (if needed)', optional: true,
    you: 'If damage was missed, or more is found once work starts, a “supplement” asks your insurance company to review the added items. We will ask for your OK first.',
    us: 'We document the added damage with photos and a line-item estimate and, with your OK, send that documentation to your insurance company for its review. Your insurance company decides what it covers.' },
  { id: 'approved', title: 'Approved',
    you: 'Your insurance company approves the claim and usually sends a first payment. If your mortgage company is on the check, it must sign too. Sign your contract with us when you are ready to go ahead.',
    us: 'We go over the approved scope with you, confirm materials and colors, and give you a written price for anything extra you choose that insurance does not cover.' },
  { id: 'scheduled', title: 'Work scheduled',
    you: 'Clear the work area and tell us about pets, parking and anything else we should know. Your deductible is yours to pay — it is part of your job price and due when your contract says.',
    us: 'We order materials, set your start date, and post updates and photos here.' },
  { id: 'complete', title: 'Work complete',
    you: 'Walk the job with your Project Manager. When everything is done, sign the certificate of completion.',
    us: 'We give you the completion papers and your final invoice. With your OK, we send the completion papers to your insurance company so it can review releasing any depreciation it held back.' },
  { id: 'final', title: 'Final paperwork / depreciation released',
    you: 'If your insurance company held back depreciation, it may release it now. Sign any checks (with your mortgage company if it is on them) and pay your final invoice.',
    us: 'Once you have paid in full we send your lien waiver and warranty, and close out the job. Your warranty is under Documents.' }
];
const DEFAULT_QA = [
  { id: 'first', q: 'What should I do first after damage?',
    a: 'Make sure everyone is safe. If you can do it safely, take steps to prevent more damage (for example shut off the water, put out buckets, cover openings) — most policies expect you to. Take photos and video before anything is cleaned up or thrown away. Report the damage to your insurance company or agent and write down your claim number. Need emergency help? Call GrayCo at ' + OFFICE_PHONE + '.' },
  { id: 'choose', q: 'Do I have to use the contractor my insurance company suggests?',
    a: 'In most cases you choose your own contractor. Your policy explains your options — if you are not sure, ask your insurance company or agent.' },
  { id: 'adjuster', q: 'What does the adjuster do?',
    a: 'The adjuster works for, or is hired by, your insurance company. They inspect the damage, look at your policy and write your insurance company’s estimate. Your insurance company — not GrayCo — decides what the claim pays.' },
  { id: 'be_there', q: 'Should I be there for the inspection?',
    a: 'Yes, if you can. You know your home best and can point out damage and answer questions. If you ask us to, we will try to be there too, to show the adjuster the damage we documented.' },
  { id: 'agent', q: 'Should I talk to my insurance agent or the adjuster?',
    a: 'Your agent sold you the policy and can help with questions about your coverage and how to file. The adjuster handles this claim: the inspection, the estimate and the payments. For questions about what is covered, ask your insurance company or agent. GrayCo can answer questions about the damage and the repairs.' },
  { id: 'deductible', q: 'What is a deductible and when do I pay it?',
    a: 'Your deductible is the part of the loss you pay under your policy — your insurance company subtracts it from what it pays. You are responsible for your deductible. It is part of your job price, and you pay it to GrayCo when your contract says it is due. GrayCo does not waive, rebate or absorb deductibles.' },
  { id: 'no_waive', q: 'Will GrayCo pay or cover my deductible?',
    a: 'No. You are responsible for your deductible, and GrayCo does not waive, rebate, discount or absorb it in any way. Be careful of any contractor who offers to.' },
  { id: 'depreciation', q: 'What is depreciation / recoverable depreciation?',
    a: 'Depreciation is the value your insurance company takes off for age and wear. Many policies pay the “actual cash value” first (the repair cost minus depreciation) and hold back the depreciation. If your policy has “recoverable depreciation”, you may get that money after the work is done and the completion papers are sent. Whether yours is recoverable depends on your policy — ask your insurance company or agent.' },
  { id: 'supplement', q: 'What’s a supplement?',
    a: 'A supplement asks your insurance company to review damage or costs that were not in its first estimate — often things found once work starts, or items that were missed. We document the added items with photos and an estimate and, with your OK, send that documentation to your insurance company. Your insurance company decides whether to approve it.' },
  { id: 'how_long', q: 'How long does a claim take?',
    a: 'It varies. Many claims take a few weeks from the inspection to approval, a supplement can add one to three weeks, and depreciation is often released a few weeks after the work is done. Your insurance company sets its own timelines. We move the “You are here” marker on this page as things happen.' },
  { id: 'denied', q: 'What if my claim is denied or the payment seems too low?',
    a: 'Ask your insurance company to explain its decision in writing. You can ask it to review the decision and give it more information, such as our photos and estimate. For help disputing a claim, talk with your insurance agent, a licensed public adjuster or an attorney; you can also contact the Tennessee Department of Commerce & Insurance. GrayCo can give you our documentation and answer questions about the damage, but we do not negotiate your claim for you.' },
  { id: 'negotiate', q: 'Does GrayCo deal with my insurance company for me?',
    a: 'GrayCo is a contractor, not a public adjuster or an attorney. We document the damage, meet the adjuster to show it, write estimates and explain the scope of the repair work. We do not negotiate your claim or make decisions about it for you, and we cannot promise what your insurance will cover. Your claim is between you and your insurance company.' },
  { id: 'photos', q: 'What photos and records should I keep?',
    a: 'Photos and video of all the damage before cleanup — wide shots and close-ups, inside and outside. Receipts for emergency repairs, hotel stays and anything you buy because of the damage. Every letter and e-mail from your insurance company. GrayCo’s photos of your job are under Photos.' },
  { id: 'before_adjuster', q: 'Can repairs start before the adjuster comes?',
    a: 'Emergency steps to prevent more damage — a tarp, board-up, or water removal and drying (mitigation) — usually should not wait, and most policies expect you to take them. Take photos first and keep receipts. Permanent repairs usually wait until your insurance company has inspected; ask your insurance company if you are not sure. If you sign for emergency or mitigation work with GrayCo, you are responsible for paying for it whatever your insurance decides.' },
  { id: 'check', q: 'Who is the check made out to? Why is my mortgage company on it?',
    a: 'Insurance checks are often made out to you, and also to your mortgage company if you have one. Everyone named on a check has to sign it. Call your mortgage company’s “loss draft” or insurance claims department early — they may ask for papers or an inspection first. We can give you the papers about the work that they ask for.' },
  { id: 'paperwork', q: 'What paperwork will I need to sign?',
    a: 'Usually: your contract or work authorization with GrayCo, change orders for anything added, and a certificate of completion when the work is done — sometimes also your mortgage company’s forms. Your insurance company may send its own forms. Read everything before you sign and ask us about anything in our papers. You can sign GrayCo papers here in the portal.' },
  { id: 'upgrades', q: 'What if I want upgrades or work insurance does not cover?',
    a: 'Your insurance company pays for what your policy covers. For upgrades or extra work you choose, we give you a written price first and you pay for them yourself. They are shown separately under Payments.' },
  { id: 'reach', q: 'How do I reach GrayCo?',
    a: 'Tap “Ask us a question” below to send us a message here, call ' + OFFICE_PHONE + ', or e-mail ' + CLAIMS_EMAIL + '. Your Project Manager’s phone and e-mail are on your Home page.' }
];
function defaults(){
  return { v: 1, intro: DEFAULT_INTRO,
    steps: DEFAULT_STEPS.map(function(x){ return Object.assign({ hidden: false, optional: false }, x); }),
    qa: DEFAULT_QA.map(function(x){ return Object.assign({ hidden: false }, x); }) };
}
/* the default text of an item (for the editor's "DRAFT — for lawyer review" tag) */
function defaultOf(kind, id){
  const l = kind === 'step' ? DEFAULT_STEPS : DEFAULT_QA;
  return l.find(function(x){ return x.id === id; }) || null;
}
function isDefaultText(kind, item){
  const d = defaultOf(kind, item && item.id); if (!d) return false;
  return kind === 'step' ? (s(item.title) === d.title && s(item.you) === d.you && s(item.us) === d.us) : (s(item.q) === d.q && s(item.a) === d.a);
}

/* ── clean what an admin sends (never trust the page) ─────────────────────────────────────────────────── */
function idOf(v, used, pre){
  let id = low(v).replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  if (!id || used[id]) { let n = 1; const base = id || pre; do { id = (base + '_' + (n++)).slice(0, 44); } while (used[id]); }
  used[id] = 1; return id;
}
function clean(c){
  c = c && typeof c === 'object' ? c : {};
  const usedS = {}, usedQ = {};
  const steps = arr(c.steps).slice(0, LIMITS.steps).map(function(x){
    return { id: idOf(x.id, usedS, 'step'), title: clip(x.title, LIMITS.title), you: clip(x.you, LIMITS.you), us: clip(x.us, LIMITS.us), optional: x.optional === true, hidden: x.hidden === true };
  }).filter(function(x){ return x.title; });
  const qa = arr(c.qa).slice(0, LIMITS.qa).map(function(x){
    return { id: idOf(x.id, usedQ, 'qa'), q: clip(x.q, LIMITS.q), a: clip(x.a, LIMITS.a), hidden: x.hidden === true };
  }).filter(function(x){ return x.q && x.a; });
  return { v: 1, intro: clip(c.intro, LIMITS.intro), steps: steps, qa: qa };
}
/* what the portal shows: the published version, GrayCo's defaults until an admin publishes */
function publishedOf(store){
  const st = store && typeof store === 'object' ? store : null;
  if (st && st.published && typeof st.published === 'object' && arr(st.published.steps).length) return clean(st.published);
  return defaults();
}

/* ── which jobs ───────────────────────────────────────────────────────────────────────────────────────── */
const INS_TYPE = /insurance|restoration|mitigation|water\s*damage|fire\s*damage|smoke\s*damage|storm\s*damage|flood|mold\s*remediation|\bclaim\b/i;
function claimOf(data, pid){ return arr(data && data.gc_claims).find(function(c){ return c.deleted !== true && s(c.projectId) === s(pid); }) || null; }
/* an insurance / restoration / mitigation job */
function insuranceType(p, data){
  if (!p) return false;
  if (p.isInsurance === true) return true;
  if (p.isInsurance === false) return false;   /* ruled out by hand on the job — final, as everywhere in the CRM */
  if (INS_TYPE.test([p.type, p.jobType, p.jobTypeLabel].filter(function(v){ return typeof v === 'string'; }).join(' '))) return true;
  return !!(s(p.claimNumber) || s(p.claimNo) || claimOf(data, p.id));
}
/* job.features (per-job customer features, patch ESTPDF's branch): { claimHelp: true | false } or a list of the ones on.
   Missing → the job type decides (ON for insurance-type jobs). */
function featureSetting(p){
  const f = p && p.features;
  if (Array.isArray(f)) return f.map(low).indexOf('claimhelp') >= 0;
  if (f && typeof f === 'object') {
    for (const k of ['claimHelp', 'insuranceClaimHelp', 'claim_help']) if (typeof f[k] === 'boolean') return f[k];
    const x = f.claimHelp; if (x && typeof x === 'object' && typeof x.on === 'boolean') return x.on;
  }
  return null;
}
function eligible(p, data){
  if (!p || p.deleted === true) return false;
  if (!insuranceType(p, data)) return false;
  const f = featureSetting(p);
  return f == null ? true : f;
}

/* ── the customer's view ──────────────────────────────────────────────────────────────────────────────── */
/* INSP's automatic claim timeline (portal.js INS_STEPS index) → the closest default step, used only until staff set one */
const AUTO_FROM_INSP = ['filed', 'filed', 'adj_sched', 'scope', 'supplement', 'scheduled', 'scheduled', 'complete', 'final', 'final'];
function jobState(p){ const c = p && p.claimHelp; return c && typeof c === 'object' ? c : {}; }
function adjusterOf(p, c){
  if (p.portalShowAdjuster === false || jobState(p).hideAdjuster === true) return null;
  const ca = c && c.adjuster && typeof c.adjuster === 'object' ? c.adjuster : {};
  const pa = p.adjuster && typeof p.adjuster === 'object' ? p.adjuster : {};
  const name = clip(ca.name || p.adjusterName || (typeof p.adjuster === 'string' ? p.adjuster : pa.name), 60);
  const phone = clip(ca.phone || p.adjusterPhone || pa.phone, 40);
  return name || phone ? { name: name, phone: phone } : null;
}
/* opts: { inspNow: number (INSP's automatic step, when the job has the insurance view), words: [carrier names …] } */
function view(content, p, data, opts){
  opts = opts || {};
  const C = clean(content);
  const st = jobState(p);
  const steps = C.steps.filter(function(x){ return !x.hidden; });
  let now = -1, auto = false;
  if (s(st.step)) now = steps.findIndex(function(x){ return x.id === s(st.step); });
  if (now < 0 && !s(st.step) && typeof opts.inspNow === 'number' && AUTO_FROM_INSP[opts.inspNow]) {
    now = steps.findIndex(function(x){ return x.id === AUTO_FROM_INSP[opts.inspNow]; }); auto = now >= 0;
  }
  const c = claimOf(data, p.id) || {};
  const out = {
    title: TITLE,
    intro: C.intro,
    steps: steps.map(function(x, i){ return { id: x.id, title: x.title, you: x.you, us: x.us, optional: x.optional || undefined, state: now < 0 ? 'todo' : (i < now ? 'done' : (i === now ? 'now' : 'todo')) }; }),
    now: now, nowTitle: now >= 0 ? steps[now].title : '', auto: auto || undefined,
    note: clip(st.note, LIMITS.note), noteAt: s(st.note) ? ymd(st.noteAt || st.at) : '',
    claim: {
      number: clip(c.claimNumber || p.claimNumber || p.claimNo, 40),
      dateOfLoss: ymd(c.dateOfLoss || p.dateOfLoss || p.lossDate),
      adjuster: adjusterOf(p, c)
    },
    qa: C.qa.filter(function(x){ return !x.hidden; }).map(function(x){ return { q: x.q, a: x.a }; }),
    footer: FOOTER,
    contact: { phone: OFFICE_PHONE, email: CLAIMS_EMAIL }
  };
  return scrubWords(out, opts.words || []);
}
/* every carrier / adjusting-company name → "your insurance company" (whole words only, so a name never eats a word) */
function scrubWords(obj, words){
  const res = (words || []).map(function(w){
    if (w instanceof RegExp) return { re: new RegExp(w.source, w.flags.indexOf('g') >= 0 ? w.flags : w.flags + 'g'), rep: 'your insurance company' };
    const t = s(w); if (t.length < 3) return null;
    return { re: new RegExp('(^|[^A-Za-z0-9])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + '(?![A-Za-z0-9])', 'gi'), rep: '$1your insurance company' };
  }).filter(Boolean);
  if (!res.length) return obj;
  (function walk(o){
    Object.keys(o).forEach(function(k){
      const v = o[k];
      if (typeof v === 'string') { let t = v; res.forEach(function(x){ x.re.lastIndex = 0; t = t.replace(x.re, x.rep); }); o[k] = t; }
      else if (v && typeof v === 'object') walk(v);
    });
  })(obj);
  return obj;
}
/* the short portal post for "Tell the customer" (✅ Approvals — never sent by itself) */
function noticeText(content, p, step, note){
  const C = clean(content), x = C.steps.find(function(y){ return y.id === s(step) && !y.hidden; });
  if (!x) return '';
  const lines = ['Update on your insurance claim: ' + x.title + '.'];
  if (s(note)) lines.push(clip(note, LIMITS.note));
  lines.push('See “Your insurance claim” on your Home page for what you do next and what GrayCo does. Questions? Message us here or call ' + OFFICE_PHONE + '.');
  return lines.join('\n');
}
/* the editor's view of the store */
function forEditor(store){
  const st = store && typeof store === 'object' ? store : {};
  const draft = st.draft && arr(st.draft.steps).length ? clean(st.draft) : (st.published && arr(st.published.steps).length ? clean(st.published) : defaults());
  const pub = publishedOf(st);
  const mark = function(c){
    c.steps.forEach(function(x){ x.lawyerDraft = isDefaultText('step', x); x.isDefault = !!defaultOf('step', x.id); });
    c.qa.forEach(function(x){ x.lawyerDraft = isDefaultText('qa', x); x.isDefault = !!defaultOf('qa', x.id); });
    c.introDraft = s(c.intro) === DEFAULT_INTRO; return c;
  };
  return { draft: mark(draft), published: pub, publishedIsDefault: !(st.published && arr(st.published.steps).length),
    savedAt: s(st.savedAt), savedBy: s(st.savedBy), publishedAt: s(st.publishedAt), publishedBy: s(st.publishedBy),
    unpublished: JSON.stringify(clean(draft)) !== JSON.stringify(pub), lawyerNote: LAWYER_NOTE, footer: FOOTER };
}

module.exports = { KEY, TITLE, FOOTER, LAWYER_NOTE, LIMITS, DEFAULT_STEPS, DEFAULT_QA, DEFAULT_INTRO, defaults, clean, publishedOf,
  insuranceType, featureSetting, eligible, view, scrubWords, noticeText, forEditor, isDefaultText, AUTO_FROM_INSP };
