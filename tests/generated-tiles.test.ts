import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { NodeIO } from '@gltf-transform/core'
import { getBounds } from '@gltf-transform/functions'
import { buildAllTiles } from '../tools/tiles/build-tiles'
import { REMIX_TILE_IDS } from '../tools/tiles/tile-recipes'

const temporaryDirectories: string[] = []
const makeOutput = async (): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), 'endless-city-tiles-'))
  temporaryDirectories.push(path)
  return path
}
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))))

const hash = async (path: string): Promise<string> =>
  createHash('sha256').update(await readFile(path)).digest('hex')

const PROHIBITED_CODEC_EXTENSIONS = new Set([
  'EXT_meshopt_compression',
  'EXT_texture_avif',
  'EXT_texture_webp',
  'KHR_draco_mesh_compression',
  'KHR_texture_basisu',
])

const readExtensionsUsed = async (path: string): Promise<string[]> => {
  const binary = await readFile(path)
  const jsonLength = binary.readUInt32LE(12)
  const json = JSON.parse(binary.subarray(20, 20 + jsonLength).toString('utf8')) as { extensionsUsed?: string[] }
  return json.extensionsUsed ?? []
}

describe('generated remix tiles', () => {
  it('builds 12 self-contained, bounded GLBs within the size budget', async () => {
    const outputDir = await makeOutput()
    const outputs = await buildAllTiles({ projectRoot: resolve('.'), outputDir })
    const io = new NodeIO()
    expect(outputs.map(({ id }) => id)).toEqual(REMIX_TILE_IDS)
    let totalBytes = 0
    for (const output of outputs) {
      const file = join(outputDir, `${output.id}.glb`)
      const bytes = (await stat(file)).size
      totalBytes += bytes
      expect(bytes).toBeLessThanOrEqual(900 * 1024)
      const document = await io.read(file)
      const scene = document.getRoot().listScenes()[0]!
      const root = scene.listChildren()[0]!
      const bounds = getBounds(root)
      expect((await readExtensionsUsed(file)).filter((name) => PROHIBITED_CODEC_EXTENSIONS.has(name))).toEqual([])
      expect(document.getRoot().listMeshes().length).toBeGreaterThan(0)
      expect(document.getRoot().listTextures().every((texture) => texture.getImage() !== null)).toBe(true)
      expect(bounds.min[0]).toBeGreaterThanOrEqual(-10.05)
      expect(bounds.max[0]).toBeLessThanOrEqual(30.05)
      expect(bounds.min[2]).toBeGreaterThanOrEqual(-10.05)
      expect(bounds.max[2]).toBeLessThanOrEqual(30.05)
    }
    expect(totalBytes).toBeLessThanOrEqual(6 * 1024 * 1024)
  }, 60_000)

  it('produces byte-identical files from the same inputs', async () => {
    const first = await makeOutput()
    const second = await makeOutput()
    await buildAllTiles({ projectRoot: resolve('.'), outputDir: first })
    await buildAllTiles({ projectRoot: resolve('.'), outputDir: second })
    for (const id of REMIX_TILE_IDS) {
      expect(await hash(join(first, `${id}.glb`))).toBe(await hash(join(second, `${id}.glb`)))
    }
  }, 60_000)
})
