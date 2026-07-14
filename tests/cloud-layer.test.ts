import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import {
  CLOUD_CLEAR_RADIUS,
  CLOUD_COUNT,
  CLOUD_DRIFT_SPEED,
  CLOUD_WRAP_RADIUS,
  CloudLayer,
  wrapCloudPosition,
} from '../src/rendering/cloud-layer'

describe('wrapCloudPosition', () => {
  it('retains clouds inside the outer boundary', () => {
    const position = { x: 200, z: 0 }

    expect(wrapCloudPosition(position, { x: 0, z: 0 }, 0)).toBe(position)
  })

  it('wraps an escaped cloud to the opposite edge with a stable offset', () => {
    expect(wrapCloudPosition({ x: 211, z: 0 }, { x: 0, z: 0 }, 0))
      .toEqual({ x: -190, z: -30 })
  })
})

describe('CloudLayer', () => {
  it('creates five dispersed groups with shared resources and no shadows', () => {
    const scene = new THREE.Scene()
    const layer = new CloudLayer(scene)
    const meshes = layer.root.children.flatMap((group) => group.children) as THREE.Mesh[]

    expect(CLOUD_COUNT).toBe(5)
    expect(CLOUD_CLEAR_RADIUS).toBe(70)
    expect(CLOUD_WRAP_RADIUS).toBe(210)
    expect(layer.root.parent).toBe(scene)
    expect(layer.root.children).toHaveLength(5)
    expect(layer.root.children.map((group) => group.children.length)).toEqual([4, 3, 4, 3, 4])
    expect(new Set(meshes.map((mesh) => mesh.geometry)).size).toBe(1)
    expect(new Set(meshes.map((mesh) => mesh.material)).size).toBe(1)
    expect(meshes.every((mesh) => !mesh.castShadow && !mesh.receiveShadow)).toBe(true)
    for (const cloud of layer.root.children) {
      const logical = cloud.userData.logicalPosition as { x: number; z: number }
      expect(Math.hypot(logical.x, logical.z)).toBeGreaterThanOrEqual(70)
      expect(cloud.position.y).toBeGreaterThanOrEqual(42)
      expect(cloud.position.y).toBeLessThanOrEqual(58)
    }
  })

  it('wraps around the logical camera and projects through the render origin', () => {
    const layer = new CloudLayer(new THREE.Scene())

    layer.update({ x: 500, z: 0 }, { x: 480, z: -120 }, 0)

    for (const cloud of layer.root.children) {
      const logical = cloud.userData.logicalPosition as { x: number; z: number }
      expect(Math.hypot(logical.x - 500, logical.z)).toBeLessThanOrEqual(210)
      expect(cloud.position.x).toBeCloseTo(logical.x - 480, 10)
      expect(cloud.position.z).toBeCloseTo(logical.z + 120, 10)
    }
  })

  it('drifts every cloud east at a frame-rate-independent speed', () => {
    const singleStep = new CloudLayer(new THREE.Scene())
    const splitStep = new CloudLayer(new THREE.Scene())
    const singleStart = singleStep.root.children.map((cloud) =>
      (cloud.userData.logicalPosition as { x: number }).x,
    )

    singleStep.update({ x: 0, z: 0 }, { x: 0, z: 0 }, 1)
    splitStep.update({ x: 0, z: 0 }, { x: 0, z: 0 }, 0.5)
    splitStep.update({ x: 0, z: 0 }, { x: 0, z: 0 }, 0.5)

    expect(CLOUD_DRIFT_SPEED).toBe(1.5)
    singleStep.root.children.forEach((cloud, index) => {
      const single = cloud.userData.logicalPosition as { x: number; z: number }
      const split = splitStep.root.children[index]!.userData.logicalPosition as {
        x: number
        z: number
      }
      expect(single.x).toBeCloseTo(singleStart[index]! + CLOUD_DRIFT_SPEED, 10)
      expect(single.x).toBeCloseTo(split.x, 10)
      expect(single.z).toBeCloseTo(split.z, 10)
    })
  })

  it('keeps logical position identities stable across updates and wrapping', () => {
    const layer = new CloudLayer(new THREE.Scene())
    const logicalPositions = layer.root.children.map((cloud) =>
      cloud.userData.logicalPosition as { x: number; z: number },
    )
    const initialCoordinates = logicalPositions.map((position) => ({ ...position }))

    layer.update({ x: 0, z: 0 }, { x: 25, z: -40 }, 0)

    layer.root.children.forEach((cloud, index) => {
      expect(cloud.userData.logicalPosition).toBe(logicalPositions[index])
    })
    expect(logicalPositions).toEqual(initialCoordinates)

    layer.update({ x: 500, z: 0 }, { x: 480, z: -120 }, 300)

    layer.root.children.forEach((cloud, index) => {
      expect(cloud.userData.logicalPosition).toBe(logicalPositions[index])
    })
    expect(logicalPositions).not.toEqual(initialCoordinates)
  })

  it('removes its root and disposes shared resources exactly once', () => {
    const scene = new THREE.Scene()
    const layer = new CloudLayer(scene)
    const firstMesh = layer.root.children[0]!.children[0] as THREE.Mesh
    const geometryDispose = vi.spyOn(firstMesh.geometry, 'dispose')
    const materialDispose = vi.spyOn(firstMesh.material as THREE.Material, 'dispose')

    layer.dispose()
    layer.dispose()

    expect(layer.root.parent).toBeNull()
    expect(geometryDispose).toHaveBeenCalledOnce()
    expect(materialDispose).toHaveBeenCalledOnce()
  })
})
