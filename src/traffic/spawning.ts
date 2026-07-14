import { hashCoordinates } from '../city/hash'
import type { WorldPoint } from '../city/types'
import { BLOCK_SIZE } from '../config'
import { occupiedIntersectionKeys } from './intersections'
import { laneKey, positionOnLane } from './lanes'
import { createDriverTraits } from './random'
import { headingForDirection } from './routing'
import type {
  Direction,
  Lane,
  TrafficConfig,
  VehiclePrototypeMetadata,
  VehicleState,
} from './types'

const DIRECTIONS: readonly Direction[] = ['east', 'west', 'north', 'south']
const INITIAL_ATTEMPTS = 512
const RECYCLE_ATTEMPTS = 32
const MINIMUM_DESIRED_SPEED = 8
const DESIRED_SPEED_COUNT = 6

export interface CreateTrafficPoolInput {
  readonly count: number
  readonly seed: number
  readonly camera: WorldPoint
  readonly prototypes: readonly VehiclePrototypeMetadata[]
  readonly config: TrafficConfig
}

export interface RecycleTrafficInput {
  readonly vehicles: readonly VehicleState[]
  readonly seed: number
  readonly step: number
  readonly camera: WorldPoint
  readonly prototypes: readonly VehiclePrototypeMetadata[]
  readonly config: TrafficConfig
}

interface SpawnCandidate {
  readonly prototype: VehiclePrototypeMetadata
  readonly lane: Lane
  readonly progress: number
  readonly desiredSpeed: number
}

const directionAt = (index: number): Direction => {
  const direction = DIRECTIONS[index]
  if (direction === undefined) throw new Error(`Invalid traffic direction index: ${index}`)
  return direction
}

const hashChoice = (
  seed: number,
  vehicleId: number,
  attempt: number,
  salt: number,
): number => hashCoordinates(seed, vehicleId, attempt, salt)

const prototypesForDirection = (
  prototypes: readonly VehiclePrototypeMetadata[],
  direction: Direction,
): readonly VehiclePrototypeMetadata[] =>
  prototypes.filter((prototype) => prototype.direction === direction)

const cameraProgress = (direction: Direction, camera: WorldPoint): number => {
  switch (direction) {
    case 'east': return camera.x
    case 'west': return -camera.x
    case 'north': return camera.z
    case 'south': return -camera.z
  }
}

const nearestLaneLine = (direction: Direction, camera: WorldPoint): number => {
  switch (direction) {
    case 'east': return Math.round((camera.z + 16) / BLOCK_SIZE)
    case 'west': return Math.round((camera.z + 23) / BLOCK_SIZE)
    case 'north': return Math.round((camera.x + 23) / BLOCK_SIZE)
    case 'south': return Math.round((camera.x + 16) / BLOCK_SIZE)
  }
}

const distanceFromCamera = (
  lane: Lane,
  progress: number,
  camera: WorldPoint,
): number => {
  const position = positionOnLane(lane, progress)
  return Math.hypot(position.x - camera.x, position.z - camera.z)
}

const hasMinimumGaps = (
  candidate: SpawnCandidate,
  vehicles: readonly VehicleState[],
  minimumGap: number,
  ignoredVehicleId?: number,
): boolean => {
  const candidateLaneKey = laneKey(candidate.lane)

  for (const vehicle of vehicles) {
    if (!vehicle.active || vehicle.id === ignoredVehicleId) continue
    if (laneKey(vehicle.lane) !== candidateLaneKey) continue

    const requiredCenterGap = minimumGap + (candidate.prototype.length + vehicle.length) / 2
    if (Math.abs(candidate.progress - vehicle.progress) < requiredCenterGap) return false
  }

  return true
}

const intersectsConflictZone = (
  candidate: SpawnCandidate,
  config: TrafficConfig,
): boolean => occupiedIntersectionKeys({
  lane: candidate.lane,
  progress: candidate.progress,
  length: candidate.prototype.length,
}, config).length > 0

const initialCandidate = (
  input: CreateTrafficPoolInput,
  vehicleId: number,
  attempt: number,
): SpawnCandidate | null => {
  const directionIndex = vehicleId < DIRECTIONS.length
    ? vehicleId
    : hashChoice(input.seed, vehicleId, attempt, 0x101) % DIRECTIONS.length
  const direction = directionAt(directionIndex)
  const matchingPrototypes = prototypesForDirection(input.prototypes, direction)
  const prototype = matchingPrototypes[
    hashChoice(input.seed, vehicleId, attempt, 0x102) % matchingPrototypes.length
  ]
  if (prototype === undefined) return null

  const laneRadius = Math.max(1, Math.floor(input.config.simulationRadius / BLOCK_SIZE))
  const lineOffset = hashChoice(input.seed, vehicleId, attempt, 0x103)
    % (laneRadius * 2 + 1) - laneRadius
  const lane: Lane = {
    direction,
    line: nearestLaneLine(direction, input.camera) + lineOffset,
  }
  const slotSpacing = Math.max(input.config.minimumGap + prototype.length, BLOCK_SIZE / 5)
  const slotRadius = Math.max(1, Math.floor(input.config.simulationRadius / slotSpacing))
  const slot = hashChoice(input.seed, vehicleId, attempt, 0x104)
    % (slotRadius * 2 + 1) - slotRadius
  const progress = cameraProgress(direction, input.camera) + slot * slotSpacing

  return {
    prototype,
    lane,
    progress,
    desiredSpeed: MINIMUM_DESIRED_SPEED
      + hashChoice(input.seed, vehicleId, attempt, 0x105) % DESIRED_SPEED_COUNT,
  }
}

const recycledCandidate = (
  input: RecycleTrafficInput,
  vehicle: VehicleState,
  attempt: number,
): SpawnCandidate | null => {
  const candidateAttempt = input.step * RECYCLE_ATTEMPTS + attempt
  const direction = directionAt(
    hashChoice(input.seed, vehicle.id, candidateAttempt, 0x201) % DIRECTIONS.length,
  )
  const matchingPrototypes = prototypesForDirection(input.prototypes, direction)
  const prototype = matchingPrototypes[
    hashChoice(input.seed, vehicle.id, candidateAttempt, 0x202) % matchingPrototypes.length
  ]
  if (prototype === undefined) return null

  const hiddenMinimum = input.config.protectedRadius + Number.EPSILON * BLOCK_SIZE
  const hiddenMaximum = input.config.simulationRadius
  if (hiddenMaximum <= hiddenMinimum) return null

  const laneRadius = Math.max(1, Math.floor(hiddenMaximum / BLOCK_SIZE))
  const lineOffset = hashChoice(input.seed, vehicle.id, candidateAttempt, 0x203)
    % (laneRadius * 2 + 1) - laneRadius
  const lane: Lane = {
    direction,
    line: nearestLaneLine(direction, input.camera) + lineOffset,
  }
  const lanePoint = positionOnLane(lane, cameraProgress(direction, input.camera))
  const lateralDistance = direction === 'east' || direction === 'west'
    ? Math.abs(lanePoint.z - input.camera.z)
    : Math.abs(lanePoint.x - input.camera.x)
  const distanceFraction = hashChoice(input.seed, vehicle.id, candidateAttempt, 0x204)
    / 0xffff_ffff
  const targetDistance = hiddenMinimum
    + (hiddenMaximum - hiddenMinimum) * distanceFraction
  if (lateralDistance >= targetDistance) return null

  const longitudinalDistance = Math.sqrt(
    targetDistance * targetDistance - lateralDistance * lateralDistance,
  )

  return {
    prototype,
    lane,
    progress: cameraProgress(direction, input.camera) - longitudinalDistance,
    desiredSpeed: MINIMUM_DESIRED_SPEED
      + hashChoice(input.seed, vehicle.id, candidateAttempt, 0x205) % DESIRED_SPEED_COUNT,
  }
}

const assignCandidate = (
  vehicle: VehicleState,
  candidate: SpawnCandidate,
  seed: number,
): void => {
  vehicle.prototypeId = candidate.prototype.id
  vehicle.length = candidate.prototype.length
  vehicle.lane = candidate.lane
  vehicle.nativeDirection = candidate.prototype.direction
  vehicle.previousProgress = candidate.progress
  vehicle.progress = candidate.progress
  vehicle.speed = 0
  vehicle.desiredSpeed = candidate.desiredSpeed
  vehicle.active = true
  vehicle.reservationKey = null
  vehicle.lifecycle += 1
  vehicle.traits = createDriverTraits(seed, vehicle.id, vehicle.lifecycle)
  vehicle.routeDecisionIndex = 0
  vehicle.offscreenStoppedSteps = 0
  vehicle.requestAgeSteps = 0
  vehicle.grantExpiresAtStep = null
  vehicle.ownedZoneKeys = []
  vehicle.plannedMovement = null
  vehicle.turn = null
  vehicle.clearingMovement = null
  vehicle.previousPose = {
    ...positionOnLane(candidate.lane, candidate.progress),
    heading: headingForDirection(candidate.lane.direction),
  }
}

export const createTrafficPool = (input: CreateTrafficPoolInput): VehicleState[] => {
  const vehicles: VehicleState[] = []

  for (let id = 0; id < input.count; id += 1) {
    let accepted: SpawnCandidate | null = null

    for (let attempt = 0; attempt < INITIAL_ATTEMPTS; attempt += 1) {
      const candidate = initialCandidate(input, id, attempt)
      if (candidate === null) continue
      if (distanceFromCamera(candidate.lane, candidate.progress, input.camera)
        > input.config.simulationRadius) continue
      if (intersectsConflictZone(candidate, input.config)) continue
      if (!hasMinimumGaps(candidate, vehicles, input.config.minimumGap)) continue
      accepted = candidate
      break
    }

    if (accepted === null) {
      throw new Error(`Unable to place traffic vehicle ${id}`)
    }

    vehicles.push({
      id,
      prototypeId: accepted.prototype.id,
      length: accepted.prototype.length,
      lane: accepted.lane,
      nativeDirection: accepted.prototype.direction,
      previousProgress: accepted.progress,
      progress: accepted.progress,
      speed: 0,
      desiredSpeed: accepted.desiredSpeed,
      active: true,
      reservationKey: null,
      lifecycle: 0,
      traits: createDriverTraits(input.seed, id, 0),
      routeDecisionIndex: 0,
      offscreenStoppedSteps: 0,
      requestAgeSteps: 0,
      grantExpiresAtStep: null,
      ownedZoneKeys: [],
      plannedMovement: null,
      turn: null,
      clearingMovement: null,
      previousPose: {
        ...positionOnLane(accepted.lane, accepted.progress),
        heading: headingForDirection(accepted.lane.direction),
      },
    })
  }

  return vehicles
}

export const recycleTraffic = (input: RecycleTrafficInput): void => {
  for (const vehicle of input.vehicles) {
    if (
      vehicle.active
      && distanceFromCamera(vehicle.lane, vehicle.progress, input.camera)
        <= input.config.simulationRadius
    ) {
      continue
    }

    vehicle.active = false
    vehicle.reservationKey = null
    vehicle.requestAgeSteps = 0
    vehicle.grantExpiresAtStep = null
    vehicle.ownedZoneKeys = []

    for (let attempt = 0; attempt < RECYCLE_ATTEMPTS; attempt += 1) {
      const candidate = recycledCandidate(input, vehicle, attempt)
      if (candidate === null) continue
      const candidateDistance = distanceFromCamera(
        candidate.lane,
        candidate.progress,
        input.camera,
      )
      if (
        candidateDistance <= input.config.protectedRadius
        || candidateDistance > input.config.simulationRadius
      ) continue
      if (intersectsConflictZone(candidate, input.config)) continue
      if (!hasMinimumGaps(candidate, input.vehicles, input.config.minimumGap, vehicle.id)) continue

      assignCandidate(vehicle, candidate, input.seed)
      break
    }
  }
}
