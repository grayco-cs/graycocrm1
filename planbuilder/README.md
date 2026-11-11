# GrayCo PlanBuilder 3D

Draw floor plans, see them in 3D, and get a priced estimate from the drawing. For insurance jobs, custom homes, remodels and commercial build-outs.

**Open it:** `https://crm.grayco-cs.com/planbuilder/` once this branch is live (or `/planbuilder/` on any copy of the CRM site). It is plain files, no build step. Locally: run `python3 -m http.server 8765` in the repo folder and open `http://localhost:8765/planbuilder/`.

What's next is in [ROADMAP.md](ROADMAP.md).

## Sign-in: the GrayCo CRM's
- On the live site (crm.grayco-cs.com/planbuilder/, and Netlify previews) PlanBuilder opens with a **sign-in**: the same email and password as the CRM, checked by the same service. Only people on the CRM's **staff list** (active) get in; customers, inactive people and marketing-only sign-ins are refused. Nothing of the app runs before that.
- It shares the CRM's own sign-in: signed in to the CRM means signed in here (no second sign-in), and signing in here signs in to the CRM. A **starting / temporary password** has to be changed in the CRM first.
- **Signed out** after the CRM's idle time (8 hours without use, or the CRM's setting); work in PlanBuilder counts as use. Signing out of the CRM signs out here, and **💾 Save ▾ → 🔒 Sign out** signs out of both.
- What it protects is using the tool. Like every page of the site, the program files can be downloaded by someone who knows the address; they hold no customer data and no CRM prices (those stay in the CRM's database and in staff browsers).

## How to use it
1. **📁 Projects → Start** a blank plan or a template (Ranch, Two-story, Commercial suite).
2. **Walls (W):** click corners. To get an exact length, type it (`12`, `12' 6"`, `12-6`, `12.5`) and press Enter. Tick *Drawing outside walls* for the outside of the house. Shift = any angle, Alt = no snapping. Double-click or Esc to stop.
3. **Rooms (R):** drag a rectangle. The room's walls are drawn too. **Shape (P)** is for L-shaped and odd rooms: click each corner.
4. **Doors & windows (D):** pick one on the left, click a wall. Drag it along the wall; the distances to the wall ends are shown. Set width, height, sill, hinge and swing on the right.
5. **Products (I):** pick a cabinet, fixture or appliance on the left, click to place. Q / E turn it 90°, or drag the round handle.
6. **Finishes:** select a room, then click a floor, paint or wall covering on the left to apply it. Click a siding, brick or stone with nothing selected to put it on every outside wall (or select one wall first). Select a roof and click a roofing product to change it.
7. **Landscaping:** draw the yard, bed, patio, drive or deck with the Room or Shape tool, then click a sod, mulch, rock, paver, concrete or decking product: the area becomes an *Outside area* (priced by its surface only, less anything drawn inside it, with an optional layer under it such as landscape fabric). Trees, shrubs, fences, edging, retaining walls, lights and pergolas are placed like any product.
7. **Roof (F):** drag a rectangle from wall line to wall line (overhang is added). Set gable / hip / shed / flat, pitch (x/12), overhang, ridge direction, layers to tear off. For an L-shaped house draw two roof sections. Or click **⌂ Auto roof** (nothing selected).
8. **Levels:** **＋ Level** adds a floor above (optionally copying the outside walls). The level below shows as dashed lines.
9. **🏗 Make 3D** (top bar) opens the 3D view and builds the model in front of you: slab, floors, walls rising, doors and windows, products, then the roof, while the camera circles. **▶ Build** replays it; click the 3D view to skip to the end.
10. **3D / Split:** orbit (drag), pan (right-drag), zoom (wheel). *Cutaway* cuts the top level at 4 ft so you can see inside. *Walk* puts you inside at eye height (W A S D / arrows, drag to look). Click anything in 3D to select it.
11. **Estimate:** every quantity comes from the drawing. Set tax, overhead, profit, waste and roof accessories. Add lines from the catalog or custom lines. **Print / PDF** gives the plans, 3D views, room schedule and estimate.

## Existing house, additions and remodels
- **Drawing: Existing / New / Demolish** (left, above the toggles) sets the phase of everything you draw. Existing is not priced; New / remodel is priced; Demolish is priced as demolition (walls by SF, doors and windows, fixtures, roofs) and is gone in the finished view.
- Draw the house as it is, or click **All of this level is existing** (level settings, nothing selected). Then draw the addition as New, and mark the walls you open up as Demolish (select a wall → Work phase). Any piece's phase can be changed on the right.
- A room that is being remodeled: set the room to New (its floor, paint, trim are priced) while its walls stay Existing.
- 2D: existing walls are grey and hatched, new walls orange, demolition dashed red. 3D: **After (finished) / Before (today) / Everything**, and **Show new work** greys out what is already there.
- **🖼 Trace over a picture / scan** (level settings): load a photo or scan of a floor plan, **📏 Set scale** by clicking both ends of a known dimension, **✥ Move picture** to line it up, then draw over it.

## Styles, furniture and renditions
- **Style** (nothing selected): Modern Farmhouse, Craftsman, Contemporary, Traditional, Mediterranean / Spanish, Colonial, Coastal, Industrial / Loft, Mid-century Modern, Southern Ranch. **Apply to whole house** or **Apply to new work only** (an addition): siding / brick / stone, roof style + pitch + material + overhang, windows, interior doors, trim, paint, floors by room type (wet rooms get tile, bedrooms carpet or wood…), cabinets and counters. With no roof there, it **frames one** in the style (over the addition for new work, with nothing to tear off). A room can have its own style (select it → Room style).
- **🛋 Furnish all rooms** / **Furnish this room** lays out beds, nightstands, dressers, sofas, chairs, coffee and dining tables, rugs, TVs, lamps, pendants, chandeliers, bookshelves, plants and wall art by room type, in the style's colors. Running it again replaces only what it placed. Every piece can be moved, turned or deleted.
- **🖼 Renditions** saves versions of the house (styles, colors, materials, furniture, the addition) with a picture; **Show** switches to one, **Update** saves over it.
- **Photos:** a photo of the house (nothing selected) and photos on each room (select it → Photos). They show in the walk-through and on the printout.

## Look and feel
- Dark "midnight glass" screens with the GrayCo logo; ◑ in the top bar switches to a light theme (remembered). The 2D plan is drawn as a blueprint in the dark theme.
- 3D: soft studio lighting with reflections, sky and haze, rounded furniture and cabinets, glossy stone counters, glass that reflects, and real-looking surfaces drawn in each product's own color: wood planks, tile, hex mosaic, carpet, concrete, brick, block, stone, lap siding, board & batten, shakes, stucco, metal panels, shingles, standing seam, clay tile, slate, grass, mulch, rock, pavers, flagstone, decking (`js/surfaces.js`). A picture added in the catalog replaces the drawn surface.
- **✦ Holo** shows the model as glowing lines and glass on a dark grid (products and openings in amber). **⟳ Turntable** turns the model slowly. Camera presets and double-clicking a piece glide the camera there.

## Import a plan you already have (picture, PDF, AutoCAD)
Click **Import a plan** at the top of the left panel (or drop a file on the drawing, or type `IMPORT`).
- **Pictures and scans** (JPG / PNG, phone photos of prints) and **PDFs**: the thick dark lines are read as walls. Text, dimension lines, door swings and furniture are left out. Gaps in walls become doors, or windows when window lines sit in the gap. Every closed space becomes a room. Type the **overall width** of the building from the plan's dimensions (outside to outside) and everything is sized from it. **Line darkness** and **Thinnest wall** fine-tune what counts as a wall. In a PDF, room names printed on the plan name the rooms.
- **AutoCAD DXF** (in AutoCAD: SAVEAS → DXF): lines and polylines in the file's own units (inches, feet, mm …). Pairs of parallel lines a wall-thickness apart become one wall; layers named like walls (A-WALL …) are used first; TEXT / MTEXT inside a room names it. Blocks are expanded. Walls at any angle work. DWG files: export to DXF or PDF first.
- The preview shows walls (orange), doors (green), windows (blue) and rooms with their square feet before anything is drawn. Then choose new work or the existing house, a new job or this level, wall height, a roof, keeping the picture underneath to check against, and building the 3D right away.
- Pictures are read for square (horizontal / vertical) walls; angled walls in a picture are traced by hand over the kept picture. Names that are not printed in the file are guessed by size (Closet, Hall, Living, Room 1 …) — rename them on the right.

## AutoCAD-style command line
The bar under the plan takes commands like AutoCAD: type and press **Enter** (or Space). **Space** jumps to it from the plan; typing a number or `@` while drawing goes there too.
- `L` / `WALL` walls · `REC` / `ROOM` rectangle room (`20x14` makes one that size) · `PL` / `SHAPE` room by corners · `D` doors and windows · `I` products · `F` roof · `DI` measure · `E` erase · `U` / `REDO` · `Z` fit · `C` close back to the start · `IMPORT` · `3D` · `STUDIO` · `EST` · `HELP`.
- Points: `x,y` absolute, `@dx,dy` from the last point, `@length<angle` (0 = right, 90 = up), `length<angle`, or just a length in the direction the mouse points. Feet-inches everywhere: `12'6"`, `12-6`, `12.5`.
- **ORTHO** (F8) square angles only · **OSNAP** (F3) snap to wall ends, corners and walls · **SNAP** (F9) grid snap. The cursor position shows next to them. ↑ / ↓ bring back earlier commands; Enter on an empty line finishes or repeats the last command.

## Studio: systems, budget and build timeline
Click **Studio** in the top bar. The model is shown the way it gets built, on a dark stage with the plan drawn as a blueprint underneath.
- **Left:** the job total, $ / SF, area, concrete (CY), steel (tons) or slab rebar, studs, and every building system with its cost: sitework + demo, foundations, underground plumbing, rebar + vapor, slab, structural steel or wall framing, joists + deck or trusses, roofing (+ RTUs), exterior framing / sheathing, envelope, windows / storefront, interior framing, HVAC, plumbing, electrical, fire sprinkler, drywall, ceilings, interior finishes, site + landscape. The eye shows or hides a system; clicking one lights it up and ghosts the rest.
- **Right:** the picked system's line items (quantity, rate, amount), its share of the job and $ / SF. **Fly to it** frames it; **Show only this** hides the rest.
- **Top:** Iso / Top / Front / Side views, a **cutaway** slider, and **Finished** (real materials, framing and pipes hidden), **Explode** (each step lifted apart), **Ortho** (flat camera), **Blueprint** and **Grid**.
- **Bottom:** the 16-step timeline (01 Site Prep … 16 Site + Landscape). ▶ plays the build step by step while the camera circles; drag the slider or click a step; 0.5× – 4× speed; **In place** shows the dollars built so far. 🏗 Make 3D plays it too while Studio is open.
- **Hover** any piece for its name and cost (W16×31 girder, 2×6 studs @ 16″, 4″ PVC building drain …).
- Structure is figured from the drawing for **new work only** (existing walls show grey and are not priced): footings under new exterior walls, a 4″ slab under new rooms, studs at 16″ around every opening with headers, a steel grid (HSS columns, W girders sized by span, W12 edge beams, open-web joists, metal deck, RTUs) for commercial jobs or trusses at 24″ for houses, ducts to every room, a circuit and light per room, sprinklers every 12′ (commercial), and a waste / supply / vent line to every fixture. **Structure** picks wood or steel (Auto: steel for commercial jobs).
- **Unit rates…** sets the installed cost of each of those items for the job (they start as placeholders). Tick **Include structure, MEP & site in the estimate** to put those lines in the estimate (category "Structure, MEP & site"); the estimate total then matches Studio's.
- The customer view hides every dollar in Studio, including the hover labels.

## 3D: build, edit, walk
- **🏗 Make 3D** animates the build. **▶ Build** replays it.
- **Edit in 3D:** click a piece to select it (it lights up blue), then drag it: furniture and fixtures slide across the floor, doors and windows slide along their wall, walls move square to themselves (joined corners follow). Q / E turn a piece, Delete removes it, and the panel on the right edits everything else. The 2D plan and the estimate follow.
- **🚶 Walk:** W / S or ↑ / ↓ walk, A / D step sideways, ← / → turn, Shift runs, drag to look, **click a floor to glide there**. Walls stop you; doors and openings let you through. Each room you walk into lights up and shows a card with its name, style, finishes, damage and photos. On phones and tablets use the on-screen arrows.

## Damage, entered estimates and the customer view
- **Damage:** select a room → Damage & repair → *Damaged* and what happened; roofs have *Damaged* too. 3D **Show damage** paints damaged floors and roofs red; the printout lists damage with photos.
- **✍ Enter Xactimate estimate** (Estimate screen, or a room's *Add what we will do*): paste lines from your Xactimate estimate (Excel columns or PDF text: code, activity, description, quantity, unit, price) or type them, and pick the room. They go on the job, tied to the room, and their prices are kept in **GrayCo price memory** (a price list that updates with every estimate you enter; typing a known code fills in its description, unit and last price).
- **👁 Customer view** hides every price on screen: product prices, totals, the estimate (it becomes a room-by-room **Scope** of what will be done), price exports; Print / PDF gives the customer copy (plans, 3D views, photos and damage, scope, no prices). Leaving it asks first.

## Catalog (📦)
About 500 starting products (`js/catalog.js` + `js/library.js`): paint by brand and color (Sherwin-Williams, Benjamin Moore, Behr, PPG, Valspar) and every sheen, wall coverings, 15 wood species of hardwood plus engineered, laminate, tile, carpet, trim and doors by species, vinyl / James Hardie / LP / cedar / stucco / metal siding in colors, brick (10 colors, modular / king / queen / thin) and stone veneer, GAF / Owens Corning / CertainTeed shingle colors, metal roofing colors, tile / slate / shake / flat roofs, gutters, windows by type and frame color, cabinets by door style and color, countertops (quartz, granite, marble, quartzite, butcher block …), backsplash tile, and landscaping: sod, mulch, rock, plants and trees, edging, pavers, concrete, asphalt, decks, fences, pergolas.

Each product has: name, **brand**, **color name**, **finish / sheen**, **species / material**, category, kind, unit, material price, labor price, size, SKU, vendor, screen color and an optional picture (used as the 3D texture). **⧉** copies a product as a new color or option. The picker on the left filters by category, by brand, and by any word (`oak`, `brick`, `GAF`, `navy`). Import / export a CSV price list (columns: `id, category, kind, name, brand, colorName, finish, material, unit, price, labor, color, sku, vendor, w, d, h, sill, elev, depth, openingType, objType, roofPart, notes`; only `name` is required). Every starting price is a placeholder to replace with your own, and screen colors are approximate: check real samples.

| kind | Priced by | Examples |
|---|---|---|
| `floor` | room floor area (SF or SY), or outside-area surface (SF, or CY at its `depth` in inches) | LVP, carpet, tile, ACT ceiling, sod, mulch, rock, pavers, decking |
| `wall` | wall area less openings (SF, GAL, SHEET) or LF | paint, drywall, siding, baseboard |
| `roof` | roof area (SQ) or roof lengths (LF) | shingles, metal, TPO, ridge cap, drip edge |
| `opening` | each | doors, windows, garage doors, storefront |
| `object` | each, or LF of its width, or SF (w × d; panels w × h) | cabinets, countertops, backsplash, fixtures, appliances, trees, fences |
| `labor` | added by hand on the estimate | demo, dumpster, permit |

## CRM prices (🔗): one set of prices with the GrayCo CRM
- Works when PlanBuilder is opened from the CRM's own address, **crm.grayco-cs.com/planbuilder/**, in the browser you use for the CRM (the CRM must have been opened there at least once). PlanBuilder **only reads** the CRM; it never changes it. Hidden in customer view.
- Read from the CRM: the **Estimate Builder Rate Book** (material, labor and sub rates, per SF / LF / square / sheet / unit / job), **Products** (the built-in supplier catalog with the CRM's price edits, plus custom and supplier-sheet products), **Labor Rates** (per hour), and the builder's **tax and margin**.
- **📦 Catalog → 🔗 CRM prices:** for each PlanBuilder product pick a CRM line for its **material** price and one for its **labor** price (type to search). Units are converted (SF ↔ SY ↔ square, sheets by the size in their name, 4×8 if none); when they can't be, type how many CRM units make one PlanBuilder unit. An hourly labor rate asks for the hours per unit ($40/hr × 0.02 hr/SF = $0.80/SF). **✨** shows the closest CRM lines for one product; **Link best matches** links the clear matches for every product and marks each "check" until you press **✓ Right**.
- Linked prices follow the CRM: they are refreshed when PlanBuilder opens and whenever you come back to it, and every estimate uses them. A link that can't be priced keeps the last good price and says why.
- **Studio unit rates** can be linked the same way (material + labor); a rate typed in a job's Studio → Unit rates still wins for that job.
- **Use CRM tax & margin on this job** sets the tax rate and turns the builder's margin into PlanBuilder's markup (30 % margin = 42.86 % profit, overhead 0 %).
- The built-in CRM product list is copied in `data/crm-products.json` (the same file as `netlify/functions/_lib/products-base.json`; a test fails if they differ).

## Pricing: your prices or Xactimate
Each project's estimate is priced from **your catalog prices** (the default) or from a **price list you import** (Estimate → *Prices from*, or 📥 Price lists…).
- **Xactimate:** PlanBuilder does not include Xactimate prices (they are licensed by Verisk). In Xactimate, export your price list report for the area and month to Excel, save it as CSV, and import it. Columns are found by name: Code (or Category + Selector), Description, Unit, Remove, Replace (or Price / Unit price), optionally Material and Labor. Any supplier list in that shape works too.
- **Linking:** give catalog products their **Xactimate code** (📦 Catalog, *Xactimate code* column, or the `xmCode` CSV column). On a price-list estimate a product with a code found in the list takes the list's description, unit and price; one without keeps your catalog price and is marked ⚑ *own price*.
- **Activity:** Remove & replace (R&R), Replace only or Remove only. **Layout:** by trade, or room by room the way adjusters read it.
- **Tax** is figured on the material part: the list's Material column, or your catalog's material price.
- **Export → Line items, Xactimate-ready (.csv):** room / group, code, description, activity, quantity, unit and price, to key into Xactimate or send with a supplement. (Pushing straight into Xactimate needs Verisk's partner program; see ROADMAP.md.)

## How quantities are figured
- **Floor:** room polygon area + floor waste %. Carpet in SY (÷ 9).
- **Room walls (paint):** room perimeter × ceiling height − doors and windows on its edges, + wall waste %.
- **Drywall:** inside walls both faces, outside walls inside face, less openings; ceilings = room floor area.
- **Siding:** outside walls outside face less openings, plus gable-end triangles and parapets.
- **Baseboard:** room perimeter − door widths.
- **Roof:** plan area including overhang × pitch factor √(1 + (pitch/12)²), in squares, + roof waste %. Hips, ridge, eaves and rakes from the roof shape; ridge cap = ridge + hips; drip edge = eaves + rakes; starter = eaves; ice & water = eaves + valleys; tear-off = squares × layers.
- **Rounding:** each / sheets / gallons up to whole; squares up to the next ⅓ (bundle).
- **Totals:** material + labor + tax on material = subtotal; overhead and profit are each a % of the subtotal.

## Saving: your computer, not the browser
- **💾 Save ▾ → Save to computer** (Ctrl+S) writes the whole job to a file on your computer: drawing, levels, roofs, renditions, house and room photos, damage notes, estimate lines, and a copy of any custom or edited product it uses. Each save is a new version, e.g. `Smith claim - v3 - 2026-11-09.planbuilder.json`. In Chrome / Edge you pick the folder; elsewhere it goes to Downloads.
- **Save & close job** saves the file, then takes the job out of the browser and starts a blank plan.
- **📂 Open a job from computer** brings a file back to keep working; save again for the next version. If the file's products have different prices than your catalog, it asks which to keep.
- Keep as many jobs in the program at once as you like. **📁 Projects** lists them with whether each is saved to your computer (and if it changed since).
- After you save, print or export a job, a note offers **Remove from this browser**. **Save ▾ → Done – save & remove** does both at once.
- **Clean-up** (once a week when you open PlanBuilder): jobs not opened for 3 months that are already saved to your computer, unchanged since, are taken out automatically (turn this off in 📁 Projects). Anything else that looks finished (saved to your computer and untouched for 2 weeks, or not opened for 3 months) is listed so you can tick which to remove. A job that is not saved to your computer is never removed without asking.
- While a job is open it autosaves in the browser (so a closed tab or crash loses nothing) with undo / redo up to 150 steps. **📁 Projects** shows how much the browser holds and has **🧹 Clear all jobs from this browser** (your catalog, price lists and price memory stay).

## Files
| File | What it does |
|---|---|
| `index.html`, `css/app.css` | Page and styling (light and dark) |
| `js/geom.js` | Math: feet-inches, areas, wall pieces around openings, roof measurements and 3D roof shapes |
| `js/model.js` | Project data: levels, walls, openings, rooms, items, roofs; the starter templates |
| `js/catalog.js` | Starting product list, categories, CSV import / export |
| `js/styles.js` | Architectural styles, applying a style (whole house / new work / room), framing a roof, auto-furnish |
| `js/library.js` | The big library: brands, colors, finishes, wood species, brick / stone, siding, roofing, cabinets, countertops, landscaping |
| `img/` | GrayCo logo (white for the top bar, navy for printouts and exported pictures) and the app icons |
| `js/takeoff.js` | Quantities and the priced estimate |
| `js/plan2d.js` | The 2D drawing canvas and all drawing tools |
| `js/view3d.js` | The 3D scene (Three.js), walk-through, picking, picture and .glb export |
| `js/store.js` | Saving in the browser, file download / upload |
| `js/app.js` | Panels, picker, properties, estimate screen, projects, catalog editor, print |
| `js/systems.js` | Construction systems: structure, MEP and site quantities from the drawing, unit rates, the 16 build steps, and the budget by system |
| `js/studio3d.js`, `js/studio.js` | Studio: the systems drawn in 3D (x-ray, ghost, explode, cutaway, timeline, hover labels) and its panels |
| `js/planimport.js`, `js/importui.js` | Plan import: walls, openings and rooms from pictures, PDFs (pdf.js) and AutoCAD DXF; the import window |
| `js/cmdline.js` | The AutoCAD-style command line, ORTHO / OSNAP / SNAP |
| `js/auth.js` | Sign-in: the CRM's sign-in and staff list, token refresh, idle sign-out, the sign-in screen |
| `js/crm.js`, `js/crmui.js`, `data/crm-products.json` | CRM prices: reading the GrayCo CRM's Rate Book, Products, Labor Rates and tax / margin in this browser, unit conversion, links and suggestions; the CRM prices window |
| `js/surfaces.js` | Drawn surfaces for the 3D view (wood, tile, brick, siding, shingles, grass …) in each product's color |
| `vendor/pdfjs/` | pdf.js 4.10 (Apache-2.0, see `PDFJS-LICENSE.txt`) for reading PDF plans, served from here |
| `vendor/` | Three.js r170 and its add-ons in `vendor/addons/` (orbit controls, studio light, rounded boxes, glow, .glb export; MIT, see `THREE-LICENSE.txt`), served from here so it works without the internet |
| `tests/math.test.js` | `node planbuilder/tests/math.test.js` — geometry, roof, takeoff and CSV numbers |
| `tests/features.smoke.cjs` | Browser test of existing + addition, styles, furnish, Make 3D, before / after, walk, entered estimate, customer view, renditions, 3D drag (same way to run as below) |
| `tests/studio.smoke.cjs` | Browser test of Studio: budget, picking a system, timeline, explode / ortho / finished, cutaway, hover, customer view (same way to run) |
| `tests/import.smoke.cjs` | Browser test of importing a picture, a PDF with room names and a DXF (`tests/fixtures/`), and of the command line (same way to run) |
| `tests/crm.smoke.cjs` | Browser test of CRM prices with the CRM's storage filled in: reading it, linking (typed, hourly, automatic + check), estimate prices, tax & margin, Studio rates, a CRM price change, customer view (same way to run) |
| `tests/auth.smoke.cjs` | Browser test of the sign-in (with a stand-in sign-in service): refused people, starting password, staff in, shared CRM session, refresh, idle sign-out, CRM sign-out, Sign out (same way to run) |
| `tests/save.smoke.cjs` | Browser test of saving to the computer, Done – save & remove, reopening a job (with its custom products, photos, renditions), versions, the note after saving, and the weekly clean-up (same way to run) |
| `tests/ui.smoke.cjs` | Browser test that draws with every tool: start `python3 -m http.server 8765` in the repo, then `NODE_PATH=$(npm root -g) node planbuilder/tests/ui.smoke.cjs` |
