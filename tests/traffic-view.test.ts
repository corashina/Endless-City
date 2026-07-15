import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import type { AssetCatalog } from '../src/rendering/assets'
import { interpolatedVehiclePose, TrafficView } from '../src/rendering/traffic-view'
import { positionOnLane } from '../src/traffic/lanes'
import { createDriverTraits } from '../src/traffic/random'
import {
  headingForDirection,
  movementPoseAt,
  planMovement,
  poseForVehicle,
  shortestAngleDelta,
} from '../src/traffic/routing'
import type { Direction, Maneuver, VehicleState } from '../src/traffic/types'

const WORLD_UP = new THREE.Vector3(0, 1, 0)
const LOCAL_NOSE = new THREE.Vector3(0, 0, 1)
const DIRECTIONS: readonly Direction[] = ['east', 'west', 'north', 'south']
const MANEUVERS: readonly Maneuver[] = ['left', 'right']

const vectorForDirection = (direction: Direction): THREE.Vector3 => {
  switch (direction) {
    case 'east': return new THREE.Vector3(1, 0, 0)
    case 'west': return new THREE.Vector3(-1, 0, 0)
    case 'north': return new THREE.Vector3(0, 0, 1)
    case 'south': return new THREE.Vector3(0, 0, -1)
  }
}

const authoredQuaternionFor = (direction: Direction): THREE.Quaternion => {
  if (direction === 'south') {
    return new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-Math.PI, 0, -Math.PI),
    )
  }
  return new THREE.Quaternion().setFromAxisAngle(
    WORLD_UP,
    Math.PI / 2 - headingForDirection(direction),
  )
}

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
    movementEntered: false,
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

function createCatalog(
  configureClone: (clone: THREE.Group, id: string) => void = (clone, id) => {
    clone.position.y = id === 'replacement' ? 5 : 3
    clone.rotation.set(0.1, 0.2, 0.3)
    clone.scale.set(2, 3, 4)
  },
): { catalog: AssetCatalog; cloneCounts: Map<string, number> } {
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
        configureClone(clone, id)
        return clone
      },
      dispose() {},
    },
  }
}

describe('TrafficView', () => {
  const orientationCases = DIRECTIONS.flatMap(nativeDirection =>
    DIRECTIONS.map(routeDirection => [nativeDirection, routeDirection] as const))

  it.each(orientationCases)(
    'faces %s-authored vehicle along a %s route',
    (nativeDirection, routeDirection) => {
      const scene = new THREE.Scene()
      const { catalog } = createCatalog((clone) => {
        clone.quaternion.copy(authoredQuaternionFor(nativeDirection))
      })
      const state = vehicle({
        prototypeId: `car-${nativeDirection}`,
        nativeDirection,
        lane: { direction: routeDirection, line: 0 },
      })
      const view = new TrafficView(scene, catalog, [state])

      view.sync([state], { x: 0, z: 0 }, 1)

      const worldNose = LOCAL_NOSE.clone().applyQuaternion(view.root.children[0]!.quaternion)
      expect(worldNose.dot(vectorForDirection(routeDirection))).toBeCloseTo(1, 10)
    },
  )

  const turnCases = DIRECTIONS.flatMap(direction =>
    MANEUVERS.map(maneuver => [direction, maneuver] as const))

  it.each(turnCases)(
    'keeps a %s-authored vehicle aligned through its %s turn',
    (incomingDirection, maneuver) => {
      const movement = planMovement(
        { direction: incomingDirection, line: 0 },
        incomingDirection === 'east' || incomingDirection === 'north' ? -31 : 9,
        maneuver,
        5,
      )
      const state = vehicle({
        prototypeId: `car-${incomingDirection}`,
        nativeDirection: incomingDirection,
        lane: movement.incomingLane,
        turn: { movement, distance: 0 },
      })
      const scene = new THREE.Scene()
      const { catalog } = createCatalog((clone) => {
        clone.quaternion.copy(authoredQuaternionFor(incomingDirection))
      })
      const view = new TrafficView(scene, catalog, [state])

      for (let index = 0; index <= 64; index += 1) {
        state.turn!.distance = movement.length * index / 64
        view.sync([state], { x: 0, z: 0 }, 1)
        const pose = movementPoseAt(movement, state.turn!.distance)
        const expectedTangent = new THREE.Vector3(
          Math.cos(pose.heading),
          0,
          Math.sin(pose.heading),
        )
        const worldNose = LOCAL_NOSE.clone()
          .applyQuaternion(view.root.children[0]!.quaternion)
        expect(worldNose.dot(expectedTangent)).toBeCloseTo(1, 10)
      }
    },
  )

  it('composes route yaw with the complete authored orientation', () => {
    const scene = new THREE.Scene()
    const { catalog } = createCatalog()
    const state = vehicle({
      nativeDirection: 'east',
      lane: { direction: 'north', line: 0 },
    })
    const view = new TrafficView(scene, catalog, [state])

    view.sync([state], { x: 0, z: 0 }, 1)

    const authoredQuaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.1, 0.2, 0.3),
    )
    const routeYaw = new THREE.Quaternion().setFromAxisAngle(WORLD_UP, -Math.PI / 2)
    const expectedQuaternion = authoredQuaternion.premultiply(routeYaw).normalize()
    expect(view.root.children[0]!.quaternion.clone().normalize()
      .angleTo(expectedQuaternion)).toBeCloseTo(0, 10)
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
    const authoredQuaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.1, 0.2, 0.3),
    ).normalize()
    expect(firstClone.quaternion.clone().normalize()
      .angleTo(authoredQuaternion)).toBeCloseTo(0, 10)
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
    const authoredQuaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.1, 0.2, 0.3),
    ).normalize()
    expect(replacement.quaternion.clone().normalize()
      .angleTo(authoredQuaternion)).toBeCloseTo(0, 10)
    expect(replacement.scale.toArray()).toEqual([2, 3, 4])
  })
})
