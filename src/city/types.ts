export interface GridCoordinate { readonly x: number; readonly z: number }
export interface WorldPoint { readonly x: number; readonly z: number }
export type QuarterTurn = 0 | 1 | 2 | 3
export type BuildingId =
  | 'apartments' | 'bus' | 'coffeeshop' | 'factory' | 'fastfood'
  | 'gas' | 'house' | 'house2' | 'house3' | 'park' | 'residence'
  | 'shoparea' | 'shops' | 'stadium' | 'supermarket'
export interface TileChoice { readonly building: BuildingId; readonly rotation: QuarterTurn }
export const coordinateKey = ({ x, z }: GridCoordinate): string => `${x}:${z}`
