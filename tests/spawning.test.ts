import { describe, expect, it } from 'vitest'
import type { WorldPoint } from '../src/city/types'
import { occupiedIntersectionKeys } from '../src/traffic/intersections'
import { positionOnLane } from '../src/traffic/lanes'
import { createDriverTraits } from '../src/traffic/random'
import { headingForDirection, poseForVehicle } from '../src/traffic/routing'
import { TrafficSimulation } from '../src/traffic/simulation'
import {
  closestLaneDistance,
  createTrafficPool,
  recycleTraffic,
} from '../src/traffic/spawning'
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
    movementEntered: false,
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
      expect(bumperGap).toBeGreaterThanOrEqual(
        Math.max(follower.traits.minimumGap, leader.traits.minimumGap),
      )
    }
  }
}

const assertStartingSpeedFractions = (vehicles: readonly VehicleState[]): void => {
  for (const state of vehicles) {
    const speedFraction = state.speed / state.traits.cruiseSpeed
    expect(speedFraction).toBeGreaterThanOrEqual(0.35)
    expect(speedFraction).toBeLessThanOrEqual(0.85)
  }
}

describe('deterministic traffic spawning', () => {
  it.each([108, 72, 42])('creates %i varied cars with balanced directions', (count) => {
    const vehicles = createTrafficPool({ count, seed: 12345, camera, prototypes, config })
    const counts = directions.map((direction) =>
      vehicles.filter((vehicle) => vehicle.lane.direction === direction).length)

    expect(vehicles).toHaveLength(count)
    expect(vehicles.map((vehicle) => vehicle.id)).toEqual(
      Array.from({ length: count }, (_, id) => id),
    )
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2)
    expect(new Set(vehicles.map((vehicle) => vehicle.traits.cruiseSpeed)).size)
      .toBeGreaterThan(count / 2)
    expect(new Set(vehicles.map((vehicle) => vehicle.speed)).size)
      .toBeGreaterThan(count / 3)
    expect(new Set(vehicles.map((vehicle) => vehicle.prototypeId)).size).toBeGreaterThan(4)
    assertStartingSpeedFractions(vehicles)
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
      expect(state.movementEntered).toBe(false)
      expect(state.grantExpiresAtStep).toBeNull()
      expect(state.ownedZoneKeys).toEqual([])
      expect(state.plannedMovement).toBeNull()
      expect(state.turn).toBeNull()
      expect(state.previousPose).toEqual(poseForVehicle(state))
    }
  })

  it('meets the configured minimum bumper gap on every lane', () => {
    const vehicles = createTrafficPool({ count: 72, seed: 12345, camera, prototypes, config })

    assertMinimumLaneGaps(vehicles)
  })

  it('starts with visible traffic on routes that cross the protected radius', () => {
    const vehicles = createTrafficPool({ count: 72, seed: 12345, camera, prototypes, config })
    const visible = vehicles.filter((state) => {
      const pose = poseForVehicle(state)
      return Math.hypot(pose.x - camera.x, pose.z - camera.z) <= config.protectedRadius
    })

    expect(visible.length).toBeGreaterThanOrEqual(18)
    for (const state of vehicles) {
      expect(closestLaneDistance(state.lane, camera)).toBeLessThan(
        config.protectedRadius - state.length / 2,
      )
    }
  })

  it('reproduces the complete initial state from the same seed', () => {
    const input = { count: 72, seed: 98765, camera, prototypes, config }

    expect(createTrafficPool(input)).toEqual(createTrafficPool(input))
  })

  it('reassigns only vehicles outside the simulation radius', () => {
    const inside = vehicle({ speed: 5, desiredSpeed: 10 })
    const outside = vehicle({
      id: 1,
      prototypeId: 'east-long',
      length: 6,
      previousProgress: config.simulationRadius + 10,
      progress: config.simulationRadius + 10,
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
    expect(distance - outside.length / 2).toBeGreaterThan(config.protectedRadius)
    expect(distance + outside.length / 2).toBeLessThanOrEqual(config.simulationRadius)
    assertMinimumLaneGaps([inside, outside])
  })

  it('refreshes deterministic driver state when recycling a vehicle', () => {
    const recycled = vehicle({
      id: 7,
      previousProgress: config.simulationRadius + 10,
      progress: config.simulationRadius + 10,
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
    expect(recycled.movementEntered).toBe(false)
    expect(recycled.grantExpiresAtStep).toBeNull()
    expect(recycled.ownedZoneKeys).toEqual([])
    expect(recycled.plannedMovement).toBeNull()
    expect(recycled.turn).toBeNull()
    expect(recycled.previousPose).toEqual(poseForVehicle(recycled))
  })

  it('places each recycled route on a lane that crosses the protected radius', () => {
    const vehicles = createTrafficPool({ count: 72, seed: 12345, camera, prototypes, config })
    const duplicate = createTrafficPool({ count: 72, seed: 12345, camera, prototypes, config })
    for (const state of vehicles) state.progress += config.simulationRadius * 2
    for (const state of duplicate) state.progress += config.simulationRadius * 2

    recycleTraffic({ vehicles, seed: 12345, step: 1, camera, prototypes, config })
    recycleTraffic({ vehicles: duplicate, seed: 12345, step: 1, camera, prototypes, config })

    expect(vehicles.every(({ active }) => active)).toBe(true)
    const counts = directions.map((direction) =>
      vehicles.filter((state) => state.lane.direction === direction).length)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2)
    expect(vehicles).toEqual(duplicate)
    assertMinimumLaneGaps(vehicles)
    assertStartingSpeedFractions(vehicles)
    for (const state of vehicles) {
      expect(closestLaneDistance(state.lane, camera)).toBeLessThan(
        config.protectedRadius - state.length / 2,
      )
    }
  })

  it('recycles a stopped offscreen car only when its timeout expires', () => {
    const simulation = new TrafficSimulation({
      count: 1,
      seed: 12345,
      camera,
      prototypes,
      config,
    })
    const state = simulation.vehicles[0]!
    state.lane = { direction: 'east', line: 0 }
    state.progress = config.protectedRadius + 20
    state.previousProgress = state.progress
    state.speed = 0
    state.traits = Object.freeze({ ...state.traits, cruiseSpeed: 0 })
    state.previousPose = poseForVehicle(state)
    const lifecycle = state.lifecycle
    const traits = state.traits
    state.ownedZoneKeys = ['held-zone']
    ;(simulation.reservations as Map<string, { vehicleId: number; movementKey: string }>).set(
      'held-zone',
      { vehicleId: state.id, movementKey: 'held-movement' },
    )

    for (let step = 1; step < config.offscreenStoppedTimeoutSteps; step += 1) {
      simulation.step(1 / 60, camera)
      expect(state.lifecycle).toBe(lifecycle)
    }

    simulation.step(1 / 60, camera)

    expect(state.lifecycle).toBe(lifecycle + 1)
    expect(state.traits).not.toEqual(traits)
    expect(state.active).toBe(true)
    const pose = poseForVehicle(state)
    const distance = Math.hypot(pose.x - camera.x, pose.z - camera.z)
    expect(distance - state.length / 2).toBeGreaterThan(config.protectedRadius)
    expect(distance + state.length / 2).toBeLessThanOrEqual(config.simulationRadius)
    expect(closestLaneDistance(state.lane, camera)).toBeLessThan(
      config.protectedRadius - state.length / 2,
    )
    expect(state.previousPose).toEqual(pose)
    expect(state.offscreenStoppedSteps).toBe(0)
    expect(simulation.reservations.size).toBe(0)
  })

  it('increments the offscreen timeout at 0.2499 even when the car changes pose', () => {
    const simulation = new TrafficSimulation({
      count: 1,
      seed: 12345,
      camera,
      prototypes,
      config,
    })
    const state = simulation.vehicles[0]!
    state.lane = { direction: 'east', line: 0 }
    state.progress = config.protectedRadius + 20
    state.previousProgress = state.progress
    state.speed = 0.2499
    state.traits = Object.freeze({ ...state.traits, cruiseSpeed: 0.2499 })
    state.previousPose = poseForVehicle(state)
    const startingPose = state.previousPose

    simulation.step(1 / 60, camera)

    expect(poseForVehicle(state)).not.toEqual(startingPose)
    expect(state.offscreenStoppedSteps).toBe(1)
  })

  it('resets the offscreen timeout at exactly the stopped speed threshold', () => {
    const simulation = new TrafficSimulation({
      count: 1,
      seed: 12345,
      camera,
      prototypes,
      config,
    })
    const state = simulation.vehicles[0]!
    state.lane = { direction: 'east', line: 0 }
    state.progress = config.protectedRadius + 20
    state.previousProgress = state.progress
    state.speed = 0.25
    state.traits = Object.freeze({ ...state.traits, cruiseSpeed: 0.25 })
    state.offscreenStoppedSteps = 12
    state.previousPose = poseForVehicle(state)

    simulation.step(1 / 60, camera)

    expect(state.speed).toBe(0.25)
    expect(state.offscreenStoppedSteps).toBe(0)
  })

  it('resets the offscreen timeout inside the protected radius', () => {
    const simulation = new TrafficSimulation({
      count: 1,
      seed: 12345,
      camera,
      prototypes,
      config,
    })
    const state = simulation.vehicles[0]!
    state.lane = { direction: 'east', line: 0 }
    state.progress = 0
    state.previousProgress = state.progress
    state.speed = 0
    state.traits = Object.freeze({ ...state.traits, cruiseSpeed: 0 })
    state.offscreenStoppedSteps = config.offscreenStoppedTimeoutSteps
    state.previousPose = poseForVehicle(state)
    const lifecycle = state.lifecycle

    simulation.step(1 / 60, camera)

    expect(state.lifecycle).toBe(lifecycle)
    expect(state.offscreenStoppedSteps).toBe(0)
  })

  it('does not timeout-recycle a long car whose extent is still protected', () => {
    const simulation = new TrafficSimulation({
      count: 1,
      seed: 12345,
      camera,
      prototypes,
      config,
    })
    const state = simulation.vehicles[0]!
    state.lane = { direction: 'east', line: 0 }
    state.length = 6
    const targetDistance = config.protectedRadius + state.length / 2 - 1e-6
    const laneOffset = positionOnLane(state.lane, 0).z - camera.z
    state.progress = Math.sqrt(targetDistance ** 2 - laneOffset ** 2)
    state.previousProgress = state.progress
    state.speed = 0
    state.traits = Object.freeze({ ...state.traits, cruiseSpeed: 0 })
    state.offscreenStoppedSteps = config.offscreenStoppedTimeoutSteps
    state.previousPose = poseForVehicle(state)
    const lifecycle = state.lifecycle

    simulation.step(1 / 60, camera)

    expect(state.lifecycle).toBe(lifecycle)
    expect(state.offscreenStoppedSteps).toBe(0)
  })

  it('does not boundary-recycle a long car whose extent reaches the simulation radius', () => {
    const lane = { direction: 'east', line: 0 } as const
    const targetDistance = config.simulationRadius + 3 - 1e-6
    const laneOffset = positionOnLane(lane, 0).z - camera.z
    const state = vehicle({
      length: 6,
      lane,
      progress: Math.sqrt(targetDistance ** 2 - laneOffset ** 2),
    })
    state.previousProgress = state.progress
    state.previousPose = poseForVehicle(state)
    const lifecycle = state.lifecycle

    recycleTraffic({
      vehicles: [state],
      seed: 12345,
      step: 0,
      camera,
      prototypes,
      config,
    })

    expect(state.lifecycle).toBe(lifecycle)
    expect(state.active).toBe(true)
  })

  it('keeps a blocked slot inactive and safely retries it on a later step', () => {
    const blockedConfig: TrafficConfig = { ...config, minimumGap: 1_000 }
    const blockedVehicle = vehicle({
      id: 100,
      previousProgress: config.simulationRadius + 10,
      progress: config.simulationRadius + 10,
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
    expect(distance).toBeGreaterThan(config.protectedRadius)
    expect(distance).toBeLessThanOrEqual(config.simulationRadius)
    expect(occupiedIntersectionKeys(blockedVehicle, config)).toEqual([])
  })
})
