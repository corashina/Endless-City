import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { REMIX_TILE_RECIPES } from './tile-recipes'

export interface GalleryItem { readonly id: string; readonly label: string; readonly url: string }
export const galleryItems = (): GalleryItem[] => REMIX_TILE_RECIPES.map(({ id }) => ({
  id,
  label: id.replace(/^remix-/, '').replaceAll('-', ' '),
  url: `/clusters/${id}.glb`,
}))

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
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.setSize(canvas.width, canvas.height, false)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)
    const camera = new THREE.PerspectiveCamera(40, canvas.width / canvas.height, 1, 500)
    const target = new THREE.Vector3(10, 0, 10)
    const distance = 110
    const horizontal = distance * Math.sin(Math.PI / 5)
    camera.position.set(
      target.x + horizontal / Math.sqrt(2),
      distance * Math.cos(Math.PI / 5),
      target.z + horizontal / Math.sqrt(2),
    )
    camera.lookAt(target)
    const sun = new THREE.DirectionalLight(0x9a9a9a, 1)
    sun.position.set(-100, 250, -100)
    sun.castShadow = true
    scene.add(sun, new THREE.HemisphereLight(0xefefef, 0xffffff, 1))
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
