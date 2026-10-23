import { authorized, notSetUp, json } from './_auth.mjs';
// The editor's sign-in box asks here before it opens (the save and upload functions check again on every call).
const tries = new Map();
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const ip = req.headers.get('x-nf-client-connection-ip') || 'x', now = Date.now();
  const recent = (tries.get(ip) || []).filter(t => now - t < 15 * 60e3);
  if (recent.length >= 10) return json({ error: 'Too many tries — wait 15 minutes' }, 429);
  let body; try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  if (notSetUp()) return json({ error: 'Editing is off until ADMIN_PASSWORD is set in Netlify (Site configuration → Environment variables)' }, 503);
  if (!authorized(body.email, body.password)) { recent.push(now); tries.set(ip, recent); return json({ error: 'Wrong email or password' }, 401); }
  return json({ ok: true });
};
