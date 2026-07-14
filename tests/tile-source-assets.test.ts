import { Accessor, Document } from '@gltf-transform/core'
import { getBounds } from '@gltf-transform/functions'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MODULE_CATALOG } from '../tools/tiles/module-catalog'
import {
  assertDeclaredFootprint,
  copyPlacedModule,
  findExactNode,
  measureModuleFootprint,
  SourceCache,
} from '../tools/tiles/source-assets'
import type { ModuleDefinition } from '../tools/tiles/types'

const ENRICHMENT_MODULE_IDS = [
  'cube-tree', 'fir-tree', 'parked-car', 'pickup-truck', 'police-car',
  'delivery-truck', 'hydrant', 'street-light', 'stop-sign', 'barrier', 'fence',
] as const

const definition: ModuleDefinition = {
  id: 'fixture', source: 'fixture.gltf', nodeName: 'Fixture', kind: 'building',
  anchor: 'bottom-center', footprint: { width: 4, depth: 6 }, allowedRotations: [0, 1, 2, 3],
}

const createSource = (): Document => {
  const document = new Document()
  const buffer = document.createBuffer()
  const positions = document.createAccessor().setType(Accessor.Type.VEC3!).setArray(new Float32Array([
    -2, 0, -3, 2, 0, -3, 2, 5, 3, -2, 5, 3,
  ])).setBuffer(buffer)
  const primitive = document.createPrimitive().setAttribute('POSITION', positions)
  const mesh = document.createMesh('FixtureMesh').addPrimitive(primitive)
  const geometry = document.createNode('FixtureGeometry').setMesh(mesh)
  const node = document.createNode('Fixture').setTranslation([10, 0, 20]).addChild(geometry)
  document.createScene('Source').addChild(node)
  return document
}

describe('source asset extraction', () => {
  it('resolves every enrichment prop once within its declared footprint', async () => {
    const sources = new SourceCache(resolve('.'))
    const byId = new Map(MODULE_CATALOG.map((entry) => [entry.id, entry]))
    for (const id of ENRICHMENT_MODULE_IDS) {
      const entry = byId.get(id)
      expect(entry, id).toBeDefined()
      const source = await sources.load(entry!.source)
      const node = findExactNode(source, entry!)
      expect(node.getName()).toBe(entry!.nodeName)
      expect(() => assertDeclaredFootprint(node, entry!)).not.toThrow()
    }
  })

  it('requires one exact node name', () => {
    const source = createSource()
    expect(findExactNode(source, definition).getName()).toBe('Fixture')
    source.createNode('Fixture')
    expect(() => findExactNode(source, definition)).toThrow('fixture.gltf: expected one node named Fixture, found 2')
  })

  it('measures the source world-space footprint', () => {
    expect(measureModuleFootprint(findExactNode(createSource(), definition)))
      .toEqual({ width: 4, depth: 6 })
  })

  it('copies, bottom-centers, rotates, and places a module', () => {
    const output = new Document()
    const root = output.createNode('tile-root')
    output.createScene('tile').addChild(root)
    copyPlacedModule(output, root, createSource(), definition, {
      moduleId: 'fixture', x: 8, z: 12, rotation: 1,
    }, 0)
    const placement = root.listChildren()[0]!
    expect(placement.getTranslation()).toEqual([8, 0, 12])
    expect(placement.getRotation()).toEqual([0, Math.SQRT1_2, 0, Math.SQRT1_2])
    expect(placement.listChildren()).toHaveLength(1)
    const copiedModule = placement.listChildren()[0]!
    expect(copiedModule.listChildren()).toHaveLength(1)
    const copiedGeometry = copiedModule.listChildren()[0]!
    expect(copiedGeometry.getName()).toBe('FixtureGeometry')
    expect(copiedGeometry.getMesh()?.getName()).toBe('FixtureMesh')
    expect(copiedGeometry.getMesh()?.listPrimitives()[0]?.getAttribute('POSITION')?.getCount()).toBe(4)
    const bounds = getBounds(copiedModule)
    expect(bounds.min[1]).toBeCloseTo(0)
    expect((bounds.min[0] + bounds.max[0]) / 2).toBeCloseTo(placement.getTranslation()[0])
    expect((bounds.min[2] + bounds.max[2]) / 2).toBeCloseTo(placement.getTranslation()[2])
  })
})
