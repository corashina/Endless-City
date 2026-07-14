import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import {
  CLOUD_CLEAR_RADIUS,
  CLOUD_COUNT,
  CLOUD_WRAP_RADIUS,
  CloudLayer,
  wrapCloudPosition,
} from '../src/rendering/cloud-layer'

describe('wrapCloudPosition', () => {
  it('retains clouds inside the outer boundary', () => {
    expect(wrapCloudPosition({ x: 200, z: 0 }, { x: 0, z: 0 }, 0))
      .toEqual({ x: 200, z: 0 })
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

    layer.update({ x: 500, z: 0 }, { x: 480, z: -120 })

    for (const cloud of layer.root.children) {
      const logical = cloud.userData.logicalPosition as { x: number; z: number }
      expect(Math.hypot(logical.x - 500, logical.z)).toBeLessThanOrEqual(210)
      expect(cloud.position.x).toBeCloseTo(logical.x - 480, 10)
      expect(cloud.position.z).toBeCloseTo(logical.z + 120, 10)
    }
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
