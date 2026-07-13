# Interaction-safe Recentring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve continuous MapControls panning across render-origin shifts while keeping render-local camera coordinates bounded immediately after each gesture.

**Architecture:** `CameraController` owns interaction-aware recentering. It listens to the controls' public `start` and `end` events, defers camera/target/origin mutation during an active gesture, and applies the normal whole-block recenter on the first update after the gesture ends. Controller disposal removes the listeners before Three.js scene resources are disposed.

**Tech Stack:** TypeScript 7, Three.js r185 MapControls/EventDispatcher, Vitest 4, Vite 8, Chrome production-preview acceptance.

## Global Constraints

- Do not access or mutate Three.js private `_panWorldStart`, `_plane`, or pointer state.
- Preserve ground-plane MapControls behavior (`screenSpacePanning === false`).
- Preserve deterministic city assignments and fixed 81-building/49-desktop-vehicle pools.
- Preserve whole-60-unit origin shifts and post-gesture local-axis bounds of `[-120, 120]`.
- Add no visual assets or dependencies.

---

### Task 1: Defer recentering during controls gestures

**Files:**
- Modify: `tests/city-view.test.ts`
- Modify: `src/camera/controller.ts`
- Modify: `src/app.ts`

**Interfaces:**
- Consumes: `MapControls` public `start`/`end` events and existing `recenterFrame(RenderFrame)`.
- Produces: `CameraController.update(): CameraState` with interaction-safe deferral and `CameraController.dispose(): void` listener cleanup.

- [x] **Step 1: Write the failing interaction test**

Add an `InteractionControlsHarness` extending `THREE.EventDispatcher<OrbitControlsEventMap>` with `target`, `updates`, and `update()`. Dispatch `start`, set the camera to `(131, 100, -121)`, call `update()`, and assert origin remains `(0, 0)` and camera/target are unchanged. Dispatch `end`, call `update()` again, and assert logical camera remains `(131, -121)`, origin becomes `(120, -120)`, camera becomes `(11, 100, -1)`, and target receives the same shift.

```ts
class InteractionControlsHarness extends THREE.EventDispatcher<OrbitControlsEventMap> {
  readonly target = new THREE.Vector3(120, 7, -110)
  updates = 0

  update(): void {
    this.updates += 1
  }
}

it('defers recentering until a controls gesture ends', () => {
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(131, 100, -121)
  const controls = new InteractionControlsHarness()
  const controller = new CameraController(camera, controls)

  controls.dispatchEvent({ type: 'start' })
  const activeState = controller.update()
  expect(activeState).toEqual({ logicalCamera: { x: 131, z: -121 }, origin: { x: 0, z: 0 } })
  expect(camera.position.toArray()).toEqual([131, 100, -121])
  expect(controls.target.toArray()).toEqual([120, 7, -110])

  controls.dispatchEvent({ type: 'end' })
  const endedState = controller.update()
  expect(endedState).toEqual({ logicalCamera: { x: 131, z: -121 }, origin: { x: 120, z: -120 } })
  expect(camera.position.toArray()).toEqual([11, 100, -1])
  expect(controls.target.toArray()).toEqual([0, 7, 10])
})
```

- [x] **Step 2: Write the failing disposal test**

Spy on `removeEventListener`, call `controller.dispose()`, and assert the exact registered `start` and `end` callbacks are removed. Dispatching `start` afterward must not defer a threshold-crossing recenter.

- [x] **Step 3: Run the focused test and verify red**

Run: `bun run test -- tests/city-view.test.ts`

Expected: FAIL because `CameraController` recenters during the active gesture and has no `dispose()` method.

- [x] **Step 4: Implement the minimal controller behavior**

Use a `Pick<MapControls, 'target' | 'update' | 'addEventListener' | 'removeEventListener'>` adapter. Register stable start/end callbacks in the constructor, choose the unrecentered frame while `interactionActive` is true, and unregister the callbacks in `dispose()`.

```ts
private interactionActive = false
private readonly handleInteractionStart = (): void => {
  this.interactionActive = true
}
private readonly handleInteractionEnd = (): void => {
  this.interactionActive = false
}

constructor(/* existing arguments */) {
  this.currentOrigin = { ...initialOrigin }
  controls.addEventListener('start', this.handleInteractionStart)
  controls.addEventListener('end', this.handleInteractionEnd)
}

const recentered = this.interactionActive ? frame : recenterFrame(frame)

dispose(): void {
  this.controls.removeEventListener('start', this.handleInteractionStart)
  this.controls.removeEventListener('end', this.handleInteractionEnd)
}
```

Call `cameraController.dispose()` at the start of the application's `disposeScene` callback.

- [x] **Step 5: Run focused and complete verification**

Run:

```powershell
bun run test -- tests/city-view.test.ts tests/app.test.ts
bun run typecheck
bun run test
bun run build
git diff --check
```

Expected: all focused tests, all test files, typecheck, build, and whitespace validation pass.

- [x] **Step 6: Commit the fix**

```powershell
git add src/camera/controller.ts src/app.ts tests/city-view.test.ts
git commit -m "fix: keep map panning continuous across recentering"
```

### Task 2: Repeat authoritative production acceptance

**Files:**
- Modify: `docs/superpowers/plans/2026-07-13-endless-city-redesign.md`
- Modify: `.superpowers/sdd/task-11-report.md` (ignored evidence artifact)

**Interfaces:**
- Consumes: the production build and debug acceptance snapshot.
- Produces: one authoritative Complete report with same-session control evidence and a checked Task 11 step 5.

- [x] **Step 1: Start one fresh production preview and page instance**

Build, serve `dist/` with Vite preview, open only `http://127.0.0.1:5199/?debug=1`, and record the origin snapshot. Do not navigate, reload, or use `acceptanceX`/`acceptanceZ` afterward.

- [x] **Step 2: Travel through all four far axes using MapControls**

Use wheel zoom and left-drag pan controls to reach X ≥ +6000, X ≤ -6000, Z ≥ +6000, and Z ≤ -6000. Capture intermediate snapshots after gestures. Every snapshot must show 81 building slots/assignments, 49 vehicle slots/active vehicles, all four directions, render origins in 60-unit multiples, and each local camera axis within `[-120, 120]` after the gesture.

- [x] **Step 3: Revisit three recorded logical tile windows**

Reverse/control-correct the route without navigation until three prior center grid coordinates reappear. Compare all 81 `{coordinate, buildingId, rotation}` assignments and require byte-identical signatures for each revisit.

- [x] **Step 4: Observe traffic uninterrupted for 120 seconds**

Keep the same page instance visible for a continuous 120 seconds. Visually inspect throughout and capture state at 0/30/60/90/120 seconds. Require no transient vehicle overlap, flicker, visible recycling, stall, or console error; each sample must retain the fixed pool counts and all directions.

- [x] **Step 5: Consolidate evidence and commit tracked plan state**

Rewrite `.superpowers/sdd/task-11-report.md` into one authoritative `Complete` report, removing stale Partial/unchecked/blocker statements and documenting the discovered mid-drag bug, fix, exact same-session coordinates, revisit comparisons, timed samples, console state, and verification commands. Check Task 11 step 5 only after all requirements pass.

```powershell
git diff --check
git add docs/superpowers/plans/2026-07-13-endless-city-redesign.md
git commit -m "docs: record same-session city acceptance"
```
