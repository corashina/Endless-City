import * as THREE from 'three'
import type { OrbitControlsEventMap } from 'three/addons/controls/OrbitControls.js'
import { describe, expect, it, vi } from 'vitest'
import { CameraController } from '../src/camera/controller'
import { chooseTile } from '../src/city/layout'
import { desiredTileWindow, diffTileWindow } from '../src/city/tile-window'
import { coordinateKey, type GridCoordinate } from '../src/city/types'
import { WORLD_SEED } from '../src/config'
import type { AssetCatalog } from '../src/rendering/assets'
import { CityView, planTileAssignments } from '../src/rendering/city-view'
import type { QualityProfile } from '../src/rendering/quality'
import {
  createSceneGraph,
  disposeSceneResources,
  resizeSceneViewport,
} from '../src/rendering/scene'

function applyPlan(
  current: Map<string, GridCoordinate>,
  plan: ReturnType<typeof planTileAssignments>,
): void {
  for (const key of plan.releasedKeys) current.delete(key)
  for (const coordinate of plan.requested) current.set(coordinateKey(coordinate), coordinate)
}

describe('planTileAssignments', () => {
  it('uses the shared tile-window diff contract', () => {
    const assignments = new Map([
      ['0:10', { x: 0, z: 10 }],
      ['0:2', { x: 0, z: 2 }],
    ])

    expect(planTileAssignments(assignments, { x: 0, z: 6 }, 3)).toEqual(
      diffTileWindow(assignments, desiredTileWindow({ x: 0, z: 6 }, 3)),
    )
  })

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
  trafficCount: 108,
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
      dispose: vi.fn(),
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
  class InteractionControlsHarness extends THREE.EventDispatcher<OrbitControlsEventMap> {
    readonly target = new THREE.Vector3(120, 7, -110)
    updates = 0

    update(): void {
      this.updates += 1
    }
  }

  it('defers recentering until a controls gesture ends', () => {
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(131, 100, -121)
    const controls = new InteractionControlsHarness()
    const controller = new CameraController(camera, controls)

    controls.dispatchEvent({ type: 'start' })
    const activeState = controller.update()

    expect(activeState).toEqual({
      logicalCamera: { x: 131, z: -121 },
      origin: { x: 0, z: 0 },
    })
    expect(camera.position.toArray()).toEqual([131, 100, -121])
    expect(controls.target.toArray()).toEqual([120, 7, -110])

    controls.dispatchEvent({ type: 'end' })
    const endedState = controller.update()

    expect(endedState).toEqual({
      logicalCamera: { x: 131, z: -121 },
      origin: { x: 120, z: -120 },
    })
    expect(camera.position.toArray()).toEqual([11, 100, -1])
    expect(controls.target.toArray()).toEqual([0, 7, 10])
  })

  it('removes controls interaction listeners on dispose', () => {
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(131, 100, -121)
    const controls = new InteractionControlsHarness()
    const removeEventListener = vi.spyOn(controls, 'removeEventListener')
    const controller = new CameraController(camera, controls)

    controller.dispose()

    expect(removeEventListener).toHaveBeenNthCalledWith(1, 'start', expect.any(Function))
    expect(removeEventListener).toHaveBeenNthCalledWith(2, 'end', expect.any(Function))
    controls.dispatchEvent({ type: 'start' })
    expect(controller.update()).toEqual({
      logicalCamera: { x: 131, z: -121 },
      origin: { x: 120, z: -120 },
    })
  })

  it('updates controls then recenters x-z while preserving camera and target heights', () => {
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(131, 100, -121)
    const controls = new InteractionControlsHarness()
    const controller = new CameraController(camera, controls, { x: 600, z: -300 })

    const state = controller.update()

    expect(controls.updates).toBe(1)
    expect(camera.position.toArray()).toEqual([11, 100, -1])
    expect(controls.target.toArray()).toEqual([0, 7, 10])
    expect(state).toEqual({
      logicalCamera: { x: 731, z: -421 },
      origin: { x: 720, z: -420 },
    })
  })

  it('does not rewrite local positions while the origin is unchanged', () => {
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(12, 42, -8)
    const controls = new InteractionControlsHarness()
    controls.target.set(1, 3, 4)
    const controller = new CameraController(camera, controls)
    const cameraSet = vi.spyOn(camera.position, 'set')
    const targetSet = vi.spyOn(controls.target, 'set')

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

    expect((graph.scene.background as THREE.Color).getHex()).toBe(0xd7e5ee)
    expect(graph.scene.fog).toMatchObject({ near: 200, far: 300 })
    expect((graph.scene.fog as THREE.Fog).color.getHex()).toBe(0xd7e5ee)
    expect(graph.camera).toMatchObject({ fov: 40, aspect: 16 / 9, near: 1, far: 500 })
    expect(graph.camera.position.toArray()).toEqual([10, 100, 10])
    expect(graph.scene.children.filter((child) => child instanceof THREE.DirectionalLight)).toHaveLength(1)
    expect(graph.scene.children.filter((child) => child instanceof THREE.HemisphereLight)).toHaveLength(1)
    expect(graph.directionalLight.color.getHex()).toBe(0xfff1cf)
    expect(graph.directionalLight.intensity).toBe(1.6)
    expect(graph.hemisphereLight.color.getHex()).toBe(0xe7f2ff)
    expect(graph.hemisphereLight.groundColor.getHex()).toBe(0xb9aa8f)
    expect(graph.hemisphereLight.intensity).toBe(1.25)
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

describe('scene lifecycle', () => {
  it('resizes rendering state with capped DPR without changing camera position', () => {
    const renderer = {
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
      dispose: vi.fn(),
    }
    const camera = {
      aspect: 1,
      position: { x: 11, y: 100, z: -1 },
      updateProjectionMatrix: vi.fn(),
    }

    resizeSceneViewport(renderer, camera, profile, {
      width: 1280,
      height: 720,
      devicePixelRatio: 3,
    })

    expect(renderer.setPixelRatio).toHaveBeenCalledWith(1.5)
    expect(renderer.setSize).toHaveBeenCalledWith(1280, 720, false)
    expect(camera.aspect).toBe(1280 / 720)
    expect(camera.updateProjectionMatrix).toHaveBeenCalledOnce()
    expect(camera.position).toEqual({ x: 11, y: 100, z: -1 })
  })

  it('disposes controls and renderer resources', () => {
    const controls = { dispose: vi.fn() }
    const renderer = { dispose: vi.fn() }

    disposeSceneResources(controls, renderer)

    expect(controls.dispose).toHaveBeenCalledOnce()
    expect(renderer.dispose).toHaveBeenCalledOnce()
  })
})
