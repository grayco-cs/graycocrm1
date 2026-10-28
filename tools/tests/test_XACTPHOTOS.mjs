/* patch XACTPHOTOS tests — made-up photos only.
   node tools/tests/test_XACTPHOTOS.mjs                 → the pure part (tools/xactphotos_core.js): order, names, private skip, CSV,
                                                           captions, ZIP name, EXIF (read back with Python PIL), STORE ZIP (unzip -t + zipfile)
   node tools/tests/test_XACTPHOTOS.mjs --browser <dir> → + tools/tests/xactphotos_browser.mjs (offline harness, demo photos) */
import fs from 'fs';
import os from 'os';
import path from 'path';
import vm from 'vm';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
process.env.TZ = process.env.TZ || 'America/Chicago';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
let pass = 0, fail = 0;
function ok(name, cond, extra){ if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } }
const CORE_SRC = fs.readFileSync(path.join(ROOT, 'tools/xactphotos_core.js'), 'utf8');
const ctx = { TextEncoder, Buffer, Date, Math, String, Array, Uint8Array, Int32Array, DataView, isFinite, JSON };
vm.createContext(ctx); vm.runInContext(CORE_SRC + '\nthis.XPC = XPC;', ctx);
const X = ctx.XPC;
const idx = process.argv.includes('--index') ? process.argv[process.argv.indexOf('--index') + 1] : path.join(ROOT, 'index.html');
if (fs.existsSync(idx)) ok('index.html carries the core verbatim (patched)', fs.readFileSync(idx, 'utf8').includes(CORE_SRC.trimEnd()));

console.log('names');
const at = '2026-09-01T15:04:05Z';   /* 10:04 in Chicago */
ok('basic', X.name(1, 12, 'Kitchen', 'Water stain on ceiling', at) === '001 - Kitchen - Water stain on ceiling - 2026-09-01.jpg', X.name(1, 12, 'Kitchen', 'Water stain on ceiling', at));
ok('no room', X.name(7, 12, '', 'Damage', at) === '007 - Damage - 2026-09-01.jpg');
ok('4 digits past 999', X.name(5, 1200, 'Roof', 'Hail hit', at) === '0005 - Roof - Hail hit - 2026-09-01.jpg');
const bad = X.name(2, 9, 'Bath / Hall: "2nd"', 'C:\\temp*?<x>|y\nline2 café — ok', at);
ok('unsafe characters removed', !/[\\/:*?"<>|\n]/.test(bad) && /cafe/.test(bad), bad);
const long = X.name(3, 9, 'Master bedroom closet north wall', 'Very long caption '.repeat(10), at);
ok('≤ 80 characters, still ends in the date', long.length <= 80 && /- 2026-09-01\.jpg$/.test(long) && /^003 - /.test(long), long + ' (' + long.length + ')');
ok('caption equal to the room is not repeated', X.name(1, 1, 'Kitchen', 'kitchen', at) === '001 - Kitchen - 2026-09-01.jpg');
ok('no caption: room only; nothing at all → Photo', X.name(3, 9, 'Kitchen', '', at) === '003 - Kitchen - 2026-09-01.jpg' && X.name(4, 9, '', '', at) === '004 - Photo - 2026-09-01.jpg');
ok('no date', X.name(1, 1, 'Roof', 'Ridge', '') === '001 - Roof - Ridge.jpg');
ok('zip name: claim # + insured', X.zipName({ claimNo: 'HO-55/123', insured: 'Sample Owner', po: 'PO-1006' }) === 'HO-55-123 Sample Owner photos.zip', X.zipName({ claimNo: 'HO-55/123', insured: 'Sample Owner' }));
ok('zip name: PO + job when no claim', X.zipName({ claimNo: '', po: 'PO-1006', insured: '', job: 'Demo Porch 2026' }) === 'PO-1006 Demo Porch 2026 photos.zip');

console.log('rooms, order, private');
const T = (m) => new Date(Date.parse('2026-09-01T12:00:00Z') + m * 60000).toISOString();
const L = [
  { id: 'a', at: T(5), labels: ['Kitchen'], note: 'Cabinet base swollen', tag: 'Damage' },
  { id: 'b', at: T(1), labels: ['Roof', 'Before'], tag: 'Before', lat: 35.2, lng: -89.8 },
  { id: 'c', at: T(3), labels: ['Kitchen'], note: 'Ceiling stain\nsecond line' },
  { id: 'd', at: T(2), tag: 'During' },                                  /* no room */
  { id: 'e', at: T(4), labels: ['Roof'], note: 'Ridge cap' },
  { id: 'f', at: T(6), labels: ['Private'], note: 'Homeowner ID' },          /* left out */
  { id: 'g', at: T(7), tag: 'After', note: 'do not share — safe code' },   /* note alone does not make it private */
  { id: 'h', at: T(8), labels: ['Do Not Share'] },                         /* left out */
  { id: 'i', at: T(0), room: 'Living room', note: 'Overview' },
  { id: 'j', at: T(9), tag: 'Damage' }
];
const ai = r => r.id === 'j' ? { area: 'Garage' } : r.id === 'd' ? { area: 'unknown' } : null;
const P = X.plan(L, { ai });
ok('private / do-not-share photos are left out', P.skipped.map(r => r.id).sort().join() === 'f,h', P.skipped.map(r => r.id).join());
ok('rooms in walk-through order, then time; no room last', P.rows.map(x => x.r.id).join() === 'i,b,e,c,a,j,d,g', P.rows.map(x => x.r.id + ':' + x.room).join(' '));
ok('room from the field, a CompanyCam label (not a stage word), then the AI area', P.rows.map(x => x.room).join('|') === 'Living room|Roof|Roof|Kitchen|Kitchen|Garage||', P.rows.map(x => x.room).join('|'));
ok('numbers 1..n with no gap', P.rows.map(x => x.n).join() === '1,2,3,4,5,6,7,8');
ok('caption: note first line, else tag', P.rows.find(x => x.r.id === 'c').caption === 'Ceiling stain' && P.rows.find(x => x.r.id === 'b').caption === 'Before' && P.rows.find(x => x.r.id === 'j').caption === 'Damage');
ok('file names', P.rows[0].name === '001 - Living room - Overview - 2026-09-01.jpg' && P.rows[1].name === '002 - Roof - Before - 2026-09-01.jpg' && P.rows[7].name === '008 - do not share - safe code - 2026-09-01.jpg', P.rows.map(x => x.name).join(' | '));
ok('every name unique and ≤ 80', new Set(P.rows.map(x => x.name)).size === P.rows.length && P.rows.every(x => x.name.length <= 80));
ok('stable for the same input', X.plan(L.slice().reverse(), { ai }).rows.map(x => x.name).join() === P.rows.map(x => x.name).join());

console.log('csv');
const csv = X.csv(P.rows), lines = csv.replace(/^\ufeff/, '').trim().split('\r\n');
ok('BOM + header + one line per photo', csv.charCodeAt(0) === 0xfeff && lines.length === 9 && lines[0] === 'No.,File name,Room / area,Caption,Tag,Date,Time,GPS (lat, lng),Taken by'.replace('GPS (lat, lng)', '"GPS (lat, lng)"'), lines[0]);
ok('row: number, name, room, caption, tag, date, time, GPS', lines[2] === '2,002 - Roof - Before - 2026-09-01.jpg,Roof,Before,Before,2026-09-01,07:01,"35.200000, -89.800000",', lines[2]);
ok('no GPS → empty', lines[1].endsWith(',07:00,,'), lines[1]);
const inj = X.csv(X.plan([{ id: 'z', at: T(1), note: '=HYPERLINK("x")' }]).rows).split('\r\n')[1];
ok('formula-looking text is defused', /,"'=HYPERLINK\(""x""\)",/.test(inj), inj);
ok('captions text: one line per photo', X.captions(P.rows).trim().split('\n').length === 8 && X.captions(P.rows).startsWith('001 - Living room - Overview - 2026-09-01'));

console.log('crc + zip + exif');
ok('crc32("123456789") = cbf43926', X.crc32(Buffer.from('123456789')) === 0xcbf43926);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xp-'));
const py = (code, ...args) => execFileSync('python3', ['-I', '-c', code, ...args], { encoding: 'utf8' });
/* a real 3000×2000 JPEG from PIL, then EXIF in */
const src = path.join(tmp, 'src.jpg');
py('import sys\nfrom PIL import Image\nImage.new("RGB",(300,200),(200,40,40)).save(sys.argv[1],"JPEG",quality=85)', src);
const raw = fs.readFileSync(src);
const withE = X.withExif(new Uint8Array(raw), { at: '2026-09-01T15:04:05Z', lat: 35.123456, lng: -89.654321 });
fs.writeFileSync(path.join(tmp, 'ex.jpg'), withE);
const rd = JSON.parse(py(`import sys, json
from PIL import Image
im = Image.open(sys.argv[1]); im.load(); e = im.getexif(); x = e.get_ifd(0x8769); g = e.get_ifd(0x8825)
def deg(v): return float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600
print(json.dumps({ 'size': im.size, 'orient': e.get(0x0112), 'dt': e.get(0x0132), 'dto': x.get(0x9003), 'lat': deg(g[2]) * (-1 if g[1] == 'S' else 1), 'lng': deg(g[4]) * (-1 if g[3] == 'W' else 1), 'ref': [g[1], g[3]] }))`, path.join(tmp, 'ex.jpg')));
ok('EXIF read back: date taken (local time), orientation 1', rd.dto === '2026:09:01 10:04:05' && rd.dt === '2026:09:01 10:04:05' && rd.orient === 1, JSON.stringify(rd));
ok('EXIF read back: GPS', Math.abs(rd.lat - 35.123456) < 1e-4 && Math.abs(rd.lng + 89.654321) < 1e-4 && rd.ref.join() === 'N,W', JSON.stringify(rd));
ok('image still decodes, same size', rd.size[0] === 300 && rd.size[1] === 200);
const noG = X.withExif(new Uint8Array(raw), { at: '2026-09-01T15:04:05Z' });
fs.writeFileSync(path.join(tmp, 'ex2.jpg'), noG);
ok('no GPS: still valid', py('import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]); im.load(); print(im.getexif().get_ifd(0x8769).get(0x9003))', path.join(tmp, 'ex2.jpg')).trim() === '2026:09:01 10:04:05');
const twice = X.withExif(withE, { at: '2026-09-02T15:04:05Z' });
fs.writeFileSync(path.join(tmp, 'ex3.jpg'), twice);
ok('an old Exif block is replaced, not stacked', py('import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]); im.load(); print(im.getexif().get_ifd(0x8769).get(0x9003))', path.join(tmp, 'ex3.jpg')).trim() === '2026:09:02 10:04:05'
  && Buffer.from(twice).toString('latin1').split('Exif\0\0').length === 2);
/* the ZIP */
const files = P.rows.map((x, k) => { const b = k === 0 ? Buffer.from(withE) : Buffer.from('photo ' + k); return { name: x.name, size: b.length, crc: X.crc32(b), at: x.r.at, data: b }; });
const cb = Buffer.from(csv, 'utf8'); files.push({ name: 'photo-list.csv', size: cb.length, crc: X.crc32(cb), at: T(0), data: cb });
const zp = path.join(tmp, 'Claim Sample photos.zip');
fs.writeFileSync(zp, Buffer.concat(X.zip(files).map(p => Buffer.from(p.buffer ? new Uint8Array(p.buffer, p.byteOffset, p.byteLength) : p))));
let tOk = ''; try { tOk = execFileSync('unzip', ['-t', zp], { encoding: 'utf8' }); } catch (e) { tOk = String(e.stdout || e); }
ok('unzip -t: no errors', /No errors detected/.test(tOk), tOk.slice(-200));
const zl = JSON.parse(py(`import sys, json, zipfile
z = zipfile.ZipFile(sys.argv[1]); print(json.dumps([[i.filename, i.file_size, i.compress_type, list(i.date_time)] for i in z.infolist()] + [z.read('photo-list.csv').decode('utf-8-sig').splitlines()[1]]))`, zp));
const csvLine = zl.pop();
ok('ZIP names and order = the plan, csv last', zl.map(x => x[0]).join('|') === P.rows.map(x => x.name).concat('photo-list.csv').join('|'), zl.map(x => x[0]).join('|'));
ok('ZIP sizes, stored', zl.every((x, k) => x[1] === files[k].size && x[2] === 0));
ok('ZIP entry time = photo time (local)', zl[0][3].join() === '2026,9,1,7,0,0', zl[0][3].join());
ok('csv readable from the ZIP', csvLine.startsWith('1,001 - Living room - Overview'), csvLine);

/* ── the browser ── */
const bi = process.argv.indexOf('--browser');
if (bi > 0) {
  const build = path.resolve(process.argv[bi + 1] || ROOT);
  const { browserCheck } = await import(path.join(HERE, 'xactphotos_browser.mjs'));
  const res = await browserCheck(build);
  console.log('browser');
  res.forEach(([n, c, e]) => ok(n, c, e));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log((fail ? 'FAILED ' : 'PASS ') + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
