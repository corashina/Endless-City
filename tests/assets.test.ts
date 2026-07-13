import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { BUILDING_CATALOG } from '../src/city/layout'
import {
  loadAssetCatalogWithLoader,
  resolveBuildingFallbacks,
  resolveVehicleFallbacks,
  type AssetProgress,
} from '../src/rendering/assets'

interface GltfNode {
  readonly extras?: { readonly x?: unknown; readonly z?: unknown }
}

interface GltfDocument {
  readonly scene?: number
  readonly scenes: readonly { readonly nodes?: readonly number[] }[]
  readonly nodes: readonly GltfNode[]
}

const clusterPath = (filename: string): string => resolve(process.cwd(), 'js', 'clusters', filename)

describe('existing asset disk contracts', () => {
  it('contains every unique building, road, and vehicle collection asset', () => {
    expect(new Set(BUILDING_CATALOG.map(({ id }) => id)).size).toBe(15)

    for (const { id } of BUILDING_CATALOG) {
      expect(existsSync(clusterPath(`${id}.glb`)), `${id}.glb`).toBe(true)
    }
    expect(existsSync(clusterPath('road.glb'))).toBe(true)
    expect(existsSync(clusterPath('cars.gltf'))).toBe(true)
  })

  it('contains 49 directed vehicle roots using only accepted direction vectors', () => {
    const document = JSON.parse(readFileSync(clusterPath('cars.gltf'), 'utf8')) as GltfDocument
    const scene = document.scenes[document.scene ?? 0]
    expect(scene).toBeDefined()

    const rootsWithExtras = (scene?.nodes ?? [])
      .map((index) => document.nodes[index])
      .filter((node): node is GltfNode & { readonly extras: NonNullable<GltfNode['extras']> } =>
        node?.extras !== undefined,
      )
    const acceptedPairs = new Set(['1,0', '-1,0', '0,1', '0,-1'])

    expect(rootsWithExtras).toHaveLength(49)
    for (const { extras } of rootsWithExtras) {
      expect(acceptedPairs.has(`${String(extras.x)},${String(extras.z)}`)).toBe(true)
    }
  })
})

describe('asset loading contracts', () => {
  it('replaces a failed building with park but cannot replace a failed park', () => {
    const park = new THREE.Group()
    const withPark = resolveBuildingFallbacks(new Map([
      ['park', park],
      ['house', null],
    ]))
    const withoutPark = resolveBuildingFallbacks(new Map([
      ['park', null],
      ['house', null],
    ]))

    expect(withPark.get('house')).toBe(park)
    expect(withPark.get('park')).toBe(park)
    expect(withoutPark.get('park')).toBeNull()
    expect(withoutPark.get('house')).toBeNull()
  })

  it('turns a failed vehicle collection into an empty list', () => {
    expect(resolveVehicleFallbacks(null)).toEqual([])
  })

  it('reports completion for each of the 17 one-time asset requests', async () => {
    const urls: string[] = []
    const progress: AssetProgress[] = []
    const loader = {
      async loadAsync(url: string) {
        urls.push(url)
        const scene = new THREE.Group()
        if (url.endsWith('/cars.gltf')) {
          const vehicle = new THREE.Group()
          vehicle.name = 'test-car'
          vehicle.userData = { x: 1, z: 0 }
          vehicle.add(new THREE.Mesh(new THREE.BoxGeometry(4, 2, 2)))
          scene.add(vehicle)
        }
        return { scene }
      },
    }

    const catalog = await loadAssetCatalogWithLoader(loader, (event) => progress.push(event))

    expect(urls).toHaveLength(17)
    expect(new Set(urls).size).toBe(17)
    expect(progress).toHaveLength(17)
    expect(progress.at(-1)).toMatchObject({ loaded: 17, total: 17 })
    expect(catalog.vehicleMetadata).toEqual([
      expect.objectContaining({ direction: 'east', length: 4 }),
    ])
    expect(catalog.cloneBuilding('house')).not.toBe(catalog.cloneBuilding('house'))
    expect(catalog.cloneVehicle(catalog.vehicleMetadata[0]!.id)).not.toBe(
      catalog.cloneVehicle(catalog.vehicleMetadata[0]!.id),
    )
  })
})
