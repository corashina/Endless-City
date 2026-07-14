import type { WorldPoint } from '../city/types'
import { stepFollowing } from './following'
import {
  updateMovementReservations,
  type MovementReservations,
} from './movements'
import { planMovement, poseForVehicle } from './routing'
import {
  createTrafficPool,
  recycleTraffic,
  type CreateTrafficPoolInput,
} from './spawning'
import type { TrafficConfig, VehiclePrototypeMetadata, VehicleState } from './types'

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

  step(deltaSeconds: number, camera: WorldPoint): void {
    for (const vehicle of this.vehicles) {
      vehicle.previousProgress = vehicle.progress
      vehicle.previousPose = poseForVehicle(vehicle)
      if (!vehicle.active) continue

      if (vehicle.turn === null && vehicle.plannedMovement === null) {
        vehicle.plannedMovement = planMovement(
          vehicle.lane,
          vehicle.progress,
          'straight',
          this.config.intersectionHalfExtent,
        )
      }
    }

    const { stops: virtualStops } = updateMovementReservations(
      this.vehicles,
      this.mutableReservations,
      this.config,
      this.stepNumber,
    )
    stepFollowing(this.vehicles, deltaSeconds, this.config, virtualStops)
    recycleTraffic({
      vehicles: this.vehicles,
      seed: this.seed,
      step: this.stepNumber,
      camera,
      prototypes: this.prototypes,
      config: this.config,
    })
    this.stepNumber += 1
  }
}
