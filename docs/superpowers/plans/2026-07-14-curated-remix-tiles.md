# Curated Remix Tiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 12 curated city tiles by extracting named modules from the original GLTF sources, baking complete GLBs, and registering them with the existing deterministic tile pool.

**Architecture:** A Bun/TypeScript asset compiler reads `js/gltf/*.gltf`, copies named node subtrees with glTF Transform, applies validated recipe transforms, and writes committed `js/clusters/remix-*.glb` files. The browser keeps loading and cloning complete tile scenes; only the catalog size, progress total, and development gallery change at runtime.

**Tech Stack:** Bun 1.3, TypeScript 7, Three.js r185, glTF Transform 4.3, Vitest 4, Vite 8.

## Global Constraints

- Add exactly 12 tile IDs: four residential, four commercial, two mixed-use, one civic, and one park.
- Reuse geometry, materials, and textures from `js/gltf/`; create no modeled geometry or texture artwork.
- Keep 60-unit block spacing and the plot envelope `-10 <= x,z <= 30`.
- Permit integer or half-unit placement, Y position zero, and rotations `0`, `1`, `2`, or `3` quarter turns.
- Keep existing roads, traffic, camera, fog, quality profiles, pool sizes, origin shifting, and fallback behavior.
- Commit self-contained generated GLBs; normal `bun run build` must not regenerate them.
- Keep all 12 generated files at or below 6 MiB total and each file at or below 900 KiB.
- Do not add Draco, Meshopt, WebP, KTX2, runtime procedural composition, or a production gallery route.

---

## File structure

- Create `tools/tiles/types.ts`: shared module, placement, recipe, and bounds contracts.
- Create `tools/tiles/geometry.ts`: quarter-turn footprint math and overlap/boundary checks.
- Create `tools/tiles/module-catalog.ts`: exact source-node catalog with declared footprints.
- Create `tools/tiles/tile-recipes.ts`: the 12 curated layouts and weights.
- Create `tools/tiles/validate-recipes.ts`: pure catalog and recipe validation.
- Create `tools/tiles/source-assets.ts`: glTF node lookup, copying, anchoring, and placement.
- Create `tools/tiles/build-tiles.ts`: source caching, GLB serialization, validation, and replacement.
- Create `tools/tiles/gallery.html`, `tools/tiles/gallery.ts`, and `tools/tiles/gallery.css`: local visual review grid.
- Create `tests/tile-geometry.test.ts`, `tests/tile-recipes.test.ts`, `tests/tile-source-assets.test.ts`, `tests/generated-tiles.test.ts`, and `tests/tile-gallery.test.ts`.
- Modify `package.json`, `bun.lock`, and `tsconfig.json`: add compiler packages, scripts, and tool typechecking.
- Modify `src/city/types.ts` and `src/city/layout.ts`: register the 12 runtime IDs and weights.
- Modify `src/rendering/assets.ts`, `src/app.ts`, and `index.html`: derive and display the 29-request total.
- Modify `tests/assets.test.ts`, `tests/layout.test.ts`, and `tests/app.test.ts`: enforce the 27-tile runtime contract.
- Modify `README.md` and `docs/architecture.md`: document derived assets and regeneration.
- Create 12 `js/clusters/remix-*.glb` outputs.

### Task 1: Define tile geometry contracts

**Files:**
- Create: `tools/tiles/types.ts`
- Create: `tools/tiles/geometry.ts`
- Create: `tests/tile-geometry.test.ts`
- Modify: `tsconfig.json`

**Interfaces:**
- Produces: `QuarterTurn`, `ModuleDefinition`, `Placement`, `TileRecipe`, `Bounds2D`, `rotateFootprint()`, `placementBounds()`, `boundsOverlap()`, and `insidePlot()`.
- Consumes: no earlier task output.

- [x] **Step 1: Write the failing geometry tests**

Create `tests/tile-geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  boundsOverlap,
  insidePlot,
  placementBounds,
  rotateFootprint,
} from '../tools/tiles/geometry'

describe('tile recipe geometry', () => {
  it('swaps width and depth for odd quarter turns', () => {
    expect(rotateFootprint({ width: 12, depth: 18 }, 0)).toEqual({ width: 12, depth: 18 })
    expect(rotateFootprint({ width: 12, depth: 18 }, 1)).toEqual({ width: 18, depth: 12 })
    expect(rotateFootprint({ width: 12, depth: 18 }, 2)).toEqual({ width: 12, depth: 18 })
    expect(rotateFootprint({ width: 12, depth: 18 }, 3)).toEqual({ width: 18, depth: 12 })
  })

  it('builds centered placement bounds', () => {
    expect(placementBounds({ width: 12, depth: 18 }, { x: 4, z: 8, rotation: 1 }))
      .toEqual({ minX: -5, maxX: 13, minZ: 2, maxZ: 14 })
  })

  it('allows touching edges but rejects positive-area overlap', () => {
    const left = { minX: -10, maxX: 0, minZ: -10, maxZ: 10 }
    expect(boundsOverlap(left, { minX: 0, maxX: 10, minZ: -10, maxZ: 10 })).toBe(false)
    expect(boundsOverlap(left, { minX: -0.01, maxX: 10, minZ: -10, maxZ: 10 })).toBe(true)
  })

  it('checks the authored plot envelope inclusively', () => {
    expect(insidePlot({ minX: -10, maxX: 30, minZ: -10, maxZ: 30 })).toBe(true)
    expect(insidePlot({ minX: -10.01, maxX: 30, minZ: -10, maxZ: 30 })).toBe(false)
  })
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
bun run test -- tests/tile-geometry.test.ts
```

Expected: FAIL because `tools/tiles/geometry.ts` does not exist.

- [x] **Step 3: Add the shared contracts and geometry implementation**

Create `tools/tiles/types.ts`:

```ts
export type QuarterTurn = 0 | 1 | 2 | 3
export type ModuleKind = 'building' | 'prop' | 'surface'
export type AnchorRule = 'bottom-center'
export type TileCategory = 'residential' | 'commercial' | 'mixed' | 'civic' | 'park'

export interface Footprint { readonly width: number; readonly depth: number }
export interface Bounds2D {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}
export interface ModuleDefinition {
  readonly id: string
  readonly source: string
  readonly nodeName: string
  readonly kind: ModuleKind
  readonly anchor: AnchorRule
  readonly footprint: Footprint
  readonly allowedRotations: readonly QuarterTurn[]
}
export interface Placement {
  readonly moduleId: string
  readonly x: number
  readonly z: number
  readonly rotation: QuarterTurn
}
export interface TileRecipe {
  readonly id: string
  readonly category: TileCategory
  readonly weight: number
  readonly placements: readonly Placement[]
}
```

Create `tools/tiles/geometry.ts`:

```ts
import type { Bounds2D, Footprint, Placement, QuarterTurn } from './types'

export const PLOT_MIN = -10
export const PLOT_MAX = 30
const EPSILON = 1e-6

export function rotateFootprint(footprint: Footprint, rotation: QuarterTurn): Footprint {
  return rotation % 2 === 0
    ? footprint
    : { width: footprint.depth, depth: footprint.width }
}

export function placementBounds(
  footprint: Footprint,
  placement: Pick<Placement, 'x' | 'z' | 'rotation'>,
): Bounds2D {
  const rotated = rotateFootprint(footprint, placement.rotation)
  return {
    minX: placement.x - rotated.width / 2,
    maxX: placement.x + rotated.width / 2,
    minZ: placement.z - rotated.depth / 2,
    maxZ: placement.z + rotated.depth / 2,
  }
}

export function boundsOverlap(left: Bounds2D, right: Bounds2D): boolean {
  return left.minX < right.maxX - EPSILON
    && left.maxX > right.minX + EPSILON
    && left.minZ < right.maxZ - EPSILON
    && left.maxZ > right.minZ + EPSILON
}

export function insidePlot(bounds: Bounds2D): boolean {
  return bounds.minX >= PLOT_MIN - EPSILON
    && bounds.maxX <= PLOT_MAX + EPSILON
    && bounds.minZ >= PLOT_MIN - EPSILON
    && bounds.maxZ <= PLOT_MAX + EPSILON
}
```

Change `tsconfig.json` to typecheck the tools:

```json
"include": ["src", "tests", "tools"]
```

- [x] **Step 4: Run focused verification and verify GREEN**

Run:

```powershell
bun run test -- tests/tile-geometry.test.ts
bun run typecheck
```

Expected: four geometry tests pass and typecheck exits zero.

- [x] **Step 5: Commit the geometry contract**

```powershell
git add tools/tiles/types.ts tools/tiles/geometry.ts tests/tile-geometry.test.ts tsconfig.json
git commit -m "feat: define remix tile geometry"
```

### Task 2: Catalog source modules and validate 12 recipes

**Files:**
- Create: `tools/tiles/module-catalog.ts`
- Create: `tools/tiles/tile-recipes.ts`
- Create: `tools/tiles/validate-recipes.ts`
- Create: `tests/tile-recipes.test.ts`

**Interfaces:**
- Consumes: `ModuleDefinition`, `Placement`, `TileRecipe`, and geometry helpers from Task 1.
- Produces: `MODULE_CATALOG`, `MODULES_BY_ID`, `REMIX_TILE_RECIPES`, `REMIX_TILE_IDS`, `validateCatalog()`, and `validateRecipes()`.

- [x] **Step 1: Write failing catalog and recipe tests**

Create `tests/tile-recipes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MODULE_CATALOG } from '../tools/tiles/module-catalog'
import { REMIX_TILE_RECIPES } from '../tools/tiles/tile-recipes'
import { validateCatalog, validateRecipes } from '../tools/tiles/validate-recipes'
import type { ModuleDefinition, TileRecipe } from '../tools/tiles/types'

describe('remix module catalog', () => {
  it('contains unique stable IDs and exact source node names', () => {
    expect(() => validateCatalog(MODULE_CATALOG)).not.toThrow()
    expect(new Set(MODULE_CATALOG.map(({ id }) => id)).size).toBe(MODULE_CATALOG.length)
  })
})

describe('curated remix recipes', () => {
  it('contains the approved category distribution and valid layouts', () => {
    expect(REMIX_TILE_RECIPES).toHaveLength(12)
    expect(REMIX_TILE_RECIPES.map(({ category }) => category).sort()).toEqual([
      'civic', 'commercial', 'commercial', 'commercial', 'commercial', 'mixed', 'mixed',
      'park', 'residential', 'residential', 'residential', 'residential',
    ])
    expect(() => validateRecipes(REMIX_TILE_RECIPES, MODULE_CATALOG)).not.toThrow()
  })

  it('reports the recipe and modules for building overlap', () => {
    const modules: ModuleDefinition[] = [
      { id: 'a', source: 'a.gltf', nodeName: 'A', kind: 'building', anchor: 'bottom-center', footprint: { width: 10, depth: 10 }, allowedRotations: [0] },
      { id: 'b', source: 'b.gltf', nodeName: 'B', kind: 'building', anchor: 'bottom-center', footprint: { width: 10, depth: 10 }, allowedRotations: [0] },
    ]
    const recipes: TileRecipe[] = [{
      id: 'collision', category: 'mixed', weight: 1,
      placements: [
        { moduleId: 'a', x: 0, z: 0, rotation: 0 },
        { moduleId: 'b', x: 5, z: 0, rotation: 0 },
      ],
    }]
    expect(() => validateRecipes(recipes, modules)).toThrow('collision: a overlaps b')
  })

  it('rejects unknown modules, unsupported rotations, off-grid positions, and out-of-bounds geometry', () => {
    const modules: ModuleDefinition[] = [{
      id: 'house', source: 'house.gltf', nodeName: 'House', kind: 'building',
      anchor: 'bottom-center', footprint: { width: 10, depth: 10 }, allowedRotations: [0],
    }]
    const recipe = (placement: TileRecipe['placements'][number]): TileRecipe[] => [{
      id: 'bad', category: 'residential', weight: 1, placements: [placement],
    }]
    expect(() => validateRecipes(recipe({ moduleId: 'missing', x: 0, z: 0, rotation: 0 }), modules)).toThrow('unknown module missing')
    expect(() => validateRecipes(recipe({ moduleId: 'house', x: 0, z: 0, rotation: 1 }), modules)).toThrow('unsupported rotation 1')
    expect(() => validateRecipes(recipe({ moduleId: 'house', x: 0.25, z: 0, rotation: 0 }), modules)).toThrow('integer or half-unit')
    expect(() => validateRecipes(recipe({ moduleId: 'house', x: 29, z: 0, rotation: 0 }), modules)).toThrow('outside plot')
  })
})
```

- [x] **Step 2: Run the focused test and verify RED**

```powershell
bun run test -- tests/tile-recipes.test.ts
```

Expected: FAIL because the catalog, recipes, and validator do not exist.

- [x] **Step 3: Create the exact module catalog**

Create `tools/tiles/module-catalog.ts`. Use this helper and these entries; keep the measured footprints unchanged:

```ts
import type { ModuleDefinition, ModuleKind } from './types'

const ROTATIONS = [0, 1, 2, 3] as const
const module = (
  id: string, source: string, nodeName: string, kind: ModuleKind,
  width: number, depth: number,
): ModuleDefinition => ({
  id, source, nodeName, kind, anchor: 'bottom-center', footprint: { width, depth },
  allowedRotations: kind === 'surface' ? [0] : ROTATIONS,
})

export const MODULE_CATALOG = Object.freeze([
  module('house01', 'house.gltf', 'Building_House_01_color01.obj', 'building', 12.60, 17.89),
  module('house02', 'house2.gltf', 'Building_House_02_color01.obj', 'building', 17.58, 13.01),
  module('house03', 'residence.gltf', 'Building_House_03_color01.obj', 'building', 17.26, 14.41),
  module('house04', 'house3.gltf', 'Building_House_04_color01.obj', 'building', 24.77, 15.32),
  module('residential', 'apartments.gltf', 'Building_Residential_color01.obj', 'building', 12.66, 16.23),
  module('sky-small', 'apartments.gltf', 'Building_Sky_small_color01.obj', 'building', 13.07, 13.00),
  module('coffee-shop', 'coffeeshop.gltf', 'Building_Coffee_Shop.obj', 'building', 19.38, 12.46),
  module('bar', 'apartments.gltf', 'Building_Bar.obj', 'building', 7.41, 7.36),
  module('supermarket', 'supermarket.gltf', 'Building_Super_Market.obj', 'building', 13.25, 23.75),
  module('bakery', 'supermarket.gltf', 'Building_Bakery.obj', 'building', 11.28, 13.59),
  module('books', 'shoparea.gltf', 'Building_Books_Shop.obj', 'building', 12.04, 12.04),
  module('clothing', 'shoparea.gltf', 'Building_Clothing.obj', 'building', 12.13, 12.16),
  module('shoes', 'shoparea.gltf', 'Building_Shoes_Shop.obj', 'building', 12.04, 12.04),
  module('fruits', 'shoparea.gltf', 'Building_Fruits_Shop.obj', 'building', 12.13, 12.16),
  module('gas-station', 'gas.gltf', 'Building_Gas_Station.obj', 'building', 25.60, 13.00),
  module('auto-service', 'bus.gltf', 'Building_Auto_Service.obj', 'building', 8.26, 18.27),
  module('drug-store', 'shops.gltf', 'Building_Drug_Store.obj', 'building', 10.57, 11.22),
  module('gift-shop', 'supermarket.gltf', 'Building_Gift_Shop.obj', 'building', 10.57, 11.22),
  module('grass', 'park.gltf', 'Natures_Grass_Tile.obj', 'surface', 40, 40),
  module('concrete', 'shops.gltf', 'Road_Concrete_Tile.obj', 'surface', 40, 40),
  module('road-surface', 'factory.gltf', 'Road_Tile.obj', 'surface', 40, 40),
  module('big-tree', 'park.gltf', 'Natures_Big_Tree.obj', 'prop', 4.95, 5.15),
  module('bench-1', 'shops.gltf', 'Props_Bench_1.obj', 'prop', 4, 1.12),
  module('bench-2', 'park.gltf', 'Props_Bench_2.obj', 'prop', 4, 1.40),
  module('grass-fence', 'park.gltf', 'Natures_Grass_Fence.obj', 'prop', 1, 39.91),
  module('bush', 'park.gltf', 'Natures_Bush_01.obj', 'prop', 1.32, 1.29),
  module('rock', 'park.gltf', 'Natures_Rock_Big.obj', 'prop', 5.80, 5),
  module('coffee-chair', 'coffeeshop.gltf', 'Props_Coffee_shop_chair.obj', 'prop', 3.85, 3.85),
] satisfies readonly ModuleDefinition[])

export const MODULES_BY_ID = new Map(MODULE_CATALOG.map((entry) => [entry.id, entry]))
```

- [x] **Step 4: Create the 12 explicit recipes**

Create `tools/tiles/tile-recipes.ts`. The following placements have nonintersecting measured building footprints:

```ts
import type { Placement, TileCategory, TileRecipe } from './types'

const surface = (moduleId: 'grass' | 'concrete' | 'road-surface'): Placement[] => [
  { moduleId, x: 10, z: 10, rotation: 0 },
]
const tile = (
  id: string, category: TileCategory, weight: number,
  base: 'grass' | 'concrete' | 'road-surface', placements: Placement[],
): TileRecipe => ({ id, category, weight, placements: [...surface(base), ...placements] })

export const REMIX_TILE_RECIPES = Object.freeze([
  tile('remix-residential-court', 'residential', 6, 'grass', [
    { moduleId: 'house02', x: 0, z: 0, rotation: 0 },
    { moduleId: 'house03', x: 20, z: 20, rotation: 0 },
    { moduleId: 'big-tree', x: 25, z: 0, rotation: 0 },
    { moduleId: 'bench-1', x: 0, z: 20, rotation: 0 },
  ]),
  tile('remix-residential-towers', 'residential', 4, 'concrete', [
    { moduleId: 'residential', x: 0, z: 10, rotation: 0 },
    { moduleId: 'sky-small', x: 20, z: 10, rotation: 0 },
    { moduleId: 'bench-2', x: 10, z: 25, rotation: 0 },
    { moduleId: 'big-tree', x: 27, z: 27, rotation: 0 },
  ]),
  tile('remix-residential-garden', 'residential', 6, 'grass', [
    { moduleId: 'house01', x: -2, z: 18, rotation: 0 },
    { moduleId: 'house04', x: 17, z: 0, rotation: 0 },
    { moduleId: 'grass-fence', x: -9.5, z: 10, rotation: 0 },
    { moduleId: 'bench-1', x: 10, z: 15, rotation: 0 },
  ]),
  tile('remix-residential-row', 'residential', 6, 'grass', [
    { moduleId: 'house01', x: -3.5, z: 10, rotation: 0 },
    { moduleId: 'house01', x: 9.5, z: 10, rotation: 0 },
    { moduleId: 'house02', x: 23, z: 10, rotation: 1 },
  ]),
  tile('remix-commercial-market', 'commercial', 4, 'concrete', [
    { moduleId: 'supermarket', x: 0, z: 10, rotation: 0 },
    { moduleId: 'bakery', x: 20, z: 10, rotation: 0 },
    { moduleId: 'bench-2', x: 20, z: 25, rotation: 0 },
  ]),
  tile('remix-commercial-cafes', 'commercial', 4, 'concrete', [
    { moduleId: 'coffee-shop', x: 0, z: 0, rotation: 0 },
    { moduleId: 'bar', x: 20, z: 0, rotation: 0 },
    { moduleId: 'coffee-chair', x: 15, z: 12, rotation: 0 },
    { moduleId: 'coffee-chair', x: 19, z: 12, rotation: 1 },
    { moduleId: 'big-tree', x: 25, z: 25, rotation: 0 },
  ]),
  tile('remix-commercial-shops', 'commercial', 4, 'concrete', [
    { moduleId: 'books', x: -3, z: -3, rotation: 0 },
    { moduleId: 'clothing', x: 17, z: -3, rotation: 0 },
    { moduleId: 'shoes', x: -3, z: 17, rotation: 0 },
    { moduleId: 'fruits', x: 17, z: 17, rotation: 0 },
  ]),
  tile('remix-commercial-services', 'commercial', 3, 'road-surface', [
    { moduleId: 'gas-station', x: 7, z: 0, rotation: 0 },
    { moduleId: 'auto-service', x: 10, z: 20, rotation: 1 },
  ]),
  tile('remix-mixed-main-street', 'mixed', 3, 'concrete', [
    { moduleId: 'residential', x: 0, z: 0, rotation: 0 },
    { moduleId: 'drug-store', x: 20, z: 0, rotation: 0 },
    { moduleId: 'books', x: 20, z: 20, rotation: 0 },
    { moduleId: 'bench-1', x: 0, z: 20, rotation: 0 },
  ]),
  tile('remix-mixed-neighborhood', 'mixed', 4, 'grass', [
    { moduleId: 'sky-small', x: 0, z: 0, rotation: 0 },
    { moduleId: 'coffee-shop', x: 20, z: 10, rotation: 1 },
    { moduleId: 'gift-shop', x: 0, z: 20, rotation: 0 },
    { moduleId: 'big-tree', x: 25, z: 25, rotation: 0 },
  ]),
  tile('remix-civic-plaza', 'civic', 1, 'concrete', [
    { moduleId: 'sky-small', x: 0, z: 0, rotation: 0 },
    { moduleId: 'bench-1', x: 15, z: 0, rotation: 0 },
    { moduleId: 'bench-2', x: 15, z: 8, rotation: 2 },
    { moduleId: 'big-tree', x: 25, z: 25, rotation: 0 },
  ]),
  tile('remix-park-corner', 'park', 5, 'grass', [
    { moduleId: 'big-tree', x: -5, z: -5, rotation: 0 },
    { moduleId: 'big-tree', x: 25, z: 25, rotation: 1 },
    { moduleId: 'bench-1', x: 5, z: 10, rotation: 0 },
    { moduleId: 'bench-2', x: 20, z: 10, rotation: 2 },
    { moduleId: 'bush', x: 10, z: 25, rotation: 0 },
    { moduleId: 'rock', x: 20, z: 0, rotation: 0 },
  ]),
] satisfies readonly TileRecipe[])

export const REMIX_TILE_IDS = REMIX_TILE_RECIPES.map(({ id }) => id)
```

- [x] **Step 5: Implement catalog and recipe validation**

Create `tools/tiles/validate-recipes.ts`:

```ts
import { boundsOverlap, insidePlot, placementBounds } from './geometry'
import type { ModuleDefinition, Placement, TileRecipe } from './types'

const isHalfUnit = (value: number): boolean => Number.isInteger(value * 2)
const placementName = (placement: Placement): string => placement.moduleId

export function validateCatalog(catalog: readonly ModuleDefinition[]): void {
  const ids = new Set<string>()
  for (const module of catalog) {
    if (ids.has(module.id)) throw new Error(`Duplicate module ID ${module.id}`)
    ids.add(module.id)
    if (!module.source.endsWith('.gltf')) throw new Error(`${module.id}: source must be .gltf`)
    if (module.nodeName.length === 0) throw new Error(`${module.id}: node name is empty`)
    if (module.footprint.width <= 0 || module.footprint.depth <= 0) {
      throw new Error(`${module.id}: footprint must be positive`)
    }
  }
}

export function validateRecipes(
  recipes: readonly TileRecipe[],
  catalog: readonly ModuleDefinition[],
): void {
  validateCatalog(catalog)
  const modules = new Map(catalog.map((module) => [module.id, module]))
  const recipeIds = new Set<string>()

  for (const recipe of recipes) {
    if (recipeIds.has(recipe.id)) throw new Error(`Duplicate recipe ID ${recipe.id}`)
    recipeIds.add(recipe.id)
    if (recipe.weight <= 0 || !Number.isInteger(recipe.weight)) {
      throw new Error(`${recipe.id}: weight must be a positive integer`)
    }

    const resolved = recipe.placements.map((placement) => {
      const module = modules.get(placement.moduleId)
      if (module === undefined) throw new Error(`${recipe.id}: unknown module ${placement.moduleId}`)
      if (!module.allowedRotations.includes(placement.rotation)) {
        throw new Error(`${recipe.id}: ${module.id} has unsupported rotation ${placement.rotation}`)
      }
      if (!isHalfUnit(placement.x) || !isHalfUnit(placement.z)) {
        throw new Error(`${recipe.id}: ${module.id} position must use an integer or half-unit`)
      }
      const bounds = placementBounds(module.footprint, placement)
      if (!insidePlot(bounds)) throw new Error(`${recipe.id}: ${module.id} is outside plot`)
      return { placement, module, bounds }
    })

    const surfaceKeys = resolved
      .filter(({ module }) => module.kind === 'surface')
      .map(({ placement }) => `${placement.x}:${placement.z}`)
      .sort()
    expectSurfaceCells(recipe.id, surfaceKeys)

    for (let leftIndex = 0; leftIndex < resolved.length; leftIndex += 1) {
      const left = resolved[leftIndex]!
      if (left.module.kind === 'surface') continue
      for (let rightIndex = leftIndex + 1; rightIndex < resolved.length; rightIndex += 1) {
        const right = resolved[rightIndex]!
        if (right.module.kind === 'surface') continue
        if (left.module.kind === 'prop' && right.module.kind === 'prop') continue
        if (boundsOverlap(left.bounds, right.bounds)) {
          throw new Error(`${recipe.id}: ${placementName(left.placement)} overlaps ${placementName(right.placement)}`)
        }
      }
    }
  }
}

function expectSurfaceCells(recipeId: string, actual: readonly string[]): void {
  const expected = ['10:10']
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${recipeId}: surface must cover the plot at 10:10`)
  }
}
```

- [x] **Step 6: Run focused verification and commit**

```powershell
bun run test -- tests/tile-geometry.test.ts tests/tile-recipes.test.ts
bun run typecheck
git add tools/tiles/module-catalog.ts tools/tiles/tile-recipes.ts tools/tiles/validate-recipes.ts tests/tile-recipes.test.ts
git commit -m "feat: define curated remix tile recipes"
```

Expected: both focused test files pass, typecheck exits zero, and the commit contains no generated assets.

### Task 3: Extract and place named GLTF modules

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`
- Create: `tools/tiles/source-assets.ts`
- Create: `tests/tile-source-assets.test.ts`

**Interfaces:**
- Consumes: `ModuleDefinition` and `Placement` from Task 1.
- Produces: `SourceCache`, `findExactNode()`, `copyPlacedModule()`, and `measureModuleFootprint()`.

- [x] **Step 1: Add the compiler dependencies**

Run:

```powershell
bun add -d @gltf-transform/core@^4.3.0 @gltf-transform/functions@^4.3.0
```

- [x] **Step 2: Write failing source extraction tests**

Create `tests/tile-source-assets.test.ts`:

```ts
import { Accessor, Document } from '@gltf-transform/core'
import { describe, expect, it } from 'vitest'
import {
  copyPlacedModule,
  findExactNode,
  measureModuleFootprint,
} from '../tools/tiles/source-assets'
import type { ModuleDefinition } from '../tools/tiles/types'

const definition: ModuleDefinition = {
  id: 'fixture', source: 'fixture.gltf', nodeName: 'Fixture', kind: 'building',
  anchor: 'bottom-center', footprint: { width: 4, depth: 6 }, allowedRotations: [0, 1, 2, 3],
}

const createSource = (): Document => {
  const document = new Document()
  const buffer = document.createBuffer()
  const positions = document.createAccessor().setType(Accessor.Type.VEC3).setArray(new Float32Array([
    -2, 0, -3, 2, 0, -3, 2, 5, 3, -2, 5, 3,
  ])).setBuffer(buffer)
  const primitive = document.createPrimitive().setAttribute('POSITION', positions)
  const mesh = document.createMesh('FixtureMesh').addPrimitive(primitive)
  const node = document.createNode('Fixture').setMesh(mesh).setTranslation([10, 0, 20])
  document.createScene('Source').addChild(node)
  return document
}

describe('source asset extraction', () => {
  it('requires one exact node name', () => {
    const source = createSource()
    expect(findExactNode(source, definition).getName()).toBe('Fixture')
    source.createNode('Fixture')
    expect(() => findExactNode(source, definition)).toThrow('fixture.gltf: expected one node named Fixture, found 2')
  })

  it('measures the source world-space footprint', () => {
    expect(measureModuleFootprint(findExactNode(createSource(), definition)))
      .toEqual({ width: 4, depth: 6 })
  })

  it('copies, bottom-centers, rotates, and places a module', () => {
    const output = new Document()
    const root = output.createNode('tile-root')
    output.createScene('tile').addChild(root)
    copyPlacedModule(output, root, createSource(), definition, {
      moduleId: 'fixture', x: 8, z: 12, rotation: 1,
    }, 0)
    const placement = root.listChildren()[0]!
    expect(placement.getTranslation()).toEqual([8, 0, 12])
    expect(placement.getRotation()).toEqual([0, Math.SQRT1_2, 0, Math.SQRT1_2])
    expect(placement.listChildren()).toHaveLength(1)
  })
})
```

- [x] **Step 3: Run the extraction test and verify RED**

```powershell
bun run test -- tests/tile-source-assets.test.ts
```

Expected: FAIL because `source-assets.ts` does not exist.

- [x] **Step 4: Implement exact-node copying and anchoring**

Create `tools/tiles/source-assets.ts`:

```ts
import { type Document, type mat4, type Node, NodeIO } from '@gltf-transform/core'
import { copyToDocument, getBounds } from '@gltf-transform/functions'
import * as THREE from 'three'
import { resolve } from 'node:path'
import type { Footprint, ModuleDefinition, Placement } from './types'

const FOOTPRINT_TOLERANCE = 0.05

export class SourceCache {
  private readonly io = new NodeIO()
  private readonly documents = new Map<string, Promise<Document>>()

  constructor(private readonly projectRoot: string) {}

  load(filename: string): Promise<Document> {
    const existing = this.documents.get(filename)
    if (existing !== undefined) return existing
    const loaded = this.io.read(resolve(this.projectRoot, 'js', 'gltf', filename))
    this.documents.set(filename, loaded)
    return loaded
  }
}

export function findExactNode(document: Document, definition: ModuleDefinition): Node {
  const matches = document.getRoot().listNodes()
    .filter((node) => node.getName() === definition.nodeName)
  if (matches.length !== 1) {
    throw new Error(`${definition.source}: expected one node named ${definition.nodeName}, found ${matches.length}`)
  }
  return matches[0]!
}

export function measureModuleFootprint(node: Node): Footprint {
  const bounds = getBounds(node)
  return { width: bounds.max[0] - bounds.min[0], depth: bounds.max[2] - bounds.min[2] }
}

export function assertDeclaredFootprint(node: Node, definition: ModuleDefinition): void {
  const measured = measureModuleFootprint(node)
  if (measured.width > definition.footprint.width + FOOTPRINT_TOLERANCE
    || measured.depth > definition.footprint.depth + FOOTPRINT_TOLERANCE) {
    throw new Error(
      `${definition.id}: measured ${measured.width.toFixed(2)}x${measured.depth.toFixed(2)} exceeds declared ${definition.footprint.width.toFixed(2)}x${definition.footprint.depth.toFixed(2)}`,
    )
  }
}

export function copyPlacedModule(
  output: Document,
  tileRoot: Node,
  source: Document,
  definition: ModuleDefinition,
  placement: Placement,
  index: number,
): Node {
  const sourceNode = findExactNode(source, definition)
  assertDeclaredFootprint(sourceNode, definition)
  const propertyMap = copyToDocument(output, source, [sourceNode])
  const copiedNode = propertyMap.get(sourceNode) as Node | undefined
  if (copiedNode === undefined) throw new Error(`${definition.id}: copy did not return a node`)

  const bounds = getBounds(sourceNode)
  const anchor = new THREE.Vector3(
    (bounds.min[0] + bounds.max[0]) / 2,
    bounds.min[1],
    (bounds.min[2] + bounds.max[2]) / 2,
  )
  const localMatrix = new THREE.Matrix4()
    .makeTranslation(-anchor.x, -anchor.y, -anchor.z)
    .multiply(new THREE.Matrix4().fromArray(sourceNode.getWorldMatrix()))
  copiedNode.setMatrix(localMatrix.toArray() as mat4)

  const angle = placement.rotation * Math.PI / 2
  const placementNode = output.createNode(`${definition.id}-${index}`)
    .setTranslation([placement.x, 0, placement.z])
    .setRotation([0, Math.sin(angle / 2), 0, Math.cos(angle / 2)])
    .addChild(copiedNode)
  tileRoot.addChild(placementNode)
  return placementNode
}
```

- [x] **Step 5: Run focused verification and commit**

```powershell
bun run test -- tests/tile-source-assets.test.ts
bun run typecheck
git add package.json bun.lock tools/tiles/source-assets.ts tests/tile-source-assets.test.ts
git commit -m "feat: extract named gltf modules"
```

Expected: extraction tests pass and TypeScript accepts the glTF Transform 4.3 APIs.

### Task 4: Build and verify deterministic GLBs

**Files:**
- Modify: `package.json`
- Create: `tools/tiles/build-tiles.ts`
- Create: `tests/generated-tiles.test.ts`
- Create: 12 `js/clusters/remix-*.glb` files

**Interfaces:**
- Consumes: `MODULES_BY_ID`, `REMIX_TILE_RECIPES`, `validateRecipes()`, `SourceCache`, and `copyPlacedModule()`.
- Produces: `BuildOptions`, `BuildOutput`, `buildTile()`, `buildAllTiles()`, and committed GLB assets.

- [x] **Step 1: Write failing build integration tests**

Create `tests/generated-tiles.test.ts`:

```ts
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { NodeIO } from '@gltf-transform/core'
import { getBounds } from '@gltf-transform/functions'
import { buildAllTiles } from '../tools/tiles/build-tiles'
import { REMIX_TILE_IDS } from '../tools/tiles/tile-recipes'

const temporaryDirectories: string[] = []
const makeOutput = async (): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), 'endless-city-tiles-'))
  temporaryDirectories.push(path)
  return path
}
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))))

const hash = async (path: string): Promise<string> =>
  createHash('sha256').update(await readFile(path)).digest('hex')

describe('generated remix tiles', () => {
  it('builds 12 self-contained, bounded GLBs within the size budget', async () => {
    const outputDir = await makeOutput()
    const outputs = await buildAllTiles({ projectRoot: resolve('.'), outputDir })
    const io = new NodeIO()
    expect(outputs.map(({ id }) => id)).toEqual(REMIX_TILE_IDS)
    let totalBytes = 0
    for (const output of outputs) {
      const file = join(outputDir, `${output.id}.glb`)
      const bytes = (await stat(file)).size
      totalBytes += bytes
      expect(bytes).toBeLessThanOrEqual(900 * 1024)
      const document = await io.read(file)
      const scene = document.getRoot().listScenes()[0]!
      const root = scene.listChildren()[0]!
      const bounds = getBounds(root)
      expect(document.getRoot().listMeshes().length).toBeGreaterThan(0)
      expect(document.getRoot().listTextures().every((texture) => texture.getImage() !== null)).toBe(true)
      expect(bounds.min[0]).toBeGreaterThanOrEqual(-10.05)
      expect(bounds.max[0]).toBeLessThanOrEqual(30.05)
      expect(bounds.min[2]).toBeGreaterThanOrEqual(-10.05)
      expect(bounds.max[2]).toBeLessThanOrEqual(30.05)
    }
    expect(totalBytes).toBeLessThanOrEqual(6 * 1024 * 1024)
  }, 60_000)

  it('produces byte-identical files from the same inputs', async () => {
    const first = await makeOutput()
    const second = await makeOutput()
    await buildAllTiles({ projectRoot: resolve('.'), outputDir: first })
    await buildAllTiles({ projectRoot: resolve('.'), outputDir: second })
    for (const id of REMIX_TILE_IDS) {
      expect(await hash(join(first, `${id}.glb`))).toBe(await hash(join(second, `${id}.glb`)))
    }
  }, 60_000)
})
```

- [x] **Step 2: Run the build tests and verify RED**

```powershell
bun run test -- tests/generated-tiles.test.ts
```

Expected: FAIL because `build-tiles.ts` does not exist.

- [x] **Step 3: Implement in-memory tile compilation and safe output replacement**

Create `tools/tiles/build-tiles.ts`:

```ts
import { Document, NodeIO } from '@gltf-transform/core'
import { dedup, getBounds, prune } from '@gltf-transform/functions'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { MODULE_CATALOG, MODULES_BY_ID } from './module-catalog'
import { PLOT_MAX, PLOT_MIN } from './geometry'
import { REMIX_TILE_RECIPES } from './tile-recipes'
import { validateRecipes } from './validate-recipes'
import { copyPlacedModule, SourceCache } from './source-assets'
import type { TileRecipe } from './types'

export interface BuildOptions { readonly projectRoot: string; readonly outputDir: string }
export interface BuildOutput { readonly id: string; readonly path: string; readonly bytes: number }

const io = new NodeIO()

async function validateStagedGlb(path: string, id: string): Promise<void> {
  const document = await io.read(path)
  const scene = document.getRoot().listScenes()[0]
  const root = scene?.listChildren()[0]
  if (root === undefined || document.getRoot().listMeshes().length === 0) {
    throw new Error(`${id}: generated scene has no renderable mesh`)
  }
  const bounds = getBounds(root)
  if (bounds.min[0] < PLOT_MIN - 0.05 || bounds.max[0] > PLOT_MAX + 0.05
    || bounds.min[2] < PLOT_MIN - 0.05 || bounds.max[2] > PLOT_MAX + 0.05) {
    throw new Error(`${id}: generated geometry is outside the plot`)
  }
  for (const texture of document.getRoot().listTextures()) {
    if (texture.getImage() === null) throw new Error(`${id}: texture ${texture.getName()} has no embedded image`)
  }
}

export async function buildTile(
  recipe: TileRecipe,
  sources: SourceCache,
): Promise<Uint8Array> {
  const output = new Document()
  const tileRoot = output.createNode(recipe.id)
  output.createScene(recipe.id).addChild(tileRoot)
  for (let index = 0; index < recipe.placements.length; index += 1) {
    const placement = recipe.placements[index]!
    const definition = MODULES_BY_ID.get(placement.moduleId)
    if (definition === undefined) throw new Error(`${recipe.id}: unknown module ${placement.moduleId}`)
    const source = await sources.load(definition.source)
    copyPlacedModule(output, tileRoot, source, definition, placement, index)
  }
  await output.transform(dedup(), prune({ keepExtras: true }))
  return io.writeBinary(output)
}

export async function buildAllTiles(options: BuildOptions): Promise<BuildOutput[]> {
  validateRecipes(REMIX_TILE_RECIPES, MODULE_CATALOG)
  await mkdir(options.outputDir, { recursive: true })
  const temporary = await mkdtemp(join(tmpdir(), 'endless-city-remix-'))
  const sources = new SourceCache(options.projectRoot)
  try {
    const staged: BuildOutput[] = []
    for (const recipe of REMIX_TILE_RECIPES) {
      const binary = await buildTile(recipe, sources)
      const stagedPath = join(temporary, `${recipe.id}.glb`)
      await writeFile(stagedPath, binary)
      await validateStagedGlb(stagedPath, recipe.id)
      staged.push({ id: recipe.id, path: stagedPath, bytes: binary.byteLength })
    }
    const totalBytes = staged.reduce((sum, output) => sum + output.bytes, 0)
    if (totalBytes > 6 * 1024 * 1024) throw new Error(`Generated tiles exceed 6 MiB: ${totalBytes} bytes`)
    for (const output of staged) {
      if (output.bytes > 900 * 1024) throw new Error(`${output.id} exceeds 900 KiB: ${output.bytes} bytes`)
    }
    const committed: BuildOutput[] = []
    for (const output of staged) {
      const finalPath = join(options.outputDir, basename(output.path))
      await copyFile(output.path, finalPath)
      committed.push({ ...output, path: finalPath })
    }
    return committed
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  const projectRoot = resolve('.')
  const outputs = await buildAllTiles({ projectRoot, outputDir: resolve('js', 'clusters') })
  for (const output of outputs) console.log(`${output.id}: ${output.bytes} bytes`)
}

const invokedPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href
if (invokedPath === import.meta.url) await main()
```

Add the compiler command to `package.json`:

```json
"tiles:build": "bun tools/tiles/build-tiles.ts"
```

- [x] **Step 4: Run the compiler tests and correct measured-footprint drift**

```powershell
bun run test -- tests/generated-tiles.test.ts
```

Expected: both build tests pass. If a declared footprint differs by more than `0.05`, update the catalog to the exact measured value and rerun the pure recipe validator. Do not enlarge the plot or disable overlap checks.

- [x] **Step 5: Generate and inspect the committed outputs**

```powershell
bun run tiles:build
Get-ChildItem js\clusters\remix-*.glb | Select-Object Name,Length
bun run test -- tests/generated-tiles.test.ts tests/tile-source-assets.test.ts tests/tile-recipes.test.ts
```

Expected: 12 files appear, each is at most 900 KiB, their total is at most 6 MiB, and focused tests pass.

- [x] **Step 6: Commit compiler and assets**

```powershell
git add package.json tools/tiles/build-tiles.ts tests/generated-tiles.test.ts js/clusters/remix-*.glb
git commit -m "feat: build curated remix tile assets"
```

### Task 5: Register the 12 tiles with the runtime catalog

**Files:**
- Modify: `src/city/types.ts`
- Modify: `src/city/layout.ts`
- Modify: `src/rendering/assets.ts`
- Modify: `src/app.ts`
- Modify: `index.html`
- Modify: `tests/layout.test.ts`
- Modify: `tests/assets.test.ts`
- Modify: `tests/app.test.ts`

**Interfaces:**
- Consumes: the 12 stable recipe IDs and GLBs from Tasks 2 and 4.
- Produces: 27 runtime building IDs and exported `TOTAL_ASSET_REQUESTS = 29`.

- [x] **Step 1: Update runtime contract tests first**

In `tests/layout.test.ts`, change both catalog-count expectations from 15 to 27 and add:

```ts
it('contains all curated remix IDs with positive weights', () => {
  const remix = BUILDING_CATALOG.filter(({ id }) => id.startsWith('remix-'))
  expect(remix).toHaveLength(12)
  expect(remix.every(({ weight }) => Number.isInteger(weight) && weight > 0)).toBe(true)
})
```

In `tests/assets.test.ts`, import `TOTAL_ASSET_REQUESTS`, change the unique building count to 27, rename the progress test to `reports completion for every one-time asset request`, and replace literal request-count assertions with:

```ts
expect(TOTAL_ASSET_REQUESTS).toBe(29)
expect(urls).toHaveLength(TOTAL_ASSET_REQUESTS)
expect(new Set(urls).size).toBe(TOTAL_ASSET_REQUESTS)
expect(progress).toHaveLength(TOTAL_ASSET_REQUESTS)
expect(progress.at(-1)).toMatchObject({
  loaded: TOTAL_ASSET_REQUESTS,
  total: TOTAL_ASSET_REQUESTS,
})
```

Add this test to the `startApp` lifecycle group in `tests/app.test.ts`:

```ts
it('restores the catalog-derived initial loading total before the first asset event', async () => {
  const canvas = document.createElement('canvas')
  const overlay = createOverlayHarness()
  const scene = createRunnableScene()
  const stop = new Error('stop pending asset load')
  let rejectAssets: (error: Error) => void = () => undefined
  const appPromise = startApp({
    canvas,
    overlay: overlay as unknown as OverlayController,
  }, {
    createScene: () => scene.context,
    loadAssetCatalog: () => new Promise((_, reject) => { rejectAssets = reject }),
  })

  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
  canvas.dispatchEvent(new Event('webglcontextrestored'))
  expect(overlay.showLoading).toHaveBeenCalledWith(0, TOTAL_ASSET_REQUESTS)

  rejectAssets(stop)
  await expect(appPromise).rejects.toBe(stop)
})
```

Import `TOTAL_ASSET_REQUESTS` from `../src/rendering/assets` in that test file.

- [x] **Step 2: Run the runtime contract tests and verify RED**

```powershell
bun run test -- tests/layout.test.ts tests/assets.test.ts tests/app.test.ts
```

Expected: FAIL because there are 15 IDs, `TOTAL_ASSET_REQUESTS` is not exported, and the initial total remains 17.

- [x] **Step 3: Extend `BuildingId` and the weighted catalog**

Append these members to `BuildingId` in `src/city/types.ts`:

```ts
  | 'remix-residential-court' | 'remix-residential-towers'
  | 'remix-residential-garden' | 'remix-residential-row'
  | 'remix-commercial-market' | 'remix-commercial-cafes'
  | 'remix-commercial-shops' | 'remix-commercial-services'
  | 'remix-mixed-main-street' | 'remix-mixed-neighborhood'
  | 'remix-civic-plaza' | 'remix-park-corner'
```

Append these entries to `BUILDING_CATALOG` in `src/city/layout.ts`:

```ts
  { id: 'remix-residential-court', weight: 6 },
  { id: 'remix-residential-towers', weight: 4 },
  { id: 'remix-residential-garden', weight: 6 },
  { id: 'remix-residential-row', weight: 6 },
  { id: 'remix-commercial-market', weight: 4 },
  { id: 'remix-commercial-cafes', weight: 4 },
  { id: 'remix-commercial-shops', weight: 4 },
  { id: 'remix-commercial-services', weight: 3 },
  { id: 'remix-mixed-main-street', weight: 3 },
  { id: 'remix-mixed-neighborhood', weight: 4 },
  { id: 'remix-civic-plaza', weight: 1 },
  { id: 'remix-park-corner', weight: 5 },
```

- [x] **Step 4: Derive request progress from the catalog**

In `src/rendering/assets.ts`, replace the fixed constant and literal total type:

```ts
export const TOTAL_ASSET_REQUESTS = BUILDING_CATALOG.length + 2

export interface AssetProgress {
  readonly loaded: number
  readonly total: number
  readonly url: string
}
```

In `src/app.ts`, import the constant and replace the initial progress state:

```ts
import {
  loadAssetCatalog as loadAssets,
  TOTAL_ASSET_REQUESTS,
  type AssetCatalog,
} from './rendering/assets'

let lastLoadingProgress = { loaded: 0, total: TOTAL_ASSET_REQUESTS }
```

Change `index.html` to:

```html
<p id="loading-status" class="status-message" role="status">Loading city 0/29</p>
```

Keep app tests that inject `{ total: 17 }` unchanged; those tests verify deferred forwarding of an arbitrary loader progress event.

- [x] **Step 5: Run runtime and full tests**

```powershell
bun run test -- tests/layout.test.ts tests/assets.test.ts tests/app.test.ts tests/city-view.test.ts
bun run typecheck
```

Expected: focused tests pass, the deterministic layout uses 27 IDs, and the fixed city pool remains 81 or 49 slots by quality profile.

- [x] **Step 6: Commit runtime integration**

```powershell
git add src/city/types.ts src/city/layout.ts src/rendering/assets.ts src/app.ts index.html tests/layout.test.ts tests/assets.test.ts tests/app.test.ts
git commit -m "feat: register curated remix tiles"
```

### Task 6: Add the local visual gallery

**Files:**
- Create: `tools/tiles/gallery.html`
- Create: `tools/tiles/gallery.ts`
- Create: `tools/tiles/gallery.css`
- Create: `tests/tile-gallery.test.ts`

**Interfaces:**
- Consumes: `REMIX_TILE_RECIPES` and `/clusters/<recipe-id>.glb` URLs.
- Produces: `galleryItems()` and the Vite-served `/tools/tiles/gallery.html` review page.

- [x] **Step 1: Write the gallery manifest test**

Create `tests/tile-gallery.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { galleryItems } from '../tools/tiles/gallery'

describe('remix tile gallery manifest', () => {
  it('lists all 12 unique generated URLs with readable labels', () => {
    const items = galleryItems()
    expect(items).toHaveLength(12)
    expect(new Set(items.map(({ url }) => url)).size).toBe(12)
    expect(items.every(({ id, label, url }) =>
      label.length > 0 && url === `/clusters/${id}.glb`,
    )).toBe(true)
  })
})
```

- [x] **Step 2: Run the gallery test and verify RED**

```powershell
bun run test -- tests/tile-gallery.test.ts
```

Expected: FAIL because `tools/tiles/gallery.ts` does not exist.

- [x] **Step 3: Create the gallery page and renderer**

Create `tools/tiles/gallery.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Curated Remix Tile Gallery</title>
    <link rel="stylesheet" href="/tools/tiles/gallery.css">
  </head>
  <body>
    <header><h1>Curated Remix Tiles</h1><p>All 12 generated plots at the production camera angle.</p></header>
    <main id="gallery" aria-live="polite"></main>
    <script type="module" src="/tools/tiles/gallery.ts"></script>
  </body>
</html>
```

Create `tools/tiles/gallery.ts` with a DOM guard so Vitest can import `galleryItems()` in Node:

```ts
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { REMIX_TILE_RECIPES } from './tile-recipes'

export interface GalleryItem { readonly id: string; readonly label: string; readonly url: string }
export const galleryItems = (): GalleryItem[] => REMIX_TILE_RECIPES.map(({ id }) => ({
  id,
  label: id.replace(/^remix-/, '').replaceAll('-', ' '),
  url: `/clusters/${id}.glb`,
}))

async function renderItem(item: GalleryItem, host: HTMLElement): Promise<void> {
  const card = document.createElement('article')
  const label = document.createElement('h2')
  const canvas = document.createElement('canvas')
  label.textContent = item.label
  canvas.width = 360
  canvas.height = 270
  card.append(label, canvas)
  host.append(card)

  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.setSize(canvas.width, canvas.height, false)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)
    const camera = new THREE.PerspectiveCamera(40, canvas.width / canvas.height, 1, 500)
    const target = new THREE.Vector3(10, 0, 10)
    const distance = 110
    const horizontal = distance * Math.sin(Math.PI / 5)
    camera.position.set(
      target.x + horizontal / Math.sqrt(2),
      distance * Math.cos(Math.PI / 5),
      target.z + horizontal / Math.sqrt(2),
    )
    camera.lookAt(target)
    const sun = new THREE.DirectionalLight(0x9a9a9a, 1)
    sun.position.set(-100, 250, -100)
    sun.castShadow = true
    scene.add(sun, new THREE.HemisphereLight(0xefefef, 0xffffff, 1))
    const gltf = await new GLTFLoader().loadAsync(item.url)
    gltf.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
    scene.add(gltf.scene)
    renderer.render(scene, camera)
  } catch (error) {
    card.dataset.state = 'error'
    const message = document.createElement('p')
    message.textContent = error instanceof Error ? error.message : String(error)
    card.append(message)
  }
}

async function main(): Promise<void> {
  const host = document.querySelector<HTMLElement>('#gallery')
  if (host === null) throw new Error('Missing #gallery')
  await Promise.all(galleryItems().map((item) => renderItem(item, host)))
}

if (typeof document !== 'undefined') void main()
```

Create `tools/tiles/gallery.css`:

```css
:root { color-scheme: dark; font-family: system-ui, sans-serif; background: #151513; color: #f4f1e8; }
body { margin: 0; padding: 24px; }
header { max-width: 900px; margin: 0 auto 24px; }
#gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
article { padding: 12px; border: 1px solid #45453f; border-radius: 8px; background: #20201d; }
h1, h2, p { margin-top: 0; }
h2 { font-size: 1rem; text-transform: capitalize; }
canvas { display: block; width: 100%; height: auto; background: #000; }
article[data-state="error"] { border-color: #d66; }
article[data-state="error"] p { color: #f99; overflow-wrap: anywhere; }
```

- [x] **Step 4: Verify the manifest and local gallery**

```powershell
bun run test -- tests/tile-gallery.test.ts
bun run dev
```

Open `/tools/tiles/gallery.html`. Check all labels and canvases, then inspect every tile for grounding, overlap, envelope violations, entrances, surface seams, shadows, and visual distinction. Record any recipe coordinate corrections in `tile-recipes.ts`, rerun `bun run tiles:build`, and rerun the recipe/generated-asset tests before continuing.

Expected: 12 labeled cards render without an error state or console warning.

- [x] **Step 5: Commit the gallery**

```powershell
git add tools/tiles/gallery.html tools/tiles/gallery.ts tools/tiles/gallery.css tests/tile-gallery.test.ts tools/tiles/tile-recipes.ts js/clusters/remix-*.glb
git commit -m "feat: add remix tile review gallery"
```

### Task 7: Update documentation and run final verification

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/superpowers/plans/2026-07-14-curated-remix-tiles.md`

**Interfaces:**
- Consumes: the finished compiler, gallery, 27-tile catalog, and 29-request loader.
- Produces: maintainer instructions and completion evidence.

- [x] **Step 1: Replace the README asset constraint**

Replace the current `## Asset constraint` section with:

```markdown
## Asset constraint

Runtime visuals use models and textures contained in this repository. The original separable sources live in `js/gltf/`; production-ready assets live in `js/clusters/`. Twelve `remix-*.glb` tiles derive only from those source models through `bun run tiles:build`.

Do not import new models, generate new geometry, or add texture artwork without an explicit project-direction change. Before redistributing model derivatives outside this repository, confirm the provenance of the original model files.
```

Add to the project structure list:

```markdown
- `tools/tiles/` — validated recipes, offline GLB compiler, and local review gallery.
```

Add to the verification commands:

```powershell
bun run tiles:build
```

- [x] **Step 2: Update the architecture asset lifecycle**

Replace the opening asset-lifecycle paragraph in `docs/architecture.md` with:

```markdown
`src/rendering/assets.ts` requests the road, 27 building prototypes, and `cars.gltf` once. The 15 original runtime tiles and 12 curated `remix-*.glb` tiles live in `js/clusters/`; `vite.config.ts` serves that directory at `/clusters/`. Building scenes are cached and cloned into tile slots. A failed building uses the existing park prototype when available, then an empty plot; the required road has no silent fallback.

The original separable models live in `js/gltf/`. `tools/tiles/` uses named source nodes and validated 40-by-40 recipes to regenerate the 12 committed remix GLBs with `bun run tiles:build`. The browser never assembles tile recipes. The local `/tools/tiles/gallery.html` page displays all remix outputs for visual review during development.
```

Update any remaining `15 building`, `17 request`, or no-generated-asset statements to the 27-building, 29-request, source-derived contract.

- [x] **Step 3: Run the reproducibility and automated gates**

```powershell
bun run tiles:build
git diff --exit-code -- js/clusters/remix-*.glb
bun run typecheck
bun run test
bun run build
git diff --check
```

Expected: regeneration changes no GLB bytes, typecheck passes, every test file passes, the production build succeeds, and diff check prints nothing.

- [ ] **Step 4: Run browser smoke checks**

Serve the production build and the Vite development gallery. Verify:

- ordinary startup reaches ready after 29 progress events;
- deterministic travel produces both original and remix tile IDs;
- building pool size remains 81 on high quality and 49 on balanced/mobile;
- missing optional remix assets still use the park fallback;
- camera, panning, zoom, traffic, fog, shadows, and floating-origin behavior remain unchanged;
- all 12 gallery cards render and the browser console has no errors or warnings.

- [x] **Step 5: Mark plan evidence and commit documentation**

Check each completed box in this plan only after its command or visual check has produced evidence. Then commit:

```powershell
git add README.md docs/architecture.md docs/superpowers/plans/2026-07-14-curated-remix-tiles.md
git commit -m "docs: document curated remix tiles"
```

- [x] **Step 6: Confirm the branch is ready for integration**

```powershell
git status --short
git log --oneline --decorate -8
```

Expected: status prints nothing and the log shows one focused commit for each completed task.
