import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneObject } from 'three/addons/utils/SkeletonUtils.js'
import { BUILDING_CATALOG } from '../city/layout'
import type { BuildingId } from '../city/types'
import type { Direction, VehiclePrototypeMetadata } from '../traffic/types'

const ASSET_BASE_URL = '/clusters'
const TOTAL_ASSET_REQUESTS = 17
const DIRECTIONS: readonly Direction[] = ['east', 'west', 'north', 'south']

export interface AssetProgress {
  readonly loaded: number
  readonly total: 17
  readonly url: string
}

export interface AssetLoaderResult {
  readonly scene: THREE.Group
}

export interface AssetLoader {
  loadAsync(url: string): Promise<AssetLoaderResult>
}

export interface VehiclePrototype extends VehiclePrototypeMetadata {
  readonly object: THREE.Object3D
}

export interface AssetCatalog {
  readonly road: THREE.Object3D
  readonly buildings: ReadonlyMap<BuildingId, THREE.Object3D | null>
  readonly vehiclePrototypes: readonly VehiclePrototype[]
  readonly vehicleMetadata: readonly VehiclePrototypeMetadata[]
  readonly vehiclesByDirection: ReadonlyMap<Direction, readonly VehiclePrototype[]>
  cloneBuilding(id: BuildingId): THREE.Object3D | null
  cloneVehicle(id: string): THREE.Object3D | null
  dispose(): void
}

export type BuildingLoadResults = ReadonlyMap<BuildingId, THREE.Object3D | null>

export function resolveBuildingFallbacks(
  loaded: BuildingLoadResults,
): ReadonlyMap<BuildingId, THREE.Object3D | null> {
  const park = loaded.get('park') ?? null
  return new Map(BUILDING_CATALOG.map(({ id }) => [id, loaded.get(id) ?? park]))
}

const EMPTY_VEHICLES: readonly VehiclePrototype[] = Object.freeze([])

export function resolveVehicleFallbacks(
  loaded: readonly VehiclePrototype[] | null | undefined,
): readonly VehiclePrototype[] {
  return loaded ?? EMPTY_VEHICLES
}

function directionFromExtras(userData: Record<string, unknown>, id: string): Direction {
  const vector = `${String(userData.x)},${String(userData.z)}`
  switch (vector) {
    case '1,0': return 'east'
    case '-1,0': return 'west'
    case '0,1': return 'north'
    case '0,-1': return 'south'
    default: throw new Error(`Vehicle prototype ${id} has invalid direction extras (${vector})`)
  }
}

function enableShadows(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })
}

function extractVehiclePrototypes(scene: THREE.Group): readonly VehiclePrototype[] {
  return scene.children.map((root, index) => {
    const id = `${root.name || 'vehicle'}-${index}`
    const direction = directionFromExtras(root.userData, id)
    root.position.set(0, 0, 0)
    root.updateWorldMatrix(true, true)

    const size = new THREE.Vector3()
    new THREE.Box3().setFromObject(root).getSize(size)
    const length = direction === 'east' || direction === 'west' ? size.x : size.z
    if (!Number.isFinite(length) || length <= 0) {
      throw new Error(`Vehicle prototype ${id} has no measurable length`)
    }

    return Object.freeze({ id, direction, length, object: root })
  })
}

function groupVehiclesByDirection(
  prototypes: readonly VehiclePrototype[],
): ReadonlyMap<Direction, readonly VehiclePrototype[]> {
  return new Map(DIRECTIONS.map((direction) => [
    direction,
    Object.freeze(prototypes.filter((prototype) => prototype.direction === direction)),
  ]))
}

function createCatalog(
  road: THREE.Object3D,
  buildings: ReadonlyMap<BuildingId, THREE.Object3D | null>,
  vehicles: readonly VehiclePrototype[],
): AssetCatalog {
  const vehicleById = new Map(vehicles.map((prototype) => [prototype.id, prototype.object]))
  const vehicleMetadata = Object.freeze(vehicles.map(({ id, length, direction }) =>
    Object.freeze({ id, length, direction }),
  ))
  const vehiclesByDirection = groupVehiclesByDirection(vehicles)

  let disposed = false
  const assertActive = (): void => {
    if (disposed) throw new Error('Asset catalog has been disposed')
  }

  return {
    get road() {
      assertActive()
      return road
    },
    get buildings() {
      assertActive()
      return buildings
    },
    get vehiclePrototypes() {
      assertActive()
      return vehicles
    },
    vehicleMetadata,
    get vehiclesByDirection() {
      assertActive()
      return vehiclesByDirection
    },
    cloneBuilding(id) {
      assertActive()
      const prototype = buildings.get(id)
      return prototype === null || prototype === undefined ? null : cloneObject(prototype)
    },
    cloneVehicle(id) {
      assertActive()
      const prototype = vehicleById.get(id)
      return prototype === undefined ? null : cloneObject(prototype)
    },
    dispose() {
      if (disposed) return
      disposed = true

      const roots = new Set<THREE.Object3D>([
        road,
        ...[...buildings.values()].filter((root): root is THREE.Object3D => root !== null),
        ...vehicles.map(({ object }) => object),
      ])
      const geometries = new Set<THREE.BufferGeometry>()
      const materials = new Set<THREE.Material>()
      const textures = new Set<THREE.Texture>()

      for (const root of roots) {
        root.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return
          geometries.add(object.geometry)
          const meshMaterials = Array.isArray(object.material) ? object.material : [object.material]
          for (const material of meshMaterials) {
            materials.add(material)
            for (const value of Object.values(material)) {
              if (value instanceof THREE.Texture) textures.add(value)
            }
          }
        })
      }

      for (const texture of textures) texture.dispose()
      for (const material of materials) material.dispose()
      for (const geometry of geometries) geometry.dispose()
    },
  }
}

export async function loadAssetCatalogWithLoader(
  loader: AssetLoader,
  onProgress: (progress: AssetProgress) => void = () => undefined,
): Promise<AssetCatalog> {
  const buildingIds = BUILDING_CATALOG.map(({ id }) => id)
  const urls = [
    `${ASSET_BASE_URL}/road.glb`,
    ...buildingIds.map((id) => `${ASSET_BASE_URL}/${id}.glb`),
    `${ASSET_BASE_URL}/cars.gltf`,
  ]
  let loaded = 0
  const results = await Promise.allSettled(urls.map(async (url) => {
    try {
      return await loader.loadAsync(url)
    } finally {
      loaded += 1
      try {
        onProgress({ loaded, total: TOTAL_ASSET_REQUESTS, url })
      } catch {
        // Progress observers are advisory and must not change request outcomes.
      }
    }
  }))

  const roadResult = results[0]
  if (roadResult?.status !== 'fulfilled') {
    throw new Error('Failed to load required road asset', {
      cause: roadResult?.status === 'rejected' ? roadResult.reason : undefined,
    })
  }
  enableShadows(roadResult.value.scene)

  const loadedBuildings = new Map<BuildingId, THREE.Object3D | null>()
  buildingIds.forEach((id, index) => {
    const result = results[index + 1]
    if (result?.status === 'fulfilled') {
      enableShadows(result.value.scene)
      loadedBuildings.set(id, result.value.scene)
    } else {
      loadedBuildings.set(id, null)
    }
  })

  const carsResult = results[results.length - 1]
  let vehicles: readonly VehiclePrototype[] | null = null
  if (carsResult?.status === 'fulfilled') {
    try {
      enableShadows(carsResult.value.scene)
      vehicles = extractVehiclePrototypes(carsResult.value.scene)
    } catch {
      vehicles = null
    }
  }

  return createCatalog(
    roadResult.value.scene,
    resolveBuildingFallbacks(loadedBuildings),
    resolveVehicleFallbacks(vehicles),
  )
}

export function loadAssetCatalog(
  onProgress: (progress: AssetProgress) => void = () => undefined,
): Promise<AssetCatalog> {
  return loadAssetCatalogWithLoader(new GLTFLoader(), onProgress)
}
