import { boundsOverlap, insidePlot, placementBounds } from './geometry'
import type { ModuleDefinition, Placement, TileRecipe } from './types'

const isHalfUnit = (value: number): boolean => Number.isInteger(value * 2)
const placementName = (placement: Placement): string => placement.moduleId

export function validateCatalog(catalog: readonly ModuleDefinition[]): void {
  const ids = new Set<string>()
  for (const module of catalog) {
    if (ids.has(module.id)) throw new Error(`Duplicate module ID ${module.id}`)
    ids.add(module.id)
    if (!module.source.endsWith('.gltf')) throw new Error(`${module.id}: source must be .gltf`)
    if (module.nodeName.length === 0) throw new Error(`${module.id}: node name is empty`)
    if (module.footprint.width <= 0 || module.footprint.depth <= 0) {
      throw new Error(`${module.id}: footprint must be positive`)
    }
  }
}

export function validateRecipes(
  recipes: readonly TileRecipe[],
  catalog: readonly ModuleDefinition[],
): void {
  validateCatalog(catalog)
  const modules = new Map(catalog.map((module) => [module.id, module]))
  const recipeIds = new Set<string>()

  for (const recipe of recipes) {
    if (recipeIds.has(recipe.id)) throw new Error(`Duplicate recipe ID ${recipe.id}`)
    recipeIds.add(recipe.id)
    if (recipe.weight <= 0 || !Number.isInteger(recipe.weight)) {
      throw new Error(`${recipe.id}: weight must be a positive integer`)
    }

    const resolved = recipe.placements.map((placement) => {
      const module = modules.get(placement.moduleId)
      if (module === undefined) throw new Error(`${recipe.id}: unknown module ${placement.moduleId}`)
      if (!module.allowedRotations.includes(placement.rotation)) {
        throw new Error(`${recipe.id}: ${module.id} has unsupported rotation ${placement.rotation}`)
      }
      if (!isHalfUnit(placement.x) || !isHalfUnit(placement.z)) {
        throw new Error(`${recipe.id}: ${module.id} position must use an integer or half-unit`)
      }
      const bounds = placementBounds(module.footprint, placement)
      if (!insidePlot(bounds)) throw new Error(`${recipe.id}: ${module.id} is outside plot`)
      return { placement, module, bounds }
    })

    for (let leftIndex = 0; leftIndex < resolved.length; leftIndex += 1) {
      const left = resolved[leftIndex]!
      if (left.module.kind === 'surface') continue
      for (let rightIndex = leftIndex + 1; rightIndex < resolved.length; rightIndex += 1) {
        const right = resolved[rightIndex]!
        if (right.module.kind === 'surface') continue
        if (left.module.kind === 'prop' && right.module.kind === 'prop') continue
        if (boundsOverlap(left.bounds, right.bounds)) {
          throw new Error(`${recipe.id}: ${placementName(left.placement)} overlaps ${placementName(right.placement)}`)
        }
      }
    }

    const surfaceKeys = resolved
      .filter(({ module }) => module.kind === 'surface')
      .map(({ placement }) => `${placement.x}:${placement.z}`)
      .sort()
    expectSurfaceCells(recipe.id, surfaceKeys)
  }
}

function expectSurfaceCells(recipeId: string, actual: readonly string[]): void {
  const expected = ['10:10']
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${recipeId}: surface must cover the plot at 10:10`)
  }
}
