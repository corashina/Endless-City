import { Document, NodeIO } from '@gltf-transform/core'
import { dedup, getBounds, prune, unpartition } from '@gltf-transform/functions'
import { copyFile, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { MODULE_CATALOG, MODULES_BY_ID } from './module-catalog'
import { PLOT_MAX, PLOT_MIN } from './geometry'
import { REMIX_TILE_RECIPES } from './tile-recipes'
import { validateRecipes } from './validate-recipes'
import { copyPlacedModule, SourceCache } from './source-assets'
import type { TileRecipe } from './types'

export interface ReplacementFileOperations {
  readonly rename: (from: string, to: string) => Promise<void>
}
export interface BuildOptions {
  readonly projectRoot: string
  readonly outputDir: string
  readonly fileOperations?: ReplacementFileOperations
}
export interface BuildOutput { readonly id: string; readonly path: string; readonly bytes: number }

const io = new NodeIO()

export async function validateStagedGlb(path: string, id: string): Promise<void> {
  const document = await io.read(path)
  const scene = document.getRoot().listScenes()[0]
  const root = scene?.listChildren()[0]
  if (root === undefined || document.getRoot().listMeshes().length === 0) {
    throw new Error(`${id}: generated scene has no renderable mesh`)
  }
  const bounds = getBounds(root)
  if (bounds.min[0] < PLOT_MIN || bounds.max[0] > PLOT_MAX
    || bounds.min[2] < PLOT_MIN || bounds.max[2] > PLOT_MAX) {
    throw new Error(
      `${id}: generated geometry bounds x=[${bounds.min[0].toFixed(2)}, ${bounds.max[0].toFixed(2)}], `
      + `z=[${bounds.min[2].toFixed(2)}, ${bounds.max[2].toFixed(2)}] `
      + `exceed allowed [${PLOT_MIN}, ${PLOT_MAX}] envelope`,
    )
  }
  for (const texture of document.getRoot().listTextures()) {
    if (texture.getImage() === null) throw new Error(`${id}: texture ${texture.getName()} has no embedded image`)
  }
}

export async function buildTile(
  recipe: TileRecipe,
  sources: SourceCache,
): Promise<Uint8Array> {
  const output = new Document()
  const tileRoot = output.createNode(recipe.id)
  output.createScene(recipe.id).addChild(tileRoot)
  for (let index = 0; index < recipe.placements.length; index += 1) {
    const placement = recipe.placements[index]!
    const definition = MODULES_BY_ID.get(placement.moduleId)
    if (definition === undefined) throw new Error(`${recipe.id}: unknown module ${placement.moduleId}`)
    try {
      const source = await sources.load(definition.source)
      copyPlacedModule(output, tileRoot, source, definition, placement, index)
    } catch (error) {
      throw new Error(
        `${recipe.id}: failed to extract module ${definition.id} from ${definition.source} `
        + `node ${definition.nodeName}`,
        { cause: error },
      )
    }
  }
  await output.transform(dedup(), prune({ keepExtras: true }), unpartition())
  return io.writeBinary(output)
}

const isNotFound = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException).code === 'ENOENT'

async function replaceOutputSet(
  staged: readonly BuildOutput[],
  outputDir: string,
  fileOperations: ReplacementFileOperations,
): Promise<BuildOutput[]> {
  const transactionRoot = await mkdtemp(join(outputDir, '.remix-recovery-'))
  const replacementDir = join(transactionRoot, 'replacement')
  const backupDir = join(transactionRoot, 'backup')
  const backedUp = new Set<string>()
  const installed = new Set<string>()
  let cleanupTransaction = true
  try {
    await mkdir(replacementDir)
    await mkdir(backupDir)
    for (const output of staged) {
      await copyFile(output.path, join(replacementDir, basename(output.path)))
    }
    try {
      for (const output of staged) {
        const filename = basename(output.path)
        const finalPath = join(outputDir, filename)
        try {
          await fileOperations.rename(finalPath, join(backupDir, filename))
          backedUp.add(output.id)
        } catch (error) {
          if (!isNotFound(error)) throw error
        }
      }
      for (const output of staged) {
        const filename = basename(output.path)
        const finalPath = join(outputDir, filename)
        await fileOperations.rename(join(replacementDir, filename), finalPath)
        installed.add(output.id)
      }
    } catch (replacementError) {
      const rollbackErrors: unknown[] = []
      for (const output of [...staged].reverse()) {
        const filename = basename(output.path)
        const finalPath = join(outputDir, filename)
        if (installed.has(output.id)) {
          try {
            await rm(finalPath, { force: true })
          } catch (error) {
            rollbackErrors.push(error)
          }
        }
        if (backedUp.has(output.id)) {
          try {
            await fileOperations.rename(join(backupDir, filename), finalPath)
          } catch (error) {
            rollbackErrors.push(error)
          }
        }
      }
      if (rollbackErrors.length > 0) {
        cleanupTransaction = false
        throw new AggregateError(
          [replacementError, ...rollbackErrors],
          `Tile replacement failed and rollback was incomplete; recovery files retained at ${transactionRoot}`,
        )
      }
      throw replacementError
    }
    return staged.map((output) => ({
      ...output,
      path: join(outputDir, basename(output.path)),
    }))
  } finally {
    if (cleanupTransaction) await rm(transactionRoot, { recursive: true, force: true })
  }
}

export async function buildAllTiles(options: BuildOptions): Promise<BuildOutput[]> {
  validateRecipes(REMIX_TILE_RECIPES, MODULE_CATALOG)
  await mkdir(options.outputDir, { recursive: true })
  const temporary = await mkdtemp(join(tmpdir(), 'endless-city-remix-'))
  const sources = new SourceCache(options.projectRoot)
  try {
    const staged: BuildOutput[] = []
    for (const recipe of REMIX_TILE_RECIPES) {
      const binary = await buildTile(recipe, sources)
      const stagedPath = join(temporary, `${recipe.id}.glb`)
      await writeFile(stagedPath, binary)
      await validateStagedGlb(stagedPath, recipe.id)
      staged.push({ id: recipe.id, path: stagedPath, bytes: binary.byteLength })
    }
    const totalBytes = staged.reduce((sum, output) => sum + output.bytes, 0)
    if (totalBytes > 6 * 1024 * 1024) throw new Error(`Generated tiles exceed 6 MiB: ${totalBytes} bytes`)
    for (const output of staged) {
      if (output.bytes > 900 * 1024) throw new Error(`${output.id} exceeds 900 KiB: ${output.bytes} bytes`)
    }
    return await replaceOutputSet(staged, options.outputDir, options.fileOperations ?? { rename })
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  const projectRoot = resolve('.')
  const outputs = await buildAllTiles({ projectRoot, outputDir: resolve('js', 'clusters') })
  for (const output of outputs) console.log(`${output.id}: ${output.bytes} bytes`)
}

const invokedPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href
if (invokedPath === import.meta.url) await main()
