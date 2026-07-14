import type { Bounds2D, Footprint, Placement, QuarterTurn } from './types'

export const PLOT_MIN = -10
export const PLOT_MAX = 30
const EPSILON = 1e-6

export function rotateFootprint(footprint: Footprint, rotation: QuarterTurn): Footprint {
  return rotation % 2 === 0
    ? footprint
    : { width: footprint.depth, depth: footprint.width }
}

export function placementBounds(
  footprint: Footprint,
  placement: Pick<Placement, 'x' | 'z' | 'rotation'>,
): Bounds2D {
  const rotated = rotateFootprint(footprint, placement.rotation)
  return {
    minX: placement.x - rotated.width / 2,
    maxX: placement.x + rotated.width / 2,
    minZ: placement.z - rotated.depth / 2,
    maxZ: placement.z + rotated.depth / 2,
  }
}

export function boundsOverlap(left: Bounds2D, right: Bounds2D): boolean {
  return left.minX < right.maxX - EPSILON
    && left.maxX > right.minX + EPSILON
    && left.minZ < right.maxZ - EPSILON
    && left.maxZ > right.minZ + EPSILON
}

export function insidePlot(bounds: Bounds2D): boolean {
  return bounds.minX >= PLOT_MIN - EPSILON
    && bounds.maxX <= PLOT_MAX + EPSILON
    && bounds.minZ >= PLOT_MIN - EPSILON
    && bounds.maxZ <= PLOT_MAX + EPSILON
}
