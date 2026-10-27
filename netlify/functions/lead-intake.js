// netlify/functions/lead-intake.js
//
// GrayCo — leads posted straight into the CRM by a lead source, and contacted
// before anybody has looked at them.  Build 33.107
//
//   "i am getting leads from a company called roofing ignite, they want an api
//    key to send me leads directly to the crm … these jobs have to have an
//    automatic text or reach out to within 5 minutes"
//
// WHY THE OUTREACH HAPPENS HERE AND NOT IN THE CRM.
// The CRM is a page in a browser. If the first message were sent from there it
// would only go out while somebody had the tab open — evenings, weekends and
// Sunday afternoons, which is exactly when a roofing lead comes in and exactly
// when five minutes matters. This runs on Netlify the moment the lead is
// posted, so the customer hears from GrayCo in seconds whether or not a single
// person is logged in.
//
// ENV VARS (set on Netlify → Site settings → Environment variables):
//   LEAD_KEY_<COMPANY>   ONE PER COMPANY. The company's name comes from the
//                        variable name, so LEAD_KEY_CONTRACTOR_CONNECTION is
//                        "Contractor Connection". Give each company only its own
//                        key: then we know who sent each lead, one can be turned
//                        off without touching the others, and a leak is one
//                        company's problem instead of everybody's.
//                          LEAD_KEY_ROOF_IGNITE
//                          LEAD_KEY_CONTRACTOR_CONNECTION
//                          LEAD_KEY_ALACRITY
//                          LEAD_KEY_SEDGWICK
//   LEAD_INSURANCE_SOURCES  comma list of the ones that send claims work, e.g.
//                        "Contractor Connection,Alacrity,Sedgwick". Insurance
//                        work is scored differently in the commission split.
//   ROOFING_IGNITE_KEY   still accepted, as Roof Ignite.
//   CRM_DRAIN_TOKEN      lets the CRM collect new leads. Paste it into the CRM
//                        once, per computer. NOT one of the keys above.
//   RESEND_API_KEY       already set — the email goes out through it.
//   SUPABASE_URL / SUPABASE_SERVICE_KEY   already set — where leads wait.
//   GRAYCO_CONTACT_NAME  / GRAYCO_CONTACT_PHONE   optional: who the email introduces when the lead has no
//                        PM yet. Otherwise it is the lead's PM, else the Senior PM (Admin → Employees),
//                        else "one of our project managers" (patch PMG — no person is named in code).
//   LEAD_INTAKE_ALERTS=0 no "New lead" e-mail to the admins (patch LA; on by default —
//                        the same alert as the bid inbox, _lib/bid-alerts.js)
//
// ENDPOINTS
//   POST /.netlify/functions/lead-intake         header x-api-key: <key>
//   GET  /.netlify/functions/lead-intake?drain=1 header x-crm-token: <token>
//   GET  /.netlify/functions/lead-intake?ping=1  (no auth — says it is alive)

require('./_lib/pause').install();   /* patch PAUSE: data-entry mode — every outbound send is checked here first */
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_URL   = 'https://api.resend.com/emails';
const TABLE        = 'ri_pending_leads';

const CONTACT_NAME  = process.env.GRAYCO_CONTACT_NAME  || '';
const CONTACT_PHONE = process.env.GRAYCO_CONTACT_PHONE || '';

/* ── little helpers ──────────────────────────────────────────────────────── */
const J = (code, obj, extra) => ({
  statusCode: code,
  headers: Object.assign({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-crm-token, authorization',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Cache-Control': 'no-store'
  }, extra || {}),
  body: JSON.stringify(obj)
});

const s = v => (v == null ? '' : String(v)).trim();
const low = v => s(v).toLowerCase();

/* Compare secrets without leaking their length or contents through timing. */
function sameSecret(a, b) {
  const x = Buffer.from(s(a)), y = Buffer.from(s(b));
  if (!x.length || !y.length || x.length !== y.length) return false;
  try { return crypto.timingSafeEqual(x, y); } catch { return false; }
}

function sb(path, opts) {
  return fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    }
  }, opts || {}));
}

/* US numbers, tidied for display. Anything unexpected is left exactly as sent
   rather than mangled into something that cannot be dialled. */
function tidyPhone(v) {
  const d = s(v).replace(/[^\d]/g, '');
  if (d.length === 10) return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  if (d.length === 11 && d[0] === '1') return '(' + d.slice(1, 4) + ') ' + d.slice(4, 7) + '-' + d.slice(7);
  return s(v);
}
function looksLikeEmail(v) { return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s(v)); }
function looksLikePhone(v) { const d = s(v).replace(/[^\d]/g, ''); return d.length >= 10 && d.length <= 15; }

const esc = v => s(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ── what they send us, in whatever shape they send it ───────────────────────
   A lead source names its fields however it likes, and the names change without
   warning. Every reasonable spelling is accepted so a renamed field downgrades
   to "that one detail is missing" instead of losing the whole lead. Anything we
   do not recognise is kept verbatim under `raw`, so nothing they sent is ever
   thrown away. */
function pick(b, names) {
  for (const n of names) {
    if (b[n] != null && s(b[n]) !== '') return s(b[n]);
    const hit = Object.keys(b).find(k => low(k).replace(/[_\s-]/g, '') === n.replace(/[_\s-]/g, ''));
    if (hit && s(b[hit]) !== '') return s(b[hit]);
  }
  return '';
}

function readLead(b) {
  b = (b && typeof b === 'object') ? b : {};
  if (b.lead && typeof b.lead === 'object') b = Object.assign({}, b, b.lead);
  if (b.data && typeof b.data === 'object') b = Object.assign({}, b, b.data);

  const first = pick(b, ['first_name', 'firstname', 'fname']);
  const last  = pick(b, ['last_name', 'lastname', 'lname', 'surname']);
  let name    = pick(b, ['name', 'full_name', 'fullname', 'customer_name', 'contact_name', 'homeowner']);
  if (!name) name = [first, last].filter(Boolean).join(' ').trim();

  const addr  = pick(b, ['address', 'street', 'street_address', 'address1', 'addr']);
  const city  = pick(b, ['city', 'town']);
  const state = pick(b, ['state', 'region', 'province']);
  const zip   = pick(b, ['zip', 'zipcode', 'postal_code', 'postcode']);
  const full  = [addr, [city, state].filter(Boolean).join(', '), zip].filter(Boolean).join(' ').trim();

  return {
    externalId: pick(b, ['id', 'lead_id', 'leadid', 'external_id', 'reference', 'ref']),
    name,
    phone: pick(b, ['phone', 'phone_number', 'phonenumber', 'mobile', 'cell', 'telephone', 'tel']),
    email: pick(b, ['email', 'email_address', 'emailaddress']),
    address: full || addr,
    city, state, zip,
    jobType: pick(b, ['job_type', 'jobtype', 'service', 'service_type', 'type', 'trade', 'category']),
    notes: pick(b, ['notes', 'note', 'description', 'details', 'message', 'comments']),
    consent: pick(b, ['consent', 'tcpa', 'tcpa_consent', 'opt_in', 'optin']),
    assignedTo: pick(b, LEAD_ASSIGN_FIELDS),
    raw: b
  };
}

/* ── the email ───────────────────────────────────────────────────────────────
   From GrayCo, introducing the lead's PM (else the Senior PM, else "one of our
   project managers") and their number, saying they will be in touch and asking
   them to reply — which is what turns a bought lead into a conversation, and
   gives the PM something to work with when they call.  (patch PMG) */
function firstEmail(lead, contact) {
  contact = contact || {};
  const who = s(contact.name) || CONTACT_NAME;
  const tel = tidyPhone(s(contact.phone) || (who && who === CONTACT_NAME ? CONTACT_PHONE : '') || (!who ? CONTACT_PHONE : ''));
  const hi = lead.name ? ('Hi ' + esc(lead.name.split(/\s+/)[0]) + ',') : 'Hello,';
  const what = lead.jobType ? esc(lead.jobType.toLowerCase()) : 'your roof';
  const whoH = who ? esc(who) : 'One of our project managers';
  const line = tel
    ? (whoH + ' handles our estimates and you can reach them directly at <b>' + esc(tel) + '</b>.')
    : (whoH + ' handles our estimates and will be in touch from this address.');

  const text =
    hi.replace(/<[^>]+>/g, '') + '\n\n' +
    'Thanks for your interest in getting ' + what.replace(/<[^>]+>/g, '') + ' looked at. ' +
    'This is GrayCo Construction Services — we received your details and wanted to reach out right away.\n\n' +
    (who || 'One of our project managers') + ' handles our estimates' + (tel ? (' and you can reach them directly at ' + tel) : '') + '. ' +
    'We will be reaching out to you as soon as possible.\n\n' +
    'If you reply to this email with a good time to reach you, we will work around it.\n\n' +
    'GrayCo Construction Services\nTN License #85034 BCB · AR License #0486990627 · MS License #27769\noffice@grayco-cs.com';

  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.55;max-width:560px">'
    + '<p>' + hi + '</p>'
    + '<p>Thanks for your interest in getting ' + what + ' looked at. This is <b>GrayCo Construction '
    + 'Services</b> — we have your details and wanted to reach out right away.</p>'
    + '<p>' + line + ' We will be reaching out to you as soon as possible.</p>'
    + '<p><b>If you reply to this email with a good time to reach you, we will work around it.</b></p>'
    + '<p style="margin-top:22px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:12px;color:#666">'
    + 'GrayCo Construction Services<br>TN License #85034 BCB · AR License #0486990627 · MS License #27769<br>'
    + 'office@grayco-cs.com</p></div>';

  return {
    subject: 'GrayCo Construction — ' + (who || 'we') + ' will be reaching out',
    html, text
  };
}

/* Owner rule (20 Oct 2026): no automatic e-mail or text goes to a customer without approval. The first
   e-mail to a new lead waits on the shared approvals list (gc_approval_queue, the CRM's "✅ Approvals"):
   the person the lead is assigned to approves it (the lead source's assigned_to / rep field, or
   LEAD_ASSIGN_TO on Netlify); a lead nobody is assigned to goes to the admins (Wesley, Nick).
   PORTAL_AUTO_EMAIL=1 turns automatic sending back on, as for the portal's e-mails. */
const LEAD_ASSIGN_FIELDS = ['assigned_to', 'assignedto', 'assignee', 'assigned', 'rep', 'sales_rep', 'salesrep', 'salesperson', 'project_manager', 'pm', 'estimator'];
/* patch PMG: who the first e-mail introduces — the lead's PM, else the Senior PM (Admin → Employees), else nobody by name */
async function contactFor(pm) {
  try {
    if (pm && s(pm.name) && s(pm.email)) return { name: s(pm.name), phone: s(pm.phone) };
    if (CONTACT_NAME) return { name: CONTACT_NAME, phone: CONTACT_PHONE };
    const h = await require('./portal.js')._core.seniorPm();
    return h ? { name: s(h.name), phone: s(h.phone || h.cell || h.mobile) } : {};
  } catch (e) { return CONTACT_NAME ? { name: CONTACT_NAME, phone: CONTACT_PHONE } : {}; }
}
async function queueFirstEmail(lead) {
  if (!looksLikeEmail(lead.email)) return { sent: false, why: 'no usable email address on the lead' };
  try {
    const core = require('./portal.js')._core;
    const who = s(lead.assignedTo) || s(process.env.LEAD_ASSIGN_TO);
    const pm = who ? await core.pmByName(who) : null;
    const msg = firstEmail(lead, await contactFor(pm));
    const ok = await core.queueApproval({ id: 'appr_lead_' + lead.id, kind: 'lead_first_contact', pid: lead.id, jobName: 'New lead — ' + lead.name + (lead.leadSource ? ' (' + lead.leadSource + ')' : ''),
      pm: pm, to: lead.email, subject: msg.subject, html: msg.html, attachments: [], meta: { leadId: lead.id, leadSource: lead.leadSource || '', phone: lead.phone || '', address: lead.address || '' } });
    return ok ? { sent: false, queued: true, why: 'waiting for approval (' + (pm ? pm.name : 'admins') + ')' } : { sent: false, why: 'could not put it on the approvals list' };
  } catch (e) { return { sent: false, why: 'could not put it on the approvals list' }; }
}
async function sendEmail(lead) {
  if (process.env.PORTAL_AUTO_EMAIL !== '1') return queueFirstEmail(lead);
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, why: 'RESEND_API_KEY is not set on Netlify' };
  if (!looksLikeEmail(lead.email)) return { sent: false, why: 'no usable email address on the lead' };
  let pm0 = null; try { const who = s(lead.assignedTo) || s(process.env.LEAD_ASSIGN_TO); pm0 = who ? await require('./portal.js')._core.pmByName(who) : null; } catch (e) {}
  const msg = firstEmail(lead, await contactFor(pm0));
  try {
    const r = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'GrayCo Construction Services <office@grayco-cs.com>',
        to: [lead.email],
        reply_to: (String(process.env.REPLY_TO_ADMIN || '').trim() || 'replies@grayco-cs.com'),
        subject: msg.subject,
        html: msg.html,
        text: msg.text
      })
    });
    if (!r.ok) return { sent: false, why: 'Resend returned ' + r.status };
    return { sent: true, at: new Date().toISOString(), to: lead.email };
  } catch (e) {
    return { sent: false, why: 'could not reach Resend' };
  }
}

/* SMS is deliberately not wired to a provider yet — there is no account and US
   business texting needs carrier registration first. The step exists so that
   turning it on later is credentials and one function, not a redesign. */
async function sendText(lead) {
  /* when texting is built it must queue for approval like the e-mail (owner rule), never send by itself */
  if (!process.env.SMS_PROVIDER) {
    return { sent: false, why: 'no SMS provider configured yet — email only' };
  }
  return { sent: false, why: 'SMS provider set but not implemented' };
}

/* Every LEAD_KEY_* variable is a company. The name comes from the variable:
   LEAD_KEY_CONTRACTOR_CONNECTION → "Contractor Connection". Compared in constant
   time, and ALL of them are checked every time so a wrong key cannot be told
   apart from an unknown one by how long the answer took. */
function titleCase(v) {
  return s(v).toLowerCase().split(/[_\s]+/).filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function whoSent(given) {
  const env = process.env;
  let any = false, name = '';
  Object.keys(env).forEach(k => {
    let label = '';
    if (k === 'ROOFING_IGNITE_KEY') label = 'Roof Ignite';
    else if (k.indexOf('LEAD_KEY_') === 0) label = titleCase(k.slice(9));
    else return;
    if (!s(env[k])) return;
    any = true;
    if (sameSecret(given, env[k]) && !name) name = label;   /* no early exit */
  });
  return { any, name };
}
/* Claims networks send insurance work, and insurance work is scored differently
   in the commission split. Set LEAD_INSURANCE_SOURCES to the ones that are, e.g.
   "Contractor Connection,Alacrity,Sedgwick". */
function isInsuranceSource(name) {
  const list = s(process.env.LEAD_INSURANCE_SOURCES).split(',')
    .map(x => low(x)).filter(Boolean);
  return list.indexOf(low(name)) >= 0;
}

/* ── patch LA: the admins' "new lead" alert (netlify/functions/_lib/bid-alerts.js) ── */
async function alertAdmins(record){
  if (process.env.LEAD_INTAKE_ALERTS === '0') return { off: true };
  const L = require('./bid-inbox.js')._lib;
  if (!L.dbReady()) return { why: 'database not configured' };
  const ad = String(record.address || ''), where = record.city && ad.toLowerCase().indexOf(String(record.city).toLowerCase()) >= 0 ? ad : [ad, record.city, record.state].filter(Boolean).join(', ');
  return L.alertsApi().notifyNew([{ id: 'intake:' + record.id, key: record.id, title: record.name + (where ? ' — ' + where : ''), source: record.leadSource,
    type: record.isInsurance ? 'insurance' : (record.jobType || 'residential'), city: record.city, state: record.state, bidDue: '',
    detail: [record.phone, record.email, record.jobType, record.contacted ? 'first e-mail sent to the customer' : ''].filter(Boolean).join(' · ') }], { source: record.leadSource });
}

/* ── the handler ─────────────────────────────────────────────────────────── */
exports.handler = async function (event) {
 try { await require('./_lib/brand.js').addressReady(); } catch (e) {}   /* patch ADDRALL: the saved company address before anything is made */
  if (event.httpMethod === 'OPTIONS') return J(200, {});

  const h = {};
  Object.keys(event.headers || {}).forEach(k => { h[low(k)] = event.headers[k]; });
  const qs = event.queryStringParameters || {};

  /* alive? Useful for Roofing Ignite to check the URL before they wire it up.
     Says nothing about keys or data. */
  if (event.httpMethod === 'GET' && (qs.ping === '1' || qs.ping === 'true')) {
    return J(200, { ok: true, service: 'GrayCo lead intake', ready: whoSent('').any });
  }

  /* the CRM collecting what has arrived */
  if (event.httpMethod === 'GET' && (qs.drain === '1' || qs.drain === 'true')) {
    const want = process.env.CRM_DRAIN_TOKEN;
    if (!want) return J(500, { error: 'CRM_DRAIN_TOKEN is not set on Netlify.' });
    if (!sameSecret(h['x-crm-token'], want)) return J(401, { error: 'Not authorised.' });
    if (!SUPABASE_URL || !SUPABASE_KEY) return J(500, { error: 'Supabase is not configured.' });
    try {
      const r = await sb(TABLE + '?select=id,lead,created_at&order=created_at.asc&limit=200');
      if (!r.ok) return J(502, { error: 'Could not read pending leads (' + r.status + ').' });
      const rows = await r.json();
      if (!Array.isArray(rows) || !rows.length) return J(200, { leads: [] });
      const ids = rows.map(x => x.id);
      /* handed over exactly once: deleted only after they are in hand */
      try {
        await sb(TABLE + '?id=in.(' + ids.join(',') + ')', {
          method: 'DELETE',
          headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, Prefer: 'return=minimal' }
        });
      } catch (e) {}
      return J(200, { leads: rows.map(x => x.lead) });
    } catch (e) {
      return J(502, { error: 'Could not read pending leads.' });
    }
  }

  if (event.httpMethod !== 'POST') return J(405, { error: 'Method not allowed' });

  /* WHICH COMPANY IS THIS?
     One key shared by four lead sources would mean we could not tell who sent
     what, could not switch one off without breaking the others, and every lead
     would carry the wrong lead source. So each company gets its OWN key, as its
     own environment variable named LEAD_KEY_<COMPANY>, and the one that matches
     is who it came from. Adding a fifth company is one new variable and nothing
     else. ROOFING_IGNITE_KEY still works, as Roof Ignite. */
  const bearer = s(h.authorization).replace(/^Bearer\s+/i, '');
  const given = s(h['x-api-key']) || bearer;
  const source = whoSent(given);
  if (!source.any) return J(500, { error: 'Lead intake is not switched on yet (no keys set on the server).' });
  if (!source.name) return J(401, { error: 'Not authorised. Check the API key.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return J(400, { error: 'Body must be JSON.' }); }

  const lead = readLead(body);
  const warnings = [];

  if (!lead.name) return J(400, { error: 'A customer name is required.', field: 'name' });

  /* "they will have to make sure all contacts and email are in the lead" —
     so a missing one is called out plainly, in the reply they get, naming the
     field. But the lead is still taken: a lead we cannot auto-contact is worth
     far more than a lead we never heard about. */
  if (!looksLikePhone(lead.phone)) {
    warnings.push(lead.phone
      ? 'phone "' + lead.phone + '" does not look like a usable number — send 10 digits'
      : 'no phone number on this lead — GrayCo needs one to call the customer');
  }
  if (!looksLikeEmail(lead.email)) {
    warnings.push(lead.email
      ? 'email "' + lead.email + '" is not a valid address'
      : 'no email address on this lead — the automatic first contact could not be sent');
  }
  if (!lead.address) warnings.push('no property address on this lead');

  const record = {
    id: 'RI' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    externalId: lead.externalId,
    name: lead.name,
    phone: tidyPhone(lead.phone),
    phoneRaw: lead.phone,
    email: lead.email,
    address: lead.address,
    city: lead.city, state: lead.state, zip: lead.zip,
    jobType: lead.jobType,
    notes: lead.notes,
    consent: lead.consent,
    assignedTo: lead.assignedTo,
    leadSource: source.name,
    isInsurance: isInsuranceSource(source.name),
    receivedAt: new Date().toISOString(),
    complete: warnings.length === 0,
    warnings,
    raw: lead.raw
  };

  /* reach out now — this is the five minutes */
  const email = await sendEmail(record);
  const text  = await sendText(record);
  record.outreach = { email, text };
  record.contacted = !!email.sent;

  /* park it for the CRM. If Supabase is unreachable we still say what happened
     to the customer, and we tell them plainly that it is not filed yet, rather
     than returning a cheerful 200 over a lead nobody will ever see. */
  let stored = false, storeWhy = '';
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const r = await sb(TABLE, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json', Prefer: 'return=minimal'
        },
        body: JSON.stringify({ lead: record, ext_id: record.externalId || '', created_at: record.receivedAt })
      });
      stored = r.ok;
      if (!r.ok) storeWhy = 'database returned ' + r.status;
    } catch (e) { storeWhy = 'could not reach the database'; }
  } else {
    storeWhy = 'Supabase is not configured';
  }

  /* patch LA: the admins hear about it now — one e-mail (+ phone push), with "Bid due date: NOT FOUND — add it"
     until someone puts the date on the lead. Never holds up or fails the reply to the lead source. */
  try { await alertAdmins(record); } catch (e) {}

  return J(stored ? 200 : 202, {
    ok: true,
    stored,
    receivedFrom: source.name,
    leadId: record.id,
    customerContacted: record.contacted,
    contactedBy: record.contacted ? ['email'] : [],
    firstEmail: record.outreach.email.queued ? 'waiting for GrayCo to approve it' : (record.contacted ? 'sent' : 'not sent'),
    warnings,
    note: stored
      ? 'Lead received and filed. GrayCo will follow up.'
      : ('Lead received and the customer was contacted, but it is not filed yet (' + storeWhy + '). Please re-send if you do not hear back.')
  });
};
exports._t = { firstEmail, contactFor };   /* tests (patch PMG) */
/* patch LOGOALL (owner 10/23: "should have our logo on it"): every customer / sub / GC e-mail this file sends
   straight to Resend gets the GrayCo shell (centered logo, office line, licenses). Internal @grayco-cs.com mail is untouched. */
try { require('./_lib/brand.js').installResend(); } catch (e) {}
