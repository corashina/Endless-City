import { BLOCK_SIZE } from '../config'
import { CROSSING_CENTER_OFFSET, laneKey } from './lanes'
import { movementPoseAt } from './routing'
import type { PlannedMovement, TrafficConfig, VehicleState } from './types'

const SAMPLE_INTERVAL = 0.5
const CELL_SIZE = 2
const zoneCache = new WeakMap<PlannedMovement, Map<number, readonly string[]>>()

export interface MovementReservation {
  readonly vehicleId: number
  readonly movementKey: string
}

export type MovementReservations = Map<string, MovementReservation>

interface MovementRequest {
  readonly vehicle: VehicleState
  readonly movement: PlannedMovement
  readonly zoneKeys: readonly string[]
  readonly distanceToEntry: number
}

const corridorOffsets = (corridorHalfWidth: number): readonly [number, number][] => [
  [0, 0],
  [-corridorHalfWidth, -corridorHalfWidth],
  [-corridorHalfWidth, corridorHalfWidth],
  [corridorHalfWidth, -corridorHalfWidth],
  [corridorHalfWidth, corridorHalfWidth],
]

export function movementConflictZones(
  movement: PlannedMovement,
  corridorHalfWidth: number,
): readonly string[] {
  const cachedByWidth = zoneCache.get(movement)
  const cached = cachedByWidth?.get(corridorHalfWidth)
  if (cached !== undefined) return cached

  const centerX = movement.xIndex * BLOCK_SIZE + CROSSING_CENTER_OFFSET
  const centerZ = movement.zIndex * BLOCK_SIZE + CROSSING_CENTER_OFFSET
  const offsets = corridorOffsets(corridorHalfWidth)
  const cells = new Set<string>()
  const sampleCount = Math.ceil(movement.length / SAMPLE_INTERVAL)

  for (let index = 0; index <= sampleCount; index += 1) {
    const distance = Math.min(movement.length, index * SAMPLE_INTERVAL)
    const pose = movementPoseAt(movement, distance)

    for (const [xOffset, zOffset] of offsets) {
      const xCell = Math.floor((pose.x + xOffset - centerX) / CELL_SIZE)
      const zCell = Math.floor((pose.z + zOffset - centerZ) / CELL_SIZE)
      cells.add(`${movement.intersectionKey}:${xCell}:${zCell}`)
    }
  }

  const zones = Object.freeze([...cells].sort())
  if (cachedByWidth === undefined) {
    zoneCache.set(movement, new Map([[corridorHalfWidth, zones]]))
  } else {
    cachedByWidth.set(corridorHalfWidth, zones)
  }
  return zones
}

export function movementsConflict(
  left: PlannedMovement,
  right: PlannedMovement,
  corridorHalfWidth: number,
): boolean {
  if (left.intersectionKey !== right.intersectionKey) return false

  const leftZones = new Set(movementConflictZones(left, corridorHalfWidth))
  return movementConflictZones(right, corridorHalfWidth).some((key) => leftZones.has(key))
}

const releaseOwnedZones = (
  vehicle: VehicleState,
  reservations: MovementReservations,
): void => {
  for (const key of vehicle.ownedZoneKeys) {
    if (reservations.get(key)?.vehicleId === vehicle.id) reservations.delete(key)
  }
  vehicle.ownedZoneKeys = []
  vehicle.grantExpiresAtStep = null
  vehicle.reservationKey = null
  vehicle.clearingMovement = null
}

const enteredMovementCleared = (vehicle: VehicleState): boolean => {
  if (vehicle.turn !== null) {
    return vehicle.turn.distance - vehicle.length / 2 > vehicle.turn.movement.length
  }
  if (vehicle.clearingMovement !== null) {
    return vehicle.progress - vehicle.length / 2 > vehicle.clearingMovement.exitProgress
  }
  return false
}

const outgoingLaneBlocked = (
  request: MovementRequest,
  vehiclesByLane: ReadonlyMap<string, readonly VehicleState[]>,
): boolean => {
  const outgoingVehicles = vehiclesByLane.get(laneKey(request.movement.outgoingLane)) ?? []
  const requiredClearance = request.vehicle.traits.minimumGap + request.vehicle.length

  for (const vehicle of outgoingVehicles) {
    if (vehicle.id === request.vehicle.id) continue
    const rearBumper = vehicle.progress - vehicle.length / 2
    if (Math.abs(rearBumper - request.movement.exitProgress) <= requiredClearance) return true
  }

  return false
}

export function updateMovementReservations(
  vehicles: readonly VehicleState[],
  reservations: MovementReservations,
  config: TrafficConfig,
  stepNumber: number,
): { readonly stops: ReadonlyMap<number, number> } {
  const vehiclesById = new Map<number, VehicleState>()
  const vehiclesByLane = new Map<string, VehicleState[]>()

  for (const vehicle of vehicles) {
    vehiclesById.set(vehicle.id, vehicle)
    if (!vehicle.active) continue

    const key = laneKey(vehicle.lane)
    const laneVehicles = vehiclesByLane.get(key)
    if (laneVehicles === undefined) vehiclesByLane.set(key, [vehicle])
    else laneVehicles.push(vehicle)

  }

  for (const laneVehicles of vehiclesByLane.values()) {
    laneVehicles.sort((left, right) => left.progress - right.progress || left.id - right.id)
  }
  const expiredVehicleIds = new Set<number>()
  const stops = new Map<number, number>()

  for (const vehicle of vehicles) {
    if (vehicle.ownedZoneKeys.length === 0) {
      vehicle.grantExpiresAtStep = null
      vehicle.clearingMovement = null
      continue
    }

    const grantExpired = vehicle.turn === null
      && vehicle.clearingMovement === null
      && vehicle.grantExpiresAtStep !== null
      && stepNumber > vehicle.grantExpiresAtStep
    const release = !vehicle.active
      || (
        vehicle.turn === null
        && vehicle.plannedMovement === null
        && vehicle.clearingMovement === null
      )
      || grantExpired
      || enteredMovementCleared(vehicle)

    if (!release) continue
    if (grantExpired) {
      expiredVehicleIds.add(vehicle.id)
      if (vehicle.active && vehicle.plannedMovement !== null) {
        stops.set(vehicle.id, vehicle.plannedMovement.entryProgress)
      }
    }
    releaseOwnedZones(vehicle, reservations)
  }

  for (const [key, reservation] of reservations) {
    const holder = vehiclesById.get(reservation.vehicleId)
    if (
      holder === undefined
      || !holder.active
      || !holder.ownedZoneKeys.includes(key)
    ) {
      reservations.delete(key)
    }
  }

  const requests: MovementRequest[] = []

  for (const vehicle of vehicles) {
    if (
      !vehicle.active
      || vehicle.turn !== null
      || vehicle.plannedMovement === null
      || vehicle.ownedZoneKeys.length > 0
      || expiredVehicleIds.has(vehicle.id)
    ) continue

    const distanceToEntry = vehicle.plannedMovement.entryProgress
      - (vehicle.progress + vehicle.length / 2)
    if (distanceToEntry > config.reservationLookAhead) continue

    requests.push({
      vehicle,
      movement: vehicle.plannedMovement,
      zoneKeys: movementConflictZones(
        vehicle.plannedMovement,
        config.movementCorridorHalfWidth,
      ),
      distanceToEntry,
    })
  }

  requests.sort((left, right) =>
    right.vehicle.requestAgeSteps - left.vehicle.requestAgeSteps
    || left.distanceToEntry - right.distanceToEntry
    || left.vehicle.id - right.vehicle.id,
  )

  for (const request of requests) {
    const blocked = outgoingLaneBlocked(request, vehiclesByLane)
      || request.zoneKeys.some((key) => reservations.has(key))

    if (blocked) {
      stops.set(request.vehicle.id, request.movement.entryProgress)
      request.vehicle.requestAgeSteps += 1
      continue
    }

    const reservation: MovementReservation = {
      vehicleId: request.vehicle.id,
      movementKey: request.movement.key,
    }
    for (const key of request.zoneKeys) {
      reservations.set(key, reservation)
    }
    request.vehicle.ownedZoneKeys = [...request.zoneKeys]
    request.vehicle.grantExpiresAtStep = stepNumber + config.reservationLifetimeSteps
    request.vehicle.requestAgeSteps = 0
  }

  return { stops }
}
