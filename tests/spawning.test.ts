import { describe, expect, it } from 'vitest'
import type { WorldPoint } from '../src/city/types'
import { occupiedIntersectionKeys } from '../src/traffic/intersections'
import { positionOnLane } from '../src/traffic/lanes'
import { createDriverTraits } from '../src/traffic/random'
import { headingForDirection, poseForVehicle } from '../src/traffic/routing'
import { createTrafficPool, recycleTraffic } from '../src/traffic/spawning'
import type {
  Direction,
  TrafficConfig,
  VehiclePrototypeMetadata,
  VehicleState,
} from '../src/traffic/types'

const config: TrafficConfig = {
  minimumGap: 3,
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
  protectedRadius: 300,
  simulationRadius: 420,
}

const camera: WorldPoint = { x: 0, z: 0 }
const directions: readonly Direction[] = ['east', 'west', 'north', 'south']
const prototypes: readonly VehiclePrototypeMetadata[] = directions.flatMap((direction) => [
  { id: `${direction}-short`, length: 4, direction },
  { id: `${direction}-long`, length: 6, direction },
])

const vehicle = (overrides: Partial<VehicleState> = {}): VehicleState => {
  const id = overrides.id ?? 0
  const lane = overrides.lane ?? { direction: 'east', line: 0 }
  const progress = overrides.progress ?? 0
  return {
    id,
    prototypeId: 'east-short',
    length: 4,
    lane,
    nativeDirection: 'east',
    previousProgress: 0,
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

const assertMinimumLaneGaps = (vehicles: readonly VehicleState[]): void => {
  const laneGroups = new Map<string, VehicleState[]>()

  for (const vehicle of vehicles) {
    if (!vehicle.active) continue
    const key = `${vehicle.lane.direction}:${vehicle.lane.line}`
    const lane = laneGroups.get(key)
    if (lane === undefined) laneGroups.set(key, [vehicle])
    else lane.push(vehicle)
  }

  for (const lane of laneGroups.values()) {
    lane.sort((left, right) => left.progress - right.progress || left.id - right.id)

    for (let index = 1; index < lane.length; index += 1) {
      const follower = lane[index - 1]
      const leader = lane[index]
      if (follower === undefined || leader === undefined) continue

      const bumperGap = leader.progress - follower.progress
        - (leader.length + follower.length) / 2
      expect(bumperGap).toBeGreaterThanOrEqual(config.minimumGap)
    }
  }
}

describe('deterministic traffic spawning', () => {
  it.each([49, 32, 20])('creates exactly %i vehicles with all four directions', (count) => {
    const vehicles = createTrafficPool({ count, seed: 12345, camera, prototypes, config })

    expect(vehicles).toHaveLength(count)
    expect(vehicles.map((vehicle) => vehicle.id)).toEqual(
      Array.from({ length: count }, (_, id) => id),
    )
    expect(new Set(vehicles.map((vehicle) => vehicle.lane.direction))).toEqual(
      new Set(directions),
    )
  })

  it('initializes stable driver state for every vehicle', () => {
    const vehicles = createTrafficPool({ count: 20, seed: 12345, camera, prototypes, config })

    for (const state of vehicles) {
      const prototype = prototypes.find(({ id }) => id === state.prototypeId)
      expect(state.nativeDirection).toBe(prototype?.direction)
      expect(state.lifecycle).toBe(0)
      expect(state.traits).toEqual(createDriverTraits(12345, state.id, 0))
      expect(state.routeDecisionIndex).toBe(0)
      expect(state.offscreenStoppedSteps).toBe(0)
      expect(state.requestAgeSteps).toBe(0)
      expect(state.grantExpiresAtStep).toBeNull()
      expect(state.ownedZoneKeys).toEqual([])
      expect(state.plannedMovement).toBeNull()
      expect(state.turn).toBeNull()
      expect(state.previousPose).toEqual(poseForVehicle(state))
    }
  })

  it('meets the configured minimum bumper gap on every lane', () => {
    const vehicles = createTrafficPool({ count: 49, seed: 12345, camera, prototypes, config })

    assertMinimumLaneGaps(vehicles)
  })

  it('reproduces the complete initial state from the same seed', () => {
    const input = { count: 49, seed: 98765, camera, prototypes, config }

    expect(createTrafficPool(input)).toEqual(createTrafficPool(input))
  })

  it('reassigns only vehicles outside the simulation radius', () => {
    const inside = vehicle({ speed: 5, desiredSpeed: 10 })
    const outside = vehicle({
      id: 1,
      prototypeId: 'east-long',
      length: 6,
      previousProgress: config.simulationRadius + 1,
      progress: config.simulationRadius + 1,
      speed: 9,
      desiredSpeed: 11,
    })
    const insideBefore = structuredClone(inside)
    const outsideBefore = structuredClone(outside)

    recycleTraffic({
      vehicles: [inside, outside],
      seed: 12345,
      step: 0,
      camera,
      prototypes,
      config,
    })

    expect(inside).toEqual(insideBefore)
    expect(outside).not.toEqual(outsideBefore)
    expect(outside.active).toBe(true)
    const position = positionOnLane(outside.lane, outside.progress)
    const distance = Math.hypot(position.x - camera.x, position.z - camera.z)
    expect(distance).toBeGreaterThan(300)
    expect(distance).toBeGreaterThan(config.protectedRadius)
    expect(distance).toBeLessThanOrEqual(config.simulationRadius)
    assertMinimumLaneGaps([inside, outside])
  })

  it('refreshes deterministic driver state when recycling a vehicle', () => {
    const recycled = vehicle({
      id: 7,
      previousProgress: config.simulationRadius + 1,
      progress: config.simulationRadius + 1,
      lifecycle: 3,
      traits: createDriverTraits(12345, 7, 3),
      routeDecisionIndex: 8,
      offscreenStoppedSteps: 12,
    })

    recycleTraffic({
      vehicles: [recycled],
      seed: 12345,
      step: 0,
      camera,
      prototypes,
      config,
    })

    const prototype = prototypes.find(({ id }) => id === recycled.prototypeId)
    expect(recycled.active).toBe(true)
    expect(recycled.nativeDirection).toBe(prototype?.direction)
    expect(recycled.lifecycle).toBe(4)
    expect(recycled.traits).toEqual(createDriverTraits(12345, recycled.id, 4))
    expect(recycled.routeDecisionIndex).toBe(0)
    expect(recycled.offscreenStoppedSteps).toBe(0)
    expect(recycled.requestAgeSteps).toBe(0)
    expect(recycled.grantExpiresAtStep).toBeNull()
    expect(recycled.ownedZoneKeys).toEqual([])
    expect(recycled.plannedMovement).toBeNull()
    expect(recycled.turn).toBeNull()
    expect(recycled.previousPose).toEqual(poseForVehicle(recycled))
  })

  it('keeps a blocked slot inactive and safely retries it on a later step', () => {
    const blockedConfig: TrafficConfig = { ...config, minimumGap: 1_000 }
    const blockedVehicle = vehicle({
      id: 100,
      previousProgress: config.simulationRadius + 1,
      progress: config.simulationRadius + 1,
      speed: 9,
      desiredSpeed: 11,
    })
    const blockers: VehicleState[] = directions.flatMap((direction, directionIndex) =>
      Array.from({ length: 15 }, (_, lineIndex) => vehicle({
        id: directionIndex * 15 + lineIndex,
        prototypeId: `${direction}-short`,
        lane: { direction, line: lineIndex - 7 },
      })),
    )
    const blockedVehicles = [blockedVehicle, ...blockers]

    recycleTraffic({
      vehicles: blockedVehicles,
      seed: 12345,
      step: 0,
      camera,
      prototypes,
      config: blockedConfig,
    })
    expect(blockedVehicle.active).toBe(false)
    const firstFailedState = structuredClone(blockedVehicle)

    recycleTraffic({
      vehicles: blockedVehicles,
      seed: 12345,
      step: 1,
      camera,
      prototypes,
      config: blockedConfig,
    })
    expect(blockedVehicle).toEqual(firstFailedState)

    const laterCamera: WorldPoint = { x: 60, z: 0 }
    recycleTraffic({
      vehicles: [blockedVehicle],
      seed: 12345,
      step: 2,
      camera: laterCamera,
      prototypes,
      config,
    })

    expect(blockedVehicle.active).toBe(true)
    const position = positionOnLane(blockedVehicle.lane, blockedVehicle.progress)
    const distance = Math.hypot(position.x - laterCamera.x, position.z - laterCamera.z)
    expect(distance).toBeGreaterThan(300)
    expect(distance).toBeGreaterThan(config.protectedRadius)
    expect(distance).toBeLessThanOrEqual(config.simulationRadius)
    expect(occupiedIntersectionKeys(blockedVehicle, config)).toEqual([])
  })
})
