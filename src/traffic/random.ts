import { hashCoordinates } from '../city/hash'
import type { DriverProfile, DriverTraits, Maneuver } from './types'

const range = (value: number, minimum: number, maximum: number): number =>
  minimum + (maximum - minimum) * value

export const seededUnit = (
  seed: number,
  vehicleId: number,
  sequence: number,
  salt: number,
): number => hashCoordinates(seed, vehicleId, sequence, salt) / 0x1_0000_0000

const profileAt = (value: number): DriverProfile =>
  value < 0.25 ? 'cautious' : value < 0.8 ? 'normal' : 'assertive'

export function createDriverTraits(seed: number, vehicleId: number, lifecycle: number): DriverTraits {
  const profile = profileAt(seededUnit(seed, vehicleId, lifecycle, 0x301))
  const limits = profile === 'cautious'
    ? { speed: [7.5, 10], headway: [1.4, 1.8], gap: [3.5, 4.5] }
    : profile === 'normal'
      ? { speed: [9, 13], headway: [1, 1.5], gap: [2.5, 4] }
      : { speed: [11.5, 15], headway: [0.8, 1.2], gap: [2, 3] }

  return Object.freeze({
    profile,
    cruiseSpeed: range(
      seededUnit(seed, vehicleId, lifecycle, 0x302),
      limits.speed[0]!,
      limits.speed[1]!,
    ),
    maximumAcceleration: range(seededUnit(seed, vehicleId, lifecycle, 0x303), 1.4, 3),
    comfortableBraking: range(seededUnit(seed, vehicleId, lifecycle, 0x304), 3, 5.5),
    emergencyBraking: range(seededUnit(seed, vehicleId, lifecycle, 0x305), 7, 10),
    timeHeadway: range(
      seededUnit(seed, vehicleId, lifecycle, 0x306),
      limits.headway[0]!,
      limits.headway[1]!,
    ),
    minimumGap: range(
      seededUnit(seed, vehicleId, lifecycle, 0x307),
      limits.gap[0]!,
      limits.gap[1]!,
    ),
  })
}

export function chooseManeuver(
  seed: number,
  vehicleId: number,
  decisionIndex: number,
  profile: DriverProfile,
): Maneuver {
  const straightWeight = profile === 'cautious' ? 0.65 : profile === 'assertive' ? 0.45 : 0.55
  const value = seededUnit(seed, vehicleId, decisionIndex, 0x308)
  if (value < straightWeight) return 'straight'
  return value < straightWeight + (1 - straightWeight) / 2 ? 'left' : 'right'
}
