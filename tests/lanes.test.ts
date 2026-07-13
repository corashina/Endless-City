import { describe, expect, it } from 'vitest'
import {
  intersectionKey,
  laneKey,
  nextIntersection,
  positionOnLane,
} from '../src/traffic/lanes'

describe('lane geometry', () => {
  it('uses stable lane and intersection keys', () => {
    expect(laneKey({ direction: 'north', line: -2 })).toBe('north:-2')
    expect(intersectionKey(3, -4)).toBe('3:-4')
  })

  it('positions eastbound traffic on its authored lane offset', () => {
    expect(positionOnLane({ direction: 'east', line: 0 }, 100)).toEqual({ x: 100, z: -16 })
  })

  it('positions westbound traffic on its authored lane offset', () => {
    expect(positionOnLane({ direction: 'west', line: 0 }, 100)).toEqual({ x: -100, z: -23 })
  })

  it('positions northbound traffic on its authored lane offset', () => {
    expect(positionOnLane({ direction: 'north', line: 0 }, 100)).toEqual({ x: -23, z: 100 })
  })

  it('positions southbound traffic on its authored lane offset', () => {
    expect(positionOnLane({ direction: 'south', line: 0 }, 100)).toEqual({ x: -16, z: -100 })
  })

  it('finds the next eastbound crossing on the lane line', () => {
    expect(nextIntersection({ direction: 'east', line: 2 }, 15)).toEqual({
      key: '1:2',
      point: { x: 40, z: 100 },
      progress: 40,
    })
  })

  it('finds crossings at or ahead in every travel direction', () => {
    expect(nextIntersection({ direction: 'west', line: -1 }, 21)).toEqual({
      key: '-1:-1',
      point: { x: -80, z: -80 },
      progress: 80,
    })
    expect(nextIntersection({ direction: 'north', line: 3 }, 40)).toEqual({
      key: '3:1',
      point: { x: 160, z: 40 },
      progress: 40,
    })
    expect(nextIntersection({ direction: 'south', line: 4 }, 20)).toEqual({
      key: '4:0',
      point: { x: 220, z: -20 },
      progress: 20,
    })
  })
})
