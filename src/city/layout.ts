import { hashCoordinates } from './hash'
import type { BuildingId, GridCoordinate, QuarterTurn, TileChoice } from './types'

interface BuildingCatalogEntry {
  readonly id: BuildingId
  readonly weight: number
}

export const BUILDING_CATALOG = [
  { id: 'apartments', weight: 8 },
  { id: 'bus', weight: 2 },
  { id: 'coffeeshop', weight: 5 },
  { id: 'factory', weight: 3 },
  { id: 'fastfood', weight: 5 },
  { id: 'gas', weight: 3 },
  { id: 'house', weight: 9 },
  { id: 'house2', weight: 9 },
  { id: 'house3', weight: 9 },
  { id: 'park', weight: 8 },
  { id: 'residence', weight: 8 },
  { id: 'shoparea', weight: 5 },
  { id: 'shops', weight: 6 },
  { id: 'stadium', weight: 1 },
  { id: 'supermarket', weight: 4 },
  { id: 'remix-residential-court', weight: 6 },
  { id: 'remix-residential-towers', weight: 4 },
  { id: 'remix-residential-garden', weight: 6 },
  { id: 'remix-residential-row', weight: 6 },
  { id: 'remix-commercial-market', weight: 4 },
  { id: 'remix-commercial-cafes', weight: 4 },
  { id: 'remix-commercial-shops', weight: 4 },
  { id: 'remix-commercial-services', weight: 3 },
  { id: 'remix-mixed-main-street', weight: 3 },
  { id: 'remix-mixed-neighborhood', weight: 4 },
  { id: 'remix-civic-plaza', weight: 1 },
  { id: 'remix-park-corner', weight: 5 },
] as const satisfies readonly BuildingCatalogEntry[]

const TOTAL_WEIGHT = BUILDING_CATALOG.reduce((sum, entry) => sum + entry.weight, 0)

function selectBuilding({ x, z }: GridCoordinate, seed: number, salt = 0): BuildingId {
  let choice = hashCoordinates(seed, x, z, salt) % TOTAL_WEIGHT

  for (const entry of BUILDING_CATALOG) {
    if (choice < entry.weight) return entry.id
    choice -= entry.weight
  }

  return BUILDING_CATALOG[BUILDING_CATALOG.length - 1]!.id
}

export function chooseTile(coordinate: GridCoordinate, seed: number): TileChoice {
  const rawBuilding = selectBuilding(coordinate, seed)
  const westBuilding = selectBuilding({ x: coordinate.x - 1, z: coordinate.z }, seed)
  const northBuilding = selectBuilding({ x: coordinate.x, z: coordinate.z - 1 }, seed)
  const building = rawBuilding === westBuilding && rawBuilding === northBuilding
    ? selectBuilding(coordinate, seed, 0x1a2b3c4d)
    : rawBuilding
  const rotation = hashCoordinates(seed, coordinate.x, coordinate.z, 0x51f15e) % 4 as QuarterTurn

  return { building, rotation }
}
