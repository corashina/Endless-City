import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createGalleryScene, galleryItems } from '../tools/tiles/gallery'

describe('remix tile gallery manifest', () => {
  it('lists all 12 unique generated URLs with readable labels', () => {
    const items = galleryItems()
    expect(items).toHaveLength(12)
    expect(new Set(items.map(({ url }) => url)).size).toBe(12)
    expect(items.every(({ id, label, url }) =>
      label.length > 0 && url === `/clusters/${id}.glb`,
    )).toBe(true)
  })

  it('uses the production scene and shadow configuration for each gallery card', () => {
    const renderer = {
      outputColorSpace: THREE.LinearSRGBColorSpace,
      shadowMap: { enabled: false, type: THREE.BasicShadowMap },
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
    }

    const graph = createGalleryScene(renderer, {
      width: 360,
      height: 270,
      devicePixelRatio: 2,
    }, 1_440)

    expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace)
    expect(renderer.shadowMap).toEqual({ enabled: true, type: THREE.PCFSoftShadowMap })
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(1.5)
    expect(renderer.setSize).toHaveBeenCalledWith(360, 270, false)
    expect(graph.directionalLight.castShadow).toBe(true)
    expect(graph.directionalLight.shadow.mapSize.toArray()).toEqual([2048, 2048])
    expect(graph.directionalLight.shadow.camera).toMatchObject({
      near: 1,
      far: 1_000,
      left: -180,
      right: 180,
      top: 180,
      bottom: -180,
    })
    expect(graph.directionalLight.target.parent).toBe(graph.scene)
    expect(graph.directionalLight.target.position.toArray()).toEqual([10, 0, 10])
    expect(graph.camera.position.toArray()).toEqual([
      10 + 110 * Math.sin(Math.PI / 5) / Math.sqrt(2),
      110 * Math.cos(Math.PI / 5),
      10 + 110 * Math.sin(Math.PI / 5) / Math.sqrt(2),
    ])
  })
})
