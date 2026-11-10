/* APPTTEXT (owner 11/10: "admins and PMs want a schedule just for them so they can log all meetings … can they enter it in the CRM field
   view or GrayCo text … let them say a new job — enter customer and meeting time — and that goes into their schedule … the GrayCo leads
   text can log schedules for appointments"). A staff text to the GrayCo number:
     appt John Smith tomorrow 2pm 123 Main St
     meeting with Nick fri 10am at the office
     estimate Jane Doe 901-555-1234 11/14 9:30am 55 Oak Ave Bartlett
     new job Bob Lee thu 3pm 88 Elm St          (also makes a lead, assigned to the texter)
     appt K7Q2 thu 2pm                          (a lead code from a GrayCo lead text: the lead's name / phone)
   parse(text, nowMs) → { ok, kind, date 'YYYY-MM-DD', time 'HH:MM', endTime, title, customer, phone, address, code } | { ok:false, why }.
   Dates and times are Central (America/Chicago). Pure function — no I/O. */
'use strict';
const KIND = /^\s*(appt|appointment|meeting|mtg|meet|estimate|est|site\s*visit|walk\s*-?\s*through|new\s*job|new\s*lead|inspection)\b[\s:,.-]*/i;
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
function s(v){ return v == null ? '' : String(v).trim(); }
function pad(n){ return String(n).padStart(2, '0'); }
function central(ms){
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms));
  const g = k => (p.find(x => x.type === k) || {}).value;
  return { y: +g('year'), m: +g('month'), d: +g('day'), wd: DAYS.indexOf(String(g('weekday')).slice(0, 3).toLowerCase()), hm: (g('hour') === '24' ? '00' : g('hour')) + ':' + g('minute') };
}
function ymdAdd(y, m, d, n){ const t = new Date(Date.UTC(y, m - 1, d) + n * 864e5); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
function kindOf(w){ w = w.toLowerCase().replace(/\s+|-/g, ''); if (/^(newjob|newlead)$/.test(w)) return 'newjob'; if (/^(estimate|est)$/.test(w)) return 'estimate'; if (/^(sitevisit|walkthrough|inspection)$/.test(w)) return 'sitevisit'; if (/^(meeting|mtg|meet)$/.test(w)) return 'meeting'; return 'appointment'; }
function parse(text, nowMs){
  let t = s(text).replace(/\s+/g, ' ');
  const km = KIND.exec(t); if (!km) return null;
  const kind = kindOf(km[1]); t = t.slice(km[0].length);
  const c = central(nowMs == null ? Date.now() : nowMs);
  let date = '', time = '', phone = '', code = '';
  const cut = re => { const m = re.exec(t); if (m) t = (t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim(); return m; };
  /* phone */
  let m = cut(/(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/); if (m) phone = m[1] + m[2] + m[3];
  /* time: 2pm · 2:30 pm · 14:00 · noon · at 2 */
  m = cut(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?\b/i);
  if (m) { let h = +m[1] % 12; if (/p/i.test(m[3])) h += 12; time = pad(h) + ':' + (m[2] || '00'); }
  if (!time) { m = cut(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/); if (m) time = pad(+m[1]) + ':' + m[2]; }
  if (!time) { m = cut(/\bnoon\b/i); if (m) time = '12:00'; }
  if (!time) { m = cut(/\bat\s+(\d{1,2})\b(?!\s*(?:st|nd|rd|th|[a-z]))/i); if (m) { let h = +m[1]; if (h >= 1 && h <= 6) h += 12; time = pad(h) + ':00'; } }
  /* date: today · tomorrow · mon..sun (next) · 11/14 · 11/14/26 */
  m = cut(/\b(today|tonight)\b/i); if (m) date = ymdAdd(c.y, c.m, c.d, 0);
  if (!date) { m = cut(/\b(tomorrow|tmrw|tmr)\b/i); if (m) date = ymdAdd(c.y, c.m, c.d, 1); }
  if (!date) { m = cut(/\b(?:(next)\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday|sday)?\b\.?/i);
    if (m) { const wd = DAYS.indexOf(m[2].slice(0, 3).toLowerCase()); let n = (wd - c.wd + 7) % 7; if (n === 0 && (!time || time <= c.hm)) n = 7; if (m[1] && n < 7) n += 7; date = ymdAdd(c.y, c.m, c.d, n); } }
  if (!date) { m = cut(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (m) { let y = m[3] ? +m[3] : c.y; if (y < 100) y += 2000; const mo = +m[1], d = +m[2]; if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) { if (!m[3] && (mo < c.m || (mo === c.m && d < c.d))) y += 1; date = y + '-' + pad(mo) + '-' + pad(d); } } }
  /* a lead code from a GrayCo lead text (4 letters/digits, upper case as sent) */
  m = /\b([A-HJ-NP-Z2-9]{4})\b/.exec(t); if (m && /\d/.test(m[1]) || (m && /^[A-Z]{4}$/.test(m[1]) && !/^(WITH|NEAR|ROOF|JOBS|SITE)$/.test(m[1]))) { code = m[1]; }
  /* address: starts with a house number */
  let address = '';
  m = cut(/\b(\d{2,6}\s+[A-Za-z0-9.' -]+?\b(?:st|street|rd|road|ave|avenue|dr|drive|ln|lane|blvd|ct|court|cv|cove|pl|place|pkwy|parkway|hwy|highway|way|cir|circle|trl|trail|ter|terrace)\b\.?(?:[ ,]+[A-Za-z .]+?)?)(?=$|,|\s+(?:for|with|re|about)\b)/i);
  if (m) address = s(m[1]).replace(/[,.]$/, '');
  if (!address) { m = cut(/\b(?:at|@)\s+(the\s+)?(office|shop|yard|site|job ?site)\b/i); if (m) address = (m[1] ? 'the ' : '') + m[2]; }
  const rest = t.replace(/\b(?:at|on|@)\s*$/i, '').replace(/^\s*(?:with|for|-|:)\s*/i, '').replace(/\s+/g, ' ').trim();
  if (code) { /* the code alone says who */ }
  if (!date) return { ok: false, kind, why: 'no day', rest };
  const hm = time || '09:00', eh = Math.min(23, +hm.slice(0, 2) + 1);
  const label = { newjob: 'New job', estimate: 'Estimate', sitevisit: 'Site visit', meeting: 'Meeting', appointment: 'Appointment' }[kind];
  const customer = rest.replace(new RegExp('\\b' + code + '\\b'), '').replace(/\s+/g, ' ').trim();
  return { ok: true, kind, date, time: hm, timeSet: !!time, endTime: pad(eh) + ':' + hm.slice(3), customer: customer.slice(0, 80), title: (label + (customer ? ' — ' + customer : '')).slice(0, 100), phone, address: address.slice(0, 120), code };
}
function nice(r){ const [y, mo, d] = r.date.split('-').map(Number), wd = DAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]; const h = +r.time.slice(0, 2); return wd.charAt(0).toUpperCase() + wd.slice(1) + ' ' + mo + '/' + d + ' ' + ((h % 12) || 12) + ':' + r.time.slice(3) + (h < 12 ? ' AM' : ' PM'); }
module.exports = { parse, nice, KIND };
