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
6. **Finishes:** select a room, then click a floor, paint or siding on the left to apply it. Select a roof and click a roofing product to change it.
7. **Roof (F):** drag a rectangle from wall line to wall line (overhang is added). Set gable / hip / shed / flat, pitch (x/12), overhang, ridge direction, layers to tear off. For an L-shaped house draw two roof sections. Or click **⌂ Auto roof** (nothing selected).
8. **Levels:** **＋ Level** adds a floor above (optionally copying the outside walls). The level below shows as dashed lines.
9. **3D / Split:** orbit (drag), pan (right-drag), zoom (wheel). *Cutaway* cuts the top level at 4 ft so you can see inside. *Walk* puts you inside at eye height (W A S D / arrows, drag to look). Click anything in 3D to select it.
10. **Estimate:** every quantity comes from the drawing. Set tax, overhead, profit, waste and roof accessories. Add lines from the catalog or custom lines. **Print / PDF** gives the plans, 3D views, room schedule and estimate.

## Catalog (📦)
Your products, colors and prices: name, category, kind, unit, material price, labor price, size, SKU, vendor, color and an optional picture (used as the 3D texture). Import / export a CSV price list (columns: `id, category, kind, name, unit, price, labor, color, sku, vendor, w, d, h, sill, elev, openingType, objType, roofPart, notes`; only `name` is required). Every starting price is a placeholder to replace with your own.

| kind | Priced by | Examples |
|---|---|---|
| `floor` | room floor area (SF or SY) | LVP, carpet, tile, ACT ceiling |
| `wall` | wall area less openings (SF, GAL, SHEET) or LF | paint, drywall, siding, baseboard |
| `roof` | roof area (SQ) or roof lengths (LF) | shingles, metal, TPO, ridge cap, drip edge |
| `opening` | each | doors, windows, garage doors, storefront |
| `object` | each, or LF / SF of its size | cabinets, fixtures, appliances |
| `labor` | added by hand on the estimate | demo, dumpster, permit |

## How quantities are figured
- **Floor:** room polygon area + floor waste %. Carpet in SY (÷ 9).
- **Room walls (paint):** room perimeter × ceiling height − doors and windows on its edges, + wall waste %.
- **Drywall:** inside walls both faces, outside walls inside face, less openings; ceilings = room floor area.
- **Siding:** outside walls outside face less openings, plus gable-end triangles and parapets.
- **Baseboard:** room perimeter − door widths.
- **Roof:** plan area including overhang × pitch factor √(1 + (pitch/12)²), in squares, + roof waste %. Hips, ridge, eaves and rakes from the roof shape; ridge cap = ridge + hips; drip edge = eaves + rakes; starter = eaves; ice & water = eaves + valleys; tear-off = squares × layers.
- **Rounding:** each / sheets / gallons up to whole; squares up to the next ⅓ (bundle).
- **Totals:** material + labor + tax on material = subtotal; overhead and profit are each a % of the subtotal.

## Saving
Projects and the catalog are saved in **this browser on this device** (autosave on every change, undo / redo up to 150 steps). **Export → Project file** backs a project up or moves it to another computer; **📁 Projects → Import** opens it. Shared saving through the CRM is the next phase (ROADMAP.md).

## Files
| File | What it does |
|---|---|
| `index.html`, `css/app.css` | Page and styling (light and dark) |
| `js/geom.js` | Math: feet-inches, areas, wall pieces around openings, roof measurements and 3D roof shapes |
| `js/model.js` | Project data: levels, walls, openings, rooms, items, roofs; the starter templates |
| `js/catalog.js` | Starting product list, categories, CSV import / export |
| `js/takeoff.js` | Quantities and the priced estimate |
| `js/plan2d.js` | The 2D drawing canvas and all drawing tools |
| `js/view3d.js` | The 3D scene (Three.js), walk-through, picking, picture and .glb export |
| `js/store.js` | Saving in the browser, file download / upload |
| `js/app.js` | Panels, picker, properties, estimate screen, projects, catalog editor, print |
| `vendor/` | Three.js r170 (MIT, see `THREE-LICENSE.txt`), served from here so it works without the internet |
| `tests/math.test.js` | `node planbuilder/tests/math.test.js` — geometry, roof, takeoff and CSV numbers |
| `tests/ui.smoke.cjs` | Browser test that draws with every tool: start `python3 -m http.server 8765` in the repo, then `NODE_PATH=$(npm root -g) node planbuilder/tests/ui.smoke.cjs` |
