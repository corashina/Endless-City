import * as THREE from 'three'
import type { WorldPoint } from '../city/types'
import {
  headingForDirection,
  poseForVehicle,
  shortestAngleDelta,
} from '../traffic/routing'
import type { VehiclePose, VehicleState } from '../traffic/types'
import type { AssetCatalog } from './assets'

const WORLD_UP = new THREE.Vector3(0, 1, 0)

export function interpolatedVehiclePose(
  vehicle: VehicleState,
  alpha: number,
): VehiclePose {
  const current = poseForVehicle(vehicle)
  return {
    x: vehicle.previousPose.x + (current.x - vehicle.previousPose.x) * alpha,
    z: vehicle.previousPose.z + (current.z - vehicle.previousPose.z) * alpha,
    heading: vehicle.previousPose.heading
      + shortestAngleDelta(vehicle.previousPose.heading, current.heading) * alpha,
  }
}

interface VehicleSlot {
  prototypeId: string
  object: THREE.Object3D
  baseQuaternion: THREE.Quaternion
}

export class TrafficView {
  readonly root = new THREE.Group()

  private readonly slots: VehicleSlot[]
  private readonly routeYaw = new THREE.Quaternion()

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

      const slotState = this.slots[index]!
      const object = slotState.object
      object.visible = vehicle.active
      if (!vehicle.active) continue

      const pose = interpolatedVehiclePose(vehicle, alpha)
      object.position.set(pose.x - origin.x, object.position.y, pose.z - origin.z)
      const yaw = shortestAngleDelta(
        pose.heading,
        headingForDirection(vehicle.nativeDirection),
      )
      this.routeYaw.setFromAxisAngle(WORLD_UP, yaw)
      object.quaternion.copy(slotState.baseQuaternion).premultiply(this.routeYaw)
    }
  }

  private createSlot(prototypeId: string): VehicleSlot {
    const object = this.assets.cloneVehicle(prototypeId) ?? new THREE.Group()
    return {
      prototypeId,
      object,
      baseQuaternion: object.quaternion.clone(),
    }
  }
}
