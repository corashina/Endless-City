import { describe, expect, it } from 'vitest'
import { MODULE_CATALOG } from '../tools/tiles/module-catalog'
import { REMIX_TILE_RECIPES } from '../tools/tiles/tile-recipes'
import { validateCatalog, validateRecipes } from '../tools/tiles/validate-recipes'
import type { ModuleDefinition, TileRecipe } from '../tools/tiles/types'

describe('remix module catalog', () => {
  it('contains unique stable IDs and exact source node names', () => {
    expect(() => validateCatalog(MODULE_CATALOG)).not.toThrow()
    expect(new Set(MODULE_CATALOG.map(({ id }) => id)).size).toBe(MODULE_CATALOG.length)
  })
})

describe('curated remix recipes', () => {
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
