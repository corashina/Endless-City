# Scene Atmosphere and Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present Endless City as a clean scene with exceptional-state feedback only, damped camera motion, brighter daylight, and five bounded low-poly clouds.

**Architecture:** Keep MapControls and atmosphere configuration in `src/rendering/scene.ts`, reduce `OverlayController` to blocking states, and add a focused `CloudLayer` rendering adapter with a five-object logical-position pool. `src/app.ts` will pass the existing logical camera/render origin into the cloud layer and own its lifecycle.

**Tech Stack:** TypeScript 7, Three.js r185, MapControls, Vitest 4 with jsdom, Vite 8, Bun.

## Global Constraints

- Keep loading, WebGL recovery, fatal-error text, and Retry visible only while the scene is unavailable.
- Remove the title, help panel, help toggle, statistics toggle, and FPS display from the document and runtime.
- Preserve the 36-degree polar angle, 45-degree azimuth, 100–125 distance limits, disabled rotation, enabled pan/zoom, and existing touch mappings.
- Set MapControls `enableDamping` to `true` and `dampingFactor` to `0.08`.
- Use background/fog `0xd7e5ee`, directional light `0xfff1cf` at intensity `1.6`, and hemisphere light `0xe7f2ff`/`0xb9aa8f` at intensity `1.25`.
- Own exactly five cloud groups, initially 42–58 units high and at least 70 horizontal units from the camera target.
- Wrap clouds outside 210 units back to a 190-unit opposite edge with a stable perpendicular offset.
- Clouds must share one geometry and one material, cast/receive no shadows, and add no external assets, post-processing, dependencies, or network requests.
- Preserve bounded city/traffic pools, render-origin behavior, acceptance snapshots, and idempotent cleanup.

---

## File structure

- Modify `index.html`: retain the canvas and reduced exceptional-state status markup only.
- Modify `style.css`: keep full-screen canvas and blocking-status styling; remove ordinary interface styles.
- Modify `src/main.ts`: construct the reduced overlay without debug UI options.
- Modify `src/ui/overlay.ts`: own loading, recovery, error, Retry, and disposal only.
- Modify `src/rendering/scene.ts`: configure damping and the approved daylight palette.
- Create `src/rendering/cloud-layer.ts`: own cloud geometry, wrapping, render-origin projection, and disposal.
- Modify `src/app.ts`: create, update, and dispose the cloud layer; stop sampling visible FPS.
- Create `tests/interface.test.ts`: assert the static scene-only HTML contract.
- Modify `tests/overlay.test.ts`: test only exceptional overlay behavior.
- Modify `tests/scene-controls.test.ts`: verify damping without weakening locked controls.
- Modify `tests/city-view.test.ts`: verify the daylight graph and retained shadows.
- Create `tests/cloud-layer.test.ts`: verify fixed count, shared resources, wrapping, projection, and cleanup.
- Modify `tests/app.test.ts`: verify cloud-layer data flow and lifecycle.
- Modify `README.md`: describe the scene-only interaction and procedural atmosphere exception.
- Modify `docs/architecture.md`: document damping, exceptional UI, and bounded clouds.

### Task 1: Reduce the interface to exceptional states

**Files:**
- Create: `tests/interface.test.ts`
- Modify: `tests/overlay.test.ts`
- Modify: `index.html`
- Modify: `style.css`
- Modify: `src/ui/overlay.ts`
- Modify: `src/main.ts`
- Modify: `src/app.ts`
- Modify: `tests/app.test.ts`

**Interfaces:**
- Consumes: existing `OverlayController.showLoading`, `showReady`, `showError`, `showContextLost`, and `dispose` calls from `src/app.ts`.
- Produces: `OverlayOptions { retry?: () => void }` and an `OverlayController` with only those five public methods.

- [x] **Step 1: Write the failing static-interface and reduced-overlay tests**

Create `tests/interface.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('scene-only document', () => {
  it('keeps only the canvas and exceptional status controls', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

    expect(html).toContain('id="city-canvas"')
    expect(html).toContain('id="blocking-overlay"')
    expect(html).toContain('id="loading-status"')
    expect(html).toContain('id="error-panel"')
    expect(html).toContain('id="retry-button"')
    expect(html).not.toMatch(/id="(?:help-toggle|help-panel|statistics-toggle|fps-output)"/)
    expect(html).not.toMatch(/<header\b|<aside\b|<output\b/)
  })
})
```

Replace `tests/overlay.test.ts` with the reduced fixture and tests:

```ts
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverlayController } from '../src/ui/overlay'

function createFixture(): HTMLElement {
  document.body.innerHTML = `
    <div id="city-interface" data-state="loading">
      <section id="blocking-overlay">
        <p id="loading-status" role="status"></p>
        <div id="error-panel" hidden>
          <p id="error-message"></p>
          <button id="retry-button" type="button">Retry</button>
        </div>
      </section>
    </div>`
  return document.querySelector<HTMLElement>('#city-interface')!
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('OverlayController', () => {
  it('updates loading progress and hides the blocking overlay when ready', () => {
    const root = createFixture()
    const overlay = new OverlayController(root)

    overlay.showLoading(8, 17)
    expect(root.querySelector('#loading-status')?.textContent).toBe('Loading city 8/17')
    expect(root.dataset.state).toBe('loading')

    overlay.showReady()
    expect(root.querySelector<HTMLElement>('#blocking-overlay')?.hidden).toBe(true)
    expect(root.dataset.state).toBe('ready')
  })

  it('shows a readable error and retries through the supplied action', () => {
    const root = createFixture()
    const retry = vi.fn()
    const overlay = new OverlayController(root, { retry })

    overlay.showError(new Error('Road models could not be loaded.'))

    expect(root.querySelector('#error-message')?.textContent)
      .toBe('Road models could not be loaded.')
    expect(root.querySelector<HTMLElement>('#error-panel')?.hidden).toBe(false)
    expect(root.dataset.state).toBe('error')
    root.querySelector<HTMLButtonElement>('#retry-button')?.click()
    expect(retry).toHaveBeenCalledOnce()
  })

  it('falls back to a generic error message', () => {
    const root = createFixture()
    const overlay = new OverlayController(root)

    overlay.showError('   ')

    expect(root.querySelector('#error-message')?.textContent)
      .toBe('The city could not be loaded.')
  })

  it('shows restoration status after WebGL context loss', () => {
    const root = createFixture()
    const overlay = new OverlayController(root)

    overlay.showContextLost()

    expect(root.querySelector('#loading-status')?.textContent).toBe('Restoring the city…')
    expect(root.querySelector<HTMLElement>('#blocking-overlay')?.hidden).toBe(false)
    expect(root.dataset.state).toBe('restoring')
  })

  it('removes the retry listener exactly once', () => {
    const root = createFixture()
    const retry = vi.fn()
    const overlay = new OverlayController(root, { retry })

    overlay.dispose()
    overlay.dispose()
    root.querySelector<HTMLButtonElement>('#retry-button')?.click()

    expect(retry).not.toHaveBeenCalled()
  })
})
```

In `tests/app.test.ts`, remove `updateFps: vi.fn()` from `createOverlayHarness()` so the harness expresses the reduced contract.

- [x] **Step 2: Run focused tests to verify RED**

Run:

```powershell
bun run test -- tests/interface.test.ts tests/overlay.test.ts tests/app.test.ts
```

Expected: `tests/interface.test.ts` fails because ordinary interface IDs remain, and reduced overlay fixtures fail because `OverlayController` still requires help/statistics/FPS elements.

- [x] **Step 3: Implement the reduced HTML, overlay, bootstrap, and CSS**

Replace the `<body>` contents in `index.html` with:

```html
<body>
  <canvas id="city-canvas" aria-label="Interactive view of an endless city"></canvas>

  <div id="city-interface" class="city-interface" data-state="loading">
    <section id="blocking-overlay" class="blocking-overlay" aria-label="City status">
      <p id="loading-status" class="status-message" role="status">Loading city 0/17</p>
      <div id="error-panel" class="error-panel" role="alert" hidden>
        <h1>City unavailable</h1>
        <p id="error-message"></p>
        <button id="retry-button" class="retry-button" type="button">Retry</button>
      </div>
    </section>
  </div>

  <script type="module" src="/src/main.ts"></script>
</body>
```

Also change the existing head metadata to match the daylight canvas:

```html
<meta name="theme-color" content="#d7e5ee">
```

Replace `src/ui/overlay.ts` with:

```ts
export interface OverlayOptions {
  readonly retry?: () => void
}

const requiredElement = <ElementType extends Element>(
  root: ParentNode,
  selector: string,
): ElementType => {
  const element = root.querySelector<ElementType>(selector)
  if (element === null) throw new Error(`Missing overlay element: ${selector}`)
  return element
}

const errorText = (error: unknown): string => {
  if (error instanceof Error && error.message.trim() !== '') return error.message
  if (typeof error === 'string' && error.trim() !== '') return error
  return 'The city could not be loaded.'
}

export class OverlayController {
  private readonly blockingOverlay: HTMLElement
  private readonly loadingStatus: HTMLElement
  private readonly errorPanel: HTMLElement
  private readonly errorMessage: HTMLElement
  private readonly retryButton: HTMLButtonElement
  private readonly retry: () => void
  private disposed = false

  constructor(private readonly root: HTMLElement, options: OverlayOptions = {}) {
    this.blockingOverlay = requiredElement(root, '#blocking-overlay')
    this.loadingStatus = requiredElement(root, '#loading-status')
    this.errorPanel = requiredElement(root, '#error-panel')
    this.errorMessage = requiredElement(root, '#error-message')
    this.retryButton = requiredElement(root, '#retry-button')
    this.retry = options.retry ?? (() => window.location.reload())
    this.retryButton.addEventListener('click', this.retry)
  }

  showLoading(loaded: number, total: number): void {
    this.loadingStatus.textContent = `Loading city ${loaded}/${total}`
    this.loadingStatus.hidden = false
    this.errorPanel.hidden = true
    this.blockingOverlay.hidden = false
    this.root.dataset.state = 'loading'
  }

  showReady(): void {
    this.blockingOverlay.hidden = true
    this.root.dataset.state = 'ready'
  }

  showError(error: unknown): void {
    this.errorMessage.textContent = errorText(error)
    this.loadingStatus.hidden = true
    this.errorPanel.hidden = false
    this.blockingOverlay.hidden = false
    this.root.dataset.state = 'error'
    this.retryButton.focus()
  }

  showContextLost(): void {
    this.loadingStatus.textContent = 'Restoring the city…'
    this.loadingStatus.hidden = false
    this.errorPanel.hidden = true
    this.blockingOverlay.hidden = false
    this.root.dataset.state = 'restoring'
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.retryButton.removeEventListener('click', this.retry)
  }
}
```

In `src/main.ts`, construct the overlay without `debug`:

```ts
const overlay = new OverlayController(interfaceRoot, {
  retry: () => window.location.reload(),
})
```

In `src/app.ts`, delete the per-frame line:

```ts
elements.overlay?.updateFps(timestamp)
```

Replace `style.css` with focused scene/status styles:

```css
:root {
  color-scheme: light;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-synthesis: none;
  --ink: #151513;
  --panel: rgb(21 21 19 / 90%);
  --cream: #f2ead8;
  --muted: #c8c1b2;
  --line: rgb(242 234 216 / 24%);
  --accent: #d79a68;
}

* { box-sizing: border-box; }

html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: #d7e5ee;
}

[hidden] { display: none !important; }

#city-canvas {
  position: fixed;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}

.city-interface {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  color: var(--cream);
}

.blocking-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  min-height: 100dvh;
  padding: 1rem;
  background: rgb(21 21 19 / 72%);
  pointer-events: auto;
}

.status-message,
.error-panel {
  width: min(26rem, 100%);
  margin: 0;
  padding: 1rem 1.1rem;
  border: 1px solid var(--line);
  background: var(--panel);
}

.status-message {
  font-size: 0.875rem;
  text-align: center;
}

.error-panel h1 {
  margin: 0 0 0.3rem;
  font-size: 0.8rem;
  line-height: 1.2;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.error-panel p {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--muted);
  font-size: 0.8125rem;
  line-height: 1.5;
}

.retry-button {
  min-height: 2.5rem;
  margin-top: 1rem;
  padding: 0.55rem 1rem;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--ink);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 700;
  cursor: pointer;
}

.retry-button:focus-visible {
  outline: 3px solid var(--cream);
  outline-offset: 3px;
}

.retry-button:active { transform: translateY(1px); }
```

- [x] **Step 4: Run focused tests to verify GREEN**

Run:

```powershell
bun run test -- tests/interface.test.ts tests/overlay.test.ts tests/app.test.ts
```

Expected: all three test files pass; no overlay harness requires `updateFps`.

- [x] **Step 5: Commit the scene-only interface**

```powershell
git add index.html style.css src/main.ts src/ui/overlay.ts src/app.ts tests/interface.test.ts tests/overlay.test.ts tests/app.test.ts
git commit -m "feat: reduce interface to scene status"
```

### Task 2: Add damping and brighter daylight

**Files:**
- Modify: `tests/scene-controls.test.ts`
- Modify: `tests/city-view.test.ts`
- Modify: `src/rendering/scene.ts`

**Interfaces:**
- Consumes: existing `configureLockedLegacyCamera(controls)` and `createSceneGraph(profile, aspect)`.
- Produces: the same interfaces with `enableDamping`, `dampingFactor`, and the approved atmospheric values.

- [x] **Step 1: Extend controls and scene-graph tests**

In the first `configureLockedLegacyCamera` test in `tests/scene-controls.test.ts`, add:

```ts
expect(controls.enableDamping).toBe(true)
expect(controls.dampingFactor).toBe(0.08)
```

Replace the background/fog/light assertions in `tests/city-view.test.ts` with:

```ts
expect((graph.scene.background as THREE.Color).getHex()).toBe(0xd7e5ee)
expect(graph.scene.fog).toMatchObject({ near: 200, far: 300 })
expect((graph.scene.fog as THREE.Fog).color.getHex()).toBe(0xd7e5ee)
expect(graph.directionalLight.color.getHex()).toBe(0xfff1cf)
expect(graph.directionalLight.intensity).toBe(1.6)
expect(graph.hemisphereLight.color.getHex()).toBe(0xe7f2ff)
expect(graph.hemisphereLight.groundColor.getHex()).toBe(0xb9aa8f)
expect(graph.hemisphereLight.intensity).toBe(1.25)
```

Keep the existing camera, light-count, shadow-map, and `[-180, 180]` shadow-camera assertions in that test.

- [x] **Step 2: Run focused tests to verify RED**

Run:

```powershell
bun run test -- tests/scene-controls.test.ts tests/city-view.test.ts
```

Expected: failures show damping is disabled, the background/fog are black, and old neutral light values remain.

- [x] **Step 3: Configure damping and daylight**

Add the two damping properties to `LockedCameraControls` in `src/rendering/scene.ts`:

```ts
| 'enableDamping'
| 'dampingFactor'
```

Add these assignments before `controls.update()` in `configureLockedLegacyCamera()`:

```ts
controls.enableDamping = true
controls.dampingFactor = 0.08
```

Replace the atmosphere and light construction in `createSceneGraph()` with:

```ts
const scene = new THREE.Scene()
scene.background = new THREE.Color(0xd7e5ee)
scene.fog = new THREE.Fog(0xd7e5ee, FOG_NEAR, FOG_FAR)

const camera = new THREE.PerspectiveCamera(40, aspect, 1, 500)
camera.position.set(10, 100, 10)

const directionalLight = new THREE.DirectionalLight(0xfff1cf, 1.6)
directionalLight.position.set(-300, 750, -300)
```

Keep the existing directional shadow configuration, then replace hemisphere-light creation with:

```ts
const hemisphereLight = new THREE.HemisphereLight(0xe7f2ff, 0xb9aa8f, 1.25)
```

- [x] **Step 4: Run focused tests to verify GREEN**

Run:

```powershell
bun run test -- tests/scene-controls.test.ts tests/city-view.test.ts
```

Expected: both files pass, including all pre-existing locked-angle, zoom-clamp, viewport, and shadow tests.

- [x] **Step 5: Commit damping and daylight**

```powershell
git add src/rendering/scene.ts tests/scene-controls.test.ts tests/city-view.test.ts
git commit -m "feat: smooth controls and brighten daylight"
```

### Task 3: Build the bounded low-poly cloud layer

**Files:**
- Create: `tests/cloud-layer.test.ts`
- Create: `src/rendering/cloud-layer.ts`

**Interfaces:**
- Consumes: `THREE.Scene`, `WorldPoint`, and the render-origin equation `local = logical - origin`.
- Produces: `CLOUD_COUNT`, `CLOUD_CLEAR_RADIUS`, `CLOUD_WRAP_RADIUS`, `wrapCloudPosition(position, camera, index)`, `CloudLayerController`, `CloudLayer`, and `createCloudLayer(scene)`.

- [x] **Step 1: Write cloud geometry, wrapping, projection, and disposal tests**

Create `tests/cloud-layer.test.ts`:

```ts
import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import {
  CLOUD_CLEAR_RADIUS,
  CLOUD_COUNT,
  CLOUD_WRAP_RADIUS,
  CloudLayer,
  wrapCloudPosition,
} from '../src/rendering/cloud-layer'

describe('wrapCloudPosition', () => {
  it('retains clouds inside the outer boundary', () => {
    expect(wrapCloudPosition({ x: 200, z: 0 }, { x: 0, z: 0 }, 0))
      .toEqual({ x: 200, z: 0 })
  })

  it('wraps an escaped cloud to the opposite edge with a stable offset', () => {
    expect(wrapCloudPosition({ x: 211, z: 0 }, { x: 0, z: 0 }, 0))
      .toEqual({ x: -190, z: -30 })
  })
})

describe('CloudLayer', () => {
  it('creates five dispersed groups with shared resources and no shadows', () => {
    const scene = new THREE.Scene()
    const layer = new CloudLayer(scene)
    const meshes = layer.root.children.flatMap((group) => group.children) as THREE.Mesh[]

    expect(CLOUD_COUNT).toBe(5)
    expect(CLOUD_CLEAR_RADIUS).toBe(70)
    expect(CLOUD_WRAP_RADIUS).toBe(210)
    expect(layer.root.parent).toBe(scene)
    expect(layer.root.children).toHaveLength(5)
    expect(layer.root.children.map((group) => group.children.length)).toEqual([4, 3, 4, 3, 4])
    expect(new Set(meshes.map((mesh) => mesh.geometry)).size).toBe(1)
    expect(new Set(meshes.map((mesh) => mesh.material)).size).toBe(1)
    expect(meshes.every((mesh) => !mesh.castShadow && !mesh.receiveShadow)).toBe(true)
    for (const cloud of layer.root.children) {
      const logical = cloud.userData.logicalPosition as { x: number; z: number }
      expect(Math.hypot(logical.x, logical.z)).toBeGreaterThanOrEqual(70)
      expect(cloud.position.y).toBeGreaterThanOrEqual(42)
      expect(cloud.position.y).toBeLessThanOrEqual(58)
    }
  })

  it('wraps around the logical camera and projects through the render origin', () => {
    const layer = new CloudLayer(new THREE.Scene())

    layer.update({ x: 500, z: 0 }, { x: 480, z: -120 })

    for (const cloud of layer.root.children) {
      const logical = cloud.userData.logicalPosition as { x: number; z: number }
      expect(Math.hypot(logical.x - 500, logical.z)).toBeLessThanOrEqual(210)
      expect(cloud.position.x).toBeCloseTo(logical.x - 480, 10)
      expect(cloud.position.z).toBeCloseTo(logical.z + 120, 10)
    }
  })

  it('removes its root and disposes shared resources exactly once', () => {
    const scene = new THREE.Scene()
    const layer = new CloudLayer(scene)
    const firstMesh = layer.root.children[0]!.children[0] as THREE.Mesh
    const geometryDispose = vi.spyOn(firstMesh.geometry, 'dispose')
    const materialDispose = vi.spyOn(firstMesh.material as THREE.Material, 'dispose')

    layer.dispose()
    layer.dispose()

    expect(layer.root.parent).toBeNull()
    expect(geometryDispose).toHaveBeenCalledOnce()
    expect(materialDispose).toHaveBeenCalledOnce()
  })
})
```

- [x] **Step 2: Run the focused test to verify RED**

Run:

```powershell
bun run test -- tests/cloud-layer.test.ts
```

Expected: FAIL because `src/rendering/cloud-layer.ts` does not exist.

- [x] **Step 3: Implement the fixed cloud pool**

Create `src/rendering/cloud-layer.ts`:

```ts
import * as THREE from 'three'
import type { WorldPoint } from '../city/types'

export const CLOUD_COUNT = 5
export const CLOUD_CLEAR_RADIUS = 70
export const CLOUD_WRAP_RADIUS = 210
const CLOUD_REENTRY_RADIUS = 190

const INITIAL_CLOUDS = [
  { position: { x: -150, z: -90 }, height: 46, scale: 0.9 },
  { position: { x: -110, z: 160 }, height: 54, scale: 1.02 },
  { position: { x: 95, z: -165 }, height: 43, scale: 0.86 },
  { position: { x: 165, z: 90 }, height: 58, scale: 1.08 },
  { position: { x: 10, z: 200 }, height: 50, scale: 0.95 },
] as const

const LOBES = [
  { position: [-7, 0, 0], scale: [8, 3.8, 5] },
  { position: [0, 1.5, 0], scale: [10, 5, 6] },
  { position: [8, 0, 1], scale: [7, 3.5, 4.5] },
  { position: [2, 0, -4], scale: [7, 3, 4] },
] as const

export function wrapCloudPosition(
  position: WorldPoint,
  camera: WorldPoint,
  index: number,
): WorldPoint {
  const x = position.x - camera.x
  const z = position.z - camera.z
  const distance = Math.hypot(x, z)
  if (distance <= CLOUD_WRAP_RADIUS) return { ...position }

  const unitX = x / distance
  const unitZ = z / distance
  const perpendicularOffset = (index * 37) % 61 - 30
  return {
    x: camera.x - unitX * CLOUD_REENTRY_RADIUS - unitZ * perpendicularOffset,
    z: camera.z - unitZ * CLOUD_REENTRY_RADIUS + unitX * perpendicularOffset,
  }
}

export interface CloudLayerController {
  update(logicalCamera: WorldPoint, origin: WorldPoint): void
  dispose(): void
}

export class CloudLayer implements CloudLayerController {
  readonly root = new THREE.Group()
  private readonly geometry = new THREE.IcosahedronGeometry(1, 1)
  private readonly material = new THREE.MeshLambertMaterial({ color: 0xf6f5ef })
  private readonly clouds: Array<{
    readonly group: THREE.Group
    logicalPosition: WorldPoint
    readonly height: number
  }>
  private disposed = false

  constructor(scene: THREE.Scene) {
    this.root.name = 'cloud-layer'
    this.clouds = INITIAL_CLOUDS.map((cloud, index) => {
      const group = new THREE.Group()
      group.name = `cloud-${index}`
      group.scale.setScalar(cloud.scale)
      for (const lobe of LOBES.slice(0, index % 2 === 0 ? 4 : 3)) {
        const mesh = new THREE.Mesh(this.geometry, this.material)
        mesh.position.set(...lobe.position)
        mesh.scale.set(...lobe.scale)
        mesh.castShadow = false
        mesh.receiveShadow = false
        group.add(mesh)
      }
      this.root.add(group)
      return {
        group,
        logicalPosition: { ...cloud.position },
        height: cloud.height,
      }
    })
    scene.add(this.root)
    this.update({ x: 0, z: 0 }, { x: 0, z: 0 })
  }

  update(logicalCamera: WorldPoint, origin: WorldPoint): void {
    if (this.disposed) return
    for (const [index, cloud] of this.clouds.entries()) {
      cloud.logicalPosition = wrapCloudPosition(cloud.logicalPosition, logicalCamera, index)
      cloud.group.userData.logicalPosition = { ...cloud.logicalPosition }
      cloud.group.position.set(
        cloud.logicalPosition.x - origin.x,
        cloud.height,
        cloud.logicalPosition.z - origin.z,
      )
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.root.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
  }
}

export const createCloudLayer = (scene: THREE.Scene): CloudLayerController =>
  new CloudLayer(scene)
```

- [x] **Step 4: Run focused tests to verify GREEN**

Run:

```powershell
bun run test -- tests/cloud-layer.test.ts
```

Expected: all cloud tests pass with 5 groups, 18 meshes, one geometry, one material, correct wrapping/projection, and once-only disposal.

- [x] **Step 5: Commit the cloud layer**

```powershell
git add src/rendering/cloud-layer.ts tests/cloud-layer.test.ts
git commit -m "feat: add bounded low-poly clouds"
```

### Task 4: Integrate clouds, update documentation, and verify the experience

**Files:**
- Modify: `tests/app.test.ts`
- Modify: `src/app.ts`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/superpowers/plans/2026-07-14-scene-atmosphere-and-controls.md`

**Interfaces:**
- Consumes: `createCloudLayer(scene): CloudLayerController`, `CloudLayerController.update(logicalCamera, origin)`, and `dispose()` from Task 3.
- Produces: a `StartAppDependencies.createCloudLayer` seam and production per-frame/lifecycle integration.

- [x] **Step 1: Write the failing application integration test**

Add this test inside `describe('owned application lifecycle', ...)` in `tests/app.test.ts`:

```ts
it('updates clouds from camera state and disposes them exactly once', async () => {
  const canvas = document.createElement('canvas')
  const scene = createRunnableScene()
  const cloudLayer = { update: vi.fn(), dispose: vi.fn() }
  const createCloudLayer = vi.fn(() => cloudLayer)
  let frame: FrameRequestCallback | undefined
  const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
    .mockImplementation((callback) => {
      frame = callback
      return 101
    })
  const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
    .mockImplementation(() => undefined)

  const handle = await startApp({ canvas }, {
    createScene: () => scene.context,
    loadAssetCatalog: async () => createRunnableCatalog(),
    createCloudLayer,
  })
  frame?.(0)

  expect(createCloudLayer).toHaveBeenCalledWith(scene.context.scene)
  expect(cloudLayer.update).toHaveBeenCalledWith(
    { x: 10, z: 10 },
    { x: 0, z: 0 },
  )

  handle.dispose()
  handle.dispose()
  expect(cloudLayer.dispose).toHaveBeenCalledOnce()
  requestAnimationFrame.mockRestore()
  cancelAnimationFrame.mockRestore()
})
```

- [x] **Step 2: Run the integration test to verify RED**

Run:

```powershell
bun run test -- tests/app.test.ts
```

Expected: TypeScript/Vitest collection fails because `createCloudLayer` is not yet a `StartAppDependencies` property.

- [x] **Step 3: Wire cloud creation, frame updates, and disposal into the app**

Add this import in `src/app.ts`:

```ts
import {
  createCloudLayer as createCloudLayerView,
  type CloudLayerController,
} from './rendering/cloud-layer'
```

Extend `StartAppDependencies`:

```ts
export interface StartAppDependencies {
  readonly createScene: typeof createSceneContext
  readonly loadAssetCatalog: typeof loadAssets
  readonly createCloudLayer: typeof createCloudLayerView
}
```

Near the existing `assets` lifecycle variables, add:

```ts
let cloudLayer: CloudLayerController | undefined
```

Replace `disposeResources()` with cloud-first, exception-safe cleanup while preserving asset-before-scene order:

```ts
const disposeResources = (): void => {
  const currentCloudLayer = cloudLayer
  cloudLayer = undefined
  try {
    currentCloudLayer?.dispose()
  } finally {
    if (assets === undefined || assetsDisposed) {
      disposeContext()
      return
    }
    assetsDisposed = true
    try {
      assets.dispose()
    } finally {
      disposeContext()
    }
  }
}
```

Immediately after `CityView` construction, create the cloud layer:

```ts
const cityView = new CityView(context.scene, loadedAssets, profile)
cloudLayer = (dependencies.createCloudLayer ?? createCloudLayerView)(context.scene)
const activeCloudLayer = cloudLayer
```

Immediately after `currentCameraState = cameraState` in the frame function, add:

```ts
activeCloudLayer.update(cameraState.logicalCamera, cameraState.origin)
```

Keep `cloudLayer` itself for outer lifecycle cleanup; `activeCloudLayer` is the non-optional frame-loop reference.

- [x] **Step 4: Run integration and full automated verification**

Run:

```powershell
bun run test -- tests/app.test.ts tests/cloud-layer.test.ts
bun run typecheck
bun run test
bun run build
git diff --check
```

Expected: focused tests pass; typecheck passes; all test files pass; production build succeeds with only the established chunk-size advisory; `git diff --check` prints nothing.

- [x] **Step 5: Update user and architecture documentation**

Replace the `README.md` Explore list with:

```markdown
## Explore

- Mouse: drag to move and scroll to zoom. Movement eases to a stop, and the viewing angle stays fixed.
- Touch: drag with one finger to move; pinch or drag with two fingers to move and zoom.
- Presentation: once loading completes, the canvas is the entire interface. Loading, recovery, and Retry appear only when the scene is unavailable.
```

Replace the `src/ui/` project-structure line with:

```markdown
- `src/ui/` — loading, recovery, and failure states shown only while the scene is unavailable.
```

Replace the README asset-constraint paragraph with:

```markdown
The city and vehicle visuals continue to use the existing files in `js/clusters/`. The only runtime-generated visual is the bounded five-cloud low-poly atmosphere built from shared Three.js primitives; it adds no image, texture, model, or network asset. `preview.png` remains the project preview.
```

In `docs/architecture.md`, add a `Bounded atmosphere` section after Quality profiles:

```markdown
## Bounded atmosphere

`src/rendering/cloud-layer.ts` owns exactly five low-poly cloud groups. All lobes share one geometry and one material and do not participate in shadow maps. Each cloud keeps a logical X/Z position; the layer wraps clouds beyond 210 units to the opposite 190-unit edge and projects them with `logical - render origin`. Long-distance travel therefore retains sparse parallax clouds without unbounded allocation or floating-point growth.

`src/rendering/scene.ts` configures a shared blue-grey background/fog palette, warm directional sunlight, stronger hemisphere fill, and MapControls damping. The fixed 36-degree polar angle, 45-degree azimuth, input mappings, and distance limits remain unchanged.
```

Replace the final sentence of the Error and application lifecycle section with:

```markdown
Loading progress, WebGL recovery, and fatal errors use the blocking status overlay. The title, help, and visible performance controls are absent, so the ready state contains only the canvas; `?debug=1` keeps its programmatic acceptance hook without adding ordinary UI.
```

- [ ] **Step 6: Run the production browser smoke check**

Run:

```powershell
bun run build
bun run dev -- --host 127.0.0.1
```

Use browser automation at desktop `1440×900` and mobile `390×844` to verify:

- loading disappears into a canvas-only ready state;
- drag and zoom coast briefly after release and settle without changing the locked angle;
- background/fog and city faces are lighter while shadows remain legible;
- five clouds are sparse, small, and avoid a permanent central cluster;
- sustained panning across multiple origin shifts keeps clouds present without central popping;
- no help, statistics, or FPS controls appear, including with `?debug=1`;
- context-loss/failure tests remain covered by automation, and the normal browser console has no errors or warnings.

Stop the development server after verification.

- [x] **Step 7: Record evidence and commit the integration**

Mark completed checkboxes in this plan, then run:

```powershell
git add src/app.ts tests/app.test.ts README.md docs/architecture.md docs/superpowers/plans/2026-07-14-scene-atmosphere-and-controls.md
git commit -m "feat: integrate endless city atmosphere"
git status --short
```

Expected: the commit succeeds and the final status is clean.
