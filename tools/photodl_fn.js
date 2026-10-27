/* patch PHOTODL: GET ?proxy=img&url=<CompanyCam image link> — a signed-in, staff-only fetch of ONE CompanyCam picture, for
   browsers whose direct fetch of the image CDN is refused (CORS). It is not an open proxy: https only, no credentials or odd
   ports, host must be a CompanyCam image host (checked again on every redirect), the answer must be an image, 15 MB at most. */
const CC_IMG_MAX = 15 * 1024 * 1024;
function ccImgHostOk(h){
  h = String(h || '').toLowerCase();
  if(h === 'api.companycam.com' || h === 'app.companycam.com') return false;
  return /^([a-z0-9-]+\.)+companycam\.com$/.test(h) || /^companycam[a-z0-9.-]*\.s3[a-z0-9.-]*\.amazonaws\.com$/.test(h);
}
function ccImgParse(raw){
  try{
    raw = String(raw || ''); if(!raw || raw.length > 2048) return null;
    const u = new URL(raw);
    if(u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
    return ccImgHostOk(u.hostname) ? u : null;
  }catch(e){ return null; }
}
async function ccImgProxy(raw, headers){
  const J = function(code, msg){ return { statusCode: code, headers, body: JSON.stringify({ error: msg }) }; };
  let u = ccImgParse(raw);
  if(!u) return J(400, 'Only CompanyCam image links can be fetched.');
  let r = null;
  try{
    for(let hop = 0; hop < 4; hop++){
      r = await fetch(u.toString(), { redirect: 'manual', headers: { Accept: 'image/*' } });
      const loc = r.status >= 300 && r.status < 400 ? r.headers.get('location') : '';
      if(!loc) break;
      u = ccImgParse(new URL(loc, u).toString());
      if(!u) return J(400, 'Only CompanyCam image links can be fetched.');
      r = null;
    }
  }catch(e){ return J(502, 'Could not fetch the photo.'); }
  if(!r) return J(502, 'Too many redirects.');
  if(!r.ok) return J(r.status === 404 ? 404 : 502, 'CompanyCam answered ' + r.status);
  const ct = String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if(!/^image\/(jpeg|jpg|png|webp|gif|heic|heif)$/.test(ct)) return J(415, 'That link is not a picture.');
  if((parseInt(r.headers.get('content-length') || '0', 10) || 0) > CC_IMG_MAX) return J(413, 'That photo is larger than 15 MB.');
  const chunks = []; let n = 0;
  try{
    if(r.body && typeof r.body.getReader === 'function'){
      const rd = r.body.getReader();
      for(;;){
        const x = await rd.read(); if(x.done) break;
        n += x.value.length;
        if(n > CC_IMG_MAX){ try{ await rd.cancel(); }catch(e){} return J(413, 'That photo is larger than 15 MB.'); }
        chunks.push(Buffer.from(x.value));
      }
    } else {
      const b = Buffer.from(await r.arrayBuffer()); n = b.length;
      if(n > CC_IMG_MAX) return J(413, 'That photo is larger than 15 MB.');
      chunks.push(b);
    }
  }catch(e){ return J(502, 'The photo download was cut off.'); }
  return { statusCode: 200, isBase64Encoded: true, body: Buffer.concat(chunks).toString('base64'),
    headers: Object.assign({}, headers, { 'Content-Type': ct, 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff' }) };
}

