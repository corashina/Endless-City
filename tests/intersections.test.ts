import { describe, expect, it } from 'vitest'
import { stepFollowing } from '../src/traffic/following'
import {
  updateIntersectionReservations,
  type IntersectionReservations,
} from '../src/traffic/intersections'
import type { TrafficConfig, VehicleState } from '../src/traffic/types'

const config: TrafficConfig = {
  minimumGap: 2,
  timeHeadway: 1,
  maximumAcceleration: 2,
  comfortableBraking: 4,
  intersectionHalfExtent: 5,
  reservationLookAhead: 20,
  protectedRadius: 100,
  simulationRadius: 200,
}

const vehicle = (overrides: Partial<VehicleState> = {}): VehicleState => ({
  id: 1,
  prototypeId: 'car',
  length: 4,
  lane: { direction: 'east', line: 0 },
  previousProgress: -31,
  progress: -31,
  speed: 0,
  desiredSpeed: 8,
  active: true,
  reservationKey: null,
  ...overrides,
})

const intersectsConflictZone = (state: VehicleState): boolean => {
  const crossingProgress = -20
  const frontBumper = state.progress + state.length / 2
  const rearBumper = state.progress - state.length / 2

  return frontBumper > crossingProgress - config.intersectionHalfExtent
    && rearBumper < crossingProgress + config.intersectionHalfExtent
}

describe('intersection reservations', () => {
  it('breaks equal-distance perpendicular requests by stable vehicle id', () => {
    const eastbound = vehicle({ id: 2 })
    const northbound = vehicle({ id: 1, lane: { direction: 'north', line: 0 } })
    const reservations: IntersectionReservations = new Map()

    const intersectionStops = updateIntersectionReservations(
      [eastbound, northbound],
      reservations,
      config,
    )

    expect(reservations).toEqual(new Map([['0:0', northbound.id]]))
    expect(northbound.reservationKey).toBe('0:0')
    expect(eastbound.reservationKey).toBeNull()
    expect(intersectionStops).toEqual(new Map([[eastbound.id, -25]]))
  })

  it('gives a closer request priority over a lower vehicle id', () => {
    const closerEastbound = vehicle({ id: 9, progress: -29 })
    const fartherNorthbound = vehicle({
      id: 1,
      lane: { direction: 'north', line: 0 },
      progress: -31,
    })
    const reservations: IntersectionReservations = new Map()

    const intersectionStops = updateIntersectionReservations(
      [fartherNorthbound, closerEastbound],
      reservations,
      config,
    )

    expect(reservations.get('0:0')).toBe(closerEastbound.id)
    expect(intersectionStops).toEqual(new Map([[fartherNorthbound.id, -25]]))
  })

  it('collects requests only within the configured look-ahead', () => {
    const distantVehicle = vehicle({ progress: -48 })
    const reservations: IntersectionReservations = new Map()

    const intersectionStops = updateIntersectionReservations(
      [distantVehicle],
      reservations,
      config,
    )

    expect(reservations).toEqual(new Map())
    expect(intersectionStops).toEqual(new Map())
    expect(distantVehicle.reservationKey).toBeNull()
  })

  it('releases a holder only after its rear bumper leaves the conflict zone', () => {
    const holder = vehicle({ id: 3, progress: -13, reservationKey: '0:0' })
    const reservations: IntersectionReservations = new Map([['0:0', holder.id]])

    updateIntersectionReservations([holder], reservations, config)

    expect(reservations.get('0:0')).toBe(holder.id)
    expect(holder.reservationKey).toBe('0:0')

    holder.progress = -12.99
    updateIntersectionReservations([holder], reservations, config)

    expect(reservations).toEqual(new Map())
    expect(holder.reservationKey).toBeNull()
  })

  it('keeps perpendicular vehicles out of the conflict zone together', () => {
    const eastbound = vehicle({ id: 2, speed: 8 })
    const northbound = vehicle({
      id: 1,
      lane: { direction: 'north', line: 0 },
      speed: 8,
    })
    const vehicles = [eastbound, northbound]
    const reservations: IntersectionReservations = new Map()

    for (let step = 0; step < 600; step += 1) {
      const intersectionStops = updateIntersectionReservations(vehicles, reservations, config)
      stepFollowing(vehicles, 1 / 60, config, intersectionStops)

      expect(intersectsConflictZone(eastbound) && intersectsConflictZone(northbound)).toBe(false)
    }
  })
})
