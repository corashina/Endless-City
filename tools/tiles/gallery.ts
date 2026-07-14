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

async function renderItem(item: GalleryItem, host: HTMLElement): Promise<void> {
  const card = document.createElement('article')
  const label = document.createElement('h2')
  const canvas = document.createElement('canvas')
  label.textContent = item.label
  canvas.width = 360
  canvas.height = 270
  card.append(label, canvas)
  host.append(card)

  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    const { scene, camera } = createGalleryScene(renderer, {
      width: canvas.width,
      height: canvas.height,
      devicePixelRatio: window.devicePixelRatio,
    }, window.innerWidth)
    const gltf = await new GLTFLoader().loadAsync(item.url)
    gltf.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
    scene.add(gltf.scene)
    renderer.render(scene, camera)
  } catch (error) {
    card.dataset.state = 'error'
    const message = document.createElement('p')
    message.textContent = error instanceof Error ? error.message : String(error)
    card.append(message)
  }
}

async function main(): Promise<void> {
  const host = document.querySelector<HTMLElement>('#gallery')
  if (host === null) throw new Error('Missing #gallery')
  await Promise.all(galleryItems().map((item) => renderItem(item, host)))
}

if (typeof document !== 'undefined') void main()
