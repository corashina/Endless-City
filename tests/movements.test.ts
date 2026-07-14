import { describe, expect, it } from 'vitest'
import { stepFollowing } from '../src/traffic/following'
import { positionOnLane } from '../src/traffic/lanes'
import {
  movementsConflict,
  updateMovementReservations,
} from '../src/traffic/movements'
import { createDriverTraits } from '../src/traffic/random'
import { headingForDirection, planMovement } from '../src/traffic/routing'
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

describe('movement conflict zones', () => {
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

  it('expires an unused grant at exactly step 120', () => {
    const requester = vehicleApproaching('east', 'left', { id: 1, progress: -31 })
    const reservations = new Map()
    updateMovementReservations([requester], reservations, config, 0)
    const expired = updateMovementReservations([requester], reservations, config, 120)
    expect(requester.ownedZoneKeys).toEqual([])
    expect(requester.movementEntered).toBe(false)
    expect(expired.stops.get(requester.id)).toBe(requester.plannedMovement!.entryProgress)
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
})
