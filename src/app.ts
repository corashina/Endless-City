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
import { loadAssetCatalog as loadAssets } from './rendering/assets'
import { chooseQualityProfile } from './rendering/quality'
import { createScene as createSceneContext } from './rendering/scene'
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
  readonly onError?: (error: unknown) => void
}

export interface AppHandle {
  dispose(): void
}

interface AppEventTarget {
  addEventListener(type: string, listener: EventListener): void
  removeEventListener(type: string, listener: EventListener): void
}

export interface OwnedLoopInput {
  readonly windowTarget: AppEventTarget
  readonly documentTarget: AppEventTarget
  readonly requestAnimationFrame: (callback: FrameRequestCallback) => number
  readonly cancelAnimationFrame: (handle: number) => void
  readonly onResize: () => void
  readonly onVisibilityChange: () => void
  readonly runFrame: (timestamp: number) => void
  readonly disposeScene: () => void
  readonly onError: (error: unknown) => void
}

export interface StartAppDependencies {
  readonly createScene: typeof createSceneContext
  readonly loadAssetCatalog: typeof loadAssets
}

const centerGridCell = (x: number, z: number): GridCoordinate => ({
  x: Math.round(x / BLOCK_SIZE),
  z: Math.round(z / BLOCK_SIZE),
})

export function startOwnedLoop(input: OwnedLoopInput): AppHandle {
  let disposed = false
  let frameHandle: number | undefined

  const resizeListener: EventListener = () => input.onResize()
  const visibilityListener: EventListener = () => input.onVisibilityChange()
  const pageHideListener: EventListener = () => handle.dispose()

  const handle: AppHandle = {
    dispose() {
      if (disposed) return
      disposed = true

      if (frameHandle !== undefined) {
        input.cancelAnimationFrame(frameHandle)
        frameHandle = undefined
      }
      input.windowTarget.removeEventListener('resize', resizeListener)
      input.documentTarget.removeEventListener('visibilitychange', visibilityListener)
      input.windowTarget.removeEventListener('pagehide', pageHideListener)
      input.disposeScene()
    },
  }

  const frame: FrameRequestCallback = (timestamp) => {
    frameHandle = undefined
    if (disposed) return

    try {
      input.runFrame(timestamp)
    } catch (error) {
      handle.dispose()
      input.onError(error)
      return
    }

    if (!disposed) frameHandle = input.requestAnimationFrame(frame)
  }

  try {
    input.windowTarget.addEventListener('resize', resizeListener)
    input.documentTarget.addEventListener('visibilitychange', visibilityListener)
    input.windowTarget.addEventListener('pagehide', pageHideListener)
    frameHandle = input.requestAnimationFrame(frame)
  } catch (error) {
    handle.dispose()
    throw error
  }

  return handle
}

export async function startApp(
  elements: AppElements,
  dependencies: Partial<StartAppDependencies> = {},
): Promise<AppHandle> {
  elements.canvas.style.width = '100vw'
  elements.canvas.style.height = '100vh'
  elements.canvas.style.display = 'block'

  const profile = chooseQualityProfile({
    width: window.innerWidth,
    devicePixelRatio: window.devicePixelRatio,
  })
  const context = (dependencies.createScene ?? createSceneContext)(elements.canvas, profile)
  let contextDisposed = false
  const disposeContext = (): void => {
    if (contextDisposed) return
    contextDisposed = true
    context.dispose()
  }
  let handle: AppHandle | undefined

  try {
    const assets = await (dependencies.loadAssetCatalog ?? loadAssets)(({ loaded, total }) => {
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
    const visibilityChange = (): void => {
      if (document.hidden) previousTimestamp = undefined
    }
    const frame = (timestamp: number): void => {
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

    handle = startOwnedLoop({
      windowTarget: window,
      documentTarget: document,
      requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
      cancelAnimationFrame: (frameId) => window.cancelAnimationFrame(frameId),
      onResize: resize,
      onVisibilityChange: visibilityChange,
      runFrame: frame,
      disposeScene: disposeContext,
      onError: elements.onError ?? ((error) => console.error(error)),
    })
    elements.loading?.remove()

    return handle
  } catch (error) {
    if (handle === undefined) disposeContext()
    else handle.dispose()
    throw error
  }
}
