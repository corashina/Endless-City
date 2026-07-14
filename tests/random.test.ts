import { describe, expect, it } from 'vitest'
import { chooseManeuver, createDriverTraits, seededUnit } from '../src/traffic/random'

describe('traffic randomness', () => {
  it('returns a stable unit scalar without coupling property salts', () => {
    expect(seededUnit(12345, 7, 2, 0x10)).toBe(seededUnit(12345, 7, 2, 0x10))
    expect(seededUnit(12345, 7, 2, 0x10)).toBeGreaterThanOrEqual(0)
    expect(seededUnit(12345, 7, 2, 0x10)).toBeLessThan(1)
    expect(seededUnit(12345, 7, 2, 0x10)).not.toBe(seededUnit(12345, 7, 2, 0x11))
  })

  it('creates varied, bounded, repeatable driver traits', () => {
    const traits = Array.from({ length: 72 }, (_, id) => createDriverTraits(24680, id, 0))
    expect(traits).toEqual(
      Array.from({ length: 72 }, (_, id) => createDriverTraits(24680, id, 0)),
    )
    expect(new Set(traits.map(({ profile }) => profile))).toEqual(
      new Set(['cautious', 'normal', 'assertive']),
    )
    expect(Math.min(...traits.map(({ cruiseSpeed }) => cruiseSpeed))).toBeGreaterThanOrEqual(7.5)
    expect(Math.max(...traits.map(({ cruiseSpeed }) => cruiseSpeed))).toBeLessThanOrEqual(15)
    expect(Math.min(...traits.map(({ emergencyBraking }) => emergencyBraking))).toBeGreaterThanOrEqual(7)
    expect(Math.max(...traits.map(({ emergencyBraking }) => emergencyBraking))).toBeLessThanOrEqual(10)
  })

  it('selects all three maneuvers deterministically without U-turns', () => {
    const choices = Array.from({ length: 200 }, (_, decision) =>
      chooseManeuver(24680, 3, decision, 'normal'),
    )
    expect(new Set(choices)).toEqual(new Set(['straight', 'left', 'right']))
    expect(choices).toEqual(
      Array.from({ length: 200 }, (_, decision) =>
        chooseManeuver(24680, 3, decision, 'normal')),
    )
  })
})
