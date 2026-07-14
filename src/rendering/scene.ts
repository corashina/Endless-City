import * as THREE from 'three'
import { MapControls } from 'three/addons/controls/MapControls.js'
import { FOG_FAR, FOG_NEAR } from '../config'
import type { QualityProfile } from './quality'

const SHADOW_RADIUS = 180

export const LOCKED_CAMERA_POLAR_ANGLE = Math.PI / 5
export const LOCKED_CAMERA_AZIMUTH_ANGLE = Math.PI / 4

export type LockedCameraControls = Pick<
  MapControls,
  | 'minPolarAngle'
  | 'maxPolarAngle'
  | 'minAzimuthAngle'
  | 'maxAzimuthAngle'
  | 'minDistance'
  | 'maxDistance'
  | 'enableRotate'
  | 'enablePan'
  | 'enableZoom'
  | 'enableDamping'
  | 'dampingFactor'
  | 'touches'
  | 'update'
>

export function configureLockedLegacyCamera(controls: LockedCameraControls): void {
  controls.minPolarAngle = LOCKED_CAMERA_POLAR_ANGLE
  controls.maxPolarAngle = LOCKED_CAMERA_POLAR_ANGLE
  controls.minAzimuthAngle = LOCKED_CAMERA_AZIMUTH_ANGLE
  controls.maxAzimuthAngle = LOCKED_CAMERA_AZIMUTH_ANGLE
  controls.minDistance = 100
  controls.maxDistance = 125
  controls.enableRotate = false
  controls.enablePan = true
  controls.enableZoom = true
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.touches.ONE = THREE.TOUCH.PAN
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN
  controls.update()
}

export interface SceneGraph {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly directionalLight: THREE.DirectionalLight
  readonly hemisphereLight: THREE.HemisphereLight
}

export interface SceneViewport {
  readonly width: number
  readonly height: number
  readonly devicePixelRatio: number
}

export interface ViewportRendererAdapter {
  setPixelRatio(value: number): void
  setSize(width: number, height: number, updateStyle?: boolean): void
}

export interface ViewportCameraAdapter {
  aspect: number
  updateProjectionMatrix(): void
}

export interface DisposableSceneResource {
  dispose(): void
}

export interface ShadowMapAdapter {
  enabled: boolean
  type: number
}

export function configureSoftShadows(shadowMap: ShadowMapAdapter): void {
  shadowMap.enabled = true
  shadowMap.type = THREE.PCFSoftShadowMap
}

export interface SceneContext extends SceneGraph {
  readonly renderer: THREE.WebGLRenderer
  readonly controls: MapControls
  resize(viewport: SceneViewport): void
  dispose(): void
}

export function resizeSceneViewport(
  renderer: ViewportRendererAdapter,
  camera: ViewportCameraAdapter,
  profile: QualityProfile,
  viewport: SceneViewport,
): void {
  renderer.setPixelRatio(Math.min(viewport.devicePixelRatio || 1, profile.maxPixelRatio))
  renderer.setSize(viewport.width, viewport.height, false)
  camera.aspect = viewport.width / viewport.height
  camera.updateProjectionMatrix()
}

export function disposeSceneResources(
  controls: DisposableSceneResource,
  renderer: DisposableSceneResource,
): void {
  controls.dispose()
  renderer.dispose()
}

export function createSceneGraph(profile: QualityProfile, aspect: number): SceneGraph {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xd7e5ee)
  scene.fog = new THREE.Fog(0xd7e5ee, FOG_NEAR, FOG_FAR)

  const camera = new THREE.PerspectiveCamera(40, aspect, 1, 500)
  camera.position.set(10, 100, 10)

  const directionalLight = new THREE.DirectionalLight(0xfff1cf, 1.6)
  directionalLight.position.set(-300, 750, -300)
  directionalLight.castShadow = true
  directionalLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize)
  directionalLight.shadow.camera.near = 1
  directionalLight.shadow.camera.far = 1_000
  directionalLight.shadow.camera.left = -SHADOW_RADIUS
  directionalLight.shadow.camera.right = SHADOW_RADIUS
  directionalLight.shadow.camera.top = SHADOW_RADIUS
  directionalLight.shadow.camera.bottom = -SHADOW_RADIUS
  directionalLight.shadow.camera.updateProjectionMatrix()

  const hemisphereLight = new THREE.HemisphereLight(0xe7f2ff, 0xb9aa8f, 1.25)
  scene.add(directionalLight, directionalLight.target, hemisphereLight)

  return { scene, camera, directionalLight, hemisphereLight }
}

export function createScene(canvas: HTMLCanvasElement, profile: QualityProfile): SceneContext {
  const width = canvas.clientWidth || canvas.width || window.innerWidth || 1
  const height = canvas.clientHeight || canvas.height || window.innerHeight || 1
  const graph = createSceneGraph(profile, width / height)
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  configureSoftShadows(renderer.shadowMap)
  resizeSceneViewport(renderer, graph.camera, profile, {
    width,
    height,
    devicePixelRatio: window.devicePixelRatio,
  })

  const controls = new MapControls(graph.camera, canvas)
  configureLockedLegacyCamera(controls)

  return {
    ...graph,
    renderer,
    controls,
    resize(viewport) {
      resizeSceneViewport(renderer, graph.camera, profile, viewport)
    },
    dispose() {
      disposeSceneResources(controls, renderer)
    },
  }
}
