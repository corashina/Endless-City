# Compiler diagnostics review fixes

Date: 2026-07-14

## Scope

- Wrapped each known per-placement source load/extraction/copy path with recipe ID, module ID, source filename, and exact node name while retaining the original `Error` as `cause`.
- Kept unknown-module errors outside that wrapper.
- Added measured X/Z min/max bounds and the allowed `[-10, 30]` envelope to staged out-of-bounds errors.
- Added validator coverage for prop-building overlap, allowed prop-prop overlap, duplicate recipe IDs, and approved recipe-ID ordering.
- Added raw GLB JSON checks proving that buffer and image `uri` fields are absent.

No recipe, catalog, generated asset, or runtime behavior was changed.

## TDD evidence

### Test seam baseline

`validateStagedGlb()` was exported without changing its implementation so its existing behavior could be tested directly.

Command: `bun run test -- tests/generated-tiles.test.ts`

Result: exit 0; 1 file passed, 4 tests passed.

### RED

Command: `bun run test -- tests/tile-compiler.test.ts`

Result: exit 1; 3 failed, 1 passed.

Expected failures:

- source load error was only `source read failed`, without recipe/module/source/node context;
- node lookup error lacked recipe/module context and was not wrapped with a cause;
- bounds error was only `generated geometry is outside the plot`, without measured bounds or envelope.

The passing control proved the existing unknown-module error remained direct.

### GREEN

Command: `bun run test -- tests/tile-compiler.test.ts tests/tile-recipes.test.ts tests/tile-source-assets.test.ts tests/generated-tiles.test.ts`

Result: exit 0; 4 files passed, 18 tests passed.

## Verification

- `bun run typecheck` — exit 0 (`tsc --noEmit`).
- `bun run tiles:build` — exit 0; all 12 GLBs rebuilt, from 88,280 to 325,776 bytes each.
- `git status --short -- js/clusters` — no generated asset diff.
- `bun run test` — exit 0; 22 files passed, 162 tests passed.
- `bun run build` — exit 0; TypeScript and Vite production build passed. Vite retained its existing informational warning for a minified chunk over 500 kB.
- `git diff --check` — exit 0.
