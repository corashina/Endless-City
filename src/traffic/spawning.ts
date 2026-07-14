import { hashCoordinates } from '../city/hash'
import type { WorldPoint } from '../city/types'
import { BLOCK_SIZE } from '../config'
import { occupiedIntersectionKeys } from './intersections'
import { laneKey, positionOnLane } from './lanes'
import { createDriverTraits, seededUnit } from './random'
import { headingForDirection, poseForVehicle } from './routing'
import type {
  Direction,
  DriverTraits,
  Lane,
  TrafficConfig,
  VehiclePrototypeMetadata,
  VehicleState,
} from './types'

const DIRECTIONS: readonly Direction[] = ['east', 'west', 'north', 'south']
const INITIAL_ATTEMPTS = 1024
const RECYCLE_ATTEMPTS = 128
const INITIAL_BOUNDARY_FRACTION = 0.12
const MINIMUM_STARTING_SPEED_FRACTION = 0.35
const STARTING_SPEED_FRACTION_RANGE = 0.5

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
  readonly speed: number
  readonly desiredSpeed: number
  readonly traits: DriverTraits
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

const activeDirectionCounts = (
  vehicles: readonly VehicleState[],
): ReadonlyMap<Direction, number> => {
  const counts = new Map<Direction, number>(DIRECTIONS.map((direction) => [direction, 0]))
  for (const vehicle of vehicles) {
    if (!vehicle.active) continue
    counts.set(vehicle.lane.direction, (counts.get(vehicle.lane.direction) ?? 0) + 1)
  }
  return counts
}

const balancedDirection = (
  vehicles: readonly VehicleState[],
  seed: number,
  vehicleId: number,
  attempt: number,
  salt: number,
): Direction => {
  const counts = activeDirectionCounts(vehicles)
  const minimum = Math.min(...DIRECTIONS.map((direction) => counts.get(direction) ?? 0))
  const candidates = DIRECTIONS.filter((direction) => (counts.get(direction) ?? 0) <= minimum + 1)
  const direction = candidates[hashChoice(seed, vehicleId, attempt, salt) % candidates.length]
  if (direction === undefined) throw new Error('No balanced traffic direction available')
  return direction
}

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

export const closestLaneDistance = (lane: Lane, camera: WorldPoint): number => {
  const lanePoint = positionOnLane(lane, cameraProgress(lane.direction, camera))
  return lane.direction === 'east' || lane.direction === 'west'
    ? Math.abs(lanePoint.z - camera.z)
    : Math.abs(lanePoint.x - camera.x)
}

const hasMinimumGaps = (
  candidate: SpawnCandidate,
  vehicles: readonly VehicleState[],
  configuredMinimumGap: number,
  ignoredVehicleId?: number,
): boolean => {
  const candidateLaneKey = laneKey(candidate.lane)
  const candidatePosition = positionOnLane(candidate.lane, candidate.progress)

  for (const vehicle of vehicles) {
    if (!vehicle.active || vehicle.id === ignoredVehicleId) continue
    const sameCandidateLane = laneKey(vehicle.lane) === candidateLaneKey
    if (!sameCandidateLane && vehicle.turn === null) continue

    const requiredGap = Math.max(
      configuredMinimumGap,
      candidate.traits.minimumGap,
      vehicle.traits.minimumGap,
    )
    const requiredCenterGap = requiredGap + (candidate.prototype.length + vehicle.length) / 2
    const centerDistance = vehicle.turn === null
      ? Math.abs(candidate.progress - vehicle.progress)
      : (() => {
          const pose = poseForVehicle(vehicle)
          return Math.hypot(candidatePosition.x - pose.x, candidatePosition.z - pose.z)
        })()
    if (centerDistance < requiredCenterGap) return false
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
  vehicles: readonly VehicleState[],
  vehicleId: number,
  attempt: number,
): SpawnCandidate | null => {
  const direction = balancedDirection(vehicles, input.seed, vehicleId, attempt, 0x101)
  const matchingPrototypes = prototypesForDirection(input.prototypes, direction)
  const prototype = matchingPrototypes[
    hashChoice(input.seed, vehicleId, attempt, 0x102) % matchingPrototypes.length
  ]
  if (prototype === undefined) return null

  const traits = createDriverTraits(input.seed, vehicleId, 0)
  const laneRadius = Math.max(1, Math.ceil(input.config.protectedRadius / BLOCK_SIZE) + 1)
  const lineOffset = hashChoice(input.seed, vehicleId, attempt, 0x103)
    % (laneRadius * 2 + 1) - laneRadius
  const lane: Lane = {
    direction,
    line: nearestLaneLine(direction, input.camera) + lineOffset,
  }
  if (closestLaneDistance(lane, input.camera) >= input.config.protectedRadius - prototype.length / 2) {
    return null
  }

  const longitudinalLimit = Math.sqrt(
    (input.config.protectedRadius * (1 + INITIAL_BOUNDARY_FRACTION)) ** 2
      - closestLaneDistance(lane, input.camera) ** 2,
  )
  const longitudinalOffset = (seededUnit(input.seed, vehicleId, attempt, 0x104) * 2 - 1)
    * longitudinalLimit
  const progress = cameraProgress(direction, input.camera) + longitudinalOffset
  const speedFraction = MINIMUM_STARTING_SPEED_FRACTION
    + seededUnit(input.seed, vehicleId, attempt, 0x106) * STARTING_SPEED_FRACTION_RANGE

  return {
    prototype,
    lane,
    progress,
    speed: traits.cruiseSpeed * speedFraction,
    desiredSpeed: traits.cruiseSpeed,
    traits,
  }
}

const recycledCandidate = (
  input: RecycleTrafficInput,
  vehicle: VehicleState,
  attempt: number,
): SpawnCandidate | null => {
  const candidateAttempt = input.step * RECYCLE_ATTEMPTS + attempt
  const direction = balancedDirection(
    input.vehicles,
    input.seed,
    vehicle.id,
    candidateAttempt,
    0x201,
  )
  const matchingPrototypes = prototypesForDirection(input.prototypes, direction)
  const prototype = matchingPrototypes[
    hashChoice(input.seed, vehicle.id, candidateAttempt, 0x202) % matchingPrototypes.length
  ]
  if (prototype === undefined) return null

  const traits = createDriverTraits(input.seed, vehicle.id, vehicle.lifecycle + 1)
  const hiddenMinimum = input.config.protectedRadius + prototype.length / 2
  const hiddenMaximum = input.config.simulationRadius - prototype.length / 2
  if (hiddenMaximum <= hiddenMinimum) return null

  const laneRadius = Math.max(1, Math.ceil(input.config.protectedRadius / BLOCK_SIZE) + 1)
  const lineOffset = hashChoice(input.seed, vehicle.id, candidateAttempt, 0x203)
    % (laneRadius * 2 + 1) - laneRadius
  const lane: Lane = {
    direction,
    line: nearestLaneLine(direction, input.camera) + lineOffset,
  }
  const lateralDistance = closestLaneDistance(lane, input.camera)
  if (lateralDistance >= input.config.protectedRadius - prototype.length / 2) return null
  const distanceFraction = seededUnit(input.seed, vehicle.id, candidateAttempt, 0x204)
  const targetDistance = hiddenMinimum
    + (hiddenMaximum - hiddenMinimum) * distanceFraction
  if (lateralDistance >= targetDistance) return null

  const longitudinalDistance = Math.sqrt(
    targetDistance * targetDistance - lateralDistance * lateralDistance,
  )
  const speedFraction = MINIMUM_STARTING_SPEED_FRACTION
    + seededUnit(input.seed, vehicle.id, candidateAttempt, 0x206)
      * STARTING_SPEED_FRACTION_RANGE

  return {
    prototype,
    lane,
    progress: cameraProgress(direction, input.camera) - longitudinalDistance,
    speed: traits.cruiseSpeed * speedFraction,
    desiredSpeed: traits.cruiseSpeed,
    traits,
  }
}

const assignCandidate = (
  vehicle: VehicleState,
  candidate: SpawnCandidate,
): void => {
  vehicle.prototypeId = candidate.prototype.id
  vehicle.length = candidate.prototype.length
  vehicle.lane = candidate.lane
  vehicle.nativeDirection = candidate.prototype.direction
  vehicle.previousProgress = candidate.progress
  vehicle.progress = candidate.progress
  vehicle.speed = candidate.speed
  vehicle.desiredSpeed = candidate.desiredSpeed
  vehicle.active = true
  vehicle.reservationKey = null
  vehicle.lifecycle += 1
  vehicle.traits = candidate.traits
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
      const candidate = initialCandidate(input, vehicles, id, attempt)
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
      speed: accepted.speed,
      desiredSpeed: accepted.desiredSpeed,
      active: true,
      reservationKey: null,
      lifecycle: 0,
      traits: accepted.traits,
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
    const pose = poseForVehicle(vehicle)
    const cameraDistance = Math.hypot(pose.x - input.camera.x, pose.z - input.camera.z)
    const stalledOffscreen = vehicle.offscreenStoppedSteps
      >= input.config.offscreenStoppedTimeoutSteps
    if (
      vehicle.active
      && cameraDistance <= input.config.simulationRadius
      && !stalledOffscreen
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

      assignCandidate(vehicle, candidate)
      break
    }
  }
}
