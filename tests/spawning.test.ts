import { describe, expect, it } from 'vitest'
import type { WorldPoint } from '../src/city/types'
import { positionOnLane } from '../src/traffic/lanes'
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
  intersectionHalfExtent: 5,
  reservationLookAhead: 20,
  protectedRadius: 120,
  simulationRadius: 220,
}

const camera: WorldPoint = { x: 0, z: 0 }
const directions: readonly Direction[] = ['east', 'west', 'north', 'south']
const prototypes: readonly VehiclePrototypeMetadata[] = directions.flatMap((direction) => [
  { id: `${direction}-short`, length: 4, direction },
  { id: `${direction}-long`, length: 6, direction },
])

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

  it('meets the configured minimum bumper gap on every lane', () => {
    const vehicles = createTrafficPool({ count: 49, seed: 12345, camera, prototypes, config })

    assertMinimumLaneGaps(vehicles)
  })

  it('reproduces the complete initial state from the same seed', () => {
    const input = { count: 49, seed: 98765, camera, prototypes, config }

    expect(createTrafficPool(input)).toEqual(createTrafficPool(input))
  })

  it('reassigns only vehicles outside the simulation radius', () => {
    const inside: VehicleState = {
      id: 0,
      prototypeId: 'east-short',
      length: 4,
      lane: { direction: 'east', line: 0 },
      previousProgress: 0,
      progress: 0,
      speed: 5,
      desiredSpeed: 10,
      active: true,
      reservationKey: null,
    }
    const outside: VehicleState = {
      id: 1,
      prototypeId: 'east-long',
      length: 6,
      lane: { direction: 'east', line: 0 },
      previousProgress: config.simulationRadius + 1,
      progress: config.simulationRadius + 1,
      speed: 9,
      desiredSpeed: 11,
      active: true,
      reservationKey: null,
    }
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
    expect(distance).toBeGreaterThan(config.protectedRadius)
    expect(distance).toBeLessThanOrEqual(config.simulationRadius)
    assertMinimumLaneGaps([inside, outside])
  })
})
