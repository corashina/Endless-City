import { describe, expect, it } from 'vitest'
import { chooseManeuver, createDriverTraits, seededUnit } from '../src/traffic/random'

const profileBounds = {
  cautious: { cruiseSpeed: [7.5, 10], timeHeadway: [1.4, 1.8], minimumGap: [3.5, 4.5] },
  normal: { cruiseSpeed: [9, 13], timeHeadway: [1, 1.5], minimumGap: [2.5, 4] },
  assertive: { cruiseSpeed: [11.5, 15], timeHeadway: [0.8, 1.2], minimumGap: [2, 3] },
} as const

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

  it('keeps every profile within its cruise, headway, and minimum-gap contract', () => {
    const traits = Array.from({ length: 10_000 }, (_, id) =>
      createDriverTraits(24680, id, id % 7))

    for (const trait of traits) {
      const bounds = profileBounds[trait.profile]
      expect(trait.cruiseSpeed).toBeGreaterThanOrEqual(bounds.cruiseSpeed[0])
      expect(trait.cruiseSpeed).toBeLessThanOrEqual(bounds.cruiseSpeed[1])
      expect(trait.timeHeadway).toBeGreaterThanOrEqual(bounds.timeHeadway[0])
      expect(trait.timeHeadway).toBeLessThanOrEqual(bounds.timeHeadway[1])
      expect(trait.minimumGap).toBeGreaterThanOrEqual(bounds.minimumGap[0])
      expect(trait.minimumGap).toBeLessThanOrEqual(bounds.minimumGap[1])
    }
  })

  it('reproduces the approved profile distribution over a large sample', () => {
    const sample = Array.from({ length: 20_000 }, (_, id) =>
      createDriverTraits(97531, id, id % 11).profile)
    const duplicate = Array.from({ length: 20_000 }, (_, id) =>
      createDriverTraits(97531, id, id % 11).profile)
    const share = (profile: keyof typeof profileBounds): number =>
      sample.filter((value) => value === profile).length / sample.length

    expect(sample).toEqual(duplicate)
    expect(Math.abs(share('cautious') - 0.25)).toBeLessThan(0.015)
    expect(Math.abs(share('normal') - 0.55)).toBeLessThan(0.015)
    expect(Math.abs(share('assertive') - 0.20)).toBeLessThan(0.015)
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

  it.each([
    ['cautious', 0.65, 0.175, 0.175],
    ['normal', 0.55, 0.225, 0.225],
    ['assertive', 0.45, 0.275, 0.275],
  ] as const)(
    'reproduces the approved %s maneuver distribution',
    (profile, straightShare, leftShare, rightShare) => {
      const sample = Array.from({ length: 20_000 }, (_, decision) =>
        chooseManeuver(86420, decision % 97, decision, profile))
      const duplicate = Array.from({ length: 20_000 }, (_, decision) =>
        chooseManeuver(86420, decision % 97, decision, profile))
      const share = (maneuver: 'straight' | 'left' | 'right'): number =>
        sample.filter((value) => value === maneuver).length / sample.length

      expect(sample).toEqual(duplicate)
      expect(Math.abs(share('straight') - straightShare)).toBeLessThan(0.015)
      expect(Math.abs(share('left') - leftShare)).toBeLessThan(0.015)
      expect(Math.abs(share('right') - rightShare)).toBeLessThan(0.015)
    },
  )
})
