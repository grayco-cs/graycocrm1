// test_photodl_fn.mjs — patch PHOTODL on the server (offline): companycam-webhook?proxy=img is staff only, CompanyCam image hosts only,
// follows redirects only to such hosts, answers images only, 15 MB cap. fetch is mocked (Supabase sign-in + the image CDN).
// Usage: node tools/test_photodl_fn.mjs [functionsDir]
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.resolve(process.argv[2] || path.join(HERE, '../netlify/functions'));
Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc-test', SITE_ORIGIN: 'https://crm.grayco-cs.com' });
let pass = 0, fail = 0;
function ok(c, m, i){ if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (i !== undefined ? '  ' + JSON.stringify(i).slice(0, 300) : '')); } }
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7), Buffer.from([0xff, 0xd9])]);
const CALLS = [];
global.fetch = async function(url, init = {}){
  const u = new URL(url); CALLS.push(u.href);
  const J = (st, b) => new Response(JSON.stringify(b), { status: st, headers: { 'content-type': 'application/json' } });
  if (u.host === 'sb.test') {
    if (u.pathname === '/auth/v1/user') return (init.headers.Authorization === 'Bearer good') ? J(200, { id: 'u1', email: 'wjohnson@grayco-cs.com' }) : J(401, {});
    if (u.pathname === '/rest/v1/gc_staff') return J(200, [{ email: 'wjohnson@grayco-cs.com', name: 'W', role: 'admin', active: true }]);
    return J(200, []);
  }
  if (u.host === 'img.companycam.com') {
    if (u.pathname === '/ok.jpg') return new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } });
    if (u.pathname === '/html') return new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } });
    if (u.pathname === '/huge.jpg') return new Response(Buffer.alloc(16 * 1024 * 1024, 1), { status: 200, headers: { 'content-type': 'image/jpeg' } });
    if (u.pathname === '/huge-cl.jpg') return new Response('x', { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(20 * 1024 * 1024) } });
    if (u.pathname === '/gone.jpg') return new Response('', { status: 404 });
    if (u.pathname === '/redir-ok') return new Response('', { status: 302, headers: { location: '/ok.jpg' } });
    if (u.pathname === '/redir-evil') return new Response('', { status: 302, headers: { location: 'https://evil.test/ok.jpg' } });
  }
  if (u.host === 'evil.test') return new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  return new Response('', { status: 404 });
};
const cc = require(path.join(SRC, 'companycam-webhook.js'));
const call = (url, token) => cc.handler({ httpMethod: 'GET', headers: Object.assign({ origin: 'https://crm.grayco-cs.com' }, token ? { authorization: 'Bearer ' + token } : {}), queryStringParameters: { proxy: 'img', url } });
const img = (p) => 'https://img.companycam.com' + p;
let r = await call(img('/ok.jpg'));
ok(r.statusCode === 401, 'no sign-in token -> 401', r.statusCode);
ok(!CALLS.some(c => c.includes('companycam')), 'the image host was not contacted without a token');
r = await call(img('/ok.jpg'), 'bad'); ok(r.statusCode === 401, 'bad token -> 401', r.statusCode);
r = await call(img('/ok.jpg'), 'good');
ok(r.statusCode === 200 && r.isBase64Encoded === true && r.headers['Content-Type'] === 'image/jpeg' && Buffer.from(r.body, 'base64').equals(JPEG), 'good request -> the image bytes (base64, image/jpeg)', [r.statusCode, r.headers['Content-Type']]);
ok(r.headers['Access-Control-Allow-Origin'] === 'https://crm.grayco-cs.com' && r.headers['X-Content-Type-Options'] === 'nosniff', 'CORS limited to the CRM site, nosniff');
for (const [name, u] of [['non-CompanyCam host', 'https://evil.test/ok.jpg'], ['http (not https)', 'http://img.companycam.com/ok.jpg'], ['look-alike host', 'https://img.companycam.com.evil.test/ok.jpg'],
  ['companycam.com apex-suffix trick', 'https://evilcompanycam.com/ok.jpg'], ['credentials in the link', 'https://a:b@img.companycam.com/ok.jpg'], ['odd port', 'https://img.companycam.com:8443/ok.jpg'],
  ['the API host', 'https://api.companycam.com/v2/projects'], ['not a link', 'file:///etc/passwd'], ['empty', ''], ['localhost', 'https://localhost/x.jpg']]) {
  CALLS.length = 0; r = await call(u, 'good'); ok(r.statusCode === 400 && !CALLS.some(c => !c.startsWith('https://sb.test')), name + ' -> 400, nothing fetched', [r.statusCode, CALLS.filter(c => !c.startsWith('https://sb.test'))]);
}
r = await call(img('/html'), 'good'); ok(r.statusCode === 415, 'a CompanyCam link that is not an image -> 415', r.statusCode);
r = await call(img('/huge.jpg'), 'good'); ok(r.statusCode === 413, 'over 15 MB (streamed) -> 413', r.statusCode);
r = await call(img('/huge-cl.jpg'), 'good'); ok(r.statusCode === 413, 'over 15 MB (Content-Length) -> 413', r.statusCode);
r = await call(img('/gone.jpg'), 'good'); ok(r.statusCode === 404, 'missing photo -> 404', r.statusCode);
r = await call(img('/redir-ok'), 'good'); ok(r.statusCode === 200 && Buffer.from(r.body, 'base64').equals(JPEG), 'redirect inside CompanyCam hosts is followed');
CALLS.length = 0; r = await call(img('/redir-evil'), 'good'); ok(r.statusCode === 400 && !CALLS.some(c => c.includes('evil.test')), 'redirect to another host is refused, never fetched', [r.statusCode, CALLS]);
r = await cc.handler({ httpMethod: 'GET', headers: { origin: 'https://crm.grayco-cs.com', authorization: 'Bearer good' }, queryStringParameters: { proxy: 'img' } }); ok(r.statusCode === 400, 'no url -> 400', r.statusCode);
console.log('RESULT ' + pass + '/' + (pass + fail)); process.exit(fail ? 1 : 0);
