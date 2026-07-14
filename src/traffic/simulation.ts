import type { WorldPoint } from '../city/types'
import { stepFollowing } from './following'
import { planMissingMovements } from './intersections'
import {
  updateMovementReservations,
  type MovementReservations,
} from './movements'
import { poseForVehicle, vehicleExtentIntersectsRadius } from './routing'
import {
  createTrafficPool,
  recycleTraffic,
  type CreateTrafficPoolInput,
} from './spawning'
import type {
  Direction,
  TrafficConfig,
  VehiclePrototypeMetadata,
  VehicleState,
} from './types'

export interface TrafficSimulationInput extends CreateTrafficPoolInput {}

export class TrafficSimulation {
  readonly vehicles: VehicleState[]

  private readonly config: TrafficConfig
  private readonly prototypes: readonly VehiclePrototypeMetadata[]
  private readonly seed: number
  private readonly mutableReservations: MovementReservations = new Map()
  private stepNumber = 0

  constructor(input: TrafficSimulationInput) {
    this.config = input.config
    this.prototypes = input.prototypes
    this.seed = input.seed
    this.vehicles = createTrafficPool(input)
  }

  get reservations(): ReadonlyMap<string, { readonly vehicleId: number; readonly movementKey: string }> {
    return this.mutableReservations
  }

  counts(camera: WorldPoint): {
    readonly active: number
    readonly visible: number
    readonly movingVisible: number
    readonly directions: ReadonlySet<Direction>
  } {
    let active = 0
    let visible = 0
    let movingVisible = 0
    const directions = new Set<Direction>()

    for (const vehicle of this.vehicles) {
      if (!vehicle.active) continue
      active += 1
      if (!vehicleExtentIntersectsRadius(vehicle, camera, this.config.protectedRadius)) continue
      visible += 1
      directions.add(vehicle.lane.direction)
      if (vehicle.speed > this.config.stoppedSpeedThreshold) movingVisible += 1
    }

    return { active, visible, movingVisible, directions }
  }

  private updateOffscreenStoppedSteps(camera: WorldPoint): void {
    for (const vehicle of this.vehicles) {
      if (!vehicle.active) {
        vehicle.offscreenStoppedSteps = 0
        continue
      }
      const visible = vehicleExtentIntersectsRadius(
        vehicle,
        camera,
        this.config.protectedRadius,
      )
      if (visible || vehicle.speed >= this.config.stoppedSpeedThreshold) {
        vehicle.offscreenStoppedSteps = 0
      } else {
        vehicle.offscreenStoppedSteps += 1
      }
    }
  }

  private pruneStaleReservations(): void {
    const vehiclesById = new Map(this.vehicles.map((vehicle) => [vehicle.id, vehicle]))
    for (const [key, reservation] of this.mutableReservations) {
      const holder = vehiclesById.get(reservation.vehicleId)
      if (holder === undefined || !holder.active || !holder.ownedZoneKeys.includes(key)) {
        this.mutableReservations.delete(key)
      }
    }
  }

  step(deltaSeconds: number, camera: WorldPoint): void {
    for (const vehicle of this.vehicles) {
      vehicle.previousProgress = vehicle.progress
      vehicle.previousPose = poseForVehicle(vehicle)
    }
    planMissingMovements(this.vehicles, this.seed, this.config)

    const { stops: virtualStops } = updateMovementReservations(
      this.vehicles,
      this.mutableReservations,
      this.config,
      this.stepNumber,
    )
    stepFollowing(this.vehicles, deltaSeconds, this.config, virtualStops)
    this.updateOffscreenStoppedSteps(camera)
    recycleTraffic({
      vehicles: this.vehicles,
      seed: this.seed,
      step: this.stepNumber,
      camera,
      prototypes: this.prototypes,
      config: this.config,
    })
    this.pruneStaleReservations()
    this.stepNumber += 1
  }
}
