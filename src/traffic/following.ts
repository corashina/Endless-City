import { laneKey } from './lanes'
import type { TrafficConfig, VehicleState } from './types'

interface LeaderState {
  readonly progress: number
  readonly length: number
}

export interface FixedStepResult {
  readonly steps: number
  readonly alpha: number
  readonly accumulator: number
}

const nearestLeader = (
  vehicle: VehicleState,
  laneLeader: VehicleState | undefined,
  stopProgressByVehicle: ReadonlyMap<number, number> | undefined,
): LeaderState | undefined => {
  const stopProgress = stopProgressByVehicle?.get(vehicle.id)

  if (stopProgress === undefined) {
    return laneLeader
  }

  if (laneLeader === undefined || stopProgress < laneLeader.progress - laneLeader.length / 2) {
    return { progress: stopProgress, length: 0 }
  }

  return laneLeader
}

export const stepFollowing = (
  vehicles: readonly VehicleState[],
  deltaSeconds: number,
  config: TrafficConfig,
  stopProgressByVehicle?: ReadonlyMap<number, number>,
): void => {
  const vehiclesByLane = new Map<string, VehicleState[]>()

  for (const vehicle of vehicles) {
    if (!vehicle.active) continue

    const key = laneKey(vehicle.lane)
    const laneVehicles = vehiclesByLane.get(key)

    if (laneVehicles === undefined) {
      vehiclesByLane.set(key, [vehicle])
    } else {
      laneVehicles.push(vehicle)
    }
  }

  for (const laneVehicles of vehiclesByLane.values()) {
    laneVehicles.sort((left, right) => left.progress - right.progress || left.id - right.id)

    for (let index = laneVehicles.length - 1; index >= 0; index -= 1) {
      const vehicle = laneVehicles[index]
      if (vehicle === undefined) continue

      const leader = nearestLeader(vehicle, laneVehicles[index + 1], stopProgressByVehicle)
      const gap = leader === undefined
        ? Number.POSITIVE_INFINITY
        : leader.progress - vehicle.progress - (leader.length + vehicle.length) / 2
      const desiredGap = config.minimumGap + vehicle.speed * config.timeHeadway
      const speed = gap < desiredGap
        ? Math.max(0, vehicle.speed - config.comfortableBraking * deltaSeconds)
        : vehicle.speed > vehicle.desiredSpeed
          ? Math.max(
              vehicle.desiredSpeed,
              vehicle.speed - config.comfortableBraking * deltaSeconds,
            )
          : Math.min(vehicle.desiredSpeed, vehicle.speed + config.maximumAcceleration * deltaSeconds)
      const proposedProgress = vehicle.progress + speed * deltaSeconds

      if (leader === undefined) {
        vehicle.speed = speed
        vehicle.progress = proposedProgress
        continue
      }

      const maximumProgress = leader.progress - (leader.length + vehicle.length) / 2
      vehicle.speed = speed
      vehicle.progress = Math.min(proposedProgress, maximumProgress)
    }
  }
}

export const consumeFixedSteps = (
  accumulator: number,
  frameSeconds: number,
  stepSeconds: number,
  maximumFrameSeconds: number,
  step: () => void,
): FixedStepResult => {
  if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
    throw new RangeError('stepSeconds must be a finite positive number')
  }
  const clampedFrameSeconds = Math.min(Math.max(frameSeconds, 0), maximumFrameSeconds)
  const totalSeconds = accumulator + clampedFrameSeconds
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(totalSeconds / stepSeconds))
  const steps = Math.floor(totalSeconds / stepSeconds + tolerance)

  for (let index = 0; index < steps; index += 1) step()

  const remainder = totalSeconds - steps * stepSeconds
  const nextAccumulator = Math.abs(remainder) <= Number.EPSILON ? 0 : remainder

  return {
    steps,
    alpha: nextAccumulator / stepSeconds,
    accumulator: nextAccumulator,
  }
}
