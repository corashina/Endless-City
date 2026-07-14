import { describe, expect, it } from 'vitest'
import { MODULE_CATALOG } from '../tools/tiles/module-catalog'
import { REMIX_TILE_IDS, REMIX_TILE_RECIPES } from '../tools/tiles/tile-recipes'
import { validateCatalog, validateRecipes } from '../tools/tiles/validate-recipes'
import type { ModuleDefinition, TileRecipe } from '../tools/tiles/types'

const ENRICHMENT_MODULES = [
  { id: 'cube-tree', source: 'apartments.gltf', nodeName: 'Natures_Cube_Tree.obj', width: 3.39, depth: 3.19 },
  { id: 'fir-tree', source: 'house.gltf', nodeName: 'Natures_Fir_Tree.obj', width: 3.39, depth: 3.92 },
  { id: 'parked-car', source: 'house.gltf', nodeName: 'Vehicle_Car.obj', width: 6.32, depth: 2.96 },
  { id: 'pickup-truck', source: 'gas.gltf', nodeName: 'Vehicle_Pick_up_Truck.obj', width: 3.10, depth: 5.97 },
  { id: 'police-car', source: 'gas.gltf', nodeName: 'Vehicle_Police_Car.obj', width: 6.32, depth: 2.96 },
  { id: 'delivery-truck', source: 'factory.gltf', nodeName: 'Vehicle_Truck.obj', width: 9.10, depth: 3.63 },
  { id: 'hydrant', source: 'bus.gltf', nodeName: 'Props_Hydrant.obj', width: 0.44, depth: 0.44 },
  { id: 'street-light', source: 'road.gltf', nodeName: 'Props_Street_Light.obj', width: 0.60, depth: 2.53 },
  { id: 'stop-sign', source: 'bus.gltf', nodeName: 'Props_Traffic_Sign_stop.obj', width: 0.72, depth: 0.07 },
  { id: 'barrier', source: 'supermarket.gltf', nodeName: 'Props_Traffic_Control_Barrier_Fence.obj', width: 3.60, depth: 0.20 },
  { id: 'fence', source: 'house2.gltf', nodeName: 'Props_Fence.obj', width: 39.60, depth: 0.16 },
] as const

describe('remix module catalog', () => {
  it('contains unique stable IDs and exact source node names', () => {
    expect(() => validateCatalog(MODULE_CATALOG)).not.toThrow()
    expect(new Set(MODULE_CATALOG.map(({ id }) => id)).size).toBe(MODULE_CATALOG.length)
  })

  it('pins the exact enrichment prop catalog', () => {
    const ids = new Set(ENRICHMENT_MODULES.map(({ id }) => id))
    expect(MODULE_CATALOG.filter(({ id }) => ids.has(id as typeof ENRICHMENT_MODULES[number]['id']))
      .map(({ id, source, nodeName, kind, footprint }) => ({
        id, source, nodeName, kind, width: footprint.width, depth: footprint.depth,
      }))).toEqual(ENRICHMENT_MODULES.map((entry) => ({ ...entry, kind: 'prop' })))
  })
})

describe('curated remix recipes', () => {
  it('keeps the approved recipe ID ordering stable', () => {
    expect(REMIX_TILE_IDS).toEqual([
      'remix-residential-court',
      'remix-residential-towers',
      'remix-residential-garden',
      'remix-residential-row',
      'remix-commercial-market',
      'remix-commercial-cafes',
      'remix-commercial-shops',
      'remix-commercial-services',
      'remix-mixed-main-street',
      'remix-mixed-neighborhood',
      'remix-civic-plaza',
      'remix-park-corner',
    ])
  })

  it('contains the approved category distribution and valid layouts', () => {
    expect(REMIX_TILE_RECIPES).toHaveLength(12)
    expect(REMIX_TILE_RECIPES.map(({ category }) => category).sort()).toEqual([
      'civic', 'commercial', 'commercial', 'commercial', 'commercial', 'mixed', 'mixed',
      'park', 'residential', 'residential', 'residential', 'residential',
    ])
    expect(() => validateRecipes(REMIX_TILE_RECIPES, MODULE_CATALOG)).not.toThrow()
  })

  it('reports the recipe and modules for building overlap', () => {
    const modules: ModuleDefinition[] = [
      { id: 'a', source: 'a.gltf', nodeName: 'A', kind: 'building', anchor: 'bottom-center', footprint: { width: 10, depth: 10 }, allowedRotations: [0] },
      { id: 'b', source: 'b.gltf', nodeName: 'B', kind: 'building', anchor: 'bottom-center', footprint: { width: 10, depth: 10 }, allowedRotations: [0] },
    ]
    const recipes: TileRecipe[] = [{
      id: 'collision', category: 'mixed', weight: 1,
      placements: [
        { moduleId: 'a', x: 0, z: 0, rotation: 0 },
        { moduleId: 'b', x: 5, z: 0, rotation: 0 },
      ],
    }]
    expect(() => validateRecipes(recipes, modules)).toThrow('collision: a overlaps b')
  })

  it('rejects prop-building overlap but permits prop-prop overlap', () => {
    const modules: ModuleDefinition[] = [
      { id: 'surface', source: 'surface.gltf', nodeName: 'Surface', kind: 'surface', anchor: 'bottom-center', footprint: { width: 40, depth: 40 }, allowedRotations: [0] },
      { id: 'building', source: 'building.gltf', nodeName: 'Building', kind: 'building', anchor: 'bottom-center', footprint: { width: 10, depth: 10 }, allowedRotations: [0] },
      { id: 'prop-a', source: 'props.gltf', nodeName: 'PropA', kind: 'prop', anchor: 'bottom-center', footprint: { width: 4, depth: 4 }, allowedRotations: [0] },
      { id: 'prop-b', source: 'props.gltf', nodeName: 'PropB', kind: 'prop', anchor: 'bottom-center', footprint: { width: 4, depth: 4 }, allowedRotations: [0] },
    ]
    const placements: TileRecipe['placements'] = [
      { moduleId: 'surface', x: 10, z: 10, rotation: 0 },
      { moduleId: 'prop-a', x: 0, z: 0, rotation: 0 },
      { moduleId: 'prop-b', x: 0, z: 0, rotation: 0 },
    ]
    const recipe = (id: string, selected: TileRecipe['placements']): TileRecipe => ({
      id, category: 'mixed', weight: 1, placements: selected,
    })

    expect(() => validateRecipes([
      recipe('prop-building', [...placements, { moduleId: 'building', x: 0, z: 0, rotation: 0 }]),
    ], modules)).toThrow('prop-building: prop-a overlaps building')
    expect(() => validateRecipes([recipe('prop-prop', placements)], modules)).not.toThrow()
  })

  it('rejects duplicate recipe IDs', () => {
    const surface: ModuleDefinition = {
      id: 'surface', source: 'surface.gltf', nodeName: 'Surface', kind: 'surface',
      anchor: 'bottom-center', footprint: { width: 40, depth: 40 }, allowedRotations: [0],
    }
    const duplicate: TileRecipe = {
      id: 'duplicate', category: 'park', weight: 1,
      placements: [{ moduleId: 'surface', x: 10, z: 10, rotation: 0 }],
    }

    expect(() => validateRecipes([duplicate, duplicate], [surface])).toThrow('Duplicate recipe ID duplicate')
  })

  it('rejects unknown modules, unsupported rotations, off-grid positions, and out-of-bounds geometry', () => {
    const modules: ModuleDefinition[] = [{
      id: 'house', source: 'house.gltf', nodeName: 'House', kind: 'building',
      anchor: 'bottom-center', footprint: { width: 10, depth: 10 }, allowedRotations: [0],
    }]
    const recipe = (placement: TileRecipe['placements'][number]): TileRecipe[] => [{
      id: 'bad', category: 'residential', weight: 1, placements: [placement],
    }]
    expect(() => validateRecipes(recipe({ moduleId: 'missing', x: 0, z: 0, rotation: 0 }), modules)).toThrow('unknown module missing')
    expect(() => validateRecipes(recipe({ moduleId: 'house', x: 0, z: 0, rotation: 1 }), modules)).toThrow('unsupported rotation 1')
    expect(() => validateRecipes(recipe({ moduleId: 'house', x: 0.25, z: 0, rotation: 0 }), modules)).toThrow('integer or half-unit')
    expect(() => validateRecipes(recipe({ moduleId: 'house', x: 29, z: 0, rotation: 0 }), modules)).toThrow('outside plot')
  })
})
