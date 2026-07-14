import { BLOCK_SIZE } from '../config'
import { nextIntersection } from './lanes'
import type { TrafficConfig, VehicleState } from './types'

export const occupiedIntersectionKeys = (
  vehicle: Pick<VehicleState, 'lane' | 'progress' | 'length'>,
  config: Pick<TrafficConfig, 'intersectionHalfExtent'>,
): readonly string[] => {
  const rearBumper = vehicle.progress - vehicle.length / 2
  const frontBumper = vehicle.progress + vehicle.length / 2
  const keys: string[] = []
  let intersection = nextIntersection(
    vehicle.lane,
    rearBumper - config.intersectionHalfExtent,
  )

  while (intersection.progress < frontBumper + config.intersectionHalfExtent) {
    if (
      frontBumper > intersection.progress - config.intersectionHalfExtent
      && rearBumper < intersection.progress + config.intersectionHalfExtent
    ) {
      keys.push(intersection.key)
    }

    intersection = nextIntersection(vehicle.lane, intersection.progress + BLOCK_SIZE / 2)
  }

  return keys
}
