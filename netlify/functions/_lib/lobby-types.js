/* lobby-types.js — patch OFFICETV: the 📺 Lobby TV slide library (owner 11/01: "a front room TV for customers … make it a
   slide library"). ONE catalog, used by
     • lobby.html (the lobby screen: draws each type, fills anything left empty with these defaults),
     • the CRM's ⚙ Admin → 📺 Lobby TV editor (the library, the fields to edit, the placeholders),
     • netlify/functions/lobby.js (which types and fields exist — a copy at netlify/functions/_lib/lobby-types.js,
       kept identical by tools/patch_OFFICETV.py and checked by tools/tests/test_LOBBY.mjs).
   Fields: h headline · sub subhead · t text · items (one per line) · url (QR link) · label (QR caption) · end (date,
   YYYY-MM-DD) · photos (approved job photos / uploads) · pairs (before + after) · people (name, role, photo) ·
   reviews (picked 5★ reviews; empty = the newest) · offer (an offer id; empty = the first live one) · rating, count.
   chk: the default words are a starting point, not a fact from the CRM — the slide plays only after someone edits / ticks
   "✓ Checked" in the editor (owner 11/01: nothing invented on the lobby).
   Rules for every type (lobby.js enforces them): no customer names or addresses, no insurance carrier names, nothing
   about subs or the sub portal, no internal numbers, no prices that are not set, no HVAC (owner 11/01). */
(function(root){
'use strict';
var REVIEW_URL = 'https://share.google/quDuhdlL0ckxPLLY3';
var T = [
  /* ── welcome ── */
  { k: 'welcome', name: 'Welcome & time', ic: '👋', cat: 'Welcome', f: ['h', 'sub'],
    d: { h: 'Welcome to GrayCo Construction Services', sub: 'Thanks for stopping by — make yourself at home. Someone will be right with you.' } },
  /* ── our work ── */
  { k: 'beforeafter', name: 'Before & after', ic: '🔁', cat: 'Our work', f: ['h', 'pairs'],
    d: { h: 'Before & after', sub: 'Real GrayCo work, right here at home' } },
  { k: 'collage', name: 'Photo collage (6)', ic: '🖼', cat: 'Our work', f: ['h', 'sub', 'photos'], max: 6,
    d: { h: 'Recent work', sub: 'Roofs, restorations and build-outs across the Mid-South' } },
  { k: 'hero', name: 'Featured project + story', ic: '🏆', chk: 'the story is a sample', cat: 'Our work', f: ['h', 'sub', 't', 'photos'], max: 1,
    d: { h: 'Featured project', sub: 'Storm-damaged roof · Bartlett', t: 'A spring hail storm left this family with leaks in three rooms. We tarped the roof the same day, documented every inch of damage for their claim, and had a brand-new roof on in two days — clean-up included.' } },
  /* ── reviews ── */
  { k: 'review', name: '⭐ Review spotlight', ic: '⭐', cat: 'Reviews', f: ['h', 'reviews'], max: 5,
    d: { h: 'What our customers say' } },
  { k: 'reviewwall', name: 'Review wall (6)', ic: '🧱', cat: 'Reviews', f: ['h', 'reviews'], max: 6,
    d: { h: 'Our neighbors say it best' } },
  { k: 'rating', name: 'Google rating', ic: '🌟', cat: 'Reviews', f: ['h', 'rating', 'count', 'url'],
    d: { h: 'Rated by our customers on Google', url: REVIEW_URL, label: 'Read our reviews' } },
  { k: 'leavereview', name: 'Leave us a review + QR', ic: '📝', cat: 'Reviews', f: ['h', 'sub', 'url'],
    d: { h: 'Happy with your project?', sub: 'Scan to leave us a Google review — it takes one minute and means the world to a local business.', url: REVIEW_URL, label: 'Leave a Google review' } },
  /* ── services (owner 11/01: restoration first; no HVAC, no pressure washing) ── */
  { k: 'services', name: 'Services overview', ic: '🧰', cat: 'Services', f: ['h', 'sub'],
    d: { h: 'What we do', sub: 'One local team, start to finish' } },
  { k: 'restoration', name: 'Restoration & mitigation', ic: '💧', chk: 'check the list of services', cat: 'Services', f: ['h', 'sub', 'items', 'photos'], max: 1,
    d: { h: 'Restoration & mitigation', sub: 'Water, fire, mold and storm damage — handled from the first call to the final walkthrough.',
      items: ['24/7 water extraction & drying', 'Mold remediation', 'Fire & smoke clean-up', 'Storm & tree damage', 'Full rebuild after the loss'] } },
  { k: 'roofing', name: 'Roofing', ic: '🏠', chk: 'check the list of services', cat: 'Services', f: ['h', 'sub', 'items', 'photos'], max: 1,
    d: { h: 'Roofing', sub: 'Residential and commercial roofs, done right the first time.',
      items: ['Roof replacement', 'Leak & storm repairs', 'Free hail & wind inspections', 'Gutters & ventilation', 'Commercial roofs & coatings'] } },
  { k: 'commercial', name: 'Commercial build-outs', ic: '🏢', chk: 'check the list of services', cat: 'Services', f: ['h', 'sub', 'items', 'photos'], max: 1,
    d: { h: 'Commercial build-outs', sub: 'Licensed in Tennessee, Arkansas and Mississippi.',
      items: ['Tenant improvements & build-outs', 'Office, retail & restaurant renovations', 'ADA upgrades', 'New construction', 'Work scheduled around your business'] } },
  { k: 'commaint', name: 'Commercial maintenance', ic: '🛠', cat: 'Services', f: ['h', 'sub', 'items', 'url', 'photos'], max: 1,
    d: { h: 'Commercial maintenance', sub: 'Keep your building in shape — on a schedule, with one call when something goes wrong.',
      items: ['Roof & coating maintenance plans', 'Yearly inspections & condition reports', 'Make-ready & tenant turnover', 'Snow & emergency priority response'],
      url: 'https://grayco-cs.com/contact?utm_source=lobby_tv&utm_medium=qr&utm_campaign=commercial-maintenance', label: 'Sign up for maintenance' } },
  { k: 'claims', name: 'Insurance claim help', ic: '🛡', chk: 'check the steps', cat: 'Services', f: ['h', 'sub', 'items'],
    d: { h: 'Insurance claim? We walk you through it.', sub: 'How it works',
      items: ['Free inspection — we document every bit of damage with photos', 'We document the damage, meet your adjuster on site and give you a detailed estimate', 'We repair or rebuild — to the approved scope', 'Updates at every step until the job is done'] } },
  { k: 'emergency', name: '🚨 24/7 emergency line', ic: '🚨', cat: 'Services', f: ['h', 'sub'],
    d: { h: 'Water, fire or storm damage?', sub: 'Call us any time, day or night — our team responds fast to stop the damage.' } },
  { k: 'process', name: 'Our process', ic: '🧭', chk: 'check the steps', cat: 'Services', f: ['h', 'items'],
    d: { h: 'What to expect', items: ['Free visit & honest assessment', 'A clear, written scope', 'Scheduled start — you know who is coming', 'Daily updates in your GrayCo Portal', 'Final walkthrough & warranty'] } },
  /* ── maintenance ── */
  { k: 'care', name: 'GrayCo Care plans', ic: '🛠', cat: 'Maintenance', f: ['h', 'sub', 'items', 'url', 'photos'], max: 1,
    d: { h: 'GrayCo Care maintenance plans', sub: 'Catch small problems before they become big ones.',
      url: 'https://grayco-cs.com/contact?utm_source=lobby_tv&utm_medium=qr&utm_campaign=grayco-care', label: 'Join GrayCo Care' } },
  { k: 'tiers', name: 'Bronze / Silver / Gold', ic: '🥇', cat: 'Maintenance', f: ['h', 'sub', 'url'],
    d: { h: 'Pick your GrayCo Care level', sub: 'Every plan customer starts at Bronze.', url: 'https://grayco-cs.com/contact?utm_source=lobby_tv&utm_medium=qr&utm_campaign=grayco-care', label: 'Ask about GrayCo Care' } },
  { k: 'handyman', name: 'Handyman Day', ic: '🔧', cat: 'Maintenance', f: ['h', 'sub', 'items', 'url'],
    d: { h: 'Handyman Day', sub: 'One tech, 8 AM – 5 PM, for your list of small jobs.',
      url: 'https://grayco-cs.com/contact?utm_source=lobby_tv&utm_medium=qr&utm_campaign=handyman-day', label: 'Book a Handyman Day' } },
  { k: 'snow', name: 'Snow & storm priority', ic: '❄️', cat: 'Maintenance', f: ['h', 'sub', 'items', 'url', 'photos'], max: 1,
    d: { h: 'Be first in line when weather hits', sub: 'Priority snow, ice and storm response for commercial properties.',
      items: ['Winter sign-up (Dec – Feb): walks & entrances cleared and salted', 'After hail or high wind: priority inspection', 'Emergency tarping & temporary repairs', 'Dated photo report for your claim'],
      url: 'https://grayco-cs.com/contact?utm_source=lobby_tv&utm_medium=qr&utm_campaign=snow-priority', label: 'Get on the priority list' } },
  /* ── offers & marketing (owner 11/01: "offers promotions marketing in those too") ── */
  { k: 'offer', name: '🏷 Current offer', ic: '🏷', cat: 'Offers', f: ['offer'],
    d: { h: 'Ask about this month’s offer', sub: 'Talk to our front desk for details.' } },
  { k: 'promos', name: 'Promo rotation (all offers)', ic: '🎠', cat: 'Offers', f: ['h'],
    d: { h: 'Current offers' } },
  { k: 'campaign', name: 'Seasonal campaign', ic: '🍂', chk: 'check the campaign wording', cat: 'Offers', f: ['h', 'sub', 'items', 'url', 'photos'], max: 1,
    d: { h: 'Spring roof check', sub: 'Winter is hard on a roof. Book your free spring roof check before storm season.', items: ['Free inspection with photos', 'Small fixes done on the spot', 'A written report you can keep'], url: 'https://grayco-cs.com/contact?utm_source=lobby_tv&utm_medium=qr&utm_campaign=roof-check', label: 'Book a free roof check' } },
  { k: 'refoffer', name: 'Referral credit offer', ic: '💵', cat: 'Offers', f: ['h', 'sub', 'url'],
    d: { h: 'Refer a friend. Earn GrayCo credit.', sub: 'Credits stack up and never expire — use them on your own roof, kitchen, bath or remodel.', url: 'https://grayco-cs.com/contact?utm_source=lobby_tv&utm_medium=qr&utm_campaign=referral', label: 'Join the referral program' } },
  { k: 'referral', name: '🎁 Referral program + QR', ic: '🎁', cat: 'Offers', f: ['h', 'sub', 'items', 'url'],
    d: { h: 'The GrayCo Referral Program', sub: 'Know someone who needs a contractor? Send them our way.', items: ['Join the program', 'Refer friends, family and neighbors', 'Earn GrayCo credit for each referred job', 'Credits stack — use them or gift them'], url: 'https://grayco-cs.com/contact?utm_source=lobby_tv&utm_medium=qr&utm_campaign=referral', label: 'Join the referral program' } },
  { k: 'askus', name: '"Ask us about" banner', ic: '💬', cat: 'Offers', f: ['h', 'items'],
    d: { h: 'Ask us about…', items: ['Free roof & storm inspections', 'GrayCo Care maintenance plans', 'Insurance claim help', 'Handyman Days', 'Our referral program'] } },
  { k: 'countdown', name: 'Countdown / promo', ic: '⏳', chk: 'set the date and wording', cat: 'Offers', f: ['h', 'sub', 'end', 'url'],
    d: { h: 'Storm season is coming', sub: 'Book your free inspection before the rush.', url: 'https://grayco-cs.com/contact?utm_source=lobby_tv&utm_medium=qr&utm_campaign=countdown', label: 'Book now' } },
  /* ── company & community ── */
  { k: 'team', name: 'Meet the team', ic: '👷', chk: 'add your team', cat: 'Company', f: ['h', 'sub', 'people'],
    d: { h: 'Meet the team', sub: 'Local people who answer the phone, show up on time and stand behind the work.' } },
  { k: 'warranty', name: 'Licensed, insured & warranty', ic: '✅', chk: 'check the warranty / insurance wording', cat: 'Company', f: ['h', 'sub', 'items', 'photos'], max: 1,
    d: { h: 'Licensed. Insured. Accountable.', sub: 'Peace of mind on every project.', items: ['Licensed general contractor', 'Fully insured', 'Workmanship warranty', 'Locally owned in Bartlett'] } },
  { k: 'financing', name: 'Financing available', ic: '💳', chk: 'type your financing details', cat: 'Company', f: ['h', 'sub', 't', 'photos'], max: 1,
    d: { h: 'Financing available', sub: 'Don’t put off the repair you need.', t: 'Ask our office about payment options for your project.' } },
  { k: 'tip', name: 'Seasonal tip', ic: '💡', cat: 'Company', f: ['h', 't', 'photos'], max: 1,
    d: {} },
  { k: 'weather', name: 'Weather + storm check', ic: '⛅', cat: 'Company', f: ['h', 'sub', 'url'],
    d: { h: 'Storm season check', sub: 'Had wind or hail this week? Book a free roof inspection before small damage turns into a leak.', url: 'https://grayco-cs.com/contact?utm_source=lobby_tv&utm_medium=qr&utm_campaign=roof-check', label: 'Book a free inspection' } },
  { k: 'community', name: 'Community / giving back', ic: '🤝', chk: 'type what GrayCo supports', cat: 'Company', f: ['h', 'sub', 't', 'photos'], max: 3,
    d: { h: 'Proud to build our community', sub: 'Bartlett born. Mid-South proud.', t: 'We sponsor local teams, support neighbors after storms and give back where we live and work.' } },
  { k: 'hiring', name: 'We’re hiring + QR', ic: '📣', chk: 'type the open jobs', cat: 'Company', f: ['h', 'sub', 'items', 'url'],
    d: { h: 'We’re hiring', sub: 'Build a career with a growing local company.', items: ['Project managers', 'Carpenters & skilled trades', 'Restoration technicians', 'Office & customer care'], url: 'https://grayco-cs.com/careers', label: 'See open jobs' } },
  { k: 'social', name: 'Follow us + QR', ic: '📱', cat: 'Company', f: ['h', 'sub', 'url'],
    d: { h: 'Follow our projects', sub: 'Before-and-afters, tips and local news.', url: 'https://www.facebook.com/GrayCoConstructionServices', label: 'Follow GrayCo on Facebook' } },
  /* ── custom ── */
  { k: 'announce', name: 'Custom announcement', ic: '📢', chk: 'type the announcement', cat: 'Custom', f: ['h', 'sub', 't', 'photos'], max: 1,
    d: { h: 'Welcome!', sub: 'News from GrayCo', t: 'Type your announcement in ⚙ Admin → 📺 Lobby TV.' } },
  { k: 'qr', name: 'Custom QR (any link)', ic: '🔳', cat: 'Custom', f: ['h', 'sub', 'url'],
    d: { h: 'Scan me', sub: 'Point your phone camera at the code.', url: 'https://grayco-cs.com', label: 'grayco-cs.com' } }
];
var TIPS = {   /* the seasonal tip when nobody typed one: by month */
  win: { h: 'Winter tip: protect your pipes', t: 'When it drops below 20°F, let faucets drip, open cabinet doors on outside walls and know where your main water shut-off is.' },
  spr: { h: 'Spring tip: check your roof after storms', t: 'Look for missing or lifted shingles, dents on gutters and granules in the downspouts. Hail damage is easy to miss from the ground — ask us about a free roof inspection.' },
  sum: { h: 'Summer tip: keep water away from the house', t: 'Make sure downspouts carry water at least 4 feet from the foundation and that the ground slopes away from your walls.' },
  fal: { h: 'Fall tip: clean those gutters', t: 'Clogged gutters overflow behind the fascia and into walls. Clean them after the leaves drop — and before the first freeze.' }
};
function tipFor(d){ var m = (d || new Date()).getMonth() + 1; return m === 12 || m <= 2 ? TIPS.win : m <= 5 ? TIPS.spr : m <= 8 ? TIPS.sum : TIPS.fal; }
var DEFAULT_PLAYLIST = ['welcome', 'beforeafter', 'review', 'services', 'emergency', 'care', 'referral', 'leavereview'];
var BY = {}; T.forEach(function(t){ BY[t.k] = t; });
var API = { types: T, by: BY, defaults: DEFAULT_PLAYLIST, tipFor: tipFor, reviewUrl: REVIEW_URL,
  fields: ['h', 'sub', 't', 'items', 'url', 'label', 'end', 'photos', 'pairs', 'people', 'reviews', 'offer', 'rating', 'count'] };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.GC_LOBBY_TYPES = API;
})(this);
