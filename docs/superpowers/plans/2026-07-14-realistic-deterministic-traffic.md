# Realistic Deterministic Traffic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Execution record:** Tasks 1-6 are complete. Their unchecked steps are retained as the
historical TDD instructions; durable completion evidence is recorded in
`.superpowers/sdd/progress.md`, the per-task review reports, and Task 7 below.

**Goal:** Build dense deterministic traffic with varied drivers, balanced directions, smooth intersection turns, collision-safe movement corridors, and long-run visible-density guarantees.

**Architecture:** Extend the fixed-step lane simulation with stateless seeded randomness, focused routing and movement modules, per-driver following parameters, and atomic conflict-zone reservations. Keep one bounded vehicle pool and derive render position plus heading from simulation route state.

**Tech Stack:** TypeScript 7, Three.js r185, Vitest 4, Vite 8, Bun.

## Global Constraints

- Preserve deterministic results for a given world seed, camera path, quality profile, and fixed-step sequence.
- Use the existing vehicle and road assets; add no dependencies or runtime material mutation.
- Allocate exactly 72 high-quality, 48 balanced, and 28 mobile vehicle slots.
- Use base maneuver weights of 55% straight, 22.5% left, and 22.5% right; do not add U-turns.
- Keep the 300-unit protected radius and 420-unit simulation radius in production.
- Recycle no visible car; recycle an off-screen car after 12 seconds below 0.25 units/s.
- Keep simulation work bucketed by lane and intersection; do not add an all-pairs vehicle loop.
- Follow red-green-refactor for each behavior and retain the existing fixed 1/60-second step.

---

## File structure

- Create `src/traffic/random.ts`: stateless seeded scalar generation, driver traits, and maneuver selection.
- Create `src/traffic/routing.ts`: outgoing-lane arithmetic, turn curves, route poses, and heading helpers.
- Create `src/traffic/movements.ts`: swept conflict zones and atomic movement reservations.
- Modify `src/traffic/types.ts`: driver, route, pose, reservation, and timeout state.
- Modify `src/traffic/lanes.ts`: expose authored offsets and lane-progress conversion needed by routing.
- Modify `src/traffic/following.ts`: personal gaps, stopping-distance prediction, and route-aware advancement.
- Modify `src/traffic/spawning.ts`: balanced directions, varied safe starts, visible-route candidates, and stalled-car recycling.
- Modify `src/traffic/simulation.ts`: route decisions, movement lifecycle, reservations, and diagnostic counts.
- Modify `src/rendering/traffic-view.ts`: interpolate world position and heading through turns.
- Modify `src/rendering/quality.ts` and `src/app.ts`: new pool sizes and traffic configuration.
- Modify `tests/lanes.test.ts`, `tests/following.test.ts`, `tests/intersections.test.ts`, `tests/spawning.test.ts`, `tests/simulation.test.ts`, `tests/traffic-view.test.ts`, `tests/quality.test.ts`, and `tests/app.test.ts`.
- Create `tests/random.test.ts`, `tests/routing.test.ts`, and `tests/movements.test.ts` for the new focused modules.
- Modify `README.md` and `docs/architecture.md` after behavior passes.

### Task 1: Add stateless randomness and driver traits

**Files:**
- Create: `src/traffic/random.ts`
- Create: `tests/random.test.ts`
- Modify: `src/traffic/types.ts`
- Modify: existing traffic test fixtures that construct `VehicleState`

**Interfaces:**
- Consumes: `hashCoordinates(seed, a, b, salt): number` from `src/city/hash.ts`.
- Produces: `DriverProfile`, `DriverTraits`, `Maneuver`, `seededUnit()`, `createDriverTraits()`, and `chooseManeuver()`.

- [ ] **Step 1: Write failing deterministic-randomness tests**

Create `tests/random.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { chooseManeuver, createDriverTraits, seededUnit } from '../src/traffic/random'

describe('traffic randomness', () => {
  it('returns a stable unit scalar without coupling property salts', () => {
    expect(seededUnit(12345, 7, 2, 0x10)).toBe(seededUnit(12345, 7, 2, 0x10))
    expect(seededUnit(12345, 7, 2, 0x10)).toBeGreaterThanOrEqual(0)
    expect(seededUnit(12345, 7, 2, 0x10)).toBeLessThan(1)
    expect(seededUnit(12345, 7, 2, 0x10)).not.toBe(seededUnit(12345, 7, 2, 0x11))
  })

  it('creates varied, bounded, repeatable driver traits', () => {
    const traits = Array.from({ length: 72 }, (_, id) => createDriverTraits(24680, id, 0))
    expect(traits).toEqual(
      Array.from({ length: 72 }, (_, id) => createDriverTraits(24680, id, 0)),
    )
    expect(new Set(traits.map(({ profile }) => profile))).toEqual(
      new Set(['cautious', 'normal', 'assertive']),
    )
    expect(Math.min(...traits.map(({ cruiseSpeed }) => cruiseSpeed))).toBeGreaterThanOrEqual(7.5)
    expect(Math.max(...traits.map(({ cruiseSpeed }) => cruiseSpeed))).toBeLessThanOrEqual(15)
    expect(Math.min(...traits.map(({ emergencyBraking }) => emergencyBraking))).toBeGreaterThanOrEqual(7)
    expect(Math.max(...traits.map(({ emergencyBraking }) => emergencyBraking))).toBeLessThanOrEqual(10)
  })

  it('selects all three maneuvers deterministically without U-turns', () => {
    const choices = Array.from({ length: 200 }, (_, decision) =>
      chooseManeuver(24680, 3, decision, 'normal'),
    )
    expect(new Set(choices)).toEqual(new Set(['straight', 'left', 'right']))
    expect(choices).toEqual(
      Array.from({ length: 200 }, (_, decision) =>
        chooseManeuver(24680, 3, decision, 'normal')),
    )
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun run test -- tests/random.test.ts`

Expected: FAIL because `src/traffic/random.ts` does not exist.

- [ ] **Step 3: Add the driver and route types**

Add to `src/traffic/types.ts`:

```ts
export type DriverProfile = 'cautious' | 'normal' | 'assertive'
export type Maneuver = 'straight' | 'left' | 'right'

export interface DriverTraits {
  readonly profile: DriverProfile
  readonly cruiseSpeed: number
  readonly maximumAcceleration: number
  readonly comfortableBraking: number
  readonly emergencyBraking: number
  readonly timeHeadway: number
  readonly minimumGap: number
}

export interface VehiclePose extends WorldPoint {
  readonly heading: number
}
```

Import `WorldPoint` from `../city/types`. Extend `VehicleState` with the following fields while retaining the existing straight-lane fields until Tasks 2-5 migrate their consumers:

```ts
nativeDirection: Direction
lifecycle: number
traits: DriverTraits
routeDecisionIndex: number
offscreenStoppedSteps: number
```

- [ ] **Step 4: Implement stateless seeded traits and maneuver choice**

Create `src/traffic/random.ts`:

```ts
import { hashCoordinates } from '../city/hash'
import type { DriverProfile, DriverTraits, Maneuver } from './types'

const range = (value: number, minimum: number, maximum: number): number =>
  minimum + (maximum - minimum) * value

export const seededUnit = (
  seed: number,
  vehicleId: number,
  sequence: number,
  salt: number,
): number => hashCoordinates(seed, vehicleId, sequence, salt) / 0x1_0000_0000

const profileAt = (value: number): DriverProfile =>
  value < 0.25 ? 'cautious' : value < 0.8 ? 'normal' : 'assertive'

export function createDriverTraits(seed: number, vehicleId: number, lifecycle: number): DriverTraits {
  const profile = profileAt(seededUnit(seed, vehicleId, lifecycle, 0x301))
  const limits = profile === 'cautious'
    ? { speed: [7.5, 10], headway: [1.4, 1.8], gap: [3.5, 4.5] }
    : profile === 'normal'
      ? { speed: [9, 13], headway: [1, 1.5], gap: [2.5, 4] }
      : { speed: [11.5, 15], headway: [0.8, 1.2], gap: [2, 3] }

  return Object.freeze({
    profile,
    cruiseSpeed: range(
      seededUnit(seed, vehicleId, lifecycle, 0x302),
      limits.speed[0]!,
      limits.speed[1]!,
    ),
    maximumAcceleration: range(seededUnit(seed, vehicleId, lifecycle, 0x303), 1.4, 3),
    comfortableBraking: range(seededUnit(seed, vehicleId, lifecycle, 0x304), 3, 5.5),
    emergencyBraking: range(seededUnit(seed, vehicleId, lifecycle, 0x305), 7, 10),
    timeHeadway: range(
      seededUnit(seed, vehicleId, lifecycle, 0x306),
      limits.headway[0]!,
      limits.headway[1]!,
    ),
    minimumGap: range(
      seededUnit(seed, vehicleId, lifecycle, 0x307),
      limits.gap[0]!,
      limits.gap[1]!,
    ),
  })
}

export function chooseManeuver(
  seed: number,
  vehicleId: number,
  decisionIndex: number,
  profile: DriverProfile,
): Maneuver {
  const straightWeight = profile === 'cautious' ? 0.65 : profile === 'assertive' ? 0.45 : 0.55
  const value = seededUnit(seed, vehicleId, decisionIndex, 0x308)
  if (value < straightWeight) return 'straight'
  return value < straightWeight + (1 - straightWeight) / 2 ? 'left' : 'right'
}
```

- [ ] **Step 5: Update test fixtures and verify GREEN**

Create one shared fixture helper in each affected test file with `nativeDirection: 'east'`, `lifecycle: 0`, `traits: createDriverTraits(1, id, 0)`, `routeDecisionIndex: 0`, and `offscreenStoppedSteps: 0`.

Run: `bun run test -- tests/random.test.ts tests/following.test.ts tests/intersections.test.ts tests/spawning.test.ts tests/simulation.test.ts tests/traffic-view.test.ts`

Expected: all listed tests pass.

- [ ] **Step 6: Commit driver traits**

```powershell
git add src/traffic/random.ts src/traffic/types.ts tests/random.test.ts tests/following.test.ts tests/intersections.test.ts tests/spawning.test.ts tests/simulation.test.ts tests/traffic-view.test.ts
git commit -m "feat: add deterministic driver traits"
```

### Task 2: Add route geometry and smooth turns

**Files:**
- Create: `src/traffic/routing.ts`
- Create: `tests/routing.test.ts`
- Modify: `src/traffic/lanes.ts`
- Modify: `src/traffic/types.ts`

**Interfaces:**
- Consumes: `Lane`, `Direction`, `Maneuver`, `VehiclePose`, `nextIntersection()`, and `positionOnLane()`.
- Produces: `PlannedMovement`, `TurnState`, `headingForDirection()`, `planMovement()`, `movementPoseAt()`, `poseForVehicle()`, and `laneProgressAtPoint()`.

- [ ] **Step 1: Write failing lane-transition and curve tests**

Create `tests/routing.test.ts` with table cases for every approach:

```ts
import { describe, expect, it } from 'vitest'
import { headingForDirection, movementPoseAt, planMovement } from '../src/traffic/routing'
import type { Direction, Maneuver } from '../src/traffic/types'

const transitions: readonly [Direction, Maneuver, Direction][] = [
  ['east', 'straight', 'east'], ['east', 'left', 'north'], ['east', 'right', 'south'],
  ['west', 'straight', 'west'], ['west', 'left', 'south'], ['west', 'right', 'north'],
  ['north', 'straight', 'north'], ['north', 'left', 'west'], ['north', 'right', 'east'],
  ['south', 'straight', 'south'], ['south', 'left', 'east'], ['south', 'right', 'west'],
]

describe('intersection routing', () => {
  it.each(transitions)('routes %s %s to %s', (incoming, maneuver, outgoing) => {
    const movement = planMovement({ direction: incoming, line: 0 }, -31, maneuver, 5)
    expect(movement.outgoingLane.direction).toBe(outgoing)
    expect(movement.outgoingLane.line).toBe(0)
  })

  it.each(['left', 'right'] as const)('matches lane endpoints and tangents for an east %s', maneuver => {
    const movement = planMovement({ direction: 'east', line: 0 }, -31, maneuver, 5)
    const start = movementPoseAt(movement, 0)
    const end = movementPoseAt(movement, movement.length)
    expect(start.heading).toBeCloseTo(headingForDirection('east'), 6)
    expect(end.heading).toBeCloseTo(headingForDirection(movement.outgoingLane.direction), 6)
    expect(start.z).toBeCloseTo(-16, 6)
    if (movement.outgoingLane.direction === 'north') expect(end.x).toBeCloseTo(-23, 6)
    else expect(end.x).toBeCloseTo(-16, 6)
  })

  it('produces finite smooth poses across a complete turn', () => {
    const movement = planMovement({ direction: 'north', line: 2 }, 89, 'left', 5)
    const poses = Array.from({ length: 65 }, (_, index) =>
      movementPoseAt(movement, movement.length * index / 64))
    expect(poses.flatMap(pose => [pose.x, pose.z, pose.heading]).every(Number.isFinite)).toBe(true)
    for (let index = 1; index < poses.length; index += 1) {
      const previous = poses[index - 1]!
      const current = poses[index]!
      expect(Math.hypot(current.x - previous.x, current.z - previous.z)).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run the routing test and verify RED**

Run: `bun run test -- tests/routing.test.ts`

Expected: FAIL because the routing exports do not exist.

- [ ] **Step 3: Expose lane geometry and add movement state**

Export `CROSSING_CENTER_OFFSET`, `FORWARD_LANE_OFFSET`, and `OPPOSING_LANE_OFFSET` from `src/traffic/lanes.ts`. Add:

```ts
export const laneProgressAtPoint = (lane: Lane, point: WorldPoint): number =>
  lane.direction === 'east' ? point.x
    : lane.direction === 'west' ? -point.x
      : lane.direction === 'north' ? point.z : -point.z
```

Add to `src/traffic/types.ts`:

```ts
export interface PlannedMovement {
  readonly key: string
  readonly intersectionKey: string
  readonly xIndex: number
  readonly zIndex: number
  readonly maneuver: Maneuver
  readonly incomingLane: Lane
  readonly outgoingLane: Lane
  readonly entryProgress: number
  readonly exitProgress: number
  readonly length: number
  readonly samples: readonly VehiclePose[]
  readonly sampleDistances: readonly number[]
}

export interface TurnState {
  readonly movement: PlannedMovement
  distance: number
}
```

Extend `VehicleState` with `plannedMovement: PlannedMovement | null`, `turn: TurnState | null`, and `previousPose: VehiclePose`.

- [ ] **Step 4: Implement route planning and arc-length pose lookup**

Create `src/traffic/routing.ts`. Use the exact transition table from the test. Build each turn as a cubic Bézier between the incoming and outgoing lane points at a 10-unit intersection approach distance. Align control handles with each lane direction, sample the curve at 64 equal parameters, accumulate chord lengths, and store the resulting `VehiclePose[]`. `movementPoseAt()` must binary-search cumulative distance stored beside each sample and interpolate adjacent poses using shortest-angle interpolation.

Use these exported signatures:

```ts
export const headingForDirection: (direction: Direction) => number
export const outgoingDirection: (incoming: Direction, maneuver: Maneuver) => Direction
export function planMovement(
  incomingLane: Lane,
  progress: number,
  maneuver: Maneuver,
  intersectionHalfExtent: number,
): PlannedMovement
export function movementPoseAt(movement: PlannedMovement, distance: number): VehiclePose
export function poseForVehicle(vehicle: VehicleState): VehiclePose
export function shortestAngleDelta(from: number, to: number): number
```

`poseForVehicle()` returns `movementPoseAt(vehicle.turn.movement, vehicle.turn.distance)` during a turn and otherwise combines `positionOnLane(vehicle.lane, vehicle.progress)` with `headingForDirection(vehicle.lane.direction)`. Straight movements store two samples on the same lane. Turn movement keys use `${intersectionKey}:${incomingDirection}:${maneuver}`.

- [ ] **Step 5: Verify route geometry and existing lane behavior**

Run: `bun run test -- tests/routing.test.ts tests/lanes.test.ts`

Expected: all routing transition, endpoint, tangent, finite-pose, and existing lane tests pass.

Before committing, add `plannedMovement: null`, `turn: null`, and a lane-derived `previousPose` to every existing `VehicleState` test fixture so `bun run typecheck` can compile the expanded interface.

- [ ] **Step 6: Commit route geometry**

```powershell
git add src/traffic/routing.ts src/traffic/lanes.ts src/traffic/types.ts tests/routing.test.ts tests/lanes.test.ts
git commit -m "feat: model deterministic intersection turns"
```

### Task 3: Replace whole-intersection locks with movement conflict zones

**Files:**
- Create: `src/traffic/movements.ts`
- Create: `tests/movements.test.ts`
- Replace: reservation logic in `src/traffic/intersections.ts`
- Modify: `tests/intersections.test.ts`
- Modify: `src/traffic/types.ts`

**Interfaces:**
- Consumes: `PlannedMovement`, `movementPoseAt()`, `laneKey()`, and active `VehicleState` values.
- Produces: `MovementReservations`, `movementConflictZones()`, `movementsConflict()`, and `updateMovementReservations()`.

- [ ] **Step 1: Write failing conflict, exit-blocking, expiry, and fairness tests**

Create `tests/movements.test.ts` with these behaviors:

```ts
it('allows non-overlapping opposite right turns', () => {
  const eastRight = planMovement({ direction: 'east', line: 0 }, -31, 'right', 5)
  const westRight = planMovement({ direction: 'west', line: 0 }, 9, 'right', 5)
  expect(movementsConflict(eastRight, westRight, 2.25)).toBe(false)
})

it('marks crossing straight paths and merging turns as conflicts', () => {
  const eastStraight = planMovement({ direction: 'east', line: 0 }, -31, 'straight', 5)
  const northStraight = planMovement({ direction: 'north', line: 0 }, -31, 'straight', 5)
  const southLeft = planMovement({ direction: 'south', line: 0 }, 9, 'left', 5)
  expect(movementsConflict(eastStraight, northStraight, 2.25)).toBe(true)
  expect(movementsConflict(eastStraight, southLeft, 2.25)).toBe(true)
})

it('does not grant a movement when its outgoing lane is blocked', () => {
  const requester = vehicleApproaching('east', 'right', { id: 1, progress: -31 })
  const blocker = vehicleOnLane({ direction: 'south', line: 0 }, -28, { id: 2, speed: 0 })
  const result = updateMovementReservations([requester, blocker], new Map(), config, 0)
  expect(result.stops.has(requester.id)).toBe(true)
  expect(requester.ownedZoneKeys).toEqual([])
})

it('expires an unused grant after 120 steps but retains entered zones', () => {
  const requester = vehicleApproaching('east', 'left', { id: 1, progress: -31 })
  const reservations = new Map()
  updateMovementReservations([requester], reservations, config, 0)
  updateMovementReservations([requester], reservations, config, 121)
  expect(requester.ownedZoneKeys).toEqual([])

  updateMovementReservations([requester], reservations, config, 122)
  requester.turn = { movement: requester.plannedMovement!, distance: 1 }
  updateMovementReservations([requester], reservations, config, 500)
  expect(requester.ownedZoneKeys.length).toBeGreaterThan(0)
})

it('serves the older request before an equally distant lower-id request', () => {
  const older = vehicleApproaching('east', 'straight', { id: 9, requestAgeSteps: 60 })
  const newer = vehicleApproaching('north', 'straight', { id: 1, requestAgeSteps: 0 })
  updateMovementReservations([newer, older], new Map(), config, 0)
  expect(older.ownedZoneKeys.length).toBeGreaterThan(0)
  expect(newer.ownedZoneKeys).toEqual([])
})
```

Define `vehicleApproaching()` and `vehicleOnLane()` in that test file using the complete Task 1 `VehicleState` fixture. Use `reservationLifetimeSteps: 120` and `movementCorridorHalfWidth: 2.25` in the local config.

- [ ] **Step 2: Run movement tests and verify RED**

Run: `bun run test -- tests/movements.test.ts`

Expected: FAIL because movement conflict and reservation functions do not exist.

- [ ] **Step 3: Add reservation fields and configuration**

Extend `VehicleState`:

```ts
requestAgeSteps: number
grantExpiresAtStep: number | null
ownedZoneKeys: string[]
```

Extend `TrafficConfig`:

```ts
readonly emergencyBrakingFloor: number
readonly reservationLifetimeSteps: number
readonly movementCorridorHalfWidth: number
readonly stoppedSpeedThreshold: number
readonly offscreenStoppedTimeoutSteps: number
```

Update all test configs with `emergencyBrakingFloor: 7`, `reservationLifetimeSteps: 120`, `movementCorridorHalfWidth: 2.25`, `stoppedSpeedThreshold: 0.25`, and `offscreenStoppedTimeoutSteps: 720`.

Add `requestAgeSteps: 0`, `grantExpiresAtStep: null`, and `ownedZoneKeys: []` to every existing `VehicleState` fixture.

- [ ] **Step 4: Implement swept zones and atomic grants**

Create `src/traffic/movements.ts` with:

```ts
export interface MovementReservation {
  readonly vehicleId: number
  readonly movementKey: string
}
export type MovementReservations = Map<string, MovementReservation>

export function movementConflictZones(
  movement: PlannedMovement,
  corridorHalfWidth: number,
): readonly string[]

export function movementsConflict(
  left: PlannedMovement,
  right: PlannedMovement,
  corridorHalfWidth: number,
): boolean

export function updateMovementReservations(
  vehicles: readonly VehicleState[],
  reservations: MovementReservations,
  config: TrafficConfig,
  stepNumber: number,
): { readonly stops: ReadonlyMap<number, number> }
```

Sample each movement pose at half-unit intervals. Quantize points and the four corridor-width offsets into 2-unit local cells, prefix each cell with the intersection key, sort the unique keys, and return them frozen. Acquire the complete key set only when every key is free. Sort requests by descending `requestAgeSteps`, ascending distance to entry, then ascending ID. Check the outgoing lane for the nearest active car whose rear bumper lies within `traits.minimumGap + length` of `exitProgress`. Increment age only for a blocked eligible request. Release expired pre-entry grants and release entered grants after the rear bumper clears the movement length.

Replace `updateIntersectionReservations()` calls with `updateMovementReservations()`. Keep `occupiedIntersectionKeys()` as a compatibility helper until Task 5 migrates the simulation assertions.

- [ ] **Step 5: Verify movement safety**

Run: `bun run test -- tests/movements.test.ts tests/intersections.test.ts`

Expected: compatible right turns proceed together; crossing or merging movements serialize; blocked exits stop before entry; unused grants expire; entered grants persist; older requests win.

- [ ] **Step 6: Commit movement reservations**

```powershell
git add src/traffic/movements.ts src/traffic/intersections.ts src/traffic/types.ts tests/movements.test.ts tests/intersections.test.ts
git commit -m "feat: reserve intersection movement corridors"
```

### Task 4: Improve following and emergency collision avoidance

**Files:**
- Modify: `src/traffic/following.ts`
- Modify: `tests/following.test.ts`
- Modify: `src/traffic/types.ts`

**Interfaces:**
- Consumes: personal `DriverTraits`, virtual movement stops, `TurnState`, and `movementPoseAt()`.
- Produces: route-aware `stepFollowing()` with stopping-distance braking and no-overlap clamping.

- [ ] **Step 1: Write failing personal-gap and emergency-braking tests**

Add to `tests/following.test.ts`:

```ts
it('uses each follower personal headway and minimum gap', () => {
  const leader = vehicle({ id: 1, progress: 30, speed: 8 })
  const cautious = vehicle({
    id: 2,
    progress: 15,
    speed: 10,
    traits: { ...baseTraits, minimumGap: 4.5, timeHeadway: 1.8 },
  })
  const assertive = vehicle({
    id: 3,
    lane: { direction: 'east', line: 1 },
    progress: 15,
    speed: 10,
    traits: { ...baseTraits, minimumGap: 2, timeHeadway: 0.8 },
  })
  const secondLeader = vehicle({ id: 4, lane: assertive.lane, progress: 30, speed: 8 })
  stepFollowing([cautious, leader, assertive, secondLeader], 1 / 60, config)
  expect(cautious.speed).toBeLessThan(assertive.speed)
})

it('uses emergency braking when comfortable stopping distance exceeds the gap', () => {
  const leader = vehicle({ id: 1, progress: 20, speed: 0 })
  const follower = vehicle({ id: 2, progress: 8, speed: 15 })
  stepFollowing([follower, leader], 1 / 60, config)
  expect(follower.speed).toBeCloseTo(15 - follower.traits.emergencyBraking / 60)
})

it('keeps bumpers separated through a turn-to-lane merge', () => {
  const turning = turningVehicle('east', 'right', { id: 2, speed: 12 })
  const receiving = vehicle({ id: 1, lane: turning.turn!.movement.outgoingLane, speed: 2 })
  for (let step = 0; step < 240; step += 1) {
    stepFollowing([turning, receiving], 1 / 60, config)
    expect(routeBumperGap(turning, receiving)).toBeGreaterThanOrEqual(-1e-9)
  }
})
```

Define the test-only helper directly above the merge test:

```ts
const routeBumperGap = (follower: VehicleState, leader: VehicleState): number => {
  const followerPose = poseForVehicle(follower)
  const leaderPose = poseForVehicle(leader)
  return Math.hypot(leaderPose.x - followerPose.x, leaderPose.z - followerPose.z)
    - (leader.length + follower.length) / 2
}
```

- [ ] **Step 2: Run following tests and verify RED**

Run: `bun run test -- tests/following.test.ts`

Expected: FAIL because following still uses global gap and braking values and cannot advance turn state.

- [ ] **Step 3: Implement predicted stopping-distance braking**

Use these formulas inside `stepFollowing()`:

```ts
const desiredGap = vehicle.traits.minimumGap + vehicle.speed * vehicle.traits.timeHeadway
const closingSpeed = Math.max(0, vehicle.speed - leaderSpeed)
const availableGap = Math.max(0, gap - vehicle.traits.minimumGap)
const requiredDeceleration = closingSpeed === 0
  ? 0
  : closingSpeed * closingSpeed / (2 * Math.max(availableGap, Number.EPSILON))
const braking = requiredDeceleration > vehicle.traits.comfortableBraking
  ? Math.max(vehicle.traits.emergencyBraking, config.emergencyBrakingFloor)
  : vehicle.traits.comfortableBraking
```

Accelerate toward `traits.cruiseSpeed` with `traits.maximumAcceleration`. Decelerate when `gap < desiredGap` or stopping-distance prediction demands it. Clamp final route progress to physical bumper separation. Advance `turn.distance` while turning; convert to the outgoing lane and `exitProgress` when distance reaches movement length. Increment `routeDecisionIndex` and clear `plannedMovement` after departure.

- [ ] **Step 4: Verify following GREEN and fixed-step invariance**

Run: `bun run test -- tests/following.test.ts tests/routing.test.ts`

Expected: all personal-gap, emergency, merge, no-overlap, overspeed, and render-frame-split tests pass.

- [ ] **Step 5: Commit collision-aware following**

```powershell
git add src/traffic/following.ts src/traffic/types.ts tests/following.test.ts tests/routing.test.ts
git commit -m "feat: improve vehicle collision avoidance"
```

### Task 5: Balance spawning, integrate turns, and prevent traffic decay

**Files:**
- Modify: `src/traffic/spawning.ts`
- Modify: `src/traffic/simulation.ts`
- Modify: `src/traffic/intersections.ts`
- Modify: `tests/spawning.test.ts`
- Modify: `tests/simulation.test.ts`

**Interfaces:**
- Consumes: driver traits, maneuver selection, movement planning, movement reservations, route-aware following, and camera radii.
- Produces: deterministic balanced pools, initial visible distribution, off-screen approach recycling, stalled-car recovery, and traffic diagnostics.

Export `closestLaneDistance(lane: Lane, camera: WorldPoint): number` from `src/traffic/spawning.ts` so candidate validation and tests use the same lateral-distance calculation.

- [ ] **Step 1: Write failing spawn-diversity and visible-route tests**

Add to `tests/spawning.test.ts`:

```ts
it.each([72, 48, 28])('creates %i varied cars with balanced directions', count => {
  const vehicles = createTrafficPool({ count, seed: 12345, camera, prototypes, config })
  const counts = directions.map(direction =>
    vehicles.filter(vehicle => vehicle.lane.direction === direction).length)
  expect(vehicles).toHaveLength(count)
  expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2)
  expect(new Set(vehicles.map(vehicle => vehicle.traits.cruiseSpeed)).size).toBeGreaterThan(count / 2)
  expect(new Set(vehicles.map(vehicle => vehicle.speed)).size).toBeGreaterThan(count / 3)
  expect(new Set(vehicles.map(vehicle => vehicle.prototypeId)).size).toBeGreaterThan(4)
})

it('places each recycled route on a lane that crosses the protected radius', () => {
  const vehicles = createTrafficPool({ count: 72, seed: 12345, camera, prototypes, config })
  for (const vehicle of vehicles) vehicle.progress += config.simulationRadius * 2
  recycleTraffic({ vehicles, seed: 12345, step: 1, camera, prototypes, config })
  for (const vehicle of vehicles.filter(({ active }) => active)) {
    expect(closestLaneDistance(vehicle.lane, camera)).toBeLessThan(
      config.protectedRadius - vehicle.length / 2,
    )
  }
})
```

Add a test that keeps a car outside the protected radius at speed zero for `offscreenStoppedTimeoutSteps`, verifies no earlier recycle, then verifies lifecycle increment, new traits, a safe hidden position, and `previousPose` reset at the timeout.

- [ ] **Step 2: Write the long-run regression and verify RED**

Add a 72-car stationary regression to `tests/simulation.test.ts`. Sample after 18,000 warm-up steps and each 3,600 steps through 216,000. At each sample assert at least 18 cars inside `protectedRadius`, at least 11 of those above `stoppedSpeedThreshold`, finite fields, no lane bumper overlap, and no duplicate occupied conflict-zone key. Run a duplicate simulation and compare complete vehicle and reservation state.

Retain the existing 36,000-step moving-camera regression, change its pool to 72, and add assertions for at least 18 visible cars, all four visible directions across each 3,600-step window, and complete deterministic equality with its duplicate.

Run: `bun run test -- tests/spawning.test.ts tests/simulation.test.ts`

Expected: FAIL with the current 49-car assumptions, no turn state, no stalled timeout, and visible count collapse.

- [ ] **Step 3: Implement balanced candidate generation**

In `src/traffic/spawning.ts`:

- Choose among directions whose active counts are within one of the minimum active direction count.
- Derive model, lane, longitudinal offset, driver traits, starting-speed fraction, and first maneuver from separate salts.
- Constrain lane lateral distance to `< protectedRadius - vehicle.length / 2`.
- Spread initial candidates across the protected disk and its near approach boundary.
- Place recycled candidates between protected and simulation radii on the approach side.
- Validate personal spawn gaps against both cars' `traits.minimumGap`.
- Reset reservation, turn, pose, request-age, and stopped-time state inside `assignCandidate()`.

Use `INITIAL_ATTEMPTS = 1024` and `RECYCLE_ATTEMPTS = 128`; both loops remain bounded by pool size and constants.

- [ ] **Step 4: Integrate route and reservation lifecycle**

Order `TrafficSimulation.step()` as follows:

```ts
for (const vehicle of this.vehicles) vehicle.previousPose = poseForVehicle(vehicle)
planMissingMovements(this.vehicles, this.seed, this.config)
const { stops } = updateMovementReservations(
  this.vehicles,
  this.mutableReservations,
  this.config,
  this.stepNumber,
)
stepFollowing(this.vehicles, deltaSeconds, this.config, stops)
updateOffscreenStoppedSteps(this.vehicles, camera, this.config)
recycleTraffic({
  vehicles: this.vehicles,
  seed: this.seed,
  step: this.stepNumber,
  camera,
  prototypes: this.prototypes,
  config: this.config,
})
this.stepNumber += 1
```

`planMissingMovements()` must call `chooseManeuver(seed, id, routeDecisionIndex, traits.profile)` and `planMovement()` once per decision. Stalled-time tracking increments only outside the protected radius while speed stays below the configured threshold; movement or visibility resets it.

Expose a read-only diagnostic method:

```ts
counts(camera: WorldPoint): {
  readonly active: number
  readonly visible: number
  readonly movingVisible: number
  readonly directions: ReadonlySet<Direction>
}
```

- [ ] **Step 5: Verify density, safety, and determinism GREEN**

Run: `bun run test -- tests/spawning.test.ts tests/simulation.test.ts tests/movements.test.ts tests/following.test.ts`

Expected: all focused tests pass, including 216,000 stationary steps without visible density falling below 18 or moving-visible density falling below 11 after warm-up.

- [ ] **Step 6: Commit integrated traffic simulation**

```powershell
git add src/traffic/spawning.ts src/traffic/simulation.ts src/traffic/intersections.ts tests/spawning.test.ts tests/simulation.test.ts
git commit -m "fix: preserve realistic traffic density"
```

### Task 6: Render turn heading and raise quality-profile counts

**Files:**
- Modify: `src/rendering/traffic-view.ts`
- Modify: `src/rendering/quality.ts`
- Modify: `src/app.ts`
- Modify: `tests/traffic-view.test.ts`
- Modify: `tests/quality.test.ts`
- Modify: `tests/app.test.ts`

**Interfaces:**
- Consumes: `poseForVehicle()`, `shortestAngleDelta()`, vehicle `nativeDirection`, and fixed quality profiles.
- Produces: `interpolatedVehiclePose()` and the 72/48/28 render pools.

- [ ] **Step 1: Write failing pose interpolation and profile-count tests**

Replace point-only assertions in `tests/traffic-view.test.ts` with:

```ts
it('interpolates position and the shortest heading through a turn', () => {
  const turning = vehicle({
    previousPose: { x: -25, z: -16, heading: 0 },
    turn: { movement: planMovement({ direction: 'east', line: 0 }, -31, 'left', 5), distance: 5 },
  })
  const current = poseForVehicle(turning)
  const midpoint = interpolatedVehiclePose(turning, 0.5)
  expect(midpoint.x).toBeCloseTo((turning.previousPose.x + current.x) / 2)
  expect(Math.abs(shortestAngleDelta(turning.previousPose.heading, midpoint.heading)))
    .toBeLessThan(Math.PI / 2)
})

it('rotates an authored eastbound model to match a northbound route heading', () => {
  const state = vehicle({ nativeDirection: 'east', lane: { direction: 'north', line: 0 } })
  const view = new TrafficView(scene, catalog, [state])
  view.sync([state], { x: 0, z: 0 }, 1)
  expect(view.root.children[0]!.rotation.y).toBeCloseTo(-Math.PI / 2)
})
```

Update `tests/quality.test.ts` to expect `72`, `48`, and `28`. Update app acceptance tests to expect the chosen profile's new slot count.

- [ ] **Step 2: Run view and quality tests and verify RED**

Run: `bun run test -- tests/traffic-view.test.ts tests/quality.test.ts tests/app.test.ts`

Expected: FAIL because the view has no heading interpolation and profiles still use 49/32/20.

- [ ] **Step 3: Implement pose interpolation and model rotation**

In `src/rendering/traffic-view.ts`:

```ts
export function interpolatedVehiclePose(vehicle: VehicleState, alpha: number): VehiclePose {
  const current = poseForVehicle(vehicle)
  return {
    x: vehicle.previousPose.x + (current.x - vehicle.previousPose.x) * alpha,
    z: vehicle.previousPose.z + (current.z - vehicle.previousPose.z) * alpha,
    heading: vehicle.previousPose.heading
      + shortestAngleDelta(vehicle.previousPose.heading, current.heading) * alpha,
  }
}
```

Set position from the interpolated pose and origin. Set `object.rotation.y` to `headingForDirection(vehicle.nativeDirection) - pose.heading`. Preserve pooled replacement and visibility behavior.

Change `QualityProfile.trafficCount` to `72 | 48 | 28` and update the three profile constants. Keep tile, pixel-ratio, and shadow settings unchanged.

Update production `TRAFFIC_CONFIG` in `src/app.ts` with `emergencyBrakingFloor: 7`, `reservationLifetimeSteps: 120`, `movementCorridorHalfWidth: 2.25`, `stoppedSpeedThreshold: 0.25`, and `offscreenStoppedTimeoutSteps: 720`. Keep the existing radii and intersection look-ahead.

- [ ] **Step 4: Verify view, quality, and app GREEN**

Run: `bun run test -- tests/traffic-view.test.ts tests/quality.test.ts tests/app.test.ts`

Expected: all listed tests pass with smooth heading, origin subtraction, pooled replacement, hidden slots, and exact new profile counts.

- [ ] **Step 5: Commit rendering and profile density**

```powershell
git add src/rendering/traffic-view.ts src/rendering/quality.ts src/app.ts tests/traffic-view.test.ts tests/quality.test.ts tests/app.test.ts
git commit -m "feat: render denser turning traffic"
```

### Task 7: Document behavior and run the production gate

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/superpowers/plans/2026-07-14-realistic-deterministic-traffic.md`

**Interfaces:**
- Consumes: verified implementation behavior and the approved design spec.
- Produces: maintainer documentation and final verification evidence.

- [x] **Step 1: Update documentation with exact implemented behavior**

In `README.md`, replace old counts with 72/48/28 and describe seeded driver profiles, three maneuvers, and sustained traffic density. In `docs/architecture.md`, replace the whole-intersection reservation section with movement conflict zones, outgoing-lane clearance, two-second unused-grant expiry, wait-based fairness, personal stopping-distance following, and 12-second off-screen stalled recycling. Remove turning vehicles from the out-of-scope list.

- [x] **Step 2: Run focused traffic verification**

Run:

```powershell
bun run test -- tests/random.test.ts tests/routing.test.ts tests/movements.test.ts tests/following.test.ts tests/intersections.test.ts tests/spawning.test.ts tests/simulation.test.ts tests/traffic-view.test.ts tests/quality.test.ts tests/app.test.ts
```

Expected: every focused test passes, including the stationary and moving long-run regressions.

- [x] **Step 3: Run the complete automated gate**

Run each command and inspect its full output:

```powershell
bun run typecheck
bun run test -- --exclude ".worktrees/**" --maxWorkers=2
bun run build
git diff --check
```

Result: TypeScript reported no errors; the root Vitest command passed 21 files and 189 tests; Vite completed the production build with no new warnings; diff check printed no whitespace errors.

- [x] **Step 4: Review requirements against evidence**

Confirm from test output and the final diff:

- Seed, camera path, and fixed steps reproduce full traffic state.
- Profiles allocate 72, 48, and 28 slots and include all four directions.
- Traits, starting speeds, models, directions, and maneuvers vary.
- Left and right turns align with outgoing lanes and interpolate heading.
- No bumper overlap or conflicting shared zone occurs.
- Blocked exits, grant expiry, occupied grants, and request aging behave as specified.
- Stationary traffic stays at or above 18 visible and 11 moving-visible cars after warm-up.
- Visible cars do not recycle.

- [x] **Step 5: Commit documentation and verification record**

Mark completed checkboxes in this plan, then commit only traffic documentation and the plan:

```powershell
git add README.md docs/architecture.md docs/superpowers/plans/2026-07-14-realistic-deterministic-traffic.md
git commit -m "docs: document realistic deterministic traffic"
```

Expected: `git status --short` shows no traffic-related changes. Preserve unrelated pre-existing workspace changes.
