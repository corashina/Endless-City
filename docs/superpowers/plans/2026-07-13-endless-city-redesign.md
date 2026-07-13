# Endless City Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed-board demo with a deterministic, endlessly streamed city and a fixed-step lane traffic simulation while reusing every existing visual asset.

**Architecture:** Pure TypeScript city and traffic modules own logical state and have no Three.js dependency. Rendering adapters pool cloned building and vehicle views around a recentered local origin, while the unbounded logical camera remains stable. A small DOM overlay reports loading, help, diagnostics, and recoverable failures.

**Tech Stack:** Vite, TypeScript in strict mode, current Three.js, Vitest, plain HTML, and CSS.

## Global Constraints

- Reuse the existing files under `js/clusters/`; add no 3D models, images, icons, textures, or other visual assets.
- Use a 60-unit logical city block.
- Use deterministic building selection for positive and negative coordinates.
- High quality uses a 9 by 9 tile window and 49 vehicles; balanced uses 7 by 7 and 32; mobile uses 7 by 7 and 20.
- Traffic advances in fixed 1/60-second steps and rendering interpolates between steps.
- Cars travel straight in four directions; turning, pedestrians, traffic lights, saved worlds, multiplayer, procedural geometry, and day/night cycles are excluded.
- A car inside the visible or fog-transition region must never be recycled.
- Keep simulation coordinates independent of Three.js object positions and camera recentering.
- Preserve the unrelated `.codex-http.err` and `.codex-http.log` files without staging them.

## File map

- `package.json`, `bun.lock`, `tsconfig.json`: build, test, and strict type-check configuration.
- `index.html`, `style.css`: semantic canvas shell and minimal accessible overlay.
- `src/config.ts`: block, seed, fog, timing, and quality-profile constants.
- `src/city/types.ts`: shared logical coordinate and tile types.
- `src/city/hash.ts`: deterministic integer hashing.
- `src/city/layout.ts`: weighted building selection and rotation.
- `src/city/tile-window.ts`: visible coordinate sets and pool assignment diffs.
- `src/city/origin.ts`: logical/render coordinate conversion and recenter shifts.
- `src/traffic/types.ts`: directions, lanes, vehicle state, prototype metadata, and configuration.
- `src/traffic/lanes.ts`: lane geometry and intersection calculations.
- `src/traffic/following.ts`: longitudinal acceleration, braking, and non-overlap.
- `src/traffic/intersections.ts`: deterministic conflict-zone reservations.
- `src/traffic/spawning.ts`: initial population and hidden recycling.
- `src/traffic/simulation.ts`: complete fixed-step traffic update.
- `src/rendering/quality.ts`: stable device quality selection.
- `src/rendering/assets.ts`: GLTF loading, validation, prototypes, cloning, and fallbacks.
- `src/rendering/scene.ts`: Three.js renderer, camera, lights, fog, resize, and context state.
- `src/rendering/city-view.ts`: road and pooled building views.
- `src/rendering/traffic-view.ts`: vehicle view pool and interpolation.
- `src/camera/controller.ts`: MapControls integration and render-origin shifts.
- `src/ui/overlay.ts`: loading, help, stats, and error state transitions.
- `src/app.ts`, `src/main.ts`: lifecycle coordination and bootstrap.
- `tests/*.test.ts`: pure unit tests and existing-asset contract tests.
- `README.md`, `docs/legacy-audit.md`, `docs/architecture.md`: user and maintainer documentation.

---

### Task 1: Toolchain and deterministic layout core

**Files:**
- Create: `package.json`
- Create: `bun.lock`
- Create: `tsconfig.json`
- Create: `src/config.ts`
- Create: `src/city/types.ts`
- Create: `src/city/hash.ts`
- Create: `src/city/layout.ts`
- Create: `tests/layout.test.ts`

**Interfaces:**
- Produces: `GridCoordinate`, `BuildingId`, `TileChoice`, `hashCoordinates(seed, x, z, salt)`, and `chooseTile(coordinate, seed)`.
- Consumes: existing building filenames in `js/clusters/`.

- [x] **Step 1: Install the modern runtime and test dependencies**

Run:

```powershell
bun init -y
bun add three
bun add -d @types/three @types/node jsdom typescript vite vitest
```

Expected: `package.json` and `bun.lock` exist and `bun pm ls` lists `three`, `jsdom`, `typescript`, `vite`, and `vitest`.

- [x] **Step 2: Configure strict scripts and TypeScript**

Set these scripts in `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "noEmit": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "types": ["vitest/globals", "node"]
  },
  "include": ["src", "tests"]
}
```

- [x] **Step 3: Write failing deterministic-layout tests**

Create `tests/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BUILDING_CATALOG, chooseTile } from '../src/city/layout'

describe('chooseTile', () => {
  it('returns the same tile for the same signed coordinate', () => {
    expect(chooseTile({ x: -81, z: 144 }, 0x5eedc17)).toEqual(
      chooseTile({ x: -81, z: 144 }, 0x5eedc17),
    )
  })

  it('uses only existing unique building assets and quarter turns', () => {
    const ids = new Set(BUILDING_CATALOG.map((entry) => entry.id))
    expect(ids.size).toBe(15)
    for (let x = -20; x <= 20; x += 1) {
      const tile = chooseTile({ x, z: x * -3 }, 0x5eedc17)
      expect(ids.has(tile.building)).toBe(true)
      expect([0, 1, 2, 3]).toContain(tile.rotation)
    }
  })

  it('does not collapse negative coordinates onto positive ones', () => {
    const positive = Array.from({ length: 16 }, (_, x) => chooseTile({ x, z: 7 }, 0x5eedc17))
    const negative = Array.from({ length: 16 }, (_, x) => chooseTile({ x: -x - 1, z: -7 }, 0x5eedc17))
    expect(negative).not.toEqual(positive)
  })

  it('is independent of coordinate visitation order', () => {
    const coordinates = [{ x: 2, z: 9 }, { x: -8, z: 1 }, { x: 44, z: -31 }]
    const forward = new Map(coordinates.map((coordinate) => [JSON.stringify(coordinate), chooseTile(coordinate, 0x5eedc17)]))
    const reverse = new Map([...coordinates].reverse().map((coordinate) => [JSON.stringify(coordinate), chooseTile(coordinate, 0x5eedc17)]))
    expect(reverse).toEqual(forward)
  })

  it('keeps landmarks rarer than common residential tiles', () => {
    const counts = new Map<string, number>()
    for (let x = -25; x < 25; x += 1) for (let z = -25; z < 25; z += 1) {
      const id = chooseTile({ x, z }, 0x5eedc17).building
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    expect(counts.get('stadium') ?? 0).toBeLessThan(counts.get('house') ?? 0)
    expect(counts.size).toBe(15)
  })
})
```

- [x] **Step 4: Run the test and confirm the red state**

Run: `bun run test -- tests/layout.test.ts`

Expected: FAIL because `src/city/layout.ts` does not exist.

- [x] **Step 5: Implement constants, types, hashing, and weighted selection**

Create `src/config.ts`:

```ts
export const BLOCK_SIZE = 60
export const WORLD_SEED = 0x5eedc17
export const FIXED_STEP_SECONDS = 1 / 60
export const MAX_FRAME_SECONDS = 0.1
export const FOG_NEAR = 200
export const FOG_FAR = 300
```

Create `src/city/types.ts`:

```ts
export interface GridCoordinate { readonly x: number; readonly z: number }
export interface WorldPoint { readonly x: number; readonly z: number }
export type QuarterTurn = 0 | 1 | 2 | 3
export type BuildingId =
  | 'apartments' | 'bus' | 'coffeeshop' | 'factory' | 'fastfood'
  | 'gas' | 'house' | 'house2' | 'house3' | 'park' | 'residence'
  | 'shoparea' | 'shops' | 'stadium' | 'supermarket'
export interface TileChoice { readonly building: BuildingId; readonly rotation: QuarterTurn }
export const coordinateKey = ({ x, z }: GridCoordinate): string => `${x}:${z}`
```

Create `src/city/hash.ts`:

```ts
export function hashCoordinates(seed: number, x: number, z: number, salt = 0): number {
  let value = seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(z, 0x85ebca77) ^ salt
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d)
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b)
  return (value ^ (value >>> 16)) >>> 0
}
```

Create `src/city/layout.ts` with a typed 15-entry catalog. Use weights `apartments: 8`, `bus: 2`, `coffeeshop: 5`, `factory: 3`, `fastfood: 5`, `gas: 3`, `house: 9`, `house2: 9`, `house3: 9`, `park: 8`, `residence: 8`, `shoparea: 5`, `shops: 6`, `stadium: 1`, and `supermarket: 4`. Select from the cumulative weight using `hashCoordinates(seed, x, z)`, and select rotation with salt `0x51f15e` modulo four. If the raw choice matches both the west and north raw choices, select once more with salt `0x1a2b3c4d` to reduce four-way repetition without generation-order state.

- [x] **Step 6: Verify and commit the layout core**

Run:

```powershell
bun run typecheck
bun run test -- tests/layout.test.ts
git add package.json bun.lock tsconfig.json src/config.ts src/city tests/layout.test.ts
git commit -m "feat: add deterministic city layout core"
```

Expected: typecheck passes, three layout tests pass, and the commit contains no visual assets.

---

### Task 2: Tile windows and render-origin invariants

**Files:**
- Create: `src/city/tile-window.ts`
- Create: `src/city/origin.ts`
- Create: `tests/tile-window.test.ts`
- Create: `tests/origin.test.ts`

**Interfaces:**
- Consumes: `GridCoordinate`, `WorldPoint`, `BLOCK_SIZE`, and `coordinateKey`.
- Produces: `desiredTileWindow(center, diameter)`, `diffTileWindow(current, desired)`, `logicalToRender(point, origin)`, and `recenterFrame(frame)`.

- [x] **Step 1: Write failing tile-window and origin tests**

Create tests that assert:

```ts
expect(desiredTileWindow({ x: 12, z: -8 }, 9)).toHaveLength(81)
expect(new Set(desiredTileWindow({ x: 12, z: -8 }, 9).map(coordinateKey)).size).toBe(81)
expect(() => desiredTileWindow({ x: 0, z: 0 }, 8)).toThrow('diameter must be a positive odd integer')
```

For a frame with local camera `(131, -121)`, local target `(120, -110)`, and origin `(600, -300)`, assert that `recenterFrame` returns local camera `(11, -1)`, local target `(0, 10)`, origin `(720, -420)`, and identical logical camera coordinates before and after the shift.

- [x] **Step 2: Confirm both test files fail**

Run: `bun run test -- tests/tile-window.test.ts tests/origin.test.ts`

Expected: FAIL because both modules are missing.

- [x] **Step 3: Implement window enumeration and pool diffs**

`desiredTileWindow` must enumerate from `-radius` through `+radius` on both axes. `diffTileWindow` accepts a `ReadonlyMap<string, GridCoordinate>` and desired coordinates, then returns `{ retainedKeys: string[]; releasedKeys: string[]; requested: GridCoordinate[] }` with each array sorted by coordinate key for deterministic tests.

- [x] **Step 4: Implement recentering in exact block multiples**

Create `src/city/origin.ts` with:

```ts
export interface RenderFrame {
  readonly localCamera: WorldPoint
  readonly localTarget: WorldPoint
  readonly origin: WorldPoint
}

export const logicalToRender = (point: WorldPoint, origin: WorldPoint): WorldPoint => ({
  x: point.x - origin.x,
  z: point.z - origin.z,
})

export const logicalCamera = (frame: RenderFrame): WorldPoint => ({
  x: frame.localCamera.x + frame.origin.x,
  z: frame.localCamera.z + frame.origin.z,
})
```

Use a 120-unit threshold. On each axis beyond it, shift by `Math.round(local / BLOCK_SIZE) * BLOCK_SIZE`; subtract the shift from camera and target and add it to origin. Do not alter an axis inside the threshold.

- [x] **Step 5: Verify repeated travel stays bounded and commit**

Add a loop test applying 2,000 camera movements and asserting `Math.abs(localCamera.x) <= 120`, logical movement is preserved, and an unchanged 9 by 9 window still contains 81 entries.

Run all tests and commit:

```powershell
bun run test
git add src/city/tile-window.ts src/city/origin.ts tests/tile-window.test.ts tests/origin.test.ts
git commit -m "feat: add bounded tile windows and render origins"
```

---

### Task 3: Lane geometry from the existing road contract

**Files:**
- Create: `src/traffic/types.ts`
- Create: `src/traffic/lanes.ts`
- Create: `tests/lanes.test.ts`

**Interfaces:**
- Produces: `Direction`, `Lane`, `VehicleState`, `VehiclePrototypeMetadata`, `TrafficConfig`, `laneKey`, `positionOnLane`, `nextIntersection`, and `intersectionKey`.
- Consumes: `WorldPoint` and `BLOCK_SIZE`.

- [x] **Step 1: Write failing lane geometry tests**

Cover all four directions:

```ts
expect(positionOnLane({ direction: 'east', line: 0 }, 100)).toEqual({ x: 100, z: -16 })
expect(positionOnLane({ direction: 'west', line: 0 }, 100)).toEqual({ x: -100, z: -23 })
expect(positionOnLane({ direction: 'north', line: 0 }, 100)).toEqual({ x: -23, z: 100 })
expect(positionOnLane({ direction: 'south', line: 0 }, 100)).toEqual({ x: -16, z: -100 })
expect(nextIntersection({ direction: 'east', line: 2 }, 15).key).toBe('1:2')
```

The last expectation uses crossing centers at `index * 60 - 20`, so the first eastbound crossing after progress 15 is x=40.

- [x] **Step 2: Confirm the lane tests fail**

Run: `bun run test -- tests/lanes.test.ts`

Expected: FAIL because `src/traffic/lanes.ts` is missing.

- [x] **Step 3: Define exact traffic data types**

In `src/traffic/types.ts`, define:

```ts
export type Direction = 'east' | 'west' | 'north' | 'south'
export interface Lane { readonly direction: Direction; readonly line: number }
export interface VehiclePrototypeMetadata { readonly id: string; readonly length: number; readonly direction: Direction }
export interface VehicleState {
  readonly id: number
  prototypeId: string
  length: number
  lane: Lane
  previousProgress: number
  progress: number
  speed: number
  desiredSpeed: number
  active: boolean
  reservationKey: string | null
}
export interface TrafficConfig {
  readonly minimumGap: number
  readonly timeHeadway: number
  readonly maximumAcceleration: number
  readonly comfortableBraking: number
  readonly intersectionHalfExtent: number
  readonly reservationLookAhead: number
  readonly protectedRadius: number
  readonly simulationRadius: number
}
```

- [x] **Step 4: Implement lane positions and next crossings**

Use these authored offsets: east and south `-16`; west and north `-23`. Treat `progress` as always increasing: east maps to `x=progress`, west to `x=-progress`, north to `z=progress`, and south to `z=-progress`. Road crossing centers occur at `index * BLOCK_SIZE - 20` on both axes.

- [x] **Step 5: Verify and commit lane geometry**

Run `bun run typecheck` and `bun run test -- tests/lanes.test.ts`, then commit the three task files as `feat: model endless road lanes`.

---

### Task 4: Fixed-step following and non-overlap

**Files:**
- Create: `src/traffic/following.ts`
- Create: `tests/following.test.ts`

**Interfaces:**
- Consumes: `VehicleState`, `TrafficConfig`, and `laneKey`.
- Produces: `stepFollowing(vehicles, deltaSeconds, config, stopProgressByVehicle?)`.

- [x] **Step 1: Write failing safety tests**

Create one eastbound leader at progress 20 with length 4 and a follower at progress 12 with length 4. Assert that ten one-second steps never place the follower's front bumper beyond the leader's rear bumper. Add tests that a clear vehicle accelerates without exceeding desired speed and that identical simulations split into 60 or 120 render frames end at the same progress when both use 60 Hz traffic steps.

- [x] **Step 2: Confirm failure**

Run: `bun run test -- tests/following.test.ts`

Expected: FAIL because `stepFollowing` is missing.

- [x] **Step 3: Implement grouped following**

For each active lane group, sort by ascending progress. Calculate bumper gap as `leader.progress - follower.progress - (leader.length + follower.length) / 2`. Desired gap is `minimumGap + follower.speed * timeHeadway`. Accelerate by at most `maximumAcceleration * dt`; brake by at most `comfortableBraking * dt`. Clamp the proposed progress so the bumper gap cannot become negative. An optional stop progress participates as a zero-speed virtual leader.

- [x] **Step 4: Add the fixed-step accumulator helper**

In the same module export:

```ts
export interface FixedStepResult { readonly steps: number; readonly alpha: number; readonly accumulator: number }
export function consumeFixedSteps(
  accumulator: number,
  frameSeconds: number,
  stepSeconds: number,
  maximumFrameSeconds: number,
  step: () => void,
): FixedStepResult
```

Clamp frame time, call `step` while the accumulator contains a complete fixed step, and return the remaining fraction as `alpha`.

- [x] **Step 5: Verify and commit**

Run all tests and commit `src/traffic/following.ts` plus its test as `feat: add frame-independent vehicle following`.

---

### Task 5: Deterministic intersection reservations

**Files:**
- Create: `src/traffic/intersections.ts`
- Create: `tests/intersections.test.ts`

**Interfaces:**
- Consumes: vehicle positions derived by `positionOnLane`, `nextIntersection`, and `TrafficConfig`.
- Produces: `IntersectionReservations`, `updateIntersectionReservations(vehicles, reservations, config)`, and `intersectionStops`.

- [x] **Step 1: Write failing perpendicular-conflict tests**

Create an eastbound and northbound vehicle approaching the same crossing in the same update. Assert that the lower stable vehicle id receives the reservation, the other receives a stop progress before the conflict zone, and only one vehicle can occupy the zone. Add a test that the reservation is released after the holder's rear bumper leaves the zone.

- [x] **Step 2: Confirm failure**

Run: `bun run test -- tests/intersections.test.ts`

Expected: FAIL because the reservation module is absent.

- [x] **Step 3: Implement request ordering and lifecycle**

Represent reservations as `Map<string, number>` from intersection key to vehicle id. Collect requests only within `reservationLookAhead`. Sort requests by distance to the stop line, then stable vehicle id. Preserve a valid existing reservation until the holder's rear bumper exits `intersectionHalfExtent`. Produce a `Map<number, number>` of virtual stop progress for rejected requests.

- [x] **Step 4: Integrate reservations with following in the test**

Run reservations first, pass returned virtual stops to `stepFollowing`, and simulate 600 fixed steps. Assert at every step that perpendicular vehicles are not simultaneously inside the same conflict zone.

- [x] **Step 5: Verify and commit**

Run all tests and commit as `feat: prevent traffic conflicts at intersections`.

---

### Task 6: Deterministic spawning, hidden recycling, and complete simulation

**Files:**
- Create: `src/traffic/spawning.ts`
- Create: `src/traffic/simulation.ts`
- Create: `tests/spawning.test.ts`
- Create: `tests/simulation.test.ts`

**Interfaces:**
- Consumes: lane geometry, prototype metadata, following, reservations, camera `WorldPoint`, and seed.
- Produces: `createTrafficPool(input)`, `recycleTraffic(input)`, `TrafficSimulation`, `TrafficSimulation.step(dt, camera)`, and `TrafficSimulation.vehicles`.

- [x] **Step 1: Write failing pool and recycling tests**

Assert that counts 49, 32, and 20 are created exactly; each pool includes four directions; all same-lane bumper gaps meet `minimumGap`; and the same seed produces the same state. Place one vehicle inside `protectedRadius` and one outside `simulationRadius`; assert only the outside vehicle is reassigned.

- [x] **Step 2: Confirm failure**

Run: `bun run test -- tests/spawning.test.ts tests/simulation.test.ts`

Expected: FAIL because spawning and simulation modules are absent.

- [x] **Step 3: Implement deterministic pool creation**

Choose directions, nearby lane lines, prototypes matching each direction, desired speeds from 8 through 13 units per second, and progress slots using `hashCoordinates`. Reject occupied candidates until both front and rear minimum gaps pass. Use stable vehicle ids from zero through `count - 1`.

- [x] **Step 4: Implement protected recycling**

Measure vehicle logical positions against the camera. Do nothing inside `simulationRadius`. Beyond it, search deterministic spawn candidates on the far side of the buffered area. Accept only candidates beyond `protectedRadius` and outside current minimum gaps. If no candidate succeeds after 32 attempts, set `active=false` and retry on a later step.

- [x] **Step 5: Compose `TrafficSimulation`**

Each `step` must copy `progress` to `previousProgress`, update/release intersection reservations, calculate virtual stops, run following, then recycle. Expose reservations read-only for diagnostics. Never store a Three.js object.

- [x] **Step 6: Run a long deterministic regression and commit**

Simulate 36,000 fixed steps while moving the camera across 500 blocks. Assert a constant pool length, finite numeric fields, no following overlap, no shared intersection zone, and no active vehicle beyond `simulationRadius + BLOCK_SIZE * 2`.

Run all tests and commit as `feat: add bounded deterministic traffic simulation`.

---

### Task 7: Quality profiles and asset contracts

**Files:**
- Create: `src/rendering/quality.ts`
- Create: `src/rendering/assets.ts`
- Create: `tests/quality.test.ts`
- Create: `tests/assets.test.ts`

**Interfaces:**
- Consumes: `BuildingId`, `Direction`, `VehiclePrototypeMetadata`, and existing cluster files.
- Produces: `QualityProfile`, `chooseQualityProfile(input)`, `AssetCatalog`, `loadAssetCatalog(onProgress)`, `cloneBuilding(id)`, and `cloneVehicle(id)`.

- [x] **Step 1: Write quality and disk-contract tests**

Assert exact profile values:

```ts
expect(chooseQualityProfile({ width: 1440, devicePixelRatio: 1 })).toMatchObject({ id: 'high', tileDiameter: 9, trafficCount: 49, maxPixelRatio: 1.5, shadowMapSize: 2048 })
expect(chooseQualityProfile({ width: 900, devicePixelRatio: 2 })).toMatchObject({ id: 'balanced', tileDiameter: 7, trafficCount: 32, maxPixelRatio: 1.25, shadowMapSize: 1024 })
expect(chooseQualityProfile({ width: 390, devicePixelRatio: 3 })).toMatchObject({ id: 'mobile', tileDiameter: 7, trafficCount: 20, maxPixelRatio: 1, shadowMapSize: 1024 })
```

In `tests/assets.test.ts`, assert every catalog GLB, `road.glb`, and `cars.gltf` exists. Parse `cars.gltf`, select scene-root nodes with extras, assert there are 49, and validate every `(x,z)` direction against the four accepted pairs.

Also test a pure `resolveBuildingFallbacks` helper: a failed non-park entry resolves to the loaded park prototype, a failed park resolves to `null`, and a failed vehicle collection resolves to an empty vehicle list. Test that progress reaches exactly 17 of 17 requests.

- [x] **Step 2: Confirm the quality module test fails while asset contracts pass**

Run: `bun run test -- tests/quality.test.ts tests/assets.test.ts`

Expected: quality test FAILS for a missing module; asset contract test PASSES.

- [x] **Step 3: Implement stable quality selection**

Select mobile below 768 CSS pixels, balanced from 768 through 1199 or when device pixel ratio exceeds 2, and high otherwise. Return an immutable profile object and select it once during bootstrap.

- [x] **Step 4: Implement one-time asset loading**

Use `GLTFLoader.loadAsync`. Load `road.glb`, all 15 unique building GLBs, and `cars.gltf` once. Traverse meshes to enable casting/receiving shadows. Extract vehicle roots, validate extras, map vectors to directions, zero each prototype's position while retaining its authored rotation and scale, and calculate length with `THREE.Box3`. Group vehicle prototypes by direction.

Progress must report `{ loaded: number; total: 17; url: string }`. Replace a failed building with a cloneable park prototype; if park fails, store `null` for that building. Return an empty vehicle list when the car collection fails. A failed road is fatal because it has no valid existing-asset substitute.

- [x] **Step 5: Verify and commit**

Run typecheck and all tests, then commit as `feat: load and validate existing city assets`.

---

### Task 8: Scene, camera, road, and building pool

**Files:**
- Create: `src/rendering/scene.ts`
- Create: `src/rendering/city-view.ts`
- Create: `src/camera/controller.ts`
- Create: `tests/city-view.test.ts`

**Interfaces:**
- Consumes: `AssetCatalog`, `QualityProfile`, tile layout/window functions, origin functions, and `MapControls`.
- Produces: `SceneContext`, `createScene(canvas, profile)`, `CameraController`, and `CityView.update(centerCell, origin)`.

- [x] **Step 1: Write a pool assignment test without WebGL**

Extract and test `planTileAssignments(currentAssignments, center, diameter)`. Starting empty at diameter 9 must request 81 entries. Moving one block east must retain 72, release 9, request 9, and keep 81 unique coordinate keys after reassignment.

- [x] **Step 2: Confirm failure**

Run: `bun run test -- tests/city-view.test.ts`

Expected: FAIL because `planTileAssignments` is missing.

- [x] **Step 3: Implement the scene context**

Create a `WebGLRenderer` with antialiasing and `powerPreference: 'high-performance'`, cap pixel ratio from the selected profile, set `outputColorSpace = THREE.SRGBColorSpace`, enable PCF soft shadows, and use black background with fog from 200 to 300. Use a 40-degree perspective camera with near 1 and far 500 at `(10, 100, 10)`. Configure one directional light and one hemisphere light; size the shadow map from the profile and keep the shadow camera within 180 units of the controls target.

- [x] **Step 4: Implement camera recentering**

Wrap `MapControls`. On update, call controls, convert camera/target x-z into a `RenderFrame`, apply `recenterFrame`, write shifted local positions back only when the origin changes, and return both logical camera position and origin. Preserve camera height and target height.

- [x] **Step 5: Implement pooled building views and road placement**

Add one road scene at the original alignment `(60, 0, 0)`. Create exactly `tileDiameter * tileDiameter` slots. For a quarter turn use angle and compensating plot offset: turn 0 `(0, 0, 0)`, turn 1 `(Math.PI / 2, 0, 20)`, turn 2 `(Math.PI, 20, 20)`, and turn 3 `(-Math.PI / 2, 20, 0)`. Reassign released slots, replace their child clone only when building id changes, and position each slot at `coordinate * 60 - origin` plus the rotation offset.

- [x] **Step 6: Verify and commit**

Run typecheck, tests, and build. Commit as `feat: stream deterministic building views`.

---

### Task 9: Vehicle views and application loop

**Files:**
- Create: `src/rendering/traffic-view.ts`
- Create: `src/app.ts`
- Create: `src/main.ts`
- Modify: `index.html`
- Create: `tests/traffic-view.test.ts`

**Interfaces:**
- Consumes: `TrafficSimulation`, `AssetCatalog`, scene, city view, camera controller, quality profile, and fixed-step accumulator.
- Produces: `TrafficView.sync(vehicles, origin, alpha)`, `startApp(elements)`, and browser bootstrap.

- [x] **Step 1: Write interpolation tests**

Test a pure `interpolatedVehiclePoint(vehicle, alpha)` helper. For progress 10 to 14, east must yield x values 10, 12, and 14 at alpha 0, 0.5, and 1. For south, verify progress interpolation is converted through `positionOnLane` and z decreases.

- [x] **Step 2: Confirm failure**

Run: `bun run test -- tests/traffic-view.test.ts`

Expected: FAIL because the helper is missing.

- [x] **Step 3: Implement the vehicle view pool**

Create one view per simulation slot using its prototype id. On sync, hide inactive slots; replace a clone only when prototype id changes; interpolate progress; convert with `positionOnLane`; subtract render origin; and write x-z while retaining the prototype's authored y, rotation, and scale.

- [x] **Step 4: Replace legacy script tags with the module entry**

Keep a single `<canvas id="city-canvas">` and `<script type="module" src="/src/main.ts"></script>`. Remove the six legacy script tags. Task 10 will add the overlay beside the canvas. Do not delete the existing asset files.

- [x] **Step 5: Compose the app loop**

Bootstrap quality, scene, assets, city view, traffic simulation, traffic view, and camera controller in that order. Each animation frame updates the camera, derives the center grid cell from logical position, updates the city view, consumes capped fixed traffic steps, syncs interpolated vehicle views, follows the shadow target, and renders. When `document.hidden` is true, skip accumulation and reset the previous timestamp.

- [x] **Step 6: Verify and commit**

Run typecheck, all tests, and production build. Start `bun run dev`, open the local page, and verify the scene loads with buildings and four-way traffic. Commit as `feat: integrate endless city rendering and traffic`.

---

### Task 10: Accessible overlay, loading, diagnostics, and recovery

**Files:**
- Modify: `index.html`
- Replace: `style.css`
- Create: `src/ui/overlay.ts`
- Modify: `src/app.ts`
- Create: `tests/overlay.test.ts`

**Interfaces:**
- Consumes: asset progress, fatal/nonfatal bootstrap errors, renderer context events, and frame timestamps.
- Produces: `OverlayController` with `showLoading`, `showReady`, `showError`, `showContextLost`, `updateFps`, and `dispose`.

- [x] **Step 1: Write state-transition tests**

Using a small DOM fixture, assert loading text updates to `Loading city 8/17`, ready state removes the blocking overlay, help opens and closes with `aria-expanded`, diagnostics stay hidden by default, an error shows its message and retry button, and context loss shows `Restoring the city…`.

- [x] **Step 2: Confirm failure**

Run: `bun run test -- tests/overlay.test.ts --environment jsdom`

Expected: FAIL because `OverlayController` is missing.

- [x] **Step 3: Add semantic overlay markup**

Include a compact title, help button, help panel with mouse and touch instructions, a statistics checkbox, loading status with `role="status"`, error panel with retry button, and hidden FPS output. Use text glyphs only; do not add icon files. All buttons need explicit `type="button"` and accessible names; the checkbox needs a visible label.

- [x] **Step 4: Replace the old CSS**

Use a system stack, full-screen canvas, translucent dark panels, high-contrast cream text, visible focus rings, responsive spacing, and `prefers-reduced-motion` to remove overlay transitions. The help panel must avoid covering the central scene and fit a 320-pixel viewport.

- [x] **Step 5: Implement overlay behavior and app recovery**

Connect actual asset progress. Auto-dismiss initial help after six seconds unless focused or hovered. Keep the help button available. Calculate FPS over one-second samples and reveal it only when `?debug=1` or the help-panel statistics toggle is enabled. On fatal load error, stop the loop and wire retry to `window.location.reload()`. On `webglcontextlost`, prevent default, pause, and show restoration state; on `webglcontextrestored`, resume and hide it. Display a readable unsupported-WebGL message when renderer construction fails.

- [x] **Step 6: Verify desktop and mobile behavior and commit**

Run tests and build. In the browser, verify 1280 by 720 and 390 by 844 viewports, keyboard focus, help recovery, debug stats, and mobile traffic. Commit as `feat: add resilient city interface`.

---

### Task 11: Documentation and full acceptance verification

**Files:**
- Replace: `README.md`
- Create: `docs/legacy-audit.md`
- Create: `docs/architecture.md`
- Modify: `docs/superpowers/plans/2026-07-13-endless-city-redesign.md` only to check completed boxes during execution.

**Interfaces:**
- Consumes: the completed application behavior, scripts, architecture, and verified runtime evidence.
- Produces: user-facing setup/controls and maintainer-facing rationale.

- [x] **Step 1: Rewrite the README**

Document the visual concept, mouse/touch controls, adaptive mobile traffic, prerequisites, `bun install`, `bun run dev`, `bun run typecheck`, `bun run test`, `bun run build`, static `dist/` deployment, project structure, existing-asset constraint, and license. Use the local `preview.png` in the preview section instead of a remote raw-GitHub URL.

- [x] **Step 2: Document the legacy audit**

Describe the wrong-axis z-boundary mutation, `x + 58` coordinate-space correction, all-car raycasts, frame-dependent speed, unreachable direction offsets, fixed board/camera teleports, repeated parsing, mobile traffic removal, obsolete gamma flags, and missing failure state. For each, name the replacement module and invariant.

- [x] **Step 3: Document the architecture**

Explain logical coordinates, 60-unit blocks, deterministic hashing, tile pooling, road alignment, render-origin shifts, vehicle prototype extraction, lane offsets, fixed-step following, intersection reservations, hidden recycling, quality profiles, and error lifecycle. Include a short data-flow diagram in Mermaid and list the non-goals.

- [x] **Step 4: Run the complete automated gate**

Run:

```powershell
bun run typecheck
bun run test
bun run build
git diff --check
```

Expected: zero type errors, all tests pass, Vite produces `dist/`, and Git reports no whitespace errors.

- [x] **Step 5: Run long-distance browser acceptance checks**

Verify all of the following in the running production build:

- Pan at least 100 blocks east, west, north, and south.
- Return to at least three recorded logical coordinates and confirm building identity/rotation is unchanged.
- Observe all four traffic directions for at least two minutes with no overlaps or visible recycling.
- Confirm building and vehicle object-pool counts remain fixed after long travel.
- Confirm origin shifts keep local camera coordinates bounded.
- Confirm 390-pixel mobile width renders 20 active vehicle slots and usable help UI.
- Confirm default UI has no FPS panel and `?debug=1` does.
- Confirm the browser console has no errors.

Authoritative evidence: one production page traveled by controls through all four far axes, revisited three deterministic tile windows, and completed a 122.149-second traffic observation with formal samples every 30 seconds. The interaction-safe recentering follow-up plan records the exact route and verification workflow.

- [x] **Step 6: Commit documentation and final verified state**

Run:

```powershell
git add README.md docs package.json bun.lock index.html style.css src tests
git status --short
git commit -m "docs: explain the endless city redesign"
```

Expected: only intentional project files are staged; `.codex-http.err` and `.codex-http.log` remain untracked.
