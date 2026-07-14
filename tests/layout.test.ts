import { describe, expect, it } from 'vitest'
import { BUILDING_CATALOG, chooseTile } from '../src/city/layout'

describe('chooseTile', () => {
  it('returns the same tile for the same signed coordinate', () => {
    expect(chooseTile({ x: -81, z: 144 }, 0x5eedc17)).toEqual(
      chooseTile({ x: -81, z: 144 }, 0x5eedc17),
    )
  })

  it('uses only existing unique building assets and quarter turns', () => {
    const ids = new Set(BUILDING_CATALOG.map((entry) => entry.id))
    expect(ids.size).toBe(27)
    for (let x = -20; x <= 20; x += 1) {
      const tile = chooseTile({ x, z: x * -3 }, 0x5eedc17)
      expect(ids.has(tile.building)).toBe(true)
      expect([0, 1, 2, 3]).toContain(tile.rotation)
    }
  })

  it('contains all curated remix IDs with positive weights', () => {
    const remix = BUILDING_CATALOG.filter(({ id }) => id.startsWith('remix-'))
    expect(remix).toHaveLength(12)
    expect(remix.every(({ weight }) => Number.isInteger(weight) && weight > 0)).toBe(true)
  })

  it('does not collapse negative coordinates onto positive ones', () => {
    const positive = Array.from({ length: 16 }, (_, x) => chooseTile({ x, z: 7 }, 0x5eedc17))
    const negative = Array.from({ length: 16 }, (_, x) => chooseTile({ x: -x - 1, z: -7 }, 0x5eedc17))
    expect(negative).not.toEqual(positive)
  })

  it('is independent of coordinate visitation order', () => {
    const coordinates = [{ x: 2, z: 9 }, { x: -8, z: 1 }, { x: 44, z: -31 }]
    const forward = new Map(coordinates.map((coordinate) => [JSON.stringify(coordinate), chooseTile(coordinate, 0x5eedc17)]))
    const reverse = new Map([...coordinates].reverse().map((coordinate) => [JSON.stringify(coordinate), chooseTile(coordinate, 0x5eedc17)]))
    expect(reverse).toEqual(forward)
  })

  it('keeps landmarks rarer than common residential tiles', () => {
    const counts = new Map<string, number>()
    for (let x = -25; x < 25; x += 1) for (let z = -25; z < 25; z += 1) {
      const id = chooseTile({ x, z }, 0x5eedc17).building
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    expect(counts.get('stadium') ?? 0).toBeLessThan(counts.get('house') ?? 0)
    expect(counts.size).toBe(27)
  })
})
