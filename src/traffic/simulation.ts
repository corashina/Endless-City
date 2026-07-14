import type { WorldPoint } from '../city/types'
import { stepFollowing } from './following'
import {
  updateMovementReservations,
  type MovementReservations,
} from './movements'
import { planMovement } from './routing'
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
      if (!vehicle.active) continue

      if (vehicle.turn !== null) {
        vehicle.turn.distance = Math.max(
          0,
          vehicle.progress - vehicle.turn.movement.entryProgress,
        )
      } else if (vehicle.plannedMovement === null) {
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

    for (const vehicle of this.vehicles) {
      const movement = vehicle.plannedMovement
      if (!vehicle.active || movement === null) continue

      if (vehicle.turn === null && vehicle.ownedZoneKeys.length > 0) {
        if (vehicle.progress >= movement.entryProgress) {
          vehicle.turn = {
            movement,
            distance: vehicle.progress - movement.entryProgress,
          }
        }
      } else if (vehicle.turn !== null) {
        vehicle.turn.distance = Math.max(0, vehicle.progress - movement.entryProgress)
        if (
          vehicle.ownedZoneKeys.length === 0
          && vehicle.turn.distance - vehicle.length / 2 > movement.length
        ) {
          vehicle.turn = null
          vehicle.plannedMovement = null
        }
      }
    }
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
