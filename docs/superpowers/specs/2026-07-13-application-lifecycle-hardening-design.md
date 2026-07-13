# Application Lifecycle Hardening Design

## Goal

Make each Endless City application instance own and release its loaded assets, and make WebGL context recovery bounded and terminal-safe, while addressing the final low-risk review findings without changing the visual asset set.

## Asset ownership

`loadAssetCatalog()` will no longer retain a module-scoped promise. Each `startApp()` call invokes it once and receives a catalog owned by that application instance. This preserves one load per startup while ensuring a later restart receives fresh prototypes rather than objects disposed by a previous instance.

`AssetCatalog` will expose an idempotent `dispose()` method. Disposal traverses the unique road, building, and vehicle prototype roots, collecting unique `BufferGeometry`, `Material`, and material-owned `Texture` instances. Each resource is disposed exactly once even when fallbacks, clones, or multiple meshes share it. After disposal, `cloneBuilding()` and `cloneVehicle()` throw a clear disposed-catalog error so stale prototypes cannot be reused.

`startApp()` retains the catalog after acquisition. Every teardown route—explicit disposal, page hide, animation-frame failure, and setup failure after loading—disposes the catalog once before disposing the scene context. Setup failure before catalog acquisition still disposes only the context. Existing controller and listener cleanup remains idempotent.

## WebGL recovery state machine

Recovery uses three states: `healthy`, `waiting`, and `terminal`, plus a context-loss count scoped to the application lifetime.

- The first `webglcontextlost` event prevents default, pauses the loop, shows the restoring overlay, and starts an exported 10,000 ms restoration timer.
- A restore while `waiting` clears the timer, returns to `healthy`, restores either loading or ready UI, and resumes the loop when bootstrap has completed.
- Expiry of the first timer or any second loss transitions once to `terminal`. Terminal transition pauses the loop, clears the timer, removes recovery listeners, and calls the existing error overlay so its reload Retry remains available.
- Once terminal, late restore, asset-progress, and bootstrap-completion events cannot hide the error or resume rendering.
- Normal disposal clears the restoration timer and recovery listeners idempotently.

The terminal error retains application resources until the user reloads or page teardown runs. This keeps the existing Retry interaction alive while preventing a damaged context from rendering again.

## Minor correctness and coverage work

The same consolidated pass will make the following isolated changes:

- `consumeFixedSteps()` rejects non-finite or non-positive `stepSeconds` before division.
- `diffTileWindow()` becomes CityView's single assignment-diff implementation and orders coordinates numerically by X then Z, including mixed signed coordinates.
- Intersection safety tests cover every east/west by north/south pairing.
- Quality tests cover the exact 768 px, 1200 px, and DPR 2 boundaries on both sides.
- Asset tests cover required-request failure, optional fallback behavior, distinct clones that share prototype resources, deduplicated disposal, restart loading, and progress callbacks that throw. Progress notification exceptions are isolated from successful loader results.
- Scene shadows use `THREE.PCFShadowMap` to match the current Three.js fallback without a deprecation warning.
- Root CSS no longer forces a 320 px minimum width.
- `.gitignore` ignores `node_modules/`, `dist/`, `.codex-http.*`, and `.superpowers/` while leaving existing files untouched.
- Durable plans and the ignored acceptance report are updated to match the final evidence and commit history.

The Vite chunk-size advisory remains visible and unchanged.

## Testing and acceptance

All production behavior is implemented test-first. Focused tests must demonstrate the red state before each implementation group and cover shared-resource disposal, idempotence, stale-catalog rejection, fresh restart catalogs, timeout escalation, restore followed by a second loss, late-restore suppression, timer/listener cleanup, numeric tile ordering, fixed-step validation, intersection direction pairs, quality boundaries, and asset failure/progress isolation.

After focused green runs, the complete gate is:

```powershell
bun run typecheck
bun run test
bun run build
git diff --check
```

A production-preview browser smoke must confirm ordinary ready state. Where browser tooling can dispatch trusted-enough synthetic context events, it must also confirm restoring, recovery, and terminal Retry behavior; otherwise the automated integration tests are the authoritative recovery evidence and the browser limitation is reported explicitly.

## Non-goals

- Cross-application asset sharing, leasing, or reference counting.
- New assets, dependencies, or visual redesign.
- Hiding or raising the Vite chunk-size warning threshold.
- Attempting to reconstruct GPU resources after a terminal context-recovery failure.
