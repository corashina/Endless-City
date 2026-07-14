import { type Document, type mat4, type Node, NodeIO } from '@gltf-transform/core'
import { copyToDocument, getBounds } from '@gltf-transform/functions'
import * as THREE from 'three'
import { resolve } from 'node:path'
import type { Footprint, ModuleDefinition, Placement } from './types'

const FOOTPRINT_TOLERANCE = 0.05

export class SourceCache {
  private readonly io = new NodeIO()
  private readonly documents = new Map<string, Promise<Document>>()

  constructor(private readonly projectRoot: string) {}

  load(filename: string): Promise<Document> {
    const existing = this.documents.get(filename)
    if (existing !== undefined) return existing
    const loaded = this.io.read(resolve(this.projectRoot, 'js', 'gltf', filename))
    this.documents.set(filename, loaded)
    return loaded
  }
}

export function findExactNode(document: Document, definition: ModuleDefinition): Node {
  const matches = document.getRoot().listNodes()
    .filter((node) => node.getName() === definition.nodeName)
  if (matches.length !== 1) {
    throw new Error(`${definition.source}: expected one node named ${definition.nodeName}, found ${matches.length}`)
  }
  return matches[0]!
}

export function measureModuleFootprint(node: Node): Footprint {
  const bounds = getBounds(node)
  return { width: bounds.max[0] - bounds.min[0], depth: bounds.max[2] - bounds.min[2] }
}

export function assertDeclaredFootprint(node: Node, definition: ModuleDefinition): void {
  const measured = measureModuleFootprint(node)
  if (measured.width > definition.footprint.width + FOOTPRINT_TOLERANCE
    || measured.depth > definition.footprint.depth + FOOTPRINT_TOLERANCE) {
    throw new Error(
      `${definition.id}: measured ${measured.width.toFixed(2)}x${measured.depth.toFixed(2)} exceeds declared ${definition.footprint.width.toFixed(2)}x${definition.footprint.depth.toFixed(2)}`,
    )
  }
}

export function copyPlacedModule(
  output: Document,
  tileRoot: Node,
  source: Document,
  definition: ModuleDefinition,
  placement: Placement,
  index: number,
): Node {
  const sourceNode = findExactNode(source, definition)
  assertDeclaredFootprint(sourceNode, definition)
  const propertyMap = copyToDocument(output, source, [sourceNode])
  const copiedNode = propertyMap.get(sourceNode) as Node | undefined
  if (copiedNode === undefined) throw new Error(`${definition.id}: copy did not return a node`)

  const bounds = getBounds(sourceNode)
  const anchor = new THREE.Vector3(
    (bounds.min[0] + bounds.max[0]) / 2,
    bounds.min[1],
    (bounds.min[2] + bounds.max[2]) / 2,
  )
  const localMatrix = new THREE.Matrix4()
    .makeTranslation(-anchor.x, -anchor.y, -anchor.z)
    .multiply(new THREE.Matrix4().fromArray(sourceNode.getWorldMatrix()))
  copiedNode.setMatrix(localMatrix.toArray() as mat4)

  const halfTurnComponent = Math.SQRT1_2
  const rotations: [number, number, number, number][] = [
    [0, 0, 0, 1],
    [0, halfTurnComponent, 0, halfTurnComponent],
    [0, 1, 0, 0],
    [0, halfTurnComponent, 0, -halfTurnComponent],
  ]
  const placementNode = output.createNode(`${definition.id}-${index}`)
    .setTranslation([placement.x, 0, placement.z])
    .setRotation(rotations[placement.rotation]!)
    .addChild(copiedNode)
  tileRoot.addChild(placementNode)
  return placementNode
}
