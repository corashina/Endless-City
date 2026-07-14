# Traffic Turn Orientation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep every vehicle model facing its direction of travel throughout intersection turns, including south-authored roots whose 180-degree yaw decomposes across multiple Euler axes.

**Architecture:** `TrafficView` will preserve each cloned model's complete authored quaternion. On every sync it will pre-multiply that quaternion by one world-space yaw derived from the native direction and interpolated route heading. The traffic simulation and route geometry remain unchanged.

**Tech Stack:** TypeScript, Three.js r185, Vitest 4, Bun, Vite

## Global Constraints

- Preserve route geometry, simulation state, speeds, spawning, reservations, and collision behavior.
- Do not rewrite or normalize `js/clusters/cars.gltf`.
- Reuse scratch Three.js objects during `TrafficView.sync`; do not allocate a quaternion per vehicle per frame.
- Preserve the user-owned unstaged `.gitignore` change.

---

### Task 1: Compose route yaw with the complete authored orientation

**Files:**
- Modify: `tests/traffic-view.test.ts`
- Modify: `src/rendering/traffic-view.ts`

**Interfaces:**
- Consumes: `headingForDirection(direction: Direction): number`, `shortestAngleDelta(from: number, to: number): number`, `movementPoseAt(movement: PlannedMovement, distance: number): VehiclePose`
- Produces: `TrafficView.sync(vehicles, origin, alpha)` with quaternion-based orientation composition; no new public production API

- [ ] **Step 1: Add independent authored-orientation test helpers**

In `tests/traffic-view.test.ts`, import `movementPoseAt`, `Direction`, and `Maneuver`. Add direction vectors and an authored quaternion helper. The south case must use the affected Euler decomposition instead of a Y-axis quaternion.

```ts
import {
  headingForDirection,
  movementPoseAt,
  planMovement,
  poseForVehicle,
  shortestAngleDelta,
} from '../src/traffic/routing'
import type { Direction, Maneuver, VehicleState } from '../src/traffic/types'

const WORLD_UP = new THREE.Vector3(0, 1, 0)
const LOCAL_NOSE = new THREE.Vector3(0, 0, 1)
const DIRECTIONS: readonly Direction[] = ['east', 'west', 'north', 'south']
const MANEUVERS: readonly Maneuver[] = ['left', 'right']

const vectorForDirection = (direction: Direction): THREE.Vector3 => {
  switch (direction) {
    case 'east': return new THREE.Vector3(1, 0, 0)
    case 'west': return new THREE.Vector3(-1, 0, 0)
    case 'north': return new THREE.Vector3(0, 0, 1)
    case 'south': return new THREE.Vector3(0, 0, -1)
  }
}

const authoredQuaternionFor = (direction: Direction): THREE.Quaternion => {
  if (direction === 'south') {
    return new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-Math.PI, 0, -Math.PI),
    )
  }
  return new THREE.Quaternion().setFromAxisAngle(
    WORLD_UP,
    Math.PI / 2 - headingForDirection(direction),
  )
}
```

Change `createCatalog` so a test can configure each cloned root while existing tests retain their current defaults:

```ts
function createCatalog(
  configureClone: (clone: THREE.Group, id: string) => void = (clone, id) => {
    clone.position.y = id === 'replacement' ? 5 : 3
    clone.rotation.set(0.1, 0.2, 0.3)
    clone.scale.set(2, 3, 4)
  },
): { catalog: AssetCatalog; cloneCounts: Map<string, number> } {
  const cloneCounts = new Map<string, number>()
  return {
    cloneCounts,
    catalog: {
      road: new THREE.Group(),
      buildings: new Map(),
      vehiclePrototypes: [],
      vehicleMetadata: [],
      vehiclesByDirection: new Map(),
      cloneBuilding() {
        return null
      },
      cloneVehicle(id) {
        cloneCounts.set(id, (cloneCounts.get(id) ?? 0) + 1)
        const clone = new THREE.Group()
        clone.name = id
        configureClone(clone, id)
        return clone
      },
      dispose() {},
    },
  }
}
```

Replace exact Euler-array preservation assertions with quaternion equivalence where the test checks authored rotation:

```ts
const authoredQuaternion = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0.1, 0.2, 0.3),
)
expect(firstClone.quaternion.angleTo(authoredQuaternion)).toBeCloseTo(0, 10)
expect(replacement.quaternion.angleTo(authoredQuaternion)).toBeCloseTo(0, 10)
```

- [ ] **Step 2: Write the failing direction and turn regressions**

Add a table-driven test for all 16 native and route direction combinations:

```ts
const orientationCases = DIRECTIONS.flatMap(nativeDirection =>
  DIRECTIONS.map(routeDirection => [nativeDirection, routeDirection] as const))

it.each(orientationCases)(
  'faces %s-authored vehicle along a %s route',
  (nativeDirection, routeDirection) => {
    const scene = new THREE.Scene()
    const { catalog } = createCatalog((clone) => {
      clone.quaternion.copy(authoredQuaternionFor(nativeDirection))
    })
    const state = vehicle({
      prototypeId: `car-${nativeDirection}`,
      nativeDirection,
      lane: { direction: routeDirection, line: 0 },
    })
    const view = new TrafficView(scene, catalog, [state])

    view.sync([state], { x: 0, z: 0 }, 1)

    const worldNose = LOCAL_NOSE.clone().applyQuaternion(view.root.children[0]!.quaternion)
    expect(worldNose.dot(vectorForDirection(routeDirection))).toBeCloseTo(1, 10)
  },
)
```

Add tangent-alignment coverage for all eight left and right movements:

```ts
const turnCases = DIRECTIONS.flatMap(direction =>
  MANEUVERS.map(maneuver => [direction, maneuver] as const))

it.each(turnCases)(
  'keeps a %s-authored vehicle aligned through its %s turn',
  (incomingDirection, maneuver) => {
    const movement = planMovement(
      { direction: incomingDirection, line: 0 },
      incomingDirection === 'east' || incomingDirection === 'north' ? -31 : 9,
      maneuver,
      5,
    )
    const state = vehicle({
      prototypeId: `car-${incomingDirection}`,
      nativeDirection: incomingDirection,
      lane: movement.incomingLane,
      turn: { movement, distance: 0 },
    })
    const scene = new THREE.Scene()
    const { catalog } = createCatalog((clone) => {
      clone.quaternion.copy(authoredQuaternionFor(incomingDirection))
    })
    const view = new TrafficView(scene, catalog, [state])

    for (let index = 0; index <= 64; index += 1) {
      state.turn!.distance = movement.length * index / 64
      view.sync([state], { x: 0, z: 0 }, 1)
      const pose = movementPoseAt(movement, state.turn!.distance)
      const expectedTangent = new THREE.Vector3(
        Math.cos(pose.heading),
        0,
        Math.sin(pose.heading),
      )
      const worldNose = LOCAL_NOSE.clone()
        .applyQuaternion(view.root.children[0]!.quaternion)
      expect(worldNose.dot(expectedTangent)).toBeCloseTo(1, 10)
    }
  },
)
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```powershell
bun run test -- tests/traffic-view.test.ts
```

Expected: FAIL for south-authored vehicles on east or west headings. The failing dot product must be close to `-1` while the expected value is `1`. If a syntax or fixture error appears, fix the test and rerun until it fails for the orientation defect.

- [ ] **Step 4: Preserve and compose the complete authored quaternion**

In `src/rendering/traffic-view.ts`, replace the Y-only slot state with the complete quaternion and one reusable route-yaw quaternion:

```ts
const WORLD_UP = new THREE.Vector3(0, 1, 0)

interface VehicleSlot {
  prototypeId: string
  object: THREE.Object3D
  baseQuaternion: THREE.Quaternion
}

export class TrafficView {
  readonly root = new THREE.Group()

  private readonly slots: VehicleSlot[]
  private readonly routeYaw = new THREE.Quaternion()
```

Replace the rotation assignment in `sync`:

```ts
const slotState = this.slots[index]!
const yaw = shortestAngleDelta(
  pose.heading,
  headingForDirection(vehicle.nativeDirection),
)
this.routeYaw.setFromAxisAngle(WORLD_UP, yaw)
object.quaternion.copy(slotState.baseQuaternion).premultiply(this.routeYaw)
```

Capture the authored quaternion in `createSlot`:

```ts
private createSlot(prototypeId: string): VehicleSlot {
  const object = this.assets.cloneVehicle(prototypeId) ?? new THREE.Group()
  return {
    prototypeId,
    object,
    baseQuaternion: object.quaternion.clone(),
  }
}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
bun run test -- tests/traffic-view.test.ts tests/routing.test.ts
```

Expected: PASS for both test files. The 16 direction pairs and all eight sampled turns must pass.

- [ ] **Step 6: Run complete verification**

Run each command:

```powershell
bun run test -- --exclude ".worktrees/**" --maxWorkers=2
bun run typecheck
bun run build
git diff --check
```

Expected: all tests pass; TypeScript reports no errors; Vite completes the production build; `git diff --check` reports no whitespace errors. The existing Vite warning for a chunk larger than 500 kB is non-blocking.

- [ ] **Step 7: Commit the fix**

Stage only the implementation and test files, then commit:

```powershell
git add -- src/rendering/traffic-view.ts tests/traffic-view.test.ts
git commit -m "fix: preserve vehicle orientation through turns"
```
