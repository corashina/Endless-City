import { describe, expect, it } from 'vitest'
import { incomingLaneLeaderLookup, stepFollowing } from '../src/traffic/following'
import { positionOnLane } from '../src/traffic/lanes'
import {
  movementsConflict,
  updateMovementReservations,
} from '../src/traffic/movements'
import { createDriverTraits } from '../src/traffic/random'
import { headingForDirection, planMovement, poseForVehicle } from '../src/traffic/routing'
import type {
  Direction,
  Lane,
  Maneuver,
  TrafficConfig,
  VehicleState,
} from '../src/traffic/types'

const config = {
  minimumGap: 2,
  timeHeadway: 1,
  maximumAcceleration: 2,
  comfortableBraking: 4,
  emergencyBrakingFloor: 7,
  intersectionHalfExtent: 5,
  reservationLookAhead: 20,
  reservationLifetimeSteps: 120,
  movementCorridorHalfWidth: 2.25,
  stoppedSpeedThreshold: 0.25,
  offscreenStoppedTimeoutSteps: 720,
  protectedRadius: 100,
  simulationRadius: 200,
} as TrafficConfig

const approachProgress = (direction: Direction): number =>
  direction === 'east' || direction === 'north' ? -31 : 9

const vehicleApproaching = (
  direction: Direction,
  maneuver: Maneuver,
  overrides: Partial<VehicleState> = {},
): VehicleState => {
  const id = overrides.id ?? 1
  const lane = overrides.lane ?? { direction, line: 0 }
  const progress = overrides.progress ?? approachProgress(direction)
  const movement = planMovement(lane, progress, maneuver, config.intersectionHalfExtent)

  return {
    id,
    prototypeId: 'car',
    length: 4,
    lane,
    nativeDirection: direction,
    previousProgress: progress,
    progress,
    speed: 0,
    desiredSpeed: 8,
    active: true,
    reservationKey: null,
    lifecycle: 0,
    traits: createDriverTraits(1, id, 0),
    routeDecisionIndex: 0,
    offscreenStoppedSteps: 0,
    requestAgeSteps: 0,
    movementEntered: false,
    grantExpiresAtStep: null,
    ownedZoneKeys: [],
    plannedMovement: movement,
    turn: null,
    clearingMovement: null,
    previousPose: {
      ...positionOnLane(lane, progress),
      heading: headingForDirection(lane.direction),
    },
    ...overrides,
  }
}

const vehicleOnLane = (
  lane: Lane,
  axisProgress: number,
  overrides: Partial<VehicleState> = {},
): VehicleState => {
  const progress = lane.direction === 'west' || lane.direction === 'south'
    ? -axisProgress
    : axisProgress
  return vehicleApproaching(lane.direction, 'straight', {
    progress,
    plannedMovement: null,
    ...overrides,
  })
}

const movementCases = [
  ['ES', 'east', 'straight'],
  ['EL', 'east', 'left'],
  ['ER', 'east', 'right'],
  ['NS', 'north', 'straight'],
  ['NL', 'north', 'left'],
  ['NR', 'north', 'right'],
  ['WS', 'west', 'straight'],
  ['WL', 'west', 'left'],
  ['WR', 'west', 'right'],
  ['SS', 'south', 'straight'],
  ['SL', 'south', 'left'],
  ['SR', 'south', 'right'],
] as const

// Hand-authored from the lane-level movement geometry. X means that the two
// swept vehicle corridors conflict; . means they can occupy the intersection
// together. This oracle intentionally does not use production conflict zones.
const expectedConflictRows = [
  'XXXX.X..XXXX', // ES
  'XXXX....X..X', // EL
  'XXXXXXXX.X.X', // ER
  'XXXXXXX.X..X', // NS
  '..XXXXX....X', // NL
  'X.XXXXXXXXXX', // NR
  '..XXXXXXXX.X', // WS
  '..X..XXXXX..', // WL
  'XX.X.XXXXXXX', // WR
  'X.X..XXXXXXX', // SS
  'X....X..XXXX', // SL
  'XXXXXXX.XXXX', // SR
] as const

describe('movement conflict zones', () => {
  it('classifies and allocates every unordered pair of the 12 movements', () => {
    expect(expectedConflictRows.every(row => row.length === movementCases.length)).toBe(true)
    expect(expectedConflictRows.every((row, rowIndex) =>
      [...row].every((value, columnIndex) =>
        value === expectedConflictRows[columnIndex]![rowIndex]),
    )).toBe(true)

    let pairCount = 0
    for (let leftIndex = 0; leftIndex < movementCases.length; leftIndex += 1) {
      for (let rightIndex = leftIndex; rightIndex < movementCases.length; rightIndex += 1) {
        pairCount += 1
        const [leftLabel, leftDirection, leftManeuver] = movementCases[leftIndex]!
        const [rightLabel, rightDirection, rightManeuver] = movementCases[rightIndex]!
        const expectedConflict = expectedConflictRows[leftIndex]![rightIndex] === 'X'
        const label = `${leftLabel}/${rightLabel}`
        const left = vehicleApproaching(leftDirection, leftManeuver, { id: 1 })
        const right = vehicleApproaching(rightDirection, rightManeuver, { id: 2 })

        expect(
          movementsConflict(
            left.plannedMovement!,
            right.plannedMovement!,
            config.movementCorridorHalfWidth,
          ),
          `${label} classifier`,
        ).toBe(expectedConflict)

        updateMovementReservations([left, right], new Map(), config, 0)
        const grantedCount = [left, right]
          .filter(vehicle => vehicle.ownedZoneKeys.length > 0)
          .length
        expect(grantedCount, `${label} simultaneous grants`)
          .toBe(expectedConflict ? 1 : 2)
      }
    }

    expect(pairCount).toBe(78)
  })

  it('allows non-overlapping opposite right turns', () => {
    const eastRight = planMovement({ direction: 'east', line: 0 }, -31, 'right', 5)
    const westRight = planMovement({ direction: 'west', line: 0 }, 9, 'right', 5)
    expect(movementsConflict(eastRight, westRight, 2.25)).toBe(false)
  })

  it('grants compatible opposite right turns together', () => {
    const eastRight = vehicleApproaching('east', 'right', { id: 1 })
    const westRight = vehicleApproaching('west', 'right', { id: 2 })

    const result = updateMovementReservations(
      [eastRight, westRight],
      new Map(),
      config,
      0,
    )

    expect(result.stops).toEqual(new Map())
    expect(eastRight.ownedZoneKeys.length).toBeGreaterThan(0)
    expect(westRight.ownedZoneKeys.length).toBeGreaterThan(0)
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
    const movement = requester.plannedMovement!
    const blocker = vehicleApproaching(movement.outgoingLane.direction, 'straight', {
      id: 2,
      lane: movement.outgoingLane,
      progress: movement.exitProgress + 1,
      plannedMovement: null,
      speed: 0,
    })
    const result = updateMovementReservations([requester, blocker], new Map(), config, 0)
    expect(result.stops.has(requester.id)).toBe(true)
    expect(requester.ownedZoneKeys).toEqual([])
  })

  it('ignores a car upstream of a turning movement receiving-lane exit', () => {
    const requester = vehicleApproaching('east', 'right', { id: 1, progress: -31 })
    const movement = requester.plannedMovement!
    const upstream = vehicleApproaching(movement.outgoingLane.direction, 'straight', {
      id: 2,
      lane: movement.outgoingLane,
      progress: movement.exitProgress - 1,
      plannedMovement: null,
      speed: 0,
    })

    const result = updateMovementReservations([requester, upstream], new Map(), config, 0)

    expect(result.stops.has(requester.id)).toBe(false)
    expect(requester.ownedZoneKeys.length).toBeGreaterThan(0)
  })

  it('does not grant a follower blocked by a car on its incoming lane', () => {
    const requester = vehicleApproaching('east', 'straight', { id: 1, progress: -35 })
    const blocker = vehicleOnLane(requester.lane, -30, { id: 2, speed: 0 })

    const result = updateMovementReservations([requester, blocker], new Map(), config, 0)

    expect(result.stops.has(requester.id)).toBe(false)
    expect(requester.ownedZoneKeys).toEqual([])
    expect(requester.requestAgeSteps).toBe(1)
  })

  it('keeps a left-turning follower behind a slow right-turning leader on the same approach', () => {
    const leader = vehicleApproaching('east', 'right', {
      id: 1,
      length: 6,
      speed: 0.12,
    })
    leader.progress = leader.plannedMovement!.entryProgress - leader.length / 2 - 0.1
    leader.previousProgress = leader.progress
    leader.traits = Object.freeze({
      ...leader.traits,
      cruiseSpeed: leader.speed,
      maximumAcceleration: 1.4,
      minimumGap: 2,
    })
    const follower = vehicleApproaching('east', 'left', {
      id: 2,
      speed: 8,
    })
    follower.traits = Object.freeze({
      ...follower.traits,
      cruiseSpeed: 10,
      minimumGap: 2,
    })
    follower.progress = leader.progress
      - (leader.length + follower.length) / 2
      - follower.traits.minimumGap
    follower.previousProgress = follower.progress
    const reservations = new Map()
    let sawApproachToTurnTransition = false
    let sawVirtualStopAfterRearClearance = false

    for (let step = 0; step < 4_000; step += 1) {
      const { stops } = updateMovementReservations(
        [leader, follower],
        reservations,
        config,
        step,
      )
      if (
        leader.turn !== null
        && leader.turn.distance - leader.length / 2 > 0
        && leader.ownedZoneKeys.length > 0
      ) {
        sawVirtualStopAfterRearClearance = true
        expect(incomingLaneLeaderLookup([leader, follower]).has(follower.id)).toBe(false)
        expect(stops.get(follower.id)).toBe(follower.plannedMovement!.entryProgress)
      }
      stepFollowing([leader, follower], 1 / 60, config, stops)

      if (
        leader.turn !== null
        && leader.turn.distance - leader.length / 2 <= 0
        && follower.turn === null
      ) {
        sawApproachToTurnTransition = true
        const leaderPose = poseForVehicle(leader)
        const followerPose = poseForVehicle(follower)
        const bumperGap = Math.hypot(
          leaderPose.x - followerPose.x,
          leaderPose.z - followerPose.z,
        ) - (leader.length + follower.length) / 2
        expect(bumperGap, `physical bumper gap at fixed step ${step}`)
          .toBeGreaterThanOrEqual(-1e-9)
      }

      if (leader.turn === null && leader.plannedMovement === null) break
    }

    expect(sawApproachToTurnTransition).toBe(true)
    expect(
      sawVirtualStopAfterRearClearance,
      `leader turn distance ${leader.turn?.distance ?? 'complete'}, speed ${leader.speed}, zones ${leader.ownedZoneKeys.length}`,
    ).toBe(true)
  })

  it('expires an unused grant at exactly step 120', () => {
    const requester = vehicleApproaching('east', 'left', { id: 1, progress: -31 })
    const reservations = new Map()
    updateMovementReservations([requester], reservations, config, 0)
    const expired = updateMovementReservations([requester], reservations, config, 120)
    expect(requester.ownedZoneKeys).toEqual([])
    expect(requester.movementEntered).toBe(false)
    expect(expired.stops.get(requester.id)).toBe(requester.plannedMovement!.entryProgress)
  })

  it('does not add an expiry stop when a physical leader still blocks the entry', () => {
    const leader = vehicleApproaching('east', 'straight', { id: 1, length: 6 })
    leader.progress = leader.plannedMovement!.entryProgress + 0.04
    leader.previousProgress = leader.progress
    const follower = vehicleApproaching('east', 'straight', { id: 2, length: 4 })
    follower.progress = leader.progress - (leader.length + follower.length) / 2
    follower.previousProgress = follower.progress
    follower.ownedZoneKeys = ['expired-zone']
    follower.grantExpiresAtStep = 120
    const reservations = new Map([
      ['expired-zone', { vehicleId: follower.id, movementKey: follower.plannedMovement!.key }],
    ])

    const expired = updateMovementReservations(
      [leader, follower],
      reservations,
      config,
      120,
    )

    expect(expired.stops.has(follower.id)).toBe(false)
  })

  it('retains a slow long car grant from front-bumper entry through expiry', () => {
    const holder = vehicleApproaching('east', 'straight', {
      id: 1,
      length: 6,
      speed: 0.12,
    })
    const movement = holder.plannedMovement!
    holder.progress = movement.entryProgress - holder.length / 2 - 0.1
    holder.previousProgress = holder.progress
    holder.traits = Object.freeze({
      ...holder.traits,
      cruiseSpeed: holder.speed,
      maximumAcceleration: 1.4,
    })
    const conflicting = vehicleApproaching('north', 'straight', { id: 2 })
    const reservations = new Map()

    updateMovementReservations([holder], reservations, config, 0)
    for (let step = 0; step < 60; step += 1) {
      stepFollowing([holder], 1 / 60, config)
    }

    expect(holder.progress + holder.length / 2).toBeGreaterThan(movement.entryProgress)
    expect(holder.progress).toBeLessThan(movement.entryProgress)

    updateMovementReservations([holder, conflicting], reservations, config, 120)
    updateMovementReservations([holder, conflicting], reservations, config, 121)

    expect(holder.ownedZoneKeys.length).toBeGreaterThan(0)
    expect(holder.movementEntered).toBe(true)
    expect(conflicting.ownedZoneKeys).toEqual([])
  })

  it('resets accumulated request age when the front bumper enters the movement', () => {
    const requester = vehicleApproaching('east', 'left', {
      id: 1,
      requestAgeSteps: 60,
    })
    const reservations = new Map()

    updateMovementReservations([requester], reservations, config, 0)
    expect(requester.requestAgeSteps).toBe(60)

    stepFollowing([requester], 1 / 60, config)

    expect(requester.movementEntered).toBe(true)
    expect(requester.requestAgeSteps).toBe(0)
  })

  it('retains departed zones until the rear bumper clears the outgoing boundary', () => {
    const requester = vehicleApproaching('east', 'right', { id: 1, progress: -31 })
    const reservations = new Map()
    updateMovementReservations([requester], reservations, config, 0)
    const movement = requester.plannedMovement!

    requester.lane = movement.outgoingLane
    requester.progress = movement.exitProgress + requester.length / 2
    requester.turn = null
    requester.plannedMovement = null
    requester.clearingMovement = movement

    updateMovementReservations([requester], reservations, config, 1)

    expect(requester.ownedZoneKeys.length).toBeGreaterThan(0)
    expect(requester.clearingMovement).toBe(movement)

    requester.progress += 0.001
    updateMovementReservations([requester], reservations, config, 2)

    expect(requester.ownedZoneKeys).toEqual([])
    expect(requester.movementEntered).toBe(false)
    expect(requester.clearingMovement).toBeNull()
  })

  it('serves the older request before an equally distant lower-id request', () => {
    const older = vehicleApproaching('east', 'straight', { id: 9, requestAgeSteps: 60 })
    const newer = vehicleApproaching('north', 'straight', { id: 1, requestAgeSteps: 0 })
    updateMovementReservations([newer, older], new Map(), config, 0)
    expect(older.ownedZoneKeys.length).toBeGreaterThan(0)
    expect(newer.ownedZoneKeys).toEqual([])
  })

  it('retains request age through repeated unused expiries without starving contenders', () => {
    const first = vehicleApproaching('east', 'right', {
      id: 1,
      requestAgeSteps: 50,
    })
    const second = vehicleApproaching('north', 'straight', {
      id: 2,
      requestAgeSteps: 30,
    })
    const third = vehicleApproaching('south', 'right', {
      id: 3,
      requestAgeSteps: 10,
    })
    const vehicles = [first, second, third]
    const reservations = new Map()
    const grantOrder: number[] = []
    let previousHolder: number | undefined

    for (let step = 0; step <= 360; step += 1) {
      updateMovementReservations(vehicles, reservations, config, step)
      const holder = vehicles.find(vehicle => vehicle.ownedZoneKeys.length > 0)?.id
      if (holder !== undefined && holder !== previousHolder) grantOrder.push(holder)
      previousHolder = holder

      if (step === 120) expect(first.requestAgeSteps).toBe(50)
      if (step === 240) expect(second.requestAgeSteps).toBe(150)
      if (step === 360) expect(third.requestAgeSteps).toBe(250)
    }

    expect(grantOrder).toEqual([first.id, second.id, third.id, first.id])
    expect(new Set(grantOrder)).toEqual(new Set(vehicles.map(vehicle => vehicle.id)))
  })
})
