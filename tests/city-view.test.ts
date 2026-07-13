import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { CameraController } from '../src/camera/controller'
import { chooseTile } from '../src/city/layout'
import { coordinateKey, type GridCoordinate } from '../src/city/types'
import { WORLD_SEED } from '../src/config'
import type { AssetCatalog } from '../src/rendering/assets'
import { CityView, planTileAssignments } from '../src/rendering/city-view'
import type { QualityProfile } from '../src/rendering/quality'
import { createSceneGraph } from '../src/rendering/scene'

function applyPlan(
  current: Map<string, GridCoordinate>,
  plan: ReturnType<typeof planTileAssignments>,
): void {
  for (const key of plan.releasedKeys) current.delete(key)
  for (const coordinate of plan.requested) current.set(coordinateKey(coordinate), coordinate)
}

describe('planTileAssignments', () => {
  it('recycles one edge of a fixed-size pool after moving one block east', () => {
    const assignments = new Map<string, GridCoordinate>()
    const initial = planTileAssignments(assignments, { x: 0, z: 0 }, 9)

    expect(initial.retainedKeys).toHaveLength(0)
    expect(initial.releasedKeys).toHaveLength(0)
    expect(initial.requested).toHaveLength(81)
    applyPlan(assignments, initial)

    const moved = planTileAssignments(assignments, { x: 1, z: 0 }, 9)

    expect(moved.retainedKeys).toHaveLength(72)
    expect(moved.releasedKeys).toHaveLength(9)
    expect(moved.requested).toHaveLength(9)
    applyPlan(assignments, moved)
    expect(assignments).toHaveLength(81)
    expect(new Set(assignments.keys())).toHaveLength(81)
  })
})

const profile = {
  id: 'high',
  tileDiameter: 9,
  trafficCount: 49,
  maxPixelRatio: 1.5,
  shadowMapSize: 2048,
} as const satisfies QualityProfile

function createCatalog(): { catalog: AssetCatalog; cloneCounts: Map<string, number> } {
  const cloneCounts = new Map<string, number>()
  const road = new THREE.Group()
  road.name = 'road'
  return {
    cloneCounts,
    catalog: {
      road,
      buildings: new Map(),
      vehiclePrototypes: [],
      vehicleMetadata: [],
      vehiclesByDirection: new Map(),
      cloneBuilding(id) {
        cloneCounts.set(id, (cloneCounts.get(id) ?? 0) + 1)
        const clone = new THREE.Group()
        clone.name = id
        return clone
      },
      cloneVehicle() {
        return null
      },
    },
  }
}

describe('CityView', () => {
  it('adds one aligned road and allocates the exact fixed pool size', () => {
    const scene = new THREE.Scene()
    const { catalog } = createCatalog()

    const view = new CityView(scene, catalog, profile)

    expect(catalog.road.parent).toBe(scene)
    expect(catalog.road.position.toArray()).toEqual([60, 0, 0])
    expect(view.root.children).toHaveLength(81)
  })

  it('places every quarter turn with its compensating plot offset', () => {
    const scene = new THREE.Scene()
    const { catalog } = createCatalog()
    const view = new CityView(scene, catalog, profile)
    const origin = { x: 120, z: -60 }

    view.update({ x: 0, z: 0 }, origin)

    const expected = [
      { angle: 0, x: 0, z: 0 },
      { angle: Math.PI / 2, x: 0, z: 20 },
      { angle: Math.PI, x: 20, z: 20 },
      { angle: -Math.PI / 2, x: 20, z: 0 },
    ] as const
    const seen = new Set<number>()
    for (const slot of view.root.children) {
      const coordinate = slot.userData.coordinate as GridCoordinate
      const rotation = chooseTile(coordinate, WORLD_SEED).rotation
      const transform = expected[rotation]
      seen.add(rotation)
      expect(slot.rotation.y).toBe(transform.angle)
      expect(slot.position.x).toBe(coordinate.x * 60 - origin.x + transform.x)
      expect(slot.position.z).toBe(coordinate.z * 60 - origin.z + transform.z)
    }
    expect(seen).toEqual(new Set([0, 1, 2, 3]))
  })

  it('reuses retained children and keeps the pool bounded while travelling', () => {
    const scene = new THREE.Scene()
    const { catalog, cloneCounts } = createCatalog()
    const view = new CityView(scene, catalog, profile)
    view.update({ x: 0, z: 0 }, { x: 0, z: 0 })
    const retained = view.root.children.find((slot) =>
      coordinateKey(slot.userData.coordinate as GridCoordinate) === '0:0')!
    const child = retained.children[0]
    const clonesBeforeNoop = [...cloneCounts.values()].reduce((sum, count) => sum + count, 0)

    view.update({ x: 0, z: 0 }, { x: 60, z: 0 })

    expect(retained.children[0]).toBe(child)
    expect([...cloneCounts.values()].reduce((sum, count) => sum + count, 0)).toBe(clonesBeforeNoop)
    view.update({ x: 1, z: 0 }, { x: 60, z: 0 })
    expect(view.root.children).toHaveLength(81)
    expect(new Set(view.root.children.map((slot) =>
      coordinateKey(slot.userData.coordinate as GridCoordinate),
    ))).toHaveLength(81)
  })
})

describe('CameraController', () => {
  it('updates controls then recenters x-z while preserving camera and target heights', () => {
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(131, 100, -121)
    const target = new THREE.Vector3(120, 7, -110)
    let updates = 0
    const controller = new CameraController(camera, {
      target,
      update() {
        updates += 1
      },
    }, { x: 600, z: -300 })

    const state = controller.update()

    expect(updates).toBe(1)
    expect(camera.position.toArray()).toEqual([11, 100, -1])
    expect(target.toArray()).toEqual([0, 7, 10])
    expect(state).toEqual({
      logicalCamera: { x: 731, z: -421 },
      origin: { x: 720, z: -420 },
    })
  })

  it('does not rewrite local positions while the origin is unchanged', () => {
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(12, 42, -8)
    const target = new THREE.Vector3(1, 3, 4)
    const controller = new CameraController(camera, { target, update() {} })
    const cameraSet = vi.spyOn(camera.position, 'set')
    const targetSet = vi.spyOn(target, 'set')

    const state = controller.update()

    expect(cameraSet).not.toHaveBeenCalled()
    expect(targetSet).not.toHaveBeenCalled()
    expect(state).toEqual({
      logicalCamera: { x: 12, z: -8 },
      origin: { x: 0, z: 0 },
    })
  })
})

describe('createSceneGraph', () => {
  it('configures the camera, fog, fill light, and bounded directional shadows', () => {
    const graph = createSceneGraph(profile, 16 / 9)

    expect((graph.scene.background as THREE.Color).getHex()).toBe(0)
    expect(graph.scene.fog).toMatchObject({ near: 200, far: 300 })
    expect(graph.camera).toMatchObject({ fov: 40, aspect: 16 / 9, near: 1, far: 500 })
    expect(graph.camera.position.toArray()).toEqual([10, 100, 10])
    expect(graph.scene.children.filter((child) => child instanceof THREE.DirectionalLight)).toHaveLength(1)
    expect(graph.scene.children.filter((child) => child instanceof THREE.HemisphereLight)).toHaveLength(1)
    expect(graph.directionalLight.castShadow).toBe(true)
    expect(graph.directionalLight.shadow.mapSize.toArray()).toEqual([2048, 2048])
    expect(graph.directionalLight.shadow.camera).toMatchObject({
      left: -180,
      right: 180,
      top: 180,
      bottom: -180,
    })
  })
})
