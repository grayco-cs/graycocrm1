# GrayCo PlanBuilder 3D

Draw floor plans, see them in 3D, and get a priced estimate from the drawing. For insurance jobs, custom homes, remodels and commercial build-outs.

**Open it:** `https://crm.grayco-cs.com/planbuilder/` once this branch is live (or `/planbuilder/` on any copy of the CRM site). It is plain files, no build step. Locally: run `python3 -m http.server 8765` in the repo folder and open `http://localhost:8765/planbuilder/`.

What's next is in [ROADMAP.md](ROADMAP.md).

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
| `js/surfaces.js` | Drawn surfaces for the 3D view (wood, tile, brick, siding, shingles, grass …) in each product's color |
| `vendor/` | Three.js r170 and its add-ons in `vendor/addons/` (orbit controls, studio light, rounded boxes, glow, .glb export; MIT, see `THREE-LICENSE.txt`), served from here so it works without the internet |
| `tests/math.test.js` | `node planbuilder/tests/math.test.js` — geometry, roof, takeoff and CSV numbers |
| `tests/features.smoke.cjs` | Browser test of existing + addition, styles, furnish, Make 3D, before / after, walk, entered estimate, customer view, renditions, 3D drag (same way to run as below) |
| `tests/save.smoke.cjs` | Browser test of saving to the computer, Done – save & remove, reopening a job (with its custom products, photos, renditions), versions, the note after saving, and the weekly clean-up (same way to run) |
| `tests/ui.smoke.cjs` | Browser test that draws with every tool: start `python3 -m http.server 8765` in the repo, then `NODE_PATH=$(npm root -g) node planbuilder/tests/ui.smoke.cjs` |
