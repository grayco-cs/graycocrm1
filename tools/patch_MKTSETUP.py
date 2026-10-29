#!/usr/bin/env python3
"""Idempotent patch MKTSETUP: 🧰 Marketing setup — a checklist in 🔗 Marketing logins (builds on patch MM + MMTABS).

    python3 tools/patch_MKTSETUP.py [repo-root]      (default: the current directory)

Owner (29 Oct 2026): "is all of these marketing sign ups available for malcolm marketing manager to do, sign up for etc
without my passwords and involvement directly with our crm, i need all pages needed for marketing available in crm and
easily accessible for him and admin".

index.html
  1. <script id="gc-patch-mktsetup"> (tools/mktsetup_tail.js, ITEMS below) after gc-patch-mmtabs: one card per platform
     (what it is for, the direct link, who does what with the exact menu path, the status), the progress ("7 of 19 done");
     the Marketing Manager and admins see it in 🔗 Marketing logins, admins also get a progress card on 📣 Marketing.
netlify/functions/_lib/mm.js
  2. setupRead / setupSet: the statuses in gc_kv gc_mkt_admin.setup (the admins' settings row he can never write
     otherwise): a known card, one of four statuses, "Admin only" cards (Resend) only by an admin. setSettings no longer
     writes over the row when it could not be read.
netlify/functions/soc.js
  3. op mkt_setup (read) / mkt_setup_set { key, status }: the Marketing Manager (his own profile path, redacted answer)
     and admins; nobody else.
No password or API key is asked for, shown or kept. Every find-string must match exactly once; a file that already
carries the MKTSETUP marker is left alone.
"""
import json, os, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
HERE = os.path.dirname(os.path.abspath(__file__))
MARK = 'MKTSETUP'
TAIL = open(os.path.join(HERE, 'mktsetup_tail.js'), encoding='utf-8').read().rstrip('\n')

LSA_URL = 'https://ads.google.com/local-services-ads/'
INTAKE = 'https://crm.grayco-cs.com/.netlify/functions/lead-intake'
MAIN = '(901) 585-0944'
# {MM} = the Marketing Manager's e-mail, {MMN} = his first name (filled in the page; no name is in the code).
# mode: grant (owner adds him once) · self (he signs up with accounts@) · both · check · admin (admin only)
ITEMS = [
    dict(k='acctmail', ic='✉️', l='accounts@grayco-cs.com (sign-up codes)', mode='grant', url='https://mail.google.com/', go='Open Gmail',
         d='The company sign-up e-mail: the confirmation codes of every account below arrive here, so GrayCo owns the accounts.',
         own=['Sign in to Gmail as accounts@grayco-cs.com → ⚙ (top right) → See all settings → Accounts → "Grant access to your account" → Add another account → {MM} → Next step → Send e-mail to grant access.',
              'Works for a @grayco-cs.com address (Google Admin → Apps → Google Workspace → Gmail → User settings → Mail delegation must be on — an admin turns it on once). Otherwise an admin forwards him each code when he asks.'],
         mm=['Accept the access e-mail; then Gmail → your picture (top right) → accounts@grayco-cs.com opens the codes. No password is shared.',
             'Use accounts@grayco-cs.com for every card marked "signs up himself".']),
    dict(k='ga', ic='📊', l='Google Analytics', mode='grant', url='https://analytics.google.com/',
         d='Website visitors: where they came from and which pages turn into calls and form leads.',
         own=['analytics.google.com (as the owner) → Admin (gear, bottom left).',
              'Account column → Account access management → blue ＋ (top right) → Add users.',
              'E-mail {MM} → role Marketer (Editor if he must change the property) → tick "Notify new users by e-mail" → Add.'],
         mm=['Accept the invite and check the GrayCo property shows visitors.',
             'If the website has no Measurement ID: website editor → Footer, Google & social links → Google Analytics Measurement ID (G-…).']),
    dict(k='gsc', ic='🔎', l='Google Search Console', mode='grant', url='https://search.google.com/search-console?resource_id=sc-domain:grayco-cs.com',
         d='How grayco-cs.com shows in Google search: queries, clicks, pages Google cannot read (property sc-domain:grayco-cs.com).',
         own=['Search Console → property sc-domain:grayco-cs.com (the Domain property).',
              'Settings (left menu, bottom) → Users and permissions → ADD USER.',
              'E-mail {MM} → Permission Full → Add.'],
         mm=['Open the link: sc-domain:grayco-cs.com is in his property list.',
             'Sitemaps → submit https://grayco-cs.com/sitemap.xml if it is not listed.']),
    dict(k='gads', ic='🎯', l='Google Ads', mode='grant', url='https://ads.google.com/',
         d='Search ads and conversions: keywords, ads, results (budget and billing changes go through an admin).',
         own=['ads.google.com (as the owner) → Admin (gear, left menu) → Access and security.',
              'Users → blue ＋ → e-mail {MM} → access level Standard (not Admin: billing and users stay with the owner) → Send invitation.'],
         mm=['Accept the invite. Spend changes still go to an admin for approval (🎯 Ads in the CRM).',
             'Website tags: website editor → Footer, Google & social links → Google Ads tag ID (AW-…) and the conversion labels.']),
    dict(k='gbp', ic='📍', l='Google Business Profile', mode='grant', url='https://business.google.com/',
         d='The Google Maps / search listing: posts, photos, hours, review replies.',
         own=['Signed in as the owner, search Google for "GrayCo Construction Services" (or open business.google.com) — your profile\'s edit panel shows.',
              '⋮ (three dots) → Business Profile settings → People and access → ＋ Add.',
              'E-mail {MM} → access Manager → Invite.'],
         mm=['Accept the invite; posts, photos, hours and review replies are then his.',
             'Keep the name / address / phone exactly as in 📍 Listings.']),
    dict(k='meta', ic='📘', l='Meta Business Suite + Events Manager pixel', mode='grant', url='https://business.facebook.com/', go='Open Meta Business Suite',
         url2='https://business.facebook.com/events_manager2/', go2='Events Manager',
         d='Facebook and Instagram pages, inbox and ads; the website pixel (dataset "Grayco website") that counts website leads for the ads.',
         own=['business.facebook.com → Settings (gear, bottom left) → Users → People → ＋ Add people.',
              'E-mail {MM} → Employee access (not Full control) → Next.',
              'Assign assets: Pages → GrayCo (full control of the Page), Instagram accounts → GrayCo, Ad accounts → GrayCo (manage campaigns), Datasets → "Grayco website" (manage) → Send request.'],
         mm=['Accept the invite with his own Facebook login.',
             'Events Manager → Data sources → dataset "Grayco website" → check website events come in.',
             'The dataset / pixel ID goes in the website editor → Footer, Google & social links → Meta (Facebook) pixel ID.']),
    dict(k='instagram', ic='📸', l='Instagram business account', mode='self', url='https://www.instagram.com/accounts/emailsignup/', go='Sign up on Instagram',
         d='Reels and before / after photos; the business account also runs Instagram ads from Meta Business Suite.',
         mm=['Sign up with accounts@grayco-cs.com (the code arrives there), username close to "graycocs".',
             'Profile → ☰ → Settings → Account type and tools → Switch to professional account → Business → category Construction Company.',
             'Connect it to the GrayCo Facebook Page: Meta Business Suite → Settings → Accounts → Instagram accounts → Add.',
             'Website editor → Footer, Google & social links → Instagram URL.'],
         own=['Nothing — if GrayCo already has an Instagram, the Meta Business Suite access above covers it.']),
    dict(k='linkedin', ic='💼', l='LinkedIn company page', mode='self', url='https://www.linkedin.com/company/setup/new/', go='Create the page',
         d='The company page for commercial work, property managers and hiring posts.',
         mm=['LinkedIn pages hang off a personal profile: from his own LinkedIn → For Business (top right) → Create a Company Page → Company.',
             'Name GrayCo Construction Services, website https://grayco-cs.com, industry Construction; verify with a @grayco-cs.com e-mail when asked (accounts@grayco-cs.com).',
             'Page → Admin tools → Manage admins → Add admin → the owner as Super admin, so GrayCo keeps the page if he leaves.',
             'Website editor → Footer, Google & social links → LinkedIn URL.'],
         own=['Accept the Super admin invite when LinkedIn shows it (optional, keeps the page GrayCo\'s).']),
    dict(k='lsa', ic='🛡', l='Google Local Services Ads', mode='both', url=LSA_URL, go='Sign up for Local Services',
         d='The "Google Screened / Guaranteed" ads at the very top of Google — pay per lead. Water, fire and storm damage only.',
         mm=['Open the sign-up link and sign in with accounts@grayco-cs.com (or link the GrayCo Google Ads account).',
             'Business GrayCo Construction Services, Memphis-area ZIP codes, main number ' + MAIN + '.',
             'Job types: ONLY water damage, fire damage and storm damage — nothing else.',
             'Weekly budget: the amount the owner agreed (an admin approves spend). Leads into the CRM: the Zapier card.'],
         own=['Google checks the business owner (background check, license, insurance). When Google e-mails the owner, that part is done directly with Google — it cannot be done for him.']),
    dict(k='zapier', ic='⚡', l='Zapier: Local Services leads → CRM', mode='both', url='https://zapier.com/sign-up', go='Sign up on Zapier',
         d='Puts every Local Services lead in the CRM\'s 📥 Lead Inbox within a minute (the CRM texts / e-mails the customer back).',
         mm=['Sign up with accounts@grayco-cs.com.',
             'New Zap → trigger Google Local Services Ads → New lead (or the LSA lead e-mail).',
             'Action Webhooks by Zapier → POST → URL ' + INTAKE + ' → JSON: name, phone, email, address, job type, message.',
             'Leave the header x-api-key empty: add a ✅ To-Do for an admin to fill it, then Test.'],
         own=['An admin makes the key in Netlify → Site configuration → Environment variables → LEAD_KEY_GOOGLE_LSA (any long random text).',
              'The admin opens the Zap (Zapier → Share, or on his screen) and types the key into the header x-api-key. The key is never sent to him or kept in the CRM.']),
    dict(k='fblead', ic='📝', l='Facebook lead ads → CRM (Zapier)', mode='both', url='https://zapier.com/apps/facebook-lead-ads/integrations/webhook', go='Facebook Lead Ads on Zapier',
         d='Each Facebook / Instagram lead-form answer lands in the 📥 Lead Inbox, the same way as the Local Services leads.',
         mm=['Zapier → New Zap → Facebook Lead Ads → New lead → connect his Facebook login → Page GrayCo → the form.',
             'Action Webhooks by Zapier → POST → ' + INTAKE + ' (same as the Local Services Zap).',
             'Header x-api-key — an admin fills it (✅ To-Do), then Test.'],
         own=['Meta Business Suite → Settings → Integrations → Leads access → Page GrayCo → assign {MM} (and under CRMs: Zapier).',
              'An admin makes LEAD_KEY_FACEBOOK_LEADS in Netlify and types it into the Zap header himself.']),
    dict(k='callrail', ic='📞', l='CallRail call tracking', mode='both', url='https://app.callrail.com/signup', go='Sign up on CallRail',
         d='Website call tracking for grayco-cs.com: which ad or page made the phone ring (main number ' + MAIN + '); calls show in the CRM.',
         mm=['Sign up with accounts@grayco-cs.com.',
             'Create a Website (source / keyword) tracker for grayco-cs.com; the number to swap and to ring: ' + MAIN + '.',
             'Copy the swap.js script URL (//cdn.callrail.com/companies/…/swap.js) from the JavaScript snippet.',
             'Paste it in the website editor: grayco-cs.com → gear (bottom right) → Footer, Google & social links → CallRail swap script URL → Save & publish.'],
         own=['If CallRail asks for a card: the owner enters it once in CallRail → Billing (never through the CRM).',
              'An admin adds the post-call webhook (CallRail → Settings → Integrations → Webhooks): its address carries a key from Netlify, so he never sees it.']),
    dict(k='site', ic='🌍', l='Website editor', mode='grant', url='https://grayco-cs.com/', go='Open grayco-cs.com',
         d='Website text, photos, projects, reviews; the tracking IDs (Analytics, Ads, pixel, CallRail) are in Footer, Google & social links.',
         own=['Any @grayco-cs.com e-mail may sign in. Another e-mail: an admin adds it to ADMIN_EMAILS on the website\'s Netlify site (Site configuration → Environment variables).',
              'The editor\'s sign-in is given to him by an admin directly — it is never kept or shown in the CRM.'],
         mm=['grayco-cs.com → gear button (bottom right) → sign in → edit → Save & publish.']),
    dict(k='review', ic='⭐', l='Google review link', mode='check', url='https://grayco-cs.com/review', go='Open the review link',
         d='The short link customers get for a Google review (also on the QR codes).',
         mm=['Open it on a phone: it must open GrayCo\'s "Write a review" box.',
             'If not: Google Business Profile → Ask for reviews → copy the link → website editor → Footer, Google & social links → Google write-a-review link.',
             'Use it from ⭐ Reviews & referrals.']),
    dict(k='nextdoor', ic='🏡', l='Nextdoor business page', mode='self', url='https://business.nextdoor.com/', go='Claim on Nextdoor',
         d='Neighbourhood recommendations and local posts around finished jobs.',
         mm=['business.nextdoor.com → Claim your free business page → sign up with accounts@grayco-cs.com.',
             'Find GrayCo Construction Services (or create it): the name / address / phone exactly as 📍 Listings, website grayco-cs.com.',
             'Logo, a few before / after photos; ask happy neighbours for recommendations.'],
         own=['Nextdoor may verify with a call / text to ' + MAIN + ' or a postcard — whoever gets the code passes it to him.']),
    dict(k='bing', ic='🅱️', l='Bing Places', mode='self', url='https://www.bingplaces.com/', go='Open Bing Places',
         d='The listing on Bing, Microsoft maps and the Copilot / Windows search answers.',
         mm=['bingplaces.com → Sign in → a Microsoft account made with accounts@grayco-cs.com.',
             'Import from Google Business Profile (quickest — uses his Manager access), or add it by hand with the 📍 Listings name / address / phone.',
             'Mark it in 📍 Listings when it is live.']),
    dict(k='apple', ic='🍎', l='Apple Business Connect', mode='self', url='https://businessconnect.apple.com/', go='Open Business Connect',
         d='The Apple Maps / Siri listing (iPhones): hours, photos, the call button.',
         mm=['businessconnect.apple.com → Get started → an Apple Account made with accounts@grayco-cs.com.',
             'Add a business → claim the Apple Maps place (or add it) with the 📍 Listings name / address / phone.',
             'Verify: Apple may call ' + MAIN + ' — whoever answers passes him the code.'],
         own=['If Apple asks for a business document (license), an admin uploads it in Business Connect.']),
    dict(k='listings', ic='📒', l='Yelp, BBB, Angi listings', mode='self', url='https://biz.yelp.com/', go='Yelp for Business', sec='listings', secL='📍 Listings in the CRM',
         d='The other directories: same name / address / phone everywhere (tracked in 📍 Listings).',
         mm=['Yelp: biz.yelp.com → Claim your business → accounts@grayco-cs.com.',
             'Angi: angi.com → For pros → sign up / claim with accounts@grayco-cs.com (no paid plan without an admin\'s OK).',
             'BBB: bbb.org → find GrayCo → "Is this your business?".',
             'Tick each one in 📍 Listings (name / address / phone checked).'],
         own=['BBB: if GrayCo is accredited, the owner adds him as a contact in the BBB business portal once.']),
    dict(k='resend', ic='📨', l='Resend (CRM e-mail sending)', mode='admin', url='https://resend.com/',
         d='Sends the CRM\'s e-mails and newsletters. Admin only: newsletters are written in ✉️ E-mail & newsletter.',
         own=['Admins only (with Netlify, Supabase, Twilio, Google Admin, Google Cloud). Nothing for the Marketing Manager to sign up.']),
]
KEYS = [x['k'] for x in ITEMS]
ADMIN_ONLY = [x['k'] for x in ITEMS if x['mode'] == 'admin']
for x in ITEMS:   # never a secret in the cards
    blob = json.dumps(x, ensure_ascii=False).lower().replace('no password', '')
    assert 'password' not in blob and 'api_key' not in blob, x['k']
    assert x['mode'] in ('grant', 'self', 'both', 'check', 'admin'), x['k']


def js_items():
    out = []
    for x in ITEMS:
        o = {k: x[k] for k in ('k', 'ic', 'l', 'mode', 'd')}
        for k in ('url', 'go', 'url2', 'go2', 'sec', 'secL', 'own', 'mm'):
            if k in x:
                o[k] = x[k]
        out.append(json.dumps(o, ensure_ascii=False).replace('</', '<\\/'))
    return '[\n  ' + ',\n  '.join(out) + '\n]'


def rd(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()


def wr(rel, txt):
    with open(os.path.join(ROOT, rel), 'w', encoding='utf-8') as f:
        f.write(txt)


def edit(rel, pairs, append=''):
    src = rd(rel)
    if MARK in src:
        print('already patched:', rel)
        return
    for find, repl in pairs:
        n = src.count(find)
        assert n == 1, (rel, 'find-string matched %d times' % n, find[:90])
        src = src.replace(find, repl)
    if append:
        src = src.rstrip('\n') + '\n' + append + '\n'
    wr(rel, src)
    print('patched:', rel)


def index():
    tail = TAIL.replace('__MKTSETUP_ITEMS__', js_items())
    assert 'MMTABS' in rd('index.html'), 'patch MMTABS first'
    edit('index.html', [
        ('<!-- /MMTABS -->', '<!-- /MMTABS -->\n' + tail + '<!-- /MKTSETUP -->'),
    ])
    src = rd('index.html')
    assert src.index('id="gc-patch-mmtabs">') < src.index('id="gc-patch-mktsetup">')


MM_APPEND = r'''
/* ── patch MKTSETUP: 🧰 Marketing setup — the status of each marketing platform card (gc_kv gc_mkt_admin.setup) ──
   The Marketing Manager may set a status (todo / owner / doing / done) of a known card and nothing else; the "Admin only"
   cards only an admin. The row is read first and kept whole (his settings, the admins' settings); a failed read writes nothing. */
const SETUP_KEYS = __KEYS__;
const SETUP_ADMIN = __ADMIN__;
const SETUP_ST = { todo: 1, owner: 1, doing: 1, done: 1 };
function setupOf(v){
  const m = (v && v.setup && typeof v.setup === 'object') ? v.setup : {}, out = {};
  SETUP_KEYS.forEach(function(k){ const x = m[k]; if (x && SETUP_ST[x.status]) out[k] = { status: x.status, by: scrubText(s(x.by)).slice(0, 60), at: s(x.at).slice(0, 30) }; });
  return out;
}
async function setupRead(){ return setupOf(await kvGet(ADMIN_KEY)); }
async function setupSet(key, status, who, isAdmin){
  key = s(key); status = s(status);
  if (SETUP_KEYS.indexOf(key) < 0) return { ok: false, code: 400, error: 'Not a marketing setup card.' };
  if (!SETUP_ST[status]) return { ok: false, code: 400, error: 'Status: todo, owner, doing or done.' };
  if (SETUP_ADMIN[key] && !isAdmin) return { ok: false, code: 403, error: 'Admin only.' };
  let cur = await kvGet(ADMIN_KEY);   /* throws when it cannot be read: nothing is written */
  if (!cur || typeof cur !== 'object' || Array.isArray(cur)) cur = {};
  const setup = Object.assign({}, cur.setup && typeof cur.setup === 'object' && !Array.isArray(cur.setup) ? cur.setup : {});
  setup[key] = { status: status, by: s(who && (who.name || who.email)).slice(0, 60), byEmail: low(who && who.email), at: nowIso() };
  await kvPut(ADMIN_KEY, Object.assign({}, cur, { setup: setup }));
  return { ok: true, items: setupOf({ setup: setup }) };
}
Object.assign(module.exports, { SETUP_KEYS: SETUP_KEYS, SETUP_ADMIN: SETUP_ADMIN, setupOf: setupOf, setupRead: setupRead, setupSet: setupSet });   /* patch MKTSETUP */'''


def mmlib():
    app = MM_APPEND.replace('__KEYS__', json.dumps(KEYS)).replace('__ADMIN__', json.dumps({k: 1 for k in ADMIN_ONLY}))
    edit('netlify/functions/_lib/mm.js', [
        # the admins' settings write keeps the row (incl. the setup statuses) — never written over after a failed read
        ("  const cur = await adminDoc(), mm = Object.assign({}, cur.mm || {});",
         "  const cur = (await kvGet(ADMIN_KEY)) || {}, mm = Object.assign({}, cur.mm || {});   /* patch MKTSETUP: a failed read throws (the row also holds the setup statuses) */"),
    ], append=app)


def soc():
    edit('netlify/functions/soc.js', [
        ("//   mm_approvals, mm_approve, mm_queue, mm_review_reply, mm_website. Every answer to him is redacted (no customer e-mail / phone / address).",
         "//   mm_approvals, mm_approve, mm_queue, mm_review_reply, mm_website. Every answer to him is redacted (no customer e-mail / phone / address).\n"
         "//   POST { op:'mkt_setup' } / { op:'mkt_setup_set', key, status }   patch MKTSETUP: 🧰 Marketing setup statuses — the Marketing Manager\n"
         "//   (not the \"Admin only\" cards) and admins; gc_kv gc_mkt_admin.setup (_lib/mm.js setupRead / setupSet). No password or key anywhere."),
        ("  return R(403, { ok: false, error: 'Not part of the Marketing Manager profile.' });",
         "  if (op === 'mkt_setup') return R(200, { ok: true, items: await MM.setupRead(), adminOnly: Object.keys(MM.SETUP_ADMIN) });   /* patch MKTSETUP */\n"
         "  if (op === 'mkt_setup_set') { const r = await MM.setupSet(body.key, body.status, who, false); return R(r.ok ? 200 : r.code, r.ok ? { ok: true, items: r.items } : { ok: false, error: r.error }); }\n"
         "  return R(403, { ok: false, error: 'Not part of the Marketing Manager profile.' });"),
        ("    if (op === 'ideas') { if (!admin) return reply(403, headers, { ok: false, error: 'Ideas & experiments: the Marketing Manager and admins.' });",
         "    if (op === 'mkt_setup' || op === 'mkt_setup_set') {   /* patch MKTSETUP: 🧰 Marketing setup — admins (and the Marketing Manager above) */\n"
         "      if (!admin) return reply(403, headers, { ok: false, error: 'Marketing setup: the Marketing Manager and admins.' });\n"
         "      if (op === 'mkt_setup') return reply(200, headers, { ok: true, items: await MM.setupRead(), adminOnly: Object.keys(MM.SETUP_ADMIN) });\n"
         "      const r = await MM.setupSet(body.key, body.status, who, true); return reply(r.ok ? 200 : r.code, headers, r.ok ? { ok: true, items: r.items } : { ok: false, error: r.error });\n"
         "    }\n"
         "    if (op === 'ideas') { if (!admin) return reply(403, headers, { ok: false, error: 'Ideas & experiments: the Marketing Manager and admins.' });"),
    ])


if __name__ == '__main__':
    index()
    mmlib()
    soc()
