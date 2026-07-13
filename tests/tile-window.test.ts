import { describe, expect, it } from 'vitest'
import { coordinateKey } from '../src/city/types'
import { desiredTileWindow, diffTileWindow } from '../src/city/tile-window'

describe('desiredTileWindow', () => {
  it('enumerates every unique coordinate in a centered odd square', () => {
    const coordinates = desiredTileWindow({ x: 12, z: -8 }, 9)

    expect(coordinates).toHaveLength(81)
    expect(new Set(coordinates.map(coordinateKey)).size).toBe(81)
    expect(coordinates).toContainEqual({ x: 8, z: -12 })
    expect(coordinates).toContainEqual({ x: 16, z: -4 })
  })

  it('rejects diameters that are not positive odd integers', () => {
    expect(() => desiredTileWindow({ x: 0, z: 0 }, 8)).toThrow(
      'diameter must be a positive odd integer',
    )
    expect(() => desiredTileWindow({ x: 0, z: 0 }, 0)).toThrow(
      'diameter must be a positive odd integer',
    )
    expect(() => desiredTileWindow({ x: 0, z: 0 }, 3.5)).toThrow(
      'diameter must be a positive odd integer',
    )
  })
})

describe('diffTileWindow', () => {
  it('sorts retained, released, and requested entries by coordinate key', () => {
    const current = new Map([
      ['2:0', { x: 2, z: 0 }],
      ['-1:0', { x: -1, z: 0 }],
      ['10:0', { x: 10, z: 0 }],
      ['0:0', { x: 0, z: 0 }],
    ])
    const desired = [
      { x: 3, z: 0 },
      { x: -1, z: 0 },
      { x: -2, z: 0 },
      { x: 0, z: 0 },
    ]

    expect(diffTileWindow(current, desired)).toEqual({
      retainedKeys: ['-1:0', '0:0'],
      releasedKeys: ['10:0', '2:0'],
      requested: [{ x: -2, z: 0 }, { x: 3, z: 0 }],
    })
  })
})
