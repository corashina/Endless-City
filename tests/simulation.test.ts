import { describe, expect, it } from 'vitest'
import { BLOCK_SIZE, FIXED_STEP_SECONDS } from '../src/config'
import { occupiedIntersectionKeys } from '../src/traffic/intersections'
import { positionOnLane } from '../src/traffic/lanes'
import { movementConflictZones } from '../src/traffic/movements'
import { chooseManeuver } from '../src/traffic/random'
import { movementPoseAt, planMovement, poseForVehicle } from '../src/traffic/routing'
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

const directions: readonly Direction[] = ['east', 'west', 'north', 'south']
const prototypes: readonly VehiclePrototypeMetadata[] = directions.flatMap((direction) => [
  { id: `${direction}-short`, length: 4, direction },
  { id: `${direction}-long`, length: 6, direction },
])

const assertNoFollowingOverlap = (
  vehicles: readonly VehicleState[],
  context = '',
): void => {
  const laneGroups = new Map<string, VehicleState[]>()

  for (const vehicle of vehicles) {
    if (!vehicle.active || vehicle.turn !== null) continue
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
        throw new Error(
          `Vehicles ${follower.id} and ${leader.id} overlap by ${-bumperGap} ${context}`,
        )
      }
    }
  }
}

const assertNoSharedMovementZone = (vehicles: readonly VehicleState[]): void => {
  const claims = new Map<string, number>()

  const claimZones = (vehicle: VehicleState, zoneKeys: readonly string[]): void => {
    for (const key of zoneKeys) {
      const claimantId = claims.get(key)
      if (claimantId !== undefined && claimantId !== vehicle.id) {
        throw new Error(`Movement zone ${key} is shared by ${claimantId} and ${vehicle.id}`)
      }
      claims.set(key, vehicle.id)
    }
  }

  for (const vehicle of vehicles) {
    if (!vehicle.active) continue

    claimZones(vehicle, vehicle.ownedZoneKeys)
    if (vehicle.turn !== null) {
      claimZones(vehicle, movementConflictZones(
        vehicle.turn.movement,
        config.movementCorridorHalfWidth,
      ))
    }
  }
}

describe('traffic simulation', () => {
  it('recognizes the trailing half of an occupied intersection zone', () => {
    const trailingVehicle: Pick<VehicleState, 'lane' | 'progress' | 'length'> = {
      lane: { direction: 'east', line: 0 },
      progress: -13,
      length: 6,
    }

    expect(occupiedIntersectionKeys(trailingVehicle, config)).toEqual(['0:0'])
  })

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

  it('plans one seeded maneuver per route decision without rerolling while waiting', () => {
    const simulation = new TrafficSimulation({
      count: 1,
      seed: 12345,
      camera: { x: 0, z: 0 },
      prototypes,
      config,
    })
    const state = simulation.vehicles[0]!

    simulation.step(0, { x: 0, z: 0 })
    const movement = state.plannedMovement

    expect(movement?.maneuver).toBe(chooseManeuver(
      12345,
      state.id,
      state.routeDecisionIndex,
      state.traits.profile,
    ))

    simulation.step(0, { x: 0, z: 0 })
    expect(state.plannedMovement).toBe(movement)
    expect(state.routeDecisionIndex).toBe(0)
  })

  it('reports active, visible, moving-visible, and visible direction counts', () => {
    const simulation = new TrafficSimulation({
      count: 72,
      seed: 12345,
      camera: { x: 0, z: 0 },
      prototypes,
      config,
    })
    const diagnostics = simulation.counts({ x: 0, z: 0 })

    expect(diagnostics.active).toBe(72)
    expect(diagnostics.visible).toBeGreaterThanOrEqual(18)
    expect(diagnostics.movingVisible).toBeGreaterThanOrEqual(11)
    expect(diagnostics.directions.size).toBe(4)
  })

  it('completes one movement on its outgoing lane and advances the route decision once', () => {
    const simulation = new TrafficSimulation({
      count: 1,
      seed: 12345,
      camera: { x: 0, z: 0 },
      prototypes,
      config,
    })
    const state = simulation.vehicles[0]!
    const movement = planMovement(
      { direction: 'east', line: 1 },
      -31,
      'right',
      config.intersectionHalfExtent,
    )
    const startingDistance = movement.length - 0.05
    state.lane = movement.incomingLane
    state.progress = movement.entryProgress
    state.previousProgress = state.progress
    state.speed = 6
    state.plannedMovement = movement
    state.turn = { movement, distance: startingDistance }
    state.routeDecisionIndex = 0
    state.previousPose = movementPoseAt(movement, startingDistance)

    simulation.step(FIXED_STEP_SECONDS, { x: 0, z: 0 })

    expect(state.previousPose).toEqual(movementPoseAt(movement, startingDistance))
    expect(state.turn).toBeNull()
    expect(state.plannedMovement).toBeNull()
    expect(state.lane).toEqual(movement.outgoingLane)
    expect(state.progress).toBeGreaterThan(movement.exitProgress)
    expect(state.routeDecisionIndex).toBe(1)

    simulation.step(FIXED_STEP_SECONDS, { x: 0, z: 0 })
    expect(state.routeDecisionIndex).toBe(1)
  })

  it('preserves stationary-camera density, safety, and determinism across 216,000 steps', () => {
    const camera = { x: 0, z: 0 }
    const createSimulation = (): TrafficSimulation => new TrafficSimulation({
      count: 72,
      seed: 24680,
      camera,
      prototypes,
      config,
    })
    const simulation = createSimulation()
    const duplicate = createSimulation()
    let minimumActive = Number.POSITIVE_INFINITY
    let minimumVisible = Number.POSITIVE_INFINITY
    let minimumMovingVisible = Number.POSITIVE_INFINITY

    for (let step = 1; step <= 216_000; step += 1) {
      simulation.step(FIXED_STEP_SECONDS, camera)
      duplicate.step(FIXED_STEP_SECONDS, camera)

      if (step >= 18_000 && step % 3_600 === 0) {
        const diagnostics = simulation.counts(camera)
        minimumActive = Math.min(minimumActive, diagnostics.active)
        minimumVisible = Math.min(minimumVisible, diagnostics.visible)
        minimumMovingVisible = Math.min(minimumMovingVisible, diagnostics.movingVisible)
        expect(diagnostics.active, `active cars at step ${step}`).toBe(72)
        expect(diagnostics.visible, `visible cars at step ${step}`).toBeGreaterThanOrEqual(18)
        expect(diagnostics.movingVisible, `moving visible cars at step ${step}`)
          .toBeGreaterThanOrEqual(11)

        for (const vehicle of simulation.vehicles) {
          const pose = poseForVehicle(vehicle)
          if (![
            vehicle.length,
            vehicle.lane.line,
            vehicle.previousProgress,
            vehicle.progress,
            vehicle.speed,
            vehicle.desiredSpeed,
            pose.x,
            pose.z,
            pose.heading,
          ].every(Number.isFinite)) {
            throw new Error(`Vehicle ${vehicle.id} has a non-finite field at step ${step}`)
          }
        }

        assertNoFollowingOverlap(simulation.vehicles)
        assertNoSharedMovementZone(simulation.vehicles)
      }
    }

    expect(simulation.vehicles).toEqual(duplicate.vehicles)
    expect([...simulation.reservations]).toEqual([...duplicate.reservations])
    expect(minimumActive).toBe(72)
    expect(minimumVisible).toBeGreaterThanOrEqual(18)
    expect(minimumMovingVisible).toBeGreaterThanOrEqual(11)
  }, 240_000)

  it('stays dense, bounded, finite, directionally diverse, and deterministic while moving', () => {
    const createSimulation = (): TrafficSimulation => new TrafficSimulation({
      count: 72,
      seed: 24680,
      camera: { x: 0, z: 0 },
      prototypes,
      config,
    })
    const simulation = createSimulation()
    const duplicate = createSimulation()
    const stepCount = 36_000
    let visibleDirections = new Set<Direction>()

    for (let step = 0; step < stepCount; step += 1) {
      const camera = {
        x: BLOCK_SIZE * 500 * step / (stepCount - 1),
        z: Math.sin(step / 600) * BLOCK_SIZE * 2,
      }

      simulation.step(FIXED_STEP_SECONDS, camera)
      duplicate.step(FIXED_STEP_SECONDS, camera)

      if (simulation.vehicles.length !== 72) {
        throw new Error(`Traffic pool changed length at step ${step}`)
      }

      for (const vehicle of simulation.vehicles) {
        const pose = poseForVehicle(vehicle)
        if (![
          vehicle.length,
          vehicle.lane.line,
          vehicle.previousProgress,
          vehicle.progress,
          vehicle.speed,
          vehicle.desiredSpeed,
          pose.x,
          pose.z,
          pose.heading,
        ].every(Number.isFinite)) {
          throw new Error(`Vehicle ${vehicle.id} has a non-finite field at step ${step}`)
        }

        if (!vehicle.active) continue
        const distance = Math.hypot(pose.x - camera.x, pose.z - camera.z)
        if (distance > config.simulationRadius + BLOCK_SIZE * 2) {
          throw new Error(`Vehicle ${vehicle.id} escaped the simulation at step ${step}`)
        }
      }

      const diagnostics = simulation.counts(camera)
      for (const direction of diagnostics.directions) visibleDirections.add(direction)
      if ((step + 1) % 3_600 === 0) {
        expect(diagnostics.visible, `visible cars at step ${step + 1}`)
          .toBeGreaterThanOrEqual(18)
        expect(visibleDirections, `visible directions through step ${step}`).toEqual(
          new Set(directions),
        )
        visibleDirections = new Set()
      }

      assertNoFollowingOverlap(simulation.vehicles, `at step ${step}`)
      assertNoSharedMovementZone(simulation.vehicles)
    }

    expect(simulation.vehicles).toEqual(duplicate.vehicles)
    expect([...simulation.reservations]).toEqual([...duplicate.reservations])
  }, 60_000)
})
