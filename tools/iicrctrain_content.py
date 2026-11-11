"""IICRCTRAIN content — GrayCo's own field training documents, organized around the IICRC standards (owner 11/11: "iicrc s 700
needs to have important stuff for water fire etc in the crm in our own training documents as iicrc s700 training").

Written in GrayCo's own words from common restoration practice. The IICRC standards (ANSI/IICRC S500, S520, S700) are copyrighted;
nothing here is copied from them — no text, tables or figures. Each document only names the standard whose principles it follows.
One source for: the CRM's 🎓 Training tab (a course per document, a part per section, a test at the end), the printable training
record (Forms & Docs → pinned 🎓 IICRC training; the Mitigation / Environmental Dashboard papers card; 🧪 Materials & SDS) — see
tools/iicrctrain.js and tools/patch_IICRCTRAIN.py.

Markdown the CRM understands: **bold**, "- " bullets, "1. " numbered lists, blank line = new paragraph.
Each quiz question: (question, [choices], index of the right choice, why).
"""

FIRE = {
    'id': 's700',
    'title': 'GrayCo Fire & Smoke Restoration Training (IICRC S700 principles)',
    'short': 'Fire & Smoke (S700)',
    'icon': '🔥',
    'std': 'ANSI/IICRC S700, the Standard for Professional Fire and Smoke Damage Restoration',
    'cat': 'IICRC',
    'required': ['insurance'],
    'cos': ['mitigation'],
    'intro': ("How GrayCo works a fire and smoke job from the first call to the final walkthrough: safety, the job start, smoke residue, "
              "the cleaning order, contents, structure, odor control, HVAC, firefighting water, board-up, insurance paperwork and the "
              "mistakes we never make. Based on the principles of ANSI/IICRC S700, written in our own words."),
    'sections': [
        {'id': 'safety', 'title': 'Safety first', 'body': """
Nobody goes into a burned building until it is safe to enter. The fire department or fire marshal must have **released the scene**, and you never work alone inside a fire loss.

- **Structure.** Look up and look down before every step: burned floors, stairs, roof framing and ceilings can fail without warning. Stay off anything soft, sagging or charred through. If in doubt, stay out and call your supervisor.
- **Electrical and gas.** Assume every wire is live. Confirm the power and gas are off (or made safe by the utility) before you touch fixtures, wet areas or the panel. Never restore power yourself.
- **Air quality.** Fire leaves **carbon monoxide**, fine soot particles and chemical gases behind. Ventilate, run HEPA air scrubbers, and leave right away if you get a headache, dizziness or nausea.
- **Older homes.** Fire debris can contain asbestos or lead paint. Do not demolish, sand or scrape suspect materials until they are tested.
- **Chemicals.** Read the label and the **SDS** (🧪 Materials & SDS tab) before you use any product. Keep everything in labeled containers.

**Minimum PPE on every fire job**

- A fitted **respirator**: P100 (HEPA) cartridges preferred; an **N95 is the bare minimum** for light dry-soot work only.
- **Nitrile gloves** (cut-resistant gloves over them for debris).
- **Eye protection**: safety glasses, or goggles when spraying or overhead.
- Disposable coveralls, and sturdy boots with a puncture-resistant sole.
"""},
        {'id': 'start', 'title': 'Starting the job', 'body': """
A family that just had a fire is having one of the worst days of their life. **Lead with empathy**: introduce yourself, say you are sorry this happened, listen, and explain what happens next in plain words. Ask whether anyone needs medicine, glasses, phone chargers, pet supplies or documents from the house right away.

1. **Walk through with the customer** (when safe). Note where the fire started, which rooms have heat damage, which have only smoke, and where water was used.
2. **Photos and video before you touch anything**: every room, every wall, ceilings, floors, contents, the outside, and close-ups of residue. Upload them to the job in the CRM.
3. **Get the work authorization signed** (Fire & Smoke Work Authorization in 📄 Forms & Docs) before work starts. No signature, no work, except emergency safety steps your supervisor approves.
4. **Write the scope**: what needs board-up, what needs drying, what needs cleaning, what gets packed out.
5. **Set expectations**: what we will do today, what happens tomorrow, who their contact is, and when they will hear from us again.
"""},
        {'id': 'secure', 'title': 'Board-up, tarp and securing the property', 'body': """
Securing the building protects the customer and stops more damage.

- **Board up** broken windows and doors with plywood fastened from the outside; leave at least one secure, lockable entry for access.
- **Tarp** roof openings; overlap the tarp past the ridge and fasten it to boards, not straight through the tarp, so wind and rain cannot get under it.
- **Fence or tape off** hazards, and post a "no entry" sign on unsafe areas.
- Turn off and protect the **water supply** if lines could freeze or are damaged.
- Get the **Board-up / Tarp Authorization** signed, and photograph the finished board-up.
"""},
        {'id': 'residue', 'title': 'Know your smoke residue', 'body': """
What burned, how hot it burned and how much air the fire had decide what the residue is like, and that decides how we clean it. Identify it before you pick a method.

- **Dry smoke residue** — from fast, hot fires burning wood and paper. Powdery and loose. Easiest to remove: dry methods first (HEPA vacuum, dry chemical sponge). Wiping it wet first pushes it into the surface.
- **Wet smoke residue** — from slow, smoldering, low-heat fires, often plastics and rubber. Sticky, smeary and strong-smelling. Needs dry pickup of anything loose, then wet cleaning with detergents and often degreasers.
- **Protein residue** — from burned food (meat, beans, grease). Almost invisible; leaves a yellow-brown film and a very strong odor. Needs wet cleaning with a degreaser-type cleaner, and thorough odor control.
- **Fuel-oil soot** — from a furnace or boiler "puffback". Black, oily and heavy. Needs specialty solvent or degreasing cleaners, and the heating unit must be repaired before it runs again.

Heat also matters: rooms near the fire get baked-on residue; rooms far away get lighter residue. Follow the smoke from the fire room outward until you find clean surfaces, and write down every material it touched.
"""},
        {'id': 'hierarchy', 'title': 'The cleaning order: least aggressive first', 'body': """
Always start with the gentlest method that could work, and only step up if you need to.

1. **Dry** — HEPA vacuum, then dry chemical (soot) sponge, wiped in one direction.
2. **Wet** — a mild detergent cleaner, clean towels or sponges, and a clean-water rinse.
3. **Chemical** — degreasers, alkaline cleaners or solvents, matched to the residue and the surface.
4. **Abrasive or refinishing** — only when the above fail, and only with approval.

**Test-clean first.** Pick a small spot that does not show (inside a closet, behind furniture). Try your method, let it dry, and check the result with the customer or supervisor. Write down what worked. Never promise that an item or surface can be saved until the test is done.
"""},
        {'id': 'contents', 'title': 'Contents: inventory, pack-out and what cannot be saved', 'body': """
The customer's belongings are often what they care about most. Handle them like they are your own.

- **Inventory** everything room by room: a description, the condition, a photo, and the box number it goes in. Use the CRM's contents papers (Pack-out Authorization, Contents Storage, Contents Return).
- **Pack-out** items that need cleaning or protection from the work. Label every box with room and contents. Keep high-value items, documents, photos and medicine separate and tracked.
- **Clean contents** with the same least-aggressive-first order. Electronics: do not power them up; they may need a specialist.
- **Non-salvageable items**: food, medicine, cosmetics and anything exposed to heat, smoke or firefighting water that touches the mouth or skin is usually thrown away. Burned, melted or badly stained items too.
- **Never throw anything away without written consent.** List every non-salvageable item, photograph it, and get the customer's signature on the Non-Salvageable Contents Disposal paper first. Insurance needs this list.
"""},
        {'id': 'structure', 'title': 'Cleaning the structure', 'body': """
- **Top down: ceilings first**, then walls, then floors, so dirt falls onto what you have not cleaned yet.
- **HEPA vacuum** loose soot from every surface before anything else. A regular shop vacuum blows fine soot back into the air.
- **Dry chemical sponge** on flat paint, ceilings and textured surfaces. Wipe in straight, overlapping strokes; when one face is dirty, cut or turn to a clean face.
- **Degreasers and detergents** for wet, protein and oil residues, applied with a sprayer or cloth, worked, then rinsed. Don't flood walls; too much water stains drywall and soaks insulation.
- **Hidden places**: inside cabinets and closets, behind switch and outlet covers, attics, wall cavities near the fire, on top of door frames. Smoke goes everywhere air goes.
- **Charred or blistered materials** are removed, not cleaned. Cleaning cannot fix structural char.
"""},
        {'id': 'odor', 'title': 'Odor control: the right order', 'body': """
Smoke odor comes from tiny particles and gases soaked into the building. Spraying a fragrance only covers it up for a while. Follow this order:

1. **Remove the source** — burned materials, debris, charred wood and non-salvageable contents leave the building.
2. **Clean** — every surface the smoke reached, using the cleaning order above.
3. **Seal** — after cleaning, an **odor-sealing (encapsulating) primer** on framing, subfloors and walls that will be painted. Sealing is never a substitute for cleaning.
4. **Deodorize** — to reach odor that is left in the air and in porous materials.

**Deodorizing tools**

- **Thermal fogging** reaches the same places the smoke did; the area is empty of people and pets, and the fogger operator wears a respirator.
- **Hydroxyl generators** are safe to run around people and are good for occupied homes and contents.
- **Ozone** is strong and works fast, but: **nobody — no people, no pets, no plants — inside** while it runs. Post signs, lock the doors, and let the space air out for the time the maker says before anyone goes back in. Ozone can damage rubber and some fabrics, so remove or protect them.
- Get the customer's signed **Odor-Control Safety Notice** before any fogging or ozone.
- HEPA air scrubbers run during the whole job to catch airborne soot.
- The next part explains masking agents, pairing agents and every other deodorizing tool.
"""},
        {'id': 'deodor', 'title': 'Odor control: masking agents vs pairing agents (and the other deodorization methods)', 'body': """
Customers and adjusters will ask what we are spraying. Know the difference, and say it plainly.

**Masking agents (fragrance deodorizers)**

- A masking agent **covers** a bad odor with a stronger, pleasant one. It does nothing to the odor itself.
- It is **temporary**: when the fragrance fades, the smoke smell comes back.
- It is **never a substitute** for removing the source and cleaning.
- Fragrances can bother people with allergies, asthma or chemical sensitivities.
- Use one only as a **short-term courtesy after the real work is done**, and only with the customer's consent.

**Pairing agents (odor counteractants, "reactive" deodorizers)**

- A pairing agent **chemically pairs or bonds with odor molecules** so they no longer smell — it neutralizes the odor instead of hiding it.
- It works **only where it touches** the odor molecules, so it goes on **after cleaning**, sprayed, wiped or fogged onto the affected surfaces.
- Follow the label for dilution and application, and ventilate.

**The deodorization order, and where each method fits**

1. **Remove the source** — burned debris, charred materials, non-salvageable contents.
2. **Clean** — every surface the smoke reached.
3. **Recreate the conditions / penetrate like the odor did** — reach the odor wherever the smoke went, with the tools below.
4. **Seal** — encapsulate what is left, as the last step.

**The tools for step 3 and 4**

- **Absorbents and adsorbents** — activated carbon and zeolite products that trap odor molecules (carbon filters in air scrubbers, zeolite bags in closed spaces).
- **Oxidizers** — break odor molecules apart: **ozone** (the space must be **unoccupied**: no people, pets or plants); **hydroxyl generators** (can run in occupied spaces when the manufacturer says so); **chlorine dioxide** (strong; unoccupied, label rules, trained techs only).
- **Digesters — enzymes and bacterial products** — break down organic and protein residue (kitchen fires, food, urine). They need moisture and time to work.
- **Thermal fogging** — a heated, solvent-based deodorant fog that **penetrates the same way hot smoke did**. Unoccupied area, respirator, all pilot lights and ignition sources off.
- **ULV / wet fogging** — a fine water-based mist of deodorant (often a pairing agent) for rooms, wall cavities and contents.
- **Encapsulants and sealing primers** — shellac-based or oil-based stain-and-odor-blocking primers on cleaned framing, subfloors and walls. **The final step, never a replacement for cleaning.**
"""},
        {'id': 'oxidizers', 'title': 'Oxidizing agents for odor', 'body': """
**How oxidation works.** Most odors are molecules floating in the air or stuck in materials. An oxidizer is a chemical that grabs electrons from those molecules and **breaks them apart** into different, odorless pieces. Unlike a masking agent, the odor molecule is destroyed. The catch: anything strong enough to break odor molecules can also attack **dyes, fabrics, rubber, metals and lungs**, so every oxidizer has rules.

- **Sodium perborate (oxygen bleach)** — a powder that releases oxygen (hydrogen peroxide) in water. Our go-to for **deodorizing fabrics, textiles and washable contents** (laundering, soaking, carpet and upholstery spotting). **Warm water activates it.** Always **test colorfastness** on a hidden spot first. Don't use it on wool, silk or leather without testing (and usually not at all). Gentler on colors than chlorine bleach.
- **Sodium hypochlorite (chlorine bleach)** — strong and cheap, for **hard, non-porous surfaces** only. It removes color and weakens fabric fibers. **Never mix it with ammonia, acids or quat disinfectants** — that makes toxic gas.
- **Hydrogen peroxide** — cleaning, stain and odor removal and disinfecting (ready-to-use and accelerated products). Breaks down to water and oxygen. Can **bleach** fabrics, carpet and some finishes: test first. Concentrates burn skin and eyes.
- **Chlorine dioxide** — a gas (from release packets or generators) or a solution. A **very strong oxidizer** that reaches odors in cavities and contents. **Trained techs only**, the space empty of people and pets per the label, and aired out before re-entry. Heavy doses bleach fabrics and corrode metals and electronics.
- **Ozone** — a gas from an ozone generator. Strong and fast. **Unoccupied spaces only: no people, pets or plants.** It degrades **rubber, some plastics, elastic and some fabrics**, and dyes with long exposure. Ventilate before anyone goes back in.
- **Hydroxyl radicals** — made by hydroxyl generators (UV lamps) from the moisture in the air. **Can run with people and pets present** when the maker says so. Safer on materials, but **slower** than ozone — days, not hours.

**Side by side**

| Oxidizer | Strength | Occupied? | Watch out for |
|---|---|---|---|
| Sodium perborate | Mild to moderate | Yes (a laundry / cleaning product) | Test colorfastness; not wool, silk or leather |
| Chlorine bleach | Strong | Ventilate; keep people away while using | Hard surfaces only; bleaches and weakens fabric; never mix with ammonia, acids or quats |
| Hydrogen peroxide | Mild (ready-to-use) to strong (concentrate) | Yes for ready-to-use, with ventilation | Bleaching; concentrates burn |
| Chlorine dioxide | Very strong | **No** — empty per label | Trained use; bleaches; corrodes metals / electronics |
| Ozone | Strong, fast | **No** — no people, pets or plants | Rubber, plastics, some fabrics; air out before re-entry |
| Hydroxyl | Moderate, slow | Yes, per the maker | Takes longer; keep the unit closed while running |

Every one goes on **after** source removal and cleaning, and every one needs the SDS read and the customer's consent (🧪 Materials & SDS).
"""},
        {'id': 'hvac', 'title': 'HVAC and ductwork', 'body': """
The heating and cooling system can spread soot and odor to every room.

- **Turn the system off** as soon as you arrive, and keep it off during cleaning.
- **Cover supply and return registers** with plastic or filter media so the ducts don't pull soot in or blow it out.
- Change the filter and check the unit and the ducts for soot. If the ducts are contaminated, they need cleaning by a qualified duct cleaner before the system runs again.
- After cleaning, run the system with a fresh filter, and check for odor at the registers during the final walkthrough.
"""},
        {'id': 'water', 'title': 'Water from firefighting', 'body': """
Fire hoses can put hundreds of gallons into a house. That water picks up soot and debris, so treat it as **contaminated** (at least Category 2, often Category 3 — see the GrayCo Water Damage Restoration Training, S500 principles).

- Start drying the same day. Wet materials left for a day or two start growing mold.
- Extract standing water, remove wet porous materials that are contaminated, and set up drying equipment with daily moisture readings.
- Fire jobs often need both teams: the fire cleaning and the water drying run side by side.
"""},
        {'id': 'docs', 'title': 'Documentation for insurance', 'body': """
If it isn't written down and photographed, it didn't happen. Good paperwork gets the customer's claim paid and protects GrayCo.

- **Photos**: before, during and after, from the same spots. Close-ups of residue and of the test-clean spots.
- **Daily notes** in the CRM: what we did, who was there, products used, equipment on site.
- **Signed papers**: work authorization, board-up, odor-control notice, pack-out, non-salvageable list, equipment removal.
- **Explain the choice**: for every item or material we clean or replace, note why (the test-clean result, char, melting, odor that will not clean out).
- **Moisture readings and drying logs** for any wet areas.
"""},
        {'id': 'final', 'title': 'Final walkthrough and clearance', 'body': """
- **Odor check**: close the house up for a while, then have someone who has not been working inside walk in and smell for smoke. Check closets, cabinets and registers.
- **Wipe test**: a clean white cloth on cleaned surfaces should come away clean.
- **Walk every room with the customer.** Fix anything they point out before you leave if you can, or schedule it.
- Get the **Final Inspection / Walkthrough Sign-Off** and the **Equipment Removal Sign-Off** signed, and return or schedule return of contents with the Contents Return paper.
- Thank them. A family that felt cared for tells their friends.
"""},
        {'id': 'never', 'title': 'What we never do', 'body': """
- **Never mix chemicals.** Some cleaners together make toxic gas. One product at a time, rinse between.
- **Never run ozone with people, pets or plants inside.**
- **Never wet-clean dry soot first.** Vacuum and dry sponge first, or you smear it in for good.
- **Never throw anything away without the customer's written consent.**
- Never promise an item can be saved before you test-clean it.
- Never enter an unreleased or unsafe structure, and never work without your respirator.
- Never use or paint over a surface with a sealer before it is cleaned.
- Never use a masking agent (fragrance) in place of removing the source and cleaning.
"""},
    ],
    'quiz': [
        ('Before anyone goes into a burned building, what must be true?', ['The customer says it is fine', 'The fire department or fire marshal has released the scene and it is safe to enter', 'The insurance adjuster has been called', 'The power is back on'], 1, 'The scene must be released and checked for structural, electrical and air hazards first.'),
        ('What is the minimum respiratory protection on a fire job?', ['None if the windows are open', 'A dust mask from the hardware store', 'An N95 at the very least; a respirator with P100 cartridges is preferred', 'Only the supervisor needs one'], 2, 'Soot particles are tiny and harmful; P100 is preferred and N95 is the bare minimum.'),
        ('What do you do before touching anything at the start of the job?', ['Start the HEPA vacuums', 'Throw out the obvious trash', 'Take photos and video of every room, the contents and the outside', 'Turn on the HVAC to clear the smoke'], 2, 'Before photos document the loss for the customer and the insurance claim.'),
        ('Powdery, loose residue from a fast, hot fire burning wood and paper is:', ['Dry smoke residue', 'Wet smoke residue', 'Protein residue', 'Fuel-oil soot'], 0, 'Dry residue is powdery and is removed with dry methods first.'),
        ('A nearly invisible yellow-brown film with a very strong odor after a kitchen fire is:', ['Dry smoke residue', 'Protein residue', 'Fuel-oil soot', 'Mold'], 1, 'Burned food leaves protein residue; it needs wet cleaning with a degreaser and strong odor control.'),
        ('What is the correct cleaning order?', ['Chemical → wet → dry', 'Wet → dry → chemical', 'Dry → wet → chemical, least aggressive first', 'Whatever is fastest'], 2, 'Always start with the gentlest method that could work.'),
        ('What does a masking agent do?', ['Chemically neutralizes odor molecules', 'Covers the odor with a stronger, pleasant fragrance for a while', 'Removes soot from walls', 'Seals framing'], 1, 'Masking is temporary; the odor returns when the fragrance fades. It never replaces source removal and cleaning.'),
        ('A customer\'s smoke-damaged sofa cannot be saved. What must happen before it is thrown away?', ['Nothing, it is obviously ruined', 'It is listed, photographed and the customer signs the non-salvageable disposal list', 'The crew leader decides', 'It is put on the curb right away'], 1, 'Never throw anything away without the customer\'s written consent.'),
        ('How is a pairing agent (odor counteractant) different from a masking agent?', ['It smells stronger', 'It chemically pairs with odor molecules to neutralize them, and works only on contact after cleaning', 'It is the same thing', 'It can be used instead of cleaning'], 1, 'Pairing agents neutralize odor molecules they touch; they go on after cleaning.'),
        ('Which oxidizer is our go-to for deodorizing washable fabrics and contents?', ['Chlorine bleach', 'Sodium perborate (oxygen bleach), in warm water after a colorfastness test', 'Ozone in a sealed bag with the customer present', 'Chlorine dioxide in the laundry'], 1, 'Sodium perborate releases oxygen in warm water and is gentler on colors; test colorfastness first.'),
        ('Which oxidizer can run with people and pets in the house (per the maker)?', ['Ozone', 'Chlorine dioxide gas', 'A hydroxyl generator', 'None of them'], 2, 'Hydroxyl generators can run occupied per the manufacturer; ozone and chlorine dioxide need an empty space.'),
        ('In the deodorization order, when does a sealing (encapsulating) primer go on?', ['First, before cleaning', 'Instead of cleaning', 'Last, after source removal, cleaning and deodorizing', 'Never'], 2, 'Sealing is the final step and never a replacement for cleaning.'),
        ('What is the right order for odor control?', ['Deodorize → clean → seal', 'Seal → deodorize → clean', 'Remove the source → clean → seal → deodorize', 'Fog only'], 2, 'Odor has to be removed at its source and cleaned; sealing and deodorizing come after.'),
        ('When can people or pets be inside while ozone runs?', ['When the windows are open', 'Never — the space must be empty of people, pets and plants', 'If they wear N95s', 'For under an hour'], 1, 'Ozone is harmful to breathe; the area must be empty, signed and aired out before re-entry.'),
        ('What do you do with the HVAC system on a fire job?', ['Run it on high to clear the smoke', 'Turn it off, cover the registers, and have contaminated ducts cleaned before it runs again', 'Nothing, it is not part of the job', 'Only change the filter'], 1, 'The HVAC system spreads soot and odor through the whole house.'),
    ],
}

WATER = {
    'id': 's500',
    'title': 'GrayCo Water Damage Restoration Training (IICRC S500 principles)',
    'short': 'Water Damage (S500)',
    'icon': '💧',
    'std': 'ANSI/IICRC S500, the Standard for Professional Water Damage Restoration',
    'cat': 'IICRC',
    'required': ['insurance'],
    'cos': ['mitigation'],
    'intro': ("How GrayCo works a water loss: water categories and classes, safety, inspection and moisture mapping, extraction, "
              "drying science, equipment, daily monitoring, what to remove, antimicrobials, contents, paperwork and customer care. "
              "Based on the principles of ANSI/IICRC S500, written in our own words."),
    'sections': [
        {'id': 'safety', 'title': 'Safety on a water job', 'body': """
- **Electricity and water kill.** Before you step into standing water, make sure the power to that area is off. Plug every piece of equipment into a **GFCI**-protected outlet or a GFCI cord, keep cords out of water, and never overload a circuit.
- **Slips, trips and falls.** Wet floors, hoses and cords everywhere. Wear slip-resistant boots and route cords along walls.
- **Ceilings.** A ceiling holding water can fall. Never stand under a sagging ceiling; your supervisor decides how to drain it.
- **Contamination.** Dirty water carries bacteria and viruses. Wear gloves, eye protection and a respirator (N95 minimum, P100 for sewage), plus boots and coveralls on Category 2 and 3 jobs. Wash before you eat, drink or smoke.
- **Older homes.** Test for asbestos and lead before cutting drywall, removing flooring or disturbing old paint.
- **Crawlspaces and attics**: tell someone before you go in, watch for wiring, pests and heat.
"""},
        {'id': 'cats', 'title': 'Water categories: how dirty the water is', 'body': """
The category is about **contamination** — what is in the water — and it decides how careful we must be and what we can save.

- **Category 1 — clean water.** From a clean source like a broken supply line or an overflowing sink with clean water. Low risk at first.
- **Category 2 — significantly contaminated.** Water that could make people sick: washing-machine or dishwasher discharge, a toilet overflow with urine but no feces, aquarium water.
- **Category 3 — grossly contaminated.** Sewage, toilet backflow with feces, rising floodwater from rivers or storms, and any water that has picked up serious contaminants. Treat as dangerous.

**Water gets worse over time.** Clean water does not stay clean: as it sits, touches dirty materials and warms up, bacteria grow. A Category 1 loss can become Category 2 within a day or two (faster in a warm house), and Category 2 can become Category 3. **When in doubt, treat it as the higher category.**
"""},
        {'id': 'classes', 'title': 'Water classes: how much is wet', 'body': """
The class describes **how much water and how much wet material** there is to dry — the evaporation load. It guides how much drying equipment the job needs.

- **Class 1 — the smallest.** Part of a room, low-absorbing materials, little water soaked in.
- **Class 2 — a whole room.** Carpet and pad are wet, and water has wicked up the walls a little way.
- **Class 3 — the most water.** Water came from above: ceilings, walls, insulation, carpet and subfloor are soaked.
- **Class 4 — specialty drying.** Dense, slow-drying materials hold the water — hardwood, plaster, concrete, stone, crawlspaces — and need special methods and more time.
"""},
        {'id': 'inspect', 'title': 'Inspection and moisture mapping', 'body': """
1. **Find and stop the source** (or confirm a plumber has).
2. **Category check**: where did the water come from, how long has it been there, what has it touched?
3. **Map the wet area.** Use a non-penetrating meter to scan and a penetrating (pin) meter to confirm. A thermal camera helps you find wet areas, but **always confirm with a meter** — a cold spot is not always water.
4. **Mark the wet edge** on a sketch or floor plan and take photos of the readings.
5. **Take dry standard readings** from the same kind of material in an unaffected area. That number is our drying goal.
6. Photograph everything before you start extraction or removal.
"""},
        {'id': 'extract', 'title': 'Extraction first', 'body': """
Removing water as liquid is many times faster and cheaper than evaporating it.

- Extract standing water first with a truck-mount or portable extractor.
- On carpet, use a **weighted or stand-on extraction tool** to pull water from the pad, going over each area several times.
- Remove the pad when it must go (see "Remove or dry") before drying carpet.
- Every gallon you extract is a gallon the dehumidifiers don't have to pull out of the air.
"""},
        {'id': 'psych', 'title': 'Drying science (psychrometry) basics', 'body': """
Drying is moving water from wet materials into the air, then out of the air.

- **Temperature** — warmer air and warmer materials let water evaporate faster.
- **Relative humidity (RH)** — how full the air is with water compared to how much it could hold at that temperature (a percentage).
- **Grains per pound (GPP)** — the actual amount of water in the air. Unlike RH, it doesn't change when the air warms or cools, so it is the number we compare.
- **Dew point** — the temperature at which water condenses out of the air. Cold surfaces below the dew point get wet (sweating windows and pipes).

**The goal:** the air in the drying area should have a **lower GPP than the unaffected areas and the outside air**. Take readings outside, in an unaffected room, in the affected room and at the dehumidifier exhaust every visit. If the affected room's GPP is not lower, the drying isn't working — adjust.

Open windows only when the outside air is drier (lower GPP) than inside.
"""},
        {'id': 'dehu', 'title': 'Dehumidifiers', 'body': """
- **LGR (low-grain refrigerant)** — cools air below its dew point so water condenses and drains out. Our everyday unit; works best in normal room temperatures. Keep the drain hose running to a drain or pump.
- **Desiccant** — pulls moisture out with a drying material instead of cold coils. Works well in **cold spaces**, at **very low humidity**, and on dense materials (hardwood, concrete). The wet air it makes has to be ducted outside.
- Check the exhaust: a working dehumidifier blows out warmer, drier air (lower GPP) than it takes in. Record it on the drying log.
"""},
        {'id': 'air', 'title': 'Air movers: where to start', 'body': """
Air movers speed up evaporation by sweeping damp air off wet surfaces. These are **starting points**, not rules; daily readings tell you whether to add, move or remove equipment.

- Place them along the walls of the wet area, **aimed at the base of the wall** at a low angle, all pointing the same way around the room so the air circles.
- Wet carpet: lift the edge or float it so air moves under it (Category 1 only).
- Wet wall cavities and cabinets may need drilled holes or injection drying.
- **Don't blow air across contaminated (Category 3) materials** before they are removed — it spreads contamination. Run HEPA air scrubbers.
- Too few air movers dries slowly; too many with too little dehumidification just raises the humidity. Balance the air movement with dehumidification and heat.
"""},
        {'id': 'remove', 'title': 'Remove or dry?', 'body': """
- **Category 1**: most materials can be dried in place if we start fast — carpet, pad, drywall, framing.
- **Category 2**: carpet pad is generally removed; carpet and other materials may be cleaned and dried.
- **Category 3**: porous materials that got wet — **carpet, pad, drywall, insulation, upholstered items** — are generally **removed and thrown away** (with the customer's consent and photos). Cut drywall above the wet line ("flood cut").
- Remove anything that is delaminated, swollen past repair, or already growing mold.
- Set up containment and run HEPA scrubbers when tearing out contaminated material.
"""},
        {'id': 'anti', 'title': 'Antimicrobials (with consent)', 'body': """
- Antimicrobials are used **after** cleaning and removal, never instead of it.
- Use only **EPA-registered** products, exactly as the label says (dilution, contact time, ventilation).
- **Get the customer's signed consent** first (Antimicrobial Application Consent; the 🧪 Materials & SDS tab sends the product list to their portal). Some customers have allergies, pregnancies, babies or pets — ask.
- Write down the product, the amount and where it went.
"""},
        {'id': 'odor', 'title': 'Odors on water jobs: masking vs pairing agents', 'body': """
Wet buildings smell musty, and sewage smells worse. The odor goes away when the **source is removed, the area is cleaned and the materials are dry** — not before.

- **Masking agents** (fragrances) only **cover** the smell with a stronger one. Temporary; the odor returns when the fragrance fades; never a substitute for removal, cleaning and drying; can bother sensitive people. A short-term courtesy only, after the real work, with the customer's consent.
- **Pairing agents** (odor counteractants) **chemically pair with odor molecules** to neutralize them. They work only on contact, so they go on **after cleaning**; follow the label and ventilate.
- For organic odors (sewage, urine), **enzyme or bacterial digesters** break down the residue; **activated carbon** in an air scrubber traps odors in the air; **hydroxyl** units can run with people present when the maker allows; **ozone** only in an empty space.
- **Oxidizing agents** break odor molecules apart: **sodium perborate** (oxygen bleach) for washable fabrics and contents — warm water, colorfastness test first; **chlorine bleach** only on hard non-porous surfaces and never mixed with ammonia, acids or quats; **hydrogen peroxide** cleaners (can bleach); **chlorine dioxide** and **ozone** only with nobody inside; **hydroxyl** units can run occupied per the maker but work slower.
- See the Fire & Smoke training (S700 principles) for the full deodorization order and the oxidizer comparison table.
"""},
        {'id': 'monitor', 'title': 'Daily monitoring and drying logs', 'body': """
- **Visit every day.** Take readings on the same marked spots every time, plus the air readings (temperature, RH, GPP) outside, unaffected, affected and at the dehumidifier exhaust.
- Record them on the **Drying Log** with the equipment count and photos.
- **Adjust**: move equipment to the wettest spots, add or remove units, empty or check drains.
- **Dry goal:** a material is dry when its reading matches the **dry standard** you took from the same unaffected material.
- Don't pull equipment until every material has reached its goal, and record the final readings.
"""},
        {'id': 'contents', 'title': 'Contents', 'body': """
- Move furniture off wet floors, or set it on **blocks or foam pads** so legs don't stain the carpet or wick water.
- Pack out what is in the way or needs protection, with an inventory and photos.
- Wet papers and photos: keep them, don't separate stuck pages; they can often be frozen and restored by a specialist.
- Electronics that got wet: don't plug them in.
- Never throw anything away without the customer's written consent.
"""},
        {'id': 'docs', 'title': 'Paperwork and the certificate of drying', 'body': """
- Signed: **Emergency Water Authorization**, **Water Category & Class Report**, **Equipment Responsibility**, **Antimicrobial Consent** (if used).
- Daily **Drying Logs** with readings, and photos of the meters on the marked spots.
- At the end: the **Certificate of Drying** with final readings against the dry standard, and the **Equipment Removal Sign-Off**.
- Everything goes on the job in the CRM, so the office and the insurance claim have it the same day.
"""},
        {'id': 'care', 'title': 'Customer care', 'body': """
- The customer is stressed and their house is loud. Explain what each machine does and why it has to stay on.
- Ask them **not to turn equipment off**, to keep doors and windows as we set them, and to keep the thermostat where we asked.
- Tell them when you will be back each day and call if anything changes.
- Respect their home: shoe covers, protect floors on the path in, clean up every day.
"""},
        {'id': 'never', 'title': 'What we never do', 'body': """
- Never step into standing water before the power is off.
- Never guess the category low — when in doubt, go higher.
- Never blow air across sewage-soaked materials before removing them.
- Never use an antimicrobial without the customer's consent.
- Never pull equipment before materials reach the dry standard.
- Never throw anything away without written consent.
"""},
    ],
    'quiz': [
        ('Water from a broken clean supply line is which category at first?', ['Category 1', 'Category 2', 'Category 3', 'Class 4'], 0, 'Clean source water starts as Category 1.'),
        ('Sewage backup and rising floodwater are:', ['Category 1', 'Category 2', 'Category 3', 'Class 1'], 2, 'Grossly contaminated water is Category 3.'),
        ('What happens to clean water that sits for a few days in a warm house?', ['It stays Category 1', 'It can degrade to Category 2 or 3', 'It becomes Class 4', 'It evaporates safely'], 1, 'Time, warmth and dirty materials let bacteria grow, so the category gets worse.'),
        ('A whole room with wet carpet and pad and a little wicking up the walls is usually:', ['Class 1', 'Class 2', 'Class 3', 'Class 4'], 1, 'Class 2 is a whole room with carpet and pad wet and limited wicking.'),
        ('A customer asks you to spray fragrance so the musty smell goes away. What is true?', ['Fragrance fixes the problem', 'A masking agent only covers the smell for a while; the odor goes when the source is removed, cleaned and dried', 'Fragrance kills mold', 'It replaces antimicrobial'], 1, 'Masking agents are temporary and never replace removal, cleaning and drying.'),
        ('What is the first thing to do with standing water?', ['Set up air movers', 'Extract it', 'Apply antimicrobial', 'Open the windows'], 1, 'Extraction removes water far faster than evaporation.'),
        ('Which reading do we compare to see if the air is drying?', ['Relative humidity only', 'Grains per pound (GPP)', 'The thermostat', 'The outside temperature'], 1, 'GPP is the actual water in the air and does not change with temperature.'),
        ('The drying goal for the air in the affected area is:', ['Higher GPP than outside', 'Lower GPP than the unaffected areas and outside', 'The same RH as yesterday', '70% RH'], 1, 'Lower GPP in the drying area means moisture is being removed.'),
        ('When is a desiccant dehumidifier a good choice?', ['Never', 'Cold spaces, very low humidity targets and dense materials', 'Only for carpet', 'When there is no power'], 1, 'Desiccants work where refrigerant units struggle.'),
        ('On a Category 3 loss, wet drywall, insulation, carpet and pad are generally:', ['Dried in place', 'Removed and disposed of, with the customer\'s consent', 'Sprayed and left', 'Painted over'], 1, 'Porous materials soaked with grossly contaminated water are removed.'),
        ('How do we know a material is dry?', ['It feels dry', 'Three days have passed', 'Its reading matches the dry standard from the same unaffected material', 'The customer says so'], 2, 'The dry standard from unaffected material is the goal.'),
        ('Before applying an antimicrobial you must:', ['Nothing, it is routine', 'Get the customer\'s signed consent and follow the label', 'Mix two products for strength', 'Apply it before cleaning'], 1, 'Consent, label directions, and it goes on after cleaning and removal.'),
    ],
}

MOLD = {
    'id': 's520',
    'title': 'GrayCo Mold Remediation Training (IICRC S520 principles)',
    'short': 'Mold Remediation (S520)',
    'icon': '🦠',
    'std': 'ANSI/IICRC S520, the Standard for Professional Mold Remediation',
    'cat': 'IICRC',
    'required': [],
    'cos': ['mitigation', 'environmental'],
    'intro': ("How GrayCo remediates mold: the three conditions, assessment, fixing the moisture, PPE, containment and negative air, "
              "removing mold instead of just killing it, cleaning versus removal, verification and talking with the customer. Based "
              "on the principles of ANSI/IICRC S520, written in our own words."),
    'sections': [
        {'id': 'conditions', 'title': 'The three conditions', 'body': """
We describe an area by how much mold is there compared with a normal, healthy building.

- **Condition 1 — normal.** Mold spores are everywhere outdoors and indoors in small amounts. A normal background is Condition 1, and it is our goal.
- **Condition 2 — settled contamination.** Spores and mold fragments have spread from a growth area and settled on surfaces or in dust, but there is no actual growth there.
- **Condition 3 — actual growth.** Mold is growing, whether you can see it or it is hidden inside walls, under floors or in the HVAC.

**Remediation means bringing Condition 2 and 3 areas back to Condition 1.**
"""},
        {'id': 'assess', 'title': 'Assessment and when to bring in an IEP', 'body': """
- GrayCo inspects, finds the moisture source and writes a scope. We do **not** diagnose health problems or tell anyone mold is or isn't safe for them.
- Bring in a qualified **Indoor Environmental Professional (IEP)** to assess or test when: the area is large or hidden, someone in the home has health concerns or a weak immune system, it is a commercial, school or healthcare building, the HVAC is involved, there is a legal or insurance dispute, or the customer wants clearance testing.
- Best practice: the person who tests and verifies should be **independent** of the company doing the remediation.
- Get the **Mold Assessment / Testing Authorization** signed before any testing we arrange.
"""},
        {'id': 'moisture', 'title': 'Fix the moisture first', 'body': """
Mold needs water. If the leak, humidity or drainage problem is not fixed, the mold comes back no matter how well we clean.

- Find the source: plumbing leak, roof or window leak, condensation, high humidity, grading or a crawlspace problem.
- The source is repaired (by us or the right trade) **before or during** remediation, and wet materials are dried to their dry standard.
- Write the source and the fix in the job notes.
"""},
        {'id': 'ppe', 'title': 'Safety and PPE', 'body': """
- **Respirator**: an N95 at minimum for small, limited areas; a half-face or full-face respirator with **P100** cartridges for larger work or heavy growth. You must be fit-tested and in the respiratory protection program.
- **Disposable coveralls** with hood and booties, **nitrile gloves**, and **goggles** (or a full-face respirator).
- Occupants with health problems, infants, the elderly and pets should stay out of the work area — ideally out of the home during heavy work.
- Read the SDS for every cleaner and coating you use.
"""},
        {'id': 'contain', 'title': 'Containment and negative air', 'body': """
Containment keeps spores and dust from spreading to clean parts of the building while we work.

- Build containment with **6-mil poly sheeting**, taped and sealed, with a zipper door. Cover and seal **HVAC registers** and turn the system off in the work area.
- Small areas may only need a local (source) containment; larger areas need a full containment with an entry chamber where workers take off their outer PPE.
- Run a **negative air machine** (HEPA air filtration exhausting to the outside) so air flows **into** containment, never out. The poly should pull inward slightly; check with a pressure gauge (manometer) where used.
- Keep containment up and running until the area passes verification.
- Post the **Mold Containment Notice** for the customer.
"""},
        {'id': 'remove', 'title': 'Remove it — don\'t just kill it', 'body': """
**Dead mold is still a problem.** Dead spores and fragments still cause allergic reactions and odors. So the goal is to **physically remove** mold, not just spray it.

- Spraying bleach or a biocide and painting over it is **not** remediation.
- Remove contaminated porous materials; clean semi-porous and non-porous surfaces.
- Use **HEPA vacuums** and HEPA air scrubbers throughout. A regular vacuum spreads spores.
- Mist materials lightly before removal to keep dust down.
- **Bag debris inside containment** in 6-mil bags, close them, wipe the outside, and carry them straight out.
"""},
        {'id': 'clean', 'title': 'Cleaning versus removal', 'body': """
- **Porous materials** (drywall, ceiling tile, insulation, carpet, fabric) with growth: **remove** and bag. They can't be cleaned deep enough.
- **Semi-porous materials** (wood framing, subfloor): HEPA vacuum, then sand, wire-brush or soda/dry-ice blast to remove growth from the surface, HEPA vacuum again, then damp-wipe.
- **Non-porous materials** (metal, glass, hard plastic, sealed tile): HEPA vacuum and damp-wipe with a detergent cleaner.
- A sealer or coating may be applied **after** removal and verification, never to hide growth.
- Final cleaning of the whole containment: HEPA vacuum and damp-wipe every surface, top down.
"""},
        {'id': 'verify', 'title': 'Post-remediation verification', 'body': """
Before containment comes down, the work is checked:

1. **Visual**: no visible mold, dust or debris anywhere in the work area.
2. **Moisture**: materials are dry (at their dry standard) and the moisture source is fixed.
3. **Odor**: no musty smell.
4. **Testing**, when it is part of the job: an independent IEP samples the air and/or surfaces and confirms the area is back to Condition 1.

If it fails, clean again and re-check. When it passes, take down containment and issue the **Mold Clearance Certificate**.
"""},
        {'id': 'customer', 'title': 'Talking with the customer', 'body': """
- Explain in plain words: what we found, what caused it, what we will remove, how long it takes and what they need to do (stay out of containment, keep pets away, don't turn on the HVAC).
- **Don't promise** a "mold-free" house — normal background mold is everywhere. Promise the work: source fixed, growth removed, area verified.
- Don't give medical advice; tell them to talk with their doctor about health questions.
- Get their signature on the contract and every consent before work starts, and keep them updated every day.
"""},
        {'id': 'never', 'title': 'What we never do', 'body': """
- Never spray-and-paint over mold and call it done.
- Never remove moldy materials without containment and HEPA filtration.
- Never run the HVAC in the work area during remediation.
- Never take containment down before verification.
- Never start remediation while the moisture source is still active.
"""},
    ],
    'quiz': [
        ('An area with actual mold growth (visible or hidden) is:', ['Condition 1', 'Condition 2', 'Condition 3', 'Category 3'], 2, 'Condition 3 means active or actual growth.'),
        ('The goal of mold remediation is to return the area to:', ['Condition 1 (normal background)', 'Condition 2', 'Zero spores', 'Condition 3'], 0, 'Normal background mold is everywhere; Condition 1 is the goal.'),
        ('What must happen before remediation can succeed?', ['Paint the walls', 'The moisture source is fixed and materials dried', 'Spray bleach everywhere', 'Run the HVAC'], 1, 'Without fixing the water, the mold returns.'),
        ('Who should do clearance testing, as best practice?', ['The same crew that removed the mold', 'An independent, qualified IEP', 'The customer', 'Nobody'], 1, 'Independent verification avoids a conflict of interest.'),
        ('Why do we use a negative air machine?', ['To blow spores out of containment into the house', 'To keep air flowing into containment and filter it through HEPA', 'To dry the carpet', 'To heat the room'], 1, 'Negative pressure stops spores from escaping containment.'),
        ('Is killing mold with a biocide enough?', ['Yes, dead mold is harmless', 'No, dead mold still causes reactions, so it must be physically removed', 'Yes, if you paint after', 'Only on wood'], 1, 'Physical removal is the goal; dead spores are still allergenic.'),
        ('Moldy drywall and insulation are:', ['Cleaned with a damp rag', 'Removed and bagged inside containment', 'Painted with sealer', 'Left in place'], 1, 'Porous materials with growth are removed.'),
        ('Moldy wood framing is usually:', ['Replaced every time', 'HEPA vacuumed, sanded or brushed, HEPA vacuumed again and wiped', 'Sprayed with bleach only', 'Left alone'], 1, 'Semi-porous surfaces are cleaned by removing the surface growth.'),
        ('When can containment come down?', ['At the end of the first day', 'After the area passes verification', 'When the customer asks', 'Before cleaning'], 1, 'Containment stays until the area passes verification.'),
        ('What should you tell the customer?', ['That their house will be mold-free forever', 'What we found, what we will do, and to ask their doctor about health questions', 'That mold is harmless', 'Nothing until the job is done'], 1, 'Clear, honest communication — no medical advice and no "mold-free" promises.'),
    ],
}

BIO = {
    'id': 'bio',
    'title': 'GrayCo Trauma, Biohazard & Sewage Safety Basics',
    'short': 'Biohazard & Sewage',
    'icon': '☣️',
    'std': 'the OSHA Bloodborne Pathogens Standard (29 CFR 1910.1030) and the sewage principles of ANSI/IICRC S500',
    'cat': 'OSHA / Safety',
    'required': [],
    'cos': ['environmental', 'mitigation'],
    'intro': ("The basics for anyone who may work around blood, body fluids or sewage: who may do this work, bloodborne pathogens, "
              "PPE, cleaning and disinfecting, disposal, exposure incidents and respect for the family. It is an awareness "
              "training; trauma-scene work also needs GrayCo's yearly bloodborne pathogens training and your supervisor's sign-off."),
    'sections': [
        {'id': 'who', 'title': 'Who may do this work', 'body': """
- Only employees who have completed GrayCo's **bloodborne pathogens training** (yearly), have been **offered the hepatitis B vaccine**, are in the respiratory protection program, and are assigned by a supervisor.
- If you have not had the training, you don't go into a trauma or biohazard area. Tell your supervisor.
- Trauma scenes are released by law enforcement or the medical examiner before we enter.
"""},
        {'id': 'bbp', 'title': 'Bloodborne pathogens and universal precautions', 'body': """
Blood and some body fluids can carry diseases like **hepatitis B, hepatitis C and HIV**. You can't tell by looking.

- **Universal precautions**: treat all blood and body fluids as if they are infectious.
- Germs get in through cuts, broken skin, the eyes, nose and mouth, and needle sticks.
- Cover any cut on your hands before gloving.
"""},
        {'id': 'ppe', 'title': 'PPE and how to put it on and take it off', 'body': """
- **Two pairs of nitrile gloves** (inner and outer), taped to the sleeves.
- **Fluid-resistant coveralls** with hood and boot covers.
- **Face shield or goggles**, and a **respirator with P100** cartridges (combination cartridges when using chemicals that call for them).
- Rubber boots you can disinfect.

**Taking it off is when people get exposed.** Remove the outer gloves first, then the coverall rolled inside-out, then eye protection and respirator, then the inner gloves last. Wash your hands and face right away.
"""},
        {'id': 'clean', 'title': 'Clean, then disinfect', 'body': """
1. **Set up**: control the area, protect clean areas, and set a clean-to-dirty path.
2. **Remove gross material** (absorb liquids with absorbent; scrape solids) and bag it.
3. **Clean** surfaces with a detergent. Disinfectant doesn't work through dirt.
4. **Disinfect** with an EPA-registered disinfectant that is labeled for bloodborne pathogens, following the label's **contact (dwell) time** — the surface must stay wet that long.
5. **Porous materials** soaked with blood or sewage (carpet, pad, drywall, mattresses, upholstery) are removed, with the customer's or owner's consent.
6. Check your work: no visible residue anywhere, including under and behind things.
"""},
        {'id': 'dispose', 'title': 'Disposal', 'body': """
- Blood-soaked materials go in **red biohazard bags** inside a rigid, labeled container, and are picked up by a **licensed medical-waste hauler**. Keep the paperwork (manifests) with the job.
- **Sharps** (needles, broken glass with blood) go in a puncture-proof sharps container. **Never pick up sharps with your hands** — use tongs or a dustpan.
- Sewage debris from a Category 3 loss is bagged, sealed and disposed of as your supervisor directs under local rules.
"""},
        {'id': 'sewage', 'title': 'Sewage jobs', 'body': """
- Sewage is **Category 3** water: grossly contaminated.
- Full PPE, a respirator, and no eating, drinking or smoking in the work area. Set up a **hygiene station** to wash hands and face.
- Remove contaminated porous materials, clean, then disinfect, then dry.
- Run HEPA air scrubbers; don't blow air across sewage-soaked materials before removal.
- Keep the customer, kids and pets out of the work area.
"""},
        {'id': 'exposure', 'title': 'If you are exposed', 'body': """
1. **Wash** the area with soap and water right away; flush eyes, nose or mouth with clean water.
2. **Report it to your supervisor immediately** — even if it seems minor.
3. Get a **medical evaluation** the same day; follow-up care is time-sensitive.
4. The incident is written up and kept confidential.
"""},
        {'id': 'respect', 'title': 'Respect and discretion', 'body': """
- On a trauma scene, the family may have just lost someone. Speak softly, be kind, and keep the work discreet: unmarked vehicles where possible, no talk about the scene with neighbors.
- **No personal photos and no social media.** Job photos are for documentation only and go only into the CRM.
- Look for personal items (photos, jewelry, documents) and set them aside for the family.
"""},
        {'id': 'never', 'title': 'What we never do', 'body': """
- Never work a biohazard area without training, vaccination offer and full PPE.
- Never pick up sharps by hand.
- Never skip the cleaning step and only spray disinfectant.
- Never mix chemicals.
- Never eat, drink or smoke in the work area.
- Never put biohazard waste in a regular dumpster.
"""},
    ],
    'quiz': [
        ('Who may work a trauma or biohazard area?', ['Anyone on the crew', 'Only trained employees, offered the hepatitis B vaccine and assigned by a supervisor', 'The customer', 'Only subcontractors'], 1, 'Training, vaccine offer and assignment come first.'),
        ('"Universal precautions" means:', ['Only blood that looks old is dangerous', 'Treat all blood and body fluids as infectious', 'Gloves are optional', 'Use one glove'], 1, 'You cannot tell by looking, so treat it all as infectious.'),
        ('Which order is correct?', ['Disinfect, then clean', 'Clean, then disinfect for the label\'s contact time', 'Spray and wipe right away', 'Only disinfect'], 1, 'Disinfectant does not work through dirt and needs its contact time.'),
        ('How do you pick up a needle?', ['Carefully by hand', 'With tongs or a dustpan, into a sharps container', 'Wrap it in paper', 'Leave it'], 1, 'Never handle sharps by hand.'),
        ('Blood-soaked materials go:', ['In the regular dumpster', 'In red biohazard bags, picked up by a licensed medical-waste hauler', 'In the customer\'s trash', 'Down the drain'], 1, 'Regulated medical waste is handled by a licensed hauler with paperwork.'),
        ('Sewage water is which category?', ['Category 1', 'Category 2', 'Category 3', 'It depends on the color'], 2, 'Sewage is grossly contaminated: Category 3.'),
        ('When do most exposures happen?', ['Putting on PPE', 'Taking off PPE', 'Driving to the job', 'Writing notes'], 1, 'Careful removal of PPE, outer gloves first, prevents exposure.'),
        ('You get splashed in the eye. What first?', ['Finish the room', 'Flush with clean water and report it to your supervisor immediately', 'Wait to see if you feel sick', 'Tell nobody'], 1, 'Wash, report immediately and get a medical evaluation the same day.'),
        ('Can you post a photo of a trauma scene on social media?', ['Yes, without names', 'No — job photos go only into the CRM', 'Only to the crew group', 'Yes, after the job'], 1, 'Discretion and respect for the family; documentation only.'),
        ('Can you eat or drink in a sewage work area?', ['Yes, with gloves on', 'No — wash at the hygiene station and leave the area first', 'Only water', 'Yes, if it is outside'], 1, 'Hands to mouth is how contamination is swallowed.'),
    ],
}

DOCS = [FIRE, WATER, MOLD, BIO]
PASS_PCT = 80   # a test is passed at 80 % (e.g. 10 of 12, 8 of 10)
