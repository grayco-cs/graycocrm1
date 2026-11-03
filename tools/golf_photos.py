#!/usr/bin/env python3
"""patch TVFIX — the ⛳ Golf look's photos (owner 11/02: "famous courses as background photos, each screen a different photo").

Fetches each chosen Wikimedia Commons file, READS ITS LICENCE FROM COMMONS (imageinfo + extmetadata) and keeps it only if it is
public domain, CC0, CC BY or CC BY-SA; fits it to 1920×1080 JPEG (200–460 KB) in img/tv/golf/, and writes
  img/tv/golf/golf.json    [{ f, course, detail, author, lic, page }]   — what tools/tvfix.js reads (the on-screen caption)
  img/tv/golf/CREDITS.txt  file · course · author · licence · Commons file page
Slow on purpose (Wikimedia rate limits): one request every ~10 s, a descriptive User-Agent, patient on 429.
Run it from a machine that can reach commons.wikimedia.org / upload.wikimedia.org:
  python3 tools/golf_photos.py            (all)        python3 tools/golf_photos.py --dry   (licences only, no download)
Then python3 tools/patch_TVFIX.py (no change needed: tvfix.js reads golf.json) and commit img/tv/golf/."""
import html, io, json, os, re, sys, time, urllib.parse, urllib.request

UA = 'GrayCoCRM-TVFIX/1.0 (https://crm.grayco-cs.com; wjohnson@grayco-cs.com) python-urllib'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'img', 'tv', 'golf')
OK_LIC = re.compile(r'^(public domain|pd(-[a-z0-9-]+)?|cc0( 1\.0)?|cc by [0-9.]+|cc by-sa [0-9.]+)$', re.I)

# slug, Commons file (title or pageid), course, detail — chosen from Commons searches on 11/02 (licences re-checked when run)
PICKS = [
    ('pebble-beach', 'File:Pebble Beach Golf Links 04.jpg', 'Pebble Beach Golf Links', 'Monterey Peninsula, California'),
    ('pebble-beach-18', 'File:Pebble Beach 18th hole.jpg', 'Pebble Beach Golf Links', '18th hole'),
    ('st-andrews-swilcan', 'File:Swilken Bridge with North Sea beyond.jpg', 'The Old Course, St Andrews', 'Swilcan Bridge'),
    ('st-andrews', 'File:Old Course, St Andrews, 2006 (04).jpg', 'The Old Course, St Andrews', 'Scotland'),
    ('augusta', 'File:AGNC-18.jpg', 'Augusta National Golf Club', 'home of the Masters'),
    ('sawgrass-17', 'File:Players Championship - 2014 - 17th hole (13978732568).jpg', 'TPC Sawgrass', '17th hole, the island green'),
    ('pinehurst-2', 'File:Pinehurst No. 2.JPG', 'Pinehurst No. 2', 'North Carolina'),
    ('banff-springs', 157163248, 'Banff Springs Golf Course', 'Canadian Rockies, Alberta'),
    ('banff-springs-2', 66193850, 'Banff Springs Golf Course', 'Canadian Rockies, Alberta'),
    ('jasper-park', 35796568, 'Jasper Park Lodge Golf Course', 'Canadian Rockies, Alberta'),
    ('crans-sur-sierre', 1112705, 'Golf-Club Crans-sur-Sierre', 'Swiss Alps'),
    ('royal-county-down', 144131252, 'Royal County Down', 'Newcastle, Northern Ireland'),
]


def get(params, tries=40):
    url = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(dict(params, format='json'))
    for _ in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA, 'Api-User-Agent': UA}), timeout=60) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 429: print('  429 — waiting 2 min', flush=True); time.sleep(120); continue
            raise
    raise RuntimeError('Commons kept answering 429')


def fetch(url, tries=40):
    for _ in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=120) as r: return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429: print('  429 — waiting 2 min', flush=True); time.sleep(120); continue
            raise
    raise RuntimeError('upload.wikimedia.org kept answering 429')


def text(v):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', v or ''))).strip()


def info(pick):
    p = {'action': 'query', 'prop': 'imageinfo', 'iiprop': 'url|size|extmetadata', 'iiurlwidth': 2400,
         'iiextmetadatafilter': 'LicenseShortName|Artist|Credit|Restrictions'}
    if isinstance(pick[1], int): p['pageids'] = pick[1]
    else: p['titles'] = pick[1]
    pg = list(get(p)['query']['pages'].values())[0]
    ii = (pg.get('imageinfo') or [{}])[0]; m = ii.get('extmetadata') or {}
    v = lambda k: (m.get(k) or {}).get('value', '')
    return {'title': pg.get('title'), 'thumb': ii.get('thumburl') or ii.get('url'), 'page': ii.get('descriptionurl'), 'w': ii.get('width'), 'h': ii.get('height'),
            'lic': text(v('LicenseShortName')), 'author': text(v('Artist')) or text(v('Credit')), 'restr': text(v('Restrictions'))}


def fit(raw, dst):
    from PIL import Image, ImageOps
    im = Image.open(io.BytesIO(raw)).convert('RGB')
    out = ImageOps.fit(im, (1920, 1080), Image.LANCZOS, centering=(0.5, 0.5))
    for q in (84, 80, 76, 72, 68, 64, 60):
        out.save(dst, 'JPEG', quality=q, optimize=True, progressive=True)
        if os.path.getsize(dst) <= 460000: break
    return os.path.getsize(dst)


def main():
    dry = '--dry' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    keep, credits = [], []
    for pick in PICKS:
        slug, _, course, detail = pick
        x = info(pick); time.sleep(10)
        lic = x['lic']; lic_show = 'public domain' if re.match(r'^(public domain|pd)', lic, re.I) else lic
        author = re.sub(r'\s*\(talk\)\s*', '', x['author'])[:60] or 'unknown'
        print('%-20s %-14s %-28s %s' % (slug, lic, author[:28], x['page']), flush=True)
        if not OK_LIC.match(lic): print('   ✗ skipped: licence not allowed', flush=True); continue
        if author == 'unknown' and not lic_show == 'public domain': print('   ✗ skipped: no author to credit', flush=True); continue
        if (x['w'] or 0) < 1600: print('   ✗ skipped: too small', flush=True); continue
        if x['restr']: print('   ! note: Commons lists restrictions: ' + x['restr'], flush=True)
        if dry: continue
        dst = os.path.join(OUT, slug + '.jpg')
        size = fit(fetch(x['thumb']), dst); time.sleep(10)
        if size < 200000: print('   ! small file (%d bytes) — kept' % size, flush=True)
        keep.append({'f': slug + '.jpg', 'course': course, 'detail': detail, 'author': author, 'lic': lic_show, 'page': x['page']})
        credits.append('%-24s %-30s %-34s %-16s %s' % (slug + '.jpg', course, author[:34], lic_show, x['page']))
    if dry: return
    json.dump(keep, open(os.path.join(OUT, 'golf.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(os.path.join(OUT, 'CREDITS.txt'), 'w', encoding='utf-8').write(
        'Golf course photos for the back office TV\'s ⛳ Golf look (patch TVFIX, tools/golf_photos.py).\n'
        'Each is a Wikimedia Commons file; its licence and author were read from Commons when it was fetched. Only public domain,\n'
        'CC0, CC BY and CC BY-SA files are used; the author and licence are shown on screen in the caption and listed here with the\n'
        'Commons file page. Each was fitted to 1920×1080 JPEG (a crop of the original; CC BY-SA files keep their licence).\n\n'
        + '%-24s %-30s %-34s %-16s %s\n' % ('file', 'course', 'author', 'licence', 'Commons file page') + '\n'.join(credits) + '\n')
    print('%d photos → %s' % (len(keep), OUT))


if __name__ == '__main__':
    main()
