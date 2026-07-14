import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
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

const seedPreviousOutputs = async (outputDir: string): Promise<Map<string, string>> => {
  const previousHashes = new Map<string, string>()
  for (const id of REMIX_TILE_IDS) {
    const path = join(outputDir, `${id}.glb`)
    await writeFile(path, `previous-${id}`)
    previousHashes.set(id, await hash(path))
  }
  return previousHashes
}

const PROHIBITED_CODEC_EXTENSIONS = new Set([
  'EXT_meshopt_compression',
  'EXT_texture_avif',
  'EXT_texture_webp',
  'KHR_draco_mesh_compression',
  'KHR_texture_basisu',
])

interface RawGlbJson {
  readonly extensionsUsed?: string[]
  readonly buffers?: readonly { readonly uri?: string }[]
  readonly images?: readonly { readonly uri?: string }[]
}

const readGlbJson = async (path: string): Promise<RawGlbJson> => {
  const binary = await readFile(path)
  const jsonLength = binary.readUInt32LE(12)
  return JSON.parse(binary.subarray(20, 20 + jsonLength).toString('utf8')) as RawGlbJson
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
      const raw = await readGlbJson(file)
      expect((raw.extensionsUsed ?? []).filter((name) => PROHIBITED_CODEC_EXTENSIONS.has(name))).toEqual([])
      expect(raw.buffers?.length).toBeGreaterThan(0)
      expect(raw.images?.length).toBeGreaterThan(0)
      for (const buffer of raw.buffers ?? []) expect(buffer).not.toHaveProperty('uri')
      for (const image of raw.images ?? []) expect(image).not.toHaveProperty('uri')
      expect(document.getRoot().listMeshes().length).toBeGreaterThan(0)
      expect(document.getRoot().listTextures().every((texture) => texture.getImage() !== null)).toBe(true)
      expect(bounds.min[0]).toBeGreaterThanOrEqual(-10)
      expect(bounds.max[0]).toBeLessThanOrEqual(30)
      expect(bounds.min[2]).toBeGreaterThanOrEqual(-10)
      expect(bounds.max[2]).toBeLessThanOrEqual(30)
    }
    expect(totalBytes).toBeLessThanOrEqual(6 * 1024 * 1024)
    expect((await readdir(outputDir)).sort()).toEqual(REMIX_TILE_IDS.map((id) => `${id}.glb`).sort())
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

  it('restores the complete prior output set when replacement fails', async () => {
    const outputDir = await makeOutput()
    const previousHashes = await seedPreviousOutputs(outputDir)

    let failureInjected = false
    await expect(buildAllTiles({
      projectRoot: resolve('.'),
      outputDir,
      fileOperations: {
        rename: async (from, to) => {
          if (!failureInjected
            && from.includes('replacement')
            && to.endsWith('remix-commercial-market.glb')) {
            failureInjected = true
            throw new Error('injected replacement failure')
          }
          await rename(from, to)
        },
      },
    })).rejects.toThrow('injected replacement failure')

    expect(failureInjected).toBe(true)
    for (const id of REMIX_TILE_IDS) {
      expect(await hash(join(outputDir, `${id}.glb`))).toBe(previousHashes.get(id))
    }
    expect((await readdir(outputDir)).sort()).toEqual(REMIX_TILE_IDS.map((id) => `${id}.glb`).sort())
  }, 60_000)

  it('retains recovery backups and continues restoring after a rollback failure', async () => {
    const outputDir = await makeOutput()
    const previousHashes = await seedPreviousOutputs(outputDir)
    const unrestoredId = 'remix-residential-row'
    let replacementFailureInjected = false
    let rollbackFailureInjected = false
    let caught: unknown

    try {
      await buildAllTiles({
        projectRoot: resolve('.'),
        outputDir,
        fileOperations: {
          rename: async (from, to) => {
            if (!replacementFailureInjected
              && from.includes('replacement')
              && to.endsWith('remix-commercial-market.glb')) {
              replacementFailureInjected = true
              throw new Error('injected replacement failure')
            }
            if (!rollbackFailureInjected
              && from.includes('backup')
              && to.endsWith(`${unrestoredId}.glb`)) {
              rollbackFailureInjected = true
              throw new Error('injected rollback failure')
            }
            await rename(from, to)
          },
        },
      })
    } catch (error) {
      caught = error
    }

    expect(replacementFailureInjected).toBe(true)
    expect(rollbackFailureInjected).toBe(true)
    expect(caught).toBeInstanceOf(AggregateError)
    const aggregate = caught as AggregateError
    expect(aggregate.errors.map((error) => (error as Error).message)).toEqual([
      'injected replacement failure',
      'injected rollback failure',
    ])

    for (const id of REMIX_TILE_IDS) {
      if (id !== unrestoredId) expect(await hash(join(outputDir, `${id}.glb`))).toBe(previousHashes.get(id))
    }
    await expect(stat(join(outputDir, `${unrestoredId}.glb`))).rejects.toMatchObject({ code: 'ENOENT' })

    const entries = await readdir(outputDir, { withFileTypes: true })
    const recovery = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith('.remix-recovery-'))
    expect(recovery).toHaveLength(1)
    expect(aggregate.message).toContain(recovery[0]!.name)
    const backupDir = join(outputDir, recovery[0]!.name, 'backup')
    expect(await hash(join(backupDir, `${unrestoredId}.glb`))).toBe(previousHashes.get(unrestoredId))
    expect(await readdir(backupDir)).toEqual([`${unrestoredId}.glb`])
  }, 60_000)
})
