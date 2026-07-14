import type { Placement, TileCategory, TileRecipe } from './types'

const surface = (moduleId: 'grass' | 'concrete' | 'road-surface'): Placement[] => [
  { moduleId, x: 10, z: 10, rotation: 0 },
]
const tile = (
  id: string, category: TileCategory, weight: number,
  base: 'grass' | 'concrete' | 'road-surface', placements: Placement[],
): TileRecipe => ({ id, category, weight, placements: [...surface(base), ...placements] })

export const REMIX_TILE_RECIPES = Object.freeze([
  tile('remix-residential-court', 'residential', 6, 'grass', [
    { moduleId: 'house02', x: 0, z: 0, rotation: 0 },
    { moduleId: 'house03', x: 20, z: 20, rotation: 0 },
    { moduleId: 'big-tree', x: 25, z: 0, rotation: 0 },
    { moduleId: 'bench-1', x: 0, z: 20, rotation: 0 },
  ]),
  tile('remix-residential-towers', 'residential', 4, 'concrete', [
    { moduleId: 'residential', x: 0, z: 10, rotation: 0 },
    { moduleId: 'sky-small', x: 20, z: 10, rotation: 0 },
    { moduleId: 'bench-2', x: 10, z: 25, rotation: 0 },
    { moduleId: 'big-tree', x: 27, z: 27, rotation: 0 },
  ]),
  tile('remix-residential-garden', 'residential', 6, 'grass', [
    { moduleId: 'house01', x: -2, z: 18, rotation: 0 },
    { moduleId: 'house04', x: 17, z: 0, rotation: 0 },
    { moduleId: 'grass-fence', x: -9.5, z: 10, rotation: 0 },
    { moduleId: 'bench-1', x: 10, z: 15, rotation: 0 },
  ]),
  tile('remix-residential-row', 'residential', 6, 'grass', [
    { moduleId: 'house01', x: -3.5, z: 10, rotation: 0 },
    { moduleId: 'house01', x: 9.5, z: 10, rotation: 0 },
    { moduleId: 'house02', x: 23, z: 10, rotation: 1 },
  ]),
  tile('remix-commercial-market', 'commercial', 4, 'concrete', [
    { moduleId: 'supermarket', x: 0, z: 10, rotation: 0 },
    { moduleId: 'bakery', x: 20, z: 10, rotation: 0 },
    { moduleId: 'bench-2', x: 20, z: 25, rotation: 0 },
  ]),
  tile('remix-commercial-cafes', 'commercial', 4, 'concrete', [
    { moduleId: 'coffee-shop', x: 0, z: 0, rotation: 0 },
    { moduleId: 'bar', x: 20, z: 0, rotation: 0 },
    { moduleId: 'coffee-chair', x: 15, z: 12, rotation: 0 },
    { moduleId: 'coffee-chair', x: 19, z: 12, rotation: 1 },
    { moduleId: 'big-tree', x: 25, z: 25, rotation: 0 },
  ]),
  tile('remix-commercial-shops', 'commercial', 4, 'concrete', [
    { moduleId: 'books', x: -3, z: -3, rotation: 0 },
    { moduleId: 'clothing', x: 17, z: -3, rotation: 0 },
    { moduleId: 'shoes', x: -3, z: 17, rotation: 0 },
    { moduleId: 'fruits', x: 17, z: 17, rotation: 0 },
  ]),
  tile('remix-commercial-services', 'commercial', 3, 'road-surface', [
    { moduleId: 'gas-station', x: 7, z: 0, rotation: 0 },
    { moduleId: 'auto-service', x: 10, z: 20, rotation: 1 },
  ]),
  tile('remix-mixed-main-street', 'mixed', 3, 'concrete', [
    { moduleId: 'residential', x: 0, z: 0, rotation: 0 },
    { moduleId: 'drug-store', x: 20, z: 0, rotation: 0 },
    { moduleId: 'books', x: 20, z: 20, rotation: 0 },
    { moduleId: 'bench-1', x: 0, z: 20, rotation: 0 },
  ]),
  tile('remix-mixed-neighborhood', 'mixed', 4, 'grass', [
    { moduleId: 'sky-small', x: 0, z: 0, rotation: 0 },
    { moduleId: 'coffee-shop', x: 20, z: 10, rotation: 1 },
    { moduleId: 'gift-shop', x: 0, z: 20, rotation: 0 },
    { moduleId: 'big-tree', x: 25, z: 25, rotation: 0 },
  ]),
  tile('remix-civic-plaza', 'civic', 1, 'concrete', [
    { moduleId: 'sky-small', x: 0, z: 0, rotation: 0 },
    { moduleId: 'bench-1', x: 15, z: 0, rotation: 0 },
    { moduleId: 'bench-2', x: 15, z: 8, rotation: 2 },
    { moduleId: 'big-tree', x: 25, z: 25, rotation: 0 },
  ]),
  tile('remix-park-corner', 'park', 5, 'grass', [
    { moduleId: 'big-tree', x: -5, z: -5, rotation: 0 },
    { moduleId: 'big-tree', x: 25, z: 25, rotation: 1 },
    { moduleId: 'bench-1', x: 5, z: 10, rotation: 0 },
    { moduleId: 'bench-2', x: 20, z: 10, rotation: 2 },
    { moduleId: 'bush', x: 10, z: 25, rotation: 0 },
    { moduleId: 'rock', x: 20, z: 0, rotation: 0 },
  ]),
] satisfies readonly TileRecipe[])

export const REMIX_TILE_IDS = REMIX_TILE_RECIPES.map(({ id }) => id)
