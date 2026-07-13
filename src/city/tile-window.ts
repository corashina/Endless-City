import { coordinateKey, type GridCoordinate } from './types'

export interface TileWindowDiff {
  readonly retainedKeys: string[]
  readonly releasedKeys: string[]
  readonly requested: GridCoordinate[]
}

export const compareGridCoordinates = (
  left: GridCoordinate,
  right: GridCoordinate,
): number => left.x - right.x || left.z - right.z

export function desiredTileWindow(center: GridCoordinate, diameter: number): GridCoordinate[] {
  if (!Number.isInteger(diameter) || diameter <= 0 || diameter % 2 === 0) {
    throw new Error('diameter must be a positive odd integer')
  }

  const radius = (diameter - 1) / 2
  const desired: GridCoordinate[] = []

  for (let xOffset = -radius; xOffset <= radius; xOffset += 1) {
    for (let zOffset = -radius; zOffset <= radius; zOffset += 1) {
      desired.push({ x: center.x + xOffset, z: center.z + zOffset })
    }
  }

  return desired
}

export function diffTileWindow(
  current: ReadonlyMap<string, GridCoordinate>,
  desired: readonly GridCoordinate[],
): TileWindowDiff {
  const desiredByKey = new Map(desired.map((coordinate) => [coordinateKey(coordinate), coordinate]))
  const retainedKeys = [...current.entries()]
    .filter(([key]) => desiredByKey.has(key))
    .sort(([, left], [, right]) => compareGridCoordinates(left, right))
    .map(([key]) => key)
  const releasedKeys = [...current.entries()]
    .filter(([key]) => !desiredByKey.has(key))
    .sort(([, left], [, right]) => compareGridCoordinates(left, right))
    .map(([key]) => key)
  const requested = [...desiredByKey.entries()]
    .filter(([key]) => !current.has(key))
    .sort(([, left], [, right]) => compareGridCoordinates(left, right))
    .map(([, coordinate]) => coordinate)

  return { retainedKeys, releasedKeys, requested }
}
