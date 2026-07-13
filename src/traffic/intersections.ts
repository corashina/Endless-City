import { nextIntersection } from './lanes'
import type { TrafficConfig, VehicleState } from './types'

export type IntersectionReservations = Map<string, number>

interface IntersectionRequest {
  readonly vehicle: VehicleState
  readonly key: string
  readonly distanceToStopLine: number
  readonly stopProgress: number
}

const holderStillOccupiesIntersection = (
  holder: VehicleState,
  reservationKey: string,
  config: TrafficConfig,
): boolean => {
  const rearBumperPastZone = holder.progress
    - holder.length / 2
    - config.intersectionHalfExtent

  return nextIntersection(holder.lane, rearBumperPastZone).key === reservationKey
}

export const updateIntersectionReservations = (
  vehicles: readonly VehicleState[],
  reservations: IntersectionReservations,
  config: TrafficConfig,
): Map<number, number> => {
  const vehiclesById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]))

  for (const [key, holderId] of reservations) {
    const holder = vehiclesById.get(holderId)

    if (
      holder === undefined
      || !holder.active
      || !holderStillOccupiesIntersection(holder, key, config)
    ) {
      reservations.delete(key)
      if (holder?.reservationKey === key) holder.reservationKey = null
      continue
    }

    holder.reservationKey = key
  }

  for (const vehicle of vehicles) {
    if (
      vehicle.reservationKey !== null
      && reservations.get(vehicle.reservationKey) !== vehicle.id
    ) {
      vehicle.reservationKey = null
    }
  }

  const requests: IntersectionRequest[] = []

  for (const vehicle of vehicles) {
    if (!vehicle.active || vehicle.reservationKey !== null) continue

    const intersection = nextIntersection(vehicle.lane, vehicle.progress)
    const stopProgress = intersection.progress - config.intersectionHalfExtent
    const distanceToStopLine = stopProgress - (vehicle.progress + vehicle.length / 2)

    if (distanceToStopLine <= config.reservationLookAhead) {
      requests.push({
        vehicle,
        key: intersection.key,
        distanceToStopLine,
        stopProgress,
      })
    }
  }

  requests.sort((left, right) =>
    left.distanceToStopLine - right.distanceToStopLine
    || left.vehicle.id - right.vehicle.id,
  )

  const intersectionStops = new Map<number, number>()

  for (const request of requests) {
    if (reservations.has(request.key)) {
      intersectionStops.set(request.vehicle.id, request.stopProgress)
      continue
    }

    reservations.set(request.key, request.vehicle.id)
    request.vehicle.reservationKey = request.key
  }

  return intersectionStops
}
