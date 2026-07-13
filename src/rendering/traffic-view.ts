import * as THREE from 'three'
import type { WorldPoint } from '../city/types'
import { positionOnLane } from '../traffic/lanes'
import type { VehicleState } from '../traffic/types'
import type { AssetCatalog } from './assets'

export function interpolatedVehiclePoint(
  vehicle: VehicleState,
  alpha: number,
): WorldPoint {
  const progress = vehicle.previousProgress
    + (vehicle.progress - vehicle.previousProgress) * alpha
  return positionOnLane(vehicle.lane, progress)
}

interface VehicleSlot {
  prototypeId: string
  object: THREE.Object3D
}

export class TrafficView {
  readonly root = new THREE.Group()

  private readonly slots: VehicleSlot[]

  constructor(
    scene: THREE.Scene,
    private readonly assets: AssetCatalog,
    vehicles: readonly VehicleState[],
  ) {
    this.root.name = 'traffic-pool'
    this.slots = vehicles.map((vehicle) => this.createSlot(vehicle.prototypeId))
    this.root.add(...this.slots.map(({ object }) => object))
    scene.add(this.root)
  }

  sync(vehicles: readonly VehicleState[], origin: WorldPoint, alpha: number): void {
    for (let index = 0; index < this.slots.length; index += 1) {
      const vehicle = vehicles[index]
      const slot = this.slots[index]
      if (vehicle === undefined || slot === undefined) continue

      if (slot.prototypeId !== vehicle.prototypeId) {
        const replacement = this.createSlot(vehicle.prototypeId)
        this.root.remove(slot.object)
        this.root.add(replacement.object)
        this.slots[index] = replacement
      }

      const object = this.slots[index]!.object
      object.visible = vehicle.active
      if (!vehicle.active) continue

      const point = interpolatedVehiclePoint(vehicle, alpha)
      object.position.set(point.x - origin.x, object.position.y, point.z - origin.z)
    }
  }

  private createSlot(prototypeId: string): VehicleSlot {
    const object = this.assets.cloneVehicle(prototypeId) ?? new THREE.Group()
    return { prototypeId, object }
  }
}
