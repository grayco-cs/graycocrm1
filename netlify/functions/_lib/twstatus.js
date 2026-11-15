/* patch TWLIVE (owner's 11/15 list, item 1d: "Twilio status check … make sure it works and is shown somewhere admin-visible. Read-only").
   texts.js GET ?status=1&live=1 (admins) → check(): GETs only, never a send or a change.
     · the account (Accounts/<sid>.json): reached? status (active / suspended / closed), type (Trial / Full)
     · each GrayCo number (TWILIO_FROM, TWILIO_FROM_ALERTS and the routed numbers): on this account? its text webhook → the CRM?
     · the last 20 texts (Messages.json?PageSize=20): how many delivered / sent / failed / undelivered, the newest error code
   The SID is shown masked (AC…1234); the token is never returned. Each call has a 6 s limit. */
'use strict';
function s(v){ return v == null ? '' : String(v).trim(); }
function phone10(v){ const d = s(v).replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; }
function tidy(v){ const d = phone10(v); return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : s(v); }
function mask(sid){ sid = s(sid); return sid.length > 8 ? sid.slice(0, 2) + '…' + sid.slice(-4) : (sid ? '…' : ''); }
async function get(fetchFn, url, auth){
  const ac = typeof AbortController === 'function' ? new AbortController() : null; const t = ac ? setTimeout(() => ac.abort(), 6000) : null;
  try {
    const r = await fetchFn(url, { method: 'GET', headers: { Authorization: auth, Accept: 'application/json' }, signal: ac ? ac.signal : undefined });
    let j = null; try { j = await r.json(); } catch (e) { j = null; }
    return { ok: !!r.ok, status: r.status, j: j };
  } catch (e) { return { ok: false, status: 0, error: /abort/i.test(s(e && e.name) + s(e && e.message)) ? 'timed out' : 'not reached' }; }
  finally { if (t) clearTimeout(t); }
}
/* o = { env(k), fetch, numbers: [{ number, label }], webhookPath } */
async function check(o){
  const env = o.env, f = o.fetch || globalThis.fetch;
  const sid = s(env('TWILIO_ACCOUNT_SID')), tok = s(env('TWILIO_AUTH_TOKEN'));
  if (!sid || !tok || !phone10(env('TWILIO_FROM'))) return { ready: false };
  const auth = 'Basic ' + Buffer.from(sid + ':' + tok).toString('base64'), base = 'https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(sid);
  const out = { ready: true, account: { sid: mask(sid) }, numbers: [], recent: null };
  const a = await get(f, base + '.json', auth);
  if (a.ok && a.j) Object.assign(out.account, { ok: true, status: s(a.j.status), type: s(a.j.type) });
  else Object.assign(out.account, { ok: false, error: a.status === 401 ? 'Twilio did not accept the SID / token (401)' : a.status ? 'Twilio answered ' + a.status : (a.error || 'not reached') });
  const seen = {}, list = [{ number: env('TWILIO_FROM'), label: 'Main number' }, { number: env('TWILIO_FROM_ALERTS'), label: 'Alerts number' }].concat(Array.isArray(o.numbers) ? o.numbers : []);
  const hook = s(o.webhookPath || '/.netlify/functions/missed-call');
  for (const n of list) {
    const d = phone10(n && n.number); if (d.length !== 10 || seen[d]) continue; seen[d] = 1;
    const row = { number: tidy(d), label: s(n.label) || 'Number' };
    if (out.account.ok) {
      const r = await get(f, base + '/IncomingPhoneNumbers.json?PhoneNumber=' + encodeURIComponent('+1' + d), auth);
      const hit = r.ok && r.j && Array.isArray(r.j.incoming_phone_numbers) ? r.j.incoming_phone_numbers[0] : null;
      if (hit) { row.found = true; row.smsUrl = s(hit.sms_url); row.smsHook = row.smsUrl.indexOf(hook) >= 0; row.voiceHook = s(hit.voice_url).indexOf(hook) >= 0; }
      else { row.found = false; if (!r.ok) row.error = r.status ? 'Twilio answered ' + r.status : (r.error || 'not reached'); }
    } else { row.found = false; row.error = 'account not reached'; }
    out.numbers.push(row);
  }
  if (out.account.ok) {
    const m = await get(f, base + '/Messages.json?PageSize=20', auth);
    if (m.ok && m.j && Array.isArray(m.j.messages)) {
      const by = {}; let lastError = null, failed = 0;
      m.j.messages.forEach(x => { const st = s(x && x.status) || 'unknown'; by[st] = (by[st] || 0) + 1; if (/failed|undelivered/.test(st)) failed++; if (!lastError && x && x.error_code) { const t = Date.parse(s(x.date_sent || x.date_created)); lastError = { code: String(x.error_code), at: isFinite(t) ? new Date(t).toISOString() : '' }; } });
      out.recent = { n: m.j.messages.length, by, failed, lastError };
    }
  }
  return out;
}
module.exports = { check, mask };
