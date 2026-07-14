import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { chooseQualityProfile } from '../../src/rendering/quality'
import {
  configureSceneRenderer,
  createSceneGraph,
  resizeSceneViewport,
  type SceneGraph,
  type SceneRendererAdapter,
  type SceneViewport,
  type ViewportRendererAdapter,
} from '../../src/rendering/scene'
import { REMIX_TILE_RECIPES } from './tile-recipes'

export interface GalleryItem { readonly id: string; readonly label: string; readonly url: string }
export const galleryItems = (): GalleryItem[] => REMIX_TILE_RECIPES.map(({ id }) => ({
  id,
  label: id.replace(/^remix-/, '').replaceAll('-', ' '),
  url: `/clusters/${id}.glb`,
}))

export function createGalleryScene(
  renderer: SceneRendererAdapter & ViewportRendererAdapter,
  viewport: SceneViewport,
  qualityWidth: number,
): SceneGraph {
  const profile = chooseQualityProfile({
    width: qualityWidth,
    devicePixelRatio: viewport.devicePixelRatio,
  })
  const graph = createSceneGraph(profile, viewport.width / viewport.height)
  configureSceneRenderer(renderer)
  resizeSceneViewport(renderer, graph.camera, profile, viewport)

  const target = new THREE.Vector3(10, 0, 10)
  const distance = 110
  const horizontal = distance * Math.sin(Math.PI / 5)
  graph.camera.position.set(
    target.x + horizontal / Math.sqrt(2),
    distance * Math.cos(Math.PI / 5),
    target.z + horizontal / Math.sqrt(2),
  )
  graph.camera.lookAt(target)
  graph.directionalLight.target.position.copy(target)
  return graph
}

interface GalleryCard {
  readonly item: GalleryItem
  readonly card: HTMLElement
  readonly canvas: HTMLCanvasElement
}

function createCard(item: GalleryItem, host: HTMLElement): GalleryCard {
  const card = document.createElement('article')
  const label = document.createElement('h2')
  const canvas = document.createElement('canvas')
  label.textContent = item.label
  canvas.width = 360
  canvas.height = 270
  card.append(label, canvas)
  host.append(card)
  return { item, card, canvas }
}

function showError(card: HTMLElement, error: unknown): void {
  card.dataset.state = 'error'
  const message = document.createElement('p')
  message.textContent = error instanceof Error ? error.message : String(error)
  card.append(message)
}

function disposeSceneResources(scene: THREE.Scene): void {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()

  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material)
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value)
      }
    }
  })

  for (const texture of textures) texture.dispose()
  for (const material of materials) material.dispose()
  for (const geometry of geometries) geometry.dispose()
}

async function renderItem(
  entry: GalleryCard,
  renderer: THREE.WebGLRenderer,
  loader: GLTFLoader,
): Promise<void> {
  let scene: THREE.Scene | undefined

  try {
    const graph = createGalleryScene(renderer, {
      width: 360,
      height: 270,
      devicePixelRatio: window.devicePixelRatio,
    }, window.innerWidth)
    scene = graph.scene
    const gltf = await loader.loadAsync(entry.item.url)
    gltf.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
    scene.add(gltf.scene)
    renderer.render(scene, graph.camera)

    entry.canvas.width = renderer.domElement.width
    entry.canvas.height = renderer.domElement.height
    const context = entry.canvas.getContext('2d')
    if (context === null) throw new Error('Unable to create gallery canvas context')
    context.drawImage(renderer.domElement, 0, 0)
  } catch (error) {
    showError(entry.card, error)
  } finally {
    if (scene !== undefined) disposeSceneResources(scene)
  }
}

async function main(): Promise<void> {
  const host = document.querySelector<HTMLElement>('#gallery')
  if (host === null) throw new Error('Missing #gallery')
  const cards = galleryItems().map((item) => createCard(item, host))
  const renderCanvas = document.createElement('canvas')
  let renderer: THREE.WebGLRenderer

  try {
    renderer = new THREE.WebGLRenderer({ canvas: renderCanvas, antialias: true })
  } catch (error) {
    for (const { card } of cards) showError(card, error)
    return
  }

  const loader = new GLTFLoader()
  try {
    for (const card of cards) await renderItem(card, renderer, loader)
  } finally {
    renderer.dispose()
  }
}

if (typeof document !== 'undefined') void main()
