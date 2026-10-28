/* XACTPHOTOS core (__GC_XACTPHOTOS_CORE__): the pure part of "📦 Photos for Xactimate" — no DOM, no network.
   order (room / area by first photo, then time) · file names Xactimate uses as photo titles · photo-list.csv ·
   a small EXIF block (date taken, GPS) for the resized JPEG · CRC-32 · a STORE ZIP writer (Blob parts, no copies).
   The same text is in index.html (patch_XACTPHOTOS.py) and is loaded as-is by tools/tests/test_XACTPHOTOS.mjs. */
var XPC = (function(){
  function s(v){ return v == null ? '' : String(v); }
  function low(v){ return s(v).toLowerCase(); }
  var STAGE = ['before', 'during', 'damage', 'after', 'punch', 'progress', 'final', 'photo', 'photos'];
  var PRIVATE = /\b(private|do[\s-]*not[\s-]*share|don'?t[\s-]*share|no[\s-]*share|internal[\s-]*only)\b/i;
  function p2(n){ return ('0' + n).slice(-2); }
  function dt(at){ var d = new Date(at); return isNaN(d) ? null : d; }
  function dayOf(at){ var d = dt(at); return d ? d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) : ''; }
  function timeOf(at){ var d = dt(at); return d ? p2(d.getHours()) + ':' + p2(d.getMinutes()) : ''; }
  /* a file-name piece: letters, digits, space and - _ ( ) , . ' & + ; accents folded; never a slash, colon, quote or control */
  function safe(t){
    var x = s(t).replace(/[\r\n\t]+/g, ' ');
    try { x = x.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
    x = x.replace(/[–—\/\\|]/g, '-').replace(/[‘’`]/g, "'").replace(/[^A-Za-z0-9 _\-(),.'&+]+/g, ' ').replace(/\s+/g, ' ').replace(/\s*-\s*-[\s-]*/g, ' - ');
    return x.replace(/^[\s.\-,]+/, '').replace(/[\s.\-,]+$/, '');
  }
  function labelsOf(r){ return [].concat(Array.isArray(r && r.labels) ? r.labels : [], Array.isArray(r && r.tags) ? r.tags : []).map(function(x){ return s(x && (x.display_value || x.value || x.name) || x).trim(); }).filter(Boolean); }
  function isPrivate(r){
    if (!r) return true;
    if (r.private === true || r.doNotShare === true || r.noShare === true) return true;
    return [s(r.tag)].concat(labelsOf(r)).some(function(t){ return PRIVATE.test(t); });
  }
  /* the room / area: the record's own field, a CompanyCam label that is not a stage word, then the AI tag's area */
  function roomOf(r, ai){
    var own = s(r && (r.room || r.area || r.location)).trim(); if (own) return own;
    var tg = low(r && r.tag), l = labelsOf(r).filter(function(t){ var k = low(t); return STAGE.indexOf(k) < 0 && k !== tg && !PRIVATE.test(t); });
    if (l.length) return l[0];
    var a = ai && s(ai.area).trim(); return a && !/^(unknown|n\/?a|none|other)$/i.test(a) ? a : '';
  }
  function captionOf(r){
    var n = s(r && (r.note || r.caption || r.description)).split(/\r?\n/)[0].trim();
    return n || s(r && r.tag).trim();
  }
  /* rooms in the order the crew first photographed them (a walk-through), photos without a room last; inside a room, by time */
  function order(list, roomFn){
    var rows = list.map(function(r, i){ return { r: r, room: s(roomFn ? roomFn(r) : roomOf(r)), t: Date.parse(r && r.at) || 0, i: i }; });
    var first = {};
    rows.slice().sort(function(a, b){ return a.t - b.t || a.i - b.i; }).forEach(function(x, k){ var key = low(x.room); if (key && !(key in first)) first[key] = k; });
    return rows.sort(function(a, b){
      var ka = low(a.room), kb = low(b.room);
      if (ka !== kb) { if (!ka) return 1; if (!kb) return -1; return first[ka] - first[kb]; }
      return a.t - b.t || (s(a.r.id) < s(b.r.id) ? -1 : s(a.r.id) > s(b.r.id) ? 1 : a.i - b.i);
    });
  }
  /* "001 - Kitchen - Water stain on ceiling - 2026-09-01.jpg", at most 80 characters */
  function name(n, total, room, caption, at, max){
    max = max || 80;
    var w = Math.max(3, String(total || n).length), num = ('000000' + n).slice(-w), day = dayOf(at), ext = '.jpg';
    var rm = safe(room).slice(0, 24).replace(/[\s.\-,]+$/, ''), cap = safe(caption) || (rm ? '' : 'Photo');
    if (rm && low(cap) === low(rm)) cap = '';
    var head = num + (rm ? ' - ' + rm : ''), tail = (day ? ' - ' + day : '') + ext;
    var room_ = max - head.length - tail.length - 3;
    if (cap && room_ >= 4) { cap = cap.slice(0, room_).replace(/[\s.\-,(&+]+$/, ''); return head + (cap ? ' - ' + cap : '') + tail; }
    return (head + tail).slice(-max);
  }
  /* the whole plan: skip private, order, number, name */
  function plan(list, opt){
    opt = opt || {};
    var keep = [], skipped = [];
    (list || []).forEach(function(r){ (isPrivate(r) ? skipped : keep).push(r); });
    var roomFn = function(r){ return roomOf(r, opt.ai ? opt.ai(r) : null); };
    var rows = order(keep, roomFn);
    rows.forEach(function(x, k){ x.n = k + 1; x.caption = captionOf(x.r); x.name = name(k + 1, rows.length, x.room, x.caption, x.r.at, opt.max); });
    return { rows: rows, skipped: skipped };
  }
  function cell(v){ var t = s(v).replace(/\r?\n/g, ' '); if (/^[=+\-@\t]/.test(t)) t = "'" + t; return /[",]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }
  function gps(r){ var a = r && r.lat, b = r && (r.lng != null ? r.lng : r.lon); return a != null && b != null && a !== '' && b !== '' && isFinite(a) && isFinite(b) ? (+a).toFixed(6) + ', ' + (+b).toFixed(6) : ''; }
  function csv(rows){
    var head = ['No.', 'File name', 'Room / area', 'Caption', 'Tag', 'Date', 'Time', 'GPS (lat, lng)', 'Taken by'];
    return '﻿' + [head].concat(rows.map(function(x){ var r = x.r; return [x.n, x.name, x.room, x.caption, r.tag || '', dayOf(r.at), timeOf(r.at), gps(r), r.by || '']; }))
      .map(function(l){ return l.map(cell).join(','); }).join('\r\n') + '\r\n';
  }
  function captions(rows){ return rows.map(function(x){ return x.name.replace(/\.jpg$/, '') + (x.caption && x.name.indexOf(safe(x.caption)) < 0 ? '  — ' + x.caption : ''); }).join('\n') + '\n'; }

  /* ── EXIF (big-endian TIFF): Orientation 1, DateTime, DateTimeOriginal, DateTimeDigitized, GPS when known ── */
  function exifDate(at){ var d = dt(at); return d ? d.getFullYear() + ':' + p2(d.getMonth() + 1) + ':' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) : ''; }
  function exifBlock(o){
    var date = exifDate(o && o.at), lat = o && o.lat, lng = o && (o.lng != null ? o.lng : o.lon);
    var hasG = lat != null && lng != null && lat !== '' && lng !== '' && isFinite(lat) && isFinite(lng) && !(+lat === 0 && +lng === 0);
    /* layout: IFD0 at 8, then ExifIFD, then GPS IFD, then the data area */
    var ifd0 = [[0x0112, 3, 1, 1]], exif = [], gpsE = [], data = [], dataOff;
    var n0 = 1 + (date ? 2 : 0) + (hasG ? 1 : 0), nE = date ? 2 : 0, nG = hasG ? 5 : 0;
    var off0 = 8, offE = off0 + 2 + n0 * 12 + 4, offG = offE + (nE ? 2 + nE * 12 + 4 : 0); dataOff = offG + (nG ? 2 + nG * 12 + 4 : 0);
    function put(bytes){ var at = dataOff; data.push(bytes); dataOff += bytes.length + (bytes.length & 1); if (bytes.length & 1) data.push([0]); return at; }
    function ascii(t){ var b = []; for (var i = 0; i < t.length; i++) b.push(t.charCodeAt(i) & 0x7f); b.push(0); return b; }
    function rats(v){ v = Math.abs(+v); var d = Math.floor(v), mf = (v - d) * 60, m = Math.floor(mf), sec = Math.round((mf - m) * 60 * 1000); var out = []; [[d, 1], [m, 1], [sec, 1000]].forEach(function(p){ out.push(p[0] >>> 24 & 255, p[0] >>> 16 & 255, p[0] >>> 8 & 255, p[0] & 255, p[1] >>> 24 & 255, p[1] >>> 16 & 255, p[1] >>> 8 & 255, p[1] & 255); }); return out; }
    if (date) { var dB = ascii(date); ifd0.push([0x0132, 2, dB.length, put(dB)]); ifd0.push([0x8769, 4, 1, offE]); exif.push([0x9003, 2, dB.length, put(dB.slice())]); exif.push([0x9004, 2, dB.length, put(dB.slice())]); }
    if (hasG) {
      ifd0.push([0x8825, 4, 1, offG]);
      gpsE.push([0x0000, 1, 4, 0x02020000, 'inl']);
      gpsE.push([0x0001, 2, 2, (+lat < 0 ? 0x53 : 0x4E) << 24, 'inl']); gpsE.push([0x0002, 5, 3, put(rats(lat))]);
      gpsE.push([0x0003, 2, 2, (+lng < 0 ? 0x57 : 0x45) << 24, 'inl']); gpsE.push([0x0004, 5, 3, put(rats(lng))]);
    }
    ifd0.sort(function(a, b){ return a[0] - b[0]; });
    var total = dataOff, b = new Uint8Array(total), v = new DataView(b.buffer);
    b[0] = 0x4D; b[1] = 0x4D; v.setUint16(2, 42); v.setUint32(4, 8);
    function ifd(at, list){
      if (!list.length) return;
      v.setUint16(at, list.length); var p = at + 2;
      list.forEach(function(e){ v.setUint16(p, e[0]); v.setUint16(p + 2, e[1]); v.setUint32(p + 4, e[2]); if (e[1] === 3 && e[2] === 1) { v.setUint16(p + 8, e[3]); v.setUint16(p + 10, 0); } else v.setUint32(p + 8, e[3] >>> 0); p += 12; });
      v.setUint32(p, 0);
    }
    ifd(off0, ifd0); ifd(offE, exif); ifd(offG, gpsE);
    var q = (offG + (nG ? 2 + nG * 12 + 4 : 0)); data.forEach(function(arr_){ for (var i = 0; i < arr_.length; i++) b[q++] = arr_[i]; });
    var seg = new Uint8Array(4 + 6 + total), sv = new DataView(seg.buffer);
    seg[0] = 0xFF; seg[1] = 0xE1; sv.setUint16(2, 2 + 6 + total);
    seg.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4); seg.set(b, 10);
    return seg;
  }
  /* a JPEG with the EXIF block put after SOI (and after a JFIF APP0 when there is one); any old APP1 Exif is dropped */
  function withExif(jpg, o){
    var a = jpg instanceof Uint8Array ? jpg : new Uint8Array(jpg);
    if (a.length < 4 || a[0] !== 0xFF || a[1] !== 0xD8) return a;
    var p = 2, keep = [], cut = 2;
    while (p + 4 <= a.length && a[p] === 0xFF) {
      var m = a[p + 1], len = (a[p + 2] << 8) | a[p + 3];
      if (m === 0xDA || m < 0xE0 || m > 0xEF) break;
      var isExif = m === 0xE1 && a[p + 4] === 0x45 && a[p + 5] === 0x78 && a[p + 6] === 0x69 && a[p + 7] === 0x66;
      if (m === 0xE0 && p === 2) { keep.push(a.subarray(p, p + 2 + len)); cut = p + 2 + len; }
      else if (isExif) { keep.push(null); }
      else keep.push(a.subarray(p, p + 2 + len));
      p += 2 + len;
    }
    var ex = exifBlock(o), parts = [a.subarray(0, 2)];
    var app0 = cut > 2 ? keep.shift() : null; if (app0) parts.push(app0);
    parts.push(ex); keep.forEach(function(k){ if (k) parts.push(k); }); parts.push(a.subarray(p));
    var n = 0; parts.forEach(function(x){ n += x.length; });
    var out = new Uint8Array(n), q = 0; parts.forEach(function(x){ out.set(x, q); q += x.length; });
    return out;
  }

  /* ── CRC-32 and a STORE ZIP (UTF-8 names, DOS time = the photo's time) ── */
  var CRC_T = null;
  function crc32(u8, crc){
    if (!CRC_T) { CRC_T = new Int32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c; } }
    var x = crc == null ? -1 : ~crc;
    for (var i = 0; i < u8.length; i++) x = CRC_T[(x ^ u8[i]) & 255] ^ (x >>> 8);
    return ~x >>> 0;
  }
  function utf8(t){ if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(t); var b = Buffer.from(t, 'utf8'); return new Uint8Array(b.buffer, b.byteOffset, b.length); }
  function dos(at){ var d = dt(at) || new Date(); var y = Math.max(1980, d.getFullYear()); return { t: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), d: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }; }
  /* entries: [{ name, size, crc, at, data }] → [header bytes, data, header bytes, data, …, central directory]; data is passed through (Blob or bytes) */
  function zip(entries){
    var parts = [], cen = [], off = 0;
    entries.forEach(function(e){
      var nm = utf8(e.name), t = dos(e.at), h = new Uint8Array(30 + nm.length), v = new DataView(h.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 10, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true); v.setUint16(10, t.t, true); v.setUint16(12, t.d, true);
      v.setUint32(14, e.crc >>> 0, true); v.setUint32(18, e.size, true); v.setUint32(22, e.size, true); v.setUint16(26, nm.length, true); v.setUint16(28, 0, true); h.set(nm, 30);
      var c = new Uint8Array(46 + nm.length), w = new DataView(c.buffer);
      w.setUint32(0, 0x02014b50, true); w.setUint16(4, 0x031E, true); w.setUint16(6, 10, true); w.setUint16(8, 0x0800, true); w.setUint16(10, 0, true); w.setUint16(12, t.t, true); w.setUint16(14, t.d, true);
      w.setUint32(16, e.crc >>> 0, true); w.setUint32(20, e.size, true); w.setUint32(24, e.size, true); w.setUint16(28, nm.length, true); w.setUint16(30, 0, true); w.setUint16(32, 0, true);
      w.setUint16(34, 0, true); w.setUint16(36, 0, true); w.setUint32(38, 0x81A40000, true); w.setUint32(42, off, true); c.set(nm, 46);
      parts.push(h, e.data); cen.push(c); off += h.length + e.size;
    });
    var cl = 0; cen.forEach(function(c){ cl += c.length; });
    var end = new Uint8Array(22), v2 = new DataView(end.buffer);
    v2.setUint32(0, 0x06054b50, true); v2.setUint16(8, entries.length, true); v2.setUint16(10, entries.length, true); v2.setUint32(12, cl, true); v2.setUint32(16, off, true);
    return parts.concat(cen, [end]);
  }
  function zipName(o){
    var id = safe(o && o.claimNo) || safe(o && o.po), who = safe(o && (o.insured || o.job)) || 'Job';
    return ((id ? id + ' ' : '') + who).slice(0, 90).replace(/[\s.\-,]+$/, '') + ' photos.zip';
  }
  var HOWTO = 'Xactimate desktop: open the estimate → Photos → Import → pick the unzipped folder (or drag the photos in). Xactimate Online/mobile: Photos → Upload → select all.';
  return { safe: safe, isPrivate: isPrivate, roomOf: roomOf, captionOf: captionOf, order: order, name: name, plan: plan, csv: csv, captions: captions, dayOf: dayOf,
    exifBlock: exifBlock, withExif: withExif, exifDate: exifDate, crc32: crc32, zip: zip, zipName: zipName, HOWTO: HOWTO };
})();
