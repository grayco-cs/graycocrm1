import { getStore } from '@netlify/blobs';
import { authorized, notSetUp, json } from './_auth.mjs';
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body; try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  if (notSetUp()) return json({ error: 'Editing is off until ADMIN_PASSWORD is set in Netlify (Site configuration → Environment variables)' }, 503);
  if (!authorized(body.email, body.password)) return json({ error: 'Wrong email or password' }, 401);
  const type = String(body.type || '');
  if (!/^(image|video)\//.test(type)) return json({ error: 'Only photos and videos can be uploaded' }, 400);
  const bytes = Buffer.from(String(body.data || ''), 'base64');
  if (!bytes.length) return json({ error: 'Empty file' }, 400);
  if (bytes.length > 5 * 1024 * 1024) return json({ error: 'File is over 5 MB — for videos, upload to YouTube and paste the link' }, 413);
  const id = String(body.id || Date.now().toString(36)).replace(/[^\w-]/g, '');
  const store = getStore('grayco-media');
  await store.set(id, bytes, { metadata: { type, name: String(body.name || '') } });
  return json({ ok: true, url: '/.netlify/functions/media?id=' + id });
};
