import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { AssetCatalog } from '../src/rendering/assets'
import { interpolatedVehiclePose, TrafficView } from '../src/rendering/traffic-view'
import { positionOnLane } from '../src/traffic/lanes'
import { createDriverTraits } from '../src/traffic/random'
import {
  headingForDirection,
  planMovement,
  poseForVehicle,
  shortestAngleDelta,
} from '../src/traffic/routing'
import type { VehicleState } from '../src/traffic/types'

const vehicle = (overrides: Partial<VehicleState> = {}): VehicleState => {
  const id = overrides.id ?? 0
  const lane = overrides.lane ?? { direction: 'east', line: 0 }
  const previousProgress = overrides.previousProgress ?? 10
  const progress = overrides.progress ?? 14
  return {
    id,
    prototypeId: 'car',
    length: 4,
    lane,
    nativeDirection: 'east',
    previousProgress,
    progress,
    speed: 4,
    desiredSpeed: 8,
    active: true,
    reservationKey: null,
    lifecycle: 0,
    traits: createDriverTraits(1, id, 0),
    routeDecisionIndex: 0,
    offscreenStoppedSteps: 0,
    requestAgeSteps: 0,
    grantExpiresAtStep: null,
    ownedZoneKeys: [],
    plannedMovement: null,
    turn: null,
    clearingMovement: null,
    previousPose: {
      ...positionOnLane(lane, previousProgress),
      heading: headingForDirection(lane.direction),
    },
    ...overrides,
  }
}

describe('interpolatedVehiclePose', () => {
  it('interpolates position and the shortest heading through a turn', () => {
    const turning = vehicle({
      previousPose: { x: -25, z: -16, heading: 0 },
      turn: {
        movement: planMovement({ direction: 'east', line: 0 }, -31, 'left', 5),
        distance: 5,
      },
    })
    const current = poseForVehicle(turning)

    const midpoint = interpolatedVehiclePose(turning, 0.5)

    expect(midpoint.x).toBeCloseTo((turning.previousPose.x + current.x) / 2)
    expect(midpoint.z).toBeCloseTo((turning.previousPose.z + current.z) / 2)
    expect(midpoint.heading).toBeCloseTo(
      turning.previousPose.heading
        + shortestAngleDelta(turning.previousPose.heading, current.heading) / 2,
    )
    expect(Math.abs(shortestAngleDelta(turning.previousPose.heading, midpoint.heading)))
      .toBeLessThan(Math.PI / 2)
  })
})

function createCatalog(): { catalog: AssetCatalog; cloneCounts: Map<string, number> } {
  const cloneCounts = new Map<string, number>()
  return {
    cloneCounts,
    catalog: {
      road: new THREE.Group(),
      buildings: new Map(),
      vehiclePrototypes: [],
      vehicleMetadata: [],
      vehiclesByDirection: new Map(),
      cloneBuilding() {
        return null
      },
      cloneVehicle(id) {
        cloneCounts.set(id, (cloneCounts.get(id) ?? 0) + 1)
        const clone = new THREE.Group()
        clone.name = id
        clone.position.y = id === 'replacement' ? 5 : 3
        clone.rotation.set(0.1, 0.2, 0.3)
        clone.scale.set(2, 3, 4)
        return clone
      },
      dispose() {},
    },
  }
}

describe('TrafficView', () => {
  it('rotates an authored eastbound model to match a northbound route heading', () => {
    const scene = new THREE.Scene()
    const { catalog } = createCatalog()
    const state = vehicle({
      nativeDirection: 'east',
      lane: { direction: 'north', line: 0 },
    })
    const view = new TrafficView(scene, catalog, [state])

    view.sync([state], { x: 0, z: 0 }, 1)

    expect(view.root.children[0]!.rotation.y).toBeCloseTo(0.2 - Math.PI / 2)
  })

  it('allocates one authored clone per simulation slot and reuses it during sync', () => {
    const scene = new THREE.Scene()
    const { catalog, cloneCounts } = createCatalog()
    const vehicles = [
      vehicle(),
      vehicle({ id: 1, prototypeId: 'van', active: false }),
    ]
    const view = new TrafficView(scene, catalog, vehicles)
    const firstClone = view.root.children.find((child) => child.name === 'car')!
    const inactiveClone = view.root.children.find((child) => child.name === 'van')!

    view.sync(vehicles, { x: 3, z: -5 }, 0.5)

    expect(view.root.parent).toBe(scene)
    expect(view.root.children).toHaveLength(2)
    expect(view.root.children).toContain(firstClone)
    expect(cloneCounts).toEqual(new Map([['car', 1], ['van', 1]]))
    expect(firstClone.visible).toBe(true)
    expect(firstClone.position.toArray()).toEqual([9, 3, -11])
    expect(firstClone.rotation.toArray().slice(0, 3)).toEqual([0.1, 0.2, 0.3])
    expect(firstClone.scale.toArray()).toEqual([2, 3, 4])
    expect(inactiveClone.visible).toBe(false)
  })

  it('replaces only the clone whose prototype id changed', () => {
    const scene = new THREE.Scene()
    const { catalog, cloneCounts } = createCatalog()
    const vehicles = [vehicle(), vehicle({ id: 1, prototypeId: 'van' })]
    const view = new TrafficView(scene, catalog, vehicles)
    const originalCar = view.root.children.find((child) => child.name === 'car')!
    const originalVan = view.root.children.find((child) => child.name === 'van')!

    vehicles[0]!.prototypeId = 'replacement'
    view.sync(vehicles, { x: 0, z: 0 }, 1)

    const replacement = view.root.children.find((child) => child.name === 'replacement')!
    expect(view.root.children).toHaveLength(2)
    expect(view.root.children).not.toContain(originalCar)
    expect(view.root.children).toContain(originalVan)
    expect(cloneCounts).toEqual(new Map([
      ['car', 1],
      ['van', 1],
      ['replacement', 1],
    ]))
    expect(replacement.position.toArray()).toEqual([14, 5, -16])
    expect(replacement.rotation.toArray().slice(0, 3)).toEqual([0.1, 0.2, 0.3])
    expect(replacement.scale.toArray()).toEqual([2, 3, 4])
  })
})
