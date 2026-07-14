# Remix Tile Prop Enrichment Design

## Goal

Add context-aware detail to all 12 curated remix tiles. Each tile should contain four to seven props without hiding its buildings or crowding its 40-by-40 plot.

The work reuses named nodes from `js/gltf/`. The asset compiler will bake the props into the existing `remix-*.glb` files. The browser will continue to load complete GLBs and clone them as city tiles.

## Scope

The change keeps the 12 tile IDs, category split, runtime weights, building layouts, block spacing, and `[-10, 30]` plot envelope. It also keeps the 27-tile runtime catalog and 29-request loading total.

The enrichment pass adds static scenery and parked vehicles. It does not add runtime scattering, animation, traffic vehicles, new geometry, or new texture artwork.

## Source modules

The existing catalog already provides big trees, benches, a grass fence, bushes, rocks, and cafe chairs. The compiler will add these exact source nodes:

| Module ID | Source | Node | Footprint |
| --- | --- | --- | --- |
| `cube-tree` | `apartments.gltf` | `Natures_Cube_Tree.obj` | 3.39 x 3.19 |
| `fir-tree` | `house.gltf` | `Natures_Fir_Tree.obj` | 3.39 x 3.92 |
| `parked-car` | `house.gltf` | `Vehicle_Car.obj` | 6.32 x 2.96 |
| `pickup-truck` | `gas.gltf` | `Vehicle_Pick_up_Truck.obj` | 3.10 x 5.97 |
| `police-car` | `gas.gltf` | `Vehicle_Police_Car.obj` | 6.32 x 2.96 |
| `delivery-truck` | `factory.gltf` | `Vehicle_Truck.obj` | 9.10 x 3.63 |
| `hydrant` | `bus.gltf` | `Props_Hydrant.obj` | 0.44 x 0.44 |
| `street-light` | `road.gltf` | `Props_Street_Light.obj` | 0.60 x 2.53 |
| `stop-sign` | `bus.gltf` | `Props_Traffic_Sign_stop.obj` | 0.72 x 0.07 |
| `barrier` | `supermarket.gltf` | `Props_Traffic_Control_Barrier_Fence.obj` | 3.60 x 0.20 |
| `fence` | `house2.gltf` | `Props_Fence.obj` | 39.60 x 0.16 |

Each entry uses the existing bottom-center anchor and quarter-turn rotation contract. Catalog validation will continue to reject missing or duplicate node names and measured footprints that exceed their declarations.

## Curated tile treatment

Each recipe will finish with four to seven props. The implementation plan will set exact half-unit coordinates after checking measured building bounds.

- `remix-residential-court`: add one parked car and mix big, cube, and fir trees around the two houses.
- `remix-residential-towers`: add parked cars, a street light, and a second tree near the apartment entrances.
- `remix-residential-garden`: add a parked car, fir trees, and shrubs while retaining the long grass fence.
- `remix-residential-row`: add cars along the shared access edge, small trees between houses, and one street light.
- `remix-commercial-market`: add customer cars, a barrier, a street light, and a hydrant around the supermarket and bakery.
- `remix-commercial-cafes`: add a parked car, more outdoor chairs, one street light, and mixed trees.
- `remix-commercial-shops`: add customer cars, street lights, a stop sign, and a hydrant around the four shops.
- `remix-commercial-services`: add a pickup truck, a delivery truck, barriers, a stop sign, and a street light.
- `remix-mixed-main-street`: add parked cars, street lights, and a hydrant along the shop frontage.
- `remix-mixed-neighborhood`: add one parked car, mixed trees, a street light, and a bench.
- `remix-civic-plaza`: keep the two benches, then use two trees, one street light, one hydrant, and one parked police car near the plot edge.
- `remix-park-corner`: use three mixed tree species, two benches, one bush, and one rock. This tile will contain no vehicles.

## Placement and validation

The recipes will keep integer or half-unit X/Z positions, Y at zero, and quarter-turn rotations. The existing validator will reject out-of-plot geometry and intersections between props and buildings. Props may overlap other props at the data-contract level, but the author must remove visible intersections during gallery review.

The compiler will retain its extraction diagnostics, deterministic output order, transactional replacement, and recovery behavior. Each generated GLB must stay at or below 900 KiB, and the 12 files must stay at or below 6 MiB in total.

## Runtime behavior

The enrichment changes only the contents of the 12 generated GLBs. `BuildingId`, `BUILDING_CATALOG`, runtime weights, loading progress, tile pools, roads, moving traffic, camera, fog, shadows, fallback behavior, and floating-origin logic will not change.

Parked vehicles remain part of their tile scenes. The traffic system will not control or animate them.

## Tests and visual review

Tests will pin the new catalog entries and the approved recipe order. Recipe tests will validate rotations, half-unit placement, bounds, and prop-building separation. Generated-asset tests will verify deterministic bytes, embedded resources, codec restrictions, size budgets, and the absence of runtime catalog changes.

The local gallery will render all 12 regenerated tiles with the production scene and shadow configuration. Reviewers will check prop scale, building visibility, vehicle orientation, tree variety, shadow coverage, and visible overlaps. A city smoke test will confirm road alignment, original and remix tile travel, clean browser logs, and unchanged pan and zoom controls.

## Acceptance criteria

- All 12 tiles contain four to seven context-appropriate props.
- Each tile remains readable at the production camera angle.
- Parked vehicles face a plausible driveway, curb, or service area.
- Trees and street furniture do not intersect buildings or extend outside the plot.
- The park contains mixed vegetation and no vehicles.
- The compiler regenerates byte-identical assets from unchanged inputs.
- All generated files meet the existing size and format limits.
- Typecheck, automated tests, production build, gallery review, and city smoke checks pass.

## Non-goals

- Runtime prop generation or random placement.
- Moving parked vehicles or connecting them to traffic logic.
- Changes to buildings, tile IDs, weights, roads, or quality profiles.
- New models, textures, compression formats, or browser decoders.
