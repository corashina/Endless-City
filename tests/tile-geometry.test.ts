import { describe, expect, it } from 'vitest'
import {
  boundsOverlap,
  insidePlot,
  placementBounds,
  rotateFootprint,
} from '../tools/tiles/geometry'

describe('tile recipe geometry', () => {
  it('swaps width and depth for odd quarter turns', () => {
    expect(rotateFootprint({ width: 12, depth: 18 }, 0)).toEqual({ width: 12, depth: 18 })
    expect(rotateFootprint({ width: 12, depth: 18 }, 1)).toEqual({ width: 18, depth: 12 })
    expect(rotateFootprint({ width: 12, depth: 18 }, 2)).toEqual({ width: 12, depth: 18 })
    expect(rotateFootprint({ width: 12, depth: 18 }, 3)).toEqual({ width: 18, depth: 12 })
  })

  it('builds centered placement bounds', () => {
    expect(placementBounds({ width: 12, depth: 18 }, { x: 4, z: 8, rotation: 1 }))
      .toEqual({ minX: -5, maxX: 13, minZ: 2, maxZ: 14 })
  })

  it('allows touching edges but rejects positive-area overlap', () => {
    const left = { minX: -10, maxX: 0, minZ: -10, maxZ: 10 }
    expect(boundsOverlap(left, { minX: 0, maxX: 10, minZ: -10, maxZ: 10 })).toBe(false)
    expect(boundsOverlap(left, { minX: -0.01, maxX: 10, minZ: -10, maxZ: 10 })).toBe(true)
  })

  it('checks the authored plot envelope inclusively', () => {
    expect(insidePlot({ minX: -10, maxX: 30, minZ: -10, maxZ: 30 })).toBe(true)
    expect(insidePlot({ minX: -10.01, maxX: 30, minZ: -10, maxZ: 30 })).toBe(false)
  })
})
