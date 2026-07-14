# Curated Remix Tiles Design

**Date:** 2026-07-14

## Goal

Add 12 curated city tiles by extracting named buildings and props from the original source GLTF files, arranging them into new plots, and committing complete `js/clusters/remix-*.glb` files for the existing runtime tile pool.

## Scope

The first batch adds these groups:

- four residential tiles;
- four commercial tiles;
- two mixed-use tiles;
- one civic tile and one park tile.

The work reuses geometry, materials, and textures from `js/gltf/`. It creates no new modeled geometry or texture artwork. The compiler may move, rotate, and combine existing modules, then bake the result into new GLBs.

The batch adds 12 tile IDs to the existing 15, for 27 unique runtime tile IDs. Existing tiles, traffic, roads, block size, camera behavior, quality profiles, and tile-pool sizes remain unchanged.

## Source asset findings

The 15 source files in `js/gltf/` contain 33 named building roots representing 24 unique building names. Each source building root owns a mesh subtree. The same files also contain separate trees, benches, fences, signs, ground pieces, road pieces, and parked vehicles.

The runtime files in `js/clusters/` cannot serve as extraction sources. Blender consolidated each tile into one mesh and left many named building roots empty. The compiler must read `js/gltf/*.gltf`.

Each source GLTF embeds its binary buffer and PNG textures as data URIs. A compiler can therefore copy a selected node and all referenced resources without resolving external asset files.

## Chosen approach

A project-owned TypeScript compiler builds the 12 tiles offline. The compiler uses glTF Transform's Node API because `NodeIO` reads and writes GLTF/GLB documents, while the functions package provides document-copy, pruning, and deduplication operations. The tool runs under Bun and does not ship in the browser bundle.

The repository commits the generated GLBs. Development and production builds consume those files without running the compiler. Contributors run one package script when they change the module catalog or a recipe.

Manual Blender assembly would make regeneration and review depend on undocumented editor state. Browser-side assembly would increase startup work and scene-object counts. Neither approach fits this batch.

## File and component boundaries

The implementation adds a focused toolset under `tools/tiles/`:

- `module-catalog.ts` maps stable module IDs to a source GLTF, an exact node name, an anchor rule, a footprint, and allowed quarter-turn rotations.
- `tile-recipes.ts` defines the 12 tile IDs, category, runtime weight, surface cells, module placements, and prop placements.
- `geometry.ts` calculates rotation-aware axis-aligned footprints and overlap results in plot coordinates.
- `validate-recipes.ts` validates catalog entries and complete recipes without reading or writing runtime state.
- `build-tiles.ts` reads the source documents, copies selected subtrees and their resources, applies recipe transforms, prunes unused data, deduplicates resources, and writes GLBs.
- `gallery.html` and `gallery.ts` render the 12 new tiles in a local review grid. Vite serves the gallery during development, but the production entry point does not import it.

Tests mirror these boundaries. Pure geometry and recipe tests do not load GLTF files. Asset integration tests read the generated files from disk.

## Module extraction and anchors

Each catalog entry selects one exact source node. The compiler rejects zero matches and multiple matches. It copies the selected node and its descendants into the output document with the source world transform preserved.

The compiler normalizes each module to an anchor before it applies a recipe placement:

- buildings use the horizontal center of their world-space bounding box at ground level;
- trees, benches, signs, fences, and parked vehicles use the same bottom-center rule;
- full-plot surface pieces use the bottom-center rule.

The catalog records an explicit footprint for validation. The implementation measures the copied geometry and checks it against that footprint, with a small numeric tolerance. A source-asset change that exceeds the declared footprint causes the build to fail.

Recipes use integer or half-unit X/Z positions, Y position zero, and quarter-turn rotations. The compiler does not permit arbitrary scale or non-right-angle rotation.

## Plot coordinate contract

The city keeps its 60-unit block spacing. Each recipe occupies the authored 40-by-40 plot envelope from `-10` through `30` on X and Z. `CityView` continues to apply the existing whole-tile rotations and 0/20-unit correction.

Each tile starts with one existing 40-by-40 grass, concrete, or road-surface module normalized to its bottom center and placed at `(10, 10)`. Recipes do not include the global perimeter road mesh.

The validator rotates every declared footprint around its module anchor, translates it into plot coordinates, and checks the result against the plot envelope. It also rejects intersections between building footprints. Props may overlap the surface, but they may not intersect a building footprint.

## Curated tile set

The 12 IDs use stable, descriptive names:

- `remix-residential-court` combines two small houses with trees and a bench;
- `remix-residential-towers` combines the residential and small-sky buildings;
- `remix-residential-garden` combines two house types with grass and fencing;
- `remix-residential-row` arranges compact houses along one plot edge;
- `remix-commercial-market` combines the supermarket with one small shop;
- `remix-commercial-cafes` combines the coffee shop, bar, and outdoor seating;
- `remix-commercial-shops` uses four distinct small shop modules;
- `remix-commercial-services` combines auto-service and gas-station modules;
- `remix-mixed-main-street` combines one residential building with two shops;
- `remix-mixed-neighborhood` combines one small apartment building, a cafe, and a shop;
- `remix-civic-plaza` uses the small-sky building as a civic office with concrete, benches, and trees;
- `remix-park-corner` combines existing grass, trees, bushes, rocks, fences, and benches.

Recipe transforms determine the exact layout. Visual review may change positions and quarter turns, but the batch size, tile IDs, categories, and source-only asset rule stay fixed.

## Build flow

`bun run tiles:build` performs these steps:

1. Load and validate the module catalog and all recipes.
2. Read each required source GLTF once and cache the document.
3. Build each recipe in memory, then prune unused resources and deduplicate copies.
4. Serialize all 12 GLBs into a temporary output directory.
5. Re-read every temporary GLB and run the asset-contract checks.
6. Replace the committed files only after all 12 temporary files pass.

Parsing, validation, or export errors leave the committed outputs untouched. The command prints the recipe ID, module ID, source file, and node name for extraction errors. Geometry errors include the two colliding modules or the out-of-bounds footprint.

The compiler writes the files in recipe-ID order and applies no timestamps or random identifiers to document metadata. Running it twice from the same inputs must produce byte-identical files.

## Runtime integration

`BuildingId` and `BUILDING_CATALOG` gain the 12 IDs and weights. The four groups receive enough combined weight to appear during ordinary travel without displacing the existing landmark balance.

`loadAssetCatalogWithLoader()` requests each new GLB with the existing building files. A failed new asset uses the existing park fallback. `CityView` keeps cloning one complete scene per slot, so the tile pool, render-origin logic, placement transforms, and disposal ownership do not change.

The loading progress total changes from 17 to 29 requests: one road, 27 buildings, and one vehicle collection. Tests derive this total from the catalog instead of repeating a numeric literal in several places.

The 12 new files may add no more than 6 MiB in total, and no single file may exceed 900 KiB. The first implementation uses pruning and deduplication without Draco, Meshopt, WebP, or KTX2, which avoids runtime decoder and texture-format changes.

## Local gallery and visual acceptance

The local gallery loads the 12 generated GLBs through Three.js and displays them in a labeled grid with the application's camera angle, lights, shadows, ground color, and plot rotation behavior. A reviewer can inspect all tiles from the same page.

Each tile must pass these checks:

- buildings and props rest on the surface;
- building footprints do not intersect;
- no geometry crosses the plot envelope under any whole-tile quarter turn;
- entrances and parking areas face a reachable plot edge;
- surface cells show no gaps or visible depth fighting;
- shadows and material colors match the existing assets;
- repeated modules use enough position or orientation variation to distinguish the tile from its source layout.

The gallery reports load failures beside the affected tile instead of hiding them. It remains a development tool and does not add a production route or runtime flag.

## Automated verification

Unit tests cover:

- exact and ambiguous module lookup;
- bottom-center anchor calculations;
- all four footprint rotations;
- plot-boundary checks;
- building overlap and prop overlap rules;
- duplicate tile IDs and unsupported transforms;
- deterministic recipe ordering.

Disk contract tests prove:

- the catalog contains 27 unique building IDs;
- all 12 generated GLBs exist and parse;
- each generated scene contains renderable mesh primitives;
- generated files embed their buffers and textures;
- generated bounds stay inside the plot envelope;
- the per-file and total size budgets hold;
- two compiler runs produce identical hashes.

The final verification runs `bun run typecheck`, `bun run test`, `bun run build`, `bun run tiles:build`, and a browser smoke of the application and gallery. The application smoke confirms that new IDs appear in deterministic tile assignments, the building pool size stays fixed, fallbacks still work, and the browser logs no errors or warnings.

## Documentation and asset policy

The README will permit derived GLBs built from source models contained in this repository. It will continue to prohibit imported models, generated geometry, and new texture artwork unless a later project decision changes that rule.

The architecture guide will describe the offline compiler, committed outputs, regeneration command, 27-tile catalog, and 29-request loading total. It will also identify `js/gltf/` as the extraction source and `js/clusters/` as the runtime asset directory.

The repository contains one MIT license and no separate asset-license file. Before publishing redistributed derivatives outside this repository, the maintainer should confirm the original model provenance.

## Non-goals

- Runtime procedural tile assembly.
- A general-purpose level editor or recipe UI.
- Arbitrary rotations, scaling, or generated geometry.
- New models, textures, animations, roads, or traffic behavior.
- Compression formats that require new browser decoders.
- Replacing or removing any of the 15 current tiles.
