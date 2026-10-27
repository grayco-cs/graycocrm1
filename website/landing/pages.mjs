// GrayCo landing pages — one per service and one per town. They are for Google search AND as Google Ads / Local
// Services landing pages (one page per ad group: the ad's promise and the page's headline match).
// build-pages.mjs turns each entry into a complete, fast HTML page at https://grayco-cs.com/<slug>.
//
// Editing: change the words here and push — the next deploy rebuilds every page, the sitemap and the addresses.
// `projects` names projects by their title in the website's Projects (DEFAULT_CONTENT in index.html): the photo
// and the description come from there, so a project edited there is edited here too. Keep every claim true —
// no "24/7", no prices, no review counts unless they are real.
//
// type: what the form sends to the CRM (website-intake: estimate · storm · commercial · problem · maintenance)

export const SERVICES = [
  {
    slug: 'water-damage-restoration',
    title: 'Water Damage Restoration Memphis | GrayCo Construction',
    desc: 'Burst pipe, water heater or appliance leak? GrayCo dries it out, documents it for your insurance and rebuilds it — Memphis, Bartlett, Collierville, Cordova.',
    kicker: 'Water mitigation · Dry-out · Rebuild',
    h1: 'Water damage restoration in Memphis and the suburbs',
    intro: 'A frozen pipe, a failed water heater, a refrigerator line that leaked for a week. We stop the damage, dry the structure with professional equipment, document everything for your adjuster, and then rebuild — floors, cabinets, drywall and paint — with one crew from the first call to the last coat.',
    type: 'storm', need: 'Water damage',
    serviceType: 'Water damage restoration',
    bullets: [
      ['Mitigation and dry-out', 'Demolition of wet materials, air movers and dehumidifiers, moisture readings until the structure is dry.'],
      ['Burst and frozen pipes', 'We find every leak — on one Collierville home a winter freeze left 20 pinhole leaks upstairs.'],
      ['Water heater, fridge and dishwasher leaks', 'The slow leaks that ruin subfloors and cabinets before anyone sees them.'],
      ['Insurance paperwork', 'Photos, moisture logs and a line-item scope your adjuster can approve.'],
      ['The rebuild', 'Hardwood and LVP floors, cabinets, countertops, drywall, trim and paint — back to pre-loss condition.'],
      ['Commercial water losses', 'We dried out a 15,000 SF Cordova hotel in four days.']
    ],
    projects: ['Winter Storm Restoration', 'Water Damage Restoration & Interior Rebuild', 'Hotel mitigation', 'Water heater damage home', 'Fridge leak', 'Kitchen water damage'],
    steps: [['Call us', 'Tell us what happened. Shut the water off at the main if you can.'], ['We stop the damage', 'Wet materials out, drying equipment in, readings every visit.'], ['Insurance', 'We document the loss and work directly with your adjuster.'], ['We rebuild', 'One crew puts it back — and a one-year workmanship warranty in writing.']],
    faqs: [
      ['Do you work with my insurance company?', 'Yes. We work directly with adjusters and carriers every week: we document the loss with photos and moisture readings and write a line-item scope for the claim. You choose your contractor — your insurance company does not.'],
      ['How long does drying take?', 'Most homes are dry in three to five days, depending on how long the water sat and what it soaked into. We take moisture readings until the numbers say it is dry — not until a calendar says so. A 15,000 SF hotel in Cordova took four days.'],
      ['Who is doing the work?', 'GrayCo — a licensed Tennessee general contractor (#85034) with IICRC WRT-certified water restoration training on the ownership team. The same company does the mitigation and the rebuild, so nothing falls between two contractors.'],
      ['Should I file a claim?', 'Call us first if you are not sure. We will look at the damage and tell you straight whether it looks like a claim or a repair you would rather pay for yourself.']
    ],
    related: ['fire-damage-restoration', 'insurance-restoration', 'collierville', 'cordova']
  },
  {
    slug: 'fire-damage-restoration',
    title: 'Fire Damage Restoration Memphis | GrayCo Construction',
    desc: 'Kitchen fires, lightning and house fires: GrayCo secures the home, smoke-seals the framing, works with your adjuster and rebuilds it. Licensed TN GC #85034.',
    kicker: 'Fire & smoke · Structural rebuild · Insurance',
    h1: 'Fire damage restoration and rebuilds',
    intro: 'After a fire the hard part is not the cleanup — it is the rebuild. We demolish what cannot be saved, smoke-seal the framing so the odor does not come back, reframe, replace the mechanicals and finish the home to better than it was. We have brought back a home the City of Memphis had condemned.',
    type: 'storm', need: 'Fire damage',
    serviceType: 'Fire damage restoration',
    bullets: [
      ['Board-up and protection', 'Secure the property so weather and trespassers do no more damage.'],
      ['Demolition and smoke-sealing', 'Compromised framing out; the rest sealed against smoke odor and residue.'],
      ['Structural rebuild', 'Roof framing, walls, windows, siding — whatever the fire took.'],
      ['Mechanicals', 'HVAC, electrical and plumbing replaced where the heat reached them.'],
      ['Finishes', 'Drywall, hardwood floors, cabinets, paint and trim.'],
      ['The claim', 'A line-item scope your adjuster can approve, and straight answers on what is covered.']
    ],
    projects: ['Kitchen fire', 'Condemned Home Fire Rebuild', 'Lightning!', 'Jackson fire', 'Fire Damage Restoration', 'Fire-Damaged Property Restoration'],
    steps: [['Call us', 'We meet you at the property, often with your adjuster.'], ['Make it safe', 'Board-up, tarp, and protect what is left.'], ['Scope and claim', 'Line-item scope for the insurance company.'], ['Rebuild', 'Framing to finishes, one crew, one-year workmanship warranty in writing.']],
    faqs: [
      ['Can you get rid of the smoke smell?', 'Yes. Smoke odor lives in the framing, so we remove what is too far gone and seal the rest before any new drywall goes up. Painting over it does not work — sealing does.'],
      ['Do you handle the whole rebuild?', 'Yes — roof framing, windows, siding, HVAC, drywall, floors, cabinets and paint. On one Jackson home we demolished half of the roof, reframed the garage and replaced the windows and siding.'],
      ['Will you work with my insurance adjuster?', 'Yes. We meet adjusters on site and write the scope in the detail carriers need. You choose who rebuilds your home.'],
      ['Are you licensed?', 'GrayCo is a licensed general contractor in Tennessee (#85034), Arkansas and Mississippi, and rated A+ by the Better Business Bureau of the Mid-South.']
    ],
    related: ['water-damage-restoration', 'insurance-restoration', 'memphis', 'cordova']
  },
  {
    slug: 'insurance-restoration',
    title: 'Insurance Restoration Contractor Memphis | GrayCo',
    desc: 'Storm, tornado, fire, water or a car through the garage: GrayCo works with your adjuster from first inspection to final walk-through. TN GC #85034.',
    kicker: 'Storm · Tornado · Impact · Claims',
    h1: 'Insurance restoration — we handle the claim and the rebuild',
    intro: 'When a storm, a tornado or a car takes out part of your home, you need one contractor who can secure it tonight, talk to your adjuster tomorrow, and rebuild it right. GrayCo works full-scope insurance restoration from the first assessment to the final walk-through.',
    type: 'storm', need: 'Insurance claim',
    serviceType: 'Insurance restoration',
    bullets: [
      ['Storm and tornado damage', 'Emergency protection, then windows, siding, roof and exterior rebuilt — like our Brighton tornado home.'],
      ['Vehicle impact', 'Framing rebuilt and hard-to-find matching brick sourced so the repair disappears.'],
      ['Fire and water losses', 'Mitigation, demolition and the full rebuild.'],
      ['Working with your adjuster', 'Site meetings, photos, and a line-item scope written the way carriers review them.'],
      ['Supplements', 'When hidden damage turns up, we document it and get it in front of the adjuster.'],
      ['One crew start to finish', 'No hand-offs between a mitigation company and a builder.']
    ],
    projects: ['Tornado in Brighton', 'You can’t park there', 'Lightning!', 'Water Damage Restoration & Interior Rebuild'],
    steps: [['Call us', 'Before or after you call your insurance company.'], ['Protect the property', 'Tarp, board-up, water out.'], ['The scope', 'We meet the adjuster and write the line-item scope.'], ['Rebuild', 'Back to pre-loss — or better — with a one-year workmanship warranty in writing.']],
    faqs: [
      ['Do I have to use the contractor my insurance company recommends?', 'No. In Tennessee you choose who repairs your home. Many of our customers called their carrier first and us second.'],
      ['What does it cost me?', 'Usually your deductible. The insurance company pays for the covered repairs on the approved scope; we tell you up front if anything you want is outside it.'],
      ['What if the adjuster misses something?', 'We document hidden damage as we find it — photos and measurements — and submit it to the adjuster as a supplement.'],
      ['Which carriers do you work with?', 'All of them. We work with whichever company insures your home.']
    ],
    related: ['water-damage-restoration', 'fire-damage-restoration', 'bartlett', 'memphis']
  },
  {
    slug: 'commercial-construction',
    title: 'Commercial Contractor Memphis | Tenant Finish-Outs | GrayCo',
    desc: 'Tenant improvements, retail and restaurant build-outs, office renovations and commercial water losses. Licensed GC in TN (#85034), AR & MS. Invite us to bid.',
    kicker: 'Tenant improvements · Build-outs · Renovations',
    h1: 'Commercial construction and tenant finish-outs',
    intro: 'Warehouse to office in eight weeks. A car wash rebuilt inside and out. A 150-foot range baffle built in one week. GrayCo is a multi-trade general contractor that self-performs the trades that set the schedule — and pays its trade partners on time.',
    type: 'commercial', need: 'Commercial project',
    serviceType: 'Commercial construction',
    bullets: [
      ['Tenant improvements', 'Office build-outs, ADA restrooms, ceilings, flooring, mechanicals.'],
      ['Retail and restaurant build-outs', 'Framing to finishes on the opening date you were promised.'],
      ['Renovations', 'Interior and exterior: parapets, soffits, siding, paint.'],
      ['Commercial water losses', 'Mitigation and dry-out that keeps your doors open.'],
      ['Precise estimating', 'Material takeoffs and cost estimating backed by trade knowledge.'],
      ['Project management', 'Schedules, daily photo logs and billing in one platform you can see.']
    ],
    projects: ['Commercial Tenant Finish-Out', 'Car Wash Renovation', 'Hotel mitigation', 'Pistol Range Baffle'],
    steps: [['Send the drawings', 'Plans, specs and the bid due date — or a share link.'], ['Takeoff and bid', 'Precise material takeoffs and a straight number.'], ['Build', 'Self-performed trades, written change orders, daily photo logs.'], ['Close out', 'Punch list done, one-year workmanship warranty in writing.']],
    faqs: [
      ['Where do you work?', 'Across the Mid-South — Memphis and Shelby County, West Tennessee, North Mississippi and Arkansas. GrayCo is licensed in Tennessee (#85034), Arkansas and Mississippi.'],
      ['Can you bid our project?', 'Yes. Send the drawings, specs and bid date through the form or to office@grayco-cs.com. Drawings over 25 MB: send a share link.'],
      ['Do you do Division 9 / EIFS work as a subcontractor?', 'Yes — invite us to bid as a sub on drywall, ceilings, EIFS and finishes.'],
      ['How do you keep owners informed?', 'We built our own project platform — estimating, scheduling, daily photo logs and billing — so owners see what we see, every day.']
    ],
    related: ['home-remodeling', 'water-damage-restoration', 'memphis', 'bartlett']
  },
  {
    slug: 'home-remodeling',
    title: 'Home Remodeling Contractor Bartlett & Memphis | GrayCo',
    desc: 'Kitchen and bathroom remodels, whole-home renovations, attic conversions and outdoor kitchens. Site-built cabinetry, custom tile. Licensed TN GC #85034.',
    kicker: 'Kitchens · Bathrooms · Whole-home · Additions',
    h1: 'Home remodeling — kitchens, bathrooms and whole-home renovations',
    intro: 'Site-built cabinetry, custom tile showers, load-bearing walls moved, attics turned into bedrooms. GrayCo remodels homes across Bartlett, Memphis and the suburbs with the same project management we bring to commercial work — and a one-year workmanship warranty in writing.',
    type: 'estimate', need: 'Remodel',
    serviceType: 'Home remodeling',
    bullets: [
      ['Kitchen remodels', 'New layouts, beam installs, site-built cabinetry, quartz countertops.'],
      ['Bathroom remodels', 'Custom tile walk-in showers, vanities, plumbing.'],
      ['Whole-home renovations', 'Windows, roof, floors and finishes in one project.'],
      ['Attic and space conversions', 'Finished living space with plumbing, electrical, HVAC and egress to code.'],
      ['Outdoor living', 'Covered patios and outdoor kitchens built to last.'],
      ['Move-in refreshes', 'Kitchen, baths, floors and paint before you move in.']
    ],
    projects: ['Whole-Home Renovation & Kitchen Remodel', 'Custom remodel', 'Kitchen and Bathroom remodels', 'Attic-to-Living Space Conversion', 'Custom Covered Patio', 'Lake house remodel'],
    steps: [['Tell us the idea', 'A sketch, a photo, or just the room that bothers you.'], ['Walk-through and estimate', 'A detailed estimate, line by line.'], ['Build', 'A schedule you can see and a crew that cleans up.'], ['Walk-through', 'Punch list done and a one-year workmanship warranty in writing.']],
    faqs: [
      ['Do you build cabinets on site?', 'Yes — site-built cabinetry and vanities are one of the things our customers notice first.'],
      ['Can you remove a load-bearing wall?', 'Yes. On a Bartlett kitchen we removed a load-bearing wall and installed a beam to open the kitchen to the living room.'],
      ['Do you pull permits?', 'Yes. GrayCo is a licensed Tennessee general contractor (#85034) and handles permits and inspections.'],
      ['Is there a warranty?', 'A one-year workmanship warranty in writing on every job.']
    ],
    related: ['bartlett', 'germantown', 'collierville', 'commercial-construction']
  }
];

export const TOWNS = [
  {
    slug: 'memphis', town: 'Memphis', state: 'TN',
    title: 'General Contractor Memphis TN | Restoration & Remodeling | GrayCo',
    desc: 'Memphis general contractor for water and fire damage restoration, insurance claims, remodels and commercial finish-outs. Licensed TN GC #85034.',
    h1: 'General contractor in Memphis, TN',
    intro: 'Memphis is where most of our drawings come from. From a home the City of Memphis had condemned — brought back to a finished house we are proud of — to commercial finish-outs and water losses, GrayCo builds and restores across the city with crews who live here.',
    projects: ['Condemned Home Fire Rebuild', 'Commercial Tenant Finish-Out', 'Kitchen fire', 'Water heater damage home'],
    services: ['water-damage-restoration', 'fire-damage-restoration', 'insurance-restoration', 'commercial-construction', 'home-remodeling'],
    near: ['bartlett', 'cordova', 'germantown', 'collierville']
  },
  {
    slug: 'bartlett', town: 'Bartlett', state: 'TN',
    title: 'Bartlett TN Contractor | Remodeling & Restoration | GrayCo',
    desc: 'GrayCo is headquartered on Broadway Road in Bartlett: home remodeling, water and fire damage restoration, insurance claims and commercial work. TN GC #85034.',
    h1: 'Your Bartlett contractor — headquartered on Broadway Road',
    intro: 'GrayCo is based at 4007 Broadway Road in Bartlett, and one of our owners grew up here. When a Bartlett family wanted their kitchen opened up, we removed a load-bearing wall, installed a beam, remodeled both bathrooms and put on a new roof — 1,900 square feet, top to bottom.',
    projects: ['Whole-Home Renovation & Kitchen Remodel', 'Custom remodel', 'Kitchen and Bathroom remodels', 'Attic-to-Living Space Conversion'],
    services: ['home-remodeling', 'water-damage-restoration', 'fire-damage-restoration', 'insurance-restoration', 'commercial-construction'],
    near: ['memphis', 'cordova', 'germantown', 'collierville']
  },
  {
    slug: 'collierville', town: 'Collierville', state: 'TN',
    title: 'Water Damage & Remodeling Collierville TN | GrayCo',
    desc: 'Collierville water damage restoration, frozen-pipe repairs, insurance claims and remodels. One crew from dry-out to the last coat of paint. TN GC #85034.',
    h1: 'Restoration and remodeling in Collierville',
    intro: 'When a winter freeze left 20 pinhole leaks in the upstairs plumbing of a Collierville home, we found every one, dried the structure and rebuilt the interior. Another Collierville water loss got new hardwood floors, cabinets, drywall and paint — back to pre-loss condition.',
    projects: ['Winter Storm Restoration', 'Water Damage Restoration & Interior Rebuild', 'Kitchen water damage', 'Fridge leak'],
    services: ['water-damage-restoration', 'insurance-restoration', 'home-remodeling', 'fire-damage-restoration'],
    near: ['germantown', 'cordova', 'memphis', 'bartlett']
  },
  {
    slug: 'cordova', town: 'Cordova', state: 'TN',
    title: 'Cordova TN Fire & Water Damage Restoration | GrayCo',
    desc: 'Cordova fire and water damage restoration, commercial mitigation and rebuilds. We dried out a 15,000 SF Cordova hotel in four days. Licensed TN GC #85034.',
    h1: 'Fire and water damage restoration in Cordova',
    intro: 'After a kitchen fire in a Cordova home we restored it from the framing out — smoke-sealed, new drywall and new hardwood floors. When water hit a 15,000 square foot Cordova hotel, our crew had it dried out in four days so the restoration could start.',
    projects: ['Kitchen fire', 'Hotel mitigation', 'Water heater damage home', 'Fridge leak'],
    services: ['water-damage-restoration', 'fire-damage-restoration', 'insurance-restoration', 'commercial-construction', 'home-remodeling'],
    near: ['bartlett', 'memphis', 'germantown', 'collierville']
  },
  {
    slug: 'germantown', town: 'Germantown', state: 'TN',
    title: 'Germantown TN Remodeling & Restoration Contractor | GrayCo',
    desc: 'Kitchen and bath remodels, water and fire damage restoration and insurance claims in Germantown, from our Bartlett office. Licensed TN GC #85034.',
    h1: 'Remodeling and restoration in Germantown',
    intro: 'Germantown is a short drive from our Bartlett office, between the Collierville and Cordova neighborhoods where much of our restoration work happens. Kitchens and baths, a water heater that let go, an insurance claim after a storm — one licensed contractor handles it from the first visit to the final walk-through.',
    projects: ['Kitchen and Bathroom remodels', 'Custom remodel', 'Winter Storm Restoration', 'Kitchen fire'],
    services: ['home-remodeling', 'water-damage-restoration', 'insurance-restoration', 'fire-damage-restoration'],
    near: ['collierville', 'cordova', 'memphis', 'bartlett']
  }
];
