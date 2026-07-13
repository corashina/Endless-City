import type { WorldPoint } from '../city/types'
import { stepFollowing } from './following'
import {
  updateIntersectionReservations,
  type IntersectionReservations,
} from './intersections'
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
  private readonly mutableReservations: IntersectionReservations = new Map()
  private stepNumber = 0

  constructor(input: TrafficSimulationInput) {
    this.config = input.config
    this.prototypes = input.prototypes
    this.seed = input.seed
    this.vehicles = createTrafficPool(input)
  }

  get reservations(): ReadonlyMap<string, number> {
    return this.mutableReservations
  }

  step(deltaSeconds: number, camera: WorldPoint): void {
    for (const vehicle of this.vehicles) vehicle.previousProgress = vehicle.progress

    const virtualStops = updateIntersectionReservations(
      this.vehicles,
      this.mutableReservations,
      this.config,
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
