# Remix Tile Prop Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich all 12 curated remix tiles with context-aware trees, parked vehicles, and street furniture while preserving the existing runtime contract.

**Architecture:** Extend the offline module catalog with exact named prop nodes from `js/gltf/`, then hand-place those modules in the 12 existing recipes. Regenerate the committed `remix-*.glb` files with the current transactional compiler. The browser will keep loading complete GLBs; no runtime composition changes.

**Tech Stack:** Bun 1.3, TypeScript 7, Three.js r185, glTF Transform 4.3, Vitest 4, Vite 8.

## Global Constraints

- Keep exactly 12 remix tile IDs, their categories, runtime weights, and existing building placements.
- Finish each tile with four to seven props; this plan produces five to seven.
- Reuse exact named nodes from `js/gltf/`; create no geometry or texture artwork.
- Keep integer or half-unit X/Z positions, Y at zero, and rotations `0`, `1`, `2`, or `3` quarter turns.
- Keep the plot envelope `-10 <= x,z <= 30` and reject prop-building intersections.
- Keep the 27-tile runtime catalog, 29-request loading total, block spacing, roads, moving traffic, camera, fog, shadows, quality profiles, fallback, and floating-origin behavior.
- Keep parked vehicles static inside their baked tile scenes.
- Keep each generated GLB at or below 900 KiB and all 12 at or below 6 MiB.
- Keep generated GLBs self-contained and deterministic; add no Draco, Meshopt, WebP, KTX2, or runtime decoders.

---

## File structure

- Modify `tools/tiles/module-catalog.ts`: add 11 source-derived prop definitions.
- Modify `tools/tiles/tile-recipes.ts`: add exact curated prop placements to all 12 recipes.
- Modify `tests/tile-recipes.test.ts`: pin the new catalog records and exact prop layouts.
- Modify `tests/tile-source-assets.test.ts`: prove each new source node resolves once and fits its declared footprint.
- Modify `tests/generated-tiles.test.ts`: compare regenerated outputs with the committed GLBs.
- Replace the 12 `js/clusters/remix-*.glb` files with enriched deterministic outputs.

### Task 1: Add the reusable prop modules

**Files:**
- Modify: `tools/tiles/module-catalog.ts`
- Modify: `tests/tile-recipes.test.ts`
- Modify: `tests/tile-source-assets.test.ts`

**Interfaces:**
- Consumes: `ModuleDefinition`, `SourceCache`, `findExactNode()`, and `assertDeclaredFootprint()`.
- Produces: catalog IDs `cube-tree`, `fir-tree`, `parked-car`, `pickup-truck`, `police-car`, `delivery-truck`, `hydrant`, `street-light`, `stop-sign`, `barrier`, and `fence`.

- [x] **Step 1: Write the failing exact-catalog test**

Add this constant and test to `tests/tile-recipes.test.ts` inside `describe('remix module catalog', ...)`:

```ts
const ENRICHMENT_MODULES = [
  { id: 'cube-tree', source: 'apartments.gltf', nodeName: 'Natures_Cube_Tree.obj', width: 3.39, depth: 3.19 },
  { id: 'fir-tree', source: 'house.gltf', nodeName: 'Natures_Fir_Tree.obj', width: 3.39, depth: 3.92 },
  { id: 'parked-car', source: 'house.gltf', nodeName: 'Vehicle_Car.obj', width: 6.32, depth: 2.96 },
  { id: 'pickup-truck', source: 'gas.gltf', nodeName: 'Vehicle_Pick_up_Truck.obj', width: 3.10, depth: 5.97 },
  { id: 'police-car', source: 'gas.gltf', nodeName: 'Vehicle_Police_Car.obj', width: 6.32, depth: 2.96 },
  { id: 'delivery-truck', source: 'factory.gltf', nodeName: 'Vehicle_Truck.obj', width: 9.10, depth: 3.63 },
  { id: 'hydrant', source: 'bus.gltf', nodeName: 'Props_Hydrant.obj', width: 0.44, depth: 0.44 },
  { id: 'street-light', source: 'road.gltf', nodeName: 'Props_Street_Light.obj', width: 0.60, depth: 2.53 },
  { id: 'stop-sign', source: 'bus.gltf', nodeName: 'Props_Traffic_Sign_stop.obj', width: 0.72, depth: 0.07 },
  { id: 'barrier', source: 'supermarket.gltf', nodeName: 'Props_Traffic_Control_Barrier_Fence.obj', width: 3.60, depth: 0.20 },
  { id: 'fence', source: 'house2.gltf', nodeName: 'Props_Fence.obj', width: 39.60, depth: 0.16 },
] as const

it('pins the exact enrichment prop catalog', () => {
  const ids = new Set(ENRICHMENT_MODULES.map(({ id }) => id))
  expect(MODULE_CATALOG.filter(({ id }) => ids.has(id as typeof ENRICHMENT_MODULES[number]['id']))
    .map(({ id, source, nodeName, kind, footprint }) => ({
      id, source, nodeName, kind, width: footprint.width, depth: footprint.depth,
    }))).toEqual(ENRICHMENT_MODULES.map((entry) => ({ ...entry, kind: 'prop' })))
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
bun run test -- tests/tile-recipes.test.ts -t "pins the exact enrichment prop catalog"
```

Expected: FAIL because the 11 IDs do not exist in `MODULE_CATALOG`.

- [x] **Step 3: Add the 11 prop definitions**

Append these records after `coffee-chair` in `tools/tiles/module-catalog.ts`:

```ts
  module('cube-tree', 'apartments.gltf', 'Natures_Cube_Tree.obj', 'prop', 3.39, 3.19),
  module('fir-tree', 'house.gltf', 'Natures_Fir_Tree.obj', 'prop', 3.39, 3.92),
  module('parked-car', 'house.gltf', 'Vehicle_Car.obj', 'prop', 6.32, 2.96),
  module('pickup-truck', 'gas.gltf', 'Vehicle_Pick_up_Truck.obj', 'prop', 3.10, 5.97),
  module('police-car', 'gas.gltf', 'Vehicle_Police_Car.obj', 'prop', 6.32, 2.96),
  module('delivery-truck', 'factory.gltf', 'Vehicle_Truck.obj', 'prop', 9.10, 3.63),
  module('hydrant', 'bus.gltf', 'Props_Hydrant.obj', 'prop', 0.44, 0.44),
  module('street-light', 'road.gltf', 'Props_Street_Light.obj', 'prop', 0.60, 2.53),
  module('stop-sign', 'bus.gltf', 'Props_Traffic_Sign_stop.obj', 'prop', 0.72, 0.07),
  module('barrier', 'supermarket.gltf', 'Props_Traffic_Control_Barrier_Fence.obj', 'prop', 3.60, 0.20),
  module('fence', 'house2.gltf', 'Props_Fence.obj', 'prop', 39.60, 0.16),
```

- [x] **Step 4: Run the catalog test and verify GREEN**

Run:

```powershell
bun run test -- tests/tile-recipes.test.ts -t "pins the exact enrichment prop catalog"
```

Expected: PASS.

- [x] **Step 5: Write the failing source-node integration test**

Add this import to `tests/tile-source-assets.test.ts`:

```ts
import { resolve } from 'node:path'
```

Extend the source-assets import with `assertDeclaredFootprint` and `SourceCache`, then add:

```ts
const ENRICHMENT_MODULE_IDS = [
  'cube-tree', 'fir-tree', 'parked-car', 'pickup-truck', 'police-car',
  'delivery-truck', 'hydrant', 'street-light', 'stop-sign', 'barrier', 'fence',
] as const

it('resolves every enrichment prop once within its declared footprint', async () => {
  const sources = new SourceCache(resolve('.'))
  const byId = new Map(MODULE_CATALOG.map((entry) => [entry.id, entry]))
  for (const id of ENRICHMENT_MODULE_IDS) {
    const entry = byId.get(id)
    expect(entry, id).toBeDefined()
    const source = await sources.load(entry!.source)
    const node = findExactNode(source, entry!)
    expect(node.getName()).toBe(entry!.nodeName)
    expect(() => assertDeclaredFootprint(node, entry!)).not.toThrow()
  }
})
```

Also import `MODULE_CATALOG` from `../tools/tiles/module-catalog`.

- [x] **Step 6: Run the source-node test and verify GREEN**

Run:

```powershell
bun run test -- tests/tile-source-assets.test.ts -t "resolves every enrichment prop"
```

Expected: PASS with all 11 exact nodes resolved.

- [x] **Step 7: Run Task 1 verification and commit**

Run:

```powershell
bun run test -- tests/tile-recipes.test.ts tests/tile-source-assets.test.ts
bun run typecheck
```

Expected: all focused tests and typecheck pass.

Commit:

```powershell
git add tools/tiles/module-catalog.ts tests/tile-recipes.test.ts tests/tile-source-assets.test.ts
git commit -m "feat: catalog remix tile scenery props"
```

### Task 2: Curate medium-density prop layouts

**Files:**
- Modify: `tools/tiles/tile-recipes.ts`
- Modify: `tests/tile-recipes.test.ts`

**Interfaces:**
- Consumes: the 11 catalog IDs from Task 1 and existing recipe validation.
- Produces: 12 valid recipes with exact prop placements and five to seven props per tile.

- [x] **Step 1: Write the failing exact-layout test**

Change the catalog import in `tests/tile-recipes.test.ts` to:

```ts
import { MODULE_CATALOG, MODULES_BY_ID } from '../tools/tiles/module-catalog'
```

Add this helper and expected data above the recipe tests:

```ts
const prop = (moduleId: string, x: number, z: number, rotation: 0 | 1 | 2 | 3) => ({
  moduleId, x, z, rotation,
})

const EXPECTED_PROP_PLACEMENTS = {
  'remix-residential-court': [
    prop('big-tree', 25, 0, 0), prop('bench-1', 0, 20, 0),
    prop('parked-car', 0, 10, 0), prop('fir-tree', 15, 0, 0), prop('cube-tree', 5, 25, 0),
  ],
  'remix-residential-towers': [
    prop('bench-2', 10, 25, 0), prop('big-tree', 27, 27, 0),
    prop('parked-car', 0, -5, 0), prop('parked-car', 20, 22, 0),
    prop('street-light', 10, 10, 0), prop('cube-tree', 10, -5, 0),
  ],
  'remix-residential-garden': [
    prop('grass-fence', -9.5, 10, 0), prop('bench-1', 10, 15, 0),
    prop('parked-car', 20, 12, 0), prop('fir-tree', 10, 25, 0),
    prop('cube-tree', 20, 25, 0), prop('bush', 10, 20, 0),
  ],
  'remix-residential-row': [
    prop('parked-car', -5, 23, 0), prop('parked-car', 8, 23, 0),
    prop('cube-tree', 20, 25, 0), prop('fir-tree', 28, 25, 0),
    prop('street-light', 15, 25, 0), prop('fence', 10, 29.5, 0),
  ],
  'remix-commercial-market': [
    prop('bench-2', 20, 25, 0), prop('parked-car', 10, -5, 1),
    prop('parked-car', 20, -5, 1), prop('barrier', 10, 22, 0),
    prop('street-light', 10, 10, 0), prop('hydrant', 28, 20, 0),
  ],
  'remix-commercial-cafes': [
    prop('coffee-chair', 15, 12, 0), prop('coffee-chair', 19, 12, 1),
    prop('big-tree', 25, 25, 0), prop('parked-car', 5, 15, 0),
    prop('street-light', 0, 12, 0), prop('cube-tree', 10, 25, 0),
  ],
  'remix-commercial-shops': [
    prop('parked-car', 26, 0, 1), prop('parked-car', 26, 15, 1),
    prop('street-light', 7, 0, 0), prop('street-light', 7, 17, 0),
    prop('stop-sign', 26, 25, 0), prop('hydrant', 7, 25, 0),
  ],
  'remix-commercial-services': [
    prop('pickup-truck', 25, 0, 0), prop('delivery-truck', 25, 20, 1),
    prop('barrier', 0, 10, 0), prop('barrier', 10, 10, 0),
    prop('stop-sign', 20, 10, 0), prop('street-light', 28, 10, 0),
  ],
  'remix-mixed-main-street': [
    prop('bench-1', 0, 20, 0), prop('parked-car', 8, -5, 1),
    prop('parked-car', 8, 15, 1), prop('street-light', 10, 5, 0),
    prop('street-light', 10, 25, 0), prop('hydrant', 28, 8, 0),
  ],
  'remix-mixed-neighborhood': [
    prop('big-tree', 25, 25, 0), prop('parked-car', 0, 10, 0),
    prop('cube-tree', 10, 25, 0), prop('fir-tree', 10, -5, 0),
    prop('street-light', 10, 10, 0), prop('bench-1', 15, 25, 0),
  ],
  'remix-civic-plaza': [
    prop('bench-1', 15, 0, 0), prop('bench-2', 15, 8, 2), prop('big-tree', 25, 25, 0),
    prop('cube-tree', 10, 25, 0), prop('street-light', 25, 0, 0),
    prop('hydrant', 25, 8, 0), prop('police-car', 10, 18, 0),
  ],
  'remix-park-corner': [
    prop('big-tree', -5, -5, 0), prop('cube-tree', 25, 25, 1),
    prop('bench-1', 5, 10, 0), prop('bench-2', 20, 10, 2),
    prop('bush', 10, 25, 0), prop('rock', 20, 0, 0), prop('fir-tree', -5, 25, 0),
  ],
} as const
```

Add this test:

```ts
it('pins medium-density prop placements for every remix tile', () => {
  const actual = Object.fromEntries(REMIX_TILE_RECIPES.map((recipe) => [
    recipe.id,
    recipe.placements.filter(({ moduleId }) => MODULES_BY_ID.get(moduleId)?.kind === 'prop'),
  ]))
  expect(actual).toEqual(EXPECTED_PROP_PLACEMENTS)
  for (const placements of Object.values(actual)) {
    expect(placements.length).toBeGreaterThanOrEqual(4)
    expect(placements.length).toBeLessThanOrEqual(7)
  }
})
```

- [x] **Step 2: Run the exact-layout test and verify RED**

Run:

```powershell
bun run test -- tests/tile-recipes.test.ts -t "pins medium-density prop placements"
```

Expected: FAIL because the current recipes contain zero to six props and none of the new placements.

- [x] **Step 3: Replace the recipe definitions with the enriched layouts**

Keep the helpers and exports in `tools/tiles/tile-recipes.ts`. Replace `REMIX_TILE_RECIPES` with:

```ts
export const REMIX_TILE_RECIPES = Object.freeze([
  tile('remix-residential-court', 'residential', 6, 'grass', [
    { moduleId: 'house02', x: 0, z: 0, rotation: 0 },
    { moduleId: 'house03', x: 20, z: 20, rotation: 0 },
    { moduleId: 'big-tree', x: 25, z: 0, rotation: 0 },
    { moduleId: 'bench-1', x: 0, z: 20, rotation: 0 },
    { moduleId: 'parked-car', x: 0, z: 10, rotation: 0 },
    { moduleId: 'fir-tree', x: 15, z: 0, rotation: 0 },
    { moduleId: 'cube-tree', x: 5, z: 25, rotation: 0 },
  ]),
  tile('remix-residential-towers', 'residential', 4, 'concrete', [
    { moduleId: 'residential', x: 0, z: 10, rotation: 0 },
    { moduleId: 'sky-small', x: 20, z: 10, rotation: 0 },
    { moduleId: 'bench-2', x: 10, z: 25, rotation: 0 },
    { moduleId: 'big-tree', x: 27, z: 27, rotation: 0 },
    { moduleId: 'parked-car', x: 0, z: -5, rotation: 0 },
    { moduleId: 'parked-car', x: 20, z: 22, rotation: 0 },
    { moduleId: 'street-light', x: 10, z: 10, rotation: 0 },
    { moduleId: 'cube-tree', x: 10, z: -5, rotation: 0 },
  ]),
  tile('remix-residential-garden', 'residential', 6, 'grass', [
    { moduleId: 'house01', x: -2, z: 18, rotation: 0 },
    { moduleId: 'house04', x: 17, z: 0, rotation: 0 },
    { moduleId: 'grass-fence', x: -9.5, z: 10, rotation: 0 },
    { moduleId: 'bench-1', x: 10, z: 15, rotation: 0 },
    { moduleId: 'parked-car', x: 20, z: 12, rotation: 0 },
    { moduleId: 'fir-tree', x: 10, z: 25, rotation: 0 },
    { moduleId: 'cube-tree', x: 20, z: 25, rotation: 0 },
    { moduleId: 'bush', x: 10, z: 20, rotation: 0 },
  ]),
  tile('remix-residential-row', 'residential', 6, 'grass', [
    { moduleId: 'house01', x: -3.5, z: 10, rotation: 0 },
    { moduleId: 'house01', x: 9.5, z: 10, rotation: 0 },
    { moduleId: 'house02', x: 23, z: 10, rotation: 1 },
    { moduleId: 'parked-car', x: -5, z: 23, rotation: 0 },
    { moduleId: 'parked-car', x: 8, z: 23, rotation: 0 },
    { moduleId: 'cube-tree', x: 20, z: 25, rotation: 0 },
    { moduleId: 'fir-tree', x: 28, z: 25, rotation: 0 },
    { moduleId: 'street-light', x: 15, z: 25, rotation: 0 },
    { moduleId: 'fence', x: 10, z: 29.5, rotation: 0 },
  ]),
  tile('remix-commercial-market', 'commercial', 4, 'concrete', [
    { moduleId: 'supermarket', x: 0, z: 10, rotation: 0 },
    { moduleId: 'bakery', x: 20, z: 10, rotation: 0 },
    { moduleId: 'bench-2', x: 20, z: 25, rotation: 0 },
    { moduleId: 'parked-car', x: 10, z: -5, rotation: 1 },
    { moduleId: 'parked-car', x: 20, z: -5, rotation: 1 },
    { moduleId: 'barrier', x: 10, z: 22, rotation: 0 },
    { moduleId: 'street-light', x: 10, z: 10, rotation: 0 },
    { moduleId: 'hydrant', x: 28, z: 20, rotation: 0 },
  ]),
  tile('remix-commercial-cafes', 'commercial', 4, 'concrete', [
    { moduleId: 'coffee-shop', x: 0, z: 0, rotation: 0 },
    { moduleId: 'bar', x: 20, z: 0, rotation: 0 },
    { moduleId: 'coffee-chair', x: 15, z: 12, rotation: 0 },
    { moduleId: 'coffee-chair', x: 19, z: 12, rotation: 1 },
    { moduleId: 'big-tree', x: 25, z: 25, rotation: 0 },
    { moduleId: 'parked-car', x: 5, z: 15, rotation: 0 },
    { moduleId: 'street-light', x: 0, z: 12, rotation: 0 },
    { moduleId: 'cube-tree', x: 10, z: 25, rotation: 0 },
  ]),
  tile('remix-commercial-shops', 'commercial', 4, 'concrete', [
    { moduleId: 'books', x: -3, z: -3, rotation: 0 },
    { moduleId: 'clothing', x: 17, z: -3, rotation: 0 },
    { moduleId: 'shoes', x: -3, z: 17, rotation: 0 },
    { moduleId: 'fruits', x: 17, z: 17, rotation: 0 },
    { moduleId: 'parked-car', x: 26, z: 0, rotation: 1 },
    { moduleId: 'parked-car', x: 26, z: 15, rotation: 1 },
    { moduleId: 'street-light', x: 7, z: 0, rotation: 0 },
    { moduleId: 'street-light', x: 7, z: 17, rotation: 0 },
    { moduleId: 'stop-sign', x: 26, z: 25, rotation: 0 },
    { moduleId: 'hydrant', x: 7, z: 25, rotation: 0 },
  ]),
  tile('remix-commercial-services', 'commercial', 3, 'road-surface', [
    { moduleId: 'gas-station', x: 7, z: 0, rotation: 0 },
    { moduleId: 'auto-service', x: 10, z: 20, rotation: 1 },
    { moduleId: 'pickup-truck', x: 25, z: 0, rotation: 0 },
    { moduleId: 'delivery-truck', x: 25, z: 20, rotation: 1 },
    { moduleId: 'barrier', x: 0, z: 10, rotation: 0 },
    { moduleId: 'barrier', x: 10, z: 10, rotation: 0 },
    { moduleId: 'stop-sign', x: 20, z: 10, rotation: 0 },
    { moduleId: 'street-light', x: 28, z: 10, rotation: 0 },
  ]),
  tile('remix-mixed-main-street', 'mixed', 3, 'concrete', [
    { moduleId: 'residential', x: 0, z: 0, rotation: 0 },
    { moduleId: 'drug-store', x: 20, z: 0, rotation: 0 },
    { moduleId: 'books', x: 20, z: 20, rotation: 0 },
    { moduleId: 'bench-1', x: 0, z: 20, rotation: 0 },
    { moduleId: 'parked-car', x: 8, z: -5, rotation: 1 },
    { moduleId: 'parked-car', x: 8, z: 15, rotation: 1 },
    { moduleId: 'street-light', x: 10, z: 5, rotation: 0 },
    { moduleId: 'street-light', x: 10, z: 25, rotation: 0 },
    { moduleId: 'hydrant', x: 28, z: 8, rotation: 0 },
  ]),
  tile('remix-mixed-neighborhood', 'mixed', 4, 'grass', [
    { moduleId: 'sky-small', x: 0, z: 0, rotation: 0 },
    { moduleId: 'coffee-shop', x: 20, z: 10, rotation: 1 },
    { moduleId: 'gift-shop', x: 0, z: 20, rotation: 0 },
    { moduleId: 'big-tree', x: 25, z: 25, rotation: 0 },
    { moduleId: 'parked-car', x: 0, z: 10, rotation: 0 },
    { moduleId: 'cube-tree', x: 10, z: 25, rotation: 0 },
    { moduleId: 'fir-tree', x: 10, z: -5, rotation: 0 },
    { moduleId: 'street-light', x: 10, z: 10, rotation: 0 },
    { moduleId: 'bench-1', x: 15, z: 25, rotation: 0 },
  ]),
  tile('remix-civic-plaza', 'civic', 1, 'concrete', [
    { moduleId: 'sky-small', x: 0, z: 0, rotation: 0 },
    { moduleId: 'bench-1', x: 15, z: 0, rotation: 0 },
    { moduleId: 'bench-2', x: 15, z: 8, rotation: 2 },
    { moduleId: 'big-tree', x: 25, z: 25, rotation: 0 },
    { moduleId: 'cube-tree', x: 10, z: 25, rotation: 0 },
    { moduleId: 'street-light', x: 25, z: 0, rotation: 0 },
    { moduleId: 'hydrant', x: 25, z: 8, rotation: 0 },
    { moduleId: 'police-car', x: 10, z: 18, rotation: 0 },
  ]),
  tile('remix-park-corner', 'park', 5, 'grass', [
    { moduleId: 'big-tree', x: -5, z: -5, rotation: 0 },
    { moduleId: 'cube-tree', x: 25, z: 25, rotation: 1 },
    { moduleId: 'bench-1', x: 5, z: 10, rotation: 0 },
    { moduleId: 'bench-2', x: 20, z: 10, rotation: 2 },
    { moduleId: 'bush', x: 10, z: 25, rotation: 0 },
    { moduleId: 'rock', x: 20, z: 0, rotation: 0 },
    { moduleId: 'fir-tree', x: -5, z: 25, rotation: 0 },
  ]),
] satisfies readonly TileRecipe[])
```

- [x] **Step 4: Run recipe tests and verify GREEN**

Run:

```powershell
bun run test -- tests/tile-recipes.test.ts
```

Expected: all recipe tests pass, including `validateRecipes()` and the exact prop placement test.

- [x] **Step 5: Run Task 2 verification and commit**

Run:

```powershell
bun run typecheck
bun run test -- tests/tile-geometry.test.ts tests/tile-recipes.test.ts tests/tile-source-assets.test.ts
```

Expected: typecheck and all focused tests pass.

Commit:

```powershell
git add tools/tiles/tile-recipes.ts tests/tile-recipes.test.ts
git commit -m "feat: enrich curated remix tile layouts"
```

### Task 3: Regenerate, synchronize, and review the enriched GLBs

**Files:**
- Modify: `tests/generated-tiles.test.ts`
- Replace: `js/clusters/remix-residential-court.glb`
- Replace: `js/clusters/remix-residential-towers.glb`
- Replace: `js/clusters/remix-residential-garden.glb`
- Replace: `js/clusters/remix-residential-row.glb`
- Replace: `js/clusters/remix-commercial-market.glb`
- Replace: `js/clusters/remix-commercial-cafes.glb`
- Replace: `js/clusters/remix-commercial-shops.glb`
- Replace: `js/clusters/remix-commercial-services.glb`
- Replace: `js/clusters/remix-mixed-main-street.glb`
- Replace: `js/clusters/remix-mixed-neighborhood.glb`
- Replace: `js/clusters/remix-civic-plaza.glb`
- Replace: `js/clusters/remix-park-corner.glb`

**Interfaces:**
- Consumes: the Task 2 recipes and `buildAllTiles()`.
- Produces: 12 committed enriched GLBs synchronized with the compiler and recipes.

- [x] **Step 1: Write the committed-output synchronization test**

Add this test to `tests/generated-tiles.test.ts` after the self-contained asset test:

```ts
it('keeps committed remix GLBs synchronized with the recipes', async () => {
  const outputDir = await makeOutput()
  await buildAllTiles({ projectRoot: resolve('.'), outputDir })
  for (const id of REMIX_TILE_IDS) {
    expect(await hash(join(outputDir, `${id}.glb`)))
      .toBe(await hash(resolve('js', 'clusters', `${id}.glb`)))
  }
}, 60_000)
```

- [x] **Step 2: Run the synchronization test and verify RED**

Run:

```powershell
bun run test -- tests/generated-tiles.test.ts -t "keeps committed remix GLBs synchronized"
```

Expected: FAIL with a hash mismatch because the committed GLBs still contain the sparse recipes.

- [x] **Step 3: Regenerate the committed outputs**

Run:

```powershell
bun run tiles:build
git status --short js/clusters
```

Expected: the compiler prints 12 byte counts, all 12 `remix-*.glb` files appear modified, each file remains at or below 900 KiB, and the printed total remains at or below 6 MiB.

- [x] **Step 4: Run the synchronization and generated-asset tests**

Run:

```powershell
bun run test -- tests/generated-tiles.test.ts
```

Expected: all generated-asset tests pass, including deterministic bytes, embedded resources, bounds, size limits, rollback, and committed synchronization.

- [x] **Step 5: Review all 12 tiles in the gallery**

Start Vite from the worktree:

```powershell
bun run dev -- --host 127.0.0.1 --port 5173
```

Open `http://127.0.0.1:5173/tools/tiles/gallery.html` with the browser-control skill. Verify and record:

- exactly 12 cards and 12 canvases render;
- each tile contains five to seven visible props;
- vehicles face a driveway, curb, storefront, or service area;
- the park contains three tree species and no vehicle;
- the residential-row fence stays on the plot edge;
- no prop visibly intersects a building or another prop;
- buildings remain readable at the production camera angle;
- shadows cover each complete plot;
- the browser console contains no warnings or errors.

If any check fails, update the exact placement in `tools/tiles/tile-recipes.ts` and its matching record in `EXPECTED_PROP_PLACEMENTS`, run the focused recipe test, regenerate, and repeat this gallery checklist. Do not loosen footprint validation or size limits.

- [x] **Step 6: Smoke-test the enriched tiles in the city**

Open `http://127.0.0.1:5173/`. Verify:

- startup reaches `Loading city 29/29` and removes the loading overlay;
- deterministic travel shows original and enriched remix tiles;
- parked vehicles remain static while normal traffic moves;
- roads, tile orientation, fog, shadows, pan, and zoom remain unchanged;
- the browser console contains no warnings or errors.

- [x] **Step 7: Run the complete verification chain**

Run from a fresh prompt after stopping Vite:

```powershell
bun run tiles:build
git diff --exit-code -- js/clusters
bun run typecheck
bun run test
bun run build
git diff --check
```

Expected:

- the second tile build changes no generated bytes;
- typecheck exits zero;
- all tests pass;
- the production build exits zero, with only the existing chunk-size advisory permitted;
- `git diff --check` reports no whitespace error.

- [x] **Step 8: Commit the synchronized generated outputs**

```powershell
git add tests/generated-tiles.test.ts js/clusters/remix-*.glb
git commit -m "feat: bake enriched remix tile assets"
```

- [x] **Step 9: Confirm final branch state**

Run:

```powershell
git status --short --branch
git log -4 --oneline
```

Expected: a clean `codex/tile-remix-plan` worktree with the catalog, recipe, and generated-asset commits at the tip.
