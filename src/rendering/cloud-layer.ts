import * as THREE from 'three'
import type { WorldPoint } from '../city/types'

export const CLOUD_COUNT = 5
export const CLOUD_CLEAR_RADIUS = 70
export const CLOUD_DRIFT_SPEED = 1.5
export const CLOUD_WRAP_RADIUS = 210
const CLOUD_REENTRY_RADIUS = 190

const INITIAL_CLOUDS = [
  { position: { x: -150, z: -90 }, height: 46, scale: 0.9 },
  { position: { x: -110, z: 160 }, height: 54, scale: 1.02 },
  { position: { x: 95, z: -165 }, height: 43, scale: 0.86 },
  { position: { x: 165, z: 90 }, height: 58, scale: 1.08 },
  { position: { x: 10, z: 200 }, height: 50, scale: 0.95 },
] as const

const LOBES = [
  { position: [-7, 0, 0], scale: [8, 3.8, 5] },
  { position: [0, 1.5, 0], scale: [10, 5, 6] },
  { position: [8, 0, 1], scale: [7, 3.5, 4.5] },
  { position: [2, 0, -4], scale: [7, 3, 4] },
] as const

export function wrapCloudPosition(
  position: WorldPoint,
  camera: WorldPoint,
  index: number,
): WorldPoint {
  const x = position.x - camera.x
  const z = position.z - camera.z
  const distance = Math.hypot(x, z)
  if (distance <= CLOUD_WRAP_RADIUS) return position

  const unitX = x / distance
  const unitZ = z / distance
  const perpendicularOffset = (index * 37) % 61 - 30
  return {
    x: camera.x - unitX * CLOUD_REENTRY_RADIUS - unitZ * perpendicularOffset,
    z: camera.z - unitZ * CLOUD_REENTRY_RADIUS + unitX * perpendicularOffset,
  }
}

export interface CloudLayerController {
  update(logicalCamera: WorldPoint, origin: WorldPoint, deltaSeconds: number): void
  dispose(): void
}

export class CloudLayer implements CloudLayerController {
  readonly root = new THREE.Group()
  private readonly geometry = new THREE.IcosahedronGeometry(1, 1)
  private readonly material = new THREE.MeshLambertMaterial({ color: 0xf6f5ef })
  private readonly clouds: Array<{
    readonly group: THREE.Group
    readonly logicalPosition: { x: number; z: number }
    readonly height: number
  }>
  private disposed = false

  constructor(scene: THREE.Scene) {
    this.root.name = 'cloud-layer'
    this.clouds = INITIAL_CLOUDS.map((cloud, index) => {
      const group = new THREE.Group()
      group.name = `cloud-${index}`
      group.scale.setScalar(cloud.scale)
      for (const lobe of LOBES.slice(0, index % 2 === 0 ? 4 : 3)) {
        const mesh = new THREE.Mesh(this.geometry, this.material)
        mesh.position.set(lobe.position[0], lobe.position[1], lobe.position[2])
        mesh.scale.set(lobe.scale[0], lobe.scale[1], lobe.scale[2])
        mesh.castShadow = false
        mesh.receiveShadow = false
        group.add(mesh)
      }
      this.root.add(group)
      const logicalPosition = { ...cloud.position }
      group.userData.logicalPosition = logicalPosition
      return {
        group,
        logicalPosition,
        height: cloud.height,
      }
    })
    scene.add(this.root)
    this.update({ x: 0, z: 0 }, { x: 0, z: 0 }, 0)
  }

  update(logicalCamera: WorldPoint, origin: WorldPoint, deltaSeconds: number): void {
    if (this.disposed) return
    for (const [index, cloud] of this.clouds.entries()) {
      cloud.logicalPosition.x += CLOUD_DRIFT_SPEED * Math.max(0, deltaSeconds)
      const wrappedPosition = wrapCloudPosition(cloud.logicalPosition, logicalCamera, index)
      if (wrappedPosition !== cloud.logicalPosition) {
        cloud.logicalPosition.x = wrappedPosition.x
        cloud.logicalPosition.z = wrappedPosition.z
      }
      cloud.group.position.set(
        cloud.logicalPosition.x - origin.x,
        cloud.height,
        cloud.logicalPosition.z - origin.z,
      )
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.root.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
  }
}

export const createCloudLayer = (scene: THREE.Scene): CloudLayerController =>
  new CloudLayer(scene)
