// Shared sign-in check for the GrayCo site admin (the gear button on the website).
// Netlify → Site configuration → Environment variables:
//   ADMIN_PASSWORD  required. Without it nobody can save — there is no built-in default password.
//   ADMIN_EMAILS    optional comma list of outside addresses that may sign in too, e.g. the marketing agency:
//                   malcolm@adventuresmedia.com,amy@adventuresmedia.com
//   ADMIN_DOMAIN    optional, defaults to grayco-cs.com (anyone with an address there may sign in).
import { timingSafeEqual } from 'node:crypto';

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
export function allowedEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e)) return false;
  const domain = (process.env.ADMIN_DOMAIN || 'grayco-cs.com').toLowerCase();
  const extra = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return e.endsWith('@' + domain) || extra.includes(e);
}
export function authorized(email, password) {
  const pass = process.env.ADMIN_PASSWORD || '';
  return !!pass && typeof password === 'string' && allowedEmail(email) && same(password, pass);
}
export const notSetUp = () => !process.env.ADMIN_PASSWORD;
export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
