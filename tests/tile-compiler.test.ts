import { Accessor, Document, NodeIO } from '@gltf-transform/core'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildTile, validateStagedGlb } from '../tools/tiles/build-tiles'
import { SourceCache } from '../tools/tiles/source-assets'
import type { TileRecipe } from '../tools/tiles/types'

const recipe: TileRecipe = {
  id: 'context-tile', category: 'residential', weight: 1,
  placements: [{ moduleId: 'house01', x: 0, z: 0, rotation: 0 }],
}

class RejectingSourceCache extends SourceCache {
  constructor(private readonly failure: Error) {
    super('.')
  }

  override load(): Promise<Document> {
    return Promise.reject(this.failure)
  }
}

class FixedSourceCache extends SourceCache {
  constructor(private readonly source: Document) {
    super('.')
  }

  override load(): Promise<Document> {
    return Promise.resolve(this.source)
  }
}

const captureBuildError = async (sources: SourceCache): Promise<Error> => {
  try {
    await buildTile(recipe, sources)
  } catch (error) {
    return error as Error
  }
  throw new Error('Expected tile build to fail')
}

describe('tile compiler diagnostics', () => {
  it('adds exact placement context to source failures and preserves the cause', async () => {
    const cause = new Error('source read failed')
    const error = await captureBuildError(new RejectingSourceCache(cause))

    expect(error.message).toContain('context-tile')
    expect(error.message).toContain('house01')
    expect(error.message).toContain('house.gltf')
    expect(error.message).toContain('Building_House_01_color01.obj')
    expect(error.cause).toBe(cause)
  })

  it('adds exact placement context to node extraction failures and preserves the cause', async () => {
    const error = await captureBuildError(new FixedSourceCache(new Document()))

    expect(error.message).toContain('context-tile')
    expect(error.message).toContain('house01')
    expect(error.message).toContain('house.gltf')
    expect(error.message).toContain('Building_House_01_color01.obj')
    expect(error.cause).toBeInstanceOf(Error)
    expect((error.cause as Error).message).toContain('expected one node named Building_House_01_color01.obj')
  })

  it('keeps unknown-module errors direct', async () => {
    const unknownRecipe: TileRecipe = {
      ...recipe,
      placements: [{ moduleId: 'missing', x: 0, z: 0, rotation: 0 }],
    }
    let caught: unknown
    try {
      await buildTile(unknownRecipe, new FixedSourceCache(new Document()))
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe('context-tile: unknown module missing')
    expect((caught as Error).cause).toBeUndefined()
  })

  it('reports measured staged bounds and the allowed envelope', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'endless-city-bounds-'))
    const path = join(directory, 'outside.glb')
    try {
      const document = new Document()
      const buffer = document.createBuffer()
      const positions = document.createAccessor().setType(Accessor.Type.VEC3!).setArray(new Float32Array([
        -11, 0, -3,
        2, 0, -3,
        2, 1, 4,
        -11, 1, 4,
      ])).setBuffer(buffer)
      const primitive = document.createPrimitive().setAttribute('POSITION', positions)
      const mesh = document.createMesh('Outside').addPrimitive(primitive)
      const root = document.createNode('outside-root').setMesh(mesh)
      document.createScene('outside').addChild(root)
      await writeFile(path, await new NodeIO().writeBinary(document))

      await expect(validateStagedGlb(path, 'outside-tile')).rejects.toThrow(
        'outside-tile: generated geometry bounds x=[-11.00, 2.00], z=[-3.00, 4.00] exceed allowed [-10, 30] envelope',
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
