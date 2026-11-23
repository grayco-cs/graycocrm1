# OWNERLIST3 (owner 11/23): HOA outreach decisions on 🔧 Owner setup
p = 'index.html'; s = open(p, encoding='utf-8').read()
assert 'OWNERLIST3' not in s
a = "  { id: 'db_alert_phones', g: 'soon',"
assert s.count(a) == 1
s = s.replace(a, r"""  /* OWNERLIST3: HOA outreach (owner 11/23) */
  { id: 'hoa_cai', g: 'soon', t: 'Decide: join CAI Tennessee (HOA managers) as a business partner — about $645/yr', how: 'caionline.org/join → Business Partner → Tennessee chapter. Its directory of ~170 partners has no Memphis-area roofer or GC. Leads → 🏘 HOAs has the entry.' },
  { id: 'hoa_vive', g: 'soon', t: 'Decide: VIVE vendor sign-up for FirstService / Cedar — about $150–199/yr each', how: 'Ask FirstService Residential Tennessee (800-310-0326) for their Tennessee VIVE link; Cedar Management Group\'s link is in Leads → 🏘 HOAs. Have the W-9, COI naming the association and TN license ready.' },
  { id: 'hoa_calls', g: 'soon', t: 'Call the top HOA management companies for their vendor packet', how: 'Leads → 🏘 HOAs: Keith S. Collins, Wright, Weichert SPM, EZR, Crye-Leike, Faith Management, Meridian … Mark each one applied / approved there.' },
  { id: 'ms_license', g: 'later', t: 'Decide: Mississippi contractor license (DeSoto County HOAs and jobs)', how: 'Mississippi State Board of Contractors — needed before bidding Southaven / Olive Branch / Hernando work over the state threshold.' },
""" + a)
open(p, 'w', encoding='utf-8').write(s); print('OWNERLIST3 applied')
