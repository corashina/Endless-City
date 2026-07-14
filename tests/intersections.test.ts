import { describe, expect, it } from 'vitest'
import { stepFollowing } from '../src/traffic/following'
import { positionOnLane } from '../src/traffic/lanes'
import {
  updateMovementReservations,
  type MovementReservations,
} from '../src/traffic/movements'
import { createDriverTraits } from '../src/traffic/random'
import { headingForDirection, planMovement } from '../src/traffic/routing'
import type { TrafficConfig, VehicleState } from '../src/traffic/types'
import type { Direction } from '../src/traffic/types'

const config: TrafficConfig = {
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
}

const vehicle = (overrides: Partial<VehicleState> = {}): VehicleState => {
  const id = overrides.id ?? 1
  const lane = overrides.lane ?? { direction: 'east', line: 0 }
  const progress = overrides.progress ?? -31
  return {
    id,
    prototypeId: 'car',
    length: 4,
    lane,
    nativeDirection: 'east',
    previousProgress: -31,
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
    grantExpiresAtStep: null,
    ownedZoneKeys: [],
    plannedMovement: null,
    turn: null,
    clearingMovement: null,
    previousPose: {
      ...positionOnLane(lane, progress),
      heading: headingForDirection(lane.direction),
    },
    ...overrides,
  }
}

const intersectsConflictZone = (state: VehicleState): boolean => {
  const crossingProgress = state.lane.direction === 'east' || state.lane.direction === 'north'
    ? -20
    : 20
  const frontBumper = state.progress + state.length / 2
  const rearBumper = state.progress - state.length / 2

  return frontBumper > crossingProgress - config.intersectionHalfExtent
    && rearBumper < crossingProgress + config.intersectionHalfExtent
}

describe('intersection reservations', () => {
  it.each([
    ['east', 'north'],
    ['east', 'south'],
    ['west', 'north'],
    ['west', 'south'],
  ] as const)(
    'keeps %s and %s vehicles out of the conflict zone together',
    (horizontalDirection: Direction, verticalDirection: Direction) => {
    const horizontalProgress = horizontalDirection === 'east' ? -31 : 9
    const verticalProgress = verticalDirection === 'north' ? -31 : 9
    const horizontal = vehicle({
      id: 2,
      lane: { direction: horizontalDirection, line: 0 },
      previousProgress: horizontalProgress,
      progress: horizontalProgress,
      speed: 8,
    })
    const vertical = vehicle({
      id: 1,
      lane: { direction: verticalDirection, line: 0 },
      previousProgress: verticalProgress,
      progress: verticalProgress,
      speed: 8,
    })
    const vehicles = [horizontal, vertical]
    const reservations: MovementReservations = new Map()
    for (const state of vehicles) {
      state.plannedMovement = planMovement(
        state.lane,
        state.progress,
        'straight',
        config.intersectionHalfExtent,
      )
    }

    for (let step = 0; step < 600; step += 1) {
      const { stops } = updateMovementReservations(vehicles, reservations, config, step)
      stepFollowing(vehicles, 1 / 60, config, stops)
      for (const state of vehicles) {
        const movement = state.plannedMovement!
        if (state.turn === null && state.ownedZoneKeys.length > 0) {
          if (state.progress >= movement.entryProgress) {
            state.turn = {
              movement,
              distance: state.progress - movement.entryProgress,
            }
          }
        } else if (state.turn !== null) {
          state.turn.distance = Math.max(0, state.progress - movement.entryProgress)
        }
      }

      expect(intersectsConflictZone(horizontal) && intersectsConflictZone(vertical)).toBe(false)
    }
  })
})
