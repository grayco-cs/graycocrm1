/* netlify/functions/db-watch-scheduled.js — patch DBWATCH (owner 11/11: the database went "Unhealthy" and nobody could sign in:
   "when it goes unhealthy how am I supposed to know").
   Every 5 minutes (netlify.toml): one tiny read of the database (gc_kv) and the sign-in service (auth health), each with a
   15-second limit; a failure is tried again 20 seconds later. Still down → a text to DB_ALERT_PHONES (Netlify environment
   variable: the cell numbers, comma separated — e.g. Wesley and Nick) from the alerts number:
     "⚠️ GrayCo CRM database is DOWN — nobody can sign in. Supabase → Project Settings → General → Restart project."
   Then again once an hour while it stays down, and "✅ … back up" when it answers again.
   No state is kept in the database (it is the thing that is down): what was already sent is read back from Twilio's own
   list of messages. Staff only — this never texts a customer, sub or GC, and it is not held by data-entry mode.
   DB_WATCH_OFF=1 stops it. */
'use strict';
const MARK_DOWN = '⚠️ GrayCo CRM database is DOWN';
const MARK_UP = '✅ GrayCo CRM database is back up';
function env(k){ return String(process.env[k] || '').trim(); }
function sbUrl(){ return (env('SUPABASE_URL') || 'https://ieeonhpfahmwwecizdut.supabase.co').replace(/\/$/, ''); }
function key(){ return env('SUPABASE_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY') || env('SUPABASE_ANON_KEY'); }
const _D = { fetch: function(u, o){ return fetch(u, o); }, sleep: function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }, now: function(){ return Date.now(); } };
async function timed(u, o, ms){
  const ac = new AbortController(), t = setTimeout(function(){ ac.abort(); }, ms || 15000);
  try { const r = await _D.fetch(u, Object.assign({}, o || {}, { signal: ac.signal })); return { ok: !!(r && r.ok), status: r ? r.status : 0 }; }
  catch (e) { return { ok: false, status: 0, err: String(e && e.name || e).slice(0, 60) }; }
  finally { clearTimeout(t); }
}
async function probe(){
  const k = key(), h = { apikey: k, Authorization: 'Bearer ' + k };
  const db = await timed(sbUrl() + '/rest/v1/gc_kv?select=key&limit=1', { headers: h });
  const auth = await timed(sbUrl() + '/auth/v1/health', { headers: { apikey: k } });
  return { ok: db.ok && auth.ok, db, auth };
}
function phones(){ return env('DB_ALERT_PHONES').split(/[,;\n]+/).map(function(p){ var d = p.replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d.length === 10 ? '+1' + d : ''; }).filter(Boolean).filter(function(p, i, a){ return a.indexOf(p) === i; }); }
function from(){ return env('TWILIO_FROM_ALERTS') || env('TWILIO_FROM'); }
function tw(){ const sid = env('TWILIO_ACCOUNT_SID'), tok = env('TWILIO_AUTH_TOKEN'); return sid && tok ? { sid, auth: 'Basic ' + Buffer.from(sid + ':' + tok).toString('base64') } : null; }
/* what we sent this phone from the alerts number in the last few hours, newest first */
async function recent(T, to){
  const since = new Date(_D.now() - 26 * 3600000).toISOString().slice(0, 10);
  const u = 'https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(T.sid) + '/Messages.json?PageSize=50&From=' + encodeURIComponent(from()) + '&To=' + encodeURIComponent(to) + '&DateSent%3E=' + since;
  try {
    const r = await _D.fetch(u, { headers: { Authorization: T.auth } }); if (!r || !r.ok) return null;
    const j = await r.json();
    return (j.messages || []).filter(function(m){ return /GrayCo CRM database is (DOWN|back up)/.test(String(m.body || '')); })
      .map(function(m){ return { down: String(m.body).indexOf(MARK_DOWN) === 0, at: Date.parse(m.date_sent || m.date_created) || 0 }; }).sort(function(a, b){ return b.at - a.at; });
  } catch (e) { return null; }
}
async function send(T, to, body){
  try {
    const r = await _D.fetch('https://api.twilio.com/2010-04-01/Accounts/' + encodeURIComponent(T.sid) + '/Messages.json', { method: 'POST',
      headers: { Authorization: T.auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ To: to, From: from(), Body: body }).toString() });
    return !!(r && r.ok);
  } catch (e) { return false; }
}
function ct(ms){ return new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }); }
async function run(){
  if (env('DB_WATCH_OFF') === '1') return { off: true };
  let p = await probe();
  if (!p.ok) { await _D.sleep(20000); p = await probe(); }
  const out = { ok: p.ok, db: p.db.status, auth: p.auth.status, texted: [] };
  const T = tw(), list = phones();
  if (!T || !from() || !list.length) { out.note = 'no DB_ALERT_PHONES / Twilio — nothing texted'; return out; }
  for (const to of list) {
    const h = await recent(T, to); if (h === null && p.ok) continue;   /* cannot see what was sent: never text "back up" blind */
    const last = (h || [])[0];
    if (!p.ok) {
      if (last && last.down && _D.now() - last.at < 55 * 60000) continue;   /* told within the hour */
      const what = !p.db.ok && !p.auth.ok ? 'database and sign-in are not answering' : !p.db.ok ? 'database is not answering' : 'sign-in is not answering';
      if (await send(T, to, MARK_DOWN + ' (' + ct(_D.now()) + '): the ' + what + ' — nobody can sign in. Fix: supabase.com → your project → Project Settings → General → Restart project (2–3 min). Still down after 10 min → Support (?) top right.')) out.texted.push(to);
    } else if (last && last.down) {
      if (await send(T, to, MARK_UP + ' (' + ct(_D.now()) + '). Everyone can sign in again — reload the CRM.')) out.texted.push(to);
    }
  }
  return out;
}
exports.handler = async function(){
  const out = await run();
  try { console.log('[db-watch]', JSON.stringify(out)); } catch (e) {}
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out) };
};
exports._test = { run, probe, phones, _D };
