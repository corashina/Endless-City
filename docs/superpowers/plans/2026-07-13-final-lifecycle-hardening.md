# Final Lifecycle Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each app instance complete asset ownership, make WebGL recovery bounded and terminal-safe, and close the remaining low-risk review gaps.

**Architecture:** `AssetCatalog` becomes an app-owned disposable resource with no module cache. `startApp` owns its catalog and a three-state WebGL recovery state machine; existing pure utilities receive narrow validation and ordering fixes. All behavior changes are test-first and preserve the current assets and visual design.

**Tech Stack:** TypeScript 7, Three.js r185, Vitest 4 with jsdom/fake timers, Vite 8, Chrome production preview.

## Global Constraints

- Preserve every existing file under `js/clusters/`; add no assets or dependencies.
- Load one fresh catalog per application startup and dispose it before the scene context.
- Dispose shared geometry, material, and texture instances exactly once.
- Restoration deadline is exactly 10,000 ms; any second loss in one app lifetime is terminal.
- Terminal recovery must preserve the existing reload Retry and ignore all late restore/progress/bootstrap events.
- Do not hide or raise the Vite chunk-size advisory.
- Preserve `.codex-http.*`, `dist/`, `node_modules/`, and `.superpowers/` on disk while ignoring them.

---

### Task 1: App-owned asset catalogs

**Files:**
- Modify: `tests/assets.test.ts`
- Modify: `tests/app.test.ts`
- Modify: `src/rendering/assets.ts`
- Modify: `src/app.ts`

**Interfaces:**
- Produces: `AssetCatalog.dispose(): void`, an uncached `loadAssetCatalog(onProgress)`, and app teardown ordering `assets.dispose()` before `context.dispose()`.
- Consumes: existing GLTF prototypes, `SkeletonUtils.clone`, and `startOwnedLoop` teardown.

- [ ] **Step 1: Write failing catalog lifecycle tests**

Add tests that build road/building/vehicle prototypes whose meshes share one `BufferGeometry`, one `Material`, and one `Texture`. Spy on all three `dispose()` methods, dispose twice, and require each spy once. Require `cloneBuilding()` and `cloneVehicle()` to throw `Asset catalog has been disposed` afterward. Also prove two independently loaded catalogs make two 17-request loader passes and return different prototype roots.

- [ ] **Step 2: Write failing application ownership tests**

Extend `createRunnableCatalog()` with `dispose: vi.fn()`. Verify explicit/pagehide teardown calls catalog disposal once before scene disposal, repeated `handle.dispose()` remains idempotent, and an exception after catalog acquisition disposes both in the same order.

- [ ] **Step 3: Run focused tests and verify red**

Run:

```powershell
bun run test -- tests/assets.test.ts tests/app.test.ts
```

Expected: failures because `AssetCatalog.dispose` is missing, the module promise is reusable, and `startApp` does not own catalog teardown.

- [ ] **Step 4: Implement disposable uncached catalogs**

In `src/rendering/assets.ts`, add `dispose()` to `AssetCatalog`. Inside `createCatalog`, keep a `disposed` flag, reject both clone methods after disposal, traverse unique prototype roots, collect unique geometries/materials/textures in sets, then dispose textures, materials, and geometries once. Remove `catalogPromise`; `loadAssetCatalog()` directly calls `loadAssetCatalogWithLoader(new GLTFLoader(), onProgress)`.

In `src/app.ts`, retain the acquired catalog in outer scope and use one idempotent resource teardown that calls `assets?.dispose()` before `disposeContext()`. Invoke it from every owned-loop and bootstrap-failure path.

- [ ] **Step 5: Verify focused green**

Run the focused command again. Expected: all asset and app lifecycle tests pass with no unhandled errors.

---

### Task 2: Bounded terminal-safe WebGL recovery

**Files:**
- Modify: `tests/app.test.ts`
- Modify: `src/app.ts`

**Interfaces:**
- Produces: `CONTEXT_RESTORE_TIMEOUT_MS = 10_000` and recovery states `healthy | waiting | terminal`.
- Consumes: `AppHandle.pause/resume`, overlay `showContextLost/showLoading/showReady/showError`, and browser context events.

- [ ] **Step 1: Write the failing timeout test**

Use fake timers. After a first cancelable loss, require restoring state and a paused loop. Advance 9,999 ms and require no error; advance one millisecond and require one error whose message explains WebGL restoration failure. Dispatch a late restore and progress callback and require no `showReady`, new `showLoading`, or resumed frame.

- [ ] **Step 2: Write the failing repeated-loss test**

Dispatch loss, restore before 10 seconds, then a second loss. Require immediate `showError`, no second timer wait, and a late restore that cannot hide the error or resume. Dispose and require no pending timer or active recovery listener behavior.

- [ ] **Step 3: Run the focused app tests and verify red**

Run: `bun run test -- tests/app.test.ts`

Expected: timeout and second-loss tests fail because current recovery has only a boolean and always accepts restore.

- [ ] **Step 4: Implement the state machine**

Export the 10,000 ms constant. Track recovery state, lifetime loss count, and timer handle inside `startApp`. First loss enters `waiting`; timeout or any later loss calls one terminal transition that pauses, clears the timer, removes listeners, and reports the recovery error. Restore acts only from `waiting`. Asset progress and bootstrap completion update UI only outside `terminal`. Normal teardown clears timer/listeners idempotently.

- [ ] **Step 5: Verify focused green**

Run the focused app tests again. Expected: all recovery and existing bootstrap/lifecycle cases pass.

---

### Task 3: Utility correctness and coverage consolidation

**Files:**
- Modify: `tests/following.test.ts`
- Modify: `src/traffic/following.ts`
- Modify: `tests/tile-window.test.ts`
- Modify: `tests/city-view.test.ts`
- Modify: `src/city/tile-window.ts`
- Modify: `src/rendering/city-view.ts`
- Modify: `tests/intersections.test.ts`
- Modify: `tests/quality.test.ts`
- Modify: `tests/assets.test.ts`
- Modify: `src/rendering/assets.ts`

**Interfaces:**
- Produces: finite-positive fixed-step validation and numeric X-then-Z tile ordering through `diffTileWindow`.
- Preserves: existing traffic, quality, loader fallback, and clone semantics.

- [ ] **Step 1: Write failing fixed-step and tile-order tests**

Require `consumeFixedSteps` to throw for `0`, negative, `NaN`, and both infinities. Add mixed signed X/Z tile data whose lexicographic and numeric orders differ; expect numeric X then Z ordering. Update CityView planner coverage to assert it delegates to the same diff result.

- [ ] **Step 2: Run focused utility tests and verify red**

Run: `bun run test -- tests/following.test.ts tests/tile-window.test.ts tests/city-view.test.ts`

Expected: fixed-step invalid inputs and mixed-sign ordering fail.

- [ ] **Step 3: Implement validation and one tile diff**

Guard `stepSeconds` with `Number.isFinite(stepSeconds) && stepSeconds > 0`. In `tile-window.ts`, compare `GridCoordinate` values numerically by X then Z for retained, released, and requested entries. In CityView, remove the duplicate diff algorithm; build the current coordinate map and call `diffTileWindow(desiredTileWindow(...))`.

- [ ] **Step 4: Verify focused utility green**

Run the focused utility command again. Expected: all pass.

- [ ] **Step 5: Expand intersection and quality tables**

Parameterize conflict-zone simulation for east/north, east/south, west/north, and west/south approaches using direction-correct starting progress. Add quality cases at widths 767, 768, 1199, and 1200 plus DPR 2 and the smallest representable value above 2.

- [ ] **Step 6: Add asset failure/progress isolation tests before implementation**

Require a rejected road request to preserve its cause, rejected optional building and vehicle requests to use fallbacks, clone roots to be distinct while sharing prototype geometry/material, and a throwing progress callback not to reject otherwise successful loads.

- [ ] **Step 7: Run these tests and verify red where behavior is missing**

Run: `bun run test -- tests/intersections.test.ts tests/quality.test.ts tests/assets.test.ts`

Expected: progress-callback isolation fails before the implementation; table/failure tests validate or expose any remaining gaps.

- [ ] **Step 8: Isolate progress notification exceptions**

Wrap each progress notification in a narrow `try/catch` that ignores observer errors without changing the corresponding loader result. Do not catch loader failures or catalog validation errors.

- [ ] **Step 9: Verify the complete focused group**

Run all test files modified in Tasks 1–3. Expected: all pass.

---

### Task 4: Rendering, viewport, repository, and evidence hygiene

**Files:**
- Modify: `src/rendering/scene.ts`
- Modify: `style.css`
- Modify: `.gitignore`
- Modify: `docs/superpowers/plans/2026-07-13-final-lifecycle-hardening.md`
- Modify: `.superpowers/sdd/task-11-report.md` (ignored evidence artifact)

**Interfaces:**
- Produces: non-deprecated shadow selection, sub-320 px viewport support, clean ignored runtime artifacts, and accurate durable evidence.

- [ ] **Step 1: Apply mechanical hygiene changes**

Use `THREE.PCFShadowMap`, remove `min-width: 320px` from the root page rules, and add these ignore entries without deleting files:

```gitignore
node_modules/
dist/
.codex-http.*
.superpowers/
```

- [ ] **Step 2: Run the full automated gate**

Run:

```powershell
bun run typecheck
bun run test
bun run build
git diff --check
```

Expected: zero type errors, all tests pass, Vite emits `dist/`, whitespace passes, the chunk-size advisory remains visible, and the Three.js shadow deprecation warning is absent at runtime.

- [ ] **Step 3: Run production browser smoke**

Serve the current `dist/`, open the default production page, and require ready state, a rendered city, hidden debug FPS, and zero console errors. In a separate controlled page, dispatch context loss/restore if supported and verify restoring then ready; dispatch a second loss and verify terminal error with visible Retry that late restore cannot hide. If synthetic context events are unavailable, record that limitation and rely on the passing jsdom integration tests for recovery.

- [ ] **Step 4: Update evidence accurately**

Check every completed plan box and update the ignored Task 11 report commit list, final test counts, shadow-warning status, lifecycle fix, and browser-smoke result. Remove superseded warning claims.

- [ ] **Step 5: Commit coherent fixes**

Stage only intentional source, test, style, ignore, and durable documentation files. Leave ignored/generated files untouched. Commit with:

```powershell
git commit -m "fix: close application lifecycle gaps"
```
