import { getStore } from '@netlify/blobs';
import { authorized, notSetUp, json } from './_auth.mjs';
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body; try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  if (notSetUp()) return json({ error: 'Editing is off until ADMIN_PASSWORD is set in Netlify (Site configuration → Environment variables)' }, 503);
  if (!authorized(body.email, body.password)) return json({ error: 'Wrong email or password' }, 401);
  if (!body.content || typeof body.content !== 'object' || !body.content.hero) return json({ error: 'Missing content' }, 400);
  const store = getStore('grayco-site');
  const prev = await store.get('content');
  if (prev) await store.set('content-backup-' + new Date().toISOString().slice(0, 10), prev);
  await store.setJSON('content', body.content);
  return json({ ok: true });
};
