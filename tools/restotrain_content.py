"""RESTOTRAIN content — GrayCo's own Fire & Smoke Restoration and Odor Control training (owner 11/10: "make these into our own
grayco fire restoration training to go in our crm under training").

Written in GrayCo's own words. It covers the same subjects as the IICRC FSRT and OCT courses so a tech who finishes it is ready
for those classes, but nothing here is copied from a school's manual. One source for the CRM's 🎓 Training tab
(tools/patch_RESTOTRAIN.py → tools/restotrain.js) and the printable manuals (tools/build_restotrain_pdfs.py).

Markdown the CRM understands: **bold**, "- " bullets, "1. " numbered lists, blank line = new paragraph.
Each quiz question: (question, [choices], index of the right choice, why).
"""

FIRE = {
    'id': 'resto-fire',
    'title': 'GrayCo Fire & Smoke Restoration',
    'short': 'Fire & Smoke Restoration',
    'pdf': 'grayco-fire-smoke-restoration.pdf',
    'required': ['insurance'],
    'cat': 'IICRC',
    'intro': ("GrayCo's fire and smoke training for everyone who works fire losses: mitigation techs, supers, PMs and estimators. "
              "Read each part and tick it off, then pass the quiz at the end (16 of 20) to finish. It covers what the IICRC "
              "Fire and Smoke Restoration Technician (FSRT) class covers, so it is also your study guide for that exam."),
    'parts': [
        {'id': 'f1', 'title': '1. How GrayCo runs a fire job', 'body': """
On a fire loss we work for the **property owner (the insured)**. When the loss is an insurance claim, the **insurance carrier** is our second customer: they pay for the work, so every decision to clean or replace has to make sense to both of them.

- **Pretest before you promise.** Never tell a customer an item can be saved until you have tested it with the cleaning method you plan to use and talked it through with them.
- **Track the smoke.** Start at the room where the fire started and follow the residue in every direction it travelled until you find clean surfaces. Write down every material it touched.
- **Restore or replace?** That call is made only after the material is identified and pretested, and it is agreed with everyone who has an interest in the property.
- **Never name the insurance company to the customer** in writing; the CRM says "your insurance company" for you.

The most common mistake on fire jobs is skipping the pretest or starting work before the customer signs.
"""},
        {'id': 'f2', 'title': '2. What fire and smoke are', 'body': """
**Combustion** is fast, self-sustaining oxidation. It needs three things: **heat, fuel and oxygen**. Smoke and soot are the visible leftovers of **incomplete combustion**.

- Smoke particles are tiny: about **0.1 to 4 microns**. A micron is 1/25,000 of an inch, so you cannot see one particle with the naked eye.
- Fire residue falls into two groups: **PAHs** (polycyclic aromatic hydrocarbons, a gas-phase VOC) and **soot particles**. Both have been reported to be **carcinogenic**, so everyone on a fire site wears a fitted respirator with HEPA filters.
- **Less oxygen = more soot.** A smoldering, oxygen-starved fire makes heavy soot; a fire with plenty of oxygen burns cleaner.
- How far smoke travels through a building depends on the **air pressures and temperatures** the fire created.

**The three residue types**

- **Protein** – burned meat, fish or beans. Yellow to brown, greasy, almost invisible but a terrible odor. Needs thorough wet (water-based) cleaning.
- **Natural** – burned wood and paper. Gray to black, dry and powdery. Vacuum and dry-clean first, then wet clean. The easiest of the three.
- **Synthetic** – burned plastics, carpet, upholstery, drapes, toys. Thick, black and smeary. Don't touch it: vacuum it off first or you will smear it into the surface.

**Other things to know**

- **Natural wicks** are porous materials that soak up odor: fabric, unfinished wood, paper, unsealed concrete.
- Smoke carries vaporized oils that settle as an **oily film**, which is why residue can be hard to clean.
- Light-colored plastics hit by heat and smoke can turn **yellow**, and that can't be reversed economically.
- **Heightened awareness odor** (psychological odor) is when someone who lived through the fire keeps smelling smoke after it is gone. It is the hardest odor to overcome. Deodorizing early helps prevent it.
"""},
        {'id': 'f3', 'title': '3. Safety on a fire job', 'body': """
Safety is **everyone's** job. A burned building has hazards you can't see: weak floors and roofs, live wiring, falling debris, sharp edges and slick surfaces.

- GrayCo issues the **safety equipment** and the **safety training** you need (OSHA requires both). Use them.
- You learn what a chemical can do from three places: the **SDS** (safety data sheet), the **label**, and **training** from the maker or supplier.
- Every chemical stays in a **properly labeled** container and is secured on site.
- **Chemically sensitive customers** should not be **in or near** the work areas until we are done. Get their **informed consent** before using any deodorant. They may need extra air scrubbing and gentler products.
- Where there is loose soot, run **HEPA air scrubbers** and exhaust fans. **PPE** is the last line of defense after those engineering controls. The most important piece is a **respirator with HEPA filtration**.

**Lead and asbestos**

- **Lead** is a heavy metal found in paint made before 1978. **Asbestos** was used as insulation and fireproofing in siding, roofing, flooring and adhesives before 1977.
- Both get into the air mostly during **sanding and demolition**.
- If you think a material has lead or asbestos, **stop removing it** and have it tested. Follow GrayCo's lead standard: shut the HVAC off, post the no eating, drinking or smoking signs (English and Spanish), and the PM opens a change order. Lead, asbestos and mold can cause serious lung, nerve and kidney damage, so don't take shortcuts.
"""},
        {'id': 'f4', 'title': '4. Emergency response (the first visit)', 'body': """
The most important thing you bring to a fire job is the right **attitude**. The family has just lost a lot; be calm, kind and clear.

- **Document everything first.** Photos and notes of every room and its condition before you touch anything. Customers who watch you document are much less likely to blame us later for damage that was already there.
- **Work authorization.** It is a binding agreement with whoever is financially responsible, usually the **insured or property owner**. No work starts until it is signed.
- **Walk the building carefully.** Watch for hazards and the building's **structural integrity**. Wear your PPE.
- **Where smoke ends up:** hot smoky air is drawn to **cold surfaces** (outside walls, windows, metal), horizontal surfaces, and plastics that carry static. Check closets, wall cavities, attics and basements.
- **Board-up** must give **durable protection** and cause **minimal additional damage** to the building. Options are cover-over, fitted inserts, bolt tension, tarps and shrink-wrap.
- Soot mixed with moisture in the air turns **acidic** and starts to stain and corrode. Neutralizing it, usually with alkaline cleaners, is the first step in **corrosion** prevention.
- **Loss mitigation** work stops more damage: winterizing so pipes don't freeze, controlling corrosion, and cleaning surfaces before they stain.
"""},
        {'id': 'f5', 'title': '5. Odor control on day one', 'body': """
Odors are strongest when **humidity and temperature are elevated**, which is exactly how a building is right after the fire is out.

- Pull out **charred, unsalvageable** materials early. It cuts **odors and further soiling**.
- Heavy smoke odor always takes a **combination** of methods, never one.
- Deodorize **early**: it shows the customer progress, gives the crew a better place to work, and helps prevent heightened awareness odor.
- **Start in the room where the fire began** and work out from there.

**Four principles of odor control**

1. **Remove the source** (if you can).
2. **Clean the source area.**
3. **Penetrate**: get the deodorant everywhere the smoke went.
4. **Seal** the surfaces that still hold odor.

**Products and equipment**

- **Pairing agents** combine with the odor molecule to make a new compound with no smell. **Masking agents** cover an odor with a stronger, pleasant scent. Scented oils, gels, solids and granules are masking agents.
- **ULV (ultra low volume) foggers** make 8–15 micron droplets of water-based deodorant that stay airborne for hours.
- **Thermal foggers** use heat to make a dry, very fine (about 0.5 micron) fog that travels like smoke.
- **Oxidizers**: **chlorine bleach** (liquid; it discolors nylon, dissolves wool and silk and corrodes some metals), **ozone** (O3, a gas made by an ozone machine) and **hydroxyl radicals** (made from **ultraviolet** light and water vapor). Ozone can hurt people, pets, plants and natural rubber.
- Measure every product and follow the **label instructions**. Ask the customer before adding fragrances.

**Before you fog**

- Call the **fire department, police or alarm company** before **thermal fogging**, so nobody reports a fire.
- Too much petroleum fog in a tight space can cause a **possible explosion, breathing irritation and slippery residue**.
- Anyone without the right PPE must **vacate** areas being wet fogged, thermal fogged or ozone treated.

**Pack-out**

- Food in boxes or cans that got hot is **documented**, then thrown away.
- Precondition everything you pack out with a **lamb's wool duster or a vacuum with a brush attachment**.
"""},
        {'id': 'f6', 'title': '6. How we clean', 'body': """
- **Preconditioning** removes loose soot dry, before any liquid touches it: lamb's wool duster, HEPA vacuum with a soft brush, compressed air, or a dry sponge.
- **Washable** surfaces can take water-based cleaning. **Non-washable** surfaces can't.
- Most smoke residue is **acidic**, so most of our cleaners are **alkaline**.
- **Mixing rule:** put the **water** in the container first, then add the **concentrate**. You get the right mix and no foam.
- **Wood restoring cream** is for finished wood with heavy smoke. Always work with the grain.
- Good cleaning comes from six things working together: the chemical, its reaction, lubrication, agitation, temperature and dwell time.
"""},
        {'id': 'f7', 'title': '7. Cleaning the structure', 'body': """
**Cleaning** is usually the cheapest way to restore. Our job is to **preserve fabrics and surfaces** from further damage. In light-to-moderate jobs, start by cleaning the **source area**.

- The **heat line** is the visible line where it got very hot. Above it, damage is heavier; it tells you how restorable a room or a piece of furniture is.
- Popcorn (acoustic textured) ceilings **deteriorate** if you clean them hard. Plan to clean for paint or sealer only.
- **Secure breakables** and take down drapes and pictures before wet cleaning.
- Work **ceiling to floor**. The exception is washing painted walls by hand: go **bottom to top** so drips don't streak.
- Gloss and semi-gloss paint: a **general purpose cleaner or degreaser**. Flat latex: **precondition or dry sponge first**; if it has to be wet cleaned, plan to repaint.
- If stains or odor remain, **seal** before painting (a stain-blocking sealer).
- Attics are hard because of stored items of **questionable value**, rough surfaces, and tight spaces.
- Charred framing: scrape and seal, **blast** it (abrasive or wire brush), or remove and replace.
- Finished wood paneling: wipe with the **wood grain** and wet clean with a **mild alkaline detergent**, then polish.
- Masonry: let it **dry** before you judge it. Use **alkaline** cleaners and **media blasting**; if those fail, **acid** cleaners, which **etch** the surface. Masonry floors may have a **sealer or finish** on top.
- Vinyl wall covering: a **moderate** alkaline cleaner. Grass cloth is the hardest wall covering to treat.
- Salvageable floors get cleaned at the start **and again at the end of the job**.
- **Fiberglass** tubs and showers stain the easiest; use non-abrasive **cream, foam or liquid** soft-scrub. Grout takes **heavy-duty alkaline or mild acid** cleaners. Acid cleaners also work on tile and **aluminum window frames**. In small rooms, **ventilate and wear PPE**.
- Acoustical ceiling tile (no asbestos) with light soot: **vacuum** first, then dry sponge.
- Light fixtures: **turn off and tag out** the power first.
- Kitchens: clean the **kitchen ventilation system**, and don't miss the hood filters, **fans and exhaust ducts**. On built-in appliances, clean the **mounting cavities and subsurface areas**.
- A **puff-back** is an oil furnace misfire that blows soot through the ducts. An **inspection** tells you whether the whole HVAC system needs cleaning; heavy soot is cleaned to **NADCA standards** (National Air Duct Cleaners Association).
"""},
        {'id': 'f8', 'title': '8. Cleaning contents', 'body': """
Weigh three kinds of value before spending time on an item: **monetary, antique and sentimental**. Anything we can't save is **documented** and the customer approves before it is thrown out.

**Wood furniture**

- Check where the piece sat compared with the **heat line**.
- Use **0000** steel wool, the finest grade, with wood restoring cream for baked-on soot and white rings.
- Pieces with a **clear finish** respond best to wood restoring cream. White haze is a reaction to **heat or moisture**.
- Finish with **furniture polish**. Don't **stack** furniture right after cream; it can mark the finish.
- Blistered or badly stained pieces go to a **refinisher** or get replaced. **Light sanding** can take small stains out of unfinished wood.
- Petroleum deodorants can **darken** porous wood; never use them without the customer's OK.

**Fabrics**

- Before cleaning upholstery, check **fiber and weave, existing conditions, and how much and what kind of soot**.
- Step one on any fabric is **dry soil removal**. Use **dry solvent** where water could shrink, brown or bleed it. Newer, lightly sooted upholstery can be done by dry vacuuming, air washing or solvent cleaning.
- Clothing is cleaned and deodorized **as soon as practical**. Have the customer **select** what to keep and what to toss. Wire and plastic hangers get **thrown out right away**.
- Mattress cover fabric is called **ticking**, and it is usually colorfast. Stains that were already there won't come out.
- Drapes: note uneven hems, weak fabric and water marks before you start.
- Blinds: clean on a **protected surface** or in an **ultrasonic** tank.
- Lampshades: watch for **colored trim** that can bleed, and handle them only by the **metal frame**.

**Other contents**

- **Electronics**: inspected first, then cleaned and tested by a qualified tech.
- **Toys**: inspect, clean, sanitize.
- **Art**: oil and acrylic paintings restore best. **Document** the condition of anything valuable.
- Personal papers are **turned over** to the customer.
- **Books**: check what they're made of, any moisture, and how much heat and smoke damage. Dry clean with a dry sponge, crumbly dough cleaner or art gum eraser.
- **Dishes**: clean as soon as practical; presoak heavy soot in a **degreaser**; wrap in white **newsprint or bubble wrap**. Fine china and crystal: disclaim hidden damage, and wash **by hand** only.
- **Moving and storage**: never let pieces touch surface to surface. **Pad and strap** everything before loading, and **protect** stored contents from recontamination.
"""},
    ],
    'quiz': [
        ('Who is GrayCo\'s primary customer on a fire loss?', ['The insurance adjuster', 'The property owner (insured)', 'The mortgage company', 'The fire department'], 1, 'We work for the property owner; the carrier is a secondary customer when there is a claim.'),
        ('Before telling a customer an item can be restored, you must:', ['Get the adjuster\'s approval', 'Pretest it and talk with the customer', 'Pack it out', 'Deodorize it'], 1, 'Never promise until you have pretested and communicated with the customer.'),
        ('Smoke and soot are by-products of:', ['Complete combustion', 'Oxidation of metals', 'Incomplete combustion', 'Evaporation'], 2, 'Soot is what is left when fuel does not burn completely.'),
        ('About how big are smoke particles?', ['0.1 to 4 microns', '25 to 100 microns', '1/8 inch', '100 to 500 microns'], 0, '0.1–4 microns, far too small to see.'),
        ('Burned plastics and synthetics leave a residue that is:', ['Dry and powdery', 'Yellow and greasy', 'Thick, black and smeary', 'Invisible'], 2, 'Synthetic residue smears if touched; vacuum first.'),
        ('Burned meat, fish or beans leave which residue type?', ['Natural', 'Protein', 'Synthetic', 'Mineral'], 1, 'Protein residue: yellow-brown, greasy, strong odor.'),
        ('Soot contamination is heaviest when the fire had:', ['Plenty of oxygen', 'A lack of oxygen', 'Sprinklers', 'Low heat'], 1, 'Oxygen-starved fires produce more soot.'),
        ('Porous materials that hold odor (fabric, paper, unfinished wood) are called:', ['Natural wicks', 'Heat lines', 'Masking agents', 'Smoke webs'], 0, 'Natural wicks soak up odor.'),
        ('The most important PPE where toxic particles may be present is:', ['Hard hat', 'Respirator with HEPA filtration', 'Safety glasses', 'Steel-toe boots'], 1, 'A HEPA respirator protects your lungs.'),
        ('Lead and asbestos are most likely released during:', ['Painting and caulking', 'Sanding and demolition', 'Vacuuming', 'Deodorizing'], 1, 'Disturbing the material releases it; stop and test.'),
        ('Who signs the work authorization?', ['The adjuster', 'The tenant', 'The insured or property owner', 'The fire marshal'], 2, 'The person with financial responsibility, usually the insured or owner.'),
        ('Soot combined with water vapor in the air becomes:', ['Alkaline', 'Neutral', 'Acidic', 'Flammable'], 2, 'Acidic soot causes staining and corrosion; neutralize early.'),
        ('Odors are most noticeable when humidity and temperature are:', ['Elevated', 'Low', 'Freezing', 'It makes no difference'], 0, 'Heat and humidity make odors stronger.'),
        ('Which is NOT one of the four principles of odor control?', ['Remove the source', 'Clean the source area', 'Mask with fragrance', 'Seal surfaces'], 2, 'The four are remove the source, clean, penetrate, seal.'),
        ('Before thermal fogging you should:', ['Turn up the heat', 'Notify the fire department / authorities', 'Open the windows only', 'Spray water first'], 1, 'The fog looks like smoke; tell the authorities first.'),
        ('When mixing cleaning chemicals:', ['Put concentrate in first', 'Put water in first, then concentrate', 'Mix in hot water only', 'Shake before adding water'], 1, 'Water first, concentrate second: the right mix and no foam.'),
        ('Painted walls are washed by hand in which direction?', ['Top to bottom', 'Bottom to top', 'Left to right', 'Middle out'], 1, 'Bottom to top reduces streaking. Everything else is top to bottom.'),
        ('Acid cleaners remove a very thin layer of masonry. This is called:', ['Etching', 'Blushing', 'Pitting', 'Sealing'], 0, 'Etching is why acid-cleaned masonry looks so clean.'),
        ('The bath fixture surface most easily stained by smoke is:', ['Porcelain', 'Cast iron', 'Fiberglass', 'Ceramic tile'], 2, 'Fiberglass; use non-abrasive cream, foam or liquid cleaners.'),
        ('Fine china and crystal with heavy smoke should be cleaned:', ['In a dishwasher', 'By hand', 'With ozone', 'With bleach'], 1, 'Always by hand, after disclaiming hidden damage.'),
    ],
}

ODOR = {
    'id': 'resto-odor',
    'title': 'GrayCo Odor Control',
    'short': 'Odor Control',
    'pdf': 'grayco-odor-control.pdf',
    'required': ['insurance'],
    'cat': 'IICRC',
    'intro': ("GrayCo's odor control training: smoke, pets, mold, trauma scenes, tobacco and more. Read each part and tick it off, then "
              "pass the quiz at the end (16 of 20) to finish. It covers what the IICRC Odor Control Technician (OCT) class covers, "
              "so it is also your study guide for that exam."),
    'parts': [
        {'id': 'o1', 'title': '1. How we smell', 'body': """
An odor is a gas that moves from a source into the air and is picked up by the **nose**. Your nose is your best tool for finding an odor and judging how strong it is.

- The brain identifies odors in the **olfactory lobe**. When odor molecules touch the nerve endings in your nose and the signal reaches the brain, that is **real odor**.
- **Heightened awareness odor** (psychological odor) is an odor people believe they smell because of experience, suggestion or memory, like the family that still smells smoke after the house is clean.
- To be smelled, a molecule has to be **volatile** (it evaporates), at least slightly **water soluble**, and soluble in fats.
- People get **acclimated** to odors and stop noticing them, like the baker who no longer smells bread. A fresh nose is a better judge.
- Odor is strongest when **temperature and relative humidity are high**.
- **Adsorption** is odor molecules holding onto the surface of a material. Porous materials such as fabric, wood, paper, cork, flat paint and unsealed concrete are **natural wicks**.
"""},
        {'id': 'o2', 'title': '2. The four principles of odor control', 'body': """
Every odor job follows the same four steps:

1. **Remove the source**, as much of it as you can. This is always where deodorizing starts.
2. **Clean the source area.**
3. **Penetrate**: get the odor counteractant into every surface and space the odor reached.
4. **Seal**: a **sealer** locks in odor molecules so they can't escape. Sealers are rated by their **perm** (permeance) rating; the closer to zero, the better they hold odor in.

Skipping step 1 is the biggest mistake in the business. If odor comes back, go find the source.
"""},
        {'id': 'o3', 'title': '3. How deodorizers work', 'body': """
- **Air exchange**: push bad air out and pull fresh air in with **exhaust fans and air scrubbers**.
- **Adsorbents**: activated charcoal (carbon) and baking soda trap odor molecules on their surface.
- **Neutralization**: balances a chemical odor, such as baking soda on an acid spill.
- **Oxidation**: adds **oxygen** to break down organic material. Hydrogen peroxide, chlorine bleach and ozone are **oxidizers**.
- **Biocides**: kill or slow down the microorganisms that cause odor.
- **Counteraction**: most smoke deodorants combine **masking** and **pairing** agents. A **pairing agent** combines with the bad odor to form a new compound with no odor.
- **Masking**: covers a bad odor with a stronger, nicer one. Time-release granules, oils and gels work on the **time-release** principle.
- **Bioenzymatic digestion**: enzymes made by special bacteria eat organic material such as urine, milk, eggs, fish and spilled fuel oil.
"""},
        {'id': 'o4', 'title': '4. Equipment', 'body': """
A **micron** (one thousandth of a millimeter) is how we measure **droplet and particle size**.

- **Pressure / compression sprayers**: big droplets (hundreds of microns). The most control; best when you want to coat a surface.
- **Wet foggers / misters**: 25–100 micron droplets. Can over-wet and stain **moisture-sensitive** materials if the operator isn't careful.
- **ULV foggers**: cold-fog **water**- or alcohol-based deodorants at **8–15 microns**. Droplets stay in the air 5–6 hours.
- **Thermal foggers**: heat petroleum-based deodorant into **0.5–2 micron** droplets that act like smoke and modify the odor (a **masking** treatment).
- **Ozone (O3)**: an oxidizing gas made on site by an **ozone generator**. It is **heavier than air**, so use a fan to move it. It harms plants and natural (latex) rubber. Too much causes coughing, sneezing, nosebleeds and eye irritation. Nobody stays in the space while it runs; it takes 24–72 hours, and most of it is gone 10–15 minutes after you turn it off. Ventilate before anyone goes back in.
- **Hydroxyl generators**: UV light plus water vapor makes hydroxyls that oxidize odor.
- **Exhaust fans and air scrubbers** dilute or remove odors and toxic gases; carbon filters adsorb odor.
"""},
        {'id': 'o5', 'title': '5. Smoke odors', 'body': """
- **Protein** odors (burned meat or poultry) are persistent; yellow-brown greasy residue, usually needs wet cleaning.
- **Natural** odors (wood, paper, cotton): gray or black, dry and powdery.
- **Synthetic** odors (plastics, synthetics): black residue that smudges.
- Smoke gets in by **heat, pressure, impingement** (splatter), **magnetism** (drawn to metal) and **ionization** (smoke webs). Driven (hot) smoke marks vertical surfaces; free-floating (cold) smoke settles on horizontal ones.
- **Higher temperatures greatly increase** how deep odor goes into porous materials.

**The three-step smoke odor process**

Use **multiple techniques**; one method alone never finishes the job. Odor work should **precede** normal cleaning and repairs.

1. **Suppression spray**: water-based counteractant on every surface in the source area (preliminary detoxification).
2. **Time-released counteractant** granules on horizontal surfaces, attics, crawl spaces and plenums.
3. **Thermal fogging**, which follows the same paths the smoke took.

**Fogging safety**: evacuate unprotected **persons, pets** and plants. Wear respiratory, **eye** and skin protection. Tell the **fire department** first. Turn off pilot lights, because over-fogging a tight space risks **explosion**. Too much fog leaves a slippery **oily** residue. Cover the smoke detectors, then uncover them afterward.
"""},
        {'id': 'o6', 'title': '6. Microbial odors', 'body': """
- **Pathogenic** means disease-causing.
- **Bacteria** are **single-celled** organisms with no chlorophyll. They split in two as often as every 15–30 minutes.
- **Fungi** (molds, yeasts, mushrooms) feed on living or dead material. Indoors they like **68°–86°F**, the temperatures people like. They need **moisture** to germinate from **spores**.
- Mold odor is **MVOCs**: microbial volatile organic compounds.
- **Viruses** are parasites that only live and reproduce inside the cells of a living host.
- In the U.S. the **EPA** regulates disinfectants and antimicrobials; in Canada it is **Health Canada**.
- **Biocides** (antimicrobials) are the tool for odors caused by microorganisms. Keep the surface wet for the label's dwell time. **Following the label directions is the law.**

**Read the label**

- **Sterilant**: kills microorganisms and their spores.
- **Disinfectant**: kills most microorganisms, but **not necessarily spores**.
- **Sanitizer**: reduces microorganisms to a level that is **safe for human use**.
- **-cide** (bactericide, fungicide) **kills**. **-stat** (bacteriostat, fungistat) **limits** growth.
- Signal words: **Danger** = highly toxic, **Warning** = moderately toxic, **Caution** = low toxicity.
"""},
        {'id': 'o7', 'title': '7. Pet and animal odors', 'body': """
- If the pet is still living there, **never guarantee** urine odor removal; it will go back to the same spot.
- Urine-soaked **carpet pad is usually discarded**. Severe odor may need a **bio-enzymatic** (digesting) deodorant.
- Find out how many animals there are, the **degree of penetration**, and how much urine there is. Urine soaks down through the **multiple layers** of carpet, pad and subfloor.
- An **ultraviolet (black) light** is the best way to find urine. Moisture meters and bright lights help too. Male dogs mark along walls; females squat in the open.
- Fresh urine is **acidic**; as it dries it turns **alkaline**. The dried **urine salts** are hygroscopic: they pull moisture from the air and release odor again. An **acid rinse** neutralizes and dissolves those salts.
- Options, from cheapest to best: customer-applied products → **spot treatment** (inject, acid rinse, flush with clear water, enzyme, dwell, **thorough extraction**) → **total decontamination**.
- Concrete is the easiest floor to clean (acid cleaner, then a solvent-based sealer). Vinyl tile and linoleum are the hardest and usually come out.
- Seal odor-damaged wood and walls with a **nonporous sealing compound** (pigmented shellac, lacquer or alkyd), never latex.
- **Dead animals**: the hard part is **finding the carcass** (borescope, cadaver dogs, wetting and heating to bring the odor out).
- **Skunk and decomposition** odors respond to **oxidation**. **Chlorine bleach** (1:10) works on durable **colorfast** surfaces such as concrete, but it discolors nylon, corrodes metal and destroys protein fibers. **Hydrogen peroxide** works on colorfast surfaces too.
"""},
        {'id': 'o8', 'title': '8. Trauma scenes and bloodborne pathogens', 'body': """
Death and blood cleanups bring two main bloodborne risks: **Hepatitis B (HBV)**, which attacks the liver, and **HIV**, which can lead to **AIDS**. The odor comes from decomposing **proteins**.

- A **bloodborne pathogen** is a harmful microorganism in blood, body fluids or other potentially infectious materials (OPIM). **Saliva and blood** can both carry them.
- The program starts with a written **exposure control plan**: how a worker could be exposed and how we prevent it.
- **PPE is mandatory** whenever there is a risk of **exposure** to urine, feces, blood or sewage.
- **Universal precautions**: treat **all** blood and body fluids as potentially **infectious**.
- Soaked fabrics go in labeled containers and are handled as **biohazard** waste. Biohazard labels are printed on **fluorescent red-orange**.
- GrayCo offers the **Hepatitis B vaccine** free to anyone who may be exposed. If someone who isn't vaccinated is exposed, the first shot must be within **24 hours**.
- **Exposure incident**: splash in the eye → flush with clean running water for **15 minutes** and see a doctor. On the skin → wash with **soap** and water. GrayCo must **document** the route and circumstances of the exposure, so tell your supervisor right away.
- Finish by cleaning every salvageable surface with a proper **disinfectant**, then seal porous surfaces (not with latex paint).
"""},
        {'id': 'o9', 'title': '9. Tobacco, HVAC, new carpet and leftover odors', 'body': """
**Tobacco (ETS)**

- Tobacco odor comes from sticky residue built up on surfaces, especially **porous surfaces**, ceilings and car headliners.
- The particles are **0.01 to 1.0 microns**, so they get everywhere, including the HVAC.
- The key step is **washing the affected surfaces**. Then run the three-step process: suppression spray, counteractant with an absorbent, thermal fog. Seal with pigmented shellac where needed.

**HVAC**

- **Never fog or spray liquid deodorizer into a forced-air system.** If someone becomes sensitive to it, the only fix is replacing the ductwork.
- Clean the components and change the filters. Time-release counteractant or carbon can go in the plenum.

**New carpet**

- New carpet smell is 4-PCH gassing off the latex backing. The first step is **ventilation** (air exchange). A "bake-out" with heat and an adsorbent can help.

**When the odor comes back**

- The biggest mistake in odor work is failing to find and remove **the source**. Smoke odor does not go away on its own. Sniff-test baseboards, outlets and cavities, and go back to principle 1.
"""},
    ],
    'quiz': [
        ('The technician\'s best tool for finding an odor and judging how strong it is:', ['A moisture meter', 'The nose', 'A UV light', 'An air sampler'], 1, 'Your nose is still the best odor-locating tool.'),
        ('Odors people believe they smell because of memory or suggestion are called:', ['Real odor', 'Heightened awareness odor', 'MVOCs', 'Complex odor'], 1, 'Also called psychological odor.'),
        ('Getting used to an odor until you no longer notice it is:', ['Adsorption', 'Acclimation', 'Oxidation', 'Penetration'], 1, 'Acclimation: the baker can\'t smell the bread.'),
        ('Deodorization almost always begins with:', ['Thermal fogging', 'Sealing', 'Removing the source', 'Ozone'], 2, 'Principle 1: remove the source.'),
        ('Which principle of odor control is "Penetration"?', ['First', 'Second', 'Third', 'Fourth'], 2, 'Remove, clean, penetrate, seal.'),
        ('A product that combines with a malodor to form a new odorless compound is a:', ['Masking agent', 'Pairing agent', 'Biocide', 'Adsorbent'], 1, 'Pairing agents change the odor molecule.'),
        ('ULV foggers make droplets of about:', ['0.5–2 microns', '8–15 microns', '25–100 microns', 'Hundreds of microns'], 1, 'ULV = 8–15 microns.'),
        ('Thermal foggers make droplets of about:', ['0.5–2 microns', '8–15 microns', '25–100 microns', '1/8 inch'], 0, 'The smallest droplets; they act like smoke.'),
        ('Ozone gas is:', ['Lighter than air', 'Heavier than air', 'The same weight as air', 'Not a gas'], 1, 'Use a fan to circulate it.'),
        ('Ozone can damage:', ['Glass', 'Plants and natural (latex) rubber', 'Concrete', 'Steel studs'], 1, 'Remove plants; coat rubber with petroleum jelly.'),
        ('The most effective system for intense smoke odor is:', ['One strong product', 'Multiple techniques', 'Ozone only', 'Painting over it'], 1, 'One method alone gives incomplete results.'),
        ('Step 1 of the three-step smoke odor process is:', ['Thermal fogging', 'Time-release granules', 'Suppression spray', 'Sealing'], 2, 'Suppression spray (preliminary detoxification).'),
        ('The most serious hazard of over-fogging petroleum deodorant in a tight space is:', ['Staining', 'Possible explosion', 'Mold growth', 'Noise'], 1, 'Turn off pilot lights and don\'t over-fog.'),
        ('Indoor fungi grow best between:', ['32°–50°F', '50°–60°F', '68°–86°F', '100°–120°F'], 2, 'The same range people like.'),
        ('A product with the suffix "-stat" on the label:', ['Kills organisms', 'Limits or controls growth', 'Is a sterilant', 'Is a deodorant only'], 1, '-cide kills; -stat limits.'),
        ('Reducing microorganisms to a level safe for human use is called:', ['Sterilizing', 'Disinfecting', 'Sanitizing', 'Masking'], 2, 'A sanitizer reduces microorganisms to a safe level.'),
        ('If the pet will keep living in the home, you should:', ['Guarantee the work for 1 year', 'Never guarantee urine odor removal', 'Only use ozone', 'Refuse the job'], 1, 'The animal will go back to the same spot.'),
        ('As urine dries it changes from:', ['Alkaline to acid', 'Acid to alkaline', 'Neutral to acid', 'It does not change'], 1, 'Dried urine salts are alkaline; use an acid rinse.'),
        ('Treating all blood and body fluids as potentially infectious is called:', ['Universal precautions', 'Exposure control', 'Sanitizing', 'Decontamination'], 0, 'Universal precautions.'),
        ('An unvaccinated tech exposed to blood must get the first Hepatitis B shot within:', ['24 hours', '3 days', '1 week', '30 days'], 0, 'Within 24 hours of the exposure.'),
    ],
}

COURSES = [FIRE, ODOR]
PASS = 16   # of 20
