import { describe, expect, it } from 'vitest'
import { consumeFixedSteps, stepFollowing } from '../src/traffic/following'
import { positionOnLane } from '../src/traffic/lanes'
import { createDriverTraits } from '../src/traffic/random'
import { headingForDirection } from '../src/traffic/routing'
import type { TrafficConfig, VehicleState } from '../src/traffic/types'

const config: TrafficConfig = {
  minimumGap: 2,
  timeHeadway: 1,
  maximumAcceleration: 2,
  comfortableBraking: 4,
  intersectionHalfExtent: 5,
  reservationLookAhead: 20,
  protectedRadius: 100,
  simulationRadius: 200,
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
    traits: createDriverTraits(1, id, 0),
    routeDecisionIndex: 0,
    offscreenStoppedSteps: 0,
    plannedMovement: null,
    turn: null,
    previousPose: {
      ...positionOnLane(lane, progress),
      heading: headingForDirection(lane.direction),
    },
    ...overrides,
  }
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

  it('limits braking to the comfortable rate when emergency progress clamping engages', () => {
    const leader = vehicle({ id: 1, progress: 20, desiredSpeed: 0 })
    const follower = vehicle({ id: 2, progress: 12, speed: 10 })

    stepFollowing([follower, leader], 1, config)

    expect(follower.speed).toBe(6)
    expect(follower.progress).toBe(16)
  })

  it('accelerates a clear vehicle without exceeding its desired speed', () => {
    const clearVehicle = vehicle({ desiredSpeed: 5 })

    for (let step = 0; step < 10; step += 1) {
      stepFollowing([clearVehicle], 1, config)
      expect(clearVehicle.speed).toBeLessThanOrEqual(clearVehicle.desiredSpeed)
    }

    expect(clearVehicle.speed).toBe(5)
    expect(clearVehicle.progress).toBeGreaterThan(0)
  })

  it('decelerates a clear overspeed vehicle at the comfortable braking rate', () => {
    const overspeedVehicle = vehicle({ speed: 20, desiredSpeed: 10 })

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
      const simulatedVehicle = vehicle({ desiredSpeed: 6 })
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
