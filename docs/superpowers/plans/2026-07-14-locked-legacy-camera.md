# Locked Legacy Camera Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock Endless City to the original 36-degree polar and 45-degree diagonal camera composition while retaining bounded zoom and desktop/mobile panning.

**Architecture:** Add one exported MapControls configuration helper in `src/rendering/scene.ts` and call it before the controls' first update. The helper owns only view-composition constraints; `CameraController` continues to own logical coordinates and floating-origin recentering.

**Tech Stack:** TypeScript 7, Three.js r185 `MapControls`, Vitest 4 with jsdom, Vite 8.

## Global Constraints

- Use only the existing visual assets and dependencies.
- Polar angle is exactly `Math.PI / 5`.
- Azimuth angle is exactly `Math.PI / 4`.
- Camera-to-target distance remains between 100 and 125 world units.
- Rotation is disabled; pan and zoom remain enabled.
- One-finger touch pans; two-finger touch uses dolly-and-pan.
- Do not change floating-origin, traffic, fog, lighting, or asset behavior.

---

## File structure

- Modify `src/rendering/scene.ts`: define and apply the locked legacy MapControls configuration.
- Create `tests/scene-controls.test.ts`: verify exact constraints and real MapControls behavior without WebGL.
- Modify `docs/superpowers/plans/2026-07-14-locked-legacy-camera.md`: check completed steps as evidence is produced.

### Task 1: Configure and verify the locked legacy camera

**Files:**
- Modify: `src/rendering/scene.ts`
- Create: `tests/scene-controls.test.ts`
- Modify: `docs/superpowers/plans/2026-07-14-locked-legacy-camera.md`

**Interfaces:**
- Consumes: `THREE.TOUCH`, Three.js `MapControls`, and the existing `createScene()` construction path.
- Produces: `LOCKED_CAMERA_POLAR_ANGLE`, `LOCKED_CAMERA_AZIMUTH_ANGLE`, and `configureLockedLegacyCamera(controls: LockedCameraControls): void`.

- [ ] **Step 1: Write failing configuration and behavior tests**

Create `tests/scene-controls.test.ts` with jsdom so the real controls can attach to a canvas:

```ts
// @vitest-environment jsdom

import * as THREE from 'three'
import { MapControls } from 'three/addons/controls/MapControls.js'
import { afterEach, describe, expect, it } from 'vitest'
import {
  configureLockedLegacyCamera,
  LOCKED_CAMERA_AZIMUTH_ANGLE,
  LOCKED_CAMERA_POLAR_ANGLE,
} from '../src/rendering/scene'

const controlsToDispose: MapControls[] = []

const createControls = (): { camera: THREE.PerspectiveCamera; controls: MapControls } => {
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 1, 500)
  camera.position.set(10, 100, 10)
  const controls = new MapControls(camera, document.createElement('canvas'))
  controlsToDispose.push(controls)
  return { camera, controls }
}

afterEach(() => {
  while (controlsToDispose.length > 0) controlsToDispose.pop()?.dispose()
})

describe('configureLockedLegacyCamera', () => {
  it('applies the exact legacy angle, distance, input, and touch constraints', () => {
    const { controls } = createControls()

    configureLockedLegacyCamera(controls)

    expect(controls.minPolarAngle).toBe(LOCKED_CAMERA_POLAR_ANGLE)
    expect(controls.maxPolarAngle).toBe(LOCKED_CAMERA_POLAR_ANGLE)
    expect(controls.minAzimuthAngle).toBe(LOCKED_CAMERA_AZIMUTH_ANGLE)
    expect(controls.maxAzimuthAngle).toBe(LOCKED_CAMERA_AZIMUTH_ANGLE)
    expect(controls.minDistance).toBe(100)
    expect(controls.maxDistance).toBe(125)
    expect(controls.enableRotate).toBe(false)
    expect(controls.enablePan).toBe(true)
    expect(controls.enableZoom).toBe(true)
    expect(controls.touches).toEqual({
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_PAN,
    })
  })

  it('snaps to the legacy composition and preserves it through pan and distance clamps', () => {
    const { camera, controls } = createControls()
    configureLockedLegacyCamera(controls)

    expect(controls.getPolarAngle()).toBeCloseTo(Math.PI / 5, 10)
    expect(controls.getAzimuthalAngle()).toBeCloseTo(Math.PI / 4, 10)

    const pan = new THREE.Vector3(30, 0, -20)
    camera.position.add(pan)
    controls.target.add(pan)
    controls.update()
    expect(controls.getPolarAngle()).toBeCloseTo(Math.PI / 5, 10)
    expect(controls.getAzimuthalAngle()).toBeCloseTo(Math.PI / 4, 10)

    const viewDirection = camera.position.clone().sub(controls.target).normalize()
    camera.position.copy(controls.target).addScaledVector(viewDirection, 200)
    controls.update()
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(125, 10)

    camera.position.copy(controls.target).addScaledVector(viewDirection, 50)
    controls.update()
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(100, 10)
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
bun run test -- tests/scene-controls.test.ts
```

Expected: FAIL because the three locked-camera exports do not exist.

- [ ] **Step 3: Implement the minimal controls-layer configuration**

Add the constants, narrow adapter, and helper near the top of `src/rendering/scene.ts`:

```ts
export const LOCKED_CAMERA_POLAR_ANGLE = Math.PI / 5
export const LOCKED_CAMERA_AZIMUTH_ANGLE = Math.PI / 4

export type LockedCameraControls = Pick<
  MapControls,
  | 'minPolarAngle'
  | 'maxPolarAngle'
  | 'minAzimuthAngle'
  | 'maxAzimuthAngle'
  | 'minDistance'
  | 'maxDistance'
  | 'enableRotate'
  | 'enablePan'
  | 'enableZoom'
  | 'touches'
  | 'update'
>

export function configureLockedLegacyCamera(controls: LockedCameraControls): void {
  controls.minPolarAngle = LOCKED_CAMERA_POLAR_ANGLE
  controls.maxPolarAngle = LOCKED_CAMERA_POLAR_ANGLE
  controls.minAzimuthAngle = LOCKED_CAMERA_AZIMUTH_ANGLE
  controls.maxAzimuthAngle = LOCKED_CAMERA_AZIMUTH_ANGLE
  controls.minDistance = 100
  controls.maxDistance = 125
  controls.enableRotate = false
  controls.enablePan = true
  controls.enableZoom = true
  controls.touches.ONE = THREE.TOUCH.PAN
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN
  controls.update()
}
```

Replace the first standalone update in `createScene()`:

```ts
const controls = new MapControls(graph.camera, canvas)
configureLockedLegacyCamera(controls)
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
bun run test -- tests/scene-controls.test.ts tests/city-view.test.ts tests/app.test.ts
```

Expected: the new controls tests and existing camera/lifecycle tests pass.

- [ ] **Step 5: Run the complete automated gate**

Run:

```powershell
bun run typecheck
bun run test
bun run build
git diff --check
```

Expected: typecheck passes, all test files pass, the production build succeeds with only the established chunk-size advisory, and diff check prints nothing.

- [ ] **Step 6: Verify the production interaction**

Build and serve `dist`, then verify at desktop and mobile viewport sizes:

- the opening view is the 45-degree diagonal legacy composition;
- drag pans without changing polar or azimuth angles;
- wheel/pinch zoom remains within 100–125 units;
- one-finger touch pans rather than attempting rotation;
- traffic, floating-origin recentering, help UI, and responsive canvas remain operational;
- console contains no warnings or errors.

- [ ] **Step 7: Update evidence and commit**

Mark Steps 1–6 complete in this plan, inspect the final diff, and commit only the intended files:

```powershell
git add src/rendering/scene.ts tests/scene-controls.test.ts docs/superpowers/plans/2026-07-14-locked-legacy-camera.md
git commit -m "feat: lock the legacy camera angle"
```

Expected: the feature branch is clean after the commit.
