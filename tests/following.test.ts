import { describe, expect, it } from 'vitest'
import { consumeFixedSteps, stepFollowing } from '../src/traffic/following'
import { positionOnLane } from '../src/traffic/lanes'
import { headingForDirection, planMovement, poseForVehicle } from '../src/traffic/routing'
import type {
  Direction,
  DriverTraits,
  Maneuver,
  TrafficConfig,
  VehicleState,
} from '../src/traffic/types'

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

const baseTraits: DriverTraits = {
  profile: 'normal',
  cruiseSpeed: 10,
  maximumAcceleration: 2,
  comfortableBraking: 4,
  emergencyBraking: 8,
  timeHeadway: 1,
  minimumGap: 2,
}

const vehicle = (overrides: Partial<VehicleState> = {}): VehicleState => {
  const id = overrides.id ?? 1
  const lane = overrides.lane ?? { direction: 'east', line: 0 }
  const progress = overrides.progress ?? 0
  return {
    id,
    prototypeId: 'car',
    length: 4,
    lane,
    nativeDirection: 'east',
    previousProgress: 0,
    progress,
    speed: 0,
    desiredSpeed: 10,
    active: true,
    reservationKey: null,
    lifecycle: 0,
    traits: baseTraits,
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

const turningVehicle = (
  direction: Direction,
  maneuver: Maneuver,
  overrides: Partial<VehicleState> = {},
): VehicleState => {
  const lane = { direction, line: 1 }
  const movement = planMovement(lane, -31, maneuver, config.intersectionHalfExtent)
  return vehicle({
    lane,
    progress: movement.entryProgress,
    plannedMovement: movement,
    turn: { movement, distance: 0 },
    ...overrides,
  })
}

describe('vehicle following', () => {
  it('never lets a follower front bumper pass its leader rear bumper', () => {
    const leader = vehicle({ id: 1, progress: 20, desiredSpeed: 0 })
    const follower = vehicle({ id: 2, progress: 12, speed: 10 })
    const vehicles = [follower, leader]

    for (let step = 0; step < 10; step += 1) {
      stepFollowing(vehicles, 1, config)

      const bumperGap = leader.progress - follower.progress
        - (leader.length + follower.length) / 2
      expect(bumperGap).toBeGreaterThanOrEqual(0)
    }
  })

  it('uses emergency braking before physical progress clamping is needed', () => {
    const leader = vehicle({
      id: 1,
      progress: 20,
      desiredSpeed: 0,
      traits: { ...baseTraits, cruiseSpeed: 0 },
    })
    const follower = vehicle({ id: 2, progress: 12, speed: 10 })

    stepFollowing([follower, leader], 1, config)

    expect(follower.speed).toBe(2)
    expect(follower.progress).toBe(14)
  })

  it('accelerates a clear vehicle without exceeding its personal cruise speed', () => {
    const clearVehicle = vehicle({
      desiredSpeed: 20,
      traits: { ...baseTraits, cruiseSpeed: 5 },
    })

    for (let step = 0; step < 10; step += 1) {
      stepFollowing([clearVehicle], 1, config)
      expect(clearVehicle.speed).toBeLessThanOrEqual(clearVehicle.traits.cruiseSpeed)
    }

    expect(clearVehicle.speed).toBe(5)
    expect(clearVehicle.progress).toBeGreaterThan(0)
  })

  it('decelerates a clear overspeed vehicle at the comfortable braking rate', () => {
    const overspeedVehicle = vehicle({
      speed: 20,
      desiredSpeed: 30,
      traits: { ...baseTraits, cruiseSpeed: 10 },
    })

    stepFollowing([overspeedVehicle], 1, config)

    expect(overspeedVehicle.speed).toBe(16)
    expect(overspeedVehicle.progress).toBe(16)
  })

  it('treats a stop progress as a zero-speed virtual leader', () => {
    const stoppingVehicle = vehicle({ speed: 10 })
    const stops = new Map([[stoppingVehicle.id, 10]])

    for (let step = 0; step < 10; step += 1) {
      stepFollowing([stoppingVehicle], 1, config, stops)
      expect(stoppingVehicle.progress + stoppingVehicle.length / 2).toBeLessThanOrEqual(10)
    }
  })

  it('does not enter a late-planned movement without a reservation', () => {
    const state = vehicle({ lane: { direction: 'south', line: 0 }, progress: 252 })
    const movement = planMovement(
      state.lane,
      state.progress,
      'straight',
      config.intersectionHalfExtent,
    )
    state.plannedMovement = movement
    const stops = new Map([[state.id, movement.entryProgress]])

    stepFollowing([state], 1 / 60, config, stops)

    expect(state.turn).toBeNull()
    expect(state.progress).toBe(252)
  })

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

  const routeBumperGap = (follower: VehicleState, leader: VehicleState): number => {
    const followerPose = poseForVehicle(follower)
    const leaderPose = poseForVehicle(leader)
    return Math.hypot(leaderPose.x - followerPose.x, leaderPose.z - followerPose.z)
      - (leader.length + follower.length) / 2
  }

  it('keeps bumpers separated through a turn-to-lane merge', () => {
    const turning = turningVehicle('east', 'right', { id: 2, speed: 12 })
    const receiving = vehicle({ id: 1, lane: turning.turn!.movement.outgoingLane, speed: 2 })

    for (let step = 0; step < 240; step += 1) {
      stepFollowing([turning, receiving], 1 / 60, config)
      expect(routeBumperGap(turning, receiving)).toBeGreaterThanOrEqual(-1e-9)
    }
  })

  it('keeps a straight movement behind a receiving vehicle before the exit', () => {
    const turning = turningVehicle('east', 'straight', { id: 2, speed: 12 })
    const movement = turning.turn!.movement
    turning.turn!.distance = movement.length - 6
    const receiving = vehicle({
      id: 1,
      lane: movement.outgoingLane,
      progress: movement.exitProgress - 1,
      speed: 0,
      traits: { ...baseTraits, cruiseSpeed: 0 },
    })

    stepFollowing([turning, receiving], 0.5, config)

    expect(routeBumperGap(turning, receiving)).toBeGreaterThanOrEqual(-1e-9)
  })
})

describe('fixed-step accumulation', () => {
  it.each([0, -0.01, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects invalid stepSeconds %s',
    (stepSeconds) => {
      expect(() => consumeFixedSteps(0, 0, stepSeconds, 0.25, () => undefined)).toThrow(
        'stepSeconds must be a finite positive number',
      )
    },
  )

  it('produces the same simulation progress across different render frame splits', () => {
    const simulate = (renderFrames: number): VehicleState => {
      const simulatedVehicle = vehicle({
        desiredSpeed: 20,
        traits: { ...baseTraits, cruiseSpeed: 6 },
      })
      let accumulator = 0

      for (let frame = 0; frame < renderFrames; frame += 1) {
        const result = consumeFixedSteps(
          accumulator,
          1 / renderFrames,
          1 / 60,
          0.25,
          () => stepFollowing([simulatedVehicle], 1 / 60, config),
        )
        accumulator = result.accumulator
      }

      return simulatedVehicle
    }

    const sixtyFrames = simulate(60)
    const oneHundredTwentyFrames = simulate(120)

    expect(sixtyFrames.progress).toBeCloseTo(oneHundredTwentyFrames.progress, 12)
    expect(sixtyFrames.speed).toBeCloseTo(oneHundredTwentyFrames.speed, 12)
  })

  it('clamps long frames and reports the interpolation fraction', () => {
    let steps = 0

    const result = consumeFixedSteps(0.005, 1, 0.01, 0.025, () => {
      steps += 1
    })

    expect(result.steps).toBe(3)
    expect(steps).toBe(3)
    expect(result.accumulator).toBeCloseTo(0)
    expect(result.alpha).toBeCloseTo(0)
  })
})
