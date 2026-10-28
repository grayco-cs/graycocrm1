/* patch XACTPHOTOS — the browser half of test_XACTPHOTOS.mjs (offline harness, demo data, a mock CompanyCam with 200 made-up photos).
   Needs the scratch harness S/wN/harness_N.mjs + S/wDEMO/seed.mjs (made-up people / jobs) and Python PIL (makes the test JPEGs).
   Screenshots → SHOTS (button + picker). */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
const S = '/tmp/claude-0/-home-user-graycocrm1/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad';
const SHOTS = process.env.XP_SHOTS || '/tmp/claude-0/-home-user/6a5b2b6b-8a4d-5505-9f82-62521adb6674/scratchpad/shots/xactphotos';
const { computer, signIn, sleep, cset, cget, waitFor, resetCloud } = await import(S + '/wN/harness_N.mjs');
const { seedDemo } = await import(S + '/wDEMO/seed.mjs');
const N = 200, T0 = Math.floor(Date.parse('2026-09-01T14:00:00Z') / 1000);
const ROOMS = ['Kitchen', 'Living room', 'Roof', '', 'Primary bath'];
function photos(pid){
  const out = [];
  for (let i = 0; i < N; i++) {
    const room = ROOMS[i % ROOMS.length], tags = [];
    if (room) tags.push({ display_value: room });
    if (i % 3 === 0) tags.push({ display_value: 'Damage' });
    if (i === 17 || i === 42) tags.push({ display_value: 'Private' });
    out.push({ id: pid * 1000 + i, project_id: pid, captured_at: T0 + i * 60, creator_name: 'Sample PM', description: i % 2 ? 'Demo caption ' + i : '',
      coordinates: i % 4 === 0 ? { lat: 35.2 + i / 1e4, lon: -89.8 } : {}, tags,
      uris: [{ type: 'thumbnail', uri: 'https://img.companycam.com/t/' + pid + '/' + i + '.jpg' }, { type: 'web', uri: 'https://img.companycam.com/w/' + pid + '/' + i + '.jpg' }] });
  }
  return out;
}
const PH = { 7001: photos(7001) };
const py = (code, ...a) => execFileSync('python3', ['-I', '-c', code, ...a], { encoding: 'utf8' });

export async function browserCheck(build){
  const out = [], tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xpb-'));
  fs.mkdirSync(SHOTS, { recursive: true });
  /* test JPEGs: one 3000×2000 with EXIF orientation 6 (a phone held upright), four small ones */
  py(`import sys
from PIL import Image
d = sys.argv[1]
im = Image.new('RGB', (3000, 2000), (30, 90, 160))
for x in range(0, 3000, 100): im.paste((240, 165, 26), (x, 0, x + 20, 300))
ex = Image.Exif(); ex[0x0112] = 6
im.save(d + '/big.jpg', 'JPEG', quality=80, exif=ex.tobytes())
for k, c in enumerate([(200, 60, 60), (60, 160, 90), (90, 90, 200), (220, 200, 60)]): Image.new('RGB', (1024, 768), c).save(d + '/s%d.jpg' % k, 'JPEG', quality=80)
Image.new('RGB', (120, 90), (120, 120, 140)).save(d + '/th.jpg', 'JPEG', quality=70)`, tmp);
  const IMG = { big: fs.readFileSync(tmp + '/big.jpg'), s: [0, 1, 2, 3].map(k => fs.readFileSync(tmp + '/s' + k + '.jpg')), th: fs.readFileSync(tmp + '/th.jpg') };

  resetCloud(); seedDemo();
  const P = cget('projects');
  P.push({ id: 'P6', po: 'PO-1006', name: 'Demo Porch 2026', client: 'Sample Owner', address: '600 Demo Porch Rd, Bartlett TN', pm: 'Sample PM', status: 'Active', contract: 12000,
    createdAt: '2026-03-01T10:00:00Z', ccProjectId: '7001', type: 'Insurance Claim', isInsurance: true });
  cset('projects', P);
  const now = new Date().toISOString();
  cset('gc_claims', [{ id: 'CLX', projectId: 'P6', claimNumber: 'HO-7001', carrier: 'Demo Mutual', insured: 'Sample Owner', address: '600 Demo Porch Rd, Bartlett TN', phase: 'Inspection',
    createdAt: now, updatedAt: now, notes: [], estimates: [], payments: [], docs: [], supplements: [], sync: {} }]);

  async function mocks(c){
    await c.ctx.route(u => new URL(u).host === 'img.companycam.com', r => {
      const m = /\/(t|w)\/\d+\/(\d+)\.jpg/.exec(new URL(r.request().url()).pathname) || [];
      const body = m[1] === 't' ? IMG.th : (+m[2] === 0 ? IMG.big : IMG.s[(+m[2]) % 4]);
      return r.fulfill({ status: 200, contentType: 'image/jpeg', headers: { 'access-control-allow-origin': '*' }, body });
    });
    await c.ctx.route(u => /\/\.netlify\/functions\/companycam-webhook/.test(u), async r => {
      const q = new URL(r.request().url()).searchParams, px = q.get('proxy'), J = b => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
      await sleep(80);
      if (px === 'status') return J({ ok: true, verified: true, reason: 'ok', source: 'env', status: 200 });
      if (px === 'sync') return J({ ok: true, tokenSet: true, review: [] });
      if (px === 'recent') return J({ ok: true, projects: [{ id: '7001', name: 'Porch', address: '600 Demo Porch Rd', status: 'active', photo_count: N, thumb: 'https://img.companycam.com/t/7001/0.jpg', updated_at: 1780000000 }] });
      if (px === 'api') {
        const ep = q.get('endpoint') || '', per = +q.get('per_page') || 50, pg = +q.get('page') || 1, m = /^projects\/(\d+)\/photos$/.exec(ep);
        if (m) return J((PH[m[1]] || []).slice((pg - 1) * per, pg * per));
        return J([]);
      }
      return J({});
    });
  }

  /* ── 1. admin: the project page → button → picker → ZIP ── */
  const c = await computer('XP', { build });
  await mocks(c);
  await signIn(c, 'wjohnson@grayco-cs.com', 12000);
  const p = c.page();
  await p.evaluate(() => window._setView('allphotos'));
  await waitFor(c, () => !!document.querySelector('#gcuOv .pv-card[data-id="P6"]'), null, 30000, 200);
  await p.click('#gcuOv .pv-card[data-id="P6"]').catch(() => {});
  const tiles = await waitFor(c, n => { const k = document.querySelectorAll('#gcuOv [data-src-kind="cc"]').length; return k >= n ? k : null; }, N, 40000, 250);
  out.push(['the job page shows the 200 demo photos', tiles === N, String(tiles)]);
  const btn = await waitFor(c, () => { const b = document.querySelector('#gcuOv [data-a="xpopen"]'); return b ? b.textContent : null; }, null, 10000, 200);
  out.push(['"📦 Photos for Xactimate" sits in the project photo bar', /Photos for Xactimate/.test(btn || ''), btn]);
  await p.locator('#gcuOv .dl-bar').first().screenshot({ path: SHOTS + '/1_button_project.png' }).catch(() => {});
  await p.click('#gcuOv [data-a="xpopen"]');
  const rows = await waitFor(c, () => { const n = document.querySelectorAll('#xp-ov .xp-row').length; return n ? n : null; }, null, 30000, 200);
  out.push(['picker lists every photo but the 2 private ones, all ticked', rows === N - 2 && await p.evaluate(() => document.querySelectorAll('#xp-ov .xp-row input:checked').length) === N - 2, String(rows)]);
  const head = await p.evaluate(() => ({ n: document.querySelector('#xp-n').textContent, sub: document.querySelector('#xp-ov .xp-sub').textContent, how: document.querySelector('#xp-ov .xp-how').textContent,
    first: Array.from(document.querySelectorAll('#xp-ov .xp-nm')).slice(0, 3).map(x => x.textContent), groups: Array.from(document.querySelectorAll('#xp-ov h4')).map(h => h.firstChild.textContent.trim()) }));
  out.push(['header: claim # + insured; count; private left out', /HO-7001/.test(head.sub) && /Sample Owner/.test(head.sub) && /198 of 198 photos selected · 2 private left out/.test(head.n), JSON.stringify(head).slice(0, 300)]);
  out.push(['how-to under the button', /Photos → Import/.test(head.how) && /Photos → Upload → select all/.test(head.how)]);
  out.push(['grouped room by room in walk-through order, no-room last', head.groups.join('|') === 'Kitchen|Living room|Roof|Primary bath|No room tag', head.groups.join('|')]);
  out.push(['names shown: 001 - Kitchen - …', /^001 - Kitchen - Damage - 2026-09-01\.jpg$/.test(head.first[0]) && /^002 - Kitchen - Demo caption 5 - 2026-09-01\.jpg$/.test(head.first[1]), head.first.join(' | ')]);
  /* filters + ticks */
  await p.click('#xp-ov .xp-chip[data-v="Damage"]');
  const dmg = await p.evaluate(() => document.querySelectorAll('#xp-ov .xp-row').length);
  await p.selectOption('#xp-ov select[data-x="room"]', 'Roof');
  const roof = await p.evaluate(() => document.querySelectorAll('#xp-ov .xp-row').length);
  out.push(['filters: tag Damage, then room Roof', dmg === 66 && roof === 12, dmg + ' / ' + roof]);
  await p.click('#xp-ov [data-x="none"]');
  const after = await p.evaluate(() => document.querySelector('#xp-n').textContent);
  await p.click('#xp-ov .xp-chip[data-v="All"]'); await p.selectOption('#xp-ov select[data-x="room"]', 'All');
  await p.click('#xp-ov [data-x="all"]');
  const back = await p.evaluate(() => document.querySelector('#xp-n').textContent);
  out.push(['Clear shown / Select all shown', /^186 of 198/.test(after) && /^198 of 198/.test(back), after + ' / ' + back]);
  /* one untick: numbering closes up */
  await p.locator('#xp-ov .xp-row').nth(1).locator('input').uncheck();
  const nm2 = await p.evaluate(() => [document.querySelectorAll('#xp-ov .xp-nm')[1].textContent, document.querySelectorAll('#xp-ov .xp-nm')[2].textContent]);
  out.push(['unticked photo shows "not included", the next one takes its number', nm2[0] === '— not included —' && /^002 - Kitchen/.test(nm2[1]), nm2.join(' | ')]);
  await p.locator('#xp-ov .xp-row').nth(1).locator('input').check();
  await p.setViewportSize({ width: 1100, height: 900 });
  await p.screenshot({ path: SHOTS + '/2_picker.png' });
  /* copy captions */
  await c.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://app.local' }).catch(() => {});
  await p.click('#xp-ov [data-x="copy"]'); await sleep(400);
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '');
  out.push(['📋 Copy captions: one line per photo', clip.split('\n').filter(Boolean).length === 198 && clip.startsWith('001 - Kitchen - Damage - 2026-09-01'), clip.slice(0, 80)]);
  /* the run: long tasks watched */
  await p.evaluate(() => { window.__xpLT = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__xpLT.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: false }); } catch (e) {} });
  const t0 = Date.now();
  const dlP = p.waitForEvent('download', { timeout: 240000 });
  await p.click('#xp-go');
  await sleep(1500);
  await p.screenshot({ path: SHOTS + '/3_progress.png' }).catch(() => {});
  const dl = await dlP;
  const ms = Date.now() - t0;
  const zp = path.join(tmp, dl.suggestedFilename()); await dl.saveAs(zp);
  out.push(['ZIP named "<claim #> <insured> photos.zip"', dl.suggestedFilename() === 'HO-7001 Sample Owner photos.zip', dl.suggestedFilename()]);
  await sleep(600);
  const lt = await p.evaluate(() => window.__xpLT.slice());
  const maxLT = lt.length ? Math.max(...lt) : 0;
  out.push(['198 photos: no long task > 300 ms while building (' + (ms / 1000).toFixed(1) + ' s, max task ' + maxLT + ' ms, ' + lt.length + ' long tasks)', maxLT <= 300, JSON.stringify(lt.slice(0, 20))]);
  await p.screenshot({ path: SHOTS + '/4_done.png' }).catch(() => {});
  const done = await p.evaluate(() => document.querySelector('#xp-msg') && document.querySelector('#xp-msg').textContent);
  out.push(['done message with the how-to', /Saved HO-7001 Sample Owner photos\.zip/.test(done || '') && /Import/.test(done || ''), (done || '').slice(0, 160)]);
  let t = ''; try { t = execFileSync('unzip', ['-t', zp], { encoding: 'utf8' }); } catch (e) { t = String(e.stdout || e); }
  out.push(['unzip -t: no errors', /No errors detected/.test(t), t.slice(-160)]);
  const z = JSON.parse(py(`import sys, json, zipfile, io
from PIL import Image
z = zipfile.ZipFile(sys.argv[1]); out = []
for i in z.infolist():
  if i.filename.endswith('.jpg'):
    im = Image.open(io.BytesIO(z.read(i))); ex = im.getexif()
    out.append([i.filename, im.size, im.format, ex.get(0x0112), ex.get_ifd(0x8769).get(0x9003), bool(ex.get_ifd(0x8825)), i.file_size])
  else: out.append([i.filename, z.read(i).decode('utf-8-sig')])
print(json.dumps(out))`, zp));
  const jp = z.filter(x => x[0].endsWith('.jpg')), csv = (z.find(x => x[0] === 'photo-list.csv') || [])[1] || '';
  out.push(['198 JPEGs + photo-list.csv', jp.length === 198 && z.length === 199 && z[z.length - 1][0] === 'photo-list.csv', z.length + '']);
  out.push(['names in order 001…198, room by room, ≤ 80 chars', jp.every((x, k) => x[0].startsWith(String(k + 1).padStart(3, '0') + ' - ') && x[0].length <= 80) && /^001 - Kitchen - /.test(jp[0][0]) && /^198 - /.test(jp[197][0])
    && jp.map(x => (x[0].split(' - ')[1] || '')).filter((v, i, a) => i === 0 || v !== a[i - 1]).slice(0, 4).join('|') === 'Kitchen|Living room|Roof|Primary bath', jp.slice(0, 3).map(x => x[0]).join(' | ')]);
  const big = jp.find(x => /^001 - /.test(x[0]));
  out.push(['the 3000×2000 sideways photo: turned upright, 1365×2048', big && big[1][0] === 1365 && big[1][1] === 2048, JSON.stringify(big)]);
  out.push(['all ≤ 2048 px, JPEG, orientation 1, date taken in EXIF', jp.every(x => Math.max(...x[1]) <= 2048 && x[2] === 'JPEG' && x[3] === 1 && /^2026:09:01 \d\d:\d\d:00$/.test(x[4] || '')), JSON.stringify(jp.find(x => !(x[3] === 1 && x[4]))||'')]);
  out.push(['GPS in EXIF where CompanyCam had it', jp.filter(x => x[5]).length === 50 || jp.filter(x => x[5]).length > 40, String(jp.filter(x => x[5]).length)]);
  const cl = csv.trim().split(/\r?\n/);
  out.push(['photo-list.csv: header + 198 rows, matches the files', cl.length === 199 && /^No\.,File name,Room \/ area,Caption,Tag,Date,Time/.test(cl[0]) && cl.slice(1).every((l, k) => l.startsWith((k + 1) + ',' + jp[k][0] + ',')), cl.slice(0, 3).join(' / ').slice(0, 300)]);
  out.push(['GPS column filled for photos with coordinates', cl.some(l => /"35\.\d{6}, -89\.800000"/.test(l))]);
  await p.click('#xp-ov [data-x="close"]').catch(() => {});

  /* ── 2. the insurance claim's 📸 Photos tab ── */
  await p.evaluate(() => window._gcPhotos && window._gcPhotos.close && window._gcPhotos.close());
  await waitFor(c, () => window._gcClaims && window._gcClaims.get && window._gcClaims.get('CLX') && window._gcIns3 ? 1 : null, null, 30000, 300);
  await p.evaluate(() => { const A = window._gcIns4 && window._gcIns4.open ? window._gcIns4.open('CLX', 'gallery') : window._gcClaims.open({ claimId: 'CLX' }); return !!A; });
  await sleep(1500);
  await p.evaluate(() => { const t = document.querySelector('[data-a="tab"][data-v="gallery"]'); if (t) t.click(); });
  const cbtn = await waitFor(c, () => { const b = document.querySelector('[data-a="xpzip"]'); return b ? b.textContent : null; }, null, 20000, 300);
  out.push(['claim 📸 Photos tab has "📦 Photos for Xactimate"', /Photos for Xactimate/.test(cbtn || ''), cbtn]);
  if (cbtn) {
    await p.locator('[data-a="xpzip"]').first().scrollIntoViewIfNeeded().catch(() => {});
    await p.locator('[data-a="xpzip"]').first().evaluate(b => b.closest('.gcbb-panel').scrollIntoView()).catch(() => {});
    await p.screenshot({ path: SHOTS + '/5_button_claim.png' }).catch(() => {});
    await p.click('[data-a="xpzip"]');
    const crows = await waitFor(c, () => { const n = document.querySelectorAll('#xp-ov .xp-row').length; return n ? n : null; }, null, 40000, 300);
    const csub = await p.evaluate(() => (document.querySelector('#xp-ov .xp-sub') || {}).textContent);
    out.push(['…opens the picker with the job\'s photos (CompanyCam loaded from the claim)', crows === N - 2 && /HO-7001/.test(csub || ''), crows + ' ' + csub]);
    await p.screenshot({ path: SHOTS + '/6_picker_from_claim.png' }).catch(() => {});
    await p.keyboard.press('Escape'); await sleep(300);
    out.push(['Esc closes the picker', await p.evaluate(() => !document.getElementById('xp-ov'))]);
  }
  const errs = c.errs.filter(e => /xp|XPC|Xact|gcu|Photo/i.test(e));
  out.push(['no page errors from the picker', errs.length === 0, errs.slice(0, 3).join(' | ')]);
  await c.b.close();

  /* ── 3. Marketing Manager: no button, no door ── */
  const m = await computer('XPM', { build });
  await mocks(m);
  await signIn(m, 'mkt@grayco-cs.com', 12000);
  const mp = m.page();
  const mk = await mp.evaluate(async () => { for (let i = 0; i < 40 && !(window._gcPhotos && window._gcPhotos.xactOk); i++) await new Promise(r => setTimeout(r, 250)); return { ok: window._gcPhotos.xactOk(), opened: await window._gcPhotos.xact('P6') }; });
  out.push(['Marketing Manager: not allowed, nothing opens', mk.ok === false && mk.opened === false && await mp.evaluate(() => !document.getElementById('xp-ov')), JSON.stringify(mk)]);
  await m.b.close();
  /* ── 4. Insurance staff: allowed ── */
  const ins = await computer('XPI', { build });
  await mocks(ins);
  await signIn(ins, 'ins@grayco-cs.com', 12000);
  const ik = await ins.page().evaluate(async () => { for (let i = 0; i < 40 && !(window._gcPhotos && window._gcPhotos.xactOk); i++) await new Promise(r => setTimeout(r, 250)); return window._gcPhotos.xactOk(); });
  out.push(['Insurance staff: allowed', ik === true]);
  await ins.b.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  return out;
}
