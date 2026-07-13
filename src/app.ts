import * as THREE from 'three'
import { CameraController } from './camera/controller'
import type { GridCoordinate } from './city/types'
import {
  BLOCK_SIZE,
  FIXED_STEP_SECONDS,
  MAX_FRAME_SECONDS,
  WORLD_SEED,
} from './config'
import { CityView } from './rendering/city-view'
import { loadAssetCatalog } from './rendering/assets'
import { chooseQualityProfile } from './rendering/quality'
import { createScene } from './rendering/scene'
import { TrafficView } from './rendering/traffic-view'
import { consumeFixedSteps } from './traffic/following'
import { TrafficSimulation } from './traffic/simulation'
import type { TrafficConfig } from './traffic/types'

const TRAFFIC_CONFIG = Object.freeze({
  minimumGap: 3,
  timeHeadway: 1,
  maximumAcceleration: 2,
  comfortableBraking: 4,
  intersectionHalfExtent: 5,
  reservationLookAhead: 20,
  protectedRadius: 120,
  simulationRadius: 220,
} satisfies TrafficConfig)

export interface AppElements {
  readonly canvas: HTMLCanvasElement
  readonly loading?: HTMLElement | null
  readonly loadingProgress?: HTMLElement | null
}

const centerGridCell = (x: number, z: number): GridCoordinate => ({
  x: Math.round(x / BLOCK_SIZE),
  z: Math.round(z / BLOCK_SIZE),
})

export async function startApp(elements: AppElements): Promise<void> {
  elements.canvas.style.width = '100vw'
  elements.canvas.style.height = '100vh'
  elements.canvas.style.display = 'block'

  const profile = chooseQualityProfile({
    width: window.innerWidth,
    devicePixelRatio: window.devicePixelRatio,
  })
  const context = createScene(elements.canvas, profile)
  const assets = await loadAssetCatalog(({ loaded, total }) => {
    if (elements.loadingProgress !== null && elements.loadingProgress !== undefined) {
      elements.loadingProgress.textContent = `${loaded} / ${total}`
    }
  })
  const cityView = new CityView(context.scene, assets, profile)
  const traffic = new TrafficSimulation({
    count: profile.trafficCount,
    seed: WORLD_SEED,
    camera: { x: context.camera.position.x, z: context.camera.position.z },
    prototypes: assets.vehicleMetadata,
    config: TRAFFIC_CONFIG,
  })
  const trafficView = new TrafficView(context.scene, assets, traffic.vehicles)
  const cameraController = new CameraController(context.camera, context.controls)

  elements.loading?.remove()

  const shadowOffset = context.directionalLight.position.clone()
    .sub(context.directionalLight.target.position)
  let accumulator = 0
  let previousTimestamp: number | undefined

  const resize = (): void => {
    context.resize({
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    })
  }
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) previousTimestamp = undefined
  })

  const frame = (timestamp: number): void => {
    requestAnimationFrame(frame)

    if (document.hidden) {
      previousTimestamp = undefined
      return
    }

    const cameraState = cameraController.update()
    cityView.update(
      centerGridCell(cameraState.logicalCamera.x, cameraState.logicalCamera.z),
      cameraState.origin,
    )

    const frameSeconds = previousTimestamp === undefined
      ? 0
      : (timestamp - previousTimestamp) / 1_000
    previousTimestamp = timestamp
    const stepResult = consumeFixedSteps(
      accumulator,
      frameSeconds,
      FIXED_STEP_SECONDS,
      MAX_FRAME_SECONDS,
      () => traffic.step(FIXED_STEP_SECONDS, cameraState.logicalCamera),
    )
    accumulator = stepResult.accumulator
    trafficView.sync(traffic.vehicles, cameraState.origin, stepResult.alpha)

    const shadowTarget = new THREE.Vector3(
      context.controls.target.x,
      0,
      context.controls.target.z,
    )
    context.directionalLight.target.position.copy(shadowTarget)
    context.directionalLight.position.copy(shadowTarget).add(shadowOffset)
    context.renderer.render(context.scene, context.camera)
  }

  requestAnimationFrame(frame)
}
