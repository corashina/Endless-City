import type { WorldPoint } from '../city/types'

export type Direction = 'east' | 'west' | 'north' | 'south'
export type DriverProfile = 'cautious' | 'normal' | 'assertive'
export type Maneuver = 'straight' | 'left' | 'right'

export interface DriverTraits {
  readonly profile: DriverProfile
  readonly cruiseSpeed: number
  readonly maximumAcceleration: number
  readonly comfortableBraking: number
  readonly emergencyBraking: number
  readonly timeHeadway: number
  readonly minimumGap: number
}

export interface VehiclePose extends WorldPoint {
  readonly heading: number
}

export interface Lane {
  readonly direction: Direction
  readonly line: number
}

export interface PlannedMovement {
  readonly key: string
  readonly intersectionKey: string
  readonly xIndex: number
  readonly zIndex: number
  readonly maneuver: Maneuver
  readonly incomingLane: Lane
  readonly outgoingLane: Lane
  readonly entryProgress: number
  readonly exitProgress: number
  readonly length: number
  readonly samples: readonly VehiclePose[]
  readonly sampleDistances: readonly number[]
}

export interface TurnState {
  readonly movement: PlannedMovement
  distance: number
}

export interface VehiclePrototypeMetadata {
  readonly id: string
  readonly length: number
  readonly direction: Direction
}

export interface VehicleState {
  readonly id: number
  prototypeId: string
  length: number
  lane: Lane
  nativeDirection: Direction
  previousProgress: number
  progress: number
  speed: number
  desiredSpeed: number
  active: boolean
  reservationKey: string | null
  lifecycle: number
  traits: DriverTraits
  routeDecisionIndex: number
  offscreenStoppedSteps: number
  requestAgeSteps: number
  movementEntered: boolean
  grantExpiresAtStep: number | null
  ownedZoneKeys: string[]
  plannedMovement: PlannedMovement | null
  turn: TurnState | null
  clearingMovement: PlannedMovement | null
  previousPose: VehiclePose
}

export interface TrafficConfig {
  readonly minimumGap: number
  readonly timeHeadway: number
  readonly maximumAcceleration: number
  readonly comfortableBraking: number
  readonly emergencyBrakingFloor: number
  readonly intersectionHalfExtent: number
  readonly reservationLookAhead: number
  readonly reservationLifetimeSteps: number
  readonly movementCorridorHalfWidth: number
  readonly stoppedSpeedThreshold: number
  readonly offscreenStoppedTimeoutSteps: number
  readonly protectedRadius: number
  readonly simulationRadius: number
}
