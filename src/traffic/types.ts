export type Direction = 'east' | 'west' | 'north' | 'south'

export interface Lane {
  readonly direction: Direction
  readonly line: number
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
  previousProgress: number
  progress: number
  speed: number
  desiredSpeed: number
  active: boolean
  reservationKey: string | null
}

export interface TrafficConfig {
  readonly minimumGap: number
  readonly timeHeadway: number
  readonly maximumAcceleration: number
  readonly comfortableBraking: number
  readonly intersectionHalfExtent: number
  readonly reservationLookAhead: number
  readonly protectedRadius: number
  readonly simulationRadius: number
}
