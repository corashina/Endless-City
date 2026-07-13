import { describe, expect, it } from 'vitest'
import { BLOCK_SIZE, FIXED_STEP_SECONDS } from '../src/config'
import { nextIntersection, positionOnLane } from '../src/traffic/lanes'
import { TrafficSimulation } from '../src/traffic/simulation'
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

const directions: readonly Direction[] = ['east', 'west', 'north', 'south']
const prototypes: readonly VehiclePrototypeMetadata[] = directions.flatMap((direction) => [
  { id: `${direction}-short`, length: 4, direction },
  { id: `${direction}-long`, length: 6, direction },
])

const assertNoFollowingOverlap = (vehicles: readonly VehicleState[]): void => {
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
      if (bumperGap < -1e-9) {
        throw new Error(`Vehicles ${follower.id} and ${leader.id} overlap by ${-bumperGap}`)
      }
    }
  }
}

const occupiedIntersectionKey = (vehicle: VehicleState): string | null => {
  const rearBumper = vehicle.progress - vehicle.length / 2
  const frontBumper = vehicle.progress + vehicle.length / 2
  const intersection = nextIntersection(vehicle.lane, rearBumper)

  return frontBumper > intersection.progress - config.intersectionHalfExtent
    && rearBumper < intersection.progress + config.intersectionHalfExtent
    ? intersection.key
    : null
}

const assertNoSharedIntersectionZone = (vehicles: readonly VehicleState[]): void => {
  const occupants = new Set<string>()

  for (const vehicle of vehicles) {
    if (!vehicle.active) continue
    const key = occupiedIntersectionKey(vehicle)
    if (key === null) continue
    if (occupants.has(key)) throw new Error(`Intersection ${key} has multiple occupants`)
    occupants.add(key)
  }
}

describe('traffic simulation', () => {
  it('copies progress before advancing and exposes reservations read-only', () => {
    const simulation = new TrafficSimulation({
      count: 20,
      seed: 12345,
      camera: { x: 0, z: 0 },
      prototypes,
      config,
    })
    const startingProgress = simulation.vehicles.map((vehicle) => vehicle.progress)

    simulation.step(FIXED_STEP_SECONDS, { x: 0, z: 0 })

    expect(simulation.vehicles.map((vehicle) => vehicle.previousProgress)).toEqual(startingProgress)
    expect(simulation.reservations).toBeInstanceOf(Map)
  })

  it('stays bounded, finite, conflict-free, and deterministic across 36,000 steps', () => {
    const createSimulation = (): TrafficSimulation => new TrafficSimulation({
      count: 49,
      seed: 24680,
      camera: { x: 0, z: 0 },
      prototypes,
      config,
    })
    const simulation = createSimulation()
    const duplicate = createSimulation()
    const stepCount = 36_000

    for (let step = 0; step < stepCount; step += 1) {
      const camera = {
        x: BLOCK_SIZE * 500 * step / (stepCount - 1),
        z: Math.sin(step / 600) * BLOCK_SIZE * 2,
      }

      simulation.step(FIXED_STEP_SECONDS, camera)
      duplicate.step(FIXED_STEP_SECONDS, camera)

      if (simulation.vehicles.length !== 49) {
        throw new Error(`Traffic pool changed length at step ${step}`)
      }

      for (const vehicle of simulation.vehicles) {
        if (![
          vehicle.length,
          vehicle.lane.line,
          vehicle.previousProgress,
          vehicle.progress,
          vehicle.speed,
          vehicle.desiredSpeed,
        ].every(Number.isFinite)) {
          throw new Error(`Vehicle ${vehicle.id} has a non-finite field at step ${step}`)
        }

        if (!vehicle.active) continue
        const position = positionOnLane(vehicle.lane, vehicle.progress)
        const distance = Math.hypot(position.x - camera.x, position.z - camera.z)
        if (distance > config.simulationRadius + BLOCK_SIZE * 2) {
          throw new Error(`Vehicle ${vehicle.id} escaped the simulation at step ${step}`)
        }
      }

      assertNoFollowingOverlap(simulation.vehicles)
      assertNoSharedIntersectionZone(simulation.vehicles)
    }

    expect(simulation.vehicles).toEqual(duplicate.vehicles)
    expect([...simulation.reservations]).toEqual([...duplicate.reservations])
  }, 15_000)
})
