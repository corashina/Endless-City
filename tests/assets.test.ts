import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { BUILDING_CATALOG } from '../src/city/layout'
import {
  loadAssetCatalogWithLoader,
  resolveBuildingFallbacks,
  resolveVehicleFallbacks,
  TOTAL_ASSET_REQUESTS,
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
    expect(new Set(BUILDING_CATALOG.map(({ id }) => id)).size).toBe(27)

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
  it('preserves the required road request failure as the error cause', async () => {
    const roadFailure = new Error('road request failed')
    const loader = {
      async loadAsync(url: string) {
        if (url.endsWith('/road.glb')) throw roadFailure
        return { scene: new THREE.Group() }
      },
    }

    await expect(loadAssetCatalogWithLoader(loader)).rejects.toEqual(expect.objectContaining({
      message: 'Failed to load required road asset',
      cause: roadFailure,
    }))
  })

  it('falls back for optional building and vehicle request failures', async () => {
    const park = new THREE.Group()
    park.name = 'park-prototype'
    const loader = {
      async loadAsync(url: string) {
        if (url.endsWith('/house.glb') || url.endsWith('/cars.gltf')) {
          throw new Error(`optional failure: ${url}`)
        }
        return { scene: url.endsWith('/park.glb') ? park : new THREE.Group() }
      },
    }

    const catalog = await loadAssetCatalogWithLoader(loader)

    expect(catalog.cloneBuilding('house')).toMatchObject({ name: 'park-prototype' })
    expect(catalog.vehicleMetadata).toEqual([])
    catalog.dispose()
  })

  it('creates distinct clone roots that share prototype geometry and material', async () => {
    const geometry = new THREE.BoxGeometry(1, 2, 3)
    const material = new THREE.MeshBasicMaterial()
    const loader = {
      async loadAsync(url: string) {
        const scene = new THREE.Group()
        if (url.endsWith('/house.glb')) scene.add(new THREE.Mesh(geometry, material))
        return { scene }
      },
    }
    const catalog = await loadAssetCatalogWithLoader(loader)

    const first = catalog.cloneBuilding('house')!
    const second = catalog.cloneBuilding('house')!
    const firstMesh = first.children[0] as THREE.Mesh
    const secondMesh = second.children[0] as THREE.Mesh

    expect(first).not.toBe(second)
    expect(firstMesh).not.toBe(secondMesh)
    expect(firstMesh.geometry).toBe(secondMesh.geometry)
    expect(firstMesh.material).toBe(secondMesh.material)
    catalog.dispose()
  })

  it('does not turn successful requests into failures when progress reporting throws', async () => {
    const loader = {
      async loadAsync(url: string) {
        const scene = new THREE.Group()
        if (url.endsWith('/cars.gltf')) {
          const vehicle = new THREE.Group()
          vehicle.userData = { x: 1, z: 0 }
          vehicle.add(new THREE.Mesh(new THREE.BoxGeometry(4, 2, 2)))
          scene.add(vehicle)
        }
        return { scene }
      },
    }

    const catalog = await loadAssetCatalogWithLoader(loader, () => {
      throw new Error('progress observer failed')
    })

    expect(catalog.road).toBeInstanceOf(THREE.Group)
    expect(catalog.vehicleMetadata).toHaveLength(1)
    catalog.dispose()
  })

  it('disposes shared prototype resources exactly once and rejects stale clones', async () => {
    const texture = new THREE.Texture()
    const material = new THREE.MeshBasicMaterial({ map: texture })
    const geometry = new THREE.BoxGeometry(4, 2, 2)
    const textureDispose = vi.spyOn(texture, 'dispose')
    const materialDispose = vi.spyOn(material, 'dispose')
    const geometryDispose = vi.spyOn(geometry, 'dispose')
    const loader = {
      async loadAsync(url: string) {
        const scene = new THREE.Group()
        const root = new THREE.Group()
        root.add(new THREE.Mesh(geometry, material))
        if (url.endsWith('/cars.gltf')) {
          root.name = 'shared-car'
          root.userData = { x: 1, z: 0 }
        }
        scene.add(root)
        return { scene }
      },
    }
    const catalog = await loadAssetCatalogWithLoader(loader)
    const vehicleId = catalog.vehicleMetadata[0]!.id

    catalog.dispose()
    catalog.dispose()

    expect(textureDispose).toHaveBeenCalledOnce()
    expect(materialDispose).toHaveBeenCalledOnce()
    expect(geometryDispose).toHaveBeenCalledOnce()
    expect(() => catalog.road).toThrow('Asset catalog has been disposed')
    expect(() => catalog.buildings).toThrow('Asset catalog has been disposed')
    expect(() => catalog.vehiclePrototypes).toThrow('Asset catalog has been disposed')
    expect(() => catalog.vehiclesByDirection).toThrow('Asset catalog has been disposed')
    expect(() => catalog.cloneBuilding('house')).toThrow('Asset catalog has been disposed')
    expect(() => catalog.cloneVehicle(vehicleId)).toThrow('Asset catalog has been disposed')
  })

  it('creates a fresh catalog and request set for each load', async () => {
    const urls: string[] = []
    const loader = {
      async loadAsync(url: string) {
        urls.push(url)
        const scene = new THREE.Group()
        if (url.endsWith('/cars.gltf')) {
          const vehicle = new THREE.Group()
          vehicle.userData = { x: 1, z: 0 }
          vehicle.add(new THREE.Mesh(new THREE.BoxGeometry(4, 2, 2)))
          scene.add(vehicle)
        }
        return { scene }
      },
    }

    const first = await loadAssetCatalogWithLoader(loader)
    const second = await loadAssetCatalogWithLoader(loader)

    expect(urls).toHaveLength(TOTAL_ASSET_REQUESTS * 2)
    expect(second).not.toBe(first)
    expect(second.road).not.toBe(first.road)
  })

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

  it('reports completion for every one-time asset request', async () => {
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

    expect(TOTAL_ASSET_REQUESTS).toBe(29)
    expect(urls).toHaveLength(TOTAL_ASSET_REQUESTS)
    expect(new Set(urls).size).toBe(TOTAL_ASSET_REQUESTS)
    expect(urls).toContain('/clusters/road.glb')
    expect(urls).toContain('/clusters/cars.gltf')
    expect(progress).toHaveLength(TOTAL_ASSET_REQUESTS)
    expect(progress.at(-1)).toMatchObject({
      loaded: TOTAL_ASSET_REQUESTS,
      total: TOTAL_ASSET_REQUESTS,
    })
    expect(catalog.vehicleMetadata).toEqual([
      expect.objectContaining({ direction: 'east', length: 4 }),
    ])
    expect(catalog.cloneBuilding('house')).not.toBe(catalog.cloneBuilding('house'))
    expect(catalog.cloneVehicle(catalog.vehicleMetadata[0]!.id)).not.toBe(
      catalog.cloneVehicle(catalog.vehicleMetadata[0]!.id),
    )
  })
})
