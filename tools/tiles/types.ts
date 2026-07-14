export type QuarterTurn = 0 | 1 | 2 | 3
export type ModuleKind = 'building' | 'prop' | 'surface'
export type AnchorRule = 'bottom-center'
export type TileCategory = 'residential' | 'commercial' | 'mixed' | 'civic' | 'park'

export interface Footprint { readonly width: number; readonly depth: number }
export interface Bounds2D {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}
export interface ModuleDefinition {
  readonly id: string
  readonly source: string
  readonly nodeName: string
  readonly kind: ModuleKind
  readonly anchor: AnchorRule
  readonly footprint: Footprint
  readonly allowedRotations: readonly QuarterTurn[]
}
export interface Placement {
  readonly moduleId: string
  readonly x: number
  readonly z: number
  readonly rotation: QuarterTurn
}
export interface TileRecipe {
  readonly id: string
  readonly category: TileCategory
  readonly weight: number
  readonly placements: readonly Placement[]
}
